#!/bin/bash
# Episode 1 style frames (PRODUCTION_PLAN.md, stage A): renders the five
# live-action style frames at native 4K with the production command, stamps
# each with a PROVISIONAL slate (no design in them is approved yet) and writes
# a small JPEG preview of each.
#
#   cd dragons-kingdom && bash episodes/s01e01/style-frames/make.sh          # render + stamp
#   bash episodes/s01e01/style-frames/make.sh --stamp-only                   # re-stamp existing renders
#
# The 4K PNGs (~13-19 MB each) are git-ignored; git keeps this script, the
# README and the 1920-wide JPEG previews. Rendering all five takes ~15-20 min
# on a 4-core CPU-only machine (see README.md, "Live-action style frames").
set -euo pipefail
cd "$(dirname "$0")/../../.."
DIR=episodes/s01e01/style-frames
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
FRAMES=(
  "F1_prologue-dawn|style-f1-prologue|3|P-03 / P-06  Prologue, dawn sea"
  "F2_verdor-riding-grounds|style-f2-riding-grounds|2|1B-02 / 1B-04  Verdor riding grounds"
  "F3_flight-off-verdor|style-f3-flight|2|1C-11 / 1D  In flight off Verdor"
  "F4_birthing-chamber|style-f4-birthing-chamber|2|1A-12 / 1A-17  Birthing chamber"
  "F5_cling-square|style-f5-cling-square|2|3B-02 / 3B-08  Cling square"
)
for f in "${FRAMES[@]}"; do
  IFS='|' read -r name scene t label <<<"$f"
  if [[ "${1:-}" != "--stamp-only" ]]; then
    node render/render.mjs --still "scenes/lookdev/$scene.js" --time "$t" --preset final --png "$DIR/$name.png"
  fi
  # the slate: bottom-left, small, on a translucent band (a 4K frame stays 3840x2160)
  ffmpeg -v error -y -i "$DIR/$name.png" -vf "drawbox=x=40:y=ih-110:w=1520:h=70:color=black@0.55:t=fill,drawtext=fontfile=$FONT:text='PROVISIONAL  -  $label  -  designs not approved':x=60:y=h-95:fontsize=40:fontcolor=white@0.9" "$DIR/${name}_PROVISIONAL.png"
  ffmpeg -v error -y -i "$DIR/${name}_PROVISIONAL.png" -vf scale=1920:-1 -q:v 3 "$DIR/${name}_PROVISIONAL_preview.jpg"
done
echo "style frames in $DIR"
