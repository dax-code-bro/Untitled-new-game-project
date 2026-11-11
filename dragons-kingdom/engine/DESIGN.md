# Dragon's Kingdom: episode-making engine (design)

Status: design, 2026-11-11. Scope: `dragons-kingdom/` only. Build progress is logged in `engine/PROGRESS.md`.

**Goal:** the owner hands over a screenplay and a shot list. The engine then builds the sets, stages the shots, renders, edits and mixes the episode end to end. Everything must be free or open source. Episodes are 50–60 min, native 4K at 24 fps, and drafts render on CPU here. The 4K masters render on the owner's PC (RTX 4090, `pc/`).

## 0. Where we stand (measured)
- **Episode 1 shot list:** `episodes/s01e01/final/shotlist.json` holds **726 shots**: 78,144 frames, 54.3 min.
  - Sizes: medium 318, wide 219, close 100, EWS 34, insert 33, POV 19.
  - There are 178 distinct `camera_move` strings. The top three are static 363, air-to-air 70 and static two-shot 35.
- **Specs written so far:** about 189 shots, in 13 files under `final/scenes/specs/*.spec.js`, after about 35 director sessions.
  - Camera rigs: static 109, follow 41, drone 15, boat 6, push 6, tilt 5.
  - About 59 of them use the framing solver (`frame:`).
- **Draft cost:** the median is 10.3 s per draft frame (`cut/timings.json`, 188 shots). A full-episode draft video would take about 225 CPU-hours here, which is not feasible, so the engine has draft tiers (§5.5).
- **Hard-coded episode path:** `episodes/s01e01/final` is hard-coded in `build-shots.mjs`, `render-shots.mjs`, `previs.mjs`, `still.mjs`, `shot-rows.mjs`, `cut-sheet.mjs`, `selftest.mjs`, `render/lib/schedule.mjs`, `render/episode.mjs`, `pc/sound-delivery.mjs`, `pc/build-caches.mjs`, `sound/mix.mjs` and `cut/assemble.sh`. `CUTS` is also hard-coded in `build-shots.mjs`.
- **Mixed data in `registry.js`:** it mixes shared set data (`SETS`) with Episode 1 continuity (`SCENE_CONTINUITY` '1A'...). Bare scene keys therefore clash across episodes, so continuity must be stored per episode.

## 1. Input from the owner (`episodes/<ep>/input/`)

### 1a. `screenplay.fountain` (a subset of Fountain)
```
Title: Dragon's Kingdom
Episode: S01E02
Rating: mature

EXT. CLING VILLAGE SQUARE — MORNING #2A#

The square the morning after. Smoke still rises from the north roofs.

ABBY
(quietly)
Is anyone left?

VENDOR
Enough.

[[ONSCREEN: CLING — THE MORNING AFTER]]
```
- **Scene number:** each scene heading needs a `#..#` number, and it must be unique within the episode.
- **Dialogue:** a cue line, then an optional parenthetical (this becomes `delivery`), then the line.
- **On-screen text:** `[[ONSCREEN: ...]]` lines go to `onscreen-text.json`.
- **Line ids:** the engine assigns ids `L001...` and keeps them stable in `final/lines.lock.json`. The key is the normalised text plus the speaker plus the scene.
- **Parser:** `engine/input/fountain.mjs`. It generalises `tools/extract_final_dialogue.py`, and its rating/child lint is ported from `tools/check_final.py`, with protected names taken from `CHARACTERS.md`.

### 1b. `shotlist.txt` (blocks of `key: value` lines; SET blocks first, then SHOT blocks)
```
SET CLING_SQUARE                       # existing set: reuse
SET CLING_BAKERY                       # new set: generated from a template
template: interior-room
size: 6 x 5 x 3.2
world: CLING at [-14, 0, 9] facing east
features: oven on north wall; counter across the middle; window east; door south; two oil lamps
tod: 2A morning, sun az 110 el 18

SHOT 2A-01
scene: 2A
set: CLING_SQUARE
size: wide                 # extreme wide | wide | medium | close | insert | POV
lens: 35                   # optional, full-frame-equivalent mm; default by size
move: static               # static | pan | tilt | push | dolly | track | air-to-air | aerial | drone | handheld | POV | OTS | two-shot
from: steps                # optional: a vantage name from the set sheet, or a bearing ("from 200")
frame: Abby L (sling left); Vendor R (at his stall)
action: Abby crosses from the arch toward the stall. The vendor looks up.
lines: ABBY "Is anyone left?"; VENDOR "Enough."
sound: fountain; distant smoke crackle
seconds: 7                 # optional: default = dialogue + action + breath
flags: ABBY_SLING_LEFT
trans: cut                 # cut | dissolve 24 | fade-in 24
stage: {"cam":{"mm":40}}   # optional raw spec fragment, merged last (expert escape hatch)
```
- **Line matching:** `lines:` entries are matched to screenplay lines by speaker and first words.
- **Parser:** `engine/input/shotlist-parse.mjs` writes `final/shotlist.json` in the **Episode 1 schema**: `seq, id, scene, set, shot_size, lens, camera_move, in_frame[{name, screen_pos, kind}], action, dialogue[], sound, continuity_flags, timing, frames_at_24fps, render`. The existing tools keep working.
- **ChatGPT prompt:** `engine/input/CHATGPT-SHOTLIST-PROMPT.md` gives ChatGPT the format, the set list, the cast and the vocabulary.
- **Validator:** `engine/input/validate.mjs` writes `final/validation.md`.
  - Errors stop the run:
    - unknown set or character;
    - a screenplay line not covered exactly once, in order;
    - a child build in an R* or rating shot;
    - frames ≤ 0.
  - Warnings only:
    - runtime outside 50–60 min;
    - unknown vocabulary.

## 2. Pipeline stages
| # | Stage | Exists | Missing | Kind |
|---|---|---|---|---|
| 1 | Screenplay → dialogue.json, onscreen-text.json | `s01e01/tools/extract_final_dialogue.py`, `check_final.py` | generic Fountain parser, lines lock | auto |
| 2 | Shot list → validated shotlist.json | `tools/shotlist/final_build.py` (+ hand-written Python data) | owner text format, parser, validator | auto |
| 3 | Set plan | `registry.js`, `sets/*.js`, the `shotSet` wrapper (cling-square-2, verdor-aerial-2) | `engine/sets/plan.mjs`, set sheets, generator, per-episode continuity | reuse/variant auto; a new look needs judgment, once per set |
| 4 | Shot staging | hand-written specs; `camera.js`, `blocking.js`, `actions.js`, `framing.js`, `handprops.js`, `fx.js` | auto-stager (§3) | auto plus flags; about 20–30% need touch-up |
| 5 | Previs and framing checks | `tools/previs.mjs`, `audit.js` (faceReadability, cutCheck), `framing.js`, `still.mjs`, `render-shots --stills`, `contact.mjs` | pure previs core, scoring, adjust loop, animatic frames | auto |
| 6 | Draft render | `render-shots.mjs` (48-frame segments, locks, resume, stale-skip, retry, timings) | detached queue, `--episode`, D0/D1/D2 tiers, re-queue of stale shots | auto |
| 7 | Cut / EDL | `build-shots.mjs`, `cut/make-cut.mjs`, `assemble.sh`, `check-sync.py`, `cut-sheet.mjs`, `shot-rows.mjs` | cuts per scene from episode.json; previs or still placeholders instead of slates | auto |
| 8 | Voice | `final_voices.py` (Kokoro), `make_final_vo.py` (Kokoro + SoX + pocketsphinx), `humans/lines-s01e01.js`, `lipsync-s01e01.json` | `engine/vo/make_vo.py --episode`; per-episode lip-sync | auto (screams and singing need real recordings) |
| 9 | Sound mix | `final/sound/mix.mjs`, beds.json, fx/spots.json + synth.mjs, music/cues.json + scores.mjs | shared mixer; beds by set; spots from `sound:` and action verbs; music cue sheet | beds/spots auto, music manual |
| 10 | 4K PC package | `render/episode.mjs`, `gate.mjs`, `final_render_schedule.py`, `pc/*.cmd`, `build-caches.mjs`, `pack-sound.mjs` | `--episode` everywhere; masters for shotSet tables; per-episode sound delivery | auto; gate approval is the human sign-off |

## 3. Auto-stager (`engine/stager/`, pure Node, no LLM)

The entry point is `stageShot(row, ctx) → { spec, report }`, where `ctx = { sheet, cast, prev, sceneClock, policy }`.
- **Deterministic:** the same input gives a byte-identical spec, with stable key order. This matters because renders are keyed by spec content.
- **Version pinning:** the stager version is pinned in `engine/state.json`. Re-staging with a newer stager needs `--restage`.

### 3.1 Row → intent (`intent.mjs`)
```js
{ id: '2A-01', set: 'CLING_SQUARE', size: 'WS', mm: 35, mmLocked: false, move: { kind: 'static' },
  subjects: [ { name: 'ABBY', actor: 'abby', kind: 'person', pos: 'L', note: 'sling left' },
              { name: 'VENDOR', actor: 'vendor', kind: 'person', pos: 'R', note: 'at his stall', at: 'stall' } ],
  acts: [ { who: 'abby', verb: 'walk', from: 'arch', to: 'stall' }, { who: 'vendor', verb: 'look', at: 'abby', t: 'late' } ],
  lines: [ { id: 'L004', speaker: 'abby' }, { id: 'L005', speaker: 'vendor' } ], frames: 168, flags: ['ABBY_SLING_LEFT'], from: 'steps' }
```
- **Verbs** come from a keyword table, `verbs.json`:
  - human movement: cross, walk, enter, exit, go, run;
  - posture: turn, look, kneel, crouch, sit, bow, lean;
  - gestures: wave, point, raise hand, reach, carry, nod, shake head;
  - dragon movement: fly, skim, climb, dive, glide, bank, roll, land, launch, hover, crouch, walk;
  - camera: POV.
- **Places:** words naming a sheet mark or alias become `to`/`at`.
- **Unknown verbs:** these go to `report.unstaged`, never guessed.

### 3.2 Shot templates (mined from hand-written specs; phase 1 measures them → `engine/stager/templates.mined.json`)
Distances are on the Super 35 sensor (`camera.js`, 24.89 mm). The shot list's "medium" means about 1.4–1.8 m of subject visible, so the band numbers must come from the specs, not from the textbook.

| Template | When | Camera recipe | Mined from |
|---|---|---|---|
| establish-wide | wide/EWS static ground | sheet vantage, 35 mm f/8, height 2–3 m, about 9 m of frame height at the target (12–25 m away); shadowAt the target | X5-02, X5-09, X4-07 |
| travel-pan | pan | follow rig, 4–8 m drift, look keys through the named landmarks, ≤ 30°/s | X5-03 |
| medium-action | medium + 1 person with acts | 50 mm f/5.6, height 1.6–1.7 m, 5–9.6 m away, side from facing/act bisector | X5-04/06/08 |
| two-shot | two-shot, or 2 people + lines | camera on the side giving A on L and B on R; 50 mm f/4.5; about 4.9 m or the solver with search+clear | X5-14, R3-03, X6-17 |
| single-close | close + 1 person | solver head at [±0.1, 0.15–0.18], from facing + 200–215°, 85 mm f/2.8, 3.4–3.6 m, track if moving | 1C-09, X6-10 |
| ots / back | OTS, or faces policy 'avoid' while speaking | solver from behind the listener | 1A-21/22 |
| insert | insert / macro | 100 mm f/4, height 0.24–0.5 m, 2.5–4.5 m away, focus on the mark | X5-01, X5-05 |
| air-to-air | air-to-air / dragonback | follow + frame on rider.head or creature.chest, heading-relative 200–312°, 9–15 m away, rise 1.2–1.6, track | X6-08/13, 1C-07 |
| camera-ship | long lens, 2 dragons | shipCam 300–800 m, 135–180 mm, depression ≥ vfov/2 + 2.5° | 1C-10, X6-01/16 |
| pov | POV | pos actor.head + [0, 0.6, 0], 35 mm, aerial shake if riding, actor hidden | 1C-08, X5-17 |
| pass-by | threads / passes close | static on the path ahead, focus pull far→near | X6-09, X4-10 |
| drone-reveal | aerial drift, no cast | drone rig, 3–5% push, 35 mm f/8 | X6-02/03 |
| crowd-reaction | crowd reacts | extras on area slots; look at the event at t ± 0.4 s; 1 in 3 raises a hand; walkers on paths | X4-07 |
| card | black/text | CARD_BLACK | P-01 |

The template is picked by a decision table, `select.mjs`, keyed on size, move, subject kinds, count, whether there are lines, and the set kind. It also returns fallback variants.

### 3.3 Shared staging helpers (`scenes/lib/director/staging/`)
These replace helpers that are copied between specs today.
- **`flight.js`:**
  - `fly`, `inForm`, `pair`, `posAt`, `localFrame`, `shadowOf`/`shTrack`;
  - beat presets LEAF_FLY, LEAF_SKIM, CHAR_FLY (hz 0.625, which the sound spots lock), CHAR_GLIDE and `perch`;
  - the per-scene `formationClock`.
- **`ground.js`:** `place`, `walkTo`, `postureFor`, `reachTo`, `lookAtEvent`.
- **`talk.js`:**
  - line gaps: the first 0.3–0.8 s, then 0.15–0.3 s;
  - speakers look at each other (0.6–0.9);
  - listener nods or shakes the head.
- **Screen direction:** the 180° lines per scene are kept in the sheets. A camera on the wrong side is rejected unless the move says "reverse".

### 3.4 Set sheets (`scenes/lib/director/sets/sheets/<SET>.json`, Node-readable, no three.js)
```json
{ "set": "CLING_SQUARE", "frame": "CLING", "kind": "ground-exterior",
  "ground": { "type": "plane", "y": 0.03 }, "bounds": null,
  "marks":   { "fountain": { "at": [0, 0.03, -2], "r": 3.2, "alias": ["pillar"] }, "stall": { "at": [-8.5, 0, 3], "face": 0 } },
  "areas":   { "square": { "poly": [[-20,-18],[20,-18],[20,24],[-20,24]], "slots": 24 } },
  "paths":   { "alley-stall": [[-8.6,-18],[-8.6,-6],[-8.5,0.6]] },
  "vantages":{ "steps": { "pos": [3,2.15,19.8], "look": [-0.6,1.7,-4], "mm": 35, "from": "X5-02" } },
  "solids":  [ { "box": [[-20,-26],[20,-18]], "h": 9, "what": "north row" }, { "cyl": [0,-2], "r": 0.5, "h": 3.4 } ],
  "lines":   { "1C": { "a": [4,18], "b": [0,-18], "camSide": "south" } },
  "state":   { "stall": "poles/bars/cloth 0..1, low, off, snag" },
  "cost": { "heavy": true, "workers": 1 } }
```
- **How sheets are made:** `engine/tools/sheet.mjs --set X` builds them from:
  - the builder's static exports (CLING, STALL, MAP, DEF, gapFrame);
  - `clingSquare({layoutOnly: true})`;
  - the spec's previs marks;
  - every hand-written camera, which becomes a named vantage.
- **Drift check:** a hook in `stage.js` warns when the runtime marks drift from the sheet.
- **Occlusion:** `solids` give previs its occlusion rays.

### 3.5 Casting (`engine/cast/casting.mjs` → `final/cast.lock.json`)
- **Inputs:**
  - `CHARACTERS.md`: adult or child, and the protected names;
  - `humans/index.js` CAST/CROWD, split out as a pure `humans/cast-list.js`;
  - age and sex from `offline/characters.py`;
  - the creature ids.
- **Named roles:**
  - ABBY → `abby`, or `abby_ride` when riding;
  - continuity flags choose variants (`abby_injured`, `abby_ride_injured`, `abby_sling`); the same applies to REMI and FALL;
  - a rider is always cast with its mount.
- **Generic roles:**
  - roles with their own builds: VENDOR, GUARD#, SAILOR#, WATCHMAN, MUSICIAN, PARENT, CHILD;
  - woman/man/villager/lookout/crew → `crowd##` filtered by sex and age, chosen by a deterministic hash(ep, scene, role), unique within the scene;
  - a cast choice is locked for the whole episode.
- **Rating guard (hard error):** no child-capable build in R* or NO_CHILD_IN_FRAME shots.
- **Dragons:**
  - LEAF → `leaf`, CHARCOAL → `charcoal`, STARLIGHT, SCOUT;
  - "working dragon" → `{id: 'leaf', opts: {look: 'scout'}}`.

### 3.6 Framing check and adjust loop (no render)
1. **Previs core:** `scenes/lib/director/previs-core.js` is the pure part of previs.mjs.
   - `measure(spec, shot, t)` returns, per subject: the head's screen position, the body box, distance, the visible fraction, and what occludes it (other heads, plus rays against the sheet solids).
   - It also runs camera sanity checks: above the ground, inside the room bounds, minimum distance, sun angle, and the long-lens horizon rule.
2. **Scoring** happens at t = 0.15, 0.5 and 0.85. The checks are:
   - the subject is in frame;
   - it is on the requested side;
   - its size is in the band for the size class;
   - the speaking-face rule (`audit.faceReadability` + the episode's `faces` policy);
   - `audit.cutCheck` against the previous shot on the same set.
3. **Adjusting:** at most 12 tries, keeping the best:
   1. distance ×/÷ 1.2;
   2. re-aim with `solveFraming`;
   3. rotate `from` ±20/40/60°;
   4. raise the camera 0.5 m to clear occlusion;
   5. step the lens 35↔50↔85, only when the lens was not locked;
   6. use the template's fallback variant.
4. **Result:** `report = {score, tries, fixes[], flags[]}`. A low score or an unstaged act gives **FLAG**. The shot is still written and rendered, and listed for touch-up.
5. **Optional D1 stills:** `render-shots --stills 0.5 --sets X` gives a contact sheet per set. Each still is checked automatically for near-black and for sky-only (edge density in the lower 2/3).

### 3.7 Output files and touch-up
```
final/scenes/specs/<set>.auto.js     GENERATED (header: engine version + input hash), never edited by hand
final/scenes/specs/<set>.touch.js    hand/LLM overlay { '<shot>': {...partial, deep-merged}, '<shot2>': {lock: true, ...whole} }
final/scenes/specs/<set>.spec.js     GENERATED: export default mergeSpecs(auto, touch)
final/stage-report.md|json           per shot: template, score, fixes, FLAGS, unstaged phrases, previs path
```
Where a human or LLM steps in:
- **(a)** writing the shot list (ChatGPT);
- **(b)** `touch.js` for flagged shots only;
- **(c)** looking at the D1 contact sheets;
- **(d)** bespoke props and set state in builder code;
- **(e)** music and performance.

## 4. Set generator (`engine/setgen/`)
`plan.mjs` decides one of:
- **reuse:** the set is in the registry;
- **variant:** a registry set with a different time of day or `dressing:`, written as a shotSet-style wrapper;
- **generate:** a SET block with a template;
- **error:** none of the above applies.

`describe.mjs` parses the SET block. Feature phrases are matched against the template's vocabulary, and anything unmatched is flagged.

| Template | Reuses | Params |
|---|---|---|
| town-square | `architecture/cling.js clingSquare`, `nature/farmland.js`, `sets/town.js` | square w/d, rows, fountain, steps, arch/gate, seed, damage. **Needs** `clingSquare(ctx, {layout})` |
| harbour | `verdor-aerial.js` + `verdor-harbor.js` (MAP-driven), `architecture/verdor.js`, `props/boat.js` | MAP: quay, ship, breakwater, terraces, market |
| coast-stacks | `sky-off-verdor.js`, `outer-rocks.js` (DEF, gapFrame, foam, birds) | gap, stacks, mist side |
| interior-room | `alexandria-room.js`/`palace-corridor.js` pattern, `interiors.js`, `openings.js`, `masonry.js`, `common.js` | ROOM {w, d, h}, openings, furniture slots, lamps, plaster/stone |
| sky-sea | `sky-off-verdor.js`, `cloud-deck*.js`, `dk/ocean.js` | coast, cloud deck, mist, sun |
| field | `verdor-grounds.js`, `farmland.js`, `meadow.js`, `grass.js` | size, hedges, structures |

Generated outputs:
- `sets/<id>.js` (a thin wrapper);
- `sets/sheets/<ID>.json`;
- `registry-gen.js`, which is spread into SETS;
- `final/continuity.js`, which `createSetScene({..., continuity})` reads. Episode 1 keeps `SCENE_CONTINUITY`.

## 5. One command
```
node engine/make-episode.mjs --episode s01e02 [--stage parse|validate|cast|sets|stage|previs|vo|draft|cut|mix|package|all]
     [--draft animatic|stills|video] [--final] [--scenes 2A,2B] [--only 2A-01,..] [--restage] [--force] [--status] [--detach]
```

### 5.1 Folder layout
```
episodes/s01e02/
  input/          screenplay.fountain, shotlist.txt, notes.md   (owner; the engine never writes here)
  episode.json    { id, title, scenes, cuts: [{name, scenes}], faces: 'lipsync'|'avoid', stagerVersion, draftTier }
  final/          dialogue.json, onscreen-text.json, lines.lock.json, shotlist.json, validation.md, cast.lock.json, continuity.js,
                  voices.json, vo/, scenes/<set>.js|.shots.json, specs/<set>.auto|touch|spec.js, stage-report.md, previs/,
                  cut/ (edl-<scene>, audio-cues, timings, cut-report, mp4 ignored), sound/ (beds, fx, music data),
                  render-jobs.json, render-schedule.md, render-ready.json, audio/delivery.json
  engine/         state.json, queue/{state.json, log.txt, pid}, REPORT.md
```

### 5.2 Resumable and idempotent
- **Stamps:** each stage declares its `inputs()` and stamps `{inputsHash, outputsHash, at, ok}` in `engine/state.json`. A stage whose inputs are unchanged is skipped.
- **Per-shot grain:** the key is hash(row, sheet, cast lock, touch entry).
- **Generated files** carry a hash header. If a hand edit is detected, the engine writes `<file>.new` instead of overwriting it.

### 5.3 Skip-on-change safety
- **Locked sets:** while `engine/queue/<set>.lock` is held, new specs go to `<set>.auto.next.js`. They are swapped in once that set's job ends.
- **Append-only cast:** the top-level spec `cast` only grows, sorted by first use.
- **Stale shots:** after each set job, `render-shots --dry-run` re-queues stale shots, at most twice.

### 5.4 Detached render queue (`engine/queue.mjs`)
- **Detached:** `--detach` spawns `queue.mjs run` detached (`spawn(..., {detached: true}).unref()`) and returns immediately. Agent tool calls have a 2 h limit, so they only start and poll.
- **One job per set, in order:** `render-shots --episode E --sets X --only ids --work final/.work --workers 1 --segment 48`.
  - Workers stay at 1 because heavy sets have run out of memory.
- **Memory guard:** `os.freemem() > sheet.cost.need`.
- **Liveness:** a heartbeat every 30 s; a stale pid is cleaned up.

### 5.5 Draft tiers
- **D0 animatic:** schematic previs frames plus the voice. The whole episode takes minutes.
- **D1 stills:** 1–3 draft stills per shot, held or with a slow push. About 12 CPU-hours per episode.
- **D2 video:** only with `--scenes`/`--only`. About 4 CPU-hours per minute.

`make-cut.mjs` takes the best picture available per shot: D2 > D1 > D0 > slate.

`--final` builds the PC package: `render-jobs.json` (a Node port of `final_render_schedule.py`), `gate.mjs approve` for reviewed, unflagged shots, and the sound delivery. The owner then runs `pc\Render-Episode.cmd --episode s01e02`.

### 5.6 Progress report
`engine/REPORT.md` (also `--status`) shows, per scene:
- shots staged / flagged / approved;
- the draft tier reached;
- renders done and left, with an ETA;
- warnings;
- the queue state;
- the next command to run.

## 6. Build plan (7 phases, about 60 min each)

Each phase must leave something usable.

1. **Plumbing and template mining**
   - Build:
     - `scenes/lib/director/episode-paths.js` (`dirs(ep)`);
     - an `--episode` flag (default s01e01) on build-shots, render-shots, previs, still, shot-rows, cut-sheet, selftest and make-cut;
     - read CUTS from episode.json when it exists;
     - extract `previs-core.js`;
     - `engine/tools/mine-specs.mjs` → `templates.mined.json`.
   - **Test:**
     - `build-shots --check` exits 0, and the s01e01 tables and EDLs are byte-identical;
     - the previs output is unchanged;
     - `npm test` passes;
     - mining covers ≥ 170 specs.
2. **Input and validator**
   - Build:
     - the Fountain parser and the shotlist.txt parser;
     - the lines lock and `validate.mjs`;
     - the ChatGPT prompt;
     - a `shotlist.json` → `shotlist.txt` exporter.
   - **Test:**
     - a round trip of the 81 1C rows (export, then parse) gives the same fields;
     - a 3-shot `episodes/t00` passes validation;
     - 6 planted errors are all reported.
3. **Set sheets and casting**
   - Build:
     - `sheet.mjs` for CLING_SQUARE, VERDOR_AERIAL, VERDOR_HARBOR, OUTER_ROCKS, SKY_OFF_VERDOR and BIRTHING_CHAMBER;
     - `casting.mjs`;
     - `cast-list.js`.
   - **Test:**
     - every mark used in those specs resolves;
     - 1C casting matches the hand-written choices for ≥ 90% of shots;
     - no child build appears in R3-02..04;
     - an occlusion ray reproduces the X6-01 r1 stack occlusion.
4. **Auto-stager v1 (ground)**
   - Build:
     - the templates establish-wide, medium-action, two-shot, single-close, ots, insert, crowd-reaction and travel-pan;
     - `ground.js` and `talk.js`;
     - the check/adjust loop.
   - **Test:** re-stage the 22 Cling shots (X5-01..18, R3-01..04) into a scratch spec, then check:
     - ≥ 80% of subjects in frame and on the right side;
     - ≥ 70% within 45° bearing and ×1.5 screen height of the hand-made shot;
     - build-shots places every line;
     - 5 D1 stills are neither black nor sky-only.
5. **Auto-stager v2 (air)**
   - Build:
     - `flight.js`;
     - the templates air-to-air, camera-ship, pov, pass-by and drone-reveal;
     - the formation clock and screen-direction lines.
   - **Test:**
     - re-stage the 1C X4 aerials and X6-01..18, using the same metrics as phase 4;
     - the horizon rule passes;
     - `previs --cuts` reports no undeclared crossed eye-lines.
6. **Orchestrator, queue and drafts**
   - Build:
     - `make-episode.mjs` with stamps;
     - the detached `queue.mjs`;
     - REPORT.md;
     - D0/D1 in make-cut;
     - the mixer moved to `scenes/lib/sound/mix.mjs`;
     - `engine/vo/make_vo.py --episode`.
   - **Test:** the 3-shot `t00` episode runs end to end, giving a stills cut with voice-over and a mix at -16 LUFS. Then:
     - a re-run is up to date in under 30 s;
     - editing one row re-renders only that shot;
     - killing the queue and restarting it resumes the render.
7. **Set generator and PC package**
   - Build:
     - the templates interior-room, town-square (with the clingSquare layout param) and sky-sea;
     - `registry-gen.js` and per-episode continuity;
     - `--episode` in render/episode.mjs, schedule, gate, pc/render-episode.ps1/.sh and sound-delivery;
     - masters that find shotSet tables.
   - **Test:**
     - CLING_BAKERY builds from a 5-line description;
     - its marks lie inside the room;
     - its D1 still shows walls, door and window;
     - t00 gets a 4th shot there;
     - `render/episode.mjs --episode t00 --status` lists 4 approved shots;
     - `pc/selftest-episode.mjs --episode t00` passes at a small size.

## 7. Risks, and what stays manual
**Risks:**
- **Action breadth:** fights, fire, destruction, hand contact and the like go beyond the verb table. Expect 20–30% of shots flagged, more in action scenes, so grow `verbs.json` and the templates from each touch-up.
- **Size words and lens mm** don't match the Super 35 sensor, so use mined bands.
- **Previs is approximate:** standard body sizes, coarse solids, no light. Light problems and sky-only frames only show up in stills.
- **Builder-specific set state** (stall, ladder, door, net) is used only when declared in the sheet; otherwise the shot is flagged.
- **Determinism:** any change to the stager re-renders everything, so the version is pinned and re-staging is opt-in.
- **CPU:** full draft video isn't feasible here, so quality is judged on the PC masters.
- **OOM, the 2 h tool limit and edits during a render** are handled by workers 1, the detached queue, set locks and `.next` specs.
- **Continuity across episodes:** the registry and lip-sync data are Episode 1-specific and must be made per-episode before Episode 2.
- **Speaking faces:** the faces policy defaults to `avoid` until the owner approves face close-ups.

**Manual (the owner, or an agent the owner directs):**
- the story, screenplay and canon;
- the shot list's creative choices;
- touch-up of flagged shots, hero action, new creature and character designs, and bespoke props;
- music and emotion mixes;
- real recordings of screams and singing;
- look approval, `gate approve`, and final pacing.
