# Style frames F1-F5 (Episode 1) - progress log for a successor

Owned paths: `scenes/lookdev/style-*.js`, `scenes/lookdev/finish.js`, `scenes/lib/sets/`,
`episodes/s01e01/style-frames/`. Renders go to `output/lookdev/style-frames/` (git-ignored);
scratch renders to the session scratchpad `sf/`.

## Round 4 (2026-10-15): F2-F5 with the two-legged, horned dragons (DRAGONS.md 2026-10-14)

State: DONE - all four re-staged, rendered at native 4K, looked at (1920 + 1:1 crops), previews
overwritten. F1 has no dragon on screen (a shadow in the mist) and was not touched.

What changed per frame (each scene's header says why):
- F2: Charcoal in his design's sphinx lie (poses.lie: belly down, hind legs folded under, folded
  wings along the flanks, forearms on the grass) with the head resting on its chin; turned ~40 deg
  toward the lens (cdir) so the face reads 3/4 (mouth line, nostril, blue eye) and the folded wing's
  drape - a pale grey sheet on the grass between elbow and thigh - is mostly hidden behind the
  forearm. Remi on the access rig: at the gangway's foot on Charcoal's back, right hand taking the
  mounting strap looped on the riding rig's grab bar (tack.js geometry: bar 0.55 m ahead of the
  seat point, 0.23 m up), left hand on the gangway rail (`onGangway(u, x)` gives the walking
  surface from accessRig's own numbers). Exposure 2.0 -> 1.6 (the black hide read slate grey).
  Leaf's dog sit (poses.sit, wings folded) and Abby at his chest unchanged. Hero meshes only at
  --preset final (standard below, for quick looks). Debug views (all frozen at t = 2, one job:
  --preset draft --fps 1 --start 100 --seconds 9): 100 frame, 101 Leaf+Abby, 102 Remi, 103 rig,
  104 Charcoal's near side, 105 his head, 106-108 drape look-dev (crouch/stand drapes on the lie
  break the membrane; the default 'lie' drape is the best of them).
- F3: Charcoal coasts level with Leaf on spread wings (poses.glide) - nothing of his 30 m
  half-span smears across the 180-degree shutter; Leaf flaps at mid-downstroke (late downstroke
  hung his near wing below him like a sail); stroke variants at --time 100..104. Camera ship
  120 m up ~20 m off the cliffs, 55 mm, framing Charcoal upper right, Leaf lower left, Charcoal's
  shadow on the shallows lower right. Exposure 2.05 -> 1.1 (exposed for the sunlit grey membrane as
  for a grey card; at +2 EV it read white), lift -0.07 -> -0.045. The saddles' own hanging stirrups
  are hidden under the mounted riders (rider.js puts stirrups under their boots).
- F4: the wyvern newborn in poses.pushUp (k 0.3: weak, chest a little up), 3/4 profile head to
  screen left (FWD), camera from the head/hands midpoint (CAMS: 100 frame, 103/104 alternatives,
  105 close on the hands; 101 overview). Alexandria's forearms come in from the right along the
  newborn's near side, hands low on the bedding under the chest (shoulders placed for reach), the
  folded cloth draped over both hands. The linen height is now a 1 cm grid rasterised from the
  cloth bake (bilinear; the nearest-vertex lookup stepped), the cloth grid is 128 x 96 and relaxes
  to its borders (held at the bed they stood up as walls), its creases fade in smoothly where it
  lifts (a hard 4 mm switch drew a jagged contour), and it ends a few cm past her outer hands (a
  heightfield cannot hang: a long drop off a hand stretched the weave into bands).
- F5: Starlight closer (z -150, y 29: ~195 m) - her ~137 m span is wider on screen than the north
  row; hero mesh only at final.

Look-dev loop (scratch, not committed): sf/rs.sh <F2..F5> <name> [time] [preset] none (one still),
sf/rj.sh <F#> <name> <start> <count> [preset] (one job, one setup, frames -> PNG),
sf/lum.py (display-luminance percentiles of regions).

Measurements (native 4K, --preset final, the 8-sub-frame film finish, one --still per frame via
make.sh, this machine: 4 vCPU, SwiftShader, no other renders running unless noted):

| frame | render (s) | total incl. build (s) | notes |
|---|---:|---:|---|
| F2 riding grounds | 434.7 | 541.1 | Charcoal + Leaf hero meshes, 3 cast builds, stable/lodge/rig, 77k grass tufts (an earlier pass with draft jobs running beside it: 576.3 / 690.1) |
| F3 flight | 131.0 | 235.4 | two hero creatures, riders, FFT ocean (with a draft job beside it: 236.2 / 343.0) |
| F4 birthing chamber | 461.8 | 562.4 | hero newborn (the densest mesh), chamber, Alexandria, 96-tap DOF, dust volumetrics (with jobs beside it: 897.3 / 1010.7) |
| F5 Cling square | 821.5 | 923.4 | ~23 M tris town, ~40 cast builds, Starlight hero + rider (an F2 job ran beside it part of the time) |

Review images (git-ignored): output/lookdev/style-frames/review-r4/ (1920 downscales + 1:1 4K
crops: Charcoal's head, Remi at the rig, Leaf+Abby, the folded wing, Charcoal+Remi in flight,
Leaf+Abby in flight, Starlight, the watchman; F4 head and hands).

Open issues seen in the round-4 finals (all PROVISIONAL):
- F2: between Charcoal's forearm and thigh the folded wing's drape shows as a smooth pale-grey sheet
  lying on the grass (creatures domain: drape.js 'lie'; the crouch/stand drapes are worse on a lying
  body, see views 106-108). The riding rig's seat and grab bar read a little like furniture from 75 m.
  Leaf and Abby are small at the far stable door (as in round 3).
- F3: the membranes in flight have no visible veins from 250 m; Leaf's wings blur a little in his
  mid-downstroke (true motion blur, no ghost copies).
- F4: the folded cloth is a heightfield drape (it cannot hang or fold over itself): its edge is a
  little wavy where it leaves her fingers; her sleeves are boxy (humans domain); the newborn's gold
  can read as a casting (creatures domain, noted there). Next: a bpy cloth bake of the cloth over
  her posed hands (one bake per shot).
- F5: Starlight from below-front at ~195 m reads clearly as a two-legged horned white wyvern but her
  folded-up feet and hands are small dark claws against the bright sky; the crowd figures are small
  (as in round 3).

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
  children by the fountain; watchman at the west edge (moved to x -8.2, z 15.2 in pass 2) pointing by limbIK at
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
