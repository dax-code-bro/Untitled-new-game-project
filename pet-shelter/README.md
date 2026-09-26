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

**Browser build (WebAssembly / WebGL 2)** with [Emscripten](https://emscripten.org):
```bash
emcmake cmake -S . -B build-web -DCMAKE_BUILD_TYPE=Release -DPS_BUILD_TESTS=OFF
cmake --build build-web      # -> build-web/PetShelter.js + PetShelter.wasm (shaders embedded)
```
Serve those two files next to `web/index.html` (the page body; it adds the phone touch controls and the loading screen).
On phones and tablets the page starts the game with `--touch`, which turns on touch controls, bigger UI and lighter graphics.

**Play / install on your phone:** https://raw.githack.com/dax-code-bro/Untitled-new-game-project/claude/pet-shelter-base-ygolsg/pet-shelter/app/index.html
(open it, then Share → Add to Home Screen on iPhone, or ⋮ → Add to Home screen / Install app on Android).

**Installable app (PWA).** The same build also writes `build-web/pwa/`: a complete site (page, `manifest.webmanifest`,
icons, `sw.js`, game files). Put that folder on any HTTPS host and players can install the game to their home
screen or desktop. It opens full screen, works offline after the first visit, and keeps saves in the browser's
storage (IndexedDB). The game also saves itself every 5 minutes and whenever the app goes to the background.
Bump `PS_BUILD` in `web/index.html` for each release: the service worker's cache is named after it, so players get
the new version on their next launch. To try it locally: `cd build-web/pwa && python3 -m http.server 8080`, then
open http://localhost:8080 (service workers need HTTPS or localhost).

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
| **POV mode** | WASD move, mouse look, Shift sprint, **E** or left click to interact (doors, gate keypad, office computer, the OPEN/CLOSED sign by the front door, staff, animals) |
| **Creative mode** | WASD/arrows pan, right mouse rotate, middle mouse pan, wheel zoom, Q/E rotate, R rotate the building, X demolish, Esc cancel. **Fast travel:** with nothing picked, click the shelter (or the pet store) to go straight there, or use the Go to buttons |
| **Driving** | At the red truck: E opens the door, E again to get in. W gas, S brake/reverse, A/D steer, Space handbrake, Q/E turn signals, L headlights, V camera, mouse look (C recenters), F get out. On phones: the stick is gas/brake/steering, plus Signal, Brake, Lights, View and Get out buttons. |
| **Both** | **Tab** switches POV/Creative, Esc pause, F5 quick save, F9 quick load, F12 screenshot, F6 reload shaders, F1 hide help |
| **Cutscene** | Space/Enter skips |
| **Phone / tablet (landscape)** | Left stick walks (or moves the camera in Build mode), drag the right side to look, Use / Run buttons, Build/Walk mode and Menu at the top. Build mode: tap an item, tap the ground to preview, tap the same spot to build; drag to move, pinch to zoom, twist to turn. Menus: tap, drag up/down to scroll, drag sideways on sliders. |

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
