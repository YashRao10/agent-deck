import React from "react";
import { Box, Text } from "ink";

export interface PaneProps {
  title: string;
  lines: string[];
  connected: boolean;
  maxLines?: number;
}

/**
 * Renders one session's tail of output inside a bordered box. Kept dumb on
 * purpose — it only ever shows the lines it's handed, scrollback trimming
 * happens upstream in the App's state.
 */
export function Pane({ title, lines, connected, maxLines = 20 }: PaneProps) {
  const visible = lines.slice(-maxLines);
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={connected ? "green" : "red"}
      width="100%"
      height={maxLines + 2}
      paddingX={1}
    >
      <Text bold color={connected ? "green" : "red"}>
        {title} {connected ? "●" : "○ offline"}
      </Text>
      {visible.length === 0 ? (
        <Text dimColor>(no output yet)</Text>
      ) : (
        visible.map((line, i) => <Text key={i}>{line}</Text>)
      )}
    </Box>
  );
}
