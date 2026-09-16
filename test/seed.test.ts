import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedDemoData } from "../src/seed.js";
import { SessionRegistry } from "../src/registry.js";
import { TaskStore } from "../src/task-store.js";
import { MessageLog } from "../src/message-log.js";

describe("seedDemoData", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("populates all three stores", async () => {
    dir = await mkdtemp(join(tmpdir(), "macd-seed-"));
    const paths = {
      sessionsPath: join(dir, "sessions.json"),
      tasksPath: join(dir, "tasks.json"),
      messagesPath: join(dir, "messages.json"),
    };

    const counts = await seedDemoData(paths);
    expect(counts.sessions).toBeGreaterThan(0);
    expect(counts.tasks).toBeGreaterThan(0);
    expect(counts.messages).toBeGreaterThan(0);

    const registry = new SessionRegistry(paths.sessionsPath);
    await registry.load();
    expect(registry.list()).toHaveLength(counts.sessions);

    const tasks = new TaskStore(paths.tasksPath);
    await tasks.load();
    expect(tasks.list()).toHaveLength(counts.tasks);

    const log = new MessageLog(paths.messagesPath);
    await log.load();
    expect(log.list()).toHaveLength(counts.messages);
  });

  it("is idempotent — re-running does not duplicate sessions", async () => {
    dir = await mkdtemp(join(tmpdir(), "macd-seed-"));
    const paths = {
      sessionsPath: join(dir, "sessions.json"),
      tasksPath: join(dir, "tasks.json"),
      messagesPath: join(dir, "messages.json"),
    };

    await seedDemoData(paths);
    const counts = await seedDemoData(paths);

    const registry = new SessionRegistry(paths.sessionsPath);
    await registry.load();
    expect(registry.list()).toHaveLength(counts.sessions);
  });
});
