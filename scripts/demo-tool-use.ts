import { OrchestratorServer } from '../src/server.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  console.log('⚡ Booting Orchestrator Tool-Use Demonstration...\n');
  const server = new OrchestratorServer('orchestrator.yaml');
  await server.getStorage().init();

  const pool = server.getDispatcher().getAgentPool();
  const provider = server.getDispatcher().getProviderRegistry().getOrThrow('agy');
  const tools = server.getDispatcher().getToolRegistry().list();

  console.log('🤖 Spawning "DevOpsEngineer" agent with workspace tools (fs_write, fs_read, etc.)...');
  const agentId = pool.spawn({
    name: 'DevOpsEngineer',
    role: 'DevOps & Tool Specialist',
    systemPrompt: 'You are a DevOps specialist with access to tools. When requested to inspect or modify files, use the provided tools.',
    provider,
    tools,
  });

  const agent = pool.getOrThrow(agentId);
  console.log('💬 Instructing agent to create "./data/system_status.txt" using fs_write...');

  const response = await agent.run(
    'Use the fs_write tool to write "System Status: Online and Verified at ' + new Date().toISOString() + '" to path "./data/system_status.txt". Then confirm.',
    {
      workspace_path: 'D:\\my project\\mcp-agent-orchestrator',
      safety_mode: 'autonomous',
      job_id: `interactive-${agentId}`,
      agent_id: agentId,
    },
    server.getStorage(),
    `interactive-${agentId}`,
  );

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('AGENT RESPONSE:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(response);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const state = agent.getState();
  console.log(`📊 Tool Calls Executed: ${state.totalToolCalls}`);
  console.log(`📊 ReAct Iterations: ${state.iterations}`);

  const targetPath = resolve('./data/system_status.txt');
  if (existsSync(targetPath)) {
    console.log(`\n📁 File verification on disk (${targetPath}):`);
    console.log(`   Content: "${readFileSync(targetPath, 'utf8').trim()}"`);
  }

  pool.terminate(agentId);
  await server.getStorage().close();
  console.log('\n🏁 Tool execution demonstration completed.');
}

main().catch(console.error);
