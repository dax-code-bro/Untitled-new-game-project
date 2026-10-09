#!/bin/sh
# Swap suffixed builds (queue.sh with SUFFIX) in for the live caches: cache/<id><suffix>.json/.bin
# -> cache/<id>.json/.bin (each pair renamed back to back, so a scene loading meanwhile sees either
# the old or the new character). The old caches are kept as cache/<id>.prev.* until --clean.
#   scenes/lib/humans/offline/swap.sh _r1 [--clean]
suf=$1
here=$(dirname "$0")/../cache
for j in "$here"/*"$suf".json; do
  [ -f "$j" ] || continue
  id=$(basename "$j" .json); id=${id%"$suf"}
  b="$here/$id$suf.bin"
  [ -f "$b" ] || { echo "skip $id (no .bin)"; continue; }
  if [ -f "$here/$id.json" ]; then mv "$here/$id.json" "$here/$id.prev.json"; mv "$here/$id.bin" "$here/$id.prev.bin"; fi
  mv "$b" "$here/$id.bin"; mv "$j" "$here/$id.json"
  echo "swapped $id"
done
if [ "$2" = "--clean" ]; then rm -f "$here"/*.prev.json "$here"/*.prev.bin; fi
