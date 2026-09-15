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
  const exitHandlers: Array<() => void> = [];
  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (handler: (chunk: string) => void) => dataHandlers.push(handler),
    onExit: (handler: () => void) => exitHandlers.push(handler),
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
