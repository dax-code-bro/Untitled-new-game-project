// Nature lookdev - contact sheet of the landscape models under a neutral photographed daylight sky
// (Poly Haven kloofendal_48d_partly_cloudy). PROVISIONAL designs, not approved.
// One view per second:
//   t = 1  trees: hawthorn (clifftop, wind-flagged), hawthorn (sheltered), sycamore, oak, ash, Scots pine
//   t = 2  shrubs: gorse, heather, bracken, blackthorn scrub, thrift; geometry grass
//   t = 3  rocks: fallen limestone blocks, slabs, sea-worn cobbles, clifftop outcrops (rock-only landscape shader)
//   t = 4  the hawthorn (clifftop form) close, three-quarter back light
//   t = 5  turntable of the clifftop hawthorn (t 5..6 = one turn)
//
//   node render/render.mjs --still scenes/lookdev/nature-contact.js --time 1 --preset final --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { treeKit } from '../lib/nature/trees.js';
import { shrubGeometry, foliageMaterial, thriftGeometry } from '../lib/nature/plants.js';
import { rockKit } from '../lib/nature/rocks.js';
import { landscapeMaterial } from '../lib/nature/materials.js';
import { verdorWorld } from '../lib/nature/coast.js';
import { grassField } from '../lib/sets/grass.js';
import { worldMaterial } from '../lib/sets/materials.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'Nature lookdev - contact sheet',
  duration: 7,
  seed: 3,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.0 },
    shadows: { cascades: 2, maxDistance: 120 },
    ao: { enabled: true, radius: 1.0 },
    dof: { samples: 32 },
    grade: { exposure: 1.9, whiteBalance: 6200, contrast: 1.08 },
  }),
};

let S, S0;
const ROW_TREES = ['hawthorn', 'hawthorn', 'sycamore', 'oak', 'ash', 'pine'];
const TREE_X = (i) => i * 11 - 27.5;

export async function setup(ctx) {
  const { scene, camera } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: 2.2 });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);
  // a neutral ground: short turf
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), await worldMaterial(ctx, 'pbr/acg_ground037', { mode: 'top', tint: [0.55, 0.62, 0.42], macro: 0.5, antiTile: 0.6 }));
  ground.receiveShadow = true;
  scene.add(ground);
  // trees in a row along x, 14 m apart
  const kits = {};
  for (const [i, sp] of ROW_TREES.entries()) {
    const expo = i === 0 ? 0.95 : 0;
    const k = await treeKit(ctx, sp, { variants: 1, exposure: expo, seed: i });
    kits[i] = k;
    const t = k.instance(0, 0);
    t.position.set(TREE_X(i), 0, 0);
    scene.add(t);
  }
  // shrubs, z = 38..44: one column per species, the two near (card) models in front, the far
  // (clump) LOD behind; the last column holds thrift cushions and the geometry grass
  const shrubs = ['gorse', 'heather', 'bracken', 'blackthorn'];
  const clumpKind = { gorse: 'gorse', heather: 'heather', bracken: 'bracken', blackthorn: 'scrub' };
  const sizes = { gorse: [1.8, 1.0], heather: [1.0, 0.35], bracken: [1.4, 0.9], blackthorn: [3.0, 2.0] };
  const COL = (i) => i * 3.6 - 7.2;
  for (const [i, k] of shrubs.entries()) {
    const kit = await treeKit(ctx, k, { variants: 2, exposure: 0.5, seed: i });
    for (let v = 0; v < 2; v++) {
      const t = kit.instance(0, v);
      t.position.set(COL(i) + (v ? 0.7 : -0.5), 0, v ? 41.2 : 44);
      t.rotation.y = v * 2.1;
      scene.add(t);
    }
    const m = new THREE.Mesh(shrubGeometry(clumpKind[k], 2, 3), foliageMaterial(clumpKind[k]));
    const [w, h] = sizes[k];
    m.scale.set(w, h, w);
    m.position.set(COL(i), 0, 38);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  const th = thriftGeometry(2);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xd98aa6, roughness: 0.8 });
  for (let v = 0; v < 7; v++) {
    const c = new THREE.Mesh(th.cushion, foliageMaterial('thrift')); c.scale.setScalar(0.2 + 0.05 * (v % 3)); c.position.set(COL(4) - 0.9 + (v % 4) * 0.55, 0, 43.6 - Math.floor(v / 4) * 0.7); c.receiveShadow = c.castShadow = true; scene.add(c);
    for (const hg of th.heads) { const hh = new THREE.Mesh(hg, headMat); hh.scale.copy(c.scale); hh.position.copy(c.position); hh.castShadow = true; scene.add(hh); }
  }
  scene.add(grassField({ count: 9000, seed: 3, height: [0.08, 0.32], place: (r) => [COL(4) - 1.4 + r() * 2.8, 0, 37 + r() * 4.8] }));
  // rocks on a plinth whose top stands 7.5 m above high water (the splash zone: the same
  // lichen zonation as the talus at the cliff foot); one column per kind, four variants each
  const W = await verdorWorld();
  const rmat = await landscapeMaterial(ctx, { world: W, rockOnly: true });
  const kit = rockKit({ variants: 4 });
  const kinds = ['block', 'slab', 'cobble', 'outcrop'];
  const PL = W.VERDOR.tide.high + 7.5;
  for (const [i, k] of kinds.entries()) for (let v = 0; v < 4; v++) {
    const g = kit.get(k, v, 0);
    const m = new THREE.Mesh(g, rmat);
    const s = k === 'cobble' ? 0.55 : k === 'outcrop' ? 2.8 : k === 'slab' ? 2.2 : 2.0;
    m.scale.setScalar(s);
    m.rotation.y = v * 1.3 + 0.4;
    const col = [-7.5, -2.6, 1.6, 6.4][i];
    m.position.set(col + (v % 2) * (k === 'cobble' ? 0.9 : 2.3), PL - g.boundingBox.min.y * s - (k === 'outcrop' ? 0.12 * s : 0.03), 69 + Math.floor(v / 2) * (k === 'cobble' ? 0.9 : 2.4));
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(26, 1, 10), new THREE.MeshStandardMaterial({ color: 0x77776f, roughness: 0.92 }));
  plinth.position.set(0, PL - 0.5, 70.5); plinth.receiveShadow = true; scene.add(plinth);
  S0 = { PL };
  camera.near = 0.1; camera.far = 5000;
  S = { sun, SUN: sky.sun.direction.clone() };
}

export function update(t, ctx) {
  const cam = ctx.camera;
  // shots switch a quarter second before each whole second, so a still at t = N (whose motion-blur
  // subframes straddle N) never mixes two shots
  const i = Math.floor(t + 0.25);
  let pos, look, f = 35;
  const hx = TREE_X(0), pl = S0.PL;
  if (i <= 1) { pos = [0, 4.5, 62]; look = [0, 7.5, 0]; f = 22; }   // in front of the rock plinth (z 65..76)
  else if (i === 2) { pos = [0, 2.9, 57]; look = [0, 0.5, 41]; f = 22; }
  else if (i === 3) { pos = [0, pl + 10.5, 88.5]; look = [0, pl + 0.6, 71]; f = 26; }
  else if (i === 4) { pos = [hx + 6.5, 2.2, 9.5]; look = [hx, 2.6, 0]; f = 35; }
  else { const a = (t - 5) * Math.PI * 2; pos = [hx + Math.sin(a) * 12, 3.5, Math.cos(a) * 12]; look = [hx, 2.5, 0]; f = 35; }
  cam.position.set(...pos); cam.lookAt(...look); cam.updateMatrixWorld(true);
  const tgt = new THREE.Vector3(...look);
  S.sun.target.position.copy(tgt);
  S.sun.position.copy(tgt).addScaledVector(S.SUN, 200);
  ctx.lens.sensor = 'super35'; ctx.lens.focalLength = f; ctx.lens.fstop = 8;
  ctx.lens.focus = cam.position.distanceTo(tgt);
  ctx.lens.iso = 200; ctx.lens.shutterAngle = 180;
}
