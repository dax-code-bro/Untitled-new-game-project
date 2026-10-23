// Shot director - the P-16 wing-shaped cloud: a painted cloud card (RGBA), the way a matte painter would
// do it. The outline is a spread wyvern wing seen from below - the arm rising from the root to the wrist,
// the leading finger running on to the tip, the other fingers radiating from the wrist to the trailing
// edge, the membrane scalloped between the finger tips - but only as a DENSITY BIAS: fbm decides where
// the vapour is, every edge dissolves into wisps, and the finger bones read as denser streaks of cloud.
// Pure: paintWingCloud(img, fbm, smooth) fills img.data (width x height RGBA, 2:1) deterministically.

const P = {
  root: [0.08, 0.52], rootLow: [0.2, 0.74], wrist: [0.72, 0.3], tip: [1.95, 0.2],
  // the finger tips on the trailing edge, from the tip back toward the body: splayed back like a
  // soaring wing (fingers hanging straight down read as legs)
  fingers: [[1.82, 0.56], [1.5, 0.8], [1.12, 0.88]],
  tilt: 8,                                    // degrees: the whole wing rises toward its tip
};

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** quadratic bezier from a to b, its control point pulled from the chord's middle toward `pull` */
function bow(a, b, pull, k, n = 14) {
  const m = lerp2(a, b, 0.5), c = lerp2(m, pull, k);
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

/** the wing outline as a closed polygon in X (0..2), Y (0..1, down) */
export function wingOutline() {
  const { root, rootLow, wrist, tip, fingers } = P;
  const poly = [root];
  poly.push(...bow(root, wrist, [0.3, 0.12], 0.35));            // the arm: a slight upward bow
  poly.push(...bow(wrist, tip, [1.4, 0.1], 0.3));               // the leading finger
  let prev = tip;
  for (const f of fingers) { poly.push(...bow(prev, f, wrist, 0.5)); prev = f; }   // scallops toward the wrist
  poly.push(...bow(prev, rootLow, wrist, 0.38));
  poly.push(...bow(rootLow, root, [0.0, 0.65], 0.1, 6));
  return poly;
}

function segDist(px, py, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy;
  const t = L2 > 1e-12 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / L2)) : 0;
  const dx = px - (a[0] + vx * t), dy = py - (a[1] + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}

export function paintWingCloud(img, fbm, smooth) {
  const { data, width: W, height: H } = img;
  const poly = wingOutline();
  const bones = [[P.root, P.wrist], [P.wrist, P.tip], ...P.fingers.map((f) => [P.wrist, f])];
  const clamp = (x) => Math.max(0, Math.min(1, x));
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    // rotate the sample point about the card centre (the wing rises toward the tip)
    const ca = Math.cos((P.tilt * Math.PI) / 180), sa = Math.sin((P.tilt * Math.PI) / 180);
    const cx = (i + 0.5) / W * 2 - 1, cy = (j + 0.5) / H - 0.5;
    const u = (ca * cx - sa * cy + 1) / 2, v = sa * cx + ca * cy + 0.5;
    // warped sample point: the outline breaks into wisps
    const X = u * 2 + 0.07 * fbm(u * 4 + 9, v * 4) + 0.025 * fbm(u * 14 + 2, v * 12 + 5);
    const Y = v + 0.06 * fbm(u * 4, v * 4 + 4) + 0.02 * fbm(u * 15 + 8, v * 13);
    // signed distance to the outline (negative inside)
    let d = Infinity, inside = false;
    for (let k = 0, n = poly.length; k < n; k++) {
      const a = poly[k], b = poly[(k + 1) % n];
      d = Math.min(d, segDist(X, Y, a, b));
      if ((a[1] > Y) !== (b[1] > Y) && X < ((b[0] - a[0]) * (Y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    if (inside) d = -d;
    const body = smooth(0.04, -0.09, d);
    // the bones: denser vapour streaks (the arm and the leading finger thickest)
    let bone = 0;
    bones.forEach(([a, b], q) => {
      const w = q < 2 ? 0.045 : 0.026;
      bone = Math.max(bone, Math.exp(-Math.pow(segDist(X, Y, a, b) / w, 2)) * (q < 2 ? 1 : 0.75));
    });
    // the membrane thins toward the trailing edge between the fingers
    const n1 = fbm(u * 6, v * 4) * 0.5 + 0.5, n2 = fbm(u * 22 + 7, v * 14) * 0.5 + 0.5, n3 = fbm(u * 60 + 3, v * 40 + 1) * 0.5 + 0.5;
    // a thin membrane (the sky shows through) between dense bone streaks: the skeleton reads
    const memb = body * (0.4 + 0.16 * smooth(0.0, -0.2, d));
    const dens = (memb + bone * smooth(0.06, -0.03, d) * 0.6) * (0.6 + 0.55 * n1) * (0.72 + 0.4 * n2) * (0.85 + 0.3 * n3);
    const a = clamp(smooth(0.12, 0.75, dens)) * 0.95;
    // lit from above and the sun side: the upper (leading) part brighter, dense cores greyer
    const top = smooth(0.35, 0.0, Y - 0.25 - 0.1 * Math.abs(X - 0.8));
    const shade = clamp(0.68 + 0.24 * top + 0.14 * (n2 - 0.5) - 0.06 * smooth(0.45, 0.95, dens) + 0.06 * bone);
    const k = (j * W + i) * 4;
    data[k] = 255 * shade; data[k + 1] = 248 * shade; data[k + 2] = 240 * shade; data[k + 3] = 255 * a;
  }
  return img;
}
