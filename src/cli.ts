#!/usr/bin/env node
import { Command } from "commander";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SessionRegistry } from "./registry.js";
import { launchDeck } from "./tui.js";
import { sendToSessionSocket } from "./ipc.js";
import { startDashboardServer } from "./dashboard.js";
import { TaskStore } from "./task-store.js";
import { MessageLog } from "./message-log.js";
import { seedDemoData } from "./seed.js";
import type { Task } from "./types.js";

const storePath = join(homedir(), ".macd", "sessions.json");
const tasksPath = join(homedir(), ".macd", "tasks.json");
const messagesPath = join(homedir(), ".macd", "messages.json");
const TASK_STATUSES: Task["status"][] = ["pending", "in_progress", "done", "failed"];

const program = new Command();
program
  .name("macd")
  .description("Multi-Agent Command Deck (MACD) — terminal multiplexer and orchestration layer for a fleet of Claude Code sessions");

program
  .command("list")
  .description("List known agent sessions")
  .action(async () => {
    const registry = new SessionRegistry(storePath);
    await registry.load();
    const sessions = registry.list();
    if (sessions.length === 0) {
      console.log("No sessions registered yet. Use `macd register <name>` to add one.");
      return;
    }
    for (const s of sessions) {
      console.log(`${s.id}  ${s.name.padEnd(24)} ${s.status.padEnd(8)} ${s.host}  (last seen ${s.lastSeen})`);
    }
  });

program
  .command("register <name>")
  .description("Register a new session")
  .option("--host <host>", "hostname/machine label", "local")
  .action(async (name: string, opts: { host: string }) => {
    const registry = new SessionRegistry(storePath);
    await registry.load();
    const id = randomUUID();
    registry.register({
      id,
      name,
      host: opts.host,
      status: "idle",
      lastSeen: new Date().toISOString(),
    });
    await registry.save();
    console.log(`Registered "${name}" as ${id}`);
  });

program
  .command("watch <names...>")
  .description("Spawn a claude session per name and show them in a split-pane view")
  .option("--command <cmd>", "command to spawn for each pane", "claude")
  .action(async (names: string[], opts: { command: string }) => {
    const { cleanup } = await launchDeck(
      names.map((name) => ({ id: name, title: name, command: opts.command })),
      { storePath },
    );
    const shutdown = () => {
      cleanup()
        .catch((err) => console.error("Error during shutdown:", err))
        .finally(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

program
  .command("send <sessionId> <message>")
  .description("Send a message into a live `watch` pane from another terminal/process")
  .action(async (sessionId: string, message: string) => {
    const registry = new SessionRegistry(storePath);
    await registry.load();
    const session = registry.get(sessionId) ?? registry.list().find((s) => s.name === sessionId);
    if (!session) {
      console.error(`Unknown session "${sessionId}". Run \`macd list\` to see known sessions.`);
      process.exitCode = 1;
      return;
    }
    if (!session.socketPath) {
      console.error(`Session "${sessionId}" has no live pane to deliver to (not spawned by \`watch\`).`);
      process.exitCode = 1;
      return;
    }
    try {
      await sendToSessionSocket(session.socketPath, message);
      const log = new MessageLog(messagesPath);
      await log.load();
      log.record("cli", session.id, message);
      await log.save();
      console.log(`Sent to "${session.name}" (${session.id}).`);
    } catch (err) {
      console.error(`Failed to reach "${session.name}" (${session.id}):`, (err as Error).message);
      process.exitCode = 1;
    }
  });

program
  .command("assign <sessionId> <description>")
  .description("Create a tracked task assigned to a session")
  .action(async (sessionId: string, description: string) => {
    const store = new TaskStore(tasksPath);
    await store.load();
    const task = store.assign(sessionId, description);
    await store.save();
    console.log(`Assigned task ${task.id} to "${sessionId}": ${description}`);
  });

program
  .command("tasks")
  .description("List tracked tasks")
  .action(async () => {
    const store = new TaskStore(tasksPath);
    await store.load();
    const tasks = store.list();
    if (tasks.length === 0) {
      console.log("No tasks yet. Use `macd assign <session-id> <description>`.");
      return;
    }
    for (const t of tasks) {
      console.log(`${t.id}  ${t.status.padEnd(12)} -> ${t.assignedTo.padEnd(20)} ${t.description}`);
    }
  });

program
  .command("task-status <taskId> <status>")
  .description(`Update a task's status (${TASK_STATUSES.join("|")})`)
  .action(async (taskId: string, status: string) => {
    if (!TASK_STATUSES.includes(status as Task["status"])) {
      console.error(`Invalid status "${status}". Must be one of: ${TASK_STATUSES.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    const store = new TaskStore(tasksPath);
    await store.load();
    try {
      const task = store.updateStatus(taskId, status as Task["status"]);
      await store.save();
      console.log(`Task ${task.id} -> ${task.status}`);
    } catch (err) {
      console.error((err as Error).message);
      process.exitCode = 1;
    }
  });

program
  .command("seed")
  .description(
    "Overwrite the sessions/tasks/messages stores with a demo fleet, so `dashboard` has something to show " +
      "(fresh clone, or before a screenshot). Not for a machine with real sessions you care about — it replaces, not merges.",
  )
  .action(async () => {
    const { sessions, tasks, messages } = await seedDemoData({
      sessionsPath: storePath,
      tasksPath,
      messagesPath,
    });
    console.log(`Seeded ${sessions} sessions, ${tasks} tasks, ${messages} messages.`);
  });

program
  .command("dashboard")
  .description("Serve a read-only web view of sessions, tasks, and activity (no send/control capability)")
  .option("--port <port>", "port to listen on", "4317")
  .action(async (opts: { port: string }) => {
    const server = await startDashboardServer(
      { sessionsPath: storePath, tasksPath, messagesPath },
      Number(opts.port),
    );
    console.log(`macd dashboard running at ${server.url}`);
    const shutdown = () => {
      server.close().finally(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

program.parseAsync(process.argv);
