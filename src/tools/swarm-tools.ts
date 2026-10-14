import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Dispatcher } from '../orchestrator/dispatcher.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('swarm-tools');

export function registerSwarmTools(server: McpServer, dispatcher: Dispatcher): void {
  server.tool(
    'start_swarm',
    'Start an autonomous agent swarm to accomplish a complex goal. Returns a job ID immediately - the swarm runs in the background. Use get_task_status to monitor progress.',
    {
      goal: z.string().describe('The high-level goal for the agent swarm to accomplish'),
      context: z.string().optional().describe('Additional context or constraints'),
      workspace_path: z.string().optional().describe('Path to the workspace directory'),
      safety_mode: z.enum(['autonomous', 'semi-autonomous', 'safe']).optional().describe('Safety mode override'),
    },
    async ({ goal, context, workspace_path, safety_mode }) => {
      try {
        const jobId = await dispatcher.startSwarm({ goal, context, workspace_path, safety_mode });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              job_id: jobId,
              status: 'queued',
              message: 'Swarm started. Use get_task_status to monitor progress.',
              dashboard_url: `http://localhost:4000/jobs/${jobId}`,
            }, null, 2),
          }],
        };
      } catch (error) {
        logger.error(`Failed to start swarm: ${error instanceof Error ? error.message : String(error)}`);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          }],
        };
      }
    },
  );
}
