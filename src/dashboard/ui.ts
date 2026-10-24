export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Agent Orchestrator Dashboard</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --primary-hover: #0284c7;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
      --purple: #a855f7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); display: flex; height: 100vh; overflow: hidden; }

    /* Sidebar */
    .sidebar { width: 340px; background-color: var(--card-bg); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
    .sidebar-header { padding: 1.25rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .sidebar-header h1 { font-size: 1.1rem; font-weight: 700; color: var(--primary); display: flex; align-items: center; gap: 0.5rem; }
    .job-list { flex: 1; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .job-card { background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; cursor: pointer; transition: all 0.15s ease; }
    .job-card:hover { border-color: var(--primary); background: rgba(56, 189, 248, 0.05); }
    .job-card.active { border-color: var(--primary); background: rgba(56, 189, 248, 0.12); }
    .job-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; }
    .job-mode { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: rgba(168, 85, 247, 0.2); color: var(--purple); }
    .job-goal { font-size: 0.85rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .job-time { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.35rem; }

    /* Badges */
    .badge { font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 9999px; text-transform: uppercase; }
    .badge-running { background: rgba(56, 189, 248, 0.2); color: var(--primary); }
    .badge-completed { background: rgba(34, 197, 94, 0.2); color: var(--success); }
    .badge-failed { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
    .badge-waiting_approval { background: rgba(245, 158, 11, 0.2); color: var(--warning); animation: pulse 2s infinite; }
    .badge-queued { background: rgba(148, 163, 184, 0.2); color: var(--text-muted); }

    /* Main Area */
    .main { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
    .header { padding: 1.25rem 2rem; border-bottom: 1px solid var(--border); background-color: var(--card-bg); display: flex; justify-content: space-between; align-items: center; }
    .header-actions { display: flex; gap: 0.5rem; }
    .btn { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: none; transition: background 0.15s ease; }
    .btn-primary { background: var(--primary); color: #000; }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-outline:hover { background: rgba(255,255,255,0.05); }

    .content { padding: 2rem; display: flex; flex-direction: column; gap: 1.5rem; max-width: 1200px; }

    /* Cards */
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; }
    .card-title { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; }

    /* Progress bar */
    .progress-container { width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; margin: 0.75rem 0; }
    .progress-bar { height: 100%; background: var(--primary); transition: width 0.3s ease; }

    /* Checkpoint banner */
    .checkpoint-banner { background: rgba(245, 158, 11, 0.1); border: 1px solid var(--warning); border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
    .checkpoint-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .checkpoint-desc { font-size: 0.9rem; color: #fef3c7; margin-bottom: 1rem; }
    .checkpoint-actions { display: flex; gap: 0.75rem; align-items: center; }
    .checkpoint-input { flex: 1; background: #0f172a; border: 1px solid var(--border); padding: 0.5rem 0.75rem; border-radius: 6px; color: var(--text); font-size: 0.85rem; }

    /* Transcripts */
    .message-feed { display: flex; flex-direction: column; gap: 0.75rem; max-height: 400px; overflow-y: auto; padding-right: 0.5rem; }
    .message-item { background: rgba(255,255,255,0.03); border-radius: 6px; padding: 0.75rem; border-left: 3px solid var(--border); }
    .message-item.assistant { border-left-color: var(--primary); }
    .message-item.user { border-left-color: var(--purple); }
    .message-item.tool { border-left-color: var(--warning); font-family: monospace; font-size: 0.8rem; background: rgba(0,0,0,0.3); }
    .message-header { display: flex; justify-content: space-between; margin-bottom: 0.35rem; font-size: 0.75rem; color: var(--text-muted); }
    .message-content { font-size: 0.85rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }

    /* Artifacts */
    .artifacts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.75rem; }
    .artifact-card { background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem; cursor: pointer; }
    .artifact-card:hover { border-color: var(--primary); }

    /* Output */
    .output-box { background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 6px; padding: 1rem; font-size: 0.85rem; line-height: 1.5; white-space: pre-wrap; max-height: 300px; overflow-y: auto; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  </style>
</head>
<body>
  <div class="sidebar">
    <div class="sidebar-header">
      <h1>⚡ Orchestrator</h1>
      <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.75rem;" onclick="fetchJobs()">↻ Refresh</button>
    </div>
    <div class="job-list" id="jobList">
      <div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Loading tasks...</div>
    </div>
  </div>

  <div class="main">
    <div class="header">
      <div>
        <h2 id="jobGoalHeader">Select a Task</h2>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;" id="jobSubHeader">Click any job from the left panel to inspect live progress</div>
      </div>
      <div class="header-actions">
        <span id="connectionBadge" class="badge" style="background: rgba(34, 197, 94, 0.2); color: var(--success);">● SSE Connected</span>
      </div>
    </div>

    <div class="content" id="detailContent" style="display: none;">
      <!-- Active Checkpoint -->
      <div id="checkpointContainer" style="display: none;"></div>

      <!-- Overview Card -->
      <div class="card">
        <div class="card-title">
          <span>Task Execution Status</span>
          <span id="jobStatusBadge" class="badge"></span>
        </div>
        <div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted);">
            <span id="currentStepText">Current Step: Initializing</span>
            <span id="progressPercentText">0%</span>
          </div>
          <div class="progress-container">
            <div id="progressBar" class="progress-bar" style="width: 0%;"></div>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-top: 1rem; font-size: 0.8rem;">
          <div><strong style="color: var(--text-muted);">Mode:</strong> <span id="detailMode"></span></div>
          <div><strong style="color: var(--text-muted);">Safety:</strong> <span id="detailSafety"></span></div>
          <div><strong style="color: var(--text-muted);">Job ID:</strong> <span id="detailJobId" style="font-family: monospace;"></span></div>
          <div><strong style="color: var(--text-muted);">Created:</strong> <span id="detailCreated"></span></div>
        </div>
      </div>

      <!-- Final Output -->
      <div class="card" id="outputCard" style="display: none;">
        <div class="card-title">Consolidated Output</div>
        <div class="output-box" id="finalOutputText"></div>
      </div>

      <!-- Artifacts -->
      <div class="card" id="artifactsCard" style="display: none;">
        <div class="card-title">Generated Artifacts</div>
        <div class="artifacts-grid" id="artifactsGrid"></div>
      </div>

      <!-- Agent Messages -->
      <div class="card">
        <div class="card-title">Agent Transcripts & Scratchpad</div>
        <div class="message-feed" id="messageFeed">
          <div style="color: var(--text-muted); font-size: 0.85rem;">No transcript messages yet.</div>
        </div>
      </div>
    </div>

    <div id="noSelectionPlaceholder" style="padding: 4rem; text-align: center; color: var(--text-muted);">
      <h3>No Job Selected</h3>
      <p style="margin-top: 0.5rem; font-size: 0.9rem;">Choose a job from the sidebar or start a new task using MCP tools like <code>start_swarm</code> or <code>run_pipeline</code>.</p>
    </div>
  </div>

  <script>
    let activeJobId = null;
    let jobs = [];

    async function fetchJobs() {
      try {
        const res = await fetch('/api/jobs');
        const data = await res.json();
        jobs = data.jobs || [];
        renderJobList();
        if (activeJobId) {
          fetchJobDetail(activeJobId);
        } else if (jobs.length > 0) {
          selectJob(jobs[0].id);
        }
      } catch (err) {
        console.error('Failed to load jobs', err);
      }
    }

    function renderJobList() {
      const container = document.getElementById('jobList');
      if (jobs.length === 0) {
        container.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No tasks executed yet.</div>';
        return;
      }

      container.innerHTML = jobs.map(j => \`
        <div class="job-card \${j.id === activeJobId ? 'active' : ''}" onclick="selectJob('\${j.id}')">
          <div class="job-card-top">
            <span class="job-mode">\${escapeHtml(j.mode)}</span>
            <span class="badge badge-\${escapeHtml(j.status)}">\${escapeHtml(j.status)}</span>
          </div>
          <div class="job-goal" title="\${escapeHtml(j.goal)}">\${escapeHtml(j.goal)}</div>
          <div class="job-time">\${new Date(j.created_at).toLocaleTimeString()} - \${Math.round(j.progress)}%</div>
        </div>
      \`).join('');
    }

    async function selectJob(id) {
      activeJobId = id;
      renderJobList();
      document.getElementById('noSelectionPlaceholder').style.display = 'none';
      document.getElementById('detailContent').style.display = 'flex';
      await fetchJobDetail(id);
    }

    async function fetchJobDetail(id) {
      try {
        const [jobRes, msgsRes, artsRes, cpsRes] = await Promise.all([
          fetch(\`/api/jobs/\${id}\`),
          fetch(\`/api/jobs/\${id}/messages\`),
          fetch(\`/api/jobs/\${id}/artifacts\`),
          fetch(\`/api/jobs/\${id}/checkpoints\`)
        ]);

        const jobData = await jobRes.json();
        const job = jobData.job;
        if (!job) return;

        document.getElementById('jobGoalHeader').innerText = job.goal;
        document.getElementById('jobSubHeader').innerText = \`Task ID: \${job.id} • Workspace: \${job.workspace_path || './'}\`;
        
        const badge = document.getElementById('jobStatusBadge');
        badge.className = \`badge badge-\${job.status}\`;
        badge.innerText = job.status;

        document.getElementById('currentStepText').innerText = job.current_step ? \`Step: \${job.current_step}\` : 'Ready';
        document.getElementById('progressPercentText').innerText = \`\${Math.round(job.progress)}%\`;
        document.getElementById('progressBar').style.width = \`\${job.progress}%\`;

        document.getElementById('detailMode').innerText = job.mode;
        document.getElementById('detailSafety').innerText = job.safety_mode;
        document.getElementById('detailJobId').innerText = job.id;
        document.getElementById('detailCreated').innerText = new Date(job.created_at).toLocaleTimeString();

        // Output
        if (job.output) {
          document.getElementById('outputCard').style.display = 'block';
          document.getElementById('finalOutputText').innerText = job.output;
        } else {
          document.getElementById('outputCard').style.display = 'none';
        }

        // Checkpoints
        const cpsData = await cpsRes.json();
        const pending = (cpsData.checkpoints || []).filter(c => c.status === 'pending');
        const cpBox = document.getElementById('checkpointContainer');
        if (pending.length > 0) {
          const cp = pending[0];
          cpBox.style.display = 'block';
          cpBox.innerHTML = \`
            <div class="checkpoint-banner">
              <div class="checkpoint-header">
                <strong style="color: var(--warning);">⚠️ Human Approval Required: \${escapeHtml(cp.stage_name)}</strong>
                <span class="badge badge-waiting_approval">Checkpoint Pending</span>
              </div>
              <div class="checkpoint-desc">\${escapeHtml(cp.action_description)}</div>
              <div class="checkpoint-actions">
                <input type="text" id="cpFeedback" class="checkpoint-input" placeholder="Optional reviewer feedback..." />
                <button class="btn btn-primary" onclick="resolveCheckpoint('\${cp.id}', 'approve')">✓ Approve</button>
                <button class="btn btn-danger" onclick="resolveCheckpoint('\${cp.id}', 'reject')">✕ Reject</button>
              </div>
            </div>
          \`;
        } else {
          cpBox.style.display = 'none';
        }

        // Messages
        const msgsData = await msgsRes.json();
        const msgList = msgsData.messages || [];
        const msgFeed = document.getElementById('messageFeed');
        if (msgList.length === 0) {
          msgFeed.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">No agent messages recorded yet.</div>';
        } else {
          msgFeed.innerHTML = msgList.map(m => \`
            <div class="message-item \${m.role}">
              <div class="message-header">
                <strong>\${m.role.toUpperCase()}</strong>
                <span>\${new Date(m.timestamp).toLocaleTimeString()}</span>
              </div>
              <div class="message-content">\${escapeHtml(m.content)}</div>
            </div>
          \`).join('');
        }

        // Artifacts
        const artsData = await artsRes.json();
        const arts = artsData.artifacts || [];
        const artsCard = document.getElementById('artifactsCard');
        if (arts.length > 0) {
          artsCard.style.display = 'block';
          document.getElementById('artifactsGrid').innerHTML = arts.map(a => \`
            <div class="artifact-card" data-name="\${escapeHtml(a.name)}" onclick="viewArtifact('\${escapeHtml(id)}', this.dataset.name)">
              <strong>📄 \${escapeHtml(a.name)}</strong>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">\${new Date(a.created_at).toLocaleTimeString()}</div>
            </div>
          \`).join('');
        } else {
          artsCard.style.display = 'none';
        }

      } catch (err) {
        console.error('Failed to load job details', err);
      }
    }

    async function resolveCheckpoint(checkpointId, decision) {
      const feedback = document.getElementById('cpFeedback')?.value;
      try {
        await fetch(\`/api/checkpoints/\${checkpointId}/resolve\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, feedback })
        });
        fetchJobs();
      } catch (err) {
        alert('Failed to resolve checkpoint: ' + err.message);
      }
    }

    async function viewArtifact(jobId, name) {
      const res = await fetch(\`/api/jobs/\${jobId}/artifacts/\${encodeURIComponent(name)}\`);
      const data = await res.json();
      alert(\`Artifact: \${name}\\n\\n\${data.content}\`);
    }

    function escapeHtml(text) {
      return String(text === null || text === undefined ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // Optional auth: open the dashboard as /?token=SECRET when DASHBOARD_TOKEN is set
    const DASHBOARD_TOKEN = new URLSearchParams(window.location.search).get('token');
    if (DASHBOARD_TOKEN) {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        const headers = new Headers(init.headers || {});
        headers.set('x-dashboard-token', DASHBOARD_TOKEN);
        return nativeFetch(input, { ...init, headers });
      };
    }

    // Connect to Server-Sent Events for real-time live updates
    const sse = new EventSource('/api/events' + (DASHBOARD_TOKEN ? '?token=' + encodeURIComponent(DASHBOARD_TOKEN) : ''));
    sse.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === 'job_updated' || ev.type === 'checkpoint_created' || ev.type === 'checkpoint_resolved') {
          fetchJobs();
        }
      } catch (err) {}
    };

    // Initial fetch
    fetchJobs();
    setInterval(fetchJobs, 5000);
  </script>
</body>
</html>`;
}
