// Shot director - a set scene WITH per-episode continuity (engine phase 7): the scene files the engine writes for a
// new episode call this createSetScene({ ..., continuity }) (continuity = the episode's final/continuity.js, see
// staging/continuity.js) instead of stage.js's own; stage.js itself is unchanged.
import { createSetScene as createBase } from '../stage.js';
import { applyContinuity } from './continuity.js';

export { applyContinuity };
export function createSetScene({ continuity = null, ...o }) {
  if (continuity) applyContinuity(continuity);
  return createBase(o);
}
