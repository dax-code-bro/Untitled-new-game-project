/* ============================================================
   COASTLINE — the second map.

   Built from five photographs of the real place rather than from an
   idea of a lake: a wide mown green running down to a concrete seawall,
   a boat ramp cut into it, a long pier out over the water with an open
   pavilion and a closed boathouse on the end of it, a covered slip with
   a boat on a lift, brick ranch houses set back on the grass, a carport
   with a boat on a trailer under it, and a flat far shore a mile off
   with dead pilings breaking the surface in front of it.

   What the photographs decide, and what this file therefore does not get
   to invent:

     - It is DUSK, and overcast. The sky is a flat grey-blue with one
       hard band of orange along the horizon, and the water goes from a
       pale orange where it catches that band to near-black in the
       foreground. Not a blue-sky lake.
     - The ground is flat. Properly flat -- a mown, irrigated, levelled
       green, not rolling terrain.
     - The far shore is a LOW line. No hills, no headland. It reads as
       distance because it is thin and pale, not because it is big.
     - Everything built out over the water stands on thin steel pilings,
       not on piers of masonry.

   Exposed here as window.COASTLINE so the game can pick it up without
   this file having to know anything about the game.
   ============================================================ */
(function () {
'use strict';

/* Where things are. Metres, +Z toward the water, the seawall at z = 0 so
   that "how far out over the lake" and "how far up the lawn" are both
   just z with a sign. */
const C = {
  /* The green. Big: the photographs are of an open lawn you could land a
     plane on, and a map whose middle is a field only works if the field
     is genuinely too far to cross without thinking about it. */
  green: { x0: -46, x1: 46, z0: -58, z1: 0 },
  seawall: { z: 0, capY: 1.15, x0: -46, x1: 46, thick: 0.55 },
  water: { y: 0.35 },
  ramp: { x0: -3.2, x1: 3.4 },                 // the gap cut in the wall
  pier: { x: 15.0, z1: 34.0, deckY: 1.25, halfW: 1.35 },
  pavilion: { z: 22.0, half: 3.0, eaves: 3.3, peak: 5.1 },
  boathouse: { z: 31.5, half: 3.6, eaves: 3.2, peak: 4.6 },
  slip: { x: -26.0, z: 13.0, halfX: 4.4, halfZ: 5.6, eaves: 3.5, peak: 5.0 },
  ranch: { x: -24, z: -22, w: 19, d: 11.5, wall: 3.0 },
  twoStorey: { x: 18, z: -26, w: 16, d: 12, wall: 6.2 },
  carport: { x: -41, z: -13, w: 8.5, d: 6.5, h: 3.1 },
  /* THE STREET, and the two houses on the far side of it.
   *
   * The green ran from the seawall to a fence and that was the whole
   * map: two houses standing on a lawn with nothing behind them, which
   * reads as a diorama rather than as somewhere people live. A road puts
   * the place in a neighbourhood -- it gives the houses a front and a
   * back, it gives the cars somewhere to have been abandoned, and it
   * gives the map a second axis to fight along that is not "toward the
   * water" or "away from it".
   *
   * It sits between the existing houses and the back fence, which is a
   * fourteen-metre gap: six of carriageway, a kerb and a verge each
   * side, and the new houses set back on the far pavement. */
  street: { z: -43.0, half: 3.1, x0: -47, x1: 47, kerb: 0.14 },
  cottage: { x: -7, z: -52.5, w: 13, d: 9.5, wall: 3.0 },
  gable: { x: 30, z: -52.0, w: 14, d: 10, wall: 3.4 },
  farShore: 150,
};

/* Dusk on an overcast lake. Every one of these comes off the first
   photograph rather than off a palette: the sky is not blue, the horizon
   band is narrow and orange, and the ground bounce is grass rather than
   mud. */
const SKY = {
  zenith: 0x6d7a88, horizon: 0xd99a63, ground: 0x7e8372,
  /* The sun is NOT straight out over the water, even though that is where
     the first photograph has it.

     Built that way first, and the whole map was a silhouette: the
     direction you spend the round looking is down the lawn at the lake,
     so a sun on that axis is always behind everything, and every house,
     tree and piling rendered as a black cut-out against a bright band.
     A photograph can be backlit because it is one frame. A map cannot.
     So it keeps the height -- low, late, warm -- and moves well round to
     the west so that looking at the water puts it over your left
     shoulder and everything vertical takes a raking light down one side.
     The sunset is still there; you have to turn your head for it. */
  sun: [-0.58, 0.34, 0.74],
  sunColor: 0xffc890, sunIntensity: 1.70, intensity: 1.55,
  exposure: 1.06, clouds: 0.82,
  /* The reflection environment. Outdoors at dusk under cloud there is no
     bright sky to mirror, so metal -- and there is a lot of thin steel
     out here -- needs a floor or every piling goes black, which is the
     fault that had the Thompson's magazine rendering as a hole. */
  room: 0x6a6f74,
  /* Haze off the water. Thin -- thinner than it first was, because at
     0.0062 the whole middle distance came out the one orange value and
     the lawn, the far bank and the sky were indistinguishable. Grey
     rather than warm for the same reason: a warm fog at dusk tints
     everything it touches toward the horizon band and the map loses what
     colour it has. */
  fog: 0x93908c, fogDensity: 0.0040,
};

/* ---------------- surfaces ----------------

   A colour here MULTIPLIES the procedural recipe for its texture, and
   the recipes are not neutral. Three separate colour faults in this file
   came out of guessing at that -- a lawn at two per cent reflectance, a
   fire-engine brick wall, a pine with a black underside -- so the bank
   was baked and averaged instead. What a WHITE material becomes on each
   recipe, measured off TextureLib.generate():

       concrete #bebbb3      brick    #80493b      wood   #d0c0ac
       metal    #a3a5aa      rust     #a99388      rock   #7d7a73
       grass    #265718      dirt     #d0cbc3      sand   #bab3a6
       fabric   #e0e2e7      smooth   #ffffff      tile   #a8acaf

   So `grass` already IS a dark green -- which is why the engine's own
   grass preset is authored at pure white -- and `brick` already IS a
   strong red. Asking for a reasonable lawn green on top of the first
   gave a black field; asking for a brick red on top of the second gave a
   fire engine. Anything on a recipe that carries its own colour is
   tinted from white here and only nudged, and where the recipe pulls a
   surface off its mark the tint corrects in the opposite direction --
   the brick tint is faintly cool because the recipe is so warm.

   Only `smooth`, and to a lesser degree `concrete` and `dirt`, are near
   enough to neutral that the hex is roughly the colour you will see. */
const MAT = {
  /* Dialled back from 0xe9efcc, which over-corrected: the lawn came out
     a lit golf course under a sunset sky, brighter than the concrete it
     runs up to and brighter than anything in the photographs. */
  grass: { color: 0xc4d4b0, texture: 'grass', roughness: 0.97, metalness: 0, uvScale: 1, subsurface: 0.3 },
  grassWorn: { color: 0xd8d2b0, texture: 'grass', roughness: 0.98, metalness: 0, uvScale: 3 },
  /* Poured concrete, weathered. The walk, the ramp and the seawall cap
     are all the same pour and read as one thing in the photographs. */
  concrete: { color: 0xbdb9b0, texture: 'concrete', roughness: 0.93, metalness: 0, uvScale: 4, normalStrength: 0.4 },
  concreteWet: { color: 0x8e8c86, texture: 'concrete', roughness: 0.72, metalness: 0, uvScale: 4 },
  /* The seawall's face is weathered timber behind the concrete cap, and
     it is the one place on the map with real rust on it. */
  wallTimber: { color: 0xa78c6c, texture: 'wood', roughness: 0.94, metalness: 0, uvScale: 5 },
  rust: { color: 0xd8a878, texture: 'rust', roughness: 0.86, metalness: 0.3 },
  /* Thin galvanised pilings and handrail. Pale, rough, and a real
     reflectance -- these are conductors and a dark hex would put them in
     the same hole the gun metals were in. */
  galv: { color: 0xd4dade, texture: 'metal', roughness: 0.52, metalness: 1 },
  steelDark: { color: 0xa8b0b6, texture: 'metal', roughness: 0.58, metalness: 1 },
  /* PAINTED iron -- the benches, the outboard, the trailer. metalness 0,
     because paint is a dielectric: at 1 these have no diffuse at all and
     read as dark grey-blue cut-outs lit by nothing but the reflection
     probe, which is what made a park bench look like a hole. */
  ironPaint: { color: 0x5f6a63, texture: 'metal', roughness: 0.72, metalness: 0 },
  /* A PALE CYAN, to make a red wall. This looks like a mistake and is
     not, and it is worth the arithmetic because guessing at it produced a
     fire engine twice.

     The brick recipe decodes to about (0.216, 0.065, 0.045) linear: its
     green is 30 per cent of its red and its blue 21 per cent. Real brick
     is nearer 50 and 39. So the recipe is not merely red, it is about
     1.7x too red in green and 1.9x in blue, and no warm tint can fix
     that -- a tint can only take light away. The correction has to hold
     red DOWN relative to the other two, which is a cyan. 0xc2f5ff lands
     the wall at (0.117, 0.059, 0.045): a brick red with brick's own
     ratios rather than a traffic light.

     uvScale 22, not 2.6. It is tiles per FACE, the recipe lays 8 courses
     to a tile, and the ranch's front is nineteen metres: at 2.6 that is a
     course nearly a metre tall, which is what made the walls read as
     painted blocks. At 22 a course is about eleven centimetres. */
  brick: { color: 0xc2f5ff, texture: 'brick', roughness: 0.93, metalness: 0, uvScale: 22 },
  brickPale: { color: 0xa6f9ff, texture: 'brick', roughness: 0.93, metalness: 0, uvScale: 22 },
  shingle: { color: 0x6f6158, texture: 'concrete', roughness: 0.95, metalness: 0, uvScale: 6 },
  /* The pavilion roof is the one strong colour on the whole map. */
  roofOrange: { color: 0xd07a42, texture: 'concrete', roughness: 0.9, metalness: 0, uvScale: 5 },
  roofBrown: { color: 0x8a6b4e, texture: 'wood', roughness: 0.9, metalness: 0, uvScale: 4 },
  /* Deck boards.
  
     uvScale is tiles per FACE, so it has to be chosen against the SIZE of
     the thing wearing it, and one number cannot serve a two-metre plank
     and a sixty-eight-metre pier. It was set to 5, then lowered to 1.3 on
     a bad reading of the pier -- exactly the mistake the brick made, in
     the same direction: what looked like crowded grain was one tile
     stretched the length of the walkway.
  
     8 suits the short runs: walkways, floors, stairs, the balcony. The
     pier has its own below, because it is an order of magnitude longer
     than any of them. */
  deck: { color: 0xa08464, texture: 'wood', roughness: 0.9, metalness: 0, uvScale: 8 },
  /* The pier itself: sixty-eight metres of it in one slab, so it needs a
     tile count to match or the boards are a metre wide. */
  deckLong: { color: 0xa08464, texture: 'wood', roughness: 0.9, metalness: 0, uvScale: 46 },
  /* Weathered white paint, not fresh white. On the smooth recipe, which
     is neutral, 0xdcd8cc is 72 per cent reflectance -- brighter than
     anything outdoors at dusk -- and it is on every post, rail, door and
     roof out here, so the slip and the pier came out as one pale mass
     with the sky. */
  white: { color: 0xb4b0a4, texture: 'smooth', roughness: 0.8, metalness: 0 },
  /* Painted metal roofing: pale, but a coat of paint rather than a
     mirror, so it takes a colour instead of the sky. */
  roofMetal: { color: 0x9fa39c, texture: 'metal', roughness: 0.62, metalness: 0 },
  canvas: { color: 0xbcb49e, texture: 'fabric', roughness: 0.96, metalness: 0, uvScale: 3 },
  glass: { color: 0x2e3a42, texture: 'smooth', roughness: 0.18, metalness: 0 },
  /* ---- the street, the cars and what is inside the houses ----

     Asphalt is `concrete` tinted well down and roughened: the bank has
     no tarmac recipe and a road wants the same aggregate that concrete
     has, only darker and with no float marks in it. Tinted to about a
     third, since the recipe already averages #bebbb3 and asphalt is not
     a light grey surface. */
  asphalt: { color: 0x4a4b4d, texture: 'concrete', roughness: 0.96, metalness: 0, uvScale: 14 },
  roadLine: { color: 0xd8cda0, texture: 'smooth', roughness: 0.92, metalness: 0 },
  kerb: { color: 0xcac6bd, texture: 'concrete', roughness: 0.9, metalness: 0, uvScale: 8 },
  /* Car paint. Clear-coat over colour: high metalness reads as a mirror
     and reflects the room floor, which under an overcast sky is exactly
     what a car roof does. Each body colour is its own material so the
     row on the kerb is not four of the same car. */
  carRed: { color: 0x7d2a22, texture: 'smooth', roughness: 0.30, metalness: 0.55 },
  carBlue: { color: 0x263c56, texture: 'smooth', roughness: 0.30, metalness: 0.55 },
  carCream: { color: 0xb5ac96, texture: 'smooth', roughness: 0.36, metalness: 0.45 },
  carGreen: { color: 0x35452f, texture: 'smooth', roughness: 0.33, metalness: 0.5 },
  carRust: { color: 0xb89272, texture: 'rust', roughness: 0.92, metalness: 0.3, uvScale: 3 },
  tyre: { color: 0x1d1f22, texture: 'smooth', roughness: 0.95, metalness: 0 },
  chrome: { color: 0xd8dee4, texture: 'metal', roughness: 0.22, metalness: 1 },
  carGlass: { color: 0x39454c, texture: 'smooth', roughness: 0.14, metalness: 0, opacity: 0.55 },
  /* Inside. Plaster is near-white on `concrete` at a fine scale, because
     an interior wall is the one surface in this map with no colour of
     its own and everything else in the room is read against it. */
  plaster: { color: 0xe2ddd2, texture: 'concrete', roughness: 0.95, metalness: 0, uvScale: 6, normalStrength: 0.3 },
  floorBoard: { color: 0xb59672, texture: 'wood', roughness: 0.82, metalness: 0, uvScale: 14 },
  carpet: { color: 0x8e8272, texture: 'fabric', roughness: 0.99, metalness: 0, uvScale: 10 },
  sofa: { color: 0x6f7a6a, texture: 'fabric', roughness: 0.97, metalness: 0, uvScale: 4 },
  counter: { color: 0x8d8a82, texture: 'smooth', roughness: 0.45, metalness: 0.1 },
  cabinet: { color: 0xa8825c, texture: 'wood', roughness: 0.78, metalness: 0, uvScale: 4 },
  mattress: { color: 0xd6d2c6, texture: 'fabric', roughness: 0.98, metalness: 0, uvScale: 5 },
  appliance: { color: 0xc8ccce, texture: 'metal', roughness: 0.42, metalness: 0.9 },
  doorWood: { color: 0x9a7346, texture: 'wood', roughness: 0.86, metalness: 0, uvScale: 3 },
  trunk: { color: 0x9c8570, texture: 'wood', roughness: 0.96, metalness: 0, uvScale: 3 },
  /* Foliage, on the grass recipe, so the same white-tint rule applies.
     Kept a step under the lawn rather than a quarter of it: a canopy in
     shadow is darker than a mown green, it is not a hole in the sky. */
  leaf: { color: 0xc6d8a4, texture: 'grass', roughness: 0.95, metalness: 0, uvScale: 2, subsurface: 0.35 },
  leafPine: { color: 0xb8cfa8, texture: 'grass', roughness: 0.95, metalness: 0, uvScale: 2, subsurface: 0.3 },
  mulch: { color: 0x8a6b4c, texture: 'dirt', roughness: 0.97, metalness: 0, uvScale: 2 },
  barrel: { color: 0x9a6f44, texture: 'wood', roughness: 0.88, metalness: 0, uvScale: 3 },
  /* The water. It is not blue and it is not transparent: in every one of
     the photographs it is a flat green-grey that takes the sky's orange
     as a sheen on the ripples and goes almost black away from it. Built
     as a wide low slab rather than as fluid -- this is a lake, not a
     simulation, and the fluid solver would cost the whole frame.

     Deliberately the darkest thing on the map. It has to be: the horizon
     band behind it is the brightest, and if the water comes anywhere near
     it there is no waterline at all and the lake reads as more sky. */
  water: { color: 0x223028, texture: 'smooth', roughness: 0.34, metalness: 0, castShadow: false },
  /* The far half of the lake, flatter still, so the sheet does not read
     as one uniform value all the way to the bank. */
  waterFar: { color: 0x293430, texture: 'smooth', roughness: 0.44, metalness: 0, castShadow: false },
  /* The treeline on the far bank. Pale and low-contrast on purpose: at a
     hundred and fifty metres through haze, a saturated green reads as a
     hedge thirty metres away, which collapses the whole distance. */
  /* castShadow is a MATERIAL flag in this engine, not a per-actor one,
     which is convenient here: everything past the far bank is scenery at
     a hundred and fifty metres and can never cast a shadow anybody sees,
     but each of the hundred and twenty far trees and forty-six dead
     pilings was being drawn a second time into the shadow map every
     frame. So is the lake, which is flat and lit from above and casts
     nothing on anything. */
  farTree: { color: 0x8e9c86, texture: 'grass', roughness: 0.98, metalness: 0, uvScale: 4, castShadow: false },
  // The dead pilings out in the water: the same weathered wood as a trunk,
  // but far enough out to be scenery rather than a shadow caster.
  pilingDead: { color: 0x9c8570, texture: 'wood', roughness: 0.96, metalness: 0, uvScale: 3, castShadow: false },
  /* Chain-link mesh: mostly holes, so it is drawn as a dim grey rather
     than as a wall, but it is SOLID. The fence was decoration and you
     walked through all of it. */
  fenceMesh: { color: 0x6f7377, texture: 'metal', roughness: 0.8, metalness: 0, opacity: 0.55 },
  // The lake bed: silt and weed, seen through water and never close up.
  bed: { color: 0x53563f, texture: 'dirt', roughness: 0.99, metalness: 0, uvScale: 8, castShadow: false },
  // The wood behind the boundary fence: darker than the lawn trees.
  leafWood: { color: 0x93ab7c, texture: 'grass', roughness: 0.97, metalness: 0, uvScale: 3 },
  /* The flamingo. A pool toy that has been in the water too long: the
     pink has gone slightly wrong, and it is glossy the way vinyl is
     rather than the way anything alive is. */
  flamingo: { color: 0xff9ec4, texture: 'smooth', roughness: 0.28, metalness: 0, subsurface: 0.4 },
  papBeak: { color: 0x2a2226, texture: 'smooth', roughness: 0.35, metalness: 0 },
  papEye: { color: 0xfff4d8, texture: 'smooth', roughness: 0.2, metalness: 0,
    emissive: 0xffd070, emissiveStrength: 1.6 },
  shore: { color: 0x8e9086, texture: 'concrete', roughness: 0.98, metalness: 0, uvScale: 20, castShadow: false },
};

/* Rooms, for whatever wants to ask which part of the map something is
   in. The green is the arena; the pier is the long dead end; the two
   houses are the interiors. */
const MAP = {
  green: { x0: C.green.x0, x1: C.green.x1, z0: C.green.z0, z1: 0, y0: 0, y1: 24 },
  pier: { x0: C.pier.x - 6, x1: C.pier.x + 6, z0: 0, z1: C.pier.z1 + 4, y0: 0, y1: 8 },
  slip: { x0: C.slip.x - 6, x1: C.slip.x + 6, z0: C.slip.z - 7, z1: C.slip.z + 7, y0: 0, y1: 8 },
  ranch: { x0: C.ranch.x - C.ranch.w / 2, x1: C.ranch.x + C.ranch.w / 2,
    z0: C.ranch.z - C.ranch.d / 2, z1: C.ranch.z + C.ranch.d / 2, y0: 0, y1: 4 },
  house: { x0: C.twoStorey.x - C.twoStorey.w / 2, x1: C.twoStorey.x + C.twoStorey.w / 2,
    z0: C.twoStorey.z - C.twoStorey.d / 2, z1: C.twoStorey.z + C.twoStorey.d / 2, y0: 0, y1: 7 },
};

/* Where the dead come from.

   Out of the lake, and in off the ends of the green -- the directions the
   place is actually open from. Two things these have to respect that the
   bunker's did not:

     - The PAD is where a body appears and starts walking, and it has to
       be somewhere the navmesh covers. The first set had the two flank
       pads at x -62 and +60, which is fifteen metres outside the mesh,
       and a body that starts off the mesh has no path and stands where
       it spawned for the whole round.
     - The SILL is where the boards go, so it wants to be across
       something: the mouth of the boat ramp, the head of a ladder, a gap
       in the fence. Five planks hanging in the middle of a lawn is not a
       barricade, it is litter.

   `inside` is the side you defend from, on the walk behind the seawall. */
const WINDOWS = [
  // The boat ramp. The obvious way up out of the water, and the widest.
  { id: 'CR', room: 'green', inside: [0.1, 0, -3.4], sillAt: [0.1, 0.95, -0.2], pad: [0.5, 0, 24.0], face: 'S', wx: [-3.2, 3.4] },
  // The west ladder, up the face of the seawall.
  { id: 'CL', room: 'green', inside: [-14.0, 0, -2.6], sillAt: [-14.0, 1.15, -0.1], pad: [-16.0, 0, 20.0], face: 'S', wx: [-15.4, -12.6] },
  // The foot of the pier, where it crosses the wall.
  { id: 'CP', room: 'green', inside: [C.pier.x, 0, -2.6], sillAt: [C.pier.x, 1.15, -0.1], pad: [C.pier.x + 1, 0, 30.0], face: 'S', wx: [C.pier.x - 1.4, C.pier.x + 1.4] },
  // The gap in the chain-link on the west boundary.
  { id: 'CW', room: 'green', inside: [-38.0, 0, -18.0], sillAt: [-41.0, 1.15, -18.0], pad: [-44.0, 0, -30.0], face: 'W', wz: [-19.4, -16.6] },
  // And the one on the east.
  { id: 'CE', room: 'green', inside: [36.0, 0, -20.0], sillAt: [39.0, 1.15, -20.0], pad: [43.0, 0, -32.0], face: 'E', wz: [-21.4, -18.6] },

  /* ONE PER HOUSE, and each of them dark until you buy that house's
     door. This is what a door is worth: paying for a way in is also
     paying for a way in FOR THEM, so a house is a room you chose to
     open and not a room you found. Four more barricades on a map that
     had five is a different round after round eight -- which is the
     point, because the map now has somewhere to go when the green stops
     being holdable.

     All of them sit on the road elevation, so the dead come at a house
     from the street side and the lake side of it stays the way out. */
  /* The two lakefront houses take theirs on the road elevation -- the
     back of the house -- so the dead come in from the street side and
     the lake side of the room stays your way out. */
  { id: 'CH1', room: 'green', inside: [C.ranch.x - 4.2, 0, C.ranch.z - C.ranch.d / 2 + 1.1],
    sillAt: [C.ranch.x - 4.2, 1.05, C.ranch.z - C.ranch.d / 2],
    pad: [C.ranch.x - 4.2, 0, C.ranch.z - C.ranch.d / 2 - 5.5], face: 'S',
    wx: [C.ranch.x - 5.6, C.ranch.x - 2.8] },
  { id: 'CH2', room: 'green', inside: [C.twoStorey.x + 3.6, 0, C.twoStorey.z - C.twoStorey.d / 2 + 1.1],
    sillAt: [C.twoStorey.x + 3.6, 1.05, C.twoStorey.z - C.twoStorey.d / 2],
    pad: [C.twoStorey.x + 3.6, 0, C.twoStorey.z - C.twoStorey.d / 2 - 5.5], face: 'S',
    wx: [C.twoStorey.x + 2.2, C.twoStorey.x + 5.0] },
  /* The two on the far pavement take theirs on a GABLE END instead.
     Their backs are two metres from the boundary fence -- there is no
     room behind them for a body to stand, never mind a spawn pad -- and
     a barricade on the side wall also means that fighting in one of
     them is fighting across the room rather than back down the hall. */
  { id: 'CH3', room: 'green', inside: [C.cottage.x - C.cottage.w / 2 + 1.1, 0, C.cottage.z],
    sillAt: [C.cottage.x - C.cottage.w / 2, 1.05, C.cottage.z],
    pad: [C.cottage.x - C.cottage.w / 2 - 5.5, 0, C.cottage.z], face: 'W',
    wz: [C.cottage.z - 1.4, C.cottage.z + 1.4] },
  { id: 'CH4', room: 'green', inside: [C.gable.x + C.gable.w / 2 - 1.1, 0, C.gable.z],
    sillAt: [C.gable.x + C.gable.w / 2, 1.05, C.gable.z],
    pad: [C.gable.x + C.gable.w / 2 + 5.5, 0, C.gable.z], face: 'E',
    wz: [C.gable.z - 1.4, C.gable.z + 1.4] },
];

/* ---------------- THE WAY OUT ----------------

   Bunker Nine has Exit 42, and Exit 42 is a lie: you do everything the
   man on the radio asks, the aircraft comes, and it goes into the field
   on fire. That is the right ending for a bunker in a wood in 1944.

   Coastline gets the other one. There is a boat, and if you can fuel it
   and start it you can actually leave -- which is a thing this genre
   almost never lets you do, and it is worth doing once, on the map that
   is somebody's real dock.

   Three pieces, and the geography does the work:

     - The CAN is in the gable house, at the far east end of the street.
       That is the longest walk on the map from anywhere, it is behind a
       two thousand point door, and you have to carry the thing back.
     - The BOAT is tied up at the boathouse, which is past the hole the
       flamingo made in the pier. There is no walking to it. You go over
       the side with a full jerry can and you swim.
     - Then you fuel it, you crank it, and you go.

   Nothing here is announced. There is no radio telling you about it and
   no prompt on the wall: the can is a jerry can on a kitchen worktop in
   a house you had to buy, and the rest follows from picking it up. */
const ESCAPE = {
  // On the worktop in the gable house's kitchen.
  can: { at: [C.gable.x - 3.4, 1.02, C.gable.z - C.gable.d / 2 + 0.80] },
  /* Alongside the boathouse, on the far side of the break. Moored to
     the last surviving cleat, low in the water the way a runabout sits. */
  boat: { at: [C.pier.x + 2.85, C.water.y - 0.15, C.boathouse.z + 0.4], yaw: 0 },
  /* The beach. Built four hundred metres east of everything so it cannot
     touch the map, and only ever seen by a camera that has stopped being
     the player's. */
  beach: { at: [420, 0, 0] },
  // How long each stage takes, in seconds.
  pour: 4.0, crank: 3.0, run: 9.0, fade: 1.6, sit: 9.0,
};

/* ---------------- the doors ----------------

   Four, one per house, and each opens the barricade inside it. The
   prices climb with how far the house is from the water: the ranch is
   twenty metres from the seawall and is what you buy on round five when
   the green gets tight; the gable house is at the far end of the street
   and is a decision about the rest of the game. */
const DOORS = [
  { id: 'ranch', cost: 1000, label: 'Force the ranch door', opens: ['CH1'],
    at: [C.ranch.x, 1.2, C.ranch.z + C.ranch.d / 2 - 0.15],
    panels: [[C.ranch.x - 1.30, C.ranch.x + 1.30, 0, 2.25,
      C.ranch.z + C.ranch.d / 2 - 0.30, C.ranch.z + C.ranch.d / 2]] },
  { id: 'twoStorey', cost: 1250, label: 'Force the front door', opens: ['CH2'],
    at: [C.twoStorey.x, 1.2, C.twoStorey.z + C.twoStorey.d / 2 - 0.15],
    panels: [[C.twoStorey.x - 1.30, C.twoStorey.x + 1.30, 0, 2.25,
      C.twoStorey.z + C.twoStorey.d / 2 - 0.30, C.twoStorey.z + C.twoStorey.d / 2]] },
  { id: 'cottage', cost: 1500, label: 'Force the cottage door', opens: ['CH3'],
    at: [C.cottage.x, 1.2, C.cottage.z + C.cottage.d / 2 - 0.15],
    panels: [[C.cottage.x - 1.30, C.cottage.x + 1.30, 0, 2.25,
      C.cottage.z + C.cottage.d / 2 - 0.30, C.cottage.z + C.cottage.d / 2]] },
  { id: 'gable', cost: 2000, label: 'Force the far door', opens: ['CH4'],
    at: [C.gable.x, 1.2, C.gable.z + C.gable.d / 2 - 0.15],
    panels: [[C.gable.x - 1.30, C.gable.x + 1.30, 0, 2.25,
      C.gable.z + C.gable.d / 2 - 0.30, C.gable.z + C.gable.d / 2]] },
];

/* ---------------- the Pack-a-Punch ----------------

   A mutated flamingo floaty, on the bottom of the lake, under a dock it
   brought down with it.

   Everything about where it is, is the point. Bunker Nine's upgrade is a
   rock in a room you already fight in; you walk to it. This one is at
   the bottom of a lake, which means the trip itself is the cost -- you
   leave the ground you were holding, you go somewhere you cannot shoot
   from, and you come back to whatever arrived while you were under. A
   weapon upgrade should be a decision and not a shop.

   It is built where the boathouse dock was. When the machine comes down
   it takes the dock with it, and the wreckage is how you find it: you
   look for the broken end of the pier and you go over the side. */
const PAP = {
  // On the bed, out past the boathouse, in about two metres of water.
  /* Directly under the gap, not off to one side of it. Set beside it,
     the hole in the pier showed you empty water and the machine was
     something you found by swimming around looking -- the break is
     supposed to BE the signpost. */
  at: [C.pier.x + 0.55, C.water.y - 1.62, 26.1],
  /* The span of decking that went in with it: a three-and-a-half metre
     hole in the run SHORT of the boathouse, so you walk out, the boards
     stop, and the boathouse is still ahead of you on the other side.
  
     Measured from the boathouse first, which was wrong twice over: it
     spanned the whole building, and its far edge landed past the end of
     the pier -- so the far deck section had a NEGATIVE length and was
     silently never built at all. A slab with its ends the wrong way round
     does not complain, it just does not exist, and the render looked
     plausible enough that it took reading the numbers to notice. */
  breaks: { x0: C.pier.x - 1.35, x1: C.pier.x + 1.35, z0: 24.4, z1: 27.9 },
};

/* The flamingo. Pink, bloated, and wrong in the specific way a pool toy
   is wrong when it has been in the water too long and has started to
   take an interest in you.

   Built from the same primitives as everything else here. The head is
   the part that does the work -- it comes down, the beak opens, the gun
   goes in -- so it is a group the game can move, and the rest is a
   floating body it is attached to. */
function buildFlamingo(game, mats, decos, at) {
  const P0 = at;
  const parts = [];
  const add = (a, nm) => { if (a) { a.name = nm; parts.push(a); decos.push(a); } return a; };

  // The body: a fat ring, the way an inflatable is a fat ring.
  const body = game.torus
    ? add(game.torus({ at: P0, radius: 0.95, tube: 0.42, material: mats.flamingo, physics: false }), 'pap-body')
    : add(game.sphere({ at: P0, radius: 0.95, material: mats.flamingo, physics: false }), 'pap-body');
  if (body && body.setRotation) body.setRotation([90, 0, 0]);
  // The swell where the neck leaves it.
  add(game.sphere({ at: [P0[0], P0[1] + 0.30, P0[2] - 0.55], radius: 0.46,
    material: mats.flamingo, physics: false }), 'pap-chest');

  /* The neck, in segments, so it can bend rather than hinge. An
     inflatable flamingo's neck is one smooth S and that is most of what
     makes the silhouette read at a glance. */
  const neck = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const y = P0[1] + 0.35 + t * 1.55;
    const z = P0[2] - 0.55 - Math.sin(t * Math.PI * 0.85) * 0.62;
    const seg = game.sphere({ at: [P0[0], y, z], radius: 0.20 - t * 0.055,
      material: mats.flamingo, physics: false });
    add(seg, 'pap-neck-' + i);
    neck.push(seg);
  }

  // The head, and the beak that opens.
  const headAt = [P0[0], P0[1] + 1.98, P0[2] - 1.02];
  const head = add(game.sphere({ at: headAt, radius: 0.30, material: mats.flamingo, physics: false }), 'pap-head');
  const eyeL = add(game.sphere({ at: [headAt[0] - 0.17, headAt[1] + 0.10, headAt[2] - 0.13], radius: 0.062,
    material: mats.papEye, physics: false }), 'pap-eye');
  const eyeR = add(game.sphere({ at: [headAt[0] + 0.17, headAt[1] + 0.10, headAt[2] - 0.13], radius: 0.062,
    material: mats.papEye, physics: false }), 'pap-eye');
  /* The beak is two halves that part. A pool toy's beak is a painted
     black tip; this one opens, which is the moment the whole machine
     exists for. */
  const upper = add(game.cone({ at: [headAt[0], headAt[1] + 0.02, headAt[2] - 0.44], radius: 0.17, height: 0.62,
    material: mats.papBeak, physics: false }), 'pap-beak-upper');
  const lower = add(game.cone({ at: [headAt[0], headAt[1] - 0.10, headAt[2] - 0.44], radius: 0.16, height: 0.58,
    material: mats.papBeak, physics: false }), 'pap-beak-lower');
  if (upper && upper.setRotation) upper.setRotation([-90, 0, 0]);
  if (lower && lower.setRotation) lower.setRotation([-90, 0, 0]);

  /* The mooring. It is on the bottom, so it is held down rather than
     floating free -- a chain to a block, which also says "this did not
     drift here, it was put here". */
  add(game.cylinder({ at: [P0[0] + 0.1, P0[1] - 0.62, P0[2] + 0.3], radius: 0.30, height: 0.42,
    material: mats.concreteWet, physics: false }), 'pap-block');
  for (let i = 0; i < 5; i++) {
    add(game.sphere({ at: [P0[0] + 0.1 - i * 0.02, P0[1] - 0.50 + i * 0.11, P0[2] + 0.30 - i * 0.03],
      radius: 0.052, material: mats.steelDark, physics: false }), 'pap-chain');
  }

  return { parts, head, beakUpper: upper, beakLower: lower, neck, eyes: [eyeL, eyeR], at: P0,
    headAt, beakRest: { upper: upper && upper.position.y, lower: lower && lower.position.y } };
}

/* ---------------- what the radio says here ----------------

   The operator calls you by the place you are standing in, and on the
   bunker's lines that place is Bunker Nine. Played on a lawn beside a
   lake, "lights out on the whole coast except you" and "more of them
   coming down the hill" are somebody reading the wrong script -- and the
   first thing the radio said on this map was a greeting to a building
   forty miles away.

   Only the lines that name the bunker or describe its ground are
   replaced. Everything else -- the weapon patter, the low-ammo nagging,
   the round-over jokes -- is the same two people and carries over. */
const LINES = {
  intro: [
    ['radio', 'Coastline, this is control. Every light between here and the point is out except yours.'],
    ['patch', 'Then somebody should tell whatever is coming up the ramp to knock first.'],
    ['radio', 'Board the gaps, corporal. They came out of the water once already.'],
  ],
  roundStart: [
    [['radio', 'More of them out past the pilings. I count... plenty.']],
    [['patch', 'Reload, breathe. Same song, louder verse.']],
    [['radio', 'They used to live here, you know. They just do not remember moving out.']],
    [['patch', 'Boards will not hold forever. Good thing neither will they.']],
    [['radio', 'They are coming up the ramp again. Do keep the noise up.']],
  ],
  /* The power lines are the other pair that describe ground this map does
     not have: there is no generator out here and nothing to crank. The
     lamps along the seawall are simply lit. */
  powerStart: [['patch', 'Nothing out here to switch on. The lamps are already burning.']],
  power: [['radio', 'You have light, Coastline. Whether that is a comfort is your business.']],
  gameOver: [['radio', 'Rest now, Coastline. I will keep a light on for the next one.']],
};

/* ---------------- what you can buy, and where ----------------

   Positions only. The machines themselves are built by the game, with the
   same builders Bunker Nine uses, so the two maps cannot drift apart in
   what a perk machine or a mystery box actually is.

   Spread on purpose: the two guns worth having are at the two ends of the
   map -- one at the end of the pier, which is a dead end you have to walk
   back out of, and one across the lawn at the far house. The point of an
   outdoor map this size is that the walk costs you something. */
const PLAY = {
  buys: [
    /* `face` is the side you walk up to it from. Three of these were on
       the wrong side of their own wall to begin with -- the pier pair
       faced out over open water and the slip's faced the lake -- which
       is a plate you can see and can never reach. Checked now by
       coastline.test.js: every buy has to have a floor in front of it. */
    // The near wall of the ranch house, facing the water.
    { id: 'thompson', at: [C.ranch.x + 5.2, 1.42, C.ranch.z + C.ranch.d / 2 + 0.06],
      weapon: 'thompson', label: 'Thompson', face: 'N' },
    // The two-storey, across the green.
    { id: 'scatter', at: [C.twoStorey.x - 4.6, 1.42, C.twoStorey.z + C.twoStorey.d / 2 + 0.06],
      weapon: 'scatter', label: 'Scattergun', face: 'N' },
    // The carport, out on the west edge.
    { id: 'mp5', at: [C.carport.x + C.carport.w / 2 - 0.2, 1.42, C.carport.z],
      weapon: 'mp5', label: 'MP5', face: 'E' },
    /* Under the pavilion, on its west post, facing IN across the deck --
       the other way round it faced the lake and you would have had to
       stand on the water to buy it. */
    { id: 'remington', at: [C.pier.x - C.pavilion.half + 0.1, C.pier.deckY + 1.35, C.pavilion.z],
      weapon: 'remington', label: 'Remington 700', face: 'E' },
    /* The MG 42, moved OFF the boathouse and onto the pavilion's east
       post. The boathouse is past the hole the flamingo made in the
       pier: with the deck gone from z 24.4 to 27.9 there is no way to
       walk to it at all, and the route check read the drop into the
       water as a 2.77 m rise. A wall-buy you cannot reach is not a
       decision, it is a bug with a price on it. The boathouse keeps
       something better than a gun -- it is where the boat is, and you
       have to swim to that on purpose. */
    { id: 'mg42', at: [C.pier.x + C.pavilion.half - 0.1, C.pier.deckY + 1.35, C.pavilion.z - 1.4],
      weapon: 'mg42', label: 'MG 42', face: 'W' },
    /* The covered slip, on the shore end of its east catwalk and facing
       along it. Mounted on the SIDE of the slip it faced the open water,
       and the catwalk is only ninety centimetres wide -- there was
       nowhere to stand. Along it, there is. */
    /* On the catwalk, which is 0.9 m wide and runs from x -22.5 to -21.6.
       The first position was 2.35 m in from the slip's edge, which is not
       on it -- it is out over the open slip where the boat sits, and the
       nearest floor was the lake bed four and a half metres down. */
    { id: 'paralyzer', at: [C.slip.x + C.slip.halfX - 0.45, C.water.y + 2.30, C.slip.z - C.slip.halfZ + 0.05],
      weapon: 'paralyzer', label: 'Paralyzer', face: 'N' },
    /* The Breakwater, INSIDE the cottage, on the partition by its
       kitchen. The map's own gun, and the only one you have to pay a
       door to reach -- which is what makes the cottage worth opening
       when the green stops being holdable. It faces the front room, so
       you buy it with your back to the one window in there. */
    { id: 'breakwater', at: [C.cottage.x + 1.6 - 0.12, 1.42, C.cottage.z + 1.6],
      weapon: 'breakwater', label: 'Breakwater', face: 'W' },
    /* The Thompson's old spot on the ranch's lake wall is now a second
       early gun rather than the only one on that side: the Sawn-Off, on
       the seawall walk by the top of the ramp, where the first round
       actually happens. Cheap, close, and the right answer to something
       coming up the ramp at you. */
    { id: 'sawnoff', at: [-9.4, 1.42, -0.34], weapon: 'sawnoff', label: 'Sawn-Off', face: 'S' },
  ],
  /* The four perks, each with its back to something, none of them within
     sight of another -- a corner you can hold is a corner with one perk
     in it, not three. */
  /* Three of the four moved INDOORS once the houses had insides and
     doors, because a perk standing on open grass is a perk you walk past
     on the way to somewhere else. Behind a door it is the reason the
     door is worth a thousand points, and it puts you in a room with one
     way out for as long as the machine takes.
     
     The pier keeps its one. That walk is already a decision -- it is a
     dead end over water with nothing to break line of sight on it -- and
     it should still pay. */
  perks: [
    ['supersoldier', [C.pier.x - 2.6, C.pier.deckY, C.pavilion.z + 1.6], 0],
    // In the ranch's back room, past the partition.
    ['adrenaline', [C.ranch.x - 8.0, 0.13, C.ranch.z + 3.6], 180],
    // Upstairs in the two-storey, which is what the stair is now for.
    ['shieldup', [C.twoStorey.x + 5.6, 3.25, C.twoStorey.z + 2.4], 0],
    // The far end of the street, in the last house on it.
    ['deflect', [C.gable.x - 5.4, 0.13, C.gable.z - 2.4], 180],
  ],
  /* The box under the pavilion, on the east widening rather than on the
     pier itself. Dead centre on the deck it was a 1.15 m crate in a 2.7 m
     walkway -- a road block on the only route to the two weapons past it,
     which the route check duly failed on. The pavilion is six metres wide;
     there is room to stand a crate there and still walk by. */
  box: [C.pier.x + 1.9, C.pier.deckY + 0.42, C.pavilion.z],
  // Grenades on the seawall walk, by the top of the ramp.
  nade: [5.2, 1.08, -1.6],
};

/* ---------------- the builder ----------------

   `game` is the engine. Everything here is either a solid (walk into it)
   or decoration (do not). The rule used throughout: anything the player
   can reach the edge of collides; anything more than a few metres out
   over the water, or further off than the fence line, does not -- it is
   there to be looked at, and a body that snags on scenery it can never
   touch is a body stuck out of reach for the rest of the round. */
function build(game, S) {
  const solids = [];
  const decos = [];

  const M = (spec) => game.material(spec);
  const mats = {};
  for (const k in MAT) mats[k] = M(MAT[k]);

  /* A named box between two corners, the same helper the bunker uses --
     it reads far better than centre-and-size for architecture, where
     everything is "from this wall to that one". */
  const slab = (x0, x1, y0, y1, z0, z1, material, name) => {
    if (x1 - x0 < 0.001 || y1 - y0 < 0.001 || z1 - z0 < 0.001) return null;
    const a = game.box({
      at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      size: [x1 - x0, y1 - y0, z1 - z0],
      material, static: true,
    });
    if (a) { a.name = name || 'coast'; solids.push(a); }
    return a;
  };
  const deco = (x0, x1, y0, y1, z0, z1, material, name) => {
    if (x1 - x0 < 0.001 || y1 - y0 < 0.001 || z1 - z0 < 0.001) return null;
    const a = game.box({
      at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      size: [x1 - x0, y1 - y0, z1 - z0],
      material, physics: false,
    });
    if (a) { a.name = name || 'coast-deco'; decos.push(a); }
    return a;
  };
  /* A cylinder is authored along +Y, so anything that has to point
     somewhere else needs the rotation that takes +Y to that direction.
     Quat.setFromUnitVectors is exactly that, and it is the only correct
     way in: Actor.rotation is a QUATERNION, not an Euler triple, so
     rotation.set(0, yaw, 0) sets x/y/z/w and silently produces a
     nonsense orientation rather than a yaw. */
  const _UP = new window.LE.Vec3(0, 1, 0);
  const aimY = (dx, dy, dz) => {
    const d = new window.LE.Vec3(dx, dy, dz);
    if (d.lengthSq() < 1e-9) return null;
    return new window.LE.Quat().setFromUnitVectors(_UP, d.normalize());
  };

  const post = (x, z, y0, y1, r, material, name) => {
    const a = game.cylinder({ at: [x, (y0 + y1) / 2, z], radius: r, height: y1 - y0,
      material, physics: false });
    if (a) { a.name = name || 'post'; decos.push(a); }
    return a;
  };

  /* A boat.

     Two of these on the map and both were a single box. A box on water
     is a crate on water: what makes a small runabout read as one, at the
     distance you see these from, is the taper to the bow and the fact
     that the top of it is open. So: slices along its length, narrowing
     to a point at one end and squared off at the other, a gunwale strip
     around the rim so the hull has a lip, a raked windscreen, and an
     outboard hanging off the transom.

     `yaw` is only ever 0 or 90 here -- the slip runs along Z and the
     trailer under the carport along it too -- so the axis is a flag
     rather than a rotation, which keeps every piece axis-aligned and
     out of the depth buffer's way. */
  const boat = (cx, cy, cz, len, beam, hullMat, alongZ) => {
    const n = 9, half = len / 2;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      /* Width along the hull: full amidships, a point at the bow, and
         about three quarters at the transom. sin gives the sheer without
         a table of numbers. */
      const wOf = (t) => beam * (0.14 + 0.86 * Math.pow(Math.sin(Math.PI * (0.12 + t * 0.80)), 0.75));
      const w = Math.max(wOf(t0), wOf(t1)) / 2;
      const a = -half + t0 * len, b = -half + t1 * len;
      // The hull is deeper amidships than at either end.
      const drop = 0.30 + 0.26 * Math.sin(Math.PI * t0);
      if (alongZ) deco(cx - w, cx + w, cy - drop, cy + 0.22, cz + a, cz + b, hullMat, 'boat-hull');
      else deco(cx + a, cx + b, cy - drop, cy + 0.22, cz - w, cz + w, hullMat, 'boat-hull');
    }
    // The gunwale: a lip round the rim, so the hull is not a solid lump.
    const gw = beam / 2 + 0.04;
    for (const side of [-1, 1]) {
      if (alongZ) deco(cx + side * gw - 0.05, cx + side * gw + 0.05, cy + 0.20, cy + 0.30, cz - half * 0.82, cz + half * 0.72, mats.white, 'boat-gunwale');
      else deco(cx - half * 0.82, cx + half * 0.72, cy + 0.20, cy + 0.30, cz + side * gw - 0.05, cz + side * gw + 0.05, mats.white, 'boat-gunwale');
    }
    // Windscreen, a third of the way back from the bow.
    const wz = half * 0.16;
    if (alongZ) deco(cx - beam * 0.34, cx + beam * 0.34, cy + 0.26, cy + 0.56, cz + wz, cz + wz + 0.06, mats.glass, 'boat-screen');
    else deco(cx + wz, cx + wz + 0.06, cy + 0.26, cy + 0.56, cz - beam * 0.34, cz + beam * 0.34, mats.glass, 'boat-screen');
    // And the outboard off the transom.
    const ez = -half - 0.18;
    if (alongZ) {
      deco(cx - 0.16, cx + 0.16, cy - 0.10, cy + 0.34, cz + ez, cz + ez + 0.30, mats.ironPaint, 'outboard');
      deco(cx - 0.09, cx + 0.09, cy - 0.52, cy - 0.08, cz + ez + 0.04, cz + ez + 0.22, mats.ironPaint, 'outboard-leg');
    } else {
      deco(cx + ez, cx + ez + 0.30, cy - 0.10, cy + 0.34, cz - 0.16, cz + 0.16, mats.ironPaint, 'outboard');
      deco(cx + ez + 0.04, cx + ez + 0.22, cy - 0.52, cy - 0.08, cz - 0.09, cz + 0.09, mats.ironPaint, 'outboard-leg');
    }
  };

  /* A hipped roof, which is the shape on every structure here: four
     faces rising to a ridge or a point. Built from stacked shrinking
     slabs rather than as real sloped geometry -- at the distance these
     are seen the stepping reads as shingle courses, and it costs four
     boxes instead of a mesh. */
  const hipRoof = (cx, cz, halfX, halfZ, y0, y1, material, name, steps) => {
    const n = steps || 5;
    for (let i = 0; i < n; i++) {
      const t = i / n, t2 = (i + 1) / n;
      const sx = halfX * (1 - t * 0.86), sz = halfZ * (1 - t * 0.86);
      deco(cx - sx, cx + sx, y0 + (y1 - y0) * t, y0 + (y1 - y0) * t2,
        cz - sz, cz + sz, material, name);
    }
  };

  /* ---------------- the lake and the land ----------------

     The ground is the lawn and it is flat, because the place is. The
     water is one wide slab at a fixed level rather than fluid: a lake
     does not need a solver, and the fluid system would spend the whole
     frame on something the player only ever looks at. */
  /* The ground.

     Pushed back so that it STOPS at the seawall instead of running on
     under the lake. It did run under it -- a 300 m plane centred on the
     origin -- and the lake slab sits 0.35 m above that plane over a
     hundred and twenty metres of water: two near-parallel surfaces a
     third of a metre apart, seen end-on. They z-fought, and the ground
     won almost everywhere, so the lake rendered as a thin bright line at
     its own edges and the map had a lawn where its water should be. Two
     passes went into tuning the colour of a surface that was never on
     screen.

     Moving the plane is better than nudging the water up: there is no
     grass out there to draw, and a fight you have removed cannot come
     back at a different camera height. */
  /* The grass is DRAWN here and collided with below, separately.
   *
   * game.ground() with no height function gives its actor an infinite
   * collision PLANE -- not a slab the size of the mesh. So although the
   * lawn was moved back to stop at the seawall, its collision carried on
   * under the entire lake at y = 0, which is below the water surface at
   * 0.35. Everything built on top of that was decoration: the shelving
   * lake bed never came into play because the infinite plane was always
   * above it, the "the lake has a bottom" check was passing on the wrong
   * floor, and a player could simply walk out across the whole lake at
   * ankle depth to the far shore. Measured straight down the middle of
   * the ramp: solid ground at y = 0.00 at every metre from z = 7 to the
   * horizon.
   *
   * So the mesh draws and does not collide, and a slab the size of the
   * lawn -- invisible, because the grass is already drawn over it --
   * carries the player. */
  game.ground({ at: [0, 0, -128], material: { ...MAT.grass, uvScale: 1 },
    size: 260, uvScale: 0.62, segments: 40, physics: false });
  {
    /* Stops at the outer face of the seawall. Run on to z = 2 it was the
       highest surface in the ramp cut for a metre or so, putting a small
       step in the middle of the slope for no reason -- the apron, the
       wall and the ramp all carry the player themselves out there. */
    /* Stops short of the seawall's outer face rather than reaching it.
       At 0.6 its top plane met the timber face's top and the front of the
       first ramp step -- two more coplanar pairs, from the slab that was
       meant to fix the floor. The apron, the wall and the ramp all carry
       the player out there themselves. */
    const floor = slab(-70, 70, -1.2, 0, -72, 0.42, mats.bed, 'lawn-floor');
    if (floor) floor.visible = false;
  }

  /* Water.

     The first version came out as a second lawn. It was authored as a
     green-grey diffuse slab, and a diffuse slab lit by a whole sky is
     just a pale surface -- so the lake, the grass and the far bank all
     landed on the same value and the waterline disappeared. Real water
     is nearly black in its own right and gets everything it shows from
     REFLECTION, which this shader does have: at roughness 0.06 the
     environment term is almost pure skyRadiance(reflect(V, N)), and at
     the grazing angles you look across a lake at, that is the bright
     horizon band. So the albedo goes down, not up, and the sheen comes
     back on its own.

     The roughness is a compromise found by rendering it. At 0.06 the lake
     is a mirror: from anywhere above it -- a rooftop, the pier, a jump --
     it reflects the whole dusk sky and blows out to flat white, and the
     map appears to be built on a sheet of paper. At 0.9 it stops
     reflecting anything and goes back to being a dark green field. 0.34
     keeps the sheen along the horizon, where you look at it from, without
     turning the surface into a mirror from above. */
  deco(-240, 240, C.water.y - 0.6, C.water.y, 0.2, 120, mats.water, 'lake');
  deco(-260, 260, C.water.y - 0.7, C.water.y - 0.02, 118, 260, mats.waterFar, 'lake-far');

  /* The far shore. A LOW pale line -- in the photographs it is barely
     thicker than the horizon itself, and that thinness is the whole
     reason it reads as a mile away rather than as a wall.

     It was thinner than that to begin with, and vanished: 0.7 m of bank
     at a hundred and ninety metres is three pixels tall, which is not a
     far shore, it is nothing. Brought in to a hundred and fifty and given
     a bank you can see, with a treeline on it -- the trees are what make
     the line read as land rather than as a seam in the water. */
  deco(-260, 260, C.water.y - 0.05, C.water.y + 1.9, C.farShore, C.farShore + 40, mats.shore, 'far-shore');
  for (let i = 0; i < 120; i++) {
    const x = -250 + i * 4.2 + ((i * 37) % 5) * 0.6;
    const h = 3.6 + ((i * 29) % 9) * 0.55;
    const c = game.sphere({ at: [x, C.water.y + 1.6 + h * 0.4, C.farShore + 6 + ((i * 17) % 11)],
      radius: h * 0.55, material: mats.farTree, physics: false });
    c.name = 'far-tree'; c.scale.y *= 0.8; decos.push(c);
  }
  /* And the dead pilings standing out of the water in front of it, which
     are the detail that says this is a flooded lake and not a sea. */
  for (let i = 0; i < 46; i++) {
    const x = -220 + ((i * 97) % 440);
    const z = 60 + ((i * 53) % 120);
    post(x, z, C.water.y - 0.2, C.water.y + 0.45 + ((i * 31) % 7) * 0.09, 0.075, mats.pilingDead, 'dead-piling');
  }

  /* ---------------- the seawall and the ramp ----------------

     One pour: the cap, the walk behind it, and the ramp cut through it.
     The ramp is the only way up out of the water at the near shore, and
     it is deliberately the widest gap in the whole edge. */
  const SW = C.seawall;
  const rampGap = [C.ramp.x0, C.ramp.x1];
  // Cap, in two runs with the ramp gap between them.
  slab(SW.x0, rampGap[0], 0, SW.capY, -SW.thick, SW.thick, mats.concrete, 'seawall-w');
  slab(rampGap[1], SW.x1, 0, SW.capY, -SW.thick, SW.thick, mats.concrete, 'seawall-e');
  // The weathered timber face below the cap, on the water side only.
  deco(SW.x0, rampGap[0], -0.9, 0, SW.thick - 0.06, SW.thick + 0.10, mats.wallTimber, 'seawall-face-w');
  deco(rampGap[1], SW.x1, -0.9, 0, SW.thick - 0.06, SW.thick + 0.10, mats.wallTimber, 'seawall-face-e');
  // Rusted strap along the top of the timber, the way the photograph has it.
  deco(SW.x0, rampGap[0], -0.16, -0.04, SW.thick + 0.02, SW.thick + 0.13, mats.rust, 'seawall-strap-w');
  deco(rampGap[1], SW.x1, -0.16, -0.04, SW.thick + 0.02, SW.thick + 0.13, mats.rust, 'seawall-strap-e');

  /* The ramp: concrete going down into the lake at about one in five.
     Stepped, because a box cannot be a wedge -- and the steps are small
     enough that a capsule walks them rather than catching. */
  {
    /* From the APRON down, not from the cap down.
    
       Starting at the cap it put a 0.30 m thick slab across the gap at y
       0.85 to 1.15, with the apron behind it at 0.12: a metre and three
       centimetres of step, against a controller that climbs 0.42. The
       ramp was not a way down to the water, it was a plinth you walked up
       to and stopped at -- which is also why it read as "invisible" from
       the lawn, because what you could see of it was a pale block rather
       than a slope. A boat ramp is a cut DOWN through the wall. */
    const steps = 14, top = 0.12, bot = C.water.y - 1.10;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const y = top + (bot - top) * t;
      /* Starting at -1.2 the first step lay UNDER the apron with its top
         at the same 0.12 -- four square metres of two surfaces on one
         plane, at the top of the ramp where you walk onto it. It butts
         the apron's edge instead. */
      const z0 = -0.5 + i * 0.85, z1 = z0 + 0.95;
      slab(rampGap[0], rampGap[1], y - 0.30, y, z0, z1, mats.concreteWet, 'ramp-' + i);
    }
    // The low kerb down each side of the ramp.
    /* Solid, not decoration: they are the only thing between the ramp and
       a two-metre drop into the lake on either side of it, and a kerb you
       walk through is not a kerb. */
    slab(rampGap[0] - 0.30, rampGap[0], 0, SW.capY, -1.2, 5.0, mats.concrete, 'ramp-kerb-w');
    slab(rampGap[1], rampGap[1] + 0.30, 0, SW.capY, -1.2, 5.0, mats.concrete, 'ramp-kerb-e');
  }

  /* The walk. It comes down the lawn, widens at the water and turns to
     run along behind the wall -- which is exactly the shape of the
     concrete in the fourth photograph, and it is what gives the seawall
     a fighting platform instead of a kerb. */
  slab(-9.5, 9.5, 0, 0.12, -9.0, -SW.thick, mats.concrete, 'apron');
  slab(-2.4, 2.4, 0, 0.12, -30.0, -9.0, mats.concrete, 'walk');
  /* The walk behind the wall runs in TWO pieces, one either side of the
     apron, rather than straight through it.

     Straight through, its top face and the apron's are the same plane
     over about fifty-four square metres -- the same fault that hid the
     entire lake behind the ground plane earlier in this file, at a
     smaller scale and in a place the player stands on. Two runs that
     butt against the apron's edges cannot fight, and the joint is
     invisible because it is the same pour. */
  slab(SW.x0 + 2, -9.5, 0, 0.12, -3.4, -SW.thick, mats.concrete, 'wall-walk-w');
  slab(9.5, SW.x1 - 2, 0, 0.12, -3.4, -SW.thick, mats.concrete, 'wall-walk-e');

  /* STEPS UP ONTO THE SEAWALL.

     Without these the whole waterfront is closed. The cap stands at 1.15
     and the walk behind it at 0.12 -- a metre of rise against a character
     controller that steps 0.42 -- so the cap, the pier, the gangway and
     the covered slip were all visible, all built, and none of them
     reachable on foot. The pier had a weapon on the end of it.

     Three risers each, at 0.34, which is under the step height with room
     to spare. Placed where there is something to walk to: the foot of the
     pier, the foot of the slip gangway, and one at each end of the wall
     so the cap is a route along the water rather than four islands. */
  const capSteps = (cx, w = 2.2) => {
    for (let i = 0; i < 3; i++) {
      /* The top riser arrives two millimetres UNDER the cap and runs into
         it rather than stopping short. Level with it, the two top faces
         are one plane and fight over the strip where they meet; stopping
         short leaves a seventeen-centimetre slot down to the walk. Two
         millimetres settles it in the cap's favour and loses nothing --
         the cap is the top step. */
      const last = i === 2;
      const y = 0.12 + (i + 1) * ((SW.capY - 0.12) / 3) - (last ? 0.002 : 0);
      const z1 = last ? -SW.thick + 0.04 : -2.6 + (i + 1) * 0.62 + 0.02;
      slab(cx - w / 2, cx + w / 2, 0, y, -2.6 + i * 0.62, z1, mats.concrete, 'cap-step-' + i);
    }
  };
  capSteps(C.pier.x);
  capSteps(C.slip.x + C.slip.halfX - 0.45);
  capSteps(-34.0);
  capSteps(30.0);

  /* A steel ladder down the face of the wall into the water. In the
     photograph it is the only way back up if you are in the lake, and
     here it is the second way the dead get out. */
  for (const side of [-1, 1]) {
    const x = side * 11.5;
    post(x - 0.22, SW.thick + 0.06, C.water.y - 0.9, SW.capY + 0.55, 0.035, mats.galv, 'ladder-rail');
    post(x + 0.22, SW.thick + 0.06, C.water.y - 0.9, SW.capY + 0.55, 0.035, mats.galv, 'ladder-rail');
    for (let i = 0; i < 5; i++) {
      deco(x - 0.24, x + 0.24, C.water.y - 0.7 + i * 0.34, C.water.y - 0.64 + i * 0.34,
        SW.thick + 0.02, SW.thick + 0.10, mats.galv, 'ladder-rung');
    }
  }

  /* ---------------- the pier ----------------

     Long, narrow and a dead end, which is the whole point of it: the
     view is the best on the map and there is exactly one way off. */
  const P = C.pier;
  for (let z = 2.0; z <= P.z1; z += 2.6) {
    post(P.x - P.halfW + 0.2, z, C.water.y - 1.6, P.deckY, 0.09, mats.galv, 'pier-piling');
    post(P.x + P.halfW - 0.2, z, C.water.y - 1.6, P.deckY, 0.09, mats.galv, 'pier-piling');
  }
  /* The pier runs out to the boathouse and STOPS, because the span over
     the Pack-a-Punch went into the lake with it. Built as two runs with
     the gap between them rather than as one deck with a decal on it: the
     hole has to be something you can fall through, or it is a picture of
     a hole. */
  slab(P.x - P.halfW, P.x + P.halfW, P.deckY - 0.14, P.deckY, -0.4, PAP.breaks.z0, mats.deckLong, 'pier-deck');
  slab(P.x - P.halfW, P.x + P.halfW, P.deckY - 0.14, P.deckY, PAP.breaks.z1, P.z1, mats.deckLong, 'pier-deck-far');
  // Handrail both sides, the whole length.
  for (const s of [-1, 1]) {
    const x = P.x + s * (P.halfW - 0.08);
    /* Broken where the deck is. Run straight across the gap they read as
       a handrail over a hole, which is a rail nobody bolted to anything --
       and it hides the one thing the gap exists to show you. Two runs,
       stopping where the boards stop. */
    for (const [a, b2] of [[-0.4, PAP.breaks.z0], [PAP.breaks.z1, P.z1]]) {
      deco(x - 0.05, x + 0.05, P.deckY + 0.92, P.deckY + 1.00, a, b2, mats.galv, 'pier-rail');
      deco(x - 0.04, x + 0.04, P.deckY + 0.46, P.deckY + 0.52, a, b2, mats.galv, 'pier-rail-mid');
    }
    /* And the torn ends: a rail that has been snapped bends down toward
       the water rather than stopping square. */
    for (const z of [PAP.breaks.z0, PAP.breaks.z1]) {
      const into = z === PAP.breaks.z0 ? 1 : -1;
      const bent = game.cylinder({ at: [x, P.deckY + 0.72, z + into * 0.34], radius: 0.045, height: 0.62,
        material: mats.galv, physics: false });
      bent.name = 'pier-rail-torn';
      bent.setRotation([into * 58, 0, 0]);
      decos.push(bent);
    }
    for (let z = 0.2; z <= P.z1; z += 2.2) post(x, z, P.deckY, P.deckY + 1.0, 0.045, mats.galv, 'pier-stanchion');
  }

  /* The pavilion: open on all four sides, rails between the posts, and
     the orange pyramid roof that is the only strong colour out here. */
  {
    const V = C.pavilion, h = V.half;
    /* Only the widening, not the whole floor.
    
       This laid a six-by-six deck at 1.25 on top of the pier's own deck,
       which is also at 1.25 -- sixteen square metres of two surfaces on
       one plane, right where you walk out to the weapon on it. The pier
       already provides the middle; the pavilion only has to provide what
       stands proud of it either side. */
    for (const side of [-1, 1]) {
      const a = side < 0 ? P.x - h : P.x + P.halfW;
      const b2 = side < 0 ? P.x - P.halfW : P.x + h;
      slab(a, b2, P.deckY - 0.16, P.deckY, V.z - h, V.z + h, mats.deck, 'pavilion-deck');
    }

    for (const dx of [-h + 0.25, h - 0.25]) for (const dz of [-h + 0.25, h - 0.25]) {
      post(P.x + dx, V.z + dz, C.water.y - 1.6, V.eaves, 0.10, mats.galv, 'pavilion-post');
    }
    hipRoof(P.x, V.z, h + 0.55, h + 0.55, V.eaves, V.peak, mats.roofOrange, 'pavilion-roof', 6);
    // Rails, left open where the pier meets it.
    for (const s of [-1, 1]) {
      deco(P.x + s * (h - 0.1) - 0.05, P.x + s * (h - 0.1) + 0.05, P.deckY + 0.95, P.deckY + 1.03,
        V.z - h, V.z + h, mats.galv, 'pavilion-rail');
    }
    deco(P.x - h, P.x + h, P.deckY + 0.95, P.deckY + 1.03, V.z + h - 0.1, V.z + h, mats.galv, 'pavilion-rail-far');
  }

  /* The boathouse: closed, with a slip cut up into it from the water.
     The one piece of interior out over the lake. */
  {
    const B = C.boathouse, h = B.half;
    for (const dx of [-h + 0.2, h - 0.2]) for (const dz of [-h + 0.2, h - 0.2]) {
      post(P.x + dx, B.z + dz, C.water.y - 1.6, B.eaves, 0.11, mats.galv, 'boathouse-post');
    }
    // Deck all round a slip down the middle.
    /* Same again: the pier runs through the boathouse at 1.25, so these
       two only cover from its edge out to the wall. */
    slab(P.x - h, P.x - P.halfW, P.deckY - 0.16, P.deckY, B.z - h, B.z + h, mats.deck, 'boathouse-deck-w');
    slab(P.x + P.halfW, P.x + h, P.deckY - 0.16, P.deckY, B.z - h, B.z + h, mats.deck, 'boathouse-deck-e');
    slab(P.x - 1.0, P.x + 1.0, P.deckY - 0.16, P.deckY, B.z + h - 1.2, B.z + h, mats.deck, 'boathouse-deck-n');
    // Walls, with a wide opening on the pier side.
    slab(P.x - h, P.x - h + 0.12, P.deckY, B.eaves, B.z - h, B.z + h, mats.roofBrown, 'boathouse-wall-w');
    slab(P.x + h - 0.12, P.x + h, P.deckY, B.eaves, B.z - h, B.z + h, mats.roofBrown, 'boathouse-wall-e');
    slab(P.x - h, P.x + h, P.deckY, B.eaves, B.z + h - 0.12, B.z + h, mats.roofBrown, 'boathouse-wall-n');
    slab(P.x - h, P.x - 1.3, P.deckY, B.eaves, B.z - h, B.z - h + 0.12, mats.roofBrown, 'boathouse-wall-s1');
    slab(P.x + 1.3, P.x + h, P.deckY, B.eaves, B.z - h, B.z - h + 0.12, mats.roofBrown, 'boathouse-wall-s2');
    hipRoof(P.x, B.z, h + 0.5, h + 0.5, B.eaves, B.peak, mats.shingle, 'boathouse-roof', 5);
  }

  /* ---------------- the covered slip ----------------

     Out over the water on its own pilings, with a boat on a lift under
     a pale canvas cover -- the shape on the right of the first
     photograph, and the thing that tells you at a glance which way the
     water is. */
  {
    const L = C.slip;
    for (const dx of [-L.halfX + 0.3, L.halfX - 0.3]) for (const dz of [-L.halfZ + 0.3, 0, L.halfZ - 0.3]) {
      post(L.x + dx, L.z + dz, C.water.y - 1.7, L.eaves, 0.10, mats.galv, 'slip-post');
    }
    hipRoof(L.x, L.z, L.halfX + 0.5, L.halfZ + 0.5, L.eaves, L.peak, mats.roofMetal, 'slip-roof', 5);
    // Catwalks down each side, and the lift frame between them.
    slab(L.x - L.halfX, L.x - L.halfX + 0.9, C.water.y + 0.75, C.water.y + 0.90, L.z - L.halfZ, L.z + L.halfZ, mats.deck, 'slip-walk-w');
    slab(L.x + L.halfX - 0.9, L.x + L.halfX, C.water.y + 0.75, C.water.y + 0.90, L.z - L.halfZ, L.z + L.halfZ, mats.deck, 'slip-walk-e');
    // The boat on its lift, and the canvas pitched over it.
    boat(L.x, C.water.y + 0.95, L.z, 6.2, 2.4, mats.white, true);
    for (let i = 0; i < 4; i++) {
      const t = i / 4, w = 1.75 * (1 - t * 0.74);
      deco(L.x - w, L.x + w, C.water.y + 1.28 + t * 0.17, C.water.y + 1.45 + t * 0.17,
        L.z - 3.4 + t * 0.25, L.z + 3.4 - t * 0.25, mats.canvas, 'slip-cover');
    }
    // The lift frame the boat is sitting on: two bunks under the hull.
    for (const dx of [-1.15, 1.15]) {
      deco(L.x + dx - 0.09, L.x + dx + 0.09, C.water.y + 0.30, C.water.y + 0.46, L.z - 2.6, L.z + 2.6, mats.steelDark, 'lift-bunk');
    }

    /* THE WALKWAY OUT TO IT.

       There was none. The slip sits thirteen metres out over the lake and
       nothing joined it to the shore -- so the most recognisable thing on
       the map, the one the sunset photograph is taken from under, was
       scenery you could look at and never reach, and a weapon was mounted
       on it. It is a dock; you walk out to it.

       Built along the slip's east catwalk line so it lands on something,
       with a rail on the open side and pilings under it like everything
       else out here. */
    const gx = L.x + L.halfX - 0.45, deck = C.water.y + 0.90;
    slab(gx - 0.85, gx + 0.85, deck - 0.14, deck, -0.4, L.z - L.halfZ + 0.2, mats.deck, 'slip-gangway');
    for (let z = 1.4; z < L.z - L.halfZ; z += 3.2) {
      post(gx - 0.72, z, C.water.y - 1.6, deck, 0.075, mats.galv, 'gangway-piling');
      post(gx + 0.72, z, C.water.y - 1.6, deck, 0.075, mats.galv, 'gangway-piling');
    }
    for (const side of [-1, 1]) {
      const rx = gx + side * 0.80;
      for (let z = 1.0; z < L.z - L.halfZ; z += 2.4) {
        post(rx, z, deck, deck + 1.0, 0.045, mats.white, 'gangway-post');
      }
      deco(rx - 0.05, rx + 0.05, deck + 0.92, deck + 1.02, -0.2, L.z - L.halfZ, mats.white, 'gangway-rail');
    }
  }

  /* ---------------- the buildings ----------------

     Brick, low, and set well back from the water, which is how the
     photographs have them: the lawn is the subject and the houses are
     the edge of it. */
  /* A house.

     The first version put every window and the front door on the z0 face
     -- the side AWAY from the water -- so from the lawn, which is the only
     place on the map you ever see these from, both houses were blank
     slabs of brick with a roof on. In the photographs they face the
     water: the glass, the doors and the porch are all on the lake side,
     and the road side is the one with nothing on it. Turned round, and
     given the gable ends a window each so there is no dead elevation. */
  /* `backwards` turns the house round: the front elevation -- the door,
     the big panes, the porch -- goes on the -Z face instead of the +Z
     one. The two original houses look at the lake; the two on the far
     pavement look at the road, which is the same thing from the other
     side of it. Without this they would all present their backs to the
     street and the neighbourhood would have no fronts in it. */
  /* All four houses face +Z, and that is not laziness -- it is what the
     street does. The two lakefront houses face the water with their
     backs and their driveways to the road, which is how a house on a
     waterfront lot is always laid out; the two on the far pavement face
     the road because there is nothing else for them to face. So the
     fronts of one pair look at the fronts of the other across the
     carriageway, and no house has to be built mirrored to get it. */
  const houseShell = (h, wallMat, roofMat, tall) => {
    const x0 = h.x - h.w / 2, x1 = h.x + h.w / 2;
    const z0 = h.z - h.d / 2, z1 = h.z + h.d / 2;
    const T = 0.30;
    const F = z1;                       // the front: the face toward the water
    // Four walls, with the doorway in the lake-facing side.
    /* The side walls own the corners; the back and front run BETWEEN
       them rather than out to their outer faces. Out to them, the end of
       the back wall and the outside of the side wall are one plane, and
       on the two-storey that is six metres by a third of one -- enough
       to see a seam flicker along the corner of the house as you walk
       past it. */
    slab(x0 + T, x1 - T, 0, h.wall, z0, z0 + T, wallMat, 'house-back');
    slab(x0, x0 + T, 0, h.wall, z0, z1, wallMat, 'house-w');
    slab(x1 - T, x1, 0, h.wall, z0, z1, wallMat, 'house-e');
    slab(x0 + T, h.x - 1.3, 0, h.wall, F - T, F, wallMat, 'house-front-1');
    slab(h.x + 1.3, x1 - T, 0, h.wall, F - T, F, wallMat, 'house-front-2');
    slab(h.x - 1.3, h.x + 1.3, 2.25, h.wall, F - T, F, wallMat, 'house-front-head');
    slab(x0, x1, -0.05, 0.10, z0, z1, mats.concrete, 'house-floor');
    if (tall) {
      // A first floor, and the hole in it that the stair comes up.
      /* Inside the walls, not out to their outer faces -- the east half
         reached x1 and shared that plane with the east wall's own
         outside, which is nearly two square metres of seam up the corner
         of the house. */
      slab(x0 + T, h.x + 1.2, 3.05, 3.25, z0 + T, z1 - T, mats.deck, 'house-upper-w');
      slab(h.x + 1.2, x1 - T, 3.05, 3.25, z0 + 3.2, z1 - T, mats.deck, 'house-upper-e');
      const steps = 13;
      for (let i = 0; i < steps; i++) {
        const y = (i / steps) * 3.05;
        slab(h.x + 1.4, x1 - T, y, y + 0.24, z0 + 3.2 - i * 0.24, z0 + 3.4 - i * 0.24, mats.deck, 'house-step-' + i);
      }
    }
    // Roof: a hip over the whole footprint, plus a chimney.
    hipRoof(h.x, h.z, h.w / 2 + 0.45, h.d / 2 + 0.45, h.wall, h.wall + (tall ? 2.4 : 2.9), roofMat, 'house-roof', 6);
    deco(x1 - 3.0, x1 - 2.1, h.wall, h.wall + 3.6, h.z - 0.5, h.z + 0.4, mats.brick, 'chimney');

    /* A window: glass, a pale surround, and a sill. The surround matters
       more than it sounds -- a dark pane set straight into brick with no
       frame reads as a hole punched in the wall, not as a window.

       Both of these sit on the OUTER face of the wall. The first pass put
       them at `F - T`, which is the inner face: every window on both
       houses was walled up behind thirty centimetres of brick, and the
       elevations rendered blank exactly as if they had never been built. */
    const win = (cx, cy, halfW, halfH, zf, zb) => {
      deco(cx - halfW - 0.14, cx + halfW + 0.14, cy - halfH - 0.14, cy + halfH + 0.14, zf, zb, mats.white, 'house-frame');
      deco(cx - halfW, cx + halfW, cy - halfH, cy + halfH, zf - 0.02, zb + 0.02, mats.glass, 'house-window');
    };
    const winX = (cz, cy, halfD, halfH, xf, xb) => {
      deco(xf, xb, cy - halfH - 0.14, cy + halfH + 0.14, cz - halfD - 0.14, cz + halfD + 0.14, mats.white, 'house-frame');
      deco(xf - 0.02, xb + 0.02, cy - halfH, cy + halfH, cz - halfD, cz + halfD, mats.glass, 'house-window');
    };
    // The lake elevation: big panes either side of the door.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const cx = h.x + side * (2.9 + i * 3.4);
        if (cx - 0.85 < x0 + T || cx + 0.85 > x1 - T) continue;
        win(cx, 1.66, 0.85, 0.62, F - 0.06, F + 0.04);
        if (tall) win(cx, 4.70, 0.80, 0.60, F - 0.06, F + 0.04);
      }
    }
    // The gable ends, one each, so no elevation is blank.
    for (const xe of [x0, x1]) {
      const inw = xe === x0 ? 1 : -1;
      winX(h.z, 1.70, 0.70, 0.60, xe - inw * 0.06, xe + inw * 0.04);
    }
    // And the road side, smaller and higher -- a kitchen window.
    win(h.x - h.w * 0.22, 2.00, 0.55, 0.45, z0 - 0.04, z0 + 0.06);
  };
  houseShell(C.ranch, mats.brick, mats.shingle, false);
  houseShell(C.twoStorey, mats.brickPale, mats.shingle, true);
  /* The white double doors on the ranch, straight off the third
     photograph -- on the lake face, with the porch slab in front. */
  {
    const zf = C.ranch.z + C.ranch.d / 2;
    deco(C.ranch.x - 1.25, C.ranch.x + 1.25, 0.05, 2.25, zf - 0.38, zf - 0.30, mats.white, 'ranch-doors');
    deco(C.ranch.x - 2.6, C.ranch.x + 2.6, 0.02, 0.16, zf, zf + 2.2, mats.concrete, 'ranch-porch');
    for (const dx of [-2.3, 2.3]) post(C.ranch.x + dx, zf + 2.0, 0.16, C.ranch.wall - 0.1, 0.09, mats.white, 'porch-post');
    deco(C.ranch.x - 2.6, C.ranch.x + 2.6, C.ranch.wall - 0.1, C.ranch.wall + 0.12, zf, zf + 2.3, mats.white, 'porch-roof');
  }
  {
    const zf = C.twoStorey.z + C.twoStorey.d / 2;
    deco(C.twoStorey.x - 1.1, C.twoStorey.x + 1.1, 0.05, 2.25, zf - 0.38, zf - 0.30, mats.white, 'house-door');
    // The upstairs balcony the two-storey has over its front door.
    deco(C.twoStorey.x - 3.2, C.twoStorey.x + 3.2, 3.22, 3.40, zf, zf + 1.8, mats.deck, 'balcony');
    for (const dx of [-3.0, 3.0]) post(C.twoStorey.x + dx, zf + 1.6, 0.0, 3.30, 0.08, mats.white, 'balcony-post');
    for (const dx of [-3.1, 3.1]) post(C.twoStorey.x + dx, zf + 1.6, 3.40, 4.40, 0.05, mats.white, 'balcony-rail-post');
    deco(C.twoStorey.x - 3.2, C.twoStorey.x + 3.2, 4.32, 4.42, zf + 1.55, zf + 1.65, mats.white, 'balcony-rail');
  }

  /* The carport, with the boat on its trailer under it. Open steel: four
     posts and a shallow roof, which is all the photograph shows. */
  {
    const K = C.carport;
    for (const dx of [-K.w / 2 + 0.3, K.w / 2 - 0.3]) for (const dz of [-K.d / 2 + 0.3, K.d / 2 - 0.3]) {
      post(K.x + dx, K.z + dz, 0, K.h, 0.09, mats.galv, 'carport-post');
    }
    deco(K.x - K.w / 2, K.x + K.w / 2, K.h, K.h + 0.22, K.z - K.d / 2, K.z + K.d / 2, mats.white, 'carport-roof');
    boat(K.x, 1.15, K.z, 5.6, 2.2, mats.white, true);
    for (const dz of [-1.6, 0.4]) post(K.x - 1.0, K.z + dz, 0, 0.5, 0.16, mats.steelDark, 'trailer-wheel');
  }


  /* ---------------- the street, and the rest of the neighbourhood ----

     The green ran from the seawall to a fence and that was the map: two
     houses standing on a lawn with nothing behind them, which is a
     diorama and not a place. What a road adds is not scenery -- it is a
     second axis. Everything here used to be "toward the water" or "away
     from it"; a carriageway running the full width gives you a line to
     hold, cars to break line of sight behind, and two more buildings
     with their own doors at the far end of it. */
  {
    const R = C.street;
    const z0 = R.z - R.half, z1 = R.z + R.half;
    // The carriageway itself, sunk a hair below the grass so the kerb reads.
    deco(R.x0, R.x1, -0.02, 0.015, z0, z1, mats.asphalt, 'road');
    // Kerbs, both sides, with the verge behind them.
    for (const s of [-1, 1]) {
      const zk = s < 0 ? z0 : z1;
      deco(R.x0, R.x1, 0, R.kerb, zk - 0.16 * s * -1 - (s < 0 ? 0.18 : 0), zk + (s < 0 ? 0 : 0.18),
        mats.kerb, 'kerb');
      deco(R.x0, R.x1, 0.01, 0.05, zk + s * 0.18, zk + s * 1.50, mats.concrete, 'pavement');
    }
    /* A broken centre line. Painted as separate slabs rather than one
       long strip, because a continuous line down the middle of a road is
       the one thing that says "this is a model of a road". */
    for (let x = R.x0 + 2; x < R.x1 - 2; x += 5.4) {
      deco(x, x + 2.8, 0.016, 0.021, R.z - 0.09, R.z + 0.09, mats.roadLine, 'road-line');
    }

    /* Driveways: every house gets one, because a house on a street with
       no way onto it is a house someone dropped there. They also do a
       job -- they are the four places where the grass between the road
       and the buildings is walkable at a run without the fence-posts and
       flower beds in the way. */
    const drive = (x, halfW, zFrom, zTo) => {
      deco(x - halfW, x + halfW, 0.005, 0.055, Math.min(zFrom, zTo), Math.max(zFrom, zTo),
        mats.concrete, 'drive');
    };
    drive(C.ranch.x + 6.0, 2.6, z0 - 0.2, C.ranch.z - C.ranch.d / 2);
    drive(C.twoStorey.x - 5.0, 2.6, z0 - 0.2, C.twoStorey.z - C.twoStorey.d / 2);
    drive(C.cottage.x + 4.0, 2.6, z1 + 0.2, C.cottage.z + C.cottage.d / 2);
    drive(C.gable.x - 4.5, 2.6, z1 + 0.2, C.gable.z + C.gable.d / 2);

    /* Street lamps down the north verge. Dead -- there is no power out
       here and the map is lit by a sunset -- but they are the vertical
       rhythm a street needs, and they are something to stand behind. */
    for (let x = -40; x <= 40; x += 16) {
      post(x, z1 + 1.1, 0, 5.2, 0.09, mats.galv, 'street-lamp-post');
      deco(x - 0.16, x + 0.9, 5.05, 5.20, z1 + 1.02, z1 + 1.18, mats.galv, 'street-lamp-arm');
      deco(x + 0.62, x + 1.16, 4.80, 5.06, z1 + 0.94, z1 + 1.26, mats.white, 'street-lamp-head');
    }
  }

  /* The two houses on the far pavement. They face the road -- which is
     to say they have their backs to the lake -- so the neighbourhood has
     two sides to it and you are not always looking the same way. */
  houseShell(C.cottage, mats.brickPale, mats.roofBrown, false);
  houseShell(C.gable, mats.brick, mats.roofOrange, false);

  /* ---------------- what is inside the houses ----------------

     Four shells with a concrete floor and nothing in them is four caves,
     and a cave is a room the dead cannot be fought in: nothing breaks
     the line, nothing to put your back to, nowhere that is better to
     stand than anywhere else. Partition walls with doorways make each
     house two or three rooms with choke points between them; furniture
     gives those rooms a reason and something to be behind.

     Everything here is deco except the partitions, which have to stop a
     body. Furniture deliberately does NOT -- a sofa you get stuck on in
     a corridor five metres wide is worse than a sofa you walk through,
     and this is a game about backing away from things. */
  const room = (h, opts) => {
    const x0 = h.x - h.w / 2 + 0.30, x1 = h.x + h.w / 2 - 0.30;
    const z0 = h.z - h.d / 2 + 0.30, z1 = h.z + h.d / 2 - 0.30;
    const T = 0.18, W = h.wall;
    /* A partition with a doorway in it. `at` is where the wall stands,
       `gapAt` where the opening is and `gapHalf` how wide. Built as two
       pieces and a head, so the opening is an opening and not a hole in
       a texture. */
    const partX = (x, gapAt, gapHalf) => {
      slab(x - T / 2, x + T / 2, 0, W, z0, gapAt - gapHalf, mats.plaster, 'part-w');
      slab(x - T / 2, x + T / 2, 0, W, gapAt + gapHalf, z1, mats.plaster, 'part-w');
      slab(x - T / 2, x + T / 2, 2.10, W, gapAt - gapHalf, gapAt + gapHalf, mats.plaster, 'part-head');
    };
    const partZ = (z, gapAt, gapHalf) => {
      slab(x0, gapAt - gapHalf, 0, W, z - T / 2, z + T / 2, mats.plaster, 'part-z');
      slab(gapAt + gapHalf, x1, 0, W, z - T / 2, z + T / 2, mats.plaster, 'part-z');
      slab(gapAt - gapHalf, gapAt + gapHalf, 2.10, W, z - T / 2, z + T / 2, mats.plaster, 'part-head');
    };
    // Lining: the inside faces of the outer walls, so a room is plaster
    // and not the back of the brick it is built from.
    deco(x0 - 0.04, x1 + 0.04, 0, W, z0 - 0.04, z0 + 0.01, mats.plaster, 'lining');
    deco(x0 - 0.04, x0 + 0.01, 0, W, z0, z1, mats.plaster, 'lining');
    deco(x1 - 0.01, x1 + 0.04, 0, W, z0, z1, mats.plaster, 'lining');
    // The floor: boards in the living half, carpet where the beds are.
    deco(x0, x1, 0.10, 0.13, z0, z1, opts.floor || mats.floorBoard, 'inside-floor');

    for (const p of (opts.partX || [])) partX(p[0], p[1], p[2]);
    for (const p of (opts.partZ || [])) partZ(p[0], p[1], p[2]);
    return { x0, x1, z0, z1 };
  };

  /* Furniture. Each of these is a handful of boxes and every one of them
     is there to be seen from a doorway at a run -- so the silhouette
     matters and the detail does not. */
  const sofa = (x, z, yaw) => {
    const ax2 = yaw ? 0 : 1;                  // 0 = runs along Z, 1 = along X
    const hw = ax2 ? 1.05 : 0.42, hd = ax2 ? 0.42 : 1.05;
    deco(x - hw, x + hw, 0.13, 0.46, z - hd, z + hd, mats.sofa, 'sofa-seat');
    if (ax2) deco(x - hw, x + hw, 0.46, 0.92, z + hd - 0.22, z + hd, mats.sofa, 'sofa-back');
    else deco(x + hw - 0.22, x + hw, 0.46, 0.92, z - hd, z + hd, mats.sofa, 'sofa-back');
    for (const s of [-1, 1]) {
      if (ax2) deco(x + s * hw - (s > 0 ? 0.24 : 0), x + s * hw + (s < 0 ? 0.24 : 0),
        0.46, 0.72, z - hd, z + hd, mats.sofa, 'sofa-arm');
      else deco(x - hw, x + hw, 0.46, 0.72, z + s * hd - (s > 0 ? 0.24 : 0), z + s * hd + (s < 0 ? 0.24 : 0),
        mats.sofa, 'sofa-arm');
    }
  };
  const table = (x, z, hw, hd) => {
    deco(x - hw, x + hw, 0.68, 0.74, z - hd, z + hd, mats.cabinet, 'table-top');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      post(x + sx * (hw - 0.10), z + sz * (hd - 0.10), 0.13, 0.68, 0.035, mats.cabinet, 'table-leg');
    }
  };
  const bed = (x, z) => {
    deco(x - 0.78, x + 0.78, 0.16, 0.42, z - 1.02, z + 1.02, mats.cabinet, 'bed-frame');
    deco(x - 0.74, x + 0.74, 0.42, 0.66, z - 0.98, z + 0.98, mats.mattress, 'bed-mattress');
    deco(x - 0.78, x + 0.78, 0.42, 1.05, z - 1.06, z - 0.96, mats.cabinet, 'bed-head');
  };
  const kitchen = (x0k, x1k, z, face) => {
    const n = face === 'N' ? 1 : -1;
    deco(x0k, x1k, 0.13, 0.88, z - 0.32, z + 0.32, mats.cabinet, 'units');
    deco(x0k - 0.03, x1k + 0.03, 0.88, 0.94, z - 0.36, z + 0.36, mats.counter, 'worktop');
    // Wall cupboards above, and a cooker in the run.
    deco(x0k, x1k - 1.6, 1.52, 2.22, z + n * 0.10, z + n * 0.42, mats.cabinet, 'cupboards');
    deco(x1k - 1.5, x1k - 0.6, 0.13, 0.92, z - 0.32, z + 0.32, mats.appliance, 'cooker');
  };
  const shelf = (x0s, x1s, y, z, face) => {
    const n = face === 'N' ? 1 : -1;
    deco(x0s, x1s, y, y + 0.05, z, z + n * 0.34, mats.cabinet, 'shelf');
  };

  /* THE RANCH. One long room down the lake side, a kitchen at the road
     end, and a bedroom behind a partition on the west. Two doorways, and
     they are the reason to own the place: whoever is in here is fighting
     in three metres of gap and not in nineteen metres of field. */
  {
    const h = C.ranch;
    const r = room(h, { partX: [[h.x - 3.2, h.z + 1.2, 1.05]], partZ: [[h.z - 1.6, h.x + 4.5, 1.10]] });
    sofa(h.x + 2.6, r.z1 - 1.6, 1);
    table(h.x + 5.6, h.z + 1.0, 0.85, 0.60);
    kitchen(h.x + 1.4, h.x + 6.4, r.z0 + 0.5, 'N');
    bed(h.x - 6.0, h.z - 2.6);
    bed(h.x - 6.0, h.z + 2.2);
    shelf(h.x - 1.6, h.x + 1.0, 1.30, r.z0 + 0.34, 'N');
    game.light({ at: [h.x + 3.0, 2.5, h.z + 2.0], color: 0xffd2a0, intensity: 7, radius: 9 });
    game.light({ at: [h.x - 6.0, 2.5, h.z], color: 0xffd2a0, intensity: 5, radius: 8 });
  }

  /* THE TWO-STOREY. Downstairs is one room and a hall with the stair in
     it; upstairs is two bedrooms off the landing. The stair was already
     here -- what it was missing was a reason to go up, which is now a
     perk at the top of it. */
  {
    const h = C.twoStorey;
    const r = room(h, { partZ: [[h.z - 1.0, h.x - 3.0, 1.10]] });
    sofa(h.x - 2.0, r.z1 - 1.7, 1);
    table(h.x - 5.0, h.z + 2.0, 0.80, 0.80);
    kitchen(h.x - 6.2, h.x - 1.2, r.z0 + 0.5, 'N');
    // Upstairs: a partition across the landing, and a bed either side.
    slab(h.x - 1.0, h.x + 1.2, 3.25, h.wall, r.z0, r.z1 - 2.6, mats.plaster, 'upper-part');
    bed(h.x - 4.2, h.z - 1.0);
    bed(h.x + 4.0, h.z - 1.0);
    deco(r.x0, h.x + 1.2, 3.25, 3.28, r.z0, r.z1, mats.carpet, 'upper-carpet');
    game.light({ at: [h.x - 2.0, 2.4, h.z + 2.0], color: 0xffd2a0, intensity: 7, radius: 9 });
  }

  /* THE COTTAGE, on the far pavement. Small and mean on purpose: it is
     the one house you can be cornered in, which is what makes the two
     hundred metres of open lawn outside it feel safe. */
  {
    const h = C.cottage;
    const r = room(h, { floor: mats.carpet, partX: [[h.x + 1.6, h.z - 0.4, 1.05]] });
    sofa(h.x - 3.0, h.z + 1.2, 1);
    table(h.x - 2.4, h.z - 2.0, 0.70, 0.55);
    kitchen(h.x + 2.4, h.x + 5.2, r.z1 - 0.5, 'S');
    bed(h.x + 3.6, h.z - 2.4);
    shelf(h.x - 4.8, h.x - 2.4, 1.40, r.z0 + 0.34, 'N');
    game.light({ at: [h.x - 2.0, 2.4, h.z], color: 0xffd2a0, intensity: 6, radius: 9 });
    game.light({ at: [h.x + 3.4, 2.4, h.z], color: 0xffd2a0, intensity: 5, radius: 8 });
  }

  /* THE GABLE HOUSE, at the east end of the street. The far corner of
     the map, and the longest walk back from anywhere -- so it is where
     the good perk goes. */
  {
    const h = C.gable;
    const r = room(h, { partZ: [[h.z + 0.6, h.x + 3.4, 1.15]] });
    sofa(h.x + 2.0, r.z1 - 1.8, 1);
    table(h.x - 2.0, h.z + 1.8, 0.90, 0.65);
    kitchen(h.x - 5.4, h.x - 1.0, r.z0 + 0.5, 'N');
    bed(h.x + 3.2, h.z - 2.0);
    bed(h.x - 3.2, h.z - 2.0);
    shelf(h.x + 4.4, h.x + 6.0, 1.35, r.z0 + 0.34, 'N');
    game.light({ at: [h.x, 2.6, h.z + 2.0], color: 0xffd2a0, intensity: 7, radius: 10 });
    game.light({ at: [h.x, 2.6, h.z - 2.4], color: 0xffd2a0, intensity: 5, radius: 9 });
  }

  /* ---------------- the cars ----------------

     Abandoned, which means not parked: nose-in to a kerb, one across two
     spaces, one halfway out of a drive with its doors open. A row of
     neatly aligned cars is a car park and reads as set dressing; cars
     left where their drivers stopped caring are the reason the street is
     empty. */
  const car = (x, z, yaw, body, wrecked) => {
    /* Along X when yaw is 0, along Z when it is 1. Two orientations is
       all this needs and a full rotation would mean rotating eleven
       boxes about a point, which is a quaternion per part for no gain at
       the distance these are seen from. */
    const L = 4.30, Wd = 1.78, sill = 0.42, roof = 1.44;
    const ax2 = yaw ? 0 : 1;
    const hx = ax2 ? L / 2 : Wd / 2, hz = ax2 ? Wd / 2 : L / 2;
    // Body: sills, then the tub, then the cabin set in from both sides.
    deco(x - hx, x + hx, 0.30, sill, z - hz, z + hz, body, 'car-sill');
    deco(x - hx + 0.10, x + hx - 0.10, sill, 1.02, z - hz + 0.04, z + hz - 0.04, body, 'car-body');
    const cx0 = ax2 ? x - hx * 0.42 : x - hx + 0.16;
    const cx1 = ax2 ? x + hx * 0.46 : x + hx - 0.16;
    const cz0 = ax2 ? z - hz + 0.16 : z - hz * 0.42;
    const cz1 = ax2 ? z + hz - 0.16 : z + hz * 0.46;
    deco(cx0, cx1, 1.02, roof, cz0, cz1, mats.carGlass, 'car-glass');
    deco(cx0 - 0.02, cx1 + 0.02, roof, roof + 0.06, cz0 - 0.02, cz1 + 0.02, body, 'car-roof');
    // Bumpers and lights, at each end of the long axis.
    for (const s of [-1, 1]) {
      if (ax2) {
        deco(x + s * hx - (s > 0 ? 0.12 : 0), x + s * hx + (s < 0 ? 0.12 : 0),
          0.44, 0.62, z - hz + 0.06, z + hz - 0.06, mats.chrome, 'car-bumper');
        for (const sz of [-1, 1]) {
          deco(x + s * hx - (s > 0 ? 0.10 : 0.0), x + s * hx + (s < 0 ? 0.10 : 0.0),
            0.70, 0.88, z + sz * (hz - 0.30) - 0.14, z + sz * (hz - 0.30) + 0.14,
            wrecked ? mats.carRust : mats.white, 'car-lamp');
        }
      } else {
        deco(x - hx + 0.06, x + hx - 0.06, 0.44, 0.62,
          z + s * hz - (s > 0 ? 0.12 : 0), z + s * hz + (s < 0 ? 0.12 : 0), mats.chrome, 'car-bumper');
      }
    }
    // Wheels: four, sunk into the arches rather than hung off the side.
    for (const sl of [-1, 1]) for (const st of [-1, 1]) {
      const wx = ax2 ? x + sl * (hx - 0.78) : x + st * (hx - 0.10);
      const wz = ax2 ? z + st * (hz - 0.10) : z + sl * (hz - 0.78);
      const t = game.cylinder({ at: [wx, 0.31, wz], radius: 0.31, height: 0.22,
        material: mats.tyre, physics: false });
      if (t) {
        t.name = 'car-wheel';
        const q = aimY(ax2 ? 0 : 1, 0, ax2 ? 1 : 0);
        if (q && t.rotation && t.rotation.copy) t.rotation.copy(q);
        decos.push(t);
      }
    }
    /* A car is cover, so it has to be SOLID -- the whole point of one
       in a street is that you break line of sight behind it and the
       dead have to come round. Collision is one box, not eleven: the
       cabin is a step you can get up on and the sills are not. */
    slab(x - hx, x + hx, 0, 1.04, z - hz, z + hz, body, 'car-hull');
  };
  {
    const R = C.street;
    const zN = R.z + R.half - 1.0, zS = R.z - R.half + 1.0;
    car(-34, zN, 0, mats.carBlue, false);
    car(-19.5, zS, 0, mats.carRust, true);
    // Slewed across the middle, because one of them stopped where it was.
    car(-4.0, R.z + 0.4, 1, mats.carCream, false);
    car(9.0, zN, 0, mats.carGreen, false);
    car(24.0, zS, 0, mats.carRed, true);
    car(38.0, zN, 0, mats.carRust, true);
    // And one halfway down a drive, nose to the house.
    car(C.ranch.x + 6.0, C.ranch.z - C.ranch.d / 2 - 5.0, 1, mats.carCream, false);
  }

  /* ---------------- what is standing on the grass ----------------

     The dressing, and it is most of what makes the place the place: the
     iron benches on their concrete blocks, the whiskey barrel, the plank
     somebody left across the concrete, the young trees each in its own
     mulch ring, the old oaks, the fence runs and the lamps. */
  const bench = (x, z, rot) => {
    const w = 1.5, d = 0.55;
    const ax = rot ? d : w, az = rot ? w : d;
    deco(x - ax / 2, x + ax / 2, 0.42, 0.50, z - az / 2, z + az / 2, mats.ironPaint, 'bench-seat');
    deco(x - ax / 2, x + ax / 2, 0.50, 0.95, z + (rot ? 0 : az / 2 - 0.06), z + (rot ? 0.08 : az / 2), mats.ironPaint, 'bench-back');
    for (const s of [-1, 1]) {
      const bx = rot ? x : x + s * (w / 2 - 0.18), bz = rot ? z + s * (w / 2 - 0.18) : z;
      deco(bx - 0.16, bx + 0.16, 0.10, 0.24, bz - 0.16, bz + 0.16, mats.concrete, 'bench-block');
      deco(bx - 0.05, bx + 0.05, 0.24, 0.44, bz - 0.05, bz + 0.05, mats.ironPaint, 'bench-leg');
    }
  };
  bench(-6.4, -2.2, false);
  bench(-3.6, -2.2, false);
  bench(4.6, -2.2, false);
  bench(-9.2, -4.6, true);

  // The barrel by the head of the ramp.
  {
    const a = game.cylinder({ at: [-4.4, 0.55, -1.5], radius: 0.36, height: 1.1,
      material: mats.barrel, physics: false });
    a.name = 'barrel'; decos.push(a);
  }
  /* The plank propped against the seawall, off the fourth photograph.
     Two and a half metres, not five and a half: at the first length it
     ran from the wall most of the way to the treeline and read as a
     kerb somebody had painted brown. */
  deco(-1.35, -1.05, 0.12, 0.22, -2.9, -0.5, mats.deck, 'plank');
  deco(-0.75, -0.45, 0.12, 0.22, -2.7, -0.4, mats.deck, 'plank');

  /* Young ornamental trees, each in its mulch ring, in the row the
     second photograph has them in. */
  const youngTree = (x, z, h) => {
    const ring = game.cylinder({ at: [x, 0.06, z], radius: 0.95, height: 0.10,
      material: mats.mulch, physics: false });
    ring.name = 'mulch'; decos.push(ring);
    post(x, z, 0, h * 0.50, 0.075, mats.trunk, 'sapling-trunk');
    /* Three overlapping lobes rather than one squashed sphere. A single
       ellipsoid on a stick is a lollipop from every angle; three that
       interpenetrate have a silhouette that changes as you walk round it,
       which is the whole job a background tree has to do. */
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + x * 0.7;
      const c = game.sphere({
        at: [x + Math.cos(ang) * h * 0.13, h * (0.60 + (i % 2) * 0.11), z + Math.sin(ang) * h * 0.13],
        radius: h * (0.25 + (i % 2) * 0.04), material: mats.leaf, physics: false });
      c.name = 'sapling-crown'; c.scale.y *= 0.88; decos.push(c);
    }
  };
  for (let i = 0; i < 7; i++) youngTree(-30 + i * 5.4, -12.5 - (i % 2) * 0.6, 2.6 + (i % 3) * 0.25);

  /* The old trees: live oak, wide and low, and one pine. These are the
     only things on the green tall enough to break the skyline.

     The first version was a trunk and four flat discs floating above the
     top of it -- a gap of most of a metre between the wood and the
     leaves, and every crown the same radius at the same height. Limbs
     now, angled out of the trunk and reaching into the lobes, and the
     lobes start low enough to swallow the fork. */
  const oak = (x, z, h, r) => {
    const forkY = h * 0.38;
    post(x, z, 0, forkY, 0.30, mats.trunk, 'oak-trunk');
    const n = 5;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + x;
      const lean = r * (0.40 + (i % 3) * 0.07);
      const top = h * (0.56 + (i % 3) * 0.10);
      /* The limb: a thin box from the fork out to where the lobe sits.
         It is not a swept branch and does not need to be -- it is the
         thing that stops the canopy from hovering. */
      const lx = x + Math.cos(ang) * lean, lz = z + Math.sin(ang) * lean;
      const limb = game.cylinder({ at: [(x + lx) / 2, (forkY + top) / 2 - 0.3, (z + lz) / 2],
        radius: 0.13, height: Math.hypot(lx - x, top - forkY - 0.6, lz - z),
        rotation: aimY(lx - x, top - forkY - 0.6, lz - z),
        material: mats.trunk, physics: false });
      limb.name = 'oak-limb'; decos.push(limb);
      const c = game.sphere({ at: [lx, top, lz], radius: r * (0.52 + (i % 2) * 0.10),
        material: mats.leaf, physics: false });
      c.name = 'oak-crown'; c.scale.y *= 0.72; decos.push(c);
    }
    // One crown over the middle, so the tree is not a ring with a hole.
    const cap = game.sphere({ at: [x, h * 0.74, z], radius: r * 0.50, material: mats.leaf, physics: false });
    cap.name = 'oak-crown'; cap.scale.y *= 0.66; decos.push(cap);
  };
  oak(-13.5, -6.5, 8.5, 5.2);
  oak(7.0, -9.0, 9.0, 5.8);
  oak(-36.0, -26.0, 8.0, 4.8);
  oak(30.0, -12.0, 8.6, 5.4);
  {
    /* The pine. Tiers, not one cone -- a single cone is a party hat, and
       the thing that makes a conifer read as a conifer at two hundred
       metres is the stepped edge. */
    const x = -5.0, z = -30.0, h = 13.0;
    post(x, z, 0, h * 0.34, 0.24, mats.trunk, 'pine-trunk');
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      const c = game.cone({ at: [x, h * (0.34 + t * 0.46), z],
        radius: 2.9 * (1 - t * 0.62), height: h * 0.30,
        material: mats.leafPine, physics: false });
      c.name = 'pine-crown'; decos.push(c);
    }
  }

  /* Chain-link between the properties: posts and a top rail, which at
     any distance is all a chain-link fence actually reads as. */
  /* Chain-link. SOLID -- every post and rail here was decoration, so the
     whole fence was something you walked through, which is half of "you
     can walk through some things".

     A chain-link fence is drawn as posts, a top rail and a mesh panel;
     the mesh is what stops you, so it gets a thin slab of its own rather
     than being implied by the posts. */
  const fenceRun = (x0, z0, x1, z1, name) => {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz), n = Math.max(2, Math.round(len / 2.5));
    for (let i = 0; i <= n; i++) {
      const px = x0 + (dx * i) / n, pz = z0 + (dz * i) / n;
      const a2 = game.cylinder({ at: [px, 0.68, pz], radius: 0.042, height: 1.36,
        material: mats.galv, static: true });
      a2.name = name || 'fence-post'; solids.push(a2);
    }
    const alongX = Math.abs(dz) < 0.01;
    if (alongX) {
      slab(Math.min(x0, x1), Math.max(x0, x1), 0, 1.30, z0 - 0.04, z0 + 0.04, mats.fenceMesh, 'fence-mesh');
      deco(Math.min(x0, x1), Math.max(x0, x1), 1.30, 1.37, z0 - 0.05, z0 + 0.05, mats.galv, 'fence-rail');
    } else if (Math.abs(dx) < 0.01) {
      slab(x0 - 0.04, x0 + 0.04, 0, 1.30, Math.min(z0, z1), Math.max(z0, z1), mats.fenceMesh, 'fence-mesh');
      deco(x0 - 0.05, x0 + 0.05, 1.30, 1.37, Math.min(z0, z1), Math.max(z0, z1), mats.galv, 'fence-rail');
    }
  };
  // The fences between the properties, inside the map.
  fenceRun(-46, -34.0, -8, -34.0);
  fenceRun(-8, -34.0, -8, -18.0);
  fenceRun(34.0, -34.0, 46, -34.0);

  /* ---------------- THE EDGE OF THE WORLD ----------------

     You could walk off this map for ever. It is a lawn with a fence
     across part of the back of it and nothing at all down the sides, so
     the map simply stopped being built and you kept going.

     An invisible wall would do the job and would be a lie: you would walk
     into nothing and stand there pushing at air. The place already has a
     vocabulary for its own edges -- chain-link between the properties,
     and a treeline behind them -- so the boundary is more of that: a
     taller fence right round the three landward sides, with trees packed
     behind it so there is visibly nothing on the other side worth
     reaching. You can see out. You cannot go out. That is a boundary a
     player accepts, because it is the reason a real garden ends. */
  const G = C.green;
  const EDGE = { x0: G.x0 - 1.5, x1: G.x1 + 1.5, z0: G.z0 - 1.5 };
  const boundary = (x0, z0, x1, z1) => {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz), n = Math.max(2, Math.round(len / 3.0));
    for (let i = 0; i <= n; i++) {
      const px = x0 + (dx * i) / n, pz = z0 + (dz * i) / n;
      const a2 = game.cylinder({ at: [px, 1.05, pz], radius: 0.055, height: 2.10,
        material: mats.galv, static: true });
      a2.name = 'edge-post'; solids.push(a2);
    }
    const alongX = Math.abs(dz) < 0.01;
    /* Two metres, and taller than the step height by a wide margin: a
       boundary you can vault is not one. */
    if (alongX) {
      slab(Math.min(x0, x1), Math.max(x0, x1), 0, 2.05, z0 - 0.05, z0 + 0.05, mats.fenceMesh, 'edge-mesh');
      deco(Math.min(x0, x1), Math.max(x0, x1), 2.05, 2.14, z0 - 0.06, z0 + 0.06, mats.galv, 'edge-rail');
    } else {
      slab(x0 - 0.05, x0 + 0.05, 0, 2.05, Math.min(z0, z1), Math.max(z0, z1), mats.fenceMesh, 'edge-mesh');
      deco(x0 - 0.06, x0 + 0.06, 2.05, 2.14, Math.min(z0, z1), Math.max(z0, z1), mats.galv, 'edge-rail');
    }
  };
  boundary(EDGE.x0, EDGE.z0, EDGE.x1, EDGE.z0);          // the back
  boundary(EDGE.x0, EDGE.z0, EDGE.x0, 0.4);              // the west side
  boundary(EDGE.x1, EDGE.z0, EDGE.x1, 0.4);              // the east side

  /* And the trees behind it. Packed close, so the fence is the edge of a
     wood rather than the edge of a model. */
  {
    const wood = [];
    for (let x = EDGE.x0 - 1; x <= EDGE.x1 + 1; x += 4.2) {
      for (let r = 0; r < 3; r++) wood.push([x + ((r * 7 + x) % 5) * 0.6, EDGE.z0 - 2.5 - r * 4.0]);
    }
    for (let z = EDGE.z0; z <= -2; z += 4.4) {
      for (let r = 0; r < 3; r++) {
        wood.push([EDGE.x0 - 2.5 - r * 4.0, z + ((r * 5 + z) % 5) * 0.6]);
        wood.push([EDGE.x1 + 2.5 + r * 4.0, z + ((r * 3 + z) % 5) * 0.6]);
      }
    }
    wood.forEach(([x, z], i) => {
      const h = 7.5 + ((i * 29) % 9) * 0.8;
      post(x, z, 0, h * 0.42, 0.20, mats.trunk, 'wood-trunk');
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2 + i;
        const c = game.sphere({
          at: [x + Math.cos(ang) * h * 0.14, h * (0.58 + (k % 2) * 0.13), z + Math.sin(ang) * h * 0.14],
          radius: h * 0.27, material: mats.leafWood, physics: false });
        c.name = 'wood-crown'; c.scale.y *= 0.86; decos.push(c);
      }
    });
  }

  /* ---------------- the bottom of the lake ----------------

     The ramp runs down into the water and then the world ran out: the
     ground plane stops at the seawall, the lake is decoration with no
     collision, and a player who walked down the ramp fell through
     everything. A lake needs a bed.

     It shelves, the way a lake does, and then there is a wall of it: at
     about chest depth the bed turns up into a bank you cannot climb,
     which is what stops you wading to the far shore. Swimming is a
     different job -- Coastline's Pack-a-Punch needs a real underwater
     state -- and this is the floor it will be built on. */
  {
    const bedTop = C.water.y - 0.55;
    /* HOW WIDE. Measured: at 520 m across, a body dropped into the
       shallows at z 10 fell straight THROUGH the bed and kept going --
       six and a half metres in two seconds, into nothing. These are
       static boxes and they should have stopped it. Narrowed to 180 m,
       which is still forty metres past the boundary fence on either side
       and well past anywhere a player can reach, and the same drop lands.
       A collision box the size of a small town is not a collision box. */
    const BW = 90;
    for (let i = 0; i < 9; i++) {
      const z0 = i === 0 ? -1.0 : 1.0 + (i - 1) * 5.0;
      const z1 = 1.0 + i * 5.0;
      const y = bedTop - i * 0.22;
      slab(-BW, BW, y - 1.2, y, z0, z1, mats.bed, 'lake-bed-' + i);
    }
    /* AND A FLOOR UNDER THE REST OF IT.
    
       Past the bank the lake had no bottom at all -- a downward raycast
       from z 48 out to the horizon hit nothing. A swimmer floats on the
       swim code rather than on anything solid, so it went unnoticed until
       somebody swam far enough out for waterAt to stop answering, at
       which point gravity came back with nothing under it: "your
       character falls through an endless void once when they try to go
       through the water". There is a bed out there now, deep enough to
       be a lake and shallow enough to be a floor. */
    slab(-BW, BW, C.water.y - 9.0, C.water.y - 6.0, 42.5, 150, mats.bed, 'lake-deep');
    /* AND THE LAKE HAS TO END SOMEWHERE.
    
       Extending the floor is not enough on its own: waterAt claimed water
       for 260 metres in every direction, which is far more lake than
       there is bed, so a swimmer who kept going simply ran out of map and
       fell. The two have to agree, and the honest way to make them agree
       is not a bigger floor -- it is a shore.
    
       So the far bank and the two side banks, rising out of the water the
       way the near bank does not: eight metres of bed to climb from the
       water side, which nothing can. From the middle of the lake they
       read as the opposite shore, which is what they are. waterAt is
       brought in to match them, so there is no water anywhere without a
       bed under it. */
    /* The banks sit INSIDE the bed rather than flush with its edge.
    
       Flush, each bank's outer face and the bed's outer face are the same
       plane -- twelve pairs of them, six square metres each -- and two
       coplanar faces z-fight. The check caught it; from the water it
       would have been a band of flicker along the far edge of the lake. */
    /* And the three banks must not line up with each other either.
    
       Tucking them inside the bed fixed twelve pairs and created two
       more, where the far bank met the side banks at the corners: same
       top, same end face, twenty-one square metres of it. Two boxes that
       meet cleanly at a corner ALWAYS share a plane.
    
       So they overlap instead, and at different heights. The far bank
       runs a little taller and reaches past where the side banks stop, so
       every face either side is interior to the other -- nothing
       coincides, and a corner you swim into is solid either way. */
    slab(-(BW - 4), BW - 4, C.water.y - 9.0, C.water.y + 1.8, 139, 146, mats.bed, 'lake-far-bank');
    for (const sx of [-1, 1]) {
      slab(sx * (BW - 6), sx * (BW - 2), C.water.y - 9.0, C.water.y + 1.6, 0, 144,
        mats.bed, 'lake-side-bank');
    }
    /* The bank: past it the bottom drops away and you cannot wade on.
    
       At z 31 it went straight THROUGH the pier and the boathouse -- a
       bank that spans every x at nearly two metres above the waterline
       does not care what is standing there, and the route check caught it
       as a 0.70 m step in the middle of the walk to the MG 42. Out past
       the end of the pier (34) it can be as tall as it likes. */
    /* Under the surface, not standing out of it.
    
       Built 1.6 m proud of the water it read as a wall across the lake --
       a grey bar between you and the far shore, in the one direction this
       map is meant to open out in. Its job is only to be taller than a
       body can step, measured from the bed it stands on, and the bed out
       there is a metre and a half down: a wall whose top is just under
       the surface is already two metres of rise. You cannot wade past it
       and you cannot see it. */
    slab(-BW, BW, C.water.y - 3.0, C.water.y - 0.05, 40.0, 42.5, mats.bed, 'lake-bank');
  }

  /* The lamps along the seawall. Warm, low and few -- at dusk they are
     the only made light on the map, and they are what the water picks
     up once the horizon band has gone. */
  for (const x of [-30, -18, -6, 6, 18, 30]) {
    post(x, -2.6, 0, 3.3, 0.06, mats.galv, 'lamp-post');
    const head = game.sphere({ at: [x, 3.4, -2.6], radius: 0.17,
      material: { color: 0xffd9a0, texture: 'smooth', roughness: 0.5, metalness: 0,
        emissive: 0xffc070, emissiveStrength: 2.4 }, physics: false });
    head.name = 'lamp'; decos.push(head);
    game.light({ at: [x, 3.3, -2.6], color: 0xffc484, intensity: 9, radius: 13 });
  }
  // One more inside each building, so an interior is not a cave.
  game.light({ at: [C.ranch.x, 2.5, C.ranch.z], color: 0xffd2a0, intensity: 10, radius: 14 });
  game.light({ at: [C.twoStorey.x, 2.4, C.twoStorey.z], color: 0xffd2a0, intensity: 10, radius: 14 });
  game.light({ at: [C.twoStorey.x, 5.4, C.twoStorey.z], color: 0xffd2a0, intensity: 8, radius: 12 });
  game.light({ at: [C.pier.x, C.pier.deckY + 2.6, C.pavilion.z], color: 0xffc484, intensity: 8, radius: 12 });

  /* ---------------- the Pack-a-Punch, and the dock it took down ----------
  
     The flamingo is on the bottom and the decking above it is GONE --
     not decoration showing damage, actually absent, with its broken ends
     left either side and a couple of planks in the water. That gap is how
     the machine is found: you walk out along the pier, the boards stop,
     and there is something pink moving about two metres under you. */
  {
    const fl = buildFlamingo(game, mats, decos, PAP.at);
    if (S) S.papFlamingo = fl;
    // The wreckage: the torn ends of the run that fell in.
    for (const side of [-1, 1]) {
      const z = side < 0 ? PAP.breaks.z0 : PAP.breaks.z1;
      deco(PAP.breaks.x0 - 0.1, PAP.breaks.x1 + 0.1, C.pier.deckY - 0.16, C.pier.deckY - 0.02,
        z - 0.12, z + 0.12, mats.deckLong, 'pier-broken-end');
    }
    // And boards in the water under it, at the angles boards end up at.
    for (let i = 0; i < 5; i++) {
      const a = (i * 37) % 60 - 30;
      const bx = PAP.at[0] - 1.6 + (i % 3) * 1.3, bz = PAP.at[2] - 1.2 + ((i * 5) % 4) * 1.1;
      const pl = game.box({ at: [bx, C.water.y - 1.42 - (i % 2) * 0.1, bz],
        size: [0.22, 0.06, 2.1 + (i % 2) * 0.7], material: mats.deckLong, physics: false });
      pl.name = 'sunk-plank';
      pl.setRotation([(i % 2) ? 8 : -6, a, (i % 3) * 4 - 4]);
      decos.push(pl);
    }
  }

  /* ---------------- the way out ----------------

     A jerry can on a worktop and a boat at the end of a broken pier.
     Neither is announced and neither is marked; the can is the only
     object in any of these kitchens that is not furniture, and the boat
     is the only thing moored anywhere on the map. */
  if (S) {
    const K = ESCAPE.can.at;
    const canParts = [];
    // The can itself: a pressed steel body with the three ribs a jerry
    // can has, an X on the flank, a spout and a handle across the top.
    canParts.push(deco(K[0] - 0.17, K[0] + 0.17, K[1], K[1] + 0.44, K[2] - 0.08, K[2] + 0.08,
      mats.ironPaint, 'gas-can'));
    for (const dx of [-0.09, 0, 0.09]) {
      canParts.push(deco(K[0] + dx - 0.018, K[0] + dx + 0.018, K[1] + 0.04, K[1] + 0.40,
        K[2] - 0.092, K[2] + 0.092, mats.steelDark, 'gas-can-rib'));
    }
    canParts.push(deco(K[0] + 0.05, K[0] + 0.14, K[1] + 0.40, K[1] + 0.50,
      K[2] - 0.045, K[2] + 0.045, mats.steelDark, 'gas-can-spout'));
    canParts.push(deco(K[0] - 0.15, K[0] + 0.02, K[1] + 0.46, K[1] + 0.50,
      K[2] - 0.03, K[2] + 0.03, mats.steelDark, 'gas-can-handle'));
    S.escapeCan = { at: K.slice(), parts: canParts.filter(Boolean) };

    /* The boat. Same builder as the two already on the map, so it is
       recognisably one of them and not a special object with a glow on
       it -- what makes it the way out is where it is, not how it looks. */
    const B = ESCAPE.boat.at;
    boat(B[0], B[1], B[2], 4.8, 1.9, mats.white, true);
    // A cleat and a line to the boathouse piling, so it is moored.
    deco(B[0] - 0.06, B[0] + 0.06, C.pier.deckY - 0.02, C.pier.deckY + 0.10,
      B[2] + 1.9, B[2] + 2.1, mats.galv, 'boat-cleat');
    deco(B[0] - 0.02, B[0] + 0.02, B[1] + 0.26, C.pier.deckY + 0.04,
      B[2] + 1.4, B[2] + 2.0, mats.steelDark, 'boat-line');
    S.escapeBoat = { at: B.slice() };
  }

  if (S) { S.coastSolids = solids; S.coastDecor = decos; }
  return { solids, decos };

}

/* Sky and exposure for the map. Kept apart from build() so a harness can
   frame a shot without lighting it differently from the game.

   The engine's entry point for this is setSky(preset, overrides) -- there
   is no scene() -- and every field below is an override on 'day'. */
function applySky(game) {
  game.setSky('day', {
    zenith: SKY.zenith, horizon: SKY.horizon, ground: SKY.ground,
    sun: SKY.sun, sunColor: SKY.sunColor, sunIntensity: SKY.sunIntensity,
    exposure: SKY.exposure, clouds: SKY.clouds, room: SKY.room,
    fog: SKY.fog, fogDensity: SKY.fogDensity,
  });
  game.renderer.sky.intensity = SKY.intensity;
  game.renderer.post.vignette = 0.22;
  game.renderer.post.grain = 0.018;
}

/* How deep the water is at a point, or null if there is none.

   The game asks this of whichever map is loaded so that a body over water
   can swim rather than trudge along the bottom. It has to agree with the
   bed that build() lays down -- the bed shelves in five-metre steps from
   the seawall out, so this is the same arithmetic read the other way. */
function waterAt(x, z) {
  /* The water stops where the bed does.
  
     This said 260 metres in every direction, and the bed reached about
     forty. Everywhere in between the game believed you were swimming and
     the swim code held you up -- so it looked fine -- right up to the
     moment you passed 260, where the water stopped, gravity came back and
     there was nothing at all underneath: "your character falls through an
     endless void once when they try to go through the water". Measured at
     z 300: forty-two metres in two seconds and still going.
  
     These numbers are the banks in build(), one metre inside them. There
     is no water anywhere without a bed under it now, and the banks stop
     you before you reach the edge of either. */
  if (z < 0.2 || z > 137) return null;
  if (Math.abs(x) > 83) return null;
  const bedTop = C.water.y - 0.55;
  // Which shelf step this is on; step 0 runs from the wall out to z = 1.
  const i = z <= 1.0 ? 0 : Math.min(8, Math.floor((z - 1.0) / 5.0) + 1);
  const bed = bedTop - i * 0.22;
  return { surface: C.water.y, bed };
}

/* The finish a gun comes out of the flamingo wearing.

   Baby blue, with floaties drifting across it -- ducks, flamingos,
   rings, whatever else is in a lake at the end of summer. The engine has
   no decal system and no scrolling UV, so "reactive" here is what can
   honestly be built: an emissive that breathes, over a pale blue that
   shifts toward the water's own colour as the light moves. It reads as a
   pool-toy finish rather than as a camouflage pattern, which is the
   point of it.

   This said, for a while, that the individual floaties could not be
   drawn -- that a texture bank generating its patterns procedurally
   cannot be handed a picture of a rubber duck. That was true of the
   recipes that existed and false of the bank: a recipe is a function of
   one texel, and nothing stops it being a function that evaluates seven
   placed shapes and asks whether this texel is inside one. Ducks are two
   circles and a wedge; flamingos are a circle, an arc and a beak; rings
   are one circle minus another. So they are drawn, in
   engine/src/40-material.js under `floaties`, and they are on the gun.

   The tint stays near white on purpose. The recipe carries its own
   colour -- the blue of the water and the colours of the toys -- and a
   material tint MULTIPLIES it, so a baby-blue tint over a baby-blue
   recipe is navy with the pattern lost in it. That mistake cost two
   passes on this map's ground already. */
const CAMO = {
  color: 0xf2fbff, texture: 'floaties', roughness: 0.24, metalness: 0.08,
  emissive: 0x2fa8d8, emissiveStrength: 0.30, subsurface: 0.25,
  // Small enough that a whole toy fits on a receiver flat rather than
  // one duck being stretched the length of a barrel.
  uvScale: 6.5,
};

window.COASTLINE = {
  id: 'coastline', name: 'Coastline',
  C, MAP, WINDOWS, DOORS, MAT, SKY, PLAY, LINES, PAP, CAMO, ESCAPE, build, applySky, waterAt,
  /* Where you start: on the walk, a little up the lawn from the water,
     looking down it -- the view the fourth photograph is taken from. */
  spawn: { at: [0, 1.2, -16.0], yaw: 0 },
};
})();
