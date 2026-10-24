import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { createLogger } from '../utils/logger.js';
import type { StorageAdapter } from '../storage/types.js';
import type { OrchestratorConfig } from '../config/schema.js';
import type { AgentPool } from '../agents/agent-pool.js';
import type { SessionManager } from '../sessions/session-manager.js';
import { renderDashboardHtml } from './ui.js';
import { eventBus, type DashboardEvent } from './events.js';

const logger = createLogger('dashboard-server');

export class DashboardServer {
  private server: Server | null = null;
  private sseClients = new Set<ServerResponse>();

  constructor(
    private port: number,
    private storage: StorageAdapter,
    private config: OrchestratorConfig,
    private agentPool: AgentPool,
    private sessionManager?: SessionManager,
  ) {
    // Forward internal events to all active SSE subscribers
    eventBus.on('event', (ev: DashboardEvent) => {
      this.broadcastSse(ev);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          logger.error({ error: err }, 'Unhandled error in dashboard server');
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        });
      });

      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          logger.warn({ port: this.port }, `Dashboard port ${this.port} is already in use. Proceeding without new dashboard instance.`);
          resolve();
        } else {
          logger.error({ error: err }, 'Dashboard server error');
          resolve();
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        logger.info({ port: this.port }, `Web Dashboard running at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const client of this.sseClients) {
      client.end();
    }
    this.sseClients.clear();

    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);
    const pathname = url.pathname;
    const method = req.method ?? 'GET';

    // ── Access control ───────────────────────────────────────────────
    // 1. Host check defends against DNS-rebinding attacks from web pages.
    if (!this.isAllowedHost(req.headers.host)) {
      this.sendJson(res, 403, { error: 'Forbidden: invalid Host header' });
      return;
    }

    // 2. Origin check blocks cross-site requests (e.g. a malicious page POSTing
    //    to /api/checkpoints/:id/resolve). No wildcard CORS is emitted: the
    //    dashboard UI is same-origin.
    const origin = req.headers.origin;
    if (origin && !this.isAllowedOrigin(origin)) {
      this.sendJson(res, 403, { error: 'Forbidden: cross-origin request blocked' });
      return;
    }

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 3. Optional shared-secret token (set DASHBOARD_TOKEN). Open the UI as
    //    http://localhost:PORT/?token=SECRET. EventSource can't set headers, so
    //    the token is also accepted as a query parameter.
    const requiredToken = process.env.DASHBOARD_TOKEN;
    if (requiredToken && pathname.startsWith('/api/')) {
      const provided =
        (req.headers['x-dashboard-token'] as string | undefined) ?? url.searchParams.get('token');
      if (provided !== requiredToken) {
        this.sendJson(res, 401, { error: 'Unauthorized: missing or invalid dashboard token' });
        return;
      }
    }

    // ── Static Dashboard UI ──────────────────────────────────────────
    if (pathname === '/' || pathname.startsWith('/jobs/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderDashboardHtml());
      return;
    }

    // ── SSE Stream ───────────────────────────────────────────────────
    if (pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('data: {"type":"connected"}\n\n');

      this.sseClients.add(res);
      req.on('close', () => {
        this.sseClients.delete(res);
      });
      return;
    }

    // ── REST API ─────────────────────────────────────────────────────

    // GET /api/jobs
    if (pathname === '/api/jobs' && method === 'GET') {
      const limit = Number(url.searchParams.get('limit') ?? '50');
      const jobs = await this.storage.listJobs(limit);
      this.sendJson(res, 200, { jobs });
      return;
    }

    // GET /api/jobs/:id
    const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (jobMatch && method === 'GET') {
      const jobId = jobMatch[1];
      const job = await this.storage.getJob(jobId);
      if (!job) {
        this.sendJson(res, 404, { error: 'Job not found' });
        return;
      }
      this.sendJson(res, 200, { job });
      return;
    }

    // GET /api/jobs/:id/messages
    const messagesMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/messages$/);
    if (messagesMatch && method === 'GET') {
      const jobId = messagesMatch[1];
      const messages = await this.storage.getAgentTranscript(jobId);
      this.sendJson(res, 200, { messages });
      return;
    }

    // GET /api/jobs/:id/artifacts
    const artifactsMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/artifacts$/);
    if (artifactsMatch && method === 'GET') {
      const jobId = artifactsMatch[1];
      const artifacts = await this.storage.listArtifacts(jobId);
      this.sendJson(res, 200, { artifacts });
      return;
    }

    // GET /api/jobs/:id/artifacts/:name
    const artifactContentMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/artifacts\/([^/]+)$/);
    if (artifactContentMatch && method === 'GET') {
      const jobId = artifactContentMatch[1];
      const name = decodeURIComponent(artifactContentMatch[2]);
      const content = await this.storage.getArtifact(jobId, name);
      if (content === null) {
        this.sendJson(res, 404, { error: 'Artifact not found' });
        return;
      }
      this.sendJson(res, 200, { name, content });
      return;
    }

    // GET /api/jobs/:id/checkpoints
    const checkpointsMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/checkpoints$/);
    if (checkpointsMatch && method === 'GET') {
      const jobId = checkpointsMatch[1];
      const checkpoints = await this.storage.getPendingCheckpoints(jobId);
      this.sendJson(res, 200, { checkpoints });
      return;
    }

    // POST /api/checkpoints/:id/resolve
    const resolveMatch = pathname.match(/^\/api\/checkpoints\/([^/]+)\/resolve$/);
    if (resolveMatch && method === 'POST') {
      const checkpointId = resolveMatch[1];
      const body = await this.readJsonBody(req);
      const decision = body.decision === 'approve' ? 'approve' : 'reject';
      const feedback = typeof body.feedback === 'string' ? body.feedback : undefined;

      await this.storage.resolveCheckpoint(checkpointId, decision, feedback);
      eventBus.emitJobEvent('checkpoint_resolved', '', { checkpointId, decision, feedback });

      this.sendJson(res, 200, { success: true, checkpointId, decision });
      return;
    }

    // GET /api/agents
    if (pathname === '/api/agents' && method === 'GET') {
      const agents = this.agentPool.listAll();
      this.sendJson(res, 200, { agents });
      return;
    }

    // GET /api/sessions
    if (pathname === '/api/sessions' && method === 'GET') {
      const sessions = this.sessionManager
        ? await this.sessionManager.listSessions()
        : await this.storage.listSessions();
      const mesh_stats = this.sessionManager ? await this.sessionManager.getMeshStats() : undefined;
      this.sendJson(res, 200, { sessions, mesh_stats });
      return;
    }

    // GET /api/sessions/:id
    const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch && method === 'GET') {
      const sessionId = sessionMatch[1];
      const data = this.sessionManager
        ? await this.sessionManager.getSessionTranscript(sessionId)
        : { session: await this.storage.getSession(sessionId), messages: [], inbox: [] };
      this.sendJson(res, 200, data);
      return;
    }

    // GET /api/sessions/:id/inbox
    const sessionInboxMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/inbox$/);
    if (sessionInboxMatch && method === 'GET') {
      const sessionId = sessionInboxMatch[1];
      const unreadOnly = url.searchParams.get('unread') === 'true';
      const messages = await this.storage.getInboxMessages(sessionId, unreadOnly);
      this.sendJson(res, 200, { sessionId, messages });
      return;
    }

    // GET /api/config
    if (pathname === '/api/config' && method === 'GET') {
      const sanitized = structuredClone(this.config);
      for (const p of Object.values(sanitized.inference.providers)) {
        if (p.api_key_env) p.api_key_env = '***';
      }
      this.sendJson(res, 200, { config: sanitized });
      return;
    }

    this.sendJson(res, 404, { error: 'Not found' });
  }

  private isAllowedHost(hostHeader: string | undefined): boolean {
    if (!hostHeader) return false;
    const host = hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  }

  private isAllowedOrigin(origin: string): boolean {
    try {
      const u = new URL(origin);
      return (
        (u.protocol === 'http:' || u.protocol === 'https:') &&
        this.isAllowedHost(u.host) &&
        Number(u.port || (u.protocol === 'https:' ? 443 : 80)) === this.port
      );
    } catch {
      return false;
    }
  }

  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private async readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const MAX_BODY = 1024 * 1024;
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > MAX_BODY) {
          reject(new Error('Request body too large'));
          req.destroy();
        }
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  private broadcastSse(event: DashboardEvent): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }
}
