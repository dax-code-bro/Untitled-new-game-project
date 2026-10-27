// Quality tiers (runtime/lib/quality.js, presets final-high / final-ultra8 / final-ultra / final-max):
// the tier maths, and at 320x180 on the CPU: every tier gives the same picture structure as final,
// finite float buffers, no shader errors, deterministic frames (Hi-Z SSR, GPU FFT ocean, 16 sub-frames),
// and the GPU FFT ocean answers heightAt() like the CPU FFT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TIERS, TIER_NAMES, TIER_PRESETS, qualityFor, applyTierToCinematic, froxelAtlas, density, tierOf,
  frameWork, planEpisode, fillTierTimes, scenePresetOf, estimateFrameMs,
} from '../runtime/lib/quality.js';
import { cinematicFor, validateCinematic } from '../runtime/cinematic/config.js';
import { resolvePreset, presetTier } from '../render/lib/presets.mjs';
import { openSession } from '../render/lib/session.mjs';
import { startServer } from '../render/lib/server.mjs';
import { measureTier, compareTiers } from '../runtime/tools/tier-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures');
const SCENE = path.join(FIX, 'tier-scene.js');

test('(u0) tiers: presets, ctx.quality, cinematic knobs only go up, atlas, cost model, episode plan', () => {
  // presets: native 4K, the tier in quality, scenes see 'final'
  for (const [name, tier] of Object.entries(TIER_PRESETS)) {
    const p = resolvePreset(name);
    assert.equal(p.width, 3840); assert.equal(p.height, 2160); assert.equal(p.renderWidth, 3840);
    assert.equal(presetTier(p), tier); assert.equal(scenePresetOf(name), 'final');
  }
  assert.equal(presetTier(resolvePreset('final')), 'final');
  assert.equal(scenePresetOf('final-fast'), 'final-fast');
  // final: ctx.quality untouched (no tier key: the FX library keeps choosing its CPU tier)
  const base = { shadowMapSize: 4096, detail: 1 };
  assert.deepEqual(qualityFor(base, 'final'), base);
  assert.equal(tierOf({ quality: base }), 'final');
  const q = qualityFor(base, 'ultra');
  assert.equal(q.tier, 'ultra'); assert.equal(q.fxTier, 'ultra'); assert.equal(q.ocean.gpuFFT, true); assert.equal(q.ocean.resolution, 512);
  assert.equal(density({ quality: q }, 'grass'), 1.5); assert.equal(density({ quality: base }, 'grass'), 1);
  // the cinematic knobs: final changes nothing; the others only raise
  const scene = { volumetrics: { enabled: true }, shadows: { cascades: 3 }, dof: { samples: 200 } };
  const c0 = cinematicFor(scene, 'velocity');
  assert.deepEqual(applyTierToCinematic(c0, 'final'), []);
  for (const t of TIER_NAMES.slice(1)) {
    const c = cinematicFor(scene, 'velocity');
    applyTierToCinematic(c, t, { maxTextureSize: 8192 });
    validateCinematic(c);
    assert.equal(c.dof.samples, 200, `${t} lowered a scene's own DOF samples`);
    assert.ok(c.ao.slices >= 3 && c.ao.steps >= 6 && c.ao.resolution === 1);
    assert.equal(c.shadows.mapSize, 4096);
    assert.ok(froxelAtlas(c.volumetrics.resolution, 8192), `${t}: froxel grid does not fit an 8192 atlas`);
    assert.ok(c.ssr.enabled);
    assert.equal(c.motionBlur.mode, TIERS[t].subframes ? 'accumulate' : 'velocity');
    if (TIERS[t].subframes) assert.equal(c.motionBlur.accumulateSamples, TIERS[t].subframes);
  }
  const film = cinematicFor({ motionBlur: { mode: 'accumulate', accumulateSamples: 24 } });
  applyTierToCinematic(film, 'ultra');
  assert.equal(film.motionBlur.accumulateSamples, 24, 'a scene with more sub-frames keeps them');
  const sim = cinematicFor(true);
  applyTierToCinematic(sim, 'ultra', { warmup: true });
  assert.equal(sim.motionBlur.mode, 'velocity', 'chunk-warmup scenes cannot render sub-frames');
  // froxel atlas: one column when it fits (the original layout), columns when it does not
  assert.deepEqual(froxelAtlas([160, 90, 64], 8192), { cols: 1, rows: 64, width: 160, height: 5760 });
  assert.equal(froxelAtlas([320, 180, 96], 8192).cols, 3);
  // cost model: more work at every step of the ladder
  const frame = { width: 3840, height: 2160, sceneTriangles: 3e6, cascades: 3, aoOn: true, dofOn: true, fogOn: true, oceanOn: true, updateMs: 40, drawCalls: 2000 };
  const work = TIER_NAMES.map((n) => frameWork(frame, n).gpu);
  for (let i = 1; i < work.length; i++) assert.ok(work[i] > work[i - 1], `cost ${TIER_NAMES[i]} <= ${TIER_NAMES[i - 1]}`);
  assert.ok(estimateFrameMs(frame, 'ultra').ms > estimateFrameMs(frame, 'high').ms);
  // the plan: highest tier within the budget; extrapolated sub-frame tiers
  const f = fillTierTimes({ final: 1, high: 1.4, ultra: 4.4 });
  assert.deepEqual(f.extrapolated.sort(), ['max', 'ultra8']);
  assert.ok(Math.abs(f.times.ultra8 - (1.4 + 7 * 0.2)) < 1e-9);
  const segs = (k) => [{ cpuH: 2600, refS: 77, tierS: Object.fromEntries(Object.entries(f.times).map(([n, s]) => [n, s * k])) }];
  assert.equal(planEpisode(segs(0.5), { setupH: 8 }).recommended, 'ultra8');
  assert.equal(planEpisode(segs(0.1), { setupH: 8 }).preset, 'final-max');
  const none = planEpisode(segs(5), { setupH: 8 });
  assert.equal(none.recommended, 'final'); assert.match(none.reason, /no tier fits/);
});

test('(u0b) the episode renderer follows the GPU check only for a tier measured on this card at 4K with every picture check passed', async () => {
  const { usableRecommendation, nextTierToMeasure, planFromBench } = await import('../runtime/tools/tier-bench.mjs');
  const { tierDefsHash } = await import('../runtime/lib/quality.js');
  const good = () => ({
    date: '2026-10-28T10:00:00Z', exitCode: 0, system: { host: 'pc' }, gpu: { renderer: 'ANGLE (NVIDIA GeForce RTX 4090)' },
    picture: { verdict: 'SAME PICTURE' }, recommendedTier: 'ultra', recommendedPreset: 'final-ultra',
    tiers: { defs: tierDefsHash(), bench: { size: '3840x2160', results: { final: {}, high: { compare: { ok: true } }, ultra: { compare: { ok: true } } } },
      plan: { extrapolated: [], tiers: { ultra: { totalH: 61 } } } },
  });
  const who = { host: 'pc', renderer: 'ANGLE (NVIDIA GeForce RTX 4090)' };
  const ok = usableRecommendation(good(), who);
  assert.equal(ok.ok, true); assert.equal(ok.tier, 'ultra'); assert.equal(ok.preset, 'final-ultra');
  const bad = (edit, re) => { const g = good(); edit(g); const u = usableRecommendation(g, who); assert.equal(u.ok, false); assert.equal(u.tier, 'final'); assert.match(u.reasons.join(' | '), re); };
  bad((g) => { g.system.host = 'other'; }, /another computer/);
  bad((g) => { g.exitCode = 3; }, /ended with code 3/);
  bad((g) => { g.gpu.renderer = 'Intel UHD'; }, /another graphics card/);
  bad((g) => { g.picture.verdict = 'SMALL DIFFERENCES'; }, /SMALL DIFFERENCES/);
  bad((g) => { g.tiers.bench.size = '960x540'; }, /not native/);
  bad((g) => { delete g.tiers.bench.results.ultra; g.tiers.plan.extrapolated = ['ultra']; }, /not measured on this card/);
  bad((g) => { g.tiers.bench.results.ultra.compare = { ok: false, problems: ['SSIM 0.7'] }; }, /did not draw the same picture/);
  bad((g) => { g.tiers.defs = 'deadbeef'; }, /have changed/);
  bad((g) => { g.tiers.heavy = { tier: 'ultra', ok: false, error: 'WebGL context lost' }; }, /heavy frame/);
  assert.equal(usableRecommendation(null, who).ok, false);
  // gpu-check: a tier the plan would pick only from an extrapolation is measured before it is recommended
  const bench = { size: '3840x2160', results: { final: {}, high: { relative: 1.3, compare: { ok: true } }, ultra: { relative: 3, compare: { ok: true } } } };
  const pa = { finalSteadyS: 0.1, refSteadyS: 77, cpuHours: 2600, setupH: 5, budgetH: 72 };
  assert.equal(nextTierToMeasure(bench, pa), 'max');
  assert.equal(planFromBench(bench, { ...pa, measuredOnly: true }).recommended, 'ultra');
  assert.equal(nextTierToMeasure(bench, { ...pa, finalSteadyS: 0.55 }), null);
});

test('(u1) every tier draws the same picture structure as final: finite buffers, no shader errors, the knobs applied', { timeout: 900000 }, async (t) => {
  const base = await measureTier({ scene: SCENE, time: 1, tier: 'final', size: '320x180' });
  assert.equal(base.quality.tier, 'final');
  for (const tier of ['high', 'ultra']) {
    const m = await measureTier({ scene: SCENE, time: 1, tier, size: '320x180' });
    const c = await compareTiers(base, m);
    t.diagnostic(`${tier}: SSIM ${c.thumbSsim}, PSNR ${c.thumbPsnr} dB, luma ${c.meanLuma.join(' -> ')}, ${m.firstS} s; ${m.quality.changes.length} changes`);
    assert.ok(c.ok, `${tier}: ${c.problems.join('; ')}`);
    const ch = m.quality.changes.join(' | ');
    assert.match(ch, /ssr/); assert.match(ch, /ao:/); assert.match(ch, /shadows.mapSize/);
    if (tier === 'ultra') { assert.match(ch, /accumulate x16/); assert.equal(m.stats.cinematic.subframes, 16); }
    assert.ok(m.stats.cinematic.ssr && m.stats.cinematic.ssr.objects >= 2, `SSR objects: ${JSON.stringify(m.stats.cinematic.ssr)}`);
    assert.equal(m.buffers.shaderErrors, 0);
  }
});

test('(u2) the ultra tier is deterministic: a frame is byte-identical whatever was rendered before and in another browser', { timeout: 900000 }, async (t) => {
  const server = await startServer({ allowRoots: [FIX] });
  t.after(() => server.close());
  const p = resolvePreset('final-ultra', { size: '320x180' });
  const A = await openSession({ scene: SCENE, resolved: p, server, id: 1 });
  t.after(() => A.close());
  const B = await openSession({ scene: SCENE, resolved: p, server, id: 2 });
  t.after(() => B.close());
  const f = 30;
  const first = (await A.render([f], 'rgba')).frames.get(f);
  await A.render([5, f + 7], 'yuv');
  const again = (await A.render([f], 'rgba')).frames.get(f);
  await B.render([f + 3], 'yuv');
  const other = (await B.render([f], 'rgba')).frames.get(f);
  assert.ok(first.equals(again), 'ultra frame differs after rendering other frames');
  assert.ok(first.equals(other), 'ultra frame differs between two browsers');
});

test('(u3) GPU FFT ocean answers heightAt() like the CPU FFT (same sea)', { timeout: 600000 }, async () => {
  const heights = {};
  for (const tier of ['final', 'high']) {
    let h = null;
    const s = await openSession({ scene: SCENE, resolved: resolvePreset(tier === 'final' ? 'final' : 'final-high', { size: '160x92' }), verbose: true,
      log: (...a) => { const m = /\[tier-h\] (\[.*\]) gpu=(\w+)/.exec(a.join(' ')); if (m) h = { v: JSON.parse(m[1]), gpu: m[2] === 'true' }; } });
    try { await s.render([40], 'yuv'); } finally { await s.close(); }
    heights[tier] = h;
  }
  assert.equal(heights.final.gpu, false); assert.equal(heights.high.gpu, true);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(heights.final.v[i] - heights.high.v[i]) < 2e-3, `heightAt ${i}: CPU ${heights.final.v[i]} vs GPU ${heights.high.v[i]}`);
});

// banding across a fast sweep: the rms of (luma - its 7-px vertical box mean) over a region the bar sweeps
// through (a ladder of separate copies has a lot of it, a continuous streak little), and the region's mean luma
function sweepStats(rgba, W, x0, y0, w, h) {
  const L = (x, y) => { const i = 4 * (y * W + x); return 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]; };
  let e = 0, n = 0, sum = 0;
  for (let x = x0; x < x0 + w; x++) for (let y = y0 + 3; y < y0 + h - 3; y++) {
    let s = 0; for (let k = -3; k <= 3; k++) s += L(x, y + k);
    const d = L(x, y) - s / 7; e += d * d; n++; sum += L(x, y);
  }
  return { hf: Math.sqrt(e / n), mean: sum / n };
}

test('(u4) fast motion at a sub-frame tier: one continuous streak (hybrid blur), not a ladder of copies; same coverage', { timeout: 600000 }, async (t) => {
  const SCENE4 = path.join(FIX, 'fast-motion.js');
  const p = resolvePreset('final-ultra', { size: '320x180' });
  const shot = async (quality) => {
    const s = await openSession({ scene: SCENE4, resolved: p, bitDepth: 10, dither: false, ...(quality ? { quality } : {}) });
    try {
      const rgba = (await s.render([0], 'rgba')).frames.get(0);
      const buffers = await s.worker.page.evaluate(() => window.dk.debugCinematic?.() ?? null);
      return { rgba, buffers, changes: s.info.quality.changes.join(' | ') };
    } finally { await s.close(); }
  };
  const plain = await shot({ subframeBlur: false, subframeAO: false });
  const hybrid = await shot(null);
  assert.match(hybrid.changes, /per-sub-frame blur/); assert.doesNotMatch(plain.changes, /per-sub-frame blur/);
  // the bar 3 m from its pivot sweeps ~60 px of this column band during the shutter (5 px per sub-frame)
  const a = sweepStats(plain.rgba, 320, 196, 55, 18, 55), b = sweepStats(hybrid.rgba, 320, 196, 55, 18, 55);
  t.diagnostic(`sweep band: plain hf ${a.hf.toFixed(3)} mean ${a.mean.toFixed(1)}; hybrid hf ${b.hf.toFixed(3)} mean ${b.mean.toFixed(1)}`);
  assert.ok(a.hf > 1.2, `plain sub-frames should band here (hf ${a.hf.toFixed(3)}) - the fixture no longer measures anything`);
  assert.ok(b.hf < 0.65 * a.hf, `hybrid streak still banded: hf ${b.hf.toFixed(3)} vs plain ${a.hf.toFixed(3)}`);
  assert.ok(Math.abs(b.mean - a.mean) < 2.5, `hybrid changes the coverage of the sweep: mean ${b.mean.toFixed(1)} vs ${a.mean.toFixed(1)}`);
  for (const [k, v] of Object.entries(hybrid.buffers || {})) if (k !== 'shaderErrors' && v) assert.ok(!v.nan && !v.inf, `${k}: ${v.nan} NaN / ${v.inf} Inf`);
  assert.equal(hybrid.buffers.shaderErrors, 0);
});
