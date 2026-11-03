#!/usr/bin/env node
// Spot-effects stem for a draft cut: reads the spot sheet fx/spots.json (events keyed to EDL shot ids), synthesises
// every event (fx/synth.mjs), places it on the cut timeline, pans it, ducks it under the speech windows, sends it
// through the reverb of its space, and writes one 48 kHz float stereo WAV. Deterministic (seeded, no I/O but the WAV).
//
//   node episodes/s01e01/final/sound/fx/fx.mjs [--cut PROLOGUE-TITLE-1A] [--out F.wav]   # the stem alone (no ducking)
//   import { renderFxStem } from './fx/fx.mjs'   # used by sound/mix.mjs (with the speech windows)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSound, rng, SR } from './synth.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SPOTS_FILE = path.join(HERE, 'spots.json');

// Freeverb-style reverb (8 damped combs + 4 allpasses per channel), in place on L/R. Cheap and deterministic.
// `echoes`: optional discrete reflections [[delay_ms, gain_db, lowpass_hz], ...] off a near hard surface (s7: Leaf's beats
// off the harbour wall in X4-02), added from the dry signal, right channel 7 ms later for width
function echoes(L, R, list) {
  const dl = Float32Array.from(L), dr = Float32Array.from(R);
  for (const [ms, db, lp = 3000] of list) {
    const o = Math.round(ms / 1000 * SR), or = o + Math.round(0.007 * SR), g = Math.pow(10, db / 20), a = Math.exp(-2 * Math.PI * lp / SR);
    let yl = 0, yr = 0;
    for (let k = 0; k < L.length; k++) {
      yl = (1 - a) * (k >= o ? dl[k - o] : 0) + a * yl; yr = (1 - a) * (k >= or ? dr[k - or] : 0) + a * yr;
      L[k] += g * yl; R[k] += g * yr;
    }
  }
}
function reverb(L, R, { room, damp, wet, predelay_ms = 0, echoes: ech }) {
  if (ech) echoes(L, R, ech);
  const sc = SR / 44100, combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225];
  const fb = room, pd = Math.round(predelay_ms / 1000 * SR);
  // one tight pass per filter (combs in parallel into y, then the allpasses in series)
  const run = (x, spread) => {
    const n = x.length, y = new Float32Array(n);
    for (const d of combs) {
      const len = Math.round((d + spread) * sc), cb = new Float32Array(len);
      let ci = 0, st = 0;
      for (let k = 0; k < n; k++) {
        const o = cb[ci]; st = o * (1 - damp) + st * damp;
        cb[ci] = (k >= pd ? x[k - pd] : 0) * 0.015 + st * fb + 1e-18; // +1e-18: no denormals in the tails if (++ci >= len) ci = 0; y[k] += o;
      }
    }
    for (const d of aps) {
      const len = Math.round((d + spread) * sc), ab = new Float32Array(len);
      let ai = 0;
      for (let k = 0; k < n; k++) { const o = ab[ai], v = y[k]; ab[ai] = v + o * 0.5; y[k] = o - v; if (++ai >= len) ai = 0; }
    }
    return y;
  };
  const wl = run(L, 0), wr = run(R, 23);
  for (let k = 0; k < L.length; k++) { L[k] += wet * wl[k]; R[k] += wet * wr[k]; }
}

// spots: the spot sheet; edl: the director's EDL; speech: merged [from_s, to_s] windows (ducking); dur: cut length
export function renderFxStem({ spots = JSON.parse(fs.readFileSync(SPOTS_FILE, 'utf8')), edl, speech = [], out }) {
  const FPS = edl.fps || 24, DUR = edl.frames / FPS, n = Math.round(DUR * SR);
  const shot = Object.fromEntries(edl.shots.map((s) => [s.job, s]));
  const D = spots.defaults || {};
  // duck curve 0..1 (same shape as the beds: 0.2 s attack before, 0.35 s release after each window)
  const duckW = new Float32Array(n);
  for (const [a, b] of speech) {
    const i0 = Math.max(0, Math.floor((a - 0.2) * SR)), i1 = Math.min(n, Math.ceil((b + 0.35) * SR));
    for (let i = i0; i < i1; i++) { const t = i / SR; duckW[i] = Math.min(1, duckW[i] + Math.min(1, (t - a + 0.2) / 0.2, (b + 0.35 - t) / 0.35)); }
  }
  const buses = {}; // space -> {L, R}
  const placed = [], skipped = [];
  spots.events.forEach((ev, ei) => {
    const s = shot[ev.shot];
    if (!s) { skipped.push(`${ev.shot} ${ev.sound}`); return; }
    const space = ev.space || (spots.space_of_set || {})[s.set] || D.space || 'open';
    if (!spots.spaces[space]) throw new Error(`fx event ${ei}: space "${space}" not in spots.json spaces`);
    const bus = buses[space] || (buses[space] = { L: new Float32Array(n), R: new Float32Array(n) });
    const rep = ev.repeat || { n: 1, every_s: 0 };
    const jr = rng((ev.seed ?? ei) * 7919 + 17);
    for (let k = 0; k < rep.n; k++) {
      const u = rep.n > 1 ? k / (rep.n - 1) : 0;
      const t0 = s.rec_in / FPS + ev.at + k * (rep.every_s || 0) + (rep.jitter_s || 0) * (2 * jr() - 1);
      const params = { ...(ev.params || {}), ...((rep.alt && rep.alt[k % rep.alt.length]) || {}) };
      const x = renderSound(ev.sound, (ev.seed ?? ei) * 1000 + k, params);
      const gdb = (ev.gain_db ?? D.gain_db ?? -24) + ((ev.gain_to_db ?? ev.gain_db ?? D.gain_db ?? -24) - (ev.gain_db ?? D.gain_db ?? -24)) * u + (rep.vary_db || 0) * (2 * jr() - 1);
      const g = Math.pow(10, (gdb + (D.stem_gain_db || 0)) / 20); // stem_gain_db: one knob for the whole fx level
      const p0 = ev.pan ?? 0, p1 = ev.pan_to ?? p0, pan = p0 + (p1 - p0) * u;
      const pe = rep.n > 1 ? 0 : (p1 - p0); // a single event pans across its own length
      const dk = 1 - Math.pow(10, -(ev.duck_db ?? D.duck_db ?? 3) / 20);
      const o = Math.round(t0 * SR);
      for (let i = 0; i < x.length; i++) {
        const j = o + i; if (j < 0 || j >= n) continue;
        const pp = Math.max(-1, Math.min(1, pan + pe * i / x.length)), a = (pp + 1) * Math.PI / 4;
        const v = x[i] * g * (1 - dk * duckW[j]);
        bus.L[j] += v * Math.cos(a) * Math.SQRT2; bus.R[j] += v * Math.sin(a) * Math.SQRT2;
      }
      placed.push({ t_s: Math.round(t0 * 1000) / 1000, shot: ev.shot, sound: ev.sound, gain_db: Math.round(gdb * 10) / 10, pan: Math.round(pan * 100) / 100, space });
    }
  });
  const L = new Float32Array(n), R = new Float32Array(n);
  for (const [space, b] of Object.entries(buses).sort()) {
    reverb(b.L, b.R, spots.spaces[space]);
    for (let i = 0; i < n; i++) { L[i] += b.L[i]; R[i] += b.R[i]; }
  }
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  if (out) writeWavF32(out, L, R);
  return { events: placed, skipped, peak_dbfs: peak > 0 ? Math.round(2000 * Math.log10(peak)) / 100 : null, spaces: Object.keys(buses).sort() };
}

export function writeWavF32(file, L, R) {
  const n = L.length, b = Buffer.alloc(44 + n * 8);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 8, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 8, 28); b.writeUInt16LE(8, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(n * 8, 40);
  const f = new Float32Array(n * 2); for (let i = 0; i < n; i++) { f[2 * i] = L[i]; f[2 * i + 1] = R[i]; }
  Buffer.from(f.buffer).copy(b, 44);
  fs.writeFileSync(file, b);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const cut = opt('--cut', 'PROLOGUE-TITLE-1A'), suf = cut === 'PROLOGUE-TITLE-1A' ? '' : `-${cut}`;
  const edl = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'cut', `edl${suf}.json`), 'utf8'));
  const out = path.resolve(opt('--out', `fx-${cut}.wav`));
  const r = renderFxStem({ edl, out });
  console.log(`${out}: ${r.events.length} events, peak ${r.peak_dbfs} dBFS, spaces ${r.spaces.join(', ')}${r.skipped.length ? `; not in cut: ${r.skipped.length}` : ''}`);
}
