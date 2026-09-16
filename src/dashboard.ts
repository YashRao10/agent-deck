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

const PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>agent-deck</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    font-family: ui-monospace, "SF Mono", Consolas, monospace;
    background: #0d1117;
    color: #c9d1d9;
    margin: 0;
    padding: 2rem clamp(1rem, 4vw, 3rem);
  }
  header { margin-bottom: 2rem; }
  h1 { font-size: 1.3rem; font-weight: 600; margin: 0 0 0.25rem; letter-spacing: -0.01em; }
  header p { color: #8b949e; font-size: 0.85rem; margin: 0; }
  .grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 1.5rem; align-items: start; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  section.card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 10px;
    padding: 1.25rem 1.4rem;
  }
  section.card + section.card { margin-top: 1.5rem; }
  h2 {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #8b949e;
    font-weight: 600;
    margin: 0 0 1rem;
  }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.45rem 0.6rem; border-bottom: 1px solid #21262d; font-size: 0.88rem; }
  th { color: #8b949e; font-weight: 500; font-size: 0.78rem; }
  tr:last-child td { border-bottom: none; }
  .badge { padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.72rem; white-space: nowrap; }
  .idle, .pending { background: rgba(31, 111, 235, 0.18); color: #58a6ff; }
  .busy, .in_progress { background: rgba(210, 153, 34, 0.18); color: #e3b341; }
  .offline, .failed { background: rgba(248, 81, 73, 0.15); color: #f85149; }
  .done { background: rgba(63, 185, 80, 0.18); color: #3fb950; }
  .empty { color: #6e7681; font-size: 0.85rem; padding: 0.5rem 0; }
  .feed-item { padding: 0.55rem 0; border-bottom: 1px solid #21262d; font-size: 0.85rem; }
  .feed-item:last-child { border-bottom: none; }
  .feed-item .meta { color: #8b949e; font-size: 0.75rem; margin-bottom: 0.15rem; }
  .feed-item .body { color: #c9d1d9; }
</style>
</head>
<body>
<header>
  <h1>agent-deck</h1>
  <p>read-only fleet view &mdash; reflects ~/.agent-deck/*.json, refreshes every 2s</p>
</header>
<div class="grid">
  <div>
    <section class="card">
      <h2>Sessions</h2>
      <table id="sessions">
        <thead><tr><th>Name</th><th>Status</th><th>Host</th><th>Last seen</th></tr></thead>
        <tbody></tbody>
      </table>
      <p class="empty" id="sessions-empty" hidden>No sessions registered yet.</p>
    </section>
    <section class="card">
      <h2>Tasks</h2>
      <table id="tasks">
        <thead><tr><th>Assigned to</th><th>Status</th><th>Description</th><th>Updated</th></tr></thead>
        <tbody></tbody>
      </table>
      <p class="empty" id="tasks-empty" hidden>No tasks tracked yet.</p>
    </section>
  </div>
  <section class="card">
    <h2>Activity</h2>
    <div id="activity"></div>
    <p class="empty" id="activity-empty" hidden>No messages sent yet.</p>
  </section>
</div>
<script>
function badge(value) {
  const span = document.createElement("span");
  span.className = "badge " + value;
  span.textContent = value;
  return span;
}

async function refreshSessions() {
  const sessions = await (await fetch("/api/sessions")).json();
  const body = document.querySelector("#sessions tbody");
  body.innerHTML = "";
  document.getElementById("sessions-empty").hidden = sessions.length > 0;
  for (const s of sessions) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = s.name;
    const status = document.createElement("td");
    status.appendChild(badge(s.status));
    const host = document.createElement("td");
    host.textContent = s.host;
    const lastSeen = document.createElement("td");
    lastSeen.textContent = new Date(s.lastSeen).toLocaleString();
    tr.append(name, status, host, lastSeen);
    body.appendChild(tr);
  }
}

async function refreshTasks() {
  const tasks = await (await fetch("/api/tasks")).json();
  const body = document.querySelector("#tasks tbody");
  body.innerHTML = "";
  document.getElementById("tasks-empty").hidden = tasks.length > 0;
  for (const t of tasks) {
    const tr = document.createElement("tr");
    const assignedTo = document.createElement("td");
    assignedTo.textContent = t.assignedTo;
    const status = document.createElement("td");
    status.appendChild(badge(t.status));
    const description = document.createElement("td");
    description.textContent = t.description;
    const updated = document.createElement("td");
    updated.textContent = new Date(t.updatedAt).toLocaleString();
    tr.append(assignedTo, status, description, updated);
    body.appendChild(tr);
  }
}

async function refreshActivity() {
  const messages = await (await fetch("/api/messages")).json();
  const feed = document.getElementById("activity");
  feed.innerHTML = "";
  document.getElementById("activity-empty").hidden = messages.length > 0;
  for (const m of messages.slice(0, 20)) {
    const item = document.createElement("div");
    item.className = "feed-item";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = m.from + " -> " + m.to + " - " + new Date(m.sentAt).toLocaleTimeString();
    const body = document.createElement("div");
    body.className = "body";
    body.textContent = m.body;
    item.append(meta, body);
    feed.appendChild(item);
  }
}

function refreshAll() {
  refreshSessions();
  refreshTasks();
  refreshActivity();
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
