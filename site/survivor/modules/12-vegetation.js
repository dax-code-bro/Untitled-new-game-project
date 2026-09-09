/* Trees, scrub, boulders and deadfall, placed by what the terrain says.

   The island's cover is not decoration: the ecology already reads browse and
   mast out of the biome map to decide where the deer are, so the wood the
   player walks into has to be the same wood the simulation is feeding. This
   file draws that map rather than inventing a forest on top of it.

   Everything is grown from a cell seed derived from position, so the same
   stand of pines comes back exactly the same way after you have walked to
   the coast and returned. The alternative — scattering at random on load —
   quietly rebuilds the world behind the player, and on an island where the
   design promises that nothing regenerates, that is a lie.

   Emits:   'tree-felled'  { tree, timberKg, x, z }
   State:   ctx.state.treeAt(x, z, r) -> nearest standing tree record | null
            ctx.state.canopyAt(x, z)  -> 0..1 overhead cover, for shade and rain */
SurvivorGame.module({
  id: 'vegetation',
  order: 12,

  init(ctx) {
    const { LE, game } = ctx;

    /* One cell is built or freed at a time. 64 m is small enough that a cell
       is cheap to build inside one frame and large enough that the player
       crosses only a handful per minute at a walk. */
    const CELL = 64;
    const BUILD_R = 224;
    const FREE_R = 300;
    const MAX_TREES = 1400;

    /* Species by biome, with the trunk and canopy proportions that make a
       silhouette recognisable at two hundred metres — which is the range at
       which knowing pine from oak tells you whether there is mast on the
       ground and therefore whether there are deer. */
    const SPECIES = {
      pine: {
        name: 'pine', trunk: 0.28, height: [14, 26], canopy: 'conifer',
        bark: 0x4a3a2a, needle: 0x2b4230, timberPerM3: 470, mast: 0.2,
      },
      spruce: {
        name: 'spruce', trunk: 0.24, height: [12, 22], canopy: 'conifer',
        bark: 0x413528, needle: 0x24382c, timberPerM3: 430, mast: 0.1,
      },
      oak: {
        name: 'oak', trunk: 0.42, height: [10, 19], canopy: 'broad',
        bark: 0x54432f, needle: 0x2f4a24, timberPerM3: 720, mast: 1.0,
      },
      maple: {
        name: 'maple', trunk: 0.34, height: [11, 20], canopy: 'broad',
        bark: 0x5b4a35, needle: 0x3a5626, timberPerM3: 630, mast: 0.4,
      },
      birch: {
        name: 'birch', trunk: 0.22, height: [9, 16], canopy: 'broad',
        bark: 0xcfc6b4, needle: 0x4a6a2c, timberPerM3: 640, mast: 0.2,
      },
      scrubOak: {
        name: 'scrub oak', trunk: 0.16, height: [3, 6], canopy: 'broad',
        bark: 0x4e4030, needle: 0x3c4a26, timberPerM3: 700, mast: 0.6,
      },
      driftwood: {
        name: 'driftwood', trunk: 0.3, height: [0, 0], canopy: 'none',
        bark: 0x9a9182, needle: 0, timberPerM3: 400, mast: 0,
      },
    };

    /* Stems per hectare, from the biome. Numbers in this range are what a
       real stand carries: closed forest runs several hundred, open woodland
       under a hundred, and a meadow has the odd standard in a hedge line. */
    const BIOME_COVER = {
      deepForest: { trees: 420, mix: ['oak', 'maple', 'birch', 'pine'], shrubs: 260, rocks: 12 },
      pineForest: { trees: 480, mix: ['pine', 'spruce', 'pine'], shrubs: 120, rocks: 26 },
      woodland: { trees: 130, mix: ['oak', 'birch', 'maple', 'scrubOak'], shrubs: 220, rocks: 18 },
      scrub: { trees: 22, mix: ['scrubOak', 'birch'], shrubs: 400, rocks: 40 },
      meadow: { trees: 8, mix: ['oak', 'maple'], shrubs: 90, rocks: 10 },
      prairie: { trees: 3, mix: ['oak'], shrubs: 40, rocks: 8 },
      riverbank: { trees: 90, mix: ['birch', 'maple'], shrubs: 300, rocks: 30 },
      freshMarsh: { trees: 14, mix: ['birch'], shrubs: 340, rocks: 4 },
      saltMarsh: { trees: 2, mix: ['birch'], shrubs: 200, rocks: 6 },
      dune: { trees: 2, mix: ['pine'], shrubs: 110, rocks: 14, driftwood: 8 },
      beach: { trees: 0, mix: [], shrubs: 10, rocks: 8, driftwood: 20 },
      rockyHill: { trees: 26, mix: ['pine', 'scrubOak'], shrubs: 90, rocks: 130 },
      scree: { trees: 2, mix: ['pine'], shrubs: 20, rocks: 260 },
      alpine: { trees: 6, mix: ['spruce'], shrubs: 60, rocks: 90 },
      cliff: { trees: 0, mix: [], shrubs: 8, rocks: 60 },
      ocean: { trees: 0, mix: [], shrubs: 0, rocks: 0 },
    };

    /* ---- geometry, built once per archetype ---- */

    function conifer(rng, spec) {
      const g = new LE.Geometry();
      const h = 1;                       // unit height; instances scale it
      const rTrunk = spec.trunk * 0.5 / 12;
      // Trunk as a tapered prism. Eight sides is enough: past that the extra
      // vertices are invisible and the tree is drawn a thousand times.
      const sides = 8;
      const ringA = [], ringB = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const cx = Math.cos(a), cz = Math.sin(a);
        ringA.push(g.vert(cx * rTrunk, 0, cz * rTrunk, cx, 0.15, cz, i / sides, 0));
        g.vertColor(0.26, 0.21, 0.15);
        ringB.push(g.vert(cx * rTrunk * 0.42, h * 0.92, cz * rTrunk * 0.42, cx, 0.15, cz, i / sides, 1));
        g.vertColor(0.30, 0.25, 0.18);
      }
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        g.quad(ringA[i], ringA[j], ringB[j], ringB[i]);
      }
      // Canopy as stacked skirts, widest low down, which is what gives a
      // conifer its outline against the sky.
      const tiers = 5;
      for (let t = 0; t < tiers; t++) {
        const f = t / tiers;
        const y0 = 0.24 + f * 0.62;
        const y1 = y0 + 0.20;
        const rad = (0.20 - f * 0.13) * (0.9 + rng.next() * 0.2);
        const tip = g.vert(0, y1, 0, 0, 1, 0, 0.5, 1);
        g.vertColor(0.10, 0.19, 0.12);
        const ring = [];
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2 + t * 0.4;
          const cx = Math.cos(a), cz = Math.sin(a);
          ring.push(g.vert(cx * rad, y0, cz * rad, cx * 0.6, 0.5, cz * 0.6, i / sides, 0));
          g.vertColor(0.07, 0.15, 0.09);
        }
        for (let i = 0; i < sides; i++) g.tri(tip, ring[i], ring[(i + 1) % sides]);
      }
      return g.finalize();
    }

    function broadleaf(rng, spec) {
      const g = new LE.Geometry();
      const rTrunk = spec.trunk * 0.5 / 14;
      const sides = 8;
      const ringA = [], ringB = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const cx = Math.cos(a), cz = Math.sin(a);
        ringA.push(g.vert(cx * rTrunk, 0, cz * rTrunk, cx, 0.1, cz, i / sides, 0));
        g.vertColor(0.29, 0.24, 0.17);
        ringB.push(g.vert(cx * rTrunk * 0.55, 0.52, cz * rTrunk * 0.55, cx, 0.1, cz, i / sides, 1));
        g.vertColor(0.32, 0.27, 0.19);
      }
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        g.quad(ringA[i], ringA[j], ringB[j], ringB[i]);
      }
      /* Canopy as several overlapping lobes rather than one ball. A single
         sphere reads as a lollipop; three or four offset blobs read as a
         crown, and cost the same. */
      const lobes = 3 + rng.int(0, 2);
      for (let l = 0; l < lobes; l++) {
        const ox = (rng.next() - 0.5) * 0.26;
        const oz = (rng.next() - 0.5) * 0.26;
        const oy = 0.56 + rng.next() * 0.3;
        const rad = 0.20 + rng.next() * 0.13;
        const rings = 3, seg = 7;
        const idx = [];
        for (let r = 0; r <= rings; r++) {
          const phi = (r / rings) * Math.PI;
          const y = Math.cos(phi), sr = Math.sin(phi);
          const line = [];
          for (let sIdx = 0; sIdx <= seg; sIdx++) {
            const th = (sIdx / seg) * Math.PI * 2;
            const nx = sr * Math.cos(th), nz = sr * Math.sin(th);
            line.push(g.vert(ox + nx * rad, oy + y * rad * 0.8, oz + nz * rad,
              nx, y, nz, sIdx / seg, r / rings));
            // Slight per-vertex variation so the crown is not a flat colour.
            const v = 0.9 + rng.next() * 0.25;
            g.vertColor(0.13 * v, 0.24 * v, 0.08 * v);
          }
          idx.push(line);
        }
        for (let r = 0; r < rings; r++) {
          for (let sIdx = 0; sIdx < seg; sIdx++) {
            g.quad(idx[r][sIdx], idx[r][sIdx + 1], idx[r + 1][sIdx + 1], idx[r + 1][sIdx]);
          }
        }
      }
      return g.finalize();
    }

    function shrubGeo(rng) {
      const g = new LE.Geometry();
      const clumps = 3;
      for (let c = 0; c < clumps; c++) {
        const ox = (rng.next() - 0.5) * 0.5, oz = (rng.next() - 0.5) * 0.5;
        const rad = 0.22 + rng.next() * 0.18;
        const rings = 2, seg = 6;
        const idx = [];
        for (let r = 0; r <= rings; r++) {
          const phi = (r / rings) * Math.PI * 0.7;
          const y = Math.cos(phi), sr = Math.sin(phi);
          const line = [];
          for (let s = 0; s <= seg; s++) {
            const th = (s / seg) * Math.PI * 2;
            const nx = sr * Math.cos(th), nz = sr * Math.sin(th);
            line.push(g.vert(ox + nx * rad, y * rad * 0.9, oz + nz * rad, nx, y, nz, s / seg, r / rings));
            const v = 0.85 + rng.next() * 0.3;
            g.vertColor(0.13 * v, 0.21 * v, 0.08 * v);
          }
          idx.push(line);
        }
        for (let r = 0; r < rings; r++) {
          for (let s = 0; s < seg; s++) g.quad(idx[r][s], idx[r][s + 1], idx[r + 1][s + 1], idx[r + 1][s]);
        }
      }
      return g.finalize();
    }

    function logGeo(rng) {
      const g = new LE.Geometry();
      const sides = 7, len = 1, rad = 0.09 + rng.next() * 0.05;
      const a = [], b = [];
      for (let i = 0; i < sides; i++) {
        const t = (i / sides) * Math.PI * 2;
        const cy = Math.cos(t), cz = Math.sin(t);
        a.push(g.vert(0, cy * rad + rad, cz * rad, 0, cy, cz, 0, i / sides));
        g.vertColor(0.30, 0.26, 0.20);
        b.push(g.vert(len, cy * rad * 0.85 + rad, cz * rad * 0.85, 0, cy, cz, 1, i / sides));
        g.vertColor(0.26, 0.22, 0.17);
      }
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        g.quad(a[i], a[j], b[j], b[i]);
      }
      return g.finalize();
    }

    // Built once, shared by every instance of that archetype. The key on
    // game.mesh is what makes a thousand pines one draw call.
    const GEO = {};
    const variantSeed = 0x5eed;
    for (const key of Object.keys(SPECIES)) {
      const spec = SPECIES[key];
      GEO[key] = [];
      const variants = spec.canopy === 'none' ? 2 : 3;
      for (let v = 0; v < variants; v++) {
        const rng = new LE.Rng(variantSeed + key.length * 977 + v * 131);
        GEO[key].push(spec.canopy === 'conifer' ? conifer(rng, spec)
          : spec.canopy === 'broad' ? broadleaf(rng, spec)
          : logGeo(rng));
      }
    }
    const SHRUB_GEO = [0, 1, 2].map((v) => shrubGeo(new LE.Rng(0xb00b + v * 37)));

    /* Foliage is lit brighter than a leaf's measured albedo (0.10-0.15 in
       the visible) because a leaf in the field is also scattering light
       through itself and bouncing it off its neighbours, and the renderer
       does neither. Subsurface carries some of it; the rest is in the
       colour, or a wood at noon comes out black. */
    const FOLIAGE_MAT = { preset: 'foliage', vertexColor: true, color: 0xffffff };
    /* Bark, shaded by vertex colour rather than by the wood texture's own
       baked brown — two brown albedos multiplied together give a black
       trunk. `painted` supplies grain with a mean of one, so the colour
       written into the geometry is the colour that comes out. */
    const WOOD_MAT = { preset: 'painted', vertexColor: true, color: 0xffffff,
      roughness: 0.92, uvScale: 8, normalStrength: 0.7 };

    /* ---- placement ---- */

    const cells = new Map();          // key -> { actors: [], trees: [] }
    const trees = [];                 // every standing tree, for queries
    let treeCount = 0;

    const cellKey = (cx, cz) => `${cx}:${cz}`;

    function poiClear(x, z) {
      for (const p of ctx.world.pois) {
        if (Math.hypot(p.x - x, p.z - z) < p.radiusM * 0.85) return false;
      }
      return true;
    }

    function buildCell(cx, cz) {
      const key = cellKey(cx, cz);
      if (cells.has(key)) return;
      const rec = { actors: [], trees: [] };
      cells.set(key, rec);

      const x0 = cx * CELL, z0 = cz * CELL;
      // Seeded from the cell's own coordinates, so this patch of ground grows
      // the same wood every time it is built.
      const rng = new LE.Rng(((cx * 73856093) ^ (cz * 19349663) ^ ctx.world.seed) >>> 0);
      const hectares = (CELL * CELL) / 10000;

      // Sample the biome at the cell centre and at its corners; a cell that
      // straddles a treeline should not be all one thing.
      const samples = [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]];
      for (const [fx, fz] of samples) {
        const sx = x0 + fx * CELL, sz = z0 + fz * CELL;
        const biome = ctx.biomeAt(sx, sz);
        const cover = BIOME_COVER[biome && biome.id] || BIOME_COVER.scrub;
        const share = 1 / samples.length;

        const nTrees = Math.round(cover.trees * hectares * share * (0.6 + rng.next() * 0.8));
        for (let i = 0; i < nTrees && treeCount < MAX_TREES; i++) {
          const x = x0 + rng.next() * CELL, z = z0 + rng.next() * CELL;
          if (!place(x, z, 34)) continue;
          const speciesId = cover.mix.length ? cover.mix[rng.int(0, cover.mix.length - 1)] : null;
          if (!speciesId) continue;
          const t = spawnTree(speciesId, x, z, rng);
          if (t) { rec.actors.push(t.actor); rec.trees.push(t); trees.push(t); treeCount++; }
        }

        const nShrubs = Math.round(cover.shrubs * hectares * share * 0.25 * (0.5 + rng.next()));
        for (let i = 0; i < nShrubs; i++) {
          const x = x0 + rng.next() * CELL, z = z0 + rng.next() * CELL;
          if (!place(x, z, 40)) continue;
          const s = rng.int(0, SHRUB_GEO.length - 1);
          const y = ctx.groundY(x, z);
          const scale = 0.5 + rng.next() * 0.9;
          const a = game.mesh({
            geometry: SHRUB_GEO[s], key: `veg:shrub:${s}`, material: FOLIAGE_MAT,
            at: [x, y, z], scale, physics: false, name: 'shrub',
          });
          a.setRotation([0, rng.next() * 360, 0]);
          a.userData = { kind: 'shrub', x, z };
          rec.actors.push(a);
        }

        const nRocks = Math.round((cover.rocks || 0) * hectares * share * 0.18 * (0.4 + rng.next()));
        for (let i = 0; i < nRocks; i++) {
          const x = x0 + rng.next() * CELL, z = z0 + rng.next() * CELL;
          if (!place(x, z, 55)) continue;
          const r = 0.28 + rng.next() * 1.5;
          const a = game.rock({
            at: [x, ctx.groundY(x, z) - r * 0.35, z], radius: r,
            seed: (cx * 131 + cz * 977 + i) & 0xffff, material: 'rock', static: true,
          });
          a.userData = { kind: 'rock', radius: r };
          rec.actors.push(a);
        }

        const nDrift = Math.round((cover.driftwood || 0) * hectares * share * 0.4 * rng.next());
        for (let i = 0; i < nDrift; i++) {
          const x = x0 + rng.next() * CELL, z = z0 + rng.next() * CELL;
          if (!place(x, z, 25)) continue;
          const v = rng.int(0, GEO.driftwood.length - 1);
          const len = 1.2 + rng.next() * 2.6;
          const a = game.mesh({
            geometry: GEO.driftwood[v], key: `veg:drift:${v}`, material: WOOD_MAT,
            at: [x, ctx.groundY(x, z), z], scale: len, physics: false, name: 'driftwood',
          });
          a.setRotation([0, rng.next() * 360, rng.next() * 14 - 7]);
          a.userData = { kind: 'deadfall', timberKg: len * 12 };
          rec.actors.push(a);
        }
      }
    }

    /* Nothing grows on a cliff, in the sea, or in somebody's street. */
    function place(x, z, maxSlopeDeg) {
      if (ctx.groundY(x, z) < 1.2) return false;
      if (ctx.slopeAt(x, z) > maxSlopeDeg) return false;
      return poiClear(x, z);
    }

    function spawnTree(speciesId, x, z, rng) {
      const spec = SPECIES[speciesId];
      if (!spec) return null;
      const v = rng.int(0, GEO[speciesId].length - 1);
      const heightM = spec.height[0] + rng.next() * (spec.height[1] - spec.height[0]);
      const y = ctx.groundY(x, z);
      const actor = game.mesh({
        geometry: GEO[speciesId][v],
        key: `veg:tree:${speciesId}:${v}`,
        material: FOLIAGE_MAT,
        at: [x, y, z], scale: heightM,
        physics: false, name: 'tree',
      });
      actor.setRotation([0, rng.next() * 360, 0]);

      /* The collider is the trunk, not the crown. A canopy collider would
         stop the player two metres short of every tree and make a wood
         impassable, when in life you walk between the trunks. */
      const trunkR = Math.max(0.09, (spec.trunk * heightM) / 24);
      const trunk = game.cylinder({
        at: [x, y + heightM * 0.25, z], radius: trunkR, height: heightM * 0.5,
        material: WOOD_MAT, static: true, name: 'trunk',
      });
      trunk.visible = false;         // the drawn tree already has a trunk

      // Standing timber, from the stem volume and the species density.
      const volumeM3 = Math.PI * trunkR * trunkR * heightM * 0.55;
      const rec = {
        speciesId, spec, x, z, heightM, trunkR, actor, trunk,
        timberKg: volumeM3 * spec.timberPerM3,
        felled: false, chopProgress: 0,
      };
      actor.userData = { kind: 'tree', tree: rec };
      trunk.userData = { kind: 'tree', tree: rec };
      return rec;
    }

    function freeCell(key) {
      const rec = cells.get(key);
      if (!rec) return;
      for (const a of rec.actors) { try { a.destroy(); } catch (e) { /* already gone */ } }
      for (const t of rec.trees) {
        if (t.trunk) { try { t.trunk.destroy(); } catch (e) { /* already gone */ } }
        const i = trees.indexOf(t);
        if (i >= 0) trees.splice(i, 1);
        treeCount--;
      }
      cells.delete(key);
    }

    /* ---- felling ---- */

    ctx.on('chop', (data) => {
      const tree = data && data.tree;
      if (!tree || tree.felled) return;
      // A hand axe through a mature trunk is minutes of work, and the trunk
      // radius is what decides how many.
      const perSwing = (data.power || 1) * 0.055 / Math.max(0.12, tree.trunkR * 2.4);
      tree.chopProgress += perSwing;
      if (tree.chopProgress < 1) {
        ctx.toast(`${Math.round(tree.chopProgress * 100)}% through the ${tree.spec.name}`);
        return;
      }
      tree.felled = true;
      try {
        tree.actor.destroy();
        if (tree.trunk) tree.trunk.destroy();
      } catch (e) { /* already gone */ }
      const i = trees.indexOf(tree);
      if (i >= 0) trees.splice(i, 1);
      treeCount--;
      // A felled tree is a log on the ground, not a puff of resources.
      const v = 0;
      const log = game.mesh({
        geometry: GEO.driftwood[v], key: `veg:drift:${v}`, material: WOOD_MAT,
        at: [tree.x, ctx.groundY(tree.x, tree.z), tree.z],
        scale: Math.min(6, tree.heightM * 0.35), physics: false, name: 'felled',
      });
      log.setRotation([0, Math.atan2(tree.z, tree.x) * 180 / Math.PI, 4]);
      log.userData = { kind: 'deadfall', timberKg: tree.timberKg };
      ctx.log(`The ${tree.spec.name} comes down.`, true);
      ctx.emit('tree-felled', { tree, timberKg: tree.timberKg, x: tree.x, z: tree.z });
    });

    /* ---- queries other modules use ---- */

    ctx.state.treeAt = (x, z, r = 3) => {
      let best = null, bestD = r * r;
      for (const t of trees) {
        const d = (t.x - x) * (t.x - x) + (t.z - z) * (t.z - z);
        if (d < bestD) { bestD = d; best = t; }
      }
      return best;
    };

    /* Overhead cover, for whoever wants to know whether the player is under
       canopy: it is what keeps rain off, holds heat in at night and hides
       you from anything looking down. */
    ctx.state.canopyAt = (x, z) => {
      let cover = 0;
      for (const t of trees) {
        const d = Math.hypot(t.x - x, t.z - z);
        const crown = t.heightM * 0.22;
        if (d < crown) cover += (1 - d / crown) * 0.55;
      }
      return Math.max(0, Math.min(1, cover));
    };

    /* ---- streaming ---- */

    let lastCx = null, lastCz = null;
    let pending = [];

    ctx.onUpdate((dt) => {
      const px = ctx.player.x, pz = ctx.player.z;
      const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);

      if (cx !== lastCx || cz !== lastCz) {
        lastCx = cx; lastCz = cz;
        const span = Math.ceil(BUILD_R / CELL);
        pending = [];
        for (let dz = -span; dz <= span; dz++) {
          for (let dx = -span; dx <= span; dx++) {
            const wx = (cx + dx) * CELL + CELL / 2;
            const wz = (cz + dz) * CELL + CELL / 2;
            if (Math.hypot(wx - px, wz - pz) > BUILD_R) continue;
            const key = cellKey(cx + dx, cz + dz);
            if (!cells.has(key)) pending.push([cx + dx, cz + dz, Math.hypot(wx - px, wz - pz)]);
          }
        }
        // Nearest first, so what is in front of the player appears first.
        pending.sort((a, b) => a[2] - b[2]);

        for (const key of Array.from(cells.keys())) {
          const [kx, kz] = key.split(':').map(Number);
          const wx = kx * CELL + CELL / 2, wz = kz * CELL + CELL / 2;
          if (Math.hypot(wx - px, wz - pz) > FREE_R) freeCell(key);
        }
      }

      /* One cell per frame. Building the whole ring at once is a visible
         hitch every time the player crosses a cell boundary; spread over a
         few frames it is invisible, and the ring is well outside view
         distance so nothing pops in front of them. */
      if (pending.length) {
        const [bx, bz] = pending.shift();
        try { buildCell(bx, bz); } catch (err) { console.error('vegetation cell:', err); }
      }
    });

    ctx.log('The trees here are what the soil will carry.');
  },
});
