// Quality-tier test fixture (test/tiers.test.mjs): every tier knob has something to act on, small
// enough for 320x180 on the CPU. A wet puddle (userData.dkSSR) and a steel ball (SSR), a clearcoat ball,
// thin poles (cascades), mist (froxels), a spinning wheel (sub-frames), DOF, a small FFT sea whose
// heightAt() is logged so the GPU FFT can be compared with the CPU FFT.
import { createOcean } from 'dk/ocean.js';

export const meta = {
  title: 'tier fixture', duration: 4, seed: 2,
  cinematic: {
    atmosphere: { enabled: true, haze: 2, sunDirection: [-0.5, 0.3, -0.8], sunIlluminance: 6 },
    volumetrics: { enabled: true, range: 120, density: 0.002, banks: [{ center: [-4, 2, -18], radius: [8, 3, 6], density: 0.02 }] },
    shadows: { cascades: 2, maxDistance: 120 },
  },
};
let S;
export async function setup(ctx) {
  const { THREE, scene } = ctx;
  const sun = new THREE.DirectionalLight(0xffffff, 6);
  sun.castShadow = true; sun.shadow.mapSize.set(512, 512);
  scene.add(sun, sun.target);
  const ocean = createOcean(ctx, { resolution: 64, cascades: [400, 60], segments: 96, windSpeed: 7, seed: 3 });
  scene.add(ocean.mesh);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(30, 2, 40), new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.85 }));
  deck.position.set(0, 0, -14); deck.castShadow = deck.receiveShadow = true; scene.add(deck);
  const wet = new THREE.MeshStandardMaterial({ color: 0x1c1b19, roughness: 0.06 });
  wet.userData.dkSSR = true;
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), wet);
  puddle.rotation.x = -Math.PI / 2; puddle.position.set(0, 1.004, 1.5); scene.add(puddle);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  add(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.1 }), -1.2, 1.5, 0.5);
  add(new THREE.SphereGeometry(0.45, 32, 16), new THREE.MeshPhysicalMaterial({ color: 0xeeeeee, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 }), 1.6, 1.45, 0);
  add(new THREE.BoxGeometry(1, 5, 1), new THREE.MeshStandardMaterial({ color: 0x993322, roughness: 0.7 }), 2.5, 3.5, -6);
  for (let i = 0; i < 8; i++) add(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), new THREE.MeshStandardMaterial({ color: 0x332211 }), -4 + i * 0.4, 1.5, -0.5);
  const wheel = new THREE.Group();
  for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), new THREE.MeshStandardMaterial({ color: 0x6b4a2c })); s.rotation.z = (i * Math.PI) / 6; s.castShadow = true; wheel.add(s); }
  wheel.position.set(-3, 2.1, -2); scene.add(wheel);
  ctx.shadows.key = 'deck'; ctx.shadows.dynamic = [wheel];
  S = { ocean, wheel, sun, focus: puddle };
}
export function update(t, ctx) {
  S.ocean.update(t);
  S.sun.position.set(-40, 25, -60); S.sun.target.position.set(0, 0, 0);
  S.wheel.rotation.z = -t * Math.PI * 4;
  ctx.camera.position.set(0.4, 2.8, 6.5); ctx.camera.lookAt(-0.3, 1.4, -2);
  ctx.lens.focalLength = 24; ctx.lens.fstop = 2; ctx.lens.focusTarget = S.focus;
  if (!ctx.subframe) console.log('[tier-h] ' + JSON.stringify([S.ocean.heightAt(3.3, -40), S.ocean.heightAt(-20.5, -61.2), S.ocean.heightAt(150.25, 77.5)]) + ' gpu=' + S.ocean.gpu);
}
