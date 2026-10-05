// ffmpeg / ffprobe helpers: chunk encoders, validation, lossless concat.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ffmpegPath, ffprobePath } from './tools.mjs';

const KNOWN_NTSC = { 23.976: '24000/1001', 29.97: '30000/1001', 59.94: '60000/1001', 47.952: '48000/1001', 119.88: '120000/1001' };
export function fpsRational(fps) {
  if (KNOWN_NTSC[fps]) return KNOWN_NTSC[fps];
  if (Number.isInteger(fps)) return `${fps}/1`;
  return `${Math.round(fps * 1000)}/1000`;
}

export const COLOR_TAGS = [
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
];

// ffmpeg's own RGB -> yuv420p conversion (BT.709, limited range). "area" makes
// chroma a plain 2x2 average, i.e. the same filter as the in-shader packer.
export const rgbaToYuvFilter = (bitDepth = 8) =>
  `scale=out_color_matrix=bt709:out_range=tv:flags=area+accurate_rnd,format=${bitDepth === 10 ? 'yuv420p10le' : 'yuv420p'}`;
export const RGBA_TO_YUV_FILTER = rgbaToYuvFilter(8);

/** Raw frame formats the page can deliver (see runtime captureSize). */
export const CAPTURE_PIX_FMT = { yuv: 'yuv420p', yuv10: 'yuv420p10le', rgba: 'rgba' };

/**
 * Highest useful CRF. x264's 10-bit CRF scale runs from -12 to 51 (values above
 * 51 are clipped), the 8-bit one from 0 to 51 - so 51 for both. CRF values
 * mean about the same visual quality at both bit depths.
 */
export const maxCrf = () => 51;

/**
 * Arguments for encoding raw frames from stdin into an H.264 mp4.
 * input: 'yuv' (8-bit yuv420p) | 'yuv10' (yuv420p10le) | 'rgba' (ffmpeg converts)
 * bitDepth: 8 -> High profile, yuv420p; 10 -> High 10 profile, yuv420p10le.
 * crf 0 = lossless: encoded as "-qp 0" (at 10 bits "-crf 0" would be QP 12,
 * NOT lossless); x264 then needs the High 4:4:4 Predictive profile, so no
 * profile is forced (such files play in ffmpeg/VLC/editors, rarely elsewhere).
 */
export function encoderArgs({ width, height, fps, input = 'yuv', bitDepth = 8, crf = 16, preset = 'medium', out, threads }) {
  const r = fpsRational(fps);
  const gop = Math.max(1, Math.round(fps * 2));
  const inFmt = CAPTURE_PIX_FMT[input];
  if (!inFmt) throw new Error(`unknown capture "${input}"`);
  if (input === 'yuv10' && bitDepth !== 10) throw new Error('10-bit capture needs bitDepth 10');
  const a = ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', inFmt, '-s', `${width}x${height}`, '-framerate', r];
  if (input !== 'rgba') a.push('-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709');
  a.push('-i', 'pipe:0');
  if (input === 'rgba') a.push('-vf', rgbaToYuvFilter(bitDepth));
  const lossless = crf === 0;
  const rate = lossless ? ['-qp', '0'] : ['-crf', String(crf)];
  const profile = lossless ? [] : ['-profile:v', bitDepth === 10 ? 'high10' : 'high'];
  a.push('-c:v', 'libx264', '-preset', preset, ...rate, ...profile, '-pix_fmt', bitDepth === 10 ? 'yuv420p10le' : 'yuv420p',
    '-g', String(gop), '-keyint_min', String(Math.max(1, Math.round(fps / 2))),
    '-x264-params', 'open-gop=0',          // closed GOPs: every chunk is independently decodable
    ...COLOR_TAGS, '-chroma_sample_location', 'center');
  if (threads) a.push('-threads', String(threads));
  a.push('-r', r, '-f', 'mp4', out);
  return a;
}

/**
 * Spawn an ffmpeg that reads raw frames on stdin. write() honours stdin
 * backpressure (resolves on 'drain'); end() resolves when ffmpeg exits.
 */
export function spawnFfmpeg(args, { label = 'ffmpeg' } = {}) {
  const proc = spawn(ffmpegPath(), args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  let exited = null;
  let procError = null;
  proc.stderr.on('data', (d) => { stderr = (stderr + d).slice(-8000); });
  proc.stdin.on('error', (e) => { procError = procError || e; });
  proc.on('error', (e) => { procError = procError || e; });
  const exitP = new Promise((resolve) => proc.on('close', (code, signal) => { exited = { code, signal }; resolve(exited); }));
  const describe = () => `${label} failed (${exited ? `exit ${exited.code ?? exited.signal}` : procError?.message}): ${stderr.trim().split('\n').slice(-4).join(' | ')}`;
  return {
    proc,
    write(buf) {
      if (procError || exited) return Promise.reject(new Error(describe()));
      return new Promise((resolve, reject) => {
        const ok = proc.stdin.write(buf, (err) => { if (err) reject(new Error(describe())); });
        if (ok) resolve();
        else {
          const onDrain = () => { cleanup(); resolve(); };
          const onClose = () => { cleanup(); reject(new Error(describe())); };
          const cleanup = () => { proc.stdin.off('drain', onDrain); proc.off('close', onClose); };
          proc.stdin.once('drain', onDrain);
          proc.once('close', onClose);
        }
      });
    },
    async end() {
      if (!proc.stdin.destroyed) proc.stdin.end();
      const r = await exitP;
      if (r.code !== 0) throw new Error(describe());
      return r;
    },
    kill() { try { proc.stdin.destroy(); } catch {} try { proc.kill('SIGKILL'); } catch {} return exitP; },
    get stderr() { return stderr; },
  };
}

export function ffprobeJson(file, extra = []) {
  const r = spawnSync(ffprobePath(), ['-v', 'error', '-of', 'json', ...extra, file], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`ffprobe ${file}: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout);
}

/**
 * Decode the whole file and check it: every packet decodes, no decoder
 * errors, the expected frame count and size. Much stronger than counting
 * packets (a chunk with damaged data still has the right packet count).
 * Returns { ok, frames, packets, reason }.
 */
export function verifyVideo(file, { frames, width, height } = {}) {
  const r = spawnSync(ffprobePath(), ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-count_packets',
    '-show_entries', 'stream=width,height,nb_read_frames,nb_read_packets', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 64 << 20 });
  let s = null;
  try { s = JSON.parse(r.stdout).streams?.[0]; } catch {}
  if (r.status !== 0 || !s) return { ok: false, reason: `unreadable (${(r.stderr || '').trim().split('\n')[0] || `exit ${r.status}`})` };
  const res = { frames: +s.nb_read_frames, packets: +s.nb_read_packets, width: s.width, height: s.height };
  const errs = (r.stderr || '').trim();
  if (errs) return { ...res, ok: false, reason: `decoder errors: ${errs.split('\n')[0]}` };
  if (frames !== undefined && (res.frames !== frames || res.packets !== frames)) return { ...res, ok: false, reason: `${res.frames} decodable frames / ${res.packets} packets, expected ${frames}` };
  if (width !== undefined && (res.width !== width || res.height !== height)) return { ...res, ok: false, reason: `size ${res.width}x${res.height}, expected ${width}x${height}` };
  return { ...res, ok: true };
}

/** Does this file have an audio stream ffmpeg can read? Returns null if fine, else the problem. */
export function audioProblem(file) {
  if (!fs.existsSync(file)) return 'file not found';
  try {
    const j = ffprobeJson(file, ['-select_streams', 'a', '-show_entries', 'stream=codec_name,duration']);
    if (!j.streams?.length) return 'it has no audio track';
    return null;
  } catch (e) { return `ffmpeg cannot read it (${e.message.split('\n')[0]})`; }
}

/** Video stream info incl. exact packet (= frame) count. Returns null if unreadable. */
export function probeVideo(file) {
  try {
    const j = ffprobeJson(file, ['-select_streams', 'v:0', '-count_packets', '-show_entries',
      'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_read_packets,nb_frames,color_range,color_space,color_transfer,color_primaries,chroma_location,duration:format=duration,size']);
    const s = j.streams?.[0];
    if (!s) return null;
    return { ...s, frames: +s.nb_read_packets, format: j.format };
  } catch { return null; }
}

export class FrameCountError extends Error {}

/**
 * Losslessly concatenate mp4 chunks (concat demuxer, stream copy) and
 * optionally mux an audio track (AAC). Audio is padded/cut to the video length.
 * The result is written to <out>.part.mp4, checked (packet count = expectFrames)
 * and only then renamed to out - a broken stitch never looks like an episode.
 */
export async function concatChunks({ files, out, audio, audioOffset = 0, duration, listDir, expectFrames }) {
  const list = path.join(listDir, `.concat-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(list, files.map((f) => `file '${path.resolve(f).replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const tmp = out + '.part.mp4';
  const a = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list];
  if (audio) {
    a.push('-ss', String(audioOffset), '-i', audio, '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-af', 'apad', '-t', duration.toFixed(6));
  } else {
    a.push('-map', '0:v:0', '-c', 'copy');
  }
  a.push('-movflags', '+faststart', '-f', 'mp4', tmp);
  const ff = spawnFfmpeg(a, { label: 'concat' });
  ff.proc.stdin.end();
  try { await ff.end(); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; } finally { fs.rmSync(list, { force: true }); }
  if (expectFrames !== undefined) {
    const v = probeVideo(tmp);
    if (!v || v.frames !== expectFrames) {
      fs.rmSync(tmp, { force: true });
      throw new FrameCountError(`${path.basename(out)} would have ${v?.frames} frames, expected ${expectFrames}`);
    }
  }
  fs.rmSync(out, { force: true });
  fs.renameSync(tmp, out);
  return out;
}

/** Make sure a finished file's bytes are on disk before it is renamed into place. */
export function fsyncFile(file) {
  try { const fd = fs.openSync(file, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } } catch {}
}
export function fsyncDir(dir) {
  try { const fd = fs.openSync(dir, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } } catch {}
}

/** Write one RGBA frame as PNG (creates the folder if needed). */
export async function writePng(buf, { width, height, out }) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const ff = spawnFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', `${width}x${height}`, '-i', 'pipe:0', '-frames:v', '1', '-pix_fmt', 'rgb24', out], { label: 'png' });
  await ff.write(buf);
  await ff.end();
}
