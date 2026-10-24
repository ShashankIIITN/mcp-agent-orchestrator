import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, delimiter, isAbsolute } from 'node:path';
import { createLogger } from '../../utils/logger.js';
import { expandHome } from '../../utils/path-utils.js';
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

interface AgyRawToolCall {
  id?: string;
  name: string;
  arguments?: Record<string, unknown>;
}

interface AgyCliResponse {
  conversation_id?: string;
  status?: string;
  response?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Search the system PATH for an executable, honouring the platform's path
 * delimiter (`:` on Linux/macOS, `;` on Windows). On Windows only real
 * executables (.exe) are considered, since `.cmd`/`.bat` shims cannot be
 * spawned safely without a shell.
 */
function searchPath(binaryName: string): string | undefined {
  const pathDirs = (process.env.PATH || process.env.Path || '')
    .split(delimiter)
    .filter(Boolean);
  const exts = process.platform === 'win32' ? ['', '.exe'] : [''];

  for (const dir of pathDirs) {
    for (const ext of exts) {
      const candidate = join(dir, binaryName + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * Cross-platform discovery for the agy CLI binary (Windows, macOS, Linux).
 */
export function findAgyBinaryPath(customPath?: string): string {
  if (customPath) {
    const expanded = expandHome(customPath);
    if (existsSync(expanded)) return expanded;
  }
  if (process.env.AGY_BIN_PATH) {
    const expanded = expandHome(process.env.AGY_BIN_PATH);
    if (existsSync(expanded)) return expanded;
  }

  // Anything on the system PATH wins (covers Homebrew, snap, npm global, etc.)
  const onPath = searchPath('agy');
  if (onPath) return onPath;

  const candidates: string[] = [];

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    candidates.push(join(localAppData, 'agy', 'bin', 'agy.exe'));
  } else {
    if (process.platform === 'darwin') {
      candidates.push('/opt/homebrew/bin/agy'); // Apple Silicon Homebrew
    }
    candidates.push(
      join(homedir(), '.local', 'bin', 'agy'),
      join(homedir(), '.gemini', 'antigravity-cli', 'bin', 'agy'),
      join(homedir(), '.antigravity', 'bin', 'agy'),
      '/usr/local/bin/agy',
      '/usr/bin/agy',
      '/snap/bin/agy',
    );
  }

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  return 'agy'; // Last resort: let the OS try to resolve it
}

/**
 * Whether the agy binary can actually be located. Unlike a bare `existsSync`,
 * this also resolves bare command names via the system PATH.
 */
export function isAgyAvailable(binaryPath: string = findAgyBinaryPath()): boolean {
  if (isAbsolute(binaryPath) || binaryPath.includes('/') || binaryPath.includes('\\')) {
    return existsSync(binaryPath);
  }
  return searchPath(binaryPath) !== undefined;
}

export class AgyProvider implements LLMProvider {
  readonly name: string;
  private readonly binaryPath: string;
  private readonly defaultModel: string;
  private readonly effort: string;
  private readonly sessionConversations = new Map<string, string>();

  constructor(name = 'agy', options?: AgyProviderOptions) {
    this.name = name;
    this.binaryPath = findAgyBinaryPath(options?.binaryPath);
    this.defaultModel = options?.defaultModel || 'gemini-3.8-flash-high';
    this.effort = options?.effort || 'medium';
  }

  private normalizeModelName(model: string): string {
    const trimmed = model.trim();
    if (trimmed === 'gemini-3.8-flash-lite') {
      return 'gemini-3.8-flash-low';
    }
    return trimmed;
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResponse> {
    const requestedModel = this.normalizeModelName(options?.model || this.defaultModel);
    const existingConversationId = options?.sessionId
      ? this.sessionConversations.get(options.sessionId)
      : undefined;

    const lastMsg = messages[messages.length - 1];
    const prompt = existingConversationId && lastMsg
      ? lastMsg.role === 'tool'
        ? `[TOOL RESULT${lastMsg.tool_call_id ? ` id=${lastMsg.tool_call_id}` : ''}]: ${lastMsg.content}`
        : lastMsg.content
      : this.formatPrompt(messages, options);

    try {
      logger.debug(
        { model: requestedModel, messagesCount: messages.length, resumedConversation: Boolean(existingConversationId) },
        'Executing agy completion',
      );
      let outputJson: AgyCliResponse;
      try {
        outputJson = await this.execAgy(prompt, requestedModel, existingConversationId, options?.workspacePath);
      } catch (primaryErr) {
        const errText = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        // Automatic quota / model availability fallback to gemini-3.8-flash-high
        if (
          requestedModel !== 'gemini-3.8-flash-high' &&
          (errText.includes('RESOURCE_EXHAUSTED') ||
            errText.includes('Individual quota reached') ||
            errText.includes('is not recognized as a known model'))
        ) {
          logger.warn(
            { requestedModel, fallbackModel: 'gemini-3.8-flash-high' },
            'Primary model quota exhausted or unrecognized; falling back to gemini-3.8-flash-high',
          );
          outputJson = await this.execAgy(prompt, 'gemini-3.8-flash-high', existingConversationId, options?.workspacePath);
        } else {
          throw primaryErr;
        }
      }

      if (options?.sessionId && outputJson.conversation_id) {
        this.sessionConversations.set(options.sessionId, outputJson.conversation_id);
      }

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
    return isAgyAvailable(this.binaryPath);
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
        const parsed = JSON.parse(candidate) as { tool_calls?: AgyRawToolCall[] };
        if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
          return parsed.tool_calls.map((tc, idx) => ({
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

  private execAgy(
    prompt: string,
    model: string,
    conversationId?: string,
    workspacePath?: string,
    timeoutMs = 180000,
  ): Promise<AgyCliResponse> {
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

      if (conversationId) {
        args.push('--conversation', conversationId);
      }

      if (workspacePath && existsSync(workspacePath)) {
        args.push('--add-dir', workspacePath);
      }

      const hasEmbeddedEffort =
        model.includes('-low') ||
        model.includes('-medium') ||
        model.includes('-high') ||
        model.includes('-lite') ||
        /\((low|medium|high)\)/i.test(model);

      if (this.effort && !hasEmbeddedEffort) {
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
