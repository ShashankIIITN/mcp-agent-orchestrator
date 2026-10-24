import fs from 'node:fs/promises';
import path from 'node:path';
import type { SubagentTool, ToolContext, ToolResult } from './types.js';
import { createLogger } from '../utils/logger.js';
import { validateWorkspacePath } from '../utils/path-utils.js';

const logger = createLogger('fs-tools');

// Cross-platform (Linux/macOS/Windows) containment check with symlink + `~` handling
const validatePath = validateWorkspacePath;

// Cap file reads so a huge file can't blow up an agent's context or the transcript DB
const MAX_READ_BYTES = 512 * 1024;

export const fsTools: SubagentTool[] = [
  {
    name: 'fs_read',
    description: 'Read a file\'s contents',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' }
      },
      required: ['path']
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const filePath = args.path as string;
        const resolvedPath = validatePath(filePath, context.workspace_path);
        const stat = await fs.stat(resolvedPath);
        if (stat.size > MAX_READ_BYTES) {
          const handle = await fs.open(resolvedPath, 'r');
          try {
            const buf = Buffer.alloc(MAX_READ_BYTES);
            const { bytesRead } = await handle.read(buf, 0, MAX_READ_BYTES, 0);
            return {
              success: true,
              output: buf.subarray(0, bytesRead).toString('utf8') +
                `\n\n[truncated: file is ${stat.size} bytes, showing first ${MAX_READ_BYTES}]`
            };
          } finally {
            await handle.close();
          }
        }
        const content = await fs.readFile(resolvedPath, 'utf8');
        return { success: true, output: content };
      } catch (error: any) {
        return { success: false, output: '', error: error.message };
      }
    }
  },
  {
    name: 'fs_write',
    description: 'Write content to a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        if (context.safety_mode === 'safe') {
          return { success: false, output: '', error: 'Blocked: fs_write is not allowed in safe mode.' };
        }
        if (context.safety_mode === 'semi-autonomous') {
          logger.warn(`Agent ${context.agent_id} in job ${context.job_id} is executing fs_write on ${args.path}`);
        }
        const filePath = args.path as string;
        const content = args.content as string;
        const resolvedPath = validatePath(filePath, context.workspace_path);
        
        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fs.writeFile(resolvedPath, content, 'utf8');
        return { success: true, output: 'File written successfully.' };
      } catch (error: any) {
        return { success: false, output: '', error: error.message };
      }
    }
  },
  {
    name: 'fs_list',
    description: 'List directory contents',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        recursive: { type: 'boolean' }
      },
      required: ['path']
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const dirPath = args.path as string;
        const recursive = args.recursive as boolean | undefined;
        const resolvedPath = validatePath(dirPath, context.workspace_path);
        
        const entries = await fs.readdir(resolvedPath, { recursive, withFileTypes: true });
        const list = entries.map(entry => {
            const relPath = path.relative(resolvedPath, path.join(entry.parentPath ?? entry.path, entry.name));
            return `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${relPath}`;
        }).join('\n');
        
        return { success: true, output: list || 'Empty directory' };
      } catch (error: any) {
        return { success: false, output: '', error: error.message };
      }
    }
  },
  {
    name: 'fs_delete',
    description: 'Delete a file or directory',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' }
      },
      required: ['path']
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        if (context.safety_mode === 'safe') {
          return { success: false, output: '', error: 'Blocked: fs_delete is not allowed in safe mode.' };
        }
        if (context.safety_mode === 'semi-autonomous') {
          logger.warn(`Agent ${context.agent_id} in job ${context.job_id} is executing fs_delete on ${args.path}`);
        }
        const targetPath = args.path as string;
        const resolvedPath = validatePath(targetPath, context.workspace_path);
        
        await fs.rm(resolvedPath, { recursive: true, force: true });
        return { success: true, output: 'Deleted successfully.' };
      } catch (error: any) {
        return { success: false, output: '', error: error.message };
      }
    }
  }
];
