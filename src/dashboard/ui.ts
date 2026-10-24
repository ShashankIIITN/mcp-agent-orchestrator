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
      line-height: 1.6;
      word-break: break-word;
      color: var(--text-secondary);
    }

    .msg-bubble.tool .msg-body {
      white-space: pre-wrap;
      font-family: var(--font-mono);
      font-size: 0.77rem;
    }

    /* ── Rich GitHub-Flavored Markdown Typography (.markdown-body) ── */
    .markdown-body {
      font-family: var(--font-sans);
      font-size: 0.87rem;
      line-height: 1.65;
      color: var(--text);
      word-break: break-word;
    }

    .markdown-body > *:first-child {
      margin-top: 0 !important;
    }

    .markdown-body > *:last-child {
      margin-bottom: 0 !important;
    }

    .markdown-body h1,
    .markdown-body h2,
    .markdown-body h3,
    .markdown-body h4,
    .markdown-body h5,
    .markdown-body h6 {
      color: var(--text);
      font-weight: 700;
      line-height: 1.3;
      margin-top: 1.15rem;
      margin-bottom: 0.5rem;
    }

    .markdown-body h1 { font-size: 1.25rem; border-bottom: 1px solid var(--border-light); padding-bottom: 0.35rem; }
    .markdown-body h2 { font-size: 1.1rem; border-bottom: 1px solid var(--border-light); padding-bottom: 0.3rem; }
    .markdown-body h3 { font-size: 0.98rem; color: var(--primary); }
    .markdown-body h4 { font-size: 0.9rem; color: var(--text-secondary); }

    .markdown-body p {
      margin: 0.55rem 0;
    }

    .markdown-body ul,
    .markdown-body ol {
      margin: 0.55rem 0;
      padding-left: 1.45rem;
    }

    .markdown-body li {
      margin: 0.28rem 0;
    }

    .markdown-body li > ul,
    .markdown-body li > ol {
      margin: 0.2rem 0;
    }

    .markdown-body strong {
      color: #f8fafc;
      font-weight: 700;
    }

    .markdown-body em {
      color: var(--text-secondary);
      font-style: italic;
    }

    .markdown-body code {
      font-family: var(--font-mono);
      font-size: 0.79rem;
      background: rgba(56, 189, 248, 0.1);
      color: #7dd3fc;
      border: 1px solid rgba(56, 189, 248, 0.22);
      padding: 0.12rem 0.38rem;
      border-radius: 4px;
    }

    .markdown-body pre {
      background: #020617;
      border: 1px solid var(--border-light);
      border-radius: 8px;
      padding: 0.85rem 1rem;
      margin: 0.75rem 0;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 0.79rem;
      line-height: 1.55;
      color: #e2e8f0;
    }

    .markdown-body pre code {
      background: transparent;
      border: none;
      padding: 0;
      color: inherit;
      font-size: inherit;
    }

    .markdown-body .md-code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--bg-elevated);
      border: 1px solid var(--border-light);
      border-bottom: none;
      border-radius: 8px 8px 0 0;
      padding: 0.3rem 0.75rem;
      font-family: var(--font-mono);
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-top: 0.75rem;
    }

    .markdown-body .md-code-header + pre {
      margin-top: 0;
      border-top-left-radius: 0;
      border-top-right-radius: 0;
    }

    .markdown-body blockquote {
      margin: 0.65rem 0;
      padding: 0.55rem 0.9rem;
      border-left: 3px solid var(--primary);
      background: rgba(56, 189, 248, 0.06);
      border-radius: 0 6px 6px 0;
      color: var(--text-secondary);
    }

    .markdown-body hr {
      border: none;
      border-top: 1px solid var(--border-light);
      margin: 1rem 0;
    }

    .markdown-body a {
      color: var(--primary);
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .markdown-body .md-file-ref {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-family: var(--font-mono);
      font-size: 0.77rem;
      background: rgba(99, 102, 241, 0.14);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.3);
      padding: 0.08rem 0.42rem;
      border-radius: 4px;
      text-decoration: none;
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

        <!-- Real-Time Live Execution Stream & Activity Console -->
        <div class="card" id="sessLiveStreamCard" style="border-color: rgba(56, 189, 248, 0.35); background: rgba(15, 23, 42, 0.92);">
          <div class="card-header" style="margin-bottom: 0.5rem;">
            <div class="card-title">
              <span>📡 Real-Time Execution Status &amp; Activity Log</span>
              <span id="sessLivePulseBadge" class="badge badge-running" style="margin-left: 0.4rem;">Live Stream</span>
            </div>
            <button type="button" class="btn btn-outline" style="padding: 3px 8px; font-size: 0.72rem;" onclick="clearSessionLiveLog()">Clear Log</button>
          </div>
          <div id="sessLiveStatusText" style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--primary); padding: 0.55rem 0.75rem; background: var(--bg-root); border: 1px solid var(--border-light); border-radius: 6px; margin-bottom: 0.6rem;">
            Standing by for live events...
          </div>
          <div id="sessLiveLogFeed" style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary); background: var(--bg-root); border: 1px solid var(--border-light); border-radius: 6px; padding: 0.65rem 0.8rem; max-height: 185px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.3rem;"></div>
        </div>

        <!-- Prominent Latest Session Output / Deliverable Card -->
        <div class="card" id="sessOutputCard">
          <div class="card-header">
            <div class="card-title">
              <span>✨ Session Output / Latest Deliverable</span>
              <span id="sessOutputStateBadge" class="badge badge-completed" style="margin-left: 0.4rem;">Output</span>
            </div>
            <div style="display: flex; gap: 0.45rem;" id="sessOutputActions">
              <button type="button" class="btn btn-outline" onclick="copyTextById('sessOutputContent')">📋 Copy Output</button>
            </div>
          </div>
          <div id="sessOutputQuickStart" style="display: none; padding: 0.85rem; background: var(--bg-root); border: 1px dashed var(--border-focus); border-radius: 8px; margin-bottom: 0.5rem;">
            <div style="font-size: 0.83rem; color: var(--text-secondary); margin-bottom: 0.6rem;">
              This isolated session was initialized without an initial task. Click a 1-click task below or send a custom prompt in the composer to execute its first turn:
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button type="button" class="btn btn-primary" onclick="triggerQuickPrompt('Review the mcp-agent-orchestrator codebase architecture, edge cases, and security guards, and return a concise prioritized report.')">🔍 Review Codebase &amp; Security</button>
              <button type="button" class="btn btn-outline" onclick="triggerQuickPrompt('Scan src/ and return a concise architectural map of entrypoints, providers, and key modules.')">🗺️ Map Architecture</button>
              <button type="button" class="btn btn-outline" onclick="triggerQuickPrompt('Inspect tests/ and summarize test coverage and any untested edge cases.')">🧪 Audit Test Suite</button>
            </div>
          </div>
          <div id="sessOutputContent" class="markdown-body" style="background: var(--bg-root); border: 1px solid var(--border-light); border-radius: 8px; padding: 1.05rem 1.2rem; font-family: var(--font-sans); font-size: 0.86rem; line-height: 1.65; max-height: 480px; overflow-y: auto; color: var(--text);">No output generated yet.</div>
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
          <div id="jobOutputContent" class="markdown-body" style="background: var(--bg-root); border: 1px solid var(--border-light); border-radius: 8px; padding: 1.05rem 1.2rem; font-size: 0.85rem; line-height: 1.65; max-height: 440px; overflow-y: auto;"></div>
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
      Launch a specialist in its own separate context window with custom model tiering and real-time SSE streaming.
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
        <div class="form-field full">
          <label for="spawnTask">Initial Task / Prompt (<code>initial_message</code>) *</label>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 0.35rem;">
            <button type="button" class="filter-pill" onclick="document.getElementById('spawnTask').value='Review the mcp-agent-orchestrator codebase architecture, edge cases, and security guards, and return a concise prioritized report.'">🔍 Code &amp; Security Review</button>
            <button type="button" class="filter-pill" onclick="document.getElementById('spawnTask').value='Scan src/ and return a concise architectural map of entrypoints, providers, and key modules.'">🗺️ Architecture Map</button>
            <button type="button" class="filter-pill" onclick="document.getElementById('spawnTask').value='Inspect tests/ and summarize existing test suites and any untested edge cases.'">🧪 Test Coverage Audit</button>
          </div>
          <textarea id="spawnTask" class="form-textarea" placeholder="Describe what this isolated session should analyze, review, or build..." required></textarea>
        </div>
        <div class="form-field">
          <label for="spawnName">Session Name (optional)</label>
          <input type="text" id="spawnName" class="form-input" placeholder="Auto-generated from preset if blank" />
        </div>
        <div class="form-field">
          <label for="spawnWorkspace">Workspace Path</label>
          <input type="text" id="spawnWorkspace" class="form-input" value="./" />
        </div>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem;">
        <button type="button" class="btn btn-outline" onclick="document.getElementById('spawnSessionDialog').close()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="spawnSubmitBtn">🚀 Launch &amp; Stream Live</button>
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
    <div id="artifactDialogContent" class="markdown-body" style="background: var(--bg-root); border: 1px solid var(--border-light); border-radius: 8px; padding: 1.05rem 1.2rem; font-size: 0.85rem; line-height: 1.65; max-height: 68vh; overflow-y: auto;"></div>
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

    // Real-time SSE activity logs and live streaming text per session
    const sessionLiveLogs = {};
    const sessionLiveStreams = {};
    const sessionLiveStatus = {};

    let jobs = [];
    let selectedJobId = null;
    let jobFilter = 'all';

    let appConfig = null;

    function formatSessionStatusLabel(status, iterations) {
      if (status === 'running') return '⚡ running';
      if (status === 'error') return '❌ error';
      if (status === 'paused') return '⏸ paused';
      if (status === 'terminated') return '✕ terminated';
      if (status === 'idle' && (iterations || 0) > 0) return '✓ done • ready';
      return '○ standby';
    }

    function formatSessionBadgeClass(status, iterations) {
      if (status === 'idle' && (iterations || 0) > 0) return 'badge-completed';
      return 'badge-' + (status || 'idle');
    }

    function escapeHtml(text) {
      return String(text === null || text === undefined ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // ── Safe GFM Markdown Parser & Sanitizer (modern-web-guidance: sanitize-untrusted-html) ──
    const MD_SANITIZER_CONFIG = {
      elements: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr', 'blockquote',
        'ul', 'ol', 'li',
        'pre', 'code', 'div', 'span',
        'strong', 'em', 'del', 'a',
        'table', 'thead', 'tbody', 'tr', 'th', 'td'
      ],
      attributes: ['href', 'target', 'rel', 'class', 'title', 'value']
    };

    function formatInlineMarkdown(rawLine) {
      // 1. Extract inline code spans into placeholders before escaping/linking
      const codeSpans = [];
      let text = String(rawLine || '').replace(/\\x60([^\\x60\\n]+)\\x60/g, (_, code) => {
        const idx = codeSpans.length;
        codeSpans.push(\`<code>\${escapeHtml(code)}</code>\`);
        return \`\\x00CODE\${idx}\\x00\`;
      });

      // 2. Escape remaining raw HTML characters
      text = escapeHtml(text);

      // 3. Markdown links: [label](url) — supports file:/// workspace references and http(s):// links
      text = text.replace(/\\[([^\\]]+)\\]\\(((?:[^()\\s]|\\([^()\\s]*\\))+)\\)/g, (_, label, rawHref) => {
        const href = rawHref.replace(/&amp;/g, '&');
        if (/^https?:\\/\\//i.test(href)) {
          return \`<a href="\${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">\${label}</a>\`;
        }
        if (/^file:\\/\\/\\//i.test(href)) {
          const decodedTitle = decodeURIComponent(href.replace(/^file:\\/\\/\\//i, ''));
          return \`<span class="md-file-ref" title="\${escapeHtml(decodedTitle)}">📄 \${label}</span>\`;
        }
        return \`<code>\${label}</code>\`;
      });

      // 4. Bold + Italic, Bold, Italic, Strikethrough
      text = text
        .replace(/\\*\\*\\*([^*\\n]+)\\*\\*\\*/g, '<strong><em>$1</em></strong>')
        .replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<strong>$1</strong>')
        .replace(/__([^_\\n]+)__/g, '<strong>$1</strong>')
        .replace(/(^|[\\s(])\\*([^*\\n]+)\\*(?=[\\s).,!?:;]|$)/g, '$1<em>$2</em>')
        .replace(/~~([^~\\n]+)~~/g, '<del>$1</del>');

      // 5. Restore inline code spans
      text = text.replace(/\\x00CODE(\\d+)\\x00/g, (_, idx) => codeSpans[Number(idx)] || '');
      return text;
    }

    function renderMarkdownToHtml(rawText) {
      if (!rawText) return '';
      const normalized = String(rawText).replace(/\\r\\n/g, '\\n');

      // Extract fenced code blocks (including unclosed trailing fences during live SSE streaming)
      const codeBlocks = [];
      let working = normalized.replace(/\\x60{3}([a-zA-Z0-9_+.-]*)?[ \\t]*\\n([\\s\\S]*?)(?:\\x60{3}|$)/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        const cleanLang = (lang || 'code').trim();
        const trimmedCode = code.replace(/\\n$/, '');
        codeBlocks.push(
          \`<pre><div class="md-code-header"><span>\${escapeHtml(cleanLang)}</span></div><code>\${escapeHtml(trimmedCode)}</code></pre>\`
        );
        return \`\\n@@MD_CODE_BLOCK_\${idx}@@\\n\`;
      });

      const lines = working.split('\\n');
      const out = [];
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        // Empty line
        if (!trimmed) {
          i++;
          continue;
        }

        // Extracted fenced code block placeholder
        const codeMatch = trimmed.match(/^@@MD_CODE_BLOCK_(\\d+)@@$/);
        if (codeMatch) {
          out.push(codeBlocks[Number(codeMatch[1])] || '');
          i++;
          continue;
        }

        // Horizontal rule
        if (/^(?:---+|\\*\\*\\*+|___+)$/.test(trimmed)) {
          out.push('<hr>');
          i++;
          continue;
        }

        // ATX Heading (# to ######)
        const headingMatch = line.match(/^\\s*(#{1,6})\\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          out.push(\`<h\${level}>\${formatInlineMarkdown(headingMatch[2].trim())}</h\${level}>\`);
          i++;
          continue;
        }

        // Blockquote (> ...)
        if (/^\\s*>\\s?/.test(line)) {
          const quoteLines = [];
          while (i < lines.length && /^\\s*>\\s?/.test(lines[i])) {
            quoteLines.push(lines[i].replace(/^\\s*>\\s?/, ''));
            i++;
          }
          out.push(\`<blockquote>\${renderMarkdownToHtml(quoteLines.join('\\n'))}</blockquote>\`);
          continue;
        }

        // GFM Table
        if (
          trimmed.startsWith('|') &&
          i + 1 < lines.length &&
          /^\\s*\\|[\\s:-]+\\|/.test(lines[i + 1])
        ) {
          const parseRow = (r) =>
            r.trim().replace(/^\\|/, '').replace(/\\|$/, '').split('|').map((c) => formatInlineMarkdown(c.trim()));
          const headers = parseRow(lines[i]);
          i += 2; // Skip header & separator
          const rows = [];
          while (i < lines.length && lines[i].trim().startsWith('|')) {
            rows.push(parseRow(lines[i]));
            i++;
          }
          out.push(
            \`<table><thead><tr>\${headers.map((h) => \`<th>\${h}</th>\`).join('')}</tr></thead><tbody>\` +
            rows.map((r) => \`<tr>\${r.map((c) => \`<td>\${c}</td>\`).join('')}</tr>\`).join('') +
            '</tbody></table>'
          );
          continue;
        }

        // Lists (Ordered & Unordered, with nested sub-list support)
        const listMatch = line.match(/^(\\s*)(?:(\\d+)[.)]|([-*+]))\\s+(.*)$/);
        if (listMatch) {
          const isOrdered = Boolean(listMatch[2]);
          const listTag = isOrdered ? 'ol' : 'ul';
          const itemsHtml = [];

          while (i < lines.length) {
            const itemLine = lines[i];
            if (!itemLine.trim()) {
              // Look ahead to see if the list continues after a single blank line
              if (i + 1 < lines.length && /^(\\s*)(?:(\\d+)[.)]|([-*+]))\\s+/.test(lines[i + 1])) {
                i++;
                continue;
              }
              break;
            }
            const m = itemLine.match(/^(\\s*)(?:(\\d+)[.)]|([-*+]))\\s+(.*)$/);
            if (!m) break;
            const indent = m[1].length;
            const itemOrdered = Boolean(m[2]);

            // If this is a top-level item of a different list type, close current list
            if (indent < 2 && itemOrdered !== isOrdered) break;

            if (indent >= 2 && itemsHtml.length > 0) {
              // Collect nested sub-list lines
              const subTag = itemOrdered ? 'ol' : 'ul';
              const subItems = [];
              while (i < lines.length) {
                const subLine = lines[i];
                const sm = subLine.match(/^(\\s*)(?:(\\d+)[.)]|([-*+]))\\s+(.*)$/);
                if (!sm || sm[1].length < 2) break;
                const valAttr = sm[2] ? \` value="\${Number(sm[2])}"\` : '';
                subItems.push(\`<li\${valAttr}>\${formatInlineMarkdown(sm[4])}</li>\`);
                i++;
              }
              itemsHtml[itemsHtml.length - 1] = itemsHtml[itemsHtml.length - 1].replace(
                /<\\/li>$/,
                \`<\${subTag}>\${subItems.join('')}</\${subTag}></li>\`
              );
              continue;
            }

            const valAttr = m[2] ? \` value="\${Number(m[2])}"\` : '';
            itemsHtml.push(\`<li\${valAttr}>\${formatInlineMarkdown(m[4])}</li>\`);
            i++;
          }

          out.push(\`<\${listTag}>\${itemsHtml.join('')}</\${listTag}>\`);
          continue;
        }

        // Paragraph block (accumulate consecutive non-special lines)
        const paraLines = [];
        while (
          i < lines.length &&
          lines[i].trim() &&
          !/^@@MD_CODE_BLOCK_(\\d+)@@$/.test(lines[i].trim()) &&
          !/^(?:---+|\\*\\*\\*+|___+)$/.test(lines[i].trim()) &&
          !/^\\s*(#{1,6})\\s+/.test(lines[i]) &&
          !/^\\s*>\\s?/.test(lines[i]) &&
          !/^(\\s*)(?:(\\d+)[.)]|([-*+]))\\s+/.test(lines[i])
        ) {
          paraLines.push(formatInlineMarkdown(lines[i]));
          i++;
        }
        if (paraLines.length > 0) {
          out.push(\`<p>\${paraLines.join('<br>')}</p>\`);
        } else {
          i++;
        }
      }

      return out.join('\\n');
    }

    function setMarkdownContent(el, rawText) {
      if (!el) return;
      const text = String(rawText === null || rawText === undefined ? '' : rawText);
      el.dataset.rawMarkdown = text;
      const html = renderMarkdownToHtml(text);
      if ('setHTML' in Element.prototype) {
        el.setHTML(html, { sanitizer: MD_SANITIZER_CONFIG });
      } else {
        el.innerHTML = html;
      }
    }

    function renderMessageBodyHtml(role, content) {
      if (role === 'tool') {
        return escapeHtml(content);
      }
      return renderMarkdownToHtml(content);
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
        const badgeCls = formatSessionBadgeClass(s.status, s.iterations);
        const badgeLabel = formatSessionStatusLabel(s.status, s.iterations);
        return \`
          <div class="item-card depth-\${depth} \${s.id === selectedSessionId ? 'active' : ''}" onclick="selectSession('\${escapeHtml(s.id)}')">
            <div class="item-top">
              <div class="item-title">
                \${depth > 0 ? '<span style="color: var(--primary);">↳</span>' : ''}
                <span>\${escapeHtml(s.name)}</span>
              </div>
              <span class="badge \${escapeHtml(badgeCls)}">\${escapeHtml(badgeLabel)}</span>
            </div>
            <div class="item-role" title="\${escapeHtml(s.role)}">\${escapeHtml(s.role)}</div>
            <div class="item-meta">
              <span style="display: flex; gap: 4px; align-items: center;">
                <span class="badge tier-\${escapeHtml(tier)}">\${escapeHtml(tier)}</span>
                <span>\${escapeHtml(s.model)}</span>
              </span>
              <span>\${formatNumber(usedTok)} tok • \${s.iterations || 0}t • \${s.total_tool_calls || 0}🔧</span>
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

    function clearSessionLiveLog() {
      if (!selectedSessionId) return;
      sessionLiveLogs[selectedSessionId] = [];
      renderSessionLiveConsole(selectedSessionId, null, []);
    }

    function renderSessionLiveConsole(id, sess, messages) {
      const statusTextEl = document.getElementById('sessLiveStatusText');
      const logFeedEl = document.getElementById('sessLiveLogFeed');
      const pulseBadge = document.getElementById('sessLivePulseBadge');

      const liveStatus = sessionLiveStatus[id];
      const liveLogs = sessionLiveLogs[id] || [];

      if (sess?.status === 'running') {
        pulseBadge.className = 'badge badge-running';
        pulseBadge.innerText = '⚡ Streaming Live';
        statusTextEl.innerText = liveStatus || \`⚡ Executing turn in isolated context window (\${sess.model})...\`;
      } else if (sess?.status === 'error') {
        pulseBadge.className = 'badge badge-error';
        pulseBadge.innerText = '❌ Error';
        statusTextEl.innerText = liveStatus || sess.last_error || '❌ Last turn ended with an error.';
      } else if ((sess?.iterations || 0) > 0) {
        pulseBadge.className = 'badge badge-completed';
        pulseBadge.innerText = '✓ Turn Complete';
        statusTextEl.innerText = liveStatus || \`✓ Turn completed (\${sess.iterations || 0} iterations, \${sess.total_tool_calls || 0} tool invocations).\`;
      } else {
        pulseBadge.className = 'badge badge-queued';
        pulseBadge.innerText = '○ Standby';
        statusTextEl.innerText = '○ Session initialized and standing by for instructions.';
      }

      // Combine live SSE events with persisted tool messages so historical sessions also show their step log
      let combinedEntries = [...liveLogs];
      if (combinedEntries.length === 0 && Array.isArray(messages) && messages.length > 0) {
        combinedEntries = messages.map((m) => {
          const t = new Date(m.timestamp || Date.now()).toLocaleTimeString();
          if (m.role === 'user') return \`[\${t}] 👤 User Task: \${(m.content || '').slice(0, 140)}\`;
          if (m.role === 'tool') return \`[\${t}] 🔧 \${(m.content || '').split('\\n')[0].slice(0, 140)}\`;
          if (m.role === 'assistant') {
            const isErr = (m.content || '').startsWith('Error invoking');
            return \`[\${t}] \${isErr ? '❌' : '✨'} Assistant \${isErr ? 'Error' : 'Deliverable'}: \${(m.content || '').slice(0, 140)}...\`;
          }
          return \`[\${t}] \${m.role}: \${(m.content || '').slice(0, 120)}\`;
        });
      }

      if (combinedEntries.length === 0) {
        logFeedEl.innerHTML = '<div style="color: var(--text-muted);">No execution steps logged yet. Launch or send a turn to watch real-time tool calls and token streaming.</div>';
      } else {
        logFeedEl.innerHTML = combinedEntries
          .slice(-40)
          .map((line) => \`<div>\${escapeHtml(line)}</div>\`)
          .join('');
        logFeedEl.scrollTop = logFeedEl.scrollHeight;
      }
    }

    async function triggerQuickPrompt(promptText) {
      if (!selectedSessionId || !promptText) return;
      const input = document.getElementById('sessFollowUpInput');
      input.value = promptText;
      await sendFollowUpMessage(new Event('submit'));
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
        statusBadge.className = 'badge ' + formatSessionBadgeClass(sess.status, sess.iterations);
        statusBadge.innerText = formatSessionStatusLabel(sess.status, sess.iterations);

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

        const messages = data.messages || [];
        renderSessionLiveConsole(id, sess, messages);

        // Prominent Session Output / Latest Deliverable Card
        const assistantMsgs = messages.filter((m) => m.role === 'assistant');
        const userMsgs = messages.filter((m) => m.role === 'user');
        const latestAssistant = assistantMsgs[assistantMsgs.length - 1];
        const firstUserPrompt = userMsgs[0]?.content || 'Review the mcp-agent-orchestrator codebase architecture, edge cases, and security guards.';
        const liveStreamText = sessionLiveStreams[id];

        const outContentEl = document.getElementById('sessOutputContent');
        const outBadgeEl = document.getElementById('sessOutputStateBadge');
        const outQuickStartEl = document.getElementById('sessOutputQuickStart');
        const outActionsEl = document.getElementById('sessOutputActions');

        if (sess.status === 'running') {
          outQuickStartEl.style.display = 'none';
          outBadgeEl.className = 'badge badge-running';
          outBadgeEl.innerText = '⚡ Streaming Live...';
          outContentEl.style.borderColor = 'rgba(56, 189, 248, 0.45)';
          setMarkdownContent(
            outContentEl,
            liveStreamText ||
              (latestAssistant ? latestAssistant.content : '⏳ Specialist is inspecting workspace files and running tools in its isolated context window. Output will stream here live...')
          );
          outActionsEl.innerHTML = \`<button type="button" class="btn btn-outline" onclick="copyTextById('sessOutputContent')">📋 Copy Markdown</button>\`;
        } else if (latestAssistant) {
          outQuickStartEl.style.display = 'none';
          const isErrOutput =
            sess.status === 'error' ||
            (latestAssistant.content || '').startsWith('Error invoking') ||
            (latestAssistant.content || '').startsWith('Error:');
          if (isErrOutput) {
            outBadgeEl.className = 'badge badge-error';
            outBadgeEl.innerText = '❌ Execution Error';
            outContentEl.style.borderColor = 'rgba(248, 113, 113, 0.5)';
            setMarkdownContent(outContentEl, latestAssistant.content);
            outActionsEl.innerHTML = \`
              <button type="button" class="btn btn-primary" onclick="triggerQuickPrompt(\${JSON.stringify(firstUserPrompt).replace(/"/g, '&quot;')})">↻ Retry Original Task</button>
              <button type="button" class="btn btn-outline" onclick="copyTextById('sessOutputContent')">📋 Copy</button>
            \`;
          } else {
            outBadgeEl.className = 'badge badge-completed';
            outBadgeEl.innerText = '✓ Completed Deliverable';
            outContentEl.style.borderColor = 'rgba(52, 211, 153, 0.4)';
            setMarkdownContent(outContentEl, latestAssistant.content);
            outActionsEl.innerHTML = \`<button type="button" class="btn btn-outline" onclick="copyTextById('sessOutputContent')">📋 Copy Markdown</button>\`;
          }
        } else {
          outQuickStartEl.style.display = 'block';
          outBadgeEl.className = 'badge badge-queued';
          outBadgeEl.innerText = '○ Awaiting First Task';
          outContentEl.style.borderColor = 'var(--border-light)';
          setMarkdownContent(outContentEl, 'No deliverable yet — click one of the quick-start tasks above or type an instruction below.');
          outActionsEl.innerHTML = '';
        }

        // Transcript
        document.getElementById('sessMsgCountLabel').innerText = messages.length + ' messages';
        const feed = document.getElementById('sessTranscriptFeed');
        if (messages.length === 0) {
          feed.innerHTML = '<div style="padding: 1rem; color: var(--text-muted); font-size: 0.82rem;">No conversation turns recorded yet. Send a prompt below to start a turn in this isolated context window.</div>';
        } else {
          feed.innerHTML = messages.map((m) => \`
            <div class="msg-bubble \${escapeHtml(m.role)}">
              <div class="msg-meta">
                <strong>\${escapeHtml(m.role === 'tool' ? '🔧 TOOL EXECUTION' : m.role.toUpperCase())}</strong>
                <span>\${formatRelativeTime(m.timestamp)}</span>
              </div>
              <div class="msg-body \${m.role === 'tool' ? '' : 'markdown-body'}">\${renderMessageBodyHtml(m.role, m.content)}</div>
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
              <td class="markdown-body" style="max-width: 520px;">\${renderMarkdownToHtml(msg.content)}</td>
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
      if (event && event.preventDefault) event.preventDefault();
      if (!selectedSessionId) return;
      const input = document.getElementById('sessFollowUpInput');
      const btn = document.getElementById('sessSendBtn');
      const content = input.value.trim();
      if (!content) return;

      input.value = '';
      btn.disabled = true;
      btn.innerText = 'Dispatching...';
      sessionLiveStreams[selectedSessionId] = '';
      sessionLiveStatus[selectedSessionId] = '🚀 Dispatching turn to isolated session...';

      try {
        // Dispatch asynchronously (await_response: false) so the UI streams live events via SSE immediately!
        await fetch(\`/api/sessions/\${encodeURIComponent(selectedSessionId)}/message\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, await_response: false }),
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
          setMarkdownContent(document.getElementById('jobOutputContent'), job.output);
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
              <div class="msg-body \${m.role === 'tool' ? '' : 'markdown-body'}">\${renderMessageBodyHtml(m.role, m.content)}</div>
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
      setMarkdownContent(document.getElementById('artifactDialogContent'), data.content || '');
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
      const el = document.getElementById(id);
      const text = el?.dataset?.rawMarkdown || el?.innerText || '';
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

    let sseRefreshTimer = null;
    function scheduleDebouncedRefresh(delayMs = 350) {
      if (sseRefreshTimer) return;
      sseRefreshTimer = setTimeout(async () => {
        sseRefreshTimer = null;
        await refreshAll();
      }, delayMs);
    }

    sse.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (!ev.type || ev.type === 'connected') return;

        if (ev.type === 'session_stream') {
          const sid = ev.data?.sessionId || ev.jobId;
          if (!sid) return;

          const timeStr = new Date(ev.timestamp || Date.now()).toLocaleTimeString();
          const statusText = ev.data?.statusText || ev.data?.stepType || 'Active step';
          sessionLiveStatus[sid] = statusText;

          if (!sessionLiveLogs[sid]) sessionLiveLogs[sid] = [];
          // Avoid spamming duplicate consecutive text_delta log lines; log start of streaming or non-delta steps
          if (ev.data?.stepType !== 'text_delta') {
            sessionLiveLogs[sid].push(\`[\${timeStr}] \${statusText}\`);
            if (sessionLiveLogs[sid].length > 80) sessionLiveLogs[sid].shift();
          }

          if (typeof ev.data?.accumulatedText === 'string' && ev.data.accumulatedText.length > 0) {
            sessionLiveStreams[sid] = ev.data.accumulatedText;
          }

          // Update in-memory session list item immediately
          const sessItem = sessions.find((s) => s.id === sid);
          if (sessItem) {
            if (ev.data?.stepType === 'turn_complete') {
              sessItem.status = 'idle';
            } else if (ev.data?.stepType === 'error') {
              sessItem.status = 'error';
            } else {
              sessItem.status = 'running';
            }
            if (typeof ev.data?.iterations === 'number') sessItem.iterations = ev.data.iterations;
            if (typeof ev.data?.totalToolCalls === 'number') sessItem.total_tool_calls = ev.data.totalToolCalls;
            if (typeof ev.data?.contextTokensUsed === 'number') sessItem.context_tokens_used = ev.data.contextTokensUsed;
            renderSessionList();
          }

          // If this session is currently selected in the inspector, update DOM instantaneously (<16ms)
          if (selectedSessionId === sid) {
            document.getElementById('sessLiveStatusText').innerText = statusText;
            const logFeedEl = document.getElementById('sessLiveLogFeed');
            logFeedEl.innerHTML = sessionLiveLogs[sid]
              .slice(-40)
              .map((line) => \`<div>\${escapeHtml(line)}</div>\`)
              .join('');
            logFeedEl.scrollTop = logFeedEl.scrollHeight;

            if (typeof ev.data?.iterations === 'number') {
              document.getElementById('sessMetricIterations').innerText = formatNumber(ev.data.iterations);
            }
            if (typeof ev.data?.totalToolCalls === 'number') {
              document.getElementById('sessMetricTools').innerText = formatNumber(ev.data.totalToolCalls);
            }
            if (typeof ev.data?.contextTokensUsed === 'number' && ev.data.contextTokensUsed > 0) {
              document.getElementById('sessMetricUsed').innerText = formatNumber(ev.data.contextTokensUsed);
            }

            if (typeof ev.data?.accumulatedText === 'string' && ev.data.accumulatedText.length > 0) {
              document.getElementById('sessOutputQuickStart').style.display = 'none';
              setMarkdownContent(document.getElementById('sessOutputContent'), ev.data.accumulatedText);
              const outBadgeEl = document.getElementById('sessOutputStateBadge');
              if (ev.data?.stepType === 'turn_complete') {
                outBadgeEl.className = 'badge badge-completed';
                outBadgeEl.innerText = '✓ Completed Deliverable';
              } else {
                outBadgeEl.className = 'badge badge-running';
                outBadgeEl.innerText = '⚡ Streaming Live...';
              }
            }
          }

          if (ev.data?.stepType === 'turn_complete' || ev.data?.stepType === 'error' || ev.data?.stepType === 'tool_done') {
            scheduleDebouncedRefresh(200);
          }
          return;
        }

        scheduleDebouncedRefresh(200);
      } catch {}
    };

    // Initial load & periodic sync
    refreshAll();
    setInterval(refreshAll, 5000);
  </script>
</body>
</html>`;
}
