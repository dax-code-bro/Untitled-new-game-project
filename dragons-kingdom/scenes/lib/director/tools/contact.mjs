#!/usr/bin/env node
// Shot director - contact sheet from a review render (one frame per shot, `--fps 1`): every frame
// labelled with its shot id, tiled into one PNG (and optionally the frames as separate PNGs).
//
//   node render/render.mjs episodes/s01e01/final/scenes/birthing-chamber.js --preset draft --fps 1 \
//        --start 0 --seconds 42 --cinematic preview --out /tmp/rev
//   node scenes/lib/director/tools/contact.mjs /tmp/rev/rev.mp4 episodes/s01e01/final/scenes/birthing-chamber.shots.json \
//        --cols 6 --width 320 --out /tmp/rev/contact.png [--frames DIR] [--from 0 --count 24]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const cols = +opt('--cols', 6), W = +opt('--width', 320), out = opt('--out', 'contact.png'), framesDir = opt('--frames', null);
const from = +opt('--from', 0), count = opt('--count', null);
const [video, tableFile] = args;
const table = JSON.parse(fs.readFileSync(tableFile, 'utf8'));
const shots = table.shots.slice(from, count ? from + +count : undefined);
const font = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'].find((f) => fs.existsSync(f));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-contact-'));
const H = Math.round(W * 9 / 16 / 2) * 2;
const run = (a) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); };
shots.forEach((s, i) => {
  const k = from + i;
  const label = `${s.job}`.replace(/:/g, '\\:');
  run(['-i', video, '-vf', `select=eq(n\\,${k}),scale=${W}:${H},drawtext=${font ? `fontfile=${font}:` : ''}text='${label}':x=6:y=6:fontsize=${Math.round(H / 9)}:fontcolor=yellow:box=1:boxcolor=black@0.55:boxborderw=3`, '-frames:v', '1', path.join(tmp, `f${String(i).padStart(3, '0')}.png`)]);
  if (framesDir) { fs.mkdirSync(framesDir, { recursive: true }); run(['-i', video, '-vf', `select=eq(n\\,${k})`, '-frames:v', '1', path.join(framesDir, `${s.job}.png`)]); }
});
const rows = Math.ceil(shots.length / cols);
run(['-framerate', '1', '-i', path.join(tmp, 'f%03d.png'), '-vf', `tile=${cols}x${rows}:padding=4:color=0x202020`, '-frames:v', '1', out]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${out} (${shots.length} shots, ${cols}x${rows})`);
