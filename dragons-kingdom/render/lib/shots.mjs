// Where an episode shot comes from (render/episode.mjs and render/gate.mjs).
//
// First match wins:
//   a. its render-jobs.json command, once that command has no "<...>" placeholder and its scene file exists;
//   b. the set scene named in the command (episodes/s01e01/final/scenes/<set>.js) plus its shot table
//      <set>.shots.json with an entry for the shot: {"shots": [{"job": "P-02", "start_s": 0, "frames": 144}, ...]}
//      (also accepted: "id"/"shot" for "job", "set_time_start_s"/"start" for "start_s", or an object keyed by shot id);
//   c. a scene file for just this shot: <plan>/scenes/shots/<shot>.js (starts at 0).
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from './tools.mjs';
import { parseCommand } from './schedule.mjs';

const relp = (f) => path.relative(PROJECT_ROOT, f).split(path.sep).join('/') || '.';
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** Returns { ready, kind, scene, startS, args, reason, via, entry, command, textFile, warn } */
export function resolveShot(job, planDir) {
  if (job.render === 'black') return { ready: true, kind: 'black' };
  if (job.render === 'text') {
    const credits = ['credits.txt', 'credits.md'].map((n) => path.join(planDir, n)).find((f) => fs.existsSync(f));
    return credits ? { ready: true, kind: 'text', textFile: credits }
      : { ready: false, kind: 'text', reason: `the end-credits text is not written yet (${relp(path.join(planDir, 'credits.txt'))})` };
  }
  const cmd = parseCommand(job.command);
  if (!cmd?.scene) return { ready: false, kind: '3d', reason: 'render-jobs.json has no render command for this shot' };
  const setScene = path.resolve(PROJECT_ROOT, cmd.scene);
  const base = { kind: '3d', args: cmd.args };
  // a. a finished command
  if (!cmd.placeholders.length && fs.existsSync(setScene)) {
    return { ...base, ready: true, scene: setScene, startS: Number(cmd.args.start ?? 0), via: 'render-jobs.json command', command: job.command };
  }
  // b. the set scene + its shot table
  const table = setScene.replace(/\.m?js$/, '.shots.json');
  if (fs.existsSync(setScene) && fs.existsSync(table)) {
    const t = readJson(table);
    const list = Array.isArray(t) ? t : Array.isArray(t?.shots) ? t.shots : t ? Object.entries(t).filter(([, v]) => v && typeof v === 'object').map(([k, v]) => ({ job: k, ...v })) : [];
    const e = list.find((x) => (x.job ?? x.id ?? x.shot) === job.job);
    const start = e && Number(e.start_s ?? e.set_time_start_s ?? e.start);
    if (e && Number.isFinite(start)) {
      const warn = e.frames !== undefined && +e.frames !== job.frames ? `shot table says ${e.frames} frames, render-jobs.json ${job.frames} - rendering ${job.frames}` : null;
      return { ...base, ready: true, scene: setScene, startS: start, via: `${relp(table)}`, warn, entry: e };
    }
  }
  // c. a scene file for this shot alone
  const own = path.join(planDir, 'scenes', 'shots', `${job.job}.js`);
  if (fs.existsSync(own)) return { ...base, ready: true, scene: own, startS: 0, via: relp(own) };
  const missing = !fs.existsSync(setScene) ? relp(setScene) : `an entry for ${job.job} in ${relp(table)}`;
  return { ...base, ready: false, reason: `waiting for ${missing}` };
}
