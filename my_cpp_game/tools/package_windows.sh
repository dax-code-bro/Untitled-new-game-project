#!/usr/bin/env bash
# Build the Windows release: cross-compiled .exe + shaders + scripts + the
# exported maps + launchers, zipped into my_cpp_game/release/.
#
#   my_cpp_game/tools/package_windows.sh [scenes-dir]
#
# scenes-dir holds *.lescene files written by tools/export_scene.js; when
# omitted the maps are exported fresh (needs node + playwright).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"          # my_cpp_game
ROOT="$(cd "$HERE/.." && pwd)"
SCENES="${1:-}"
OUT="$HERE/release"   # not dist/: the repo ignores every dist/ folder
STAGE="$(mktemp -d)"
PKG="$STAGE/legend-native-windows"

cmake -S "$HERE" -B "$HERE/build-win" -DCMAKE_TOOLCHAIN_FILE="$HERE/cmake/mingw-w64.cmake" \
      -DCMAKE_BUILD_TYPE=Release >/dev/null
cmake --build "$HERE/build-win" -j"$(nproc)" --target my_cpp_game >/dev/null

mkdir -p "$PKG/scenes"
cp "$HERE/build-win/my_cpp_game.exe" "$PKG/"
cp -r "$HERE/shaders" "$HERE/scripts" "$PKG/"
cp "$HERE/tools/windows/README.txt" "$PKG/"

MAPS="bunker-nine coastline helipad resort town demolition"
for m in $MAPS; do
  if [ -n "$SCENES" ] && [ -f "$SCENES/$m.lescene" ]; then
    cp "$SCENES/$m.lescene" "$PKG/scenes/"
  else
    node "$HERE/tools/export_scene.js" "$m" "$PKG/scenes/$m.lescene"
  fi
done

bat() {   # name, arguments -- CRLF, and pause on failure so errors stay on screen
  printf '@echo off\r\ncd /d "%%~dp0"\r\nmy_cpp_game.exe %s\r\nif errorlevel 1 pause\r\n' "$2" > "$PKG/$1.bat"
}
bat "Explore - Showcase"             "--fullscreen"
bat "Explore - Showcase (cinematic)" "--fullscreen --quality cinematic --texture-res 4096"
bat "Explore - Bunker Nine"          "--fullscreen --scene scenes\\bunker-nine.lescene --texture-res 4096"
bat "Explore - Coastline"            "--fullscreen --scene scenes\\coastline.lescene --texture-res 4096"
bat "Explore - Helipad"              "--fullscreen --scene scenes\\helipad.lescene --texture-res 4096"
bat "Explore - Resort"               "--fullscreen --scene scenes\\resort.lescene --texture-res 4096"
bat "Explore - Town"                 "--fullscreen --scene scenes\\town.lescene --texture-res 4096"
bat "Explore - Demolition"           "--fullscreen --scene scenes\\demolition.lescene --texture-res 4096"
bat "Windowed"                    "--width 1600 --height 900"
printf '@echo off\r\ncd /d "%%~dp0"\r\necho Rendering 7680x4320 -- this takes a few seconds on a real GPU.\r\nmy_cpp_game.exe --width 7680 --height 4320 --quality cinematic --texture-res 4096 --frames 16 --screenshot showcase-8k.png\r\npause\r\n' \
  > "$PKG/Screenshot - 8K Showcase.bat"

mkdir -p "$OUT"
rm -f "$OUT/legend-native-windows.zip"
(cd "$STAGE" && zip -qr9 "$OUT/legend-native-windows.zip" legend-native-windows)
rm -rf "$STAGE"
ls -la "$OUT/legend-native-windows.zip"
