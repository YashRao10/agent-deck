# Contributing

`agent-deck` is a solo project, built as its own dogfood case (see the
README's Architecture section) — but issues and PRs are welcome.

## Setup

```bash
npm install
npm run build   # or `npm run dev` to run the CLI via tsx, no build step
```

**Note on `node-pty`:** it ships a native `spawn-helper` binary that needs
its executable bit set by a postinstall script. If your npm/CI config blocks
package install scripts, allow them for `node-pty` explicitly, or
`chmod +x node_modules/node-pty/prebuilds/*/spawn-helper` yourself.

## Before opening a PR

```bash
npm run lint
npm run build
npm test
```

All three run in CI (`.github/workflows/ci.yml`) on every push and PR; a red
check means one of them failed.

## Conventions

- One PR per concern — a feature and an unrelated cleanup are two PRs, not
  one. Look at recent merged PRs for the level of granularity this repo uses.
- New behavior gets a test alongside it. Pure logic (registry, task store,
  message log, CLI commands) is straightforwardly unit-testable with vitest.
  The dashboard's client-side rendering runs as an inline `<script>` inside
  `src/dashboard.ts`'s HTML template — genuine DOM logic there can't be unit
  tested directly, but any *pure* piece of it (bucketing math, dedup logic)
  should be mirrored into `src/dashboard-logic.ts` and tested there, per the
  comments in `dashboard.ts` pointing at it.
- No new dependencies for something a few lines of code can do — the
  dashboard server, for example, is deliberately built on `node:http` with
  no framework.
