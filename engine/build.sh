#!/usr/bin/env bash
# ============================================================================
#  MOOR3D — build C++ -> WebAssembly
#
#  Requires the emscripten SDK. Set EMSDK_DIR if yours lives elsewhere.
#    ./engine/build.sh          release build into site/moor/
#    ./engine/build.sh debug    with assertions + source maps
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
EMSDK_DIR="${EMSDK_DIR:-$HOME/emsdk}"
OUT="$ROOT/site/moor"
MODE="${1:-release}"

if ! command -v em++ >/dev/null 2>&1; then
  if [ -f "$EMSDK_DIR/emsdk_env.sh" ]; then
    # shellcheck disable=SC1091
    source "$EMSDK_DIR/emsdk_env.sh" >/dev/null 2>&1
  else
    echo "error: em++ not found and no emsdk at $EMSDK_DIR" >&2
    echo "install: git clone https://github.com/emscripten-core/emsdk && cd emsdk && ./emsdk install latest && ./emsdk activate latest" >&2
    exit 1
  fi
fi

mkdir -p "$OUT"

COMMON=(
  "$HERE/src/main.cpp"
  -std=c++17
  -I"$HERE/src"
  -o "$OUT/moor.js"
  -sMAX_WEBGL_VERSION=2
  -sMIN_WEBGL_VERSION=2
  -sFULL_ES3=1
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=268435456
  -sSTACK_SIZE=5242880
  -sEXPORTED_FUNCTIONS=['_main','_setKey','_actionEnterCar','_startGame','_setRenderScale','_setQuality','_getBuildings','_getProps','_getPctWater','_getPctUrban','_getPctWild','_isStarted','_dbgChunksCached','_dbgChunksDrawn','_dbgRoadTilesDrawn','_dbgDrawItems','_dbgInstances','_dbgSkinned','_dbgCars','_dbgPeds','_dbgPlayerX','_dbgPlayerY','_dbgPlayerZ','_dbgTerrainY','_dbgOverWater','_dbgBiome','_dbgCamY','_dbgSunY','_dbgSetShadows','_dbgSetTint','_dbgSetMode','_dbgKeyW','_dbgKeyRaw','_dbgVel','_dbgLastDt','_dbgInCar','_dbgWarpToCar','_dbgCarSpeed','_dbgWheelSpin','_dbgNearestCarDist','_dbgShowShadowMap','_dbgTeleport','_dbgFreeCam','_getFps']
  -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString']
  -sENVIRONMENT=web
  -sMODULARIZE=0
  -sEXIT_RUNTIME=0
  -sFILESYSTEM=0
  -sTEXTDECODER=2
  --closure=0
)

if [ "$MODE" = "debug" ]; then
  echo ">> debug build"
  em++ "${COMMON[@]}" -O1 -g2 -sASSERTIONS=2 -sSAFE_HEAP=0 -sGL_ASSERTIONS=1 -sGL_DEBUG=1
else
  echo ">> release build"
  em++ "${COMMON[@]}" -O3 -flto -DNDEBUG -sASSERTIONS=0
fi

cp -f "$HERE/shell/index.html" "$OUT/index.html"

echo ""
echo ">> output:"
ls -la "$OUT"/moor.js "$OUT"/moor.wasm "$OUT"/index.html
echo ""
echo ">> wasm size: $(du -h "$OUT/moor.wasm" | cut -f1)"
echo ">> open site/moor/index.html (must be served over http, not file://)"
