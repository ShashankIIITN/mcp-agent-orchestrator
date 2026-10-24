import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLogger } from '../utils/logger.js';
import { eventBus } from '../dashboard/events.js';
import type {
  StorageAdapter,
  JobDefinition,
  JobRecord,
  JobStatus,
  MessageRecord,
  CheckpointRecord,
  SessionRecord,
  SessionStatus,
  InboxMessageRecord,
} from './types.js';

const logger = createLogger('sqlite-adapter');

export class SqliteStorageAdapter implements StorageAdapter {
  private db!: Database.Database;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    // Ensure the parent directory exists
    mkdirSync(dirname(this.dbPath), { recursive: true });

    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.createTables();
    this.reconcileStaleRecords();

    logger.info({ path: this.dbPath }, 'SQLite storage initialized');
  }

  /**
   * Reconcile stale 'running' sessions and synthetic interactive job rows from prior process runs
   * so dashboard telemetry is immediately accurate on startup.
   */
  private reconcileStaleRecords(): void {
    try {
      const now = new Date().toISOString();
      this.db
        .prepare("UPDATE agent_sessions SET status = 'idle', updated_at = ? WHERE status = 'running'")
        .run(now);

      // Sync synthetic interactive job rows created for sessions
      this.db.exec(`
        UPDATE jobs
        SET status = CASE
              WHEN (SELECT status FROM agent_sessions WHERE agent_sessions.id = jobs.id) = 'error' THEN 'failed'
              ELSE 'completed'
            END,
            progress = 100,
            current_step = 'Session turn completed',
            output = COALESCE(
              output,
              (SELECT content FROM agent_messages WHERE agent_messages.job_id = jobs.id AND role = 'assistant' ORDER BY timestamp DESC LIMIT 1)
            )
        WHERE mode = 'interactive'
          AND status = 'running'
          AND EXISTS (SELECT 1 FROM agent_sessions WHERE agent_sessions.id = jobs.id AND agent_sessions.status != 'running');
      `);
    } catch (err) {
      logger.warn({ error: err }, 'Failed to reconcile stale records on init');
    }
  }

  async close(): Promise<void> {
    this.db.close();
    logger.info('SQLite storage closed');
  }

  // ── Schema ─────────────────────────────────────────────────────

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id              TEXT PRIMARY KEY,
        goal            TEXT NOT NULL,
        mode            TEXT NOT NULL CHECK(mode IN ('swarm','interactive','pipeline')),
        pipeline_name   TEXT,
        workspace_path  TEXT,
        safety_mode     TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'queued',
        progress        REAL NOT NULL DEFAULT 0,
        current_step    TEXT,
        output          TEXT,
        config          TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_messages (
        id          TEXT PRIMARY KEY,
        job_id      TEXT NOT NULL,
        agent_id    TEXT NOT NULL,
        role        TEXT NOT NULL CHECK(role IN ('system','user','assistant','tool')),
        content     TEXT NOT NULL,
        tool_calls  TEXT,
        timestamp   TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_agent_messages_job_agent
        ON agent_messages(job_id, agent_id);

      CREATE TABLE IF NOT EXISTS artifacts (
        id          TEXT PRIMARY KEY,
        job_id      TEXT NOT NULL,
        name        TEXT NOT NULL,
        content     TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        UNIQUE(job_id, name)
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        id                  TEXT PRIMARY KEY,
        job_id              TEXT NOT NULL,
        stage_name          TEXT NOT NULL,
        action_description  TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        feedback            TEXT,
        created_at          TEXT NOT NULL,
        resolved_at         TEXT,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agent_sessions (
        id                TEXT PRIMARY KEY,
        parent_session_id TEXT,
        name              TEXT NOT NULL,
        role              TEXT NOT NULL,
        provider          TEXT NOT NULL,
        model             TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'idle',
        system_prompt     TEXT,
        workspace_path    TEXT,
        safety_mode       TEXT,
        total_tool_calls  INTEGER NOT NULL DEFAULT 0,
        iterations        INTEGER NOT NULL DEFAULT 0,
        last_error        TEXT,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        FOREIGN KEY (parent_session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS session_inbox (
        id                    TEXT PRIMARY KEY,
        sender_session_id     TEXT NOT NULL,
        recipient_session_id  TEXT NOT NULL,
        content               TEXT NOT NULL,
        message_type          TEXT NOT NULL,
        read                  INTEGER NOT NULL DEFAULT 0,
        created_at            TEXT NOT NULL,
        FOREIGN KEY (sender_session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_session_inbox_recipient
        ON session_inbox(recipient_session_id, read);
    `);
  }

  // ── Jobs ───────────────────────────────────────────────────────

  async createJob(job: JobDefinition): Promise<string> {
    const id = nanoid();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO jobs (id, goal, mode, pipeline_name, workspace_path, safety_mode, status, progress, config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)
    `);

    stmt.run(
      id,
      job.goal,
      job.mode,
      job.pipeline_name ?? null,
      job.workspace_path ?? null,
      job.safety_mode,
      job.config ? JSON.stringify(job.config) : null,
      now,
      now,
    );

    logger.info({ jobId: id, mode: job.mode }, 'Job created');
    eventBus.emitJobEvent('job_created', id, { goal: job.goal, mode: job.mode, status: 'queued' });
    return id;
  }

  async getJob(jobId: string): Promise<JobRecord | null> {
    const stmt = this.db.prepare('SELECT * FROM jobs WHERE id = ?');
    const row = stmt.get(jobId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToJob(row);
  }

  async listJobs(limit = 20): Promise<JobRecord[]> {
    const stmt = this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(limit) as Record<string, unknown>[];
    return rows.map((r) => this.rowToJob(r));
  }

  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    updates?: Partial<Pick<JobRecord, 'progress' | 'current_step' | 'output'>>,
  ): Promise<void> {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE jobs
      SET status = ?, progress = COALESCE(?, progress), current_step = COALESCE(?, current_step), output = COALESCE(?, output), updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      status,
      updates?.progress ?? null,
      updates?.current_step ?? null,
      updates?.output ?? null,
      now,
      jobId,
    );

    logger.debug({ jobId, status }, 'Job status updated');
    eventBus.emitJobEvent('job_updated', jobId, { status, ...updates });
  }

  // ── Agent Messages ─────────────────────────────────────────────

  async saveAgentMessage(
    jobId: string,
    agentId: string,
    message: Omit<MessageRecord, 'id' | 'timestamp'>,
  ): Promise<string> {
    const id = nanoid();
    const timestamp = new Date().toISOString();

    // Ensure parent job exists to satisfy foreign key constraint
    const jobExists = this.db.prepare('SELECT 1 FROM jobs WHERE id = ?').get(jobId);
    if (!jobExists) {
      const sess = this.db
        .prepare('SELECT name, role, workspace_path, safety_mode FROM agent_sessions WHERE id = ?')
        .get(jobId) as { name: string; role: string; workspace_path?: string; safety_mode?: string } | undefined;
      const goalText = sess
        ? `[Session] ${sess.name} — ${sess.role}`
        : `Interactive session: ${agentId}`;
      const wsPath = sess?.workspace_path ?? null;
      const safety = sess?.safety_mode ?? 'semi-autonomous';

      this.db
        .prepare(`
          INSERT INTO jobs (id, goal, mode, workspace_path, safety_mode, status, progress, current_step, created_at, updated_at)
          VALUES (?, ?, 'interactive', ?, ?, 'running', 50, 'Executing turn', ?, ?)
        `)
        .run(jobId, goalText, wsPath, safety, timestamp, timestamp);
    }

    const stmt = this.db.prepare(`
      INSERT INTO agent_messages (id, job_id, agent_id, role, content, tool_calls, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      jobId,
      agentId,
      message.role,
      message.content,
      message.tool_calls ? JSON.stringify(message.tool_calls) : null,
      timestamp,
    );

    if (message.role === 'assistant') {
      this.db
        .prepare(`
          UPDATE jobs
          SET output = ?, updated_at = ?
          WHERE id = ? AND mode = 'interactive'
        `)
        .run(message.content, timestamp, jobId);
    }

    eventBus.emitJobEvent('message_logged', jobId, {
      agentId,
      role: message.role,
    });

    return id;
  }

  async getAgentTranscript(jobId: string, agentId?: string): Promise<MessageRecord[]> {
    let stmt;
    let rows: Record<string, unknown>[];

    if (agentId) {
      stmt = this.db.prepare(
        'SELECT * FROM agent_messages WHERE job_id = ? AND agent_id = ? ORDER BY timestamp ASC',
      );
      rows = stmt.all(jobId, agentId) as Record<string, unknown>[];
    } else {
      stmt = this.db.prepare(
        'SELECT * FROM agent_messages WHERE job_id = ? ORDER BY timestamp ASC',
      );
      rows = stmt.all(jobId) as Record<string, unknown>[];
    }

    return rows.map((r) => ({
      id: r.id as string,
      role: r.role as MessageRecord['role'],
      content: r.content as string,
      tool_calls: r.tool_calls ? (JSON.parse(r.tool_calls as string) as unknown[]) : undefined,
      timestamp: r.timestamp as string,
    }));
  }

  // ── Artifacts ──────────────────────────────────────────────────

  async saveArtifact(jobId: string, name: string, content: string): Promise<string> {
    const id = nanoid();
    const now = new Date().toISOString();

    // Upsert: replace if same (job_id, name) already exists
    const stmt = this.db.prepare(`
      INSERT INTO artifacts (id, job_id, name, content, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(job_id, name) DO UPDATE SET content = excluded.content, created_at = excluded.created_at
    `);

    stmt.run(id, jobId, name, content, now);
    return id;
  }

  async getArtifact(jobId: string, name: string): Promise<string | null> {
    const stmt = this.db.prepare('SELECT content FROM artifacts WHERE job_id = ? AND name = ?');
    const row = stmt.get(jobId, name) as { content: string } | undefined;
    return row?.content ?? null;
  }

  async listArtifacts(jobId: string): Promise<Array<{ name: string; created_at: string }>> {
    const stmt = this.db.prepare(
      'SELECT name, created_at FROM artifacts WHERE job_id = ? ORDER BY created_at ASC',
    );
    return stmt.all(jobId) as Array<{ name: string; created_at: string }>;
  }

  // ── Checkpoints ────────────────────────────────────────────────

  async createCheckpoint(
    jobId: string,
    checkpoint: Omit<CheckpointRecord, 'id' | 'job_id' | 'status' | 'created_at'>,
  ): Promise<string> {
    const id = nanoid();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO checkpoints (id, job_id, stage_name, action_description, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `);

    stmt.run(id, jobId, checkpoint.stage_name, checkpoint.action_description, now);

    logger.info({ checkpointId: id, jobId, stage: checkpoint.stage_name }, 'Checkpoint created');
    eventBus.emitJobEvent('checkpoint_created', jobId, { checkpointId: id, ...checkpoint });
    return id;
  }

  async getCheckpoint(checkpointId: string): Promise<CheckpointRecord | null> {
    const stmt = this.db.prepare('SELECT * FROM checkpoints WHERE id = ?');
    const row = stmt.get(checkpointId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToCheckpoint(row);
  }

  async getPendingCheckpoints(jobId: string): Promise<CheckpointRecord[]> {
    const stmt = this.db.prepare(
      "SELECT * FROM checkpoints WHERE job_id = ? AND status = 'pending' ORDER BY created_at ASC",
    );
    const rows = stmt.all(jobId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToCheckpoint(r));
  }

  async resolveCheckpoint(
    checkpointId: string,
    decision: 'approve' | 'reject',
    feedback?: string,
  ): Promise<void> {
    const now = new Date().toISOString();

    const status = decision === 'approve' ? 'approved' : 'rejected';
    const stmt = this.db.prepare(`
      UPDATE checkpoints SET status = ?, feedback = ?, resolved_at = ? WHERE id = ?
    `);

    stmt.run(status, feedback ?? null, now, checkpointId);
    logger.info({ checkpointId, decision }, 'Checkpoint resolved');
    eventBus.emitJobEvent('checkpoint_resolved', '', { checkpointId, decision, feedback });
  }

  private ensureSessionExists(sessionId: string): void {
    const exists = this.db.prepare('SELECT 1 FROM agent_sessions WHERE id = ?').get(sessionId);
    if (!exists) {
      const now = new Date().toISOString();
      this.db
        .prepare(`
          INSERT INTO agent_sessions (
            id, parent_session_id, name, role, provider, model, status,
            system_prompt, workspace_path, safety_mode, total_tool_calls,
            iterations, last_error, created_at, updated_at
          )
          VALUES (?, null, ?, 'Host Coordinator', 'host', 'default', 'idle', null, null, null, 0, 0, null, ?, ?)
        `)
        .run(sessionId, sessionId, now, now);
    }
  }

  // ── Session Mesh ───────────────────────────────────────────────

  async createSession(
    session: Omit<
      SessionRecord,
      'id' | 'created_at' | 'updated_at' | 'total_tool_calls' | 'iterations'
    >,
  ): Promise<string> {
    const id = nanoid();
    const now = new Date().toISOString();

    if (session.parent_session_id) {
      this.ensureSessionExists(session.parent_session_id);
    }

    const stmt = this.db.prepare(`
      INSERT INTO agent_sessions (
        id, parent_session_id, name, role, provider, model, status,
        system_prompt, workspace_path, safety_mode, total_tool_calls,
        iterations, last_error, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, null, ?, ?)
    `);

    stmt.run(
      id,
      session.parent_session_id ?? null,
      session.name,
      session.role,
      session.provider,
      session.model,
      session.status ?? 'idle',
      session.system_prompt ?? null,
      session.workspace_path ?? null,
      session.safety_mode ?? null,
      now,
      now,
    );

    logger.info({ sessionId: id, name: session.name, role: session.role }, 'Session created');
    eventBus.emitJobEvent('job_created', id, { type: 'session', name: session.name });
    return id;
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const stmt = this.db.prepare('SELECT * FROM agent_sessions WHERE id = ?');
    const row = stmt.get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToSession(row);
  }

  async listSessions(parentSessionId?: string): Promise<SessionRecord[]> {
    if (parentSessionId) {
      const stmt = this.db.prepare(
        'SELECT * FROM agent_sessions WHERE parent_session_id = ? ORDER BY created_at DESC',
      );
      const rows = stmt.all(parentSessionId) as Record<string, unknown>[];
      return rows.map((r) => this.rowToSession(r));
    }
    const stmt = this.db.prepare('SELECT * FROM agent_sessions ORDER BY created_at DESC');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToSession(r));
  }

  async updateSessionStatus(
    sessionId: string,
    status: SessionStatus,
    updates?: Partial<
      Pick<SessionRecord, 'total_tool_calls' | 'iterations' | 'last_error' | 'safety_mode'>
    >,
  ): Promise<void> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE agent_sessions
      SET status = ?,
          total_tool_calls = COALESCE(?, total_tool_calls),
          iterations = COALESCE(?, iterations),
          last_error = COALESCE(?, last_error),
          safety_mode = COALESCE(?, safety_mode),
          updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      status,
      updates?.total_tool_calls ?? null,
      updates?.iterations ?? null,
      updates?.last_error ?? null,
      updates?.safety_mode ?? null,
      now,
      sessionId,
    );

    // Keep backing interactive job row (if present) synchronized with session status
    const mappedJobStatus: JobStatus =
      status === 'running'
        ? 'running'
        : status === 'error'
          ? 'failed'
          : 'completed';
    const mappedProgress = status === 'running' ? 50 : 100;
    const stepDesc =
      status === 'running'
        ? 'Executing in isolated context window'
        : status === 'error'
          ? `Error: ${updates?.last_error ?? 'Execution failed'}`
          : status === 'terminated'
            ? 'Session terminated'
            : 'Idle (ready for messages)';

    this.db
      .prepare(`
        UPDATE jobs
        SET status = ?,
            progress = ?,
            current_step = ?,
            updated_at = ?
        WHERE id = ? AND mode = 'interactive'
      `)
      .run(mappedJobStatus, mappedProgress, stepDesc, now, sessionId);

    logger.debug({ sessionId, status }, 'Session status updated');
    eventBus.emitJobEvent('job_updated', sessionId, { type: 'session', status, ...updates });
  }

  async terminateSession(sessionId: string): Promise<void> {
    await this.updateSessionStatus(sessionId, 'terminated');
    logger.info({ sessionId }, 'Session terminated');
  }

  // ── Session Inbox ──────────────────────────────────────────────

  async sendInboxMessage(
    msg: Omit<InboxMessageRecord, 'id' | 'read' | 'created_at'>,
  ): Promise<string> {
    const id = nanoid();
    const now = new Date().toISOString();

    this.ensureSessionExists(msg.sender_session_id);
    this.ensureSessionExists(msg.recipient_session_id);

    const stmt = this.db.prepare(`
      INSERT INTO session_inbox (id, sender_session_id, recipient_session_id, content, message_type, read, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `);

    stmt.run(id, msg.sender_session_id, msg.recipient_session_id, msg.content, msg.message_type, now);

    logger.info(
      { messageId: id, sender: msg.sender_session_id, recipient: msg.recipient_session_id },
      'Inbox message sent',
    );
    eventBus.emitJobEvent('message_logged', msg.recipient_session_id, {
      messageId: id,
      sender: msg.sender_session_id,
      type: msg.message_type,
    });
    return id;
  }

  async getInboxMessages(
    recipientSessionId: string,
    unreadOnly = true,
  ): Promise<InboxMessageRecord[]> {
    const sql = unreadOnly
      ? 'SELECT * FROM session_inbox WHERE recipient_session_id = ? AND read = 0 ORDER BY created_at ASC'
      : 'SELECT * FROM session_inbox WHERE recipient_session_id = ? ORDER BY created_at ASC';
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(recipientSessionId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToInboxMessage(r));
  }

  async markInboxMessageRead(messageId: string): Promise<void> {
    const stmt = this.db.prepare('UPDATE session_inbox SET read = 1 WHERE id = ?');
    stmt.run(messageId);
  }

  // ── Row Mappers ────────────────────────────────────────────────

  private rowToJob(row: Record<string, unknown>): JobRecord {
    return {
      id: row.id as string,
      goal: row.goal as string,
      mode: row.mode as JobRecord['mode'],
      pipeline_name: (row.pipeline_name as string) ?? undefined,
      workspace_path: (row.workspace_path as string) ?? undefined,
      safety_mode: row.safety_mode as string,
      status: row.status as JobStatus,
      progress: row.progress as number,
      current_step: (row.current_step as string) ?? undefined,
      output: (row.output as string) ?? undefined,
      config: row.config ? (JSON.parse(row.config as string) as Record<string, unknown>) : undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  private rowToCheckpoint(row: Record<string, unknown>): CheckpointRecord {
    return {
      id: row.id as string,
      job_id: row.job_id as string,
      stage_name: row.stage_name as string,
      action_description: row.action_description as string,
      status: row.status as CheckpointRecord['status'],
      feedback: (row.feedback as string) ?? undefined,
      created_at: row.created_at as string,
      resolved_at: (row.resolved_at as string) ?? undefined,
    };
  }

  private rowToSession(row: Record<string, unknown>): SessionRecord {
    return {
      id: row.id as string,
      parent_session_id: (row.parent_session_id as string) ?? undefined,
      name: row.name as string,
      role: row.role as string,
      provider: row.provider as string,
      model: row.model as string,
      status: row.status as SessionStatus,
      system_prompt: (row.system_prompt as string) ?? undefined,
      workspace_path: (row.workspace_path as string) ?? undefined,
      safety_mode: (row.safety_mode as string) ?? undefined,
      total_tool_calls: (row.total_tool_calls as number) ?? 0,
      iterations: (row.iterations as number) ?? 0,
      last_error: (row.last_error as string) ?? undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  private rowToInboxMessage(row: Record<string, unknown>): InboxMessageRecord {
    return {
      id: row.id as string,
      sender_session_id: row.sender_session_id as string,
      recipient_session_id: row.recipient_session_id as string,
      content: row.content as string,
      message_type: row.message_type as InboxMessageRecord['message_type'],
      read: Boolean(row.read),
      created_at: row.created_at as string,
    };
  }
}
