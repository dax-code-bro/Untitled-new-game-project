// Quality-tier benchmark for render/gpu-check.mjs: render the GPU check's test frame at the final tier
// and the higher tiers (runtime/lib/quality.js) on THIS graphics card, check that every tier draws the
// same picture structure (no NaN, no black frames), and plan Episode 1 at every tier from the measured
// speeds: the recommendation is the highest tier that keeps the whole episode under the budget (~3 days).
//
//   const r = await benchTiers({ scene, time, cinematic, gpu, gpuProfile, tiers: ['high', 'ultra'], size, frames, log });
//   const plan = planFromBench(r, { finalSteadyS (the 4K final frame gpu-check measured), refSteadyS (the cloud CPU's),
//                                   cpuHours (render-schedule total), setupH, budgetH: 72 });
//
// Speeds of the tiers are measured RELATIVE to the final tier on the same card at the same size, and
// scaled by gpu-check's own native-4K final measurement - so a smaller --tier-size (a quick test) still
// gives a plan, labelled as such. Tiers that were not measured are extrapolated from the sub-frame count
// (fillTierTimes) and marked "extrapolated".
import { TIERS, TIER_NAMES, TIER_PRESETS, fillTierTimes, planEpisode } from '../lib/quality.js';
import { measureTier, compareTiers } from './tier-check.mjs';

/** Measure final + the given tiers. Returns { size, results: { tier: {steadyS, firstS, setupS, compare?, stats, changes} } }. */
export async function benchTiers(o) {
  const log = o.log || (() => {});
  const tiers = ['final', ...(o.tiers || ['high', 'ultra']).filter((t) => t !== 'final')];
  for (const t of tiers) if (!TIERS[t]) throw new Error(`unknown tier "${t}" (${TIER_NAMES.join(', ')})`);
  const results = {};
  let base = null;
  for (const tier of tiers) {
    log(`   - ${tier}${tier === 'final' ? '' : ` (${TIERS[tier].label})`} ...`);
    const m = await measureTier({ scene: o.scene, time: o.time, tier, size: o.size, cinematic: o.cinematic, gpu: o.gpu, gpuProfile: o.gpuProfile, frames: o.frames ?? 2, log: o.sessionLog });
    const r = { tier, preset: m.preset, firstS: m.firstS, steadyS: m.steadyS, setupS: m.setupS, renderer: m.renderer, width: m.width, height: m.height, changes: m.quality?.changes || [], stats: m.stats };
    if (tier === 'final') base = m;
    else {
      r.compare = await compareTiers(base, m);
      r.relative = +(m.steadyS / base.steadyS).toFixed(3);
    }
    results[tier] = r;
    log(`     first frame ${m.firstS} s, steady ${m.steadyS} s per frame${r.relative ? ` = ${r.relative}x final` : ''}${r.compare ? `; picture vs final: ${r.compare.ok ? `same structure (SSIM ${r.compare.thumbSsim})` : `PROBLEM - ${r.compare.problems.join('; ')}`}` : ''}`);
  }
  return { size: o.size || '3840x2160', results };
}

/**
 * Episode plan from a bench. finalSteadyS: gpu-check's native-4K final frame on this card; refSteadyS: the
 * cloud CPU's for the same frame (pc/reference-cpu.json); cpuHours: render-schedule.md's one-browser total.
 */
export function planFromBench(bench, { finalSteadyS, refSteadyS, cpuHours, setupH = 0, encodeH = 4, budgetH = 72 }) {
  const rel = { final: 1 };
  const broken = Object.entries(bench.results).filter(([t, r]) => r.compare && !r.compare.ok).map(([t]) => t);
  // a tier that drew a different picture is not recommended - and nothing is extrapolated from it
  for (const [t, r] of Object.entries(bench.results)) if (t !== 'final' && r.relative > 0 && !broken.includes(t)) rel[t] = r.relative;
  const filled = broken.length ? { times: { ...rel }, extrapolated: [] } : fillTierTimes(rel);
  const times = Object.fromEntries(Object.entries(filled.times).map(([t, k]) => [t, k * finalSteadyS]));
  const extrapolated = broken.length ? [] : filled.extrapolated;
  const plan = planEpisode([{ name: 'Episode 1', cpuH: cpuHours, refS: refSteadyS, tierS: times }], { setupH, encodeH, budgetH });
  plan.secondsPerFrame = times;
  plan.extrapolated = extrapolated.filter((t) => times[t]);
  plan.excluded = broken;
  plan.measuredAt = bench.size;
  return plan;
}

/** Lines for the gpu-check report. */
export function planLines(plan) {
  const L = [];
  L.push('   tier          preset         s/frame (test frame)   Episode 1 (render + setup + encode)   within the budget?');
  for (const t of TIER_NAMES) {
    const p = plan.tiers[t];
    if (!p) continue;
    const preset = t === 'final' ? 'final' : Object.keys(TIER_PRESETS).find((k) => TIER_PRESETS[k] === t);
    const ex = plan.extrapolated.includes(t) ? ' (extrapolated)' : '';
    L.push(`   ${t.padEnd(13)} ${preset.padEnd(14)} ${String(plan.secondsPerFrame[t].toFixed(2)).padStart(8)} s${ex.padEnd(16)} ${String(p.totalH).padStart(8)} h = ${p.days.toFixed(1)} days      ${p.fits ? 'yes' : 'no'}`);
  }
  for (const t of plan.excluded) L.push(`   ${t}: NOT RECOMMENDED - it drew a different picture from final on this card (see above)`);
  return L;
}
