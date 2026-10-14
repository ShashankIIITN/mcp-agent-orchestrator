import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from '../sessions/session-manager.js';

export function registerSessionMeshTools(
  server: McpServer,
  sessionManager: SessionManager,
): void {
  // ── 1. invoke_session ───────────────────────────────────────────
  server.tool(
    'invoke_session',
    'Spawn an independent specialist agent in an isolated session with its own model, memory, system prompt, and tools. Maintains a bilateral communication channel with the parent.',
    {
      name: z.string().describe('Human-readable name for the specialist agent (e.g. "SecurityAuditor", "CodeArchitect")'),
      role: z.string().describe('Role or title of the specialist (e.g. "Security Vulnerability Auditor")'),
      system_prompt: z.string().describe('Instructions and behavioral guidelines defining the specialist persona'),
      model: z.string().optional().describe('Model override (e.g. "claude-sonnet-4-6", "gemini-3.8-flash-high")'),
      provider: z.string().optional().describe('Inference provider ("agy", "gemini", "anthropic", "openai", etc.)'),
      allowed_tools: z.array(z.string()).optional().describe('Tools the specialist is allowed to use (default: all)'),
      workspace_path: z.string().optional().describe('Workspace directory path for tool execution (default: "./")'),
      safety_mode: z.enum(['autonomous', 'semi-autonomous', 'safe']).optional().describe('Safety execution mode'),
      parent_session_id: z.string().optional().describe('ID of the calling parent session (default: "parent-session")'),
      initial_message: z.string().optional().describe('Initial task or message to start execution with'),
      await_response: z.boolean().optional().default(false).describe('If true, waits for initial execution to finish before returning. If false, runs asynchronously in background.'),
      max_iterations: z.number().optional().describe('Max tool-use loops allowed (default: 20)'),
    },
    async (params) => {
      try {
        const result = await sessionManager.invokeSession({
          name: params.name,
          role: params.role,
          system_prompt: params.system_prompt,
          model: params.model,
          provider: params.provider,
          allowed_tools: params.allowed_tools,
          workspace_path: params.workspace_path,
          safety_mode: params.safety_mode,
          parent_session_id: params.parent_session_id ?? 'parent-session',
          initial_message: params.initial_message,
          await_response: params.await_response,
          max_iterations: params.max_iterations,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            },
          ],
        };
      }
    },
  );

  // ── 2. send_session_message ─────────────────────────────────────
  server.tool(
    'send_session_message',
    'Send an instruction or follow-up message to a specific agent session in the mesh. Can run asynchronously into the inbox or await the result directly.',
    {
      target_session_id: z.string().describe('ID of the target recipient session'),
      content: z.string().describe('Task instruction or message to send'),
      sender_session_id: z.string().optional().describe('ID of the sender session (default: "parent-session")'),
      await_response: z.boolean().optional().default(false).describe('Whether to wait synchronously for response or dispatch asynchronously to the inbox queue'),
      message_type: z
        .enum(['text', 'tool_result', 'checkpoint_escalation', 'completion', 'broadcast'])
        .optional()
        .describe('Message type indicator (default: "text")'),
    },
    async (params) => {
      try {
        const result = await sessionManager.sendSessionMessage({
          target_session_id: params.target_session_id,
          content: params.content,
          sender_session_id: params.sender_session_id ?? 'parent-session',
          await_response: params.await_response,
          message_type: params.message_type,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            },
          ],
        };
      }
    },
  );

  // ── 3. check_inbox ──────────────────────────────────────────────
  server.tool(
    'check_inbox',
    'Check inbox for incoming messages, updates, or deliverables from spawned specialist sessions.',
    {
      session_id: z.string().optional().default('parent-session').describe('Session ID whose inbox to check (default: "parent-session")'),
      unread_only: z.boolean().optional().default(true).describe('If true, returns only unread messages. If false, returns all historical messages.'),
      mark_as_read: z.boolean().optional().default(true).describe('Whether to mark retrieved messages as read'),
    },
    async ({ session_id, unread_only, mark_as_read }) => {
      try {
        const messages = await sessionManager.checkInbox(session_id, unread_only, mark_as_read);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ session_id, message_count: messages.length, messages }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            },
          ],
        };
      }
    },
  );

  // ── 4. list_sessions ────────────────────────────────────────────
  server.tool(
    'list_sessions',
    'List all agent sessions currently registered in the orchestrator mesh, including their roles, models, and real-time statuses.',
    {
      filter: z.enum(['all', 'active', 'my_children']).optional().default('all').describe('Filter criteria: "all" sessions, "active" sessions, or "my_children"'),
      parent_session_id: z.string().optional().default('parent-session').describe('Parent session ID used when filter is "my_children"'),
    },
    async ({ filter, parent_session_id }) => {
      try {
        const sessions = await sessionManager.listSessions(parent_session_id, filter);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ filter, count: sessions.length, sessions }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            },
          ],
        };
      }
    },
  );

  // ── 5. get_session_transcript ───────────────────────────────────
  server.tool(
    'get_session_transcript',
    'Retrieve complete conversation logs, tool invocations, and inbox events for a specific session.',
    {
      session_id: z.string().describe('ID of the session to inspect'),
    },
    async ({ session_id }) => {
      try {
        const transcript = await sessionManager.getSessionTranscript(session_id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(transcript, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            },
          ],
        };
      }
    },
  );

  // ── 6. pause_session ────────────────────────────────────────────
  server.tool(
    'pause_session',
    'Pause execution of an active session in the mesh.',
    {
      session_id: z.string().describe('ID of the session to pause'),
    },
    async ({ session_id }) => {
      try {
        await sessionManager.pauseSession(session_id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, session_id, status: 'paused' }) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            },
          ],
        };
      }
    },
  );

  // ── 7. resume_session ───────────────────────────────────────────
  server.tool(
    'resume_session',
    'Resume execution of a paused session in the mesh.',
    {
      session_id: z.string().describe('ID of the session to resume'),
    },
    async ({ session_id }) => {
      try {
        await sessionManager.resumeSession(session_id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, session_id, status: 'idle' }) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            },
          ],
        };
      }
    },
  );

  // ── 8. terminate_session ────────────────────────────────────────
  server.tool(
    'terminate_session',
    'Terminate an active session and close its bilateral communication channel.',
    {
      session_id: z.string().describe('ID of the session to terminate'),
    },
    async ({ session_id }) => {
      try {
        await sessionManager.terminateSession(session_id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, session_id, status: 'terminated' }) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            },
          ],
        };
      }
    },
  );

  // ── 9. broadcast_session_message ────────────────────────────────
  server.tool(
    'broadcast_session_message',
    'Broadcast a directive or prompt simultaneously to all active child sessions (or all mesh sessions).',
    {
      content: z.string().describe('Directive or announcement content to broadcast'),
      sender_session_id: z.string().optional().default('parent-session').describe('Sender session ID (default: "parent-session")'),
      parent_session_id: z.string().optional().describe('If specified, only broadcast to sessions belonging to this parent'),
    },
    async ({ content, sender_session_id, parent_session_id }) => {
      try {
        const result = await sessionManager.broadcastMessage({
          content,
          sender_session_id,
          parent_session_id,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            },
          ],
        };
      }
    },
  );

  // ── 10. kill_all_sessions ───────────────────────────────────────
  server.tool(
    'kill_all_sessions',
    'Emergency stop and terminate all active sessions (or all children of a parent session).',
    {
      parent_session_id: z.string().optional().describe('If specified, only terminate sessions belonging to this parent'),
    },
    async ({ parent_session_id }) => {
      try {
        const result = await sessionManager.killAllSessions(parent_session_id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            },
          ],
        };
      }
    },
  );
}
