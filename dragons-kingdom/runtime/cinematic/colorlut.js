// The whole colour pipeline after the camera (scene-referred grade -> tone
// mapper with its look -> display grade -> optional .cube LUT -> sRGB encode)
// baked into ONE 3D LUT behind a log2 shaper - what OpenColorIO / a DI suite
// does. On a CPU rasteriser this replaces ~30 pow/log/exp per pixel by one 3D
// texture tap (measured at 1920x1080: the grade went from ~90 ms to a few ms).
// The LUT is rebuilt in JavaScript (deterministic) only when a grade setting
// changes.
//
// Shaper: per channel, x' = (log2(x) - MIN_EV) / (MAX_EV - MIN_EV), the AgX
// domain (0.18 * 2^-10 ... 0.18 * 2^6.5); values outside clamp, as AgX does.

export const SHAPER_MIN_EV = -12.47393;
export const SHAPER_MAX_EV = 4.026069;
export const LUT_SIZE = 64;

// column-major 3x3 (like GLSL mat3(c0, c1, c2))
const mul = (c, v) => [
  c[0][0] * v[0] + c[1][0] * v[1] + c[2][0] * v[2],
  c[0][1] * v[0] + c[1][1] * v[1] + c[2][1] * v[2],
  c[0][2] * v[0] + c[1][2] * v[1] + c[2][2] * v[2],
];
const SRGB_TO_REC2020 = [[0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.0880], [0.0433, 0.0113, 0.8956]];
const REC2020_TO_SRGB = [[1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187]];
const AGX_INSET = [[0.856627153315983, 0.137318972929847, 0.11189821299995], [0.0951212405381588, 0.761241990602591, 0.0767994186031903], [0.0482516061458583, 0.101439036467562, 0.811302368396859]];
const AGX_OUTSET = [[1.1271005818144368, -0.1413297634984383, -0.14132976349843826], [-0.11060664309660323, 1.157823702216272, -0.11060664309660294], [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405]];
const ACES_IN = [[0.59719, 0.07600, 0.02840], [0.35458, 0.90834, 0.13383], [0.04823, 0.01566, 0.83777]];
const ACES_OUT = [[1.60475, -0.10208, -0.00327], [-0.53108, 1.10813, -0.07276], [-0.07367, -0.00605, 1.07602]];
const SRGB_TO_AP1 = [[0.6130973, 0.0701937, 0.0206156], [0.3395229, 0.9163556, 0.1095697], [0.0473793, 0.0134524, 0.8698151]];
const AP1_TO_SRGB = [[1.7050515, -0.1302597, -0.0240034], [-0.6217907, 1.1408029, -0.1289687], [-0.0832587, -0.0105430, 1.1529721]];
const REC709_TO_AWG3 = [[0.6313213, 0.0368201, 0.0173699], [0.2708010, 0.7930371, 0.1487893], [0.0978783, 0.1701429, 0.8338408]];
const KL = [0.2126, 0.7152, 0.0722];
const luma = (c) => c[0] * KL[0] + c[1] * KL[1] + c[2] * KL[2];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function agxContrast(x) {
  const x2 = x * x, x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
/** AgX (three.js / Filament / Blender) with an ASC-CDL look in its log domain. */
export function agx(c, look) {
  let v = mul(AGX_INSET, mul(SRGB_TO_REC2020, c));
  v = v.map((x) => agxContrast(clamp01((Math.log2(Math.max(x, 1e-10)) - SHAPER_MIN_EV) / (SHAPER_MAX_EV - SHAPER_MIN_EV))));
  if (look) {
    v = v.map((x, i) => Math.pow(Math.max(x * look.slope[i], 0), look.power[i]));
    const l = luma(v);
    v = v.map((x) => l + look.sat * (x - l));
  }
  v = mul(AGX_OUTSET, v).map((x) => Math.pow(Math.max(0, x), 2.2));
  return mul(REC2020_TO_SRGB, v).map(clamp01);
}
export function acesFilmic(c) {
  let v = mul(ACES_IN, c.map((x) => x / 0.6));
  v = v.map((x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.4329510) + 0.238081));
  return mul(ACES_OUT, v).map(clamp01);
}
export function neutral(c) {
  const start = 0.8 - 0.04, desat = 0.15;
  const x = Math.min(c[0], c[1], c[2]);
  const off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  let v = c.map((y) => y - off);
  const peak = Math.max(v[0], v[1], v[2]);
  if (peak < start) return v.map(clamp01);
  const d = 1 - start, np = 1 - (d * d) / (peak + d - start);
  v = v.map((y) => (y * np) / peak);
  const g = 1 - 1 / (desat * (peak - np) + 1);
  return v.map((y) => clamp01(y * (1 - g) + np * g));
}
export const srgbOETF = (x) => { x = clamp01(x); return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; };
export const srgbEOTF = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
function toLogC3(c) {
  const v = mul(REC709_TO_AWG3, c);
  return v.map((x) => (x > 0.010591 ? 0.247190 * Math.log10(5.555556 * x + 0.052272) + 0.385537 : 5.367655 * x + 0.092809));
}
function toAcescct(c) {
  return mul(SRGB_TO_AP1, c).map((x) => (x <= 0.0078125 ? x * 10.5402377416545 + 0.0729055341958355 : (Math.log2(Math.max(x, 1e-10)) + 9.72) / 17.52));
}
function fromAcescct(c) {
  const v = c.map((x) => (x <= 0.155251141552511 ? (x - 0.0729055341958355) / 10.5402377416545 : Math.pow(2, x * 17.52 - 9.72)));
  return mul(AP1_TO_SRGB, v);
}
/** trilinear lookup in a parsed .cube LUT (red fastest) */
function sampleCube(lut, c) {
  const N = lut.size, d = lut.data, mn = lut.domainMin, mx = lut.domainMax;
  const p = [0, 1, 2].map((i) => clamp01((c[i] - mn[i]) / (mx[i] - mn[i])) * (N - 1));
  const i0 = p.map((x) => Math.min(N - 2, Math.floor(x))), f = p.map((x, i) => x - i0[i]);
  const out = [0, 0, 0];
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    const w = (dx ? f[0] : 1 - f[0]) * (dy ? f[1] : 1 - f[1]) * (dz ? f[2] : 1 - f[2]);
    if (!w) continue;
    const o = 4 * ((i0[0] + dx) + N * ((i0[1] + dy) + N * (i0[2] + dz)));
    out[0] += w * d[o]; out[1] += w * d[o + 1]; out[2] += w * d[o + 2];
  }
  return out;
}

/**
 * The colour transform for one scene-linear colour (after exposure / white
 * balance / grain). g = cinematic.grade, look = LOOKS entry, lut = parsed
 * .cube or null. Returns display-encoded sRGB in [0,1].
 */
export function gradeColor(c, g, look, lut) {
  // scene-referred: contrast around 18% grey, saturation, CDL (in ACEScct)
  if (g.contrast !== 1) { const L = Math.max(luma(c), 1e-6); const k = (0.18 * Math.pow(L / 0.18, g.contrast)) / L; c = c.map((x) => x * k); }
  if (g.saturation !== 1) { const L = luma(c); c = c.map((x) => Math.max(0, L + g.saturation * (x - L))); }
  if (g.cdl) {
    const v3 = (x, d) => (Array.isArray(x) ? x : [x ?? d, x ?? d, x ?? d]);
    const sl = v3(g.cdl.slope, 1), of = v3(g.cdl.offset, 0), pw = v3(g.cdl.power, 1), sat = g.cdl.saturation ?? 1;
    let l = toAcescct(c).map((x, i) => Math.pow(Math.max(x * sl[i] + of[i], 0), pw[i]));
    const L = luma(l); l = l.map((x) => L + sat * (x - L));
    c = fromAcescct(l).map((x) => Math.max(0, x));
  }
  let e;
  if (lut && g.lutSpace !== 'display') {
    // a log-input LUT replaces the tone mapper; its output is display-encoded
    const inp = g.lutSpace === 'acescct' ? toAcescct(c) : toLogC3(c);
    const o = sampleCube(lut, inp).map(clamp01);
    const k = g.lutIntensity ?? 1;
    if (k < 1) { const base = agx(c, look).map(srgbOETF); e = o.map((x, i) => base[i] + k * (x - base[i])); } else e = o;
  } else {
    const d = g.toneMapping === 'agx' ? agx(c, look) : g.toneMapping === 'aces' ? acesFilmic(c) : g.toneMapping === 'neutral' ? neutral(c) : c.map(clamp01);
    e = d.map(srgbOETF);
  }
  // display grade: lift / gamma / gain (DaVinci-style, on the encoded picture)
  e = e.map((x, i) => Math.pow(Math.max(0, g.gain[i] * (x + g.lift[i] * (1 - x))), 1 / g.gamma[i]));
  if (lut && g.lutSpace === 'display') {
    const o = sampleCube(lut, e.map(clamp01));
    const k = g.lutIntensity ?? 1;
    e = e.map((x, i) => x + k * (o[i] - x));
  }
  return e.map(clamp01);
}

/** Bake the LUT: Float32Array(N^3 * 4), red fastest, indexed by the shaper. */
export function bakeGradeLut(g, look, lut, N = LUT_SIZE) {
  const data = new Float32Array(N * N * N * 4);
  const lin = new Float64Array(N);
  for (let i = 0; i < N; i++) lin[i] = Math.pow(2, SHAPER_MIN_EV + (i / (N - 1)) * (SHAPER_MAX_EV - SHAPER_MIN_EV));
  let o = 0;
  for (let b = 0; b < N; b++) for (let gg = 0; gg < N; gg++) for (let r = 0; r < N; r++) {
    const e = gradeColor([lin[r], lin[gg], lin[b]], g, look, lut);
    data[o] = e[0]; data[o + 1] = e[1]; data[o + 2] = e[2]; data[o + 3] = 1; o += 4;
  }
  return data;
}
