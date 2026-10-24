import assert from 'node:assert';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * End-to-end smoke test: launches the compiled server (dist/index.js) over stdio
 * and talks to it with the real MCP client. Requires `npm run build` first.
 * Uses a throwaway DB/port so it never touches real data.
 */
const entry = resolve('dist/index.js');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry],
  env: {
    ...(process.env as Record<string, string>),
    NODE_ENV: 'production', // previously sent logs to stdout and corrupted the protocol
    LOG_LEVEL: 'info',
  },
  cwd: resolve('tests/fixtures/e2e'),
});

const client = new Client({ name: 'e2e-test', version: '0.0.0' }, { capabilities: {} });
await client.connect(transport);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
for (const expected of [
  'start_swarm', 'run_pipeline', 'spawn_agent', 'send_agent_message', 'list_agents',
  'terminate_agent', 'get_task_status', 'list_jobs', 'approve_checkpoint', 'get_config',
  'invoke_session', 'invoke_sessions_parallel', 'send_session_message', 'check_inbox', 'wait_for_inbox', 'list_sessions',
  'get_session_transcript', 'pause_session', 'resume_session', 'terminate_session',
  'broadcast_session_message', 'kill_all_sessions',
]) {
  assert.ok(names.includes(expected), `missing tool: ${expected}`);
}

const text = (r: any) => JSON.parse(r.content[0].text);

const cfg = text(await client.callTool({ name: 'get_config', arguments: {} }));
assert.ok(cfg.server.port);

const jobs = text(await client.callTool({ name: 'list_jobs', arguments: {} }));
assert.ok(Array.isArray(jobs.jobs));

const missing = text(await client.callTool({ name: 'get_task_status', arguments: { job_id: 'nope' } }));
assert.strictEqual(missing.error, 'Job not found');

const bad = text(await client.callTool({ name: 'run_pipeline', arguments: { pipeline_name: 'does-not-exist' } }));
assert.match(bad.error, /Pipeline not found/);

const sess = text(await client.callTool({
  name: 'invoke_session',
  arguments: { name: 'Idle', role: 'Tester', system_prompt: 'x', provider: 'agy' },
}));
assert.strictEqual(sess.status, 'idle');
const listed = text(await client.callTool({ name: 'list_sessions', arguments: {} }));
assert.ok(listed.sessions.some((s: any) => s.id === sess.session_id));
const killed = text(await client.callTool({ name: 'kill_all_sessions', arguments: {} }));
assert.ok(killed.terminated_count >= 1);

await client.close();
console.log(`✅ E2E stdio smoke test passed (${names.length} tools, protocol stream clean)`);
