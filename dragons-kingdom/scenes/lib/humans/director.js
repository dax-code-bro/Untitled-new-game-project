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
// The body (planted-foot gait, postures, gestures) has a hook too - directorBody() - for when the
// stage passes the blocking as a function of time (info.stateAt): see README.md "Director".
import { loadPerformanceData, directorFace } from './perform.js';

let enabled = true;
let registered = null;

/** Turn the automatic registration off (or on) before the first loadCharacter(). */
export function setDirectorHooks(on) { enabled = !!on; }

/**
 * Register the performance actions with the director (once). Resolves to the names registered ([]
 * when the director library is not there or hooks are off). opts: { force, face: {...faceperf opts} }
 */
export function registerDirectorHooks(opts = {}) {
  if (!enabled && !opts.force) return Promise.resolve([]);
  if (!registered) {
    registered = (async () => {
      let actions;
      try { actions = await import('../director/actions.js'); } catch { return []; }
      const data = await loadPerformanceData();
      const names = [];
      if (opts.force || !actions.humanAction('face')) { actions.registerHumanAction('face', directorFace(data, opts)); names.push('face'); }
      return names;
    })();
  }
  return registered;
}
