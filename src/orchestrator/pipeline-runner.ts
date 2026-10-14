import { createLogger } from '../utils/logger.js';
import type { StorageAdapter } from '../storage/types.js';
import type { PipelineDefinition, PipelineStage, AgentDefinition } from '../config/schema.js';
import type { LLMProvider } from '../inference/types.js';
import type { SubagentTool, ToolContext } from '../builtin-tools/types.js';
import { AgentRuntime, type AgentConfig } from '../agents/agent-runtime.js';

const logger = createLogger('pipeline-runner');

export interface PipelineConfig {
  jobId: string;
  pipeline: PipelineDefinition;
  agentDefs: Record<string, AgentDefinition>;
  providerResolver: (providerName: string) => LLMProvider;
  tools: SubagentTool[];
  toolContext: ToolContext;
  storage: StorageAdapter;
  inputs: Record<string, string>;
  maxIterationsPerAgent?: number;
  onProgress?: (progress: number, step: string) => void;
}

export interface PipelineResult {
  success: boolean;
  output: string;
  artifacts: Record<string, string>;
  stageResults: Record<string, string>;
}

export class PipelineRunner {
  async run(config: PipelineConfig): Promise<PipelineResult> {
    const { pipeline, storage, jobId } = config;
    const stages = pipeline.stages;
    const artifacts: Record<string, string> = { ...config.inputs };
    const stageResults: Record<string, string> = {};

    logger.info({ jobId, stageCount: stages.length }, 'Starting pipeline');

    await storage.updateJobStatus(jobId, 'running', {
      progress: 0,
      current_step: 'Starting pipeline',
    });

    try {
      const progressPerStage = 100 / stages.length;

      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        const progress = Math.round((i / stages.length) * 100);

        // Check for checkpoint
        if (stage.checkpoint) {
          const checkpointId = await storage.createCheckpoint(jobId, {
            stage_name: stage.name,
            action_description: `Approve stage "${stage.name}" (agent: ${stage.agent}) before proceeding`,
          });

          await storage.updateJobStatus(jobId, 'waiting_approval', {
            progress,
            current_step: `Waiting for approval: ${stage.name}`,
          });
          config.onProgress?.(progress, `Waiting for approval: ${stage.name}`);

          // Poll for checkpoint resolution
          const approved = await this.waitForCheckpoint(storage, checkpointId);
          if (!approved) {
            await storage.updateJobStatus(jobId, 'cancelled', {
              output: `Pipeline rejected at stage: ${stage.name}`,
            });
            return {
              success: false,
              output: `Pipeline rejected at checkpoint: ${stage.name}`,
              artifacts,
              stageResults,
            };
          }
        }

        // Run the stage
        await storage.updateJobStatus(jobId, 'running', {
          progress,
          current_step: `Running stage: ${stage.name}`,
        });
        config.onProgress?.(progress, `Running: ${stage.name}`);

        const agentDef = config.agentDefs[stage.agent];
        if (!agentDef) {
          throw new Error(`Agent definition not found: ${stage.agent}`);
        }

        // Gather input artifacts for this stage
        const inputContext = stage.input_artifacts
          .map(name => artifacts[name] ? `--- ${name} ---\n${artifacts[name]}` : '')
          .filter(Boolean)
          .join('\n\n');

        const providerName = agentDef.provider ?? 'default';
        let provider: LLMProvider;
        try {
          provider = config.providerResolver(providerName);
        } catch {
          throw new Error(`Provider "${providerName}" not found for agent "${stage.agent}"`);
        }

        const agentConfig: AgentConfig = {
          id: `pipeline-${jobId}-${stage.name}`,
          name: `${stage.agent}-${stage.name}`,
          role: agentDef.role,
          systemPrompt: agentDef.system_prompt ?? `You are a ${agentDef.role}. Complete the assigned task.`,
          provider,
          tools: config.tools,
          maxIterations: config.maxIterationsPerAgent ?? 15,
        };

        const agent = new AgentRuntime(agentConfig);
        const taskPrompt = inputContext
          ? `Task for stage "${stage.name}": Complete your role.\n\nInput artifacts:\n${inputContext}`
          : `Task for stage "${stage.name}": Complete your role.`;

        const result = await agent.run(taskPrompt, config.toolContext, storage, jobId);
        stageResults[stage.name] = result;

        // Save output artifact if defined
        if (stage.output_artifact) {
          artifacts[stage.output_artifact] = result;
          await storage.saveArtifact(jobId, stage.output_artifact, result);
        }

        logger.info({ stage: stage.name, agent: stage.agent }, 'Stage completed');
      }

      // All stages done
      const finalOutput = Object.entries(stageResults)
        .map(([name, result]) => `## ${name}\n${result}`)
        .join('\n\n');

      await storage.updateJobStatus(jobId, 'completed', {
        progress: 100,
        current_step: 'Pipeline complete',
        output: finalOutput,
      });
      config.onProgress?.(100, 'Pipeline complete');

      return { success: true, output: finalOutput, artifacts, stageResults };

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await storage.updateJobStatus(jobId, 'failed', { output: errMsg });
      logger.error({ error, jobId }, 'Pipeline failed');
      return { success: false, output: errMsg, artifacts, stageResults };
    }
  }

  /**
   * Poll for checkpoint resolution. Returns true if approved.
   */
  private async waitForCheckpoint(
    storage: StorageAdapter,
    checkpointId: string,
    timeoutMs = 3600000, // 1 hour
    pollIntervalMs = 2000,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const checkpoint = await storage.getCheckpoint(checkpointId);
      if (!checkpoint) return false;
      if (checkpoint.status === 'approved') return true;
      if (checkpoint.status === 'rejected') return false;

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    logger.warn({ checkpointId }, 'Checkpoint timed out');
    return false;
  }
}
