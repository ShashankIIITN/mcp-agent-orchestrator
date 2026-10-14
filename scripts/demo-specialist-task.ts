import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

async function runSpecialistTaskDemo() {
  console.log('⚡ Running End-to-End Specialist Task via MCP Stdio Transport...\n');

  const serverScript = resolve('./dist/index.js');
  const configFile = resolve('./orchestrator.yaml');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverScript, configFile],
    stderr: 'pipe',
  });

  const client = new Client(
    { name: 'mcp-specialist-tester', version: '0.2.0' },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.log('✅ Connected to MCP Agent Orchestrator!\n');

  console.log('🤖 Invoking specialist "CodeArchitect" in background session:');
  console.log('   Task: "Analyze what files exist in the project root and explain their roles in 3 bullet points."\n');

  const invokeResult = await client.callTool({
    name: 'invoke_session',
    arguments: {
      name: 'CodeArchitect',
      role: 'Senior Software Architect',
      system_prompt: 'You are a software architect. Answer in 3 concise bullet points.',
      model: 'gemini-3.8-flash-high',
      provider: 'agy',
      parent_session_id: 'parent-session',
      initial_message: 'Analyze what files exist in the project root and explain their roles in 3 bullet points.',
      await_response: false, // non-blocking asynchronous dispatch
    },
  });

  const invokeContent = invokeResult.content as Array<{ type: string; text: string }>;
  const result = JSON.parse(invokeContent[0].text);

  console.log('📤 SESSION INVOCATION DISPATCHED:');
  console.log(`   Session ID       : ${result.session_id}`);
  console.log(`   Initial Status   : ${result.status}`);
  console.log(`   Specialist Role  : ${result.role}`);
  console.log(`   Message          : ${result.message}\n`);

  console.log('⏳ Polling parent inbox via `check_inbox` while specialist works in background...');

  let replyFound = false;
  let attempts = 0;
  const maxAttempts = 30; // up to ~90s

  while (!replyFound && attempts < maxAttempts) {
    attempts++;
    await new Promise((r) => setTimeout(r, 3000));
    process.stdout.write(`   Polling attempt ${attempts}/${maxAttempts}... `);

    const inboxResult = await client.callTool({
      name: 'check_inbox',
      arguments: {
        session_id: 'parent-session',
        unread_only: false,
      },
    });

    const inboxContent = inboxResult.content as Array<{ type: string; text: string }>;
    const inboxData = JSON.parse(inboxContent[0].text);

    // Look for reply from this specific specialist
    const reply = inboxData.messages.find(
      (m: { sender_session_id: string }) => m.sender_session_id === result.session_id,
    );

    if (reply) {
      console.log('📬 DELIVERABLE RECEIVED!\n');
      console.log('📥 SPECIALIST DELIVERABLE:');
      console.log('----------------------------------------------------');
      console.log(`From    : Session ${reply.sender_session_id}`);
      console.log(`Type    : ${reply.message_type}`);
      console.log(`Date    : ${reply.created_at}`);
      console.log('Content :\n');
      console.log(reply.content);
      console.log('----------------------------------------------------\n');
      replyFound = true;
    } else {
      console.log('working...');
    }
  }

  if (!replyFound) {
    console.log('\n⚠️ Specialist task is still running in background. Session remains active.');
  }

  // Verify transcript recorded in SQLite
  console.log('📜 Retrieving session transcript via `get_session_transcript`...');
  const transcriptResult = await client.callTool({
    name: 'get_session_transcript',
    arguments: { session_id: result.session_id },
  });
  const transcriptContent = transcriptResult.content as Array<{ type: string; text: string }>;
  const transcript = JSON.parse(transcriptContent[0].text);
  console.log(`   Recorded in SQLite: ${transcript.messages.length} conversation messages, ${transcript.inbox.length} inbox records.\n`);

  // Clean up
  await client.callTool({
    name: 'terminate_session',
    arguments: { session_id: result.session_id },
  });
  console.log('🛑 Specialist session terminated and archived.');

  await client.close();
  console.log('✨ SPECIALIST DEMO COMPLETED SUCCESSFULLY!\n');
  process.exit(0);
}

runSpecialistTaskDemo().catch((err) => {
  console.error('❌ Specialist demo error:', err);
  process.exit(1);
});
