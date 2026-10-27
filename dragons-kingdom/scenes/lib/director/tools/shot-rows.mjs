#!/usr/bin/env node
// Shot director - REVIEW ROWS of the dailies: for every rendered shot video (render-shots.mjs), frames
// at fractions of the shot side by side in one row, labelled with the shot id and its STAGING line
// from the edit list, and the review flags the render left in the shot's sidecar (framing the solver
// could not hold, a speaking face that reads). Rows are stacked into pages in edit order: the sheet
// to hold each picture against what the shot is meant to be (1A-22's swapped two-shot was found so).
//
//   node scenes/lib/director/tools/shot-rows.mjs --shots DIR/shots --out DIR/rows [--at 0.1,0.5,0.9]
//        [--only 1A-22,X2-10] [--per-page 6] [--width 480]
//
// Writes DIR/rows/rows-01.png ... and prints the page list. Shots without a video are skipped.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffmpegPath, ffprobePath } from '../../../../render/lib/tools.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const argv = process.argv.slice(2);
const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SHOTS = path.resolve(opt('--shots', path.join(ROOT, 'output/director/draft/shots')));
const OUT = path.resolve(opt('--out', 'shot-rows'));
const AT = opt('--at', '0.1,0.5,0.9').split(',').map(Number);
const PER = +opt('--per-page', 6), TW = +opt('--width', 480), TH = Math.round(TW * 9 / 16 / 2) * 2;
const ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null;
const edl = JSON.parse(fs.readFileSync(path.join(ROOT, 'episodes/s01e01/final/cut/edl.json'), 'utf8'));
const font = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'].find((f) => fs.existsSync(f));
const ff = font ? `fontfile='${font.replace(/\\/g, '/').replace(/:/g, '\\:')}':` : '';
// drawtext text: escape for the filter-graph level and the option level
const esc = (s) => String(s).replace(/\\/g, '\\\\\\\\').replace(/'/g, '\u2019').replace(/:/g, '\\:').replace(/%/g, ' percent').replace(/,/g, '\\,');
const run = (args) => { const r = spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); };
const duration = (f) => +spawnSync(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();
const wrap = (s, n) => { const out = []; let line = ''; for (const w of String(s).split(/\s+/)) { if ((line + ' ' + w).trim().length > n) { out.push(line.trim()); line = w; } else line += ' ' + w; } if (line.trim()) out.push(line.trim()); return out; };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

const shots = edl.shots.filter((e) => e.kind === '3d' && (!ONLY || ONLY.has(e.job)) && fs.existsSync(path.join(SHOTS, `${e.job}.mp4`)));
if (!shots.length) { console.log('no rendered shots found in', SHOTS); process.exit(0); }
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-rows-'));
const rows = [];
for (const e of shots) {
  const file = path.join(SHOTS, `${e.job}.mp4`), side = readJson(path.join(SHOTS, `${e.job}.json`)) || {};
  // the shot's own frames (the video may carry handle frames before / after it)
  const fps = edl.fps, pre = (side.pre || 0) / fps, len = e.frames / fps, D = duration(file);
  const cells = AT.map((u, i) => {
    const t = Math.min(D - 0.5 / fps, pre + u * (len - 1 / fps));
    // the first cell carries the staging (wrapped over the first frames' tops), the rest their fraction
    const n = Math.floor(TW / 7.2);
    const lines = i === 0 ? wrap(`${e.job}  ${e.staging || ''}`, n).slice(0, 3) : [`${e.job} ${u}`];
    const dt = lines.map((l, k) => `drawtext=${ff}text='${esc(l)}':x=4:y=${4 + k * 16}:fontsize=12:fontcolor=yellow:box=1:boxcolor=black@0.65`).join(',');
    const flags = i === 0 && side.notes?.length ? `,drawtext=${ff}text='${esc('FLAG ' + side.notes.join(' / ').slice(0, n))}':x=4:y=h-22:fontsize=12:fontcolor=0xff9090:box=1:boxcolor=black@0.7` : '';
    const f = path.join(tmp, `${e.job}-${i}.png`);
    run(['-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-vf', `scale=${TW}:${TH},${dt}${flags}`, f]);
    return f;
  });
  const row = path.join(tmp, `row-${e.job}.png`);
  if (cells.length > 1) run([...cells.flatMap((c) => ['-i', c]), '-filter_complex', `hstack=${cells.length}`, row]); else fs.copyFileSync(cells[0], row);
  rows.push(row);
}
const pages = [];
for (let p = 0; p * PER < rows.length; p++) {
  const part = rows.slice(p * PER, (p + 1) * PER);
  const out = path.join(OUT, `rows-${String(p + 1).padStart(2, '0')}.png`);
  if (part.length > 1) run([...part.flatMap((r) => ['-i', r]), '-filter_complex', `vstack=${part.length}`, out]); else fs.copyFileSync(part[0], out);
  pages.push(out);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${shots.length} shot(s) on ${pages.length} page(s):`);
for (const p of pages) console.log(`  ${p}`);
