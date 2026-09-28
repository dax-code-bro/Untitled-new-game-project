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
  const V = new Float32Array(bytes(MH_HEAD.V).buffer);
  const Q = new Uint16Array(bytes(MH_HEAD.Q).buffer);
  const T = {};
  for (const k in MH_HEAD.T) {
    const [n, b64] = MH_HEAD.T[k];
    const u = bytes(b64);
    T[k] = { n, idx: new Uint16Array(u.buffer, 0, n), d: new Int16Array(u.buffer.slice(n * 2)) };
  }
  // Faces as index lists: a triangle was padded to four by repeating its last corner.
  const F = [];
  for (let i = 0; i < Q.length; i += 4) {
    const f = [Q[i], Q[i + 1], Q[i + 2], Q[i + 3]];
    F.push(f[3] === f[2] ? f.slice(0, 3) : f);
  }
  _mhData = { V, F, T, EL: MH_HEAD.EL, ER: MH_HEAD.ER };
  return _mhData;
}

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
  for (const k of ['african', 'asian', 'caucasian']) add(`${k}-${sx}-young`, anc[k] || 0);
  if (opts.age != null) pair('head-age', Math.max(-1, Math.min(1, (opts.age - 25) / 35)), 0.8);
  if (T === 'heavy') add('head-fat-incr', 0.45);

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
        const o = bnd.slice(0, 2).map((e) => P[(e.a === v ? e.b : e.a) * 3 + k]);
        out[v * 3 + k] = (6 * p + o[0] + o[1]) / 8;
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

function makeMhHeadGeometry(opts = {}) {
  const D = _mhDecode();
  const T = opts.type || 'male';
  const fem = T === 'female' ? 1 : 0, heavy = T === 'heavy' ? 1 : 0;
  let P = Float32Array.from(D.V);
  const W = _mhWeights(opts);
  for (const k in W) {
    const t = D.T[k], w = W[k];
    if (!t || !w) continue;
    for (let i = 0; i < t.n; i++) {
      const v = t.idx[i] * 3;
      P[v] += t.d[i * 3] * w / 5000; P[v + 1] += t.d[i * 3 + 1] * w / 5000; P[v + 2] += t.d[i * 3 + 2] * w / 5000;
    }
  }
  // Into the field head's frame: eyeball centres at (+-0.0318, 0.011, 0.0745) m.
  const cen = (idx) => { const c = [0, 0, 0]; for (const i of idx) for (let k = 0; k < 3; k++) c[k] += P[i * 3 + k] / idx.length; return c; };
  const eL = cen(D.EL), eR = cen(D.ER);
  const mid = [(eL[0] + eR[0]) / 2, (eL[1] + eR[1]) / 2, (eL[2] + eR[2]) / 2];
  const s = 0.0636 / Math.abs(eL[0] - eR[0]);
  const F0 = (opts.face || {});
  // A squarer or heavier head a little wider, a woman's a little narrower -- a few per cent, no more.
  const wide = 1 + ((F0.boxy != null ? F0.boxy : 0.75) - 0.75) * 0.04 + heavy * 0.02 - fem * 0.015;
  /* 2.7 cm further forward than the field head's eyes: a real neck is 12 cm behind the eyeballs, and
     the field head's was 9.5 -- the body's neck (94c) is built round that axis, and with the eyes left
     where they were its top stood out under the jaw as a lump. Everything that fits to the head (the
     helmet, the painted hair, the shells) measures the head's own points, so it follows. */
  const MH_FWD = 0.027;
  for (let i = 0; i < P.length; i += 3) {
    P[i] = (P[i] - mid[0]) * s * wide;
    P[i + 1] = (P[i + 1] - mid[1]) * s + 0.011;
    P[i + 2] = (P[i + 2] - mid[2]) * s + 0.0745 + MH_FWD;
  }
  const EYE = [Math.abs(eL[0] - eR[0]) * s * wide / 2, 0.011, 0.0745 + MH_FWD];
  /* THE NECK, INTO THE COLLAR. The mesh stops 15 cm under the eyes, where the back of a real neck
     already turns into the trapezius; below that it is carried on as a tube, extruded straight down
     from its own open edge in four rings to 30 cm under the eyes and eased round, about the neck's
     axis, to 5.8 cm -- inside the collar, where the shirt covers where it goes. */
  let F = D.F.slice();
  {
    const nv0 = P.length / 3;
    const next = new Int32Array(nv0).fill(-1);
    const ek = new Set();
    for (const f of F) for (let j = 0; j < f.length; j++) { const a = f[j], b = f[(j + 1) % f.length]; ek.add(a * 65536 + b); }
    for (const f of F) for (let j = 0; j < f.length; j++) {
      const a = f[j], b = f[(j + 1) % f.length];
      if (!ek.has(b * 65536 + a) && P[a * 3 + 1] < -0.10 && P[b * 3 + 1] < -0.10) next[a] = b;
    }
    const loop = [];
    let start = -1;
    for (let v = 0; v < nv0; v++) if (next[v] >= 0) { start = v; break; }
    for (let v = start, guard = 0; v >= 0 && guard < 4000; guard++) { loop.push(v); v = next[v]; if (v === start) break; }
    if (loop.length > 8) {
      const RINGS = 4, zc = -0.014, out = Array.from(P);
      let prev = loop;
      for (let r = 1; r <= RINGS; r++) {
        const t = r / RINGS, ring = [];
        for (const v of loop) {
          const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
          const dz = z - zc, rad = Math.hypot(x, dz) || 1e-6, k = 1 + (0.058 / rad - 1) * _ss(0, 1, t);
          ring.push(out.length / 3);
          out.push(x * k, y + (-0.30 - y) * t, zc + dz * k);
        }
        for (let i = 0; i < loop.length; i++) {
          const j = (i + 1) % loop.length;
          F.push([prev[j], prev[i], ring[i], ring[j]]);
        }
        prev = ring;
      }
      P = new Float32Array(out);
    }
  }

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
  // The chin: the lowest point of the midline still well forward -- under it the jaw turns back into the throat.
  let chinY = mouth[1];
  for (let v = 0; v < nv; v++) if (Math.abs(P[v * 3]) < 0.008 && P[v * 3 + 2] > mouth[2] - 0.028 && P[v * 3 + 1] < chinY) chinY = P[v * 3 + 1];
  const nW = 1 + ((F0.noseWide != null ? F0.noseWide : 1) - 1) * 0.5;
  const full = _headFinish(g, { EYE, EYE_R: 0.0120, tip, mouthY: mouth[1], nW, fem, lipZ: mouth[2] + 0.004, chinY }, opts);
  const out = _mhSplitNeck(full);
  out.mh = true;
  return out;
}

/* THE NECK IS NOT PART OF THE HEAD. The head rides the head bone rigidly;
   a neck has to bend with the neck bones and run down into the collar, or
   it swings out of the shirt the moment he looks up. So the finished mesh
   (coloured, painted, measured as one) is cut along the line of the jaw --
   under the chin in front, the base of the skull behind -- and the part
   below becomes `mhNeck`, which Engine.character skins to the head, neck
   and chest bones in place of the body's own neck (94c). The cut's
   vertices are in both, weighted wholly to the head bone in the neck, so
   the two meet exactly in every pose. `below` is each neck vertex's depth
   under the cut, in metres, for those weights. */
/* The line of the jaw, in metres in the head's frame: under the chin in front, the base of the skull behind. */
function _mhCutY(z) { return -0.100 - 0.45 * (Math.max(-0.06, Math.min(0.10, z)) + 0.06); }

function _mhSplitNeck(src) {
  const S = SDF_HEAD_TO_UNITS;
  const P = src.positions, n = P.length / 3;
  const cutY = _mhCutY;
  const below = new Float32Array(n);
  for (let v = 0; v < n; v++) below[v] = cutY(P[v * 3 + 2] / S) - P[v * 3 + 1] / S;
  const I = src.indices;
  const pick = (neck) => {
    const map = new Int32Array(n).fill(-1);
    const g = new Geometry();
    g.part = PART.NECK;
    g.colors = [];
    const dep = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const isNeck = below[a] > 0 || below[b] > 0 || below[c] > 0;
      if (isNeck !== neck) continue;
      const q = [a, b, c].map((v) => {
        if (map[v] < 0) {
          map[v] = g.positions.length / 3;
          g.positions.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
          g.normals.push(src.normals[v * 3], src.normals[v * 3 + 1], src.normals[v * 3 + 2]);
          g.uvs.push(src.uvs[v * 2], src.uvs[v * 2 + 1]);
          g.parts.push(PART.NECK);
          if (src.colors) g.colors.push(src.colors[v * 3], src.colors[v * 3 + 1], src.colors[v * 3 + 2]); else g.colors.push(1, 1, 1);
          dep.push(Math.max(0, below[v]));
        }
        return map[v];
      });
      g.tri(q[0], q[1], q[2]);
    }
    g.finalize();
    g.below = new Float32Array(dep);
    return g;
  };
  const head = pick(false);
  for (const k of ['headBounds', 'eyes', 'sdf']) head[k] = src[k];
  head.mhNeck = pick(true);
  return head;
}
