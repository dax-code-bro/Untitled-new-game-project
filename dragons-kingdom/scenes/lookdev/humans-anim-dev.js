// Humans performance - face development: one character's face close-up, frame k = face pose k.
// scenes/lookdev/humans-anim-dev.json: { "id": "remi", "poses": [{ "JawDrop": 1 }, ...], "az": 20 }
// (a pose may also be { "visemes": { "jaw": 0.7, "round": 0.3 } } - articulators through
//  visemes.js visemeUnits - or { "emotion": { "fear": 1 } } through expressions.js).
// Render all poses in one run as a 1-fps sequence:
//   node render/render.mjs scenes/lookdev/humans-anim-dev.js --preset draft --fps 1 --seconds N --workers 1
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { loadCharacter } from '../lib/humans/index.js';
import { loadFaceUnits, createFaceRig } from '../lib/humans/face.js';
import { reviewTime } from '../lib/humans/stage.js';
import { filmFinish } from './finish.js';

const CFG = await fetch(new URL('./humans-anim-dev.json', import.meta.url)).then((r) => r.json()).catch(() => ({ id: 'remi', poses: [{}] }));

export const meta = {
  title: 'Humans performance - face dev',
  duration: Math.max(1, (CFG.poses || [{}]).length),
  seed: 5,
  cinematic: filmFinish({
    motionBlur: { mode: 'off' },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.1 },
    dof: { samples: 32 },
    grade: { exposure: CFG.exposure ?? 0.2, whiteBalance: 5600 },
  }),
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI(CFG.hdri || 'hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: CFG.hdriRot ?? -1.0, backgroundBlurriness: 0.3 });
  const sun = sky.apply(scene);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -0.6; sc.right = 0.6; sc.top = 2.0; sc.bottom = 1.0; sc.near = 0.5; sc.far = 60;
  sun.shadow.bias = -0.0001; sun.shadow.normalBias = 0.006;
  sun.position.copy(sky.sun.direction).multiplyScalar(30);
  sun.target.position.set(0, 1.5, 0);
  scene.add(sun, sun.target);
  const g = new THREE.Mesh(new THREE.CircleGeometry(30, 48), await loadPBR('pbr/acg_ground13', ctx, { worldSize: 60 }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  const ch = await loadCharacter(CFG.id || 'remi');
  ch.root.rotation.y = CFG.yaw ?? 0;
  scene.add(ch.root);
  const units = await loadFaceUnits();
  const face = createFaceRig(ch, units);
  const vis = await import('../lib/humans/visemes.js');
  const expr = await import('../lib/humans/expressions.js');
  S = { ch, face, vis, expr };
}

export function update(t, ctx) {
  const { camera } = ctx;
  const { ch, face } = S;
  const rt = reviewTime(t, ctx);
  const poses = CFG.poses || [{}];
  const p = poses[Math.min(poses.length - 1, Math.max(0, rt.k))] || {};
  ch.update(0, { blink: false, eyes: CFG.eyes ?? false, amount: 0 });
  let w = p;
  if (p.visemes) {
    const v = { jaw: 0, close: 0, round: 0, spread: 0, fv: 0, th: 0, tip: 0, upper: 0, press: 0, ...p.visemes };
    w = S.vis.visemeUnits(v, {});
  } else if (p.emotion) w = S.expr.emotionUnits(p.emotion, {});
  face.apply(w);
  ch.root.updateMatrixWorld(true);
  const P = (n) => ch.bone(n).getWorldPosition(new THREE.Vector3());
  const eyes = P('eye.L').add(P('eye.R')).multiplyScalar(0.5);
  const tgt = eyes.clone().lerp(P('oris01'), 0.45).add(new THREE.Vector3(0, CFG.dy ?? 0, 0));
  const az = ((CFG.az ?? 15) * Math.PI) / 180 + (ch.root.rotation.y || 0), el = ((CFG.el ?? 2) * Math.PI) / 180, dist = CFG.dist ?? 0.55;
  camera.position.set(tgt.x + dist * Math.cos(el) * Math.sin(az), tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(el) * Math.cos(az));
  camera.lookAt(tgt);
  camera.fov = CFG.fov ?? 24; camera.near = 0.02; camera.far = 200;
  camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 4; ctx.lens.focus = dist; ctx.lens.shutterAngle = 45; }
}
