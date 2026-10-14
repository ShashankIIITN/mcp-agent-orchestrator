import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

async function runMcpClientDemo() {
  console.log('🚀 Launching MCP Agent Orchestrator over Stdio Transport...\n');

  const serverScript = resolve('./dist/index.js');
  const configFile = resolve('./orchestrator.yaml');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverScript, configFile],
    stderr: 'pipe',
  });

  // Capture server stderr logs for diagnostics
  if (transport.stderr) {
    transport.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) {
        // Uncomment to see debug logs:
        // console.error(`   [server stderr]: ${msg}`);
      }
    });
  }

  const client = new Client(
    { name: 'mcp-test-client', version: '0.2.0' },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.log('✅ Connected to MCP Agent Orchestrator via Stdio Transport!\n');

  // ── Step 1: List Tools ──────────────────────────────────────────
  console.log('📋 STEP 1: Querying available MCP Tools via `tools/list`...');
  const toolsResult = await client.listTools();
  console.log(`   Discovered ${toolsResult.tools.length} active MCP tools:`);
  for (const t of toolsResult.tools) {
    console.log(`   - 🔧 ${t.name}: ${t.description.slice(0, 75)}...`);
  }
  console.log('');

  // ── Step 2: Call get_config ─────────────────────────────────────
  console.log('⚙️ STEP 2: Calling `get_config` via MCP...');
  const configResponse = await client.callTool({
    name: 'get_config',
    arguments: {},
  });
  const configContent = configResponse.content as Array<{ type: string; text: string }>;
  const parsedConfig = JSON.parse(configContent[0].text);
  console.log(`   Config Version: ${parsedConfig.version}`);
  console.log(`   Inference Providers: ${Object.keys(parsedConfig.inference.providers).join(', ')}`);
  console.log(`   Available Agents: ${Object.keys(parsedConfig.agents).join(', ')}\n`);

  // ── Step 3: Call list_sessions ──────────────────────────────────
  console.log('🌐 STEP 3: Calling `list_sessions` via MCP...');
  const initialSessions = await client.callTool({
    name: 'list_sessions',
    arguments: { filter: 'all' },
  });
  const sessionsContent = initialSessions.content as Array<{ type: string; text: string }>;
  console.log(`   Response: ${sessionsContent[0].text}\n`);

  // ── Step 4: Call invoke_session ─────────────────────────────────
  console.log('🤖 STEP 4: Calling `invoke_session` to spawn a specialist session...');
  const invokeResult = await client.callTool({
    name: 'invoke_session',
    arguments: {
      name: 'SecurityExpert',
      role: 'Application Security Auditor',
      system_prompt: 'You are an AppSec specialist.',
      model: 'gemini-3.8-flash-high',
      parent_session_id: 'parent-host-1',
      initial_message: 'Please verify that our workspace security constraints are active.',
      await_response: false, // background execution
    },
  });
  const invokeContent = invokeResult.content as Array<{ type: string; text: string }>;
  const parsedInvoke = JSON.parse(invokeContent[0].text);
  console.log(`   Spawned Session ID: ${parsedInvoke.session_id}`);
  console.log(`   Status: ${parsedInvoke.status}`);
  console.log(`   Role: ${parsedInvoke.role}`);
  console.log(`   Message: ${parsedInvoke.message}\n`);

  // ── Step 5: Wait briefly and check inbox ────────────────────────
  console.log('📬 STEP 5: Waiting 500ms for background processing and calling `check_inbox`...');
  await new Promise((r) => setTimeout(r, 500));

  const inboxResult = await client.callTool({
    name: 'check_inbox',
    arguments: {
      session_id: 'parent-host-1',
      unread_only: false,
    },
  });
  const inboxContent = inboxResult.content as Array<{ type: string; text: string }>;
  console.log(`   Inbox Result: ${inboxContent[0].text}\n`);

  // ── Step 6: Call list_sessions to see real-time state ───────────
  console.log('📊 STEP 6: Calling `list_sessions` to verify active state...');
  const updatedSessions = await client.callTool({
    name: 'list_sessions',
    arguments: { filter: 'all' },
  });
  const updatedContent = updatedSessions.content as Array<{ type: string; text: string }>;
  console.log(`   Updated Sessions: ${updatedContent[0].text}\n`);

  // ── Step 7: Call terminate_session ──────────────────────────────
  console.log('🛑 STEP 7: Calling `terminate_session` to clean up...');
  const termResult = await client.callTool({
    name: 'terminate_session',
    arguments: {
      session_id: parsedInvoke.session_id,
    },
  });
  const termContent = termResult.content as Array<{ type: string; text: string }>;
  console.log(`   Termination Result: ${termContent[0].text}\n`);

  // Close client transport cleanly
  await client.close();
  console.log('🎉 MCP CLIENT DEMO COMPLETE: Stdio transport closed gracefully!\n');
  process.exit(0);
}

runMcpClientDemo().catch((err) => {
  console.error('❌ MCP client demo error:', err);
  process.exit(1);
});
