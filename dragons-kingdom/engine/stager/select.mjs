// Engine phase 4 (engine/DESIGN.md 3.2): the template decision table. pick(intent) -> { template, fallbacks, why }.
// Keyed on the size class, the move, the subject kinds and count, lines and the set kind. Air templates (air-to-air,
// camera-ship, pov, pass-by, drone-reveal) are phase 5 (engine/stager/air.mjs): rows on an air set carry I.airSet / I.air.
export const TABLE = [
  // [test, template, fallbacks, why]
  [(I) => I.render === 'black' || I.size === 'CARD', 'card', [], 'black / text card'],
  [(I) => I.move.kind === 'pan' && !I.airSet, 'travel-pan', ['establish-wide'], 'pan'],
  [(I) => I.size === 'INSERT', 'insert', ['medium-action'], 'insert / macro'],
  [(I) => I.move.kind === 'ots', 'ots', ['two-shot'], 'over the shoulder'],
  // ---- air (phase 5): rows on an air set (sheet kind air-*) framing flyers, riders, or only places (I.airSet)
  [(I) => I.size === 'POV' || I.move.kind === 'pov' || /\beyeline\b|\bpov\b/i.test(`${I.lensRaw || ''} ${I.move.raw || ''}`), 'pov', ['air-to-air'], 'POV: the camera at the eye'],
  [(I) => I.airSet && I.air.creatures + I.air.riders === 0 && I.air.people === 0, 'drone-reveal', ['camera-ship'], 'a place seen from the air, no cast'],
  [(I) => I.airSet && I.move.kind === 'static' && /\b(inside|on|at|from)\b/.test(I.move.raw || '') && I.air.creatures > 0 && I.size !== 'CU', 'pass-by', ['camera-ship'], 'a flyer passes a fixed camera at a place'],
  [(I) => I.airSet && I.size !== 'CU' && ((I.air.mounts >= 2 && I.mm >= 100) || I.air.creatures >= 2 || I.size === 'EWS' || (I.mm >= 100 && I.air.creatures + I.air.riders > 0 && I.size !== 'MS')), 'camera-ship', ['air-to-air'], 'long lens on the formation'],
  [(I) => I.airSet, 'air-to-air', ['camera-ship'], 'air-to-air on a flyer / rider'],
  [(I) => I.move.kind === 'air', 'establish-wide', [], 'air move on a ground set', 'W_AIR_GROUND'],
  [(I, n) => (I.size === 'WS' || I.size === 'EWS') && n.people >= 3 && /\b(react|turn|look up|cheer|gasp|stare|crowd)\w*/.test(I.words), 'crowd-reaction', ['establish-wide'], 'a crowd reacts'],
  [(I) => I.size === 'WS' || I.size === 'EWS', 'establish-wide', ['medium-action'], 'wide'],
  [(I, n) => I.move.kind === 'two-shot' || (n.framed === 2 && n.lines > 0 && n.sides), 'two-shot', ['medium-action'], 'two people talking'],
  [(I, n) => I.size === 'CU' && n.framed === 1, 'single-close', ['medium-action'], 'close on one'],
  [(I, n) => n.people >= 1, 'medium-action', ['establish-wide'], 'medium with people'],
  [(I) => I.size === 'MS' || I.size === 'CU', 'medium-action', ['insert'], 'medium on a thing'],
  [() => true, 'insert', ['establish-wide'], 'a thing'],
];
export function pick(I) {
  const framed = I.subjects.filter((s) => s.kind === 'person').length;
  const n = { framed, people: framed, lines: I.lines.length, sides: new Set(I.subjects.filter((s) => s.kind === 'person').map((s) => s.side)).size === 2 };
  for (const [test, template, fallbacks, why, flag] of TABLE) if (test(I, n)) return { template, fallbacks, why, ...(flag ? { flag } : {}) };
  return { template: 'establish-wide', fallbacks: [], why: 'default' };
}
