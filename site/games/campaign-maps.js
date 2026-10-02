/* ================================================================
   CAMPAIGN MAPS
   ================================================================
   Maps that only the campaign plays, registered with the multiplayer
   map builder (mp-maps.js) as W.MP_EXTRA_MAPS so the match can run on
   them, and left out of MP_MAPS.list so they never turn up in a lobby.

   COLOMBIA, 1999 -- mission 1, "Burning Sky".

     The command post: a four-storey concrete block at the south end of
     the street, x -9..9, z -56..-42. A helipad on the roof; a stair
     shaft down the east side that switches back at every floor; on
     each floor soldiers, an ammunition crate and a map. The front door
     opens north onto the street.

     The street: 14 m of broken asphalt running north from z -42 to the
     plaza at z 50, shops and flats either side in the faded colours of
     an old colonial town, burnt out, burning, with six windows a
     sniper can work from. Rubble, burnt cars and sandbags to fight
     from. A low wall across the plaza is the end of the playable
     ground; past it the land rises to a hill where the tanks come.

     Around it, out to a kilometre, the rest of the city on fire.

     The office: the debrief room, a sealed set far off to the west.

   Everything a mission needs to find is handed back in `props`:
   floors, the door, the crash site, the sniper windows, the mortar,
   the hill, the office.
   ================================================================ */
(function () {
  'use strict';
  var W = window;

  // Colours for a sunset town: plaster in ochre, terracotta, faded blue and lime-wash; soot where it burned.
  function plaster(c) { return { color: c, texture: 'plaster', roughness: 0.92, metalness: 0, uvScale: 0.6 }; }
  var MAT = {
    hq: { color: 0xb9b2a4, texture: 'concrete', roughness: 0.9, metalness: 0, uvScale: 0.5 },
    hqIn: plaster(0xd2cbbb),
    floor: { color: 0x8a8378, texture: 'concrete', roughness: 0.85, metalness: 0, uvScale: 0.5 },
    roof: { color: 0x7d776d, texture: 'concrete', roughness: 0.9, metalness: 0, uvScale: 0.35 },
    // The multiplayer maps' asphalt (concrete recipe, world UVs), taken down to tarmac grey.
    road: { color: 0x6e6b67, texture: 'concrete', roughness: 0.96, metalness: 0, uvScale: 0.4, worldUv: true },
    kerb: { color: 0x9a948a, texture: 'concrete', roughness: 0.9, metalness: 0, uvScale: 0.6, worldUv: true },
    paveWalk: { color: 0x9b8f80, texture: 'setts', roughness: 0.9, metalness: 0, uvScale: 0.6 },
    soot: { color: 0x2a2725, texture: 'concrete', roughness: 0.97, metalness: 0, uvScale: 0.5 },
    rubble: { color: 0x8a7f72, texture: 'rock', roughness: 0.95, metalness: 0, uvScale: 0.8 },
    tileRoof: { color: 0xa8553a, texture: 'pantile', roughness: 0.85, metalness: 0, uvScale: 0.5 },
    wood: { color: 0x6a4a30, texture: 'wood', roughness: 0.85, metalness: 0, uvScale: 1 },
    green: { color: 0x4a5236, texture: 'canvas', roughness: 0.95, metalness: 0, uvScale: 1.5 },
    sand: { color: 0xa89878, texture: 'canvas', roughness: 0.98, metalness: 0, uvScale: 2 },
    metal: { color: 0x5a5e62, texture: 'metal', roughness: 0.55, metalness: 1 },
    padPaint: { color: 0xd8d4c8, texture: 'paint', roughness: 0.7, metalness: 0, uvScale: 1 },
    padYellow: { color: 0xd8b030, texture: 'paint', roughness: 0.7, metalness: 0, uvScale: 1 },
    paper: { color: 0xd8d0b8, texture: 'smooth', roughness: 0.9, metalness: 0 },
    mapPaper: { color: 0xc8c49a, texture: 'smooth', roughness: 0.9, metalness: 0 },
    hill: { color: 0x6a6040, texture: 'dirt', roughness: 0.97, metalness: 0, uvScale: 0.08 },
    grassDry: { color: 0x7a7448, texture: 'grass', roughness: 0.95, metalness: 0, uvScale: 0.12 },
  };
  var WALLS = [0xc8a35e, 0xb8673f, 0x7d95a8, 0xd9d0bc, 0xa9b38a, 0xc98f6b, 0x9c8fb0, 0xd4b48a].map(plaster);

  var F = 3.4;                       // storey height
  var HQ = { x0: -9, x1: 9, z0: -56, z1: -42, floors: 4 };
  var SHAFT = { x0: 4.8, x1: 8.8, z0: -55.6, z1: -47.6 };

  function buildColombia(K) {
    var game = K.game;
    var props = { floors: [], snipers: [], fires: [], smoke: [], lamps: [] };

    /* ---------------- ground ---------------- */
    game.ground({ at: [0, -0.08, 0], material: MAT.road, size: 2400, uvScale: 0.5, segments: 1, physics: false });
    K.slab(-200, 200, -0.6, 0, -200, 200, MAT.road, 'ground');
    // Pavements either side, a kerb high.
    K.slab(-9.6, -7.0, 0, 0.15, -42, 58, MAT.paveWalk, 'pavement');
    K.slab(7.0, 9.6, 0, 0.15, -42, 58, MAT.paveWalk, 'pavement');

    /* ---------------- the command post ---------------- */
    buildHQ(K, props);

    /* ---------------- the street ---------------- */
    buildStreet(K, props);

    /* ---------------- the hill, the city, the office ---------------- */
    buildHill(K, props);
    buildCity(K, props);
    buildOffice(K, props);

    /* Fire and smoke where things are burning, a little every frame. Lights for the biggest fires so
       they throw orange onto the street at dusk. */
    var t = 0;
    game.onUpdate(function (dt) {
      t += dt;
      var P = game.particles;
      if (!P) return;
      props.fires.forEach(function (f, i) {
        f.acc = (f.acc || 0) + dt * (f.rate || 6);
        while (f.acc > 1) {
          f.acc -= 1;
          P.fire([f.at[0] + (Math.random() - 0.5) * f.r, f.at[1], f.at[2] + (Math.random() - 0.5) * f.r],
            { count: 1, size: f.size || 0.9, life: 0.9 });
        }
        if (f.light) f.light.intensity = f.glow * (0.82 + 0.18 * Math.sin(t * 9 + i * 2.1) * Math.sin(t * 5.3 + i));
      });
      props.smoke.forEach(function (s) {
        s.acc = (s.acc || 0) + dt * (s.rate || 2.5);
        while (s.acc > 1) {
          s.acc -= 1;
          P.smoke([s.at[0] + (Math.random() - 0.5) * s.r, s.at[1], s.at[2] + (Math.random() - 0.5) * s.r],
            { count: 1, size: s.size || 3.5, life: s.life || 7, alpha: 0.55, color: 0x2a2724, colorEnd: 0x6a645e });
        }
      });
    });

    return {
      zone: { x0: -11, x1: 11, z0: -58, z1: 54 },
      navR: 62,
      spawns: {
        a: [[-3, -38], [0, -38], [3, -38], [-3, -35], [0, -35], [3, -35]],
        b: [[-4, 40], [0, 42], [4, 40], [-4, 46], [0, 46], [4, 46]],
      },
      sites: [],
      lanes: [{ x: -5, name: 'west pavement' }, { x: 0, name: 'the street' }, { x: 5, name: 'east pavement' }],
      props: props,
    };
  }

  /* ================================================================
     THE COMMAND POST
     ================================================================ */
  function buildHQ(K, props) {
    var x0 = HQ.x0, x1 = HQ.x1, z0 = HQ.z0, z1 = HQ.z1, t = 0.3;
    var roofY = F * HQ.floors;
    for (var k = 0; k < HQ.floors; k++) {
      var y = k * F;
      var base = { base: y };
      // Windows every 3 m on every face; the front door on the ground floor.
      var winsX = [], winsZ = [];
      for (var wx = x0 + 1.6; wx < x1 - 1.6; wx += 3.0) winsX.push([wx, wx + 1.3, 1.0, 2.3]);
      for (var wz = z0 + 1.6; wz < z1 - 1.6; wz += 3.0) winsZ.push([wz, wz + 1.3, 1.0, 2.3]);
      var front = k === 0 ? winsX.filter(function (g) { return g[1] < -1.6 || g[0] > 1.6; }).concat([[-1.5, 1.5]]) : winsX;
      K.wall(x0, x1, z1 - t, z1, F, MAT.hq, front, 'hq-wall', base);
      K.wall(x0, x1, z0, z0 + t, F, MAT.hq, winsX, 'hq-wall', base);
      K.wall(x0, x0 + t, z0, z1, F, MAT.hq, winsZ, 'hq-wall', base);
      K.wall(x1 - t, x1, z0, z1, F, MAT.hq, winsZ.filter(function (g) { return g[0] > SHAFT.z1 || g[1] < SHAFT.z0; }), 'hq-wall', base);
      // The floor this storey stands on (the ground floor stands on the ground), leaving the shaft open.
      if (k > 0) {
        K.slab(x0 + t, SHAFT.x0, y - 0.22, y, z0 + t, z1 - t, MAT.floor, 'hq-floor');
        K.slab(SHAFT.x0, x1 - t, y - 0.22, y, SHAFT.z1, z1 - t, MAT.floor, 'hq-floor');
        K.slab(SHAFT.x0, x1 - t, y - 0.22, y, z0 + t, SHAFT.z0, MAT.floor, 'hq-floor');
      } else {
        K.slab(x0, x1, 0, 0.12, z0, z1, MAT.floor, 'hq-floor');
      }
      // The shaft's wall, with a doorway where this floor's landing is.
      var landNorth = (k % 2) === 1;
      var door = k === 0 ? [SHAFT.z0 + 0.2, SHAFT.z0 + 1.5] : landNorth ? [SHAFT.z1 - 1.5, SHAFT.z1 - 0.15] : [SHAFT.z0 + 0.15, SHAFT.z0 + 1.5];
      K.wall(SHAFT.x0 - 0.2, SHAFT.x0, SHAFT.z0, SHAFT.z1, F, MAT.hqIn, [door], 'hq-shaft-wall', base);
      K.wall(SHAFT.x0, x1 - t, SHAFT.z1, SHAFT.z1 + 0.2, F, MAT.hqIn, [], 'hq-shaft-wall', base);
      props.floors.push({ level: k, y: y, door: { x: SHAFT.x0 - 0.6, z: (door[0] + door[1]) / 2 } });
    }
    /* The stairs: one flight per storey, switching back at every landing.
       Even flights run north up lane A, odd ones south up lane B. */
    var rise = 0.2, run = 0.28, n = 17, laneA = (SHAFT.x0 + 0.1 + 6.8) / 2, laneB = 7.9;
    var zs = SHAFT.z0 + 1.6, zn = SHAFT.z1 - 1.6;           // where the flights start and end
    for (var f = 0; f < HQ.floors; f++) {
      var b = f * F;
      if (f % 2 === 0) K.stair(laneA, zs, 1.8, rise, run, n, 'z+', MAT.floor, b || 0);
      else K.stair(laneB, zn, 1.8, rise, run, n, 'z-', MAT.floor, b);
      // The landing at the top of it.
      var ly = (f + 1) * F;
      if (f % 2 === 0) K.slab(SHAFT.x0, SHAFT.x1, ly - 0.22, ly, zn, SHAFT.z1, MAT.floor, 'hq-landing');
      else K.slab(SHAFT.x0, SHAFT.x1, ly - 0.22, ly, SHAFT.z0, zs, MAT.floor, 'hq-landing');
      // A rail between the lanes.
      K.deco(6.85, 6.95, b + 0.9, b + 1.0, zs, zn, MAT.metal, 'rail');
    }
    /* The roof: everything but the shaft, which is closed in by a stair
       house with a door onto the roof. A parapet round the edge. */
    K.slab(x0, SHAFT.x0, roofY - 0.22, roofY, z0, z1, MAT.roof, 'hq-roof');
    K.slab(SHAFT.x0, x1, roofY - 0.22, roofY, SHAFT.z1, z1, MAT.roof, 'hq-roof');
    K.slab(SHAFT.x0, x1, roofY - 0.22, roofY, z0, SHAFT.z0 + 1.6, MAT.roof, 'hq-roof');
    K.wall(SHAFT.x0 - 0.2, SHAFT.x0, SHAFT.z0, SHAFT.z1 + 0.2, 2.6, MAT.hq, [[SHAFT.z0 + 0.2, SHAFT.z0 + 1.4]], 'stairhouse', { base: roofY });
    K.wall(SHAFT.x0 - 0.2, x1, SHAFT.z1, SHAFT.z1 + 0.2, 2.6, MAT.hq, [], 'stairhouse', { base: roofY });
    K.slab(SHAFT.x0 - 0.3, x1, roofY + 2.6, roofY + 2.8, SHAFT.z0 - 0.3, SHAFT.z1 + 0.3, MAT.roof, 'stairhouse-roof');
    K.slab(x0, x1, roofY, roofY + 1.05, z0, z0 + 0.25, MAT.hq, 'parapet');
    K.slab(x0, x1, roofY, roofY + 1.05, z1 - 0.25, z1, MAT.hq, 'parapet');
    K.slab(x0, x0 + 0.25, roofY, roofY + 1.05, z0, z1, MAT.hq, 'parapet');
    K.slab(x1 - 0.25, x1, roofY, roofY + 1.05, z0, SHAFT.z0, MAT.hq, 'parapet');
    K.slab(x1 - 0.25, x1, roofY, roofY + 1.05, SHAFT.z1, z1, MAT.hq, 'parapet');
    // The helipad: a painted H in a circle, west of centre.
    var pad = { x: -2.6, z: -49 };
    K.deco(pad.x - 3.2, pad.x + 3.2, roofY, roofY + 0.012, pad.z - 3.2, pad.z + 3.2, MAT.roof, 'pad');
    for (var a = 0; a < 24; a++) {
      var th = a / 24 * Math.PI * 2, cx = pad.x + Math.cos(th) * 3.0, cz = pad.z + Math.sin(th) * 3.0;
      K.deco(cx - 0.42, cx + 0.42, roofY + 0.012, roofY + 0.02, cz - 0.42, cz + 0.42, MAT.padYellow, 'pad-ring');
    }
    K.deco(pad.x - 1.1, pad.x - 0.7, roofY + 0.012, roofY + 0.022, pad.z - 1.5, pad.z + 1.5, MAT.padPaint, 'pad-h');
    K.deco(pad.x + 0.7, pad.x + 1.1, roofY + 0.012, roofY + 0.022, pad.z - 1.5, pad.z + 1.5, MAT.padPaint, 'pad-h');
    K.deco(pad.x - 0.7, pad.x + 0.7, roofY + 0.012, roofY + 0.022, pad.z - 0.2, pad.z + 0.2, MAT.padPaint, 'pad-h');
    props.pad = { x: pad.x, y: roofY, z: pad.z };
    // The sniper nest on the north parapet: sandbags round two firing positions.
    K.sandbags(-8.6, -3.2, -42.9, false, 0.6);
    props.nest = [{ x: -7.4, y: roofY, z: -43.5 }, { x: -4.6, y: roofY, z: -43.5 }];
    // Roof clutter: an air unit, an aerial, crates of ammunition, a water tank.
    K.slab(2.0, 3.6, roofY, roofY + 1.1, -55.2, -53.6, MAT.metal, 'ac-unit');
    K.slab(-8.2, -6.6, roofY, roofY + 0.7, -55.4, -54.4, MAT.green, 'ammo-crate');
    K.slab(-8.2, -7.0, roofY + 0.7, roofY + 1.1, -55.4, -54.6, MAT.green, 'ammo-crate');
    K.post(6.8, -43.2, roofY, roofY + 6.5, 0.05, MAT.metal, 'aerial');
    props.roof = { y: roofY, stairDoor: { x: SHAFT.x0 - 0.8, z: SHAFT.z0 + 0.8 } };

    /* What is on each floor: the soldiers stand where `posts` says; the
       ammo crate and the map are props the mission reads. Floor 3 is the
       top, the operations room; floor 1 the aid station. */
    var DRESS = [
      { level: 0, posts: [[-4, -43.6], [2.6, -44.0]], crate: [-7.6, -44.6], map: [-5.5, -51.5], kind: 'lobby' },
      { level: 1, posts: [[-6.6, -52.0], [-2.0, -45.0]], crate: [-7.4, -44.4], map: [-1.5, -53.0], kind: 'aid' },
      { level: 2, posts: [[-3.0, -52.8], [1.2, -44.6]], crate: [-7.6, -55.0], map: [-6.0, -47.0], kind: 'radio' },
      { level: 3, posts: [[-6.8, -53.6], [-1.0, -44.4]], crate: [-7.6, -44.6], map: [-3.0, -49.5], kind: 'ops' },
    ];
    DRESS.forEach(function (d) {
      var y = d.level * F + (d.level === 0 ? 0.12 : 0);
      var fl = props.floors[d.level];
      fl.posts = d.posts; fl.kind = d.kind;
      // The ammunition crate, lid open.
      K.slab(d.crate[0] - 0.55, d.crate[0] + 0.55, y, y + 0.55, d.crate[1] - 0.35, d.crate[1] + 0.35, MAT.green, 'ammo-crate');
      K.deco(d.crate[0] - 0.55, d.crate[0] + 0.55, y + 0.55, y + 0.60, d.crate[1] + 0.33, d.crate[1] + 0.40, MAT.green, 'crate-lid');
      fl.crate = { x: d.crate[0], y: y + 0.6, z: d.crate[1] };
      // The map table: a trestle with a map spread on it.
      onLegsTable(K, d.map[0], d.map[1], y, 1.9, 1.1, MAT.wood, 'plan-table');
      K.deco(d.map[0] - 0.8, d.map[0] + 0.8, y + 0.92, y + 0.925, d.map[1] - 0.45, d.map[1] + 0.45, MAT.mapPaper, 'intel-map');
      fl.map = { x: d.map[0], y: y + 0.93, z: d.map[1] };
      // A ceiling lamp, warm.
      props.lamps.push({ at: [d.map[0], y + F - 0.4, d.map[1]], color: 0xffc890, intensity: 2.2, radius: 9 });
      if (d.kind === 'aid') {
        // Two cots with a man on one of them (the mission puts him there).
        K.slab(-6.4, -4.4, y, y + 0.45, -55.2, -54.4, MAT.green, 'cot');
        K.slab(-3.6, -1.6, y, y + 0.45, -55.2, -54.4, MAT.green, 'cot');
        fl.cot = { x: -5.4, y: y + 0.46, z: -54.8 };
      }
      if (d.kind === 'radio') {
        K.slab(-2.4, -0.2, y, y + 0.78, -55.4, -54.6, MAT.wood, 'desk');
        K.slab(-1.9, -0.9, y + 0.78, y + 1.18, -55.3, -54.8, MAT.metal, 'radio-set');
      }
      if (d.kind === 'lobby') {
        // Sandbags inside the front door.
        K.sandbags(-4.2, -2.0, -43.6, false, 1.0);
        K.sandbags(2.0, 4.2, -43.6, false, 1.0);
      }
    });
    props.hqDoor = { x: 0, z: HQ.z1 + 0.6 };
  }

  function onLegsTable(K, x, z, y, w, d, mat, name) {
    K.slab(x - w / 2, x + w / 2, y + 0.84, y + 0.9, z - d / 2, z + d / 2, mat, name);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      var lx = x + s[0] * (w / 2 - 0.08), lz = z + s[1] * (d / 2 - 0.08);
      K.deco(lx - 0.035, lx + 0.035, y, y + 0.84, lz - 0.035, lz + 0.035, mat, 'leg');
    });
  }

  /* ================================================================
     THE STREET
     ================================================================ */
  function buildStreet(K, props) {
    /* The blocks either side: shells with shopfronts below and windows
       above, two or three storeys, each its own colour. Some are burnt
       out (soot, no roof) and burning. Snipers work from six of the
       upper windows; behind those windows there is a floor to stand on. */
    var blocks = [
      // side, z0, z1, storeys, colour, burnt, sniper windows [z, storey]
      [-1, -40, -26, 2, 0, false, []], [-1, -26, -14, 3, 1, true, []], [-1, -14, 0, 2, 2, false, []],
      [-1, 0, 13, 3, 3, false, [[6.5, 2], [10.5, 1]]], [-1, 13, 26, 2, 4, true, [[19, 1]]], [-1, 26, 40, 3, 5, false, []],
      [-1, 40, 52, 2, 6, false, []],
      [1, -40, -28, 3, 7, false, []], [1, -28, -16, 2, 0, false, []], [1, -16, -2, 3, 1, true, []],
      [1, -2, 11, 2, 2, false, [[4.5, 1]]], [1, 11, 24, 3, 3, false, [[15.5, 2], [21, 1]]], [1, 24, 38, 2, 4, true, []],
      [1, 38, 52, 3, 5, false, []],
    ];
    blocks.forEach(function (bk, i) {
      var side = bk[0], z0 = bk[1], z1 = bk[2], storeys = bk[3], wall = WALLS[bk[4]], burnt = bk[5];
      var xIn = side * 9.6, xOut = side * 22, t = 0.3;
      var fx0 = Math.min(xIn, xIn + side * t), fx1 = Math.max(xIn, xIn + side * t);
      var H = storeys * F;
      for (var s = 0; s < storeys; s++) {
        var gaps = [];
        if (s === 0) {
          // Shopfronts: wide openings with a stub between.
          for (var z = z0 + 1.2; z < z1 - 2.6; z += 4.2) gaps.push([z, z + 2.6, s === 0 ? 0.0 : 1.0, 2.6]);
        } else {
          for (var z2 = z0 + 1.4; z2 < z1 - 1.4; z2 += 2.8) gaps.push([z2, z2 + 1.2, 0.9, 2.3]);
        }
        K.wall(fx0, fx1, z0, z1, F, burnt && s === storeys - 1 ? MAT.soot : wall, gaps, 'facade', { base: s * F });
      }
      // Side and back walls as plain slabs (the blocks are not entered; only the snipers' rooms are).
      var bx0 = Math.min(xIn, xOut), bx1 = Math.max(xIn, xOut);
      K.slab(bx0, bx1, 0, H, z0, z0 + t, wall, 'party-wall');
      K.slab(bx0, bx1, 0, H, z1 - t, z1, wall, 'party-wall');
      K.slab(Math.min(xOut, xOut - side * t), Math.max(xOut, xOut - side * t), 0, H, z0, z1, wall, 'back-wall');
      // A dark interior a step behind the facade, so the shop and window openings read as rooms, not sky.
      var ix = side * 13.2;
      K.deco(Math.min(ix, ix + side * 0.2), Math.max(ix, ix + side * 0.2), 0, H, z0 + t, z1 - t, MAT.soot, 'interior');
      K.slab(Math.min(xIn, ix), Math.max(xIn, ix), 0, 0.12, z0 + t, z1 - t, MAT.floor, 'shop-floor');
      for (var s2 = 1; s2 < storeys; s2++) K.slab(Math.min(xIn + side * t, ix), Math.max(xIn + side * t, ix), s2 * F - 0.2, s2 * F, z0 + t, z1 - t, MAT.floor, 'block-floor');
      if (!burnt) {
        K.slab(bx0, bx1, H, H + 0.25, z0, z1, MAT.roof, 'block-roof');
        K.slab(Math.min(xIn, xIn - side * 0.4), Math.max(xIn, xIn - side * 0.4), H, H + 0.8, z0, z1, wall, 'cornice');
      } else {
        // Gutted: no roof, black inside, and on fire.
        props.fires.push({ at: [side * 14, H - 0.6, (z0 + z1) / 2], r: 5, rate: 9, size: 1.6, glow: 6 });
        props.smoke.push({ at: [side * 15, H + 1, (z0 + z1) / 2], r: 4, rate: 2.2, size: 5, life: 9 });
      }
      bk[6].forEach(function (sw) {
        props.snipers.push({ x: side * 10.6, y: sw[1] * F, z: sw[0] + 0.6, face: -side, window: { x: xIn, y: sw[1] * F + 1.6, z: sw[0] + 0.6 } });
      });
    });

    /* The street furniture: what it is to fight down this road. Burnt
       cars, a bus on its side, rubble where facades came down, sandbags
       and barriers where someone tried to hold it. */
    var burnt = { color: 0x2e2a27, texture: 'rust', roughness: 0.9, metalness: 0.3, uvScale: 1 };
    K.car(-4.2, -24, true, burnt); K.car(3.6, -12, false, burnt); K.car(-3.0, 2, true, burnt);
    K.car(4.5, 29, true, burnt); K.car(-4.8, 36, false, burnt);
    props.fires.push({ at: [3.6, 1.2, -12], r: 1.5, rate: 6, size: 0.9, glow: 3 });
    props.fires.push({ at: [4.5, 1.2, 29], r: 1.5, rate: 6, size: 0.9, glow: 3 });
    // A bus on its side across half the road.
    K.slab(1.0, 6.5, 0, 2.5, 16.5, 27.5, { color: 0xb88a2a, texture: 'paint', roughness: 0.7, metalness: 0.2, uvScale: 1 }, 'bus');
    K.deco(0.95, 1.0, 0.6, 1.9, 17, 27, { color: 0x1a1c1e, texture: 'smooth', roughness: 0.3, metalness: 0 }, 'bus-windows');
    // Rubble heaps where facades fell.
    [[-6.2, -18, 3.2], [6.0, -5, 2.6], [-6.4, 22, 3.6], [5.8, 42, 2.8]].forEach(function (r) {
      for (var i = 0; i < 7; i++) {
        var a = i * 2.4, rr = r[2] * (0.4 + (i % 3) * 0.25);
        var cx = r[0] + Math.cos(a) * rr * 0.4, cz = r[1] + Math.sin(a) * rr * 0.6;
        K.game.box({ at: [cx, 0.25 + (i % 2) * 0.2, cz], size: [rr * 0.6, 0.5 + (i % 3) * 0.2, rr * 0.5],
          rotation: [i * 11, i * 37, i * 7], material: MAT.rubble, physics: false });
      }
      K.slab(r[0] - r[2] * 0.4, r[0] + r[2] * 0.4, 0, 0.7, r[1] - r[2] * 0.5, r[1] + r[2] * 0.5, MAT.rubble, 'rubble');
    });
    K.sandbags(-6.6, -2.6, -30, false, 1.0);
    K.sandbags(2.4, 6.4, -20, false, 1.0);
    K.sandbags(-6.8, -2.8, 12, false, 1.0);
    K.jersey(-1.5, -3, false); K.jersey(1.6, 8, false);
    // A street lamp every 12 m, dead.
    for (var z = -36; z < 52; z += 12) {
      K.post(-7.5, z, 0, 5.2, 0.07, MAT.metal, 'lamp-post');
      K.post(7.5, z + 6, 0, 5.2, 0.07, MAT.metal, 'lamp-post');
    }
    /* The crash site: clear road where the helicopter comes down. The
       mortar: knocked on its side behind a broken garden wall on the west
       pavement, with a stack of rounds. */
    props.crash = { x: 0.4, z: 6.0 };
    K.slab(-9.4, -7.2, 0, 1.1, 14.0, 20.0, WALLS[3], 'garden-wall');
    props.mortar = { x: -4.6, z: 14.5, cover: { x: -8.2, z: 17 } };
    props.mortarRounds = { x: -8.6, z: 13.4 };
    // The end of the street: a low wall across the plaza, then the hill.
    K.slab(-9.6, 9.6, 0, 1.0, 52.0, 52.6, MAT.hq, 'plaza-wall');
    props.plaza = { x: 0, z: 50 };
  }

  /* ================================================================
     THE HILL, where the tanks come from
     ================================================================ */
  function buildHill(K, props) {
    // A long slope up to a crest 18 m above the street, 80 m beyond the plaza wall.
    var ang = Math.atan2(18, 70) * 180 / Math.PI;
    K.game.box({ at: [0, 9 - 0.6, 89], size: [260, 1.2, 72.5], rotation: [-ang, 0, 0], material: MAT.hill, physics: false });
    K.game.box({ at: [0, 17.4, 150], size: [260, 1.2, 50], material: MAT.grassDry, physics: false });
    K.game.box({ at: [0, 0.2, 56], size: [260, 0.6, 6], material: MAT.hill, physics: false });
    props.hill = { crest: { y: 18.2, z: 126 }, slope: ang, foot: 56 };
    // Smoke drifting off the hill from things already burning there.
    props.smoke.push({ at: [-30, 14, 112], r: 6, rate: 1.6, size: 7, life: 11 });
    props.smoke.push({ at: [40, 16, 120], r: 6, rate: 1.4, size: 7, life: 11 });
  }

  /* ================================================================
     THE CITY, burning, out to the horizon
     ================================================================ */
  function buildCity(K, props) {
    var rng = (function (s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })(1999);
    for (var i = 0; i < 160; i++) {
      var a = rng() * Math.PI * 2, r = 40 + rng() * 380;
      var x = Math.cos(a) * r, z = Math.sin(a) * r - 20;
      // Keep the street, the hill and the office clear.
      if (Math.abs(x) < 26 && z > -70 && z < 60) continue;
      if (z > 55 && Math.abs(x) < 140 && z < 170) continue;
      var w = 8 + rng() * 14, d = 8 + rng() * 14, h = 4 + rng() * 22;
      var burnt = rng() < 0.38;
      K.game.box({ at: [x, h / 2, z], size: [w, h, d], material: burnt ? MAT.soot : WALLS[Math.floor(rng() * WALLS.length)], physics: false });
      if (!burnt && rng() < 0.4) K.game.box({ at: [x, h + 0.6, z], size: [w * 1.02, 1.2, d * 1.02], material: MAT.tileRoof, physics: false });
      if (burnt && rng() < 0.55 && props.fires.length < 34) props.fires.push({ at: [x, h, z], r: Math.min(w, d) * 0.6, rate: 5, size: 2.6 });
      if (burnt && rng() < 0.5 && props.smoke.length < 26) props.smoke.push({ at: [x, h + 2, z], r: 4, rate: 1.2, size: 9, life: 14 });
    }
  }

  /* ================================================================
     THE OFFICE: the debrief, a sealed room far to the west
     ================================================================ */
  function buildOffice(K, props) {
    var ox = -300, oz = 0, y = 0;
    var X0 = ox - 5, X1 = ox + 5, Z0 = oz - 4, Z1 = oz + 4, H = 3.0;
    var wallM = plaster(0xc9c2b2);
    K.slab(X0, X1, y, y + 0.1, Z0, Z1, { color: 0x6a5240, texture: 'wood', roughness: 0.7, metalness: 0, uvScale: 0.8 }, 'office-floor');
    K.wall(X0, X1, Z0, Z0 + 0.2, H, wallM, [[ox + 2.4, ox + 3.6, 1.0, 2.2]], 'office-wall');
    K.wall(X0, X1, Z1 - 0.2, Z1, H, wallM, [[ox - 4.2, ox - 3.1]], 'office-wall');        // the door out
    K.wall(X0, X0 + 0.2, Z0, Z1, H, wallM, [], 'office-wall');
    K.wall(X1 - 0.2, X1, Z0, Z1, H, wallM, [], 'office-wall');
    K.slab(X0, X1, H, H + 0.2, Z0, Z1, plaster(0xd8d2c4), 'office-ceiling');
    // Lincoln's desk at the north end, and the table the team sits round in front of it.
    K.slab(ox - 1.2, ox + 1.2, 0, 0.78, oz + 2.2, oz + 3.1, MAT.wood, 'desk');
    onLegsTable(K, ox, oz - 0.2, 0, 3.0, 1.3, MAT.wood, 'table');
    // Chairs: four round the table.
    var chairs = [[-0.9, -1.25, 0], [0.9, -1.25, 0], [-0.9, 0.85, 180], [0.9, 0.85, 180]];
    chairs.forEach(function (c) {
      K.slab(ox + c[0] - 0.24, ox + c[0] + 0.24, 0.42, 0.47, oz + c[1] - 0.24, oz + c[1] + 0.24, MAT.wood, 'chair');
      var bz = c[2] ? oz + c[1] + 0.22 : oz + c[1] - 0.22;
      K.deco(ox + c[0] - 0.24, ox + c[0] + 0.24, 0.47, 0.95, bz - 0.03, bz + 0.03, MAT.wood, 'chair-back');
    });
    // A filing cabinet in the corner where Molotov stands, a flag, a map on the wall.
    K.slab(X1 - 0.8, X1 - 0.25, 0, 1.35, Z0 + 0.3, Z0 + 0.9, MAT.metal, 'cabinet');
    K.deco(X0 + 0.21, X0 + 0.23, 1.0, 2.2, oz - 1.4, oz + 1.4, MAT.mapPaper, 'wall-map');
    props.office = {
      at: { x: ox, z: oz }, desk: { x: ox, z: oz + 2.65 }, table: { x: ox, y: 0.9, z: oz - 0.2 },
      chairs: chairs.map(function (c) { return { x: ox + c[0], z: oz + c[1], yaw: c[2] }; }),
      corner: { x: X1 - 0.9, z: Z0 + 1.4 }, door: { x: ox - 3.65, z: Z1 + 0.6 },
      lamp: { at: [ox, H - 0.3, oz], color: 0xffe0b0, intensity: 3, radius: 10 },
    };
  }

  W.MP_EXTRA_MAPS = W.MP_EXTRA_MAPS || {};
  W.MP_EXTRA_MAPS.colombia = {
    build: buildColombia,
    // Sunset: the sun low in the west, orange on everything, haze from the fires.
    sky: { sky: 'sunset', hours: 17.4, exposure: 1.05, fog: 0xa07060, fogDensity: 0.0075, ground: 0x8a8378 },
  };
})();
