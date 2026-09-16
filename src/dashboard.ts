import { createServer } from "node:http";
import type { Server } from "node:http";
import { SessionRegistry } from "./registry.js";

/**
 * A thin, read-only web view of the SessionRegistry — for showing agent-deck
 * in a browser without cloning the repo and running the CLI. It only reads
 * ~/.agent-deck/sessions.json (reloading it on every request, so it always
 * reflects whatever `watch`/`register`/`send` last wrote); it has no way to
 * send input into a pane. That's deliberate: the terminal UI (`ink`,
 * ClaudePtyTransport) is the one real control surface, and this dashboard
 * stays a secondary visualization, not a second implementation of it.
 */

const PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>agent-deck</title>
<style>
  body { font-family: ui-monospace, "SF Mono", Consolas, monospace; background: #0d1117; color: #c9d1d9; margin: 2rem; }
  h1 { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem; }
  p.subtitle { color: #8b949e; font-size: 0.85rem; margin-top: 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { text-align: left; padding: 0.4rem 0.75rem; border-bottom: 1px solid #30363d; font-size: 0.9rem; }
  th { color: #8b949e; font-weight: 500; }
  .badge { padding: 0.1rem 0.6rem; border-radius: 999px; font-size: 0.75rem; }
  .idle { background: rgba(31, 111, 235, 0.2); color: #58a6ff; }
  .busy { background: rgba(210, 153, 34, 0.2); color: #e3b341; }
  .offline { background: rgba(110, 118, 129, 0.2); color: #8b949e; }
  .empty { color: #8b949e; margin-top: 1rem; }
</style>
</head>
<body>
<h1>agent-deck sessions</h1>
<p class="subtitle">read-only — reflects ~/.agent-deck/sessions.json, refreshes every 2s</p>
<table id="sessions">
  <thead><tr><th>Name</th><th>Status</th><th>Host</th><th>Last seen</th></tr></thead>
  <tbody></tbody>
</table>
<p class="empty" id="empty" hidden>No sessions registered yet. Use \`agent-deck register\` or \`agent-deck watch\`.</p>
<script>
async function refresh() {
  const res = await fetch("/api/sessions");
  const sessions = await res.json();
  const body = document.querySelector("#sessions tbody");
  const empty = document.getElementById("empty");
  body.innerHTML = "";
  empty.hidden = sessions.length > 0;
  for (const s of sessions) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = s.name;
    const status = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "badge " + s.status;
    badge.textContent = s.status;
    status.appendChild(badge);
    const host = document.createElement("td");
    host.textContent = s.host;
    const lastSeen = document.createElement("td");
    lastSeen.textContent = new Date(s.lastSeen).toLocaleString();
    tr.append(name, status, host, lastSeen);
    body.appendChild(tr);
  }
}
refresh();
setInterval(refresh, 2000);
</script>
</body>
</html>
`;

export interface DashboardServer {
  url: string;
  close(): Promise<void>;
}

/** port 0 lets the OS assign a free port — handy for tests. */
export function startDashboardServer(storePath: string, port = 0): Promise<DashboardServer> {
  const registry = new SessionRegistry(storePath);

  const server: Server = createServer((req, res) => {
    if (req.url === "/api/sessions") {
      registry
        .load()
        .then(() => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(registry.list()));
        })
        .catch((err: unknown) => {
          res.writeHead(500, { "content-type": "text/plain" });
          res.end(`Failed to read session store: ${(err as Error).message}`);
        });
      return;
    }
    if (req.url === "/" || req.url === "/index.html") {
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
