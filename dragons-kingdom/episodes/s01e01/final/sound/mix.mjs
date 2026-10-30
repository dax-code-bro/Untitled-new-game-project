#!/usr/bin/env node
// Episode sound mixer: lays the voice takes on a cut's timeline, adds synthesised ambience beds, ducks the
// beds under the words, normalises to -16 LUFS integrated with true peak <= -1 dBTP, and muxes the mix onto a
// COPY of the draft cut. Deterministic: same inputs + same FFmpeg = byte-identical WAV (seeded noise only).
//
//   node episodes/s01e01/final/sound/mix.mjs [--cut PROLOGUE-TITLE-1A] [--work DIR] [--out DIR]
//        [--no-mux] [--keep-work] [--edl F --cues F --video F]
//
// Reads (never writes) final/cut/: edl<-cut>.json (shots: scene, set, rec_in/out frames, trans),
//   audio-cues<-cut>.json (voice takes: file, file_in/out_s, rec_s, speech_rec_in/out_s, gain_db),
//   DragonsKingdom_S01E01_draft-cut_<cut>.mp4 (+ .en.srt). The cut "PROLOGUE-TITLE-1A" uses the files
//   without a suffix (edl.json, audio-cues.json); any other cut id X uses edl-X.json / audio-cues-X.json.
// Reads final/vo/*.wav (the voice takes) and sound/beds.json (ambience recipes, which set uses which bed).
// Writes final/audio/cuts/<cut>/: mix.wav (48 kHz 24-bit stereo), DragonsKingdom_S01E01_draft-cut_<cut>_sound.mp4
//   (video stream copied bit for bit, AAC 256k), the .srt copied, mix-report.json; and sound/reports/<cut>.json.
// Work files (stems) go to --work (default final/audio/.work/<cut>/) and are deleted unless --keep-work.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffmpegPath } from '../../../../render/lib/tools.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FINAL = path.resolve(HERE, '..');
const REPO = path.resolve(FINAL, '../../..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);
const CUT = opt('--cut', 'PROLOGUE-TITLE-1A');
const SUF = CUT === 'PROLOGUE-TITLE-1A' ? '' : `-${CUT}`;
const EDL = path.resolve(opt('--edl', path.join(FINAL, 'cut', `edl${SUF}.json`)));
const CUES = path.resolve(opt('--cues', path.join(FINAL, 'cut', `audio-cues${SUF}.json`)));
const VIDEO = path.resolve(opt('--video', path.join(FINAL, 'cut', `DragonsKingdom_S01E01_draft-cut_${CUT}.mp4`)));
const OUT = path.resolve(opt('--out', path.join(FINAL, 'audio', 'cuts', CUT)));
const WORK = path.resolve(opt('--work', path.join(FINAL, 'audio', '.work', CUT)));
const BEDS = JSON.parse(fs.readFileSync(path.join(HERE, 'beds.json'), 'utf8'));
const SR = 48000;
// dialogue anchor: the words never go above MAX_DIALOGUE_I (integrated over the dialogue stem). In a cut with sparse
// dialogue and no music yet, hitting -16 integrated would push the words to -11 and into the limiter, so the mix
// stays quieter there (report: anchored = 'dialogue') until music and effects fill it.
const TARGET_I = -16, MAX_TP = -1.0, DIALOGUE_I = -17, MAX_DIALOGUE_I = -15;
const FF = ffmpegPath();
const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');
const say = (s) => console.log(s);
const r3 = (x) => Math.round(x * 1000) / 1000;
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });

function ff(args, label) {
  const r = spawnSync(FF, ['-hide_banner', '-nostdin', '-y', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${label}):\n${(r.stderr || '').slice(-3000)}`);
  return r.stderr || '';
}
function graphFile(name, text) { const f = path.join(WORK, name); fs.writeFileSync(f, text); return f; }
// integrated loudness, LRA and true peak of an ffmpeg input (args = input args, pre = filters before ebur128)
function measure(inArgs, pre = '', label = 'measure', graph = null) {
  const err = (graph
    ? ff([...inArgs, '-filter_complex_script', graphFile('measure.txt', `${graph.text};\n[${graph.out}]${pre ? pre + ',' : ''}ebur128=peak=true[meas]`), '-map', '[meas]', '-f', 'null', '-'], label)
    : ff([...inArgs, '-af', `${pre ? pre + ',' : ''}ebur128=peak=true`, '-f', 'null', '-'], label)).replace(/\r/g, '');
  const sum = err.slice(err.lastIndexOf('Summary:'));
  const num = (re) => { const m = sum.match(re); return m ? +m[1] : null; };
  return { I: num(/I:\s+(-?[\d.]+|-inf) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/) };
}
// momentary loudness every 100 ms -> [[t, M], ...]
function framelog(file, pre = '') {
  const err = ff(['-i', file, '-af', `${pre ? pre + ',' : ''}ebur128=framelog=info`, '-f', 'null', '-'], 'framelog');
  const out = [];
  for (const m of err.matchAll(/t:\s*([\d.]+)\s+TARGET:\S+\s+LUFS\s+M:\s*(-?[\d.]+|-inf)/g)) out.push([+m[1], m[2] === '-inf' ? -120 : +m[2]]);
  return out;
}
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const dbToLin = (db) => Math.pow(10, db / 20);
const f4 = (x) => (+x).toFixed(4);

// ---------- inputs ----------
const edl = JSON.parse(fs.readFileSync(EDL, 'utf8'));
const cuesDoc = JSON.parse(fs.readFileSync(CUES, 'utf8'));
const FPS = edl.fps || 24;
const DUR = edl.frames / FPS;
const cues = Object.values(cuesDoc.scenes).flat();
say(`cut ${CUT}: ${edl.shots.length} shots, ${DUR.toFixed(3)} s, ${cues.length} voice cues`);

// ---------- ambience runs: consecutive shots with the same bed ----------
const bedOf = (s) => BEDS.shots[s.job] || BEDS.sets[s.set] || BEDS.default_bed;
const runs = [];
for (const s of edl.shots) {
  const bed = bedOf(s);
  if (!BEDS.beds[bed]) throw new Error(`shot ${s.job}: bed "${bed}" not in beds.json`);
  const a = s.rec_in / FPS, b = s.rec_out / FPS;
  const xf = s.trans && s.trans[0] === 'dissolve' ? (s.trans[1] || 24) / FPS : BEDS.crossfade_s;
  const last = runs[runs.length - 1];
  if (last && last.bed === bed) { last.b = b; last.shots.push(s.job); continue; }
  if (last) last.xfOut = xf;
  runs.push({ bed, a, b, xfIn: runs.length ? xf : BEDS.start_fade_s, xfOut: 0, first: !runs.length, shots: [s.job] });
}
// envelope: equal-power ramps centred on the run edges (the first run fades in from t=0, the last holds to the end)
function envExpr(bed) {
  const terms = runs.filter((r) => r.bed === bed).map((r) => {
    const a0 = r.first ? 0 : r.a - r.xfIn / 2, fi = r.xfIn;
    const up = `sin(PI/2*clip((t-${f4(a0)})/${f4(fi)},0,1))`;
    if (!r.xfOut) return up;
    const b1 = r.b + r.xfOut / 2;
    return `${up}*sin(PI/2*clip((${f4(b1)}-t)/${f4(r.xfOut)},0,1))`;
  });
  return terms.join('+');
}
// speech windows (merged when closer than 0.6 s) -> duck envelope for every bed
const wins = cues.map((c) => [c.speech_rec_in_s ?? c.rec_s, c.speech_rec_out_s ?? c.rec_s + (c.file_out_s - c.file_in_s)]).sort((x, y) => x[0] - y[0]);
const merged = [];
for (const w of wins) { const l = merged[merged.length - 1]; if (l && w[0] - l[1] < 0.6) l[1] = Math.max(l[1], w[1]); else merged.push([...w]); }
const duckSum = merged.map(([a, b]) => `clip((t-${f4(a - 0.2)})/0.2,0,1)*clip((${f4(b + 0.35)}-t)/0.35,0,1)`).join('+');
const duckExpr = (db) => (merged.length && db > 0 ? `(1-${f4(1 - dbToLin(-db))}*min(1,${duckSum}))` : '1');

// ---------- bed graph ----------
function layerGraph(L, i, tag, dur) {
  const lab = `${tag}l${i}`;
  const filt = [];
  if (L.hp) filt.push(`highpass=f=${L.hp}:p=2`);
  if (L.lp) filt.push(`lowpass=f=${L.lp}:p=2`);
  if (L.bp) filt.push(`bandpass=f=${L.bp[0]}:width_type=q:w=${L.bp[1]}`);
  filt.push(`volume=${f4(dbToLin(L.gain_db || 0))}`);
  if (L.env) filt.push(`asetnsamples=n=240`, `volume='${L.env}':eval=frame`);
  const chain = filt.join(',');
  const lines = [];
  const src = (seed, side) => {
    if (L.crackle) {
      // sparse impulses, density rate_hz x env_density, random sign and size; seed shifts the random state
      const p = `${(L.rate_hz / SR).toExponential(4)}*(${L.env_density || '1'})`;
      const sd = seed + side;
      return `aevalsrc=exprs='if(eq(n,0),st(0,${sd})+st(1,${sd * 7 + 3})+st(2,${sd * 13 + 5}),0);if(lt(random(0),${p}),(2*random(1)-1)*pow(random(2),2)*4,0)':s=${SR}:d=${f4(dur)}`;
    }
    return `anoisesrc=c=${L.noise}:r=${SR}:a=0.5:s=${seed + side}:d=${f4(dur)}`;
  };
  if (L.stereo) {
    lines.push(`${src(L.seed, 0)},${chain}[${lab}L]`, `${src(L.seed, 1000)},${chain}[${lab}R]`,
      `[${lab}L][${lab}R]join=inputs=2:channel_layout=stereo:map=0.0-FL|1.0-FR[${lab}]`);
  } else {
    const pan = L.pan || 0, gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
    lines.push(`${src(L.seed || 0, 0)},${chain},pan=stereo|c0=${f4(gl)}*c0|c1=${f4(gr)}*c0[${lab}]`);
  }
  return { lines, lab };
}
function bedGraph(name, dur, tag) {
  const bed = BEDS.beds[name];
  const lines = [], labs = [];
  bed.layers.forEach((L, i) => { const g = layerGraph(L, i, tag, dur); lines.push(...g.lines); labs.push(`[${g.lab}]`); });
  lines.push(`${labs.join('')}amix=inputs=${labs.length}:normalize=0:duration=longest[${tag}]`);
  return lines;
}

// ---------- 1. calibrate each bed (60 s alone -> gain to its target_lufs), cached by recipe ----------
const usedBeds = [...new Set(runs.map((r) => r.bed))];
const calFile = path.join(WORK, 'bed-cal.json');
const cal = fs.existsSync(calFile) ? JSON.parse(fs.readFileSync(calFile, 'utf8')) : {};
const ffver = spawnSync(FF, ['-version'], { encoding: 'utf8' }).stdout.split('\n')[0];
for (const b of usedBeds) {
  const key = crypto.createHash('sha1').update(JSON.stringify(BEDS.beds[b].layers) + ffver).digest('hex');
  if (cal[b]?.key === key) continue;
  const m = measure([], '', `calibrate ${b}`, { text: bedGraph(b, 60, 'bed').join(';\n'), out: 'bed' });
  cal[b] = { key, lufs_raw: m.I };
  say(`  bed ${b}: raw ${m.I} LUFS`);
}
fs.writeFileSync(calFile, JSON.stringify(cal, null, 1));

// ---------- 2. dialogue stem ----------
const vofiles = [...new Set(cues.map((c) => c.file))];
for (const f of vofiles) if (!fs.existsSync(path.join(FINAL, f))) throw new Error(`missing voice take ${f}`);
const dIn = [], dG = [];
vofiles.forEach((f) => dIn.push('-i', path.join(FINAL, f)));
dIn.push('-f', 'lavfi', '-i', `anullsrc=r=${SR}:cl=mono:d=${f4(DUR)}`);
cues.forEach((c, j) => {
  const k = vofiles.indexOf(c.file);
  dG.push(`[${k}:a]atrim=start=${f4(c.file_in_s)}:end=${f4(c.file_out_s)},asetpts=PTS-STARTPTS,aresample=${SR},aformat=channel_layouts=mono,` +
    `afade=t=in:d=0.005,areverse,afade=t=in:d=0.02,areverse,volume=${c.gain_db || 0}dB,adelay=${Math.round(c.rec_s * 1000)}:all=1[v${j}]`);
});
// split repeated inputs (a file used by several cues)
const uses = {}; cues.forEach((c) => { uses[c.file] = (uses[c.file] || 0) + 1; });
const dGraph = [];
vofiles.forEach((f, k) => {
  const n = uses[f];
  if (n > 1) dGraph.push(`[${k}:a]asplit=${n}${Array.from({ length: n }, (_, i) => `[s${k}_${i}]`).join('')}`);
});
const seen = {};
dG.forEach((line, j) => {
  const k = vofiles.indexOf(cues[j].file);
  if (uses[cues[j].file] > 1) { const i = seen[k] = (seen[k] ?? -1) + 1; line = line.replace(`[${k}:a]`, `[s${k}_${i}]`); }
  dGraph.push(line);
});
dGraph.push(`${cues.map((_, j) => `[v${j}]`).join('')}[${vofiles.length}:a]amix=inputs=${cues.length + 1}:normalize=0:dropout_transition=0:duration=longest,` +
  `aresample=async=1:first_pts=0,atrim=end=${f4(DUR)},highpass=f=70:p=2,acompressor=threshold=-24dB:ratio=2.5:attack=8:release=180:makeup=1[dlg]`);
const dlgWav = path.join(WORK, 'dialogue.wav');
ff([...dIn, '-filter_complex_script', graphFile('dialogue.txt', dGraph.join(';\n')), '-map', '[dlg]', '-c:a', 'pcm_f32le', '-fflags', '+bitexact', '-flags:a', '+bitexact', dlgWav], 'dialogue stem');
// a stem must cover the cut exactly (an amix whose inputs start late once shifted the words by the first delay)
function checkLen(f) {
  const n = (fs.statSync(f).size - 80) / 4 / (f === dlgWav ? 1 : 2) / SR;
  if (Math.abs(n - DUR) > 0.05) throw new Error(`${path.basename(f)} is ${n.toFixed(3)} s, the cut is ${DUR} s`);
}
checkLen(dlgWav);
const dm = measure(['-i', dlgWav], '', 'dialogue loudness');
const dlgGain = DIALOGUE_I - dm.I;
say(`dialogue stem: ${dm.I} LUFS raw -> gain ${dlgGain.toFixed(2)} dB`);

// ---------- 3. ambience stem ----------
const aG = [];
usedBeds.forEach((b, i) => {
  const bed = BEDS.beds[b];
  aG.push(...bedGraph(b, DUR, `b${i}`));
  const gain = bed.target_lufs - cal[b].lufs_raw;
  aG.push(`[b${i}]volume=${gain.toFixed(3)}dB,asetnsamples=n=240,volume='(${envExpr(b)})*${duckExpr(bed.duck_db)}':eval=frame[bb${i}]`);
});
aG.push(`${usedBeds.map((_, i) => `[bb${i}]`).join('')}amix=inputs=${usedBeds.length}:normalize=0:duration=longest,atrim=end=${f4(DUR)}[amb]`);
const ambWav = path.join(WORK, 'ambience.wav');
ff(['-filter_complex_script', graphFile('ambience.txt', aG.join(';\n')), '-map', '[amb]', '-c:a', 'pcm_f32le', '-fflags', '+bitexact', '-flags:a', '+bitexact', ambWav], 'ambience stem');
checkLen(ambWav);
say('ambience stem written');

// ---------- 4. master: sum, gain to -16 LUFS, 4x-oversampled limiter, verify true peak ----------
const sumG = (gain, ceil) => `[0:a]volume=${dlgGain.toFixed(3)}dB,pan=stereo|c0=c0|c1=c0[d];[d][1:a]amix=inputs=2:normalize=0:duration=longest,` +
  `volume=${gain.toFixed(3)}dB,aresample=${SR * 4},alimiter=limit=${dbToLin(ceil).toFixed(5)}:attack=2:release=80:level=0:latency=1,` +
  `aresample=${SR},afade=t=out:st=${f4(DUR - 0.3)}:d=0.3[m]`;
const pre = measure(['-i', dlgWav, '-i', ambWav], '', 'premaster', { text: sumG(0, 0).replace(/alimiter=[^,]*,/, ''), out: 'm' });
const gainCap = MAX_DIALOGUE_I - DIALOGUE_I;
let gain = Math.min(TARGET_I - pre.I, gainCap), ceil = -1.6, mm = null;
const mixWav = path.join(OUT, 'mix.wav');
for (let it = 0; it < 4; it++) {
  ff(['-i', dlgWav, '-i', ambWav, '-filter_complex', sumG(gain, ceil), '-map', '[m]', '-c:a', 'pcm_s24le', '-fflags', '+bitexact', '-flags:a', '+bitexact', mixWav], 'master');
  mm = measure(['-i', mixWav], '', 'master check');
  say(`  master pass ${it + 1}: gain ${gain.toFixed(2)} dB, ceiling ${ceil} dBFS -> I ${mm.I} LUFS, TP ${mm.TP} dBTP, LRA ${mm.LRA}`);
  const okTP = mm.TP <= MAX_TP - 0.1, okI = Math.abs(mm.I - TARGET_I) <= 0.3 || (gain >= gainCap - 1e-9 && mm.I < TARGET_I);
  if (okTP && okI) break;
  if (!okTP) ceil -= 0.5;
  if (!okI) gain = Math.min(gain + TARGET_I - mm.I, gainCap);
}

// ---------- 5. intelligibility: dialogue vs ambience (both at mix gain) over every speech window ----------
const dl = framelog(dlgWav, `volume=${(dlgGain + gain).toFixed(3)}dB`);
const al = framelog(ambWav, `volume=${gain.toFixed(3)}dB`);
const meanM = (log, a, b) => { const v = log.filter(([t]) => t >= a + 0.4 && t <= b + 0.2).map(([, m]) => Math.pow(10, m / 10)); return v.length ? 10 * Math.log10(v.reduce((s, x) => s + x, 0) / v.length) : null; };
const intel = merged.map(([a, b]) => { const d = meanM(dl, a, b), m = meanM(al, a, b); return { from_s: r3(a), to_s: r3(b), dialogue_M: d && r3(d), ambience_M: m && r3(m), margin_LU: d && m ? r3(d - m) : null }; });
const margins = intel.map((x) => x.margin_LU).filter((x) => x !== null);
const minMargin = margins.length ? Math.min(...margins) : null;
say(`intelligibility: dialogue over ambience, min ${minMargin} LU over ${intel.length} speech windows (want >= 10)`);

// ---------- 6. mux onto a copy of the draft cut ----------
let muxed = null;
if (!flag('--no-mux') && fs.existsSync(VIDEO)) {
  const base = path.basename(VIDEO, '.mp4');
  const mp4 = path.join(OUT, `${base}_sound.mp4`);
  ff(['-i', VIDEO, '-i', mixWav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-t', f4(DUR), mp4], 'mux');
  const srt = VIDEO.replace(/\.mp4$/, '.en.srt');
  if (fs.existsSync(srt)) fs.copyFileSync(srt, path.join(OUT, `${base}_sound.en.srt`));
  const probe = spawnSync(FF.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' });
  const aac = measure(['-i', mp4], '', 'aac check');
  muxed = { file: rel(mp4), duration_s: probe.status === 0 ? +probe.stdout.trim() : null, aac_I: aac.I, aac_TP: aac.TP, bytes: fs.statSync(mp4).size };
  say(`muxed: ${rel(mp4)} (${muxed.duration_s} s), AAC I ${aac.I} LUFS, TP ${aac.TP} dBTP`);
} else say(`no mux (${fs.existsSync(VIDEO) ? '--no-mux' : 'no video ' + rel(VIDEO)})`);

// ---------- 7. report ----------
const report = {
  cut: CUT, made_with: ffver, inputs: { edl: rel(EDL), cues: rel(CUES), video: rel(VIDEO), beds: 'episodes/s01e01/final/sound/beds.json' },
  duration_s: DUR, targets: { integrated_lufs: TARGET_I, true_peak_dbtp_max: MAX_TP, dialogue_lufs_pre_master: DIALOGUE_I, min_dialogue_margin_lu: 10 },
  result: { mix: rel(mixWav), I: mm.I, TP: mm.TP, LRA: mm.LRA, sha256: sha256(mixWav), master_gain_db: r3(gain), limiter_ceiling_dbfs: ceil, dialogue_gain_db: r3(dlgGain), min_dialogue_margin_lu: minMargin,
    anchored: gain >= gainCap - 1e-9 && mm.I < TARGET_I - 0.5 ? 'dialogue' : 'integrated',
    pass: mm.TP <= MAX_TP && (Math.abs(mm.I - TARGET_I) <= 0.5 || gain >= gainCap - 1e-9) && (minMargin === null || minMargin >= 10) },
  muxed,
  beds: Object.fromEntries(usedBeds.map((b) => [b, { target_lufs: BEDS.beds[b].target_lufs, raw_lufs_60s: cal[b].lufs_raw, duck_db: BEDS.beds[b].duck_db }])),
  runs: runs.map((r) => ({ bed: r.bed, from_s: r3(r.a), to_s: r3(r.b), xf_in_s: r3(r.xfIn), xf_out_s: r3(r.xfOut), shots: `${r.shots[0]}..${r.shots[r.shots.length - 1]} (${r.shots.length})` })),
  voice_cues: cues.length, speech_windows: intel,
};
fs.writeFileSync(path.join(OUT, 'mix-report.json'), JSON.stringify(report, null, 1));
fs.mkdirSync(path.join(HERE, 'reports'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'reports', `${CUT}.json`), JSON.stringify(report, null, 1));
if (!flag('--keep-work')) for (const f of [dlgWav, ambWav]) fs.rmSync(f, { force: true });
say(`${report.result.pass ? 'PASS' : 'CHECK'}: ${rel(mixWav)} I ${mm.I} LUFS, TP ${mm.TP} dBTP, sha256 ${report.result.sha256.slice(0, 16)}`);
