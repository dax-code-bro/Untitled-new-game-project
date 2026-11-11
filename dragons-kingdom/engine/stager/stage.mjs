// Engine phase 4 (engine/DESIGN.md 3): the AUTO-STAGER, ground v1. Pure Node, no LLM, deterministic.
//   stageShot(row, ctx) -> { id, entry (a shot spec entry, stable key order), cast ({ actor: { kind, id } }), variant,
//     report: { template, why, score, tries, fixes, flags, unstaged }, end (blocking at the cut, for continuity) }
//   stageRows(rows, ctx) -> { spec: { set, cast, shots }, reports }   (rows in shot-list order; scene continuity kept)
// ctx: { sheet, places (places.json[set]), verbs, castLock ({ shots: { id: [...] } }), policy: { faces, holdOut } }
import fs from 'node:fs';
import { intentOf, markPos } from './intent.mjs';
import { pick } from './select.mjs';
import { scoreShot, adjust, insideSolid } from './check.mjs';
import { shoot, SIDE_X, centroid, frameHAt, project } from './templates/common.mjs';
import { shotEnv } from '../../scenes/lib/director/previs-core.js';
import { headingFromYaw } from '../../scenes/lib/director/blocking.js';
import { place, walkTo, postureFor, reachTo, lookAtEvent, gesture, dirOf, headingTo, angDiff, norm360, r2, walkable, nudgeOut } from '../../scenes/lib/director/staging/ground.js';
import { lineCues, lineTimes, talkLooks, listenerActs } from '../../scenes/lib/director/staging/talk.js';
import * as T_establish from './templates/establish-wide.mjs';
import * as T_medium from './templates/medium-action.mjs';
import * as T_two from './templates/two-shot.mjs';
import * as T_close from './templates/single-close.mjs';
import * as T_ots from './templates/ots.mjs';
import * as T_insert from './templates/insert.mjs';
import * as T_crowd from './templates/crowd-reaction.mjs';
import * as T_pan from './templates/travel-pan.mjs';
import * as T_card from './templates/card.mjs';
import { airFacts, isAir, stageAir, AIR_TEMPLATES } from './air.mjs';

// v2 (phase 5): air templates, the two-shot blocking / size-band fix, the stall built during the shot
export const STAGER_VERSION = 3;
// pov on a ground set: the camera at the eye of the shot's person (the air pov template is air.mjs's)
const T_povGround = { name: 'pov', params: (I, B) => ({ ...T_establish.params(I, B), mm: I.mm || 35, vantage: false }) };
export const TEMPLATES = Object.fromEntries([T_establish, T_medium, T_two, T_close, T_ots, T_insert, T_crowd, T_pan, T_card, T_povGround].map((m) => [m.name, m]));
const HERE = new URL('.', import.meta.url);
export const loadVerbs = () => JSON.parse(fs.readFileSync(new URL('verbs.json', HERE), 'utf8'));
export const loadPlaces = (set) => JSON.parse(fs.readFileSync(new URL('places.json', HERE), 'utf8'))[set] || {};
const HEAD = 1.62;
const sunHeading = (sheet, scene) => {
  const c = sheet?.continuity?.[scene] || Object.values(sheet?.continuity || {})[0];
  return c?.sun ? r2(norm360(Math.atan2(c.sun[0], -c.sun[2]) * 180 / Math.PI)) : 180;
};
const areaCentre = (sheet) => { const a = Object.values(sheet?.areas || {})[0]; if (!a) return [0, 0, 0]; const c = centroid(a.poly.map((p) => [p[0], a.y ?? 0, p[1]])); return c; };
const homeMark = (places, role) => (places.homes?.[role] || places.homes?.[String(role).replace(/\d+$/, '')])?.mark || null;
const clone = (o) => JSON.parse(JSON.stringify(o));
const pick3 = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const CAST_KEYS = ['at', 'face', 'y', 'posture', 'legs', 'look', 'lookAmount', 'holds', 'acts'];

/** blocking for every person of the intent: { actor: block } (+ notes) */
function blockPeople(I, ctx, sun) {
  const { sheet, places } = ctx;
  const prev = ctx.prev || {};
  const people = [...I.subjects, ...I.extras].filter((s) => s.kind === 'person');
  const blocks = {}, notes = [];
  const centre = areaCentre(sheet);
  const pos3 = (n) => markPos(n, sheet, places);
  const homeOf = (role) => places.homes?.[role] || places.homes?.[String(role).replace(/\d+$/, '')] || null;
  const howFor = (mark, role) => { const h = homeOf(role); if (h && h.mark === mark) return h.how; const hw = places.how?.[mark]; return hw?.work ? 'work' : hw?.seat ? 'seat' : 'near'; };
  const sideFor = (how, mark) => {
    const p = pos3(mark);
    if (how === 'below' || how === 'on') return p ? headingTo(p, centre) : sun;
    if (how === 'near') return p ? headingTo(p, centre) : sun;
    return sun;
  };
  const talkers = new Set(I.lines.map((l) => l.actor));
  const placeAt = (p, mark, how) => {
    const b = place(pos3(mark), { how, how2: places.how?.[mark] || {}, side: sideFor(how, mark), slot: p.slot });
    if (/\babove\b/.test(p.note || '') && how !== 'on' && pos3(mark)?.[1] > 1) return place(pos3(mark), { how: 'on', side: sideFor('on', mark) });
    return b;
  };
  const first = people.find((p) => !p.extra) || people[0];
  const thing = I.subjects.find((s) => s.kind === 'element' && s.at);
  for (const p of people) {
    let b = null, why = '';
    if (p.hands && thing) { const tf = Object.entries(sheet?.marks || {}).find(([n, m]) => (m.face ?? places.how?.[n]?.face) != null && Math.hypot(m.at[0] - thing.at[0], m.at[2] - thing.at[2]) < 3);
      const q = place(thing.at, { how: 'near', how2: { near: 0.55 }, side: norm360((tf ? (tf[1].face ?? places.how?.[tf[0]]?.face) : sun) + 90) }); blocks[p.actor] = { ...q, posture: { kneel: 1, bow: 0.5 }, look: thing.at.map(r2), lookAmount: 0.8 }; p._why = `at ${thing.place} (hands)`; continue; }
    const home = homeOf(p.role);
    const vert = /\b(above|below)\b/.test(p.note || '') && home && pos3(home.mark) ? home.mark : null;
    const explicit = p.place && pos3(p.place) ? p.place : vert;
    if (explicit && !(p.extra)) { const how = /\bbelow\b/.test(p.note || '') ? 'below' : /\babove\b/.test(p.note || '') ? 'on' : howFor(explicit, p.role); b = placeAt(p, explicit, how); why = `${explicit} (${how})`; }
    else if (p !== first && talkers.has(p.actor) && talkers.has(first.actor) && !/\bacross\b/i.test(I.words)) { b = null; why = 'beside the other speaker'; }
    else if (prev.blocking?.[p.actor] && !p.bg) { b = clone(prev.blocking[p.actor]); why = 'continuity (previous shot)'; }
    else if (home && pos3(home.mark)) {
      const how = /\bbelow\b/.test(p.note || '') ? 'below' : /\babove\b/.test(p.note || '') ? 'on' : home.how;
      b = placeAt(p, home.mark, how); why = `home ${home.mark} (${how})`;
    }
    blocks[p.actor] = b; p._why = why;
  }
  // the unplaced: beside the first person, on their requested screen side (from the light side three-quarter view)
  for (const p of people) {
    if (blocks[p.actor]) continue;
    const A = blocks[first.actor] && first !== p ? blocks[first.actor] : null;
    if (!A) { const s = sheet?.areas ? Object.values(sheet.areas)[0].slotAt?.[0] : null; blocks[p.actor] = { at: s ? [s[0], s[2]] : [0, 0], face: sun }; p._why = 'area slot'; continue; }
    const f = A.face ?? sun;
    const camFrom = Math.abs(angDiff(f + 25, sun)) < Math.abs(angDiff(f - 25, sun)) ? f + 25 : f - 25;
    const d = dirOf(camFrom), rgt = [d[1], -d[0]];
    const sgn = p.side === 'L' || p.side === 'LC' ? -1 : 1;
    const gap = p.bg ? 4 : 1.25;
    const at = [r2(A.at[0] + rgt[0] * gap * sgn + d[0] * 0.25), r2(A.at[1] + rgt[1] * gap * sgn + d[1] * 0.25)];
    blocks[p.actor] = { at, face: r2(headingTo(at, A.at)) };
    p._why = `beside ${first.actor} (${p.side})`;
  }
  // ---- acts
  const secs = I.seconds;
  for (const a of I.acts) {
    const b = blocks[a.who];
    if (!b) continue;
    const t = r2(Math.min(secs * 0.8, Math.max(0.15, (a.frac - 0.3) * secs) + (a.order || 0) * 0.8));
    const toPos = a.to ? pos3(a.to) : null;
    const tgt = a.at ? `${a.at}.head` : toPos ? toPos.map(r2) : null;
    b.acts ||= [];
    switch (a.kind) {
      case 'move': {
        if (a.word === 'climb') { notes.push(`${a.who}: climb not staged (no climb cycle): already up`); break; }
        const role = people.find((p) => p.actor === a.who)?.role;
        let dest = null;
        if (toPos) { const how = howFor(a.to, role); const q = place(toPos, { how, how2: places.how?.[a.to] || {}, side: sideFor(how, a.to), slot: people.find((p) => p.actor === a.who)?.slot }); dest = q.at; }
        const here = b.at;
        if (!dest || Math.hypot(dest[0] - here[0], dest[1] - here[1]) < 0.6) {
          const d = dirOf(b.face ?? 0);
          if (a.across) { const L = Math.min(12, 1.15 * secs * 0.8); dest = [r2(here[0] + d[0] * L), r2(here[1] + d[1] * L)]; }
          else { dest = here.slice(); b.at = [r2(here[0] - d[0] * 2.5), r2(here[1] - d[1] * 2.5)]; b.acts.push(walkTo(0, dest, { speed: 0.9, face: b.face })); break; }
        }
        if (b.posture?.sit) { delete b.posture; delete b.y; delete b.legs; }
        b.legs = 'planted';
        if (!toPos && !a.across) { const d = dirOf(b.face ?? 0); dest = b.at.slice(); b.at = [r2(dest[0] - d[0] * 2.5), r2(dest[1] - d[1] * 2.5)]; b.acts.push(walkTo(0, dest, { speed: 0.9, face: b.face })); break; }
        b.acts.push(walkTo(Math.min(t, 0.3 + secs * 0.1), dest, { speed: a.act === 'run' ? 3.2 : 1.15 }));
        break;
      }
      case 'posture': {
        if (a.act === 'turn') { if (tgt) b.acts.push([t, 'turn', { to: Array.isArray(tgt) ? [tgt[0], tgt[2]] : tgt.split('.')[0], dur: 0.6 }]); break; }
        const p = postureFor(a.word) || { [a.act]: a.act === 'crouch' ? 0.6 : 1 };
        b.posture = { ...(b.posture || {}), ...p };
        if (p.kneel || p.crouch) b.look = b.look || (toPos ? toPos.map(r2) : null);
        break;
      }
      case 'look': if (tgt) b.acts.push(lookAtEvent(t, tgt)); break;
      case 'gesture': {
        if (a.act === 'reach') {
          const here = b.at, d = dirOf(b.face ?? 0);
          const low = b.posture?.kneel || b.posture?.crouch;
          const at = toPos && Math.hypot(toPos[0] - here[0], toPos[2] - here[1]) < 1.2 ? toPos.map(r2) : [r2(here[0] + d[0] * 0.5), low ? 0.25 : 1.0 + (b.y || 0) * 0.5, r2(here[1] + d[1] * 0.5)];
          b.acts.push(reachTo(t, 'R', at));
        } else b.acts.push(gesture(t, a.act, a.act === 'wave' || a.act === 'point' || a.act === 'raiseHand' ? { side: 'R' } : {}));
        break;
      }
      default: break;
    }
  }
  return { blocks, notes, people };
}

function dressing(I, ctx, blocks) {
  const { places } = ctx;
  const set = {}, fx = [];
  let variant = false;
  const text = `${I.words} ${I.subjects.map((s) => s.place || '').join(' ')}`;
  for (const r of places.dressing || []) {
    if (!new RegExp(r.when, 'i').test(text)) continue;
    const st = clone(r.set || {});
    let ok = true;
    for (const v of Object.values(st)) if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (typeof x === 'string' && x.startsWith('$')) { if (!blocks[x.slice(1)]) ok = false; else v[k] = x.slice(1); }
    if (!ok) continue;
    if (r.build) {
      // (phase 5) a thing BUILT during the shot: animate the sheet's declared state 0 -> 1 across the action
      for (const [obj, parts] of Object.entries(r.build)) {
        const decl = ctx.sheet?.state?.[obj] || '';
        if (!parts.every((k) => new RegExp(`\\b${k}\\b`).test(decl))) { ctx.unstaged?.push(`${obj}: built in the shot, but the sheet declares no ${parts.join('/')} state`); continue; }
        const S = I.seconds, k = (a, b) => [[0, 0], [r2(S * a), 0], [r2(S * b), 1]];
        const o = { ...(set[obj] || {}) };
        if (parts.includes('poles')) o.poles = [k(0.36, 0.44), k(0.36, 0.44), k(0.46, 0.54), k(0.5, 0.58)];
        if (parts.includes('bars')) o.bars = [k(0.56, 0.62), k(0.62, 0.7)];
        if (parts.includes('cloth')) o.cloth = k(0.72, 0.92);
        set[obj] = o;
        fx.built = obj;
      }
      continue;
    }
    Object.assign(set, st);
    if (r.variant) variant = true;
  }
  const props = {};
  for (const [name, pr] of Object.entries(places.props || {})) {
    if (!new RegExp(`\\b${name}\\b`, 'i').test(text) || I.restricted && name === 'none') continue;
    const who = Object.keys(blocks).find((k) => k.replace(/\d+$/, '') === pr.role.toLowerCase());
    if (!who) continue;
    const b = blocks[who];
    const d = dirOf(b.face ?? 0);
    const seated = !!b.posture?.sit;
    const pt = pr.lap ? [r2(b.at[0] + d[0] * pr.lap), r2(seated ? 0.78 + (b.y || 0) : 1.05), r2(b.at[1] + d[1] * pr.lap)]
      : [r2(b.at[0] + d[0] * 0.25), r2((seated ? 1.16 : 1.36) + (b.y || 0)), r2(b.at[1] + d[1] * 0.25)];
    b.holds = clone(pr.holds);
    b.acts ||= [];
    b.acts.unshift(pr.lap ? [0, 'handsTo', { at: pt, in: 0.01, hold: 30, out: 0.3, spread: 0.34 }] : [0, 'reach', { side: 'R', at: pt, in: 0.01, hold: 30, out: 0.3 }]);
    if (pr.fx) fx.push({ kind: pr.fx, from: 0, at: [pt[0], r2(pt[1] + 0.06), pt[2]], params: { kind: name } });
    props[name] = pt;
    if (pr.variant) variant = true;
  }
  for (const s of I.subjects) if (s.place && (places.variant?.objects || []).includes(s.place)) variant = true;
  const built = fx.built; delete fx.built;
  return { set, fx, variant, props, built };
}

export function stageShot(row, ctx = {}) {
  const sheet = ctx.sheet, places = ctx.places || {}, verbs = ctx.verbs || loadVerbs();
  const policy = ctx.policy || {};
  const I = intentOf(row, { sheet, places, verbs, cast: ctx.castLock?.shots?.[row.id] || null, lastPerson: ctx.prev?.lastPerson || null });
  // (phase 5) air: a row on an air set framing flyers / riders / only places goes to the air stager
  I.lensRaw = row.lens || '';
  I.air = airFacts(I, ctx.castLock?.shots?.[row.id] || []);
  I.airSet = /^air/.test(sheet?.kind || '') && isAir(I, sheet);
  const sel = pick(I);
  if (AIR_TEMPLATES[sel.template] && I.airSet) {
    const r = stageAir(row, { ...ctx, sheet, places, version: STAGER_VERSION }, I, sel);
    if (r) return r;
  }
  const report = { id: row.id, template: sel.template, why: sel.why, score: null, tries: 0, fixes: [], flags: [], unstaged: I.unstaged.map((u) => `${u.who.join('+')}: ${u.text}`) };
  if (sel.flag) report.flags.push(sel.flag);
  if (sel.template === 'card') return { id: row.id, entry: null, cast: {}, variant: false, report, end: ctx.prev?.blocking || {} };
  const sun = sunHeading(sheet, row.scene);
  const { blocks, notes, people } = blockPeople(I, ctx, sun);
  for (const n of notes) report.unstaged.push(n);
  // (phase 5) a TWO-SHOT frames both people at medium: two talkers placed far apart (their homes, "calls across")
  // would make it a wide with tiny people, so the free one (not seated, holding no prop) comes to ~1.4 m of the other
  if (sel.template === 'two-shot') {
    const two = I.subjects.filter((s) => s.kind === 'person' && blocks[s.actor]);
    if (two.length === 2) {
      const [a, b] = two.map((s) => blocks[s.actor]);
      const gap = Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]);
      // not across levels (a guard below a watchman's platform): that pair stays where it is
      if (gap > 3.5 && !(a.y > 0.5 || b.y > 0.5)) {
        const fixed = (q) => !!(q.posture?.sit || q.y || q.holds);
        const [mv, st] = fixed(a) && !fixed(b) ? [two[1], two[0]] : [two[0], two[1]];
        const S = blocks[st.actor], M = blocks[mv.actor];
        // the nearest free spot round the other one (not inside the fountain basin, a stall, a house)
        const h0 = headingTo(S.at, M.at);
        const free = (q) => walkable(ctx.sheet, q);
        const h = [0, 40, -40, 80, -80, 120, -120, 180].map((k) => norm360(h0 + k)).find((k) => { const dd = dirOf(k); return free([S.at[0] + dd[0] * 1.4, S.at[1] + dd[1] * 1.4]); }) ?? h0;
        const d = dirOf(h);
        M.at = [r2(S.at[0] + d[0] * 1.4), r2(S.at[1] + d[1] * 1.4)];
        M.face = r2(norm360(h + 180));
        delete M.acts; delete M.legs;
        report.fixes.push(`two-shot: ${mv.actor} brought to 1.4 m of ${st.actor} (was ${gap.toFixed(1)} m apart)`);
      }
    }
  }
  // (phase 5b) KEEP-OUT: everyone standing (not seated on a rim, not on a raised mark) is on walkable ground - outside every
  // sheet solid at body height and every water area (the fountain basin); a blocked spot (or walk target) is nudged out
  for (const [a, b] of Object.entries(blocks)) {
    if (!b?.at || b.y > 0.3 || b.posture?.sit) continue;
    const n = nudgeOut(ctx.sheet, b.at, { toward: null });
    if (n.moved) { report.fixes.push(`keep-out: ${a} moved ${n.moved} m out of ${n.what}`); b.at = n.at; }
    for (const act of b.acts || []) if (act[1] === 'walk' && act[2]?.to) { const w = nudgeOut(ctx.sheet, act[2].to, { toward: b.at }); if (w.moved) { report.fixes.push(`keep-out: ${a}'s walk target moved ${w.moved} m out of ${w.what}`); act[2].to = w.at; } }
  }
  // talk: looks, listener nods, cues
  const times = lineTimes(row.id, I.lines, I.seconds);
  const speakers = [...new Set(I.lines.map((l) => l.actor))].filter((a) => blocks[a]);
  if (speakers.length === 2) { const L = talkLooks(speakers[0], speakers[1]); for (const a of speakers) Object.assign(blocks[a], L[a]); }
  for (const a of speakers) { const ls = listenerActs(row.id, times, a); if (ls.length) (blocks[a].acts ||= []).push(...ls); }
  for (const p of people) { const b = blocks[p.actor]; if (!b.look && p.place && !speakers.includes(p.actor)) { const m = markPos(p.place, sheet, places); if (m && Math.hypot(m[0] - b.at[0], m[2] - b.at[1]) > 0.4) { b.look = [r2(m[0]), r2(Math.max(0.3, m[1])), r2(m[2])]; b.lookAmount = 0.6; } } }
  const dress = dressing(I, { ...ctx, unstaged: report.unstaged }, blocks);
  // POV (ground v1): the camera at the POV person's eye; that person hidden
  const povWho = sel.template === 'pov' ? people[0] : null;
  if (povWho) { blocks[povWho.actor].acts = [[0, 'hide']]; }
  for (const b of Object.values(blocks)) if (b.acts) b.acts.sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1));
  // ---- the spec entry (camera filled in below)
  const castDefs = {}, cast = {};
  for (const p of people) {
    castDefs[p.actor] = { kind: 'human', id: p.build || (ctx.defaultBuild?.(p.role)) || p.role.toLowerCase() };
    cast[p.actor] = pick3(blocks[p.actor], CAST_KEYS);
  }
  const shadow = {};
  const entry = { staging: '', cam: {}, set: shadow, ...(I.lines.length ? { lines: lineCues(row.id, I.lines, I.seconds) } : {}), ...(dress.fx.length ? { fx: dress.fx } : {}), ...(Object.keys(cast).length ? { cast } : {}) };
  const spec = { set: ctx.specSet || row.set, cast: castDefs, previs: { ground: sheet?.ground?.y ?? 0 }, shots: { [row.id]: entry } };
  const env = shotEnv(spec, entry, sheet);
  const secs = I.seconds;
  const groundY = sheet?.ground?.y ?? 0;
  // ---- subjects to frame: [{ name, actor?, p, s, side, w, r }]
  const subjects = [];
  const mid = secs * 0.5;
  for (const S of I.subjects) {
    if (S.kind === 'person') {
      if (povWho && S.actor === povWho.actor) continue;
      const p = S.hands ? env.point(`${S.actor}.hand.R`, mid)?.toArray() : env.point(`${S.actor}.head`, mid)?.toArray();
      if (!p) continue;
      subjects.push({ name: S.name, actor: S.actor, hands: S.hands, p, side: S.side, s: [SIDE_X[S.side] ?? 0, S.hands ? 0 : 0.3], w: S.bg ? 0.5 : 1 });
    } else {
      let p = S.at || (S.place && dress.props[S.place]) || null;
      if (!p) { if (S.place) report.flags.push(`W_NO_POS ${S.name} (${S.place})`); continue; }
      if (S.place === 'fountain' && /pillar/i.test(S.name)) p = markPos('pillar', sheet, places) || p;
      const r = sheet?.marks?.[S.place]?.r ?? 0;
      subjects.push({ name: S.name, p: p.map(r2), r, side: S.side, s: [SIDE_X[S.side] ?? 0, I.size === 'INSERT' ? 0 : -0.1], w: S.side === 'any' ? 0.5 : 1 });
    }
  }
  if (!subjects.length) {
    // nothing placeable: frame the set centre from the light side
    subjects.push({ name: 'set centre', p: areaCentre(sheet).map(r2), side: 'any', s: [0, 0], w: 1, sizeFree: true });
    report.flags.push('W_NO_SUBJECT');
  }
  if (I.size === 'WS' || I.size === 'EWS' || I.size === 'POV') for (const s of subjects) if (!s.actor) s.sizeFree = true;
  const main = subjects.find((s) => s.actor) || subjects[0];
  const anchor = centroid(subjects.map((s) => s.p), subjects.map((s) => (s === main ? 2 : s.w)));
  // extent: the subjects' spread, plus where the people go during the shot
  const pts = subjects.filter((s) => s.w >= 1 || subjects.length === 1).map((s) => s.p);
  for (const S of subjects) if (S.actor && S.w >= 1) for (const u of [0.1, 0.9]) { const q = env.point(`${S.actor}.head`, u * secs); if (q) pts.push(q.toArray()); }
  // ... and the thing a framed person works at (the stall they build): the action is in the frame
  for (const S of subjects) { const p = S.actor && people.find((q) => q.actor === S.actor); const wk = p && (p.place || homeMark(places, p.role)); const m = wk && places.how?.[wk]?.work ? markPos(wk, sheet, places) : null; if (m && S.w >= 1 && Math.hypot(m[0] - S.p[0], m[2] - S.p[2]) < 3.5) pts.push([m[0], S.p[1], m[2]]); }
  let extent = 0;
  for (const a of pts) for (const b of pts) extent = Math.max(extent, Math.hypot(a[0] - b[0], a[2] - b[2]), Math.abs(a[1] - b[1]) * 1.78);
  extent += 0.6;
  // a thing near a mark that faces somewhere (the stall's front) is seen from that side; otherwise from the light
  const pref = (() => {
    const p = main.p;
    let best = null;
    for (const [n, m] of Object.entries(sheet?.marks || {})) { const f = m.face ?? places.how?.[n]?.face; if (f == null) continue; const d = Math.hypot(m.at[0] - p[0], m.at[2] - p[2]); if (d < 3 && (!best || d < best[0])) best = [d, f]; }
    return best ? best[1] : sun;
  })();
  const mainFace = main.actor ? norm360(headingFromYaw(env.state(main.actor, mid).yaw)) : null;
  const facingFrom = mainFace == null ? pref : main.side === 'move' ? norm360(mainFace + 90) : (Math.abs(angDiff(mainFace + 25, sun)) <= Math.abs(angDiff(mainFace - 25, sun)) ? norm360(mainFace + 25) : norm360(mainFace - 25));
  let pairFrom = null, behindListener = null;
  const twoP = subjects.filter((s) => s.actor);
  if (twoP.length >= 2) {
    const [A, Bp] = [twoP.find((s) => s.side === 'L' || s.side === 'LC') || twoP[0], twoP.find((s) => s.side === 'R' || s.side === 'RC') || twoP[1]];
    const h = headingTo(A.p, Bp.p);
    let perp = null;
    for (const c of [h - 90, h + 90]) { const f = dirOf(c); const ok = (Bp.p[0] - A.p[0]) * f[1] - (Bp.p[2] - A.p[2]) * f[0] > 0; if (ok) perp = norm360(c); }
    const af = norm360(headingFromYaw(env.state(A.actor, mid).yaw));
    if (perp != null) pairFrom = norm360(perp + Math.max(-50, Math.min(50, angDiff(af, perp))));
    const lis = I.lines.length ? twoP.find((s) => s.actor !== I.lines[0].actor) : null;
    if (lis) behindListener = norm360(headingFromYaw(env.state(lis.actor, mid).yaw) + 180 + 20);
  }
  const eyeY = main.actor ? Math.max(groundY + 1.1, main.p[1] + 0.02) : groundY + 1.6;
  const B = { anchor, extent, sun, pref, facingFrom, pairFrom, behindListener, eyeY, groundY, subjects, facesPolicy: policy.faces || 'avoid',
    talk: times.map((l) => ({ role: l.speaker, speech_in_s: l.from, speech_out_s: l.to })) };
  const T = TEMPLATES[sel.template];
  let P = { ...T.params(I, B), anchor, subjects };
  if (P.headY != null) for (const s of subjects) if (s.actor) s.s[1] = P.headY;
  // explicit `from:` (a vantage, a shot id, a mark, or a bearing) / the template's vantage / the POV eye
  const holdOut = new Set([row.id, ...(policy.holdOut || [])]);
  const vantages = Object.entries(sheet?.vantages || {}).filter(([k, v]) => !holdOut.has(k) && !holdOut.has(v.from) && v.rig === 'static' && Array.isArray(v.pos));
  if (povWho) { const e = env.point(`${povWho.actor}.head`, 0)?.toArray(); if (e) { P.pos = [r2(e[0]), r2(e[1] + 0.08), r2(e[2])]; P.fstop = 8; } }
  else if (I.from != null) {
    const f = String(I.from).trim();
    const num = /^-?\d+(\.\d+)?$/.test(f.replace(/^from\s+/, '')) ? +f.replace(/^from\s+/, '') : null;
    const mk = markPos(f, sheet, places) || Object.entries(sheet?.marks || {}).find(([, m]) => (m.alias || []).includes(f.toLowerCase()))?.[1]?.at;
    if (num != null) P.from = num;
    else if (sheet?.vantages?.[f] && !holdOut.has(f)) P.pos = sheet.vantages[f].pos;
    else if (mk) {
      const near = vantages.map(([k, v]) => [k, v, Math.hypot(v.pos[0] - mk[0], v.pos[2] - mk[2])]).filter((x) => x[2] < 3).sort((a, b) => a[2] - b[2] || (a[0] < b[0] ? -1 : 1))[0];
      P.pos = near ? near[1].pos : [r2(mk[0]), r2(mk[1] + 1.6), r2(mk[2])];
      report.fixes.push(`from ${f}: ${near ? `vantage ${near[0]}` : 'the mark'}`);
    } else report.flags.push(`W_FROM unknown "${f}"`);
  } else if (P.vantage) {
    const want = P.dist;
    const cands = vantages.map(([k, v]) => {
      const d = Math.hypot(v.pos[0] - anchor[0], v.pos[2] - anchor[2]);
      const brg = headingTo(anchor, v.pos);
      const blocked = !!(sheet?.solids && subjects.some((s) => rayBlockSafe(sheet, v.pos, s.p, s.r)));
      const cost = Math.abs(angDiff(brg, P.from)) / 45 + Math.abs(Math.log(d / want)) * 4 + (blocked ? 5 : 0) + (v.pos[1] - groundY > 6 ? 2 : 0);
      return [cost, k, v];
    }).filter((c) => c[0] < 1).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    if (cands.length) { P.pos = cands[0][2].pos; report.fixes.push(`vantage ${cands[0][1]}`); }
  }
  // ---- build + check
  const build = (Q) => {
    const e = clone(entry);
    let cam;
    if (Q.pan) cam = panCam(Q, I, subjects, sheet, report);
    else { const c = shoot(Q); cam = { rig: 'static', pos: c.pos, look: c.look, mm: Q.mm, fstop: Q.fstop, focus: c.focus }; }
    e.cam = cam;
    const look = Q.pan ? Q.anchor : cam.look;
    const sa = Q.pan ? Q.anchor : (subjects.length ? anchor : look);
    const ext = Q.pan ? 46 : Math.max(4, Math.min(46, frameHAt(Math.hypot(sa[0] - cam.pos[0], sa[2] - cam.pos[2]), Q.mm) * 1.78 * 1.2));
    e.set = { shadowAt: [r2(sa[0]), 0, r2(sa[2])], shadowExtent: Math.round(ext), ...clone(dress.set) };
    return e;
  };
  const evalP = (Q) => {
    const e = build(Q);
    spec.shots[row.id] = e;
    return scoreShot(spec, row.id, I, B, sheet);
  };
  const fbT = sel.fallbacks[0] && TEMPLATES[sel.fallbacks[0]];
  const fallback = fbT ? { name: fbT.name, P: { ...fbT.params(I, B), anchor, subjects } } : null;
  const { best, tries, fixes } = adjust(P, evalP, I, { fallback });
  const final = build(best.P);
  final.staging = `AUTO ${best.P.pan ? 'travel-pan' : fixes.some((f) => f.startsWith('fallback')) ? sel.fallbacks[0] : sel.template} ${final.cam.mm} mm ${final.cam.rig.toUpperCase()}: ${row.action}`;
  final.notes = `engine stager v${STAGER_VERSION}: ${sel.why}; score ${best.score}${fixes.length ? `; fixes: ${fixes.join(', ')}` : ''}`;
  if (I.restricted) final.notes += '; RATING: no child cast in this shot';
  report.score = best.score; report.tries = tries; report.fixes.push(...fixes);
  report.flags.push(...best.flags);
  if (best.score < 0.8) report.flags.push(`FLAG low score ${best.score}`);
  if (report.unstaged.length) report.flags.push(`FLAG unstaged: ${report.unstaged.length}`);
  report.checks = best.checks;
  report.subjects = subjects.map((s) => ({ name: s.name, actor: s.actor || null, side: s.side, p: s.p }));
  report.cam = final.cam;
  // continuity: where everyone is at the cut
  const endEnv = shotEnv({ ...spec, shots: { [row.id]: final } }, final, sheet);
  const end = { ...(ctx.prev?.blocking || {}) };
  for (const p of people) {
    const st = endEnv.state(p.actor, secs);
    const b = blocks[p.actor];
    end[p.actor] = { at: [r2(st.x), r2(st.z)], face: r2(norm360(headingFromYaw(st.yaw))), ...(b.y != null && !b.acts?.some((a) => a[1] === 'walk') ? { y: b.y } : {}), ...(b.posture && !b.acts?.some((a) => a[1] === 'walk') ? { posture: b.posture } : {}), ...(b.legs ? { legs: b.legs } : {}) };
  }
  return { id: row.id, entry: final, cast: castDefs, variant: dress.variant, report, end, lastPerson: people.find((p) => !p.extra) || people[0] || ctx.prev?.lastPerson || null };
}

function rayBlockSafe(sheet, from, to, r = 0) {
  // a vantage that sees the subject: no solid between (the subject's own solid excluded by the margin)
  return !!rayBlockImpl(sheet.solids, from, to, { margin: Math.min(3, r + 0.6) });
}
import { rayBlock as rayBlockImpl } from '../../scenes/lib/director/previs-core.js';

/** travel-pan: a follow rig drifting 6 m across the set's middle, look keys through the landmarks in compass order */
function panCam(Q, I, subjects, sheet, report) {
  const els = subjects.filter((s) => !s.actor);
  const c = centroid(els.map((s) => s.p));
  const start = [r2(c[0] - 2.5), r2(Q.height), r2(c[2] + 5)];
  const end = [r2(start[0] + 5.5), start[1], r2(start[2] + 2)];
  const mid = [(start[0] + end[0]) / 2, start[1], (start[2] + end[2]) / 2];
  const brg = els.map((s) => ({ s, b: headingTo(mid, s.p) }));
  // sweep from the first listed landmark round the shorter way that visits all
  const b0 = brg[0].b;
  const cw = brg.map((x) => ({ ...x, d: norm360(x.b - b0) })).sort((a, b) => a.d - b.d);
  const ccw = brg.map((x) => ({ ...x, d: norm360(b0 - x.b) })).sort((a, b) => a.d - b.d);
  const order = cw[cw.length - 1].d <= ccw[ccw.length - 1].d ? cw : ccw;
  const sweep = order[order.length - 1].d;
  const secs = I.seconds;
  const keys = order.map((x, i) => [r2(order.length > 1 ? (secs * i) / (order.length - 1) : 0), x.s.p.map(r2)]);
  order.forEach((x, i) => { x.s.checkAt = keys[i][0]; });
  if (sweep / secs > 30) report.flags.push(`W_PAN_FAST ${Math.round(sweep / secs)} deg/s (> 30)`);
  Q.anchor = c;
  return { rig: 'follow', pos: [[0, start], [r2(secs), end, 'smooth']], look: keys, mm: Q.mm, fstop: Q.fstop, focus: 14 };
}

/** stage rows (shot-list order) into one spec; scene continuity carried from shot to shot */
export function stageRows(rows, ctx = {}) {
  const shots = {}, cast = {}, reports = [];
  let variant = false;
  const prevByScene = {};
  for (const row of rows) {
    const prev = prevByScene[row.scene] || { blocking: {}, lastPerson: null, clock: 0 };
    const r = stageShot(row, { ...ctx, prev, clock: prev.clock || 0 });
    // the scene's formation clock runs on through every shot (phase 5): seconds of the rows before this one
    prevByScene[row.scene] = { blocking: r.end, lastPerson: r.lastPerson, flyers: r.flyers || prev.flyers, clock: (prev.clock || 0) + (row.frames_at_24fps || 96) / 24 };
    reports.push(r.report);
    if (!r.entry) continue;
    shots[row.id] = r.entry;
    for (const [k, v] of Object.entries(r.cast)) cast[k] ||= v;
    variant ||= r.variant;
  }
  const sortedCast = Object.fromEntries(Object.keys(cast).sort().map((k) => [k, cast[k]]));
  return { spec: { set: variant && ctx.places?.variant?.set ? ctx.places.variant.set : rows[0]?.set, cast: sortedCast, shots }, reports, variant };
}

// ---- casting for the stager: casting.mjs on the rows, with people the shot list typed as elements ("Villagers (two,
// with a ladder)") cast as people too (the stager frames them as people)
import { castRows } from '../cast/casting.mjs';
const PERSONISH = /\b(villagers?|guards?|watchman|woman|man|people|crowd|sailors?|crew|lookouts?|farmers?)\b/i;
export function castForStaging(rows, ep, lock = null) {
  const promoted = rows.map((r) => ({ ...r, in_frame: (r.in_frame || []).map((f) => (f.kind === 'element' && PERSONISH.test(f.name.replace(/\(.*?\)/g, '')) && !/\b(stall|door|leg|corner|hands?)\b/i.test(f.name) ? { ...f, kind: 'person' } : f)) }));
  return castRows(promoted, { ep, lock });
}
