#!/bin/bash
# Episode 1 draft cut - assemble + check in one go (what each render batch ends with):
#   1. what is still to render (render-shots --dry-run: missing or stale shots)
#   2. the cut (make-cut.mjs: rendered shots, slates for the rest, the voice takes at their cue times)
#   3. its length and streams (ffprobe)
#   4. review sheets across the cut (cut-sheet.mjs, 2 frames per shot) - LOOK at them
#   5. the voice sync check (check-sync.py: speech starts at every subtitle cue)
#   6. the edit check of every set (previs --cuts: jump cuts, crossed eye-lines) - from the specs, no render
#
#   bash episodes/s01e01/final/cut/assemble.sh [--edl edl-1B] [<dailies work folder> [<review folder>]]
#   (the work folder render-shots.mjs --work wrote: <work>/shots/<job>.mp4 + .json; default $DK_DIRECTOR_WORK,
#   else output/director/draft; --edl picks the part: edl = PROLOGUE+TITLE+1A, edl-1B = 1B, ...)
# Run it when no renders are running if memory is short: ffmpeg with ~76 inputs takes ~2 GB.
set -e
EDL=edl
if [ "$1" = "--edl" ]; then EDL=${2%.json}; shift 2; fi
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
WORK=${1:-${DK_DIRECTOR_WORK:-$ROOT/output/director/draft}}
REVIEW=${2:-$WORK/cutrev-$EDL}
cd "$ROOT"
[ -f "episodes/s01e01/final/cut/$EDL.json" ] || { echo "no edit list cut/$EDL.json (scenes/lib/director/tools/build-shots.mjs writes them)"; exit 1; }
# the cut's file name: the scenes of the edit list joined with '-' (as make-cut.mjs names it)
TAG=$(node -e "const e=require('./episodes/s01e01/final/cut/$EDL.json');console.log([...new Set(e.shots.map(s=>s.scene))].join('-'))")
OUT=episodes/s01e01/final/cut/DragonsKingdom_S01E01_draft-cut_$TAG.mp4
IDS=$(node -e "const e=require('./episodes/s01e01/final/cut/$EDL.json');console.log(e.shots.map(s=>s.job).join(','))")
node scenes/lib/director/tools/render-shots.mjs --work "$WORK" --only "$IDS" --redo-on shot --dry-run 2>&1 | tail -8
node episodes/s01e01/final/cut/make-cut.mjs --edl "$EDL" --shots "$WORK/shots" 2>&1 | grep -v "^  review" | tail -6
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,nb_frames -of compact "$OUT"
rm -rf "$REVIEW"; node scenes/lib/director/tools/cut-sheet.mjs --cut "$OUT" --out "$REVIEW" --at 0.2,0.75 --per-page 20 | tail -9
python3 episodes/s01e01/final/cut/check-sync.py "$OUT" | tail -1
for SET in SEA_COAST_DAWN PROLOGUE_VISTAS VERDOR_GROUNDS BIRTHING_CHAMBER PALACE_CORRIDOR ALEXANDRIA_ROOM; do
  # flags not yet accepted (spec.cutsOk), each under its shot pair
  node scenes/lib/director/tools/previs.mjs --set $SET --cuts 2>/dev/null | awk -v set="$SET" '/^[^ ]/ { hdr = $0; next } /^    (JUMP|the eye-line)/ && !/accepted:/ { if (hdr != "") { print "  " set "  " hdr; hdr = "" } print "  " set "  " $0 }'
done
