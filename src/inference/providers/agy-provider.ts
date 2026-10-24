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
  CompletionProgressEvent,
  ToolCall,
} from '../types.js';

const logger = createLogger('provider:agy');

/**
 * Built-in orchestrator tools that `agy` already provides natively at much higher speed
 * (`read_file`/`view_file`, `list_dir`, `find_by_name`, `grep_search`, `run_command`, `write_to_file`, etc.).
 * Omitting these from the prompt's synthetic JSON tool-call block avoids multi-process cold-start loops.
 */
const NATIVE_EQUIVALENT_TOOLS = new Set([
  'fs_read',
  'fs_write',
  'fs_delete',
  'fs_list',
  'shell_exec',
  'web_fetch',
]);

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
  native_tool_calls_count?: number;
  native_turns_count?: number;
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
        outputJson = await this.execAgy(
          prompt,
          requestedModel,
          existingConversationId,
          options?.workspacePath,
          options?.onProgress,
        );
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
          outputJson = await this.execAgy(
            prompt,
            'gemini-3.8-flash-high',
            existingConversationId,
            options?.workspacePath,
            options?.onProgress,
          );
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
        native_tool_calls_count: outputJson.native_tool_calls_count,
        native_turns_count: outputJson.native_turns_count,
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

    // Only expose non-builtin tools (such as mesh_* inter-session tools) as JSON codeblock tools.
    // Built-in file/shell tools (fs_read, fs_list, shell_exec, etc.) are executed natively by agy
    // inside a single CLI session at 100x higher speed.
    const customTools = (options?.tools ?? []).filter((t) => !NATIVE_EQUIVALENT_TOOLS.has(t.name));

    formatted += `[ORCHESTRATOR WORKER CONTEXT]\n`;
    formatted += `- You are executing inside an isolated specialist session managed by mcp-agent-orchestrator.\n`;
    formatted += `- Use your built-in file and search tools (read_file, view_file, list_dir, find_by_name, grep_search) directly for workspace inspection. Avoid recursively listing node_modules/, dist/, or .git/.\n`;
    formatted += `- Do NOT call external mcp_agent-orchestrator_* MCP server tools from inside this worker session unless explicitly instructed.\n`;

    if (customTools.length > 0) {
      formatted += `- Optional inter-session mesh tools available ONLY if you explicitly need to message or spawn another orchestrator session:\n`;
      for (const t of customTools) {
        formatted += `  * ${t.name}: ${t.description} (Params: ${JSON.stringify(t.parameters)})\n`;
      }
      formatted += `  If (and only if) you need to invoke one of these mesh_* tools, respond ONLY with a JSON codeblock: \`\`\`json\n{"tool_calls":[{"name":"mesh_...","arguments":{...}}]}\n\`\`\`\n`;
    }
    formatted += `[/ORCHESTRATOR WORKER CONTEXT]\n\n`;

    for (const msg of messages) {
      if (msg.role === 'system') {
        formatted += `[SPECIALIST ROLE & SYSTEM PROMPT]:\n${msg.content}\n\n`;
      } else if (msg.role === 'user') {
        formatted += `[USER TASK]:\n${msg.content}\n\n`;
      } else if (msg.role === 'assistant') {
        formatted += `[ASSISTANT]:\n${msg.content}\n\n`;
      } else if (msg.role === 'tool') {
        formatted += `[TOOL RESULT${msg.tool_call_id ? ` id=${msg.tool_call_id}` : ''}]:\n${msg.content}\n\n`;
      }
    }

    formatted += `Provide your complete, thorough response below:`;
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
    onProgress?: (event: CompletionProgressEvent) => void,
    inactivityTimeoutMs = 180000,
    maxTotalTimeoutMs = 600000,
  ): Promise<AgyCliResponse> {
    return new Promise((resolve, reject) => {
      const args = [
        '-p',
        prompt,
        '--model',
        model,
        '--output-format',
        'stream-json',
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
        env: {
          ...process.env,
          MCP_AGENT_ORCHESTRATOR_WORKER: '1',
        },
      });

      let stdout = '';
      let stderr = '';
      let lineBuffer = '';
      let streamedText = '';
      let resolvedConversationId = conversationId;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let nativeToolCallsCount = 0;
      let nativeTurnsCount = 0;
      let finalResult: AgyCliResponse | null = null;

      let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
      const resetInactivityTimer = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          proc.kill();
          reject(new Error(`agy execution timed out after ${inactivityTimeoutMs}ms of inactivity`));
        }, inactivityTimeoutMs);
      };
      resetInactivityTimer();

      const maxTimer = setTimeout(() => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        proc.kill();
        reject(new Error(`agy execution exceeded maximum limit of ${maxTotalTimeoutMs}ms`));
      }, maxTotalTimeoutMs);

      const handleStreamLine = (rawLine: string) => {
        const trimmed = rawLine.trim();
        if (!trimmed.startsWith('{')) return;

        try {
          const parsed = JSON.parse(trimmed) as Record<string, any>;

          // 1. Stream-JSON `init` event
          if (parsed.event === 'init') {
            if (typeof parsed.conversation_id === 'string') {
              resolvedConversationId = parsed.conversation_id;
            }
            onProgress?.({
              type: 'init',
              conversationId: resolvedConversationId,
              model: parsed.init?.model || model,
            });
            return;
          }

          // 2. Stream-JSON `step_update` event
          if (parsed.event === 'step_update' && parsed.step_update) {
            const su = parsed.step_update as Record<string, any>;
            if (typeof su.conversation_id === 'string') {
              resolvedConversationId = su.conversation_id;
            }

            if (su.step_type === 'agent_response') {
              if (typeof su.text_delta === 'string' && su.text_delta.length > 0) {
                streamedText += su.text_delta;
                onProgress?.({
                  type: 'text_delta',
                  stepIndex: su.step_index,
                  conversationId: resolvedConversationId,
                  textDelta: su.text_delta,
                  accumulatedText: streamedText,
                });
              }

              if (su.state === 'DONE') {
                nativeTurnsCount++;
                const u = su.usage || {};
                const stepIn = (u.input_tokens || 0) + (u.cache_read_tokens || 0);
                const stepOut = (u.output_tokens || 0) + (u.thinking_tokens || 0);
                totalInputTokens += stepIn;
                totalOutputTokens += stepOut;

                onProgress?.({
                  type: 'thinking',
                  stepIndex: su.step_index,
                  conversationId: resolvedConversationId,
                  durationSeconds: su.duration_seconds,
                  accumulatedText: streamedText,
                  usage: {
                    input_tokens: u.input_tokens || 0,
                    output_tokens: u.output_tokens || 0,
                    thinking_tokens: u.thinking_tokens || 0,
                    cache_read_tokens: u.cache_read_tokens || 0,
                    total_tokens: stepIn + stepOut,
                  },
                });
              }
            } else if (su.step_type === 'tool') {
              const toolName = su.tool_name || su.tool_info?.name || 'tool';
              const toolArgs = su.tool_info?.parameters || {};
              if (su.state === 'ACTIVE') {
                onProgress?.({
                  type: 'tool_start',
                  stepIndex: su.step_index,
                  conversationId: resolvedConversationId,
                  toolName,
                  toolArgs,
                });
              } else if (su.state === 'DONE') {
                nativeToolCallsCount++;
                onProgress?.({
                  type: 'tool_done',
                  stepIndex: su.step_index,
                  conversationId: resolvedConversationId,
                  toolName,
                  toolArgs,
                  toolOutput: typeof su.tool_info?.output === 'string' ? su.tool_info.output : undefined,
                  durationSeconds: su.duration_seconds,
                });
              }
            }
            return;
          }

          // 3. Stream-JSON `result` event
          if (parsed.event === 'result' && parsed.result) {
            const resObj = parsed.result as Record<string, any>;
            if (typeof resObj.conversation_id === 'string') {
              resolvedConversationId = resObj.conversation_id;
            }
            finalResult = {
              conversation_id: resolvedConversationId,
              status: resObj.status || 'SUCCESS',
              response: typeof resObj.response === 'string' ? resObj.response : streamedText,
              usage: resObj.usage,
            };
            return;
          }

          // 4. Fallback for single-JSON output mode
          if (typeof parsed.status === 'string' && ('response' in parsed || 'conversation_id' in parsed)) {
            finalResult = parsed as unknown as AgyCliResponse;
          }
        } catch {
          // Ignore partial or non-JSON lines
        }
      };

      proc.stdout.on('data', (chunk) => {
        resetInactivityTimer();
        const text = chunk.toString();
        stdout += text;
        lineBuffer += text;

        let newlineIdx = lineBuffer.indexOf('\n');
        while (newlineIdx !== -1) {
          const line = lineBuffer.slice(0, newlineIdx);
          lineBuffer = lineBuffer.slice(newlineIdx + 1);
          handleStreamLine(line);
          newlineIdx = lineBuffer.indexOf('\n');
        }
      });

      proc.stderr.on('data', (chunk) => {
        resetInactivityTimer();
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        clearTimeout(maxTimer);

        if (lineBuffer.trim()) {
          handleStreamLine(lineBuffer);
          lineBuffer = '';
        }

        if (code !== 0 && !finalResult && !streamedText.trim()) {
          return reject(new Error(`agy exited with code ${code}: ${stderr || stdout}`));
        }

        if (finalResult) {
          const combinedIn = totalInputTokens || finalResult.usage?.input_tokens || 0;
          const combinedOut = totalOutputTokens || finalResult.usage?.output_tokens || 0;
          resolve({
            conversation_id: finalResult.conversation_id || resolvedConversationId,
            status: finalResult.status || 'SUCCESS',
            response: finalResult.response || streamedText,
            usage: {
              input_tokens: combinedIn,
              output_tokens: combinedOut,
              total_tokens: combinedIn + combinedOut || finalResult.usage?.total_tokens || 0,
            },
            native_tool_calls_count: nativeToolCallsCount,
            native_turns_count: nativeTurnsCount,
          });
          return;
        }

        if (streamedText.trim()) {
          resolve({
            conversation_id: resolvedConversationId,
            status: 'SUCCESS',
            response: streamedText,
            usage: {
              input_tokens: totalInputTokens,
              output_tokens: totalOutputTokens,
              total_tokens: totalInputTokens + totalOutputTokens,
            },
            native_tool_calls_count: nativeToolCallsCount,
            native_turns_count: nativeTurnsCount,
          });
          return;
        }

        try {
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
        if (inactivityTimer) clearTimeout(inactivityTimer);
        clearTimeout(maxTimer);
        reject(err);
      });
    });
  }
}
