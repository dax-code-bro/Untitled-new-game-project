/* ============================================================
   POINTS OF INTEREST

   The design names five: the neighbourhood, the city, the prairie,
   the prison and the headquarters. The rest of the set here exists
   because the simulation needs somewhere for its consequences to
   land. A disease model that can kill you is only interesting if
   antibiotics are somewhere specific and getting there costs
   something, so there is a clinic. A water model that can kill you
   needs a waterworks. An electrical model needs a generator plant
   worth restarting. Every addition below is a place that makes an
   existing system matter, rather than another building to loot.

   Nothing here regenerates. What you take is gone, what you break
   stays broken, and what you burn is ash for the rest of the world's
   life. That is the design's rule and it is enforced by the world
   state being saved rather than rebuilt.
   ============================================================ */

const POI_KIND = {
  neighbourhood: 'neighbourhood', city: 'city', prairie: 'prairie', prison: 'prison',
  headquarters: 'headquarters', harbour: 'harbour', sawmill: 'sawmill', relay: 'relay',
  clinic: 'clinic', airstrip: 'airstrip', waterworks: 'waterworks', ranger: 'ranger',
  gasStation: 'gasStation', wreck: 'wreck', quarry: 'quarry',
};

/* Each entry says what ground the place needs, so siting is a search over the
   terrain rather than a hand-placed coordinate: the city wants a big flat
   coastal shelf, the prison wants a hollow in the hills, the relay wants the
   highest ground on the island. Change the seed and everything moves, and it
   still all makes sense. */
const POI_SPECS = {
  [POI_KIND.neighbourhood]: {
    name: 'Ashgrove', radiusM: 210, maxSlopeDeg: 7, minElevM: 8, maxElevM: 90,
    prefers: 'flat', minCoastM: 180,
    blurb: 'A gated community. The gate still works. The fence does not.',
  },
  [POI_KIND.city]: {
    name: 'Fairview', radiusM: 380, maxSlopeDeg: 5, minElevM: 4, maxElevM: 55,
    prefers: 'flat', minCoastM: 90,
    blurb: 'Twelve blocks of a city that thought it was going to be bigger.',
  },
  [POI_KIND.prairie]: {
    name: 'The Long Pasture', radiusM: 420, maxSlopeDeg: 6, minElevM: 10, maxElevM: 110,
    prefers: 'flat', minCoastM: 300,
    blurb: 'Open grass to the treeline in every direction, and one cabin in the middle of it.',
  },
  [POI_KIND.prison]: {
    name: 'Hollow Creek Correctional', radiusM: 150, maxSlopeDeg: 26, minElevM: 25, maxElevM: 160,
    prefers: 'hollow', minCoastM: 400,
    blurb: 'A grotto with a door in the back of it, and stairs going down.',
  },
  [POI_KIND.headquarters]: {
    name: 'The Meridian Estate', radiusM: 190, maxSlopeDeg: 8, minElevM: 40, maxElevM: 170,
    prefers: 'prominence', minCoastM: 250,
    blurb: 'Somebody built this to be looked at. The helipad still has a helicopter on it.',
  },
  [POI_KIND.harbour]: {
    name: 'Kettle Point Harbour', radiusM: 170, maxSlopeDeg: 8, minElevM: 0.5, maxElevM: 12,
    prefers: 'coast', maxCoastM: 70,
    blurb: 'Docks, a fuel shed, and a ferry that came in too fast one last time.',
  },
  [POI_KIND.sawmill]: {
    name: 'Bracken Sawmill', radiusM: 130, maxSlopeDeg: 9, minElevM: 15, maxElevM: 120,
    prefers: 'forest', minCoastM: 250,
    blurb: 'Where planks come from, if you can get the blade turning.',
  },
  [POI_KIND.quarry]: {
    name: 'The Cut', radiusM: 140, maxSlopeDeg: 40, minElevM: 40, maxElevM: 200,
    prefers: 'steep', minCoastM: 300,
    blurb: 'Stone, gravel, a rusted crusher, and a lot of very bad footing.',
  },
  [POI_KIND.relay]: {
    name: 'Summit Relay', radiusM: 70, maxSlopeDeg: 16, minElevM: 150, maxElevM: 400,
    prefers: 'summit', minCoastM: 400,
    blurb: 'The highest thing on the island, and the only radio that still reaches anywhere.',
  },
  [POI_KIND.clinic]: {
    name: 'Ashgrove Clinic', radiusM: 90, maxSlopeDeg: 7, minElevM: 6, maxElevM: 80,
    prefers: 'flat', minCoastM: 150,
    blurb: 'Small, and looted, and still the only place on the island with real antibiotics.',
  },
  [POI_KIND.airstrip]: {
    name: 'Mill Flats Airstrip', radiusM: 240, maxSlopeDeg: 3.5, minElevM: 8, maxElevM: 70,
    prefers: 'flattest', minCoastM: 200,
    blurb: 'Eight hundred metres of cracked asphalt and a hangar with the door half up.',
  },
  [POI_KIND.waterworks]: {
    name: 'Cold Spring Waterworks', radiusM: 110, maxSlopeDeg: 10, minElevM: 20, maxElevM: 130,
    prefers: 'water', minCoastM: 300,
    blurb: 'Filters, chlorine, and the reason anyone could drink here at all.',
  },
  [POI_KIND.ranger]: {
    name: 'Pinecrest Ranger Station', radiusM: 100, maxSlopeDeg: 10, minElevM: 20, maxElevM: 140,
    prefers: 'forest', minCoastM: 300,
    blurb: 'Bunks, a map wall, a woodstove, and whatever the last ranger left behind.',
  },
  [POI_KIND.gasStation]: {
    name: 'The Four Corners', radiusM: 80, maxSlopeDeg: 6, minElevM: 5, maxElevM: 90,
    prefers: 'flat', minCoastM: 120,
    blurb: 'Two pumps, a shop, and a workshop out back with a pit under it.',
  },
  [POI_KIND.wreck]: {
    name: 'The Kestrel', radiusM: 90, maxSlopeDeg: 90, minElevM: -30, maxElevM: -3,
    prefers: 'offshore',
    blurb: 'A coaster on her side in eleven metres of water, holds still shut.',
  },
};


/* ------------------------------------------------------------------
   SITING

   Score candidate positions against what a place needs and take the
   best. This is why the harbour is on the coast and the relay is on
   the summit without either being written down as a coordinate.
   ------------------------------------------------------------------ */
function scoreSite(kind, map, coastDist, x, z, spec) {
  const S = map.size;
  const h = map.heightAtWorld(x, z);
  const ci = Math.round((x / map.worldSizeM + 0.5) * (S - 1));
  const ri = Math.round((z / map.worldSizeM + 0.5) * (S - 1));
  if (ci < 2 || ri < 2 || ci >= S - 2 || ri >= S - 2) return -Infinity;
  const dCoast = coastDist[ri * S + ci];

  if (spec.prefers === 'offshore') {
    if (h > spec.maxElevM || h < spec.minElevM) return -Infinity;
    // Close enough to swim to, deep enough to be a dive.
    return 100 - Math.abs(dCoast - 140) * 0.2;
  }

  if (h < spec.minElevM || h > spec.maxElevM) return -Infinity;
  if (spec.minCoastM && dCoast < spec.minCoastM) return -Infinity;
  if (spec.maxCoastM && dCoast > spec.maxCoastM) return -Infinity;

  /* Sample the footprint rather than the centre point. A place needs ground
     it can actually stand on across its whole area — a flat spot in the
     middle of a cliff face is not a site for a neighbourhood. */
  let maxSlope = 0, sumSlope = 0, n = 0, wet = 0, minH = Infinity, maxH = -Infinity;
  const step = Math.max(map.cellM, spec.radiusM / 7);
  for (let dz = -spec.radiusM; dz <= spec.radiusM; dz += step) {
    for (let dx = -spec.radiusM; dx <= spec.radiusM; dx += step) {
      if (dx * dx + dz * dz > spec.radiusM * spec.radiusM) continue;
      const hh = map.heightAtWorld(x + dx, z + dz);
      // A stray wet corner is not a reason to reject a site — a pasture with
      // a pond in it is still a pasture. A footprint that is mostly water is.
      if (hh < 0.5) wet++;
      const sl = map.slopeAtWorld(x + dx, z + dz);
      if (sl > maxSlope) maxSlope = sl;
      sumSlope += sl; n++;
      if (hh < minH) minH = hh;
      if (hh > maxH) maxH = hh;
    }
  }
  if (!n) return -Infinity;
  if (spec.prefers !== 'coast' && wet / n > 0.12) return -Infinity;
  const meanSlope = sumSlope / n;
  if (meanSlope > spec.maxSlopeDeg) return -Infinity;

  // Flatness is worth something to everything; the rest is preference.
  let score = 100 - meanSlope * 6 - (maxH - minH) * 0.7;
  switch (spec.prefers) {
    case 'flattest': score -= maxSlope * 3; break;
    case 'summit': score += h * 0.6; break;
    case 'prominence': score += h * 0.25 + dCoast * 0.006; break;
    case 'coast': score += 60 - dCoast * 0.3; break;
    case 'hollow': {
      // A hollow is ground lower than the ring around it.
      let ring = 0, rc = 0;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        ring += map.heightAtWorld(x + Math.cos(ang) * spec.radiusM * 1.7,
          z + Math.sin(ang) * spec.radiusM * 1.7);
        rc++;
      }
      score += clampTo((ring / rc - h) * 3, -40, 90);
      break;
    }
    case 'steep': score += maxSlope * 1.6; break;
    default: break;
  }
  return score;
}

function siteAll(map, classified, opts = {}) {
  const rng = opts.rng || Math.random;
  const placed = [];
  const order = [
    POI_KIND.city, POI_KIND.prairie, POI_KIND.airstrip, POI_KIND.neighbourhood,
    POI_KIND.headquarters, POI_KIND.prison, POI_KIND.harbour, POI_KIND.relay,
    POI_KIND.quarry, POI_KIND.sawmill, POI_KIND.waterworks, POI_KIND.ranger,
    POI_KIND.clinic, POI_KIND.gasStation, POI_KIND.wreck,
  ];

  const half = map.worldSizeM * 0.5;
  const samples = opts.samples || 900;

  for (const kind of order) {
    const spec = POI_SPECS[kind];
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < samples; i++) {
      // Stratified jitter, so the search covers the island instead of
      // clustering wherever the generator's first numbers happened to land.
      const gx = (i % 30) / 29, gz = Math.floor(i / 30) / 29;
      const x = (gx - 0.5 + (rng() - 0.5) / 30) * map.worldSizeM * 0.94;
      const z = (gz - 0.5 + (rng() - 0.5) / 30) * map.worldSizeM * 0.94;

      let s = scoreSite(kind, map, classified.coastDistance, x, z, spec);
      if (s === -Infinity) continue;
      // Places do not sit on top of each other, and a couple of them want
      // company: the clinic belongs near the town, the gas station on the
      // way between things.
      for (const p of placed) {
        const d = Math.hypot(p.x - x, p.z - z);
        const need = (p.spec.radiusM + spec.radiusM) * 1.25;
        if (d < need) { s = -Infinity; break; }
        if (kind === POI_KIND.clinic && p.kind === POI_KIND.neighbourhood) s += Math.max(0, 90 - d * 0.06);
        if (kind === POI_KIND.gasStation && (p.kind === POI_KIND.city || p.kind === POI_KIND.neighbourhood)) {
          s += Math.max(0, 60 - Math.abs(d - 450) * 0.08);
        }
      }
      if (s > bestScore) { bestScore = s; best = { x, z }; }
    }
    /* If nothing on the island fits what this place ideally wants, take
       less. A named location in the design has to exist — the prairie is
       the prairie even if this particular island only has room for a
       smaller one — so relax the footprint and the slope tolerance and
       search again rather than silently leaving it off the map. */
    let relaxed = spec;
    for (let attempt = 1; attempt <= 3 && !best; attempt++) {
      relaxed = Object.assign({}, spec, {
        radiusM: spec.radiusM * Math.pow(0.72, attempt),
        maxSlopeDeg: spec.maxSlopeDeg * (1 + 0.45 * attempt),
        minCoastM: spec.minCoastM ? spec.minCoastM * Math.pow(0.7, attempt) : spec.minCoastM,
        maxCoastM: spec.maxCoastM ? spec.maxCoastM * (1 + attempt) : spec.maxCoastM,
      });
      for (let i = 0; i < samples; i++) {
        const gx = (i % 30) / 29, gz = Math.floor(i / 30) / 29;
        const x = (gx - 0.5 + (rng() - 0.5) / 30) * map.worldSizeM * 0.94;
        const z = (gz - 0.5 + (rng() - 0.5) / 30) * map.worldSizeM * 0.94;
        let sc = scoreSite(kind, map, classified.coastDistance, x, z, relaxed);
        if (sc === -Infinity) continue;
        for (const pl of placed) {
          if (Math.hypot(pl.x - x, pl.z - z) < (pl.spec.radiusM + relaxed.radiusM) * 1.05) {
            sc = -Infinity; break;
          }
        }
        if (sc > bestScore) { bestScore = sc; best = { x, z }; }
      }
    }
    if (!best) continue;
    const usedSpec = relaxed;
    placed.push({
      kind, spec: usedSpec, name: spec.name, blurb: spec.blurb,
      x: best.x, z: best.z,
      y: map.heightAtWorld(best.x, best.z),
      radiusM: usedSpec.radiusM, score: bestScore,
      cramped: usedSpec.radiusM < spec.radiusM * 0.95,
    });
  }
  return placed;
}


/* ------------------------------------------------------------------
   BUILD-OUT

   Once a site is chosen the ground is graded and the place is built
   on it. Every building comes out of the same generator, so every
   wall in every one of them is a layer stack the ballistics model
   understands.
   ------------------------------------------------------------------ */
function buildPoi(poi, map, opts = {}) {
  const rng = opts.rng || Math.random;
  poi.buildings = [];
  poi.props = [];
  poi.roads = [];
  poi.notes = [];

  switch (poi.kind) {
    case POI_KIND.neighbourhood: return buildNeighbourhood(poi, map, rng);
    case POI_KIND.city: return buildCity(poi, map, rng);
    case POI_KIND.prairie: return buildPrairie(poi, map, rng);
    case POI_KIND.prison: return buildPrison(poi, map, rng);
    case POI_KIND.headquarters: return buildHeadquarters(poi, map, rng);
    case POI_KIND.harbour: return buildHarbour(poi, map, rng);
    case POI_KIND.relay: return buildRelay(poi, map, rng);
    case POI_KIND.clinic: return buildClinic(poi, map, rng);
    case POI_KIND.airstrip: return buildAirstrip(poi, map, rng);
    case POI_KIND.waterworks: return buildWaterworks(poi, map, rng);
    case POI_KIND.ranger: return buildRanger(poi, map, rng);
    case POI_KIND.gasStation: return buildGasStation(poi, map, rng);
    case POI_KIND.sawmill: return buildSawmill(poi, map, rng);
    case POI_KIND.quarry: return buildQuarry(poi, map, rng);
    case POI_KIND.wreck: return buildWreck(poi, map, rng);
    default: return poi;
  }
}

let _buildingId = 1;
function house(poi, map, rng, x, z, opts = {}) {
  const w = opts.w || 8 + rng() * 6;
  const d = opts.d || 7 + rng() * 5;
  const y = map.flatten(x + w / 2, z + d / 2, Math.max(w, d) * 0.85, null, 0.45);
  const b = generateHouse(Object.assign({
    id: _buildingId++, x, z, y, w, d, rng,
    storeys: opts.storeys || (rng() < 0.42 ? 2 : 1),
    basement: opts.basement != null ? opts.basement : rng() < 0.35,
    attic: opts.attic != null ? opts.attic : rng() < 0.5,
    exteriorAssembly: opts.exteriorAssembly || (rng() < 0.3 ? 'exteriorBrickVeneer' : 'exteriorFrameWall'),
    rotationRad: opts.rotationRad || 0,
    condition: 0.4 + rng() * 0.6,
    lootDensity: opts.lootDensity != null ? opts.lootDensity : 1,
  }, opts));
  b.name = opts.name || `${poi.name} ${_buildingId}`;
  poi.buildings.push(b);
  return b;
}

/* 26 houses on a loop road behind a fence with one hole in it. */
function buildNeighbourhood(poi, map, rng) {
  const R = poi.radiusM;
  map.flatten(poi.x, poi.z, R * 1.05, null, 0.35);
  const baseY = map.heightAtWorld(poi.x, poi.z);

  // A loop road with a spur, and lots facing it.
  const lots = [];
  const ringR = R * 0.62;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    lots.push({ x: poi.x + Math.cos(a) * ringR, z: poi.z + Math.sin(a) * ringR, a });
  }
  const innerR = R * 0.28;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    lots.push({ x: poi.x + Math.cos(a) * innerR, z: poi.z + Math.sin(a) * innerR, a });
  }

  for (let i = 0; i < 26; i++) {
    const lot = lots[i];
    const w = 9 + rng() * 5, d = 8 + rng() * 4;
    house(poi, map, rng, lot.x - w / 2, lot.z - d / 2, {
      w, d, rotationRad: lot.a + Math.PI / 2,
      name: `${i + 1} ${poi.name}`,
      storeys: rng() < 0.45 ? 2 : 1,
      basement: rng() < 0.4, attic: rng() < 0.55,
    });
  }

  poi.roads.push({ kind: 'loop', x: poi.x, z: poi.z, radiusM: ringR, widthM: 6 });
  poi.roads.push({ kind: 'loop', x: poi.x, z: poi.z, radiusM: innerR, widthM: 5 });

  /* The fence, and the hole in it. The gate is intact and locked, which is
     the joke: the way in is a gap in the chain-link two hundred metres round
     the back where a tree came down on it. */
  const breachAngle = rng() * Math.PI * 2;
  poi.fence = {
    x: poi.x, z: poi.z, radiusM: R * 0.95, heightM: 2.4, material: 'chainLink',
    gateAngle: breachAngle + Math.PI,
    breach: { angle: breachAngle, widthM: 3.4, cause: 'a fallen pine' },
  };
  poi.notes.push('The gate is locked and the fence is down behind number 14.');
  return poi;
}

/* Twelve blocks on a grid, towers in the middle, walk-ups at the edge. */
function buildCity(poi, map, rng) {
  const R = poi.radiusM;
  map.flatten(poi.x, poi.z, R * 1.06, null, 0.3);
  const blocks = 4, blockM = (R * 1.6) / blocks;
  const streetM = 14;

  for (let bx = 0; bx < blocks; bx++) {
    for (let bz = 0; bz < blocks; bz++) {
      const cx = poi.x + (bx - (blocks - 1) / 2) * blockM;
      const cz = poi.z + (bz - (blocks - 1) / 2) * blockM;
      const distFromCentre = Math.hypot(cx - poi.x, cz - poi.z) / R;
      // Height falls off from the core, the way a real downtown does.
      const storeys = distFromCentre < 0.25 ? 14 + ((rng() * 22) | 0)
        : distFromCentre < 0.5 ? 6 + ((rng() * 8) | 0)
        : 3 + ((rng() * 3) | 0);
      /* A city block is not one building. It is a row of lots along each
         street with a service alley up the middle, and every lot was built
         in a different decade to a different height. Generating the block
         as a single box is what makes a downtown read as a warehouse
         estate, so the block is subdivided into lots and each lot gets its
         own building. */
      const blockW = blockM - streetM, blockD = blockM - streetM;
      const alleyM = 4;
      const lotsX = blockW > 46 ? 2 : 1;
      const lotsZ = blockD > 46 ? 2 : 1;
      const lotW = (blockW - alleyM * (lotsX - 1)) / lotsX;
      const lotD = (blockD - alleyM * (lotsZ - 1)) / lotsZ;

      for (let lx = 0; lx < lotsX; lx++) {
        for (let lz = 0; lz < lotsZ; lz++) {
          // Every lot on a block differs by a few storeys; a uniform block
          // reads as one building with lines drawn on it.
          const lotStoreys = Math.max(1, storeys + ((rng() * 5) | 0) - 2);
          const w = lotW * (0.86 + rng() * 0.14);
          const d = lotD * (0.86 + rng() * 0.14);
          const lotCx = cx - blockW / 2 + lx * (lotW + alleyM) + lotW / 2;
          const lotCz = cz - blockD / 2 + lz * (lotD + alleyM) + lotD / 2;
          const b = new Building({
            id: _buildingId++, name: `${poi.name} ${bx * blocks + bz + 1}${'ABCD'[lx * lotsZ + lz]}`,
            kind: lotStoreys > 10 ? 'tower' : lotStoreys > 4 ? 'apartment' : 'storefront',
            x: lotCx - w / 2, z: lotCz - d / 2,
            y: map.flatten(lotCx, lotCz, Math.max(w, d) * 0.8),
            w, d, storeys: lotStoreys, storeyHeightM: lotStoreys > 10 ? 3.6 : 3.0,
            exteriorAssembly: lotStoreys > 10 ? 'concreteWall'
              : rng() < 0.35 ? 'concreteWall' : 'exteriorBrickVeneer',
            basement: rng() < 0.7,
          });
          // Only the floors a player will realistically reach are laid out in
          // full; the rest are shells until entered, which is what keeps a
          // thirty-storey tower from costing thirty storeys of memory.
          const detailed = Math.min(lotStoreys, 4);
          for (let s = 0; s < detailed; s++) {
            const palette = s === 0
              ? ['lobby', 'storeroom', 'bathroom', 'hallway', 'office']
              : ['officeFloor', 'hallway', 'bathroom', 'office', 'storeroom'];
            const rooms = generateFloorPlan(b, s, { rng, targetRooms: Math.max(4, Math.round(w * d / 40)), palette });
            b.rooms.push(...rooms);
            b.walls.push(...buildWalls(b, rooms, s, { rng }));
          }
          b.undetailedStoreys = lotStoreys - detailed;
          stockRooms(b, rng, 0.8);
          wireBuilding(b, rng);
          poi.buildings.push(b);
        }
      }

      poi.roads.push({ kind: 'street', x1: cx - blockM / 2, z1: cz, x2: cx + blockM / 2, z2: cz, widthM: streetM });
      poi.roads.push({ kind: 'street', x1: cx, z1: cz - blockM / 2, x2: cx, z2: cz + blockM / 2, widthM: streetM });
    }
  }
  poi.notes.push('Everything above the fourth floor is stairs, and the lifts have not run in a long time.');
  return poi;
}

/* Open grass to the treeline, and one cabin. */
function buildPrairie(poi, map, rng) {
  const R = poi.radiusM;
  map.flatten(poi.x, poi.z, R * 1.1, null, 0.55);

  const w = 7.5, d = 6;
  const cabin = house(poi, map, rng, poi.x - w / 2, poi.z - d / 2, {
    w, d, storeys: 1, basement: false, attic: true,
    exteriorAssembly: 'exteriorFrameWall', name: 'the cabin', lootDensity: 1.4,
  });
  cabin.kind = 'cabin';

  /* The gun in the living room. It is not on the floor for the taking — it
     is hidden, and finding it means actually searching the room: under the
     boards, behind the stove, up the chimney breast. */
  const living = cabin.rooms.find((r) => r.type === 'livingRoom') || cabin.rooms[0];
  const guns = ['308win_rifle', '870_shotgun', '357_revolver', '1911_pistol', '22lr_rifle', 'mauser_rifle'];
  living.contents.push({
    item: guns[(rng() * guns.length) | 0],
    condition: 0.55 + rng() * 0.4,
    quantity: 1,
    hidden: true,
    hiddenIn: ['under a loose floorboard', 'behind the stovepipe', 'in the chimney breast',
      'taped under the couch', 'inside the wall by the window'][(rng() * 5) | 0],
    searchesRequired: 3,
  });
  living.contents.push({ item: 'ammunition', condition: 0.9, quantity: 12 + ((rng() * 30) | 0), hidden: true });
  poi.notes.push('Somebody left something in the cabin, and did not leave it lying out.');

  // Fencing, a water trough, and the cattle that go with them.
  poi.props.push({ kind: 'trough', x: poi.x + 40, z: poi.z - 25, capacityL: 900 });
  poi.props.push({ kind: 'windPump', x: poi.x + 44, z: poi.z - 22, working: rng() < 0.6 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    poi.props.push({ kind: 'hayBale', x: poi.x + Math.cos(a) * R * 0.5, z: poi.z + Math.sin(a) * R * 0.5 });
  }
  poi.pasture = { x: poi.x, z: poi.z, radiusM: R, cattleTarget: 30, grass: 1.0 };
  return poi;
}

/* A grotto with stairs going down. */
function buildPrison(poi, map, rng) {
  const R = poi.radiusM;
  const bowlY = map.flatten(poi.x, poi.z, R * 0.75, map.heightAtWorld(poi.x, poi.z) - 7, 0.55);

  poi.grotto = { x: poi.x, z: poi.z, radiusM: R * 0.7, floorY: bowlY, wallHeightM: 12 };
  const gate = { kind: 'blastDoor', x: poi.x + R * 0.5, z: poi.z, material: 'mildSteel',
    thicknessM: 0.02, locked: true, keycard: 'prison-a' };
  poi.props.push(gate);

  /* Three levels down. Concrete throughout, which the penetration model
     treats very differently from a house — a firefight down here is a
     different problem from a firefight in a bedroom. */
  for (let level = 1; level <= 3; level++) {
    const b = new Building({
      id: _buildingId++, name: `${poi.name} level ${level}`,
      kind: 'prison', x: poi.x - 34, z: poi.z - 24, y: bowlY - level * 3.4,
      w: 68, d: 48, storeys: 1, storeyHeightM: 3.2,
      exteriorAssembly: 'concreteWall',
    });
    const palette = level === 1
      ? ['lobby', 'office', 'storeroom', 'hallway', 'bathroom']
      : ['cell', 'cell', 'cell', 'hallway', 'storeroom', 'bathroom'];
    const rooms = generateFloorPlan(b, 0, { rng, targetRooms: level === 1 ? 9 : 22, palette, minSide: 1.9 });
    b.rooms.push(...rooms);
    b.walls.push(...buildWalls(b, rooms, 0, { rng }));
    // Interior walls down here are concrete too, and cell doors are barred.
    for (const w of b.walls) {
      w.assembly = 'cinderBlockWall';
      for (const o of w.openings) if (o.kind === 'door' && rng() < 0.5) { o.barred = true; o.locked = rng() < 0.7; }
    }
    stockRooms(b, rng, level === 3 ? 1.6 : 0.7);
    wireBuilding(b, rng);
    b.subterranean = true;
    b.level = -level;
    poi.buildings.push(b);
  }
  poi.notes.push('The lower you go the better the stores and the worse the air.');
  poi.hazards = ['no light', 'bad air below level two', 'the doors lock behind you'];
  return poi;
}

/* An estate that was built to be looked at, with a helipad. */
function buildHeadquarters(poi, map, rng) {
  const R = poi.radiusM;
  const y = map.flatten(poi.x, poi.z, R * 1.0, null, 0.4);

  const b = new Building({
    id: _buildingId++, name: poi.name, kind: 'estate',
    x: poi.x - 22, z: poi.z - 15, y, w: 44, d: 30, storeys: 3,
    storeyHeightM: 3.4, exteriorAssembly: 'exteriorBrickVeneer', basement: true,
  });
  for (let s = 0; s < 3; s++) {
    const palette = s === 0
      ? ['lobby', 'livingRoom', 'kitchen', 'diningRoom', 'office', 'bathroom', 'hallway', 'utility']
      : ['bedroom', 'bathroom', 'office', 'hallway', 'closet', 'livingRoom'];
    const rooms = generateFloorPlan(b, s, { rng, targetRooms: 11, palette });
    b.rooms.push(...rooms);
    b.walls.push(...buildWalls(b, rooms, s, { rng }));
  }
  b.rooms.push(new Room(b.x + 1, b.z + 1, b.w - 2, b.d - 2, 'basement', -1));
  stockRooms(b, rng, 1.7);
  wireBuilding(b, rng);
  poi.buildings.push(b);

  poi.props.push({
    kind: 'helipad', x: poi.x + 55, z: poi.z + 10, radiusM: 12, surface: 'concrete',
    helicopter: {
      model: 'light utility', condition: 0.35 + rng() * 0.3,
      // It does not fly today. It flies when the player has found a battery,
      // fuel that has not gone off, and a hydraulic line that is not split —
      // which is a long chain of other places on the island.
      needs: ['battery', 'aviation fuel', 'hydraulic line', 'main rotor bolt'],
      fuelL: 0, fuelCapacityL: 340, airworthy: false,
    },
  });
  poi.props.push({ kind: 'generator', x: poi.x - 30, z: poi.z + 18, kW: 60, fuel: 'diesel', fuelL: 40 + rng() * 200, working: rng() < 0.7 });
  poi.props.push({ kind: 'gate', x: poi.x - R * 0.8, z: poi.z, material: 'mildSteel', powered: true, locked: true });
  poi.notes.push('The helicopter is the only way off this island, and it is four parts short.');
  return poi;
}

function buildHarbour(poi, map, rng) {
  const y = map.flatten(poi.x, poi.z, poi.radiusM * 0.9, 2.0, 0.5);
  for (let i = 0; i < 3; i++) {
    house(poi, map, rng, poi.x - 40 + i * 26, poi.z - 30, {
      w: 12, d: 9, storeys: 1, basement: false,
      name: ['harbourmaster', 'net loft', 'fuel shed'][i], lootDensity: 1.2,
    });
  }
  poi.props.push({ kind: 'dock', x: poi.x, z: poi.z + 30, lengthM: 70, widthM: 4 });
  poi.props.push({ kind: 'fuelTank', x: poi.x - 14, z: poi.z - 30, litres: 400 + rng() * 3000, fuel: 'diesel' });
  poi.props.push({ kind: 'ferry', x: poi.x + 55, z: poi.z + 45, lengthM: 42, aground: true, decks: 3 });
  for (let i = 0; i < 5; i++) {
    poi.props.push({
      kind: 'boat', x: poi.x + (rng() - 0.5) * 90, z: poi.z + 25 + rng() * 30,
      lengthM: 4 + rng() * 5, hull: rng() < 0.4 ? 'holed' : 'sound',
      engine: rng() < 0.5 ? 'seized' : 'workable', fuelL: rng() * 20,
    });
  }
  poi.notes.push('Fuel here, if the tank has not gone to water. Boats, if you can make one float.');
  return poi;
}

function buildRelay(poi, map, rng) {
  const y = map.flatten(poi.x, poi.z, poi.radiusM, null, 0.5);
  house(poi, map, rng, poi.x - 5, poi.z - 4, { w: 10, d: 8, storeys: 1, basement: false, attic: false, name: 'relay hut', lootDensity: 1.5 });
  poi.props.push({ kind: 'mast', x: poi.x + 14, z: poi.z, heightM: 46, guyed: true, climbable: true });
  poi.props.push({ kind: 'solarArray', x: poi.x - 16, z: poi.z + 8, panels: 12, kW: 3.6, working: rng() < 0.75 });
  poi.props.push({ kind: 'batteryBank', x: poi.x - 4, z: poi.z + 10, kWh: 24, chargePct: rng() * 40 });
  poi.props.push({ kind: 'transmitter', x: poi.x, z: poi.z, band: 'HF', rangeKm: 400, powered: false });
  poi.notes.push('Highest ground on the island. You can see the weather coming from here.');
  return poi;
}

function buildClinic(poi, map, rng) {
  const y = map.flatten(poi.x, poi.z, poi.radiusM * 0.8, null, 0.45);
  const b = new Building({
    id: _buildingId++, name: poi.name, kind: 'clinic',
    x: poi.x - 14, z: poi.z - 9, y, w: 28, d: 18, storeys: 1,
    exteriorAssembly: 'exteriorBrickVeneer',
  });
  const rooms = generateFloorPlan(b, 0, { rng, targetRooms: 9,
    palette: ['lobby', 'ward', 'ward', 'storeroom', 'bathroom', 'hallway', 'office'] });
  b.rooms.push(...rooms);
  b.walls.push(...buildWalls(b, rooms, 0, { rng }));
  stockRooms(b, rng, 1.2);

  /* The pharmacy. This is the only place on the island where the drugs that
     match the disease table are reliably found, which is what makes a
     diagnosis worth getting right — the wrong guess costs a dose you had to
     cross the island for. */
  const store = b.rooms.find((r) => r.type === 'storeroom');
  if (store) {
    const drugs = ['metronidazole', 'doxycycline', 'ciprofloxacin', 'amoxicillin', 'azithromycin',
      'albendazole', 'cephalexin', 'gentamicin', 'nitazoxanide', 'rifampin', 'antitoxinTet', 'rabiesPEP'];
    for (const d of drugs) {
      if (rng() < 0.62) {
        store.contents.push({
          item: d, quantity: 1 + ((rng() * 3) | 0),
          // Expired drugs are weaker, not useless. That is the real
          // behaviour of most of this list and it makes a found box a
          // judgement rather than a jackpot.
          condition: 0.3 + rng() * 0.7,
          expired: rng() < 0.45, hidden: false,
        });
      }
    }
    store.contents.push({ item: 'lockedCabinet', quantity: 1, locked: true, contains: ['morphine', 'antitoxinBot'] });
  }
  wireBuilding(b, rng);
  poi.buildings.push(b);
  poi.notes.push('Picked over, but the pharmacy cabinet is still locked and still full.');
  return poi;
}

function buildAirstrip(poi, map, rng) {
  const y = map.flatten(poi.x, poi.z, poi.radiusM * 1.1, null, 0.25);
  poi.runway = { x: poi.x, z: poi.z, lengthM: 800, widthM: 22, headingDeg: rng() * 180, surface: 'asphalt', cracked: true };
  house(poi, map, rng, poi.x - 60, poi.z + 40, { w: 26, d: 18, storeys: 1, basement: false, attic: false, name: 'hangar', lootDensity: 1.4 });
  poi.props.push({ kind: 'fuelTank', x: poi.x - 80, z: poi.z + 34, litres: 200 + rng() * 2600, fuel: 'avgas' });
  poi.props.push({ kind: 'windsock', x: poi.x + 100, z: poi.z + 20 });
  poi.props.push({ kind: 'aircraft', x: poi.x - 45, z: poi.z + 42, model: 'light single', airworthy: false,
    needs: ['magneto', 'tyre', 'avgas'] });
  poi.notes.push('Aviation fuel here. The helicopter at the estate needs it and cannot come and get it.');
  return poi;
}

function buildWaterworks(poi, map, rng) {
  const y = map.flatten(poi.x, poi.z, poi.radiusM * 0.8, null, 0.5);
  house(poi, map, rng, poi.x - 9, poi.z - 7, { w: 18, d: 14, storeys: 1, basement: true, attic: false, name: 'filter house', lootDensity: 1.3 });
  poi.props.push({ kind: 'settlingTank', x: poi.x + 26, z: poi.z, radiusM: 9, depthM: 4, water: true });
  poi.props.push({ kind: 'sandFilter', x: poi.x + 26, z: poi.z + 22, working: rng() < 0.5, needs: ['clean sand', 'power'] });
  poi.props.push({ kind: 'chlorineStore', x: poi.x - 20, z: poi.z + 6, kg: 5 + rng() * 60 });
  poi.props.push({ kind: 'pump', x: poi.x - 4, z: poi.z + 12, kW: 7.5, working: rng() < 0.55 });
  poi.notes.push('Get the pump and the filter running and the whole island can drink without boiling.');
  return poi;
}

function buildRanger(poi, map, rng) {
  const y = map.flatten(poi.x, poi.z, poi.radiusM * 0.7, null, 0.5);
  house(poi, map, rng, poi.x - 7, poi.z - 5, { w: 14, d: 10, storeys: 1, basement: false, attic: true, name: 'ranger station', lootDensity: 1.6 });
  poi.props.push({ kind: 'woodStove', x: poi.x, z: poi.z, working: true });
  poi.props.push({ kind: 'mapWall', x: poi.x + 3, z: poi.z + 2, revealsPoi: true });
  poi.props.push({ kind: 'rainBarrel', x: poi.x - 9, z: poi.z + 5, litres: 60 + rng() * 140, potable: true });
  poi.props.push({ kind: 'woodpile', x: poi.x - 11, z: poi.z - 3, kg: 200 + rng() * 600 });
  poi.notes.push('The map wall shows where everything on the island is. Worth the walk before anything else.');
  return poi;
}

function buildGasStation(poi, map, rng) {
  const y = map.flatten(poi.x, poi.z, poi.radiusM * 0.7, null, 0.5);
  house(poi, map, rng, poi.x - 8, poi.z - 6, { w: 16, d: 12, storeys: 1, basement: false, attic: false, name: 'shop', lootDensity: 1.5 });
  house(poi, map, rng, poi.x + 14, poi.z - 6, { w: 12, d: 10, storeys: 1, basement: false, attic: false, name: 'workshop', lootDensity: 1.3 });
  poi.props.push({ kind: 'fuelPump', x: poi.x - 2, z: poi.z + 12, working: false, needsPower: true });
  poi.props.push({ kind: 'undergroundTank', x: poi.x - 2, z: poi.z + 18, litres: 500 + rng() * 6000, fuel: 'petrol', contaminated: rng() < 0.4 });
  poi.props.push({ kind: 'inspectionPit', x: poi.x + 18, z: poi.z - 2, depthM: 1.6 });
  poi.props.push({ kind: 'weldingSet', x: poi.x + 20, z: poi.z + 2, gas: rng() < 0.5 ? 'full' : 'empty', needsPower: true });
  poi.notes.push('Petrol under the forecourt, and a pit and a welder out back.');
  return poi;
}

function buildSawmill(poi, map, rng) {
  const y = map.flatten(poi.x, poi.z, poi.radiusM * 0.8, null, 0.5);
  house(poi, map, rng, poi.x - 12, poi.z - 9, { w: 24, d: 18, storeys: 1, basement: false, attic: false, name: 'mill shed', lootDensity: 1.2 });
  poi.props.push({ kind: 'bandsaw', x: poi.x, z: poi.z, kW: 15, working: rng() < 0.45, needs: ['blade', 'power'] });
  poi.props.push({ kind: 'logDeck', x: poi.x + 24, z: poi.z, logs: 20 + ((rng() * 60) | 0) });
  poi.props.push({ kind: 'lumberStack', x: poi.x - 26, z: poi.z + 6, boardFeet: 400 + rng() * 3000 });
  poi.props.push({ kind: 'kiln', x: poi.x + 8, z: poi.z + 20, working: rng() < 0.4 });
  poi.notes.push('Planks without felling anything, if you can get the saw turning.');
  return poi;
}

function buildQuarry(poi, map, rng) {
  const floorY = map.flatten(poi.x, poi.z, poi.radiusM * 0.6, map.heightAtWorld(poi.x, poi.z) - 18, 0.35);
  poi.props.push({ kind: 'quarryFace', x: poi.x, z: poi.z, radiusM: poi.radiusM * 0.6, floorY, heightM: 18 });
  poi.props.push({ kind: 'crusher', x: poi.x + 20, z: poi.z, working: false, needs: ['belt', 'power'] });
  poi.props.push({ kind: 'gravelPile', x: poi.x - 22, z: poi.z + 10, tonnes: 40 + rng() * 300 });
  poi.props.push({ kind: 'explosivesStore', x: poi.x + 30, z: poi.z - 20, locked: true, contents: ['detCord', 'blastingCap', 'ANFO'] });
  house(poi, map, rng, poi.x - 34, poi.z - 26, { w: 10, d: 8, storeys: 1, basement: false, attic: false, name: 'quarry office', lootDensity: 1.1 });
  poi.notes.push('Stone, gravel and a magazine full of things that go off.');
  return poi;
}

function buildWreck(poi, map, rng) {
  poi.props.push({
    kind: 'shipwreck', x: poi.x, z: poi.z, y: poi.y,
    lengthM: 68, listDeg: 62, depthM: Math.abs(poi.y),
    holds: [
      { id: 1, sealed: true, contents: ['machinery', 'steelPlate', 'weldingRod'] },
      { id: 2, sealed: false, contents: ['cannedFood', 'rope', 'tarpaulin'] },
      { id: 3, sealed: true, flooded: true, contents: ['fuelDrum', 'toolChest'] },
    ],
  });
  poi.hazards = ['no air', 'silt-out', 'entanglement', 'the holds are shut'];
  poi.notes.push('Eleven metres down. You can hold your breath or you can find a tank.');
  return poi;
}
