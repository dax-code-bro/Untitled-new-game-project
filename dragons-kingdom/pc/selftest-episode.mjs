#!/usr/bin/env node
// End-to-end self-test of `npm run episode` on a tiny made-up episode (320x180, a few seconds),
// so the whole pipeline is proven on this computer in a couple of minutes:
//
//   node pc/selftest-episode.mjs            (uses the GPU if gpu-check found one, else the CPU)
//   node pc/selftest-episode.mjs --cpu | --gpu | --keep
//
// What it checks:
//  1. a scene whose shot scene file does not exist yet is SKIPPED with a message, the
//     other scenes render and are joined into scene files (one with sound, END credits card);
//  2. the missing scene file "arrives" (as with git pull); the run is hard-killed in the
//     middle of that shot (like a power cut);
//  3. the next run resumes the shot from its finished chunks, joins the last scene and
//     assembles the episode (+ small copy, subtitles); frame counts, streams and sound are checked;
//  4. one more run has nothing left to do.
//  5. the credits text changes: only the credits card is made again and END + the episode are rejoined.
// The fixture lives in output/selftest-episode/ (removed afterwards unless --keep).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const MODE = args.includes('--gpu') ? '--gpu' : args.includes('--cpu') ? '--cpu' : null;
const FIX = path.join(ROOT, 'output', 'selftest-episode');
const OUT = path.join(FIX, 'out');
const SIZE = '320x180';
const t0 = Date.now();
let failures = 0;

const say = (s) => console.log(s);
const check = (ok, what) => { say(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures++; return ok; };
const ffprobe = () => {
  const r = spawnSync(process.execPath, ['-e', `import(${JSON.stringify(new URL('../render/lib/tools.mjs', import.meta.url).href)}).then(m=>console.log(m.ffprobePath()))`], { encoding: 'utf8' });
  return r.stdout.trim() || 'ffprobe';
};
const probe = (f, extra) => { const r = spawnSync(ffprobe(), ['-v', 'error', '-of', 'json', ...extra, f], { encoding: 'utf8' }); try { return JSON.parse(r.stdout); } catch { return null; } };

function sceneSource(color, title) {
  return `import * as THREE from 'three';
export const meta = { title: '${title}', duration: 30 };
let box;
export async function setup(ctx) {
  ctx.scene.background = new THREE.Color('#203040');
  box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '${color}' }));
  ctx.scene.add(box, new THREE.HemisphereLight(0xffffff, 0x404040, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(2, 3, 4); ctx.scene.add(sun);
  ctx.camera.position.set(0, 0.6, 3); ctx.camera.lookAt(0, 0, 0);
}
export function update(t) { box.rotation.set(t * 0.7, t * 1.1, 0); }
`;
}

function writeFixture() {
  fs.rmSync(FIX, { recursive: true, force: true });
  const plan = path.join(FIX, 'plan');
  fs.mkdirSync(path.join(plan, 'scenes', 'shots'), { recursive: true });
  fs.mkdirSync(path.join(plan, 'audio', 'scenes'), { recursive: true });
  fs.writeFileSync(path.join(plan, 'render-schedule.md'), `# Self-test schedule

| # | Scene | Starts | Length | Shots / jobs | Frames | Mean s/frame | Render h (1 browser) | Range h | Wall h (2 browsers) | Days |
|---:|---|---:|---:|---:|---:|---:|---:|---|---:|---:|
| 1 | A: Opening (a card, then a shot with sound) | 0:00 | 0:02 | 2 / 1 | 48 | 1 | 0.1 | 0-1 | 0.1 | 0.0 |
| 2 | B: The set that is built later | 0:02 | 0:03 | 1 / 1 | 72 | 1 | 0.1 | 0-1 | 0.1 | 0.0 |
| 3 | C: Two ways to name a shot | 0:05 | 0:02 | 2 / 2 | 48 | 1 | 0.1 | 0-1 | 0.1 | 0.0 |
| 4 | END: Credits | 0:07 | 0:02 | 1 / 0 | 48 | 0 | 0 | 0-0 | 0 | 0.0 |
| | **Total** | | **0:09** | | **216** | | **0.4** | 0-3 | **0.4** | **0** |
`);
  const cmd = (scene, start, secs, chunk, out) => `node render/render.mjs ${scene} --preset final --cinematic velocity --start ${start} --seconds ${secs} --workers 2 --chunk-seconds ${chunk} --bit-depth 10 --crf 12 --out ${out}`;
  const a2 = path.join(plan, 'scenes', 'opening.js');
  const setB = path.join(plan, 'scenes', 'set-b.js');
  const setC = path.join(plan, 'scenes', 'set-c.js');
  const jobs = [
    { job: 'A-01', seq: 1, scene: 'A', set: 'CARD_BLACK', render: 'black', frames: 24, s_per_frame: 0, setup_s: 0, command: null },
    { job: 'A-02', seq: 2, scene: 'A', set: 'OPENING', render: '3d', frames: 24, s_per_frame: 1, setup_s: 5, chunk_seconds: 0.5, command: cmd(a2, 0, '1.000000', '0.5000', 'x') },
    { job: 'B-01', seq: 3, scene: 'B', set: 'SET_B', render: '3d', frames: 72, s_per_frame: 1, setup_s: 5, chunk_seconds: 0.25, command: cmd(setB, '<shot start, s>', '3.000000', '0.2500', 'x') },
    { job: 'C-01', seq: 4, scene: 'C', set: 'SET_C', render: '3d', frames: 24, s_per_frame: 1, setup_s: 5, chunk_seconds: 0.5, command: cmd(path.join(plan, 'scenes', 'missing-set.js'), '<shot start, s>', '1.000000', '0.5000', 'x') },
    { job: 'C-02', seq: 5, scene: 'C', set: 'SET_C', render: '3d', frames: 24, s_per_frame: 1, setup_s: 5, chunk_seconds: 0.5, command: cmd(setC, '<shot start, s>', '1.000000', '0.5000', 'x') },
    { job: 'E-01', seq: 6, scene: 'END', set: 'CARD_BLACK', render: 'text', frames: 48, s_per_frame: 0, setup_s: 0, command: null },
  ];
  fs.writeFileSync(path.join(plan, 'render-jobs.json'), JSON.stringify({ meta: { status: 'self-test' }, jobs }, null, 1));
  fs.writeFileSync(a2, sceneSource('#d0a040', 'opening'));                         // a: a finished command
  fs.writeFileSync(path.join(plan, 'scenes', 'shots', 'C-01.js'), sceneSource('#40c070', 'C-01 alone'));   // c: one file per shot
  fs.writeFileSync(setC, sceneSource('#c04040', 'set C'));                         // b: set scene + shot table
  fs.writeFileSync(path.join(plan, 'scenes', 'set-c.shots.json'), JSON.stringify({ shots: [{ job: 'C-02', start_s: 4, frames: 24 }] }));
  fs.writeFileSync(path.join(plan, 'credits.txt'), "DRAGON'S KINGDOM\n\nself-test credits\n\nCreated by Daxtyn\n");
  fs.writeFileSync(path.join(plan, 'shotlist.json'), JSON.stringify({ shots: [
    { id: 'A-02', dialogue: [{ id: 'L1', line_seconds: 0.9 }] },
    { id: 'C-02', dialogue: [{ id: 'L2', line_seconds: 0.8 }] },
  ] }));
  fs.writeFileSync(path.join(plan, 'dialogue.json'), JSON.stringify({ lines: [
    { id: 'L1', text: 'One like Charcoal.', subtitle_cues: ['One like Charcoal.'], subtitle_min_seconds: 0.8 },
    { id: 'L2', text: 'Fly.', subtitle_cues: ['Fly.'], subtitle_min_seconds: 0.6 },
  ] }));
  // sound for scene A only: a 2 s tone (the other scenes stay silent)
  const ff = spawnSync(process.execPath, ['-e', `import(${JSON.stringify(new URL('../render/lib/tools.mjs', import.meta.url).href)}).then(m=>console.log(m.ffmpegPath()))`], { encoding: 'utf8' }).stdout.trim() || 'ffmpeg';
  const r = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-ac', '2', path.join(plan, 'audio', 'scenes', 'A.wav')]);
  if (r.status !== 0) throw new Error('ffmpeg could not make the test tone');
  return { plan, setB };
}

function runEpisode(extra = [], { killWhen } = {}) {
  return new Promise((resolve) => {
    const a = [path.join(ROOT, 'render', 'episode.mjs'), '--schedule', path.join(FIX, 'plan', 'render-schedule.md'), '--size', SIZE,
      '--out', OUT, '--skip-cache-check', '--master-preset', 'veryfast', ...(MODE ? [MODE] : []), ...extra];
    const p = spawn(process.execPath, a, { cwd: ROOT, detached: !WIN, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let killed = false;
    const onData = (d) => { out += d; };
    p.stdout.on('data', onData); p.stderr.on('data', onData);
    let timer = null;
    if (killWhen) {
      timer = setInterval(() => {
        if (killed || !killWhen()) return;
        killed = true;
        if (WIN) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']);
        else { try { process.kill(-p.pid, 'SIGKILL'); } catch {} }
      }, 200);
    }
    p.on('close', (code, signal) => { clearInterval(timer); resolve({ code, signal, out, killed }); });
  });
}

async function main() {
  say(`episode self-test (${SIZE}, ${MODE || 'renderer: as gpu-check decided'}) in ${path.relative(ROOT, FIX)}`);
  const { setB } = writeFixture();
  const sceneMp4 = (k) => path.join(OUT, 'scenes', `${k}_TEST_${SIZE}.mp4`);
  const episode = path.join(OUT, `DragonsKingdom_S01E01_TEST_${SIZE}.mp4`);

  say('\nrun 1: scene B has no scene file yet');
  let r = await runEpisode();
  if (r.code === 2 && /No graphics card has been checked/.test(r.out)) { say(r.out); say(`-> run with --cpu, or run the GPU check first: ${process.platform === 'win32' ? 'pc\\GPU-Check.cmd' : 'npm run gpu-check'}`); return 2; }
  check(r.code === 0, `exit code 0 (got ${r.code})`);
  check(/B-01\s+SKIPPED - waiting for .*set-b\.js/.test(r.out), 'B-01 skipped with a clear message');
  check(['A', 'C', 'END'].every((k) => fs.existsSync(sceneMp4(k))), 'scene files A, C and END were made');
  check(!fs.existsSync(sceneMp4('B')) && !fs.existsSync(episode), 'no scene B and no episode yet');
  const a = probe(sceneMp4('A'), ['-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt:format=duration']);
  check(a?.streams?.some((s) => s.codec_type === 'audio') && a.streams.some((s) => s.pix_fmt === 'yuv420p10le' && s.width === 320), 'scene A: 10-bit video at 320x180 + sound');
  if (failures) { say(r.out); return 1; }

  say('\nrun 2: the set-B scene file arrives (like git pull); the run is hard-killed in the middle of B-01');
  fs.writeFileSync(setB, sceneSource('#4060e0', 'set B'));
  fs.writeFileSync(setB.replace(/\.js$/, '.shots.json'), JSON.stringify({ shots: [{ job: 'B-01', start_s: 10, frames: 72 }] }));
  const chunks = path.join(OUT, 'shots', 'B', 'B-01', 'chunks');
  r = await runEpisode([], { killWhen: () => fs.existsSync(chunks) && fs.readdirSync(chunks).filter((f) => /^chunk_\d+\.mp4$/.test(f)).length >= 3 });
  const kept = fs.existsSync(chunks) ? fs.readdirSync(chunks).filter((f) => /^chunk_\d+\.mp4$/.test(f)).length : 0;
  check(r.killed, `killed while rendering B-01 (${kept} of 12 chunks finished)`);
  check(!fs.existsSync(path.join(OUT, 'shots', 'B', 'B-01', 'DONE.json')), 'B-01 is not marked done');

  say('\nrun 3: resume');
  r = await runEpisode();
  check(r.code === 0, `exit code 0 (got ${r.code})`);
  const m = /resuming: (\d+) chunk\(s\) already finished/.exec(r.out);
  check(!!m && +m[1] >= 3, `B-01 resumed from its finished chunks (${m ? m[1] : 'none'} reused)`);
  check(!/A-02\s+\d+ frames/.test(r.out) && !/C-0\d\s+\d+ frames/.test(r.out), 'finished shots were not rendered again');
  check(fs.existsSync(episode), 'the episode file was assembled');
  const v = probe(episode, ['-count_packets', '-show_entries', 'stream=codec_type,codec_name,nb_read_packets,width,height:format=duration']);
  const vs = v?.streams?.find((s) => s.codec_type === 'video');
  check(vs && +vs.nb_read_packets === 216, `episode has all 216 frames (got ${vs?.nb_read_packets})`);
  check(v?.streams?.some((s) => s.codec_type === 'audio') && v.streams.some((s) => s.codec_type === 'subtitle'), 'episode has sound and a subtitle track');
  check(Math.abs(+v?.format?.duration - 9) < 0.1, `episode is 9.0 s long (got ${v?.format?.duration})`);
  const small = path.join(OUT, 'DragonsKingdom_S01E01_TEST_160x90.mp4');
  const s2 = probe(small, ['-count_packets', '-show_entries', 'stream=codec_type,width,pix_fmt,nb_read_packets']);
  check(s2?.streams?.some((s) => s.codec_type === 'video' && s.width === 160 && s.pix_fmt === 'yuv420p' && +s.nb_read_packets === 216), 'small 8-bit copy with all frames');
  const srt = fs.existsSync(path.join(OUT, 'DragonsKingdom_S01E01.en.srt')) ? fs.readFileSync(path.join(OUT, 'DragonsKingdom_S01E01.en.srt'), 'utf8') : '';
  check(/00:00:01,250 --> .*\nOne like Charcoal\./.test(srt) && /Fly\./.test(srt), 'subtitles placed in their shots (A-02 at 1.25 s)');

  say('\nrun 4: the sound for scene C arrives later: only the sound track is replaced');
  const ffm = spawnSync(process.execPath, ['-e', `import(${JSON.stringify(new URL('../render/lib/tools.mjs', import.meta.url).href)}).then(m=>console.log(m.ffmpegPath()))`], { encoding: 'utf8' }).stdout.trim() || 'ffmpeg';
  spawnSync(ffm, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=2', '-ac', '2', path.join(FIX, 'plan', 'audio', 'scenes', 'C.wav')]);
  r = await runEpisode();
  check(r.code === 0 && /C: new sound .* replacing the sound track only/.test(r.out), 'scene C: sound swapped without re-encoding the picture');
  check(!/frames, set /.test(r.out), 'no shot rendered again');
  const vol = (from, len) => {
    const x = spawnSync(ffm, ['-hide_banner', '-ss', String(from), '-t', String(len), '-i', episode, '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
    const m2 = /mean_volume: (-?[\d.]+) dB/.exec(x.stderr || '');
    return m2 ? +m2[1] : null;
  };
  const vA = vol(0.1, 1.8), vB = vol(2.2, 2.6), vC = vol(5.1, 1.8);
  check(vA > -40 && vB < -80 && vC > -40, `episode sound: scene A ${vA} dB, B ${vB} dB (silent), C ${vC} dB`);

  say('\nrun 5: nothing left to do');
  r = await runEpisode();
  check(r.code === 0 && /episode: up to date/.test(r.out) && !/frames, set /.test(r.out), 'nothing rendered, everything up to date');
  r = await runEpisode(['--status']);
  check(/total: 216\/216 frames \(100\.0%\)/.test(r.out), 'status shows 216/216 frames');

  say('\nrun 6: the credits text changes: only the credits card is made again, then END and the episode are rejoined');
  fs.appendFileSync(path.join(FIX, 'plan', 'credits.txt'), 'Leaf textures: a new line\n');
  r = await runEpisode();
  check(r.code === 0 && /E-01: the card's text changed since it was made/.test(r.out), 'the credits card was made again');
  check(!/frames, set /.test(r.out), 'no 3D shot rendered again');
  check(/END: joining/.test(r.out) && !/\bA: joining|\bC: joining/.test(r.out), 'only the END scene file was rejoined');
  const v6 = probe(episode, ['-count_packets', '-show_entries', 'stream=codec_type,nb_read_packets']);
  check(+v6?.streams?.find((x) => x.codec_type === 'video')?.nb_read_packets === 216, 'the episode was assembled again with all 216 frames');

  say(`\n${failures ? `${failures} check(s) FAILED` : 'all checks passed'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (failures) say(`(fixture and output kept in ${path.relative(ROOT, FIX)})`);
  else if (!KEEP) fs.rmSync(FIX, { recursive: true, force: true });
  return failures ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
