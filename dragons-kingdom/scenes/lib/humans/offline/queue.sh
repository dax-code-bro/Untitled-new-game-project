#!/bin/sh
# Build characters one at a time in the given order (build.py --only builds in cast order),
# skipping ids whose cache is newer than a stamp file - so a queue can be stopped and restarted
# at any time (e.g. after a container restart) without redoing finished characters. Several
# queues may run at once over the same ids (in different orders): an id being built holds a
# lock directory cache/<id>.lock (remove stale ones after a crash: rmdir cache/*.lock).
#   PY=<bpy python> [SUFFIX=_r1] scenes/lib/humans/offline/queue.sh <stamp-file> id1 id2 ...
# (run from dragons-kingdom/; the stamp is any file whose mtime marks "built with current code")
# SUFFIX builds cache/<id><suffix>.* next to the live caches (scenes rendering meanwhile keep the
# old ones); swap them in afterwards with offline/swap.sh <suffix>.
stamp=$1; shift
here=$(dirname "$0")
for id in "$@"; do
  json="$here/../cache/$id${SUFFIX:-}.json"
  if [ -f "$json" ] && [ "$json" -nt "$stamp" ]; then echo "== $id (up to date)"; continue; fi
  lock="$here/../cache/$id${SUFFIX:-}.lock"
  if ! mkdir "$lock" 2>/dev/null; then echo "== $id (being built by another queue)"; continue; fi
  if [ -n "${SUFFIX:-}" ]; then
    "$PY" -I "$here/build.py" --only "$id" --suffix "$SUFFIX" || echo "FAILED $id"
  else
    "$PY" -I "$here/build.py" --only "$id" || echo "FAILED $id"
  fi
  rmdir "$lock"
done
