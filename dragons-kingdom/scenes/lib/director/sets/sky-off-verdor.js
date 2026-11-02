// Shot director set - SKY_OFF_VERDOR (in flight off Verdor, scene 1C after the takeoffs: 1C-07 .. 1C-19).
//
// The style frame F3 world (scenes/lookdev/style-f3-flight.js: the island's coast, a shallow sandy bay
// over a shelving sea floor, scanned rocks in the shallows, a live FFT sea) moved into the VERDOR frame
// so it joins the riding grounds: the coastline is VERDOR_GROUNDS' own (same noise seed and formula
// near the field), the land rises from the 9 m field to 30-60 m cliffs south of it, and the sky / sun
// / exposure are the grounds' (physical sky + atmosphere, registry continuity '1C': sunDir(102, 31)).
//
// MAP (VERDOR frame: +x EAST = the sea, -z NORTH, y up, metres; sea level 0):
//   grounds  (4, 9, -34) the riding field; scar (43, 9, -60) Charcoal's launch spot
//   coast    x = coastX(z): ~235 at the field, ~295 from z 300, swinging east from z 1200 (the path
//            "curves along the coast", 1C-15)
//   lane     the flight line runs SOUTH (+z) ~150-300 m off the coast (x 450-600), 40-90 m up:
//            screen LEFT -> RIGHT for a camera on the inland (west) side looking east (shotlist
//            conventions.flight_line_1C_to_1E); Leaf on the inland side and a little behind
//   headland (120, 40, -700): the north end of Verdor behind them (1C-19's "island, L-bg")
// No set objects move: the dragons, riders and camera ships are actors / camera keys of the shots.
// set.shadowAt: [x, y, z] or keys (the sun's shadow box centre, default the camera's aim), set.shadowExtent.
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { heightfield, makeNoise, smooth, gradedAxis } from '../../sets/terrain.js';
import { terrainMaterial } from '../../sets/materials.js';
import { loadKit } from '../../sets/kitbash.js';
import { filmFinish } from '../../../lookdev/finish.js';
import { keyed } from '../timeline.js';

export const FIELD = 9;

export function cinematic() {
  return filmFinish({
    atmosphere: { enabled: true, sky: 'physical', haze: 2.0, mieG: 0.8, sunDirection: null, sunIlluminance: 6, apDistanceScale: 1.3, environment: true },
    volumetrics: {
      enabled: true, range: 4000, near: 1, resolution: [200, 96, 64], noiseFilter: true, intensity: 1.0,
      density: 0.00005, heightFalloff: 0.012, fogBase: 0, anisotropy: 0.75, noiseScale: 0.004, noiseAmount: 0.6, wind: [1.5, 0, -0.5],
      banks: [
        // the last mist over the water, far out (continuity 1C), and a thin band along the cliff foot
        { center: [2400, 25, 800], radius: [900, 45, 2600], density: 0.0025, noise: 0.85 },
        { center: [420, 8, 1400], radius: [140, 10, 1600], density: 0.0012, noise: 0.9 },
      ],
      cloudShadows: { coverage: 0.2, scale: 0.0011, speed: [6, 2], altitude: 1600, opacity: 0.35 },
    },
    shadows: { cascades: 0 },
    ao: { enabled: false },
    dof: { samples: 40 },
    grade: { exposure: 0, whiteBalance: 6000, contrast: 1.1, saturation: 0.97 },
  });
}

/** the coastline (inland is x < coastX): VERDOR_GROUNDS' formula near the field, then swinging east */
export function coastX(N, z) {
  return 235 + 25 * N.fbm(z * 0.006, 1.3, 3) + 60 * smooth(-200, 300, z) + 180 * smooth(1200, 3600, z) + 12 * N.fbm(z * 0.02, 2.3, 3);
}

export async function build(ctx) {
  const { scene, camera } = ctx;
  const draft = ctx.preset === 'draft' || ctx.preset === 'preview';
  const N = makeNoise(23);                       // the grounds' seed: the same coast near the field
  const H = (x, z) => {
    const d = coastX(N, z) - x;                  // > 0 inland
    if (d > 0) {
      // the field's 9 m near the grounds, cliffs rising southward; rolling hills inland
      const cliffH = FIELD + (24 + 26 * N.fbm(z * 0.005 + 5, 1.7, 3)) * smooth(250, 1100, z);
      const cliff = cliffH * smooth(0, 12, d);
      const hills = 90 * smooth(120, 1200, d) * (0.5 + 0.5 * N.fbm(x * 0.0018, z * 0.0018, 4)) + 120 * smooth(-200, -900, z) * smooth(60, 600, d);
      return cliff + hills + 2.5 * N.fbm(x * 0.025, z * 0.025, 4) * smooth(8, 40, d);
    }
    // the bay: boulders at the cliff foot, pale sand shelving gently, weed patches, deep water past ~500 m
    const off = -d;
    const shelf = -0.011 * off - 0.000016 * off * off - 30 * smooth(450, 900, off);
    const boulders = 2.2 * Math.max(0, N.fbm(x * 0.08, z * 0.08, 3) + 0.1) * (1 - smooth(0, 30, off));
    const ripples = 0.25 * N.fbm(x * 0.06 + 3, z * 0.06, 3) + 1.4 * N.fbm(x * 0.006, z * 0.006 - 2, 3);
    return Math.max(shelf + boulders + ripples - 0.5, -70);
  };

  const sun = new THREE.DirectionalLight(0xffffff, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(draft ? 2048 : 4096, draft ? 2048 : 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.3;
  scene.add(sun, sun.target);

  // the grounds' sea (same wind, seed): continuity with 1C-01..06
  const ocean = createOcean(ctx, { windSpeed: 6, windDirection: 200, swell: 0.45, choppiness: 1.1, seed: 9, depth: 40, mipFilter: 'trilinear', roughness: 0.05, turbidity: 0.05, foamThreshold: 0.72, shoreFoam: 0.8, shoreFoamWidth: 1.4, surf: 0.6 });
  scene.add(ocean.mesh);

  const land = heightfield({
    xs: gradedAxis(-1600, 2400, draft ? 520 : 760, 350, 2.0),
    zs: gradedAxis(-1800, 4200, draft ? 760 : 1100, 600, 1.8),
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
    { id: 'pbr/acg_rock26', scale: 5, tint: [0.62, 0.6, 0.56], normalScale: 1.4 },     // pale limestone (canon: a pale coast)
    { id: 'pbr/acg_ground037', scale: 4, tint: [0.32, 0.4, 0.17] },                    // turf: the grounds' green
    { id: 'pbr/acg_ground27', scale: 4, tint: [1.0, 0.96, 0.88] },                     // sand
    { id: 'pbr/acg_ground28', scale: 3, tint: [0.85, 0.84, 0.8] },
  ], { macro: 0.45, macroScale: 0.01, detailNear: 200, detailFar: 2500, vertexColors: true });
  const ground = new THREE.Mesh(land.geometry, landMat);
  ground.receiveShadow = true; ground.castShadow = true;
  scene.add(ground);

  // scanned rocks breaking the surface in the bays (scale for the water, F3)
  const kit = await loadKit(ctx, 'model/babylon_coastal_cliff');
  const rocks = { rock_moss_set_02: [], rock_moss_set_01: [] };
  { let a = 991; const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    for (let i = 0; i < (draft ? 70 : 120); i++) {
      const z = -300 + r() * 3600, off = 25 + Math.pow(r(), 1.6) * 260;
      const x = coastX(N, z) + off, y = H(x, z);
      const name = r() < 0.6 ? 'rock_moss_set_02' : 'rock_moss_set_01';
      const s = (2 + Math.pow(r(), 2.2) * 6) / (name === 'rock_moss_set_01' ? 0.8 : 1.3);
      rocks[name].push({ p: [x, y - 0.5, z], s: [s, s * (0.7 + r() * 0.5), s], r: r() * 6.28, tilt: [(r() - 0.5) * 0.3, (r() - 0.5) * 0.3] });
    } }
  for (const [n, list] of Object.entries(rocks)) if (list.length) scene.add(kit.instance(n, list));

  camera.near = 0.3; camera.far = 40000; camera.updateProjectionMatrix();
  const marks = {
    grounds: [4, FIELD, -34], scar: [43, FIELD, -60], headland: [120, 40, -700],
    coast0: [coastX(N, 0), 0, 0], coast600: [coastX(N, 600), 0, 600], coast1500: [coastX(N, 1500), 0, 1500],
  };
  return {
    marks,
    objects: {},
    ground: (x, z) => Math.max(0, H(x, z)),
    /** the coastline x at z (spec helpers, previs) */
    coastX: (z) => coastX(N, z),
    applyShot(info) {
      const st = info.spec.set || {}, c = info.cont, t = info.local;
      ocean.update(info.t);
      const sd = new THREE.Vector3(...(c.sun || [0.957, 0.515, 0.203])).normalize();
      // the shadow box: the formation (st.shadowAt) or the camera's aim point
      let at = st.shadowAt ? keyed(t, st.shadowAt) : null;
      if (!at) { const lk = info.spec.cam?.look; const p = Array.isArray(lk) && typeof lk[0] === 'number' ? lk : null; at = p || [500, 40, 600]; }
      const ext = st.shadowExtent ?? 160;
      sun.target.position.set(at[0], Math.min(at[1], 20), at[2]);
      sun.position.copy(sun.target.position).addScaledVector(sd, 900);
      const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 10; sc.far = 2000; sc.updateProjectionMatrix();
      sun.target.updateMatrixWorld();
    },
  };
}
