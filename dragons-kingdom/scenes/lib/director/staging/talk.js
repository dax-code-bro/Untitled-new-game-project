// Shot director - TALK helpers (pure JS: Node and browser). Engine phase 4 (engine/DESIGN.md 3.3): line gaps,
// speakers looking at each other, listeners' nods and head shakes. Deterministic: the "random" gaps come from a hash
// of the shot id and the line id.
//
//   lineCues(shotId, lines)          -> spec `lines` [['L001', 0.55], ['L002', 0.22], ...]
//   lineTimes(shotId, lines)         -> [{ id, speaker, from, to }] estimated shot times (spoken_s of the row)
//   talkLooks(a, b)                  -> { [a]: { look: 'b.head', lookAmount }, [b]: {...} }
//   listenerActs(shotId, lines, who) -> acts of `who` (a listener): a nod (or a head shake on a 'no') after lines
export function hash01(...v) {
  let h = 2166136261;
  for (const c of v.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return (h % 10007) / 10007;
}
const r2 = (x) => Math.round(x * 100) / 100;
/** first line 0.3-0.8 s into the shot, then 0.15-0.3 s between lines */
export function lineCues(shotId, lines = [], secs = null) {
  const cues = lines.map((l, i) => [l.id, r2(i === 0 ? 0.3 + 0.5 * hash01(shotId, l.id) : 0.15 + 0.15 * hash01(shotId, l.id))]);
  // a shot too short for the hashed gaps: the shortest gaps (first 0.3 s, then 0.15 s), keeping 0.35 s of tail
  const need = cues.reduce((a, c) => a + c[1], 0) + lines.reduce((a, l) => a + (l.spoken_s ?? 1.2), 0) + 0.35;
  if (secs != null && need > secs) return lines.map((l, i) => [l.id, i === 0 ? 0.3 : 0.15]);
  return cues;
}
export function lineTimes(shotId, lines = [], secs = null) {
  const cues = lineCues(shotId, lines, secs);
  let t = 0;
  return lines.map((l, i) => { const from = t + cues[i][1]; const to = from + (l.spoken_s ?? 1.2); t = to; return { id: l.id, speaker: l.speaker, actor: l.actor, from: r2(from), to: r2(to), text: l.text || '' }; });
}
export function talkLooks(a, b, amount = [0.8, 0.7]) {
  return { [a]: { look: `${b}.head`, lookAmount: amount[0] }, [b]: { look: `${a}.head`, lookAmount: amount[1] } };
}
const NO = /\b(no|not|never|won't|can't|don't|nothing)\b/i;
export function listenerActs(shotId, times, who) {
  const acts = [];
  for (const l of times) {
    if (l.actor === who || !l.actor) continue;
    if (hash01(shotId, l.id, who) < 0.35) continue;                       // not after every line
    acts.push([r2(l.to + 0.1), NO.test(l.text) ? 'headShake' : 'nod', { in: 0.2, hold: 0.3, out: 0.2 }]);
  }
  return acts;
}
