import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sendToSessionSocket, socketPathFor, startSessionSocketServer } from "../src/ipc.js";

describe("socketPathFor", () => {
  it("derives a distinct path per session id", () => {
    expect(socketPathFor("worker-1")).not.toBe(socketPathFor("worker-2"));
    expect(socketPathFor("worker-1")).toContain("worker-1");
  });
});

describe("session socket server", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("delivers a sent line to the server's message handler", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-ipc-"));
    const socketPath = join(dir, "worker-1.sock");

    const received: string[] = [];
    const server = await startSessionSocketServer(socketPath, (body) => received.push(body));

    await sendToSessionSocket(socketPath, "check CI");

    expect(received).toEqual(["check CI"]);
    await server.close();
  });

  it("rejects when nothing is listening", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-ipc-"));
    const socketPath = join(dir, "ghost.sock");
    await expect(sendToSessionSocket(socketPath, "hello")).rejects.toThrow();
  });

  it("removes the socket file on close", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-ipc-"));
    const socketPath = join(dir, "worker-1.sock");
    const server = await startSessionSocketServer(socketPath, () => {});
    await server.close();
    await expect(sendToSessionSocket(socketPath, "hello")).rejects.toThrow();
  });
});
