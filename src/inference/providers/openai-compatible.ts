import { createLogger } from '../../utils/logger.js';
import type { 
  LLMProvider, 
  ChatMessage, 
  CompletionOptions, 
  CompletionResponse 
} from '../types.js';

const logger = createLogger('provider:openai-compatible');

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    public readonly name: string,
    private baseUrl: string,
    private apiKey: string,
    private defaultModel: string
  ) {}

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResponse> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const model = options?.model || this.defaultModel;

    const payload: any = {
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {})
      })),
      temperature: options?.temperature,
      max_tokens: options?.max_tokens,
      stop: options?.stop,
    };

    if (options?.tools && options.tools.length > 0) {
      payload.tools = options.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        }
      }));
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        logger.error(`HTTP Error: ${response.status} ${response.statusText}`);
        return {
          content: '',
          finish_reason: 'error'
        };
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      if (!choice) {
        return {
          content: '',
          finish_reason: 'error'
        };
      }

      const tool_calls = choice.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}'),
      }));

      return {
        content: choice.message?.content || '',
        tool_calls: tool_calls,
        finish_reason: choice.finish_reason as any,
        usage: data.usage ? {
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens,
        } : undefined,
      };

    } catch (error) {
      logger.error({ error }, 'Error in OpenAI completion');
      return {
        content: '',
        finish_reason: 'error'
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/v1/models`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        }
      });
      return response.ok;
    } catch (error) {
      logger.error({ error }, 'Health check failed');
      return false;
    }
  }
}
