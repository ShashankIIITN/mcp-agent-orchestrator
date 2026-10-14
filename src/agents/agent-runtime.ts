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
}

export class AgentRuntime {
  private config: AgentConfig;
  private messages: ChatMessage[] = [];
  private status: AgentState['status'] = 'idle';
  private totalToolCalls = 0;
  private iterations = 0;
  private lastError?: string;

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
      };

      for (let i = 0; i < this.config.maxIterations; i++) {
        this.iterations++;
        logger.debug({ agent: this.config.name, iteration: i + 1 }, 'Agent iteration');

        const response = await this.config.provider.complete(this.messages, options);

        // If no tool calls, we have our final answer
        if (!response.tool_calls || response.tool_calls.length === 0) {
          this.messages.push({ role: 'assistant', content: response.content });

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

  reset(): void {
    this.messages = [{ role: 'system', content: this.config.systemPrompt }];
    this.status = 'idle';
    this.totalToolCalls = 0;
    this.iterations = 0;
    this.lastError = undefined;
  }
}
