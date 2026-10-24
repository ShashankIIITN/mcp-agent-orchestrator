import { createLogger } from '../utils/logger.js';
import type { StorageAdapter } from '../storage/types.js';
import type { PipelineDefinition, PipelineStage, AgentDefinition } from '../config/schema.js';
import type { LLMProvider } from '../inference/types.js';
import type { SubagentTool, ToolContext } from '../builtin-tools/types.js';
import { AgentRuntime, type AgentConfig } from '../agents/agent-runtime.js';
import { eventBus, type DashboardEvent } from '../dashboard/events.js';

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

        // Honour the agent's declared tool whitelist (empty list = no restriction)
        const agentTools =
          agentDef.tools && agentDef.tools.length > 0
            ? config.tools.filter(t => agentDef.tools.includes(t.name))
            : config.tools;

        const agentConfig: AgentConfig = {
          id: `pipeline-${jobId}-${stage.name}`,
          name: `${stage.agent}-${stage.name}`,
          role: agentDef.role,
          systemPrompt: agentDef.system_prompt ?? `You are a ${agentDef.role}. Complete the assigned task.`,
          provider,
          tools: agentTools,
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
   * Wait for checkpoint resolution. Returns true if approved.
   * Resolves immediately on the in-process event bus; a slow DB poll remains as a
   * fallback for approvals made by another process sharing the same database.
   */
  private waitForCheckpoint(
    storage: StorageAdapter,
    checkpointId: string,
    timeoutMs = 3600000, // 1 hour
    pollIntervalMs = 10000,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let pollTimer: NodeJS.Timeout | undefined;
      let deadlineTimer: NodeJS.Timeout | undefined;

      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        eventBus.off('event', onEvent);
        if (pollTimer) clearInterval(pollTimer);
        if (deadlineTimer) clearTimeout(deadlineTimer);
        resolve(result);
      };

      const check = async () => {
        try {
          const checkpoint = await storage.getCheckpoint(checkpointId);
          if (!checkpoint) return finish(false);
          if (checkpoint.status === 'approved') return finish(true);
          if (checkpoint.status === 'rejected') return finish(false);
        } catch (err) {
          logger.warn({ error: err, checkpointId }, 'Checkpoint status check failed');
        }
      };

      const onEvent = (ev: DashboardEvent) => {
        if (ev.type === 'checkpoint_resolved' && ev.data.checkpointId === checkpointId) {
          void check();
        }
      };

      eventBus.on('event', onEvent);
      pollTimer = setInterval(() => void check(), pollIntervalMs);
      deadlineTimer = setTimeout(() => {
        logger.warn({ checkpointId }, 'Checkpoint timed out');
        finish(false);
      }, timeoutMs);

      void check(); // already resolved before we subscribed?
    });
  }
}
