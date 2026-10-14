/**
 * A single message in a conversation.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
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
 * Options for a completion request.
 */
export interface CompletionOptions {
  model?: string; // Override the provider's default model
  temperature?: number;
  max_tokens?: number;
  tools?: ToolDefinition[];
  stop?: string[];
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
