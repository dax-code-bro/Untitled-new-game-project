#!/usr/bin/env node
// Shot director - PREVIS in Node (no browser, seconds instead of the minutes a set build + stills take):
// for every shot asked, at a few moments, the camera (static / pan / dolly keys, `frame` solved by the
// same framing solver the stage uses, `follow`), every cast member's head on the screen (in / out of
// frame, distance, size), the speaking face check (angle to the lens, size, defocus: the realism rule
// until lip-sync exists), and actors standing IN FRONT of another's head. Writes a sheet per shot:
// a top-down plan (room bounds, actors with their facing, the camera and its field of view) beside a
// schematic of the frame (heads as discs at their screen size, the speaker marked).
//
//   node scenes/lib/director/tools/previs.mjs --set BIRTHING_CHAMBER --only 1A-27,1A-28 [--at 0.15,0.6,0.95] [--out DIR]
//        [--cam '{"pos":[x,y,z],"look":[x,y,z],"mm":28,"fstop":1.4}']   try a camera over the shot's own (authoring loop)
//        [--cast '{"alexandria":{"lookAmount":1}}']                       ... and cast changes (merged per actor)
//   (every form takes --episode <id>, default s01e01; the measuring itself is ../previs-core.js)
//   node scenes/lib/director/tools/previs.mjs --set BIRTHING_CHAMBER --cuts [--only X2-03]
//        EDIT CHECK of the cuts between consecutive shots of this set in the edit list (the last frame of
//        the outgoing shot against the first of the incoming one): a JUMP CUT (a subject both shots hold,
//        seen from less than 25 deg apart at less than 1.6x the size - the 30-degree rule; X2-02 -> X2-03
//        was one, found only in the assembled cut) and the SCREEN ORDER of two subjects flipping (the
//        line crossed; fine when the incoming shot's staging says 'reverse' / 'declared'). --only names
//        incoming shots; --cam / --cast apply to the incoming shot, or to the one --cam-shot names.
//        `cutsOk: { '<incoming shot>': 'why' }` at the spec's top level marks its flags as looked at and kept
//        (not inside the shot's own spec: that would change its key and re-render it).
//
// Approximations (the reason a picture still has the last word): heads from the blocking state with a
// standard body (standing head 1.62 m, seated 1.22, crouched 0.95, kneeling 1.12; per-actor `height`
// on the cast entry scales it), creatures from their length (hatchling 0.7 m, Leaf 9 m; cast
// `length`), marks from `spec.previs.marks`, `spec.homes` or the cast. A `mount`ed camera (on a boat)
// is not previsualised. Names it cannot place are listed, never guessed.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { SETS } from '../registry.js';
import { cutCheck } from '../audit.js';
import { mergeShot as merge, shotEnv as coreEnv, analyse as coreAnalyse } from '../previs-core.js';
import { dirs, episodeArg } from '../episode-paths.js';

// --episode <id> (default s01e01): that episode's specs, shot tables and edit lists
const { ep: EP, argv } = episodeArg(process.argv.slice(2));
const SCENES = dirs(EP).scenes;
const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SET = opt('--set');
if (!SET || !SETS[SET]) { console.error(`previs: --set one of ${Object.keys(SETS).join(', ')}`); process.exit(2); }
const ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null;
const AT = opt('--at', '0.15,0.6,0.95').split(',').map(Number);
const OUT = opt('--out') ? path.resolve(opt('--out')) : null;
const CAM = opt('--cam') ? JSON.parse(opt('--cam')) : null;
const CAST = opt('--cast') ? JSON.parse(opt('--cast')) : null;

const specFile = path.join(SCENES, 'specs', `${SETS[SET].builder}.spec.js`);
const spec = (await import(pathToFileURL(specFile).href)).default;
const table = JSON.parse(fs.readFileSync(path.join(SCENES, SETS[SET].file.replace(/\.js$/, '.shots.json')), 'utf8'));

// the measuring (camera, heads on screen, faces, cover) is previs-core.js; bound to this set's spec here
const shotEnv = (s1) => coreEnv(spec, s1);
const analyse = (s1, row, t, env) => coreAnalyse(spec, s1, row, t, env);

// ------------------------------------------------------------------ drawing ---
const fmt = (v) => v.toArray().map((x) => x.toFixed(2)).join(', ');
function sheet(row, s1, res, file, bounds) {
  const W = 1500, H = 330 * res.length + 40;
  const args = ['-size', `${W}x${H}`, 'xc:#16181b', '-font', 'DejaVu-Sans'];
  const txt = (x, y, s, col = 'white', pt = 13) => args.push('-stroke', 'none', '-fill', col, '-pointsize', String(pt), '-draw', `text ${x},${y} '${String(s).replace(/'/g, '`')}'`);
  txt(10, 24, `${row.job}  ${s1.staging || ''}`.slice(0, 190), '#ffe070', 14);
  const B = bounds || (() => { const xs = [], zs = []; for (const r of res) { if (r.skip) continue; xs.push(r.cam.pos.x); zs.push(r.cam.pos.z); for (const a of r.actors) { xs.push(a.x3); zs.push(a.z3); } } return [[Math.min(...xs) - 1, 0, Math.min(...zs) - 1], [Math.max(...xs) + 1, 0, Math.max(...zs) + 1]]; })();
  res.forEach((r, i) => {
    const y0 = 40 + i * 330;
    txt(10, y0 + 18, `t ${r.t.toFixed(2)} s${r.speaker ? `   speaking: ${r.speaker}` : ''}`, '#a0d0ff');
    if (r.skip) { txt(10, y0 + 40, `not previsualised: ${r.skip}`, '#ff9090'); return; }
    // plan (x right = east, down = south)
    const pw = 440, ph = 290, px = 10, py = y0 + 30;
    const sc = Math.min(pw / (B[1][0] - B[0][0]), ph / (B[1][2] - B[0][2]));
    const P = (x, z) => [px + (x - B[0][0]) * sc, py + (z - B[0][2]) * sc];
    args.push('-fill', 'none', '-stroke', '#555', '-strokewidth', '1', '-draw', `rectangle ${P(B[0][0], B[0][2]).join(',')} ${P(B[1][0], B[1][2]).join(',')}`);
    const c = r.cam, d = c.look.clone().sub(c.pos); d.y = 0; d.normalize();
    const hf = Math.atan((24.89 / 2) / c.mm);
    for (const s of [-1, 1]) {
      const e = d.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), s * hf).multiplyScalar(30);
      args.push('-stroke', '#4a90e0', '-draw', `line ${P(c.pos.x, c.pos.z).join(',')} ${P(c.pos.x + e.x, c.pos.z + e.z).join(',')}`);
    }
    args.push('-stroke', 'none', '-fill', '#4a90e0', '-draw', `circle ${P(c.pos.x, c.pos.z).join(',')} ${P(c.pos.x, c.pos.z)[0] + 5},${P(c.pos.x, c.pos.z)[1]}`);
    for (const a of r.actors) {
      const [ax, az] = P(a.x3, a.z3), col = a.kind === 'creature' ? '#d8b040' : a.speaking ? '#ff6060' : '#e0e0e0';
      args.push('-stroke', 'none', '-fill', col, '-draw', `circle ${ax},${az} ${ax + 4},${az}`);
      args.push('-stroke', col, '-strokewidth', '2', '-draw', `line ${ax},${az} ${ax + Math.sin(a.yaw) * 14},${az + Math.cos(a.yaw) * 14}`);
      txt(ax + 6, az - 4, a.name, col, 11);
    }
    // the frame (16:9), heads as discs
    const fw = 480, fh = 270, fx = 470, fy = y0 + 30;
    args.push('-fill', '#2a2d33', '-stroke', '#888', '-strokewidth', '1', '-draw', `rectangle ${fx},${fy} ${fx + fw},${fy + fh}`);
    for (const a of r.actors) {
      if (a.behind) continue;
      const sx = fx + (a.x + 1) / 2 * fw, sy = fy + (1 - (a.y + 1) / 2) * fh, rr = Math.max(2, a.sizePx * fh / 540 / 2);
      const col = a.kind === 'creature' ? '#d8b040' : a.reads ? '#ff4040' : a.speaking ? '#ff9a60' : '#c8c8c8';
      args.push('-fill', 'none', '-stroke', col, '-strokewidth', '2', '-draw', `circle ${sx},${sy} ${sx + rr},${sy}`);
      txt(sx + rr + 2, sy + 4, a.name + (a.hiddenBy ? ` (behind ${a.hiddenBy})` : ''), col, 11);
    }
    // the numbers
    const lines = [`cam ${fmt(c.pos)} -> ${fmt(c.look)}  ${c.mm} mm${c.asked !== c.mm ? ` (asked ${c.asked})` : ''} f/${c.fstop} focus ${c.focus.toFixed(2)} m${c.worst != null ? `  solve off ${c.worst.toFixed(2)}` : ''}`];
    for (const a of r.actors) lines.push(`${a.name.padEnd(15)} ${a.inFrame ? 'IN ' : 'out'} x ${a.x.toFixed(2).padStart(5)} y ${a.y.toFixed(2).padStart(5)} ${a.dist.toFixed(1)} m${a.angle != null ? `  face ${a.angle} deg ${a.facePct}% blur ${a.blurPct}%` : ''}${a.speaking ? '  SPEAKS' : ''}${a.reads ? '  READS' : ''}${a.hiddenBy ? `  HIDDEN by ${a.hiddenBy}` : ''}`);
    lines.forEach((l, k) => txt(965, y0 + 46 + k * 17, l, l.includes('READS') || l.includes('HIDDEN') ? '#ff8080' : '#d8d8d8', 12));
  });
  args.push(file);
  const r = spawnSync('convert', args, { encoding: 'utf8' });
  if (r.status !== 0) console.warn(`previs: sheet not drawn (ImageMagick convert): ${(r.stderr || '').slice(0, 200)}`);
}

// --------------------------------------------------------------------- run ---
if (OUT) fs.mkdirSync(OUT, { recursive: true });
if (argv.includes('--cuts')) {
  // every cut of every edit list (edl.json: PROLOGUE + TITLE + 1A; edl-1B.json ...: the later parts)
  const CUTDIR = dirs(EP).cut;
  const pairs = [];
  for (const f of fs.readdirSync(CUTDIR).filter((x) => /^edl(-[^.]+)?\.json$/.test(x)).sort()) {
    const e = JSON.parse(fs.readFileSync(path.join(CUTDIR, f), 'utf8'));
    for (let k = 1; k < e.shots.length; k++) pairs.push([e.shots[k - 1], e.shots[k]]);
  }
  const rows = new Map(table.shots.map((r) => [r.job, r]));
  let n = 0, bad = 0;
  for (const [A, B] of pairs) {
    if (A.set !== SET || B.set !== SET || !rows.has(A.job) || !rows.has(B.job)) continue;
    if (ONLY && !ONLY.has(B.job)) continue;
    const sa = merge(spec.defaults, spec.shots?.[A.job] || {}), sb = merge(spec.defaults, spec.shots?.[B.job] || {});
    // --cam / --cast try a change on the incoming shot, or on the shot --cam-shot names (either side of a cut)
    const tgt = opt('--cam-shot') === A.job ? sa : opt('--cam-shot') && opt('--cam-shot') !== B.job ? null : sb;
    if (CAM && tgt) tgt.cam = CAM.frame || CAM.follow ? { ...CAM } : { ...tgt.cam, frame: undefined, follow: undefined, ...CAM };
    if (CAST && tgt) for (const [c, v] of Object.entries(CAST)) tgt.cast[c] = { ...(tgt.cast?.[c] || {}), ...v };
    let ra, rb;
    try { ra = analyse(sa, rows.get(A.job), rows.get(A.job).frames / 24 - 1 / 24, shotEnv(sa)); rb = analyse(sb, rows.get(B.job), 0, shotEnv(sb)); }
    catch (e) { console.log(`${A.job} -> ${B.job}: not checked (${e.message})`); continue; }
    const plain = (r) => r.skip ? r : { cam: { pos: r.cam.pos.toArray() }, actors: r.actors.map((x) => ({ ...x, head: x.head.toArray() })) };
    const c = cutCheck(plain(ra), plain(rb), sb.staging || '');
    // spec.cutsOk[incoming]: a flag looked at in the pictures and kept (not counted)
    const ok = spec.cutsOk?.[B.job] ?? sb.cutOk;
    if (ok) c.flags = c.flags.map((f) => `${f} - accepted: ${ok}`);
    n++; if (c.flags.some((f) => !f.endsWith('staging') && !f.includes(' - accepted: '))) bad++;
    const held = c.rows.map((r) => `${r.name} ${r.angle} deg ${r.ratio}x`).join(', ');
    console.log(`${A.job} -> ${B.job}  ${c.skip ? `not checked (${c.skip})` : held || 'no subject in both frames'}${c.flags.length ? `\n    ${c.flags.join('\n    ')}` : ''}`);
  }
  console.log(`\n${n} cut(s) checked, ${bad} flagged`);
  process.exit(0);
}
let flags = 0;
const flagged = [];
for (const row of table.shots) {
  if (ONLY && !ONLY.has(row.job)) continue;
  const s1 = merge(spec.defaults, spec.shots?.[row.job] || {});
  if (CAM) s1.cam = CAM.frame || CAM.follow ? { ...CAM } : { ...s1.cam, frame: undefined, follow: undefined, ...CAM };
  if (CAST) for (const [k, v] of Object.entries(CAST)) s1.cast[k] = { ...(s1.cast?.[k] || {}), ...v };
  const env = shotEnv(s1);
  const dur = row.frames / 24;
  let res;
  try { res = AT.map((a) => analyse(s1, row, Math.min(dur - 1 / 24, a * dur), env)); }
  catch (e) { console.log(`\n${row.job}: not previsualised (${e.message})`); continue; }
  const before = flags;
  console.log(`\n${row.job}  ${s1.staging || ''}`);
  for (const r of res) {
    if (r.skip) { console.log(`  t ${r.t.toFixed(2)}: not previsualised (${r.skip})`); continue; }
    console.log(`  t ${r.t.toFixed(2)}: cam ${fmt(r.cam.pos)} -> ${fmt(r.cam.look)} ${r.cam.mm} mm f/${r.cam.fstop}${r.cam.worst != null ? ` (solve ${r.cam.worst.toFixed(2)} off)` : ''}${r.speaker ? `  speaking ${r.speaker}` : ''}`);
    for (const a of r.actors) {
      const bad = [a.reads && 'SPEAKING FACE READS', a.speaking && !a.inFrame && 'speaker off screen', a.hiddenBy && `HIDDEN behind ${a.hiddenBy}`].filter(Boolean);
      if (bad.some((b) => b !== 'speaker off screen')) flags++;
      console.log(`    ${a.name.padEnd(15)} ${a.inFrame ? 'in ' : 'OUT'} (${a.x.toFixed(2)}, ${a.y.toFixed(2)}) ${a.dist.toFixed(1)} m${a.angle != null ? ` face ${a.angle} deg ${a.facePct}% blur ${a.blurPct}%` : ''}${bad.length ? `  <- ${bad.join(', ')}` : ''}`);
    }
  }
  if (env.missing.size) console.log(`  unplaced names: ${[...env.missing].join(', ')} (add them to spec.previs.marks)`);
  if (flags > before) flagged.push(row.job);
  if (OUT) sheet(row, s1, res, path.join(OUT, `${row.job}.png`), s1.cam?.bounds || spec.previs?.bounds || null);
}
console.log(`\n${flags} flag(s)${flagged.length ? ` in ${flagged.join(' ')}` : ''}${OUT ? `; sheets in ${OUT}` : ''}`);
