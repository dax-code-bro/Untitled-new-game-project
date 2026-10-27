// Glossy-over-water fixture for the quality tiers (test/tiers.test.mjs): a polished steel ball (auto-SSR by its
// roughness) 0.3 m over a small FFT sea, a bright sandy sea bed with dark stripes 2 m under the water. The ball's
// lower half must reflect the WATER (teal), not the sand under it: the tiers' screen-space reflections are drawn
// after the late pass (the ocean), from copies that hold the water. And the sea next to the ball's reflection
// must stay as clean as at final (no hatching).
import { createOcean } from 'dk/ocean.js';

export const meta = {
  title: 'glossy over water fixture', duration: 2, seed: 4,
  cinematic: {
    atmosphere: { enabled: true, haze: 1.5, sunDirection: [-0.4, 0.35, -0.8], sunIlluminance: 6 },
    volumetrics: { enabled: false }, shadows: { cascades: 2, maxDistance: 120 }, dof: { enabled: false }, grain: { amount: 0 },
  },
};
let S;
export async function setup(ctx) {
  const { THREE, scene } = ctx;
  const sun = new THREE.DirectionalLight(0xffffff, 6);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun, sun.target);
  const ocean = createOcean(ctx, { resolution: 64, cascades: [300, 40], segments: 128, windSpeed: 5, seed: 3 });
  scene.add(ocean.mesh);
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#e8d4a0'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#5a2a10'; for (let i = 0; i < 8; i++) g.fillRect(i * 32, 0, 10, 256);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(20, 20); tex.colorSpace = THREE.SRGBColorSpace;
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  bed.rotation.x = -Math.PI / 2; bed.position.y = -2; bed.receiveShadow = true; scene.add(bed);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 64, 32), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.05 }));
  ball.position.set(0, 0.9, 0); ball.castShadow = true; scene.add(ball);
  S = { ocean, sun };
}
export function update(t, ctx) {
  S.ocean.update(t);
  S.sun.position.set(-40, 35, -80); S.sun.target.position.set(0, 0, 0);
  ctx.camera.position.set(0, 1.6, 4.5); ctx.camera.lookAt(0, 0.6, 0);
  ctx.lens.focalLength = 35; ctx.lens.fstop = 8;
}
