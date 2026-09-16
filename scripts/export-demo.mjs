#!/usr/bin/env node
// Exports a static, frozen copy of the real dashboard (same HTML/CSS/JS,
// fetched from a real running server so there's no risk of drifting from
// what `macd dashboard` actually renders) into docs/demo/, fed by static
// JSON instead of live API routes. No server, no hosting account, no
// ongoing cost -- but the data is frozen at whenever this last ran, not
// actually live. Re-run this and commit the result to refresh it.
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { seedDemoData } from "../dist/seed.js";
import { startDashboardServer } from "../dist/dashboard.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs", "demo");
const tmpDir = join(root, ".demo-export-tmp");

async function main() {
  const paths = {
    sessionsPath: join(tmpDir, "sessions.json"),
    tasksPath: join(tmpDir, "tasks.json"),
    messagesPath: join(tmpDir, "messages.json"),
  };
  await seedDemoData(paths);

  const server = await startDashboardServer(paths, 0);
  try {
    const [html, sessions, tasks, messages] = await Promise.all([
      fetch(server.url).then((r) => r.text()),
      fetch(`${server.url}/api/sessions`).then((r) => r.text()),
      fetch(`${server.url}/api/tasks`).then((r) => r.text()),
      fetch(`${server.url}/api/messages`).then((r) => r.text()),
    ]);

    const staticHtml = html
      .replace('<title>MACD — Multi-Agent Command Deck</title>', '<title>MACD — Live Demo (static snapshot)</title>')
      .replace('fetch("/api/sessions")', 'fetch("sessions.json")')
      .replace('fetch("/api/tasks")', 'fetch("tasks.json")')
      .replace('fetch("/api/messages")', 'fetch("messages.json")')
      .replace(
        '<span class="live"><span class="live-dot"></span>Live &middot; refreshes every 2s</span>',
        '<span class="live" style="border-color: var(--amber); color: var(--amber);">Static demo &middot; seeded snapshot, not live</span>',
      )
      .replace(
        "refreshAll();\nsetInterval(refreshAll, 2000);",
        "refreshAll();",
      )
      .replace(
        "<body>",
        '<body>\n<a href="../" style="position: fixed; top: 1rem; left: 1rem; z-index: 10; display: inline-flex; ' +
          "align-items: center; gap: 0.4rem; font-size: 0.82rem; font-weight: 600; color: var(--text-dim); " +
          "text-decoration: none; background: rgba(255,255,255,0.04); border: 1px solid var(--panel-border); " +
          'border-radius: 999px; padding: 0.45rem 0.9rem;">&larr; Back to MACD</a>',
      )
      .replace(
        '<footer>MACD &middot; reflects <code>~/.macd/*.json</code> &middot; no send/assign/control endpoint exists here</footer>',
        '<footer>MACD &middot; this is a frozen, static export of the real dashboard\'s HTML/CSS/JS &mdash; ' +
          '<a href="https://github.com/YashRao10/macd#usage" style="color: var(--text-dim);">run `macd dashboard` yourself</a> ' +
          "for the real, live version reflecting your own fleet.</footer>",
      );

    await mkdir(outDir, { recursive: true });
    await Promise.all([
      writeFile(join(outDir, "index.html"), staticHtml),
      writeFile(join(outDir, "sessions.json"), sessions),
      writeFile(join(outDir, "tasks.json"), tasks),
      writeFile(join(outDir, "messages.json"), messages),
    ]);
    console.log(`Exported static demo to ${outDir}`);
  } finally {
    await server.close();
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
