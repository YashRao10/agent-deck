# agent-deck

A terminal multiplexer and orchestration layer for running a **fleet of Claude
Code sessions** as coordinated workers — split panes to watch several agents
at once, plus a message/task router underneath so one "main" session can
delegate work to others and track what came back.

This project is its own dogfood case: it's being built across two real
machines, a Windows session acting as orchestrator ("main") and a MacBook
session acting as a worker, using exactly the kind of cross-session
delegation `agent-deck` is meant to formalize and visualize.

## Architecture

Two layers, deliberately decoupled by a `Transport` interface
(`src/types.ts`):

- **Orchestration core** (`src/registry.ts`, `src/router.ts`, `src/cli.ts`) —
  session registry, message routing, task lifecycle. No native dependencies,
  no terminal rendering. Works anywhere Node runs.
- **Terminal/PTY layer** (in progress) — spawns real `claude` processes via
  `node-pty`, renders them as split panes, and implements `Transport` so the
  router can move messages in and out of each pane. This layer is
  platform-sensitive (native PTY bindings build far more easily on macOS/Linux
  than Windows), so it's being built and verified on the MacBook side first.

```
┌─────────────────────────────┐
│   Orchestration core        │  registry + router + CLI (this side, Windows)
│   (Transport interface)     │
└──────────────┬──────────────┘
               │ implements
┌──────────────┴──────────────┐
│   PTY / multi-pane UI layer │  node-pty + terminal rendering (MacBook side)
└──────────────────────────────┘
```

## Status

Early scaffold. Core session registry and message router are implemented
and tested (`npm test`). The PTY/rendering layer is the current work item.

## Usage (core, so far)

```bash
npm install
npm run build
node dist/cli.js register "windows-main" --host windows
node dist/cli.js list
```

## Development

```bash
npm install
npm run dev    # run the CLI via tsx, no build step
npm test       # vitest
```
