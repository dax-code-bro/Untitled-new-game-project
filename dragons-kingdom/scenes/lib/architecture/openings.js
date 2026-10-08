// Architecture kit - windows, doors, shutters and the rooms behind them.
//
// Windows are oak frames set back in their reveal, divided by mullions into lights, glazed with
// leaded quarries (diamond or square) of uneven crown glass - or unglazed with the shutter as
// the only closure - with a dim room behind (interior mapping, materials.js). Shutters are
// ledged plank shutters on iron strap hinges: folded back flat against the wall, held half open
// on a shutter dog, or closed - never sticking straight out. Doors are heavy ledged oak boards
// with strap hinges, nail heads and a ring handle, in an oak door case, closed or standing open
// onto the room behind.
//
// Frame F: the opening's bottom-left corner on the wall face (x along, y up, z out).
import { block, sub, frame, makeRand, tube, xf, clamp } from './core.js';
import { member } from './timber.js';

/** Glazing / portal quad in window space: corners in face coords (x0,y0)-(x1,y1) at depth z. */
export function glassQuad(kit, F, x0, y0, x1, y1, z, o) {
  const acc = kit.get(o.portal ? 'portal' : 'glass');
  const typ = o.portal ? 0 : o.glazing === 'square' ? 2 : o.glazing === 'plain' ? 3 : o.glazing === 'cloth' ? 4 : 1;
  const W = o.W, H = o.H, fb = o.floorBelow ?? 0.9;
  const ox = o.ox ?? 0, oy = o.oy ?? 0;
  const base = acc.vcount;
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
    const w = xf(F, x, y, z);
    acc.v(w[0], w[1], w[2], x - ox, y - oy, o.seed ?? 0.5, typ, 0, W, H, fb);
  }
  acc.q(base, base + 1, base + 2, base + 3);
}

/**
 * Frame of a hinged leaf in face frame F: x runs from the leaf's left edge to its right edge
 * (as when closed), y up, z = the leaf's outside face. hinge 'left' | 'right' at face x hx, leaf
 * width lw, angle ang (0 closed), out (true: swings out of the wall, false: into the room), z0.
 */
export function leafFrame(F, hx, lw, hinge, ang, out, z0) {
  const s = Math.sin(ang), c = Math.cos(ang);
  // the free edge moves toward +z (out) or -z (in)
  const sz = out ? 1 : -1;
  if (hinge === 'left') {
    const X = [c, 0, sz * s];
    return sub(F, [hx, 0, z0], X, [0, 1, 0]);
  }
  const X = [c, 0, -sz * s];
  return sub(F, [hx - X[0] * lw, 0, z0 - X[2] * lw], X, [0, 1, 0]);
}

/** A ledged plank leaf (shutter / door) in its own frame: x 0..w (hinge at x=0), y 0..h, z 0..t (front at t). */
function plankLeaf(kit, Fl, w, h, t, rnd, o = {}) {
  const bw = o.board ?? 0.15;
  // boards of the widths the tree gave (10-25 cm, never two alike), a little shrunk apart
  const ws = [];
  let tot = 0;
  while (tot < w - 0.04) { const b = bw * rnd.range(0.65, 1.5); ws.push(b); tot += b; }
  const n = Math.max(2, ws.length);
  if (ws.length < 2) ws.push(bw);
  const sum = ws.reduce((a, b) => a + b, 0);
  const topAt = o.topAt || (() => h);
  let xc = 0;
  for (let i = 0; i < n; i++) {
    const wi = (ws[i] / sum) * w;
    const xa = xc + 0.002 + rnd.range(0, 0.003), xb = xc + wi - 0.002 - rnd.range(0, 0.003);
    xc += wi;
    const xm = (xa + xb) / 2;
    // the bottom end of a board wears and rots unevenly
    const bot = rnd.range(0, 0.012);
    const top = Math.min(topAt(xa), topAt(xb), topAt(xm)) - rnd.range(0, 0.006);
    const topA = topAt(xa), topB = topAt(xb);
    const bw2 = xb - xa;
    const mat = o.mat || (o.mixMat && rnd() < 0.3 ? (o.mixMat) : 'oakDark');
    block(kit.get(mat), sub(Fl, [xm, (top + bot) / 2, t / 2 + rnd.sym(0.002)], [0, 1, 0], [-1, 0, 0]), top - bot, bw2, t, {
      r: rnd.range(0.004, 0.011), rs: 1, seg: [o.hero ? 0.25 : 0.6, bw2, t], seed: rnd(), noise: 0.0015, nf: 6, chip: 0.008, axis: [1, 0, 0],
      // the board's top follows the head (arched doors): stretch the upper end to the curve
      warp: o.topAt ? (lx, ly, lz) => { const f = (lx / top + 0.5); const x = -ly; const tt = topA + (topB - topA) * (x / bw2 + 0.5); return [lx + (f > 0.5 ? (tt - top) * (f - 0.5) * 2 : 0), ly, lz]; } : undefined,
    });
  }
  // ledges (and a brace) on the back face
  const ledges = o.ledges ?? [0.15, 0.85];
  for (const fy of ledges) {
    const y = h * fy;
    block(kit.get(o.mat || 'oakDark'), sub(Fl, [w / 2, y, -0.014]), w - 0.04, 0.12, 0.028, { r: 0.004, seg: [0.3, 0.12, 0.03], seed: rnd(), noise: 0.0015, axis: [1, 0, 0] });
  }
  return n;
}

/** Iron strap hinges (with nail heads) across a leaf: at heights ys, from the hinge side x=0. */
function strapHinges(kit, Fl, w, ys, t, rnd, o = {}) {
  const acc = kit.get('iron');
  const R = o.right ? -1 : 1;                 // hinge at x = w (right) or x = 0 (left)
  const X0 = o.right ? w : 0;
  for (const y of ys) {
    const len = w * (o.len ?? 0.7);
    block(acc, sub(Fl, [X0 + R * (len / 2 - 0.02), y, t + 0.003], [R, 0, 0], [0, 1, 0]), len, 0.045, 0.006, {
      r: 0.002, seg: [0.08, 0.045, 0.006], seed: rnd(), noise: 0.0008, nf: 20,
      // spear-head end and a slight taper
      warp: (lx, ly, lz) => { const f = lx / len + 0.5; const sc = f > 0.85 ? 1 + (f - 0.85) * 4 * (1 - (f - 0.85) / 0.15 * 0.9) : 1 - 0.25 * f; return [lx, ly * sc, lz]; },
    });
    // nail heads
    for (let k = 0; k < 4; k++) {
      const x = X0 + R * (0.05 + (len - 0.12) * k / 3);
      const p = xf(Fl, x, y + rnd.sym(0.004), t + 0.006);
      const q = xf(Fl, x, y, t + 0.013);
      tube(acc, [p, q], 0.007, { sides: 6, caps: true, seed: rnd() });
    }
    // the hinge pin / knuckle at the hinge side
    tube(acc, [xf(Fl, X0 - R * 0.01, y - 0.05, t * 0.5), xf(Fl, X0 - R * 0.01, y + 0.05, t * 0.5)], 0.012, { sides: 7, caps: true });
  }
}

/**
 * A window in a stone wall (reveal depth `inset` behind the face) or a timber frame (inset small).
 * o: w, h, inset, lights (vertical divisions), transom (bool), glazing 'diamond'|'square'|'none',
 * shutters 'open' | 'half' | 'closed' | 'none', frame (bool: oak frame; false when the timber
 * framing already frames it), floorBelow (room floor below the sill), seed, lod, sillBoard.
 */
export function windowUnit(kit, F, o) {
  const rnd = makeRand(o.seed ?? 51);
  const w = o.w, h = o.h, inset = o.inset ?? 0.12;
  const fw = o.frameW ?? 0.07, fd = o.frameD ?? 0.09;
  const z = -inset;
  const mat = 'oakDark';
  const hasFrame = o.frame !== false;
  if (hasFrame) {
    const mem = (x0, y0, x1, y1, ww) => {
      const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
      block(kit.get(mat), sub(F, [(x0 + x1) / 2, (y0 + y1) / 2, z - fd / 2], [ux, uy, 0], [-uy, ux, 0]), L, ww, fd, { r: 0.006, rs: 1, seg: [0.25, ww, fd], seed: rnd(), noise: 0.0015, nf: 5, chip: 0.004, axis: [1, 0, 0] });
    };
    mem(0, fw / 2, w, fw / 2, fw);                 // sill
    mem(0, h - fw / 2, w, h - fw / 2, fw);         // head
    mem(fw / 2, fw, fw / 2, h - fw, fw);           // jambs
    mem(w - fw / 2, fw, w - fw / 2, h - fw, fw);
    const lights = o.lights ?? Math.max(1, Math.round(w / 0.5));
    for (let i = 1; i < lights; i++) { const x = (w * i) / lights; mem(x, fw, x, h - fw, fw * 0.85); }
    if (o.transom) { const y = h * 0.72; mem(fw, y, w - fw, y, fw * 0.8); }
  }
  // glazing (or a dark unglazed opening onto the room)
  const glz = o.glazing || 'diamond';
  const ins = hasFrame ? fw * 0.5 : 0.0;
  glassQuad(kit, F, ins, ins, w - ins, h - ins, z - (hasFrame ? fd * 0.55 : 0.03), { glazing: glz, portal: glz === 'none', W: w, H: h, floorBelow: o.floorBelow ?? 0.9, seed: rnd() });
  // shutters
  const sh = o.shutters || 'none';
  if (sh !== 'none') {
    const pair = w > 0.75;
    const leaves = pair ? [[0, w / 2, 'left'], [w, w / 2, 'right']] : [[0, w, 'left']];
    const t = 0.028;
    for (const [hx, lw, hinge] of leaves) {
      // hinged on the wall face at the reveal edge: closed in the opening, folded back flat
      // against the wall, or held half open on a shutter dog
      let ang;
      if (sh === 'closed') ang = Math.abs(rnd.sym(0.03));
      else if (sh === 'half') ang = rnd.range(1.75, 2.35);
      else ang = Math.PI - rnd.range(0.03, 0.12);
      // (on pintles standing out from the face: the folded leaf clears the proudest stones)
      const zf = sh === 'closed' ? -0.03 : 0.045;
      const lww = lw - 0.006;
      const Fl = leafFrame(F, hx, lww, hinge, ang, true, zf);
      plankLeaf(kit, Fl, lww, h - 0.004, t, rnd, { board: rnd.range(0.12, 0.18), ledges: [0.18, 0.82] });
      strapHinges(kit, Fl, lww, [h * 0.18, h * 0.82], t, rnd, { len: 0.75, right: hinge === 'right' });
      if (sh === 'half') {
        // a shutter dog (iron hook) from the wall to the leaf
        const free = hinge === 'left' ? lww * 0.85 : lww * 0.15;
        const p0 = xf(F, hinge === 'left' ? hx - 0.12 : hx + 0.12, h * 0.5, 0.01), p1 = xf(Fl, free, h * 0.5, 0.0);
        tube(kit.get('iron'), [p0, p1], 0.005, { sides: 5 });
      }
    }
  }
  // a shop front: the lower leaf let down level with the sill as the counter (on two brackets), the
  // upper leaf swung up and propped as a hood over it
  if (o.counter) {
    const t = 0.035, cd = Math.min(0.5, h * 0.45), hh = h * 0.55;
    const Fc = sub(F, [0, 0, 0.02], [1, 0, 0], [0, 0, 1]);
    plankLeaf(kit, Fc, w, cd, t, rnd, { board: rnd.range(0.16, 0.22), ledges: [0.3, 0.85], mixMat: 'oak' });
    for (const fx of [0.12, 0.88]) member(kit, sub(F, [w * fx, 0, 0], [0, 0, 1], [0, 1, 0]), [0.02, -0.5], [cd - 0.06, -t - 0.03], 0.06, 0.05, rnd, { mat: 'oakDark', proud: 0.025, bow: 0.0 });
    const a = 0.32, Fh = sub(F, [0, h + 0.01, 0.02], [1, 0, 0], [0, Math.sin(a), Math.cos(a)]);
    plankLeaf(kit, Fh, w, hh, t, rnd, { board: rnd.range(0.16, 0.22), ledges: [0.2, 0.8], mixMat: 'oak' });
    for (const fx of [0.1, 0.9]) tube(kit.get('oakDark'), [xf(F, w * fx, h - 0.55, 0.03), xf(Fh, w * fx, hh - 0.04, -0.01)], 0.017, { sides: 6, caps: true, seed: rnd() });
  }
  // a sill board / drip inside the reveal of a stone window (oak, weathered)
  if (o.sillBoard) block(kit.get('oak'), sub(F, [w / 2, -0.015, z + 0.02]), w + 0.04, 0.03, Math.max(0.05, inset), { r: 0.005, seg: [0.3, 0.03, 0.1], seed: rnd(), noise: 0.001, axis: [1, 0, 0] });
}

/**
 * A door: ledged oak boards in a door case, strap hinges, nail heads, ring handle.
 * o: w, h (to the springing for arched), arch (bool: round head, radius w/2), inset (behind the
 * face), open (0 closed .. 1 wide open), hingeLeft (bool), room (true: interior portal behind),
 * roomDepth, seed, caseW.
 */
export function door(kit, F, o) {
  const rnd = makeRand(o.seed ?? 61);
  const w = o.w, h = o.h, inset = o.inset ?? 0.18;
  const arch = !!o.arch, r = w / 2;
  const top = arch ? h : h;          // h = total height to the crown for arched doors
  const spring = arch ? h - r : h;
  const topAt = (x) => (arch ? spring + Math.sqrt(Math.max(0, r * r - (x - r) ** 2)) : h);
  const t = 0.05;
  const cw = o.caseW ?? 0.1;
  // the door case (frame) for square-headed doors
  if (!arch && o.case !== false) {
    const mem = (x0, y0, x1, y1, ww) => {
      const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
      block(kit.get('oakDark'), sub(F, [(x0 + x1) / 2, (y0 + y1) / 2, -inset + 0.06], [ux, uy, 0], [-uy, ux, 0]), L, ww, 0.14, { r: 0.008, rs: 1, seg: [0.3, ww, 0.14], seed: rnd(), noise: 0.002, nf: 5, chip: 0.006, axis: [1, 0, 0] });
    };
    mem(cw / 2, 0, cw / 2, h, cw); mem(w - cw / 2, 0, w - cw / 2, h, cw); mem(0, h - cw / 2, w, h - cw / 2, cw);
  }
  const lw = arch ? w : w - 2 * cw, lh = arch ? top : h - cw;
  const x0 = arch ? 0 : cw;
  const open = clamp(o.open ?? 0, 0, 1);
  const hinge = (o.hingeLeft ?? true) ? 'left' : 'right';
  const ang = open * 1.9;                    // swings into the room
  const hx = hinge === 'left' ? x0 : x0 + lw;
  const Fl = leafFrame(F, hx, lw - 0.008, hinge, ang, false, -inset - t * 0.3);
  const leafTop = arch ? (x) => topAt(x0 + x) - 0.01 : null;
  plankLeaf(kit, Fl, lw - 0.008, lh - 0.01, t, rnd, { board: rnd.range(0.14, 0.2), ledges: [0.12, 0.5, 0.86], topAt: leafTop });
  strapHinges(kit, Fl, lw - 0.008, [lh * 0.12, lh * (arch ? 0.6 : 0.86)], t, rnd, { len: 0.8, right: hinge === 'right' });
  // nail heads in rows along the ledges (clench nails)
  const acc = kit.get('iron');
  for (const fy of [0.12, 0.5, 0.86]) {
    for (let k = 0; k < Math.round(lw / 0.16); k++) {
      const x = 0.08 + k * 0.16 + rnd.sym(0.01);
      if (x > lw - 0.05) break;
      const yy = lh * fy + rnd.sym(0.008);
      tube(acc, [xf(Fl, x, yy, t), xf(Fl, x, yy, t + 0.008)], 0.008, { sides: 5, caps: true });
    }
  }
  // ring handle and latch plate
  {
    const hxp = hinge === 'left' ? lw * 0.82 : lw * 0.18, hy = 1.0;
    block(acc, sub(Fl, [hxp, hy, t + 0.003]), 0.08, 0.12, 0.006, { r: 0.003, seg: [0.08, 0.12, 0.006], seed: rnd() });
    const pts = [];
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; pts.push(xf(Fl, hxp + Math.sin(a) * 0.06, hy - 0.07 + Math.cos(a) * 0.06 - 0.0, t + 0.015 + 0.01 * Math.cos(a))); }
    tube(acc, pts, 0.008, { sides: 6 });
  }
  // the room behind
  if (o.room !== false) glassQuad(kit, F, 0, 0, w, top, -(o.wallT ?? inset + 0.2) - 0.01, { portal: true, W: w, H: top, floorBelow: 0.0, seed: rnd(), ox: 0, oy: 0 });
  return { leafFrame: Fl };
}

/** A threshold / door step stone (worn). */
export function threshold(kit, F, w, depth, rnd, o = {}) {
  block(kit.get(o.mat || 'stoneDressed'), sub(F, [w / 2, -0.06, -depth / 2 + 0.12]), w + 0.2, 0.14, depth + 0.24, {
    r: 0.02, rs: 1, seg: [0.15, 0.07, 0.12], seed: rnd(), noise: 0.003, nf: 6, chip: 0.01,
    warp: (lx, ly, lz) => [lx, ly - (ly > 0 ? 0.018 * Math.exp(-(lx * lx) / 0.1) * Math.exp(-((lz - 0.05) ** 2) / 0.05) : 0), lz],
  });
}
void frame;
