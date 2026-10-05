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
export const RGBA_TO_YUV_FILTER = 'scale=out_color_matrix=bt709:out_range=tv:flags=area+accurate_rnd,format=yuv420p';

/** Arguments for encoding raw frames from stdin into an H.264 mp4. */
export function encoderArgs({ width, height, fps, input = 'yuv', crf = 16, preset = 'medium', out, threads }) {
  const r = fpsRational(fps);
  const gop = Math.max(1, Math.round(fps * 2));
  const a = ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', input === 'rgba' ? 'rgba' : 'yuv420p', '-s', `${width}x${height}`, '-framerate', r];
  if (input !== 'rgba') a.push('-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709');
  a.push('-i', 'pipe:0');
  if (input === 'rgba') a.push('-vf', RGBA_TO_YUV_FILTER);
  a.push('-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p',
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

/**
 * Losslessly concatenate mp4 chunks (concat demuxer, stream copy) and
 * optionally mux an audio track (AAC). Audio is padded/cut to the video length.
 */
export async function concatChunks({ files, out, audio, audioOffset = 0, duration, listDir }) {
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
  try { await ff.end(); } finally { fs.rmSync(list, { force: true }); }
  fs.renameSync(tmp, out);
  return out;
}

/** Write one RGBA frame as PNG. */
export async function writePng(buf, { width, height, out }) {
  const ff = spawnFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', `${width}x${height}`, '-i', 'pipe:0', '-frames:v', '1', '-pix_fmt', 'rgb24', out], { label: 'png' });
  await ff.write(buf);
  await ff.end();
}
