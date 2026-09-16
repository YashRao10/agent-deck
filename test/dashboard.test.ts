import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionRegistry } from "../src/registry.js";
import { startDashboardServer, type DashboardServer } from "../src/dashboard.js";

describe("dashboard server", () => {
  let dir: string;
  let server: DashboardServer;

  afterEach(async () => {
    if (server) await server.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("serves the registry's sessions as JSON", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-dash-"));
    const storePath = join(dir, "sessions.json");
    const registry = new SessionRegistry(storePath);
    await registry.load();
    registry.register({
      id: "s1",
      name: "worker-1",
      host: "local",
      status: "idle",
      lastSeen: "2026-01-01T00:00:00.000Z",
    });
    await registry.save();

    server = await startDashboardServer(storePath);
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
    const storePath = join(dir, "sessions.json");
    server = await startDashboardServer(storePath);

    let sessions = await (await fetch(`${server.url}/api/sessions`)).json();
    expect(sessions).toEqual([]);

    const registry = new SessionRegistry(storePath);
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

  it("serves an HTML page at the root", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-dash-"));
    server = await startDashboardServer(join(dir, "sessions.json"));
    const res = await fetch(server.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("agent-deck sessions");
  });

  it("404s on unknown paths and never exposes a send/control endpoint", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-dash-"));
    server = await startDashboardServer(join(dir, "sessions.json"));
    const res = await fetch(`${server.url}/api/send`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("ignores a query string on routed paths", async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-deck-dash-"));
    server = await startDashboardServer(join(dir, "sessions.json"));

    const page = await fetch(`${server.url}/?foo=bar`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");

    const api = await fetch(`${server.url}/api/sessions?cachebust=123`);
    expect(api.status).toBe(200);
    expect(api.headers.get("content-type")).toContain("application/json");
  });
});
