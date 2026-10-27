#!/usr/bin/env node
// Quality-tier check: render one frame of a scene at several tiers (runtime/lib/quality.js) and
// compare each with the final tier - the higher tiers must give the SAME picture, only finer:
//
//   node runtime/tools/tier-check.mjs <scene.js> --time T [--size 640x360] [--tiers final,high,ultra]
//        [--cinematic velocity] [--out DIR] [--gpu] [--json FILE] [--crops x,y,w,h;x,y,w,h]
//        [--knobs all|LIST [--knob-tier high]]   one knob of the tier at a time against final
//
// Per tier it reports: render time of the frame (this machine), the work counters of the frame
// (scene passes incl. shadow maps, full-screen passes, draw calls, triangles, update() calls) and
// the cost model's estimate for an RTX 4090 at native 4K; against final: the structure of the
// picture (192x108 thumbnail SSIM / PSNR - colour, exposure, objects, mist shapes, black blocks),
// the PSNR of 1:1 crops (--crops, in pixels of the rendered size), extra pure black / white pixels
// (NaN / infinity in the float pipeline) and the NaN / Inf counts of every float buffer. Writes
// <tier>.png (and knob-<name>.png) and a side-by-side tiers.png into --out.
// Exit code 1 when a tier's picture is not the same structure (SSIM < 0.85 or PSNR < 25 dB at
// 192x108), has NaN / Inf, extra black / white, or a shader error. Crop PSNRs are reported, not gated
// (a tier adds detail exactly there).
//
// The functions are exported for render/gpu-check.mjs and the tests.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TIER_NAMES, TIER_PRESETS, KNOB_DOCS, frameWork, estimateFrameMs, RTX4090_ASSUMPTIONS, presetOfTier } from '../lib/quality.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

// "Same structure" is judged on a 192x108 area-averaged thumbnail (as render/lib/picture.mjs, the GPU
// check's picture comparison): objects, exposure, colour, the shape of mist banks, black blocks show
// there; most of the finer detail a tier adds (ripples, sharper shadows, supersampling) does not.
// (A 96x54 thumbnail was tried and dropped: it hid a real change of the mist's shape.)
export const STRUCTURE_LIMITS = { thumbW: 192, thumbH: 108, thumbSsim: 0.85, thumbPsnr: 25, extraBlack: 0.002, extraWhite: 0.002 };

export { presetOfTier };

/**
 * Render frame(s) of a scene at one tier. o = { scene, time, tier, size?, cinematic?, gpu?, gpuProfile?,
 * frames (default 1: the first includes shader compilation; more give a steady time), bitDepth?, log?,
 * quality? (ctx.quality overrides: { only: ['volumetrics'] }, { subframeBlur: false } ...) }
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
    ...(o.quality ? { quality: o.quality } : {}),
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

/** Structure of a tier's frame against the final tier's (same size). crops: [{ x, y, w, h, name? }] 1:1 boxes. */
export async function compareTiers(base, other, { crops = [] } = {}) {
  const P = await imp('render/lib/picture.mjs');
  const L0 = STRUCTURE_LIMITS;
  const ta = P.thumbnail(base.rgba, base.width, base.height, L0.thumbW, L0.thumbH), tb = P.thumbnail(other.rgba, other.width, other.height, L0.thumbW, L0.thumbH);
  const ea = P.extremes(base.rgba), eb = P.extremes(other.rgba);
  const lum = (rgba) => { let s = 0; for (let i = 0; i < rgba.length; i += 4) s += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]; return s / (rgba.length / 4); };
  // NaN / Inf the tier ADDS (a scene can already have some at final: the Cling set's scene buffer has 138 NaN values at
  // final - reported to its owner; the tier is judged on what it changes)
  const was = (k) => base.buffers?.[k] || {};
  const nanBufs = Object.entries(other.buffers || {}).filter(([k, v]) => k !== 'shaderErrors' && v && ((v.nan || 0) > (was(k).nan || 0) || (v.inf || 0) > (was(k).inf || 0)))
    .map(([k, v]) => `${k}: ${v.nan} NaN / ${v.inf} Inf${was(k).nan || was(k).inf ? ` (final ${was(k).nan || 0} / ${was(k).inf || 0})` : ''}`);
  const r = {
    thumbSsim: +P.ssim(ta, tb, L0.thumbW, L0.thumbH).toFixed(4), thumbPsnr: +P.psnr(ta, tb).toFixed(2),
    meanLuma: [+lum(base.rgba).toFixed(2), +lum(other.rgba).toFixed(2)],
    black: [ea.black, eb.black], white: [ea.white, eb.white], nan: nanBufs, shaderErrors: other.buffers?.shaderErrors ?? 0,
    crops: crops.map((c, i) => {
      const w = Math.min(c.w, base.width - c.x), h = Math.min(c.h, base.height - c.y);
      const a = P.crop(base.rgba, base.width, c.x, c.y, w, h), b = P.crop(other.rgba, other.width, c.x, c.y, w, h);
      return { name: c.name || `crop${i + 1}`, x: c.x, y: c.y, w, h, psnr: +P.psnr(a, b).toFixed(2) };
    }),
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

async function sideBySide(pngs, labels, out) {
  // ffmpeg (the pinned one on the render PC: render/lib/tools.mjs): hstack, label each with drawtext when available
  const { ffmpegPath } = await imp('render/lib/tools.mjs');
  const ff = ffmpegPath();
  const inputs = pngs.flatMap((p) => ['-i', p]);
  const f = pngs.map((_, i) => `[${i}:v]drawtext=text='${labels[i]}':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5[v${i}]`).join(';') + ';' + pngs.map((_, i) => `[v${i}]`).join('') + `hstack=inputs=${pngs.length}[o]`;
  let r = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', f, '-map', '[o]', out], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) r = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', pngs.map((_, i) => `[${i}:v]`).join('') + `hstack=inputs=${pngs.length}[o]`, '-map', '[o]', out], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? out : null;
}

/** --crops "x,y,w,h;x,y,w,h" (or "name=x,y,w,h;...") -> [{ name, x, y, w, h }] */
export function parseCrops(spec) {
  if (!spec) return [];
  return String(spec).split(';').map((p) => p.trim()).filter(Boolean).map((p, i) => {
    const [name, box] = p.includes('=') ? p.split('=') : [`crop${i + 1}`, p];
    const [x, y, w, h] = box.split(',').map((v) => parseInt(v, 10));
    if (![x, y, w, h].every(Number.isFinite)) throw new Error(`--crops: "${p}" is not x,y,w,h`);
    return { name, x, y, w, h };
  });
}

/** The knobs a one-knob A/B can switch (KNOB_DOCS names without the scene-library ones nothing renders differently for). */
export const AB_KNOBS = KNOB_DOCS.map(([k]) => k);

async function main() {
  const { parseArgs, num } = await imp('render/lib/args.mjs');
  const { writePng } = await imp('render/lib/ffmpeg.mjs');
  const a = parseArgs(process.argv.slice(2), { booleans: ['gpu', 'help'] });
  if (a.help || !a._.length) { const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n'); console.log(src.slice(1, src.findIndex((l) => l.startsWith('import'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); return a.help ? 0 : 1; }
  const tiers = (a.tiers || 'final,high,ultra').split(',').map((t) => t.trim()).filter(Boolean);
  for (const t of tiers) if (!TIER_NAMES.includes(t)) throw new Error(`--tiers: unknown tier "${t}" (${TIER_NAMES.join(', ')})`);
  if (tiers[0] !== 'final') tiers.unshift('final');
  const scene = a._[0], time = num(a.time, 'time', { min: 0 }) ?? 0, size = a.size || '640x360';
  const out = path.resolve(a.out || path.join(ROOT, 'output', 'tier-check', path.basename(scene, '.js')));
  fs.mkdirSync(out, { recursive: true });
  const crops = parseCrops(a.crops);
  // --knobs: final, then the knob tier (default high) with ONE knob at a time (quality.only)
  const runs = [];
  if (a.knobs !== undefined) {
    const kt = a.knobTier || 'high';
    const list = a.knobs === true || a.knobs === 'all' || a.knobs === '' ? AB_KNOBS : String(a.knobs).split(',').map((k) => k.trim()).filter(Boolean);
    for (const k of list) if (!AB_KNOBS.includes(k)) throw new Error(`--knobs: unknown knob "${k}" (${AB_KNOBS.join(', ')})`);
    runs.push({ tier: 'final', label: 'final' }, ...list.map((k) => ({ tier: kt, label: `knob-${k}`, quality: { only: [k] } })));
  } else runs.push(...tiers.map((t) => ({ tier: t, label: t })));
  const res = [];
  let bad = 0;
  for (const run of runs) {
    const { tier } = run;
    const m = await measureTier({ scene, time, tier, size, cinematic: a.cinematic, gpu: !!a.gpu, frames: num(a.frames, 'frames', { min: 1, int: true }) ?? 1, quality: run.quality });
    m.label = run.label;
    const png = path.join(out, `${run.label}.png`);
    await writePng(m.rgba, { width: m.width, height: m.height, out: png });
    const st = m.stats || {};
    console.log(`\n== ${run.label} (${m.preset}${run.quality ? ` only ${run.quality.only.join(',')}` : ''}, ${m.width}x${m.height}, ${m.renderer.replace(/^ANGLE \(|\)$/g, '')})`);
    console.log(`   frame ${m.firstS} s (first, incl. shader compilation)${m.frames.length > 1 ? `, steady ${m.steadyS} s` : ''}; setup ${m.setupS} s`);
    if (m.quality?.changes?.length) console.log(`   tier changes: ${m.quality.changes.join('; ')}`);
    console.log(`   work: ${st.sceneRenders} scene passes (${st.sceneCalls} draw calls, ${(st.triangles / 1e6).toFixed(2)} M triangles incl. shadow maps), ${st.fullscreen} full-screen passes (${(st.fsPixels / 1e6).toFixed(1)} M px), ${st.updates} update() calls (${st.updateMs} ms)`);
    const fr = frameFromStats(st);
    const w = frameWork(fr, tier);
    m.work = w; m.png = path.relative(ROOT, png);
    m.estimate4090 = estimateFrameMs(fr, tier);
    const e = m.estimate4090;
    console.log(`   RTX 4090 ESTIMATE at native 4K (planning assumptions, runtime/lib/quality.js): ~${(e.ms / 1000).toFixed(2)} s/frame (GPU ${(e.gpuMs / 1000).toFixed(2)} s, draw calls ${(e.submitMs / 1000).toFixed(2)} s, update() ${(e.updateMs / 1000).toFixed(2)} s)`);
    if (run.label !== 'final') {
      const cmp = await compareTiers(res[0], m, { crops });
      m.compare = cmp;
      console.log(`   vs final: structure (192x108) SSIM ${cmp.thumbSsim}, PSNR ${cmp.thumbPsnr} dB, mean luma ${cmp.meanLuma[0]} -> ${cmp.meanLuma[1]}; ${cmp.ok ? 'SAME STRUCTURE' : 'PROBLEM: ' + cmp.problems.join('; ')}`);
      if (cmp.crops.length) console.log(`   1:1 crops: ${cmp.crops.map((c) => `${c.name} (${c.x},${c.y} ${c.w}x${c.h}) ${c.psnr} dB`).join(', ')}`);
      console.log(`   cost model at native 4K: ${(w.gpu / res[0].work.gpu).toFixed(2)}x the final tier's GPU work, ${w.subframes} scene pass(es) per frame`);
      if (!cmp.ok) bad++;
    } else {
      const nan = Object.entries(m.buffers || {}).filter(([k, v]) => k !== 'shaderErrors' && v && (v.nan || v.inf));
      if (nan.length) console.log(`   NOTE: final itself holds NaN/Inf in ${nan.map(([k]) => k).join(', ')}`);
    }
    res.push(m);
  }
  const sbs = await sideBySide(res.map((r) => path.join(ROOT, r.png)), res.map((r) => r.label), path.join(out, 'tiers.png'));
  if (sbs) console.log(`\nside by side: ${path.relative(ROOT, sbs)}`);
  if (a.json) fs.writeFileSync(path.resolve(a.json), JSON.stringify(res.map(({ rgba, ...r }) => r), null, 1) + '\n');
  return bad ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
