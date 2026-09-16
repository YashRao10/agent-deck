# Contributing

`macd` (Multi-Agent Command Deck) is a solo project, built as its own dogfood
case (see the README's Architecture section) — but issues and PRs are
welcome.

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

## Regenerating the README demo GIF

`docs/watch-demo.gif` is `scripts/record-demo.sh` recorded with
[asciinema](https://asciinema.org) and rendered with
[agg](https://github.com/asciinema/agg) (`brew install asciinema agg`):

```bash
npm run build
asciinema rec --command "./scripts/record-demo.sh" --window-size 100x24 \
  --idle-time-limit 2 --overwrite /tmp/watch-demo.cast
agg --theme github-dark --idle-time-limit 1.5 --speed 1.3 \
  /tmp/watch-demo.cast docs/watch-demo.gif
```

`--window-size` other than roughly 100x24 has produced blank frames out of
`agg` in testing — if you change it, verify the output actually has content
before committing. The committed GIF is also cropped to trim the mostly-empty
bottom of the terminal (Pillow, frame by frame) — optional, but worth doing
if you want a tighter file.
