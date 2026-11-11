// Engine phase 5b (engine/DESIGN.md 3.2 / 3.4): CAMERA PRIORS from the hand-written cameras of OTHER shots.
// Every hand-written camera is a named vantage of its set's sheet (sheet.vantages[<shot id>]); templates.mined.json holds
// the same cameras measured against their subject (bearing relative to its facing, frame height at it). An air row whose
// template is air-to-air or camera-ship starts its search from the nearest-matching vantage's relative bearing and frame
// height, instead of the template's fixed recipe.
//   airPrior(row, I, { template, kind, mm, sheets }) -> { from, rel, fh, mm, score } | null
// LEAVE-ONE-OUT: the vantage of the row being staged is never a candidate (no peeking at its own hand spec).
// Match (all required): an air set, the same size class, the same subject kind (a rider / person vs a creature), a mined
// template of the air family. Ranked by: a lens within x1.5 (+3: the lens is the shot class), the same set (+2), the same
// number of people framed (+2), the same sequence (X6 / X4 / 1C, +1), the same template (+1); ties: the nearer lens,
// then the id (deterministic).
import fs from 'node:fs';

const MINED = JSON.parse(fs.readFileSync(new URL('./templates.mined.json', import.meta.url), 'utf8'));
const AIR_T = new Set(['air-to-air', 'camera-ship']);
const seqOf = (id) => String(id).split('-')[0];

/** the sheets' vantage names per set (a candidate must be a vantage of its sheet) */
export function vantageIndex(sheets) {
  const idx = new Map();
  for (const sh of sheets) for (const v of Object.keys(sh?.vantages || {})) idx.set(v, sh.set);
  return idx;
}

export function airPrior(row, I, { template, kind, mm, sheet, people = null, vantages = null }) {
  if (!AIR_T.has(template)) return null;
  const cands = [];
  for (const s of MINED.shots) {
    if (s.id === row.id || !s.measured || !AIR_T.has(s.template)) continue;      // leave-one-out
    if (vantages && !vantages.has(s.id) && s.set !== sheet?.set) continue;
    if (sheet && s.set === sheet.set && !sheet.vantages?.[s.id]) continue;
    const a = s.at?.[1];
    if (!a || a.bearing_rel == null || !a.frame_h_m || !a.subject_visible) continue;
    if (s.size_class !== I.size || s.subject_kind !== kind) continue;
    const lens = a.mm ?? s.mm;
    let score = 0;
    if (mm && lens && Math.abs(Math.log(lens / mm)) < Math.log(1.5)) score += 3;
    if (s.set === row.set) score += 2;
    if (people != null && s.humans_in_frame === people) score += 2;
    if (seqOf(s.id) === seqOf(row.id)) score += 1;
    if (s.template === template) score += 1;
    cands.push({ from: s.id, rel: ((a.bearing_rel % 360) + 360) % 360, fh: a.frame_h_m, mm: lens, score, dl: mm && lens ? Math.abs(Math.log(lens / mm)) : 9 });
  }
  if (!cands.length) return null;
  cands.sort((p, q) => q.score - p.score || p.dl - q.dl || (p.from < q.from ? -1 : 1));
  const { dl, ...best } = cands[0];
  return best;
}
