// ── Job Types ──────────────────────────────────────────────────────

export type JobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting_approval'
  | 'cancelled';

export interface JobDefinition {
  goal: string;
  mode: 'swarm' | 'interactive' | 'pipeline';
  pipeline_name?: string;
  workspace_path?: string;
  safety_mode: 'autonomous' | 'semi-autonomous' | 'safe';
  config?: Record<string, unknown>;
}

export interface JobRecord {
  id: string;
  goal: string;
  mode: 'swarm' | 'interactive' | 'pipeline';
  pipeline_name?: string;
  workspace_path?: string;
  safety_mode: string;
  status: JobStatus;
  progress: number;
  current_step?: string;
  output?: string;
  config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Message Types ──────────────────────────────────────────────────

export interface MessageRecord {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: unknown[];
  timestamp: string;
}

// ── Checkpoint Types ───────────────────────────────────────────────

export interface CheckpointRecord {
  id: string;
  job_id: string;
  stage_name: string;
  action_description: string;
  status: 'pending' | 'approved' | 'rejected';
  feedback?: string;
  created_at: string;
  resolved_at?: string;
}

// ── Storage Adapter Interface ──────────────────────────────────────

export interface StorageAdapter {
  init(): Promise<void>;
  close(): Promise<void>;

  // Job Lifecycle
  createJob(job: JobDefinition): Promise<string>;
  getJob(jobId: string): Promise<JobRecord | null>;
  listJobs(limit?: number): Promise<JobRecord[]>;
  updateJobStatus(
    jobId: string,
    status: JobStatus,
    updates?: Partial<Pick<JobRecord, 'progress' | 'current_step' | 'output'>>,
  ): Promise<void>;

  // Agent State & Transcripts
  saveAgentMessage(
    jobId: string,
    agentId: string,
    message: Omit<MessageRecord, 'id' | 'timestamp'>,
  ): Promise<string>;
  getAgentTranscript(jobId: string, agentId?: string): Promise<MessageRecord[]>;

  // Artifacts
  saveArtifact(jobId: string, name: string, content: string): Promise<string>;
  getArtifact(jobId: string, name: string): Promise<string | null>;
  listArtifacts(jobId: string): Promise<Array<{ name: string; created_at: string }>>;

  // Checkpoints
  createCheckpoint(
    jobId: string,
    checkpoint: Omit<CheckpointRecord, 'id' | 'job_id' | 'status' | 'created_at'>,
  ): Promise<string>;
  getCheckpoint(checkpointId: string): Promise<CheckpointRecord | null>;
  getPendingCheckpoints(jobId: string): Promise<CheckpointRecord[]>;
  resolveCheckpoint(
    checkpointId: string,
    decision: 'approve' | 'reject',
    feedback?: string,
  ): Promise<void>;

  // ── Session Mesh Lifecycle & Messaging ─────────────────────────
  createSession(
    session: Omit<
      SessionRecord,
      'id' | 'created_at' | 'updated_at' | 'total_tool_calls' | 'iterations'
    >,
  ): Promise<string>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  listSessions(parentSessionId?: string): Promise<SessionRecord[]>;
  updateSessionStatus(
    sessionId: string,
    status: SessionStatus,
    updates?: Partial<
      Pick<SessionRecord, 'total_tool_calls' | 'iterations' | 'last_error' | 'safety_mode'>
    >,
  ): Promise<void>;
  terminateSession(sessionId: string): Promise<void>;

  sendInboxMessage(
    msg: Omit<InboxMessageRecord, 'id' | 'read' | 'created_at'>,
  ): Promise<string>;
  getInboxMessages(
    recipientSessionId: string,
    unreadOnly?: boolean,
  ): Promise<InboxMessageRecord[]>;
  markInboxMessageRead(messageId: string): Promise<void>;
}

// ── Session Mesh Types ─────────────────────────────────────────────

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'waiting_input'
  | 'paused'
  | 'completed'
  | 'error'
  | 'terminated';

export interface SessionRecord {
  id: string;
  parent_session_id?: string;
  name: string;
  role: string;
  provider: string;
  model: string;
  status: SessionStatus;
  system_prompt?: string;
  workspace_path?: string;
  safety_mode?: string;
  total_tool_calls: number;
  iterations: number;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface InboxMessageRecord {
  id: string;
  sender_session_id: string;
  recipient_session_id: string;
  content: string;
  message_type: 'text' | 'tool_result' | 'checkpoint_escalation' | 'completion' | 'broadcast';
  read: boolean;
  created_at: string;
}

