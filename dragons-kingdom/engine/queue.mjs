#!/usr/bin/env node
// Engine phase 6: the DETACHED render queue (engine/DESIGN.md 5.3, 5.4).
//
//   node engine/queue.mjs start  --episode t00     spawn `run` detached (own process group, stdio -> log) and return
//   node engine/queue.mjs run    --episode t00     the runner itself (what start spawns; resumes whatever is left)
//   node engine/queue.mjs status --episode t00     jobs, liveness (heartbeat), the log tail
//   node engine/queue.mjs stop   --episode t00     stop the runner and its render (its own process group only)
//
// Jobs are written by make-episode.mjs --stage draft (episodes/<ep>/engine/queue/state.json): ONE job per set,
// rendered by render-shots.mjs --episode E --sets SET --only <stale shots> --workers 1 (--stills 0.5 for D1, video in
// 48-frame segments for D2) into the episode's work folder. Lessons from production, built in:
//   - agent tool calls end after 2 h: the queue never runs in a tool call's foreground; start returns at once
//   - containers restart and kill everything: a re-launched queue finds a dead pid (stale pid / heartbeat), takes the
//     queue over, and resumes; shots finished before the kill are adopted (their files are newer than the job's
//     launch and their key is unchanged), so only the rest is rendered
//   - memory: workers 1, and a job waits while os.freemem() is below its need (heavy sets 4 GB, else 2 GB; DK_QUEUE_MEM_GB)
//   - specs edited mid-run: while engine/queue/<SET>.lock is held the stager writes <builder>.auto.next.js; it is
//     swapped in when the set's job ends. A shot whose key changed during its render (edited, or by the swap) is
//     re-queued, at most twice
//   - when the queue is empty the post command runs (make-episode --stage cut,mix: the cut with the new pictures)
// A heartbeat is written every 30 s; `status` calls a runner dead when its pid is gone or the heartbeat is > 120 s old.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirs, episodeArg, ROOT } from '../scenes/lib/director/episode-paths.js';
import { SETS } from '../scenes/lib/director/registry.js';
import { queuePaths, draftState, renderKeys, sidecar, outputsOf, readJson, lockHolder, workDir, STILL_US } from './lib/drafts.mjs';

const SELF = fileURLToPath(import.meta.url);
const RENDER_SHOTS = path.join(ROOT, 'scenes/lib/director/tools/render-shots.mjs');
const HEARTBEAT_S = 30, DEAD_S = 120, MAX_REQUEUE = 2, MAX_TRIES = 2;
const now = () => new Date().toISOString();

export function loadQueue(ep) {
  return readJson(queuePaths(ep).state, { episode: ep, jobs: [], post: null });
}
export function saveQueue(ep, q) {
  const P = queuePaths(ep);
  fs.mkdirSync(P.dir, { recursive: true });
  const tmp = `${P.state}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(q, null, 1) + '\n');
  fs.renameSync(tmp, P.state);
}
/** { alive, pid, heartbeatAge } of the episode's runner */
export function liveness(ep) {
  const P = queuePaths(ep), q = loadQueue(ep);
  const pid = lockHolder(P.pid);
  const age = q.heartbeat ? (Date.now() - Date.parse(q.heartbeat)) / 1000 : null;
  return { alive: !!pid && age !== null && age < DEAD_S, pid, heartbeatAge: age === null ? null : Math.round(age) };
}

/** add (or widen) one job per set; pending jobs of the same set and tier are merged */
export function enqueue(ep, jobs, post = null) {
  const q = loadQueue(ep);
  for (const j of jobs) {
    const same = q.jobs.find((x) => x.status === 'pending' && x.set === j.set && x.tier === j.tier);
    if (same) { same.shots = [...new Set([...same.shots, ...j.shots])]; continue; }
    q.jobs.push({ id: `${j.set}#${q.jobs.length + 1}`, set: j.set, tier: j.tier, shots: j.shots, status: 'pending', tries: 0, requeues: j.requeues || 0, queued: now() });
  }
  if (post) q.post = { cmd: post, status: 'pending' };
  saveQueue(ep, q);
  return q;
}

/** spawn the runner detached (returns its pid), unless a live one is running */
export function startDetached(ep) {
  const l = liveness(ep);
  if (l.alive) return { pid: l.pid, already: true };
  const P = queuePaths(ep);
  fs.mkdirSync(P.dir, { recursive: true });
  const fd = fs.openSync(P.log, 'a');
  const child = spawn(process.execPath, [SELF, 'run', '--episode', ep], { cwd: ROOT, detached: true, stdio: ['ignore', fd, fd] });
  child.unref();
  fs.closeSync(fd);
  return { pid: child.pid, already: false };
}

const needBytes = (set) => {
  if (process.env.DK_QUEUE_MEM_GB) return +process.env.DK_QUEUE_MEM_GB * 2 ** 30;
  const base = set.replace(/_\d+$/, '');
  const sheet = readJson(path.join(ROOT, 'scenes/lib/director/sets/sheets', `${base}.json`));
  return (sheet?.cost?.heavy ? 4 : 2) * 2 ** 30;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** swap a set's <builder>.auto.next.js in (written while the set was locked) */
export function swapNext(ep, set) {
  const D = dirs(ep), b = SETS[set]?.builder;
  if (!b) return false;
  const next = path.join(D.specs, `${b}.auto.next.js`);
  if (!fs.existsSync(next)) return false;
  fs.renameSync(next, path.join(D.specs, `${b}.auto.js`));
  // the shot tables carry the specs' staging text: rebuild them (cheap; documentation fields never re-render a shot)
  spawnSync(process.execPath, [path.join(ROOT, 'scenes/lib/director/tools/build-shots.mjs'), '--episode', ep], { cwd: ROOT, stdio: 'ignore' });
  return true;
}

async function run(ep) {
  const P = queuePaths(ep);
  fs.mkdirSync(P.dir, { recursive: true });
  const log = (s) => console.log(`[${now().slice(11, 19)}] ${s}`);
  // take the queue over: a live runner wins; a dead one's pid file and set locks are stale and removed
  const l = liveness(ep);
  if (l.alive && l.pid !== process.pid) { log(`queue for ${ep} already running (pid ${l.pid}, heartbeat ${l.heartbeatAge} s ago)`); return 0; }
  if (l.pid && l.pid !== process.pid) log(`stale pid ${l.pid} (heartbeat ${l.heartbeatAge} s ago): taking over`);
  fs.writeFileSync(P.pid, String(process.pid));
  let q = loadQueue(ep);
  // a render the dead runner started may outlive it (killed runner, live child): wait for it rather than render twice
  for (const j of q.jobs) if (j.status === 'running' && j.renderPid) for (let w = 0; w < 120; w++) { try { process.kill(j.renderPid, 0); } catch { break; } if (!w) log(`${j.id}: render pid ${j.renderPid} of the dead runner is still alive - waiting for it`); await sleep(10e3); }
  for (const j of q.jobs) if (j.status === 'running' || j.status === 'waiting-memory') { log(`${j.id}: was ${j.status} when its runner died - resuming`); j.status = 'pending'; j.resumed = (j.resumed || 0) + 1; }
  for (const f of fs.readdirSync(P.dir).filter((x) => x.endsWith('.lock'))) if (!lockHolder(path.join(P.dir, f))) { fs.rmSync(path.join(P.dir, f), { force: true }); const set = f.replace(/\.lock$/, ''); if (swapNext(ep, set)) log(`${set}: stale lock removed, .auto.next.js swapped in`); }
  q.pid = process.pid; q.started = now(); q.heartbeat = now(); q.status = 'running';
  saveQueue(ep, q);
  const beat = () => { const x = loadQueue(ep); x.heartbeat = now(); x.pid = process.pid; saveQueue(ep, x); };
  const hb = setInterval(beat, HEARTBEAT_S * 1000);
  let child = null;
  // render-shots closes its browsers on SIGINT (on SIGTERM / SIGKILL its Chromium processes would be orphaned)
  const stop = async (sig) => { log(`${sig}: stopping (finished shots are kept)`); if (child) { const c = child; try { process.kill(c.pid, 'SIGINT'); } catch { /* gone */ } await Promise.race([new Promise((r) => c.on('exit', r)), sleep(20e3)]); } const x = loadQueue(ep); for (const j of x.jobs) if (j.status === 'running') j.status = 'pending'; x.status = 'stopped'; saveQueue(ep, x); fs.rmSync(P.pid, { force: true }); process.exit(130); };
  process.on('SIGTERM', () => stop('SIGTERM')); process.on('SIGINT', () => stop('SIGINT'));

  const update = (id, patch) => { const x = loadQueue(ep); const j = x.jobs.find((y) => y.id === id); Object.assign(j, patch); saveQueue(ep, x); return j; };
  for (;;) {
    q = loadQueue(ep);
    const job = q.jobs.find((j) => j.status === 'pending');
    if (!job) break;
    const tier = job.tier;
    // what is left of the job: shots not fresh now; adopt shots a killed run finished (files newer than its launch, key unchanged)
    const st = await draftState(ep, tier);
    for (const s of job.shots) {
      const x = st.get(s);
      if (!x || x.fresh || !job.launch) continue;
      const files = outputsOf(ep, tier, s);
      if (files.length && files.every((f) => fs.statSync(f).mtimeMs >= Date.parse(job.launch.at)) && job.launch.keys[s] === x.key) {
        fs.writeFileSync(sidecar(ep, tier, s), JSON.stringify({ job: s, key: x.key, at: now(), adopted: true }, null, 1) + '\n');
        x.fresh = true; log(`${job.id}: ${s} finished before the runner died - adopted`);
      }
    }
    const todo = job.shots.filter((s) => st.get(s) && !st.get(s).fresh);
    if (!todo.length) { update(job.id, { status: 'done', ended: now(), note: 'nothing left' }); log(`${job.id}: nothing left to render`); continue; }
    // memory guard
    const need = needBytes(job.set);
    for (let w = 0; os.freemem() < need && w < 40; w++) { if (!w) { update(job.id, { status: 'waiting-memory' }); log(`${job.id}: ${(os.freemem() / 2 ** 30).toFixed(1)} GB free < ${(need / 2 ** 30).toFixed(1)} GB: waiting`); } await sleep(30e3); }
    // lock the set, remember the keys at launch, render
    fs.writeFileSync(P.lock(job.set), String(process.pid));
    const keys = Object.fromEntries(todo.map((s) => [s, st.get(s).key]));
    // old pictures of these shots go (a re-timed shot's still has another frame number), with their sidecars
    for (const s of todo) for (const f of [...outputsOf(ep, tier, s), sidecar(ep, tier, s)]) fs.rmSync(f, { force: true });
    const launch = { at: now(), keys };
    update(job.id, { status: 'running', started: launch.at, launch, rendering: todo, tries: job.tries + 1 });
    const args = [RENDER_SHOTS, '--episode', ep, '--sets', job.set, '--only', todo.join(','), '--work', workDir(ep), '--workers', '1', ...(tier === 'video' ? ['--segment', '48'] : ['--stills', STILL_US.join(',')])];
    log(`${job.id}: render-shots ${tier} ${todo.join(' ')}`);
    const t0 = Date.now();
    child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
    update(job.id, { renderPid: child.pid });
    // per-shot completion while it runs: a shot whose files appeared since the launch gets its sidecar
    const seen = new Set();
    const poll = () => {
      for (const s of todo) {
        if (seen.has(s)) continue;
        const files = outputsOf(ep, tier, s);
        if ((tier === 'video' ? files.length : files.length >= STILL_US.length) && files.every((f) => fs.statSync(f).mtimeMs >= t0)) {
          seen.add(s);
          fs.writeFileSync(sidecar(ep, tier, s), JSON.stringify({ job: s, key: keys[s], at: now(), s: Math.round((Date.now() - t0) / 1000) }, null, 1) + '\n');
          log(`${job.id}: ${s} done (${Math.round((Date.now() - t0) / 1000)} s since launch)`);
        }
      }
    };
    const pt = setInterval(poll, 5000);
    const code = await new Promise((r) => child.on('exit', (c) => r(c)));
    clearInterval(pt); poll(); child = null;
    fs.rmSync(P.lock(job.set), { force: true });
    const swapped = swapNext(ep, job.set);
    if (swapped) log(`${job.set}: .auto.next.js swapped in (specs staged while the set was rendering)`);
    // shots whose key changed during the render (an edit, the swap) are stale: re-queue them (at most twice)
    const now2 = await renderKeys(ep, tier);
    const failed = todo.filter((s) => !seen.has(s));
    const stale = todo.filter((s) => seen.has(s) && now2.get(s)?.key !== keys[s]);
    const wall = Math.round((Date.now() - t0) / 1000);
    update(job.id, { status: failed.length && job.tries + 1 >= MAX_TRIES ? 'failed' : failed.length ? 'pending' : 'done', ended: now(), wall_s: wall, rendered: [...seen], failed, stale, exit: code });
    log(`${job.id}: exit ${code} in ${wall} s - ${seen.size} rendered${failed.length ? `, FAILED ${failed.join(' ')}` : ''}${stale.length ? `, stale ${stale.join(' ')}` : ''}`);
    if (stale.length) {
      if ((job.requeues || 0) < MAX_REQUEUE) { enqueue(ep, [{ set: job.set, tier, shots: stale, requeues: (job.requeues || 0) + 1 }]); log(`${job.id}: re-queued ${stale.join(' ')} (re-queue ${(job.requeues || 0) + 1} of ${MAX_REQUEUE})`); }
      else log(`${job.id}: ${stale.join(' ')} still stale after ${MAX_REQUEUE} re-queues - left for the next make-episode run`);
    }
  }
  // post: the cut and the mix with the new pictures
  q = loadQueue(ep);
  if (q.post?.status === 'pending' && q.jobs.some((j) => j.status === 'done')) {
    log(`post: ${q.post.cmd.join(' ')}`);
    const r = spawnSync(q.post.cmd[0], q.post.cmd.slice(1), { cwd: ROOT, stdio: 'inherit' });
    q = loadQueue(ep); q.post.status = r.status === 0 ? 'done' : 'failed'; q.post.at = now();
  }
  clearInterval(hb);
  q.status = q.jobs.some((j) => j.status === 'failed') ? 'failed' : 'done'; q.ended = now(); q.heartbeat = now();
  saveQueue(ep, q);
  fs.rmSync(P.pid, { force: true });
  log(`queue ${q.status}`);
  return 0;
}

export function statusText(ep) {
  const q = loadQueue(ep), l = liveness(ep), P = queuePaths(ep);
  const lines = [`queue ${ep}: ${l.alive ? `RUNNING pid ${l.pid}, heartbeat ${l.heartbeatAge} s ago` : l.pid ? `pid ${l.pid} alive but no heartbeat for ${l.heartbeatAge} s (stuck?)` : `not running${q.status ? ` (last: ${q.status}${q.ended ? ` ${q.ended.slice(0, 16)}` : ''})` : ''}`}`];
  for (const j of q.jobs.slice(-12)) lines.push(`  ${j.id.padEnd(22)} ${j.tier.padEnd(6)} ${j.status.padEnd(14)} ${j.shots.join(' ')}${j.wall_s ? `  ${j.wall_s} s` : ''}${j.failed?.length ? `  FAILED ${j.failed.join(' ')}` : ''}${j.stale?.length ? `  stale ${j.stale.join(' ')}` : ''}`);
  if (q.post) lines.push(`  post: ${q.post.status} (${q.post.cmd.slice(1).join(' ').replace(ROOT + '/', '')})`);
  return lines.join('\n');
}

async function main() {
  const { ep, argv } = episodeArg(process.argv.slice(2), null);
  const cmd = argv[0];
  if (!ep || !['start', 'run', 'status', 'stop'].includes(cmd)) { console.error('usage: node engine/queue.mjs start|run|status|stop --episode <id>'); process.exit(2); }
  if (cmd === 'run') process.exit(await run(ep));
  if (cmd === 'start') { const r = startDetached(ep); console.log(r.already ? `queue already running (pid ${r.pid})` : `queue started detached (pid ${r.pid}); log ${path.relative(ROOT, queuePaths(ep).log)}`); return; }
  if (cmd === 'stop') { const l = liveness(ep); if (!l.pid) { console.log('not running'); return; } process.kill(l.pid, 'SIGTERM'); console.log(`asked pid ${l.pid} to stop (its render closes its browsers first)`); return; }
  console.log(statusText(ep));
  const log = queuePaths(ep).log;
  if (fs.existsSync(log)) console.log('--- log tail ---\n' + fs.readFileSync(log, 'utf8').split('\n').filter((x) => x && !x.startsWith('\r')).slice(-8).join('\n'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === SELF) main().catch((e) => { console.error(e.stack || e); process.exit(1); });
