#!/bin/bash
# Episode 1 style frames (PRODUCTION_PLAN.md, stage A): renders the five live-action style frames
# at native 4K with the production command (--preset final, the 8-sub-frame film finish), stamps
# each with a PROVISIONAL slate (no design in them is approved yet) and writes a 1920-wide JPEG
# preview of each next to this script.
#
#   cd dragons-kingdom && bash episodes/s01e01/style-frames/make.sh            # render + stamp all
#   bash episodes/s01e01/style-frames/make.sh F2 F5                            # only some frames
#   bash episodes/s01e01/style-frames/make.sh --stamp-only                     # re-stamp existing renders
#
# The 4K PNGs (~15-25 MB each) and the render logs go to output/lookdev/style-frames/ (git-ignored);
# git keeps this script, the README and the PROVISIONAL JPEG previews. Each render's log ends with
# the renderer's own timing line ("... ms render, ... s total").
set -euo pipefail
cd "$(dirname "$0")/../../.."
DIR=episodes/s01e01/style-frames
OUT=output/lookdev/style-frames
mkdir -p "$OUT"
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
FRAMES=(
  "F1|F1_prologue-dawn|style-f1-prologue|3|P-03 / P-06  Prologue, dawn sea"
  "F2|F2_verdor-riding-grounds|style-f2-riding-grounds|2|1B-02 / 1B-04  Verdor riding grounds"
  "F3|F3_flight-off-verdor|style-f3-flight|2|1C-11 / 1D  In flight off Verdor"
  "F4|F4_birthing-chamber|style-f4-birthing-chamber|2|1A-12 / 1A-17  Birthing chamber"
  "F5|F5_cling-square|style-f5-cling-square|2|3B-02 / 3B-08  Cling square"
)
STAMP_ONLY=0; ONLY=()
for a in "$@"; do if [[ "$a" == "--stamp-only" ]]; then STAMP_ONLY=1; else ONLY+=("$a"); fi; done
for f in "${FRAMES[@]}"; do
  IFS='|' read -r key name scene t label <<<"$f"
  if (( ${#ONLY[@]} )) && [[ ! " ${ONLY[*]} " =~ " $key " ]]; then continue; fi
  if (( ! STAMP_ONLY )); then
    node render/render.mjs --still "scenes/lookdev/$scene.js" --time "$t" --preset final --png "$OUT/$name.png" 2>&1 | tee "$OUT/$name.log"
  fi
  # the slate: bottom-left, small, on a translucent band (a 4K frame stays 3840x2160)
  ffmpeg -v error -y -i "$OUT/$name.png" -vf "drawbox=x=40:y=ih-110:w=1520:h=70:color=black@0.55:t=fill,drawtext=fontfile=$FONT:text='PROVISIONAL  -  $label  -  designs not approved':x=60:y=h-95:fontsize=40:fontcolor=white@0.9" "$OUT/${name}_PROVISIONAL.png"
  ffmpeg -v error -y -i "$OUT/${name}_PROVISIONAL.png" -vf scale=1920:-1 -q:v 3 "$DIR/${name}_PROVISIONAL_preview.jpg"
done
echo "4K frames in $OUT, previews in $DIR"
