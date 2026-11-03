# Southbound

An original open-world action game set in **Calvera**, a fictional state on
the Gulf Coast at the southern edge of North America. It runs in the browser
(WebGL 2 via Three.js) on phones and PCs.

## Play

Serve the `site/` folder (it deploys with the rest of the site on Vercel) and
open `/southbound/`. Locally:

```bash
cd site && python3 -m http.server 8080
# open http://localhost:8080/southbound/
```

On the start screen pick **Phone** or **PC**. On PC the game reads your GPU and
picks a preset. You can override it with the GPU list or the Low / Medium /
High / Ultra buttons, and choose a render resolution up to 4K and a target
frame rate. Dynamic resolution keeps the frame rate at that target.

### Controls

| Action | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Move / drive | WASD / arrows | Left stick, RT / LT | Left joystick |
| Look | Mouse (click to capture) | Right stick | Drag right side |
| Sprint | Shift | L3 | » button (or push the stick fully) |
| Jump / handbrake / climb | Space (walk into a ledge to mantle it) | A / RB | ⤒ button |
| Get in / out of a vehicle, use doors and shops | F | Y | ◎ (tap) |
| Interact with people (hold): greet / antagonize / surrender | hold F, then G / T | hold B, then D-pad up / down | hold ◎, then Greet / Antagonize |
| Weapon wheel (hold, point, release) | hold Tab or Q, mouse to pick, wheel / Z X to switch | hold LB, right stick | hold 🔫 and drag |
| Holster / draw | H (or tap Q) | | tap 🔫 |
| Aim (draws your gun; with it holstered near someone, focuses on them) | Right mouse / E | LT | L2 |
| Fire / punch | Left mouse / Ctrl | RT | 💥 |
| Reload | R | X | auto |
| Camera: near / far / close / first person | V, mouse wheel | R3 | |
| Free camera | C | | Pause menu |
| Map, phone, arsenal | M, I, B | | Pause menu |
| Pause / settings | Esc | Start | ❚❚ button |

## The map (first slice)

| Region | What's there |
|---|---|
| Port Calvera | Downtown towers, offices, brick blocks, parks, the port and container yard |
| Mill Creek | Small town: Main Street shops, houses, church, gas station |
| Lake Arden | Big lake with lake houses and docks |
| Calvera River | Runs from the lake to the Gulf, crossed by highway bridges |
| Pinewood Hollow | Dense pine forest with cabins and a logging road |
| Redgrass Plains | Open rolling hunting land with farms |
| Bayou Verde | Cypress wetlands and creeks on the coast |
| Gulf Shore | Beaches along the south coast |
| Sierra Norte | Hills and peaks to the north |

## Building

`index.html` loads `game.js`, a single bundled script that also runs on
older browsers (no import-map/module support needed). After changing
anything in `src/`, rebuild it and commit `game.js`:

```bash
cd tools/southbound && npm install && npm run build
```

`dev.html` loads the source files directly as modules for quick iteration
(needs a modern browser).

## Code layout

```
src/
  main.js            boot, world build, game loop, dynamic resolution, debug API (window.SB)
  settings.js        presets, GPU detection, saved settings
  world/             layout (map + road graph), heightmap, terrain, water (+ planar
                     reflections), sky, clouds (ray-marched), weather, roads,
                     buildings, vegetation, collision
  assets/            texture/model loading, carbuilder.js (procedural vehicles),
                     animation retargeting
  entities/          player, peds, police, vehicle, traffic, combat, arsenal (weapons)
  core/              input, camera, post-processing, audio
  ui/                start menu, settings panel, HUD, arsenal store
vendor/three/        Three.js r170 (MIT), served locally
```

Surfaces, trees and people come from CC0/MIT asset packs (see CREDITS.md).
Cars, weapons, clouds, weather and sounds are generated in code, which keeps
the download small for phones. `dev-showroom.html` renders the sky and every
vehicle on its own for quick look-dev.

## Automated playtest

```bash
node tools/southbound/playtest.mjs <out-dir> <preset> smoke|shots|video
```

`shots` teleports through the camera spots in `tools/southbound/spots.json`
and saves a screenshot at each. `video` records scripted walking and driving.
The headless browser uses a software renderer, so the frame rate it reports
is far below what a real GPU gets.

See `ROADMAP.md` for the full to-do list.
