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
