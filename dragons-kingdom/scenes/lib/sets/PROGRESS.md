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

Next
- F3 flight line (inland camera, travel screen L->R, right sides, Charcoal level, shadow on water).
- F5 Cling square with `architecture/cling.js` + crowd kit + watchman + immense Starlight.
- F4 chamber with `architecture/interiors.js` + Alexandria's hands + cloth + daylight shaft.
- F1 ship/sail + sun hidden in sea cloud.
- Contact-sheet lookdev for the sets library; final 4K renders; previews; README/PROGRESS.
