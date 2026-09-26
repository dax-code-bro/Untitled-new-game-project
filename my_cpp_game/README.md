# my_cpp_game — native C++ / OpenGL 4.6 core

The Legend Engine's renderer, material baker and geometry, ported to native
C++, rendering the game's real maps at any resolution — 4K, 8K — with
procedural textures baked at 4096².

**Download (Windows, ready to run):** `release/legend-native-windows.zip` —
unzip, double-click an `Explore - …` launcher. See `tools/windows/README.txt`
for controls and requirements.

## What is ported, and how it is verified

| | | verified by |
|---|---|---|
| Material baker | all 46 procedural recipes (`40-material.js`), multithreaded | byte-identical to the JS at every size and seed tried (`test_assets_parity`, tolerance 0) |
| Geometry | every primitive in `30-geometry.js`, tangents, bounds | bit-identical positions/normals/UVs (`test_geometry_parity`), plus a winding fix, below |
| Shaders | all 37 programs of `50-shaders.js`, extracted verbatim (`tools/extract_glsl.js`) | compile and link in every `#define` variant under GL 4.5 core (`test_shader_compile`) |
| Renderer | the whole frame of `60-renderer.js`: cascaded shadows + PCSS, scene-baked environment probe (GGX prefilter + SH), PBR with multi-scatter BRDF, clearcoat, sheen, parallax, detail normals, sky, volumetric scattering, SSR, SSAO, contact shadows, bloom, ACES/AgX composite, FXAA, supersampling | `test_render_stages`: zero GL errors (KHR_debug), every active uniform of every program set, and each pass checked for output |
| Maps | Bunker Nine, Coastline, Helipad, Resort, Town, Demolition | exported from the running web game (`tools/export_scene.js`) and rendered side by side with the web frame |

### Look-dev on the maps (native only)

The exported maps are built from boxes, spheres and flat colours. On load,
from nothing but the map's own geometry and the names its builders gave
each part, the native build adds (every step marked `NATIVE`, each with an
environment switch to turn it off for comparison):

| | | off switch |
|---|---|---|
| A. Edges | every box gets a rounded, worn edge in the shader (`uBevel`) | `bevelScale = 0` |
| B. Water | lakes, pools and sea get waves, Fresnel, sun glint, shore foam | — |
| C. Trees | canopy spheres become crowns of ~1100 leaves in clumps (`Foliage.cpp`) | — |
| D. Ground | albedos brought into a measured physical range; macro colour variation, grime at wall feet, rain streaks; damp patches, puddles and cracks on outdoor paving; grass, weeds and stones scattered on the ground nothing stands on (`Scatter.cpp`) | `GAME_NO_SCATTER=1`, `weatheringScale`, `wetScale` |
| E. Buildings | roof slabs become hipped tile roofs (stepped stacks become the roof they drew), a hangar a barrel vault, flat roofs get parapets, gravel and plant; blank exterior walls get framed, sill-hung windows (`BuildingKit.cpp`) | `GAME_NO_KIT=1` |
| G. Close-up | a dense lawn around the camera: a fixed disc of ~26k tufts the vertex shader re-centres every frame over a lawn density/height field baked from the map (`GRASS_FIELD`); rooms behind the kit's windows by interior mapping (walls, floorboards, cabinet, picture, curtains, some lamps, seeded per window); plinths, cornices and string courses on exterior masonry; ridge and hip tiles, gutters and downpipes on hipped roofs | `GAME_NO_LAWN=1`, `interiorScale = 0` |
| H. Trees & walls | near crowns are alpha-cut cards carrying a painted spray of small leaves (so a leaf is centimetres, whatever the crown's scale), conifer tiers are needle sprays hanging off the cone, trunks and limbs are tapered, bent, root-flared meshes in a generated bark; cut-out shadows (`shadow.frag` ALPHA_CLIP); mulch mounds; wall fittings (meter boxes, conduit, vents, lamps, wall AC units); freestanding and cover walls get stone posts and copings | `GAME_GEOMETRY_LEAVES=1` |
| F. Light | auto exposure (`exposure.frag`), physical sky on daytime maps, noon suns lowered to 40° on their own bearing, thinner haze | `GAME_WEB_LIGHT=1` |

### What is not ported

Gameplay. There are no zombies, no weapons firing, no physics, no AI, no
HUD and no audio in the native build: it renders the maps and lets you fly
through them. Those systems are the larger part of the JavaScript (`70-`
to `99-`, and `site/games/`), and the web build remains the playable game.

## A bug the port found in the web game

The web primitives wind a box's top and bottom faces, and every cylinder,
cone and torus triangle, against their own normals (measured 4/12, 96/96,
48/48, 1728/1728). The web renderer culls back faces, so **every box top
in the web game is culled** and the shapes are drawn inside out. On
Coastline the web game shows grass where the paved footpath is; in Bunker
Nine it shows the dirt under the concrete floor. The C++ `Shapes` port
emits them wound correctly and `SceneFile` repairs exported meshes on load
(`GAME_KEEP_WEB_WINDING=1` reproduces the web picture). The web engine
itself is unchanged — fixing it there changes the look of every web map.

## Build

```
cmake -B build -DCMAKE_BUILD_TYPE=Release -DGLFW_BUILD_WAYLAND=OFF
cmake --build build -j
./build/my_cpp_game                                   # showcase, windowed
./build/my_cpp_game --fullscreen --quality cinematic --texture-res 4096
./build/my_cpp_game --width 7680 --height 4320 --screenshot 8k.png
./build/my_cpp_game --scene coastline.lescene        # an exported map
```

Windows release from Linux: `tools/package_windows.sh` (MinGW-w64, static,
no DLLs beyond the system's; smoke-tested under Wine).

Maps: `node tools/export_scene.js <bunker-nine|coastline|helipad|resort|town|demolition> out.lescene [--compare web.ppm]`.

Guns: `node tools/export_scene.js armory armory.lescene --frames 0` builds all 80 guns (every
multiplayer gun plus the zombies-only models) at desktop resolution -- 3x the points in every
swept section and revolve, patched into the bundle text for this export only -- on a studio
floor, and writes each gun's bounds to `armory.lescene.json`. `--shots list.txt outdir` renders
one picture per line (`name ex,ey,ez tx,ty,tz fov`) in a single run.

Operators: `node tools/export_scene.js roster roster.lescene` stands all seven operators in a row
at x = (i - 3) * 1.6 on a studio floor (bounds in `roster.lescene.json`), skinned and posed at
the close-up level of detail (the web engine's `fullDetail`). Keep the default `--frames 12`:
with `--frames 0` the skeletons have never been posed, every skinning palette is empty and only
the rigid heads arrive.

Linux host packages: `libgl1-mesa-dev libx11-dev libxrandr-dev
libxinerama-dev libxcursor-dev libxi-dev libxkbcommon-dev`. Glad is
generated at configure time and needs Python 3 with `jinja2`.

## Dependencies (FetchContent, pinned)

GLFW 3.4 · Glad 2.0.6 (GL 4.6 core) · GLM 1.0.1 · stb · nlohmann/json 3.11.3
(scene files). Assimp 5.4.3 and Lua 5.4 + Sol2 3.3.0 are wired but off
(`-DGAME_WITH_ASSIMP=ON`, `-DGAME_WITH_LUA=ON`); the live-tuning loop is
`scripts/look.ini`, watched and re-applied on save, and every shader
hot-reloads the same way.

## Layout

```
src/assets/     procedural material baker        (game_assets, no GL)
src/geometry/   primitives, tangents              (game_geometry, no GL)
src/rendering/  gl/ RAII wrappers, ShaderLibrary, Renderer, Material, Mesh, Tunables
src/scene/      Showcase, SceneFile (exported maps), Foliage, Scatter, BuildingKit
src/core/       Window, Args, Capture, Paths, GlDebug
shaders/        GLSL 4.50, #include-able lib/
scripts/        look.ini (live look overrides)
tools/          extract_glsl.js, export_scene.js, package_windows.sh, parity dumps
tests/          parity, shader compile, render stages
```

## Rules the code keeps

No raw `new`/`delete`: every GL object is a move-only RAII handle, GLFW's
window is a `unique_ptr` with a deleter. Every sampler owns a texture unit
fixed at link time, so two sampler types can never share a unit (a bug the
web engine hit twice). Every departure from the web renderer is marked
`NATIVE` in the source with the reason.
