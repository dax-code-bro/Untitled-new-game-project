#!/bin/sh
# Build characters one at a time in the given order (build.py --only builds in cast order),
# skipping ids whose cache is newer than a stamp file - so a queue can be stopped and restarted
# at any time (e.g. after a container restart) without redoing finished characters.
#   PY=<bpy python> scenes/lib/humans/offline/queue.sh <stamp-file> id1 id2 ...
# (run from dragons-kingdom/; the stamp is any file whose mtime marks "built with current code")
stamp=$1; shift
here=$(dirname "$0")
for id in "$@"; do
  json="$here/../cache/$id.json"
  if [ -f "$json" ] && [ "$json" -nt "$stamp" ]; then echo "== $id (up to date)"; continue; fi
  "$PY" -I "$here/build.py" --only "$id" || echo "FAILED $id"
done
