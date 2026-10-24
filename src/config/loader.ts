import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { OrchestratorConfigSchema, type OrchestratorConfig, type AgentDefinition } from './schema.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('config-loader');

/**
 * Automatically discover custom specialist agents configured on the system
 * in ~/.gemini/config/agents, $XDG_CONFIG_HOME/gemini/agents (Linux/macOS),
 * and ./.agents/agents.
 */
function discoverSystemAgents(): Record<string, AgentDefinition> {
  const discovered: Record<string, AgentDefinition> = {};
  const searchRoots = [
    join(homedir(), '.gemini', 'config', 'agents'),
    resolve('./.agents/agents'),
  ];
  if (process.env.XDG_CONFIG_HOME) {
    searchRoots.splice(1, 0, join(process.env.XDG_CONFIG_HOME, 'gemini', 'agents'));
  }

  for (const root of searchRoots) {
    if (!existsSync(root)) continue;
    try {
      const entries = readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const agentFile = join(root, entry.name, 'agent.md');
        if (!existsSync(agentFile)) continue;

        try {
          const raw = readFileSync(agentFile, 'utf-8');
          const frontmatterMatch = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);

          let name = entry.name;
          let role = `Specialist for ${entry.name}`;
          let model = 'gemini-3.8-flash-high';
          let systemPrompt = raw;

          if (frontmatterMatch) {
            const frontmatterRaw = frontmatterMatch[1];
            systemPrompt = frontmatterMatch[2].trim();
            const parsed = parseYaml(frontmatterRaw) as Record<string, unknown> | null;
            if (parsed) {
              if (parsed.name) name = String(parsed.name);
              if (parsed.description) role = String(parsed.description);
              if (parsed.model) model = String(parsed.model);
            }
          }

          // Map model to appropriate local or default provider
          const provider = model.toLowerCase().includes('claude') ? 'agy_claude' : 'agy';

          // Assign default tools based on specialist archetype
          const lowerName = name.toLowerCase();
          const lowerRole = role.toLowerCase();
          let tools: string[];
          if (lowerName.includes('reviewer') || lowerRole.includes('reviewer') || lowerRole.includes('auditor')) {
            tools = ['fs_read', 'fs_list', 'shell_exec'];
          } else if (lowerName.includes('designer') || lowerRole.includes('designer')) {
            tools = ['fs_read', 'fs_write', 'fs_list'];
          } else if (lowerName.includes('tester') || lowerRole.includes('qa')) {
            tools = ['fs_read', 'fs_write', 'fs_list', 'shell_exec'];
          } else {
            tools = ['fs_read', 'fs_write', 'fs_list', 'shell_exec', 'web_fetch'];
          }

          discovered[name] = {
            role,
            provider,
            model,
            system_prompt: systemPrompt,
            tools,
          };
        } catch (fileErr) {
          logger.warn({ error: fileErr, agentFile }, 'Failed to parse agent file');
        }
      }
    } catch (err) {
      logger.warn({ error: err, root }, 'Failed to read agent search root');
    }
  }

  return discovered;
}

/**
 * Recursively resolve `${ENV_VAR}` references in string values
 * by looking them up in `process.env`.
 */
function resolveEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
      const envValue = process.env[varName];
      if (envValue === undefined) {
        logger.warn(`Environment variable "${varName}" is not set, leaving placeholder`);
        return '';
      }
      return envValue;
    });
  }

  if (Array.isArray(value)) {
    return value.map(resolveEnvVars);
  }

  if (value !== null && typeof value === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      resolved[key] = resolveEnvVars(val);
    }
    return resolved;
  }

  return value;
}

/**
 * Load and validate the orchestrator configuration.
 *
 * @param filePath - Path to the YAML config file. Defaults to `orchestrator.yaml` in CWD.
 * @returns Validated configuration object.
 */
export function loadConfig(filePath?: string): OrchestratorConfig {
  const configPath = resolve(filePath ?? 'orchestrator.yaml');

  let raw: unknown = {};

  if (existsSync(configPath)) {
    logger.info(`Loading configuration from ${configPath}`);
    const content = readFileSync(configPath, 'utf-8');
    raw = parseYaml(content) ?? {};
  } else {
    logger.info(`No config file found at ${configPath}, using defaults`);
  }

  // Resolve environment variable placeholders
  const resolved = resolveEnvVars(raw);

  // Validate with Zod (applies defaults for missing fields)
  const config = OrchestratorConfigSchema.parse(resolved);

  // Auto-discover system agents from ~/.gemini/config/agents
  const systemAgents = discoverSystemAgents();
  let discoveredCount = 0;
  for (const [name, def] of Object.entries(systemAgents)) {
    if (!config.agents[name]) {
      config.agents[name] = def;
      discoveredCount++;
    }
  }

  if (discoveredCount > 0) {
    logger.info({ count: discoveredCount }, 'Auto-discovered system specialist agents');
  }

  // Ensure every agent referenced by a pipeline stage exists in config.agents,
  // auto-provisioning a sensible specialist persona on machines without custom agent files.
  const defaultProviderKey = Object.keys(config.inference.providers)[0] || 'agy';
  for (const [pipelineName, pipeline] of Object.entries(config.pipelines)) {
    for (const stage of pipeline.stages) {
      if (!config.agents[stage.agent]) {
        const lower = stage.agent.toLowerCase();
        const isReviewer = lower.includes('reviewer') || lower.includes('auditor');
        config.agents[stage.agent] = {
          role: `Specialist (${stage.agent})`,
          provider: defaultProviderKey,
          system_prompt: `You are ${stage.agent}, a specialist agent executing stage "${stage.name}" of pipeline "${pipelineName}". Complete the stage thoroughly.`,
          tools: isReviewer
            ? ['fs_read', 'fs_list', 'shell_exec']
            : ['fs_read', 'fs_write', 'fs_list', 'shell_exec', 'web_fetch'],
        };
        logger.debug({ agent: stage.agent, pipeline: pipelineName }, 'Auto-provisioned fallback pipeline agent');
      }
    }
  }

  logger.info(
    {
      storage: config.server.storage.type,
      safety: config.server.security.default_safety_mode,
      providers: Object.keys(config.inference.providers),
      agents: Object.keys(config.agents),
      pipelines: Object.keys(config.pipelines),
    },
    'Configuration loaded successfully',
  );

  return config;
}
