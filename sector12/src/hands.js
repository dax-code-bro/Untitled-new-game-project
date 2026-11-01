// Articulated first-person hands.
//
// Each hand is a small skeleton: a palm and five fingers with three jointed phalanges each (the
// thumb has its own opposing base joint). Every joint is driven every frame from a pose: per-finger
// curl, spread and thumb opposition, eased with springs so fingers close, open, tap and squeeze
// naturally instead of snapping. The glove is a tactical one: padded palm, hard knuckle guard, a
// velcro wrist strap, and cut-off trigger finger and thumb tips showing skin.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ease = (cur, target, k) => cur + (target - cur) * k;

// lathe along +Z: pts are [z, radius]
function seg(pts, sx = 1, sy = 0.86, n = 12) {
  const g = new THREE.LatheGeometry(pts.map(([z, r]) => new THREE.Vector2(Math.max(0.0004, r), z)), n);
  g.rotateX(Math.PI / 2);
  g.scale(sx, sy, 1);
  g.computeVertexNormals();
  return g;
}
function rbox(w, h, d, r) {
  const g = new THREE.BoxGeometry(w, h, d, 4, 4, 4);
  const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const d2 = v.sub(c);
    if (d2.lengthSq() > 0) d2.setLength(r);
    p.setXYZ(i, c.x + d2.x, c.y + d2.y, c.z + d2.z);
  }
  g.computeVertexNormals();
  return g;
}
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
const merge = (gs) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)), false);

// finger lengths (m) and radii, index..pinky; thumb separately
const FINGERS = [
  { name: 'index', x: 0.027, len: [0.044, 0.026, 0.021], r: 0.0094, splay: 0.07 },
  { name: 'middle', x: 0.008, len: [0.049, 0.03, 0.023], r: 0.0098, splay: 0.0 },
  { name: 'ring', x: -0.011, len: [0.046, 0.028, 0.022], r: 0.0092, splay: -0.06 },
  { name: 'pinky', x: -0.028, len: [0.036, 0.021, 0.019], r: 0.0082, splay: -0.14 },
];
const THUMB = { len: [0.042, 0.032, 0.026], r: 0.0108 };

export const POSES = {
  //            thumb  index  middle ring  pinky  spread  opposition
  relaxed: [[0.25, 0.22, 0.3, 0.36, 0.42], 0.06, 0.3],
  open: [[0.08, 0.06, 0.08, 0.1, 0.14], 0.2, 0.15],
  reach: [[0.18, 0.12, 0.16, 0.2, 0.26], 0.14, 0.4],
  grip: [[0.72, 0.42, 0.86, 0.9, 0.92], 0.0, 0.85],          // pistol grip, index on the trigger
  gripSafe: [[0.72, 0.06, 0.86, 0.9, 0.92], 0.02, 0.85],     // index laid straight along the frame
  gripPull: [[0.72, 0.64, 0.88, 0.92, 0.94], 0.0, 0.85],
  fore: [[0.42, 0.56, 0.62, 0.66, 0.7], 0.04, 0.5],          // wrapped round a handguard
  cup: [[0.55, 0.72, 0.8, 0.84, 0.86], 0.0, 0.7],            // support hand over the pistol grip
  mag: [[0.6, 0.58, 0.66, 0.72, 0.78], 0.02, 0.9],           // holding a magazine
  pinch: [[0.62, 0.58, 0.84, 0.9, 0.92], 0.0, 1.0],          // charging handle / bolt knob
  flat: [[0.12, 0.1, 0.1, 0.12, 0.14], 0.05, 0.2],           // palm slap
  fist: [[0.85, 0.95, 0.98, 0.98, 0.98], 0.0, 0.7],
  knife: [[0.75, 0.85, 0.92, 0.95, 0.96], 0.0, 0.8],
  syringe: [[0.55, 0.75, 0.82, 0.86, 0.9], 0.0, 0.8],
  hold: [[0.5, 0.5, 0.55, 0.6, 0.65], 0.05, 0.75],
};

export class Hand {
  // side: 1 right, -1 left; mats: {glove, plate, skin, strap}
  constructor(side, mats) {
    this.side = side;
    this.root = new THREE.Group();
    this.root.matrixAutoUpdate = false;
    const s = side;
    // ---- palm: padded, slightly cupped, with knuckle guard and back plate
    const palm = [];
    const p0 = rbox(0.084, 0.03, 0.098, 0.012);
    const pp = p0.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), z = pp.getZ(i); pp.setY(i, pp.getY(i) - x * x * 1.6 + (z > 0.03 ? -0.003 : 0)); }
    p0.computeVertexNormals();
    palm.push(at(p0, 0, 0, 0.05));
    palm.push(at(new THREE.SphereGeometry(0.015, 12, 8).scale(1, 0.6, 1.4), s * 0.026, -0.01, 0.032)); // thenar pad
    palm.push(at(new THREE.SphereGeometry(0.012, 10, 8).scale(1, 0.55, 1.5), -s * 0.03, -0.01, 0.045)); // hypothenar
    palm.push(at(seg([[-0.01, 0.0], [-0.008, 0.04], [0.02, 0.043], [0.03, 0.0]], 1.05, 0.72, 14), 0, 0, -0.012)); // wrist
    this.root.add(new THREE.Mesh(merge(palm), mats.glove));
    const hard = [at(rbox(0.078, 0.01, 0.022, 0.0045), 0, 0.013, 0.087, -0.1), at(rbox(0.056, 0.006, 0.05, 0.003), 0, 0.0145, 0.042)];
    for (let i = 0; i < 4; i++) hard.push(at(rbox(0.015, 0.007, 0.016, 0.0035), s * (0.027 - i * 0.0185), 0.018, 0.09, -0.15));
    this.root.add(new THREE.Mesh(merge(hard), mats.plate));
    const band = seg([[-0.01, 0.0], [-0.009, 0.041], [0.011, 0.041], [0.012, 0.0]], 1.0, 0.66, 20);
    this.root.add(new THREE.Mesh(merge([at(band, 0, 0, 0.0), at(rbox(0.024, 0.012, 0.026, 0.004), s * 0.03, 0.026, 0.0)]), mats.strap)); // velcro wrist strap
    // ---- fingers: knuckle -> proximal -> middle -> distal
    this.fingers = FINGERS.map((F, fi) => {
      const base = new THREE.Group();
      base.position.set(s * F.x, -0.002, 0.097);
      this.root.add(base);
      const joints = [base];
      let parent = base;
      const r = F.r;
      for (let k = 0; k < 3; k++) {
        const L = F.len[k], r0 = r * (1 - k * 0.12), r1 = r * (1 - (k + 1) * 0.12);
        const tipSkin = k === 2 && fi === 0; // cut-off trigger finger tip
        const tip = (L, r0, r1) => [[-r0 * 0.4, 0], [-r0 * 0.15, r0 * 0.95], [L * 0.5, r1 * 1.0], [L - r1 * 0.6, r1 * 0.98], [L - r1 * 0.25, r1 * 0.85], [L, r1 * 0.55], [L + r1 * 0.12, 0]];
        const g = seg(k === 2 ? tip(L, r0, r1) : [[-r0 * 0.5, 0], [-r0 * 0.25, r0 * 1.02], [L * 0.5, r0 * 0.94], [L, r1 * 1.0], [L + r1 * 0.4, 0]]);
        const m = new THREE.Mesh(g, tipSkin ? mats.skin : mats.glove);
        parent.add(m);
        if (k === 0) { const kp = new THREE.Mesh(at(rbox(r * 1.7, 0.006, L * 0.6, 0.0028), 0, r * 0.95, L * 0.45), mats.plate); parent.add(kp); }
        if (tipSkin) parent.add(new THREE.Mesh(at(seg([[0, r0 * 1.05], [0.004, r0 * 1.05], [0.0045, 0]], 1, 0.86, 12), 0, 0, -0.001), mats.glove)); // glove edge
        if (k < 2) { const j = new THREE.Group(); j.position.z = L; parent.add(j); joints.push(j); parent = j; }
      }
      return { F, joints, curl: 0.3 };
    });
    // ---- thumb: oriented across the palm, with an opposition joint
    const tb = new THREE.Group();
    tb.position.set(s * 0.036, -0.014, 0.022);
    this.root.add(tb);
    this.thumbBase = tb;
    const tj = [];
    let parent = tb;
    for (let k = 0; k < 3; k++) {
      const L = THUMB.len[k], r0 = THUMB.r * (1 - k * 0.1), r1 = THUMB.r * (1 - (k + 1) * 0.1);
      const g = seg(k === 2 ? [[-r0 * 0.4, 0], [-r0 * 0.1, r0], [L * 0.5, r1], [L - r1 * 0.6, r1 * 0.97], [L - r1 * 0.2, r1 * 0.8], [L, r1 * 0.5], [L + r1 * 0.1, 0]] : [[-r0 * 0.5, 0], [-r0 * 0.25, r0 * 1.05], [L, r1 * 1.02], [L + r1 * 0.4, 0]], 1, 0.82);
      parent.add(new THREE.Mesh(g, k === 2 ? mats.skin : mats.glove));
      if (k === 0) parent.add(new THREE.Mesh(at(new THREE.SphereGeometry(0.017, 10, 8).scale(1, 0.8, 1.3), 0, -0.002, 0.018), mats.glove)); // thumb muscle
      if (k < 2) { const j = new THREE.Group(); j.position.z = L; parent.add(j); tj.push(j); parent = j; } else tj.push(null);
    }
    this.thumbJoints = [tb, tj[0], tj[1]];
    this.thumbCurl = 0.3;
    this.spread = 0.05;
    this.opp = 0.4;
    this.target = POSES.relaxed;
    this.tapT = 0;
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  }

  setPose(name, override = null) { this.target = override || POSES[name] || POSES.relaxed; }

  // squeeze: extra grip tightening (recoil), tap: 0..1 index-finger tap phase (idle fidget)
  update(dt, squeeze = 0, tap = 0) {
    const [curls, spread, opp] = this.target;
    const k = Math.min(1, dt * 14);
    this.spread = ease(this.spread, spread, k);
    this.opp = ease(this.opp, opp, k);
    const s = this.side;
    this.fingers.forEach((f, i) => {
      let c = curls[i + 1] + squeeze * 0.06;
      if (i === 0 && tap > 0) c -= Math.sin(Math.PI * tap) * 0.35;
      f.curl = ease(f.curl, Math.min(1.05, c), k * (i === 0 ? 1.4 : 1));
      const [b, j1, j2] = f.joints;
      // natural cascade: the base knuckle leads, the tips follow
      b.rotation.set(f.curl * 1.35, s * (f.F.splay * (1 + this.spread * 6)) , 0, 'YXZ');
      j1.rotation.x = f.curl * 1.62;
      j2.rotation.x = f.curl * 1.05;
    });
    this.thumbCurl = ease(this.thumbCurl, curls[0] + squeeze * 0.05, k);
    const [tb, t1, t2] = this.thumbJoints;
    // the thumb swings across the palm (opposition) and folds at its two joints
    tb.rotation.set(0.3 + this.opp * 0.35, s * (0.42 - this.opp * 0.32), s * (0.45 + this.opp * 0.65), 'YXZ');
    t1.rotation.x = this.thumbCurl * 0.85;
    t2.rotation.x = this.thumbCurl * 1.05;
  }
}

// Detailed sleeve pieces for the first-person arms: fabric with folds, a cuff and an elbow pad.
// Built along +Y (shoulder -> elbow, elbow -> wrist).
export function sleeveGeometry(kind) {
  const prof = kind === 'upper'
    ? [[-0.03, 0.0], [-0.02, 0.062], [0.05, 0.07], [0.14, 0.064], [0.22, 0.06], [0.29, 0.056], [0.31, 0.0]]
    : [[-0.02, 0.0], [-0.01, 0.058], [0.08, 0.06], [0.16, 0.054], [0.205, 0.05], [0.215, 0.0]];
  const g = new THREE.LatheGeometry(prof.map(([y, r]) => new THREE.Vector2(Math.max(0.0005, r), y)), 24, 0, Math.PI * 2);
  g.scale(1, 1, 0.92);
  // fabric folds: rings bunched towards the joints, plus some lumpy noise
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x), r = Math.hypot(x, z);
    if (r < 0.002) continue;
    const fold = Math.sin(y * (kind === 'upper' ? 70 : 95) + Math.sin(a * 3) * 1.5) * 0.0035 * (0.5 + Math.abs(Math.sin(a * 2 + y * 20)))
      + Math.sin(a * 7 + y * 31) * 0.0012;
    const k = (r + fold) / r;
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export function cuffGeometry() {
  const parts = [];
  const cuff = new THREE.LatheGeometry([[0.0, 0.052], [0.008, 0.054], [0.028, 0.054], [0.034, 0.05]].map(([y, r]) => new THREE.Vector2(r, y)), 24);
  cuff.scale(1, 1, 0.9);
  parts.push(at(cuff, 0, 0.19, 0));
  parts.push(at(rbox(0.03, 0.026, 0.012, 0.004), 0.04, 0.205, 0.03)); // velcro tab
  return merge(parts);
}

export function elbowPadGeometry() {
  const g = new THREE.SphereGeometry(0.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.3);
  g.scale(1, 0.55, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.285, -0.045);
  return g;
}

// a field watch on the left wrist: strap, case, glowing dial
export function watchGeometry() {
  const strap = new THREE.TorusGeometry(0.045, 0.006, 6, 24); strap.rotateX(Math.PI / 2); strap.scale(1, 1, 0.88); strap.translate(0, 0.243, 0);
  const watchCase = new THREE.CylinderGeometry(0.018, 0.019, 0.01, 20); watchCase.rotateX(Math.PI / 2); watchCase.translate(0, 0.243, 0.044);
  const dial = new THREE.CircleGeometry(0.015, 20); dial.translate(0, 0.243, 0.0496);
  return { band: merge([strap, watchCase]), dial };
}
