/* ============================================================
   TEXTURE PACKS — real photographed materials, dropped in.
   ============================================================
   Every surface in this game is generated per texel in JavaScript, and
   there is a ceiling on that. A procedural brick is a good brick when
   somebody has written a good brick function; it is never a photograph
   of a wall in Ostend, and a close-up will always say so.

   This is the door for the other kind. Point a recipe at three image
   files and every surface built from that recipe uses them instead --
   not some of them, ALL of them, because the maps are shared one set
   per recipe now (see Material._buildMaps). One call swaps the brick in
   a whole level.

   WHAT A PACK IS. The same three maps the procedural side produces, so
   nothing downstream changes and no shader learns a new trick:

     albedo   colour, in sRGB
     normal   tangent space, OpenGL convention (green points UP)
     orm      red = ambient occlusion, green = roughness, blue = metal

   That layout is what ambientCG, Poly Haven and most CC0 libraries
   publish, give or take packing the ORM channels into separate files --
   which `fromChannels` below assembles.

   NOTHING IS REQUIRED. A pack that fails to load, 404s, or is never
   supplied leaves the procedural texture exactly where it was. That is
   deliberate: the game has to run from a clone with no assets in it,
   and an art pipeline that turns a missing file into a black level is
   a worse game than a slightly soft one.
   ============================================================ */

/* Load one image and hand back its pixels. The browser does the
   decoding -- PNG, JPEG, WebP, whatever it already knows -- so this
   file does not contain a decoder. */
function loadImagePixels(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { reject(new Error('empty image: ' + url)); return; }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      resolve({ data: new Uint8Array(cx.getImageData(0, 0, w, h).data.buffer), w, h });
    };
    img.onerror = () => reject(new Error('could not load ' + url));
    img.src = url;
  });
}

/* Three greyscale files into one ORM. Most libraries ship occlusion,
   roughness and metalness as separate images; the shader wants them in
   one texture's three channels. Any of them may be null, in which case
   the channel takes its default: lit, rough, dielectric. */
async function ormFromChannels(ao, rough, metal) {
  const imgs = await Promise.all([ao, rough, metal].map((u) => (u ? loadImagePixels(u) : null)));
  const first = imgs.find(Boolean);
  if (!first) return null;
  const w = first.w, h = first.h;
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = imgs[0] ? imgs[0].data[i * 4] : 255;
    out[i * 4 + 1] = imgs[1] ? imgs[1].data[i * 4] : 204;
    out[i * 4 + 2] = imgs[2] ? imgs[2].data[i * 4] : 0;
    out[i * 4 + 3] = 255;
  }
  return { data: out, w, h };
}

/* Point a recipe at a set of images.
 *
   Resolves to true when the surfaces changed and false when they did
   not, and never throws: a pack is an improvement, not a dependency.

   The images go into the SAME GL texture objects the materials already
   hold, exactly as upgradeTextures does, so nothing has to be found and
   rebound and every actor using that recipe is different on the next
   frame it draws. */
Engine.prototype.useTexturePack = async function (kind, pack) {
  const gl = this.renderer && this.renderer.gl;
  const store = gl && gl.__legendTexCache;
  if (!store || !kind || !pack) return false;

  /* The recipe has to be in use already -- there is a texture to
     replace only if something was built from it. A pack for a material
     no map asked for is not an error, it is simply nothing to do. */
  let entry = null, key = null;
  for (const [k, v] of store) {
    if (k.split(':')[0] === kind) { entry = v; key = k; break; }
  }
  if (!entry) return false;

  try {
    /* `height` is the fourth image every CC0 library ships beside the
       ORM set -- ambientCG and Poly Haven both call it Displacement --
       and until now it had nowhere to go, so a photographed brick came
       in FLATTER than the procedural brick it replaced. It goes where
       the procedural height goes: the alpha of the ORM texture. */
    const [alb, nrm, orm, hgt] = await Promise.all([
      pack.albedo ? loadImagePixels(pack.albedo) : null,
      pack.normal ? loadImagePixels(pack.normal) : null,
      pack.orm ? loadImagePixels(pack.orm)
        : ormFromChannels(pack.ao, pack.roughness, pack.metalness),
      pack.height ? loadImagePixels(pack.height) : null,
    ]);
    if (alb) entry.albedo.upload(alb.data, alb.w, alb.h);
    if (nrm) entry.normal.upload(nrm.data, nrm.w, nrm.h);
    if (orm) {
      /* Merge the displacement into the ORM alpha BEFORE the upload,
         and record the relief the same way the procedural bake does so
         the shader's depth scale means the same thing for a photograph
         as it does for a recipe. A displacement map is authored full
         range 0..255, so it is mapped onto the same fixed window the
         recipes use rather than onto its own extremes -- otherwise a
         photographed sheet of paper would get a brick's mortar depth.
         Sizes are required to match; a mismatched pair is ignored
         rather than resampled, because a pack that ships a 2K albedo
         with a 1K height is a pack with a mistake in it and a silently
         stretched height reads as a smear nobody can source. */
      let hTop = 1, hRange = 0;
      if (hgt && hgt.w === orm.w && hgt.h === orm.h) {
        let lo = 255, hi = 0;
        for (let i = 0; i < orm.w * orm.h; i++) {
          const v = hgt.data[i * 4];
          orm.data[i * 4 + 3] = v;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        const span = (typeof TextureLib !== 'undefined' && TextureLib.heightSpan != null)
          ? TextureLib.heightSpan : 1.70;
        const bias = (typeof TextureLib !== 'undefined' && TextureLib.heightBias != null)
          ? TextureLib.heightBias : -0.45;
        hTop = (hi / 255) * span + bias;
        hRange = ((hi - lo) / 255) * span;
      } else {
        /* No height in the pack: ormFromChannels writes 255 into every
           alpha, so there is no relief to march and saying so switches
           parallax off for this recipe rather than leaving it driving
           from the procedural range of a texture that is gone. */
        for (let i = 0; i < orm.w * orm.h; i++) orm.data[i * 4 + 3] = 255;
      }
      entry.orm.upload(orm.data, orm.w, orm.h);
      entry.heightTop = hTop;
      entry.heightRange = hRange;
    }
    if (!alb && !nrm && !orm) return false;
    /* Re-key so a later resolution upgrade does not regenerate the
       procedural version straight back over the top of the photograph,
       which it would, because it walks anything below its target size. */
    store.delete(key);
    store.set(kind + ':pack:' + (pack.id || '1'), entry);
    return true;
  } catch (e) {
    /* A missing or malformed pack leaves the procedural texture in
       place. Logged rather than thrown: the level is still playable and
       the player would rather have a soft wall than a stack trace. */
    if (this.warn) this.warn('texture pack "' + kind + '": ' + e.message);
    return false;
  }
};

/* Several at once, from a manifest. Returns the kinds that landed, so a
   caller can say what it got rather than guessing. */
Engine.prototype.useTexturePacks = async function (packs) {
  const got = [];
  for (const kind of Object.keys(packs || {})) {
    // Serial on purpose: decoding several 2K images at once on a phone
    // is a frame the player watches go past.
    // eslint-disable-next-line no-await-in-loop
    if (await this.useTexturePack(kind, packs[kind])) got.push(kind);
  }
  return got;
};
