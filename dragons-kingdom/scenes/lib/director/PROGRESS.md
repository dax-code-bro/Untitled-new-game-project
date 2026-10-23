# Shot director - progress notes (for whoever continues this track)

Owner paths: `scenes/lib/director/`, `episodes/s01e01/final/scenes/`, `episodes/s01e01/final/cut/`.
How it works: `README.md` in this folder. Latest state first.

## State (2026-10-23)

- **All 76 shots of PROLOGUE + TITLE + 1A are authored** (shot list order, 8 580 frames = 5:57.5):
  P-01 black card; P-02..P-07 `SEA_COAST_DAWN`; P-08..P-16 `PROLOGUE_VISTAS`; P-17 + X2-08..X2-13
  `VERDOR_GROUNDS`; T-01, 1A-01..1A-34, X2-01..X2-03, X2-14..X2-17 `BIRTHING_CHAMBER`; R1-01,
  X1-02..X1-04 `ALEXANDRIA_ROOM`; X1-01, X1-05, X1-06, X2-04..X2-07 `PALACE_CORRIDOR`.
  `node scenes/lib/director/tools/build-shots.mjs` reports no unplaced line and no unauthored shot.
- Every set has a set scene in `episodes/s01e01/final/scenes/<set>.js` + `<set>.shots.json`, so
  `render/episode.mjs` can render every one of these shots (route b of its header).
- The draft cut: `node scenes/lib/director/tools/render-shots.mjs` (draft videos, resumable) then
  `node episodes/s01e01/final/cut/make-cut.mjs` -> `episodes/s01e01/final/cut/DragonsKingdom_S01E01_draft-cut_PROLOGUE-TITLE-1A.mp4`
  (git-ignored; `cut-report.json` says what went into it).
- `node scenes/lib/director/tools/selftest.mjs`: 9 checks (layout / render contract, keys, walk
  profile, blocking purity, dialogue placement on the real takes, registry, cost, tables up to date).

## What changed since the first commit of this track (resumed after a container restart)

- Dailies renderer `tools/render-shots.mjs`: many shots from one browser setup (the chamber takes
  ~60-100 s to build on this machine; rendering shot by shot through `render.mjs` would pay that per
  shot), handle frames for dissolves, review stills + contact sheets, resumable by spec hashes.
- Cut assembler `cut/make-cut.mjs`: real dissolves from rendered handles, fade-ins, captions on the
  spoken word, burn-ins, the voice takes at their cue times, `.en.srt`, a report.
- Camera: follow rig on the actor's ground frame (it used the spine: the camera floated ~3 m up),
  look offsets turn with the actor, operator lag; `mount` (camera on a boat); framing solver
  `dist` = distance to the first subject, `minDist` (the solver had put the camera inside a head in
  a small room), `autoLens` (goes wider, never below half the asked focal length), `focusOffset`.
- Blocking: acts run on CHANNELS (a raised hand no longer cuts a crouch ramp; a bow no longer
  freezes a walk mid-stride - X1-06 walked in place before); actors parented to a moving object
  (sailors aboard the boat) with world-correct IK directions.
- Actions: hanging arms while walking (drape poses with a hand on the hip or a raised arm walked
  that way: Remi in the corridor).
- Sets: corridor/room bounce fill (black ceilings), doorway lights moved away from heads (a point
  light just behind a head shines through the skin shader: faces in doorways glowed red), chamber
  egg fill for the macros, a second attendant whose rust dress read as bare skin under lamplight
  was recast (crowd06; `tools/probe-cast.js` shows any character from four sides).

## Known weak spots (honest list - look at the contact sheets before trusting any of this)

- Faces: kept soft / turned / small / backlit (each shot's `staging`); a few shots still show a
  readable profile (X1-03 at the start of her turn, X2-13 by design). Mouth motion is not driven
  yet (hook: `registerHumanAction('face', ...)` gets `mouth` from `dialogue.mouthAt`).
- PROLOGUE_VISTAS landscapes are provisional builds from terrain/heightfields: the forest cliff
  face (P-10) is a heightfield with side-projected rock (reads at 2 s in a dissolve, not up close);
  the settlement (P-08) is small at 24 mm; the wing cloud (P-16) is a painted card.
- The prologue island's cloud cap reads as a smooth lens shape at draft: the froxel fog averages
  the bank noise away at 2-3 km (engine limit: froxel depth slices are ~300 m there).
- Leaf: crouch / walk / stand from the creatures library; head moves are root slides + look
  angles (no neck IK toward a target yet); X2-12's nudge is approximate.
- Render cost: the chamber is ~5 s per draft frame on this 4-vCPU machine; see
  `episodes/s01e01/final/cut/timings.json` (MEASURED, with the machine load at the time).

## Next steps

1. Watch the whole draft cut; fix framing / timing per shot (the edit list `edl.md` has the
   staging per shot; `render-shots.mjs --only <ids> --stills 0.2,0.8` is the fast loop).
2. When the FX track registers its kinds (`registerDirectorFx` in `scenes/lib/fx/index.js`), swap
   the stand-ins (dust-motes, lamp-flicker, shadow-pass) and add cues (sea spray, breath).
3. When the performance track's lip-sync lands, revisit the OTS/BACK stagings of 1A dialogue.
4. Author 1B onward with the same sets (VERDOR_GROUNDS has the field and the yard; SKY_OFF_VERDOR
   and the others need builders - the registry lists the libraries).
