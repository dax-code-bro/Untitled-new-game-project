// Engine phase 4 acceptance (engine/DESIGN.md 6, phase 4): re-stage the 22 Cling shots (X5-01..18, R3-01..04) from
// their shot-list rows and compare with the hand-written specs. Pure measuring (previs-core); writes nothing.
//   import { restageCling } from './accept.mjs'; const r = await restageCling();
//   node engine/stager/accept.mjs [--json]          (phase 5: --air re-stages the 1C X4 aerials + X6-01..18: restageAir())
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dirs } from '../../scenes/lib/director/episode-paths.js';
import { measure, shotSpec } from '../../scenes/lib/director/previs-core.js';
import { headingFromYaw } from '../../scenes/lib/director/blocking.js';
import { headingTo, angDiff, norm360 } from '../../scenes/lib/director/staging/ground.js';
import { stageRows, loadPlaces, loadVerbs, castForStaging } from './stage.mjs';
import { project, frameHAt } from './templates/common.mjs';
import { sideOk } from './check.mjs';

export const CLING_IDS = [...Array.from({ length: 18 }, (_, i) => `X5-${String(i + 1).padStart(2, '0')}`), 'R3-01', 'R3-02', 'R3-03', 'R3-04'];
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

export async function restageCling() {
  const D = dirs('s01e01');
  const sheet = readJson(path.join(D.root, 'scenes/lib/director/sets/sheets/CLING_SQUARE.json'));
  const rows = readJson(D.shotlist).shots.filter((s) => CLING_IDS.includes(s.id));
  const castLock = castForStaging(rows, 's01e01');
  const staged = stageRows(rows, { sheet, places: loadPlaces('CLING_SQUARE'), verbs: loadVerbs(), castLock, policy: { faces: 'avoid' } });
  const hand = {};
  for (const f of ['cling-square.spec.js', 'cling-square-2.spec.js']) { const m = await import(pathToFileURL(path.join(D.specs, f)).href); for (const id of Object.keys(m.default.shots)) hand[id] = m.default; }
  const per = rows.map((row) => compareRow(row, staged, hand, sheet));
  const sub = per.flatMap((p) => p.subjects);
  const inFrameSide = sub.filter((s) => s.ok).length / sub.length;
  const cmpOk = per.filter((p) => p.cmp?.ok).length / per.length;
  const byT = {};
  for (const p of per) { const t = (byT[p.template] ||= { n: 0, subjOk: 0, subj: 0, matchOk: 0 }); t.n++; t.subj += p.subjects.length; t.subjOk += p.subjects.filter((s) => s.ok).length; t.matchOk += p.cmp?.ok ? 1 : 0; }
  return { staged, per, inFrameSide, cmpOk, byTemplate: byT, subjects: sub.length };
}

/** one re-staged row vs its hand-written shot: requested subjects in frame + side at t 0.5; bearing (relative to the main
 *  subject's facing: a rider's is its MOUNT's heading; compass for things) within 45 deg and frame height x1.5 */
export function compareRow(row, staged, hand, sheet) {
  const rep = staged.reports.find((r) => r.id === row.id);
  const secs = row.frames_at_24fps / 24, tm = secs * 0.5;
  const subj = (rep.subjects || []).map((s) => {
    const cs = (rep.checks || []).filter((c) => c.name === s.name);
    const c = cs.length ? cs.reduce((a, b) => (Math.abs(b.t - tm) < Math.abs(a.t - tm) ? b : a)) : null;
    return { name: s.name, ok: !!(c && c.inFrame && c.side), x: c?.x ?? null };
  });
  const autoSpec = { ...staged.spec, previs: { ground: sheet.ground?.y ?? sheet.ground?.sea ?? 0 } };
  const hs = hand[row.id];
  let cmp = null;
  if (hs && staged.spec.shots[row.id]) {
    const a = measure(autoSpec, row.id, tm, { sheet });
    const h = measure(hs, row.id, tm, { sheet });
    if (!a.skip && !h.skip) {
      const main = (rep.subjects || []).find((s) => s.actor);
      const aCam = a.cam.pos.toArray(), hCam = h.cam.pos.toArray();
      let ab, hb, ad, hd;
      const build = main ? staged.spec.cast[main.actor]?.id : null;
      const ha = build ? h.actors.find((x) => JSON.stringify(hs.cast[x.name]?.id) === JSON.stringify(build)) : null;
      const aa = main ? a.actors.find((x) => x.name === main.actor) : null;
      const mountOf = (spec, n) => { const r = spec.cast?.[n]?.ride; return typeof r === 'object' && r ? r.on : r || null; };
      const yawOf = (res, spec, x) => { const m = mountOf(spec, x.name); const mm = m && res.actors.find((q) => q.name === m); return (mm || x).yaw; };
      if (aa && ha) {
        ab = angDiff(headingTo(aa.head.toArray(), aCam), norm360(headingFromYaw(yawOf(a, autoSpec, aa))));
        hb = angDiff(headingTo(ha.head.toArray(), hCam), norm360(headingFromYaw(yawOf(h, hs, ha))));
        ad = aa.dist; hd = ha.dist;
      } else {
        // things: the hand camera's aim point stands for the subject (its own blocking may differ)
        const hs1 = shotSpec(hs, row.id);
        const p = Array.isArray(hs1.cam.focus) && hs1.cam.focus.length === 3 && typeof hs1.cam.focus[0] === 'number' ? hs1.cam.focus : h.cam.look.toArray();
        ab = headingTo(p, aCam); hb = headingTo(p, hCam);
        ad = Math.hypot(...p.map((v, i) => v - aCam[i])); hd = Math.hypot(...p.map((v, i) => v - hCam[i]));
      }
      const ratio = frameHAt(ad, a.cam.mm) / frameHAt(hd, h.cam.mm);
      cmp = { bearingAuto: Math.round(ab), bearingHand: Math.round(hb), dBearing: Math.round(Math.abs(angDiff(ab, hb))), heightRatio: +ratio.toFixed(2), ok: Math.abs(angDiff(ab, hb)) <= 45 && ratio <= 1.5 && ratio >= 1 / 1.5, by: aa && ha ? 'person' : 'thing' };
    }
  }
  return { id: row.id, template: rep.template, score: rep.score, subjects: subj, cmp, flags: rep.flags };
}

export const AIR_IDS = [...['01', '02', '03', '06', '08', ...Array.from({ length: 11 }, (_, i) => String(i + 10))].map((n) => `X4-${n}`), ...Array.from({ length: 18 }, (_, i) => `X6-${String(i + 1).padStart(2, '0')}`)];
const AIR_SPECS = ['verdor-aerial.spec.js', 'verdor-aerial-2.spec.js', 'sky-off-verdor.spec.js', 'outer-rocks.spec.js'];
/** phase 5: re-stage the 1C X4 aerials + X6-01..18 per set (in memory) and compare with the hand-written shots */
export async function restageAir(ids = AIR_IDS) {
  const D = dirs('s01e01');
  const all = readJson(D.shotlist).shots.filter((s) => ids.includes(s.id));
  const hand = {};
  for (const f of AIR_SPECS) { const m = await import(pathToFileURL(path.join(D.specs, f)).href); for (const id of Object.keys(m.default.shots)) hand[id] ||= m.default; }
  const per = [], stagedBySet = {};
  for (const set of [...new Set(all.map((r) => r.set))].sort()) {
    const rows = all.filter((r) => r.set === set);
    const sheet = readJson(path.join(D.root, `scenes/lib/director/sets/sheets/${set}.json`));
    const castLock = castForStaging(rows, 's01e01');
    const staged = stageRows(rows, { sheet, places: loadPlaces(set), verbs: loadVerbs(), castLock, policy: { faces: 'avoid' } });
    stagedBySet[set] = staged;
    for (const row of rows) per.push({ ...compareRow(row, staged, hand, sheet), set, hand: !!hand[row.id] });
  }
  per.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const sub = per.flatMap((p) => p.subjects);
  const cmpd = per.filter((p) => p.hand);
  const horizonFail = per.filter((p) => p.flags.some((f) => f.startsWith('W_HORIZON')));
  const lineFail = per.filter((p) => p.flags.some((f) => f.startsWith('W_LINE')));
  return { per, stagedBySet, inFrameSide: sub.filter((s) => s.ok).length / sub.length, subjects: sub.length, cmpOk: cmpd.filter((p) => p.cmp?.ok).length / cmpd.length, compared: cmpd.length, horizonFail, lineFail };
}

const line = (p) => `${p.id} ${String(p.template).padEnd(14)} score ${p.score} | ${p.subjects.map((s) => `${s.name.slice(0, 14)}:${s.ok ? 'ok' : 'NO'}${s.x != null ? `(${s.x})` : ''}`).join(' ')} | ${p.cmp ? `brg ${p.cmp.bearingAuto}/${p.cmp.bearingHand} d${p.cmp.dBearing} h x${p.cmp.heightRatio} ${p.cmp.ok ? 'MATCH' : 'miss'}` : 'n/a'} | ${p.flags.join('; ')}`;

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--air')) {
    const r = await restageAir();
    if (process.argv.includes('--json')) console.log(JSON.stringify({ per: r.per, inFrameSide: r.inFrameSide, cmpOk: r.cmpOk }, null, 1));
    else {
      for (const p of r.per) console.log(line(p));
      console.log(`AIR: subjects in frame + side at t 0.5: ${(r.inFrameSide * 100).toFixed(0)} % of ${r.subjects}; bearing <= 45 + height x1.5 vs hand: ${(r.cmpOk * 100).toFixed(0)} % of ${r.compared}; horizon rule fails: ${r.horizonFail.length}; wrong side of the line: ${r.lineFail.length}`);
    }
  } else {
    const r = await restageCling();
    if (process.argv.includes('--json')) console.log(JSON.stringify({ per: r.per, inFrameSide: r.inFrameSide, cmpOk: r.cmpOk, byTemplate: r.byTemplate }, null, 1));
    else {
      for (const p of r.per) console.log(line(p));
      console.log(`subjects in frame + side at t 0.5: ${(r.inFrameSide * 100).toFixed(0)} % of ${r.subjects}; bearing <= 45 + height x1.5 vs hand: ${(r.cmpOk * 100).toFixed(0)} % of ${r.per.length}`);
      console.log(JSON.stringify(r.byTemplate));
    }
  }
}
