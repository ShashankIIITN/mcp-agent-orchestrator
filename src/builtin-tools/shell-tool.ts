import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { SubagentTool, ToolContext, ToolResult } from './types.js';
import { createLogger } from '../utils/logger.js';
import { validateWorkspacePath, resolveCrossPlatformPath } from '../utils/path-utils.js';
import { findDangerousCommand } from '../utils/command-guard.js';

// `exec` runs the command string through the platform shell
// (/bin/sh on Linux/macOS, cmd.exe on Windows).
const execAsync = promisify(exec);
const logger = createLogger('shell-tool');

const validatePath = validateWorkspacePath;

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
      if (typeof command !== 'string' || command.trim() === '') {
        return { success: false, output: '', error: 'command must be a non-empty string' };
      }

      if (context.safety_mode !== 'autonomous') {
        const danger = findDangerousCommand(command);
        if (danger) {
          logger.warn(`Blocked dangerous command from agent ${context.agent_id} (${danger}): ${command}`);
          return {
            success: false,
            output: '',
            error: `Blocked: command matches a dangerous pattern (${danger}). Use autonomous mode if this is intended.`
          };
        }
      }

      if (context.safety_mode === 'semi-autonomous') {
        logger.warn(`Agent ${context.agent_id} in job ${context.job_id} is executing shell command: ${command}`);
      }

      const cwdArg = args.cwd as string | undefined;
      let cwd = resolveCrossPlatformPath(context.workspace_path);
      if (cwdArg) {
        cwd = validatePath(cwdArg, context.workspace_path);
      }

      let timeoutArg = args.timeout as number | undefined ?? 30000;
      if (timeoutArg > 300000) {
        timeoutArg = 300000;
      }

      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: timeoutArg,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
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
