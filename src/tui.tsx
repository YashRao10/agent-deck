import { homedir } from "node:os";
import { join } from "node:path";
import React from "react";
import { render } from "ink";
import { ClaudePtyTransport } from "./pty-transport.js";
import { App, type PaneSource } from "./ui/App.js";
import { SessionRegistry } from "./registry.js";
import { MessageRouter } from "./router.js";
import { socketPathFor, startSessionSocketServer, type SessionSocketServer } from "./ipc.js";

export interface WatchSessionSpec {
  id: string;
  title: string;
  command?: string;
  args?: string[];
  cwd?: string;
}

export interface LaunchDeckOptions {
  /** Sessions store path, same one the CLI's `register`/`list` commands use. */
  storePath?: string;
}

export const defaultStorePath = (): string => join(homedir(), ".agent-deck", "sessions.json");

/**
 * Spawns one ClaudePtyTransport per requested session, registers each in the
 * shared SessionRegistry, and opens a per-session unix socket so a
 * `MessageRouter.sendMessage` from another process (the CLI's `send`
 * command) can reach a live pane. Returns a cleanup function that kills
 * every spawned process, marks the sessions offline, and tears down the
 * sockets — callers (the CLI, or a test) are responsible for calling it.
 */
export async function launchDeck(
  specs: WatchSessionSpec[],
  options: LaunchDeckOptions = {},
): Promise<{ unmount: () => void; cleanup: () => Promise<void> }> {
  const storePath = options.storePath ?? defaultStorePath();
  const registry = new SessionRegistry(storePath);
  await registry.load();
  const router = new MessageRouter(registry);

  const sources: PaneSource[] = [];
  const socketServers: SessionSocketServer[] = [];

  for (const spec of specs) {
    const transport = new ClaudePtyTransport({
      sessionId: spec.id,
      command: spec.command,
      args: spec.args,
      cwd: spec.cwd,
    });

    const socketPath = socketPathFor(spec.id);
    registry.register({
      id: spec.id,
      name: spec.title,
      host: "local",
      status: "idle",
      lastSeen: new Date().toISOString(),
      socketPath,
    });
    router.registerTransport(spec.id, transport);

    const socketServer = await startSessionSocketServer(socketPath, (body) => {
      router.sendMessage("external", spec.id, body).catch((err: unknown) => {
        console.error(`Failed to deliver message to "${spec.id}":`, err);
      });
    });
    socketServers.push(socketServer);

    sources.push({ sessionId: spec.id, title: spec.title, transport });
  }

  await registry.save();

  const { unmount } = render(<App sources={sources} />);

  const cleanup = async () => {
    for (const source of sources) {
      source.transport.kill();
      registry.markStatus(source.sessionId, "offline");
    }
    await registry.save();
    await Promise.all(socketServers.map((server) => server.close()));
  };

  return { unmount, cleanup };
}
