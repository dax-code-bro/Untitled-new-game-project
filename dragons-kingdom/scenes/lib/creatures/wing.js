// Wing membrane (patagium) as a skinned sheet, built in the rest (spread) pose.
//
// Bat/pterosaur anatomy, which is what makes a membrane wing read as real:
//   propatagium   in front of the arm, shoulder -> wrist (taut leading edge)
//   chiropatagium between consecutive fingers, trailing edge scalloped
//                 (concave) between the finger tips
//   plagiopatagium from the last finger back to the body flank and hip,
//                 with a concave free trailing edge
// Every vertex is skinned to the bones of the edges that hold it, so the
// membrane follows the fingers when they spread or fold. Attributes:
//   aWing = (a, b, patch, billow): a = along the fingers / span, b = across,
//           patch id (0 pro, 1..3 chiro, 4 plagio), billow = 0 at the
//           bones .. 1 in the middle of a panel (drives camber in the shader)
//   aEdge = (distance to the nearest bone in metres, distance to the free
//           trailing edge in metres, side +1/-1, 0)

import { add, sub, scale, norm, cross, dot, len, lerp3, clamp, mix } from './sdf.js';
import { computeNormals } from './parts.js';

function polyAt(points, f) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + len(sub(points[i], points[i - 1])));
  const d = clamp(f, 0, 1) * cum[cum.length - 1];
  let i = 0;
  while (i < points.length - 2 && cum[i + 1] < d) i++;
  const t = (d - cum[i]) / Math.max(1e-9, cum[i + 1] - cum[i]);
  return { p: lerp3(points[i], points[i + 1], t), seg: i, t };
}

/** distance from p to a polyline, plus the segment index of the closest point */
function polyDist(points, p) {
  let bd = Infinity, bs = 0, bt = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], d = sub(points[i + 1], a), l2 = dot(d, d);
    const t = clamp(dot(sub(p, a), d) / l2, 0, 1);
    const q = add(a, scale(d, t));
    const dd = len(sub(p, q));
    if (dd < bd) { bd = dd; bs = i; bt = t; }
  }
  return { d: bd, seg: bs, t: bt };
}

/**
 * wing: anatomy wing record; boneIndex: name -> index; res: target edge length (m)
 */
export function membrane(wing, boneIndex, opts = {}) {
  const res = opts.res ?? 0.05;
  const pos = [], uvA = [], edge = [], si = [], sw = [], idx = [];
  const fingers = wing.fingers;
  const side = wing.sd;
  const armPts = [wing.root, wing.elbow, wing.wrist];
  const armBones = [`${wing.prefix}_0`, `${wing.prefix}_1`];
  // "bone edges": polylines that hold the membrane, each with a bone per segment
  const holders = [
    { pts: armPts, bones: armBones },
    ...fingers.map((f) => ({ pts: f.points, bones: f.names })),
    { pts: wing.attach, bones: wing.attachBones },
  ];
  const freeEdges = [];

  const weightsAt = (p, use) => {
    // inverse-distance weights to the holder polylines in `use`
    const acc = new Map();
    let total = 0;
    for (const h of use) {
      const r = polyDist(h.pts, p);
      const w = 1 / Math.pow(r.d + res * 0.5, 2.2);
      const bn = h.bones[Math.min(r.seg, h.bones.length - 1)];
      const bi = boneIndex[bn];
      if (bi === undefined) throw new Error(`membrane: unknown bone ${bn}`);
      acc.set(bi, (acc.get(bi) || 0) + w); total += w;
    }
    const ent = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = ent.reduce((q, e) => q + e[1], 0);
    return { bones: ent.map((e) => e[0]), weights: ent.map((e) => e[1] / s) };
  };

  const grid = (na, nb, P, use, patch, billowF, freeEdgeFn) => {
    const base = pos.length / 3;
    for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) {
      const a = i / na, b = j / nb;
      const p = P(a, b);
      pos.push(...p);
      const { bones, weights } = weightsAt(p, use);
      for (let k = 0; k < 4; k++) { si.push(bones[k] ?? bones[0]); sw.push(weights[k] ?? 0); }
      uvA.push(a, b, patch, billowF(a, b));
      let dBone = Infinity;
      for (const h of use) dBone = Math.min(dBone, polyDist(h.pts, p).d);
      edge.push(dBone, freeEdgeFn(a, b), side, 0);
    }
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
      const a = base + i * (nb + 1) + j, c = a + nb + 1;
      if (side > 0) idx.push(a, c, a + 1, a + 1, c, c + 1); else idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  };
  const steps = (l) => Math.max(4, Math.ceil(l / res));

  // ---- chiropatagium between fingers k and k+1
  for (let k = 0; k < fingers.length - 1; k++) {
    const A = fingers[k].points, Bp = fingers[k + 1].points;
    const tipA = A[A.length - 1], tipB = Bp[Bp.length - 1];
    const gap = len(sub(tipA, tipB));
    const depth = gap * 0.2;
    const inward = norm(sub(wing.wrist, lerp3(tipA, tipB, 0.5)));
    const lenA = len(sub(tipA, A[0]));
    const na = steps(lenA), nb = steps(gap);
    const P = (a, b) => {
      const pa = polyAt(A, a).p, pb = polyAt(Bp, a).p;
      return add(lerp3(pa, pb, b), scale(inward, depth * Math.sin(Math.PI * b) * Math.pow(a, 1.6)));
    };
    grid(na, nb, P, [holders[k + 1], holders[k + 2]], k + 1, (a, b) => Math.sin(Math.PI * b) * Math.sin(Math.PI * Math.min(1, a * 1.15)),
      (a, b) => len(sub(P(a, b), P(1, b))));
  }

  // ---- plagiopatagium: Coons patch arm(b=0) / last finger (a=1) / body (a=0) / free edge (b=1)
  {
    const F = fingers[fingers.length - 1].points;
    const tip = F[F.length - 1];
    const lead = [wing.attach[0], wing.elbow, wing.wrist];           // b = 0, a: body -> wrist
    const outer = F;                                                   // a = 1, b: wrist -> tip
    const rootE = wing.attach;                                         // a = 0, b: armpit -> hip
    const hip = wing.attach[wing.attach.length - 1];
    const free = (a) => {
      const p = lerp3(hip, tip, a);
      const inward = norm(sub(lerp3(wing.attach[0], wing.wrist, 0.5), lerp3(hip, tip, 0.5)));
      return add(p, scale(inward, len(sub(tip, hip)) * 0.16 * Math.sin(Math.PI * a)));
    };
    const P00 = lead[0], P10 = wing.wrist, P11 = tip, P01 = hip;
    const P = (a, b) => {
      const cb0 = polyAt(lead, a).p, cb1 = free(a), ca0 = polyAt(rootE, b).p, ca1 = polyAt(outer, b).p;
      const r = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        r[c] = (1 - b) * cb0[c] + b * cb1[c] + (1 - a) * ca0[c] + a * ca1[c]
          - ((1 - a) * (1 - b) * P00[c] + a * (1 - b) * P10[c] + (1 - a) * b * P01[c] + a * b * P11[c]);
      }
      return r;
    };
    const spanL = len(sub(wing.wrist, wing.attach[0])), chordL = len(sub(tip, wing.wrist));
    grid(steps(spanL * 1.1), steps(chordL), P, [holders[0], holders[fingers.length], holders[holders.length - 1]], 4,
      (a, b) => Math.sin(Math.PI * Math.min(1, b * 1.05)) * Math.sin(Math.PI * a),
      (a, b) => len(sub(P(a, b), P(a, 1))));
  }

  // ---- propatagium: in front of the arm, from the shoulder to the wrist
  {
    const neckSide = add(wing.root, [0, 0, len(sub(wing.elbow, wing.root)) * 0.35]);
    const leadE = (a) => lerp3(neckSide, wing.wrist, a);
    const armE = (a) => polyAt(armPts, a).p;
    const l = len(sub(wing.wrist, wing.root));
    const P = (a, b) => {
      const pa = armE(a), pl = leadE(a);
      const q = lerp3(pa, pl, b);
      return add(q, [0, -0.02 * l * Math.sin(Math.PI * b) * Math.sin(Math.PI * a), 0]);
    };
    grid(steps(l), Math.max(3, steps(len(sub(wing.elbow, lerp3(neckSide, wing.wrist, 0.5)))) >> 1), P, [holders[0]], 0,
      (a, b) => Math.sin(Math.PI * a) * b * 0.6, (a, b) => len(sub(P(a, b), P(a, 1))));
  }

  const out = { positions: Float32Array.from(pos), index: Uint32Array.from(idx), skinIndex: Uint16Array.from(si), skinWeight: Float32Array.from(sw),
    wing: Float32Array.from(uvA), edge: Float32Array.from(edge) };
  computeNormals(out);
  return out;
}
