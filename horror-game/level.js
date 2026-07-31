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
  // Floorplan. Rooms are axis-aligned rectangles; doors are gaps punched
  // through whichever wall they sit on, shared by both adjoining rooms.
  // -------------------------------------------------------------------
  var ROOMS = [
    { id: 'waiting',   name: 'Waiting',               x1: -7,  z1: -6,  x2: 7,  z2: 6,  tone: 'lobby' },
    { id: 'hallL',     name: 'West Corridor',         x1: -20, z1: -1.5, x2: -7, z2: 1.5, tone: 'hall' },
    { id: 'restrooms', name: 'Restrooms',             x1: -15, z1: -9,  x2: -9, z2: -1.5, tone: 'tile' },
    { id: 'warehouse', name: 'Warehouse',             x1: -34, z1: -9,  x2: -20, z2: 6,  tone: 'industrial', h: 5.2 },
    { id: 'hallR',     name: 'East Corridor',         x1: 7,   z1: -1.5, x2: 20, z2: 1.5, tone: 'hall' },
    { id: 'office',    name: 'Corporate Office',      x1: 9,   z1: -13, x2: 20, z2: -1.5, tone: 'wood' },
    { id: 'hallE',     name: 'East Junction',         x1: 20,  z1: -1.5, x2: 27, z2: 1.5, tone: 'hall' },
    { id: 'hallS',     name: 'South Corridor',        x1: 20,  z1: 1.5, x2: 23, z2: 18, tone: 'hall' },
    { id: 'storage',   name: 'Storage Unit',          x1: 27,  z1: -5,  x2: 34, z2: 5,  tone: 'industrial' },
    { id: 'assembly',  name: 'Assembly',              x1: 14,  z1: 18,  x2: 30, z2: 32, tone: 'industrial', h: 5.2 },
    { id: 'exterm',    name: 'Extermination Chamber', x1: 30,  z1: 20,  x2: 42, z2: 30, tone: 'lab' },
    { id: 'supply',    name: 'Supply Storage',        x1: 30,  z1: 30,  x2: 36, z2: 36, tone: 'industrial' },
    { id: 'bath2',     name: 'Restroom',              x1: 36,  z1: 30,  x2: 42, z2: 36, tone: 'tile' }
  ];

  // axis 'x' → a gap in a wall that runs along X (i.e. a north/south wall)
  var DOORS = [
    { axis: 'x', at: -7,  min: -1.5, max: 1.5 },   // waiting  → west corridor
    { axis: 'x', at: 7,   min: -1.5, max: 1.5 },   // waiting  → east corridor
    { axis: 'z', at: -1.5, min: -13.5, max: -10.5 }, // west corridor → restrooms
    { axis: 'x', at: -20, min: -1.5, max: 1.5 },   // west corridor → warehouse
    { axis: 'z', at: -1.5, min: 12,  max: 15 },    // east corridor → office
    { axis: 'x', at: 20,  min: -1.5, max: 1.5 },   // east corridor → junction
    { axis: 'z', at: 1.5, min: 20,  max: 23 },     // junction → south corridor
    { axis: 'x', at: 27,  min: -1.5, max: 1.5, id: 'storageDoor' }, // junction → storage (locked)
    { axis: 'z', at: 18,  min: 20,  max: 23 },     // south corridor → assembly
    { axis: 'x', at: 30,  min: 23,  max: 26 },     // assembly → extermination
    { axis: 'z', at: 30,  min: 32,  max: 34 },     // extermination → supply
    { axis: 'z', at: 30,  min: 38,  max: 40 }      // extermination → restroom
  ];

  // The two tempered-glass entrance doors. Sealed — this is the way in,
  // not the way out.
  var ENTRANCE = { axis: 'z', at: 6, min: -1.6, max: 1.6 };

  window.LEVEL = { rooms: ROOMS, doors: DOORS, wallHeight: WALL_H };

  // -------------------------------------------------------------------
  // Small construction helpers
  // -------------------------------------------------------------------
  function nearly(a, b) { return Math.abs(a - b) < 0.001; }

  // Subtract door gaps from a wall span, returning the solid pieces.
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

  window.buildLevel = function buildLevel(THREE, scene) {
    var colliders = [];    // {x1,z1,x2,z2, id?, solid:boolean}
    var interactables = []; // meshes with userData.interact
    var updates = [];       // fn(dt, elapsed)
    var lights = [];

    var group = new THREE.Group();
    scene.add(group);

    // ---------------- Textures ----------------
    function noiseTexture(size, base, speckle, tint) {
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var x = c.getContext('2d');
      x.fillStyle = 'rgb(' + base + ',' + base + ',' + base + ')';
      x.fillRect(0, 0, size, size);
      var octs = [[6, 16, 0.5], [16, 12, 0.4], [48, 8, 0.35], [128, 5, 0.3]];
      for (var o = 0; o < octs.length; o++) {
        var cells = octs[o][0], amp = octs[o][1], al = octs[o][2];
        var step = size / cells;
        for (var yy = 0; yy < cells; yy++) {
          for (var xx = 0; xx < cells; xx++) {
            var v = Math.max(0, Math.min(255, base + (Math.random() * 2 - 1) * amp));
            x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + al + ')';
            x.fillRect(xx * step, yy * step, step + 1, step + 1);
          }
        }
      }
      for (var s = 0; s < speckle; s++) {
        var v2 = Math.max(0, Math.min(255, base + (Math.random() < 0.6 ? -34 : 26)));
        x.fillStyle = 'rgba(' + v2 + ',' + v2 + ',' + v2 + ',' + (Math.random() * 0.5 + 0.2) + ')';
        x.beginPath();
        x.arc(Math.random() * size, Math.random() * size, Math.random() * 1.6 + 0.2, 0, Math.PI * 2);
        x.fill();
      }
      if (tint) { x.fillStyle = tint; x.fillRect(0, 0, size, size); }
      var t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    }

    function tileTexture(size, grout) {
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var x = c.getContext('2d');
      x.fillStyle = '#b9bcbb'; x.fillRect(0, 0, size, size);
      var n = 8, step = size / n;
      x.strokeStyle = grout || '#6c706f';
      x.lineWidth = 3;
      for (var i = 0; i <= n; i++) {
        x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, size); x.stroke();
        x.beginPath(); x.moveTo(0, i * step); x.lineTo(size, i * step); x.stroke();
      }
      for (var s = 0; s < 900; s++) {
        x.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.09) + ')';
        x.fillRect(Math.random() * size, Math.random() * size, 2, 2);
      }
      var t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    }

    var texConcrete = noiseTexture(512, 128, 2400);
    var texFloor = noiseTexture(512, 104, 3000);
    var texTile = tileTexture(512);
    var texMetal = noiseTexture(256, 96, 900);
    var texCarpet = noiseTexture(256, 74, 4200);

    var MAT = {
      wall: new THREE.MeshStandardMaterial({ color: 0x9aa1a4, map: texConcrete, bumpMap: texConcrete, bumpScale: 0.3, roughness: 0.95 }),
      wallHall: new THREE.MeshStandardMaterial({ color: 0x8e9598, map: texConcrete, bumpMap: texConcrete, bumpScale: 0.3, roughness: 0.95 }),
      wallTile: new THREE.MeshStandardMaterial({ color: 0xa9adad, map: texTile, roughness: 0.35, metalness: 0.02 }),
      wallLab: new THREE.MeshStandardMaterial({ color: 0xa2adb0, map: texConcrete, bumpScale: 0.2, roughness: 0.6 }),
      wallWood: new THREE.MeshStandardMaterial({ color: 0x6b5741, map: texConcrete, bumpMap: texConcrete, bumpScale: 0.25, roughness: 0.8 }),
      floor: new THREE.MeshStandardMaterial({ color: 0x8b9295, map: texFloor, bumpMap: texFloor, bumpScale: 0.35, roughness: 0.94 }),
      carpet: new THREE.MeshStandardMaterial({ color: 0x565c63, map: texCarpet, bumpMap: texCarpet, bumpScale: 0.5, roughness: 1 }),
      tileFloor: new THREE.MeshStandardMaterial({ color: 0x9fa3a3, map: texTile, roughness: 0.4 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x7f868a, map: texConcrete, roughness: 1 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x6f7679, map: texMetal, roughness: 0.55, metalness: 0.55 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x33383b, roughness: 0.6, metalness: 0.5 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x7a5c3c, roughness: 0.75 }),
      darkWood: new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.8 }),
      plastic: new THREE.MeshStandardMaterial({ color: 0x2c2f31, roughness: 0.7 }),
      fabric: new THREE.MeshStandardMaterial({ color: 0x3d4550, roughness: 0.95 }),
      paper: new THREE.MeshStandardMaterial({ color: 0xd8d4c6, roughness: 0.95 }),
      glass: new THREE.MeshStandardMaterial({
        color: 0xa8c0c4, roughness: 0.55, metalness: 0.1,
        transparent: true, opacity: 0.55
      }),
      screenOff: new THREE.MeshStandardMaterial({ color: 0x0b0d0e, roughness: 0.25, metalness: 0.2 }),
      body: new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.95 }),
      blood: new THREE.MeshStandardMaterial({ color: 0x3a1512, roughness: 0.6 })
    };

    // A handful of shared book materials — one material per book would mean
    // one compiled shader per book.
    var BOOK_MATS = [];
    for (var bi = 0; bi < 5; bi++) {
      BOOK_MATS.push(new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.06 + bi * 0.022, 0.28, 0.15 + bi * 0.045),
        roughness: 0.9
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
      if (tone === 'lobby') return MAT.carpet;
      if (tone === 'wood') return MAT.carpet;
      return MAT.floor;
    }

    // ---------------- Primitive helpers ----------------
    function box(w, h, d, mat, x, y, z, ry) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      if (ry) m.rotation.y = ry;
      m.castShadow = false;
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

    // ---------------- Floors, ceilings, walls ----------------
    var roomById = {};
    ROOMS.forEach(function (r) {
      roomById[r.id] = r;
      var w = r.x2 - r.x1, d = r.z2 - r.z1;
      var cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
      var h = r.h || WALL_H;

      var f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMatFor(r.tone));
      f.rotation.x = -Math.PI / 2;
      f.position.set(cx, 0, cz);
      f.receiveShadow = true;
      group.add(f);
      var fm = floorMatFor(r.tone);
      if (fm.map) { fm.map.repeat.set(Math.max(1, w / 2.2), Math.max(1, d / 2.2)); }

      var c = new THREE.Mesh(new THREE.PlaneGeometry(w, d), MAT.ceiling);
      c.rotation.x = Math.PI / 2;
      c.position.set(cx, h, cz);
      c.receiveShadow = true;
      group.add(c);
    });

    // Build wall segments, deduped so shared walls are not doubled.
    var built = {};
    var allGaps = DOORS.concat([ENTRANCE]);

    function addWallSegment(axis, at, min, max, h, mat, id) {
      if (max - min < 0.02) return;
      var key = axis + '|' + at.toFixed(2) + '|' + min.toFixed(2) + '|' + max.toFixed(2);
      if (built[key]) return;
      built[key] = true;
      var len = max - min, mid = (min + max) / 2;
      if (axis === 'x') {
        // wall plane at x = at, running along Z
        box(WALL_T, h, len, mat, at, h / 2, mid);
        solid(at - WALL_T / 2, min, at + WALL_T / 2, max, id);
      } else {
        box(len, h, WALL_T, mat, mid, h / 2, at);
        solid(min, at - WALL_T / 2, max, at + WALL_T / 2, id);
      }
    }

    ROOMS.forEach(function (r) {
      var h = r.h || WALL_H;
      var mat = wallMatFor(r.tone);
      // West / East walls (planes at constant x, running along z)
      [r.x1, r.x2].forEach(function (xAt) {
        var gaps = allGaps.filter(function (g) { return g.axis === 'x' && nearly(g.at, xAt); });
        spans(r.z1, r.z2, gaps).forEach(function (s) {
          addWallSegment('x', xAt, s.min, s.max, h, mat);
        });
      });
      // North / South walls (planes at constant z, running along x)
      [r.z1, r.z2].forEach(function (zAt) {
        var gaps = allGaps.filter(function (g) { return g.axis === 'z' && nearly(g.at, zAt); });
        spans(r.x1, r.x2, gaps).forEach(function (s) {
          addWallSegment('z', zAt, s.min, s.max, h, mat);
        });
      });
    });

    // Door frames, so the gaps read as doorways rather than holes.
    DOORS.concat([ENTRANCE]).forEach(function (g) {
      var lintelH = 2.25;
      if (g.axis === 'x') {
        box(WALL_T, WALL_H - lintelH, g.max - g.min, MAT.wall, g.at, lintelH + (WALL_H - lintelH) / 2, (g.min + g.max) / 2);
      } else {
        box(g.max - g.min, WALL_H - lintelH, WALL_T, MAT.wall, (g.min + g.max) / 2, lintelH + (WALL_H - lintelH) / 2, g.at);
      }
    });

    // ---------------- Lighting ----------------
    scene.add(new THREE.HemisphereLight(0x93a8ba, 0x2a2f32, 0.85));
    scene.add(new THREE.AmbientLight(0x5f7080, 0.40));

    // A fluorescent batten: an emissive panel plus a cheap unshadowed light.
    function batten(x, z, y, colour, intensity, dist, flickery) {
      var panel = box(1.5, 0.06, 0.34, new THREE.MeshStandardMaterial({
        color: 0xf2f4f0, emissive: colour, emissiveIntensity: 1.6, roughness: 0.4
      }), x, (y || WALL_H) - 0.07, z);
      var l = new THREE.PointLight(colour, intensity, dist, 1.8);
      l.position.set(x, (y || WALL_H) - 0.3, z);
      group.add(l);
      lights.push({ light: l, panel: panel, base: intensity, flickery: !!flickery, phase: Math.random() * 100 });
      return l;
    }

    // ===================================================================
    // WAITING — the room you wake up in
    // ===================================================================
    (function waitingRoom() {
      batten(-3.5, 2, WALL_H, 0xdfe8ea, 9, 13);
      batten(3.5, 2, WALL_H, 0xdfe8ea, 9, 13, true);
      batten(0, -3.2, WALL_H, 0xffe3c2, 7, 11);

      // --- tempered glass entrance doors (sealed) ---
      var frame = MAT.darkMetal;
      box(0.12, 2.3, 0.14, frame, -1.6, 1.15, 6);
      box(0.12, 2.3, 0.14, frame, 1.6, 1.15, 6);
      box(0.12, 2.3, 0.14, frame, 0, 1.15, 6);
      var gl = box(1.5, 2.2, 0.06, MAT.glass, -0.8, 1.1, 6);
      var gr = box(1.5, 2.2, 0.06, MAT.glass, 0.8, 1.1, 6);
      solid(-1.6, 5.9, 1.6, 6.1);
      interact(gl, { id: 'entranceDoor', label: 'Entrance', verb: 'Try' });
      interact(gr, { id: 'entranceDoor', label: 'Entrance', verb: 'Try' });

      // --- waiting room chairs ---
      function waitingChair(x, z, ry) {
        var cs = Math.cos(ry), sn = Math.sin(ry);
        box(0.5, 0.07, 0.5, MAT.fabric, x, 0.44, z, ry);
        box(0.5, 0.5, 0.07, MAT.fabric, x - sn * 0.22, 0.72, z - cs * 0.22, ry);
        [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]].forEach(function (p) {
          cyl(0.02, 0.02, 0.44, MAT.metal,
            x + p[0] * cs + p[1] * sn, 0.22, z - p[0] * sn + p[1] * cs, 6);
        });
        solid(x - 0.28, z - 0.28, x + 0.28, z + 0.28);
      }
      // Two rows along the west side, one along the east.
      for (var i = 0; i < 5; i++) waitingChair(-5.4, -3 + i * 1.3, Math.PI / 2);
      for (var j = 0; j < 5; j++) waitingChair(-3.6, -3 + j * 1.3, -Math.PI / 2);
      for (var k = 0; k < 4; k++) waitingChair(5.4, -2 + k * 1.3, -Math.PI / 2);

      // --- shelves with books ---
      function bookshelf(x, z, ry) {
        box(1.6, 0.06, 0.32, MAT.darkWood, x, 0.95, z, ry);
        box(1.6, 0.06, 0.32, MAT.darkWood, x, 1.45, z, ry);
        box(1.6, 0.06, 0.32, MAT.darkWood, x, 1.95, z, ry);
        box(1.6, 0.05, 0.34, MAT.darkWood, x, 0.45, z, ry);
        for (var s = 0; s < 3; s++) {
          var y = 1.02 + s * 0.5;
          var cursor = -0.72;
          while (cursor < 0.68) {
            var w = 0.04 + Math.random() * 0.05;
            var hh = 0.24 + Math.random() * 0.1;
            var bx = x + Math.cos(ry) * (cursor + w / 2);
            var bz = z - Math.sin(ry) * (cursor + w / 2);
            box(w, hh, 0.22, bookMat(Math.floor(Math.random() * 5)), bx, y + hh / 2, bz, ry);
            cursor += w + 0.006;
          }
        }
        solid(x - 0.85, z - 0.2, x + 0.85, z + 0.2);
      }
      bookshelf(-2.2, -5.6, 0);
      bookshelf(2.2, -5.6, 0);

      // --- the curved reception desk, with a gap to get behind ---
      var deskR = 3.6, deskY = 1.02;
      var deskCentre = { x: 0, z: -4.6 };
      var deskMat = MAT.darkWood;
      // Sweep an arc, skipping a section so there is a way in.
      var gapFrom = 2.62, gapTo = 3.05;  // radians
      for (var a = 0.55; a < Math.PI - 0.55; a += 0.055) {
        if (a > gapFrom && a < gapTo) continue;
        var px = deskCentre.x + Math.cos(a) * deskR;
        var pz = deskCentre.z + Math.sin(a) * deskR;
        box(0.32, deskY, 0.24, deskMat, px, deskY / 2, pz, -a);
        box(0.5, 0.06, 0.44, MAT.wood, px, deskY + 0.03, pz, -a);
        solid(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2);
      }

      // Desktop clutter, on the counter in front of the gap
      var dx = deskCentre.x + Math.cos(1.9) * (deskR - 0.1);
      var dz = deskCentre.z + Math.sin(1.9) * (deskR - 0.1);

      // newspapers with a dried coffee ring, and the tipped cup
      var paperTex = (function () {
        var c = document.createElement('canvas'); c.width = c.height = 256;
        var x = c.getContext('2d');
        x.fillStyle = '#cfc9b6'; x.fillRect(0, 0, 256, 256);
        x.fillStyle = '#2c2822';
        for (var r = 0; r < 22; r++) x.fillRect(18, 30 + r * 9, 150 + Math.random() * 70, 3);
        x.fillStyle = '#1d1a16'; x.fillRect(18, 12, 120, 12);
        // dried coffee stain
        var grd = x.createRadialGradient(170, 180, 6, 170, 180, 52);
        grd.addColorStop(0, 'rgba(84,52,22,0.62)');
        grd.addColorStop(0.75, 'rgba(96,62,28,0.42)');
        grd.addColorStop(1, 'rgba(96,62,28,0)');
        x.fillStyle = grd; x.beginPath(); x.arc(170, 180, 52, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(70,42,16,0.55)'; x.lineWidth = 4;
        x.beginPath(); x.arc(170, 180, 40, 0, Math.PI * 2); x.stroke();
        return new THREE.CanvasTexture(c);
      })();
      var news = box(0.62, 0.012, 0.44, new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.96 }), dx - 0.5, deskY + 0.07, dz + 0.1, 0.2);
      interact(news, { id: 'newspaper', label: 'Newspaper', verb: 'Read' });

      var cup = cyl(0.045, 0.037, 0.11, new THREE.MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.7 }), dx - 0.34, deskY + 0.1, dz + 0.02, 12);
      cup.rotation.z = Math.PI / 2 - 0.15;
      var stain = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), new THREE.MeshStandardMaterial({ color: 0x4a2f14, roughness: 0.85 }));
      stain.rotation.x = -Math.PI / 2;
      stain.position.set(dx - 0.2, deskY + 0.065, dz + 0.02);
      group.add(stain);

      // scattered papers and separated pens
      for (var p = 0; p < 9; p++) {
        var ang = Math.random() * Math.PI * 2;
        var rr = 0.2 + Math.random() * 1.4;
        box(0.21, 0.004, 0.29, MAT.paper,
          deskCentre.x + Math.cos(1.7 + (Math.random() - 0.5) * 1.4) * (deskR - 0.25) + Math.cos(ang) * 0.1,
          deskY + 0.065 + p * 0.002,
          deskCentre.z + Math.sin(1.7 + (Math.random() - 0.5) * 1.4) * (deskR - 0.25) + Math.sin(ang) * 0.1,
          Math.random() * Math.PI);
        void rr;
      }
      for (var pen = 0; pen < 5; pen++) {
        var pa = 1.35 + pen * 0.16;
        var pc = cyl(0.006, 0.006, 0.14, MAT.plastic,
          deskCentre.x + Math.cos(pa) * (deskR - 0.42), deskY + 0.07,
          deskCentre.z + Math.sin(pa) * (deskR - 0.42), 6);
        pc.rotation.z = Math.PI / 2;
        pc.rotation.y = pa;
      }

      // --- the computer, screen half cracked ---
      var monX = deskCentre.x + Math.cos(2.25) * (deskR - 0.5);
      var monZ = deskCentre.z + Math.sin(2.25) * (deskR - 0.5);
      box(0.06, 0.16, 0.2, MAT.plastic, monX, deskY + 0.12, monZ);
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
      var monitor = box(0.62, 0.4, 0.045, new THREE.MeshStandardMaterial({ map: crackTex, emissive: 0x101416, emissiveIntensity: 0.5, roughness: 0.35 }), monX, deskY + 0.36, monZ, -2.25 + Math.PI / 2);
      monitor.rotation.y = -(2.25) + Math.PI / 2;
      interact(monitor, { id: 'computer', label: 'Reception terminal', verb: 'Use' });
      box(0.42, 0.02, 0.16, MAT.plastic, monX + 0.1, deskY + 0.07, monZ + 0.34, 0.2); // keyboard

      // --- the rolling chair, with the note taped under the seat ---
      var chX = deskCentre.x - 0.55, chZ = deskCentre.z + 0.35;
      cyl(0.03, 0.03, 0.36, MAT.metal, chX, 0.36, chZ, 8);
      for (var leg = 0; leg < 5; leg++) {
        var la = (leg / 5) * Math.PI * 2;
        var lm = box(0.30, 0.03, 0.05, MAT.plastic, chX + Math.cos(la) * 0.15, 0.05, chZ + Math.sin(la) * 0.15, -la);
        void lm;
      }
      var seatMesh = box(0.46, 0.08, 0.46, MAT.fabric, chX, 0.55, chZ);
      box(0.44, 0.42, 0.07, MAT.fabric, chX, 0.8, chZ - 0.2);
      // The note lives on the underside — only visible from the floor.
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
      note.rotation.x = Math.PI / 2;   // faces down
      note.position.set(chX, 0.505, chZ);
      group.add(note);
      interact(note, { id: 'wifiNote', label: 'Something taped under the seat', verb: 'Read', requiresProne: true });
      void seatMesh;

      // --- old wall telephone ---
      var phoneBody = box(0.16, 0.26, 0.1, MAT.plastic, -6.85, 1.45, -2.2, Math.PI / 2);
      box(0.06, 0.2, 0.07, MAT.plastic, -6.75, 1.5, -2.2, Math.PI / 2);
      interact(phoneBody, { id: 'phone', label: 'Telephone', verb: 'Use' });

      // --- the TV bank above the desk ---
      var tvs = [];
      var tvDefs = [
        { x: -2.4, y: 2.35, w: 1.5, h: 0.88, state: 'smashed' },
        { x: -0.05, y: 2.45, w: 1.7, h: 1.0, state: 'main' },
        { x: 2.35, y: 2.35, w: 1.5, h: 0.88, state: 'cracked' },
        { x: -3.9, y: 1.6, w: 1.1, h: 0.66, state: 'smashed' },
        { x: 3.85, y: 1.6, w: 1.1, h: 0.66, state: 'cracked' }
      ];
      tvDefs.forEach(function (d) {
        box(d.w + 0.09, d.h + 0.09, 0.09, MAT.darkMetal, d.x, d.y, -5.85);
        var screenMat;
        if (d.state === 'main') {
          screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.3 });
        } else {
          var tex = (function () {
            var c = document.createElement('canvas'); c.width = 256; c.height = 160;
            var x = c.getContext('2d');
            x.fillStyle = d.state === 'smashed' ? '#050607' : '#0a0c0e';
            x.fillRect(0, 0, 256, 160);
            x.strokeStyle = 'rgba(170,180,190,0.45)';
            var n = d.state === 'smashed' ? 26 : 10;
            for (var f = 0; f < n; f++) {
              x.beginPath();
              var sx = 128 + (Math.random() - 0.5) * 90, sy = 80 + (Math.random() - 0.5) * 60;
              x.moveTo(sx, sy);
              for (var st = 0; st < 4; st++) { sx += (Math.random() - 0.5) * 90; sy += (Math.random() - 0.5) * 80; x.lineTo(sx, sy); }
              x.stroke();
            }
            if (d.state === 'smashed') { x.fillStyle = '#000'; x.beginPath(); x.arc(128, 80, 34, 0, Math.PI * 2); x.fill(); }
            return new THREE.CanvasTexture(c);
          })();
          screenMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3 });
        }
        var scr = box(d.w, d.h, 0.02, screenMat, d.x, d.y, -5.79);
        if (d.state === 'main') tvs.push(scr);
      });

      // The surviving TV: a stylised highlight reel, rendered procedurally.
      // (Real broadcast footage is not something this build can ship.)
      var tvCanvas = document.createElement('canvas');
      tvCanvas.width = 480; tvCanvas.height = 300;
      var tvCtx = tvCanvas.getContext('2d');
      var tvTex = new THREE.CanvasTexture(tvCanvas);
      var tvMat = new THREE.MeshStandardMaterial({ map: tvTex, emissiveMap: tvTex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.3 });
      tvs[0].material = tvMat;
      var tvLight = new THREE.PointLight(0xbfd4e6, 0, 9, 2);
      tvLight.position.set(-0.05, 2.45, -5.2);
      group.add(tvLight);

      var tvState = { on: false, t: 0, dead: false };
      window.__tvState = tvState;

      function drawHighlight(t) {
        var W = 480, H = 300, x = tvCtx;
        x.fillStyle = '#0d1a12'; x.fillRect(0, 0, W, H);
        // court
        var grd = x.createLinearGradient(0, 120, 0, H);
        grd.addColorStop(0, '#8a6534'); grd.addColorStop(1, '#5d4322');
        x.fillStyle = grd; x.fillRect(0, 120, W, H - 120);
        // crowd
        for (var c = 0; c < 260; c++) {
          var cx = (c * 37 % W), cy = 20 + (c * 17 % 96);
          x.fillStyle = 'hsl(' + ((c * 53) % 360) + ',18%,' + (14 + (c % 5) * 3) + '%)';
          x.fillRect(cx, cy, 4, 4);
        }
        // hoop
        x.strokeStyle = '#d8d2c4'; x.lineWidth = 4;
        x.strokeRect(300, 60, 86, 58);
        x.strokeStyle = '#e2662c'; x.lineWidth = 5;
        x.beginPath(); x.ellipse(343, 122, 26, 7, 0, 0, Math.PI * 2); x.stroke();
        x.strokeStyle = 'rgba(230,230,220,0.7)'; x.lineWidth = 1;
        for (var nn = 0; nn < 9; nn++) {
          x.beginPath(); x.moveTo(319 + nn * 6, 124); x.lineTo(325 + nn * 4, 150); x.stroke();
        }

        // the dunk cycle: run-up, leap, hang, slam, land
        var cycle = t % 6;
        var px, py, arm;
        if (cycle < 2.2) { px = 60 + (cycle / 2.2) * 190; py = 210; arm = 0.2; }
        else if (cycle < 3.4) {
          var u = (cycle - 2.2) / 1.2;
          px = 250 + u * 62; py = 210 - Math.sin(u * Math.PI * 0.62) * 118; arm = 0.2 + u * 1.2;
        } else if (cycle < 4.0) { px = 312; py = 96; arm = 1.5; }
        else if (cycle < 4.5) { var v = (cycle - 4.0) / 0.5; px = 312; py = 96 + v * 40; arm = 1.5 - v * 0.6; }
        else { var w2 = (cycle - 4.5) / 1.5; px = 312 - w2 * 30; py = 136 + w2 * 74; arm = 0.3; }

        // silhouette figure
        x.fillStyle = '#12100e';
        x.beginPath(); x.arc(px, py - 46, 11, 0, Math.PI * 2); x.fill();           // head
        x.fillRect(px - 10, py - 36, 20, 34);                                       // torso
        x.save(); x.translate(px, py - 30); x.rotate(-arm);
        x.fillRect(-4, -40, 8, 42); x.restore();                                    // raised arm
        x.fillRect(px - 16, py - 26, 8, 24);                                        // other arm
        var stride = Math.sin(t * 7) * 9;
        x.fillRect(px - 10, py - 2, 8, 26 + stride * 0.3);
        x.fillRect(px + 2, py - 2, 8, 26 - stride * 0.3);
        // ball
        var ballY = cycle < 4.0 ? py - 74 - Math.max(0, arm - 0.4) * 12 : 130 + (cycle - 4) * 60;
        x.fillStyle = '#e2662c';
        x.beginPath(); x.arc(cycle < 4.0 ? px + Math.sin(arm) * 30 : 330, ballY, 9, 0, Math.PI * 2); x.fill();

        // scoreboard + broadcast furniture
        x.fillStyle = 'rgba(6,8,10,0.82)'; x.fillRect(14, 14, 172, 34);
        x.fillStyle = '#e8e2d0'; x.font = 'bold 17px monospace';
        x.fillText('CHI 42  ·  ' + (78 + Math.floor(t / 6)), 24, 37);
        x.fillStyle = 'rgba(6,8,10,0.82)'; x.fillRect(W - 92, 14, 78, 26);
        x.fillStyle = '#c9b06a'; x.font = 'bold 14px monospace'; x.fillText('1991', W - 80, 32);

        // VHS scanlines + grain
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
          for (var b = 0; b < 40; b++) {
            x.fillStyle = 'rgba(0,0,0,' + Math.random() + ')';
            x.fillRect(0, Math.random() * H, W, Math.random() * 8);
          }
        } else {
          x.fillStyle = '#050607'; x.fillRect(0, 0, W, H);
        }
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
          if (!tvState.dead) {
            tvState.dead = true;
            if (window.__onTvShort) window.__onTvShort();
          }
        } else {
          drawDead(false);
          tvLight.intensity = 0;
          tvState.on = false;
        }
        tvTex.needsUpdate = true;
      });

      window.__startTv = function () {
        if (tvState.dead) return;
        tvState.on = true;
        tvState.t = 0;
      };
    })();

    // ===================================================================
    // RESTROOMS
    // ===================================================================
    (function restrooms() {
      batten(-12, -5, WALL_H, 0xdfe8ea, 6, 10, true);
      for (var s = 0; s < 3; s++) {
        var sx = -14.2 + s * 1.7;
        box(0.06, 1.9, 1.5, MAT.metal, sx + 0.85, 1.15, -7.6);   // divider
        solid(sx + 0.82, -8.4, sx + 0.88, -6.85);
        box(0.44, 0.42, 0.34, new THREE.MeshStandardMaterial({ color: 0xd6d8d4, roughness: 0.35 }), sx + 0.2, 0.21, -8.1);
        solid(sx - 0.05, -8.3, sx + 0.45, -7.9);
      }
      for (var b = 0; b < 3; b++) {
        var bx = -10.4;
        box(0.5, 0.16, 0.4, new THREE.MeshStandardMaterial({ color: 0xd6d8d4, roughness: 0.3 }), bx, 0.86, -6.4 + b * 1.2);
        var mir = box(0.44, 0.6, 0.03, new THREE.MeshStandardMaterial({ color: 0x717d80, roughness: 0.12, metalness: 0.85 }), bx + 0.26, 1.5, -6.4 + b * 1.2, Math.PI / 2);
        void mir;
      }
    })();

    // ===================================================================
    // WAREHOUSE — where it came alive. Holds the storage key.
    // ===================================================================
    (function warehouse() {
      batten(-24, -6, 5.0, 0xcfe0e4, 10, 16);
      batten(-30, 0, 5.0, 0xcfe0e4, 10, 16, true);
      batten(-24, 3, 5.0, 0xcfe0e4, 8, 14);

      // racking
      function rack(x, z, len, ry) {
        for (var lvl = 0; lvl < 3; lvl++) {
          box(len, 0.09, 1.1, MAT.metal, x, 0.5 + lvl * 1.35, z, ry);
        }
        var half = len / 2;
        for (var u = -half + 0.2; u <= half - 0.2; u += 1.6) {
          cyl(0.05, 0.05, 4.1, MAT.metal, x + Math.cos(ry) * u, 2.05, z - Math.sin(ry) * u, 6);
        }
        // crates
        for (var c2 = 0; c2 < Math.floor(len / 1.1); c2++) {
          if (Math.random() < 0.32) continue;
          var off = -half + 0.6 + c2 * 1.05;
          box(0.8, 0.7, 0.8, MAT.wood,
            x + Math.cos(ry) * off, 0.9 + Math.floor(Math.random() * 2) * 1.35,
            z - Math.sin(ry) * off, ry);
        }
        if (Math.abs(Math.sin(ry)) < 0.5) solid(x - half, z - 0.6, x + half, z + 0.6);
        else solid(x - 0.6, z - half, x + 0.6, z + half);
      }
      rack(-27, -7, 11, 0);
      rack(-27, -3, 11, 0);
      rack(-27, 1.4, 11, 0);

      // A rack has been torn open; crates thrown across the floor.
      for (var d = 0; d < 7; d++) {
        box(0.7, 0.6, 0.7, MAT.wood, -22.5 - Math.random() * 3, 0.3, 3.4 + Math.random() * 2, Math.random() * 2);
      }
      // gouges in the concrete
      for (var gsi = 0; gsi < 5; gsi++) {
        var gm = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.06), new THREE.MeshStandardMaterial({ color: 0x2a2c2d, roughness: 1 }));
        gm.rotation.x = -Math.PI / 2;
        gm.rotation.z = 0.3 + gsi * 0.04;
        gm.position.set(-24 + gsi * 0.18, 0.012, 2 + gsi * 0.1);
        group.add(gm);
      }

      // the key, on a toppled crate
      var keyMesh = box(0.11, 0.02, 0.04, new THREE.MeshStandardMaterial({ color: 0xc7b26a, roughness: 0.35, metalness: 0.85 }), -22.6, 0.63, 3.9);
      interact(keyMesh, { id: 'storageKey', label: 'Storage unit key', verb: 'Take' });
      var glow = new THREE.PointLight(0xffe9b0, 1.2, 2.4, 2);
      glow.position.set(-22.6, 0.75, 3.9);
      group.add(glow);
    })();

    // ===================================================================
    // CORPORATE OFFICE — where deals are made
    // ===================================================================
    (function office() {
      batten(14.5, -6, WALL_H, 0xffdcae, 7, 13, true);

      // desk
      box(2.6, 0.09, 1.3, MAT.darkWood, 14.5, 0.76, -7.4);
      box(0.12, 0.76, 1.2, MAT.darkWood, 13.3, 0.38, -7.4);
      box(0.12, 0.76, 1.2, MAT.darkWood, 15.7, 0.38, -7.4);
      solid(13.2, -8.1, 15.8, -6.7);

      // clawed chairs
      function clawedChair(x, z, ry) {
        box(0.55, 0.1, 0.55, MAT.fabric, x, 0.46, z, ry);
        var back = box(0.55, 0.62, 0.09, MAT.fabric, x - Math.sin(ry) * 0.24, 0.78, z - Math.cos(ry) * 0.24, ry);
        // gashes
        for (var g = 0; g < 4; g++) {
          box(0.03, 0.5, 0.02, MAT.blood, x - Math.sin(ry) * 0.29 + (g - 1.5) * 0.09, 0.78, z - Math.cos(ry) * 0.29, ry);
        }
        void back;
        cyl(0.04, 0.04, 0.44, MAT.metal, x, 0.22, z, 8);
        solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
      }
      clawedChair(14.5, -6.2, Math.PI);
      clawedChair(12.6, -9.4, 0.6);
      clawedChair(16.6, -9.9, -0.5);

      // vintage shelf: dinosaur bones, books, and an old chandelier above
      box(3.2, 0.07, 0.4, MAT.darkWood, 11.4, 1.0, -12.7);
      box(3.2, 0.07, 0.4, MAT.darkWood, 11.4, 1.6, -12.7);
      box(3.2, 0.07, 0.4, MAT.darkWood, 11.4, 2.2, -12.7);
      solid(9.8, -12.95, 13.0, -12.45);
      // a mounted skull and rib bones
      var boneMat = new THREE.MeshStandardMaterial({ color: 0xd6cdb4, roughness: 0.8 });
      var skull = box(0.5, 0.26, 0.24, boneMat, 10.4, 1.78, -12.7);
      skull.rotation.z = 0.05;
      for (var r2 = 0; r2 < 5; r2++) {
        var rib = cyl(0.018, 0.018, 0.42, boneMat, 11.5 + r2 * 0.14, 1.82, -12.7, 6);
        rib.rotation.z = 0.5 + r2 * 0.06;
      }
      var vert = box(0.62, 0.12, 0.16, boneMat, 12.5, 1.75, -12.7);
      interact(vert, { id: 'bones', label: 'Fossil display', verb: 'Inspect' });
      for (var bk = 0; bk < 14; bk++) {
        box(0.05, 0.28, 0.2, bookMat(bk), 10.0 + bk * 0.057, 1.15, -12.7);
      }
      // chandelier
      var chand = new THREE.Group();
      cyl(0.012, 0.012, 0.9, MAT.darkMetal, 14.5, 2.95, -8.5, 6);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 8, 24), new THREE.MeshStandardMaterial({ color: 0x8a7a4e, roughness: 0.5, metalness: 0.7 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(14.5, 2.5, -8.5);
      group.add(ring);
      for (var ca = 0; ca < 6; ca++) {
        var aa = (ca / 6) * Math.PI * 2;
        cyl(0.022, 0.03, 0.16, new THREE.MeshStandardMaterial({ color: 0xf0e4c0, emissive: 0xffcf8a, emissiveIntensity: 0.7, roughness: 0.4 }),
          14.5 + Math.cos(aa) * 0.42, 2.58, -8.5 + Math.sin(aa) * 0.42, 8);
      }
      var chLight = new THREE.PointLight(0xffcf8a, 5, 9, 2);
      chLight.position.set(14.5, 2.45, -8.5);
      group.add(chLight);
      lights.push({ light: chLight, panel: null, base: 5, flickery: true, phase: 3 });
      void chand;

      // The door: torn off, and buried halfway into the wall.
      var slab = box(0.9, 2.05, 0.07, MAT.darkWood, 18.2, 1.35, -12.4, 0.0);
      slab.rotation.z = 0.38;
      slab.rotation.y = 0.1;
      interact(slab, { id: 'embeddedDoor', label: 'The office door', verb: 'Inspect' });
      // splintering around the impact
      for (var sp = 0; sp < 7; sp++) {
        box(0.5 + Math.random() * 0.4, 0.05, 0.05, MAT.wood, 18.2 + (Math.random() - 0.5) * 1.1, 1.35 + (Math.random() - 0.5) * 1.3, -12.55, Math.random());
      }
      // claw marks down the wall by the doorway
      for (var cm = 0; cm < 4; cm++) {
        box(0.02, 1.5, 0.03, MAT.blood, 12.2 + cm * 0.11, 1.5, -1.62);
      }
    })();

    // ===================================================================
    // STORAGE UNIT — locked. Nick's body, his journal, and the Glock.
    // ===================================================================
    (function storageUnit() {
      batten(30.5, 0, WALL_H, 0xd8e2e4, 5, 11, true);

      // the locked roller door
      var door = box(0.14, 2.25, 3.0, MAT.metal, 27, 1.125, 0);
      interact(door, { id: 'storageDoor', label: 'Storage unit', verb: 'Open' });
      solid(26.9, -1.5, 27.1, 1.5, 'storageDoor');
      window.__storageDoorMesh = door;

      // shelving and junk
      for (var s = 0; s < 3; s++) {
        box(0.4, 0.06, 3.4, MAT.metal, 33.6, 0.6 + s * 0.7, -2, 0);
      }
      solid(33.35, -3.75, 33.85, -0.25);
      for (var c = 0; c < 5; c++) {
        box(0.5, 0.4, 0.4, MAT.wood, 33.6, 0.85 + Math.floor(c / 2) * 0.7, -3.2 + (c % 2) * 0.9);
      }

      // empty cans and bottles — he was here a long time
      for (var t = 0; t < 11; t++) {
        cyl(0.04, 0.04, 0.11, new THREE.MeshStandardMaterial({ color: 0x8d8a72, roughness: 0.5, metalness: 0.4 }),
          29 + Math.random() * 3.5, 0.055, -3.5 + Math.random() * 6.5, 10);
      }

      // Nick, against the back wall
      var body = new THREE.Group();
      var torso = box(0.52, 0.66, 0.3, MAT.body, 32.6, 0.34, 3.4);
      torso.rotation.x = 0.42;
      box(0.2, 0.2, 0.2, MAT.body, 32.6, 0.72, 3.15);
      var legL = box(0.18, 0.72, 0.2, MAT.body, 32.42, 0.11, 2.75); legL.rotation.x = Math.PI / 2 - 0.2;
      var legR = box(0.18, 0.72, 0.2, MAT.body, 32.78, 0.11, 2.7); legR.rotation.x = Math.PI / 2 - 0.32;
      var armL = box(0.14, 0.6, 0.15, MAT.body, 32.25, 0.24, 3.15); armL.rotation.x = 1.1;
      void body; void legL; void legR; void armL;
      // dried pooling
      var pool = new THREE.Mesh(new THREE.CircleGeometry(0.75, 22), MAT.blood);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(32.6, 0.011, 3.1);
      group.add(pool);
      solid(32.2, 2.6, 33.0, 3.7);

      // the journal, fallen from his hand
      var journal = box(0.22, 0.05, 0.3, new THREE.MeshStandardMaterial({ color: 0x6d5433, roughness: 0.9 }), 31.9, 0.025, 3.0, 0.4);
      interact(journal, { id: 'journal', label: "Nick's journal", verb: 'Read' });

      // the Glock 19 and two magazines
      var gunGroup = box(0.19, 0.055, 0.05, MAT.darkMetal, 31.2, 0.03, 1.6, 0.3);
      box(0.06, 0.12, 0.045, MAT.darkMetal, 31.15, 0.0, 1.63, 0.3);
      interact(gunGroup, { id: 'glock', label: 'Glock 19', verb: 'Take' });
      box(0.035, 0.1, 0.05, MAT.darkMetal, 31.5, 0.05, 1.35);
      box(0.035, 0.1, 0.05, MAT.darkMetal, 31.62, 0.05, 1.42);
    })();

    // ===================================================================
    // ASSEMBLY — barricaded. Where they were being rebuilt.
    // ===================================================================
    (function assembly() {
      batten(18, 22, 5.0, 0xbcd0d6, 7, 15, true);
      batten(26, 22, 5.0, 0xbcd0d6, 5, 13, true);
      batten(22, 29, 5.0, 0xbcd0d6, 6, 14, true);

      // barricade across the entrance — planks over the doorway, with a gap low down
      for (var p = 0; p < 5; p++) {
        var pl = box(3.4, 0.16, 0.08, MAT.wood, 21.5, 1.15 + p * 0.32, 18, (Math.random() - 0.5) * 0.09);
        void pl;
      }
      solid(19.9, 17.85, 23.1, 18.15, 'barricade');

      // conveyor line
      box(12, 0.12, 1.4, MAT.metal, 22, 0.9, 22);
      for (var l = 0; l < 9; l++) cyl(0.05, 0.05, 0.9, MAT.metal, 16.5 + l * 1.4, 0.45, 22, 6);
      solid(16, 21.3, 28, 22.7);
      // overhead rails and hanging hooks
      box(13, 0.14, 0.14, MAT.metal, 22, 4.3, 24.5);
      for (var hk = 0; hk < 7; hk++) {
        cyl(0.014, 0.014, 1.1, MAT.darkMetal, 16.5 + hk * 1.8, 3.7, 24.5, 5);
        var hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.014, 6, 12, Math.PI * 1.4), MAT.darkMetal);
        hook.position.set(16.5 + hk * 1.8, 3.1, 24.5);
        group.add(hook);
      }

      // the holding cage — open, and bent outward
      var cageMat = new THREE.MeshStandardMaterial({ color: 0x5e6568, roughness: 0.6, metalness: 0.6 });
      for (var bar = 0; bar < 13; bar++) {
        var bx = 24.5 + bar * 0.28;
        var b2 = cyl(0.035, 0.035, 3.2, cageMat, bx, 1.6, 29.4, 6);
        if (bar > 4 && bar < 9) { b2.rotation.z = (bar - 6.5) * 0.16; b2.position.z += 0.5; }
      }
      for (var bs = 0; bs < 12; bs++) cyl(0.035, 0.035, 3.2, cageMat, 24.5, 1.6, 26.4 + bs * 0.26, 6);
      box(3.9, 0.1, 3.4, cageMat, 26.3, 3.2, 28);
      solid(24.4, 26.2, 28.2, 29.8, 'cage');
      var cageSign = box(0.5, 0.3, 0.03, new THREE.MeshStandardMaterial({ color: 0x8a2b1e, roughness: 0.8 }), 24.5, 2.4, 27.6, Math.PI / 2);
      interact(cageSign, { id: 'cage', label: 'Holding cage', verb: 'Inspect' });

      // the workers
      function corpse(x, z, ry, metal) {
        var t = box(0.5, 0.24, 0.9, MAT.body, x, 0.12, z, ry);
        void t;
        box(0.2, 0.19, 0.2, MAT.body, x + Math.sin(ry) * 0.6, 0.1, z + Math.cos(ry) * 0.6);
        box(0.15, 0.14, 0.62, MAT.body, x - 0.35, 0.08, z + 0.2, ry + 0.5);
        box(0.15, 0.14, 0.58, MAT.body, x + 0.36, 0.08, z - 0.15, ry - 0.4);
        if (metal) {
          // plating driven into the body — something tried to finish the job
          box(0.42, 0.1, 0.5, MAT.metal, x, 0.24, z - 0.1, ry);
          cyl(0.03, 0.03, 0.5, MAT.metal, x + 0.14, 0.3, z + 0.2, 6).rotation.z = 1.2;
          cyl(0.03, 0.03, 0.42, MAT.metal, x - 0.16, 0.28, z + 0.05, 6).rotation.x = 1.0;
        }
        var pl2 = new THREE.Mesh(new THREE.CircleGeometry(0.55 + Math.random() * 0.4, 18), MAT.blood);
        pl2.rotation.x = -Math.PI / 2;
        pl2.position.set(x + 0.1, 0.01, z + 0.15);
        group.add(pl2);
      }
      corpse(17.5, 20.5, 0.4, true);
      corpse(19.8, 25.6, 1.9, false);
      corpse(24.2, 20.2, -0.8, true);
      corpse(27.4, 24.8, 2.6, false);
      corpse(21.0, 30.2, 0.2, true);
      corpse(15.6, 28.4, -1.3, false);

      // scattered plating
      for (var sc = 0; sc < 12; sc++) {
        box(0.3 + Math.random() * 0.3, 0.03, 0.24, MAT.metal,
          15 + Math.random() * 14, 0.015, 19 + Math.random() * 12, Math.random() * 3);
      }
    })();

    // ===================================================================
    // EXTERMINATION CHAMBER — the scientists, and the blueprint
    // ===================================================================
    (function extermination() {
      batten(34, 23, WALL_H, 0xd6e6ea, 7, 13);
      batten(38, 27, WALL_H, 0xd6e6ea, 6, 12, true);

      // lab benches
      box(5, 0.09, 1.0, MAT.metal, 34, 0.92, 21.4);
      solid(31.5, 20.9, 36.5, 21.9);
      box(3.4, 0.09, 1.0, MAT.metal, 39, 0.92, 25);
      solid(37.3, 24.5, 40.7, 25.5);

      // gas nozzles in the ceiling — this was a room built to kill something
      for (var n = 0; n < 6; n++) {
        cyl(0.05, 0.08, 0.22, MAT.metal, 31.5 + (n % 3) * 4.5, WALL_H - 0.12, 22 + Math.floor(n / 3) * 5, 8);
      }

      // dead scientists
      function scientist(x, z, ry) {
        box(0.48, 0.22, 0.88, new THREE.MeshStandardMaterial({ color: 0x8d9088, roughness: 0.9 }), x, 0.11, z, ry);
        box(0.19, 0.18, 0.19, MAT.body, x + Math.sin(ry) * 0.58, 0.09, z + Math.cos(ry) * 0.58);
        box(0.14, 0.12, 0.6, new THREE.MeshStandardMaterial({ color: 0x8d9088, roughness: 0.9 }), x - 0.32, 0.07, z + 0.18, ry + 0.6);
        var pl = new THREE.Mesh(new THREE.CircleGeometry(0.6, 18), MAT.blood);
        pl.rotation.x = -Math.PI / 2;
        pl.position.set(x, 0.01, z + 0.1);
        group.add(pl);
      }
      scientist(32.4, 27.6, 0.7);
      scientist(36.2, 28.6, -1.1);
      scientist(40.3, 22.2, 2.2);

      // the wood fragment on the table
      var frag = box(0.34, 0.07, 0.13, new THREE.MeshStandardMaterial({ color: 0xb99a63, roughness: 0.85 }), 33.4, 0.99, 21.3, 0.4);
      interact(frag, { id: 'fragment', label: 'Splinter of pale wood', verb: 'Inspect' });

      // the blueprint
      var bpTex = (function () {
        var c = document.createElement('canvas'); c.width = 420; c.height = 300;
        var x = c.getContext('2d');
        x.fillStyle = '#16354d'; x.fillRect(0, 0, 420, 300);
        x.strokeStyle = 'rgba(180,214,235,0.16)'; x.lineWidth = 1;
        for (var g = 0; g < 420; g += 14) { x.beginPath(); x.moveTo(g, 0); x.lineTo(g, 300); x.stroke(); }
        for (var g2 = 0; g2 < 300; g2 += 14) { x.beginPath(); x.moveTo(0, g2); x.lineTo(420, g2); x.stroke(); }
        x.strokeStyle = '#cfe4f2'; x.lineWidth = 2;
        // an 11-foot figure, drawn to scale
        x.beginPath();
        x.arc(210, 52, 17, 0, Math.PI * 2); x.stroke();
        x.beginPath();
        x.moveTo(210, 69); x.lineTo(210, 178);            // spine
        x.moveTo(210, 88); x.lineTo(158, 140);            // arms — too long
        x.moveTo(210, 88); x.lineTo(262, 140);
        x.moveTo(158, 140); x.lineTo(150, 196);
        x.moveTo(262, 140); x.lineTo(270, 196);
        x.moveTo(210, 178); x.lineTo(186, 258);           // legs
        x.moveTo(210, 178); x.lineTo(234, 258);
        x.stroke();
        x.fillStyle = '#cfe4f2'; x.font = '11px monospace';
        x.fillText('HEIGHT  11 FT 0 IN', 20, 30);
        x.fillText('FRAME   TUNGSTEN', 20, 46);
        x.fillText('JOINTS  STEEL, NON-OXIDISING', 20, 62);
        x.fillText('BODY    BIRCHWOOD', 20, 78);
        x.fillText('UNIT NAME:', 20, 268);
        // the naming attempts, all abandoned
        x.strokeStyle = 'rgba(207,228,242,0.75)'; x.lineWidth = 1.5;
        x.font = '13px monospace';
        ['S U B J', 'T H E  ', 'IT'].forEach(function (s, i) {
          x.fillText(s, 100 + i * 74, 268);
          x.beginPath(); x.moveTo(98 + i * 74, 264); x.lineTo(150 + i * 74, 264); x.stroke();
        });
        x.font = '10px monospace'; x.fillText('SCALE 1:24', 330, 288);
        return new THREE.CanvasTexture(c);
      })();
      var bp = box(0.68, 0.005, 0.48, new THREE.MeshStandardMaterial({ map: bpTex, roughness: 0.9 }), 39.2, 0.975, 25, 0.15);
      bp.rotation.x = 0;
      interact(bp, { id: 'blueprint', label: 'Blueprint', verb: 'Read' });
    })();

    // ===================================================================
    // SUPPLY STORAGE + SECOND RESTROOM
    // ===================================================================
    (function tailRooms() {
      batten(33, 33, WALL_H, 0xd8e2e4, 5, 10, true);
      batten(39, 33, WALL_H, 0xdfe8ea, 5, 10);

      // shelves of water and beans
      for (var s = 0; s < 3; s++) box(4.6, 0.06, 0.5, MAT.metal, 33, 0.7 + s * 0.62, 35.4);
      solid(30.7, 35.1, 35.3, 35.7);
      for (var b = 0; b < 22; b++) {
        var lvl = b % 3;
        cyl(0.045, 0.045, 0.12, new THREE.MeshStandardMaterial({ color: 0x9a8f6a, roughness: 0.55, metalness: 0.35 }),
          31.1 + (b % 8) * 0.55, 0.79 + lvl * 0.62, 35.4, 10);
      }
      var water = cyl(0.07, 0.07, 0.26, new THREE.MeshStandardMaterial({ color: 0x9fc4cc, roughness: 0.25, transparent: true, opacity: 0.75 }), 34.6, 0.86, 35.4, 10);
      interact(water, { id: 'supplies', label: 'Water and beans', verb: 'Take' });

      // second restroom
      box(0.06, 1.9, 1.4, MAT.metal, 39.2, 1.15, 33.4);
      solid(39.17, 32.7, 39.23, 34.1);
      box(0.44, 0.42, 0.34, new THREE.MeshStandardMaterial({ color: 0xd6d8d4, roughness: 0.35 }), 38.6, 0.21, 33.6);
      box(0.5, 0.16, 0.4, new THREE.MeshStandardMaterial({ color: 0xd6d8d4, roughness: 0.3 }), 40.6, 0.86, 31.2);
    })();

    // ---------------- Corridor lighting ----------------
    batten(-11, 0, WALL_H, 0xdfe8ea, 6, 11, true);
    batten(-17, 0, WALL_H, 0xdfe8ea, 6, 11);
    batten(11, 0, WALL_H, 0xdfe8ea, 6, 11);
    batten(17, 0, WALL_H, 0xdfe8ea, 6, 11, true);
    batten(23.5, 0, WALL_H, 0xdfe8ea, 5, 10);
    batten(21.5, 6, WALL_H, 0xdfe8ea, 5, 10, true);
    batten(21.5, 14, WALL_H, 0xdfe8ea, 5, 10);

    // ---------------- Flicker ----------------
    updates.push(function (dt, elapsed) {
      for (var i = 0; i < lights.length; i++) {
        var L = lights[i];
        if (!L.flickery) continue;
        var n = Math.sin(elapsed * 13 + L.phase) * Math.sin(elapsed * 3.1 + L.phase * 2);
        var drop = n > 0.86 ? 0.15 : 1;
        L.light.intensity = L.base * drop;
        if (L.panel) L.panel.material.emissiveIntensity = 1.6 * drop;
      }
      void dt;
    });

    // ---------------- Which room is the player standing in ----------------
    function roomAt(x, z) {
      for (var i = 0; i < ROOMS.length; i++) {
        var r = ROOMS[i];
        if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r;
      }
      return null;
    }

    // ---------------- Light culling ----------------
    // Forward rendering evaluates every light in every fragment shader, so
    // the facility's ~28 fixtures cannot all be live at once. Keep only the
    // nearest few — and always exactly the same NUMBER of them, because a
    // changing light count makes Three.js recompile every shader mid-play.
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
      interactables: interactables,
      updates: updates,
      roomAt: roomAt,
      cullLights: cullLights,
      lightCount: pointLights.length,
      spawn: { x: 0, z: 4.4, yaw: Math.PI }
    };
  };
})();
