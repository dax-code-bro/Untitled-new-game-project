/*
 * Untitled Horror Game — the facility.
 *
 * Floorplan, geometry and props. Walls are generated from room rectangles
 * with doorway gaps punched out, so the layout is edited as data rather
 * than as hand-placed meshes.
 *
 * Exposes:
 *   window.LEVEL                     — the floorplan data
 *   window.buildLevel(THREE, scene)  — builds it, returns colliders,
 *                                      interactables and per-frame updates
 */
(function () {
  'use strict';

  var WALL_H = 3.4;
  var WALL_T = 0.18;

  // -------------------------------------------------------------------
  // Floorplan. The corridors are deliberately long — you should lose
  // sight of both ends of them.
  // -------------------------------------------------------------------
  var ROOMS = [
    { id: 'waiting',   name: 'Waiting',               x1: -8,  z1: -7,   x2: 8,   z2: 7,   tone: 'lobby' },

    { id: 'hallL',     name: 'West Corridor',         x1: -48, z1: -1.5, x2: -8,  z2: 1.5, tone: 'hall' },
    { id: 'restrooms', name: 'Restrooms',             x1: -22, z1: -9.5, x2: -15, z2: -1.5, tone: 'tile' },
    { id: 'warehouse', name: 'Warehouse',             x1: -64, z1: -10,  x2: -48, z2: 7,   tone: 'industrial', h: 5.2 },

    { id: 'hallR',     name: 'East Corridor',         x1: 8,   z1: -1.5, x2: 48,  z2: 1.5, tone: 'hall' },
    { id: 'office',    name: 'Corporate Office',      x1: 22,  z1: -14,  x2: 34,  z2: -1.5, tone: 'wood' },

    { id: 'hallE',     name: 'East Junction',         x1: 48,  z1: -1.5, x2: 56,  z2: 1.5, tone: 'hall' },
    { id: 'storage',   name: 'Storage Unit',          x1: 56,  z1: -5,   x2: 64,  z2: 5,   tone: 'industrial' },

    { id: 'hallS',     name: 'South Corridor',        x1: 48,  z1: 1.5,  x2: 51,  z2: 46,  tone: 'hall' },
    { id: 'assembly',  name: 'Assembly',              x1: 42,  z1: 46,   x2: 58,  z2: 60,  tone: 'industrial', h: 5.2 },

    { id: 'link',      name: 'Airlock',               x1: 58,  z1: 51,   x2: 62,  z2: 54,  tone: 'lab' },
    { id: 'exterm',    name: 'Extermination Chamber', x1: 62,  z1: 48,   x2: 74,  z2: 58,  tone: 'lab' },

    { id: 'supply',    name: 'Supply Storage',        x1: 62,  z1: 58,   x2: 68,  z2: 64,  tone: 'industrial' },
    { id: 'bath2',     name: 'Restroom',              x1: 68,  z1: 58,   x2: 74,  z2: 64,  tone: 'tile' }
  ];

  // axis 'x' → a gap in a wall plane at constant x (running along Z)
  var DOORS = [
    { axis: 'x', at: -8,  min: -1.5, max: 1.5 },     // waiting → west corridor
    { axis: 'x', at: 8,   min: -1.5, max: 1.5 },     // waiting → east corridor
    { axis: 'z', at: -1.5, min: -20, max: -17 },     // west corridor → restrooms
    { axis: 'x', at: -48, min: -1.5, max: 1.5 },     // west corridor → warehouse
    { axis: 'z', at: -1.5, min: 26,  max: 29 },      // east corridor → office
    { axis: 'x', at: 48,  min: -1.5, max: 1.5 },     // east corridor → junction
    { axis: 'z', at: 1.5, min: 48,   max: 51 },      // junction → south corridor
    { axis: 'x', at: 56,  min: -1.5, max: 1.5, id: 'storageDoor' },
    { axis: 'z', at: 46,  min: 48,   max: 51 },      // south corridor → assembly
    { axis: 'x', at: 58,  min: 51,   max: 54 },      // assembly → airlock
    { axis: 'x', at: 62,  min: 51,   max: 54 },      // airlock → extermination
    { axis: 'z', at: 58,  min: 63.5, max: 65.5 },    // extermination → supply
    { axis: 'z', at: 58,  min: 70,   max: 72 }       // extermination → restroom
  ];

  // The two tempered-glass entrance doors. Sealed — the way in, not out.
  var ENTRANCE = { axis: 'z', at: 7, min: -1.6, max: 1.6 };

  window.LEVEL = { rooms: ROOMS, doors: DOORS, wallHeight: WALL_H };

  // -------------------------------------------------------------------
  function spans(min, max, gaps) {
    var out = [];
    var cuts = gaps.slice().sort(function (a, b) { return a.min - b.min; });
    var cursor = min;
    for (var i = 0; i < cuts.length; i++) {
      var g = cuts[i];
      if (g.max <= min || g.min >= max) continue;
      if (g.min > cursor) out.push({ min: cursor, max: Math.min(g.min, max) });
      cursor = Math.max(cursor, g.max);
    }
    if (cursor < max) out.push({ min: cursor, max: max });
    return out;
  }

  function mergeIntervals(iv) {
    iv.sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    for (var i = 0; i < iv.length; i++) {
      var last = out[out.length - 1];
      if (last && iv[i][0] <= last[1] + 0.001) last[1] = Math.max(last[1], iv[i][1]);
      else out.push([iv[i][0], iv[i][1]]);
    }
    return out;
  }

  window.buildLevel = function buildLevel(THREE, scene, renderer, camera) {
    var colliders = [];
    var interactables = [];
    var updates = [];
    var lights = [];

    var group = new THREE.Group();
    scene.add(group);

    // ---------------- Surfaces ----------------
    var T = window.TEX;
    var texConcrete   = T.concrete(THREE, 512, 128, { formwork: true, cracks: 4, repeat: [3, 1.4] });
    var texConcreteFl = T.concrete(THREE, 512, 104, { speckle: 3200, cracks: 5, grime: 9, repeat: [8, 8] });
    var texCeiling    = T.concrete(THREE, 512, 96,  { speckle: 1500, cracks: 2, grime: 7, repeat: [6, 6] });
    var texTile       = T.tile(THREE, 512, { repeat: [4, 3] });
    var texTileFloor  = T.tile(THREE, 512, { cells: 10, grime: 14, repeat: [6, 6] });
    var texMetal      = T.metal(THREE, 512, 108, { rust: 7, repeat: [2, 2] });
    var texCarpet     = T.carpet(THREE, 512, [78, 84, 92], { repeat: [10, 10] });
    var texWoodWall   = T.wood(THREE, 512, [96, 72, 46], { knots: 3, repeat: [3, 1.2] });
    var texCounter    = T.wood(THREE, 512, [140, 108, 68], { knots: 1, repeat: [1, 1] });
    var texDeskWood   = T.wood(THREE, 512, [72, 52, 32], { knots: 2, repeat: [2, 1] });

    var MAT = {
      wall: new THREE.MeshStandardMaterial({ color: 0x9aa1a4, map: texConcrete, bumpMap: texConcrete, bumpScale: 0.45, roughness: 0.95 }),
      wallHall: new THREE.MeshStandardMaterial({ color: 0x8e9598, map: texConcrete, bumpMap: texConcrete, bumpScale: 0.45, roughness: 0.95 }),
      wallTile: new THREE.MeshStandardMaterial({ color: 0xa9adad, map: texTile, bumpMap: texTile, bumpScale: 0.18, roughness: 0.32, metalness: 0.03 }),
      wallLab: new THREE.MeshStandardMaterial({ color: 0xa2adb0, map: texConcrete, bumpMap: texConcrete, bumpScale: 0.22, roughness: 0.55 }),
      wallWood: new THREE.MeshStandardMaterial({ color: 0x8f7a5e, map: texWoodWall, bumpMap: texWoodWall, bumpScale: 0.2, roughness: 0.78 }),
      floor: new THREE.MeshStandardMaterial({ color: 0x8b9295, map: texConcreteFl, bumpMap: texConcreteFl, bumpScale: 0.5, roughness: 0.94 }),
      carpet: new THREE.MeshStandardMaterial({ color: 0x6a7079, map: texCarpet, bumpMap: texCarpet, bumpScale: 0.65, roughness: 1 }),
      tileFloor: new THREE.MeshStandardMaterial({ color: 0x9fa3a3, map: texTileFloor, bumpMap: texTileFloor, bumpScale: 0.22, roughness: 0.38, metalness: 0.03 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x7f868a, map: texCeiling, bumpMap: texCeiling, bumpScale: 0.3, roughness: 1 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x6f7679, map: texMetal, bumpMap: texMetal, bumpScale: 0.14, roughness: 0.52, metalness: 0.55 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x33383b, roughness: 0.6, metalness: 0.5 }),
      bulkhead: new THREE.MeshStandardMaterial({ color: 0x878d90, roughness: 0.85 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x7a5c3c, roughness: 0.75 }),
      darkWood: new THREE.MeshStandardMaterial({ color: 0x6a5238, map: texDeskWood, bumpMap: texDeskWood, bumpScale: 0.14, roughness: 0.78 }),
      counter: new THREE.MeshStandardMaterial({ color: 0xa08a66, map: texCounter, bumpMap: texCounter, bumpScale: 0.1, roughness: 0.45 }),
      plastic: new THREE.MeshStandardMaterial({ color: 0x2c2f31, roughness: 0.7 }),
      fabric: new THREE.MeshStandardMaterial({ color: 0x3d4550, roughness: 0.95 }),
      paper: new THREE.MeshStandardMaterial({ color: 0xd8d4c6, roughness: 0.95 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xa8c0c4, roughness: 0.55, metalness: 0.1, transparent: true, opacity: 0.55 }),
      body: new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.95 }),
      blood: new THREE.MeshStandardMaterial({ color: 0x3a1512, roughness: 0.6 })
    };

    var BOOK_MATS = [];
    for (var bi = 0; bi < 5; bi++) {
      BOOK_MATS.push(new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.06 + bi * 0.022, 0.28, 0.15 + bi * 0.045), roughness: 0.9
      }));
    }
    function bookMat(i) { return BOOK_MATS[i % BOOK_MATS.length]; }

    function wallMatFor(tone) {
      if (tone === 'tile') return MAT.wallTile;
      if (tone === 'lab') return MAT.wallLab;
      if (tone === 'wood') return MAT.wallWood;
      if (tone === 'hall') return MAT.wallHall;
      return MAT.wall;
    }
    function floorMatFor(tone) {
      if (tone === 'tile') return MAT.tileFloor;
      if (tone === 'lobby' || tone === 'wood') return MAT.carpet;
      return MAT.floor;
    }

    // ---------------- Primitives ----------------
    function box(w, h, d, mat, x, y, z, ry) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      if (ry) m.rotation.y = ry;
      m.receiveShadow = true;
      group.add(m);
      return m;
    }
    function cyl(rt, rb, h, mat, x, y, z, seg) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), mat);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      group.add(m);
      return m;
    }
    function solid(x1, z1, x2, z2, id) {
      colliders.push({ x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2), id: id || null });
    }
    function interact(mesh, data) {
      mesh.userData.interact = data;
      interactables.push(mesh);
      return mesh;
    }
    // Position on a ring, with the mesh's +Z face pointing outward.
    function ringAt(cx, cz, r, theta) {
      return { x: cx + Math.sin(theta) * r, z: cz + Math.cos(theta) * r, ry: theta };
    }

    // ---------------- Floors and ceilings ----------------
    ROOMS.forEach(function (r) {
      var w = r.x2 - r.x1, d = r.z2 - r.z1;
      var cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
      var h = r.h || WALL_H;

      var fm = floorMatFor(r.tone);
      var f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), fm);
      f.rotation.x = -Math.PI / 2;
      f.position.set(cx, 0, cz);
      f.receiveShadow = true;
      group.add(f);

      var c = new THREE.Mesh(new THREE.PlaneGeometry(w, d), MAT.ceiling);
      c.rotation.x = Math.PI / 2;
      c.position.set(cx, h, cz);
      c.receiveShadow = true;
      group.add(c);
    });

    // ---------------- Walls ----------------
    // Wall planes are merged across rooms before they are built. Building
    // per-room would place two coincident faces wherever rooms share a
    // plane, which z-fights, and the long corridors share a lot of planes.
    var planes = {};
    var wallBoxes = [];
    function addEdge(axis, at, mn, mx, h, mat) {
      var key = axis + '|' + at.toFixed(3);
      if (!planes[key]) planes[key] = { axis: axis, at: at, iv: [], h: h, mat: mat };
      planes[key].iv.push([mn, mx]);
      planes[key].h = Math.max(planes[key].h, h);
    }
    ROOMS.forEach(function (r) {
      var h = r.h || WALL_H, mat = wallMatFor(r.tone);
      addEdge('x', r.x1, r.z1, r.z2, h, mat);
      addEdge('x', r.x2, r.z1, r.z2, h, mat);
      addEdge('z', r.z1, r.x1, r.x2, h, mat);
      addEdge('z', r.z2, r.x1, r.x2, h, mat);
    });

    var allGaps = DOORS.concat([ENTRANCE]);
    Object.keys(planes).forEach(function (key) {
      var pl = planes[key];
      var gaps = allGaps.filter(function (g) { return g.axis === pl.axis && Math.abs(g.at - pl.at) < 0.001; });
      mergeIntervals(pl.iv).forEach(function (iv) {
        spans(iv[0], iv[1], gaps).forEach(function (s) {
          var len = s.max - s.min, mid = (s.min + s.max) / 2;
          if (len < 0.02) return;
          if (pl.axis === 'x') {
            box(WALL_T, pl.h, len, pl.mat, pl.at, pl.h / 2, mid);
            solid(pl.at - WALL_T / 2, s.min, pl.at + WALL_T / 2, s.max);
            wallBoxes.push({ x1: pl.at - WALL_T / 2, z1: s.min, x2: pl.at + WALL_T / 2, z2: s.max });
          } else {
            box(len, pl.h, WALL_T, pl.mat, mid, pl.h / 2, pl.at);
            solid(s.min, pl.at - WALL_T / 2, s.max, pl.at + WALL_T / 2);
            wallBoxes.push({ x1: s.min, z1: pl.at - WALL_T / 2, x2: s.max, z2: pl.at + WALL_T / 2 });
          }
        });
      });
    });

    // Lintels above each doorway, up to whatever the plane's height is.
    allGaps.forEach(function (g) {
      var pl = planes[g.axis + '|' + g.at.toFixed(3)];
      var top = pl ? pl.h : WALL_H;
      var lintel = 2.25;
      if (top - lintel < 0.05) return;
      if (g.axis === 'x') box(WALL_T, top - lintel, g.max - g.min, MAT.wall, g.at, lintel + (top - lintel) / 2, (g.min + g.max) / 2);
      else box(g.max - g.min, top - lintel, WALL_T, MAT.wall, (g.min + g.max) / 2, lintel + (top - lintel) / 2, g.at);
    });

    // ---------------- Lighting ----------------
    scene.add(new THREE.HemisphereLight(0x93a8ba, 0x2a2f32, 0.85));
    scene.add(new THREE.AmbientLight(0x5f7080, 0.40));

    // style: 'steady' | 'buzz' | 'dying' | 'strobe'
    function batten(x, z, y, colour, intensity, dist, style, len) {
      var panel = box(len || 1.5, 0.06, 0.34, new THREE.MeshStandardMaterial({
        color: 0xf2f4f0, emissive: colour, emissiveIntensity: 1.6, roughness: 0.4
      }), x, (y || WALL_H) - 0.07, z);
      var l = new THREE.PointLight(colour, intensity, dist, 1.8);
      l.position.set(x, (y || WALL_H) - 0.3, z);
      group.add(l);
      lights.push({
        light: l, panel: panel, base: intensity,
        style: style || 'steady', seed: Math.random() * 100
      });
      return l;
    }

    // ===================================================================
    // WAITING — reception island with a bulkhead over it
    // ===================================================================
    var ISLAND = { x: 0, z: -3.0, r: 2.7 };
    var BULK = { inner: 2.15, outer: 3.3, bottom: 2.2 };
    // The gap in the counter you walk through to get behind it.
    var GAP_FROM = Math.PI * 0.86, GAP_TO = Math.PI * 1.14;

    (function waitingRoom() {
      // ---- the island counter ----
      var COUNTER_Y = 1.05;
      var step = 0.075;
      for (var a = 0; a < Math.PI * 2 - 0.0001; a += step) {
        if (a > GAP_FROM && a < GAP_TO) continue;
        var p = ringAt(ISLAND.x, ISLAND.z, ISLAND.r, a);
        box(0.30, COUNTER_Y, 0.24, MAT.darkWood, p.x, COUNTER_Y / 2, p.z, p.ry);
        var t = ringAt(ISLAND.x, ISLAND.z, ISLAND.r + 0.04, a);
        box(0.34, 0.07, 0.5, MAT.counter, t.x, COUNTER_Y + 0.035, t.z, t.ry);
        solid(p.x - 0.19, p.z - 0.19, p.x + 0.19, p.z + 0.19);
      }

      // ---- the bulkhead: a dropped soffit island above the counter ----
      var bstep = 0.1;
      for (var b = 0; b < Math.PI * 2 - 0.0001; b += bstep) {
        var po = ringAt(ISLAND.x, ISLAND.z, BULK.outer, b);
        box(0.36, WALL_H - BULK.bottom, 0.14, MAT.bulkhead, po.x, (WALL_H + BULK.bottom) / 2, po.z, po.ry);
        var pi = ringAt(ISLAND.x, ISLAND.z, BULK.inner, b);
        box(0.26, WALL_H - BULK.bottom, 0.14, MAT.bulkhead, pi.x, (WALL_H + BULK.bottom) / 2, pi.z, pi.ry);
      }
      var soffit = new THREE.Mesh(new THREE.RingGeometry(BULK.inner, BULK.outer, 48), MAT.bulkhead);
      soffit.rotation.x = Math.PI / 2;   // faces down
      soffit.position.set(ISLAND.x, BULK.bottom, ISLAND.z);
      group.add(soffit);

      // recessed downlights in the underside of the bulkhead
      for (var d = 0; d < 6; d++) {
        var ang = (d / 6) * Math.PI * 2 + 0.4;
        var dp = ringAt(ISLAND.x, ISLAND.z, (BULK.inner + BULK.outer) / 2, ang);
        var disc = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), new THREE.MeshStandardMaterial({
          color: 0xffffff, emissive: 0xffe9c8, emissiveIntensity: 1.5, roughness: 0.4
        }));
        disc.rotation.x = Math.PI / 2;
        disc.position.set(dp.x, BULK.bottom - 0.012, dp.z);
        group.add(disc);
      }
      batten(ISLAND.x, ISLAND.z, BULK.bottom - 0.1, 0xffe4c4, 9, 9, 'buzz', 0.4);

      // ---- four screens on the bulkhead, one of them alive ----
      var SCREENS = [
        { theta: 0,              state: 'main' },      // faces the entrance
        { theta: Math.PI * 0.5,  state: 'cracked' },
        { theta: Math.PI,        state: 'smashed' },
        { theta: Math.PI * 1.5,  state: 'smashed' }
      ];
      var mainScreen = null;
      SCREENS.forEach(function (sc) {
        var m = ringAt(ISLAND.x, ISLAND.z, BULK.outer + 0.09, sc.theta);
        box(1.34, 0.82, 0.07, MAT.darkMetal, m.x, 2.78, m.z, m.ry);
        var f = ringAt(ISLAND.x, ISLAND.z, BULK.outer + 0.135, sc.theta);
        var mat;
        if (sc.state === 'main') {
          mat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.3 });
        } else {
          var tex = (function () {
            var c = document.createElement('canvas'); c.width = 256; c.height = 160;
            var x = c.getContext('2d');
            x.fillStyle = sc.state === 'smashed' ? '#050607' : '#0a0c0e';
            x.fillRect(0, 0, 256, 160);
            x.strokeStyle = 'rgba(170,180,190,0.45)';
            var n = sc.state === 'smashed' ? 26 : 10;
            for (var i = 0; i < n; i++) {
              x.beginPath();
              var sx = 128 + (Math.random() - 0.5) * 90, sy = 80 + (Math.random() - 0.5) * 60;
              x.moveTo(sx, sy);
              for (var s2 = 0; s2 < 4; s2++) { sx += (Math.random() - 0.5) * 90; sy += (Math.random() - 0.5) * 80; x.lineTo(sx, sy); }
              x.stroke();
            }
            if (sc.state === 'smashed') { x.fillStyle = '#000'; x.beginPath(); x.arc(128, 80, 34, 0, Math.PI * 2); x.fill(); }
            return new THREE.CanvasTexture(c);
          })();
          mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3 });
        }
        var scr = box(1.2, 0.7, 0.02, mat, f.x, 2.78, f.z, f.ry);
        if (sc.state === 'main') mainScreen = scr;
      });

      // The surviving screen: a stylised highlight reel, drawn procedurally.
      // (Real broadcast footage is not something this build can ship.)
      var tvCanvas = document.createElement('canvas');
      tvCanvas.width = 480; tvCanvas.height = 300;
      var tvCtx = tvCanvas.getContext('2d');
      var tvTex = new THREE.CanvasTexture(tvCanvas);
      mainScreen.material = new THREE.MeshStandardMaterial({
        map: tvTex, emissiveMap: tvTex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.3
      });
      var tvLight = new THREE.PointLight(0xbfd4e6, 0, 10, 2);
      tvLight.position.set(ISLAND.x, 2.7, ISLAND.z + BULK.outer + 0.8);
      group.add(tvLight);

      var tvState = { on: false, t: 0, dead: false };
      window.__tvState = tvState;

      function drawHighlight(t) {
        var W = 480, H = 300, x = tvCtx;
        x.fillStyle = '#0d1a12'; x.fillRect(0, 0, W, H);
        var grd = x.createLinearGradient(0, 120, 0, H);
        grd.addColorStop(0, '#8a6534'); grd.addColorStop(1, '#5d4322');
        x.fillStyle = grd; x.fillRect(0, 120, W, H - 120);
        for (var c = 0; c < 260; c++) {
          x.fillStyle = 'hsl(' + ((c * 53) % 360) + ',18%,' + (14 + (c % 5) * 3) + '%)';
          x.fillRect((c * 37 % W), 20 + (c * 17 % 96), 4, 4);
        }
        x.strokeStyle = '#d8d2c4'; x.lineWidth = 4; x.strokeRect(300, 60, 86, 58);
        x.strokeStyle = '#e2662c'; x.lineWidth = 5;
        x.beginPath(); x.ellipse(343, 122, 26, 7, 0, 0, Math.PI * 2); x.stroke();
        x.strokeStyle = 'rgba(230,230,220,0.7)'; x.lineWidth = 1;
        for (var nn = 0; nn < 9; nn++) { x.beginPath(); x.moveTo(319 + nn * 6, 124); x.lineTo(325 + nn * 4, 150); x.stroke(); }

        var cycle = t % 6, px, py, arm;
        if (cycle < 2.2) { px = 60 + (cycle / 2.2) * 190; py = 210; arm = 0.2; }
        else if (cycle < 3.4) { var u = (cycle - 2.2) / 1.2; px = 250 + u * 62; py = 210 - Math.sin(u * Math.PI * 0.62) * 118; arm = 0.2 + u * 1.2; }
        else if (cycle < 4.0) { px = 312; py = 96; arm = 1.5; }
        else if (cycle < 4.5) { var v = (cycle - 4.0) / 0.5; px = 312; py = 96 + v * 40; arm = 1.5 - v * 0.6; }
        else { var w2 = (cycle - 4.5) / 1.5; px = 312 - w2 * 30; py = 136 + w2 * 74; arm = 0.3; }

        x.fillStyle = '#12100e';
        x.beginPath(); x.arc(px, py - 46, 11, 0, Math.PI * 2); x.fill();
        x.fillRect(px - 10, py - 36, 20, 34);
        x.save(); x.translate(px, py - 30); x.rotate(-arm); x.fillRect(-4, -40, 8, 42); x.restore();
        x.fillRect(px - 16, py - 26, 8, 24);
        var stride = Math.sin(t * 7) * 9;
        x.fillRect(px - 10, py - 2, 8, 26 + stride * 0.3);
        x.fillRect(px + 2, py - 2, 8, 26 - stride * 0.3);
        var ballY = cycle < 4.0 ? py - 74 - Math.max(0, arm - 0.4) * 12 : 130 + (cycle - 4) * 60;
        x.fillStyle = '#e2662c';
        x.beginPath(); x.arc(cycle < 4.0 ? px + Math.sin(arm) * 30 : 330, ballY, 9, 0, Math.PI * 2); x.fill();

        x.fillStyle = 'rgba(6,8,10,0.82)'; x.fillRect(14, 14, 172, 34);
        x.fillStyle = '#e8e2d0'; x.font = 'bold 17px monospace';
        x.fillText('CHI 42  ·  ' + (78 + Math.floor(t / 6)), 24, 37);
        x.fillStyle = 'rgba(6,8,10,0.82)'; x.fillRect(W - 92, 14, 78, 26);
        x.fillStyle = '#c9b06a'; x.font = 'bold 14px monospace'; x.fillText('1991', W - 80, 32);

        x.globalAlpha = 0.10;
        for (var sl = 0; sl < H; sl += 3) { x.fillStyle = '#000'; x.fillRect(0, sl, W, 1); }
        x.globalAlpha = 1;
        for (var g2 = 0; g2 < 900; g2++) {
          x.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05) + ')';
          x.fillRect(Math.random() * W, Math.random() * H, 1, 1);
        }
      }
      function drawDead(shorting) {
        var W = 480, H = 300, x = tvCtx;
        if (shorting) {
          x.fillStyle = Math.random() < 0.5 ? '#e8eef2' : '#0a0c0e';
          x.fillRect(0, 0, W, H);
          for (var b2 = 0; b2 < 40; b2++) {
            x.fillStyle = 'rgba(0,0,0,' + Math.random() + ')';
            x.fillRect(0, Math.random() * H, W, Math.random() * 8);
          }
        } else { x.fillStyle = '#050607'; x.fillRect(0, 0, W, H); }
      }

      updates.push(function (dt) {
        if (!tvState.on) return;
        tvState.t += dt;
        if (tvState.t < 60) {
          drawHighlight(tvState.t);
          tvLight.intensity = 2.6 + Math.sin(tvState.t * 9) * 0.25;
        } else if (tvState.t < 61.6) {
          drawDead(true);
          tvLight.intensity = Math.random() < 0.5 ? 7 : 0.4;
          if (!tvState.dead) { tvState.dead = true; if (window.__onTvShort) window.__onTvShort(); }
        } else {
          drawDead(false);
          tvLight.intensity = 0;
          tvState.on = false;
        }
        tvTex.needsUpdate = true;
      });
      window.__startTv = function () {
        if (tvState.dead) return;
        tvState.on = true; tvState.t = 0;
      };

      // ---- desk clutter, on the counter inside the island ----
      function counterPoint(theta, inset) {
        return ringAt(ISLAND.x, ISLAND.z, ISLAND.r + 0.04 - (inset || 0), theta);
      }
      var paperTex = (function () {
        var c = document.createElement('canvas'); c.width = c.height = 256;
        var x = c.getContext('2d');
        x.fillStyle = '#cfc9b6'; x.fillRect(0, 0, 256, 256);
        x.fillStyle = '#2c2822';
        for (var r = 0; r < 22; r++) x.fillRect(18, 30 + r * 9, 150 + Math.random() * 70, 3);
        x.fillStyle = '#1d1a16'; x.fillRect(18, 12, 120, 12);
        var grd = x.createRadialGradient(170, 180, 6, 170, 180, 52);
        grd.addColorStop(0, 'rgba(84,52,22,0.62)');
        grd.addColorStop(0.75, 'rgba(96,62,28,0.42)');
        grd.addColorStop(1, 'rgba(96,62,28,0)');
        x.fillStyle = grd; x.beginPath(); x.arc(170, 180, 52, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(70,42,16,0.55)'; x.lineWidth = 4;
        x.beginPath(); x.arc(170, 180, 40, 0, Math.PI * 2); x.stroke();
        return new THREE.CanvasTexture(c);
      })();

      var np = counterPoint(0.42, 0.04);
      var news = box(0.6, 0.012, 0.42, new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.96 }), np.x, 1.095, np.z, np.ry);
      interact(news, { id: 'newspaper', label: 'Newspaper', verb: 'Read' });
      var cp = counterPoint(0.30, 0.02);
      var cup = cyl(0.045, 0.037, 0.11, new THREE.MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.7 }), cp.x, 1.12, cp.z, 12);
      cup.rotation.z = Math.PI / 2 - 0.15;
      var stain = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), new THREE.MeshStandardMaterial({ color: 0x4a2f14, roughness: 0.85 }));
      stain.rotation.x = -Math.PI / 2;
      stain.position.set(cp.x + 0.12, 1.088, cp.z + 0.04);
      group.add(stain);

      for (var pp = 0; pp < 10; pp++) {
        var ap = -0.9 + Math.random() * 1.9;
        var sp = counterPoint(ap, Math.random() * 0.12);
        box(0.2, 0.004, 0.27, MAT.paper, sp.x, 1.09 + pp * 0.002, sp.z, Math.random() * Math.PI);
      }
      for (var pen = 0; pen < 5; pen++) {
        var pa = -0.62 + pen * 0.1;
        var pt = counterPoint(pa, 0.06);
        var pc = cyl(0.006, 0.006, 0.14, MAT.plastic, pt.x, 1.095, pt.z, 6);
        pc.rotation.z = Math.PI / 2;
        pc.rotation.y = pa;
      }

      // the computer, facing into the island
      var mp = counterPoint(-0.42, 0.07);
      box(0.06, 0.16, 0.2, MAT.plastic, mp.x, 1.17, mp.z, mp.ry);
      var crackTex = (function () {
        var c = document.createElement('canvas'); c.width = 512; c.height = 320;
        var x = c.getContext('2d');
        x.fillStyle = '#0a0c0d'; x.fillRect(0, 0, 512, 320);
        x.strokeStyle = 'rgba(190,200,205,0.5)'; x.lineWidth = 1.6;
        for (var f = 0; f < 16; f++) {
          x.beginPath();
          var sx = 300 + Math.random() * 60, sy = 40 + Math.random() * 40;
          x.moveTo(sx, sy);
          for (var st = 0; st < 5; st++) { sx += (Math.random() - 0.3) * 70; sy += Math.random() * 60; x.lineTo(sx, sy); }
          x.stroke();
        }
        return new THREE.CanvasTexture(c);
      })();
      var monitor = box(0.6, 0.4, 0.045, new THREE.MeshStandardMaterial({
        map: crackTex, emissive: 0x101416, emissiveIntensity: 0.5, roughness: 0.35
      }), mp.x, 1.42, mp.z, mp.ry + Math.PI);
      interact(monitor, { id: 'computer', label: 'Reception terminal', verb: 'Use' });
      var kp = counterPoint(-0.42, 0.30);
      box(0.4, 0.02, 0.15, MAT.plastic, kp.x, 1.095, kp.z, kp.ry);

      // ---- the rolling chair, inside the island ----
      var chX = ISLAND.x - 0.5, chZ = ISLAND.z + 0.15;
      cyl(0.03, 0.03, 0.36, MAT.metal, chX, 0.36, chZ, 8);
      for (var leg = 0; leg < 5; leg++) {
        var la = (leg / 5) * Math.PI * 2;
        box(0.30, 0.03, 0.05, MAT.plastic, chX + Math.cos(la) * 0.15, 0.05, chZ + Math.sin(la) * 0.15, -la);
      }
      box(0.46, 0.08, 0.46, MAT.fabric, chX, 0.55, chZ);
      box(0.44, 0.42, 0.07, MAT.fabric, chX, 0.8, chZ - 0.2);

      var noteTex = (function () {
        var c = document.createElement('canvas'); c.width = 256; c.height = 160;
        var x = c.getContext('2d');
        x.fillStyle = '#e8e2c8'; x.fillRect(0, 0, 256, 160);
        x.fillStyle = '#2a2620';
        x.font = 'bold 22px monospace'; x.fillText('WIFI', 16, 40);
        x.font = 'bold 40px monospace'; x.fillText('016390', 16, 100);
        x.font = '14px monospace'; x.fillStyle = '#5a5346';
        x.fillText('do NOT give to guests', 16, 132);
        return new THREE.CanvasTexture(c);
      })();
      var note = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.125),
        new THREE.MeshStandardMaterial({ map: noteTex, roughness: 0.95, side: THREE.DoubleSide }));
      note.rotation.x = Math.PI / 2;
      note.position.set(chX, 0.505, chZ);
      group.add(note);
      interact(note, { id: 'wifiNote', label: 'Something taped under the seat', verb: 'Read', requiresProne: true });

      // ---- tempered glass entrance ----
      box(0.12, 2.3, 0.14, MAT.darkMetal, -1.6, 1.15, 7);
      box(0.12, 2.3, 0.14, MAT.darkMetal, 1.6, 1.15, 7);
      box(0.12, 2.3, 0.14, MAT.darkMetal, 0, 1.15, 7);
      var gl = box(1.5, 2.2, 0.06, MAT.glass, -0.8, 1.1, 7);
      var gr = box(1.5, 2.2, 0.06, MAT.glass, 0.8, 1.1, 7);
      solid(-1.6, 6.9, 1.6, 7.1, 'entrance');
      window.__entranceGlass = [gl, gr];
      interact(gl, { id: 'entranceDoor', label: 'Entrance', verb: 'Try' });
      interact(gr, { id: 'entranceDoor', label: 'Entrance', verb: 'Try' });

      // ---- seating, kept clear of both corridor mouths ----
      function waitingChair(x, z, ry) {
        var cs = Math.cos(ry), sn = Math.sin(ry);
        box(0.5, 0.07, 0.5, MAT.fabric, x, 0.44, z, ry);
        box(0.5, 0.5, 0.07, MAT.fabric, x - sn * 0.22, 0.72, z - cs * 0.22, ry);
        [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]].forEach(function (p) {
          cyl(0.02, 0.02, 0.44, MAT.metal, x + p[0] * cs + p[1] * sn, 0.22, z - p[0] * sn + p[1] * cs, 6);
        });
        solid(x - 0.28, z - 0.28, x + 0.28, z + 0.28);
      }
      // One line, all facing the reception island — no facing pairs.
      // Both corridor doorways sit in the band z = -1.5 .. 1.5 and the
      // entrance is at x = -1.6 .. 1.6, so the row leaves a walkway down
      // the middle and stops well short of either hallway mouth.
      var ROW_Z = 4.5;
      [-6.5, -5.2, -3.9, -2.6].forEach(function (x) { waitingChair(x, ROW_Z, Math.PI); });
      [2.6, 3.9, 5.2, 6.5].forEach(function (x) { waitingChair(x, ROW_Z, Math.PI); });

      // A single tipped-over chair, out of the way against the west wall.
      (function () {
        var t = box(0.5, 0.07, 0.5, MAT.fabric, -7.0, 0.26, 5.9, 0.5);
        t.rotation.z = Math.PI / 2.1;
        box(0.5, 0.5, 0.07, MAT.fabric, -6.72, 0.5, 5.9, 0.5);
        solid(-7.3, 5.6, -6.5, 6.2);
      })();

      // ---- shelves and the wall telephone ----
      function bookshelf(x, z, ry) {
        [0.45, 0.95, 1.45, 1.95].forEach(function (y) {
          box(1.6, 0.06, 0.32, MAT.darkWood, x, y, z, ry);
        });
        for (var s = 0; s < 3; s++) {
          var y2 = 1.02 + s * 0.5, cursor = -0.72;
          while (cursor < 0.68) {
            var w = 0.04 + Math.random() * 0.05, hh = 0.24 + Math.random() * 0.1;
            box(w, hh, 0.22, bookMat(Math.floor(Math.random() * 5)),
              x + Math.cos(ry) * (cursor + w / 2), y2 + hh / 2, z - Math.sin(ry) * (cursor + w / 2), ry);
            cursor += w + 0.006;
          }
        }
        solid(x - 0.85, z - 0.2, x + 0.85, z + 0.2);
      }
      bookshelf(-4.6, -6.6, 0);
      bookshelf(4.6, -6.6, 0);
      batten(-5.5, -5.4, WALL_H, 0xdfe8ea, 6, 10, 'steady');
      batten(5.5, -5.4, WALL_H, 0xdfe8ea, 6, 10, 'dying');
      batten(0, 5.2, WALL_H, 0xdfe8ea, 7, 12, 'buzz');

      // The SECURITY crate, shoved into the corner by the entrance.
      var camCrate = box(0.8, 0.55, 0.65, MAT.wood, -7.2, 0.28, 6.2, 0.3);
      box(0.6, 0.22, 0.02, new THREE.MeshStandardMaterial({
        map: T.sign(THREE, 'SECURITY', { fontSize: 30 }), roughness: 0.7
      }), -6.9, 0.38, 5.93, 0.3);
      interact(camCrate, { id: 'cameraCrate', label: 'Crate marked SECURITY', verb: 'Open' });
      solid(-7.65, 5.85, -6.75, 6.55);

      var phoneBody = box(0.16, 0.26, 0.1, MAT.plastic, -7.85, 1.45, -3.2, Math.PI / 2);
      box(0.06, 0.2, 0.07, MAT.plastic, -7.75, 1.5, -3.2, Math.PI / 2);
      interact(phoneBody, { id: 'phone', label: 'Telephone', verb: 'Use' });
    })();

    // ===================================================================
    // HARD SEAL — tungsten shutters over Waiting's two corridor doorways.
    // Earthquake doors, meant to keep the building out of the room.
    // ===================================================================
    var sealMeshes = {};
    [['sealWest', -7.7], ['sealEast', 7.7]].forEach(function (sd) {
      var m = box(0.22, 2.4, 3.1, new THREE.MeshStandardMaterial({
        color: 0x565c60, map: texMetal, bumpMap: texMetal, bumpScale: 0.1,
        roughness: 0.45, metalness: 0.7
      }), sd[1], 3.6 + 1.2, 0);   // parked up inside the ceiling void
      sealMeshes[sd[0]] = m;
      solid(sd[1] - 0.13, -1.55, sd[1] + 0.13, 1.55, sd[0]);
    });

    // ===================================================================
    // CORRIDORS — long, and badly lit
    // ===================================================================
    (function corridors() {
      // A run of battens down a corridor, most of them failing.
      function run(axis, from, to, fixed, spacing, styles) {
        var n = Math.floor((to - from) / spacing);
        for (var i = 0; i <= n; i++) {
          var at = from + i * spacing;
          var style = styles[i % styles.length];
          var x = axis === 'x' ? at : fixed;
          var z = axis === 'x' ? fixed : at;
          batten(x, z, WALL_H, 0xdfe8ea, style === 'steady' ? 5.5 : 6.5, 11, style, 1.2);
        }
      }
      var STYLES = ['dying', 'steady', 'buzz', 'strobe', 'steady', 'dying', 'buzz'];
      run('x', -46, -10, 0, 5.2, STYLES);          // west corridor
      run('x', 10, 46, 0, 5.2, STYLES);            // east corridor
      run('x', 49, 55, 0, 4.0, ['buzz', 'dying']); // junction
      run('z', 4, 44, 49.5, 5.0, STYLES);          // south corridor
    })();

    // ===================================================================
    // RESTROOMS
    // ===================================================================
    (function restrooms() {
      batten(-18.5, -5.5, WALL_H, 0xdfe8ea, 7, 11, 'buzz');
      batten(-18.5, -8.2, WALL_H, 0xdfe8ea, 5, 9, 'strobe');
      for (var s = 0; s < 3; s++) {
        var sx = -21.2 + s * 1.7;
        box(0.06, 1.9, 1.5, MAT.metal, sx + 0.85, 1.15, -7.8);
        solid(sx + 0.82, -8.6, sx + 0.88, -7.05);
        box(0.44, 0.42, 0.34, new THREE.MeshStandardMaterial({ color: 0xd6d8d4, roughness: 0.35 }), sx + 0.2, 0.21, -8.3);
        solid(sx - 0.05, -8.5, sx + 0.45, -8.1);
      }
      for (var b = 0; b < 3; b++) {
        box(0.5, 0.16, 0.4, new THREE.MeshStandardMaterial({ color: 0xd6d8d4, roughness: 0.3 }), -15.6, 0.86, -6.4 + b * 1.2);
        box(0.44, 0.6, 0.03, new THREE.MeshStandardMaterial({ color: 0x717d80, roughness: 0.12, metalness: 0.85 }), -15.3, 1.5, -6.4 + b * 1.2, Math.PI / 2);
      }
    })();

    // ===================================================================
    // WAREHOUSE — where it came alive. Holds the storage key.
    // ===================================================================
    (function warehouse() {
      batten(-53, -6, 5.0, 0xcfe0e4, 10, 17, 'dying');
      batten(-59, 0, 5.0, 0xcfe0e4, 10, 17, 'buzz');
      batten(-53, 4, 5.0, 0xcfe0e4, 8, 15, 'strobe');

      var lootIdx = 0;
      function shelfCrate(cx, cy, cz) {
        var w = 0.55 + Math.random() * 0.4;
        var crate = box(w, 0.5 + Math.random() * 0.3, w, MAT.wood, cx, cy, cz, (Math.random() - 0.5) * 0.7);
        if (Math.random() < 0.3) {
          interact(crate, { id: 'lootCrate', idx: lootIdx++, label: 'Crate on the shelf', verb: 'Open' });
        }
        return crate;
      }
      function rack(x, z, len) {
        for (var lvl = 0; lvl < 3; lvl++) box(len, 0.09, 1.1, MAT.metal, x, 0.5 + lvl * 1.35, z);
        var half = len / 2;
        for (var u = -half + 0.2; u <= half - 0.2; u += 1.6) cyl(0.05, 0.05, 4.1, MAT.metal, x + u, 2.05, z, 6);
        // stock the shelves the way a dying company stocks shelves:
        // gaps, crooked stacks, nothing lined up with anything
        for (var c = 0; c < Math.floor(len / 1.1); c++) {
          if (Math.random() < 0.48) continue;
          shelfCrate(
            x - half + 0.6 + c * 1.05 + (Math.random() - 0.5) * 0.35,
            0.9 + Math.floor(Math.random() * 2) * 1.35,
            z + (Math.random() - 0.5) * 0.25
          );
        }
        solid(x - half, z - 0.6, x + half, z + 0.6);
      }
      rack(-56, -8, 12);
      rack(-56, -4, 12);
      rack(-56, 0.5, 12);

      for (var d = 0; d < 7; d++) {
        box(0.7, 0.6, 0.7, MAT.wood, -51.5 - Math.random() * 3, 0.3, 4.2 + Math.random() * 2, Math.random() * 2);
      }
      for (var g = 0; g < 5; g++) {
        var gm = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.06), new THREE.MeshStandardMaterial({ color: 0x2a2c2d, roughness: 1 }));
        gm.rotation.x = -Math.PI / 2;
        gm.rotation.z = 0.3 + g * 0.04;
        gm.position.set(-53 + g * 0.18, 0.012, 2.6 + g * 0.1);
        group.add(gm);
      }

      var keyMesh = box(0.11, 0.02, 0.04, new THREE.MeshStandardMaterial({ color: 0xc7b26a, roughness: 0.35, metalness: 0.85 }), -51.6, 0.63, 4.7);
      interact(keyMesh, { id: 'storageKey', label: 'Storage unit key', verb: 'Take' });
      var glow = new THREE.PointLight(0xffe9b0, 1.2, 2.6, 2);
      glow.position.set(-51.6, 0.75, 4.7);
      group.add(glow);
    })();

    // ===================================================================
    // CORPORATE OFFICE
    // ===================================================================
    (function office() {
      batten(28, -7, WALL_H, 0xffdcae, 7, 13, 'dying');

      box(2.6, 0.09, 1.3, MAT.darkWood, 28, 0.76, -8.4);
      box(0.12, 0.76, 1.2, MAT.darkWood, 26.8, 0.38, -8.4);
      box(0.12, 0.76, 1.2, MAT.darkWood, 29.2, 0.38, -8.4);
      solid(26.7, -9.1, 29.3, -7.7);

      function clawedChair(x, z, ry) {
        box(0.55, 0.1, 0.55, MAT.fabric, x, 0.46, z, ry);
        box(0.55, 0.62, 0.09, MAT.fabric, x - Math.sin(ry) * 0.24, 0.78, z - Math.cos(ry) * 0.24, ry);
        for (var g = 0; g < 4; g++) {
          box(0.03, 0.5, 0.02, MAT.blood, x - Math.sin(ry) * 0.29 + (g - 1.5) * 0.09, 0.78, z - Math.cos(ry) * 0.29, ry);
        }
        cyl(0.04, 0.04, 0.44, MAT.metal, x, 0.22, z, 8);
        solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
      }
      clawedChair(28, -7.2, Math.PI);
      clawedChair(25.6, -10.4, 0.6);
      clawedChair(31.2, -11.2, -0.5);

      [1.0, 1.6, 2.2].forEach(function (y) { box(3.2, 0.07, 0.4, MAT.darkWood, 25.4, y, -13.7); });
      solid(23.8, -13.95, 27.0, -13.45);
      var boneMat = new THREE.MeshStandardMaterial({ color: 0xd6cdb4, roughness: 0.8 });
      box(0.5, 0.26, 0.24, boneMat, 24.4, 1.78, -13.7);
      for (var r = 0; r < 5; r++) {
        cyl(0.018, 0.018, 0.42, boneMat, 25.5 + r * 0.14, 1.82, -13.7, 6).rotation.z = 0.5 + r * 0.06;
      }
      var vert = box(0.62, 0.12, 0.16, boneMat, 26.5, 1.75, -13.7);
      interact(vert, { id: 'bones', label: 'Fossil display', verb: 'Inspect' });
      for (var bk = 0; bk < 14; bk++) box(0.05, 0.28, 0.2, bookMat(bk), 24.0 + bk * 0.057, 1.15, -13.7);

      cyl(0.012, 0.012, 0.9, MAT.darkMetal, 28, 2.95, -9.5, 6);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 8, 24), new THREE.MeshStandardMaterial({ color: 0x8a7a4e, roughness: 0.5, metalness: 0.7 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(28, 2.5, -9.5);
      group.add(ring);
      for (var ca = 0; ca < 6; ca++) {
        var aa = (ca / 6) * Math.PI * 2;
        cyl(0.022, 0.03, 0.16, new THREE.MeshStandardMaterial({ color: 0xf0e4c0, emissive: 0xffcf8a, emissiveIntensity: 0.7, roughness: 0.4 }),
          28 + Math.cos(aa) * 0.42, 2.58, -9.5 + Math.sin(aa) * 0.42, 8);
      }
      var chLight = new THREE.PointLight(0xffcf8a, 5, 9, 2);
      chLight.position.set(28, 2.45, -9.5);
      group.add(chLight);
      lights.push({ light: chLight, panel: null, base: 5, style: 'dying', seed: 3 });

      var slab = box(0.9, 2.05, 0.07, MAT.darkWood, 32.3, 1.35, -13.4);
      slab.rotation.z = 0.38;
      slab.rotation.y = 0.1;
      interact(slab, { id: 'embeddedDoor', label: 'The office door', verb: 'Inspect' });
      for (var sp = 0; sp < 7; sp++) {
        box(0.5 + Math.random() * 0.4, 0.05, 0.05, MAT.wood, 32.3 + (Math.random() - 0.5) * 1.1, 1.35 + (Math.random() - 0.5) * 1.3, -13.55, Math.random());
      }
      for (var cm = 0; cm < 4; cm++) box(0.02, 1.5, 0.03, MAT.blood, 26.2 + cm * 0.11, 1.5, -1.62);
    })();

    // ===================================================================
    // STORAGE UNIT
    // ===================================================================
    (function storageUnit() {
      batten(60, 0, WALL_H, 0xd8e2e4, 5, 11, 'dying');

      for (var s = 0; s < 3; s++) box(0.4, 0.06, 3.4, MAT.metal, 63.6, 0.6 + s * 0.7, -2);
      solid(63.35, -3.75, 63.85, -0.25);
      for (var c = 0; c < 5; c++) box(0.5, 0.4, 0.4, MAT.wood, 63.6, 0.85 + Math.floor(c / 2) * 0.7, -3.2 + (c % 2) * 0.9);
      for (var t = 0; t < 11; t++) {
        cyl(0.04, 0.04, 0.11, new THREE.MeshStandardMaterial({ color: 0x8d8a72, roughness: 0.5, metalness: 0.4 }),
          58.5 + Math.random() * 4, 0.055, -3.5 + Math.random() * 7, 10);
      }

      var torso = box(0.52, 0.66, 0.3, MAT.body, 62.6, 0.34, 3.4);
      torso.rotation.x = 0.42;
      box(0.2, 0.2, 0.2, MAT.body, 62.6, 0.72, 3.15);
      box(0.18, 0.72, 0.2, MAT.body, 62.42, 0.11, 2.75).rotation.x = Math.PI / 2 - 0.2;
      box(0.18, 0.72, 0.2, MAT.body, 62.78, 0.11, 2.7).rotation.x = Math.PI / 2 - 0.32;
      box(0.14, 0.6, 0.15, MAT.body, 62.25, 0.24, 3.15).rotation.x = 1.1;
      var pool = new THREE.Mesh(new THREE.CircleGeometry(0.75, 22), MAT.blood);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(62.6, 0.011, 3.1);
      group.add(pool);
      solid(62.2, 2.6, 63.0, 3.7);

      var journal = box(0.22, 0.05, 0.3, new THREE.MeshStandardMaterial({ color: 0x6d5433, roughness: 0.9 }), 61.9, 0.025, 3.0, 0.4);
      interact(journal, { id: 'journal', label: "Nick's journal", verb: 'Read' });

      var gun = box(0.19, 0.055, 0.05, MAT.darkMetal, 61.2, 0.03, 1.6, 0.3);
      box(0.06, 0.12, 0.045, MAT.darkMetal, 61.15, 0.0, 1.63, 0.3);
      interact(gun, { id: 'glock', label: 'Glock 19', verb: 'Take' });
      box(0.035, 0.1, 0.05, MAT.darkMetal, 61.5, 0.05, 1.35);
      box(0.035, 0.1, 0.05, MAT.darkMetal, 61.62, 0.05, 1.42);
    })();

    // ===================================================================
    // ASSEMBLY
    // ===================================================================
    (function assembly() {
      batten(46, 50, 5.0, 0xbcd0d6, 7, 16, 'dying');
      batten(54, 50, 5.0, 0xbcd0d6, 5, 14, 'strobe');
      batten(50, 57, 5.0, 0xbcd0d6, 6, 15, 'buzz');

      for (var p = 0; p < 5; p++) {
        box(3.4, 0.16, 0.08, MAT.wood, 49.5, 1.15 + p * 0.32, 46, (Math.random() - 0.5) * 0.09);
      }
      solid(47.9, 45.85, 51.1, 46.15, 'barricade');

      box(12, 0.12, 1.4, MAT.metal, 50, 0.9, 50);
      for (var l = 0; l < 9; l++) cyl(0.05, 0.05, 0.9, MAT.metal, 44.5 + l * 1.4, 0.45, 50, 6);
      solid(44, 49.3, 56, 50.7);
      box(13, 0.14, 0.14, MAT.metal, 50, 4.3, 52.5);
      for (var hk = 0; hk < 7; hk++) {
        cyl(0.014, 0.014, 1.1, MAT.darkMetal, 44.5 + hk * 1.8, 3.7, 52.5, 5);
        var hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.014, 6, 12, Math.PI * 1.4), MAT.darkMetal);
        hook.position.set(44.5 + hk * 1.8, 3.1, 52.5);
        group.add(hook);
      }

      var cageMat = new THREE.MeshStandardMaterial({ color: 0x5e6568, roughness: 0.6, metalness: 0.6 });
      for (var bar = 0; bar < 13; bar++) {
        var b2 = cyl(0.035, 0.035, 3.2, cageMat, 52.5 + bar * 0.28, 1.6, 57.4, 6);
        if (bar > 4 && bar < 9) { b2.rotation.z = (bar - 6.5) * 0.16; b2.position.z += 0.5; }
      }
      for (var bs = 0; bs < 12; bs++) cyl(0.035, 0.035, 3.2, cageMat, 52.5, 1.6, 54.4 + bs * 0.26, 6);
      box(3.9, 0.1, 3.4, cageMat, 54.3, 3.2, 56);
      solid(52.4, 54.2, 56.2, 57.8, 'cage');
      var cageSign = box(0.5, 0.3, 0.03, new THREE.MeshStandardMaterial({ color: 0x8a2b1e, roughness: 0.8 }), 52.5, 2.4, 55.6, Math.PI / 2);
      interact(cageSign, { id: 'cage', label: 'Holding cage', verb: 'Inspect' });

      function corpse(x, z, ry, metal) {
        box(0.5, 0.24, 0.9, MAT.body, x, 0.12, z, ry);
        box(0.2, 0.19, 0.2, MAT.body, x + Math.sin(ry) * 0.6, 0.1, z + Math.cos(ry) * 0.6);
        box(0.15, 0.14, 0.62, MAT.body, x - 0.35, 0.08, z + 0.2, ry + 0.5);
        box(0.15, 0.14, 0.58, MAT.body, x + 0.36, 0.08, z - 0.15, ry - 0.4);
        if (metal) {
          box(0.42, 0.1, 0.5, MAT.metal, x, 0.24, z - 0.1, ry);
          cyl(0.03, 0.03, 0.5, MAT.metal, x + 0.14, 0.3, z + 0.2, 6).rotation.z = 1.2;
          cyl(0.03, 0.03, 0.42, MAT.metal, x - 0.16, 0.28, z + 0.05, 6).rotation.x = 1.0;
        }
        var pl = new THREE.Mesh(new THREE.CircleGeometry(0.55 + Math.random() * 0.4, 18), MAT.blood);
        pl.rotation.x = -Math.PI / 2;
        pl.position.set(x + 0.1, 0.01, z + 0.15);
        group.add(pl);
      }
      corpse(45.5, 48.5, 0.4, true);
      corpse(47.8, 53.6, 1.9, false);
      corpse(52.2, 48.2, -0.8, true);
      corpse(55.4, 52.8, 2.6, false);
      corpse(49.0, 58.2, 0.2, true);
      corpse(43.6, 56.4, -1.3, false);

      for (var sc = 0; sc < 12; sc++) {
        box(0.3 + Math.random() * 0.3, 0.03, 0.24, MAT.metal, 43 + Math.random() * 14, 0.015, 47 + Math.random() * 12, Math.random() * 3);
      }
    })();

    // ===================================================================
    // AIRLOCK + EXTERMINATION CHAMBER
    // ===================================================================
    (function extermination() {
      batten(60, 52.5, WALL_H, 0xd6e6ea, 4, 8, 'strobe', 1.0);
      batten(66, 51, WALL_H, 0xd6e6ea, 7, 13, 'steady');
      batten(70, 55, WALL_H, 0xd6e6ea, 6, 12, 'dying');

      box(5, 0.09, 1.0, MAT.metal, 66, 0.92, 49.4);
      solid(63.5, 48.9, 68.5, 49.9);
      box(3.4, 0.09, 1.0, MAT.metal, 71, 0.92, 53);
      solid(69.3, 52.5, 72.7, 53.5);

      for (var n = 0; n < 6; n++) {
        cyl(0.05, 0.08, 0.22, MAT.metal, 63.5 + (n % 3) * 4.5, WALL_H - 0.12, 50 + Math.floor(n / 3) * 5, 8);
      }

      function scientist(x, z, ry) {
        box(0.48, 0.22, 0.88, new THREE.MeshStandardMaterial({ color: 0x8d9088, roughness: 0.9 }), x, 0.11, z, ry);
        box(0.19, 0.18, 0.19, MAT.body, x + Math.sin(ry) * 0.58, 0.09, z + Math.cos(ry) * 0.58);
        box(0.14, 0.12, 0.6, new THREE.MeshStandardMaterial({ color: 0x8d9088, roughness: 0.9 }), x - 0.32, 0.07, z + 0.18, ry + 0.6);
        var pl = new THREE.Mesh(new THREE.CircleGeometry(0.6, 18), MAT.blood);
        pl.rotation.x = -Math.PI / 2;
        pl.position.set(x, 0.01, z + 0.1);
        group.add(pl);
      }
      scientist(64.4, 55.6, 0.7);
      scientist(68.2, 56.6, -1.1);
      scientist(72.3, 50.2, 2.2);

      var frag = box(0.34, 0.07, 0.13, new THREE.MeshStandardMaterial({ color: 0xb99a63, roughness: 0.85 }), 65.4, 0.99, 49.3, 0.4);
      interact(frag, { id: 'fragment', label: 'Splinter of pale wood', verb: 'Inspect' });

      var bpTex = (function () {
        var c = document.createElement('canvas'); c.width = 420; c.height = 300;
        var x = c.getContext('2d');
        x.fillStyle = '#16354d'; x.fillRect(0, 0, 420, 300);
        x.strokeStyle = 'rgba(180,214,235,0.16)'; x.lineWidth = 1;
        for (var g = 0; g < 420; g += 14) { x.beginPath(); x.moveTo(g, 0); x.lineTo(g, 300); x.stroke(); }
        for (var g2 = 0; g2 < 300; g2 += 14) { x.beginPath(); x.moveTo(0, g2); x.lineTo(420, g2); x.stroke(); }
        x.strokeStyle = '#cfe4f2'; x.lineWidth = 2;
        x.beginPath(); x.arc(210, 52, 17, 0, Math.PI * 2); x.stroke();
        x.beginPath();
        x.moveTo(210, 69); x.lineTo(210, 178);
        x.moveTo(210, 88); x.lineTo(158, 140);
        x.moveTo(210, 88); x.lineTo(262, 140);
        x.moveTo(158, 140); x.lineTo(150, 196);
        x.moveTo(262, 140); x.lineTo(270, 196);
        x.moveTo(210, 178); x.lineTo(186, 258);
        x.moveTo(210, 178); x.lineTo(234, 258);
        x.stroke();
        x.fillStyle = '#cfe4f2'; x.font = '11px monospace';
        x.fillText('HEIGHT  11 FT 0 IN', 20, 30);
        x.fillText('FRAME   TUNGSTEN', 20, 46);
        x.fillText('JOINTS  STEEL, NON-OXIDISING', 20, 62);
        x.fillText('BODY    BIRCHWOOD', 20, 78);
        x.fillText('UNIT NAME:', 20, 268);
        x.strokeStyle = 'rgba(207,228,242,0.75)'; x.lineWidth = 1.5;
        x.font = '13px monospace';
        ['S U B J', 'T H E  ', 'IT'].forEach(function (s, i) {
          x.fillText(s, 100 + i * 74, 268);
          x.beginPath(); x.moveTo(98 + i * 74, 264); x.lineTo(150 + i * 74, 264); x.stroke();
        });
        x.font = '10px monospace'; x.fillText('SCALE 1:24', 330, 288);
        return new THREE.CanvasTexture(c);
      })();
      var bp = box(0.68, 0.005, 0.48, new THREE.MeshStandardMaterial({ map: bpTex, roughness: 0.9 }), 71.2, 0.975, 53, 0.15);
      interact(bp, { id: 'blueprint', label: 'Blueprint', verb: 'Read' });
    })();

    // ===================================================================
    // SUPPLY STORAGE + SECOND RESTROOM
    // ===================================================================
    (function tailRooms() {
      batten(65, 61, WALL_H, 0xd8e2e4, 5, 10, 'dying');
      batten(71, 61, WALL_H, 0xdfe8ea, 5, 10, 'buzz');

      for (var s = 0; s < 3; s++) box(4.6, 0.06, 0.5, MAT.metal, 65, 0.7 + s * 0.62, 63.4);
      solid(62.7, 63.1, 67.3, 63.7);
      for (var b = 0; b < 22; b++) {
        cyl(0.045, 0.045, 0.12, new THREE.MeshStandardMaterial({ color: 0x9a8f6a, roughness: 0.55, metalness: 0.35 }),
          63.1 + (b % 8) * 0.55, 0.79 + (b % 3) * 0.62, 63.4, 10);
      }
      var water = cyl(0.07, 0.07, 0.26, new THREE.MeshStandardMaterial({ color: 0x9fc4cc, roughness: 0.25, transparent: true, opacity: 0.75 }), 66.6, 0.86, 63.4, 10);
      interact(water, { id: 'supplies', label: 'Water and beans', verb: 'Take' });

      box(0.06, 1.9, 1.4, MAT.metal, 71.2, 1.15, 61.4);
      solid(71.17, 60.7, 71.23, 62.1);
      interact(box(0.44, 0.42, 0.34, new THREE.MeshStandardMaterial({ color: 0xd6d8d4, roughness: 0.35 }), 70.6, 0.21, 61.6),
        { id: 'toilet', label: 'Toilet', verb: 'Use' });
      box(0.44, 0.16, 0.5, new THREE.MeshStandardMaterial({ color: 0xd6d8d4, roughness: 0.3 }), 73.6, 0.86, 59.2);
    })();

    // ===================================================================
    // SET DRESSING — the small stuff that makes the building read as a
    // place people worked in, and then stopped.
    // ===================================================================
    (function setDressing() {
      function signMat(text, o) {
        return new THREE.MeshStandardMaterial({ map: T.sign(THREE, text, o || {}), roughness: 0.6, metalness: 0.15 });
      }
      function wallSign(text, x, y, z, ry, w, h, o) {
        return box(w || 0.7, h || 0.35, 0.02, signMat(text, o), x, y, z, ry || 0);
      }

      // ---------------- Waiting ----------------
      // The EXIT sign over the sealed entrance — still lit, going nowhere.
      var exitTex = T.sign(THREE, 'EXIT', { bg: '#0c2414', fg: '#84e396', border: 'rgba(132,227,150,0.5)', fontSize: 44 });
      box(0.62, 0.24, 0.05, new THREE.MeshStandardMaterial({
        map: exitTex, emissive: 0x4ce07a, emissiveMap: exitTex, emissiveIntensity: 0.9, roughness: 0.5
      }), 0, 2.62, 6.85);

      // A wall clock, stopped where the power died.
      box(0.5, 0.5, 0.035, new THREE.MeshStandardMaterial({ map: T.clock(THREE), roughness: 0.6 }),
        -7.92, 2.25, 2.4, Math.PI / 2);

      // Low tables with old magazines, tucked against the chair row.
      [-4.6, 4.6].forEach(function (tx) {
        box(0.8, 0.34, 0.5, MAT.darkWood, tx, 0.17, 3.3);
        solid(tx - 0.45, 3.02, tx + 0.45, 3.58);
        for (var m = 0; m < 3; m++) {
          box(0.24, 0.008, 0.32, MAT.paper, tx - 0.2 + m * 0.18, 0.35 + m * 0.004, 3.3 + (m % 2) * 0.08, m * 0.4);
        }
      });
      wallSign('ALL VISITORS\nMUST SIGN IN', 7.92, 1.9, 3.4, -Math.PI / 2, 0.8, 0.4, { fontSize: 22 });

      // ---------------- Corridors ----------------
      wallSign('← RECEPTION', -12, 2.35, -1.43, 0, 0.9, 0.3, { fontSize: 24 });
      wallSign('WAREHOUSE →', -40, 2.35, 1.43, 0, 0.9, 0.3, { fontSize: 24 });
      wallSign('RESTROOMS', -18.5, 2.62, -1.43, 0, 0.8, 0.28, { fontSize: 24 });
      wallSign('← RECEPTION', 12, 2.35, 1.43, 0, 0.9, 0.3, { fontSize: 24 });
      wallSign('STORAGE →', 44, 2.35, -1.43, 0, 0.9, 0.3, { fontSize: 24 });
      wallSign('ASSEMBLY', 48.07, 2.35, 42, Math.PI / 2, 0.9, 0.3, { fontSize: 24 });

      // Conduit runs along the corridor ceilings.
      box(38, 0.06, 0.05, MAT.darkMetal, -28, 2.96, 1.42);
      box(38, 0.06, 0.05, MAT.darkMetal, 28, 2.96, -1.42);
      box(0.05, 0.06, 42, MAT.darkMetal, 50.93, 2.96, 24);

      // A wet-floor cone on its side. Nobody is coming to right it.
      var cone = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.2, 0.52, 10),
        new THREE.MeshStandardMaterial({ color: 0xb8a02c, roughness: 0.7 }));
      cone.position.set(-26, 0.14, 0.55);
      cone.rotation.z = Math.PI / 2 - 0.08;
      cone.rotation.y = 0.7;
      group.add(cone);

      // Papers spilled outside the office doorway.
      for (var pp = 0; pp < 6; pp++) {
        box(0.2, 0.004, 0.28, MAT.paper,
          26.2 + Math.random() * 2.6, 0.006 + pp * 0.002, -0.9 - Math.random() * 0.5, Math.random() * 3);
      }

      // Something was dragged down the south corridor, toward Assembly.
      for (var bd = 0; bd < 5; bd++) {
        var streak = new THREE.Mesh(new THREE.PlaneGeometry(0.24 + Math.random() * 0.14, 3.1), MAT.blood);
        streak.rotation.x = -Math.PI / 2;
        streak.rotation.z = (Math.random() - 0.5) * 0.16;
        streak.position.set(49.4 + Math.random() * 0.5, 0.014 + bd * 0.0008, 31 + bd * 3.1);
        group.add(streak);
      }
      // ...and inside Assembly the drags converge on the cage.
      for (var bd2 = 0; bd2 < 3; bd2++) {
        var st2 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 2.6), MAT.blood);
        st2.rotation.x = -Math.PI / 2;
        st2.rotation.z = 0.5 - bd2 * 0.3;
        st2.position.set(50.5 + bd2 * 1.1, 0.0145, 49.5 + bd2 * 1.8);
        group.add(st2);
      }

      // ---------------- Restrooms ----------------
      var porcelain = new THREE.MeshStandardMaterial({ color: 0xd6d8d4, roughness: 0.35 });
      for (var s = 0; s < 3; s++) {
        var sx = -21.2 + s * 1.7;
        box(0.4, 0.5, 0.14, porcelain, sx + 0.2, 0.66, -8.52);                     // cistern
        interact(cyl(0.19, 0.19, 0.05, porcelain, sx + 0.2, 0.45, -8.05, 14),
          { id: 'toilet', label: 'Toilet', verb: 'Use' });
        if (s === 0) {
          box(0.72, 1.6, 0.03, MAT.metal, sx + 0.62, 1.05, -6.75, 0.55);          // ajar
        } else if (s === 1) {
          box(0.72, 1.6, 0.03, MAT.metal, sx + 0.4, 1.05, -7.03);                 // shut
          solid(sx + 0.02, -7.08, sx + 0.78, -6.98);
        } else {
          box(0.72, 0.03, 1.6, MAT.metal, sx + 0.4, 0.03, -7.7, 0.2);             // torn off, flat
        }
      }
      box(0.3, 0.44, 0.11, MAT.metal, -15.08, 1.35, -3.2, Math.PI / 2);           // towel dispenser

      // ---------------- Warehouse ----------------
      [0, 1, 2].forEach(function (pl) {
        box(1.2, 0.13, 1.0, MAT.wood, -61.5, 0.08 + pl * 0.15, 3.2 + (pl % 2) * 0.06, (pl % 2) * 0.05);
      });
      solid(-62.2, 2.6, -60.8, 3.8);
      var lean = box(1.2, 0.13, 1.0, MAT.wood, -63.3, 0.75, 1.2);
      lean.rotation.z = 1.25;
      var puddle = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20),
        new THREE.MeshStandardMaterial({ color: 0x161a1e, roughness: 0.16, metalness: 0.25 }));
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(-52.5, 0.013, -1.8);
      group.add(puddle);

      // ---------------- Storage unit ----------------
      // Nick counted his days on the wall. The count stops.
      box(0.6, 0.4, 0.02, new THREE.MeshStandardMaterial({ map: T.tally(THREE, 23), roughness: 0.9 }),
        63.9, 1.3, 3.3, Math.PI / 2);
      box(0.9, 0.045, 0.7, new THREE.MeshStandardMaterial({ color: 0x39404a, roughness: 1 }),
        62.3, 0.028, 4.35, 0.5);                                                   // his blanket

      // ---------------- Corporate office ----------------
      cyl(0.09, 0.11, 0.03, MAT.darkMetal, 27.1, 0.83, -8.75, 12);                // lamp base
      var arm = box(0.025, 0.4, 0.025, MAT.darkMetal, 27.18, 1.02, -8.68);
      arm.rotation.z = -0.4;
      var lampHead = cyl(0.05, 0.085, 0.16, new THREE.MeshStandardMaterial({
        color: 0x2e3234, roughness: 0.5, metalness: 0.4, emissive: 0xffd9a0, emissiveIntensity: 0.35
      }), 27.3, 1.2, -8.62, 12);
      lampHead.rotation.z = 1.2;
      var lampLight = new THREE.PointLight(0xffd9a0, 1.6, 3.4, 2);
      lampLight.position.set(27.4, 1.12, -8.6);
      group.add(lampLight);
      lights.push({ light: lampLight, panel: null, base: 1.6, style: 'dying', seed: 11 });
      // The desk phone, off the hook.
      box(0.15, 0.05, 0.11, MAT.plastic, 28.7, 0.84, -8.2, 0.3);
      box(0.17, 0.04, 0.05, MAT.plastic, 28.4, 0.83, -7.9, 1.1);
      wallSign('CERTIFICATE\nOF EXCELLENCE', 30.2, 1.9, -13.92, 0, 0.5, 0.38, { fontSize: 16, bg: '#3a3226', fg: '#cbbf9e' });
      wallSign('EMPLOYEE\nOF THE MONTH', 31.1, 1.9, -13.92, 0, 0.5, 0.38, { fontSize: 16, bg: '#33302a', fg: '#c4c0b2' });

      // ---------------- Extermination chamber ----------------
      for (var sh = 0; sh < 9; sh++) {
        box(0.05 + Math.random() * 0.06, 0.006, 0.04 + Math.random() * 0.05,
          new THREE.MeshStandardMaterial({ color: 0xb9c6c9, roughness: 0.15, metalness: 0.1 }),
          64.5 + Math.random() * 3.4, 0.008, 50.2 + Math.random() * 1.6, Math.random() * 3);
      }
      box(0.22, 0.014, 0.3, MAT.plastic, 67.4, 0.98, 49.4, 0.3);                  // clipboard
      box(0.19, 0.004, 0.26, MAT.paper, 67.4, 0.99, 49.4, 0.3);
      wallSign('AUTHORIZED\nPERSONNEL ONLY', 57.92, 2.75, 52.5, Math.PI / 2, 0.8, 0.4,
        { fontSize: 20, bg: '#3d2f14', fg: '#d8c37a' });
    })();

    // ---------------- Vents ----------------
    // Four crawl runs through the walls. A grate has to be wrenched off
    // first, and once it is off it is off for good — for everyone.
    var vents = [];
    (function buildVents() {
      var louvreMat = new THREE.MeshStandardMaterial({ color: 0x4c5254, roughness: 0.55, metalness: 0.5 });
      function grate(x, z, ry) {
        var gg = new THREE.Group();
        var frame = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.05), louvreMat);
        gg.add(frame);
        for (var l = 0; l < 5; l++) {
          var slat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.03, 0.06), new THREE.MeshStandardMaterial({ color: 0x33383a, roughness: 0.6, metalness: 0.4 }));
          slat.position.y = -0.14 + l * 0.07;
          slat.rotation.x = -0.5;
          gg.add(slat);
        }
        gg.position.set(x, 0.42, z);
        gg.rotation.y = ry;
        group.add(gg);
        return gg;
      }
      // ry points back INTO the room you emerge in — the landing spot is
      // 0.9m along -sin/-cos of it, and must never be inside the wall.
      var DEFS = [
        { a: { x: -7.85, z: 3.6, ry: -Math.PI / 2 }, b: { x: -15.15, z: -3.4, ry: Math.PI / 2 },  name: 'Waiting ↔ Restrooms' },
        { a: { x: 7.85, z: 3.6, ry: Math.PI / 2 },   b: { x: 22.15, z: -4.2, ry: -Math.PI / 2 }, name: 'Waiting ↔ Office' },
        { a: { x: 30, z: -1.42, ry: Math.PI },       b: { x: 48.08, z: 20, ry: -Math.PI / 2 },   name: 'East corridor ↔ South corridor' },
        { a: { x: -48.1, z: -6, ry: Math.PI / 2 },   b: { x: -30, z: 1.42, ry: 0 },              name: 'Warehouse ↔ West corridor' }
      ];
      DEFS.forEach(function (def, vi) {
        var ga = grate(def.a.x, def.a.z, def.a.ry);
        var gb = grate(def.b.x, def.b.z, def.b.ry);
        interact(ga.children[0], { id: 'vent', vent: vi, end: 0, label: 'Air vent', verb: 'Break open' });
        interact(gb.children[0], { id: 'vent', vent: vi, end: 1, label: 'Air vent', verb: 'Break open' });
        vents.push({ a: def.a, b: def.b, meshA: ga, meshB: gb, name: def.name });
      });
    })();

    // ---------------- Doors ----------------
    // Every doorway gets a leaf built to its own spec; see fittings.js.
    var fittingsCtx = {
      group: group, materials: MAT, scene: scene, renderer: renderer, camera: camera,
      box: box, cyl: cyl, solid: solid, interact: interact
    };
    var doors = window.FITTINGS.createDoors(THREE, fittingsCtx);
    updates.push(function (dt) { doors.update(dt); });
    window.__storageDoorMesh = null;

    // ---------------- Mirrors ----------------
    var mirrors = [];
    // Above the restroom basins: one continuous sheet, not three panes.
    mirrors.push(window.FITTINGS.createMirror(THREE, fittingsCtx, {
      x: -15.14, y: 1.45, z: -5.2, ry: -Math.PI / 2,
      width: 4.4, height: 1.15, res: 512, range: 9, grime: 0.18
    }));
    // The second restroom, off the extermination chamber.
    mirrors.push(window.FITTINGS.createMirror(THREE, fittingsCtx, {
      x: 73.86, y: 1.45, z: 59.2, ry: -Math.PI / 2,
      width: 1.5, height: 1.0, res: 384, range: 8, grime: 0.3
    }));
    updates.push(function () {
      for (var i = 0; i < mirrors.length; i++) mirrors[i].update();
    });

    // ---------------- Flicker ----------------
    function flickerLevel(style, t, seed) {
      if (style === 'buzz') return 1 + Math.sin(t * 37 + seed) * 0.035;
      if (style === 'dying') {
        var n = Math.sin(t * 0.7 + seed) * Math.sin(t * 2.3 + seed * 1.7) * Math.sin(t * 5.1 + seed * 0.3);
        return n > 0.52 ? 0.06 + Math.random() * 0.22 : 1;
      }
      if (style === 'strobe') {
        var s = Math.sin(t * 11 + seed) * Math.sin(t * 1.7 + seed);
        if (s > 0.72) return Math.random() < 0.5 ? 0.08 : 0.9;
        if (s > 0.55) return 0.55;
        return 1;
      }
      return 1;
    }
    updates.push(function (dt, elapsed) {
      for (var i = 0; i < lights.length; i++) {
        var L = lights[i];
        if (L.style === 'steady') continue;
        var lvl = flickerLevel(L.style, elapsed, L.seed);
        L.light.intensity = L.base * lvl;
        if (L.panel) L.panel.material.emissiveIntensity = 1.6 * Math.max(0.05, lvl);
      }
      void dt;
    });

    // ---------------- Room lookup ----------------
    function roomAt(x, z) {
      for (var i = 0; i < ROOMS.length; i++) {
        var r = ROOMS[i];
        if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r;
      }
      return null;
    }

    // ---------------- Light culling ----------------
    // Forward rendering evaluates every light in every fragment shader, and
    // the facility now has dozens. Keep only the nearest few — and always
    // exactly the same NUMBER of them, because a changing light count makes
    // Three.js recompile every shader mid-play.
    var pointLights = [];
    group.traverse(function (o) { if (o.isPointLight) pointLights.push(o); });
    var ranked = pointLights.map(function (l) { return { l: l, d: 0 }; });

    function cullLights(pos, max) {
      var n = Math.min(max, ranked.length);
      for (var i = 0; i < ranked.length; i++) {
        var p = ranked[i].l.position;
        var dx = p.x - pos.x, dz = p.z - pos.z, dy = p.y - pos.y;
        ranked[i].d = dx * dx + dz * dz + dy * dy * 0.25;
      }
      ranked.sort(function (a, b) { return a.d - b.d; });
      for (var j = 0; j < ranked.length; j++) ranked[j].l.visible = j < n;
    }

    return {
      colliders: colliders,
      wallBoxes: wallBoxes,
      lightFixtures: lights,
      sealMeshes: sealMeshes,
      vents: vents,
      interactables: interactables,
      updates: updates,
      roomAt: roomAt,
      cullLights: cullLights,
      toggleDoor: doors.toggle,
      isDoorOpen: doors.isOpen,
      destroyDoor: doors.destroy,
      doorIds: function () { return Object.keys(doors.runtime); },
      lightCount: pointLights.length,
      spawn: { x: 0, z: 5.6, yaw: 0 }
    };
  };
})();
