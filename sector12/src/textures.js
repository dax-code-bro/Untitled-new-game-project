// Procedural, tileable PBR texture library generated at load time (no image files).
// Each set: albedo (sRGB), normal+roughness (linear; rgb = tangent normal, a = roughness),
// and a roughness map for standard three.js materials. Alpha "cards" for leaves, needles and grass.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

// ---------------------------------------------------------------- tileable noise
function lattice(period, rng) {
  const a = new Float32Array(period * period);
  for (let i = 0; i < a.length; i++) a[i] = rng();
  return a;
}
const sstep = (t) => t * t * (3 - 2 * t);

// value noise in [0,1], tiles every n pixels; px/py period in lattice cells
function vnoise(n, px, py, rng) {
  const L = lattice(Math.max(px, py), rng);
  const P = Math.max(px, py);
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const fy = (y / n) * py, iy = Math.floor(fy), ty = sstep(fy - iy);
    const y0 = iy % py, y1 = (iy + 1) % py;
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * px, ix = Math.floor(fx), tx = sstep(fx - ix);
      const x0 = ix % px, x1 = (ix + 1) % px;
      const a = L[y0 * P + x0], b = L[y0 * P + x1], c = L[y1 * P + x0], d = L[y1 * P + x1];
      out[y * n + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

function fbm(n, period, oct, rng, gain = 0.5, sx = 1, sy = 1) {
  const out = new Float32Array(n * n);
  let amp = 1, norm = 0, p = period;
  for (let o = 0; o < oct && p <= n; o++) {
    const v = vnoise(n, Math.max(1, Math.round(p * sx)), Math.max(1, Math.round(p * sy)), rng);
    for (let i = 0; i < out.length; i++) out[i] += v[i] * amp;
    norm += amp; amp *= gain; p *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

// Worley / cellular: F1 and F2 distances (normalized), tileable
function cellular(n, cells, rng) {
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + rng()) / cells, (j + rng()) / cells]);
  const f1 = new Float32Array(n * n), f2 = new Float32Array(n * n), id = new Float32Array(n * n);
  const ids = pts.map(() => rng());
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n;
    const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
    let d1 = 9, d2 = 9, best = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = (ci + di + cells) % cells, jj = (cj + dj + cells) % cells;
      const p = pts[jj * cells + ii];
      let dx = p[0] - u, dy = p[1] - v;
      dx -= Math.round(dx); dy -= Math.round(dy);
      const d = Math.hypot(dx, dy) * cells;
      if (d < d1) { d2 = d1; d1 = d; best = ids[jj * cells + ii]; } else if (d < d2) d2 = d;
    }
    f1[y * n + x] = d1; f2[y * n + x] = d2; id[y * n + x] = best;
  }
  return { f1, f2, id };
}

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// draw a thin line into height/color buffers (wrapping)
function line(n, x0, y0, x1, y1, fn) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const t = s / Math.max(1, steps);
    const x = ((Math.round(x0 + (x1 - x0) * t) % n) + n) % n, y = ((Math.round(y0 + (y1 - y0) * t) % n) + n) % n;
    fn(y * n + x, t);
  }
}

// ---------------------------------------------------------------- material recipes
// each returns { col: Float32Array rgb (sRGB 0..1), h: Float32Array height 0..1, r: Float32Array roughness }
function makeBuffers(n) { return { col: new Float32Array(n * n * 3), h: new Float32Array(n * n), r: new Float32Array(n * n) }; }
function put(B, i, c, h, r) { B.col[i * 3] = c[0]; B.col[i * 3 + 1] = c[1]; B.col[i * 3 + 2] = c[2]; B.h[i] = h; B.r[i] = r; }

const RECIPES = {
  grass(n, rng) {
    const B = makeBuffers(n);
    const big = fbm(n, 4, 5, rng), mid = fbm(n, 16, 4, rng), blades = fbm(n, 64, 3, rng, 0.6, 1, 0.25), dry = fbm(n, 6, 4, rng);
    const A = hex(0x3f5524), Bc = hex(0x6c7c34), D = hex(0x8a7a4a), S = hex(0x4a3a26);
    for (let i = 0; i < n * n; i++) {
      let c = mix(A, Bc, clamp01(big[i] * 1.3 - 0.15 + (blades[i] - 0.5) * 0.6));
      c = mix(c, D, sm(0.55, 0.75, dry[i]) * 0.6);
      c = mix(c, S, sm(0.68, 0.8, 1 - mid[i]) * 0.7);
      const k = 0.85 + blades[i] * 0.3;
      put(B, i, [c[0] * k, c[1] * k, c[2] * k], blades[i] * 0.6 + mid[i] * 0.4, 0.92);
    }
    return B;
  },
  forest(n, rng) {
    // leaf litter: overlapping leaves of several ages over dark soil, then pine needles and twigs
    const B = makeBuffers(n);
    const base = fbm(n, 8, 5, rng), damp = fbm(n, 5, 4, rng);
    const soil = hex(0x2e2216), leaves = [hex(0x6a4424), hex(0x8a5a2a), hex(0x5a4a26), hex(0x7a3a1c), hex(0x9a7a3a), hex(0x4a3a22)];
    for (let i = 0; i < n * n; i++) put(B, i, mix(soil, hex(0x4a3a26), base[i] * 0.6), base[i] * 0.3, 0.9);
    const count = Math.round(n * n / 70);
    for (let k = 0; k < count; k++) {
      const cx = rng() * n, cy = rng() * n, a = rng() * Math.PI, L = (0.012 + rng() * 0.014) * n, W = L * (0.35 + rng() * 0.25);
      const c = mix(leaves[Math.floor(rng() * leaves.length)], soil, rng() * 0.35), ca = Math.cos(a), sa = Math.sin(a), top = 0.4 + k / count * 0.6;
      const R = Math.ceil(L);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const u = (dx * ca + dy * sa) / L, v = (-dx * sa + dy * ca) / W;
        const r = u * u + v * v * (1 + u * 0.6); // slightly pointed tip
        if (r > 1) continue;
        const x = ((Math.floor(cx + dx) % n) + n) % n, y = ((Math.floor(cy + dy) % n) + n) % n, i = y * n + x;
        const vein = Math.abs(v) < 0.08 ? 0.82 : 1, shade = (0.85 + 0.15 * (1 - r)) * vein;
        put(B, i, [c[0] * shade, c[1] * shade, c[2] * shade], top + (1 - r) * 0.15, 0.75 + (damp[i] - 0.5) * 0.3);
      }
    }
    // pine needles + twigs
    for (let k = 0; k < n * 1.2; k++) {
      const x = rng() * n, y = rng() * n, a = rng() * Math.PI * 2, L = 5 + rng() * 9;
      const nc = mix(hex(0x6a4a2a), hex(0x9a7a4a), rng());
      line(n, x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, (i) => { B.col[i * 3] = nc[0]; B.col[i * 3 + 1] = nc[1]; B.col[i * 3 + 2] = nc[2]; B.h[i] = Math.min(1, B.h[i] + 0.25); });
    }
    for (let k = 0; k < n / 24; k++) {
      const x = rng() * n, y = rng() * n, a = rng() * Math.PI * 2, L = 20 + rng() * 40, tc = hex(0x3a2a1a);
      for (const w of [0, 1]) line(n, x + w, y, x + Math.cos(a) * L + w, y + Math.sin(a) * L, (i) => { B.col[i * 3] = tc[0]; B.col[i * 3 + 1] = tc[1]; B.col[i * 3 + 2] = tc[2]; B.h[i] = 1; });
    }
    return B;
  },
  jungle(n, rng) {
    const B = makeBuffers(n);
    const cel = cellular(n, 16, rng), base = fbm(n, 6, 5, rng), moss = fbm(n, 10, 4, rng);
    const soil = hex(0x2a2216), leaf = hex(0x4a5a26), mossC = hex(0x2f5a1e);
    for (let i = 0; i < n * n; i++) {
      const edge = sm(0.0, 0.3, cel.f2[i] - cel.f1[i]);
      let c = mix(soil, leaf, edge * (0.4 + cel.id[i] * 0.6));
      c = mix(c, mossC, sm(0.55, 0.7, moss[i]) * 0.8);
      put(B, i, c, edge * 0.6 + base[i] * 0.4, 0.55 + base[i] * 0.2); // wet
    }
    return B;
  },
  sand(n, rng) {
    const B = makeBuffers(n);
    const warp = fbm(n, 4, 4, rng), grain = fbm(n, 128, 2, rng), tone = fbm(n, 3, 4, rng);
    const A = hex(0xcfb17a), Bc = hex(0xe6cf9c);
    for (let i = 0; i < n * n; i++) {
      const x = i % n, y = Math.floor(i / n);
      const rip = Math.pow(0.5 + 0.5 * Math.sin(((x * 0.7 + y * 0.3) / n) * Math.PI * 2 * 14 + warp[i] * 9), 2);
      const c = mix(A, Bc, tone[i] * 0.7 + rip * 0.2 + (grain[i] - 0.5) * 0.4);
      put(B, i, c, rip * 0.6 + grain[i] * 0.4, 0.95);
    }
    return B;
  },
  rock(n, rng) {
    const B = makeBuffers(n);
    const warp = fbm(n, 4, 4, rng), detail = fbm(n, 16, 5, rng), cracks = cellular(n, 7, rng), lich = fbm(n, 12, 3, rng);
    const A = hex(0x5e5952), Bc = hex(0x8e877c), L = hex(0x7a7a4a);
    for (let i = 0; i < n * n; i++) {
      const y = Math.floor(i / n);
      const strata = 0.5 + 0.5 * Math.sin((y / n) * Math.PI * 2 * 6 + warp[i] * 8);
      const crack = 1 - sm(0.0, 0.08, cracks.f2[i] - cracks.f1[i]);
      let c = mix(A, Bc, strata * 0.4 + detail[i] * 0.6);
      c = mix(c, L, sm(0.62, 0.72, lich[i]) * 0.5);
      c = mix(c, [0.12, 0.11, 0.1], crack * 0.8);
      put(B, i, c, strata * 0.3 + detail[i] * 0.7 - crack * 0.5, 0.78 - detail[i] * 0.1);
    }
    return B;
  },
  snow(n, rng) {
    const B = makeBuffers(n);
    const base = fbm(n, 4, 5, rng), fine = fbm(n, 64, 2, rng);
    const A = hex(0xc9d6e6), Bc = hex(0xf6f9fc);
    for (let i = 0; i < n * n; i++) {
      const c = mix(A, Bc, sm(0.25, 0.75, base[i]));
      const spark = fine[i] > 0.82 ? 0.25 : 0.62;
      put(B, i, c, base[i] * 0.8 + fine[i] * 0.2, spark);
    }
    return B;
  },
  dirt(n, rng) {
    const B = makeBuffers(n);
    const base = fbm(n, 8, 5, rng), peb = cellular(n, 40, rng);
    const A = hex(0x4a3826), Bc = hex(0x6e5438), P = hex(0x8a8274);
    for (let i = 0; i < n * n; i++) {
      const p = 1 - sm(0.2, 0.45, peb.f1[i]);
      let c = mix(A, Bc, base[i]);
      c = mix(c, P, p * (peb.id[i] > 0.6 ? 0.9 : 0));
      put(B, i, c, base[i] * 0.5 + p * (peb.id[i] > 0.6 ? 0.5 : 0), 0.9);
    }
    return B;
  },
  concrete(n, rng) {
    const B = makeBuffers(n);
    const base = fbm(n, 8, 6, rng), stain = fbm(n, 3, 4, rng), pores = fbm(n, 256, 1, rng);
    const A = hex(0x8c8a84), Bc = hex(0xa8a69e), St = hex(0x5e5a50);
    for (let i = 0; i < n * n; i++) {
      let c = mix(A, Bc, base[i]);
      c = mix(c, St, sm(0.6, 0.85, stain[i]) * 0.5);
      const pore = pores[i] > 0.85 ? 0.6 : 1;
      put(B, i, [c[0] * pore, c[1] * pore, c[2] * pore], base[i] * 0.5 + (pore < 1 ? -0.3 : 0), 0.88);
    }
    return B;
  },
  metal(n, rng) {
    const B = makeBuffers(n);
    const brush = fbm(n, 64, 3, rng, 0.5, 4, 0.03), base = fbm(n, 6, 4, rng), rust = fbm(n, 5, 5, rng);
    const A = hex(0x8a9096), R = hex(0x7a4a2a);
    for (let i = 0; i < n * n; i++) {
      let c = mix(A, [A[0] * 1.15, A[1] * 1.15, A[2] * 1.15], brush[i]);
      const rk = sm(0.66, 0.8, rust[i]);
      c = mix(c, R, rk * 0.8);
      put(B, i, c, brush[i] * 0.3 + rk * 0.4, 0.35 + brush[i] * 0.15 + rk * 0.45);
    }
    for (let k = 0; k < 60; k++) { // scratches
      const x = rng() * n, y = rng() * n, a = rng() * Math.PI, L = 20 + rng() * 80;
      line(n, x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, (i) => { B.col[i * 3] = Math.min(1, B.col[i * 3] * 1.25); B.col[i * 3 + 1] = Math.min(1, B.col[i * 3 + 1] * 1.25); B.col[i * 3 + 2] = Math.min(1, B.col[i * 3 + 2] * 1.25); B.r[i] = 0.25; B.h[i] -= 0.15; });
    }
    return B;
  },
  wood(n, rng) {
    const B = makeBuffers(n);
    const warp = fbm(n, 4, 4, rng, 0.5, 0.2, 2), knots = cellular(n, 5, rng);
    const A = hex(0x5e4026), Bc = hex(0x8e6a42);
    for (let i = 0; i < n * n; i++) {
      const x = i % n, y = Math.floor(i / n);
      const plank = Math.floor(y / (n / 6));
      const seam = (y % (n / 6)) < 2 ? 1 : 0;
      const grain = 0.5 + 0.5 * Math.sin((y / n) * Math.PI * 2 * 60 + warp[i] * 25 + plank * 7 + (1 - sm(0, 0.3, knots.f1[i])) * 6);
      let c = mix(A, Bc, grain * 0.6 + ((plank * 0.37) % 1) * 0.4);
      if (seam) c = [c[0] * 0.35, c[1] * 0.35, c[2] * 0.35];
      put(B, i, c, grain * 0.4 - seam * 0.6 + 0.3, 0.7);
      void x;
    }
    return B;
  },
  bark(n, rng) {
    const B = makeBuffers(n);
    const ridges = fbm(n, 16, 4, rng, 0.5, 1, 0.08), fine = fbm(n, 32, 3, rng), moss = fbm(n, 6, 4, rng);
    const A = hex(0x2e2218), Bc = hex(0x5e4632), M = hex(0x3f5a26);
    for (let i = 0; i < n * n; i++) {
      const r = Math.pow(ridges[i], 1.5);
      let c = mix(A, Bc, r * 0.8 + fine[i] * 0.2);
      c = mix(c, M, sm(0.65, 0.78, moss[i]) * 0.6);
      put(B, i, c, r * 0.8 + fine[i] * 0.2, 0.9);
    }
    return B;
  },
  water(n, rng) {
    const B = makeBuffers(n);
    const a = fbm(n, 8, 5, rng, 0.55), b = fbm(n, 24, 3, rng);
    for (let i = 0; i < n * n; i++) put(B, i, [0.2, 0.4, 0.5], a[i] * 0.7 + b[i] * 0.3, 0.05);
    return B;
  },
  fabric(n, rng) {
    const B = makeBuffers(n);
    const base = fbm(n, 4, 4, rng), dirt = fbm(n, 6, 4, rng);
    for (let i = 0; i < n * n; i++) {
      const x = i % n, y = Math.floor(i / n);
      const weave = (Math.sin((x / n) * Math.PI * 2 * 96) * Math.sin((y / n) * Math.PI * 2 * 96)) * 0.5 + 0.5;
      const v = 0.72 + weave * 0.18 + (base[i] - 0.5) * 0.15 - sm(0.6, 0.85, dirt[i]) * 0.2;
      put(B, i, [v, v, v], weave, 0.95);
    }
    return B;
  },
};

// ---------------------------------------------------------------- packing
function normalRough(B, n, strength) {
  const out = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    const hl = B.h[y * n + ((x - 1 + n) % n)], hr = B.h[y * n + ((x + 1) % n)];
    const hu = B.h[((y - 1 + n) % n) * n + x], hd = B.h[((y + 1) % n) * n + x];
    let nx = (hl - hr) * strength, ny = (hu - hd) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    out[i * 4] = (nx / l * 0.5 + 0.5) * 255;
    out[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255;
    out[i * 4 + 2] = (nz / l * 0.5 + 0.5) * 255;
    out[i * 4 + 3] = clamp01(B.r[i]) * 255;
  }
  return out;
}

function dataTex(data, n, srgb) {
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const STRENGTH = { water: 5, grass: 6, forest: 8, jungle: 6, sand: 5, rock: 10, snow: 3, dirt: 7, concrete: 3, metal: 2, wood: 4, bark: 12, fabric: 2 };

// ---------------------------------------------------------------- alpha cards
function card(n, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  draw(g, n);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function leafCard(rng, palette) {
  return card(256, (g, n) => {
    for (let k = 0; k < 34; k++) {
      const x = 30 + rng() * (n - 60), y = 30 + rng() * (n - 60), a = rng() * Math.PI * 2, s = 14 + rng() * 16;
      const c = palette[Math.floor(rng() * palette.length)];
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = c;
      g.beginPath(); g.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke();
      g.restore();
    }
  });
}

function needleCard(rng) {
  return card(256, (g, n) => {
    g.lineCap = 'round';
    for (let b = 0; b < 7; b++) {
      const x0 = rng() * n, y0 = n * 0.15 + rng() * n * 0.7, a = -0.4 + rng() * 0.8, L = n * 0.6;
      g.strokeStyle = '#4a3424'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * L, y0 + Math.sin(a) * L); g.stroke();
      for (let k = 0; k < 60; k++) {
        const t = k / 60, px = x0 + Math.cos(a) * L * t, py = y0 + Math.sin(a) * L * t, s = (1 - t * 0.6) * 18;
        g.strokeStyle = ['#1f3a1e', '#2a4a24', '#355a2c', '#1a3018'][k % 4]; g.lineWidth = 1.6;
        for (const side of [-1, 1]) { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a + side * 1.1) * s, py + Math.sin(a + side * 1.1) * s); g.stroke(); }
      }
    }
  });
}

function grassCard(rng, dry) {
  return card(256, (g, n) => {
    for (let k = 0; k < 46; k++) {
      const x = 8 + rng() * (n - 16), h = n * (0.45 + rng() * 0.55), w = 3 + rng() * 5, lean = (rng() - 0.5) * 70;
      const grad = g.createLinearGradient(0, n, 0, n - h);
      grad.addColorStop(0, dry ? '#5a4a2a' : '#2a3a16');
      grad.addColorStop(1, dry ? (rng() < 0.5 ? '#b8a46a' : '#9a8a52') : (rng() < 0.5 ? '#7a9a3a' : '#5e8030'));
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(x - w / 2, n); g.quadraticCurveTo(x + lean * 0.3, n - h * 0.5, x + lean, n - h); g.quadraticCurveTo(x + lean * 0.3 + 1, n - h * 0.5, x + w / 2, n); g.fill();
    }
  });
}

// ---------------------------------------------------------------- public
export function buildTextures(size = 512, onProgress) {
  const T = {};
  const rng = mulberry32(90210);
  const names = Object.keys(RECIPES);
  names.forEach((name, k) => {
    const B = RECIPES[name](size, rng);
    const alb = new Uint8Array(size * size * 4), rough = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      alb[i * 4] = clamp01(B.col[i * 3]) * 255; alb[i * 4 + 1] = clamp01(B.col[i * 3 + 1]) * 255; alb[i * 4 + 2] = clamp01(B.col[i * 3 + 2]) * 255; alb[i * 4 + 3] = 255;
      const r = clamp01(B.r[i]) * 255; rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = r; rough[i * 4 + 3] = 255;
    }
    const nr = normalRough(B, size, STRENGTH[name] || 4);
    T[name] = {
      map: dataTex(alb, size, true),
      nr: dataTex(nr, size, false), // normal (rgb) + roughness (a)
      rough: dataTex(rough, size, false),
      albData: alb, nrData: nr, size,
    };
    if (onProgress) onProgress(k + 1, names.length + 4, name);
  });
  // a plain normal map view of nr for three's normalMap (it ignores alpha)
  T.leaves = leafCard(rng, ['#3e6a26', '#4a7a2e', '#335a20', '#5a8a36', '#2c4a1c']);
  T.jungleLeaves = leafCard(rng, ['#2a5a1e', '#346a24', '#1f4a18', '#3f7a2a', '#4a8a30']);
  T.needles = needleCard(rng);
  T.fronds = card(256, (g, n) => {
    g.strokeStyle = '#4a5a26'; g.lineWidth = 4; g.beginPath(); g.moveTo(n / 2, n); g.lineTo(n / 2, 0); g.stroke();
    for (let k = 0; k < 44; k++) {
      const y = n - (k / 44) * n, L = Math.sin((k / 44) * Math.PI) * n * 0.48 + 6;
      for (const side of [-1, 1]) {
        g.strokeStyle = ['#3e6a26', '#4a7a2e', '#2f5a20'][k % 3]; g.lineWidth = 5;
        g.beginPath(); g.moveTo(n / 2, y); g.quadraticCurveTo(n / 2 + side * L * 0.6, y - 10, n / 2 + side * L, y + 12); g.stroke();
      }
    }
  });
  T.grassBlades = grassCard(rng, false);
  T.dryGrass = grassCard(rng, true);
  T.grassCard = T.grassBlades;
  if (onProgress) onProgress(names.length + 4, names.length + 4, 'cards');
  return T;
}

// Standard PBR material from a texture set, tiled in UV space.
export function pbr(T, name, opts = {}) {
  const s = T[name];
  const m = new THREE.MeshStandardMaterial({
    map: s.map, normalMap: s.nr, roughnessMap: s.rough, roughness: 1, metalness: opts.metalness ?? 0,
    color: opts.color ?? 0xffffff, normalScale: new THREE.Vector2(opts.normal ?? 1, opts.normal ?? 1),
  });
  return m;
}

// Stack several texture sets into 2D array textures (one sampler for many layers).
export function arrayTextures(T, names) {
  const n = T[names[0]].size, L = names.length;
  const alb = new Uint8Array(n * n * 4 * L), nr = new Uint8Array(n * n * 4 * L);
  names.forEach((k, i) => { alb.set(T[k].albData, i * n * n * 4); nr.set(T[k].nrData, i * n * n * 4); });
  const mk = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, n, n, L);
    t.format = THREE.RGBAFormat;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { alb: mk(alb, true), nr: mk(nr, false) };
}
