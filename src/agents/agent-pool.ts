import { nanoid } from 'nanoid';
import { createLogger } from '../utils/logger.js';
import { AgentRuntime, type AgentConfig, type AgentState } from './agent-runtime.js';
import type { LLMProvider } from '../inference/types.js';
import type { SubagentTool } from '../builtin-tools/types.js';

const logger = createLogger('agent-pool');

export interface SpawnAgentOptions {
  name: string;
  role: string;
  systemPrompt: string;
  provider: LLMProvider;
  tools: SubagentTool[];
  maxIterations?: number;
  model?: string;
}

export class AgentPool {
  private agents = new Map<string, AgentRuntime>();

  /**
   * Spawn a new agent and return its ID.
   */
  spawn(options: SpawnAgentOptions): string {
    const id = nanoid();
    const config: AgentConfig = {
      id,
      name: options.name,
      role: options.role,
      systemPrompt: options.systemPrompt,
      provider: options.provider,
      tools: options.tools,
      maxIterations: options.maxIterations ?? 20,
      model: options.model,
    };

    const runtime = new AgentRuntime(config);
    this.agents.set(id, runtime);

    logger.info({ agentId: id, name: options.name, role: options.role }, 'Agent spawned');
    return id;
  }

  get(agentId: string): AgentRuntime | undefined {
    return this.agents.get(agentId);
  }

  getOrThrow(agentId: string): AgentRuntime {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    return agent;
  }

  terminate(agentId: string): boolean {
    const existed = this.agents.delete(agentId);
    if (existed) logger.info({ agentId }, 'Agent terminated');
    return existed;
  }

  listAll(): AgentState[] {
    return Array.from(this.agents.values()).map(a => a.getState());
  }

  size(): number {
    return this.agents.size;
  }

  terminateAll(): void {
    const count = this.agents.size;
    this.agents.clear();
    logger.info({ count }, 'All agents terminated');
  }
}
