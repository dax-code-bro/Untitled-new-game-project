// Shot director - PER-EPISODE CONTINUITY (engine phase 7, DESIGN.md section 4), pure data code (browser AND Node).
// An episode's final/continuity.js:
//   export default { scenes: { '<scene>': { tod, weather, notes } },
//                    sets: { '<SET>': { '<scene>': { sun: [x, y, z], tod, exposure, lamps, perShot } } } }
// is laid over the registry (registry.js SCENE_CONTINUITY / SETS[..].continuity) of ONE page or process: registry.js
// stays Episode 1's, and a scene key of another episode ('1A' again) never mixes with Episode 1's. The scene files
// the engine writes pass it to staging/set-scene.js createSetScene({ ..., continuity }); build-shots.mjs applies it
// before it writes the shot tables (each row's `continuity`). Episode 1 has no continuity.js: nothing changes.
import { SETS, SCENE_CONTINUITY } from '../registry.js';

/** Lay an episode's continuity over the registry (idempotent; returns the ids it touched). */
export function applyContinuity(cont) {
  const touched = [];
  for (const [k, v] of Object.entries(cont?.scenes || {})) { SCENE_CONTINUITY[k] = { ...(SCENE_CONTINUITY[k] || {}), ...v }; touched.push(k); }
  for (const [id, per] of Object.entries(cont?.sets || {})) {
    if (!SETS[id]) continue;
    SETS[id] = { ...SETS[id], continuity: { ...(SETS[id].continuity || {}), ...per } };
    touched.push(id);
  }
  return touched;
}
