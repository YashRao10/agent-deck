import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskStore, UNASSIGNED } from "../src/task-store.js";

describe("TaskStore", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("assigns and lists tasks", async () => {
    dir = await mkdtemp(join(tmpdir(), "macd-tasks-"));
    const store = new TaskStore(join(dir, "tasks.json"));
    await store.load();
    const task = store.assign("worker-1", "check CI");
    expect(task.status).toBe("pending");
    expect(store.list()).toHaveLength(1);
  });

  it("persists tasks across load/save cycles", async () => {
    dir = await mkdtemp(join(tmpdir(), "macd-tasks-"));
    const storePath = join(dir, "tasks.json");
    const store = new TaskStore(storePath);
    await store.load();
    store.assign("worker-1", "check CI");
    await store.save();

    const reloaded = new TaskStore(storePath);
    await reloaded.load();
    expect(reloaded.list()).toHaveLength(1);
    expect(reloaded.list()[0]?.description).toBe("check CI");
  });

  it("updates a task's status", async () => {
    dir = await mkdtemp(join(tmpdir(), "macd-tasks-"));
    const store = new TaskStore(join(dir, "tasks.json"));
    await store.load();
    const task = store.assign("worker-1", "check CI");
    const updated = store.updateStatus(task.id, "in_progress");
    expect(updated.status).toBe("in_progress");
    expect(updated.id).toBe(task.id);
  });

  it("throws when updating an unknown task", async () => {
    dir = await mkdtemp(join(tmpdir(), "macd-tasks-"));
    const store = new TaskStore(join(dir, "tasks.json"));
    await store.load();
    expect(() => store.updateStatus("ghost", "done")).toThrow(/Unknown task/);
  });

  describe("claimNext", () => {
    it("claims a task already assigned to the session and marks it in_progress", async () => {
      dir = await mkdtemp(join(tmpdir(), "macd-tasks-"));
      const store = new TaskStore(join(dir, "tasks.json"));
      await store.load();
      const task = store.assign("worker-1", "check CI");

      const claimed = store.claimNext("worker-1");
      expect(claimed?.id).toBe(task.id);
      expect(claimed?.status).toBe("in_progress");
    });

    it("claims the oldest unclaimed pool task and reassigns it to the session", async () => {
      dir = await mkdtemp(join(tmpdir(), "macd-tasks-"));
      const store = new TaskStore(join(dir, "tasks.json"));
      await store.load();
      const pooled = store.assign(UNASSIGNED, "triage flaky test");

      const claimed = store.claimNext("worker-2");
      expect(claimed?.id).toBe(pooled.id);
      expect(claimed?.assignedTo).toBe("worker-2");
      expect(claimed?.status).toBe("in_progress");
    });

    it("does not claim a task assigned to a different session", async () => {
      dir = await mkdtemp(join(tmpdir(), "macd-tasks-"));
      const store = new TaskStore(join(dir, "tasks.json"));
      await store.load();
      store.assign("worker-1", "check CI");

      expect(store.claimNext("worker-2")).toBeUndefined();
    });

    it("does not claim a task that's already in_progress, done, or failed", async () => {
      dir = await mkdtemp(join(tmpdir(), "macd-tasks-"));
      const store = new TaskStore(join(dir, "tasks.json"));
      await store.load();
      const task = store.assign(UNASSIGNED, "already moving");
      store.updateStatus(task.id, "in_progress");

      expect(store.claimNext("worker-1")).toBeUndefined();
    });

    it("returns undefined when there's nothing to claim", async () => {
      dir = await mkdtemp(join(tmpdir(), "macd-tasks-"));
      const store = new TaskStore(join(dir, "tasks.json"));
      await store.load();

      expect(store.claimNext("worker-1")).toBeUndefined();
    });

    it("prefers the oldest eligible task when several are claimable", async () => {
      dir = await mkdtemp(join(tmpdir(), "macd-tasks-"));
      const store = new TaskStore(join(dir, "tasks.json"));
      await store.load();
      const first = store.assign(UNASSIGNED, "first in line");
      store.assign(UNASSIGNED, "second in line");

      const claimed = store.claimNext("worker-1");
      expect(claimed?.id).toBe(first.id);
    });
  });
});
