import React, { useEffect, useState } from "react";
import { Box } from "ink";
import { Pane } from "./Pane.js";
import type { ClaudePtyTransport } from "../pty-transport.js";

export interface PaneSource {
  sessionId: string;
  title: string;
  transport: ClaudePtyTransport;
}

interface PaneState {
  lines: string[];
  connected: boolean;
}

/**
 * Top-level multi-pane layout: one bordered Pane per PaneSource, laid out
 * side by side (row) so several live `claude` sessions can be watched at
 * once. Subscribes to each transport's raw output directly rather than
 * going through the DeckMessage line-buffering, so partial/streaming
 * terminal output still renders live.
 */
export function App({ sources }: { sources: PaneSource[] }) {
  const [state, setState] = useState<Record<string, PaneState>>(() =>
    Object.fromEntries(
      sources.map((s) => [s.sessionId, { lines: [], connected: true }]),
    ),
  );

  useEffect(() => {
    const disposers = sources.map((source) => {
      const onData = (chunk: string) => {
        setState((prev) => {
          const current = prev[source.sessionId] ?? { lines: [], connected: true };
          const appended = (current.lines.join("\n") + chunk).split(/\r?\n/);
          return {
            ...prev,
            [source.sessionId]: { ...current, lines: appended },
          };
        });
      };
      source.transport.onRawData(onData);
      return () => {
        setState((prev) => ({
          ...prev,
          [source.sessionId]: {
            lines: prev[source.sessionId]?.lines ?? [],
            connected: false,
          },
        }));
      };
    });

    const interval = setInterval(() => {
      setState((prev) => {
        const next = { ...prev };
        for (const source of sources) {
          const connected = source.transport.isConnected(source.sessionId);
          if (next[source.sessionId] && next[source.sessionId].connected !== connected) {
            next[source.sessionId] = { ...next[source.sessionId], connected };
          }
        }
        return next;
      });
    }, 500);

    return () => {
      clearInterval(interval);
      disposers.forEach((d) => d());
    };
  }, [sources]);

  return (
    <Box flexDirection="row" gap={1}>
      {sources.map((source) => {
        const paneState = state[source.sessionId] ?? { lines: [], connected: true };
        return (
          <Pane
            key={source.sessionId}
            title={source.title}
            lines={paneState.lines}
            connected={paneState.connected}
          />
        );
      })}
    </Box>
  );
}
