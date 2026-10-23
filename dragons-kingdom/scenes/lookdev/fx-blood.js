// FX lookdev - blood (F1 in assets-delta.md): spray, drops landing, a pool spreading along the
// paving joints, the long smear down a house front (R16b), a banner soaking through (R18), a
// coat of blood with drips on a grey ball (a stand-in for scales), a fine spatter on Remi's face
// and a run from his hairline (1F-17b / R7 / R8), drying from wet to dark and tacky.
//
// Views (10 s each; the effects restart in every view):
//   0 wide       2 the wall smear      4 Remi's face       6 the banner
//   1 the pool   3 the ball (coat)     5 the spray, close  7 everything DRY (R7: hours later)
//
//   node render/render.mjs --still scenes/lookdev/fx-blood.js --time 8 --preset draft --png out.png
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { loadCharacter, placeCharacter } from '../lib/humans/index.js';
import { createFx } from '../lib/fx/index.js';

export const meta = {
  title: 'FX lookdev - blood',
  duration: 80,
  seed: 3,
  cinematic: {
    atmosphere: { enabled: true, sky: 'scene', haze: 1.0 },
    ao: { enabled: true, radius: 0.6 },
    dof: { enabled: true },
    grade: { exposure: 0.0, whiteBalance: 6000 },
  },
};

let S;
const VIEW = 10;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
  const sun = sky.apply(scene);
  const rot = Math.atan2(sky.sun.direction.z, sky.sun.direction.x) - 2.2;
  scene.environmentRotation.set(0, rot, 0); scene.backgroundRotation.set(0, rot, 0);
  sky.sun.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  sun.position.copy(sky.sun.direction).multiplyScalar(60);
  sun.castShadow = true; sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02;
  const sc = sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 160; sc.updateProjectionMatrix();
  scene.add(sun, sun.target);
  // paving (the square), a stone house front, a linen banner
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), await groundMaterial('pbr/ph_sandstone_blocks_04', ctx, [60, 60], { tint: [0.9, 0.88, 0.84] }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const wallMat = await loadPBR('pbr/ph_white_sandstone_bricks_03', ctx, { worldSize: [8, 4] });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.5), wallMat);
  wall.position.set(-1, 2, -2.25); wall.castShadow = wall.receiveShadow = true; scene.add(wall);
  const linen = await loadPBR('pbr/acg_fabric36', ctx, { worldSize: [1, 1], color: new THREE.Color(0.85, 0.78, 0.62), sheen: { color: 0xffffff, roughness: 0.7 } });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2, 28, 44), linen);
  {
    const p = banner.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.06 * Math.sin(x * 9 + y * 1.3) * (0.4 + 0.6 * (1.1 - y) / 2.2)); }
    banner.geometry.computeVertexNormals();
  }
  banner.position.set(3.2, 1.4, -1.5); banner.rotation.y = -0.35; banner.castShadow = banner.receiveShadow = true; scene.add(banner);
  const grey = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.05, 0.05, 0.05), roughness: 0.45 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 96, 48), grey);
  ball.position.set(1.6, 0.5, 0.9); ball.castShadow = ball.receiveShadow = true; scene.add(ball);
  const remi = await loadCharacter('remi');
  placeCharacter(remi, -2.6, 0, 0.6, 0.5);
  scene.add(remi.root);
  remi.update(0);
  remi.root.updateMatrixWorld(true);
  const body = remi.meshes.find((m) => /body/.test(m.name)) || remi.meshes[0];
  const head = new THREE.Vector3(); remi.bone('head').getWorldPosition(head);

  const fx = await createFx(ctx, { ground: 0, wind: [0.4, 0, 0.2], tier: ctx.meta.fxTier });
  const dry = (t) => S.dry;
  // the spray: a burst at 1.2 m toward the wall and the paving
  fx.blood.spray({ at: [0.4, 1.3, -0.4], dir: [-0.35, 0.25, -0.9], t0: 1.0, speed: 7, count: 500, spread: 0.5, hit: [{ point: [0, 0, -2.0], normal: [0, 0, 1] }], dry });
  // the pool under the wreckage, spreading along the joints
  fx.blood.pool({ at: [0.2, 0, 1.6], t0: 0.0, radius: 0.9, tau: 6, src: [0, 0.3], dry, seed: 4, target: ground });
  // the smear down the house front: a body slides from 2.1 m to 0.5 m in 0.8 s (decal +u = down)
  fx.blood.smear({ target: wall, at: [-2.6, 1.3, -2.0], dir: [0, 0, -1], up: [1, 0, 0], size: [1.8, 0.42, 0.3], t0: 2.0, grow: [0, 0.35], dry, seed: 2, params: [0, 5, 0.9, 2.5] });
  // the banner soaking through
  fx.blood.soak({ target: banner, at: [3.25, 1.0, -1.45], dir: [0.35, 0, -0.94], size: [1.2, 1.2, 0.6], t0: 0.0, grow: [0, 7], amount: 0.9, dry, seed: 6 });
  // coat + drips on the dark ball (scales stand-in)
  fx.blood.coat({ target: ball, at: [1.6, 0.6, 1.4], dir: [0, -0.15, -1], size: [0.7, 0.9, 1.2], t0: 0.0, grow: [0.5, 4], dry, seed: 9, params: [0, 5, 0.6, 0] });
  // Remi: fine spatter on the face + a run from the hairline
  const face = head.clone().add(new THREE.Vector3(Math.sin(0.5), 0, Math.cos(0.5)).multiplyScalar(0.25)).add(new THREE.Vector3(0, 0.02, 0));
  fx.blood.spatter({ target: body, at: face.toArray(), dir: [-Math.sin(0.5), -0.1, -Math.cos(0.5)], size: [0.26, 0.3, 0.5], t0: 0.0, src: [0.14, 0.04], seed: 5, dry, params: [0.16, 0.045, 0.012, 1.4], maxAngle: 85 });
  fx.blood.runs({ target: body, at: face.clone().add(new THREE.Vector3(0.03, 0.0, 0)).toArray(), dir: [-Math.sin(0.5), 0, -Math.cos(0.5)], size: [0.12, 0.18, 0.4], t0: 0.5, grow: [0, 3], dry, seed: 3, amount: 0.5, params: [0, 3, 0, 0], maxAngle: 88 });
  // drops from Remi's hand
  const hand = new THREE.Vector3(); remi.bone('finger3-3.R').getWorldPosition(hand);
  fx.blood.drip({ at: hand.toArray(), t0: 0.5, rate: 2.5, duration: 8, dry });
  S = { fx, remi, head, hand, dry: 0 };
}

const VIEWS = [
  { pos: [1.5, 1.7, 6.5], look: [-0.3, 0.9, -0.5], f: 28, focus: 6 },
  { pos: [1.2, 0.9, 3.6], look: [0.2, 0.0, 1.5], f: 50, focus: 2.3 },
  { pos: [-1.6, 1.4, 0.4], look: [-2.6, 1.2, -2.0], f: 40, focus: 2.6 },
  { pos: [1.2, 0.9, 2.6], look: [1.6, 0.5, 0.9], f: 60, focus: 1.8 },
  { pos: [-2.0, 1.75, 1.75], look: null, f: 85, focus: 0 },
  { pos: [1.9, 1.3, 1.6], look: [0.0, 1.0, -1.2], f: 35, focus: 2.8 },
  { pos: [1.6, 1.4, 1.2], look: [3.2, 1.2, -1.5], f: 45, focus: 3.0 },
  { pos: [1.5, 1.7, 6.5], look: [-0.3, 0.9, -0.5], f: 28, focus: 6 },
];

export function update(t, ctx) {
  const cam = ctx.camera;
  const view = Math.min(VIEWS.length - 1, Math.floor(t / VIEW)), tt = t - view * VIEW;
  S.dry = view === 7 ? 1 : 0;
  const V = VIEWS[view];
  cam.position.set(...V.pos);
  if (V.look) cam.lookAt(...V.look); else cam.lookAt(S.head.x, S.head.y - 0.02, S.head.z);
  cam.near = 0.05; cam.far = 2000;
  ctx.lens.sensor = 'super35'; ctx.lens.focalLength = V.f; ctx.lens.fstop = 4; ctx.lens.shutterAngle = 180;
  ctx.lens.focus = V.focus || cam.position.distanceTo(S.head);
  S.remi.update(0);
  S.fx.update(tt);
}
