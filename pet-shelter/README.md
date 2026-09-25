# Untitled Pet Shelter Game (base)

A standalone C++17 / OpenGL 3.3 project with an HDR renderer and custom GLSL shaders on everything.
It lives in its own folder and doesn't touch any other project in this repo.

- **Design notes and requirements:** [`DESIGN.md`](DESIGN.md). This is the record of everything asked for so far.
- **Screenshots:** [`docs/screenshots/`](docs/screenshots/)

## Build

You need CMake 3.16+, a C++17 compiler and internet access on the first configure. GLFW and Dear ImGui
are downloaded automatically. There's no GLAD step because the project has its own OpenGL loader.

**Windows (Visual Studio 2022):**
```bat
cd pet-shelter
cmake -S . -B build
cmake --build build --config Release
build\Release\PetShelter.exe
```

**Linux / macOS:**
```bash
cd pet-shelter
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
./build/PetShelter
```
Linux needs the X11 dev packages: `libx11-dev libxrandr-dev libxinerama-dev libxcursor-dev libxi-dev libgl-dev`.

**Headless simulation tests** (economy, taxes, payroll, ratings, collision, 500 sq mi check, save/load):
```bash
cmake -S . -B build-tests -DPS_BUILD_GAME=OFF && cmake --build build-tests && ./build-tests/ps_tests
```

**Screenshot suite:** renders every scene to PNG files and exits:
```bash
./build/PetShelter --screenshots out_dir --size 1600 900
```

## Controls

| | |
|---|---|
| **POV mode** | WASD move, mouse look, Shift sprint, **E** or left click to interact (doors, gate keypad, office computer) |
| **Creative mode** | WASD/arrows pan, right mouse rotate, middle mouse pan, wheel zoom, Q/E rotate, R rotate the building, X demolish, Esc cancel |
| **Both** | **Tab** switches POV/Creative, Esc pause, F5 quick save, F9 quick load, F12 screenshot, F6 reload shaders, F1 hide help |
| **Cutscene** | Space/Enter skips |

## Layout
```
shaders/        every GLSL shader: lit (PBR), shadows, sky, bloom, eye adaptation, ACES tonemap, FXAA, CCTV
src/core/       math, OpenGL loader, input, PNG writer, noise, save files
src/render/     shader loader, meshes, HDR renderer, animation (tweens, tracks, skeletons)
src/world/      layout (500 sq mi + building floor plan), terrain, collision, facility, scenery
src/game/       sim (economy, taxes, staff, ratings, security), character + creator, cutscene,
                POV / creative controllers, office computer UI, main game loop
tests/          headless sim tests
```
