// planlabels.mjs <render.log> <plan image> <out image>: draws the marker labels (positions logged by
// the cling scene's plan shot) onto the plan view with ffmpeg drawtext
import fs from 'fs';
import { execFileSync } from 'child_process';
const [log, img, out] = process.argv.slice(2);
const lines = fs.readFileSync(log, 'utf8').split('\n').filter((l) => l.includes('[arch-cling-plan]'));
if (!lines.length) { console.error('no plan positions in log'); process.exit(1); }
const pos = JSON.parse(lines[lines.length - 1].split('[arch-cling-plan] ')[1]);
const dim = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', img]).toString().trim().split(',').map(Number);
const [W, H] = dim;
const fs2 = Math.round(H / 40);
const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const names = { arch: 'stone arch (escape 1)', gate: 'gate to broad road (escape 2)', fountain: 'fountain + pillar', support: 'stone support (cover)', steps: 'the king\u2019s steps', stall: 'vendor stall', music: 'music space', alley: 'alley', watchman: 'watchman' };
const f = Object.entries(pos).map(([k, [u, v]]) => `drawtext=fontfile=${font}:text='${names[k] || k}':x=${Math.round(u * W + fs2 * 0.9)}:y=${Math.round(v * H - fs2 / 2)}:fontsize=${fs2}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=${Math.round(fs2 / 4)}`);
f.push(`drawtext=fontfile=${font}:text='N (up) - camera of the cling_map looks from the steps (bottom) toward N':x=${fs2}:y=${H - fs2 * 2}:fontsize=${fs2}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=${Math.round(fs2 / 4)}`);
execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-i', img, '-vf', f.join(','), '-q:v', '2', out]);
console.log('wrote', out, JSON.stringify(pos));
