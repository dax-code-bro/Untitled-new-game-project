// Engine phase 4: shared camera maths for the shot templates (pure; no three.js). A template returns camera PARAMS:
//   { rig, subjects: [{ p: [x, y, z], s: [sx, sy], w, name }], anchor: [x, y, z], from (compass deg: the side the camera
//     stands on, framing.js), dist (m from the anchor), height (camera y), mm, fstop, pos? (fixed: a vantage) }
// shoot(P) turns them into a static camera { pos, look, focus } aimed so the subjects land near their screen places.
import { dirOf, r2 } from '../../../scenes/lib/director/staging/ground.js';

export const SENSOR_W = 24.89, ASPECT = 16 / 9;
export const tanH = (mm) => SENSOR_W / 2 / mm;
export const tanV = (mm) => tanH(mm) / ASPECT;
/** camera distance that shows `frameH` metres of frame height at the subject */
export const distFor = (frameH, mm) => frameH / (2 * tanV(mm));
export const frameHAt = (dist, mm) => 2 * dist * tanV(mm);
/** screen x for a requested side */
export const SIDE_X = { L: -0.36, R: 0.36, LC: -0.18, RC: 0.18, C: 0, move: 0, any: 0 };
export const centroid = (pts, w = null) => {
  let W = 0; const c = [0, 0, 0];
  pts.forEach((p, i) => { const k = w ? w[i] : 1; W += k; for (let j = 0; j < 3; j++) c[j] += p[j] * k; });
  return c.map((v) => v / (W || 1));
};
/** the static camera of params P */
export function shoot(P) {
  const A = P.anchor;
  let pos;
  if (P.pos) pos = P.pos.slice();
  else { const d = dirOf(P.from); pos = [A[0] + d[0] * P.dist, P.height, A[2] + d[1] * P.dist]; }
  const th = tanH(P.mm), tv = tanV(P.mm);
  // aim: the weighted mean of the yaw / pitch that would put each subject on its screen place
  let sy = 0, cy = 0, sp = 0, W = 0;
  for (const S of P.subjects) {
    const v = [S.p[0] - pos[0], S.p[1] - pos[1], S.p[2] - pos[2]];
    const h = Math.hypot(v[0], v[2]) || 1e-3;
    const yaw = Math.atan2(v[0], v[2]) + Math.atan(S.s[0] * th);
    const pitch = Math.atan2(v[1], h) - Math.atan(S.s[1] * tv);
    const w = S.w ?? 1; W += w; sy += Math.sin(yaw) * w; cy += Math.cos(yaw) * w; sp += pitch * w;
  }
  const yaw = Math.atan2(sy, cy), pitch = sp / (W || 1);
  const look = [pos[0] + Math.cos(pitch) * Math.sin(yaw) * 10, pos[1] + Math.sin(pitch) * 10, pos[2] + Math.cos(pitch) * Math.cos(yaw) * 10];
  return { pos: pos.map(r2), look: look.map(r2), focus: (P.focus || A).map(r2) };
}
/** project a world point with a camera { pos, look, mm }: { x, y (NDC -1..1), z (depth m) } */
export function project(cam, p) {
  const d = norm(sub(cam.look, cam.pos)), r = norm([-d[2], 0, d[0]]), u = cross(r, d);
  const v = sub(p, cam.pos), z = dot(v, d);
  return { x: dot(v, r) / (Math.max(z, 1e-3) * tanH(cam.mm)), y: dot(v, u) / (Math.max(z, 1e-3) * tanV(cam.mm)), z };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
