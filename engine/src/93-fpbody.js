/* ============================================================
   A body you can look down at.

   Everything below is measured, not eyeballed. The phalanx lengths
   are the mean adult male values from the standard hand-anthropometry
   tables (Buryanov & Kotiuk); segment lengths for the arm and leg are
   the usual stature fractions (upper arm 0.186 H, forearm 0.146 H,
   thigh 0.245 H, shank 0.246 H) taken at 1.78 m. A hand modelled to
   those numbers looks like a hand without anyone having to art-direct
   it, and — more usefully — a grip built on real bone lengths closes
   around a real 34 mm rifle wrist without the fingers passing through
   the stock.

   Convention for every part in here:
     +Z runs distally, down the bone, away from the joint
     +Y is the back of the hand / the front of the thigh
     +X is the radial (thumb) side on the right hand
   The origin is the proximal joint, which is what makes forward
   kinematics a two-line loop rather than a pile of offsets.
   ============================================================ */

const FP_STATURE = 1.78;

/* Segment lengths, metres. */
const FP_SEG = {
  upperArm: 0.186 * FP_STATURE,   // acromion -> lateral epicondyle
  forearm: 0.146 * FP_STATURE,    // epicondyle -> ulnar styloid
  palm: 0.107,                    // wrist crease -> knuckle line
  thigh: 0.245 * FP_STATURE,
  shank: 0.246 * FP_STATURE,
  foot: 0.265,
};

/* Phalanges, metres, mean adult male. mc is the metacarpal, which for
   the fingers is inside the palm and only matters for where the knuckle
   sits; for the thumb it is a moving bone and gets its own segment. */
const FP_DIGIT = {
  thumb:  { mc: 0.0462, pp: 0.0316, ip: 0,      dp: 0.0217, w: 0.0215 },
  index:  { mc: 0.0680, pp: 0.0398, ip: 0.0224, dp: 0.0158, w: 0.0195 },
  middle: { mc: 0.0646, pp: 0.0446, ip: 0.0263, dp: 0.0174, w: 0.0195 },
  ring:   { mc: 0.0580, pp: 0.0414, ip: 0.0257, dp: 0.0173, w: 0.0182 },
  little: { mc: 0.0537, pp: 0.0327, ip: 0.0181, dp: 0.0158, w: 0.0160 },
};

const FP_FINGERS = ['index', 'middle', 'ring', 'little'];

/* Skin, and what goes over it. Skin is dielectric and quite rough —
   a shiny hand is the single loudest tell that a model is fake. */
const FP_MATERIAL = {
  skin:     { color: 0xc99274, roughness: 0.62, metalness: 0 },
  skinDark: { color: 0x8d5a3c, roughness: 0.62, metalness: 0 },
  skinPale: { color: 0xe0b394, roughness: 0.60, metalness: 0 },
  nail:     { color: 0xe6c3ad, roughness: 0.34, metalness: 0 },
  linen:    { color: 0x8a7c62, roughness: 0.92, metalness: 0 },
  wool:     { color: 0x5c5348, roughness: 0.95, metalness: 0 },
  canvas:   { color: 0x5f5744, roughness: 0.90, metalness: 0 },
  denim:    { color: 0x445a71, roughness: 0.88, metalness: 0 },
  hide:     { color: 0x7a5a3c, roughness: 0.80, metalness: 0 },
  fur:      { color: 0x6b563e, roughness: 0.95, metalness: 0 },
  boot:     { color: 0x3c3128, roughness: 0.66, metalness: 0 },
  rubber:   { color: 0x22201e, roughness: 0.88, metalness: 0 },
  blood:    { color: 0x5a1512, roughness: 0.42, metalness: 0 },
  bruise:   { color: 0x5b3f5e, roughness: 0.64, metalness: 0 },
  bandage:  { color: 0xd6cdba, roughness: 0.93, metalness: 0 },
  dirt:     { color: 0x6b5a44, roughness: 0.95, metalness: 0 },
};

/* ---------------- geometry helpers ----------------
   Local, because this file loads before the human builder and cannot
   borrow its lofter. They are small. */

function fpRing(g, cx, cy, cz, rx, ry, seg, uvV, out) {
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    out.push(g.vert(cx + c * rx, cy + s * ry, cz, c * ry, s * rx, 0, i / seg, uvV));
  }
}

/* A limb segment: a superellipse-ish tube swept along +Z from z=0 to
   z=len, radii interpolated through `profile` entries [t, rx, ry]. */
function fpTube(g, len, profile, opts = {}) {
  const seg = opts.segments || 12;
  const rings = [];
  for (const [t, rx, ry] of profile) {
    const idx = [];
    fpRing(g, (opts.bowX || 0) * Math.sin(t * Math.PI), (opts.bowY || 0) * Math.sin(t * Math.PI),
      t * len, rx, ry, seg, t, idx);
    rings.push(idx);
  }
  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r], b = rings[r + 1];
    for (let i = 0; i < seg; i++) g.quad(a[i], a[i + 1], b[i + 1], b[i]);
  }
  // Caps. The distal one is domed when it is a fingertip.
  if (opts.capStart !== false) {
    const p = profile[0];
    const c = g.vert(0, 0, 0, 0, 0, -1, 0.5, 0);
    for (let i = 0; i < seg; i++) g.tri(c, rings[0][i], rings[0][i + 1]);
    void p;
  }
  if (opts.dome) {
    const last = profile[profile.length - 1];
    const rx = last[1], ry = last[2];
    const steps = 4;
    let prev = rings[rings.length - 1];
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      const k = Math.cos(f * Math.PI * 0.5);
      const idx = [];
      fpRing(g, 0, 0, len + Math.sin(f * Math.PI * 0.5) * ry * 0.95,
        Math.max(1e-4, rx * k), Math.max(1e-4, ry * k), seg, 1, idx);
      for (let i = 0; i < seg; i++) g.quad(prev[i], prev[i + 1], idx[i + 1], idx[i]);
      prev = idx;
    }
  } else if (opts.capEnd !== false) {
    const c = g.vert(0, 0, len, 0, 0, 1, 0.5, 1);
    const r = rings[rings.length - 1];
    for (let i = 0; i < seg; i++) g.tri(c, r[i + 1], r[i]);
  }
  return g;
}

/* One phalanx. Fingers are not cylinders: the pad side is flatter and
   wider than the nail side, the joint is the widest part, and — the
   thing that matters most once the finger bends — each segment has a
   rounded proximal end that starts *behind* its joint. Without that,
   every bent knuckle shows the flat disc that caps the segment, which
   is the black band that gives away every hand built as a stack of
   tubes. */
function phalanxGeometry(len, width, kind) {
  const g = new Geometry();
  const rx = width * 0.5;
  const ry = width * 0.5 * (kind === 'distal' ? 0.82 : 0.88);
  const seg = 10;
  const back = width * 0.34;               // how far behind the joint it starts
  const rows = [
    [-back, 0.62, 0.60],
    [-back * 0.45, 0.90, 0.88],
    [0.00, 1.00, 1.02],                    // the knuckle: the widest ring
    [len * 0.20, 0.91, 0.93],
    [len * 0.58, 0.89, 0.91],
    [len * 0.86, kind === 'distal' ? 0.80 : 0.97, kind === 'distal' ? 0.78 : 0.99],
    [len, kind === 'distal' ? 0.64 : 0.93, kind === 'distal' ? 0.60 : 0.95],
  ];
  const e = 2.3;
  const ringAt = (z, fx, fy) => {
    const idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const px = Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
      // The pad is flatter than the back of the finger.
      const py = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e) * (sn < 0 ? 0.86 : 1);
      idx.push(g.vert(px * rx * fx, py * ry * fy, z, px, py, 0, i / seg, z / len));
    }
    return idx;
  };
  const rings = rows.map(([z, fx, fy]) => ringAt(z, fx, fy));
  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r], b = rings[r + 1];
    for (let i = 0; i < seg; i++) g.quad(a[i], a[i + 1], b[i + 1], b[i]);
  }
  // Domed at both ends: a knuckle behind, a fingertip in front.
  const dome = (ring, z0, fx, fy, dir) => {
    let prev = ring;
    const steps = 3;
    for (let sIdx = 1; sIdx <= steps; sIdx++) {
      const t = sIdx / steps;
      const k = Math.cos(t * Math.PI * 0.5);
      const z = z0 + dir * Math.sin(t * Math.PI * 0.5) * ry * fy * 0.92;
      prev = (() => {
        const idx = ringAt(z, fx * k, fy * k);
        for (let i = 0; i < seg; i++) {
          if (dir > 0) g.quad(prev[i], prev[i + 1], idx[i + 1], idx[i]);
          else g.quad(prev[i], idx[i], idx[i + 1], prev[i + 1]);
        }
        return idx;
      })();
    }
  };
  dome(rings[0], -back, rows[0][1], rows[0][2], -1);
  const lastRow = rows[rows.length - 1];
  dome(rings[rings.length - 1], len, lastRow[1], lastRow[2], 1);

  if (kind === 'distal') {
    /* The nail. A shell laid on the dorsal surface, following it, not a
       flat card sunk into it — a nail is the one part of a finger that
       catches light differently, and it has to sit on the curve to do
       that. */
    const z0 = len * 0.26, z1 = len * 0.94;
    const cols = 5, rowsN = 4;
    const grid = [];
    for (let r = 0; r <= rowsN; r++) {
      const tz = r / rowsN;
      const z = z0 + (z1 - z0) * tz;
      // Match the body's radius at this z.
      const f = tz < 0.75 ? 0.90 : 0.90 - (tz - 0.75) * 0.9;
      const line = [];
      for (let c = 0; c <= cols; c++) {
        const u = (c / cols) * 2 - 1;                       // -1..1 across
        const w = 0.46 * (1 - tz * 0.12);
        const a = Math.asin(Math.max(-1, Math.min(1, u * w)));
        const px = Math.sin(a), py = Math.cos(a);
        const nl = Math.hypot(px, py) || 1;
        line.push(g.vert(px * rx * f * 1.005, py * ry * f * 1.012, z, px / nl, py / nl, 0,
          (c / cols), tz));
      }
      grid.push(line);
    }
    for (let r = 0; r < rowsN; r++) {
      for (let c = 0; c < cols; c++) {
        g.quad(grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]);
      }
    }
  }
  g.computeBounds();
  return g;
}

/* A tube swept between two points, with its cross-section oriented by
   an explicit up vector. The palm is built out of these — four
   metacarpals, a thenar mound and a hypothenar one — because a palm
   built as one lofted slab reads as a block of wood no matter how the
   profile is tuned. Overlapping masses is how a hand is actually put
   together, and the seams between them are the knuckle grooves. */
function fpTubeBetween(g, from, to, profile, up, seg = 10, opts = {}) {
  const fx = to[0] - from[0], fy = to[1] - from[1], fz = to[2] - from[2];
  const flen = Math.hypot(fx, fy, fz) || 1e-6;
  const f = [fx / flen, fy / flen, fz / flen];
  let r = [up[1] * f[2] - up[2] * f[1], up[2] * f[0] - up[0] * f[2], up[0] * f[1] - up[1] * f[0]];
  let rl = Math.hypot(r[0], r[1], r[2]);
  if (rl < 1e-6) { r = [1, 0, 0]; rl = 1; }
  r = [r[0] / rl, r[1] / rl, r[2] / rl];
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  const e = opts.e || 2.2;
  const rings = [];
  for (const [t, rx, ry] of profile) {
    const cx0 = from[0] + f[0] * t * flen, cy0 = from[1] + f[1] * t * flen, cz0 = from[2] + f[2] * t * flen;
    const idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const px = Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
      const py = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e);
      const nx = r[0] * px * ry + u[0] * py * rx;
      const ny = r[1] * px * ry + u[1] * py * rx;
      const nz = r[2] * px * ry + u[2] * py * rx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      idx.push(g.vert(
        cx0 + r[0] * px * rx + u[0] * py * ry,
        cy0 + r[1] * px * rx + u[1] * py * ry,
        cz0 + r[2] * px * rx + u[2] * py * ry,
        nx / nl, ny / nl, nz / nl, i / seg, t,
      ));
    }
    rings.push(idx);
  }
  for (let k = 0; k < rings.length - 1; k++) {
    const a = rings[k], b = rings[k + 1];
    for (let i = 0; i < seg; i++) g.quad(a[i], a[i + 1], b[i + 1], b[i]);
  }
  // Rounded ends, so a mass never shows a flat disc where it meets another.
  const cap = (ring, at, sign) => {
    const p0 = profile[at], rx = p0[1], ry = p0[2];
    const base = [from[0] + f[0] * p0[0] * flen, from[1] + f[1] * p0[0] * flen, from[2] + f[2] * p0[0] * flen];
    let prev = ring;
    const steps = 3;
    for (let sIdx = 1; sIdx <= steps; sIdx++) {
      const tt = sIdx / steps;
      const k = Math.cos(tt * Math.PI * 0.5);
      const push = Math.sin(tt * Math.PI * 0.5) * Math.min(rx, ry) * 0.9 * sign;
      const idx = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const c = Math.cos(a), sn = Math.sin(a);
        const px = Math.sign(c) * Math.pow(Math.abs(c), 2 / e) * k;
        const py = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e) * k;
        const vx = base[0] + r[0] * px * rx + u[0] * py * ry + f[0] * push;
        const vy = base[1] + r[1] * px * rx + u[1] * py * ry + f[1] * push;
        const vz = base[2] + r[2] * px * rx + u[2] * py * ry + f[2] * push;
        idx.push(g.vert(vx, vy, vz,
          r[0] * px + u[0] * py + f[0] * sign, r[1] * px + u[1] * py + f[1] * sign,
          r[2] * px + u[2] * py + f[2] * sign, i / seg, at ? 1 : 0));
      }
      for (let i = 0; i < seg; i++) {
        if (sign > 0) g.quad(prev[i], prev[i + 1], idx[i + 1], idx[i]);
        else g.quad(prev[i], idx[i], idx[i + 1], prev[i + 1]);
      }
      prev = idx;
    }
  };
  if (opts.capStart !== false) cap(rings[0], 0, -1);
  if (opts.capEnd !== false) cap(rings[rings.length - 1], profile.length - 1, 1);
  return g;
}

/* Where each metacarpal head — the knuckle — sits on the knuckle line,
   and where its base sits on the carpus. Shared with the bone rig so
   the fingers grow out of the knuckles they are drawn on. */
const FP_KNUCKLE = {
  index:  { x: 0.0295, z: 1.000, base: 0.0130, fan: -0.06, drop: 0.0000, r: 0.0110 },
  middle: { x: 0.0095, z: 1.032, base: 0.0042, fan: -0.01, drop: 0.0000, r: 0.0112 },
  ring:   { x: -0.0110, z: 0.988, base: -0.0048, fan: 0.05, drop: -0.0015, r: 0.0104 },
  little: { x: -0.0300, z: 0.912, base: -0.0140, fan: 0.13, drop: -0.0040, r: 0.0092 },
};

/* The palm. Four metacarpals fused, a thenar mound under the thumb and
   a hypothenar one under the little finger, with a thin web filling the
   spaces between. The knuckle line arches because the middle metacarpal
   is the longest — which is why a fist has a high middle knuckle, and
   why a hand drawn with a straight knuckle line looks like a glove. */
function palmGeometry(side) {
  const g = new Geometry();
  const L = FP_SEG.palm;
  const S = side;
  const up = [0, 1, 0];

  // The web between the metacarpals: thin, and set back from the
  // knuckles so it does not fill the grooves.
  fpTubeBetween(g, [0.001 * S, 0, 0.004], [0.001 * S, -0.001, L * 0.86], [
    [0.00, 0.0250, 0.0120],
    [0.22, 0.0300, 0.0140],
    [0.60, 0.0330, 0.0135],
    [1.00, 0.0325, 0.0112],
  ], up, 14, { e: 2.8 });

  for (const name of FP_FINGERS) {
    const k = FP_KNUCKLE[name];
    // A metacarpal is not straight: it arches upward over its length,
    // which is the longitudinal arch of the hand.
    fpTubeBetween(g,
      [k.base * S, -0.0035, 0.006],
      [k.x * S, k.drop + 0.0025, L * k.z - 0.004], [
        [0.00, 0.0080, 0.0075],
        [0.30, 0.0084, 0.0080],
        [0.72, 0.0092, 0.0088],
        [0.90, k.r, k.r * 0.96],       // the knuckle, the widest point
        [1.00, k.r * 0.90, k.r * 0.88],
      ], up, 10, { e: 2.0 });
  }

  /* Thenar: the muscle at the base of the thumb, and by some way the
     biggest single mass in a palm. Its absence is why a modelled hand
     usually looks starved. */
  fpTubeBetween(g, [0.0130 * S, -0.0060, 0.004], [0.0270 * S, -0.0105, L * 0.50], [
    [0.00, 0.0110, 0.0090],
    [0.35, 0.0165, 0.0140],
    [0.70, 0.0170, 0.0135],
    [1.00, 0.0115, 0.0090],
  ], up, 12, { e: 2.2 });

  /* Hypothenar, on the little-finger side. Smaller, longer, and the
     thing that makes the edge of a hand a blade rather than a corner. */
  fpTubeBetween(g, [-0.0180 * S, -0.0050, 0.004], [-0.0300 * S, -0.0075, L * 0.80], [
    [0.00, 0.0105, 0.0090],
    [0.35, 0.0132, 0.0118],
    [0.75, 0.0122, 0.0105],
    [1.00, 0.0080, 0.0068],
  ], up, 12, { e: 2.2 });

  /* The wrist, which is narrow, deep and flat-sided — nothing like the
     palm above it. */
  fpTubeBetween(g, [0, -0.001, -0.026], [0, -0.002, 0.020], [
    [0.00, 0.0250, 0.0165],
    [0.55, 0.0268, 0.0178],
    [1.00, 0.0295, 0.0180],
  ], up, 14, { e: 2.6, capEnd: false });

  g.computeBounds();
  return g;
}

/* Limbs. Every one of them is built with fpTubeBetween so its ends are
   domed: a limb capped with a flat disc shows a black ring at every
   joint the moment it bends, and every joint on a body bends. Each also
   starts a little behind its own joint so the two segments overlap
   there, which is what makes an elbow an elbow rather than a hinge. */
function forearmGeometry() {
  const g = new Geometry();
  fpTubeBetween(g, [0, 0, -0.030], [0, 0, FP_SEG.forearm], [
    [0.00, 0.0430, 0.0455],
    [0.12, 0.0470, 0.0498],   // the belly of the flexors, just below the elbow
    [0.36, 0.0430, 0.0455],
    [0.66, 0.0350, 0.0378],
    [0.88, 0.0290, 0.0320],
    [1.00, 0.0268, 0.0296],
  ], [0, 1, 0], 14, { e: 2.1 });
  g.computeBounds();
  return g;
}

function upperArmGeometry() {
  const g = new Geometry();
  fpTubeBetween(g, [0, 0, -0.020], [0, 0, FP_SEG.upperArm], [
    [0.00, 0.0555, 0.0575],
    [0.20, 0.0548, 0.0578],
    [0.52, 0.0490, 0.0520],
    [0.80, 0.0420, 0.0448],
    [1.00, 0.0378, 0.0402],
  ], [0, 1, 0], 14, { e: 2.1 });
  g.computeBounds();
  return g;
}

/* The deltoid cap. Without it the arm is a pipe pushed into a chest. */
function shoulderGeometry() {
  const g = new Geometry();
  fpTubeBetween(g, [0, 0, -0.052], [0, 0, 0.062], [
    [0.00, 0.0480, 0.0490],
    [0.30, 0.0575, 0.0600],
    [0.62, 0.0625, 0.0645],
    [1.00, 0.0545, 0.0562],
  ], [0, 1, 0], 14, { e: 2.0 });
  g.computeBounds();
  return g;
}

function thighGeometry() {
  const g = new Geometry();
  fpTubeBetween(g, [0, 0, -0.040], [0, 0, FP_SEG.thigh], [
    [0.00, 0.0905, 0.0980],
    [0.22, 0.0845, 0.0918],
    [0.52, 0.0748, 0.0812],
    [0.80, 0.0640, 0.0700],
    [1.00, 0.0570, 0.0620],
  ], [0, 1, 0], 14, { e: 2.1 });
  g.computeBounds();
  return g;
}

/* The knee itself, so the thigh and shin do not simply abut. The patella
   is a real bump you can see through trousers. */
function kneeGeometry() {
  const g = new Geometry();
  fpTubeBetween(g, [0, 0.004, -0.006], [0, 0.008, 0.070], [
    [0.00, 0.0555, 0.0600],
    [0.42, 0.0592, 0.0662],
    [1.00, 0.0545, 0.0588],
  ], [0, 1, 0], 12, { e: 2.2 });
  g.computeBounds();
  return g;
}

function shankGeometry() {
  const g = new Geometry();
  // The calf sits high and behind the bone line, which is what the
  // offset on the second ring is doing.
  fpTubeBetween(g, [0, 0, -0.030], [0, -0.008, FP_SEG.shank], [
    [0.00, 0.0545, 0.0590],
    [0.20, 0.0595, 0.0672],
    [0.48, 0.0505, 0.0560],
    [0.76, 0.0400, 0.0435],
    [1.00, 0.0330, 0.0366],
  ], [0, 1, 0], 14, { e: 2.1 });
  g.computeBounds();
  return g;
}

/* A boot. Built in foot space — +Z toward the toe, +Y up, origin at the
   ankle joint — so the ankle sits 78 mm above the sole, which is where
   an ankle is. Flat underneath, because a boot is, and that flatness is
   what stops it looking like a hoof when the leg swings. */
function bootGeometry(side) {
  const g = new Geometry();
  const SOLE = -0.078;                      // ground, relative to the ankle
  const rows = [
    // z (toward the toe), halfWidth, top, bottom
    [-0.078, 0.032, 0.020, SOLE + 0.014],  // the heel counter
    [-0.062, 0.045, 0.046, SOLE],
    [-0.030, 0.052, 0.040, SOLE],
    [0.008, 0.054, 0.030, SOLE],           // the instep, the tallest of the foot
    [0.062, 0.055, 0.004, SOLE],
    [0.114, 0.053, -0.014, SOLE],          // the ball, and the widest point
    [0.160, 0.046, -0.026, SOLE + 0.001],
    [0.190, 0.030, -0.038, SOLE + 0.008],  // the toe
  ];
  const seg = 12;
  const rings = [];
  for (const [z, hw, top, bot] of rows) {
    const idx = [];
    const mid = (top + bot) * 0.5, half = (top - bot) * 0.5;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      // Very boxy: a boot is a slab with rounded corners, not a tube.
      const e = 4.0;
      const cx = Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
      let cy = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e);
      // Flat sole: clamp the lower half to the bottom plane.
      if (sn < 0) cy = -1;
      idx.push(g.vert(cx * hw * side, mid + cy * half, z, cx * side, cy, 0, i / seg, (z + 0.08) / 0.26));
    }
    rings.push(idx);
  }
  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r], b = rings[r + 1];
    for (let i = 0; i < seg; i++) {
      if (side > 0) g.quad(a[i], a[i + 1], b[i + 1], b[i]);
      else g.quad(a[i], b[i], b[i + 1], a[i + 1]);
    }
  }
  const capAt = (ring, row, sign) => {
    const c = g.vert(0, (row[2] + row[3]) * 0.5, row[0], 0, 0, sign, 0.5, sign > 0 ? 1 : 0);
    for (let i = 0; i < seg; i++) {
      const fwd = (sign > 0) === (side > 0);
      if (fwd) g.tri(c, ring[i + 1], ring[i]); else g.tri(c, ring[i], ring[i + 1]);
    }
  };
  capAt(rings[0], rows[0], -1);
  capAt(rings[rings.length - 1], rows[rows.length - 1], 1);

  /* The shaft: a work boot comes up over the ankle, and it is the part
     you actually see when you look down at your own feet. */
  fpTubeBetween(g, [0, 0.030, -0.040], [0, 0.128, -0.052], [
    [0.00, 0.049, 0.049],
    [0.55, 0.047, 0.047],
    [1.00, 0.046, 0.046],
  ], [0, 0, 1], 12, { e: 2.6, capEnd: false });

  g.computeBounds();
  return g;
}

/* A sleeve or trouser leg. Cloth stands 8-12 mm proud of the limb at
   every station: matched to the limb it z-fights with it, which shows
   up as a speckle of skin through the cloth and is unmistakable once
   seen. The garment covers its limb completely, so the limb underneath
   is simply not drawn. */
function sleeveGeometry(kind) {
  const g = new Geometry();
  if (kind === 'forearm') {
    // Stops two thirds down: a cuff, with bare wrist below it.
    fpTubeBetween(g, [0, 0, -0.012], [0, 0, FP_SEG.forearm * 0.68], [
      [0.00, 0.0505, 0.0530],
      [0.10, 0.0575, 0.0602],
      [0.70, 0.0510, 0.0536],
      [0.93, 0.0470, 0.0496],
      [1.00, 0.0424, 0.0450],
    ], [0, 1, 0], 12, { e: 2.1 });
  } else if (kind === 'upperArm') {
    fpTubeBetween(g, [0, 0, -0.062], [0, 0, FP_SEG.upperArm + 0.004], [
      [0.00, 0.0520, 0.0540],
      [0.10, 0.0690, 0.0712],
      [0.52, 0.0620, 0.0645],
      [0.92, 0.0512, 0.0538],
      [1.00, 0.0430, 0.0454],
    ], [0, 1, 0], 12, { e: 2.1 });
  } else if (kind === 'thigh') {
    fpTubeBetween(g, [0, 0, -0.075], [0, 0, FP_SEG.thigh + 0.010], [
      [0.00, 0.0930, 0.1000],
      [0.10, 0.1055, 0.1140],
      [0.58, 0.0900, 0.0968],
      [0.92, 0.0760, 0.0820],
      [1.00, 0.0670, 0.0722],
    ], [0, 1, 0], 12, { e: 2.1 });
  } else {
    // Down to the boot top, so there is never bare shin between them.
    fpTubeBetween(g, [0, 0, -0.045], [0, -0.008, FP_SEG.shank * 0.86], [
      [0.00, 0.0640, 0.0690],
      [0.12, 0.0730, 0.0800],
      [0.60, 0.0620, 0.0672],
      [0.92, 0.0540, 0.0580],
      [1.00, 0.0480, 0.0516],
    ], [0, 1, 0], 12, { e: 2.1 });
  }
  g.computeBounds();
  return g;
}

/* The torso as its owner sees it: a neck that goes up out of frame, a
   pair of collarbones, a chest that falls away, a belt line. Nobody
   sees the back of it, but it is closed anyway, because a hole in it
   shows the moment the camera pitches down hard.

   The critical dimension is the top. Modelled as a wide flat disc at
   the neck it sits 0.22 m from the eye and fills two thirds of the
   screen; tapered into an actual neck it reads as a body. */
function chestGeometry() {
  const g = new Geometry();
  const rows = [
    // y (down from the base of the skull), halfWidth, halfDepth
    [0.030, 0.062, 0.055],   // the neck
    [-0.045, 0.070, 0.062],
    [-0.090, 0.150, 0.092],  // the collarbones flare fast
    [-0.150, 0.183, 0.108],
    [-0.250, 0.176, 0.110],
    [-0.360, 0.156, 0.101],  // the waist
    [-0.450, 0.164, 0.106],  // the hips
  ];
  const seg = 16;
  const rings = [];
  for (const [y, hw, hd] of rows) {
    const idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const e = 2.8;
      const cx = Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
      const cz = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e);
      idx.push(g.vert(cx * hw, y, cz * hd, cx, 0, cz, i / seg, -y));
    }
    rings.push(idx);
  }
  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r], b = rings[r + 1];
    for (let i = 0; i < seg; i++) g.quad(a[i], b[i], b[i + 1], a[i + 1]);
  }
  const top = g.vert(0, rows[0][0], 0, 0, 1, 0, 0.5, 0);
  for (let i = 0; i < seg; i++) g.tri(top, rings[0][i + 1], rings[0][i]);
  const bot = g.vert(0, rows[rows.length - 1][0], 0, 0, -1, 0, 0.5, 1);
  const lr = rings[rings.length - 1];
  for (let i = 0; i < seg; i++) g.tri(bot, lr[i], lr[i + 1]);
  g.computeBounds();
  return g;
}

/* ---------------- the rig ----------------

   A flat list of bones, parents before children, each with the offset
   from its parent's origin (in the parent's own space) and a rest
   rotation. Forward kinematics is then one pass in list order. */

function handBones(side) {
  const bones = [];
  const S = side;                       // +1 right, -1 left
  bones.push({
    id: 'palm', parent: null, offset: [0, 0, 0], rest: [0, 0, 0],
    len: FP_SEG.palm, geo: 'palm', mat: 'skin',
  });

  /* Where each knuckle sits on the knuckle line, and how the metacarpals
     fan. The little finger's metacarpal is the mobile one — that is what
     lets a palm cup — so it gets a real fan angle. */
  const knuckle = FP_KNUCKLE;
  for (const name of FP_FINGERS) {
    const d = FP_DIGIT[name];
    const k = knuckle[name];
    bones.push({
      id: `${name}1`, parent: 'palm', digit: name, joint: 'mcp',
      offset: [k.x * S, k.drop, FP_SEG.palm * k.z],
      rest: [0, k.fan * S, 0], len: d.pp, width: d.w, kind: 'proximal',
      geo: `phalanx:${name}:pp`, mat: 'skin',
    });
    bones.push({
      id: `${name}2`, parent: `${name}1`, digit: name, joint: 'pip',
      offset: [0, 0, d.pp], rest: [0, 0, 0],
      len: d.ip, width: d.w * 0.92, kind: 'middle',
      geo: `phalanx:${name}:ip`, mat: 'skin',
    });
    bones.push({
      id: `${name}3`, parent: `${name}2`, digit: name, joint: 'dip',
      offset: [0, 0, d.ip], rest: [0, 0, 0],
      len: d.dp, width: d.w * 0.84, kind: 'distal',
      geo: `phalanx:${name}:dp`, mat: 'skin',
    });
  }

  /* The thumb. Its whole point is that it does not lie in the plane of
     the palm: the carpometacarpal joint is rotated about 45° out of it,
     which is why a thumb can oppose and a fourth finger cannot. */
  const t = FP_DIGIT.thumb;
  /* The first metacarpal does not lie in the plane of the palm and no
     amount of Euler angles makes it look as though it does not. It is
     given as a direction: distally, out to the radial side and forward
     of the palm, with the nail facing outward — which is the position
     a relaxed hand rests in and the reason a thumb can meet a
     fingertip at all. */
  bones.push({
    id: 'thumb0', parent: 'palm', digit: 'thumb', joint: 'cmc',
    offset: [0.0230 * S, -0.0090, 0.0165],
    rest: [0, 0, 0],
    restDir: [0.66 * S, -0.26, 0.70], restUp: [0.62 * S, 0.72, 0.14],
    len: t.mc, width: t.w * 1.06, kind: 'proximal',
    geo: 'phalanx:thumb:mc', mat: 'skin',
  });
  bones.push({
    id: 'thumb1', parent: 'thumb0', digit: 'thumb', joint: 'mcp',
    offset: [0, 0, t.mc], rest: [0, 0, 0],
    len: t.pp, width: t.w * 0.96, kind: 'middle',
    geo: 'phalanx:thumb:pp', mat: 'skin',
  });
  bones.push({
    id: 'thumb2', parent: 'thumb1', digit: 'thumb', joint: 'ip',
    offset: [0, 0, t.pp], rest: [0, 0, 0],
    len: t.dp, width: t.w * 0.88, kind: 'distal',
    geo: 'phalanx:thumb:dp', mat: 'skin',
  });
  return bones;
}

/* The arm the hand hangs off, and the leg you see when you look down.
   The shoulder is a child of the camera rather than of a spine, because
   in first person the camera IS the head and everything below it is
   carried. */
function armBones(side) {
  const S = side;
  return [
    { id: 'shoulder', parent: null, offset: [0, 0, 0], rest: [0, 0, 0], len: 0.085, geo: 'shoulder', mat: 'skin' },
    { id: 'upperArm', parent: 'shoulder', offset: [0, 0, 0.058], rest: [0, 0, 0], len: FP_SEG.upperArm, geo: 'upperArm', mat: 'skin' },
    { id: 'forearm', parent: 'upperArm', offset: [0, 0, FP_SEG.upperArm], rest: [0, 0, 0], len: FP_SEG.forearm, geo: 'forearm', mat: 'skin' },
    { id: 'wrist', parent: 'forearm', offset: [0, 0, FP_SEG.forearm], rest: [0, 0, 0], len: 0, geo: null, mat: 'skin', side: S },
  ];
}

function legBones(side) {
  void side;
  return [
    { id: 'thigh', parent: null, offset: [0, 0, 0], rest: [0, 0, 0], len: FP_SEG.thigh, geo: 'thigh', mat: 'skin' },
    { id: 'knee', parent: 'thigh', offset: [0, 0, FP_SEG.thigh - 0.030], rest: [0, 0, 0], len: 0.075, geo: 'knee', mat: 'skin' },
    { id: 'shank', parent: 'thigh', offset: [0, 0, FP_SEG.thigh], rest: [0, 0, 0], len: FP_SEG.shank, geo: 'shank', mat: 'skin' },
    { id: 'boot', parent: 'shank', offset: [0, 0, FP_SEG.shank], rest: [0, 0, 0], len: FP_SEG.foot, geo: 'boot', mat: 'boot' },
  ];
}

/* ---------------- poses ----------------

   A pose is per-joint flexion in radians. Flexion is about the local X
   axis (curl), abduction about Y (spread). Numbers are the real joint
   angles: a relaxed hand sits at roughly 25/35/15 MCP/PIP/DIP, a fist
   closes to 90/100/70, and a rifle grip is somewhere between with the
   trigger finger out on its own. */
/* Thumb entries are [cmc flex, mcp flex, ip flex, adduction] — the
   fourth number swings the whole thumb across the palm, which is the
   motion that makes a fist a fist and a grip a grip. Nothing else in
   the hand needs it, and leaving it out is why most modelled hands
   hold a rifle with the thumb sticking out sideways. */
const FP_POSE = {
  relaxed: { mcp: 0.42, pip: 0.62, dip: 0.28, spread: 0.055, thumb: [0.16, 0.30, 0.24, 0.10] },
  open:    { mcp: 0.06, pip: 0.10, dip: 0.05, spread: 0.16, thumb: [0.05, 0.06, 0.05, -0.10] },
  fist:    { mcp: 1.52, pip: 1.72, dip: 1.16, spread: 0.00, thumb: [0.34, 0.58, 0.72, 1.05] },
  /* Around a 34 mm rifle wrist: the fingers close hard, the trigger
     finger is lifted out by the module, and the thumb wraps over. */
  gripStock: { mcp: 1.12, pip: 1.34, dip: 0.72, spread: 0.015, thumb: [0.30, 0.40, 0.34, 0.92] },
  /* A 32 mm axe haft is thinner than a rifle wrist and gets gripped
     harder, which is why an axe handle wears a callus and a stock
     does not. */
  gripHaft: { mcp: 1.32, pip: 1.56, dip: 0.94, spread: 0.010, thumb: [0.36, 0.52, 0.50, 1.02] },
  /* A bowstring is drawn on three fingers, Mediterranean release. */
  gripString: { mcp: 0.34, pip: 1.42, dip: 0.62, spread: 0.03, thumb: [0.14, 0.20, 0.16, 0.24] },
  /* The hand that is only steadying something. */
  support: { mcp: 0.78, pip: 0.96, dip: 0.44, spread: 0.05, thumb: [0.24, 0.32, 0.26, 0.72] },
  /* Cold. The hand curls in on itself and the thumb tucks — this is
     what hands actually do below about 15 °C skin temperature, well
     before anyone decides to do it. */
  cold: { mcp: 1.10, pip: 1.30, dip: 0.86, spread: -0.02, thumb: [0.38, 0.70, 0.72, 1.10] },
  point: { mcp: 1.45, pip: 1.68, dip: 1.10, spread: 0.00, thumb: [0.30, 0.48, 0.40, 0.86] },
};

/* Fingers do not close in lockstep. The little finger leads a fist and
   the index trails it, which is most of why a hand looks alive. */
const FP_DIGIT_BIAS = { index: 0.92, middle: 1.00, ring: 1.06, little: 1.12 };
const FP_SPREAD_SIGN = { index: -1, middle: -0.25, ring: 0.55, little: 1.25 };

/* Blend two named poses. `weights` may also name a single pose. */
function fpPose(a, b, t) {
  const A = typeof a === 'string' ? FP_POSE[a] : a;
  const B = typeof b === 'string' ? FP_POSE[b] : b;
  if (!B || !t) return A || FP_POSE.relaxed;
  const k = Math.max(0, Math.min(1, t));
  return {
    mcp: A.mcp + (B.mcp - A.mcp) * k,
    pip: A.pip + (B.pip - A.pip) * k,
    dip: A.dip + (B.dip - A.dip) * k,
    spread: A.spread + (B.spread - A.spread) * k,
    thumb: [
      A.thumb[0] + (B.thumb[0] - A.thumb[0]) * k,
      A.thumb[1] + (B.thumb[1] - A.thumb[1]) * k,
      A.thumb[2] + (B.thumb[2] - A.thumb[2]) * k,
      (A.thumb[3] || 0) + ((B.thumb[3] || 0) - (A.thumb[3] || 0)) * k,
    ],
  };
}

/* Turn a pose into a per-bone {flex, spread} map. `per` overrides one
   named digit — the trigger finger, the drawing fingers on a string. */
function fpJointAngles(pose, side, per) {
  const out = {};
  for (const name of FP_FINGERS) {
    const bias = FP_DIGIT_BIAS[name];
    const o = (per && per[name]) || null;
    const mcp = o && o.mcp != null ? o.mcp : pose.mcp * bias;
    const pip = o && o.pip != null ? o.pip : pose.pip * bias;
    const dip = o && o.dip != null ? o.dip : pose.dip * bias;
    const spr = (o && o.spread != null ? o.spread : pose.spread) * FP_SPREAD_SIGN[name] * side;
    out[`${name}1`] = { flex: mcp, spread: spr };
    out[`${name}2`] = { flex: pip, spread: 0 };
    out[`${name}3`] = { flex: dip, spread: 0 };
  }
  const th = (per && per.thumb) || pose.thumb;
  /* Adduction lives on the carpometacarpal joint, which is the joint
     that actually does it — putting it on the metacarpophalangeal
     joint instead gives you a thumb with a broken knuckle. */
  out.thumb0 = { flex: th[0], spread: -(th[3] || 0) * side };
  out.thumb1 = { flex: th[1], spread: 0 };
  out.thumb2 = { flex: th[2], spread: 0 };
  return out;
}

/* ---------------- forward kinematics ----------------

   One pass in list order. Each bone gets a world position and rotation;
   a renderer then places one actor per bone with no further maths. */
function fpSolve(bones, angles, rootPos, rootQuat, out) {
  const res = out || new Map();
  const scratchQ = new Quat();
  const scratchV = new Vec3();
  for (const bone of bones) {
    const parent = bone.parent ? res.get(bone.parent) : null;
    const pq = parent ? parent.q : rootQuat;
    const pp = parent ? parent.p : rootPos;

    // offset in parent space -> world
    scratchV.set(bone.offset[0], bone.offset[1], bone.offset[2]).applyQuat(pq);
    const p = new Vec3(pp.x + scratchV.x, pp.y + scratchV.y, pp.z + scratchV.z);

    const a = angles && angles[bone.id];
    const rx = bone.rest[0] + (a && a.flex ? a.flex : 0);
    const ry = bone.rest[1] + (a && a.spread ? a.spread : 0);
    const rz = bone.rest[2] + (a && a.twist ? a.twist : 0);
    let q;
    if (bone.restDir) {
      if (!bone._restQ) {
        bone._restQ = new Quat().setLookRotation(
          new Vec3(bone.restDir[0], bone.restDir[1], bone.restDir[2]),
          new Vec3(bone.restUp[0], bone.restUp[1], bone.restUp[2]),
        );
      }
      scratchQ.setEuler(rx, ry, rz);
      q = new Quat().mulQuats(pq, bone._restQ).mul(scratchQ);
    } else {
      scratchQ.setEuler(rx, ry, rz);
      q = new Quat().mulQuats(pq, scratchQ);
    }
    res.set(bone.id, { p, q, bone });
  }
  return res;
}

/* Where a grip actually closes. Handed back so the module can put the
   weapon in the hand rather than the hand near the weapon. */
function fpGripPoint(solved) {
  const a = solved.get('middle1'), b = solved.get('index1');
  if (!a || !b) return null;
  const v = new Vec3(
    (a.p.x + b.p.x) * 0.5, (a.p.y + b.p.y) * 0.5, (a.p.z + b.p.z) * 0.5,
  );
  return v;
}

/* Geometry cache, so a hand is uploaded once and drawn many times. */
const _fpGeoCache = new Map();
function fpGeometry(key, side) {
  const ck = `${key}|${side}`;
  if (_fpGeoCache.has(ck)) return _fpGeoCache.get(ck);
  let g = null;
  if (key === 'palm') g = palmGeometry(side);
  else if (key === 'forearm') g = forearmGeometry();
  else if (key === 'upperArm') g = upperArmGeometry();
  else if (key === 'shoulder') g = shoulderGeometry();
  else if (key === 'thigh') g = thighGeometry();
  else if (key === 'knee') g = kneeGeometry();
  else if (key === 'shank') g = shankGeometry();
  else if (key === 'boot') g = bootGeometry(side);
  else if (key === 'chest') g = chestGeometry();
  else if (key.startsWith('sleeve:')) g = sleeveGeometry(key.slice(7));
  else if (key.startsWith('phalanx:')) {
    const [, digit, part] = key.split(':');
    const d = FP_DIGIT[digit];
    const len = part === 'mc' ? d.mc : part === 'pp' ? d.pp : part === 'ip' ? d.ip : d.dp;
    const w = d.w * (part === 'pp' || part === 'mc' ? 1 : part === 'ip' ? 0.92 : 0.84);
    g = phalanxGeometry(len, w, part === 'dp' ? 'distal' : part === 'ip' ? 'middle' : 'proximal');
  }
  _fpGeoCache.set(ck, g);
  return g;
}
