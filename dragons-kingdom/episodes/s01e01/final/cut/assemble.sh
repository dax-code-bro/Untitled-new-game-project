#!/bin/bash
# Episode 1 draft cut - assemble + check in one go (what each render batch ends with):
#   1. what is still to render (render-shots --dry-run: missing or stale shots)
#   2. the cut (make-cut.mjs: rendered shots, slates for the rest, the voice takes at their cue times)
#   3. its length and streams (ffprobe)
#   4. review sheets across the cut (cut-sheet.mjs, 2 frames per shot) - LOOK at them
#   5. the voice sync check (check-sync.py: speech starts at every subtitle cue)
#   6. the edit check of every set (previs --cuts: jump cuts, crossed eye-lines) - from the specs, no render
#
#   bash episodes/s01e01/final/cut/assemble.sh <dailies work folder> [<review folder>]
#   (the work folder render-shots.mjs --work wrote: <work>/shots/<job>.mp4 + .json)
# Run it when no renders are running if memory is short: ffmpeg with ~76 inputs takes ~2 GB.
set -e
WORK=${1:?usage: assemble.sh <work folder> [<review folder>]}
REVIEW=${2:-$WORK/cutrev}
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
cd "$ROOT"
OUT=episodes/s01e01/final/cut/DragonsKingdom_S01E01_draft-cut_PROLOGUE-TITLE-1A.mp4
node scenes/lib/director/tools/render-shots.mjs --work "$WORK" --redo-on shot --dry-run 2>&1 | tail -8
node episodes/s01e01/final/cut/make-cut.mjs --shots "$WORK/shots" 2>&1 | grep -v "^  review" | tail -6
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,nb_frames -of compact "$OUT"
rm -rf "$REVIEW"; node scenes/lib/director/tools/cut-sheet.mjs --cut "$OUT" --out "$REVIEW" --at 0.2,0.75 --per-page 20 | tail -9
python3 episodes/s01e01/final/cut/check-sync.py "$OUT" | tail -1
for SET in SEA_COAST_DAWN PROLOGUE_VISTAS VERDOR_GROUNDS BIRTHING_CHAMBER PALACE_CORRIDOR ALEXANDRIA_ROOM; do
  node scenes/lib/director/tools/previs.mjs --set $SET --cuts 2>/dev/null | grep -B1 -E "^    (JUMP|the eye-line)" | grep -v "accepted:" | grep -v -- "--" | sed "s/^/  $SET  /"
done
