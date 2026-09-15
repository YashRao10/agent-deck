import { describe, expect, it, vi, beforeEach } from "vitest";

const spawnMock = vi.fn();

vi.mock("node-pty", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

// Imported after the mock so ClaudePtyTransport picks up the fake node-pty.
const { ClaudePtyTransport } = await import("../src/pty-transport.js");

function fakePty() {
  const dataHandlers: Array<(chunk: string) => void> = [];
  const exitHandlers: Array<() => void> = [];
  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (handler: (chunk: string) => void) => dataHandlers.push(handler),
    onExit: (handler: () => void) => exitHandlers.push(handler),
    emitData: (chunk: string) => dataHandlers.forEach((h) => h(chunk)),
    emitExit: () => exitHandlers.forEach((h) => h()),
  };
}

describe("ClaudePtyTransport", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("spawns the given command with the session's cwd", () => {
    const pty = fakePty();
    spawnMock.mockReturnValue(pty);

    new ClaudePtyTransport({ sessionId: "worker-1", command: "claude", cwd: "/repo" });

    expect(spawnMock).toHaveBeenCalledWith(
      "claude",
      [],
      expect.objectContaining({ cwd: "/repo" }),
    );
  });

  it("buffers raw PTY output into line-based DeckMessages", () => {
    const pty = fakePty();
    spawnMock.mockReturnValue(pty);
    const transport = new ClaudePtyTransport({ sessionId: "worker-1" });

    const received: string[] = [];
    transport.onMessage((message) => received.push(message.body));

    pty.emitData("first line\r\nsecond ");
    pty.emitData("line\r\nthird\r\n");

    expect(received).toEqual(["first line", "second line", "third"]);
  });

  it("writes outgoing DeckMessage bodies to the PTY as a line of input", async () => {
    const pty = fakePty();
    spawnMock.mockReturnValue(pty);
    const transport = new ClaudePtyTransport({ sessionId: "worker-1" });

    await transport.send({ id: "1", from: "main", to: "worker-1", body: "run tests", sentAt: "now" });

    expect(pty.write).toHaveBeenCalledWith("run tests\r");
  });

  it("reports disconnected after the process exits and rejects further sends", async () => {
    const pty = fakePty();
    spawnMock.mockReturnValue(pty);
    const transport = new ClaudePtyTransport({ sessionId: "worker-1" });

    expect(transport.isConnected("worker-1")).toBe(true);
    pty.emitExit();
    expect(transport.isConnected("worker-1")).toBe(false);

    await expect(
      transport.send({ id: "1", from: "main", to: "worker-1", body: "hi", sentAt: "now" }),
    ).rejects.toThrow(/not connected/);
  });

  it("isConnected only matches its own sessionId", () => {
    const pty = fakePty();
    spawnMock.mockReturnValue(pty);
    const transport = new ClaudePtyTransport({ sessionId: "worker-1" });

    expect(transport.isConnected("someone-else")).toBe(false);
  });
});
