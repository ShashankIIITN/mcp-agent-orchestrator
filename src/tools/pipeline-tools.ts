import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Dispatcher } from '../orchestrator/dispatcher.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('pipeline-tools');

export function registerPipelineTools(server: McpServer, dispatcher: Dispatcher): void {
  // run_pipeline: Start a named pipeline
  server.tool(
    'run_pipeline',
    'Execute a predefined pipeline by name. Returns a job ID immediately.',
    {
      pipeline_name: z.string().describe('Name of the pipeline to run (from orchestrator.yaml)'),
      inputs: z.record(z.string(), z.string()).optional().describe('Input key-value pairs for the pipeline'),
      workspace_path: z.string().optional().describe('Path to the workspace directory'),
      safety_mode: z.enum(['autonomous', 'semi-autonomous', 'safe']).optional().describe('Safety mode override'),
    },
    async ({ pipeline_name, inputs, workspace_path, safety_mode }) => {
      try {
        const jobId = await dispatcher.runPipeline({ pipeline_name, inputs, workspace_path, safety_mode });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ job_id: jobId, status: 'queued', pipeline: pipeline_name }, null, 2) }],
        };
      } catch (error) {
        logger.error(`Failed to run pipeline ${pipeline_name}: ${error instanceof Error ? error.message : String(error)}`);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        };
      }
    },
  );
}
