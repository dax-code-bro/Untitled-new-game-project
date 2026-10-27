// Fast-motion fixture for the quality tiers (test/tiers.test.mjs): a thin dark bar (4 cm) swinging fast
// (24 rad/s, the tip moves ~100 m/s) about a pivot just above a lit ground, in front of a bright wall. At 16 sub-frames
// the bar moves ~5 px per sub-frame at 320x180: plain sub-frame averaging leaves a ladder of separate
// copies (banding across the sweep), the hybrid accumulation (velocity blur inside each sub-frame) a
// continuous streak. Its pivot end is 4 cm over the ground, so its contact shadow / ambient occlusion
// moves with it (per-sub-frame AO). No haze, fog or depth of field: only the motion is measured.
export const meta = {
  title: 'fast motion fixture', duration: 2, seed: 5,
  cinematic: {
    atmosphere: { enabled: false }, volumetrics: { enabled: false }, dof: { enabled: false },
    shadows: { cascades: 1, maxDistance: 30 },
    grain: { amount: 0 },
  },
};
let S;
export async function setup(ctx) {
  const { THREE, scene } = ctx;
  scene.background = new THREE.Color(0.6, 0.66, 0.72);
  const sun = new THREE.DirectionalLight(0xffffff, 4);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xc8d8ff, 0x50483c, 1.4));
  // a bright, evenly lit wall (unlit material): the dark bar's streak shows every copy against it
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshBasicMaterial({ color: 0xc4c8cc }));
  wall.position.set(0, 5, -4); scene.add(wall);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: 0x8a7a60, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -1.05, 4); ground.receiveShadow = true; scene.add(ground);
  const pivot = new THREE.Group();
  pivot.position.set(-2, -0.98, 0);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(4, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.6 }));
  bar.position.x = 2; bar.castShadow = true; pivot.add(bar);
  scene.add(pivot);
  ctx.shadows.dynamic = [pivot];
  S = { pivot, sun };
}
export function update(t, ctx) {
  S.sun.position.set(3, 12, -8); S.sun.target.position.set(0, 0, 0);
  // swings up and down over the ground: at t = 0 it is 0.3 rad up, moving up at 24 rad/s
  S.pivot.rotation.z = 0.3 + 0.6 * Math.sin(40 * t);
  ctx.camera.position.set(0, -0.2, 10); ctx.camera.lookAt(0, -0.2, 0);
  ctx.lens.focalLength = 35; ctx.lens.fstop = 8; ctx.lens.shutterAngle = 180;
}
