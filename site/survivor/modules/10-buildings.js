/* Buildings, as geometry you can walk into.

   The world generator already owns every wall on the island: where it
   stands, what assembly it is built from, where the door is cut and how much
   of it is left after someone shot through it. None of that had a mesh, so
   twelve thousand rooms existed as numbers nobody could stand in. This file
   is a renderer for that data and nothing else — it reads walls out of
   world.pois[].buildings and decides nothing the simulation already knows.

   Two ideas shape the whole thing. Openings are cut rather than painted on:
   a wall becomes up to four boxes around each doorway and window, so a
   doorway is a hole you walk through and a window is a hole you can see and
   shoot through — which is what wall.layersAt already assumes when it hands
   the penetration model an empty layer stack there. And geometry is a lease
   rather than a fact: a building goes up inside 180 m and comes down past
   240 m, and the gap between those numbers is the hysteresis that stops a
   street thrashing while you pace up and down it.

   Emits:   'building-entered' { building, room, storey }
            'building-left'    { building }
            'room-changed'     { building, room, storey }
            'door'             { door, open, locked, building }
   Listens: 'door-toggle'      { actor } | { door }
            'wall-damaged'     { wall }

   On ctx.state, for the modules that come after this one:
     buildingAt(x, z, y?)  -> { building, room, storey } | null
     wallActorFor(wall)    -> actor | null      (shooting looks up the wall)
     doorFor(actor)        -> door | null
     useDoor(actorOrDoor)  -> { ok, open, locked }
     rebuildWall(wall)     -> re-cuts one wall after damage
     indoors, roomHere     -> shelter and light, read by other modules
*/
(function () {
  'use strict';

  /* Distances in metres. The build radius is a little beyond what you can
     make out through the engine's fog on a bad day; the drop radius is far
     enough past it that walking a boundary does not build and demolish the
     same house twice a second. */
  const BUILD_M = 180;
  const DROP_M = 240;
  const MAX_LIVE = 12;
  /* A city block is four detailed storeys of forty rooms and would happily
     eat ten thousand actors on its own, so a building gets a share and the
     plan is ordered by how close each piece is to the player: the storey you
     are standing on is built first and the top of the tower is what gets
     dropped. */
  const CAP_PER_BUILDING = 460;
  const CAP_TOTAL = 3000;
  const SPAWN_PER_FRAME = 56;
  const SCAN_S = 0.3;

  const T_EXT = 0.25;          // exterior walls read as mass at arm's length
  const T_INT = 0.12;          // a stud wall, near enough
  const FLOOR_T = 0.18;
  const EAVE_M = 0.4;
  const GLASS_T = 0.02;
  const SWING_RAD = 85 * Math.PI / 180;
  const SWING_S = 0.3;
  const RAD = 180 / Math.PI;
  const MAX_HOLE_DECALS = 10;

  let ctx = null, game = null, LE = null, SV = null;
  let disabled = false, faults = 0;

  let index = [];                    // every building on the island
  const live = new Map();            // building.id -> record
  const queue = [];                  // records still going up
  const wallOwner = new Map();       // wall -> record
  const wallActor = new Map();       // wall -> the first panel of that wall
  const doorByActor = new Map();     // actor -> door
  const swinging = new Set();
  const roofGeoCache = new Map();

  let actorCount = 0;
  let scanAccum = SCAN_S;
  let lastFrame = -1;
  let insideNow = null;
  let interiorLight = null;
  let promptMine = false;

  /* ---------------- materials ----------------

     Every distinct material spec costs three generated textures, and the
     renderer batches by mesh and material, so the entire street shares this
     handful and draws in a handful of calls. Box UVs run 0..1 across a face
     whatever the box measures, so uvScale here is a compromise across panel
     sizes rather than a real texture density. */
  const MAT = {
    brick: { preset: 'brick', uvScale: 8.5 },
    concrete: { preset: 'concrete', uvScale: 3.2 },
    cinder: { preset: 'concrete', color: 0x9c9992, uvScale: 5.0, roughness: 0.95 },
    interior: { color: 0xdcd6c6, texture: 'smooth', roughness: 0.93, uvScale: 1 },
    floorWood: { preset: 'wood', color: 0xa87c50, uvScale: 5.5 },
    floorTile: { preset: 'tile', color: 0xd4d4cc, uvScale: 6.0 },
    floorConcrete: { preset: 'concrete', color: 0x9d9a93, uvScale: 2.4 },
    // Roof UVs are in metres, not 0..1, because that mesh is built at full
    // size instead of being a scaled unit box.
    roof: { preset: 'rubber', color: 0x4a4842, uvScale: 0.45 },
    roofFlat: { preset: 'rubber', color: 0x53514a, uvScale: 2.4 },
    door: { preset: 'wood', color: 0x8a6440, uvScale: 1.4 },
    bars: { preset: 'steel', color: 0x71767c },
    hole: { color: 0x090807, texture: 'smooth', roughness: 1 },
  };

  /* Painted board and vinyl in the colours a street of houses actually
     comes in. Five of them, because five is enough for the eye and each one
     past that is another three textures on the card. */
  const SIDING = [
    { preset: 'wood', color: 0xc6c0ae, uvScale: 6.5, roughness: 0.84 },
    { preset: 'wood', color: 0x9aa398, uvScale: 6.5, roughness: 0.84 },
    { preset: 'wood', color: 0xb08f6a, uvScale: 6.5, roughness: 0.8 },
    { preset: 'wood', color: 0x8c7f6d, uvScale: 6.5, roughness: 0.86 },
    { preset: 'wood', color: 0xd6cdb6, uvScale: 6.5, roughness: 0.82 },
  ];

  /* A hash of a position, so the same house is the same colour and the same
     door swings the same way every time you walk back into the street. */
  function seedAt(x, z, salt) {
    const a = Math.round(x * 16) | 0;
    const b = Math.round(z * 16) | 0;
    return (((a * 73856093) ^ (b * 19349663) ^ ((salt | 0) * 83492791)) >>> 0) || 1;
  }

  function sidingFor(b) {
    const rng = new LE.Rng(seedAt(b.x, b.z, (b.id || 0) + 11));
    return SIDING[rng.int(SIDING.length)];
  }

  function exteriorMaterial(rec) {
    const a = rec.building.exteriorAssembly;
    if (a === 'concreteWall') return MAT.concrete;
    if (a === 'cinderBlockWall') return MAT.cinder;
    if (a === 'exteriorBrickVeneer') return MAT.brick;
    return rec.siding;
  }

  /* The assembly is the truth, not the exterior flag: the prison rebuilds
     its interior partitions in cinder block after the plan is laid out. */
  function wallMaterial(wall, rec) {
    if (wall.assembly === 'concreteWall') return MAT.concrete;
    if (wall.assembly === 'cinderBlockWall') return MAT.cinder;
    if (!wall.exterior) return MAT.interior;
    if (wall.assembly === 'exteriorBrickVeneer') return MAT.brick;
    return rec.siding;
  }

  function wallThickness(wall) {
    if (wall.assembly === 'concreteWall' || wall.assembly === 'cinderBlockWall') return T_EXT;
    return wall.exterior ? T_EXT : T_INT;
  }

  function floorMaterial(room) {
    const spec = SV.ROOM && SV.ROOM[room.type];
    if (spec && spec.concreteFloor) return MAT.floorConcrete;
    if (room.type === 'basement' || room.type === 'garage') return MAT.floorConcrete;
    if (spec && spec.wet) return MAT.floorTile;
    return MAT.floorWood;
  }

  /* ---------------- cutting a wall up ----------------

     Walk the openings in order along the wall and emit the solid parts that
     survive them: full-height panels between openings, a sill panel under a
     window, a header over both. Openings that overlap collapse into one gap
     rather than fighting over the same metre. */
  function panelsOf(wall) {
    const len = wall.lengthM;
    const H = wall.heightM;
    const out = [];
    const ops = wall.openings.slice().sort((a, b) => a.u - b.u);
    let cursor = 0;
    for (const o of ops) {
      const start = Math.max(0, Math.min(len, o.u));
      const end = Math.max(0, Math.min(len, o.u + o.w));
      if (end <= cursor + 0.02) continue;
      if (start - cursor > 0.03) out.push({ u0: cursor, u1: start, y0: 0, y1: H });
      const u0 = Math.max(start, cursor);
      const sill = Math.max(0, Math.min(H, o.y || 0));
      const head = Math.max(0, Math.min(H, (o.y || 0) + o.h));
      if (end - u0 > 0.03) {
        if (sill > 0.03) out.push({ u0, u1: end, y0: 0, y1: sill });
        if (H - head > 0.03) out.push({ u0, u1: end, y0: head, y1: H });
      }
      cursor = end;
    }
    if (len - cursor > 0.03) out.push({ u0: cursor, u1: len, y0: 0, y1: H });
    return out;
  }

  /* Local +X maps to (cos, 0, -sin) under a yaw, so this is the angle that
     lays a box along the wall. */
  function yawOf(dx, dz) { return Math.atan2(-dz, dx); }

  /* ---------------- spawning ---------------- */

  function track(rec, actor) {
    rec.count++;
    actorCount++;
    return actor;
  }

  function drop(actor) {
    if (!actor || actor.dead) return;
    try { actor.destroy(); } catch (err) { /* already gone with its engine */ }
    actorCount--;
  }

  function buildFloor(rec, room) {
    const b = rec.building;
    // Basements have no stairs down to them yet and their slab would be
    // buried in the terrain, so they are data until something digs them out.
    if (room.storey < 0) return 0;
    const top = b.y + room.storey * b.storeyHeightM;
    const a = game.box({
      at: [room.centreX, top - FLOOR_T / 2, room.centreZ],
      size: [room.w, FLOOR_T, room.d],
      material: floorMaterial(room), static: true, name: 'floor',
    });
    a.userData = { kind: 'floor', room, building: b };
    rec.fixed.push(track(rec, a));
    return 1;
  }

  /* The one bit of trigonometry the rest of the file leans on: where the
     wall starts, which way it runs, and what yaw lays a box along it. */
  function wallFrame(rec, wall) {
    const len = wall.lengthM;
    const dx = (wall.x2 - wall.x1) / len;
    const dz = (wall.z2 - wall.z1) / len;
    return {
      len, dx, dz,
      deg: yawOf(dx, dz) * RAD,
      baseY: rec.building.y + wall.storey * rec.building.storeyHeightM,
      t: wallThickness(wall),
    };
  }

  /* The solid parts of one wall. Split out from buildWall because damage
     re-cuts these and leaves the doors and glazing where they are. */
  function layPanels(rec, wall, f, list) {
    const b = rec.building;
    const mat = wallMaterial(wall, rec);
    for (const p of panelsOf(wall)) {
      const um = (p.u0 + p.u1) / 2;
      const a = game.box({
        at: [wall.x1 + f.dx * um, f.baseY + (p.y0 + p.y1) / 2, wall.z1 + f.dz * um],
        size: [p.u1 - p.u0, p.y1 - p.y0, f.t],
        rotation: [0, f.deg, 0],
        material: mat, static: true, name: 'wall',
      });
      // Weapons walk this back to wall.layersAt(u) for the layer stack, so
      // the wall object itself has to travel with the actor.
      a.userData = { kind: 'wall', wall, building: b, panel: p };
      list.push(track(rec, a));
    }

    /* Damage. A bullet hole is a couple of centimetres across and cutting a
       real disc out of the panel would mean rebuilding the mesh for every
       round that lands, so the hole is a dark box straddling the wall: it
       reads from both faces and costs one instance. */
    const holes = wall.holes.length > MAX_HOLE_DECALS
      ? wall.holes.slice(wall.holes.length - MAX_HOLE_DECALS) : wall.holes;
    for (const h of holes) {
      const r = Math.max(0.02, h.r || 0.02);
      const a = game.box({
        at: [wall.x1 + f.dx * h.u, f.baseY + h.y, wall.z1 + f.dz * h.u],
        size: [r * 2.2, r * 2.2, f.t + 0.02],
        rotation: [0, f.deg, 0],
        material: MAT.hole, physics: false, name: 'hole',
      });
      a.userData = { kind: 'hole', wall, building: b };
      list.push(track(rec, a));
    }

    if (list.length) wallActor.set(wall, list[0]);
    return list.length;
  }

  function buildWall(rec, wall) {
    if (!(wall.lengthM > 0.2)) return 0;
    const f = wallFrame(rec, wall);
    const list = [];
    rec.parts.set(wall, list);
    wallOwner.set(wall, rec);
    let n = layPanels(rec, wall, f, list);
    for (const o of wall.openings) {
      n += o.kind === 'door' ? buildDoor(rec, wall, o, f) : buildWindow(rec, wall, o, f);
    }
    return n;
  }

  function buildDoor(rec, wall, o, f) {
    const b = rec.building;
    const hx = wall.x1 + f.dx * o.u;
    const hz = wall.z1 + f.dz * o.u;
    const rng = new LE.Rng(seedAt(hx, hz, (b.id || 0) + 3));
    const leafW = Math.max(0.4, o.w - 0.03);
    const leafH = Math.max(1.2, o.h - 0.04);
    const door = {
      opening: o, wall, building: b,
      hx, hz, baseY: f.baseY + (o.y || 0),
      baseYaw: yawOf(f.dx, f.dz),
      swing: rng.next() < 0.5 ? 1 : -1,
      w: leafW, h: leafH,
      open: !!o.open, k: o.open ? 1 : 0, target: o.open ? 1 : 0,
      parts: [], lastUse: 0,
    };

    if (o.barred) {
      // Cell doors: five bars and two rails, which is a lot cheaper than it
      // looks and is the difference between a cell and a cupboard.
      for (let i = 0; i < 5; i++) {
        const a = game.box({ size: [0.045, leafH, 0.045], material: MAT.bars, static: true, name: 'bar' });
        door.parts.push({ actor: track(rec, a), du: ((i + 0.5) / 5) * leafW, dy: leafH / 2 });
      }
      for (let i = 0; i < 2; i++) {
        const a = game.box({ size: [leafW, 0.06, 0.05], material: MAT.bars, static: true, name: 'rail' });
        door.parts.push({ actor: track(rec, a), du: leafW / 2, dy: 0.28 + i * (leafH - 0.56) });
      }
    } else {
      const a = game.box({ size: [leafW, leafH, 0.05], material: MAT.door, static: true, name: 'door' });
      door.parts.push({ actor: track(rec, a), du: leafW / 2, dy: leafH / 2 });
    }

    for (const p of door.parts) {
      p.actor.userData = { kind: 'door', door, opening: o, wall, building: b };
      doorByActor.set(p.actor, door);
    }
    placeDoor(door);
    rec.doors.push(door);
    return door.parts.length;
  }

  function buildWindow(rec, wall, o, f) {
    if (o.broken) return 0;
    const um = o.u + o.w / 2;
    const a = game.box({
      at: [wall.x1 + f.dx * um, f.baseY + (o.y || 0) + o.h / 2, wall.z1 + f.dz * um],
      size: [Math.max(0.2, o.w - 0.06), Math.max(0.2, o.h - 0.06), GLASS_T],
      rotation: [0, f.deg, 0],
      // No collider: the pane is what you see through and what you climb
      // through once it is gone, and neither wants a box in the way.
      material: 'glass', physics: false, name: 'glass',
    });
    a.userData = { kind: 'glass', opening: o, wall, building: rec.building };
    rec.glass.push({ opening: o, actor: track(rec, a) });
    return 1;
  }

  /* The floors a tower never laid out. The generator details four storeys
     and leaves the rest as a note saying everything above the fourth floor
     is stairs; a solid mass is the honest way to draw a storey that has no
     rooms in it, and it costs one instance instead of thirty. */
  function buildShell(rec) {
    const b = rec.building;
    const extra = b.undetailedStoreys || 0;
    if (extra <= 0) return 0;
    const h = b.storeyHeightM;
    const detailed = Math.max(0, b.storeys - extra);
    const a = game.box({
      at: [b.x + b.w / 2, b.y + detailed * h + (extra * h) / 2, b.z + b.d / 2],
      size: [b.w, extra * h, b.d],
      material: exteriorMaterial(rec), static: true, name: 'shell',
    });
    a.userData = { kind: 'shell', building: b };
    rec.fixed.push(track(rec, a));
    return 1;
  }

  /* A gable at full size, cached by its rounded dimensions so a street of
     similar houses shares one upload and one draw. The underside is closed
     off because materials are single-sided and a player standing in the top
     bedroom would otherwise look straight through the roof at the sky. */
  function gableGeometry(W, D, H) {
    const key = `${W.toFixed(2)}x${D.toFixed(2)}x${H.toFixed(2)}`;
    let g = roofGeoCache.get(key);
    if (g) return { geometry: g, key: `bld:gable:${key}` };
    g = new LE.Geometry();
    const hw = W / 2, hd = D / 2;
    const slopeLen = Math.hypot(hd, H);
    const nz = hd / slopeLen, ny = H / slopeLen;

    // South slope, ridge down to +Z.
    let a = g.vert(-hw, 0, hd, 0, ny, nz, -hw, slopeLen);
    let b = g.vert(hw, 0, hd, 0, ny, nz, hw, slopeLen);
    let c = g.vert(hw, H, 0, 0, ny, nz, hw, 0);
    let d = g.vert(-hw, H, 0, 0, ny, nz, -hw, 0);
    g.quad(a, b, c, d);

    // North slope.
    a = g.vert(-hw, H, 0, 0, ny, -nz, -hw, 0);
    b = g.vert(hw, H, 0, 0, ny, -nz, hw, 0);
    c = g.vert(hw, 0, -hd, 0, ny, -nz, hw, slopeLen);
    d = g.vert(-hw, 0, -hd, 0, ny, -nz, -hw, slopeLen);
    g.quad(a, b, c, d);

    // Gable ends.
    a = g.vert(hw, 0, -hd, 1, 0, 0, -hd, 0);
    b = g.vert(hw, H, 0, 1, 0, 0, 0, H);
    c = g.vert(hw, 0, hd, 1, 0, 0, hd, 0);
    g.tri(a, b, c);
    a = g.vert(-hw, 0, -hd, -1, 0, 0, -hd, 0);
    b = g.vert(-hw, 0, hd, -1, 0, 0, hd, 0);
    c = g.vert(-hw, H, 0, -1, 0, 0, 0, H);
    g.tri(a, b, c);

    // Soffit.
    a = g.vert(-hw, 0, -hd, 0, -1, 0, -hw, -hd);
    b = g.vert(hw, 0, -hd, 0, -1, 0, hw, -hd);
    c = g.vert(hw, 0, hd, 0, -1, 0, hw, hd);
    d = g.vert(-hw, 0, hd, 0, -1, 0, -hw, hd);
    g.quad(a, b, c, d);

    g.finalize();
    roofGeoCache.set(key, g);
    return { geometry: g, key: `bld:gable:${key}` };
  }

  function buildRoof(rec) {
    const b = rec.building;
    // The prison levels are cut into the hill and the sky is not their
    // problem.
    if (b.subterranean) return 0;
    const h = b.storeyHeightM || 2.7;
    const top = b.y + b.storeys * h;
    const cx = b.x + b.w / 2;
    const cz = b.z + b.d / 2;
    const pitch = b.roofPitch != null ? b.roofPitch : 0.45;
    let a;

    // A gable is a house roof. Over a forty-metre city block it is a
    // cathedral, so anything with that span gets the flat roof it would
    // really have.
    if (pitch > 0.12 && Math.min(b.w, b.d) <= 16 && !b.undetailedStoreys) {
      const alongX = b.w >= b.d;
      const W = Math.round(((alongX ? b.w : b.d) + EAVE_M * 2) * 4) / 4;
      const D = Math.round(((alongX ? b.d : b.w) + EAVE_M * 2) * 4) / 4;
      const H = Math.round(Math.min(4.2, (D / 2) * pitch) * 4) / 4;
      const geo = gableGeometry(W, D, H);
      a = game.mesh({
        geometry: geo.geometry, key: geo.key,
        at: [cx, top, cz], rotation: [0, alongX ? 0 : 90, 0],
        material: MAT.roof, physics: false, name: 'roof',
      });
    } else {
      a = game.box({
        at: [cx, top + 0.12, cz],
        size: [b.w + EAVE_M, 0.24, b.d + EAVE_M],
        material: MAT.roofFlat, physics: false, name: 'roof',
      });
    }
    a.userData = { kind: 'roof', building: b };
    rec.fixed.push(track(rec, a));
    rec.roofActor = a;
    if (insideNow && insideNow.building === b) a.visible = false;
    return 1;
  }

  /* ---------------- the build queue ----------------

     A house is a hundred actors and a city block is a thousand, and paying
     for either in one frame is a visible stall. Each building carries a
     plan of pieces ordered by how much the player needs them — the storey
     under their feet first, exterior before interior, walls before floors —
     and the queue spends a fixed budget of pieces per frame. */
  function planFor(rec, focusStorey) {
    const b = rec.building;
    const items = [];
    for (const w of b.walls) {
      items.push({ kind: 'wall', wall: w, storey: w.storey, rank: w.exterior ? 0 : 1 });
    }
    for (const r of b.rooms) {
      if (r.storey < 0) continue;
      items.push({ kind: 'floor', room: r, storey: r.storey, rank: 2 });
    }
    items.sort((p, q) => {
      const dp = Math.abs(p.storey - focusStorey) - Math.abs(q.storey - focusStorey);
      return dp !== 0 ? dp : p.rank - q.rank;
    });
    return items;
  }

  function enqueue(b) {
    const rec = {
      building: b, state: 'building', siding: sidingFor(b),
      parts: new Map(), fixed: [], doors: [], glass: [], roofActor: null,
      count: 0, cap: CAP_PER_BUILDING, cursor: 0, truncated: false,
      focus: focusStoreyFor(b),
      shellDone: false, roofDone: false, dropped: false,
    };
    rec.plan = planFor(rec, rec.focus);
    live.set(b.id, rec);
    queue.push(rec);
    return rec;
  }

  function focusStoreyFor(b) {
    const inside = insideNow && insideNow.building === b ? insideNow.storey : 0;
    return Math.max(0, inside);
  }

  function stepBuild(rec) {
    const plan = rec.plan;
    if (rec.cursor < plan.length) {
      if (rec.count >= rec.cap) { rec.truncated = true; rec.cursor = plan.length; return 0; }
      const item = plan[rec.cursor++];
      return item.kind === 'wall' ? buildWall(rec, item.wall) : buildFloor(rec, item.room);
    }
    if (!rec.shellDone) { rec.shellDone = true; return buildShell(rec); }
    if (!rec.roofDone) { rec.roofDone = true; return buildRoof(rec); }
    rec.state = 'live';
    return 0;
  }

  function pump() {
    let budget = SPAWN_PER_FRAME;
    while (queue.length && budget > 0) {
      const rec = queue[0];
      if (rec.dropped || rec.state === 'live') { queue.shift(); continue; }
      try {
        budget -= Math.max(1, stepBuild(rec));
      } catch (err) {
        // One bad wall should cost one wall, not the house.
        report('a piece would not build', err);
        rec.cursor++;
        budget--;
      }
    }
  }

  /* A truncated building whose player has climbed past the storeys it built
     gets the rest of its plan re-sorted and a little more rope, rather than
     being torn down and rebuilt under someone's feet. */
  function refocus(rec, storey) {
    if (rec.focus === storey) return;
    rec.focus = storey;
    if (!rec.truncated) return;
    const rest = rec.plan.slice(rec.cursor);
    if (!rest.length) return;
    rest.sort((p, q) => {
      const dp = Math.abs(p.storey - storey) - Math.abs(q.storey - storey);
      return dp !== 0 ? dp : p.rank - q.rank;
    });
    rec.plan = rest;
    rec.cursor = 0;
    rec.cap = rec.count + Math.round(CAP_PER_BUILDING * 0.6);
    rec.truncated = false;
    rec.state = 'building';
    if (queue.indexOf(rec) < 0) queue.push(rec);
  }

  function demolish(rec) {
    rec.dropped = true;
    rec.state = 'gone';
    for (const [wall, list] of rec.parts) {
      for (const a of list) drop(a);
      wallActor.delete(wall);
      wallOwner.delete(wall);
    }
    rec.parts.clear();
    for (const a of rec.fixed) drop(a);
    rec.fixed.length = 0;
    for (const g of rec.glass) drop(g.actor);
    rec.glass.length = 0;
    for (const d of rec.doors) {
      swinging.delete(d);
      for (const p of d.parts) { doorByActor.delete(p.actor); drop(p.actor); }
    }
    rec.doors.length = 0;
    rec.roofActor = null;
    live.delete(rec.building.id);
    if (insideNow && insideNow.building === rec.building) {
      insideNow = null;
      dropLight();
    }
  }

  /* ---------------- distance budget ---------------- */

  function scan() {
    const px = ctx.player.x, pz = ctx.player.z;
    const near = [];
    for (const e of index) {
      const d = Math.hypot(px - e.cx, pz - e.cz) - e.r;
      e.d = d;
      if (d < BUILD_M) { if (!live.has(e.b.id)) near.push(e); } else if (d > DROP_M) {
        const rec = live.get(e.b.id);
        if (rec) demolish(rec);
      }
    }
    if (!near.length) return;
    near.sort((a, b) => a.d - b.d);
    for (const e of near) {
      if (actorCount >= CAP_TOTAL) break;
      if (live.size >= MAX_LIVE) {
        const far = farthestLive(px, pz);
        // Only evict for something meaningfully closer, or the two of them
        // trade places every scan.
        if (!far || far.d < e.d + 25) break;
        demolish(far.rec);
      }
      enqueue(e.b);
    }
  }

  function farthestLive(px, pz) {
    let worst = null;
    for (const rec of live.values()) {
      const b = rec.building;
      const d = Math.hypot(px - (b.x + b.w / 2), pz - (b.z + b.d / 2));
      if (!worst || d > worst.d) worst = { rec, d };
    }
    return worst;
  }

  /* ---------------- where the player is ---------------- */

  function footY() {
    const av = ctx.avatar;
    // The avatar's position is the capsule centre; the storey is decided by
    // where the feet are.
    return av ? av.position.y - 0.9 : ctx.player.y;
  }

  function testBuilding(b, x, z, y) {
    if (x < b.x || x > b.x + b.w || z < b.z || z > b.z + b.d) return null;
    const h = b.storeyHeightM || 2.7;
    if (y < b.y - h * 1.3 || y > b.y + b.storeys * h + 1.5) return null;
    let storey = Math.floor((y - b.y) / h + 0.02);
    if (storey < 0) storey = b.hasBasement ? -1 : 0;
    if (storey > b.storeys) storey = b.storeys;
    return { building: b, room: b.roomAt(x, z, storey), storey };
  }

  function buildingAt(x, z, y) {
    const yy = y != null ? y : footY();
    // The building you are standing in is almost always one that is built,
    // so try those first and only fall back to the whole island.
    for (const rec of live.values()) {
      const hit = testBuilding(rec.building, x, z, yy);
      if (hit) return hit;
    }
    for (const e of index) {
      if (live.has(e.b.id)) continue;
      const hit = testBuilding(e.b, x, z, yy);
      if (hit) return hit;
    }
    return null;
  }

  /* ---------------- doors ---------------- */

  function placeDoor(d) {
    const ang = d.baseYaw + d.swing * SWING_RAD * d.k;
    const ux = Math.cos(ang), uz = -Math.sin(ang);
    const deg = ang * RAD;
    for (const p of d.parts) {
      p.actor.setPosition([d.hx + ux * p.du, d.baseY + p.dy, d.hz + uz * p.du]);
      p.actor.setRotation([0, deg, 0]);
    }
  }

  function useDoor(target) {
    const d = resolveDoor(target);
    if (!d) return { ok: false, reason: 'not a door' };
    const now = performance.now();
    // Interaction and this module may both answer the same keypress; the
    // second one inside a tenth of a second is the same press, not a second
    // one, and must not slam the door it just opened.
    if (now - d.lastUse < 140) return { ok: true, open: d.open, repeat: true };
    d.lastUse = now;
    if (d.opening.locked && !d.open) {
      ctx.toast('The door is locked.');
      return { ok: false, locked: true, open: false, door: d };
    }
    d.open = !d.open;
    // The opening carries the state, so a door left open stays open in the
    // world's own data after the geometry is thrown away.
    d.opening.open = d.open;
    d.target = d.open ? 1 : 0;
    swinging.add(d);
    ctx.emit('door', { door: d, open: d.open, locked: !!d.opening.locked, building: d.building });
    return { ok: true, open: d.open, door: d };
  }

  function resolveDoor(target) {
    if (!target) return null;
    if (target.parts && target.opening) return target;
    if (target.actor) return doorByActor.get(target.actor) || null;
    if (target.door) return target.door;
    const direct = doorByActor.get(target);
    if (direct) return direct;
    if (target.userData && target.userData.door) return target.userData.door;
    return null;
  }

  function swingDoors(dt) {
    if (!swinging.size) return;
    for (const d of swinging) {
      const step = dt / SWING_S;
      if (d.k < d.target) d.k = Math.min(d.target, d.k + step);
      else if (d.k > d.target) d.k = Math.max(d.target, d.k - step);
      placeDoor(d);
      if (Math.abs(d.k - d.target) < 1e-4) swinging.delete(d);
    }
  }

  /* The door in front of you, without a raycast. A raycast is a linear scan
     of every body in the world and there are a couple of thousand of them
     once a street is up, so the cheap test — near, and roughly in front —
     runs every frame and the expensive one never has to. */
  function doorAhead(maxM) {
    const a = ctx.aim();
    const ox = a.origin.x, oy = a.origin.y, oz = a.origin.z;
    let best = null, bestScore = 0;
    for (const rec of live.values()) {
      for (const d of rec.doors) {
        const cx = d.hx + Math.cos(d.baseYaw + d.swing * SWING_RAD * d.k) * d.w / 2;
        const cz = d.hz - Math.sin(d.baseYaw + d.swing * SWING_RAD * d.k) * d.w / 2;
        const cy = d.baseY + d.h / 2;
        const vx = cx - ox, vy = cy - oy, vz = cz - oz;
        const dist = Math.hypot(vx, vy, vz);
        if (dist > maxM || dist < 1e-3) continue;
        const dot = (vx * a.direction.x + vy * a.direction.y + vz * a.direction.z) / dist;
        if (dot < 0.72) continue;
        const score = dot / (0.5 + dist);
        if (score > bestScore) { bestScore = score; best = d; }
      }
    }
    return best;
  }

  /* ---------------- inside ---------------- */

  function circuitFor(building, room) {
    if (!building.circuits || room.circuitId == null) return null;
    for (const c of building.circuits) if (c.id === room.circuitId) return c;
    return null;
  }

  /* Whether this room has light is entirely the electrical model's answer:
     the island has no power source until somebody starts one, so every
     interior is dark and a torch is a real decision. The loads name their
     room by type rather than by object, which is as close as the wiring
     gets to a fitting on a ceiling. */
  function litRoom(building, room) {
    if (!building.powered) return false;
    if (!building.panel || !building.panel.on) return false;
    const c = circuitFor(building, room);
    if (!c || c.tripped) return false;
    for (const l of c.loads) {
      if (l.kind === 'light' && l.room === room.type && l.working) return true;
    }
    return false;
  }

  function dropLight() {
    if (!interiorLight) return;
    try {
      const list = game.renderer && game.renderer.lights;
      const i = list ? list.indexOf(interiorLight) : -1;
      if (i >= 0) list.splice(i, 1);
      else interiorLight.intensity = 0;
    } catch (err) {
      interiorLight.intensity = 0;
    }
    interiorLight = null;
  }

  function syncLight(here) {
    if (!here || !here.room || !litRoom(here.building, here.room)) { dropLight(); return; }
    const b = here.building, room = here.room;
    const y = b.y + room.storey * b.storeyHeightM + Math.min(2.3, b.storeyHeightM - 0.35);
    const radius = Math.max(room.w, room.d) * 0.9 + 3;

    /* What lights a room the player is standing in. By day it is daylight
       through the windows, bounced off the walls — cool, and only as strong
       as the day outside. At night it is nothing at all unless the circuit
       feeding this room is live, and nothing on this island is live until
       somebody makes it so. A warm bulb burning in every abandoned house
       would be the most obvious lie in the game. */
    const outside = ctx.world.clock.lightLevel();
    const windows = room.type === 'basement' || room.type === 'closet' ? 0.12 : 1;
    const powered = !!(room.powered || (here.building.panel && here.building.panel.live));
    const day = outside * windows;
    const colour = powered && outside < 0.3 ? 0xffd7a4 : 0xbfd2e0;
    const intensity = powered && outside < 0.3 ? 9 : 1.2 + day * 7.5;
    if (!interiorLight) {
      interiorLight = game.light({ at: [room.centreX, y, room.centreZ], color: colour, intensity, radius });
    } else {
      interiorLight.position.set(room.centreX, y, room.centreZ);
      interiorLight.radius = radius;
      interiorLight.intensity = intensity;
      if (interiorLight.color && interiorLight.color.set) {
        interiorLight.color.set(((colour >> 16) & 255) / 255, ((colour >> 8) & 255) / 255, (colour & 255) / 255);
      }
    }
  }

  function showRoof(building, visible) {
    const rec = live.get(building.id);
    if (rec && rec.roofActor && !rec.roofActor.dead) rec.roofActor.visible = visible;
  }

  function updateInside() {
    const here = buildingAt(ctx.player.x, ctx.player.z, footY());
    const was = insideNow;
    const wasB = was && was.building;
    const nowB = here && here.building;

    if (nowB !== wasB) {
      if (wasB) { showRoof(wasB, true); ctx.emit('building-left', { building: wasB }); }
      if (nowB) {
        // A roof over the room you are standing in hides the room, so it
        // comes off while you are inside and goes back on when you leave.
        showRoof(nowB, false);
        ctx.log(`You step inside ${nowB.name}.`);
        ctx.emit('building-entered', here);
      }
    } else if (here && was && (here.room !== was.room || here.storey !== was.storey)) {
      ctx.emit('room-changed', here);
    }

    if (nowB) {
      const rec = live.get(nowB.id);
      if (rec) refocus(rec, Math.max(0, here.storey));
    }

    insideNow = here;
    ctx.state.indoors = !!here;
    ctx.state.roomHere = here ? here.room : null;
    ctx.state.buildingHere = nowB || null;
    syncLight(here);
  }

  function updatePrompt() {
    const d = doorAhead(2.6);
    if (d) {
      ctx.hud.setPrompt(d.opening.locked && !d.open ? 'E — the door is locked'
        : d.open ? 'E — close the door' : 'E — open the door');
      promptMine = true;
    } else if (promptMine) {
      ctx.hud.setPrompt('');
      promptMine = false;
    }
  }

  /* Panes are dropped rather than shattered here: whatever broke the window
     owns the noise and the glass on the floor, and this module only stops
     drawing something the simulation says is gone. */
  function sweepGlass() {
    for (const rec of live.values()) {
      for (let i = rec.glass.length - 1; i >= 0; i--) {
        const g = rec.glass[i];
        if (!g.opening.broken && !g.actor.dead) continue;
        drop(g.actor);
        rec.glass.splice(i, 1);
      }
    }
  }

  /* Re-cut one wall after something went through it. Only the solid parts
     change — a breach does not move the doorway next to it — so the doors
     and the glazing stay exactly where they were. */
  function rebuildWall(wall) {
    const rec = wallOwner.get(wall);
    if (!rec || rec.dropped) return false;
    const old = rec.parts.get(wall);
    if (old) {
      for (const a of old) drop(a);
      rec.count -= old.length;
    }
    wallActor.delete(wall);
    try {
      const list = [];
      rec.parts.set(wall, list);
      if (wall.lengthM > 0.2) layPanels(rec, wall, wallFrame(rec, wall), list);
      return true;
    } catch (err) {
      report('a damaged wall would not rebuild', err);
      return false;
    }
  }

  function report(what, err) {
    faults++;
    if (faults <= 3) ctx.log(`(buildings: ${what})`);
    if (faults === 40) { disabled = true; ctx.log('(buildings: giving up)'); }
    console.error('[buildings]', what, err);
  }

  /* ---------------- frame ---------------- */

  function step(dt, c) {
    if (disabled) return;
    // The core drives modules through ctx.onUpdate; the contract also
    // advertises module.update. Whichever fires, the frame steps once.
    const frame = game && game.frame != null ? game.frame : -1;
    if (frame >= 0 && frame === lastFrame) return;
    lastFrame = frame;
    try {
      scanAccum += dt;
      if (scanAccum >= SCAN_S) { scanAccum = 0; scan(); sweepGlass(); }
      pump();
      swingDoors(dt);
      updateInside();
      updatePrompt();
    } catch (err) {
      report('the frame failed', err);
    }
  }

  SurvivorGame.module({
    id: 'buildings',
    order: 10,

    init(c) {
      ctx = c; game = c.game; LE = c.LE; SV = c.SV;

      index = [];
      for (const poi of ctx.world.pois || []) {
        for (const b of poi.buildings || []) {
          if (!b || !b.walls) continue;
          index.push({
            b, poi,
            cx: b.x + b.w / 2, cz: b.z + b.d / 2,
            // Distances are measured to the footprint's edge, so a forty
            // metre city block is not treated as a point at its centre.
            r: Math.hypot(b.w, b.d) / 2, d: Infinity,
          });
        }
      }

      ctx.state.buildingAt = buildingAt;
      ctx.state.wallActorFor = (wall) => wallActor.get(wall) || null;
      ctx.state.doorFor = (actor) => doorByActor.get(actor) || null;
      ctx.state.useDoor = useDoor;
      ctx.state.rebuildWall = rebuildWall;
      ctx.state.indoors = false;
      ctx.state.roomHere = null;
      ctx.state.buildingHere = null;

      ctx.on('door-toggle', (data) => { try { useDoor(data); } catch (err) { report('a door jammed', err); } });
      ctx.on('wall-damaged', (data) => {
        if (data && data.wall) rebuildWall(data.wall);
      });

      ctx.key('e', () => {
        const d = doorAhead(2.6);
        if (d) useDoor(d);
      }, 'Open or close a door');

      ctx.onUpdate(step);
      // Put the first street up before the player's first frame rather than
      // watching it grow out of the ground.
      scan();
      let guard = 40;
      while (queue.length && guard-- > 0) pump();
    },

    update: step,
  });
})();
