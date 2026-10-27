#!/usr/bin/env node
// Episode 1 - assemble the DRAFT CUT from the edit list: the rendered shots (one video file per shot,
// scenes/lib/director/tools/render-shots.mjs), black cards, slates for shots that are not rendered
// yet, the transitions and on-screen captions of the edit list, and the voice takes laid in at their
// cue times (a simple dialogue mix: no music, no effects). Also writes the subtitles of the cut.
//
//   node episodes/s01e01/final/cut/make-cut.mjs                    # uses output/director/draft/shots
//   node episodes/s01e01/final/cut/make-cut.mjs --shots DIR --out FILE.mp4 [--clean] [--no-audio]
//   node episodes/s01e01/final/cut/make-cut.mjs --edl edl-1B --shots DIR        another part's cut
//
// Reads  cut/edl.json or cut/<--edl>.json (scenes/lib/director/tools/build-shots.mjs), vo/takes.json, vo/<line>.wav
// Writes cut/DragonsKingdom_S01E01_draft-cut_<scenes>.mp4 (+ .en.srt)   - git-ignored
//        cut/cut-report.json   what went into the file (rendered / slate per shot, handles used,
//                              the mix cues, durations) - small, committed
// Burn-ins (unless --clean): "DRAFT CUT" + shot id top left, record timecode bottom right; a draft cut
// is never a master (SERIES.md section 2).
//
// Transitions (edl.json shots[].trans): ['cut'] | ['dissolve', N] (a cross-dissolve of N frames centred
// on the cut: the outgoing shot runs on N/2 frames, the incoming one starts N/2 early; uses the shots'
// rendered handle frames, else holds the edge frame) | ['fadein', N] (from black at the shot's start);
// shots[].transOut: ['fadeout', N] (to black at its end). The cut keeps exactly the edit list's length.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffmpegPath, ffprobePath } from '../../../../render/lib/tools.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const FINAL = path.resolve(HERE, '..');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const argv = process.argv.slice(2);
const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes(n);
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// --edl edl-1B: another part's cut (build-shots.mjs writes one edit list per part with authored shots)
const EDL = opt('--edl', 'edl').replace(/\.json$/, '');
const edl = readJson(path.join(HERE, `${EDL}.json`));
if (!edl) throw new Error(`cut/${EDL}.json missing: run node scenes/lib/director/tools/build-shots.mjs`);
const FPS = edl.fps, W = +(opt('--width', 960)), H = Math.round(W * 9 / 16 / 2) * 2;
const SHOTS = path.resolve(opt('--shots', path.join(ROOT, 'output/director/draft/shots')));
const tag = [...new Set(edl.shots.map((s) => s.scene))].join('-');
const OUT = path.resolve(opt('--out', path.join(HERE, `DragonsKingdom_S01E01_draft-cut_${tag}.mp4`)));
const CLEAN = flag('--clean'), NOAUDIO = flag('--no-audio');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-cut-'));
const takes = new Map((readJson(path.join(FINAL, 'vo/takes.json'))?.takes || []).map((t) => [t.id, t]));

const font = (bold, serif) => {
  const c = serif ? (bold ? ['/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf', 'C:/Windows/Fonts/timesbd.ttf'] : ['/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', 'C:/Windows/Fonts/times.ttf'])
    : (bold ? ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'] : ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'C:/Windows/Fonts/arial.ttf']);
  const f = c.find((x) => fs.existsSync(x));
  return f ? `fontfile='${f.replace(/\\/g, '/').replace(/:/g, '\\:')}':` : '';
};
// drawtext text: escape for the filter-graph level and the option level
const esc = (s) => String(s).replace(/\\/g, '\\\\\\\\').replace(/'/g, "\u2019").replace(/:/g, '\\:').replace(/%/g, ' percent').replace(/,/g, '\\,');
const probeFrames = (f) => {
  const r = spawnSync(ffprobePath(), ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets,width,height', '-of', 'json', f], { encoding: 'utf8' });
  try { const s = JSON.parse(r.stdout).streams[0]; return { frames: +s.nb_read_packets, width: s.width, height: s.height }; } catch { return null; }
};
const wrap = (s, n) => { const out = []; let line = ''; for (const w of String(s).split(/\s+/)) { if ((line + ' ' + w).trim().length > n) { out.push(line.trim()); line = w; } else line += ' ' + w; } if (line.trim()) out.push(line.trim()); return out; };

// review flags of a shot: one per kind (a per-frame measure, e.g. the speaking-face audit of a render made
// before it was keyed per role, wrote one note per frame that differed only in its numbers)
const collapseNotes = (notes) => { const seen = new Set(); return notes.filter((n) => { const k = String(n).replace(/[\d.]+/g, '#'); if (seen.has(k)) return false; seen.add(k); return true; }); };

// ------------------------------------------------------------- segments ---
const inputs = [];          // ffmpeg input args
const vf = [];              // filter graph lines
const report = { title: edl.title, made_at: new Date().toISOString().slice(0, 16), shots_dir: rel(SHOTS), size: `${W}x${H}`, fps: FPS, shots: [], audio: [] };
const segs = edl.shots.map((e, i) => ({ e, i, tIn: e.trans || ['cut'], tOut: e.transOut || null }));
// handle frames each side needs (dissolves are centred on the cut)
for (let k = 0; k < segs.length; k++) {
  const s = segs[k]; s.needPre = 0; s.needPost = 0;
}
for (let k = 1; k < segs.length; k++) {
  const [tt, n] = segs[k].tIn;
  if (tt === 'dissolve') { segs[k].needPre = Math.ceil(n / 2); segs[k - 1].needPost = Math.floor(n / 2); }
}
for (const s of segs) {
  const e = s.e;
  const label = `v${s.i}`;
  const file = path.join(SHOTS, `${e.job}.mp4`), side = readJson(path.join(SHOTS, `${e.job}.json`));
  let src = 'slate', pre = 0, post = 0;
  if (e.kind === 'black') {
    inputs.push('-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}:d=${(e.frames + s.needPre + s.needPost) / FPS + 1}`);
    src = 'black'; pre = s.needPre; post = s.needPost;
    vf.push(`[${inputs.filter((x) => x === '-i').length - 1}:v]trim=end_frame=${e.frames + pre + post},setpts=PTS-STARTPTS,format=yuv420p[${label}r]`);
  } else if (e.kind === '3d' && fs.existsSync(file)) {
    const pr = probeFrames(file);
    const hp = side?.pre ?? 0, hq = side?.post ?? 0;
    if (!pr || pr.frames !== e.frames + hp + hq) throw new Error(`${e.job}: ${rel(file)} has ${pr?.frames} frames, the edit list wants ${e.frames} (+ ${hp}/${hq} handles)`);
    pre = Math.min(hp, s.needPre); post = Math.min(hq, s.needPost);
    inputs.push('-i', file);
    src = side ? `rendered ${side.at?.slice(0, 16) || ''}` : 'rendered';
    const n = inputs.filter((x) => x === '-i').length - 1;
    vf.push(`[${n}:v]trim=start_frame=${hp - pre}:end_frame=${hp + e.frames + post},setpts=PTS-STARTPTS,scale=${W}:${H},fps=${FPS},format=yuv420p[${label}r]`);
  } else {
    // a slate: what the shot will be
    inputs.push('-f', 'lavfi', '-i', `color=c=0x18191b:s=${W}x${H}:r=${FPS}:d=${e.frames / FPS + 1}`);
    const n = inputs.filter((x) => x === '-i').length - 1;
    const lines = [`${e.job}  (${e.set})  -  NOT RENDERED YET`, ...wrap(e.action || '', 70).slice(0, 5)];
    const dt = lines.map((l, j) => `drawtext=${font(j === 0, false)}text='${esc(l)}':x=60:y=${170 + j * 34}:fontsize=${j === 0 ? 26 : 21}:fontcolor=${j === 0 ? 'yellow' : 'white@0.85'}`).join(',');
    vf.push(`[${n}:v]trim=end_frame=${e.frames},setpts=PTS-STARTPTS,format=yuv420p,${dt}[${label}r]`);
  }
  // captions (titles, place names) and burn-ins, in this segment's own time (handles shifted)
  const off = pre / FPS;
  const dts = [];
  for (const c of e.captions || []) {
    const a = c.from_s + off, b = c.to_s + off, fd = c.style === 'title' ? 0.8 : 0.35;
    const alpha = `if(lt(t\\,${a.toFixed(3)})\\,0\\,if(lt(t\\,${(a + fd).toFixed(3)})\\,(t-${a.toFixed(3)})/${fd}\\,if(lt(t\\,${(b - fd).toFixed(3)})\\,1\\,if(lt(t\\,${b.toFixed(3)})\\,(${b.toFixed(3)}-t)/${fd}\\,0))))`;
    if (c.style === 'title') dts.push(`drawtext=${font(true, true)}text='${esc(c.text)}':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=${Math.round(H * 0.085)}:fontcolor=0xf2ece0:alpha='${alpha}'`);
    else dts.push(`drawtext=${font(false, true)}text='${esc(c.text.toUpperCase())}':x=(w-text_w)/2:y=h*0.80:fontsize=${Math.round(H * 0.05)}:fontcolor=0xf4f1ea:shadowcolor=black@0.5:shadowx=1:shadowy=1:alpha='${alpha}'`);
  }
  if (!CLEAN) dts.push(`drawtext=${font(true, false)}text='DRAFT CUT  ${esc(e.job)}${src === 'slate' ? '' : ''}':x=10:y=8:fontsize=13:fontcolor=white@0.7:box=1:boxcolor=black@0.35:boxborderw=3`);
  let chain = dts.length ? `[${label}r]${dts.join(',')}[${label}c]` : `[${label}r]null[${label}c]`;
  // pad with held edge frames where a dissolve needs more than the rendered handles
  const padPre = s.needPre - pre, padPost = s.needPost - post;
  let last = `${label}c`;
  if (padPre > 0 || padPost > 0) { vf.push(chain); chain = `[${last}]tpad=start=${padPre}:start_mode=clone:stop=${padPost}:stop_mode=clone[${label}p]`; last = `${label}p`; }
  if (s.tIn[0] === 'fadein') { vf.push(chain); chain = `[${last}]fade=t=in:st=0:d=${(s.tIn[1] / FPS).toFixed(3)}[${label}f]`; last = `${label}f`; }
  if (s.tOut?.[0] === 'fadeout') { vf.push(chain); const L = (e.frames + s.needPre + s.needPost) / FPS; chain = `[${last}]fade=t=out:st=${(L - s.tOut[1] / FPS - s.needPost / FPS).toFixed(3)}:d=${(s.tOut[1] / FPS).toFixed(3)}[${label}g]`; last = `${label}g`; }
  // one time base and pixel aspect for every segment: xfade refuses inputs whose time bases differ
  // (a rendered mp4 after trim, a lavfi slate, a concat of both)
  vf.push(chain); chain = `[${last}]settb=1/${FPS},setsar=1[${label}z]`; last = `${label}z`;
  vf.push(chain);
  s.out = last; s.len = e.frames + s.needPre + s.needPost;
  report.shots.push({ job: e.job, scene: e.scene, kind: e.kind, source: src, frames: e.frames, rec_in: e.rec_in, trans: s.tIn, handles_used: [pre, post], held_frames: [Math.max(0, padPre), Math.max(0, padPost)], ...(src.startsWith('rendered') && side?.notes?.length ? { notes: collapseNotes(side.notes), ...(e.review_ok ? { accepted: e.review_ok } : {}) } : {}) });
}
// join: runs of cuts are concatenated, dissolves cross-fade (offset = the accumulated length - the overlap)
let acc = segs[0].out, accLen = segs[0].len - segs[0].needPre;
if (segs[0].needPre) { vf.push(`[${acc}]trim=start_frame=${segs[0].needPre},setpts=PTS-STARTPTS,settb=1/${FPS}[j0]`); acc = 'j0'; }
for (let k = 1; k < segs.length; k++) {
  const s = segs[k];
  const [tt, n] = s.tIn;
  if (tt === 'dissolve') {
    vf.push(`[${acc}][${s.out}]xfade=transition=fade:duration=${(n / FPS).toFixed(4)}:offset=${((accLen - n) / FPS).toFixed(4)},settb=1/${FPS}[j${k}]`);
    accLen = accLen - n + s.len;
  } else {
    vf.push(`[${acc}][${s.out}]concat=n=2:v=1:a=0,settb=1/${FPS}[j${k}]`);
    accLen += s.len;
  }
  acc = `j${k}`;
  // the post handle of this segment is consumed by the next dissolve; at the very end trim it
}
const total = edl.frames;
const tcBurn = CLEAN ? '' : `,drawtext=${font(false, false)}timecode='00\\:00\\:00\\:00':rate=${FPS}:x=w-tw-10:y=h-th-8:fontsize=13:fontcolor=white@0.7:box=1:boxcolor=black@0.35:boxborderw=3`;
vf.push(`[${acc}]trim=end_frame=${total},setpts=PTS-STARTPTS${tcBurn}[vout]`);

// ------------------------------------------------------------------ mix ---
const cues = edl.shots.flatMap((e) => (e.dialogue || []).map((d) => ({ ...d, shot: e.job, recIn: e.rec_in / FPS })));
const srt = [];
let audioLabel = null;
if (!NOAUDIO && cues.length) {
  const nV = inputs.filter((x) => x === '-i').length;
  const af = [];
  cues.forEach((c, j) => {
    const f = path.join(FINAL, c.file);
    if (!fs.existsSync(f)) throw new Error(`${c.ref}: voice take ${rel(f)} missing (episodes/s01e01/final/tools/make_final_vo.py)`);
    inputs.push('-i', f);
    let fi = c.file_in_s, at = c.rec_s;
    if (at < 0) { fi -= at; at = 0; }
    // a line that is not marked `continues` stops at its shot's cut (+ a short 60 ms tail)
    const fo = c.continues ? c.file_out_s : Math.min(c.file_out_s, fi + (c.recIn + (edl.shots.find((e) => e.job === c.shot).frames / FPS) - at) + 0.06);
    af.push(`[${nV + j}:a]atrim=start=${fi.toFixed(4)}:end=${fo.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=0.005,areverse,afade=t=in:d=0.02,areverse,volume=${c.gain_db ?? 0}dB,adelay=${Math.round(at * 1000)}:all=1[a${j}]`);
    report.audio.push({ ref: c.ref, role: c.role, shot: c.shot, file: c.file, file_in_s: +fi.toFixed(3), file_out_s: +fo.toFixed(3), rec_s: +at.toFixed(3), gain_db: c.gain_db ?? 0 });
    // subtitles: one per sentence of the take (the part that plays)
    const tk = takes.get(c.id);
    for (const sg of tk?.segments || []) {
      if (sg.end_s <= fi || sg.start_s >= fo) continue;
      srt.push({ a: at + (Math.max(sg.start_s, fi) - fi), b: at + (Math.min(sg.end_s, fo) - fi), text: (tk.role === 'NARRATOR' ? '' : '') + sg.text });
    }
  });
  // a silent bed the full length of the cut: amix runs as long as its longest input, so the sound track
  // always covers the picture (apad after a many-input amix did not pad: the track ended with the last line)
  inputs.push('-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${(total / FPS + 1).toFixed(3)}`);
  const nBed = nV + cues.length;
  af.push(`${cues.map((_, j) => `[a${j}]`).join('')}[${nBed}:a]amix=inputs=${cues.length + 1}:normalize=0:dropout_transition=0:duration=longest,aresample=async=1:first_pts=0,atrim=end=${(total / FPS).toFixed(4)},aformat=sample_rates=48000:channel_layouts=stereo[aout]`);
  vf.push(...af);
  audioLabel = 'aout';
}

const graph = path.join(WORK, 'graph.txt');
fs.writeFileSync(graph, vf.join(';\n'));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const tmpOut = OUT.replace(/\.mp4$/, '.part.mp4');
const args = ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex_script', graph, '-map', '[vout]', ...(audioLabel ? ['-map', `[${audioLabel}]`, '-c:a', 'aac', '-b:a', '192k'] : []),
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', tmpOut];
console.log(`assembling ${edl.shots.length} shots, ${total} frames (${(total / FPS).toFixed(2)} s), ${cues.length} voice cues -> ${rel(OUT)}`);
const t0 = Date.now();
const r = spawnSync(ffmpegPath(), args, { stdio: ['ignore', 'inherit', 'inherit'], maxBuffer: 1 << 26 });
if (r.status !== 0) { console.error(`ffmpeg failed (graph kept: ${graph})`); process.exit(1); }
const pr = probeFrames(tmpOut);
if (!pr || pr.frames !== total) { console.error(`the cut has ${pr?.frames} frames, the edit list ${total}`); process.exit(1); }
fs.renameSync(tmpOut, OUT);
// subtitles
const ts = (x) => { const ms = Math.max(0, Math.round(x * 1000)); const p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
srt.sort((a, b) => a.a - b.a);
fs.writeFileSync(OUT.replace(/\.mp4$/, '.en.srt'), srt.map((s, i) => `${i + 1}\n${ts(s.a)} --> ${ts(Math.max(s.b, s.a + 0.8))}\n${s.text}\n`).join('\n'));
report.output = { file: rel(OUT), frames: pr.frames, duration_s: +(pr.frames / FPS).toFixed(3), size_mb: +(fs.statSync(OUT).size / 1048576).toFixed(1), assembled_s: Math.round((Date.now() - t0) / 1000) };
report.summary = { rendered: report.shots.filter((s) => s.source.startsWith('rendered')).length, black: report.shots.filter((s) => s.source === 'black').length, slates: report.shots.filter((s) => s.source === 'slate').length, voice_cues: cues.length, review_flags: report.shots.filter((s) => s.notes && !s.accepted).length, review_flags_accepted: report.shots.filter((s) => s.notes && s.accepted).length };
fs.writeFileSync(path.join(HERE, EDL === 'edl' ? 'cut-report.json' : `cut-report-${EDL.slice(4)}.json`), JSON.stringify(report, null, 1) + '\n');
if (!flag("--keep-work")) fs.rmSync(WORK, { recursive: true, force: true }); else console.log(`work kept: ${WORK}`);
// the render's review flags (framing the solver could not hold, a speaking face that reads): look at these shots first
// (spec.reviewOk: looked at and kept - printed as accepted, not counted in summary.review_flags)
for (const r of report.shots.filter((x) => x.notes)) for (const n of r.notes) console.log(`  review ${r.job}: ${n}${r.accepted ? `  [accepted: ${r.accepted}]` : ''}`);
if (report.summary.slates) console.log(`  ${report.summary.slates} shot(s) still slates: ${report.shots.filter((x) => x.source === 'slate').map((x) => x.job).join(' ')}`);
console.log(`wrote ${rel(OUT)}: ${pr.frames} frames = ${(pr.frames / FPS).toFixed(2)} s, ${report.output.size_mb} MB (${report.summary.rendered} rendered, ${report.summary.black} black, ${report.summary.slates} slates, ${cues.length} voice cues, ${report.summary.review_flags} open review flags + ${report.summary.review_flags_accepted} accepted) in ${report.output.assembled_s} s`);
