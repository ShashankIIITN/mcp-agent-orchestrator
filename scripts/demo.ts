import { OrchestratorServer } from '../src/server.js';

async function runDemo() {
  console.log('🚀 Booting MCP Agent Orchestrator with local Antigravity (agy) engine...\n');
  
  const server = new OrchestratorServer('orchestrator.yaml');
  const storage = server.getStorage();
  const dispatcher = server.getDispatcher();
  const dashboard = server.getDashboardServer();

  // Initialize storage & dashboard
  await storage.init();
  await dashboard.start();

  console.log('🌐 Web Dashboard active at http://localhost:4000\n');

  // Dispatch an autonomous swarm task
  const goal = 'Summarize the primary purpose of an MCP Agent Orchestrator in 3 concise bullet points.';
  console.log(`📋 Dispatching Swarm Task: "${goal}"`);
  
  const jobId = await dispatcher.startSwarm({
    goal,
    workspace_path: 'D:\\my project\\mcp-agent-orchestrator',
    safety_mode: 'semi-autonomous',
  });

  console.log(`⏳ Job ID assigned: ${jobId}`);
  console.log('👀 Monitoring execution in real-time...\n');

  // Poll until completion or timeout (5 mins)
  const startTime = Date.now();
  let lastStep = '';

  while (Date.now() - startTime < 300000) {
    const job = await storage.getJob(jobId);
    if (!job) break;

    if (job.current_step && job.current_step !== lastStep) {
      lastStep = job.current_step;
      console.log(`   [Progress: ${Math.round(job.progress)}%] 📍 ${job.current_step}`);
    }

    if (job.status === 'completed') {
      console.log('\n✅ Swarm Task Completed Successfully!');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('SYNTHESIZED OUTPUT:');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(job.output);
      console.log('═══════════════════════════════════════════════════════════════\n');

      const messages = await storage.getAgentTranscript(jobId);
      console.log(`💬 Agent Transcript Records: ${messages.length} messages logged.`);
      break;
    }

    if (job.status === 'failed') {
      console.error('\n❌ Swarm Task Failed:', job.output);
      break;
    }

    await new Promise((res) => setTimeout(res, 2000));
  }

  await dashboard.stop();
  await storage.close();
  console.log('\n🏁 Demonstration finished.');
}

runDemo().catch(console.error);
