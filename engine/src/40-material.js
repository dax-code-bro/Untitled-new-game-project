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

  normalStrength: {
    metal: 0.7, smooth: 0.35, glass: 0.2, wood: 1.3, fabric: 1.6,
    concrete: 3, brick: 3, rock: 3, rust: 2.2,
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
      c.rough = 0.82 + g * 0.12;
      c.ao = 1 - pits * 0.28;
      c.h = g * 0.42 - pits * 0.46;
    },

    brick(u, v, n, c) {
      // Running bond: every other course shifts by half a brick.
      const rows = 8, cols = 4;
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
        c.rough = 0.95;
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
        c.rough = 0.86 - tint * 0.1;
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
    wood(u, v, n, c) {
      // Rings: distance from a slightly wobbled axis, wrapped.
      const wob = n.fbm(u * 3, v * 1.2, 5, 3) * 0.35;
      const rings = Math.abs(((v * 9 + wob) % 1) * 2 - 1);
      const fibre = n.fbm(u * 4, v * 90, 2, 2) * 0.5 + 0.5;
      const dark = smoothstep(0.35, 0.85, rings);
      const base = 0.82 - dark * 0.34 + fibre * 0.12;
      c.r = base * 1.04;
      c.g = base * 0.96;
      c.b = base * 0.86;
      c.rough = 0.62 + dark * 0.2;
      c.ao = 1 - dark * 0.15;
      c.h = 0.5 + (1 - dark) * 0.3 + fibre * 0.12;
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
      c.rough = 0.88 - r * 0.08;
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
      c.rough = 0.92;
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
      c.r = base * 1.06; c.g = base * 0.98; c.b = base * 0.88;
      c.rough = 0.95;
      c.ao = 0.72 + clod * 0.28;
      c.h = clod * 0.7 + grit * 0.3;
    },

    sand(u, v, n, c) {
      const dune = n.fbm(u * 4, v * 16, 1, 3) * 0.5 + 0.5;
      const grain = n.fbm(u * 150, v * 150, 6, 2) * 0.5 + 0.5;
      const base = 0.62 + dune * 0.12 + grain * 0.06;
      c.r = base * 1.06; c.g = base * 0.94; c.b = base * 0.68;
      c.rough = 0.9;
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

    skin(u, v, n, c) {
      // Pores at high frequency, subtle blotching underneath.
      const pore = Math.pow(n.fbm(u * 180, v * 180, 3, 2) * 0.5 + 0.5, 3);
      const blotch = n.fbm(u * 9, v * 9, 12, 4) * 0.5 + 0.5;
      /* Nearly neutral, so the MATERIAL decides the skin tone.
         
         This baked a 0.92 / 0.68 / 0.58 ratio into the texture itself --
         a saturated orange that every material using it was multiplied
         by, which is why the viewmodel hands stayed a traffic cone
         through two attempts at desaturating the material colour. A
         texture supplies variation; a colour supplies colour. */
      const base = 0.86 + blotch * 0.1;
      c.r = base * 0.96;
      c.g = base * 0.90 + blotch * 0.02;
      c.b = base * 0.86;
      c.rough = 0.55 + pore * 0.2 - blotch * 0.06;
      c.ao = 1 - pore * 0.2;
      c.h = pore * 0.5 + blotch * 0.1;
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
  },
};

/* ---------------- Material ---------------- */

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
    this.normalStrength = opts.normalStrength != null ? opts.normalStrength : 1;
    this.texture = opts.texture || null;   // name of a TextureLib kind
    this.castShadow = opts.castShadow !== false;
    this.receiveShadow = opts.receiveShadow !== false;
    // Subsurface approximation — foliage and skin look dead without it.
    this.subsurface = opts.subsurface != null ? opts.subsurface : 0;

    this.maps = null;
    if (this.texture) this._buildMaps(opts.textureSize || 256, opts.textureSeed || 1);
  }

  _buildMaps(size, seed) {
    const gl = this.gl;
    const data = TextureLib.generate(this.texture, size, seed);
    const mk = (bytes, srgb) => new Texture(gl, {
      internalFormat: srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      wrap: gl.REPEAT,
      aniso: 8,
    }).upload(bytes, size, size);
    this.maps = {
      // Albedo is authored in sRGB; the GPU converts on sample. ORM and
      // normal are data, not colour, and must stay linear.
      albedo: mk(data.albedo, true),
      normal: mk(data.normal, false),
      orm: mk(data.orm, false),
    };
  }

  dispose() {
    if (this.maps) {
      this.maps.albedo.dispose();
      this.maps.normal.dispose();
      this.maps.orm.dispose();
    }
  }
}

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
