# Dragon's Kingdom episode engine

The engine turns a **screenplay** and a **shot list** into a finished episode: it builds the sets, stages every shot,
records the voices, renders drafts, cuts and mixes them, and packages the 4K masters for your PC. Everything is free or
open source. The plan is in [DESIGN.md](DESIGN.md), the build log in [PROGRESS.md](PROGRESS.md).

## How to make an episode

Below, `s01e02` stands for the new episode's id (letters, digits, `-` and `_`). Commands run from `dragons-kingdom/`.

1. **Write the screenplay with ChatGPT.** Give it [input/SCREENPLAY-FORMAT.md](input/SCREENPLAY-FORMAT.md) and ask for the
   episode in that format: scene headings with a `#2A#` number, character cues, `(parentheticals)`, and
   `[[ONSCREEN: ...]]` for on-screen text. Children are children (Abby, her LEFT arm injured); the rating rules in the format
   file apply.
2. **Get the shot list.** Paste [input/CHATGPT-SHOTLIST-PROMPT.md](input/CHATGPT-SHOTLIST-PROMPT.md) and the screenplay into
   ChatGPT. It answers with `shotlist.txt`: `SET` blocks first, then one `SHOT` block per shot. A set that does not exist yet
   gets a five-line description, and the engine builds it:
   ```
   SET CLING_BAKERY
   template: interior-room          # interior-room | town-square | sky-sea
   size: 6 x 5 x 3.2                # width x depth x height, metres
   world: CLING at [-14, 0, 9] facing east
   features: oven on north wall; counter across the middle; window east; door south; two oil lamps
   tod: 2A morning, sun az 110 el 18
   ```
3. **Put both files in `episodes/s01e02/input/`** (`screenplay.fountain`, `shotlist.txt`), and create
   `episodes/s01e02/episode.json`:
   ```json
   { "id": "s01e02", "title": "...", "scenes": ["2A", "2B"], "cuts": [{ "name": "edl", "scenes": ["2A", "2B"] }], "faces": "avoid" }
   ```
   The engine never writes in `input/`.
4. **Run the draft.**
   ```
   node engine/make-episode.mjs --episode s01e02 --stage all --draft stills --detach
   node engine/make-episode.mjs --episode s01e02 --status        # poll: renders, ETA, the next command
   ```
   It parses and checks the inputs (`final/validation.md`: errors stop it), casts the roles, builds the sets
   (`final/sets-report.md`), makes the voices, stages every shot, draws the animatic and renders one draft still per shot
   in the background (`--draft video --scenes 2A` for moving drafts of chosen scenes), then cuts and mixes the draft:
   `final/cut/DragonsKingdom_S01E02_draft-cut_<scenes>_mix.mp4`. Running it again only redoes what changed.
5. **Review.** Open `episodes/s01e02/engine/REPORT.md` (per scene: staged, flagged, approved, draft tier, warnings, the next
   command), `final/stage-report.md` (every FLAG and why), `final/sets-report.md` (feature words a set did not understand)
   and the stills (`output/director/s01e02/draft/stills/`, a contact sheet per set). Fix a flagged shot in
   `final/scenes/specs/<set>.touch.js`, or change the shot list and run step 4 again. A flag you accept as it is goes in
   `episodes/s01e02/review.json`: `{ "ok": { "2A-07": "what you looked at" } }`.
6. **Make the PC package and render on the PC.**
   ```
   node engine/make-episode.mjs --episode s01e02 --final
   ```
   This writes `final/render-jobs.json` and `final/render-schedule.md`, approves in the render gate every shot whose draft is
   up to date and has no open flag (`final/render-ready.json`), and prepares the sound delivery (`final/audio/`; publish it
   with `node pc/pack-sound.mjs <package> --episode s01e02 --record`). Push, then on the PC (RTX 5090):
   ```
   pc\Render-Episode.cmd --episode s01e02
   ```
   Check here with `node render/episode.mjs --episode s01e02 --status`. The masters appear in the PC's
   `output\episode-s01e02\`.

What stays yours: the story and canon, the shot list's creative choices, touch-ups of flagged shots, hero action, new
characters, creatures and bespoke props, music, real screams and singing, and approving the look.

## Reference
### What exists (all 7 phases: plumbing, template mining, input and validator, set sheets and casting, the ground and air auto-stager, the orchestrator, the set generator and the PC package)

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
| `engine/make-episode.mjs` | (phase 6) ONE command: `--episode E --stage parse|validate|cast|sets|vo|stage|previs|draft|cut|mix|package|all [--draft animatic|stills|video] [--scenes ..] [--only ..] [--restage] [--force] [--status] [--detach]`. Stamps in `episodes/<ep>/engine/state.json` (inputs / outputs hash per stage, per-shot keys for stage / previs / draft); an unchanged stage is skipped. Writes `episodes/<ep>/engine/REPORT.md` (also `--status`). |
| `engine/queue.mjs` | (phase 6) the DETACHED render queue: `start|run|status|stop --episode E`. One job per set (render-shots, workers 1), heartbeat, stale-pid take-over and resume, memory guard, set locks + `<builder>.auto.next.js` swap, re-queue of shots changed mid-render (max 2), then the post step (cut + mix). |
| `engine/lib/drafts.mjs` | (phase 6) per-shot render keys (the render-shots key parts + tier), D1/D2 sidecars `<work>/stills/<job>.d1.json`, queue paths. |
| `engine/previs/animatic.mjs` | (phase 6) D0 animatic frames from previs-core (sky / ground grid, sheet solids as prisms, people and dragons as shapes), pure Node PNG → `final/previs/<job>_<k>.png`. |
| `engine/vo/make_vo.py` | (phase 6) `--episode E`: voices.json (Episode 1's voice for a series role, else a free allowed Kokoro voice), takes with the Episode 1 preview DSP, pocketsphinx words; espeak-ng fallback. Run with `episodes/s01e01/final/tools/preview-venv/bin/python -I`. |
| `scenes/lib/sound/mix.mjs` | (phase 6) the shared mixer (`--episode`, default s01e01; `episodes/s01e01/final/sound/mix.mjs` is now a wrapper, same 1C bytes). Beds by set (`scenes/lib/sound/beds.json` unless the episode has its own), spots from the shot list's `sound:` (`sound-words.json`, `auto.mjs`), music only from a hand-made `sound/music/cues.json`. |
| `make-cut.mjs` tiers | (phase 6) best picture per shot: D2 video > D1 stills (slow push) > D0 animatic > slate; on for every episode with an episode.json (`--tiers` for Episode 1). |
| `engine/setgen/` | (phase 7) the SET GENERATOR. `plan.mjs --episode E [--write\|--check]`: per set reuse / variant / generate / error; `describe.mjs` parses a SET block (size, world, features matched against the template's vocabulary, unmatched phrases FLAGGED, tod); templates `interior-room` (masonry room, door, window, lamps, oven / hearth / counter / table / bench / shelf / bed / barrel / sack / crate / stool), `town-square` (`architecture/cling.js clingSquare(ctx, { layout })`), `sky-sea` (SKY_OFF_VERDOR's builder with the episode's sun). Writes `scenes/lib/director/sets/<id>.js` (a thin wrapper), `sets/sheets/<ID>.json` (marks, places, paths, vantages per wall and corner, solids: computed in Node from the same layout code the builder runs), `scenes/lib/director/registry-gen.js` (spread into SETS) and `final/continuity.js`. |
| `scenes/lib/director/staging/continuity.js`, `set-scene.js` | (phase 7) per-episode continuity: laid over the registry of one page / process; the engine's scene files call `set-scene.js createSetScene({ ..., continuity })`, build-shots applies it to the shot tables. Episode 1 has none. |
| `engine/package.mjs` | (phase 7) THE PC PACKAGE (`make-episode --final` / `--stage package`): `render-jobs.json` (a Node port of `final_render_schedule.py`), `render-schedule.md`, `render/gate.mjs approve` for reviewed + unflagged shots (`review.json` signs off a flag), the sound delivery (`final/audio/<TAG>_mix.wav`, `.en.srt`, `delivery.json`). |
| `--episode` on the PC side | (phase 7) `render/episode.mjs`, `render/gate.mjs`, `render/lib/schedule.mjs` (`scheduleFor`), `pc/render-episode.ps1` / `.sh` / `Render-Episode.cmd` (passed on), `pc/pack-sound.mjs`, `pc/sound-delivery.mjs` + `build-caches.mjs` (every episode's delivery), `pc/selftest-episode.mjs --episode E --size WxH`. Default s01e01, unchanged. `render/lib/shots.mjs` finds shotSet tables (CLING_SQUARE shots in `cling-square-2.shots.json`). |

### Commands

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
node engine/make-episode.mjs --episode t00 --stage all --draft stills --detach   # everything; renders run detached
node engine/make-episode.mjs --episode t00 --status        # REPORT.md: per scene, tier, queue, ETA, next command
node engine/setgen/plan.mjs --episode t00 [--write|--check]   # the set plan; --write builds the generated sets
node engine/make-episode.mjs --episode t00 --final         # + the PC package (render-jobs, schedule, gate, sound)
node render/episode.mjs --episode t00 --status             # the masters' status (gate: approved shots)
node pc/selftest-episode.mjs --episode t00 --size 128x72 --cpu   # render the approved shots small, assemble, check
node engine/queue.mjs status --episode t00                 # the queue alone (start|run|status|stop)
node scenes/lib/sound/mix.mjs --episode t00                # the mix of an episode's first cut
npm test                                                 # includes test/engine.test.mjs
```

A new episode works once it has `episodes/<id>/final/` with the same layout as Episode 1. It also needs `episodes/<id>/episode.json` with `{ "cuts": [{ "name": "edl", "scenes": [...] }, ...] }`. Then run `node scenes/lib/director/tools/build-shots.mjs --episode <id>`.

### Not yet

These parts don't exist yet:

- the stager's hand-match is below target: ground 55 %, air 41 % (target 70 %, see PROGRESS.md phase 5b);
- the harbour, coast-stacks and field templates (DESIGN.md section 4) are planned, not built; a variant's `dressing:` is flagged, not built;
- a generated room is plain (no bespoke props); the town-square template has no damage state yet.

Episode 1's sets and continuity stay in `registry.js`; generated sets live in `registry-gen.js`, each episode's continuity in its `final/continuity.js`.
