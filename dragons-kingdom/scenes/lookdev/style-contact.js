// Contact sheet of the set-building library's own models (scenes/lib/sets), PROVISIONAL designs,
// under one neutral photographed daylight sky (Poly Haven kloofendal_48d_partly_cloudy, CC0) on a
// plain ground scan. One shot per second (t = k + 0.5, or a 1-fps sequence):
//   0  the trading ship (sets/ship.js knarr) three-quarter from the bow, sail set
//   1  the ship broadside (sail shape, rigging, clinker hull, side rudder)
//   2  a festival market stall (sets/props.js marketStall: oak trestles, cloth awning, goods)
//   3  market food close-up (sets/props.js goods: bread, rolls, apples, onions, cheese, fish, veg)
//   4  vegetation and ground (sets/grass.js tufts, sets/scatter.js bushes and rocks)
//   5  a leather mounting strap over a rail (sets/props.js strapRibbon)
// The style frames F1-F5 are this library's in-context hero angles.
//   node render/render.mjs --still scenes/lookdev/style-contact.js --time 0.5 --preset final --png ship.png
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { groundMaterial, reviewTime } from '../lib/humans/stage.js';
import { knarr } from '../lib/sets/ship.js';
import { townKit, clothMaterial, clothSheet } from '../lib/sets/town.js';
import { foodMaterials, goods, marketStall, strapRibbon } from '../lib/sets/props.js';
import { grassField } from '../lib/sets/grass.js';
import { scatter, bushGeometry, rockGeometry, foliageMaterial } from '../lib/sets/scatter.js';
import { worldMaterial } from '../lib/sets/materials.js';
import { Kit, block, yawFrame, sub, makeRand } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { crate, sack, barrel } from '../lib/architecture/dressing.js';
import { filmFinish } from './finish.js';

// stations along x (each model on its own patch of ground)
const ST = { ship: [0, 0], stall: [60, 0], food: [80, 0], veg: [100, 0], strap: [120, 0] };
const SHOTS = [
  { p: [ST.ship[0] + 15, 4.5, 17], t: [ST.ship[0], 5.0, 0], fl: 24 },
  { p: [ST.ship[0] + 1, 4.0, 30], t: [ST.ship[0], 4.6, 0], fl: 28 },
  { p: [ST.stall[0] + 2.2, 1.7, 5.2], t: [ST.stall[0], 1.2, 0], fl: 28 },
  { p: [ST.food[0] + 0.15, 1.75, 1.3], t: [ST.food[0], 0.95, 0.05], fl: 40 },
  { p: [ST.veg[0] + 2, 1.4, 6], t: [ST.veg[0], 0.3, 0], fl: 28 },
  { p: [ST.strap[0] + 0.6, 1.2, 1.6], t: [ST.strap[0], 0.7, 0], fl: 35 },
];

export const meta = {
  title: 'Sets library - contact sheet (PROVISIONAL)',
  duration: SHOTS.length,
  seed: 61,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.2, apDistanceScale: 1.0 },
    shadows: { cascades: 2, maxDistance: 60 },
    ao: { enabled: true, radius: 0.4 },
    dof: { samples: 32 },
    grade: { exposure: 1.1, whiteBalance: 6000, contrast: 1.04 },
    motionBlur: { accumulateSamples: 4 },
  }),
};

let S;
export async function setup(ctx) {
  const { scene, camera } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: 2.2 });
  const sun = sky.apply(scene);
  sun.intensity *= 1.3;
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);
  scene.environmentIntensity = 0.9;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), await groundMaterial('pbr/acg_ground037', ctx, [400, 200], { tint: [0.8, 0.82, 0.75] }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // 0-1: the ship on chocks (a dry hard: the hull, keel and rudder all show)
  const ship = await knarr(ctx, { sailFill: 1.6, brace: -0.3 });
  ship.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  ship.root.position.set(ST.ship[0], 1.25, ST.ship[1]);
  scene.add(ship.root);
  const chock = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.15, 0.1), roughness: 0.9 });
  for (const x of [-4, 0, 4]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2.4), chock); c.position.set(ST.ship[0] + x, 0.25, ST.ship[1]); c.castShadow = c.receiveShadow = true; scene.add(c); }

  // 2-3: the market stall and the goods
  const M = await archMaterials(ctx);
  const props = new Kit(0);
  const food = foodMaterials();
  food.wicker = await loadPBR('pbr/khr_wicker', ctx, { repeat: [10, 2], color: new THREE.Color(0.75, 0.62, 0.45) });
  food.board = await loadPBR('pbr/acg_planks21', ctx, { repeat: [1, 1], color: new THREE.Color(0.5, 0.42, 0.34) });
  const A = { block, yawFrame, sub, makeRand, crate, sack, barrel };
  scene.add(marketStall(props, A, { clothMaterial, clothSheet }, food, ST.stall, 0, { goods: ['bread', 'apples', 'cheese'], color: [0.3, 0.055, 0.035], color2: [0.46, 0.41, 0.31], stripe: 2.6, seed: 3, w: 3.2 }));
  scene.add(props.build(M, { name: 'stall' }));
  const kinds = ['bread', 'rolls', 'apples', 'onions', 'cheese', 'fish', 'veg'];
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.2), food.board);
  table.position.set(ST.food[0], 0.84, ST.food[1]); table.castShadow = table.receiveShadow = true; scene.add(table);
  kinds.forEach((k, i) => { const g = goods(k, food, 7 + i, { w: 0.5, d: 0.36 }); g.position.set(ST.food[0] - 0.85 + (i % 4) * 0.56, 0.87, ST.food[1] - 0.25 + Math.floor(i / 4) * 0.5); scene.add(g); });

  // 4: vegetation and rocks
  scene.add(grassField({ count: 6000, height: [0.08, 0.45], seed: 3, color: [0.05, 0.072, 0.022], dry: [0.2, 0.17, 0.085], dryAmount: 0.5, place: (rng) => [ST.veg[0] + (rng() - 0.5) * 8, 0, ST.veg[1] + (rng() - 0.5) * 6] }));
  scene.add(scatter(bushGeometry(3, 2), foliageMaterial({ color: [0.04, 0.065, 0.025], leafScale: 4, flower: [0.55, 0.42, 0.04, 0.4] }), 6, (rng) => ({ p: [ST.veg[0] - 2.5 + rng() * 5, 0, ST.veg[1] - 2 - rng()], s: [1 + rng(), 0.8 + rng() * 0.4, 1 + rng()], c: [1, 1, 1] }), 5));
  const rockMat = await worldMaterial(ctx, 'pbr/acg_rock26', { mode: 'triplanar', scale: 1.2, tint: [0.6, 0.58, 0.55] });
  scene.add(scatter(rockGeometry(4, 3), rockMat, 5, (rng) => ({ p: [ST.veg[0] - 1.5 + rng() * 3, 0, ST.veg[1] + rng() * 1.5], s: [0.4 + rng() * 0.4, 0.3 + rng() * 0.2, 0.4 + rng() * 0.3], c: [1, 1, 1] }), 8));

  // 5: a leather strap hanging over a rail
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 12), food.board);
  rail.rotation.z = Math.PI / 2; rail.position.set(ST.strap[0], 1.0, ST.strap[1]); rail.castShadow = true; scene.add(rail);
  const strapMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.045, 0.028, 0.017), roughness: 0.62 });
  const pts = [[-0.3, 0.4, 0.05], [-0.1, 0.95, 0.06], [0, 1.06, 0], [0.1, 0.95, -0.06], [0.2, 0.35, -0.04]].map(([x, y, z]) => new THREE.Vector3(ST.strap[0] + x, y, ST.strap[1] + z));
  const strap = new THREE.Mesh(strapRibbon(new THREE.CatmullRomCurve3(pts), 0.075, 0.008, 64, new THREE.Vector3(0, 0, 1)), strapMat);
  strap.castShadow = true; scene.add(strap);

  camera.near = 0.05; camera.far = 3000;
  S = { sun, sunDir: sky.sun.direction.clone() };
}

export function update(t, ctx) {
  const rt = reviewTime(t, ctx);
  const sh = SHOTS[Math.min(SHOTS.length - 1, Math.max(0, rt.k))];
  const cam = ctx.camera;
  cam.position.set(...sh.p); cam.lookAt(...sh.t); cam.updateMatrixWorld(true);
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = sh.fl;
  ctx.lens.fstop = 5.6;
  ctx.lens.focus = new THREE.Vector3(...sh.p).distanceTo(new THREE.Vector3(...sh.t));
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 400;
  const { sun, sunDir } = S;
  sun.target.position.set(sh.t[0], 0, sh.t[2]);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 80);
}
