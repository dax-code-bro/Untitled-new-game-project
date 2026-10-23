#!/usr/bin/env node
// Shot director - REVIEW SHEETS of an assembled cut: frames taken from the cut file itself (so the
// transitions, captions and burn-ins are what is reviewed), at given fractions of every shot of the
// edit list, tiled into numbered contact-sheet pages labelled with the shot id and record timecode.
//
//   node scenes/lib/director/tools/cut-sheet.mjs --cut CUT.mp4 --out DIR [--at 0.2,0.8] [--per-page 24] [--only P-02,1A-18]
//
// Writes DIR/cut-sheet-01.png ... (6 columns, 320 px wide frames) and prints the page list.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffmpegPath } from '../../../../render/lib/tools.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const argv = process.argv.slice(2);
const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const CUT = opt('--cut'); const OUT = path.resolve(opt('--out', 'cut-sheets'));
if (!CUT || !fs.existsSync(CUT)) throw new Error('--cut FILE.mp4 (an assembled cut) is required');
const AT = (opt('--at', '0.2,0.8')).split(',').map(Number);
const PER = +opt('--per-page', 24), COLS = 6, TW = 320, TH = 180;
const ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null;
const edl = JSON.parse(fs.readFileSync(path.join(ROOT, 'episodes/s01e01/final/cut/edl.json'), 'utf8'));
const FPS = edl.fps;
const font = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'].find((f) => fs.existsSync(f));
const ff = font ? `fontfile='${font.replace(/:/g, '\\:')}':` : '';
const tc = (f) => { const s = Math.floor(f / FPS); return `${String(Math.floor(s / 60)).padStart(2, '0')}\\:${String(s % 60).padStart(2, '0')}\\:${String(f % FPS).padStart(2, '0')}`; };

const picks = [];
for (const e of edl.shots) {
  if (ONLY && !ONLY.has(e.job)) continue;
  for (const u of AT) picks.push({ job: e.job, frame: e.rec_in + Math.min(e.frames - 1, Math.max(0, Math.round(u * (e.frames - 1)))) });
}
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-sheet-'));
const pages = [];
for (let p = 0; p * PER < picks.length; p++) {
  const part = picks.slice(p * PER, (p + 1) * PER);
  // one ffmpeg pass per page: select the frames, label, tile
  const sel = part.map((x) => `eq(n\\,${x.frame})`).join('+');
  const labels = part.map((x, i) => `drawtext=${ff}text='${x.job}  ${tc(x.frame)}':x=4:y=4:fontsize=13:fontcolor=yellow:box=1:boxcolor=black@0.6:boxborderw=2:enable='eq(n\\,${i})'`).join(',');
  const rows = Math.ceil(part.length / COLS);
  const outF = path.join(OUT, `cut-sheet-${String(p + 1).padStart(2, '0')}.png`);
  const vf = `select='${sel}',scale=${TW}:${TH},setpts=N/TB,${labels},tile=${COLS}x${rows}:padding=2:color=0x202020`;
  const r = spawnSync(ffmpegPath(), ['-v', 'error', '-y', '-i', CUT, '-vf', vf, '-frames:v', '1', '-vsync', '0', outF], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  pages.push(outF);
  console.log(`${outF}: ${part[0].job} .. ${part[part.length - 1].job}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
