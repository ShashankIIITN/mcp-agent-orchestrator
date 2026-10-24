import { createLogger } from '../utils/logger.js';
import { eventBus } from '../dashboard/events.js';
import type {
  LLMProvider,
  ChatMessage,
  CompletionOptions,
  CompletionProgressEvent,
  ToolDefinition,
} from '../inference/types.js';
import type { SubagentTool, ToolContext } from '../builtin-tools/types.js';
import type { StorageAdapter } from '../storage/types.js';

const logger = createLogger('agent-runtime');

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  provider: LLMProvider;
  tools: SubagentTool[];
  maxIterations: number; // safety limit on tool-use loops
  model?: string;
}

export interface AgentState {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'running' | 'completed' | 'error' | 'paused' | 'terminated';
  messages: ChatMessage[];
  totalToolCalls: number;
  iterations: number;
  lastError?: string;
  model?: string;
  /** Total tokens processed across all turns in this isolated context window */
  contextTokensUsed: number;
  /** Tokens absorbed inside this isolated context window that did NOT bloat the parent session */
  contextFirewallSavedTokens: number;
}

export class AgentRuntime {
  private config: AgentConfig;
  private messages: ChatMessage[] = [];
  private status: AgentState['status'] = 'idle';
  private totalToolCalls = 0;
  private iterations = 0;
  private lastError?: string;
  private contextTokensUsed = 0;
  private finalOutputTokens = 0;

  constructor(config: AgentConfig) {
    this.config = config;
    // Initialize with system prompt
    this.messages.push({ role: 'system', content: config.systemPrompt });
  }

  /**
   * Run the agent with a user message and return the final assistant response.
   * This implements a ReAct loop:
   * 1. Send messages to LLM
   * 2. If LLM returns tool_calls, execute them and add results
   * 3. Repeat until LLM returns a text response (no tool calls) or max iterations hit
   */
  async run(
    userMessage: string,
    context: ToolContext,
    storage?: StorageAdapter,
    jobId?: string,
  ): Promise<string> {
    this.status = 'running';
    this.messages.push({ role: 'user', content: userMessage });
    const streamTargetId = jobId ?? this.config.id;

    // Save user message if storage provided
    if (storage && jobId) {
      await storage.saveAgentMessage(jobId, this.config.id, {
        role: 'user',
        content: userMessage,
      });
    }

    eventBus.emitJobEvent('session_stream', streamTargetId, {
      sessionId: this.config.id,
      agentName: this.config.name,
      stepType: 'turn_start',
      statusText: `🚀 Starting turn for ${this.config.name} (${this.config.model || 'default'})...`,
      iterations: this.iterations,
      totalToolCalls: this.totalToolCalls,
      contextTokensUsed: this.contextTokensUsed,
    });

    try {
      // Build tool definitions for the LLM
      const toolDefs: ToolDefinition[] = this.config.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      for (let i = 0; i < this.config.maxIterations; i++) {
        this.iterations++;
        logger.debug({ agent: this.config.name, iteration: i + 1 }, 'Agent iteration');

        let streamedStepTokens = 0;
        let streamedNativeTools = 0;
        let streamedNativeTurns = 0;

        const summarizeArgs = (args?: Record<string, unknown>): string => {
          if (!args) return '';
          const candidate =
            args.Path ??
            args.path ??
            args.CommandLine ??
            args.command ??
            args.SearchPath ??
            args.Query ??
            args.url ??
            args.target_session_id;
          if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim().slice(0, 90);
          }
          const raw = JSON.stringify(args);
          return raw === '{}' ? '' : raw.slice(0, 90);
        };

        const options: CompletionOptions = {
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          model: this.config.model,
          sessionId: this.config.id,
          workspacePath: context.workspace_path,
          safetyMode: context.safety_mode,
          allowedToolNames: this.config.tools.map((t) => t.name),
          onProgress: (ev: CompletionProgressEvent) => {
            if (ev.type === 'init') {
              eventBus.emitJobEvent('session_stream', streamTargetId, {
                sessionId: this.config.id,
                agentName: this.config.name,
                stepType: 'init',
                model: ev.model,
                conversationId: ev.conversationId,
                statusText: `⚡ Connected to ${ev.model || this.config.model || 'provider'} (conversation ${ev.conversationId ? ev.conversationId.slice(0, 8) : 'ready'})`,
                iterations: this.iterations,
                totalToolCalls: this.totalToolCalls,
                contextTokensUsed: this.contextTokensUsed,
              });
              return;
            }

            if (ev.type === 'tool_start') {
              const summary = summarizeArgs(ev.toolArgs);
              eventBus.emitJobEvent('session_stream', streamTargetId, {
                sessionId: this.config.id,
                agentName: this.config.name,
                stepType: 'tool_start',
                stepIndex: ev.stepIndex,
                toolName: ev.toolName,
                toolSummary: summary,
                statusText: `🔧 Executing ${ev.toolName}${summary ? `: ${summary}` : ''}...`,
                iterations: this.iterations,
                totalToolCalls: this.totalToolCalls,
                contextTokensUsed: this.contextTokensUsed,
              });
              return;
            }

            if (ev.type === 'tool_done') {
              streamedNativeTools++;
              this.totalToolCalls++;
              const summary = summarizeArgs(ev.toolArgs);
              const dur = typeof ev.durationSeconds === 'number' ? ` (${ev.durationSeconds.toFixed(2)}s)` : '';
              const outPreview = ev.toolOutput ? ev.toolOutput.slice(0, 400) : 'Completed';
              const toolMsgContent = `[Native Tool: ${ev.toolName}${summary ? ` → ${summary}` : ''}${dur}]\n${outPreview}`;

              if (storage && jobId) {
                void storage.saveAgentMessage(jobId, this.config.id, {
                  role: 'tool',
                  content: toolMsgContent,
                  tool_calls: [
                    {
                      id: `native_${Date.now()}_${this.totalToolCalls}`,
                      name: ev.toolName || 'tool',
                      arguments: ev.toolArgs || {},
                    },
                  ],
                });
                void storage.updateSessionStatus(this.config.id, 'running', {
                  total_tool_calls: this.totalToolCalls,
                  iterations: this.iterations,
                });
              }

              eventBus.emitJobEvent('session_stream', streamTargetId, {
                sessionId: this.config.id,
                agentName: this.config.name,
                stepType: 'tool_done',
                stepIndex: ev.stepIndex,
                toolName: ev.toolName,
                toolSummary: summary,
                durationSeconds: ev.durationSeconds,
                statusText: `✓ Finished ${ev.toolName}${summary ? ` (${summary})` : ''}${dur}`,
                iterations: this.iterations,
                totalToolCalls: this.totalToolCalls,
                contextTokensUsed: this.contextTokensUsed,
              });
              return;
            }

            if (ev.type === 'thinking') {
              streamedNativeTurns++;
              if (streamedNativeTurns > 1) {
                this.iterations++;
              }
              const stepTok = ev.usage?.total_tokens || 0;
              if (stepTok > 0) {
                streamedStepTokens += stepTok;
                this.contextTokensUsed += stepTok;
              }
              if (storage && jobId) {
                void storage.updateSessionStatus(this.config.id, 'running', {
                  total_tool_calls: this.totalToolCalls,
                  iterations: this.iterations,
                });
              }
              eventBus.emitJobEvent('session_stream', streamTargetId, {
                sessionId: this.config.id,
                agentName: this.config.name,
                stepType: 'thinking',
                stepIndex: ev.stepIndex,
                durationSeconds: ev.durationSeconds,
                usage: ev.usage,
                accumulatedText: ev.accumulatedText,
                statusText: `🧠 Completed reasoning step #${ev.stepIndex ?? this.iterations} (${stepTok.toLocaleString()} tok)`,
                iterations: this.iterations,
                totalToolCalls: this.totalToolCalls,
                contextTokensUsed: this.contextTokensUsed,
              });
              return;
            }

            if (ev.type === 'text_delta') {
              eventBus.emitJobEvent('session_stream', streamTargetId, {
                sessionId: this.config.id,
                agentName: this.config.name,
                stepType: 'text_delta',
                stepIndex: ev.stepIndex,
                textDelta: ev.textDelta,
                accumulatedText: ev.accumulatedText,
                statusText: `✍️ Streaming response (${(ev.accumulatedText || '').length} chars)...`,
                iterations: this.iterations,
                totalToolCalls: this.totalToolCalls,
                contextTokensUsed: this.contextTokensUsed,
              });
            }
          },
        };

        const response = await this.config.provider.complete(this.messages, options);

        // Track token usage across this isolated context window (avoid double-counting streamed tokens)
        if (streamedStepTokens === 0) {
          if (response.usage?.total_tokens) {
            this.contextTokensUsed += response.usage.total_tokens;
          } else {
            const promptChars = this.messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
            const completionChars = response.content?.length ?? 0;
            this.contextTokensUsed += Math.ceil((promptChars + completionChars) / 4);
          }
        }

        // If provider returned an error finish_reason, record it as error state
        if (response.finish_reason === 'error') {
          this.messages.push({ role: 'assistant', content: response.content });
          this.lastError = response.content;
          if (storage && jobId) {
            await storage.saveAgentMessage(jobId, this.config.id, {
              role: 'assistant',
              content: response.content,
            });
          }
          this.status = 'error';
          eventBus.emitJobEvent('session_stream', streamTargetId, {
            sessionId: this.config.id,
            agentName: this.config.name,
            stepType: 'error',
            statusText: `❌ ${response.content}`,
            iterations: this.iterations,
            totalToolCalls: this.totalToolCalls,
            contextTokensUsed: this.contextTokensUsed,
          });
          return response.content;
        }

        // If no tool calls, we have our final answer
        if (!response.tool_calls || response.tool_calls.length === 0) {
          this.messages.push({ role: 'assistant', content: response.content });
          this.finalOutputTokens += Math.ceil((response.content?.length ?? 0) / 4);

          if (storage && jobId) {
            await storage.saveAgentMessage(jobId, this.config.id, {
              role: 'assistant',
              content: response.content,
            });
          }

          this.status = 'completed';
          eventBus.emitJobEvent('session_stream', streamTargetId, {
            sessionId: this.config.id,
            agentName: this.config.name,
            stepType: 'turn_complete',
            accumulatedText: response.content,
            statusText: `✓ Turn completed (${this.contextTokensUsed.toLocaleString()} context tokens, ${this.totalToolCalls} tools)`,
            iterations: this.iterations,
            totalToolCalls: this.totalToolCalls,
            contextTokensUsed: this.contextTokensUsed,
          });
          return response.content;
        }

        // Process built-in / mesh tool calls returned as JSON tool_calls
        this.messages.push({
          role: 'assistant',
          content: response.content || `Calling ${response.tool_calls.length} tool(s)...`,
          tool_calls: response.tool_calls,
        });

        for (const toolCall of response.tool_calls) {
          this.totalToolCalls++;
          const tool = this.config.tools.find(t => t.name === toolCall.name);
          const argSummary = summarizeArgs(toolCall.arguments);

          eventBus.emitJobEvent('session_stream', streamTargetId, {
            sessionId: this.config.id,
            agentName: this.config.name,
            stepType: 'tool_start',
            toolName: toolCall.name,
            toolSummary: argSummary,
            statusText: `🔧 Executing ${toolCall.name}${argSummary ? `: ${argSummary}` : ''}...`,
            iterations: this.iterations,
            totalToolCalls: this.totalToolCalls,
            contextTokensUsed: this.contextTokensUsed,
          });

          let result: string;
          if (!tool) {
            result = `Error: Tool "${toolCall.name}" not found`;
            logger.warn({ tool: toolCall.name, agent: this.config.name }, 'Tool not found');
          } else {
            try {
              const toolResult = await tool.execute(toolCall.arguments, context);
              result = toolResult.success
                ? toolResult.output
                : `Error: ${toolResult.error ?? toolResult.output}`;
            } catch (err) {
              result = `Error executing tool: ${err instanceof Error ? err.message : String(err)}`;
              logger.error({ error: err, tool: toolCall.name }, 'Tool execution failed');
            }
          }

          // Add tool result as a tool message
          this.messages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          });

          if (storage && jobId) {
            await storage.saveAgentMessage(jobId, this.config.id, {
              role: 'tool',
              content: result,
              tool_calls: [toolCall],
            });
          }

          eventBus.emitJobEvent('session_stream', streamTargetId, {
            sessionId: this.config.id,
            agentName: this.config.name,
            stepType: 'tool_done',
            toolName: toolCall.name,
            toolSummary: argSummary,
            statusText: `✓ Finished ${toolCall.name}${argSummary ? ` (${argSummary})` : ''}`,
            iterations: this.iterations,
            totalToolCalls: this.totalToolCalls,
            contextTokensUsed: this.contextTokensUsed,
          });
        }
      }

      // If we hit max iterations, return last content
      this.status = 'completed';
      const lastContent = this.messages.filter(m => m.role === 'assistant').pop()?.content ?? 'Max iterations reached without final response.';
      return lastContent;

    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);
      logger.error({ error, agent: this.config.name }, 'Agent runtime error');
      throw error;
    }
  }

  getState(): AgentState {
    const saved = Math.max(0, this.contextTokensUsed - this.finalOutputTokens);
    return {
      id: this.config.id,
      name: this.config.name,
      role: this.config.role,
      status: this.status,
      messages: [...this.messages],
      totalToolCalls: this.totalToolCalls,
      iterations: this.iterations,
      lastError: this.lastError,
      model: this.config.model,
      contextTokensUsed: this.contextTokensUsed,
      contextFirewallSavedTokens: saved,
    };
  }

  setStatus(status: AgentState['status']): void {
    this.status = status;
  }

  getStatus(): AgentState['status'] {
    return this.status;
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Restore prior conversation history (e.g. when resurrecting a persisted session from SQLite).
   */
  loadMessages(history: ChatMessage[]): void {
    this.messages = [
      { role: 'system', content: this.config.systemPrompt },
      ...history.filter(m => m.role !== 'system'),
    ];
  }

  reset(): void {
    this.messages = [{ role: 'system', content: this.config.systemPrompt }];
    this.status = 'idle';
    this.totalToolCalls = 0;
    this.iterations = 0;
    this.lastError = undefined;
    this.contextTokensUsed = 0;
    this.finalOutputTokens = 0;
  }
}
