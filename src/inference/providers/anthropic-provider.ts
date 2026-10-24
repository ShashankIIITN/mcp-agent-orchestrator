import { createLogger } from '../../utils/logger.js';
import type {
  LLMProvider,
  ChatMessage,
  CompletionOptions,
  CompletionResponse,
  ToolCall
} from '../types.js';

const logger = createLogger('provider:anthropic');

/**
 * Native Anthropic Messages API provider (`/v1/messages`).
 * Anthropic is NOT OpenAI-compatible: different endpoint, `x-api-key` auth,
 * a top-level `system` field, and `tool_use` / `tool_result` content blocks.
 */
export class AnthropicProvider implements LLMProvider {
  private static readonly API_VERSION = '2023-06-01';

  constructor(
    public readonly name: string,
    private apiKey: string,
    private defaultModel: string,
    private baseUrl = 'https://api.anthropic.com'
  ) {}

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResponse> {
    const model = options?.model && options.model !== 'default' ? options.model : this.defaultModel;

    const systemParts: string[] = [];
    const converted: Array<{ role: 'user' | 'assistant'; content: any }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemParts.push(msg.content);
      } else if (msg.role === 'assistant') {
        const blocks: any[] = [];
        const hasCalls = msg.tool_calls && msg.tool_calls.length > 0;
        if (msg.content && !(hasCalls && msg.content.startsWith('Calling '))) {
          blocks.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.tool_calls ?? []) {
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments ?? {} });
        }
        if (blocks.length === 0) blocks.push({ type: 'text', text: '...' });
        converted.push({ role: 'assistant', content: blocks });
      } else if (msg.role === 'tool') {
        const block = { type: 'tool_result', tool_use_id: msg.tool_call_id, content: msg.content };
        const last = converted[converted.length - 1];
        // Consecutive tool results must live in one user turn
        if (last && last.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
          last.content.push(block);
        } else {
          converted.push({ role: 'user', content: [block] });
        }
      } else {
        converted.push({ role: 'user', content: msg.content });
      }
    }

    const payload: any = {
      model,
      max_tokens: options?.max_tokens ?? 4096,
      messages: converted,
    };
    if (systemParts.length > 0) payload.system = systemParts.join('\n\n');
    if (options?.temperature !== undefined) payload.temperature = options.temperature;
    if (options?.stop) payload.stop_sequences = options.stop;
    if (options?.tools && options.tools.length > 0) {
      payload.tools = options.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': AnthropicProvider.API_VERSION,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        logger.error(`Anthropic HTTP Error: ${response.status} ${response.statusText} ${detail.slice(0, 300)}`);
        return { content: '', finish_reason: 'error' };
      }

      const data: any = await response.json();
      let content = '';
      const toolCalls: ToolCall[] = [];

      for (const block of data.content ?? []) {
        if (block.type === 'text') content += block.text;
        if (block.type === 'tool_use') {
          toolCalls.push({ id: block.id, name: block.name, arguments: block.input ?? {} });
        }
      }

      let finish_reason: CompletionResponse['finish_reason'] = 'stop';
      if (toolCalls.length > 0) finish_reason = 'tool_calls';
      else if (data.stop_reason === 'max_tokens') finish_reason = 'length';

      return {
        content,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        finish_reason,
        usage: data.usage
          ? {
              prompt_tokens: data.usage.input_tokens ?? 0,
              completion_tokens: data.usage.output_tokens ?? 0,
              total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
            }
          : undefined,
      };
    } catch (error) {
      logger.error({ error }, 'Error in Anthropic completion');
      return { content: '', finish_reason: 'error' };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': AnthropicProvider.API_VERSION,
        },
      });
      return response.ok;
    } catch (error) {
      logger.error({ error }, 'Anthropic health check failed');
      return false;
    }
  }
}
