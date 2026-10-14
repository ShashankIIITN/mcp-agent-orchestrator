import type { SafetyMode } from '../config/schema.js';

/**
 * Represents a tool that subagents can use.
 */
export interface SubagentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

/**
 * Context provided to tools during execution.
 */
export interface ToolContext {
  workspace_path: string;
  safety_mode: SafetyMode;
  job_id: string;
  agent_id: string;
}

/**
 * Result of a tool execution.
 */
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}
