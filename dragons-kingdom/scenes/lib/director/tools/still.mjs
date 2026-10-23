#!/usr/bin/env node
// Shot director - render stills of shots for review (one browser per call, all stills in one job).
//
//   node scenes/lib/director/tools/still.mjs 1A-04 1A-12@0.8 T-01@2.5s --preset draft --out DIR
//
// <shot>[@u] (u = fraction of the shot, default 0.5) or <shot>@<seconds>s. The set scene and the
// shot's start come from the shot tables (episodes/s01e01/final/scenes/*.shots.json). Stills are
// rendered as a 1-fps sequence of the chosen frames by render.mjs --still, one call per shot.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const SCENES = path.join(ROOT, 'episodes/s01e01/final/scenes');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const preset = opt('--preset', 'draft');
const out = path.resolve(opt('--out', path.join(ROOT, 'output/director-stills')));
const cin = opt('--cinematic', null);
const size = opt('--size', null);
fs.mkdirSync(out, { recursive: true });
const tables = fs.readdirSync(SCENES).filter((f) => f.endsWith('.shots.json')).map((f) => JSON.parse(fs.readFileSync(path.join(SCENES, f), 'utf8')));
for (const a of args) {
  const [job, at] = a.split('@');
  const tab = tables.find((t) => t.shots.some((s) => s.job === job));
  if (!tab) { console.error(`${job}: not in any shot table`); continue; }
  const s = tab.shots.find((x) => x.job === job);
  const secs = s.frames / 24;
  let local = secs * 0.5;
  if (at) local = at.endsWith('s') ? parseFloat(at) : parseFloat(at) * secs;
  const f = Math.min(s.frames - 1, Math.max(0, Math.round(local * 24)));
  const t = s.start_s + f / 24;
  const png = path.join(out, `${job}_${String(f).padStart(3, '0')}.png`);
  const cmd = ['render/render.mjs', '--still', path.join(ROOT, tab.scene_file), '--time', t.toFixed(5), '--preset', preset, '--png', png, ...(cin ? ['--cinematic', cin] : []), ...(size ? ['--size', size] : [])];
  const t0 = Date.now();
  const r = spawnSync(process.execPath, cmd, { cwd: ROOT, encoding: 'utf8' });
  const msg = (r.stdout + r.stderr).split('\n').filter((l) => /wrote|error|Error|WARN|warn/.test(l) && !/console\.warn.*f4/.test(l)).slice(0, 6).join('\n');
  console.log(`${job} @${local.toFixed(2)}s (frame ${f}, t=${t.toFixed(3)}): ${((Date.now() - t0) / 1000).toFixed(0)} s\n${msg}`);
}
