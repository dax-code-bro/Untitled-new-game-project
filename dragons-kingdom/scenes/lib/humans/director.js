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
// Overlays: 'cradle' (an injured arm held in, sized from the build) replaces the director's simple
// one. The planted-foot gait needs the blocking as a function of time - see README.md "Director".
import { loadPerformanceData, directorFace } from './perform.js';
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
 * overlay: the hook poses every overlay of that name in the state, at its envelope weight).
 *   cradle  { side: 'L' (the HURT arm), height, low, clear, tremble } - motion.js GESTURES.cradle
 */
export const OVERLAYS = {
  cradle(ch, st, t) {
    for (const ov of st?.overlays || []) {
      if (ov.name !== 'cradle' || !(ov.w > 0.001)) continue;
      gestureNow(ch, 'cradle', { side: 'L', ...(ov.o || {}) }, ov.w, t, ov.dt ?? 0);
    }
  },
};

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
