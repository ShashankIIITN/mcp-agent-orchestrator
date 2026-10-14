import assert from 'node:assert';
import { resolve } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { SqliteStorageAdapter } from '../src/storage/sqlite-adapter.js';
import { BuiltinToolRegistry } from '../src/builtin-tools/tool-registry.js';
import { ProviderRegistry } from '../src/inference/provider-registry.js';
import { SessionManager } from '../src/sessions/session-manager.js';
import { loadConfig } from '../src/config/loader.js';
import type { LLMProvider, ChatMessage, CompletionResponse } from '../src/inference/types.js';

// Deterministic Mock LLM for integration testing
class MockSessionLLMProvider implements LLMProvider {
  readonly name = 'mock-llm';
  async complete(messages: ChatMessage[]): Promise<CompletionResponse> {
    const lastMsg = messages[messages.length - 1];
    return {
      content: `Specialist received: "${lastMsg.content}". Analysis complete.`,
      finish_reason: 'stop',
    };
  }
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

async function runSessionMeshTests() {
  console.log('🌐 Starting Cross-Session Agent Mesh Integration Tests...\n');

  const testDbPath = resolve('./data/test-session-mesh.db');
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${testDbPath}${suffix}`;
    if (existsSync(p)) {
      try { unlinkSync(p); } catch {}
    }
  }

  const config = loadConfig();
  const storage = new SqliteStorageAdapter(testDbPath);
  await storage.init();

  const providerRegistry = new ProviderRegistry();
  const mockProvider = new MockSessionLLMProvider();
  providerRegistry.register('mock', mockProvider);
  providerRegistry.register('agy', mockProvider);

  const toolRegistry = new BuiltinToolRegistry();
  const sessionManager = new SessionManager(storage, providerRegistry, toolRegistry, config);

  // ── Test 1: invoke_session (Synchronous delegation) ─────────────
  console.log('1️⃣ Testing invokeSession with synchronous execution (await_response: true)...');
  const syncSession = await sessionManager.invokeSession({
    name: 'SecurityAuditor',
    role: 'Security Vulnerability Specialist',
    system_prompt: 'You audit dependencies and source code for security flaws.',
    provider: 'mock',
    model: 'claude-sonnet-4-6',
    initial_message: 'Audit package.json for known vulnerabilities',
    await_response: true,
    parent_session_id: 'coordinator-session-1',
  });

  assert.ok(syncSession.session_id, 'Session ID must be created');
  assert.strictEqual(syncSession.name, 'SecurityAuditor');
  assert.strictEqual(syncSession.status, 'completed');
  assert.ok(syncSession.response?.includes('Analysis complete'), 'Should contain LLM response');
  console.log('   ✅ Synchronous session invoked and responded successfully.\n');

  // ── Test 2: check_inbox for Parent ──────────────────────────────
  console.log('2️⃣ Testing checkInbox for coordinator session...');
  const coordinatorInbox = await sessionManager.checkInbox('coordinator-session-1', false);
  assert.ok(coordinatorInbox.length >= 1, 'Coordinator inbox should have received the specialist reply');
  assert.strictEqual(coordinatorInbox[0].sender_session_id, syncSession.session_id);
  assert.ok(coordinatorInbox[0].content.includes('Analysis complete'));
  console.log('   ✅ Coordinator inbox received specialist deliverable.\n');

  // ── Test 3: invoke_session (Asynchronous background delegation) ─
  console.log('3️⃣ Testing invokeSession with asynchronous execution (background worker)...');
  const asyncSession = await sessionManager.invokeSession({
    name: 'CodeArchitect',
    role: 'Software Architecture Specialist',
    system_prompt: 'You design modular software architectures.',
    provider: 'mock',
    model: 'gemini-3.8-flash-high',
    initial_message: 'Draft UML system diagram',
    await_response: false,
    parent_session_id: 'coordinator-session-1',
  });

  assert.ok(asyncSession.session_id, 'Async Session ID must be generated');
  assert.strictEqual(asyncSession.status, 'running');

  // Allow background microtask queue to process
  await new Promise((r) => setTimeout(r, 200));

  const afterAsyncInbox = await sessionManager.checkInbox('coordinator-session-1', false);
  assert.ok(afterAsyncInbox.length >= 2, 'Coordinator should now have both deliverables in inbox');
  console.log('   ✅ Asynchronous background session executed and reported to inbox.\n');

  // ── Test 4: send_session_message ────────────────────────────────
  console.log('4️⃣ Testing sendSessionMessage (follow-up task to child session)...');
  const reply = await sessionManager.sendSessionMessage({
    sender_session_id: 'coordinator-session-1',
    target_session_id: syncSession.session_id,
    content: 'Now check src/server.ts for exposed tokens',
    await_response: true,
  });

  assert.strictEqual(reply.success, true);
  assert.ok(reply.response?.includes('exposed tokens'));
  console.log('   ✅ Follow-up message processed and response received.\n');

  // ── Test 5: list_sessions hierarchy ─────────────────────────────
  console.log('5️⃣ Testing listSessions with filters...');
  const allSessions = await sessionManager.listSessions();
  assert.ok(allSessions.length >= 2, 'Should list at least two sessions');

  const myChildren = await sessionManager.listSessions('coordinator-session-1', 'my_children');
  assert.ok(myChildren.length >= 2, 'Should list both child sessions');
  console.log(`   ✅ Mesh listing verified (${allSessions.length} total sessions tracked).\n`);

  // ── Test 6: get_session_transcript ──────────────────────────────
  console.log('6️⃣ Testing getSessionTranscript...');
  const transcript = await sessionManager.getSessionTranscript(syncSession.session_id);
  assert.strictEqual(transcript.session?.name, 'SecurityAuditor');
  assert.ok(transcript.messages.length >= 2, 'Should have multiple recorded messages');
  console.log(`   ✅ Transcript retrieved with ${transcript.messages.length} messages.\n`);

  // ── Test 7: pause_session and resume_session ─────────────────────
  console.log('7️⃣ Testing pauseSession and resumeSession flow control...');
  await sessionManager.pauseSession(asyncSession.session_id);
  const pausedList = await sessionManager.listSessions();
  const pausedSession = pausedList.find((s) => s.id === asyncSession.session_id);
  assert.strictEqual(pausedSession?.status, 'paused');

  // Sending message to paused session should fail cleanly
  let pauseErrorCaught = false;
  try {
    await sessionManager.sendSessionMessage({
      target_session_id: asyncSession.session_id,
      content: 'Should not execute while paused',
    });
  } catch (err) {
    pauseErrorCaught = true;
  }
  assert.ok(pauseErrorCaught, 'Sending message to paused session must throw error');

  // Resume
  await sessionManager.resumeSession(asyncSession.session_id);
  const resumedList = await sessionManager.listSessions();
  const resumedSession = resumedList.find((s) => s.id === asyncSession.session_id);
  assert.strictEqual(resumedSession?.status, 'idle');
  console.log('   ✅ Session pausing and resuming verified.\n');

  // ── Test 8: broadcastMessage ────────────────────────────────────
  console.log('8️⃣ Testing broadcastMessage across active child sessions...');
  const broadcastResult = await sessionManager.broadcastMessage({
    sender_session_id: 'coordinator-session-1',
    parent_session_id: 'coordinator-session-1',
    content: 'PRIORITY ALERT: All agents pause local modifications and commit changes.',
  });

  assert.strictEqual(broadcastResult.broadcast_count, 2);
  console.log(`   ✅ Directive broadcast to ${broadcastResult.broadcast_count} child sessions.\n`);

  // ── Test 9: terminate_session and killAllSessions ───────────────
  console.log('9️⃣ Testing session termination and emergency shutdown...');
  await sessionManager.terminateSession(syncSession.session_id);
  const afterTermList = await sessionManager.listSessions();
  const termSession = afterTermList.find((s) => s.id === syncSession.session_id);
  assert.strictEqual(termSession?.status, 'terminated');

  const killResult = await sessionManager.killAllSessions();
  assert.ok(killResult.terminated_count >= 1, 'Should terminate remaining sessions');
  console.log(`   ✅ Teardown complete. (${killResult.terminated_count} sessions killed).\n`);

  await storage.close();
  console.log('🎉 ALL CROSS-SESSION AGENT MESH INTEGRATION TESTS PASSED!\n');
}

runSessionMeshTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
