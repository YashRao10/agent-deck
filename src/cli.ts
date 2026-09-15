#!/usr/bin/env node
import { Command } from "commander";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SessionRegistry } from "./registry.js";

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

program.parseAsync(process.argv);
