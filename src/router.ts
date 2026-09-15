import { randomUUID } from "node:crypto";
import type { DeckMessage, Task, Transport } from "./types.js";
import type { SessionRegistry } from "./registry.js";

/**
 * Routes tasks and messages to sessions via whatever Transport is registered
 * for them. This is the piece a real multi-pane terminal (node-pty spawning
 * `claude` processes, or a Remote Control bridge) plugs into — the router
 * never spawns or renders anything itself.
 */
export class MessageRouter {
  private transports = new Map<string, Transport>();
  private tasks = new Map<string, Task>();

  constructor(private readonly registry: SessionRegistry) {}

  registerTransport(sessionId: string, transport: Transport): void {
    this.transports.set(sessionId, transport);
    transport.onMessage((message) => this.handleIncoming(message));
  }

  private handleIncoming(message: DeckMessage): void {
    this.registry.markStatus(message.from, "idle");
  }

  async sendMessage(from: string, to: string, body: string): Promise<DeckMessage> {
    const transport = this.transports.get(to);
    if (!transport) {
      throw new Error(`No transport registered for session "${to}"`);
    }
    if (!transport.isConnected(to)) {
      throw new Error(`Session "${to}" is not connected`);
    }
    const message: DeckMessage = {
      id: randomUUID(),
      from,
      to,
      body,
      sentAt: new Date().toISOString(),
    };
    this.registry.markStatus(to, "busy");
    await transport.send(message);
    return message;
  }

  assignTask(assignedTo: string, description: string): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      assignedTo,
      description,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  updateTaskStatus(taskId: string, status: Task["status"]): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown task "${taskId}"`);
    task.status = status;
    task.updatedAt = new Date().toISOString();
  }

  listTasks(): Task[] {
    return [...this.tasks.values()];
  }
}
