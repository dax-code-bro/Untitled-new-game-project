// Architecture kit - timber framing.
//
// Box-frame construction: a sill beam (or the bressumer of a jetty) carries corner and bay
// posts; studs stand between them on the sill and under the head plate; a mid rail ties them;
// straight tension braces run from the posts down to the sill and interrupt the studs they
// cross; window openings are framed by their own posts, sill rail and head rail. Every member
// is hand-hewn: bowed a little, slightly out of square, with adze scallops, an occasional
// waney arris, and pegged (trenails) where its tenon enters the next member. The wattle-and-daub
// panels are one recessed lime-plaster surface behind the frame that shrinks back from the
// timbers (a dark gap) and bellies out a few millimetres in the middle of each panel.
//
//   const fr = framedWall(kit, F, L, H, { studs: 0.55, rail: 0.95, braces: 'ends', windows: [...] });
//   jetty(kit, F, L, J, { ... })     // joist ends + bressumer for an overhanging upper storey
//   gableFrame(kit, F, L, rise, { ... })
//
// Face frame F: origin at the bottom-left of the face, x along, y up, z out; timber faces lie
// at z ~ 0 and run back to -depth; plaster sits ~3 cm behind.
import { block, tube, sub, makeRand, clamp, smoothstep } from './core.js';

/**
 * One hewn member from face point a=[x,y] to b=[x,y]: width w (in the face), depth dep (into the
 * wall), proud (m in front of z=0). o: bow (m), mat, seed, peg ends ([bool, bool]).
 */
export function member(kit, F, a, b, w, dep, rnd, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L < 0.02) return;
  const ux = dx / L, uy = dy / L;
  const proud = o.proud ?? rnd.range(-0.004, 0.012);
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
  // slightly out of square: the member is turned a hair about its own axis
  const tw = rnd.sym(0.02);
  const Fm = sub(F, [cx, cy, proud - dep / 2], [ux, uy, 0], [-uy, ux, tw]);
  const bow = o.bow ?? rnd.sym(Math.min(0.025, L * 0.009));
  const bowZ = rnd.sym(Math.min(0.012, L * 0.004));
  const kink = rnd.sym(0.006);
  const lod = o.lod || 'mid';
  const hero = lod === 'hero';
  const seed = rnd();
  const ph = rnd() * 10;
  block(kit.get(o.mat || 'oak'), Fm, L, w * rnd.range(0.95, 1.04), dep, {
    r: rnd.range(0.006, 0.016), rs: hero ? 2 : 1,
    // (the hewing scallops are in the material's bump: as geometry, sampled a few times per
    // scallop, Gouraud interpolation shows every triangle)
    seg: [hero ? 0.1 : lod === 'low' ? 1.0 : 0.4, hero ? Math.max(0.04, w / 3) : w, hero ? Math.max(0.05, dep / 3) : dep],
    seed, noise: 0, nf: 4, noct: 1, chip: 0.006, adze: 0,
    wane: rnd() < 0.25 ? [rnd() < 0.5 ? 1 : -1, 1] : null,
    axis: [1, 0, 0], skip: 32 * (o.back ? 0 : 0),
    // bow (in the face and out of it), a kink where a knot was, a section that wanders
    bend: (lx, ly, lz) => {
      const t = lx / L;
      const s = Math.sin(Math.PI * (t + 0.5));
      return [0, bow * s + kink * Math.sin(t * 9 + ph) + (ly / w) * 0.006 * Math.sin(t * 5 + ph), bowZ * s + (lz / dep) * 0.004 * Math.sin(t * 4 + ph * 2)];
    },
  });
  return { a, b, w, dep, proud };
}

/** A pair of oak pegs (trenails) at face point p, along the direction dir of the tenon. */
export function pegs(kit, F, p, dir, rnd, o = {}) {
  const n = o.n ?? (rnd() < 0.7 ? 2 : 1);
  const acc = kit.get(o.mat || 'oakDark');
  const sp = o.spacing ?? 0.07;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * sp;
    const x = p[0] + dir[0] * off + rnd.sym(0.006), y = p[1] + dir[1] * off + rnd.sym(0.006);
    const z0 = (o.z ?? 0) - 0.01, z1 = (o.z ?? 0) + rnd.range(0.004, 0.016);
    const r = rnd.range(0.011, 0.015);
    const tilt = [rnd.sym(0.08), rnd.sym(0.08)];
    const pts = [[x, y, z0], [x + tilt[0] * (z1 - z0), y + tilt[1] * (z1 - z0), z1]].map((q) => {
      const w = [F[0] + q[0] * F[3] + q[1] * F[6] + q[2] * F[9], F[1] + q[0] * F[4] + q[1] * F[7] + q[2] * F[10], F[2] + q[0] * F[5] + q[1] * F[8] + q[2] * F[11]];
      return w;
    });
    tube(acc, pts, r, { sides: 7, caps: true, seed: rnd() });
  }
}

/** Distance from point p to segment ab. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-9;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

/**
 * Plaster infill behind the members: a dense grid over the polygon `outline` ([[x,y],...], face
 * coords, convex) minus `holes` (rects {x0,y0,x1,y1}); recessed `inset`, bellied between members.
 */
export function infill(kit, F, outline, members, holes, rnd, o = {}) {
  const acc = kit.get(o.mat || 'plaster');
  const step = o.step ?? 0.06;
  const inset = o.inset ?? 0.028;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of outline) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const nx = Math.max(2, Math.ceil((x1 - x0) / step)), ny = Math.max(2, Math.ceil((y1 - y0) / step));
  const inside = (x, y) => {
    for (let i = 0; i < outline.length; i++) {
      const [ax, ay] = outline[i], [bx, by] = outline[(i + 1) % outline.length];
      if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < -1e-6) return false;
    }
    return true;
  };
  const inHole = (x, y) => holes.some((h) => x > h.x0 && x < h.x1 && y > h.y0 && y < h.y1);
  const seed = o.seed ?? rnd();
  const ids = new Int32Array((nx + 1) * (ny + 1)).fill(-1);
  const pv = new Float32Array(3);
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    let x = x0 + (x1 - x0) * i / nx, y = y0 + (y1 - y0) * j / ny;
    // snap the outline points that fall outside onto it (keeps the gable edge clean)
    if (!inside(x, y)) {
      let best = null, bd = 1e9;
      for (let k = 0; k < outline.length; k++) {
        const [ax, ay] = outline[k], [bx, by] = outline[(k + 1) % outline.length];
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
        const qx = ax + dx * t, qy = ay + dy * t, d = Math.hypot(qx - x, qy - y);
        if (d < bd) { bd = d; best = [qx, qy]; }
      }
      if (bd > step * 1.01) continue;
      x = best[0]; y = best[1];
    }
    // distance to the nearest timber edge (negative: behind a member)
    let d = 1e9;
    for (const m of members) d = Math.min(d, segDist(x, y, m.a[0], m.a[1], m.b[0], m.b[1]) - m.w / 2);
    const bel = smoothstep(0.0, 0.14, d);
    const z = -inset + bel * (o.belly ?? 0.009) + (d < 0 ? -0.012 : 0) + 0.003 * Math.sin(x * 7.3 + y * 3.1 + seed * 9) * bel;
    pv[0] = F[0] + x * F[3] + y * F[6] + z * F[9]; pv[1] = F[1] + x * F[4] + y * F[7] + z * F[10]; pv[2] = F[2] + x * F[5] + y * F[8] + z * F[11];
    const ao = 0.35 + 0.65 * smoothstep(-0.005, 0.07, d);
    ids[j * (nx + 1) + i] = acc.v(pv[0], pv[1], pv[2], x, y, seed, ao, 0, F[3], F[4], F[5]);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = ids[j * (nx + 1) + i], b = ids[j * (nx + 1) + i + 1], c = ids[(j + 1) * (nx + 1) + i + 1], d = ids[(j + 1) * (nx + 1) + i];
    const cx = x0 + (x1 - x0) * (i + 0.5) / nx, cy = y0 + (y1 - y0) * (j + 0.5) / ny;
    if (inHole(cx, cy)) continue;
    if (a >= 0 && b >= 0 && c >= 0 && d >= 0) acc.q(a, b, c, d);
    else if (a >= 0 && b >= 0 && c >= 0) acc.t(a, b, c);
    else if (a >= 0 && c >= 0 && d >= 0) acc.t(a, c, d);
    else if (a >= 0 && b >= 0 && d >= 0) acc.t(a, b, d);
    else if (b >= 0 && c >= 0 && d >= 0) acc.t(b, c, d);
  }
}

/**
 * A framed wall storey. o: studs (spacing, m; 0 = square panels only with posts), postW, studW,
 * dep, sillH, plateH, rail (mid rail height or 0), braces ('ends' | 'none' | [[x0,y0,x1,y1], ...]),
 * windows [{ x, y, w, h }] (frame openings), cornerL / cornerR (bool: corner posts), bays (n),
 * lod, seed, sill (bool: lay the sill beam), plate (bool), mat, plaster (accumulator name),
 * plasterSeed. Returns { members, windows, joints }.
 */
export function framedWall(kit, F, L, H, o = {}) {
  const rnd = makeRand(o.seed ?? 7);
  const lod = o.lod || 'mid';
  const dep = o.dep ?? 0.2;
  const postW = o.postW ?? 0.22, studW = o.studW ?? 0.14, sillH = o.sillH ?? 0.2, plateH = o.plateH ?? 0.2;
  const mat = o.mat || 'oak';
  const M = [];
  const add = (a, b, w, extra = {}) => { const m = member(kit, F, a, b, w, extra.dep ?? dep, rnd, { lod, mat, ...extra }); if (m) M.push(m); return m; };
  const PEG = [];
  const peg = (p, dir) => PEG.push([p, dir]);
  const yS = o.sill === false ? 0 : sillH, yP = H - (o.plate === false ? 0 : plateH);
  if (o.sill !== false) add([0, sillH / 2], [L, sillH / 2], sillH, { dep: dep + 0.03 });
  if (o.plate !== false) add([0, H - plateH / 2], [L, H - plateH / 2], plateH, { dep: dep + 0.02 });
  // posts: corners and bay posts
  const bays = o.bays ?? Math.max(1, Math.round(L / 3.2));
  const posts = [];
  if (o.cornerL !== false) posts.push(postW / 2);
  for (let i = 1; i < bays; i++) posts.push(L * i / bays + rnd.sym(0.05));
  if (o.cornerR !== false) posts.push(L - postW / 2);
  const wins = (o.windows || []).map((w) => ({ ...w }));
  const inWin = (x, hw = 0) => wins.find((w) => x + hw > w.x - 0.01 && x - hw < w.x + w.w + 0.01);
  for (const x of posts) {
    if (inWin(x, postW / 2)) continue;
    add([x, yS], [x, yP], postW, { dep: dep + 0.02 });
    peg([x, yS - sillH / 2], [1, 0]); peg([x, yP + plateH / 2], [1, 0]);
  }
  // braces: from each corner post down to the sill, away from the corner (tension braces)
  let braces = [];
  if (o.braces === 'ends' || o.braces === undefined) {
    const bw = studW * 1.05;
    const span = Math.min(L * 0.3, (yP - yS) * 0.85);
    if (o.cornerL !== false) braces.push([postW, yP - 0.25, postW + span, yS]);
    if (o.cornerR !== false) braces.push([L - postW, yP - 0.25, L - postW - span, yS]);
    braces = braces.filter((b) => !inWin((b[0] + b[2]) / 2, Math.abs(b[2] - b[0]) / 2));
    for (const b of braces) { add([b[0] - Math.sign(b[2] - b[0]) * 0.02, b[1]], [b[2], b[3] + 0.02], bw); }
  } else if (Array.isArray(o.braces)) { braces = o.braces; for (const b of braces) add([b[0], b[1]], [b[2], b[3]], studW * 1.05); }
  const braceAt = (x) => {
    // y-intervals cut out of a stud at x by braces
    const cuts = [];
    for (const b of braces) {
      const [bx0, by0, bx1, by1] = b;
      if ((x - bx0) * (x - bx1) > 0) continue;
      const t = (x - bx0) / (bx1 - bx0);
      const yc = by0 + (by1 - by0) * t;
      const ang = Math.atan2(Math.abs(by1 - by0), Math.abs(bx1 - bx0));
      const ht = (studW * 1.05) / 2 / Math.cos(ang) + 0.01;
      cuts.push([yc - ht, yc + ht]);
    }
    return cuts;
  };
  // mid rail between posts (not across windows: the windows carry their own rails)
  const railY = o.rail ?? 0;
  // window framing
  for (const w of wins) {
    const wx0 = w.x, wx1 = w.x + w.w, wy0 = w.y, wy1 = w.y + w.h;
    add([wx0 - studW / 2, yS], [wx0 - studW / 2, yP], studW);
    add([wx1 + studW / 2, yS], [wx1 + studW / 2, yP], studW);
    add([wx0 - studW, wy0 - studW / 2], [wx1 + studW, wy0 - studW / 2], studW * 1.1);   // window sill rail
    add([wx0 - studW, wy1 + studW / 2], [wx1 + studW, wy1 + studW / 2], studW * 1.1);   // head rail
    peg([wx0 - studW / 2, wy0 - studW / 2], [0, 1]); peg([wx1 + studW / 2, wy0 - studW / 2], [0, 1]);
    peg([wx0 - studW / 2, wy1 + studW / 2], [0, 1]); peg([wx1 + studW / 2, wy1 + studW / 2], [0, 1]);
    // short studs under the sill and over the head
    const ns = Math.max(0, Math.round(w.w / (o.studs || 0.6)) - 1);
    for (let k = 1; k <= ns; k++) {
      const x = wx0 + w.w * k / (ns + 1);
      if (wy0 - studW - yS > 0.08) add([x, yS], [x, wy0 - studW], studW * 0.9);
      if (yP - (wy1 + studW) > 0.08) add([x, wy1 + studW], [x, yP], studW * 0.9);
    }
  }
  if (railY > 0) {
    const xs = [0, ...posts, L].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      let a = xs[i] + (i === 0 ? 0 : postW / 2), b = xs[i + 1] - (i === xs.length - 2 ? 0 : postW / 2);
      // split around windows
      const segs = [[a, b]];
      for (const w of wins) for (let k = segs.length - 1; k >= 0; k--) { const [s0, s1] = segs[k]; if (w.x + w.w + studW < s0 || w.x - studW > s1) continue; segs.splice(k, 1); if (w.x - studW - s0 > 0.1) segs.push([s0, w.x - studW]); if (s1 - (w.x + w.w + studW) > 0.1) segs.push([w.x + w.w + studW, s1]); }
      for (const [s0, s1] of segs) {
        // a rail does not cross a brace either: cut it
        let parts = [[s0, s1]];
        for (const br of braces) {
          const ylo = Math.min(br[1], br[3]), yhi = Math.max(br[1], br[3]);
          if (railY < ylo || railY > yhi) continue;
          const t = (railY - br[1]) / (br[3] - br[1]); const xc = br[0] + (br[2] - br[0]) * t;
          parts = parts.flatMap(([p0, p1]) => (xc > p0 && xc < p1 ? [[p0, xc - studW * 0.8], [xc + studW * 0.8, p1]] : [[p0, p1]]));
        }
        for (const [p0, p1] of parts) if (p1 - p0 > 0.12) { add([p0, railY], [p1, railY], studW * 1.1); peg([p0 + 0.04, railY], [0, 1]); }
      }
    }
  }
  // studs
  if (o.studs) {
    const xs = [0, ...posts, L].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i] + (i === 0 && o.cornerL === false ? 0 : postW / 2), b = xs[i + 1] - (i === xs.length - 2 && o.cornerR === false ? 0 : postW / 2);
      const n = Math.max(0, Math.round((b - a) / o.studs) - 1);
      for (let k = 1; k <= n; k++) {
        const x = a + (b - a) * k / (n + 1) + rnd.sym(0.025);
        if (inWin(x, studW)) continue;
        // vertical intervals: sill..rail..plate, minus braces
        const bnds = railY > 0 ? [[yS, railY - studW * 0.55], [railY + studW * 0.55, yP]] : [[yS, yP]];
        const cuts = braceAt(x);
        for (const [s0, s1] of bnds) {
          let parts = [[s0, s1]];
          for (const [c0, c1] of cuts) parts = parts.flatMap(([p0, p1]) => (c1 <= p0 || c0 >= p1 ? [[p0, p1]] : [[p0, Math.min(p1, c0)], [Math.max(p0, c1), p1]]).filter(([q0, q1]) => q1 - q0 > 0.08));
          for (const [p0, p1] of parts) {
            add([x, p0], [x, p1], studW * rnd.range(0.92, 1.08));
            if (Math.abs(p0 - yS) < 0.01) peg([x, yS - sillH * 0.5], [1, 0]);
            if (Math.abs(p1 - yP) < 0.01) peg([x, yP + plateH * 0.5], [1, 0]);
          }
        }
      }
    }
  }
  for (const [p, dir] of PEG) pegs(kit, F, p, dir, rnd, { z: 0.004, n: rnd() < 0.55 ? 1 : 2 });
  // plaster infill (one surface behind the frame), with the window holes
  if (o.plaster !== null) {
    infill(kit, F, [[0, 0], [L, 0], [L, H], [0, H]], M, wins.map((w) => ({ x0: w.x + 0.02, y0: w.y + 0.02, x1: w.x + w.w - 0.02, y1: w.y + w.h - 0.02 })), rnd, { mat: o.plaster || 'plaster', step: lod === 'hero' ? 0.05 : lod === 'low' ? 0.2 : 0.09, seed: o.plasterSeed });
  }
  return { members: M, windows: wins, yS, yP };
}

/**
 * A jetty: floor joists cantilevered over the wall below (ends showing, end grain), carrying the
 * upper storey's bressumer. F: frame on the face of the wall BELOW (x along, y up from the top of
 * that wall, z out). J: overhang. o: spacing, joistW, joistH, lod, seed.
 */
export function jetty(kit, F, L, J, o = {}) {
  const rnd = makeRand(o.seed ?? 11);
  const sp = o.spacing ?? 0.5, jw = o.joistW ?? 0.15, jh = o.joistH ?? 0.18;
  const n = Math.max(2, Math.round(L / sp));
  for (let i = 0; i <= n; i++) {
    const x = clamp(L * i / n + rnd.sym(0.03), jw, L - jw);
    // a joist runs into the house: model its last 0.8 m (it disappears into the wall)
    const len = J + 0.7;
    const Fj = sub(F, [x + rnd.sym(0.01), jh / 2 + rnd.sym(0.008), J - len / 2 + rnd.range(-0.02, 0.01)], [0, 0, 1], [0, 1, 0]);
    block(kit.get(o.mat || 'oakDark'), Fj, len, jh * rnd.range(0.94, 1.05), jw * rnd.range(0.92, 1.05), {
      r: 0.01, seg: [0.2, jh / 4, jw / 4], seed: rnd(), noise: 0.002, nf: 5, chip: 0.006, axis: [1, 0, 0],
      bend: (lx) => [0, -0.004 * Math.max(0, lx / len) ** 2, 0],
    });
  }
}

/**
 * A framed gable: a triangle on top of a wall plate (x 0..L, y 0..rise; apex at L/2). Members:
 * a collar, a king post or two queen struts, short studs cut to the rafter line; plaster behind.
 */
export function gableFrame(kit, F, L, rise, o = {}) {
  const rnd = makeRand(o.seed ?? 13);
  const lod = o.lod || 'mid';
  const studW = o.studW ?? 0.13, dep = o.dep ?? 0.18;
  const M = [];
  const add = (a, b, w) => { const m = member(kit, F, a, b, w, dep, rnd, { lod, mat: o.mat || 'oak' }); if (m) M.push(m); };
  const yAt = (x) => rise * (1 - Math.abs(x - L / 2) / (L / 2));       // the rafter line (soffit of the verge)
  const inset = o.inset ?? 0.12;                                           // the members stop under the bargeboards
  const cy = rise * (o.collar ?? 0.55);
  // principal rafters (the outer frame of the gable; the bargeboards sit outside them)
  add([0.06, 0.08], [L / 2, rise - 0.08], studW * 1.4);
  add([L - 0.06, 0.08], [L / 2, rise - 0.08], studW * 1.4);
  const halfAt = (y) => (L / 2) * (1 - y / rise);
  const wins = o.windows || [];
  // a vertical member at x from y0 to y1, stopping short of any window (and its framing)
  const vert = (x, y0, y1, w) => {
    let parts = [[y0, y1]];
    for (const wn of wins) {
      if (x < wn.x - 0.14 || x > wn.x + wn.w + 0.14) continue;
      parts = parts.flatMap(([a, b]) => [[a, Math.min(b, wn.y - 0.13)], [Math.max(a, wn.y + wn.h + 0.13), b]]).filter(([a, b]) => b - a > 0.08);
    }
    for (const [a, b] of parts) add([x, a], [x, b], w);
  };
  const hcut = (y, x0, x1, w) => {
    let parts = [[x0, x1]];
    for (const wn of wins) {
      if (y < wn.y - 0.14 || y > wn.y + wn.h + 0.14) continue;
      parts = parts.flatMap(([a, b]) => [[a, Math.min(b, wn.x - 0.13)], [Math.max(a, wn.x + wn.w + 0.13), b]]).filter(([a, b]) => b - a > 0.08);
    }
    for (const [a, b] of parts) add([a, y], [b, y], w);
  };
  hcut(cy, L / 2 - halfAt(cy) + inset, L / 2 + halfAt(cy) - inset, studW * 1.15);       // collar
  if (o.kingPost !== false) vert(L / 2, 0.1, rise - inset * 1.4, studW * 1.15);
  const n = Math.max(0, Math.round((L / 2) / (o.studs ?? 0.6)) - 1);
  // the studs run up into the principal rafters (their centre line, less half their depth)
  const pAng = Math.atan2(rise - 0.16, L / 2 - 0.06);
  const pHalf = (studW * 1.4) / 2 / Math.cos(pAng);
  const princAt = (x) => { const xx = Math.min(x, L - x); return 0.08 + (rise - 0.16) * (xx - 0.06) / (L / 2 - 0.06); };
  for (let k = 1; k <= n; k++) for (const side of [-1, 1]) {
    const x = L / 2 + side * (L / 2) * k / (n + 1);
    const top = princAt(x) - pHalf + 0.015;
    if (top < 0.25) continue;
    if (Math.abs(x - L / 2) < 0.2) continue;
    if (top > cy + studW) { vert(x, 0.1, cy - studW * 0.55, studW); vert(x, cy + studW * 0.55, top, studW); }
    else vert(x, 0.1, top, studW);
  }
  infill(kit, F, [[0, 0], [L, 0], [L / 2, rise]], M, wins.map((w) => ({ x0: w.x + 0.02, y0: w.y + 0.02, x1: w.x + w.w - 0.02, y1: w.y + w.h - 0.02 })), rnd, { mat: o.plaster || 'plaster', step: lod === 'hero' ? 0.05 : lod === 'low' ? 0.2 : 0.09, seed: o.plasterSeed });
  return { members: M };
}
