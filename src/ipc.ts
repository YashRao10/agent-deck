import { createServer, connect } from "node:net";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/**
 * Cross-process delivery for a single live `watch` pane. Each spawned pane
 * listens on its own local socket; a `send` invocation from another terminal
 * connects, writes one line, and disconnects. Deliberately just newline-
 * delimited text — the router/CLI layer is what turns that into a DeckMessage.
 *
 * `net.Server.listen(path)` means two different things depending on OS: a
 * real Unix domain socket file on macOS/Linux, but a Windows named pipe on
 * Windows — and named pipes live in a global `\\.\pipe\` namespace, not on
 * the filesystem, so passing an arbitrary directory path there fails with
 * EACCES. socketPathFor branches on `process.platform` so callers never have
 * to think about the difference; only the two isWindowsPipe checks below
 * (skip mkdir/rm — there's no on-disk file to create or clean up) know it.
 */

const isWindowsPipe = process.platform === "win32";

export function socketPathFor(sessionId: string): string {
  if (isWindowsPipe) {
    return `\\\\.\\pipe\\macd-${sessionId}`;
  }
  return join(homedir(), ".macd", "sockets", `${sessionId}.sock`);
}

export interface SessionSocketServer {
  socketPath: string;
  close(): Promise<void>;
}

export async function startSessionSocketServer(
  socketPath: string,
  onMessage: (body: string) => void,
): Promise<SessionSocketServer> {
  if (!isWindowsPipe) {
    await mkdir(dirname(socketPath), { recursive: true });
    await rm(socketPath, { force: true });
  }

  const server = createServer((socket) => {
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.length === 0) continue;
        onMessage(line);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });

  return {
    socketPath,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }).then(() => (isWindowsPipe ? undefined : rm(socketPath, { force: true }))),
  };
}

export function sendToSessionSocket(socketPath: string, body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    socket.once("connect", () => {
      socket.end(`${body}\n`);
    });
    socket.once("error", (err) => {
      socket.destroy();
      reject(err);
    });
    socket.once("close", () => resolve());
  });
}
