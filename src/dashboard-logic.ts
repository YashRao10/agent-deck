/**
 * Pure reference implementations of pieces of client-side dashboard logic
 * (the sparkline's time bucketing and the entrance-animation dedup both
 * actually had bugs; task-pool counting is here because it's the same kind
 * of pure logic, not because it's had one yet). The dashboard itself renders
 * as one large inline `<script>` inside `src/dashboard.ts`'s HTML template —
 * genuinely browser-only (DOM writes, `document.*`) and not something
 * vitest can import — so these are mirrored by hand into that template
 * rather than shared at runtime. Kept here so the actual algorithm has unit
 * test coverage; if you change one of these in `dashboard.ts`, change it
 * here too.
 */

import type { Task } from "./types.js";
import { UNASSIGNED } from "./task-store.js";

/** Counts pending tasks sitting unclaimed in the shared pool (`macd queue`). */
export function countPooledTasks(tasks: Array<Pick<Task, "status" | "assignedTo">>): number {
  return tasks.filter((t) => t.status === "pending" && t.assignedTo === UNASSIGNED).length;
}

/** Buckets message timestamps into fixed-width, most-recent-last windows. */
export function bucketMessages(
  sentAtMs: number[],
  nowMs: number,
  bucketCount: number,
  bucketMs: number,
): number[] {
  const counts = new Array(bucketCount).fill(0);
  for (const t of sentAtMs) {
    const age = nowMs - t;
    const bucket = bucketCount - 1 - Math.floor(age / bucketMs);
    if (bucket >= 0 && bucket < bucketCount) counts[bucket]++;
  }
  return counts;
}

/**
 * True only the first time `id` is seen for a given `seen` set — mutates
 * `seen` as a side effect, same as the inline `markEnter`. Every panel
 * rebuilds from scratch on each poll, so without this dedup every row would
 * replay its entrance animation every 2s instead of just once.
 */
export function shouldEnter(seen: Set<string>, id: string): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  return true;
}
