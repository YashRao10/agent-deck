#!/bin/bash
# Scripted sequence for the README demo recording (see CONTRIBUTING.md).
# Spawns a two-pane `watch` session, then uses `send` from a second process
# to route a message into a live pane, so the recording shows the actual
# cross-process orchestration the split-pane view exists to visualize.
set -e
cd "$(dirname "$0")/.."
export BASH_SILENCE_DEPRECATION_WARNING=1

node dist/cli.js watch demo-a demo-b --command bash &
WATCH_PID=$!

sleep 3
node dist/cli.js send demo-a 'echo "hello from another terminal"'
sleep 2.5
node dist/cli.js send demo-b 'echo "routed through macd send"'
sleep 3.5

kill -INT "$WATCH_PID"
wait "$WATCH_PID" 2>/dev/null || true
