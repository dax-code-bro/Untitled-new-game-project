// Engine phase 4 (engine/DESIGN.md 3.6): the framing CHECK and the ADJUST loop, on previs-core (no render).
//   scoreShot(spec, id, I, B, sheet) -> { score, checks, flags }   checks at u = 0.15 / 0.5 / 0.85 of the shot (a pan's
//     landmarks at their own key times): every requested subject in frame, on its side, not occluded (sheet solids /
//     other heads), its frame height at the subject in the mined band of the size class; the camera above the ground
//     and outside every solid. Speaking faces under faces policy 'avoid' are flagged (not scored).
//   adjust(P0, evalP, opts) -> { best, tries, fixes }: at most 12 tries, keeping the best: distance x/÷ 1.2, rotate
//     `from` +-20/40/60, raise 0.5 m, step the lens 35 <-> 50 <-> 85 (unless locked), leave a vantage, fallback.
import fs from 'node:fs';
import { measure, rayBlock, horizonRule } from '../../scenes/lib/director/previs-core.js';
import { project, frameHAt } from './templates/common.mjs';
import { headingFromYaw } from '../../scenes/lib/director/blocking.js';
import { headingTo, norm360 } from '../../scenes/lib/director/staging/ground.js';

/** (phase 5) a camera on the WRONG side of a sheet's screen-direction line: line { travel: 'heading', camSide, tol }
 *  is the flyer's own heading (camera right of travel: relative bearing 0..180). -> { ok, rel } */
export function lineSide(line, flyerPos, flyerHeading, camPos, reverse = false) {
  if (!line || flyerHeading == null) return { ok: true, rel: null };
  const rel = norm360(headingTo(flyerPos, camPos) - flyerHeading), tol = line.tol ?? 25;
  const wrong = line.camSide === 'left' ? rel > tol && rel < 180 - tol : rel > 180 + tol && rel < 360 - tol;
  return { ok: !wrong || reverse, rel: Math.round(rel) };
}
/** (phase 5) a person's height as a fraction of the frame height at them (the size-band floor of a medium / two-shot) */
export const personFrac = (headY, groundY, fh) => Math.min(1.74, headY - groundY + 0.12) / Math.max(fh, 1e-3);

const MINED = JSON.parse(fs.readFileSync(new URL('./templates.mined.json', import.meta.url), 'utf8'));
/** frame height (m) at the subject: [lo, hi] per size class (mined p10 / p90, widened x1.3) */
export const BAND = Object.fromEntries(Object.entries(MINED.by_size).map(([k, v]) => [k, v.bands?.frame_h_m ? [v.bands.frame_h_m.p10 / 1.3, v.bands.frame_h_m.p90 * 1.3] : [0, 1e9]]));
BAND.POV = [0, 1e9];
const SIDE_OK = { L: (x) => x < 0.05, R: (x) => x > -0.05, LC: (x) => x < 0.3, RC: (x) => x > -0.3, C: (x) => Math.abs(x) < 0.55, move: () => true, any: () => true };
export const sideOk = (side, x) => (SIDE_OK[side] || SIDE_OK.any)(x);

export function insideSolid(sheet, p) {
  for (const s of sheet?.solids || []) {
    const y0 = s.y0 ?? 0;
    if (p[1] < y0 || p[1] > y0 + s.h) continue;
    const hit = rayBlock([s], [p[0] - 0.01, p[1], p[2] - 0.01], [p[0] + 0.01, p[1], p[2] + 0.01], { margin: 0 });
    if (hit) return s.what || 'solid';
  }
  return null;
}

/** how far (m, horizontal) a point is outside every area polygon of the sheet (0 inside one; 0 without areas) */
function outside(sheet, p) {
  const polys = Object.values(sheet?.areas || {}).map((a) => a.poly);
  if (!polys.length) return 0;
  let best = Infinity;
  for (const poly of polys) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > p[2]) !== (zj > p[2]) && p[0] < ((xj - xi) * (p[2] - zi)) / (zj - zi) + xi) inside = !inside; }
    if (inside) return 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, az] = poly[j], [bx, bz] = poly[i], dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[2] - az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(p[0] - ax - t * dx, p[2] - az - t * dz));
    }
  }
  return best;
}
export function scoreShot(spec, id, I, B, sheet) {
  const secs = I.frames / 24;
  const row = { job: id, frames: I.frames, dialogue: B.talk || [] };
  const checks = [], flags = [];
  const cam0 = spec.shots[id].cam;
  const times = [0.15, 0.5, 0.85];
  let pen = 1;
  const r0 = measure(spec, id, secs * 0.5, { row, sheet });
  if (r0.skip) return { score: 0, checks, flags: [`E_PREVIS ${r0.skip}`] };
  const camP = r0.cam.pos.toArray();
  const inside = insideSolid(sheet, camP);
  if (inside) { pen *= 0.3; flags.push(`camera inside ${inside}`); }
  if (camP[1] < B.groundY + 0.15) { pen *= 0.3; flags.push('camera below the ground'); }
  const out = B.air ? 0 : outside(sheet, camP);
  if (out > 6) { pen *= 0.5; flags.push(`camera ${Math.round(out)} m outside the set's areas`); }
  // (phase 5) the long-lens horizon rule and the screen-direction line (air shots)
  if (B.air) {
    const hz = horizonRule(r0.cam);
    if (!hz.ok) { pen *= 0.5; flags.push(`W_HORIZON depression ${hz.depression} < ${hz.need} deg (${r0.cam.mm} mm)`); }
    const fa = B.flyer && r0.actors.find((q) => q.name === B.flyer);
    if (fa && B.line) {
      const ls = lineSide(B.line, fa.head.toArray(), norm360(headingFromYaw(fa.yaw)), camP, B.reverse);
      if (!ls.ok) { pen *= 0.35; flags.push(`W_LINE camera ${ls.rel} deg off the flyer's heading: wrong side of the line`); }
    }
  }
  // (phase 5) a medium / two-shot whose people fill under ~25 % of the frame height is a wide: it fails
  const tight = (I.size === 'MS' || I.size === 'CU' || I.move.kind === 'two-shot') && !B.air;
  let small = 0, worstFrac = 1;
  const occl = [];
  for (const S of B.subjects) {
    const ts = S.checkAt != null ? [S.checkAt / secs] : times;
    for (const u of ts) {
      const t = Math.min(secs - 0.01, Math.max(0, u * secs));
      const r = Math.abs(u - 0.5) < 1e-9 ? r0 : measure(spec, id, t, { row, sheet });
      if (r.skip) continue;
      const cam = { pos: r.cam.pos.toArray(), look: r.cam.look.toArray(), mm: r.cam.mm };
      let x, y, inFrame, visible, dist, speaking = false, reads = false;
      if (S.actor) {
        const a = r.actors.find((q) => q.name === S.actor);
        if (!a) { if (S.hidden) continue; checks.push({ name: S.name, t, inFrame: false, side: false, visible: false, size: false, s: 0 }); continue; }
        ({ x, y, inFrame } = a); dist = a.dist; visible = !a.hiddenBy && (a.visibleFrac ?? 1) >= 0.5; speaking = a.speaking; reads = a.reads;
        // (phase 5b) more than half of a requested subject's sample points (head, chest, hips; a creature's wing tips)
        // behind sheet solids at any sample time is a HARD fail, not a 0.2 deduction
        if ((a.visibleFrac ?? 1) < 0.5 && !S.hands) { occl.push(`${S.name} ${Math.round((1 - (a.visibleFrac ?? 1)) * 100)} % behind ${a.occludedBy || 'a solid'} at ${t.toFixed(1)} s`); }
        if (S.hands) { const pp = project(cam, S.p); x = pp.x; y = pp.y; inFrame = pp.z > 0 && Math.abs(x) <= 1 && Math.abs(y) <= 1; dist = pp.z; }
      } else {
        const pp = project(cam, S.p);
        x = pp.x; y = pp.y; dist = pp.z; inFrame = pp.z > 0 && Math.abs(x) <= 1 && Math.abs(y) <= 1;
        visible = !rayBlock(sheet?.solids || [], cam.pos, S.p, { margin: Math.min(3, (S.r ?? 0) + 0.6) });
      }
      const fh = frameHAt(Math.max(dist, 0.01), cam.mm);
      const band = BAND[I.size] || [0, 1e9];
      let size = S.sizeFree || (fh >= band[0] && fh <= band[1]);
      if (tight && S.actor && !S.hands && Math.abs(u - 0.5) < 1e-9) { const a = r.actors.find((q) => q.name === S.actor); const pf = a ? personFrac(a.head.y, B.groundY, fh) : 1; if (pf < 0.25) { size = false; small++; worstFrac = Math.min(worstFrac, pf); } }
      const side = inFrame && sideOk(S.side, x);
      const s = (inFrame ? 0.4 : 0) + (side ? 0.25 : 0) + (visible ? 0.2 : 0) + (size ? 0.15 : 0);
      checks.push({ name: S.name, t: +t.toFixed(2), x: +x.toFixed(2), y: +y.toFixed(2), inFrame, side, visible, size, fh: +fh.toFixed(2), s: +s.toFixed(2), speaking, reads });
    }
  }
  // graded, so the adjust loop can climb toward the band (a person at 18 % scores 0.52, at 23 % 0.85)
  if (small) { pen *= Math.max(0.4, worstFrac / 0.25) ** 2; flags.push(`W_SIZE ${small} person(s) under 25 % of the frame height in a ${I.move.kind === 'two-shot' ? 'two-shot' : I.size} (smallest ${Math.round(worstFrac * 100)} %)`); }
  if (occl.length) { pen *= 0.25; flags.push(`W_OCCLUDED ${occl[0]}${occl.length > 1 ? ` (+${occl.length - 1})` : ''}`); }
  if (B.facesPolicy === 'avoid' && checks.some((c) => c.speaking && c.reads)) flags.push('FACE: a speaking face reads (faces policy avoid)');
  const score = checks.length ? (checks.reduce((a, c) => a + c.s, 0) / checks.length) * pen : 0.5 * pen;
  return { score: +score.toFixed(3), checks, flags, cam: cam0 };
}

const LENSES = [35, 50, 85];
export function mutations(P, I) {
  const m = [];
  if (P.pos) m.push(['leave the vantage', { ...P, pos: null }]);
  if (!P.pos && !P.pan) {
    m.push(['distance x1.2', { ...P, dist: P.dist * 1.2 }], ['distance /1.2', { ...P, dist: P.dist / 1.2 }]);
    for (const d of [20, -20, 40, -40, 60, -60]) m.push([`from ${d > 0 ? '+' : ''}${d}`, { ...P, from: (P.from + d + 360) % 360 }]);
    m.push(['raise 0.5 m', { ...P, height: P.height + 0.5 }]);
    if (!I.mmLocked) { const i = LENSES.indexOf(P.mm); for (const j of [i - 1, i + 1]) if (i >= 0 && LENSES[j]) m.push([`lens ${LENSES[j]} mm`, { ...P, mm: LENSES[j], dist: P.dist * LENSES[j] / P.mm }]); }
  }
  return m;
}
/** greedy: try each mutation of the current best (<= maxTries evaluations), keep improvements */
export function adjust(P0, evalP, I, { maxTries = 12, good = 0.97, fallback = null, muts = mutations } = {}) {
  let best = { P: P0, ...evalP(P0) };
  const fixes = [];
  let tries = 1;
  let improved = true;
  // steepest ascent: every mutation of the current best is tried (within the budget), the best one kept
  while (improved && tries < maxTries && best.score < good) {
    improved = false;
    let round = null;
    for (const [what, P] of muts(best.P, I)) {
      if (tries >= maxTries) break;
      tries++;
      const r = evalP(P);
      if (r.score > (round ? round.score : best.score) + 0.005) round = { P, ...r, what };
    }
    if (round) { const { what, ...b } = round; best = b; fixes.push(what); improved = true; }
  }
  if (best.score < 0.75 && fallback && tries < maxTries) {
    tries++;
    const r = evalP(fallback.P);
    if (r.score > best.score + 0.005) { best = { P: fallback.P, ...r }; fixes.push(`fallback ${fallback.name}`); climb(); }
  }
  return { best, tries, fixes };
  // (phase 5b) the same steepest ascent from the fallback with the tries left (an occluded fallback walks clear)
  function climb() {
    let up = true;
    while (up && tries < maxTries && best.score < good) {
      up = false;
      let round = null;
      for (const [what, P] of muts(best.P, I)) {
        if (tries >= maxTries) break;
        tries++;
        const r = evalP(P);
        if (r.score > (round ? round.score : best.score) + 0.005) round = { P, ...r, what };
      }
      if (round) { const { what, ...b } = round; best = b; fixes.push(what); up = true; }
    }
  }
}
