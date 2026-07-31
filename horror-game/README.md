# Untitled Horror Game

A first-person horror game built with [Three.js](https://threejs.org/). No build
step, no bundler, no runtime network access.

## The facility

Fourteen connected rooms on one floor. You start in **Waiting**, behind sealed
tempered-glass doors. The corridors are long on purpose — 40m each way, and 45m
south — so you lose sight of both ends of them.

```
   WAREHOUSE ══ 40m WEST CORRIDOR ══ WAITING ══ 40m EAST CORRIDOR ══ JUNCTION ── STORAGE (locked)
    (key)            │                                   │                │
                 RESTROOMS                        CORPORATE OFFICE   45m SOUTH CORRIDOR
                                                                          │
                                                                     ASSEMBLY (barricaded)
                                                                          │
                                                                      AIRLOCK
                                                                          │
                                                              EXTERMINATION ── SUPPLY
                                                                           └── RESTROOM
```

### Waiting

A round reception **island** with a dropped **bulkhead** soffit hanging over it,
lit from recessed downlights in its underside. **Four screens are mounted to the
bulkhead's outer face, one per side — only one of them still works.** The counter
rings the island with a single gap at the back; you have to walk around and
through it to get inside. On the counter: a tipped coffee cup drying into the
newspapers, scattered paper, pens laid out separately, a half-cracked monitor
facing inward. Shelves of books against the back wall, and an old telephone —
the line is dead.

Seating is kept clear of both corridor mouths, so the walk to either hallway is
never blocked.

**The Wi-Fi puzzle.** Crawl under the rolling chair and look up: the password is
taped to the underside of the seat. Use the terminal, pick `WAITING ROOM WIFI`
out of the junk networks, enter the code, and the one surviving screen wakes up
and plays sixty seconds of basketball highlights before it shorts out.

### The rest

- **Corporate office** — vintage shelf of fossil casts and books, an old
  chandelier, chairs clawed to pieces. The door was thrown hard enough to bury
  itself halfway into a wall.
- **Warehouse** — racking, torn open. The storage key is here.
- **Storage unit** — locked until you find the key. Nick Ahoy's body, his
  journal, and a Glock 19 with two magazines: **34 rounds for the whole game.**
- **Assembly** — barricaded; you get through it on your belly. Workers on the
  floor with plating driven into them, and a holding cage whose bars are bent
  outward.
- **Extermination chamber** — dead scientists, a splinter of pale birchwood, and
  a blueprint: eleven feet, tungsten frame, non-oxidising steel joints,
  birchwood body. Three attempts at naming it, all struck out.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look (pointer lock), or drag to look |
| `E` | Use / read / take |
| `C` or `Ctrl` | Crouch |
| `Z` | Crawl — needed for the Wi-Fi note and the barricade |
| `Shift` | Run |
| `R` | Reload |
| `←` `→` / `Q` | Turn, when pointer lock is unavailable |
| `Esc` | Pause, or close a document |
| Touch | On-screen stick to move, drag to look, tap to use |

## Running it

**Simplest:** open `standalone.html` — a single self-contained file that runs
from `file://` with no server.

**For development,** `index.html` loads the vendored module build, which needs a
server because of ES module semantics:

```bash
cd horror-game
python3 -m http.server 8000
```

## Layout

```
horror-game/
├── index.html            # markup, styles, UI wiring — the source of truth
├── level.js              # floorplan, geometry, props, per-room lighting
├── game.js               # renderer, player, collision, interaction, audio
├── build-standalone.mjs  # inlines Three.js + the scripts into the builds
├── standalone.html       # single-file playable build
├── vendor/three/         # Three.js r160, vendored (no CDN at runtime)
└── dist/artifact.html    # body-fragment build output
```

Walls are generated from room rectangles with doorway gaps punched out, so the
floorplan is edited as data in `level.js` rather than as placed meshes. Wall
planes are merged across rooms before they are built — building per-room would
put two coincident faces wherever rooms share a plane, which z-fights.

```bash
node build-standalone.mjs
```

## Notes

- **All audio is synthesised at runtime** — per-room tone beds, footsteps that
  change with the surface, and stingers. No audio files.
- **Lighting is culled to the nearest six fixtures.** Forward rendering
  evaluates every light in every fragment shader, and the corridors alone carry
  dozens. The count of *visible* lights is held constant, because a changing
  count makes Three.js recompile every shader mid-play. Fixtures flicker in four
  styles — `steady`, `buzz`, `dying`, `strobe` — assigned down the corridor runs.
- **The highlight reel is a stylised silhouette animation**, drawn to a canvas
  each frame. It is not real broadcast footage.
- **Deliberately single-theme.** A horror game that repaints itself for light
  mode defeats its own subject.
- `window.__horror.getState()` and friends expose real state for testing — the
  scene animates every frame, so pixel diffing proves nothing.

## Not built yet

The thing from the blueprint does not exist in the level. Nothing hunts you, so
the 34 rounds currently have nothing to hit and there is no way out — the
entrance stays sealed by design. Those are the next decisions to make.
