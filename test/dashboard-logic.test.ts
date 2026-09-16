import { describe, expect, it } from "vitest";
import { bucketMessages, countPooledTasks, shouldEnter } from "../src/dashboard-logic.js";
import { UNASSIGNED } from "../src/task-store.js";

describe("bucketMessages", () => {
  const NOW = 1_000_000;
  const BUCKETS = 20;
  const BUCKET_MS = 60_000;

  it("puts a message from right now in the last bucket", () => {
    const counts = bucketMessages([NOW], NOW, BUCKETS, BUCKET_MS);
    expect(counts[BUCKETS - 1]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("puts a message from one bucket-width ago in the second-to-last bucket", () => {
    const counts = bucketMessages([NOW - BUCKET_MS], NOW, BUCKETS, BUCKET_MS);
    expect(counts[BUCKETS - 2]).toBe(1);
  });

  it("drops a message older than the full window", () => {
    const counts = bucketMessages([NOW - BUCKETS * BUCKET_MS], NOW, BUCKETS, BUCKET_MS);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("drops a message from the future (negative age)", () => {
    const counts = bucketMessages([NOW + BUCKET_MS], NOW, BUCKETS, BUCKET_MS);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("accumulates multiple messages in the same bucket", () => {
    const counts = bucketMessages([NOW, NOW - 100, NOW - 500], NOW, BUCKETS, BUCKET_MS);
    expect(counts[BUCKETS - 1]).toBe(3);
  });

  it("returns an all-zero array of the right length for no messages", () => {
    const counts = bucketMessages([], NOW, BUCKETS, BUCKET_MS);
    expect(counts).toHaveLength(BUCKETS);
    expect(counts.every((c) => c === 0)).toBe(true);
  });
});

describe("shouldEnter", () => {
  it("is true the first time an id is seen", () => {
    const seen = new Set<string>();
    expect(shouldEnter(seen, "a")).toBe(true);
  });

  it("is false on every subsequent call for the same id", () => {
    const seen = new Set<string>();
    shouldEnter(seen, "a");
    expect(shouldEnter(seen, "a")).toBe(false);
    expect(shouldEnter(seen, "a")).toBe(false);
  });

  it("regression: a status change on an existing id does not re-trigger entrance", () => {
    // This is the exact bug fixed in 29043a7 — every panel rebuilds from
    // scratch each 2s poll, so a naive "animate everything" would replay
    // the entrance animation on an unchanged row too.
    const seen = new Set<string>();
    shouldEnter(seen, "session-1");
    for (let i = 0; i < 5; i++) {
      expect(shouldEnter(seen, "session-1")).toBe(false);
    }
  });

  it("tracks ids independently", () => {
    const seen = new Set<string>();
    expect(shouldEnter(seen, "a")).toBe(true);
    expect(shouldEnter(seen, "b")).toBe(true);
    expect(shouldEnter(seen, "a")).toBe(false);
  });
});

describe("countPooledTasks", () => {
  it("counts only pending tasks assigned to the unclaimed pool", () => {
    const count = countPooledTasks([
      { status: "pending", assignedTo: UNASSIGNED },
      { status: "pending", assignedTo: UNASSIGNED },
      { status: "pending", assignedTo: "worker-1" },
      { status: "in_progress", assignedTo: UNASSIGNED },
      { status: "done", assignedTo: UNASSIGNED },
    ]);
    expect(count).toBe(2);
  });

  it("returns 0 for an empty task list", () => {
    expect(countPooledTasks([])).toBe(0);
  });

  it("returns 0 when nothing is pooled", () => {
    const count = countPooledTasks([
      { status: "pending", assignedTo: "worker-1" },
      { status: "done", assignedTo: "worker-2" },
    ]);
    expect(count).toBe(0);
  });
});
