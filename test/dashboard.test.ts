import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionRegistry } from "../src/registry.js";
import { TaskStore } from "../src/task-store.js";
import { MessageLog } from "../src/message-log.js";
import { startDashboardServer, type DashboardPaths, type DashboardServer } from "../src/dashboard.js";

async function pathsIn(dir: string): Promise<DashboardPaths> {
  return {
    sessionsPath: join(dir, "sessions.json"),
    tasksPath: join(dir, "tasks.json"),
    messagesPath: join(dir, "messages.json"),
  };
}

describe("dashboard server", () => {
  let dir: string;
  let server: DashboardServer;

  afterEach(async () => {
    if (server) await server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("serves the registry's sessions as JSON", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-dash-"));
    const paths = await pathsIn(dir);
    const registry = new SessionRegistry(paths.sessionsPath);
    await registry.load();
    registry.register({
      id: "s1",
      name: "worker-1",
      host: "local",
      status: "idle",
      lastSeen: "2026-01-01T00:00:00.000Z",
    });
    await registry.save();

    server = await startDashboardServer(paths);
    const res = await fetch(`${server.url}/api/sessions`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const sessions = await res.json();
    expect(sessions).toEqual([
      { id: "s1", name: "worker-1", host: "local", status: "idle", lastSeen: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("reflects registry changes written after the server started", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-dash-"));
    const paths = await pathsIn(dir);
    server = await startDashboardServer(paths);

    let sessions = await (await fetch(`${server.url}/api/sessions`)).json();
    expect(sessions).toEqual([]);

    const registry = new SessionRegistry(paths.sessionsPath);
    await registry.load();
    registry.register({
      id: "s2",
      name: "worker-2",
      host: "local",
      status: "busy",
      lastSeen: "2026-01-01T00:00:00.000Z",
    });
    await registry.save();

    sessions = await (await fetch(`${server.url}/api/sessions`)).json();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe("worker-2");
  });

  it("serves tasks as JSON, reflecting store changes", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-dash-"));
    const paths = await pathsIn(dir);
    server = await startDashboardServer(paths);

    let tasks = await (await fetch(`${server.url}/api/tasks`)).json();
    expect(tasks).toEqual([]);

    const store = new TaskStore(paths.tasksPath);
    await store.load();
    store.assign("worker-1", "check CI");
    await store.save();

    tasks = await (await fetch(`${server.url}/api/tasks`)).json();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assignedTo: "worker-1", description: "check CI", status: "pending" });
  });

  it("serves the message log as JSON, most recent first", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-dash-"));
    const paths = await pathsIn(dir);
    const log = new MessageLog(paths.messagesPath);
    await log.load();
    log.record("cli", "worker-1", "first");
    log.record("cli", "worker-1", "second");
    await log.save();

    server = await startDashboardServer(paths);
    const messages = await (await fetch(`${server.url}/api/messages`)).json();
    expect(messages.map((m: { body: string }) => m.body)).toEqual(["second", "first"]);
  });

  it("serves an HTML page at the root", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-dash-"));
    server = await startDashboardServer(await pathsIn(dir));
    const res = await fetch(server.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("agent-deck");
    expect(body).toContain("Sessions");
    expect(body).toContain("Tasks");
    expect(body).toContain("Activity");
  });

  it("404s on unknown paths and never exposes a send/control endpoint", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-dash-"));
    server = await startDashboardServer(await pathsIn(dir));
    const res = await fetch(`${server.url}/api/send`, { method: "POST" });
    expect(res.status).toBe(404);
    const assignRes = await fetch(`${server.url}/api/assign`, { method: "POST" });
    expect(assignRes.status).toBe(404);
  });

  it("ignores a query string on routed paths", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-dash-"));
    server = await startDashboardServer(await pathsIn(dir));

    const page = await fetch(`${server.url}/?foo=bar`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");

    const api = await fetch(`${server.url}/api/sessions?cachebust=123`);
    expect(api.status).toBe(200);
    expect(api.headers.get("content-type")).toContain("application/json");
  });
});
