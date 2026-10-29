// Performance hooks for the shot director (scenes/lib/director): every human in a director shot gets
// the performance track's face - lip-sync from the voice takes the shot places (dialogue.js
// placeLines: whole takes and parts of split takes), the line's emotion from its delivery note, the
// scene's mood under it, blinks, and eyes on the blocking's eye-line with fixation saccades.
//
// Registration is automatic: loadCharacter() (index.js) calls registerDirectorHooks() once, which
// registers the 'face' action with scenes/lib/director/actions.js registerHumanAction() - the stage's
// poseHuman() calls it last for every human (custom('face')). Nothing in the director has to change.
// It never replaces a 'face' action someone else registered first (opts.force to do so).
//   import { registerDirectorHooks } from '../humans/director.js';
//   await registerDirectorHooks();              // explicit (the same promise as the automatic one)
//   setDirectorHooks(false)                     // before loading: keep the director's own faces
//
// Overlays: the director's arm acts (cradle, point, wave, reach, touch, handsTo, raiseHand, gesture,
// shove) are posed by the performance gestures (OVERLAYS below) instead of its simpler
// built-ins. The planted-foot gait needs the blocking as a function of time - see README.md "Director".
import { loadPerformanceData, directorFace } from './perform.js';
import * as THREE from 'three';
import { gestureNow, legsNow, createBody } from './motion.js';

let enabled = true;
let registered = null;

/** Turn the automatic registration off (or on) before the first loadCharacter(). */
export function setDirectorHooks(on) { enabled = !!on; }

/**
 * Register the performance actions with the director (once). Resolves to the names registered ([]
 * when the director library is not there or hooks are off). opts: { force, face: {...faceperf opts},
 * legs: true - also the planted-foot legs (opt-in: poseHuman must pass info.stateAt, see directorLegs) }
 */
export function registerDirectorHooks(opts = {}) {
  if (!enabled && !opts.force) return Promise.resolve([]);
  if (opts.legs) {
    return registerDirectorHooks({ ...opts, legs: false }).then(async (names) => {
      const actions = await import('../director/actions.js');
      actions.registerHumanAction('legs', directorLegs(opts));
      return [...names, 'legs'];
    });
  }
  if (!registered) {
    registered = (async () => {
      let actions;
      try { actions = await import('../director/actions.js'); } catch { return []; }
      const data = await loadPerformanceData();
      const names = [];
      if (opts.force || !actions.humanAction('face')) { actions.registerHumanAction('face', directorFace(data, opts)); names.push('face'); }
      // overlays done better here: the cradle of a hurt arm (sized from the build's torso)
      for (const [name, fn] of Object.entries(OVERLAYS)) {
        if (opts.force || !actions.humanAction(name)) { actions.registerHumanAction(name, fn); names.push(name); }
      }
      return names;
    })();
  }
  return registered;
}

/**
 * Overlay actions for the director's blocking acts (poseHuman calls custom(ov.name) for every active
 * overlay: the hook poses every overlay of that name in the state, at its envelope weight) - the
 * performance gestures (motion.js GESTURES: build-sized targets, hand shapes, palms and finger
 * directions, shoulders) instead of the director's simpler built-ins:
 *   cradle     { side: 'L' (the HURT arm), height, low, clear, tremble, across }
 *   point      { side, at }                    wave       { side, rate }
 *   reach      { side, at | to, offset, palm } touch      (= reach, a lighter hand)
 *   support    { side, at | grip }             handsTo    { at | to, spread, palm } both hands
 *   raiseHand  { side } a small raised hand (stop / wait)
 *   gesture    { side, dur } a talking hand    shove      { side | 'both', at | to, dur } a push
 * Targets given as names ('remi.head', a mark) are resolved by the stage's env.point at t.
 */
const pt = (env, at, t) => {
  if (at == null) return null;
  if (Array.isArray(at) || at?.isVector3) return at;
  try { return env?.point ? env.point(at, t) : null; } catch { return null; }
};
function overlayHook(name, map) {
  return (ch, st, t, env) => {
    for (const ov of st?.overlays || []) {
      if (ov.name !== name || !(ov.w > 0.001)) continue;
      for (const [g, o] of map(ov.o || {}, t, env, ov)) gestureNow(ch, g, o, ov.w, t, ov.dt ?? 0);
    }
  };
}
const sides = (o, def = 'R') => (o.side === 'both' ? ['L', 'R'] : [o.side || def]);
export const OVERLAYS = {
  cradle: overlayHook('cradle', (o) => [['cradle', { side: 'L', ...o }]]),
  point: overlayHook('point', (o, t, env) => sides(o).map((sd) => ['point', { ...o, side: sd, at: pt(env, o.at, t) }])),
  wave: overlayHook('wave', (o) => sides(o).map((sd) => ['wave', { ...o, side: sd }])),
  // reach / touch / handsTo keep the hand's fingers (a held prop's grip, the build's drape hand) unless
  // the act names a shape or a palm direction - like the director's own built-in
  reach: overlayHook('reach', (o, t, env) => {
    const p = atPoint(env, o, t);
    return p ? sides(o).map((sd) => ['reach', { ...o, side: sd, at: p, shape: handShapeOf(o, 'cup') }]) : [];
  }),
  touch: overlayHook('touch', (o, t, env) => {
    const p = atPoint(env, o, t);
    return p ? sides(o).map((sd) => ['reach', { ...o, side: sd, at: p, shape: handShapeOf(o, 'relaxed') }]) : [];
  }),
  handsTo: overlayHook('handsTo', (o, t, env) => {
    const p = atPoint(env, o, t);
    return p ? ['L', 'R'].map((sd) => ['reach', { ...o, side: sd, at: p, lateral: o.spread ?? 0.09, palm: o.palm || [0, 1, 0], shape: o.shape || 'cup' }]) : [];
  }),
  raiseHand: overlayHook('raiseHand', (o) => sides(o).map((sd) => ['raiseHand', { ...o, side: sd }])),
  gesture: overlayHook('gesture', (o) => sides(o).map((sd) => ['explain', { beat: o.dur ?? 1.0, ...o, side: sd }])),
  shove: overlayHook('shove', (o, t, env) => {
    const at = pt(env, o.at ?? o.to, t);
    return sides(o, 'both').map((sd) => ['shove', { ...o, side: sd, at: at ? (at.isVector3 ? at.clone() : new THREE.Vector3(...at)) : null }]);
  }),
  // (not 'carry': the director carries things - linen, a bowl - with forearms forward; the performance
  // carry is a seat for a child, used through perform.js carry())
};
function atPoint(env, o, t) {
  const at = pt(env, o.at ?? o.to, t);
  if (!at) return null;
  const p = at.isVector3 ? at.clone() : new THREE.Vector3(...at);
  return o.offset ? p.add(new THREE.Vector3(...o.offset)) : p;
}
const handShapeOf = (o, def) => o.shape || (o.palm || o.fingers ? def : null);


/**
 * Planted-foot legs for director shots (registerHumanAction('legs', directorLegs())). poseHuman places
 * the root and pelvis from the blocking; this replaces only its leg step: a body per actor and shot
 * follows the blocking sampled over the shot (info.stateAt(tt) -> the actor's state at shot time tt,
 * info.seconds = shot length), so every stance foot stays fixed in the world (heel strike, roll,
 * toe-off, swing with clearance; walk / run blend by speed) and the pelvis dips where a leg would
 * over-extend. The blocking's kneel / sit ramps move the feet like the director's own stances.
 * Needs the stage to pass stateAt (an error says so otherwise: legs left unsolved would sink).
 */
export function directorLegs(opts = {}) {
  return (ch, st, t, env, info = {}) => {
    if (typeof info.stateAt !== 'function') throw new Error("humans/director.js 'legs': poseHuman's info needs stateAt(tt) (the actor's blocking state at shot time tt) - scenes/lib/humans/README.md, Director");
    const shot = info.shot ?? '';
    ch._legsByShot = ch._legsByShot || new Map();
    let body = ch._legsByShot.get(shot);
    if (!body) {
      const s0 = info.stateAt(0);
      const parented = !!(ch.root.parent && !ch.root.parent.isScene);
      const ground = parented || !env?.ground ? () => s0.y ?? 0 : env.ground;
      body = createBody(ch, { ground, seed: shot });
      const T1 = (info.seconds ?? 30) + 2;
      body.place(s0.x, s0.z, s0.yaw);
      body.follow((tt) => { const s = info.stateAt(Math.min(T1 - 2, Math.max(0, tt))); return { x: s.x, z: s.z, yaw: s.yaw }; }, -2, T1);
      ch._legsByShot.set(shot, body);
      if (ch._legsByShot.size > 8) ch._legsByShot.delete(ch._legsByShot.keys().next().value);
    }
    legsNow(body, t, st?.posture || {});
  };
}
