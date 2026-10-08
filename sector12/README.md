# Sector 12

Sector 12 is a survival extraction shooter set on a 42.6 km island in the middle of the ocean. You spawn at the **POB**, a three-storey 3D printer, and earn **filament** to print everything you need.

It runs in the browser on Three.js, with no build step. **[DESIGN.md](DESIGN.md)** covers the full game design and the complete crafting catalog.

## Run it

```bash
cd sector12
python3 -m http.server 8000     # or: npx serve .
```

Then open http://localhost:8000 and click **DEPLOY**. A desktop GPU is recommended: the island streams in level-of-detail terrain chunks with 10k–20k trees around you.

URL flags:
- `?test` skips pointer lock (for automation).
- `?fastprint` makes prints finish about 50× faster (for debugging).

During a session, the live game object is available as `window.__game`.

## Controls

| Key | Action |
| --- | --- |
| WASD, Shift, Space, C | Move, sprint, jump (also climbs ladders), crouch |
| LMB / RMB | Fire, swing or throw / aim. With the CO2 knife, RMB fires the blade. |
| R / T / V | Reload / switch ammo type / pump the Patriot 09 into 12-gauge |
| 1–5, Q, mouse wheel | Primary, secondary, melee, throwing, flare gun; Q and the wheel cycle |
| F / H / Z | Quick-heal (picks the right medical item) / hand warmer / pin a target |
| E | Interact: POB terminal, deposit crate, loot, harvest, extraction |
| Tab / M / Esc | Inventory (attachments, camo, placing buildings) / map / pause |

## How to play

1. You spawn at the POB, inside a safe zone. Take your kit out of the **LOCKER** tab on the terminal.
2. Go out and earn filament. Operator kills pay **headshot 10, body 5, explosive or mid-air 30**. Cargo helicopters drop **caches** worth 30, 50–70 or 70–200 filament, and occasionally a **10,000-filament Abominable Cache** on the summit.
3. Bring the filament back to the **yellow deposit crate**, then print on the touchscreen. You watch the nozzle print your item.
4. To bank everything you carry, **extract at the very top of Frostfang Summit** in the north. Dress for -50 °C.
5. If you die, everything you were carrying is gone.

## Code map (`src/`)

| File | What it does |
| --- | --- |
| `data/catalog.js` | **Every printable item**: weapons, ammo, attachments, armor L1–10, medical, tools, gear, buildings and camo, with costs and print times |
| `data/world.js` | Day length, cache odds, animal spawn tables, weather, AI operator tiers, world loot |
| `terrain.js` | The island: shape, biomes, height, colors, climate and points of interest (pure functions, shared with the worker) |
| `terrainMesh.js`, `terrainWorker.js`, `chunkBuild.js` | Quadtree level-of-detail terrain streamed by web workers, plus lakes and ocean |
| `scatter.js` | Biome vegetation and rocks (instanced), with trunk colliders |
| `structures.js` | Buildings at each point of interest, with loot spots |
| `pob.js` | The printer gantry, live printing animation, touchscreen, print queue |
| `physics.js` | Collision against terrain, boxes and trunks; swimming; ladders; penetration raycasts |
| `player.js` | Movement on terrain, every weapon mechanic, medical, bleeding, heat and cold |
| `damage.js` | Hit zones, armor math, bleeding, fractures, fragments |
| `operators.js` | AI "players": region-tiered gear, contest caches, keep out of the safe zone |
| `animals.js` | Wildlife spawning, behavior, hunting zones, harvesting |
| `caches.js` | Cargo helicopter cache drops and summit extraction |
| `environment.js` | Sky, 30-minute day/night cycle, regional weather (rain, sandstorm, blizzard, tornado) |
| `game.js` | The session: combat, loot, interaction, buildings, death and extraction |
| `ui/hud.js`, `ui/terminal.js` | HUD, map, inventory, POB terminal |
| `viewmodel.js` | Procedural weapon models and first-person animation |

After changing the catalog, regenerate the tables in DESIGN.md with `node tools/catalog-tables.mjs`.

## Photogrammetry assets

All the art is meant to come from photogrammetry scans, made with open-source tools. `pipeline/README.md` covers the process: photos → COLMAP/OpenMVS or Meshroom → `process_scan.py` (cleanup, scale, texture bake, LODs) → `assets/assets.json`.

Check scans in `viewer.html` before using them. The scan-loading code (`src/assets.js`) and the processing pipeline came over from the prototype, but Sector 12 doesn't place scanned assets in the world yet. The next step is to hook up `scatter.js` and `structures.js`, so that scans replace the procedural trees, rocks and props by slot.
