# PROMPT_INPUTS.md — agent-deck

Raw verbatim log of the prompts that shaped this project. Append, never edit past entries.

---

**2026-09-15** (Windows session, mid-conversation after the Robinhood/financials dive):

> lets start the multi claude terminal project as the next thing after we finished spec conformance evals

Clarifying answers given:
- Concept: "I like 1 and 2 together" — a terminal multiplexer for running multiple Claude sessions side-by-side, combined with an orchestration framework for coordinating them on subtasks (not just a UI).
- Purpose: Portfolio project (public, career-facing, same track as spec-conformance-evals / mcp-ratchet / dal-c).
- Stack: New repo, TypeScript/Node CLI.

Follow-up:
> basicallly you are the main and then laptoip is your partner go ahead with the next project and you can delegate

Decision: dogfood the real Windows-main / MacBook-worker cross-session setup as the reference use case for the tool. Split work along a real technical seam — orchestration/session-registry core (no native deps, built on Windows) vs. PTY + multi-pane terminal rendering layer (delegated to MacBook, since node-pty native builds are far less painful on macOS/Unix than Windows).
