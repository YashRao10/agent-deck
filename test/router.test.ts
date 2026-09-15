import { describe, expect, it, vi } from "vitest";
import { SessionRegistry } from "../src/registry.js";
import { MessageRouter } from "../src/router.js";
import type { Transport, DeckMessage } from "../src/types.js";

function fakeTransport(connected = true): Transport {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
    isConnected: () => connected,
  };
}

describe("MessageRouter", () => {
  it("sends a message through the registered transport", async () => {
    const registry = new SessionRegistry("/tmp/unused.json");
    registry.register({ id: "worker-1", name: "macbook", host: "macbook", status: "idle", lastSeen: "now" });
    const router = new MessageRouter(registry);
    const transport = fakeTransport();
    router.registerTransport("worker-1", transport);

    const message = await router.sendMessage("main", "worker-1", "check CI");

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ from: "main", to: "worker-1", body: "check CI" } satisfies Partial<DeckMessage>),
    );
    expect(message.body).toBe("check CI");
    expect(registry.get("worker-1")?.status).toBe("busy");
  });

  it("throws when no transport is registered for the target", async () => {
    const registry = new SessionRegistry("/tmp/unused.json");
    const router = new MessageRouter(registry);
    await expect(router.sendMessage("main", "ghost", "hello")).rejects.toThrow(/No transport/);
  });

  it("throws when the target transport reports disconnected", async () => {
    const registry = new SessionRegistry("/tmp/unused.json");
    registry.register({ id: "worker-1", name: "macbook", host: "macbook", status: "offline", lastSeen: "now" });
    const router = new MessageRouter(registry);
    router.registerTransport("worker-1", fakeTransport(false));
    await expect(router.sendMessage("main", "worker-1", "hello")).rejects.toThrow(/not connected/);
  });

  it("tracks task lifecycle", () => {
    const registry = new SessionRegistry("/tmp/unused.json");
    const router = new MessageRouter(registry);
    const task = router.assignTask("worker-1", "build the PTY layer");
    expect(task.status).toBe("pending");
    router.updateTaskStatus(task.id, "in_progress");
    expect(router.listTasks()[0]?.status).toBe("in_progress");
  });
});
