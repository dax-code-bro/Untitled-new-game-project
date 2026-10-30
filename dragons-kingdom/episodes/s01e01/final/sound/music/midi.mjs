// Minimal Standard MIDI File (type 1) writer for the episode's score data (sound/music/scores.mjs).
// A score: { tempo_bpm, ppq?, parts: [{ name, program, channel, volume, pan, reverb, chorus,
//   notes: [[beat, dur_beats, pitch, velocity], ...], cc: [[beat, controller, value], ...],
//   ramps: [[beat0, beat1, controller, v0, v1], ...] }] }
// Beats are quarter notes. Deterministic: the same score gives the same bytes.
const vlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const clamp7 = (v) => Math.max(0, Math.min(127, Math.round(v)));

function track(events) {
  // events: [tick, order, bytes]; order keeps CC/program before notes at the same tick, note-offs before note-ons
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = []; let last = 0;
  for (const [t, , bytes] of events) { out.push(...vlq(t - last), ...bytes); last = t; }
  out.push(0, 0xff, 0x2f, 0);
  return [0x4d, 0x54, 0x72, 0x6b, ...u32(out.length), ...out];
}

export function scoreToMidi(score) {
  const ppq = score.ppq || 480;
  const tick = (beat) => Math.round(beat * ppq);
  const tempo = Math.round(60e6 / score.tempo_bpm);
  // track 0: tempo, 4/4, and an 'end' marker at length_beats so the render keeps the reverb tail
  const t0 = [[0, 0, [0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255]], [0, 0, [0xff, 0x58, 4, 4, 2, 24, 8]]];
  if (score.length_beats) t0.push([tick(score.length_beats), 9, [0xff, 0x06, 3, 0x65, 0x6e, 0x64]]);
  const tracks = [track(t0)];
  for (const p of score.parts) {
    const ch = p.channel & 15, ev = [];
    ev.push([0, 0, [0xc0 | ch, p.program & 127]]);
    for (const [c, v] of [[7, p.volume ?? 100], [10, p.pan ?? 64], [91, p.reverb ?? 60], [93, p.chorus ?? 0], [11, p.expression ?? 127]]) ev.push([0, 1, [0xb0 | ch, c, clamp7(v)]]);
    for (const [b, c, v] of p.cc || []) ev.push([tick(b), 2, [0xb0 | ch, c, clamp7(v)]]);
    // ramps: one CC step per 1/16 beat
    for (const [b0, b1, c, v0, v1] of p.ramps || []) {
      const n = Math.max(1, Math.round((b1 - b0) * 16));
      let prev = -1;
      for (let i = 0; i <= n; i++) { const v = clamp7(v0 + (v1 - v0) * (i / n)); if (v !== prev) ev.push([tick(b0 + (b1 - b0) * i / n), 2, [0xb0 | ch, c, v]]); prev = v; }
    }
    for (const [b, d, pitch, vel] of p.notes || []) {
      ev.push([tick(b), 4, [0x90 | ch, pitch & 127, clamp7(vel)]]);
      ev.push([tick(b + d), 3, [0x80 | ch, pitch & 127, 0]]);
    }
    tracks.push(track(ev));
  }
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, (tracks.length >> 8) & 255, tracks.length & 255, (ppq >> 8) & 255, ppq & 255];
  return Buffer.from([...head, ...tracks.flat()]);
}

// length of a score in beats (last note end or ramp end)
export function scoreBeats(score) {
  let end = score.length_beats || 0;
  for (const p of score.parts) {
    for (const [b, d] of p.notes || []) end = Math.max(end, b + d);
    for (const r of p.ramps || []) end = Math.max(end, r[1]);
  }
  return end;
}
