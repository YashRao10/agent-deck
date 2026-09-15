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
- **Terminal/PTY layer** (`src/pty-transport.ts`, `src/ui/`, `src/tui.tsx`) —
  spawns real `claude` processes via `node-pty` (`ClaudePtyTransport`),
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

Core session registry, message router, and the PTY/rendering layer are all
implemented and tested (`npm test`, 15 tests passing). `agent-deck watch`
spawns a real process per named session in a `node-pty` pseudo-terminal and
renders them side by side with an `ink` split-pane UI (`ClaudePtyTransport`
implements `Transport`, so the router can address a live pane the same way
it addresses any other session).

`watch` now registers each spawned pane in the same `SessionRegistry` store
`register`/`list` use, and a new `agent-deck send <session-id> <message>`
command lets a second terminal/process route a message into a live pane.
Each spawned pane opens a small unix socket (`~/.agent-deck/sockets/<id>.sock`);
`send` connects to it, and the pane's process runs the delivered text through
its own `MessageRouter.sendMessage`, which writes it into the pane's
`ClaudePtyTransport` as a line of input. Sessions are marked `offline` (not
removed) when their `watch` process shuts down, so `list` still shows history.

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

# PTY + multi-pane UI — spawns one `claude` process per name, side by side
node dist/cli.js watch worker-1 worker-2
# or point it at any command for local testing:
node dist/cli.js watch a b --command bash

# from a second terminal, route a message into a live pane
node dist/cli.js send worker-1 "check CI"
```

## Development

```bash
npm install
npm run dev    # run the CLI via tsx, no build step
npm test       # vitest
```
