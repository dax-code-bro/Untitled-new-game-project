// Car interiors, sized from each body's own measurements.
//
// The bodies from carbuilder.js are hollow shells, so behind clear glass there
// is room for a real cabin: dashboard with an instrument binnacle and lit
// dials, centre stack with radio and vents, console with the gear lever and
// cup holders, a steering wheel on its column, front seats with headrests,
// a rear bench where the body has room for one, seatbelts, sun visors and a
// rear-view mirror. The seats are placed where a person in the seated pose
// actually fits between the floor and the roof of that car, and the steering
// wheel is placed under that person's hands.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Seated pose (character space, measured from the Driving_Loop clip):
// pelvis, and from the pelvis: top of the head, ankles, knuckles, eyes ([up, forward])
export const POSE = { pelvis: [0, 0.60, -0.29], headTop: [0.84, -0.10], ankle: [-0.5, 0.42], hand: [0.36, 0.31], eye: [0.72, 0.1] };
// recline: rotate a pose offset back by th about the hips
export const recl = (y, z, th) => [y * Math.cos(th) + z * Math.sin(th), -y * Math.sin(th) + z * Math.cos(th)];

export function cabinLayout(s) {
  if (s._cab !== undefined) return s._cab;
  const out = layout(s);
  Object.defineProperty(s, '_cab', { value: out, enumerable: false });
  return out;
}

function layout(s) {
  if (!s || !(s.roof > s.belt)) return null;
  const headTop = Math.min(s.roof - 0.09, s.belt + 0.62);
  const floorMin = s.ride + 0.1;
  // lean the seat back just enough for this roof and floor (sports cars lie back, vans sit up)
  let th = 0.2, py = 0;
  for (;; th += 0.02) {
    py = headTop - recl(...POSE.headTop, th)[0];
    const feet = py + recl(...POSE.ankle, th)[0] - 0.08;
    if (feet >= floorMin) break;
    if (th >= 0.56) { py = floorMin + 0.08 - recl(...POSE.ankle, th)[0]; break; }
  }
  const [, hz] = recl(...POSE.headTop, th), [ay, az] = recl(...POSE.ankle, th), [qy, qz] = recl(...POSE.hand, th);
  // head a little ahead of the B-pillar, feet under the dash (cab-overs: against the front wall)
  const front = s.cabover ? s.L / 2 - 0.16 : s.zA0 + 0.12;
  let pz = Math.min(s.zA1 - 0.24 - hz, front - az);
  if (s.cabover) pz = Math.min(pz, s.zA1 - 0.55 - hz);
  const dx = s.hwc * 0.44;
  const floorY = py + ay - 0.09;
  const tau = 0.42, R = 0.185, k = R * Math.SQRT1_2;
  const hand = { y: py + qy, z: pz + qz };
  const wheel = { x: dx, y: hand.y - k * Math.cos(tau), z: hand.z - k * Math.sin(tau), tau, R };
  const seats = [{ x: dx, y: py, z: pz, th }, { x: -dx, y: py, z: pz, th: th + 0.05 }];
  // rear seats where the roof and rear glass leave room for a head
  const zrw = (y) => s.zC0 + (s.zC1 - s.zC0) * Math.min(1, Math.max(0, (y - s.belt) / (s.roof - s.belt)));
  let rear = null;
  if (s.bus) {
    rear = [];
    for (let z = pz - 1.05; z > -s.L / 2 + 0.7; z -= 0.82) for (const x of [s.hwc - 0.3, s.hwc - 0.74, -(s.hwc - 0.3), -(s.hwc - 0.74)]) rear.push({ x, y: py, z, th: 0.16 });
  } else if (!s.cabover && !s.box) {
    const rth = th + 0.04, [rhy, rhz] = recl(...POSE.headTop, rth);
    const rpy = py - 0.02;
    let rpz = pz - 0.86;
    const need = zrw(rpy + rhy - 0.04) + 0.1; // head clear of the rear window
    if (rpz + rhz < need) rpz = need - rhz;
    if (rpz < pz - 0.68 && rpy + rhy < s.roof - 0.04) rear = [{ x: s.hwc * 0.46, y: rpy, z: rpz, th: rth }, { x: -s.hwc * 0.46, y: rpy, z: rpz, th: rth }];
  }
  if (rear) seats.push(...rear);
  const eye = recl(...POSE.eye, th);
  return { th, py, pz, dx, floorY, wheel, seats, rearBench: !!rear && !s.bus, bus: !!s.bus, eye: { x: dx, y: py + eye[0], z: pz + eye[1] }, dashZ: wheel.z + 0.17, front };
}

// ------------------------------------------------------------ geometry
const parts = [];
function paint(g, col, rough, metal) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3), rm = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; rm[i * 2] = rough; rm[i * 2 + 1] = metal; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
  parts.push(g);
  return g;
}
// box with rounded edges (pushes the segment grid out to a rounded shape)
function rbox(sx, sy, sz, r = 0.03, seg = 3) {
  const g = new THREE.BoxGeometry(sx, sy, sz, seg, seg, seg);
  const p = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3();
  const hx = sx / 2 - r, hy = sy / 2 - r, hz = sz / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const d = v.sub(inner); const L = d.length();
    if (L > 1e-6) d.multiplyScalar(r / L);
    p.setXYZ(i, inner.x + d.x, inner.y + d.y, inner.z + d.z);
  }
  g.computeVertexNormals();
  return g;
}
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { if (rz) g.rotateZ(rz); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };

const TRIMS = [
  { seat: [0.028, 0.028, 0.03], seatR: 0.55, dash: [0.03, 0.03, 0.032], soft: [0.06, 0.06, 0.062], stitch: [0.09, 0.09, 0.09] }, // black leather
  { seat: [0.075, 0.075, 0.08], seatR: 0.95, dash: [0.035, 0.035, 0.037], soft: [0.07, 0.07, 0.072], stitch: [0.11, 0.11, 0.115] }, // charcoal cloth
  { seat: [0.36, 0.25, 0.15], seatR: 0.6, dash: [0.03, 0.028, 0.026], soft: [0.3, 0.22, 0.14], stitch: [0.42, 0.32, 0.2] }, // tan leather
  { seat: [0.2, 0.2, 0.21], seatR: 0.95, dash: [0.05, 0.05, 0.052], soft: [0.16, 0.16, 0.17], stitch: [0.24, 0.24, 0.25] }, // grey cloth
];
function trimFor(s) {
  if (s.livery || s.bar === 'siren' || s.box || s.bus) return TRIMS[s.bus ? 3 : 0];
  const h = Math.abs(Math.round((s.L * 131 + s.W * 71 + s.roof * 53) * 10)) % TRIMS.length;
  return TRIMS[h];
}

// one front seat: cushion, bolsters, backrest, headrest on posts
function seat(T, x, py, pz, th, wide = 0.5) {
  const cy = py - 0.11, cz = pz + 0.16;
  paint(at(rbox(wide, 0.13, 0.5, 0.045), x, cy, cz, -0.1), T.seat, T.seatR, 0);
  for (const sx of [-1, 1]) paint(at(rbox(0.07, 0.07, 0.46, 0.03), x + sx * (wide / 2 - 0.035), cy + 0.07, cz, -0.1), T.seat, T.seatR, 0);
  // backrest along the reclined spine
  const [by, bz] = recl(0.3, -0.17, th);
  paint(at(rbox(wide, 0.66, 0.13, 0.05), x, py + by, pz + bz, -th), T.seat, T.seatR, 0);
  for (const sx of [-1, 1]) { const [sy, sz] = recl(0.28, -0.11, th); paint(at(rbox(0.07, 0.56, 0.08, 0.03), x + sx * (wide / 2 - 0.035), py + sy, pz + sz, -th), T.seat, T.seatR, 0); }
  // stitched centre panel (a slightly lighter insert)
  { const [iy, iz] = recl(0.3, -0.1, th); paint(at(new THREE.BoxGeometry(wide * 0.56, 0.52, 0.01), x, py + iy, pz + iz, -th), T.stitch, T.seatR, 0); }
  const [hy, hz] = recl(0.76, -0.18, th);
  paint(at(rbox(0.27, 0.18, 0.1, 0.04), x, py + hy, pz + hz, -th), T.seat, T.seatR, 0);
  for (const sx of [-0.07, 0.07]) { const [ty, tz] = recl(0.66, -0.18, th); paint(at(new THREE.CylinderGeometry(0.007, 0.007, 0.07, 6), x + sx, py + ty, pz + tz, -th), [0.5, 0.5, 0.52], 0.3, 1); }
  // seat runners on the floor
  for (const sx of [-0.17, 0.17]) paint(at(new THREE.BoxGeometry(0.03, 0.03, 0.5), x + sx, cy - 0.12, cz), [0.05, 0.05, 0.05], 0.5, 0.6);
}
function bench(T, w, py, pz, th) {
  const cy = py - 0.12, cz = pz + 0.15;
  paint(at(rbox(w, 0.14, 0.5, 0.05), 0, cy, cz, -0.08), T.seat, T.seatR, 0);
  const [by, bz] = recl(0.3, -0.17, th);
  paint(at(rbox(w, 0.64, 0.14, 0.05), 0, py + by, pz + bz, -th), T.seat, T.seatR, 0);
  for (const sx of [-1, 1]) { const [hy, hz] = recl(0.74, -0.19, th); paint(at(rbox(0.26, 0.16, 0.09, 0.04), sx * w * 0.3, py + hy, pz + hz, -th), T.seat, T.seatR, 0); }
  // fold-down armrest seam and stitching
  { const [iy, iz] = recl(0.3, -0.1, th); paint(at(new THREE.BoxGeometry(0.02, 0.5, 0.01), 0, py + iy, pz + iz, -th), T.stitch, T.seatR, 0); }
}
// a seatbelt: a strap from the pillar to the floor anchor, beside the seat
function belt(x, top, py, pz, th) {
  const a = new THREE.Vector3(x, top, pz - 0.2), b = new THREE.Vector3(x, py - 0.12, pz - 0.05);
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.BoxGeometry(0.004, L, 0.045);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.normalize());
  g.applyQuaternion(q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  paint(g, [0.02, 0.02, 0.022], 0.7, 0);
  paint(at(new THREE.BoxGeometry(0.03, 0.06, 0.04), x, top + 0.02, pz - 0.2), [0.04, 0.04, 0.04], 0.4, 0.2);
}

export function buildInterior(s) {
  const L = cabinLayout(s);
  if (!L) return null;
  parts.length = 0;
  const T = trimFor(s);
  const hw = s.hwc - 0.04, fy = L.floorY, bt = s.belt;
  const dashZ = L.dashZ, dashF = s.cabover ? s.L / 2 - 0.08 : s.zA0 + 0.3;
  // floor and carpet, wall to wall under the cabin
  const back = L.seats.length > 2 ? Math.min(...L.seats.map((q) => q.z)) - 0.45 : L.pz - 0.5;
  paint(at(new THREE.BoxGeometry(hw * 2, 0.03, dashF - back), 0, fy - 0.015, (dashF + back) / 2), [0.022, 0.022, 0.024], 0.98, 0);
  // transmission tunnel
  if (!s.cabover && !s.bus) paint(at(rbox(0.26, 0.16, dashF - back - 0.2, 0.06), 0, fy + 0.06, (dashF + back) / 2 + 0.05), [0.022, 0.022, 0.024], 0.98, 0);
  // dashboard: lower padded face, upper top pad running to the windscreen, a lip over the dials
  const dTop = Math.min(Math.max(bt + 0.04, L.wheel.y + 0.15), bt + (s.roof - bt) * 0.4);
  // where the windscreen is at a given height: the dash must stop short of the glass
  const zws = (y) => (s.cabover ? s.L / 2 - 0.1 : s.zA0) + (s.zA1 - s.zA0) * Math.min(1, Math.max(0, (y - bt) / (s.roof - bt)));
  const zf = Math.max(dashZ + 0.1, zws(dTop + 0.03) - 0.03);
  // lower dash under the belt line (runs on under the cowl), upper dash up to the glass, the top pad,
  // and the sloped defroster panel down to the base of the windscreen
  paint(at(rbox(hw * 2, bt - fy - 0.25, dashF - dashZ, 0.04), 0, (bt + fy + 0.25) / 2, (dashZ + dashF) / 2), T.dash, 0.75, 0);
  paint(at(rbox(hw * 2, dTop - bt + 0.04, zf - dashZ, 0.04), 0, (dTop + bt) / 2 - 0.02, (dashZ + zf) / 2), T.dash, 0.75, 0);
  paint(at(rbox(hw * 2, 0.05, zf - dashZ + 0.01, 0.024), 0, dTop + 0.01, (dashZ + zf) / 2), T.soft, 0.85, 0);
  if (!s.cabover) {
    const ay = bt + 0.005, az = s.zA0 - 0.04, by = dTop + 0.03, bz = zf, dy = by - ay, dz = Math.abs(bz - az);
    if (dz > 0.02) paint(at(new THREE.BoxGeometry(hw * 2 - 0.02, 0.018, Math.hypot(dy, dz)), 0, (ay + by) / 2, (az + bz) / 2, Math.atan2(dy, dz)), [0.02, 0.02, 0.022], 0.9, 0);
  }
  paint(at(rbox(0.36, 0.06, 0.16, 0.025), L.dx, dTop + 0.03, dashZ + 0.04), T.dash, 0.7, 0);
  // knee bolster and glovebox lid
  paint(at(rbox(hw * 2 - 0.1, 0.22, 0.12, 0.04), 0, fy + 0.36, dashZ + 0.12), T.dash, 0.8, 0);
  paint(at(new THREE.BoxGeometry(0.38, 0.16, 0.012), -L.dx, dTop - 0.2, dashZ - 0.005), T.soft, 0.7, 0);
  paint(at(new THREE.BoxGeometry(0.1, 0.018, 0.012), -L.dx, dTop - 0.15, dashZ - 0.012), [0.5, 0.5, 0.52], 0.3, 1);
  // air vents: four slatted outlets
  for (const vx of [hw - 0.12, 0.09, -0.09, -(hw - 0.12)]) {
    paint(at(new THREE.BoxGeometry(0.12, 0.05, 0.012), vx, dTop - 0.07, dashZ - 0.006), [0.012, 0.012, 0.012], 0.6, 0);
    for (let k = 0; k < 4; k++) paint(at(new THREE.BoxGeometry(0.11, 0.004, 0.016), vx, dTop - 0.09 + k * 0.013, dashZ - 0.01), [0.06, 0.06, 0.065], 0.4, 0.3);
  }
  // centre stack: radio screen, climate knobs, hazard switch
  const sy = dTop - 0.2;
  paint(at(rbox(0.28, 0.32, 0.08, 0.02), 0, sy - 0.06, dashZ - 0.02), T.dash, 0.6, 0);
  paint(at(new THREE.BoxGeometry(0.19, 0.1, 0.006), 0, sy + 0.02, dashZ - 0.062), [0.008, 0.01, 0.012], 0.08, 0);
  for (const kx of [-0.08, 0, 0.08]) paint(at(new THREE.CylinderGeometry(0.018, 0.02, 0.025, 14), kx, sy - 0.11, dashZ - 0.07, Math.PI / 2), [0.1, 0.1, 0.105], 0.35, 0.5);
  paint(at(new THREE.BoxGeometry(0.03, 0.02, 0.01), 0, sy - 0.05, dashZ - 0.064), [0.45, 0.04, 0.03], 0.4, 0);
  // console between the seats: gear lever with a gaiter, cup holders, armrest
  if (!s.bus) {
    const cz0 = dashZ - 0.08, cz1 = L.pz - 0.12, cH = L.py + 0.1;
    paint(at(rbox(0.22, cH - fy, cz0 - cz1, 0.04), 0, (cH + fy) / 2, (cz0 + cz1) / 2), T.dash, 0.8, 0);
    paint(at(rbox(0.24, 0.06, 0.32, 0.03), 0, cH + 0.02, cz1 + 0.16), T.soft, 0.9, 0);
    const gz = L.pz + 0.36;
    paint(at(new THREE.CylinderGeometry(0.045, 0.06, 0.06, 12), 0, cH + 0.03, gz), [0.015, 0.015, 0.015], 0.95, 0);
    paint(at(new THREE.CylinderGeometry(0.009, 0.011, 0.16, 8), 0, cH + 0.12, gz - 0.02, -0.25), [0.3, 0.3, 0.32], 0.3, 1);
    paint(at(new THREE.SphereGeometry(0.03, 12, 9), 0, cH + 0.2, gz - 0.04), [0.04, 0.04, 0.04], 0.45, 0.2);
    for (const cx of [-0.05, 0.05]) paint(at(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 14, 1, true), cx, cH + 0.008, gz - 0.16), [0.01, 0.01, 0.01], 0.6, 0);
    paint(at(new THREE.BoxGeometry(0.03, 0.025, 0.12), 0.07, cH + 0.015, gz - 0.3), [0.03, 0.03, 0.03], 0.5, 0.3); // parking brake
  }
  // pedals and dead pedal (seen when the door opens)
  for (const [px, w] of [[L.dx + 0.12, 0.05], [L.dx - 0.02, 0.09], [L.dx - 0.16, 0.07]]) paint(at(new THREE.BoxGeometry(w, 0.08, 0.015), px, fy + 0.12, dashF - 0.32, -0.5), [0.06, 0.06, 0.065], 0.5, 0.6);
  // steering column shroud
  {
    const w = L.wheel, dir = new THREE.Vector3(0, -Math.sin(w.tau), Math.cos(w.tau));
    const g = new THREE.CylinderGeometry(0.05, 0.065, 0.26, 12); g.rotateX(Math.PI / 2); g.rotateX(w.tau);
    g.translate(w.x + dir.x * 0.2, w.y + dir.y * 0.2, w.z + dir.z * 0.2);
    paint(g, T.dash, 0.7, 0);
    // stalks: indicators and wipers
    for (const sx of [-1, 1]) paint(at(new THREE.CylinderGeometry(0.006, 0.008, 0.13, 6), w.x + sx * 0.09, w.y - 0.01 - dir.y * 0.1, w.z + 0.1, 0, 0, Math.PI / 2), [0.03, 0.03, 0.03], 0.5, 0.2);
  }
  // seats
  seat(T, L.dx, L.py, L.pz, L.th);
  seat(T, -L.dx, L.py, L.pz, L.th + 0.05);
  const top = s.roof - 0.16;
  belt(hw - 0.02, top, L.py, L.pz, L.th); belt(-(hw - 0.02), top, L.py, L.pz, L.th);
  if (L.rearBench) { const r = L.seats[2]; bench(T, hw * 2 - 0.12, r.y, r.z, r.th); belt(hw - 0.03, top - 0.02, r.y, r.z, r.th); belt(-(hw - 0.03), top - 0.02, r.y, r.z, r.th); }
  if (L.bus) for (const q of L.seats.slice(2)) seat(T, q.x, q.y, q.z, q.th, 0.4);
  // behind the seats: parcel shelf over a boot, a cargo floor in hatches and SUVs, a bulkhead in vans and box trucks
  if (L.rearBench) {
    const r = L.seats[2], bz = r.z - 0.3;
    if (s.zC0 > -s.L / 2 + 0.45) paint(at(new THREE.BoxGeometry(hw * 2, 0.02, Math.max(0.05, bz - s.zC0 - 0.02)), 0, bt - 0.03, (bz + s.zC0) / 2), [0.03, 0.03, 0.032], 0.95, 0);
    else paint(at(new THREE.BoxGeometry(hw * 2, 0.02, Math.max(0.05, bz + s.L / 2 - 0.15)), 0, fy + 0.3, (bz - s.L / 2 + 0.15) / 2), [0.026, 0.026, 0.028], 0.98, 0);
  } else if (!s.bed && !L.bus) {
    const z = L.pz - 0.42;
    paint(at(new THREE.BoxGeometry(hw * 2, s.roof - fy - 0.04, 0.03), 0, (s.roof + fy) / 2 - 0.02, z), [0.12, 0.12, 0.125], 0.9, 0.1);
  }
  // headliner details: sun visors, dome light, rear-view mirror
  for (const vx of [L.dx, -L.dx]) paint(at(rbox(0.36, 0.018, 0.16, 0.008), vx, s.roof - 0.06, s.zA1 - 0.13, 0.15), [0.3, 0.29, 0.27], 0.95, 0);
  paint(at(new THREE.BoxGeometry(0.12, 0.012, 0.07), 0, s.roof - 0.045, (s.zA1 + L.pz) / 2 - 0.1), [0.55, 0.55, 0.52], 0.4, 0);
  paint(at(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6), 0, s.roof - 0.06, s.zA1 - 0.07), [0.05, 0.05, 0.05], 0.5, 0);
  paint(at(rbox(0.25, 0.07, 0.025, 0.012), 0, s.roof - 0.11, s.zA1 - 0.09), [0.03, 0.03, 0.03], 0.4, 0);
  paint(at(new THREE.BoxGeometry(0.23, 0.055, 0.004), 0, s.roof - 0.11, s.zA1 - 0.104), [0.55, 0.57, 0.6], 0.02, 1);
  // door pulls and window switches on the door cards (front doors)
  for (const sx of [-1, 1]) {
    paint(at(rbox(0.05, 0.035, 0.3, 0.012), sx * (s.hwc + 0.02), bt - 0.17, L.pz + 0.18), T.soft, 0.85, 0);
    paint(at(new THREE.BoxGeometry(0.02, 0.012, 0.1), sx * (s.hwc + 0.0), bt - 0.15, L.pz + 0.32), [0.02, 0.02, 0.02], 0.5, 0);
  }
  const g = mergeGeometries(parts);
  parts.length = 0;
  g.computeBoundingSphere();
  return g;
}

// steering wheel in its own frame: rim in the XY plane, +Z toward the dash
export function wheelGeometryCab() {
  parts.length = 0;
  const R = 0.185;
  paint(new THREE.TorusGeometry(R, 0.017, 10, 40), [0.02, 0.02, 0.022], 0.6, 0);
  // thumb grips and the leather seam
  for (const a of [Math.PI * 0.25, Math.PI * 0.75]) paint(at(new THREE.TorusGeometry(R, 0.019, 8, 6, 0.32), 0, 0, 0, 0, 0, a - 0.16), [0.03, 0.03, 0.032], 0.55, 0);
  paint(at(new THREE.CylinderGeometry(0.068, 0.072, 0.05, 20), 0, 0, 0.012, Math.PI / 2), [0.022, 0.022, 0.024], 0.6, 0);
  paint(at(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 16), 0, 0, -0.016, Math.PI / 2), [0.6, 0.6, 0.62], 0.25, 1);
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const L = R - 0.065, g = new THREE.BoxGeometry(L, 0.035, 0.016);
    g.translate(0.065 + L / 2 - 0.01, 0, 0.006); g.rotateZ(a);
    paint(g, [0.026, 0.026, 0.028], 0.55, 0);
  }
  // horn-pad buttons on the spokes
  for (const sx of [-1, 1]) paint(at(new THREE.BoxGeometry(0.022, 0.014, 0.006), sx * 0.1, 0.006, -0.004), [0.12, 0.12, 0.13], 0.4, 0.4);
  const g = mergeGeometries(parts);
  parts.length = 0;
  return g;
}

// the instrument dials (speedometer and tachometer) as a texture
let dialMat = null, needleMat = null;
export function dialMaterials() {
  if (dialMat) return { dialMat, needleMat };
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#050506'; x.fillRect(0, 0, 512, 256);
  const dial = (cx, max, step, label, red) => {
    const cy = 128, r = 116;
    x.fillStyle = '#0b0c0e'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#8a8c90'; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, r - 2, 0, Math.PI * 2); x.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    if (red) { x.strokeStyle = '#c0281c'; x.lineWidth = 10; x.beginPath(); x.arc(cx, cy, r - 14, a0 + (a1 - a0) * red, a1); x.stroke(); }
    for (let v = 0; v <= max; v += step / 2) {
      const a = a0 + (a1 - a0) * (v / max), big = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      x.strokeStyle = '#f2f2ee'; x.lineWidth = big ? 4 : 2;
      x.beginPath(); x.moveTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)); x.lineTo(cx + Math.cos(a) * (r - (big ? 26 : 18)), cy + Math.sin(a) * (r - (big ? 26 : 18))); x.stroke();
      if (big) { x.fillStyle = '#f2f2ee'; x.font = 'bold 19px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(v), cx + Math.cos(a) * (r - 46), cy + Math.sin(a) * (r - 46)); }
    }
    x.fillStyle = '#9a9ca0'; x.font = '15px Arial'; x.fillText(label, cx, cy + 52);
  };
  dial(128, 140, 20, 'MPH', 0);
  dial(384, 8, 1, 'RPM ×1000', 0.78);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  dialMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0 });
  needleMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a });
  return { dialMat, needleMat };
}
export function dialGeometry() {
  const g = [];
  for (const [ox, u0] of [[0.075, 0], [-0.075, 0.5]]) {
    const c = new THREE.CircleGeometry(0.056, 28);
    const uv = c.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * 0.5);
    c.translate(ox, 0, 0); g.push(c);
  }
  return mergeGeometries(g);
}

// ------------------------------------------------------------ doors
// Split the front doors (skin, window, frame and the mirror) out of the body
// mesh so they can swing open on a hinge. The pieces share the body's vertex
// buffers; only the triangle lists differ.
export function splitDoors(s, geo) {
  if (geo.userData.doors !== undefined) return geo.userData.doors;
  let out = null;
  if (!s.cabover && !s.bus && geo.index) {
    const doorF = s.axF - s.Rw - 0.14;
    const zRear = s.zB > -50 ? s.zB : Math.max(doorF - 1.15, s.zC0 + 0.05, s.glassBack > -50 ? s.glassBack : -99);
    const mz = s.zA0 - 0.12;
    const P = geo.attributes.position.array, N = geo.attributes.normal.array, I = geo.index.array;
    const body = [], doors = [[], []]; // [driver +x, passenger -x]
    const zws = (y) => s.zA0 + (s.zA1 - s.zA0) * Math.min(1, Math.max(0, (y - s.belt) / (s.roof - s.belt)));
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const x = (P[a] + P[b] + P[c]) / 3, y = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, z = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
      const nx = (N[a] + N[b] + N[c]) / 3;
      const ax = Math.abs(x);
      let door = false;
      const mirror = ax > s.hwc - 0.02 && y > s.belt - 0.06 && y < s.belt + 0.16 && Math.abs(z - mz) < 0.17 && mz < doorF;
      if (mirror) door = true;
      else if (z < doorF && z > zRear && y > s.ride + 0.12 && y < s.roof - 0.06 && ax > s.hwc - 0.2) {
        if (y < s.belt - 0.06) door = Math.abs(nx) > 0.35 && ax > s.W / 2 - 0.2;
        else if (y < s.belt + 0.04) door = ax > s.hwc - 0.06;
        else door = Math.abs(nx) > 0.3 && z < zws(y) - 0.1 && (s.zB < -50 || z > s.zB + 0.05);
      }
      if (door) doors[x > 0 ? 0 : 1].push(I[t], I[t + 1], I[t + 2]); else body.push(I[t], I[t + 1], I[t + 2]);
    }
    if (doors[0].length > 30 && doors[1].length > 30) {
      const mk = (idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', geo.attributes.position); g.setAttribute('normal', geo.attributes.normal); g.setIndex(idx); g.computeBoundingSphere(); return g; };
      out = {
        body: mk(body),
        doors: [
          { name: 'door-drv', geo: mk(doors[0]), hinge: [s.W / 2 - 0.04, doorF + 0.01], open: -1.15 },
          { name: 'door-pass', geo: mk(doors[1]), hinge: [-(s.W / 2 - 0.04), doorF + 0.01], open: 1.15 },
        ],
      };
    }
  }
  geo.userData.doors = out;
  return out;
}
