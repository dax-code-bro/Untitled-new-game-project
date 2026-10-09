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

let S;
const ROW_TREES = ['hawthorn', 'hawthorn', 'sycamore', 'oak', 'ash', 'pine'];

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
  // trees in a row along x, 22 m apart
  const kits = {};
  for (const [i, sp] of ROW_TREES.entries()) {
    const expo = i === 0 ? 0.95 : 0;
    const k = await treeKit(ctx, sp, { variants: 1, exposure: expo, seed: i });
    kits[i] = k;
    const t = k.instance(0, 0);
    t.position.set(i * 22 - 55, 0, 0);
    scene.add(t);
  }
  // shrubs, z = 40 row: the near (card) models in front, the far (clump) LOD behind each
  const shrubs = ['gorse', 'heather', 'bracken', 'blackthorn'];
  const clumpKind = { gorse: 'gorse', heather: 'heather', bracken: 'bracken', blackthorn: 'scrub' };
  const sizes = { gorse: [1.8, 1.0], heather: [1.0, 0.35], bracken: [1.4, 0.9], blackthorn: [3.2, 2.0] };
  for (const [i, k] of shrubs.entries()) {
    const kit = await treeKit(ctx, k, { variants: 2, exposure: 0.5, seed: i });
    for (let v = 0; v < 2; v++) {
      const t = kit.instance(0, v);
      t.position.set(i * 6 - 10.5 + v * 2.4, 0, 41 + v * 0.8);
      scene.add(t);
    }
    const m = new THREE.Mesh(shrubGeometry(clumpKind[k], 2, 3), foliageMaterial(clumpKind[k]));
    const [w, h] = sizes[k];
    m.scale.set(w, h, w);
    m.position.set(i * 6 - 9.3, 0, 36.5);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  const th = thriftGeometry(2);
  for (let v = 0; v < 5; v++) {
    const c = new THREE.Mesh(th.cushion, foliageMaterial('thrift')); c.scale.setScalar(0.22); c.position.set(12 + v * 0.45, 0, 39 + (v % 2) * 0.4); c.receiveShadow = true; scene.add(c);
  }
  scene.add(grassField({ count: 5000, seed: 3, height: [0.08, 0.3], place: (r) => [10 + r() * 6, 0, 37 + r() * 6] }));
  // rocks, z = 70 row
  const W = await verdorWorld();
  const rmat = await landscapeMaterial(ctx, { world: W, rockOnly: true });
  const kit = rockKit({ variants: 4 });
  const kinds = ['block', 'slab', 'cobble', 'outcrop'];
  for (const [i, k] of kinds.entries()) for (let v = 0; v < 4; v++) {
    const m = new THREE.Mesh(kit.get(k, v, 0), rmat);
    const s = k === 'cobble' ? 0.6 : k === 'outcrop' ? 2.6 : 1.8;
    m.scale.setScalar(s);
    m.position.set(i * 7 - 10 + (v % 2) * 2.6, 22 + 0.3 * s, 70 + Math.floor(v / 2) * 2.6);   // y = 22: above the splash zone
    m.rotation.y = v * 1.3;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 16), new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.9 }));
  plinth.position.set(0, 21.5, 72); plinth.receiveShadow = true; scene.add(plinth);
  camera.near = 0.1; camera.far = 5000;
  S = { sun, SUN: sky.sun.direction.clone() };
}

export function update(t, ctx) {
  const cam = ctx.camera;
  const i = Math.floor(t);
  let pos, look, f = 35;
  if (i <= 1) { pos = [0, 8, 96]; look = [0, 6.5, 0]; f = 24; }
  else if (i === 2) { pos = [0, 3.0, 50]; look = [0, 0.6, 39]; f = 30; }
  else if (i === 3) { pos = [0, 29, 84]; look = [0, 22.4, 72]; f = 32; }
  else if (i === 4) { pos = [-55 + 6.5, 2.2, 9.5]; look = [-55, 2.6, 0]; f = 35; }
  else { const a = (t - 5) * Math.PI * 2; pos = [-55 + Math.sin(a) * 12, 3.5, Math.cos(a) * 12]; look = [-55, 2.5, 0]; f = 35; }
  cam.position.set(...pos); cam.lookAt(...look); cam.updateMatrixWorld(true);
  const tgt = new THREE.Vector3(...look);
  S.sun.target.position.copy(tgt);
  S.sun.position.copy(tgt).addScaledVector(S.SUN, 200);
  ctx.lens.sensor = 'super35'; ctx.lens.focalLength = f; ctx.lens.fstop = 8;
  ctx.lens.focus = cam.position.distanceTo(tgt);
  ctx.lens.iso = 200; ctx.lens.shutterAngle = 180;
}
