/* ============================================================
   STRUCTURES — buildings made of the same layers bullets go
   through.

   A wall here is not a box with a "destructible" flag. It is the
   assembly: siding, sheathing, insulated cavity, studs at 16 inch
   centres, gypsum, paper. The penetration model already knows what
   those are, so shooting through a bedroom wall, breaking one open
   with a hammer, patching the hole and repainting it are all the
   same object seen from different angles.

   Rooms are laid out by recursive subdivision rather than picked
   from a library, so twenty-six houses in the same street are
   twenty-six different houses with plausible plans — a hall you
   actually walk down, bedrooms off it, a bathroom that backs onto
   the kitchen because that is where the plumbing is.
   ============================================================ */

const ROOM = {
  livingRoom: { id: 'livingRoom', minArea: 16, maxArea: 40, weight: 1, exterior: true, windows: 2 },
  kitchen: { id: 'kitchen', minArea: 8, maxArea: 20, weight: 1, exterior: true, windows: 1, wet: true },
  diningRoom: { id: 'diningRoom', minArea: 10, maxArea: 22, weight: 0.7, exterior: true, windows: 1 },
  bedroom: { id: 'bedroom', minArea: 9, maxArea: 22, weight: 2.2, exterior: true, windows: 1 },
  bathroom: { id: 'bathroom', minArea: 3.5, maxArea: 9, weight: 1.3, exterior: false, windows: 0.4, wet: true },
  hallway: { id: 'hallway', minArea: 4, maxArea: 14, weight: 1, exterior: false, windows: 0, circulation: true },
  utility: { id: 'utility', minArea: 4, maxArea: 10, weight: 0.8, exterior: true, windows: 0.3, wet: true, panel: true },
  garage: { id: 'garage', minArea: 18, maxArea: 40, weight: 0.7, exterior: true, windows: 0.2, concreteFloor: true },
  closet: { id: 'closet', minArea: 1.5, maxArea: 4, weight: 0.9, exterior: false, windows: 0 },
  office: { id: 'office', minArea: 8, maxArea: 18, weight: 0.5, exterior: true, windows: 1 },
  basement: { id: 'basement', minArea: 20, maxArea: 60, weight: 0, exterior: false, windows: 0, below: true },
  attic: { id: 'attic', minArea: 15, maxArea: 45, weight: 0, exterior: false, windows: 0.5, above: true },
  cell: { id: 'cell', minArea: 5, maxArea: 8, weight: 0, exterior: false, windows: 0.3, barred: true },
  ward: { id: 'ward', minArea: 25, maxArea: 60, weight: 0, exterior: true, windows: 2 },
  storeroom: { id: 'storeroom', minArea: 6, maxArea: 20, weight: 0, exterior: false, windows: 0 },
  lobby: { id: 'lobby', minArea: 30, maxArea: 90, weight: 0, exterior: true, windows: 4 },
  officeFloor: { id: 'officeFloor', minArea: 60, maxArea: 300, weight: 0, exterior: true, windows: 8 },
};

/* What is worth searching where. Loot follows the room, because that is what
   makes searching a house a decision rather than a chore: the bathroom
   cabinet is where the pills are and the garage is where the tools are, and
   a player who knows that clears a street twice as fast. */
const ROOM_LOOT = {
  livingRoom: ['batteries', 'lighter', 'blanket', 'radio', 'cash', 'bottle', 'magazine'],
  kitchen: ['cannedFood', 'knife', 'pot', 'matches', 'salt', 'waterBottle', 'foil', 'cookingOil'],
  diningRoom: ['candle', 'tablecloth', 'cutlery', 'liquor'],
  bedroom: ['clothing', 'boots', 'backpack', 'watch', 'painkillers', 'ammunition', 'jewellery'],
  bathroom: ['antiseptic', 'bandage', 'painkillers', 'antibiotics', 'soap', 'razor', 'toothbrush', 'iodine'],
  hallway: ['torch', 'umbrella', 'keys'],
  utility: ['duct tape', 'fuse', 'wire', 'toolbox', 'bleach', 'rope', 'workGloves'],
  garage: ['axe', 'hammer', 'saw', 'nails', 'fuel', 'oil', 'crowbar', 'sparkPlug', 'weldingRod', 'gunCleaningKit'],
  closet: ['clothing', 'boots', 'shotgunShells', 'sleepingBag'],
  office: ['paper', 'map', 'pen', 'laptop', 'documents'],
  basement: ['preserves', 'toolbox', 'generator', 'fuel', 'gunSafe'],
  attic: ['suitcase', 'insulation', 'oldRifle', 'photographs'],
  storeroom: ['cannedFood', 'medicalSupplies', 'ammunition', 'fuel'],
  ward: ['antibiotics', 'saline', 'sutures', 'morphine', 'gauze', 'antitoxin'],
  cell: ['shiv', 'cigarettes', 'blanket'],
  lobby: ['map', 'firstAidKit', 'radio'],
  officeFloor: ['laptop', 'documents', 'firstAidKit', 'coffee'],
};


/* One rectangular room on one storey. */
class Room {
  constructor(x, z, w, d, type, storey = 0) {
    this.x = x; this.z = z;          // south-west corner, world metres
    this.w = w; this.d = d;
    this.type = type;
    this.storey = storey;
    this.doors = [];
    this.windows = [];
    this.contents = [];
    this.searched = false;
    this.lit = false;
    this.circuitId = null;
  }
  get area() { return this.w * this.d; }
  get centreX() { return this.x + this.w / 2; }
  get centreZ() { return this.z + this.d / 2; }
  contains(x, z) { return x >= this.x && x <= this.x + this.w && z >= this.z && z <= this.z + this.d; }
}

/* A wall segment, with the assembly it is built from and the damage it has
   taken. Openings are holes in it — from a doorway, or from a sledgehammer,
   or from a .308 that kept going. */
class Wall {
  constructor(opts) {
    this.x1 = opts.x1; this.z1 = opts.z1;
    this.x2 = opts.x2; this.z2 = opts.z2;
    this.storey = opts.storey || 0;
    this.heightM = opts.heightM || 2.44;      // 8 ft, because that is what drywall comes in
    this.assembly = opts.assembly || 'interiorPartition';
    this.exterior = !!opts.exterior;
    this.loadBearing = !!opts.loadBearing;
    this.openings = [];       // { u, y, w, h, kind }
    this.holes = [];          // { u, y, r, throughStud }
    this.integrity = 1;
    /* Stud positions along the wall, at 16 inch centres. Whether a shot goes
       through the cavity or through a stud is decided by where along the wall
       it lands, which is the reason wall-banging is a matter of aim rather
       than of luck. */
    this.studSpacingM = 16 * UNIT.INCH_M;
  }

  get lengthM() { return Math.hypot(this.x2 - this.x1, this.z2 - this.z1); }

  /* Is there a stud at this distance along the wall? A 1.5 inch stud on
     16 inch centres covers a bit under a tenth of the wall. */
  hasStudAt(u) {
    const studWidth = 1.5 * UNIT.INCH_M;
    const phase = (u % this.studSpacingM + this.studSpacingM) % this.studSpacingM;
    return phase < studWidth || phase > this.studSpacingM - studWidth * 0.0;
  }

  /* The layer stack a projectile would meet entering at `u` metres along. */
  layersAt(u) {
    const base = this.exterior
      ? ASSEMBLY.exteriorFrameWall()
      : (this.hasStudAt(u) ? ASSEMBLY.interiorPartitionThroughStud() : ASSEMBLY.interiorPartition());
    // An existing hole means there is nothing left to shoot through there.
    for (const h of this.holes) {
      if (Math.abs(h.u - u) < h.r) return [];
    }
    for (const o of this.openings) {
      if (u >= o.u && u <= o.u + o.w) {
        return o.kind === 'window' && !o.broken ? ASSEMBLY.window() : [];
      }
    }
    return base;
  }

  /* Something came through. Record it, and lose a little structural
     integrity — enough holes and the wall comes down. */
  punch(u, y, radiusM, opts = {}) {
    this.holes.push({ u, y, r: radiusM, throughStud: this.hasStudAt(u), kind: opts.kind || 'bullet' });
    const areaLost = Math.PI * radiusM * radiusM;
    const wallArea = this.lengthM * this.heightM;
    this.integrity = clamp01(this.integrity - (areaLost / Math.max(wallArea, 1e-6)) * (opts.kind === 'breach' ? 2.2 : 0.9));
    return this.holes[this.holes.length - 1];
  }

  /* Repairs, in the order a real repair happens. You cannot skin over a hole
     without the framing behind it, and a patch is weaker than the wall was
     until it is taped, mudded and sanded. */
  repair(stage, materials = {}) {
    const steps = ['frame', 'sheathe', 'insulate', 'board', 'tape', 'mud', 'sand', 'paint'];
    if (!steps.includes(stage)) return { ok: false, reason: `not a repair step: ${stage}` };
    this._repairStage = this._repairStage || 0;
    const expected = steps[this._repairStage];
    if (stage !== expected) {
      return { ok: false, reason: `${expected} has to come first` };
    }
    this._repairStage++;
    // Structural strength comes back with the framing and the board; the
    // rest is finish, and finish is worth doing only because a patched wall
    // that has not been taped shows every seam.
    const strength = { frame: 0.35, sheathe: 0.2, insulate: 0.0, board: 0.3, tape: 0.1, mud: 0.05, sand: 0, paint: 0 }[stage];
    this.integrity = clamp01(this.integrity + strength);
    if (this._repairStage >= steps.length) {
      this.holes.length = 0;
      this.integrity = 1;
      this._repairStage = 0;
      return { ok: true, done: true };
    }
    return { ok: true, next: steps[this._repairStage] };
  }
}


class Building {
  constructor(opts = {}) {
    this.id = opts.id || 0;
    this.name = opts.name || 'building';
    this.kind = opts.kind || 'house';
    this.x = opts.x || 0; this.z = opts.z || 0;    // south-west corner
    this.y = opts.y || 0;                           // ground level
    this.w = opts.w || 12; this.d = opts.d || 9;
    this.storeys = opts.storeys || 1;
    this.storeyHeightM = opts.storeyHeightM || 2.7;
    this.rooms = [];
    this.walls = [];
    this.circuits = [];
    this.rotationRad = opts.rotationRad || 0;
    this.hasBasement = !!opts.basement;
    this.hasAttic = !!opts.attic;
    this.roofPitch = opts.roofPitch != null ? opts.roofPitch : 0.45;
    this.exteriorAssembly = opts.exteriorAssembly || 'exteriorFrameWall';
    this.condition = opts.condition != null ? opts.condition : 1;
    this.powered = false;
  }

  get footprintArea() { return this.w * this.d; }

  roomAt(x, z, storey = 0) {
    for (const r of this.rooms) if (r.storey === storey && r.contains(x, z)) return r;
    return null;
  }

  /* Every wall a straight line from A to B would cross, in order, with the
     distance along each. This is what turns "shoot at that wall" into a
     layer stack the penetration model can actually run. */
  wallsAlong(x1, z1, x2, z2, storey = 0) {
    const hits = [];
    for (const w of this.walls) {
      if (w.storey !== storey) continue;
      const p = segmentIntersection(x1, z1, x2, z2, w.x1, w.z1, w.x2, w.z2);
      if (!p) continue;
      hits.push({ wall: w, t: p.t, u: p.u * w.lengthM, x: p.x, z: p.z });
    }
    return hits.sort((a, b) => a.t - b.t);
  }
}

/* Standard segment-segment intersection, returning the parameter along each. */
function segmentIntersection(ax, az, bx, bz, cx, cz, dx, dz) {
  const r1x = bx - ax, r1z = bz - az;
  const r2x = dx - cx, r2z = dz - cz;
  const denom = r1x * r2z - r1z * r2x;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((cx - ax) * r2z - (cz - az) * r2x) / denom;
  const u = ((cx - ax) * r1z - (cz - az) * r1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: ax + r1x * t, z: az + r1z * t };
}


/* ------------------------------------------------------------------
   FLOOR PLANS by recursive subdivision.

   Split the footprint along its longer axis, recurse, and stop when a
   cell is small enough to be a room. Then assign purposes with the
   constraints that make a plan read as a house rather than a grid:
   wet rooms cluster so the plumbing is one stack, bedrooms sit off a
   hall rather than off each other, and the living room takes the
   biggest cell with the most outside wall.
   ------------------------------------------------------------------ */
function generateFloorPlan(building, storey, opts = {}) {
  const rng = opts.rng || Math.random;
  const targetRooms = opts.targetRooms || Math.max(3, Math.round(building.footprintArea / 16));
  const minSide = opts.minSide || 2.1;

  const cells = [{ x: building.x, z: building.z, w: building.w, d: building.d }];
  let guard = 0;
  while (cells.length < targetRooms && guard++ < 200) {
    // Split the cell with the most area to give, so rooms come out
    // comparable in size rather than one hall and eleven cupboards.
    cells.sort((a, b) => b.w * b.d - a.w * a.d);
    const cell = cells.shift();
    const horizontal = cell.w > cell.d;
    const span = horizontal ? cell.w : cell.d;
    if (span < minSide * 2) { cells.push(cell); break; }
    // Split away from the middle so rooms are not all identical.
    const t = 0.32 + rng() * 0.36;
    const cut = clampTo(span * t, minSide, span - minSide);
    if (horizontal) {
      cells.push({ x: cell.x, z: cell.z, w: cut, d: cell.d });
      cells.push({ x: cell.x + cut, z: cell.z, w: cell.w - cut, d: cell.d });
    } else {
      cells.push({ x: cell.x, z: cell.z, w: cell.w, d: cut });
      cells.push({ x: cell.x, z: cell.z + cut, w: cell.w, d: cell.d - cut });
    }
  }

  // Which cells touch the outside — that decides what can have a window.
  const eps = 0.05;
  for (const c of cells) {
    c.exteriorSides = 0;
    if (Math.abs(c.x - building.x) < eps) c.exteriorSides++;
    if (Math.abs(c.z - building.z) < eps) c.exteriorSides++;
    if (Math.abs(c.x + c.w - (building.x + building.w)) < eps) c.exteriorSides++;
    if (Math.abs(c.z + c.d - (building.z + building.d)) < eps) c.exteriorSides++;
  }

  const palette = opts.palette || (storey === 0
    ? ['livingRoom', 'kitchen', 'hallway', 'bathroom', 'diningRoom', 'utility', 'bedroom', 'closet', 'office']
    : ['hallway', 'bedroom', 'bedroom', 'bathroom', 'closet', 'office']);

  cells.sort((a, b) => b.w * b.d - a.w * a.d);
  const rooms = [];
  const used = {};
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const area = c.w * c.d;
    // Pick the room type whose published size range this cell fits, with the
    // biggest, most-outside cell taking the living room.
    let candidates = palette.filter((p) => {
      const spec = ROOM[p];
      if (area < spec.minArea * 0.75 || area > spec.maxArea * 1.6) return false;
      if (spec.exterior && c.exteriorSides === 0) return false;
      return true;
    });
    if (!candidates.length) candidates = area < 5 ? ['closet'] : ['bedroom'];

    // Wet rooms want to be next to another wet room: one plumbing stack.
    const wetNeighbours = rooms.filter((r) => ROOM[r.type].wet && adjacent(r, c, 0.3));
    let type;
    if (i === 0 && candidates.includes('livingRoom')) type = 'livingRoom';
    else if (wetNeighbours.length && candidates.some((x) => ROOM[x].wet && !used[x])) {
      const wet = candidates.filter((x) => ROOM[x].wet && !used[x]);
      type = wet[(rng() * wet.length) | 0];
    } else {
      /* Some rooms come once per dwelling and some repeat. A house with two
         kitchens and three bathrooms reads as generated, which is exactly
         what the plan is trying not to look like. */
      const allowed = { livingRoom: 1, kitchen: 1, diningRoom: 1, utility: 1, garage: 1, office: 1,
        bathroom: storey === 0 ? 1 : 2, hallway: 2, lobby: 1 };
      let pool = candidates.filter((c) => (used[c] || 0) < (allowed[c] != null ? allowed[c] : 99));
      if (!pool.length) pool = candidates.filter((c) => allowed[c] == null);
      if (!pool.length) pool = [area < 5 ? 'closet' : 'bedroom'];
      const weighted = [];
      for (const cand of pool) {
        const n = Math.max(1, Math.round((ROOM[cand].weight || 1) * 3 / (1 + (used[cand] || 0))));
        for (let k = 0; k < n; k++) weighted.push(cand);
      }
      type = weighted[(rng() * weighted.length) | 0];
    }
    used[type] = (used[type] || 0) + 1;

    const room = new Room(c.x, c.z, c.w, c.d, type, storey);
    room.exteriorSides = c.exteriorSides;
    rooms.push(room);
  }
  return rooms;
}

function adjacent(room, cell, tol = 0.2) {
  const ax1 = room.x, ax2 = room.x + room.w, az1 = room.z, az2 = room.z + room.d;
  const bx1 = cell.x, bx2 = cell.x + cell.w, bz1 = cell.z, bz2 = cell.z + cell.d;
  const xOverlap = Math.min(ax2, bx2) - Math.max(ax1, bx1);
  const zOverlap = Math.min(az2, bz2) - Math.max(az1, bz1);
  const touchX = Math.abs(ax2 - bx1) < tol || Math.abs(bx2 - ax1) < tol;
  const touchZ = Math.abs(az2 - bz1) < tol || Math.abs(bz2 - az1) < tol;
  return (touchX && zOverlap > tol) || (touchZ && xOverlap > tol);
}

/* Turn a set of rooms into walls, doors and windows. Interior walls are
   raised on every shared boundary; the perimeter gets the exterior assembly;
   doors are cut so every room connects to the circulation. */
function buildWalls(building, rooms, storey, opts = {}) {
  const rng = opts.rng || Math.random;
  const walls = [];
  const eps = 0.06;

  const push = (x1, z1, x2, z2, exterior) => {
    if (Math.hypot(x2 - x1, z2 - z1) < 0.2) return null;
    const w = new Wall({
      x1, z1, x2, z2, storey, exterior,
      assembly: exterior ? building.exteriorAssembly : 'interiorPartition',
      loadBearing: exterior,
      heightM: building.storeyHeightM,
    });
    walls.push(w);
    return w;
  };

  // Perimeter.
  const bx = building.x, bz = building.z, bw = building.w, bd = building.d;
  push(bx, bz, bx + bw, bz, true);
  push(bx + bw, bz, bx + bw, bz + bd, true);
  push(bx + bw, bz + bd, bx, bz + bd, true);
  push(bx, bz + bd, bx, bz, true);

  // Interior: one wall per shared edge between two rooms, de-duplicated.
  const seen = new Set();
  for (const r of rooms) {
    const edges = [
      [r.x, r.z, r.x + r.w, r.z], [r.x + r.w, r.z, r.x + r.w, r.z + r.d],
      [r.x, r.z + r.d, r.x + r.w, r.z + r.d], [r.x, r.z, r.x, r.z + r.d],
    ];
    for (const [x1, z1, x2, z2] of edges) {
      const onPerimeter = (Math.abs(x1 - bx) < eps && Math.abs(x2 - bx) < eps)
        || (Math.abs(x1 - (bx + bw)) < eps && Math.abs(x2 - (bx + bw)) < eps)
        || (Math.abs(z1 - bz) < eps && Math.abs(z2 - bz) < eps)
        || (Math.abs(z1 - (bz + bd)) < eps && Math.abs(z2 - (bz + bd)) < eps);
      if (onPerimeter) continue;
      const key = [x1, z1, x2, z2].map((v) => v.toFixed(2)).sort().join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const w = push(x1, z1, x2, z2, false);
      if (!w) continue;
      // A door through it, offset from the corner so it is not in the join.
      const len = w.lengthM;
      if (len > 1.4) {
        const doorW = 0.82;
        const u = clampTo(0.35 + rng() * (len - doorW - 0.7), 0.25, len - doorW - 0.25);
        w.openings.push({ u, y: 0, w: doorW, h: 2.03, kind: 'door', open: rng() < 0.5, locked: false });
      }
    }
  }

  // Windows and the front door go in the perimeter.
  for (const w of walls) {
    if (!w.exterior) continue;
    const len = w.lengthM;
    const count = Math.max(0, Math.floor(len / 3.4));
    for (let i = 0; i < count; i++) {
      if (rng() > 0.8) continue;
      const u = ((i + 0.5) / Math.max(count, 1)) * len - 0.6;
      if (u < 0.4 || u > len - 1.6) continue;
      w.openings.push({ u, y: 0.95, w: 1.2, h: 1.25, kind: 'window', broken: false, glazing: 'annealed' });
    }
  }
  if (storey === 0 && walls.length) {
    const front = walls[0];
    const u = clampTo(front.lengthM * (0.3 + rng() * 0.4), 0.4, front.lengthM - 1.3);
    front.openings.push({ u, y: 0, w: 0.92, h: 2.03, kind: 'door', open: false, locked: rng() < 0.55, exterior: true });
  }
  return walls;
}


/* A whole house: plan, walls, contents, wiring. */
function generateHouse(opts = {}) {
  const rng = opts.rng || Math.random;
  const b = new Building(Object.assign({ kind: 'house' }, opts));

  for (let s = 0; s < b.storeys; s++) {
    const rooms = generateFloorPlan(b, s, { rng, targetRooms: opts.roomsPerStorey });
    b.rooms.push(...rooms);
    b.walls.push(...buildWalls(b, rooms, s, { rng }));
  }
  if (b.hasBasement) {
    const r = new Room(b.x + 0.3, b.z + 0.3, b.w - 0.6, b.d - 0.6, 'basement', -1);
    b.rooms.push(r);
  }
  if (b.hasAttic) {
    const r = new Room(b.x + 0.3, b.z + 0.3, b.w - 0.6, b.d - 0.6, 'attic', b.storeys);
    b.rooms.push(r);
  }

  stockRooms(b, rng, opts.lootDensity != null ? opts.lootDensity : 1);
  wireBuilding(b, rng);
  return b;
}

/* Fill the rooms. Density falls with how picked-over the island is, and the
   design says nothing respawns — so what is here is all there will ever be. */
function stockRooms(building, rng, density = 1) {
  for (const room of building.rooms) {
    const table = ROOM_LOOT[room.type];
    if (!table) continue;
    const n = Math.round(clamp01(room.area / 18) * 3.2 * density * (0.4 + rng() * 1.2));
    for (let i = 0; i < n; i++) {
      const item = table[(rng() * table.length) | 0];
      room.contents.push({
        item,
        // Condition matters: a rusted axe is not an axe yet, and expired
        // antibiotics are a gamble rather than a cure.
        condition: clamp01(0.25 + rng() * 0.75),
        quantity: 1 + ((rng() * 3) | 0),
        hidden: rng() < 0.3,
      });
    }
  }
  return building;
}


/* ------------------------------------------------------------------
   WIRING

   Buildings get real circuits: a panel with breakers, and branch
   circuits with outlets and lights on them. That is what makes the
   electrical system in the construction rules something the player
   interacts with rather than reads about — you can overload a
   circuit, trip a breaker, find the dead one, and get the lights
   back on.
   ------------------------------------------------------------------ */
function wireBuilding(building, rng = Math.random) {
  const rooms = building.rooms.filter((r) => r.storey >= 0);
  if (!rooms.length) return building;

  // The panel lives in the utility room, the garage, or the basement, which
  // is where it lives in a real house.
  const panelRoom = rooms.find((r) => ROOM[r.type].panel)
    || rooms.find((r) => r.type === 'garage')
    || building.rooms.find((r) => r.type === 'basement')
    || rooms[0];

  building.panel = {
    room: panelRoom, mainBreakerA: 100, voltage: 240,
    // A split-phase service: two 120 V legs, 240 V across them, which is why
    // the water heater and the range are wired differently from the lights.
    legs: [{ id: 'A', voltage: 120 }, { id: 'B', voltage: 120 }],
    on: true,
  };

  const perCircuit = 3;
  for (let i = 0; i < rooms.length; i += perCircuit) {
    const group = rooms.slice(i, i + perCircuit);
    const heavy = group.some((r) => ROOM[r.type].wet || r.type === 'garage');
    const circuit = {
      id: building.circuits.length,
      name: group.map((r) => r.type).join('/'),
      breakerA: heavy ? 20 : 15,
      wireGauge: heavy ? 12 : 14,
      voltage: 120,
      leg: building.circuits.length % 2 ? 'B' : 'A',
      // A wet room has to be on a ground-fault device. It is code because
      // people died before it was.
      gfci: group.some((r) => ROOM[r.type].wet),
      tripped: false,
      loads: [],
      rooms: group,
    };
    for (const r of group) {
      r.circuitId = circuit.id;
      const outlets = Math.max(1, Math.round(r.area / 6));
      for (let k = 0; k < outlets; k++) {
        circuit.loads.push({ kind: 'outlet', watts: 0, room: r.type, working: rng() > 0.06 });
      }
      circuit.loads.push({ kind: 'light', watts: 60, room: r.type, on: false, working: rng() > 0.12 });
    }
    building.circuits.push(circuit);
  }
  return building;
}
