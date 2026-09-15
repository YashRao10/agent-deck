#!/usr/bin/env node
import { Command } from "commander";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SessionRegistry } from "./registry.js";
import { launchDeck } from "./tui.js";
import { sendToSessionSocket } from "./ipc.js";

const storePath = join(homedir(), ".agent-deck", "sessions.json");

const program = new Command();
program
  .name("agent-deck")
  .description("Terminal multiplexer and orchestration layer for a fleet of Claude Code sessions");

program
  .command("list")
  .description("List known agent sessions")
  .action(async () => {
    const registry = new SessionRegistry(storePath);
    await registry.load();
    const sessions = registry.list();
    if (sessions.length === 0) {
      console.log("No sessions registered yet. Use `agent-deck register <name>` to add one.");
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
      console.error(`Unknown session "${sessionId}". Run \`agent-deck list\` to see known sessions.`);
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
      console.log(`Sent to "${session.name}" (${session.id}).`);
    } catch (err) {
      console.error(`Failed to reach "${session.name}" (${session.id}):`, (err as Error).message);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
