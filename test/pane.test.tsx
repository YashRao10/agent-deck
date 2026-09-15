import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { Pane } from "../src/ui/Pane.js";

describe("Pane", () => {
  it("renders the title and connection state", () => {
    const { lastFrame } = render(<Pane title="worker-1" lines={["hello"]} connected />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("worker-1");
    expect(frame).toContain("hello");
  });

  it("shows a placeholder when there is no output yet", () => {
    const { lastFrame } = render(<Pane title="worker-1" lines={[]} connected />);
    expect(lastFrame()).toContain("no output yet");
  });

  it("trims to the last maxLines entries", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line-${i}`);
    const { lastFrame } = render(<Pane title="worker-1" lines={lines} connected maxLines={3} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("line-9");
    expect(frame).not.toContain("line-0");
  });
});
