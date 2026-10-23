// FX library - quality tiers.
//
// The same effect is drawn at every tier with the same look (total density, colours, timing);
// a higher tier only adds resolution: more (smaller) particles, finer shadow grids, more
// ray-march steps, finer cloth and fracture. Particle opacity is normalised by the count, so a
// draft frame predicts the final frame.
//
// Tier resolution order (first that is set wins):
//   createFx(ctx, { tier })            explicit ('draft' | 'preview' | 'final' | 'ultra'; also
//                                      low / medium / high / hero ...)
//   ctx.quality.fxTier / ctx.quality.tier   (render presets / the gpu-tier track)
//   ctx.meta.fxTier
//   auto: from the preset and the GPU: SwiftShader (CPU) never above 'preview'; a real GPU gets
//         'final' at the final presets and 'ultra' when ctx.quality.tier === 'ultra'.
// What a tier scales: particle counts (smoke, dust, fire, sparks, water spray; density
// renormalised), shadow-grid and noise-volume resolution, ray-march and shadow steps, cloth grid,
// fracture (fragment counts and variants), decal SSR steps (16 / 24 / 32 / 48), decal resolution.

export const TIERS = {
  // CPU iteration on the cloud box (960x540)
  draft: { name: 'draft', particles: 0.35, grid: 20, steps: 24, shadowSteps: 4, sim: 120, cloth: 0.6, fracture: 0.6, decalRes: 256, castShadow: false, noise3D: 48 },
  // full-HD previews
  preview: { name: 'preview', particles: 0.6, grid: 28, steps: 32, shadowSteps: 5, sim: 180, cloth: 0.8, fracture: 0.8, decalRes: 512, castShadow: false, noise3D: 64 },
  // native 4K on the render PC's GPU
  final: { name: 'final', particles: 1.0, grid: 40, steps: 56, shadowSteps: 6, sim: 240, cloth: 1.0, fracture: 1.0, decalRes: 1024, castShadow: true, noise3D: 96 },
  // hero shots on a big GPU (RTX 4090): 2.5x the particles, finer grids
  ultra: { name: 'ultra', particles: 2.5, grid: 56, steps: 96, shadowSteps: 8, sim: 360, cloth: 1.25, fracture: 1.3, decalRes: 2048, castShadow: true, noise3D: 128 },
};

/** Name of the GL renderer (UNMASKED when allowed). */
export function glRendererName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch (e) { return 'unknown'; }
}
export const isSoftwareGL = (name) => /swiftshader|llvmpipe|softpipe|software/i.test(name);

// other names a quality setting may use (the runtime's own tiers, a preset) -> the FX tier
const ALIASES = { low: 'draft', fast: 'draft', cpu: 'draft', medium: 'preview', mid: 'preview', high: 'final', gpu: 'final', '4k': 'final', hero: 'ultra', epic: 'ultra', max: 'ultra' };
export const tierName = (n) => (n == null ? null : TIERS[n] ? n : ALIASES[String(n).toLowerCase()] || null);

/**
 * Pick the tier for this render. Returns a copy of the tier object (+ .gpu, .reason).
 * ctx.quality.fxParticles (a number) further scales the particle counts of the chosen tier
 * (a render PC with headroom can ask for 1.5x without changing anything else).
 */
export function resolveTier(ctx, want) {
  const gl = glRendererName(ctx.renderer);
  const soft = isSoftwareGL(gl);
  let name = tierName(want && want !== 'auto' ? want : (ctx.quality?.fxTier || ctx.quality?.tier || ctx.meta?.fxTier || null));
  let reason = name ? 'explicit' : 'auto';
  if (!name || !TIERS[name]) {
    const p = ctx.preset || 'final';
    if (soft) name = p === 'draft' ? 'draft' : 'preview';
    else name = p === 'draft' ? 'preview' : p === 'preview' ? 'preview' : 'final';
    reason = `auto (${p}, ${soft ? 'software GL' : 'GPU'})`;
  }
  const t = { ...TIERS[name], gpu: !soft, glRenderer: gl, reason };
  const k = Number(ctx.quality?.fxParticles);
  if (Number.isFinite(k) && k > 0) t.particles *= k;
  return t;
}

/** Scale a particle count by the tier (at least `min`). */
export const scaleCount = (tier, n, min = 1) => Math.max(min, Math.round(n * tier.particles));
