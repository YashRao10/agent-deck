export type SessionStatus = "idle" | "busy" | "offline";

export interface AgentSession {
  id: string;
  name: string;
  host: string;
  status: SessionStatus;
  lastSeen: string;
  /** Unix socket path a `watch` pane listens on, if this session is a live local pane. */
  socketPath?: string;
}

export interface DeckMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  sentAt: string;
}

export interface Task {
  id: string;
  assignedTo: string;
  description: string;
  status: "pending" | "in_progress" | "done" | "failed";
  createdAt: string;
  updatedAt: string;
}

/**
 * A Transport moves DeckMessages to and from a real session (a spawned PTY
 * running `claude`, a Remote Control bridge, etc). The orchestration core
 * only depends on this interface, never on how a session is actually hosted.
 */
export interface Transport {
  send(message: DeckMessage): Promise<void>;
  onMessage(handler: (message: DeckMessage) => void): void;
  isConnected(sessionId: string): boolean;
}
