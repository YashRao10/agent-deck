import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageLog } from "../src/message-log.js";

describe("MessageLog", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("records and lists messages most recent first", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-msglog-"));
    const log = new MessageLog(join(dir, "messages.json"));
    await log.load();
    log.record("cli", "worker-1", "first");
    log.record("cli", "worker-1", "second");
    expect(log.list().map((m) => m.body)).toEqual(["second", "first"]);
  });

  it("persists across load/save cycles", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-msglog-"));
    const storePath = join(dir, "messages.json");
    const log = new MessageLog(storePath);
    await log.load();
    log.record("cli", "worker-1", "check CI");
    await log.save();

    const reloaded = new MessageLog(storePath);
    await reloaded.load();
    expect(reloaded.list()).toHaveLength(1);
    expect(reloaded.list()[0]?.body).toBe("check CI");
  });

  it("caps history at 200 entries", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-msglog-"));
    const log = new MessageLog(join(dir, "messages.json"));
    await log.load();
    for (let i = 0; i < 205; i++) {
      log.record("cli", "worker-1", `message-${i}`);
    }
    const entries = log.list();
    expect(entries).toHaveLength(200);
    expect(entries[0]?.body).toBe("message-204");
    expect(entries[entries.length - 1]?.body).toBe("message-5");
  });
});
