// Shot director - dialogue placement (pure JS: browser AND Node).
//
// The voice takes (episodes/s01e01/final/vo/takes.json + words.json) are placed inside each shot:
// every placed line says where in the shot its WAV starts, where the words start and end, and
// the time of every word - so the sound mix, the subtitles and lip-sync (scenes/lib/humans,
// performance track) all use the same numbers.
//
// Cue syntax in a shot spec (`lines: [...]`), the same convention as the preview EDL
// (episodes/s01e01/preview/tools/edl_shots.py):
//   ['L006', 0.6]            first line: 0.6 s from the shot's first frame to the first sound of
//                            the words; later lines: the gap from the previous line's last word
//                            to this line's first word
//   ['L011', { at: 0.9 }]    the words start 0.9 s into the shot
//   ['L061', 'end', 0.25]    the words end 0.25 s before the cut
//   ['L003#2', 0.4]          part 2 of a split take (see SPLITS: a take cut at silent word
//                            boundaries so one line can run over several shots; words untouched)
//   ['L002', 2.0, { continues: true }]   the take runs on over the cut (not cut off at the shot end)
//
// Times inside a take come from takes.json `segments` (sentence starts/ends, 10 ms) and
// words.json (forced alignment); the WAV's sample 0 is the take's time 0.

/** Index takes.json + words.json: id -> take record. */
export function indexTakes(takesJson, wordsJson) {
  const words = wordsJson?.lines || {};
  const map = new Map();
  for (const tk of takesJson?.takes || []) {
    const w = words[tk.id]?.words || [];
    const segs = tk.segments?.length ? tk.segments : [{ start_s: 0.03, end_s: tk.duration_s - 0.03 }];
    map.set(tk.id, {
      id: tk.id, role: tk.role, text: tk.text, file: tk.file, scene: tk.scene, shots: tk.shots || [],
      dur: tk.duration_s, segments: segs, words: w,
      speechIn: segs[0].start_s, speechOut: segs[segs.length - 1].end_s,
      gain_db: tk.mix?.gain_db ?? 0, space: tk.mix?.space ?? null, airborne: !!tk.airborne,
      placeholder: !!tk.placeholder, delivery: tk.performance?.preset ?? null,
    });
  }
  return { get: (id) => map.get(id) || null, all: () => [...map.values()] };
}

/**
 * The parts of a take cut at times `cuts` (seconds in the take, each inside a silence). Without
 * explicit cuts a take is split at the middle of every pause between its sentence segments.
 * part k (1-based): { from_s, to_s, speechIn, speechOut, words }
 */
export function takeParts(take, cuts = null) {
  let c = cuts;
  if (!c) { c = []; for (let i = 1; i < take.segments.length; i++) c.push((take.segments[i - 1].end_s + take.segments[i].start_s) / 2); }
  const edges = [0, ...c, take.dur];
  const parts = [];
  for (let k = 0; k + 1 < edges.length; k++) {
    const a = edges[k], b = edges[k + 1];
    const ws = take.words.filter((w) => w.start_s >= a - 0.005 && w.start_s < b);
    const segs = take.segments.filter((s) => s.end_s > a && s.start_s < b);
    const speechIn = Math.max(a, Math.min(ws[0]?.start_s ?? Infinity, segs[0]?.start_s ?? Infinity));
    const speechOut = Math.min(b, Math.max(ws[ws.length - 1]?.end_s ?? -Infinity, segs[segs.length - 1]?.end_s ?? -Infinity));
    parts.push({ part: k + 1, from_s: a, to_s: b, speechIn: Number.isFinite(speechIn) ? speechIn : a, speechOut: Number.isFinite(speechOut) ? speechOut : b, words: ws });
  }
  return parts;
}

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Place a shot's lines. shotSeconds: the shot length; cues: the spec's `lines`; takes: indexTakes();
 * splits: { L003: [cut times] }. Returns { placed: [...], warnings: [...] }; each placed line:
 *   { id, part, ref ('L003#2'), role, file, file_in_s, file_out_s, at_s (shot time where file_in_s
 *     plays), speech_in_s, speech_out_s (shot time), words: [{ w, start_s, end_s }] (shot time),
 *     gain_db, continues }
 */
export function placeLines(shotSeconds, cues = [], takes, splits = {}, opts = {}) {
  const placed = [], warnings = [];
  let prevEnd = null;
  const minTail = opts.minTail ?? 0.3;
  for (const cue of cues) {
    const [ref, a, b] = cue;
    const o = (b && typeof b === 'object') ? b : (a && typeof a === 'object' ? a : {});
    const [id, partStr] = String(ref).split('#');
    const take = takes.get(id);
    if (!take) { warnings.push(`${ref}: no take in takes.json`); continue; }
    let seg = { part: 0, from_s: 0, to_s: take.dur, speechIn: take.speechIn, speechOut: take.speechOut, words: take.words };
    if (partStr) {
      const parts = takeParts(take, splits[id]);
      seg = parts[+partStr - 1];
      if (!seg) { warnings.push(`${ref}: the take has only ${parts.length} parts`); continue; }
    }
    // when does the first word sound (shot time)?
    let speechAt;
    if (a === 'end') speechAt = shotSeconds - (typeof b === 'number' ? b : 0.25) - (seg.speechOut - seg.speechIn);
    else if (typeof o.at === 'number') speechAt = o.at;
    else if (typeof a === 'number') speechAt = prevEnd === null ? a : prevEnd + a;
    else speechAt = prevEnd === null ? 0.5 : prevEnd + 0.35;
    const shift = speechAt - seg.speechIn;            // shot time of take time 0
    const p = {
      id, part: seg.part, ref: String(ref), role: take.role, file: take.file,
      file_in_s: r3(seg.from_s), file_out_s: r3(seg.to_s),
      at_s: r3(seg.from_s + shift), speech_in_s: r3(speechAt), speech_out_s: r3(seg.speechOut + shift),
      words: seg.words.map((w) => ({ w: w.w, start_s: r3(w.start_s + shift), end_s: r3(w.end_s + shift) })),
      gain_db: take.gain_db, continues: !!o.continues, placeholder: take.placeholder,
    };
    if (p.at_s < -1e-6 && !o.preroll) warnings.push(`${ref}: the take starts ${(-p.at_s).toFixed(2)} s before the shot (lead too short)`);
    if (!p.continues && p.speech_out_s > shotSeconds - minTail + 1e-6) warnings.push(`${ref}: the words end at ${p.speech_out_s.toFixed(2)} s, the shot is ${shotSeconds.toFixed(2)} s (needs ${minTail} s of tail)`);
    placed.push(p);
    prevEnd = p.speech_out_s;
  }
  return { placed, warnings };
}

/**
 * A simple mouth-openness envelope 0..1 at shot time t from the placed lines of one speaker
 * (inside a word: syllable-rate opening; between words: closed). A stand-in for real visemes
 * (the performance track's lip-sync replaces it); faces stay soft or turned until then.
 */
export function mouthAt(placed, role, t) {
  for (const p of placed) {
    if (p.role !== role || t < p.speech_in_s - 0.05 || t > p.speech_out_s + 0.05) continue;
    for (const w of p.words) {
      if (t < w.start_s - 0.03 || t > w.end_s + 0.03) continue;
      const len = Math.max(0.08, w.end_s - w.start_s);
      const syl = Math.max(1, Math.round(len / 0.19));
      const x = (t - w.start_s) / len;
      const env = Math.sin(Math.PI * Math.min(1, Math.max(0, x)));
      return 0.25 + 0.75 * env * (0.6 + 0.4 * Math.abs(Math.sin(Math.PI * syl * x)));
    }
    return 0;
  }
  return 0;
}

/** Who is speaking at shot time t (role or null): for eye-lines and cutaways. */
export function speakerAt(placed, t) {
  for (const p of placed) if (t >= p.speech_in_s && t <= p.speech_out_s) return p.role;
  return null;
}
