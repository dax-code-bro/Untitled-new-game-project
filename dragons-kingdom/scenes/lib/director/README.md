# Shot director (`scenes/lib/director/`)

Turns the shot list (`episodes/s01e01/final/shotlist.json`) into renderable scenes that follow the
render contract of `render/episode.mjs` (header) and `README.md` ("Writing scenes"): `export meta`,
`async setup(ctx)`, `update(t, ctx)` - a pure function of `t`. Everything is data driven: a shot is a
small plain-data **spec**; the director poses the set, the cast, the camera, the effects and the
dialogue from it for any frame.

**One browser setup renders many shots.** A **set scene** (`episodes/s01e01/final/scenes/<set>.js`)
builds one set once and renders every shot of that set. Each shot owns a stretch of the scene's time
axis (`<set>.shots.json`: `start_s`, `frames`, `pre`/`post` handle frames, the placed dialogue, the
captions, the continuity). `render/episode.mjs` renders a shot as
`render.mjs <set>.js --start <start_s> --seconds <frames/24>` (route b of its header).

```
shotlist.json + vo/takes.json + vo/words.json + specs/<set>.spec.js
        |  node scenes/lib/director/tools/build-shots.mjs
        v
<set>.shots.json (per set)   cut/edl.json + edl.md (the edit)   cut/audio-cues.json (the mix cues)
        |  render.mjs / episode.mjs (masters)     tools/render-shots.mjs (dailies, many shots per setup)
        v
shot videos  ->  cut/make-cut.mjs  ->  cut/DragonsKingdom_S01E01_draft-cut_<scenes>.mp4 (+ .en.srt)
```

## Files

| file | what |
|---|---|
| `timeline.js` | set time axis (`layoutSet`: shots on whole seconds with handles and gaps), `shotAt(frame)`, keys + easing (`keyed`), stateless noise / hash, timecode |
| `registry.js` | the **set registry**: which scene file and builder renders each set of the shot list, from which libraries, its world frame, and **continuity per story scene** (time of day, sun direction `sunDir(az, el)`, weather, lamps, exposure, per-shot overrides). Set builders read their light from here, so two shots of one scene never disagree about the sun |
| `camera.js` | **camera rigs** (static, pan, tilt, dolly, push, crane, handheld, boat, drone, follow, orbit), lens (mm, sensor, f-stop, shutter, ISO, zoom keys), **focus pulls** (`focus` keys of names or metres, `focusOffset`), deterministic shake (dk/camera.js), **mounts** (a camera riding a boat / an actor), the **framing solver** (put subjects at screen positions; Levenberg-Marquardt; room bounds; minimum distance to subjects; `autoLens` goes wider when a lens cannot hold the framing in a small room) |
| `blocking.js` | **blocking**: marks, starting facing, timed acts - walk / hurry / run along paths with acceleration and stopping (arc-length), turn, posture ramps (crouch, kneel, sit, bow, lean, rise), overlays (raiseHand, point, reach, touch, shove, handsTo, carry, clasp, cradle, gesture, wave, nod, headShake), eye-lines, key-framed roots (creatures), hide/show |
| `actions.js` | the **action vocabulary** mapped onto the libraries: humans (`scenes/lib/humans`): procedural gait with planted feet by two-bone leg IK, crouch/kneel/sit, spine bow/lean, hanging arms while walking, arm overlays by two-bone arm IK, hand shaping, eye-lines; creatures (`scenes/lib/creatures/poses.js`): stand/idle, walk, sit, crouch, lie, rear, pushUp, struggle, fire, flight, glide, bank, dive, strike, sprint, bite (mouthHold), takeoff (launch), land - blended over `blend` seconds. `registerHumanAction(name, fn)` lets the performance track replace any action (walk, legs, spine, look, face/lip-sync) |
| `dialogue.js` | **dialogue placement**: lines placed in a shot from `vo/takes.json` + `words.json` (word times), split takes at sentence pauses (`L003#2`), lines that run over a cut (`continues`), mouth envelope + speaker for lip-sync / eye-lines |
| `fx.js` | **FX cue hooks**: `registerFx(kind, factory, meta)`; the FX library (`scenes/lib/fx/index.js`) plugs in by exporting `registerDirectorFx(registerFx)`; cues per shot (`fx: [{ kind, from, to, params }]`); built-in stand-ins: lamp-flicker, dust-motes, shadow-pass |
| `cost.js` | **render cost estimates** per shot (set base cost x what is in frame; MEASURED draft timings from `cut/timings.json` replace the model; GPU figures when a gpu-check exists) |
| `stage.js` | `createSetScene({ set, builder, spec, table })`: the set scene factory (loads the cast the table's shots use, poses everything per frame, solves the camera, runs the FX, sets exposure and the shadow cache key per shot) |
| `sets/*.js` | set builders: `birthing-chamber`, `alexandria-room`, `palace-corridor`, `sea-coast-dawn`, `prologue-vistas`, `verdor-grounds`, `common` (sky dome, light cards, room environments, wall lamps) |
| `tools/build-shots.mjs` | shot tables, the edit list, the audio cue sheet (`--check` for CI) |
| `tools/render-shots.mjs` | **dailies**: many shots per browser setup into one video file each (with the handle frames dissolves need), or review stills + a contact sheet per set (`--stills 0.2,0.8`); resumable; measured s/frame into `cut/timings.json` |
| `tools/cut-sheet.mjs` | review sheets of an ASSEMBLED cut: frames taken from the cut file at fractions of every shot (transitions, captions, burn-ins included), tiled and labelled with shot id + record timecode |
| `tools/still.mjs`, `tools/contact.mjs` | one still of a shot by `render.mjs --still`; a contact sheet from a review video |
| `tools/probe-cast.js` | a scene showing humans-library characters as the director poses them, from four sides (cast checks: costume colours under a set's light, built-in drape poses) |
| `tools/selftest.mjs` | unit checks of the pure parts (layout, keys, walk profile, dialogue placement, registry) |

## A shot spec

```js
'1A-21': {
  staging: 'BACK: two backs over the nest; Alexandria soft beyond.',      // the realism choice, in the edit list
  cam: { rig: 'static', frame: { subjects: [['abby.head', [-0.3, 0.3]], ['remi.head', [0.3, 0.42]]], from: 185, height: 1.55 },
         mm: 40, fstop: 2, focus: 'hatchling', bounds: BOUNDS },
  cast: { abby: { at: ABBY_C, face: 'hatchling', look: 'hatchling' }, remi: { at: REMI_S, face: 'hatchling' }, hatchling: hatchRest() },
  lines: [['L014', 0.8], ['L015', 0.3], ['L016', 0.3]],                   // first word 0.8 s in, then gaps
  set: { egg: 'opened' },                                                    // set state (the builder reads it)
  fx: [{ kind: 'dust-motes', params: { ... } }],
  trans: ['dissolve', 24],                                                   // how the shot comes in
  captions: [{ text: 'Tara', line: 'L003#1', word: 'tara', hold: 1.25 }],    // synced to a word
}
```

Positions are metres in the set's world frame or NAMES: marks (`'door'`), actors (`'alexandria'`),
actor parts (`'abby.head'`, `'abby.hand.R'`, `'leaf.eye'`, `'leaf.w_R_2'` - any creature bone),
set objects; anything can be a key list `[[t, value, ease?], ...]`. `cam.debug: true` (or a list of extra point
names) prints the solved camera position and the subjects' posed points once per shot (framing checks). Headings: 0 = north (-z),
90 = east (+x). Under a camera `mount`, numeric positions are in the mount's frame and
`{ at: [x, y, z] }` is a world point.

## Run it

```bash
node scenes/lib/director/tools/build-shots.mjs                          # tables + edit list + cue sheet
node scenes/lib/director/tools/render-shots.mjs --stills 0.5             # one still per shot, contact sheets
node scenes/lib/director/tools/render-shots.mjs --sets SEA_COAST_DAWN    # draft videos of one set
node scenes/lib/director/tools/render-shots.mjs                          # every shot of the cut (resumes)
node episodes/s01e01/final/cut/make-cut.mjs                              # assemble the draft cut with the voices
node scenes/lib/director/tools/cut-sheet.mjs --cut <cut.mp4> --out <dir> # review sheets across the cut
node scenes/lib/director/tools/selftest.mjs                              # unit checks
```

Masters: `npm run episode` (render/episode.mjs) finds each shot through the set scene + its
`.shots.json` and renders it natively at 4K with the master settings.

## Honest limits (see PROGRESS.md for the current list)

- Faces stay soft, turned away, small or backlit until approved faces and lip-sync exist; the
  `staging` field of every shot says which. Mouth shapes from `dialogue.js mouthAt()` are a
  stand-in hook for the performance track.
- Human motion is procedural (gait cycle + IK) on top of the humans library's draped builds; big
  pose changes stretch cloth that was simulated standing.
- Creature blocking uses the creatures library's pose functions; long moves are root slides with a
  walk cycle (no foot-plant solver against uneven ground beyond the library's own ground fit).
- The framing solver works on approximate (pose-free) points for tracking frames; static frames are
  solved on the exact posed points at `frame.at`.
