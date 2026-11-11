// Engine phase 5 (engine/DESIGN.md 3.2-3.3): the AIR half of the auto-stager. Pure Node, deterministic.
//   isAir(I, sheet)                   a row on an air set (sheet.kind 'air-*') framing a flyer, a rider, or only places
//   stageAir(row, ctx, I, sel)        -> the same shape as stageShot: { entry, cast, report, end, ... }
// Flight comes from the sheet's paths on ONE scene clock (staging/flight.js formationClock: shots run on through the
// edit), the TALK formation (Charcoal 30 m to Leaf's left, 16 m ahead, 2 m lower) and the set's flight rules in
// places.json (`flight.rules`: a regex on the action -> another path + anchor, a perch / hover mark, alt, dy, how).
// Riders are ALWAYS cast with their mount (`ride: { on }`). Cameras: templates air-to-air, camera-ship, pov, pass-by,
// drone-reveal; checked by check.mjs (subjects, sides, sizes) plus the screen-direction line of the sheet and the
// long-lens horizon rule; adjusted by distance / bearing / rise / lens.
import { markPos, findPlace, placeWords, actorKey } from './intent.mjs';
import { scoreShot, adjust } from './check.mjs';
import { tanH, distFor } from './templates/common.mjs';
import { shotEnv, horizonRule } from '../../scenes/lib/director/previs-core.js';
import { headingFromYaw } from '../../scenes/lib/director/blocking.js';
import { dirOf, headingTo, angDiff, norm360, r2 } from '../../scenes/lib/director/staging/ground.js';
import { formationClock, localFrame, posAt, beatFor, shadowOf, shTrack, V } from '../../scenes/lib/director/staging/flight.js';
import { lineCues, lineTimes } from '../../scenes/lib/director/staging/talk.js';
import { airPrior } from './priors.mjs';
import * as T_a2a from './templates/air-to-air.mjs';
import * as T_ship from './templates/camera-ship.mjs';
import * as T_pov from './templates/pov.mjs';
import * as T_pass from './templates/pass-by.mjs';
import * as T_drone from './templates/drone-reveal.mjs';

export const AIR_TEMPLATES = Object.fromEntries([T_a2a, T_ship, T_pov, T_pass, T_drone].map((m) => [m.name, m]));
const CREATURE_LEN = { leaf: 9, charcoal: 22, hatchling: 0.7 };
const clone = (o) => JSON.parse(JSON.stringify(o));

/** the air facts of an intent: { creatures, riders, people } (riders: builds *_ride or a cast mount) */
/** a lens range in the row ("135-200 mm long lens") -> its middle; a single lens -> that; else null */
export function lensOf(I) {
  const m = String(I.lensRaw || '').match(/(\d+)\s*-\s*(\d+)\s*mm/);
  return m ? Math.round((+m[1] + +m[2]) / 2) : I.mm || null;
}
export function airFacts(I, castRows = []) {
  const byName = new Map(castRows.map((c) => [c.name, c]));
  const riders = I.subjects.filter((s) => s.kind === 'person' && (/_ride/.test(s.build || '') || byName.get(s.name)?.mount));
  const people = I.subjects.filter((s) => s.kind === 'person' && !riders.includes(s));
  const creatures = I.subjects.filter((s) => s.kind === 'creature');
  return { creatures: creatures.length, riders: riders.length, people: people.length, mounts: new Set(riders.map((r) => byName.get(r.name)?.mount).filter(Boolean)).size };
}
export const isAir = (I, sheet) => /^air/.test(sheet?.kind || '') && (I.air.creatures + I.air.riders > 0 || I.air.people === 0);

function arcNear(path, p) {
  let best = [Infinity, 0], s = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1e-6;
    const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / (L * L)));
    const d = Math.hypot(a[0] + dx * k - p[0], a[2] + dz * k - p[2]);
    if (d < best[0]) best = [d, s + k * L];
    s += L;
  }
  return best[1];
}

/** every flyer's cast entry for the shot: { actor: { entry, perched, heading(t), pos(t) } } */
function blockFlyers(row, I, ctx, flyers, secs) {
  const { sheet, places } = ctx;
  const F = places.flight || {};
  const text = `${row.action || ''} ${(row.in_frame || []).map((f) => `${f.name} ${f.screen_pos || ''}`).join(' ')}`;
  const rules = (F.rules || []).filter((r) => new RegExp(r.when, 'i').test(text));
  const out = {}, notes = [];
  const basePath = rules.find((r) => r.path && !r.who)?.path || F.path;
  const P0 = sheet.paths?.[basePath];
  const clockT = ctx.clock || 0;
  const flyAlong = (path, { anchor, v = F.v || V, T = clockT, at = null } = {}) => {
    const C0 = formationClock(path, { v });
    let s0 = 0, TT = T;
    if (anchor === 'start') { s0 = 0; TT = 0; } else if (anchor === 'mid') { s0 = C0.length / 2 - (v * secs) / 2; TT = 0; } else if (anchor === 'end') { s0 = C0.length - v * secs; TT = 0; } else if (at) { s0 = arcNear(path, at) - (v * secs) / 2; TT = 0; }
    const C = formationClock(path, { v, s0 });
    return { a: C.at(TT), b: C.at(TT + secs) };
  };
  const leader = flyers[0];
  // the leader on the scene path / clock; a pair partner in the TALK formation
  let lead0 = P0 ? flyAlong(P0) : null;
  for (const f of flyers) {
    const my = rules.filter((r) => r.who === f.actor);
    const prevF = ctx.prev?.flyers?.[f.actor];
    const L = f.length;
    let entry = null, perched = false;
    const r = my.find((q) => q.perch || q.hover) || null;
    if (r && (r.perch || r.hover)) {
      const m = markPos(r.perch || r.hover, sheet, places);
      if (m) {
        const face = prevF?.heading ?? lead0?.a.heading ?? 180;
        const at = [r2(m[0]), r2(m[1] + (r.hover ? r.alt ?? 20 : 0)), r2(m[2])];
        entry = { tack: true, root: [[0, at]], yawKeys: r2(face), acts: r.hover ? beatFor(f.id, 'fly') : [[0, 'crouch', { k: 0.35 }]] };
        perched = !r.hover;
      }
    }
    if (!entry && prevF?.perched && !my.length) { entry = clone(prevF.entry); perched = true; }
    if (!entry) {
      const pr = my.find((q) => q.path || q.anchor) || null;
      let seg = lead0;
      if (pr) {
        const path = sheet.paths?.[pr.path || basePath];
        const mk = pr.anchor && !['start', 'mid', 'end'].includes(pr.anchor) ? markPos(pr.anchor, sheet, places) : null;
        if (path) seg = flyAlong(path, { anchor: mk ? null : pr.anchor, at: mk, v: pr.v || F.v || V });
      }
      if (!seg) { notes.push(`${f.actor}: no flight path on this set`); continue; }
      let a = seg.a.p.slice(), b = seg.b.p.slice();
      const h = seg.a.heading;
      // the wingman: TALK formation off the leader (when it follows the leader's line)
      if (f !== leader && !pr && seg === lead0) {
        const { f: fw, l } = localFrame(h);
        const off = [l[0] * 30 + fw[0] * 16, -2, l[1] * 30 + fw[1] * 16];
        a = a.map((v, i) => v + off[i]); b = b.map((v, i) => v + off[i]);
      }
      const ru = my.find((q) => q.alt != null) || rules.find((q) => !q.who && q.alt != null);
      if (ru) { const ground = sheet.ground?.sea ?? sheet.ground?.y ?? 0; const alt = ground + ru.alt; b[1] += alt - a[1]; a[1] = alt; }
      const dy = my.reduce((s, q) => s + (q.dy || 0), 0);
      b[1] += dy;
      const how = my.find((q) => q.how)?.how || (my.some((q) => q.dy < 0) && f.id === 'charcoal' ? 'glide' : 'fly');
      entry = { tack: true, root: [[0, a.map(r2)], [r2(secs), b.map(r2), dy ? 'inOut' : 'linear']], yawKeys: r2(headingTo(a, b)), acts: beatFor(f.id, how) };
      if (f === leader && seg === lead0) lead0 = { a: { p: a, heading: h }, b: { p: b, heading: h } };
    }
    out[f.actor] = { entry, perched, heading: entry.yawKeys, L };
  }
  return { flyers: out, notes, rules };
}

export function stageAir(row, ctx, I, sel) {
  const { sheet, places } = ctx;
  const secs = I.seconds;
  const report = { id: row.id, template: sel.template, why: sel.why, score: null, tries: 0, fixes: [], flags: [], unstaged: I.unstaged.map((u) => `${u.who.join('+')}: ${u.text}`) };
  const castRows = ctx.castLock?.shots?.[row.id] || [];
  // ---- cast: every creature (framed or implied), every rider WITH its mount
  const castDefs = {}, cast = {};
  const flyers = [];
  const actorOf = (c) => (c.kind === 'creature' && !/shadow/i.test(c.name) ? actorKey(c.name) : c.kind === 'creature' ? c.build : actorKey(c.name));
  for (const c of castRows) {
    if (c.kind !== 'creature') continue;
    const a = actorOf(c);
    if (castDefs[a]) continue;
    const L = CREATURE_LEN[c.build] ?? (c.opts?.look ? 7 : 9);
    castDefs[a] = c.opts?.look ? { kind: 'creature', id: { name: a, design: c.build, look: c.opts.look }, length: L } : { kind: 'creature', id: c.build };
    flyers.push({ actor: a, id: c.build, length: L, name: c.name });
  }
  // a person keeps the intent's actor name (the shot's subjects and acts use it)
  const personKey = (c) => I.subjects.find((s) => s.kind === 'person' && s.name === c.name)?.actor || actorKey(c.name);
  for (const c of castRows) {
    if (c.kind !== 'person' && c.kind !== 'human') continue;
    const a = personKey(c);
    if (c.mount) {
      const m = actorKey(c.mount);
      if (!castDefs[m]) { castDefs[m] = { kind: 'creature', id: m }; flyers.push({ actor: m, id: m, length: CREATURE_LEN[m] ?? 9, name: c.mount }); report.fixes.push(`mount ${m} cast with its rider ${a}`); }
      // (phase 5b) the hand specs' rider form: the build the cast lock chose (its variant per the continuity flags),
      // the rider's outfit (= its role's name: abby / remi / fall) and its ROLE (lip-sync, faces), on its mount
      castDefs[a] = { kind: 'human', id: c.build, ride: { on: m }, outfit: String(c.role || a).toLowerCase().replace(/[^a-z]/g, ''), role: c.role || a.toUpperCase() };
    } else castDefs[a] = { kind: 'human', id: c.build };
    cast[a] = {};
  }
  // the framed creature leads the formation (a rider's mount when only riders are framed)
  const firstFramed = I.subjects.find((s) => s.kind === 'creature') || I.subjects.find((s) => castDefs[s.actor]?.ride);
  const leadActor = firstFramed ? (firstFramed.kind === 'creature' ? actorOf({ ...firstFramed, build: castRows.find((c) => c.name === firstFramed.name)?.build }) : castDefs[firstFramed.actor].ride.on) : null;
  // the formation's reference is Leaf (the TALK formation: Charcoal on HER left); otherwise the framed flyer leads
  flyers.sort((a, b) => (a.id === 'leaf' ? -1 : b.id === 'leaf' ? 1 : a.actor === leadActor ? -1 : b.actor === leadActor ? 1 : 0));
  const fb = blockFlyers(row, I, ctx, flyers, secs);
  for (const n of fb.notes) report.unstaged.push(n);
  for (const [a, f] of Object.entries(fb.flyers)) cast[a] = f.entry;
  // ---- people on the ground (an instructor, a lookout, Alexandria): at the mark their words name, facing the flyers
  const pw = placeWords(sheet, places);
  const leadF = fb.flyers[flyers[0]?.actor];
  const leadMid = leadF ? posAt(leadF.entry, secs / 2) : null;
  for (const s of I.subjects.filter((q) => q.kind === 'person' && !castDefs[q.actor]?.ride)) {
    const a = s.actor;
    const mk = s.place || findPlace(`${s.note || ''} ${s.name}`, pw) || findPlace(row.action, pw) || fb.rules.find((r) => r.perch)?.perch;
    const m = mk ? markPos(mk, sheet, places) : null;
    if (!m) { report.flags.push(`W_NO_POS ${s.name}`); continue; }
    const at = [r2(m[0] + (cast[a] ? 0 : 0)), r2(m[2])];
    cast[a] = { at, y: r2(m[1]), face: r2(leadMid ? headingTo(at, [leadMid[0], leadMid[2]]) : 90), ...(leadMid ? { look: `${flyers[0].actor}.chest`, lookAmount: 0.7 } : {}) };
  }
  // riders look where their words say (another rider, a place), and wave / raise a hand
  // (phase 5b) look targets the act parser left open, in the row's order: "looks at the gap, then at Remi" -> a mark of
  // this set, a person in the shot, or a RIDER of the scene off screen (the TALK formation's partner of the lead flyer)
  const lookWords = [...`${row.action || ''} ${I.subjects.map((q) => q.note || '').join(' ')}`.matchAll(/\bat (?:the )?([A-Za-z][\w'-]*(?: [a-z]+)?)/g)].map((m) => m[1]);
  const openLooks = [];
  for (const w of lookWords) {
    const who = I.subjects.find((q) => q.kind === 'person' && new RegExp(`^${q.name}\\b`, 'i').test(w));
    if (who && cast[who.actor]) { openLooks.push(`${who.actor}.head`); continue; }
    const mk = findPlace(w, pw);
    if (mk) { const m = markPos(mk, sheet, places); if (m) { openLooks.push(m.map(r2)); continue; } }
    const partner = /^(remi|abby|fall)\b/i.test(w) && leadF && flyers.length ? partnerPoint(leadF.entry, secs * 0.6, flyers[0], w) : null;
    if (partner) openLooks.push(partner);
  }
  for (let i = openLooks.length - 1; i > 0; i--) if (openLooks.slice(0, i).some((q) => JSON.stringify(q) === JSON.stringify(openLooks[i]))) openLooks.splice(i, 1);
  let li = 0;
  for (const act of I.acts) {
    const b = cast[act.who];
    if (!b || !castDefs[act.who] || castDefs[act.who].kind !== 'human') continue;
    const t = r2(Math.min(secs * 0.8, Math.max(0.2, (act.frac - 0.3) * secs)));
    if (act.kind === 'look') { const at = act.at && cast[act.at] ? `${act.at}.head` : act.to ? markPos(act.to, sheet, places)?.map(r2) : castDefs[act.who].ride ? openLooks[li++] ?? null : null; if (at) (b.acts ||= []).push([t, 'look', { at, amount: 0.8 }]); }
    else if (act.kind === 'gesture' && /wave|raiseHand|point/.test(act.act)) (b.acts ||= []).push([t, act.act, { side: /left/i.test(row.action) && act.who === 'abby' ? 'L' : 'R', in: 0.3, hold: 1.2, out: 0.4 }]);
  }
  // two riders on screen talk to each other
  const riders = Object.keys(castDefs).filter((a) => castDefs[a].ride && I.subjects.some((s) => s.actor === a));
  if (riders.length === 2) for (const [a, b] of [riders, [...riders].reverse()]) if (!cast[a].acts?.some((x) => x[1] === 'look')) (cast[a].acts ||= []).push([0, 'look', { at: `${b}.head`, amount: 0.8 }]);
  for (const b of Object.values(cast)) if (b.acts) b.acts.sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1));
  // POV: the eye's owner hidden (its mount flies on)
  const povWho = sel.template === 'pov' ? (I.subjects.find((s) => s.kind === 'person' && /eyeline|pov/i.test(`${row.lens} ${row.camera_move}`) && new RegExp(`\\b${s.name}'s\\b`, 'i').test(`${row.lens} ${row.camera_move}`)) || null) : null;
  if (povWho) cast[povWho.actor] = { ...(cast[povWho.actor] || {}), acts: [[0, 'hide'], ...((cast[povWho.actor] || {}).acts || [])] };
  // ---- the spec entry
  const sun = sheet.continuity?.[row.scene]?.sun || Object.values(sheet.continuity || {})[0]?.sun || [0.838, 0.515, 0.178];
  const times = lineTimes(row.id, I.lines, secs);
  const shadowFlyer = leadF ? posAt(leadF.entry, secs / 2) : null;
  const entry = { staging: '', cam: {}, set: {}, ...(I.lines.length ? { lines: lineCues(row.id, I.lines, secs) } : {}), cast: Object.fromEntries(Object.keys(cast).sort().map((k) => [k, cast[k]])) };
  const spec = { set: row.set, cast: Object.fromEntries(Object.keys(castDefs).sort().map((k) => [k, castDefs[k]])), previs: { ground: sheet.ground?.y ?? sheet.ground?.sea ?? 0 }, shots: { [row.id]: entry } };
  const env = shotEnv(spec, entry, sheet);
  // ---- subjects: riders' heads, creatures' chests (a close one's head), places; "X's shadow" = the shadow's point
  const subjects = [];
  for (const S of I.subjects) {
    if (povWho && S.actor === povWho.actor) continue;
    const side = S.side === 'any' ? 'any' : S.side;
    const sx = { L: -0.3, R: 0.3, LC: -0.15, RC: 0.15 }[side] ?? 0;
    if (S.kind === 'creature' && /shadow/i.test(S.name)) {
      const fl = fb.flyers[actorOf({ ...S, kind: 'creature', build: castRows.find((c) => c.name === S.name)?.build })];
      if (fl) subjects.push({ name: S.name, p: shadowOf(posAt(fl.entry, secs / 2), sun, sheet.ground?.y ?? 3), side, sx, sy: 0, sizeFree: true, w: 1 });
      continue;
    }
    if (S.kind === 'creature') {
      const a = actorOf({ ...S, build: castRows.find((c) => c.name === S.name)?.build });
      if (!fb.flyers[a]) continue;
      const part = I.size === 'CU' ? 'head' : 'chest';
      subjects.push({ name: S.name, actor: a, part: `${a}.${part}`, p: env.point(`${a}.${part}`, secs / 2)?.toArray(), side, sx, sy: 0.05, w: 1, L: fb.flyers[a].L, flyer: a });
    } else if (S.kind === 'person') {
      if (!cast[S.actor]) continue;
      const p = env.point(`${S.actor}.head`, secs / 2)?.toArray();
      if (!p) continue;
      subjects.push({ name: S.name, actor: S.actor, part: `${S.actor}.head`, p, side, sx, sy: I.size === 'CU' ? 0.12 : 0.15, w: 1, flyer: castDefs[S.actor].ride?.on || null });
    } else {
      const mk = S.place || places.aliases?.[S.name.toLowerCase()] || findPlace(S.name, pw);
      const m = mk ? markPos(mk, sheet, places) : null;
      if (!m) { report.flags.push(`W_NO_POS ${S.name}`); continue; }
      subjects.push({ name: S.name, p: m.map(r2), side, sx, sy: -0.1, w: S.side === 'any' ? 0.5 : 1, sizeFree: true });
    }
  }
  if (!subjects.length) { report.flags.push('W_NO_SUBJECT'); return null; }
  for (const s of subjects) if (s.actor && I.size !== 'CU' && I.size !== 'MS' && !castDefs[s.actor]?.ride) s.sizeFree = s.sizeFree || I.size === 'EWS';
  // the main subject: in a medium / close, the rider the action is about (named first in it); else the first flyer
  const act = String(row.action || '').toLowerCase();
  const at = (s) => { const i = act.indexOf(s.name.toLowerCase()); return i < 0 ? 1e9 : i; };
  const ridersF = subjects.filter((s) => s.actor && castDefs[s.actor]?.ride).sort((a, b) => at(a) - at(b));
  const main = ridersF.length && (I.size === 'MS' || I.size === 'CU') ? ridersF[0] : subjects.find((s) => s.actor) || subjects[0];
  // put the main subject first (the report's main for the comparison)
  subjects.sort((a, b) => (a === main ? -1 : b === main ? 1 : 0));
  const flyerOf = main.flyer || main.actor;
  const headingAt = (t) => (flyerOf && cast[flyerOf] ? norm360(headingFromYaw(env.state(flyerOf, t).yaw)) : null);
  const hMid = headingAt(secs / 2) ?? norm360(Math.atan2(sun[0], -sun[2]) * 180 / Math.PI);
  const line = sheet.lines?.[row.scene] || Object.values(sheet.lines || {})[0] || null;
  const reverse = I.move.reverse || /\breverse\b/i.test(`${row.camera_move} ${row.lens}`);
  // a pass-by / static place: the place word in the MOVE ("static inside the gap", "on a lower stack")
  const movePlace = findPlace(`${row.camera_move || ''}`, pw);
  const B = { subjects, main, hMid, sun, secs, line, reverse, flyer: flyerOf, movePlace: movePlace ? markPos(movePlace, sheet, places) : null, povWho, castDefs, env,
    groundY: sheet.ground?.y ?? sheet.ground?.sea ?? 0, air: true, facesPolicy: ctx.policy?.faces || 'avoid',
    talk: times.map((l) => ({ role: l.speaker, speech_in_s: l.from, speech_out_s: l.to })) };
  // (phase 5b) the camera prior: the nearest-matching hand-written vantage of ANOTHER shot (leave-one-out, priors.mjs)
  // only for ONE flyer group in frame (a rider with its mount counts once): the mined frame heights are measured at one
  // subject, so a pair's spread keeps the template's own recipe
  const groups = new Set(subjects.filter((q) => q.actor).map((q) => q.flyer || q.actor));
  B.prior = groups.size !== 1 ? null : airPrior(row, I, { template: sel.template, kind: main.actor && castDefs[main.actor]?.kind === 'human' ? 'human' : 'creature', mm: lensOf(I), sheet, people: I.subjects.filter((q) => q.kind === 'person').length });
  if (B.prior) report.prior = `${B.prior.from} (bearing ${Math.round(B.prior.rel)}, frame ${B.prior.fh} m)`;
  const T = AIR_TEMPLATES[sel.template];
  const P = T.params(I, B);
  const build = (Q) => {
    const e = clone(entry);
    e.cam = camFor(Q, B, I, spec);
    const shadowP = shadowFlyer ? shTrack(leadF.entry, sun, B.groundY + 3) : [r2(main.p[0]), r2(B.groundY), r2(main.p[2])];
    e.set = { shadowAt: shadowP, shadowExtent: Math.round(Math.max(40, Math.min(160, (Q.dist || 60) * 0.5))) };
    return e;
  };
  const evalP = (Q) => {
    const e = build(Q);
    spec.shots[row.id] = e;
    return scoreShot(spec, row.id, I, B, sheet);
  };
  const fbT = sel.fallbacks[0] && AIR_TEMPLATES[sel.fallbacks[0]];
  const fallback = fbT ? { name: fbT.name, P: fbT.params(I, B) } : null;
  const { best, tries, fixes } = adjust(P, evalP, I, { fallback, muts: airMutations });
  const final = build(best.P);
  final.staging = `AUTO ${fixes.some((f) => f.startsWith('fallback')) ? sel.fallbacks[0] : sel.template} ${final.cam.mm} mm ${final.cam.rig.toUpperCase()}: ${row.action}`;
  final.notes = `engine stager v${ctx.version}: ${sel.why}; score ${best.score}${fixes.length ? `; fixes: ${fixes.join(', ')}` : ''}`;
  report.score = best.score; report.tries = tries; report.fixes.push(...fixes);
  report.flags.push(...best.flags);
  if (best.score < 0.8) report.flags.push(`FLAG low score ${best.score}`);
  if (report.unstaged.length) report.flags.push(`FLAG unstaged: ${report.unstaged.length}`);
  report.checks = best.checks;
  report.subjects = subjects.map((s) => ({ name: s.name, actor: s.actor || null, side: s.side, p: s.p?.map(r2) }));
  report.cam = final.cam;
  const flyEnd = Object.fromEntries(Object.entries(fb.flyers).map(([a, f]) => [a, { perched: f.perched, entry: f.entry, heading: f.heading }]));
  return { id: row.id, entry: final, cast: spec.cast, variant: false, report, end: ctx.prev?.blocking || {}, flyers: { ...(ctx.prev?.flyers || {}), ...flyEnd }, lastPerson: ctx.prev?.lastPerson || null };
}

/** where an off-screen rider of the scene sits at time t: the TALK formation's partner of the lead flyer (Charcoal 30 m to
 *  Leaf's left, 16 m ahead, 2 m lower; Leaf 30 m to Charcoal's right, 16 m behind, 2 m higher), at its seat height */
function partnerPoint(leadEntry, t, lead, word) {
  const p = posAt(leadEntry, t), { f, l } = localFrame(leadEntry.yawKeys);
  const k = lead.id === 'leaf' ? 1 : -1, seat = /remi/i.test(word) ? 22 * 0.18 + 0.75 : 9 * 0.18 + 0.75;
  if ((lead.id === 'leaf') === /abby/i.test(word)) return null;
  return [r2(p[0] + k * (l[0] * 30 + f[0] * 16)), r2(p[1] - k * 2 + seat), r2(p[2] + k * (l[1] * 30 + f[1] * 16))];
}

/** the camera of air params Q: kind frame (the stage's framing solver, tracking), ship (keyed with the flyers), static,
 *  drone (keyed, a slow push), pov (on the eye) */
function camFor(Q, B, I, spec) {
  const S = B.subjects, secs = B.secs;
  const from = norm360(B.hMid + (Q.rel ?? 0));
  const focusName = S.find((s) => s.part)?.part || null;
  if (Q.kind === 'frame') {
    const subs = (Q.both ? S.filter((s) => s.part) : [B.main]).filter((s) => s.part).map((s) => [s.part, [r2(Q.both ? s.sx * 1.3 : s.sx || 0), r2(s.sy)]]);
    if (subs.length) return { rig: 'follow', frame: { subjects: subs, from: r2(from), dist: r2(Q.dist), rise: r2(Q.rise), track: true }, mm: Q.mm, fstop: Q.fstop, focus: subs[0][0] };
  }
  const ptAt = (s, t) => (s.part ? B.env.point(s.part, t)?.toArray() : s.p) || s.p;
  const mid = (t) => { const ps = S.filter((s) => s.w >= 1 || S.length === 1).map((s) => ptAt(s, t)); return [0, 1, 2].map((i) => ps.reduce((a, p) => a + p[i], 0) / ps.length); };
  const d = dirOf(from);
  if (Q.kind === 'pov' && B.povWho) {
    const tgt = S.find((s) => s.actor !== B.povWho.actor) || S[0];
    const ride = !!B.castDefs[B.povWho.actor]?.ride;
    return { rig: 'follow', pos: [[0, `${B.povWho.actor}.head`]], offset: [0, 0.08, 0], look: [[0, ptAt(tgt, 0).map(r2)]], mm: Q.mm, fstop: Q.fstop, focus: ptAt(tgt, 0).map(r2), ...(ride ? { shake: { kind: 'dragonback', amount: 0.12, seed: 15 } } : {}) };
  }
  if (Q.kind === 'static' && B.movePlace) {
    // (phase 5b) a STAND-OFF: never on the flyer's line at the place (it would fly through the lens). The camera stands
    // `ahead` m past the place along the flyer's heading (at least past where the flyer is at the cut, so it comes
    // TOWARD the lens), `side` m off its line, `up` m over the flyer's height at the end
    const h = dirOf(B.hMid), l = [-h[1], h[0]];
    const end = ptAt(B.main, secs);
    const along = (end[0] - B.movePlace[0]) * h[0] + (end[2] - B.movePlace[2]) * h[1];
    const ahead = Math.max(along + 6, 0) + (Q.ahead ?? 0), side = Q.side ?? 3;
    const p = [B.movePlace[0] + h[0] * ahead + l[0] * side, end[1] + (Q.up ?? 1.6), B.movePlace[2] + h[1] * ahead + l[1] * side];
    const tgt = mid(secs * 0.5);
    const near = ptAt(B.main, secs), far = ptAt(B.main, 0);
    const dist = (q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    return { rig: 'static', pos: p.map(r2), look: tgt.map(r2), mm: Q.mm, fstop: Q.fstop, focus: [[0, r2(dist(far))], [r2(secs), r2(dist(near))]] };
  }
  const camAt = (t, k = 1) => { const m = mid(t); return [m[0] + d[0] * Q.dist * k, m[1] + Q.rise * k, m[2] + d[1] * Q.dist * k]; };
  if (Q.kind === 'drone') {
    const p0 = camAt(0), m0 = mid(0), p1 = camAt(secs, 1 - (Q.push ?? 0.04));
    return { rig: 'drone', pos: [[0, p0.map(r2)], [r2(secs), p1.map(r2), 'linear']], look: [[0, m0.map(r2)], [r2(secs), mid(secs).map(r2), 'linear']], mm: Q.mm, fstop: Q.fstop, focus: r2(Q.dist) };
  }
  // ship (and the fallback of every other kind): keyed with the flyers' midpoint, a fixed offset
  return { rig: 'follow', pos: [[0, camAt(0).map(r2)], [r2(secs), camAt(secs).map(r2), 'linear']], look: [[0, mid(0).map(r2)], [r2(secs), mid(secs).map(r2), 'linear']], mm: Q.mm, fstop: Q.fstop, focus: focusName || r2(Q.dist) };
}

const LENSES = [24, 35, 50, 85, 135, 180];
/** air mutations: distance, bearing round the flyer (the line check rejects the wrong side), rise, lens */
export function airMutations(P, I) {
  const m = [];
  if (P.kind === 'pov') return m;
  if (P.kind === 'static') {
    m.push(['raise 2 m', { ...P, up: (P.up ?? 1.6) + 2 }], ['stand-off +8 m', { ...P, ahead: (P.ahead ?? 0) + 8 }], ['side +3 m', { ...P, side: (P.side ?? 3) + 3 }], ['side -3 m', { ...P, side: (P.side ?? 3) - 3 }]);
    if ((P.ahead ?? 0) >= 4) m.push(['stand-off -4 m', { ...P, ahead: P.ahead - 4 }]);
    return m;
  }
  m.push(['distance x1.2', { ...P, dist: P.dist * 1.2, rise: P.rise * 1.2 }], ['distance /1.2', { ...P, dist: P.dist / 1.2, rise: P.rise / 1.2 }]);
  for (const d of [20, -20, 40, -40]) m.push([`bearing ${d > 0 ? '+' : ''}${d}`, { ...P, rel: norm360((P.rel ?? 0) + d) }]);
  m.push(['rise +', { ...P, rise: P.rise + Math.max(1, P.dist * 0.06) }], ['rise -', { ...P, rise: P.rise - Math.max(1, P.dist * 0.06) }]);
  if (!I.mmLocked) { const i = LENSES.indexOf(P.mm); for (const j of [i - 1, i + 1]) if (i >= 0 && LENSES[j]) m.push([`lens ${LENSES[j]} mm`, { ...P, mm: LENSES[j], dist: P.dist * LENSES[j] / P.mm, rise: P.rise * LENSES[j] / P.mm }]); }
  return m;
}

/** rise (m over the subject) that meets the long-lens horizon rule at distance d with lens mm (+ a margin) */
export function riseForHorizon(d, mm, margin = 1) {
  const vfov = 2 * Math.atan((24.89 * 9 / 16) / 2 / mm) * 180 / Math.PI;
  return d * Math.tan(((vfov / 2 + 2.5 + margin) * Math.PI) / 180);
}
export { horizonRule, tanH, distFor };
