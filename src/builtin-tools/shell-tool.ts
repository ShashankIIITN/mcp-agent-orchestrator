import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { SubagentTool, ToolContext, ToolResult } from './types.js';
import { createLogger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);
const logger = createLogger('shell-tool');

function validatePath(targetPath: string, workspacePath: string): string {
  const resolvedPath = path.resolve(workspacePath, targetPath);
  if (!resolvedPath.startsWith(path.resolve(workspacePath))) {
    throw new Error(`Path ${targetPath} is outside of workspace ${workspacePath}`);
  }
  return resolvedPath;
}

export const shellTool: SubagentTool = {
  name: 'shell_exec',
  description: 'Execute a shell command',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      cwd: { type: 'string' },
      timeout: { type: 'number' }
    },
    required: ['command']
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      if (context.safety_mode === 'safe') {
        return { success: false, output: '', error: 'Blocked: shell_exec is completely blocked in safe mode.' };
      }

      const command = args.command as string;
      if (context.safety_mode === 'semi-autonomous') {
        logger.warn(`Agent ${context.agent_id} in job ${context.job_id} is executing shell command: ${command}`);
      }

      const cwdArg = args.cwd as string | undefined;
      let cwd = context.workspace_path;
      if (cwdArg) {
        cwd = validatePath(cwdArg, context.workspace_path);
      }

      let timeoutArg = args.timeout as number | undefined ?? 30000;
      if (timeoutArg > 300000) {
        timeoutArg = 300000;
      }

      const { stdout, stderr } = await execFileAsync(command, {
        cwd,
        timeout: timeoutArg,
        shell: true
      });

      return {
        success: true,
        output: stdout.trim() ? stdout : (stderr.trim() ? stderr : 'Command completed successfully')
      };
    } catch (error: any) {
      return {
        success: false,
        output: error.stdout?.toString() || '',
        error: error.stderr?.toString() || error.message
      };
    }
  }
};
