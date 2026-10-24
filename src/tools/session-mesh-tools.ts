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
    'Spawn an independent specialist agent in an isolated session with its own context window, model/cost tier, system prompt, and tools. Supports preset personas (agent_preset) and model tiering (fast/balanced/heavy) to save cost while multiplying effective context.',
    {
      name: z.string().optional().describe('Human-readable name for the specialist agent (optional if agent_preset is provided)'),
      role: z.string().optional().describe('Role or title of the specialist (optional if agent_preset is provided)'),
      system_prompt: z.string().optional().describe('Instructions defining the specialist persona (optional if agent_preset is provided)'),
      agent_preset: z.string().optional().describe('Preset specialist from config (e.g. "researcher", "coder", "reviewer", "frontend-designer")'),
      tier: z
        .enum(['fast', 'balanced', 'heavy'])
        .optional()
        .describe('Cost & capability tier: "fast" (low-cost exploration/subtasks), "balanced" (standard implementation), "heavy" (frontier reasoning/auditing)'),
      model: z.string().optional().describe('Explicit model override (e.g. "claude-sonnet-4-6", "gemini-3.8-flash-high", "gemini-3.8-flash-lite")'),
      provider: z.string().optional().describe('Inference provider ("agy", "agy_claude", "gemini", "anthropic", "openai", "ollama")'),
      allowed_tools: z.array(z.string()).optional().describe('Tools the specialist is allowed to use (default: preset tools or all)'),
      workspace_path: z.string().optional().describe('Workspace directory path for tool execution (default: "./")'),
      safety_mode: z.enum(['autonomous', 'semi-autonomous', 'safe']).optional().describe('Safety execution mode'),
      parent_session_id: z.string().optional().describe('ID of the calling parent session (default: "parent-session")'),
      initial_message: z.string().optional().describe('Initial task or message to start execution with'),
      goal: z.string().optional().describe('Alias for initial_message: the task or goal for this isolated session to execute'),
      await_response: z.boolean().optional().default(true).describe('If true (default), waits for execution to finish and returns the distilled response. If false, runs asynchronously in background.'),
      max_iterations: z.number().optional().describe('Max tool-use loops allowed (default: 20)'),
    },
    async (params) => {
      try {
        const taskMessage = params.initial_message ?? params.goal;
        const result = await sessionManager.invokeSession({
          name: params.name,
          role: params.role,
          system_prompt: params.system_prompt,
          agent_preset: params.agent_preset,
          tier: params.tier,
          model: params.model,
          provider: params.provider,
          allowed_tools: params.allowed_tools,
          workspace_path: params.workspace_path,
          safety_mode: params.safety_mode,
          parent_session_id: params.parent_session_id ?? 'parent-session',
          initial_message: taskMessage,
          await_response: params.await_response ?? true,
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

  // ── 1b. invoke_sessions_parallel ────────────────────────────────
  server.tool(
    'invoke_sessions_parallel',
    'Fan out multiple tasks across separate isolated AI sessions in parallel, each with its own fresh context window and custom model/tier ("fast", "balanced", "heavy"). Multiplies effective context window capacity while keeping the main session clean.',
    {
      sessions: z
        .array(
          z.object({
            name: z.string().optional().describe('Session name'),
            role: z.string().optional().describe('Session role'),
            agent_preset: z.string().optional().describe('Optional preset specialist name (e.g. "researcher", "coder", "reviewer")'),
            system_prompt: z.string().optional().describe('Custom system prompt'),
            tier: z.enum(['fast', 'balanced', 'heavy']).optional().describe('Model cost/capability tier ("fast", "balanced", "heavy")'),
            model: z.string().optional().describe('Explicit model override'),
            provider: z.string().optional().describe('Explicit provider override'),
            allowed_tools: z.array(z.string()).optional().describe('Allowed tool names'),
            workspace_path: z.string().optional().describe('Workspace path'),
            safety_mode: z.enum(['autonomous', 'semi-autonomous', 'safe']).optional(),
            initial_message: z.string().optional().describe('Task prompt for this parallel session'),
            goal: z.string().optional().describe('Alias for initial_message: task prompt for this parallel session'),
            max_iterations: z.number().optional(),
          }),
        )
        .min(1)
        .describe('List of isolated sessions to spin up concurrently'),
      parent_session_id: z.string().optional().default('parent-session').describe('Calling parent session ID'),
      await_all: z.boolean().optional().default(true).describe('If true (default), awaits all parallel sessions and returns their distilled responses together. If false, runs all in background.'),
    },
    async ({ sessions, parent_session_id, await_all }) => {
      try {
        const normalizedSessions = sessions.map((s) => ({
          ...s,
          initial_message: s.initial_message ?? s.goal ?? 'Complete assigned role task.',
        }));
        const result = await sessionManager.invokeSessionsParallel({
          sessions: normalizedSessions,
          parent_session_id,
          await_all,
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
      await_response: z.boolean().optional().default(true).describe('Whether to wait synchronously for response (default: true) or dispatch asynchronously to the inbox queue (false)'),
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

  // ── 3b. wait_for_inbox ──────────────────────────────────────────
  server.tool(
    'wait_for_inbox',
    'Event-driven wait for background child sessions to deliver a message to the inbox (no polling needed). Returns immediately if unread messages are already present.',
    {
      session_id: z.string().optional().default('parent-session').describe('Session ID whose inbox to wait on (default: "parent-session")'),
      timeout_ms: z.number().optional().default(60000).describe('Max milliseconds to wait before returning (default: 60000)'),
      mark_as_read: z.boolean().optional().default(true).describe('Whether to mark retrieved messages as read'),
    },
    async ({ session_id, timeout_ms, mark_as_read }) => {
      try {
        const res = await sessionManager.waitForInbox(session_id, timeout_ms, mark_as_read);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ session_id, timed_out: res.timed_out, message_count: res.messages.length, messages: res.messages }, null, 2),
            },
          ],
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
    'List all agent sessions currently registered in the orchestrator mesh, including their roles, models, cost tiers, real-time statuses, and Context Firewall token savings.',
    {
      filter: z.enum(['all', 'active', 'my_children']).optional().default('all').describe('Filter criteria: "all" sessions, "active" sessions, or "my_children"'),
      parent_session_id: z.string().optional().default('parent-session').describe('Parent session ID used when filter is "my_children"'),
    },
    async ({ filter, parent_session_id }) => {
      try {
        const [sessions, mesh_stats] = await Promise.all([
          sessionManager.listSessions(parent_session_id, filter),
          sessionManager.getMeshStats(),
        ]);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ filter, count: sessions.length, mesh_stats, sessions }, null, 2) }],
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
