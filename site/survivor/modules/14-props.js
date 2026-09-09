/* Everything at a point of interest that is not a house: the roads, the
   fence with the hole in it, the helipad, the masts and tanks and hay
   bales. The POI generator already decided where all of it is and what
   state it is in, so this module's only job is to put geometry there and
   make the pieces the player can use answer to a verb.

   Props stream on distance like everything else. A prop more than its
   lease away is destroyed and rebuilt from the same data when the player
   comes back, so the world is never holding four thousand actors.

   Emits: nothing. Reads ctx.world.pois. */
SurvivorGame.module({
  id: 'props',
  order: 14,

  init(ctx) {
    const { LE, game } = ctx;
    const live = new Map();               // prop -> { actors: [] }
    const NEAR = 260, FAR = 340;          // build inside NEAR, drop past FAR

    /* Materials shared by everything, so the instancer can batch. */
    const MAT = {
      road: { preset: 'concrete', color: 0x3a3a3c, roughness: 0.96 },
      gravel: { preset: 'concrete', color: 0x6a655c, roughness: 1.0 },
      chainlink: { preset: 'metal', color: 0x9aa0a4, roughness: 0.55, metalness: 0.8 },
      post: { preset: 'metal', color: 0x6e7276, roughness: 0.7, metalness: 0.7 },
      steel: { preset: 'steel', color: 0x8b9095 },
      rust: { preset: 'rust', color: 0x7a4a2a },
      wood: { preset: 'wood', color: 0x7b5a34 },
      hay: { preset: 'fabric', color: 0xc4a548, roughness: 1.0 },
      concrete: { preset: 'concrete', color: 0x9a9890 },
      water: { preset: 'glass', color: 0x2c4a5a, roughness: 0.12, opacity: 0.75 },
      glass: { preset: 'glass', color: 0x8fb6c8, roughness: 0.08, opacity: 0.35 },
      solar: { preset: 'glass', color: 0x1a2740, roughness: 0.2, metalness: 0.5 },
      canvas: { preset: 'fabric', color: 0xd8452f },
    };

    const y0 = (x, z) => ctx.groundY(x, z);

    /* ---- one-off geometry ---------------------------------------- */

    /* A helicopter, which is four parts short of flying and looks it.
       Built rather than boxed because it is the single most important
       object on the island and the player will stare at it. */
    function helicopterGeometry() {
      const g = new LE.Geometry();
      const push = (x0, y1, z1, x2, y2, z2, r, gg, b) => {
        const i0 = g.positions ? 0 : 0;
        const v = [];
        const corners = [
          [x0, y1, z1], [x2, y1, z1], [x2, y2, z1], [x0, y2, z1],
          [x0, y1, z2], [x2, y1, z2], [x2, y2, z2], [x0, y2, z2],
        ];
        const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
        const norms = [[0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0]];
        faces.forEach((f, fi) => {
          const n = norms[fi];
          const base = [];
          f.forEach((ci, k) => {
            const c = corners[ci];
            base.push(g.vert(c[0], c[1], c[2], n[0], n[1], n[2], k === 1 || k === 2 ? 1 : 0, k > 1 ? 1 : 0));
            g.vertColor(r, gg, b);
          });
          g.quad(base[0], base[1], base[2], base[3]);
        });
        return v;
      };
      // Cabin, tail boom, fin, skids. Rough proportions of a light utility.
      push(-1.0, 0.6, -2.2, 1.0, 2.4, 1.6, 0.32, 0.36, 0.33);
      push(-0.28, 1.5, 1.6, 0.28, 2.0, 5.6, 0.3, 0.34, 0.31);
      push(-0.1, 1.9, 5.0, 0.1, 3.2, 5.6, 0.3, 0.34, 0.31);
      push(-1.2, 0.0, -1.4, -0.9, 0.6, 2.0, 0.2, 0.2, 0.21);
      push(0.9, 0.0, -1.4, 1.2, 0.6, 2.0, 0.2, 0.2, 0.21);
      push(-1.2, 0.55, -1.2, 1.2, 0.65, -1.0, 0.2, 0.2, 0.21);
      push(-1.2, 0.55, 1.6, 1.2, 0.65, 1.8, 0.2, 0.2, 0.21);
      // Main rotor: four blades on a mast, drooping because nothing spins.
      for (let b = 0; b < 4; b++) {
        const a = (b / 4) * Math.PI * 2 + 0.3;
        const dx = Math.cos(a), dz = Math.sin(a);
        const n = [-dz, 0.1, dx];
        const w = 0.16, L = 4.6;
        const yy = 2.62 - 0.12;
        const p = [];
        p.push(g.vert(dz * w, yy + 0.06, -dx * w, n[0], n[1], n[2], 0, 0)); g.vertColor(0.16, 0.16, 0.17);
        p.push(g.vert(-dz * w, yy + 0.06, dx * w, n[0], n[1], n[2], 1, 0)); g.vertColor(0.16, 0.16, 0.17);
        p.push(g.vert(dx * L - dz * w * 0.6, yy - 0.25, dz * L + dx * w * 0.6, n[0], n[1], n[2], 1, 1)); g.vertColor(0.16, 0.16, 0.17);
        p.push(g.vert(dx * L + dz * w * 0.6, yy - 0.25, dz * L - dx * w * 0.6, n[0], n[1], n[2], 0, 1)); g.vertColor(0.16, 0.16, 0.17);
        g.quad(p[0], p[1], p[2], p[3]);
        g.quad(p[3], p[2], p[1], p[0]);
      }
      return g.finalize();
    }
    let heliGeo = null;

    /* ---- prop builders -------------------------------------------- */
    const BUILD = {
      helipad(p, out) {
        const y = y0(p.x, p.z);
        out.push(game.cylinder({ at: [p.x, y + 0.06, p.z], radius: p.radiusM || 12, height: 0.12,
          material: { preset: 'concrete', color: 0x74736e, roughness: 0.95 }, static: true, name: 'helipad' }));
        // The H, in two strokes and a bar.
        const bar = { preset: 'concrete', color: 0xe8e6dc, roughness: 0.8 };
        out.push(game.box({ at: [p.x - 2.2, y + 0.14, p.z], size: [0.7, 0.04, 6], material: bar, static: true }));
        out.push(game.box({ at: [p.x + 2.2, y + 0.14, p.z], size: [0.7, 0.04, 6], material: bar, static: true }));
        out.push(game.box({ at: [p.x, y + 0.14, p.z], size: [4, 0.04, 0.7], material: bar, static: true }));
        if (p.helicopter) {
          if (!heliGeo) heliGeo = helicopterGeometry();
          const a = game.mesh({ geometry: heliGeo, key: 'prop:helicopter', at: [p.x, y + 0.12, p.z],
            material: { preset: 'painted', color: 0xffffff, vertexColor: true, roughness: 0.42, metalness: 0.55, uvScale: 2 },
            collider: 'box', static: true, name: 'helicopter' });
          a.userData = { kind: 'helicopter', prop: p, heli: p.helicopter };
          out.push(a);
        }
      },

      generator(p, out) {
        const y = y0(p.x, p.z);
        const a = game.box({ at: [p.x, y + 0.7, p.z], size: [2.4, 1.4, 1.2], material: MAT.rust, static: true, name: 'generator' });
        a.userData = { kind: 'generator', prop: p };
        out.push(a);
        out.push(game.cylinder({ at: [p.x + 0.9, y + 1.9, p.z], radius: 0.09, height: 1.0, material: MAT.steel, static: true }));
      },

      gate(p, out) {
        const y = y0(p.x, p.z);
        for (const s of [-1, 1]) {
          out.push(game.box({ at: [p.x, y + 1.4, p.z + s * 2.6], size: [0.18, 2.8, 0.18], material: MAT.post, static: true }));
        }
        const a = game.box({ at: [p.x, y + 1.3, p.z], size: [0.08, 2.4, 5], material: MAT.chainlink, static: true, name: 'gate' });
        a.userData = { kind: 'gate', prop: p };
        out.push(a);
      },
      blastDoor(p, out) {
        const y = y0(p.x, p.z);
        const a = game.box({ at: [p.x, y + 1.2, p.z], size: [0.25, 2.4, 3], material: MAT.steel, static: true, name: 'blast door' });
        a.userData = { kind: 'door', prop: p, locked: p.locked, keycard: p.keycard };
        out.push(a);
        out.push(game.box({ at: [p.x + 0.3, y + 1.6, p.z], size: [0.1, 4, 4.4], material: MAT.concrete, static: true }));
      },

      trough(p, out) {
        const y = y0(p.x, p.z);
        out.push(game.box({ at: [p.x, y + 0.3, p.z], size: [4, 0.6, 0.9], material: MAT.concrete, static: true, name: 'trough' }));
        const w = game.box({ at: [p.x, y + 0.5, p.z], size: [3.8, 0.06, 0.75], material: MAT.water, static: true, name: 'water' });
        w.userData = { kind: 'water', source: 'trough', turbidity: 0.55, salinityGL: 0 };
        out.push(w);
      },
      rainBarrel(p, out) {
        const y = y0(p.x, p.z);
        const a = game.cylinder({ at: [p.x, y + 0.45, p.z], radius: 0.35, height: 0.9, material: MAT.wood, static: true, name: 'rain barrel' });
        a.userData = { kind: 'water', source: 'rainBarrel', turbidity: 0.08, potable: p.potable, litres: p.litres };
        out.push(a);
      },
      windPump(p, out) {
        const y = y0(p.x, p.z);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          out.push(game.box({ at: [p.x + Math.cos(a) * 0.9, y + 3, p.z + Math.sin(a) * 0.9], size: [0.1, 6, 0.1], material: MAT.post, static: true }));
        }
        out.push(game.cylinder({ at: [p.x, y + 6.4, p.z], radius: 1.5, height: 0.12, material: MAT.steel, static: true, name: 'wind pump' }));
      },
      hayBale(p, out) {
        const y = y0(p.x, p.z);
        const a = game.cylinder({ at: [p.x, y + 0.75, p.z], radius: 0.75, height: 1.5, material: MAT.hay, static: true, name: 'hay bale' });
        a.setRotation([0, 0, 90]);
        out.push(a);
      },
      woodpile(p, out) {
        const y = y0(p.x, p.z);
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 6; c++) {
            out.push(game.cylinder({ at: [p.x - 0.9 + c * 0.36, y + 0.18 + r * 0.34, p.z], radius: 0.16, height: 1.6,
              material: MAT.wood, static: true, key: 'prop:log', name: r === 0 && c === 0 ? 'woodpile' : undefined }));
          }
        }
        if (out[0]) out[0].userData = { kind: 'woodpile', prop: p };
      },
      logDeck(p, out) { BUILD.woodpile(p, out); },
      lumberStack(p, out) {
        const y = y0(p.x, p.z);
        for (let r = 0; r < 6; r++) {
          out.push(game.box({ at: [p.x, y + 0.15 + r * 0.28, p.z], size: [4, 0.24, 1.4], material: MAT.wood, static: true, name: r ? undefined : 'lumber' }));
        }
        if (out[0]) out[0].userData = { kind: 'lumber', prop: p };
      },
      fuelTank(p, out) {
        const y = y0(p.x, p.z);
        const a = game.cylinder({ at: [p.x, y + 1.6, p.z], radius: 1.6, height: 5, material: MAT.rust, static: true, name: 'fuel tank' });
        a.setRotation([90, 0, 0]);
        a.userData = { kind: 'fuelTank', prop: p, litres: p.litres, fuel: p.fuel };
        out.push(a);
      },
      undergroundTank(p, out) {
        const y = y0(p.x, p.z);
        const a = game.cylinder({ at: [p.x, y + 0.05, p.z], radius: 0.4, height: 0.1, material: MAT.steel, static: true, name: 'tank hatch' });
        a.userData = { kind: 'fuelTank', prop: p, litres: p.litres, fuel: p.fuel, contaminated: p.contaminated };
        out.push(a);
      },
      fuelPump(p, out) {
        const y = y0(p.x, p.z);
        const a = game.box({ at: [p.x, y + 0.8, p.z], size: [0.6, 1.6, 0.45], material: { preset: 'plastic', color: 0xc23b2c }, static: true, name: 'fuel pump' });
        a.userData = { kind: 'fuelPump', prop: p };
        out.push(a);
      },
      mast(p, out) {
        const y = y0(p.x, p.z);
        const h = p.heightM || 40;
        for (let s = 0; s < 3; s++) {
          const a = (s / 3) * Math.PI * 2;
          out.push(game.box({ at: [p.x + Math.cos(a) * 0.8, y + h / 2, p.z + Math.sin(a) * 0.8], size: [0.12, h, 0.12], material: MAT.steel, static: true }));
        }
        for (let l = 1; l < 8; l++) {
          out.push(game.box({ at: [p.x, y + (h / 8) * l, p.z], size: [1.8, 0.08, 1.8], material: MAT.steel, static: true, key: 'prop:mastRung' }));
        }
        const top = game.box({ at: [p.x, y + h + 0.6, p.z], size: [1.2, 1.2, 1.2], material: MAT.steel, static: true, name: 'mast head' });
        top.userData = { kind: 'mast', prop: p };
        out.push(top);
      },
      solarArray(p, out) {
        const y = y0(p.x, p.z);
        const n = p.panels || 8;
        for (let i = 0; i < n; i++) {
          const px = p.x + (i % 4) * 1.8 - 2.7, pz = p.z + Math.floor(i / 4) * 1.4;
          const a = game.box({ at: [px, y + 1.1, pz], size: [1.6, 0.06, 1.1], material: MAT.solar, static: true, key: 'prop:solarPanel' });
          a.setRotation([-32, 0, 0]);
          out.push(a);
          out.push(game.box({ at: [px, y + 0.55, pz + 0.3], size: [0.08, 1.1, 0.08], material: MAT.post, static: true, key: 'prop:solarLeg' }));
        }
        if (out[0]) out[0].userData = { kind: 'solarArray', prop: p };
      },
      batteryBank(p, out) {
        const y = y0(p.x, p.z);
        const a = game.box({ at: [p.x, y + 0.6, p.z], size: [1.8, 1.2, 0.8], material: { preset: 'plastic', color: 0x2a3038 }, static: true, name: 'battery bank' });
        a.userData = { kind: 'batteryBank', prop: p };
        out.push(a);
      },
      transmitter(p, out) {
        const y = y0(p.x, p.z);
        const a = game.box({ at: [p.x, y + 0.9, p.z], size: [0.7, 1.8, 0.6], material: MAT.steel, static: true, name: 'transmitter' });
        a.userData = { kind: 'transmitter', prop: p };
        out.push(a);
      },
      dock(p, out) {
        const y = Math.max(0.4, y0(p.x, p.z));
        const L = p.lengthM || 40, W = p.widthM || 4;
        out.push(game.box({ at: [p.x, y + 1.1, p.z + L / 2], size: [W, 0.22, L], material: MAT.wood, static: true, name: 'dock' }));
        for (let i = 0; i < L / 6; i++) {
          for (const s of [-1, 1]) {
            out.push(game.cylinder({ at: [p.x + (s * W) / 2, y + 0.3, p.z + i * 6 + 2], radius: 0.18, height: 2.2,
              material: MAT.wood, static: true, key: 'prop:piling' }));
          }
        }
      },
      ferry(p, out) {
        const y = Math.max(0.6, y0(p.x, p.z));
        const L = p.lengthM || 40;
        const hull = game.box({ at: [p.x, y + 1.6, p.z], size: [11, 3.2, L], material: MAT.rust, static: true, name: 'ferry' });
        hull.userData = { kind: 'wreck', prop: p };
        out.push(hull);
        for (let d = 1; d < (p.decks || 2); d++) {
          out.push(game.box({ at: [p.x, y + 3.2 + d * 2.6, p.z + L * 0.1], size: [9 - d, 2.4, L * 0.55], material: { preset: 'metal', color: 0xd8d4c8 }, static: true }));
        }
      },
      boat(p, out) {
        const y = Math.max(0.4, y0(p.x, p.z));
        const a = game.box({ at: [p.x, y + 0.6, p.z], size: [2.2, 1.0, p.lengthM || 6], material: { preset: 'plastic', color: 0xe4e2d8 }, static: true, name: 'boat' });
        a.userData = { kind: 'boat', prop: p };
        out.push(a);
      },
      aircraft(p, out) {
        const y = y0(p.x, p.z);
        const a = game.box({ at: [p.x, y + 1.2, p.z], size: [1.3, 1.5, 7.4], material: { preset: 'metal', color: 0xdedad0 }, static: true, name: 'aircraft' });
        a.userData = { kind: 'aircraft', prop: p };
        out.push(a);
        out.push(game.box({ at: [p.x, y + 1.6, p.z - 0.6], size: [10.8, 0.22, 1.5], material: { preset: 'metal', color: 0xdedad0 }, static: true }));
        out.push(game.box({ at: [p.x, y + 1.9, p.z + 3.4], size: [3.4, 0.16, 0.9], material: { preset: 'metal', color: 0xdedad0 }, static: true }));
      },
      windsock(p, out) {
        const y = y0(p.x, p.z);
        out.push(game.box({ at: [p.x, y + 2.5, p.z], size: [0.1, 5, 0.1], material: MAT.post, static: true }));
        const s = game.cone({ at: [p.x + 0.9, y + 4.8, p.z], radius: 0.35, height: 1.6, material: MAT.canvas, static: true, name: 'windsock' });
        s.setRotation([0, 0, 90]);
        out.push(s);
      },
      settlingTank(p, out) {
        const y = y0(p.x, p.z);
        const r = p.radiusM || 8;
        out.push(game.cylinder({ at: [p.x, y + 1.2, p.z], radius: r, height: 2.4, material: MAT.concrete, static: true, name: 'settling tank' }));
        if (p.water) {
          const w = game.cylinder({ at: [p.x, y + 2.1, p.z], radius: r - 0.3, height: 0.1, material: MAT.water, static: true, name: 'water' });
          w.userData = { kind: 'water', source: 'settlingTank', turbidity: 0.35 };
          out.push(w);
        }
      },
      chlorineStore(p, out) {
        const y = y0(p.x, p.z);
        const a = game.box({ at: [p.x, y + 0.5, p.z], size: [1.4, 1.0, 1.0], material: { preset: 'plastic', color: 0xd8d000 }, static: true, name: 'chlorine store' });
        a.userData = { kind: 'container', contents: [{ item: 'chlorine', quantity: Math.max(1, (p.kg || 5) | 0) }] };
        out.push(a);
      },
      explosivesStore(p, out) {
        const y = y0(p.x, p.z);
        const a = game.box({ at: [p.x, y + 1.1, p.z], size: [3, 2.2, 2.4], material: { preset: 'metal', color: 0xc2411f }, static: true, name: 'explosives store' });
        a.userData = { kind: 'container', locked: p.locked, contents: (p.contents || []).map((i) => ({ item: i, quantity: 2 })) };
        out.push(a);
      },
      weldingSet(p, out) {
        const y = y0(p.x, p.z);
        const a = game.box({ at: [p.x, y + 0.5, p.z], size: [0.8, 1.0, 0.6], material: { preset: 'metal', color: 0x2c5f8c }, static: true, name: 'welding set' });
        a.userData = { kind: 'welder', prop: p };
        out.push(a);
        out.push(game.cylinder({ at: [p.x + 0.6, y + 0.75, p.z], radius: 0.16, height: 1.5, material: { preset: 'metal', color: 0x1f6b3a }, static: true }));
      },
      woodStove(p, out) {
        const y = y0(p.x, p.z);
        const a = game.box({ at: [p.x, y + 0.4, p.z], size: [0.7, 0.8, 0.5], material: { preset: 'metal', color: 0x1a1a1c }, static: true, name: 'wood stove' });
        a.userData = { kind: 'stove', prop: p };
        out.push(a);
        out.push(game.cylinder({ at: [p.x, y + 1.8, p.z], radius: 0.09, height: 2.2, material: { preset: 'metal', color: 0x1a1a1c }, static: true }));
      },
      mapWall(p, out) {
        const y = y0(p.x, p.z);
        const a = game.box({ at: [p.x, y + 1.5, p.z], size: [1.6, 1.1, 0.05], material: { preset: 'fabric', color: 0xd8cba0 }, static: true, name: 'wall map' });
        a.userData = { kind: 'mapWall', prop: p };
        out.push(a);
      },
      bandsaw(p, out) {
        const y = y0(p.x, p.z);
        const a = game.box({ at: [p.x, y + 0.8, p.z], size: [1.2, 1.6, 3.4], material: MAT.rust, static: true, name: 'bandsaw' });
        a.userData = { kind: 'machine', prop: p };
        out.push(a);
      },
      crusher(p, out) { BUILD.bandsaw(p, out); },
      kiln(p, out) {
        const y = y0(p.x, p.z);
        out.push(game.box({ at: [p.x, y + 1.5, p.z], size: [4, 3, 6], material: { preset: 'brick', color: 0x8a6247 }, static: true, name: 'kiln' }));
      },
      pump(p, out) {
        const y = y0(p.x, p.z);
        const a = game.cylinder({ at: [p.x, y + 0.4, p.z], radius: 0.4, height: 0.8, material: { preset: 'metal', color: 0x2f6d3a }, static: true, name: 'pump' });
        a.userData = { kind: 'machine', prop: p };
        out.push(a);
      },
      sandFilter(p, out) {
        const y = y0(p.x, p.z);
        const a = game.cylinder({ at: [p.x, y + 1.4, p.z], radius: 1.1, height: 2.8, material: MAT.steel, static: true, name: 'sand filter' });
        a.userData = { kind: 'machine', prop: p };
        out.push(a);
      },
      gravelPile(p, out) {
        const y = y0(p.x, p.z);
        out.push(game.cone({ at: [p.x, y + 1.4, p.z], radius: 3.5, height: 2.8, material: MAT.gravel, static: true, name: 'gravel' }));
      },
      inspectionPit(p, out) {
        const y = y0(p.x, p.z);
        out.push(game.box({ at: [p.x, y - 0.8, p.z], size: [1.2, 0.1, 5], material: MAT.concrete, static: true, name: 'inspection pit' }));
      },
      quarryFace(p, out) {
        const y = p.floorY != null ? p.floorY : y0(p.x, p.z);
        const r = p.radiusM || 40;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          out.push(game.rock({ at: [p.x + Math.cos(a) * r, y + (p.heightM || 12) / 2, p.z + Math.sin(a) * r],
            radius: 6, seed: i * 37, material: { preset: 'rock', color: 0x8d8578 }, static: true, key: 'prop:quarryRock' }));
        }
      },
    };

    /* Roads are flat slabs laid on the terrain. A road that follows the
       ground rather than floating over it needs segments, so a long
       straight becomes a run of short ones. */
    function buildRoad(r, out) {
      const seg = 8;
      if (r.kind === 'loop') {
        const n = Math.max(12, Math.round((2 * Math.PI * r.radiusM) / seg));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const x = r.x + Math.cos(a) * r.radiusM, z = r.z + Math.sin(a) * r.radiusM;
          if (Math.hypot(x - ctx.player.x, z - ctx.player.z) > FAR) continue;
          const b = game.box({ at: [x, y0(x, z) + 0.04, z], size: [r.widthM, 0.08, (2 * Math.PI * r.radiusM) / n + 0.6],
            material: MAT.road, static: true, key: 'prop:roadSeg' });
          b.setRotation([0, (-a * 180) / Math.PI, 0]);
          out.push(b);
        }
      } else {
        const dx = r.x2 - r.x1, dz = r.z2 - r.z1;
        const len = Math.hypot(dx, dz);
        const n = Math.max(1, Math.round(len / seg));
        const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const x = r.x1 + dx * t, z = r.z1 + dz * t;
          if (Math.hypot(x - ctx.player.x, z - ctx.player.z) > FAR) continue;
          const b = game.box({ at: [x, y0(x, z) + 0.04, z], size: [r.widthM, 0.08, len / n + 0.4],
            material: MAT.road, static: true, key: 'prop:roadSeg' });
          b.setRotation([0, yaw, 0]);
          out.push(b);
        }
      }
    }

    /* The fence, and the hole in it. The hole is the way in and it has to
       be findable, so the posts stop and the mesh stops with them. */
    function buildFence(f, out) {
      const n = Math.max(24, Math.round((2 * Math.PI * f.radiusM) / 3));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        // The gap is an arc, not a missing post.
        if (f.gapAngle != null) {
          let d = Math.abs(((a - f.gapAngle + Math.PI) % (Math.PI * 2)) - Math.PI);
          if (d < (f.gapWidthM || 8) / (2 * f.radiusM)) continue;
        }
        const x = f.x + Math.cos(a) * f.radiusM, z = f.z + Math.sin(a) * f.radiusM;
        if (Math.hypot(x - ctx.player.x, z - ctx.player.z) > FAR) continue;
        const y = y0(x, z);
        out.push(game.box({ at: [x, y + 1.0, z], size: [0.08, 2.0, 0.08], material: MAT.post, static: true, key: 'prop:fencePost' }));
        const panel = game.box({ at: [x + Math.cos(a + Math.PI / 2) * 1.5, y + 1.0, z + Math.sin(a + Math.PI / 2) * 1.5],
          size: [0.03, 1.9, 3.1], material: MAT.chainlink, static: true, key: 'prop:fencePanel' });
        panel.setRotation([0, (-a * 180) / Math.PI, 0]);
        out.push(panel);
      }
    }

    /* ---- streaming ------------------------------------------------- */
    const jobs = [];       // deferred work so a POI never lands in one frame
    function enqueue(poi) {
      for (const p of poi.props || []) jobs.push({ key: p, run: () => { const out = []; (BUILD[p.kind] || (() => {}))(p, out); return out; } });
      for (const r of poi.roads || []) jobs.push({ key: r, run: () => { const out = []; buildRoad(r, out); return out; } });
      if (poi.fence) jobs.push({ key: poi.fence, run: () => { const out = []; buildFence(poi.fence, out); return out; } });
    }

    const poiState = new Map();
    ctx.onUpdate(() => {
      const px = ctx.player.x, pz = ctx.player.z;
      for (const poi of ctx.world.pois || []) {
        const d = Math.hypot(poi.x - px, poi.z - pz) - (poi.radiusM || 60);
        const want = d < NEAR;
        const had = poiState.get(poi);
        if (want && !had) { poiState.set(poi, true); enqueue(poi); }
        else if (!want && had && d > FAR) {
          poiState.set(poi, false);
          for (const [k, rec] of live) {
            if (rec.poi === poi) { for (const a of rec.actors) { try { a.destroy(); } catch (e) { /* already gone */ } } live.delete(k); }
          }
          for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].poi === poi) jobs.splice(i, 1);
        }
        if (want && !had) for (const j of jobs) if (!j.poi) j.poi = poi;
      }

      // One job per frame keeps the frame time flat when a town appears.
      const job = jobs.shift();
      if (job && !live.has(job.key)) {
        try { live.set(job.key, { actors: job.run(), poi: job.poi }); }
        catch (e) { ctx.log(`prop failed: ${e.message}`); live.set(job.key, { actors: [], poi: job.poi }); }
      }
    });

    /* ---- the verbs props answer to --------------------------------- */
    ctx.state.offerHooks = ctx.state.offerHooks || [];
    ctx.state.offerHooks.push((hit, ud) => {
      if (ud.kind === 'helicopter') {
        const h = ud.heli;
        const short = (h.needs || []).filter((n) => !(h.have || []).includes(n));
        return { verb: short.length ? `check the helicopter (needs ${short.join(', ')})` : 'start the helicopter',
          hold: 2,
          act: () => ctx.log(short.length
            ? `It is ${short.length} parts short: ${short.join(', ')}.`
            : 'The turbine spools. This island is behind you.', true) };
      }
      if (ud.kind === 'water') {
        return { verb: 'fill a bottle here', hold: 6, act: () => ctx.emit('fill-water', { source: ud }) };
      }
      if (ud.kind === 'woodpile' || ud.kind === 'lumber') {
        return { verb: 'take firewood', hold: 6, act: () => {
          ctx.player.inventory.add({ item: 'firewood', massKg: 6, volumeL: 9, stackable: true, quantity: 2 });
          ctx.log('Two armfuls of split wood.');
        } };
      }
      if (ud.kind === 'fuelTank') {
        return { verb: `siphon ${ud.fuel || 'fuel'}`, hold: 20, act: () => {
          ctx.player.inventory.add({ item: 'fuel', massKg: 0.75, volumeL: 1, stackable: true, quantity: 5 });
          ctx.log(`Five litres of ${ud.fuel || 'fuel'}, and a mouthful you did not want.`, true);
        } };
      }
      if (ud.kind === 'container' && ud.contents && ud.contents.length) {
        return { verb: ud.locked ? 'force it open' : 'open it', hold: ud.locked ? 20 : 2, act: () => {
          for (const c of ud.contents) {
            const spec = (ctx.state.itemTable || {})[c.item] || {};
            ctx.player.inventory.add({ item: c.item, massKg: spec.massKg || 0.5, volumeL: spec.volumeL || 0.5,
              stackable: spec.stackable !== false, quantity: c.quantity || 1 });
          }
          ctx.log(`You take ${ud.contents.map((c) => c.item).join(', ')}.`, true);
          ud.contents = [];
        } };
      }
      if (ud.kind === 'mapWall') {
        return { verb: 'study the map', hold: 6, act: () => { ctx.emit('reveal-map', {}); ctx.log('Every marked place on the island, copied into your head.', true); } };
      }
      if (ud.kind === 'welder') return { verb: 'welding set (needs power)', act: null };
      if (ud.kind === 'stove') return { verb: 'a wood stove', act: null };
      return null;
    });
  },
});
