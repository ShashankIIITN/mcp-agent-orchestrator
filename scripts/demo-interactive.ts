import { OrchestratorServer } from '../src/server.js';

async function main() {
  console.log('⚡ Booting Orchestrator Interactive Agent Engine...\n');
  const server = new OrchestratorServer('orchestrator.yaml');
  await server.getStorage().init();

  const pool = server.getDispatcher().getAgentPool();
  const provider = server.getDispatcher().getProviderRegistry().getOrThrow('agy');
  const tools = server.getDispatcher().getToolRegistry().list();

  console.log('🤖 Spawning "SeniorArchitect" agent with local agy provider...');
  const agentId = pool.spawn({
    name: 'SeniorArchitect',
    role: 'Lead Systems Architect',
    systemPrompt: 'You are a senior systems architect. Be direct, authoritative, and concise.',
    provider,
    tools,
  });

  console.log(`✅ Agent successfully spawned [ID: ${agentId}]`);
  console.log('💬 Prompting agent with task: "Summarize the MCP Agent Orchestrator architecture in 3 bullet points."\n');

  const agent = pool.getOrThrow(agentId);
  const response = await agent.run(
    'Summarize what an MCP Agent Orchestrator does in exactly 3 bullet points.',
    {
      workspace_path: './',
      safety_mode: 'semi-autonomous',
      job_id: `interactive-${agentId}`,
      agent_id: agentId,
    },
    server.getStorage(),
    `interactive-${agentId}`,
  );

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('AGENT OUTPUT (Powered by local agy engine):');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(response);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const state = agent.getState();
  console.log(`📊 Stats: Iterations: ${state.iterations}, Tool Calls: ${state.totalToolCalls}, Status: ${state.status}`);

  pool.terminate(agentId);
  await server.getStorage().close();
  console.log('🏁 Interactive run completed successfully.');
}

main().catch(console.error);
