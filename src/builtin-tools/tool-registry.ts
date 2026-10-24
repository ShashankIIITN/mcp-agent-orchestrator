import type { SubagentTool } from './types.js';
import { fsTools } from './fs-tools.js';
import { shellTool } from './shell-tool.js';
import { webFetchTool } from './web-fetch-tool.js';

export class BuiltinToolRegistry {
  private tools = new Map<string, SubagentTool>();

  constructor() {
    // Register all built-in tools
    for (const tool of [...fsTools, shellTool, webFetchTool]) {
      this.tools.set(tool.name, tool);
    }
  }

  get(name: string): SubagentTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Register an additional tool (e.g. a tool bridged from an external MCP server).
   */
  register(tool: SubagentTool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  getOrThrow(name: string): SubagentTool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found in registry`);
    }
    return tool;
  }

  list(): SubagentTool[] {
    return Array.from(this.tools.values());
  }

  getByNames(names: string[]): SubagentTool[] {
    return names
      .map(name => this.tools.get(name))
      .filter((tool): tool is SubagentTool => tool !== undefined);
  }
}
