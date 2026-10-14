import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Dispatcher } from '../orchestrator/dispatcher.js';
import type { StorageAdapter } from '../storage/types.js';
import type { ToolContext } from '../builtin-tools/types.js';

export function registerInteractiveTools(
  server: McpServer,
  dispatcher: Dispatcher,
  storage: StorageAdapter,
): void {
  const pool = dispatcher.getAgentPool();
  const providerReg = dispatcher.getProviderRegistry();
  const toolReg = dispatcher.getToolRegistry();

  // spawn_agent
  server.tool(
    'spawn_agent',
    'Spawn a new interactive agent with a specific role and system prompt.',
    {
      name: z.string().describe('Human-readable name for the agent'),
      role: z.string().describe('Role description (e.g. "Senior Engineer", "Researcher")'),
      system_prompt: z.string().describe('System prompt defining the agent behavior'),
      provider: z.string().optional().describe('Which inference provider to use (from config)'),
      allowed_tools: z.array(z.string()).optional().describe('Tool names the agent can use (default: all)'),
    },
    async ({ name, role, system_prompt, provider, allowed_tools }) => {
      try {
        const providerNames = providerReg.list();
        if (providerNames.length === 0) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No providers configured' }) }] };
        }
        const llmProvider = providerReg.getOrThrow(provider ?? providerNames[0]);
        const tools = allowed_tools ? toolReg.getByNames(allowed_tools) : toolReg.list();

        const agentId = pool.spawn({ name, role, systemPrompt: system_prompt, provider: llmProvider, tools });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ agent_id: agentId, name, role, status: 'idle' }, null, 2) }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }] };
      }
    },
  );

  // send_agent_message
  server.tool(
    'send_agent_message',
    'Send a message to a spawned agent and get its response. The agent will use its tools autonomously to complete the task.',
    {
      agent_id: z.string().describe('ID of the agent to message'),
      message: z.string().describe('Message/task to send to the agent'),
      workspace_path: z.string().optional().describe('Workspace path for tool execution').default('./'),
      safety_mode: z.enum(['autonomous', 'semi-autonomous', 'safe']).optional().describe('Safety mode').default('semi-autonomous'),
    },
    async ({ agent_id, message, workspace_path, safety_mode }) => {
      try {
        const agent = pool.getOrThrow(agent_id);
        const context: ToolContext = {
          workspace_path: workspace_path ?? './',
          safety_mode: safety_mode ?? 'semi-autonomous',
          job_id: `interactive-${agent_id}`,
          agent_id,
        };
        const response = await agent.run(message, context, storage, `interactive-${agent_id}`);
        const state = agent.getState();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ response, tool_calls_made: state.totalToolCalls, iterations: state.iterations }, null, 2) }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }] };
      }
    },
  );

  // list_agents
  server.tool(
    'list_agents',
    'List all currently spawned interactive agents.',
    {},
    async () => {
      const agents = pool.listAll().map((a: { id: string; name: string; role: string; status: string; messages: unknown[]; totalToolCalls: number }) => ({ id: a.id, name: a.name, role: a.role, status: a.status, messageCount: a.messages.length, totalToolCalls: a.totalToolCalls }));
      return { content: [{ type: 'text' as const, text: JSON.stringify({ agents }, null, 2) }] };
    },
  );

  // terminate_agent
  server.tool(
    'terminate_agent',
    'Terminate a spawned interactive agent.',
    { agent_id: z.string().describe('ID of the agent to terminate') },
    async ({ agent_id }) => {
      const success = pool.terminate(agent_id);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success, agent_id }) }] };
    },
  );
}
