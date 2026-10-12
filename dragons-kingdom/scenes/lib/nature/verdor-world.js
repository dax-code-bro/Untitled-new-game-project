// Verdor coast - the world definition shared by the offline bake (Node) and the runtime.
//
// ONE coherent geology for Verdor ("weathered pale stone", screenplay palette): a pale grey-cream,
// well-bedded marine LIMESTONE (think Carboniferous limestone sea cliffs: Pembrokeshire's Stack
// Rocks, the Gower, the Burren coast) - horizontal-ish beds that dip gently along the coast and
// arch over the headland, cut by two sets of near-vertical joints. Everything below follows from
// that one rock:
//   * beds of different hardness: massive beds stand proud as ledges and overhangs, thin shaly
//     partings weather back into notches (the stepped profile of a real limestone face);
//   * joints: the face breaks back along them in planar facets and steps; weak joints become geos
//     (narrow inlets) and sea caves; the platform is crossed by grikes along the same joints;
//   * a wave-cut notch at the foot, a wave-cut platform on a resistant bed near sea level,
//     rockfall talus under the face, sea stacks / skerries where resistant blocks survive, an arch
//     through the narrowest headland, and the OUTER ROCKS: a chain of stacks and reefs off "the
//     point" (screenplay 1F / 2C: the outcrop the scout banks round; "beyond the outer rocks").
//   * a beach (sand with a shingle berm) where a valley reaches the sea in the southern bay.
//
// World frame (same as style frame F3): metres, y up, sea level y = 0 (mid tide), the coast runs
// along z (north = +z), the SEA is toward +x, Verdor's land toward -x. The flight line 1C-1E
// travels +z (screen left -> right) with the camera on the land side (-x) looking out to sea.
//
//   import { createVerdorWorld } from './verdor-world.js';
//   const W = createVerdorWorld();            // pure functions of position, deterministic
//   W.installLand(sampler)                    // the eroded land height (baked; see offline/bake-verdor.mjs)
//   W.sdf(x, y, z)                             // signed distance to rock (negative inside), metres
//   W.coastF(x, z)                             // ~ distance seaward of the coastline (m)
//   W.landHeight(x, z), W.floorHeight(x, z), W.surfaceHeight(x, z)
import { makeNoise, hash2, hash3, smoothstep, clamp, lerp, smin, smax, mulberry } from './noise.js';

const G = (z, c, s, a) => a * Math.exp(-(((z - c) / s) ** 2));

export const VERDOR = {
  seed: 1407,
  bake: { z: [-2000, 2000], tile: 32 },            // the 3D cliff band (sdf meshed in tiles)
  land: { x: [-2600, 1000], z: [-2400, 2400], cell: 4 },   // the eroded heightmap
  tide: { high: 1.6, low: -1.6 },
  point: { z: 700 },                                 // "the point" with the outer rocks off it
  beachBay: { z: -1500 },
  archHeadland: { z: -900 },
};

export function createVerdorWorld(opts = {}) {
  const seed = opts.seed ?? VERDOR.seed;
  const N = makeNoise(seed), N2 = makeNoise(seed + 11), N3 = makeNoise(seed + 23);

  // ------------------------------------------------------------- coastline (plan) ---
  // xc(z): where the cliff foot would stand without the joint-block structure.
  const Z0 = -3200, Z1 = 3200, ZR = 0.25, NZ = Math.round((Z1 - Z0) / ZR) + 1;
  const xcT = new Float64Array(NZ), gT = new Float64Array(NZ);
  function xcRaw(z) {
    return 40 * Math.sin(z * 0.0023 + 0.4) + 25 * Math.sin(z * 0.0061 + 1.1) + 14 * N.fbm2(z / 90, 3.7, 4) + 5 * N.fbm2(z / 23, 9.1, 3)
      + G(z, 700, 170, 235)      // the point (outer rocks)
      - G(z, -1500, 230, 230)    // the southern bay with the beach
      + G(z, -900, 62, 105)      // the narrow headland with the arch
      - G(z, -350, 140, 70)      // a cove
      - G(z, 1300, 200, 140)     // the northern bay (boulder beach)
      + G(z, 1820, 140, 90);     // a headland
  }
  for (let i = 0; i < NZ; i++) xcT[i] = xcRaw(Z0 + i * ZR);
  for (let i = 0; i < NZ; i++) { const a = xcT[Math.max(0, i - 24)], b = xcT[Math.min(NZ - 1, i + 24)]; gT[i] = Math.sqrt(1 + ((b - a) / (48 * ZR)) ** 2); }
  function xc(z) { const f = clamp((z - Z0) / ZR, 0, NZ - 1.001), i = Math.floor(f), t = f - i; return xcT[i] + (xcT[i + 1] - xcT[i]) * t; }
  function gnorm(z) { const f = clamp((z - Z0) / ZR, 0, NZ - 1.001), i = Math.floor(f), t = f - i; return gT[i] + (gT[i + 1] - gT[i]) * t; }
  /** ~ signed distance seaward of the smooth coastline (m) */
  const coastF = (x, z) => { const d = x - xc(z); return d / (1 + (gnorm(z) - 1) * Math.exp(-Math.abs(d) / 120)); };

  // ------------------------------------------------------------------ strata ---
  // stratigraphic height s = y + dipH(x, z): beds dip gently to the south along the coast and
  // arch over the point (a broad, gentle anticline)
  const dipH = (x, z) => 0.034 * z + 7 * Math.sin(z * 0.0021 + 0.9) - 9 * Math.exp(-(((z - 700) / 500) ** 2)) + 0.006 * x;
  const beds = [];   // { b0, b1, hard, tint, recess }
  {
    const r = mulberry(seed + 5);
    // bed thickness is log-normal (many thin beds, a few very thick ones: 0.06-6.5 m), not uniform
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
    const logn = (med, sd, lo, hi) => clamp(med * Math.exp(sd * gauss()), lo, hi);
    let s = -220, pkg = 0, pkgLeft = 0;
    while (s < 420) {
      if (pkgLeft <= 0) { pkg = r() < 0.5 ? 1 : 0; pkgLeft = 6 + r() * 26; }       // 1 = massive package, 0 = thin-bedded
      let t, hard;
      const q = r();
      if (q < (pkg ? 0.1 : 0.3)) { t = logn(0.14, 0.6, 0.06, 0.5); hard = 0.05 + r() * 0.2; }       // shaly parting
      else if (q < (pkg ? 0.42 : 0.9)) { t = logn(0.75, 0.65, 0.15, 3.0); hard = 0.45 + r() * 0.4; } // ordinary bed
      else { t = logn(2.8, 0.45, 1.4, 6.5); hard = 0.82 + r() * 0.18; }                           // massive bed
      const tint = r();
      beds.push({ b0: s, b1: s + t, hard, tint, recess: (1 - hard) * (1 - hard) * 2.4 + r() * 0.25 });
      s += t; pkgLeft -= t;
    }
  }
  const BS0 = beds[0].b0, BSR = 0.05, bedLut = new Int32Array(Math.ceil((beds[beds.length - 1].b1 - BS0) / BSR) + 2);
  { let k = 0; for (let i = 0; i < bedLut.length; i++) { const s = BS0 + i * BSR; while (k < beds.length - 1 && beds[k].b1 <= s) k++; bedLut[i] = k; } }
  function bedAt(s) { const i = clamp(Math.floor((s - BS0) / BSR), 0, bedLut.length - 1); let k = bedLut[i]; while (k < beds.length - 1 && beds[k].b1 <= s) k++; while (k > 0 && beds[k].b0 > s) k--; return k; }

  // the weathering recess of the face as a function of stratigraphic height s, pre-filtered so
  // thin shaly partings become grooves the mesh can resolve: fine (bed-scale) + coarse
  // (package-scale) relief; hard massive beds stand proud, thin-bedded packages recede.
  const RS0 = BS0, RSR = 0.05, RN = Math.ceil((beds[beds.length - 1].b1 - BS0) / RSR) + 2;
  const recessLut = new Float32Array(RN), hardLut = new Float32Array(RN);
  {
    const raw = new Float32Array(RN), hr = new Float32Array(RN);
    for (let i = 0; i < RN; i++) { const k = bedAt(RS0 + i * RSR); raw[i] = Math.pow(1 - beds[k].hard, 1.3) * 4.5; hr[i] = beds[k].hard; }
    const blur = (src, sigma) => {
      const r = Math.ceil(sigma * 3 / RSR), w = [];
      for (let k = -r; k <= r; k++) w.push(Math.exp(-0.5 * ((k * RSR) / sigma) ** 2));
      const ws = w.reduce((a, b) => a + b, 0), out = new Float32Array(RN);
      for (let i = 0; i < RN; i++) { let a = 0; for (let k = -r; k <= r; k++) a += src[clamp(i + k, 0, RN - 1)] * w[k + r]; out[i] = a / ws; }
      return out;
    };
    // bed-scale relief stays crisp (hard beds stand proud with square arrises, partings cut in
    // sharply); only a little package-scale relief (the broad bulges read as stacked mattresses)
    const f1 = blur(raw, 0.09), f2 = blur(raw, 1.5), h1 = blur(hr, 0.12);
    for (let i = 0; i < RN; i++) { recessLut[i] = 0.95 * f1[i] + 0.35 * f2[i]; hardLut[i] = h1[i]; }
  }
  const lutAt = (lut, s) => { const f = clamp((s - RS0) / RSR, 0, RN - 1.001), i = Math.floor(f), t = f - i; return lut[i] + (lut[i + 1] - lut[i]) * t; };
  const recessAt = (s) => lutAt(recessLut, s), hardAt = (s) => lutAt(hardLut, s);

  // ------------------------------------------------------------------ joints ---
  // two near-vertical sets: A strikes across the coast (normal ~ +z), B along it (normal ~ +x)
  const aA = (78 * Math.PI) / 180, aB = aA - (92 * Math.PI) / 180;
  const nA = [Math.cos(aA), Math.sin(aA)], nB = [Math.cos(aB), Math.sin(aB)];
  function jointLines(mean, jit, sd) {
    const r = mulberry(sd), out = [];
    let u = -4200;
    while (u < 4200) { out.push(u); u += mean * (0.45 + r() * 1.1) * (r() < 0.12 ? 0.45 : 1); }
    return Float64Array.from(out);
  }
  // spacing: a few metres to ~20 m (wide-spaced master joints with the odd close pair)
  const UA = jointLines(12, 0.6, seed + 31), UB = jointLines(13, 0.6, seed + 37);
  const weakA = new Uint8Array(UA.length);  // weak joints -> geos and caves
  for (let i = 0; i < UA.length; i++) weakA[i] = hash2(i, 3, seed) < 0.05 ? 1 : 0;
  const findIdx = (arr, u) => { let lo = 0, hi = arr.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= u) lo = m; else hi = m; } return lo; };
  const projA = (x, z) => x * nA[0] + z * nA[1], projB = (x, z) => x * nB[0] + z * nB[1];

  // mainland survival distance per joint block: how far seaward of xc(z) the block still stands
  function blockL(i, j, cx, cz) {
    let L = 9 * N2.fbm2(cx / 95, cz / 95, 3) + 7 * N2.fbm2(cx / 28 + 4, cz / 28, 2) + (hash2(i, j, seed + 41) - 0.5) * 11;
    // the bay heads are a gentle bank, not a jagged face
    L -= 4 * Math.exp(-(((cz + 1500) / 260) ** 2));
    return L;
  }
  const EXPAND = 4.0;   // internal joints: blocks overlap their neighbours (no grooves or slots along closed joints)

  // ------------------------------------------------------------- stacks, arch, caves ---
  // convex jointed pillars: { x, z, r (m), top (m), facets }, + the outer rocks off the point
  const stacks = [];
  {
    const tip = xcRaw(700);
    // the OUTER ROCKS off the point (screenplay: "beyond the outer rocks", the coastal outcrop the
    // scout banks round): not a parade of tall stacks but what a real limestone point leaves behind -
    // two stacks close to the point, a broken stump, then low wave-worn skerries and reef ledges
    // awash at mid tide, scattered irregularly over ~330 m; open, navigable water beyond them
    const chain = [
      [tip + 40, 712, 14, 38], [tip + 96, 674, 10, 19], [tip + 152, 742, 8, 5.5],
      [tip + 128, 704, 7, 0.6], [tip + 186, 664, 9, 0.2], [tip + 207, 776, 6, 0.9], [tip + 246, 718, 11, -0.3],
      [tip + 291, 688, 5, 0.4], [tip + 318, 762, 8, -0.5], [tip + 176, 820, 5, 0.5], [tip + 262, 632, 6, 0.1],
    ];
    for (const [x, z, r, top] of chain) stacks.push({ x, z, r, top, outer: true, skerry: top < 2.5 });
    // scattered stacks and stumps along the coast
    const r = mulberry(seed + 77);
    for (const zc of [-1720, -1180, -620, -40, 260, 1040, 1560, 1950]) {
      const z = zc + (r() - 0.5) * 80, x = xcRaw(z) + 28 + r() * 45, rad = 5 + r() * 9;
      stacks.push({ x, z, r: rad, top: 8 + r() * 30, outer: false });
      if (r() < 0.6) stacks.push({ x: x + 12 + r() * 20, z: z + (r() - 0.5) * 40, r: 3 + r() * 4, top: 1.5 + r() * 5, outer: false });
    }
    const mkFacets = (x, z, r, salt) => {
      // 6-9 facets: mostly along the two joint directions (blocky), a few oblique (fresh falls)
      const nf = 6 + Math.floor(hash2(Math.round(x * 3), Math.round(z * 3), seed + salt) * 4), f = [];
      for (let k = 0; k < nf; k++) {
        const h = hash2(k, Math.round(x * 7 + z) + salt, seed + 3);
        const base = [aA, aB, aA + Math.PI, aB + Math.PI][k % 4];
        const ang = k < 4 ? base + (h - 0.5) * 0.14 : h * Math.PI * 2;
        f.push([Math.cos(ang), Math.sin(ang), r * (0.68 + 0.5 * hash2(k, 9 + salt, Math.round(z)))]);
      }
      return f;
    };
    for (const s of stacks) {
      const n = s.r > 9 ? 3 : s.r > 5 ? 2 : 1;
      s.pieces = [];
      for (let q = 0; q < n; q++) {
        const a = hash2(q, Math.round(s.x), seed + 17) * Math.PI * 2, d = q ? s.r * (0.35 + 0.3 * hash2(q, 4, Math.round(s.z))) : 0;
        const pr = q ? s.r * (0.45 + 0.25 * hash2(q, 5, Math.round(s.x))) : s.r * 0.8;
        const px = s.x + Math.cos(a) * d, pz = s.z + Math.sin(a) * d;
        // the main piece keeps the full height, side pieces are lower (older falls)
        const ptop = q ? s.top * (0.45 + 0.4 * hash2(q, 6, Math.round(s.z))) : s.top;
        s.pieces.push({ x: px, z: pz, r: pr, top: ptop, facets: mkFacets(px, pz, pr, q * 13) });
      }
      s.facets = s.pieces[0].facets;
    }
  }
  // the arch through the narrow headland (along z), and sea caves at the foot of weak joints
  const archZ = -900, archX = xcRaw(-900) - 14;
  const arch = { x: archX, z: archZ, hw: 8.5, hh: 13, y0: -2, len: 70 };
  const caves = [];
  {
    const r = mulberry(seed + 91);
    for (const zc of [-1290, -760, -470, -150, 120, 480, 940, 1180, 1690]) {
      const z = zc + (r() - 0.5) * 60;
      // run inland along the nearest A joint (that is how real caves follow joints)
      const u = projA(xcRaw(z), z), i = findIdx(UA, u), uj = UA[i];
      caves.push({ uj, z, depth: 14 + r() * 26, hw: 2.2 + r() * 3.0, hh: 3.5 + r() * 6, y0: -1.5 + r() * 0.8 });
    }
  }

  // ----------------------------------------------------------- land (heightmap) ---
  // baseLand: before erosion (the bake erodes it); landHeight: the installed eroded map + turf detail
  function baseLand(x, z) {
    const F = coastF(x, z), din = Math.max(0, -F);
    const edge = 46 + 9 * N.fbm2(z / 420, 1.3, 3) + 12 * Math.exp(-(((z - 700) / 320) ** 2)) - 41 * Math.exp(-(((z + 1500) / 190) ** 2))
      - 14 * Math.exp(-(((z - 1300) / 200) ** 2)) + 6 * Math.exp(-(((z + 900) / 160) ** 2));
    let h = edge + 75 * smoothstep(0, 2300, din) * (0.75 + 0.25 * N.fbm2(x / 900, z / 900, 3))
      + 28 * N3.ridged2(x / 650 + 3, z / 650, 4) * smoothstep(80, 700, din)
      + 6 * N.fbm2(x / 160, z / 160, 4) * smoothstep(10, 120, din);
    h -= 2.5 * smoothstep(-60, 0, F);   // the land tilts a little toward the edge
    // the valley that reaches the southern bay: its floor falls to the beach
    {
      const zv = -1500 + 140 * Math.sin(x / 330 + 0.5) + 50 * Math.sin(x / 120);
      const w = 55 + 0.06 * din, dl = Math.abs(z - zv);
      const vf = 3.6 + 0.022 * din + 4 * smoothstep(400, 2000, din);
      h = lerp(h, Math.min(h, vf + Math.pow(dl / w, 1.6) * 6), Math.exp(-((dl / (w * 1.6)) ** 2)) * smoothstep(-40, 30, -F + 40));
    }
    // a shallow hanging valley above the northern bay
    {
      const zv = 1300 + 60 * Math.sin(x / 260);
      const w = 40 + 0.05 * din, dl = Math.abs(z - zv);
      const vf = 26 + 0.03 * din;
      h = lerp(h, Math.min(h, vf + (dl / w) ** 2 * 8), Math.exp(-((dl / (w * 1.4)) ** 2)) * 0.9);
    }
    return h;
  }
  let land = null;    // { sample(x, z) } installed after the erosion bake (falls back to baseLand)
  function installLand(sampler) { land = sampler; }
  const turf = (x, z) => 0.16 * N3.fbm2(x / 4.5, z / 4.5, 3) + 0.06 * N3.n2(x / 1.3 + 7, z / 1.3);
  function landHeight(x, z) { return (land ? land.sample(x, z) : baseLand(x, z)) + turf(x, z); }

  // ----------------------------------------------------------- floor: platform, beach, sea bed ---
  const platWidth = (z) => Math.max(0, 16 + 18 * N2.fbm2(z / 140, 2.2, 3) + 34 * Math.exp(-(((z - 700) / 150) ** 2)) - 30 * Math.exp(-(((z + 1500) / 260) ** 2)) - 12 * Math.exp(-(((z - 1300) / 180) ** 2)));
  const beachW = (z) => Math.exp(-(((z + 1500) / 170) ** 2));
  function seabed(x, z) {
    const F = coastF(x, z), d = Math.max(0, F - platWidth(z) - 6);
    let y = -1.6 - 0.07 * d - 9 * smoothstep(20, 260, d) - 10 * smoothstep(250, 900, d) + 0.9 * N3.fbm2(x / 30, z / 30, 3) + 0.5 * Math.max(0, N3.fbm2(x / 6, z / 6, 3));
    // the beach: sand shelving from a shingle berm at the back of the bay
    const bw = beachW(z);
    if (bw > 0.01) {
      const fb = F + 4;
      const beach = 3.6 - 0.085 * fb + 0.7 * Math.exp(-(((fb - 9) / 5) ** 2)) + 0.1 * N3.n2(x / 9, z / 9);
      y = lerp(y, Math.max(beach, y), smoothstep(0.05, 0.6, bw) * smoothstep(-10, 6, -Math.abs(fb - 30) + 60));
    }
    return y;
  }
  /** the platform surface: a bedding plane near sea level, stepping where beds outcrop */
  function platLevel(x, z) {
    const dh = dipH(x, z);
    const target = -0.3 + 0.5 * N2.fbm2(x / 40, z / 40, 3);
    const k = bedAt(target + dh);
    const b = beds[k];
    // the nearest bedding plane if one is close (the platform steps where beds outcrop), else a
    // surface planed straight across a thick bed
    const near = (target + dh - b.b0 < b.b1 - target - dh) ? b.b0 : b.b1;
    const y = Math.abs(near - dh - target) < 0.7 ? near - dh : target;
    return y + 0.06 * N3.n2(x / 3, z / 3);
  }

  // ------------------------------------------------------------------ the SDF ---
  // every joint block either stands or has fallen (whole blocks: the outline is made of joint
  // planes). land[k]: 0 unknown, 1 sea, 2 land (cliff), 3 land (platform only)
  const NBJ = UB.length;
  const landT = new Uint8Array(UA.length * NBJ);
  function blockCenter(i, j) {
    const cu = 0.5 * (UA[i] + UA[i + 1]), cv = 0.5 * (UB[j] + UB[j + 1]);
    const det = nA[0] * nB[1] - nA[1] * nB[0];
    return [(cu * nB[1] - cv * nA[1]) / det, (cv * nA[0] - cu * nB[0]) / det];
  }
  function blockState(i, j) {
    if (i < 0 || j < 0 || i >= UA.length - 1 || j >= NBJ - 1) return 1;
    const k = i * NBJ + j;
    let st = landT[k];
    if (!st) {
      const [cx, cz] = blockCenter(i, j);
      const F = coastF(cx, cz), L = blockL(i, j, cx, cz);
      st = F < L ? 2 : F < L + platWidth(cz) + 4 * (hash2(i, j, seed + 61) - 0.5) ? 3 : 1;
      landT[k] = st;
    }
    return st;
  }
  const isCliff = (i, j) => blockState(i, j) === 2;
  const isRock = (i, j) => blockState(i, j) >= 2;
  // the lateral pinch-out of the beds: the stratigraphic height s = y + dipH + pinch, so beds
  // thicken and thin along the coast instead of running as parallel ruled bands
  const pinch = (x, z, s0) => 1.4 * N3.fbm3(x / 260, s0 / 16, z / 260, 2);
  // where the upper cliff is a vegetated head over a vertical wall (0..1)
  const sow = (x, z) => smoothstep(-0.05, 0.35, N3.fbm2(x / 260 + 7, z / 260, 3));
  // the smooth part of the block survival distance (where the face foot is, on average)
  const footF = (x, z) => 9 * N2.fbm2(x / 95, z / 95, 3);
  const wallTopAt = (top, sw) => Math.max(top - lerp(4, 27, sw), Math.min(top - 3, 9));
  // Each joint block near the edge is capped at the top of a HARD bed (ledges are bedding planes):
  // the clifftop steps down block by block over the head instead of a smooth soil ramp slicing the
  // blocks diagonally (the triangular rock shards sticking out of the turf). Infinity: no cap.
  const capT = new Float64Array(UA.length * NBJ).fill(NaN);
  function blockCap(i, j) {
    if (i < 0 || j < 0 || i >= UA.length - 1 || j >= NBJ - 1) return Infinity;
    const k = i * NBJ + j;
    let v = capT[k];
    if (v === v) return v;
    v = Infinity;
    if (blockState(i, j) === 2) {
      const [cx, cz] = blockCenter(i, j);
      const F = coastF(cx, cz), ff = footF(cx, cz) + 2, top = landHeight(cx, cz), sw = sow(cx, cz);
      const slopeT = lerp(0.45, 1.25, sw);
      // the head slope at the block's front third sets the block's height
      const ySl = wallTopAt(top, sw) + Math.max(0, ff - F - 3) * slopeT + 1.5 * (hash2(i, j, seed + 113) - 0.5);
      if (ySl < top - 1.2) {
        const s0 = ySl + dipH(cx, cz), sS = s0 + pinch(cx, cz, s0);
        let kb = bedAt(sS);
        while (kb > 0 && !(beds[kb].b1 <= sS + 0.01 && beds[kb].hard > 0.5)) kb--;
        v = beds[kb].b1;
      }
    }
    capT[k] = v;
    return v;
  }
  /** the joint blocks around (x, z) with their side distances (outside > 0) */
  function blocksAt(x, z) {
    const u = projA(x, z), v = projB(x, z);
    const ia = findIdx(UA, u), ib = findIdx(UB, v);
    const out = [];
    for (let di = -1; di <= 1; di++) {
      const i = ia + di; if (i < 0 || i >= UA.length - 1) continue;
      for (let dj = -1; dj <= 1; dj++) {
        const j = ib + dj; if (j < 0 || j >= NBJ - 1) continue;
        const st = blockState(i, j);
        if (st === 1) continue;
        out.push({
          i, j, st,
          // [left, right, back, front] signed distances, and whether each side faces fallen ground
          d: [UA[i] - u, u - UA[i + 1], UB[j] - v, v - UB[j + 1]],
          ex: [!isCliff(i - 1, j), !isCliff(i + 1, j), !isCliff(i, j - 1), !isCliff(i, j + 1)],
          exP: [!isRock(i - 1, j), !isRock(i + 1, j), !isRock(i, j - 1), !isRock(i, j + 1)],
          cap: st === 2 ? blockCap(i, j) : Infinity,
          // a side whose neighbour is capped lower is exposed above that neighbour's cap
          nc: [blockCap(i - 1, j), blockCap(i + 1, j), blockCap(i, j - 1), blockCap(i, j + 1)],
          tr: blockTraits(i, j),
        });
      }
    }
    return { u, v, ia, ib, list: out };
  }
  function stackPlan(x, z, s) {
    let d = -1e9;
    for (const [fx, fz, r] of s.facets) d = Math.max(d, (x - s.x) * fx + (z - s.z) * fz - r);
    return d;
  }
  // block-level character: rockfall scars (the upper face set back), lean, chimneys along joints
  function blockTraits(i, j) {
    // rockfall scars and lean come in patches that span several blocks (a fall takes a section of
    // face, not one joint block), with a little per-block variation on top
    const [cx, cz] = blockCenter(i, j);
    const h1 = hash2(i, j, seed + 101), h2 = hash2(i, j, seed + 103);
    const scar = smoothstep(0.05, 0.45, N2.fbm2(cx / 42 + 11, cz / 42, 3));
    // one block in five has moved on its own: set back 0.1-1.5 m along its joints and leaning out
    // 0.5-3 degrees (blocks toppling away from the face)
    const h3 = hash2(i, j, seed + 107), own = h3 < 0.2;
    return {
      scarD: scar * (4 + 4 * h1),
      scarH: 6 + 34 * (0.5 + 0.5 * N3.fbm2(cx / 55 + 3, cz / 55, 2)) + (h2 - 0.5) * 4,
      lean: -0.04 + 0.2 * smoothstep(-0.4, 0.5, N.fbm2(cx / 75 + 5, cz / 75, 2)) + (own ? -(0.01 + 0.04 * hash2(i, j, seed + 109)) : 0),
      setback: own ? 0.1 + 1.4 * hash2(i, j, seed + 111) : 0,
    };
  }
  function tunnel(lx, ly, hw, hh, y0) {
    // cross-section: a round-headed arch on near-vertical walls
    const yc = y0 + hh * 0.35;
    if (ly > yc) return (Math.hypot(lx / hw, (ly - yc) / (hh * 0.65)) - 1) * Math.min(hw, hh * 0.65);
    return Math.max(Math.abs(lx) - hw, (y0 - 2.5) - ly);
  }
  const nearStacks = (x, z, pad) => stacks.filter((s) => Math.abs(x - s.x) < s.r * 2.6 + pad && Math.abs(z - s.z) < s.r * 2.6 + pad);
  /** talus: debris aprons banked against the foot, thicker under high faces and in patches */
  function talus(x, z, F, top) {
    const d = F - footF(x, z) + 3;
    if (d < -30 || d > 40) return 0;
    const patch = smoothstep(-0.25, 0.45, N3.fbm2(x / 70, z / 70, 3));
    const hgt = clamp((top - 10) / 45, 0, 1);
    return (0.2 + 7.5 * patch * hgt) * Math.exp(-Math.max(0, d) / (4 + 7 * patch)) * smoothstep(-30, -4, d);
  }
  // minor joints (platform fissures only): 0-2 extra lines inside each master interval
  const minorA = (i) => { const n = Math.floor(hash2(i, 41, seed) * 3); const out = []; for (let k = 0; k < n; k++) out.push(UA[i] + (0.2 + 0.6 * hash2(i, 42 + k, seed)) * (UA[i + 1] - UA[i])); return out; };
  const minorB = (j) => { const n = Math.floor(hash2(j, 51, seed) * 3); const out = []; for (let k = 0; k < n; k++) out.push(UB[j] + (0.2 + 0.6 * hash2(j, 52 + k, seed)) * (UB[j + 1] - UB[j])); return out; };
  /** platform fissures (grikes): open only along some joints, broken into en-echelon segments
   *  that step sideways along the joint, widths 0.1-0.6 m (a grid of continuous slots reads as a
   *  ruined slipway) */
  function grikeDist(u, v, ia, ib) {
    let best = 1e9;
    const one = (line, along, id, fam) => {
      if (hash2(id, fam, seed + 8) > (fam === 1 ? 0.62 : 0.5)) return;
      const segL = 4 + 7 * hash2(id, fam + 2, seed + 8);
      const sg = Math.floor(along / segL + hash2(id, fam + 4, seed));
      if (hash3(id, sg, fam, seed + 9) < 0.35) return;                 // a closed stretch
      const off = (hash3(id, sg, fam, seed + 10) - 0.5) * 0.9;          // en-echelon step
      const w = 0.05 + 0.28 * hash3(id, sg, fam, seed + 11) * (0.6 + 0.4 * N3.n2(along / 3 + id, fam));
      const fr = (along / segL + hash2(id, fam + 4, seed)) - sg;       // 0..1 along the segment
      const taper = smoothstep(0, 0.15, fr) * smoothstep(1, 0.85, fr);  // segments taper shut at their ends
      best = Math.min(best, Math.abs(line + off) - w * taper);
    };
    for (let di = 0; di <= 1; di++) { const i = ia + di; if (i >= 0 && i < UA.length) one(u - UA[i], v, i, 1); }
    for (let dj = 0; dj <= 1; dj++) { const j = ib + dj; if (j >= 0 && j < UB.length) one(v - UB[j], u, j + 7000, 2); }
    if (ia >= 0 && ia < UA.length - 1) for (const m of minorA(ia)) one(u - m, v, ia * 7 + 3 + Math.round(m), 3);
    if (ib >= 0 && ib < UB.length - 1) for (const m of minorB(ib)) one(v - m, u, ib * 7 + 5 + Math.round(m), 4);
    return best;
  }
  /** potholes in the platform (scoured by trapped cobbles): [plan distance, depth] */
  function pothole(x, z) {
    const g = 3.2, xi = Math.floor(x / g), zi = Math.floor(z / g);
    let best = 1e9, dep = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const cx = xi + a, cz = zi + b;
      if (hash2(cx, cz, seed + 131) > 0.16) continue;
      const px = (cx + hash2(cx, cz, seed + 132)) * g, pz = (cz + hash2(cx, cz, seed + 133)) * g;
      const r = 0.25 + 0.7 * hash2(cx, cz, seed + 134);
      const d = Math.hypot(x - px, z - pz) - r;
      if (d < best) { best = d; dep = 0.25 + 0.5 * hash2(cx, cz, seed + 135); }
    }
    return [best, dep];
  }

  /** per-(x, z) values shared by every y of a column (the mesher evaluates columns) */
  function column(x, z) {
    const F = coastF(x, z);
    const top = landHeight(x, z);
    const B = blocksAt(x, z);
    const ff = footF(x, z) + 2;
    // the platform: a ragged outline (not the joint-block grid, which read as a slipway) with
    // joint-aligned bites, carved by fissures and potholes
    const pw = platWidth(z);
    let platPlan = F - (ff + pw + 7 * N2.fbm2(x / 30 + 3, z / 30, 3) + 2.5 * N3.fbm2(x / 8, z / 8, 2));
    // a few bites along weak A joints at the seaward edge (channels the sea has opened)
    { const du = Math.min(B.u - UA[B.ia], UA[B.ia + 1] - B.u), ji = B.u - UA[B.ia] < UA[B.ia + 1] - B.u ? B.ia : B.ia + 1;
      if (hash2(ji, 61, seed) < 0.3) platPlan = Math.max(platPlan, Math.min(1.2 + 1.5 * hash2(ji, 62, seed) - du, platPlan + 5 + 8 * hash2(ji, 63, seed))); }
    platPlan += 0.3 * N3.n2(x / 2.2, z / 2.2);
    const grike = grikeDist(B.u, B.v, B.ia, B.ib);
    const [ph, phd] = pothole(x, z);
    // weak joints: geos
    let geo = 1e9;
    for (let di = 0; di <= 1; di++) {
      const i = B.ia + di;
      if (i < 0 || i >= UA.length || !weakA[i]) continue;
      const len = 10 + 26 * hash2(i, 5, seed), gw = 1.6 + 2.8 * hash2(i, 6, seed);
      geo = Math.min(geo, Math.max(Math.abs(B.u - UA[i]) - gw * (0.75 + 0.5 * smoothstep(-len, 0, F)), -F - len));
    }
    const floor = seabed(x, z) + talus(x, z, F, top);
    // chimneys: open joints in the face (A set), a few metres deep from the front
    let chim = 1e9;
    for (let di = 0; di <= 1; di++) {
      const i = B.ia + di;
      if (i < 0 || i >= UA.length) continue;
      const hc = hash2(i, 77, seed);
      if (hc > 0.16) continue;
      const w = 0.35 + 1.3 * hash2(i, 78, seed), reach = 2 + 8 * hash2(i, 79, seed);
      chim = Math.min(chim, Math.max(Math.abs(B.u - UA[i]) - w, (ff - F) - reach));
    }
    return {
      x, z, F, top, floor, plat: platLevel(x, z), platPlan, grike, ph, phd, geo, blocks: B.list.filter((b) => b.st === 2), u: B.u, v: B.v,
      stacks: nearStacks(x, z, 8), notchD: 1.8 + 2.0 * N2.fbm2(x / 60, z / 60, 2), dh: dipH(x, z),
      expo: 0.75 + 0.5 * smoothstep(-0.4, 0.4, N2.fbm2(x / 220, z / 220, 2)),
      footF: ff, chim,
    };
  }

  // side channel of the last sdf() call: the effective top of the rock mass at that point (the
  // land surface, or the cap of the block that defines the surface) - read by surfaceInfo()
  let lastTop = 0;
  /** Signed distance to rock (m), negative inside. col: column(x, z) for the same x, z (optional). */
  function sdf(x, y, z, col) {
    const c = col || column(x, z);
    const F = c.F, top = c.top;
    const s0 = y + c.dh, s = s0 + pinch(x, z, s0);
    const k = bedAt(s);
    const hard = hardAt(s), soft = 1.35 - hard;
    // the face's recess: bed weathering (pre-filtered profile, stronger where exposed), the
    // wave-cut notch, gentle undulation of the joint faces
    let R = recessAt(s) * c.expo;
    R += c.notchD * Math.exp(-(((y - 1.0) / 1.7) ** 2));          // the wave-cut notch
    R += (0.3 + 0.25 * soft) * N.fbm3(x / 9, y / 5, z / 9, 2);
    // fracture relief: broken rock is planar facets with sharp steps at a few scales, plus
    // conchoidal ridges (0.3-1 m, 5-15 cm deep) - not round bulges
    R += 0.38 * N2.facet3(x / 5, y / 3.6, z / 5) + 0.14 * N.facet3(x / 2.1, y / 1.7, z / 2.1);
    { const q = 1 - Math.abs(N3.n3(x / 0.75, y / 0.9, z / 0.75)); R -= 0.13 * q * q; }
    // mainland: union of standing joint blocks; only sides that face fallen ground weather back
    // (internal joints stay closed); per block and bed: old falls and fresh scars
    let plan = 1e9, winTop = top;
    for (const bl of c.blocks) {
      const pk = Math.floor((s + 7 * hash2(bl.i, bl.j, seed + 9)) / (4 + 6 * hash2(bl.i, bl.j, seed + 11)));
      const per = (hash3(bl.i, bl.j, pk, seed + 5) - 0.5) * 0.6 + (hash3(bl.i, bl.j, k, seed + 6) - 0.5) * 0.45 * (1.1 - hard);
      const tr = bl.tr;
      const Rb = R + per + tr.setback + tr.scarD * smoothstep(tr.scarH - 0.6, tr.scarH + 0.6, y) + tr.lean * Math.max(0, y - 2);
      let d = -1e9;
      for (let q = 0; q < 4; q++) {
        // joints do not run straight through the whole cliff: they end at bedding planes and step
        // sideways from one bed package to the next (staggered joints), so a joint reads as a broken,
        // offset crack - not a ruled vertical line from the top to the sea (the 'piano keys')
        const jid = q < 2 ? bl.i + q : bl.j + q - 2 + 5000;
        const kp = Math.floor((k + 3 * hash2(jid, 9, seed + 20)) / 3);
        const stag = hash3(jid, kp, 0, seed + 22) < 0.6 ? (hash3(jid, kp, 1, seed + 21) - 0.5) * (q < 2 ? 2.6 : 1.4) : 0;
        const dq = bl.d[q] + (q === 0 || q === 2 ? stag : -stag);
        // a side is exposed where the neighbour has fallen, or above the neighbour's lower cap
        if (!bl.ex[q] && !(s > bl.nc[q] + 0.05)) { d = Math.max(d, dq - EXPAND); continue; }
        // joint faces are neither flat nor vertical: they wander and lean a little
        const wav = 0.7 * N3.n2(y / 4.5 + jid * 0.37, jid * 1.7) + 0.3 * N3.n2(y / 1.7, jid * 3.1 + 9) + (hash2(jid, q, seed + 15) - 0.5) * 0.24 * (y - 20);
        d = Math.max(d, dq + Rb + wav);
      }
      // the block's cap: a bedding plane, with a small arris chamfer
      if (bl.cap < 1e8) d = smax(d, (s - bl.cap) * 0.98, 0.2);
      if (d < plan) { plan = d; winTop = Math.min(top, bl.cap < 1e8 ? y - (s - bl.cap) : top); }
    }
    // stacks: convex jointed pillars, capped on a bedding plane. They stand on their own: the
    // land surface, the head slope, geos and chimneys belong to the mainland and must not clip them
    let stk = 1e9;
    for (const st of c.stacks) {
      for (const pc of st.pieces) {
        let sp = stackPlan(x, z, pc) + R * 0.4 + 0.12 * Math.max(0, y - 2) * (0.5 + 0.5 * N3.n2(st.x * 0.1, y / 12));
        // undercut notch at the waterline (deeper on the seaward side)
        sp += (1.2 + 1.1 * Math.max(0, (x - st.x) / (st.r + 1))) * Math.exp(-(((y - 0.4) / 1.25) ** 2));
        let d;
        if (st.skerry) {
          // wave-worn skerry: low, rounded on top, jointed in plan
          sp += 0.5 * N.n2(x / 3 + st.z, z / 3);
          const cap = pc.top + 0.5 * N.n2(x / 4, z / 4 + st.x) - 0.35 * ((x - pc.x) ** 2 + (z - pc.z) ** 2) / (pc.r * pc.r + 1);
          d = smax(sp, y - cap, 0.9);
        } else {
          sp += 0.45 * N2.facet3(x / 3, y / 3.5, z / 3) + 0.25 * N.n2(x / 5 + st.z, z / 5);
          // the top steps down block by block on hard-bed tops
          const want = pc.top + 0.9 * N.n2(x / 6, z / 6 + st.x) - 3.0 * hash2(Math.floor(c.u / 5), Math.floor(c.v / 5), Math.round(pc.x));
          const s0w = want + c.dh;
          let kb = bedAt(s0w);
          while (kb > 0 && !(beds[kb].b1 <= s0w + 0.01 && beds[kb].hard > 0.5)) kb--;
          d = smax(sp, s - beds[kb].b1, 0.25);
        }
        stk = Math.min(stk, d);
      }
      if (st.outer || st.skerry) {
        // a reef ledge around the base, awash at low water: something for the surf to break on
        const rp = stackPlan(x, z, { ...st.pieces[0], facets: st.pieces[0].facets.map(([a, b, r]) => [a, b, r * 1.55 + 5]) }) + 2.2 * N2.fbm2(x / 9, z / 9, 2);
        const rtop = -1.35 + 0.35 * N3.n2(x / 5, z / 5) + 0.25 * Math.max(0, N.n2(x / 1.6, z / 1.6));
        stk = smin(stk, smax(rp, y - rtop, 0.6), 0.8);
      }
    }
    plan = smax(plan, -c.geo, 0.6);
    plan = smax(plan, -(c.chim + 0.9 * N3.n3(x / 2.5, y / 4, z / 2.5) + 1.2 * smoothstep(0.2, 0.6, N2.n2(y / 9 + x * 0.01, z * 0.01))), 0.3);
    let f = smax(plan, y - top, 0.7);                              // the cliff-top edge (a small round)
    if (stk < 1e8) f = smin(f, stk, 0.35);
    // sea caves (along their joints) and the arch
    for (const cv of caves) {
      if (Math.abs(z - cv.z) > 70) continue;
      const a = -F;
      if (a > cv.depth + 8 || a < -40) continue;
      const lx = c.u - cv.uj - 0.4 * cv.hw * Math.sin(c.v * 0.13);
      const taper = clamp(1 - Math.max(0, a) / (cv.depth * 1.15), 0.25, 1);
      let tv = tunnel(lx, y, cv.hw * taper, cv.hh * (0.45 + 0.55 * taper), cv.y0);
      tv = Math.max(tv, a - cv.depth) + 0.4 * N.n3(x / 2, y / 2, z / 2);
      f = smax(f, -tv, 0.8);
    }
    if (Math.abs(z - arch.z) < arch.len && Math.abs(x - arch.x) < 40) {
      const tv = tunnel(x - arch.x + 2 * Math.sin(z * 0.05), y, arch.hw, arch.hh, arch.y0) + 0.5 * N.n3(x / 3, y / 3, z / 3);
      f = smax(f, -tv, 1.0);
    }
    // the wave-cut platform (a bedding-plane surface), its fissures and potholes, and the sea bed / beach / talus
    let pl = Math.max(y - c.plat, c.platPlan);
    pl = smax(pl, -Math.max(c.grike, (c.plat - 0.9) - y), 0.06);
    if (c.ph < 0.3) pl = smax(pl, -Math.max(c.ph, (c.plat - c.phd) - y), 0.15);
    f = smin(f, pl, 0.25);
    f = smin(f, y - c.floor, 0.8);
    lastTop = winTop;
    return f;
  }
  /** per-vertex extras for the bake: [depth below the rock mass's top (m), bed pinch (m)] */
  function surfaceInfo(x, y, z, col) {
    const c = col || column(x, z);
    sdf(x, y, z, c);
    const s0 = y + c.dh;
    return [Math.max(0, lastTop - y), pinch(x, z, s0)];
  }

  /** the height of the visible ground surface in plan (for scattering and the far heightfield) */
  function surfaceHeight(x, z) {
    const c = column(x, z);
    let lo = Math.min(c.floor, c.plat) - 3, hi = Math.max(c.top, c.floor, ...c.stacks.map((s) => s.top)) + 3;
    if (sdf(x, lo, z, c) > 0) return lo;
    for (let it = 0; it < 28; it++) { const m = 0.5 * (lo + hi); if (sdf(x, m, z, c) < 0) lo = m; else hi = m; }
    return 0.5 * (lo + hi);
  }

  return {
    seed, VERDOR, N, beds, bedAt, dipH, UA, UB, nA, nB, stacks, caves, arch,
    xc, coastF, baseLand, installLand, landHeight, turf, seabed, platLevel, platWidth, beachW,
    column, sdf, surfaceHeight, surfaceInfo, recessAt, hardAt, sow, blockState, blockCenter, blockCap, projA, projB, findIdx, weakA, talus, footF, pinch,
  };
}
