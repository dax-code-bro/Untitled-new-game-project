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

## Phase 4: auto-stager v1, ground (2026-11-11)

**Built** (pure Node, no new dependencies)
- `engine/stager/intent.mjs`: row → intent (§3.1). Size class, lens, move (`static / pan / push / track / two-shot / ots / pov / air`, plus `low`, `through`, `across`), subjects from `in_frame` (people, things, creatures; screen side L / R / C / L-C / R-C / L-to-R, `bg`, the note), people the action names but the row does not frame (`extras`: an insert's hands, a listener), acts from `verbs.json` with their place words (sheet marks + aliases + `places.json` aliases; a move's destination needs a preposition), dialogue lines → speakers. Unknown verbs on a person → `unstaged`. RATING: in R* / rating-pass / NO_CHILD_IN_FRAME shots no child is ever added as an extra.
- `engine/stager/verbs.json` (the keyword table) and `engine/stager/places.json` (per set: aliases, extra marks such as the banner and the house table, role homes such as VENDOR → stall `work`, MUSICIAN → fountain `seat`, set dressing rules such as stall up / door open, hand props lute / pipe, and the builder variant: CLING_SQUARE shots that need the lute, the door or the banner are written as CLING_SQUARE_2, the registry's `shotSet`). Everything there is a set fact taken from the sheet marks or the builder comments, never from a hand-written camera.
- `engine/stager/select.mjs`: the decision table → template + fallbacks. POV and air moves fall back to a ground template with a `W_POV_V1` / `W_AIR_V1` flag (phase 5).
- `engine/stager/templates/*.mjs`: establish-wide, medium-action, two-shot, single-close, ots, insert, crowd-reaction, travel-pan, card (camera params; distances from the mined bands: MS frame height 1.64 m at the subject, WS 6.9 m with people / 8.3 m at the aim point, two-shot 1.32 m, insert 2.5–4.5 m at 100 mm, CU 0.95 m at 85 mm) and `common.mjs` (`shoot`: a static camera aimed so each subject lands near its screen place; `project`).
- `scenes/lib/director/staging/ground.js` (`place`, `walkTo`, `postureFor`, `reachTo`, `lookAtEvent`, `gesture`, compass helpers), `talk.js` (`lineCues`: first gap 0.3–0.8 s then 0.15–0.3 s by hash, the shortest gaps when the shot is tight; `lineTimes`, `talkLooks`, `listenerActs`: nods / a head shake on a "no"), `merge.js` (`mergeSpecs(auto, touch)`: deep merge, `null` deletes, `{ lock: true, ...whole }` replaces; touch as `{ shots: {...} }` or the short `{ '<shot>': {...} }`). Pure, no three.js.
- `engine/stager/check.mjs`: scoring on previs-core at u 0.15 / 0.5 / 0.85 (a pan's landmarks at their key times): in frame, requested side, not occluded (sheet solids / heads), frame height in the mined size-class band; the camera above the ground, outside every solid and within 6 m of the set's areas. Speaking faces under faces 'avoid' are flagged. The adjust loop: at most 12 tries, steepest ascent over distance ×/÷1.2, `from` ±20/40/60, raise 0.5 m, lens 35↔50↔85 (unless locked), leave a vantage, the template's fallback.
- `engine/stager/stage.mjs`: `stageShot(row, ctx)` → `{ entry, cast, variant, report, end }` and `stageRows(rows, ctx)` (scene continuity: where everyone stood at the previous cut). Blocking order: an explicit place word → beside the other speaker (two talkers, not "across") → continuity → the role's home → beside the first person on the requested side. The camera side: three-quarter front of the main person (its facing ±25° toward the sun), L-to-R movers from their right, things from the side a nearby mark faces (the stall's front) or from the sun; a two-shot from the side of the A–B line that gives A left / B right; `from:` in the shot list takes a vantage, a shot id, a mark (the nearest vantage within 3 m) or a bearing. The vantage of the shot being staged is never used (hold-out). Deterministic: the same rows give byte-identical JSON (tested).
- `engine/stager/write.mjs --episode E [--sets ..] [--out DIR] [--check]`: per set `<builder>.auto.js` (header: stager version + input hash), `<builder>.touch.js` (created once, never rewritten), `<builder>.spec.js` = `mergeSpecs(auto, touch)`, the set scene file (created once) and `final/stage-report.md|json`. It refuses s01e01 without `--out` and refuses to overwrite a hand-written `.spec.js`.
- `engine/stager/accept.mjs`: the acceptance measurement (re-stage the 22 Cling shots in memory, compare with the hand specs); `node engine/stager/accept.mjs` prints the table.
- **Hook** (minimal, backward compatible): `build-shots.mjs` gives an episode with no `vo/takes.json` placeholder takes timed from `dialogue.json` (`placeholder: true`), so a new episode's lines are placed before phase 6 records voices. Episode 1 has takes: its tables and EDLs are unchanged (`build-shots --check` passes).
- t00 is staged for real: `episodes/t00/final/scenes/specs/cling-square-2.{auto,touch,spec}.js`, `scenes/cling-square-2.js`, `scenes/cling-square-2.shots.json`, `cut/edl.json|md`, `cut/audio-cues.json`, `stage-report.md|json` (written as CLING_SQUARE_2 because 0A-02 / 0A-03 use the lute).
- `.gitignore`: `episodes/scratch-*/` (the scratch episode the acceptance stills were rendered from: the 22 re-staged Cling rows + t00's 3, Episode 1 takes copied in).

**Acceptance**
- In frame and on the requested side at t = 0.5: **40 / 42 subjects = 95 %** (≥ 80 %). **Pass.** Misses: R3-02 / R3-04 the vendor in the background right (the musician's seat faces the sun, which puts the stall on the left).
- Bearing within 45° (relative to the main person's facing; compass for things) and frame height at the subject within ×1.5 of the hand-made shot: **12 / 22 = 55 %** (target ≥ 70 %). **FAIL.** Per template: establish-wide 5/8, travel-pan 1/1, medium-action 3/8, two-shot 3/3, insert 0/2. The misses are mostly hand shots that see a person from the side or back mid-turn or walking away (X5-08, X5-11, X5-15, R3-01), a moving prop the sheet cannot know (X5-01's cart rolling in from the alley), the insert on the vendor's hands (X5-05), framing scale (X5-12, R3-02, R3-04 tighter / wider) and X5-06 (47°).
- build-shots places every line for t00 (L001–L003 in 0A-02, 0 warnings; `build-shots --episode t00 --check` exits 0). **Pass.**
- Draft stills at u 0.5 (one `render-shots --stills` call, workers 1, scratch episode; set built in 53 s): X5-02, X5-04, X5-07, X5-14, X5-16, 0A-01, 0A-02, 0A-03. **None is black or sky-only** (mean luma 53–107; 12–20 % edge density in the lower 2/3). **Pass.** By eye: X5-16 hides most of the watchman behind the platform's timber (previs solids do not include the platform's posts); X5-04 shows the stall already up while the vendor is still meant to be building it (the dressing rule puts the stall up); 0A-03 (the lute insert) reads well. No auto-vs-hand side-by-side sheet: the hand shots have no stills on disk, so it would have needed a second heavy render.
- Flags on the 22: W_PAN_FAST (X5-03, 33°/s), W_POV_V1 (X5-17), FACE (R3-03: a speaking face reads, faces policy avoid), low score R3-04 / R3-02 (vendor side). t00: 0A-03 unstaged ("the musician's fingers find the first chord": no finger action).
- `npm test` passes (16 engine tests; 2 new).

**Not done / left for later**
- The ≥ 70 % hand-match target; next steps: a per-set seat side rule (sit so the named background lands on its side), framing scale per set (Cling's hand mediums are wider than the all-episode band), and shots whose person turns or walks away (score bearing at the time the row's verb happens).
- The stage.js drift hook (§3.4), `cutCheck` against the previous shot, screen-direction lines (phase 5), crowd-reaction is wired but untested (no Cling row selects it), `engine/state.json` version pinning / `--restage` (phase 6's orchestrator).
- Moving props (a cart rolling in, a ladder) are staged only when the verb and the dressing rules know them (the ladder rule is in places.json; the cart is not).

**For the next phases**
- `stageRows(rows, { sheet, places, verbs, castLock, policy: { faces, holdOut } })`; `write.mjs --episode E` is the stage step of `make-episode` (phase 6). The report JSON has per-shot `score`, `fixes`, `flags`, `unstaged`, `cam`.
- Templates return camera params only; phase 5 adds air templates to `TEMPLATES` in stage.mjs and rows to `select.mjs` (replace the `W_POV_V1` / `W_AIR_V1` fallbacks).
- A new set needs a `places.json` entry (homes, dressing, props) as well as its sheet.

## Phase 5: auto-stager v2, air (2026-11-11)

**Part A: phase 4 fix-ups**
- **0A-02 (t00 two-shot staged as a wide).** Cause: the BLOCKING, not the template's band. "calls across" switched off "beside the other speaker", so continuity left the vendor at his stall and the musician on the fountain rim, 10.9 m apart; the two-shot template then widened to 35 mm to hold both (frame ~8 m), and the size check (weight 0.15) let 0.85 pass the 0.8 flag line. Fix (`stage.mjs`): in a two-shot, two talkers more than 3.5 m apart on the same level are brought together: the free one (not seated, no prop, no `y`) stands 1.4 m from the other, facing him (report fix `two-shot: vendor brought to 1.4 m ...`). New check (`check.mjs`): in an MS / CU / two-shot a person under 25 % of the frame height (1.74 m body, or head height when lower) fails its size and scales the score by (frac / 0.25)² (graded so the adjust loop can climb), flag `W_SIZE`. t00 re-staged: 0A-02 now 50 mm at ~1.8 m of frame, score 1 (flag FACE: a speaking face reads, policy avoid).
- **X5-16 (watchman behind the platform).** `sheet.mjs` now adds the platform's timbers to CLING_SQUARE's solids from the builder's WATCH numbers: four posts, four rail posts, three rails, and the ladder. The occlusion ray now hides the watchman from the old camera; the adjust loop turns `from +60` (both heads clear). It stays FLAGGED (score 0.64, `W_SIZE`): a guard on the ground and a watchman 4.7 m up cannot both be framed waist-up in one medium; the regroup rule leaves different levels alone.
- **X5-04 (stall built before he builds it).** `places.json` dressing rule `build: { stall: [poles, bars, cloth] }` on "builds ... stall": when the sheet's `state.stall` declares poles / bars / cloth, the stall is animated 0 -> 1 during the shot (poles at 36-58 %, bars 56-70 %, cloth 72-92 % of the shot); otherwise the shot gets an unstaged note.

**Built (Part B)**
- `scenes/lib/director/staging/flight.js` (pure): `fly`, `inForm`, `pair` (TALK formation: wingman 30 m to the leader's LEFT, 16 m ahead, 2 m lower), `posAt`, `localFrame`, `shadowOf(p, sun, y)` / `shTrack`, LEAF_FLY, LEAF_SKIM, CHAR_FLY (CHAR_HZ 0.625, locked), CHAR_GLIDE, `beatFor`, `perch`, `formationClock(path, { v, s0 })`, `relBearing`. The hand specs keep their own copies (Episode 1 frozen).
- `engine/stager/air.mjs`: `stageAir` for rows on an air set (sheet kind `air-*`) that frame a flyer, a rider or only places. Flyers ride the set's flight path (`places.json` `flight.path`) on the SCENE CLOCK (`stageRows` carries `clock` = seconds of the scene's earlier rows on the set), Leaf is the formation's reference and Charcoal flies in the TALK formation; per-set `flight.rules` (regex on the action) switch path + anchor (start / mid / end / a mark), perch or hover on a mark, set `alt` / `dy` / `how` (skim, glide). A perched flyer stays perched in later shots (continuity). Riders are ALWAYS cast with their mount (`ride: { on }`; a missing mount is added). People on the ground stand at the mark their words name, facing the flyer. POV: the camera on the eye (`<actor>.head` + 8 cm), the eye's owner hidden, dragonback shake when riding.
- Templates (`templates/`): `air-to-air` (framing solver tracking the rider's head / the flyer's chest; CU 85 mm ~1 m, MS 50 mm ~2 m, WS 1.3 creature lengths, EWS 7; bearing relative to the flyer's heading 30 / 35 / 100 / 165 on the line's side), `camera-ship` (keyed with the formation's midpoint, every framed subject inside 80 % of the width, a lens range's middle), `pov`, `pass-by` (static at the place the MOVE names, focus pulled far -> near), `drone-reveal` (a place with no cast, sun side, 4 % push). `select.mjs` routes air rows (pan only on ground sets now; a ground POV keeps the eye-wide, now named `pov`, no W_POV_V1).
- `check.mjs`: the LONG-LENS HORIZON RULE (`previs-core.horizonRule`: depression >= vfov/2 + 2.5 for lenses >= 100 mm; fail x0.5, `W_HORIZON`), the SCREEN-DIRECTION LINE (`lineSide`: the sheet's `lines[scene]`, camera more than `tol` past the flyer's travel line on the wrong side x0.35 unless the move says "reverse", `W_LINE`), air cameras skip the "outside the areas" check, `adjust(..., { muts })` takes the air mutations (distance, bearing +-20/40, rise, lens 24..180).
- Sheets (`sheet.mjs`): `lines: { '1C': { travel: 'heading', camSide: 'right', tol: 25 } }` on SKY_OFF_VERDOR, OUTER_ROCKS, VERDOR_AERIAL, VERDOR_HARBOR (cameras on the flyers' right, travel L -> R, shotlist flight_line_1C_to_1E); paths `flight-X6` (SSE to the rocks) and `flight-X6-return`.
- `previs-core.js`: riders' `ride: { on, lean }` now resolves (`def.ride.on ?? def.ride`): OUTER_ROCKS / SKY_OFF_VERDOR riders sit on their mounts in previs and mining (this changes their previs numbers, as phase 3 predicted). `horizonRule(cam)` exported. previs-core is outside the render core hash.
- `accept.mjs --air` (`restageAir`, shared `compareRow`: a rider's bearing is taken against its MOUNT's heading). STAGER_VERSION 2. One new test (17 engine tests).

**Acceptance** (`node engine/stager/accept.mjs --air`; 34 shots: X4-01/02/03/06/08/10..20, X6-01..18)
- At t = 0.5, requested subjects in frame and on the requested side: **53 / 63 = 84 %** (>= 80 %). **Pass.** Misses: elements without a usable mark (harbor wall, spray, seabirds, the working dragon / young dragon placed on a quay / school mark off frame), X4-10's lookout and Leaf (the mast pass is not staged as a pass), X4-20's pair (camera-ship framed the coast / rocks marks too).
- Bearing within 45 deg and frame height within x1.5 of the hand shot: **12 / 34 = 35 %** (target >= 70 %). **FAIL, reported honestly.** Matches: X4-02, X4-11, X4-14, X4-17, X4-18, X4-19, X6-03, X6-04, X6-05, X6-06, X6-13, X6-17. The misses are mostly (a) hand shots from the LEFT / front of the flyer at the rocks (X6-09 / 11 / 14 / 15 / 16 / 18: bearings -3..35 or -122/-88, i.e. the hand shots themselves sit off the "right of travel" convention there), (b) scale on shots the hand framed on a different subject (X4-12 frames Abby alone with Remi OFF; X4-10 / X4-13 crowd and lookout; X6-07 h x19), (c) the shadow / pov / ground shots (X4-03, X4-06, X4-15).
- Horizon rule: **0 failures** in the 34 auto shots. **Pass.**
- `previs --episode scratch-stage --set VERDOR_AERIAL|SKY_OFF_VERDOR|OUTER_ROCKS --cuts`: 15 + 3 + 12 cuts checked, **0 flagged** (no undeclared crossed eye-lines, no jump cuts). **Pass.** W_LINE fired on 0 auto shots.
- Phase 4 Cling acceptance re-run: in frame + side **40 / 42 = 95 %**, hand match **12 / 22 = 55 %**: the same totals as phase 4 (X5-04 still matches with the stall now built in the shot; X5-16 still matches in bearing / scale but is flagged W_SIZE). **Not improved.**
- Draft stills (ONE `render-shots --stills 0.5 --workers 1` call, scratch episode, 6.9 min; scratchpad eng1/engine5/stills + contact sheets per set): 0A-02, X5-16, X6-02, X6-04, X6-09 rendered; **X4-11 and X4-18 FAILED** (the VERDOR_AERIAL page threw: actor "young" not in spec.cast; X4-13's generic "Young riders" were keyed differently in the cast and the shot. Fixed after the render (air.mjs keeps the intent's actor name), not re-rendered). By eye: **0A-02** a real two-shot, both waist-up, but the vendor stood inside the fountain basin (fixed after the render: the regrouped talker takes the nearest spot clear of the sheet's solids; t00 re-staged, not re-rendered). **X5-16 still FAILS by eye**: the camera the adjust loop chose (+60) looks through a large timber structure the sheet does not know (near the gate / east row), the watchman hidden, only the guard reads. **X6-04** reads well (rider + Leaf's neck, sea behind). **X6-02** (drone on the gap) reads. **X6-09** (pass-by "static inside the gap") is a rock face with Leaf hardly visible: the camera at the gap mark sits against stack B.

**Not done / left for later**
- Hand-match 35 % air / 55 % ground (target 70 %). Next: score bearing per template against the mined bearing band instead of a fixed `rel`; the rocks' hand shots use the flyer's LEFT / front (decide whether OUTER_ROCKS gets its own line or `reverse` rows); pass-by needs a stand-off from the mark (the gap is between stacks) and a sheet solid check on the camera; X5-16 needs the missing timber solid (find it in cling-square.js) and a W_SIZE exemption for vertically stacked pairs; frame the subject the action names (X4-12, X4-10).
- The 1C X4 / X6 hand specs are untouched; flight.js is new code only. The formation clock counts the set's own rows in a scene (ground shots on other sets do not advance it).
- previs-core's ride fix changes previs / mining numbers for OUTER_ROCKS and SKY_OFF_VERDOR riders (templates.mined.json was NOT re-mined).

**For the next phases**
- `stageRows` now carries `{ blocking, lastPerson, flyers, clock }` per scene; air reports have the same shape as ground ones. STAGER_VERSION is 2 (re-stage t00 when pinning in phase 6).
- A new air set needs `places.json` `flight: { path, v, rules }` and a sheet `lines` entry.
