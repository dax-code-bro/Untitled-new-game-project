// Shot director set - VERDOR_AERIAL (scene 1C over the harbour town: X4-01 .. X4-20 minus the ground shots).
//
// SKY_OFF_VERDOR's world (the same coast formula, sea, sky, sun, rocks) continued south to the harbour bay,
// with the harbour town built on it from the architecture / props libraries. The MAP (positions, the town's
// terrace profile) is data in the spec (episodes/s01e01/final/scenes/specs/verdor-aerial.spec.js `map`) so the
// spec's camera / blocking numbers and this builder can never disagree; the defaults below are a copy.
//   bay       the coast (sky-off-verdor coastX) pulled in to the quay line x 262 for z 1480-1760, a low flat
//             headland at z ~1885 closing it to the south; a deeper basin (-3 .. -14 m) inside
//   harbour   architecture/verdor.js harbor() rotated so its sea axis (+z) faces EAST: quay face x 262,
//             z 1560-1700 (L 140), two warehouses on the apron; a curved breakwater of big blocks from the
//             north shore arcing out to the mouth (MAP.harbourWall)
//   ship      props santaMaria() moored at the quay's north end, bow north
//   town      terraced hillside west of the quay (terraces every 7.5 m, 25 m apart in x), one row of houses
//             (architecture house(), lod low) per terrace facing east, lanes between groups
//   palace    architecture palace() (lod far) on a levelled hilltop WNW of the town (MAP.palace.ground)
//   farm      the terraces run on south of the town (bare turf terraces = the terrace farm, X4-06)
// No set objects move: dragons, riders and camera ships are actors / camera keys of the shots.
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { heightfield, makeNoise, smooth, gradedAxis } from '../../sets/terrain.js';
import { terrainMaterial } from '../../sets/materials.js';
import { loadKit } from '../../sets/kitbash.js';
import { filmFinish } from '../../../lookdev/finish.js';
import { Kit, frame, yawFrame, block, makeRand } from '../../architecture/core.js';
import { archMaterials } from '../../architecture/materials.js';
import { harbor, palace } from '../../architecture/verdor.js';
import { house } from '../../architecture/house.js';
import { santaMaria } from '../../props/santa-maria.js';
import { keyed } from '../timeline.js';
import { coastX as coast0 } from './sky-off-verdor.js';

export function cinematic() {
  return filmFinish({
    atmosphere: { enabled: true, sky: 'physical', haze: 2.0, mieG: 0.8, sunDirection: null, sunIlluminance: 6, apDistanceScale: 1.3, environment: true },
    volumetrics: {
      enabled: true, range: 4000, near: 1, resolution: [200, 96, 64], noiseFilter: true, intensity: 1.0,
      density: 0.00005, heightFalloff: 0.012, fogBase: 0, anisotropy: 0.75, noiseScale: 0.004, noiseAmount: 0.6, wind: [1.5, 0, -0.5],
      banks: [
        // the last mist far out over the water (continuity 1C) and on the seaward side of the outer rocks (X6)
        { center: [2400, 25, 1600], radius: [900, 45, 2600], density: 0.0025, noise: 0.85 },
        { center: [780, 12, 3200], radius: [180, 18, 220], density: 0.002, noise: 0.9 },
      ],
      cloudShadows: { coverage: 0.2, scale: 0.0011, speed: [6, 2], altitude: 1600, opacity: 0.35 },
    },
    shadows: { cascades: 0 },
    ao: { enabled: false },
    dof: { samples: 40 },
    grade: { exposure: 0, whiteBalance: 6000, contrast: 1.1, saturation: 0.97 },
  });
}

// the town profile (a copy of the spec MAP's; the spec's wins when given)
const DEF = {
  quayX: 262, apronY: 2.6, terrace: { x0: 230, slope: 0.3, step: 7.5 },
  palace: { ground: [60, 58, 1430] },
  harbourWall: [[275, 0, 1440], [340, 0, 1482], [385, 0, 1552], [400, 0, 1630]],
  santaMaria: { at: [267, 0, 1590], heading: 0 },
  quay: { from: [262, 0, 1560], to: [262, 0, 1700] },
};

export async function build(ctx, { spec } = {}) {
  const { scene, camera } = ctx;
  const draft = ctx.preset === 'draft' || ctx.preset === 'preview';
  const MAP = { ...DEF, ...(spec?.map || {}) };
  const TR = MAP.terrace || DEF.terrace;
  const N = makeNoise(23);                       // the grounds' seed: the same coast as SKY_OFF_VERDOR
  const inBay = (z) => smooth(1330, 1470, z) * (1 - smooth(1760, 1840, z));
  const coastX = (z) => coast0(N, z) * (1 - inBay(z)) + MAP.quayX * inBay(z) + 60 * Math.exp(-(((z - 1885) / 45) ** 2));
  /** the terraced town / farm ground (x-based; flat terraces, ~45 deg risers that read as walls) */
  const townG = (x) => {
    const q = Math.max(0, TR.x0 - x) * TR.slope / TR.step, i = Math.floor(q), f = q - i;
    return MAP.apronY + TR.step * (i + smooth(0.72, 1, f));
  };
  const [px, py, pz] = MAP.palace.ground;
  const townW = (x, z) => smooth(1330, 1430, z) * (1 - smooth(2000, 2120, z)) * smooth(-150, -20, x);
  const H0 = (x, z) => {                         // SKY_OFF_VERDOR's land + sea, on this set's coast
    const d = coastX(z) - x;
    if (d > 0) {
      const cliffH = 9 + (24 + 26 * N.fbm(z * 0.005 + 5, 1.7, 3)) * smooth(250, 1100, z);
      const hills = 90 * smooth(120, 1200, d) * (0.5 + 0.5 * N.fbm(x * 0.0018, z * 0.0018, 4)) + 120 * smooth(-200, -900, z) * smooth(60, 600, d);
      return cliffH * smooth(0, 12, d) + hills + 2.5 * N.fbm(x * 0.025, z * 0.025, 4) * smooth(8, 40, d);
    }
    const off = -d;
    const shelf = -0.011 * off - 0.000016 * off * off - 30 * smooth(450, 900, off);
    const boulders = 2.2 * Math.max(0, N.fbm(x * 0.08, z * 0.08, 3) + 0.1) * (1 - smooth(0, 30, off));
    const ripples = 0.25 * N.fbm(x * 0.06 + 3, z * 0.06, 3) + 1.4 * N.fbm(x * 0.006, z * 0.006 - 2, 3);
    const open = Math.max(shelf + boulders + ripples - 0.5, -70);
    const basin = Math.max(-3 - 0.04 * off, -14) + 0.3 * ripples;
    return open + (basin - open) * inBay(z);
  };
  const H = (x, z) => {
    const w = townW(x, z), h0 = H0(x, z);
    if (w <= 0 || x > coastX(z)) return h0;
    let g = townG(x) + 0.4 * N.fbm(x * 0.03, z * 0.03, 2) * smooth(232, 200, x);
    g += (py - g) * (1 - smooth(48, 85, Math.hypot(x - px, z - pz)));     // the palace hilltop, levelled
    return h0 + (g - h0) * w;
  };
  const ground = (x, z) => Math.max(0, H(x, z));

  const sun = new THREE.DirectionalLight(0xffffff, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(draft ? 2048 : 4096, draft ? 2048 : 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.3;
  scene.add(sun, sun.target);

  const ocean = createOcean(ctx, { windSpeed: 6, windDirection: 200, swell: 0.45, choppiness: 1.1, seed: 9, depth: 40, mipFilter: 'trilinear', roughness: 0.05, turbidity: 0.05, foamThreshold: 0.72, shoreFoam: 0.8, shoreFoamWidth: 1.4, surf: 0.6 });
  scene.add(ocean.mesh);

  const land = heightfield({
    xs: gradedAxis(-1400, 2600, draft ? 560 : 820, 220, 2.4),
    zs: gradedAxis(-600, 4400, draft ? 760 : 1100, 1640, 2.4),
    height: H,
    splat: (x, z, y, n) => {
      const steep = smooth(0.4, 0.75, 1 - n[1]);
      const under = 1 - smooth(-1.2, 1.2, y);
      const turf = (1 - steep) * smooth(2, 8, y);
      const weed = under * smooth(0.05, 0.35, N.fbm(x * 0.012 + 7, z * 0.012, 3)) * 0.8;
      const sand = (1 - steep) * under * (1 - weed);
      const scree = (1 - steep) * (1 - under) * (1 - turf);
      return [Math.max(steep, scree * 0.5, weed), turf, sand, scree * 0.5];
    },
    color: (x, z) => {
      const p = N.fbm(x * 0.012 + 4, z * 0.012, 3), q = N.fbm(x * 0.05, z * 0.05 + 7, 2);
      const v = 0.75 + 0.5 * p + 0.15 * q;
      return [v * (1.02 + 0.05 * q), v, v * 0.96];
    },
  });
  const landMat = await terrainMaterial(ctx, [
    { id: 'pbr/acg_rock26', scale: 5, tint: [0.62, 0.6, 0.56], normalScale: 1.4 },
    { id: 'pbr/acg_ground037', scale: 4, tint: [0.32, 0.4, 0.17] },
    { id: 'pbr/acg_ground27', scale: 4, tint: [1.0, 0.96, 0.88] },
    { id: 'pbr/acg_ground28', scale: 3, tint: [0.85, 0.84, 0.8] },
  ], { macro: 0.45, macroScale: 0.01, detailNear: 200, detailFar: 2500, vertexColors: true });
  const gmesh = new THREE.Mesh(land.geometry, landMat);
  gmesh.receiveShadow = true; gmesh.castShadow = true;
  scene.add(gmesh);

  // scanned rocks in the shallows outside the bay (as SKY_OFF_VERDOR)
  const rk = await loadKit(ctx, 'model/babylon_coastal_cliff');
  const rocks = { rock_moss_set_02: [], rock_moss_set_01: [] };
  { let a = 991; const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    for (let i = 0; i < (draft ? 70 : 120); i++) {
      const z = -300 + r() * 3600, off = 25 + Math.pow(r(), 1.6) * 260;
      const x = coastX(z) + off, y = H(x, z);
      if (inBay(z) > 0.05 && x < 420) continue;                         // not in the harbour basin
      const name = r() < 0.6 ? 'rock_moss_set_02' : 'rock_moss_set_01';
      const s = (2 + Math.pow(r(), 2.2) * 6) / (name === 'rock_moss_set_01' ? 0.8 : 1.3);
      rocks[name].push({ p: [x, y - 0.5, z], s: [s, s * (0.7 + r() * 0.5), s], r: r() * 6.28, tilt: [(r() - 0.5) * 0.3, (r() - 0.5) * 0.3] });
    } }
  for (const [n, list] of Object.entries(rocks)) if (list.length) scene.add(rk.instance(n, list));

  // ---- the harbour town (architecture library) ----
  const M = await archMaterials(ctx);
  const kit = new Kit(0);
  const q0 = MAP.quay.from, q1 = MAP.quay.to, L = Math.abs(q1[2] - q0[2]);
  // quay: harbor()'s +z sea axis -> +x (yaw pi/2: its +x runs NORTH)
  harbor(kit, yawFrame([MAP.quayX, 0, (q0[2] + q1[2]) / 2], Math.PI / 2), { L, lod: 'low', water: false, town: false, dressing: !draft, buildings: true, hinterland: 22, seed: 31 });
  // the breakwater: big blocks along MAP.harbourWall, top 3.4 m, a parapet on the sea side
  { const rr = makeRand(57), W = MAP.harbourWall;
    for (let s = 0; s < W.length - 1; s++) {
      const a = W[s], b = W[s + 1], dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
      const X = [dx / len, 0, dz / len], Z = [-X[2], 0, X[0]];
      for (let u = 0; u < len;) {
        const l = Math.min(rr.range(3.2, 4.6), len - u), c = [a[0] + X[0] * (u + l / 2), 0, a[2] + X[2] * (u + l / 2)];
        block(kit.get('stoneQuay'), frame([c[0], -4.6, c[2]], X, [0, 1, 0], Z), l - 0.05, 16, 6.5, { r: 0.12, seg: [1.5, 2, 2], seed: rr(), noise: 0.03, nf: 0.6, chip: 0.06 });
        block(kit.get('stoneQuay'), frame([c[0] - Z[0] * 2.7, 4.0, c[2] - Z[2] * 2.7], X, [0, 1, 0], Z), l - 0.08, 1.2, 1.1, { r: 0.08, seg: 1, seed: rr(), noise: 0.02, nf: 1 });
        u += l;
      }
    } }
  // houses: one row per terrace, facing east (the sea), in groups with lanes between them
  { const rr = makeRand(808);
    const zs = [1480, 1790];
    for (let i = 0; i < 5; i++) {
      const xBack = TR.x0 - (i + 0.5) * TR.step / TR.slope;           // middle of terrace i's flat
      const y = MAP.apronY + TR.step * i;
      let z = zs[0] + rr.range(0, 8), k = 0;
      while (z < zs[1]) {
        const w = rr.range(5.5, 7.8), d = rr.range(7, 9);
        const skip = (i === 0 && z > q0[2] - 12 && z < q1[2] + 4) || rr() < 0.18;   // the apron behind the quay stays open
        if (!skip && Math.hypot(xBack - px, z - pz) > 95) {
          house(kit, yawFrame([xBack + rr.sym(1.2), y - 0.5, z + w / 2], Math.PI / 2 + rr.sym(0.04)), {
            w, d, storeys: rr() < 0.55 ? 0 : 1, allStone: rr() < 0.4, roof: rr() < 0.6 ? 'side' : 'front', cover: rr() < 0.55 ? 'slate' : 'clay', seed: 300 + i * 100 + k, lod: 'low', chimney: rr() < 0.6,
          });
        }
        z += w + (++k % 5 === 0 ? rr.range(5, 9) : rr.range(0.2, 1.4));
      }
    } }
  // the palace on its levelled hilltop (gate side east, toward the town and the sea)
  palace(kit, yawFrame([px, py, pz], Math.PI / 2), { lod: 'far' });
  const town = kit.build(M, { name: 'verdor-harbour-town' });
  town.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(town);

  // the Santa Maria at the north end of the quay, bow north (her +x is the bow)
  const sm = await santaMaria(ctx, { lettering: !draft, waterline: 0 });
  sm.root.position.set(...MAP.santaMaria.at);
  sm.root.rotation.y = Math.PI / 2 - (MAP.santaMaria.heading || 0) * Math.PI / 180;
  scene.add(sm.root);

  camera.near = 0.3; camera.far = 40000; camera.updateProjectionMatrix();
  const mk = (x, z, dy = 0) => [x, ground(x, z) + dy, z];
  const marks = {
    quay: mk(MAP.quayX - 4, (q0[2] + q1[2]) / 2), santaMaria: [...MAP.santaMaria.at], palace: [px, py, pz],
    farm: mk(146, 1846), school: mk(120, 1985), harbourMouth: [400, 0, 1700],
  };
  return {
    marks,
    objects: {},
    ground,
    coastX,
    applyShot(info) {
      const st = info.spec.set || {}, c = info.cont, t = info.local;
      ocean.update(info.t);
      const sd = new THREE.Vector3(...(c.sun || [0.957, 0.515, 0.203])).normalize();
      let at = st.shadowAt ? keyed(t, st.shadowAt) : null;
      if (!at) {
        const lk = info.spec.cam?.look;
        if (Array.isArray(lk) && typeof lk[0] === 'number') at = lk;
        else if (Array.isArray(lk) && Array.isArray(lk[0]) && Array.isArray(lk[0][1])) at = keyed(t, lk);
        else at = [300, 10, 1620];
      }
      const ext = st.shadowExtent ?? 220;
      sun.target.position.set(at[0], Math.min(at[1], 20), at[2]);
      sun.position.copy(sun.target.position).addScaledVector(sd, 900);
      const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 10; sc.far = 2000; sc.updateProjectionMatrix();
      sun.target.updateMatrixWorld();
    },
  };
}
