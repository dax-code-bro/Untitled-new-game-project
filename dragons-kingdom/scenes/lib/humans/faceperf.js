// Facial performance for one character: lip-sync, emotion layers, brows, blinks, gaze (eye-target
// look-at with saccades, vergence and lids that follow the eyes) and speech head motion - all pure
// functions of t over a schedule set up front (say / mood / look), so any frame renders the same
// whatever was rendered before it.
//
//   import { loadPerformanceData } from './perform.js';
//   const data = await loadPerformanceData();                 // setup
//   const face = createFacePerformer(ch, data, { role: 'ALEXANDRIA' });
//   face.say('L011', 2.0);                                    // take time 0 plays at t = 2.0
//   face.mood({ tender: 0.4 }, 0, 99);                       // base mood over a time range
//   face.look(() => hatchlingHead, 0);                        // eye target (Vector3 | fn | {ch, bone})
//   ... update(t): body first (it moves the head), then face.apply(t)
import * as THREE from 'three';
import { createFaceRig } from './face.js';
import { prepareLine, lipAt, visemeUnits, envSmooth } from './visemes.js';
import { emotionUnits, emotionFromDelivery } from './expressions.js';
import { hashStr } from './loader.js';
import { setWorldQuat, wpos, wquat, hash01, noise1, clamp01, smooth } from './rig.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ax = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * Hand-set performances of key lines (creative intent beyond the delivery note): emotion mix, lip
 * amplitude, gaze. Proposed, like every performance choice (SERIES.md section 5).
 */
export const LINE_OVERRIDES = {
  // the ORIGINAL line, whispered to the hatchling: possessive tenderness with a cold edge
  L011: { emo: { tender: 0.55, contempt: 0.18, calm: 0.3 }, amp: 0.85, gazeLock: true },
  L013: { emo: { tender: 0.35, determined: 0.3 } },
  L014: { emo: { surprise: 0.6, amusement: 0.25 } },
  L015: { emo: { amusement: 0.45, calm: 0.3 } },
  L016: { emo: { surprise: 0.45, amusement: 0.3 } },
  L067: { emo: { tender: 0.45, anger: 0.18 } },
};
/** Base mood per scene when a line's note says nothing (proposed defaults). */
export const SCENE_MOOD = {
  '1E': { fear: 0.35, worry: 0.3 }, '1F': { anger: 0.25, worry: 0.3 }, '2A': { worry: 0.35, pain: 0.1 },
  '2B': { worry: 0.3 }, '3B': { worry: 0.35 }, '3C': { fear: 0.6, worry: 0.3 }, '3D': { grief: 0.45, worry: 0.2 },
};

/** The emotion mix of a take: override > delivery note (+ preset) > scene mood. */
export function lineEmotion(rec, id) {
  const o = LINE_OVERRIDES[id];
  if (o?.emo) return { ...o.emo };
  const e = emotionFromDelivery(rec?.dl, rec?.preset);
  if (!Object.keys(e).length && SCENE_MOOD[rec?.scene]) return { ...SCENE_MOOD[rec.scene] };
  return e;
}

// blink shape: close 75 ms, closed 25 ms, open 160 ms
function blinkShape(dt, depth = 1) {
  if (dt < 0 || dt > 0.26) return 0;
  if (dt < 0.075) { const x = dt / 0.075; return depth * x * x; }
  if (dt < 0.1) return depth;
  const x = (dt - 0.1) / 0.16;
  return depth * (1 - x) * (1 - x) * (1 + 2 * x) * (1 - 0.0 * x);
}

/** Resolve a look target to a world point (or null). */
function targetPoint(tg, t, out) {
  if (!tg) return null;
  if (tg.isVector3) return out.copy(tg);
  if (Array.isArray(tg)) return out.set(tg[0], tg[1], tg[2]);
  if (typeof tg === 'function') { const p = tg(t); return p ? out.copy(p.isVector3 ? p : _v2.set(p[0], p[1], p[2])) : null; }
  if (tg.ch) {
    const b = tg.ch.bone(tg.bone || 'head');
    if (!b) return null;
    b.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(b.matrixWorld);
    if (!tg.bone || tg.bone === 'head') {
      // a face: between the eyes (the head bone sits at the skull base)
      const eL = tg.ch.bone('eye.L'), eR = tg.ch.bone('eye.R');
      if (eL && eR) { eL.updateWorldMatrix(true, false); eR.updateWorldMatrix(true, false); out.setFromMatrixPosition(eL.matrixWorld).add(_v2.setFromMatrixPosition(eR.matrixWorld)).multiplyScalar(0.5); }
    }
    if (tg.offset) out.add(_v2.set(...tg.offset));
    return out;
  }
  if (tg.object) { tg.object.updateWorldMatrix(true, false); return out.setFromMatrixPosition(tg.object.matrixWorld); }
  return null;
}

/**
 * opts: { role, seed, asym (-0.3..0.3; default from the id), expressive (1: brow / head motion on
 * stressed syllables), blinkRate (1), lid (0.1: resting upper-lid closure), saccade (1) }
 */
export function createFacePerformer(ch, data, opts = {}) {
  const rig = createFaceRig(ch, data.units);
  const seed = hashStr(ch.id + ':' + (opts.seed ?? ''));
  const asym = opts.asym ?? (hash01(seed, 91) - 0.5) * 0.24;
  const lines = [], moods = [], looks = [], gestures = [];
  const eyes = ['L', 'R'].map((s) => ({ s, b: ch.bone(`eye.${s}`) })).filter((e) => e.b);
  const head = ch.bone('head');
  // the eyes' drape orientation relative to the head (their rest look direction)
  const H = ch.header.bones, idx = ch.index;
  const qW = (n) => { const b = H[idx[n]]; return new THREE.Quaternion(b.q[1], b.q[2], b.q[3], b.q[0]); };
  const headDrapeInv = head ? qW('head').invert() : new THREE.Quaternion();
  for (const e of eyes) e.rel = headDrapeInv.clone().multiply(qW(`eye.${e.s}`));

  const api = {
    rig, lines, moods, looks, seed,
    /**
     * Schedule a take: its time 0 plays at t0. opts: { emo, gain (emotion 1), amp (lip amplitude),
     * lookAway (true), window: [a, b] (take seconds: only the words inside play - a part of a split take) }
     */
    say(id, t0, o = {}) {
      const full = data.lines[id];
      if (!full) throw new Error(`performance: no lip-sync record for line "${id}" (data/lipsync-s01e01.json)`);
      const rec = o.window ? sliceRecord(full, o.window[0], o.window[1]) : full;
      const key = `${id}@${t0}${o.window ? `[${o.window}]` : ''}`;
      if (lines.some((l) => l.key === key)) return api;
      const ov = LINE_OVERRIDES[id] || {};
      lines.push({ key, id, t0, rec, L: prepareLine(rec), emo: o.emo || lineEmotion(rec, id), gain: o.gain ?? 0.85, amp: o.amp ?? ov.amp ?? 1, whisper: rec.preset === 'whisper', lookAway: o.lookAway ?? !ov.gazeLock, idx: lines.length });
      lines.sort((a, b) => a.t0 - b.t0);
      return api;
    },
    /** A base mood { emotion: w } between t0 and t1 (fade s in and out). */
    mood(mix, t0 = -1e9, t1 = 1e9, fade = 0.6) { moods.push({ mix, t0, t1, fade }); return api; },
    /** Eye target from t0 on: Vector3 | [x,y,z] | fn(t) | { ch, bone, offset } | { object }. opts: { person (fixation pattern on a face) } */
    look(target, t0 = -1e9, o = {}) {
      looks.push({ target, t0, person: o.person ?? !!target?.ch, amount: o.amount ?? 1 });
      looks.sort((a, b) => a.t0 - b.t0);
      return api;
    },
    /** A one-off facial gesture: { units } envelope (e.g. a wince) at t0 for dur seconds. */
    react(units, t0, dur = 0.8, o = {}) { gestures.push({ units, t0, dur, attack: o.attack ?? 0.08 }); return api; },
    /** Who is speaking now (line record or null) and the take time. */
    speaking(t) {
      for (const l of lines) {
        const tau = t - l.t0;
        if (tau >= l.L.speechIn - 0.3 && tau <= l.L.speechOut + 0.3) return { line: l, tau };
      }
      return null;
    },
    apply(t, o = {}) { return applyFace(api, ch, t, o); },
  };
  Object.assign(api, { _eyes: eyes, _head: head, _asym: asym, _opts: opts, _gestures: gestures });
  return api;
}

/**
 * The part of a take record between take seconds a and b (a split take: the director places each part
 * on its own): phones and words that start inside [a, b) - a word cut by the edge belongs to the part
 * its start is in. Cached on the record.
 */
export function sliceRecord(rec, a, b) {
  if (!(a > 0) && !(b < (rec.dur ?? Infinity))) return rec;
  if (!rec._slices) Object.defineProperty(rec, '_slices', { value: new Map(), enumerable: false });
  const key = `${a}:${b}`;
  let s = rec._slices.get(key);
  if (!s) {
    const A = a * 100, B = b * 100;
    const words = (rec.words || []).filter((w) => w[1] >= A - 1 && w[1] < B);
    const w0 = words.length ? words[0][1] : A, w1 = words.length ? words[words.length - 1][2] : B;
    s = { ...rec, ph: (rec.ph || []).filter((p) => p[1] >= w0 - 1 && p[1] < w1), words };
    rec._slices.set(key, s);
  }
  return s;
}

function moodAt(api, t) {
  const out = {};
  for (const m of api.moods) {
    const w = clamp01((t - m.t0) / Math.max(1e-3, m.fade)) * clamp01((m.t1 - t) / Math.max(1e-3, m.fade));
    if (w <= 0) continue;
    for (const k in m.mix) out[k] = (out[k] || 0) + m.mix[k] * w;
  }
  return out;
}

/** Spontaneous + speech + gaze-shift blinks: weight 0..1 at t. */
function blinkAt(api, t, fearK) {
  const seed = api.seed;
  const rate = api._opts.blinkRate ?? 1;
  let w = 0;
  // spontaneous: one candidate per 2.6 s cell (more under fear, fewer when fixed on something)
  const P = 2.6 / rate;
  const k0 = Math.floor((t - 0.3) / P);
  for (let k = k0; k <= k0 + 1; k++) {
    const p = 0.72 + 0.25 * fearK;
    if (hash01(seed, k * 5 + 1) > p) continue;
    const tb = k * P + hash01(seed, k * 5 + 2) * P * 0.85;
    const depth = hash01(seed, k * 5 + 3) < 0.14 ? 0.6 : 1;
    w = Math.max(w, blinkShape(t - tb, depth));
    if (fearK > 0.4 && hash01(seed, k * 5 + 4) < fearK * 0.5) w = Math.max(w, blinkShape(t - tb - 0.33, 1));
  }
  // speech: at the start of a line and in its pauses
  for (const l of api.lines) {
    const tau = t - l.t0;
    if (tau < l.L.speechIn - 0.5 || tau > l.L.speechOut + 0.6) continue;
    if (hash01(seed, 300 + l.idx) < 0.55) w = Math.max(w, blinkShape(tau - (l.L.speechIn - 0.18)));
    const ws = l.rec.words || [];
    for (let i = 1; i < ws.length; i++) {
      const gap = (ws[i][1] - ws[i - 1][2]) / 100;
      if (gap < 0.22) continue;
      if (hash01(seed, 400 + l.idx * 50 + i) < 0.6) w = Math.max(w, blinkShape(tau - ws[i - 1][2] / 100 - 0.04));
    }
  }
  // gaze shifts
  for (let i = 1; i < api.looks.length; i++) {
    const L = api.looks[i];
    if (t >= L.t0 - 0.05 && t < L.t0 + 0.3 && hash01(seed, 600 + i) < 0.75) w = Math.max(w, blinkShape(t - L.t0 + 0.02));
  }
  return Math.min(1, w);
}

/** Gaze target point at t (world) and whether it is a face. */
function gazeTarget(api, ch, t, out) {
  let cur = null, prev = null;
  for (const L of api.looks) { if (L.t0 <= t) { prev = cur; cur = L; } }
  if (!cur) return null;
  if (!targetPoint(cur.target, t, out)) return null;
  // eyes jump to a new target in a fast saccade (60 ms after a 40 ms latency)
  if (prev && t - cur.t0 < 0.1) {
    const k = smooth((t - cur.t0 - 0.04) / 0.06);
    const p0 = targetPoint(prev.target, t, new THREE.Vector3());
    if (p0) out.lerpVectors(p0, out, k);
  }
  return cur;
}

const EYE_YAW = 0.6, EYE_UP = 0.38, EYE_DOWN = 0.5;

function applyFace(api, ch, t, o) {
  const opts = api._opts;
  const seed = api.seed;
  const W = {};
  // ---- speech
  const sp = api.speaking(t);
  let lip = null, acc = 0, active = 0;
  let lineEmo = null, lineW = 0;
  for (const l of api.lines) {
    const tau = t - l.t0;
    // emotion envelope: rises 0.35 s before the words, holds, releases over 1.4 s (30 % stays 3 s)
    const a = smooth((tau - (l.L.speechIn - 0.45)) / 0.4);
    const r = tau < l.L.speechOut + 0.4 ? 1 : 0.3 + 0.7 * (1 - smooth((tau - l.L.speechOut - 0.4) / 1.4));
    const r2 = tau < l.L.speechOut + 1.8 ? 1 : 1 - smooth((tau - l.L.speechOut - 1.8) / 3);
    const w = a * r * r2;
    if (w > lineW) { lineW = w; lineEmo = l; }
  }
  if (sp) {
    const l = sp.line;
    lip = lipAt(l.L, sp.tau, { amp: l.amp, whisper: l.whisper });
    active = lip.active;
    // accent: the envelope above its slow average (stressed syllables)
    const fast = envSmooth(l.L, sp.tau + 0.03, 0.04), slow = envSmooth(l.L, sp.tau, 0.3);
    acc = clamp01((fast - slow) / 7) * active;
  }
  // ---- emotion: mood + the line's emotion
  const mood = moodAt(api, t);
  const emo = { ...mood };
  if (lineEmo) for (const k in lineEmo.emo) emo[k] = (emo[k] || 0) * (1 - 0.5 * lineW) + lineEmo.emo[k] * lineW * lineEmo.gain;
  const expressive = opts.expressive ?? 1;
  const emoGain = 0.9 + 0.25 * acc * expressive;
  emotionUnits(emo, { asym: api._asym, out: W, gain: emoGain });
  // micro-motion of the face at rest: tiny slow drifts so a held face is never frozen
  const drift = (i, f) => noise1(seed + i, t * f);
  W.LeftInnerBrowUp = (W.LeftInnerBrowUp || 0) + 0.03 * drift(11, 0.31);
  W.RightInnerBrowUp = (W.RightInnerBrowUp || 0) + 0.03 * drift(12, 0.29);
  W.lowerLipUp = (W.lowerLipUp || 0) + 0.02 * drift(13, 0.23) * (1 - active);
  // ---- brows on stressed syllables (raise; anger / determination knit them down instead)
  if (acc > 0) {
    const down = clamp01((emo.anger || 0) + (emo.determined || 0) * 0.6 + (emo.pain || 0) * 0.5);
    const up = (1 - down) * acc * 0.28 * expressive;
    for (const s of ['Left', 'Right']) {
      W[`${s}InnerBrowUp`] = (W[`${s}InnerBrowUp`] || 0) + up * 0.8;
      W[`${s}OuterBrowUp`] = (W[`${s}OuterBrowUp`] || 0) + up;
      W[`${s}BrowDown`] = (W[`${s}BrowDown`] || 0) + down * acc * 0.25 * expressive;
    }
  }
  // ---- one-off reactions (winces, flinches)
  for (const g of api._gestures) {
    const dt = t - g.t0;
    if (dt < 0 || dt > g.dur) continue;
    const k = smooth(dt / g.attack) * (1 - smooth((dt - g.attack) / (g.dur - g.attack)));
    for (const u in g.units) W[u] = (W[u] || 0) + g.units[u] * k;
  }
  // ---- lips
  if (lip && active > 0) {
    const lw = {};
    // a smile or a pained stretch widens the mouth already: less extra spread from the visemes
    visemeUnits(lip, { out: lw, lips: 1 - 0.3 * clamp01((emo.amusement || 0) + (emo.pain || 0)) });
    for (const u in lw) W[u] = (W[u] || 0) + lw[u] * active;
    // closing the lips for p / b / m wins over an expression that parts them
    const cl = Math.min(1, lip.close) * active;
    if (cl > 0) for (const u of ['JawOpen', 'JawDrop']) if (W[u]) W[u] *= 1 - 0.85 * cl;
  }
  // ---- speech head motion: a small nod on stressed syllables, a slow drift while talking
  if (api._head && opts.headMotion !== false) {
    const hb = api._head;
    hb.updateWorldMatrix(true, false);
    const hq = wquat(hb, _q3);
    const right = _ax.set(1, 0, 0).applyQuaternion(hq);
    const nod = (0.045 * acc + 0.012 * (lip ? Math.max(0, lip.jaw) : 0)) * expressive;
    const yawD = 0.02 * noise1(seed + 21, t * 0.6) * active * expressive;
    const rollD = 0.012 * noise1(seed + 22, t * 0.45) * active * expressive;
    if (nod || yawD || rollD) {
      _q.setFromAxisAngle(right, nod);                        // about the head's +x (the character's left): + = chin down
      _q2.setFromAxisAngle(_v.set(0, 1, 0).applyQuaternion(hq), yawD);
      _q.multiply(_q2);
      _q2.setFromAxisAngle(_v.set(0, 0, 1).applyQuaternion(hq), rollD);
      _q.multiply(_q2);
      const pq = hb.parent ? wquat(hb.parent, _q2) : _q2.identity();
      hb.quaternion.premultiply(_q3.copy(pq).invert().multiply(_q).multiply(pq));
      hb.updateMatrixWorld(true);
    }
  }
  // ---- gaze (eyes): target + fixation pattern + saccades + aversion at line starts
  const gaze = gazeEyes(api, ch, t, o, sp);
  if (gaze) {
    // lids follow the eyes (upper lid rides on the iris when looking down)
    const pitch = gaze.pitch, yaw = gaze.yaw;
    for (const s of ['Left', 'Right']) {
      if (pitch < 0) W[`${s}LidsDown`] = (W[`${s}LidsDown`] || 0) + Math.min(1.2, -pitch / 0.372) * 0.9;
      else W[`${s}LidsUp`] = (W[`${s}LidsUp`] || 0) + Math.min(1, pitch / 0.346) * 0.7;
      const yk = Math.min(1, Math.abs(yaw) / 0.33) * 0.5;
      // yaw > 0: the eyes turn to the character's LEFT
      W[`${s}Lids${yaw > 0 ? 'TurnLeft' : 'TurnRight'}`] = (W[`${s}Lids${yaw > 0 ? 'TurnLeft' : 'TurnRight'}`] || 0) + yk;
    }
  }
  api.rig.apply(W);
  if (gaze) setEyes(api, gaze);
  // ---- blinks (morphs); a fearful face blinks more, a resting lid closure from the emotion's lids
  const bw = o.blink === false ? 0 : blinkAt(api, t, clamp01((emo.fear || 0) + (emo.worry || 0) * 0.4));
  const lidRest = opts.lid ?? 0.08;
  for (const m of ch.meshes) {
    const d = m.morphTargetDictionary;
    if (!d) continue;
    if (d.blinkL !== undefined) m.morphTargetInfluences[d.blinkL] = Math.min(1, lidRest + (1 - lidRest) * bw);
    if (d.blinkR !== undefined) m.morphTargetInfluences[d.blinkR] = Math.min(1, lidRest + (1 - lidRest) * bw);
  }
  ch.root.updateMatrixWorld(true);
  return { units: W, emo, lip, blink: bw, gaze, speaking: !!sp };
}

/** Compute both eyes' head-relative yaw / pitch toward the target (with the fixation pattern). */
function gazeEyes(api, ch, t, o, sp) {
  if (!api._eyes.length || !api._head) return null;
  const seed = api.seed;
  const head = api._head;
  head.updateWorldMatrix(true, false);
  const hq = wquat(head, new THREE.Quaternion());
  const hqi = hq.clone().invert();
  const P = new THREE.Vector3();
  const cur = gazeTarget(api, ch, t, P);
  const sacc = api._opts.saccade ?? 1;
  // fixation pattern: a face is read eye-eye-mouth; anything else gets small re-fixations
  const cell = 0.55 + 0.6 * hash01(seed, 7);
  const k = Math.floor(t / cell);
  const tk = t - k * cell;
  const pick = (j) => hash01(seed, 1000 + j);
  const fix = (j) => {
    const r = pick(j);
    if (cur?.person) return r < 0.42 ? [0.032, 0] : r < 0.84 ? [-0.032, 0] : [0, -0.07];
    return [(hash01(seed, 2000 + j) - 0.5) * 0.05, (hash01(seed, 3000 + j) - 0.5) * 0.03];
  };
  const f0 = fix(k - 1), f1 = fix(k);
  const s = smooth(tk / 0.05);
  const off = [f0[0] + (f1[0] - f0[0]) * s, f0[1] + (f1[1] - f0[1]) * s].map((x) => x * sacc);
  // aversion: a speaker often looks away at the start of a thought and back as it lands
  let avY = 0, avP = 0;
  if (sp && sp.line.lookAway && hash01(seed, 500 + sp.line.idx) < 0.55) {
    const L = sp.line.L, tau = sp.tau;
    const a = smooth((tau - (L.speechIn - 0.15)) / 0.12) * (1 - smooth((tau - (L.speechIn + 0.55 + 0.6 * hash01(seed, 510 + sp.line.idx))) / 0.15));
    avY = (hash01(seed, 520 + sp.line.idx) < 0.5 ? -1 : 1) * 0.16 * a;
    avP = -0.1 * a;
  }
  const res = { yaw: 0, pitch: 0, eyes: [] };
  let ny = 0;
  for (const e of api._eyes) {
    e.b.updateWorldMatrix(true, false);
    const ep = wpos(e.b, new THREE.Vector3());
    let yaw = 0, pitch = 0;
    if (cur) {
      // the fixation offset is an angle across the line of sight
      const d = P.clone().sub(ep).applyQuaternion(hqi);
      // remove the eye's own rest direction
      const restF = new THREE.Vector3(0, 0, 1).applyQuaternion(e.rel);
      const ry = Math.atan2(restF.x, restF.z), rp = Math.atan2(restF.y, Math.hypot(restF.x, restF.z));
      yaw = Math.atan2(d.x, d.z) - ry;
      pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) - rp;
      const dist = d.length();
      yaw += Math.atan2(off[0] * 0.15, Math.max(0.3, dist)) * (cur.person ? 1 : 6);
      pitch += Math.atan2(off[1] * 0.15, Math.max(0.3, dist)) * (cur.person ? 1 : 6);
      yaw *= cur.amount; pitch *= cur.amount;
    } else {
      yaw = off[0] * 1.2; pitch = off[1] * 1.2;
    }
    yaw += avY; pitch += avP;
    // eyes cannot turn further than the orbit allows (the head / body layer must turn the rest)
    yaw = Math.max(-EYE_YAW, Math.min(EYE_YAW, yaw));
    pitch = Math.max(-EYE_DOWN, Math.min(EYE_UP, pitch));
    res.eyes.push({ e, yaw, pitch });
    res.yaw += yaw; res.pitch += pitch; ny++;
  }
  res.yaw /= ny; res.pitch /= ny;
  res.hq = hq;
  return res;
}

function setEyes(api, gaze) {
  const head = api._head;
  head.updateWorldMatrix(true, false);
  const hq = wquat(head, new THREE.Quaternion());
  for (const { e, yaw, pitch } of gaze.eyes) {
    // eye world = head world * (gaze rotation in the head frame) * eye rest relative to the head
    _q.setFromEuler(_e.set(-pitch, yaw, 0, 'YXZ'));
    const q = hq.clone().multiply(_q).multiply(e.rel);
    e.b.parent.updateWorldMatrix(true, false);
    setWorldQuat(e.b, q);
  }
}
