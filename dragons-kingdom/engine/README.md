# Dragon's Kingdom episode engine

The plan is in [DESIGN.md](DESIGN.md), and the build log is in [PROGRESS.md](PROGRESS.md). The aim is a screenplay plus a shot list in, and a staged, rendered, cut and mixed episode out. Everything is free or open source.

## What exists (phases 1-2 of 7: plumbing, template mining, input and validator)

| Piece | What it does |
|---|---|
| `scenes/lib/director/episode-paths.js` | `dirs(ep)` gives every per-episode path: final/, scenes, specs, cut, sound, vo, shotlist, timings, render-jobs, edl(name), work(preset) and more. `episodeArg(argv)` takes `--episode <id>` out of an argv list. `episodeCuts(ep, fallback)` reads `cuts` from `episodes/<ep>/episode.json`. |
| `--episode <id>` (default `s01e01`) | Accepted by `build-shots`, `render-shots`, `previs`, `still`, `shot-rows`, `cut-sheet` and `selftest` (all in `scenes/lib/director/tools/`), and by `episodes/s01e01/final/cut/make-cut.mjs`. `build-shots` takes its cuts from `episode.json` when one exists. Episode 1 has no `episode.json`, so it keeps its built-in cuts. |
| `scenes/lib/director/previs-core.js` | The pure measuring half of `previs.mjs`, using three.js maths only. `measure(spec, shot, t, {row})` returns the camera and every head on screen (in frame, distance, size, face check, occlusion). `previs.mjs` now draws from it, and its output is unchanged. |
| `engine/tools/mine-specs.mjs` | Measures every hand-written spec of an episode and writes `engine/stager/templates.mined.json`. Per shot it records size class, camera_move, rig, mm, f-stop, camera height, distance, bearing relative to the subject's facing, frame height at the subject and at the aim point, and the head's screen position and size. Bands (n, min, p10, median, p90, max) are given per size class, per template guess, and per size/template pair. |
| `engine/input/fountain.mjs` | `input/screenplay.fountain` (the subset in `input/SCREENPLAY-FORMAT.md`) → `final/dialogue.json`, `onscreen-text.json` (Episode 1 schemas) and `lines.lock.json` (stable line ids). |
| `engine/input/shotlist-parse.mjs` | `input/shotlist.txt` → `final/shotlist.json` (the Episode 1 schema) and `final/sets.plan.json` (SET blocks). |
| `engine/input/export-shotlist.mjs` | shotlist.json → shotlist.txt (the round-trip helper; `--scenes 1C`). |
| `engine/input/validate.mjs` | Checks the inputs → `final/validation.md`, exit 1 on errors; `--write` also writes the parser outputs. |
| `engine/input/CHATGPT-SHOTLIST-PROMPT.md` | The prompt the owner pastes into ChatGPT with the screenplay to get a valid shotlist.txt. |
| `episodes/t00/` | A 3-shot test episode on CLING_SQUARE (`"test": true`). |

## Run it

From `dragons-kingdom/`:

```
node engine/tools/mine-specs.mjs                         # -> engine/stager/templates.mined.json (+ a band table)
node scenes/lib/director/tools/build-shots.mjs --check   # Episode 1 tables / EDLs up to date
node scenes/lib/director/tools/previs.mjs --episode s01e01 --set CLING_SQUARE --cuts
node engine/input/validate.mjs --episode t00 --write       # parse + validate the test episode
npm test                                                 # includes test/engine.test.mjs
```

A new episode works once it has `episodes/<id>/final/` with the same layout as Episode 1. It also needs `episodes/<id>/episode.json` with `{ "cuts": [{ "name": "edl", "scenes": [...] }, ...] }`. Then run `node scenes/lib/director/tools/build-shots.mjs --episode <id>`.

## Not yet (later phases)

These parts don't exist yet:

- set sheets and casting (phase 3);
- the auto-stager (phases 4 and 5);
- `make-episode.mjs`, the queue and draft tiers (phase 6);
- the set generator and `--episode` for `render/` and `pc/` (phase 7).

The shared `SETS` registry and Episode 1 continuity are still in `registry.js`.
