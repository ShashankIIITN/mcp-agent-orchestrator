import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../../utils/logger.js';
import type {
  LLMProvider,
  ChatMessage,
  CompletionOptions,
  CompletionResponse,
  ToolCall,
} from '../types.js';

const logger = createLogger('provider:agy');

export interface AgyProviderOptions {
  binaryPath?: string;
  defaultModel?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

/**
 * Cross-platform discovery for the agy CLI binary.
 */
export function findAgyBinaryPath(customPath?: string): string {
  if (customPath && existsSync(customPath)) {
    return customPath;
  }
  if (process.env.AGY_BIN_PATH && existsSync(process.env.AGY_BIN_PATH)) {
    return process.env.AGY_BIN_PATH;
  }

  // Windows standard paths
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    const winPath = join(localAppData, 'agy', 'bin', 'agy.exe');
    if (existsSync(winPath)) return winPath;
  }

  // Unix / macOS paths
  const unixPaths = [
    join(homedir(), '.local', 'bin', 'agy'),
    join(homedir(), '.gemini', 'antigravity-cli', 'bin', 'agy'),
    '/usr/local/bin/agy',
    '/usr/bin/agy',
  ];
  for (const p of unixPaths) {
    if (existsSync(p)) return p;
  }

  return 'agy'; // Try system PATH
}

export class AgyProvider implements LLMProvider {
  readonly name: string;
  private readonly binaryPath: string;
  private readonly defaultModel: string;
  private readonly effort: string;

  constructor(name = 'agy', options?: AgyProviderOptions) {
    this.name = name;
    this.binaryPath = findAgyBinaryPath(options?.binaryPath);
    this.defaultModel = options?.defaultModel || 'gemini-3.8-flash-high';
    this.effort = options?.effort || 'medium';
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResponse> {
    const model = options?.model || this.defaultModel;
    const prompt = this.formatPrompt(messages, options);

    try {
      logger.debug({ model, messagesCount: messages.length }, 'Executing agy completion');
      const outputJson = await this.execAgy(prompt, model);

      if (outputJson.status !== 'SUCCESS') {
        logger.error({ status: outputJson.status }, 'agy completion returned non-success');
        return {
          content: outputJson.response || 'Error from agy CLI',
          finish_reason: 'error',
        };
      }

      const rawResponse = outputJson.response ?? '';
      const toolCalls = this.extractToolCalls(rawResponse);

      return {
        content: toolCalls ? '' : rawResponse.trim(),
        tool_calls: toolCalls,
        finish_reason: toolCalls ? 'tool_calls' : 'stop',
        usage: outputJson.usage
          ? {
              prompt_tokens: outputJson.usage.input_tokens || 0,
              completion_tokens: outputJson.usage.output_tokens || 0,
              total_tokens: outputJson.usage.total_tokens || 0,
            }
          : undefined,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to complete via agy');
      return {
        content: `Error invoking agy: ${error instanceof Error ? error.message : String(error)}`,
        finish_reason: 'error',
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    return existsSync(this.binaryPath);
  }

  private formatPrompt(messages: ChatMessage[], options?: CompletionOptions): string {
    let formatted = '';

    if (options?.tools && options.tools.length > 0) {
      formatted += `[SYSTEM INSTRUCTION]\nYou have access to the following tools:\n`;
      for (const t of options.tools) {
        formatted += `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters)}\n`;
      }
      formatted += `\nIf you need to call a tool to answer the user's request, respond ONLY with a JSON codeblock:\n\`\`\`json\n{\n  "tool_calls": [\n    {\n      "name": "tool_name",\n      "arguments": { ... }\n    }\n  ]\n}\n\`\`\`\nDo not add conversational preamble if you are calling a tool. If no tool is needed, respond with normal text.\n[/SYSTEM INSTRUCTION]\n\n`;
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        formatted += `[SYSTEM]: ${msg.content}\n\n`;
      } else if (msg.role === 'user') {
        formatted += `[USER]: ${msg.content}\n\n`;
      } else if (msg.role === 'assistant') {
        formatted += `[ASSISTANT]: ${msg.content}\n\n`;
      } else if (msg.role === 'tool') {
        formatted += `[TOOL RESULT${msg.tool_call_id ? ` id=${msg.tool_call_id}` : ''}]: ${msg.content}\n\n`;
      }
    }

    formatted += `[ASSISTANT]:`;
    return formatted;
  }

  private extractToolCalls(text: string): ToolCall[] | undefined {
    // Check if output contains a tool call json block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const candidate = jsonMatch ? jsonMatch[1].trim() : text.trim();

    try {
      if (candidate.startsWith('{') && candidate.endsWith('}')) {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
          return parsed.tool_calls.map((tc: any, idx: number) => ({
            id: tc.id || `call_${Date.now()}_${idx}`,
            name: tc.name,
            arguments: tc.arguments || {},
          }));
        }
      }
    } catch {
      // Not a valid tool call JSON, treat as text
    }

    return undefined;
  }

  private execAgy(prompt: string, model: string, timeoutMs = 180000): Promise<any> {
    return new Promise((resolve, reject) => {
      const args = [
        '-p',
        prompt,
        '--model',
        model,
        '--output-format',
        'json',
        '--dangerously-skip-permissions',
      ];

      if (this.effort && !model.includes('-low') && !model.includes('-medium') && !model.includes('-high')) {
        args.push('--effort', this.effort);
      }

      const proc = spawn(this.binaryPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`agy execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          return reject(new Error(`agy exited with code ${code}: ${stderr || stdout}`));
        }

        try {
          // stdout may contain prompt echoing or profile loading before JSON, find first '{'
          const firstBrace = stdout.indexOf('{');
          if (firstBrace === -1) {
            return reject(new Error(`Failed to parse agy JSON output: ${stdout}`));
          }
          const jsonStr = stdout.slice(firstBrace);
          const parsed = JSON.parse(jsonStr);
          resolve(parsed);
        } catch (err) {
          reject(new Error(`JSON parse error on agy output: ${err} - raw: ${stdout}`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
