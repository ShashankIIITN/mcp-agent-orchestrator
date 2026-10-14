import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '../utils/logger.js';
import type { McpGatewayConfig } from '../config/schema.js';
import type { McpConnection, McpRemoteTool, McpToolCallResult } from './types.js';

const logger = createLogger('mcp-client-manager');

export class McpClientManager {
  private connections = new Map<string, {
    client: Client;
    transport: StdioClientTransport;
    tools: McpRemoteTool[];
    status: 'connected' | 'disconnected' | 'error';
  }>();

  /**
   * Connect to all configured MCP gateway servers.
   */
  async connectAll(gateways: Record<string, McpGatewayConfig>): Promise<void> {
    for (const [name, config] of Object.entries(gateways)) {
      try {
        await this.connect(name, config);
      } catch (error) {
        logger.error({ name, error }, 'Failed to connect to MCP gateway');
      }
    }
  }

  /**
   * Connect to a single MCP server.
   */
  async connect(name: string, config: McpGatewayConfig): Promise<void> {
    logger.info({ name }, 'Connecting to MCP gateway');
    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env } as Record<string, string>
      });

      const client = new Client(
        { name: 'mcp-agent-orchestrator', version: '0.1.0' },
        { capabilities: {} }
      );

      await client.connect(transport);
      
      const toolsResponse = await client.listTools();
      const tools: McpRemoteTool[] = (toolsResponse.tools || []).map(tool => ({
        qualifiedName: `mcp:${name}:${tool.name}`,
        originalName: tool.name,
        serverName: name,
        description: tool.description || '',
        inputSchema: tool.inputSchema as Record<string, unknown>
      }));

      this.connections.set(name, {
        client,
        transport,
        tools,
        status: 'connected'
      });

      logger.info({ name, toolCount: tools.length }, 'Successfully connected to MCP gateway and discovered tools');
    } catch (error) {
      this.connections.set(name, {
        client: null as any,
        transport: null as any,
        tools: [],
        status: 'error'
      });
      logger.error({ name, error }, 'Error connecting to MCP gateway');
      throw error;
    }
  }

  /**
   * Call a tool on a remote MCP server.
   */
  async callTool(qualifiedName: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    logger.info({ qualifiedName }, 'Calling remote MCP tool');
    
    const parts = qualifiedName.split(':');
    if (parts.length < 3 || parts[0] !== 'mcp') {
      return { success: false, content: 'Invalid tool name format. Expected mcp:server:tool', isError: true };
    }
    
    const serverName = parts[1];
    const originalName = parts.slice(2).join(':');

    const connection = this.connections.get(serverName);
    if (!connection) {
      return { success: false, content: `MCP server ${serverName} not found`, isError: true };
    }
    
    if (connection.status !== 'connected') {
      return { success: false, content: `MCP server ${serverName} is not connected`, isError: true };
    }

    try {
      const response = await connection.client.callTool({
        name: originalName,
        arguments: args
      });

      let content = '';
      if (response.content && Array.isArray(response.content)) {
        for (const item of response.content) {
          if (item.type === 'text' && item.text) {
            content += item.text;
          }
        }
      }

      return {
        success: true,
        content,
        isError: !!response.isError
      };
    } catch (error: any) {
      logger.error({ qualifiedName, error }, 'Error calling remote MCP tool');
      return {
        success: false,
        content: error.message || 'Unknown error occurred while calling tool',
        isError: true
      };
    }
  }

  /**
   * Get all available tools across all connected servers.
   */
  getAllTools(): McpRemoteTool[] {
    const allTools: McpRemoteTool[] = [];
    for (const conn of this.connections.values()) {
      if (conn.status === 'connected') {
        allTools.push(...conn.tools);
      }
    }
    return allTools;
  }

  /**
   * Get connection status for all servers.
   */
  getConnections(): McpConnection[] {
    const result: McpConnection[] = [];
    for (const [name, conn] of this.connections.entries()) {
      result.push({
        name,
        status: conn.status,
        availableTools: conn.tools
      });
    }
    return result;
  }

  /**
   * Disconnect from a specific server.
   */
  async disconnect(name: string): Promise<void> {
    const connection = this.connections.get(name);
    if (connection) {
      try {
        if (connection.status === 'connected' && connection.transport) {
          await connection.transport.close();
        }
      } catch (error) {
        logger.error({ name, error }, 'Error disconnecting from MCP gateway');
      } finally {
        connection.status = 'disconnected';
      }
    }
  }

  /**
   * Disconnect from all servers. Call this on shutdown.
   */
  async disconnectAll(): Promise<void> {
    for (const name of this.connections.keys()) {
      await this.disconnect(name);
    }
  }
}
