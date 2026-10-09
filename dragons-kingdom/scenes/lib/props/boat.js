// The prologue vessel: a small, unremarkable double-ended clinker boat under one square sail
// (fictional world, 1400s-ish material culture: a coastal fishing / carrying boat of the kind
// built round the northern seas for centuries). PROVISIONAL design.
//
//   ~9.6 m long, 2.7 m beam, 1.1 m deep amidships; seven strakes a side, each plank lapped over
//   the one below and clenched with iron nails (heads outside, roves inside); scarfed plank
//   lengths; a keel running into curved stem and stern posts (pointed at both ends); frames,
//   risers, four thwarts, loose floorboards; a side rudder on the starboard quarter with its
//   tiller; one mast stepped just forward of amidships; a yard with a parrel; a square wool
//   sail (shape baked by cloth simulation: offline/sail.py) with tablings, seams, two rows of
//   reef points and a bolt rope; shrouds set up with lanyards, a forestay, halyard, braces,
//   tack, sheet and a bowline; oars, a water keg, a bailer, rope coils, a chest, bundles.
//
//   const boat = await prologueBoat(ctx, { brace: -0.35, sail: 'prologue_full' });
//   scene.add(boat.root);       // local frame: +x bow, +y up, +z starboard, y = 0 design waterline
//
// The hull material darkens and goes wet below a waterline at WORLD y = 0 (the sea level of the
// scenes); pass { waterline: y } to move it.
import * as THREE from 'three';
import { Builder, Kit, box, tube, lathe, sagLine, laidRope, clamp, smooth, hash, rng, frame, fp, axisFrame, loadCache } from './core.js';
import { propMaterials, clothMaterial } from './materials.js';
import { squareSail } from './cloth.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ hull --
/** The hull's lines: P(s, g) on the moulded (inside-of-planking) surface; s -1 stern .. 1 bow, g 0 keel .. 1 sheer. */
export function hullLines(o = {}) {
  const L = o.length ?? 9.6, Bm = (o.beam ?? 2.7) / 2;
  const NS = o.stations ?? 160, NT = 96;
  const half = L / 2;
  const halfBreadth = (s) => Bm * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.15)), 0.6);
  const keelY = (s) => (o.keelY ?? -0.62) + 0.16 * Math.pow(Math.abs(s), 3);
  const sheerY = (s) => (o.sheerY ?? 0.5) + (o.sheerSpring ?? 0.34) * Math.pow(Math.abs(s), 2.4);
  // the ends: the keel stops short (forefoot), the planks land on a raked, curved post
  const xEnd = (g) => half * (0.8 + 0.2 * Math.pow(g, 0.62));
  // normalised section: cubic Bezier from the keel (0, 0) to the sheer (1, 1); fuller amidships,
  // a sharper V toward the ends, flaring topsides
  const bez = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
  const stations = [];
  for (let i = 0; i <= NS; i++) {
    const s = -1 + (2 * i) / NS, e = Math.pow(Math.abs(s), 1.6);
    const p1 = [0.62 + (0.32 - 0.62) * e, 0.05 + (0.24 - 0.05) * e];
    const p2 = [0.98 + (0.82 - 0.98) * e, 0.36 + (0.55 - 0.36) * e];
    const B = halfBreadth(s), yk = keelY(s), ys = sheerY(s), H = ys - yk;
    const pts = [], arc = [0];
    for (let k = 0; k <= NT; k++) {
      const t = k / NT;
      const z = B * bez(0, p1[0], p2[0], 1, t), y = yk + H * bez(0, p1[1], p2[1], 1, t);
      pts.push([z, y]);
      if (k) arc.push(arc[k - 1] + Math.hypot(z - pts[k - 1][0], y - pts[k - 1][1]));
    }
    stations.push({ s, B, yk, ys, pts, arc, G: arc[NT] });
  }
  // point on the moulded surface at station index i (fractional allowed), girth fraction g, side +1/-1
  const at = (st, g) => {
    const target = g * st.G;
    let k = 0;
    while (k < NT - 1 && st.arc[k + 1] < target) k++;
    const t = st.G > 1e-9 ? clamp((target - st.arc[k]) / Math.max(1e-9, st.arc[k + 1] - st.arc[k]), 0, 1) : g;
    const z = st.pts[k][0] + (st.pts[k + 1][0] - st.pts[k][0]) * t;
    const y = st.G > 1e-9 ? st.pts[k][1] + (st.pts[k + 1][1] - st.pts[k][1]) * t : st.yk + (st.ys - st.yk) * g;
    return [z, y];
  };
  const P = (i, g, side = 1) => {
    const st = stations[clamp(i, 0, NS)];
    const [z, y] = at(st, g);
    return V(st.s * xEnd(g), y, side * z);
  };
  // outward normal from finite differences
  const N = (i, g, side = 1) => {
    const i0 = clamp(i - 1, 0, NS), i1 = clamp(i + 1, 0, NS);
    const dS = P(i1, g, side).sub(P(i0, g, side));
    const g0 = clamp(g - 0.01, 0, 1), g1 = clamp(g + 0.01, 0, 1);
    const dG = P(i, g1, side).sub(P(i, g0, side));
    const n = new THREE.Vector3().crossVectors(dS, dG).normalize();
    if (n.z * side < 0 || (Math.abs(n.z) < 1e-3 && n.y > 0)) n.negate();
    if (!Number.isFinite(n.x) || n.lengthSq() < 0.5) return V(0, -1, 0);
    return n;
  };
  return { L, NS, stations, P, N, keelY, sheerY, halfBreadth, xEnd, half };
}

/** Half-breadth of the moulded surface at hull x, height y (for thwarts, floors, gear). */
function breadthAt(H, x, y) {
  let i = Math.round(((x / H.half) * 0.5 + 0.5) * H.NS);
  i = clamp(i, 0, H.NS);
  let best = 0;
  for (let k = 0; k <= 60; k++) {
    const p = H.P(i, k / 60, 1);
    if (p.y <= y) best = p.z;
  }
  // refine linear between samples
  for (let k = 0; k < 60; k++) {
    const a = H.P(i, k / 60, 1), b = H.P(i, (k + 1) / 60, 1);
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) return a.z + (b.z - a.z) * (y - a.y) / (b.y - a.y);
  }
  return best;
}

/**
 * Clinker planking: N strakes per side, each a real plank (outer face, inner face, the visible
 * lower edge with a worn chamfer, the sheer strake's top edge), scarfed into 2-3 lengths, iron
 * clench nails along the laps. Builders: kit 'hull' (planks), 'iron' (nails, roves).
 */
function planking(kit, H, o) {
  const NSTR = o.strakes ?? 7, T = o.plank ?? 0.022, LAP = o.lap ?? 0.034;
  const bOut = kit.get('hull'), bIn = kit.get('hullIn'), ib = kit.get('iron');
  const iA = Math.round(H.NS * 0.0), iB = H.NS;
  const rnd = rng(o.seed ?? 7);
  const rows = 7;
  for (const side of [-1, 1]) {
    for (let k = 0; k < NSTR; k++) {
      // scarfs: each strake is made of 2-3 lengths of plank
      const nS = 1 + Math.floor(rnd() * 2.2);
      const scarfs = [];
      for (let q = 0; q < nS; q++) scarfs.push(-0.55 + 1.1 * ((q + 0.5 + (rnd() - 0.5) * 0.6) / nS));
      const pieceOf = (s) => { let q = 0; while (q < scarfs.length && s > scarfs[q]) q++; return hash(k * 13 + q * 7 + (side > 0 ? 101 : 0), 5); };
      const g0n = k / NSTR, g1 = (k + 1) / NSTR;
      // girth geometry per station
      const prof = (i) => {
        const st = H.stations[i];
        const lapF = k > 0 ? Math.min(LAP / Math.max(st.G, 1e-6), 0.3 / NSTR) : 0;
        return { g0: g0n - lapF, g1, G: st.G };
      };
      const offIn = (w) => T * (1 - w), offOut = (w) => T * (1 - w) + T;
      // faces: outer (rows across the plank), inner, lower edge (+ chamfer)
      const faces = [
        { kind: 'out', rows }, { kind: 'in', rows: 3 }, { kind: 'edge', rows: 3 },
      ];
      if (k === NSTR - 1) faces.push({ kind: 'top', rows: 1 });
      for (const f of faces) {
        const b = f.kind === 'in' ? bIn : bOut;
        const base = b.count;
        const nr = f.rows;
        let prevPiece = null;
        const cols = [];
        for (let i = iA; i <= iB; i++) {
          const st = H.stations[i];
          const s = st.s;
          const piece = pieceOf(s);
          // duplicate the column at a scarf (sharp change of plank tone)
          if (prevPiece !== null && piece !== prevPiece) cols.push({ i, piece: prevPiece, seam: true });
          cols.push({ i, piece });
          prevPiece = piece;
        }
        for (const c of cols) {
          const { g0, G } = prof(c.i);
          for (let r = 0; r <= nr; r++) {
            let g, off, ao = 1, wear = 0;
            const f01 = r / nr;
            if (f.kind === 'out') {
              const w = f01;                                  // 0 lower edge .. 1 upper edge
              g = g0 + (g1 - g0) * w;
              off = offOut(w);
              if (r === 0) { off -= T * 0.35; g += 0.004 / Math.max(G, 0.2); wear = 1; }   // chamfered, worn lap edge
              ao = 1 - 0.45 * smooth(0.82, 1.0, w) * (k < NSTR - 1 ? 1 : 0);              // under the next plank's lap
            } else if (f.kind === 'in') {
              const w = 1 - f01;
              g = g0 + (g1 - g0) * w;
              off = offIn(w);
              ao = 0.62 - 0.2 * smooth(0.0, 0.2, w) * (k > 0 ? 1 : 0);
            } else if (f.kind === 'edge') {
              // from the chamfer at the foot of the outer face, round the worn arris, to the inner face
              const rowsE = [[0.004, 0.35], [0, 0.72], [0, 0.92], [0, 1.0]][r];
              g = g0 + rowsE[0] / Math.max(G, 0.2); off = offOut(0) - T * rowsE[1];
              ao = 0.75; wear = 0.8;
            } else {
              g = g1; off = f01 ? offIn(1) : offOut(1); ao = 0.9; wear = 0.7;
            }
            const p = H.P(c.i, clamp(g, 0, 1), side), n = H.N(c.i, clamp(g, 0, 1), side);
            p.addScaledVector(n, off);
            const u = H.stations[c.i].s * H.half;
            const v = (g - g0) * G + k * 0.31 + (side > 0 ? 7 : 0) + (f.kind === 'in' ? 3 : 0);
            b.v(p, u, v, c.piece, c.seam ? ao * 0.75 : ao, wear);
          }
        }
        const row = nr + 1;
        for (let c = 0; c < cols.length - 1; c++) {
          if (cols[c].seam) continue;       // the end of one plank length and the start of the next share a station
          for (let r = 0; r < nr; r++) {
            const a = base + c * row + r, a2 = a + row;
            const flip = f.kind === 'edge' ? side < 0 : side > 0;
            if (flip) b.q(a, a2, a2 + 1, a + 1); else b.q(a, a + 1, a2 + 1, a2);
          }
        }
      }
      // clench nails along the lap (heads outside on this plank's lapped lower edge; roves inside)
      if (k > 0) {
        for (let x = -H.half * 0.93; x <= H.half * 0.93; x += 0.165 + (rnd() - 0.5) * 0.02) {
          const i = Math.round(((x / H.half) * 0.5 + 0.5) * H.NS);
          const { g0, G } = prof(i);
          const gN = g0 + 0.5 * (LAP / Math.max(G, 1e-6)) * 0.9;
          const p = H.P(i, gN, side), n = H.N(i, gN, side);
          const head = p.clone().addScaledVector(n, offOut(0.03) - 0.001);
          const F = frame(head, n, Math.abs(n.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0));
          // a domed head: tiny lathe around the normal (frame y = normal: swap axes)
          const Fl = { o: F.o, x: F.z, y: F.x, z: F.y };
          const rr = 0.0075 + rnd() * 0.0015;
          lathe(ib, Fl, [[rr, -0.001], [rr, 0.0012], [rr * 0.75, 0.0035], [rr * 0.3, 0.0048], [0, 0.005]], { seg: 7, piece: rnd(), wear: (j) => (j > 2 ? 0.8 : 0.3) });
          // rove inside: a small square plate with the peened nail end
          const inner = p.clone().addScaledVector(n, -0.0015);
          const Fi = frame(inner, n.clone().negate(), V(1, 0, 0));
          box(ib, { o: Fi.o, x: Fi.z, y: Fi.x, z: Fi.y }, [0.022, 0.003, 0.022], { bevel: 0.001, seg: 0.05, piece: rnd() });
        }
      }
    }
  }
}

/** A swept rectangular timber along points with per-point "up" vectors (frames, risers, posts). */
function sweepRect(b, pts, ups, w, h, o = {}) {
  const n = pts.length;
  const T = [], X = [], Y = [];
  for (let i = 0; i < n; i++) {
    const t = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    let up = ups[i].clone(); up.addScaledVector(t, -up.dot(t)).normalize();
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    T.push(t); X.push(side); Y.push(up);
  }
  const wf = typeof w === 'function' ? w : () => w, hf = typeof h === 'function' ? h : () => h;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const L = [0]; for (let i = 1; i < n; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
  for (let f = 0; f < 4; f++) {
    const c0 = corners[f], c1 = corners[(f + 1) % 4];
    const base = b.count;
    for (let i = 0; i < n; i++) {
      const t = L[i] / Math.max(1e-9, L[n - 1]);
      const W = wf(t) / 2, Hh = hf(t) / 2;
      for (let r = 0; r <= 3; r++) {
        const a = r / 3;
        const cx = c0[0] + (c1[0] - c0[0]) * a, cy = c0[1] + (c1[1] - c0[1]) * a;
        const p = pts[i].clone().addScaledVector(X[i], cx * W).addScaledVector(Y[i], cy * Hh);
        b.v(p, L[i], a * 2 * (f % 2 ? Hh : W) + f * 0.3, o.piece ?? 0, o.ao ? o.ao(t, f) : 1, r === 0 || r === 3 ? 0.8 : 0);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let r = 0; r < 3; r++) {
      const a = base + i * 4 + r;
      b.q(a, a + 4, a + 5, a + 1);
    }
  }
  if (o.caps !== false) {
    for (const [i, s] of [[0, -1], [n - 1, 1]]) {
      const W = wf(i ? 1 : 0) / 2, Hh = hf(i ? 1 : 0) / 2;
      const q = corners.map(([cx, cy]) => b.v(pts[i].clone().addScaledVector(X[i], cx * W * 0.98).addScaledVector(Y[i], cy * Hh * 0.98), 50 + cx * W, cy * Hh, o.piece ?? 0, 0.9, 0.6));
      if (s > 0) b.q(q[0], q[3], q[2], q[1]); else b.q(q[0], q[1], q[2], q[3]);
    }
  }
}

// --------------------------------------------------------------- the boat --
/**
 * opts: { length 9.6, beam 2.7, brace (yard angle about the mast, rad; + turns the starboard arm
 * forward), sail ('prologue_full' | 'prologue_eased' | 'furled' | false), seed, crew: Object3D[],
 * gear (true), oars ('stowed' | false) }
 */
export async function prologueBoat(ctx, opts = {}) {
  const M = await propMaterials(ctx);
  const root = new THREE.Group(); root.name = 'prologue-boat';
  const H = hullLines(opts);
  const kit = new Kit();
  const rnd = rng(opts.seed ?? 3);
  planking(kit, H, opts);

  // keel, stem and stern posts: one curved timber line from the stem head to the stern head
  const wood = kit.get('oak');
  const keelB = kit.get('hull');
  {
    const pts = [], ups = [];
    const headRise = 0.55;
    // stern post (from its head down to the keel), keel, stem post (up to its head)
    const endLine = (sgn) => {
      const out = [];
      const i = sgn > 0 ? H.NS : 0;
      for (let k = 0; k <= 16; k++) {
        const g = k / 16;
        const p = H.P(i, g, 1); p.z = 0;
        p.x += sgn * 0.035;
        out.push(p);
      }
      // above the sheer: the post rises and curls back a little (plain, no carving)
      const top = out[out.length - 1];
      for (let k = 1; k <= 6; k++) {
        const f = k / 6;
        out.push(V(top.x + sgn * (0.16 * Math.sin(f * 1.6) - 0.1 * f * f), top.y + headRise * Math.sin(f * Math.PI / 2), 0));
      }
      return out;
    };
    const stern = endLine(-1).reverse(), stem = endLine(1);
    const keel = [];
    for (let k = 1; k < 30; k++) { const s = -0.79 + (1.58 * k) / 30; keel.push(V(s * H.half, H.keelY(s) - 0.045, 0)); }
    const line = [...stern, ...keel, ...stem];
    // smooth the joints
    const sm = new THREE.CatmullRomCurve3(line, false, 'centripetal').getSpacedPoints(140);
    for (let k = 0; k < sm.length; k++) {
      const t = sm[Math.min(sm.length - 1, k + 1)].clone().sub(sm[Math.max(0, k - 1)]).normalize();
      ups.push(new THREE.Vector3(0, 0, 1).cross(t).negate().normalize());
      pts.push(sm[k]);
    }
    // sided 0.11 (z) x moulded 0.15 m; slimmer at the heads
    sweepRect(keelB, pts, ups, (t) => 0.115 - 0.04 * Math.max(smooth(0.12, 0.0, t), smooth(0.88, 1.0, t)), (t) => 0.16 - 0.05 * Math.max(smooth(0.1, 0.0, t), smooth(0.9, 1.0, t)), { piece: 0.71, bevel: 0.012 });
  }

  // frames (ribs): floor timbers across the keel and futtocks up each side, notched over the laps
  const inner = kit.get('oak');
  const frameXs = [];
  for (let x = -3.4; x <= 3.5; x += 0.82) frameXs.push(x + (rnd() - 0.5) * 0.06);
  for (const x of frameXs) {
    const i = Math.round(((x / H.half) * 0.5 + 0.5) * H.NS);
    const pts = [], ups = [];
    for (const side of [-1, 1]) {
      const seq = [];
      for (let k = 0; k <= 22; k++) {
        const g = 0.02 + 0.93 * (k / 22);
        const p = H.P(i, g, side), n = H.N(i, g, side);
        p.addScaledVector(n, -0.045);
        seq.push([p, n.clone().negate()]);
      }
      if (side < 0) seq.reverse();
      for (const [p, u] of seq) { pts.push(p); ups.push(u); }
    }
    sweepRect(inner, pts, ups, 0.07, 0.085, { piece: rnd(), bevel: 0.01, ao: () => 0.75 });
  }
  // risers along each side carrying the thwarts, a gunwale (inwale) and cap rail
  const thwartY = (x) => H.sheerY(x / H.half) - 0.36;
  for (const side of [-1, 1]) {
    const rp = [], ru = [], gp = [], gu = [];
    for (let k = 0; k <= 40; k++) {
      const x = -3.7 + (7.4 * k) / 40;
      const y = thwartY(x) - 0.05;
      // (its outer face at its lower arris - where the flaring side is narrowest - stays inside the planking)
      const z = Math.min(breadthAt(H, x - 0.1, y - 0.03), breadthAt(H, x + 0.1, y - 0.03)) - 0.04;
      rp.push(V(x, y, side * z)); ru.push(V(0, 0, -side));
    }
    sweepRect(inner, rp, ru, 0.045, 0.06, { piece: rnd(), bevel: 0.006, ao: () => 0.8 });
    for (let k = 0; k <= 64; k++) {
      const s = -0.955 + (1.91 * k) / 64;
      const i = Math.round((s * 0.5 + 0.5) * H.NS);
      const p = H.P(i, 1, side), n = H.N(i, 1, side);
      gp.push(p.clone().addScaledVector(n, 0.012).add(V(0, 0.022, 0))); gu.push(V(0, 1, 0));
    }
    sweepRect(wood, gp, gu, 0.075, 0.045, { piece: rnd(), bevel: 0.01 });
  }
  // thwarts (with knees), mast thwart doubled as the mast partner
  const mastX = opts.mastX ?? 0.55;
  const thwarts = [-2.6, -1.0, mastX, 2.1];
  for (const x of thwarts) {
    const y = thwartY(x);
    // (the hull narrows toward the ends: the thwart's ends must clear it at its forward and after edges)
    const z = Math.min(breadthAt(H, x - 0.16, y - 0.01), breadthAt(H, x + 0.16, y - 0.01), breadthAt(H, x, y - 0.01)) - 0.035;
    const isMast = Math.abs(x - mastX) < 1e-6;
    box(inner, frame(V(x, y + 0.02, 0)), [isMast ? 0.3 : 0.24, 0.045, 2 * z], { grain: 'z', bevel: 0.006, piece: rnd(), noise: 0.002, nf: 3, ao: (a, bb) => (bb < 0 ? 0.6 : 1) });
    for (const side of [-1, 1]) {
      // a hanging knee under each thwart end
      const kp = [V(x, y - 0.0, side * (z - 0.22)), V(x, y - 0.07, side * (breadthAt(H, x, y - 0.07) - 0.075)), V(x, y - 0.25, side * (breadthAt(H, x, y - 0.25) - 0.065))];
      sweepRect(inner, new THREE.CatmullRomCurve3(kp).getPoints(8), Array(9).fill(V(1, 0, 0)), 0.05, 0.06, { piece: rnd(), bevel: 0.006, ao: () => 0.7 });
    }
  }
  // floorboards (loose, with gaps), between the frames' tops near the keel
  {
    const yF = H.keelY(0) + 0.24;
    for (let q = 0; q < 4; q++) {
      const z = (q - 1.5) * 0.235 + (rnd() - 0.5) * 0.01;
      const x0 = -3.0 + rnd() * 0.3, x1 = 2.6 - rnd() * 0.3;
      box(inner, frame(V((x0 + x1) / 2, yF + Math.abs(z) * 0.18, z), [1, 0, 0], [0, 1, -Math.sign(z) * 0.18]), [x1 - x0, 0.022, 0.215], { grain: 'x', bevel: 0.004, piece: rnd(), noise: 0.003, nf: 1.5, ao: (a, bb) => (bb < 0 ? 0.5 : 0.85) });
    }
  }
  // mast step block on the keel
  box(inner, frame(V(mastX, H.keelY(mastX / H.half) + 0.12, 0)), [0.9, 0.14, 0.2], { grain: 'x', bevel: 0.02, piece: rnd(), ao: () => 0.6 });

  // tholes (oar pins) with rope grommets
  const iron = kit.get('iron');
  const ropeB = kit.get('rope');
  const tholes = [];
  for (const side of [-1, 1]) for (const x of [-1.85, -0.25, 1.35]) {
    const s = x / H.half, i = Math.round((s * 0.5 + 0.5) * H.NS);
    const p = H.P(i, 1, side).addScaledVector(H.N(i, 1, side), 0.012).add(V(0, 0.045, 0));
    box(wood, frame(p.clone().add(V(0, 0.08, 0))), [0.035, 0.17, 0.035], { grain: 'y', bevel: 0.008, piece: rnd() });
    tholes.push(p);
    const gr = [];
    for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI * 2; gr.push(p.clone().add(V(Math.cos(a) * 0.035 - 0.03, 0.03 + 0.012 * Math.sin(a * 2), Math.sin(a) * 0.035))); }
    tube(ropeB, gr, 0.007, { sides: 5, closed: true, seg: 0.02 });
  }

  // side rudder on the starboard quarter: boss on the hull, blade, stock, withy, tiller
  {
    const x = -H.half * 0.77, s = x / H.half, i = Math.round((s * 0.5 + 0.5) * H.NS);
    const pSheer = H.P(i, 1, 1), n = H.N(i, 0.75, 1);
    const boss = H.P(i, 0.72, 1).addScaledVector(n, 0.11);
    box(wood, frame(boss, [1, 0, 0], n.clone().cross(V(1, 0, 0)).negate()), [0.36, 0.14, 0.2], { grain: 'x', bevel: 0.025, piece: rnd(), noise: 0.004 });
    const rud = new Builder();
    const top = pSheer.clone().add(V(0.05, 0.42, 0.2)), bot = boss.clone().add(V(-0.25, -1.55, 0.14));
    const RF = axisFrame(top, bot, [0, 0, 1]);
    // stock (round at the head, flattening into the blade)
    const prof = [];
    for (let k = 0; k <= 20; k++) {
      const t = k / 20;
      const width = t < 0.4 ? 0.1 : 0.1 + 0.32 * smooth(0.4, 0.75, t);
      const thick = t < 0.4 ? 0.095 : 0.095 - 0.04 * smooth(0.4, 0.7, t);
      prof.push([t, width, thick]);
    }
    const len = RF.len;
    const ptsR = prof.map(([t]) => fp(RF, -len / 2 + t * len, 0, 0));
    const upsR = prof.map(() => RF.y.clone());
    sweepRect(rud, ptsR, upsR, (t) => prof[Math.round(t * 20)][2], (t) => prof[Math.round(t * 20)][1], { piece: 0.55, bevel: 0.015 });
    const rm = new THREE.Mesh(rud.geometry(), M.wood.hull); rm.castShadow = rm.receiveShadow = true; rm.name = 'rudder';
    root.add(rm);
    // the tiller: socketed into the stock head, reaching inboard across the after thwart
    const tp = [top.clone().add(V(0.0, -0.06, 0)), top.clone().add(V(0.35, -0.08, -0.55)), top.clone().add(V(0.6, -0.12, -1.0))];
    tube(wood, tp, (t) => 0.03 - 0.008 * t, { sides: 8, seg: 0.05, caps: true, piece: rnd() });
    // the withy / rope lashing the stock to the boss
    const wy = []; const wc = boss.clone().add(V(-0.05, 0.02, 0.08));
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; wy.push(wc.clone().add(V(Math.cos(a) * 0.09, Math.sin(a) * 0.07, Math.sin(a) * 0.05 + 0.04))); }
    tube(ropeB, wy, 0.012, { sides: 6, closed: true, seg: 0.02 });
  }

  // ------------------------------------------------------------ the rig --
  const mastFoot = V(mastX, H.keelY(mastX / H.half) + 0.19, 0);
  const mastH = opts.mastHeight ?? 7.4;
  const mastTop = mastFoot.clone().add(V(-0.04, mastH, 0));
  const spar = kit.get('spar');
  tube(spar, [mastFoot, mastFoot.clone().lerp(mastTop, 0.5).add(V(0.01, 0, 0)), mastTop], (t) => 0.085 - 0.035 * t * t, { sides: 14, seg: 0.12, caps: true, piece: 0.33 });
  // masthead: a hounds block and the sheave slot for the halyard
  box(spar, frame(mastTop.clone().add(V(0, -0.35, 0))), [0.14, 0.24, 0.12], { grain: 'y', bevel: 0.02, piece: 0.34 });

  const yardY = mastFoot.y + mastH - 0.7;
  const yardL = opts.yardLength ?? 7.2;
  const brace = opts.brace ?? -0.35;
  const rig = new THREE.Group(); rig.name = 'rig';
  rig.position.set(mastX - 0.04 * ((yardY - mastFoot.y) / mastH) + 0.12, yardY, 0);
  rig.rotation.y = brace;
  root.add(rig);
  const rk = new Kit();
  // the yard (in rig space: along z, the sail hangs below it, its belly toward +x)
  const yardPts = [];
  for (let k = 0; k <= 10; k++) { const z = -yardL / 2 + (yardL * k) / 10; yardPts.push(V(0, 0.06 * Math.pow(Math.abs(z) / (yardL / 2), 2) * -1, z)); }
  tube(rk.get('spar'), yardPts, (t) => 0.075 - 0.04 * Math.pow(Math.abs(t - 0.5) * 2, 1.5), { sides: 12, seg: 0.1, caps: true, piece: 0.41 });
  // parrel: a rope round the mast with wooden trucks (beads), holding the yard to it
  {
    const mzRig = -0.12;               // the mast's centre in rig space (just aft of the yard)
    const pr = [];
    for (let k = 0; k <= 20; k++) { const a = Math.PI * 0.15 + (k / 20) * Math.PI * 1.7; pr.push(V(mzRig + Math.cos(a) * 0.1, 0.02, Math.sin(a) * 0.1)); }
    tube(rk.get('rope'), pr, 0.009, { sides: 5, seg: 0.02 });
    for (let k = 1; k < 8; k++) {
      const p = pr[Math.round((k / 8) * 20)];
      lathe(rk.get('spar'), frame(p.clone().add(V(0, -0.022, 0))), [[0, 0], [0.018, 0.004], [0.022, 0.022], [0.018, 0.04], [0, 0.044]], { seg: 8, piece: 0.5 + k * 0.01 });
    }
  }
  let sail = null;
  const sailName = opts.sail === undefined ? 'prologue_full' : opts.sail;
  if (sailName && sailName !== 'furled') {
    const data = await loadCache(`sail_${sailName}.json`);
    if (!data) throw new Error(`props: no sail bake cache/sail_${sailName}.json - run offline/sail.py (see props README)`);
    const sailMat = await clothMaterial(ctx, {
      name: 'sail-wool', scan: 'pbr/acg_fabric37', tile: [0.3, 0.3], normalScale: 0.8, detail: 0.5,
      color: opts.sailColor || [0.2, 0.17, 0.125], color2: opts.sailColor2 || [0.18, 0.155, 0.115],
      transmission: 0.32, forward: 2.0, roughness: 0.96, macro: 0.22, macroF: 0.35, pieceVar: 0.0,
      seams: { u: 0.62, w: 0.035 },
    });
    sail = squareSail(data, { material: sailMat, ropeMaterial: M.rope, patches: opts.patches || [[4.6, 2.9, 5.15, 3.45], [1.1, 4.1, 1.5, 4.45]] });
    // sail frame -> rig frame: sail x (across) -> rig -z, sail z (downwind) -> rig +x
    sail.group.rotation.y = Math.PI / 2;
    sail.group.position.set(0.04, -0.06, 0);
    rig.add(sail.group);
    // robands: little lashings round the yard every ~0.4 m
    const rb = rk.get('rope');
    for (let z = -yardL / 2 + 0.55; z <= yardL / 2 - 0.5; z += 0.42) {
      const lp = [];
      for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 2; lp.push(V(Math.cos(a) * 0.085 + 0.01, Math.sin(a) * 0.085 - 0.03, z + (k / 10) * 0.025)); }
      tube(rb, lp, 0.005, { sides: 4, seg: 0.015 });
    }
  } else if (sailName === 'furled') {
    // furled on the yard: a long lumpy roll of cloth, gaskets round it
    const fb = new Builder();
    const fp0 = [];
    for (let k = 0; k <= 30; k++) { const z = -yardL / 2 + 0.45 + ((yardL - 0.9) * k) / 30; fp0.push(V(0.04, -0.17 + 0.02 * Math.sin(k * 1.3), z)); }
    tube(fb, fp0, (t) => 0.16 * (0.75 + 0.25 * Math.sin(Math.PI * t)) * (1 + 0.12 * Math.sin(t * 40)), { sides: 12, seg: 0.06 });
    const wm = await clothMaterial(ctx, { name: 'sail-furled', scan: 'pbr/acg_fabric37', tile: [0.3, 0.3], color: [0.34, 0.29, 0.22], transmission: 0.05 });
    const fm = new THREE.Mesh(fb.geometry(), wm); fm.castShadow = fm.receiveShadow = true; rig.add(fm);
  }
  const rigMeshes = rk.build({ spar: M.wood.spar, rope: M.rope, iron: M.iron }, { name: 'rig' });
  rig.add(rigMeshes);

  // standing rigging: shrouds (lanyards to wooden blocks at the sheer), forestay; running rigging
  const ropeT = kit.get('ropeTar');
  const hounds = mastTop.clone().add(V(0, -0.45, 0));
  const sheerPt = (x, side, dy = 0.03) => { const s = x / H.half, i = Math.round((s * 0.5 + 0.5) * H.NS); return H.P(i, 1, side).addScaledVector(H.N(i, 1, side), 0.03).add(V(0, dy, 0)); };
  for (const side of [-1, 1]) for (const dx of [-0.55, -1.35]) {
    const foot = sheerPt(mastX + dx, side, 0.04);
    const blk = foot.clone().add(V(0.0, 0.45, -side * 0.02));
    tube(ropeT, sagLine(hounds.clone().add(V(0, 0, side * 0.07)), blk, 0.02, 12), 0.011, { sides: 6, seg: 0.1 });
    // a wooden block (heart) and the lanyard reeved between it and an eye on the gunwale
    box(wood, axisFrame(blk.clone().add(V(0, 0.06, 0)), blk.clone().add(V(0, -0.06, 0)), [side, 0, 0]), [0.14, 0.09, 0.05], { bevel: 0.018, piece: rnd(), grain: 'x' });
    for (const dz of [-0.02, 0, 0.02]) tube(kit.get('rope'), [blk.clone().add(V(dz, -0.05, 0)), foot.clone().add(V(dz * 0.6, 0.01, 0))], 0.0045, { sides: 4 });
  }
  const stemHead = V(H.half * 1.0 + 0.1, H.sheerY(1) + 0.35, 0);
  tube(ropeT, sagLine(hounds.clone().add(V(0.06, 0, 0)), stemHead, 0.05, 16), 0.012, { sides: 6, seg: 0.1 });
  // running rigging: computed in root space from the rig's pose
  root.add(rig); rig.updateMatrix(); rig.updateMatrixWorld(true);
  const R = (p) => p.clone().applyMatrix4(rig.matrix);
  const runK = kit.get('rope');
  // halyard: yard -> masthead sheave -> down aft of the mast to a cleat at the riser
  tube(runK, [R(V(-0.05, 0.08, 0)), mastTop.clone().add(V(0.02, -0.2, 0))], 0.01, { sides: 5 });
  tube(runK, sagLine(mastTop.clone().add(V(-0.07, -0.2, 0)), V(mastX - 0.3, thwartY(mastX) + 0.05, 0.25), 0.02, 10), 0.01, { sides: 5 });
  // braces from the yard arms aft
  const armP = R(V(0, -0.03, -yardL / 2 + 0.1)), armS = R(V(0, -0.03, yardL / 2 - 0.1));
  tube(runK, sagLine(armP, sheerPt(-3.3, -1, 0.05), 0.35, 16), 0.0085, { sides: 5 });
  tube(runK, sagLine(armS, sheerPt(-3.5, 1, 0.05), 0.45, 16), 0.0085, { sides: 5 });
  if (sail) {
    sail.group.updateMatrix();
    const S = (p) => p.clone().applyMatrix4(sail.group.matrix).applyMatrix4(rig.matrix);
    const clewL = S(sail.corners.clewL), clewR = S(sail.corners.clewR);
    // which clew is to windward (forward, toward the bow): the tack goes forward, the sheet aft
    const [tackC, sheetC] = clewL.x > clewR.x ? [clewL, clewR] : [clewR, clewL];
    const tSide = Math.sign(tackC.z) || -1;
    tube(runK, sagLine(tackC, sheerPt(3.2, tSide, 0.04), 0.06, 12), 0.011, { sides: 5 });
    tube(runK, sagLine(sheetC, sheerPt(-2.2, -tSide, 0.04), 0.1, 12), 0.011, { sides: 5 });
    // bowline: a bridle on the weather leech, led forward to the stem
    const lee = clewL.x > clewR.x ? 0 : 1;
    const l1 = S(sail.pointAt(lee, 0.35)), l2 = S(sail.pointAt(lee, 0.68));
    const bj = l1.clone().lerp(l2, 0.5).add(V(0.55, 0, -tSide * -0.1));
    tube(runK, [l1, bj], 0.007, { sides: 4 }); tube(runK, [l2, bj], 0.007, { sides: 4 });
    tube(runK, sagLine(bj, stemHead.clone().add(V(-0.1, -0.25, 0)), 0.18, 12), 0.008, { sides: 4 });
  }

  // ------------------------------------------------------------ gear --
  if (opts.gear !== false) {
    const gearK = kit;
    const yF = H.keelY(0) + 0.27;
    // four oars stowed fore and aft along the thwarts (port side)
    for (let q = 0; q < 4; q++) {
      const z = -0.62 + q * 0.09, y = thwartY(0) + 0.065 + (q % 2) * 0.035;
      const x0 = -2.6 + rnd() * 0.3, Lo = 3.9 + rnd() * 0.25;
      const op = [V(x0, y, z), V(x0 + Lo * 0.7, y + 0.01, z + 0.02), V(x0 + Lo, y + 0.02, z + 0.03)];
      tube(gearK.get('pale'), op, (t) => (t < 0.72 ? 0.024 : 0.024 - 0.008 * smooth(0.72, 0.78, t)), { sides: 8, seg: 0.1, caps: true, piece: rnd() });
      const bladeC = V(x0 + Lo - 0.42, y + 0.02, z + 0.03);
      box(gearK.get('pale'), frame(bladeC, [1, 0, 0], [0, 1, 0.5]), [0.75, 0.014, 0.13], { grain: 'x', bevel: 0.005, piece: rnd(), warp: (x, y2, z2) => [x, y2, z2 * (0.65 + 0.35 * smooth(-0.37, 0.2, x))] });
    }
    // a small water keg lashed by the mast, a bailer, a chest aft, coiled lines
    const keg = (c, rr, hh, piece) => {
      const prof = []; for (let k = 0; k <= 12; k++) { const t = k / 12; prof.push([rr * (0.86 + 0.14 * Math.sin(Math.PI * t)), t * hh]); }
      lathe(gearK.get('stave'), frame(c), prof, { seg: 20, piece, rFn: (r, y, a) => r * (1 + 0.012 * Math.cos(a * 18)) });
      for (const hy of [0.12, 0.88]) {
        const hp = []; for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; const rH = rr * (0.86 + 0.14 * Math.sin(Math.PI * hy)) + 0.006; hp.push(c.clone().add(V(Math.cos(a) * rH, hy * hh, Math.sin(a) * rH))); }
        tube(gearK.get('withy'), hp, 0.007, { sides: 5, closed: true, seg: 0.02, piece: piece + 0.1 });
      }
    };
    keg(V(mastX - 0.42, yF + 0.02, 0.28), 0.17, 0.42, 0.61);
    keg(V(mastX - 0.42, yF + 0.02, -0.12), 0.15, 0.38, 0.67);
    box(gearK.get('dark'), frame(V(-3.0, yF + 0.17, 0.15)), [0.62, 0.32, 0.4], { bevel: 0.012, seg: 0.15, piece: rnd(), ao: (x, y2) => (y2 < -0.1 ? 0.6 : 1) });
    for (const [x, z, rr] of [[1.2, 0.35, 0.2], [-1.6, -0.3, 0.17], [2.4, -0.25, 0.14]]) {
      // a coil of rope lying on the floorboards
      const cp = [];
      const turns = 7, h0 = yF + 0.012;
      for (let k = 0; k <= turns * 24; k++) { const a = (k / 24) * Math.PI * 2; const r0 = rr * (0.75 + 0.25 * (k / (turns * 24))) + 0.006 * Math.sin(a * 3); cp.push(V(x + Math.cos(a) * r0, h0 + 0.012 * Math.floor(k / 24) * 0.45 + 0.004 * Math.sin(a * 2), z + Math.sin(a) * r0 * 0.92)); }
      tube(gearK.get('rope'), cp, 0.011, { sides: 6, seg: 0.03 });
    }
    // bundles of cargo under a greased hide forward of the mast
    const hb = new Builder();
    for (let q = 0; q < 3; q++) {
      const c = V(1.5 + q * 0.42, yF + 0.17, (q - 1) * 0.12);
      const g = new THREE.SphereGeometry(0.3, 20, 14);
      const P = g.attributes.position;
      for (let k = 0; k < P.count; k++) {
        const x = P.getX(k), y = P.getY(k), z = P.getZ(k);
        const n = 1 + 0.08 * Math.sin(x * 19 + q) * Math.sin(z * 17) + 0.05 * Math.sin(y * 23 + x * 9);
        P.setXYZ(k, x * 1.1 * n, Math.max(-0.12, y * 0.62 * n), z * 1.25 * n);
      }
      g.computeVertexNormals();
      hb.addGeometry(g, 0.3 + q * 0.1, new THREE.Matrix4().makeTranslation(c.x, c.y, c.z));
    }
    const hm = new THREE.Mesh(hb.geometry(), M.leather); hm.castShadow = hm.receiveShadow = true; root.add(hm);
  }

  const meshes = kit.build({ hull: M.wood.hull, hullIn: M.wood.tar, oak: M.wood.oak, iron: M.iron, rope: M.rope, ropeTar: M.ropeTar, spar: M.wood.spar, pale: M.wood.pale, stave: M.wood.stave, withy: M.wood.withy, dark: M.wood.dark }, { name: 'boat' });
  root.add(meshes);
  if (opts.crew) for (const c of opts.crew) root.add(c);
  root.userData.tris = meshes.userData.tris;
  return {
    root, rig, sail, lines: H, mastX, yardY, thwartY, floorY: H.keelY(0) + 0.27,
    /** deck points for placing crew: on the floorboards at hull x, z */
    standAt: (x, z) => V(x, H.keelY(x / H.half) + 0.29 + Math.abs(z) * 0.2, z),
  };
}
