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
// a delivery 'note' that is really the stage direction before the line (dlsrc 'auto') is not read for
// emotion words: the four misreads the review found
{
  const { lineEmotion } = await import('./faceperf.js');
  const le = (id) => lineEmotion(doc.lines[id], id);
  const bad = [];
  for (const id of ['X5-04', 'X14-06', 'R9-01']) { const e = le(id); if ((e.anger || 0) > 0.05 || (e.determined || 0) > 0.05) bad.push(`${id} ${JSON.stringify(e)}`); }
  const x127 = le('X12-07');
  ok(!bad.length && (x127.pain || 0) <= 0.5, `stage directions are not delivery notes: no anger / determination for "Anything?", "Mostly.", "One wing gone"; Abby's "You didn't count" pain ${x127.pain} (was 1.0 from Remi's flinch)${bad.length ? ` - ${bad.join('; ')}` : ''}`);
  const auto = Object.entries(doc.lines).filter(([, r]) => r.dlsrc === 'auto').length;
  ok(auto >= 160, `the lip-sync data marks where each note came from (${auto} auto)`);
  // a non-verbal take (a cry: no phones) opens the mouth from its envelope
  const Lnv = prepareLine(doc.lines['NV-1E-04']);
  let jmax = 0;
  for (let t = 0; t < doc.lines['NV-1E-04'].dur; t += 0.01) { const pp = lipAt(Lnv, t); jmax = Math.max(jmax, (visemeUnits(pp).JawOpen || 0) * pp.active); }
  ok(jmax > 0.3, `Abby's on-screen cry NV-1E-04 opens the jaw (JawOpen ${jmax.toFixed(2)}, was 0)`);
  const { sceneOfShot } = await import('./perform.js');
  ok(sceneOfShot(doc, 'X25-01') === '3C' && sceneOfShot(doc, 'R15-02') === '3C' && sceneOfShot(doc, '1A-04') === '1A',
    `director shots find their scene from the shot list (X25-01 -> ${sceneOfShot(doc, 'X25-01')}, R15-02 -> ${sceneOfShot(doc, 'R15-02')})`);
}
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
  {
    // walking kinematics close to normative gait (knee flexion over the cycle, Winter / Perry): the
    // knee near straight at heel strike and mid-stance, ~40 deg at toe-off, a 55-65 deg peak early in
    // the swing, straight again before the strike (the old swing peaked late and high: a march)
    const { createBody } = await import('./motion.js');
    const ch = load('remi');
    const body = createBody(ch); body.place(0, 0, 0);
    const w = body.walk([[0, 0], [0, 60]], 0, { speed: 1.35 });
    const tm = w.t1 / 2, k = Math.ceil(body.apply(tm).phi);
    const tAt = (ph) => { let lo = tm - 3, hi = tm + 3; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (body.apply(m).phi < ph) lo = m; else hi = m; } return lo; };
    const NORM = { 0: 5, 10: 18, 20: 14, 30: 7, 40: 5, 50: 10, 60: 38, 65: 52, 70: 62, 75: 62, 80: 55, 85: 40, 90: 22, 95: 8, 100: 5 };
    let err = 0, n = 0, peakAt = 0, peak = 0;
    for (const [pc, kn] of Object.entries(NORM)) {
      body.apply(tAt(k + pc / 100));
      const hip = P(ch, 'upperleg01.L'), knee = P(ch, 'lowerleg01.L'), ank = P(ch, 'foot.L');
      const f = hip.clone().sub(knee).angleTo(knee.clone().sub(ank)) * 57.3;
      err += (f - kn) ** 2; n++;
      if (f > peak) { peak = f; peakAt = +pc; }
    }
    const rms = Math.sqrt(err / n);
    ok(rms < 10 && peakAt >= 65 && peakAt <= 80, `walk: knee flexion follows normative gait (rms ${rms.toFixed(1)} deg, swing peak ${peak.toFixed(0)} deg at ${peakAt} % of the cycle)`);
  }
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
    // two people: Abby looks at Remi while he walks, Remi's hand supports her cradled arm and he looks
    // at her. A worker whose chunk starts at T (only the setup pose before) must pose exactly what a
    // worker that rendered every frame before T poses, in either update order (targets.js snapshots)
    const mk = (prepose = true) => {
      const ab = load('abby'), re = load('remi');
      const A = createPerformer(ab, units.data), R = createPerformer(re, units.data);
      A.place(0, 0, 0); R.place(0.5, 0.9, Math.PI);
      A.gesture('cradle', 0, { side: 'L', dur: 99 });
      A.lookAt({ ch: re }, 0); R.lookAt({ ch: ab }, 0);
      A.performLine('L014', 1.0); R.performLine('L015', 2.0);
      R.walkPath([[0.5, 0.9], [0.45, 0.45]], 2.6, { speed: 0.8 });
      R.gesture('support', 0.2, { side: 'R', at: { ch: ab, bone: 'upperarm02.L', offset: [0.06, -0.01, -0.045] }, in: 0.8, dur: 99, shape: 'clutch' });
      if (prepose) { A.update(0); R.update(0); }        // the setup pose (never posed: bind pose)
      return { A, R, ab, re };
    };
    const diff = (X, Y) => {
      let d = 0;
      for (const k of ['ab', 're']) X[k].bones.forEach((b, i) => { const e1 = b.matrixWorld.elements, e2 = Y[k].bones[i].matrixWorld.elements; for (let j = 0; j < 16; j++) d = Math.max(d, Math.abs(e1[j] - e2[j])); });
      return d;
    };
    let worst = 0;
    for (const T of [2.9, 3.5, 4.0]) {
      const S1 = mk(); S1.A.update(T); S1.R.update(T);
      const S2 = mk(); for (let t = 0; t < T - 1e-6; t += 1 / 24) { S2.A.update(t); S2.R.update(t); } S2.A.update(T); S2.R.update(T);
      const S3 = mk(false); S3.R.update(T); S3.A.update(T);
      worst = Math.max(worst, diff(S1, S2), diff(S1, S3));
    }
    ok(worst === 0, `two-person look + support: a chunk's first frame == the sequential frame, either update order (max matrix diff ${worst})`);
  }
  // the cradle reads as guarding: the good palm ON the hurt forearm's sleeve (< 1.5 cm), its forearm
  // clear of the hurt one, the hurt elbow in at the side, the limp hand's fingers together; a support
  // grip lands on the outside of the other person's sleeve
  {
    const { limbRadius, bodyRig } = await import('./motion.js');
    const seg = (p, a, b) => { const ab = b.clone().sub(a); const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return { d: p.distanceTo(a.clone().addScaledVector(ab, t)), t }; };
    const res = [];
    for (const id of ['abby', 'abby_injured', 'remi']) {
      if (!fs.existsSync(cache(id))) continue;
      const ch = load(id);
      const p = createPerformer(ch, units.data); p.place(0, 0, 0);
      p.gesture('cradle', -5, { side: 'L', in: 0.1, dur: 99 }); p.posture('hunch', -5, { in: 0.1, hold: 99 });
      p.update(2, { face: false });
      const R = bodyRig(ch), fr = limbRadius(ch, 'lowerarm01.L', 'wrist.L');
      const hE = P(ch, 'lowerarm01.L'), hW = P(ch, 'wrist.L');
      const palm = seg(P(ch, 'wrist.R').lerp(P(ch, 'finger3-1.R'), 0.5), hE, hW);
      const gap = palm.d - fr.sleeve - 0.13 * R.palmLenR;
      // the good forearm away from its hand (elbow end to 70 %) keeps a sleeve's width from the hurt one
      let clear = 9;
      for (let k = 0; k <= 7; k++) clear = Math.min(clear, seg(P(ch, 'lowerarm01.R').lerp(P(ch, 'wrist.R'), k / 10), hE, hW).d);
      const loc = (v) => ch.root.worldToLocal(v.clone());
      const elbowOut = loc(hE).x - loc(P(ch, 'spine02')).x;
      // fingers together: the last joints closer than the knuckles (index-middle, middle-ring)
      const lat = (a, b) => P(ch, b).distanceTo(P(ch, a));
      const together = lat('finger2-3.L', 'finger3-3.L') < lat('finger2-1.L', 'finger3-1.L') && lat('finger3-3.L', 'finger4-3.L') < lat('finger3-1.L', 'finger4-1.L') * 1.05;
      res.push({ id, gap, clear, clearNeed: fr.sleeve + limbRadius(ch, 'lowerarm01.R', 'wrist.R').sleeve * 0.6, elbowOut, hw: R.chestHalfW, together });
    }
    const okAll = res.every((r) => Math.abs(r.gap) < 0.015 && r.clear > r.clearNeed && r.elbowOut < r.hw + 0.07 && r.together);
    ok(okAll, `cradle: ${res.map((r) => `${r.id} palm-to-sleeve ${(r.gap * 100).toFixed(1)} cm, good forearm ${(r.clear * 100).toFixed(1)} cm from the hurt one (needs ${(r.clearNeed * 100).toFixed(1)}), elbow ${(r.elbowOut * 100).toFixed(1)} cm out, fingers together ${r.together}`).join('; ')}`);
    // a support grip (Remi's hand on Abby's upper arm, outside her sleeve)
    const ab = load('abby'), re = load('remi');
    const A = createPerformer(ab, units.data).place(0, 0, 0), Rm = createPerformer(re, units.data).place(0.5, -0.15, 0);
    Rm.gesture('support', 0, { side: 'R', grip: { ch: ab, from: 'upperarm01.L', to: 'lowerarm01.L', t: 0.55, dir: [1, 0.05, -0.35], fingers: [-0.15, -0.35, 1] }, in: 0.3, dur: 99 });
    A.update(2, { face: false }); Rm.update(2, { face: false });
    const ur = limbRadius(ab, 'upperarm01.L', 'lowerarm01.L');
    const g = seg(P(re, 'wrist.R').lerp(P(re, 'finger3-1.R'), 0.5), P(ab, 'upperarm01.L'), P(ab, 'lowerarm01.L')).d - ur.sleeve - 0.13 * bodyRig(re).palmLenR;
    ok(g > -0.01 && g < 0.015, `support grip: Remi's palm on the outside of Abby's sleeve (gap ${(g * 100).toFixed(1)} cm, sleeve radius ${(ur.sleeve * 100).toFixed(1)} cm)`);
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
  // crowd verbs: crawl, push, drop flat (cover), thrown by a blast
  {
    const { bodyRig } = await import('./motion.js');
    const W = (ch, n) => new THREE.Vector3().setFromMatrixPosition(ch.bone(n).matrixWorld);
    const cc = load('crowd06'); const A = createPerformer(cc, units.data).place(0, 0, Math.PI / 2);
    A.posture('crawl', 0.4, { in: 0.9, hold: 99 });
    A.walkPath([[0, 0], [2.4, 0.15]], 1.5, { speed: 0.42, accel: 0.5, decel: 0.5 });
    let wMax = 0, kMax = 0, pMax = 0, slip = 0;
    const planted = { L: null, R: null };
    for (let t = 2.5; t < 6; t += 1 / 30) {
      A.update(t, { face: false });
      for (const sd of ['L', 'R']) {
        const w = W(cc, `wrist.${sd}`);
        wMax = Math.max(wMax, Math.min(w.y, 0.2));
        kMax = Math.max(kMax, W(cc, `lowerleg01.${sd}`).y);
        // a hand planted (wrist low) does not slide: compare frames while it stays below 6 cm
        if (w.y < 0.06 && planted[sd]) slip = Math.max(slip, Math.hypot(w.x - planted[sd].x, w.z - planted[sd].z));
        planted[sd] = w.y < 0.06 ? (planted[sd] || w) : null;
      }
      pMax = Math.max(pMax, W(cc, 'root').y);
    }
    ok(pMax < 0.55 && kMax < 0.13 && slip < 0.05, `crawl: on hands and knees (pelvis <= ${pMax.toFixed(2)} m, knees <= ${kMax.toFixed(2)} m), a planted hand slides ${(slip * 100).toFixed(1)} cm`);
    const cp = load('crowd04'); const B = createPerformer(cp, units.data).place(0, -0.8, 0);
    B.posture('brace', 0.2, { in: 0.6, hold: 99 });
    B.gesture('push', 0.1, { at: [0, 1.12, -0.14], along: [1, 0, 0], width: 0.4, in: 0.55, dur: 99 });
    B.update(2, { face: false });
    const pl = bodyRig(cp).palmLenL;
    const palmL = W(cp, 'wrist.L').lerp(W(cp, 'finger3-1.L'), 0.5), palmR = W(cp, 'wrist.R').lerp(W(cp, 'finger3-1.R'), 0.5);
    const dPush = Math.max(palmL.distanceTo(new THREE.Vector3(0.2, 1.12, -0.16)), palmR.distanceTo(new THREE.Vector3(-0.2, 1.12, -0.16)));
    ok(dPush < 0.05 + pl * 0.1 && W(cp, 'foot.R').z < W(cp, 'foot.L').z - 0.2, `push: both palms on the beam (within ${(dPush * 100).toFixed(1)} cm), the right foot braced back`);
    const cpr = load('crowd09'); const C = createPerformer(cpr, units.data).place(0, 0, Math.PI / 2);
    C.fall(1, { dir: [1, 0], dur: 1.05, cover: true });
    C.update(4, { face: false });
    const hd = W(cpr, 'head'), dc = Math.max(W(cpr, 'wrist.L').distanceTo(hd), W(cpr, 'wrist.R').distanceTo(hd));
    ok(hd.y < 0.35 && dc < 0.2 && W(cpr, 'wrist.L').y > hd.y, `drop flat: prone (head ${hd.y.toFixed(2)} m up), hands on the back of the head (wrists within ${(dc * 100).toFixed(0)} cm)`);
    const ct = load('crowd02'); const D = createPerformer(ct, units.data).place(0, 0, -Math.PI / 2);
    D.fall(1, { dir: [1, 0], dur: 1.0, thrown: { dist: 1.8, h: 0.5 }, drop: true });
    let air = 0;
    for (let t = 1; t < 2; t += 0.05) { D.update(t, { face: false }); air = Math.max(air, Math.min(W(ct, 'foot.L').y, W(ct, 'foot.R').y)); }
    D.update(4, { face: false });
    const pe = W(ct, 'root');
    ok(air > 0.3 && pe.y < 0.2 && pe.x > 1.5, `thrown: both feet off the ground (${air.toFixed(2)} m), lands ${pe.x.toFixed(2)} m along the blast, pelvis ${pe.y.toFixed(2)} m up`);
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
  // nobody stands still long after the alarm's wave has reached them (the reviewer saw a villager
  // stand ~1.7 s while the square ran): each reacts within 0.5 s of the wave
  {
    const lag = c1.agents.map((a) => a.fleeT - (2 + 0.25 * Math.hypot(a.pos[0] - 0, a.pos[1] + 8) / 10));
    const mx = Math.max(...lag);
    ok(mx <= 0.5 + 1e-9 && Math.min(...lag) >= 0.1 - 1e-9, `crowd: each one reacts 0.1 - 0.5 s after the wave reaches them (latest ${mx.toFixed(2)} s)`);
  }
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
    // the parent is already running while it lifts the child (not standing with it on the hip)
    const pk = A.C.agents[0].pickT, s0 = A.C.stateAt(0, pk + 0.5), s1 = A.C.stateAt(0, pk + 0.9);
    const vRun = Math.hypot(s1.x - s0.x, s1.z - s0.z) / 0.4;
    ok(vRun > 0.8, `crowd: a parent runs during the lift (${vRun.toFixed(2)} m/s 0.5-0.9 s after the pickup starts)`);
  }
  // two takes of one character 0.25 s apart: the first syllable of the second is not swallowed by the
  // first's closing rest
  {
    const rA = units.data.lines.L014, rB = units.data.lines.L016;
    const endA = rA.ph[rA.ph.length - 1][2] / 100, inB = rB.ph[0][1] / 100;
    const t0B = 1.0 + endA + 0.25 - inB;
    const jaw = (withA) => {
      const p = createPerformer(load('abby'), units.data); p.place(0, 0, 0);
      if (withA) p.performLine('L014', 1.0);
      p.performLine('L016', t0B);
      let m = 0;
      for (let t = t0B + inB; t < t0B + inB + 0.1; t += 0.02) m = Math.max(m, p.update(t).face.units.JawOpen || 0);
      return m;
    };
    const alone = jaw(false), after = jaw(true);
    ok(after > alone * 0.85, `a take 0.25 s after another keeps its first syllable (JawOpen ${after.toFixed(2)} vs ${alone.toFixed(2)} alone)`);
  }
  // eyes reading a face 0.66 m away refixate eye to eye (~5 deg), not the 0.3 deg they did
  {
    const a = createPerformer(load('abby'), units.data), r = createPerformer(load('remi'), units.data);
    a.place(0, 0, 0); r.place(0, 0.66, Math.PI);
    a.lookAt({ ch: r.ch }, 0);
    const ys = [];
    let d = 0;
    for (let t = 2; t < 8; t += 1 / 24) { r.update(t); ys.push(a.update(t).face.gaze.yaw); d = P(a.ch, 'eye.L').distanceTo(P(r.ch, 'eye.L')); }
    const range = (Math.max(...ys) - Math.min(...ys)) * 57.3, eyeToEye = 2 * Math.atan2(0.032, d) * 57.3;
    ok(range > 0.7 * eyeToEye && range < 1.6 * eyeToEye, `face reading: eye refixations span ${range.toFixed(1)} deg (eye to eye on a face ${d.toFixed(2)} m away: ${eyeToEye.toFixed(1)} deg)`);
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
    // every arm act the performance registers is posed by its performance gesture (the right wrist
    // lands where motion.js gestureNow puts it, not where the director's built-in would)
    {
      const { OVERLAYS } = await import('./director.js');
      const { gestureNow } = await import('./motion.js');
      const tgt = [0.25, 1.1, 0.55];
      const env2 = { mark: () => null, point: (n) => (Array.isArray(n) ? new THREE.Vector3(...n) : null), ground: () => 0 };
      const acts = { point: { at: tgt }, wave: {}, reach: { at: tgt }, touch: { at: tgt }, handsTo: { at: tgt }, raiseHand: {}, gesture: { dur: 1.2 }, shove: { side: 'R', at: tgt } };
      const bad = [];
      for (const [name, o] of Object.entries(acts)) {
        if (!OVERLAYS[name] || actions.humanAction(name) !== OVERLAYS[name]) { bad.push(`${name} not registered`); continue; }
        const st3 = actorState({ at: [0, 0], face: 180, acts: [[0, name, { side: 'R', in: 0.2, hold: 9, ...o }]] }, 1.0, env2);
        const c1 = load('remi');
        actions.poseHuman(c1, st3, 1.0, env2, { role: 'REMI', placed: [], shot: 'acts' });
        const got = P(c1, 'wrist.R');
        // the same gesture by hand, from the same base pose (the director's pose without its overlays)
        const c2 = load('remi');
        actions.poseHuman(c2, { ...st3, overlays: [] }, 1.0, env2, { role: 'REMI', placed: [], shot: 'acts' });
        const g = { point: 'point', wave: 'wave', reach: 'reach', touch: 'reach', handsTo: 'reach', raiseHand: 'raiseHand', gesture: 'explain', shove: 'shove' }[name];
        const ov = st3.overlays[0];
        const o2 = { ...ov.o, side: 'R', ...(o.at ? { at: new THREE.Vector3(...tgt) } : {}), ...(name === 'handsTo' ? { lateral: 0.09, palm: [0, 1, 0] } : {}), ...(name === 'gesture' ? { beat: 1.2 } : {}) };
        gestureNow(c2, g, o2, ov.w, 1.0, ov.dt);
        const want = P(c2, 'wrist.R');
        if (got.distanceTo(want) > 0.01) bad.push(`${name} ${(got.distanceTo(want) * 100).toFixed(1)} cm off`);
      }
      ok(!bad.length, `the director's arm acts (${Object.keys(acts).join(', ')}) are posed by the performance gestures${bad.length ? `: ${bad.join('; ')}` : ''}`);
    }
    // the director's 'cradle' act poses the performance cradle: the hurt LEFT forearm lies across the
    // body, its wrist in front of the midline, the right hand under the forearm
    const ab = load('abby');
    const st2 = actorState({ at: [0, 0], face: 180, acts: [[0, 'cradle', { side: 'L', in: 0.3, hold: 9 }]] }, 2.0, env);
    actions.poseHuman(ab, st2, 2.0, env, { role: 'ABBY', placed: [], shot: '2A-test' });
    const toLocal = (v) => ab.root.worldToLocal(v.clone());
    const wl = toLocal(P(ab, 'wrist.L')), wr = toLocal(P(ab, 'wrist.R')), c = toLocal(P(ab, 'spine02'));
    ok(wl.x < c.x + 0.05 && wl.z > c.z + 0.1 && Math.abs(wl.y - c.y) < 0.12 && wr.y < wl.y && Math.abs(wr.x - wl.x) < 0.15,
      `director 'cradle' act: hurt left wrist in front of the body's midline (${wl.x.toFixed(2)}, ${(wl.y - c.y).toFixed(2)}, ${(wl.z - c.z).toFixed(2)} from spine02), right hand below it`);
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
  // the lips' colour zone (loader.js applyLipMask, data/lipmask-uv.json): the vermilion of the upper and
  // lower lip gets the lip weight, nothing beyond 3.3 cm of the mouth (the nostrils are as red in the photo)
  {
    const L = await import('./loader.js');
    const LM = L.decodeLipMask(JSON.parse(fs.readFileSync(path.join(HERE, 'data/lipmask-uv.json'))));
    const res = [];
    for (const id of ['alexandria', 'abby', 'remi']) {
      const header = JSON.parse(fs.readFileSync(cache(id))), b = fs.readFileSync(path.join(HERE, 'cache', id + '.bin'));
      const ch = L.buildCharacter({ header, bin: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }, { lipMask: LM });
      const g = ch.meshes.find((m) => m.userData.kind === 'skin').geometry;
      const M = P(ch, 'oris05').add(P(ch, 'oris01')).multiplyScalar(0.5);
      let up = 0, lo = 0, far = 0;
      for (let i = 0; i < g.attributes.position.count; i++) {
        const w = g.attributes.aux.getX(i);
        if (w < 0.5) continue;
        const q = new THREE.Vector3().fromBufferAttribute(g.attributes.position, i);
        const dy = q.y - M.y;
        if (q.distanceTo(M) > 0.033) far++; else if (dy > 0) up++; else lo++;
      }
      res.push({ id, up, lo, far });
    }
    ok(res.every((r) => r.up > 60 && r.lo > 60 && r.far === 0), `lip colour zone: ${res.map((r) => `${r.id} ${r.up} upper / ${r.lo} lower-lip vertices, ${r.far} beyond the lips`).join('; ')}`);
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
