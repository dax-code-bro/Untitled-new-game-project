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
  /* Faintly COOL, which looks wrong in the source and is right on the
     wall: the brick recipe averages #80493b, so a warm tint on top of it
     gave a fire engine. This lands near a muted brick brown. */
  brick: { color: 0xb4b4ae, texture: 'brick', roughness: 0.93, metalness: 0, uvScale: 2.6 },
  brickPale: { color: 0xcfcdc4, texture: 'brick', roughness: 0.93, metalness: 0, uvScale: 2.6 },
  shingle: { color: 0x6f6158, texture: 'concrete', roughness: 0.95, metalness: 0, uvScale: 6 },
  /* The pavilion roof is the one strong colour on the whole map. */
  roofOrange: { color: 0xd07a42, texture: 'concrete', roughness: 0.9, metalness: 0, uvScale: 5 },
  roofBrown: { color: 0x8a6b4e, texture: 'wood', roughness: 0.9, metalness: 0, uvScale: 4 },
  /* Deck boards. uvScale 5 and not 18: on a swept or stretched face a
     high tile count wraps the grain into diagonal banding, which is the
     barber's pole the gun stocks had. */
  deck: { color: 0xa08464, texture: 'wood', roughness: 0.9, metalness: 0, uvScale: 1.3 },
  white: { color: 0xdcd8cc, texture: 'smooth', roughness: 0.8, metalness: 0 },
  canvas: { color: 0xd8d2c0, texture: 'fabric', roughness: 0.96, metalness: 0, uvScale: 3 },
  glass: { color: 0x2e3a42, texture: 'smooth', roughness: 0.18, metalness: 0 },
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
  water: { color: 0x223028, texture: 'smooth', roughness: 0.34, metalness: 0 },
  /* The far half of the lake, flatter still, so the sheet does not read
     as one uniform value all the way to the bank. */
  waterFar: { color: 0x293430, texture: 'smooth', roughness: 0.44, metalness: 0 },
  /* The treeline on the far bank. Pale and low-contrast on purpose: at a
     hundred and fifty metres through haze, a saturated green reads as a
     hedge thirty metres away, which collapses the whole distance. */
  farTree: { color: 0x8e9c86, texture: 'grass', roughness: 0.98, metalness: 0, uvScale: 4 },
  shore: { color: 0x8e9086, texture: 'concrete', roughness: 0.98, metalness: 0, uvScale: 20 },
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

/* Where the dead come from. Out of the lake, and in off the treeline
   behind the houses -- the two directions the place is open from. The
   ramp is the obvious one and the seawall ladder is the one people
   forget about. */
const WINDOWS = [
  { id: 'CR', room: 'green', inside: [0.1, 0, -3.4], sillAt: [0.1, 0.7, 1.2], pad: [0.4, 0, 26.0], face: 'S', wx: [-3.2, 3.4] },
  { id: 'CL', room: 'green', inside: [-14.0, 0, -2.6], sillAt: [-14.0, 1.0, 0.2], pad: [-15.0, 0, 22.0], face: 'S', wx: [-15.4, -12.6] },
  { id: 'CP', room: 'green', inside: [C.pier.x, 0, -2.6], sillAt: [C.pier.x, 1.0, 0.2], pad: [C.pier.x + 1, 0, 30.0], face: 'S', wx: [C.pier.x - 1.4, C.pier.x + 1.4] },
  { id: 'CW', room: 'green', inside: [-34.0, 0, -18.0], sillAt: [-38.0, 1.0, -18.0], pad: [-62.0, 0, -20.0], face: 'W', wz: [-19.4, -16.6] },
  { id: 'CE', room: 'green', inside: [32.0, 0, -20.0], sillAt: [36.0, 1.0, -20.0], pad: [60.0, 0, -24.0], face: 'E', wz: [-21.4, -18.6] },
];

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
  game.ground({ at: [0, 0, -128], material: { ...MAT.grass, uvScale: 1 },
    size: 260, uvScale: 0.62, segments: 40 });

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
    post(x, z, C.water.y - 0.2, C.water.y + 0.45 + ((i * 31) % 7) * 0.09, 0.075, mats.trunk, 'dead-piling');
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
    const steps = 14, top = SW.capY, bot = C.water.y - 1.05;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const y = top + (bot - top) * t;
      const z0 = -1.2 + i * 0.85, z1 = z0 + 0.95;
      slab(rampGap[0], rampGap[1], y - 0.30, y, z0, z1, mats.concreteWet, 'ramp-' + i);
    }
    // The low kerb down each side of the ramp.
    deco(rampGap[0] - 0.30, rampGap[0], 0, SW.capY, -1.2, 5.0, mats.concrete, 'ramp-kerb-w');
    deco(rampGap[1], rampGap[1] + 0.30, 0, SW.capY, -1.2, 5.0, mats.concrete, 'ramp-kerb-e');
  }

  /* The walk. It comes down the lawn, widens at the water and turns to
     run along behind the wall -- which is exactly the shape of the
     concrete in the fourth photograph, and it is what gives the seawall
     a fighting platform instead of a kerb. */
  slab(-9.5, 9.5, 0, 0.12, -9.0, -SW.thick, mats.concrete, 'apron');
  slab(-2.4, 2.4, 0, 0.12, -30.0, -9.0, mats.concrete, 'walk');
  slab(SW.x0 + 2, SW.x1 - 2, 0, 0.12, -3.4, -SW.thick, mats.concrete, 'wall-walk');

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
  slab(P.x - P.halfW, P.x + P.halfW, P.deckY - 0.14, P.deckY, -0.4, P.z1, mats.deck, 'pier-deck');
  // Handrail both sides, the whole length.
  for (const s of [-1, 1]) {
    const x = P.x + s * (P.halfW - 0.08);
    deco(x - 0.05, x + 0.05, P.deckY + 0.92, P.deckY + 1.00, -0.4, P.z1, mats.galv, 'pier-rail');
    deco(x - 0.04, x + 0.04, P.deckY + 0.46, P.deckY + 0.52, -0.4, P.z1, mats.galv, 'pier-rail-mid');
    for (let z = 0.2; z <= P.z1; z += 2.2) post(x, z, P.deckY, P.deckY + 1.0, 0.045, mats.galv, 'pier-stanchion');
  }

  /* The pavilion: open on all four sides, rails between the posts, and
     the orange pyramid roof that is the only strong colour out here. */
  {
    const V = C.pavilion, h = V.half;
    slab(P.x - h, P.x + h, P.deckY - 0.16, P.deckY, V.z - h, V.z + h, mats.deck, 'pavilion-deck');
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
    slab(P.x - h, P.x - 1.0, P.deckY - 0.16, P.deckY, B.z - h, B.z + h, mats.deck, 'boathouse-deck-w');
    slab(P.x + 1.0, P.x + h, P.deckY - 0.16, P.deckY, B.z - h, B.z + h, mats.deck, 'boathouse-deck-e');
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
    hipRoof(L.x, L.z, L.halfX + 0.5, L.halfZ + 0.5, L.eaves, L.peak, mats.white, 'slip-roof', 5);
    // Catwalks down each side, and the lift frame between them.
    slab(L.x - L.halfX, L.x - L.halfX + 0.9, C.water.y + 0.75, C.water.y + 0.90, L.z - L.halfZ, L.z + L.halfZ, mats.deck, 'slip-walk-w');
    slab(L.x + L.halfX - 0.9, L.x + L.halfX, C.water.y + 0.75, C.water.y + 0.90, L.z - L.halfZ, L.z + L.halfZ, mats.deck, 'slip-walk-e');
    // The boat, under its cover. Hull, then the canvas over it.
    deco(L.x - 1.5, L.x + 1.5, C.water.y + 0.55, C.water.y + 1.35, L.z - 3.1, L.z + 3.1, mats.white, 'slip-boat');
    deco(L.x - 1.7, L.x + 1.7, C.water.y + 1.30, C.water.y + 1.95, L.z - 3.3, L.z + 3.3, mats.canvas, 'slip-cover');
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
  const houseShell = (h, wallMat, roofMat, tall) => {
    const x0 = h.x - h.w / 2, x1 = h.x + h.w / 2;
    const z0 = h.z - h.d / 2, z1 = h.z + h.d / 2;
    const T = 0.30;
    const F = z1;                       // the front: the face toward the water
    // Four walls, with the doorway in the lake-facing side.
    slab(x0, x1, 0, h.wall, z0, z0 + T, wallMat, 'house-back');
    slab(x0, x0 + T, 0, h.wall, z0, z1, wallMat, 'house-w');
    slab(x1 - T, x1, 0, h.wall, z0, z1, wallMat, 'house-e');
    slab(x0, h.x - 1.3, 0, h.wall, F - T, F, wallMat, 'house-front-1');
    slab(h.x + 1.3, x1, 0, h.wall, F - T, F, wallMat, 'house-front-2');
    slab(h.x - 1.3, h.x + 1.3, 2.25, h.wall, F - T, F, wallMat, 'house-front-head');
    slab(x0, x1, -0.05, 0.10, z0, z1, mats.concrete, 'house-floor');
    if (tall) {
      // A first floor, and the hole in it that the stair comes up.
      slab(x0, h.x + 1.2, 3.05, 3.25, z0, z1, mats.deck, 'house-upper-w');
      slab(h.x + 1.2, x1, 3.05, 3.25, z0 + 3.2, z1, mats.deck, 'house-upper-e');
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
    slab(K.x - 1.6, K.x + 1.6, 0.55, 1.45, K.z - 2.9, K.z + 2.9, mats.white, 'carport-boat');
    deco(K.x - 1.3, K.x + 1.3, 1.42, 1.62, K.z - 2.2, K.z + 1.4, mats.glass, 'carport-boat-screen');
    for (const dz of [-1.6, 0.4]) post(K.x - 1.0, K.z + dz, 0, 0.5, 0.16, mats.steelDark, 'trailer-wheel');
  }

  /* ---------------- what is standing on the grass ----------------

     The dressing, and it is most of what makes the place the place: the
     iron benches on their concrete blocks, the whiskey barrel, the plank
     somebody left across the concrete, the young trees each in its own
     mulch ring, the old oaks, the fence runs and the lamps. */
  const bench = (x, z, rot) => {
    const w = 1.5, d = 0.55;
    const ax = rot ? d : w, az = rot ? w : d;
    deco(x - ax / 2, x + ax / 2, 0.42, 0.50, z - az / 2, z + az / 2, mats.steelDark, 'bench-seat');
    deco(x - ax / 2, x + ax / 2, 0.50, 0.95, z + (rot ? 0 : az / 2 - 0.06), z + (rot ? 0.08 : az / 2), mats.steelDark, 'bench-back');
    for (const s of [-1, 1]) {
      const bx = rot ? x : x + s * (w / 2 - 0.18), bz = rot ? z + s * (w / 2 - 0.18) : z;
      deco(bx - 0.16, bx + 0.16, 0.10, 0.24, bz - 0.16, bz + 0.16, mats.concrete, 'bench-block');
      deco(bx - 0.05, bx + 0.05, 0.24, 0.44, bz - 0.05, bz + 0.05, mats.steelDark, 'bench-leg');
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
  // And the plank lying across the concrete.
  deco(-1.2, -0.9, 0.12, 0.20, -6.5, -1.0, mats.deck, 'plank');

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
  const fenceRun = (x0, z0, x1, z1) => {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz), n = Math.max(2, Math.round(len / 2.5));
    for (let i = 0; i <= n; i++) {
      post(x0 + (dx * i) / n, z0 + (dz * i) / n, 0, 1.35, 0.035, mats.galv, 'fence-post');
    }
    if (Math.abs(dz) < 0.01) deco(Math.min(x0, x1), Math.max(x0, x1), 1.28, 1.34, z0 - 0.03, z0 + 0.03, mats.galv, 'fence-rail');
    else if (Math.abs(dx) < 0.01) deco(x0 - 0.03, x0 + 0.03, 1.28, 1.34, Math.min(z0, z1), Math.max(z0, z1), mats.galv, 'fence-rail');
  };
  fenceRun(-46, -34.0, -8, -34.0);
  fenceRun(-8, -34.0, -8, -18.0);
  fenceRun(34.0, -34.0, 46, -34.0);

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

window.COASTLINE = {
  id: 'coastline', name: 'Coastline',
  C, MAP, WINDOWS, MAT, SKY, build, applySky,
  /* Where you start: on the walk, a little up the lawn from the water,
     looking down it -- the view the fourth photograph is taken from. */
  spawn: { at: [0, 1.2, -16.0], yaw: 0 },
};
})();
