// chunk-warmup with warmupFrames 'all' (the mode the README recommends for
// exact simulations). Every update() costs ~3 ms, so a chunk that starts late
// replays ~8 s of simulation before its first frame - much longer than
// the stall limit the test sets. The heartbeat must keep the watchdog quiet
// (test (c3)).
import * as THREE from 'three';
export const meta = { title: 'long warm-up fixture', duration: 200, mode: 'chunk-warmup', warmupFrames: 'all' };
let ball, s;
export async function setup(ctx) {
  ctx.scene.background = new THREE.Color(0x203040);
  ctx.scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2));
  ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshLambertMaterial({ color: 0xffaa33 }));
  ball.frustumCulled = false;
  ctx.scene.add(ball);
  ctx.camera.position.set(0, 0, 20); ctx.camera.lookAt(0, 0, 0);
}
export function reset() { s = { x: 0, v: 1 }; }
export function update() {
  for (let i = 0; i < 400000; i++) { s.v -= s.x * 1e-7; s.x += s.v * 1e-7; }   // deterministic "physics"
  ball.position.set(Math.sin(s.x) * 5, 0, 0);
}
