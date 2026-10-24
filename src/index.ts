#!/usr/bin/env node
import { existsSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OrchestratorServer } from './server.js';
import { createLogger } from './utils/logger.js';
import { loadConfig } from './config/loader.js';
import { findAgyBinaryPath, isAgyAvailable } from './inference/providers/agy-provider.js';
import { VERSION } from './version.js';

const logger = createLogger('main');

async function main() {
  const arg = process.argv[2];

  // ── 1. Version Flag ─────────────────────────────────────────────
  if (arg === '--version' || arg === '-v') {
    console.log(`mcp-agent-orchestrator v${VERSION}`);
    process.exit(0);
  }

  // ── 2. Help Flag ────────────────────────────────────────────────
  if (arg === '--help' || arg === '-h') {
    console.log(`
⚡ MCP Agent Orchestrator v${VERSION}
Model Context Protocol multi-agent coordination kernel and context firewall.

USAGE:
  mcp-agent-orchestrator [configPath]      Start MCP server over stdio (default)
  mcp-agent-orchestrator init              Create starter orchestrator.yaml in current directory
  mcp-agent-orchestrator doctor            Run system diagnostic & provider health checks
  mcp-agent-orchestrator --version, -v     Print version
  mcp-agent-orchestrator --help, -h        Print this help message

EXAMPLES:
  npx mcp-agent-orchestrator               Start server using defaults or orchestrator.yaml
  npx mcp-agent-orchestrator ./my-cfg.yaml Start server with custom configuration
  npx mcp-agent-orchestrator init          Initialize new configuration file
`);
    process.exit(0);
  }

  // ── 3. Init Command ─────────────────────────────────────────────
  if (arg === 'init') {
    const targetPath = resolve('./orchestrator.yaml');
    if (existsSync(targetPath)) {
      console.log(`⚠️  orchestrator.yaml already exists at: ${targetPath}`);
      process.exit(0);
    }

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const examplePath = resolve(__dirname, '../orchestrator.example.yaml');

    if (existsSync(examplePath)) {
      copyFileSync(examplePath, targetPath);
    } else {
      // Minimal fallback starter template
      const starterTemplate = `version: "1.0"
server:
  port: 4000
  storage:
    type: "sqlite"
    connection_string: "./data/orchestrator.db"
  security:
    default_safety_mode: "semi-autonomous"
    allowed_workspaces: ["./"]

inference:
  default_provider: "direct"
  providers:
    agy:
      type: "agy"
      model: "gemini-3.8-flash-high"
    agy_claude:
      type: "agy"
      model: "claude-sonnet-4-6"

agents:
  researcher:
    role: "Research Specialist"
    provider: "agy"
    tools: ["web_fetch", "fs_read", "fs_list"]
  coder:
    role: "Senior Software Engineer"
    provider: "agy"
    tools: ["fs_read", "fs_write", "fs_list", "shell_exec"]
  reviewer:
    role: "Security & QA Auditor"
    provider: "agy_claude"
    tools: ["fs_read", "fs_list", "shell_exec"]

pipelines:
  feature_implementation:
    stages:
      - name: "research"
        agent: "researcher"
        output_artifact: "research_notes.md"
      - name: "code"
        agent: "coder"
        input_artifacts: ["research_notes.md"]
        output_artifact: "implementation.md"
        checkpoint: true
      - name: "review"
        agent: "reviewer"
        input_artifacts: ["implementation.md"]
`;
      writeFileSync(targetPath, starterTemplate, 'utf-8');
    }

    console.log(`✨ Created starter orchestrator.yaml at: ${targetPath}`);
    console.log('You can now run `npx mcp-agent-orchestrator` to launch the server.');
    process.exit(0);
  }

  // ── 4. Doctor Command ───────────────────────────────────────────
  if (arg === 'doctor' || arg === 'check') {
    console.log(`\n🏥 MCP Agent Orchestrator Diagnostics (v${VERSION})\n`);
    console.log(`   Node Version     : ${process.version}`);
    console.log(`   Platform         : ${process.platform} (${process.arch})`);

    const agyBin = findAgyBinaryPath();
    const agyAvailable = isAgyAvailable(agyBin);
    console.log(`   Local agy binary : ${agyAvailable ? `Available (${agyBin})` : 'Not found (optional)'}`);

    const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
    const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
    console.log(`   API Keys in Env  : Gemini: ${hasGeminiKey ? 'YES' : 'No'} | OpenAI: ${hasOpenAiKey ? 'YES' : 'No'} | Anthropic: ${hasAnthropicKey ? 'YES' : 'No'}`);

    try {
      const config = loadConfig();
      console.log(`   Config File      : Loaded successfully`);
      console.log(`   Active Providers : ${Object.keys(config.inference.providers).join(', ') || 'Auto-detected agy'}`);
      console.log(`   Registered Agents: ${Object.keys(config.agents).length} total (${Object.keys(config.agents).slice(0, 5).join(', ')}...)`);
      console.log(`   Preset Pipelines : ${Object.keys(config.pipelines).join(', ')}`);
      console.log(`\n✅ System is healthy and ready for multi-agent orchestration!\n`);
    } catch (err) {
      console.error(`\n❌ Configuration issue:`, err);
      process.exit(1);
    }
    process.exit(0);
  }

  // ── 5. Default: Start MCP Server ────────────────────────────────
  const configPath = arg || undefined;
  const server = new OrchestratorServer(configPath);

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await server.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await server.shutdown();
    process.exit(0);
  });

  try {
    await server.start();
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
