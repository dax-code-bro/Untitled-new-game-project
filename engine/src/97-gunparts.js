/* ============================================================
   GUN PARTS — a firearm as an assembly of real components.

   A gun in this engine is not one mesh. It is a parts list, and
   every entry is its own geometry with its own material and its own
   rest transform, because the game asks three different things of
   the same parts:

     - the viewmodel, where the bolt reciprocates, the hammer falls,
       the selector rotates and the magazine drops out;
     - the ejected case, which is the same cartridge mesh the
       magazine was holding a moment ago;
     - the workbench, where the whole thing comes apart and every
       piece can be picked up, looked at, cleaned and put back.

   One mesh could do none of those. So: barrels, bolts with locking
   lugs and an extractor claw, magazines with a follower and a
   spring, sears, hammers, firing pins.

   Conventions. +Z is downrange, +Y is up, +X is the shooter's
   right, and the origin sits at the breech face — the point the
   base of the cartridge rests against — because that is the one
   datum every part on a gun is actually dimensioned from.

   Everything is in metres, taken from real guns: a Remington 700's
   24-inch barrel is 0.610 m and its bolt is 17.5 mm across, an
   AK-47 is 880 mm overall, a 1911's slide is 190 mm. Nothing here
   is eyeballed, because the whole point of drawing the parts
   separately is that they then have to fit each other.
   ============================================================ */

const GUN_MATERIAL = {
  blued: { color: 0x1b1d20, roughness: 0.34, metalness: 0.9 },
  parked: { color: 0x33342f, roughness: 0.66, metalness: 0.75 },
  stainless: { color: 0x8b9095, roughness: 0.44, metalness: 0.82 },
  hardChrome: { color: 0xaab0b4, roughness: 0.24, metalness: 0.9 },
  walnut: { color: 0x5a3a1e, roughness: 0.42, metalness: 0.02 },
  beech: { color: 0x8a6134, roughness: 0.48, metalness: 0.02 },
  polymer: { color: 0x2b2d2c, roughness: 0.62, metalness: 0.03 },
  rubber: { color: 0x141514, roughness: 0.92, metalness: 0.02 },
  brass: { color: 0xb08b3a, roughness: 0.22, metalness: 0.96 },
  copper: { color: 0x9a5a32, roughness: 0.3, metalness: 0.94 },
  lead: { color: 0x6e7074, roughness: 0.5, metalness: 0.7 },
  glass: { color: 0x223044, roughness: 0.04, metalness: 0.1 },
  spring: { color: 0x5a5e62, roughness: 0.42, metalness: 0.88 },
};

/* ---------------- primitives ----------------
   Guns are made of tubes, slabs and chamfered blocks. These three
   builders cover nearly all of it; anything else is a loft. */

/* A tube along +Z, optionally hollow (a barrel has a bore, and you
   can see down it — that is the whole appeal of looking at one). */
function gunTube(g, z0, z1, r0, r1, opts = {}) {
  const segs = opts.segs || 18;
  const inner = opts.bore || 0;
  const flats = opts.flats || 0;          // 0 = round, 6 = hex, 8 = octagon
  const ringAt = (z, r) => {
    const row = [];
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * TAU;
      // A faceted barrel (an octagon shotgun rib, a hex nut) is the same
      // ring quantised: snap the angle to the nearest facet centre.
      let rr = r;
      if (flats) {
        const step = TAU / flats;
        const off = Math.abs(((a + step / 2) % step) - step / 2);
        rr = r / Math.cos(off);
      }
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      row.push(g.vert(x, y, z, Math.cos(a), Math.sin(a), 0, s / segs, z));
    }
    return row;
  };
  const a = ringAt(z0, r0), b = ringAt(z1, r1);
  for (let s = 0; s < segs; s++) g.quad(a[s], a[s + 1], b[s + 1], b[s]);

  if (inner > 0) {
    // The bore: a second tube wound inside-out, closed to the outer wall by
    // a flat crown at each end. This is what makes a muzzle read as a hole
    // rather than a painted dot.
    const ia = ringAt(z0, inner), ib = ringAt(z1, inner);
    for (let s = 0; s < segs; s++) g.quad(ia[s], ib[s], ib[s + 1], ia[s + 1]);
    if (opts.crownEnd !== false) for (let s = 0; s < segs; s++) g.quad(b[s], b[s + 1], ib[s + 1], ib[s]);
    if (opts.crownStart) for (let s = 0; s < segs; s++) g.quad(a[s], ia[s], ia[s + 1], a[s + 1]);
  } else {
    if (opts.capEnd !== false) {
      const c = g.vert(0, 0, z1, 0, 0, 1, 0.5, 0.5);
      for (let s = 0; s < segs; s++) g.tri(c, b[s], b[s + 1]);
    }
    if (opts.capStart !== false) {
      const c = g.vert(0, 0, z0, 0, 0, -1, 0.5, 0.5);
      for (let s = 0; s < segs; s++) g.tri(c, a[s + 1], a[s]);
    }
  }
  return g;
}

/* A box with its edges broken. Every machined part on a gun has a
   chamfer or a radius on it — a perfectly sharp cube reads as a
   placeholder, which is exactly what the old viewmodel looked like. */
function gunBlock(g, x0, y0, z0, x1, y1, z1, ch = 0.0012) {
  const cx = Math.min(ch, (x1 - x0) * 0.32), cy = Math.min(ch, (y1 - y0) * 0.32), cz = Math.min(ch, (z1 - z0) * 0.32);
  // Eight corner points pulled in by the chamfer on each axis in turn gives
  // the classic bevelled box: six faces plus twelve edge strips.
  const P = [];
  const put = (x, y, z, nx, ny, nz) => g.vert(x, y, z, nx, ny, nz, (x - x0) * 12, (z - z0) * 12);
  const face = (ax, dir) => {
    const n = [0, 0, 0]; n[ax] = dir;
    const lo = [x0 + cx, y0 + cy, z0 + cz], hi = [x1 - cx, y1 - cy, z1 - cz];
    lo[ax] = hi[ax] = dir > 0 ? [x1, y1, z1][ax] : [x0, y0, z0][ax];
    const o1 = (ax + 1) % 3, o2 = (ax + 2) % 3;
    const q = [];
    for (const [s1, s2] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = [0, 0, 0];
      p[ax] = lo[ax];
      p[o1] = s1 ? hi[o1] : lo[o1];
      p[o2] = s2 ? hi[o2] : lo[o2];
      q.push(put(p[0], p[1], p[2], n[0], n[1], n[2]));
    }
    if (dir > 0) g.quad(q[0], q[1], q[2], q[3]); else g.quad(q[0], q[3], q[2], q[1]);
    P.push(q);
  };
  face(0, 1); face(0, -1); face(1, 1); face(1, -1); face(2, 1); face(2, -1);
  // The chamfer strips are left as open bevels: at 1.2 mm they read as a
  // highlight along every edge, which is what a machined edge looks like,
  // and closing them costs twelve more quads for nothing.
  return g;
}

/* Triangulate a simple polygon by ear clipping.

   A centroid fan is enough for a convex outline and wrong for every
   other one: a gunstock's outline is concave at the wrist and again
   behind the pistol grip, and fanning it threw triangles straight
   across the notches — which rendered as pale sheets lying through
   the middle of the rifle. Ear clipping handles any simple polygon
   and costs nothing at these vertex counts. */
function earClip(pts) {
  const n = pts.length;
  if (n < 3) return [];
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  // Work counter-clockwise whichever way the caller wound it.
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(area < 0 ? n - 1 - i : i);

  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const inside = (p, a, b, c) => {
    const d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };

  const tris = [];
  let guard = idx.length * idx.length;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      if (cross(a, b, c) <= 1e-12) continue;           // reflex, not an ear
      let clear = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (inside(pts[j], a, b, c)) { clear = false; break; }
      }
      if (!clear) continue;
      tris.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;                                // degenerate: bail out
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

/* A slab swept along a 2-D profile in the YZ plane — stocks, grips,
   triggers, levers, anything whose shape is a silhouette. */
function gunProfile(g, pts, halfWidth, opts = {}) {
  const n = pts.length;
  const taper = opts.taper || null;       // (i) -> halfWidth multiplier
  const base = g.positions.length / 3;
  for (let side = 0; side < 2; side++) {
    const sx = side ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const w = halfWidth * (taper ? taper(i / (n - 1)) : 1);
      g.vert(sx * w, pts[i][0], pts[i][1], sx, 0, 0, i / n, side);
    }
  }
  // The rim, including the closing edge back to the first point.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    g.quad(base + i, base + j, base + n + j, base + n + i);
  }
  // Both faces, properly triangulated so concave outlines hold.
  const tris = earClip(pts);
  for (const [a, b, c] of tris) {
    g.tri(base + a, base + c, base + b);
    g.tri(base + n + a, base + n + b, base + n + c);
  }
  return g;
}

/* A coil spring, drawn as a helix of segments. Springs are half of
   why a gun stops working and the player never sees one unless the
   thing comes apart, so when it does, there is a spring there. */
function gunSpring(g, z0, z1, radius, coils, wire = 0.0009) {
  const steps = Math.max(24, Math.round(coils * 12));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = t * coils * TAU;
    pts.push(new Vec3(Math.cos(a) * radius, Math.sin(a) * radius, z0 + (z1 - z0) * t));
  }
  for (let i = 0; i < pts.length - 1; i++) appendLimb(g, pts[i], pts[i + 1], wire, wire, 5);
  return g;
}

/* Copy one finished geometry into a builder at an offset. Parts get
   built in their own comfortable local space and then placed; a
   cylinder's six chambers are the same tube six times around a
   circle, not six hand-written tubes. `flip` reverses the winding,
   which is how a tube becomes a hole. */
function mergeGeometry(g, src, dx = 0, dy = 0, dz = 0, flip = false) {
  const base = g.positions.length / 3;
  const P = src.positions, N = src.normals, U = src.uvs, I = src.indices;
  for (let i = 0; i < P.length; i += 3) {
    g.vert(P[i] + dx, P[i + 1] + dy, P[i + 2] + dz,
      flip ? -N[i] : N[i], flip ? -N[i + 1] : N[i + 1], flip ? -N[i + 2] : N[i + 2],
      U ? U[(i / 3) * 2] : 0, U ? U[(i / 3) * 2 + 1] : 0);
  }
  for (let i = 0; i < I.length; i += 3) {
    if (flip) g.tri(base + I[i], base + I[i + 2], base + I[i + 1]);
    else g.tri(base + I[i], base + I[i + 1], base + I[i + 2]);
  }
  return g;
}

/* ---------------- the cartridge ----------------
   One mesh used three ways: sitting in a magazine, chambered, and
   tumbling across the ground as a spent case. A case is a bottle
   shape with a real extractor groove and a rim, because the groove
   is what the extractor claw grabs and both are drawn. */

const CARTRIDGE_FORM = {
  // caseLenM, rimD, headD, shoulderD, neckD, bulletLenM, bulletD, bottleneck
  '308win': { caseLen: 0.0515, rimD: 0.0124, headD: 0.0117, neckD: 0.0088, bulletLen: 0.0300, bulletD: 0.0078, neck: 0.62 },
  '300winmag': { caseLen: 0.0668, rimD: 0.0134, headD: 0.0134, neckD: 0.0088, bulletLen: 0.0330, bulletD: 0.0078, neck: 0.70 },
  '7mmremmag': { caseLen: 0.0642, rimD: 0.0134, headD: 0.0134, neckD: 0.0081, bulletLen: 0.0330, bulletD: 0.0072, neck: 0.70 },
  '8mmmauser': { caseLen: 0.0570, rimD: 0.0120, headD: 0.0120, neckD: 0.0091, bulletLen: 0.0310, bulletD: 0.0082, neck: 0.66 },
  '762x39': { caseLen: 0.0385, rimD: 0.0114, headD: 0.0114, neckD: 0.0087, bulletLen: 0.0265, bulletD: 0.0078, neck: 0.58 },
  '556nato': { caseLen: 0.0448, rimD: 0.0096, headD: 0.0094, neckD: 0.0064, bulletLen: 0.0230, bulletD: 0.0057, neck: 0.66 },
  '22lr': { caseLen: 0.0151, rimD: 0.0070, headD: 0.0057, neckD: 0.0057, bulletLen: 0.0100, bulletD: 0.0056, neck: 1 },
  '45acp': { caseLen: 0.0228, rimD: 0.0120, headD: 0.0120, neckD: 0.0120, bulletLen: 0.0170, bulletD: 0.0115, neck: 1 },
  '9mm': { caseLen: 0.0191, rimD: 0.0099, headD: 0.0099, neckD: 0.0099, bulletLen: 0.0150, bulletD: 0.0090, neck: 1 },
  '357mag': { caseLen: 0.0327, rimD: 0.0111, headD: 0.0098, neckD: 0.0098, bulletLen: 0.0160, bulletD: 0.0091, neck: 1 },
  '500sw': { caseLen: 0.0411, rimD: 0.0142, headD: 0.0135, neckD: 0.0135, bulletLen: 0.0220, bulletD: 0.0127, neck: 1 },
  '50bmg': { caseLen: 0.0990, rimD: 0.0205, headD: 0.0203, neckD: 0.0144, bulletLen: 0.0580, bulletD: 0.0130, neck: 0.68 },
  '12ga_00buck': { caseLen: 0.0700, rimD: 0.0223, headD: 0.0205, neckD: 0.0205, bulletLen: 0, bulletD: 0, neck: 1, shell: true },
};
CARTRIDGE_FORM['12ga_slug'] = CARTRIDGE_FORM['12ga_00buck'];
CARTRIDGE_FORM['12ga_birdshot'] = CARTRIDGE_FORM['12ga_00buck'];

/* Build one cartridge. `spent` drops the bullet and dents the case
   mouth, which is what a fired case looks like on the ground. */
function cartridgeGeometry(cartridgeId, opts = {}) {
  const f = CARTRIDGE_FORM[cartridgeId] || CARTRIDGE_FORM['308win'];
  const g = new Geometry();
  const spent = !!opts.spent;
  const L = f.caseLen;
  const hr = f.headD / 2, nr = f.neckD / 2, rr = f.rimD / 2;

  // Rim and extractor groove: the groove is 1.5 mm of relief behind the
  // rim, and it is the feature the extractor claw is drawn to fit.
  gunTube(g, 0, 0.0012, rr, rr, { segs: 16, capStart: true, capEnd: false });
  gunTube(g, 0.0012, 0.0028, hr * 0.84, hr * 0.84, { segs: 16, capStart: false, capEnd: false });
  gunTube(g, 0.0028, 0.0040, hr, hr, { segs: 16, capStart: false, capEnd: false });

  if (f.neck < 1) {
    // Bottleneck: body, then a shoulder, then the neck.
    const shoulderZ = L * f.neck;
    gunTube(g, 0.0040, shoulderZ, hr, hr * 0.985, { segs: 16, capStart: false, capEnd: false });
    gunTube(g, shoulderZ, shoulderZ + (hr - nr) * 1.6, hr * 0.985, nr, { segs: 16, capStart: false, capEnd: false });
    gunTube(g, shoulderZ + (hr - nr) * 1.6, L, nr, nr, { segs: 16, capStart: false, capEnd: spent });
  } else {
    gunTube(g, 0.0040, L, hr, hr * (f.shell ? 1 : 0.99), { segs: 16, capStart: false, capEnd: spent });
  }

  if (!spent && f.bulletLen > 0) {
    // The bullet: a cylindrical bearing surface and a tangent ogive, which
    // is the curve that makes a spitzer look like a spitzer.
    const br = f.bulletD / 2;
    const seatZ = L - f.bulletLen * 0.35;
    gunTube(g, seatZ, seatZ + f.bulletLen * 0.45, br, br, { segs: 16, capStart: false, capEnd: false });
    const OG = 7;
    for (let i = 0; i < OG; i++) {
      const t0 = i / OG, t1 = (i + 1) / OG;
      const z0 = seatZ + f.bulletLen * (0.45 + 0.55 * t0);
      const z1 = seatZ + f.bulletLen * (0.45 + 0.55 * t1);
      // Tangent ogive: radius falls as the square root of the remaining run.
      gunTube(g, z0, z1, br * Math.sqrt(1 - t0 * t0 * 0.94), br * Math.sqrt(1 - t1 * t1 * 0.94),
        { segs: 16, capStart: false, capEnd: i === OG - 1 });
    }
  } else if (!spent && f.shell) {
    // A shotshell's crimp: a folded star, drawn as a shallow dome.
    gunTube(g, L, L + 0.0015, hr * 0.99, hr * 0.5, { segs: 16, capStart: false, capEnd: true });
  }

  // Primer, in the head. Visible, and struck once the round has been fired.
  gunTube(g, -0.0002, 0.0012, f.rimD * 0.2, f.rimD * 0.2, { segs: 12 });
  smoothNormals(g);
  return g.finalize();
}

/* ---------------- weapon dimensions ----------------
   Real numbers. Barrel lengths come from the firearm table the
   simulation already uses; everything else is measured off the gun
   it belongs to. */

/* `oalM` is the gun's real overall length. Everything behind the breech
   face is then `oalM - barrelM`, which fixes where the butt is, and the
   trigger sits one length-of-pull forward of the butt. A Remington 700
   with a 24-inch barrel is 42.5 inches long, so its tail is 470 mm and
   its trigger is 127 mm behind the breech. Deriving it this way is why
   the parts fit each other instead of each being separately plausible. */
const GUN_PROFILE = {
  boltRifle: {
    oalM: 1.08,
    family: 'rifle', barrelM: 0.610, barrelBreechD: 0.0300, barrelMuzzleD: 0.0170,
    receiverLen: 0.212, receiverD: 0.0345, boltD: 0.0175, boltThrow: 0.098,
    stock: 'sporter', stockMat: 'walnut', metal: 'blued',
    magType: 'internal', rounds: 4, railed: true, boltHandle: 'swept',
    lop: 0.343, note: 'Remington 700',
  },
  heavyRifle: {
    oalM: 1.448,
    family: 'rifle', barrelM: 0.737, barrelBreechD: 0.0420, barrelMuzzleD: 0.0300,
    receiverLen: 0.420, receiverD: 0.0520, boltD: 0.0300, boltThrow: 0.140,
    stock: 'chassis', stockMat: 'polymer', metal: 'parked',
    magType: 'box', rounds: 10, railed: true, brake: 'arrow', bipod: true,
    lop: 0.360, fluted: true, note: 'Barrett M82',
  },
  carbine: {
    oalM: 0.88,
    family: 'rifle', barrelM: 0.415, barrelBreechD: 0.0250, barrelMuzzleD: 0.0150,
    receiverLen: 0.250, receiverD: 0.0380, boltD: 0.0180, boltThrow: 0.090,
    stock: 'thumbhole', stockMat: 'beech', metal: 'parked',
    magType: 'curvedBox', rounds: 30, railed: false, gasPiston: true,
    selector: 'akLever', lop: 0.330, note: 'AK-47',
  },
  modernCarbine: {
    oalM: 1.006,
    family: 'rifle', barrelM: 0.508, barrelBreechD: 0.0230, barrelMuzzleD: 0.0140,
    receiverLen: 0.260, receiverD: 0.0360, boltD: 0.0180, boltThrow: 0.088,
    stock: 'tube', stockMat: 'polymer', metal: 'blued',
    magType: 'straightBox', rounds: 30, railed: true, gasTube: true,
    selector: 'arSafety', charging: 'rear', lop: 0.335, note: 'M16',
  },
  rimfire: {
    oalM: 0.94,
    family: 'rifle', barrelM: 0.470, barrelBreechD: 0.0220, barrelMuzzleD: 0.0160,
    receiverLen: 0.180, receiverD: 0.0300, boltD: 0.0140, boltThrow: 0.060,
    stock: 'sporter', stockMat: 'beech', metal: 'blued',
    magType: 'rotary', rounds: 10, railed: true, lop: 0.340, note: 'Ruger 10/22',
  },
  shotgun: {
    oalM: 1.219,
    family: 'shotgun', barrelM: 0.711, barrelBreechD: 0.0260, barrelMuzzleD: 0.0225,
    receiverLen: 0.200, receiverD: 0.0400, boltD: 0.0230, boltThrow: 0.105,
    stock: 'sporter', stockMat: 'walnut', metal: 'blued',
    magType: 'tube', rounds: 5, railed: false, pump: true, rib: true,
    lop: 0.356, note: 'Remington 870',
  },
  pistol: {
    oalM: 0.216,
    family: 'pistol', barrelM: 0.127, barrelBreechD: 0.0165, barrelMuzzleD: 0.0155,
    receiverLen: 0.190, receiverD: 0.0320, boltD: 0.0230, boltThrow: 0.048,
    stock: 'grip', stockMat: 'walnut', metal: 'blued',
    magType: 'grip', rounds: 7, slide: true, hammerFired: true, note: 'Colt 1911',
  },
  revolver: {
    oalM: 0.238,
    family: 'revolver', barrelM: 0.102, barrelBreechD: 0.0180, barrelMuzzleD: 0.0170,
    receiverLen: 0.090, receiverD: 0.0340, cylinderLen: 0.042, cylinderD: 0.0380,
    stock: 'grip', stockMat: 'walnut', metal: 'stainless',
    magType: 'cylinder', rounds: 6, hammerFired: true, note: 'S&W 686',
  },
  bigRevolver: {
    oalM: 0.381,
    family: 'revolver', barrelM: 0.213, barrelBreechD: 0.0220, barrelMuzzleD: 0.0210,
    receiverLen: 0.105, receiverD: 0.0400, cylinderLen: 0.055, cylinderD: 0.0470,
    stock: 'grip', stockMat: 'rubber', metal: 'stainless',
    magType: 'cylinder', rounds: 5, hammerFired: true, brake: 'ported', note: 'S&W 500',
  },
};

/* ---------------- the parts ----------------
   Each builder returns a Geometry in its OWN local space, with the
   origin at the point the part pivots or seats on. That is what
   lets the viewmodel slide a bolt, drop a magazine and rotate a
   selector without any of them knowing about the others, and it is
   what lets the workbench pull them apart along their own axes. */

const GUN_PARTS = {

  /* The barrel. Breech end at z=0, tapering to the muzzle, with a
     bore drilled all the way through — you can look down it, which
     is exactly what the player does when checking for an obstruction
     after a squib. */
  barrel(p) {
    const g = new Geometry();
    const bore = (p.boreD || 0.0078) / 2;
    const L = p.barrelM, r0 = p.barrelBreechD / 2, r1 = p.barrelMuzzleD / 2;
    // Chamber end is the fattest part and stays parallel for the length of
    // the case before the taper starts.
    gunTube(g, 0, 0.055, r0, r0 * 0.98, { segs: 20, bore, crownStart: true });
    if (p.fluted) {
      // Flutes: six shallow scallops, which is how a heavy barrel loses
      // weight without losing stiffness.
      gunTube(g, 0.055, L * 0.72, r0 * 0.98, r0 * 0.8, { segs: 24, bore, flats: 6 });
      gunTube(g, L * 0.72, L, r0 * 0.8, r1, { segs: 20, bore });
    } else {
      gunTube(g, 0.055, L * 0.45, r0 * 0.98, (r0 + r1) * 0.54, { segs: 20, bore });
      gunTube(g, L * 0.45, L, (r0 + r1) * 0.54, r1, { segs: 20, bore });
    }
    if (p.rib) {
      // A shotgun's ventilated rib, standing on posts above the barrel.
      gunBlock(g, -0.004, r1 * 0.95, 0.10, 0.004, r1 * 0.95 + 0.0022, L);
      for (let z = 0.12; z < L - 0.02; z += 0.055) gunBlock(g, -0.0022, r1 * 0.6, z, 0.0022, r1 * 0.98, z + 0.006);
    }
    if (p.threaded !== false && p.family === 'rifle') {
      // 1/2-28 or 5/8-24 muzzle threads, drawn as the shoulder and a few
      // turns, so a suppressor has something visible to screw onto.
      for (let i = 0; i < 6; i++) {
        gunTube(g, L - 0.016 + i * 0.0026, L - 0.0146 + i * 0.0026, r1 * 1.02, r1 * 1.02,
          { segs: 14, capStart: false, capEnd: false });
      }
    }
    smoothNormals(g);
    return g.finalize();
  },

  /* The receiver: the box everything else hangs off, with an
     ejection port cut through the right wall. The port is a real
     hole, because a case is going to come out of it. */
  receiver(p) {
    const g = new Geometry();
    const L = p.receiverLen, r = p.receiverD / 2;
    const back = -L * 0.78, front = L * 0.22;
    if (p.family === 'rifle' && !p.gasTube && !p.gasPiston) {
      // A round bolt-action receiver, with the flat-bottomed recoil lug
      // area and the loading port on top.
      gunTube(g, back, front, r, r, { segs: 20 });
      gunBlock(g, -r * 0.92, -r * 1.25, back + 0.02, r * 0.92, -r * 0.2, front - 0.01);
    } else {
      // A flat-sided receiver: upper, lower and the magwell throat.
      gunBlock(g, -r * 0.78, -r * 0.55, back, r * 0.78, r * 0.82, front);
      gunBlock(g, -r * 0.70, -r * 1.35, back + 0.03, r * 0.70, -r * 0.5, back + 0.10);
    }
    // Ejection port: a rectangular relief on the right wall, with a lip
    // below it — the deflector that stops brass hitting a left-hander.
    gunBlock(g, r * 0.66, -r * 0.1, back + L * 0.30, r * 0.9, r * 0.62, back + L * 0.30 + 0.062);
    gunBlock(g, r * 0.72, r * 0.42, back + L * 0.30 + 0.058, r * 1.24, r * 0.86, back + L * 0.30 + 0.082);
    if (p.railed) {
      // A Picatinny rail: the slots are what make it read as a rail rather
      // than a bar, so they are cut rather than painted.
      gunBlock(g, -0.0105, r * 0.78, back + 0.012, 0.0105, r * 0.78 + 0.0042, front - 0.006);
      for (let z = back + 0.018; z < front - 0.012; z += 0.0102) {
        gunBlock(g, -0.0112, r * 0.78 + 0.0035, z, 0.0112, r * 0.78 + 0.0075, z + 0.0062);
      }
    }
    smoothNormals(g);
    return g.finalize();
  },

  /* The bolt. Two locking lugs, an extractor claw sized to the
     cartridge's extractor groove, a plunger ejector in the face, and
     the firing-pin hole through the middle. The handle is part of
     the bolt body on a turnbolt, which is why the whole thing
     rotates before it comes back. */
  bolt(p) {
    const g = new Geometry();
    const r = p.boltD / 2;
    const L = p.family === 'pistol' ? 0.052 : 0.112;
    gunTube(g, -L, 0, r, r, { segs: 18, capEnd: false });
    // Bolt face: recessed, so the case head sits inside it.
    gunTube(g, -0.004, 0, r, r, { segs: 18, bore: r * 0.72, crownEnd: true });
    // Locking lugs, at 3 and 9 o'clock.
    for (const s of [1, -1]) {
      gunBlock(g, s * r * 0.7, -r * 0.42, -0.016, s * r * 1.42, r * 0.42, -0.001);
    }
    // The extractor claw: a hook on the rim of the bolt face. This is the
    // single part most likely to end a hunt, so it is drawn.
    gunBlock(g, r * 0.62, -r * 0.30, -0.030, r * 1.12, r * 0.30, -0.0005);
    gunBlock(g, r * 0.72, -r * 0.20, -0.0035, r * 1.08, r * 0.20, 0.0012);
    // Plunger ejector, in the bolt face off-centre.
    gunTube(g, -0.002, 0.0008, r * 0.13, r * 0.13, { segs: 8 });
    if (p.boltHandle === 'swept') {
      // The handle sweeps down and back, and ends in a knob.
      const base = new Vec3(r * 0.8, 0, -L * 0.62);
      const knee = new Vec3(r * 2.3, -r * 0.9, -L * 0.70);
      const knob = new Vec3(r * 3.1, -r * 2.4, -L * 0.76);
      appendLimb(g, base, knee, r * 0.34, r * 0.26, 10);
      appendLimb(g, knee, knob, r * 0.26, r * 0.22, 10);
      const gg = new Geometry();
      gunTube(gg, 0, 0.001, r * 0.62, r * 0.62, { segs: 14 });
      mergeGeometry(g, gg, knob.x, knob.y, knob.z);
    } else if (p.charging === 'rear') {
      // A charging handle: a T sticking out the back of the receiver.
      gunBlock(g, -r * 0.22, r * 0.1, -L - 0.055, r * 0.22, r * 0.5, -L + 0.004);
      gunBlock(g, -r * 1.9, r * 0.12, -L - 0.055, r * 1.9, r * 0.42, -L - 0.040);
    } else {
      // A slab bolt carrier with the charging handle on its right side.
      gunBlock(g, r * 0.8, -r * 0.25, -L * 0.5, r * 2.6, r * 0.25, -L * 0.5 + 0.016);
    }
    smoothNormals(g);
    return g.finalize();
  },

  /* The firing pin: a long thin rod with a rounded tip and the
     collar the spring pushes on. Its tip going round is the
     difference between a bang and a light strike. */
  firingPin(p) {
    const g = new Geometry();
    const r = p.boltD * 0.09;
    gunTube(g, -0.086, 0.0018, r, r, { segs: 10, capEnd: false });
    gunTube(g, 0.0018, 0.0034, r * 0.62, r * 0.42, { segs: 10 });
    gunBlock(g, -r * 2.6, -r * 2.6, -0.050, r * 2.6, r * 2.6, -0.044);
    smoothNormals(g);
    return g.finalize();
  },

  firingPinSpring(p) {
    const g = new Geometry();
    gunSpring(g, -0.044, -0.004, p.boltD * 0.26, 9, p.boltD * 0.045);
    smoothNormals(g);
    return g.finalize();
  },

  extractor(p) {
    const g = new Geometry();
    const r = p.boltD / 2;
    gunBlock(g, -r * 0.25, -r * 0.24, -0.030, r * 0.25, r * 0.24, 0);
    gunBlock(g, -r * 0.22, -r * 0.16, -0.0035, r * 0.22, r * 0.16, 0.0016);
    smoothNormals(g);
    return g.finalize();
  },

  /* The trigger: a curved blade on a pin. It moves about four
     millimetres and the player watches it do so. */
  trigger() {
    const g = new Geometry();
    gunProfile(g, [
      [0.000, 0.0000], [-0.006, 0.0016], [-0.014, 0.0022], [-0.022, 0.0016],
      [-0.028, -0.0004], [-0.030, -0.0030], [-0.024, -0.0044], [-0.014, -0.0044],
      [-0.004, -0.0032], [0.001, -0.0014],
    ], 0.0026);
    smoothNormals(g);
    return g.finalize();
  },

  triggerGuard(p) {
    const g = new Geometry();
    /* A bow: an outer arc and an inner arc sharing their two ends, swept
       to a slab. The old version built two full arcs with no shared ends,
       which stitched into a ladder of rungs across the opening. */
    const outer = [], inner = [];
    const R = 0.030, r = R - 0.0042;
    for (let i = 0; i <= 14; i++) {
      const a = PI * (-0.10 + (i / 14) * 1.20);
      outer.push([-0.010 - Math.cos(a) * R * 0.62, -Math.sin(a) * R]);
      inner.push([-0.010 - Math.cos(a) * r * 0.62, -Math.sin(a) * r]);
    }
    gunProfile(g, outer.concat(inner.reverse()), p.receiverD * 0.20);
    smoothNormals(g);
    return g.finalize();
  },

  /* The hammer and the sear: the two parts that decide whether the
     gun goes off when you ask it to, and the two the player will be
     looking at when it does not. */
  hammer(p) {
    const g = new Geometry();
    gunProfile(g, [
      [0.000, 0.000], [0.008, 0.0022], [0.018, 0.0042], [0.026, 0.0028],
      [0.029, -0.0008], [0.024, -0.0040], [0.012, -0.0052], [0.002, -0.0038],
    ], p.receiverD * 0.10);
    // The spur, checkered on a real hammer, and the thing you cock with a thumb.
    gunBlock(g, -p.receiverD * 0.09, 0.024, -0.0032, p.receiverD * 0.09, 0.031, 0.0032);
    smoothNormals(g);
    return g.finalize();
  },

  sear(p) {
    const g = new Geometry();
    gunProfile(g, [
      [0.000, 0.000], [0.0105, 0.0008], [0.0125, 0.0028], [0.0105, 0.0040],
      [0.000, 0.0032], [-0.0022, 0.0014],
    ], p.receiverD * 0.055);
    smoothNormals(g);
    return g.finalize();
  },

  /* The fire selector. An AK's lever is a stamped plate on the right
     side of the receiver that sweeps through three positions; an
     AR's is a thumb paddle that rotates ninety degrees. Both are
     drawn where the hand actually reaches for them. */
  selector(p) {
    const g = new Geometry();
    if (p.selector === 'akLever') {
      /* A stamped plate lying along the right side of the receiver,
         running BACK from its pivot. gunProfile takes (y, z) pairs, and
         putting the run in the first slot stood a 60 mm lever straight
         up out of the top of the rifle like an aerial. */
      gunProfile(g, [
        [0.006, 0.006], [0.009, -0.010], [0.008, -0.058], [0.002, -0.064],
        [-0.005, -0.060], [-0.006, -0.010], [-0.004, 0.004],
      ], 0.0016);
      gunBlock(g, -0.0026, -0.004, -0.004, 0.0026, 0.004, 0.004);
    } else {
      gunTube(g, -0.004, 0.010, 0.0042, 0.0042, { segs: 12 });
      gunProfile(g, [[0.000, 0.010], [0.000, 0.028], [-0.006, 0.030], [-0.007, 0.012]], 0.0038);
    }
    smoothNormals(g);
    return g.finalize();
  },

  /* The magazine: a box with a real follower and a real spring
     inside it, because when it comes out and gets stripped, both are
     there. A curved AK magazine is curved because 7.62x39 is a
     tapered case and thirty of them stack on an arc. */
  magazine(p) {
    const g = new Geometry();
    const w = p.magType === 'curvedBox' ? 0.0125 : p.magType === 'grip' ? 0.0085 : 0.0115;
    const d = p.magType === 'curvedBox' ? 0.030 : p.magType === 'grip' ? 0.025 : 0.028;
    const h = p.magType === 'grip' ? 0.074 : (p.rounds > 12 ? 0.175 : 0.075);
    const curve = p.magType === 'curvedBox' ? 0.055 : 0;
    /* One swept body. Built as a stack of nine separate chamfered blocks
       it read as a pile of bricks hanging under the rifle — each block
       had its own six faces and its own bevelled edges, and the seams
       between them caught the light as rungs. A magazine is one pressing.

       The curve is not decoration: 7.62x39 is a tapered case, thirty of
       them stack on an arc, and that arc is the reason an AK magazine
       looks the way it does. */
    const RINGS = 10;
    const rows = [];
    for (let i = 0; i <= RINGS; i++) {
      const t = i / RINGS;
      const z = curve * t * t;
      const y = -h * t;
      const corners = [
        [-w, y, -d / 2 + z], [w, y, -d / 2 + z], [w, y, d / 2 + z], [-w, y, d / 2 + z],
      ];
      rows.push(corners.map((c, k) => {
        const nx = k === 0 || k === 3 ? -1 : 1;
        const nz = k < 2 ? -1 : 1;
        return g.vert(c[0], c[1], c[2], nx * 0.7, 0, nz * 0.7, k / 4, t);
      }));
    }
    for (let i = 0; i < RINGS; i++) {
      for (let k = 0; k < 4; k++) {
        const a = rows[i][k], b = rows[i][(k + 1) % 4];
        const c = rows[i + 1][(k + 1) % 4], e = rows[i + 1][k];
        g.quad(a, b, c, e);
      }
    }
    g.quad(rows[RINGS][0], rows[RINGS][3], rows[RINGS][2], rows[RINGS][1]);
    // Feed lips: the two tabs that hold the top round down against the
    // spring until the bolt strips it forward.
    gunBlock(g, -w, -0.001, -d / 2, -w + 0.0022, 0.0055, d / 2);
    gunBlock(g, w - 0.0022, -0.001, -d / 2, w, 0.0055, d / 2);
    // Floorplate, and the rib down the spine that stiffens the body.
    gunBlock(g, -w * 1.14, -h - 0.005, -d / 2 + curve - 0.0015, w * 1.14, -h, d / 2 + curve + 0.0015);
    gunBlock(g, -w * 0.28, -h * 0.92, -d / 2 + curve * 0.55 - 0.0012, w * 0.28, -h * 0.08, -d / 2 + curve * 0.2 + 0.0012, 0.0006);
    smoothNormals(g);
    return g.finalize();
  },

  magFollower(p) {
    const g = new Geometry();
    const w = p.magType === 'curvedBox' ? 0.0105 : 0.0095;
    gunBlock(g, -w, -0.006, -0.012, w, 0, 0.012);
    gunBlock(g, -w, -0.002, 0.004, w, 0.005, 0.012);
    smoothNormals(g);
    return g.finalize();
  },

  magSpring(p) {
    const g = new Geometry();
    const h = p.rounds > 12 ? 0.16 : 0.065;
    // A magazine spring is a flat zigzag, not a coil.
    let y = 0;
    const w = 0.0085;
    while (y > -h) {
      appendLimb(g, new Vec3(-w, y, -0.008), new Vec3(w, y - 0.004, 0.008), 0.0007, 0.0007, 5);
      appendLimb(g, new Vec3(w, y - 0.004, 0.008), new Vec3(-w, y - 0.008, -0.008), 0.0007, 0.0007, 5);
      y -= 0.008;
    }
    smoothNormals(g);
    return g.finalize();
  },

  /* The revolver's cylinder: six chambers actually bored through it,
     and the flutes between them. Loading it is putting rounds into
     holes you can see. */
  cylinder(p) {
    const g = new Geometry();
    const R = p.cylinderD / 2, L = p.cylinderLen, n = p.rounds;
    gunTube(g, 0, L, R, R, { segs: 24, capStart: false, capEnd: false });
    const chamberR = (p.cylinderD * 0.165);
    const orbit = R * 0.62;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const gg = new Geometry();
      gunTube(gg, -0.0005, L + 0.0005, chamberR, chamberR, { segs: 12, capStart: false, capEnd: false });
      // Wound inside-out so the chamber reads as a hole in the face.
      const flip = gg.finalize();
      mergeGeometry(g, flip, Math.cos(a) * orbit, Math.sin(a) * orbit, 0, true);
      // The flute between this chamber and the next.
      const fa = a + PI / n;
      const fg = new Geometry();
      gunBlock(fg, -R * 0.12, -0.0018, L * 0.12, R * 0.12, 0.0018, L * 0.88);
      mergeGeometry(g, fg.finalize(), Math.cos(fa) * R * 0.97, Math.sin(fa) * R * 0.97, 0);
    }
    // Ratchet at the rear, which the hand turns one chamber per cock.
    gunTube(g, -0.004, 0, R * 0.34, R * 0.30, { segs: 16 });
    smoothNormals(g);
    return g.finalize();
  },

  /* Sights. A hooded front post and a rear notch, at real heights —
     the sight radius is the distance between them and it is what
     the accuracy model is already using. */
  frontSight(p) {
    const g = new Geometry();
    const h = p.barrelMuzzleD * 0.5;
    gunBlock(g, -0.0055, h, -0.005, 0.0055, h + 0.004, 0.005);            // base
    gunBlock(g, -0.0011, h + 0.004, -0.0011, 0.0011, h + 0.0125, 0.0011); // post
    // The hood, open at the top so light gets in.
    gunBlock(g, -0.0062, h + 0.004, -0.0055, -0.0042, h + 0.016, 0.0055);
    gunBlock(g, 0.0042, h + 0.004, -0.0055, 0.0062, h + 0.016, 0.0055);
    gunBlock(g, -0.0062, h + 0.0145, -0.0055, 0.0062, h + 0.016, 0.0055);
    smoothNormals(g);
    return g.finalize();
  },

  rearSight(p) {
    const g = new Geometry();
    const h = p.receiverD * 0.5;
    gunBlock(g, -0.011, h, -0.006, 0.011, h + 0.0035, 0.006);
    gunBlock(g, -0.011, h + 0.0035, -0.004, -0.0016, h + 0.010, 0.004);
    gunBlock(g, 0.0016, h + 0.0035, -0.004, 0.011, h + 0.010, 0.004);
    // Elevation ladder, hinged at the front the way a battle sight is.
    gunBlock(g, -0.009, h + 0.0035, 0.005, 0.009, h + 0.006, 0.010);
    smoothNormals(g);
    return g.finalize();
  },

  /* The buttstock. A sporter stock has a comb your cheek sits on, a
     pistol grip swelling under the trigger hand, and a toe that
     drops away; a chassis is a straight tube with a cheekpiece
     clamped to it. Both are drawn as a silhouette because that is
     what a stock is — everything about it is in the side profile. */
  stock(p) {
    const g = new Geometry();
    const lop = p.lop || 0.34;
    // Where the butt face is: everything behind the breech, from the gun's
    // real overall length. The stock is then drawn between there and the
    // action, rather than floated at a guessed offset.
    const butt = -(p.oalM - p.barrelM);
    const bd = p.barrelBreechD * 0.5;

    if (p.stock === 'tube') {
      /* A buffer tube with a collapsible stock on it. The tube is in line
         with the bore — that is the whole point of the layout, and it is
         why an AR climbs less than a rifle with a dropped stock. */
      gunTube(g, butt + 0.055, -p.receiverLen * 0.74, 0.0148, 0.0148, { segs: 16 });
      gunProfile(g, [
        [0.026, butt + 0.115], [0.028, butt + 0.070], [0.022, butt + 0.010],
        [0.020, butt], [-0.026, butt], [-0.030, butt + 0.020],
        [-0.032, butt + 0.060], [-0.028, butt + 0.105], [0.004, butt + 0.120],
      ], 0.019, { taper: (t) => 0.8 + 0.25 * Math.sin(t * PI) });
      gunBlock(g, -0.021, -0.030, butt - 0.014, 0.021, 0.026, butt + 0.002);
    } else if (p.stock === 'chassis') {
      gunProfile(g, [
        [0.034, butt + 0.160], [0.036, butt + 0.030], [0.030, butt],
        [-0.030, butt], [-0.038, butt + 0.040], [-0.040, butt + 0.110],
        [-0.020, butt + 0.170],
      ], 0.017);
      gunBlock(g, -0.018, 0.034, butt + 0.020, 0.018, 0.050, butt + 0.150);  // cheekpiece
      gunBlock(g, -0.023, -0.034, butt - 0.018, 0.023, 0.038, butt + 0.002); // pad
    } else if (p.stock === 'thumbhole') {
      /* An AK stock: a short straight club with a steep drop, separate
         from the pistol grip and the handguard. */
      // The stock runs from the butt forward to the back of the receiver.
      // Drawn to a fixed length instead, it floated in the air behind an
      // AK whose tail is 465 mm long.
      const tang = -p.receiverLen * 0.74;
      const run = tang - butt;
      gunProfile(g, [
        [-0.004, tang], [-0.010, butt + run * 0.58], [-0.018, butt + run * 0.20],
        [-0.022, butt], [-0.062, butt], [-0.064, butt + run * 0.20],
        [-0.052, butt + run * 0.58], [-0.034, tang],
      ], 0.0175, { taper: (t) => 0.82 + 0.24 * Math.sin(t * PI) });
      gunBlock(g, -0.021, -0.066, butt - 0.010, 0.021, -0.018, butt + 0.002);
    } else {
      /* A sporter stock, drawn as the outline it actually is. Top line
         from the butt heel forward: the comb rises toward the front, dips
         at the wrist where the hand goes, runs flat under the receiver and
         out along the barrel channel to the forend tip. Bottom line back
         from the forend: the belly, the floorplate, behind the trigger
         guard, then the pistol grip swelling down and the toe.

         Everything below the bore. The old profile put the butt thirty
         millimetres ABOVE the barrel, which is what made it read as an
         orange wedge stuck on the back. */
      const forend = Math.min(p.barrelM * 0.52, 0.30);
      gunProfile(g, [
        // top, rear to front
        [-0.030, butt], [-0.027, butt + 0.055], [-0.019, butt + 0.140],
        [-0.028, butt + 0.180], [-0.017, butt + 0.205],
        [-bd - 0.004, -0.010], [-bd - 0.003, 0.060], [-bd - 0.002, forend],
        // front face of the forend
        [-bd - 0.030, forend],
        // bottom, front to rear
        [-bd - 0.036, forend * 0.55], [-bd - 0.034, 0.040],
        [-0.044, -0.030], [-0.042, -0.070],
        [-0.048, butt + 0.330], [-0.072, butt + 0.300], [-0.098, butt + 0.262],
        [-0.090, butt + 0.225], [-0.074, butt + 0.180], [-0.066, butt + 0.110],
        [-0.082, butt + 0.030], [-0.086, butt],
      ], 0.0225, { taper: (t) => 0.68 + 0.46 * Math.sin(t * PI * 0.86) });
    }
    smoothNormals(g);
    return g.finalize();
  },

  /* The pistol grip, or the wrist of a one-piece stock. Checkering
     is drawn as real relief — it catches light, which is most of
     what makes wood read as wood at arm's length. */
  grip(p) {
    const g = new Geometry();
    if (p.family === 'pistol' || p.family === 'revolver') {
      /* Two panels, one each side of the frame. Drawn as a solid block
         on the frame's own datum it came out as a wooden wedge standing
         behind the pistol — grip panels are 6 mm of wood screwed to the
         outside of a steel skeleton, and that is the shape they are. */
      const w = p.receiverD * 0.42 * 0.94;
      const gz = -p.receiverLen * 0.16 - 0.020;
      const outline = p.family === 'pistol'
        ? [[-0.014, gz + 0.022], [-0.016, gz - 0.012], [-0.048, gz - 0.024],
          [-0.080, gz - 0.018], [-0.082, gz + 0.002], [-0.050, gz + 0.016]]
        : [[-0.006, gz + 0.018], [-0.014, gz - 0.014], [-0.052, gz - 0.030],
          [-0.086, gz - 0.016], [-0.082, gz + 0.010], [-0.040, gz + 0.020]];
      for (const side of [1, -1]) {
        const pg = new Geometry();
        gunProfile(pg, outline, 0.0028);
        mergeGeometry(g, pg.finalize(), side * (w + 0.0026), 0, 0);
      }
    } else {
      // A rifle's pistol grip: one piece, straight through.
      const drop = 0.092;
      gunProfile(g, [
        [0.000, 0.012], [-0.012, 0.010], [-0.030, 0.000], [-0.052, -0.012],
        [-drop + 0.006, -0.022], [-drop, -0.014], [-drop, 0.014],
        [-0.058, 0.024], [-0.034, 0.026], [-0.014, 0.026], [-0.002, 0.022],
      ], 0.0155, { taper: (t) => 0.82 + 0.3 * Math.sin(t * PI) });
    }
    /* No checkering blocks. A grip tapers in width and curves back in Z
       as it drops, so blocks laid across it at a fixed width and a fixed
       length stand proud at both ends and read as the rungs of a ladder
       — which is what every grip in the game looked like. Checkering is
       half a millimetre of relief; it belongs in the material, not in
       twenty-eight extra faces that miss the shape they sit on. */
    smoothNormals(g);
    return g.finalize();
  },

  /* The handguard: what stops the support hand cooking on a hot
     barrel, and on a gas gun what covers the gas tube. */
  handguard(p) {
    const g = new Geometry();
    const L = p.family === 'pistol' ? 0 : Math.min(0.26, p.barrelM * 0.55);
    if (!L) return g.finalize();
    const bore = p.barrelBreechD * 0.52;      // it wraps the barrel
    const r = p.barrelBreechD * 0.86;
    if (p.gasTube) {
      // A slotted aluminium tube, as on a modern carbine.
      gunTube(g, 0.02, 0.02 + L, r, r * 0.94, { segs: 18, bore, crownStart: true });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        for (let z = 0.05; z < L; z += 0.030) {
          const sg = new Geometry();
          gunBlock(sg, -0.0035, -0.0035, z, 0.0035, 0.0035, z + 0.016);
          mergeGeometry(g, sg.finalize(), Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86, 0.02, true);
        }
      }
    } else {
      /* A wooden forend. It WRAPS the barrel — drawn as a flat slab
         swept sideways it came out as a pale plate hanging in the air
         under the rifle, because a profile sweeps across the gun and a
         forend runs along it. Finger grooves are shallow rings turned
         into the outside, which is how they are actually cut. */
      gunTube(g, 0.02, 0.02 + L, r * 0.96, r * 0.88, { segs: 16, bore, crownStart: true });
      for (let i = 0; i < 4; i++) {
        const z = 0.045 + i * (L * 0.21);
        gunTube(g, z, z + 0.014, r * 0.99, r * 0.99, { segs: 16, capStart: false, capEnd: false });
      }
      // The lower half swells to fill the hand.
      const bg = new Geometry();
      gunTube(bg, 0.02, 0.02 + L, r * 1.02, r * 0.94, { segs: 16, capStart: false, capEnd: false });
      mergeGeometry(g, bg.finalize(), 0, -r * 0.14, 0);
    }
    smoothNormals(g);
    return g.finalize();
  },

  /* The gas system. A piston gun carries its tube above the barrel
     and the gas block is a visible lump clamped to it; direct
     impingement has a thin tube running back into the receiver. */
  gasSystem(p) {
    const g = new Geometry();
    if (!p.gasTube && !p.gasPiston) return g.finalize();
    const r = p.barrelMuzzleD * 0.5;
    const blockZ = p.barrelM * (p.gasPiston ? 0.52 : 0.66);
    gunBlock(g, -r * 1.5, -r * 1.3, blockZ, r * 1.5, r * 2.4, blockZ + 0.030);
    if (p.gasPiston) {
      gunTube(g, 0.02, blockZ + 0.006, r * 0.72, r * 0.72, { segs: 12, capEnd: false });
      gunTube(g, 0.016, 0.024, r * 0.95, r * 0.95, { segs: 12 });
    } else {
      gunTube(g, 0.01, blockZ + 0.004, 0.0022, 0.0022, { segs: 8 });
    }
    smoothNormals(g);
    return g.finalize();
  },

  /* Muzzle devices. A brake is ports cut through a block; a
     suppressor is a sealed tube with baffles you can see the ends
     of. The simulation already knows what each does to noise,
     velocity and how fast the gun fouls — this is what they look
     like while doing it. */
  muzzleDevice(p, kind) {
    const g = new Geometry();
    const r = p.barrelMuzzleD * 0.5;
    if (kind === 'suppressor') {
      gunTube(g, 0, 0.185, r * 1.85, r * 1.85, { segs: 20, bore: r * 0.62, crownStart: true });
      for (let i = 0; i < 7; i++) {
        gunTube(g, 0.022 + i * 0.022, 0.024 + i * 0.022, r * 1.92, r * 1.92,
          { segs: 20, capStart: false, capEnd: false });
      }
    } else if (kind === 'brake' || p.brake === 'arrow') {
      gunBlock(g, -r * 1.5, -r * 1.5, 0, r * 1.5, r * 1.5, 0.062);
      for (let i = 0; i < 3; i++) {
        const z = 0.012 + i * 0.016;
        const pg = new Geometry();
        gunBlock(pg, -r * 1.6, -r * 0.7, z, r * 1.6, r * 0.7, z + 0.008);
        mergeGeometry(g, pg.finalize(), 0, 0, 0, true);
      }
      gunTube(g, -0.001, 0.063, r * 0.62, r * 0.62, { segs: 14, capStart: false, capEnd: false });
    } else if (p.brake === 'ported') {
      for (let i = 0; i < 4; i++) {
        for (const s of [1, -1]) {
          gunBlock(g, s * r * 0.3, r * 0.55, -0.048 + i * 0.011, s * r * 0.62, r * 1.05, -0.042 + i * 0.011);
        }
      }
    }
    smoothNormals(g);
    return g.finalize();
  },

  /* A telescopic sight: objective bell, main tube, ocular bell,
     elevation and windage turrets, and a lens at each end that is
     actually a different material so it catches the light. */
  scope(p, mag) {
    const g = new Geometry();
    const tube = mag >= 8 ? 0.0150 : 0.0127;
    const obj = mag >= 8 ? 0.028 : 0.021;
    const L = mag >= 8 ? 0.360 : 0.300;
    gunTube(g, -L * 0.5, -L * 0.12, tube * 0.5, tube * 0.5, { segs: 18, capStart: false, capEnd: false });
    gunTube(g, -L * 0.12, L * 0.10, tube * 0.5, obj * 0.34, { segs: 18, capStart: false, capEnd: false });
    gunTube(g, L * 0.10, L * 0.46, obj * 0.5, obj * 0.5, { segs: 20, capStart: false, capEnd: false });
    gunTube(g, L * 0.46, L * 0.5, obj * 0.53, obj * 0.53, { segs: 20, capStart: false, capEnd: false });
    gunTube(g, -L * 0.5, -L * 0.44, obj * 0.44, obj * 0.44, { segs: 18, capStart: false, capEnd: false });
    // Turrets: elevation on top, windage on the right, both capped.
    gunTube(g, 0, 0.019, 0.0095, 0.0095, { segs: 14 });
    const tg = new Geometry();
    gunTube(tg, 0, 0.016, 0.0085, 0.0085, { segs: 14 });
    const tf = tg.finalize();
    // Rotate the windage turret onto +X by swapping axes as it is merged.
    const base = g.positions.length / 3;
    for (let i = 0; i < tf.positions.length; i += 3) {
      g.vert(tf.positions[i + 2], tf.positions[i + 1], -tf.positions[i],
        tf.normals[i + 2], tf.normals[i + 1], -tf.normals[i], 0, 0);
    }
    for (let i = 0; i < tf.indices.length; i += 3) {
      g.tri(base + tf.indices[i], base + tf.indices[i + 1], base + tf.indices[i + 2]);
    }
    // The magnification ring's knurling, at the ocular end.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const kg = new Geometry();
      gunBlock(kg, -0.0012, -0.0012, -L * 0.30, 0.0012, 0.0012, -L * 0.24);
      mergeGeometry(g, kg.finalize(), Math.cos(a) * tube * 0.54, Math.sin(a) * tube * 0.54, 0);
    }
    smoothNormals(g);
    return g.finalize();
  },

  scopeLens(p, mag) {
    const g = new Geometry();
    const obj = mag >= 8 ? 0.028 : 0.021;
    const L = mag >= 8 ? 0.360 : 0.300;
    gunTube(g, L * 0.455, L * 0.46, obj * 0.47, obj * 0.47, { segs: 20 });
    gunTube(g, -L * 0.44, -L * 0.435, obj * 0.38, obj * 0.38, { segs: 18 });
    smoothNormals(g);
    return g.finalize();
  },

  scopeRings(p) {
    const g = new Geometry();
    const r = p.receiverD * 0.5;
    for (const z of [-0.052, 0.052]) {
      gunTube(g, z - 0.008, z + 0.008, 0.0105, 0.0105, { segs: 16, bore: 0.0064, crownStart: true });
      gunBlock(g, -0.010, r * 0.5, z - 0.008, 0.010, r * 0.78 + 0.004, z + 0.008);
    }
    smoothNormals(g);
    return g.finalize();
  },

  bipod(p) {
    const g = new Geometry();
    gunBlock(g, -0.014, -0.020, -0.014, 0.014, 0.004, 0.014);
    for (const s of [1, -1]) {
      appendLimb(g, new Vec3(s * 0.010, -0.016, 0), new Vec3(s * 0.075, -0.150, -0.012), 0.0042, 0.0032, 8);
      appendLimb(g, new Vec3(s * 0.070, -0.144, -0.011), new Vec3(s * 0.082, -0.156, 0.010), 0.0055, 0.0055, 8);
    }
    smoothNormals(g);
    return g.finalize();
  },

  /* A pistol slide: the whole top half of the gun, with the ejection
     port, the serrations your fingers grip and the dovetailed sights. */
  slide(p) {
    const g = new Geometry();
    const w = p.receiverD * 0.5, L = p.receiverLen;
    /* The slide runs from behind the breech to just short of the muzzle
       — it is what covers the barrel, and a 1911's is 190 mm of the
       gun's 216. Ending it at the breech left 74 mm of bare barrel
       hanging off the front like a suppressor. */
    const back = -L * 0.33, front = p.barrelM - 0.009;
    gunBlock(g, -w, -0.006, back, w, 0.024, front);
    gunBlock(g, w - 0.0055, 0.001, back + 0.052, w + 0.0015, 0.019, back + 0.098);  // ejection port
    for (let i = 0; i < 8; i++) {
      const z = back + 0.004 + i * 0.0058;
      gunBlock(g, -w - 0.0008, 0.000, z, w + 0.0008, 0.018, z + 0.0028, 0.0004);    // serrations
    }
    gunBlock(g, -0.0016, 0.024, front - 0.010, 0.0016, 0.0305, front - 0.007);      // front sight
    gunBlock(g, -0.008, 0.024, back + 0.003, 0.008, 0.0295, back + 0.013);          // rear sight
    smoothNormals(g);
    return g.finalize();
  },

  /* A pistol frame: the dust cover under the slide, the magwell, the
     backstrap and the beavertail. A rifle receiver on a pistol gave it
     an ejection port and a Picatinny rail. */
  pistolFrame(p) {
    const g = new Geometry();
    const w = p.receiverD * 0.42, L = p.receiverLen;
    const back = -L * 0.33;
    const gz = -p.receiverLen * 0.16 - 0.020;
    gunBlock(g, -w, -0.020, back, w, -0.004, p.barrelM - 0.020);        // dust cover
    gunBlock(g, -w, -0.026, back, w, 0.004, gz + 0.030);                 // frame rear
    /* The grip frame: a 1911's is about 85 mm from the top of the frame
       to the bottom of the mainspring housing, and it rakes back about
       fifteen degrees. Drawn 112 mm deep it was half the height of the
       whole pistol. */
    gunProfile(g, [
      [-0.010, gz + 0.026], [-0.012, gz - 0.014], [-0.048, gz - 0.028],
      [-0.086, gz - 0.022], [-0.088, gz + 0.004], [-0.052, gz + 0.020],
    ], w * 0.94);
    smoothNormals(g);
    return g.finalize();
  },

  /* A revolver frame. Not a receiver: a topstrap arching over the
     cylinder, a recoil shield closing the back of it, the window the
     cylinder swings out of, and the underlug wrapping the ejector rod.
     Built out of a rifle receiver it came out as a slab with an
     ejection port and a scope rail on a .357. */
  revolverFrame(p) {
    const g = new Geometry();
    const R = p.cylinderD * 0.5, CL = p.cylinderLen;
    const cz0 = -CL - 0.004, cz1 = -0.004;
    const w = R * 0.56;
    gunBlock(g, -w, R * 0.86, cz0 - 0.004, w, R * 1.08, cz1 + 0.006);     // topstrap
    gunBlock(g, -w, -R * 1.02, cz0 - 0.018, w, R * 1.08, cz0 - 0.002);    // recoil shield
    gunBlock(g, -w, -R * 1.02, cz1, w, R * 0.5, cz1 + 0.028);             // forcing cone shroud
    gunBlock(g, -w * 0.9, -R * 1.02, cz0 - 0.002, w * 0.9, -R * 0.5, cz1 + 0.004); // bottom strap
    gunBlock(g, -w * 0.8, -R * 1.10, cz1 + 0.010, w * 0.8, -R * 0.42, p.barrelM * 0.62); // underlug
    gunBlock(g, -w, -R * 1.30, cz0 - 0.040, w, R * 0.60, cz0 - 0.002);    // grip frame
    smoothNormals(g);
    return g.finalize();
  },

  /* The pump on a slide-action shotgun: the part the player hauls
     back and forward, and the reason a 12 gauge sounds like it does. */
  pumpHandle(p) {
    const g = new Geometry();
    const r = p.barrelBreechD * 0.9;
    gunTube(g, 0, 0.115, r, r, { segs: 16, bore: r * 0.62, crownStart: true });
    for (let i = 0; i < 9; i++) {
      gunTube(g, 0.012 + i * 0.011, 0.018 + i * 0.011, r * 1.06, r * 1.06,
        { segs: 16, capStart: false, capEnd: false });
    }
    smoothNormals(g);
    return g.finalize();
  },

  /* A magazine tube under a shotgun's barrel, with the follower and
     spring inside. Loading one is pushing shells in one at a time
     against that spring, which is exactly what the game asks for. */
  magTube(p) {
    const g = new Geometry();
    gunTube(g, 0.01, 0.01 + p.rounds * 0.072, 0.0122, 0.0122, { segs: 14 });
    smoothNormals(g);
    return g.finalize();
  },
};

/* ---------------- assembly ----------------

   A gun is this list. Each entry names the part, where it seats, what
   it is made of, which axis it travels on when the action works, and
   how far out it comes when the whole thing is stripped on a bench.

   `travel` is the part's own motion under the action: a bolt runs
   back along -Z, a trigger swings on +X, a magazine drops on -Y. The
   viewmodel animates along it and the workbench explodes along
   `strip`, so neither has to hardcode a single position.

   `order` is the strip sequence. You cannot pull the bolt out before
   the safety is on, you cannot get the barrel out of the stock with
   the action screws still in, and you cannot clean the bore with the
   barrel in the stock. The gunsmith model reads this. */

function assembleGun(profileId, opts = {}) {
  const p = GUN_PROFILE[profileId];
  if (!p) throw new Error(`unknown gun profile: ${profileId}`);
  const metal = p.metal || 'blued';
  const wood = p.stockMat || 'walnut';
  const L = p.barrelM;
  const parts = [];
  const add = (o) => { parts.push(o); return o; };

  /* Where the barrel's axis sits relative to the shooter's line of
     sight. Bore axis height over the grip is why a pistol flips and a
     straight-line rifle does not, and the recoil model already uses it. */
  const boreY = 0;
  /* Everything behind the breech face, from the gun's real overall
     length, and the trigger one length-of-pull forward of the butt.
     These two numbers place the whole back half of the gun: guessing at
     them separately is how the trigger ended up two centimetres behind
     the chamber on a rifle whose butt was half a metre away. */
  const tail = p.oalM ? -(p.oalM - p.barrelM) : -p.receiverLen * 1.6;
  const trigZ = p.family === 'rifle' || p.family === 'shotgun'
    ? tail + (p.lop || 0.34)
    : -p.receiverLen * 0.16;
  /* On a handgun the frame, the grip panels and the magazine are the
     same object as far as the eye is concerned: they have to share one
     datum. Placed from three separate offsets they came out as two
     black slabs standing next to each other under the slide. */
  const gripZ = trigZ - 0.020;

  add({
    id: 'barrel', name: 'barrel', build: () => GUN_PARTS.barrel(p),
    mat: metal, at: [0, boreY, 0], order: 7,
    strip: [0, 0, 0.34], simPart: 'barrel',
    note: `${(L * 39.37).toFixed(1)} in, ${p.fluted ? 'fluted' : 'sporter'} contour`,
  });
  add({
    id: 'bore', name: 'bore', virtual: true, order: 8, simPart: 'bore',
    note: 'the rifled hole down the middle — cleaned with a rod, never disassembled',
  });
  add({
    id: 'receiver',
    name: p.family === 'revolver' ? 'frame' : p.family === 'pistol' ? 'frame' : 'receiver',
    build: () => (p.family === 'revolver' ? GUN_PARTS.revolverFrame(p)
      : p.family === 'pistol' ? GUN_PARTS.pistolFrame(p)
        : GUN_PARTS.receiver(p)),
    mat: metal, at: [0, boreY, 0], order: 9, strip: [0, 0.02, -0.12],
    note: p.family === 'revolver' ? 'topstrap, recoil shield and the window the cylinder lives in'
      : 'everything else hangs off this',
  });
  add({
    id: 'chamber', name: 'chamber', virtual: true, order: 8, simPart: 'chamber',
    note: 'the back of the barrel, where the case sits',
  });

  if (p.family === 'revolver') {
    add({
      id: 'cylinder', name: 'cylinder', build: () => GUN_PARTS.cylinder(p),
      mat: metal, at: [0, boreY, -p.cylinderLen - 0.004], order: 2, simPart: 'cylinder',
      travel: { axis: 'swing', amount: 1.2 }, strip: [-0.06, 0, 0],
      note: `${p.rounds} chambers, and it swings out to the left`,
    });
    add({
      id: 'ejectorRod', name: 'ejector rod', build: () => {
        const g = new Geometry();
        gunTube(g, 0, p.cylinderLen + 0.03, 0.0035, 0.0035, { segs: 10 });
        gunTube(g, -0.008, 0, 0.0075, 0.0075, { segs: 12 });
        smoothNormals(g); return g.finalize();
      },
      mat: metal, at: [0, boreY - p.cylinderD * 0.42, 0.004], order: 1,
      travel: { axis: 'z', amount: -0.028 }, strip: [0, -0.05, 0.05],
      note: 'push it and all six cases come out together',
    });
  } else {
    add({
      id: 'bolt', name: p.slide ? 'slide' : 'bolt',
      build: () => (p.slide ? GUN_PARTS.slide(p) : GUN_PARTS.bolt(p)),
      mat: p.slide ? metal : 'hardChrome', at: [0, boreY, 0], order: 2, simPart: 'bolt',
      travel: { axis: 'z', amount: -p.boltThrow }, strip: [0, 0, -0.22],
      note: p.slide ? 'reciprocates on the frame rails' : 'locks on two lugs at the front',
    });
    add({
      id: 'firingPin', name: 'firing pin', build: () => GUN_PARTS.firingPin(p),
      mat: 'hardChrome', at: [0, boreY, 0], order: 3, simPart: 'firingPin',
      travel: { axis: 'z', amount: 0.0022 }, strip: [0, 0.05, -0.30], rides: 'bolt',
      note: 'a worn tip is a light strike and a dead animal that walks away',
    });
    add({
      id: 'firingPinSpring', name: 'firing pin spring', build: () => GUN_PARTS.firingPinSpring(p),
      mat: 'spring', at: [0, boreY, 0], order: 4, strip: [0, 0.08, -0.30], rides: 'bolt',
      note: 'takes a set if you store it cocked for years',
    });
    add({
      id: 'extractor', name: 'extractor', build: () => GUN_PARTS.extractor(p),
      mat: 'hardChrome', at: [p.boltD * 0.5 * 0.87, boreY, 0], order: 5, simPart: 'extractor',
      strip: [0.06, 0.03, -0.24], rides: 'bolt',
      note: 'the claw that pulls the fired case back out',
    });
  }

  add({
    id: 'trigger', name: 'trigger', build: () => GUN_PARTS.trigger(),
    mat: metal, at: [0, boreY - p.receiverD * 0.62, trigZ], order: 11,
    travel: { axis: 'rx', amount: -0.30 }, strip: [0, -0.10, -0.04], simPart: 'trigger',
    note: 'breaks at three and a half pounds when it is clean',
  });
  add({
    id: 'triggerGuard', name: 'trigger guard', build: () => GUN_PARTS.triggerGuard(p),
    mat: metal, at: [0, boreY - p.receiverD * 0.5, trigZ], order: 10,
    strip: [0, -0.14, 0],
    note: 'big enough for a glove, which matters here',
  });
  if (p.hammerFired || p.family === 'revolver') {
    add({
      id: 'hammer', name: 'hammer', build: () => GUN_PARTS.hammer(p),
      mat: metal, at: [0, boreY - p.receiverD * 0.22, trigZ - 0.038], order: 12,
      travel: { axis: 'rx', amount: 1.15 }, strip: [0, 0.06, -0.16], simPart: 'hammer',
      note: 'thumb it back and it stays back',
    });
  }
  add({
    id: 'sear', name: 'sear', build: () => GUN_PARTS.sear(p),
    mat: 'hardChrome', at: [0, boreY - p.receiverD * 0.42, trigZ - 0.020], order: 13,
    travel: { axis: 'ry', amount: -0.22 }, strip: [0, -0.05, -0.20], simPart: 'sear',
    note: 'the surface the whole trigger pull is made of',
  });
  if (p.selector) {
    add({
      id: 'selector', name: 'fire selector', build: () => GUN_PARTS.selector(p),
      mat: metal,
      at: p.selector === 'akLever'
        ? [p.receiverD * 0.42, boreY + p.receiverD * 0.12, trigZ + 0.010]
        : [-p.receiverD * 0.46, boreY - p.receiverD * 0.30, trigZ + 0.004],
      order: 14, travel: { axis: p.selector === 'akLever' ? 'rx' : 'rz', amount: 1 },
      strip: [0.08, 0, 0],
      note: p.selector === 'akLever' ? 'safe, full, semi — in that order, top to bottom' : 'safe and fire, ninety degrees apart',
    });
  }

  if (p.magType === 'cylinder') {
    // nothing: the cylinder is the magazine
  } else if (p.magType === 'internal' || p.magType === 'rotary') {
    /* A blind or hinged-floorplate magazine lives inside the stock. All
       you see is the floorplate and its release; the follower and the
       spring are in there and only come out when the plate swings down,
       which is exactly what makes unloading a bolt rifle a deliberate
       act rather than a button press. */
    const magY = boreY - p.receiverD * 0.72;
    add({
      id: 'floorplate', name: 'floorplate', build: () => {
        const g = new Geometry();
        gunBlock(g, -p.receiverD * 0.30, -0.004, -0.045, p.receiverD * 0.30, 0, 0.045);
        gunBlock(g, -p.receiverD * 0.10, -0.009, -0.040, p.receiverD * 0.10, -0.003, -0.030);
        smoothNormals(g); return g.finalize();
      },
      mat: metal, at: [0, magY, trigZ + 0.060], order: 1,
      travel: { axis: 'rx', amount: -1.3 }, strip: [0, -0.10, 0.02],
      note: 'swing it down and the rounds fall into your hand',
    });
    add({
      id: 'magFollower', name: 'follower', build: () => GUN_PARTS.magFollower(p),
      mat: metal, at: [0, magY + 0.020, trigZ + 0.060], order: 2, rides: 'floorplate',
      strip: [0, -0.18, 0.06], note: 'lifts the stack to the bolt',
    });
    add({
      id: 'magazineSpring', name: 'magazine spring', build: () => GUN_PARTS.magSpring(p),
      mat: 'spring', at: [0, magY + 0.016, trigZ + 0.060], order: 3, rides: 'floorplate',
      strip: [0, -0.24, 0.10], simPart: 'magazineSpring',
      note: 'a flat W, and it is the only thing feeding the rifle',
    });
  } else if (p.magType === 'tube') {
    add({
      id: 'magTube', name: 'magazine tube', build: () => GUN_PARTS.magTube(p),
      mat: metal, at: [0, boreY - p.barrelBreechD * 0.72, 0], order: 6,
      strip: [0, -0.08, 0.22],
      note: `${p.rounds} shells, loaded one at a time through the bottom`,
    });
    add({
      id: 'magazineSpring', name: 'magazine spring', build: () => GUN_PARTS.magSpring(p),
      mat: 'spring', at: [0, boreY - p.barrelBreechD * 0.72, 0.05], order: 7,
      strip: [0, -0.14, 0.3], simPart: 'magazineSpring',
      note: 'the shells feed because of this and nothing else',
    });
  } else {
    const magY = boreY - p.receiverD * (p.magType === 'grip' ? 0.40 : 0.70);
    const magZ = p.magType === 'grip' ? gripZ : trigZ + 0.042;
    add({
      id: 'magazine', name: 'magazine', build: () => GUN_PARTS.magazine(p),
      mat: p.magType === 'curvedBox' ? 'polymer' : metal,
      at: [0, magY, magZ], order: 1,
      travel: { axis: 'y', amount: -0.22 }, strip: [0, -0.26, 0],
      note: `${p.rounds} rounds, and it drops free`,
    });
    add({
      id: 'magFollower', name: 'follower', build: () => GUN_PARTS.magFollower(p),
      mat: 'polymer', at: [0, magY, magZ], order: 2, rides: 'magazine',
      strip: [0, -0.34, 0.06],
      note: 'rides up the body and locks the bolt back when it gets there',
    });
    add({
      id: 'magazineSpring', name: 'magazine spring', build: () => GUN_PARTS.magSpring(p),
      mat: 'spring', at: [0, magY - 0.004, magZ], order: 3, rides: 'magazine',
      strip: [0, -0.40, 0.10], simPart: 'magazineSpring',
      note: 'leave it loaded for a decade and it will not lift the last round',
    });
  }

  if (p.gasTube || p.gasPiston) {
    add({
      id: 'gasSystem', name: 'gas system', build: () => GUN_PARTS.gasSystem(p),
      mat: metal, at: [0, boreY + p.barrelMuzzleD * 0.55, 0], order: 6, simPart: 'gasSystem',
      strip: [0, 0.14, 0.10],
      note: p.gasPiston ? 'a piston, and it does not put carbon in the receiver'
        : 'direct impingement: the gas goes into the action, and so does the carbon',
    });
  }
  if (p.pump) {
    add({
      id: 'pumpHandle', name: 'forend', build: () => GUN_PARTS.pumpHandle(p),
      mat: wood, at: [0, boreY - p.barrelBreechD * 0.25, 0.09], order: 5,
      travel: { axis: 'z', amount: -0.098 }, strip: [0, 0, 0.30],
      note: 'the whole action hangs off this',
    });
  } else if (p.family !== 'pistol' && p.family !== 'revolver' && p.stock !== 'sporter') {
    /* A sporter stock is one piece of wood from the butt to the forend
       tip, so it already IS the handguard. Giving it a second one bolted
       an aluminium tube over the middle of the rifle. */
    add({
      id: 'handguard', name: p.gasTube || p.railed ? 'handguard' : 'forend',
      build: () => GUN_PARTS.handguard(p),
      mat: p.gasTube || p.railed ? metal : wood, at: [0, boreY, 0], order: 6,
      strip: [0, -0.02, 0.26],
      note: 'without it the barrel is too hot to hold after a magazine',
    });
  }

  if (p.family === 'pistol' || p.family === 'revolver') {
    add({
      id: 'grip', name: 'grip', build: () => GUN_PARTS.grip(p),
      /* The panels are drawn on the frame's own datum, in gun space, so
         they seat at the origin. Placed at a grip offset as well, the
         offset went in twice and they floated off behind the pistol. */
      mat: wood, at: [0, boreY, 0], order: 15,
      strip: [0, -0.14, -0.12], simPart: 'stock',
      note: 'checkered, because a wet smooth grip turns in the hand',
    });
  } else {
    add({
      id: 'stock', name: 'stock', build: () => GUN_PARTS.stock(p),
      mat: p.stock === 'tube' || p.stock === 'chassis' ? 'polymer' : wood,
      at: [0, boreY, 0], order: 15, simPart: 'stock',
      strip: [0, 0, -0.34],
      note: `${((p.lop || 0.34) * 39.37).toFixed(1)} in length of pull`,
    });
    if (p.stock === 'sporter' || p.stock === 'chassis') {
      add({
        id: 'recoilPad', name: 'recoil pad',
        build: () => {
          const g = new Geometry();
          const butt = -(p.oalM - p.barrelM);
          const lo = p.stock === 'sporter' ? -0.088 : -0.034;
          gunBlock(g, -0.0245, lo, butt - 0.016, 0.0245, -0.026, butt + 0.002, 0.004);
          smoothNormals(g); return g.finalize();
        },
        mat: 'rubber', at: [0, boreY, 0], order: 16,
        strip: [0, 0, -0.44],
        note: 'ventilated rubber, and the difference between fifty rounds and five',
      });
    }
    if (p.stock === 'tube' || p.gasTube) {
      add({
        id: 'grip', name: 'pistol grip', build: () => GUN_PARTS.grip(p),
        mat: 'polymer', at: [0, boreY - p.receiverD * 0.42, trigZ - 0.030], order: 14,
        strip: [0, -0.18, -0.10],
        note: 'holds the trigger hand square behind the bore',
      });
    }
  }

  if (p.family !== 'pistol') {
    // A pistol's sights are dovetailed into its slide and drawn with it.
    add({
      id: 'frontSight', name: 'front sight', build: () => GUN_PARTS.frontSight(p),
      mat: metal, at: [0, boreY, L - (p.family === 'revolver' ? 0.014 : 0.055)], order: 8,
      strip: [0, 0.10, 0.30],
      note: 'a hooded post, which is what you actually aim with',
    });
    add({
      id: 'rearSight', name: 'rear sight', build: () => GUN_PARTS.rearSight(p),
      mat: metal,
      at: [0, boreY, p.family === 'revolver' ? -p.cylinderLen - 0.020 : -p.receiverLen * 0.44],
      order: 8, strip: [0, 0.12, -0.14],
      note: 'the notch, and the elevation ladder behind it',
    });
  }

  // Things that are fitted rather than built in. They are returned with
  // the rest so the workbench can show a mounted optic coming off, but
  // they are only present when the firearm actually carries them.
  const fitted = opts.attachments || {};
  if (fitted.rail && fitted.rail.magnification > 1) {
    const mag = fitted.rail.magnification;
    add({
      id: 'scopeRings', name: 'scope rings', build: () => GUN_PARTS.scopeRings(p),
      mat: metal, at: [0, boreY, -p.receiverLen * 0.14], order: 0, strip: [0, 0.14, 0],
      note: 'lap them properly or the tube gets crushed and the zero wanders',
    });
    add({
      id: 'scope', name: `${mag}x scope`, build: () => GUN_PARTS.scope(p, mag),
      mat: 'blued', at: [0, boreY + p.receiverD * 0.5 + 0.020, -p.receiverLen * 0.14],
      order: 0, strip: [0, 0.24, 0],
      note: `${mag} power, and at that magnification every heartbeat is visible`,
    });
    add({
      id: 'scopeLens', name: 'lenses', build: () => GUN_PARTS.scopeLens(p, mag),
      mat: 'glass', at: [0, boreY + p.receiverD * 0.5 + 0.020, -p.receiverLen * 0.14],
      order: 0, rides: 'scope', strip: [0, 0.30, 0],
      note: 'coated, and they fog the moment you breathe on them',
    });
  }
  if (fitted.thread) {
    const can = /suppress/i.test(fitted.thread.id || '') ? 'suppressor' : 'brake';
    add({
      id: 'muzzleDevice', name: fitted.thread.name || can, build: () => GUN_PARTS.muzzleDevice(p, can),
      mat: can === 'suppressor' ? 'parked' : metal, at: [0, boreY, L], order: 0,
      strip: [0, 0, 0.42],
      note: can === 'suppressor' ? 'quiet, and it fouls the gun half again as fast'
        : 'takes half the recoil and gives it to everyone standing near you',
    });
  } else if (p.brake) {
    add({
      id: 'muzzleDevice', name: 'muzzle brake', build: () => GUN_PARTS.muzzleDevice(p, 'brake'),
      mat: metal, at: [0, boreY, p.family === 'revolver' ? 0 : L], order: 0, strip: [0, 0, 0.42],
      note: 'ported, and it is why this thing is bearable at all',
    });
  }
  if (fitted.rail && fitted.rail.id === 'bipod') {
    add({
      id: 'bipod', name: 'bipod', build: () => GUN_PARTS.bipod(p),
      mat: 'parked', at: [0, boreY - p.barrelBreechD * 0.6, L * 0.55], order: 0,
      strip: [0, -0.22, 0.20],
      note: 'worth half a minute of angle, prone and only prone',
    });
  }

  return { profile: p, profileId, parts };
}

/* The strip sequence: the parts in the order they actually come off,
   which is the order the workbench enforces. Attachments first,
   because you cannot get a bolt past a scope, then the action, then
   the furniture. */
function stripSequence(assembly) {
  return assembly.parts
    .filter((x) => !x.virtual && !x.rides)
    .slice()
    .sort((a, b) => a.order - b.order);
}
