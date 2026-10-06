// Public entry point of the creature library.
export { createCreature, CREATURES } from './creature.js';
export { SPECIES, buildAnatomy } from './anatomy.js';
export { applyPose, restPose, groundRig } from './pose.js';
export * as poses from './poses.js';
export { loadHuman, parseHuman, createRider, createSaddle, mountRider, ridePose, standPose, applyRiderPose } from './rider.js';
