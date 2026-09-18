/* ============================================================
   TEXTURE RESOLUTION — load fast, sharpen a moment later.
   ============================================================
   The surfaces in this game are generated per texel in JavaScript, and
   that is the whole reason they were stuck at 256 pixels:

       256px   all seventeen recipes    0.57 s
       512px                            1.74 s
       768px                            3.72 s
      1024px                            6.23 s

   -- on a desktop. Multiply by three or four for a phone and a
   1024-pixel world is half a minute of staring at a loading bar, which
   is a worse game than a slightly soft one.

   But nothing says the size has to be decided once. The maps are SHARED
   now, one set per recipe rather than one per material (see
   Material._buildMaps), and that changes what is possible here: there
   are seventeen textures in the whole game, every wall in the level
   points at the same brick, and re-uploading that one texture at four
   times the size sharpens every wall at once. No materials to find, no
   actors to touch, no rebinding -- the GL texture object is the same
   object, it simply has more pixels in it than it did a second ago.

   So: build at 256, which is fast and is what you see while the map
   settles, then walk the recipes ONE PER CALL and upgrade them. One
   recipe is 100-370 ms depending on the target, which is a hitch if you
   do seventeen of them in a frame and nothing at all if you do one
   every half second while the player is reading the round counter.

   It is deliberately not clever about which recipes matter most. The
   obvious refinement -- do the ones covering the most screen first --
   needs a screen to look at, and by the time you have one the whole set
   is done anyway.
   ============================================================ */

Engine.prototype.upgradeTextures = function (size, opts = {}) {
  const gl = this.renderer && this.renderer.gl;
  const store = gl && gl.__legendTexCache;
  if (!store || !size) return null;

  /* Every recipe that is actually in use, at a size below the target.
     A map that never asks for marble never pays for marble. */
  const jobs = [];
  for (const [key, maps] of store) {
    const bits = key.split(':');
    const kind = bits[0], was = +bits[1], seed = +bits[2];
    if (!(was < size)) continue;
    jobs.push({ key, kind, was, seed, maps });
  }
  if (!jobs.length) return null;

  let i = 0;
  const state = { total: jobs.length, done: 0, size, running: true };
  const step = () => {
    if (!state.running || i >= jobs.length) {
      state.running = false;
      if (opts.onDone) opts.onDone(state);
      return;
    }
    const j = jobs[i++];
    try {
      const data = TextureLib.generate(j.kind, size, j.seed);
      /* Straight back into the SAME texture objects. texImage2D
         reallocates, so the bigger data simply replaces the smaller and
         every material already pointing at this texture is sharper on
         the next frame it draws. */
      j.maps.albedo.upload(data.albedo, size, size);
      j.maps.normal.upload(data.normal, size, size);
      j.maps.orm.upload(data.orm, size, size);
      /* Re-key it so a second pass does not redo work already done. */
      store.delete(j.key);
      store.set(j.kind + ':' + size + ':' + j.seed, j.maps);
    } catch (e) {
      /* One recipe failing is one soft surface, not a dead game. */
      void e;
    }
    state.done++;
    if (opts.onStep) opts.onStep(state);
    schedule();
  };
  const schedule = () => {
    if (!state.running) return;
    const gap = opts.gapMs != null ? opts.gapMs : 400;
    setTimeout(step, gap);
  };
  schedule();
  state.stop = () => { state.running = false; };
  return state;
};
