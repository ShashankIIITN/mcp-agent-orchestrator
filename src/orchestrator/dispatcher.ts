import { createLogger } from '../utils/logger.js';
import type { StorageAdapter, JobDefinition } from '../storage/types.js';
import type { OrchestratorConfig } from '../config/schema.js';
import { Supervisor, type SwarmConfig } from './supervisor.js';
import { PipelineRunner, type PipelineConfig } from './pipeline-runner.js';
import { PolicyEngine } from './policy-engine.js';
import type { ProviderRegistry } from '../inference/provider-registry.js';
import type { BuiltinToolRegistry } from '../builtin-tools/tool-registry.js';
import { AgentPool } from '../agents/agent-pool.js';
import type { ToolContext } from '../builtin-tools/types.js';

const logger = createLogger('dispatcher');

export class Dispatcher {
  private supervisor = new Supervisor();
  private pipelineRunner = new PipelineRunner();
  private agentPool = new AgentPool();
  private policyEngine: PolicyEngine;

  constructor(
    private config: OrchestratorConfig,
    private storage: StorageAdapter,
    private providerRegistry: ProviderRegistry,
    private toolRegistry: BuiltinToolRegistry,
  ) {
    this.policyEngine = new PolicyEngine(config.server.security);
  }

  /**
   * Start a swarm task. Creates a job, then runs the swarm in the background.
   * Returns the job ID immediately.
   */
  async startSwarm(params: {
    goal: string;
    context?: string;
    workspace_path?: string;
    safety_mode?: 'autonomous' | 'semi-autonomous' | 'safe';
  }): Promise<string> {
    const safetyMode = this.policyEngine.getEffectiveSafetyMode(params.safety_mode);
    const workspacePath = params.workspace_path ?? './';

    if (params.workspace_path) {
      this.policyEngine.validateWorkspace(params.workspace_path);
    }

    const jobId = await this.storage.createJob({
      goal: params.goal,
      mode: 'swarm',
      workspace_path: workspacePath,
      safety_mode: safetyMode,
    });

    const toolContext: ToolContext = {
      workspace_path: workspacePath,
      safety_mode: safetyMode,
      job_id: jobId,
      agent_id: 'supervisor',
    };

    // Get the first available provider as supervisor
    const providerNames = this.providerRegistry.list();
    if (providerNames.length === 0) {
      await this.storage.updateJobStatus(jobId, 'failed', { output: 'No inference providers configured' });
      return jobId;
    }

    const supervisorProvider = this.providerRegistry.getOrThrow(providerNames[0]);
    const workerProviders = new Map<string, typeof supervisorProvider>();
    for (const name of providerNames) {
      workerProviders.set(name, this.providerRegistry.getOrThrow(name));
    }

    const swarmConfig: SwarmConfig = {
      jobId,
      goal: params.goal,
      context: params.context,
      supervisorProvider,
      workerProviders,
      tools: this.toolRegistry.list(),
      toolContext,
      storage: this.storage,
      maxIterations: 15,
    };

    // Run in background (don't await)
    this.supervisor.runSwarm(swarmConfig).catch(err => {
      logger.error({ error: err, jobId }, 'Background swarm failed');
    });

    logger.info({ jobId, goal: params.goal }, 'Swarm dispatched');
    return jobId;
  }

  /**
   * Run a pipeline by name. Creates a job, then runs the pipeline in the background.
   */
  async runPipeline(params: {
    pipeline_name: string;
    inputs?: Record<string, string>;
    workspace_path?: string;
    safety_mode?: 'autonomous' | 'semi-autonomous' | 'safe';
  }): Promise<string> {
    const pipeline = this.config.pipelines[params.pipeline_name];
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${params.pipeline_name}`);
    }

    const safetyMode = this.policyEngine.getEffectiveSafetyMode(params.safety_mode);
    const workspacePath = params.workspace_path ?? './';

    if (params.workspace_path) {
      this.policyEngine.validateWorkspace(params.workspace_path);
    }

    const jobId = await this.storage.createJob({
      goal: `Pipeline: ${params.pipeline_name}`,
      mode: 'pipeline',
      pipeline_name: params.pipeline_name,
      workspace_path: workspacePath,
      safety_mode: safetyMode,
    });

    const toolContext: ToolContext = {
      workspace_path: workspacePath,
      safety_mode: safetyMode,
      job_id: jobId,
      agent_id: 'pipeline-runner',
    };

    const pipelineConfig: PipelineConfig = {
      jobId,
      pipeline,
      agentDefs: this.config.agents,
      providerResolver: (name) => this.providerRegistry.getOrThrow(name),
      tools: this.toolRegistry.list(),
      toolContext,
      storage: this.storage,
      inputs: params.inputs ?? {},
    };

    // Run in background
    this.pipelineRunner.run(pipelineConfig).catch(err => {
      logger.error({ error: err, jobId }, 'Background pipeline failed');
    });

    logger.info({ jobId, pipeline: params.pipeline_name }, 'Pipeline dispatched');
    return jobId;
  }

  getAgentPool(): AgentPool {
    return this.agentPool;
  }

  getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }

  getProviderRegistry(): ProviderRegistry {
    return this.providerRegistry;
  }

  getToolRegistry(): BuiltinToolRegistry {
    return this.toolRegistry;
  }
}
