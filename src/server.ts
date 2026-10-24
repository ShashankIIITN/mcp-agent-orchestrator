import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './config/loader.js';
import { SqliteStorageAdapter } from './storage/sqlite-adapter.js';
import { createLogger } from './utils/logger.js';
import { ProviderRegistry } from './inference/provider-registry.js';
import { BuiltinToolRegistry } from './builtin-tools/tool-registry.js';
import { McpClientManager } from './mcp-bridge/mcp-client-manager.js';
import { Dispatcher } from './orchestrator/dispatcher.js';
import { registerSwarmTools } from './tools/swarm-tools.js';
import { registerPipelineTools } from './tools/pipeline-tools.js';
import { registerInteractiveTools } from './tools/interactive-tools.js';
import { registerSessionMeshTools } from './tools/session-mesh-tools.js';
import { SessionManager } from './sessions/session-manager.js';
import { DashboardServer } from './dashboard/server.js';
import { dirname, resolve, isAbsolute } from 'node:path';
import { expandHome } from './utils/path-utils.js';
import { VERSION } from './version.js';
import type { OrchestratorConfig } from './config/schema.js';

const logger = createLogger('orchestrator-server');

export class OrchestratorServer {
  private mcpServer: McpServer;
  private storage: SqliteStorageAdapter;
  private config: OrchestratorConfig;
  private providerRegistry: ProviderRegistry;
  private toolRegistry: BuiltinToolRegistry;
  private mcpClientManager: McpClientManager;
  private dispatcher: Dispatcher;
  private sessionManager: SessionManager;
  private dashboardServer: DashboardServer;

  constructor(configPath?: string) {
    this.config = loadConfig(configPath);
    const basePath = configPath ? dirname(resolve(configPath)) : process.cwd();
    const connectionString = expandHome(this.config.server.storage.connection_string);
    const dbPath = isAbsolute(connectionString)
      ? connectionString
      : resolve(basePath, connectionString);
    this.storage = new SqliteStorageAdapter(dbPath);

    this.providerRegistry = new ProviderRegistry();
    this.providerRegistry.initFromConfig(this.config.inference);

    this.toolRegistry = new BuiltinToolRegistry();
    this.mcpClientManager = new McpClientManager();

    this.dispatcher = new Dispatcher(
      this.config,
      this.storage,
      this.providerRegistry,
      this.toolRegistry,
    );

    this.sessionManager = new SessionManager(
      this.storage,
      this.providerRegistry,
      this.toolRegistry,
      this.config,
    );

    this.dashboardServer = new DashboardServer(
      this.config.server.port,
      this.storage,
      this.config,
      this.dispatcher.getAgentPool(),
      this.sessionManager,
    );

    this.mcpServer = new McpServer({
      name: 'mcp-agent-orchestrator',
      version: VERSION,
    });

    this.registerTools();
  }

  // ── Tool Registration ──────────────────────────────────────────

  private registerTools(): void {
    this.registerGetTaskStatus();
    this.registerListJobs();
    this.registerApproveCheckpoint();
    this.registerGetConfig();

    registerSwarmTools(this.mcpServer, this.dispatcher);
    registerPipelineTools(this.mcpServer, this.dispatcher);
    registerInteractiveTools(this.mcpServer, this.dispatcher, this.storage);
    registerSessionMeshTools(this.mcpServer, this.sessionManager);

    logger.info('Registered all MCP tools (Phase 1 Status, Phase 3 Swarm/Pipeline/Interactive, Phase 5 Session Mesh)');
  }

  private registerGetTaskStatus(): void {
    this.mcpServer.tool(
      'get_task_status',
      'Get the current status of a running task/job including progress, current step, and output.',
      {
        job_id: z.string().describe('The job ID to check status for'),
        include_logs: z.boolean().optional().describe('Whether to include agent conversation logs'),
      },
      async ({ job_id, include_logs }) => {
        const job = await this.storage.getJob(job_id);
        if (!job) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Job not found', job_id }) }],
          };
        }

        const result: Record<string, unknown> = {
          job_id: job.id,
          status: job.status,
          progress_percent: job.progress,
          current_step: job.current_step,
          output: job.output,
          mode: job.mode,
          created_at: job.created_at,
          updated_at: job.updated_at,
        };

        const pendingCheckpoints = await this.storage.getPendingCheckpoints(job_id);
        if (pendingCheckpoints.length > 0) {
          result.pending_approvals = pendingCheckpoints.map((cp) => ({
            checkpoint_id: cp.id,
            stage_name: cp.stage_name,
            action_description: cp.action_description,
          }));
        }

        if (include_logs) {
          result.logs = await this.storage.getAgentTranscript(job_id);
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      },
    );
  }

  private registerListJobs(): void {
    this.mcpServer.tool(
      'list_jobs',
      'List all orchestrator jobs with their current statuses.',
      {
        limit: z.number().optional().default(20).describe('Maximum number of jobs to return'),
      },
      async ({ limit }) => {
        const jobs = await this.storage.listJobs(limit);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ jobs }, null, 2) }],
        };
      },
    );
  }

  private registerApproveCheckpoint(): void {
    this.mcpServer.tool(
      'approve_checkpoint',
      'Approve or reject a pending checkpoint in a pipeline execution.',
      {
        job_id: z.string().describe('The job ID containing the checkpoint'),
        checkpoint_id: z.string().describe('The checkpoint ID to approve or reject'),
        decision: z.enum(['approve', 'reject']).describe('Whether to approve or reject'),
        feedback: z.string().optional().describe('Optional feedback for the decision'),
      },
      async ({ job_id, checkpoint_id, decision, feedback }) => {
        const checkpoint = await this.storage.getCheckpoint(checkpoint_id);
        if (!checkpoint || checkpoint.job_id !== job_id) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ error: 'Checkpoint not found' }) },
            ],
          };
        }

        await this.storage.resolveCheckpoint(checkpoint_id, decision, feedback);
        const job = await this.storage.getJob(job_id);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                checkpoint_id,
                decision,
                new_status: job?.status ?? 'unknown',
              }),
            },
          ],
        };
      },
    );
  }

  private registerGetConfig(): void {
    this.mcpServer.tool(
      'get_config',
      'Get the current orchestrator configuration (sanitized, no API keys).',
      {},
      async () => {
        // Deep-clone and redact API key env var names
        const sanitized = structuredClone(this.config);
        for (const provider of Object.values(sanitized.inference.providers)) {
          if (provider.api_key_env) {
            provider.api_key_env = '***';
          }
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(sanitized, null, 2) }],
        };
      },
    );
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  /**
   * Expose tools discovered on external MCP gateways to subagents.
   * Names are sanitized to `mcp__<server>__<tool>` because LLM function-calling
   * APIs only accept [a-zA-Z0-9_-] in tool names.
   */
  private registerGatewayTools(): void {
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
    let count = 0;

    for (const remote of this.mcpClientManager.getAllTools()) {
      const name = `mcp__${sanitize(remote.serverName)}__${sanitize(remote.originalName)}`.slice(0, 64);
      this.toolRegistry.register({
        name,
        description: `[${remote.serverName}] ${remote.description}`,
        parameters: remote.inputSchema,
        execute: async (args, context) => {
          if (context.safety_mode === 'safe') {
            return { success: false, output: '', error: 'Blocked: external MCP tools are not allowed in safe mode.' };
          }
          const result = await this.mcpClientManager.callTool(remote.qualifiedName, args);
          return {
            success: result.success && !result.isError,
            output: result.content,
            error: result.success && !result.isError ? undefined : result.content,
          };
        },
      });
      count++;
    }

    if (count > 0) logger.info({ count }, 'Registered external MCP gateway tools for subagents');
  }


  async start(): Promise<void> {
    await this.storage.init();
    logger.info('Storage initialized');

    if (Object.keys(this.config.mcp_gateways).length > 0) {
      logger.info('Connecting to configured external MCP gateways...');
      await this.mcpClientManager.connectAll(this.config.mcp_gateways);
      this.registerGatewayTools();
    }

    try {
      await this.dashboardServer.start();
    } catch (err) {
      logger.warn({ error: err }, 'Dashboard server failed to start, continuing MCP stdio server');
    }

    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
    logger.info('MCP Agent Orchestrator server started on stdio transport');
  }

  async shutdown(): Promise<void> {
    await this.dashboardServer.stop();
    await this.mcpClientManager.disconnectAll();
    await this.storage.close();
    logger.info('Server shut down');
  }

  getConfig(): OrchestratorConfig {
    return this.config;
  }

  getStorage(): SqliteStorageAdapter {
    return this.storage;
  }

  getDispatcher(): Dispatcher {
    return this.dispatcher;
  }

  getProviderRegistry(): ProviderRegistry {
    return this.providerRegistry;
  }

  getToolRegistry(): BuiltinToolRegistry {
    return this.toolRegistry;
  }

  getMcpClientManager(): McpClientManager {
    return this.mcpClientManager;
  }

  getDashboardServer(): DashboardServer {
    return this.dashboardServer;
  }

  getSessionManager(): SessionManager {
    return this.sessionManager;
  }
}
