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
