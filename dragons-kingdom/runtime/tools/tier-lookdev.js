// Quality-tier look development scene: every knob of the tiers (runtime/lib/quality.js) has
// something to act on, procedurally (no assets, no caches), so it renders anywhere in seconds:
//
//   * a stone quay with a wet puddle (material.userData.dkSSR) and the sea around it: screen-space
//     reflections on the puddle and on the water (ocean ssr), the FFT ocean resolution;
//   * a polished steel sphere and a white clearcoat sphere (auto SSR by roughness; clearcoat SSR);
//   * a fence of 2 cm poles and a rope: shadow detail of 2048 vs 4096 cascades, contact shadows;
//   * an arch and a colonnade in sun-lit mist: froxel resolution of the light shafts;
//   * a fast spinning wheel and a box thrown across the frame: sub-frame motion blur vs velocity;
//   * a 24 mm lens at T2 focused on the steel sphere: DOF sample count in the bokeh;
//   * a fine checker on the quay seen at a grazing angle: anisotropic filtering.
//
//   node render/render.mjs --still runtime/tools/tier-lookdev.js --time 1 --preset final --size 960x540 --png out.png
//   node render/render.mjs --still runtime/tools/tier-lookdev.js --time 1 --preset final-ultra --size 960x540 --png out.png
//   node runtime/tools/tier-check.mjs runtime/tools/tier-lookdev.js --time 1      (all tiers, compared)
import { createOcean } from 'dk/ocean.js';

export const meta = {
  title: 'Quality tier look development - wet quay at golden hour',
  duration: 4,
  seed: 3,
  cinematic: {
    atmosphere: { enabled: true, haze: 2.2, sunDirection: [-0.55, 0.22, -0.8], sunIlluminance: 7 },
    volumetrics: {
      enabled: true, range: 300, density: 0.0012, heightFalloff: 0.06, noiseAmount: 0.6, anisotropy: 0.65, shadowSoftness: 0.15,
      banks: [{ center: [-6, 2, -24], radius: [16, 4, 10], density: 0.02, noise: 0.8 }],
    },
    shadows: { cascades: 3, maxDistance: 250 },
    dof: { samples: 48 },
  },
};

let S;

function checkerTexture(THREE, n = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const k = n / 32;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const v = ((x + y) & 1) ? 150 : 95;
    const j = ((x * 7 + y * 13) % 5) * 6;
    g.fillStyle = `rgb(${v + j},${v + j - 6},${v + j - 14})`;
    g.fillRect(x * k, y * k, k, k);
  }
  g.strokeStyle = 'rgb(40,38,34)'; g.lineWidth = 2;
  for (let i = 0; i <= 32; i++) { g.beginPath(); g.moveTo(i * k, 0); g.lineTo(i * k, n); g.stroke(); g.beginPath(); g.moveTo(0, i * k); g.lineTo(n, i * k); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(6, 6);
  return t;
}

export async function setup(ctx) {
  const { THREE, scene, quality } = ctx;
  const sun = new THREE.DirectionalLight(0xffffff, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x4a4036, 0.4));

  const ocean = createOcean(ctx, { windSpeed: 6, windDirection: 40, swell: 0.3, choppiness: 1.0, seed: 5, mipFilter: 'trilinear', roughness: 0.05 });
  scene.add(ocean.mesh);

  // the quay: a stone block 40 x 60 m, 1.2 m above the sea
  const stone = new THREE.MeshStandardMaterial({ map: checkerTexture(THREE), roughness: 0.82 });
  const quay = new THREE.Mesh(new THREE.BoxGeometry(40, 2.4, 60), stone);
  quay.position.set(0, 0, -20);
  quay.castShadow = quay.receiveShadow = true;
  scene.add(quay);
  const top = 1.2;
  // a puddle: wet stone, nearly a mirror (libraries mark wet materials with userData.dkSSR)
  const wet = new THREE.MeshStandardMaterial({ color: 0x1d1c1a, roughness: 0.06, metalness: 0 });
  wet.userData.dkSSR = true;
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 64), wet);
  puddle.rotation.x = -Math.PI / 2; puddle.scale.set(3.2, 2.1, 1);
  puddle.position.set(0.6, top + 0.004, 2.0);
  puddle.receiveShadow = true;
  scene.add(puddle);
  // arch + colonnade (light shafts through the mist, reflected in the puddle)
  const wall = new THREE.MeshStandardMaterial({ color: 0x8a7f72, roughness: 0.9 });
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  add(new THREE.BoxGeometry(1.2, 7, 1.2), wall, -4, top + 3.5, -10);
  add(new THREE.BoxGeometry(1.2, 7, 1.2), wall, 2, top + 3.5, -10);
  add(new THREE.BoxGeometry(7.2, 1.4, 1.2), wall, -1, top + 7.7, -10);
  for (let i = 0; i < 7; i++) add(new THREE.CylinderGeometry(0.32, 0.36, 6, 24), wall, -12 + i * 2.2, top + 3, -18);
  add(new THREE.BoxGeometry(16, 0.8, 1.6), wall, -5.4, top + 6.4, -18);
  // a red post and a blue door: colour for the reflections
  add(new THREE.BoxGeometry(0.5, 3.2, 0.5), new THREE.MeshStandardMaterial({ color: 0x8c1a12, roughness: 0.6 }), 3.6, top + 1.6, -2.5);
  add(new THREE.BoxGeometry(1.6, 2.6, 0.2), new THREE.MeshStandardMaterial({ color: 0x1b3a6b, roughness: 0.7 }), -1, top + 1.3, -9.3);
  // fence of 2 cm poles and a rope: fine shadow detail
  const pole = new THREE.MeshStandardMaterial({ color: 0x3b2f24, roughness: 0.8 });
  for (let i = 0; i < 14; i++) add(new THREE.CylinderGeometry(0.01, 0.01, 1.1, 6), pole, -6 + i * 0.35, top + 0.55, 0.5);
  const rope = add(new THREE.CylinderGeometry(0.012, 0.012, 4.6, 6), pole, -3.7, top + 1.05, 0.5);
  rope.rotation.z = Math.PI / 2;
  // polished steel and white clearcoat (a silver dragon's scales): SSR by roughness
  const steel = add(new THREE.SphereGeometry(0.55, 64, 32), new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 1, roughness: 0.12 }), -1.6, top + 0.55, 1.2);
  add(new THREE.SphereGeometry(0.5, 64, 32), new THREE.MeshPhysicalMaterial({ color: 0xe8e8ea, roughness: 0.55, clearcoat: 1, clearcoatRoughness: 0.06 }), 2.4, top + 0.5, 0.2);
  // a wheel with 8 spokes spinning at 2 turns per second, and a box thrown across the frame
  const wheel = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.75 });
  for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, 0.06), wood); sp.rotation.z = (i * Math.PI) / 8; sp.castShadow = true; wheel.add(sp); }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 8, 48), wood); rim.castShadow = true; wheel.add(rim);
  wheel.position.set(-4.6, top + 1.0, -1.5);
  scene.add(wheel);
  const box = add(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.5 }), 0, top + 2, -3);

  ctx.shadows.key = 'quay';
  ctx.shadows.dynamic = [wheel, box];
  S = { ocean, wheel, box, sun, steel, top };
}

export function update(t, ctx) {
  const { camera } = ctx;
  S.ocean.update(t);
  S.sun.position.set(-55, 22, -80); S.sun.target.position.set(0, 0, 0);
  S.wheel.rotation.z = -t * Math.PI * 4;                       // 2 turns per second
  const u = (t % 2) / 2;                                         // a box thrown across every 2 s
  S.box.position.set(-6 + 12 * u, S.top + 1.2 + 3.2 * u * (1 - u) * 4 * 0.5, -3);
  S.box.rotation.set(t * 5, t * 3, 0);
  camera.position.set(0.6, S.top + 1.75, 7.2 + 0.08 * Math.sin(t * 0.7));
  camera.lookAt(-0.6, S.top + 0.9, -2.5);
  ctx.lens.focalLength = 24;
  ctx.lens.fstop = 2.0;
  ctx.lens.focusTarget = S.steel;
  ctx.lens.shutterAngle = 180;
}
