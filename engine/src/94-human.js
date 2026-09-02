/* ============================================================
   HUMAN — an anatomically proportioned body mesh.

   Built by lofting: a stack of cross-sections, each a superellipse
   of its own width, depth and squareness, stitched into a surface.
   That is what separates a body from a bundle of tubes — a chest is
   wide and shallow, a waist is narrower in both axes, a calf bulges
   behind the shin and not in front. A cylinder cannot say any of
   that; a cross-section stack says all of it.

   Everything is authored in the skeleton's bind-pose space, where
   the hips sit at the origin. A 1.75 m figure therefore runs from
   -0.875 (sole) to +0.875 (crown).
   ============================================================ */

/* Canonical landmark heights for a 1.75 m adult, hips-at-origin.
   Real proportions, not stylised: roughly 7.5 heads tall. */
const HUMAN = {
  sole: -0.875,
  ankle: -0.785,
  calf: -0.60,
  knee: -0.395,
  thigh: -0.20,
  crotch: 0,
  navel: 0.205,
  ribs: 0.34,
  chest: 0.445,
  shoulder: 0.460,
  neckBase: 0.508,
  chin: 0.595,
  crown: 0.875,
};

/* A superellipse ring in a local frame.
   `e` = 2 is a plain ellipse; higher values square the corners off,
   which is what gives a ribcage its flat front and back instead of
   the barrel a pure ellipse produces. */
function ringVertex(out, centre, right, fwd, halfW, halfD, angle, e) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const px = Math.sign(c) * Math.pow(Math.abs(c), 2 / e) * halfW;
  const pz = Math.sign(s) * Math.pow(Math.abs(s), 2 / e) * halfD;
  return out.set(
    centre.x + right.x * px + fwd.x * pz,
    centre.y + right.y * px + fwd.y * pz,
    centre.z + right.z * px + fwd.z * pz,
  );
}

/* Stitch a list of rings into a tube.
   Each ring: { p:Vec3, w, d, e, right?:Vec3, fwd?:Vec3, uv? }. Rings
   without an explicit frame get one derived from the path direction. */
function loftRings(g, rings, segments = 16, capStart = true, capEnd = true, flip = false) {
  if (rings.length < 2) return;

  /* Carry the cross-section frame ALONG the path instead of rebuilding it
     from a world axis at every ring.
   *
   * Each ring used to take its frame from whichever of two fixed
   * references was less parallel to the local direction. On a straight
   * loft that is fine. On a curving one -- a finger closing round a grip,
   * a thumb folding over -- the direction sweeps through the changeover
   * and the reference SWITCHES between two adjacent rings, rotating the
   * section ninety degrees in one step. The quad strip between them then
   * spirals through itself and comes out as a cone standing off the side
   * of the tube: the spike on the end of every fingertip in the game.
   *
   * Parallel transport instead: the first ring takes its frame from the
   * reference exactly as before, and every ring after it rotates the
   * previous frame by the smallest rotation carrying the previous
   * direction onto this one. Straight lofts are unchanged; curved ones
   * stop tearing. */
  const axis = new Vec3(), ref = new Vec3(0, 0, 1), altRef = new Vec3(1, 0, 0);
  const prevAxis = new Vec3(), kk = new Vec3(), tv = new Vec3();
  let havePrev = false;
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    if (r.right && r.fwd) { havePrev = false; continue; }
    const prev = rings[Math.max(0, i - 1)], next = rings[Math.min(rings.length - 1, i + 1)];
    axis.subVectors(next.p, prev.p);
    if (axis.lengthSq() < 1e-10) axis.set(0, 1, 0);
    axis.normalize();
    let right;
    if (havePrev) {
      const prevRight = rings[i - 1].right;
      kk.crossVectors(prevAxis, axis);
      const sn = kk.length(), cs = prevAxis.dot(axis);
      if (sn < 1e-7) {
        right = new Vec3(prevRight.x, prevRight.y, prevRight.z);
      } else {
        kk.scale(1 / sn);
        // Rodrigues, about the axis that carries the last direction to this one.
        tv.crossVectors(kk, prevRight);
        const kd = kk.dot(prevRight);
        right = new Vec3(
          prevRight.x * cs + tv.x * sn + kk.x * kd * (1 - cs),
          prevRight.y * cs + tv.y * sn + kk.y * kd * (1 - cs),
          prevRight.z * cs + tv.z * sn + kk.z * kd * (1 - cs),
        );
      }
      // Re-seat it exactly perpendicular; a chain of rotations drifts.
      const dp = right.dot(axis);
      right.set(right.x - axis.x * dp, right.y - axis.y * dp, right.z - axis.z * dp);
      if (right.lengthSq() < 1e-12) right = new Vec3().crossVectors(ref, axis);
      right.normalize();
    } else {
      const useRef = Math.abs(axis.dot(ref)) > 0.95 ? altRef : ref;
      right = new Vec3().crossVectors(useRef, axis).normalize();
    }
    r.right = right;
    r.fwd = new Vec3().crossVectors(axis, r.right).normalize();
    prevAxis.copy(axis);
    havePrev = true;
  }

  const base = g.positions.length / 3;
  const tmp = new Vec3();
  const nrm = new Vec3();
  const row = segments + 1;

  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    const v = r.uv != null ? r.uv : i / (rings.length - 1);
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * TAU;
      ringVertex(tmp, r.p, r.right, r.fwd, r.w, r.d, a, r.e || 2);
      // Outward normal of a superellipse, before the smoothing pass.
      nrm.set(tmp.x - r.p.x, tmp.y - r.p.y, tmp.z - r.p.z).normalize();
      g.vert(tmp.x, tmp.y, tmp.z, nrm.x, nrm.y, nrm.z, (s / segments) * 2, v * 2);
    }
  }

  // Winding matters as much as position: the renderer culls back faces, so
  // a reversed quad does not merely shade oddly, it disappears and leaves
  // the inside of the far wall showing through.
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const a = base + i * row + s;
      // Flipped, the surface faces inward — which is how you make a recess
      // (a nostril, an eye socket's interior) out of a closed form.
      if (flip) g.quad(a, a + row, a + row + 1, a + 1);
      else g.quad(a, a + 1, a + row + 1, a + row);
    }
  }

  // Flat caps, wound so they face outward along the tube axis.
  const capOf = (ringIdx, dir) => {
    const r = rings[ringIdx];
    const n = new Vec3().crossVectors(r.right, r.fwd).normalize().scale(dir);
    const centre = g.vert(r.p.x, r.p.y, r.p.z, n.x, n.y, n.z, 0.5, 0.5);
    const start = base + ringIdx * row;
    for (let s = 0; s < segments; s++) {
      const front = (dir > 0) !== flip;
      if (front) g.tri(centre, start + s, start + s + 1);
      else g.tri(centre, start + s + 1, start + s);
    }
  };
  if (capStart) capOf(0, -1);
  if (capEnd) capOf(rings.length - 1, 1);
}

/* Rings evenly spaced along a straight run between two points, with
   width/depth interpolated from a profile. */
function limbRings(from, to, profile, bulge) {
  const rings = [];
  for (let i = 0; i < profile.length; i++) {
    const t = profile.length === 1 ? 0 : i / (profile.length - 1);
    const p = new Vec3().copy(from).lerp(to, t);
    const s = profile[i];
    // An optional lateral offset lets a calf sit behind the shin bone
    // rather than being centred on it.
    if (bulge) p.z += bulge(t);
    rings.push({ p, w: s[0], d: s[1], e: s[2] || 2, uv: t });
  }
  return rings;
}

/* ---------------- torso ---------------- */

function buildTorso(g, segments, k = 1) {
  // width, depth, squareness — the silhouette of a human trunk.
  const spec = [
    [-0.062, 0.108, 0.092, 2.3],   // closes inside the thigh tops
    [-0.045, 0.145, 0.108, 2.4],
    [-0.022, 0.172, 0.120, 2.4],   // under the glutes
    [0.000, 0.178, 0.122, 2.4],    // seat — the widest part of the trunk
    [0.090, 0.161, 0.107, 2.4],
    [0.175, 0.150, 0.100, 2.5],    // waist, the narrowest point
    [0.250, 0.161, 0.109, 2.5],
    [0.320, 0.176, 0.118, 2.6],    // lower ribs flaring out
    [0.380, 0.187, 0.123, 2.6],
    [0.425, 0.195, 0.121, 2.6],    // chest
    [0.460, 0.204, 0.113, 2.7],    // deltoid shelf
    [0.487, 0.189, 0.103, 2.6],
    [0.508, 0.132, 0.087, 2.4],    // trapezius sloping in
    [0.528, 0.079, 0.067, 2.2],
  ];
  const rings = spec.map(([y, w, d, e], i) => ({
    p: new Vec3(0, y, 0), w: w * k, d: d * k, e, uv: i / (spec.length - 1),
  }));
  loftRings(g, rings, segments, true, true);
}

function buildNeck(g, segments) {
  const rings = [
    { p: new Vec3(0, 0.505, 0.002), w: 0.078, d: 0.070, e: 2.3 },
    { p: new Vec3(0, 0.535, 0.005), w: 0.060, d: 0.056, e: 2.1 },
    { p: new Vec3(0, 0.575, 0.008), w: 0.055, d: 0.052, e: 2.0 },
    { p: new Vec3(0, 0.618, 0.010), w: 0.056, d: 0.053, e: 2.0 },
  ];
  loftRings(g, rings, segments, false, false);
}

/* ---------------- limbs ---------------- */

function buildArm(g, side, skeleton, segments, k = 1) {
  const S = side > 0 ? 'L' : 'R';
  const shoulder = new Vec3(), elbow = new Vec3(), wrist = new Vec3();
  skeleton.bones[skeleton.index('upperArm' + S)].bindMatrix.getTranslation(shoulder);
  skeleton.bones[skeleton.index('lowerArm' + S)].bindMatrix.getTranslation(elbow);
  skeleton.bones[skeleton.index('hand' + S)].bindMatrix.getTranslation(wrist);

  // Start the arm inboard and above the joint so the deltoid buries itself
  // in the torso instead of butting against it and leaving a visible seam.
  const armRoot = new Vec3().copy(shoulder);
  armRoot.x -= side * 0.052;
  armRoot.y += 0.055;

  // One continuous loft from shoulder to wrist. Lofting the upper arm and
  // forearm separately looks fine on paper — the two rings at the elbow
  // share a position — but each loft derives its ring frames from its own
  // path direction, so the two rings are rotated relative to each other and
  // the surfaces do not line up vertex-for-vertex. The result is a hairline
  // crack you can see straight through at every joint.
  const upper = limbRings(armRoot, elbow, [
    [0.060, 0.060, 2.0],
    [0.055, 0.056, 2.0],
    [0.049, 0.051, 2.0],
    [0.043, 0.045, 2.0],
    [0.038, 0.041, 2.0],
  ]);
  const lower = limbRings(elbow, wrist, [
    [0.038, 0.041, 2.0],
    [0.044, 0.046, 2.0],
    [0.041, 0.043, 2.0],
    [0.034, 0.036, 2.0],
    [0.027, 0.031, 2.1],
  ]);
  for (const r of upper) { r.w *= k; r.d *= k; }
  for (const r of lower) { r.w *= k; r.d *= k; }
  loftRings(g, upper.concat(lower.slice(1)), segments, false, false);

  buildHand(g, side, wrist, segments);
}

/* A hand with fingers on it.
 *
 * This was a flattened palm and a thumb, on the argument that at the scale
 * a character is seen individual fingers read as noise. That argument is
 * wrong for THIS game: the thing a zombie does, every time, is put a hand
 * through a window and reach for your face, and at that range a mitten is
 * the first thing you notice. It is the single most visible remaining
 * shortcut on the body.
 *
 * So: a palm that ends at the knuckles, four fingers off the front of it
 * with a bend at each joint, and the thumb it already had. The fingers are
 * CURLED -- a dead hand is not a flat paddle, the tendons pull it into a
 * hook, and a hook is also what reaching looks like. Four fingers of three
 * short lofts is about six hundred triangles a hand, which against a
 * twenty-thousand-triangle body is nothing.
 *
 * `claw` is how far they close: 0 is an open hand, 1 a fist. The reach
 * clips ask for more of it than the walk does. */
function buildHand(g, side, wrist, segments, claw) {
  const palmDir = new Vec3(0, -1, 0);
  const curl = claw == null ? 0.42 : claw;
  // Palm: wrist to knuckle line, 100 mm, thickening through the middle.
  /* Width and thickness were the wrong way round, and had been from the
     start. `w` runs across X, which is the axis the four fingers are
     spread along, so it is the palm's WIDTH; `d` runs fore-and-aft, which
     is its THICKNESS. They were authored as w 44-56 mm and d 84-92 mm --
     a hand 50 mm wide and 90 mm deep, when a real one is 85 wide and 30
     deep. Measured by skin weight, the whole hand came out 119 mm thick.
     That is why every zombie appeared to be wearing boxing gloves, and no
     amount of shrinking it overall would have helped: shrunk, it would
     have been a smaller block. */
  const knuck = new Vec3().copy(wrist).addScaled(palmDir, 0.100);
  const rings = [
    { p: new Vec3().copy(wrist), w: 0.030, d: 0.0170, e: 2.1 },
    { p: new Vec3().copy(wrist).addScaled(palmDir, 0.030), w: 0.040, d: 0.0165, e: 2.4 },
    { p: new Vec3().copy(wrist).addScaled(palmDir, 0.070), w: 0.043, d: 0.0160, e: 2.6 },
    { p: new Vec3().copy(knuck), w: 0.042, d: 0.0150, e: 2.6 },
  ];
  loftRings(g, rings, segments, false, true);

  /* Four fingers. Each one is three bones with a bend between them, walked
     the same way the viewmodel's are -- a smooth taper reads as a tentacle
     and three straight bones with angles between them reads as a finger.
     Index nearest the thumb, little finger furthest. */
  const seg = Math.max(6, segments >> 1);
  const LEN = [0.038, 0.024, 0.018];
  // 20, 20, 19 and 16 mm across -- what fingers measure. They were 25 to
  // 21, which on a palm the right width reads as a bunch of bananas.
  const R0 = [0.0098, 0.0102, 0.0096, 0.0082];
  for (let f = 0; f < 4; f++) {
    // Spread across the knuckle line, and shortened toward the little one.
    // Spread to fill the corrected palm: four fingers across 85 mm.
    const across = (f - 1.5) * 0.0215;
    const scale = [0.96, 1.0, 0.97, 0.86][f];
    const root = new Vec3().copy(knuck);
    root.x += side * across;
    // Fingers of a hanging hand splay very slightly and drop away.
    let dir = new Vec3(side * across * 0.9, -1, 0.10).normalize();
    let p = new Vec3().copy(root);
    const fr = [];
    fr.push({ p: new Vec3().copy(p), w: R0[f], d: R0[f], e: 2.3 });
    for (let b = 0; b < 3; b++) {
      // The bend: most of it at the middle knuckle, which is where a hand
      // actually closes.
      const bend = [0.30, 0.95, 0.72][b] * curl;
      const c = Math.cos(bend), sn = Math.sin(bend);
      // Turning in the plane of the palm: -Y toward +Z as it closes.
      const ny = dir.y * c - dir.z * sn;
      const nz = dir.y * sn + dir.z * c;
      dir = new Vec3(dir.x, ny, nz).normalize();
      const L = LEN[b] * scale;
      p = new Vec3(p.x + dir.x * L, p.y + dir.y * L, p.z + dir.z * L);
      const rr = R0[f] * (b === 2 ? 0.72 : 1 - b * 0.10);
      fr.push({ p: new Vec3().copy(p), w: rr, d: rr, e: 2.3 });
    }
    // Rounded tip.
    fr.push({ p: new Vec3(p.x + dir.x * 0.004, p.y + dir.y * 0.004, p.z + dir.z * 0.004),
      w: R0[f] * 0.36, d: R0[f] * 0.36, e: 2.2 });
    loftRings(g, fr, seg, true, true);
  }

  /* Thumb, off the radial edge -- the same side the index finger is on,
     one spacing beyond it -- and only just proud of the palm's front
     face. It used to start 30 mm forward of the palm centre, which was
     inside a 92 mm-deep palm and is now 15 mm outside a 30 mm one; on the
     corrected hand it would have hung in the air. */
  const thumbRoot = new Vec3().copy(wrist).addScaled(palmDir, 0.038);
  thumbRoot.x -= side * 0.036;
  thumbRoot.z += 0.010;
  const thumbMid = new Vec3().copy(thumbRoot);
  thumbMid.x += side * 0.007;
  thumbMid.z += 0.020 + curl * 0.008;
  thumbMid.y -= 0.030;
  const thumbTip = new Vec3().copy(thumbMid);
  thumbTip.x += side * 0.010;
  thumbTip.z += 0.009 + curl * 0.014;
  thumbTip.y -= 0.025 - curl * 0.008;
  loftRings(g, limbRings(thumbRoot, thumbMid, [
    [0.0125, 0.0118, 2.1],
    [0.0112, 0.0104, 2.1],
  ]), seg, true, false);
  loftRings(g, limbRings(thumbMid, thumbTip, [
    [0.0112, 0.0104, 2.1],
    [0.0082, 0.0078, 2.0],
    [0.0038, 0.0036, 2.0],
  ]), seg, false, true);
}

function buildLeg(g, side, skeleton, segments, k = 1) {
  const S = side > 0 ? 'L' : 'R';
  const hip = new Vec3(), knee = new Vec3(), ankle = new Vec3();
  skeleton.bones[skeleton.index('upperLeg' + S)].bindMatrix.getTranslation(hip);
  skeleton.bones[skeleton.index('lowerLeg' + S)].bindMatrix.getTranslation(knee);
  skeleton.bones[skeleton.index('foot' + S)].bindMatrix.getTranslation(ankle);

  // Same for the hip: push the thigh's first ring up into the pelvis.
  const legRoot = new Vec3().copy(hip);
  legRoot.y += 0.075;
  legRoot.x -= side * 0.010;

  // Thigh and shin as a single loft, for the same reason as the arm.
  const thigh = limbRings(legRoot, knee, [
    [0.098, 0.108, 2.2],
    [0.092, 0.100, 2.1],
    [0.082, 0.090, 2.1],
    [0.071, 0.078, 2.0],
    [0.062, 0.068, 2.0],
    [0.057, 0.062, 2.0],
  ]);
  // The calf bulge sits behind the bone line, which is why the ring centres
  // are pushed back rather than just widened.
  const shin = limbRings(knee, ankle, [
    [0.057, 0.062, 2.0],
    [0.061, 0.069, 2.0],
    [0.058, 0.066, 2.0],
    [0.048, 0.054, 2.0],
    [0.040, 0.044, 2.0],
    [0.035, 0.040, 2.1],
  ], (t) => -Math.sin(Math.min(1, t * 1.9) * PI) * 0.016);
  loftRings(g, thigh.concat(shin.slice(1)), segments, false, false);
}

/* ---------------- shoe ---------------- */

/* The foot's own cross-sections: z forward from the ankle, half-width,
   and how far the top of the foot stands above the sole.

   Shared, because the CLOTH boot in 94a-zombie-body.js has to be built
   over exactly this and was instead built from numbers typed next to it.
   They disagreed by 79 mm and every booted zombie walked around with bare
   green toes sticking out the front. Two lists that have to agree should
   be one list. */
const HUMAN_SHOE = [
  [-0.070, 0.026, 0.070],
  [-0.055, 0.038, 0.088],
  [-0.030, 0.045, 0.098],
  [0.005, 0.048, 0.100],   // instep, the tallest point
  [0.055, 0.050, 0.076],
  [0.105, 0.049, 0.058],
  [0.150, 0.044, 0.045],
  [0.185, 0.034, 0.034],
  [0.207, 0.019, 0.022],   // toe
];

/* A shoe rather than a foot: sole, toe box, instep and heel. Lofted
   along the length of the foot with a flat bottom, so it sits on the
   ground the way a shoe does instead of a sphere resting on a point. */
function buildShoe(g, side, skeleton, segments) {
  const S = side > 0 ? 'L' : 'R';
  const ankle = new Vec3();
  skeleton.bones[skeleton.index('foot' + S)].bindMatrix.getTranslation(ankle);

  const sole = HUMAN.sole;
  const spec = HUMAN_SHOE.map(([z, hw, up]) => [z, hw, sole + up]);

  const cross = Math.max(10, segments);
  const base = g.positions.length / 3;
  const row = cross + 1;
  const n = new Vec3();

  for (let i = 0; i < spec.length; i++) {
    const [z, hw, top] = spec[i];
    const cy = (top + sole) * 0.5;
    const hh = (top - sole) * 0.5;
    for (let s = 0; s <= cross; s++) {
      const a = (s / cross) * TAU;
      const c = Math.cos(a), si = Math.sin(a);
      // Squared-off cross-section: a shoe has a flat sole and slab sides.
      const px = Math.sign(c) * Math.pow(Math.abs(c), 2 / 3.0) * hw;
      const py = Math.sign(si) * Math.pow(Math.abs(si), 2 / 3.2) * hh;
      const x = ankle.x + px;
      const y = cy + py;
      n.set(px / Math.max(hw, 1e-4), py / Math.max(hh, 1e-4), 0).normalize();
      g.vert(x, y, ankle.z + z, n.x, n.y, n.z, s / cross * 2, i / (spec.length - 1) * 2);
    }
  }
  for (let i = 0; i < spec.length - 1; i++) {
    for (let s = 0; s < cross; s++) {
      const a = base + i * row + s;
      g.quad(a, a + 1, a + row + 1, a + row);
    }
  }
  // Close the heel and the toe.
  for (const [idx, dir] of [[0, -1], [spec.length - 1, 1]]) {
    const [z] = spec[idx];
    const centre = g.vert(ankle.x, (spec[idx][2] + sole) * 0.5, ankle.z + z, 0, 0, dir, 0.5, 0.5);
    const start = base + idx * row;
    for (let s = 0; s < cross; s++) {
      if (dir > 0) g.tri(centre, start + s, start + s + 1);
      else g.tri(centre, start + s + 1, start + s);
    }
  }
}

/* ---------------- assembly ---------------- */

function makeHumanBodyGeometry(skeleton, opts = {}) {
  const g = new Geometry();
  const segments = opts.segments || 16;
  // `gaunt` thins the whole figure. At 0.82 the silhouette reads as
  // starved rather than merely slim, which is most of what tells a
  // shambling body apart from a living one at fighting distance.
  const k = opts.gaunt != null ? opts.gaunt : (opts.thickness || 1);

  buildTorso(g, segments, k);
  buildNeck(g, segments);
  for (const side of [1, -1]) {
    buildArm(g, side, skeleton, segments, k);
    buildLeg(g, side, skeleton, segments, k);
    buildShoe(g, side, skeleton, segments);
  }
  if (opts.rags) buildRags(g, opts.ragSeed || 3);

  g.finalize();
  // The per-ring normals are only radial; recomputing from the finished
  // surface is what makes the shoulders and calves catch light correctly.
  g.computeWeldGroups();
  smoothNormals(g);
  weldNormals(g.normals, g.weldGroups);
  return g;
}

/* Torn clothing. Strips of cloth hanging off the torso, each one a thin
   ragged panel with a jagged hem. They are appended to the body geometry
   rather than made a separate mesh, so the existing vertex-to-bone solve
   skins them for free — a strip near the hips gets hip weights and swings
   with the hips, which is what makes a walk read as clothed rather than
   as a figure with decals on it. */
function buildRags(g, seed) {
  const rng = new Rng(seed);
  const STRIPS = 22;
  for (let i = 0; i < STRIPS; i++) {
    const a = (i / STRIPS) * TAU + rng.range(-0.1, 0.1);
    const top = rng.range(0.02, 0.30);          // where on the trunk it hangs from
    const len = rng.range(0.10, 0.34);
    const halfW = rng.range(0.018, 0.045);
    // Follow the trunk's own silhouette so cloth sits on the body, not in it.
    const rad = (y) => (y > 0.24 ? 0.176 : y > 0.10 ? 0.156 : 0.170) * 1.02;
    const ca = Math.cos(a), sa = Math.sin(a);
    const base = g.positions.length / 3;
    const rows = 4;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const y = top - len * t;
      // The hem tapers and wanders; a straight-cut rectangle reads as a flag.
      const w = halfW * (1 - t * rng.range(0.25, 0.7));
      const rr = rad(y) + t * 0.012;
      const drift = Math.sin(t * 3.1 + i) * 0.02 * t;
      for (const sgn of [-1, 1]) {
        const ang = a + sgn * (w / Math.max(rr, 0.02)) + drift;
        g.vert(Math.cos(ang) * rr, y, Math.sin(ang) * rr,
               Math.cos(ang), 0.15, Math.sin(ang), (sgn + 1) / 2, t);
      }
    }
    for (let r = 0; r < rows; r++) {
      const q = base + r * 2;
      // Both faces: cloth this thin is visible from inside the swing arc.
      g.quad(q, q + 1, q + 3, q + 2);
      g.quad(q, q + 2, q + 3, q + 1);
    }
    void ca; void sa;
  }
}

/* Area-weighted smooth normals over the assembled surface. */
function smoothNormals(g) {
  const P = g.positions, N = g.normals, I = g.indices;
  N.fill(0);
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    // Un-normalised cross product weights each face by its own area.
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    N[a] += nx; N[a + 1] += ny; N[a + 2] += nz;
    N[b] += nx; N[b + 1] += ny; N[b + 2] += nz;
    N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]);
    if (l > 1e-9) { N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
    else { N[i] = 0; N[i + 1] = 1; N[i + 2] = 0; }
  }
}

/* Ears, merged onto a head mesh. Positioned by the caller at the actual
   skull surface — an ear placed at some fraction of the head radius ends
   up inside the skull, invisible and wondered about.

   Shape: an outer rim, a hollowed bowl inside it, and a lobe. Those three
   are what the eye reads as an ear; the fine folds of a real one are below
   the resolution a character is ever seen at. */
function buildEars(g, opts = {}) {
  const ex = opts.x != null ? opts.x : 0.20;
  const ey = opts.y != null ? opts.y : 0;
  const ez = opts.z != null ? opts.z : -0.03;

  for (const side of [1, -1]) {
    // Outer shell, leaning out and back from the skull.
    const rings = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const flare = Math.sin(t * PI * 0.85);
      rings.push({
        p: new Vec3(side * (ex + t * 0.030), ey - t * 0.004, ez - t * 0.006),
        // `w` runs front-to-back, `d` runs top-to-bottom: an ear is about
        // twice as tall as it is deep.
        w: 0.030 + flare * 0.009,
        d: 0.062 + flare * 0.014,
        e: 2.3,
        right: new Vec3(0, 0, 1),
        fwd: new Vec3(0, 1, 0),
        uv: t,
      });
    }
    // Thin the outer rim so the edge reads as an edge, not a tube end.
    const last = rings[rings.length - 1];
    last.w *= 0.66;
    last.d *= 0.74;
    loftRings(g, rings, 16, true, true);

    // The concha: a shallow bowl pressed into the front of the ear.
    const bowl = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      bowl.push({
        p: new Vec3(side * (ex + 0.012 + t * 0.016), ey + 0.004, ez - 0.004),
        w: (0.019 - t * 0.006),
        d: (0.034 - t * 0.011),
        e: 2.1,
        right: new Vec3(0, 0, 1),
        fwd: new Vec3(0, 1, 0),
        uv: t,
      });
    }
    loftRings(g, bowl, 14, false, true);

    // Lobe.
    loftRings(g, [
      { p: new Vec3(side * (ex + 0.012), ey - 0.052, ez - 0.004), w: 0.020, d: 0.016, e: 2.1,
        right: new Vec3(0, 0, 1), fwd: new Vec3(0, 1, 0) },
      { p: new Vec3(side * (ex + 0.022), ey - 0.068, ez - 0.008), w: 0.015, d: 0.012, e: 2.0,
        right: new Vec3(0, 0, 1), fwd: new Vec3(0, 1, 0) },
    ], 12, true, true);
  }
}


/* A ring path that closes on itself — an eyelid rim, a lip line. The first
   ring is repeated at the end so the surface joins without a seam. */
function loftLoop(g, rings, segments = 12, flip = false) {
  if (rings.length < 3) return;
  loftRings(g, rings.concat([rings[0]]), segments, false, false, flip);
}

/* Append another geometry, transformed. Used to drop a separately-built
   form (a nose, a lip) into a head. */
function mergeShape(g, src, offset, scale) {
  const base = g.positions.length / 3;
  const sx = scale ? scale.x : 1, sy = scale ? scale.y : 1, sz = scale ? scale.z : 1;
  const P = src.positions, N = src.normals, U = src.uvs;
  for (let i = 0; i < P.length; i += 3) {
    g.vert(
      P[i] * sx + offset.x, P[i + 1] * sy + offset.y, P[i + 2] * sz + offset.z,
      N[i], N[i + 1], N[i + 2],
      U ? U[(i / 3) * 2] : 0, U ? U[(i / 3) * 2 + 1] : 0,
    );
  }
  for (let i = 0; i < src.indices.length; i += 3) {
    g.tri(base + src.indices[i], base + src.indices[i + 1], base + src.indices[i + 2]);
  }
}

/* ---------------- face geometry ---------------- */

/* A nose as an actual solid, not a bump pushed out of the skull.

   This is the whole reason the old face read as flat: displacing a sphere
   can only ever produce a smooth swelling. It cannot make an undercut, and
   a nose is defined almost entirely by its undercut — the plane beneath it
   that turns away from the light, and the nostrils set into that plane. */
function buildNose(g, o = {}) {
  const X = new Vec3(1, 0, 0), Z = new Vec3(0, 0, 1);
  // Horizontal slices descending from the brow to the base, drifting
  // forward as they go: the bridge, then the ball, then the wings.
  const spec = [
    [0.145, 0.190, 0.030, 0.010],   // buried in the brow, so no visible cap
    [0.085, 0.203, 0.028, 0.018],
    [0.025, 0.216, 0.032, 0.027],
    [-0.028, 0.232, 0.040, 0.035],
    [-0.062, 0.244, 0.050, 0.041],   // the ball — as wide as it is deep
    [-0.086, 0.249, 0.059, 0.038],   // wings
    [-0.105, 0.243, 0.062, 0.030],
    [-0.119, 0.233, 0.055, 0.022],   // base — this plane is the undercut
  ];
  const rings = spec.map(([y, z, w, d], i) => ({
    p: new Vec3(0, y, z), w, d, e: 2.0,
    right: X, fwd: Z, uv: i / (spec.length - 1),
  }));
  loftRings(g, rings, 24, true, true);

  // Nostrils: inward-facing pockets set into the underside. Built flipped,
  // so what you see through the opening is the inside of a closed form.
  for (const sx of [1, -1]) {
    loftRings(g, [
      { p: new Vec3(sx * 0.028, -0.121, 0.234), w: 0.015, d: 0.010, e: 2.0, right: X, fwd: Z },
      { p: new Vec3(sx * 0.027, -0.103, 0.237), w: 0.013, d: 0.009, e: 2.0, right: X, fwd: Z },
      { p: new Vec3(sx * 0.022, -0.089, 0.243), w: 0.005, d: 0.004, e: 2.0, right: X, fwd: Z },
    ], 12, false, true, true);
  }

  // Columella: the strip of flesh between the nostrils.
  loftRings(g, [
    { p: new Vec3(0, -0.125, 0.239), w: 0.009, d: 0.011, e: 2.2, right: X, fwd: Z },
    { p: new Vec3(0, -0.103, 0.245), w: 0.010, d: 0.013, e: 2.2, right: X, fwd: Z },
  ], 10, true, true);
}

/* Lips as two separate forms with a real gap between them. A crease carved
   into a sphere reads as a line drawn on a face; two protruding volumes
   that do not touch read as a mouth. */
function buildLips(g, o = {}) {
  const Y = new Vec3(0, 1, 0), Z = new Vec3(0, 0, 1);
  // x, y, z, halfHeight, halfDepth
  const upper = [
    [-0.070, -0.183, 0.216, 0.005, 0.006],   // corner
    [-0.050, -0.179, 0.232, 0.009, 0.011],
    [-0.028, -0.174, 0.242, 0.012, 0.014],
    [-0.011, -0.171, 0.245, 0.013, 0.015],   // one peak of the cupid's bow
    [0.000, -0.176, 0.243, 0.011, 0.014],    // the dip between them
    [0.011, -0.171, 0.245, 0.013, 0.015],
    [0.028, -0.174, 0.242, 0.012, 0.014],
    [0.050, -0.179, 0.232, 0.009, 0.011],
    [0.070, -0.183, 0.216, 0.005, 0.006],
  ];
  const lower = [
    [-0.066, -0.190, 0.216, 0.005, 0.006],
    [-0.046, -0.199, 0.233, 0.010, 0.012],
    [-0.024, -0.205, 0.244, 0.014, 0.016],
    [0.000, -0.207, 0.248, 0.016, 0.018],
    [0.024, -0.205, 0.244, 0.014, 0.016],
    [0.046, -0.199, 0.233, 0.010, 0.012],
    [0.066, -0.190, 0.216, 0.005, 0.006],
  ];
  for (const set of [upper, lower]) {
    const rings = set.map(([x, y, z, h, d], i) => ({
      p: new Vec3(x, y, z), w: h, d, e: 2.2,
      right: Y, fwd: Z, uv: i / (set.length - 1),
    }));
    loftRings(g, rings, 14, true, true);
  }
}

/* Eyelid rims. An eyeball sitting in a bare socket looks like a marble in a
   hole; the lids are what close the form and give the eye a top and bottom
   edge to catch light on. */
/* Eye metrics, taken from real measurements and scaled to this head, whose
   chin-to-crown height is ~0.652 in local units:

     globe diameter          24 mm   pupil separation   63 mm
     palpebral fissure    30 x 10 mm corneal cap        12 mm across

   The globe was previously half again too large, which is why no lid
   thickness could be made to sit on it properly — the lids were being asked
   to wrap something the size of a golf ball. */
const EYE = {
  sx: 0.091,          // half the pupil separation
  cy: 0.032,
  apertureX: 0.046, apertureY: 0.017, apertureZ: 0.234,
  // The globe sits ~28 mm behind the lid margin. That gap is the whole
  // trick: it puts the opening in shadow, so the eye reads as a hole with
  // something wet in it rather than as a bead resting on the cheek.
  globeR: 0.034, globeZ: 0.186, globeFlatten: 0.85,
  corneaR: 0.022, corneaOffset: 0.015,
};

function buildEyelids(g, o = {}) {
  const Z = new Vec3(0, 0, 1);
  for (const sx of [1, -1]) {
    const cx = sx * EYE.sx;
    const rings = [];
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      // The upper lid is heavier than the lower — a real asymmetry, and
      // leaving it out is a large part of why a face looks like a doll.
      const upper = Math.max(0, sa);
      // Radial mass. A rim a few millimetres thick reads as a wire ring
      // pressed into the eyeball; a lid is a fold of skin with real depth.
      // `e` is high so the cross-section is nearly square: the sharp inner
      // corner is the lid margin, and a rounded one has nothing to read as.
      const w = 0.011 + upper * 0.009;
      // Deep front-to-back, because the orbit around it is deep: a shallow
      // lid gets swallowed by the socket wall at the top of its arc, which
      // leaves the eye as a bead in a hollow.
      const d = 0.016 + upper * 0.004;
      // Offset outward by the lid's own half-width so its inner edge — the
      // one that defines the opening — still lands on the aperture.
      rings.push({
        p: new Vec3(cx + ca * (EYE.apertureX + w), EYE.cy + sa * (EYE.apertureY + w),
                    EYE.apertureZ - Math.abs(sa) * 0.008 - d * 0.3),
        w, d, e: 3.0,
        right: new Vec3(ca, sa, 0).normalize(), fwd: Z,
        uv: i / steps,
      });
    }
    loftLoop(g, rings, 10);
  }
}
