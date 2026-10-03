/* ============================================================
   A MAKEHUMAN FACE THAT TALKS AND BLINKS.

   The field-built heads (94f-mh-head.js) had no expression rig at all:
   91-face.js is written against the old ring sculpt's topology, so the
   MakeHuman heads were built with `face = null` and every character in
   the game spoke with a mouth that never moved and eyes that never
   closed. This is their rig, built from the head's own geometry:

     jaw     the lower face rotated about the hinge in front of the ear,
             split from the upper face exactly at the lips -- the lip
             rows are 1.2 mm apart there, so the split is found by
             walking the mesh (the upper lip and the lower lip are only
             joined at the corners), and the weight between the two is
             solved over the surface, so the corners stretch rather than
             tear and the inside of each lip goes with its own lip
     round, spread, press, tuck, funnel, upper
             the lip shapes LipSync (91a-lipsync.js) asks for: pucker,
             smile-wide, pressed shut, lower lip under the teeth, flared
             forward, top lip lifted
     blink   each upper lid rotated down over its eyeball about the
             eye's own centre, by the angle that closes THAT column of
             the aperture (measured), and the lower lid up a little

   and a set of teeth, added to the eye mesh (the only white material on
   a head), the lower row riding the jaw -- an open mouth with nothing in
   it is a hole, and a lip-reader reads the teeth for f, v and th.

   The head meshes are shared between every character with the same face
   and drawn instanced, so the driver (MhFace) gives a character private
   copies only while it is moving its face, and hands the shared ones
   back when it stops. A crowd that is not talking costs nothing.
   ============================================================ */

const MHF_JAW_MAX = 0.105;          // radians of jaw drop at jaw = 1: about 13 mm at the lips, an open "ah"
const MHF_BLINK_EVERY = 30;         // seconds between blinks
const MHF_BLINK_JITTER = 3;         // +- seconds, so a room of people does not blink in unison
const MHF_BLINK_TIME = 0.16;        // one blink: down fast, up slower
const MHF_NEAR = 9;                 // metres: past this the face is a few pixels and is not morphed

function _mhfS(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

/* The mouth on the midline: the nose tip, the two lip peaks under it, and the slit between them. */
function _mhfMouth(X, Y, Z, n) {
  let tipY = 0, tipZ = -1;
  for (let v = 0; v < n; v++) if (Math.abs(X[v]) < 0.004 && Y[v] < 0 && Y[v] > -0.07 && Z[v] > tipZ) { tipZ = Z[v]; tipY = Y[v]; }
  const B0 = tipY - 0.085, NB = 80, prof = new Float32Array(NB).fill(-1);
  for (let v = 0; v < n; v++) {
    if (Math.abs(X[v]) > 0.0025) continue;
    const b = Math.floor((Y[v] - B0) / 0.001);
    if (b >= 0 && b < NB && Z[v] > prof[b]) prof[b] = Z[v];
  }
  for (let b = 0; b < NB; b++) if (prof[b] < 0) {                // a coarse mesh leaves bins empty
    let a = b - 1, c = b + 1;
    while (a >= 0 && prof[a] < 0) a--;
    while (c < NB && prof[c] < 0) c++;
    if (a >= 0 && c < NB) prof[b] = prof[a] + (prof[c] - prof[a]) * (b - a) / (c - a);
    else prof[b] = a >= 0 ? prof[a] : c < NB ? prof[c] : 0;
  }
  const yb = (b) => B0 + (b + 0.5) * 0.001, bin = (y) => Math.max(0, Math.min(NB - 1, Math.floor((y - B0) / 0.001)));
  let up = bin(tipY - 0.045);
  for (let b = bin(tipY - 0.045); b <= bin(tipY - 0.016); b++) if (prof[b] > prof[up]) up = b;
  let lo = bin(yb(up) - 0.035);
  for (let b = bin(yb(up) - 0.035); b <= bin(yb(up) - 0.010); b++) if (prof[b] > prof[lo]) lo = b;
  let sl = lo;
  for (let b = lo; b <= up; b++) if (prof[b] < prof[sl]) sl = b;
  return { tipY, slitY: yb(sl), slitZ: prof[sl], prof, bin };

}

/* The rig for one head geometry (any level of detail). Cached on the geometry: faces are shared. */
function buildMhFaceRig(geo, ref = null) {
  if (geo._faceRig !== undefined) return geo._faceRig;
  const U = SDF_HEAD_TO_UNITS, P = geo.positions, I = geo.indices, n = P.length / 3;
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  for (let v = 0; v < n; v++) { X[v] = P[v * 3] / U; Y[v] = P[v * 3 + 1] / U; Z[v] = P[v * 3 + 2] / U; }

  const mouth = _mhfMouth(X, Y, Z, n);
  // Likewise the mouth: a coarse mesh's midline profile is too sparse to find the slit to a millimetre.
  let slitY = ref ? ref.slitY : mouth.slitY;
  const slitZ = ref ? ref.slitZ : mouth.slitZ, tipY = ref ? ref.tipY : mouth.tipY, prof = mouth.prof, bin = mouth.bin;

  /* ---- adjacency, welded by position (a seam duplicate is the same point of skin) ---- */
  const wkey = new Map(), W = new Int32Array(n);
  for (let v = 0; v < n; v++) {
    const k = Math.round(P[v * 3] * 4e4) + ',' + Math.round(P[v * 3 + 1] * 4e4) + ',' + Math.round(P[v * 3 + 2] * 4e4);
    let r = wkey.get(k);
    if (r === undefined) { r = v; wkey.set(k, v); }
    W[v] = r;
  }
  const nbr = new Map();
  const link = (a, b) => { if (a === b) return; let s = nbr.get(a); if (!s) nbr.set(a, s = new Set()); s.add(b); };
  for (let t = 0; t < I.length; t += 3) {
    const a = W[I[t]], b = W[I[t + 1]], c = W[I[t + 2]];
    link(a, b); link(b, a); link(b, c); link(c, b); link(c, a); link(a, c);
  }
  const NB2 = (v) => nbr.get(v) || [];

  /* ---- upper lip / lower lip: flood each from its own side inside the mouth box ---- */
  const inBox = (v) => Math.abs(X[v]) < 0.016 && Z[v] > slitZ - 0.05 && Y[v] > slitY - 0.05 && Y[v] < slitY + 0.03;
  const seedNear = (y) => {
    let best = -1, bd = 1e9;
    for (let v = 0; v < n; v++) {
      if (W[v] !== v || Math.abs(X[v]) > 0.003) continue;
      const d = (Y[v] - y) ** 2 + (Z[v] - prof[bin(y)]) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  };
  const flood = (seed) => {
    const s = new Set([seed]), st = [seed];
    while (st.length) { const v = st.pop(); for (const q of NB2(v)) if (!s.has(q) && inBox(q)) { s.add(q); st.push(q); } }
    return s;
  };
  const sU = seedNear(slitY + 0.008), sL = seedNear(slitY - 0.012);
  let upperSet = flood(sU), lowerSet = flood(sL);
  const split = !upperSet.has(sL) && !lowerSet.has(sU);
  if (!split) { upperSet = new Set(); lowerSet = new Set(); }
  // The slit itself, refined: between the lowest outer point of the upper lip and the highest of the lower.
  if (split && !ref) {
    let a = Infinity, b = -Infinity;
    for (const v of upperSet) if (Math.abs(X[v]) < 0.004 && Z[v] > slitZ - 0.004) a = Math.min(a, Y[v]);
    for (const v of lowerSet) if (Math.abs(X[v]) < 0.004 && Z[v] > slitZ - 0.004) b = Math.max(b, Y[v]);
    if (a < Infinity && b > -Infinity && a > b) slitY = (a + b) / 2;
  }
  const hingeY = slitY + 0.025, hingeZ = slitZ - 0.1325;

  /* ---- jaw weight: pinned where it is certain, solved over the surface everywhere else ---- */
  const soft = (v) => {
    const dz = Z[v] - hingeZ, yl = hingeY + (slitY - hingeY) * dz / (slitZ - hingeZ);
    const band = 0.004 + 0.014 * _mhfS(0.012, 0.05, Math.abs(X[v]));
    return _mhfS(-band, band, yl - Y[v]) * _mhfS(0.01, 0.055, dz);
  };
  const jw = new Float32Array(n), pinned = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    if (W[v] !== v) continue;
    const ax = Math.abs(X[v]), dz = Z[v] - hingeZ, yl = hingeY + (slitY - hingeY) * dz / (slitZ - hingeZ);
    if (split && ax < 0.013 && upperSet.has(v)) { jw[v] = 0; pinned[v] = 1; }
    else if (split && ax < 0.013 && lowerSet.has(v)) { jw[v] = 1; pinned[v] = 1; }
    else if (Y[v] - yl > 0.022 || dz < 0.0) { jw[v] = 0; pinned[v] = 1; }
    else if (yl - Y[v] > 0.026 && dz > 0.06) { jw[v] = 1; pinned[v] = 1; }
    else jw[v] = soft(v);
  }
  // Gauss-Seidel with over-relaxation over the free vertices: a harmonic weight follows the skin, not the air.
  const free = [];
  for (let v = 0; v < n; v++) if (W[v] === v && !pinned[v]) free.push(v);
  for (let it = 0; it < 160; it++) {
    for (const v of free) {
      let s = 0, c = 0;
      for (const q of NB2(v)) { s += jw[q]; c++; }
      if (c) jw[v] = Math.max(0, Math.min(1, jw[v] + 1.85 * (s / c - jw[v])));
    }
  }
  // The neck edge is shared with the body vertex for vertex, so nothing near it may move.
  for (let v = 0; v < n; v++) {
    const r = W[v];
    const cut = _mhCutY(Z[v]);
    jw[v] = jw[r] * _mhfS(cut + 0.006, cut + 0.04, Y[v]);
  }

  /* ---- the lip controls, as displacements at full weight (metres) ---- */
  const D = {};
  for (const c of ['round', 'spread', 'press', 'tuck', 'funnel', 'upper', 'smile', 'frown', 'browUp', 'browDown']) D[c] = [];
  const jaw = [];
  for (let v = 0; v < n; v++) {
    const x = X[v], y = Y[v], z = Z[v], ax = Math.abs(x), sx = x < 0 ? -1 : 1, w = jw[v];
    if (w > 1e-4) jaw.push(v, w);
    const ry = (y - slitY) / (y > slitY ? 0.017 : 0.021), rr = (x / 0.036) ** 2 + ry * ry, rrW = (x / 0.05) ** 2 + ry * ry;
    if (rrW >= 1) continue;
    const fz = _mhfS(slitZ - 0.042, slitZ - 0.016, z);
    if (fz <= 0) continue;
    // M is the lips and the skin just round them; Mw reaches the corners and the cheek beside them,
    // which is where a pucker or a smile is actually seen from the front.
    const M = rr < 1 ? (1 - rr) * (1 - rr) * fz : 0, Mw = (1 - rrW) * (1 - rrW) * fz;
    const nearU = Math.exp(-(((y - slitY) / 0.0075) ** 2)) * (1 - w), nearL = Math.exp(-(((y - slitY) / 0.0085) ** 2)) * w;
    const near = Math.max(nearU, nearL), mid = Math.exp(-((x / 0.014) ** 2)), midW = Math.exp(-((x / 0.022) ** 2));
    const corner = _mhfS(0.008, 0.026, ax) * (1 - _mhfS(0.032, 0.046, ax));
    const put = (c, dx, dy, dz) => { if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 2e-6) D[c].push(v, dx * U, dy * U, dz * U); };
    // oo, w, oh: corners drawn in, lips pushed forward, a small round opening
    put('round', -sx * Math.min(ax, 0.03) * 0.40 * Mw, (0.0005 * nearU - 0.0005 * nearL) * mid * M, 0.0075 * M * (0.45 + 0.55 * near));
    // ee, s: corners wide and back, a touch up
    put('spread', sx * 0.0062 * Mw * _mhfS(0, 0.025, ax), 0.0010 * M * corner - 0.0004 * nearU * M + 0.0004 * nearL * M, -0.0030 * Mw * _mhfS(0.004, 0.028, ax));
    // m, b, p: pressed together and rolled in
    put('press', 0, (-0.0009 * nearU + 0.0009 * nearL) * M, -0.0030 * M * near);
    // f, v: the lower lip up and back under the top teeth, the top lip lifted off them
    const nearL2 = Math.exp(-(((y - slitY) / 0.012) ** 2)) * w;
    put('tuck', 0, (0.0030 * nearL2 + 0.0026 * nearU) * M * midW, (-0.0030 * nearL2 + 0.0008 * nearU) * M * midW);
    // sh, ch, j: lips flared forward and parted, corners in a little
    put('funnel', -sx * Math.min(ax, 0.03) * 0.18 * Mw, (0.0018 * nearU - 0.0018 * nearL) * M, 0.0066 * M * (0.4 + 0.6 * near));
    // th and the open vowels: the top lip lifted off the teeth
    put('upper', 0, 0.0021 * nearU * M * midW, 0.0005 * nearU * M * midW);
    /* EXPRESSION. A smile lifts the corners up and back and bunches the cheek above them; a frown
       (or a grimace of pain) pulls the corners down and pushes the lower lip out a little. */
    const cheek = Math.exp(-(((y - slitY - 0.022) / 0.012) ** 2)) * _mhfS(0.012, 0.03, ax) * (1 - _mhfS(0.045, 0.06, ax)) * fz;
    put('smile', sx * 0.0045 * Mw * corner, 0.0065 * Mw * corner + 0.0028 * cheek, -0.0024 * Mw * corner + 0.0020 * cheek);
    put('frown', sx * 0.0010 * Mw * corner, -0.0045 * Mw * corner, 0.0016 * nearL * M * midW);
  }

  /* ---- the lids: each eye's aperture measured column by column ---- */
  const lids = [];
  const eyes = geo.eyes;
  const cols = 37, cw = 0.001, c0 = -0.018;
  const at = (A, dx) => {
    const f = (dx - c0) / cw - 0.5, a = Math.floor(f), t = f - a;
    const p = A[a], q = A[a + 1];
    if (p === p && p !== undefined && q === q && q !== undefined) return p + (q - p) * t;
    if (p === p && p !== undefined) return p;
    if (q === q && q !== undefined) return q;
    return NaN;
  };
  const measure = (s) => {
    let cx = 0, cy = 0, cz = 0, k = 0;
    if (!eyes) return null;
    const E = eyes.positions, nE = eyes._teeth != null ? eyes._teeth : E.length / 3;
    for (let i = 0; i < nE * 3; i += 3) if (E[i] * s > 0) { cx += E[i]; cy += E[i + 1]; cz += E[i + 2]; k++; }
    if (!k) return null;
    cx /= k * U; cy /= k * U; cz /= k * U;
    let er = 0;
    for (let i = 0; i < nE * 3; i += 3) if (E[i] * s > 0) { const d = Math.hypot(E[i] / U - cx, E[i + 1] / U - cy, E[i + 2] / U - cz); if (d < 0.02) er = Math.max(er, d); }
    if (!er) er = 0.0125;
    const aU = new Float32Array(cols).fill(NaN), aL = new Float32Array(cols).fill(NaN);
    const byCol = Array.from({ length: cols }, () => []);
    for (let v = 0; v < n; v++) {
      const dx = X[v] - cx, dy = Y[v] - cy, dz = Z[v] - cz;
      const r = Math.hypot(dx, dy, dz);
      if (r < er || r > er + 0.0065 || dz < 0.004) continue;
      // Each column 3 mm wide, overlapping: a margin row's vertices are spaced wider than one column.
      const a = Math.atan2(dy, dz), cc = (dx - c0) / cw - 0.5;
      for (let c = Math.max(0, Math.ceil(cc - 1.5)); c <= Math.min(cols - 1, Math.floor(cc + 1.5)); c++) byCol[c].push(a);
    }
    for (let c = 0; c < cols; c++) {
      const A = byCol[c].sort((p, q) => p - q);
      let best = 0, bu = NaN, bl = NaN;
      for (let i = 1; i < A.length; i++) {
        const g = A[i] - A[i - 1];
        if (g > best && A[i] > -0.35 && A[i - 1] < 0.3) { best = g; bu = A[i]; bl = A[i - 1]; }
      }
      // The aperture is the gap that the eye-level line runs through.
      if (best > 0.05 && bl < -0.03 && bu > -0.2) { aU[c] = bu; aL[c] = bl; }
    }
    // Only the run of columns joined to the middle of the eye is the eye.
    const mid = Math.round(-c0 / cw - 0.5);
    let c1 = mid, c2 = mid;
    if (!(aU[mid] === aU[mid])) return null;
    while (c1 > 0 && aU[c1 - 1] === aU[c1 - 1]) c1--;
    while (c2 < cols - 1 && aU[c2 + 1] === aU[c2 + 1]) c2++;
    for (let c = 0; c < cols; c++) if (c < c1 || c > c2) { aU[c] = NaN; aL[c] = NaN; }
    const sm = (A) => { const o = new Float32Array(cols).fill(NaN); for (let c = 0; c < cols; c++) { let s2 = 0, m = 0; for (let d = -2; d <= 2; d++) { const q = A[c + d]; if (q === q && q !== undefined) { s2 += q; m++; } } if (m && A[c] === A[c]) o[c] = s2 / m; } return o; };
    // The two corners are not the same distance from the eye's centre: the outer one is further out.
    const dxMin = c0 + (c1 + 0.5) * cw, dxMax = c0 + (c2 + 0.5) * cw;
    return { cx, cy, cz, er, su: sm(aU), sl: sm(aL), hw: Math.max(-dxMin, dxMax), dxMin, dxMax };
  };
  // A coarser level of detail of the same face takes the close-up's measurements: it has too few
  // vertices round an eye to find the margins by itself, and it is the same eye in the same place.
  for (const s of [-1, 1]) {
    const refLid = ref && ref.lids ? ref.lids.find((l) => l.side === s) : null;
    const m = refLid ? refLid.meas : measure(s);
    if (!m) continue;
    const { cx, cy, cz, er, su, hw, dxMin, dxMax } = m, sl2 = m.sl;
    const rot = [];
    for (let v = 0; v < n; v++) {
      const dx = X[v] - cx, dy = Y[v] - cy, dz = Z[v] - cz;
      const r = Math.hypot(dx, dy, dz);
      if (r < er * 0.98 || r > 0.03 || dz < -0.004) continue;
      if (dx < dxMin - 0.003 || dx > dxMax + 0.0032) continue;
      const cdx = Math.max(dxMin, Math.min(dxMax, dx));
      const u = at(su, cdx), l = at(sl2, cdx);
      if (!(u === u) || !(l === l)) continue;
      const gap = Math.max(0, u - l);
      const a = Math.atan2(dy, dz);
      // Full across the opening, and tapering over the few millimetres past each corner where the lids meet.
      const lat = _mhfS(dxMin - 0.0028, dxMin + 0.0004, dx) * (1 - _mhfS(dxMax + 0.0004, dxMax + 0.0030, dx));
      const rad = 1 - _mhfS(0.020, 0.028, r);
      let th = 0;
      if (a >= u - 0.02) th = -1.10 * 0.82 * gap * (1 - _mhfS(u + 0.14, u + 0.85, a));   // upper lid, down
      else if (a <= l + 0.02) th = 1.10 * 0.22 * gap * _mhfS(l - 0.6, l - 0.08, a);      // lower lid, up
      th *= lat * rad;
      if (Math.abs(th) > 1e-4) rot.push(v, th);
    }
    lids.push({ side: s, meas: m, c: [cx * U, cy * U, cz * U], rot: new Float32Array(rot), hw, gap: at(su, 0) - at(sl2, 0) });
  }

  /* ---- the brows: raised (surprise, fear, listening) and drawn down and in (anger, pain) ---- */
  for (const lid of lids) {
    const cx = lid.meas.cx, cy = lid.meas.cy, cz = lid.meas.cz;
    for (let v = 0; v < n; v++) {
      const x = X[v], y = Y[v], z = Z[v];
      const dx = x - cx, dyb = y - (cy + 0.022);
      if (Math.abs(dx) > 0.034 || Math.abs(dyb) > 0.026 || z < cz - 0.004) continue;
      const w = Math.exp(-((dx / 0.022) ** 2) - ((dyb / 0.013) ** 2)) * _mhfS(cz - 0.004, cz + 0.012, z);
      if (w < 0.01) continue;
      const inner = _mhfS(0.012, -0.012, dx * Math.sign(cx));             // 1 at the nose end of the brow
      const put = (c, px, py, pz) => { if (Math.abs(px) + Math.abs(py) + Math.abs(pz) > 2e-6) D[c].push(v, px * U, py * U, pz * U); };
      put('browUp', 0, 0.0065 * w * (0.6 + 0.4 * inner), 0.0008 * w);
      put('browDown', -Math.sign(cx) * 0.0030 * w * inner, -0.0050 * w * (0.35 + 0.65 * inner), 0.0016 * w * inner);
    }
  }
  for (const c in D) D[c] = D[c] instanceof Float32Array ? D[c] : new Float32Array(D[c]);

  const rig = { n, U, slitY, slitZ, tipY, split, hinge: [hingeY * U, hingeZ * U], jaw: new Float32Array(jaw), D, lids,
    upperN: upperSet.size, lowerN: lowerSet.size, jw };
  geo._faceRig = rig;
  return rig;
}

/* The teeth: two arches of eight, added to the eye mesh, the lower row flagged to ride the jaw.
   Placed from the head's own mouth -- just behind the inside of the lips, the upper edge at the slit. */
function addMhTeeth(head, eyes) {
  if (!eyes || eyes._teeth != null) return eyes;
  const U = SDF_HEAD_TO_UNITS, P = head.positions, n = P.length / 3;
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  for (let v = 0; v < n; v++) { X[v] = P[v * 3] / U; Y[v] = P[v * 3 + 1] / U; Z[v] = P[v * 3 + 2] / U; }
  const rig = _mhfMouth(X, Y, Z, n);
  // The inside of the lips on the midline: the deepest point still in front of the cavity at the slit.
  let innerZ = rig.slitZ - 0.010;
  { let best = -1; for (let v = 0; v < n; v++) { const x = P[v * 3] / U, y = P[v * 3 + 1] / U, z = P[v * 3 + 2] / U;
    if (Math.abs(x) < 0.002 && Math.abs(y - rig.slitY) < 0.003 && z < rig.slitZ - 0.004 && z > rig.slitZ - 0.02 && z > best) best = z; }
    if (best > 0) innerZ = best; }
  const nOld = eyes.positions.length / 3;
  const pos = Array.from(eyes.positions), nrm = Array.from(eyes.normals), uv = Array.from(eyes.uvs);
  const col = eyes.colors ? Array.from(eyes.colors) : new Array(nOld * 3).fill(1);
  const idx = Array.from(eyes.indices);
  const lower = [], cx0 = 0;
  const arch = (isLower) => {
    const zF = innerZ - (isLower ? 0.0038 : 0.0014), yEdge = rig.slitY + (isLower ? -0.0030 : 0.0006);
    const h = isLower ? 0.0085 : 0.0098, thick = 0.0055, half = 0.024, K = 24;
    const bounds = isLower ? [0, 0.0028, 0.0058, 0.0092, 0.0130, 0.0175, 0.024] : [0, 0.0045, 0.0080, 0.0118, 0.0158, 0.0200, 0.024];
    const SEG = 48, ROWS = 4, base = pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const x = -half + (2 * half * i) / SEG, ax = Math.abs(x);
      const z = zF - K * x * x, dzdx = -2 * K * x, l = Math.hypot(1, dzdx);
      const nx = -dzdx / l, nz = 1 / l;                // the arch's outward normal
      let gapD = 1e9;
      for (const b of bounds) gapD = Math.min(gapD, Math.abs(ax - b));
      const gap = _mhfS(0.0009, 0.0002, gapD);          // the dark line between two teeth
      const scal = 0.0006 * gap;                          // and the notch in the edge there
      const back = 0.12 + 0.88 * (1 - _mhfS(0.010, 0.024, ax));    // the back teeth fall into shadow
      for (let r = 0; r <= ROWS; r++) {
        const f = r / ROWS, yy = isLower ? yEdge - scal * -1 - h * f : yEdge + scal + h * f;
        const tilt = (isLower ? 0.0006 : 0.0022) * f;     // the uppers lean back into the gum
        for (const side of [0, 1]) {
          const o = side ? thick : 0;
          pos.push((x - nx * (o + tilt)) * U, yy * U, (z - nz * (o + tilt)) * U);
          nrm.push(side ? -nx : nx, 0, side ? -nz : nz);
          uv.push(i / SEG, f);
          const gum = f > 0.82 ? _mhfS(0.82, 1, f) : 0;
          const shade = (side ? 0.35 : 1) * back * (1 - 0.55 * gap);
          col.push((0.66 * (1 - gum) + 0.62 * gum) * shade, (0.61 * (1 - gum) + 0.36 * gum) * shade, (0.52 * (1 - gum) + 0.38 * gum) * shade);
          if (isLower) lower.push(pos.length / 3 - 1);
        }
      }
    }
    const at = (i, r, s) => base + (i * (ROWS + 1) + r) * 2 + s;
    for (let i = 0; i < SEG; i++) for (let r = 0; r < ROWS; r++) {
      const a = at(i, r, 0), b = at(i + 1, r, 0), c = at(i + 1, r + 1, 0), d = at(i, r + 1, 0);
      const a2 = at(i, r, 1), b2 = at(i + 1, r, 1), c2 = at(i + 1, r + 1, 1), d2 = at(i, r + 1, 1);
      // Front faces out toward the lips, back faces in; wound so that is the outside either way.
      if (isLower) { idx.push(a, c, b, a, d, c, a2, b2, c2, a2, c2, d2); } else { idx.push(a, b, c, a, c, d, a2, c2, b2, a2, d2, c2); }
    }
    // The biting edge, closing front to back.
    for (let i = 0; i < SEG; i++) {
      const a = at(i, 0, 0), b = at(i + 1, 0, 0), a2 = at(i, 0, 1), b2 = at(i + 1, 0, 1);
      if (isLower) idx.push(a, b, b2, a, b2, a2); else idx.push(a, b2, b, a, a2, b2);
    }
  };
  arch(false); arch(true);
  /* The tongue: a flattened, wet, darker-pink mound on the floor of the mouth behind the lower teeth,
     riding the jaw. Without it an open "ah" showed a black hole under the upper teeth. */
  {
    const cy = rig.slitY - 0.0072, cz = innerZ - 0.019, rx = 0.0165, ry = 0.0042, rz = 0.021;
    const RINGS = 10, SECT = 18, base = pos.length / 3;
    for (let a = 0; a <= RINGS; a++) {
      const th = (a / RINGS) * Math.PI;
      for (let b = 0; b <= SECT; b++) {
        const ph = (b / SECT) * Math.PI * 2;
        const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
        const tip = nz > 0 ? 1 - 0.25 * nz * nz : 1;                  // narrower toward the tip
        const px = cx0 + nx * rx * tip, py = cy + ny * ry * (ny > 0 ? 1 : 0.6), pz = cz + nz * rz;
        pos.push(px * U, py * U, pz * U);
        const l = Math.hypot(nx / rx, ny / ry, nz / rz) || 1;
        nrm.push(nx / rx / l, ny / ry / l, nz / rz / l);
        uv.push(b / SECT, a / RINGS);
        const shade = 0.35 + 0.65 * _mhfS(-0.6, 0.9, nz) * (ny > -0.2 ? 1 : 0.5);
        col.push(0.58 * shade, 0.27 * shade, 0.27 * shade);
        lower.push(pos.length / 3 - 1);
      }
    }
    for (let a = 0; a < RINGS; a++) for (let b = 0; b < SECT; b++) {
      const i0 = base + a * (SECT + 1) + b, i1 = i0 + SECT + 1;
      idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1);
    }
  }
  eyes.positions = new Float32Array(pos); eyes.normals = new Float32Array(nrm); eyes.uvs = new Float32Array(uv);
  eyes.colors = new Float32Array(col); eyes.indices = idx;
  eyes.tangents = null; eyes.bounds = null;
  if (eyes.parts) while (eyes.parts.length < pos.length / 3) eyes.parts.push(eyes.parts[0] || 0);
  eyes.computeTangents(); eyes.computeBounds();
  eyes._teeth = nOld;
  eyes._lowerTeeth = new Int32Array(lower);
  return eyes;
}

/* A face's positions for a set of controls: the lip shapes added, the jaw turned about its hinge,
   the lids turned about each eye. Pure arithmetic on arrays, so a test can run it without a GPU. */
function mhFaceDeform(R, B, c, blinkW, Q) {
  Q.set(B);
  for (const k in R.D) {
    const w = c[k];
    if (!(Math.abs(w) > 1e-3)) continue;
    const d = R.D[k];
    for (let i = 0; i < d.length; i += 4) { const v = d[i] * 3; Q[v] += d[i + 1] * w; Q[v + 1] += d[i + 2] * w; Q[v + 2] += d[i + 3] * w; }
  }
  const jawA = Math.max(0, Math.min(1.1, c.jaw || 0)) * MHF_JAW_MAX;
  if (jawA > 1e-4) {
    const J = R.jaw, hy = R.hinge[0], hz = R.hinge[1];
    for (let i = 0; i < J.length; i += 2) {
      const v = J[i] * 3, a = jawA * J[i + 1], ca = Math.cos(a), sa = Math.sin(a);
      const dy = Q[v + 1] - hy, dz = Q[v + 2] - hz;
      Q[v + 1] = hy + dy * ca - dz * sa;
      Q[v + 2] = hz + dy * sa + dz * ca;
    }
  }
  /* The lids: a blink closes both; a squint (a smile, pain, anger) brings the lower lid up most of
     the way and the upper down a little; wide eyes (fear, surprise) lift the upper lid. */
  const sq = Math.max(0, c.squint || 0), wide = Math.max(0, c.wide || 0);
  if (blinkW > 1e-3 || sq > 1e-3 || wide > 1e-3) {
    for (const lid of R.lids) {
      const Rt = lid.rot, cy = lid.c[1], cz = lid.c[2];
      for (let i = 0; i < Rt.length; i += 2) {
        const th = Rt[i + 1];
        let a = th * blinkW + (th > 0 ? th * 1.3 : th * 0.22) * sq * (1 - blinkW) + (th < 0 ? -th * 0.22 : 0) * wide * (1 - blinkW);
        if (!(Math.abs(a) > 1e-5)) continue;
        const v = Rt[i] * 3, ca = Math.cos(a), sa = Math.sin(a);
        const dy = Q[v + 1] - cy, dz = Q[v + 2] - cz;
        // Positive rotation carries the front of the eye upward (atan2(dy, dz) grows).
        Q[v + 1] = cy + dy * ca + dz * sa;
        Q[v + 2] = cz - dy * sa + dz * ca;
      }
    }
  }
  return Q;
}

/* Faces with something on them. Each is a set of the rig's controls; a character eases toward the
   one it is given and back again, and speech rides on top of whatever the face is doing. */
const MHF_EMOTIONS = {
  neutral: {},
  happy: { smile: 0.75, squint: 0.35, browUp: 0.15 },
  relief: { smile: 0.45, browUp: 0.35, squint: 0.15, jaw: 0.06 },
  pain: { browDown: 0.9, squint: 0.8, frown: 0.35, spread: 0.45, jaw: 0.14, upper: 0.35 },
  fear: { browUp: 0.95, wide: 0.9, jaw: 0.22, spread: 0.25, frown: 0.2 },
  anger: { browDown: 1.0, squint: 0.35, frown: 0.45, press: 0.25 },
  surprise: { browUp: 1.0, wide: 0.8, jaw: 0.45, round: 0.2 },
  sad: { browUp: 0.45, frown: 0.6, squint: 0.1 },
  focus: { browDown: 0.35, squint: 0.3, press: 0.15 },
};
const MHF_KEYS = ['jaw', 'round', 'spread', 'press', 'tuck', 'funnel', 'upper', 'smile', 'frown', 'browUp', 'browDown', 'squint', 'wide'];

/* The driver: one per character. Speech from LipSync, expression, where the eyes are looking (with
   the small fast jumps real eyes make), a blink every thirty seconds -- and private meshes only
   while any of it is showing. The head and the eye mesh are taken separately: eyes that dart about
   need only the eye mesh (a few thousand vertices), not the head. */
class MhFace {
  constructor(engine, head, eyes, opts = {}) {
    this.engine = engine;
    this.gl = engine.gl;
    this.head = head;
    this.eyes = eyes || null;
    this.rng = new Rng((opts.seed || 5) * 7919 + 13);
    // The first blink anywhere in the first interval, so a crowd that appeared together does not blink together.
    this.blinkTimer = opts.blinkIn != null ? opts.blinkIn : 1.5 + this.rng.next() * (MHF_BLINK_EVERY - 1.5);
    this.blinkEvery = opts.blinkEvery || MHF_BLINK_EVERY;
    this.blinkT = -1;
    this.blinks = 0;
    this.line = null;
    this.lineT = 0;
    this.onEnd = null;
    this.ctl = {};
    this.speech = {};
    this.expr = {};
    this.exprTarget = {};
    for (const k of MHF_KEYS) { this.ctl[k] = 0; this.speech[k] = 0; this.expr[k] = 0; this.exprTarget[k] = 0; }
    this.emotion = 'neutral';
    this.emotionUntil = 0;
    this.time = 0;
    // Gaze, in radians about the head: where the eyes point now, where they are going, and what at.
    this.gaze = { yaw: 0, pitch: 0 };
    this.gazeGoal = { yaw: 0, pitch: 0 };
    this.lookTarget = null;
    this.saccadeIn = 0.4 + this.rng.next() * 1.5;
    this.blinkW = 0;
    this._shared = null;
    this._priv = null;
    this._idle = 0;
    this._eyeIdle = 0;
    this.enabled = true;
  }

  /* Say a line. `duration` is its real spoken length in seconds (the recording's, or the synthesiser's
     estimate); left out, a conversational pace. Returns the duration used. */
  say(text, opts = {}) {
    this.line = LipSync.timeline(text, opts.duration);
    this.lineT = -(opts.delay || 0);
    this.onEnd = opts.onEnd || null;
    this.text = String(text);
    if (opts.emotion) this.setEmotion(opts.emotion, opts.strength != null ? opts.strength : 1, this.line.duration + 0.6);
    return this.line.duration;
  }

  stop() { this.line = null; return this; }
  /* Build the private copies now -- at load, behind the loading screen -- rather than on the first
     blink or line, where it stalls the frame it happens in. */
  prewarm() {
    this._acquire();
    // And the private GPU meshes, with one upload each: the first write into a new buffer is where
    // the driver allocates, and that was a frame-long stall the first time each face moved its eyes.
    const P = this._priv, gl = this.gl;
    if (!P) return this;
    const touch = (gm, geo) => {
      if (!gm || !gm.buffers) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, gm.buffers[0]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(geo.positions));
      gl.bindBuffer(gl.ARRAY_BUFFER, gm.buffers[1]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(geo.normals));
    };
    for (const l of P.levels) { if (!l.gm) l.gm = P.mk(l.geo, ':h'); touch(l.gm, l.geo); }
    if (P.eyes) { if (!P.eyes.gm) P.eyes.gm = P.mk(P.eyes.geo, ':e'); touch(P.eyes.gm, P.eyes.geo); }
    return this;
  }
  /* Keep step with a voice that reports where it is: restart when it actually starts speaking,
     and jump to each word as it reaches it (SpeechSynthesisUtterance start / boundary). */
  restart() { if (this.line) this.lineT = 0; return this; }
  syncChar(c) {
    if (!this.line) return this;
    const t = LipSync.wordTime(this.line, c);
    // Only ever pulled FORWARD to a word, or back a little: a late event must not replay the line.
    if (t >= 0 && (t > this.lineT || this.lineT - t < 0.25)) this.lineT = t;
    return this;
  }
  /* Hold the face in a pose -- { jaw, round, ..., blink, yaw, pitch } -- until pose(null). For tools and tests. */
  pose(p) { this.held = p ? Object.assign({}, p) : null; return this; }
  get speaking() { return !!this.line; }
  blink() { if (this.blinkT < 0) { this.blinkT = 0; this.blinks++; } return this; }

  /* An expression: a name from MHF_EMOTIONS (or a control set of your own), how strongly, and for how
     long before it relaxes (omitted: until changed). A flinch is setEmotion('pain', 1, 0.6). */
  setEmotion(name, strength = 1, seconds = 0) {
    const set = typeof name === 'string' ? (MHF_EMOTIONS[name] || {}) : (name || {});
    this.emotion = typeof name === 'string' ? name : 'custom';
    for (const k of MHF_KEYS) this.exprTarget[k] = (set[k] || 0) * Math.max(0, Math.min(1, strength));
    this.emotionUntil = seconds > 0 ? this.time + seconds : 0;
    return this;
  }

  /* Look at something: a world point {x,y,z}, an actor (its head, if it has one), or null for ahead. */
  lookAt(target) { this.lookTarget = target || null; return this; }

  _aimFor() {
    // Where the target is, in the head's frame, as yaw and pitch from between the eyes.
    const t = this.lookTarget, h = this.head;
    if (!t || !h || !h.matrix) return { yaw: 0, pitch: 0 };
    let p = t;
    if (t.matrix && t.matrix.e) {
      const src = t.head && t.head.matrix ? t.head : t;
      const e = src.matrix.e;
      p = { x: e[12], y: e[13] + (src === t && t.head ? 0 : 0.08), z: e[14] };
    } else if (t.x === undefined && t.position) p = t.position;
    const m = h.matrix.e;
    // Inverse of an affine matrix with uniform scale: R^T (p - o) / s^2.
    const ox = p.x - m[12], oy = p.y - m[13], oz = p.z - m[14];
    const s2 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2] || 1;
    const lx = (m[0] * ox + m[1] * oy + m[2] * oz) / s2, ly = (m[4] * ox + m[5] * oy + m[6] * oz) / s2, lz = (m[8] * ox + m[9] * oy + m[10] * oz) / s2;
    const U = SDF_HEAD_TO_UNITS, ey = 0.011 * U, ez = 0.10 * U;
    const dx = lx, dy = ly - ey, dz = lz - ez;
    if (dz < 0.05) return { yaw: Math.sign(dx) * 0.55, pitch: 0 };         // behind: as far round as eyes go
    return { yaw: Math.max(-0.55, Math.min(0.55, Math.atan2(dx, dz))), pitch: Math.max(-0.4, Math.min(0.35, Math.atan2(dy, Math.hypot(dx, dz)))) };
  }

  update(dt) {
    this.time += dt;
    // Blinking: every thirty seconds, give or take.
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT >= MHF_BLINK_TIME) this.blinkT = -1;
    } else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blink();
        this.blinkTimer = this.blinkEvery + (this.rng.next() * 2 - 1) * MHF_BLINK_JITTER;
      }
    }
    if (this.blinkT >= 0) {
      const T = MHF_BLINK_TIME, t = this.blinkT;
      // Closed in 45 ms, held for 20, open over the rest: a real blink is quick down and slower up.
      const e = t < 0.045 ? t / 0.045 : t < 0.065 ? 1 : Math.max(0, 1 - (t - 0.065) / (T - 0.065));
      this.blinkW = e * e * (3 - 2 * e);
    } else this.blinkW = 0;

    // Speech.
    const sp = this.speech;
    if (this.line) {
      this.lineT += dt;
      if (this.lineT >= 0) LipSync.sample(this.line, this.lineT, sp);
      if (this.lineT > this.line.duration) {
        this.line = null;
        for (const k of MHF_KEYS) sp[k] = 0;
        if (this.onEnd) { const f = this.onEnd; this.onEnd = null; f(); }
      }
    } else for (const k of MHF_KEYS) sp[k] *= Math.max(0, 1 - dt * 18);

    // Expression: eased toward its target, and back to neutral when its time is up.
    if (this.emotionUntil && this.time >= this.emotionUntil) this.setEmotion('neutral');
    const ex = this.expr, k1 = Math.min(1, dt * 7);
    for (const k of MHF_KEYS) ex[k] += (this.exprTarget[k] - ex[k]) * k1;

    // The face: speech on top of expression. While talking the mouth is the speech's; the
    // expression keeps the brows, the eyes and what is left of the mouth.
    const c = this.ctl, talking = this.line ? 1 : Math.min(1, Math.abs(sp.jaw) * 4);
    for (const k of MHF_KEYS) {
      const mouth = k !== 'browUp' && k !== 'browDown' && k !== 'squint' && k !== 'wide';
      c[k] = sp[k] + ex[k] * (mouth ? 1 - 0.65 * talking : 1);
    }

    // Gaze: hold on the target, with a small quick jump every second or two (a saccade), and back.
    const aim = this._aimFor();
    this.saccadeIn -= dt;
    if (this.saccadeIn <= 0) {
      const r = this.rng;
      const far = r.next() < 0.18;                          // now and then a real look away
      this.gazeGoal.yaw = aim.yaw + (r.next() * 2 - 1) * (far ? 0.28 : 0.06);
      this.gazeGoal.pitch = aim.pitch + (r.next() * 2 - 1) * (far ? 0.12 : 0.035);
      this.saccadeIn = (far ? 0.5 : 0.7) + r.next() * (far ? 0.6 : 2.2);
      this._backTo = far ? this.time + 0.35 + r.next() * 0.5 : 0;
    } else {
      // Between jumps the eyes follow the target smoothly (pursuit), keeping the last jump's offset.
      if (this._backTo && this.time > this._backTo) { this.gazeGoal.yaw = aim.yaw; this.gazeGoal.pitch = aim.pitch; this._backTo = 0; }
      const oy = this.gazeGoal.yaw - (this._aim0 ? this._aim0.yaw : aim.yaw), op = this.gazeGoal.pitch - (this._aim0 ? this._aim0.pitch : aim.pitch);
      this.gazeGoal.yaw = aim.yaw + oy; this.gazeGoal.pitch = aim.pitch + op;
    }
    this._aim0 = aim;
    // A saccade takes about 40 ms: close most of the distance every frame.
    const kg = Math.min(1, dt * 26);
    this.gaze.yaw += (Math.max(-0.6, Math.min(0.6, this.gazeGoal.yaw)) - this.gaze.yaw) * kg;
    this.gaze.pitch += (Math.max(-0.42, Math.min(0.38, this.gazeGoal.pitch)) - this.gaze.pitch) * kg;
    // Looking down, the upper lid follows the eye down a little (it does, and without it a downcast look stares).
    const lidFollow = Math.max(0, -this.gaze.pitch) * 1.2;

    if (this.held) {
      for (const k of MHF_KEYS) c[k] = this.held[k] || 0;
      this.blinkW = this.held.blink || 0;
      if (this.held.yaw != null) this.gaze.yaw = this.held.yaw;
      if (this.held.pitch != null) this.gaze.pitch = this.held.pitch;
    }
    this._lidFollow = this.held ? 0 : lidFollow;

    let headAny = this.blinkW > 1e-3 || this._lidFollow > 0.02;
    for (const k of MHF_KEYS) if (Math.abs(c[k]) > 1e-3) headAny = true;
    const eyesAny = Math.abs(this.gaze.yaw) > 0.004 || Math.abs(this.gaze.pitch) > 0.004 || c.jaw > 1e-3;
    const h = this.head;
    if (!this.enabled || !h || h.dead || h.visible === false) { if (this._priv) this._release(true, true); return; }
    if (!headAny) this._idle += dt; else this._idle = 0;
    if (!eyesAny) this._eyeIdle += dt; else this._eyeIdle = 0;
    if (!this._near()) { if (this._priv) this._release(true, true); return; }
    if (this._idle > 0.25 && this._priv && this._priv.headIn) this._release(true, false);
    if (this._eyeIdle > 0.25 && this._priv && this._priv.eyesIn) this._release(false, true);
    if (!headAny && !eyesAny) return;
    this._acquire();
    if (headAny) this._applyHead(); else if (this._priv.headIn) this._release(true, false);
    if (eyesAny || headAny) this._applyEyes();
  }

  _near() {
    const cam = this.engine.camera, m = this.head.matrix && this.head.matrix.e;
    if (!cam || !m) return true;
    const p = cam.position || cam.pos;
    if (!p) return true;
    return Math.hypot(m[12] - p.x, m[13] - p.y, m[14] - p.z) < MHF_NEAR;
  }

  /* Private copies of the two close levels of detail, and of the eye mesh (eyes and teeth). */
  _acquire() {
    const h = this.head;
    if (!this._shared) this._shared = { mesh: h.mesh, lods: h.lods, eyes: this.eyes ? this.eyes.mesh : null };
    if (this._priv) return;
    const E = this.engine, gl = this.gl;
    const geoOf = (m) => (E._geoByKey && E._geoByKey.get(m.__key)) || null;
    const S = this._shared;
    const tiers = S.lods ? S.lods.slice(0, 2) : [{ mesh: S.mesh, from: 0 }];
    const mk = (geo, tag) => {
      const gm = new GpuMesh(gl, geo);
      gm.__key = 'mhface:' + (MhFace._uid = (MhFace._uid || 0) + 1) + tag;
      gm.setupInstancing(20);
      return gm;
    };
    const levels = [];
    for (const t of tiers) {
      const geo = geoOf(t.mesh);
      if (!geo || !geo.sdf) continue;
      /* One rig per head GEOMETRY, not per face: it depends on nothing else, and every soldier or
         militiaman who shares a head was building the same rig again the first time he blinked --
         up to two seconds a time on a slow CPU, mid-scene. */
      const rig = geo.__mhRig || (geo.__mhRig = buildMhFaceRig(geo, levels.length ? levels[0].rig : null));
      levels.push({ geo, rig, gm: null, work: new Float32Array(geo.positions), nrm: new Float32Array(geo.normals), from: t.from, restN: null });
    }
    let eyesL = null;
    if (this.eyes && S.eyes && levels.length) {
      const eg = geoOf(S.eyes);
      if (eg) {
        // Which eye each eyeball vertex belongs to, and where its centre is (units).
        const nE = eg._teeth != null ? eg._teeth : eg.positions.length / 3, side = new Int8Array(nE);
        for (let v = 0; v < nE; v++) side[v] = eg.positions[v * 3] < 0 ? -1 : 1;
        const cen = {};
        for (const lid of levels[0].rig.lids) cen[lid.side] = lid.c;
        eyesL = { geo: eg, gm: null, work: new Float32Array(eg.positions), nrm: new Float32Array(eg.normals), nE, side, cen };
      }
    }
    this._priv = { levels, eyes: eyesL, headIn: false, eyesIn: false, mk };
  }

  _swapHead() {
    const h = this.head, S = this._shared, P = this._priv, L = P.levels;
    if (!L.length || P.headIn) return;
    for (const l of L) if (!l.gm) l.gm = P.mk(l.geo, ':h');
    if (S.lods) {
      const lods = S.lods.map((o) => ({ mesh: o.mesh, from: o.from }));
      for (let i = 0; i < L.length; i++) lods[i].mesh = L[i].gm;
      h.lods = lods;
    }
    h.mesh = L[0].gm;
    P.headIn = true;
  }

  _swapEyes() {
    const P = this._priv;
    if (!P.eyes || P.eyesIn) return;
    if (!P.eyes.gm) P.eyes.gm = P.mk(P.eyes.geo, ':e');
    this.eyes.mesh = P.eyes.gm;
    P.eyesIn = true;
  }

  _release(head = true, eyes = true) {
    const h = this.head, S = this._shared, P = this._priv;
    if (!S || !P) return;
    if (head && P.headIn) { h.mesh = S.mesh; h.lods = S.lods; P.headIn = false; }
    if (eyes && P.eyesIn && this.eyes && S.eyes) { this.eyes.mesh = S.eyes; P.eyesIn = false; }
    // The private meshes are kept for next time; only the draw goes back to the shared one.
  }

  /* The deformed head for the current controls, its normals, uploaded. */
  _applyHead() {
    this._swapHead();
    const gl = this.gl, c = this.ctl;
    // The lid following a downward look rides on the blink (a partial close of the upper lid only).
    const blink = Math.min(1, this.blinkW + (this._lidFollow || 0) * 0.35);
    for (const L of this._priv.levels) {
      mhFaceDeform(L.rig, L.geo.positions, c, blink, L.work);
      this._normals(L);
      gl.bindBuffer(gl.ARRAY_BUFFER, L.gm.buffers[0]);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, L.work);
      gl.bindBuffer(gl.ARRAY_BUFFER, L.gm.buffers[1]);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, L.nrm);
    }
  }

  /* The eyes turned to their gaze about their own centres, and the lower teeth (and tongue) on the jaw. */
  _applyEyes() {
    const E = this._priv.eyes;
    if (!E) return;
    this._swapEyes();
    const gl = this.gl, c = this.ctl, B = E.geo.positions, BN = E.geo.normals, Q = E.work, N = E.nrm;
    Q.set(B); N.set(BN);
    const yaw = this.gaze.yaw, pitch = this.gaze.pitch;
    if (Math.abs(yaw) + Math.abs(pitch) > 1e-4) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      for (let v = 0; v < E.nE; v++) {
        const ce = E.cen[E.side[v]];
        if (!ce) continue;
        const i = v * 3;
        for (const [A, o] of [[Q, ce], [N, null]]) {
          let x = A[i] - (o ? o[0] : 0), y = A[i + 1] - (o ? o[1] : 0), z = A[i + 2] - (o ? o[2] : 0);
          // Pitch about x (up is +), then yaw about y (toward +x is +).
          const y1 = y * cp + z * sp, z1 = -y * sp + z * cp;
          const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
          A[i] = x2 + (o ? o[0] : 0); A[i + 1] = y1 + (o ? o[1] : 0); A[i + 2] = z2 + (o ? o[2] : 0);
        }
      }
    }
    const jawA = Math.max(0, Math.min(1.1, c.jaw)) * MHF_JAW_MAX;
    const lt = E.geo._lowerTeeth;
    if (jawA > 1e-4 && lt) {
      const R = this._priv.levels[0].rig, hy = R.hinge[0], hz = R.hinge[1], cj = Math.cos(jawA), sj = Math.sin(jawA);
      for (let i = 0; i < lt.length; i++) {
        const v = lt[i] * 3, dy = Q[v + 1] - hy, dz = Q[v + 2] - hz;
        Q[v + 1] = hy + dy * cj - dz * sj;
        Q[v + 2] = hz + dy * sj + dz * cj;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, E.gm.buffers[0]);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, Q);
    gl.bindBuffer(gl.ARRAY_BUFFER, E.gm.buffers[1]);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, N);
  }

  /* Normals: the rest normals plus how much the face has turned since rest. Only the moved skin
     changes, and the neck edge -- whose normals are the body's, not the head's -- keeps them exactly. */
  _normals(L) {
    const R = L.rig;
    if (!R.touch) {
      // Every vertex any control can move, their neighbours, and the triangles round them: done once.
      const moved = new Uint8Array(R.n);
      for (const k in R.D) { const d = R.D[k]; for (let i = 0; i < d.length; i += 4) moved[d[i]] = 1; }
      for (let i = 0; i < R.jaw.length; i += 2) moved[R.jaw[i]] = 1;
      for (const lid of R.lids) for (let i = 0; i < lid.rot.length; i += 2) moved[lid.rot[i]] = 1;
      const I = L.geo.indices, tris = [], touched = new Uint8Array(R.n);
      for (let t = 0; t < I.length; t += 3) if (moved[I[t]] || moved[I[t + 1]] || moved[I[t + 2]]) { tris.push(t); touched[I[t]] = touched[I[t + 1]] = touched[I[t + 2]] = 1; }
      const vs = [];
      for (let v = 0; v < R.n; v++) if (touched[v]) vs.push(v);
      R.touch = { tris: new Int32Array(tris), verts: new Int32Array(vs) };
    }
    if (!L.restN) L.restN = this._faceNormals(L.geo.positions, L.geo.indices, R.touch, new Float32Array(R.n * 3));
    const now = L.nowN || (L.nowN = new Float32Array(R.n * 3));
    this._faceNormals(L.work, L.geo.indices, R.touch, now);
    const N = L.nrm, B = L.geo.normals, rest = L.restN;
    for (const v of R.touch.verts) {
      const i = v * 3;
      let x = B[i] + now[i] - rest[i], y = B[i + 1] + now[i + 1] - rest[i + 1], z = B[i + 2] + now[i + 2] - rest[i + 2];
      const l = Math.hypot(x, y, z) || 1;
      N[i] = x / l; N[i + 1] = y / l; N[i + 2] = z / l;
    }
  }

  _faceNormals(Q, I, T, out) {
    for (const v of T.verts) { out[v * 3] = 0; out[v * 3 + 1] = 0; out[v * 3 + 2] = 0; }
    for (const t of T.tris) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = Q[b] - Q[a], uy = Q[b + 1] - Q[a + 1], uz = Q[b + 2] - Q[a + 2];
      const vx = Q[c] - Q[a], vy = Q[c + 1] - Q[a + 1], vz = Q[c + 2] - Q[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      out[a] += nx; out[a + 1] += ny; out[a + 2] += nz;
      out[b] += nx; out[b + 1] += ny; out[b + 2] += nz;
      out[c] += nx; out[c + 1] += ny; out[c + 2] += nz;
    }
    for (const v of T.verts) {
      const i = v * 3, l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
      out[i] /= l; out[i + 1] /= l; out[i + 2] /= l;
    }
    return out;
  }

  /* For tests and tools: the head's positions as they are this frame (units, the geometry's frame). */
  positionsNow(level = 0) {
    return this._priv && this._priv.levels[level] ? this._priv.levels[level].work : null;
  }
}
