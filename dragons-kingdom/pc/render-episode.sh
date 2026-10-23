#!/usr/bin/env bash
# Continue rendering Dragon's Kingdom Episode 1 on a Mac or Linux PC:
#   1. git pull (the newest scene files from the cloud)   - skip with --no-pull
#   2. node pc/build-caches.mjs (rebuilds a cache only if the pull changed its code; also fetches
#      the sound once the cloud has published it - pc/MANIFEST.md, "Sound")
#   3. node render/episode.mjs (renders what is ready, scene by scene; Ctrl+C stops cleanly)
# The computer is kept awake while it runs (caffeinate on macOS, systemd-inhibit on Linux).
# Extra words go to the episode runner:  bash pc/render-episode.sh --status | --max-hours 8 | ...
# GPU check instead of rendering:        bash pc/render-episode.sh --gpu-check [gpu-check options]
# Logs for the Claude session:           bash pc/render-episode.sh --send-logs   (one file: pc/logs/send-to-claude-<date>.txt)
set -u
PROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJ" || exit 1
for d in "$PROJ/pc/tools/node/bin" "$PROJ/pc/tools/ffmpeg/bin"; do [ -d "$d" ] && PATH="$d:$PATH"; done
export PATH
command -v node >/dev/null || { echo "Node.js is missing: run bash pc/setup.sh first"; exit 1; }
case " $* " in *" --send-logs "*) exec node pc/collect-logs.mjs;; esac
PULL=1; STATUS=0; GPUCHECK=0; ARGS=()
for a in "$@"; do
  case "$a" in --no-pull) PULL=0;; --gpu-check) GPUCHECK=1;; --status) STATUS=1; ARGS+=("$a");; *) ARGS+=("$a");; esac
done
[ "$GPUCHECK" = 1 ] && STATUS=0
if [ "$PULL" = 1 ] && [ "$STATUS" = 0 ] && [ "$GPUCHECK" = 0 ] && command -v git >/dev/null; then
  echo "== getting the newest scene files (git pull)"
  git pull --no-rebase --ff-only origin "$(git rev-parse --abbrev-ref HEAD)" || echo "   git pull did not work (offline?) - rendering what is here"
fi
if [ "$STATUS" = 0 ] && [ "$GPUCHECK" = 0 ]; then
  echo "== checking the caches"
  node pc/build-caches.mjs || echo "   some caches are not ready - the episode runner will say what is missing"
fi
# keep the computer awake; only use systemd-inhibit if this session is allowed to (else run without)
AWAKE=()
if [ "$STATUS" = 0 ]; then
  if command -v caffeinate >/dev/null; then AWAKE=(caffeinate -i)
  elif command -v systemd-inhibit >/dev/null && systemd-inhibit --what=sleep:idle --why="test" true >/dev/null 2>&1; then
    AWAKE=(systemd-inhibit --what=sleep:idle --why="rendering Dragon's Kingdom")
  fi
fi
if [ "$GPUCHECK" = 1 ]; then
  echo "== GPU check: finds the graphics card, renders one 4K test frame, estimates Episode 1"
  exec ${AWAKE[@]+"${AWAKE[@]}"} node render/gpu-check.mjs ${ARGS[@]+"${ARGS[@]}"}
fi
exec ${AWAKE[@]+"${AWAKE[@]}"} node render/episode.mjs ${ARGS[@]+"${ARGS[@]}"}
