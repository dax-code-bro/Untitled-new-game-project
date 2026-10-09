# Style frames F1-F5 (Episode 1) - progress log for a successor

Owned paths: `scenes/lookdev/style-*.js`, `scenes/lookdev/finish.js`, `scenes/lib/sets/`,
`episodes/s01e01/style-frames/`. Renders go to `output/lookdev/style-frames/` (git-ignored);
scratch renders to the session scratchpad `sf/`.

## Session 5 (2026-10-08, from ~20:40 UTC): re-render F1-F5 with the new domain models

Goal: the five style frames built from the NEW models (creatures, humans cast builds,
architecture kit) and the frame critic's findings fixed (see the task list below).

Done so far
- `sets/cast.js` (new): pose helpers for the humans library's cast builds - `limbIK` (two-bone
  IK from the current pose, world-space shortest-arc), `lookAtPoint`, `rotateBone`, `bonePos`.
- `sets/props.js` (new): `strapRibbon` (flat leather strap along a curve), market food
  (`foodMaterials`, `goods(kind)`: bread, rolls, apples, onions, veg, cheese, fish in baskets/boards).
- F2 rebuilt: architecture `stable` + `keeperHouse` + `accessRig` (on Charcoal's FAR side, the
  gangway's bolster set on his back by a ray cast onto the posed body), humans `remi` (right
  hand IK onto a hanging mounting strap), `abby` (both hands on Leaf's breast strap), `keeper1`
  (far-left edge). Sun moved to screen right (az 89 deg from the lens axis, 48 deg up): side
  light on Charcoal's back and upper flank - the hide reads as textured black scales, not a
  silhouette. Coastline moved seaward (the yard had sat on the shore slope). Exposure +1 stop.
  Debug cameras: `--time 101` (Leaf/Abby), `102` (Remi), `103` (rig).

- F3 restaged on the flight line: camera ship ~40 m off the cliffs, 150 m up, on the inland side,
  travel +z = screen left -> right (their RIGHT sides), Leaf near/left a length behind, Charcoal
  far/right drawn level; sun over the sea behind them (az from SUN_H), Charcoal's shadow on the
  shallow sandy bay. Wing phases via atCycle() so each creature is at a chosen point of its stroke
  at t = 2. Riders from the humans cast (createRider of lib/humans).
- F5 rebuilt on `architecture/cling.js` clingSquare (CLING map): crane camera 13 m up behind the
  king's steps (18 mm), arch at the left edge, gate at the right, fountain centre; south rows struck
  ('wild wall', dropTriangles with ANY vertex past the cut); 5 marketStall()s with food, bunting,
  banners on the north row; musicians, vendor, parent+child (joinHands), ~30 crowd builds,
  children by the fountain; watchman at the west edge (x -15.2, z 9.5) pointing by limbIK at
  Starlight's head; Starlight (hero) ~170 m beyond the north row, 44 m up, nearly head-on; farmland
  hills with hedgerows/copses (scatter) and a field patchwork (heightfield colour).
- F4 rebuilt in `architecture/interiors.js` birthingChamber (baked nest linen; NEST_C = [-0.6,0,0.3]):
  camera looking north along the bed; the sun through the east window lands on the bedding behind
  the hatchling; the hatchling is lifted onto the baked linen (linenY lookup); Alexandria
  (cast build) kneels at screen right, placed by her shoulders, right hand under the folded
  linen pad (palm up), left hand steadying it; relaxHand opens her build's clasped hands.
- F1: the sun is hidden in a dense sea-cloud bank (two mist banks over it), softer sun (2.2),
  grade 3700 K / exposure -1.35 (whites ~90%, blacks ~4%); sail with clew tension creases,
  robands, leech shake, seams; ship laden 0.32 m lower; crew = humans cast builds.
- `style-contact.js`: contact sheet of the sets library's own models.
- make.sh: 4K PNGs + logs to output/lookdev/style-frames/, previews into episodes/.../style-frames/.

- After the first 4K pass (all five reviewed at 1920 + 1:1 crops): F2 +0.25 stop and a dark
  stable interior; F3 less aerial haze, contrast 1.2 and a display lift of -0.07 (blacks were 15%);
  F4 the cloth is DRAPED every frame over one smooth pad per hand (drapeCloth: a heightfield over
  the bed + hand pads, relaxed), wrists/thumbs show at its edge, T5.6, no fluid strings (they read
  as white strings); F5 only calm crowd builds (cheer/call/gesture builds raise an arm and stole the
  watchman's point), watchman moved into the sun at the left foreground, Starlight farther (z -235)
  and lower over the hills, volumetric haze 0.0006.

## Measurements (native 4K, --preset final, 8-sub-frame film finish, one --still each, machine
## shared with other agents, load average 3-7)

| frame | render (s) | total (s) | notes |
|---|---:|---:|---|
| F1 prologue | 47.8 | 67.9 | FFT ocean, fog banks, the knarr, 3 cast-build crew (too small to read at 120 m) (pass 1, old crew: 43.5 / 61.6) |
| F2 riding grounds | 360.8 | 436.5 | Charcoal + Leaf hero meshes, 3 cast builds, stable/lodge/rig, 77k grass tufts (pass 1: 369.5 / 448.3) |
| F3 flight | 103.0 | 147.3 | two creatures (standard), riders, ocean (pass 1: 103.2 / 148.2) |
| F4 birthing chamber | 302.0 | 363.2 | hatchling hero, chamber + baked linen, Alexandria (hero cast), 96-tap DOF, dust volumetrics (pass 1: 428.2 / 490.3) |
| F5 Cling square | 544.7 | 609.7 | Cling square ~23 M tris, Starlight hero + rider, ~40 cast builds, 5 stalls, hedgerows (pass 1: 695.3 / 762.7) |
| sets contact sheet (6 shots, --fps 1) | | 188 | style-contact.js, 4 sub-frames |

Outputs: output/lookdev/style-frames/*.png (4K, + _PROVISIONAL), review/ (1920 + 1:1 crops),
output/lookdev/style-contact/ (contact sheet). Previews: episodes/s01e01/style-frames/*_preview.jpg.

## Open issues (seen in the finals)
- F4: the cloth is a heightfield drape (not a cloth sim): it reads as a folded linen cloth over her
  hands, but its edges are clean cut and it lies over the hatchling's back rather than wrapping it.
- F4: the "cool daylight shaft" reads as cool light on the bedding behind the hatchling and a cool
  haze; it is not a crisp visible beam at this angle.
- F5: the farmland is smooth rolling hills with blob trees (scatter clumps) - CG at 1:1; people read
  as small mannequin-like figures from 45 m; musicians are too small to identify their instruments.
- F2: the stable door interior is still a flat dim brown; Charcoal's scales read as uniform beads
  (creature domain); the rig's posts-and-chains silhouette (architecture domain).
- F3: membranes in motion read as flat grey sheets; the shallows are a strong turquoise.
- F1: the crew are too small to read; the ship hull is plain.

npm test: 33/33 pass (174 s) after the final renders.

Next (for a successor)
- F4: a real bpy cloth bake of the folded linen over Alexandria's hands (her hand pose is fixed per
  frame, so one bake per shot) instead of the heightfield drape.
- F5: closer second angle (3B-07: watchman, captain, king at medium size) so the cast faces read.
- Replace the scatter-blob trees with the nature domain's trees when it delivers them.
