import { createServer } from "node:http";
import type { Server } from "node:http";
import { SessionRegistry } from "./registry.js";
import { TaskStore } from "./task-store.js";
import { MessageLog } from "./message-log.js";

/**
 * A thin, read-only web view of the fleet's persisted state — for showing
 * agent-deck in a browser without cloning the repo and running the CLI. It
 * only reads the three JSON stores (`sessions.json`, `tasks.json`,
 * `messages.json`) that the CLI already writes to, reloading them on every
 * request; it has no way to send input into a pane, assign a task, or do
 * anything else the CLI doesn't already own. The terminal UI (`ink`,
 * ClaudePtyTransport) and the CLI's `assign`/`send` commands are the real
 * control surfaces — this dashboard stays a secondary visualization, not a
 * second implementation of them.
 */

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='4' fill='%23161b22'/%3E%3Crect x='3' y='3' width='4' height='4' rx='1' fill='%2358a6ff'/%3E%3Crect x='9' y='3' width='4' height='4' rx='1' fill='%233fb950'/%3E%3Crect x='3' y='9' width='10' height='4' rx='1' fill='%2330363d'/%3E%3C/svg%3E";

const PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>agent-deck</title>
<link rel="icon" href="${FAVICON}" />
<style>
  :root {
    color-scheme: dark;
    --bg: #0a0d12;
    --panel: #12161d;
    --panel-border: #23282f;
    --row-border: #1b1f26;
    --text: #e6edf3;
    --text-dim: #8b949e;
    --text-faint: #545d68;
    --accent: #58a6ff;
    --accent-2: #a371f7;
    --blue: #58a6ff; --blue-bg: rgba(88, 166, 255, 0.14);
    --amber: #e3b341; --amber-bg: rgba(227, 179, 65, 0.14);
    --red: #f85149; --red-bg: rgba(248, 81, 73, 0.14);
    --green: #3fb950; --green-bg: rgba(63, 185, 80, 0.14);
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background:
      radial-gradient(1200px 500px at 15% -10%, rgba(88, 166, 255, 0.08), transparent),
      radial-gradient(900px 400px at 100% 0%, rgba(163, 113, 247, 0.06), transparent),
      var(--bg);
    color: var(--text);
    margin: 0;
    padding: 2.5rem clamp(1rem, 4vw, 3.5rem) 4rem;
    -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap; }
  .brand { display: flex; align-items: center; gap: 0.7rem; }
  .brand-mark {
    width: 34px; height: 34px; border-radius: 9px;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    display: grid; place-items: center; font-size: 1rem; font-weight: 700; color: #05070a;
    box-shadow: 0 4px 14px rgba(88, 166, 255, 0.25);
    flex-shrink: 0;
  }
  h1 { font-size: 1.25rem; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
  header .sub { color: var(--text-dim); font-size: 0.82rem; margin: 0.15rem 0 0; }
  .live {
    display: inline-flex; align-items: center; gap: 0.45rem;
    background: var(--panel); border: 1px solid var(--panel-border);
    border-radius: 999px; padding: 0.4rem 0.85rem 0.4rem 0.65rem;
    font-size: 0.78rem; color: var(--text-dim); white-space: nowrap;
  }
  .live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 0 rgba(63,185,80,0.6); animation: pulse 2s infinite; }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(63, 185, 80, 0.55); }
    70% { box-shadow: 0 0 0 6px rgba(63, 185, 80, 0); }
    100% { box-shadow: 0 0 0 0 rgba(63, 185, 80, 0); }
  }

  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.9rem; margin-bottom: 1.75rem; }
  @media (max-width: 800px) { .stats { grid-template-columns: repeat(2, 1fr); } }
  .stat {
    background: var(--panel); border: 1px solid var(--panel-border); border-radius: 12px;
    padding: 0.95rem 1.1rem;
  }
  .stat .value { font-size: 1.6rem; font-weight: 650; letter-spacing: -0.02em; }
  .stat .label { color: var(--text-dim); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.2rem; }
  .stat .breakdown { display: flex; gap: 0.5rem; margin-top: 0.55rem; flex-wrap: wrap; }
  .chip { font-size: 0.68rem; padding: 0.12rem 0.5rem; border-radius: 999px; }

  .grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 1.25rem; align-items: start; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  section.card {
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 12px;
    padding: 1.3rem 1.4rem;
  }
  section.card + section.card { margin-top: 1.25rem; }
  .card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.9rem; }
  h2 {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-dim);
    font-weight: 650;
    margin: 0;
  }
  .count-pill { font-size: 0.72rem; color: var(--text-faint); background: rgba(255,255,255,0.04); padding: 0.1rem 0.5rem; border-radius: 999px; }

  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.55rem 0.5rem; border-bottom: 1px solid var(--row-border); font-size: 0.86rem; vertical-align: middle; }
  th { color: var(--text-faint); font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; }
  tr:last-child td { border-bottom: none; }
  tbody tr { transition: background 0.12s; }
  tbody tr:hover { background: rgba(255,255,255,0.02); }

  .name-cell { display: flex; align-items: center; gap: 0.55rem; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .status-dot.idle, .status-dot.pending { background: var(--blue); }
  .status-dot.busy, .status-dot.in_progress { background: var(--amber); box-shadow: 0 0 0 0 rgba(227,179,65,0.5); animation: pulse-amber 1.6s infinite; }
  .status-dot.offline, .status-dot.failed { background: var(--text-faint); }
  .status-dot.done { background: var(--green); }
  @keyframes pulse-amber {
    0% { box-shadow: 0 0 0 0 rgba(227, 179, 65, 0.55); }
    70% { box-shadow: 0 0 0 5px rgba(227, 179, 65, 0); }
    100% { box-shadow: 0 0 0 0 rgba(227, 179, 65, 0); }
  }

  .badge { padding: 0.16rem 0.6rem; border-radius: 999px; font-size: 0.72rem; white-space: nowrap; font-weight: 550; }
  .idle, .pending { background: var(--blue-bg); color: var(--blue); }
  .busy, .in_progress { background: var(--amber-bg); color: var(--amber); }
  .offline, .failed { background: var(--red-bg); color: var(--red); }
  .done { background: var(--green-bg); color: var(--green); }

  .host-chip { display: inline-flex; align-items: center; gap: 0.4rem; color: var(--text-dim); font-size: 0.82rem; }
  .host-avatar {
    width: 18px; height: 18px; border-radius: 5px; flex-shrink: 0;
    display: grid; place-items: center; font-size: 0.62rem; font-weight: 700; color: #05070a;
    text-transform: uppercase;
  }

  .desc-cell { color: var(--text); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dim { color: var(--text-faint); font-size: 0.8rem; }

  .empty { color: var(--text-faint); font-size: 0.85rem; padding: 0.75rem 0.25rem; text-align: center; }

  .feed-item { display: flex; gap: 0.65rem; padding: 0.7rem 0; border-bottom: 1px solid var(--row-border); }
  .feed-item:last-child { border-bottom: none; }
  .feed-avatar {
    width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0; margin-top: 0.1rem;
    display: grid; place-items: center; font-size: 0.68rem; font-weight: 700; color: #05070a;
    text-transform: uppercase;
  }
  .feed-body-wrap { flex: 1; min-width: 0; }
  .feed-meta { display: flex; align-items: baseline; gap: 0.35rem; font-size: 0.78rem; color: var(--text-dim); flex-wrap: wrap; }
  .feed-meta .arrow { color: var(--text-faint); }
  .feed-meta .time { margin-left: auto; color: var(--text-faint); font-size: 0.72rem; white-space: nowrap; }
  .feed-text {
    margin-top: 0.3rem; font-size: 0.85rem; color: var(--text);
    background: rgba(255,255,255,0.03); border: 1px solid var(--row-border);
    border-radius: 8px; padding: 0.5rem 0.65rem; word-break: break-word;
  }

  footer { margin-top: 2.5rem; text-align: center; color: var(--text-faint); font-size: 0.75rem; }
  footer code { color: var(--text-dim); }
</style>
</head>
<body>
<header>
  <div class="brand">
    <div class="brand-mark">&gt;_</div>
    <div>
      <h1>agent-deck</h1>
      <p class="sub">Read-only fleet view</p>
    </div>
  </div>
  <span class="live"><span class="live-dot"></span>Live &middot; refreshes every 2s</span>
</header>

<div class="stats" id="stats"></div>

<div class="grid">
  <div>
    <section class="card">
      <div class="card-head"><h2>Sessions</h2><span class="count-pill" id="sessions-count">0</span></div>
      <table id="sessions">
        <thead><tr><th>Name</th><th>Status</th><th>Host</th><th>Last seen</th></tr></thead>
        <tbody></tbody>
      </table>
      <p class="empty" id="sessions-empty" hidden>No sessions registered yet. Run <code class="mono">agent-deck register</code> or <code class="mono">agent-deck watch</code>.</p>
    </section>
    <section class="card">
      <div class="card-head"><h2>Tasks</h2><span class="count-pill" id="tasks-count">0</span></div>
      <table id="tasks">
        <thead><tr><th>Assigned to</th><th>Status</th><th>Description</th><th>Updated</th></tr></thead>
        <tbody></tbody>
      </table>
      <p class="empty" id="tasks-empty" hidden>No tasks tracked yet. Run <code class="mono">agent-deck assign</code>.</p>
    </section>
  </div>
  <section class="card">
    <div class="card-head"><h2>Activity</h2><span class="count-pill" id="activity-count">0</span></div>
    <div id="activity"></div>
    <p class="empty" id="activity-empty" hidden>No messages sent yet. Run <code class="mono">agent-deck send</code>.</p>
  </section>
</div>

<footer>agent-deck &middot; reflects <code>~/.agent-deck/*.json</code> &middot; no send/assign/control endpoint exists here</footer>

<script>
const PALETTE = ["#58a6ff", "#a371f7", "#3fb950", "#e3b341", "#f85149", "#39c5cf"];

function colorFor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initials(name) {
  return name.replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\\s+/).slice(0, 2).map((p) => p[0]).join("") || "?";
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return sec + "s ago";
  const min = Math.round(sec / 60);
  if (min < 60) return min + "m ago";
  const hr = Math.round(min / 60);
  if (hr < 24) return hr + "h ago";
  const day = Math.round(hr / 24);
  if (day < 7) return day + "d ago";
  return new Date(iso).toLocaleDateString();
}

function badge(value) {
  const span = document.createElement("span");
  span.className = "badge " + value;
  span.textContent = value;
  return span;
}

function statusDot(value) {
  const dot = document.createElement("span");
  dot.className = "status-dot " + value;
  return dot;
}

function avatar(seed, size) {
  const el = document.createElement("div");
  el.className = size === "small" ? "host-avatar" : "feed-avatar";
  el.style.background = colorFor(seed);
  el.textContent = initials(seed);
  return el;
}

function renderStats(sessions, tasks, messages) {
  const byStatus = (list, key) => list.reduce((acc, item) => { acc[item[key]] = (acc[item[key]] || 0) + 1; return acc; }, {});
  const sessionCounts = byStatus(sessions, "status");
  const taskCounts = byStatus(tasks, "status");
  const activeTasks = (taskCounts.pending || 0) + (taskCounts.in_progress || 0);

  const cards = [
    {
      label: "Sessions",
      value: sessions.length,
      breakdown: ["idle", "busy", "offline"].filter((s) => sessionCounts[s]).map((s) => \`<span class="chip \${s}">\${sessionCounts[s]} \${s}</span>\`).join(""),
    },
    { label: "Active tasks", value: activeTasks, breakdown: "" },
    { label: "Tasks total", value: tasks.length, breakdown: "" },
    { label: "Messages logged", value: messages.length, breakdown: "" },
  ];

  document.getElementById("stats").innerHTML = cards
    .map((c) => \`<div class="stat"><div class="value">\${c.value}</div><div class="label">\${c.label}</div>\${c.breakdown ? '<div class="breakdown">' + c.breakdown + "</div>" : ""}</div>\`)
    .join("");
}

let latestSessions = [];
let latestTasks = [];
let latestMessages = [];

async function refreshSessions() {
  latestSessions = await (await fetch("/api/sessions")).json();
  const body = document.querySelector("#sessions tbody");
  body.innerHTML = "";
  document.getElementById("sessions-empty").hidden = latestSessions.length > 0;
  document.getElementById("sessions-count").textContent = latestSessions.length;
  for (const s of latestSessions) {
    const tr = document.createElement("tr");

    const name = document.createElement("td");
    const nameCell = document.createElement("div");
    nameCell.className = "name-cell";
    nameCell.appendChild(statusDot(s.status));
    const nameText = document.createElement("span");
    nameText.textContent = s.name;
    nameCell.appendChild(nameText);
    name.appendChild(nameCell);

    const status = document.createElement("td");
    status.appendChild(badge(s.status));

    const host = document.createElement("td");
    const hostChip = document.createElement("span");
    hostChip.className = "host-chip";
    hostChip.appendChild(avatar(s.host, "small"));
    const hostText = document.createElement("span");
    hostText.textContent = s.host;
    hostChip.appendChild(hostText);
    host.appendChild(hostChip);

    const lastSeen = document.createElement("td");
    lastSeen.className = "dim";
    lastSeen.textContent = relativeTime(s.lastSeen);
    lastSeen.title = new Date(s.lastSeen).toLocaleString();

    tr.append(name, status, host, lastSeen);
    body.appendChild(tr);
  }
}

async function refreshTasks() {
  latestTasks = await (await fetch("/api/tasks")).json();
  const body = document.querySelector("#tasks tbody");
  body.innerHTML = "";
  document.getElementById("tasks-empty").hidden = latestTasks.length > 0;
  document.getElementById("tasks-count").textContent = latestTasks.length;
  for (const t of latestTasks) {
    const tr = document.createElement("tr");
    const assignedTo = document.createElement("td");
    assignedTo.textContent = t.assignedTo;
    const status = document.createElement("td");
    status.appendChild(badge(t.status));
    const description = document.createElement("td");
    description.className = "desc-cell";
    description.textContent = t.description;
    description.title = t.description;
    const updated = document.createElement("td");
    updated.className = "dim";
    updated.textContent = relativeTime(t.updatedAt);
    updated.title = new Date(t.updatedAt).toLocaleString();
    tr.append(assignedTo, status, description, updated);
    body.appendChild(tr);
  }
}

async function refreshActivity() {
  latestMessages = await (await fetch("/api/messages")).json();
  const feed = document.getElementById("activity");
  feed.innerHTML = "";
  document.getElementById("activity-empty").hidden = latestMessages.length > 0;
  document.getElementById("activity-count").textContent = latestMessages.length;
  for (const m of latestMessages.slice(0, 20)) {
    const item = document.createElement("div");
    item.className = "feed-item";
    item.appendChild(avatar(m.from, "large"));

    const wrap = document.createElement("div");
    wrap.className = "feed-body-wrap";

    const meta = document.createElement("div");
    meta.className = "feed-meta";
    const from = document.createElement("strong");
    from.textContent = m.from;
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = "\\u2192";
    const to = document.createElement("span");
    to.textContent = m.to;
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = relativeTime(m.sentAt);
    time.title = new Date(m.sentAt).toLocaleString();
    meta.append(from, arrow, to, time);

    const text = document.createElement("div");
    text.className = "feed-text mono";
    text.textContent = m.body;

    wrap.append(meta, text);
    item.appendChild(wrap);
    feed.appendChild(item);
  }
}

async function refreshAll() {
  await Promise.all([refreshSessions(), refreshTasks(), refreshActivity()]);
  renderStats(latestSessions, latestTasks, latestMessages);
}

refreshAll();
setInterval(refreshAll, 2000);
</script>
</body>
</html>
`;

export interface DashboardPaths {
  sessionsPath: string;
  tasksPath: string;
  messagesPath: string;
}

export interface DashboardServer {
  url: string;
  close(): Promise<void>;
}

/** port 0 lets the OS assign a free port — handy for tests. */
export function startDashboardServer(paths: DashboardPaths, port = 0): Promise<DashboardServer> {
  const registry = new SessionRegistry(paths.sessionsPath);
  const tasks = new TaskStore(paths.tasksPath);
  const messages = new MessageLog(paths.messagesPath);

  const server: Server = createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;

    if (pathname === "/api/sessions") {
      registry
        .load()
        .then(() => respondJson(res, registry.list()))
        .catch((err: unknown) => respondError(res, err));
      return;
    }

    if (pathname === "/api/tasks") {
      tasks
        .load()
        .then(() => respondJson(res, tasks.list()))
        .catch((err: unknown) => respondError(res, err));
      return;
    }

    if (pathname === "/api/messages") {
      messages
        .load()
        .then(() => respondJson(res, messages.list()))
        .catch((err: unknown) => respondError(res, err));
      return;
    }

    if (pathname === "/" || pathname === "/index.html") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(PAGE);
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        url: `http://127.0.0.1:${actualPort}`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

function respondJson(res: import("node:http").ServerResponse, data: unknown): void {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function respondError(res: import("node:http").ServerResponse, err: unknown): void {
  res.writeHead(500, { "content-type": "text/plain" });
  res.end(`Failed to read store: ${(err as Error).message}`);
}
