// Architecture - Verdor interiors (PROVISIONAL designs), one shot per second:
//   t 0-1  the birthing chamber: the daylight shaft from the high opening, lamps, the nest
//   t 1-2  the birthing chamber: the prepared nest, bowls of water, folded cloth (lower, closer)
//   t 2-3  the treatment room: daylight from the coast-side window, settle, table, basin
//   t 3-4  the treatment room toward the window (the coastline outside), the doorway behind
//   node render/render.mjs --still scenes/lookdev/architecture-interiors.js --time 0.5 --preset final --png chamber.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { Kit, frame, xf } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { birthingChamber, treatmentRoom, loadArchCache } from '../lib/architecture/interiors.js';
import { reviewTime } from '../lib/humans/stage.js';
import { filmFinish } from './finish.js';

// the chamber at the origin, the treatment room 60 m east (same sun: high, from the east)
const SUN = new THREE.Vector3(0.67, 0.73, -0.1).normalize();     // through the chamber's east opening onto the nest
const ROOM2 = [-300, 0, 0];
const SHOTS = [
  { name: 'chamber', p: [-3.25, 1.45, 2.75], t: [1.2, 2.9, -1.0], fl: 18, fstop: 2.8, room: 0 },
  { name: 'nest', p: [-2.5, 1.2, 2.3], t: [-0.6, 0.55, 0.2], fl: 28, fstop: 2.8, room: 0 },
  { name: 'treatment', p: [-297.8, 1.55, 1.8], t: [-302.3, 1.1, -0.9], fl: 21, fstop: 2.8, room: 1 },
  { name: 'treatment-window', p: [-298.2, 1.45, 0.4], t: [-303.0, 1.5, -0.1], fl: 24, fstop: 2.8, room: 1 },
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
  const kit = new Kit(0);
  const cloth = await loadArchCache('nest_cloth');
  const ch = birthingChamber(kit, frame([0, 0, 0]), { seed: 3, cloth });
  const tr = treatmentRoom(kit, frame(ROOM2), { seed: 4 });
  scene.add(kit.build(M, { name: 'interiors' }));
  for (const l of ch.lights) scene.add(l);
  // bounce: the sunlit floor patch lights the room from below (warm), the sky through the window (cool)
  const b1 = new THREE.PointLight(new THREE.Color(1.0, 0.8, 0.6), 0.9, 8, 2); b1.position.set(-0.8, 0.5, -0.2); scene.add(b1);
  const b2 = new THREE.PointLight(new THREE.Color(1.0, 0.85, 0.7), 2.2, 8, 2); b2.position.set(ROOM2[0] - 1.4, 0.5, ROOM2[2] - 0.3); scene.add(b2);
  const b3 = new THREE.PointLight(new THREE.Color(0.9, 0.93, 1.0), 1.2, 7, 2); b3.position.set(ROOM2[0] - 2.2, 1.6, ROOM2[2] - 0.2); scene.add(b3);
  // outside the treatment room's window: the sea (a flat dark mirror) and the ground round the rooms
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), M.water);
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -6, 0); scene.add(sea);
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
  ctx.lens.iso = 800;
  const { sun } = S;
  const c = sh.room ? ROOM2 : [0, 0, 0];
  sun.target.position.set(c[0], 0, c[2]);
  sun.position.copy(sun.target.position).addScaledVector(SUN, 30);
  const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 5; sc.far = 70; sc.updateProjectionMatrix();
}
