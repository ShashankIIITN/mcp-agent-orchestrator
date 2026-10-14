import { createLogger } from '../utils/logger.js';
import type { StorageAdapter } from '../storage/types.js';
import type { LLMProvider, ChatMessage } from '../inference/types.js';
import { AgentRuntime, type AgentConfig } from '../agents/agent-runtime.js';
import type { SubagentTool, ToolContext } from '../builtin-tools/types.js';

const logger = createLogger('supervisor');

export interface SwarmConfig {
  jobId: string;
  goal: string;
  context?: string;
  supervisorProvider: LLMProvider;
  workerProviders: Map<string, LLMProvider>; // role -> provider
  tools: SubagentTool[];
  toolContext: ToolContext;
  storage: StorageAdapter;
  maxIterations: number;
  onProgress?: (progress: number, step: string) => void;
}

export interface SwarmResult {
  success: boolean;
  output: string;
  agentOutputs: Record<string, string>;
  totalIterations: number;
}

/**
 * The Supervisor orchestrates a swarm of agents to accomplish a goal.
 *
 * Flow:
 * 1. Ask the supervisor LLM to decompose the goal into subtasks
 * 2. For each subtask, create an agent and run it
 * 3. Collect results and ask the supervisor to synthesize
 * 4. Return the final output
 */
export class Supervisor {
  async runSwarm(config: SwarmConfig): Promise<SwarmResult> {
    logger.info({ jobId: config.jobId, goal: config.goal }, 'Starting swarm');

    const agentOutputs: Record<string, string> = {};
    let totalIterations = 0;

    try {
      // Update job status
      await config.storage.updateJobStatus(config.jobId, 'running', {
        progress: 5,
        current_step: 'Decomposing goal into subtasks',
      });
      config.onProgress?.(5, 'Decomposing goal');

      // Step 1: Ask supervisor to decompose the goal
      const decompositionPrompt = this.buildDecompositionPrompt(config.goal, config.context);
      const decomposition = await config.supervisorProvider.complete([
        { role: 'system', content: 'You are a task decomposition expert. Break down goals into clear, actionable subtasks. Respond with a JSON array of objects, each with "role" (researcher/coder/reviewer) and "task" (description). Keep it to 2-5 subtasks.' },
        { role: 'user', content: decompositionPrompt },
      ]);

      // Save decomposition
      await config.storage.saveAgentMessage(config.jobId, 'supervisor', {
        role: 'assistant',
        content: decomposition.content,
      });

      // Parse subtasks
      const subtasks = this.parseSubtasks(decomposition.content);
      logger.info({ count: subtasks.length }, 'Decomposed into subtasks');

      // Step 2: Execute each subtask with an agent
      const progressPerTask = 70 / Math.max(subtasks.length, 1);

      for (let i = 0; i < subtasks.length; i++) {
        const subtask = subtasks[i];
        const stepName = `Running ${subtask.role}: ${subtask.task.substring(0, 50)}...`;

        await config.storage.updateJobStatus(config.jobId, 'running', {
          progress: 10 + (i * progressPerTask),
          current_step: stepName,
        });
        config.onProgress?.(10 + (i * progressPerTask), stepName);

        // Pick a provider for this role, fallback to supervisor provider
        const provider = config.workerProviders.get(subtask.role) ?? config.supervisorProvider;

        const agentConfig: AgentConfig = {
          id: `swarm-${config.jobId}-${i}`,
          name: `${subtask.role}-${i}`,
          role: subtask.role,
          systemPrompt: `You are a ${subtask.role}. Complete the following task thoroughly and return your findings/output.`,
          provider,
          tools: config.tools,
          maxIterations: config.maxIterations,
        };

        const agent = new AgentRuntime(agentConfig);
        try {
          const output = await agent.run(subtask.task, config.toolContext, config.storage, config.jobId);
          agentOutputs[`${subtask.role}-${i}`] = output;
          totalIterations += agent.getState().iterations;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          agentOutputs[`${subtask.role}-${i}`] = `Error: ${errMsg}`;
          logger.error({ error, subtask }, 'Subtask agent failed');
        }
      }

      // Step 3: Synthesize results
      await config.storage.updateJobStatus(config.jobId, 'running', {
        progress: 85,
        current_step: 'Synthesizing results',
      });
      config.onProgress?.(85, 'Synthesizing results');

      const synthesisPrompt = this.buildSynthesisPrompt(config.goal, agentOutputs);
      const synthesis = await config.supervisorProvider.complete([
        { role: 'system', content: 'You are a synthesis expert. Combine the outputs from multiple agents into a coherent, comprehensive response to the original goal.' },
        { role: 'user', content: synthesisPrompt },
      ]);

      await config.storage.saveAgentMessage(config.jobId, 'supervisor', {
        role: 'assistant',
        content: synthesis.content,
      });

      // Mark complete
      await config.storage.updateJobStatus(config.jobId, 'completed', {
        progress: 100,
        current_step: 'Done',
        output: synthesis.content,
      });
      config.onProgress?.(100, 'Done');

      return {
        success: true,
        output: synthesis.content,
        agentOutputs,
        totalIterations,
      };

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await config.storage.updateJobStatus(config.jobId, 'failed', { output: errMsg });
      logger.error({ error, jobId: config.jobId }, 'Swarm failed');
      return { success: false, output: errMsg, agentOutputs, totalIterations };
    }
  }

  private buildDecompositionPrompt(goal: string, context?: string): string {
    let prompt = `Goal: ${goal}`;
    if (context) prompt += `\n\nAdditional context: ${context}`;
    prompt += '\n\nDecompose this into subtasks. Respond ONLY with a JSON array like: [{"role": "researcher", "task": "..."}, {"role": "coder", "task": "..."}]';
    return prompt;
  }

  private buildSynthesisPrompt(goal: string, outputs: Record<string, string>): string {
    let prompt = `Original goal: ${goal}\n\nAgent outputs:\n`;
    for (const [agent, output] of Object.entries(outputs)) {
      prompt += `\n--- ${agent} ---\n${output}\n`;
    }
    prompt += '\nSynthesize these into a comprehensive response.';
    return prompt;
  }

  private parseSubtasks(content: string): Array<{ role: string; task: string }> {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [{ role: 'coder', task: content }];
      }
      const parsed = JSON.parse(jsonMatch[0]) as Array<{ role: string; task: string }>;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return [{ role: 'coder', task: content }];
      }
      return parsed;
    } catch {
      logger.warn('Failed to parse subtasks JSON, treating as single task');
      return [{ role: 'coder', task: content }];
    }
  }
}
