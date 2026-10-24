import { z } from 'zod';

// ── Safety & Security ──────────────────────────────────────────────
export const SafetyModeSchema = z.enum(['autonomous', 'semi-autonomous', 'safe']);
export type SafetyMode = z.infer<typeof SafetyModeSchema>;

// ── Server ─────────────────────────────────────────────────────────
export const StorageConfigSchema = z.object({
  type: z.enum(['sqlite', 'postgres', 'redis']).default('sqlite'),
  connection_string: z.string().default('./data/orchestrator.db'),
});

export const SecurityConfigSchema = z.object({
  default_safety_mode: SafetyModeSchema.default('semi-autonomous'),
  allowed_workspaces: z.array(z.string()).default(['./']),
});

export const ServerConfigSchema = z.object({
  port: z.number().default(4000),
  storage: StorageConfigSchema.default({}),
  security: SecurityConfigSchema.default({}),
});

export const InferenceProviderTypeSchema = z.enum([
  'agy',
  'gemini',
  'anthropic',
  'openai',
  'ollama',
  'openai-compatible',
]);
export type InferenceProviderType = z.infer<typeof InferenceProviderTypeSchema>;

export const InferenceProviderSchema = z.object({
  type: InferenceProviderTypeSchema.optional(),
  model: z.string(),
  api_key_env: z.string().optional(),
  base_url: z.string().optional(),
  binary_path: z.string().optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
});

export const ModelTierSchema = z.enum(['fast', 'balanced', 'heavy']);
export type ModelTier = z.infer<typeof ModelTierSchema>;

export const TierTargetSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

export const InferenceConfigSchema = z.object({
  default_provider: z.enum(['direct', 'sampling']).default('direct'),
  providers: z.record(z.string(), InferenceProviderSchema).default({}),
  tiers: z
    .object({
      fast: TierTargetSchema.optional(),
      balanced: TierTargetSchema.optional(),
      heavy: TierTargetSchema.optional(),
    })
    .optional(),
});

// ── MCP Gateways ───────────────────────────────────────────────────
export const McpGatewayConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
});

// ── Agents ─────────────────────────────────────────────────────────
export const AgentDefinitionSchema = z.object({
  role: z.string(),
  provider: z.string().optional(),
  model: z.string().optional(),
  system_prompt: z.string().optional(),
  tools: z.array(z.string()).default([]),
});

// ── Pipelines ──────────────────────────────────────────────────────
export const PipelineStageSchema = z.object({
  name: z.string(),
  agent: z.string(),
  input_artifacts: z.array(z.string()).default([]),
  output_artifact: z.string().optional(),
  checkpoint: z.boolean().default(false),
});

export const PipelineDefinitionSchema = z.object({
  stages: z.array(PipelineStageSchema),
});

// ── Root Config ────────────────────────────────────────────────────
export const OrchestratorConfigSchema = z.object({
  version: z.string().default('1.0'),
  server: ServerConfigSchema.default({}),
  inference: InferenceConfigSchema.default({}),
  mcp_gateways: z.record(z.string(), McpGatewayConfigSchema).default({}),
  agents: z.record(z.string(), AgentDefinitionSchema).default({}),
  pipelines: z.record(z.string(), PipelineDefinitionSchema).default({}),
});

// ── Inferred Types ─────────────────────────────────────────────────
export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type InferenceConfig = z.infer<typeof InferenceConfigSchema>;
export type InferenceProvider = z.infer<typeof InferenceProviderSchema>;
export type McpGatewayConfig = z.infer<typeof McpGatewayConfigSchema>;
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
export type PipelineStage = z.infer<typeof PipelineStageSchema>;
export type PipelineDefinition = z.infer<typeof PipelineDefinitionSchema>;
