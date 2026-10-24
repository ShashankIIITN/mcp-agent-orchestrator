export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Agent Orchestrator Dashboard — Multi-Context Session Mesh &amp; Telemetry</title>
  <style>
    :root {
      --bg-root: #070b14;
      --bg-surface: #0f172a;
      --bg-elevated: #1e293b;
      --bg-glass: rgba(15, 23, 42, 0.85);
      --border: #1e293b;
      --border-light: #334155;
      --text: #f8fafc;
      --text-secondary: #cbd5e1;
      --text-muted: #64748b;
      --primary: #38bdf8;
      --primary-hover: #0ea5e9;
      --primary-soft: rgba(56, 189, 248, 0.12);
      --success: #10b981;
      --success-soft: rgba(16, 185, 129, 0.14);
      --warning: #f59e0b;
      --warning-soft: rgba(245, 158, 11, 0.14);
      --danger: #ef4444;
      --danger-soft: rgba(239, 68, 68, 0.14);
      --purple: #a855f7;
      --purple-soft: rgba(168, 85, 247, 0.14);
      --indigo: #6366f1;
      --font-sans: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-mono: "JetBrains Mono", "Fira Code", Consolas, monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-root);
      color: var(--text);
      font-family: var(--font-sans);
      height: 100dvh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ── Top Navigation & Global KPI Ribbon ─────────────────────────── */
    .topbar {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-light);
      padding: 0.75rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-shrink: 0;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .brand-icon {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--primary), var(--purple));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      font-weight: 800;
      color: #020617;
      box-shadow: 0 0 18px rgba(56, 189, 248, 0.35);
    }

    .brand-title {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .brand-subtitle {
      font-size: 0.72rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    .nav-tabs {
      display: flex;
      gap: 0.35rem;
      background: var(--bg-root);
      padding: 0.25rem;
      border-radius: 8px;
      border: 1px solid var(--border-light);
    }

    .nav-tab {
      background: transparent;
      color: var(--text-secondary);
      border: none;
      padding: 0.45rem 0.9rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.45rem;
      transition: all 0.15s ease;
    }

    .nav-tab:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.04);
    }

    .nav-tab.active {
      background: var(--primary-soft);
      color: var(--primary);
      border: 1px solid rgba(56, 189, 248, 0.35);
    }

    .nav-count {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      padding: 1px 6px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
    }

    .topbar-right {
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }

    /* ── KPI Strip ─────────────────────────────────────────────────── */
    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(4, minmax(200px, 1fr));
      gap: 0.75rem;
      padding: 0.75rem 1.5rem;
      background: rgba(15, 23, 42, 0.55);
      border-bottom: 1px solid var(--border-light);
      flex-shrink: 0;
    }

    .kpi-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-light);
      border-radius: 10px;
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .kpi-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      font-weight: 600;
    }

    .kpi-value {
      font-size: 1.35rem;
      font-weight: 700;
      font-family: var(--font-mono);
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }

    .kpi-sub {
      font-size: 0.74rem;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    /* ── Main Split Layout ─────────────────────────────────────────── */
    .workspace-view {
      flex: 1;
      display: none;
      overflow: hidden;
    }

    .workspace-view.active {
      display: flex;
    }

    .sidebar {
      width: 380px;
      background: var(--bg-surface);
      border-right: 1px solid var(--border-light);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .sidebar-controls {
      padding: 0.85rem;
      border-bottom: 1px solid var(--border-light);
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .search-input {
      width: 100%;
      background: var(--bg-root);
      border: 1px solid var(--border-light);
      color: var(--text);
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      font-size: 0.82rem;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--primary);
    }

    .filter-pills {
      display: flex;
      gap: 0.35rem;
      flex-wrap: wrap;
    }

    .filter-pill {
      background: var(--bg-root);
      border: 1px solid var(--border-light);
      color: var(--text-secondary);
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
    }

    .filter-pill.active {
      background: var(--primary-soft);
      color: var(--primary);
      border-color: var(--primary);
    }

    .item-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .item-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-light);
      border-radius: 8px;
      padding: 0.75rem;
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;
    }

    .item-card:hover {
      border-color: var(--primary);
      background: rgba(56, 189, 248, 0.04);
    }

    .item-card.active {
      border-color: var(--primary);
      background: var(--primary-soft);
      box-shadow: inset 3px 0 0 var(--primary);
    }

    .item-card.depth-1 {
      margin-inline-start: 14px;
      border-left: 2px dashed rgba(56, 189, 248, 0.45);
    }

    .item-card.depth-2, .item-card.depth-3 {
      margin-inline-start: 28px;
      border-left: 2px dashed rgba(168, 85, 247, 0.55);
    }

    .item-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
      margin-bottom: 0.35rem;
    }

    .item-title {
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 0.4rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .item-role {
      font-size: 0.76rem;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 0.45rem;
    }

    .item-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
      flex-wrap: wrap;
      font-size: 0.7rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    /* ── Badges & Pills ────────────────────────────────────────────── */
    .badge {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 999px;
      text-transform: uppercase;
      font-family: var(--font-mono);
      letter-spacing: 0.02em;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .badge-running { background: var(--primary-soft); color: var(--primary); border: 1px solid rgba(56, 189, 248, 0.35); }
    .badge-idle, .badge-completed { background: var(--success-soft); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.35); }
    .badge-error, .badge-failed { background: var(--danger-soft); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.35); }
    .badge-paused, .badge-waiting_approval, .badge-waiting_input { background: var(--warning-soft); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.35); }
    .badge-terminated, .badge-queued { background: rgba(148, 163, 184, 0.12); color: var(--text-muted); border: 1px solid rgba(148, 163, 184, 0.25); }

    .tier-fast { background: rgba(16, 185, 129, 0.14); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .tier-balanced { background: rgba(56, 189, 248, 0.14); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
    .tier-heavy { background: rgba(168, 85, 247, 0.16); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.35); }
    .tier-host { background: rgba(99, 102, 241, 0.16); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.35); }

    /* ── Inspector Detail Area ─────────────────────────────────────── */
    .inspector {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: 1.25rem 1.75rem;
      gap: 1.25rem;
    }

    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-light);
      border-radius: 10px;
      padding: 1.15rem;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.9rem;
    }

    .card-title {
      font-size: 0.92rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 0.75rem;
    }

    .metric-box {
      background: var(--bg-root);
      border: 1px solid var(--border-light);
      border-radius: 8px;
      padding: 0.75rem;
    }

    .metric-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 0.25rem;
      font-weight: 600;
    }

    .metric-val {
      font-size: 1.1rem;
      font-weight: 700;
      font-family: var(--font-mono);
    }

    /* ── Buttons & Inputs ──────────────────────────────────────────── */
    .btn {
      padding: 0.45rem 0.85rem;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s ease;
    }

    .btn-primary { background: var(--primary); color: #020617; }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-danger { background: var(--danger-soft); color: var(--danger); border-color: rgba(239, 68, 68, 0.35); }
    .btn-danger:hover { background: var(--danger); color: #fff; }
    .btn-warning { background: var(--warning-soft); color: var(--warning); border-color: rgba(245, 158, 11, 0.35); }
    .btn-outline { background: transparent; border-color: var(--border-light); color: var(--text-secondary); }
    .btn-outline:hover { border-color: var(--primary); color: var(--text); }

    /* ── Progress Bar ──────────────────────────────────────────────── */
    .progress-track {
      width: 100%;
      height: 7px;
      background: rgba(255, 255, 255, 0.07);
      border-radius: 999px;
      overflow: hidden;
      margin: 0.5rem 0;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--primary), var(--purple));
      transition: width 0.3s ease;
    }

    /* ── Transcript Feed ───────────────────────────────────────────── */
    .transcript-feed {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      max-height: 460px;
      overflow-y: auto;
      padding-right: 0.35rem;
    }

    .msg-bubble {
      background: var(--bg-root);
      border: 1px solid var(--border-light);
      border-left: 3px solid var(--border-light);
      border-radius: 8px;
      padding: 0.75rem 0.9rem;
    }

    .msg-bubble.user { border-left-color: var(--purple); }
    .msg-bubble.assistant { border-left-color: var(--primary); }
    .msg-bubble.tool { border-left-color: var(--warning); font-family: var(--font-mono); font-size: 0.78rem; }
    .msg-bubble.system { border-left-color: var(--indigo); opacity: 0.85; }

    .msg-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-bottom: 0.35rem;
      font-family: var(--font-mono);
    }

    .msg-body {
      font-size: 0.84rem;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--text-secondary);
    }

    .composer-bar {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.85rem;
      padding-top: 0.85rem;
      border-top: 1px solid var(--border-light);
    }

    /* ── Responsive Data Tables (modern-web-guidance: responsive-table) ── */
    .table-wrapper {
      overflow: auto;
      max-inline-size: 100%;
      max-block-size: min(440px, 70vh);
      container-type: inline-size;
      border: 1px solid var(--border-light);
      border-radius: 8px;
      background: var(--bg-root);
    }

    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 0.8rem;
    }

    caption {
      text-align: left;
      padding: 0.65rem 0.9rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-light);
    }

    thead {
      position: sticky;
      inset-block-start: 0;
      z-index: 1;
      background: var(--bg-elevated);
    }

    th, td {
      padding: 0.6rem 0.85rem;
      text-align: left;
      border-bottom: 1px solid var(--border-light);
      vertical-align: top;
    }

    thead th {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      font-weight: 700;
    }

    tbody th {
      position: sticky;
      inset-inline-start: 0;
      background: var(--bg-root);
      font-family: var(--font-mono);
      font-weight: 600;
      color: var(--primary);
    }

    tbody tr:hover td, tbody tr:hover th {
      background: rgba(56, 189, 248, 0.04);
    }

    @container (width < 600px) {
      table, thead, tbody, tr, th, td {
        display: block;
      }

      thead {
        display: none;
      }

      tr {
        margin-block-end: 1rem;
        border: 1px solid var(--border-light);
      }

      tbody th {
        position: sticky;
        inset-block-start: 0;
        z-index: 2;
        background: var(--bg-elevated);
      }

      td:nth-child(2)::before { content: var(--label-2, "Detail") ": "; font-weight: 700; color: var(--text-muted); }
      td:nth-child(3)::before { content: var(--label-3, "Type") ": "; font-weight: 700; color: var(--text-muted); }
      td:nth-child(4)::before { content: var(--label-4, "Status") ": "; font-weight: 700; color: var(--text-muted); }
      td:nth-child(5)::before { content: var(--label-5, "Time") ": "; font-weight: 700; color: var(--text-muted); }
    }

    /* ── Modal Dialogs (modern-web-guidance: light-dismiss-a-dialog) ── */
    dialog {
      margin: auto;
      background: var(--bg-surface);
      color: var(--text);
      border: 1px solid var(--border-light);
      border-radius: 12px;
      padding: 1.5rem;
      max-width: 680px;
      width: 92vw;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.75);
    }

    dialog::backdrop {
      background-color: rgba(2, 6, 23, 0.72);
      backdrop-filter: blur(4px);
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.85rem;
      margin-top: 1rem;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .form-field.full {
      grid-column: 1 / -1;
    }

    .form-field label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .form-input, .form-select, .form-textarea {
      background: var(--bg-root);
      border: 1px solid var(--border-light);
      color: var(--text);
      padding: 0.55rem 0.75rem;
      border-radius: 6px;
      font-size: 0.83rem;
      font-family: var(--font-sans);
    }

    .form-textarea {
      min-height: 88px;
      resize: vertical;
      font-family: var(--font-mono);
    }

    .empty-state {
      margin: auto;
      text-align: center;
      padding: 3rem;
      color: var(--text-muted);
      max-width: 460px;
    }
  </style>
</head>
<body>

  <!-- ── Top Header Bar ──────────────────────────────────────────── -->
  <header class="topbar">
    <div class="brand">
      <div class="brand-icon">⚡</div>
      <div>
        <div class="brand-title">MCP Agent Orchestrator</div>
        <div class="brand-subtitle" id="systemSubHeader">Multi-Context Session Mesh &amp; Context Firewall</div>
      </div>
    </div>

    <nav class="nav-tabs" aria-label="Dashboard Sections">
      <button class="nav-tab active" id="tabBtn-sessions" onclick="switchTab('sessions')">
        🌐 Session Mesh <span class="nav-count" id="tabCount-sessions">0</span>
      </button>
      <button class="nav-tab" id="tabBtn-jobs" onclick="switchTab('jobs')">
        🐝 Swarm &amp; Pipelines <span class="nav-count" id="tabCount-jobs">0</span>
      </button>
      <button class="nav-tab" id="tabBtn-config" onclick="switchTab('config')">
        ⚙️ Specialists &amp; Config <span class="nav-count" id="tabCount-agents">0</span>
      </button>
    </nav>

    <div class="topbar-right">
      <button class="btn btn-primary" onclick="openSpawnDialog()">+ Spawn Session</button>
      <button class="btn btn-outline" onclick="refreshAll()">↻ Sync</button>
      <span id="sseStatusBadge" class="badge badge-running">● Live SSE</span>
    </div>
  </header>

  <!-- ── Real-Time KPI & Context Firewall Strip ──────────────────── -->
  <section class="kpi-strip" aria-label="Real-time Orchestrator Telemetry">
    <div class="kpi-card">
      <div class="kpi-top">
        <span>🛡️ Context Firewall Capacity</span>
        <span class="badge tier-fast" id="kpiFirewallBadge">Active</span>
      </div>
      <div class="kpi-value">
        <span id="kpiMultiplier">1.00x</span>
        <span style="font-size: 0.78rem; color: var(--success); font-weight: 600;" id="kpiSavedTokens">0 tok saved</span>
      </div>
      <div class="kpi-sub">
        <span>Isolated Mesh: <strong id="kpiTotalTokens">0</strong> tok</span>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-top">
        <span>🌐 Isolated Agent Sessions</span>
        <span id="kpiActiveSessionsBadge" class="badge badge-idle">0 Active</span>
      </div>
      <div class="kpi-value" id="kpiTotalSessions">0</div>
      <div class="kpi-sub">
        <span class="badge tier-fast" id="kpiTierFast">Fast: 0</span>
        <span class="badge tier-balanced" id="kpiTierBalanced">Bal: 0</span>
        <span class="badge tier-heavy" id="kpiTierHeavy">Heavy: 0</span>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-top">
        <span>🐝 Swarm &amp; Pipeline Jobs</span>
        <span id="kpiPendingApprovals" class="badge badge-completed">0 Checkpoints</span>
      </div>
      <div class="kpi-value" id="kpiTotalJobs">0</div>
      <div class="kpi-sub" id="kpiJobBreakdown">0 running • 0 completed • 0 failed</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-top">
        <span>🖥️ Engine &amp; Providers</span>
        <span class="badge badge-running" id="kpiSafetyMode">semi-autonomous</span>
      </div>
      <div class="kpi-value" id="kpiProvidersList" style="font-size: 1rem;">agy</div>
      <div class="kpi-sub" id="kpiSystemStats">Memory: -- MB • Uptime: --s</div>
    </div>
  </section>

  <!-- ══════════════════════════════════════════════════════════════ -->
  <!-- VIEW 1: SESSION MESH & CONTEXT FIREWALL INSPECTOR             -->
  <!-- ══════════════════════════════════════════════════════════════ -->
  <main class="workspace-view active" id="view-sessions">
    <aside class="sidebar">
      <div class="sidebar-controls">
        <input
          type="search"
          id="sessionSearchInput"
          class="search-input"
          placeholder="Filter sessions by name, role, model, or ID..."
          oninput="renderSessionList()"
        />
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.4rem;">
          <div class="filter-pills">
            <button class="filter-pill active" data-filter="all" onclick="setSessionFilter('all')">All</button>
            <button class="filter-pill" data-filter="active" onclick="setSessionFilter('active')">Active</button>
            <button class="filter-pill" data-filter="fast" onclick="setSessionFilter('fast')">Fast</button>
            <button class="filter-pill" data-filter="balanced" onclick="setSessionFilter('balanced')">Balanced</button>
            <button class="filter-pill" data-filter="heavy" onclick="setSessionFilter('heavy')">Heavy</button>
          </div>
          <button class="btn btn-danger" style="padding: 2px 7px; font-size: 0.68rem;" onclick="killAllSessions()" title="Terminate all active sessions">Kill All</button>
        </div>
      </div>
      <div class="item-list" id="sessionListContainer"></div>
    </aside>

    <section class="inspector" id="sessionInspector">
      <div class="empty-state" id="sessionEmptyState">
        <h3>Select an Isolated Agent Session</h3>
        <p style="margin-top: 0.5rem; font-size: 0.85rem;">
          Inspect any specialist session's isolated context window, model tier, tool calls, bilateral inbox, or click <strong>+ Spawn Session</strong> to launch a new context window.
        </p>
      </div>

      <div id="sessionDetailPane" style="display: none; flex-direction: column; gap: 1.15rem;">
        <!-- Session Header Card -->
        <div class="card">
          <div class="card-header" style="margin-bottom: 0.5rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
                <h2 id="sessHeaderName" style="font-size: 1.2rem;"></h2>
                <span id="sessHeaderStatus" class="badge"></span>
                <span id="sessHeaderTier" class="badge"></span>
                <span id="sessHeaderModel" class="badge badge-queued"></span>
              </div>
              <div id="sessHeaderRole" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;"></div>
            </div>
            <div style="display: flex; gap: 0.45rem;" id="sessActionButtons"></div>
          </div>

          <div style="display: flex; gap: 1.25rem; flex-wrap: wrap; font-size: 0.76rem; color: var(--text-muted); font-family: var(--font-mono); margin-top: 0.6rem; padding-top: 0.6rem; border-top: 1px solid var(--border-light);">
            <span>ID: <strong style="color: var(--text);" id="sessMetaId"></strong></span>
            <span>Parent: <strong style="color: var(--primary); cursor: pointer;" id="sessMetaParent"></strong></span>
            <span>Provider: <strong style="color: var(--text);" id="sessMetaProvider"></strong></span>
            <span>Workspace: <strong style="color: var(--text);" id="sessMetaWorkspace"></strong></span>
            <span>Safety: <strong style="color: var(--text);" id="sessMetaSafety"></strong></span>
            <span>Updated: <strong style="color: var(--text);" id="sessMetaUpdated"></strong></span>
          </div>

          <details style="margin-top: 0.75rem; font-size: 0.78rem; color: var(--text-secondary);">
            <summary style="cursor: pointer; font-weight: 600; color: var(--text-muted);">Inspect Specialist System Prompt</summary>
            <pre id="sessSystemPrompt" style="margin-top: 0.5rem; padding: 0.75rem; background: var(--bg-root); border: 1px solid var(--border-light); border-radius: 6px; white-space: pre-wrap; font-family: var(--font-mono); font-size: 0.76rem;"></pre>
          </details>
        </div>

        <!-- Context Firewall & Execution Metrics -->
        <div class="metrics-grid">
          <div class="metric-box">
            <div class="metric-label">Isolated Context Tokens</div>
            <div class="metric-val" id="sessMetricUsed" style="color: var(--primary);">0</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Firewall Saved Tokens</div>
            <div class="metric-val" id="sessMetricSaved" style="color: var(--success);">0</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Firewall Absorption</div>
            <div class="metric-val" id="sessMetricEfficiency">0%</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Turns / Iterations</div>
            <div class="metric-val" id="sessMetricIterations">0</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Tool Invocations</div>
            <div class="metric-val" id="sessMetricTools">0</div>
          </div>
        </div>

        <!-- Conversation Transcript & Live Turn Composer -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">💬 Isolated Context Window Transcript</div>
            <span style="font-size: 0.74rem; color: var(--text-muted); font-family: var(--font-mono);" id="sessMsgCountLabel">0 messages</span>
          </div>
          <div class="transcript-feed" id="sessTranscriptFeed"></div>

          <form class="composer-bar" onsubmit="sendFollowUpMessage(event)">
            <input
              type="text"
              id="sessFollowUpInput"
              class="search-input"
              placeholder="Send a follow-up instruction or question to this isolated session..."
              required
            />
            <button type="submit" class="btn btn-primary" id="sessSendBtn">Send Turn ↵</button>
          </form>
        </div>

        <!-- Bilateral Session Inbox Table -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">📬 Bilateral Session Inbox (<code>session_inbox</code>)</div>
            <span style="font-size: 0.74rem; color: var(--text-muted); font-family: var(--font-mono);" id="sessInboxCountLabel">0 items</span>
          </div>
          <div tabindex="0" role="region" aria-labelledby="inbox-table-caption" class="table-wrapper">
            <table style="--label-2: 'Sender'; --label-3: 'Type'; --label-4: 'Status'; --label-5: 'Content';">
              <caption id="inbox-table-caption">Inter-session messages delivered to or from this session</caption>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Sender → Recipient</th>
                  <th>Type</th>
                  <th>State</th>
                  <th>Message Content</th>
                </tr>
              </thead>
              <tbody id="sessInboxTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </main>

  <!-- ══════════════════════════════════════════════════════════════ -->
  <!-- VIEW 2: SWARM & PIPELINE JOBS                                 -->
  <!-- ══════════════════════════════════════════════════════════════ -->
  <main class="workspace-view" id="view-jobs">
    <aside class="sidebar">
      <div class="sidebar-controls">
        <input
          type="search"
          id="jobSearchInput"
          class="search-input"
          placeholder="Filter jobs by goal, mode, or ID..."
          oninput="renderJobList()"
        />
        <div class="filter-pills">
          <button class="filter-pill active" data-jobfilter="all" onclick="setJobFilter('all')">All Jobs</button>
          <button class="filter-pill" data-jobfilter="orchestrated" onclick="setJobFilter('orchestrated')">Swarm &amp; Pipelines</button>
          <button class="filter-pill" data-jobfilter="interactive" onclick="setJobFilter('interactive')">Session Turns</button>
        </div>
      </div>
      <div class="item-list" id="jobListContainer"></div>
    </aside>

    <section class="inspector">
      <div class="empty-state" id="jobEmptyState">
        <h3>Select a Swarm or Pipeline Job</h3>
        <p style="margin-top: 0.5rem; font-size: 0.85rem;">
          Inspect multi-stage DAG pipelines, human-in-the-loop checkpoints, generated artifacts, and consolidated outputs.
        </p>
      </div>

      <div id="jobDetailPane" style="display: none; flex-direction: column; gap: 1.15rem;">
        <div id="jobCheckpointBanner" style="display: none;"></div>

        <div class="card">
          <div class="card-header">
            <div>
              <h2 id="jobHeaderGoal" style="font-size: 1.15rem;"></h2>
              <div id="jobHeaderSub" style="font-size: 0.78rem; color: var(--text-muted); font-family: var(--font-mono); margin-top: 0.25rem;"></div>
            </div>
            <span id="jobHeaderStatus" class="badge"></span>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-secondary);">
            <span id="jobStepLabel">Step: Ready</span>
            <span id="jobProgressLabel" style="font-family: var(--font-mono); font-weight: 700;">0%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" id="jobProgressFill" style="width: 0%;"></div>
          </div>

          <div class="metrics-grid" style="margin-top: 0.85rem;">
            <div class="metric-box">
              <div class="metric-label">Orchestration Mode</div>
              <div class="metric-val" id="jobMetaMode" style="font-size: 0.95rem;"></div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Safety Policy</div>
              <div class="metric-val" id="jobMetaSafety" style="font-size: 0.95rem;"></div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Created</div>
              <div class="metric-val" id="jobMetaCreated" style="font-size: 0.85rem;"></div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Last Updated</div>
              <div class="metric-val" id="jobMetaUpdated" style="font-size: 0.85rem;"></div>
            </div>
          </div>
        </div>

        <div class="card" id="jobOutputCard" style="display: none;">
          <div class="card-header">
            <div class="card-title">✨ Consolidated Output</div>
            <button class="btn btn-outline" onclick="copyTextById('jobOutputContent')">Copy Output</button>
          </div>
          <pre id="jobOutputContent" style="background: var(--bg-root); border: 1px solid var(--border-light); border-radius: 8px; padding: 1rem; white-space: pre-wrap; word-break: break-word; font-size: 0.83rem; line-height: 1.55; max-height: 360px; overflow-y: auto;"></pre>
        </div>

        <div class="card" id="jobArtifactsCard" style="display: none;">
          <div class="card-header">
            <div class="card-title">📄 Generated Stage Artifacts</div>
          </div>
          <div id="jobArtifactsGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem;"></div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">📜 Execution Transcript</div>
          </div>
          <div class="transcript-feed" id="jobTranscriptFeed"></div>
        </div>
      </div>
    </section>
  </main>

  <!-- ══════════════════════════════════════════════════════════════ -->
  <!-- VIEW 3: SPECIALISTS, TIERS & SYSTEM CONFIGURATION             -->
  <!-- ══════════════════════════════════════════════════════════════ -->
  <main class="workspace-view" id="view-config">
    <section class="inspector" style="max-width: 1320px; margin: 0 auto;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">⚡ Model Cost &amp; Capability Tiers (<code>inference.tiers</code>)</div>
        </div>
        <div class="metrics-grid" id="configTiersGrid"></div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">👥 Configured Specialist Agent Roster (<code>agent_preset</code>)</div>
          <button class="btn btn-primary" onclick="openSpawnDialog()">+ Spawn Custom Specialist</button>
        </div>
        <div tabindex="0" role="region" aria-labelledby="roster-table-caption" class="table-wrapper">
          <table style="--label-2: 'Role'; --label-3: 'Provider / Model'; --label-4: 'Tools'; --label-5: 'Action';">
            <caption id="roster-table-caption">Available specialist personas discovered from orchestrator.yaml and ~/.gemini/config/agents</caption>
            <thead>
              <tr>
                <th>Preset ID</th>
                <th>Specialist Role</th>
                <th>Provider &amp; Default Model</th>
                <th>Allowed Tools</th>
                <th>Quick Launch</th>
              </tr>
            </thead>
            <tbody id="configAgentsTableBody"></tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">🔗 Declarative DAG Pipelines &amp; Security Policy</div>
        </div>
        <div id="configPipelinesContainer" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.85rem;"></div>
      </div>
    </section>
  </main>

  <!-- ══════════════════════════════════════════════════════════════ -->
  <!-- MODAL DIALOG 1: SPAWN NEW ISOLATED SESSION (closedby="any")   -->
  <!-- ══════════════════════════════════════════════════════════════ -->
  <dialog id="spawnSessionDialog" closedby="any" aria-labelledby="spawnDialogTitle">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
      <h3 id="spawnDialogTitle">🌐 Spawn Isolated Agent Session</h3>
      <button type="button" class="btn btn-outline" onclick="document.getElementById('spawnSessionDialog').close()">✕</button>
    </div>
    <p style="font-size: 0.8rem; color: var(--text-secondary);">
      Launch a specialist in its own separate context window with custom model tiering.
    </p>
    <form onsubmit="submitSpawnSession(event)">
      <div class="form-grid">
        <div class="form-field">
          <label for="spawnPreset">Specialist Preset (<code>agent_preset</code>)</label>
          <select id="spawnPreset" class="form-select" onchange="onPresetChange()">
            <option value="">Custom Specialist</option>
          </select>
        </div>
        <div class="form-field">
          <label for="spawnTier">Cost &amp; Capability Tier (<code>tier</code>)</label>
          <select id="spawnTier" class="form-select">
            <option value="fast">⚡ Fast (gemini-3.8-flash-low — Low Cost)</option>
            <option value="balanced" selected>⚖️ Balanced (gemini-3.8-flash-high)</option>
            <option value="heavy">🧠 Heavy (claude-sonnet-4-6 / Frontier)</option>
          </select>
        </div>
        <div class="form-field">
          <label for="spawnName">Session Name (optional)</label>
          <input type="text" id="spawnName" class="form-input" placeholder="e.g. SecurityScout" />
        </div>
        <div class="form-field">
          <label for="spawnWorkspace">Workspace Path</label>
          <input type="text" id="spawnWorkspace" class="form-input" value="./" />
        </div>
        <div class="form-field full">
          <label for="spawnTask">Initial Task / Prompt (<code>initial_message</code>)</label>
          <textarea id="spawnTask" class="form-textarea" placeholder="Describe what this isolated session should analyze or build..."></textarea>
        </div>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem;">
        <button type="button" class="btn btn-outline" onclick="document.getElementById('spawnSessionDialog').close()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="spawnSubmitBtn">🚀 Launch Isolated Session</button>
      </div>
    </form>
  </dialog>

  <!-- ══════════════════════════════════════════════════════════════ -->
  <!-- MODAL DIALOG 2: ARTIFACT PREVIEWER (closedby="any")           -->
  <!-- ══════════════════════════════════════════════════════════════ -->
  <dialog id="artifactPreviewDialog" closedby="any" aria-labelledby="artifactDialogTitle">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
      <h3 id="artifactDialogTitle">📄 Artifact Preview</h3>
      <div style="display: flex; gap: 0.45rem;">
        <button type="button" class="btn btn-outline" onclick="copyTextById('artifactDialogContent')">Copy</button>
        <button type="button" class="btn btn-outline" onclick="document.getElementById('artifactPreviewDialog').close()">Close</button>
      </div>
    </div>
    <pre id="artifactDialogContent" style="background: var(--bg-root); border: 1px solid var(--border-light); border-radius: 8px; padding: 1rem; white-space: pre-wrap; word-break: break-word; font-family: var(--font-mono); font-size: 0.8rem; max-height: 65vh; overflow-y: auto;"></pre>
  </dialog>

  <script>
    // ── Light-dismiss fallback for browsers without native <dialog closedby> support ──
    document.querySelectorAll('dialog[closedby="any"]').forEach((dialog) => {
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        dialog.addEventListener('click', (event) => {
          if (event.target !== dialog) return;
          const rect = dialog.getBoundingClientRect();
          const isDialogContent = (
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.left + rect.width
          );
          if (isDialogContent) return;
          dialog.close();
        });
      }
    });

    // Optional token auth support (/?token=SECRET)
    const DASHBOARD_TOKEN = new URLSearchParams(window.location.search).get('token');
    if (DASHBOARD_TOKEN) {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        const headers = new Headers(init.headers || {});
        headers.set('x-dashboard-token', DASHBOARD_TOKEN);
        return nativeFetch(input, { ...init, headers });
      };
    }

    // ── State ────────────────────────────────────────────────────────
    let activeTab = 'sessions';
    let sessions = [];
    let meshStats = null;
    let selectedSessionId = null;
    let sessionFilter = 'all';

    let jobs = [];
    let selectedJobId = null;
    let jobFilter = 'all';

    let appConfig = null;

    function escapeHtml(text) {
      return String(text === null || text === undefined ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function formatNumber(n) {
      return Number(n || 0).toLocaleString();
    }

    function formatRelativeTime(iso) {
      if (!iso) return '--';
      const d = new Date(iso);
      const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
      if (diffSec < 5) return 'just now';
      if (diffSec < 60) return diffSec + 's ago';
      if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
      if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function switchTab(tab) {
      activeTab = tab;
      ['sessions', 'jobs', 'config'].forEach((t) => {
        document.getElementById('tabBtn-' + t).classList.toggle('active', t === tab);
        document.getElementById('view-' + t).classList.toggle('active', t === tab);
      });
    }

    // ── Master Data Sync ─────────────────────────────────────────────
    async function refreshAll() {
      await Promise.all([fetchOverview(), fetchSessions(), fetchJobs(), fetchConfig()]);
    }

    async function fetchOverview() {
      try {
        const res = await fetch('/api/overview');
        const data = await res.json();
        if (data.mesh_stats) {
          meshStats = data.mesh_stats;
          document.getElementById('kpiMultiplier').innerText = (meshStats.effective_context_multiplier || 1).toFixed(2) + 'x';
          document.getElementById('kpiSavedTokens').innerText = formatNumber(meshStats.context_firewall_saved_tokens) + ' tok saved';
          document.getElementById('kpiTotalTokens').innerText = formatNumber(meshStats.total_isolated_context_tokens);
          document.getElementById('kpiTotalSessions').innerText = formatNumber(meshStats.total_sessions);
          document.getElementById('kpiActiveSessionsBadge').innerText = meshStats.active_sessions + ' Active';
          const td = meshStats.tier_distribution || {};
          document.getElementById('kpiTierFast').innerText = 'Fast: ' + (td.fast || 0);
          document.getElementById('kpiTierBalanced').innerText = 'Bal: ' + (td.balanced || 0);
          document.getElementById('kpiTierHeavy').innerText = 'Heavy: ' + (td.heavy || 0);
        }
        if (data.job_stats) {
          const js = data.job_stats;
          document.getElementById('kpiTotalJobs').innerText = formatNumber(js.total);
          document.getElementById('kpiJobBreakdown').innerText =
            \`\${js.running} running • \${js.completed} completed • \${js.failed} failed\`;
          const cpBadge = document.getElementById('kpiPendingApprovals');
          cpBadge.innerText = js.waiting_approval + ' Checkpoints';
          cpBadge.className = 'badge ' + (js.waiting_approval > 0 ? 'badge-waiting_approval' : 'badge-completed');
        }
        if (data.system) {
          const sys = data.system;
          document.getElementById('kpiSafetyMode').innerText = sys.safety_mode;
          document.getElementById('kpiProvidersList').innerText = (sys.providers || []).join(', ') || 'none';
          document.getElementById('kpiSystemStats').innerText =
            \`RAM: \${sys.memory_rss_mb} MB • Uptime: \${sys.uptime_seconds}s • \${sys.platform}\`;
          document.getElementById('tabCount-agents').innerText = sys.agents_count || 0;
        }
      } catch (err) {
        console.error('Overview fetch failed:', err);
      }
    }

    // ── Session Mesh Logic ───────────────────────────────────────────
    async function fetchSessions() {
      try {
        const res = await fetch('/api/sessions');
        const data = await res.json();
        sessions = data.sessions || [];
        const specialistCount = sessions.filter((s) => s.provider !== 'host').length;
        document.getElementById('tabCount-sessions').innerText = specialistCount;
        renderSessionList();

        if (selectedSessionId) {
          await fetchSessionDetail(selectedSessionId);
        } else {
          const firstSpecialist = sessions.find((s) => s.provider !== 'host') || sessions[0];
          if (firstSpecialist) {
            await selectSession(firstSpecialist.id);
          }
        }
      } catch (err) {
        console.error('Sessions fetch failed:', err);
      }
    }

    function setSessionFilter(filter) {
      sessionFilter = filter;
      document.querySelectorAll('[data-filter]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
      });
      renderSessionList();
    }

    function renderSessionList() {
      const container = document.getElementById('sessionListContainer');
      const query = (document.getElementById('sessionSearchInput')?.value || '').toLowerCase().trim();

      // Filter out empty synthetic host rows unless they are explicitly searched
      const filtered = sessions.filter((s) => {
        if (s.provider === 'host' && !query) return false;
        if (sessionFilter === 'active' && !['running', 'idle', 'waiting_input'].includes(s.status)) return false;
        if (['fast', 'balanced', 'heavy'].includes(sessionFilter) && s.tier !== sessionFilter) return false;
        if (query) {
          const hay = \`\${s.name} \${s.role} \${s.model} \${s.id} \${s.parent_session_id || ''}\`.toLowerCase();
          if (!hay.includes(query)) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.82rem;">No matching sessions in the mesh.</div>';
        return;
      }

      container.innerHTML = filtered.map((s) => {
        const depth = Math.min(3, s.depth || 0);
        const tier = s.tier || 'balanced';
        const usedTok = s.context_tokens_used || 0;
        return \`
          <div class="item-card depth-\${depth} \${s.id === selectedSessionId ? 'active' : ''}" onclick="selectSession('\${escapeHtml(s.id)}')">
            <div class="item-top">
              <div class="item-title">
                \${depth > 0 ? '<span style="color: var(--primary);">↳</span>' : ''}
                <span>\${escapeHtml(s.name)}</span>
              </div>
              <span class="badge badge-\${escapeHtml(s.status)}">\${escapeHtml(s.status)}</span>
            </div>
            <div class="item-role" title="\${escapeHtml(s.role)}">\${escapeHtml(s.role)}</div>
            <div class="item-meta">
              <span style="display: flex; gap: 4px; align-items: center;">
                <span class="badge tier-\${escapeHtml(tier)}">\${escapeHtml(tier)}</span>
                <span>\${escapeHtml(s.model)}</span>
              </span>
              <span>\${formatNumber(usedTok)} tok • \${s.iterations || 0}t</span>
            </div>
          </div>
        \`;
      }).join('');
    }

    async function selectSession(id) {
      selectedSessionId = id;
      renderSessionList();
      document.getElementById('sessionEmptyState').style.display = 'none';
      document.getElementById('sessionDetailPane').style.display = 'flex';
      await fetchSessionDetail(id);
    }

    async function fetchSessionDetail(id) {
      try {
        const res = await fetch(\`/api/sessions/\${encodeURIComponent(id)}\`);
        const data = await res.json();
        const sess = data.session;
        if (!sess) return;

        const stats = data.context_stats || {};
        const tier = stats.tier || 'balanced';
        const used = stats.context_tokens_used || 0;
        const saved = stats.context_firewall_saved_tokens || 0;
        const efficiency = used > 0 ? Math.round((saved / used) * 100) : 0;

        document.getElementById('sessHeaderName').innerText = sess.name;
        document.getElementById('sessHeaderRole').innerText = sess.role;

        const statusBadge = document.getElementById('sessHeaderStatus');
        statusBadge.className = 'badge badge-' + sess.status;
        statusBadge.innerText = sess.status;

        const tierBadge = document.getElementById('sessHeaderTier');
        tierBadge.className = 'badge tier-' + tier;
        tierBadge.innerText = tier + ' tier';

        document.getElementById('sessHeaderModel').innerText = sess.model;
        document.getElementById('sessMetaId').innerText = sess.id;

        const parentEl = document.getElementById('sessMetaParent');
        parentEl.innerText = sess.parent_session_id || 'root';
        parentEl.onclick = () => {
          if (sess.parent_session_id) selectSession(sess.parent_session_id);
        };

        document.getElementById('sessMetaProvider').innerText = sess.provider;
        document.getElementById('sessMetaWorkspace').innerText = sess.workspace_path || './';
        document.getElementById('sessMetaSafety').innerText = sess.safety_mode || 'semi-autonomous';
        document.getElementById('sessMetaUpdated').innerText = formatRelativeTime(sess.updated_at);
        document.getElementById('sessSystemPrompt').innerText = sess.system_prompt || '(No system prompt)';

        document.getElementById('sessMetricUsed').innerText = formatNumber(used);
        document.getElementById('sessMetricSaved').innerText = formatNumber(saved);
        document.getElementById('sessMetricEfficiency').innerText = efficiency + '%';
        document.getElementById('sessMetricIterations').innerText = formatNumber(sess.iterations || 0);
        document.getElementById('sessMetricTools').innerText = formatNumber(sess.total_tool_calls || 0);

        // Action buttons
        const actionsEl = document.getElementById('sessActionButtons');
        if (sess.status === 'terminated') {
          actionsEl.innerHTML = '<span class="badge badge-terminated">Terminated</span>';
        } else {
          actionsEl.innerHTML = \`
            \${sess.status === 'paused'
              ? \`<button class="btn btn-primary" onclick="sessionAction('\${escapeHtml(sess.id)}', 'resume')">▶ Resume</button>\`
              : \`<button class="btn btn-warning" onclick="sessionAction('\${escapeHtml(sess.id)}', 'pause')">⏸ Pause</button>\`
            }
            <button class="btn btn-danger" onclick="sessionAction('\${escapeHtml(sess.id)}', 'terminate')">✕ Terminate</button>
          \`;
        }

        // Transcript
        const messages = data.messages || [];
        document.getElementById('sessMsgCountLabel').innerText = messages.length + ' messages';
        const feed = document.getElementById('sessTranscriptFeed');
        if (messages.length === 0) {
          feed.innerHTML = '<div style="padding: 1rem; color: var(--text-muted); font-size: 0.82rem;">No conversation turns recorded yet. Send a prompt below to start a turn in this isolated context window.</div>';
        } else {
          feed.innerHTML = messages.map((m) => \`
            <div class="msg-bubble \${escapeHtml(m.role)}">
              <div class="msg-meta">
                <strong>\${escapeHtml(m.role.toUpperCase())}</strong>
                <span>\${formatRelativeTime(m.timestamp)}</span>
              </div>
              <div class="msg-body">\${escapeHtml(m.content)}</div>
            </div>
          \`).join('');
        }

        // Inbox table
        const inbox = data.inbox || [];
        document.getElementById('sessInboxCountLabel').innerText = inbox.length + ' items';
        const tbody = document.getElementById('sessInboxTableBody');
        if (inbox.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No inbox messages yet.</td></tr>';
        } else {
          tbody.innerHTML = inbox.map((msg) => \`
            <tr>
              <th>\${formatRelativeTime(msg.created_at)}</th>
              <td style="font-family: var(--font-mono); font-size: 0.75rem;">\${escapeHtml(msg.sender_session_id)} → \${escapeHtml(msg.recipient_session_id)}</td>
              <td><span class="badge badge-queued">\${escapeHtml(msg.message_type)}</span></td>
              <td><span class="badge \${msg.read ? 'badge-completed' : 'badge-running'}">\${msg.read ? 'Read' : 'Unread'}</span></td>
              <td style="white-space: pre-wrap; max-width: 480px;">\${escapeHtml(msg.content)}</td>
            </tr>
          \`).join('');
        }
      } catch (err) {
        console.error('Session detail fetch failed:', err);
      }
    }

    async function sessionAction(sessionId, action) {
      try {
        await fetch(\`/api/sessions/\${encodeURIComponent(sessionId)}/action\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        await refreshAll();
      } catch (err) {
        console.error('Session action failed:', err);
      }
    }

    async function killAllSessions() {
      await fetch('/api/sessions/kill-all', { method: 'POST' });
      await refreshAll();
    }

    async function sendFollowUpMessage(event) {
      event.preventDefault();
      if (!selectedSessionId) return;
      const input = document.getElementById('sessFollowUpInput');
      const btn = document.getElementById('sessSendBtn');
      const content = input.value.trim();
      if (!content) return;

      input.value = '';
      btn.disabled = true;
      btn.innerText = 'Running Turn...';

      try {
        await fetch(\`/api/sessions/\${encodeURIComponent(selectedSessionId)}/message\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, await_response: true }),
        });
        await refreshAll();
      } catch (err) {
        console.error('Failed to send session message:', err);
      } finally {
        btn.disabled = false;
        btn.innerText = 'Send Turn ↵';
      }
    }

    // ── Spawn Session Modal ──────────────────────────────────────────
    function openSpawnDialog(presetId = '') {
      const dialog = document.getElementById('spawnSessionDialog');
      const presetSelect = document.getElementById('spawnPreset');
      if (presetId) {
        presetSelect.value = presetId;
        onPresetChange();
      }
      dialog.showModal();
    }

    function onPresetChange() {
      const presetId = document.getElementById('spawnPreset').value;
      if (!presetId || !appConfig?.agents?.[presetId]) return;
      const agent = appConfig.agents[presetId];
      document.getElementById('spawnName').placeholder = presetId;
      const m = (agent.model || '').toLowerCase();
      if (m.includes('claude') || m.includes('argon') || m.includes('pro')) {
        document.getElementById('spawnTier').value = 'heavy';
      } else if (m.includes('low') || m.includes('lite')) {
        document.getElementById('spawnTier').value = 'fast';
      } else {
        document.getElementById('spawnTier').value = 'balanced';
      }
    }

    async function submitSpawnSession(event) {
      event.preventDefault();
      const btn = document.getElementById('spawnSubmitBtn');
      btn.disabled = true;
      btn.innerText = 'Spawning...';

      const payload = {
        agent_preset: document.getElementById('spawnPreset').value || undefined,
        tier: document.getElementById('spawnTier').value || 'balanced',
        name: document.getElementById('spawnName').value.trim() || undefined,
        workspace_path: document.getElementById('spawnWorkspace').value.trim() || './',
        initial_message: document.getElementById('spawnTask').value.trim() || undefined,
        await_response: false, // Run asynchronously so UI responds immediately and streams via SSE
      };

      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        document.getElementById('spawnSessionDialog').close();
        document.getElementById('spawnTask').value = '';
        switchTab('sessions');
        await refreshAll();
        if (data.session_id) {
          await selectSession(data.session_id);
        }
      } catch (err) {
        console.error('Failed to spawn session:', err);
      } finally {
        btn.disabled = false;
        btn.innerText = '🚀 Launch Isolated Session';
      }
    }

    // ── Swarm & Pipeline Jobs Logic ──────────────────────────────────
    async function fetchJobs() {
      try {
        const res = await fetch('/api/jobs?limit=60');
        const data = await res.json();
        jobs = data.jobs || [];
        document.getElementById('tabCount-jobs').innerText = jobs.length;
        renderJobList();
        if (selectedJobId) {
          await fetchJobDetail(selectedJobId);
        } else if (jobs.length > 0) {
          await selectJob(jobs[0].id);
        }
      } catch (err) {
        console.error('Jobs fetch failed:', err);
      }
    }

    function setJobFilter(filter) {
      jobFilter = filter;
      document.querySelectorAll('[data-jobfilter]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-jobfilter') === filter);
      });
      renderJobList();
    }

    function renderJobList() {
      const container = document.getElementById('jobListContainer');
      const query = (document.getElementById('jobSearchInput')?.value || '').toLowerCase().trim();

      const filtered = jobs.filter((j) => {
        if (jobFilter === 'orchestrated' && j.mode === 'interactive') return false;
        if (jobFilter === 'interactive' && j.mode !== 'interactive') return false;
        if (query) {
          const hay = \`\${j.goal} \${j.mode} \${j.id} \${j.status}\`.toLowerCase();
          if (!hay.includes(query)) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.82rem;">No matching jobs found.</div>';
        return;
      }

      container.innerHTML = filtered.map((j) => \`
        <div class="item-card \${j.id === selectedJobId ? 'active' : ''}" onclick="selectJob('\${escapeHtml(j.id)}')">
          <div class="item-top">
            <span class="badge tier-\${j.mode === 'swarm' ? 'heavy' : j.mode === 'pipeline' ? 'balanced' : 'fast'}">\${escapeHtml(j.mode)}</span>
            <span class="badge badge-\${escapeHtml(j.status)}">\${escapeHtml(j.status)}</span>
          </div>
          <div class="item-title" style="margin: 0.25rem 0;" title="\${escapeHtml(j.goal)}">\${escapeHtml(j.goal)}</div>
          <div class="item-meta">
            <span>\${Math.round(j.progress || 0)}%</span>
            <span>\${formatRelativeTime(j.updated_at || j.created_at)}</span>
          </div>
        </div>
      \`).join('');
    }

    async function selectJob(id) {
      selectedJobId = id;
      renderJobList();
      document.getElementById('jobEmptyState').style.display = 'none';
      document.getElementById('jobDetailPane').style.display = 'flex';
      await fetchJobDetail(id);
    }

    async function fetchJobDetail(id) {
      try {
        const [jobRes, msgsRes, artsRes, cpsRes] = await Promise.all([
          fetch(\`/api/jobs/\${encodeURIComponent(id)}\`),
          fetch(\`/api/jobs/\${encodeURIComponent(id)}/messages\`),
          fetch(\`/api/jobs/\${encodeURIComponent(id)}/artifacts\`),
          fetch(\`/api/jobs/\${encodeURIComponent(id)}/checkpoints\`),
        ]);

        const { job } = await jobRes.json();
        if (!job) return;

        document.getElementById('jobHeaderGoal').innerText = job.goal;
        document.getElementById('jobHeaderSub').innerText = \`Job ID: \${job.id} • Workspace: \${job.workspace_path || './'}\`;

        const badge = document.getElementById('jobHeaderStatus');
        badge.className = 'badge badge-' + job.status;
        badge.innerText = job.status;

        document.getElementById('jobStepLabel').innerText = job.current_step ? \`Step: \${job.current_step}\` : 'Completed';
        document.getElementById('jobProgressLabel').innerText = \`\${Math.round(job.progress || 0)}%\`;
        document.getElementById('jobProgressFill').style.width = \`\${job.progress || 0}%\`;

        document.getElementById('jobMetaMode').innerText = job.mode;
        document.getElementById('jobMetaSafety').innerText = job.safety_mode;
        document.getElementById('jobMetaCreated').innerText = formatRelativeTime(job.created_at);
        document.getElementById('jobMetaUpdated').innerText = formatRelativeTime(job.updated_at);

        // Output
        const outCard = document.getElementById('jobOutputCard');
        if (job.output) {
          outCard.style.display = 'block';
          document.getElementById('jobOutputContent').innerText = job.output;
        } else {
          outCard.style.display = 'none';
        }

        // Checkpoints
        const cpsData = await cpsRes.json();
        const pending = (cpsData.checkpoints || []).filter((c) => c.status === 'pending');
        const cpBanner = document.getElementById('jobCheckpointBanner');
        if (pending.length > 0) {
          const cp = pending[0];
          cpBanner.style.display = 'block';
          cpBanner.innerHTML = \`
            <div class="card" style="border-color: var(--warning); background: var(--warning-soft);">
              <div class="card-header">
                <strong style="color: var(--warning);">⚠️ Human Checkpoint Approval Required: \${escapeHtml(cp.stage_name)}</strong>
                <span class="badge badge-waiting_approval">Pending</span>
              </div>
              <p style="font-size: 0.85rem; margin-bottom: 0.85rem;">\${escapeHtml(cp.action_description)}</p>
              <div style="display: flex; gap: 0.5rem;">
                <input type="text" id="cpFeedbackInput" class="search-input" placeholder="Optional reviewer feedback..." />
                <button class="btn btn-primary" onclick="resolveCheckpoint('\${escapeHtml(cp.id)}', 'approve')">✓ Approve</button>
                <button class="btn btn-danger" onclick="resolveCheckpoint('\${escapeHtml(cp.id)}', 'reject')">✕ Reject</button>
              </div>
            </div>
          \`;
        } else {
          cpBanner.style.display = 'none';
        }

        // Artifacts
        const artsData = await artsRes.json();
        const arts = artsData.artifacts || [];
        const artsCard = document.getElementById('jobArtifactsCard');
        if (arts.length > 0) {
          artsCard.style.display = 'block';
          document.getElementById('jobArtifactsGrid').innerHTML = arts.map((a) => \`
            <div class="item-card" data-name="\${escapeHtml(a.name)}" onclick="openArtifactModal('\${escapeHtml(id)}', this.dataset.name)">
              <div style="font-weight: 600; font-size: 0.85rem;">📄 \${escapeHtml(a.name)}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.25rem;">\${formatRelativeTime(a.created_at)}</div>
            </div>
          \`).join('');
        } else {
          artsCard.style.display = 'none';
        }

        // Messages
        const msgsData = await msgsRes.json();
        const msgs = msgsData.messages || [];
        const feed = document.getElementById('jobTranscriptFeed');
        if (msgs.length === 0) {
          feed.innerHTML = '<div style="padding: 1rem; color: var(--text-muted); font-size: 0.82rem;">No transcript messages recorded for this job.</div>';
        } else {
          feed.innerHTML = msgs.map((m) => \`
            <div class="msg-bubble \${escapeHtml(m.role)}">
              <div class="msg-meta">
                <strong>\${escapeHtml(m.role.toUpperCase())}</strong>
                <span>\${formatRelativeTime(m.timestamp)}</span>
              </div>
              <div class="msg-body">\${escapeHtml(m.content)}</div>
            </div>
          \`).join('');
        }
      } catch (err) {
        console.error('Job detail fetch failed:', err);
      }
    }

    async function resolveCheckpoint(checkpointId, decision) {
      const feedback = document.getElementById('cpFeedbackInput')?.value;
      await fetch(\`/api/checkpoints/\${encodeURIComponent(checkpointId)}/resolve\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, feedback }),
      });
      await refreshAll();
    }

    async function openArtifactModal(jobId, name) {
      const res = await fetch(\`/api/jobs/\${encodeURIComponent(jobId)}/artifacts/\${encodeURIComponent(name)}\`);
      const data = await res.json();
      document.getElementById('artifactDialogTitle').innerText = '📄 ' + name;
      document.getElementById('artifactDialogContent').innerText = data.content || '';
      document.getElementById('artifactPreviewDialog').showModal();
    }

    // ── Config & Specialist Roster View ──────────────────────────────
    async function fetchConfig() {
      try {
        const res = await fetch('/api/config');
        const data = await res.json();
        appConfig = data.config;
        if (!appConfig) return;

        // Populate Spawn Preset dropdown
        const presetSelect = document.getElementById('spawnPreset');
        const currentVal = presetSelect.value;
        const agentEntries = Object.entries(appConfig.agents || {});
        presetSelect.innerHTML = '<option value="">Custom Specialist</option>' +
          agentEntries.map(([id, a]) => \`<option value="\${escapeHtml(id)}">\${escapeHtml(id)} — \${escapeHtml(a.role)}</option>\`).join('');
        presetSelect.value = currentVal;

        // Render Tiers Grid
        const tiers = appConfig.inference?.tiers || {
          fast: { provider: 'agy', model: 'gemini-3.8-flash-low' },
          balanced: { provider: 'agy', model: 'gemini-3.8-flash-high' },
          heavy: { provider: 'agy_claude', model: 'claude-sonnet-4-6' },
        };
        document.getElementById('configTiersGrid').innerHTML = Object.entries(tiers).map(([tierName, cfg]) => \`
          <div class="metric-box">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
              <span class="badge tier-\${escapeHtml(tierName)}">\${escapeHtml(tierName.toUpperCase())} TIER</span>
              <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">provider: \${escapeHtml(cfg.provider)}</span>
            </div>
            <div class="metric-val" style="font-size: 0.95rem;">\${escapeHtml(cfg.model)}</div>
          </div>
        \`).join('');

        // Render Specialist Roster Table
        const tbody = document.getElementById('configAgentsTableBody');
        tbody.innerHTML = agentEntries.map(([id, a]) => \`
          <tr>
            <th>\${escapeHtml(id)}</th>
            <td>\${escapeHtml(a.role)}</td>
            <td style="font-family: var(--font-mono); font-size: 0.76rem;">
              <span class="badge badge-queued">\${escapeHtml(a.provider)}</span>
              <span style="margin-left: 4px;">\${escapeHtml(a.model || 'default')}</span>
            </td>
            <td style="font-family: var(--font-mono); font-size: 0.74rem; color: var(--text-secondary);">
              \${escapeHtml((a.tools || []).join(', ') || 'all workspace tools')}
            </td>
            <td>
              <button class="btn btn-outline" style="padding: 3px 8px; font-size: 0.72rem;" onclick="openSpawnDialog('\${escapeHtml(id)}')">⚡ Spawn</button>
            </td>
          </tr>
        \`).join('');

        // Render Pipelines
        const pipelines = Object.entries(appConfig.pipelines || {});
        document.getElementById('configPipelinesContainer').innerHTML = pipelines.map(([name, p]) => \`
          <div class="metric-box">
            <div style="font-weight: 700; color: var(--primary); margin-bottom: 0.4rem;">🔗 \${escapeHtml(name)}</div>
            <div style="font-size: 0.76rem; color: var(--text-secondary);">
              \${(p.stages || []).map((s) => \`\${escapeHtml(s.name)} (\${escapeHtml(s.agent)})\`).join(' → ')}
            </div>
          </div>
        \`).join('');
      } catch (err) {
        console.error('Config fetch failed:', err);
      }
    }

    function copyTextById(id) {
      const text = document.getElementById(id)?.innerText || '';
      navigator.clipboard?.writeText(text);
    }

    // ── Real-Time SSE Connection ─────────────────────────────────────
    const sseBadge = document.getElementById('sseStatusBadge');
    const sseUrl = '/api/events' + (DASHBOARD_TOKEN ? '?token=' + encodeURIComponent(DASHBOARD_TOKEN) : '');
    const sse = new EventSource(sseUrl);

    sse.onopen = () => {
      sseBadge.className = 'badge badge-idle';
      sseBadge.innerText = '● Live SSE';
    };

    sse.onerror = () => {
      sseBadge.className = 'badge badge-warning';
      sseBadge.innerText = '○ Reconnecting...';
    };

    sse.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type && ev.type !== 'connected') {
          refreshAll();
        }
      } catch {}
    };

    // Initial load & periodic sync
    refreshAll();
    setInterval(refreshAll, 5000);
  </script>
</body>
</html>`;
}
