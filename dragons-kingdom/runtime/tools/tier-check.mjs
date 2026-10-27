#!/usr/bin/env node
// Quality-tier check: render one frame of a scene at several tiers (runtime/lib/quality.js) and
// compare each with the final tier - the higher tiers must give the SAME picture, only finer:
//
//   node runtime/tools/tier-check.mjs <scene.js> --time T [--size 640x360] [--tiers final,high,ultra]
//        [--cinematic velocity] [--out DIR] [--gpu] [--json FILE]
//
// Per tier it reports: render time of the frame (this machine), the work counters of the frame
// (scene passes incl. shadow maps, full-screen passes, draw calls, triangles, update() calls) and
// the cost model's estimate for an RTX 4090 at native 4K; against final: the structure of the
// picture (192x108 thumbnail SSIM / PSNR - colour, exposure, objects, black blocks), extra pure
// black / white pixels (NaN / infinity in the float pipeline) and the NaN / Inf counts of every
// float buffer. Writes <tier>.png and a side-by-side tiers.png into --out.
// Exit code 1 when a tier's picture is not the same structure (SSIM < 0.85 or PSNR < 25 dB),
// has NaN / Inf, extra black / white, or a shader error.
//
// The functions are exported for render/gpu-check.mjs and the tests.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TIER_NAMES, TIER_PRESETS, frameWork } from '../lib/quality.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

export const STRUCTURE_LIMITS = { thumbSsim: 0.85, thumbPsnr: 25, extraBlack: 0.002, extraWhite: 0.002 };

/** Preset name of a tier at the final size ('final' | 'final-high' | ...). */
export const presetOfTier = (t) => (t === 'final' ? 'final' : Object.keys(TIER_PRESETS).find((k) => TIER_PRESETS[k] === t));

/**
 * Render frame(s) of a scene at one tier. o = { scene, time, tier, size?, cinematic?, gpu?, gpuProfile?,
 * frames (default 1: the first includes shader compilation; more give a steady time), bitDepth?, log? }
 * Returns { tier, preset, renderer, setupS, firstS, steadyS, rgba (first frame), width, height, stats, buffers, info }.
 */
export async function measureTier(o) {
  const { openSession } = await imp('render/lib/session.mjs');
  const { resolvePreset } = await imp('render/lib/presets.mjs');
  const p = resolvePreset(presetOfTier(o.tier), o.size ? { size: o.size } : {});
  const t0 = Date.now();
  const s = await openSession({
    scene: path.resolve(ROOT, o.scene), resolved: p, fps: 24, gpu: !!o.gpu, gpuProfile: o.gpuProfile,
    bitDepth: o.bitDepth ?? 10, dither: false, ...(o.cinematic ? { cinematic: o.cinematic } : {}), log: o.log || (() => {}),
  });
  const openMs = Date.now() - t0;
  try {
    const f0 = Math.round(o.time * 24);
    const times = [];
    let rgba = null, stats = null, buffers = null;
    for (let k = 0; k < (o.frames || 1); k++) {
      const a = Date.now();
      const r = await s.render([f0 + k], k === 0 ? 'rgba' : 'yuv10');
      times.push((Date.now() - a) / 1000);
      if (k === 0) {
        rgba = r.frames.get(f0);
        stats = await s.worker.page.evaluate(() => window.dk.frameStats?.() ?? null).catch(() => null);
        buffers = await s.worker.page.evaluate(() => window.dk.debugCinematic?.() ?? null).catch(() => null);
      }
    }
    const steady = times.length > 1 ? times.slice(1).sort((x, y) => x - y)[(times.length - 1) >> 1] : times[0];
    return {
      tier: o.tier, preset: p.name, renderer: s.info.glRenderer, setupS: +(s.info.setupMs / 1000).toFixed(1), openS: +(openMs / 1000).toFixed(1),
      firstS: +times[0].toFixed(2), steadyS: +steady.toFixed(2), frames: times, rgba, width: p.width, height: p.height, stats, buffers,
      quality: s.info.quality,
    };
  } finally { await s.close(); }
}

/** Structure of a tier's frame against the final tier's (same size). */
export async function compareTiers(base, other) {
  const P = await imp('render/lib/picture.mjs');
  const ta = P.thumbnail(base.rgba, base.width, base.height), tb = P.thumbnail(other.rgba, other.width, other.height);
  const ea = P.extremes(base.rgba), eb = P.extremes(other.rgba);
  const lum = (rgba) => { let s = 0; for (let i = 0; i < rgba.length; i += 4) s += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]; return s / (rgba.length / 4); };
  const nanBufs = Object.entries(other.buffers || {}).filter(([k, v]) => k !== 'shaderErrors' && v && (v.nan || v.inf)).map(([k, v]) => `${k}: ${v.nan} NaN / ${v.inf} Inf`);
  const r = {
    thumbSsim: +P.ssim(ta, tb, P.THUMB_W, P.THUMB_H).toFixed(4), thumbPsnr: +P.psnr(ta, tb).toFixed(2),
    meanLuma: [+lum(base.rgba).toFixed(2), +lum(other.rgba).toFixed(2)],
    black: [ea.black, eb.black], white: [ea.white, eb.white], nan: nanBufs, shaderErrors: other.buffers?.shaderErrors ?? 0,
  };
  const L = STRUCTURE_LIMITS, why = [];
  if (r.thumbSsim < L.thumbSsim) why.push(`structure SSIM ${r.thumbSsim} < ${L.thumbSsim}`);
  if (r.thumbPsnr < L.thumbPsnr) why.push(`thumbnail PSNR ${r.thumbPsnr} dB < ${L.thumbPsnr}`);
  if (eb.black > ea.black + L.extraBlack) why.push(`${(100 * eb.black).toFixed(2)}% pure black (final ${(100 * ea.black).toFixed(2)}%)`);
  if (eb.white > ea.white + L.extraWhite) why.push(`${(100 * eb.white).toFixed(2)}% pure white (final ${(100 * ea.white).toFixed(2)}%)`);
  if (nanBufs.length) why.push(`NaN/Inf in ${nanBufs.join(', ')}`);
  if (r.shaderErrors) why.push(`${r.shaderErrors} shader error(s)`);
  r.ok = !why.length; r.problems = why;
  return r;
}

/**
 * Frame description for the cost model (quality.js frameWork) from a tier's measured counters,
 * scaled to native 4K (pixel work scales with the area; draw calls / triangles / update() do not).
 */
export function frameFromStats(st, { width = 3840, height = 2160 } = {}) {
  const c = st?.cinematic || {};
  const subs = Math.max(1, c.subframes || 1);
  // scene renders per frame = subframes x (main + its late pass) + AO pre-pass + overlays; triangles are per render
  const scenePasses = Math.max(1, st?.sceneRenders || 1);
  return {
    width, height,
    sceneTriangles: (st?.triangles || 1e6) / Math.max(1, scenePasses),
    shadowTriangles: (st?.triangles || 1e6) / Math.max(1, scenePasses),
    cascades: c.cascades || 0, cascadeMapSize: c.cascadeMapSize || 2048, shadowMapSize: 4096,
    dofOn: !!c.dof, fogOn: !!c.fog, fogFroxels: c.fog || [160, 90, 64], fogSoft: !!c.fogSoft, aoOn: !!c.ao,
    oceanOn: (c.late || 0) > 0, ssrCoverage: c.ssr ? 0.08 : 0,
    sceneSubframes: c.mode === 'accumulate' ? subs : 1,
    updateMs: st?.updates ? st.updateMs / st.updates : 0,
    drawCalls: st?.sceneCalls || 0,
  };
}

function sideBySide(pngs, labels, out) {
  // ffmpeg: hstack (pad to equal size), label each with drawtext when available
  const inputs = pngs.flatMap((p) => ['-i', p]);
  const f = pngs.map((_, i) => `[${i}:v]drawtext=text='${labels[i]}':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5[v${i}]`).join(';') + ';' + pngs.map((_, i) => `[v${i}]`).join('') + `hstack=inputs=${pngs.length}[o]`;
  let r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', f, '-map', '[o]', out], { encoding: 'utf8' });
  if (r.status !== 0) r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', pngs.map((_, i) => `[${i}:v]`).join('') + `hstack=inputs=${pngs.length}[o]`, '-map', '[o]', out], { encoding: 'utf8' });
  return r.status === 0 ? out : null;
}

async function main() {
  const { parseArgs, num } = await imp('render/lib/args.mjs');
  const { writePng } = await imp('render/lib/ffmpeg.mjs');
  const a = parseArgs(process.argv.slice(2), { booleans: ['gpu', 'help'] });
  if (a.help || !a._.length) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 19).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); return a.help ? 0 : 1; }
  const tiers = (a.tiers || 'final,high,ultra').split(',').map((t) => t.trim()).filter(Boolean);
  for (const t of tiers) if (!TIER_NAMES.includes(t)) throw new Error(`--tiers: unknown tier "${t}" (${TIER_NAMES.join(', ')})`);
  if (tiers[0] !== 'final') tiers.unshift('final');
  const scene = a._[0], time = num(a.time, 'time', { min: 0 }) ?? 0, size = a.size || '640x360';
  const out = path.resolve(a.out || path.join(ROOT, 'output', 'tier-check', path.basename(scene, '.js')));
  fs.mkdirSync(out, { recursive: true });
  const res = [];
  let bad = 0;
  for (const tier of tiers) {
    const m = await measureTier({ scene, time, tier, size, cinematic: a.cinematic, gpu: !!a.gpu, frames: num(a.frames, 'frames', { min: 1, int: true }) ?? 1 });
    const png = path.join(out, `${tier}.png`);
    await writePng(m.rgba, { width: m.width, height: m.height, out: png });
    const st = m.stats || {};
    console.log(`\n== ${tier} (${m.preset}, ${m.width}x${m.height}, ${m.renderer.replace(/^ANGLE \(|\)$/g, '')})`);
    console.log(`   frame ${m.firstS} s (first, incl. shader compilation)${m.frames.length > 1 ? `, steady ${m.steadyS} s` : ''}; setup ${m.setupS} s`);
    if (m.quality?.changes?.length) console.log(`   tier changes: ${m.quality.changes.join('; ')}`);
    console.log(`   work: ${st.sceneRenders} scene passes (${st.sceneCalls} draw calls, ${(st.triangles / 1e6).toFixed(2)} M triangles incl. shadow maps), ${st.fullscreen} full-screen passes (${(st.fsPixels / 1e6).toFixed(1)} M px), ${st.updates} update() calls (${st.updateMs} ms)`);
    const fr = frameFromStats(st);
    const w = frameWork(fr, tier);
    m.work = w; m.png = path.relative(ROOT, png);
    if (tier !== 'final') {
      const cmp = await compareTiers(res[0], m);
      m.compare = cmp;
      console.log(`   vs final: structure SSIM ${cmp.thumbSsim}, PSNR ${cmp.thumbPsnr} dB, mean luma ${cmp.meanLuma[0]} -> ${cmp.meanLuma[1]}; ${cmp.ok ? 'SAME STRUCTURE' : 'PROBLEM: ' + cmp.problems.join('; ')}`);
      console.log(`   cost model at native 4K: ${(w.gpu / res[0].work.gpu).toFixed(2)}x the final tier's GPU work, ${w.subframes} scene pass(es) per frame`);
      if (!cmp.ok) bad++;
    } else {
      const nan = Object.entries(m.buffers || {}).filter(([k, v]) => k !== 'shaderErrors' && v && (v.nan || v.inf));
      if (nan.length) console.log(`   NOTE: final itself holds NaN/Inf in ${nan.map(([k]) => k).join(', ')}`);
    }
    res.push(m);
  }
  const sbs = sideBySide(res.map((r) => path.join(ROOT, r.png)), res.map((r) => r.tier), path.join(out, 'tiers.png'));
  if (sbs) console.log(`\nside by side: ${path.relative(ROOT, sbs)}`);
  if (a.json) fs.writeFileSync(path.resolve(a.json), JSON.stringify(res.map(({ rgba, ...r }) => r), null, 1) + '\n');
  return bad ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
