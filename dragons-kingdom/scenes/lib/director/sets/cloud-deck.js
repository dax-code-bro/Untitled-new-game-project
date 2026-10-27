// Shot director - the P-14 low cloud deck: a stratocumulus underside painted the way a matte painter
// would, on a huge horizontal card at the cloud base. The froxel fog bank alone averaged to a flat
// grey ceiling at this range (16 km of sky in 64 depth slices): a sky "under low cloud" needs the
// cells - thick dark cores, paler thin edges, narrow bright cracks between the cells, rolls along the
// wind - foreshortened by perspective toward the horizon. The card is lit by nothing (the underside of
// an overcast deck is a soft, nearly uniform source); the aerial perspective hazes its far part.
//
// Pure + tileable (periodic lattice noise): paintCloudDeck(img, o) fills an RGBA ImageData (thickness
// shade in RGB, coverage in A), paintCloudDetail(img, o) a greyscale alpha modulation for the near
// deck (fine wisps; the coverage tile is ~20 m per texel). Same numbers in Node and in the page.

/** periodic gradient noise: n2(x, y, px, py) repeats every px cells in x, py cells in y */
export function periodicNoise(seed = 1) {
  const hash = (i, j) => {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const wrap = (k, p) => ((k % p) + p) % p;
  const grad = (i, j, x, y, px, py) => { const a = hash(wrap(i, px), wrap(j, py)) * Math.PI * 2; return Math.cos(a) * x + Math.sin(a) * y; };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function n2(x, y, px, py) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fade(fx), v = fade(fy);
    const a = grad(i, j, fx, fy, px, py), b = grad(i + 1, j, fx - 1, fy, px, py);
    const c = grad(i, j + 1, fx, fy - 1, px, py), d = grad(i + 1, j + 1, fx - 1, fy - 1, px, py);
    return 1.4 * ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v);
  }
  /** fbm over the unit tile (u, v in [0, 1)): base px x py cells, lacunarity 2 keeps every octave periodic */
  function fbm(u, v, px, py, oct = 5, gain = 0.5) {
    let s = 0, a = 1, nrm = 0;
    for (let o = 0; o < oct; o++) {
      const k = 2 ** o;
      s += a * n2(u * px * k + 0.37 * o, v * py * k - 0.61 * o, px * k, py * k);
      nrm += a; a *= gain;
    }
    return s / nrm;
  }
  return { n2, fbm };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** periodic cellular (Worley) noise on px x py jittered cells: F1, F2 (cell units) and the cell's id hash */
export function periodicCells(seed = 1) {
  const hash = (i, j, k) => {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul((seed + k) | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const wrap = (k, p) => ((k % p) + p) % p;
  return function cells(u, v, px, py) {
    const x = u * px, y = v * py, i = Math.floor(x), j = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ci = i + di, cj = j + dj, wi = wrap(ci, px), wj = wrap(cj, py);
      const qx = ci + 0.1 + 0.8 * hash(wi, wj, 0), qy = cj + 0.1 + 0.8 * hash(wi, wj, 1);
      const d = Math.hypot(x - qx, y - qy);
      if (d < f1) { f2 = f1; f1 = d; id = hash(wi, wj, 2); } else if (d < f2) f2 = d;
    }
    return { f1, f2, id };
  };
}

export const DECK = {
  cells: [13, 18],         // cloud elements across the tile (a 20 km tile: ~1.5 x 1.1 km; rolls along x)
  sub: [37, 52],           // the lumps on an element's underside
  field: [4, 5],           // the large-scale field: thicker / broken regions of the deck
  open: [-0.32, 0.02],     // where the field is low the deck breaks into separate elements
  radius: 0.66,            // an element's radius (cell units, from its centre): the gaps lie between
  soft: 0.11,              // edge softness (cell units)
  thin: 0.9, core: 0.3,    // underside shade: thin edges -> thick cores (times the card's colour)
  warp: 0.6,               // domain warp (cell units): rounded, irregular elements, no polygons
  tint: [0.93, 0.965, 1.0],
};

/** the deck tile: RGB = underside shade (sRGB bytes), A = coverage. img: { width, height, data } */
export function paintCloudDeck(img, o = {}) {
  const P = { ...DECK, ...o };
  const N = periodicNoise(P.seed ?? 141), C = periodicCells(P.seed ?? 141), C2 = periodicCells((P.seed ?? 141) + 7);
  const W = img.width, H = img.height, d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const F = N.fbm(u, v, P.field[0], P.field[1], 5);                   // big regions
      const wu = u + P.warp / P.cells[0] * N.fbm(u, v, 6, 8, 4), wv = v + P.warp / P.cells[1] * N.fbm(u + 0.5, v + 0.25, 6, 8, 4);
      const e = C(wu, wv, P.cells[0], P.cells[1]);
      const s = C2(wu, wv, P.sub[0], P.sub[1]);
      const m = N.fbm(u, v, 64, 64, 3);                                   // mottling
      // an element: a dome round its centre, its size per cell and per region; lumps on its underside
      const R = P.radius * (0.8 + 0.3 * e.id) * (0.85 + 0.35 * smooth(-0.35, 0.3, F));
      const r = e.f1 + 0.12 * (s.f1 - 0.4) + 0.05 * m;
      const open = smooth(P.open[0], P.open[1], F + 0.3 * (e.id - 0.5));  // whole elements drop out where the field is low
      const cover = smooth(R, R - P.soft, r) * open;
      const thick = Math.pow(Math.max(0, 1 - r / R), 0.6) * (0.6 + 0.4 * smooth(-0.2, 0.35, F)) * (0.8 + 0.2 * smooth(0.6, 0.1, s.f1));
      let shade = P.thin + (P.core - P.thin) * thick;
      shade *= 0.95 + 0.1 * m;
      const k = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) d[k + ch] = Math.round(255 * Math.min(1, Math.pow(Math.max(0, shade * P.tint[ch]), 1 / 2.2)));
      d[k + 3] = Math.round(255 * Math.min(1, cover));
    }
  }
  return img;
}

/** fine detail for the near deck: a greyscale alpha modulation (0.7 .. 1), tileable */
export function paintCloudDetail(img, o = {}) {
  const N = periodicNoise(o.seed ?? 143);
  const W = img.width, H = img.height, d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const f = N.fbm(x / W, y / H, 6, 6, 5, 0.55);
      const m = Math.round(255 * (0.7 + 0.3 * smooth(-0.35, 0.3, f)));
      const k = (y * W + x) * 4;
      d[k] = d[k + 1] = d[k + 2] = m; d[k + 3] = 255;
    }
  }
  return img;
}
