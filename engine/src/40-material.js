/* ============================================================
   MATERIAL — PBR parameters plus procedurally generated textures.
   Nothing is downloaded: albedo, normal and ORM maps are synthesised
   from noise at load, so a game stays a single self-contained file.
   ============================================================ */

/* Convert an sRGB colour (what people type) to linear (what lighting maths
   needs). Skipping this is the single most common reason a hand-rolled
   renderer looks washed out and plasticky. */
function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

function parseColor(c, out = new Vec3()) {
  if (c == null) return out.set(1, 1, 1);
  if (c instanceof Vec3) return out.copy(c);
  if (Array.isArray(c)) return out.set(c[0], c[1], c[2]);
  if (typeof c === 'number') {
    return out.set(
      srgbToLinear(((c >> 16) & 255) / 255),
      srgbToLinear(((c >> 8) & 255) / 255),
      srgbToLinear((c & 255) / 255),
    );
  }
  if (typeof c === 'string') {
    const named = COLOR_NAMES[c.toLowerCase().trim()];
    if (named != null) return parseColor(named, out);
    let s = c.trim().replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s, 16);
    if (Number.isNaN(n)) return out.set(1, 1, 1);
    return parseColor(n, out);
  }
  return out.set(1, 1, 1);
}

const COLOR_NAMES = {
  white: 0xffffff, black: 0x111111, grey: 0x808080, gray: 0x808080,
  red: 0xd83a2e, crimson: 0x9b1b1b, orange: 0xf07d1a, amber: 0xffb020,
  yellow: 0xf2d024, lime: 0x9ad11f, green: 0x2f9e44, forest: 0x1b5e34,
  teal: 0x14a3a3, cyan: 0x2ec8e6, sky: 0x62b6ff, blue: 0x2f6fd0,
  navy: 0x1a2f66, indigo: 0x4a3fd0, purple: 0x8543c4, magenta: 0xd63fb0,
  pink: 0xf08fb4, brown: 0x7a5230, tan: 0xc4a072, sand: 0xd8c08a,
  gold: 0xc9a84c, silver: 0xc0c4c8, copper: 0xb87333, steel: 0x8a9199,
  concrete: 0x9a978f, wood: 0x8b5a2b, brick: 0x9c4a34, ice: 0xbfe6f0,
  skin: 0xe0ac86, water: 0x2a6f97, night: 0x0a0f1c,
};

/* ---------------- Procedural texture synthesis ---------------- */

/* Each generator writes an RGBA albedo map and an ORM map
   (r = ambient occlusion, g = roughness, b = metalness) plus a height
   field that becomes a normal map. Working in height-then-derive keeps
   the normals consistent with the visible detail. */
const TextureLib = {
  _cache: new Map(),

  /* Height → tangent-space normal map, via central differences. */
  heightToNormal(height, size, strength = 2) {
    const out = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const l = height[(y * size + ((x - 1 + size) % size))];
        const r = height[(y * size + ((x + 1) % size))];
        const d = height[(((y - 1 + size) % size) * size + x)];
        const u = height[(((y + 1) % size) * size + x)];
        let nx = (l - r) * strength;
        let ny = (d - u) * strength;
        let nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        const i = (y * size + x) * 4;
        out[i] = ((nx / len) * 0.5 + 0.5) * 255;
        out[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        out[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
        out[i + 3] = 255;
      }
    }
    return out;
  },

  /* Build the three maps for a named surface. Cached per (kind, size). */
  generate(kind, size = 256, seed = 1) {
    const key = `${kind}:${size}:${seed}`;
    if (this._cache.has(key)) return this._cache.get(key);

    const n = new Noise(seed * 7919 + 13);
    /* Cellular noise hangs off the same object the recipes already
       take their noise from, because that is what it is. A recipe is
       called as a plain function -- `fn(u, v, n, c, size)` -- so it has
       no `this` and cannot reach the bank any other way. */
    n.cells = (x, y, sd, period) => TextureLib.worley(x, y, sd, period);
    const albedo = new Uint8Array(size * size * 4);
    const orm = new Uint8Array(size * size * 4);
    const height = new Float32Array(size * size);
    const fn = this.kinds[kind] || this.kinds.concrete;

    const c = { r: 1, g: 1, b: 1, ao: 1, rough: 0.8, metal: 0, h: 0.5 };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        c.r = c.g = c.b = 1; c.ao = 1; c.rough = 0.8; c.metal = 0; c.h = 0.5;
        fn(u, v, n, c, size);
        const i = (y * size + x) * 4;
        albedo[i] = clamp(c.r, 0, 1) * 255;
        albedo[i + 1] = clamp(c.g, 0, 1) * 255;
        albedo[i + 2] = clamp(c.b, 0, 1) * 255;
        albedo[i + 3] = 255;
        orm[i] = clamp(c.ao, 0, 1) * 255;
        orm[i + 1] = clamp(c.rough, 0.03, 1) * 255;
        orm[i + 2] = clamp(c.metal, 0, 1) * 255;
        orm[i + 3] = 255;
        height[y * size + x] = c.h;
      }
    }

    /* Normal strength is per surface, not one number for everything.

       Concrete and rock are genuinely rough at the millimetre and want a
       strong map. Machined steel is not: pushing its height field at the
       same strength turns the brushing into a field of steep facets, and
       under a bright sky every one of them catches a specular highlight —
       a blued receiver comes out looking like it has been sprinkled with
       salt. That is the speckle, and it was never in the albedo. */
    const normal = this.heightToNormal(height, size, this.normalStrength[kind] || 3);
    const maps = { albedo, orm, normal, size };
    this._cache.set(key, maps);
    return maps;
  },

  /* CELLULAR NOISE, AND THE RECIPE THAT NEEDED IT.
   *
     Several recipes here want CELLS rather than clouds: the crystals
     in parkerizing, the pebble grain on a polymer frame, the aggregate
     in asphalt, the stones in gravel. All of them fake it the same
     cheap way -- take two high-frequency fbm fields and find where
     either crosses zero, and the crossings make a net of boundaries.
     That is fine when all you want is the BOUNDARIES.

     It falls apart the moment a cell needs an identity. Gravel wants
     each stone to be a different rock, so it needs to ask "which cell
     am I in" and get the same answer everywhere inside one stone. The
     zero-crossing trick cannot answer that -- the first cut of gravel
     hashed the grid square instead, which is a different partition of
     the plane entirely, so a single visible stone was crossed by
     several colour boundaries and the whole thing rendered as
     terrazzo: correctly sized stones with no stones in them.

     This is the real thing. Feature points jittered inside a grid, the
     nearest one found over the 3x3 neighbourhood; d1 is the distance
     to it, `edge` is F2 minus F1 which goes to zero exactly on a cell
     boundary and is the cleanest joint function there is, and `id` is
     stable across the whole cell because it hashes the FEATURE POINT.

     It wraps. `period` folds the cell coordinates, so the texture
     still tiles -- without that every surface using it would show a
     seam, which on a ground plane is a line across the whole map. */
  worley(x, y, seed, period) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j;
        // Fold into the period so opposite edges agree.
        const wx = ((cx % period) + period) % period;
        const wy = ((cy % period) + period) % period;
        const h = (((wx * 73856093) ^ (wy * 19349663) ^ (seed * 83492791)) >>> 0);
        const jx = cx + 0.08 + ((h % 1024) / 1024) * 0.84;
        const jy = cy + 0.08 + (((h >>> 10) % 1024) / 1024) * 0.84;
        const dx = jx - x, dy = jy - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = h; }
        else if (d < d2) { d2 = d; }
      }
    }
    return { d1, edge: d2 - d1, id: (best % 100003) / 100003,
      id2: ((best >>> 7) % 100003) / 100003 };
  },

  /* WHICH RECIPES ARE A WHOLE MATERIAL, AND WHICH ARE A LAYER.
   *
     Two kinds of recipe live in this bank and the difference has never
     been written down, which is why a test keeps having to carry a
     list of exceptions.

     A VARIATION LAYER supplies pattern and leaves the colour to the
     material. `concrete`, `skin`, `hair`, `fabric`, `wool`. Its job is
     to average near white so that whatever hex a material writes down
     survives being multiplied by it -- one recipe then serves every
     skin tone, every uniform colour, every shade of render. For these
     a dark bake is a BUG: it is how a nominal 0x76736c wall came out
     near 0x2a2a28, and three separate "the lighting is wrong"
     investigations were really this.

     A WHOLE MATERIAL is the finished thing and expects a white tint.
     Brass has to be brass; blued steel is near black because magnetite
     is near black; parkerizing is dark grey-green because phosphate
     is. Asking these to average above a floor would mean asking blued
     steel to be grey, which is not a bug to fix, it is the material.

     The set lives here rather than in the test because it is a
     statement about the recipe, and a recipe and its intent should not
     be able to drift apart in two files. Adding a recipe without
     deciding which kind it is now means failing the suite. */
  wholeMaterial: new Set([
    'brick', 'grass', 'brass', 'copper', 'lead', 'primer', 'bluing',
    'parkerize', 'walnut', 'bakelite', 'polymer', 'leather', 'webbing',
    'denim', 'floaties', 'eye',
    /* The world set. Asphalt is not "concrete but darker" -- it is a
       few per cent of light on a black binder, and a floor over it
       would be demanding a grey road. Setts, pantiles, gravel and mud
       are the colour of the stone and the clay and the earth they are
       made of. Snow, paint and glass are the three that stay pale and
       DO take a tint, so they are not in here. */
    'asphalt', 'setts', 'corrugated', 'pantile', 'gravel', 'mud',
  ]),

  normalStrength: {
    metal: 0.7, smooth: 0.35, glass: 0.2, wood: 1.3, fabric: 1.6,
    concrete: 3, brick: 3, rock: 3, rust: 2.2,
    /* Dirt was falling through to the default 3, and its height field
       carries grit at 80 cycles across a 256-pixel tile -- about three
       texels a cycle. At strength 3 that is a facet per texel, and on a
       surface as large as the battlefield the ground fizzed. Same
       reasoning as the note on metal above. */
    dirt: 1.4, sand: 1.2, grass: 1.2,
    /* Nearly flat. The relief that matters on render is the blowholes,
       and they are deep in a height field that is otherwise almost
       level -- push this up and the trowel sweep becomes corrugation. */
    plaster: 0.9,
    /* Enough relief to give each toy an edge and not so much that the
       ripple under them turns into facets. */
    floaties: 1.0,
    /* ---- the gun set ----
       These are looked at from thirty centimetres rather than three
       metres, so the relief has to survive being magnified rather than
       survive being tiled. The rule is the same one metal follows: a
       strength that puts more than about a quarter-texel of slope on a
       feature turns the feature into a facet, and a faceted cartridge
       case reads as a low-poly cylinder no matter how good the albedo
       on it is. */
    /* LOWER THAN THE ARCHITECTURE, AND THE FIRST SET OF THESE WAS NOT.
       A number here multiplies the slope taken from the height field,
       so it compounds with whatever amplitude the recipe wrote. The
       first cut had both high: 1.7 on leather over a height field
       swinging half its range, at nine centimetres across. The render
       was tooled leather, not worn leather. The heights came down in
       the recipes and these came down with them. */
    brass: 0.30, copper: 0.28, lead: 0.55, primer: 0.25,
    bluing: 0.18, parkerize: 0.85, walnut: 0.35, bakelite: 0.30,
    polymer: 0.80, leather: 0.60, webbing: 1.10,
    /* ---- the body ----
       Hair is the one that wants a lot, because the strand highlight
       is coming out of the normal map -- there is no anisotropic lobe
       in this BRDF to give it any other way. Skin wants very little:
       the crease net is a fraction of a millimetre deep and pushing it
       turns a face into a lizard. An eye and a tooth are wet, smooth
       and have essentially no relief at all. */
    /* SKIN HAS NEVER HAD AN ENTRY HERE, and that is not a small thing.
       The lookup is `this.normalStrength[kind] || 3`, so for as long as
       this bank has existed every face, every hand and every zombie in
       the game has had its skin normal map amplified THREE TIMES --
       the setting used for cast concrete and for rock. It was survivable
       while the recipe's only relief was a pore field so fine it baked
       to noise. The moment skin got a real crease net it rendered as
       orange peel, which is how it was found.

       BRACKETED, because both ends were rendered and both were wrong.
       At 3 (with the crease field cut to 0.18 of the height range) it
       is orange peel. At 0.35 the net vanishes entirely and skin goes
       back to being a matte clay ball -- which is the failure it
       started from, arrived at from the other side. 1.2 is the
       geometric middle, and it is about a fifth of the slope the old
       accident was producing: the net breaks the highlight without
       being a surface you could feel. */
    skin: 1.2,
    hair: 1.6, eye: 0.15, enamel: 0.20, nail: 0.25,
    /* ---- cloth ----
       A weave is real relief, not an optical pattern, so these run
       higher than anything else in the bank. Knit highest: a jumper's
       loops are millimetres proud and it is the only cloth here whose
       silhouette you would notice. */
    wool: 1.8, denim: 2.0, ripstop: 1.5, knit: 2.6,
    /* ---- the world ----
       Setts, gravel and pantiles are the only three in the bank whose
       relief is bigger than the texel grid by a wide margin -- a sett
       crown is centimetres -- so they can take a lot. Snow takes very
       little, because its structure is broad and shallow and a hard
       normal turns a drift into crumpled paper. Glass takes almost
       nothing: what it needs is roughness variation, not slope. */
    asphalt: 1.4, setts: 2.4, corrugated: 1.0, pantile: 2.0,
    gravel: 2.6, snow: 0.7, mud: 1.3, paint: 0.6, glass: 0.25,
  },

  /* Surface recipes. Each writes into `c` for one texel.
     These are tuned by eye for readability at gameplay distance rather
     than for physical accuracy at macro-photography range. */
  kinds: {
    /* Concrete. The albedo here multiplies whatever colour the material
       asks for, so it has to sit near the middle of the range or every
       concrete surface in every scene comes out darker than it was
       authored — the first version centred on 0.42 sRGB, which is 0.15 in
       linear, and a daylit roof deck rendered as a black slab. Pits knock
       the albedo and the ambient down together; both are gentler now, since
       a texture that carries its own deep shadowing cannot be lit back out
       of it. */
    concrete(u, v, n, c) {
      const g = n.fbm(u * 8, v * 8, 0, 5) * 0.5 + 0.5;
      const pits = Math.max(0, n.fbm(u * 26, v * 26, 3.3, 3));
      const stain = n.fbm(u * 3, v * 3, 9, 3) * 0.5 + 0.5;
      const base = 0.66 + g * 0.18 - pits * 0.12;
      c.r = base * (0.98 + stain * 0.06);
      c.g = base * (0.97 + stain * 0.05);
      c.b = base * 0.95;
      /* ROUGHNESS CONTRAST, and the reason it is here rather than in
         the normal map. Under a big diffuse sky -- which is what an
         overcast map IS -- a tilted normal returns nearly the same
         shade as an untilted one, so relief cannot read. Varied SHEEN
         can: it is why overcast is good light for showing material.
         This was 0.82..0.94, a spread of 0.12, which is a single
         roughness with a wobble on it. Now the trowelled face is
         polished and the pitted, stained areas are matte, which is how
         a concrete slab that has been rained on actually looks. Tied to
         the pits and the staining that are already in the albedo, so
         the sheen and the colour agree with each other rather than
         being two unrelated noises on one surface.

         THE MEAN IS HELD, only the spread widens. The first cut of this
         moved dirt from 242 to 219 and grass from 234 to 211 -- which
         is not a contrast pass, it is a gloss pass, and it would have
         made every ground surface in the game wetter than it was
         authored. Each constant below is set so the recipe's average
         roughness lands within a few 255ths of where it already was. */
      c.rough = clamp(0.855 + (g - 0.5) * 0.26 + pits * 0.22 - (stain - 0.5) * 0.16, 0.42, 1);
      c.ao = 1 - pits * 0.28;
      c.h = g * 0.42 - pits * 0.46;
    },

    brick(u, v, n, c) {
      /* Running bond: every other course shifts by half a brick.
       *
         TWELVE COURSES, NOT EIGHT, and the reason is the aspect ratio
         rather than the count. A tile of 8 rows by 4 columns makes a
         brick twice as wide as it is tall. A real brick, with its bed
         joint, is 225 by 75 millimetres -- three to one. At 8 rows
         there is no tile size at all that gives both the right brick
         width and the right course height: pick the width and the
         courses come out half as deep again as a real one, which is
         what makes a rendered wall read as a games-console wall.

         At 12 by 4 the tile is exactly three bricks tall for every one
         it is wide, so a 0.9-metre tile is a 225 x 75 brick to the
         millimetre. Which is why brick is set to 1.11 tiles per metre
         wherever it is used. */
      const rows = 12, cols = 4;
      const ry = v * rows;
      const row = Math.floor(ry);
      const offset = (row % 2) * 0.5;
      const rx = (u * cols + offset) % 1;
      const fy = ry % 1;
      const mortarX = Math.min(rx, 1 - rx) * cols;
      const mortarY = Math.min(fy, 1 - fy) * rows;
      const mortar = Math.min(mortarX, mortarY);
      const isMortar = mortar < 0.22;
      const grain = n.fbm(u * 40, v * 40, row * 3.7, 3) * 0.5 + 0.5;
      if (isMortar) {
        const g = 0.5 + grain * 0.15;
        c.r = g; c.g = g * 0.98; c.b = g * 0.93;
        // Mortar is matte and never quite even.
        c.rough = clamp(0.96 + (grain - 0.5) * 0.12, 0.42, 1);
        c.ao = 0.45 + mortar * 1.4;
        c.h = 0.1 + grain * 0.1;
      } else {
        // Per-brick colour variation keyed off the brick's cell.
        const cell = Math.floor(u * cols + offset) * 31 + row * 17;
        const tint = ((cell * 2654435761) % 1000) / 1000;
        const shade = 0.55 + tint * 0.35 + grain * 0.12;
        c.r = shade * 0.62;
        c.g = shade * 0.30;
        c.b = shade * 0.23;
        /* Brick to brick already varied; now the face of each one does
           too. A fired brick is not uniform -- the skin is closer and
           harder than the body, and a weathered face is matte where a
           sheltered one keeps its sheen. */
        c.rough = clamp(0.90 - tint * 0.16 + (grain - 0.5) * 0.18, 0.42, 1);
        c.ao = 1 - smoothstep(0.5, 0.22, mortar) * 0.35;
        c.h = 0.75 + grain * 0.2;
      }
    },

    /* Timber. Averaged 0.21 -- the darkest generator in the set, and the
       brown was baked into it as well as into every material that uses it.
       Every one of them is authored brown already (0x584023 crates,
       0x5c4028 gun furniture, 0x261f1a bark), so the tint was being applied
       twice: a walnut stock came out at about 1.6% reflectance, which is
       charcoal, and the boards over the windows were indistinguishable
       from the gaps between them.

       The grain stays -- the ring contrast is if anything stronger now,
       since it has room to swing -- but it varies around mid-grey and only
       leans warm. The colour comes from the material, where it was always
       written down. */
    /* TIMBER, AS BOARDS RATHER THAN AS ONE SHEET OF GRAIN.
     *
       This was rings plus fibre: a single continuous wood pattern, no
       plank edges, no knots, no weathering. Photographed from a metre
       away it reads as wallpaper -- which is exactly what a close-up of
       the ranch wall showed, and no amount of detail sampling or
       sharper light fixes a pattern that has only one thing in it. A
       surface reads as real when it has features at several scales AND
       a reason for each of them.

       Five things a real weatherboard wall has that this did not:

         BOARDS      it is made of separate pieces, and the eye finds
                     the seams before it finds the grain.
         SEAMS       which are dark, because dirt collects in them, and
                     recessed, because boards do not meet flush.
         TONE        no two boards came off the same tree. A per-plank
                     hash shifts colour and grain so the wall stops
                     being one texture stretched over a building.
         KNOTS       the one feature that is unmistakably wood.
         WEATHERING  sun greys timber in patches, not evenly, and the
                     patches are much larger than the boards.

       The mean stays where it was -- about 0.78 -- because every colour
       here MULTIPLIES what the material asked for, and this file has
       three separate notes about recipes that quietly ate the colour
       they were handed. */
    wood(u, v, n, c) {
      const NP = 6;                                  // boards per tile
      const vp = v * NP;
      const pi = Math.floor(vp);
      const pf = vp - pi;
      // Each board's own character, off a cheap hash of its index.
      const h1 = ((pi * 2654435761) % 1000) / 1000;
      const h2 = ((pi * 40503 + 17) % 1000) / 1000;
      // The seam, and the dirt in it.
      const seam = Math.min(pf, 1 - pf);
      const seamK = 1 - smoothstep(0.0, 0.055, seam);
      /* Grain runs along the board, and each board's rings are offset
         and wobbled by its own hash, so two stacked boards never line
         up into one continuous figure. */
      const wob = n.fbm(u * 3 + h1 * 8, pf * 1.2 + h2 * 5, 5, 3) * 0.35;
      const rings = Math.abs(((pf * 7 + wob + h1 * 3) % 1) * 2 - 1);
      const fibre = n.fbm(u * 4, pf * 80 + pi * 13, 2, 2) * 0.5 + 0.5;
      const dark = smoothstep(0.35, 0.85, rings);
      // A knot on some boards and not others, placed by the board's hash.
      const kd = Math.hypot((u - h2) * 3.2, (pf - (0.5 + (h1 - 0.5) * 0.5)) * 1.0);
      const knot = h1 > 0.62 ? (1 - smoothstep(0.02, 0.10, kd)) : 0;
      // Sun-greying, at a scale much larger than a board.
      const grey = smoothstep(0.45, 0.85, n.fbm(u * 1.7, v * 1.4, 21, 4) * 0.5 + 0.5);

      let base = 0.84 - dark * 0.20 + fibre * 0.09 - seamK * 0.30 - knot * 0.34;
      base += (h1 - 0.5) * 0.10;                     // board-to-board tone
      /* WEATHERING DESATURATES; IT DOES NOT DARKEN.
       *
         The first cut multiplied every channel by (1 - grey * 0.55),
         which at full weathering is a 45 per cent cut in brightness --
         so the patches came out as black blotches and the wall read as
         SCORCHED rather than sun-bleached. Plainly wrong in the
         screenshot and not visible at all in the code, which described
         itself as greying.

         Timber left in the sun goes silver: it loses its colour and
         gains a little brightness. So the tint factors move toward
         neutral instead of toward zero, and the value lifts slightly
         with them. */
      const g2 = grey * 0.62;
      const tint = (t) => t + (1 - t) * g2;
      base *= 1 + grey * 0.05;
      c.r = base * tint(1.02);
      c.g = base * tint(0.95);
      c.b = base * tint(0.84);
      c.rough = clamp(0.60 + dark * 0.16 + seamK * 0.22 + grey * 0.10 - knot * 0.10, 0.42, 1);
      c.ao = 1 - dark * 0.12 - seamK * 0.45 - knot * 0.25;
      c.h = 0.5 + (1 - dark) * 0.28 + fibre * 0.10 - seamK * 0.55 - knot * 0.30;
    },

    metal(u, v, n, c) {
      /* Brushed: strongly anisotropic noise, plus a few deeper scratches.

         The brush frequency has to stay under the bake's own resolution.
         At 400 cycles across a 256-pixel tile every stroke lands inside a
         single texel, so what gets baked is not brushing at all — it is
         white noise, and steel comes out looking like television static.
         Ninety cycles is about three texels a stroke, which survives the
         bake and still reads as machining. */
      const brush = n.fbm(u * 90, v * 3, 1, 2) * 0.5 + 0.5;
      const patina = n.fbm(u * 6, v * 6, 11, 4) * 0.5 + 0.5;
      /* Scratches were cubed and tripled, which turns a handful of texels
         into near-mirrors: on a dark blued gun those read as a snowstorm of
         white sparkles rather than as wear. Softer, and with a roughness
         floor, so a scratch catches light instead of becoming one. */
      const scratch = Math.pow(Math.max(0, n.fbm(u * 34, v * 5, 21, 2)), 4) * 1.5;
      const base = 0.62 + brush * 0.12 - patina * 0.08;
      c.r = base; c.g = base * 1.01; c.b = base * 1.04;
      c.metal = 1;
      c.rough = clamp(0.30 + brush * 0.16 + patina * 0.10 - scratch * 0.07, 0.16, 0.9);
      c.ao = 1;
      c.h = brush * 0.45 + scratch * 0.22;
    },

    /* Corroded steel. Averaged 0.43 and the orange was baked in, so a
       rusted panel came out a stop and a half below whatever colour it was
       given and always the same orange whatever that colour was. The
       blotches still darken -- corrosion is genuinely darker than the metal
       around it, and that contrast is the whole texture -- they just do it
       around the material's colour rather than underneath it. */
    rust(u, v, n, c) {
      const blotch = n.fbm(u * 5, v * 5, 4, 5) * 0.5 + 0.5;
      const grit = n.fbm(u * 60, v * 60, 8, 3) * 0.5 + 0.5;
      const rusty = smoothstep(0.35, 0.75, blotch);
      c.r = lerp(0.72, 0.58, rusty) * (0.85 + grit * 0.3);
      c.g = lerp(0.72, 0.36, rusty) * (0.85 + grit * 0.3);
      c.b = lerp(0.73, 0.24, rusty) * (0.85 + grit * 0.3);
      c.metal = 1 - rusty * 0.95;
      c.rough = lerp(0.35, 0.95, rusty);
      c.ao = 1 - rusty * 0.25;
      c.h = grit * 0.4 + rusty * 0.4;
    },

    rock(u, v, n, c) {
      const r = n.ridged(u * 6, v * 6, 0, 5);
      const grain = n.fbm(u * 45, v * 45, 7, 3) * 0.5 + 0.5;
      const base = 0.30 + r * 0.30 + grain * 0.08;
      c.r = base * 1.02; c.g = base * 0.99; c.b = base * 0.94;
      /* Ridges take the weather and come up smoother; the crevices
         between them stay rough. 0.80..0.88 was almost one value. */
      c.rough = clamp(0.84 - (r - 0.5) * 0.30 + (grain - 0.5) * 0.12, 0.42, 1);
      c.ao = 0.55 + r * 0.45;
      c.h = r * 0.9 + grain * 0.15;
    },

    grass(u, v, n, c) {
      const patch = n.fbm(u * 7, v * 7, 2, 4) * 0.5 + 0.5;
      const blade = n.fbm(u * 70, v * 70, 5, 2) * 0.5 + 0.5;
      const dry = smoothstep(0.55, 0.85, n.fbm(u * 3, v * 3, 17, 3) * 0.5 + 0.5);
      const lush = 0.20 + patch * 0.18 + blade * 0.08;
      c.r = lerp(lush * 0.42, lush * 0.95, dry);
      c.g = lerp(lush * 1.05, lush * 0.85, dry);
      c.b = lerp(lush * 0.28, lush * 0.42, dry);
      /* Dead-flat at 0.92 before, which is a lawn made of felt. Living
         blades are waxy and catch the sky; dry ones do not. */
      c.rough = clamp(0.955 - blade * 0.13 + dry * 0.10, 0.42, 1);
      c.ao = 0.7 + blade * 0.3;
      c.h = blade * 0.7 + patch * 0.3;
    },

    /* Ground. Averaged 0.31, for the same reason and with the same result:
       the battlefield mud is authored at 0x3b3327, which is 0.043 linear,
       and a third of that is 0.013 -- one and a third percent reflectance.
       Real churned earth is nearer ten. The field rendered as a void with
       wire silhouettes standing in it, and no amount of sky fill could
       lift a surface that was throwing away two thirds of its light before
       the lighting ever ran. Centred properly now; the warmth stays, at a
       strength that tints rather than darkens. */
    dirt(u, v, n, c) {
      const clod = n.fbm(u * 12, v * 12, 3, 4) * 0.5 + 0.5;
      const grit = n.fbm(u * 80, v * 80, 9, 2) * 0.5 + 0.5;
      const base = 0.66 + clod * 0.20 + grit * 0.08;
      /* The last of the baked-in colour. 1.06 / 0.98 / 0.88 is a 1 : 0.92
         : 0.83 warm cast, which on a material that is ALSO warm compounds
         into terracotta -- and the battlefield mud came out crimson under
         a warm sun once its albedo was correct. Every other recipe in
         here had this taken out; this one kept a third of it. */
      c.r = base * 1.02; c.g = base; c.b = base * 0.96;
      /* Flat 0.95 before. Churned earth is not one material: the packed
         clods hold a damp sheen and the loose grit between them does
         not, and that difference is most of what tells you ground is
         ground rather than a brown plane. */
      c.rough = clamp(0.965 - clod * 0.16 + grit * 0.07, 0.42, 1);
      c.ao = 0.72 + clod * 0.28;
      c.h = clod * 0.7 + grit * 0.3;
    },

    sand(u, v, n, c) {
      const dune = n.fbm(u * 4, v * 16, 1, 3) * 0.5 + 0.5;
      const grain = n.fbm(u * 150, v * 150, 6, 2) * 0.5 + 0.5;
      const base = 0.62 + dune * 0.12 + grain * 0.06;
      // Was 1.06 / 0.94 / 0.68 -- a yellow baked into the texture, on top
      // of the khaki its materials already ask for. Sandbags came out
      // mustard. The material has the colour; this just varies it.
      c.r = base * 1.03; c.g = base * 0.99; c.b = base * 0.92;
      /* The windward face of a ripple is packed and the lee is loose.
         Keyed to the dune so the sheen runs with the ripples instead of
         crossing them. */
      c.rough = clamp(0.945 - dune * 0.13 + grain * 0.05, 0.42, 1);
      c.ao = 0.85 + dune * 0.15;
      c.h = dune * 0.6 + grain * 0.4;
    },

    marble(u, v, n, c) {
      // Veins: turbulence pushed through a sine, the classic formulation.
      const turb = n.fbm(u * 4, v * 4, 0, 6);
      const vein = Math.abs(Math.sin((u * 6 + turb * 3) * PI));
      const v2 = Math.pow(1 - vein, 8);
      const base = 0.78 - v2 * 0.45;
      c.r = base; c.g = base * 0.99; c.b = base * 0.97;
      c.rough = 0.18 + v2 * 0.2;
      c.ao = 1;
      c.h = v2 * 0.4;
    },

    ice(u, v, n, c) {
      const crack = Math.pow(1 - Math.abs(n.fbm(u * 5, v * 5, 2, 4)), 6);
      const cloud = n.fbm(u * 12, v * 12, 8, 3) * 0.5 + 0.5;
      c.r = 0.62 + cloud * 0.16;
      c.g = 0.80 + cloud * 0.14;
      c.b = 0.92 + cloud * 0.08;
      c.rough = 0.08 + crack * 0.5 + cloud * 0.08;
      c.ao = 1 - crack * 0.2;
      c.h = crack * 0.8;
    },

    /* Cloth. Same rule as concrete, and it was broken here for longer.

       This averaged 0.36 -- the weave sat at 0.43 and the channel tints
       took another 17% off it. Every garment in the game was therefore
       multiplied down to about a THIRD of the colour it was authored in,
       while bare skin (a texture that averages 0.86) kept nearly all of
       its own. That is the whole of "the zombies look middling": out on
       the field their heads and hands were lit and everything from the
       collar down was a black hole with rips in it, so none of the
       tailoring -- collar, placket, cuffs, torn hem, webbing -- was
       visible at any distance. It was never a modelling problem.

       The weave now varies around mid-grey instead of scaling everything
       down to it, and the blue cast is gone: a texture supplies variation,
       a colour supplies colour. */
    fabric(u, v, n, c) {
      /* The weave was a hard XOR of two square waves -- a literal
         chessboard, 60 squares across the tile. While cloth was rendering
         at a third of its colour nobody could see it; the moment the
         garments came up to full brightness every coat in the game was
         wearing a checkerboard, and on a sheriff at forty metres it was
         the only thing you could see.

         Over-under is a SOFT alternation, not a tiled square: the product
         of the two waves gives the same interlace with a rounded profile,
         and at nearly twice the frequency it sits at thread scale instead
         of tile scale. The hard version stays in the height field, where
         a crisp edge is what a normal map wants. Slub -- thread-count
         variation over a couple of centimetres -- carries most of the
         visible variety now, which is what cloth actually looks like. */
      const wu = Math.sin(u * PI * 220), wv = Math.sin(v * PI * 220);
      const weave = wu * wv * 0.5 + 0.5;
      const fuzz = n.fbm(u * 200, v * 200, 4, 2) * 0.5 + 0.5;
      const slub = n.fbm(u * 26, v * 26, 17, 3) * 0.5 + 0.5;
      const base = 0.80 + weave * 0.06 + fuzz * 0.07 + slub * 0.05;
      c.r = base * 0.99; c.g = base; c.b = base * 1.02;
      c.rough = 0.96 - slub * 0.04;
      c.ao = 0.86 + weave * 0.14;
      c.h = weave * 0.5 + fuzz * 0.2 + slub * 0.3;
    },

    /* SKIN, and the three things it was missing.
     *
       THE PORES WERE AT 180 CYCLES on a 256-pixel bake, which is 1.4
       texels a cycle. A feature that small does not survive being
       baked -- what comes out is not pores, it is white noise, and it
       is the same fault the first cut of `bluing` had with its wear.
       70 cycles is three and a half texels at 256 and fourteen at
       1024, so it is actually there.

       THERE WAS NO MICRORELIEF. Close up, the single most identifying
       thing about skin is not pores at all: it is the net of fine
       creases dividing the surface into tiny irregular polygons
       (Langer's lines). Without them skin reads as painted rubber
       however good the colour is, and the bank had no way to make
       them. They are built here the way parkerizing's crystals are --
       two high-frequency fields whose zero crossings are the
       boundaries -- but soft, shallow, and STRETCHED, because the net
       is elongated along the lines of tension in real skin.

       THERE WAS NO BLOOD IN IT. One blotch field drove everything, so
       the variation was a single grey mottle. Skin varies in HUE as
       much as in value: capillary beds put red where the flesh is
       thin and the vessels are near the surface. A second, independent
       field does that, and it only touches red and blue.

       Still near-neutral overall, and the note that used to be here
       still governs: the ratio must not be baked in, because the
       MATERIAL decides the skin tone. A texture supplies variation, a
       colour supplies colour -- which is how one recipe serves every
       tone rather than there being a recipe per person. */
    skin(u, v, n, c) {
      const pore = Math.pow(n.fbm(u * 70, v * 70, 3, 2) * 0.5 + 0.5, 3);
      const blotch = n.fbm(u * 9, v * 9, 12, 4) * 0.5 + 0.5;
      // The crease net: stretched 2.4:1, so it has a grain direction.
      const ca = n.fbm(u * 115, v * 48, 29.3, 2);
      const cb = n.fbm(u * 115, v * 48, 88.7, 2);
      const cell = Math.min(Math.abs(ca), Math.abs(cb));
      const crease = 1 - smoothstep(0.0, 0.09, cell);
      // Capillary bed, independent of the value mottle.
      const blood = n.fbm(u * 5, v * 6, 53.1, 3) * 0.5 + 0.5;
      // Sebum: broad, and the only thing that makes skin shine.
      const oil = n.fbm(u * 3.5, v * 4, 66.2, 2) * 0.5 + 0.5;

      const base = 0.86 + blotch * 0.09 - crease * 0.05;
      c.r = base * 0.96 + blood * 0.030;
      c.g = base * 0.90 + blotch * 0.02;
      c.b = base * 0.86 - blood * 0.022;
      /* Dry where it creases, glossy where the sebum is. That contrast
         is most of what separates living skin from a painted mannequin
         under a hard light. */
      c.rough = clamp(0.58 + pore * 0.16 + crease * 0.10 - oil * 0.20
        - blotch * 0.04, 0.28, 0.86);
      c.ao = 1 - pore * 0.10 - crease * 0.08;
      c.h = 0.55 + pore * 0.10 - crease * 0.18 + blotch * 0.04;
    },

    /* HAIR. The engine has no anisotropic specular -- the one lobe in
       the BRDF is symmetric -- so the strand highlight has to come out
       of the normal map instead, which means the strands have to be in
       the HEIGHT field and not only in the colour. That works: a row
       of parallel half-cylinders lit from the side gives the banded
       sheen hair actually has, and it costs nothing the bank was not
       already paying.

       Three scales, and all three matter. STRANDS, very fine and
       parallel. CLUMPS, because hair separates into locks and a head
       of perfectly even strands reads as nylon. And STRAY hairs, a few
       crossing the lie of the rest, which is the detail that stops it
       being a wig.

       Near-neutral again, for the same reason skin is: the material
       carries the colour, so black, brown, blond and grey are four
       materials on one recipe rather than four recipes. */
    hair(u, v, n, c) {
      // Strands run along v. Very high in u, almost nothing in v.
      /* 140, not 190. The world builds every texture at 256 and
         upgrades afterwards, and 190 cycles is 1.3 texels a cycle at
         256 -- so for the first few seconds of every match the hair
         would be noise rather than strands. Same arithmetic that the
         first cut of `bluing` got wrong. */
      const strand = n.fbm(u * 140, v * 2.5, 7.3, 2) * 0.5 + 0.5;
      const clump = n.fbm(u * 17, v * 3, 44.8, 3) * 0.5 + 0.5;
      const stray = Math.pow(Math.max(0, n.fbm(u * 60, v * 26, 91.4, 2)), 5) * 3.0;
      /* The sheen band: hair is brightest where the strand turns
         through the light, which on a parallel lay is a narrow line
         along the lock rather than a point. */
      const band = Math.pow(clump, 3.0);
      const base = 0.55 + strand * 0.22 + band * 0.20 - (1 - clump) * 0.12
        + stray * 0.25;
      c.r = base * 1.00; c.g = base * 0.97; c.b = base * 0.93;
      c.metal = 0;
      c.rough = clamp(0.42 - band * 0.16 + (1 - strand) * 0.14, 0.18, 0.80);
      c.ao = 0.78 + clump * 0.22;
      c.h = strand * 0.55 + clump * 0.35 + stray * 0.4;
    },

    /* AN EYE, authored as a disc in UV space rather than as a tiling
       pattern -- it is the one thing in this bank that is a PICTURE of
       a specific object instead of a material that repeats. So it
       assumes the mesh puts the front of the eye around (0.5, 0.5),
       which is what a quad or the front cap of a sphere does, and it
       does not tile: uvScale on this should be 1.

       Out from the middle: the pupil, black and matte, because it is a
       hole; the iris, whose radial fibres are the whole of its
       character; the collarette, the slightly raised ring a third of
       the way out where the fibres change direction; the limbal ring,
       dark and surprisingly wide, which is the feature that makes eyes
       read as young; and the sclera, which is never white -- it is a
       warm grey with vessels in it, and painting it white is the
       single most common way a rendered face goes uncanny.

       The iris colour is left near-neutral so the material tints it,
       as skin and hair are. Blue, green, brown and hazel are one
       recipe and four hexes. */
    eye(u, v, n, c) {
      const dx = u - 0.5, dy = v - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      const th = Math.atan2(dy, dx);
      /* RADIAL FIBRES, AND HOW THE FIRST CUT GOT CONCENTRIC RINGS
         INSTEAD. Sampling noise at `th * 46` is sampling a coordinate
         that jumps by 2*pi*46 when theta wraps at the negative x axis,
         so there is a seam -- and pairing it with `r * 30` made the
         other axis radius, which produces variation ALONG the radius:
         rings. Exactly backwards from fibres.

         A fibre is constant in r and varies in theta. Sampling the
         noise on the unit circle, at (cos th, sin th) scaled up, gives
         exactly that and wraps seamlessly by construction, because
         theta and theta + 2*pi land on the same point. 46 is about
         seventy fibres round the iris, which is right. */
      const fib = n.fbm(Math.cos(th) * 46, Math.sin(th) * 46, 13.9, 2) * 0.5 + 0.5;
      const fine = n.fbm(Math.cos(th) * 115, Math.sin(th) * 115, 71.5, 2) * 0.5 + 0.5;
      /* The crypts -- the darker pits between fibre bundles -- do vary
         with radius, and they are the only thing in the iris that
         should. */
      const crypt = n.fbm(Math.cos(th) * 14, Math.sin(th) * 14, 34.2, 2) * 0.5 + 0.5;
      /* VESSELS ARE LINES, NOT BLOBS. Cubing a positive noise field
         picks out its PEAKS, which are round, so the first cut put
         polka dots across the sclera. A vessel is where a field
         crosses zero -- a thin ridge -- and it branches because the
         field does. */
      const vf = n.fbm(u * 9, v * 9, 5.2, 2);
      const vessel = Math.pow(Math.max(0, 1 - Math.abs(vf) * 14), 2.5);

      if (r < 0.115) {
        // Pupil. Not quite black, and matte, so it reads as an opening.
        c.r = c.g = c.b = 0.025;
        c.rough = 0.55; c.ao = 0.55; c.h = 0.30; c.metal = 0;
      } else if (r < 0.315) {
        const t = (r - 0.115) / 0.20;
        // Collarette at a third out, then the fibres open up.
        const coll = Math.exp(-Math.pow((t - 0.33) * 6.0, 2));
        /* The fibres fan OUT: tight and dark at the pupil, opening and
           brightening toward the limbus. Without that the iris is a
           flat disc of streaks. */
        const f = (fib * 0.55 + fine * 0.45) * (0.45 + t * 0.55)
          - (1 - crypt) * 0.18 * (1 - t);
        const base = 0.42 + f * 0.40 - (1 - t) * 0.14 + coll * 0.10;
        c.r = base * 0.98; c.g = base; c.b = base * 1.02;
        c.rough = 0.16; c.ao = 1 - coll * 0.10; c.metal = 0;
        c.h = 0.45 + coll * 0.30 + f * 0.10;
      } else if (r < 0.345) {
        // The limbal ring.
        const t = (r - 0.315) / 0.030;
        const dark = Math.sin(t * Math.PI);
        const base = 0.30 - dark * 0.22;
        c.r = base * 0.95; c.g = base * 0.97; c.b = base * 1.05;
        c.rough = 0.14; c.ao = 1 - dark * 0.20; c.h = 0.5; c.metal = 0;
      } else {
        /* Sclera. Warm, not white, and it darkens into the corners
           where the lids shade it -- which is the other half of why a
           flat white eyeball looks wrong. */
        const t = Math.min(1, (r - 0.345) / 0.155);
        /* Vessels thicken toward the corners, where they actually
           are, and there are none at all against the limbus. */
        const ves = vessel * smoothstep(0.02, 0.40, t);
        const base = 0.86 - t * 0.16;
        c.r = base * 1.00 + ves * 0.06;
        c.g = base * 0.96 - ves * 0.14;
        c.b = base * 0.93 - ves * 0.13;
        c.rough = 0.12; c.ao = 1 - t * 0.18; c.h = 0.5; c.metal = 0;
      }
    },

    /* TOOTH ENAMEL. Almost white and never white: enamel is
       translucent over dentine, so it goes warm and slightly
       transparent at the biting edge and cooler at the gum. The bands
       running up each tooth are the perikymata -- the growth lines --
       and they are faint, but they are the reason a rendered tooth
       without them looks like a tic tac. */
    enamel(u, v, n, c) {
      const band = n.fbm(u * 4, v * 30, 21.7, 2) * 0.5 + 0.5;
      const stain = n.fbm(u * 8, v * 8, 62.3, 3) * 0.5 + 0.5;
      // v runs gum to edge; the edge is where the translucency shows.
      const edge = smoothstep(0.55, 1.0, v);
      const base = 0.90 + band * 0.04 - stain * 0.06 - edge * 0.10;
      c.r = base * 1.00; c.g = base * 0.99 - edge * 0.01; c.b = base * 0.94 + edge * 0.03;
      c.metal = 0;
      c.rough = clamp(0.14 + stain * 0.10, 0.08, 0.40);
      c.ao = 1 - stain * 0.06;
      c.h = 0.5 + (band - 0.5) * 0.10;
    },

    /* FINGERNAIL. Keratin plate: glossy, faintly striped along its
       length, pinker over the nail bed and paler at the free edge and
       in the lunula. Small, and it is the difference between a hand
       and a mitten at the range a viewmodel is seen from. */
    nail(u, v, n, c) {
      const ridge = n.fbm(u * 3, v * 40, 8.1, 2) * 0.5 + 0.5;
      const lun = Math.exp(-Math.pow((v - 0.12) * 5.5, 2));
      const free = smoothstep(0.86, 1.0, v);
      const base = 0.80 + ridge * 0.05 + lun * 0.08 + free * 0.10;
      c.r = base * 1.00; c.g = base * 0.90 - lun * 0.02; c.b = base * 0.87;
      c.metal = 0;
      c.rough = clamp(0.17 + (1 - ridge) * 0.06, 0.10, 0.45);
      c.ao = 1;
      c.h = 0.5 + (ridge - 0.5) * 0.18;
    },

    plastic(u, v, n, c) {
      const speck = n.fbm(u * 120, v * 120, 2, 2) * 0.5 + 0.5;
      const base = 0.7 + speck * 0.06;
      c.r = base; c.g = base; c.b = base;
      c.rough = 0.32 + speck * 0.08;
      c.ao = 1;
      c.h = speck * 0.15;
    },

    tile(u, v, n, c) {
      const n8 = 8;
      const gx = (u * n8) % 1, gy = (v * n8) % 1;
      const gap = Math.min(Math.min(gx, 1 - gx), Math.min(gy, 1 - gy)) * n8;
      const isGap = gap < 0.12;
      const grain = n.fbm(u * 30, v * 30, 5, 3) * 0.5 + 0.5;
      if (isGap) {
        c.r = c.g = c.b = 0.32 + grain * 0.08;
        c.rough = 0.95; c.ao = 0.4; c.h = 0.05;
      } else {
        const cell = Math.floor(u * n8) * 13 + Math.floor(v * n8) * 29;
        const tint = ((cell * 2654435761) % 1000) / 1000;
        const base = 0.62 + tint * 0.14 + grain * 0.05;
        c.r = base * 0.98; c.g = base; c.b = base * 1.02;
        c.rough = 0.16 + tint * 0.1;
        c.ao = 1 - smoothstep(0.4, 0.12, gap) * 0.3;
        c.h = 0.8;
      }
    },

    /* ==================================================================
       THE WORLD
       ==================================================================
       Nine surfaces the maps were faking with a tinted `concrete`.
       Every one of them is a DIFFERENT KIND OF THING and not a shade:
       asphalt is stones in tar, a cobbled street is separate objects,
       corrugated iron is a manufactured sheet that rusts in streaks
       down its own profile. Tinting one grey recipe into all of them is
       why a street, a roof and a runway read as the same slab in three
       colours.

       All of these are WHOLE MATERIALS -- the recipe is the finished
       look and the tint runs near white. Asphalt is not "concrete but
       darker".
       ================================================================== */

    /* ASPHALT. Not grey: it is a few per cent of light on a black
       binder with pale AGGREGATE in it, and the aggregate is the whole
       of the look -- chips of stone, most of them below the surface,
       some of them polished proud of it by tyres. A road with no
       visible stone in it is a car park in a cartoon.

       The wheel paths matter too. Traffic polishes two strips smooth
       and leaves the middle and the edges coarse, and that is the
       thing that tells you at a glance which way a road runs. It is
       not in here -- it belongs to the road's own geometry, not to a
       tiling material -- but the roughness range is left wide enough
       that a map can drive it from outside. */
    asphalt(u, v, n, c) {
      /* Aggregate: cells again, as parkerizing and polymer are, but
         coarse and irregular. A chip is fifteen millimetres. */
      const a = n.fbm(u * 26, v * 26, 3.4, 2);
      const b = n.fbm(u * 26, v * 26, 47.8, 2);
      const cell = Math.min(Math.abs(a), Math.abs(b));
      const stone = smoothstep(0.02, 0.20, cell);
      // Which chips sit proud and got polished by traffic.
      const proudF = n.fbm(u * 13, v * 13, 71.2, 2) * 0.5 + 0.5;
      const proud = Math.max(0, proudF - 0.55) / 0.45;
      const binder = n.fbm(u * 5, v * 5, 19.9, 3) * 0.5 + 0.5;
      const grit = n.fbm(u * 110, v * 110, 88.1, 2) * 0.5 + 0.5;

      // Tar is near black; the stone is what lifts it.
      const base = 0.17 + stone * 0.22 + proud * stone * 0.14
        + binder * 0.04 + (grit - 0.5) * 0.03;
      c.r = base * 1.00; c.g = base * 0.99; c.b = base * 0.97;
      c.metal = 0;
      /* A polished chip is the only shiny thing on a dry road, and it
         is why wet-looking tarmac still reads as tarmac. */
      c.rough = clamp(0.92 - proud * stone * 0.34 - binder * 0.05, 0.30, 1);
      c.ao = 0.82 + stone * 0.18;
      c.h = stone * 0.45 + proud * 0.2 + (grit - 0.5) * 0.06;
    },

    /* SETTS -- a cobbled street, and the word cobble is wrong for what
       is almost always there: dressed granite SETTS, roughly cubical,
       laid in courses. Three things have to be right. The joints are
       WIDE and full of grit, not thin lines. Each sett is a different
       stone, so they vary in colour independently. And the tops are
       DOMED and polished by a century of traffic, which is what makes
       a wet cobbled street look the way it does.

       The courses are offset a little per row, because setts are laid
       by hand against a string and a perfectly square grid of them
       reads as tiling immediately. */
    setts(u, v, n, c) {
      /* IT RENDERED AS A BATHROOM FLOOR. Three faults, and the first
         is the one that mattered: a regular grid with a half-course
         offset is a TILED FLOOR, and no amount of per-row drift hides
         that, because the eye finds the repeating unit anyway. Setts
         are dressed by hand and laid against a string; they are
         roughly in courses and not one of them is square.

         Cells give that for nothing -- the feature points are
         jittered, so every sett is a different shape -- and the grid
         is squashed in v so the cells come out as courses rather than
         as a random scatter, which is what laying to a string does.

         The other two: the stone-to-stone colour spread was 0.26 on a
         0.42 base, which is granite in ten unrelated greys rather than
         one quarry; and the dome was steep enough that each sett was a
         pillow. Both are about a third of what they were. */
      const P = 11;
      const st = n.cells(u * P, v * P * 1.35, 7, P);
      const joint = smoothstep(0.030, 0.085, st.edge);
      const grain = n.fbm(u * 70, v * 70, 5.5, 3) * 0.5 + 0.5;
      const wear = n.fbm(u * 3, v * 3, 61.8, 2) * 0.5 + 0.5;

      if (joint < 0.35) {
        // Grit, moss and a century of dirt down in the joint.
        const g = 0.17 + grain * 0.10 + joint * 0.20;
        c.r = g * 1.00; c.g = g * 1.02; c.b = g * 0.92;
        c.rough = clamp(0.97 - grain * 0.05, 0.70, 1);
        c.ao = 0.26 + joint * 1.1;
        c.h = 0.06 + grain * 0.06; c.metal = 0;
      } else {
        // The dome: 1 at the crown, 0 at the joint.
        const dome = smoothstep(0.0, 0.34, st.d1);
        const base = 0.40 + st.id * 0.10 + grain * 0.08 - dome * 0.05;
        // Granite: cool, and each sett only slightly its own colour.
        const cool = 0.985 + st.id2 * 0.03;
        c.r = base * (2 - cool) * 0.99; c.g = base * 1.00; c.b = base * cool;
        /* Polished on the crown where a century of iron tyres has been,
           coarse down at the joint. That gradient across every single
           sett is the whole reason a cobbled street looks like one. */
        c.rough = clamp(0.44 + dome * 0.40 + grain * 0.10 - wear * 0.10, 0.26, 1);
        c.ao = 1 - dome * 0.30;
        c.h = 0.95 - dome * 0.42; c.metal = 0;
      }
    },

    /* CORRUGATED IRON. The profile is real geometry and belongs in the
       mesh -- a normal map cannot give a sheet a silhouette. What is
       here is everything else: galvanising that has gone patchy and
       dull, RUST IN STREAKS running down the valleys because that is
       where the water sits, and the line of fixings along each purlin
       with a bloom of rust around every one.

       The streaks are the thing. Rust on a steel sheet is never even:
       it starts at a fixing or a cut edge and runs downhill, so it is
       directional, and a uniform rust mottle on a roof reads as paint. */
    corrugated(u, v, n, c) {
      // v runs down the slope. Streaks are long in v, narrow in u.
      const streakF = n.fbm(u * 22, v * 2.5, 6.7, 3) * 0.5 + 0.5;
      const runF = n.fbm(u * 9, v * 1.4, 33.1, 2) * 0.5 + 0.5;
      const rust = clamp(Math.max(0, streakF * 0.55 + runF * 0.75 - 0.62) / 0.38, 0, 1);
      // Spangle: the crystal pattern galvanising leaves.
      const spangle = n.fbm(u * 60, v * 60, 12.4, 2) * 0.5 + 0.5;
      // Fixings: a row every so often down the sheet.
      const ROWS = 5;
      const fy = Math.abs(((v * ROWS) % 1) - 0.5) * 2;
      const fx = Math.abs(((u * 8) % 1) - 0.5) * 2;
      const fix = smoothstep(0.86, 1.0, fy) * smoothstep(0.80, 1.0, fx);
      const bloom = smoothstep(0.55, 1.0, fy) * smoothstep(0.45, 1.0, fx) * 0.6;
      const r2 = clamp(rust + bloom, 0, 1);

      const zinc = 0.62 + spangle * 0.14;
      // Rust is a dielectric; zinc is not. Blend both.
      c.r = zinc * (1 - r2) + r2 * 0.44;
      c.g = zinc * 0.99 * (1 - r2) + r2 * 0.23;
      c.b = zinc * 1.01 * (1 - r2) + r2 * 0.13;
      c.metal = 1 - r2 * 0.85;
      c.rough = clamp(0.44 + spangle * 0.10 + r2 * 0.46, 0.28, 1);
      c.ao = 1 - r2 * 0.14 - fix * 0.35;
      c.h = 0.55 - fix * 0.45 + r2 * 0.10 + (spangle - 0.5) * 0.05;
    },

    /* CLAY PANTILES. A roof, and the S-curve of the tile is geometry
       again -- but the LAP is not, and the lap is what makes a roof
       read as a roof from across a map: every tile overlaps the one
       below, so there is a shadow line across the slope every 330
       millimetres and a butt joint down it every 250.

       Fired clay varies tile to tile far more than brick does, because
       a roof is laid from several batches over decades of repairs. So
       each tile gets its own value AND its own warmth, and a few are
       plainly replacements. */
    pantile(u, v, n, c) {
      /* A PANTILE IS NOT SQUARE. 4 across by 3 down over a tile made
         them square, and with a side joint as strong as the head lap
         the render was a chocolate bar. A pantile is about 330 by 250
         with a big overlap, so across the slope you see roughly one
         tile for every one and a half courses down -- and the LAP, the
         shadow across the head of each tile, is several times deeper
         than the joint down its side. */
      const ACROSS = 3, DOWN = 5;
      const gu = u * ACROSS, gv = v * DOWN;
      const iu = Math.floor(gu), iv = Math.floor(gv);
      const fu = gu - iu, fv = gv - iv;
      const h = (((iu * 374761393) ^ (iv * 668265263)) >>> 0) % 1000 / 1000;
      const h2 = (((iu * 2246822519) ^ (iv * 3266489917)) >>> 0) % 1000 / 1000;
      // The lap shadow along the head of each tile, and the side joint.
      const lap = smoothstep(0.17, 0.0, fv);
      const side = smoothstep(0.045, 0.0, Math.min(fu, 1 - fu)) * 0.45;
      const grain = n.fbm(u * 60, v * 60, 8.8, 3) * 0.5 + 0.5;
      const moss = Math.max(0, n.fbm(u * 14, v * 14, 52.6, 3)) * 1.6;
      /* THE ROLL, which is the whole of why a pantile roof looks like
         one and why the last render still read as brickwork. A pantile
         is an S in section: a barrel down one side and a flat pan down
         the other, so ACROSS each tile there is a bright crown, a
         shaded flank and a dark trough where it laps its neighbour.
         That banding, repeated across the slope, is the thing you
         actually recognise from a hundred metres -- far more than the
         colour of the clay.

         It is real geometry on a real roof, and it is not here: the
         mesh is a flat slab. Which is exactly what a normal map is for
         at this scale, and there is no range in this game at which a
         roof is close enough for the silhouette to give it away. */
      const rollPhase = fu * Math.PI * 2 - 0.55;
      const roll = Math.cos(rollPhase);
      const trough = smoothstep(0.55, 1.0, -roll);

      // And the tile-to-tile spread was 0.20, which is a roof relaid
      // from five batches. 0.10 is a roof with repairs in it.
      const base = 0.42 + h * 0.10 + grain * 0.07 - lap * 0.24 - side * 0.14
        + roll * 0.11 - trough * 0.16;
      const warm = 0.90 + h2 * 0.14;
      c.r = base * 1.00; c.g = base * (0.56 * warm); c.b = base * (0.40 * warm);
      // Moss in the laps, where the water lies: green, matte, and dark.
      const m = clamp(moss * (0.35 + lap * 0.9), 0, 0.8);
      c.r = c.r * (1 - m) + m * 0.16;
      c.g = c.g * (1 - m) + m * 0.21;
      c.b = c.b * (1 - m) + m * 0.11;
      c.metal = 0;
      c.rough = clamp(0.78 + grain * 0.12 + m * 0.15 - h * 0.08, 0.45, 1);
      c.ao = 1 - lap * 0.45 - side * 0.30 - trough * 0.35;
      c.h = 0.55 + roll * 0.34 - lap * 0.45 - side * 0.25 - trough * 0.20
        + (grain - 0.5) * 0.06;
    },

    /* GRAVEL, and the thing that makes it gravel rather than a noisy
       ground texture is that the stones OVERLAP. A field of separate
       pebbles on a flat bed reads as a mosaic; loose gravel is a heap,
       so a stone's edge disappears under the one in front of it.

       Built as several offset cell layers, the nearer ones winning, so
       there are stones on stones. Each one is a different rock and the
       fines between them are pale dust. */
    gravel(u, v, n, c) {
      /* REBUILT ON REAL CELLS. The first version found its stone edges
         with the zero-crossing trick and then took each stone's colour
         from the GRID SQUARE it happened to be in -- a different
         partition of the plane -- so one visible stone was crossed by
         several colour boundaries and the render was terrazzo: stones
         of the right size with no stones in them.

         `n.cells` gives a distance, an edge function and an id that is
         stable over the whole cell, which is exactly the three things
         a heap of stones needs.

         Two layers, the second offset and finer, and the nearer one
         wins where it is well inside a stone. That is what makes them
         OVERLAP: a single layer of cells is a mosaic, because cells
         tile the plane by definition and gravel does not. */
      const P1 = 26, P2 = 37;
      const a = n.cells(u * P1, v * P1, 3, P1);
      const b = n.cells((u + 0.31) * P2, (v + 0.57) * P2, 11, P2);
      // Whichever stone is more solidly "inside" is the one on top.
      const useA = (0.5 - a.d1) > (0.5 - b.d1) * 0.92;
      const st = useA ? a : b;
      // The gaps: where no stone is near its own centre.
      const fines = smoothstep(0.42, 0.62, st.d1);
      const dust = n.fbm(u * 90, v * 90, 26.2, 2) * 0.5 + 0.5;
      const rough2 = n.fbm(u * 150, v * 150, 71.4, 2) * 0.5 + 0.5;
      // A stone's own shading: bright on the crown, dark at its edge.
      const crown = 1 - smoothstep(0.0, 0.45, st.d1);
      const rim = smoothstep(0.045, 0.0, st.edge);

      if (fines > 0.7) {
        const g = 0.46 + dust * 0.12;
        c.r = g * 1.00; c.g = g * 0.98; c.b = g * 0.92;
        c.rough = 0.98; c.ao = 0.44; c.h = 0.10 + dust * 0.06; c.metal = 0;
      } else {
        /* Each stone is a different rock, and rock is not neutral --
           limestone runs warm, granite cool, flint nearly blue. The
           second hash picks which, independently of the value, so a
           heap is mixed rather than a single stone at ten
           brightnesses. */
        const val = 0.34 + st.id * 0.30;
        const warm = 0.94 + st.id2 * 0.14;
        const base = val + crown * 0.14 + (rough2 - 0.5) * 0.07 - rim * 0.10
          - fines * 0.10;
        c.r = base * warm; c.g = base * 1.00; c.b = base * (2 - warm) * 0.99;
        c.metal = 0;
        c.rough = clamp(0.70 + (1 - st.id) * 0.22 + (rough2 - 0.5) * 0.08, 0.40, 1);
        c.ao = 1 - rim * 0.45 - fines * 0.30;
        c.h = 0.25 + (1 - st.d1) * 0.65 - rim * 0.25;
      }
    },

    /* SNOW, and it is the hardest thing in this bank to make convincing
       because almost everything about it is a LIGHTING problem rather
       than a texture one: snow is bright, it scatters inside itself, and
       it has almost no colour. What a texture can do is the structure,
       and there is more of it than people expect -- wind ripples and
       sastrugi, the crust that forms and cracks, and the coarse
       sparkling grain of old snow.

       Near white, so it is one of the few recipes here that can carry a
       tint: a map wanting blue shadow snow or dirty roadside snow says
       so in the material. */
    snow(u, v, n, c) {
      // Wind ripples: long, low, and all in one direction.
      const ripple = n.fbm(u * 4, v * 20, 7.9, 3) * 0.5 + 0.5;
      // Sastrugi: the bigger carved ridges, same direction, sharper.
      const sas = Math.pow(n.fbm(u * 2.5, v * 8, 44.3, 2) * 0.5 + 0.5, 2.2);
      // Crust: a cracked skin over the top, where it has thawed once.
      const cf = n.fbm(u * 16, v * 16, 66.1, 2);
      const crack = Math.pow(Math.max(0, 1 - Math.abs(cf) * 11), 2.5);
      // Grain: old snow is coarse and it sparkles.
      const grain = n.fbm(u * 100, v * 100, 91.7, 2) * 0.5 + 0.5;
      const sparkF = n.fbm(u * 75, v * 75, 13.3, 2) * 0.5 + 0.5;
      const spark = Math.max(0, sparkF - 0.88) / 0.12;

      const base = 0.93 + ripple * 0.030 + sas * 0.025 - crack * 0.070
        + (grain - 0.5) * 0.020;
      // Faintly cool, because snow in daylight takes the sky.
      c.r = base * 0.995; c.g = base * 0.998; c.b = base * 1.00;
      c.metal = 0;
      /* Snow is mostly matte with pinpoint specular from individual ice
         facets, which is the sparkle. A broad low roughness turns it
         into polystyrene. */
      c.rough = clamp(0.72 + (1 - grain) * 0.16 - spark * 0.60
        - sas * 0.08, 0.10, 1);
      c.ao = 1 - crack * 0.20;
      c.h = 0.5 + (ripple - 0.5) * 0.30 + sas * 0.35 - crack * 0.30
        + (grain - 0.5) * 0.10;
    },

    /* WET MUD -- churned, standing water in the ruts, and the one thing
       that separates it from `dirt` is the SHEEN. Dry earth is uniformly
       matte; wet earth is matte on the high ground and a mirror in the
       hollows, because the hollows have water in them. That contrast is
       the whole material, and it lives almost entirely in the roughness
       channel rather than in the colour. */
    mud(u, v, n, c) {
      const churn = n.fbm(u * 7, v * 7, 3.3, 4) * 0.5 + 0.5;
      const lump = n.fbm(u * 22, v * 22, 28.8, 3) * 0.5 + 0.5;
      const grit = n.fbm(u * 95, v * 95, 55.1, 2) * 0.5 + 0.5;
      // Water collects where the height field is low.
      const h = churn * 0.6 + lump * 0.4;
      const water = smoothstep(0.46, 0.24, h);
      const base = 0.30 + h * 0.16 + (grit - 0.5) * 0.04 - water * 0.12;
      // Wet earth is darker AND less saturated than the dry version.
      c.r = base * 1.00; c.g = base * (0.88 + water * 0.06);
      c.b = base * (0.74 + water * 0.14);
      c.metal = 0;
      c.rough = clamp(0.96 - water * 0.78 + (grit - 0.5) * 0.05, 0.08, 1);
      c.ao = 1 - water * 0.22 - (1 - lump) * 0.10;
      c.h = h * 0.9 + (grit - 0.5) * 0.06;
    },

    /* CHIPPED PAINT over steel -- a vehicle, a door, a fuel drum, a
       railing. The point of it is the LAYERS: gloss paint on top,
       primer under that, and bare metal where the chip has gone all the
       way through. A chip that just darkens the paint reads as dirt;
       what makes it read as a chip is that it exposes a DIFFERENT
       MATERIAL, with its own colour and its own metalness.

       Near white on the paint layer so the material picks the colour --
       this one recipe is every painted thing in the game. */
    paint(u, v, n, c) {
      const orange = n.fbm(u * 30, v * 30, 4.6, 2) * 0.5 + 0.5;
      // Where the paint has gone. Two thresholds on one field, so the
      // primer always shows as a halo around the bare metal rather
      // than as an unrelated patch.
      const wearF = n.fbm(u * 11, v * 11, 37.4, 3) * 0.5 + 0.5;
      const gone = Math.max(0, wearF - 0.70) / 0.30;
      const bare = Math.max(0, wearF - 0.83) / 0.17;
      const scratchF = n.fbm(u * 60, v * 6, 71.8, 2);
      const scratch = Math.pow(Math.max(0, 1 - Math.abs(scratchF) * 15), 3);

      // Layer 1: the paint. Slight orange peel in the roughness.
      let r = 0.92, g = 0.92, b = 0.92;
      let rough = 0.30 + orange * 0.14;
      let metal = 0;
      // Layer 2: red oxide primer.
      const p = clamp(gone - bare, 0, 1) + scratch * 0.4;
      r = r * (1 - p) + p * 0.46; g = g * (1 - p) + p * 0.22; b = b * (1 - p) + p * 0.16;
      rough = rough * (1 - p) + p * 0.88;
      // Layer 3: bare steel, and it is the only conductor here.
      const m = clamp(bare, 0, 1);
      r = r * (1 - m) + m * 0.55; g = g * (1 - m) + m * 0.56; b = b * (1 - m) + m * 0.58;
      rough = rough * (1 - m) + m * 0.38;
      metal = m;

      c.r = r; c.g = g; c.b = b;
      c.metal = metal;
      c.rough = clamp(rough, 0.12, 1);
      c.ao = 1 - gone * 0.14;
      /* A chip has a real lip -- the paint film is a tenth of a
         millimetre and you can see its edge. */
      c.h = 0.7 - gone * 0.35 - scratch * 0.25;
    },

    /* WINDOW GLASS, and the reason it is not `smooth`. Clean glass IS
       featureless, and that is exactly why a rendered window looks
       fake: real glass carries a film of dust, the dried edges of old
       rain, and the smears where somebody wiped it. None of that is
       very visible head on, but all of it lights up the moment the
       glass is at a glancing angle to a light -- which is most of the
       time, and it is what makes a window read as a pane rather than as
       a hole.

       The albedo stays near white because a material using this sets
       its own opacity and tint; what this recipe really supplies is
       ROUGHNESS variation, which is where a smear lives. */
    glass(u, v, n, c) {
      const dust = n.fbm(u * 55, v * 55, 9.2, 2) * 0.5 + 0.5;
      // Rain runs: narrow, vertical, with a tide mark at the bottom.
      const runF = n.fbm(u * 45, v * 3, 41.7, 2);
      const run = Math.pow(Math.max(0, 1 - Math.abs(runF) * 9), 2.0);
      // Wipe smears: broad arcs.
      const warp = n.fbm(u * 2, v * 2, 63.5, 2);
      const smear = n.fbm(u * 5 + warp * 2, v * 3 - warp * 2, 77.3, 2) * 0.5 + 0.5;
      const grime = clamp(dust * 0.35 + run * 0.5 + smear * 0.3, 0, 1);

      const base = 0.97 - grime * 0.10;
      c.r = base * 1.00; c.g = base * 1.00; c.b = base * 0.995;
      c.metal = 0;
      /* Nearly a mirror, and then not, in patches. The range is what
         does the work: 0.04 is glass, 0.30 is a smear, and the edge
         between them is what you actually see. */
      c.rough = clamp(0.045 + grime * 0.26 + run * 0.10, 0.02, 0.45);
      c.ao = 1;
      c.h = 0.5 + run * 0.10 + (dust - 0.5) * 0.04;
    },

    /* ==================================================================
       CLOTH
       ==================================================================
       The bank had one cloth recipe, `fabric`, and it is a fine even
       weave -- a shirt. Everything anyone in this game wears was that
       shirt: the greatcoats, the denim, the tarpaulins, the field
       caps. Cloth is where a weave IS the material, and four weaves
       that are actually different do more for a crowd of soldiers than
       any amount of work on their faces.

       All four are near-neutral for the usual reason: the colour is
       the material's, so one wool recipe dresses both armies.
       ================================================================== */

    /* WOOL SERGE -- a battledress blouse, a greatcoat, a service cap.
       Two things make it wool and not cotton. It is a TWILL, so the
       weave runs on a diagonal rather than a grid, and that diagonal
       is visible at conversation distance. And it has a HALO: wool
       fibres stand off the surface, so the cloth has no sharp edge to
       its shading and never takes a specular highlight anywhere. */
    wool(u, v, n, c) {
      /* The twill line. Sampling a diagonal coordinate is what makes
         it a twill rather than a grid -- 2/2 serge advances one end
         per pick, so the line runs at about 45 degrees. */
      const d = (u + v) * 52;
      const twill = Math.abs(((d % 1) - 0.5) * 2);
      const rib = 1 - Math.pow(twill, 1.6);
      const halo = n.fbm(u * 130, v * 130, 3.8, 2) * 0.5 + 0.5;
      const slub = n.fbm(u * 11, v * 9, 47.6, 3) * 0.5 + 0.5;
      const base = 0.60 + rib * 0.14 + (halo - 0.5) * 0.10 + (slub - 0.5) * 0.09;
      c.r = base * 1.00; c.g = base * 0.99; c.b = base * 0.96;
      c.metal = 0;
      /* Almost nothing on earth is rougher than raw wool. The narrow
         band is deliberate: a highlight anywhere on this and it stops
         being wool and starts being gabardine. */
      c.rough = clamp(0.94 - rib * 0.03 + (halo - 0.5) * 0.04, 0.80, 1);
      c.ao = 0.80 + rib * 0.20;
      c.h = rib * 0.45 + (halo - 0.5) * 0.18;
    },

    /* DENIM. A 3/1 twill in which the warp is dyed indigo and the weft
       is left white, which is why denim is blue on the face, pale on
       the back, and goes WHITE where it wears -- the dye only ever sat
       on the outside of the warp yarn. So the two thread directions
       are written separately here rather than as one colour with
       noise on it, and the wear lightens the warp toward the weft
       instead of toward grey. */
    denim(u, v, n, c) {
      const NW = 46;
      const gu = u * NW, gv = v * NW;
      const iu = Math.floor(gu), iv = Math.floor(gv);
      const fu = gu - iu, fv = gv - iv;
      // 3/1: the warp floats over three picks out of four.
      const warpUp = (((iu - iv) % 4) + 4) % 4 !== 0;
      const round = Math.sin((warpUp ? fu : fv) * Math.PI);
      const slub = n.fbm(u * 9, v * 40, 18.2, 3) * 0.5 + 0.5;
      const wearF = n.fbm(u * 4, v * 5, 58.9, 3) * 0.5 + 0.5;
      const wear = Math.max(0, wearF - 0.58) / 0.42;
      const lit = 0.55 + round * 0.30 + (slub - 0.5) * 0.10;
      if (warpUp) {
        // Indigo, fading to the undyed core as it wears.
        const t = wear * 0.8;
        c.r = lit * (0.42 + t * 0.52);
        c.g = lit * (0.50 + t * 0.44);
        c.b = lit * (0.68 + t * 0.26);
      } else {
        // Weft: always the pale undyed cotton.
        c.r = lit * 0.92; c.g = lit * 0.90; c.b = lit * 0.84;
      }
      c.metal = 0;
      c.rough = clamp(0.90 - round * 0.06 - wear * 0.04, 0.68, 1);
      c.ao = 0.74 + round * 0.26;
      c.h = round * 0.6 + (slub - 0.5) * 0.10;
    },

    /* RIPSTOP. A plain weave with a heavier thread every few
       millimetres in both directions, so a tear runs to the next
       reinforcement and stops. That grid is the entire look of the
       material and it is a hard geometric pattern -- which is why no
       amount of noise on `fabric` was ever going to produce it. Modern
       kit, a windproof smock, a parachute panel. */
    ripstop(u, v, n, c) {
      const GRID = 17;
      const gu = (u * GRID) % 1, gv = (v * GRID) % 1;
      const bar = Math.max(1 - Math.min(gu, 1 - gu) * GRID * 0.7,
        1 - Math.min(gv, 1 - gv) * GRID * 0.7);
      const rein = smoothstep(0.55, 0.95, bar);
      // The ground weave, much finer, plain over-under.
      const WV = 150;
      const wu = Math.sin(u * WV * Math.PI), wv2 = Math.sin(v * WV * Math.PI);
      const weave = (wu * wv2) * 0.5 + 0.5;
      const sheen = n.fbm(u * 6, v * 6, 37.1, 2) * 0.5 + 0.5;
      const base = 0.62 + weave * 0.10 + rein * 0.09 + (sheen - 0.5) * 0.07;
      c.r = base * 1.00; c.g = base * 1.00; c.b = base * 0.98;
      c.metal = 0;
      /* Synthetic, so unlike wool it DOES take a sheen -- a low, broad
         one, strongest along the reinforcing bars where the thread is
         thickest. */
      c.rough = clamp(0.74 - rein * 0.10 - sheen * 0.08, 0.42, 0.95);
      c.ao = 0.86 + rein * 0.14;
      c.h = rein * 0.55 + weave * 0.18;
    },

    /* RIB KNIT -- a watch cap, a jumper, the cuff of a jacket. Knit is
       not woven: it is a fabric of interlocking LOOPS, so it has
       vertical columns (wales) of little V shapes rather than a grid,
       and it is thick and soft enough that the relief is real rather
       than optical. The V is what says knit; without it any amount of
       fuzz just says towel. */
    knit(u, v, n, c) {
      const WALE = 22, COURSE = 26;
      const gu = u * WALE, gv = v * COURSE;
      const iu = Math.floor(gu), iv = Math.floor(gv);
      const fu = gu - iu, fv = gv - iv;
      // Each cell is a V: two legs meeting at the bottom middle.
      const leg = Math.abs(fu - 0.5) * 2;
      const vshape = Math.sin(Math.max(0, 1 - Math.abs(fv - leg * 0.75)) * Math.PI * 0.5);
      // Ribbing: every other wale sits proud.
      const ribOut = (iu & 1) === 0 ? 1 : 0.55;
      const fuzz = n.fbm(u * 120, v * 120, 12.3, 2) * 0.5 + 0.5;
      const round = vshape * ribOut;
      const base = 0.52 + round * 0.28 + (fuzz - 0.5) * 0.10;
      c.r = base * 1.00; c.g = base * 0.99; c.b = base * 0.97;
      c.metal = 0;
      c.rough = clamp(0.93 - round * 0.04 + (fuzz - 0.5) * 0.05, 0.78, 1);
      c.ao = 0.62 + round * 0.38;
      c.h = round * 0.9 + (fuzz - 0.5) * 0.12;
    },

    /* ==================================================================
       THE GUN AND AMMUNITION SET
       ==================================================================
       Everything above this line is architecture: surfaces a metre or
       more across, authored to read from across a room. A cartridge
       case is twelve millimetres wide and you look at it from thirty
       centimetres, so nothing above is any use for one -- `metal` is a
       brushed panel, and a brushed panel on a bullet is a bullet made
       of a filing cabinet.

       These are authored at the scale they are seen. Every one carries
       its own colour, as the whole bank does, because a tint can only
       multiply down: brass has to BE brass here or no material can ask
       for it.

       THE COLOURS ARE THE REAL ALLOYS, not a guess at what looks
       gold-ish. For a metal, albedo is F0 -- the reflectance -- so
       getting it wrong is not a tint being off, it is the wrong metal.
         cartridge brass, 70 Cu / 30 Zn   0.93 : 0.76 : 0.40
         gilding metal,   95 Cu /  5 Zn   0.95 : 0.64 : 0.47
         lead, oxidised                   0.54 : 0.54 : 0.56
         blued steel (magnetite over it)  near black, with a blue cast
       ================================================================== */

    /* CARTRIDGE BRASS. A case is DRAWN -- punched from a cup and pulled
       through progressively smaller dies -- so its marks run along the
       axis, not around it. That is the one detail that separates a case
       from a gold-painted cylinder, and it is why the frequency below
       is high in u and low in v: u wraps the cylinder, so 150 cycles in
       u is fine lengthwise striation.

       Fired cases tarnish in blotches rather than evenly, because the
       chamber touches them unevenly and the hand touches them after.
       The tarnish lives mostly in the roughness: brass goes DULL before
       it goes brown. */
    brass(u, v, n, c) {
      /* THREE CORRECTIONS, ALL FROM LOOKING AT THE FIRST RENDER.
       *
         IT WAS GOLD. 0.93 : 0.76 : 0.40 is a jeweller's yellow. Brass
         is a copper-zinc alloy and the zinc pulls it toward white --
         cartridge brass reflects about 0.53 in blue where gold
         reflects half that. The blue channel IS the difference between
         brass and gold and it was the channel that was wrong.

         IT WAS HAMMERED. The dings were cubed and multiplied by 1.4,
         so a third of the surface was a dimple. A fired case has a few
         marks on it, not a peened finish. A fifth of the amplitude,
         and a higher threshold so they are isolated.

         IT WAS BUMPY. The height ran +-0.3 on the draw lines and -0.45
         in the dings, which at twelve millimetres across is a relief
         carving. Drawn brass is SMOOTH -- the striations are an optical
         effect in the roughness far more than a physical one. Most of
         the signal moved out of the height field and into the sheen. */
      const draw = n.fbm(u * 150, v * 4, 3.1, 2) * 0.5 + 0.5;
      const tarnish = n.fbm(u * 7, v * 5, 22.5, 4) * 0.5 + 0.5;
      const dings = Math.pow(Math.max(0, n.fbm(u * 44, v * 44, 8.8, 2) - 0.25), 3) * 2.2;
      const base = 0.93 - tarnish * 0.09 + (draw - 0.5) * 0.035;
      c.r = base * 0.91; c.g = base * 0.79; c.b = base * 0.53;
      c.metal = 1;
      c.rough = clamp(0.17 + tarnish * 0.15 + (draw - 0.5) * 0.10 + dings * 0.18, 0.11, 0.62);
      c.ao = 1 - dings * 0.10;
      c.h = (draw - 0.5) * 0.06 - dings * 0.12;
    },

    /* GILDING METAL -- the copper jacket of a bullet, and a different
       alloy from the case even though both are copper-bearing. Redder,
       softer, and drawn harder, so the striation is finer and deeper.
       A jacket is also handled less than a case, so it keeps its shine
       and tarnishes as a smooth film rather than in blotches. */
    copper(u, v, n, c) {
      const draw = n.fbm(u * 220, v * 5, 5.7, 2) * 0.5 + 0.5;
      const film = n.fbm(u * 4, v * 3, 31.2, 3) * 0.5 + 0.5;
      const base = 0.95 - film * 0.07 + (draw - 0.5) * 0.045;
      c.r = base * 0.95; c.g = base * 0.64; c.b = base * 0.47;
      c.metal = 1;
      c.rough = clamp(0.16 + film * 0.11 + (draw - 0.5) * 0.09, 0.10, 0.50);
      c.ao = 1;
      /* Same correction as the case: a drawn jacket is smooth, and the
         striations belong in the sheen rather than in the surface. */
      c.h = (draw - 0.5) * 0.07;
    },

    /* LEAD. Exposed at the base of a jacketed bullet and over the whole
       of a cast one. It is the one metal here that does not shine: a
       lead surface oxidises in minutes to a grey film, and what you see
       is the film. Nearly neutral, faintly blue, and dull enough that
       the highlight is a broad sheen rather than a point. Swage marks
       -- the flats the forming die leaves -- are the only structure. */
    lead(u, v, n, c) {
      const swage = n.fbm(u * 16, v * 10, 9.4, 2) * 0.5 + 0.5;
      const oxide = n.fbm(u * 30, v * 30, 44.1, 3) * 0.5 + 0.5;
      const base = 0.56 + swage * 0.07 - oxide * 0.06;
      c.r = base * 0.98; c.g = base * 0.99; c.b = base * 1.03;
      c.metal = 1;
      /* High for a metal on purpose. Below about 0.5 this reads as
         pewter or as dirty chrome; lead is closer to unglazed clay that
         happens to be a conductor. */
      c.rough = clamp(0.58 + oxide * 0.22 + (swage - 0.5) * 0.10, 0.40, 0.92);
      c.ao = 1 - oxide * 0.10;
      /* Swaging leaves the softest marks of anything here: lead flows
         into the die rather than being cut by it. */
      c.h = (swage - 0.5) * 0.16 + (oxide - 0.5) * 0.05;
    },

    /* PRIMER CUP. Brass or nickel, struck flat, and the one part of a
       round that is polished rather than drawn -- it is a stamping. Kept
       separate from `brass` because the cup is visibly brighter and
       smoother than the case around it, and on a round seen end-on that
       contrast IS the primer. */
    primer(u, v, n, c) {
      const mill = n.fbm(u * 60, v * 60, 12.8, 2) * 0.5 + 0.5;
      const base = 0.96 - mill * 0.05;
      c.r = base * 0.90; c.g = base * 0.83; c.b = base * 0.62;
      c.metal = 1;
      c.rough = clamp(0.13 + mill * 0.10, 0.08, 0.40);
      c.ao = 1;
      c.h = (mill - 0.5) * 0.12;
    },

    /* BLUED STEEL. Not paint and not a dark metal: it is magnetite
       grown on the steel, a few ten-thousandths thick, and the steel
       under it is still a mirror. So this is a very LOW roughness with
       a very LOW albedo, which is an unusual pair and exactly why blued
       guns look the way they do -- a black that throws a hard white
       highlight.

       Two things stop it being a black mirror. The polishing swirl left
       by the wheel, which is broad and directional. And WEAR: the oxide
       is thin, so every edge and every bearing surface comes back to
       bright steel. The worn patches here are sparse, bright and rough
       -- the peaks of a high-frequency field -- because that is what
       holster wear looks like from thirty centimetres. */
    bluing(u, v, n, c) {
      /* THE WEAR WAS SALT AND PEPPER. At 18 cycles across the tile and
         three octaves, the top octave lands about one texel a cycle, so
         thresholding it picked out INDIVIDUAL TEXELS -- and a threshold
         on white noise is white noise. The first render was a black
         ball with a snowstorm on it.

         Wear is not a noise, it is a place: the high edges and the
         parts a holster rubs. Four cycles and two octaves makes broad
         patches, and the threshold then selects a few of them rather
         than a scatter of pixels. Brighter, too -- worn bluing goes to
         bright steel, not to grey.

         The base is also lifted. 0.115 is darker than magnetite really
         is; the reason a blued gun looks black is the low ROUGHNESS
         throwing all its light into one highlight, not the albedo. */
      /* Two octaves, not three: the third lands near two texels a
         cycle at the 256 the world builds at, and on a dark metal that
         reads as sensor noise rather than as polishing. */
      const swirl = n.fbm(u * 26, v * 9, 6.3, 2) * 0.5 + 0.5;
      const cloud = n.fbm(u * 3.5, v * 3.5, 17.7, 3) * 0.5 + 0.5;
      const wearF = n.fbm(u * 4, v * 4, 55.3, 2) * 0.5 + 0.5;
      /* SMOOTHSTEP, NOT A DIVIDED THRESHOLD. `(x - 0.72) / 0.28` is a
         linear ramp that reaches 1 only at the very peak of the field,
         so what it selects is not a patch, it is the handful of texels
         at the top of each blob -- and with the albedo term below
         ADDING rather than blending, those texels overshot to white.
         The render was a dark ball with a dozen hard sparkles on it,
         which is the same salt-and-pepper failure this recipe already
         had once, arrived at by a different route. */
      /* AND IT IS RARE. At smoothstep(0.60, 0.90) roughly a quarter of
         a field whose mean is 0.5 counts as worn, so a quarter of the
         receiver came back as bare steel and the render read as
         camouflage.

         The deeper point is that a TILING TEXTURE CANNOT KNOW WHERE
         THE EDGES ARE, and wear on a gun is almost entirely an edge
         phenomenon -- the corners of the ejection port, the muzzle
         crown, the high points a holster rubs. Anything a recipe does
         here is wear in the wrong places by construction. So it does
         very little of it: a few per cent, at the extreme peaks, as a
         hint that the finish is not new. Edge wear belongs to
         curvature, which is geometry, and this is not the file for
         it. */
      const wear = smoothstep(0.88, 1.0, wearF) * 0.55;
      /* 0.46, AND THE NUMBER CAME FROM THE COMMENT I DELETED.
       *
         This recipe has been too dark three times: 0.115, then 0.155,
         then 0.215, each lift a guess at how much would be enough. The
         value that works was already written down in ARM_MAT, where
         blued steel was a tint of 0x737e8a on brushed metal -- 0.45 in
         sRGB -- under a note explaining that the previous 0x33383e was
         about a fifth of steel's real reflectance and that a metal has
         no diffuse term at all, so a dark colour does not make a dark
         object, it makes a mirror with nothing to reflect.

         At metalness 1 the albedo IS the reflectance. 0.19 sRGB is
         0.03 linear, which is LOWER THAN A DIELECTRIC'S 0.04 -- a
         physically impossible metal, and on screen a black hole with
         two sparkles in it. Oxide-blued steel really does sit near
         half of bare steel. What makes a blued gun look black is the
         finish being satin and the light being indoors, not the
         reflectance being near zero.

         Three lifts by guesswork to arrive at a number that was in the
         file the whole time. */
      /* 0.30, AND THE SWING FROM 0.115 TO 0.46 AND BACK IS THE POINT.
       *
         Under a blue sky 0.46 read as a blue-grey gun, which is what
         convinced me it was right. Under a neutral overcast studio --
         which is the honest light to judge a material in -- the same
         number came back as bright chrome, because a satin metal shows
         you whatever is around it and a grey dome is bright.

         Both readings are physically correct and neither is a blued
         rifle. What makes real blued steel look dark is not its
         reflectance, it is that a real room is full of dark things: a
         photographer surrounds the gun with black flags precisely
         because the steel would otherwise mirror the walls.

         This engine's environment is a sky gradient and a room term,
         and there is no black in it. So the albedo has to carry some
         of the job the environment does not: 0.30 is under the
         physical value and over the point where a metal has nothing to
         be dark with. It is the number that looks like blued steel in
         the lighting this game actually has, which is the only test
         that matters. */
      const base = 0.30 + cloud * 0.06 + (swirl - 0.5) * 0.035;
      /* The blue is in the RATIO, not in a tint on top: magnetite runs
         a few per cent cooler in red than in blue, and at this
         brightness a few per cent is the whole of the colour. */
      /* AND IT BLENDS TOWARD BARE STEEL RATHER THAN ADDING TO THE
         OXIDE. Worn bluing is not blued steel plus light -- it is
         blued steel REPLACED by the metal underneath, which is a mid
         grey around 0.52 and faintly warm. Adding cannot represent
         that: it can only ever overshoot, and past the top of the
         range it clips to white. */
      // Bare steel is brighter than the oxide over it, but not by much.
      // Bare steel stays brighter than the oxide, by about a third.
      const bare = 0.44;
      /* THE BLUE IS A NAME, NOT A HUE, and this is the fifth pass on
         this material. 0.88 : 0.94 : 1.12 is a strong cast, and at the
         near-black albedo the recipe started with it was invisible --
         a few per cent of almost nothing. Lifted to a real steel
         reflectance the same ratio came back as painted denim.

         A blued receiver in daylight is a very slightly cool grey. The
         colour is in the last few per cent, and it only ever shows in
         the highlight. */
      c.r = (base * 0.97) * (1 - wear) + bare * 1.00 * wear;
      c.g = (base * 0.99) * (1 - wear) + bare * 1.01 * wear;
      c.b = (base * 1.04) * (1 - wear) + bare * 1.02 * wear;
      c.metal = 1;
      /* GUN BLUE IS SATIN, AND I HAD TO BE TOLD THAT BY A COMMENT I
         DELETED. ARM_MAT carried this material as a tint on brushed
         metal at roughness 0.45, under a note saying it had been
         corrected twice in opposite directions -- too dark and the
         receiver was a hole, too smooth and it was a white shape with
         no form in it -- and ending "Gun blue is satin."

         I replaced that with 0.115, from the physics: magnetite is a
         thin film over a polished surface and the steel underneath
         really is near-mirror. The physics is right and the render was
         a black ball with three sparkles on it, because this engine's
         environment is a sky gradient and a room term -- a dark mirror
         in it has almost nothing to reflect, so all a low roughness
         buys is pinpoint highlights.

         A real gun photographs as dark satin because it is reflecting
         a whole room. Until there is a room to reflect, the number
         that produces the look of blued steel is the one that was
         already there, and two people's worth of photographs had
         already established it. 0.38, with the range kept wide enough
         that the polished crown and the worn edges still separate. */
      c.rough = clamp(0.38 + (swirl - 0.5) * 0.10 + cloud * 0.08 + wear * 0.30, 0.26, 0.72);
      c.ao = 1;
      // Polished steel has no relief at all. This is barely a ripple.
      c.h = (swirl - 0.5) * 0.03 - wear * 0.04;
    },

    /* PARKERIZING -- manganese phosphate, the finish on almost every
       service weapon made after about 1935, and nothing in this bank
       could do it. It is a CONVERSION COATING: the steel is eaten into
       and regrown as a crystalline crust, so the surface is a mat of
       interlocking grains, dead matte, dark grey with a green-brown
       cast, and it holds oil, which is why it looks faintly wet.

       The crystal mat is what has to be right, and it is not fbm --
       fbm gives clouds and this is CELLS. Two high-frequency fields
       multiplied and sharpened make grain boundaries: where either is
       near its own mid-value there is a crack between crystals.

       Metalness 0.5. A phosphate layer is a ceramic on top of a metal,
       and it reads as neither on its own -- at 1 it goes to a dark
       mirror and at 0 it goes to grey plastic. */
    parkerize(u, v, n, c) {
      /* Finer than the first cut. At 85 cycles the crystals came out
         about two millimetres across on a receiver, which is pumice;
         real phosphate crystals are a tenth of that and read as a
         texture rather than as holes. 150 is as fine as the bake will
         carry -- past that the grain boundaries fall inside one texel
         and it goes back to being noise. */
      const a = n.fbm(u * 150, v * 150, 4.2, 2);
      const b = n.fbm(u * 150, v * 150, 61.9, 2);
      /* Distance from either field's zero crossing: small near a
         boundary, large in the middle of a crystal. */
      const cell = Math.min(Math.abs(a), Math.abs(b));
      const grain = smoothstep(0.0, 0.16, cell);
      const oil = n.fbm(u * 6, v * 6, 28.4, 3) * 0.5 + 0.5;
      const base = 0.200 + grain * 0.060 - (1 - grain) * 0.040 + oil * 0.018;
      c.r = base * 1.00; c.g = base * 1.01; c.b = base * 0.93;
      c.metal = 0.5;
      /* Matte, and only the oil in the crystal pits breaks it. */
      c.rough = clamp(0.88 - grain * 0.10 - oil * 0.12, 0.45, 1);
      c.ao = 0.84 + grain * 0.16;
      c.h = grain * 0.30;
    },

    /* WALNUT, and not the `wood` recipe. That one is construction
       timber: six sawn boards to a tile with seams and knots between
       them, which is right for a crate and absurd for a rifle stock --
       a stock is ONE piece of one tree, chosen for its figure, sanded
       to nothing and oil-finished.

       So: no boards, no seams. Close parallel grain with the growth
       rings crowding and opening as the surface cuts across them, the
       pore flecks that make walnut read as walnut rather than as brown
       plastic, and a finish that is smooth over the wood and very
       slightly less smooth in the open pores -- which is the whole
       visual signature of an oiled stock as against a lacquered one. */
    walnut(u, v, n, c) {
      /* Rings: a smooth field, then folded. The fold is what makes them
         crowd together where the cut is near-tangential. */
      /* IT CAME OUT AS AN ORDNANCE SURVEY MAP. `flow * 5.5` displaced
         the ring field by five and a half whole rings, so the rings
         wrapped back over themselves into closed contours and burls.
         A stock is cut from a straight billet: the grain runs broadly
         ALONG it and only bends. 0.7 of a ring is a bend.

         The rings are also tighter, because 22 across a 220-millimetre
         stock is a growth ring every centimetre, and walnut grown for
         gunstocks is far closer than that. */
      const flow = n.fbm(u * 2.2, v * 1.1, 13.7, 3);
      const rings = Math.abs(Math.sin((v * 34.0 + flow * 0.7) * Math.PI));
      const ringD = Math.pow(1 - rings, 2.2);
      const fig = n.fbm(u * 3, v * 7, 41.5, 4) * 0.5 + 0.5;
      // Pores: short dashes lying along the grain, not round dots.
      const poreF = n.fbm(u * 26, v * 190, 70.1, 2) * 0.5 + 0.5;
      const pore = Math.max(0, poreF - 0.70) / 0.30;
      const base = 0.34 + fig * 0.17 - ringD * 0.15 - pore * 0.09;
      /* Walnut under oil is a cool red-brown that goes almost purple in
         the dark rings. The first cut ran 1.00 : 0.64 : 0.40, which is
         terracotta -- it is the same mistake the battlefield mud made,
         and the correction is the same: take red down relative to the
         other two until it stops being orange. */
      c.r = base * 1.00; c.g = base * 0.70; c.b = base * 0.52;
      c.metal = 0;
      c.rough = clamp(0.36 + ringD * 0.08 + pore * 0.26 - fig * 0.05, 0.22, 0.85);
      c.ao = 1 - pore * 0.22 - ringD * 0.08;
      /* A stock is SANDED. The only thing below the surface is the open
         pores; the grain itself is an optical pattern in a flat plane,
         and running it at +-0.35 was carving the figure into the wood. */
      c.h = 0.6 - ringD * 0.05 - pore * 0.22;
    },

    /* BAKELITE. Phenolic resin with a filler, moulded, and the reason
       it never looks like plastic is that the filler MARBLES -- the
       flow front drags streaks of lighter and darker resin through it,
       so the pattern follows the shape of the part. Warm oxblood, near
       the AK furniture colour, and glossy because a mould is polished
       and the resin takes its finish exactly. */
    bakelite(u, v, n, c) {
      const warp = n.fbm(u * 2.5, v * 2.5, 3.9, 3);
      const swirl = n.fbm(u * 5 + warp * 2.4, v * 3 + warp * 1.6, 27.2, 4) * 0.5 + 0.5;
      const fleck = n.fbm(u * 70, v * 70, 66.6, 2) * 0.5 + 0.5;
      const base = 0.36 + swirl * 0.26 + (fleck - 0.5) * 0.04;
      c.r = base * 1.00; c.g = base * 0.47; c.b = base * 0.30;
      c.metal = 0;
      c.rough = clamp(0.26 + (1 - swirl) * 0.08 + (fleck - 0.5) * 0.05, 0.16, 0.6);
      c.ao = 1;
      c.h = 0.5 + (swirl - 0.5) * 0.18;
    },

    /* MOULDED POLYMER -- a modern frame, a magazine body, a handguard.
       The surface a mould leaves is not smooth: it is textured on
       purpose, a fine pebble grain, both so it can be gripped and so it
       does not show every scuff. That grain is the whole material, and
       it is DENSE -- about a tenth of a millimetre a cell -- so this is
       the one recipe here that wants to be near the bake's own limit. */
    polymer(u, v, n, c) {
      const a = n.fbm(u * 150, v * 150, 7.7, 2);
      const b = n.fbm(u * 150, v * 150, 83.1, 2);
      const cell = Math.min(Math.abs(a), Math.abs(b));
      const pebble = smoothstep(0.0, 0.13, cell);
      const mould = n.fbm(u * 4, v * 4, 19.3, 3) * 0.5 + 0.5;
      const base = 0.19 + pebble * 0.05 + mould * 0.02;
      // Very slightly warm-neutral: a true grey polymer reads as dead.
      c.r = base * 1.01; c.g = base * 1.00; c.b = base * 0.97;
      c.metal = 0;
      c.rough = clamp(0.72 - pebble * 0.14 + (mould - 0.5) * 0.06, 0.40, 0.95);
      c.ao = 0.86 + pebble * 0.14;
      c.h = pebble * 0.45;
    },

    /* GRAIN LEATHER -- a sling, a holster, a rifle's cheekpiece. Three
       things, in order of how much they matter: the PORES, which are
       the follicles and are what makes leather leather; the CREASE
       network, broad and soft, where it has folded; and a wax finish
       that is glossy on the high ground and dead in the creases,
       because that is where the polish never reaches. */
    leather(u, v, n, c) {
      const poreF = n.fbm(u * 110, v * 110, 2.4, 2) * 0.5 + 0.5;
      const pore = Math.max(0, poreF - 0.60) / 0.40;
      const warp = n.fbm(u * 3, v * 3, 51.8, 2);
      /* IT WAS A MAZE. `Math.abs(field) * 5.5` makes a ridge wherever
         the field crosses zero, and a three-octave field crosses zero
         everywhere -- so the whole surface was creases, meeting each
         other, at full depth. Real leather has a few soft folds across
         it and is otherwise flat grain.

         Two octaves so the crossings are sparse, x 9 so the ridges are
         narrow rather than broad bands, and squared harder so only the
         very centre of a crossing counts as a crease at all. */
      const creaseF = n.fbm(u * 6 + warp * 1.2, v * 6 - warp * 1.2, 33.6, 2);
      const crease = Math.pow(1 - Math.min(1, Math.abs(creaseF) * 9.0), 3.0);
      const wax = n.fbm(u * 5, v * 5, 71.4, 3) * 0.5 + 0.5;
      const base = 0.40 + wax * 0.10 - crease * 0.14 - pore * 0.09;
      c.r = base * 1.00; c.g = base * 0.68; c.b = base * 0.48;
      c.metal = 0;
      c.rough = clamp(0.44 + crease * 0.26 + pore * 0.20 - wax * 0.10, 0.25, 0.95);
      c.ao = 1 - crease * 0.28 - pore * 0.18;
      /* A fold in leather is a tenth of a millimetre deep and a pore is
         less. Both were running at half the height range. */
      c.h = 0.6 - crease * 0.16 - pore * 0.10;
    },

    /* WEBBING -- a sling, a strap, a magazine pouch. Not the `fabric`
       recipe, which is a fine weave for clothing. This is a two-over-
       two herringbone in a heavy cotton or nylon tape, the individual
       tows are visible at arm's length, and the edges of the tape are
       selvedge rather than cut. Coarse, matte, and with enough relief
       in the height field that the weave catches a rim light. */
    webbing(u, v, n, c) {
      const NW = 26;
      const gu = u * NW, gv = v * NW;
      const iu = Math.floor(gu), iv = Math.floor(gv);
      const fu = gu - iu, fv = gv - iv;
      // Two-over-two: which tow is on top alternates in pairs.
      const over = (((iu >> 1) + (iv >> 1)) & 1) === 0;
      // Along the tow it is round, so the shade is a cosine across it.
      const across = over ? fv : fu;
      const round = Math.sin(across * Math.PI);
      const fuzz = n.fbm(u * 200, v * 200, 14.9, 2) * 0.5 + 0.5;
      const dirt = n.fbm(u * 6, v * 6, 47.2, 3) * 0.5 + 0.5;
      const base = 0.44 + round * 0.22 - (1 - dirt) * 0.10 + (fuzz - 0.5) * 0.06;
      c.r = base * 1.00; c.g = base * 0.96; c.b = base * 0.82;
      c.metal = 0;
      c.rough = clamp(0.93 - round * 0.06 + (fuzz - 0.5) * 0.06, 0.55, 1);
      c.ao = 0.68 + round * 0.32;
      c.h = round * 0.8 + (fuzz - 0.5) * 0.08;
    },

    /* A flat surface — for when a material wants pure colour and the
       normal/ORM detail would only add noise.

       The green channel has to be 0.8, not 0.4. The shader does
       `rough *= orm.g * 1.25`, so 0.8 is the identity and anything else
       silently overrides the roughness the material asked for. At 0.4 every
       `texture: 'smooth'` surface in every scene rendered at half the
       roughness it was authored with — the glass preset asked for 0.05 and
       got the clamp, rubber asked for 0.95 and came out at 0.48, and a
       matte black meant to read as an absence picked up a specular sheen and
       went warm under a lamp. */
    smooth(u, v, n, c) {
      c.r = c.g = c.b = 1;
      c.rough = 0.8; c.ao = 1; c.h = 0.5;
    },

    /* PLASTER, and why a pale wall could not be made out of any recipe
       that already existed.
     *
       The rule this bank runs on is that a tint only ever multiplies
       DOWN, so anything that has to read pale has to be built on a
       recipe that is already pale. Until now the only pale recipe was
       `smooth`, which is a constant: no albedo variation, no relief, no
       roughness break. So every rendered wall, every hotel corridor and
       every cabana in the game was a flat fill -- which is the whole of
       the report that a wall beside a detailed one looks "just like
       maths". It was not the tiling on those walls. There was nothing
       on them to tile.

       This is render, not paint: a thin cement skim, floated on with a
       trowel and left. Four things make it read as that and not as a
       grey rectangle, and all four are small on purpose, because
       plaster IS subtle and the failure mode of a subtle material is
       inventing texture it does not have.

         THE FLOAT SWEEP, long and directional -- the arcs a trowel
         leaves. Stretched 4:1 so it has a direction; a wall skimmed
         with no direction at all looks poured.

         SUCTION MOTTLE, the slow blotching where the backing pulled
         water out of the mix at different rates. This is the one that
         does most of the work at across-the-room distance, and it is
         almost entirely a ROUGHNESS effect: the patches are the same
         colour and a different sheen, which is exactly what you see on
         a real wall and what a colour-only mottle never looks like.

         GRIT, fine and dense, so there is something under a torch.

         BLOWHOLES, rare, small and deep -- the air that did not get
         out. One in a few hundred texels, and they are what tells you
         the surface is a paste that set rather than a sheet.

       Bakes near 0.90 white, so a tint puts it anywhere from that down
       to a mid grey and the old pale hexes carry across unchanged. */
    plaster(u, v, n, c) {
      const sweep = n.fbm(u * 3.2, v * 12.8, 5.1, 3) * 0.5 + 0.5;
      const mottle = n.fbm(u * 5.5, v * 5.5, 18.7, 4) * 0.5 + 0.5;
      const grit = n.fbm(u * 120, v * 120, 41.3, 2) * 0.5 + 0.5;
      /* Blowholes: the top of a sparse high-frequency field, so they
         are isolated rather than a second noise laid over everything. */
      const holeF = n.fbm(u * 64, v * 64, 77.9, 2) * 0.5 + 0.5;
      const hole = Math.max(0, holeF - 0.82) / 0.18;

      const base = 0.895 + (sweep - 0.5) * 0.045 + (grit - 0.5) * 0.022
        - hole * 0.30;
      /* Cement skim is faintly cool and faintly green; lime render is
         warmer. Split the difference and let the material's tint say
         which one this wall is. */
      c.r = base * 0.995; c.g = base; c.b = base * 0.985;
      /* The mottle lives here, not in the colour: suction patches are a
         sheen difference of maybe 0.2 and a colour difference of almost
         nothing. The sweep adds a little on top because a trowelled
         pass burnishes what it touches. */
      c.rough = clamp(0.78 + (mottle - 0.5) * 0.30 - (sweep - 0.5) * 0.10
        + hole * 0.18, 0.42, 1);
      c.ao = 1 - hole * 0.55 - (1 - mottle) * 0.04;
      c.h = 0.55 + (sweep - 0.5) * 0.30 + (grit - 0.5) * 0.10 - hole * 0.9;
    },

    /* FLOATIES. Coastline's upgrade finish: pool toys drifting across a
       baby-blue field.
       
       This is here because the honest answer to "a camo with little duck
       floaties on it" used to be "the texture bank generates patterns
       procedurally and cannot be handed a picture of a rubber duck",
       which was true of the recipes that existed and not true of the
       bank. A recipe is a function of one texel; nothing stops it being
       a function that evaluates a handful of placed SHAPES and asks
       whether this texel is inside one. Ducks are two circles and a
       wedge. Flamingos are a circle, an arc and a beak. Rings are two
       circles subtracted. All of that is arithmetic.
       
       Seven toys per tile, laid out on a hash rather than a grid so they
       do not read as wallpaper, each with its own colour and rotation,
       and each sitting slightly proud of the surface so the normal map
       gives it an edge -- a pattern with no relief in it reads as paint,
       and these are supposed to look like things floating ON something. */
    floaties(u, v, n, c) {
      // The water underneath: pale blue with a slow ripple in it.
      const rip = n.fbm(u * 5, v * 5, 2.1, 3) * 0.5 + 0.5;
      const rip2 = n.fbm(u * 17, v * 17, 6.4, 2) * 0.5 + 0.5;
      c.r = 0.62 + rip * 0.10;
      c.g = 0.84 + rip * 0.08;
      c.b = 0.94 + rip * 0.05;
      c.rough = 0.30 + rip2 * 0.12;
      c.ao = 1;
      c.h = 0.42 + rip * 0.10 + rip2 * 0.04;

      /* The toys. Positions and kinds come from a fixed hash so the tile
         is identical every time it is generated -- a camo that changes
         between two guns is not a camo. */
      const TOYS = [
        [0.17, 0.21, 0.115, 0.7, 0], [0.62, 0.13, 0.098, 2.4, 1],
        [0.86, 0.44, 0.104, 4.1, 2], [0.38, 0.52, 0.120, 1.2, 0],
        [0.09, 0.74, 0.092, 5.0, 2], [0.68, 0.79, 0.112, 3.3, 1],
        [0.45, 0.92, 0.086, 0.2, 0],
      ];
      for (let i = 0; i < TOYS.length; i++) {
        const t = TOYS[i];
        // Wrap the difference, so a toy near an edge continues on the other.
        let dx = u - t[0], dy = v - t[1];
        if (dx > 0.5) dx -= 1; if (dx < -0.5) dx += 1;
        if (dy > 0.5) dy -= 1; if (dy < -0.5) dy += 1;
        const R = t[2];
        if (dx * dx + dy * dy > R * R * 2.6) continue;   // cheap reject
        const ca = Math.cos(t[3]), sa = Math.sin(t[3]);
        const x = (dx * ca - dy * sa) / R, y = (dx * sa + dy * ca) / R;
        const kind = t[4];

        let inside = false, ink = 0;
        if (kind === 0) {
          /* A ring. Two circles: in the annulus, not in the hole. */
          const d = Math.hypot(x, y);
          inside = d < 1 && d > 0.52;
          ink = 1 - Math.abs(d - 0.76) / 0.24;
        } else if (kind === 1) {
          /* A duck. Body, head, beak -- a circle at the origin, a smaller
             circle up and forward of it, and a wedge off the front of
             that. Squashed on Y, because a duck floaty is wider than
             it is tall. */
          const body = (x * x) / 1.0 + (y * y) / 0.62 < 0.62;
          const hx = x - 0.42, hy = y + 0.52;
          const head = hx * hx + hy * hy < 0.10;
          const beak = x > 0.60 && x < 0.92 && Math.abs(y + 0.56) < 0.10 - (x - 0.60) * 0.22;
          inside = body || head || beak;
          ink = beak ? 2 : 1;
        } else {
          /* A flamingo. Body, then a neck that is an arc rather than a
             line -- the curve is the whole silhouette of one -- and a
             short down-turned beak on the end of it. */
          const body = (x * x) / 0.95 + (y * y) / 0.50 < 0.50;
          // The neck: distance to a circle centred up and forward.
          const nx = x - 0.18, ny = y + 0.56;
          const nd = Math.hypot(nx, ny);
          const neck = Math.abs(nd - 0.50) < 0.10 && ny < 0.05 && nx > -0.45;
          const bx = x - 0.58, by = y + 0.92;
          const beak = bx * bx + by * by < 0.028;
          inside = body || neck || beak;
          ink = beak ? 2 : 1;
        }
        if (!inside) continue;

        /* Toy colour. Two of the three kinds are pink; the rings are the
           loud ones, because a field of one colour is a pattern and a
           field of several is a lake at the end of summer. */
        const HUE = [
          [0.98, 0.42, 0.26], [0.99, 0.86, 0.24], [0.32, 0.78, 0.46],
          [0.98, 0.44, 0.62], [0.96, 0.40, 0.58],
        ];
        const h = kind === 0 ? HUE[i % 3] : HUE[3 + (i % 2)];
        const sheen = 0.86 + (n.fbm(u * 30, v * 30, i * 4.4, 2) * 0.5 + 0.5) * 0.26;
        if (ink === 2) {           // the beak, on both the duck and the bird
          c.r = 0.98 * sheen; c.g = 0.62 * sheen; c.b = 0.12 * sheen;
        } else {
          c.r = h[0] * sheen; c.g = h[1] * sheen; c.b = h[2] * sheen;
        }
        // Vinyl: smoother than water, and standing proud of it.
        c.rough = 0.18;
        c.ao = 1;
        c.h = 0.74;
      }
    },
  },
};

/* ---------------- Material ---------------- */

/* Set by the renderer from the quality tier before any material is
   built. A module-level default rather than an argument threaded
   through forty call sites: every builder in the game makes materials
   and not one of them should have to know about texture budgets. */

let _materialId = 0;

class Material {
  constructor(gl, opts = {}) {
    this.gl = gl;
    this.id = _materialId++;
    this.color = parseColor(opts.color != null ? opts.color : 0xcccccc);
    this.roughness = opts.roughness != null ? opts.roughness : 0.8;
    this.metalness = opts.metalness != null ? opts.metalness : 0;
    this.emissive = parseColor(opts.emissive != null ? opts.emissive : 0x000000);
    this.emissiveStrength = opts.emissiveStrength != null ? opts.emissiveStrength : 1;
    this.opacity = opts.opacity != null ? opts.opacity : 1;
    this.transparent = this.opacity < 1 || !!opts.transparent;
    this.doubleSided = !!opts.doubleSided;
    this.uvScale = opts.uvScale != null ? opts.uvScale : 1;
    /* WORLD-PROJECTED TILING, and what uvScale then means.
     *
       Off (the default): uvScale is tiles across a FACE, because a box
       mesh is a unit cube whose UVs run 0..1 whatever it is scaled to.
       That is right for a gun part and wrong for a building -- two
       walls of the same material and different sizes get different
       grain, and the big one reads as flat.

       On: the texture is projected from world space down the surface's
       dominant axis, and uvScale is TILES PER METRE. Every surface in
       the world then carries the same grain at the same distance, and
       a slab stretched twelve by three stops being stretched at all.
       Meant for architecture and ground; not for anything that moves,
       because a world projection slides across a body that walks. */
    this.worldUv = !!opts.worldUv;
    this.normalStrength = opts.normalStrength != null ? opts.normalStrength : 1;
    /* How much fine grain this surface shows close up. 1 for anything
       with a real texture to it; 0 for the ones whose whole point is
       being featureless -- glass, a painted panel, a pool toy -- where
       tiling grain across them would invent a material they are not. */
    this.detail = opts.detail != null ? opts.detail
      : (this.texture === 'smooth' || this.texture === 'ice' ? 0 : 1);
    this.texture = opts.texture || null;   // name of a TextureLib kind
    this.castShadow = opts.castShadow !== false;
    this.receiveShadow = opts.receiveShadow !== false;
    // Subsurface approximation — foliage and skin look dead without it.
    this.subsurface = opts.subsurface != null ? opts.subsurface : 0;

    this.maps = null;
    /* THE SIZE COMES FROM THE QUALITY TIER, not from a constant.
     *
       256 was not a considered number, it was what the per-material
       duplication above could afford. With the textures shared, 512
       costs half of what 256 used to and 1024 costs twice -- so the
       tier decides, the way it decides shadow resolution and sample
       counts, and a phone and a desktop stop rendering the same
       thumbnail. A caller can still pin a size for a preview. */
    if (this.texture) {
      this._buildMaps(opts.textureSize || Material.textureSize || 256,
        opts.textureSeed || 1);
    }
  }

  /* ONE SET OF TEXTURES PER RECIPE, NOT PER MATERIAL.
   *
     This built three GPU textures for every Material that asked for a
     texture, and Coastline makes a hundred and thirty-six materials out
     of seventeen recipes. Every brick material in the map uploaded its
     own identical copy of the same brick: 136 x 3 x 256 x 256 x 4, which
     is 102 MB of video memory holding about thirteen megabytes of
     distinct data.

     The CPU side was already shared -- TextureLib.generate caches on
     kind:size:seed and has done all along -- so this was 89 MB of pure
     duplication on the GPU, and it is the reason the textures had to
     stay at 256 in the first place.

     Shared, the same seventeen recipes cost 13 MB at 256 and 51 MB at
     512. So HALF the memory buys FOUR TIMES the texel density, which is
     the single largest thing standing between these surfaces and
     looking sharp. The cache hangs off the GL context, because that is
     what owns the textures and what they die with.

     Nothing here disposes them. A material does not own a texture it
     shares with a hundred others, and calling dispose on one would pull
     the brick out from under every wall in the level. */
  _buildMaps(size, seed) {
    const gl = this.gl;
    const store = gl.__legendTexCache || (gl.__legendTexCache = new Map());
    const key = this.texture + ':' + size + ':' + seed;
    let shared = store.get(key);
    if (!shared) {
      const data = TextureLib.generate(this.texture, size, seed);
      const mk = (bytes, srgb) => new Texture(gl, {
        internalFormat: srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        wrap: gl.REPEAT,
        aniso: 8,
      }).upload(bytes, size, size);
      shared = {
        // Albedo is authored in sRGB; the GPU converts on sample. ORM and
        // normal are data, not colour, and must stay linear.
        albedo: mk(data.albedo, true),
        normal: mk(data.normal, false),
        orm: mk(data.orm, false),
      };
      store.set(key, shared);
    }
    this.maps = shared;
  }

  dispose() {
    /* The maps are shared and outlive any one material -- see
       _buildMaps. Disposing them here would take the texture away from
       every other material built from the same recipe, which on
       Coastline is up to seven hundred actors. */
    this.maps = null;
  }
}

Material.textureSize = 256;

/* Sensible presets so a game can say `material: 'gold'` and get something
   that reads correctly under the engine's lighting. */
const MaterialPresets = {
  concrete: { color: 0xb0aca4, texture: 'concrete', roughness: 0.9, metalness: 0 },
  brick: { color: 0xffffff, texture: 'brick', roughness: 0.9, metalness: 0 },
  wood: { color: 0xffffff, texture: 'wood', roughness: 0.7, metalness: 0 },
  metal: { color: 0xc8ccd0, texture: 'metal', roughness: 0.35, metalness: 1 },
  steel: { color: 0x9aa2aa, texture: 'metal', roughness: 0.4, metalness: 1 },
  gold: { color: 0xffd276, texture: 'metal', roughness: 0.25, metalness: 1 },
  copper: { color: 0xd08a52, texture: 'metal', roughness: 0.32, metalness: 1 },
  rust: { color: 0xffffff, texture: 'rust', roughness: 0.85, metalness: 0.3 },
  rock: { color: 0xa8a49c, texture: 'rock', roughness: 0.92, metalness: 0 },
  stone: { color: 0xa8a49c, texture: 'rock', roughness: 0.92, metalness: 0 },
  grass: { color: 0xffffff, texture: 'grass', roughness: 0.95, metalness: 0, subsurface: 0.35 },
  dirt: { color: 0xffffff, texture: 'dirt', roughness: 0.96, metalness: 0 },
  sand: { color: 0xffffff, texture: 'sand', roughness: 0.9, metalness: 0 },
  marble: { color: 0xf2efe9, texture: 'marble', roughness: 0.2, metalness: 0 },
  ice: { color: 0xdff2fa, texture: 'ice', roughness: 0.1, metalness: 0, opacity: 0.72 },
  glass: { color: 0xdfeef5, texture: 'smooth', roughness: 0.05, metalness: 0, opacity: 0.28 },
  fabric: { color: 0xffffff, texture: 'fabric', roughness: 0.97, metalness: 0, subsurface: 0.2 },
  skin: { color: 0xffffff, texture: 'skin', roughness: 0.6, metalness: 0, subsurface: 0.5 },
  plastic: { color: 0xdddddd, texture: 'plastic', roughness: 0.35, metalness: 0 },
  tile: { color: 0xffffff, texture: 'tile', roughness: 0.2, metalness: 0 },
  rubber: { color: 0x2a2a2e, texture: 'smooth', roughness: 0.95, metalness: 0 },
  neon: { color: 0x111111, emissive: 0x36e0ff, emissiveStrength: 4, roughness: 0.4 },
  lava: { color: 0x2a0a04, emissive: 0xff5a1e, emissiveStrength: 3.5, texture: 'rock', roughness: 0.8 },
};

function resolveMaterial(gl, spec, cache) {
  if (spec instanceof Material) return spec;
  let opts;
  if (typeof spec === 'string') {
    const preset = MaterialPresets[spec];
    // An unknown string is treated as a colour — 'red', '#ff0000', 'gold'
    // all do the obvious thing.
    opts = preset ? Object.assign({}, preset) : { color: spec, texture: 'smooth', roughness: 0.6 };
  } else if (typeof spec === 'number') {
    opts = { color: spec, texture: 'smooth', roughness: 0.6 };
  } else if (spec && typeof spec === 'object') {
    const preset = typeof spec.preset === 'string' ? MaterialPresets[spec.preset] : null;
    opts = Object.assign({}, preset || {}, spec);
  } else {
    opts = { color: 0xcccccc };
  }
  // Materials are heavy (three GPU textures each), so identical specs share.
  const key = JSON.stringify(opts);
  if (cache && cache.has(key)) return cache.get(key);
  const mat = new Material(gl, opts);
  if (cache) cache.set(key, mat);
  return mat;
}
