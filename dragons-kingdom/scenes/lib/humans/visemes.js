// Lip-sync: phone timing -> articulator curves -> MakeHuman face pose units (pure functions; no THREE).
//
// Input: one take's record from data/lipsync-s01e01.json (offline/lipsync_align.py: ARPAbet phones
// with start/end in centiseconds from pocketsphinx forced alignment on the take's own WAV, the
// take's word windows, and a 10 ms loudness envelope).
//
// 1. Every phone becomes a SEGMENT with a target for each articulator (PARAMS) and a dominance per
//    articulator (Cohen & Massaro's coarticulation model, 1993): a phone that needs an articulator
//    (the lips CLOSED for p/b/m, the lower lip TUCKED for f/v, the lips ROUNDED for w/uw) dominates it
//    strongly and briefly; a phone that does not care about it (t, d, n, k, h ... for the lips) has a
//    weak dominance, so its neighbours decide: the lips round through the t of "two" before the vowel
//    sounds (anticipation reaches further than carry-over). Diphthongs are two targets.
//    value(t) = sum_i D_i(t) T_i / sum_i D_i(t), D_i(t) = a_i * exp(-k_i * max(0, |t - c_i| - plateau_i))
//    Pauses between words get a REST segment (mouth closed, relaxed), so the mouth closes in pauses
//    longer than ~80 ms and stays moving through fast speech.
// 2. The loudness envelope scales the jaw (a loud vowel opens more than the same vowel unstressed) and
//    the delivery scales everything (a whisper moves less, a shout more).
// 3. visemeUnits() maps the articulators onto the MakeHuman face units of face.js (JawOpen, LipsKiss,
//    lowerLipBackward, TonguePointUp, ...). The visible lead of the mouth over the sound (~40 ms: the
//    lips shape a sound before it is heard) is applied by lipAt().
//
//   import { prepareLine, lipAt, visemeUnits } from './visemes.js';
//   const L = prepareLine(record);                 // once per take (cached on the record)
//   const p = lipAt(L, takeTime);                  // articulators at take time (s); p.active 0..1
//   const w = visemeUnits(p, {});                  // face-unit weights, add to the expression
export const PARAMS = ['jaw', 'close', 'round', 'spread', 'fv', 'th', 'tip', 'upper', 'press'];
const NP = PARAMS.length;
const P = Object.fromEntries(PARAMS.map((n, i) => [n, i]));

// targets: [jaw, close, round, spread, fv, th, tip, upper, press]; dominance a per articulator;
// k = decay rate (1/s) outside the segment's plateau; ant = anticipation factor (k * ant before).
const V = (jaw, round = 0, spread = 0, upper = 0) => ({ T: [jaw, 0, round, spread, 0, 0, 0, upper, 0], vowel: true });
// vowel dominance: strong on jaw / round / spread, weak on lips-close (they are open) etc.
const VA = [1.0, 1.1, 0.7, 0.7, 0.6, 0.5, 0.55, 0.6, 0.6];
const PHONES = {
  AA: V(0.78, 0, 0.08, 0.15), AE: V(0.62, 0, 0.38, 0.3), AH: V(0.46, 0, 0.12, 0.1), AO: V(0.6, 0.42, 0, 0.05),
  EH: V(0.46, 0, 0.36, 0.2), ER: V(0.3, 0.38, 0, 0.15), IH: V(0.3, 0, 0.42, 0.12), IY: V(0.2, 0, 0.62, 0.15),
  UH: V(0.26, 0.5, 0, 0), UW: V(0.1, 0.9, 0, 0),
  // diphthongs: [first, second] targets (55 / 45 % of the phone)
  AW: [V(0.68, 0.05, 0.05, 0.12), V(0.24, 0.62, 0, 0)], AY: [V(0.72, 0, 0.08, 0.12), V(0.26, 0, 0.46, 0.12)],
  EY: [V(0.44, 0, 0.36, 0.18), V(0.24, 0, 0.52, 0.15)], OW: [V(0.48, 0.5, 0, 0), V(0.26, 0.78, 0, 0)],
  OY: [V(0.56, 0.5, 0, 0), V(0.24, 0, 0.46, 0.1)],
  // consonants: T, A
  P: { T: [0.02, 1, 0, 0, 0, 0, 0, 0, 0.6], A: [0.8, 3.0, 0.2, 0.25, 0.4, 0.2, 0.05, 0.4, 2.0], k: 32 },
  B: { T: [0.02, 1, 0, 0, 0, 0, 0, 0, 0.45], A: [0.8, 3.0, 0.2, 0.25, 0.4, 0.2, 0.05, 0.4, 2.0], k: 32 },
  M: { T: [0.02, 1, 0, 0, 0, 0, 0, 0, 0.3], A: [0.8, 3.0, 0.2, 0.25, 0.4, 0.2, 0.05, 0.4, 2.0], k: 30 },
  F: { T: [0.1, 0, 0, 0.1, 1, 0, 0, 0.35, 0], A: [1.2, 0.5, 0.2, 0.3, 3.0, 0.2, 0.05, 1.2, 0.3], k: 30 },
  V: { T: [0.1, 0, 0, 0.1, 1, 0, 0, 0.3, 0], A: [1.2, 0.5, 0.2, 0.3, 3.0, 0.2, 0.05, 1.2, 0.3], k: 30 },
  TH: { T: [0.16, 0, 0, 0.1, 0, 1, 0, 0.15, 0], A: [0.9, 0.3, 0.1, 0.2, 0.3, 2.5, 0.5, 0.3, 0.2], k: 28 },
  DH: { T: [0.14, 0, 0, 0.1, 0, 0.7, 0, 0.1, 0], A: [0.6, 0.3, 0.08, 0.15, 0.3, 1.5, 0.5, 0.2, 0.2], k: 30 },
  T: { T: [0.14, 0, 0, 0.12, 0, 0, 1, 0.1, 0], A: [0.45, 0.2, 0.05, 0.1, 0.2, 0.2, 1.1, 0.1, 0.1], k: 30 },
  D: { T: [0.16, 0, 0, 0.12, 0, 0, 1, 0.1, 0], A: [0.45, 0.2, 0.05, 0.1, 0.2, 0.2, 1.1, 0.1, 0.1], k: 30 },
  N: { T: [0.14, 0, 0, 0.1, 0, 0, 1, 0.05, 0], A: [0.4, 0.2, 0.05, 0.1, 0.2, 0.2, 1.0, 0.1, 0.1], k: 26 },
  L: { T: [0.24, 0, 0, 0.1, 0, 0, 1, 0.1, 0], A: [0.5, 0.2, 0.05, 0.12, 0.2, 0.2, 1.0, 0.1, 0.1], k: 26 },
  S: { T: [0.07, 0, 0, 0.32, 0, 0, 0.5, 0.25, 0], A: [1.6, 0.4, 0.3, 0.6, 0.3, 0.3, 0.6, 0.6, 0.2], k: 26 },
  Z: { T: [0.07, 0, 0, 0.3, 0, 0, 0.5, 0.2, 0], A: [1.4, 0.4, 0.3, 0.5, 0.3, 0.3, 0.6, 0.5, 0.2], k: 26 },
  SH: { T: [0.1, 0, 0.58, 0, 0, 0, 0.3, 0.45, 0], A: [1.3, 0.4, 1.4, 0.6, 0.3, 0.3, 0.4, 0.9, 0.2], k: 24 },
  ZH: { T: [0.1, 0, 0.55, 0, 0, 0, 0.3, 0.4, 0], A: [1.3, 0.4, 1.4, 0.6, 0.3, 0.3, 0.4, 0.9, 0.2], k: 24 },
  CH: { T: [0.1, 0, 0.55, 0, 0, 0, 0.6, 0.45, 0], A: [1.3, 0.4, 1.4, 0.6, 0.3, 0.3, 0.8, 0.9, 0.2], k: 26 },
  JH: { T: [0.12, 0, 0.5, 0, 0, 0, 0.6, 0.4, 0], A: [1.2, 0.4, 1.3, 0.6, 0.3, 0.3, 0.8, 0.8, 0.2], k: 26 },
  K: { T: [0.22, 0, 0, 0.05, 0, 0, 0, 0.05, 0], A: [0.35, 0.15, 0.05, 0.08, 0.15, 0.15, 0.15, 0.1, 0.1], k: 26 },
  G: { T: [0.22, 0, 0, 0.05, 0, 0, 0, 0.05, 0], A: [0.35, 0.15, 0.05, 0.08, 0.15, 0.15, 0.15, 0.1, 0.1], k: 26 },
  NG: { T: [0.2, 0, 0, 0.05, 0, 0, 0, 0.05, 0], A: [0.3, 0.15, 0.05, 0.08, 0.15, 0.15, 0.15, 0.1, 0.1], k: 24 },
  HH: { T: [0.3, 0, 0, 0.05, 0, 0, 0, 0.05, 0], A: [0.12, 0.1, 0.03, 0.05, 0.1, 0.1, 0.05, 0.05, 0.05], k: 22 },
  R: { T: [0.2, 0, 0.42, 0, 0, 0, 0.2, 0.2, 0], A: [0.6, 0.3, 1.2, 0.5, 0.3, 0.3, 0.3, 0.5, 0.2], k: 24 },
  W: { T: [0.1, 0, 0.92, 0, 0, 0, 0, 0, 0], A: [0.9, 0.4, 2.4, 0.9, 0.3, 0.3, 0.1, 0.4, 0.2], k: 22 },
  Y: { T: [0.12, 0, 0, 0.42, 0, 0, 0.2, 0.1, 0], A: [0.8, 0.3, 0.6, 1.0, 0.3, 0.3, 0.3, 0.3, 0.2], k: 24 },
};
const REST = { T: [0, 0, 0, 0, 0, 0, 0, 0, 0], A: [0.7, 0.5, 0.5, 0.5, 0.6, 0.6, 0.6, 0.5, 0.5], k: 11 };
const VOWEL_K = 15;           // vowels reach ~70 ms past their plateau
// decay BEFORE a segment = k * ANTICIPATE[articulator]: anticipation reaches further than carry-over,
// but not equally for every articulator - the lips start to round ~200 ms ahead of a w / oo (through the
// consonants before it), while a bilabial closure or the lip-to-teeth of f / v forms only in the last
// ~50 ms (with one factor for all, "weapon"'s EH was 43 % closed by the coming p)
const ANTICIPATE = Float32Array.from([0.6, 1.5, 0.42, 0.6, 1.3, 0.8, 0.75, 0.6, 1.5]);
const LEAD = 0.04;            // the mouth leads the sound (s)
const LIP_GAIN = 1.15;       // overall articulation (read at 3/4 in a close-up; 1 looked mumbled)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function seg(c, half, def, out, name = '') {
  const T = Float32Array.from(def.T);
  const A = Float32Array.from(def.A || VA);
  const k = def.k || VOWEL_K;
  out.push({ c, half, T, A, k, kb: ANTICIPATE.map((a) => k * a), lab: name === 'P' || name === 'B' || name === 'M', fv: name === 'F' || name === 'V' });
}

/**
 * Prepare a take record for fast evaluation (cached on the record). Times in seconds of the take.
 * Returns { segs (sorted by centre), env (dB per 10 ms), dur, speechIn, speechOut, words, rec }.
 */
export function prepareLine(rec) {
  if (rec && rec._prep) return rec._prep;
  const segs = [];
  const ph = rec?.ph || [];
  let prevEnd = null;
  const restSeg = (a, b) => { if (b - a > 1e-3) seg((a + b) / 2, (b - a) / 2, REST, segs); };
  for (const [name, s0, e0] of ph) {
    const a = s0 / 100, b = Math.max(a + 0.02, e0 / 100);
    // a pause before this phone (> 80 ms): a rest segment fills it
    if (prevEnd !== null && a - prevEnd > 0.08) restSeg(prevEnd + 0.02, a - 0.02);
    const def = PHONES[name] || PHONES.AH;
    if (Array.isArray(def)) {
      const m = a + (b - a) * 0.55;
      seg((a + m) / 2, (m - a) / 2, def[0], segs);
      seg((m + b) / 2, (b - m) / 2, def[1], segs);
    } else seg((a + b) / 2, (b - a) / 2, def, segs, name);
    prevEnd = b;
  }
  const dur = rec?.dur ?? (prevEnd ?? 0);
  // long rests before the first and after the last phone
  const first = ph.length ? ph[0][1] / 100 : dur;
  restSeg(Math.min(-1, first - 1), first - 0.03);
  if (prevEnd !== null) restSeg(prevEnd + 0.03, Math.max(dur, prevEnd) + 1.0);
  segs.sort((x, y) => x.c - y.c);
  // envelope: 0..63 -> -45..-10 dBFS
  const es = rec?.env || '';
  const env = new Float32Array(es.length);
  for (let i = 0; i < es.length; i++) env[i] = -45 + (B64.indexOf(es[i]) / 63) * 35;
  const speechIn = ph.length ? ph[0][1] / 100 : 0;
  const speechOut = ph.length ? ph[ph.length - 1][2] / 100 : dur;
  // the line's typical voiced level (median of the envelope inside speech)
  const vs = [];
  for (let i = Math.floor(speechIn * 100); i < Math.min(env.length, Math.ceil(speechOut * 100)); i++) if (env[i] > -38) vs.push(env[i]);
  vs.sort((x, y) => x - y);
  const level = vs.length ? vs[vs.length >> 1] : -22;
  const prep = { segs, env, dur, speechIn, speechOut, level, words: rec?.words || [], rec, maxHalf: segs.reduce((m, s) => Math.max(m, s.half), 0) };
  if (rec) Object.defineProperty(rec, '_prep', { value: prep, enumerable: false });
  return prep;
}

/** Envelope in dB at take time t (linear interpolation, -45 outside). */
export function envAt(L, t) {
  const x = t * 100 - 0.5, i = Math.floor(x), f = x - i;
  const e = L.env;
  const a = i >= 0 && i < e.length ? e[i] : -45, b = i + 1 >= 0 && i + 1 < e.length ? e[i + 1] : -45;
  return a + (b - a) * f;
}

/** Envelope smoothed over +-w seconds (box average of the 10 ms samples). */
export function envSmooth(L, t, w = 0.06) {
  const e = L.env;
  const i0 = Math.max(0, Math.floor((t - w) * 100)), i1 = Math.min(e.length - 1, Math.ceil((t + w) * 100));
  if (i1 < i0) return -45;
  let s = 0;
  for (let i = i0; i <= i1; i++) s += e[i];
  return s / (i1 - i0 + 1);
}

function lowerBound(segs, c) {
  let lo = 0, hi = segs.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (segs[m].c < c) lo = m + 1; else hi = m; }
  return lo;
}

/**
 * Articulators at take time t (s): { jaw, close, round, spread, fv, th, tip, upper, press, active, level }.
 * active (0..1): how much the take is speaking around t (0 in long pauses / before / after).
 * opts: { lead (s, 0.04), amp (1), whisper (bool) }.
 */
export function lipAt(L, t, opts = {}) {
  const tt = t + (opts.lead ?? LEAD);
  const out = new Float32Array(NP);
  const den = new Float32Array(NP);
  const segs = L.segs;
  const reach = L.maxHalf + 0.5;
  let i = lowerBound(segs, tt - reach);
  for (; i < segs.length; i++) {
    const s = segs[i];
    if (s.c > tt + reach) break;
    const d = tt - s.c;
    const ex = Math.abs(d) - s.half * 0.6;
    if (ex <= 0 || d >= 0) {
      const f = ex > 0 ? Math.exp(-s.k * ex) : 1;
      if (f < 1e-4) continue;
      for (let j = 0; j < NP; j++) { const D = s.A[j] * f; out[j] += D * s.T[j]; den[j] += D; }
    } else {
      // before the segment: per-articulator anticipation
      if (Math.exp(-s.kb[2] * ex) < 1e-4) continue;
      for (let j = 0; j < NP; j++) { const D = s.A[j] * Math.exp(-s.kb[j] * ex); out[j] += D * s.T[j]; den[j] += D; }
    }
  }
  const p = {};
  for (let j = 0; j < NP; j++) p[PARAMS[j]] = den[j] > 1e-6 ? out[j] / den[j] : 0;
  // the lips must really meet for p / b / m (and the lip must reach the teeth for f / v), however
  // short the phone: a contact floor over the middle of the phone (the averaging alone can miss it)
  for (let k = lowerBound(segs, tt - 0.3); k < segs.length && segs[k].c < tt + 0.3; k++) {
    const s = segs[k];
    if (!s.lab && !s.fv) continue;
    const d = Math.abs(tt - s.c), h = Math.max(0.025, s.half);
    const g = d < h * 0.55 ? 1 : d > h + 0.012 ? 0 : 1 - (d - h * 0.55) / (h * 0.45 + 0.012);
    if (s.lab) p.close = Math.max(p.close, g * g * (3 - 2 * g));
    else p.fv = Math.max(p.fv, 0.85 * g * g * (3 - 2 * g));
  }
  // loudness: louder than the line's own level opens the jaw more (+-35 %)
  const db = envSmooth(L, tt, 0.035);
  const loud = Math.max(-1, Math.min(1, (db - L.level) / 8));
  const active = Math.max(0, Math.min(1, (t - (L.speechIn - 0.25)) / 0.2)) * Math.max(0, Math.min(1, ((L.speechOut + 0.3) - t) / 0.25));
  const amp = (opts.amp ?? 1) * (opts.whisper ? 0.95 : 1);
  p.jaw *= amp * (1 + 0.32 * loud);
  for (const n of ['round', 'spread', 'fv', 'th', 'upper']) p[n] *= Math.min(1.2, amp);
  p.active = active;
  p.loud = loud;
  p.db = db;
  return p;
}

/**
 * Face-unit weights for articulators p (face.js unit names). opts: { jaw (scale 1), lips (scale 1),
 * out (an object to add into), shapes (the character has the sculpted mouth shapes: mouthshapes.js) }. Tuned on the MakeHuman builds: JawOpen = the jaw bone alone
 * (20 deg per unit), JawDrop also opens the lips (and pulls the lower-lip centre down).
 */
export function visemeUnits(p, opts = {}) {
  const o = opts.out || {};
  const add = (n, w) => { if (w) o[n] = (o[n] || 0) + w; };
  const js = (opts.jaw ?? 1) * LIP_GAIN, ls = (opts.lips ?? 1) * LIP_GAIN;
  const closeK = Math.min(1, p.close);
  // with the sculpted mouth shapes (opts.shapes) the bone units carry less of the lip shape
  const sh = opts.shapes ? 1 : 0;
  // closure forces the jaw nearly shut; the lips meet and press
  const jaw = Math.max(0, p.jaw) * (1 - 0.92 * closeK);
  add('JawOpen', 0.72 * jaw * js);
  add('JawDrop', 0.2 * jaw * js);
  add('lowerLipUp', (0.22 * closeK + 0.12 * p.press + 0.2 * p.fv) * ls);
  add('lowerLipBackward', 0.42 * p.fv * ls);
  // rounding: LipsKiss is a compact forward pucker; lowerLipForward would part the lips (teeth)
  add('LipsKiss', (1.1 - 0.55 * sh) * p.round * ls);
  add('UpperLipForward', (0.2 - 0.08 * sh) * p.round * ls);
  add('MouthLeftPullSide', (0.5 - 0.2 * sh) * p.spread * ls);
  add('MouthRightPullSide', (0.5 - 0.2 * sh) * p.spread * ls);
  add('UpperLipUp', (0.6 - 0.2 * sh) * p.upper * ls);
  if (sh) {
    // the CC0 MakeHuman mouth targets (mouthshapes.js): lips that really press for p b m, a gathered
    // pucker for oo / w, flared lips for sh ch r, thin stretched lips for ee / s, the upper lip lifted
    // off the teeth for f v sh, and the lips parted over the teeth when the jaw is only a little open
    add('mouth-compression', (0.3 * closeK + 0.55 * p.press) * ls);
    add('mouth-pursing', 0.7 * p.round * ls);
    add('mouth-protusion', 0.35 * Math.min(p.round, 2 * p.upper) * ls);
    add('mouth-retraction', 0.45 * p.spread * ls);
    add('mouth-elevation', 0.3 * p.upper * ls);
    const part = Math.min(1, Math.max(0, p.jaw) / 0.2);
    add('mouth-parling', 0.3 * part * (1 - closeK) * (1 - Math.min(1, p.round)) * ls);
  }
  add('TongueOut', 0.22 * p.th);
  add('TonguePointUp', 0.5 * p.tip * Math.min(1, 0.3 + jaw * 2));
  add('TongueUp', 0.35 * p.tip);
  return o;
}

/** Phones of a record that are 'visible' (for tests / audits): closures p b m, f v, rounding w uw. */
export const VISIBLE = { close: ['P', 'B', 'M'], fv: ['F', 'V'], round: ['W', 'UW', 'OW'] };
