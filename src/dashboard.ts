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

  .hero {
    position: relative;
    border-radius: 18px;
    padding: 2.2rem 2.2rem 1.9rem;
    margin-bottom: 1.75rem;
    background:
      radial-gradient(600px 240px at 0% 0%, rgba(88, 166, 255, 0.16), transparent),
      radial-gradient(500px 220px at 100% 0%, rgba(163, 113, 247, 0.14), transparent),
      linear-gradient(180deg, #12161d, #0e1218);
    border: 1px solid var(--panel-border);
    overflow: hidden;
  }
  .hero::before {
    content: "";
    position: absolute; inset: 0;
    background-image: linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: radial-gradient(ellipse 80% 80% at 30% 0%, black 10%, transparent 70%);
    pointer-events: none;
  }
  header { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .brand { display: flex; align-items: center; gap: 0.85rem; }
  .brand-mark {
    width: 46px; height: 46px; border-radius: 12px;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    display: grid; place-items: center; font-size: 1.3rem; font-weight: 700; color: #05070a;
    box-shadow: 0 8px 24px rgba(88, 166, 255, 0.3);
    flex-shrink: 0;
  }
  h1 {
    font-size: 1.85rem; font-weight: 750; margin: 0; letter-spacing: -0.03em;
    background: linear-gradient(90deg, #f0f6fc, #9fb3c8);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  header .sub { color: var(--text-dim); font-size: 0.92rem; margin: 0.3rem 0 0; }
  header .sub strong { color: var(--text); font-weight: 600; }
  .live {
    display: inline-flex; align-items: center; gap: 0.45rem;
    background: rgba(255,255,255,0.04); border: 1px solid var(--panel-border);
    border-radius: 999px; padding: 0.45rem 0.9rem 0.45rem 0.7rem;
    font-size: 0.78rem; color: var(--text-dim); white-space: nowrap;
  }
  .live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 0 rgba(63,185,80,0.6); animation: pulse 2s infinite; }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(63, 185, 80, 0.55); }
    70% { box-shadow: 0 0 0 6px rgba(63, 185, 80, 0); }
    100% { box-shadow: 0 0 0 0 rgba(63, 185, 80, 0); }
  }

  .stats { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.9rem; margin-top: 1.75rem; }
  @media (max-width: 800px) { .stats { grid-template-columns: repeat(2, 1fr); } }
  .stat {
    background: rgba(255,255,255,0.03); border: 1px solid var(--panel-border); border-radius: 12px;
    padding: 0.95rem 1.1rem; transition: border-color 0.15s, transform 0.15s;
  }
  .stat:hover { border-color: #3a4048; transform: translateY(-1px); }
  .stat .value { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; }
  .stat .label { color: var(--text-dim); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.25rem; }
  .stat .breakdown { display: flex; gap: 0.5rem; margin-top: 0.6rem; flex-wrap: wrap; }
  .chip { font-size: 0.68rem; padding: 0.12rem 0.5rem; border-radius: 999px; }

  .grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1.25rem; align-items: start; }
  @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }
  section.card {
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 14px;
    padding: 1.4rem 1.5rem;
  }
  section.card + section.card { margin-top: 1.25rem; }
  .card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.1rem; }
  .card-head .title { display: flex; align-items: center; gap: 0.55rem; }
  .card-head .dot-icon { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
  h2 {
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    font-weight: 700;
    margin: 0;
  }
  .count-pill { font-size: 0.72rem; color: var(--text-faint); background: rgba(255,255,255,0.05); padding: 0.15rem 0.55rem; border-radius: 999px; }

  .session-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
  .session-card {
    position: relative;
    background: rgba(255,255,255,0.025);
    border: 1px solid var(--row-border);
    border-left: 3px solid var(--text-faint);
    border-radius: 10px;
    padding: 0.85rem 0.95rem;
    transition: border-color 0.15s, background 0.15s;
  }
  .session-card:hover { background: rgba(255,255,255,0.045); }
  .session-card.idle { border-left-color: var(--blue); }
  .session-card.busy { border-left-color: var(--amber); }
  .session-card.offline { border-left-color: var(--text-faint); opacity: 0.7; }
  .session-card .row1 { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .session-card .name { font-weight: 600; font-size: 0.92rem; display: flex; align-items: center; gap: 0.45rem; min-width: 0; }
  .session-card .name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-card .row2 { display: flex; align-items: center; justify-content: space-between; margin-top: 0.65rem; }

  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.55rem 0.5rem; border-bottom: 1px solid var(--row-border); font-size: 0.86rem; vertical-align: middle; }
  th { color: var(--text-faint); font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; }
  tr:last-child td { border-bottom: none; }
  tbody tr { transition: background 0.12s; }
  tbody tr:hover { background: rgba(255,255,255,0.02); }

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

  .badge { padding: 0.16rem 0.6rem; border-radius: 999px; font-size: 0.72rem; white-space: nowrap; font-weight: 600; }
  .idle, .pending { background: var(--blue-bg); color: var(--blue); }
  .busy, .in_progress { background: var(--amber-bg); color: var(--amber); }
  .offline, .failed { background: var(--red-bg); color: var(--red); }
  .done { background: var(--green-bg); color: var(--green); }

  .host-chip { display: inline-flex; align-items: center; gap: 0.4rem; color: var(--text-dim); font-size: 0.8rem; }
  .host-avatar {
    width: 18px; height: 18px; border-radius: 5px; flex-shrink: 0;
    display: grid; place-items: center; font-size: 0.6rem; font-weight: 700; color: #05070a;
    text-transform: uppercase;
  }

  .board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; }
  @media (max-width: 700px) { .board { grid-template-columns: 1fr 1fr; } }
  .lane { min-width: 0; }
  .lane-head { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.6rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); font-weight: 650; }
  .lane-count { color: var(--text-faint); font-weight: 600; }
  .task-card {
    background: rgba(255,255,255,0.025); border: 1px solid var(--row-border); border-radius: 10px;
    padding: 0.65rem 0.75rem; margin-bottom: 0.6rem; font-size: 0.82rem;
  }
  .task-card .desc { color: var(--text); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .task-card .foot { display: flex; align-items: center; justify-content: space-between; margin-top: 0.5rem; gap: 0.4rem; }
  .task-card .assignee { display: flex; align-items: center; gap: 0.35rem; color: var(--text-dim); font-size: 0.74rem; min-width: 0; }
  .task-card .assignee span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .task-card .time { color: var(--text-faint); font-size: 0.7rem; white-space: nowrap; }
  .lane-empty { color: var(--text-faint); font-size: 0.75rem; padding: 0.4rem 0.1rem; }

  .dim { color: var(--text-faint); font-size: 0.8rem; }
  .empty { color: var(--text-faint); font-size: 0.85rem; padding: 0.75rem 0.25rem; text-align: center; }

  .timeline { position: relative; }
  .feed-item { position: relative; display: flex; gap: 0.7rem; padding: 0 0 1.1rem; }
  .feed-item:last-child { padding-bottom: 0; }
  .feed-item::before {
    content: ""; position: absolute; left: 13px; top: 30px; bottom: -2px; width: 1px;
    background: var(--row-border);
  }
  .feed-item:last-child::before { display: none; }
  .feed-avatar {
    width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0; margin-top: 0.05rem; z-index: 1;
    display: grid; place-items: center; font-size: 0.68rem; font-weight: 700; color: #05070a;
    text-transform: uppercase;
  }
  .feed-body-wrap { flex: 1; min-width: 0; }
  .feed-meta { display: flex; align-items: baseline; gap: 0.35rem; font-size: 0.78rem; color: var(--text-dim); flex-wrap: wrap; }
  .feed-meta .arrow { color: var(--text-faint); }
  .feed-meta .time { margin-left: auto; color: var(--text-faint); font-size: 0.72rem; white-space: nowrap; }
  .feed-text {
    margin-top: 0.35rem; font-size: 0.85rem; color: var(--text);
    background: rgba(255,255,255,0.03); border: 1px solid var(--row-border);
    border-radius: 9px; padding: 0.55rem 0.7rem; word-break: break-word;
  }

  footer { margin-top: 2.5rem; text-align: center; color: var(--text-faint); font-size: 0.75rem; }
  footer code { color: var(--text-dim); }

  @keyframes rise-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .session-card.enter, .task-card.enter, .feed-item.enter { animation: rise-in 0.35s ease-out both; }

  .sparkline { display: flex; align-items: flex-end; gap: 3px; height: 28px; }
  .sparkline .bar { width: 5px; border-radius: 2px 2px 0 0; background: var(--accent); opacity: 0.35; min-height: 2px; transition: opacity 0.15s; }
  .sparkline .bar.hot { opacity: 0.9; }
</style>
</head>
<body>
<div class="hero">
  <header>
    <div class="brand">
      <div class="brand-mark">&gt;_</div>
      <div>
        <h1>agent-deck</h1>
        <p class="sub" id="tagline">Read-only fleet view</p>
      </div>
    </div>
    <span class="live"><span class="live-dot"></span>Live &middot; refreshes every 2s</span>
  </header>
  <div class="stats" id="stats"></div>
</div>

<div class="grid">
  <div>
    <section class="card">
      <div class="card-head"><div class="title"><span class="dot-icon"></span><h2>Sessions</h2></div><span class="count-pill" id="sessions-count">0</span></div>
      <div class="session-grid" id="sessions"></div>
      <p class="empty" id="sessions-empty" hidden>No sessions registered yet. Run <code class="mono">agent-deck register</code> or <code class="mono">agent-deck watch</code>.</p>
    </section>
    <section class="card">
      <div class="card-head"><div class="title"><span class="dot-icon"></span><h2>Tasks</h2></div><span class="count-pill" id="tasks-count">0</span></div>
      <div class="board" id="tasks"></div>
      <p class="empty" id="tasks-empty" hidden>No tasks tracked yet. Run <code class="mono">agent-deck assign</code>.</p>
    </section>
  </div>
  <section class="card">
    <div class="card-head"><div class="title"><span class="dot-icon"></span><h2>Activity</h2></div><span class="count-pill" id="activity-count">0</span></div>
    <div class="sparkline" id="sparkline" style="margin-bottom: 1rem;"></div>
    <div class="timeline" id="activity"></div>
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

const SPARKLINE_BUCKETS = 20;
const SPARKLINE_BUCKET_MS = 60 * 1000;

// Bucketing logic mirrored in src/dashboard-logic.ts's bucketMessages, which
// has unit test coverage this inline copy can't get. Keep them in sync.
function renderSparkline(messages) {
  const now = Date.now();
  const counts = new Array(SPARKLINE_BUCKETS).fill(0);
  for (const m of messages) {
    const age = now - new Date(m.sentAt).getTime();
    const bucket = SPARKLINE_BUCKETS - 1 - Math.floor(age / SPARKLINE_BUCKET_MS);
    if (bucket >= 0 && bucket < SPARKLINE_BUCKETS) counts[bucket]++;
  }
  const max = Math.max(1, ...counts);
  const el = document.getElementById("sparkline");
  el.innerHTML = "";
  el.title = "Messages per minute, last " + SPARKLINE_BUCKETS + " minutes";
  for (const count of counts) {
    const bar = document.createElement("div");
    bar.className = "bar" + (count > 0 ? " hot" : "");
    bar.style.height = Math.max(2, Math.round((count / max) * 26)) + "px";
    el.appendChild(bar);
  }
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

  const hosts = new Set(sessions.map((s) => s.host)).size;
  const tagline = document.getElementById("tagline");
  if (sessions.length === 0) {
    tagline.innerHTML = "Read-only fleet view";
  } else {
    const busy = sessionCounts.busy || 0;
    tagline.innerHTML = \`Watching <strong>\${sessions.length}</strong> session\${sessions.length === 1 ? "" : "s"} across <strong>\${hosts}</strong> host\${hosts === 1 ? "" : "s"}\${busy ? \`, <strong>\${busy}</strong> busy right now\` : ""}\`;
  }
}

let latestSessions = [];
let latestTasks = [];
let latestMessages = [];

// Every panel does a full rebuild on each 2s poll. Animating unconditionally
// would re-trigger "rise-in" on every item every cycle, which reads as
// flicker rather than polish once real status changes start happening. Only
// animate an id the first time it's seen; silent update after that.
const seenSessionIds = new Set();
const seenTaskIds = new Set();
const seenMessageIds = new Set();
let enterDelay = 0;

// Dedup logic mirrored in src/dashboard-logic.ts's shouldEnter, which has
// unit test coverage this inline copy can't get. Keep them in sync.
function markEnter(el, id, seen) {
  if (seen.has(id)) return;
  seen.add(id);
  el.classList.add("enter");
  el.style.animationDelay = enterDelay + "ms";
  enterDelay += 40;
}

async function refreshSessions() {
  latestSessions = await (await fetch("/api/sessions")).json();
  const grid = document.getElementById("sessions");
  grid.innerHTML = "";
  document.getElementById("sessions-empty").hidden = latestSessions.length > 0;
  document.getElementById("sessions-count").textContent = latestSessions.length;
  latestSessions.forEach((s) => {
    const card = document.createElement("div");
    card.className = "session-card " + s.status;
    markEnter(card, s.id, seenSessionIds);

    const row1 = document.createElement("div");
    row1.className = "row1";
    const name = document.createElement("div");
    name.className = "name";
    name.appendChild(statusDot(s.status));
    const nameText = document.createElement("span");
    nameText.textContent = s.name;
    name.appendChild(nameText);
    row1.appendChild(name);
    row1.appendChild(badge(s.status));

    const row2 = document.createElement("div");
    row2.className = "row2";
    const hostChip = document.createElement("span");
    hostChip.className = "host-chip";
    hostChip.appendChild(avatar(s.host, "small"));
    const hostText = document.createElement("span");
    hostText.textContent = s.host;
    hostChip.appendChild(hostText);
    const lastSeen = document.createElement("span");
    lastSeen.className = "dim";
    lastSeen.textContent = relativeTime(s.lastSeen);
    lastSeen.title = new Date(s.lastSeen).toLocaleString();
    row2.append(hostChip, lastSeen);

    card.append(row1, row2);
    grid.appendChild(card);
  });
}

const TASK_LANES = [
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
  { key: "failed", label: "Failed" },
];

async function refreshTasks() {
  latestTasks = await (await fetch("/api/tasks")).json();
  const board = document.getElementById("tasks");
  board.innerHTML = "";
  document.getElementById("tasks-empty").hidden = latestTasks.length > 0;
  document.getElementById("tasks-count").textContent = latestTasks.length;

  for (const lane of TASK_LANES) {
    const laneTasks = latestTasks.filter((t) => t.status === lane.key);
    const laneEl = document.createElement("div");
    laneEl.className = "lane";

    const head = document.createElement("div");
    head.className = "lane-head";
    head.innerHTML = \`\${lane.label} <span class="lane-count">\${laneTasks.length}</span>\`;
    laneEl.appendChild(head);

    if (laneTasks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lane-empty";
      empty.textContent = "\\u2014";
      laneEl.appendChild(empty);
    }

    for (const t of laneTasks) {
      const card = document.createElement("div");
      card.className = "task-card";
      markEnter(card, t.id, seenTaskIds);

      const desc = document.createElement("div");
      desc.className = "desc";
      desc.textContent = t.description;
      desc.title = t.description;

      const foot = document.createElement("div");
      foot.className = "foot";
      const assignee = document.createElement("div");
      assignee.className = "assignee";
      assignee.appendChild(avatar(t.assignedTo, "small"));
      const assigneeText = document.createElement("span");
      assigneeText.textContent = t.assignedTo;
      assignee.appendChild(assigneeText);
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = relativeTime(t.updatedAt);
      time.title = new Date(t.updatedAt).toLocaleString();
      foot.append(assignee, time);

      card.append(desc, foot);
      laneEl.appendChild(card);
    }

    board.appendChild(laneEl);
  }
}

async function refreshActivity() {
  latestMessages = await (await fetch("/api/messages")).json();
  const feed = document.getElementById("activity");
  feed.innerHTML = "";
  document.getElementById("activity-empty").hidden = latestMessages.length > 0;
  document.getElementById("activity-count").textContent = latestMessages.length;
  latestMessages.slice(0, 20).forEach((m) => {
    const item = document.createElement("div");
    item.className = "feed-item";
    markEnter(item, m.id, seenMessageIds);
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
  });
}

async function refreshAll() {
  enterDelay = 0;
  await Promise.all([refreshSessions(), refreshTasks(), refreshActivity()]);
  renderStats(latestSessions, latestTasks, latestMessages);
  renderSparkline(latestMessages);
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
