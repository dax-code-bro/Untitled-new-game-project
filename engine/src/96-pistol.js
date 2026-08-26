/* ============================================================
   M1911 — a dimensioned model of the Colt Government pistol.

   Every measurement below is the real one, in metres, taken from
   the M1911A1 spec:

     overall length   8.50 in   0.2159      slide width   0.900 in  0.02286
     overall height   5.50 in   0.1397      slide height  0.870 in  0.02210
     barrel           5.03 in   0.12776     grip width    1.280 in  0.03251
     slide length     7.94 in   0.20168     sight radius  6.481 in  0.16463

   The datum is the bore axis: Y = 0 is the centre of the barrel,
   X runs from the rear of the gun to the muzzle, and +Z is the
   pistol's right-hand side. Everything else is measured off that,
   the way the gun itself is.

   Construction is by swept profile. A pistol is almost entirely
   prismatic — the slide is one cross-section dragged 8 inches, the
   grip is a stack of cross-sections along a raked axis — so a
   general "closed 2D outline swept along a path" primitive builds
   nearly the whole thing, and gives exact control over where an
   edge is sharp and where it is a radius. That distinction is most
   of what makes machined steel read as machined steel.
   ============================================================ */

/* Colt Government, in metres. */
const M1911 = {
  length: 0.21590,
  height: 0.13970,
  slideW: 0.02286,
  slideH: 0.02210,
  slideLen: 0.20168,
  barrelLen: 0.12776,
  gripW: 0.03251,
  boreToSlideTop: 0.01016,   // 0.400 in
  barrelOD: 0.01460,
  bore: 0.01143,             // .45 ACP
};

/* Derived landmarks, so nothing downstream repeats an arithmetic. */
const P11 = (() => {
  const muzzle = M1911.length;
  const slideTop = M1911.boreToSlideTop;
  return {
    muzzle,
    slideFront: muzzle,
    slideRear: muzzle - M1911.slideLen,          // 0.01422
    slideTop,
    slideBottom: slideTop - M1911.slideH,        // -0.01194
    slideHalfW: M1911.slideW / 2,
    bottom: slideTop - M1911.height,             // -0.12954
    barrelRear: muzzle - M1911.barrelLen,        // 0.08814
  };
})();

/* ---------------- swept-profile primitive ---------------- */

/* Turn a closed outline into sweep points carrying outward normals,
   splitting a vertex in two wherever the outline turns harder than
   `smoothDeg`. That split is the whole point: sharing one averaged
   normal across a 90-degree corner is what makes a machined part look
   like it was carved from soap. */
function profileOutline(raw, smoothDeg = 32) {
  const n = raw.length;
  const cos = Math.cos(smoothDeg * PI / 180);
  const edge = [];
  for (let i = 0; i < n; i++) {
    const p = raw[i], q = raw[(i + 1) % n];
    let da = q[0] - p[0], db = q[1] - p[1];
    const L = Math.hypot(da, db) || 1;
    da /= L; db /= L;
    // Outward normal of a counter-clockwise outline: tangent turned -90.
    edge.push([db, -da]);
  }
  // Always two vertices per corner — one carrying each adjoining edge's
  // normal — even where the corner is smooth and both end up identical.
  // Emitting a variable number would be tidier, but then two stations of
  // the same outline can disagree on their vertex count the moment one of
  // them tapers past the smoothing threshold, and a swept surface cannot
  // stitch rows of different lengths.
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = edge[(i - 1 + n) % n], next = edge[i];
    const p = raw[i];
    if (prev[0] * next[0] + prev[1] * next[1] >= cos) {
      let na = prev[0] + next[0], nb = prev[1] + next[1];
      const L = Math.hypot(na, nb) || 1;
      na /= L; nb /= L;
      out.push([p[0], p[1], na, nb], [p[0], p[1], na, nb]);
    } else {
      out.push([p[0], p[1], prev[0], prev[1]], [p[0], p[1], next[0], next[1]]);
    }
  }
  return out;
}

/* Sweep a closed outline along a series of stations.

   Each station is { o, u, v, pts } — an origin and two in-plane basis
   vectors, with `pts` in (u, v) coordinates. u x v must point along the
   sweep, and the outline must run counter-clockwise in (u, v).

   Every station needs the same point count, so a feature that appears
   part-way along — an ejection port, a step in a dust cover — is made by
   moving points rather than adding them, and a sharp start or end to that
   feature is made by repeating a station at the same position. */
function sweepPath(g, stations, capStart = true, capEnd = true) {
  const ns = stations.length;
  if (ns < 2) return;
  const n = stations[0].pts.length;
  const base = g.positions.length / 3;

  const world = stations.map((st) => st.pts.map(([a, b]) => new Vec3(
    st.o.x + st.u.x * a + st.v.x * b,
    st.o.y + st.u.y * a + st.v.y * b,
    st.o.z + st.u.z * a + st.v.z * b,
  )));

  const t = new Vec3(), ax = new Vec3(), nrm = new Vec3(), fallback = new Vec3();
  for (let i = 0; i < ns; i++) {
    const st = stations[i];
    const prev = world[Math.max(0, i - 1)], next = world[Math.min(ns - 1, i + 1)];
    fallback.crossVectors(st.u, st.v).normalize();
    for (let k = 0; k < n; k++) {
      const pt = st.pts[k];
      const na = pt[2], nb = pt[3];
      // In-plane tangent: the stored 2D normal turned +90.
      t.set(st.u.x * -nb + st.v.x * na, st.u.y * -nb + st.v.y * na, st.u.z * -nb + st.v.z * na);
      ax.subVectors(next[k], prev[k]);
      if (ax.lengthSq() < 1e-12) ax.copy(fallback);
      nrm.crossVectors(t, ax);
      if (nrm.lengthSq() < 1e-14) nrm.set(st.u.x * na + st.v.x * nb, st.u.y * na + st.v.y * nb, st.u.z * na + st.v.z * nb);
      nrm.normalize();
      const w = world[i][k];
      g.vert(w.x, w.y, w.z, nrm.x, nrm.y, nrm.z, k / n, i / (ns - 1));
    }
  }

  for (let i = 0; i < ns - 1; i++) {
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      const a = base + i * n + k, b = base + i * n + k2;
      const c = base + (i + 1) * n + k2, d = base + (i + 1) * n + k;
      g.quad(a, b, c, d);
    }
  }

  const cap = (idx, dir) => {
    const st = stations[idx];
    const nx = new Vec3().crossVectors(st.u, st.v).normalize().scale(dir);
    let ca = 0, cb = 0;
    for (const p of st.pts) { ca += p[0]; cb += p[1]; }
    ca /= n; cb /= n;
    let lo0 = Infinity, lo1 = Infinity;
    for (const q of st.pts) {
      if (q[0] < lo0) lo0 = q[0];
      if (q[1] < lo1) lo1 = q[1];
    }
    // The centre vertex must sit on the same linear UV map as the rim.
    // Give it (0.5, 0.5) instead and every triangle in the fan gets its own
    // UV gradient, so the tangent frame rotates around the centre and the
    // normal map paints concentric rings onto a dead-flat face.
    const centre = g.vert(
      st.o.x + st.u.x * ca + st.v.x * cb,
      st.o.y + st.u.y * ca + st.v.y * cb,
      st.o.z + st.u.z * ca + st.v.z * cb,
      nx.x, nx.y, nx.z, (ca - lo0) * 5, (cb - lo1) * 5,
    );
    // The rim needs its own vertices: the swept ones carry side normals.
    // UVs are normalised across the outline's own extent. Feeding the raw
    // profile coordinates straight through instead leaves the cap textured
    // at metres-per-unit while the swept surface is at zero-to-one, and the
    // normal map samples so densely that a flat end face comes out ringed
    // like a tree stump.
    const rim = [];
    for (let k = 0; k < n; k++) {
      const w = world[idx][k];
      // Metres, scaled to roughly match the swept surface's own density, so
      // an end cap is not textured at a wildly different grain to the flank
      // it belongs to.
      rim.push(g.vert(w.x, w.y, w.z, nx.x, nx.y, nx.z,
        (st.pts[k][0] - lo0) * 5, (st.pts[k][1] - lo1) * 5));
    }
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      if (dir > 0) g.tri(centre, rim[k], rim[k2]);
      else g.tri(centre, rim[k2], rim[k]);
    }
  };
  if (capStart) cap(0, -1);
  if (capEnd) cap(ns - 1, 1);
}

/* A box with hard edges everywhere, given a centre and half-extents. */
function hardBox(g, cx, cy, cz, hx, hy, hz) {
  const faces = [
    [1, 0, 0, hx], [-1, 0, 0, hx], [0, 1, 0, hy],
    [0, -1, 0, hy], [0, 0, 1, hz], [0, 0, -1, hz],
  ];
  for (const [nx, ny, nz] of faces) {
    // Two in-face axes, picked so the winding comes out front-facing.
    const up = Math.abs(ny) > 0.5 ? [0, 0, 1] : [0, 1, 0];
    const ux = up[1] * nz - up[2] * ny, uy = up[2] * nx - up[0] * nz, uz = up[0] * ny - up[1] * nx;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const ox = cx + nx * hx, oy = cy + ny * hy, oz = cz + nz * hz;
    const su = Math.abs(ux) * hx + Math.abs(uy) * hy + Math.abs(uz) * hz;
    const sv = Math.abs(vx) * hx + Math.abs(vy) * hy + Math.abs(vz) * hz;
    const base = g.positions.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.vert(ox + ux * su * a + vx * sv * b, oy + uy * su * a + vy * sv * b,
             oz + uz * su * a + vz * sv * b, nx, ny, nz, (a + 1) / 2, (b + 1) / 2);
    }
    g.quad(base, base + 1, base + 2, base + 3);
  }
}

/* ---------------- slide ---------------- */

/* The slide's cross-section. A flat bottom, vertical side flats, and a
   crown that is a true half-round: on a Government slide the top radius
   is tangent to the sides, which means it equals half the width and eats
   about half the slide's height. Getting that radius wrong — flattening
   the top, or rounding the whole thing — is the single most recognisable
   error you can make on a 1911.

   `inset` pulls the side flats in, which is how the cocking serrations
   are cut. `port` opens the ejection window in the top-right. */
const SLIDE_ARC = 20;
function slideOutline(topY, bottomY, halfW, inset, port) {
  const flatTop = topY - halfW;               // where the crown meets the flats
  const floorY = 0.0022;                      // ejection port floor
  const cutZ = 0.0050;                        // inner wall of the window
  const side = (b) => {
    // Serrations only cut the flats, easing off as the crown takes over.
    const w = halfW - inset * (1 - smoothstep(0.55, 1.0, Math.abs(b) / halfW) * 0);
    return b < 0 ? -w : w;
  };
  const raw = [
    [bottomY, 0],
    [bottomY, side(-1)],
    [flatTop, side(-1)],
  ];
  const arc = [];
  for (let j = 1; j <= SLIDE_ARC; j++) {
    const phi = -PI / 2 + PI * (j / SLIDE_ARC);
    let b = halfW * Math.sin(phi);
    let a = flatTop + halfW * Math.cos(phi);
    // Blend the serration inset out as the crown rises.
    const t = smoothstep(halfW * 0.62, halfW * 0.98, Math.abs(b));
    b -= Math.sign(b) * inset * t;
    arc.push([a, b]);
  }
  raw.push(...arc, [bottomY, side(1)]);

  if (port > 0) {
    // Everything outboard of the window's inner wall folds down: first
    // vertically, tracing the cut face, then out along the window floor.
    const idx = [];
    for (let i = 0; i < raw.length; i++) if (raw[i][1] > cutZ) idx.push(i);
    // The bottom corner of the right flat must stay put.
    while (idx.length && raw[idx[idx.length - 1]][0] <= bottomY + 1e-6) idx.pop();
    const m = idx.length;
    for (let q = 0; q < m; q++) {
      const i = idx[q];
      const t = m === 1 ? 1 : q / (m - 1);
      const from = raw[i];
      let a, b;
      if (t <= 0.5) { b = cutZ; a = lerp(from[0], floorY, t * 2); }
      else { a = floorY; b = lerp(cutZ, halfW - inset, (t - 0.5) * 2); }
      raw[i] = [lerp(from[0], a, port), lerp(from[1], b, port)];
    }
  }
  return profileOutline(raw, 30);
}

function buildSlide(g) {
  const { slideRear, slideFront, slideTop, slideBottom, slideHalfW } = P11;
  const U = new Vec3(0, 1, 0), V = new Vec3(0, 0, 1);
  const st = (x, opts = {}) => ({
    o: new Vec3(x, 0, 0), u: U, v: V,
    pts: slideOutline(
      opts.top != null ? opts.top : slideTop,
      opts.bottom != null ? opts.bottom : slideBottom,
      slideHalfW, opts.inset || 0, opts.port || 0),
  });

  const stations = [];
  // Rear face, then the cocking serrations: sixteen vertical grooves, which
  // is what an A1 carries. They are the only texture on the slide, so they
  // are cut as geometry rather than faked in a normal map.
  const serrFront = slideRear + 0.0395;
  stations.push(st(slideRear));
  const GROOVES = 16;
  for (let i = 0; i < GROOVES; i++) {
    const x0 = slideRear + 0.0035 + (serrFront - slideRear - 0.0035) * (i / GROOVES);
    const w = (serrFront - slideRear - 0.0035) / GROOVES;
    stations.push(st(x0, { inset: 0 }));
    stations.push(st(x0 + w * 0.5, { inset: 0.00055 }));
  }
  stations.push(st(serrFront));

  // Plain flank up to the ejection port, then the window itself. The port
  // opens and closes with a repeated station so its walls are square.
  const portRear = 0.0985, portFront = 0.1355;
  stations.push(st(portRear - 0.0012));
  stations.push(st(portRear, { port: 1 }));
  stations.push(st(portRear + 0.004, { port: 1 }));
  stations.push(st(portFront - 0.004, { port: 1 }));
  stations.push(st(portFront, { port: 1 }));
  stations.push(st(portFront + 0.0012));

  // Forward of the port the slide runs plain to the muzzle, dropping its
  // underside to wrap the recoil spring plug over the last inch.
  stations.push(st(0.1900));
  stations.push(st(0.1990, { bottom: slideBottom - 0.0022 }));
  stations.push(st(slideFront, { bottom: slideBottom - 0.0022 }));
  // No end cap at the muzzle: it is built as a ring below, because a solid
  // disc across the front is what was hiding the bore. The bore is a recess,
  // so anything covering the muzzle plane covers the hole as well, no matter
  // how far the bushing in front of it is pushed.
  sweepPath(g, stations, true, false);

  /* The muzzle face: an annulus from the slide's outline in to the barrel
     bushing's outside diameter, leaving the middle open for the bushing,
     the crown and the bore to fill. Outline and ring are stitched by angle
     about the bore, so the quads fan out evenly instead of shearing. */
  const face = slideOutline(slideTop, slideBottom - 0.0022, slideHalfW, 0, 0);
  const RB = 0.00875;
  const X = P11.muzzle;
  const base = g.positions.length / 3;
  for (const q of face) g.vert(X, q[0], q[1], 1, 0, 0, q[0] * 5, q[1] * 5);
  for (const q of face) {
    const th = Math.atan2(q[1], q[0]);
    const y = RB * Math.cos(th), z = RB * Math.sin(th);
    g.vert(X, y, z, 1, 0, 0, y * 5, z * 5);
  }
  const nf = face.length;
  for (let i = 0; i < nf; i++) {
    const j = (i + 1) % nf;
    g.quad(base + nf + i, base + i, base + j, base + nf + j);
  }
}

/* ---------------- barrel ---------------- */

function ringOutline(r, n, cy = 0, cz = 0) {
  const raw = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    raw.push([cy + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return profileOutline(raw, 40);
}

function buildBarrel(g) {
  const U = new Vec3(0, 1, 0), V = new Vec3(0, 0, 1);
  const R = M1911.barrelOD / 2;
  const st = (x, r) => ({ o: new Vec3(x, 0, 0), u: U, v: V, pts: ringOutline(r, 24) });
  // Chamber end is fatter than the muzzle end — the hood and the locking
  // lugs live back there, and it is visible through the ejection port.
  sweepPath(g, [
    st(P11.barrelRear, R * 1.12),
    st(P11.barrelRear + 0.030, R * 1.12),
    st(P11.barrelRear + 0.038, R),
    st(P11.muzzle - 0.0005, R),
  ], true, false);

  /* Bushing, crown and bore all live in the plane of the slide's front
     face. Left truly coplanar they z-fight into a smeared medallion, so
     each sits a few tenths of a millimetre proud of the one behind it —
     invisible at any real scale, and it makes the muzzle read as a bore in
     a bushing in a slide instead of as an embossed disc. */
  const F = P11.muzzle + 0.00020;
  sweepPath(g, [
    st(P11.muzzle - 0.0125, 0.00875),
    st(F, 0.00875),
  ], false, false);
  // Its front face, as an annulus so the barrel is not capped over.
  const nOut = ringOutline(0.00875, 24), nIn = ringOutline(R, 24);
  const base = g.positions.length / 3;
  for (const p of nOut) g.vert(F, p[0], p[1], 1, 0, 0, 0, 0);
  for (const p of nIn) g.vert(F, p[0], p[1], 1, 0, 0, 1, 1);
  const n = nOut.length;
  for (let i = 0; i < n; i++) g.quad(base + i, base + n + i, base + n + (i + 1) % n, base + (i + 1) % n);

  // Crown: the flat between bore and barrel OD.
  const b3 = g.positions.length / 3;
  const crownIn = ringOutline(M1911.bore / 2, 20), crownOut = ringOutline(R, 20);
  for (const p of crownIn) g.vert(F + 0.00012, p[0], p[1], 1, 0, 0, 0, 0);
  for (const p of crownOut) g.vert(F + 0.00012, p[0], p[1], 1, 0, 0, 1, 1);
  // Ring length, not the segment count: profileOutline emits two vertices
  // per corner, so these arrays are twice as long as they were asked for.
  const cn = crownIn.length;
  for (let i = 0; i < cn; i++) {
    const j = (i + 1) % cn;
    g.quad(b3 + i, b3 + cn + i, b3 + cn + j, b3 + j);
  }

  // Recoil spring plug, below the barrel at the muzzle.
  sweepPath(g, [
    { o: new Vec3(P11.muzzle - 0.010, 0, 0), u: U, v: V, pts: ringOutline(0.00475, 18, -0.0091, 0) },
    { o: new Vec3(F, 0, 0), u: U, v: V, pts: ringOutline(0.00475, 18, -0.0091, 0) },
  ], false, true);
}

/* The bore. Its walls face inward so it is a hole with depth rather than a
   painted disc, and it is built into the dark part rather than the steel:
   a bore is the one place on a stainless gun that is genuinely black, and
   a polished-steel tube lit by ambient reads as a chrome pipe instead. */
function buildBore(g) {
  const br = M1911.bore / 2;
  const front = P11.muzzle + 0.00030;
  const depth = 0.030;
  const rim = ringOutline(br, 20);
  const base = g.positions.length / 3;
  // The outline's 2D normal is in (y, z), and the bore runs along x — so the
  // inward normal is (0, -ny, -nz). Writing it into (x, y) instead lights the
  // hole as if it were facing down the barrel and it stops reading as a hole.
  for (const p of rim) g.vert(front, p[0], p[1], 0, -p[2], -p[3], p[0] * 5, p[1] * 5);
  for (const p of rim) g.vert(front - depth, p[0], p[1], 0, -p[2], -p[3], p[0] * 5, p[1] * 5);
  const m = rim.length;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    g.quad(base + i, base + j, base + m + j, base + m + i);
  }
  /* Cap the far end, or you see straight through the gun to the sky. The
     cap needs its own rim vertices: sharing the tube's leaves it shaded with
     radial normals, so it lights at grazing incidence, blows out to white
     specular, and the hole stops being a hole. */
  const cb = g.positions.length / 3;
  const c = g.vert(front - depth, 0, 0, 1, 0, 0, 0, 0);
  for (const p of rim) g.vert(front - depth, p[0], p[1], 1, 0, 0, p[0] * 5, p[1] * 5);
  for (let i = 0; i < m; i++) g.tri(c, cb + 1 + i, cb + 1 + (i + 1) % m);
}

/* ---------------- frame ---------------- */

/* The grip's rake. A 1911's grip sits at 74 degrees to the bore, and that
   angle is half the gun's silhouette — stand it upright and it stops being
   a 1911 immediately. */
const RAKE = 16 * PI / 180;
const GRIP_U = new Vec3(Math.cos(RAKE), -Math.sin(RAKE), 0);   // toward the front strap
const GRIP_V = new Vec3(0, 0, 1);
const GRIP_DOWN = new Vec3(-Math.sin(RAKE), -Math.cos(RAKE), 0);
const GRIP_TOP = new Vec3(0.0280, -0.0215, 0);
const GRIP_LEN = 0.1124;

/* Rounded rectangle with independent front and back depths — the front
   strap is a tighter radius than the arched mainspring housing behind it. */
function roundRect(hf, hb, hw, e, n) {
  const raw = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    const c = Math.cos(th), s = Math.sin(th);
    const depth = c >= 0 ? hf : hb;
    raw.push([
      Math.sign(c) * Math.pow(Math.abs(c), 2 / e) * depth,
      Math.sign(s) * Math.pow(Math.abs(s), 2 / e) * hw,
    ]);
  }
  return profileOutline(raw, 40);
}

function gripStation(t, hf, hb, hw, e) {
  const d = GRIP_LEN * t;
  return {
    o: new Vec3(GRIP_TOP.x + GRIP_DOWN.x * d, GRIP_TOP.y + GRIP_DOWN.y * d, 0),
    u: GRIP_U, v: GRIP_V, pts: roundRect(hf, hb, hw, e, 28),
  };
}

function buildFrame(g) {
  const U = new Vec3(0, 1, 0), V = new Vec3(0, 0, 1);
  // Overlap the slide rather than meeting it. Two coplanar faces at exactly
  // the same depth z-fight, and along an 8-inch slide that reads as a band
  // of flicker down the whole gun.
  const top = P11.slideBottom + 0.0022;

  /* Dust cover — the rail housing under the slide, running most of the way
     to the muzzle and stopping short of it, which is what leaves the barrel
     bushing standing alone at the front. */
  const dust = (x, bottom, hw) => ({
    o: new Vec3(x, 0, 0), u: U, v: V,
    pts: profileOutline([
      [top, -hw], [bottom + 0.0016, -hw], [bottom, -hw + 0.0016],
      [bottom, hw - 0.0016], [bottom + 0.0016, hw], [top, hw],
    ].reverse(), 30),
  });
  sweepPath(g, [
    dust(0.0300, -0.0300, 0.0112),
    dust(0.0620, -0.0300, 0.0112),
    dust(0.0740, -0.0232, 0.0110),
    dust(0.1000, -0.0222, 0.0110),
    dust(0.1900, -0.0208, 0.0110),
    dust(0.1975, -0.0208, 0.0110),
  ], true, true);

  /* Trigger guard. Swept as a loop of flattened oval section, the way it is
     actually forged — a guard made of boxes reads as a toy instantly. */
  const guardPath = [
    [0.0468, -0.0205], [0.0472, -0.0300], [0.0490, -0.0392], [0.0538, -0.0462],
    [0.0616, -0.0496], [0.0700, -0.0489], [0.0760, -0.0440], [0.0788, -0.0356],
    [0.0790, -0.0270], [0.0782, -0.0205],
  ];
  // Subdivide: ten stations round a trigger guard leaves visible facets,
  // and a faceted guard is the first thing that reads as "modelled".
  const fine = [];
  for (let i = 0; i < guardPath.length - 1; i++) {
    const a = guardPath[Math.max(0, i - 1)], b = guardPath[i];
    const c = guardPath[i + 1], d = guardPath[Math.min(guardPath.length - 1, i + 2)];
    for (let k = 0; k < 4; k++) {
      const t = k / 4, t2 = t * t, t3 = t2 * t;
      fine.push([0, 1].map((j) => 0.5 * (
        2 * b[j] + (c[j] - a[j]) * t +
        (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 +
        (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t3)));
    }
  }
  fine.push(guardPath[guardPath.length - 1]);
  const guard = fine.map(([x, y], i) => {
    const p = fine[Math.max(0, i - 1)], q = fine[Math.min(fine.length - 1, i + 1)];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const L = Math.hypot(dx, dy) || 1;
    // Section axes: across the guard's own width (Z) and through its depth.
    return {
      o: new Vec3(x, y, 0),
      u: new Vec3(-dy / L, dx / L, 0), v: GRIP_V,
      pts: roundRect(0.0026, 0.0026, 0.0050, 2.5, 16),
    };
  });
  sweepPath(g, guard, true, true);

  /* Grip frame. Front strap forward, arched mainspring housing behind,
     flaring very slightly at the butt. */
  sweepPath(g, [
    gripStation(-0.02, 0.0206, 0.0300, 0.0113, 2.9),
    gripStation(0.04, 0.0204, 0.0288, 0.0113, 2.9),
    gripStation(0.22, 0.0200, 0.0272, 0.0113, 2.8),
    gripStation(0.50, 0.0194, 0.0262, 0.0113, 2.8),
    gripStation(0.78, 0.0190, 0.0254, 0.0114, 2.8),
    gripStation(0.94, 0.0192, 0.0252, 0.0116, 2.7),
    gripStation(1.00, 0.0196, 0.0256, 0.0119, 2.6),
  ], true, true);

  // Magazine floorplate, proud of the butt on all sides.
  sweepPath(g, [
    gripStation(1.00, 0.0196, 0.0256, 0.0119, 2.6),
    gripStation(1.008, 0.0206, 0.0266, 0.0126, 2.4),
    gripStation(1.030, 0.0206, 0.0266, 0.0126, 2.4),
  ], false, true);

  /* Grip safety tang — the beavertail the web of the hand sits under. */
  sweepPath(g, [
    { o: new Vec3(0.0180, -0.0140, 0), u: U, v: V, pts: roundRect(0.0088, 0.0088, 0.0092, 2.6, 16) },
    { o: new Vec3(0.0105, -0.0112, 0), u: U, v: V, pts: roundRect(0.0074, 0.0074, 0.0090, 2.6, 16) },
    { o: new Vec3(0.0052, -0.0074, 0), u: U, v: V, pts: roundRect(0.0050, 0.0050, 0.0082, 2.5, 16) },
    { o: new Vec3(0.0028, -0.0038, 0), u: U, v: V, pts: roundRect(0.0032, 0.0032, 0.0072, 2.4, 16) },
  ], true, true);

  /* Hammer: a flat plate with a spur, swept through its own thickness.
     A 1911 hammer is 4 mm of plate, not a tapering horn, and the spur's
     hook is the shape everyone recognises from behind the sights. */
  const hammerOutline = profileOutline([
    [0.01780, -0.00900], [0.01830, -0.00200], [0.01700, 0.00330], [0.01340, 0.00780],
    [0.00860, 0.01040], [0.00380, 0.01090], [0.00170, 0.00930], [0.00320, 0.00640],
    [0.00790, 0.00480], [0.01110, 0.00190], [0.01260, -0.00340], [0.01210, -0.00900],
  ], 26);
  sweepPath(g, [
    { o: new Vec3(0, 0, -0.0021), u: new Vec3(1, 0, 0), v: U, pts: hammerOutline },
    { o: new Vec3(0, 0, 0.0021), u: new Vec3(1, 0, 0), v: U, pts: hammerOutline },
  ], true, true);

  /* Trigger, sitting in the guard. */
  hardBox(g, 0.0532, -0.0300, 0, 0.0022, 0.0086, 0.0044);

  /* Thumb safety and slide stop — small, but their absence is loud. */
  sweepPath(g, [
    { o: new Vec3(0.0250, -0.0104, -0.0110), u: U, v: new Vec3(1, 0, 0), pts: roundRect(0.0042, 0.0042, 0.0026, 2.6, 14) },
    { o: new Vec3(0.0250, -0.0104, -0.0135), u: U, v: new Vec3(1, 0, 0), pts: roundRect(0.0042, 0.0042, 0.0026, 2.6, 14) },
  ], false, true);
  hardBox(g, 0.0335, -0.0088, -0.0126, 0.0090, 0.0022, 0.0011);
  sweepPath(g, [
    { o: new Vec3(0.0688, -0.0166, -0.0110), u: U, v: new Vec3(1, 0, 0), pts: ringOutline(0.0038, 14) },
    { o: new Vec3(0.0688, -0.0166, -0.0128), u: U, v: new Vec3(1, 0, 0), pts: ringOutline(0.0038, 14) },
  ], false, true);
  hardBox(g, 0.0600, -0.0166, -0.0118, 0.0092, 0.0020, 0.0009);

  /* Magazine release button. */
  sweepPath(g, [
    { o: new Vec3(0.0475, -0.0268, -0.0110), u: U, v: new Vec3(1, 0, 0), pts: ringOutline(0.0034, 14) },
    { o: new Vec3(0.0475, -0.0268, -0.0126), u: U, v: new Vec3(1, 0, 0), pts: ringOutline(0.0034, 14) },
  ], false, true);
}

/* ---------------- sights ---------------- */

function buildSights(g) {
  const top = P11.slideTop;
  // Front blade, 0.60 in back from the muzzle on a Government slide.
  hardBox(g, P11.muzzle - 0.0152, top + 0.0021, 0, 0.0018, 0.0021, 0.0009);
  // Rear leaf, with the notch cut by building it as two posts and a base.
  const rx = P11.slideRear + 0.0062;
  hardBox(g, rx, top + 0.0008, 0, 0.0026, 0.0008, 0.0072);
  hardBox(g, rx, top + 0.0026, 0.0048, 0.0026, 0.0018, 0.0024);
  hardBox(g, rx, top + 0.0026, -0.0048, 0.0026, 0.0018, 0.0024);
}

/* ---------------- grip panels ---------------- */

/* Double-diamond checkered panels.

   The checkering is real geometry, not a normal map: every other grid node
   is raised, so each raised node is surrounded by four lowered ones and the
   surface becomes a field of diamond pyramids. That is exactly how hand
   checkering works — two sets of parallel cuts crossing — and it costs one
   parity test per vertex. The two smooth diamonds around the screws are the
   pattern the Government model has carried since 1924. */
function buildGripPanels(g, side) {
  const NU = 62, NV = 22;
  const T0 = 0.075, T1 = 0.965;
  const zIn = side * 0.0112, zOut = side * (M1911.gripW / 2);
  const RAISE = 0.00042;
  const screws = [[0.295, 0.5], [0.775, 0.5]];

  const at = (ti, si, lift) => {
    const t = lerp(T0, T1, ti);
    const hf = lerp(0.0204, 0.0190, ti) * 0.90;
    const hb = lerp(0.0286, 0.0250, ti) * 0.86;
    const a = lerp(-hb, hf, si);
    const d = GRIP_LEN * t;
    // A shallow crown across the panel, so it is not a flat plate.
    const bulge = (1 - Math.pow(2 * si - 1, 2)) * 0.0009;
    const z = zOut + side * (bulge + lift);
    return new Vec3(
      GRIP_TOP.x + GRIP_DOWN.x * d + GRIP_U.x * a,
      GRIP_TOP.y + GRIP_DOWN.y * d + GRIP_U.y * a,
      z,
    );
  };

  const smooth = (ti, si) => {
    // Border band, and the two diamonds around the screws.
    if (ti < 0.055 || ti > 0.945 || si < 0.09 || si > 0.91) return true;
    for (const [ct, cs] of screws) {
      if (Math.abs(ti - ct) / 0.105 + Math.abs(si - cs) / 0.300 < 1) return true;
    }
    return false;
  };

  const base = g.positions.length / 3;
  const rows = [];
  for (let i = 0; i <= NU; i++) {
    const row = [];
    for (let j = 0; j <= NV; j++) {
      const ti = i / NU, si = j / NV;
      const lift = (!smooth(ti, si) && (i + j) % 2 === 0) ? RAISE : 0;
      row.push(at(ti, si, lift));
    }
    rows.push(row);
  }
  /* Outer face, flat-shaded per quad. Smooth normals cannot express this
     surface at all: the checker alternates every grid step, so a central
     difference straddles two nodes of the same parity, the pattern cancels
     exactly, and the panel comes out mirror-flat no matter how deep the
     cuts are. Checkering is faceted in reality anyway — every facet is one
     flat pass of the cutter — so each quad gets its own normal and its own
     four vertices. */
  const idx = [];
  const fn = new Vec3(), e1 = new Vec3(), e2 = new Vec3();
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1];
      e1.subVectors(b, a); e2.subVectors(d, a);
      fn.crossVectors(e1, e2).normalize();
      if (fn.z * side < 0) fn.scale(-1);
      const base4 = g.positions.length / 3;
      for (const p of [a, b, c, d]) g.vert(p.x, p.y, p.z, fn.x, fn.y, fn.z, i / NU, j / NV);
      if (side > 0) g.quad(base4, base4 + 1, base4 + 2, base4 + 3);
      else g.quad(base4, base4 + 3, base4 + 2, base4 + 1);
    }
  }
  // The rim still needs the boundary rows, so keep them as their own strip.
  for (let i = 0; i <= NU; i++) {
    const line = [];
    for (let j = 0; j <= NV; j++) {
      const p = rows[i][j];
      line.push(g.vert(p.x, p.y, p.z, 0, 0, side, i / NU, j / NV));
    }
    idx.push(line);
  }

  // Inner face and rim, so the panel is a solid slab rather than a decal.
  const inner = [];
  for (let i = 0; i <= NU; i++) {
    const line = [];
    for (let j = 0; j <= NV; j++) {
      const p = at(i / NU, j / NV, 0);
      line.push(g.vert(p.x, p.y, zIn, 0, 0, -side, i / NU, j / NV));
    }
    inner.push(line);
  }
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      if (side > 0) g.quad(inner[i][j], inner[i][j + 1], inner[i + 1][j + 1], inner[i + 1][j]);
      else g.quad(inner[i][j], inner[i + 1][j], inner[i + 1][j + 1], inner[i][j + 1]);
    }
  }
  const rim = (aList, bList, flip) => {
    for (let k = 0; k < aList.length - 1; k++) {
      if (flip) g.quad(aList[k], aList[k + 1], bList[k + 1], bList[k]);
      else g.quad(aList[k], bList[k], bList[k + 1], aList[k + 1]);
    }
  };
  rim(idx[0], inner[0], side < 0);
  rim(idx[NU], inner[NU], side > 0);
  rim(idx.map((r) => r[0]), inner.map((r) => r[0]), side > 0);
  rim(idx.map((r) => r[NV]), inner.map((r) => r[NV]), side < 0);

  // Grip screws, with a slot.
  for (const [ct, cs] of screws) {
    const c = at(ct, cs, 0);
    const axis = new Vec3(0, 0, side);
    const head = (z, r) => ({
      o: new Vec3(c.x, c.y, z), u: GRIP_U, v: new Vec3(0, side, 0), pts: ringOutline(r, 16),
    });
    sweepPath(g, [head(c.z - side * 0.0004, 0.0030), head(c.z + side * 0.0007, 0.0030)], false, true);
    hardBox(g, c.x, c.y, c.z + side * 0.0008, 0.0002, 0.0026, 0.0004);
    void axis;
  }
}

/* ---------------- engraving ---------------- */

/* A five-glyph stroke font. Nothing general — it exists to cut one word
   into one flat, at a size where anything more elaborate would be smaller
   than a pixel anyway. Strokes are polylines; each segment becomes a bar
   standing proud of the steel, which is what shallow engraving on a
   polished surface actually looks like once it has darkened. */
const ENGRAVE_GLYPHS = {
  R: { w: 0.72, s: [
    [[0, 0], [0, 1]],
    [[0, 1], [0.44, 1], [0.58, 0.87], [0.58, 0.70], [0.44, 0.56], [0, 0.56]],
    [[0.30, 0.56], [0.60, 0]]] },
  i: { w: 0.26, s: [[[0.10, 0], [0.10, 0.64]], [[0.10, 0.80], [0.10, 0.92]]] },
  v: { w: 0.60, s: [[[0.02, 0.66], [0.28, 0], [0.54, 0.66]]] },
  e: { w: 0.58, s: [[[0.05, 0.31], [0.50, 0.31], [0.50, 0.46], [0.41, 0.60],
                     [0.25, 0.66], [0.11, 0.61], [0.03, 0.46], [0.03, 0.28],
                     [0.11, 0.11], [0.27, 0.03], [0.45, 0.09]]] },
  r: { w: 0.44, s: [[[0.06, 0], [0.06, 0.66]], [[0.06, 0.50], [0.17, 0.62], [0.35, 0.66]]] },
};

/* One stroke: a bar in the XY plane, extruded through Z. */
function markBar(g, x0, y0, x1, y1, hw, z0, z1) {
  let dx = x1 - x0, dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return;
  dx /= L; dy /= L;
  // Extend by half a width at each end so consecutive segments join cleanly.
  const ex = dx * hw, ey = dy * hw, px = -dy * hw, py = dx * hw;
  const c = [
    [x0 - ex + px, y0 - ey + py], [x1 + ex + px, y1 + ey + py],
    [x1 + ex - px, y1 + ey - py], [x0 - ex - px, y0 - ey - py],
  ];
  const base = g.positions.length / 3;
  for (const z of [z0, z1]) for (const [x, y] of c) g.vert(x, y, z, 0, 0, Math.sign(z1 - z0), x * 40, y * 40);
  // The corner list runs clockwise in XY, so the face at z1 is front-facing
  // in its natural order when z1 is the *lower* z, and reversed otherwise.
  const nz = Math.sign(z1 - z0);
  if (nz < 0) g.quad(base + 4, base + 5, base + 6, base + 7);
  else g.quad(base + 7, base + 6, base + 5, base + 4);
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4;
    if (nz < 0) g.quad(base + k, base + k2, base + 4 + k2, base + 4 + k);
    else g.quad(base + k2, base + k, base + 4 + k, base + 4 + k2);
  }
}

/* Cut `text` into the slide's left flat, just behind the muzzle. It reads
   left to right from the pistol's left side, which is where a maker's mark
   goes and the only orientation it is ever photographed in. */
function buildEngraving(g, text, opts = {}) {
  const H = opts.height || 0.0026;             // cap height: 2.6 mm
  const stroke = H * 0.135;
  const x0 = opts.x != null ? opts.x : 0.2072; // 8.7 mm behind the muzzle
  const y0 = opts.y != null ? opts.y : -0.0074;
  const zSurf = -P11.slideHalfW;
  const zA = zSurf - 0.00002, zB = zSurf - 0.00030;   // 0.28 mm proud, clear
                                                     // of the flank entirely

  let adv = 0;
  for (const ch of text) {
    const gl = ENGRAVE_GLYPHS[ch];
    if (!gl) { adv += 0.32; continue; }
    for (const poly of gl.s) {
      for (let i = 0; i < poly.length - 1; i++) {
        const p = poly[i], q = poly[i + 1];
        markBar(g,
          x0 - (adv + p[0]) * H, y0 + p[1] * H,
          x0 - (adv + q[0]) * H, y0 + q[1] * H,
          stroke, zA, zB);
      }
    }
    adv += gl.w + 0.10;
  }
}

/* ---------------- assembly ---------------- */

/* Origin at the web of the shooting hand, so an actor placed at a point
   sits where a hand would hold it rather than floating by its muzzle. */
const PISTOL_ORIGIN = new Vec3(0.0260, -0.0300, 0);

function offsetGeometry(geo, o) {
  for (let i = 0; i < geo.positions.length; i += 3) {
    geo.positions[i] -= o.x; geo.positions[i + 1] -= o.y; geo.positions[i + 2] -= o.z;
  }
  return geo;
}

/* Three geometries, because the gun is three materials: steel, grip and
   the mark. Splitting by material rather than by part keeps it to three
   draw calls. */
function makePistol1911(opts = {}) {
  const steel = new Geometry();
  buildSlide(steel);
  buildBarrel(steel);
  buildFrame(steel);
  buildSights(steel);

  const grip = new Geometry();
  buildGripPanels(grip, 1);
  buildGripPanels(grip, -1);

  const mark = new Geometry();
  buildBore(mark);
  buildEngraving(mark, opts.engrave != null ? opts.engrave : 'River', opts);

  return {
    steel: offsetGeometry(steel, PISTOL_ORIGIN).finalize(),
    grip: offsetGeometry(grip, PISTOL_ORIGIN).finalize(),
    mark: offsetGeometry(mark, PISTOL_ORIGIN).finalize(),
  };
}

/* ---------------- engine hook ---------------- */

/* Polished stainless, not "shiny grey". Bare steel is a metal — its albedo
   is a near-white tint and all of its colour comes from what it reflects,
   so metalness has to be 1 and roughness low. Painting a dielectric grey is
   the usual mistake and it reads as plastic every time. */
const PISTOL_MATERIALS = {
  steel: { color: 0xdadee2, texture: 'metal', roughness: 0.24, metalness: 1 },
  grip: { color: 0x1d3f87, texture: 'smooth', roughness: 0.52, metalness: 0 },
  // Engraving on a polished flat only reads if it scatters where the steel
  // mirrors, so the mark is a rough near-black dielectric, not dark metal.
  mark: { color: 0x101316, texture: 'smooth', roughness: 0.85, metalness: 0 },
};

Engine.prototype.pistol1911 = function (opts = {}) {
  const word = opts.engrave != null ? opts.engrave : 'River';
  const key = `1911:${word}`;
  let parts = this._pistolParts && this._pistolParts[key];
  if (!parts) {
    parts = makePistol1911({ engrave: word });
    (this._pistolParts || (this._pistolParts = {}))[key] = parts;
  }

  const b = parts.steel.bounds;
  const pts = [];
  for (const x of [b.min.x, b.max.x]) {
    for (const y of [b.min.y, b.max.y]) {
      for (const z of [b.min.z, b.max.z]) pts.push(new Vec3(x, y, z));
    }
  }
  const shape = opts.physics === false ? null : Shape.convex(pts);

  const body = this._spawn(
    Object.assign({}, opts, {
      material: opts.material || PISTOL_MATERIALS.steel,
      mass: opts.mass != null ? opts.mass : 1.1,      // 39 oz, loaded
    }),
    this._mesh(key + ':steel', () => parts.steel), shape, 0.21);
  body.name = opts.name || 'pistol1911';

  const child = (suffix, geo, mat) => {
    const a = this._spawn(
      { material: mat, physics: false },
      this._mesh(key + ':' + suffix, () => geo), null, 0.21);
    a.parent = body;
    return a;
  };
  body.grips = child('grip', parts.grip, opts.gripMaterial || PISTOL_MATERIALS.grip);
  body.mark = child('mark', parts.mark, PISTOL_MATERIALS.mark);
  return body;
};
