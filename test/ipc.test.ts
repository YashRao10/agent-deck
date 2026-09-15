import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sendToSessionSocket, socketPathFor, startSessionSocketServer } from "../src/ipc.js";

describe("socketPathFor", () => {
  it("derives a distinct path per session id", () => {
    expect(socketPathFor("worker-1")).not.toBe(socketPathFor("worker-2"));
    expect(socketPathFor("worker-1")).toContain("worker-1");
  });
});

// Always go through socketPathFor rather than an arbitrary filesystem path:
// on Windows it returns a \\.\pipe\ name, and a plain path under a temp dir
// fails with EACCES there (see the comment in src/ipc.ts).
describe("session socket server", () => {
  it("delivers a sent line to the server's message handler", async () => {
    const socketPath = socketPathFor(`test-${randomUUID()}`);

    const received: string[] = [];
    const server = await startSessionSocketServer(socketPath, (body) => received.push(body));

    await sendToSessionSocket(socketPath, "check CI");

    expect(received).toEqual(["check CI"]);
    await server.close();
  });

  it("rejects when nothing is listening", async () => {
    const socketPath = socketPathFor(`ghost-${randomUUID()}`);
    await expect(sendToSessionSocket(socketPath, "hello")).rejects.toThrow();
  });

  it("stops accepting connections after close", async () => {
    const socketPath = socketPathFor(`test-${randomUUID()}`);
    const server = await startSessionSocketServer(socketPath, () => {});
    await server.close();
    await expect(sendToSessionSocket(socketPath, "hello")).rejects.toThrow();
  });
});
