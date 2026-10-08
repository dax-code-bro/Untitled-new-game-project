// Architecture - contact sheet (PROVISIONAL designs): every model of the kit under the same
// neutral daylight (CC0 HDRI, sun keyed from camera left), one model per second, framed 3/4 by
// its bounding box. A 1-fps sequence gives one frame per model; tile them into a sheet:
//   node render/render.mjs scenes/lookdev/architecture-contact.js --preset preview --fps 1 --seconds 16 --cinematic velocity
//   (or a single model:  --still --time 8.5 --preset final --png stable.png)
// turntable: render at 24 fps instead - within each second the camera circles the model once.
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial, reviewTime } from '../lib/humans/stage.js';
import { Kit, frame, yawFrame } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { house } from '../lib/architecture/house.js';
import { archway, gateway, fountain, stonePier, kingsSteps } from '../lib/architecture/cling.js';
import { stable, keeperHouse, accessRig, leafPlatform, palace, harbor } from '../lib/architecture/verdor.js';
import { roundTower, conicalRoof } from '../lib/architecture/masonry.js';
import { loadCharacter, placeCharacter } from '../lib/humans/index.js';
import { filmFinish } from './finish.js';

const SPACING = 260;
const MODELS = [
  { name: 'house-front-gable', build: (k, F) => house(k, F, { w: 6.6, d: 9, storeys: 1, roof: 'front', seed: 101, cover: 'clay', lod: 'mid' }) },
  { name: 'house-two-jetties', build: (k, F) => house(k, F, { w: 6.0, d: 8.5, storeys: 2, roof: 'front', seed: 202, cover: 'slate', lod: 'mid' }) },
  { name: 'house-eaves-to-street', build: (k, F) => house(k, F, { w: 7.6, d: 8.0, storeys: 1, roof: 'side', seed: 303, cover: 'clay', lod: 'mid' }) },
  { name: 'cling-stone-arch', build: (k, F) => archway(k, F, { lod: 'mid' }) },
  { name: 'cling-gate', build: (k, F) => gateway(k, F, { lod: 'mid', wall: 3.6 }), az: 0.6 },
  { name: 'cling-fountain', build: (k, F) => fountain(k, F, { lod: 'mid' }) },
  { name: 'cling-stone-support', build: (k, F) => stonePier(k, F, { lod: 'mid' }), extra: 1.15 },
  { name: 'cling-kings-steps', build: (k, F) => kingsSteps(k, F, { lod: 'mid' }), az: 2.6 },
  { name: 'verdor-stable', build: (k, F) => stable(k, F, { lod: 'mid' }) },
  { name: 'verdor-keeper-lodge', build: (k, F) => keeperHouse(k, F, { lod: 'mid' }) },
  { name: 'verdor-access-rig', build: (k, F) => accessRig(k, F, { gangwayDrop: 2.0 }), person: 'remi', az: 0.9 },
  { name: 'verdor-leaf-platform', build: (k, F) => leafPlatform(k, F, {}), person: 'keeper1', extra: 1.15 },
  { name: 'verdor-harbour', build: (k, F) => harbor(k, F, { buildings: true }), az: 0.35, el: 0.18, waterline: true },
  { name: 'verdor-palace', build: (k, F) => palace(k, F, {}), el: 0.12 },
  { name: 'round-tower', build: (k, F) => { const t = roundTower(k, F, { r: 4.2, h: 18, lod: 'mid', mat: 'stonePale', dressedMat: 'stonePale', slits: 3 }); conicalRoof(k, frame([F[0], F[1] + t.top - 0.2, F[2]]), { r: t.R - 0.15, h: 8, eaves: 0.45 }); } },
  { name: 'cling-house-row', build: (k, F) => { let x = -10; for (let i = 0; i < 3; i++) { const w = [6.4, 5.6, 7.2][i]; house(k, frame([F[0] + x + w / 2, 0, F[2] + (i % 2) * 0.3]), { w, d: 8.5, storeys: i === 1 ? 2 : 1, roof: i === 2 ? 'side' : 'front', seed: 11 + i * 7, lod: 'mid', party: { left: i > 0, right: i < 2 } }); x += w + 0.05; } } },
];

export const meta = {
  title: 'Architecture - contact sheet (PROVISIONAL)',
  duration: MODELS.length,
  seed: 17,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 0.6, apDistanceScale: 1.0 },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.6 },
    dof: { samples: 32 },
    grade: { exposure: 0.55, whiteBalance: 6000 },
  }),
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: 0.0 });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.01;
  scene.add(sun, sun.target);
  const M = await archMaterials(ctx);
  const GW = SPACING * MODELS.length + 600;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW, 1200), await groundMaterial('pbr/acg_ground03', ctx, [GW, 1200]));
  ground.rotation.x = -Math.PI / 2; ground.position.set(SPACING * (MODELS.length - 1) / 2, -0.01, 0); ground.receiveShadow = true; scene.add(ground);
  const shots = [];
  for (const [i, m] of MODELS.entries()) {
    const kit = new Kit(0);
    m.build(kit, yawFrame([i * SPACING, 0, 0], 0));
    const g = kit.build(M, { name: m.name });
    scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    if (m.waterline) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), M.water);
      water.rotation.x = -Math.PI / 2; water.position.set(i * SPACING, 0.0, 40.5); scene.add(water);
    }
    let person = null;
    if (m.person) {
      try {
        person = await loadCharacter(m.person);
        placeCharacter(person, i * SPACING + (m.person === 'remi' ? -0.6 : 2.0), 0, m.person === 'remi' ? 3.6 : 1.2, m.person === 'remi' ? 0.6 : -0.6);
        scene.add(person.root);
      } catch (e) { console.warn('contact: no ' + m.person); }
    }
    shots.push({ ...m, box, cx: i * SPACING, person });
  }
  S = { sun, sunDir: sky.sun.direction.clone(), shots };
}

export function update(t, ctx) {
  const rt = reviewTime(t, ctx);
  const sh = S.shots[Math.min(S.shots.length - 1, Math.max(0, rt.k))];
  const cam = ctx.camera;
  const c = sh.box.getCenter(new THREE.Vector3());
  const sz = sh.box.getSize(new THREE.Vector3());
  const R = 0.5 * Math.hypot(sz.x, sz.y, sz.z) * (sh.extra || 1);
  const fov = 34;
  const dist = (R / Math.tan((fov * Math.PI) / 360)) * 0.78;
  // 3/4 view (or a turntable through the second at 24 fps)
  const az = (sh.az ?? 0.65) + (rt.frac || 0) * Math.PI * 2;
  const el = sh.el ?? 0.14;
  cam.position.set(c.x + Math.sin(az) * Math.cos(el) * dist, Math.max(1.4, c.y + Math.sin(el) * dist), c.z + Math.cos(az) * Math.cos(el) * dist);
  cam.lookAt(c.x, c.y, c.z);
  cam.fov = fov; cam.near = 0.1; cam.far = dist * 4 + 200;
  cam.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 11; ctx.lens.focus = dist; ctx.lens.shutterAngle = 45; }
  // the sun keys from camera left, ~40 degrees above
  const key = az + 0.75;
  const sd = new THREE.Vector3(Math.sin(key) * 0.68, 0.73, Math.cos(key) * 0.68).normalize();
  const { sun } = S;
  sun.target.position.copy(c);
  sun.position.copy(c).addScaledVector(sd, R * 4 + 50);
  const scm = sun.shadow.camera; const r = R * 1.6;
  scm.left = -r; scm.right = r; scm.top = r; scm.bottom = -r; scm.near = 1; scm.far = R * 8 + 120; scm.updateProjectionMatrix();
}
