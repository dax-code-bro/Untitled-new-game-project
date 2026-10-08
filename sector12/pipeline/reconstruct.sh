#!/usr/bin/env bash
# Photos -> raw textured mesh, using only open-source tools.
#
#   ./reconstruct.sh <photos_dir> <work_dir>              # COLMAP + OpenMVS (default)
#   ./reconstruct.sh <photos_dir> <work_dir> --meshroom   # AliceVision Meshroom (one command)
#
# Output: the raw scan path is printed at the end. Feed it to process_scan.py.
#
# Needs on PATH: colmap + OpenMVS binaries (InterfaceCOLMAP, DensifyPointCloud, ReconstructMesh,
# RefineMesh, TextureMesh)  -- or --  meshroom_batch.
# Both run much faster with an NVIDIA GPU (CUDA).
# On Windows, run this from Git Bash or WSL, or use the Meshroom GUI instead.
#
# NOTE: tool command-line flags change between releases. This was written for COLMAP 3.9+ and
# OpenMVS 2.x. If a step fails, run that tool with --help and adjust the flags.
set -euo pipefail

if [ $# -lt 2 ]; then
  sed -n '2,15p' "$0"; exit 1
fi
PHOTOS="$(cd "$1" && pwd)"
WORK="$2"
MODE="${3:-colmap}"
mkdir -p "$WORK"
WORK="$(cd "$WORK" && pwd)"
N=$(find "$PHOTOS" -maxdepth 1 -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.tif' -o -iname '*.tiff' \) | wc -l)
echo "== $N photos in $PHOTOS"
[ "$N" -lt 20 ] && echo "!! fewer than 20 photos: reconstruction will likely fail or have holes"

if [ "$MODE" = "--meshroom" ]; then
  meshroom_batch --input "$PHOTOS" --output "$WORK/meshroom_out"
  echo "== raw scan: $WORK/meshroom_out/texturedMesh.obj"
  exit 0
fi

need() { command -v "$1" >/dev/null || { echo "missing tool: $1"; exit 1; }; }
for t in colmap InterfaceCOLMAP DensifyPointCloud ReconstructMesh RefineMesh TextureMesh; do need "$t"; done

DB="$WORK/colmap.db"
step() { echo; echo "== $1"; }

step "1/8 feature extraction"
colmap feature_extractor --database_path "$DB" --image_path "$PHOTOS" \
  --ImageReader.single_camera 1 --ImageReader.camera_model OPENCV

step "2/8 feature matching"
if [ "$N" -le 400 ]; then
  colmap exhaustive_matcher --database_path "$DB"
else
  colmap sequential_matcher --database_path "$DB"   # large / video-frame sets
fi

step "3/8 sparse reconstruction (camera poses)"
mkdir -p "$WORK/sparse"
colmap mapper --database_path "$DB" --image_path "$PHOTOS" --output_path "$WORK/sparse"
[ -d "$WORK/sparse/0" ] || { echo "!! COLMAP could not register the photos. More overlap / texture needed."; exit 1; }

step "4/8 undistort images"
colmap image_undistorter --image_path "$PHOTOS" --input_path "$WORK/sparse/0" \
  --output_path "$WORK/dense" --output_type COLMAP

cd "$WORK/dense"
step "5/8 import into OpenMVS"
InterfaceCOLMAP -i . -o scene.mvs --image-folder images

step "6/8 dense point cloud"
DensifyPointCloud scene.mvs

step "7/8 mesh + refine"
ReconstructMesh scene_dense.mvs -p scene_dense.ply
RefineMesh scene_dense.mvs -m scene_dense_mesh.ply -o scene_dense_mesh_refine.mvs

step "8/8 texture"
TextureMesh scene_dense.mvs -m scene_dense_mesh_refine.ply -o scene_textured.mvs --export-type obj

OUT="$WORK/dense/scene_textured.obj"
echo
echo "== raw scan: $OUT"
echo "next: blender -b -P $(dirname "$0")/process_scan.py -- --input $OUT --name <id> --out ../assets/scans/<id> --height <meters> --slot <slot> --manifest ../assets/assets.json"
