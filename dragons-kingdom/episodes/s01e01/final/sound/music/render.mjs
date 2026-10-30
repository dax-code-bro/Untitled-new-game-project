#!/usr/bin/env node
// Renders the score cues (music/scores.mjs) to MIDI and to 48 kHz stereo float WAV with FluidSynth and a free GM
// soundfont (default: Fluid R3 GM, MIT licence). Deterministic: one CPU core, no dither (float output), fixed
// reverb settings; the cache key is the MIDI bytes + FluidSynth version + soundfont size + render options.
//
//   node episodes/s01e01/final/sound/music/render.mjs [--out DIR] [--soundfont F] [cue ...]
//
// Used by sound/mix.mjs (renderCue). Needs `fluidsynth` on PATH (Linux: apt install fluidsynth fluid-soundfont-gm;
// Windows: the fluidsynth release zip) or FLUIDSYNTH=path; soundfont from --soundfont, DK_SOUNDFONT, or the
// Debian/Ubuntu path /usr/share/sounds/sf2/FluidR3_GM.sf2.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scoreToMidi, scoreBeats } from './midi.mjs';
import { SCORES } from './scores.mjs';
import { ffmpegPath } from '../../../../../render/lib/tools.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SR = 48000;
const SF_CANDIDATES = [process.env.DK_SOUNDFONT, '/usr/share/sounds/sf2/FluidR3_GM.sf2', '/usr/share/soundfonts/FluidR3_GM.sf2'].filter(Boolean);
const FLUID = process.env.FLUIDSYNTH || 'fluidsynth';
// reverb: a medium hall, the same for every cue (fluidsynth 2.x option names)
const FS_OPTS = ['-o', 'synth.cpu-cores=1', '-o', 'synth.reverb.room-size=0.72', '-o', 'synth.reverb.damp=0.35',
  '-o', 'synth.reverb.width=0.9', '-o', 'synth.reverb.level=0.7', '-o', 'synth.chorus.active=0', '-g', '0.5'];

export function soundfontPath(explicit) {
  const f = [explicit, ...SF_CANDIDATES].filter(Boolean).find((p) => fs.existsSync(p));
  if (!f) throw new Error(`no soundfont found (tried ${[explicit, ...SF_CANDIDATES].filter(Boolean).join(', ')}); set DK_SOUNDFONT`);
  return f;
}
export function fluidVersion() {
  const r = spawnSync(FLUID, ['--version'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`fluidsynth not runnable (${FLUID}); install it or set FLUIDSYNTH`);
  return (r.stdout.match(/FluidSynth runtime version ([\d.]+)/) || [null, r.stdout.split('\n')[0]])[1];
}

// -> { id, mid, wav, beats, seconds, tempo_bpm, key, cached }
export function renderCue(id, outDir, { soundfont } = {}) {
  const score = SCORES[id];
  if (!score) throw new Error(`no score "${id}" in music/scores.mjs (have ${Object.keys(SCORES).join(', ')})`);
  fs.mkdirSync(outDir, { recursive: true });
  const midi = scoreToMidi(score);
  const sf = soundfontPath(soundfont);
  const key = crypto.createHash('sha1').update(midi).update(fluidVersion()).update(String(fs.statSync(sf).size)).update(FS_OPTS.join(' ')).digest('hex').slice(0, 16);
  const mid = path.join(outDir, `${id}.mid`), wav = path.join(outDir, `${id}.wav`), meta = path.join(outDir, `${id}.json`);
  const beats = scoreBeats(score), seconds = beats * 60 / score.tempo_bpm;
  const prev = fs.existsSync(meta) ? JSON.parse(fs.readFileSync(meta, 'utf8')) : null;
  if (prev?.key === key && fs.existsSync(wav)) return { ...prev, mid, wav, cached: true };
  fs.writeFileSync(mid, midi);
  const raw = path.join(outDir, `${id}.fluid.wav`);
  const r = spawnSync(FLUID, ['-n', '-i', '-q', ...FS_OPTS, '-r', String(SR), '-T', 'wav', '-O', 'float', '-F', raw, sf, mid], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(raw)) throw new Error(`fluidsynth failed for ${id}:\n${r.stderr || r.stdout}`);
  // libsndfile writes a PEAK chunk with a timestamp: re-write the samples bit for bit with a fixed header
  const c = spawnSync(ffmpegPath(), ['-hide_banner', '-nostdin', '-y', '-i', raw, '-map_metadata', '-1', '-c:a', 'pcm_f32le', '-fflags', '+bitexact', '-flags:a', '+bitexact', wav], { encoding: 'utf8' });
  fs.rmSync(raw, { force: true });
  if (c.status !== 0) throw new Error(`ffmpeg re-write failed for ${id}:\n${(c.stderr || '').slice(-2000)}`);
  const info = { id, key, beats, seconds, tempo_bpm: score.tempo_bpm, soundfont: path.basename(sf), fluidsynth: fluidVersion(),
    sha256: crypto.createHash('sha256').update(fs.readFileSync(wav)).digest('hex') };
  fs.writeFileSync(meta, JSON.stringify(info, null, 1));
  return { ...info, mid, wav, cached: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : d; };
  const out = path.resolve(opt('--out', path.join(HERE, '..', '..', 'audio', '.work', 'music')));
  const sf = opt('--soundfont', undefined);
  const ids = argv.length ? argv : Object.keys(SCORES);
  for (const id of ids) {
    const c = renderCue(id, out, { soundfont: sf });
    console.log(`${id}: ${c.seconds.toFixed(2)} s, ${c.cached ? 'cached' : 'rendered'} -> ${c.wav} (sha256 ${c.sha256.slice(0, 16)})`);
  }
}
