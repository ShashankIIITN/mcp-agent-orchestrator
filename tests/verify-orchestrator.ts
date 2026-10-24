import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'node:path';
import { SqliteStorageAdapter } from '../src/storage/sqlite-adapter.js';
import { BuiltinToolRegistry } from '../src/builtin-tools/tool-registry.js';
import { AgentPool } from '../src/agents/agent-pool.js';
import { loadConfig } from '../src/config/loader.js';
import { DashboardServer } from '../src/dashboard/server.js';
import type { LLMProvider, ChatMessage, CompletionResponse } from '../src/inference/types.js';

// Mock LLM provider for deterministic testing
class MockLLMProvider implements LLMProvider {
  readonly name = 'mock-provider';
  async complete(messages: ChatMessage[]): Promise<CompletionResponse> {
    const lastMsg = messages[messages.length - 1];
    return {
      content: `Echo response to: ${lastMsg.content}`,
      finish_reason: 'stop',
    };
  }
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

async function runVerification() {
  console.log('🧪 Starting MCP Agent Orchestrator Verification Suite...\n');

  // 1. Config Loader Test
  console.log('1️⃣ Testing Configuration Loader...');
  const config = loadConfig();
  assert.ok(config.version, 'Config should have version');
  assert.ok(config.server.port, 'Config should have server port');
  console.log('   ✅ Config loader verified successfully.\n');

  // 2. Storage Adapter Test
  console.log('2️⃣ Testing SQLite Storage Adapter...');
  const testDbPath = resolve('./data/test-orchestrator.db');
  const storage = new SqliteStorageAdapter(testDbPath);
  await storage.init();

  const jobId = await storage.createJob({
    goal: 'Build test orchestrator feature',
    mode: 'swarm',
    safety_mode: 'semi-autonomous',
  });
  assert.ok(jobId, 'Job ID should be generated');

  const job = await storage.getJob(jobId);
  assert.strictEqual(job?.goal, 'Build test orchestrator feature');
  assert.strictEqual(job?.status, 'queued');

  await storage.updateJobStatus(jobId, 'running', { progress: 50, current_step: 'Running subtask 1' });
  const updatedJob = await storage.getJob(jobId);
  assert.strictEqual(updatedJob?.status, 'running');
  assert.strictEqual(updatedJob?.progress, 50);

  // Checkpoint test
  const cpId = await storage.createCheckpoint(jobId, {
    stage_name: 'code_review',
    action_description: 'Approve code changes',
  });
  const pendingCps = await storage.getPendingCheckpoints(jobId);
  assert.strictEqual(pendingCps.length, 1);
  assert.strictEqual(pendingCps[0].id, cpId);

  await storage.resolveCheckpoint(cpId, 'approve', 'Looks great');
  const resolvedCp = await storage.getCheckpoint(cpId);
  assert.strictEqual(resolvedCp?.status, 'approved');
  assert.strictEqual(resolvedCp?.feedback, 'Looks great');

  // Artifact test
  const artId = await storage.saveArtifact(jobId, 'test-output.txt', 'Hello World Artifact Content');
  assert.ok(artId);
  const artContent = await storage.getArtifact(jobId, 'test-output.txt');
  assert.strictEqual(artContent, 'Hello World Artifact Content');

  // Messages test
  await storage.saveAgentMessage(jobId, 'agent-1', {
    role: 'assistant',
    content: 'Initial thinking step completed.',
  });
  const transcript = await storage.getAgentTranscript(jobId);
  assert.strictEqual(transcript.length, 1);
  assert.strictEqual(transcript[0].content, 'Initial thinking step completed.');
  console.log('   ✅ SQLite storage adapter CRUD verified.\n');

  // 3. Builtin Tools Test
  console.log('3️⃣ Testing Workspace Built-in Tools...');
  const toolRegistry = new BuiltinToolRegistry();
  const writeTool = toolRegistry.getOrThrow('fs_write');
  const readTool = toolRegistry.getOrThrow('fs_read');
  const listTool = toolRegistry.getOrThrow('fs_list');
  const deleteTool = toolRegistry.getOrThrow('fs_delete');

  const toolContext = {
    workspace_path: resolve('./data'),
    safety_mode: 'autonomous' as const,
    job_id: jobId,
    agent_id: 'test-agent',
  };

  const writeRes = await writeTool.execute({ path: 'verify-temp.txt', content: 'Subagent tool execution verified' }, toolContext);
  assert.strictEqual(writeRes.success, true);

  const readRes = await readTool.execute({ path: 'verify-temp.txt' }, toolContext);
  assert.strictEqual(readRes.success, true);
  assert.strictEqual(readRes.output, 'Subagent tool execution verified');

  const listRes = await listTool.execute({ path: '.' }, toolContext);
  assert.strictEqual(listRes.success, true);

  const delRes = await deleteTool.execute({ path: 'verify-temp.txt' }, toolContext);
  assert.strictEqual(delRes.success, true);
  console.log('   ✅ Builtin workspace tools (fs_read, fs_write, fs_list, fs_delete) verified.\n');

  // 4. Agent Pool & Runtime Test
  console.log('4️⃣ Testing Agent Pool & ReAct Execution...');
  const pool = new AgentPool();
  const mockProvider = new MockLLMProvider();

  const agentId = pool.spawn({
    name: 'JuniorDev',
    role: 'Software Engineer',
    systemPrompt: 'You are a test agent.',
    provider: mockProvider,
    tools: [readTool],
  });
  assert.ok(agentId);
  assert.strictEqual(pool.size(), 1);

  const agent = pool.getOrThrow(agentId);
  const response = await agent.run('Hello agent', toolContext, storage, jobId);
  assert.ok(response.includes('Echo response to: Hello agent'));
  assert.strictEqual(agent.getState().status, 'completed');

  pool.terminate(agentId);
  assert.strictEqual(pool.size(), 0);
  console.log('   ✅ AgentPool and AgentRuntime ReAct execution verified.\n');

  // 5. Dashboard Server Test
  console.log('5️⃣ Testing Embedded Web Dashboard & API Server...');
  const dashboard = new DashboardServer(4001, storage, config, pool);
  await dashboard.start();

  const dashRes = await fetch('http://localhost:4001/');
  assert.strictEqual(dashRes.status, 200);
  const dashHtml = await dashRes.text();
  assert.ok(dashHtml.includes('Orchestrator Dashboard'));

  const overviewRes = await fetch('http://localhost:4001/api/overview');
  assert.strictEqual(overviewRes.status, 200);
  const overviewData = await overviewRes.json();
  assert.ok(overviewData.job_stats);
  assert.ok(overviewData.system);

  const jobsRes = await fetch('http://localhost:4001/api/jobs');
  assert.strictEqual(jobsRes.status, 200);
  const jobsData = await jobsRes.json();
  assert.ok(jobsData.jobs.length >= 1);

  await dashboard.stop();
  await storage.close();
  console.log('   ✅ Web Dashboard HTTP & REST endpoints verified on localhost:4001.\n');

  console.log('🎉 ALL 5 VERIFICATION MODULES PASSED WITH ZERO ERRORS!\n');
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
