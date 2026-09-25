# my_cpp_game — native C++ / OpenGL 4.6 core

Bootstrap for the proposed port of the Legend Engine (102,416 lines of
JavaScript across `engine/src` and `site/games`) to native C++.

**Status: the window bootstrap compiles, links and runs to the point
where it needs a display. Nothing is ported yet.** Read "What this costs"
before going further, because the decision is not really a technical one.

---

## What exists and is verified

| | |
|---|---|
| `CMakeLists.txt` | CMake 3.28, C++20, dependencies via `FetchContent` (no submodules) |
| `src/main.cpp` | GL 4.6 core context, debug callback, fixed-step loop at 1/60 with the same 0.20 s clamp the JS loop uses |
| `src/core/Window.{hpp,cpp}` | GLFW window and context, RAII |
| `shaders/pbr.{vert,frag}` | placeholder — the real shader is a port of `GLSL.pbrFrag` |
| `scripts/tuning.lua` | the live-editable values, mirroring the JS ones |

Built and run on this machine:

```
$ cmake -B build -DCMAKE_BUILD_TYPE=Release -DGLFW_BUILD_WAYLAND=OFF
$ cmake --build build -j4
[100%] Built target my_cpp_game          # 694 KB binary

$ ./build/my_cpp_game
[glfw] 65550: X11: The DISPLAY environment variable is missing
fatal: glfwInit failed
```

That is the correct and expected result in a headless container. It
proves the toolchain, the fetch, the Glad 4.6 generation and the C++
compile; it proves nothing about rendering, because there is no GPU here.

## Dependencies

Fetched at configure time, pinned:

| library | version | role |
|---|---|---|
| GLFW | 3.4 | window, context, input |
| Glad 2 | 2.0.6 | GL 4.6 core loader, **generated** at configure time |
| GLM | 1.0.1 | maths matching GLSL |
| stb_image | master | 2D texture loading |
| Assimp | 5.4.3 | meshes, skeletons, animation — `-DGAME_WITH_ASSIMP=ON` |
| Lua + Sol2 | 5.4.5 / 3.3.0 | hot-reloaded gameplay values — `-DGAME_WITH_LUA=ON` |

Assimp and Lua are **off by default**: Assimp alone is a multi-minute
build and nothing in the bootstrap references either yet. Turn them on
with the code that uses them, not before.

Host packages needed on Linux (not fetchable): `libgl1-mesa-dev`,
`libx11-dev`, `libxrandr-dev`, `libxinerama-dev`, `libxcursor-dev`,
`libxi-dev`.

## Memory

No raw `new` / `delete` anywhere. GLFW hands back a raw `GLFWwindow*` and
expects `glfwDestroyWindow`; that pair is wrapped exactly once, in
`Window`'s `unique_ptr` with a custom deleter, and never written again.
`glfwInit`/`glfwTerminate` are bound to a function-local static so their
ordering is not something a caller can get wrong.

---

## What this costs — read this first

The nine graphics features in the proposal are not hypothetical here.
**Six of them already exist in the JavaScript engine, measured:**

| feature | state | measurement |
|---|---|---|
| SSR | shipped v0.19.0 | 0 → 2 of 4 walls in a mirror floor |
| Environment probe | shipped v0.20.0 | −13.9% reflection spread at mid roughness |
| Scene probe | shipped v0.21.0 | 26.55% — the wall *behind the camera*, in the mirror |
| PCSS + contact shadows | shipped v0.22.0 | 2.58% of pixels; 0 → 13 px soft edge |
| Parallax occlusion | shipped v0.23.0 | 15.02% of pixels |
| Multi-scatter BRDF + volumetrics | verified, landing | +20% recovered specular energy |
| ACES tonemapping | shipped long ago | — |
| Bloom, SSAO, CSM | shipped long ago | — |
| GTAO, TAA | not built | — |

So the graphics gap the port is meant to close is **two features wide**,
not nine. Both were authored and lost to a session limit, not to any
limitation of the web platform.

**The thing a port would break is how this game is used.** It ships as a
static page and is played by opening a link:

```
https://raw.githack.com/dax-code-bro/Untitled-new-game-project/claude/lock-in-0ak39k/site/games/bunker-nine.html
```

A native binary cannot be opened by a link. It needs a per-platform
toolchain, a build, a download, and on macOS a signature and
notarisation. Every "give me the link when you're done" becomes "install
this." That is the real cost, and it is paid on every single change.

**The hot-reload argument is already won.** The JS engine has no compile
step at all — `node engine/build.js` concatenates and takes under a
second. Embedding Lua in C++ to avoid C++ compile times recovers
something the current stack never lost.

### What a port would genuinely buy

Real threads, real SIMD, no garbage collector, no browser sandbox, and
compute shaders. Those matter at a scale this game is not at: the
measured frame cost today is 3.66 ms at the tier the tests use, on a
software rasteriser with no GPU at all.

### If you want it anyway

The order that works, and which this bootstrap is shaped for:

1. **Window + context** — done, compiles.
2. **Renderer core** — VAO/VBO/FBO/Shader RAII wrappers. Mechanical.
3. **Port `50-shaders.js` verbatim.** It is already GLSL and already
   carries every feature above. Change the `#version` line and the
   precision qualifiers. This is the single highest-value step and the
   least risky.
4. **Port the material baker** (`40-material.js`, 46 procedural recipes).
   Pure maths, no GL, portable as-is — and `height.test.js` will tell you
   if the packing constants drift.
5. **Port the physics** (`70-`/`71-`/`72-`). Pure maths, already has
   `require()`-able tests that run in Node today.
6. **ECS + gameplay.** The largest share of the 102k lines and the part
   with no test coverage to port against.

Steps 3–5 are roughly 15k lines and mostly mechanical. Step 6 is the
rest, and it is where a port of this kind usually stalls.

**The measurement that should decide it:** run the game on the target
hardware at ULTRA and look at the frame time. If it is comfortable, the
port buys fidelity you already have. If it is not, that number tells you
which of the six features to spend on — and that is a smaller, safer
change than 102,000 lines.
