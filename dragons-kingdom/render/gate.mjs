#!/usr/bin/env node
// The render gate's tool: which Episode 1 shots may be rendered into the masters on the render PC
// (render-ready.json next to render-jobs.json; how the lock works: render/lib/gate.mjs).
//
//   node render/gate.mjs status [--scene 1A] [--all]     approval state of every shot (or one scene)
//   node render/gate.mjs approve <shots> --by "<who>" [--note "<what was reviewed>"]
//   node render/gate.mjs revoke <shots>
//   node render/gate.mjs check                            exit 1 when an approved shot's files changed since
//                                                         its approval (run it before pushing scene work)
//   <shots>: ids (P-02 1A-01,1A-02), --scene <key> (every shot of a schedule scene, e.g. 1A or END)
//            or --set <SET> (every shot of a set, e.g. BIRTHING_CHAMBER)
//   --schedule FILE / --jobs FILE   another plan (default episodes/s01e01/final/render-schedule.md)
//
// Approve a shot only after its frames were reviewed (whole frame + 1:1 crops, SERIES.md section 3):
// the render PC renders it at native 4K, which takes hours. Approving it again after its files
// changed makes the render PC render it again and re-join its scene.
import path from 'node:path';
import { parseArgs } from './lib/args.mjs';
import { PROJECT_ROOT } from './lib/tools.mjs';
import { loadJobs, DEFAULT_SCHEDULE } from './lib/schedule.mjs';
import { resolveShot } from './lib/shots.mjs';
import { readGate, writeGate, gateVerdict, computeLock, GATE_NAME } from './lib/gate.mjs';

const rel = (f) => path.relative(PROJECT_ROOT, f).split(path.sep).join('/');

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'status';
  const a = parseArgs(argv, { booleans: ['all', 'help'] });
  if (a.help || cmd === 'help') { console.log(HELP); return 0; }
  const schedule = path.resolve(a.schedule || DEFAULT_SCHEDULE);
  const planDir = path.dirname(schedule);
  const { jobs } = loadJobs(schedule, a.jobs ? path.resolve(a.jobs) : undefined);
  const gate = readGate(planDir);
  if (gate.error && cmd !== 'status') throw new Error(gate.error);

  // which shots: positional ids, --scene, --set
  const ids = new Set(a._.flatMap((x) => String(x).split(',')).map((x) => x.trim()).filter(Boolean));
  let pick = jobs.filter((j) => ids.has(j.job));
  for (const id of ids) if (!jobs.some((j) => j.job === id)) throw new Error(`${id}: no such shot in render-jobs.json`);
  if (a.scene) pick.push(...jobs.filter((j) => String(a.scene).split(',').includes(j.scene)));
  if (a.set) pick.push(...jobs.filter((j) => String(a.set).split(',').includes(j.set)));
  pick = [...new Map(pick.map((j) => [j.job, j])).values()];
  pick = pick.filter((j) => j.render !== 'black');      // black cards need no approval

  if (cmd === 'status' || cmd === 'check') {
    const list = pick.length ? pick : jobs.filter((j) => j.render !== 'black');
    const rows = { current: [], changed: [], unapproved: [], waiting: [] };
    for (const j of list) {
      const r = resolveShot(j, planDir);
      if (!r.ready) { rows.waiting.push([j, r.reason]); continue; }
      const v = gateVerdict(gate, j, r);
      if (!v.approved) rows.unapproved.push([j]);
      else if (v.current) rows.current.push([j, v.entry]);
      else rows.changed.push([j, v.changed.join(', '), v.entry]);
    }
    for (const j of list) if (gate.approved[j.job] && !rows.current.some(([x]) => x === j) && !rows.changed.some(([x]) => x === j)) rows.changed.push([j, 'its scene file or shot entry is missing now', gate.approved[j.job]]);
    console.log(`${rel(gate.file)}: ${gate.exists ? `${Object.keys(gate.approved).length} shot(s) approved` : 'does not exist yet (nothing approved)'}${gate.error ? ` - ${gate.error}` : ''}`);
    console.log(`  approved, files unchanged (the render PC renders these): ${rows.current.length}`);
    if (a.all || cmd === 'status') for (const [j, e] of rows.current) console.log(`    ${j.job.padEnd(8)} ${j.scene.padEnd(14)} by ${e.approvedBy} on ${e.date}${e.note ? ` - ${e.note}` : ''}`);
    console.log(`  approved, but files changed since (they WAIT until approved again): ${rows.changed.length}`);
    for (const [j, why, e] of rows.changed) console.log(`    ${j.job.padEnd(8)} ${j.scene.padEnd(14)} ${why} (approved ${e.date} by ${e.approvedBy})`);
    console.log(`  scene files ready, not approved: ${rows.unapproved.length}${rows.unapproved.length ? `  (${summarise(rows.unapproved.map(([j]) => j.job))})` : ''}`);
    console.log(`  waiting for scene files: ${rows.waiting.length}`);
    if (cmd === 'check' && rows.changed.length) {
      console.log(`\nCHECK FAILED: ${rows.changed.length} approved shot(s) changed after their approval. Review their frames again and`);
      console.log('  node render/gate.mjs approve <ids> --by "<who>"   (or revoke them, or undo the change)');
      return 1;
    }
    return 0;
  }

  if (!pick.length) throw new Error(`${cmd}: name the shots (ids, --scene or --set)`);
  if (cmd === 'revoke') {
    let n = 0;
    for (const j of pick) if (gate.approved[j.job]) { delete gate.approved[j.job]; n++; }
    const f = writeGate(planDir, gate);
    console.log(`revoked ${n} approval(s) in ${rel(f)}`);
    return 0;
  }
  if (cmd === 'approve') {
    if (!a.by || a.by === true) throw new Error('approve: say who reviewed the frames: --by "<who>" (for example --by "director (Claude)" or --by "Daxtyn")');
    const date = new Date().toISOString().slice(0, 10);
    const notReady = [];
    let n = 0, same = 0;
    for (const j of pick) {
      const r = resolveShot(j, planDir);
      if (!r.ready) { notReady.push(`${j.job} (${r.reason})`); continue; }
      const c = computeLock(j, r);
      if (c.unresolved?.length) console.log(`  note ${j.job}: imports that do not resolve to a file (not in the lock): ${c.unresolved.slice(0, 4).join(', ')}`);
      const prev = gate.approved[j.job];
      if (prev?.lockId === c.lockId && prev.approvedBy === a.by && !a.note) { same++; continue; }
      gate.approved[j.job] = {
        lockId: c.lockId, lock: c.lock, approvedBy: String(a.by), date,
        ...(a.note && a.note !== true ? { note: String(a.note) } : prev?.lockId === c.lockId && prev.note ? { note: prev.note } : {}),
        scene: j.scene, source: r.scene ? rel(r.scene) : r.textFile ? rel(r.textFile) : null,
        ...(prev && prev.lockId !== c.lockId ? { replaces: prev.lockId } : {}),
      };
      if (c.libFiles) gate.libs[c.lock.lib] ??= { files: Object.fromEntries(Object.entries(c.libFiles).map(([f, h]) => [f, h.slice(0, 16)])) };
      n++;
    }
    if (notReady.length) console.log(`not approved (no scene file / shot entry yet): ${notReady.join('; ')}`);
    const f = writeGate(planDir, gate);
    console.log(`approved ${n} shot(s)${same ? ` (${same} already approved with these files)` : ''} in ${rel(f)} - commit it with the scene files it locks`);
    return notReady.length ? 1 : 0;
  }
  throw new Error(`unknown command ${cmd} (status, approve, revoke, check)`);
}

/** "1A-01..1A-04, 1A-07" style summary of ids in schedule order */
function summarise(ids) {
  const out = [];
  for (let i = 0; i < ids.length;) {
    const m = /^(.*?)(\d+)$/.exec(ids[i]);
    let k = i;
    if (m) while (k + 1 < ids.length && ids[k + 1] === `${m[1]}${String(+(/(\d+)$/.exec(ids[k])[1]) + 1).padStart(m[2].length, '0')}`) k++;
    out.push(k > i ? `${ids[i]}..${ids[k]}` : ids[i]);
    i = k + 1;
  }
  return out.length > 12 ? `${out.slice(0, 12).join(', ')}, +${out.length - 12} more` : out.join(', ');
}

const HELP = `
The render gate (${GATE_NAME}): only approved shots are rendered into the Episode 1 masters.

  node render/gate.mjs status [--scene 1A] [--all]
  node render/gate.mjs approve <shots> --by "<who>" [--note "<what was reviewed>"]
  node render/gate.mjs revoke <shots>
  node render/gate.mjs check          (exit 1: an approved shot changed after its approval)

  <shots>: ids (P-02 1A-01,1A-02), --scene <key> (e.g. 1A, END) or --set <SET> (e.g. BIRTHING_CHAMBER)
`;

try { process.exitCode = main(); } catch (e) { console.error(`error: ${e.message}`); process.exitCode = 1; }
