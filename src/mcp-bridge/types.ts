/**
 * Represents a connected external MCP server.
 */
export interface McpConnection {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  availableTools: McpRemoteTool[];
}

/**
 * A tool available on a remote MCP server.
 */
export interface McpRemoteTool {
  /** Prefixed name: e.g. "mcp:github:create_issue" */
  qualifiedName: string;
  /** Original tool name on the remote server */
  originalName: string;
  /** Which MCP server this belongs to */
  serverName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Result from calling a remote MCP tool.
 */
export interface McpToolCallResult {
  success: boolean;
  content: string;
  isError: boolean;
}
