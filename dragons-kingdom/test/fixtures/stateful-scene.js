// Simulation-style scene (opts into meta.mode = 'chunk-warmup'): state is
// integrated step by step instead of being a pure function of t.
export const meta = { title: 'Stateful fixture', duration: 2, mode: 'chunk-warmup', warmupFrames: 'all' };

let ball, vel, pos;

export async function setup(ctx) {
  const { THREE, scene, camera } = ctx;
  scene.background = new THREE.Color(0x203040);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2));
  ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffaa33 }));
  scene.add(ball);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x335533 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  camera.position.set(0, 6, 18);
  camera.lookAt(0, 3, 0);
}

// called by the runtime at the start of every chunk
export function reset() {
  pos = { x: -8, y: 8 };
  vel = { x: 4, y: 0 };
}

// one simulation step per frame (the runtime calls this for every frame in order)
export function update(t, ctx) {
  const dt = 1 / ctx.fps;
  vel.y -= 9.8 * dt;
  pos.x += vel.x * dt; pos.y += vel.y * dt;
  if (pos.y < 1) { pos.y = 1; vel.y = -vel.y * 0.8; }
  if (pos.x > 8 || pos.x < -8) vel.x = -vel.x;
  ball.position.set(pos.x, pos.y, 0);
}
