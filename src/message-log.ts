import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { DeckMessage } from "./types.js";

const MAX_ENTRIES = 200;

/**
 * A capped, persisted record of messages sent through `agent-deck send`, so
 * the dashboard can show an activity feed of what's actually being said
 * between sessions, not just idle/busy/offline status. Read-only from the
 * dashboard's side — only `send` appends to it.
 */
export class MessageLog {
  private messages: DeckMessage[] = [];

  constructor(private readonly storePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, "utf8");
      this.messages = JSON.parse(raw) as DeckMessage[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, JSON.stringify(this.messages, null, 2));
  }

  record(from: string, to: string, body: string): DeckMessage {
    const message: DeckMessage = {
      id: randomUUID(),
      from,
      to,
      body,
      sentAt: new Date().toISOString(),
    };
    this.messages.push(message);
    if (this.messages.length > MAX_ENTRIES) {
      this.messages = this.messages.slice(-MAX_ENTRIES);
    }
    return message;
  }

  /** Most recent first. */
  list(): DeckMessage[] {
    return [...this.messages].reverse();
  }
}
