import fs from 'node:fs/promises';
import path from 'node:path';
import type { SubagentTool, ToolContext, ToolResult } from './types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('fs-tools');

function validatePath(targetPath: string, workspacePath: string): string {
  const resolvedPath = path.resolve(workspacePath, targetPath);
  if (!resolvedPath.startsWith(path.resolve(workspacePath))) {
    throw new Error(`Path ${targetPath} is outside of workspace ${workspacePath}`);
  }
  return resolvedPath;
}

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
