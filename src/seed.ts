import { SessionRegistry } from "./registry.js";
import { TaskStore } from "./task-store.js";
import { MessageLog } from "./message-log.js";
import type { AgentSession, Task } from "./types.js";

/**
 * Writes realistic-looking fleet data (sessions, tasks, a message history)
 * to the same JSON stores the CLI and dashboard read. Exists so the
 * dashboard has something to show on a fresh clone or right before a
 * screenshot, instead of the genuinely-empty state `register`/`assign`/`send`
 * would otherwise require you to build up by hand. Timestamps are relative
 * to `now`, so re-running it always produces a fresh-looking sparkline.
 */
export interface SeedPaths {
  sessionsPath: string;
  tasksPath: string;
  messagesPath: string;
}

const SEED_SESSIONS: Array<Omit<AgentSession, "id" | "lastSeen"> & { minutesAgo: number }> = [
  { name: "orchestrator", host: "windows", status: "busy", minutesAgo: 0 },
  { name: "docs-worker", host: "macbook", status: "idle", minutesAgo: 4 },
  { name: "test-runner", host: "macbook", status: "busy", minutesAgo: 1 },
  { name: "release-worker", host: "windows", status: "offline", minutesAgo: 42 },
  { name: "flaky-worker", host: "macbook", status: "crashed", minutesAgo: 8 },
];

const SEED_TASKS: Array<{ assignedTo: string; description: string; status: Task["status"]; hoursAgo: number }> = [
  { assignedTo: "docs-worker", description: "Sync README screenshot with the new dashboard layout", status: "done", hoursAgo: 5 },
  { assignedTo: "test-runner", description: "Run full suite on Windows before merge", status: "done", hoursAgo: 3 },
  { assignedTo: "release-worker", description: "Cut changelog for the dashboard redesign", status: "in_progress", hoursAgo: 2 },
  { assignedTo: "docs-worker", description: "Add sparkline explanation to README", status: "in_progress", hoursAgo: 1.5 },
  { assignedTo: "test-runner", description: "Add regression test for entrance-animation replay bug", status: "done", hoursAgo: 1 },
  { assignedTo: "release-worker", description: "Verify node-pty postinstall on a clean CI image", status: "failed", hoursAgo: 0.75 },
  { assignedTo: "orchestrator", description: "Review dashboard-polish-and-screenshot PR", status: "pending", hoursAgo: 0.3 },
  { assignedTo: "docs-worker", description: "Draft LinkedIn project blurb", status: "pending", hoursAgo: 0.1 },
];

const SEED_MESSAGES: Array<{ from: string; to: string; body: string; minutesAgo: number }> = [
  { from: "orchestrator", to: "test-runner", body: "kick off the full suite on Windows", minutesAgo: 18 },
  { from: "test-runner", to: "orchestrator", body: "running now, ~2 min", minutesAgo: 17 },
  { from: "test-runner", to: "orchestrator", body: "36/36 passing, clean build", minutesAgo: 15 },
  { from: "orchestrator", to: "docs-worker", body: "grab a fresh screenshot once the redesign lands", minutesAgo: 14 },
  { from: "orchestrator", to: "release-worker", body: "status on the changelog?", minutesAgo: 12 },
  { from: "release-worker", to: "orchestrator", body: "half done, node-pty postinstall failing on the clean image", minutesAgo: 11 },
  { from: "docs-worker", to: "orchestrator", body: "screenshot captured, dropping it in docs/", minutesAgo: 9 },
  { from: "test-runner", to: "orchestrator", body: "added a regression test for the entrance-animation replay bug", minutesAgo: 8 },
  { from: "orchestrator", to: "release-worker", body: "chmod +x the prebuilt spawn-helper as a workaround for now", minutesAgo: 7 },
  { from: "release-worker", to: "orchestrator", body: "that fixed it, retrying the cut", minutesAgo: 6 },
  { from: "docs-worker", to: "orchestrator", body: "README updated with the sparkline explanation", minutesAgo: 5 },
  { from: "orchestrator", to: "docs-worker", body: "nice, one more pass on the LinkedIn blurb when you get a chance", minutesAgo: 3 },
  { from: "test-runner", to: "orchestrator", body: "idle, ready for the next assignment", minutesAgo: 2 },
  { from: "orchestrator", to: "test-runner", body: "hold for now, waiting on the changelog", minutesAgo: 1 },
];

/**
 * Overwrites the three stores with exactly this seed set (it does not merge
 * with whatever was there before) so the command is idempotent — re-running
 * it always yields the same demo fleet with fresh, "just happened"
 * timestamps, never a growing pile of duplicate demo sessions.
 */
export async function seedDemoData(paths: SeedPaths): Promise<{ sessions: number; tasks: number; messages: number }> {
  const now = Date.now();

  const registry = new SessionRegistry(paths.sessionsPath);
  const idByName = new Map<string, string>();
  for (const s of SEED_SESSIONS) {
    const id = `demo-${s.name}`;
    idByName.set(s.name, id);
    registry.register({
      id,
      name: s.name,
      host: s.host,
      status: s.status,
      lastSeen: new Date(now - s.minutesAgo * 60_000).toISOString(),
    });
  }
  await registry.save();

  const taskStore = new TaskStore(paths.tasksPath);
  for (const t of SEED_TASKS) {
    const task = taskStore.assign(idByName.get(t.assignedTo) ?? t.assignedTo, t.description);
    task.status = t.status;
    task.createdAt = new Date(now - t.hoursAgo * 3_600_000).toISOString();
    task.updatedAt = task.createdAt;
  }
  await taskStore.save();

  const log = new MessageLog(paths.messagesPath);
  for (const m of SEED_MESSAGES) {
    const message = log.record(idByName.get(m.from) ?? m.from, idByName.get(m.to) ?? m.to, m.body);
    message.sentAt = new Date(now - m.minutesAgo * 60_000).toISOString();
  }
  await log.save();

  return { sessions: SEED_SESSIONS.length, tasks: SEED_TASKS.length, messages: SEED_MESSAGES.length };
}
