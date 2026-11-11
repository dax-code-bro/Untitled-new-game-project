# Engine build progress

See DESIGN.md. Phases 1-7; each session appends a section here.

## Phase 1: plumbing and template mining (2026-11-11)

**Built**
- `scenes/lib/director/episode-paths.js`: `dirs(ep)`, `episodeArg(argv)`, `episodeConfig(ep)` and `episodeCuts(ep, fallback)`. Episode ids are validated (`[a-z0-9][a-z0-9_-]*`).
  - Episode 1 keeps its dailies folder (`output/director/<preset>`). Other episodes use `output/director/<ep>/<preset>`.
- `--episode <id>` (default s01e01) now works in:
  - build-shots, render-shots, previs, still, shot-rows (plus `--edl`), cut-sheet and selftest;
  - `episodes/s01e01/final/cut/make-cut.mjs`, whose output name now uses `<EP>` and whose default dailies come from that episode's work folder.
- build-shots reads `cuts` from `episodes/<ep>/episode.json` when it exists. Otherwise it uses the old constant.
  - `--scenes` gives the first cut's name when it matches the first cut's scenes.
  - The EDL title and md header use `dirs(ep).tag`, which gives the same bytes for S01E01.
- render-shots: `coreHash` leaves out `episode-paths.js` and `previs-core.js`. These files never reach a picture, so adding them made no shot stale under `--redo-on core`.
- `scenes/lib/director/previs-core.js` holds the measuring code moved verbatim from previs.mjs, now parameterised by `spec`: `shotEnv`, `cameraAt`, `analyse`, `mergeShot`, `shotSpec` and `measure(spec, shot, t, {row})`. previs.mjs keeps the drawing, the CLI and `--cuts`.
- `engine/tools/mine-specs.mjs` writes `engine/stager/templates.mined.json`. It is deterministic and has a band table on stdout.
- `test/engine.test.mjs` is now part of npm test. It runs:
  - the director selftest, including `build-shots --check`;
  - a check that a bad id is refused;
  - mining coverage of ≥ 170, with the same bytes twice.
- The selftest gained two checks: the episode paths, and `measure()` reproducing previs on 1A-29 (camera at 1.25, 1.75, 2.80; Abby hidden by Remi).

**Acceptance**
- `build-shots --check` exits 0.
- A full write run changes only `edl-1C.json` and `edl-1C.md`, and only in their render-cost figures. The HEAD version of build-shots writes the same bytes (`cmp`), so this drift is old: `cut/timings.json` was committed after the EDLs. All other tables and EDLs are byte-identical to HEAD.
- `previs --set CLING_SQUARE --cuts` is identical to the run saved before the change. So are the full previs and `--cuts` output for 8 sets: CLING_SQUARE, BIRTHING_CHAMBER, VERDOR_AERIAL, OUTER_ROCKS, SKY_OFF_VERDOR, CLING_SQUARE_2, VERDOR_AERIAL_2 and ALEXANDRIA_ROOM.
- `render-shots --dry-run` gives the same plan as the HEAD version.
- Mining covers 188 shot specs. 179 are measured and 154 have a subject on camera. The 9 not measured are:
  - six boat-mounted cameras, P-02..07;
  - R1-01 and X1-02, whose frame subjects have no previs marks;
  - X1-03, which has an unknown mark "door".
- A sample check against DESIGN: X5-02 measures 35 mm at f/8, camera height 2.15 m, 24 m to the aim point, 9.6 m of frame height. This matches "establish-wide".

**Hard-coded `s01e01` paths still left (code, not comments)**
- `render/lib/schedule.mjs` DEFAULT_SCHEDULE.
- `render/episode.mjs` and `render/gate.mjs`, through schedule.mjs. `render/lib/shots.mjs` mentions the path in comments only.
- `pc/sound-delivery.mjs` DELIVERY_FILE.
- `pc/build-caches.mjs`: KOKORO_DIR (`episodes/s01e01/preview/.cache/kokoro`) and the delivery messages.
- `pc/pack-sound.mjs`: the tar name `dk-s01e01-...`.
- `episodes/s01e01/final/sound/mix.mjs`: the beds, cue-sheet and spots paths written into its report. It also lives inside the episode, and phase 6 moves it.
- `episodes/s01e01/final/cut/assemble.sh`: every path, plus the `S01E01` output name. It calls make-cut without `--episode`, which is fine for Episode 1.
- `episodes/s01e01/final/cut/check-sync.py`, `sound/fx/fx.mjs` and `sound/music/render.mjs`: Episode 1-local tools.
- `scenes/lib/humans/perform.js` / `faceperf.js` (`data/lipsync-s01e01.json`, `lines-s01e01.js`) and `offline/lipsync_align.py`: per-episode lip-sync, which is phase 6/7.
- `registry.js` `SCENE_CONTINUITY` is still Episode 1 only (phase 7).

None of these was converted: they are the render/pc/sound ones that phases 6 and 7 own.

**For the next phases**
- Use `dirs(ep)` and `episodeArg` for every new tool.
- `measure()` needs a shot-table row (`frames`, `dialogue`) to know who speaks. Without one, nobody speaks and frames default to 96.
- The mined bands disagree with some DESIGN guesses, so the stager should use the mined numbers:
  - MS/medium-action has a median distance of 4.5 m (p10–p90 2.4–11 m) at 40 mm (28–50);
  - X5-04 is 10.8 m.
- The template guess is a first decision table. `crowd-reaction` and `two-shot` are guessed from people counted in frame.
- `bearing_rel`: 0 means the camera is in front of the subject, 90 means the subject's right. `from` follows framing.js (0 = from the north).
- 24 measured shots have no cast subject: landscapes, inserts on props, an empty POV. For these, use `look_dist` / `look_frame_h_m`.

## Phase 2: input and validator (2026-11-11)

**Built** (all in `engine/input/`, pure Node, no dependencies)
- `common.mjs`: the shared pieces.
  - The Episode 1 timing model and subtitle splitter, ported from `extract_dialogue.py`. They give the same `est_seconds`, `subtitle_cues` and `subtitle_min_seconds` as Episode 1 on all 385 of its lines.
  - Text and speaker normalisation.
  - Who is who: `CHARACTERS.md` (adult or child, with aliases), the humans `CAST` ids (read from `humans/index.js` as text, without importing three.js), creatures and generic roles.
  - The `final_build.py` regexes (DRAGON/HUMAN/CHILDISH) and the `check_final.py` regexes (VICE/PROTECTED).
  - The size and move vocabulary.
  - `safeWrite`, which refuses any path inside `episodes/*/input/`.
- `fountain.mjs`: `input/screenplay.fountain` → `final/dialogue.json`, `onscreen-text.json` and `lines.lock.json`.
  - Uses the Episode 1 schemas. Every line field is kept; new episodes have `origin: 'original'`.
  - Scene numbers `#2A#` are required and unique.
  - `[[ONSCREEN: ...]]` becomes a card.
  - The parenthetical becomes the performance note, and `to X` sets the addressee.
  - The rating lint (child + vice word) gives warnings.
  - `--check` reports whether the outputs are out of date.
  - Lock: the key is `scene|SPEAKER|normalised text` (`#n` for a repeat). An id is never renumbered or reused.
- `shotlist-parse.mjs`: `input/shotlist.txt` → `final/shotlist.json` in the full Episode 1 schema (meta, sets, conventions, flag/tag definitions, shots, scene_totals, unit_totals, totals), plus `final/sets.plan.json`.
  - SET blocks are classed as reuse, variant, generate or unknown.
  - `lines:` entries are matched by speaker and first words. The search goes forward from the last match, prefers the same scene, and can take an explicit `=L042`, portions `x0.5` and `(off)`.
  - `frame:` entries are `Name POS (note)` or `Name @ POS`. An optional `[element|person|dragon]` sets the kind; otherwise the kind follows the Episode 1 rule, then the cast. An unknown capitalised name counts as a character, so the validator catches it, while lower-case words count as things.
  - The default timing is the Episode 1 model (dialogue + 0.35 s per line + action + breath), with action and breath from the Episode 1 medians per size: no dialogue EWS 5 / WS 4 / MS 2.5 / CU 2.5 / INS 3 / POV 3; with dialogue 1 / 2 / 0.5 / 1 / 1.5 / 4.
  - Optional keys: `seconds:`, `frames:` and `timing: action A, breath B`.
  - `native_4k_s_per_frame` is the Episode 1 median for the set.
  - `from`, `trans` and `stage` go in an extra `engine: {}` key, which is present only when one is given.
  - It refuses to overwrite s01e01's shot list unless `--out` is given.
- `export-shotlist.mjs`: shotlist.json → shotlist.txt (`--scenes`, `--sets`, `--ids`).
- `validate.mjs`: parses both inputs in memory → `final/validation.md`. It exits 1 on errors. `--write` also writes the parser outputs, and `--json` is for tests.
  - Error codes: E_SET, E_CHAR, E_LINE_MISSED/TWICE/ORDER/UNKNOWN, E_CHILD (R* or NO_CHILD_IN_FRAME), E_FRAMES, E_DUP_SHOT, E_SYNTAX and the screenplay errors.
  - Warnings: W_RUNTIME (skipped for `"test": true`), W_SIZE, W_MOVE, W_KEY, W_SCENE, W_LINE_SCENE, W_RATING and W_SET_BLOCK.
- `CHATGPT-SHOTLIST-PROMPT.md`: the format, vocabulary, the 12 sets with one-line descriptions, the cast and the rating rules. `SCREENPLAY-FORMAT.md` is the owner's guide.
- `episodes/t00/`: `episode.json` (`test: true`, one cut `edl` = [0A]), `input/screenplay.fountain` (3 lines, VENDOR/MUSICIAN) and `input/shotlist.txt`. The shot list has 3 shots on CLING_SQUARE: an establishing wide from `steps`, a two-shot and a lute insert. Its generated `final/` is committed: 276 frames, 0.19 min.
- `engine/input/fixtures/bad/`: the validator fixture with 6 planted errors.

**Acceptance** (`test/engine.test.mjs`, now 8 tests)
- Round trip: the 81 1C rows go through export, then parse. Shots are matched by speaker and words, with no ids in the text. Id, scene, set, shot_size, lens, camera_move, in_frame (name, pos, kind), dialogue (id, portion, on screen), frames, action, sound, flags and timing are identical. Beyond the test, every one of the 25 shot keys round-trips (checked by hand once).
- t00: 0 errors, 0 warnings, and the committed `final/` files match a fresh run.
- Fixture: exactly the 6 planted errors are reported (E_SET, E_LINE_ORDER, E_CHAR, E_FRAMES, E_CHILD, E_LINE_MISSED), and nothing else.
- Also tested: the timing and subtitle port matches Episode 1 on all 385 lines; line ids survive an inserted line plus a punctuation edit; `safeWrite` refuses `input/`.

**For the next phases**
- Run `node engine/input/validate.mjs --episode <ep> --write` (phase 6's `parse`/`validate` stages).
- Shot-row extras for the stager are `row.engine.from` (a vantage or a bearing), `row.engine.trans` and `row.engine.stage` (a raw spec fragment).
- `final/sets.plan.json` holds the SET blocks for phase 7. Their `features` is already split on `;`.
- Registry `continuity` is keyed by Episode 1 scenes, so new scenes get `lighting: ''`. Phase 7's per-episode continuity should fill it.
- `castInfo()` and `isChildName()` in `common.mjs` are a first casting table; phase 3's `cast-list.js` should replace the text parse of `humans/index.js`.

## Phase 3: set sheets and casting (2026-11-11)

**Built**
- `engine/tools/sheet.mjs [--set X|all] [--check]` → `scenes/lib/director/sets/sheets/<SET>.json` for CLING_SQUARE, VERDOR_AERIAL, VERDOR_HARBOR, OUTER_ROCKS, SKY_OFF_VERDOR and BIRTHING_CHAMBER (DESIGN §3.4 format, plain JSON, deterministic; `--check` exits 1 when one is stale).
  - Sources: the builders' static exports (CLING, STALL, MUSIC, WATCH, DOOR, DEF, gapFrame, stackRing, coastX, FIELD, NEST_C, EGG, NEST, MASTHEAD), `clingSquare({ layoutOnly: true })` (it already existed: 73 Cling house footprints), the specs' `map`, previs marks, previs bounds and homes, the shot list and `cut/timings.json`.
  - Builders are only imported, never built. A Node resolve hook maps the browser import map's `dk/` to `runtime/lib/`. No builder or spec was edited.
  - Each sheet has: `marks` (with `alias`; terrain-dependent ones carry `approx: true`), `objects` (the builder's set objects, rest position or `at: null` + `moves` when keyed per shot), `homes`, `areas` (poly, y, `slots` count and `slotAt` points clear of solids), `paths`, `vantages` (EVERY hand-written camera of the set's specs and its shotSet wrapper's, named by shot id: pos/look/mm/fstop at t 0, plus `end` when it moves; measured with previs-core, so solver and follow cameras are resolved), `solids`, `state` (the shot-state keys the builder understands), `continuity` (sun per scene) and `cost`.
  - Solids: Cling house footprints (poly prisms, height = mean of eaves and ridge), fountain, steps, support, stall, dais, platform, town wall; the seven sea stacks as 4 stacked convex prisms each (noise and ledges left out, ±7 %); the Santa Maria hull + mainmast, breakwater segments, terrace house rows, palace, warehouses (`approx`); market stalls and hauled boats; the nest and the bench.
  - `lines` (screen direction) is `{}`: phase 5 fills it.
- `previs-core.js`: `measure(spec, shot, t, { sheet })` takes marks the spec lacks from the sheet and ray-tests every actor (head, chest, hips) against the solids → `actor.occludedBy` (the solid's `what`) and `actor.visibleFrac`. New exports `rayBlock(solids, from, to)` and `occlude(r, sheet, env)` (box / cyl / convex poly prisms with `y0` and `h`). Without a sheet nothing changes: `previs --set OUTER_ROCKS --cuts` is byte-identical to HEAD's.
- `scenes/lib/humans/cast-list.js`: pure data. It holds all 48 build ids (31 cast + 18 crowd) with role, sex, MakeHuman age, years, age class, variant, `ride` (mount), the description, plus `NAMED` (CHARACTERS.md, adult/child + aliases), `ROLES` (variant → build), `ROLE_WORDS`, `CREATURES`, `buildsOf()` and `isChildBuild()`.
  - Age class 'child': canon child (all Abby builds, CHILD) or MakeHuman age < 18 years (crowd07, crowd10, crowd13, crowd16, crowd18).
  - `humans/index.js` is NOT changed to import it: index.js is in the render core hash, so editing it would re-key queued shots. A test keeps the two id lists equal (and checks sex/age against `characters.py` and adult/child against `CHARACTERS.md`).
- `engine/input/common.mjs castInfo()` now reads cast-list.js instead of parsing CHARACTERS.md and humans/index.js as text. The roles and the KNOWN_RE are unchanged; `childBuilds` now includes the under-18 crowd builds.
- `engine/cast/casting.mjs [--episode E] [--scenes ..] [--dry-run] [--json] [--force]` → `final/cast.lock.json` `{ episode, version, roles, shots: { id: [{ name, role, kind, build, opts?, mount?, implied?, generic? }] }, errors, warnings }`. Exit 1 on a rating error. It refuses to write s01e01's lock without `--force` (Episode 1 is hand-cast).
  - Named roles → own builds ("Guard 2" → guard2). Riding (mount in frame, an air set, or riding words in the action) → the ride build. ABBY_LEFT_ARM_INJURED / ABBY_SLING_LEFT → abby_injured / abby_sling / abby_ride_injured. A rider brings its mount and a mount in an air set brings its rider (`implied`).
  - Dragons: LEAF, CHARCOAL ("Charcoal's shadow"), STARLIGHT, SCOUT, HATCHLING; working / small / young dragon → `{ id: 'leaf', opts: { look: 'scout' } }`.
  - Generic people → crowd## by sex word and age class, FNV hash of (ep, scene, role, n), unique in the scene; plurals take 3 (or the number written). Generic adult roles never get a child build. Locked choices are kept (append-only).
  - The HARD guard: a child-capable build in an R* / rating-pass or NO_CHILD_IN_FRAME shot is `E_CHILD_BUILD`.
  - `episodes/t00/final/cast.lock.json` is committed (VENDOR → vendor, MUSICIAN → musician; t00 has no generics or dragons).

**Acceptance** (`test/engine.test.mjs`, 6 new tests, 14 in all)
- Marks: every mark name the six sets' specs use (20 names, including the shotSet wrappers cling-square-2 and verdor-aerial-2: cartGrip, ladderA/B, clothFL, parcel, lute, pipe, boatA/B, shadowDragon, egg, eggTop, eggCrack, eggFrag, nest, door, doorway, doorOut, lampKey, waterBowl) resolves from the sheets by name or alias. **Pass.**
- Casting 1C vs the hand-written specs: **102 / 102 named roles match (100 %)**. 3 more named roles have no hand-written counterpart in their shot (X4-07 Charcoal's shadow, X4-08 working dragon, X4-12 Remi), so 102 / 105 are comparable. R3-02..04 cast musician + vendor only; no child build; 0 errors. **Pass.**
- Occlusion: X6-01 r1 is reconstructed from its spec comment: the camera on the seaward side (v +75) at 120 mm, the pair on r2's track 70 m nearer the axis. r1's exact keys were not kept, and a sweep shows Leaf hidden for pair offsets of 55–85 m. Leaf is in frame and hidden by stack A at t 0, 3 and 5.9 (visibleFrac 0). The hand-written r2 shot is in frame and clear at all three times. **Pass.**
- `npm test` passes; `build-shots --check` exits 0; `sheet.mjs --check` is clean.

**Found, not fixed**
- `previs-core` reads `def.ride` as a mount name, but the OUTER_ROCKS / SKY_OFF_VERDOR specs write `ride: { on: 'leaf', lean }`. Their riders are placed wrongly in previs (and in mine-specs). The fix (`def.ride.on ?? def.ride`) would change previs and mining output, so it is left for phase 5 (air).
- Canon check for the owner: crowd10 (MakeHuman age 0.25, about 14 years, so a child build here) "falls mid-flight and stays down" in the humans library's Cling crowd proof (humans/PROGRESS.md). If 3C uses that as a death, CHARACTERS.md says every one of the dead in Cling is an adult, so it needs an adult build. Also, the hand-written R3-01 spec keeps `child` in its cast (the row frames only the parent). Check that she is out of frame, or drop her.

**For the next phases**
- Read a sheet with `loadSheet(set)` / `sheetMark(sheet, name)` from `engine/tools/sheet.mjs` (the import registers the `dk/` hook), and pass it to `measure(..., { sheet })`.
- Area `slotAt` points are ready for crowd-reaction; `vantages[...]` name every hand-written camera (`from: 'steps'` in a shot list can be a vantage name or an id like X5-02; aliases are not added to vantages yet).
- Not built: the stage.js drift hook (§3.4, runtime marks vs sheet) and the screen-direction `lines`. Sheets for the other sets (VERDOR_GROUNDS, PALACE_CORRIDOR, ...) need a LAYOUT recipe in sheet.mjs.
- Casting reads only `in_frame`; speakers off screen are not cast. Stage `cast` from `cast.lock.json` (`shots[id]`, with `implied` riders and mounts).
