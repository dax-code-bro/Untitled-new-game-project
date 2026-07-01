# UNTITLED — First Demo (playable vertical slice)

A real, runnable first-person slice built in **Three.js** (WebGL). No build step,
no internet needed — Three.js is vendored locally in `vendor/`.

## How to run

ES modules need to be served over http (opening `index.html` as a `file://`
won't work). From this folder:

```bash
# any one of these:
python3 -m http.server 8099        # then open http://localhost:8099
# or
npx serve .                        # then open the printed URL
# or
bash serve.sh
```

Open the printed URL in a **modern browser** (Chrome/Edge/Firefox), click
**CAMPAIGN**, then click to deploy (locks the mouse). Press **Esc** to release
the mouse.

## Controls

| Action | Keyboard/Mouse | Controller |
|---|---|---|
| Move | WASD | Left stick |
| Look | Mouse | Right stick |
| Shoot | Left mouse | Right trigger |
| Sprint | Shift | L3 (stick click) |
| Crouch | C | B / Circle |
| Jump | Space | A / Cross |
| Reload | R | X / Square |
| Swap weapon | 1–4 | Y / bumpers |

**Controller support is full** (Gamepad API) — plug in an Xbox/PS pad and it's
auto-detected (watch the 🎮 indicator, bottom-right).

## What this demo proves (representative slice — NOT the full game)

- **First-person core**: move, look, sprint, crouch, jump, shoot, reload
- **Full controller + KB/M support**
- **The nameplate system**: 🔴 red named enemy (full name) · 🔵 blue friendly
  (codename) · ⚪ white neutral — with the **friendly-fire lockout**
  ("Friendly fire will not be tolerated" → reset) and the story-protected enemy
  ("Nice try, but be patient" — try shooting **Victor Prestige**)
- **Arsenal system**: 4 real guns from the design (M16, PP919, Benelli M3, The
  Statesman) with distinct stats — the *system* that scales to the full 200
- **Story**: the Mission 1 "CLASSIFIED" intro card
- **Procedural neon world**: geometry + a custom GLSL shader, zero art assets —
  proving the "shapes/textures/shaders in code" approach

## What it is NOT

Not the full game. Not all 200 guns, not every mode, not the campaign. It's a
**vertical slice** — the core loop, playable, to prove the feel. See
`game/design/` for the full design bible everything is built from.

## Files
- `index.html` — shell, menu, HUD, story card
- `main.js` — the game (world, player, controller, weapons, nameplate, rules)
- `vendor/` — Three.js r160 (vendored; no CDN)
- `serve.sh` — convenience static server
- `smoketest.mjs` — headless load/verify test (dev only)
