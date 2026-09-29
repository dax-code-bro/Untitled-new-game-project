/* =====================================================================
   A HEAD THAT IS A REAL HEAD
   ---------------------------------------------------------------------
   The field-built head (94d) is sixty-odd ellipsoids and cones blended
   together, and however its proportions are measured and corrected it
   reads as a sculpture of a person rather than a person: the things a
   face is recognised by -- the fold of an eyelid, the way a nostril wraps
   into the cheek, the edge of a lip, the planes of a cheekbone -- are not
   shapes a blend of blobs can make.

   So the living head is now the MakeHuman base mesh (hm08): a head
   modelled from real anatomy, released by its authors as CC0. Its data
   is extracted by tools/mh/extract_head.js into 94e-mh-head-data.js --
   the head and neck, and its morph targets for sex, ancestry, age and
   the shape of the head, nose, chin, mouth, cheeks and brow. Each
   character is a mix of those targets, so seven operators are seven
   different real faces rather than one face at seven sizes.

   It is placed in exactly the frame the field-built head used (eyeball
   centres at (+-0.0318, 0.011, 0.0745) m, chin near -0.107), so the
   painted hair and beards, the hair shells, the helmet fitting, the seat
   on the neck and every measurement downstream work unchanged; and it is
   finished by the same _headFinish (94d): skin colour, cavity bake,
   painted brows, beard and scalp, the eyeballs.
   ===================================================================== */

let _mhData = null;
function _mhDecode() {
  if (_mhData) return _mhData;
  const bytes = (s) => {
    if (typeof atob === 'function') { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(s, 'base64'));
  };
  const V = new Float32Array(bytes(MH_FIG.V).buffer);
  const Q = new Uint16Array(bytes(MH_FIG.Q).buffer);
  const T = {};
  for (const k in MH_FIG.T) {
    const [n, b64] = MH_FIG.T[k];
    const u = bytes(b64);
    T[k] = { n, idx: new Uint16Array(u.buffer, 0, n), d: new Int16Array(u.buffer.slice(n * 2)) };
  }
  // Faces as index lists: a triangle was padded to four by repeating its last corner.
  const F = [];
  for (let i = 0; i < Q.length; i += 4) {
    const f = [Q[i], Q[i + 1], Q[i + 2], Q[i + 3]];
    F.push(f[3] === f[2] ? f.slice(0, 3) : f);
  }
  const QS = new Uint16Array(bytes(MH_FIG.QS).buffer);
  const FS = [];
  for (let i = 0; i < QS.length; i += 4) {
    const f = [QS[i], QS[i + 1], QS[i + 2], QS[i + 3]];
    FS.push(F[i / 4].length === 3 ? f.slice(0, 3) : f);
  }
  _mhData = { V, F, FS, O: new Uint16Array(bytes(MH_FIG.O).buffer), UV: new Float32Array(bytes(MH_FIG.UV).buffer),
    T, J: MH_FIG.J, B: MH_FIG.B, W: bytes(MH_FIG.W), nBody: MH_FIG.nBody };
  return _mhData;
}

/* ONE FIGURE PER CHARACTER. The head (makeMhHeadGeometry) and the body
   (makeMhBodyGeometry, 94g) are cut from the same morphed mesh, so they
   meet vertex for vertex at the line of the jaw. Morphed once and kept. */
const _mhFigCache = new Map();
function _mhFigure(opts) {
  const key = JSON.stringify([opts.seed || 5, opts.type || 'male', opts.face || null, opts.skinColor != null ? opts.skinColor : null,
    opts.ancestry || null, opts.age != null ? opts.age : null, +(opts.build || 1).toFixed(3)]);
  let f = _mhFigCache.get(key);
  if (f) return f;
  const D = _mhDecode();
  const P = Float32Array.from(D.V);
  const W = _mhWeights(opts);
  for (const k in W) {
    const t = D.T[k], w = W[k];
    if (!t || !w) continue;
    for (let i = 0; i < t.n; i++) {
      const v = t.idx[i] * 3;
      P[v] += t.d[i * 3] * w / 5000; P[v + 1] += t.d[i * 3 + 1] * w / 5000; P[v + 2] += t.d[i * 3 + 2] * w / 5000;
    }
  }
  const cen = (name) => { const idx = D.J[name]; const c = [0, 0, 0]; for (const i of idx) for (let k = 0; k < 3; k++) c[k] += P[i * 3 + k] / idx.length; return c; };
  const J = {};
  for (const k in D.J) J[k] = cen(k);
  // The head's frame: eyeball centres at (+-0.0318, 0.011, 0.0745 + MH_FWD) m, a real 6.36 cm apart.
  const mid = [(J.eyeL[0] + J.eyeR[0]) / 2, (J.eyeL[1] + J.eyeR[1]) / 2, (J.eyeL[2] + J.eyeR[2]) / 2];
  const s = 0.0636 / Math.abs(J.eyeL[0] - J.eyeR[0]);
  const c = [0, 0.011, 0.0745 + MH_FWD];
  const toHF = (x, y, z) => [(x - mid[0]) * s + c[0], (y - mid[1]) * s + c[1], (z - mid[2]) * s + c[2]];
  // Which body faces are the head's: every corner on or above the line of the jaw.
  const headFace = D.F.map((fc) => fc.every((v) => { const h = toHF(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); return h[1] >= _mhCutY(h[2]); }));
  /* Normals over the WHOLE figure, and the vertices the head and body share: along the jaw both sides
     take these, so the join does not show as a change of shading either. */
  const nv = P.length / 3, N = new Float32Array(nv * 3), onHead = new Uint8Array(nv), onBody = new Uint8Array(nv);
  D.F.forEach((fc, i) => {
    for (const v of fc) (headFace[i] ? onHead : onBody)[v] = 1;
    for (let j = 1; j + 1 < fc.length; j++) {
      const a = fc[0], b = fc[j], cc = fc[j + 1];
      if (a === b || b === cc || a === cc) continue;
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[cc * 3] - P[a * 3], vy = P[cc * 3 + 1] - P[a * 3 + 1], vz = P[cc * 3 + 2] - P[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const v of [a, b, cc]) { N[v * 3] += nx; N[v * 3 + 1] += ny; N[v * 3 + 2] += nz; }
    }
  });
  const seam = new Uint8Array(nv);
  for (let v = 0; v < nv; v++) {
    const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1; N[v * 3] /= l; N[v * 3 + 1] /= l; N[v * 3 + 2] /= l;
    seam[v] = onHead[v] && onBody[v] ? 1 : 0;
  }
  f = { key, P, N, J, mid, s, c, toHF, headFace, seam };
  if (_mhFigCache.size > 32) _mhFigCache.delete(_mhFigCache.keys().next().value);
  _mhFigCache.set(key, f);
  return f;
}

/* 2.7 cm further forward than the field head's eyes: a real neck is 12 cm behind the eyeballs. */
const MH_FWD = 0.027;

/* The target mix for one character. `face` is the operators' sculpt table
   (OP_FACE, 95a) where there is one; each control is mapped onto the
   MakeHuman targets that do the same thing, and at modest strength --
   these are real faces, and a target pushed to its end is a caricature.
   Characters without a table (the survivors) get a small seeded mix. */
function _mhWeights(opts) {
  const T = opts.type || 'male';
  const fem = T === 'female';
  const W = {};
  const add = (name, w) => { if (w) W[name] = (W[name] || 0) + w; };
  const pair = (base, v, cap = 1) => {   // a signed control onto a decr/incr pair
    const w = Math.max(-cap, Math.min(cap, v));
    if (w > 0) add(base + '-incr', w); else if (w < 0) add(base + '-decr', -w);
  };
  // Sex and ancestry: the macro targets, as MakeHuman mixes them.
  const anc = opts.ancestry || _mhAncestryFromSkin(opts.skinColor, opts.seed || 5);
  const sx = fem ? 'female' : 'male';
  add(sx, 1);                                                    // the sex, averaged over ancestry (whole body)
  for (const k of ['african', 'asian', 'caucasian']) add(`${k}-${sx}`, anc[k] || 0);   // the face and neck
  if (opts.age != null) pair('head-age', Math.max(-1, Math.min(1, (opts.age - 25) / 35)), 0.8);
  /* Build: the operators' and survivors' `build` (1 average, 1.24 the heaviest) onto MakeHuman's
     muscle and weight targets; a heavy frame carries weight. */
  const bld = opts.build || 1;
  if (T === 'heavy') add(`build-${sx}-heavy`, 0.55);
  if (bld > 1.02) add(fem ? 'build-female-heavy' : 'build-male-muscle', Math.min(0.9, (bld - 1) * 3));
  if (bld < 0.98) add(`build-${sx}-thin`, Math.min(0.8, (1 - bld) * 4));

  const F = opts.face || null;
  const seed = opts.seed || 5;
  const rnd = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  if (F) {
    const g = (k, d) => (F[k] != null ? F[k] : d);
    const boxy = g('boxy', 0.75);
    if (boxy > 0.8) add('head-square', Math.min(0.8, (boxy - 0.8) * 1.0));
    if (boxy < 0.7) add('head-round', Math.min(0.7, (0.7 - boxy) * 1.6));
    const jaw = g('jaw', 0.135);
    if (jaw > 0.16) add('head-triangular', Math.min(0.6, (jaw - 0.16) * 6));
    add('chin-bones-incr', Math.max(0, g('jawSquare', 0)) * 0.5);
    pair('chin-prominent', (g('chin', 0.062) - 0.062) / 0.03, 0.8);
    pair('chin-width', (g('chinWide', 0.072) - 0.072) / 0.03, 0.8);
    pair('nose-scale-vert', (g('noseLen', 1) - 1) / 0.35, 0.8);
    pair('nose-scale-horiz', (g('noseWide', 1) - 1) / 0.45, 0.8);
    pair('nose-scale-depth', (g('noseBridge', 1) - 1) / 0.45, 0.8);
    add('nose-hump-incr', Math.max(0, g('noseHump', 0)) * 0.6);
    const cheek = (g('cheek', 0.019) - 0.019) / 0.025;
    pair('l-cheek-bones', cheek, 0.7); pair('r-cheek-bones', cheek, 0.7);
    const hollow = Math.min(0.6, g('malarHollow', 0) * 0.3);
    add('l-cheek-volume-decr', hollow); add('r-cheek-volume-decr', hollow);
    add('eyebrows-trans-forward', Math.min(0.6, g('browShelf', 0) * 0.5));
  } else {
    // A survivor: a little of everything, seeded, so no two are the same face.
    pair('nose-scale-vert', rnd(1) * 0.4); pair('nose-scale-horiz', rnd(2) * 0.4);
    pair('nose-hump', rnd(3) * 0.4); pair('chin-prominent', rnd(4) * 0.4);
    pair('chin-width', rnd(5) * 0.4); pair('mouth-scale-horiz', rnd(6) * 0.3);
    const c = rnd(7) * 0.4; pair('l-cheek-bones', c); pair('r-cheek-bones', c);
    const sh = rnd(8);
    if (sh > 0.3) add('head-square', (sh - 0.3) * 0.6); else if (sh < -0.3) add('head-oval', (-0.3 - sh) * 0.6);
  }
  return W;
}

/* Where nobody has said, a character's ancestry mix is guessed from the
   skin they were given -- a starting point for a crowd, not a claim about
   anyone: a mix, never a single target, and seeded so two people of the
   same tone do not share a face. */
function _mhAncestryFromSkin(skin, seed) {
  if (skin == null) return { caucasian: 1 };
  const r = ((skin >> 16) & 255) / 255, g = ((skin >> 8) & 255) / 255, b = (skin & 255) / 255;
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const s = (((seed * 7919) % 97) / 97);
  const af = Math.max(0, Math.min(0.85, (0.62 - L) / 0.35));
  const as = (1 - af) * (0.10 + 0.35 * s);
  return { african: af, asian: as, caucasian: 1 - af - as };
}

/* One level of Catmull-Clark: the base mesh is modelled to be smoothed,
   and at a few thousand faces a close-up would show its facets. Mixed
   quads and triangles in, quads out; open boundaries (the neck, the
   eyes, the mouth) keep their edge. */
function _mhSubdivide(P, F) {
  const nv = P.length / 3;
  const fp = new Float32Array(F.length * 3);
  F.forEach((f, i) => { for (const v of f) for (let k = 0; k < 3; k++) fp[i * 3 + k] += P[v * 3 + k] / f.length; });
  const edges = new Map();
  const ek = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);
  F.forEach((f, fi) => { for (let j = 0; j < f.length; j++) {
    const a = f[j], b = f[(j + 1) % f.length], k = ek(a, b);
    let e = edges.get(k); if (!e) { e = { a, b, f: [], id: -1 }; edges.set(k, e); }
    e.f.push(fi);
  } });
  const out = [];
  for (let i = 0; i < nv * 3; i++) out.push(0);
  // Edge points.
  let next = nv + F.length;
  for (const e of edges.values()) {
    e.id = next++;
    const p = [];
    for (let k = 0; k < 3; k++) {
      const m = (P[e.a * 3 + k] + P[e.b * 3 + k]) / 2;
      p.push(e.f.length === 2 ? (m * 2 + fp[e.f[0] * 3 + k] + fp[e.f[1] * 3 + k]) / 4 : m);
    }
    e.p = p;
  }
  // Vertex points.
  const vf = Array.from({ length: nv }, () => []), ve = Array.from({ length: nv }, () => []);
  F.forEach((f, fi) => { for (const v of f) vf[v].push(fi); });
  for (const e of edges.values()) { ve[e.a].push(e); ve[e.b].push(e); }
  for (let v = 0; v < nv; v++) {
    const bnd = ve[v].filter((e) => e.f.length !== 2);
    for (let k = 0; k < 3; k++) {
      const p = P[v * 3 + k];
      if (bnd.length >= 2) {
        // On an open edge the vertex stays where it is: the head's edge at the jaw is shared with the
        // body, which is not smoothed, and the edge's new midpoints then lie on the body's own edges.
        out[v * 3 + k] = p;
      } else if (vf[v].length) {
        const n = vf[v].length;
        let q = 0; for (const fi of vf[v]) q += fp[fi * 3 + k] / n;
        let r = 0; for (const e of ve[v]) r += (P[e.a * 3 + k] + P[e.b * 3 + k]) / 2 / ve[v].length;
        out[v * 3 + k] = (q + 2 * r + (n - 3) * p) / n;
      } else out[v * 3 + k] = p;
    }
  }
  for (let i = 0; i < F.length * 3; i++) out.push(fp[i]);
  for (const e of edges.values()) out.push(e.p[0], e.p[1], e.p[2]);
  const NF = [];
  F.forEach((f, fi) => { const c = nv + fi; for (let j = 0; j < f.length; j++) {
    const a = f[j], eN = edges.get(ek(a, f[(j + 1) % f.length])).id, eP = edges.get(ek(f[(j + f.length - 1) % f.length], a)).id;
    NF.push([a, eN, c, eP]);
  } });
  return { P: new Float32Array(out), F: NF };
}

/* THE FACE'S LANDMARKS, ONCE PER FIGURE: the tip of the nose, the line of the mouth, the chin, in
   the head frame (metres), off the figure's own vertices above the jaw cut. The head and the body
   both place the head by the chin, and each used to find it on its own mesh -- the head on its
   subdivided one, where the extra midpoints found a deeper crease in the mouth and so a lower chin.
   On SWAT's face that put the head 17 mm below where the body's neck was waiting for it. */
function _mhLandmarks(fig) {
  if (fig._lm) return fig._lm;
  const P = fig.P, n = P.length / 3;
  const H = new Float32Array(n * 3);
  const head = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    const h = fig.toHF(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
    H[v * 3] = h[0]; H[v * 3 + 1] = h[1]; H[v * 3 + 2] = h[2];
    head[v] = h[1] >= _mhCutY(h[2]) ? 1 : 0;
  }
  const D = _mhDecode();
  let tip = [0, 0, -1], hiY = -1e9;
  for (let v = 0; v < D.nBody; v++) {
    if (!head[v]) continue;
    if (H[v * 3 + 1] > hiY) hiY = H[v * 3 + 1];
    if (Math.abs(H[v * 3]) < 0.004 && H[v * 3 + 1] < 0 && H[v * 3 + 1] > -0.07 && H[v * 3 + 2] > tip[2]) tip = [0, H[v * 3 + 1], H[v * 3 + 2]];
  }
  let mouth = [0, tip[1] - 0.033, 1];
  for (let v = 0; v < D.nBody; v++) {
    const y = H[v * 3 + 1];
    if (head[v] && Math.abs(H[v * 3]) < 0.003 && y < tip[1] - 0.022 && y > tip[1] - 0.042 && H[v * 3 + 2] > 0.05 && H[v * 3 + 2] < mouth[2]) mouth = [0, y, H[v * 3 + 2]];
  }
  // The chin: the lowest point of the midline still well forward -- under it the jaw turns back into the throat.
  let chinY = mouth[1];
  for (let v = 0; v < D.nBody; v++) if (head[v] && Math.abs(H[v * 3]) < 0.008 && H[v * 3 + 2] > mouth[2] - 0.028 && H[v * 3 + 1] < chinY) chinY = H[v * 3 + 1];
  fig._lm = { H, tip, mouth, chinY, hiY };
  return fig._lm;
}

function makeMhHeadGeometry(opts = {}) {
  const D = _mhDecode();
  const T = opts.type || 'male';
  const fem = T === 'female' ? 1 : 0;
  const fig = _mhFigure(opts);
  const F0 = (opts.face || {});
  // The head's faces, in its own frame (metres, eyes at the field head's eyes).
  const map = new Int32Array(D.V.length / 3).fill(-1);
  const out0 = [];
  let F = [];
  D.F.forEach((fc, i) => {
    if (!fig.headFace[i]) return;
    F.push(fc.map((v) => {
      if (map[v] < 0) { map[v] = out0.length / 3; out0.push(...fig.toHF(fig.P[v * 3], fig.P[v * 3 + 1], fig.P[v * 3 + 2])); }
      return map[v];
    }));
  });
  let P = new Float32Array(out0);
  const EYE = [Math.abs(fig.J.eyeL[0] - fig.J.eyeR[0]) * fig.s / 2, 0.011, 0.0745 + MH_FWD];
  const n0 = P.length / 3, src0 = new Int32Array(n0);
  for (let v = 0; v < map.length; v++) if (map[v] >= 0) src0[map[v]] = v;

  // Close-ups are smoothed once; the distant levels of detail (95-engine asks by `resolution`) are not.
  if (!(opts.resolution > 0.003)) ({ P, F } = _mhSubdivide(P, F));

  const g = new Geometry();
  g.part = PART.NECK;
  const nv = P.length / 3;
  const N = new Float32Array(nv * 3);
  const tris = [];
  for (const f of F) for (let j = 1; j + 1 < f.length; j++) {
    const a = f[0], b = f[j], c = f[j + 1];
    if (a === b || b === c || a === c) continue;
    tris.push(a, b, c);
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { N[v * 3] += nx; N[v * 3 + 1] += ny; N[v * 3 + 2] += nz; }
  }
  // Along the jaw, the whole figure's normals (subdivision keeps the original vertices first).
  for (let v = 0; v < n0; v++) if (fig.seam[src0[v]]) { const w = src0[v]; N[v * 3] = fig.N[w * 3]; N[v * 3 + 1] = fig.N[w * 3 + 1]; N[v * 3 + 2] = fig.N[w * 3 + 2]; }
  /* ...and the points subdivision put BETWEEN them along the edge take the average of their two
     neighbours on it. Left with the head's own normals they tilted like an open rim, and in a band
     along the jaw line -- lowest, and so most in the light, at the front of the throat -- the neck
     showed a dark rectangle where the head met it. */
  if (nv > n0) {
    const ec = new Map(), key = (a, b) => (a < b ? a * nv + b : b * nv + a);
    for (let i = 0; i < tris.length; i += 3) for (let k = 0; k < 3; k++) { const q = key(tris[i + k], tris[i + (k + 1) % 3]); ec.set(q, (ec.get(q) || 0) + 1); }
    const bn = new Map();
    for (const [q, c] of ec) {
      if (c !== 1) continue;
      const a = Math.floor(q / nv), b = q % nv;
      (bn.get(a) || bn.set(a, []).get(a)).push(b);
      (bn.get(b) || bn.set(b, []).get(b)).push(a);
    }
    for (let pass = 0; pass < 2; pass++) for (const [v, nb] of bn) {
      if (v < n0) continue;
      let x = 0, y = 0, z = 0;
      for (const q of nb) { x += N[q * 3]; y += N[q * 3 + 1]; z += N[q * 3 + 2]; }
      const l = Math.hypot(x, y, z) || 1;
      N[v * 3] = x / l; N[v * 3 + 1] = y / l; N[v * 3 + 2] = z / l;
    }
  }
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1;
    // UVs 0..1 over the head, as the field head had them, so the skin material's uvScale means the same.
    g.vert(x, y, z, N[v * 3] / l, N[v * 3 + 1] / l, N[v * 3 + 2] / l, Math.atan2(x, z) / (2 * Math.PI) + 0.5, (y + 0.167) / 0.297);
  }
  for (let i = 0; i < tris.length; i += 3) g.tri(tris[i], tris[i + 1], tris[i + 2]);
  _fixUvSeams(g, 0, g.indices.length, 1);

  // Landmarks for the skin colouring: the tip of the nose, and the line of the mouth under it.
  let tip = [0, 0, -1];
  for (let v = 0; v < nv; v++) if (Math.abs(P[v * 3]) < 0.004 && P[v * 3 + 1] < 0 && P[v * 3 + 1] > -0.07 && P[v * 3 + 2] > tip[2]) tip = [0, P[v * 3 + 1], P[v * 3 + 2]];
  let mouth = [0, tip[1] - 0.033, 1];
  for (let v = 0; v < nv; v++) {
    const y = P[v * 3 + 1];
    if (Math.abs(P[v * 3]) < 0.003 && y < tip[1] - 0.022 && y > tip[1] - 0.042 && P[v * 3 + 2] > 0.05 && P[v * 3 + 2] < mouth[2]) mouth = [0, y, P[v * 3 + 2]];
  }
  // The chin: the figure's own (_mhLandmarks, metres like P here) -- the one the body places the head by.
  const chinY = _mhLandmarks(fig).chinY;
  const nW = 1 + ((F0.noseWide != null ? F0.noseWide : 1) - 1) * 0.5;
  const out = _headFinish(g, { EYE, EYE_R: 0.0120, tip, mouthY: mouth[1], nW, fem, lipZ: mouth[2] + 0.004, chinY }, opts);
  out.mh = true;
  out.mhFig = fig.key;
  return out;
}

/* The line of the jaw, in metres in the head's frame: under the chin in front, the base of the skull behind. */
function _mhCutY(z) { return -0.100 - 0.45 * (Math.max(-0.06, Math.min(0.10, z)) + 0.06); }
