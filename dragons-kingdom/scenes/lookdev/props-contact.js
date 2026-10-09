// Props - contact sheet (PROVISIONAL designs): every prop group of the library under the same
// neutral daylight (CC0 HDRI, sun keyed from camera left), one group per second, framed 3/4 by
// its bounding box. A 1-fps sequence gives one frame per group; tile them into a sheet:
//   node render/render.mjs scenes/lookdev/props-contact.js --preset preview --fps 1 --cinematic velocity
//   (one group:  --still --time 3.5 --preset final --png crates.png)
// turntable: render at 24 fps instead - within each second the camera circles the group once.
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial, reviewTime } from '../lib/humans/stage.js';
import { Kit, rng, sub, yawFrame, fp } from '../lib/props/core.js';
import { festivalKit, DYES } from '../lib/props/festival.js';
import { barrel, bucket, crate, basket, trestleTable, bench, stool, handcart } from '../lib/props/containers.js';
import { loaf, fruit, fruitHeap, cabbage, onion, rootVeg, fish, cheese, egg, pot, clothBolt, herbBunch, onionString } from '../lib/props/goods.js';
import { prologueBoat } from '../lib/props/boat.js';
import { santaMaria } from '../lib/props/santa-maria.js';
import { verdorKit, bowl, foldedCloth, oilLamp, healerBox, groundGear } from '../lib/props/verdor.js';
import { filmFinish } from './finish.js';

const SPACING = 45;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const GROUPS = [
  { name: 'barrels-buckets', build: (fk, F, r) => { const k = new Kit(); barrel(k, sub(F, [-0.7, 0, 0]), r, { h: 0.82, r: 0.26, hoops: 'iron' }); barrel(k, sub(F, [0.0, 0, -0.35]), r, { h: 0.9, r: 0.28, hoops: 'withy' }); barrel(k, sub(F, [0.65, 0, 0.15]), r, { h: 0.45, r: 0.17, hoops: 'iron' }); bucket(k, sub(F, [0.3, 0, 0.75]), r, { handle: 'rope' }); bucket(k, sub(F, [-0.4, 0, 0.8]), r, { handle: 'iron', hoops: 'withy' }); barrel(k, sub(F, [1.4, 0, -0.2]), r, { h: 0.45, r: 0.33, bilge: 1.05, open: true, hoops: 'withy', bung: false }); return fk.build(k, 'barrels'); } },
  { name: 'crates', build: (fk, F, r) => { const k = new Kit(); crate(k, sub(F, [-0.6, 0, 0], 0.1), r, {}); crate(k, sub(F, [0.25, 0, -0.1], -0.2), r, { slats: false, lid: 'on', mat: 'pale' }); crate(k, sub(F, [-0.55, 0.39, 0.02], 0.15), r, { w: 0.5, d: 0.36, h: 0.3, lid: 'none' }); const c = crate(k, sub(F, [1.0, 0, 0.3], 0.5), r, { lid: 'leaning' }); fruitHeap(k, c.inside, r, 26, { r: 0.18, sx: 1.4, maxH: 0.32 }); crate(k, sub(F, [-0.1, 0, 0.8], -0.6), r, { broken: 0.8 }); return fk.build(k, 'crates'); } },
  { name: 'baskets', build: (fk, F, r) => { const k = new Kit(); const a = basket(k, sub(F, [-0.6, 0, 0]), r, { r: 0.24, rb: 0.18, h: 0.26, handle: 'arch' }); fruitHeap(k, sub(a.inside, [0, 0.12, 0]), r, 20, { r: 0.2, maxH: 0.12 }); const b = basket(k, sub(F, [0.2, 0, 0.1]), r, { r: 0.2, rb: 0.17, h: 0.09, sx: 1.4, handle: 'ears' }); for (let i = 0; i < 4; i++) fish(k, sub(b.inside, [(r() - 0.5) * 0.08, 0.01 + i * 0.01, (i - 1.5) * 0.07], (r() - 0.5) * 0.3), r, { l: 0.3 }); const c = basket(k, sub(F, [0.9, 0, -0.2]), r, { r: 0.22, rb: 0.2, h: 0.4 }); fruitHeap(k, sub(c.inside, [0, 0.3, 0]), r, 16, { kind: 'onion', r: 0.19, maxH: 0.08 }); const d = basket(k, sub(F, [-0.1, 0, -0.6]), r, { r: 0.21, rb: 0.17, h: 0.07 }); for (let i = 0; i < 6; i++) loaf(k, sub(d.inside, [(r() - 0.5) * 0.22, 0, (r() - 0.5) * 0.22], r() * 6), r, { kind: 'roll' }); return fk.build(k, 'baskets'); } },
  { name: 'sacks-ropes', build: (fk, F, r) => { const k = new Kit(); fk.sack(k, sub(F, [-0.5, 0, 0], 0.3), r, { kind: 'full' }); fk.sack(k, sub(F, [0.1, 0, -0.15], 1.2), r, { kind: 'full' }); fk.sack(k, sub(F, [0.6, 0, 0.3], 2.0), r, { kind: 'slump' }); fk.sack(k, sub(F, [-0.2, 0, 0.6], 0.4), r, { kind: 'lying' }); fk.ropeCoil(k, sub(F, [1.2, 0, -0.3]), r, { r: 0.24, rope: 0.013, laid: true }); return fk.build(k, 'sacks'); } },
  { name: 'food', build: (fk, F, r) => { const k = new Kit(); trestleTable(k, F, r, { w: 2.0, d: 0.75, h: 0.76, mat: 'pale' }); const T = sub(F, [0, 0.761, 0]); for (let i = 0; i < 4; i++) loaf(k, sub(T, [-0.85 + i * 0.16, 0, -0.15], r() * 6), r, { kind: i === 3 ? 'plait' : undefined }); for (let i = 0; i < 5; i++) fruit(k, sub(T, [-0.2 + (i % 3) * 0.08, 0, 0.18 + Math.floor(i / 3) * 0.08], r() * 6), r, {}); for (let i = 0; i < 2; i++) cabbage(k, sub(T, [0.1 + i * 0.2, 0, -0.18], r() * 6), r); for (let i = 0; i < 4; i++) rootVeg(k, sub(T, [0.45, 0.002 + i * 0.012, 0.15 + i * 0.03], 0.3), r, { kind: i % 2 ? 'carrot' : 'leek' }); for (let i = 0; i < 3; i++) onion(k, sub(T, [0.5 + i * 0.07, 0, -0.1]), r); for (let i = 0; i < 2; i++) fish(k, sub(T, [0.78, 0.004 + i * 0.012, 0.2 - i * 0.07], 0.1), r, {}); cheese(k, sub(T, [-0.55, 0, 0.22]), r); for (let i = 0; i < 5; i++) egg(k, sub(T, [-0.32 + i * 0.05, 0, 0.3], 0, Math.PI / 2 - 0.2, 0), r); return fk.build(k, 'food'); } },
  { name: 'pottery', build: (fk, F, r) => { const k = new Kit(); const kinds = ['jug', 'pitcher', 'pot', 'bowl', 'cup', 'jug', 'pot', 'bowl']; kinds.forEach((kd, i) => pot(k, sub(F, [-0.75 + (i % 4) * 0.48, 0, Math.floor(i / 4) * 0.45 - 0.2], r() * 6), r, { kind: kd, glaze: i % 3 === 0 ? 0 : 0.7, dark: i === 6 })); return fk.build(k, 'pottery'); } },
  { name: 'cloth-bolts', build: (fk, F, r) => { const k = new Kit(); trestleTable(k, F, r, { w: 1.6, d: 0.7, h: 0.76, mat: 'oak' }); for (let i = 0; i < 5; i++) clothBolt(k, sub(F, [0, 0.761 + Math.floor(i / 3) * 0.12, -0.2 + (i % 3) * 0.17], 0.05 * (i - 2)), r, { l: 1.2, mat: 'bolt' + (1 + i) }); return fk.build(k, 'bolts'); } },
  { name: 'furniture-cart', build: (fk, F, r) => { const k = new Kit(); bench(k, sub(F, [-1.2, 0, 0.7]), r, {}); stool(k, sub(F, [-1.6, 0, -0.2]), r, {}); trestleTable(k, sub(F, [-1.2, 0, -0.2]), r, { w: 1.4, d: 0.6 }); const c = handcart(k, sub(F, [1.0, 0, 0], -0.4), r, {}); barrel(k, sub(c.bed, [-0.3, 0, 0]), r, { h: 0.5, r: 0.18 }); fk.sack(k, sub(c.bed, [0.35, 0, 0.1], 0.3), r, { kind: 'lying' }); return fk.build(k, 'cart'); } },
  { name: 'lantern-instruments', build: (fk, F, r) => { const k = new Kit(); fk.lantern(k, sub(F, [-1.0, 0, 0.3]), r, {}); fk.lantern(k, sub(F, [-0.7, 0, 0.4], 0.5), r, { size: 0.32 }); fk.instruments(k, sub(F, [-0.3, 0, 0]), r); return fk.build(k, 'music'); } },
  { name: 'breakables', build: (fk, F, r) => { const k = new Kit(); fk.breakables(k, sub(F, [-0.6, 0, 0], 0.2), r, 'beam', { l: 1.6, ends: [1] }); fk.breakables(k, sub(F, [-0.3, 0, 0.6], -0.4), r, 'beam', { l: 1.0, ends: [-1, 1], h: 0.12, w: 0.12 }); fk.breakables(k, sub(F, [0.6, 0, -0.4], 0.9), r, 'board', { l: 0.8, ends: [-1] }); for (let i = 0; i < 6; i++) fk.breakables(k, sub(F, [0.6 + (i % 3) * 0.3, 0, 0.3 + Math.floor(i / 3) * 0.3], r() * 6), r, i < 2 ? 'tile' : 'tileShard'); fk.breakables(k, sub(F, [0.2, 0, 0.2]), r, 'splinters', { n: 18 }); return fk.build(k, 'breakables'); } },
  { name: 'bunting-banners', build: async (fk, F, r) => { const g = new THREE.Group(); g.add(await fk.bunting(fp(F, -3.2, 3.2, 0), fp(F, 3.2, 3.0, 0.4), { seed: 3 })); const cols = [[DYES.madder, DYES.weld], [DYES.woad, DYES.undyed], [DYES.green, DYES.weld]]; for (const [i, kk] of ['still', 'breeze', 'gust'].entries()) g.add(await fk.banner(sub(F, [-1.6 + i * 1.6, 0.2, -1.2]), kk, { colors: cols[i] })); return g; }, el: 0.05 },
  { name: 'stall-bread', build: (fk, F) => fk.stall(F, 'bread', { seed: 5, size: '3' }), el: 0.1 },
  { name: 'stall-fish', build: (fk, F) => fk.stall(F, 'fish', { seed: 6, size: '24', awning: [DYES.woad, DYES.undyed] }), el: 0.1 },
  { name: 'stall-pottery', build: (fk, F) => fk.stall(F, 'pottery', { seed: 8, size: '3', awning: [DYES.ochre, DYES.undyed] }), el: 0.1 },
  { name: 'stall-cloth', build: (fk, F) => fk.stall(F, 'cloth', { seed: 9, size: '24', awning: [DYES.madder, DYES.madder] }), el: 0.1 },
  { name: 'stall-veg', build: (fk, F) => fk.stall(F, 'veg', { seed: 11, size: '3', awning: [DYES.green, DYES.undyed] }), el: 0.1 },
  { name: 'verdor-egg-states', build: async (fk, F, r, ctx) => { const vk = await verdorKit(ctx); const g = new THREE.Group(); ['closed', 'cracked', 'opened', 'broken'].forEach((st, i) => g.add(vk.egg(sub(F, [-1.2 + i * 0.8, 0, 0]), { state: st, seed: 7 }))); return g; }, el: 0.25 },
  { name: 'verdor-nest', build: async (fk, F, r, ctx) => { const vk = await verdorKit(ctx); const g = new THREE.Group(); g.add(vk.nest(F, { r: 0.75 })); g.add(vk.egg(sub(F, [0, 0.05, 0]), { state: 'opened', seed: 7 })); return g; }, el: 0.4 },
  { name: 'verdor-chamber', build: async (fk, F, r, ctx) => { const vk = await verdorKit(ctx); const k = new Kit(); bench(k, F, r, { w: 1.6 }); const T = sub(F, [0, 0.45, 0]); bowl(k, sub(T, [-0.55, 0, 0]), r, {}); bowl(k, sub(T, [-0.25, 0, 0.02]), r, { kind: 'wood', r: 0.12 }); foldedCloth(k, sub(T, [0.15, 0, 0], 0.1), r, {}); foldedCloth(k, sub(T, [0.15, 0.028, 0], -0.05), r, { w: 0.34, d: 0.26 }); foldedCloth(k, sub(T, [0.15, 0.052, 0], 0.12), r, { w: 0.3, d: 0.24, layers: 3 }); oilLamp(k, sub(T, [0.55, 0, 0]), r, { flame: true }); oilLamp(k, sub(F, [0.9, 0, 0.3], 1.2), r, {}); stool(k, sub(F, [-1.2, 0, 0.3]), r, {}); bowl(k, sub(F, [-1.2, 0.42, 0.3]), r, { r: 0.16 }); return vk.build(k, 'chamber'); }, el: 0.35 },
  { name: 'verdor-healer', build: async (fk, F, r, ctx) => { const vk = await verdorKit(ctx); const k = new Kit(); trestleTable(k, F, r, { w: 1.6, d: 0.7, h: 0.76 }); healerBox(k, sub(F, [-0.1, 0.761, 0]), r, {}); bowl(k, sub(F, [0.55, 0.761, 0.15]), r, { r: 0.15 }); return vk.build(k, 'healer'); }, el: 0.4 },
  { name: 'verdor-ground-gear', build: async (fk, F, r, ctx) => { const vk = await verdorKit(ctx); const k = new Kit(); groundGear(k, F, r, {}); fk.ropeCoil(k, sub(F, [0.6, 0, 0.8]), r, { r: 0.3, rope: 0.016, laid: true }); bucket(k, sub(F, [-0.6, 0, 0.8]), r, { handle: 'rope' }); return vk.build(k, 'gear'); }, el: 0.2 },
  { name: 'santa-maria', build: async (fk, F, r, ctx) => { const sm = await santaMaria(ctx, { waterline: 2.15 }); sm.root.position.copy(F.o).add(V(0, 2.15, 0)); return sm.root; }, el: 0.1, az: 2.3, extra: 0.8 },
  { name: 'prologue-boat', build: async (fk, F, r, ctx) => { const b = await prologueBoat(ctx, { brace: -0.35 }); b.root.position.copy(F.o).add(V(0, 0.66, 0)); return b.root; }, el: 0.12, extra: 0.85 },
];

export const meta = {
  title: 'Props - contact sheet (PROVISIONAL)',
  duration: GROUPS.length,
  seed: 21,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 0.6, apDistanceScale: 1.0 },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.5 },
    dof: { samples: 32 },
    grade: { exposure: 0.45, whiteBalance: 6000 },
  }),
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.015;
  scene.add(sun, sun.target);
  const GW = SPACING * GROUPS.length + 200;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW, 300), await groundMaterial('pbr/acg_ground27', ctx, [GW, 300], { tint: [0.8, 0.78, 0.74] }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(SPACING * (GROUPS.length - 1) / 2, 0, 0); ground.receiveShadow = true; scene.add(ground);
  const fk = await festivalKit(ctx);
  const shots = [];
  for (const [i, g] of GROUPS.entries()) {
    const F = yawFrame([i * SPACING, 0, 0], 0);
    const r = rng(100 + i);
    const obj = await g.build(fk, F, r, ctx);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    let tris = 0; obj.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    console.warn(`[props-contact] ${g.name}: ${Math.round(tris)} tris`);
    shots.push({ ...g, box, cx: i * SPACING });
  }
  S = { sun, shots };
}

export function update(t, ctx) {
  const rt = reviewTime(t, ctx);
  const sh = S.shots[Math.min(S.shots.length - 1, Math.max(0, rt.k))];
  const cam = ctx.camera;
  const c = sh.box.getCenter(new THREE.Vector3());
  const sz = sh.box.getSize(new THREE.Vector3());
  const R = 0.5 * Math.hypot(sz.x, sz.y, sz.z) * (sh.extra || 1);
  const fov = 30;
  const dist = (R / Math.tan((fov * Math.PI) / 360)) * 0.8;
  const az = (sh.az ?? 0.6) + (rt.frac || 0) * Math.PI * 2;
  const el = sh.el ?? 0.32;
  cam.position.set(c.x + Math.sin(az) * Math.cos(el) * dist, Math.max(0.5, c.y + Math.sin(el) * dist), c.z + Math.cos(az) * Math.cos(el) * dist);
  cam.lookAt(c.x, c.y, c.z);
  cam.fov = fov; cam.near = 0.05; cam.far = dist * 6 + 300;
  cam.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 11; ctx.lens.focus = dist; ctx.lens.shutterAngle = 45; }
  const key = az + 0.8;
  const sd = new THREE.Vector3(Math.sin(key) * 0.66, 0.75, Math.cos(key) * 0.66).normalize();
  const { sun } = S;
  sun.target.position.copy(c);
  sun.position.copy(c).addScaledVector(sd, R * 4 + 30);
  const scm = sun.shadow.camera; const r = R * 1.5;
  scm.left = -r; scm.right = r; scm.top = r; scm.bottom = -r; scm.near = 1; scm.far = R * 8 + 80; scm.updateProjectionMatrix();
}
