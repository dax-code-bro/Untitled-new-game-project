# Creatures model-quality pass - progress notes (for a successor)

Owner paths: `scenes/lib/creatures/`, `scenes/lookdev/creatures-*.js` (+ creatures-dev.json).
README.md in this folder is the full description of how the models are built; this file is
only the state of the work.

## REQUEST from director s31 (2026-11-07) - working / young dragon colours
VERDOR_HARBOR (X4-04 quay dragon, X4-05 net dragon) and the X4-13 riding school cast ordinary working / young dragons. The
library has only the hero looks (charcoal, leaf, starlight, gold) + 'scout'; the director uses Leaf's design (L 4.6-9) with
`opts.look: 'scout'` (slate grey) for all of them, so every working dragon is the same grey. Please add 3-4 plain looks
(e.g. rust-brown, dun/sand, dull olive, blue-grey) with ordinary membranes (no hero markings) and, if cheap, a jaw-hold of a
rope while walking low (X4-05: `walk` + `mouthHold` blended; now the line just runs to the head bone).

## REQUEST from director s29 (2026-11-07) - F4 near wing off the hip
The s14 leg tuck worked (hl_L hip (635,314), knee (643,347), ankle (629,366) at CAMS 100, all above her forearm), but the
leg still does not read: it sits inside the hatchling's own crumpled near-wing panels (screen x 560-700, y 280-370) and at
the sleeve's top edge. CAMS 104 was tried and is worse (the forearm rises on screen). Please do your s14 NEXT 1: fold the
near (L) wing up and forward off the hip band (per-side `armSide` in lie() sprawl, sprawlHum.L y 0.6 -> 0.9, or the
membrane ending above the knee), so a gold haunch + shin shows above her sleeve. Check with
`node render/render.mjs --still scenes/lookdev/style-f4-birthing-chamber.js --time 2 --preset draft --png out.png` and
the `[f4] screen` log. Director images: scratch eng1/dir29/f4_after.png, f4_t104.png.

## REALISM ROUND 2 - session 14 (2026-11-07, short budgeted session: F4 hatchling near hind leg - director s28 REQUEST)
Stills (draft, t=2, CAMS 100) under `/tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/scratchpad/eng1/cr14/`:
`f4_before.png` (s13 code), `f4_v1.png`, `f4_v2.png` (= `f4_after.png`, adopted), `f4_v3.png`, crops `v2_crop.png` /
`v3_crop.png` (x470-770 y220-460 x2, left before), sheet `cr14_sheet.png` (top: before | after full frame; bottom: the crop x3.2).
Done (code):
- poses.js lie() sprawl legSide: new per-leg `lift` (foot height above the ground, femur lengths) and `poleFwd`
  (knee pole forward). Defaults 0 = unchanged for every other caller.
- anatomy.js hatchling push.legSide.L: { footOut 1.6, kneeUp 0.35, footFwd 1.0 } -> { footOut 0.2, kneeUp 0.6, footFwd 0.2,
  lift 0.7, poleFwd 0.3 } (foot ~11 cm less splay, ~5.6 cm up against the flank).
Numbers (the scene's `[f4] screen` log, 960x540; her near forearm runs elbow (812,417) -> wrist (576,403), sleeve top ~y 370):
  hl_L hip / knee / ankle / foot: before (635,314) (645,349) (639,433) (625,454);
  v1 {fo .45, ku 1.2, ff .7, lift .4, pf .6}: (600,337) (618,378) (604,398) - foot behind her wrist;
  v2 ADOPTED: (680,363) (643,347) (629,366) - every joint above the forearm line;
  v3 {fo .35, ku 2.5, ff .45, lift .5, pf .4}: (609,354) (631,367) (618,386) - kneeUp does not lift the knee (the hip sits
  too low over the foot: the leg is nearly straight hip->foot, the pole only turns it).
RESULT (looked at): the leg is no longer under her forearm - the foot ended where the director asked (<= y 400, by the body).
But it still does NOT read as a leg: it now lies folded inside the hatchling's own near wing panels / lower flank (the
membrane runs to the knee, wing.to 'knee', and the crumpled near-wing panels cover the hip band x 560-700, y 280-370).
At most a gold haunch shape over the sleeve. A weak newborn with the leg folded - acceptable, but not a readable leg.
- npm test: 49 tests, 48 pass, 0 fail, 1 skipped. Not done: session 11 NEXT (X3-15 head-plate slab, Charcoal elbow flap) - no time.
NEXT (exact):
1. F4 near leg: the occluder is now the near WING. Add `armSide` to lie() sprawl (per-side sprawlHum / fold like legSide)
   and fold the near wing higher / further forward (elbow up over the back, sprawlHum.L y 0.6 -> 0.9) so the hip band
   clears; then re-check v2 leg numbers. Or raise the hip (push.raise per side) so kneeUp can lift the knee.
2. Session 13 NEXT 2-3 (F4 head size, F5 feet under the belly); session 11 NEXT 1-2 (X3-15 slab, Charcoal elbow flap).
REQUEST (director, style-f4): the near leg is now tucked above the forearm line (all hl_L joints y <= 366 at CAMS 100),
so your forearm no longer covers it. To actually SEE it the camera must look under the near wing: try CAMS 104 for F4 or
your s28 NEXT 1(b) (near arm from the lower foreground). Nothing else needed from the scene for now.

## REALISM ROUND 2 - session 13 (2026-11-07, short budgeted session: F4 hatchling, F5 Starlight)
Stills under `scratchpad/eng1/creatures/r2s13/`: `before/f4.png`, `before/f5.png` (session 12 code), `v1/f4.png`
(near leg footFwd 0.4), `v2/f4.png` (adopted, footFwd 1.0), `v1/f5.png` (adopted). Sheets: `f4_before_after.png`
(x150-800 y170-440 x2, top before), `f4_hip_before_after.png`, `f5_before_after.png` (x380-580 y60-160 x3, left
before), `f5_legs_before_after.png` (x430-530 y85-145 x6). Harness `h/legs.mjs <design> '<glide opts json>'...`
(leg joint positions in glide + ankle -> finger V tip distance = membrane stretch check).
Done (code):
- poses.js lie() sprawl: `o.legSide = { L: {footOut, kneeUp, footFwd}, R: {...} }` per-leg overrides (defaults = old).
- poses.js flightLegs: `o.fold` 0..1 (glide / flight pass `o.legFold`; default `design.flight.legFold`, else 0):
  hip -0.35, knee +1.2, ankle -2.7 rad at 1 (LEGF), toes clenched x1.6. Starlight: ankle 8.8 -> 6.0 behind the hip,
  toes from 11 m behind to 6 m; ankle -> finger V tip 37.1 -> 36.7 (shorter: no stretch).
- anatomy.js hatchling: skull 0.19 -> 0.17, trunk 0.27 -> 0.29 (L stays 1.0), eye 0.042 -> 0.039 (same eye/skull),
  push.fold curl [-70,10,20] (fingers +10), push.legSide.L { footOut 1.6, kneeUp 0.35, footFwd 1.0 } (L = the near
  side in F4: sideA = local +x faces the lens). Starlight: `flight: { legFold: 1 }`.
- materials.js: new `vent` palette entry -> uniform uVent (amount, flank share; default 0 = no change for others):
  indirect diffuse + specular x (1 - amt * downFacing * mix(flank, 1, ventral midline)). Starlight vent [0.5, 0.45],
  belly albedo 0.64 -> 0.59. Darkens only: no emission.
RESULTS (looked at): F5 - the legs no longer hang with spread talons: two small clenched feet tucked up at the
membrane's trailing edge beside the belly; the membrane runs on to them without a visible tear or stretch at draft.
The underside now models: the chest / belly midline and neck underside mid grey, the flanks and wing roots pale -
not one flat sheet, no glow. F4 - the head is a little smaller (still the biggest mass in this close framing);
the trunk reads longer; the cloth flap that came up over the neck is gone in this pose (the hands' IK follows the
longer chest, the drape lies flat under the chest) so no finger pokes through it; the near wing shows as crumpled
gold membrane panels on the flank. The near hind leg is STILL NOT READABLE: v1 vs v2 (footFwd 0.4 vs 1.0) look the
same - the leg is behind the near folded wing panels and/or Alexandria's right forearm (it crosses the hip band).
REQUEST (director, style-f4): the right forearm lies across the hatchling's hips; move it back / lower (or the
resting hand further forward on the back) so the near hip and leg are not covered.
- npm test: 49 tests, 48 pass, 0 fail, 1 skipped. creatures-dev.json untouched.
NEXT (exact):
1. F4 near leg: confirm where it is - render with the membranes hidden (or tint hl_L bones) at --time 2 and at
   --time 101 (high camera); if it sits under the near wing, lower the near wing's elbow (push.sprawlHum per side, add
   to legSide-like `armSide`) or move the foot back of the forearm (footFwd -0.3, footOut 1.9).
2. F4 head: if still dominant, skull 0.17 -> 0.16 and head widths ([0.15, 0.14] rows) -5%.
3. F5: the feet sit out at the trailing edge; for "under the belly" try `together` 0.5 with fold (hl_0 y) and check
   the membrane fold at the ankle at a closer still (creatures-dev glide view from below).
4. Session 11 NEXT 1-2 (X3-15 octave boundary; Charcoal elbow flap) - not started.

## REALISM ROUND 2 - session 12 (2026-11-06, short budgeted session: F4 hatchling, F5 Starlight)
Stills under `scratchpad/eng1/creatures/r2s12/` (scratchpad = the session's /tmp/claude-0/.../scratchpad): F4 before =
`../../stylecheck/f4-birthing-chamber.png`, after `f4d.png` (draft, t 2), crop sheet `f4_crop_before_after.png` (top
before, x150-790 y150-390); intermediate `f4a/b/c.png`, overview `f4a_101.png` (--time 101: high camera - shows the
hatchling's limbs are under Alexandria's hands/cloth and behind the body). F5 before = `../../stylecheck/f5-cling-square.png`,
after `f5a.png`, crop sheet `f5_crop_before_after.png` (x210-730 y60-180 x2, top before). Hatchling dev views (pushUp
k 0.3 on open ground): `dev0/sheet.jpg` (session 11 code: the wing a small flap on the flank, the legs rods),
`dev2/sheet.jpg` (elbows up), `dev3/sheet.jpg` + `dev4/sheet.jpg` (fold variants; dev4 top = the adopted one).
Done (code):
- anatomy.js hatchling: bigger hand / forearm (humerus 0.085, forearm 0.15, fingers III/IV/V 0.11/0.095/0.08), thicker
  arm / leg bones (bulk 1.3, body.arm 0.75, thigh 0.85, pec 0.6), slightly longer legs. New `push` block (read by
  poses.pushUp / struggle): `fold` (fingers up and back over the back, curl [-70,0,20], fanned mcFan 14 / fanDown 22),
  `sprawlHum` [0.45,0.6,0.66] (elbows up above the back like a grounded bat), `wristIn` 0.05, `footOut` 0.75, `kneeUp` 0.9.
- poses.js: lie() sprawl branch takes o.sprawlHum / o.wristIn / o.footOut / o.kneeUp (defaults = old values);
  pushUp merges `design.push` under the caller's options (o.fold wins). Other designs: unchanged.
- materials.js gold: relief amp 0.045 -> 0.06, headRelief 2.0 -> 2.5, wetRough 0.06 -> 0.045 (no visible change at draft).
- anatomy.js starlight: trunk ~+20% (trunkP), neck +17%, tail base +15%, keel 1.35, belly 0.75, pec 1.15, thigh 1.05.
RESULTS (looked at): F4 - two crumpled gold wing tents (elbow + finger fan) now rise above the back line behind the head;
the head still dominates and the legs / near wing stay hidden under Alexandria's hands + the cloth and behind the body
(staging - REQUEST to the director below). One near finger now pokes up through the cloth's edge (the scene's drape).
Wetness: no visible change at draft size. F5 - chest a little wider / deeper; still reads mainly as wings head-on; the
legs hang with spread toes (glide's flightLegs only draws them together).
REQUEST (director, style-f4): a camera / hands variant that shows the near flank (e.g. CAMS 104 h 0.2, or the hands under
the chest from the far side / further forward) - the hind legs and near wing are under the hands now.
- npm test: 48 pass, 0 fail, 1 skipped. creatures-dev.json restored.
NEXT (exact):
1. F5 legs tucked: add o.legFold to flightLegs (hip flexion forward, knee + ankle flexed, feet up under the belly; the
   membrane runs to the ankle on Starlight so check the drape) and a design default (`flight: { legFold }`) for Starlight;
   render style-f5 t 2 draft and crop x210-730 y60-180.
2. F5 shading: a darker sky-lit belly (belly albedo 0.64 -> ~0.5, or a ventral AO term) so the white underside models.
3. F4: if the director keeps the framing, a shorter/rounder hatchling head (skull 0.19 -> ~0.17) so the body share grows;
   and the fingers clear the cloth (fold curl[1] +10).
4. Session 11 NEXT 1-2 (X3-15 octave boundary; Charcoal elbow flap) - not started.

## REALISM ROUND 2 - session 11 (2026-11-06, short budgeted session)
Stills under `scratchpad/eng1/creatures/r2s11/`: X3-15 draft `before/X3-15_040.png` (= session 10 code) | `v1/X3-15_040.png`
(this code), crop sheet `x315_before_v1.png` (crop x620-940 y80-320 x2); debug tint `dbgx/` + `x315_v1_dbg.png`
(R = l0 odd, G = fine level shown, B = fragM). Walk (creatures-dev charcoal walk t 1.2, `--still` renders 3840x2160):
`before/walk_f1.png`, `walk_f2.png` (session 10), `walk/f1.png` (left flank) + `walk/f2.png` (right flank; head green =
the debug tint, ignore), sheets `walk_f1_before_after.png`, `walk_f2_before_after.png`; `dbg/nomem_0.png` (membranes
hidden), `elbow_drape_vs_nodrape.png` (right elbow, brightened: drape on | `drapeAmt: 0`). Harnesses `fing.mjs`
(finger joint positions per pose), `elb.mjs` (elbow / knuckle heights over a walk cycle for a pole bias).
Done (code):
- glsl.js: DKV3 gains `cp` (own cell point, lattice coords), `pr` / `gp` (bare profile 1 - q^k and its gradient);
  new `dkVorCell(p, T, an, jit)` (nearest cell id in dkVor3's metric). Additive only.
- materials.js (head, headVar > 0 only): the coarse/fine split is decided PER FINE CELL by the coarse cell its own
  point lies in (NEXT 1 of s10). Fine plates whose point lies in a whole coarse plate keep their part inside the
  splitting one with a rim along the coarse border (`fragM`: height x C.pr, cav/q max'd with C's).
- poses.js plantBack: pole up bias `(o.poleUp ?? 2) * max(0, swing)`. CAUSE of the walk "blade" (a): a forward-stepped
  wrist swung the elbow down (R elbow 3.1 m / knuckles 2.6 m vs 5.6 / 4.9 on the left at t 1.2; 1.9 m on the left at
  t 2.4), so the folded fingers ran back along the BELLY line and stuck out past the thigh toward the tail base.
  Now knuckles 3.9..5.2 m over the whole cycle (elb.mjs); stand: R elbow 4.5 -> 4.7, left unchanged.
RESULTS (looked at): X3-15 - the small plates in the lower left are now whole cobbles (no rimless fragments); the
upper-middle angular slab REMAINS. dbg tint shows why: it sits on the OCTAVE boundary (the curve where l0 changes):
fine l0 | fine l0+1 and coarse l0+1 | coarse l0+2 do not match across it, so the l0+2 whole plates are clipped along
that curve and abut the l0+1 plates. Walk - the low blade is GONE on both flanks; the folded fingers lie along the
upper flank (their tips still reach a little over the tail base on the near side - as in stand, not the reported tell).
(b) right-elbow pale membrane flap NOT fixed: drapeAmt 0 shows the raw LBS membrane balloons into big panels there;
the drape hides most of it but a bow-tie of two flat panels stands up just above the elbow (higher now that the
elbow is higher). It is a drape/skinning residue at the elbow, not the fold rule.
- npm test: 49 tests, 48 pass, 0 fail, 1 skipped. creatures-dev.json restored (hatchling).
NEXT (exact):
1. X3-15 octave boundary: decide the level per cell there too. Option A: hysteresis - evaluate the level of a coarse
   cell from lv at its cell point, lv(cp) ~ lv + dot(dlv/dvRest, cp*g - vRest) with dlv from a smooth attribute
   gradient (csRaw is a vertex attribute: add its rest-space gradient as an attribute in skin.js, or approximate from
   dFdx/dFdy - may flicker). Option B: near the boundary (|lv - round(lv)| < 0.15) force both sides to the SAME pair
   (l0 of the lower side) on the head only. Check with the dbgx tint (`col = vec3(mod(l0,2), useF, fragM)*0.25`, put
   right after `col *= mix(1.0, 0.5 + 0.7 * plateJ, ...)`).
2. Walk elbow flap (b): find which membrane vertices stand up - debug tint the membrane by aWing.z (patch id) and
   aEdge.x (distance to bone) in a side still; likely the propatagium / plagiopatagium root band skinned between
   humerus and forearm. Options: in drape.js pin / shrink that band harder (edgeTuck-like weight on patch 0 near the
   elbow), or blend those vertices' skin weights toward the forearm; or build a 'walk' drape variant (arm swung forward).
3. Re-render style frames + creatures lookdev at draft (not done since session 3; poses.js change moves the stand R
   elbow ~0.2 m).
4. Injured-rider level bar still; X3-02 grey; session 2 items 4-5 (Leaf/Starlight memFoldOcc, contacts, gait).

## REALISM ROUND 2 - session 10 (2026-11-05, short budgeted session)
Stills (draft) under `scratchpad/eng1/creatures/r2s10/`: before = `../r2s9/v1/X3-15_040.png` (session 9 committed code),
after = `v1/X3-15_040.png`, crop sheet `x315_before_v1.png` (crop x620-940 y80-320 x2, before | after);
debug tints `dbg/` + `dbg_sheet.png` (R = |m.N| cell point off the surface, G = q, B = d1 > 0.55; old metric) and
`dbg2/` + `dbg2_sheet.png` (R = |m.N| in the new metric, G = FINE level, B = q); side views of Charcoal `walk` t 1.2
`walk/f1.png` (left flank, view 0) + `walk/f2.png` (right flank, view 1), `walk_pair.png`, `walk_crops_x315full.png`.
Done (code):
- CONFIRMED (dbg): the X3-15 shards in the lower right were sliver/cap sections of 3D Voronoi cells whose point
  lies well off the head surface (|m.N| > ~0.45 cell; q ~ 1 over the whole section -> flat, straight-edged, own value).
- glsl.js dkVor3: new globals `dkVorN` (unit normal, set by the caller) and `dkVorKn` (default 0 = unchanged for every
  other caller): the metric is stretched along the normal (`rm += dkVorKn * (r.N) N`, gradient updated), so off-surface
  cell points lose their territory to their neighbours; continuous because N is smooth. DKV3 gets `m` (offset to the
  own point, in the metric) and `d1` (for debug / later use) - additive fields only.
- materials.js: `dkVorN = normalize(vRestN); dkVorKn = clamp(headVar * 2.2) * isHead` (Charcoal head only, kn 1 = 2x).
- creatures-dev.js: view index `Math.round(t)` -> `Math.floor(t + 1e-6)` (as the header documents: view i for
  t in [i, i+1)). That was the session-9 "both views the same" bug (t 0.5 and 1.5 both rounded to view 1); integer
  t (the documented --fps 1 workflow) picks the same view as before. creatures-dev.json restored (hatchling).
RESULTS (looked at): X3-15 - the lower-right/lower-left shard triangles are gone (plates meet in ordinary seams);
plates a bit larger. dbg2 shows only a few tiny slivers left. REMAINING shards (upper middle of the crop) are a
DIFFERENT cause: coarse/fine LEVEL CLIPPING - where a coarse cell that splits (C.id2 >= fsub) meets one that does
not, the fine plates are cut by the straight coarse Voronoi face (fine fragments without their rim) and the big
coarse plate keeps a long straight edge; with headDome 12 + per-plate value it reads as a big angular slab.
Walk side views (real side views now, lit from behind-ish): wing folded along the forearm, wrist down in front,
hind knee CLEAN (no membrane stretching or spike at the knee). Two other tells: (a) a long thin flat dark "blade"
running back from the belly toward the tail base on both sides (folded finger tips / trailing edge sticking out
past the body silhouette); (b) on the RIGHT flank a pale grey angular membrane piece (bow-tie shape) poking out at
the shoulder/elbow - membrane through the body or a fold flap catching the light; smaller on the left.
- npm test: 49 tests, 48 pass, 0 fail, 1 skipped. Style frames / creatures lookdev NOT re-rendered (budget).
NEXT (exact):
1. X3-15 level clipping: decide the split per FINE cell, not per pixel: in materials.js (head, headVar on) always
   evaluate F, take its cell point (add `V.cp = ip + g + o` to dkVor3, lattice coords), map it into the coarse lattice
   (`(F.cp - l0 * 7.31) * gA / gC + (l0 + 1.0) * 7.31`), query the coarse cell there (a nearest-point-only loop is
   enough) and show F iff that coarse cell splits OR the pixel's coarse cell splits (fine plates then stay whole; the
   non-split coarse plate is cut along fine-cell edges, reads as overlapping them). Check with the dbg2 tint again.
2. Walk tells: creatures-dev.json `{ name: charcoal, quality: standard, face: -60, pose: { name: walk, t: 1.2 } }`,
   views cam [+-0.95, 0.14, 0.05] target [0, 0.07, 0.05] fov 34; render with
   `render.mjs scenes/lookdev/creatures-dev.js --still --time 0 / 1` (NOT --fps/--seconds: that writes an mp4).
   Find (a) the trailing finger-tip blade (wing.js fold: tip of the last fingers past the hip?) and (b) the right
   flank grey membrane flap at the elbow (memFold / drape at the folded elbow).
3. Re-render style frames + creatures lookdev at draft (not done since session 3).
4. Injured-rider level bar still; X3-02 grey; session 2 items 4-5 (Leaf/Starlight memFoldOcc, contacts, gait).

## REALISM ROUND 2 - session 9 (2026-11-04, short budgeted session)
Stills (draft) under `scratchpad/eng1/creatures/r2s9/`: `before/X3-15_040.png`, `v1/X3-15_040.png` (= committed code),
crop sheets (crop x620-940 y80-320 x2, before | after) `x315_before_v1.png`; `v2`/`v3`/`v4` = rejected experiments
(see below); `walk_pair.png` (creatures-dev, charcoal `walk` t 1.2 - came out as a FRONT view, see NEXT 2).
Done (code):
- glsl.js dkVor3: also tracks d3 (third-nearest distance) and returns `V.ew = smoothstep(0, 0.16, d3 - d2)`, the
  confidence of the per-edge values e/up (they jump along the straight line inside a cell where the second-nearest
  cell switches). New struct field only - every other caller unchanged.
- materials.js head block (headVar, Charcoal): abut / deep / overlap are multiplied by `vew` (fade to a plain seam
  at the switch lines) and the overlap band is a smoothstep, not a step; the s7 per-plate tilt fades over the rim
  band `* (1 - 0.6 rimM)`.
RESULTS (looked at): the many small hard wedge facets at plate corners/rims are gone or softened (the head reads
softer and more continuous). NOT fixed: a few LARGE dark/light flat polygons with long straight edges (upper middle
and lower right of the crop, lower left of the frame). Experiments that did NOT change them (reverted):
v2 = generic tiltJ x0.3 on the head + coarse-plate tilt x0.5 (223 px changed: tilt is not the cause);
v3 = skin shadowSide BackSide (identical: not shadow-map acne); v4 = groove + drop of fine plates clipped by a
whole coarse neighbour (C.id2 >= fsub split edge) - changed them but made the upper dark polygon bigger/blockier.
DIAGNOSIS (best guess, unverified): they are SLIVER sections of the 3D Voronoi - the surface grazes a big cell near
its corner/edge, so the section is a long thin triangle; with headDome 12 (flat top) and per-plate value 0.5..1.2
(`col *= 0.5 + 0.7 * plateJ`) it reads as a flat shard of a different value.
- npm test: 49 tests, 48 pass, 0 fail, 1 skipped, exit 0. Style frames / creatures lookdev NOT re-rendered (budget).
NEXT (exact):
1. X3-15 slivers: debug-tint first (in the head block: `col = vec3(d1 > 0.55, vq, 0)` with d1 = distance to the own
   3D centre in cell units - add `V.d1 = d1` to DKV3), still X3-15@0.48, confirm the shards are high-d1 sections.
   If so: on high d1 (sliver) merge into the neighbour - use c2's plateJ (`dkH33(c2 + 7.7)`), fade the seam
   between them (cav * (1 - sliverM)), and drop the per-plate value jitter toward the mean; maybe headDome 12 -> 9
   only on sliverM. Do NOT lower headDome globally (more cobbles - session 8 note).
2. Membrane-at-knee side view still: creatures-dev.json `{ name: charcoal, face: 90 (or -90), pose: { name: "walk",
   t: 1.2 } }` (there is no `walkLow` pose - `walk` is the low walk); with face 0 and cam [1.15,0.12,0] /
   [0,0.12,1.15] BOTH views rendered the same FRONT view (time 0.5 and 1.5 via render.mjs --still): check how
   creatures-dev.js applies `face` / rotationY / cam offsets (line ~128) before choosing the cam. The front view
   shows wings folded along the forelimbs, wrists down, no spike or stretched membrane (small in frame).
3. Re-render style frames + creatures lookdev at draft (not done since session 3).
4. Injured-rider level bar still; X3-02 grey; session 2 items 4-5 (Leaf/Starlight memFoldOcc, contacts, gait).

## REALISM ROUND 2 - session 8 (2026-11-03, short budgeted session)
Stills (draft) under `scratchpad/eng1/creatures/r2s8/`: `v2/X3-15_040.png` (final; `v1/` = without the seam offset),
crop sheet `x315_s7_s8v2.png` (crop x620-940 y80-320 x2: session 7 | now), `leaf_call_pair.png` + `leaf_call_head.png`
(creatures-dev.js, Leaf flight t 0.3 corr 1: call 0 | call 1), harness `grip.mjs` (Node: addGrip bar per rider build).
Done (code):
- rider.js `addGrip(tack, rider, holder, opts)` (now also exported; mountRider passes its opts): a one-armed rider
  (build id ending `_injured`, i.e. abby_ride_injured - Abby's LEFT arm held in; or opts.gripHands 'R') gets a LEVEL bar
  at the usual place: the free right palm mirrored across the pelvis (root bone x), same height and reach. Measured
  (grip.mjs, rider.update(0.7) with ridergrip): abby_ride_injured bar axis [-1,0,0] (was slanting from the held-in
  left hand), length 0.325 m (abby_ride 0.327), right knuckle 3.8 cm / tip 1.0 cm from its bar end = same as abby_ride.
  NOT rendered (no injured-ride shot stilled). ridergrip.js / selftest-perf.mjs (perf track) unchanged: their test
  builds its own bar and still uses the loose limits for abby_ride_injured - REQUESTED perf to tighten.
- glsl.js: `dkVorK` global (smooth-min sharpness of dkVor3's border distance, default 9 = unchanged for every other
  caller) + a seam offset `(9/K - 1) * 0.045` on l2 (0 at K 9) so a softer K rounds the CORNERS without widening
  every plain seam. materials.js: `dkVorK = mix(9, 5.5, headVar-on * isHead)` (Charcoal head only); head pits
  scale 0.11 -> 0.07 and threshold 0.66 -> 0.72 (smoothstep 0.72..0.8).
- poses.js: flight `call` channel (o.call 0..1, flight AND glide; `callMod`): neck base +0.1 / top +0.16 rad, head
  +0.3 rad up, jaw +0.5 rad with a 7.5 Hz +-0.06 tremolo (pure in t), no blink while calling. Director X4-08 uses
  `['flight', { corr: 1, call: 1 }]` already - it works with no director change (blend in/out by the act blend).
RESULTS (looked at): X3-15 - plate outlines visibly rounder (domed scutes / river-cobble corners instead of cut
slate chips), pit streaks finer and fainter; grooves a touch wider than s7 even with the offset (v1 vs v2 nearly the
same). Remaining tells: a few large angular "shard" facets (upper middle and right of the crop: long triangular
dark/light planes - probably overlap `top` plates combined with the per-plate tilt on very large cells); the plates
now read slightly like cobbles (too regular a dome). Leaf call: jaw clearly open with teeth showing, head up, neck
lifted; reads as a call at 960x540. Mouth interior dark (no pink at this size).
- npm test: 49 tests, 48 pass, 0 fail, 1 skipped, exit 0. Style frames / creatures lookdev NOT re-rendered (budget).
NEXT (exact):
1. X3-15 shards: find which cells make the long triangular planes (debug: tint `top`/`under`/`deep` and plateJ in
   the head block, still X3-15@0.48) - likely clamp the per-plate tilt by cell size, or skip the tilt on `top` plates;
   then a little less dome on the biggest plates (headDome 12 -> 9 on Charcoal) so they read less like cobbles.
2. Still an injured-rider shot (grep `abby_injured` in episodes/s01e01/final/scenes/specs) to SEE the level bar.
3. Lit side view of Charcoal walking low (creatures-dev.json: charcoal, pose walkLow, cam side) - membrane knee.
4. Re-render style frames + creatures lookdev at draft (not done since session 3).
5. X3-02 grey; session 2 items 4-5 (Leaf/Starlight memFoldOcc, contacts, gait).

## REALISM ROUND 2 - session 7 (2026-11-03, short budgeted session)
Stills (draft) under `scratchpad/eng1/creatures/r2s7/`: `v1/X3-15_042.png`, crop sheet `x315_s6v3_s7v1.png` (crop
x620-940 y80-320 x2: session 6 v3 | now), `knee/1C-03_101.png` (Charcoal gathering for the vault, u 0.6),
`knee/1C-04_048.png` (Charcoal passing overhead, u 0.5), `knee/knee_pair.png`, `knee/c103_crop.png` (2x knee region).
Done (code, materials.js head block, Charcoal only via headVar):
- default rim flatten 0.6 -> 0.45 (abut/top/deep/under modifiers unchanged, cap 0.92).
- per-plate tilt: `vg += hv1 * (vec3(plateJ, plateJ2, ..) - 0.5) * 0.6 * (1 - 0.5 deep)` after the flatten - a
  constant gradient per cell, so neighbouring plates catch the key differently instead of sharing one plane.
RESULTS (looked at): X3-15 - plates a little rounder at the rims and more varied in value plate to plate; the
"broken slate" read is reduced but NOT gone: the big angular plates (lower right of the crop) still look like flat
stone chips, partly from their straight Voronoi edges and the streaky fine pit texture.
- Knee check (legTuck/legThigh): 1C-03 u0.6 (backlit, ground level, Charcoal crouched to vault) - no stretched
  membrane or spike at the knee; the folded plagiopatagium shows as a clean pale lit fold by the hip. 1C-04 u0.5
  (underside, overhead) - membrane meets the body/legs cleanly, no tearing. Both are silhouettes / far, so a lit
  side view of a Charcoal walk is still worth one still (none of the 1B shots has Charcoal walking).
- npm test: 49 tests, 48 pass, 0 fail, 1 skipped, exit 0. Style frames / creatures lookdev NOT re-rendered (budget).
NEXT (exact):
1. X3-15 slate read: round the plate OUTLINES (dkVor3 border: blend q toward a smooth-min distance on head cells,
   or lower the anisotropy so head cells are less polygonal) and soften/shorten the pit streaks on the big plates
   (pit noise scale 0.11 -> 0.07, threshold 0.66 -> 0.72); maybe a low dome on the biggest brow plates. Re-still X3-15.
2. Lit side view of Charcoal walking low (creatures lookdev `walkLow` at draft) for the knee/membrane check.
3. Re-render style frames + creatures lookdev at draft (not done since session 3).
4. X3-02 grey; session 2 items 4-5 (Leaf/Starlight memFoldOcc, contacts, gait).

## REALISM ROUND 2 - session 6 (2026-11-02, short budgeted session)
Stills (draft) under `scratchpad/eng1/creatures/r2s6/`: `v1/`, `v2/`, `v3/X3-15_042.png` (v3 = final), crop sheets
`x315_s5_s6v1.png`, `x315_s5_s6v2.png`, `x315_s5_s6v3.png` (crop x620-940 y80-320 x2: session 5 v3 | now),
`fly/1C-13_072.png` + `c113_crop.png` (Charcoal flight, legThigh), `fly/1C-07_036.png` (Leaf takeoff - NOT Charcoal).
Done (code):
- glsl.js `dkVor3` also returns `e` (a random per cell EDGE, symmetric: the same on both sides of a seam), `up`
  (+-1, antisymmetric: which cell lies on top where the edge overlaps) and `q` (d1/F2 border coordinate). Other
  callers unaffected (extra struct fields).
- materials.js head block (only where headVar > 0, i.e. Charcoal): per-edge seams - ~25% of edges abut with no
  groove, ~10% deep/dark, ~20% (brow ~45%, `browM` from uEyeC) OVERLAP: the top plate's rim stays up (no drop-off,
  rubbed lighter lip via vcr, +0.25 gA height) and the plate under it gets a dark shadow line; the plain seam is
  0.55 x as dark; the rim SLOPE (q 0.7..1, wider than the groove - this was the real "grout" under the raking key)
  is flattened 60% (abut/top 92%, deep/under 0). Plate-spanning cracks: a thin wandering noise iso-line (scale
  3.2 x local scale size, masked so only some areas get one) - dark, rough, slight V dent, ignores the seams.
RESULTS (looked at): X3-15 v3 - the uniform dark grout network is gone; plates now merge in places, step over each
other with a shadow on one side, and a few cracks cross several plates (`x315_s5_s6v3.png`). New tell: some flat
plates now read a bit like broken slate / dried mud (angular, flat) - see NEXT 1.
- 1C-13 (Charcoal flight wide, legThigh 0.04): the plagiopatagium meets the thigh/hip cleanly, no stretch or
  spike at the knee at this size (`c113_crop.png`). Takeoff with Charcoal NOT checked (1C-07 is Leaf).
- npm test: 49 tests, 48 pass, 0 fail, 1 skipped, exit 0. Style frames / creatures lookdev NOT re-rendered (budget).
NEXT (exact):
1. X3-15: restore a little roundness - in the head block lower the default rim flatten 0.6 -> 0.45 and give each
   plate a slight dome tilt (vg += (plateJ-0.5, plateJ2-0.5) style per-plate tilt x 0.3 on head) so flat plates
   do not read as slate; maybe tubercle-ish raised centres on the biggest brow plates. Re-still X3-15, same crop.
2. Charcoal takeoff / walk check for legTuck/legThigh: find a Charcoal launch shot in verdor-grounds.shots.json
   (grep "charcoal" + "launch"), still it at u 0.3/0.6; or creatures lookdev `takeoff`/`walkLow` at draft.
3. Re-render style frames + creatures lookdev at draft (not done since session 3) to check nothing broke.
4. X3-02 grey (session 3 item 3) still open; session 2 items 4-5 (Leaf/Starlight memFoldOcc, contacts, gait).

## REALISM ROUND 2 - session 5 (2026-11-02, short budgeted session)
Stills (draft) under `scratchpad/eng1/creatures/r2s5/`: `v1/1B-03_042.png` (leg tuck only), `v2/1B-03_042.png` (+ Charcoal
lowCurl), `1b03_crop_s4_v1_v2.png` (crop x120-480 y150-450: session 4 | v1 | v2), `v2/X3-15_042.png` (first headVar),
`v3/X3-15_042.png` (final headVar), `x315_crop_s4_s5v3.png` (crop x620-940 y80-320 x2: session 4 | now).
Harnesses (CORRECTED camera + placement - see below): `r2s5/fingR.mjs [k]` (right-wing finger joints + finger-tube
vertices in the spike box, 1B-03 projection), `r2s5/proj4.mjs` (which meshes land in the spike box), `r2s5/proj3.mjs`,
`r2s5/low.mjs` (patch-4 lowest vertices).
SESSION 4's DIAGNOSIS WAS WRONG: its harnesses used vfov 2*atan(12/40) and rotation.y = +190 deg. The director uses a
Super35 sensor (24.89 mm wide -> 14.0 mm high at 16:9: vfov = 2*atan(7/40)) and `yawFromHeading(190)` = PI - 190 deg.
With the real camera the 1B-03 "spikes" are Charcoal's RIGHT-wing finger tips (finger tubes w_R_f0_3 / f1_3, last
phalanx hanging from ~12.6 m to 11.4 m world), not membrane. Also session 4's `lowCurl [-6, 0, -8]` was written on
line 154 = STARLIGHT's design (kept: it is harmless and folds her tips up too), Charcoal had no lowCurl (default
[-6, 6, 18] = tips curl down).
Done (code):
- anatomy.js Charcoal `fold.lowCurl: [-6, 0, -8]` (the low stand / crouch fold): last phalanges level (f*_3 at 12.56 m,
  was 12.16 with tips at 11.4); no finger vertex left in the spike box. 1B-03 v2: the two hanging points are GONE
  (`1b03_crop_s4_v1_v2.png`), the right finger bundle ends in a short blunt nub by the wrist.
- wing.js `membrane(..., { legThigh })` (m, opt-in, creature cfg `memLegThigh` x L; Charcoal 0.04): plagiopatagium
  vertices farther than ~legThigh from the shank ride on the THIGH (only the band at the shank follows the shank).
- drape.js opt `legTuck` (0..1, + `legFold` 0.3, `sideName`): in a ground-fold drape every shank/foot-weighted vertex
  is folded up about the knee onto the thigh line (pinned ones too). Charcoal drapeOpts stand/lie/crouch legTuck 1.
  Effect in 1B-03: the slack plagiopatagium bag under the right arm is gone; the wing's lower edge is now a clean
  line above the forearm/leg (v1 vs s4 in the crop sheet). Patch-4 lowest in the stand drape 10.90 -> 12.32 m world.
- materials.js head `headVar` (uLook3.w, default 0 = off; Charcoal 0.45): per-plate albedo 0.5..1.2 (darker on
  average, decorrelated from the generic scale shade), crown wear suppressed on the head (dark tops), per-plate
  roughness + specular jitter, fine pits (small dark, rough, slight normal dent). X3-15 v3: plates now differ in value
  and sheen, overall darker, fine scratch/pit texture on the big plates (`x315_crop_s4_s5v3.png`). v2 used a coarse
  pit noise that read as WOOD GRAIN - fixed in v3 (pit scale 0.11 x scale size, gradient 0.06).
RESULTS (looked at): 1B-03 spikes fixed; X3-15 improved but still a tile mosaic (uniform dark seams around every
plate).
- npm test: 49 tests, 48 pass, 0 fail, 1 skipped, exit 0. Style frames / creatures lookdev NOT re-rendered this
  session (budget) - the two director stills above built Charcoal with all changes.
NEXT (exact):
1. X3-15: the seam network is still the tell - vary seam width/darkness per plate edge (some plates abut with no
   visible groove, some overlap), add 2-3 plate-spanning cracks/scars, and lift a few plate edges (imbricate) on the
   brow; reference: saltwater crocodile cranial table / Komodo head ECU. Re-still `X3-15` at draft, crop x620-940 y80-320.
2. Check the legTuck/legThigh change in a flight / walk shot (the shank band still follows the shank, the rest rides
   on the thigh: look for membrane stretching at the knee in `takeoff`, `walkLow`) - e.g. creatures lookdev at draft.
3. X3-02 grey (session 3 item 3) still open: albedo x0 diagnostic.
4. Session 2 items 4-5 (memFoldOcc for Leaf/Starlight; Leaf/Starlight mount contacts, displacement hierarchy, gait).

## REALISM ROUND 2 - session 4 (2026-11-01, short budgeted session)
Stills (draft) under `scratchpad/eng1/creatures/r2s4/`: `v1/1B-03_042.png`, `v1/X3-15_040.png` (director's VERDOR_GROUNDS,
1B now with the director's darker LOOK1B), `1b03_s3v2_s4v1.png` (1B-03 session 3 v2 | now), `x315_s3v1_s4v1.png` (X3-15
session 3 v1 | now), `x315_s4v1_crop.png` (1:1 eye crop), `hero/` (creatures-charcoal-check.js at draft, see below).
Harnesses: `r2s4/fing.mjs <pose> [json]` (left-wing finger joints + tips, root frame), `r2s4/proj.mjs` / `proj2.mjs`
(Charcoal placed as in 1B-03 - CH [44,-66], G 9, face 190 as rotation.y - and every vertex projected through the
1B-03 camera; lists which mesh / membrane patch / skin bone lands in the spike box).
Done (code):
- Finger tips folded UP: Charcoal `fold.lowCurl` [-6, 4, 16] -> [-6, 0, -8] (anatomy.js; the low stand / crouch
  k <= 0.5 fold): tips 3.1-3.7 m -> 4.4-4.5 m, level with the finger bundle instead of drooping. `mount` and `lie`
  (poses.js, all dragons) fold curl [-2, 14, 30] -> [-2, 10, 2]: Charcoal's tips 1.1-2.0 m -> 2.4-2.7 m (no tip
  points down past the wrist/thigh any more). Seat / rig marks untouched (thorax and wrists unchanged).
- Head seams: new skin param `headCav` (uLook3.z, default 1 = old): scales dkCav on the head (colour darkening, AO,
  crevice roughness/dust all follow). Charcoal headCav 0.3, headDome 8 -> 12, headLook2.z 0.85 -> 0.6.
- New lookdev scene `scenes/lookdev/creatures-charcoal-check.js` (charcoal-front + charcoal-head only, 1 s each).
RESULTS (looked at):
- 1B-03 spikes: STILL THERE after the finger fold (`1b03_s3v2_s4v1.png`, the two thin points left of Remi hang the
  same). DIAGNOSED with proj2.mjs: they are NOT finger tips. The spike box (x 225-300, y 230-400 of 960x540) holds
  the elbow (w_L_1 projects to 259,221) and the knee (hl_L_1 at 277,297); the hanging vertices are membrane patch 4
  (aWing.z = 4: the plagiopatagium, finger V to the thigh/shin), skinned 0.55-0.86 to `hl_L_1` (the shin), lowest at
  world y 10.6 (1.6 m above the turf). Drape gravity 0.05 -> 0.015 made them LOWER (10.36), so it is not sag: the
  membrane's leg-attached edge follows the shin down from the knee in the crouch (reverted the gravity test).
- X3-15: seams now mid-dark grey instead of black grout, plates flatter (`x315_s3v1_s4v1.png`). Still reads as a
  flagstone mosaic: plate tops are uniform flat mid grey, no per-plate value/height variation.
- Hero check (`r2s4/hero_fix1b_vs_s4.png`: approved fix1b | now, front top / head bottom; `hero_head_crop.png` 1:1):
  with bodySpec 0.35 + headCav 0.3 Charcoal reads near-black with legible fine scales and a faint sheen, no grey
  film, no grout lines - keeps (improves) the approved look. The front shot's pose differs from fix1b because of the
  LOW-stance round (expected), and the head shot's framing now puts the eye at the top edge (shot camera, not
  material) - re-aim `charcoal-head` in creatures-shots.js if it is used for review again.
- npm test: 49 tests, 48 pass, 0 fail, 1 skipped, exit 0.
NEXT (exact):
1. 1B-03 spikes = patch-4 membrane on the shin. In wing.js / creature.js skin weights: weight the patch-4 vertices near
   the leg attachment to the THIGH (hl_L_0) rather than the shin (a bat's plagiopatagium meets the leg high, at the
   knee/ankle line, and is tucked flat when the leg folds), or in drape.js pin/tuck patch 4's leg edge (pull vertices
   within ~1.5 m of the knee up toward the knee-thigh line). Re-run proj2.mjs: target lowest patch-4 vertex >= 12.0
   world y and no vertices below the knee in the box; then re-still 1B-03.
2. X3-15: add per-plate albedo value jitter (+-15%) and darker plate tops for Charcoal (head albedo toward near-black,
   sRGB ~30-40 in this ECU), a little per-plate height variation (headRelief per cell), fine pitting on tops; the seam
   is OK now. Reference: Nile monitor / saltwater crocodile head ECU (cranial scutes are irregular, not cobble tiles).
3. X3-02 grey (session 3 item 3) still open: albedo x0 diagnostic.
4. Session 2 items 4-5 (memFoldOcc for Leaf/Starlight; Leaf/Starlight mount contacts, displacement hierarchy, gait).

## REALISM ROUND 2 - session 3 (2026-10-31, short budgeted session)
Stills (draft, director's VERDOR_GROUNDS set, `node scenes/lib/director/tools/still.mjs <job> --preset draft --out DIR`)
under `scratchpad/eng1/creatures/r2s3/`: `v1/` (X3-15@0.48, 1B-03, X3-02), `v2/` (1B-03, X3-02 after the stronger
tuck / bodySpec 0.35), `diag_nodust/` (X3-02 with dust/wear off - diagnostic only, NOT committed),
`teeth_v2s2_v1_v2.png` (1B-03 wing-edge crop: session 2 / v1 / v2), `x302_v1_v2.png` (X3-02 body crop).
Done (code):
- materials.js skin: new uniforms `uHeadLk2` (param `headLook2` [periR in eye radii (0 = off), granule size factor,
  octave mix 0..1, lid scale factor]), `uEyeC` (eye centre |x|,y,z + radius in rest space, set from `ctx.anat.eyes[0]`),
  `uLook3` (params `bodySpec` - specular occlusion for the whole body like headSpec, 1 = off - and `headDome`, the head
  plate dome exponent, default 5 = old). Periocular granule ring (scale x0.38 inside ~2.6 eye radii, eased from 0.55x
  that radius), lid shells x0.55 scale, head octave mix (fsub -> 0.42 so ~half the coarse plates stay big beside
  split small ones). Charcoal: headLook [0.04, 0.3, 0.3, 0.3] (thinner seams, less tilt), headLook2 [2.6, 0.38, 0.85,
  0.55], headDome 8, headRelief 0.45 (flatter), bodySpec 0.35. Defaults leave every other dragon unchanged.
- drape.js: opt `edgeTuck` (0..1) + `tuckD` (m, default 0.05 L): rest lengths of membrane edges within tuckD of the
  free trailing edge shrink by tuck x w^2 (elastin cord along a bat's trailing edge). Charcoal `drapeOpts`
  (creature.js): lie/crouch {edgeTuck 0.85, tuckD 2.9}, stand {edgeTuck 0.6, tuckD 2.2}.
RESULTS (looked at):
- X3-15 `v1/X3-15_040.png` vs `../r2s2/v5/X3-15_040.png`: tiny granules now ring the eye, the lid is finely granular,
  big and small plates mix, plates flatter. Still reads as a flagstone mosaic: every plate has a hard dark seam and a
  flat grey top (mid grey, not black, in this ECU).
- 1B-03 `teeth_v2s2_v1_v2.png`: the hanging spikes are shorter/thinner with the tuck but STILL there (two thin hanging
  points left of the wrist). They do not respond much to the drape -> most likely PINNED geometry (finger-tip
  phalanges / bone-adjacent membrane, edgeA.x < pinD, which the drape cannot move): a fold-pose issue (poses.js
  plantBack finger angles in `lie`/mount), not the drape.
- X3-02 body grey: YAVG of a 200x150 body crop = 81.7 (bodySpec 0.55) -> 78.8 (0.35) -> 77.8 (also no dust/wear).
  So the mid grey is NOT specular sheen or dust: it comes from lighting/haze/grade (aerial perspective or black level
  at ~40-60 m, or diffuse IBL strength) -> REQUEST to director/gpu-tier in the report. Even the smooth forearm and the
  shadowed legs read the same grey.
- npm test: 49 tests, 48 pass, 0 fail, 1 skipped, exit 0.
NEXT (exact):
1. 1B-03 spikes: build Charcoal in `mount` in a Node harness, list membrane vertices with the lowest y in the root frame
   (and their aEdge.x / aWing.z patch id) to see whether the spikes are pinned finger tips; if so, in poses.js `mount`
   / `lie` fold the last phalanges up/back (finger flex at the tips) so no tip points down past the wrist.
2. X3-15: the seam still reads as dark grout. In dkSkin, for isHead make the cavity colour darkening (uMisc.x x dkCav)
   much weaker (x0.3) and give the plate EDGES a small bevel highlight rather than a dark gap; try headDome 12 and a
   lower headLook2.z (0.6). Re-still `X3-15@0.48`.
3. X3-02 grey: diagnose with the director (exposure / AP haze / tone curve toe) before touching the material: render
   X3-02 with the creature's albedo x0 (should go to the same grey if it is haze) - a one-line temporary edit in
   materials.js (`albedo = col * 0.0`) - then file the result.
4. Lookdev check that bodySpec 0.35 keeps the approved hero look: creatures-shots.js charcoal-front / charcoal-head.
5. Session 2 items 4-5 (memFoldOcc for Leaf/Starlight; Leaf/Starlight mount contacts, displacement hierarchy, gait).

## REALISM ROUND 2 - session 2 (2026-10-30, short budgeted session: X3-15 / 1B-03 / X3-08 in the director's set)
Stills (draft, director's VERDOR_GROUNDS set via `node scenes/lib/director/tools/still.mjs <job>[@u] --preset draft --out DIR`,
~2.5-4 min each) under `scratchpad/eng1/creatures/r2s2/`: `base/` (state at session start), `v1/` `v2/` `v3diag/` `v4/` (+ `v5/`).
- X3-15 REPRODUCED (`base/X3-15_040.png`): hard grey cobbles. DIAGNOSIS (`v3diag/X3-15_040.png` = head specular x0): the
  grey is the SPECULAR sky sheen (F0 0.04 at roughness ~0.6 over this set's bright IBL) - with it removed the head is near
  black (~sRGB 45, the rest is set haze/post). Smoother crowns (v1, headLook.x -0.26) made chrome cobbles: worse.
  Fix: new skin uniforms `headLook` [roughDelta, seamWidthMul, microMul, perPlateTilt] and `headSpec` (specular
  occlusion of dry pitted keratin on the head: specularColor/F90 x headSpec x micro x (1-0.5 cav)). Charcoal:
  headLook [0.04, 0.45, 0.3, 0.35], headSpec 0.25 (head AND eyelid shells, region 7), skin3 [0.7, 0.16, 0.15, 0] (fainter brushed micro streaks),
  head plates scl.z 0.42 (was 0.6; the visible cell size barely changed - octave quantised), headRelief 0.6.
  Defaults keep every other dragon unchanged. RESULT `v5/X3-15_040.png` (vs `base/`): the head and lid read
  near-black charcoal with a faint sheen now, no grey film - but the SHAPE still reads as cobbles (pillow plates of one
  size in even dark seams; per-plate tilt barely shows). `v4/` = headSpec 0.35 without the lids.
- 1B-03 white patch CONFIRMED in the director's framing (`base/1B-03_042.png`): the folded wing's underside (pale
  grey-blue, lit by sky through/under the fold) right of Remi + the forearm tube. Fix: membrane uniform `memFoldOcc`
  (Charcoal 0.7, default 0): when folded, indirect diffuse+specular x (1 - occ x fold x (0.55..1 facing down)) and the
  transmission x (1 - 0.8 occ fold). `v2/1B-03_042.png`: the underside is dark slate now, folds still read. The hanging
  trailing-edge scallops still read like teeth/jaw from this angle (open).
- X3-08 neck: `poses.mount` neck now leaves the chest nearly level and arches down (neckBase 0.24 -> 0.1, neckTop
  0.06 -> -0.08; options still override): head joint 5.15 -> 4.19 m (seat 5.71). `x308_before_after.png` (3x crop):
  the column is gone, head sits low in front of the chest, Remi visible on the seat above. Seat/rig fit unchanged
  (thorax untouched), so the director's marks stay valid. X3-15's camera aims at `charcoal.eye`, so it follows.
- tools/meas.mjs prints neck base/mid/top + head positions.
- npm test (after the last code change, run beside one render): 49 tests, 48 pass, 0 fail, 1 skipped, exit 0.
NEXT (exact):
1. X3-15 cobble SHAPE: (a) periocular ring of small granules around the eye (scale size x0.35 within ~1.5 eye radii
   of the eye centre - pass the eye centre as a uniform; real lizards/crocs have tiny granules round the lid); (b) the
   head octave split (`C.id2 >= fsub` in dkSkin) gives one cell size per octave - mix two octaves per region so big
   supraocular plates sit among small ones; (c) narrower seams/flatter dome on the head (dome 5 -> 8, headLook.y 0.3);
   (d) lid shell: finer granules. Re-still `node scenes/lib/director/tools/still.mjs X3-15@0.48 --preset draft`.
2. Body scales on Charcoal show the same sky-sheen grey at close range (1B-03 neck): try `headSpec`-like specular
   occlusion for the whole body (e.g. a `bodySpec` 0.6) and check 1B-01 / 1B-03 / X3-09 + the lookdev hero shots
   (creatures-shots.js charcoal-front / charcoal-head) so the approved distance look is kept.
3. Folded-wing trailing-edge scallops hang like teeth in 1B-03: shorten/tuck the drape's free edge for crouch/mount
   (drape.js) or stiffen the scallop amplitude when folded.
4. Same memFoldOcc for Leaf / Starlight (default 0 now) after a still of each folded.
5. Session 1 items 3-4 (Leaf/Starlight mount contacts, displacement hierarchy at 4K, gait weight) still open.

## REALISM ROUND 2 - session 1 (2026-10-30, short budgeted session)
Done (code):
- poses.js `mount(c, o)`: LOWERED FOR MOUNTING (director Session 9 request: crouch k 1 read as rearing - hind legs
  back, belly floating). Hind legs folded right under the hips (foot flat beside the belly a little ahead of the hip,
  knee up/forward along the flank, metatarsus 35 deg so heel AND toes touch: `tools/cts.mjs charcoal mount` gives
  hock 0.02, toes 0.00, wrist pad 0.11, thumb 0.02 m), level trunk (pitch 0.02), wrists + thumbs down in front
  (plantBack like `lie`), neck low/forward head up, tail hanging from the hips to the turf (sag 0.55), drape 'lie'.
  The thorax (seat bone) is placed from crouch k 1 then `drop` (0.35 m) lower: Charcoal seat y 5.71 z 8.00 vs crouch
  k 1 y 6.10 z 8.14; `{drop: 0, bodyPitch: -0.05}` = y 6.03 z 8.14. Chest underside 0.06 m, mid belly 0.57, rear
  1.11 m. `k` 0..1 blends crouch k 1 -> mount. Breathing lifts the seat ~0.07 m at the top of a breath (rib scale
  pushes the belly contact; groundRig). Documented in README "Mounting pose".
- materials.js: Charcoal head plates smaller (`scl.z` 0.75 -> 0.6), flatter (`headRelief` 0.7), less crown polish
  (`rough.z` 0.13 -> 0.08) for the X3-15 "grey cobbles" note; new membrane uniform `uMemFoldDark` (param
  `memFoldDark`, default 0.15 = old behaviour; Charcoal 0.45): the folded/gathered membrane is darker.
- DIAGNOSIS of the 1B-03 "white jaw/lip patch": the 1B-03 camera (spec pos [37.6, G+1.7, -54.6], 40 mm) is at
  Remi's head beside Charcoal's FLANK looking up - the pale area is the underside of the FOLDED WING (canon grey
  membrane, albedo 0.24 = 20x the black hide) with the forearm as the smooth "tube", not the jaw. memFoldDark
  darkens it ~1/3 when folded; NOT verified in that exact view (my lookdev camera missed the wing underside).
- Stills looked at (preview, lookdev sky): `scratchpad/eng1/creatures/dev_mount/sheet.jpg` (top row mount v1 with a
  straight tail - fixed; bottom crouch k 1), `dev_head1/sheet.jpg` (mount v2 side + 3/4: legs under, tail to turf;
  head views before the material change), `dev_head2/sheet.jpg` (after: eye at fov 14, head 3/4 - black, finer head
  plates; two wing-underside views that missed the wing). In this light the head reads black, not grey: the X3-15
  grey is mostly the director's exposure/sky; re-check in X3-15 itself.
- tools/meas.mjs (seat / joints / belly clearance per pose: `node scenes/lib/creatures/tools/meas.mjs 'mount'
  'crouch:{"k":1}'`), tools/cts.mjs (contact heights: `node .../cts.mjs charcoal mount`) - absolute import paths.
NEXT (exact):
1. Director (REQUEST in report): switch verdor-launch.js lines 57/106 `poses.crouch(c,{t:0,k:1})` -> `poses.mount(c,
   {t:0})`, X3-02 'crouch' act -> 'mount', re-run the mark print, update previs.marks; then render 1B-12 / X3-02 /
   X3-08 / 1B-03 / X3-15 at draft and LOOK (legs under, belly low, wing underside not white, head not cobbles).
2. If the folded wing underside still reads white in 1B-03: lower `trans` for folded wings too (dkThin x (1-0.55
   uFold) today) or raise memFoldDark to ~0.6; if the head still reads grey at 85 mm: raise `rough.x` 0.66 -> 0.72
   on the head only (add a head roughness term next to uHeadRel in the skin shader).
3. Same `mount` check for Leaf/Starlight (cts.mjs: Leaf toes 0.11, wrist pad 0.35 m off the turf - give Leaf a
   design override: mtAng ~45, or lift `hum` so the pad lands).
4. Then the broader realism goals of round 2 (displacement scale hierarchy at 4K, muscle bulge/slide, membrane
   flutter, gait weight, ground contact) - none started.

## FIX ROUND 1 of the low stance (rev. 3b, 2026-10-17, after the critics) - DONE
Dev loop (scratch): scratchpad/ep1p1/creatures-fr1/tools/ (copies of the creatures-low tools + arm.mjs: wing-arm joint
positions per pose; dev.sh, rv.sh <name> <ids|all> [preset], contact.sh, clear.mjs, build.mjs).
Done (code, committed):
- poses.js `plantBack`: the wing-arm folds BACK - upper arm back along the chest, elbow on the upper flank BELOW the
  back line, forearm sloping forward-down to the wrist pad ahead of the shoulder (LP.hum [out, up, back], reach,
  wristIn; per-dragon `stand.low.hum`). Used by the low stance (stand/walk/crouch/fire/land/launch), `sit`, `lie` and
  the newborn's sprawl. foldHand `levelK`: knuckles level, fingers stacked side by side (no deck-chair slats);
  `inwardJ` per-phalanx lean (a Z-fold was tried - too hidden, the wing vanished). Walk: the humerus swings with
  the wrist's step (pole only; the wrist lands exactly), wrists step in a forward-shifted range with a shorter
  stance (duty 0.55) so the elbow never rises above the back; Leaf's step 0.85 Hz.
- materials.js: Charcoal's membrane lighter neutral grey, canon black stripes ALONG the finger bones (stripeW),
  no between-bone bands (memX.w); membrane pleats when folded (memX.z); crease-network maze off for Starlight
  (memX.x 0) + low mottle; Leaf's membrane one value, less transmission; Starlight plates smoother, more facet
  tilt, clearcoat 0.8 + iridescence 0.3 (nacre), no dark outlines; Charcoal roughness spread; Leaf countershading;
  scout belly scutes; newborn wetter + more relief; the scout's wound torn flesh + blood running out.
- anatomy.js: scout tail 2.7 m (L 5.9), thicker, small thick vane; Charcoal horns a crescent with heavy taper and
  deeper saw-tooth rings (parts.js ringAmp); a real tongue; newborn horn buds longer.
- fire.js: domain-warped torn tongues, coherent turbulence field, surges (pulse-modulated sizes), cauliflower
  smoke; Leaf's light weaker. dust.js: subdivided lumpy turf clods (vertex colour), taller billowing dust wall.
- tack.js: the giants' rig without backrest board / grab-bar posts: leather skirt, cantle roll, pommel roll + loop.
- creatures-shots.js: + charcoal-level (level camera), leaf-abby = LOW crouch, + leaf-sit-alt (dog-sit, labelled
  the ALTERNATIVE for the open question), leaf-fire -> leaf-fire-lookdev (not Episode 1), head-in-mouth camera
  higher (Remi whole) and Leaf's wings folded, scout-wingloss closer/later/faster separation, takeoff 0.5 s later +
  downwash flattening of the grass (flattenGrass, pure in t). 19 hero shots.
- DESIGN.md rev. 3b (status bullet, 1.5, 1.5c + measured table).
Measured (stand, t=0, m): elbow Charcoal 5.30 (back 6.05; rev. 3: 7.85), Leaf 1.17 (1.35), Starlight 8.51 (9.16),
scout 0.77 (0.91). Walk: Charcoal's elbow 2.6-6.0 over the cycle.
Results (looked at at 1920 and as 1:1 4K crops; output/ is git-ignored):
- Hero: output/dragons-low/fix1/hero/{4k,1920,crops}/*-fix1.*, hero-sheet-fix1.jpg; 19 shots in one creatures-review.js
  job, 57m27s render (62 min wall, ~3.0 min/frame); charcoal-walk re-rendered alone at 0.6 s (the first pass at 1.4 s
  showed the far wing's drape flap standing above the back while that hand was lifted).
- Contact: output/dragons-low/fix1/contact/{4k,1920,crops}, contact-sheet-fix1-{3200,1920}.jpg, 29 frames, 6m58s; frame
  25 (walk) re-rendered alone at t 0.6 (--still --time 25); frame 26 = Leaf's dog-sit ALTERNATIVE.
- Every scene importing the library renders at draft: style-f1 49s, f2 185s, f3 111s, f4 146s, f5 386s, humans-riders
  67s, architecture-probe 13s (F2 needed no re-staging). npm test 33/33 (205 s).
OPEN (seen in the crops): the stand drape does not fit a lifted wing-hand in the walk (pick frames with both hands
down, or build per-phase drapes); a few angular membrane panels near the knee at 1:1; Starlight's plates still a
glazed mosaic up close; the fire jet still smooth near the mouth under motion blur; the scout's torn wing ends in a
smooth rounded stump (blood shading only); the newborn's flank shows a flat membrane fold; leaf-landing's half-open
wing reads as a flat green sheet.

## LOW STANCE round (rev. 3, 2026-10-16, Daxtyn: "make them low to the ground with their legs more towards the center of their body") - DONE
Dev loop (scratch): scratchpad/ep1p1/creatures-low/tools/ (dev.sh <cfg.json> <name> = creatures-dev.js views -> r/dev_<name>/sheet.jpg;
build.mjs, clear.mjs (belly clearance / joint heights per pose), contacts.mjs, membox.mjs (membrane bounds), armdbg.mjs).
Done so far (code):
- anatomy.js: hip joint moved forward to trunk station `stand.hipS` (default 0.68, was 1.0 = the tail base): the legs hang
  under the middle of the body; the pelvis bone pivots there; belly mass, ilium crests, stifle fold and the membrane's flank
  point follow. Arm bones rebalanced again (humerus ~0.55 of the forearm, span unchanged: Charcoal 4.5 / 8.1 m) so the folded
  wing can stand elbow-high beside the withers with the wrist down under the shoulder at a LOW shoulder height. Starlight's
  legs -15% (4.9 / 5.9 / 3.2), Leaf's -8%.
- poses.js: `stand` = the LOW stance (chest underside at `belly` x chest depth, default 0.34; trunk ~level; feet under the
  middle; wrist pads + thumbs down under the shoulders; neck forward and low; tail low, outer half on the ground);
  per-design `stand.low` overrides. `upright` = alias of `stand` (retired). `crouch`, `fire`, `sit` (rump on the ground,
  wrists planted in front) rewritten; thumbs aimed forward along the ground (`aimThumb`).
- drape.js: inverse skinning by damped least squares (near-singular blends threw the membrane hundreds of metres in the walk).
- creature.js: the 'upright' drape variant dropped.
- Also: `walk` stance contacts move back at exactly the walking speed (the feet skated at speed/duty
  before); `land` rewritten as a low approach (short ~25 deg flare, feet under the middle, wrists down,
  wings fold) - no rearing; `sit` lower (chest ~30 deg); stance asymmetry + slow weight shift (stiff
  poses); Starlight scales smaller/flatter with light crevice AO (cobbles); newborn skull flatter,
  limbs slimmer, smaller yolk belly (toy look).
- Shots (creatures-shots.js): 17 = the 14 before + charcoal-walk, charcoal-rest, leaf-landing; the
  contact sheet has 29 frames (turntables in the low stance, + Leaf sit, Charcoal lying, crouch).
- DESIGN.md: rev. 3 status bullet, section 1.5c (the low stance), 1.1/1.6 updated, appendix A bones.
Results (all looked at at 1920 and as 1:1 4K crops; output/ is git-ignored):
- Hero: output/dragons-low/hero/{4k/*.png, 1920/*.jpg, crops/*.png, hero-sheet-low.jpg}, file names end in -low,
  17 shots (creatures-review.js, the SHOTS of creatures-shots.js), render 52m04s (~3.1 min/frame, SwiftShader, final preset), job video 58.6 MB.
- Contact: output/dragons-low/contact/{4k, 1920, crops, contact-sheet-low-3200.jpg, -1920.jpg}, 29 frames, 7m35s.
- Measured low stance (m, stand at t=0): Charcoal hip 4.15 / knee 3.31 / chest underside 1.59 (0.35 of chest depth) /
  back 6.08 / folded elbow 7.85 / head 6.79 (rev. 2 upright: hip 7.0, chest underside ~4.3, trunk +30 deg);
  Leaf 1.06 / 0.97 / 0.42 (0.44) / 1.37 / 2.17 / 1.62; Starlight 6.57 / 6.50 / 3.09 (0.51) / 9.18 / 14.90 / 11.16;
  scout 0.59 / 0.67 / 0.25 (0.37) / 0.92 / 1.31 / 1.12. Hip at trunk station 0.68 (shoulder -> tail base).
- Every scene importing the library renders at draft: style-f1 66s, f2 231s, f3 119s, f4 174s, f5 444s,
  humans-riders 72s, architecture-probe 14s. F2 (Abby at Leaf's breast strap) needed no re-staging.
  npm test 33/33 (207 s).
OPEN (seen in the 1:1 crops, not fixed this round):
- Starlight: plates still read as a polished pebble mosaic in close-ups (starlight-rider); soft large blotches on the
  top of the membrane; the folded elbow "cloak" stands ~5 m above her back.
- Charcoal's chest scales read as paving slabs at 1:1; folded membrane shows angular grey panels near the hip in walk.
- Newborn: a flat drape sheet of folded membrane on the flank under the arm (contact 13 crop); still a bit plump at
  full-body scale.
- leaf-landing: heavy motion blur on the wings at the flare hides the fold.
- Transitions are kinematic (stand <-> walk <-> launch are pose blends), ground is assumed flat (no foot IK on slopes).

## Fix round 1 after the critics (2026-10-15, DESIGN "rev. 2") - state
Done (committed; renders under output/dragons-wyvern/fix1/, git-ignored, file names end in -fix1):
- TWO LEGS: new resting stance `poses.upright` (trunk raised 30-34 deg, feet ahead of the hips,
  tail level then laid on the ground, wings folded off the ground by `foldUp`); Leaf's `sit` keeps
  the wings folded (`plantWrists: true` for the old dog-forelegs version); `fire` stands on two legs.
  `stand` (wing-walk) stays the base of walk / crouch / launch / land. Contact sheet + charcoal-front
  + charcoal-head use `upright`. New drape variant 'upright' (creature.js).
- Arm bones rebalanced (humerus ~0.75 of the forearm, span unchanged) so the fold is compact;
  forearms taper to a narrower wrist. DESIGN 0 / 1.1 / 1.5b and appendix A updated.
- Armpit "hole" (Starlight): skin weights kept within their part (skin.js 2b), AO baked per part,
  minimal-twist arm IK (`armIK(..., minTwist)`), double-sided skin, relief faded where skinning
  compresses the skin (materials.js dkComp), an axillary web in the sculpt. A small dark crease can
  remain under a fully folded arm. Diagnostics: tools/flip.mjs (inverted triangles per pose),
  tools/stretch.mjs (stretched edges per pose), creatures-dev.json `debugBones` / `debugAttr` /
  `hideMembranes` / `hideParts`, pose `sculpt`.
- rev. 2b (after the first -fix1 4K pass): the hard body/limb weight seam left by 2b opened into a
  metres-tall "curtain" of stretched triangles at the shoulders and hips whenever the arm swung far
  from the sculpt (glide, dive, sit; worst on Starlight). skin.js 2c feathers the seams (Jacobi
  relaxation in a band 0.03 L either side). stretch.mjs, Starlight draft: edges > 15x the median
  edge glide 836 -> 2, sit 671 -> 0; Charcoal glide -> 0; flipped triangles in `upright` fell too
  (Starlight 499 -> 386, all in the elbow/wrist folds). Horn paths start inside the skull (no open
  sheath rim at the skin). Fire: young tongues get 0.8x gain (1.3x further out) and a more
  saturated core - the near-mouth jet is pale orange, no longer cream-white, and still starts at
  the lips. starlight-rider camera further off. Final renders (all looked at, 1920 + 1:1 4K
  crops): output/dragons-wyvern/fix1b/hero/{4k,1920,crops}/*-fix1b.* (14 shots via
  creatures-review.js, 36m58s render) and fix1b/contact/{4k,1920,crops} + contact-sheet-fix1b-*.jpg
  (27 frames, 7m02s). The -fix1 hero set in fix1/ still shows the curtain - compare
  starlight-rider and pair-flight. npm test 33/33 after the code changes.
- Materials: Charcoal blacker (rougher, little crown polish), neutral grey membrane with softer
  wavy stripes, steel-blue iris with flecks; Leaf darker green, duller membrane, olive-brown horns;
  Starlight broad flat plates (scaleMul 0.5, hairline joints, little micro relief); newborn yellow
  gold (more pigment, less metal, gold belly); transverse ventral scutes (glsl.js dkPlates);
  folded-membrane wrinkle is band-limited noise (no sine moire).
- Heads/horns: Charcoal's horns swing out clear of the neck, no burr collars, broken tip = rough
  fracture; bigger croc teeth, thin gums, slit nostrils; Leaf no jaw lobe; scout horns laid back;
  Starlight horn bases 0.28-0.4 m; newborn short snout, big eye, overbite, no lip ridge.
- Effects/staging: fire palettes (orange-red; violet-blue under the tone curve's shoulder), embers,
  two fire lights, puffs kept above the ground; take-off clods on a power law + skidding, dust dome,
  bigger craters/furrows, earlier frame (vault); head-in-mouth seen square on to Charcoal's head with
  Leaf's whole head inside (hold 0.5 rad, snout 1.85 m in), Leaf's wings half folded; Queen Fall
  rides Starlight (dive + new shot `starlight-rider`); scout rider crouched (lean 1.0); stirrups
  under the riders' feet (rider.js addStirrups; the saddle's own pair hides while mounted); scout
  wing loss: the propatagium root tears away with the wing (`w_L_mp`), camera from behind, 60-deg
  shutter; scout tail vane without surface noise.
- Contact sheet: 27 frames (adds Charcoal walking on feet + wrists, Leaf standing on two legs).
- NEXT (not done): the newborn's mouth still reads a little lip-like; Starlight's folded wing is a
  bundle of pale rods with flat folded membrane; membranes in flight still lack visible veins and a
  hem; flattened grass under the take-off; style frames (not owned) still use `stand`/`sit` and now
  get the new sit fold and arm proportions - their compositions were not rechecked at 4K.

## Wyvern rework (2026-10-14/15, Daxtyn: TWO legs, wings = front limbs, horns; DESIGN.md)
State (all committed; latest renders listed in README / the report):
- DONE anatomy.js: `DESIGNS` = DESIGN appendix A in metres (+ build extras: `body` muscle/fat,
  `bulk` limb mass, `fold.curl`, `headX`, `folds`, `crest`, `stand` incl. `tailSag`). REST pose =
  glide planform (membranes + finger tubes bound there); SCULPT pose = standing legs (2-bone IK,
  feet at `dims.footX` = max(1.06 hipX, 0.62 toeL) so the inner toes never meet) + half-folded
  wing-arms (body and solids bound there); `sculptLocal` maps rest -> sculpt. Helper bones
  w_#_sh / hl_#_h. Head lofted from the design table; horns as spline paths.
- DONE kin.js, creature.js (two skeletons share the bones), wing.js, pose.js (helpers, grounding),
  drape.js (stand/sit/lie/crouch drapes), dust.js (take-off dust, clods, scars).
- DONE poses.js (IK): rest, stand (tail hangs in an arc, end on the ground: `tailSag`), walk,
  rear, sit, crouch, lie (+sprawl), pushUp, struggle, fire, flight, glide, dive (legs drawn in,
  feet clenched), strike, sprint, mouthHold, launch, land, blend, contactsOf. Flight/glide: legs
  drawn together under the tail, toes clenched (negative x flexes toes toward the sole).
- DONE rev. 1 after the first full renders (DESIGN 0 lists it): deeper/broader Charcoal skull,
  neck narrower behind the jaws, thicker horn bases, thicker legs on Charcoal and Starlight,
  blunter newborn snout (no hanging lobes: soft heads skip the retroarticular process, masseter
  scaled), shallow nostrils (deep subtractions showed the sky through), eyes seated with more
  eyeball showing (`eyeExpose` 62 adults), dull rough horn keratin per dragon (`hornR`),
  Starlight's membrane ivory with a rose flush against the light.
- DONE rider.js `fitStraddle`: abducts the humans-library rider's thighs until knee/shin/boot
  clear the trunk SDF (+0.1 m), then brings the shin back along the flank; re-applied after every
  rider.update(). (Stirrups still hang where the tack put them.)
- DONE lookdev: creatures-shots.js 13 shots (pair flight is now an air-to-air chase camera),
  creatures-contact.js (5 turntables, lineup with a level camera, 4 glide views = 25 frames).
- Checked: every scene that uses the library (style-f1..f5, humans-riders, architecture-probe)
  renders without errors at draft (stills in scratch). F4's framing now has the bigger newborn
  head filling the left of frame (composition is the style frame's, not changed here).
- Dev loop (scratch, not committed): dragons2/tools/dev.sh <cfg.json> <name> (creatures-dev.js
  views), rv.sh <name> <ids|all> [preset] (shots through a temp scene, deleted after),
  contact.sh <name> (contact sheet), build.mjs (Node build + every pose), headdepth/headprof.mjs
  (SDF head measurements), toes.mjs, bar.mjs.
- DONE final native 4K renders (2026-10-15 ~03:10 UTC, git-ignored): output/dragons-wyvern/hero/4k/<shot>.png
  (13 shots), hero/1920/*.jpg downscales, hero/crops/*.png (1:1 crops), hero/hero-sheet.jpg;
  contact/4k/NN-<name>.png (25 frames), contact/contact-sheet-4k.jpg, contact/crops/*.png. Also after
  the final review: islands dropped in mesher.js (a stray lobe under the newborn's jaw), newborn
  without masseter bulge / lip ridge, keratin tubes capped with a dome at blunt ends (the broken left
  horn read as an open tube), lower horn burrs, Charcoal's horns and membrane a little darker.
- npm test 33/33 pass (180 s, after the last code change).
- NEXT (ideas, not started): stirrups that follow the fitted rider foot; Leaf's sit haunch
  visibility; a real contact solver for the head-in-mouth; uneven-ground IK targets.

## (before the wyvern rework)
## Fix round 1 (session 5, after the critic + Daxtyn's DRAGONS.md decisions) - DONE
- No species: anatomy.js `DESIGNS.charcoal/leaf/starlight/hatchling/scout`, each its own preset
  (Leaf compact: short neck/tail, round deep skull, own horns, L 9.0 m = 25% of Charcoal;
  Starlight: broad heavy chest, long neck/tail, broad flat skull, horn crown, broad-chord
  wings). `CREATURES.<name>.design`; `SPECIES` export renamed `DESIGNS`; titles/comments clean.
- Approved looks (DRAGONS.md): Charcoal black (albedo ~0.012), BLUE iris, GRAY membrane with
  BLACK STRIPES (membraneMaterial `uStripe`), orange-red fire; Leaf dark green, YELLOW iris,
  LIGHT GREEN membrane, purplish-blue fire (fire.js palettes).
- Skin: flat-topped keeled imbricate scale profile per look (`vor`), narrow grooves; irregular
  belly scutes (glsl.js dkPlates) with a per-plate ragged border; smooth finger skin; soft neck
  creases (Starlight: none); limb-root junctions use the 3D mosaic (no chain-row pole fan).
- Wings: span ~1.9 L Charcoal / ~1.8 L Leaf / ~1.9 L broad Starlight / ~1.6 L narrow scout;
  plagiopatagium onto the thigh (bone hl_#_0); fingertip tension wrinkles; fold: wrist low by
  the shoulder, hand back along the flank, fingers a closed fan, the outer 44% of every finger
  doubled back at the knuckle (the long rods past the tail root and the wrist in front of the
  chest are gone; the folded fingers still stick out a little behind the thigh as smooth tubes
  with blunt ends - see Next).
- Starlight reflective (clearcoat 0.7 @ 0.08, crowns ~0.16, facet tilt 1.0, albedo 0.6); shot:
  cool fill from below + haze 3.2; flapHz 0.42.
- Hatchling: gold F0 metallic (0.8/0.42), granular head tier, no lid shells (eye in a soft
  skin socket; lid shells read as gold caps), dark eye with gold flecks + slit pupil, wings on
  the back (root raised, own fold), sprawled weak `lie` pose, straw nest + opened egg (props
  library) + mucus strands (creatures-shots.js updateStrands), near-neutral key + cool fill;
  macro camera low at the side (3/4 profile: snout, jaw, eye) - the high front view had
  foreshortened the head into a dome.
- Charcoal head: irregular crocodilian lip (lipCover 0.3), bigger nostril, heavier brow, horn
  burrs; Remi at Charcoal's depth; tail curled out sideways.
- fire.js (new): sprite jet + smoke + light, pure in t; lookdev shots charcoal-fire, leaf-fire.
  The jet leaves from between the front teeth with a short fade-in (the first 4K pass showed
  the fire starting in the air a head-length in front of the mouth).
- tack.js (new): 1400s saddle (wool cloth, padded seat on a tree, welt, cantle/pommel, girth +
  iron buckle, breast strap, stirrups) and giants' rig (timber frame on felt, seat + backrest,
  wooden grab bar, broad bands with buckles, foot boards); straps ignore the legs.
- Scout wing loss: torn ragged membrane (`uTear`), snapped finger, roll toward the LEFT, drop,
  nose-down, wing flung clear of the body; darker stump.
- Contact sheet: 24 frames (turntables, lineup, 3 spread-wing glide views).
- npm test 33/33 pass (299 s wall, run after the last code change of this round).

## Done (committed)
- Charcoal (Bashion): anatomy rework (heavy musculature, head, horns, tail, dorsal ridge), 3D
  Voronoi scale mosaic with size hierarchy, tubercles, dorsal scutes, belly plates, wear,
  scars, dust, damp; teeth, eyes with lids; flight leg tuck; folded-wing drape.
- Nightwings (Leaf, Starlight) share one species/base anatomy (age allometry only); no chest
  plates (plateZ); Starlight facets (no glow), warm pale underside; membranes with soft vessels.
- Hatchling: newborn proportions, soft low-relief scales, wet clearcoat film, amniotic residue.
- Scout: serpentine Slitherwing, detachable LEFT wing (+ wound), tumble in creatures-shots.js.
- Tack: trunk-skinned saddle (Leaf/scout) and riding rig with grab handle (Charcoal/Starlight).
- Lookdev: creatures-shots.js (hero shot module), creatures-hero/review/contact/lineup/dev,
  creatures-turntable-<name>.js.

## This session (resume after the second interruption)
- Rendered the current state (preview review: output/cr/rv0, 4K review: output/cr/rvF0).
- Membrane camber now SHADES: wing.js computes the rest-space gradient of the billow profile
  (aBGrad) and the membrane vertex shader tilts the normal by it (n' = n - grad h); camber
  scale raised to 0.04 L. Before: panels displaced but lit as flat sheets (cardboard look).
- Hatchling gold: metallic crowns (0.72) / grooves (0.4), roughness ~0.42 (broad sheen), deeper
  24k yellow base colour; residue lowers metalness. Before: ochre/mustard paint look.
- Scout wound: no scale relief inside, dark wet, ragged rim (was a red scaled "raspberry").
- creatures-shots.js: air shots over the FFT ocean (dk/ocean.js) instead of the tiled ground;
  scout shots carry the hooded scout rider; the wing-loss camera tracks the body/wing midpoint
  without the roll; Starlight-below reframed (~300 m away, 150 m up, 32 mm) with a stone
  watchtower (sets/buildings.js kit) for scale.

- Later in the session: Leaf `scaleMul` 0.78 (finer scales, less "cobbled breastplate");
  sit pose hind legs re-angled (thigh along the flank, knee beside the elbow: no ball haunch);
  vessels in the membranes fainter (no drawn lines); Starlight's polish coat thinner/rougher
  (no chrome); Charcoal's dust darker (no pale paws in flight); propatagium narrower;
  mountRider() builds a grab bar at the rider's hands; Leaf flight shot at mid-downstroke;
  scout-bank without the rider (an adult hides the whole small scout), rider kept in the
  wing-loss shot; Starlight shot = ground camera, 40 mm, her at ~270 m beside a 27 m tower at
  the same distance, hedgerows/woods 0.4-2.5 km (sets/scatter.js) - she reads 8 towers wide.

## Session 3 (resume after the usage-limit stop)
- 4K render of the state as committed: `output/cr/s3hero/` (png/, _1920.jpg, crops).
- Leaf/Starlight: smaller scales on the lower flanks/chest/throat (`scl2.y` 0.55) and on the
  limbs (`limbScaleMul` 0.72): the chest no longer reads as cobbled plates/breastplate.
- Membranes: skin folds along every bone, stronger elastin striations, roughness patches,
  subtler micro creases (they read as felt), per-creature sky reflection `memSpec`
  (Charcoal 0.24 + memRough 0.52, Leaf 0.42 + 0.46); Starlight translucency lowered (no
  "glow"), scout translucency less saturated.
- Hatchling: snout shortened (`snoutMul` 0.76 in front of z 0.46; the jaw is now rotated
  rigidly in world space so the lips still meet; oral test undoes the mapping), fuller chin,
  thinner lips, thicker soft lids (lower lid reach 0.74), finer scales (`scaleMul` 0.72),
  softer grooves, wet film roughness 0.1 (no pin-point sparkle), smoother skin noise, residue
  a thin slime (not white flakes), amber claws.
- Charcoal: teeth spaced unevenly, darker stained enamel with a few dark old teeth; dorsal
  spikes rough weathered keratin; riding rig leather darker/rougher (no pale paper bag).
- Charcoal head close-up camera below the eye line (sky behind the head, not the flat field).
- Jaw tip: the chin plates and chain-row scales stop where the jaw turns granular (the rows
  converged at the tip and drew a swirl of stripes, seen in the 4K head close-up).
- README updated (scale grading, membranes, hatchling head, teeth, limits).
- After the 4K pass (`output/cr/s3final`, `output/cr/s3contact`): Charcoal's membrane darker
  (albedo 0.014) with a dimmer direct sheen (`memSpecD` 0.45; it read as a grey tarp), Leaf's
  membrane rougher (0.56, `memSpecD` 0.75: no satin streak), eyelid margins skin-toned, seat
  leather rougher/darker (grazing sky sheen made it pale), hatchling lids thin and inside the
  socket (thick shells stood off the domed head like coins: `lid.span` option), hatchling
  chin set back under the snout (`headShape.jawEnd` 0.84; the jaw tip poked out as a flap).
- Final 4K re-render of all hero shots + contact sheet: `output/cr/s4final` (png/<shot>.png,
  <shot>_1920.jpg, crop_*.png), `output/cr/s4contact` (png/fNN.png, contact_sheet.jpg,
  lineup_1920.jpg). 9 hero frames took 42 min (load ~10 from other agents), 21 contact frames
  13 min. npm test: 33/33 pass.
- `creatures-tmpreview.js` removed from git (rv2.sh writes it again when needed).

## Dev loop
`scratchpad/cr/rv2.sh <name> <shot ids|all> [preset] [cinematic]` renders chosen hero shots
through a temporary scene `scenes/lookdev/creatures-tmpreview.js` (delete it before commit).
`scratchpad/cr/dev.sh <cfg.json> <name> preview` renders free views via creatures-dev.json.

## Renders (git-ignored, under dragons-kingdom/output/cr/; older ones deleted for disk)
- `s5final/`: the eleven hero shots of fix round 1 at native 4K with the film finish -
  `png/<shot>.png`, `<shot>_1920.jpg`, `crop_*.png` (1:1 crops). This is the current state.
  Shots: charcoal-front, charcoal-head, charcoal-flight, leaf-abby, leaf-flight,
  starlight-below, charcoal-fire, leaf-fire, hatchling-macro, scout-bank, scout-wingloss.
  (All from the current code: the three Charcoal shots were re-rendered in a 6-shot pass, the
  two fire shots after the fire-origin fix and the hatchling after its camera change.)
- `s5contact/`: the 24-frame contact sheet at 4K under the neutral daylight HDRI -
  `png/fNN.png`, `contact_sheet.jpg` (3840 wide), `contact_sheet_1920.jpg`, `lineup_1920.jpg`
  (frame 21, scale lineup), `glide_f22/23/24_1920.jpg` (Charcoal / Leaf / Starlight spread).
- `s4final/`, `s4contact/`: the state before fix round 1, for comparison.

## Next (open)
- folded wing seen from the side: the doubled-back fingers still read as parallel smooth tubes
  with bare knuckle ends, and the pleated membrane between them can moire at 4K
- Charcoal's neck scales still read a little like pavers (flat crowns, even grout)
- Leaf's head is cute rather than fierce in close-up (round skull + big eye); a harder brow /
  cheek would help if Daxtyn wants her older-looking
- Starlight: approved look not yet given; she reads silvery / porcelain at close range.
  Her size (50.6 m, bigger than Charcoal) is an open question in DRAGONS.md
- hatchling: still partly reads as a gold casting at macro distance; the wing arm shows as a
  small rod on the back; the closed mouth is a long crease (a sculpted lip fold would help)
- tack: straps sit on the hide without compressing it; no stitching normal detail
- humans domain: a narrower/prone straddle for the scout rider; the watchman's head
- runtime: 8-subframe ghosting on fast wing beats; SSAO on clearcoat; fire sprites carry no
  velocity for motion blur (see the report)
