import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const spawnMock = vi.fn();
vi.mock("node-pty", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const renderMock = vi.fn();
vi.mock("ink", () => ({
  render: (...args: unknown[]) => renderMock(...args),
}));

const { launchDeck } = await import("../src/tui.js");
const { SessionRegistry } = await import("../src/registry.js");
const { sendToSessionSocket, socketPathFor } = await import("../src/ipc.js");

function fakePty() {
  const dataHandlers: Array<(chunk: string) => void> = [];
  const exitHandlers: Array<(info: { exitCode: number; signal?: number }) => void> = [];
  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (handler: (chunk: string) => void) => dataHandlers.push(handler),
    onExit: (handler: (info: { exitCode: number; signal?: number }) => void) => exitHandlers.push(handler),
    emitExit: (info: { exitCode: number; signal?: number }) => exitHandlers.forEach((h) => h(info)),
  };
}

describe("launchDeck", () => {
  let dir: string;

  beforeEach(() => {
    spawnMock.mockReset();
    renderMock.mockReset();
    renderMock.mockReturnValue({ unmount: vi.fn() });
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("registers each spawned pane in the SessionRegistry with a socket path", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-tui-"));
    const storePath = join(dir, "sessions.json");
    spawnMock.mockReturnValue(fakePty());

    const sessionId = `worker-${randomUUID()}`;
    const { cleanup } = await launchDeck([{ id: sessionId, title: "worker" }], { storePath });

    const registry = new SessionRegistry(storePath);
    await registry.load();
    const session = registry.get(sessionId);
    expect(session?.status).toBe("idle");
    expect(session?.socketPath).toBe(socketPathFor(sessionId));

    await cleanup();
  });

  it("marks the session offline and removes the socket after cleanup", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-tui-"));
    const storePath = join(dir, "sessions.json");
    spawnMock.mockReturnValue(fakePty());

    const sessionId = `worker-${randomUUID()}`;
    const { cleanup } = await launchDeck([{ id: sessionId, title: "worker" }], { storePath });
    await cleanup();

    const registry = new SessionRegistry(storePath);
    await registry.load();
    expect(registry.get(sessionId)?.status).toBe("offline");

    await expect(sendToSessionSocket(socketPathFor(sessionId), "hi")).rejects.toThrow();
  });

  it("marks a session crashed the moment its pane exits unexpectedly, without waiting for cleanup", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-tui-"));
    const storePath = join(dir, "sessions.json");
    const pty = fakePty();
    spawnMock.mockReturnValue(pty);

    const sessionId = `worker-${randomUUID()}`;
    const { cleanup } = await launchDeck([{ id: sessionId, title: "worker" }], { storePath });

    pty.emitExit({ exitCode: 1, signal: 11 });

    const registry = new SessionRegistry(storePath);
    await vi.waitFor(async () => {
      await registry.load();
      expect(registry.get(sessionId)?.status).toBe("crashed");
    });

    // Its socket should already be torn down too, not left dangling until cleanup().
    await expect(sendToSessionSocket(socketPathFor(sessionId), "hi")).rejects.toThrow();

    await cleanup();
  });

  it("marks a cleanly-exited pane offline, not crashed", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-tui-"));
    const storePath = join(dir, "sessions.json");
    const pty = fakePty();
    spawnMock.mockReturnValue(pty);

    const sessionId = `worker-${randomUUID()}`;
    const { cleanup } = await launchDeck([{ id: sessionId, title: "worker" }], { storePath });

    pty.emitExit({ exitCode: 0 });

    const registry = new SessionRegistry(storePath);
    await vi.waitFor(async () => {
      await registry.load();
      expect(registry.get(sessionId)?.status).toBe("offline");
    });

    await cleanup();
  });

  it("does not reclassify a session as crashed when cleanup()'s own kill() triggers the exit", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-tui-"));
    const storePath = join(dir, "sessions.json");
    const pty = fakePty();
    spawnMock.mockReturnValue(pty);

    const sessionId = `worker-${randomUUID()}`;
    const { cleanup } = await launchDeck([{ id: sessionId, title: "worker" }], { storePath });

    // cleanup() calls transport.kill(), then (as node-pty would, asynchronously)
    // the underlying process reports its own exit — typically via signal.
    await cleanup();
    pty.emitExit({ exitCode: 0, signal: 15 });

    const registry = new SessionRegistry(storePath);
    await registry.load();
    expect(registry.get(sessionId)?.status).toBe("offline");
  });

  it("delivers a message sent to the pane's socket into the PTY as input", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-tui-"));
    const storePath = join(dir, "sessions.json");
    const pty = fakePty();
    spawnMock.mockReturnValue(pty);

    const sessionId = `worker-${randomUUID()}`;
    const { cleanup } = await launchDeck([{ id: sessionId, title: "worker" }], { storePath });

    await sendToSessionSocket(socketPathFor(sessionId), "run tests");
    await vi.waitFor(() => expect(pty.write).toHaveBeenCalledWith("run tests\r"));

    await cleanup();
  });
});
