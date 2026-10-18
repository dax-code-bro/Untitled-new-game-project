#!/usr/bin/env bash
# Continue rendering Dragon's Kingdom Episode 1 on a Mac or Linux PC:
#   1. git pull (the newest scene files from the cloud)   - skip with --no-pull
#   2. node pc/build-caches.mjs (rebuilds a cache only if the pull changed its code)
#   3. node render/episode.mjs (renders what is ready, scene by scene; Ctrl+C stops cleanly)
# The computer is kept awake while it runs (caffeinate on macOS, systemd-inhibit on Linux).
# Extra words go to the episode runner:  bash pc/render-episode.sh --status | --max-hours 8 | ...
set -u
PROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJ" || exit 1
for d in "$PROJ/pc/tools/node/bin" "$PROJ/pc/tools/ffmpeg/bin"; do [ -d "$d" ] && PATH="$d:$PATH"; done
export PATH
command -v node >/dev/null || { echo "Node.js is missing: run bash pc/setup.sh first"; exit 1; }
PULL=1; STATUS=0; ARGS=()
for a in "$@"; do
  case "$a" in --no-pull) PULL=0;; --status) STATUS=1; ARGS+=("$a");; *) ARGS+=("$a");; esac
done
if [ "$PULL" = 1 ] && [ "$STATUS" = 0 ] && command -v git >/dev/null; then
  echo "== getting the newest scene files (git pull)"
  git pull --no-rebase --ff-only origin "$(git rev-parse --abbrev-ref HEAD)" || echo "   git pull did not work (offline?) - rendering what is here"
fi
if [ "$STATUS" = 0 ]; then
  echo "== checking the caches"
  node pc/build-caches.mjs || echo "   some caches are not ready - the episode runner will say what is missing"
fi
AWAKE=()
if [ "$STATUS" = 0 ]; then
  if command -v caffeinate >/dev/null; then AWAKE=(caffeinate -i)
  elif command -v systemd-inhibit >/dev/null; then AWAKE=(systemd-inhibit --what=sleep:idle --why="rendering Dragon's Kingdom")
  fi
fi
exec ${AWAKE[@]+"${AWAKE[@]}"} node render/episode.mjs ${ARGS[@]+"${ARGS[@]}"}
