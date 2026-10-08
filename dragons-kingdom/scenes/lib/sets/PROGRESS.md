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

Next
- Final 4K renders running (see the measurements section when filled), review 1920 + 1:1 crops,
  fix, re-render, previews, npm test.
