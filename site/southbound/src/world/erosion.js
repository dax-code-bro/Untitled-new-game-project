// Particle-based hydraulic erosion (after Hans Theobald Beyer's
// "Implementation of a method for hydraulic erosion", 2015).
// Raindrops roll downhill, pick up sediment where they speed up and drop it
// where they slow down, carving gullies and filling valleys.

export function erode(h, n, opts = {}) {
  const {
    drops = 200000, seed = 1, heightScale = 60, maxSteps = 56, radius = 3,
    inertia = 0.06, capacity = 5, minSlope = 0.01, depositRate = 0.3, erodeRate = 0.35,
    evaporate = 0.015, gravity = 4, skip = null,
  } = opts;
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // work in normalised height units
  const inv = 1 / heightScale;
  for (let i = 0; i < h.length; i++) h[i] *= inv;

  // erosion brush: weights within `radius`
  const bOff = [], bW = [];
  let wsum = 0;
  for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
    const d = Math.hypot(x, y);
    if (d < radius) { bOff.push([x, y]); const w = 1 - d / radius; bW.push(w); wsum += w; }
  }
  for (let i = 0; i < bW.length; i++) bW[i] /= wsum;

  const heightGrad = (px, py, out) => {
    const x = px | 0, y = py | 0, u = px - x, v = py - y, k = y * n + x;
    const a = h[k], b = h[k + 1], c = h[k + n], d = h[k + n + 1];
    out.gx = (b - a) * (1 - v) + (d - c) * v;
    out.gy = (c - a) * (1 - u) + (d - b) * u;
    out.h = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
    return out;
  };
  const g = { gx: 0, gy: 0, h: 0 };
  for (let it = 0; it < drops; it++) {
    let px = 1 + rnd() * (n - 3), py = 1 + rnd() * (n - 3);
    if (skip && skip(px, py)) continue;
    let dx = 0, dy = 0, speed = 1, water = 1, sed = 0;
    for (let step = 0; step < maxSteps; step++) {
      const nx = px | 0, ny = py | 0, u = px - nx, v = py - ny, k = ny * n + nx;
      heightGrad(px, py, g);
      const hOld = g.h;
      if (hOld * heightScale < 0.3) break; // reached the sea
      dx = dx * inertia - g.gx * (1 - inertia);
      dy = dy * inertia - g.gy * (1 - inertia);
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) break;
      dx /= len; dy /= len;
      px += dx; py += dy;
      if (px < 1 || py < 1 || px > n - 2 || py > n - 2) break;
      const hNew = heightGrad(px, py, g).h;
      const dh = hNew - hOld;
      const cap = Math.max(-dh, minSlope) * speed * water * capacity;
      if (sed > cap || dh > 0) {
        // deposit (fill the pit if going uphill)
        const amt = dh > 0 ? Math.min(dh, sed) : (sed - cap) * depositRate;
        sed -= amt;
        h[k] += amt * (1 - u) * (1 - v); h[k + 1] += amt * u * (1 - v);
        h[k + n] += amt * (1 - u) * v; h[k + n + 1] += amt * u * v;
      } else {
        // erode with the brush, never deeper than the drop just fell
        const amt = Math.min((cap - sed) * erodeRate, -dh);
        for (let b = 0; b < bOff.length; b++) {
          const bx = nx + bOff[b][0], by = ny + bOff[b][1];
          if (bx < 0 || by < 0 || bx >= n || by >= n) continue;
          const bk = by * n + bx, w = amt * bW[b];
          const take = h[bk] < w ? h[bk] : w;
          h[bk] -= take; sed += take;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed + dh * -gravity));
      water *= 1 - evaporate;
    }
  }
  for (let i = 0; i < h.length; i++) h[i] *= heightScale;
}
