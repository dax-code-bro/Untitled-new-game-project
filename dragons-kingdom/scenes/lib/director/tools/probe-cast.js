// Shot director tool - CAST PROBE: humans-library characters as the director poses them, from four
// sides, in plain grey light (garments, hair, posture overlays). One frame per (character, side):
//   node render/render.mjs scenes/lib/director/tools/probe-cast.js --preset draft --fps 1 --seconds <4 x ids> --cinematic preview --out DIR
// The ids come from probe-cast.json next to this file ({ "ids": ["healer", "crowd09"], "posture": {...} }).
import * as THREE from 'three';
import { loadCharacter } from '../../humans/index.js';
import { poseHuman, humanRig } from '../actions.js';
import { actorState } from '../blocking.js';

export const meta = { title: 'director cast probe', duration: 40, cinematic: { motionBlur: { mode: 'off' }, dof: { enabled: false } } };
let S;
export async function setup(ctx) {
  const cfg = await (await fetch(new URL('./probe-cast.json', import.meta.url))).json();
  const chars = [];
  for (const id of cfg.ids) { const ch = await loadCharacter(id); humanRig(ch); ctx.scene.add(ch.root); chars.push(ch); }
  ctx.scene.background = new THREE.Color(0.35, 0.36, 0.38);
  ctx.scene.add(new THREE.HemisphereLight(0xdde4ee, 0x554a40, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(3, 6, 4); ctx.scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x777777 }));
  ctx.scene.add(floor);
  S = { chars, cfg };
}
export function update(t, ctx) {
  const k = Math.floor(t + 1e-6), ci = Math.floor(k / 4) % S.chars.length, side = k % 4;
  S.chars.forEach((c, i) => { c.root.visible = i === ci; });
  const ch = S.chars[ci];
  const st = actorState({ at: [0, 0], face: 180, posture: S.cfg.posture || {}, acts: S.cfg.acts || [] }, S.cfg.at ?? 1, { mark: () => null, ground: () => 0 });
  poseHuman(ch, st, S.cfg.at ?? 1, { point: (n) => (Array.isArray(n) ? new THREE.Vector3(...n) : new THREE.Vector3(0, 1.2, 2)), ground: () => 0 }, {});
  const a = side * Math.PI / 2;
  ctx.camera.position.set(Math.sin(a) * 3.2, 1.2, Math.cos(a) * 3.2);
  ctx.camera.lookAt(0, 0.95, 0);
  ctx.lens.focalLength = 35; ctx.lens.focus = 3.2; ctx.lens.fstop = 8;
}
