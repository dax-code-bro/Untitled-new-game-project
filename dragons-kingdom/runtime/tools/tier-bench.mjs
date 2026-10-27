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
// (fillTierTimes) and marked "extrapolated" in the table - but only MEASURED tiers are recommended
// (planFromBench measuredOnly; gpu-check measures a tier the plan would pick from an extrapolation first,
// nextTierToMeasure).
import { TIERS, TIER_NAMES, TIER_PRESETS, fillTierTimes, planEpisode, tierDefsHash, presetOfTier } from '../lib/quality.js';
import { measureTier, compareTiers } from './tier-check.mjs';

/** Measure final + the given tiers. Returns { size, results: { tier: {steadyS, firstS, setupS, compare?, stats, changes} } }. */
export async function benchTiers(o) {
  const log = o.log || (() => {});
  // o.base: the final tier's result of an earlier bench (with rgba) - measure only the given tiers against it
  const tiers = [...(o.base ? [] : ['final']), ...(o.tiers || ['high', 'ultra']).filter((t) => t !== 'final')];
  for (const t of tiers) if (!TIERS[t]) throw new Error(`unknown tier "${t}" (${TIER_NAMES.join(', ')})`);
  const results = {};
  let base = o.base?.measured || null;
  for (const tier of tiers) {
    log(`   - ${tier}${tier === 'final' ? '' : ` (${TIERS[tier].label})`} ...`);
    const m = await measureTier({ scene: o.scene, time: o.time, tier, size: o.size, cinematic: o.cinematic, gpu: o.gpu, gpuProfile: o.gpuProfile, frames: o.frames ?? 2, log: o.sessionLog });
    const r = { tier, preset: m.preset, firstS: m.firstS, steadyS: m.steadyS, setupS: m.setupS, renderer: m.renderer, width: m.width, height: m.height, changes: m.quality?.changes || [], stats: m.stats };
    if (tier === 'final') { base = m; Object.defineProperty(r, 'measured', { value: m, enumerable: false }); }
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
export function planFromBench(bench, { finalSteadyS, refSteadyS, cpuHours, setupH = 0, encodeH = 4, budgetH = 72, measuredOnly = false }) {
  const rel = { final: 1 };
  const broken = Object.entries(bench.results).filter(([t, r]) => r.compare && !r.compare.ok).map(([t]) => t);
  // a tier that drew a different picture is not recommended - and nothing is extrapolated from it;
  // measuredOnly: no extrapolation at all (what gpu-check recommends)
  for (const [t, r] of Object.entries(bench.results)) if (t !== 'final' && r.relative > 0 && !broken.includes(t)) rel[t] = r.relative;
  const filled = broken.length || measuredOnly ? { times: { ...rel }, extrapolated: [] } : fillTierTimes(rel);
  const times = Object.fromEntries(Object.entries(filled.times).map(([t, k]) => [t, k * finalSteadyS]));
  const extrapolated = broken.length ? [] : filled.extrapolated;
  const plan = planEpisode([{ name: 'Episode 1', cpuH: cpuHours, refS: refSteadyS, tierS: times }], { setupH, encodeH, budgetH });
  plan.secondsPerFrame = times;
  plan.extrapolated = extrapolated.filter((t) => times[t]);
  plan.excluded = broken;
  plan.measuredAt = bench.size;
  return plan;
}

/**
 * The tier to measure next: the one the plan (with extrapolations) would recommend when it is only
 * extrapolated and not measured yet - so that nothing is recommended from an extrapolation. null: none.
 */
export function nextTierToMeasure(bench, planArgs) {
  const p = planFromBench(bench, planArgs);
  return p.recommended && p.extrapolated.includes(p.recommended) && !bench.results[p.recommended] ? p.recommended : null;
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

/**
 * May the episode renderer follow the GPU check's recommendation? (render/episode.mjs, its tests)
 * g: output/gpu-check/gpu-check.json; host / renderer: this computer and the graphics card the saved
 * GPU profile uses. Only a tier that was MEASURED on this card at native 4K (not extrapolated), drew
 * the same picture structure as final there, with the GPU check's reference picture SAME PICTURE and
 * the tier definitions unchanged since, is used. Returns { ok, tier, preset, reasons: [why not], about }.
 */
export function usableRecommendation(g, { host, renderer } = {}) {
  const no = (...reasons) => ({ ok: false, tier: 'final', preset: 'final', reasons });
  if (!g) return no('the GPU check has not run on this computer');
  if (host && g.system?.host && g.system.host !== host) return no(`the last GPU check ran on another computer (${g.system.host})`);
  if (g.exitCode !== 0) return no(`the last GPU check (${String(g.date).slice(0, 10)}) ended with code ${g.exitCode}`);
  if (renderer && g.gpu?.renderer && g.gpu.renderer !== renderer) return no(`the last GPU check measured another graphics card (${g.gpu.renderer})`);
  const tier = g.recommendedTier ?? TIER_PRESETS[g.recommendedPreset] ?? (g.recommendedPreset === 'final' ? 'final' : null);
  if (!tier) return no(g.tiers?.error ? `the GPU check's tier benchmark failed: ${g.tiers.error}` : 'the GPU check made no tier recommendation (it compares the tiers only on a graphics card)');
  const reasons = [];
  if (g.picture?.verdict !== 'SAME PICTURE') reasons.push(`the GPU check's picture check said ${g.picture?.verdict || 'nothing'} (needs SAME PICTURE)`);
  if (tier !== 'final') {
    const b = g.tiers?.bench, r = b?.results?.[tier];
    if (!b || b.size !== '3840x2160') reasons.push(`the tiers were measured at ${b?.size || 'no size'}, not native 3840x2160 (a TEST)`);
    if (!r) reasons.push(`${tier} was not measured on this card${(g.tiers?.plan?.extrapolated || []).includes(tier) ? ' (only extrapolated)' : ''}`);
    else if (!r.compare?.ok) reasons.push(`${tier} did not draw the same picture as final on this card (${(r.compare?.problems || []).join('; ') || 'no comparison'})`);
    if ((g.tiers?.plan?.extrapolated || []).includes(tier)) reasons.push(`${tier} was extrapolated, not measured`);
    if (g.tiers?.defs !== tierDefsHash()) reasons.push('the quality tiers have changed since that GPU check (run it again)');
    const hv = g.tiers?.heavy;
    if (hv && hv.tier === tier && !hv.ok) reasons.push(`the heavy frame (F5) failed at ${tier}: ${hv.error || 'see the GPU check log'}`);
  }
  if (reasons.length) return { ...no(...reasons), recommended: tier };
  return { ok: true, tier, preset: presetOfTier(tier), reasons: [], about: g.tiers?.plan?.tiers?.[tier] || null, date: g.date };
}
