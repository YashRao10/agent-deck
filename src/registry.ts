import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentSession } from "./types.js";

/**
 * Tracks known agent sessions (this machine's own spawned panes, plus peers
 * discovered over Remote Control) in a small JSON file. Kept dead simple on
 * purpose — the interesting orchestration logic lives in the router, not here.
 */
export class SessionRegistry {
  private sessions = new Map<string, AgentSession>();

  constructor(private readonly storePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, "utf8");
      const parsed = JSON.parse(raw) as AgentSession[];
      for (const session of parsed) {
        this.sessions.set(session.id, session);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, JSON.stringify(this.list(), null, 2));
  }

  register(session: AgentSession): void {
    this.sessions.set(session.id, session);
  }

  remove(id: string): boolean {
    return this.sessions.delete(id);
  }

  get(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  list(): AgentSession[] {
    return [...this.sessions.values()];
  }

  markStatus(id: string, status: AgentSession["status"]): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.status = status;
    session.lastSeen = new Date().toISOString();
  }
}
