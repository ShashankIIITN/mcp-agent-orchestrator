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
import type { OrchestratorConfig, ModelTier } from '../config/schema.js';
import type { SubagentTool, ToolContext } from '../builtin-tools/types.js';
import { eventBus, type DashboardEvent } from '../dashboard/events.js';

const logger = createLogger('session-manager');

const MAX_SESSION_DEPTH = 3;

export interface InvokeSessionParams {
  name?: string;
  role?: string;
  system_prompt?: string;
  /** Optional preset agent name from orchestrator.yaml or auto-discovered specialists (e.g. "researcher", "coder", "reviewer") */
  agent_preset?: string;
  /** Cost/capability tier ("fast" for cheap exploration, "balanced" for standard coding, "heavy" for deep reasoning) */
  tier?: ModelTier;
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

export interface MeshStats {
  total_sessions: number;
  active_sessions: number;
  total_isolated_context_tokens: number;
  context_firewall_saved_tokens: number;
  effective_context_multiplier: number;
  tier_distribution: Record<string, number>;
  model_distribution: Record<string, number>;
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
  tier: ModelTier;
  depth: number;
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
   * Smart resolution of provider, model, and cost tier.
   * Supports explicit provider/model, preset defaults, cost tiers ('fast' | 'balanced' | 'heavy'),
   * and automatic model-family to provider matching (e.g. claude-* -> agy_claude / anthropic).
   */
  public resolveProviderAndModel(params: {
    provider?: string;
    model?: string;
    tier?: ModelTier;
    presetProvider?: string;
    presetModel?: string;
  }): { providerKey: string; effectiveModel: string; effectiveTier: ModelTier } {
    const providerNames = this.providerRegistry.list();
    if (providerNames.length === 0) {
      throw new Error('No inference providers configured in orchestrator');
    }

    const findProvider = (...candidates: (string | undefined)[]): string | undefined => {
      for (const c of candidates) {
        if (c && this.providerRegistry.get(c)) return c;
      }
      return undefined;
    };

    const effectiveTier: ModelTier = params.tier ?? 'balanced';

    // 1. If a tier is explicitly requested and model is not overridden, check tier mappings
    if (params.tier && !params.model) {
      const configuredTier = this.config.inference.tiers?.[params.tier];
      const tierProvider = findProvider(params.provider, configuredTier?.provider);
      if (configuredTier && tierProvider) {
        return {
          providerKey: tierProvider,
          effectiveModel: configuredTier.model,
          effectiveTier,
        };
      }

      if (params.tier === 'fast') {
        const fastProvider = findProvider(params.provider, 'ollama', 'gemini', 'agy', providerNames[0])!;
        const fastModel =
          fastProvider === 'ollama'
            ? this.config.inference.providers[fastProvider]?.model || 'llama3.3'
            : fastProvider === 'gemini'
              ? 'gemini-2.5-flash'
              : 'gemini-3.8-flash-lite';
        return { providerKey: fastProvider, effectiveModel: fastModel, effectiveTier: 'fast' };
      }

      if (params.tier === 'heavy') {
        const heavyProvider = findProvider(
          params.provider,
          'agy_claude',
          'anthropic',
          'openai',
          'agy',
          providerNames[0],
        )!;
        const heavyModel =
          heavyProvider === 'agy_claude' || heavyProvider === 'anthropic'
            ? 'claude-sonnet-4-6'
            : heavyProvider === 'openai'
              ? 'gpt-4o'
              : 'gemini-3.1-pro-high';
        return { providerKey: heavyProvider, effectiveModel: heavyModel, effectiveTier: 'heavy' };
      }

      // 'balanced' tier
      const balancedProvider = findProvider(params.provider, 'agy', 'gemini', 'openai', providerNames[0])!;
      const balancedModel =
        this.config.inference.providers[balancedProvider]?.model || 'gemini-3.8-flash-high';
      return { providerKey: balancedProvider, effectiveModel: balancedModel, effectiveTier: 'balanced' };
    }

    // 2. Explicit model or preset model
    const requestedModel = params.model ?? params.presetModel;
    let providerKey = findProvider(params.provider, params.presetProvider);

    // Auto-match provider by model name family when provider wasn't explicitly set
    if (!params.provider && requestedModel) {
      const lowerModel = requestedModel.toLowerCase();
      if (lowerModel.includes('claude') || lowerModel.includes('sonnet') || lowerModel.includes('opus') || lowerModel.includes('haiku')) {
        providerKey = findProvider('agy_claude', 'anthropic', providerKey, providerNames[0]);
      } else if (lowerModel.includes('gemini') || lowerModel.includes('flash')) {
        providerKey = findProvider('agy', 'gemini', providerKey, providerNames[0]);
      } else if (lowerModel.includes('gpt') || lowerModel.startsWith('o1') || lowerModel.startsWith('o3')) {
        providerKey = findProvider('openai', 'agy', providerKey, providerNames[0]);
      }
    }

    if (!providerKey) {
      if (params.provider) {
        // Let getOrThrow produce a clear error for an unknown explicit provider
        this.providerRegistry.getOrThrow(params.provider);
      }
      providerKey = providerNames[0];
    }

    const configuredModel = this.config.inference.providers[providerKey]?.model;
    const effectiveModel = requestedModel ?? configuredModel ?? 'default';

    // Infer tier for telemetry if not explicitly given
    const lower = effectiveModel.toLowerCase();
    const inferredTier: ModelTier = params.tier
      ? params.tier
      : lower.includes('lite') || lower.includes('-low') || lower.includes('(low)') || lower.includes('haiku') || lower.includes('mini')
        ? 'fast'
        : lower.includes('claude') || lower.includes('argon') || lower.includes('pro') || lower.includes('opus') || lower.includes('gpt-4')
          ? 'heavy'
          : 'balanced';

    return { providerKey, effectiveModel, effectiveTier: inferredTier };
  }

  /**
   * Invoke a new independent session with its own isolated context window,
   * custom model or cost tier, bilateral inbox, and recursive sub-session capability.
   */
  async invokeSession(params: InvokeSessionParams): Promise<{
    session_id: string;
    name: string;
    role: string;
    status: SessionStatus;
    provider: string;
    model: string;
    tier: ModelTier;
    depth: number;
    parent_session_id?: string;
    response?: string;
    context_tokens_used?: number;
    context_firewall_saved_tokens?: number;
    message: string;
  }> {
    const parentSessionId = params.parent_session_id ?? 'root';
    const parentContainer = this.activeSessions.get(parentSessionId);
    const depth = parentContainer ? parentContainer.depth + 1 : 0;

    if (depth > MAX_SESSION_DEPTH) {
      throw new Error(
        `Maximum session nesting depth (${MAX_SESSION_DEPTH}) reached from parent ${parentSessionId}. Cannot spawn deeper sub-sessions.`,
      );
    }

    // Resolve optional preset persona from config.agents
    const preset = params.agent_preset ? this.config.agents[params.agent_preset] : undefined;
    if (params.agent_preset && !preset) {
      const available = Object.keys(this.config.agents).join(', ');
      throw new Error(`Agent preset "${params.agent_preset}" not found. Available presets: ${available}`);
    }

    const name = params.name ?? params.agent_preset ?? 'SpecialistSession';
    const role = params.role ?? preset?.role ?? 'Specialist Agent';
    const systemPrompt =
      params.system_prompt ??
      preset?.system_prompt ??
      `You are ${name} (${role}). Operate within your isolated context window and return a concise, high-signal result.`;

    const workspacePath = params.workspace_path ?? parentContainer?.workspacePath ?? './';
    const safetyMode = this.policyEngine.getEffectiveSafetyMode(
      params.safety_mode ?? parentContainer?.safetyMode,
    );

    if (params.workspace_path) {
      this.policyEngine.validateWorkspace(params.workspace_path);
    }

    const { providerKey, effectiveModel, effectiveTier } = this.resolveProviderAndModel({
      provider: params.provider,
      model: params.model,
      tier: params.tier,
      presetProvider: preset?.provider,
      presetModel: preset?.model,
    });

    const llmProvider = this.providerRegistry.getOrThrow(providerKey);

    // Persist session to SQLite
    const sessionId = await this.storage.createSession({
      parent_session_id: parentSessionId,
      name,
      role,
      provider: providerKey,
      model: effectiveModel,
      status: 'idle',
      system_prompt: systemPrompt,
      workspace_path: workspacePath,
      safety_mode: safetyMode,
    });

    // Assemble toolset for the session:
    const toolFilter = params.allowed_tools ?? (preset?.tools?.length ? preset.tools : undefined);
    const baseTools = toolFilter
      ? this.toolRegistry.getByNames(toolFilter)
      : this.toolRegistry.list();

    // Attach peer-to-peer & recursive sub-session mesh tools
    const meshTools = this.createMeshToolsForSession(sessionId, depth);
    const allTools = [...baseTools, ...meshTools];

    const agentConfig: AgentConfig = {
      id: sessionId,
      name,
      role,
      systemPrompt,
      provider: llmProvider,
      tools: allTools,
      maxIterations: params.max_iterations ?? 20,
      model: effectiveModel !== 'default' ? effectiveModel : undefined,
    };

    const runtime = new AgentRuntime(agentConfig);

    const record: SessionRecord = {
      id: sessionId,
      parent_session_id: parentSessionId,
      name,
      role,
      provider: providerKey,
      model: effectiveModel,
      status: 'idle',
      system_prompt: systemPrompt,
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
      tier: effectiveTier,
      depth,
      queue: [],
      isProcessingQueue: false,
    };

    this.activeSessions.set(sessionId, container);
    logger.info(
      { sessionId, name, role, provider: providerKey, model: effectiveModel, tier: effectiveTier, depth },
      'Session spawned into mesh with isolated context window',
    );

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
        const state = runtime.getState();
        return {
          session_id: sessionId,
          name,
          role,
          status: 'completed',
          provider: providerKey,
          model: effectiveModel,
          tier: effectiveTier,
          depth,
          parent_session_id: parentSessionId,
          response,
          context_tokens_used: state.contextTokensUsed,
          context_firewall_saved_tokens: state.contextFirewallSavedTokens,
          message: 'Session executed initial task in isolated context and returned response.',
        };
      } else {
        // Asynchronous background execution
        this.enqueueTurn(sessionId, params.initial_message, parentSessionId);
        return {
          session_id: sessionId,
          name,
          role,
          status: 'running',
          provider: providerKey,
          model: effectiveModel,
          tier: effectiveTier,
          depth,
          parent_session_id: parentSessionId,
          message:
            'Session invoked and executing initial task in background. Use wait_for_inbox or check_inbox to collect the result.',
        };
      }
    }

    return {
      session_id: sessionId,
      name,
      role,
      status: 'idle',
      provider: providerKey,
      model: effectiveModel,
      tier: effectiveTier,
      depth,
      parent_session_id: parentSessionId,
      message: 'Session initialized with isolated context window and standing by for instructions.',
    };
  }

  /**
   * Fan out multiple independent tasks across separate isolated context windows in parallel.
   * Each task can use its own model or cost tier ('fast' | 'balanced' | 'heavy').
   */
  async invokeSessionsParallel(params: {
    sessions: InvokeSessionParams[];
    parent_session_id?: string;
    await_all?: boolean;
  }): Promise<{
    parent_session_id: string;
    spawned_count: number;
    total_context_tokens_used: number;
    total_context_firewall_saved_tokens: number;
    results: Array<{
      session_id: string;
      name: string;
      role: string;
      provider: string;
      model: string;
      tier: ModelTier;
      status: SessionStatus;
      response?: string;
      context_tokens_used?: number;
      context_firewall_saved_tokens?: number;
      error?: string;
    }>;
  }> {
    const parentId = params.parent_session_id ?? 'parent-session';
    const awaitAll = params.await_all !== false;

    const settled = await Promise.all(
      params.sessions.map(async (item) => {
        try {
          const res = await this.invokeSession({
            ...item,
            parent_session_id: item.parent_session_id ?? parentId,
            await_response: item.initial_message ? awaitAll : false,
          });
          return {
            session_id: res.session_id,
            name: res.name,
            role: res.role,
            provider: res.provider,
            model: res.model,
            tier: res.tier,
            status: res.status,
            response: res.response,
            context_tokens_used: res.context_tokens_used ?? 0,
            context_firewall_saved_tokens: res.context_firewall_saved_tokens ?? 0,
          };
        } catch (err) {
          return {
            session_id: '',
            name: item.name ?? item.agent_preset ?? 'failed-session',
            role: item.role ?? 'unknown',
            provider: item.provider ?? 'unknown',
            model: item.model ?? 'unknown',
            tier: (item.tier ?? 'balanced') as ModelTier,
            status: 'error' as SessionStatus,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const totalUsed = settled.reduce((sum, r) => sum + (r.context_tokens_used ?? 0), 0);
    const totalSaved = settled.reduce((sum, r) => sum + (r.context_firewall_saved_tokens ?? 0), 0);

    return {
      parent_session_id: parentId,
      spawned_count: settled.length,
      total_context_tokens_used: totalUsed,
      total_context_firewall_saved_tokens: totalSaved,
      results: settled,
    };
  }

  /**
   * Event-driven wait for unread messages to arrive in a session's inbox.
   * Eliminates busy-polling when waiting on background child sessions.
   */
  async waitForInbox(
    sessionId = 'parent-session',
    timeoutMs = 60000,
    markAsRead = true,
  ): Promise<{ timed_out: boolean; messages: InboxMessageRecord[] }> {
    // 1. Check if unread messages are already waiting
    const immediate = await this.checkInbox(sessionId, true, markAsRead);
    if (immediate.length > 0) {
      return { timed_out: false, messages: immediate };
    }

    // 2. Otherwise subscribe to eventBus for incoming message_logged events
    return new Promise((resolve) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const finish = async (timedOut: boolean) => {
        if (settled) return;
        settled = true;
        eventBus.off('event', onEvent);
        if (timer) clearTimeout(timer);
        const msgs = await this.checkInbox(sessionId, true, markAsRead);
        resolve({ timed_out: timedOut && msgs.length === 0, messages: msgs });
      };

      const onEvent = (ev: DashboardEvent) => {
        if (ev.type === 'message_logged' && ev.jobId === sessionId) {
          void finish(false);
        }
      };

      eventBus.on('event', onEvent);
      timer = setTimeout(() => void finish(true), timeoutMs);
    });
  }

  /**
   * Compute aggregate Context Firewall & Model Tier telemetry across the mesh.
   */
  async getMeshStats(): Promise<MeshStats> {
    const dbSessions = await this.storage.listSessions();
    let totalContextTokens = 0;
    let savedTokens = 0;
    let activeCount = 0;
    const tierDist: Record<string, number> = { fast: 0, balanced: 0, heavy: 0 };
    const modelDist: Record<string, number> = {};

    for (const sess of dbSessions) {
      const container = this.activeSessions.get(sess.id);
      const status = container ? container.record.status : sess.status;
      if (status === 'running' || status === 'idle' || status === 'waiting_input') {
        activeCount++;
      }

      if (container) {
        const state = container.runtime.getState();
        totalContextTokens += state.contextTokensUsed;
        savedTokens += state.contextFirewallSavedTokens;
        tierDist[container.tier] = (tierDist[container.tier] ?? 0) + 1;
      }

      if (sess.model) {
        modelDist[sess.model] = (modelDist[sess.model] ?? 0) + 1;
      }
    }

    const parentTokensReceived = Math.max(1, totalContextTokens - savedTokens);
    const multiplier =
      totalContextTokens > 0
        ? Number((totalContextTokens / parentTokensReceived).toFixed(2))
        : 1;

    return {
      total_sessions: dbSessions.length,
      active_sessions: activeCount,
      total_isolated_context_tokens: totalContextTokens,
      context_firewall_saved_tokens: savedTokens,
      effective_context_multiplier: multiplier,
      tier_distribution: tierDist,
      model_distribution: modelDist,
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
    context_tokens_used?: number;
    context_firewall_saved_tokens?: number;
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
      const state = targetSession.runtime.getState();
      return {
        success: true,
        target_session_id: params.target_session_id,
        message_id: messageId,
        response,
        context_tokens_used: state.contextTokensUsed,
        context_firewall_saved_tokens: state.contextFirewallSavedTokens,
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
  ): Promise<Array<SessionRecord & { tier?: ModelTier; depth?: number; context_tokens_used?: number; context_firewall_saved_tokens?: number }>> {
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
            tier: active.tier,
            depth: active.depth,
            context_tokens_used: state.contextTokensUsed,
            context_firewall_saved_tokens: state.contextFirewallSavedTokens,
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
    context_stats?: {
      context_tokens_used: number;
      context_firewall_saved_tokens: number;
      tier: ModelTier;
    };
  }> {
    const session = await this.storage.getSession(sessionId);
    const messages = await this.storage.getAgentTranscript(sessionId);
    const inbox = await this.storage.getInboxMessages(sessionId, false);
    const active = this.activeSessions.get(sessionId);
    const state = active?.runtime.getState();
    return {
      session,
      messages,
      inbox,
      context_stats: active && state
        ? {
            context_tokens_used: state.contextTokensUsed,
            context_firewall_saved_tokens: state.contextFirewallSavedTokens,
            tier: active.tier,
          }
        : undefined,
    };
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
    const meshTools = this.createMeshToolsForSession(sessionId, 1);

    const runtime = new AgentRuntime({
      id: sessionId,
      name: record.name,
      role: record.role,
      systemPrompt: record.system_prompt ?? '',
      provider,
      tools: [...baseTools, ...meshTools],
      maxIterations: 20,
      model: record.model && record.model !== 'default' ? record.model : undefined,
    });

    // Hydrate prior conversation history from SQLite so resurrected sessions keep their memory
    const savedTranscript = await this.storage.getAgentTranscript(sessionId, sessionId);
    if (savedTranscript.length > 0) {
      runtime.loadMessages(
        savedTranscript.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      );
    }

    const container: ActiveSessionContainer = {
      record,
      runtime,
      workspacePath: record.workspace_path ?? './',
      safetyMode: (record.safety_mode as 'autonomous' | 'semi-autonomous' | 'safe') ?? 'semi-autonomous',
      tier: 'balanced',
      depth: 1,
      queue: [],
      isProcessingQueue: false,
    };

    this.activeSessions.set(sessionId, container);
    return container;
  }

  /**
   * Create mesh communication & recursive sub-session delegation tools for agents
   * to use internally during execution.
   */
  private createMeshToolsForSession(sessionId: string, currentDepth = 0): SubagentTool[] {
    const tools: SubagentTool[] = [
      {
        name: 'mesh_send_message',
        description:
          'Send a message or task to another agent session (peer or child) or reply to your parent session in the mesh.',
        parameters: {
          type: 'object',
          properties: {
            target_session_id: {
              type: 'string',
              description: 'Target session ID to message (e.g. parent session ID, child session ID, or peer)',
            },
            message: {
              type: 'string',
              description: 'Message or task instruction to deliver to the target session',
            },
            await_response: {
              type: 'boolean',
              description: 'If true, waits for the target session to finish its turn and returns its response directly.',
            },
          },
          required: ['target_session_id', 'message'],
        },
        execute: async (args) => {
          const target = String(args.target_session_id);
          const content = String(args.message);
          const awaitResponse = Boolean(args.await_response);
          try {
            const res = await this.sendSessionMessage({
              sender_session_id: sessionId,
              target_session_id: target,
              content,
              await_response: awaitResponse,
            });
            return {
              success: true,
              output: awaitResponse
                ? (res.response ?? '')
                : `Message successfully dispatched to session ${target}`,
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
        description: 'Check your session inbox for pending messages or deliverables from child/peer sessions.',
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
        name: 'mesh_wait_for_inbox',
        description:
          'Wait reactively for a background child or peer session to deliver a message to your inbox (no polling needed).',
        parameters: {
          type: 'object',
          properties: {
            timeout_ms: {
              type: 'number',
              description: 'Maximum milliseconds to wait before returning (default: 60000)',
            },
          },
        },
        execute: async (args) => {
          try {
            const timeoutMs = typeof args.timeout_ms === 'number' ? args.timeout_ms : 60000;
            const res = await this.waitForInbox(sessionId, timeoutMs, true);
            return {
              success: true,
              output: JSON.stringify(res, null, 2),
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
                model: p.model,
                tier: p.tier,
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

    // Allow child sessions to spin up their own sub-sessions if within depth limit
    if (currentDepth < MAX_SESSION_DEPTH) {
      tools.push({
        name: 'mesh_invoke_session',
        description:
          'Spin up a new sub-session with its own isolated context window and custom model/tier (e.g. tier="fast" for cheap exploration or file reading so your own context stays clean).',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name for the child sub-session' },
            role: { type: 'string', description: 'Role description for the child sub-session' },
            agent_preset: {
              type: 'string',
              description: 'Optional preset specialist name (e.g. "researcher", "coder", "reviewer")',
            },
            system_prompt: { type: 'string', description: 'System prompt for the sub-session' },
            tier: {
              type: 'string',
              enum: ['fast', 'balanced', 'heavy'],
              description: 'Model cost/capability tier ("fast" for cheap subtasks, "balanced", or "heavy")',
            },
            model: { type: 'string', description: 'Optional explicit model name override' },
            provider: { type: 'string', description: 'Optional provider override' },
            initial_message: { type: 'string', description: 'Task to execute in the sub-session' },
            await_response: {
              type: 'boolean',
              description:
                'If true (default), waits for the sub-session to finish and returns its distilled answer. If false, runs in background and delivers to your inbox.',
            },
          },
          required: ['initial_message'],
        },
        execute: async (args) => {
          try {
            const res = await this.invokeSession({
              name: args.name ? String(args.name) : undefined,
              role: args.role ? String(args.role) : undefined,
              agent_preset: args.agent_preset ? String(args.agent_preset) : undefined,
              system_prompt: args.system_prompt ? String(args.system_prompt) : undefined,
              tier: (args.tier as ModelTier | undefined) ?? 'fast',
              model: args.model ? String(args.model) : undefined,
              provider: args.provider ? String(args.provider) : undefined,
              parent_session_id: sessionId,
              initial_message: String(args.initial_message),
              await_response: args.await_response !== false,
            });
            return {
              success: true,
              output: JSON.stringify(res, null, 2),
            };
          } catch (err) {
            return {
              success: false,
              output: '',
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
      });
    }

    return tools;
  }
}
