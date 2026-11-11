// Engine phase 6: per-shot draft keys, sidecars and the queue's files (engine/DESIGN.md 5.2-5.5). Pure Node.
//   renderKeys(ep, tier)   Map job -> { set, key, frames }   what decides a shot's D1 / D2 picture (the same parts as
//                          render-shots.mjs keysFor: the row and the shot spec without documentation fields, the cast /
//                          homes / defaults, the builder, scene and common.js files) + the tier and still positions
//   draftState(ep, tier)   per shot: { fresh, have, key } from the sidecars <work>/<stills|shots>/<job>.d1|d2.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dirs, ROOT } from '../../scenes/lib/director/episode-paths.js';
import { SETS } from '../../scenes/lib/director/registry.js';
import { loadEpisodeSets, ANIMATIC_VERSION } from '../previs/animatic.mjs';

export const STILL_US = [0.5];
const DIRECTOR = path.join(ROOT, 'scenes/lib/director');
export const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
export const fileHash = (f) => { try { return sha1(fs.readFileSync(f)); } catch { return 'missing'; } };
const fnText = (v) => JSON.stringify(v, (k, x) => (typeof x === 'function' ? `fn:${x.toString()}` : x));
const DOC = ['staging', 'deviation', 'cutOk', 'notes', 'about'];
const docFree = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !DOC.includes(k)));
export const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

export function queuePaths(ep) {
  const D = dirs(ep);
  const q = path.join(D.engine, 'queue');
  return { dir: q, state: path.join(q, 'state.json'), log: path.join(q, 'log.txt'), pid: path.join(q, 'pid'), lock: (set) => path.join(q, `${set}.lock`) };
}
export const workDir = (ep) => dirs(ep).work('draft');
export const tierDir = (ep, tier) => path.join(workDir(ep), tier === 'video' ? 'shots' : 'stills');
export const sidecar = (ep, tier, job) => path.join(tierDir(ep, tier), `${job}.${tier === 'video' ? 'd2' : 'd1'}.json`);
/** the picture files a finished shot of this tier has */
export function outputsOf(ep, tier, job) {
  const d = tierDir(ep, tier);
  if (tier === 'video') return fs.existsSync(path.join(d, `${job}.mp4`)) ? [path.join(d, `${job}.mp4`)] : [];
  try { return fs.readdirSync(d).filter((f) => f.startsWith(`${job}_`) && /^_\d{3}\.png$/.test(f.slice(job.length))).map((f) => path.join(d, f)); } catch { return []; }
}

/** a lock held by a live process: pid or null */
export function lockHolder(f) {
  try { const pid = +fs.readFileSync(f, 'utf8').trim(); if (pid) { process.kill(pid, 0); return pid; } } catch { /* none / dead */ }
  return null;
}

/** Map job -> { set, key, frames, scene } for every shot of the episode's set tables */
export async function renderKeys(ep, tier = 'stills', sets = null) {
  const out = new Map();
  const common = fileHash(path.join(DIRECTOR, 'sets/common.js'));
  for (const { setId, spec, table } of sets || await loadEpisodeSets(ep)) {
    const reg = SETS[setId];
    const setPart = { cast: spec.cast, homes: spec.homes, defaults: spec.defaults, b: fileHash(path.join(DIRECTOR, 'sets', `${reg.builder}.js`)), sc: fileHash(path.join(dirs(ep).scenes, reg.file)), common };
    for (const row of table.shots) {
      const key = sha1(fnText({ v: 1, tier, us: tier === 'video' ? null : STILL_US, row: docFree(row), s: docFree(spec.shots?.[row.job]), set: setPart }));
      out.set(row.job, { set: setId, key, frames: row.frames, scene: row.scene });
    }
  }
  return out;
}

/** previs (D0) key per shot: the shot's row + spec entry + the cast, and the animatic version */
export async function previsKeys(ep, sets = null) {
  const out = new Map();
  for (const { spec, table } of sets || await loadEpisodeSets(ep)) for (const row of table.shots) out.set(row.job, sha1(fnText({ v: ANIMATIC_VERSION, row: docFree(row), s: docFree(spec.shots?.[row.job]), cast: spec.cast })));
  return out;
}

/** per shot: { set, key, have (files exist), fresh (sidecar key == key) } */
export async function draftState(ep, tier, sets = null) {
  const keys = await renderKeys(ep, tier, sets);
  const st = new Map();
  for (const [job, k] of keys) {
    const sc = readJson(sidecar(ep, tier, job));
    const have = outputsOf(ep, tier, job).length > 0;
    st.set(job, { ...k, have, fresh: have && sc?.key === k.key, sidecar: sc });
  }
  return st;
}
