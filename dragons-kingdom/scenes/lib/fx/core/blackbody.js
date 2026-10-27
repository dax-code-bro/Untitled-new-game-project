// FX library - flame emission in ABSOLUTE scene radiance from a temperature (blackbody).
//
// A sooty flame glows like a blackbody at the soot temperature (~1000-2100 K). Its colour is
// the Planck spectrum integrated against the CIE 1931 observer (analytic fit, Wyman et al. 2013)
// and converted to linear sRGB, normalised to luminance 1. Its brightness rises steeply with T;
// the physical law (B(T) rising ~10^4 between 1100 and 1900 K) is tamed by the soot's emissivity
// to a power of the Planck luminance: Y = Y0 (Y_P(T) / Y_P(1500 K))^gamma.
//
// Units: scene-linear radiance, the units the scene's lit materials write. In the show's daylight
// sets the sun's irradiance is ~5 (a white card in full sun reads ~1.4): 1 unit ~ 2e4 cd/m^2. A
// large luminous fire is ~1e4 cd/m^2 in its body and ~1e5 in its core -> Y0 (1500 K) ~ 0.45 and
// ~5-10 at 2000-2100 K. Graded through the film finish (AgX + cinema look) that gives saturated
// orange bodies (Y 0.15-0.5), red-brown tips (Y < 0.1) and cores that clip to yellow-white and
// bloom (Y > 6) - a peach / pastel flame is what Y ~ 1-2 over the whole body gives.
//
// The same tables drive the fire lights (fire.js): a flame's light on its surroundings is its
// radiance times its emitting area, so the light and the visible flame can never disagree.

// CIE 1931 observer, multi-lobe Gaussian fit (Wyman, Sloan, Shirley 2013)
const g = (x, mu, s1, s2) => { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
const xb = (l) => 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2);
const yb = (l) => 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
const zb = (l) => 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);
const planck = (l, T) => { const m = l * 1e-9; return 1 / (Math.pow(m, 5) * (Math.exp(1.4388e-2 / (m * T)) - 1)); };

/** Linear sRGB chroma (luminance 1) and Planck luminance (arbitrary units) of a blackbody at T. */
export function blackbody(T) {
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) { const p = planck(l, T); X += p * xb(l); Y += p * yb(l); Z += p * zb(l); }
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const gg = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  // (below ~1900 K blue is out of the sRGB gamut: clip it and renormalise the luminance)
  const c = [Math.max(r, 0), Math.max(gg, 0), Math.max(b, 0)];
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return { rgb: [c[0] / L, c[1] / L, c[2] / L], Y };
}

export const BB_T0 = 700, BB_DT = 100, BB_N = 23;      // 700 .. 2900 K
const Y1500 = blackbody(1500).Y;
/** Table: [r, g, b (luminance 1), log2(Y_P(T) / Y_P(1500))] per BB_DT kelvin. */
export const BB_TABLE = Array.from({ length: BB_N }, (_, i) => {
  const b = blackbody(BB_T0 + i * BB_DT);
  return [b.rgb[0], b.rgb[1], b.rgb[2], Math.log2(b.Y / Y1500)];
});

/**
 * Flame emission palettes. 'blackbody' (Charcoal's ordinary orange-red fire, burning cloth /
 * wood): chroma from T. Leaf's purplish-blue fire is not a soot glow (DRAGONS.md: his own fire),
 * so it maps the same temperature field through a hue ramp (edge -> body -> core, luminance 1)
 * with the same brightness law - the dynamic range (dark violet tips, saturated blue-violet
 * body, a small clipped blue-white core) is what keeps it from reading lavender.
 */
export const FLAME_PALETTES = {
  standard: { kind: 'blackbody', Y0: 0.45, gamma: 0.5, tCore: 2250, tTip: 1000, soot: 1.0 },
  burn: { kind: 'blackbody', Y0: 0.42, gamma: 0.5, tCore: 2150, tTip: 1050, soot: 1.0 },
  // (a ramp: low T -> edge, mid -> body, high -> core; colours renormalised to luminance 1)
  leaf: { kind: 'ramp', edge: [0.45, 0.05, 1.0], body: [0.18, 0.1, 1.0], core: [0.62, 0.62, 1.0], Y0: 0.32, gamma: 0.5, tCore: 2150, tTip: 1100, soot: 0.35 },
};
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const unitLum = (c) => { const l = lum(c) || 1; return [c[0] / l, c[1] / l, c[2] / l]; };

/** Normalised palette (+ GLSL uniform values). p: name | object. */
export function flamePalette(p) {
  const P = typeof p === 'object' && p ? { ...FLAME_PALETTES[p.base || 'standard'], ...p } : FLAME_PALETTES[p] || FLAME_PALETTES.standard;
  const out = { ...P };
  if (P.kind === 'ramp') { out.edgeN = unitLum(P.edge); out.bodyN = unitLum(P.body); out.coreN = unitLum(P.core); }
  return out;
}

const tableAt = (T) => {
  const f = Math.min(BB_N - 1.001, Math.max(0, (T - BB_T0) / BB_DT)), i = Math.floor(f), u = f - i;
  const a = BB_TABLE[i], b = BB_TABLE[i + 1];
  return [0, 1, 2, 3].map((k) => a[k] + (b[k] - a[k]) * u);
};

/** Scene-linear radiance [r,g,b] of thick flame at temperature T (K) - the JS twin of fxFlameRad. */
export function flameRadiance(T, pal) {
  const P = pal.kind ? pal : flamePalette(pal);
  const e = tableAt(T);
  const Y = P.Y0 * Math.pow(2, P.gamma * e[3]);
  let c = [e[0], e[1], e[2]];
  if (P.kind === 'ramp') {
    const u = Math.min(1, Math.max(0, (T - P.tTip) / (P.tCore - P.tTip)));
    c = u < 0.5 ? P.edgeN.map((x, k) => x + (P.bodyN[k] - x) * (u / 0.5)) : P.bodyN.map((x, k) => x + (P.coreN[k] - x) * ((u - 0.5) / 0.5));
  }
  return [c[0] * Y, c[1] * Y, c[2] * Y];
}

/** Uniforms for the GLSL below. */
export function flameUniforms(pal, THREE) {
  const P = pal.kind ? pal : flamePalette(pal);
  return {
    uBB: { value: BB_TABLE.map((r) => new THREE.Vector4(r[0], r[1], r[2], r[3])) },
    uFlameY0: { value: P.Y0 }, uFlameGamma: { value: P.gamma },
    uFlameRamp: { value: P.kind === 'ramp' ? 1 : 0 },
    uRampEdge: { value: new THREE.Vector3(...(P.edgeN || [1, 0.3, 0.05])) },
    uRampBody: { value: new THREE.Vector3(...(P.bodyN || [1, 0.3, 0.05])) },
    uRampCore: { value: new THREE.Vector3(...(P.coreN || [1, 0.8, 0.5])) },
    uTTip: { value: P.tTip }, uTCore: { value: P.tCore },
  };
}

export const BLACKBODY_GLSL = /* glsl */`
uniform vec4 uBB[${BB_N}];
uniform float uFlameY0, uFlameGamma, uFlameRamp, uTTip, uTCore;
uniform vec3 uRampEdge, uRampBody, uRampCore;
// scene-linear radiance of optically thick flame at temperature T (kelvin)
vec3 fxFlameRad(float T) {
  float f = clamp((T - ${BB_T0.toFixed(1)}) / ${BB_DT.toFixed(1)}, 0.0, ${(BB_N - 1.001).toFixed(3)});
  int i = int(floor(f)); float u = f - float(i);
  vec4 e = mix(uBB[i], uBB[i + 1], u);
  float Y = uFlameY0 * exp2(uFlameGamma * e.w);
  vec3 c = e.rgb;
  if (uFlameRamp > 0.5) {
    float r = clamp((T - uTTip) / max(uTCore - uTTip, 1.0), 0.0, 1.0);
    c = r < 0.5 ? mix(uRampEdge, uRampBody, r / 0.5) : mix(uRampBody, uRampCore, (r - 0.5) / 0.5);
  }
  return c * Y;
}
`;
