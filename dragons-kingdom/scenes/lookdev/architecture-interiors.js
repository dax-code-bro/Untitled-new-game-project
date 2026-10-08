// Architecture - Verdor interiors (PROVISIONAL designs), one shot per second:
//   t 0-1  the birthing chamber: the daylight shaft from the high opening, lamps, the nest
//   t 1-2  the birthing chamber: the prepared nest, bowls of water, folded cloth (lower, closer)
//   t 2-3  the treatment room: daylight from the coast-side window, settle, table, basin
//   t 3-4  the treatment room toward the window (the coastline outside), the doorway behind
//   node render/render.mjs --still scenes/lookdev/architecture-interiors.js --time 0.5 --preset final --png chamber.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { Kit, frame, xf, yawFrame } from '../lib/architecture/core.js';
import { harbor } from '../lib/architecture/verdor.js';
import { house } from '../lib/architecture/house.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { birthingChamber, treatmentRoom, loadArchCache } from '../lib/architecture/interiors.js';
import { reviewTime } from '../lib/humans/stage.js';
import { filmFinish } from './finish.js';

// the chamber at the origin, the treatment room 60 m east (same sun: high, from the east)
const SUN = new THREE.Vector3(0.72, 0.685, -0.11).normalize();     // through the chamber's east opening onto the nest
const ROOM2 = [-300, 0, 0];
const SHOTS = [
  { name: 'chamber', p: [-3.35, 1.6, 2.6], t: [0.2, 2.25, -0.2], fl: 14, fstop: 2.8, room: 0 },
  { name: 'nest', p: [-2.3, 1.25, 2.1], t: [-0.3, 0.45, 0.25], fl: 28, fstop: 2.8, room: 0 },
  // toward the door in the south wall (Alexandria comes in, Abby and Remi at the doorway): the
  // nest's frame in front, a lamp niche, the beams overhead
  { name: 'chamber-door', p: [2.5, 1.55, -2.3], t: [-1.6, 2.0, 3.1], fl: 14, fstop: 2.8, room: 0 },
  // Abby's chair (its LEFT arm built up as the arm support), Remi's settle, Alexandria's stool,
  // the splayed window
  { name: 'treatment', wb: 5600, p: [-297.65, 1.5, -1.95], t: [-300.8, 0.75, 0.8], fl: 18, fstop: 2.8, room: 1 },
  // out of the window: the town's roofs falling to the harbour, the sea, the headland
  { name: 'treatment-window', wb: 5600, p: [-300.55, 1.55, 0.3], t: [-306.0, 1.0, -0.45], fl: 24, fstop: 4, room: 1 },
  // toward the doorway (Alexandria's entrance, 2B): the chair and the arm support in front
  { name: 'treatment-door', wb: 5600, p: [-301.9, 1.5, -1.6], t: [-297.4, 1.3, 0.9], fl: 20, fstop: 2.8, room: 1, exp: 1.7 },
];

export const meta = {
  title: 'Architecture - Verdor interiors (PROVISIONAL)',
  duration: SHOTS.length,
  seed: 13,
  cinematic: filmFinish({
    volumetrics: {
      enabled: true, range: 16, near: 0.05, resolution: [192, 108, 64], noiseFilter: true,
      density: 0.022, heightFalloff: 0.0, fogBase: 0, anisotropy: 0.6, noiseScale: 0.8, noiseAmount: 0.5, wind: [0.03, 0.01, 0.0], shadowSoftness: 0.06,
      ambient: [0.0004, 0.00035, 0.0003], intensity: 1.0,
    },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.35, contactShadows: true, contactLength: 0.05, contactMaxDistance: 6 },
    dof: { samples: 64 },
    grade: { exposure: 1.2, whiteBalance: 4600, contrast: 1.05, saturation: 1.0 },
    lensFx: { vignette: 0.8 },
  }),
};

let S;
export async function setup(ctx) {
  const { scene, camera } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: 2.4, horizonFill: { above: 4, below: -2, blend: 2 } });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.004;
  scene.add(sun, sun.target);
  // image-based light is not occluded by walls: inside a room it must be a faint bounce only;
  // the daylight comes in through the openings as the sun (shadowed) and the sky seen through them
  scene.environmentIntensity = 0.07;
  const M = await archMaterials(ctx);
  const kit = new Kit(0), kit2 = new Kit(0);       // one kit per room (each built round its own origin)
  const cloth = await loadArchCache('nest_cloth');
  const ch = birthingChamber(kit, frame([0, 0, 0]), { seed: 3, cloth });
  const tableCloth = await loadArchCache('table_cloth');
  const tr = treatmentRoom(kit2, frame(ROOM2), { seed: 4, tableCloth });
  // the view from the treatment room's window (west): the roofs of the lower town falling to the
  // harbour, the quay and the sea - real geometry, hazed by the volumetrics
  // (round 2: the hill falls 22 % so the roofs stay under the window's line of sight: the sea and
  // the headland read over them)
  const SLOPE = 0.22;
  const town = new Kit(-9);
  for (let i = 0; i < 12; i++) {
    const x = ROOM2[0] - 30 - (i % 3) * 9 - Math.floor(i / 3) * 2.5, z = ROOM2[2] - 22 + Math.floor(i / 3) * 11 + (i % 2) * 2.5;
    const yb = -4 - SLOPE * (ROOM2[0] - x - 10) - 0.1;
    house(town, yawFrame([x, yb, z], -Math.PI / 2 + ((i * 0.37) % 0.3) - 0.15), { w: 6 + (i % 3), d: 8, storeys: 1, roof: i % 2 ? 'side' : 'front', seed: 500 + i, lod: 'low', party: { left: false, right: false } });
  }
  const hb = new Kit(-17.6);
  harbor(hb, yawFrame([ROOM2[0] - 66, -17.6, ROOM2[2] + 4], -Math.PI / 2), { seed: 12, lod: 'low', waterExtent: [400, 900], town: false, dressing: false });
  scene.add(kit.build(M, { name: 'chamber' }), kit2.build(M, { name: 'treatment' }), town.build(M, { name: 'town' }), hb.build(M, { name: 'harbour' }));
  for (const l of ch.lights) scene.add(l);
  // bounce: the sunlit floor patch lights the room from below (warm), the sky through the window (cool)
  const b1 = new THREE.PointLight(new THREE.Color(1.0, 0.78, 0.55), 1.6, 8, 2); b1.position.set(-0.8, 0.6, -0.2); scene.add(b1);
  // the lamps' warm light gathered on the nest (bounce from the lime-washed walls)
  const b4 = new THREE.PointLight(new THREE.Color(1.0, 0.6, 0.3), 1.2, 6, 2); b4.position.set(0.6, 1.6, 1.4); scene.add(b4);
  const b2 = new THREE.PointLight(new THREE.Color(1.0, 0.85, 0.7), 2.2, 8, 2); b2.position.set(ROOM2[0] - 0.5, 1.1, ROOM2[2] + 0.5); scene.add(b2);
  const b3 = new THREE.PointLight(new THREE.Color(0.9, 0.93, 1.0), 1.2, 7, 2); b3.position.set(ROOM2[0] - 2.2, 1.6, ROOM2[2] - 0.2); scene.add(b3);
  // the coast seen from the treatment room (west): a headland running out to the north-west with
  // cliffs, a far shore across the bay to the south-west - land rising out of the harbour's sea
  {
    const { heightfield, makeNoise, gradedAxis, smooth } = await import('../lib/sets/terrain.js');
    const { terrainMaterial } = await import('../lib/sets/materials.js');
    const N = makeNoise(11);
    const X0 = ROOM2[0];
    const land = (x, z) => {
      // headland: a lobe from the town's hill out to the north-west
      const hx = x - (X0 - 260), hz = z - (-150);
      const head = 1 - Math.hypot(hx / 230, hz / 95);
      // the far shore across the bay, low hills along the south-west horizon
      const far = (-(z) + 520 + 60 * Math.sin(x * 0.004)) / 120;
      return Math.max(head + 0.12 * N.fbm(x * 0.01, z * 0.01, 3), Math.min(1, -far + 0.05 * N.fbm(x * 0.006, z * 0.006, 2) + 1));
    };
    const hf = heightfield({
      xs: gradedAxis(X0 - 1600, X0 - 70, 160, X0 - 200, 2), zs: gradedAxis(-900, 900, 160, -100, 2),
      height: (x, z) => { const l = land(x, z); return -19.6 + (l > 0 ? 18 * smooth(0.0, 0.08, l) + 30 * smooth(0.08, 0.6, l) + 6 * N.fbm(x * 0.02, z * 0.02, 3) : -6); },
      splat: (x, z) => { const l = land(x, z); const cliff = smooth(0.0, 0.05, l) * (1 - smooth(0.05, 0.14, l)); return [cliff, (1 - cliff) * 0.7, (1 - cliff) * 0.3, 0]; },
    });
    const cm = await terrainMaterial(ctx, [
      { id: 'pbr/acg_rock26', scale: 4, tint: [0.55, 0.53, 0.5] },
      { id: 'pbr/acg_ground037', scale: 2, tint: [0.24, 0.3, 0.13] },
      { id: 'pbr/acg_ground03', scale: 2, tint: [0.3, 0.33, 0.16] },
      { id: 'pbr/acg_ground24', scale: 1.5, tint: [0.33, 0.25, 0.16] },
    ], { macro: 0.5, macroScale: 0.01, detailNear: 60, detailFar: 900, minRoughness: 0.85 });
    const coast = new THREE.Mesh(hf.geometry, cm); coast.receiveShadow = true; scene.add(coast);
  }
  // outside the treatment room's window: the sea (a flat dark mirror) and the ground round the rooms
  // the hillside under the rooms and the town (falls to the quay)
  const hill = new THREE.Mesh(new THREE.PlaneGeometry(52, 400), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.09, 0.08, 0.06), roughness: 1 }));
  hill.rotation.order = 'ZXY'; hill.rotation.x = -Math.PI / 2; hill.rotation.z = Math.atan(SLOPE);
  hill.position.set(ROOM2[0] - 36, -4 - SLOPE * 26 - 0.15, 0); scene.add(hill);
  camera.near = 0.03; camera.far = 5000;
  S = { sun, ch, tr };
}

export function update(t, ctx) {
  const rt = reviewTime(t, ctx);
  const sh = SHOTS[Math.min(SHOTS.length - 1, Math.max(0, rt.k))];
  const cam = ctx.camera;
  cam.position.set(...sh.p); cam.lookAt(...sh.t);
  cam.updateMatrixWorld(true);
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = sh.fl;
  ctx.lens.fstop = sh.fstop;
  ctx.lens.focus = new THREE.Vector3(...sh.p).distanceTo(new THREE.Vector3(...sh.t));
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 800 * (sh.exp || 1);
  // the chamber is lamp-lit (graded warm-neutral at 4600 K), the treatment room daylit
  if (ctx.cinematic?.grade) ctx.cinematic.grade.whiteBalance = sh.wb ?? 4600;
  const { sun } = S;
  const c = sh.room ? ROOM2 : [0, 0, 0];
  sun.target.position.set(c[0], 0, c[2]);
  sun.position.copy(sun.target.position).addScaledVector(SUN, 30);
  const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 5; sc.far = 70; sc.updateProjectionMatrix();
}
