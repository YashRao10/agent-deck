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

---

**2026-09-16** (MacBook session, after a portfolio-readiness pass — LICENSE, CI, lint, unit-tested dashboard logic, a real demo GIF of `watch`):

> do we want to keep developing this and adding onto this and maybe we can change the name to Multi Agent Command Deck (MACD)

Flagged before proceeding: `macd` collides with an existing, well-known finance term (Moving Average Convergence/Divergence) and an actual npm package of that exact name. User's call after hearing the tradeoff:

> Rename to MACD anyway

Resolution: display name "Multi-Agent Command Deck (MACD)"; GitHub repo and CLI command renamed to `macd` (no real collision — the existing npm `macd` package ships no CLI binary); npm package name `multi-agent-command-deck` instead (the literal `macd` name is unavailable on the registry). Full rename across repo/package/CLI/docs/dashboard branding, sequenced after the Windows session's in-flight crash-status PR to avoid a mid-rebase collision.
