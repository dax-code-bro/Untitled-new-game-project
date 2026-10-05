// Like stateful-scene.js, but with the default warmupFrames (0): every chunk
// simulates from its own first frame. Used for --twos with an odd start.
export { setup, reset, update } from './stateful-scene.js';
export const meta = { title: 'Stateful fixture, no warm-up', duration: 2, mode: 'chunk-warmup', warmupFrames: 0 };
