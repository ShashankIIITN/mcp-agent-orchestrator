import { nanoid } from 'nanoid';
import { createLogger } from '../utils/logger.js';
import { AgentRuntime, type AgentConfig } from '../agents/agent-runtime.js';
import type {
  StorageAdapter,
  SessionRecord,
  SessionStatus,
  InboxMessageRecord,
  MessageRecord,
} from '../storage/types.js';
import type { ProviderRegistry } from '../inference/provider-registry.js';
import type { BuiltinToolRegistry } from '../builtin-tools/tool-registry.js';
import { PolicyEngine } from '../orchestrator/policy-engine.js';
import type { OrchestratorConfig } from '../config/schema.js';
import type { SubagentTool, ToolContext } from '../builtin-tools/types.js';
import { eventBus } from '../dashboard/events.js';

const logger = createLogger('session-manager');

export interface InvokeSessionParams {
  name: string;
  role: string;
  system_prompt: string;
  model?: string;
  provider?: string;
  allowed_tools?: string[];
  workspace_path?: string;
  safety_mode?: 'autonomous' | 'semi-autonomous' | 'safe';
  parent_session_id?: string;
  initial_message?: string;
  await_response?: boolean;
  max_iterations?: number;
}

export interface SendSessionMessageParams {
  target_session_id: string;
  content: string;
  sender_session_id?: string;
  message_type?: 'text' | 'tool_result' | 'checkpoint_escalation' | 'completion' | 'broadcast';
  await_response?: boolean;
  workspace_path?: string;
  safety_mode?: 'autonomous' | 'semi-autonomous' | 'safe';
}

interface QueuedTurn {
  content: string;
  senderSessionId: string;
  context: ToolContext;
}

interface ActiveSessionContainer {
  record: SessionRecord;
  runtime: AgentRuntime;
  workspacePath: string;
  safetyMode: 'autonomous' | 'semi-autonomous' | 'safe';
  queue: QueuedTurn[];
  isProcessingQueue: boolean;
}

export class SessionManager {
  private activeSessions = new Map<string, ActiveSessionContainer>();
  private policyEngine: PolicyEngine;

  constructor(
    private storage: StorageAdapter,
    private providerRegistry: ProviderRegistry,
    private toolRegistry: BuiltinToolRegistry,
    private config: OrchestratorConfig,
  ) {
    this.policyEngine = new PolicyEngine(config.server.security);
  }

  /**
   * Invoke a new independent session with dedicated model, isolated context,
   * bilateral communication link, and background execution support.
   */
  async invokeSession(params: InvokeSessionParams): Promise<{
    session_id: string;
    name: string;
    role: string;
    status: SessionStatus;
    provider: string;
    model: string;
    parent_session_id?: string;
    response?: string;
    message: string;
  }> {
    const parentSessionId = params.parent_session_id ?? 'root';
    const workspacePath = params.workspace_path ?? './';
    const safetyMode = this.policyEngine.getEffectiveSafetyMode(params.safety_mode);

    if (params.workspace_path) {
      this.policyEngine.validateWorkspace(params.workspace_path);
    }

    // Resolve provider
    const providerNames = this.providerRegistry.list();
    if (providerNames.length === 0) {
      throw new Error('No inference providers configured in orchestrator');
    }

    const providerKey = params.provider ?? providerNames[0];
    const llmProvider = this.providerRegistry.getOrThrow(providerKey);

    // Resolve model override (if given) or default
    const effectiveModel = params.model ?? 'default';

    // Persist session to SQLite
    const sessionId = await this.storage.createSession({
      parent_session_id: parentSessionId,
      name: params.name,
      role: params.role,
      provider: providerKey,
      model: effectiveModel,
      status: 'idle',
      system_prompt: params.system_prompt,
      workspace_path: workspacePath,
      safety_mode: safetyMode,
    });

    // Assemble toolset for the session:
    // Base tools from registry (or filtered whitelist)
    const baseTools = params.allowed_tools
      ? this.toolRegistry.getByNames(params.allowed_tools)
      : this.toolRegistry.list();

    // Attach peer-to-peer mesh communication tools
    const meshTools = this.createMeshToolsForSession(sessionId);
    const allTools = [...baseTools, ...meshTools];

    const agentConfig: AgentConfig = {
      id: sessionId,
      name: params.name,
      role: params.role,
      systemPrompt: params.system_prompt,
      provider: llmProvider,
      tools: allTools,
      maxIterations: params.max_iterations ?? 20,
      model: params.model,
    };

    const runtime = new AgentRuntime(agentConfig);

    const record: SessionRecord = {
      id: sessionId,
      parent_session_id: parentSessionId,
      name: params.name,
      role: params.role,
      provider: providerKey,
      model: effectiveModel,
      status: 'idle',
      system_prompt: params.system_prompt,
      workspace_path: workspacePath,
      safety_mode: safetyMode,
      total_tool_calls: 0,
      iterations: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const container: ActiveSessionContainer = {
      record,
      runtime,
      workspacePath,
      safetyMode,
      queue: [],
      isProcessingQueue: false,
    };

    this.activeSessions.set(sessionId, container);
    logger.info({ sessionId, name: params.name, role: params.role }, 'Session spawned into mesh');

    // Handle initial task if provided
    if (params.initial_message) {
      await this.storage.sendInboxMessage({
        sender_session_id: parentSessionId,
        recipient_session_id: sessionId,
        content: params.initial_message,
        message_type: 'text',
      });

      if (params.await_response) {
        logger.debug({ sessionId }, 'Awaiting synchronous response for initial message');
        const response = await this.executeTurn(sessionId, params.initial_message, parentSessionId);
        return {
          session_id: sessionId,
          name: params.name,
          role: params.role,
          status: 'completed',
          provider: providerKey,
          model: effectiveModel,
          parent_session_id: parentSessionId,
          response,
          message: 'Session executed initial task and returned response.',
        };
      } else {
        // Asynchronous background execution
        this.enqueueTurn(sessionId, params.initial_message, parentSessionId);
        return {
          session_id: sessionId,
          name: params.name,
          role: params.role,
          status: 'running',
          provider: providerKey,
          model: effectiveModel,
          parent_session_id: parentSessionId,
          message: 'Session invoked and executing initial task in background. Use send_session_message or check_inbox to interact.',
        };
      }
    }

    return {
      session_id: sessionId,
      name: params.name,
      role: params.role,
      status: 'idle',
      provider: providerKey,
      model: effectiveModel,
      parent_session_id: parentSessionId,
      message: 'Session initialized and standing by for instructions.',
    };
  }

  /**
   * Send a message to an active agent session in the mesh.
   */
  async sendSessionMessage(params: SendSessionMessageParams): Promise<{
    success: boolean;
    target_session_id: string;
    message_id: string;
    response?: string;
    dispatched?: boolean;
    status: SessionStatus;
  }> {
    const senderId = params.sender_session_id ?? 'root';
    const targetSession = await this.ensureSessionActive(params.target_session_id);

    if (targetSession.record.status === 'terminated') {
      throw new Error(`Target session ${params.target_session_id} is terminated`);
    }

    if (targetSession.record.status === 'paused') {
      throw new Error(`Target session ${params.target_session_id} is currently paused. Resume it to send messages.`);
    }

    // Persist message to recipient inbox
    const messageId = await this.storage.sendInboxMessage({
      sender_session_id: senderId,
      recipient_session_id: params.target_session_id,
      content: params.content,
      message_type: params.message_type ?? 'text',
    });

    if (params.await_response) {
      const response = await this.executeTurn(params.target_session_id, params.content, senderId);
      return {
        success: true,
        target_session_id: params.target_session_id,
        message_id: messageId,
        response,
        status: targetSession.record.status,
      };
    } else {
      this.enqueueTurn(params.target_session_id, params.content, senderId);
      return {
        success: true,
        target_session_id: params.target_session_id,
        message_id: messageId,
        dispatched: true,
        status: 'running',
      };
    }
  }

  /**
   * Check inbox for messages delivered to a session.
   */
  async checkInbox(
    sessionId = 'root',
    unreadOnly = true,
    markAsRead = true,
  ): Promise<InboxMessageRecord[]> {
    const messages = await this.storage.getInboxMessages(sessionId, unreadOnly);
    if (markAsRead && messages.length > 0) {
      for (const msg of messages) {
        await this.storage.markInboxMessageRead(msg.id);
      }
    }
    return messages;
  }

  /**
   * List sessions matching an optional parent or status filter.
   */
  async listSessions(
    parentSessionId?: string,
    filter: 'all' | 'active' | 'my_children' = 'all',
  ): Promise<SessionRecord[]> {
    const parentFilter = filter === 'my_children' ? parentSessionId : undefined;
    const dbSessions = await this.storage.listSessions(parentFilter);

    return dbSessions
      .map((sess) => {
        const active = this.activeSessions.get(sess.id);
        if (active) {
          const state = active.runtime.getState();
          return {
            ...sess,
            status: active.record.status,
            total_tool_calls: state.totalToolCalls,
            iterations: state.iterations,
            last_error: state.lastError ?? sess.last_error,
          };
        }
        return sess;
      })
      .filter((sess) => {
        if (filter === 'active') {
          return sess.status === 'running' || sess.status === 'idle' || sess.status === 'waiting_input';
        }
        return true;
      });
  }

  /**
   * Retrieve full conversation and inbox history for a session.
   */
  async getSessionTranscript(sessionId: string): Promise<{
    session: SessionRecord | null;
    messages: MessageRecord[];
    inbox: InboxMessageRecord[];
  }> {
    const session = await this.storage.getSession(sessionId);
    const messages = await this.storage.getAgentTranscript(sessionId);
    const inbox = await this.storage.getInboxMessages(sessionId, false);
    return { session, messages, inbox };
  }

  /**
   * Pause execution of a session.
   */
  async pauseSession(sessionId: string): Promise<void> {
    const container = this.activeSessions.get(sessionId);
    if (container) {
      container.record.status = 'paused';
      container.runtime.setStatus('paused');
    }
    await this.storage.updateSessionStatus(sessionId, 'paused');
    logger.info({ sessionId }, 'Session paused');
  }

  /**
   * Resume a paused session and drain any pending queue.
   */
  async resumeSession(sessionId: string): Promise<void> {
    const container = this.activeSessions.get(sessionId);
    if (container) {
      container.record.status = 'idle';
      container.runtime.setStatus('idle');
      this.drainQueue(sessionId).catch((err) => {
        logger.error({ error: err, sessionId }, 'Error draining queue on resume');
      });
    }
    await this.storage.updateSessionStatus(sessionId, 'idle');
    logger.info({ sessionId }, 'Session resumed');
  }

  /**
   * Terminate a session.
   */
  async terminateSession(sessionId: string): Promise<void> {
    const container = this.activeSessions.get(sessionId);
    if (container) {
      container.record.status = 'terminated';
      container.runtime.setStatus('terminated');
      container.queue = [];
      this.activeSessions.delete(sessionId);
    }
    await this.storage.terminateSession(sessionId);
    logger.info({ sessionId }, 'Session terminated');
  }

  /**
   * Broadcast an instruction or directive to multiple sessions.
   */
  async broadcastMessage(params: {
    content: string;
    sender_session_id?: string;
    parent_session_id?: string;
  }): Promise<{ broadcast_count: number; delivered_sessions: string[] }> {
    const senderId = params.sender_session_id ?? 'root';
    const sessions = await this.storage.listSessions(params.parent_session_id);
    const delivered: string[] = [];

    for (const sess of sessions) {
      if (sess.id === senderId || sess.status === 'terminated') continue;

      await this.storage.sendInboxMessage({
        sender_session_id: senderId,
        recipient_session_id: sess.id,
        content: params.content,
        message_type: 'broadcast',
      });

      this.enqueueTurn(sess.id, `[BROADCAST DIRECTIVE FROM ${senderId}]: ${params.content}`, senderId);
      delivered.push(sess.id);
    }

    return { broadcast_count: delivered.length, delivered_sessions: delivered };
  }

  /**
   * Emergency terminate all active sessions.
   */
  async killAllSessions(parentSessionId?: string): Promise<{ terminated_count: number }> {
    const sessions = await this.storage.listSessions(parentSessionId);
    let count = 0;
    for (const sess of sessions) {
      if (sess.status !== 'terminated') {
        await this.terminateSession(sess.id);
        count++;
      }
    }
    return { terminated_count: count };
  }

  // ── Internal Queue & Execution ──────────────────────────────────

  private enqueueTurn(sessionId: string, content: string, senderSessionId: string): void {
    const container = this.activeSessions.get(sessionId);
    if (!container) return;

    const context: ToolContext = {
      workspace_path: container.workspacePath,
      safety_mode: container.safetyMode,
      job_id: sessionId,
      agent_id: sessionId,
    };

    container.queue.push({ content, senderSessionId, context });
    this.drainQueue(sessionId).catch((err) => {
      logger.error({ error: err, sessionId }, 'Error during background turn execution');
    });
  }

  private async drainQueue(sessionId: string): Promise<void> {
    const container = this.activeSessions.get(sessionId);
    if (!container) return;

    const isSessionBlocked = () =>
      (container.record.status as SessionStatus) === 'paused' ||
      (container.record.status as SessionStatus) === 'terminated';

    if (container.isProcessingQueue || isSessionBlocked()) {
      return;
    }

    container.isProcessingQueue = true;
    try {
      while (container.queue.length > 0 && !isSessionBlocked()) {
        const item = container.queue.shift()!;
        await this.executeTurn(sessionId, item.content, item.senderSessionId);
      }
    } finally {
      container.isProcessingQueue = false;
    }
  }

  private async executeTurn(
    sessionId: string,
    content: string,
    senderSessionId: string,
  ): Promise<string> {
    const container = this.activeSessions.get(sessionId);
    if (!container) throw new Error(`Active session container not found: ${sessionId}`);

    container.record.status = 'running';
    container.runtime.setStatus('running');
    await this.storage.updateSessionStatus(sessionId, 'running');

    const context: ToolContext = {
      workspace_path: container.workspacePath,
      safety_mode: container.safetyMode,
      job_id: sessionId,
      agent_id: sessionId,
    };

    try {
      const response = await container.runtime.run(
        content,
        context,
        this.storage,
        sessionId,
      );

      const state = container.runtime.getState();
      container.record.total_tool_calls = state.totalToolCalls;
      container.record.iterations = state.iterations;
      container.record.status = 'idle';
      container.runtime.setStatus('idle');

      await this.storage.updateSessionStatus(sessionId, 'idle', {
        total_tool_calls: state.totalToolCalls,
        iterations: state.iterations,
      });

      // Deliver reply to sender's inbox
      await this.storage.sendInboxMessage({
        sender_session_id: sessionId,
        recipient_session_id: senderSessionId,
        content: response,
        message_type: 'text',
      });

      logger.info({ sessionId, senderSessionId }, 'Session turn finished, reply deposited in inbox');
      return response;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      container.record.status = 'error';
      container.record.last_error = errorMsg;
      container.runtime.setStatus('error');

      await this.storage.updateSessionStatus(sessionId, 'error', {
        last_error: errorMsg,
      });

      // Send error notification to sender inbox
      await this.storage.sendInboxMessage({
        sender_session_id: sessionId,
        recipient_session_id: senderSessionId,
        content: `Session ${sessionId} error: ${errorMsg}`,
        message_type: 'text',
      });

      throw err;
    }
  }

  private async ensureSessionActive(sessionId: string): Promise<ActiveSessionContainer> {
    const existing = this.activeSessions.get(sessionId);
    if (existing) return existing;

    // Attempt resurrection from DB
    const record = await this.storage.getSession(sessionId);
    if (!record) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const provider = this.providerRegistry.getOrThrow(record.provider);
    const baseTools = this.toolRegistry.list();
    const meshTools = this.createMeshToolsForSession(sessionId);

    const runtime = new AgentRuntime({
      id: sessionId,
      name: record.name,
      role: record.role,
      systemPrompt: record.system_prompt ?? '',
      provider,
      tools: [...baseTools, ...meshTools],
      maxIterations: 20,
      model: record.model,
    });

    const container: ActiveSessionContainer = {
      record,
      runtime,
      workspacePath: record.workspace_path ?? './',
      safetyMode: (record.safety_mode as 'autonomous' | 'semi-autonomous' | 'safe') ?? 'semi-autonomous',
      queue: [],
      isProcessingQueue: false,
    };

    this.activeSessions.set(sessionId, container);
    return container;
  }

  /**
   * Create mesh communication tools for agents to use internally during execution.
   */
  private createMeshToolsForSession(sessionId: string): SubagentTool[] {
    return [
      {
        name: 'mesh_send_message',
        description: 'Send a message to another agent session or reply to your parent session in the mesh.',
        parameters: {
          type: 'object',
          properties: {
            target_session_id: {
              type: 'string',
              description: 'Target session ID to message (e.g. parent session ID or peer)',
            },
            message: {
              type: 'string',
              description: 'Message or payload to deliver to the target session',
            },
          },
          required: ['target_session_id', 'message'],
        },
        execute: async (args) => {
          const target = String(args.target_session_id);
          const content = String(args.message);
          try {
            await this.sendSessionMessage({
              sender_session_id: sessionId,
              target_session_id: target,
              content,
              await_response: false,
            });
            return {
              success: true,
              output: `Message successfully dispatched to session ${target}`,
            };
          } catch (err) {
            return {
              success: false,
              output: '',
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
      },
      {
        name: 'mesh_check_inbox',
        description: 'Check your session inbox for pending messages or replies from peers.',
        parameters: {
          type: 'object',
          properties: {
            unread_only: {
              type: 'boolean',
              description: 'Only retrieve unread messages',
              default: true,
            },
          },
        },
        execute: async (args) => {
          try {
            const unreadOnly = args.unread_only !== false;
            const messages = await this.checkInbox(sessionId, unreadOnly, true);
            return {
              success: true,
              output: JSON.stringify(messages, null, 2),
            };
          } catch (err) {
            return {
              success: false,
              output: '',
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
      },
      {
        name: 'mesh_list_peers',
        description: 'Discover other active specialist sessions currently collaborating in the mesh.',
        parameters: {
          type: 'object',
          properties: {},
        },
        execute: async () => {
          try {
            const peers = await this.listSessions(undefined, 'active');
            const summaries = peers
              .filter((p) => p.id !== sessionId)
              .map((p) => ({
                id: p.id,
                name: p.name,
                role: p.role,
                status: p.status,
              }));
            return {
              success: true,
              output: JSON.stringify(summaries, null, 2),
            };
          } catch (err) {
            return {
              success: false,
              output: '',
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
      },
    ];
  }
}
