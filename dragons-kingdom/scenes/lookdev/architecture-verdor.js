// Architecture - Verdor (PROVISIONAL designs): hero angles, one shot per second:
//   t 0-1  the riding-grounds stable with Charcoal's access rig, a person (Remi) for scale
//   t 1-2  the access rig: switchback stairs, deck, mast and gangway, Remi on the stair foot
//   t 2-3  the ground keepers' lodge (the doorway at the field edge) and Leaf's movable platform
//   t 3-4  the palace, far off (long lens, haze)
//   t 4-5  the harbour: weathered steps down to the quay, warehouses
//   node render/render.mjs --still scenes/lookdev/architecture-verdor.js --time 0.5 --preset final --png stable.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { terrainMaterial } from '../lib/sets/materials.js';
import { heightfield, makeNoise, gradedAxis, smooth } from '../lib/sets/terrain.js';
import { grassField } from '../lib/sets/grass.js';
import { Kit, frame, yawFrame } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { stable, keeperHouse, accessRig, leafPlatform, palace, harbor } from '../lib/architecture/verdor.js';
import { loadCharacter, placeCharacter } from '../lib/humans/index.js';
import { reviewTime } from '../lib/humans/stage.js';
import { filmFinish } from './finish.js';

const SUN = new THREE.Vector3(0.598, 0.743, -0.300).normalize();
// the rig stands in the open yard east of the stable (Charcoal lies beyond its gangway, +z of it)
const STABLE = [0, -34], RIG = [34, -6], KEEPER = [-26, -14], LEAFP = [-17, -7];
const PALACE = [-700, -620], HARBOR = [520, 260];
// (round 2: the harbour turned so its quay face looks east-south-east, into a raking sun - the tide
// zones, the slime and the foam line read in light instead of the quay's own shadow)
const HY = 1.6, HC = Math.cos(HY), HS = Math.sin(HY);
const hw = (lx, ly, lz) => [HARBOR[0] + lx * HC + lz * HS, ly, HARBOR[1] - lx * HS + lz * HC];   // harbour-local -> world
const hl = (x, z) => { const dx = x - HARBOR[0], dz = z - HARBOR[1]; return [dx * HC - dz * HS, dx * HS + dz * HC]; };   // world -> harbour-local
const SHOTS = [
  { name: 'stable-rig', p: [58, 2.2, 22], t: [14, 7.0, -22], fl: 21, fstop: 5.6 },
  { name: 'rig', p: [50, 1.7, 15.5], t: [33.5, 6.4, -5.5], fl: 18, fstop: 5.6 },
  { name: 'keeper', p: [-11.5, 1.6, 4.0], t: [-25, 2.4, -14], fl: 30, fstop: 5.6 },
  { name: 'palace', p: [-290, 9, -530], t: [-700, 37.5, -612], fl: 70, fstop: 8, near: 25 },
  { name: 'harbor', p: hw(-12, 3.9, 14), t: hw(-3, 1.2, -2), fl: 28, fstop: 5.6 },
];

export const meta = {
  title: 'Architecture - Verdor (PROVISIONAL)',
  duration: SHOTS.length,
  seed: 9,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.6, apDistanceScale: 1.6 },
    shadows: { cascades: 3, maxDistance: 160, bias: -0.0003, normalBias: 2.5 },
    ao: { enabled: true, radius: 0.8 },
    dof: { samples: 48 },
    grade: { exposure: 0.7, whiteBalance: 5800, contrast: 1.05, saturation: 1.0 },
    motionBlur: { accumulateSamples: 5 },
  }),
};

let S;
export async function setup(ctx) {
  const { scene, camera } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: 1.093 });
  const sun = sky.apply(scene);
  sun.intensity *= 1.5;
  scene.environmentIntensity = 0.85;
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  scene.add(sun, sun.target);
  const M = await archMaterials(ctx);
  // the riding grounds: a gentle grass field; the harbour on the sea far east
  const N = makeNoise(5);
  const ground = heightfield({
    xs: gradedAxis(-1200, 1200, 320, 0, 2.5), zs: gradedAxis(-1200, 1200, 320, 0, 2.5), height: (x, z) => {
      { const [lx, lz] = hl(x, z); if (Math.abs(lx) < 180 && lz > -70) return -3; }                  // the harbour: built ground + basin
      // the palace stands on a broad rise
      return 0.4 * N.fbm(x * 0.02, z * 0.02, 3) + 24 * smooth(330, 110, Math.hypot(x - PALACE[0], z - PALACE[1])) + 3 * N.fbm(x * 0.006, z * 0.006, 2) * smooth(330, 150, Math.hypot(x - PALACE[0], z - PALACE[1]));
    },
    splat: (x, z) => {
      const nearB = Math.min(Math.hypot(x - STABLE[0], z - STABLE[1] - 8), Math.hypot(x - KEEPER[0], z - KEEPER[1] - 5));
      // trodden mud and straw before the stable door and the lodge, a churned ring round the rig
      // and a cart track between them; the palace rise is turf with a little rock showing
      const track = smooth(2.6, 1.2, Math.abs((z - STABLE[1] - 6) - (x - STABLE[0]) * 0.75 + 2.0 * Math.sin(x * 0.08)));
      // (round 2: the trodden ground round the rig is ragged - no round decal - with a worn path
      // from the stair foot to the cart track)
      const rd = Math.hypot(x - RIG[0], z - RIG[1]) * (1 + 0.45 * (N.fbm(x * 0.12 + 3, z * 0.12, 3)));
      const rigPath = smooth(1.8, 0.7, Math.abs((z - RIG[1] - 4.6) * 0.9 - (x - RIG[0] + 3.0) * 0.45 + 0.6 * Math.sin(x * 0.3))) * smooth(16, 4, Math.hypot(x - RIG[0] + 4, z - RIG[1] - 6));
      const worn = Math.min(1, smooth(14, 4, nearB) * 0.8 + smooth(9, 3.5, rd) * 0.85 * (0.75 + 0.25 * N.fbm(x * 0.6, z * 0.6, 2)) + rigPath * 0.7 + track * 0.7 * smooth(60, 30, Math.hypot(x - 15, z + 18)));
      const rock = 0.12 * smooth(260, 120, Math.hypot(x - PALACE[0], z - PALACE[1])) * smooth(0.0, 0.4, N.fbm(x * 0.03 + 3, z * 0.03, 3) + 0.2);
      // the road winding up to the palace gate
      const pd = Math.hypot(x - PALACE[0], z - PALACE[1]);
      // (round 2: no road on the hill - at this distance the terrain's splat resolution (~10 m) only
      // smeared it into a dark smudge on the lawn)
      const road = 0 * pd;
      const wr = Math.max(worn, road);
      // (round 2: no flat lawn - the two grasses drift in big patches, the field edges and the slope
      // go drier and rougher)
      const g1 = 0.2 + 0.65 * smooth(-0.35, 0.35, N.fbm(x * 0.012 + 7.1, z * 0.012 - 3.3, 3)) * (0.8 + 0.2 * N.fbm(x * 0.09, z * 0.09, 2));
      const dry = 0.18 * smooth(0.1, 0.5, N.fbm(x * 0.03 - 5.0, z * 0.03 + 9.0, 3)) * smooth(60, 160, Math.hypot(x - 15, z + 18));
      const grass = (1 - wr) * (1 - rock);
      return [rock * (1 - road), grass * g1 * (1 - dry), grass * (1 - g1) * (1 - dry), Math.min(1, wr * (1 - rock * (1 - road)) + grass * dry)];
    },
  });
  const landMat = await terrainMaterial(ctx, [
    { id: 'pbr/acg_rock26', scale: 3, tint: [0.62, 0.6, 0.56] },
    { id: 'pbr/acg_ground037', scale: 1.4, tint: [0.26, 0.34, 0.13] },
    { id: 'pbr/acg_ground03', scale: 1.4, tint: [0.3, 0.34, 0.16] },
    { id: 'pbr/acg_ground24', scale: 1.2, tint: [0.33, 0.25, 0.16], normalScale: 1.6 },
  ], { macro: 0.5, macroScale: 0.02, detailNear: 60, detailFar: 900, minRoughness: 0.82, roughnessScale: 1.3 });
  landMat.envMapIntensity = 0.45;
  const land = new THREE.Mesh(ground.geometry, landMat); land.receiveShadow = true; scene.add(land);
  {
    // the quay's hinterland: packed earth and cobbles at quay level behind the paving
    const { groundMaterial } = await import('../lib/humans/stage.js');
    const hq = new THREE.Group(); hq.position.set(HARBOR[0], 0, HARBOR[1]); hq.rotation.y = HY; scene.add(hq);
    const qg = new THREE.Mesh(new THREE.PlaneGeometry(180, 62), await groundMaterial('pbr/ph_floor_pebbles_01', ctx, [180, 62], { tint: [0.7, 0.68, 0.64] }));
    qg.rotation.x = -Math.PI / 2; qg.position.set(0, 2.79, -8 - 31); qg.receiveShadow = true; hq.add(qg);
    const qb = new THREE.Mesh(new THREE.BoxGeometry(180, 6, 62), new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 1 }));
    qb.position.set(0, -0.22, -8 - 31); hq.add(qb);
  }
  // the buildings
  const kit = new Kit(0);
  stable(kit, yawFrame([STABLE[0], 0, STABLE[1]], 0.9), { lod: 'mid', seed: 3 });
  const rig = accessRig(kit, yawFrame([RIG[0], 0, RIG[1]], 0.35), { seed: 4 });         // deck 10.6 m, the gangway lands at Charcoal's saddle (~9.7 m)
  keeperHouse(kit, yawFrame([KEEPER[0], 0, KEEPER[1]], 1.2), { lod: 'mid', seed: 5 });
  leafPlatform(kit, yawFrame([LEAFP[0], 0, LEAFP[1]], 2.2), { seed: 6 });
  const far = new Kit(0);
  palace(far, yawFrame([PALACE[0], 24.4, PALACE[1]], 0.5), { seed: 7 });
  // the town on the slope below the palace (between it and the camera): rows of houses along the
  // contours stepping up the rise to the walls, gardens and trees between them, hedged fields below
  // (round 2: no toy row of big houses on one line in front of the palace)
  {
    const { house } = await import('../lib/architecture/house.js');
    const { bushGeometry, foliageMaterial, scatter } = await import('../lib/sets/scatter.js');
    const pd = (x, z) => Math.hypot(x - PALACE[0], z - PALACE[1]);
    const hgt = (x, z) => 0.4 * N.fbm(x * 0.02, z * 0.02, 3) + 24 * smooth(330, 110, pd(x, z)) + 3 * N.fbm(x * 0.006, z * 0.006, 2) * smooth(330, 150, pd(x, z));
    const tr = (() => { let a = 77; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
    const town = new Kit(0);
    const A0 = Math.atan2(-530 - PALACE[1], -290 - PALACE[0]);          // toward the camera
    const spots = [];
    let k = 0;
    // (the houses stand on the flanks of the rise, about as far from the lens as the palace - so they
    // read at its scale - and leave the slope in front of the gatehouse open)
    for (const dist of [98, 116, 134, 152]) {
      let ang = A0 - 0.95 + tr() * 0.06;
      while (ang < A0 + 0.95) {
        const w = 5.5 + tr() * 3, d = 7 + tr() * 2;
        if (Math.abs(ang - A0) < 0.4) { ang = A0 + 0.4 + tr() * 0.05; continue; }
        if (tr() < 0.2) { ang += (w + 7 + tr() * 6) / dist; continue; }            // a garden, a lane up the hill
        const r = dist + (tr() - 0.5) * 5;
        const x = PALACE[0] + Math.cos(ang) * r, z = PALACE[1] + Math.sin(ang) * r;
        const yaw = Math.PI / 2 - ang + (tr() - 0.5) * 0.25;
        // set into the slope: the floor at the downhill front, the back dug into the hill
        const fx = Math.cos(ang), fz = Math.sin(ang);
        const y = Math.min(hgt(x + fx * d * 0.5, z + fz * d * 0.5), hgt(x, z)) - 0.15;
        house(town, yawFrame([x, y, z], yaw), { w, d, storeys: tr() < 0.35 ? 2 : 1, roof: tr() < 0.55 ? 'side' : 'front', seed: 700 + k++, lod: 'low', party: { left: false, right: false }, cover: tr() < 0.5 ? 'clay' : 'slate', chimney: tr() < 0.6 });
        spots.push([x, z, Math.max(w, d) * 0.6]);
        ang += (w + 1.0 + tr() * 3.5) / dist;
      }
    }
    scene.add(town.build(M, { name: 'palace-town' }));
    // trees: in the gardens among the houses, a wood on the rise behind the walls, hedgerows with
    // standard trees along the field edges below the town
    const free = (x, z, r) => { for (const [sx, sz, sr] of spots) if (Math.hypot(x - sx, z - sz) < sr + r) return false; return pd(x, z) > 62; };
    const fol = foliageMaterial({ color: [0.042, 0.058, 0.026], leafScale: 0.5 });
    const geos = [bushGeometry(3, 2, 0.9), bushGeometry(3, 5, 1.0), bushGeometry(3, 9, 0.85)];
    const trees = new THREE.Group();
    geos.forEach((geo, gi) => trees.add(scatter(geo, fol, 260, (rng) => {
      const u = rng();
      let x, z, h;
      if (u < 0.45) {                                                         // gardens among the houses on the flanks
        const a = A0 + (rng() < 0.5 ? -1 : 1) * (0.42 + rng() * 0.6), r = 92 + rng() * 75;
        x = PALACE[0] + Math.cos(a) * r; z = PALACE[1] + Math.sin(a) * r; h = 6 + rng() * 7;
      } else {                                                                // the wood behind and beside the walls
        const a = A0 + Math.PI + (rng() - 0.5) * 3.2, r = 60 + rng() * 190;
        x = PALACE[0] + Math.cos(a) * r; z = PALACE[1] + Math.sin(a) * r; h = 9 + rng() * 9;
      }
      const wd = h * (0.75 + rng() * 0.6);
      if (!free(x, z, wd * 0.5)) return null;
      const c = 0.75 + rng() * 0.5;
      return { p: [x, hgt(x, z) - 0.4, z], s: [wd, h, wd * (0.8 + rng() * 0.4)], r: rng() * 6.28, c: [c * (0.9 + 0.2 * rng()), c, c * (0.85 + 0.2 * rng())] };
    }, 31 + gi * 7)));
    scene.add(trees);
  }
  const hb = new Kit(0);
  harbor(hb, yawFrame([HARBOR[0], 0, HARBOR[1]], HY), { seed: 8 });
  for (const k of [kit, far, hb]) { const g = k.build(M, { name: 'verdor' }); scene.add(g); }
  // people for scale: Remi at the foot of the rig's stair, a keeper at the lodge door
  const people = [];
  try {
    const remi = await loadCharacter('remi');
    placeCharacter(remi, RIG[0] - 0.3, 0, RIG[1] + 6.6, 0.35);
    scene.add(remi.root); people.push(remi);
    const keeper = await loadCharacter('keeper1');
    placeCharacter(keeper, KEEPER[0] + 4.4, 0, KEEPER[1] + 3.0, 1.0);
    scene.add(keeper.root); people.push(keeper);
  } catch (e) { console.warn('architecture-verdor: people not built (' + e.message + ')'); }
  // grass near the cameras (tussocks), thinning to the worn ground round the buildings
  const place = (cx, cz, R) => (rng) => {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * R;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (Math.hypot(x - STABLE[0], z - STABLE[1]) < 16) return null;
    // (a ragged edge: grass thins out over a couple of metres, never a circle)
    const rr = Math.hypot(x - RIG[0], z - RIG[1]) * (1 + 0.45 * N.fbm(x * 0.12 + 3, z * 0.12, 3));
    if (rr < 6.0 || (rr < 9.5 && rng() < (9.5 - rr) / 3.5)) return null;
    if (Math.hypot(x - KEEPER[0], z - KEEPER[1]) < 7) return null;
    return [x, 0.4 * N.fbm(x * 0.02, z * 0.02, 3) - 0.02, z];
  };
  for (const [cx, cz, R, n] of [[34, 4, 22, 60000], [-16, -2, 18, 40000]]) {
    scene.add(grassField({ count: n, height: [0.05, 0.2], seed: 5 + cx, color: [0.05, 0.072, 0.022], dry: [0.2, 0.17, 0.085], dryAmount: 0.5, place: place(cx, cz, R) }));
    scene.add(grassField({ count: n / 6, height: [0.18, 0.42], seed: 7 + cx, blades: 10, color: [0.035, 0.055, 0.018], dry: [0.22, 0.19, 0.1], dryAmount: 0.6, place: place(cx, cz, R) }));
  }
  camera.near = 0.1; camera.far = 6000;
  S = { sun, rig, people, M };
}

export function update(t, ctx) {
  const rt = reviewTime(t, ctx);
  const sh = SHOTS[Math.min(SHOTS.length - 1, Math.max(0, rt.k))];
  const cam = ctx.camera;
  cam.position.set(...sh.p); cam.lookAt(...sh.t);
  // (a long lens on a far set: a near plane that far out keeps the depth precision for the joints)
  cam.near = sh.near ?? 0.1; cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = sh.fl;
  ctx.lens.fstop = sh.fstop;
  ctx.lens.focus = new THREE.Vector3(...sh.p).distanceTo(new THREE.Vector3(...sh.t));
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 400;
  for (const k of ['sea', 'foam', 'pool']) { const u = S.M?.[k]?.userData?.dkUniforms?.akTime; if (u) u.value = t; }
  const { sun } = S;
  sun.target.position.set(sh.t[0], 0, sh.t[2]);
  sun.position.copy(sun.target.position).addScaledVector(SUN, 400);
}
