import { randomUUID } from "node:crypto";
import * as pty from "node-pty";
import type { DeckMessage, Transport } from "./types.js";

export interface ClaudePtyTransportOptions {
  /** Session id this transport represents (matches an AgentSession.id). */
  sessionId: string;
  /** Command to spawn — defaults to `claude`. Override in tests. */
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
}

/**
 * Implements Transport by spawning a real `claude` process in a PTY and
 * treating each DeckMessage's body as a line of input typed into it.
 * Raw PTY output is buffered per-line and re-wrapped as DeckMessages coming
 * "from" this session, so the router and any renderer only ever see
 * DeckMessage, never raw terminal bytes.
 */
export class ClaudePtyTransport implements Transport {
  private readonly ptyProcess: pty.IPty;
  private readonly handlers: Array<(message: DeckMessage) => void> = [];
  private lineBuffer = "";
  private connected = true;

  constructor(private readonly options: ClaudePtyTransportOptions) {
    this.ptyProcess = pty.spawn(options.command ?? "claude", options.args ?? [], {
      name: "xterm-color",
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd: options.cwd ?? process.cwd(),
      env: process.env as Record<string, string>,
    });

    this.ptyProcess.onData((chunk) => this.handleChunk(chunk));
    this.ptyProcess.onExit(() => {
      this.connected = false;
    });
  }

  /** Raw output stream, for a renderer that wants to draw the live pane. */
  onRawData(handler: (chunk: string) => void): void {
    this.ptyProcess.onData(handler);
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
  }

  private handleChunk(chunk: string): void {
    this.lineBuffer += chunk;
    const lines = this.lineBuffer.split(/\r?\n/);
    this.lineBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length === 0) continue;
      this.emit(line);
    }
  }

  private emit(body: string): void {
    const message: DeckMessage = {
      id: randomUUID(),
      from: this.options.sessionId,
      to: "main",
      body,
      sentAt: new Date().toISOString(),
    };
    for (const handler of this.handlers) handler(message);
  }

  async send(message: DeckMessage): Promise<void> {
    if (!this.connected) {
      throw new Error(`Session "${this.options.sessionId}" is not connected`);
    }
    this.ptyProcess.write(`${message.body}\r`);
  }

  onMessage(handler: (message: DeckMessage) => void): void {
    this.handlers.push(handler);
  }

  isConnected(sessionId: string): boolean {
    return sessionId === this.options.sessionId && this.connected;
  }

  kill(): void {
    this.ptyProcess.kill();
    this.connected = false;
  }
}
