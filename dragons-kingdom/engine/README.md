# Dragon's Kingdom episode engine

The plan is in [DESIGN.md](DESIGN.md), and the build log is in [PROGRESS.md](PROGRESS.md). The aim is a screenplay plus a shot list in, and a staged, rendered, cut and mixed episode out. Everything is free or open source.

## What exists (phases 1-5 of 7: plumbing, template mining, input and validator, set sheets and casting, the ground and air auto-stager)

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
| `engine/tools/sheet.mjs` | Set sheets → `scenes/lib/director/sets/sheets/<SET>.json` (marks + aliases, set objects, homes, areas with slots, paths, every hand-written camera as a vantage, occlusion solids, shot state, cost) for CLING_SQUARE, VERDOR_AERIAL, VERDOR_HARBOR, OUTER_ROCKS, SKY_OFF_VERDOR, BIRTHING_CHAMBER. `--check` for staleness. |
| `previs-core.js` `{ sheet }` | `measure(..., { sheet })`: marks from the sheet, occlusion rays against its solids (`occludedBy`, `visibleFrac`); `rayBlock()`. |
| `scenes/lib/humans/cast-list.js` | The cast as pure data: build ids → role, sex, age class (adult/child), variants, mounts; named people and creatures. |
| `engine/stager/` | The auto-stager v1 (ground): `intent.mjs` (row → intent, `verbs.json`, `places.json`), `select.mjs` (template table), `templates/*.mjs`, `check.mjs` (score + adjust loop on previs-core), `stage.mjs` (`stageShot`, `stageRows`), `write.mjs` (→ `<builder>.auto.js` + `.touch.js` + `.spec.js` + `final/stage-report.md|json`), `accept.mjs` (re-stage the 22 Cling shots vs the hand specs; `--air`: the 1C X4 aerials + X6-01..18). Phase 5 adds `air.mjs` (flight blocking on the sheet paths and the scene clock, riders cast with their mounts) and the air templates air-to-air, camera-ship, pov, pass-by, drone-reveal; `check.mjs` adds the long-lens horizon rule, the sheet's screen-direction line and a size floor for mediums / two-shots. |
| `engine/stager/priors.mjs` | (phase 5b) air camera priors: the nearest-matching hand camera of ANOTHER shot (leave-one-out) from `templates.mined.json` starts the air-to-air / camera-ship search. Occlusion is a hard fail (> 50 % of head / chest / hips / wing tips behind sheet solids), `ground.js` `walkable` / `nudgeOut` keep people out of solids and water. STAGER_VERSION 3. |
| `scenes/lib/director/staging/flight.js` | Shared, pure flight helpers mined from the air specs: `fly`, `inForm`, `pair`, `posAt`, `localFrame`, `shadowOf` / `shTrack`, LEAF_FLY / LEAF_SKIM / CHAR_FLY (CHAR_HZ 0.625, locked by the sound spots) / CHAR_GLIDE, `perch`, `formationClock`. |
| `scenes/lib/director/staging/` | Pure staging helpers: `ground.js`, `talk.js`, `merge.js` (`mergeSpecs`). |
| `engine/cast/casting.mjs` | Shot list → `final/cast.lock.json`: named roles and variants, riders with mounts, dragons, generic roles → crowd## (hashed, unique per scene, locked), hard rating guard. |

## Run it

From `dragons-kingdom/`:

```
node engine/tools/mine-specs.mjs                         # -> engine/stager/templates.mined.json (+ a band table)
node scenes/lib/director/tools/build-shots.mjs --check   # Episode 1 tables / EDLs up to date
node scenes/lib/director/tools/previs.mjs --episode s01e01 --set CLING_SQUARE --cuts
node engine/input/validate.mjs --episode t00 --write       # parse + validate the test episode
node engine/tools/sheet.mjs [--set X] [--check]           # set sheets
node engine/cast/casting.mjs --episode t00                 # -> episodes/t00/final/cast.lock.json
node engine/stager/write.mjs --episode t00                 # stage t00 -> final/scenes/specs/*.auto.js + stage-report
node engine/stager/accept.mjs                             # the phase 4 acceptance table (re-staged Cling vs hand)
node engine/stager/accept.mjs --air                       # the phase 5 acceptance table (re-staged air shots vs hand)
npm test                                                 # includes test/engine.test.mjs
```

A new episode works once it has `episodes/<id>/final/` with the same layout as Episode 1. It also needs `episodes/<id>/episode.json` with `{ "cuts": [{ "name": "edl", "scenes": [...] }, ...] }`. Then run `node scenes/lib/director/tools/build-shots.mjs --episode <id>`.

## Not yet (later phases)

These parts don't exist yet:

- the stager's hand-match is below target: ground 55 %, air 41 % (target 70 %, see PROGRESS.md phase 5b);
- `make-episode.mjs`, the queue and draft tiers (phase 6);
- the set generator and `--episode` for `render/` and `pc/` (phase 7).

The shared `SETS` registry and Episode 1 continuity are still in `registry.js`.
