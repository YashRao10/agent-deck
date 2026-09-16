import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionRegistry } from "../src/registry.js";

describe("SessionRegistry", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("registers and lists sessions", async () => {
    dir = await mkdtemp(join(tmpdir(), "macd-"));
    const registry = new SessionRegistry(join(dir, "sessions.json"));
    await registry.load();
    registry.register({
      id: "s1",
      name: "windows-main",
      host: "windows",
      status: "idle",
      lastSeen: new Date().toISOString(),
    });
    expect(registry.list()).toHaveLength(1);
    expect(registry.get("s1")?.name).toBe("windows-main");
  });

  it("persists sessions across load/save cycles", async () => {
    dir = await mkdtemp(join(tmpdir(), "macd-"));
    const storePath = join(dir, "sessions.json");
    const registry = new SessionRegistry(storePath);
    await registry.load();
    registry.register({
      id: "s1",
      name: "macbook-worker",
      host: "macbook",
      status: "idle",
      lastSeen: new Date().toISOString(),
    });
    await registry.save();

    const reloaded = new SessionRegistry(storePath);
    await reloaded.load();
    expect(reloaded.list()).toHaveLength(1);
    expect(reloaded.get("s1")?.host).toBe("macbook");
  });

  it("marks status and updates lastSeen", async () => {
    dir = await mkdtemp(join(tmpdir(), "macd-"));
    const registry = new SessionRegistry(join(dir, "sessions.json"));
    await registry.load();
    registry.register({
      id: "s1",
      name: "windows-main",
      host: "windows",
      status: "idle",
      lastSeen: "2026-01-01T00:00:00.000Z",
    });
    registry.markStatus("s1", "busy");
    expect(registry.get("s1")?.status).toBe("busy");
    expect(registry.get("s1")?.lastSeen).not.toBe("2026-01-01T00:00:00.000Z");
  });
});
