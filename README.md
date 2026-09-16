# agent-deck

A terminal multiplexer and orchestration layer for running a **fleet of Claude
Code sessions** as coordinated workers. Split panes watch several agents at
once, and a message/task router underneath lets one "main" session delegate
work to others and track what came back.

This project is its own dogfood case. It's being built across two real
machines: a Windows session acting as orchestrator ("main") and a MacBook
session acting as a worker, using exactly the kind of cross-session
delegation `agent-deck` is meant to formalize and visualize.

![agent-deck dashboard showing two sessions, one busy and one idle](docs/dashboard-screenshot.jpg)

## Architecture

Two layers, deliberately decoupled by a `Transport` interface
(`src/types.ts`):

- **Orchestration core** (`src/registry.ts`, `src/router.ts`, `src/cli.ts`).
  Session registry, message routing, task lifecycle. No native dependencies,
  no terminal rendering. Works anywhere Node runs.
- **Terminal/PTY layer** (`src/pty-transport.ts`, `src/ui/`, `src/tui.tsx`).
  Spawns real `claude` processes via `node-pty` (`ClaudePtyTransport`),
  renders them as split panes with `ink` (`Pane`/`App`), and implements
  `Transport` so the router can move messages in and out of each pane. This
  layer is platform-sensitive (native PTY bindings build far more easily on
  macOS/Linux than Windows), so it was built and verified on the MacBook
  side first.

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

Session registry, message router, PTY/rendering layer, cross-process
messaging, and a read-only dashboard are all implemented and tested
(`npm test`, 27 tests passing).

- `agent-deck watch <names...>` spawns a real process per named session in a
  `node-pty` pseudo-terminal, renders them side by side with an `ink`
  split-pane UI, and registers each one in the same `SessionRegistry` store
  that `register`/`list` use. Sessions are marked `offline`, not removed,
  when their `watch` process shuts down, so `list` still shows history.
- `agent-deck send <session-id> <message>` routes a message into a live pane
  from a second terminal or process. Each spawned pane opens a small unix
  socket (a named pipe on Windows); `send` connects to it, and the pane's
  process runs the delivered text through its own `MessageRouter.sendMessage`,
  which writes it into the pane's `ClaudePtyTransport` as a line of input.
- `agent-deck dashboard` is a small `node:http` server (no new dependencies)
  that serves a live-updating HTML table of the registry, so the fleet can be
  shown in a browser without cloning the repo and running the CLI. It only
  reads `~/.agent-deck/sessions.json` on every request and has no
  send/control endpoint. The terminal UI stays the one real control surface;
  the dashboard is a secondary visualization on top of it, not a second
  implementation of it.

**Note on install:** `node-pty` ships a native `spawn-helper` binary that
needs its executable bit set by its postinstall script. If your npm/CI
config blocks package install scripts (some sandboxes do by default), you
may need to explicitly allow them for `node-pty`, or `chmod +x` the
`spawn-helper` binaries under `node_modules/node-pty/prebuilds/*` yourself.

## Usage

```bash
npm install
npm run build

# orchestration core
node dist/cli.js register "windows-main" --host windows
node dist/cli.js list

# PTY + multi-pane UI: spawns one `claude` process per name, side by side
node dist/cli.js watch worker-1 worker-2
# or point it at any command for local testing:
node dist/cli.js watch a b --command bash

# from a second terminal, route a message into a live pane
node dist/cli.js send worker-1 "check CI"

# read-only web view of the registry (defaults to http://127.0.0.1:4317)
node dist/cli.js dashboard
```

## Development

```bash
npm install
npm run dev    # run the CLI via tsx, no build step
npm test       # vitest
```
