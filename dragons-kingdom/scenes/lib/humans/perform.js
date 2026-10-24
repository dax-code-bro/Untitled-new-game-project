// CHARACTER PERFORMANCE - the API the director (and any scene) calls. One performer per character
// combines the body (motion.js: walks / runs with planted feet, weight shift, gestures, postures,
// falls, head look) and the face (faceperf.js: lip-sync from the Episode 1 voice takes, emotion
// layers, blinks, gaze, brows). Everything is scheduled up front and evaluated as a pure function
// of t:
//
//   import { loadPerformanceData, createPerformer } from '../lib/humans/perform.js';
//   // setup(ctx)
//   const data = await loadPerformanceData();
//   const alex = createPerformer(await loadCharacter('alexandria'), data);
//   alex.place(0, 0, Math.PI).mood({ tender: 0.3 });
//   alex.lookAt({ ch: other.ch }, 0);
//   alex.performLine('L011', 1.2);              // the take's WAV starts at t = 1.2
//   alex.walkPath([[0, 0], [1, 2]], 4.0, { speed: 1.1, endYaw: 0 });
//   alex.gesture('point', 6.0, { side: 'R', at: [3, 2, 5] });
//   // update(t, ctx)
//   alex.update(t);
//
// Characters that touch each other (support, carry) must be updated in order: the one touched
// first. Lines: data/lipsync-s01e01.json (offline/lipsync_align.py). Line ids are dialogue.json ids
// (L011, X12-07, NV-1E-04, ...).
import * as THREE from 'three';
import { loadFaceUnits } from './face.js';
import { createFacePerformer, lineEmotion, LINE_OVERRIDES } from './faceperf.js';
import { createBody, carryChild, Trajectory, GESTURES } from './motion.js';

export { lineEmotion, LINE_OVERRIDES, SCENE_MOOD } from './faceperf.js';
export { EMOTIONS, emotionUnits, emotionFromDelivery } from './expressions.js';
export { GESTURES, Trajectory, carryChild, gaitParams } from './motion.js';

export const LIPSYNC_URL = new URL('./data/lipsync-s01e01.json', import.meta.url).href;

let dataP = null;
/** Load the lip-sync / delivery data and the face units (cached). */
export function loadPerformanceData(url = LIPSYNC_URL) {
  if (!dataP) {
    dataP = (async () => {
      const [doc, units] = await Promise.all([
        fetch(url).then((r) => { if (!r.ok) throw new Error(`performance data: ${url} (${r.status})`); return r.json(); }),
        loadFaceUnits(),
      ]);
      return { lines: doc.lines, units, source: doc.source };
    })();
  }
  return dataP;
}

/** The dialogue role of a cast id (dialogue.json speaker names). */
export const ROLE_OF = {
  remi: 'REMI', remi_ride: 'REMI', abby: 'ABBY', abby_injured: 'ABBY', abby_sling: 'ABBY', abby_ride: 'ABBY', abby_ride_injured: 'ABBY',
  alexandria: 'ALEXANDRIA', fall: 'QUEEN FALL', fall_ride: 'QUEEN FALL', king: 'KING OF CLING', attendant: 'ATTENDANT',
  healer: 'HEALER', messenger: 'MESSENGER', keeper1: 'GROUND KEEPER', keeper2: 'GROUND KEEPER', vendor: 'VENDOR',
  parent: 'PARENT', child: 'CHILD', musician: 'MUSICIAN', musician2: 'MUSICIAN', guard_captain: 'GUARD CAPTAIN',
  guard1: 'GUARD', guard2: 'GUARD', guard3: 'GUARD', watchman: 'WATCHMAN', sailor1: 'SAILOR', sailor2: 'SAILOR',
};

/**
 * A performer for one loaded character (loadCharacter()). opts: { role, seed, ground(x, z),
 * arms ('auto' | 'hang' | 'drape'), face: { ... faceperf opts }, idle: { ... } }
 */
export function createPerformer(ch, data, opts = {}) {
  const body = createBody(ch, { ground: opts.ground, arms: opts.arms, seed: opts.seed, idle: { eyes: false, blink: false, ...(opts.idle || {}) }, weightShift: opts.weightShift, headLook: opts.headLook });
  const face = data ? createFacePerformer(ch, data, { role: opts.role || ROLE_OF[ch.id], seed: opts.seed, ...(opts.face || {}) }) : null;
  const carries = [];
  const P = {
    ch, body, face, data,
    /** Stand at (x, z) facing yaw before the first walk. */
    place(x, z, yaw = 0) { body.place(x, z, yaw); return P; },
    /**
     * Speak a line: the take's WAV time 0 plays at t0. o: { emo (emotion mix override), gain,
     * amp (mouth), beats (true: small talking-hand beats on stressed words when the arms are free),
     * side ('R') }. Returns { speechIn, speechOut } in scene time.
     */
    performLine(id, t0, o = {}) {
      if (!face) throw new Error('performer has no face data (createPerformer(ch, data))');
      face.say(id, t0, o);
      const rec = data.lines[id];
      const sIn = t0 + (rec.ph?.[0]?.[1] ?? 0) / 100, sOut = t0 + (rec.ph?.length ? rec.ph[rec.ph.length - 1][2] / 100 : rec.dur);
      if (o.beats) {
        // one beat per long stressed word (a hand comes up on the thought, settles at its end)
        const words = rec.words || [];
        let last = -9;
        for (const [w, a, b] of words) {
          const ta = t0 + a / 100;
          if ((b - a) / 100 < 0.28 || ta - last < 1.6) continue;
          body.gesture('explain', ta - 0.25, { side: o.side || 'R', in: 0.35, dur: Math.max(0.3, (b - a) / 100), out: 0.6, beat: 0.8 });
          last = ta;
        }
      }
      return { speechIn: sIn, speechOut: sOut, emotion: lineEmotion(rec, id) };
    },
    /** Walk through points [[x, z], ...] from t0. o: { speed (1.3), endYaw, accel, decel } -> { t1 } */
    walkPath(points, t0, o = {}) { return body.walk(points, t0, o); },
    /** Run (speed default 3.6 m/s). */
    runPath(points, t0, o = {}) { return body.walk(points, t0, { speed: 3.6, ...o }); },
    /** Follow an external root motion fn(t) -> { x, z, yaw } (director blocking, crowd sim). */
    follow(fn, t0, t1) { body.follow(fn, t0, t1); return P; },
    trajectory(tr) { body.trajectory(tr); return P; },
    /** Arm gesture: point | wave | reach | support | cradle | handsToFace | protectHead | flail | carry | explain */
    gesture(name, t0, o = {}) { body.gesture(name, t0, o); return P; },
    /** Posture: crouch | kneel | cower | hunch (o: { in, hold, out }) */
    posture(name, t0, o = {}) { body.posture(name, t0, o); return P; },
    stagger(t0, o = {}) { body.stagger(t0, o); if (face) face.react(PAIN_FLINCH, t0, 0.9); return P; },
    fall(t0, o = {}) { body.fall(t0, o); if (face) face.react(PAIN_FLINCH, t0, 1.2); return P; },
    /** Head + eyes look at a target from t0 (Vector3 | [x,y,z] | fn(t) | { ch, bone, offset } | null). */
    lookAt(target, t0 = -1e9, o = {}) {
      const tg = target?.ch === undefined && target?.performer ? { ch: target.performer.ch } : target;
      body.look(tg, t0, o);
      if (face) face.look(tg, t0, { person: !!tg?.ch, ...o });
      return P;
    },
    /** Eyes only (the head stays): a glance. */
    glance(target, t0, o = {}) { if (face) face.look(target, t0, o); return P; },
    /** Base mood over [t0, t1]: { worry: 0.4, pain: 0.3 } */
    mood(mix, t0 = -1e9, t1 = 1e9, fade = 0.6) { if (face) face.mood(mix, t0, t1, fade); return P; },
    /** A facial reaction (units) at t0: e.g. P.react('wince', 3.2) */
    react(kind, t0, dur = 0.8) { if (face) face.react(typeof kind === 'string' ? REACTIONS[kind] : kind, t0, dur); return P; },
    /** Carry another performer (a child) from t0 to t1: this one's arms make a seat, the child is posed on it. */
    carry(child, t0, t1 = 1e9) {
      carries.push({ child, t0, t1 });
      body.gesture('carry', t0, { in: 0.6, dur: t1 - t0 - 0.6, out: 0.6 });
      return P;
    },
    /** Where the root is at t. */
    rootAt(t) { return body.rootAt(t); },
    /** Pose everything for t (pure). o: { face: false, blink: false } */
    update(t, o = {}) {
      const b = body.apply(t, o);
      for (const c of carries) {
        const w = Math.min(1, Math.max(0, (t - c.t0) / 0.6)) * Math.min(1, Math.max(0, (c.t1 - t) / 0.6));
        if (w > 0) {
          c.child.update(t, o);
          carryChild(body, c.child.body, w);
          if (c.child.face && o.face !== false) c.child.face.apply(t, o);
        }
      }
      const f = face && o.face !== false ? face.apply(t, o) : null;
      return { body: b, face: f };
    },
  };
  return P;
}

const PAIN_FLINCH = { LeftBrowDown: 0.6, RightBrowDown: 0.6, LeftUpperLidClosed: 0.6, RightUpperLidClosed: 0.6, LeftLowerLidUp: 0.6, RightLowerLidUp: 0.6, NoseWrinkler: 0.4, MouthLeftPlatysma: 0.4, MouthRightPlatysma: 0.4, UpperLipUp: 0.3, JawOpen: 0.12 };
export const REACTIONS = {
  wince: PAIN_FLINCH,
  gasp: { LeftInnerBrowUp: 0.5, RightInnerBrowUp: 0.5, LeftUpperLidOpen: 0.4, RightUpperLidOpen: 0.4, JawOpen: 0.3, JawDrop: 0.1 },
  startle: { LeftInnerBrowUp: 0.6, RightInnerBrowUp: 0.6, LeftOuterBrowUp: 0.6, RightOuterBrowUp: 0.6, LeftUpperLidOpen: 0.7, RightUpperLidOpen: 0.7, MouthLeftPlatysma: 0.3, MouthRightPlatysma: 0.3, JawOpen: 0.15 },
  smile: { LeftCheekUp: 0.4, RightCheekUp: 0.4, MouthLeftPullUp: 0.4, MouthRightPullUp: 0.4 },
};

/** Functional form: schedule a line on a performer. */
export function performLine(performer, lineId, t0, o) { return performer.performLine(lineId, t0, o); }
/** Functional form: walk a path. */
export function walkPath(performer, points, t0, o) { return performer.walkPath(points, t0, o); }

/** A Trajectory sampled from the director's blocking: fn(t) -> { x, z, yaw } over [t0, t1]. */
export function trajectoryFromBlocking(fn, t0, t1) { return Trajectory.fromFn(fn, t0, t1); }

// ----------------------------------------------------------- director hooks --
/**
 * A face action for the shot director (scenes/lib/director/actions.js registerHumanAction('face', fn)):
 * lip-sync from the shot's PLACED lines (dialogue.js placeLines), emotion from the take's delivery
 * note, blinks, gaze toward the blocking's look target. One face performer per character and shot.
 *   import { directorFace, loadPerformanceData } from '../humans/perform.js';
 *   registerHumanAction('face', directorFace(await loadPerformanceData()));
 * info: { placed, role, shot, mood? } (as poseHuman passes it); env.point(name, t) for the look target.
 */
export function directorFace(data, opts = {}) {
  return (ch, st, t, env, info = {}) => {
    const shot = info.shot ?? '';
    ch._perfByShot = ch._perfByShot || new Map();
    let f = ch._perfByShot.get(shot);
    if (!f) {
      f = createFacePerformer(ch, data, { role: info.role || ROLE_OF[ch.id], ...(opts.face || {}) });
      const role = info.role || ROLE_OF[ch.id] || String(ch.id).toUpperCase();
      for (const p of info.placed || []) {
        if (p.role !== role || !data.lines[p.id]) continue;
        // shot time of take time 0: at_s is where file_in_s plays
        f.say(p.id, p.at_s - p.file_in_s, {});
      }
      if (info.mood) f.mood(info.mood);
      if (st?.look?.at != null && env?.point) f.look((tt) => env.point(st.look.at, tt), st.look.t0 ?? -1e9);
      ch._perfByShot.set(shot, f);
      if (ch._perfByShot.size > 8) ch._perfByShot.delete(ch._perfByShot.keys().next().value);
    }
    f.apply(t, {});
  };
}
