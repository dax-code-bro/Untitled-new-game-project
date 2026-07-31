# Untitled Horror Game

The beginnings of a first-person horror game, built with [Three.js](https://threejs.org/).

## Current state

- A 3D **10 × 10** grey room (floor, ceiling, four walls) with atmospheric fog.
- **Lighting**: a dim ambient fill plus a single hanging ceiling bulb that casts
  soft shadows and flickers slightly for mood.
- **First-person controls**: click to lock the mouse, then walk around.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / Arrow keys | Move |
| Mouse | Look around |
| `Esc` | Release the mouse |

## Running it

It's a single self-contained file — no build step. Because it loads Three.js as
an ES module from a CDN, open it through a local web server rather than the
`file://` protocol:

```bash
# from the repo root
cd horror-game
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Next steps (ideas)

- A door / exit and the trigger to open it
- Interactable objects and pickups
- Sound design (ambient hum, footsteps, stingers)
- An entity that hunts the player
