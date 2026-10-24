/**
 * A single message in a conversation.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  /** Tool calls the assistant requested in this message (role: 'assistant' only). */
  tool_calls?: ToolCall[];
}

/**
 * A tool definition that can be provided to the model.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

/**
 * A tool call requested by the model.
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Live streaming progress event emitted by providers (such as `agy --output-format stream-json`).
 */
export interface CompletionProgressEvent {
  type: 'init' | 'thinking' | 'tool_start' | 'tool_done' | 'text_delta' | 'step_done';
  stepIndex?: number;
  model?: string;
  conversationId?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolOutput?: string;
  textDelta?: string;
  accumulatedText?: string;
  durationSeconds?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    thinking_tokens?: number;
    cache_read_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Options for a completion request.
 */
export interface CompletionOptions {
  model?: string; // Override the provider's default model
  temperature?: number;
  max_tokens?: number;
  tools?: ToolDefinition[];
  stop?: string[];
  /** Optional orchestrator session ID for providers that support persistent conversation contexts (e.g. agy --conversation). */
  sessionId?: string;
  /** Optional workspace path to mount into CLI providers (e.g. agy --add-dir). */
  workspacePath?: string;
  /** Optional callback for real-time streaming progress events (tool executions, text deltas, token usage). */
  onProgress?: (event: CompletionProgressEvent) => void;
}

/**
 * The response from a completion request.
 */
export interface CompletionResponse {
  content: string;
  tool_calls?: ToolCall[];
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** Count of native CLI tool calls executed internally during this turn (e.g. by agy). */
  native_tool_calls_count?: number;
  /** Count of internal reasoning/tool steps executed during this turn. */
  native_turns_count?: number;
}

/**
 * Abstract interface that all LLM providers must implement.
 */
export interface LLMProvider {
  readonly name: string;
  
  /**
   * Send a chat completion request.
   */
  complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResponse>;
  
  /**
   * Check if the provider is properly configured and reachable.
   */
  healthCheck(): Promise<boolean>;
}
