import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Task } from "./types.js";

/**
 * Persisted, cross-process task tracking — separate from MessageRouter's
 * in-memory task map, which is a transient view for a single process (a
 * `watch` pane's own router). This is the store the CLI and dashboard read
 * and write, so `macd assign` from one terminal shows up in
 * `macd tasks` (or the dashboard) run from another.
 */
export class TaskStore {
  private tasks: Task[] = [];

  constructor(private readonly storePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, "utf8");
      this.tasks = JSON.parse(raw) as Task[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, JSON.stringify(this.tasks, null, 2));
  }

  assign(assignedTo: string, description: string): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      assignedTo,
      description,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.push(task);
    return task;
  }

  updateStatus(taskId: string, status: Task["status"]): Task {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Unknown task "${taskId}"`);
    task.status = status;
    task.updatedAt = new Date().toISOString();
    return task;
  }

  list(): Task[] {
    return [...this.tasks];
  }
}
