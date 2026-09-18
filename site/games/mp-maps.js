/* ==================================================================
   MULTIPLAYER MAPS
   ==================================================================
   Helipad, Resort, Town and Demolition, built here rather than
   described. mp-data.js says what they are; this puts them on the
   ground.

   THE SHAPE ALL FOUR SHARE

   Three lanes, every one of them. It is not a lack of imagination --
   it is the only layout that makes a six-a-side match readable. With
   three lanes you can always be flanked from exactly one side, and you
   always know which one, so being killed from behind is a mistake you
   made rather than a thing that happened to you. Two lanes is a
   corridor; four is a map where nobody ever knows where anybody is.

   The lanes run along Z. Team A spawns at the far -Z end, Team B at
   the far +Z end, and the three lanes are strips of X:

       x < -18      the left lane
       -18..18      the middle
       x > 18       the right lane

   Each map breaks that rule somewhere on purpose, and the place it
   breaks it is the thing that makes it that map rather than a grid.

   COVER, AND WHAT IT IS FOR

   Three heights and each one means something:

       0.95 m   crouch behind it, shoot over it standing
       1.30 m   vault it -- head and shoulders over the top
       2.20 m   solid; it is a wall

   Anything between those reads as a mistake to a player: you go to
   vault and bounce, or you crouch and are still visible. The kit only
   builds at the three heights, and `COVER` names them so a number
   never gets typed in by hand.

   SOLID AND DECORATION

   Same rule as Coastline. Anything you can reach the edge of collides.
   Anything past the boundary, or above head height and out of reach,
   does not -- a body that snags on scenery it can never touch is a
   body stuck out of play for the rest of the round.
   ================================================================== */

(function () {
  'use strict';

  var W = window;

  var COVER = { low: 0.95, vault: 1.30, wall: 2.20, storey: 3.40 };

  /* ---------------- materials ----------------
     Every recipe carries its own colour, so these tints run near white
     wherever the recipe is already the right colour and only pull it
     where it is not. */
  /* A TEXTURE RECIPE CARRIES ITS OWN COLOUR, AND uvScale IS PER FACE.
   *
     Both of those bit, and both showed in a render rather than in an
     assertion.

     The brick recipe bakes to about #80493b -- a dark red-brown. So
     "brickPale", tinted 0xe6ded2 to make a cream hotel, came out at
     about #74413a: a nearly black wall with red static on it. A pale
     surface cannot be made out of a dark recipe by tinting, because a
     tint only ever multiplies DOWN. Anything meant to read pale is
     built on smooth (#ffffff) or concrete (#bebbb3) instead, and the
     brick recipe is used for the one thing it actually is.

     Measured, so nobody has to guess again:
       concrete #bebbb3   brick #80493b   wood #d0c0ac   metal #a3a5aa
       rust     #a99388   rock  #7d7a73   grass #265718  dirt #d0cbc3
       sand     #bab3a6   fabric #e0e2e7  smooth #ffffff tile #a8acaf

     AND uvScale USED TO BE TILES ACROSS A FACE, not tiles per metre,
     because a box mesh is a unit cube whose UVs run 0..1 however big
     the thing is scaled to be. At 5, a 116-metre terrace slab was
     tiled in twenty-three metre squares -- Resort's floor as a white
     waffle -- while a two-metre crate on the same material got half-
     metre squares. The workaround was the `wide` set: a second copy of
     each material carrying a uvScale in the thirties.

     It was a workaround and it only ever covered the surfaces somebody
     remembered to move onto it. Anything in between -- a twelve-metre
     hotel wall, a nine-metre hangar door, a four-metre roof -- kept
     the small-object number and came out smeared, which is exactly the
     report that a wall beside a detailed one looks "like maths".

     So every material here now sets `worldUv` and uvScale is TILES PER
     METRE. The texture is projected from world space down the
     surface's dominant axis, so a crate, a wall and a runway carry the
     same grain, a slab that is twelve metres one way and three the
     other is no longer stretched four to one, and there is no size a
     surface can be that gets it wrong. The numbers below are the
     physical size of one repeat of each recipe: brick at 1.11 is a
     0.9-metre tile, which is four bricks across by twelve courses
     down -- a 225 x 75 millimetre brick, the real one; wood at 0.9 is
     six boards in 1.1 metres, so a 185-millimetre board. */
  var MAT = {
    /* Asphalt is the one surface that IS meant to be dark, so it keeps
       a tint below the others -- but 0x7a7772 on a recipe that bakes
       to #bebbb3 is a road that disappears the moment it is not in
       direct sun, and a road you cannot see is a lane you cannot
       read. 0xa8a5a0 is still plainly darker than the pavement beside
       it and still there in shadow. */
    asphalt: { color: 0xa8a5a0, texture: 'concrete', roughness: 0.96, metalness: 0, uvScale: 0.4, worldUv: true },
    concrete: { color: 0xe6e2da, texture: 'concrete', roughness: 0.93, metalness: 0, uvScale: 0.5, normalStrength: 0.4, worldUv: true },
    concretePale: { color: 0xf4f0e8, texture: 'concrete', roughness: 0.90, metalness: 0, uvScale: 0.5, worldUv: true },
    kerb: { color: 0xeeeae2, texture: 'concrete', roughness: 0.88, metalness: 0, uvScale: 1, worldUv: true },
    /* Red brick, and the recipe is already red: the tint runs near
       white so the wall is not pulled darker still. */
    brick: { color: 0xf2ece4, texture: 'brick', roughness: 0.95, metalness: 0, uvScale: 1.11, worldUv: true },
    /* Cream render over brick, and plain render. BOTH USED TO BE BUILT
       ON `smooth`, which is a recipe that writes one constant: no
       albedo variation, no relief, no roughness break. The reasoning
       was sound as far as it went -- the brick recipe is too dark to be
       tinted pale -- but the conclusion was a thirty-metre hotel wall
       rendered as a single flat fill, which is the surface the report
       about walls that look "just like maths" was actually standing in
       front of. It was never the tiling on that wall. There was
       nothing on it to tile.

       There is a real plaster recipe now: float sweep, suction mottle,
       grit and blowholes, baking near 0.90 white so a pale tint still
       lands pale. The hexes are lifted a touch to pay for the 10 per
       cent the recipe costs against a flat 1.0. */
    brickPale: { color: 0xe2d8c4, texture: 'plaster', roughness: 0.93, metalness: 0, uvScale: 0.5, worldUv: true },
    plaster: { color: 0xf0e9d8, texture: 'plaster', roughness: 0.94, metalness: 0, uvScale: 0.5, worldUv: true },
    wood: { color: 0xb49a7c, texture: 'wood', roughness: 0.94, metalness: 0, uvScale: 0.9, worldUv: true },
    woodDark: { color: 0x7a6650, texture: 'wood', roughness: 0.95, metalness: 0, uvScale: 0.9, worldUv: true },
    steel: { color: 0xd0d6da, texture: 'metal', roughness: 0.54, metalness: 1, uvScale: 0.67, worldUv: true },
    steelDark: { color: 0x9aa2a8, texture: 'metal', roughness: 0.62, metalness: 1, uvScale: 0.67, worldUv: true },
    paintGreen: { color: 0x59654f, texture: 'metal', roughness: 0.74, metalness: 0, uvScale: 0.55, worldUv: true },
    paintRed: { color: 0xa8493c, texture: 'metal', roughness: 0.76, metalness: 0, uvScale: 0.55, worldUv: true },
    paintBlue: { color: 0x45596b, texture: 'metal', roughness: 0.76, metalness: 0, uvScale: 0.55, worldUv: true },
    rust: { color: 0xe4c8a8, texture: 'rust', roughness: 0.88, metalness: 0.28, uvScale: 0.85, worldUv: true },
    glass: { color: 0xa8c4cc, texture: 'smooth', roughness: 0.12, metalness: 0.1, opacity: 0.32, uvScale: 0.5, worldUv: true },
    grass: { color: 0xc4d4b0, texture: 'grass', roughness: 0.97, metalness: 0, uvScale: 0.67, subsurface: 0.3, worldUv: true },
    dirt: { color: 0xa89f92, texture: 'dirt', roughness: 0.98, metalness: 0, uvScale: 0.5, worldUv: true },
    sand: { color: 0xd8cfbc, texture: 'sand', roughness: 0.98, metalness: 0, uvScale: 0.67, worldUv: true },
    tile: { color: 0xc4cad0, texture: 'tile', roughness: 0.42, metalness: 0, uvScale: 0.42, worldUv: true },
    tilePool: { color: 0xbcd8e2, texture: 'tile', roughness: 0.38, metalness: 0, uvScale: 0.83, worldUv: true },
    /* ROOF TILE WAS BUILT ON THE ONE RECIPE THIS FILE SAYS NOT TO USE
       FOR IT. The note fifty lines above is explicit: the brick recipe
       bakes to #80493b, a tint only ever multiplies DOWN, and anything
       meant to read pale is built on smooth or concrete instead. The
       old line even acknowledged it -- "the same rule applies" -- and
       then broke it anyway with a 0xd8cfc8 tint on brick, which is how
       every roof on Resort came out near black from above.

       Terracotta on the concrete recipe instead: concrete bakes to
       #bebbb3, so 0xc86a44 lands around #955241, which is a clay
       pantile. The slate is for the flat roofs that are not tiled at
       all. */
    roof: { color: 0xc86a44, texture: 'concrete', roughness: 0.94, metalness: 0, uvScale: 1, worldUv: true },
    roofSlate: { color: 0x8e949c, texture: 'concrete', roughness: 0.88, metalness: 0, uvScale: 0.6, worldUv: true },
    canvas: { color: 0xe4e0d4, texture: 'fabric', roughness: 0.97, metalness: 0, uvScale: 2, worldUv: true },
    rock: { color: 0xe8e4dc, texture: 'rock', roughness: 0.96, metalness: 0, uvScale: 0.33, worldUv: true },

    /* ---- the wide set: surfaces that cover the whole map ----
     *
       THESE WERE MULTIPLYING THE MAP DOWN TWICE AND FLOORING IT AT
       BLACK, and it took five probes to see because every one of my
       first theories was wrong. Not the shadow cascade -- the shader
       treats outside-the-cascade as lit. Not the tint pipeline -- an
       isolated test renders red #3f3522 against blue #18181e. Not the
       tiling -- uvScale from 1 to 40 changes the pixel by nothing at
       all. Not the sun -- the same points read #000000 at 9.5, 12 and
       15 hours and under a swapped sky.

       What it is, measured on one pavement slab that a raycast
       confirms is a single object under one light:

         pure white, no texture    #434a52
         white + concrete          #1e2427
         0xa6a29a, no texture      #031317
         0xa6a29a + concrete       #000000

       The light landing there is a quarter of white to begin with --
       blue-cast, so it is sky ambient with no sun in it. Then the grey
       tint takes two thirds of what is left and the texture recipe
       takes most of the rest. Three multiplications below one, and the
       floor is zero.

       This file's own rule, written at the top of it, is that a tint
       only ever multiplies DOWN and anything meant to read pale is
       built near white. The wide set broke that rule: a mid-grey tint
       on an already-mid recipe. The recipes carry the colour -- so the
       tints run near white now and the ground is allowed to be as
       bright as the light on it. */
    wideAsphalt: { color: 0xc8c6c2, texture: 'concrete', roughness: 0.96, metalness: 0, uvScale: 0.4, worldUv: true },
    wideConcrete: { color: 0xf0ede8, texture: 'concrete', roughness: 0.93, metalness: 0, uvScale: 0.5, worldUv: true },
    wideDirt: { color: 0xe8e2d6, texture: 'dirt', roughness: 0.98, metalness: 0, uvScale: 0.5, worldUv: true },
    wideTile: { color: 0xeef2f6, texture: 'tile', roughness: 0.42, metalness: 0, uvScale: 0.42, worldUv: true },
    wideGrass: { color: 0xdcecc8, texture: 'grass', roughness: 0.97, metalness: 0, uvScale: 0.67, subsurface: 0.3, worldUv: true },
    wideRock: { color: 0xf0ece4, texture: 'rock', roughness: 0.96, metalness: 0, uvScale: 0.33, worldUv: true },
  };

  /* WHY THE DECORATIVE GROUND SITS AT -0.08 AND NOT AT 0.
   *
     Every map lays a big collision slab whose top is exactly y = 0 and
     then puts its road, its pavement and its paths on top of that. The
     engine's ground() mesh was also at 0, and the road was two
     centimetres above it -- which is plenty on paper and nothing at all
     to a depth buffer looking at it from twenty-six metres up. Town's
     high street rendered as pale dirt with a dashed line floating on
     it: the road was there, and the ground was winning.

     Eight centimetres down for the mesh and six up for the surfaces is
     fourteen centimetres of separation, which holds at any range this
     map is ever seen from. */
  function kit(game) {
    var solids = [], decos = [], mats = {};
    for (var k in MAT) if (Object.prototype.hasOwnProperty.call(MAT, k)) mats[k] = game.material(MAT[k]);

    function slab(x0, x1, y0, y1, z0, z1, material, name) {
      if (x1 - x0 < 0.001 || y1 - y0 < 0.001 || z1 - z0 < 0.001) return null;
      var a = game.box({
        at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
        size: [x1 - x0, y1 - y0, z1 - z0], material: material, static: true,
      });
      if (a) { a.name = name || 'mp'; solids.push(a); }
      return a;
    }

    /* ================================================================
       SOMETHING YOU CAN TAKE DOWN
       ================================================================
       The engine has had Voronoi fracture, stress accumulation and a
       chunk pool since before any of these maps were built, and not
       one piece of any of them used it. Every wall on every map was
       as solid as the cliff behind it.

       WHAT IS AND IS NOT FRAGILE, and the rule matters more than the
       list. Anything you STAND on or that holds the map's shape is
       permanent: floors, roofs, stairs, the edge. Anything that is
       only in the way is fragile: interior partitions, sheds, crates,
       pallets, the sandbags. So a rocket into a building opens it up
       and leaves cover where the wall was, and nobody ever drops
       through a floor that has been shot away or ends up standing
       outside the map.

       `health` is in solid hits and `threshold` is the impulse below
       which nothing registers at all -- which is what stops a wall
       crumbling because somebody walked into it. Rifle rounds carry
       nowhere near it; a rocket carries several times it.

       The chunks live for twenty seconds and then go, because the
       rubble IS the cover for the fight that is happening now and a
       map carpeted with every wall anybody has ever broken is a map
       that runs at nine frames a second by the third round. */
    function frail(x0, x1, y0, y1, z0, z1, material, name, spec) {
      if (x1 - x0 < 0.001 || y1 - y0 < 0.001 || z1 - z0 < 0.001) return null;
      var w = x1 - x0, h = y1 - y0, d = z1 - z0;
      var vol = w * h * d;
      var S = spec || {};
      var a = game.box({
        at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
        size: [w, h, d], material: material, static: true,
        breakable: {
          /* Bigger pieces take more to bring down, and get more chunks
             when they do -- but both are capped, because a twelve-metre
             wall shattered into ninety pieces is ninety rigid bodies
             in one frame. */
          health: S.health != null ? S.health : Math.max(1, Math.min(4, vol / 3.0)),
          threshold: S.threshold != null ? S.threshold : 2600,
          pieces: S.pieces != null ? S.pieces : Math.max(5, Math.min(14, Math.round(vol * 1.6))),
          pattern: S.pattern || 'uniform',
          chunkLifetime: S.chunkLifetime != null ? S.chunkLifetime : 20,
          maxGeneration: 0,
        },
      });
      if (a) { a.name = name || 'mp-frail'; a.__frail = true; solids.push(a); }
      return a;
    }
    function deco(x0, x1, y0, y1, z0, z1, material, name) {
      if (x1 - x0 < 0.001 || y1 - y0 < 0.001 || z1 - z0 < 0.001) return null;
      var a = game.box({
        at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
        size: [x1 - x0, y1 - y0, z1 - z0], material: material, physics: false,
      });
      if (a) { a.name = name || 'mp-deco'; decos.push(a); }
      return a;
    }
    function post(x, z, y0, y1, r, material, name) {
      var a = game.cylinder({ at: [x, (y0 + y1) / 2, z], radius: r, height: y1 - y0,
        material: material, physics: false });
      if (a) { a.name = name || 'post'; decos.push(a); }
      return a;
    }

    /* A crate: a box with a lid line and two battens, so it reads as a
       crate at the distance you shoot people from rather than as a
       cube. Always one of the three cover heights. */
    function crate(x, z, w, d, h, material, name) {
      var m = material || mats.wood;
      /* A wooden crate is the most obviously breakable thing on any of
         these maps and it was the most solid. Low threshold: a grenade
         beside it should do it, not only a rocket. */
      frail(x - w / 2, x + w / 2, 0, h, z - d / 2, z + d / 2, m, name || 'crate',
        { health: 1, threshold: 1100, pieces: 9, chunkLifetime: 14 });
      deco(x - w / 2 - 0.03, x + w / 2 + 0.03, h - 0.06, h, z - d / 2 - 0.03, z + d / 2 + 0.03, mats.woodDark, 'crate-lid');
      deco(x - w / 2 - 0.03, x + w / 2 + 0.03, h * 0.42, h * 0.52, z - d / 2 - 0.03, z + d / 2 + 0.03, mats.woodDark, 'crate-batten');
    }

    /* A road barrier: the concrete kind with the sloped foot. Two
       slabs, because the slope is the only thing that distinguishes it
       from a wall and it is what stops a grenade rolling under. */
    function jersey(x, z, alongZ, material) {
      var m = material || mats.concretePale;
      var L = 3.0, hw = 0.30, fw = 0.52;
      if (alongZ) {
        slab(x - fw, x + fw, 0, 0.34, z - L / 2, z + L / 2, m, 'barrier-foot');
        slab(x - hw, x + hw, 0.34, COVER.low, z - L / 2, z + L / 2, m, 'barrier');
      } else {
        slab(x - L / 2, x + L / 2, 0, 0.34, z - fw, z + fw, m, 'barrier-foot');
        slab(x - L / 2, x + L / 2, 0.34, COVER.low, z - hw, z + hw, m, 'barrier');
      }
    }

    /* Sandbags: five courses, each one shorter than the last and offset,
       so the stack has a shape instead of being a brown box. */
    function sandbags(x0, x1, z, alongZ, h) {
      var courses = 4, top = h || COVER.low;
      for (var i = 0; i < courses; i++) {
        var t = i / courses, y0 = t * top, y1 = (i + 1) / courses * top;
        var inset = i * 0.10, jog = (i % 2) * 0.09;
        var SB = { health: 1, threshold: 1600, pieces: 6, chunkLifetime: 12 };
        if (alongZ) frail(x0 - 0.32 + inset, x0 + 0.32 - inset, y0, y1, z - (x1 - x0) / 2 + jog, z + (x1 - x0) / 2 + jog, mats.sand, 'sandbag', SB);
        else frail(x0 + inset + jog, x1 - inset + jog, y0, y1, z - 0.32 + inset, z + 0.32 - inset, mats.sand, 'sandbag', SB);
      }
    }

    function barrel(x, z, material) {
      var a = game.cylinder({ at: [x, 0.46, z], radius: 0.30, height: 0.92,
        material: material || mats.rust, static: true });
      if (a) { a.name = 'barrel'; solids.push(a); }
      deco(x - 0.32, x + 0.32, 0.26, 0.32, z - 0.32, z + 0.32, mats.steelDark, 'barrel-rib');
      deco(x - 0.32, x + 0.32, 0.60, 0.66, z - 0.32, z + 0.32, mats.steelDark, 'barrel-rib');
    }

    /* A shipping container. Solid, two point two metres, and you can
       stand on top of one -- which is the point of putting them out in
       the open rather than against a wall. */
    function container(x, z, alongZ, material) {
      var L = 12.0, Wd = 2.44, H = 2.60;
      var m = material || mats.paintRed;
      var x0 = alongZ ? x - Wd / 2 : x - L / 2, x1 = alongZ ? x + Wd / 2 : x + L / 2;
      var z0 = alongZ ? z - L / 2 : z - Wd / 2, z1 = alongZ ? z + L / 2 : z + Wd / 2;
      slab(x0, x1, 0, H, z0, z1, m, 'container');
      /* Corrugations, which is the only thing that stops a container
         reading as a painted brick. */
      var n = Math.floor((alongZ ? z1 - z0 : x1 - x0) / 0.52);
      for (var i = 1; i < n; i++) {
        var t = i / n;
        if (alongZ) {
          var cz = z0 + t * (z1 - z0);
          deco(x0 - 0.04, x0 + 0.02, 0.10, H - 0.10, cz - 0.05, cz + 0.05, mats.steelDark, 'corrugation');
          deco(x1 - 0.02, x1 + 0.04, 0.10, H - 0.10, cz - 0.05, cz + 0.05, mats.steelDark, 'corrugation');
        } else {
          var cx = x0 + t * (x1 - x0);
          deco(cx - 0.05, cx + 0.05, 0.10, H - 0.10, z0 - 0.04, z0 + 0.02, mats.steelDark, 'corrugation');
          deco(cx - 0.05, cx + 0.05, 0.10, H - 0.10, z1 - 0.02, z1 + 0.04, mats.steelDark, 'corrugation');
        }
      }
      deco(x0 - 0.05, x1 + 0.05, H, H + 0.07, z0 - 0.05, z1 + 0.05, mats.steelDark, 'container-cap');
    }

    /* A wall with holes in it. `gaps` are [from, to] along the wall's own
       axis, and each one is a doorway or a window depending on whether
       it starts at the floor.

       This is the single most used thing in the kit, because a building
       you can only look at is scenery and a building you can fight
       through is a map. */
    /* `opts.frail` makes every piece of the wall breakable. It is a
       wall-level flag rather than a separate function because a wall
       is already cut into pieces round its doors and windows, and the
       pieces are what break. */
    function wall(x0, x1, z0, z1, h, material, gaps, name, opts) {
      var alongX = (x1 - x0) > (z1 - z0);
      var a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
      var cuts = (gaps || []).slice().sort(function (p, q) { return p[0] - q[0]; });
      var at = a0;
      var mk = (opts && opts.frail) ? frail : slab;
      var sp = opts && opts.frail && typeof opts.frail === 'object' ? opts.frail : null;
      function piece(p0, p1, y0, y1) {
        if (p1 - p0 < 0.01 || y1 - y0 < 0.01) return;
        /* A LINTEL IS NOT A PARTITION. The strip over a doorway is
           holding the wall above it up, and dropping it on its own
           leaves a hole with a floating wall over it. Lintels stay
           solid even in a fragile wall. */
        var lintel = y0 > 1.6;
        var f = (mk === frail && !lintel) ? frail : slab;
        if (alongX) f(p0, p1, y0, y1, z0, z1, material, name || 'wall', sp);
        else f(x0, x1, y0, y1, p0, p1, material, name || 'wall', sp);
      }
      cuts.forEach(function (g) {
        var from = Math.max(a0, g[0]), to = Math.min(a1, g[1]);
        if (to <= from) return;
        piece(at, from, 0, h);
        /* A window keeps a sill under it and a lintel over it; a
           doorway keeps only the lintel. */
        var sill = g[2] != null ? g[2] : 0;          // bottom of the hole
        var head = g[3] != null ? g[3] : 2.10;       // top of the hole
        if (sill > 0) piece(from, to, 0, sill);
        if (head < h) piece(from, to, head, h);
        at = to;
      });
      piece(at, a1, 0, h);
    }

    /* A flight of stairs, and the only thing worth saying about it is
       that the steps are solid boxes rather than a ramp: a ramp lets a
       body slide back down and reads wrong under a footstep. */
    function stair(x, z, w, rise, run, steps, dir, material) {
      var m = material || mats.concrete;
      for (var i = 0; i < steps; i++) {
        var y = (i + 1) * rise;
        if (dir === 'z+') slab(x - w / 2, x + w / 2, 0, y, z + i * run, z + (i + 1) * run, m, 'step');
        else if (dir === 'z-') slab(x - w / 2, x + w / 2, 0, y, z - (i + 1) * run, z - i * run, m, 'step');
        else if (dir === 'x+') slab(x + i * run, x + (i + 1) * run, 0, y, z - w / 2, z + w / 2, m, 'step');
        else slab(x - (i + 1) * run, x - i * run, 0, y, z - w / 2, z + w / 2, m, 'step');
      }
    }

    /* Chain link. Decoration on purpose -- you can see through it and
       shoot through it, and a fence you can neither see nor shoot
       through is a wall that lies about itself. The posts are solid. */
    function fence(x0, x1, z0, z1, h) {
      var alongX = (x1 - x0) > (z1 - z0);
      var len = alongX ? x1 - x0 : z1 - z0, n = Math.max(1, Math.round(len / 3.0));
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        var px = alongX ? x0 + t * len : (x0 + x1) / 2;
        var pz = alongX ? (z0 + z1) / 2 : z0 + t * len;
        post(px, pz, 0, h, 0.05, mats.steelDark, 'fence-post');
      }
      if (alongX) deco(x0, x1, 0.06, h - 0.06, (z0 + z1) / 2 - 0.02, (z0 + z1) / 2 + 0.02, mats.steelDark, 'fence-mesh');
      else deco((x0 + x1) / 2 - 0.02, (x0 + x1) / 2 + 0.02, 0.06, h - 0.06, z0, z1, mats.steelDark, 'fence-mesh');
    }

    /* A car, abandoned. Five slabs and a pair of wheels a side: hull,
       cabin, bonnet, boot, and a glass band, because a car that is one
       box is a skip. Always low cover -- you crouch behind it. */
    function car(x, z, alongZ, body) {
      var m = body || mats.paintBlue;
      var L = 4.30, Wd = 1.78;
      var hx = alongZ ? Wd / 2 : L / 2, hz = alongZ ? L / 2 : Wd / 2;
      slab(x - hx, x + hx, 0.32, 1.02, z - hz, z + hz, m, 'car-hull');
      var cl = alongZ ? hz * 0.52 : hx * 0.52;
      if (alongZ) {
        slab(x - hx * 0.86, x + hx * 0.86, 1.02, 1.46, z - cl, z + cl, m, 'car-cabin');
        deco(x - hx * 0.88, x + hx * 0.88, 1.08, 1.38, z - cl - 0.03, z + cl + 0.03, mats.glass, 'car-glass');
      } else {
        slab(x - cl, x + cl, 1.02, 1.46, z - hz * 0.86, z + hz * 0.86, m, 'car-cabin');
        deco(x - cl - 0.03, x + cl + 0.03, 1.08, 1.38, z - hz * 0.88, z + hz * 0.88, mats.glass, 'car-glass');
      }
      for (var sx = -1; sx <= 1; sx += 2) {
        for (var sz = -1; sz <= 1; sz += 2) {
          var wx = x + (alongZ ? sx * (hx - 0.12) : sx * (hx - 0.72));
          var wz = z + (alongZ ? sz * (hz - 0.72) : sz * (hz - 0.12));
          deco(wx - 0.14, wx + 0.14, 0.02, 0.62, wz - 0.30, wz + 0.30, mats.steelDark, 'wheel');
        }
      }
    }

    /* A floor you can stand on with nothing under it: a balcony, a
       catwalk, the first floor of a building with the walls gone. */
    function deck(x0, x1, y, z0, z1, material, rail) {
      slab(x0, x1, y - 0.18, y, z0, z1, material || mats.concrete, 'deck');
      if (rail !== false) {
        [[x0, x0 + 0.06, z0, z1], [x1 - 0.06, x1, z0, z1],
          [x0, x1, z0, z0 + 0.06], [x0, x1, z1 - 0.06, z1]].forEach(function (r, i) {
          if (rail && rail.indexOf(i) < 0) return;
          deco(r[0], r[1], y, y + 1.05, r[2], r[3], mats.steelDark, 'rail');
        });
      }
    }

    /* Two staggered rows of scattered cover, in front of a spawn line.
     *
       This was a solid wall across the map with gaps in it, and it was
       wrong twice over. It read as spawning in a box -- the first thing
       a Town player saw was brick, four metres away, the full width of
       the screen -- and it closed the maps: the longest sightline on
       Town came out at SIX METRES, on a map whose middle lane is a
       hundred and twenty metres of high street. A map with no long line
       on it is a map no rifle has a reason to exist on.

       Two short rows do the same job with a tenth of the mass. Any
       straight line crossing both must find a gap in each, and the rows
       are offset by half a slot so a gap in the near one lines up with
       a block in the far one. You walk through in three seconds. You
       cannot see through from where you started. And between the blocks
       there is sky, which is the difference between cover and a wall.

       Blocks start below the ground rather than on it, because a box
       whose bottom face is exactly coplanar with the floor shows a
       hairline of floor through it at grazing angles. */
    function screenPair(z, x0, x1, material, dir, rows) {
      var slot = 9.4, w = 4.6, gap = 4.8, n = rows || 2;
      for (var ri = 0; ri < n; ri++) {
        var rz = z + (dir || 1) * ri * gap;
        /* Each row shifted by a fraction of a slot, so no gap ever
           lines up with a gap. Two rows close the straight lines; a
           third closes the long oblique one from a corner spawn to the
           opposite corner, which threaded both gaps on two of the four
           maps and is exactly the shot that should not exist. */
        var off = (ri * slot) / n;
        for (var x = x0 + off - slot; x < x1; x += slot) {
          var a = Math.max(x0, x), b = Math.min(x1, x + w);
          if (b - a < 1.4) continue;
          var h = 2.75 - ri * 0.15;
          slab(a, b, -0.3, h, rz - 0.42, rz + 0.42, material, 'screen');
          deco(a - 0.1, b + 0.1, h, h + 0.14, rz - 0.55, rz + 0.55, mats.steelDark, 'screen-cap');
        }
      }
    }

    return {
      game: game, mats: mats, solids: solids, decos: decos, COVER: COVER, screenPair: screenPair,
      slab: slab, frail: frail, deco: deco, post: post, crate: crate, jersey: jersey,
      sandbags: sandbags, barrel: barrel, container: container, wall: wall,
      stair: stair, fence: fence, car: car, deck: deck,
    };
  }

  /* ================================================================
     HELIPAD
     ================================================================
     A landing pad cut into a cliff. The pad is the middle lane and it
     is completely open, which is the whole design: everybody learns in
     the first two minutes not to cross it, and then somebody does, and
     that is the round.

     Left lane is the fuel farm -- three tanks you cannot see through
     and a pipe run at vaulting height that lets you cross it quickly
     if you are willing to be a silhouette while you do. Right lane is
     the hangar, which is indoors and therefore the safest way up the
     map and the slowest. The cliff walk above the fuel farm is the one
     place with a view of all three lanes, and it is a walkway one man
     wide with nowhere to go but along it.
     ================================================================ */
  function buildHelipad(K) {
    var m = K.mats, C = K.COVER;
    var EDGE = 56;

    K.game.ground({ at: [0, -0.08, 0], material: MAT.wideAsphalt, size: 150, uvScale: 0.5,
      segments: 1, physics: false });
    K.slab(-EDGE - 2, EDGE + 2, -0.6, 0, -EDGE - 2, EDGE + 2, m.wideAsphalt, 'ground');

    /* ---- the pad itself ---- */
    K.slab(-15, 15, 0, 0.12, -15, 15, m.concrete, 'apron');
    K.deco(-9.4, 9.4, 0.12, 0.14, -0.4, 0.4, m.concretePale, 'pad-mark');
    K.deco(-0.4, 0.4, 0.12, 0.14, -9.4, 9.4, m.concretePale, 'pad-mark');
    [[-9.4, -8.6], [8.6, 9.4]].forEach(function (r) {
      K.deco(r[0], r[1], 0.12, 0.14, -9.4, 9.4, m.concretePale, 'pad-ring');
      K.deco(-9.4, 9.4, 0.12, 0.14, r[0], r[1], m.concretePale, 'pad-ring');
    });

    /* The helicopter, and the first bomb site. Solid enough to hide
       behind and low enough to shoot over, which is what makes a site
       in the open playable at all. */
    (function heli() {
      K.slab(-1.15, 1.15, 0.62, 2.20, -4.6, 2.4, m.paintGreen, 'heli-body');
      K.deco(-1.05, 1.05, 1.30, 2.05, -4.6, -2.6, m.glass, 'heli-glass');
      K.slab(-0.55, 0.55, 1.35, 1.95, 2.4, 8.4, m.paintGreen, 'heli-tail');
      K.deco(-0.12, 0.12, 1.95, 3.30, 7.4, 8.3, m.paintGreen, 'heli-fin');
      K.deco(-3.4, 3.4, 2.24, 2.32, -0.18, 0.18, m.steelDark, 'rotor');
      K.deco(-0.18, 0.18, 2.24, 2.32, -3.4, 3.4, m.steelDark, 'rotor');
      K.post(0, 0, 2.20, 2.50, 0.22, m.steelDark, 'rotor-head');
      for (var s = -1; s <= 1; s += 2) {
        K.deco(s * 1.05 - 0.07, s * 1.05 + 0.07, 0.18, 0.66, -3.2, 1.6, m.steelDark, 'skid-leg');
        K.deco(s * 1.30 - 0.09, s * 1.30 + 0.09, 0.02, 0.20, -3.6, 2.0, m.steelDark, 'skid');
      }
    }());

    /* Cover on the pad, and not much of it. Four barriers and two
       containers, placed so that every one of them covers a crossing
       and none of them covers two. */
    K.jersey(-12.5, -6, true); K.jersey(-12.5, 6, true);
    K.jersey(12.5, -6, true); K.jersey(12.5, 6, true);
    K.container(-6.5, -19, false, m.paintBlue);
    K.container(7.0, 19, false, m.rust);
    K.crate(-3.0, 13.5, 1.6, 1.6, C.vault, m.wood);
    K.crate(-1.2, 15.0, 1.6, 1.6, C.low, m.wood);
    K.crate(4.0, -14.0, 1.8, 1.8, C.vault, m.wood);

    /* ---- left lane: the fuel farm ---- */
    K.slab(-52, -26, 0, 0.10, -30, 30, m.wideConcrete, 'farm-pad');
    [-14, 0, 14].forEach(function (tz, i) {
      var a = K.game.cylinder({ at: [-40, 3.6, tz], radius: 4.2, height: 7.2,
        material: m.steel, static: true });
      if (a) { a.name = 'tank'; K.solids.push(a); }
      K.deco(-44.5, -35.5, 3.5, 3.7, tz - 4.5, tz + 4.5, m.steelDark, 'tank-band');
      K.deco(-44.5, -35.5, 7.2, 7.5, tz - 4.4, tz + 4.4, m.steelDark, 'tank-top');
      if (i < 2) K.deco(-40.2, -39.8, 1.1, 1.5, tz + 4.2, tz + 9.8, m.steelDark, 'tank-pipe');
    });
    /* The pipe run: vaultable the whole way, which is the lane's one
       fast route and the reason it is not simply a safe corridor. */
    K.slab(-33.6, -32.4, 0.9, C.vault, -28, 28, m.rust, 'pipe-run');
    for (var pz = -26; pz <= 26; pz += 6.5) K.post(-33, pz, 0, 0.9, 0.14, m.steelDark, 'pipe-stand');
    /* The manifold -- the second bomb site. A cluster you can stand in
       and be covered from two sides and open from the third. */
    K.slab(-40.4, -35.6, 0, 1.05, 4.0, 8.0, m.rust, 'manifold');
    K.post(-39.4, 5.0, 1.05, 2.4, 0.18, m.steelDark, 'manifold-stack');
    K.post(-36.8, 7.0, 1.05, 2.0, 0.18, m.steelDark, 'manifold-stack');
    K.barrel(-34.2, 2.6); K.barrel(-35.0, 1.6); K.barrel(-34.0, 0.6);
    K.sandbags(-37.5, -31.5, -2.0, false);
    K.sandbags(-37.5, -31.5, 12.0, false);
    /* Pump house, at the far end of the lane. */
    K.wall(-50, -42, 22, 22.4, C.storey, m.brick, [[-47.5, -44.5]], 'pump-wall', { frail: true });
    K.wall(-50, -42, 29.6, 30, C.storey, m.brick, [[-48, -45]], 'pump-wall', { frail: true });
    K.wall(-50.4, -50, 22, 30, C.storey, m.brick, [], 'pump-wall');
    K.wall(-42, -41.6, 22, 30, C.storey, m.brick, [[24.5, 27.5]], 'pump-wall', { frail: true });
    K.slab(-50.6, -41.4, C.storey, C.storey + 0.25, 21.8, 30.2, m.concrete, 'pump-roof');

    /* ---- the cliff, and the walk along the top of it ---- */
    K.slab(-EDGE - 6, -52, 0, 9.0, -EDGE, EDGE, m.wideRock, 'cliff');
    K.deck(-52, -47.5, 4.30, -28, 28, m.concrete, [1]);
    K.stair(-49.8, -28, 4.2, 0.24, 0.30, 18, 'z-', m.concrete);
    K.stair(-49.8, 28, 4.2, 0.24, 0.30, 18, 'z+', m.concrete);

    /* ---- right lane: the hangar ---- */
    var HX0 = 20, HX1 = 50, HZ0 = -17, HZ1 = 17, HH = 8.4;
    K.slab(HX0 - 0.3, HX1 + 0.3, 0, 0.12, HZ0 - 0.3, HZ1 + 0.3, m.concretePale, 'hangar-floor');
    K.wall(HX0, HX1, HZ0, HZ0 + 0.4, HH, m.steel, [[28, 42, 0, 5.2]], 'hangar-wall');
    K.wall(HX0, HX1, HZ1 - 0.4, HZ1, HH, m.steel, [[28, 42, 0, 5.2]], 'hangar-wall');
    K.wall(HX1 - 0.4, HX1, HZ0, HZ1, HH, m.steel, [[-6, 6, 0, 3.0], [-14, -9, 1.2, 3.0], [9, 14, 1.2, 3.0]], 'hangar-wall');
    K.wall(HX0, HX0 + 0.4, HZ0, HZ1, HH, m.steel, [[-11, -4, 0, 3.2], [4, 11, 0, 3.2]], 'hangar-wall');
    K.slab(HX0 - 0.6, HX1 + 0.6, HH, HH + 0.4, HZ0 - 0.6, HZ1 + 0.6, m.steelDark, 'hangar-roof');
    /* Trusses, so the inside is not a shoebox. */
    for (var tx = HX0 + 4; tx < HX1; tx += 6) {
      K.deco(tx - 0.16, tx + 0.16, HH - 0.9, HH - 0.7, HZ0 + 0.4, HZ1 - 0.4, m.steelDark, 'truss');
      K.post(tx, HZ0 + 1.2, 0, HH - 0.7, 0.16, m.steelDark, 'truss-post');
      K.post(tx, HZ1 - 1.2, 0, HH - 0.7, 0.16, m.steelDark, 'truss-post');
    }
    /* The workshops down one side: benches, a mezzanine, and stairs. */
    K.deck(HX0 + 1, HX0 + 9, 3.60, HZ0 + 2, HZ0 + 12, m.steelDark, [1, 3]);
    K.stair(HX0 + 5, HZ0 + 12, 2.6, 0.24, 0.30, 15, 'z+', m.steelDark);
    K.crate(HX0 + 5.0, 2.0, 2.0, 2.0, C.vault, m.wood);
    K.crate(HX0 + 5.0, 4.2, 2.0, 2.0, C.low, m.wood);
    K.crate(HX1 - 5.0, -7.0, 2.2, 2.2, C.vault, m.wood);
    K.barrel(HX1 - 3.0, 9.0); K.barrel(HX1 - 3.8, 10.2);
    K.car(HX0 + 14, 10.5, false, m.paintGreen);

    /* The tower, over the hangar. One way up, and everything can see it. */
    K.slab(40, 47, HH + 0.4, HH + 3.0, 6, 13, m.concrete, 'tower-base');
    K.deck(39, 48, HH + 4.4, 5, 14, m.concrete, [0, 1, 2, 3]);
    K.deco(39.4, 47.6, HH + 4.4, HH + 6.4, 5.4, 5.6, m.glass, 'tower-glass');
    K.deco(39.4, 47.6, HH + 4.4, HH + 6.4, 13.4, 13.6, m.glass, 'tower-glass');
    K.slab(38.6, 48.4, HH + 6.4, HH + 6.8, 4.6, 14.4, m.steelDark, 'tower-roof');
    K.stair(43.5, HZ1 + 0.4, 2.2, 0.26, 0.32, 33, 'z+', m.steelDark);

    /* ---- the approach from each spawn ----
       Revetments: the short concrete walls a coastal battery keeps its
       vehicles behind, in two staggered rows. Not a line across the
       map -- the pad stays open, which is the map. */
    K.screenPair(-32, -52, 52, m.concretePale, -1);
    K.screenPair(32, -52, 52, m.concretePale, 1);
    K.container(-30, 28, false, m.paintGreen);
    K.container(30, -28, false, m.paintGreen);
    K.crate(-18, -30, 1.8, 1.8, C.vault, m.wood);
    K.crate(18, 30, 1.8, 1.8, C.vault, m.wood);

    /* ---- the boundary ---- */
    [[-EDGE - 2, EDGE + 2, -EDGE - 2, -EDGE], [-EDGE - 2, EDGE + 2, EDGE, EDGE + 2],
      [EDGE, EDGE + 2, -EDGE, EDGE]].forEach(function (b) {
      K.slab(b[0], b[1], 0, 9.0, b[2], b[3], m.wideRock, 'edge');
    });

    return {
      spawns: {
        a: [[-26, -48], [-14, -50], [-3, -51], [8, -50], [20, -48], [32, -47]],
        b: [[-26, 48], [-14, 50], [-3, 51], [8, 50], [20, 48], [32, 47]],
      },
      sites: [
        { id: 'heli', name: 'the helicopter', at: [0, 0, -1], r: 4.5 },
        { id: 'manifold', name: 'the fuel manifold', at: [-38, 0, 6], r: 4.5 },
      ],
      lanes: [{ x: -38, name: 'fuel farm' }, { x: 0, name: 'the pad' }, { x: 35, name: 'hangar' }],
    };
  }

  /* ================================================================
     RESORT
     ================================================================
     A hotel on a lake, out of season: chairs stacked, pool drained, one
     lamp on behind reception.

     The drained pool is the map. It is a pit in the middle lane two and
     a half metres deep with two ways out, and the balconies on three
     sides of it look straight down into it. Being in the pool is being
     in a room with no roof and four windows, which is a terrible place
     to be and the shortest way up the map -- so it is worth it, until
     somebody is on a balcony, and then it is not.
     ================================================================ */
  function buildResort(K) {
    var m = K.mats, C = K.COVER;
    var EDGE = 58;
    var PX0 = -11, PX1 = 13, PZ0 = -13, PZ1 = 15, PY = -2.45;

    K.game.ground({ at: [0, -0.08, 0], material: MAT.wideTile, size: 150, uvScale: 0.7,
      segments: 1, physics: false });
    /* The terrace, built as four slabs around the pool rather than as
       one, because the hole is the point and a ground plane has no
       hole in it. */
    K.slab(-EDGE - 2, PX0, -0.6, 0, -EDGE - 2, EDGE + 2, m.wideTile, 'terrace');
    K.slab(PX1, EDGE + 2, -0.6, 0, -EDGE - 2, EDGE + 2, m.wideTile, 'terrace');
    K.slab(PX0, PX1, -0.6, 0, -EDGE - 2, PZ0, m.wideTile, 'terrace');
    K.slab(PX0, PX1, -0.6, 0, PZ1, EDGE + 2, m.wideTile, 'terrace');

    /* ---- the pool ---- */
    K.slab(PX0, PX1, PY - 0.4, PY, PZ0, PZ1, m.tilePool, 'pool-floor');
    K.slab(PX0 - 0.35, PX0, PY, 0, PZ0, PZ1, m.tilePool, 'pool-side');
    K.slab(PX1, PX1 + 0.35, PY, 0, PZ0, PZ1, m.tilePool, 'pool-side');
    K.slab(PX0, PX1, PY, 0, PZ0 - 0.35, PZ0, m.tilePool, 'pool-end');
    /* The shallow end slopes, so there is one way out you can run and
       one you have to climb. */
    for (var i = 0; i < 8; i++) {
      var t0 = i / 8, t1 = (i + 1) / 8;
      K.slab(PX0, PX1, PY + t0 * -PY, PY + t1 * -PY, PZ1 - 7 + i * 0.875, PZ1 - 7 + (i + 1) * 0.875, m.tilePool, 'pool-slope');
    }
    K.stair(PX0 + 2.2, PZ0 + 0.2, 2.0, 0.28, 0.32, 9, 'z+', m.tilePool);
    K.deco(PX0 - 0.45, PX1 + 0.45, -0.04, 0.03, PZ0 - 0.45, PZ1 + 0.45, m.concretePale, 'pool-coping');
    /* The lane markers, still painted on the floor of an empty pool. */
    for (var lx = PX0 + 3; lx < PX1 - 1; lx += 3) {
      K.deco(lx - 0.09, lx + 0.09, PY, PY + 0.02, PZ0 + 1, PZ1 - 8, m.concretePale, 'pool-lane');
    }
    /* Cover inside the pit, or nobody would ever go into it. */
    K.crate(PX0 + 2.6, PZ0 + 6.5, 1.5, 1.5, C.low, m.wood);
    K.crate(PX1 - 3.0, PZ0 + 3.0, 1.5, 1.5, C.vault, m.wood);
    K.slab(PX0 + 6, PX1 - 6, PY, PY + C.low, PZ0 + 9.5, PZ0 + 11, m.canvas, 'sun-lounger-stack');

    /* ---- left lane: the lobby, and the corridor behind it ---- */
    var LX0 = -54, LX1 = -24, LZ0 = -20, LZ1 = 20, LH = 5.6;
    K.slab(LX0 - 0.4, LX1 + 0.4, 0, 0.10, LZ0 - 0.4, LZ1 + 0.4, m.tile, 'lobby-floor');
    K.wall(LX0, LX1, LZ0, LZ0 + 0.4, LH, m.plaster, [[-46, -41], [-34, -29]], 'lobby-wall');
    K.wall(LX0, LX1, LZ1 - 0.4, LZ1, LH, m.plaster, [[-46, -41], [-34, -29]], 'lobby-wall');
    K.wall(LX1 - 0.4, LX1, LZ0, LZ1, LH, m.plaster, [[-12, -5], [3, 10], [13, 18, 1.0, 2.6]], 'lobby-wall');
    K.wall(LX0, LX0 + 0.4, LZ0, LZ1, LH, m.plaster, [[-8, 8, 1.0, 3.2]], 'lobby-wall');
    K.slab(LX0 - 0.6, LX1 + 0.6, LH, LH + 0.4, LZ0 - 0.6, LZ1 + 0.6, m.concrete, 'lobby-roof');
    /* The corridor: a spine down the back of the lobby with two ways
       into the room, so the building is not one box. */
    K.wall(LX0 + 7, LX0 + 7.4, LZ0 + 1, LZ1 - 1, LH, m.plaster, [[-14, -8], [5, 11]], 'corridor-wall', { frail: true });
    /* Reception -- a bomb site with a desk in front of it and a way in
       from two sides. */
    K.slab(-44, -34, 0, 1.15, -8, -6, m.woodDark, 'reception-desk');
    K.deco(-44.2, -33.8, 1.15, 1.22, -8.2, -5.8, m.wood, 'desk-top');
    K.slab(-46, -42, 0, 2.4, -3, -2.6, m.woodDark, 'key-rack');
    K.crate(-31, 8, 1.6, 1.6, C.vault, m.wood);
    K.crate(-31, 10, 1.6, 1.6, C.low, m.wood);
    K.slab(-40, -36, 0, C.low, 10, 12, m.canvas, 'stacked-chairs');
    /* Up to the first floor, and out onto the balcony over the pool. */
    K.stair(LX1 - 4, 14, 2.4, 0.26, 0.32, 17, 'z+', m.tile);
    K.deck(LX1 - 7, LX1 + 0.4, 4.42, 10, 20, m.tile, [0, 2]);

    /* ---- balconies on three sides of the pool ---- */
    K.deck(PX0 - 8.5, PX0 - 0.6, 4.42, PZ0 - 2, PZ1 + 2, m.tile, [0, 2, 3]);
    K.deck(PX1 + 0.6, PX1 + 8.5, 4.42, PZ0 - 2, PZ1 + 2, m.tile, [1, 2, 3]);
    K.deck(PX0 - 8.5, PX1 + 8.5, 4.42, PZ0 - 8, PZ0 - 2, m.tile, [0, 1, 2]);
    K.post(PX0 - 0.9, PZ0 - 1.6, 0, 4.42, 0.22, m.plaster, 'balcony-post');
    K.post(PX0 - 0.9, PZ1 + 1.6, 0, 4.42, 0.22, m.plaster, 'balcony-post');
    K.post(PX1 + 0.9, PZ0 - 1.6, 0, 4.42, 0.22, m.plaster, 'balcony-post');
    K.post(PX1 + 0.9, PZ1 + 1.6, 0, 4.42, 0.22, m.plaster, 'balcony-post');
    /* The drainpipe. Three crates and a flat roof: the third way up,
       known by everybody within a week and worth keeping anyway. */
    K.crate(PX1 + 11, PZ1 + 4, 1.5, 1.5, C.vault, m.wood);
    K.crate(PX1 + 11, PZ1 + 2.2, 1.5, 1.5, 2.55, m.wood);
    K.slab(PX1 + 8.5, PX1 + 12.5, 4.24, 4.42, PZ1 + 1, PZ1 + 3, m.tile, 'balcony-step');
    K.stair(PX1 + 5, PZ0 - 9, 2.2, 0.26, 0.32, 17, 'z-', m.tile);

    /* ---- right lane: the cabanas and the lake path ---- */
    for (var cz = -26; cz <= 26; cz += 17) {
      K.wall(26, 38, cz - 5, cz - 4.6, 3.0, m.plaster, [[30, 34]], 'cabana', { frail: true });
      K.wall(26, 38, cz + 4.6, cz + 5, 3.0, m.plaster, [[30, 34]], 'cabana', { frail: true });
      K.wall(25.6, 26, cz - 5, cz + 5, 3.0, m.plaster, [], 'cabana', { frail: true });
      K.wall(38, 38.4, cz - 5, cz + 5, 3.0, m.plaster, [[cz - 2, cz + 2]], 'cabana', { frail: true });
      K.slab(25.2, 38.8, 3.0, 3.25, cz - 5.4, cz + 5.4, m.roof, 'cabana-roof');
      K.deco(31, 33, 0, 0.9, cz - 1, cz + 1, m.canvas, 'lounger');
    }
    K.slab(44, EDGE, -0.58, 0.06, -EDGE, EDGE, m.wideGrass, 'lake-path');
    for (var pz2 = -40; pz2 <= 40; pz2 += 10) K.post(46, pz2, 0, 3.4, 0.16, m.woodDark, 'lamp-post');
    K.car(42, -34, true, m.paintRed);
    K.car(42, 30, true, m.paintBlue);
    /* The plant room -- the second site, indoors, small, and with one
       door and one window, so holding it is a real decision. */
    K.wall(15, 25, 22, 22.4, 3.2, m.brickPale, [[18, 21]], 'plant', { frail: true });
    K.wall(15, 25, 29.6, 30, 3.2, m.brickPale, [[19, 22, 1.1, 2.4]], 'plant', { frail: true });
    K.wall(14.6, 15, 22, 30, 3.2, m.brickPale, [], 'plant', { frail: true });
    K.wall(25, 25.4, 22, 30, 3.2, m.brickPale, [[24, 27]], 'plant', { frail: true });
    K.slab(14.4, 25.6, 3.2, 3.45, 21.8, 30.2, m.concrete, 'plant-roof');
    K.slab(17, 20, 0, 1.4, 27, 29, m.steelDark, 'pump');
    K.barrel(22.5, 24.0); K.barrel(23.4, 25.0);

    /* ---- cover down the middle, outside the pool ---- */
    K.slab(-6, 6, 0, C.low, -26, -24.5, m.plaster, 'planter');
    K.slab(-6, 6, 0, C.low, 24.5, 26, m.plaster, 'planter');
    K.crate(-16, -20, 1.6, 1.6, C.vault, m.wood);
    K.crate(18, 20, 1.6, 1.6, C.vault, m.wood);
    K.jersey(-19, 32, true); K.jersey(20, -32, true);

    /* ---- the approach from each spawn ----
       The low walls a hotel puts between its terrace and its car park,
       in two staggered rows with the planting long dead. */
    K.screenPair(-31, -54, 54, m.brickPale, -1, 3);
    K.screenPair(31, -54, 54, m.brickPale, 1, 3);
    K.crate(-20, 30, 1.6, 1.6, C.vault, m.wood);
    K.crate(20, -30, 1.6, 1.6, C.vault, m.wood);

    /* ---- the boundary ---- */
    [[-EDGE - 2, EDGE + 2, -EDGE - 2, -EDGE], [-EDGE - 2, EDGE + 2, EDGE, EDGE + 2],
      [-EDGE - 2, -EDGE, -EDGE, EDGE], [EDGE, EDGE + 2, -EDGE, EDGE]].forEach(function (b) {
      K.slab(b[0], b[1], 0, 6.0, b[2], b[3], m.brickPale, 'edge');
    });

    return {
      spawns: {
        a: [[-34, -46], [-20, -48], [-6, -49], [8, -48], [22, -46], [36, -44]],
        b: [[-34, 46], [-20, 48], [-6, 49], [8, 48], [22, 46], [36, 44]],
      },
      sites: [
        { id: 'reception', name: 'the reception desk', at: [-39, 0, -4], r: 4.5 },
        { id: 'plant', name: 'the pool plant room', at: [20, 0, 26], r: 4.0 },
      ],
      lanes: [{ x: -39, name: 'lobby' }, { x: 1, name: 'the pool' }, { x: 33, name: 'terrace' }],
    };
  }

  /* ================================================================
     TOWN
     ================================================================
     Four streets of a place that was evacuated, and the only one of the
     four with real interiors: a bakery, a garage with the pit open, and
     a church.

     The high street runs the whole length of the middle lane and is a
     shooting gallery. Nobody uses it, and everybody watches it, which
     is the same thing said twice and is why it works: the street is
     not a route, it is a threat that shapes the other two lanes.
     ================================================================ */
  function buildTown(K) {
    var m = K.mats, C = K.COVER;
    var EDGE = 62;

    K.game.ground({ at: [0, -0.08, 0], material: MAT.wideDirt, size: 160, uvScale: 0.55,
      segments: 1, physics: false });
    K.slab(-EDGE - 2, EDGE + 2, -0.6, 0, -EDGE - 2, EDGE + 2, m.wideDirt, 'ground');

    /* ---- the high street ---- */
    K.slab(-7, 7, -0.58, 0.06, -EDGE, EDGE, m.wideAsphalt, 'road');
    K.slab(-7.3, -7, 0, 0.14, -EDGE, EDGE, m.kerb, 'kerb');
    K.slab(7, 7.3, 0, 0.14, -EDGE, EDGE, m.kerb, 'kerb');
    for (var mz = -EDGE + 4; mz < EDGE; mz += 7) {
      K.deco(-0.16, 0.16, 0.06, 0.09, mz, mz + 3, m.concretePale, 'road-line');
    }
    K.slab(-15, -7.3, 0, 0.14, -EDGE, EDGE, m.wideConcrete, 'pavement');
    K.slab(7.3, 15, 0, 0.14, -EDGE, EDGE, m.wideConcrete, 'pavement');
    /* The only cover on the street is what was left on it. */
    K.car(-11, -22, true, m.paintRed);
    K.car(11, 4, true, m.paintGreen);
    K.car(-11, 26, true, m.paintBlue);
    K.car(3, -40, false, m.rust);
    K.jersey(-4, -8, false); K.jersey(4, 16, false);
    for (var lz = -50; lz <= 50; lz += 14) {
      K.post(-9.5, lz, 0.14, 5.2, 0.13, m.steelDark, 'street-lamp');
      K.deco(-9.9, -8.6, 5.0, 5.2, lz - 0.3, lz + 0.3, m.steelDark, 'lamp-arm');
    }

    /* ---- left lane: the bakery, the back gardens and the alley ---- */
    /* Bakery. Two rooms, a counter, and the ovens at the back, which is
       the site: you can come at it from the street or from the alley
       behind, and holding both is a job for two people. */
    var BX0 = -30, BX1 = -15.5, BZ0 = -8, BZ1 = 14, BH = 4.2;
    K.slab(BX0 - 0.4, BX1 + 0.4, 0, 0.12, BZ0 - 0.4, BZ1 + 0.4, m.wood, 'bakery-floor');
    K.wall(BX0, BX1, BZ0, BZ0 + 0.4, BH, m.brick, [[-25, -21]], 'bakery-wall');
    K.wall(BX0, BX1, BZ1 - 0.4, BZ1, BH, m.brick, [[-27, -23, 1.0, 2.6]], 'bakery-wall');
    K.wall(BX1 - 0.4, BX1, BZ0, BZ1, BH, m.brick, [[-2, 3], [6, 11, 1.0, 2.6]], 'bakery-wall');
    K.wall(BX0 - 0.4, BX0, BZ0, BZ1, BH, m.brick, [[2, 6]], 'bakery-wall');
    K.wall(BX0, BX1, 4, 4.4, BH, m.plaster, [[-27, -23]], 'bakery-divide', { frail: true });
    K.slab(BX0 - 0.6, BX1 + 0.6, BH, BH + 0.35, BZ0 - 0.6, BZ1 + 0.6, m.roof, 'bakery-roof');
    K.slab(BX1 - 6, BX1 - 1, 0, 1.10, -4, -3, m.woodDark, 'counter');
    /* The ovens. */
    K.slab(BX0 + 0.6, BX0 + 3.2, 0, 2.30, 6, 12.5, m.steelDark, 'oven');
    K.deco(BX0 + 3.2, BX0 + 3.4, 0.6, 1.5, 6.6, 8.4, m.rust, 'oven-door');
    K.deco(BX0 + 3.2, BX0 + 3.4, 0.6, 1.5, 9.4, 11.2, m.rust, 'oven-door');
    K.slab(BX0 + 5, BX0 + 8, 0, C.low, 9, 12, m.wood, 'flour-sacks');

    /* The alley, and the garden walls that make it. */
    K.slab(-40, -33, -0.58, 0.06, -EDGE + 6, EDGE - 6, m.wideConcrete, 'alley');
    for (var gz = -46; gz <= 46; gz += 15) {
      K.wall(-56, -40.4, gz - 0.25, gz + 0.25, C.wall, m.brick, [[-50, -47]], 'garden-wall', { frail: true });
      K.slab(-56, -40.4, C.wall, C.wall + 0.12, gz - 0.32, gz + 0.32, m.kerb, 'wall-cap');
    }
    K.wall(-33.2, -32.8, -EDGE + 6, EDGE - 6, C.wall, m.brick,
      [[-38, -34], [-10, -6], [18, 22], [40, 44]], 'alley-wall');
    K.slab(-52, -42, -0.58, 0.06, -20, -6, m.grass, 'garden');
    K.slab(-52, -42, -0.58, 0.06, 14, 28, m.grass, 'garden');
    K.crate(-36.5, -30, 1.4, 1.4, C.vault, m.wood);
    K.crate(-36.5, 20, 1.4, 1.4, C.low, m.wood);
    K.barrel(-38.5, 8); K.barrel(-37.6, 9.0);
    /* A shed you can shoot from, at the top of the alley. */
    K.wall(-50, -43, 34, 34.3, 2.6, m.woodDark, [[-48, -45]], 'shed', { frail: true });
    K.wall(-50, -43, 40.7, 41, 2.6, m.woodDark, [[-49, -46, 1.0, 2.0]], 'shed', { frail: true });
    K.wall(-50.3, -50, 34, 41, 2.6, m.woodDark, [], 'shed', { frail: true });
    K.wall(-43, -42.7, 34, 41, 2.6, m.woodDark, [[36, 39]], 'shed', { frail: true });
    K.slab(-50.6, -42.4, 2.6, 2.8, 33.8, 41.2, m.roof, 'shed-roof');

    /* ---- right lane: the garage, the yard and the church ---- */
    var GX0 = 24, GX1 = 44, GZ0 = -12, GZ1 = 10, GH = 5.0;
    K.slab(GX0 - 0.4, GX1 + 0.4, 0, 0.12, GZ0 - 0.4, GZ1 + 0.4, m.concrete, 'garage-floor');
    K.wall(GX0, GX1, GZ0, GZ0 + 0.4, GH, m.brickPale, [[28, 38, 0, 4.0]], 'garage-wall');
    K.wall(GX0, GX1, GZ1 - 0.4, GZ1, GH, m.brickPale, [[30, 34]], 'garage-wall');
    K.wall(GX0 - 0.4, GX0, GZ0, GZ1, GH, m.brickPale, [[-6, -1], [3, 8, 1.1, 2.7]], 'garage-wall');
    K.wall(GX1, GX1 + 0.4, GZ0, GZ1, GH, m.brickPale, [[-2, 4, 1.1, 2.7]], 'garage-wall');
    K.slab(GX0 - 0.6, GX1 + 0.6, GH, GH + 0.35, GZ0 - 0.6, GZ1 + 0.6, m.roof, 'garage-roof');
    /* The pit: open, a metre and a half down, and the second site. A
       man in the pit is safe from everybody who is not standing at the
       edge of it, and there are four edges. */
    var QX0 = 30, QX1 = 34, QZ0 = -6, QZ1 = 4, QY = -1.55;
    K.slab(GX0, QX0, 0, 0.12, GZ0, GZ1, m.concrete, 'garage-slab');
    K.slab(QX1, GX1, 0, 0.12, GZ0, GZ1, m.concrete, 'garage-slab');
    K.slab(QX0, QX1, 0, 0.12, GZ0, QZ0, m.concrete, 'garage-slab');
    K.slab(QX0, QX1, 0, 0.12, QZ1, GZ1, m.concrete, 'garage-slab');
    K.slab(QX0, QX1, QY - 0.3, QY, QZ0, QZ1, m.concrete, 'pit-floor');
    K.slab(QX0 - 0.3, QX0, QY, 0.12, QZ0, QZ1, m.concrete, 'pit-side');
    K.slab(QX1, QX1 + 0.3, QY, 0.12, QZ0, QZ1, m.concrete, 'pit-side');
    K.slab(QX0, QX1, QY, 0.12, QZ0 - 0.3, QZ0, m.concrete, 'pit-end');
    K.stair(32, QZ1 - 0.2, 1.6, 0.26, 0.30, 6, 'z+', m.steelDark);
    K.car(38, 6, true, m.rust);
    K.crate(26.5, 7, 1.6, 1.6, C.vault, m.wood);
    K.barrel(27, -9); K.barrel(28, -9.8); K.barrel(27.6, -10.8);

    /* The yard between the garage and the church. */
    K.fence(18, 52, 16, 16, 2.2);
    K.container(22, 22, false, m.paintBlue);
    K.container(40, 30, true, m.rust);
    K.crate(30, 20, 1.8, 1.8, C.vault, m.wood);
    K.crate(30, 22.2, 1.8, 1.8, C.low, m.wood);

    /* The church. One tall room, a gallery at the back, and a tower
       you can be seen in from three counties. */
    var CX0 = 28, CX1 = 50, CZ0 = 30, CZ1 = 54, CH = 8.0;
    K.slab(CX0 - 0.4, CX1 + 0.4, 0, 0.14, CZ0 - 0.4, CZ1 + 0.4, m.kerb, 'church-floor');
    K.wall(CX0, CX1, CZ0, CZ0 + 0.5, CH, m.rock, [[36, 42]], 'church-wall');
    K.wall(CX0, CX1, CZ1 - 0.5, CZ1, CH, m.rock, [[33, 36, 2.0, 5.0], [42, 45, 2.0, 5.0]], 'church-wall');
    K.wall(CX0 - 0.5, CX0, CZ0, CZ1, CH, m.rock, [[36, 39, 2.0, 5.0], [45, 48, 2.0, 5.0]], 'church-wall');
    K.wall(CX1, CX1 + 0.5, CZ0, CZ1, CH, m.rock, [[34, 38], [44, 48, 2.0, 5.0]], 'church-wall');
    K.slab(CX0 - 0.8, CX1 + 0.8, CH, CH + 0.4, CZ0 - 0.8, CZ1 + 0.8, m.roof, 'church-roof');
    K.deck(CX0 + 0.5, CX1 - 0.5, 4.20, CZ1 - 7, CZ1 - 0.5, m.woodDark, [2]);
    K.stair(CX1 - 3, CZ1 - 7.2, 2.0, 0.26, 0.30, 16, 'z-', m.woodDark);
    for (var pw = CZ0 + 3; pw < CZ1 - 9; pw += 2.4) {
      K.slab(CX0 + 3, CX1 - 3, 0.14, C.low, pw, pw + 0.5, m.woodDark, 'pew');
    }
    /* The tower, on the corner. */
    var TX = 52.5, TZ = 33.5;
    K.wall(TX - 3.2, TX + 3.2, TZ - 3.4, TZ - 3.0, 15.0, m.rock, [[TX - 1.4, TX + 1.4]], 'tower');
    K.wall(TX - 3.2, TX + 3.2, TZ + 3.0, TZ + 3.4, 15.0, m.rock, [[TX - 1.2, TX + 1.2, 11.5, 14.0]], 'tower');
    K.wall(TX - 3.6, TX - 3.2, TZ - 3.4, TZ + 3.4, 15.0, m.rock, [[TZ - 1.2, TZ + 1.2, 11.5, 14.0]], 'tower');
    K.wall(TX + 3.2, TX + 3.6, TZ - 3.4, TZ + 3.4, 15.0, m.rock, [], 'tower');
    for (var s2 = 0; s2 < 4; s2++) {
      K.stair(TX, TZ - 2.6 + s2 * 0.1, 2.2, 0.26, 0.32, 14, s2 % 2 ? 'z-' : 'z+', m.woodDark);
      K.slab(TX - 2.8, TX + 2.8, 3.64 * (s2 + 1) - 0.18, 3.64 * (s2 + 1), TZ - 3.0, TZ + 3.0, m.woodDark, 'tower-landing');
      if (s2 >= 3) break;
    }
    K.deco(TX - 3.8, TX + 3.8, 15.0, 15.4, TZ - 3.8, TZ + 3.8, m.roof, 'tower-cap');

    /* ---- the approach from each spawn ----
       Garden walls and outbuildings, seen end on. The +Z rows stop
       short of the church, which is doing that job itself, and pick up
       again past the tower. Three rows reach 9.6 m back, so the base
       sits well inside the spawn line -- at 46 the last row landed on
       top of four of the twelve spawns and they stood on a wall. */
    K.screenPair(-38, -60, 60, m.brick, -1, 3);
    K.screenPair(38, -60, 26, m.brick, 1, 3);
    K.screenPair(38, 52, 60, m.brick, 1, 3);
    K.car(-20, -44, false, m.rust);
    K.car(20, 44, false, m.paintRed);

    /* ---- the boundary: the rest of the town, in silhouette ---- */
    [[-EDGE - 2, EDGE + 2, -EDGE - 2, -EDGE], [-EDGE - 2, EDGE + 2, EDGE, EDGE + 2],
      [-EDGE - 2, -EDGE, -EDGE, EDGE], [EDGE, EDGE + 2, -EDGE, EDGE]].forEach(function (b) {
      K.slab(b[0], b[1], 0, 7.0, b[2], b[3], m.brick, 'edge');
    });
    for (var ez = -54; ez <= 54; ez += 18) {
      K.deco(-EDGE - 8, -EDGE - 2, 0, 11 + (ez % 7), ez - 6, ez + 6, m.brick, 'skyline');
      K.deco(EDGE + 2, EDGE + 8, 0, 9 + ((ez + 3) % 6), ez - 6, ez + 6, m.brick, 'skyline');
    }

    return {
      /* Both spawn lines sit past the last building. The right-hand
         one was at z = 50, which is inside the church -- the test found
         a man standing on the gallery four metres up, behind the enemy
         and above them, at the start of every round. */
      spawns: {
        a: [[-40, -56], [-26, -57], [-12, -57], [2, -57], [16, -56], [27, -57]],
        b: [[-40, 56], [-26, 57], [-12, 57], [2, 57], [16, 56], [27, 57]],
      },
      sites: [
        { id: 'ovens', name: 'the bakery ovens', at: [-24, 0, 9], r: 4.5 },
        { id: 'pit', name: 'the garage pit', at: [32, 0, -1], r: 4.5 },
      ],
      lanes: [{ x: -36, name: 'the alley' }, { x: 0, name: 'the high street' }, { x: 34, name: 'the garage' }],
    };
  }

  /* ================================================================
     DEMOLITION
     ================================================================
     A block half knocked down and left. The smallest of the four and
     the nastiest.

     Three floors with most of the walls gone, so sightlines cut
     diagonally up and down through holes in the slabs. There is no safe
     lane. There is barely a lane -- the three exist, but the middle one
     is a heap rather than a route, and the holes mean the floor above
     you is not somewhere else, it is part of the room you are in.
     ================================================================ */
  function buildDemolition(K) {
    var m = K.mats, C = K.COVER;
    var EDGE = 50;
    var F1 = 3.70, F2 = 7.40;
    var BX0 = -42, BX1 = 42, BZ0 = -22, BZ1 = 22;

    K.game.ground({ at: [0, -0.08, 0], material: MAT.wideDirt, size: 140, uvScale: 0.6,
      segments: 1, physics: false });
    K.slab(-EDGE - 2, EDGE + 2, -0.6, 0, -EDGE - 2, EDGE + 2, m.wideDirt, 'ground');

    /* Columns: the grid the building was, and the only part of it that
       is still all there. Every floor hangs off these. */
    for (var cx = BX0 + 6; cx <= BX1 - 6; cx += 12) {
      for (var cz = BZ0 + 5; cz <= BZ1 - 5; cz += 12) {
        K.slab(cx - 0.35, cx + 0.35, 0, F2 + 3.6, cz - 0.35, cz + 0.35, m.concrete, 'column');
      }
    }

    /* ---- the standing wing, on the left. Walls, floors, a stairwell.
       It is the only part of the map where you can be in a room. ---- */
    function wingFloor(y) {
      K.slab(BX0, -14, y - 0.22, y, BZ0, BZ1, m.concrete, 'slab');
      /* Two holes punched through it, which is what makes the wing
         part of the same fight as the middle rather than a fort. */
      K.deco(-24, -19, y - 0.24, y - 0.20, -6, -1, m.rust, 'rebar');
    }
    K.slab(BX0, -14, -0.02, 0.12, BZ0, BZ1, m.wideConcrete, 'wing-ground');
    wingFloor(F1); wingFloor(F2);
    [0, F1, F2].forEach(function (y, i) {
      K.wall(BX0, BX0 + 0.4, BZ0, BZ1, 3.4, m.brick, [[-14, -9, 1.0, 2.4], [6, 11, 1.0, 2.4]], 'wing-wall');
      K.wall(BX0, -14, BZ0, BZ0 + 0.4, 3.4, m.brick, [[-34, -29], [-24, -19, 1.0, 2.4]], 'wing-wall');
      K.wall(BX0, -14, BZ1 - 0.4, BZ1, 3.4, m.brick, [[-32, -27, 1.0, 2.4], [-22, -17]], 'wing-wall');
      /* The wall between the wing and the middle is the one that is
         coming down: less of it on every floor. */
      K.wall(-14.4, -14, BZ0, BZ1, 3.4, m.brick,
        i === 0 ? [[-12, -6], [4, 10]] : (i === 1 ? [[-16, -4], [2, 14]] : [[-20, 16]]), 'wing-wall');
    });
    /* The stairwell -- the second bomb site, and the only way up the
       wing that is not a climb. */
    var SX = -36, SZ = 6;
    K.stair(SX, SZ - 6, 2.4, 0.26, 0.31, 14, 'z+', m.concrete);
    K.slab(SX - 1.4, SX + 1.4, F1 - 0.2, F1, SZ - 2.4, SZ + 1.2, m.concrete, 'landing');
    K.stair(SX + 3.2, SZ + 1.2, 2.4, 0.26, 0.31, 14, 'z-', m.concrete);
    K.slab(SX + 1.8, SX + 4.6, F2 - 0.2, F2, SZ - 6.0, SZ - 2.4, m.concrete, 'landing');
    K.crate(BX0 + 6, -16, 1.6, 1.6, C.vault, m.wood);
    K.crate(-20, 16, 1.6, 1.6, C.low, m.wood);
    K.barrel(-30, -14); K.barrel(-29, -15);

    /* ---- the collapsed middle: rubble you can climb, and two slabs
       that came down at an angle and are now ramps ---- */
    for (var r = 0; r < 9; r++) {
      var rt = r / 9;
      K.slab(-13 + r * 1.5, -13 + (r + 1) * 1.5 + 0.4, 0, 0.35 + rt * 3.3, -8 + r * 0.5, 4 - r * 0.4, m.rock, 'rubble-ramp');
    }
    for (var r2 = 0; r2 < 8; r2++) {
      var rt2 = r2 / 8;
      K.slab(12 - (r2 + 1) * 1.6 - 0.4, 12 - r2 * 1.6, 0, 0.35 + rt2 * 3.2, 6 + r2 * 0.4, 18 - r2 * 0.5, m.rock, 'rubble-ramp');
    }
    /* What is left of the first floor across the middle: two islands
       with a gap between them you have to go round or jump. */
    K.slab(-13, -1, F1 - 0.22, F1, BZ0, -4, m.concrete, 'slab-island');
    K.slab(3, 14, F1 - 0.22, F1, 2, BZ1, m.concrete, 'slab-island');
    K.deco(-1, 3, F1 - 0.24, F1 - 0.18, -4, 2, m.rust, 'rebar');
    /* And the second floor, less of it again. */
    K.slab(-10, 2, F2 - 0.22, F2, -14, -2, m.concrete, 'slab-island');
    K.slab(6, 14, F2 - 0.22, F2, 8, BZ1, m.concrete, 'slab-island');
    K.slab(-9, 6, 0, C.low, -19, -16, m.rock, 'rubble');
    K.slab(-4, 10, 0, C.vault, 16, 19, m.rock, 'rubble');
    K.crate(-6, 8, 1.7, 1.7, C.vault, m.wood);
    K.crate(6, -8, 1.7, 1.7, C.low, m.wood);

    /* ---- the right: the crane and the skips ---- */
    K.slab(14, BX1, -0.02, 0.12, BZ0, BZ1, m.wideConcrete, 'yard-slab');
    K.slab(20, 30, F1 - 0.22, F1, -18, -6, m.concrete, 'slab-island');
    K.stair(25, -6, 2.4, 0.26, 0.31, 14, 'z+', m.steelDark);
    K.container(34, -14, true, m.paintBlue);
    K.container(20, 14, false, m.rust);
    /* Skips: open boxes, so you can get into one and be in cover from
       everything except the floor above, which is the joke. */
    [[30, 8], [38, 16]].forEach(function (s) {
      K.slab(s[0] - 2.2, s[0] + 2.2, 0, 0.12, s[1] - 1.5, s[1] + 1.5, m.steelDark, 'skip-floor');
      K.slab(s[0] - 2.4, s[0] - 2.2, 0, 1.45, s[1] - 1.6, s[1] + 1.6, m.rust, 'skip-side');
      K.slab(s[0] + 2.2, s[0] + 2.4, 0, 1.45, s[1] - 1.6, s[1] + 1.6, m.rust, 'skip-side');
      K.slab(s[0] - 2.4, s[0] + 2.4, 0, 1.45, s[1] - 1.6, s[1] - 1.4, m.rust, 'skip-end');
      K.slab(s[0] - 2.4, s[0] + 2.4, 0, 1.45, s[1] + 1.4, s[1] + 1.6, m.rust, 'skip-end');
    });
    /* The crane. Its base is the first bomb site: out in the open, with
       four legs to hide behind and three floors looking down on it. */
    var KX = 34, KZ = 2;
    K.slab(KX - 3.4, KX + 3.4, 0, 0.55, KZ - 3.4, KZ + 3.4, m.concrete, 'crane-base');
    for (var lx2 = -1; lx2 <= 1; lx2 += 2) {
      for (var lz2 = -1; lz2 <= 1; lz2 += 2) {
        K.slab(KX + lx2 * 2.4 - 0.22, KX + lx2 * 2.4 + 0.22, 0.55, 22, KZ + lz2 * 2.4 - 0.22, KZ + lz2 * 2.4 + 0.22, m.paintRed, 'crane-leg');
      }
    }
    for (var by = 2.2; by < 22; by += 2.6) {
      K.deco(KX - 2.6, KX + 2.6, by, by + 0.16, KZ - 2.6, KZ - 2.3, m.paintRed, 'crane-brace');
      K.deco(KX - 2.6, KX + 2.6, by, by + 0.16, KZ + 2.3, KZ + 2.6, m.paintRed, 'crane-brace');
      K.deco(KX - 2.6, KX - 2.3, by, by + 0.16, KZ - 2.6, KZ + 2.6, m.paintRed, 'crane-brace');
      K.deco(KX + 2.3, KX + 2.6, by, by + 0.16, KZ - 2.6, KZ + 2.6, m.paintRed, 'crane-brace');
    }
    K.deco(KX - 26, KX + 8, 22, 22.9, KZ - 0.7, KZ + 0.7, m.paintRed, 'crane-jib');
    K.deco(-4.4, -3.6, 8.5, 22, KZ - 0.2, KZ + 0.2, m.steelDark, 'crane-cable');
    K.deco(-6, -2, 7.2, 8.5, KZ - 1.8, KZ + 1.8, m.steelDark, 'wrecking-ball');
    K.crate(18, -18, 1.7, 1.7, C.vault, m.wood);
    K.barrel(28, 18); K.barrel(29, 19);

    /* ---- the approach from each spawn ----
       Site hoarding, in two staggered runs, with gates between. */
    K.screenPair(-28, -46, 46, m.woodDark, -1);
    K.screenPair(28, -46, 46, m.woodDark, 1);
    K.container(-24, -34, false, m.rust);
    K.container(24, 34, false, m.paintBlue);
    K.crate(4, -32, 1.8, 1.8, C.vault, m.wood);
    K.crate(-4, 32, 1.8, 1.8, C.vault, m.wood);
    K.slab(-46, -30, 0, C.wall, 36, 36.5, m.woodDark, 'hoarding-run');
    K.slab(30, 46, 0, C.wall, -36.5, -36, m.woodDark, 'hoarding-run');

    /* ---- the boundary: hoarding, and the rest of the block ---- */
    [[-EDGE - 2, EDGE + 2, -EDGE - 2, -EDGE], [-EDGE - 2, EDGE + 2, EDGE, EDGE + 2],
      [-EDGE - 2, -EDGE, -EDGE, EDGE], [EDGE, EDGE + 2, -EDGE, EDGE]].forEach(function (b) {
      K.slab(b[0], b[1], 0, 4.0, b[2], b[3], m.woodDark, 'hoarding');
    });
    for (var sz2 = -44; sz2 <= 44; sz2 += 16) {
      K.deco(-EDGE - 9, -EDGE - 2, 0, 14 + (sz2 % 5), sz2 - 6, sz2 + 6, m.brick, 'skyline');
      K.deco(EDGE + 2, EDGE + 9, 0, 12 + ((sz2 + 4) % 7), sz2 - 6, sz2 + 6, m.brick, 'skyline');
    }

    return {
      spawns: {
        a: [[-34, -40], [-20, -42], [-7, -43], [7, -42], [21, -40], [34, -38]],
        b: [[-34, 40], [-20, 42], [-7, 43], [7, 42], [21, 40], [34, 38]],
      },
      sites: [
        { id: 'crane', name: 'the crane base', at: [34, 0, 2], r: 4.5 },
        { id: 'stairwell', name: 'the standing stairwell', at: [-34, 0, 4], r: 4.0 },
      ],
      lanes: [{ x: -30, name: 'the standing wing' }, { x: 0, name: 'the collapsed middle' },
        { x: 30, name: 'the crane' }],
    };
  }

  /* ================================================================
     THE REGISTRY
     ================================================================ */
  var BUILDERS = {
    helipad: buildHelipad, resort: buildResort, town: buildTown, demolition: buildDemolition,
  };

  /* THE SUN HAS TO BE ABOVE THE HORIZON.
   *
     setTimeOfDay overrides whatever sun direction the preset came with,
     and it is an angle, not a mood: at 19.4 the elevation is minus a
     third and Demolition rendered as a black rectangle with a few red
     lines in it. A map you cannot see is not a dusk map.

     Elevation is sin((h/24 - 0.25) * 2pi), so the usable band is 6 to
     18 and the interesting light is at the ends of it. These are all
     chosen for an elevation between about 0.25 and 1.0 -- low enough
     for long shadows at each end of the day, high enough to fight in. */
  /* AND THE FOG IS NOT A MOOD EITHER.
   *
     The dawn preset carries a warm beige haze at a density of 0.008,
     which over a 150-metre map means everything past about thirty
     metres is the same colour as everything else past about thirty
     metres. Photographed, Helipad was a flat tan field with slightly
     darker tan boxes on it, and no amount of building detail was ever
     going to show through that -- the detail was there and the fog was
     eating it.

     Each map gets its own density and tint now, chosen against a
     photograph rather than against the preset's idea of the hour:
     enough haze to give the distance depth, not so much that the far
     lane is a wash. Town keeps most of its overcast, because a grey
     day genuinely is hazy and that map reads well; Helipad loses two
     thirds of its. */
  /* WHAT LIGHTS THE SIDE OF A WALL THE SUN IS NOT ON.
   *
     Everything that reads as broken on these maps turns out to be the
     same thing: shade falls off a cliff. Brick photographs bright
     orange-red with the sun on it and near-black three metres away in
     shadow. Pavement is #d5d1c9 lit and was #000000 unlit. It is not
     the sun angle, the fog, the shadow cascades, the tiling or the
     tints -- each of those was tested and ruled out. It is that the
     only thing reaching a surface the sun misses is the sky, and the
     sky's LOWER half -- the bounce up off the ground -- is set dark in
     every preset: 0x494c50 under overcast, 0x4a453c under a clear
     day, 0x4a3628 at sunset.

     A real ground bounce is the map's own floor lit by its own sky, and
     these floors are pale concrete, white pool tile, asphalt and dust.
     None of them is a 30 per cent grey.

     Swept on Town and measured at two points at once -- a wall in
     shadow and a floor in sun:

       0x494c50 (shipped)   wall #280404   floor #d2d2d3
       0x62676b             wall #340707   floor #d3d4d4
       0x8e9498             wall #430600   floor #d3d4d4
       0xb4babe             wall #52170c   floor #d3d4d4

     The shade doubles and the light does not move, which is exactly
     what a bounce term should do and the reason to reach for this one
     rather than for exposure, which would lift both. */
  var SKY = {
    /* ALL FOUR IN HARD DAYLIGHT.
     *
       These were a dawn, an afternoon, an overcast morning and a
       sunset -- four moods, and three of them soft. Soft light cannot
       show a surface: the normal maps move the shading normal by half
       again on a floor and none of it reaches the picture under a
       diffuse sky. Every map is midday now.

       The hour still differs per map, and that is the whole of the
       variety left. It is enough: an hour moves the sun across the sky,
       so Helipad's shadows fall the opposite way to Demolition's and
       the four still read as four places rather than one. What they no
       longer do is trade away their detail for a colour cast. */
    helipad: { sky: 'noon', hours: 10.6, exposure: 0.95,
      fog: 0xb6cfea, fogDensity: 0.0018, ground: 0x7c7668 },
    resort: { sky: 'noon', hours: 13.2, exposure: 0.93,
      fog: 0xb2cde8, fogDensity: 0.0022, ground: 0x8e8778 },
    town: { sky: 'noon', hours: 11.4, exposure: 0.96,
      fog: 0xb8d0ea, fogDensity: 0.0030, ground: 0x84807a },
    /* NEUTRAL, NOT WARM, AND THE WARM ONE WAS MY FIRST ANSWER.
       Demolition is a sunset map with orange fog and at eye level it
       was one orange wash -- floor, walls and sky the same hue. A warm
       bounce is exactly what makes that worse, by pushing every
       surface further toward the fog colour, so it was measured:
       sample a near floor, a near wall and a far wall and take the
       spread between them, because a map you can read is one where
       those three differ.

         0x4a3628 shipped   far wall 44.6   spread 36.5
         0x8c6a4e warm      far wall 65.6   spread 39.2
         0x8a8378 neutral   far wall 78.1   spread 51.8
         0x7e8288 cool      far wall 77.9   spread 52.3

       My warm value beat what shipped and lost to both alternatives.
       Neutral over cool because a blue-grey bounce fights a sunset
       sky, and the two are within half a point of each other. */
    /* The latest hour of the four, so its sun is lowest and its shadows
       are longest -- a demolition site raked across by hard light is the
       most it can be without going back to the orange wash the note
       above is about. */
    demolition: { sky: 'noon', hours: 15.4, exposure: 0.97,
      fog: 0xb4cbe4, fogDensity: 0.0026, ground: 0x807a70 },
  };

  function applySky(game, id) {
    var s = SKY[id] || SKY.town;
    /* The exposure is applied after the preset, because setSky writes
       the preset's own and would put it back. The fog goes in as an
       override so setSky cannot put that back either. */
    try {
      game.setSky(s.sky, { fog: s.fog, fogDensity: s.fogDensity, ground: s.ground });
    } catch (e) { /* a sky name the build does not have */ }
    try { game.setTimeOfDay(s.hours); } catch (e) { /* older engine */ }
    try { if (s.exposure != null) game.renderer.post.exposure = s.exposure; } catch (e) { /* no post stage */ }
    return s;
  }

  /* Build one map and hand back everything the match needs to run on
     it. Spawns arrive as [x, z] pairs and leave as full positions with
     a yaw already pointing up the map, because a player who spawns
     facing their own wall has lost a second of a match that is decided
     in less than that. */
  function build(game, id) {
    var fn = BUILDERS[id];
    if (!fn) return null;
    var K = kit(game);
    var out = fn(K);
    applySky(game, id);

    function place(list, facing) {
      return list.map(function (p) {
        return { at: [p[0], 0.1, p[1]], yaw: facing };
      });
    }
    return {
      id: id,
      solids: K.solids, decos: K.decos,
      spawns: { a: place(out.spawns.a, 0), b: place(out.spawns.b, Math.PI) },
      sites: out.sites, lanes: out.lanes,
      sky: SKY[id],
    };
  }

  W.MP_MAPS = {
    MAT: MAT, COVER: COVER, SKY: SKY,
    list: Object.keys(BUILDERS),
    has: function (id) { return !!BUILDERS[id]; },
    kit: kit, build: build, applySky: applySky,
  };
})();
