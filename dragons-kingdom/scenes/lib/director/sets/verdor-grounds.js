// Shot director set - VERDOR_GROUNDS (exterior, the Verdor riding grounds): P-17 and X2-08 .. X2-13.
//
// "Open grass field with a cleared launch area, Charcoal's grounded access rig, a low platform for
// Leaf, ground keepers, building doorway at the field edge. Also reused for the prologue's
// present-day shadow shot (meadow edge)." (shotlist.json sets). The look follows style frame F2
// (scenes/lookdev/style-f2-riding-grounds.js): photographic terrain layers, geometry grass in three
// layers near the action, the sea beyond the field's east edge, morning mist thinning.
//
// MAP (VERDOR frame: +x EAST = the sea side, -z NORTH; the field ~9 m above the sea):
//   leafHome  (8, -44): where Leaf always waits, by his platform (LEAF_PLATFORM, east of him)
//   gear      (0.5, -44.5): the riding equipment (mounting steps, ladder, saddle stand: props groundGear)
//   approach  Abby and Remi come up the field from the south (from the palace); Remi walks on
//             north-east toward the far end of the field (Charcoal out of frame until 1B)
//   yard      the stable and the keeper's house on the field's west edge (-45 .. -75, -105 .. -130)
//   meadow    (-150, 60): the meadow edge of P-17 (scrub and long grass, no building in view)
// Sun (registry continuity): 1A sunDir(100, 30) - over the sea side, screen right / behind for the
// cameras that look north; PROLOGUE (P-17) sunDir(105, 32): long shadows across the meadow.
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { heightfield, makeNoise, smooth, gradedAxis } from '../../sets/terrain.js';
import { terrainMaterial } from '../../sets/materials.js';
import { grassField } from '../../sets/grass.js';
import { scatter, bushGeometry, foliageMaterial } from '../../sets/scatter.js';
import { Kit, yawFrame } from '../../architecture/core.js';
import { archMaterials } from '../../architecture/materials.js';
import { stable, keeperHouse, leafPlatform } from '../../architecture/verdor.js';
import { verdorKit, groundGear } from '../../props/verdor.js';
import { Kit as PropKit, frame as pframe, rng as prng } from '../../props/core.js';
import { createCreature, poses } from '../../creatures/index.js';
import { filmFinish } from '../../../lookdev/finish.js';

export const GROUND = 9;
export const LEAF_HOME = [8, -44];
const MEADOW = [-150, 60];
const ACTION = [4, -34];

export function cinematic() {
  return filmFinish({
    atmosphere: { enabled: true, sky: 'physical', haze: 2.4, mieG: 0.8, sunDirection: null, sunIlluminance: 6, apDistanceScale: 1.2, environment: true },
    volumetrics: {
      enabled: true, range: 2500, near: 0.5, resolution: [200, 96, 64], noiseFilter: true, intensity: 1.0,
      density: 0.00012, heightFalloff: 0.03, fogBase: GROUND, anisotropy: 0.75, noiseScale: 0.01, noiseAmount: 0.6, wind: [1.5, 0, -0.5],
      banks: [
        { center: [600, 14, -900], radius: [1600, 30, 900], density: 0.004, noise: 0.8 },
        { center: [300, 8, 300], radius: [500, 12, 600], density: 0.003, noise: 0.85 },
      ],
    },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 1.2 },
    dof: { samples: 40 },
    grade: { exposure: 0, whiteBalance: 5900, contrast: 1.04, saturation: 1.0 },
  });
}

const coastX = (N, z) => 235 + 25 * N.fbm(z * 0.006, 1.3, 3) + 60 * smooth(-200, 300, z);

export async function build(ctx, { shotSpecs }) {
  const { scene, camera } = ctx;
  const draft = ctx.preset === 'draft' || ctx.preset === 'preview';
  const N = makeNoise(23);
  const H = (x, z) => {
    const d = coastX(N, z) - x;
    let field = GROUND + 0.25 * N.fbm(x * 0.02, z * 0.02, 3) + 0.1 * N.fbm(x * 0.15, z * 0.15, 2);
    // the cleared launch area and the yard are levelled
    const flat = Math.max(smooth(30, 14, Math.hypot(x - ACTION[0], z - ACTION[1])), smooth(40, 20, Math.hypot(x + 60, z + 118)));
    field += (GROUND - field) * flat;
    const hills = 60 * smooth(160, 900, -x + 40) * (0.6 + 0.4 * N.fbm(x * 0.003, z * 0.003, 3));
    if (d > 0) {
      const toShore = smooth(0, 60, d);
      return GROUND * 0.25 + (field - GROUND * 0.25) * toShore + hills * smooth(60, 400, d) + (1 - toShore) * 1.5 * N.fbm(x * 0.08, z * 0.08, 2);
    }
    return -0.8 * Math.min(-d, 40) * 0.12 - 1.5 + 0.8 * N.fbm(x * 0.05, z * 0.05, 2);
  };
  const sun = new THREE.DirectionalLight(0xffffff, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(draft ? 2048 : 4096, draft ? 2048 : 4096);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  const ocean = createOcean(ctx, { windSpeed: 6, windDirection: 200, swell: 0.45, choppiness: 1.1, seed: 9, depth: 30, mipFilter: 'trilinear', roughness: 0.05, foamThreshold: 0.7, shoreFoam: 1.0, shoreFoamWidth: 1.6, surf: 0.85 });
  scene.add(ocean.mesh);

  const land = heightfield({
    xs: gradedAxis(-900, 1200, 640, 0, 2.2), zs: gradedAxis(-1800, 700, 640, -10, 2.2),
    height: H,
    splat: (x, z, y, n) => {
      const steep = smooth(0.35, 0.7, 1 - n[1]);
      const shore = 1 - smooth(1.0, 4.0, y);
      // worn ground where the riders and Leaf come and go
      const worn = (1 - smooth(4, 13, Math.hypot(x - LEAF_HOME[0], z - LEAF_HOME[1]) + 5 * N.fbm(x * 0.2, z * 0.2, 2))) * 0.6;
      const turf = (1 - steep) * (1 - shore);
      return [Math.max(steep, shore * 0.7), turf * (1 - worn) * 0.6, turf * (1 - worn) * 0.4, turf * worn + shore * 0.3];
    },
    color: (x, z) => { const p = N.fbm(x * 0.03 + 4, z * 0.03, 3); const v = 0.85 + 0.35 * p; return [v, v, v * 0.97]; },
  });
  const landMat = await terrainMaterial(ctx, [
    { id: 'pbr/acg_rock26', scale: 3, tint: [0.62, 0.6, 0.56] },
    { id: 'pbr/acg_ground037', scale: 1.4, tint: [0.26, 0.34, 0.13] },
    { id: 'pbr/acg_ground03', scale: 1.4, tint: [0.3, 0.34, 0.16] },
    { id: 'pbr/acg_ground24', scale: 1.2, tint: [0.33, 0.25, 0.16], normalScale: 1.6 },
  ], { macro: 0.5, macroScale: 0.02, detailNear: 60, detailFar: 900, vertexColors: true, minRoughness: 0.82, roughnessScale: 1.3 });
  landMat.envMapIntensity = 0.45;
  const ground = new THREE.Mesh(land.geometry, landMat);
  ground.receiveShadow = true; ground.castShadow = true;
  scene.add(ground);

  // grass: dense geometry tufts around the action and the meadow edge, thinning out with distance
  const disc = (c, r0, r1, keep = () => true) => {
    let cx = 0, cz = 0, left = 0;
    return (rng) => {
      if (left <= 0) {
        const r = Math.sqrt(r0 * r0 + rng() * (r1 * r1 - r0 * r0)), a = rng() * Math.PI * 2;
        if (rng() < Math.max(0, (r - r1 * 0.6) / (r1 * 0.4)) * 0.8) return null;
        cx = c[0] + Math.cos(a) * r; cz = c[1] + Math.sin(a) * r; left = 2 + Math.floor(rng() * 10);
      }
      left--;
      const rr = Math.sqrt(rng()) * 0.5, th = rng() * 6.283;
      const x = cx + Math.cos(th) * rr, z = cz + Math.sin(th) * rr;
      if (!keep(x, z, rng)) return null;
      return [x, H(x, z) - 0.02, z];
    };
  };
  const worn = (x, z, rng) => Math.hypot(x - LEAF_HOME[0], z - LEAF_HOME[1]) > 6 || rng() > 0.75;
  const k = draft ? 0.7 : 1;
  scene.add(grassField({ count: Math.round(60000 * k), height: [0.06, 0.22], seed: 5, color: [0.05, 0.072, 0.022], dry: [0.2, 0.17, 0.085], dryAmount: 0.5, place: disc(ACTION, 0, 75, worn) }));
  scene.add(grassField({ count: Math.round(9000 * k), height: [0.22, 0.5], seed: 7, blades: 12, width: 1.25, color: [0.035, 0.055, 0.018], dry: [0.22, 0.19, 0.1], dryAmount: 0.65, place: disc(ACTION, 4, 55, worn) }));
  const meadowUsed = Object.values(shotSpecs).some((s) => s.set?.area === 'meadow');
  if (meadowUsed) {
    scene.add(grassField({ count: Math.round(70000 * k), height: [0.12, 0.42], seed: 13, color: [0.05, 0.075, 0.02], dry: [0.24, 0.2, 0.1], dryAmount: 0.6, place: disc(MEADOW, 0, 60) }));
    scene.add(grassField({ count: Math.round(9000 * k), height: [0.4, 0.8], seed: 17, blades: 4, width: 0.6, color: [0.16, 0.135, 0.065], dry: [0.26, 0.22, 0.12], dryAmount: 0.8, place: disc(MEADOW, 0, 45) }));
  }
  // scrub and gorse along the field edges and the meadow's hedge line
  const foliage = foliageMaterial({ color: [0.04, 0.065, 0.025], leafScale: 4, flower: [0.55, 0.42, 0.04, 0.4] });
  scene.add(scatter(bushGeometry(2, 3), foliage, 1800, (rng) => {
    const meadow = rng() < 0.35;
    const x = meadow ? MEADOW[0] - 70 + rng() * 140 : -300 + rng() * 500, z = meadow ? MEADOW[1] - 45 - rng() * 25 : -500 + rng() * 380;
    const y = H(x, z);
    if (y < 3 || (!meadow && Math.hypot(x - ACTION[0], z - ACTION[1]) < 90) || (!meadow && N.fbm(x * 0.02, z * 0.02, 2) < 0)) return null;
    const s = 1.2 + rng() * 2.6;
    return { p: [x, y - 0.3, z], s: [s, s * 0.6, s], c: [0.8 + rng() * 0.4, 1, 0.9] };
  }, 9));

  // the yard: the stable and the keeper's house at the field's west edge; Leaf's platform; the gear
  const M = await archMaterials(ctx);
  const yard = new Kit(0);
  stable(yard, yawFrame([-48, 0, -118], 0.9), { lod: 'mid', open: 0.7 });
  keeperHouse(yard, yawFrame([-76, 0, -104], 1.2), { lod: 'mid' });
  leafPlatform(yard, yawFrame([LEAF_HOME[0] + 6.5, 0, LEAF_HOME[1] - 1.5], Math.PI / 2), {});
  const yardG = yard.build(M, { name: 'verdor-yard' });
  yardG.position.y = GROUND - 0.05;
  yardG.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(yardG);
  {
    const vk = await verdorKit(ctx);
    const pk = new PropKit();
    groundGear(pk, pframe([0.5, H(0.5, -44.5) - 0.02, -44.5]), prng(17));
    const g = vk.build(pk, 'riding-gear');
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
  }

  // P-17: an invisible giant body that only casts its shadow (it flies far above the frame; the
  // director's shadow-pass FX moves it), never seen
  let shadowDragon = null;
  if (Object.values(shotSpecs).some((s) => (s.fx || []).some((f) => f.kind === 'shadow-pass'))) {
    const c = await createCreature('charcoal', { quality: 'draft' });
    c.setPose(poses.glide(c, { t: 0, bank: 0.05, dihedral: 0.12 }));
    c.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.colorWrite = false; m.depthWrite = false; }
    });
    c.root.visible = false;
    scene.add(c.root);
    shadowDragon = c.root;
  }
  camera.near = 0.05; camera.far = 30000; camera.updateProjectionMatrix();

  const marks = {
    leafHome: [LEAF_HOME[0], GROUND, LEAF_HOME[1]], gear: [0.5, GROUND + 0.8, -44.5], platform: [LEAF_HOME[0] + 6.5, GROUND + 1.4, LEAF_HOME[1] - 1.5],
    meadow: [MEADOW[0], GROUND, MEADOW[1]], farField: [40, GROUND + 2, -160], sea: [600, 0, -100], stable: [-48, GROUND + 3, -118],
  };
  return {
    marks, objects: { shadowDragon }, ground: (x, z) => H(x, z),
    applyShot(info) {
      const st = info.spec.set || {}, c = info.cont;
      ocean.update(info.t);
      const sd = new THREE.Vector3(...(c.sun || [0.94, 0.5, 0.16])).normalize();
      const at = st.shadowAt || (st.area === 'meadow' ? [MEADOW[0], GROUND, MEADOW[1]] : [ACTION[0], GROUND, ACTION[1]]);
      const ext = st.shadowExtent || (st.area === 'meadow' ? 140 : 45);
      sun.target.position.set(...at);
      sun.position.copy(sun.target.position).addScaledVector(sd, 400);
      const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 10; sc.far = 900; sc.updateProjectionMatrix();
      sun.target.updateMatrixWorld();
      if (shadowDragon && !(info.spec.fx || []).some((f) => f.kind === 'shadow-pass')) shadowDragon.visible = false;
    },
  };
}
