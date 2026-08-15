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

    const c = { r: 1, g: 1, b: 1, a: 1, ao: 1, rough: 0.8, metal: 0, h: 0.5 };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        c.r = c.g = c.b = 1; c.a = 1; c.ao = 1; c.rough = 0.8; c.metal = 0; c.h = 0.5;
        fn(u, v, n, c, size);
        const i = (y * size + x) * 4;
        albedo[i] = clamp(c.r, 0, 1) * 255;
        albedo[i + 1] = clamp(c.g, 0, 1) * 255;
        albedo[i + 2] = clamp(c.b, 0, 1) * 255;
        albedo[i + 3] = clamp(c.a, 0, 1) * 255;
        orm[i] = clamp(c.ao, 0, 1) * 255;
        orm[i + 1] = clamp(c.rough, 0.03, 1) * 255;
        orm[i + 2] = clamp(c.metal, 0, 1) * 255;
        orm[i + 3] = 255;
        height[y * size + x] = c.h;
      }
    }

    const normal = this.heightToNormal(height, size, 3);
    const maps = { albedo, orm, normal, size };
    this._cache.set(key, maps);
    return maps;
  },

  /* Surface recipes. Each writes into `c` for one texel.
     These are tuned by eye for readability at gameplay distance rather
     than for physical accuracy at macro-photography range. */
  kinds: {
    concrete(u, v, n, c) {
      const g = n.fbm(u * 8, v * 8, 0, 5) * 0.5 + 0.5;
      const pits = Math.max(0, n.fbm(u * 26, v * 26, 3.3, 3));
      const stain = n.fbm(u * 3, v * 3, 9, 3) * 0.5 + 0.5;
      const base = 0.42 + g * 0.16 - pits * 0.18;
      c.r = base * (0.98 + stain * 0.06);
      c.g = base * (0.97 + stain * 0.05);
      c.b = base * 0.95;
      c.rough = 0.82 + g * 0.12;
      c.ao = 1 - pits * 0.55;
      c.h = g * 0.6 - pits * 0.7;
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

    wood(u, v, n, c) {
      // Rings: distance from a slightly wobbled axis, wrapped.
      const wob = n.fbm(u * 3, v * 1.2, 5, 3) * 0.35;
      const rings = Math.abs(((v * 9 + wob) % 1) * 2 - 1);
      const fibre = n.fbm(u * 4, v * 90, 2, 2) * 0.5 + 0.5;
      const dark = smoothstep(0.35, 0.85, rings);
      const base = 0.55 - dark * 0.28 + fibre * 0.08;
      c.r = base * 0.72;
      c.g = base * 0.46;
      c.b = base * 0.24;
      c.rough = 0.62 + dark * 0.2;
      c.ao = 1 - dark * 0.15;
      c.h = 0.5 + (1 - dark) * 0.3 + fibre * 0.12;
    },

    metal(u, v, n, c) {
      // Brushed: strongly anisotropic noise, plus a few deeper scratches.
      const brush = n.fbm(u * 400, v * 3, 1, 2) * 0.5 + 0.5;
      const patina = n.fbm(u * 6, v * 6, 11, 4) * 0.5 + 0.5;
      const scratch = Math.pow(Math.max(0, n.fbm(u * 90, v * 5, 21, 2)), 3) * 3;
      const base = 0.62 + brush * 0.12 - patina * 0.08;
      c.r = base; c.g = base * 1.01; c.b = base * 1.04;
      c.metal = 1;
      c.rough = clamp(0.28 + brush * 0.18 + patina * 0.12 - scratch * 0.15, 0.06, 0.9);
      c.ao = 1;
      c.h = brush * 0.5 + scratch * 0.4;
    },

    rust(u, v, n, c) {
      const blotch = n.fbm(u * 5, v * 5, 4, 5) * 0.5 + 0.5;
      const grit = n.fbm(u * 60, v * 60, 8, 3) * 0.5 + 0.5;
      const rusty = smoothstep(0.35, 0.75, blotch);
      c.r = lerp(0.55, 0.42, rusty) * (0.85 + grit * 0.3);
      c.g = lerp(0.56, 0.19, rusty) * (0.85 + grit * 0.3);
      c.b = lerp(0.58, 0.09, rusty) * (0.85 + grit * 0.3);
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

    dirt(u, v, n, c) {
      const clod = n.fbm(u * 12, v * 12, 3, 4) * 0.5 + 0.5;
      const grit = n.fbm(u * 80, v * 80, 9, 2) * 0.5 + 0.5;
      const base = 0.24 + clod * 0.16 + grit * 0.07;
      c.r = base * 1.15; c.g = base * 0.85; c.b = base * 0.60;
      c.rough = 0.95;
      c.ao = 0.6 + clod * 0.4;
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

    /* Dry savanna earth: ochre hardpan with crack lines and pale straw
       streaks — the ground that shows through dead, sun-beaten grass. */
    savanna(u, v, n, c) {
      const clod = n.fbm(u * 10, v * 10, 21, 4) * 0.5 + 0.5;
      const turb = n.fbm(u * 5, v * 5, 43, 4);
      const crack = Math.pow(1 - Math.abs(Math.sin((u * 7 + turb * 2.6) * PI)), 10);
      const straw = n.fbm(u * 55, v * 55, 3, 2) * 0.5 + 0.5;
      const patch = smoothstep(0.45, 0.75, n.fbm(u * 3.2, v * 3.2, 9, 3) * 0.5 + 0.5);
      const base = 0.42 + clod * 0.16;
      c.r = base * 1.18; c.g = base * 0.86; c.b = base * 0.52;
      // Straw mats lighten toward dry gold in patches.
      const st = straw * 0.30 * patch;
      c.r = lerp(c.r, 0.74, st); c.g = lerp(c.g, 0.66, st); c.b = lerp(c.b, 0.40, st);
      // Cracks darken.
      const k = 1 - crack * 0.38;
      c.r *= k; c.g *= k; c.b *= k;
      c.rough = 0.96;
      c.ao = 0.62 + clod * 0.38;
      c.h = clod * 0.55 + straw * 0.25 - crack * 0.35;
    },

    /* Wet mud: dark churned earth. Wet hollows drop the roughness hard,
       which is what actually reads as "wet" under a light. */
    mud(u, v, n, c) {
      const churn = n.fbm(u * 9, v * 9, 27, 4) * 0.5 + 0.5;
      const rut = n.fbm(u * 3, v * 22, 51, 2) * 0.5 + 0.5;
      const wet = smoothstep(0.35, 0.75, n.fbm(u * 5, v * 5, 31, 3) * 0.5 + 0.5);
      const base = 0.15 + churn * 0.09 + rut * 0.04;
      c.r = base * 1.02; c.g = base * 0.74; c.b = base * 0.50;
      // Wet areas darken and gloss up.
      const dk = 1 - wet * 0.35;
      c.r *= dk; c.g *= dk; c.b *= dk;
      c.rough = 0.9 - wet * 0.62;
      c.ao = 0.55 + churn * 0.45;
      c.h = churn * 0.6 + rut * 0.4 - wet * 0.3;
    },

    /* Animal fur: dense strands running along the body (v), broken into
       clumps, over large hide-tone patches, with pale guard hairs on top.
       The height channel turns the strands into micro-relief, which is what
       reads as "fur" when light rakes across it. Tint comes from the
       material colour, so one texture serves every coat. */
    fur(u, v, n, c) {
      // Fine strands, not wood grain: high frequency along the body too.
      const strand = n.fbm(u * 340, v * 70, 5, 2) * 0.5 + 0.5;
      const clump = n.fbm(u * 60, v * 18, 11, 2) * 0.5 + 0.5;
      const patch = n.fbm(u * 6, v * 3, 23, 3) * 0.5 + 0.5;
      const guard = Math.pow(n.fbm(u * 420, v * 160, 31, 1) * 0.5 + 0.5, 6);
      const t = (0.58 + patch * 0.2) * (0.78 + strand * 0.2 + clump * 0.09);
      c.r = t * 1.06; c.g = t * 0.97; c.b = t * 0.86;
      const gh = guard * 0.45;
      c.r += gh; c.g += gh; c.b += gh * 0.9;
      c.rough = 0.97 - strand * 0.05;
      c.ao = 0.7 + clump * 0.3;
      c.h = strand * 0.8 + clump * 0.2;
      // Alpha is the strand-density mask the fur shells clip against: only
      // the cores of strands survive to the outer layers. Sharpened with a
      // power curve so the mask reads as distinct wispy tufts at the outer
      // shells instead of a soft, uniform fuzz — real fur clumps unevenly.
      const strandSharp = Math.pow(strand, 1.7);
      c.a = clamp(strandSharp * 0.78 + clump * 0.22 + (guard > 0.18 ? 0.32 : 0), 0, 1);
    },

    /* Whitetail coat: fur strands plus the real markings — dark dorsal
       back fading to a cream belly (countershading), the white throat
       patch, white muzzle band, dark nose, darker forehead, legs darkening
       toward baked-in dark hooves. Relies on the deer UV layout:
       u wraps the body with u=0 at the spine, v runs rump(0)->nose(0.78),
       legs live in v 0.80-0.955, hooves 0.955-0.97, ears above. */
    furDeer(u, v, n, c) {
      TextureLib.kinds.fur(u, v, n, c);
      const top = Math.cos(u * TAU) * 0.5 + 0.5;      // 1 = spine, 0 = belly
      if (v < 0.79) {
        const t = Math.pow(top, 0.75);
        const m = lerp(1.32, 0.86, t);                 // countershading
        c.r *= m; c.g *= m * 0.97; c.b *= m * 0.9;
        if (top < 0.22) {                              // white underside
          const w = smoothstep(0.22, 0.06, top) * 0.85;
          c.r = lerp(c.r, 0.93, w); c.g = lerp(c.g, 0.91, w); c.b = lerp(c.b, 0.86, w);
        }
        if (v > 0.55 && v < 0.68 && top < 0.42) {      // throat patch
          const w = smoothstep(0.42, 0.16, top) * smoothstep(0.55, 0.58, v) * smoothstep(0.68, 0.65, v);
          c.r = lerp(c.r, 0.96, w); c.g = lerp(c.g, 0.95, w); c.b = lerp(c.b, 0.91, w);
        }
        if (v > 0.62 && v < 0.74 && top > 0.55) {      // darker forehead/crown
          c.r *= 0.86; c.g *= 0.85; c.b *= 0.82;
        }
        if (v > 0.735 && v < 0.768 && top < 0.6) {     // white muzzle band
          const w = smoothstep(0.6, 0.3, top);
          c.r = lerp(c.r, 0.94, w); c.g = lerp(c.g, 0.93, w); c.b = lerp(c.b, 0.9, w);
        }
        if (v > 0.772) {                               // dark nose tip
          c.r *= 0.3; c.g *= 0.27; c.b *= 0.26; c.rough = 0.55;
        }
      } else if (v < 0.955) {                          // legs darken downward
        const m = lerp(1.0, 0.78, (v - 0.8) / 0.155);
        c.r *= m; c.g *= m; c.b *= m;
      } else if (v < 0.97) {                           // hooves: dark horn, no fur
        c.r *= 0.16; c.g *= 0.14; c.b *= 0.13; c.rough = 0.45; c.a = 0;
      } else {
        // Ears keep the coat colour but opt out of the shells: 3cm of
        // shell fur would swallow a 1cm-thick ear whole.
        c.a = 0;
      }
      if (v > 0.772 && v < 0.79) c.a = 0;              // bare nose
    },

    /* Fawn coat: the same fur with cream dapple spots. */
    furFawn(u, v, n, c) {
      TextureLib.kinds.fur(u, v, n, c);
      const d = n.fbm(u * 26, v * 46, 77, 1) * 0.5 + 0.5;
      const spot = smoothstep(0.66, 0.74, d);
      c.r = lerp(c.r, 0.96, spot * 0.85);
      c.g = lerp(c.g, 0.93, spot * 0.85);
      c.b = lerp(c.b, 0.84, spot * 0.85);
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

    fabric(u, v, n, c) {
      // Over-under weave from two out-of-phase square waves.
      const wu = Math.sin(u * PI * 120), wv = Math.sin(v * PI * 120);
      const weave = (wu > 0 ? 1 : 0) ^ (wv > 0 ? 1 : 0);
      const fuzz = n.fbm(u * 200, v * 200, 4, 2) * 0.5 + 0.5;
      const base = 0.35 + weave * 0.08 + fuzz * 0.08;
      c.r = base * 0.75; c.g = base * 0.8; c.b = base * 0.95;
      c.rough = 0.96;
      c.ao = 0.75 + weave * 0.25;
      c.h = weave * 0.6 + fuzz * 0.2;
    },

    skin(u, v, n, c) {
      // Pores at high frequency, subtle blotching underneath.
      const pore = Math.pow(n.fbm(u * 180, v * 180, 3, 2) * 0.5 + 0.5, 3);
      const blotch = n.fbm(u * 9, v * 9, 12, 4) * 0.5 + 0.5;
      const base = 0.82 + blotch * 0.1;
      c.r = base * 0.92;
      c.g = base * 0.68 + blotch * 0.03;
      c.b = base * 0.58;
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
       normal/ORM detail would only add noise. */
    smooth(u, v, n, c) {
      c.r = c.g = c.b = 1;
      c.rough = 0.4; c.ao = 1; c.h = 0.5;
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
    // Per-vertex baked color (carved-from-photos meshes) instead of a
    // UV-mapped texture.
    this.vertexColor = !!opts.vertexColor;

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
  savanna: { color: 0xffffff, texture: 'savanna', roughness: 0.96, metalness: 0 },
  mud: { color: 0xffffff, texture: 'mud', roughness: 0.8, metalness: 0 },
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
