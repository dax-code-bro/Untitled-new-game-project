# Untitled Horror Game

A first-person horror game built with [Three.js](https://threejs.org/). This is
the first milestone: **Room 001**, a 10 × 10 grey concrete room lit by a single
failing bulb.

## What's here

- **The room** — 10 × 10 × 4 m, floor / ceiling / four walls, with procedurally
  generated concrete texture (multi-octave canvas noise, no external assets) and
  a skirting rail.
- **Lighting** — a cool hemisphere fill keeps the concrete reading *grey*, while
  one warm tungsten bulb owns the pool of light beneath it. The bulb swings on
  its cord so shadows crawl, and its filament stutters at irregular intervals.
- **Controls** — first person, with pointer lock where it's available and a
  drag-to-look fallback where it isn't (pointer lock is routinely blocked inside
  an iframe). Touch devices get an on-screen stick.
- **Ambience** — the bulb's 50 Hz mains hum, synthesised with WebAudio and ducked
  in sync with the flicker. Toggleable; starts from the entry click so autoplay
  policy is satisfied.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look (pointer lock), or drag to look |
| `←` `→` / `Q` `E` | Turn — for when pointer lock is unavailable |
| `Shift` | Run |
| `Esc` | Release the mouse / pause |
| Touch | On-screen stick to move, drag to look |

## Running it

**Simplest:** open `standalone.html` directly — it's a single self-contained
file with Three.js inlined, so it runs from `file://` with no server and no
network access at all.

**For development,** `index.html` loads the vendored module build, which needs a
server because of ES module semantics:

```bash
cd horror-game
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Layout

```
horror-game/
├── index.html            # markup, styles and UI wiring — the source of truth
├── game.js               # scene, lighting, controls, ambience
├── build-standalone.mjs  # inlines Three.js + game.js into the builds below
├── standalone.html       # single-file playable build (no server needed)
├── vendor/three/         # Three.js r160, vendored (no CDN at runtime)
└── dist/artifact.html    # same page as a body fragment (build output)
```

`index.html` is the single source of truth for markup and styles. The build
script only swaps the module loader for an inlined copy of Three.js and inlines
`game.js`:

```bash
node build-standalone.mjs
```

Three.js ships as an ES module whose public names survive minification only in
its trailing `export {}` statement, so the build rewrites that statement into a
namespace object. That avoids both a bundler and the deprecated UMD build.

## Notes

- **Deliberately single-theme.** A horror game that repaints itself for light
  mode defeats its own subject, so the dark ground is held in both directions.
- `window.__horror.getState()` exposes camera state for testing — the scene
  animates every frame, so pixel diffing proves nothing.

## Next

- A door, and whatever is needed to open it
- Interactable objects — a key, a note, a flashlight
- Footsteps and stingers
- Something else in the room
