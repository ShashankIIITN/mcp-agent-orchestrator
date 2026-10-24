import { createLogger } from '../utils/logger.js';
import type { LLMProvider, ChatMessage, CompletionOptions, ToolDefinition } from '../inference/types.js';
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

    // Save user message if storage provided
    if (storage && jobId) {
      await storage.saveAgentMessage(jobId, this.config.id, {
        role: 'user',
        content: userMessage,
      });
    }

    try {
      // Build tool definitions for the LLM
      const toolDefs: ToolDefinition[] = this.config.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      const options: CompletionOptions = {
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        model: this.config.model,
        sessionId: this.config.id,
        workspacePath: context.workspace_path,
      };

      for (let i = 0; i < this.config.maxIterations; i++) {
        this.iterations++;
        logger.debug({ agent: this.config.name, iteration: i + 1 }, 'Agent iteration');

        const response = await this.config.provider.complete(this.messages, options);

        // Track token usage across this isolated context window
        if (response.usage?.total_tokens) {
          this.contextTokensUsed += response.usage.total_tokens;
        } else {
          const promptChars = this.messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
          const completionChars = response.content?.length ?? 0;
          this.contextTokensUsed += Math.ceil((promptChars + completionChars) / 4);
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
          return response.content;
        }

        // Process tool calls
        // Add assistant message with tool calls indication
        this.messages.push({
          role: 'assistant',
          content: response.content || `Calling ${response.tool_calls.length} tool(s)...`,
          tool_calls: response.tool_calls,
        });

        for (const toolCall of response.tool_calls) {
          this.totalToolCalls++;
          const tool = this.config.tools.find(t => t.name === toolCall.name);

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
