import React from "react";
import { render } from "ink";
import { ClaudePtyTransport } from "./pty-transport.js";
import { App, type PaneSource } from "./ui/App.js";

export interface WatchSessionSpec {
  id: string;
  title: string;
  command?: string;
  args?: string[];
  cwd?: string;
}

/**
 * Spawns one ClaudePtyTransport per requested session and renders them
 * side by side. Returns a cleanup function that kills every spawned
 * process — callers (the CLI, or a test) are responsible for calling it.
 */
export function launchDeck(specs: WatchSessionSpec[]): { unmount: () => void; cleanup: () => void } {
  const sources: PaneSource[] = specs.map((spec) => ({
    sessionId: spec.id,
    title: spec.title,
    transport: new ClaudePtyTransport({
      sessionId: spec.id,
      command: spec.command,
      args: spec.args,
      cwd: spec.cwd,
    }),
  }));

  const { unmount } = render(<App sources={sources} />);

  const cleanup = () => {
    for (const source of sources) {
      source.transport.kill();
    }
  };

  return { unmount, cleanup };
}
