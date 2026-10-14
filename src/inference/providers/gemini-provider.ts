import { createLogger } from '../../utils/logger.js';
import type { 
  LLMProvider, 
  ChatMessage, 
  CompletionOptions, 
  CompletionResponse 
} from '../types.js';

const logger = createLogger('provider:gemini');

export class GeminiProvider implements LLMProvider {
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(
    public readonly name: string,
    private apiKey: string,
    private defaultModel: string
  ) {}

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<CompletionResponse> {
    const model = options?.model || this.defaultModel;
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

    let systemInstruction: any = undefined;
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : (msg.role === 'tool' ? 'function' : 'user'),
          parts: [{ text: msg.content }] 
        });
      }
    }

    const payload: any = {
      contents,
      systemInstruction,
      generationConfig: {
        temperature: options?.temperature,
        maxOutputTokens: options?.max_tokens,
        stopSequences: options?.stop,
      }
    };

    if (options?.tools && options.tools.length > 0) {
      payload.tools = [{
        function_declarations: options.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        }))
      }];
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        logger.error(`Gemini HTTP Error: ${response.status} ${response.statusText}`);
        return {
          content: '',
          finish_reason: 'error'
        };
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];

      if (!candidate) {
        return {
          content: '',
          finish_reason: 'error'
        };
      }

      let content = '';
      const tool_calls: any[] = [];
      let finish_reason = 'stop';

      for (const part of candidate.content?.parts || []) {
        if (part.text) content += part.text;
        if (part.functionCall) {
          tool_calls.push({
            id: part.functionCall.name + '_' + Math.random().toString(36).substring(7),
            name: part.functionCall.name,
            arguments: part.functionCall.args,
          });
          finish_reason = 'tool_calls';
        }
      }

      if (candidate.finishReason === 'MAX_TOKENS') finish_reason = 'length';

      return {
        content,
        tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
        finish_reason: finish_reason as any,
        usage: data.usageMetadata ? {
          prompt_tokens: data.usageMetadata.promptTokenCount,
          completion_tokens: data.usageMetadata.candidatesTokenCount,
          total_tokens: data.usageMetadata.totalTokenCount,
        } : undefined,
      };

    } catch (error) {
      logger.error({ error }, 'Error in Gemini completion');
      return {
        content: '',
        finish_reason: 'error'
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/models/${this.defaultModel}?key=${this.apiKey}`;
      const response = await fetch(url);
      return response.ok;
    } catch (error) {
      logger.error({ error }, 'Gemini health check failed');
      return false;
    }
  }
}
