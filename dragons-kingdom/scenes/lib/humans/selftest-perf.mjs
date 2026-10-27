#!/usr/bin/env node
// Self-test of the performance layer (no browser): node scenes/lib/humans/selftest-perf.mjs
//   lip-sync   every p / b / m of every take closes the lips (>= 0.95 at the phone centre), every w /
//              uw rounds them, articulators finite; the delivery-note rules on known traps
//   body       (needs the character caches) a walk + run keep stance feet planted (slip < 1 mm) and
//              reached (IK error < 1.5 cm); the pose at t does not depend on frames posed before it;
//              kneel / fall / cradle stay finite
//   crowd      the bake is deterministic, finite, people keep >= 0.5 m apart
//   director   directorFace() poses a face from placed lines
//   shapes     the sculpted mouth shapes (sidecar) attach as morphs and the lip-sync drives them
// Exit code 0 = all passed.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
globalThis.self = globalThis;
globalThis.document = globalThis.document || { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {}, set src(v) {}, getContext: () => null }), createElement: () => ({ getContext: () => null, style: {} }) };
const THREE = await import(pathToFileURL(path.join(ROOT, 'node_modules/three/build/three.module.js')).href);
const { prepareLine, lipAt, visemeUnits } = await import('./visemes.js');
const { emotionFromDelivery, emotionUnits } = await import('./expressions.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

// ---------------------------------------------------------------- lip-sync
const doc = JSON.parse(fs.readFileSync(path.join(HERE, 'data/lipsync-s01e01.json')));
let closures = 0, closed = 0, rounds = 0, rounded = 0, finite = true;
for (const rec of Object.values(doc.lines)) {
  const L = prepareLine(rec);
  for (const [ph, a, b] of rec.ph || []) {
    const tc = (a + b) / 200 - 0.04;          // the mouth leads by 40 ms
    const p = lipAt(L, tc);
    for (const k in p) if (!Number.isFinite(p[k])) finite = false;
    if (ph === 'P' || ph === 'B' || ph === 'M') { closures++; if (p.close >= 0.95) closed++; }
    if (ph === 'W' || ph === 'UW') { rounds++; if (p.round >= 0.3) rounded++; }
  }
  const u = visemeUnits(lipAt(L, (L.speechIn + L.speechOut) / 2));
  for (const k in u) if (!Number.isFinite(u[k])) finite = false;
}
ok(finite, 'articulators and face units finite over every take');
ok(closed === closures, `lips close on ${closed}/${closures} p/b/m`);
ok(rounded / Math.max(1, rounds) > 0.9, `lips round on ${rounded}/${rounds} w/uw (> 90 %)`);
ok(Object.keys(doc.lines).length >= 385, `${Object.keys(doc.lines).length} takes have lip-sync records`);
const E = (s, p) => emotionFromDelivery(s, p);
ok(!E('Shouted, reaching for the king.').pain, '"reaching" is not pain');
ok(!E('Worried, seeing Abby hunched over the saddle.').grief, '"saddle" is not grief');
ok(!E('Plain statement, not a boast.').amusement, 'negation drops "not a boast"');
ok((E('Amazed.').surprise || 0) > 0.4, '"Amazed" is surprise');
ok((E('Through the pain, quietly.').pain || 0) > 0.4, '"pain" is pain');
const eu = emotionUnits({ fear: 1, pain: 1, anger: 1 });
ok(Object.values(eu).every((w) => Math.abs(w) < 1.25), 'emotion sums stay softly limited');
// sculpted mouth shapes: only asked for when the character has them
{
  const pb = { jaw: 0.02, close: 1, round: 0, spread: 0, fv: 0, th: 0, tip: 0, upper: 0, press: 0.6 };
  const oo = { jaw: 0.1, close: 0, round: 0.9, spread: 0, fv: 0, th: 0, tip: 0, upper: 0, press: 0 };
  const plain = visemeUnits(pb), withS = visemeUnits(pb, { shapes: true }), ooS = visemeUnits(oo, { shapes: true });
  ok(!Object.keys(plain).some((k) => k.startsWith('mouth-')) && withS['mouth-compression'] > 0.5 && ooS['mouth-pursing'] > 0.6 && ooS.LipsKiss < visemeUnits(oo).LipsKiss,
    `mouth shapes: p presses (compression ${withS['mouth-compression'].toFixed(2)}), oo purses (${ooS['mouth-pursing'].toFixed(2)}) with less bone pucker; none without shapes`);
  const am = emotionUnits({ amusement: 1 }, { shapes: true }), am0 = emotionUnits({ amusement: 1 });
  ok(am['mouth-corner-puller'] > 0.3 && am.MouthLeftPullUp < am0.MouthLeftPullUp && !('mouth-corner-puller' in am0), 'amusement smiles with the corner-puller shape when there are shapes');
}

// ---------------------------------------------------------------- body
const cache = (id) => path.join(HERE, 'cache', id + '.json');
const haveChars = ['remi', 'abby', 'crowd03'].every((id) => fs.existsSync(cache(id)));
if (!haveChars) console.log('skip body tests: character caches not built (scenes/lib/humans/README.md, Build)');
else {
  const { buildCharacter } = await import('./loader.js');
  const { applyIdle } = await import('./idle.js');
  const { createPerformer, loadPerformanceData, directorFace } = await import('./perform.js');
  const { createCrowd } = await import('./crowd.js');
  const { loadFaceUnits } = await import('./face.js');
  const load = (id) => {
    const header = JSON.parse(fs.readFileSync(cache(id)));
    const b = fs.readFileSync(path.join(HERE, 'cache', id + '.bin'));
    const ch = buildCharacter({ header, bin: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
    ch.update = (t, o = {}) => applyIdle(ch, t, o);
    return ch;
  };
  // performance data without fetch
  const units = await (async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(fileURLToPath(u))) });
    try { return { units: await loadFaceUnits(), data: await loadPerformanceData() }; } finally { globalThis.fetch = realFetch; }
  })();
  const P = (ch, n) => new THREE.Vector3().setFromMatrixPosition(ch.bone(n).matrixWorld);
  for (const [speed, label] of [[1.3, 'walk'], [3.6, 'run']]) {
    const ch = load('remi');
    const perf = createPerformer(ch, units.data);
    perf.place(0, 0, 0);
    const w = perf.walkPath([[0, 0], [0, 4], [3, 9], [3, 14]], 0.5, { speed, endYaw: 1.5 });
    let slip = 0, err = 0, prev = null;
    for (let t = 0; t < w.t1 + 2; t += 1 / 48) {
      const st = perf.update(t, { face: false }).body;
      for (const sd of ['L', 'R']) {
        const f = st.feet[sd];
        const a = P(ch, `foot.${sd}`);
        if (f.stance) err = Math.max(err, a.distanceTo(f.pos));
        if (prev && f.stance && prev[sd].stance && f.P === prev[sd].P && Math.abs(f.pitch) < 1e-4 && Math.abs(prev[sd].pitch) < 1e-4) slip = Math.max(slip, a.distanceTo(prev[sd].a));
        f.a = a;
      }
      prev = st.feet;
    }
    ok(slip < 0.001, `${label}: flat stance feet stay planted (max slip ${(slip * 1000).toFixed(2)} mm)`);
    ok(err < 0.015, `${label}: stance feet reached (max IK error ${(err * 1000).toFixed(1)} mm)`);
  }
  {
    // order independence: t = 2.0 posed fresh == posed after other frames
    const mk = () => { const ch = load('abby'); const p = createPerformer(ch, units.data); p.place(0, 0, 0); p.walkPath([[0, 0], [2, 3]], 0.2); p.gesture('cradle', 0, { side: 'L', dur: 9 }); p.performLine('L091', 1.0); return { ch, p }; };
    const A = mk(), B = mk();
    A.p.update(2.0);
    for (const t of [5, 0.3, 3.1]) B.p.update(t);
    B.p.update(2.0);
    let d = 0;
    A.ch.bones.forEach((b, i) => { d = Math.max(d, b.matrixWorld.elements.reduce((m, v, k) => Math.max(m, Math.abs(v - B.ch.bones[i].matrixWorld.elements[k])), 0)); });
    ok(d < 1e-6, `pose at t is independent of earlier frames (max matrix diff ${d.toExponential(1)})`);
  }
  {
    const ch = load('crowd03');
    const p = createPerformer(ch, units.data); p.place(0, 0, 0);
    p.posture('kneel', 0.5, { hold: 1 }); p.stagger(3, { dir: [1, 0] }); p.fall(4, { dir: [0, 1] });
    let fin = true;
    for (let t = 0; t < 7; t += 0.1) { p.update(t); ch.bones.forEach((b) => { if (!b.matrixWorld.elements.every(Number.isFinite)) fin = false; }); }
    const pel = P(ch, 'root');
    ok(fin, 'kneel / stagger / fall stay finite');
    ok(pel.y > 0.05 && pel.y < 0.5, `after a fall the pelvis lies near the ground (${pel.y.toFixed(2)} m)`);
  }
  // crowd
  const mkCrowd = () => createCrowd({ seed: 7, t0: 0, t1: 8, agents: Array.from({ length: 12 }, (_, i) => ({ pos: [(i % 4) * 1.4 - 2, Math.floor(i / 4) * 1.5], yaw: i })), exits: [[[-6, 0], [-12, 0]], [[6, 2], [14, 2]]], obstacles: [{ x: 0, z: -3, r: 1.5 }], walls: [[-8, -6, 8, -6]], alarm: { t: 2, at: [0, -8] }, cower: 0.2 });
  const c1 = mkCrowd().bake(), c2 = mkCrowd().bake();
  let same = true, minD = 9, fin2 = true;
  for (let t = 0; t < 8; t += 0.25) {
    const s1 = c1.agents.map((a, i) => c1.stateAt(i, t)), s2 = c2.agents.map((a, i) => c2.stateAt(i, t));
    s1.forEach((s, i) => { if (s.x !== s2[i].x || s.z !== s2[i].z) same = false; if (!Number.isFinite(s.x + s.z + s.yaw)) fin2 = false; });
    for (let i = 0; i < s1.length; i++) for (let j = i + 1; j < s1.length; j++) minD = Math.min(minD, Math.hypot(s1[i].x - s1[j].x, s1[i].z - s1[j].z));
  }
  ok(same && fin2, 'crowd bake deterministic and finite');
  ok(minD >= 0.5, `crowd keeps people apart (min ${minD.toFixed(2)} m)`);
  // crowd: a parent holds the child's hand, scoops it up at the alarm and runs (pose independent of
  // the update order); one villager falls and stays down
  if (['parent', 'child'].every((id) => fs.existsSync(cache(id)))) {
    const mk = () => {
      const ids = ['parent', 'child', 'crowd03', 'remi'];
      const P = ids.map((id) => createPerformer(load(id), units.data));
      const C = createCrowd({ seed: 5, t0: 0, t1: 9, agents: [
        { performer: P[0], pos: [0, 0], yaw: 0, carry: 1 }, { performer: P[1], pos: [0.42, 0], yaw: 0 },
        { performer: P[2], pos: [3, 1], yaw: 2 }, { performer: P[3], pos: [-3, 1], yaw: -2 }],
        exits: [[[-6, 0], [-14, 0]], [[6, 0], [14, 0]]], alarm: { t: 2, at: [0, -9] }, falls: [2], cower: 0 }).bake();
      return { P, C };
    };
    const A = mk(), B = mk();
    const W = (ch, n) => new THREE.Vector3().setFromMatrixPosition(ch.bone(n).matrixWorld);
    A.P.forEach((p) => p.update(1.5));
    const hands = W(A.P[0].ch, 'wrist.L').distanceTo(W(A.P[1].ch, 'wrist.R'));
    const tc = A.C.agents[0].pickT + 1.2;
    A.P.forEach((p) => p.update(tc));
    [...B.P].reverse().forEach((p) => p.update(tc));
    const rise = W(A.P[1].ch, 'root').y - W(A.P[0].ch, 'root').y;
    const orderSame = W(A.P[1].ch, 'head').distanceTo(W(B.P[1].ch, 'head')) < 1e-6;
    const tf = A.C.agents[2].fallT;
    A.P.forEach((p) => p.update(tf + 2));
    const fallen = W(A.P[2].ch, 'head').y;
    ok(hands < 0.2 && rise > 0.06 && rise < 0.2 && orderSame && fallen < 0.45,
      `crowd: hand in hand (wrists ${(hands * 100).toFixed(0)} cm), child carried ${(rise * 100).toFixed(0)} cm above the parent's pelvis, same pose either update order (${orderSame}), the faller's head ${fallen.toFixed(2)} m up`);
  }
  // director face hook
  {
    const ch = load('remi');
    const fn = directorFace(units.data);
    const placed = [{ id: 'L015', role: 'REMI', at_s: 1.0, file_in_s: 0 }];
    ch.update(1.4);
    fn(ch, { look: null }, 1.4, null, { placed, shot: 'test' });
    const jaw = ch.bone('jaw').quaternion.angleTo(ch.drape.q[ch.index.jaw]);
    ok(jaw > 0.005, `directorFace moves the jaw while speaking (${(jaw * 57.3).toFixed(1)} deg)`);
    // a part of a split take speaks only its own words: L015 cut after "I can" -> silent at "see that"
    const rec = units.data.lines.L015, ws = rec.words;
    const cut = ws[1][2] / 100, tSee = (ws[2][1] + ws[2][2]) / 200;
    const jawAt = (out) => {
      const c = load('remi'), f = directorFace(units.data);
      c.update(tSee + 1);
      f(c, { look: null }, tSee + 1, null, { placed: [{ id: 'L015', role: 'REMI', at_s: 1.0, file_in_s: 0, ...(out ? { file_out_s: out } : {}) }], shot: 'part' });
      return c.bone('jaw').quaternion.angleTo(c.drape.q[c.index.jaw]);
    };
    const jFull = jawAt(null), jPart = jawAt(cut);
    ok(jPart < jFull * 0.4, `a split take's first part does not speak the second part's words ("see": jaw ${(jPart * 57.3).toFixed(2)} deg, whole take ${(jFull * 57.3).toFixed(2)} deg)`);
  }
  // registration with the shot director: loadCharacter() registers 'face'; poseHuman() then lip-syncs
  {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(fileURLToPath(u))) });
    let names;
    try { names = await (await import('./director.js')).registerDirectorHooks(); } finally { globalThis.fetch = realFetch; }
    const actions = await import('../director/actions.js');
    const { actorState } = await import('../director/blocking.js');
    ok(typeof actions.humanAction('face') === 'function', `registerDirectorHooks() registers the director's 'face' action (${names.join(', ') || 'already registered'})`);
    const ch = load('remi');
    ch.root.updateMatrixWorld(true);
    const env = { mark: () => null, point: () => null, ground: () => 0 };
    const st = actorState({ at: [0, 0], face: 0, acts: [] }, 1.4, env);
    actions.poseHuman(ch, st, 1.4, env, { role: 'REMI', placed: [{ id: 'L015', role: 'REMI', at_s: 1.0, file_in_s: 0 }], shot: '1A-test' });
    const jaw = ch.bone('jaw').quaternion.angleTo(ch.drape.q[ch.index.jaw]);
    ok(jaw > 0.005, `a director shot (poseHuman) lip-syncs a placed take (jaw ${(jaw * 57.3).toFixed(1)} deg)`);
    // the director's 'cradle' act poses the performance cradle: the hurt LEFT wrist lies across the
    // body in front of the chest, the right hand under the forearm
    const ab = load('abby');
    const st2 = actorState({ at: [0, 0], face: 180, acts: [[0, 'cradle', { side: 'L', in: 0.3, hold: 9 }]] }, 2.0, env);
    actions.poseHuman(ab, st2, 2.0, env, { role: 'ABBY', placed: [], shot: '2A-test' });
    const toLocal = (v) => ab.root.worldToLocal(v.clone());
    const wl = toLocal(P(ab, 'wrist.L')), wr = toLocal(P(ab, 'wrist.R')), c = toLocal(P(ab, 'spine02'));
    ok(wl.x < c.x && wl.z > c.z + 0.1 && Math.abs(wl.y - c.y) < 0.12 && wr.y < wl.y && Math.abs(wr.x - wl.x) < 0.15,
      `director 'cradle' act: hurt left wrist across the chest (${wl.x.toFixed(2)}, ${(wl.y - c.y).toFixed(2)}, ${(wl.z - c.z).toFixed(2)} from spine02), right hand below it`);
    // opt-in planted-foot legs ('legs' hook with info.stateAt): ankles on the ground travel far less
    // than with the director's built-in offset gait on a curved walk, then a kneel stays finite
    const { directorLegs } = await import('./director.js');
    const spec = { at: [0, 0], face: 0, acts: [[0.5, 'walk', { path: [[0, -3], [2.5, -5.5], [2.5, -8]], speed: 1.3 }], [7.5, 'kneel', { dur: 1 }]] };
    const walk = (hook) => {
      actions.registerHumanAction('legs', hook);
      const c2 = load('remi');
      let slip = 0, n = 0, prev = null, fin = true;
      for (let f = 0; f < 24 * 9.5; f++) {
        const t = f / 24;
        actions.poseHuman(c2, actorState(spec, t, env), t, env, { role: 'REMI', placed: [], shot: 'legs', plantedFeet: !!hook, stateAt: (tt) => actorState(spec, tt, env), seconds: 10 });
        const cur = { L: P(c2, 'foot.L'), R: P(c2, 'foot.R') };
        for (const sd of ['L', 'R']) {
          if (!Number.isFinite(cur[sd].x + cur[sd].y + cur[sd].z)) fin = false;
          if (prev && t > 0.5 && t < 7.4 && cur[sd].y < 0.103 && prev[sd].y < 0.103) { slip += Math.hypot(cur[sd].x - prev[sd].x, cur[sd].z - prev[sd].z); n++; }
        }
        prev = cur;
      }
      return { mm: (slip / Math.max(1, n)) * 1000, fin };
    };
    const builtin = walk(null), planted = walk(directorLegs());
    actions.registerHumanAction('legs', null);
    ok(planted.fin && planted.mm < builtin.mm / 4, `director 'legs' hook plants the feet (ankle travel on the ground ${planted.mm.toFixed(2)} mm/frame vs ${builtin.mm.toFixed(2)} built-in)`);
  }
  // sculpted mouth shapes from the sidecar (tools/mouthmorphs.py): attached as morphs, driven by the lip-sync
  if (!fs.existsSync(path.join(HERE, 'cache', 'alexandria.mouth.json'))) console.log('skip mouth-shape tests: no cache/alexandria.mouth.json (tools/mouthmorphs.py)');
  else {
    const { loadMouthShapes, attachMouthShapes } = await import('./mouthshapes.js');
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (u) => {
      const f = fileURLToPath(u);
      if (!fs.existsSync(f)) return { ok: false, status: 404 };
      const b = fs.readFileSync(f);
      return { ok: true, json: async () => JSON.parse(b), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
    };
    let ms;
    try { ms = await loadMouthShapes('alexandria'); } finally { globalThis.fetch = realFetch; }
    const ch = load('alexandria');
    const added = attachMouthShapes(ch, ms);
    const skin = ch.meshes.find((m) => m.morphTargetDictionary && m.morphTargetDictionary['mouth-compression'] !== undefined);
    ok(added.length === 9 && skin && skin.geometry.morphAttributes.position.length === skin.morphTargetInfluences.length, `alexandria: ${added.length} mouth shapes attached as morphs`);
    const p = createPerformer(ch, units.data);
    p.performLine('L011', 0);
    const rec = units.data.lines.L011;
    const mPh = rec.ph.find((x) => x[0] === 'M'), wPh = rec.ph.find((x) => x[0] === 'W');
    const infl = (t, n) => { p.update(t); return skin.morphTargetInfluences[skin.morphTargetDictionary[n]]; };
    const cM = infl((mPh[1] + mPh[2]) / 200 - 0.04, 'mouth-compression'), pW = infl((wPh[1] + wPh[2]) / 200 - 0.04, 'mouth-pursing');
    ok(cM > 0.3 && pW > 0.3, `L011 drives the shapes: "my" presses (compression ${cM.toFixed(2)}), "weapon" purses (${pW.toFixed(2)})`);
    const bad = attachMouthShapes(load('abby'), ms);
    ok(bad.length === 0, 'a sidecar for another mesh is refused');
  }
  // worn props never follow a hand: no belt / buckle / purse vertex keeps an arm or hand weight
  {
    let bad = 0;
    for (const id of ['abby', 'remi']) {
      const ch = load(id);
      const names = ch.bones.map((b) => b.name);
      for (const m of ch.meshes) {
        if (!/:(belt|buckle|pouch)$/.test(m.name) || !m.geometry.attributes.skinIndex) continue;
        const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
        for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > 0 && /arm|wrist|finger|metacarpal/.test(names[si.getComponent(i, k)])) bad++;
      }
    }
    ok(bad === 0, `worn props (belt, buckle, purse) carry no arm / hand weights (${bad})`);
  }
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
