## my_cpp_game — native C++ port (renderer, baker, maps; no gameplay)

`my_cpp_game/` is the native C++/OpenGL 4.5+ build: the renderer, the
procedural material baker and the geometry library are ported and verified
(parity tests, `test_render_stages`), and the six game maps are exported
from the running web game with `tools/export_scene.js` and rendered on it.
Gameplay is NOT ported; the web build remains the playable game.
`my_cpp_game/README.md` is the index: build, verification, layout, the
web winding bug the port found, and the Windows release
(`tools/package_windows.sh` -> `release/legend-native-windows.zip`).
Native departures from the web renderer are marked `NATIVE` in the source.
Verify natively under `Xvfb :99` (Mesa llvmpipe, GL 4.5) with `--gl-debug`.
