# Shot director - progress notes (for whoever continues this track)

Owner paths: `scenes/lib/director/`, `episodes/s01e01/final/scenes/`, `episodes/s01e01/final/cut/`.
How it works: `README.md` in this folder. Latest state first.

## Session 6 (2026-10-27, resumed after another container restart)

- State found: 1A-26..1A-33, X2-01..X2-03, X2-14, X2-15 unrendered; X1-03 / X2-13 rendered BEFORE their
  session-5 restaging (stale); P-09..P-12 never re-rendered with the reworked landscapes; queues dead
  mid-shot (stale locks + part files removed).
- Review stills of every unrendered chamber shot (`--stills 0.2,0.75`) found most of them wrong - the
  framing solver fails in this small room with three subjects (it hugs a wall and gives up):
  1A-27 Abby in sharp profile, no 'behind'; 1A-28 Abby hidden BEHIND Remi in the three-shot; 1A-29 Remi's
  head above the frame (26 mm aimed at 0.9 m); 1A-30 the 50 mm solve cut Remi's head and kept
  Alexandria's bun (a painted-looking disc) sharp in the foreground; 1A-31 an empty room for 3 s (the
  walkers entered a locked-off frame from off screen); 1A-33 her hand never reached the hatchling (1.1 m
  from the stool) and her face was full on; X2-01/X2-02/X2-03 three near-identical frames (jump cuts);
  X2-14 Alexandria's face full on and sharp; X2-15 the hatchling hidden by the straw rim.
  Restaged (explicit cameras chosen with a quick Node projector of the actors' approximate heads -
  scratch `eng1/director/proj.mjs`, `search.mjs`), checked again with preview stills: 1A-28 high from the
  south-west corner, 1A-31 PANS with the walk to the door, X2-01..03 wide / closer / OTS all on the
  south side of the line Alexandria-door, 1A-33 her LEFT hand to the linen south of the broken egg.
- Engine: HAND PROPS (`handprops.js`, `holds:` on a cast entry): a set object placed from the posed
  palms each frame (both hands: between the palms, levelled; one hand: in the palm), the stage owns it
  (hidden when nobody holds it). X2-16's young attendant carried nothing in her upturned hands ("comes in
  with fresh water"): now the chamber's `waterBowl` (props library bowl with water). Self-tested.
- LESSON: a stop-after script's blanket `rm *.part.mp4` deleted another queue's X1-03 part (12 min of
  work lost): only remove parts with no live lock (`stop-after.sh` fixed).
- Engine: `tools/previs.mjs` - Node previs in seconds (camera incl. `frame` solves, heads on the screen,
  speaking-face check, heads hidden behind a nearer actor, plan + frame sheets via ImageMagick,
  `--cam` / `--cast` overrides for an authoring loop). It predicted the render problems found by stills
  (1A-28 Abby behind Remi, 1A-29 head out of frame, 1A-24 attendant's readable face, 1A-31 Abby in Remi's
  shadow). USE IT BEFORE RENDERING STILLS. `spec.previs.marks` holds the set marks it cannot compute.
- Engine: framing solver opt-ins `frame.search` (fan of starts inside the room) and `frame.clear`
  (no actor in front of a subject); self-tested on the 1A-28 case. Not used by existing shots (their
  cameras must not change under them).
- 1A-27 took four stagings: from behind Abby the hatchling sits straight in front of her (hidden by her
  back) and every angle holding all three shows a speaking face full on at 3 m; final: over Abby's
  shoulder onto the hatchling, both voices off screen. 1A-24 restaged close behind Remi (the attendant's
  face read at 21 mm; Abby was hidden) - queued after the main renders.
- Lip-sync IS live in director renders now (humans/director.js registers the 'face' hook on load): the
  speaking-face audit is a quality flag, no longer a hard rule.
- Render speed this session: 25-35 s per chamber draft frame (load 15-25: other tracks render too).
- Queues: a stop-after-1A-28 trigger would also fire if ANOTHER queue finished 1A-28 first (stopping E
  mid-shot): replaced by `stop-on-claim.sh PID JOB` - stop E when ITS lock claims 1A-27 (the one shot its
  browser holds stale), which lets a forward queue (H: 1A-18, 1A-28, 1A-29, 1A-30) meet E's reverse queue
  in the middle (render-shots skips a shot another process finished or holds). 1A-18 was stale too (its
  look raised 0.1 m in session 6's first pass).
- P-14 low cloud: the froxel bank at 620 m averaged to a flat grey ceiling (and drew a pale wall where it
  ended at 30 km). Now a PAINTED DECK (`sets/cloud-deck.js`, pure + tileable: periodic gradient noise and
  periodic Worley cells): warped domes per cloud element (dark thick cores, pale thin edges, gaps between,
  whole elements dropping out where a large field is low), a 20 km tile repeated on a 64 km card at 520 m,
  a near-detail alpha map (1.25 km tile) for the top of the frame, an opaque paler veil above (gaps show
  overcast, not clear sky); the card writes depth so the haze takes its own distance (the far deck melts
  into a bright band at the horizon). Node preview loop (`eng1/director/p14/proto.mjs`, a perspective
  ray-cast of the same tile) before one browser still. Self-tested (tiling, cover, determinism).
- P-17 meadow from 46 m read as a sports pitch (one pixel ~5 cm: the grass tufts a fine noise, the 2 m
  terrain vertices one flat green). A fine terrain CARD (0.3 m vertices, the same terrain material, so
  the same light, shadow and AO) over the shot's footprint carries a pasture's patchwork (`sets/meadow.js`,
  pure: lush / dry patches, irregular tussocks thicker where the grass is rough, clover, rosettes, a sheep
  track, molehills - soil in the splat), faded to the plain field at its edges, lifted 10 cm so the coarse
  terrain stays under it, visible in the meadow shots only; the meadow grass sits on it. Top-down Node
  preview (`eng1/director/p17/top.mjs`) before the browser still.
- LESSONS: an interim cut while 4 renders run: make-cut's ffmpeg (76 inputs) took 2 GB and a vistas
  browser died for memory (P-09 restarted) - assemble only when the renders are done. And again: never
  `pkill -f <pattern>` with the pattern in the same command line (it kills the calling shell; the orphaned
  ffmpeg kept running) - pgrep, then kill the PID.
- MEMORY: 11:30-11:56 three renderer deaths for memory (P-09 twice, 1A-31 at 168/204 frames - 1.6 h lost):
  my P-17 still runs (a VERDOR_GROUNDS browser, ~3 GB) next to two chamber renders, the vistas queue and
  the other tracks' renders (perf: three render.mjs runs, ~6 GB). The vistas queue was stopped; the
  optional re-renders (P-17 meadow, P-09 clouds, P-10..P-12) wait in queue M until at most one chamber
  render runs. Rule from here: no extra browser while two chamber renders run.
- Engine: `render-shots.mjs` renders and encodes a shot in 48-frame SEGMENTS (`--segment N`; manifest
  `<job>.segs.json` with the shot's keys): a crash or a stop loses only the segment in flight, the retry
  or the next run resumes and joins the segments with ffmpeg concat (no re-encode); a part file whose lock
  names a dead process is removed instead of blocking the shot for 30 min. Tested on R1-01 (killed after
  2 of 4 segments, resumed: "removed the part file of a dead run", "resuming - 2/4 segments", 96 frames
  joined; PSNR 48-70 dB against the earlier one-piece render). Pure-mode velocity blur poses every frame
  at its own shutter-open time, so a segment's first frame is the same as in one piece. The runs already
  going (C, E) keep the old code; G, H, F2, M pick it up.
- P-09 (`set.clouds`): a dawn altocumulus deck south of the settlement home (`LOOKS.settlement.deck`,
  `when: 'clouds'` so P-08 is untouched), warm on the sun side (`glow`: vertex colour by heading from the
  home), alpha fading to the card's edge (`edgeFade`: a deck at 3.5 km would show its edge above the
  horizon). Node preview only so far; the previous P-09 is kept in `eng1/director/backup/`.
- X2-13 (session-5 restage) rendered: from behind her, her head beside his snout, his eye sharp - reads as
  closeness, not quite forehead to forehead (a side view hid her behind the snout). Kept.

## Session 5 (2026-10-27, resumed after a container restart)

- State found: 48 of 75 3D shots rendered in the scratch work folder (`eng1/director/work/shots`, it
  survived); the session-4 queues had stopped mid-1A-23 / mid-X2-13; the reworked prologue landscapes
  (P-08/P-10/P-11/P-12) had never been re-rendered (the P-08..P-12 videos were the provisional builds).
- Renders: two queues (`eng1/director/queue3.sh "" BIRTHING_CHAMBER`; `queue5b.sh`: VERDOR_GROUNDS,
  ALEXANDRIA_ROOM, PALACE_CORRIDOR, SEA_COAST_DAWN changed shots, then PROLOGUE_VISTAS P-08..P-12 forced).
  Other tracks render at the same time: load 15-25 on 4 cores, the chamber ~10-20 s per draft frame.
- Review of every rendered shot (3 frames per shot, `eng1/director/vid-rows.sh`), against its staging:
  - 1A-22 was wrong: the solver (from 320, 65 mm) could not hold the two heads (0.68 screen units off),
    put the hatchling LEFT and Abby's face sharp and frontal on the right. Restaged low along the
    hatchling (from 22, 0.6 m high, 50 mm f/1.4): the hatchling sharp in front, Abby soft beyond, her
    reaching hand between, the broken shell soft at the left edge (still checked).
  - X2-10 (HANDS) does not read as hands: Abby's kneeling hands cannot reach the wing knuckle (0.15 m
    off the grass, her hands 0.35 m above it; no hand IK to the ground). A restage from the west was
    worse (her body filled the frame); the first render (a medium of her kneeling at his head, face
    small, not speaking) is kept. Needs reach-down IK in the humans/performance track.
  - 1A-06/07/08 macros: the shell movement (shift, flex, the fragment lifting away) is too subtle to
    read at draft; the props egg's zigzag crack lines read as drawn. Kept for the draft.
  - P-14 low-cloud sky is a flat gradient card; P-17 grass flat from above. Kept for the draft.
- 03:56: both of my renders died for memory (`page crashed: renderer process died`) while I ran
  extra still tests next to them and the other tracks' renders (15.7 GB machine, 6+ browsers): the
  chamber process gave up its whole queue after one failed restart. render-shots now waits and retries
  a crashed browser (1, 2, 4 min backoff) instead of failing the set; do not run still tests beside two
  queues here.
- X2-13 restaged (her head was INSIDE Leaf's long snout: `nearTo` 0.95 m from the skull, the snout
  reaches ~0.75 m past the eye; now 1.35 m, she leans her forehead to the snout's tip, from the south-
  east past her, his eye sharp); X1-03's focus pulls from her head to the door (the bun read as a
  painted disc at that size).
- Planted feet wired in (`legs: 'planted'`): on for the walkers of the not-yet-rendered chamber shots
  (1A-31, 1A-32, X2-01, X2-03, X2-16); the rendered walkers keep the built-in gait.
- Riders (`ride: '<creature>'` on a human cast entry with a seated build): the stage mounts them with
  the creatures library's saddle / straddle / grab bar / stirrups and poses them from the mount each
  frame (README "Riders"); `tools/probe-ride.js` is the test scene. NOT YET SEEN RENDERED at the time of
  writing (the machine was full) - render the probe before using it in a shot.
- Engine: the framing solver is now a pure module (`framing.js`, self-tested); a failed framing warning
  names the camera side that would hold it (`suggestFrom`); the stage's per-shot warnings are kept as
  review flags in each shot's sidecar (`notes`) and in `cut/cut-report.json` (they had only scrolled
  past in a log - that is how 1A-22 went unseen).

## Session 4 (2026-10-24, resumed after a usage-limit stop)

- Renders: the 29 unrendered shots queued in two parallel queues (BIRTHING_CHAMBER alone; then
  PALACE_CORRIDOR, VERDOR_GROUNDS, ALEXANDRIA_ROOM), finished shots kept (`--redo-on shot`). Queue
  scripts in the scratch folder (`eng1/director/queue3.sh`, `queue-after.sh PID SET`, `queue-vistas.sh`).
  Measured: the chamber 5-12 s per draft frame with two browsers sharing the 4 cores.
- Review of the rendered shots (cut sheets of the interim cut + 1:1 frames), fixes:
  - PROLOGUE_VISTAS landscapes rebuilt (they read as CG: one grey texture over a smooth slope with its
    tiled normal map drawing chevrons, a palisade-like cliff, a crosshatched island):
    - farmed land = an anisotropic jittered-grid Voronoi of FIELDS (pasture / hay / rough / ploughed:
      vertex colour + a soil layer), HEDGES of overlapping instanced bushes along the field boundaries
      (gaps, gateways), hedgerow trees and small woods (nature `treeKit`: hawthorn, sycamore, oak, ash);
      a `grass` terrain material with large tiles, weak normals and min roughness 0.88 (smooth grass
      mirrored the sky at grazing angles: pale blue fields);
    - P-08: hedged small fields round the houses, rough grazing, a patchy moor (heather / bracken) on
      the hill, shingle at the shore; P-11: long hedged strips below the walls, a clear glacis, woods;
    - P-10: seen ALONG the coast (the face square-on under the raking dawn sun read as a palisade); the
      cliff has a bench (a weathered soft bed) with scrub on it, 48-74 m height along the coast, a talus
      foot with fallen blocks; no fine gullies / run-off streak comb;
    - P-12: no shadow-map self-shadowing at 2.5 km (acne), finer mesh at the faces, big texture tiles.
  - P-06: the shape in the mist drifts at 24 m/s (was 9: a near-static smudge), silhouette 0.34.
  - 1A-11: the second attendant turned from the lens (his face lit orange by the table lamp, the beard
    sparkling); X2-05: the servants lower their eyes (one turned full face to the lens).

## Session 3 (2026-10-23 evening, resumed after a usage-limit stop)

- The dailies of the earlier sessions were in `output/` and were lost with the container; the 13 shots
  in the scratch work folder survived. Renders now go to the scratch work folder:
  `render-shots.mjs --work <scratch>/eng1/director/work --redo-on shot` (two queues: the prologue sets,
  and BIRTHING_CHAMBER in parallel; `--redo-on shot` so a builder change that cannot alter a finished
  shot does not re-render it - force those with `--only <ids> --force`).
- Review stills of every unrendered shot first (`--stills 0.15,0.5,0.85`), then fixes:
  - 1A-18 / 1A-32: people walking in/out through the chamber door were cut into floating pieces: the
    passage card sat inside the wall's tunnel, in front of them. The architecture's dim interior
    portal (at the wall's outer face) is now split out as its own mesh (`set.portal: false` hides it),
    the card goes 1.1 m beyond the wall, scaled to fill the opening (`set.passageCardScale`).
  - 1A-02: the tilt from the window spent 3 s on a dark wall; now it holds on the window, tilts down
    along the shaft and holds on the room (attendant, bowls, egg).
  - 1A-15: the back of Alexandria's head close up read as a flat hair disc (humans library bun); now
    from behind her left shoulder, the hatchling in frame, her face turned away down.
  - 1A-21 / 1A-29: the framing solver pinned the camera to the south wall far west: Remi's face read in
    profile while he speaks. Explicit cameras behind them (backs; his look to Abby turns away).
  - P-05: the sailor's turn showed a full profile; kept to a lost profile.
  - P-16: the wing cloud read as a loaf with drips; repainted (`sets/wing-cloud.js`): arm, wrist,
    finger streaks radiating to a scalloped trailing edge (Node prototype: same noise as the page).
- Cut assembler: the sound track started at the first line (12.1 s; MP4 audio start_time) and ended
  with the last one; now a silent bed + `aresample=async=1:first_pts=0` makes it start at 0 and run
  the cut's whole length. `--keep-work` keeps the ffmpeg graph for debugging.

## State (2026-10-23, before session 3)

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
