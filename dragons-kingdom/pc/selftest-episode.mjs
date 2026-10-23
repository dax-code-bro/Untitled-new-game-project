#!/usr/bin/env node
// End-to-end self-test of `npm run episode` on a tiny made-up episode (320x180, a few seconds),
// so the whole pipeline is proven on this computer in a couple of minutes:
//
//   node pc/selftest-episode.mjs            (uses the GPU if gpu-check found one, else the CPU)
//   node pc/selftest-episode.mjs --cpu | --gpu | --keep
//
// What it checks:
//  0. the render gate: with nothing approved (render-ready.json), no shot and no credits card is
//     rendered, only black cards; --ignore-gate is refused for a master (no --size);
//  1. after approval (node render/gate.mjs approve ...): a scene whose shot scene file does not exist
//     yet is SKIPPED with a message, the other scenes render and are joined into scene files (one with
//     sound, END credits card);
//  2. the missing scene file "arrives" (as with git pull) but is not approved: SKIPPED; once approved,
//     the run is hard-killed in the middle of that shot (like a power cut);
//  3. the next run resumes the shot from its finished chunks, joins the last scene and
//     assembles the episode (+ small copy, subtitles); frame counts, streams and sound are checked;
//  4. the sound of a scene arrives: only the sound track is replaced;
//  5. one more run has nothing left to do;
//  6. the credits text changes: nothing happens until it is approved again; then only the credits
//     card is made again and END + the episode are rejoined;
//  7. a scene file changes after approval (work in progress pushed): the finished shot stays, nothing
//     is rendered; the shot is approved again with the new file: it is rendered again, only its scene
//     is re-joined, and the episode is assembled again;
//  8. an approval is withdrawn: that scene is not joined and the episode is not assembled; approved
//     again with the same files: everything is up to date without rendering.
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

/** node render/gate.mjs <cmd> <args> on the fixture's plan */
function gate(cmd, ...args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'render', 'gate.mjs'), cmd, ...args, '--schedule', path.join(FIX, 'plan', 'render-schedule.md')], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
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

  say('\nrun 0: the render gate - nothing is approved yet');
  let r = await runEpisode();
  if (r.code === 2 && /No graphics card has been checked/.test(r.out)) { say(r.out); say(`-> run with --cpu, or run the GPU check first: ${process.platform === 'win32' ? 'pc\\GPU-Check.cmd' : 'npm run gpu-check'}`); return 2; }
  check(r.code === 0, `exit code 0 (got ${r.code})`);
  check(/A-02\s+SKIPPED - not approved for the masters yet/.test(r.out) && /E-01\s+SKIPPED - not approved/.test(r.out), 'A-02 and the credits card are SKIPPED: not approved');
  check(!/frames, set /.test(r.out) && !fs.existsSync(sceneMp4('A')) && !fs.existsSync(sceneMp4('END')), 'no shot rendered, no scene file made');
  check(fs.existsSync(path.join(OUT, 'shots', 'A', 'A-01', 'DONE.json')), 'the black card A-01 needs no approval and was made');
  const ig = spawnSync(process.execPath, [path.join(ROOT, 'render', 'episode.mjs'), '--schedule', path.join(FIX, 'plan', 'render-schedule.md'), '--ignore-gate', '--dry-run', '--cpu'], { cwd: ROOT, encoding: 'utf8' });
  check(ig.status === 1 && /--ignore-gate is only for TEST renders/.test(`${ig.stdout}${ig.stderr}`), '--ignore-gate without --size (a master) is refused');
  let g = gate('approve', 'A-02', 'B-01', 'C-01,C-02', '--scene', 'END', '--by', 'selftest');
  check(g.code === 1 && /approved 4 shot\(s\)/.test(g.out) && /B-01 \(waiting for/.test(g.out), 'approve: A-02, C-01, C-02, E-01 approved; B-01 refused (no scene file yet)');
  if (failures) { say(r.out); say(g.out); return 1; }

  say('\nrun 1: scene B has no scene file yet');
  r = await runEpisode();
  check(r.code === 0, `exit code 0 (got ${r.code})`);
  check(/B-01\s+SKIPPED - waiting for .*set-b\.js/.test(r.out), 'B-01 skipped with a clear message');
  check(['A', 'C', 'END'].every((k) => fs.existsSync(sceneMp4(k))), 'scene files A, C and END were made');
  check(!fs.existsSync(sceneMp4('B')) && !fs.existsSync(episode), 'no scene B and no episode yet');
  const a = probe(sceneMp4('A'), ['-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt:format=duration']);
  check(a?.streams?.some((s) => s.codec_type === 'audio') && a.streams.some((s) => s.pix_fmt === 'yuv420p10le' && s.width === 320), 'scene A: 10-bit video at 320x180 + sound');
  const doneA = JSON.parse(fs.readFileSync(path.join(OUT, 'shots', 'A', 'A-02', 'DONE.json'), 'utf8'));
  check(/^[0-9a-f]{16}$/.test(doneA.lockId || '') && doneA.approvedBy === 'selftest', 'A-02 remembers the approval it was rendered under');
  if (failures) { say(r.out); return 1; }

  say('\nrun 2: the set-B scene file arrives (like git pull), not approved yet; then approved, and the run is hard-killed in the middle of B-01');
  fs.writeFileSync(setB, sceneSource('#4060e0', 'set B'));
  fs.writeFileSync(setB.replace(/\.js$/, '.shots.json'), JSON.stringify({ shots: [{ job: 'B-01', start_s: 10, frames: 72 }] }));
  r = await runEpisode();
  check(r.code === 0 && /B-01\s+SKIPPED - not approved/.test(r.out) && !/frames, set /.test(r.out), 'B-01 SKIPPED: its scene file is there but not approved');
  g = gate('approve', 'B-01', '--by', 'selftest', '--note', 'set B reviewed');
  check(g.code === 0 && /approved 1 shot/.test(g.out), 'B-01 approved');
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
  check(/total: 216\/216 frames \(100\.0%\)/.test(r.out) && /render gate: 5 shot\(s\) approved/.test(r.out), 'status shows 216/216 frames and 5 approved shots');

  say('\nrun 6: the credits text changes: nothing happens until it is approved again; then only the card is made again');
  fs.appendFileSync(path.join(FIX, 'plan', 'credits.txt'), 'Leaf textures: a new line\n');
  r = await runEpisode();
  check(r.code === 0 && /episode: up to date/.test(r.out) && !/E-01: approved again/.test(r.out), 'unapproved credits edit: the approved card is kept, the episode is up to date');
  g = gate('check');
  check(g.code === 1 && /E-01 .*the credits text/.test(g.out), 'gate check reports E-01 changed after its approval');
  gate('approve', 'E-01', '--by', 'selftest');
  r = await runEpisode();
  check(r.code === 0 && /E-01: approved again \(with new files\) since it was rendered -> rendering it again/.test(r.out), 'approved again: the credits card was made again');
  check(!/frames, set /.test(r.out), 'no 3D shot rendered again');
  check(/END: joining/.test(r.out) && !/\bA: joining|\bC: joining/.test(r.out), 'only the END scene file was rejoined');
  const v6 = probe(episode, ['-count_packets', '-show_entries', 'stream=codec_type,nb_read_packets']);
  check(/episode: built/.test(r.out) && +v6?.streams?.find((x) => x.codec_type === 'video')?.nb_read_packets === 216, 'the episode was assembled again with all 216 frames');

  say('\nrun 7: work in progress changes set C after its approval; then C-02 is approved again with the new file');
  const setC = path.join(FIX, 'plan', 'scenes', 'set-c.js');
  const mp4C2 = path.join(OUT, 'shots', 'C', 'C-02', 'C-02.mp4');
  const statC2 = fs.statSync(mp4C2).mtimeMs;
  fs.writeFileSync(setC, sceneSource('#e0e040', 'set C, work in progress'));
  r = await runEpisode();
  check(r.code === 0 && !/frames, set /.test(r.out) && /episode: up to date/.test(r.out) && fs.statSync(mp4C2).mtimeMs === statC2, 'WIP edit: nothing rendered, the approved C-02 render is kept, the episode is up to date');
  r = await runEpisode(['--dry-run']);
  check(!/C-02\s+would render/.test(r.out), 'the dry run would render nothing for C-02 either');
  g = gate('approve', 'C-02', '--by', 'selftest', '--note', 'new yellow box reviewed');
  check(g.code === 0 && /approved 1 shot/.test(g.out), 'C-02 approved again with the new file');
  r = await runEpisode();
  check(r.code === 0 && /C-02: approved again \(with new files\)/.test(r.out) && /C-02\s+24 frames, set SET_C/.test(r.out), 'C-02 was rendered again');
  check(!/C-01\s+24 frames/.test(r.out) && !/A-02\s+24 frames/.test(r.out), 'no other shot was rendered again');
  check(/\bC: joining/.test(r.out) && !/\bA: joining|\bB: joining|END: joining/.test(r.out), 'only scene C was re-joined');
  const v7 = probe(episode, ['-count_packets', '-show_entries', 'stream=codec_type,nb_read_packets']);
  check(/episode: built/.test(r.out) && +v7?.streams?.find((x) => x.codec_type === 'video')?.nb_read_packets === 216, 'the episode was assembled again with all 216 frames');

  say('\nrun 8: the approval of C-01 is withdrawn, then given again for the same files');
  gate('revoke', 'C-01');
  const ep8 = fs.statSync(episode).mtimeMs;
  r = await runEpisode();
  check(/C-01\s+NOT USED - rendered under an approval that was withdrawn/.test(r.out), 'C-01: its render is not used any more');
  check(!/\bC: joining/.test(r.out) && /episode: not assembled yet/.test(r.out) && fs.statSync(episode).mtimeMs === ep8, 'scene C is not joined and the episode is not assembled again');
  r = await runEpisode(['--status']);
  check(/OUT OF DATE \(not used\)/.test(r.out), 'status marks the scene C file as out of date');
  gate('approve', 'C-01', '--by', 'selftest');
  r = await runEpisode();
  check(r.code === 0 && !/frames, set /.test(r.out) && /episode: up to date/.test(r.out), 'approved again (same files): nothing rendered, everything up to date');

  say(`\n${failures ? `${failures} check(s) FAILED` : 'all checks passed'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (failures) say(`(fixture and output kept in ${path.relative(ROOT, FIX)})`);
  else if (!KEEP) fs.rmSync(FIX, { recursive: true, force: true });
  return failures ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
