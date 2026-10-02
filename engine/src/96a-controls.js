/* ============================================================
   CONTROLS — the small parts a hand works: levers, buttons, pins,
   screws, serrated thumb pads.

   "There's no detail in the gun even if he had an entire roughness
    scale there wouldn't be detail. There should be the mag drop
    button, the semi full auto, those switches."

   A gun is read by its controls. The receiver of a Thompson is a
   plain milled slab; what makes it a Thompson from three feet away
   is the pair of rocker levers over the grip, the magazine catch,
   the pins through the frame and the screw heads in the wood. Every
   one of those was either missing or built as a 3.6 mm disc sunk
   most of the way into the steel -- correct in the source, a dot on
   the screen.

   So these are drawn at the size the real parts are, and drawn as
   PARTS: a lever is a plate with a hub, cut to its outline, standing
   proud of the frame by its real thickness, with its outer edge
   broken by a small chamfer. That chamfer is most of it. A flat plate
   with square edges is invisible against the flat it sits on, because
   both face the same way and take the same light; a broken edge faces
   somewhere else and catches a highlight all the way round, and the
   eye reads the highlight as the outline of a separate piece of steel.

   Coordinates are the weapon's own (+X to the muzzle, +Y up, +Z the
   right side). `side` is -1 for the left face and +1 for the right.
   ============================================================ */

const CTL_X = new Vec3(1, 0, 0), CTL_Y = new Vec3(0, 1, 0);

/* Counter-clockwise, which is what profileOutline's normals assume. */
function ctlCCW(raw) {
  let a = 0;
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i], q = raw[(i + 1) % raw.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a < 0 ? raw.slice().reverse() : raw;
}

/* The outline pulled in by d, mitred at the corners (and the mitre
   clamped, so a needle-sharp corner does not shoot across the part). */
function ctlInset(raw, d) {
  const n = raw.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = raw[(i - 1 + n) % n], p = raw[i], b = raw[(i + 1) % n];
    let ax = p[0] - a[0], ay = p[1] - a[1], bx = b[0] - p[0], by = b[1] - p[1];
    const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
    ax /= la; ay /= la; bx /= lb; by /= lb;
    const n1x = ay, n1y = -ax, n2x = by, n2y = -bx;
    let mx = n1x + n2x, my = n1y + n2y;
    const lm = Math.hypot(mx, my) || 1;
    mx /= lm; my /= lm;
    const k = Math.min(3, 1 / Math.max(0.2, mx * n1x + my * n1y));
    out.push([p[0] - mx * d * k, p[1] - my * d * k]);
  }
  return out;
}

/* A plate cut to an outline in the XY plane, standing from zIn out to
   zOut, with its outer edge chamfered by `bevel`. zIn is meant to be
   buried in whatever the part sits on, so the plate has no visible
   back and no seam. */
function ctlPlate(g, raw, zIn, zOut, bevel = 0.0004, smooth = 40) {
  raw = ctlCCW(raw);
  const s = Math.sign(zOut - zIn) || 1;
  const prof = profileOutline(raw, smooth);
  const st = (z, pts) => ({ o: new Vec3(0, 0, z), u: CTL_X, v: CTL_Y, pts });
  if (bevel > 0 && Math.abs(zOut - zIn) > bevel * 1.5) {
    const inner = profileOutline(ctlInset(raw, bevel), smooth);
    sweepPath(g, [st(zIn, prof), st(zOut - s * bevel, prof), st(zOut, inner)], true, true);
  } else {
    sweepPath(g, [st(zIn, prof), st(zOut, prof)], true, true);
  }
}

/* A plate swept through Y instead of Z -- for parts that lie on a top
   strap rather than a side, like a shotgun's tang safety. Outline in
   (x, z); bevel on the top edge. */
function ctlPlateY(g, raw, yIn, yOut, bevel = 0.0004, smooth = 40) {
  // (z, x) basis so that u x v = +Y; the outline is given in (x, z).
  const flip = raw.map(([x, z]) => [z, x]);
  const r = ctlCCW(flip);
  const s = Math.sign(yOut - yIn) || 1;
  const prof = profileOutline(r, smooth);
  const U = new Vec3(0, 0, 1), V = new Vec3(1, 0, 0);
  const st = (y, pts) => ({ o: new Vec3(0, y, 0), u: U, v: V, pts });
  if (bevel > 0 && Math.abs(yOut - yIn) > bevel * 1.5) {
    const inner = profileOutline(ctlInset(r, bevel), smooth);
    sweepPath(g, [st(yIn, prof), st(yOut - s * bevel, prof), st(yOut, inner)], true, true);
  } else {
    sweepPath(g, [st(yIn, prof), st(yOut, prof)], true, true);
  }
}

/* Revolve an outline about an axis parallel to Z through (cx, cy).
   The outline is [d, r] pairs: d is the distance OUT from the face
   (zFace), r the radius. It must start and end on the axis so it
   closes. Normals come from the outline, so a chamfer or a dome is
   lit as one -- which is what a button needs and a stack of cylinders
   cannot give it. */
function ctlSpin(g, raw, cx, cy, zFace, side, seg = 20, smooth = 34) {
  let pts = raw.map(([d, r]) => [zFace + side * d, r]);
  pts = ctlCCW(pts);
  const prof = profileOutline(pts, smooth);
  const n = prof.length, base = g.positions.length / 3;
  const vArc = new Float64Array(n);
  for (let k = 1; k < n; k++) vArc[k] = vArc[k - 1] + Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]);
  for (let s = 0; s <= seg; s++) {
    const th = (s / seg) * TAU, c = Math.cos(th), si = Math.sin(th);
    for (let k = 0; k < n; k++) {
      const p = prof[k];
      // spin()'s revolve about X with the axes turned cyclically
      // (x, y, z) -> (y, z, x): same handedness, so the same winding.
      g.vert(cx + p[1] * c, cy + p[1] * si, p[0], p[3] * c, p[3] * si, p[2], (s / seg) * TAU * p[1], vArc[k]);
    }
  }
  for (let s = 0; s < seg; s++) {
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      g.quad(base + s * n + k, base + s * n + k2, base + (s + 1) * n + k2, base + (s + 1) * n + k);
    }
  }
}

/* A round button or hub: buried 1 mm, standing `h` proud, with its
   face edge chamfered. `dish` > 0 dishes the face in slightly, the
   way a thumb-worn button is. */
function ctlButton(g, cx, cy, zFace, side, r, h, chamfer = 0.0005, dish = 0, seg = 22) {
  const c = Math.min(chamfer, r * 0.4, h * 0.6);
  ctlSpin(g, [
    [-0.0010, 0], [-0.0010, r], [h - c, r], [h, r - c],
    [h - dish, (r - c) * 0.45], [h - dish, 0],
  ], cx, cy, zFace, side, seg, 30);
}

/* A pin end, flush but not invisible: 0.3 mm proud with a rounded edge.
   Pins are how a frame says it is assembled from parts. */
function ctlPin(g, cx, cy, zFace, side, r, h = 0.0003) {
  ctlSpin(g, [
    [-0.0008, 0], [-0.0008, r], [h * 0.4, r], [h, r * 0.7], [h, 0],
  ], cx, cy, zFace, side, 16, 50);
}

/* A slotted screw head: a low dome cut by its slot. The slot is a real
   gap between two half-domes, so it shades as a groove from any side.
   `ang` turns the slot (degrees from the X axis). */
function ctlScrew(g, cx, cy, zFace, side, r, ang = 30, h = 0.0009) {
  const slot = Math.max(0.00025, r * 0.16);
  const ca = Math.cos(ang * PI / 180), sa = Math.sin(ang * PI / 180);
  for (const half of [-1, 1]) {
    const raw = [];
    // Half disc, offset off the slot by half its width.
    for (let i = 0; i <= 10; i++) {
      const t = (i / 10) * PI;
      const lx = r * Math.cos(t), ly = half * (slot / 2 + (r - slot / 2) * Math.sin(t));
      raw.push([cx + lx * ca - ly * sa, cy + lx * sa + ly * ca]);
    }
    ctlPlate(g, raw, zFace - side * 0.0008, zFace + side * h, Math.min(h * 0.6, r * 0.35), 55);
  }
}

/* A row of serrations across a thumb pad: ridges standing `h` proud of
   the plate face at zFace, running along `dir` (a unit 2D vector in
   XY), spaced `pitch` apart, `len` long, starting at (x0, y0) and
   stepping along `step`. */
function ctlSerrate(g, x0, y0, step, dir, count, pitch, len, zFace, side, h = 0.00035, w = 0.00032) {
  const L = Math.hypot(step[0], step[1]) || 1, sx = step[0] / L, sy = step[1] / L;
  for (let i = 0; i < count; i++) {
    const cx = x0 + sx * pitch * i, cy = y0 + sy * pitch * i;
    const hx = dir[0] * len / 2, hy = dir[1] * len / 2, wx = -dir[1] * w, wy = dir[0] * w;
    ctlPlate(g, [
      [cx - hx - wx, cy - hy - wy], [cx + hx - wx, cy + hy - wy],
      [cx + hx + wx, cy + hy + wy], [cx - hx + wx, cy - hy + wy],
    ], zFace - side * 0.0004, zFace + side * h, 0, 60);
  }
}

/* A lever outline: a round hub at (hx, hy) radius hr, an arm running to
   (tx, ty) tapering to half-width tw, ending in a rounded tip. Returned
   as a closed outline for ctlPlate. */
function ctlLeverOutline(hx, hy, hr, tx, ty, aw, tw, steps = 10) {
  const dx = tx - hx, dy = ty - hy, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const out = [];
  // Hub: the back half-circle (away from the arm), from one side round to the other.
  const a0 = Math.atan2(ny, nx);
  for (let i = 0; i <= steps; i++) {
    const t = a0 + (i / steps) * PI;
    out.push([hx + hr * Math.cos(t), hy + hr * Math.sin(t)]);
  }
  // Down the arm on the -n side to the tip.
  out.push([hx - nx * aw + ux * hr * 0.6, hy - ny * aw + uy * hr * 0.6]);
  out.push([tx - nx * tw - ux * tw, ty - ny * tw - uy * tw]);
  // Rounded tip.
  const b0 = Math.atan2(-ny, -nx);
  for (let i = 1; i < steps / 2; i++) {
    const t = b0 + (i / (steps / 2)) * PI;
    out.push([tx - ux * tw + tw * Math.cos(t), ty - uy * tw + tw * Math.sin(t)]);
  }
  out.push([tx + nx * tw - ux * tw, ty + ny * tw - uy * tw]);
  out.push([hx + nx * aw + ux * hr * 0.6, hy + ny * aw + uy * hr * 0.6]);
  return out;
}

/* STAMPED LETTERS: the markings over a selector and the maker's roll
   mark down a receiver. A selector you cannot read is a lever; one that
   says SAFE and FIRE is a safety -- the words do as much of the work as
   the steel. Single-stroke capitals on a unit cap height, cut as raised
   bars by markBar (96-pistol.js), the same way the 1911's name is. */
const CTL_GLYPHS = {
  A: [0.60, [[[0, 0], [0.3, 1], [0.6, 0]], [[0.11, 0.36], [0.49, 0.36]]]],
  B: [0.60, [[[0, 0], [0, 1], [0.4, 1], [0.52, 0.9], [0.52, 0.62], [0.4, 0.53], [0, 0.53]],
             [[0.4, 0.53], [0.56, 0.43], [0.56, 0.1], [0.44, 0], [0, 0]]]],
  C: [0.60, [[[0.56, 0.85], [0.44, 0.98], [0.18, 0.98], [0.03, 0.82], [0.03, 0.18], [0.18, 0.02], [0.44, 0.02], [0.56, 0.15]]]],
  D: [0.60, [[[0, 0], [0, 1], [0.36, 1], [0.55, 0.8], [0.55, 0.2], [0.36, 0], [0, 0]]]],
  E: [0.56, [[[0.52, 1], [0, 1], [0, 0], [0.52, 0]], [[0, 0.52], [0.4, 0.52]]]],
  F: [0.54, [[[0.52, 1], [0, 1], [0, 0]], [[0, 0.52], [0.4, 0.52]]]],
  G: [0.62, [[[0.56, 0.85], [0.44, 0.98], [0.18, 0.98], [0.03, 0.82], [0.03, 0.18], [0.18, 0.02], [0.44, 0.02],
              [0.57, 0.15], [0.57, 0.45], [0.32, 0.45]]]],
  H: [0.62, [[[0, 0], [0, 1]], [[0.56, 0], [0.56, 1]], [[0, 0.52], [0.56, 0.52]]]],
  I: [0.24, [[[0.1, 0], [0.1, 1]]]],
  J: [0.50, [[[0.42, 1], [0.42, 0.18], [0.3, 0.02], [0.12, 0.02], [0.02, 0.16]]]],
  K: [0.58, [[[0, 0], [0, 1]], [[0.54, 1], [0, 0.38]], [[0.18, 0.56], [0.56, 0]]]],
  L: [0.52, [[[0, 1], [0, 0], [0.5, 0]]]],
  M: [0.74, [[[0, 0], [0, 1], [0.34, 0.3], [0.68, 1], [0.68, 0]]]],
  N: [0.62, [[[0, 0], [0, 1], [0.56, 0], [0.56, 1]]]],
  O: [0.62, [[[0.18, 0.02], [0.03, 0.18], [0.03, 0.82], [0.18, 0.98], [0.42, 0.98], [0.57, 0.82], [0.57, 0.18], [0.42, 0.02], [0.18, 0.02]]]],
  P: [0.58, [[[0, 0], [0, 1], [0.4, 1], [0.54, 0.88], [0.54, 0.62], [0.4, 0.5], [0, 0.5]]]],
  Q: [0.64, [[[0.18, 0.02], [0.03, 0.18], [0.03, 0.82], [0.18, 0.98], [0.42, 0.98], [0.57, 0.82], [0.57, 0.18], [0.42, 0.02], [0.18, 0.02]],
             [[0.36, 0.22], [0.6, -0.04]]]],
  R: [0.60, [[[0, 0], [0, 1], [0.4, 1], [0.54, 0.88], [0.54, 0.64], [0.4, 0.52], [0, 0.52]], [[0.28, 0.52], [0.56, 0]]]],
  S: [0.58, [[[0.54, 0.86], [0.42, 0.98], [0.14, 0.98], [0.03, 0.86], [0.03, 0.64], [0.14, 0.54], [0.42, 0.47],
              [0.55, 0.36], [0.55, 0.14], [0.42, 0.02], [0.13, 0.02], [0.01, 0.14]]]],
  T: [0.60, [[[0, 1], [0.6, 1]], [[0.3, 1], [0.3, 0]]]],
  U: [0.62, [[[0, 1], [0, 0.18], [0.15, 0.02], [0.41, 0.02], [0.56, 0.18], [0.56, 1]]]],
  V: [0.60, [[[0, 1], [0.3, 0], [0.6, 1]]]],
  W: [0.78, [[[0, 1], [0.18, 0], [0.38, 0.7], [0.58, 0], [0.76, 1]]]],
  X: [0.58, [[[0, 1], [0.56, 0]], [[0.56, 1], [0, 0]]]],
  Y: [0.60, [[[0, 1], [0.3, 0.48], [0.6, 1]], [[0.3, 0.48], [0.3, 0]]]],
  Z: [0.60, [[[0.02, 1], [0.56, 1], [0, 0], [0.58, 0]]]],
  0: [0.56, [[[0.15, 0.02], [0.03, 0.18], [0.03, 0.82], [0.15, 0.98], [0.37, 0.98], [0.49, 0.82], [0.49, 0.18], [0.37, 0.02], [0.15, 0.02]]]],
  1: [0.40, [[[0.1, 0.82], [0.28, 1], [0.28, 0]]]],
  2: [0.56, [[[0.03, 0.84], [0.16, 0.98], [0.38, 0.98], [0.5, 0.85], [0.5, 0.62], [0.02, 0], [0.52, 0]]]],
  3: [0.56, [[[0.03, 0.88], [0.15, 0.98], [0.38, 0.98], [0.5, 0.86], [0.5, 0.64], [0.38, 0.54], [0.2, 0.54]],
             [[0.38, 0.54], [0.52, 0.44], [0.52, 0.14], [0.38, 0.02], [0.14, 0.02], [0.02, 0.12]]]],
  4: [0.58, [[[0.4, 0], [0.4, 1], [0.02, 0.3], [0.56, 0.3]]]],
  5: [0.56, [[[0.5, 1], [0.06, 1], [0.03, 0.55], [0.18, 0.6], [0.38, 0.6], [0.52, 0.46], [0.52, 0.14], [0.38, 0.02],
              [0.14, 0.02], [0.02, 0.12]]]],
  6: [0.56, [[[0.48, 0.9], [0.36, 0.98], [0.16, 0.98], [0.03, 0.8], [0.03, 0.18], [0.16, 0.02], [0.38, 0.02], [0.51, 0.16],
              [0.51, 0.42], [0.38, 0.56], [0.16, 0.56], [0.03, 0.42]]]],
  7: [0.54, [[[0.02, 1], [0.52, 1], [0.18, 0]]]],
  8: [0.56, [[[0.26, 0.54], [0.08, 0.62], [0.06, 0.86], [0.18, 0.98], [0.36, 0.98], [0.48, 0.86], [0.46, 0.62], [0.26, 0.54],
              [0.05, 0.44], [0.03, 0.14], [0.16, 0.02], [0.38, 0.02], [0.51, 0.14], [0.49, 0.44], [0.26, 0.54]]]],
  9: [0.56, [[[0.05, 0.1], [0.16, 0.02], [0.36, 0.02], [0.49, 0.2], [0.49, 0.82], [0.36, 0.98], [0.14, 0.98], [0.03, 0.84],
              [0.03, 0.58], [0.16, 0.44], [0.36, 0.44], [0.49, 0.58]]]],
  '.': [0.22, [[[0.08, 0], [0.08, 0.06]]]],
  ',': [0.22, [[[0.1, 0.06], [0.04, -0.12]]]],
  '-': [0.42, [[[0.05, 0.45], [0.35, 0.45]]]],
  ' ': [0.36, []],
};

function ctlTextWidth(text, H) {
  let w = 0;
  for (const ch of text) w += ((CTL_GLYPHS[ch] || CTL_GLYPHS[' '])[0] + 0.12) * H;
  return Math.max(0, w - 0.12 * H);
}

/* Stamp `text` centred on (cx, baseline y) on the face of the given side,
   reading left to right from that side: on the left (-Z) face that means
   advancing towards -X, on the right towards +X. `zFace` may be a number
   or a function of y, for a face that curves. */
function ctlStamp(g, text, cx, y, H, zFace, side, opts = {}) {
  const stroke = H * (opts.weight || 0.13);
  const dir = side < 0 ? -1 : 1;
  const zAt = typeof zFace === 'function' ? zFace : () => zFace;
  let adv = -ctlTextWidth(text, H) / 2;
  for (const ch of text) {
    const gl = CTL_GLYPHS[ch] || CTL_GLYPHS[' '];
    for (const poly of gl[1]) {
      for (let i = 0; i < poly.length - 1; i++) {
        const p = poly[i], q = poly[i + 1];
        const ya = y + p[1] * H, yb = y + q[1] * H;
        const z = zAt((ya + yb) / 2);
        markBar(g, cx + dir * (adv + p[0] * H), ya, cx + dir * (adv + q[0] * H), yb,
          stroke, z - side * 0.00020, z + side * (opts.proud || 0.00022));
      }
    }
    adv += (gl[0] + 0.12) * H;
  }
}
