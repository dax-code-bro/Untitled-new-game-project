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
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { SETS } from '../registry.js';
import { actorState, actorVisible } from '../blocking.js';
import { keyed, isKeyList } from '../timeline.js';
import { solveFraming } from '../framing.js';
import { speakerAt } from '../dialogue.js';
import { faceReadability, cutCheck } from '../audit.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const SCENES = path.join(ROOT, 'episodes/s01e01/final/scenes');
const argv = process.argv.slice(2);
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

const CREATURE_LEN = { hatchling: 0.7, leaf: 9, charcoal: 14, starlight: 16, scout: 8 };
const V = (a) => new THREE.Vector3(...a);
const merge = (def = {}, s = {}) => {
  const out = { ...def, ...s };
  if (def.cast || s.cast) {
    out.cast = {};
    for (const k of new Set([...Object.keys(def.cast || {}), ...Object.keys(s.cast || {})])) {
      if (s.cast && k in s.cast && s.cast[k] == null) continue;
      out.cast[k] = { ...(def.cast?.[k] || {}), ...(s.cast?.[k] || {}) };
    }
  }
  if (def.cam && s.cam) out.cam = { ...def.cam, ...s.cam };
  return out;
};

function shotEnv(s1) {
  const missing = new Set();
  const cast = s1.cast || {};
  const env = {
    missing,
    ground: () => 0,
    mark(n) {
      const m = spec.previs?.marks?.[n];
      if (m) return m;
      const b = cast[n];
      if (b?.at) return Array.isArray(b.at) ? (b.at.length === 3 ? b.at : [b.at[0], 0, b.at[1]]) : env.mark(b.at);
      if (spec.homes?.[n]) return spec.homes[n];
      missing.add(n);
      return null;
    },
    state(name, t) { return actorState(cast[name], t, env); },
    /** an actor part's approximate point (head / eye / chest / hips / hand.*) or a mark */
    point(name, t) {
      if (name == null) return null;
      if (Array.isArray(name)) return V(name);
      const [an, ...rest] = String(name).split('.');
      const part = rest.join('.');
      const def = spec.cast?.[an], b = cast[an];
      if (def && b && def.kind !== 'object') {
        const st = actorState(b, t, env);
        const fwd = new THREE.Vector3(Math.sin(st.yaw), 0, Math.cos(st.yaw));
        if (def.kind === 'creature') {
          const L = b.length ?? def.length ?? CREATURE_LEN[def.id] ?? 2;
          const k = part === 'head' || part === 'eye' ? 0.42 : part === 'tail' ? -0.5 : part === 'hips' ? -0.12 : 0.05;
          const h = part === 'head' || part === 'eye' ? 0.16 : 0.1;
          // a creature settled on a raised bed (the hatchling on the nest's linen): its home's height
          const base = b.settle && spec.homes?.[an] ? spec.homes[an][1] - L * 0.08 : st.y;
          return new THREE.Vector3(st.x, base + L * h, st.z).addScaledVector(fwd, L * k);
        }
        const H = (b.height ?? def.height ?? 1.72) / 1.72, P = st.posture;
        const head = 1.62 - P.sit * 0.4 - P.crouch * 0.67 - P.kneel * 0.5;
        const y = part === 'head' || part === 'eye' || part === 'eyes' ? head : part === 'chest' ? head - 0.42 : part.startsWith('hand') ? 0.85 - P.sit * 0.2 - P.crouch * 0.4 : part === 'feet' ? 0.05 : head - 0.7;
        const lean = (P.bow + P.crouch * 0.45 + P.lean * 0.5) * 0.25;
        return new THREE.Vector3(st.x, st.y + y * H, st.z).addScaledVector(fwd, (part === 'head' || part === 'eye' ? lean : 0) + (part.startsWith('hand') ? 0.3 : 0));
      }
      const m = env.mark(name);
      return m ? V(m) : null;
    },
  };
  env.approxPoint = (n, t) => env.point(n, t);
  return env;
}

function cameraAt(s1, t, u, env) {
  const c = s1.cam || {};
  if (c.mount) return { skip: `mounted on ${c.mount}` };
  const mm = typeof c.mm === 'number' ? c.mm : isKeyList(c.mm) ? keyed(t, c.mm) : 35;
  const res = (v) => {
    if (v == null) return null;
    if (isKeyList(v)) {
      const ks = v.map(([tk, val, e]) => [tk, Array.isArray(val) ? val : env.point(val, tk)?.toArray(), e]);
      if (ks.some((k) => !k[1])) return null;
      return V(keyed(t, ks));
    }
    return Array.isArray(v) ? V(v) : env.point(v, t);
  };
  let pos, look, worst = null, usedMm = mm;
  if (c.frame) {
    const lost = c.frame.subjects.map(([n]) => n).filter((n) => !env.point(n, c.frame.at ?? 0));
    if (lost.length) return { skip: `frame subject(s) ${lost.join(', ')} not placeable here (spec.previs.marks)` };
    let r = solveFraming(c.frame, mm, env, t, 16 / 9, 24.89, c.bounds || null);
    const tol = c.frame.tolerance ?? 0.12;
    if (r.worst > tol && !c.frame.track && c.frame.autoLens !== false) {
      for (const m2 of [40, 35, 32, 28, 24, 21, 18].filter((m) => m < mm && m >= Math.max(18, mm * (c.frame.minLensRatio ?? 0.5)))) {
        const r2 = solveFraming(c.frame, m2, env, t, 16 / 9, 24.89, c.bounds || null);
        if (r2.worst < r.worst) { r = r2; usedMm = m2; }
        if (r2.worst <= tol) break;
      }
    }
    pos = r.pos; look = r.look; worst = r.worst;
  } else if (c.follow) {
    const f = c.follow, st = env.state(f.target, t);
    const rot = (a) => (f.local !== false ? V(a).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw != null ? (keyed(t, f.yaw) * Math.PI) / 180 : st.yaw) : V(a));
    const g = new THREE.Vector3(st.x, st.y, st.z);
    // offsets may be key lists (X2-04's follow pulls back over the shot)
    const kv = (v, d) => (v == null ? d : isKeyList(v) ? keyed(t, v) : v);
    pos = g.clone().add(rot(kv(f.offset, [0, 2, -6])));
    look = c.look != null ? res(c.look) : g.clone().add(rot(kv(f.lookOffset, [0, 1.2, 0])));
  } else {
    pos = res(c.pos); look = res(c.look);
  }
  if (!pos || !look) return { skip: 'camera position or aim not resolvable here' };
  if (c.offset) pos.add(V(c.offset));
  if (c.push && typeof c.push === 'number') { const d = look.clone().sub(pos).multiplyScalar(c.push * u); pos.add(d); look.add(d); }
  const fstop = typeof c.fstop === 'number' ? c.fstop : 2.8;
  const fo = c.focus ?? (c.frame ? c.frame.subjects[0][0] : null);
  const fv = typeof fo === 'number' ? fo : isKeyList(fo) ? keyed(t, fo) : fo;
  const fp = typeof fv === 'number' ? null : res(fv);
  const focus = (typeof fv === 'number' ? fv : fp ? fp.distanceTo(pos) : look.distanceTo(pos)) + (c.focusOffset ?? 0);
  return { pos, look, mm: usedMm, asked: mm, fstop, focus, worst };
}

function analyse(s1, row, t, env) {
  const u = t / (row.frames / 24);
  const cam = cameraAt(s1, t, u, env);
  if (cam.skip) return { t, skip: cam.skip };
  const vfov = 2 * Math.atan((24.89 * 9 / 16) / 2 / cam.mm) * 180 / Math.PI;
  const C = new THREE.PerspectiveCamera(vfov, 16 / 9, 0.05, 2000);
  C.position.copy(cam.pos); C.lookAt(cam.look); C.updateMatrixWorld(true);
  const speaker = row.dialogue?.length ? speakerAt(row.dialogue, t) : null;
  const tanV = Math.tan((vfov * Math.PI) / 360);
  const actors = [];
  for (const [name, b] of Object.entries(s1.cast || {})) {
    const def = spec.cast?.[name];
    if (!def || def.kind === 'object' || !actorVisible(b, t)) continue;
    const head = env.point(`${name}.head`, t);
    if (!head) continue;
    const ndc = head.clone().project(C);
    const dist = head.distanceTo(cam.pos);
    const st = env.state(name, t);
    // the face direction: the body's facing turned toward the eye-line by its amount
    let fwd = new THREE.Vector3(Math.sin(st.yaw), 0, Math.cos(st.yaw));
    if (st.look?.at != null) {
      const tp = env.point(st.look.at, t);
      if (tp) { const d = tp.clone().sub(head).normalize(); fwd = fwd.clone().lerp(d, Math.min(1, st.look.amount ?? 0.85)).normalize(); }
    }
    const toCam = cam.pos.clone().sub(head).normalize();
    const role = def.role ?? name.toUpperCase();
    const human = def.kind === 'human';
    const m = human ? faceReadability(fwd.toArray(), toCam.toArray(), dist, { focalLength: cam.mm, fstop: cam.fstop, focus: cam.focus, sensor: 'super35' }) : null;
    actors.push({
      name, role, kind: def.kind, head, x: ndc.x, y: ndc.y, behind: ndc.z > 1, dist,
      inFrame: ndc.z <= 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1,
      sizePx: (0.24 / (dist * 2 * tanV)) * 540, speaking: speaker && role === speaker,
      angle: m ? Math.round(m.angle) : null, facePct: m ? +(m.faceFrac * 100).toFixed(1) : null, blurPct: m ? +(m.blurFrac * 100).toFixed(2) : null,
      reads: m && speaker && role === speaker && ndc.z <= 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 ? !!m.readable : false, yaw: st.yaw, x3: st.x, z3: st.z,
      lookAt: typeof st.look?.at === 'string' ? st.look.at.split('.')[0] : null,
    });
  }
  // a head covered by a nearer actor's head or body (a disc 0.22 m wide at its own distance)
  for (const a of actors) for (const o of actors) {
    if (o === a || o.dist >= a.dist || !a.inFrame) continue;
    const ohead = o.head, chest = ohead.clone().add(new THREE.Vector3(0, -0.45, 0));
    for (const p of [ohead, chest]) {
      const n = p.clone().project(C);
      const rad = (0.22 / (p.distanceTo(cam.pos) * Math.tan((vfov * Math.PI) / 360) * 16 / 9)) + (0.12 / (a.dist * Math.tan((vfov * Math.PI) / 360) * 16 / 9));
      if (Math.hypot(n.x - a.x, (n.y - a.y) / 1.78) < rad) { a.hiddenBy = o.name; break; }
    }
  }
  return { t, cam, actors, speaker };
}

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
  const CUTDIR = path.join(ROOT, 'episodes/s01e01/final/cut');
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
