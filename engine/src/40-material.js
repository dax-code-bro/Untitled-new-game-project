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

  /* A flat stand-in at the material's own reflectance, for the moment
     between a scan being asked for and arriving. Two texels: it is only
     ever seen for a frame or two, and it keeps the shader's map path
     valid so there is no branch to get wrong. */
  neutral(meanAlbedo = 0.3) {
    const key = `neutral:${meanAlbedo}`;
    if (this._cache.has(key)) return this._cache.get(key);
    const size = 2, n = size * size;
    const albedo = new Uint8Array(n * 4);
    const orm = new Uint8Array(n * 4);
    const normal = new Uint8Array(n * 4);
    // Back out of linear reflectance into the sRGB byte the GPU expects.
    const lin = Math.max(0, Math.min(1, meanAlbedo));
    const srgb = Math.round((lin <= 0.0031308 ? lin * 12.92 : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055) * 255);
    for (let i = 0; i < n; i++) {
      albedo[i * 4] = srgb; albedo[i * 4 + 1] = srgb; albedo[i * 4 + 2] = srgb; albedo[i * 4 + 3] = 255;
      orm[i * 4] = 255; orm[i * 4 + 1] = 204; orm[i * 4 + 2] = 0; orm[i * 4 + 3] = 255;
      normal[i * 4] = 128; normal[i * 4 + 1] = 128; normal[i * 4 + 2] = 255; normal[i * 4 + 3] = 255;
    }
    const maps = { albedo, orm, normal, size };
    this._cache.set(key, maps);
    return maps;
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

    // Punchier bump strength — the old 3 read flat at gameplay distance;
    // this is tuned by eye against the material montage, not a physical unit.
    const normal = this.heightToNormal(height, size, 4.5);
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

    /* Greyscale ground detail whose albedo averages to 1.

       Every other generator here bakes its own colour, which is right for a
       brick wall and wrong for terrain: terrain has to be sand at the water
       line and meadow on the flat and bare rock on the ridge, and a mesh
       cannot swap materials per vertex. This one supplies only the surface —
       clods, grain, grit, and the normal and occlusion that go with them —
       and leaves the hue to the per-vertex colour, which is how terrain is
       shaded in practice. Averaging to 1 is the whole trick: multiply by it
       and the vertex colour comes through unchanged in brightness. */
    /* Leaf detail, on the same principle as terrainDetail: the albedo
       averages to 1 so the vertex colour decides the hue and this map only
       supplies the grain. It exists because the obvious choice — pointing a
       canopy at the `grass` texture — multiplies two green albedos together
       and turns a wood black at noon.

       The pattern is two scales: clumps of leaves, and the leaves in them.
       The occlusion is deliberately strong, because the inside of a crown
       genuinely is dark and that is most of what makes a tree read as a
       volume rather than a painted ball. */
    foliageDetail(u, v, n, c) {
      const clump = n.fbm(u * 9, v * 9, 31, 3) * 0.5 + 0.5;
      const leaf = n.fbm(u * 44, v * 44, 47, 3) * 0.5 + 0.5;
      const vein = n.fbm(u * 150, v * 150, 53, 2) * 0.5 + 0.5;
      const l = 0.74 + clump * 0.24 + leaf * 0.20 + vein * 0.06;
      c.r = l * 0.98; c.g = l * 1.02; c.b = l * 0.92;
      c.rough = 0.80 + leaf * 0.16;
      c.ao = 0.42 + clump * 0.38 + leaf * 0.20;
      c.h = clump * 0.6 + leaf * 0.4;
      /* Where the foliage actually is. A crown is mostly gaps — a
         summer canopy passes roughly a third of the sky — and this
         alpha is the only thing standing between a solid cone of
         geometry and a tree.

         It was failing on both counts. Two fbms added together are
         narrowly distributed around a half, so the old curve put the
         mean at 0.53 against a clip threshold of 0.35 — about one and
         a half standard deviations clear of it, which discards eight
         per cent of the surface rather than a third. And what little
         it did discard came mostly from the high-frequency term, so
         the holes were single texels: a crown with pinpricks in it,
         which from any distance is a solid crown. Woods were casting
         pools of solid black and the trees in them had the silhouette
         of traffic cones.

         So the mask is now dominated by the coarse term, which is what
         makes gaps the size of a bough rather than of a leaf, and the
         offset and gain are chosen so that a third of it genuinely
         falls below the threshold: the spread of clump*0.78+leaf*0.22
         is about 0.097, so a gain of 2.6 about a mean of 0.328 puts
         the clip point a third of a standard deviation inside the
         distribution. The fine structure has not gone anywhere — it
         rides on top, and the close-up detail sample puts it back at
         the range where a leaf is a thing you can see. */
      c.a = Math.max(0, Math.min(1, (clump * 0.78 + leaf * 0.22 - 0.328) * 2.6));
    },

    terrainDetail(u, v, n, c) {
      const coarse = n.fbm(u * 9, v * 9, 5, 3) * 0.5 + 0.5;
      const fine = n.fbm(u * 64, v * 64, 11, 2) * 0.5 + 0.5;
      const grit = n.fbm(u * 190, v * 190, 23, 2) * 0.5 + 0.5;
      // Kept close to 1: this map exists to add grain, not contrast. Wide
      // swings here fight the vertex colour it is multiplying.
      const l = 0.90 + coarse * 0.11 + fine * 0.07 + grit * 0.03;
      c.r = l; c.g = l; c.b = l;
      c.rough = 0.86 + fine * 0.12;
      c.ao = 0.70 + coarse * 0.30;
      c.h = coarse * 0.55 + fine * 0.35 + grit * 0.10;
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
        /* Countershading: strong down the body, easing off over the head.
           A skull is small enough that the light needs no cancelling
           across it, and running the body gradient over a muzzle paints a
           maroon war-stripe down the bridge of the nose. It also has to
           stay near-neutral in hue — pulling blue down harder than red
           turns a grey-brown deer face red. */
        const headFade = 1 - smoothstep(0.6, 0.72, v) * 0.66;
        const t = Math.pow(top, 0.6);
        const m = 1 + (lerp(1.42, 0.82, t) - 1) * headFade;
        c.r *= m; c.g *= m * 0.99; c.b *= m * 0.97;
        if (top < 0.36) {                              // white underside
          const w = smoothstep(0.36, 0.05, top) * 0.88 * headFade;
          c.r = lerp(c.r, 0.93, w); c.g = lerp(c.g, 0.91, w); c.b = lerp(c.b, 0.86, w);
        }
        if (v > 0.55 && v < 0.68 && top < 0.42) {      // throat patch
          const w = smoothstep(0.42, 0.16, top) * smoothstep(0.55, 0.58, v) * smoothstep(0.68, 0.65, v);
          c.r = lerp(c.r, 0.96, w); c.g = lerp(c.g, 0.95, w); c.b = lerp(c.b, 0.91, w);
        }
        if (v > 0.63 && v < 0.73) {                    // darker forehead cap
          const w = smoothstep(0.63, 0.67, v) * smoothstep(0.73, 0.70, v) * smoothstep(0.45, 0.85, top);
          c.r = lerp(c.r, c.r * 0.76, w); c.g = lerp(c.g, c.g * 0.74, w); c.b = lerp(c.b, c.b * 0.72, w);
        }
        if (v > 0.742) {                               // white ring round the muzzle
          const w = smoothstep(0.742, 0.757, v) * smoothstep(0.777, 0.766, v);
          c.r = lerp(c.r, 0.95, w); c.g = lerp(c.g, 0.94, w); c.b = lerp(c.b, 0.91, w);
        }
        if (v > 0.772) {                               // dark nose tip
          c.r *= 0.3; c.g *= 0.29; c.b *= 0.29; c.rough = 0.5;
        }
      } else if (v < 0.955) {                          // legs darken downward
        const m = lerp(1.0, 0.78, (v - 0.8) / 0.155);
        c.r *= m; c.g *= m; c.b *= m;
      } else if (v < 0.97) {                           // hooves: dark horn, no fur
        c.r *= 0.16; c.g *= 0.14; c.b *= 0.13; c.rough = 0.45; c.a = 0;
      } else {
        // Ears keep the coat colour but opt out of the shells: 3cm of
        // shell fur would swallow a 1cm-thick ear whole. The inside of a
        // deer's ear is near-white and thinly haired; the back carries
        // the body colour with a dark rim.
        const face = Math.sin(u * TAU);
        const inside = smoothstep(-0.2, 0.6, face);
        c.r = lerp(c.r * 0.82, 0.9, inside * 0.75);
        c.g = lerp(c.g * 0.8, 0.87, inside * 0.75);
        c.b = lerp(c.b * 0.78, 0.81, inside * 0.75);
        c.a = 0;
      }
      if (v > 0.772 && v < 0.79) c.a = 0;              // bare nose
    },

    /* The general mammal coat, on the same UV atlas as furDeer: u wraps
       the body with u=0 at the spine, v runs rump(0.02) -> nose(0.78),
       legs 0.80-0.955, paws 0.955-0.97, ears above 0.97.

       Almost every land mammal is countershaded — dark along the back,
       pale underneath — because it cancels the shading from overhead sun
       and flattens the animal's silhouette. A uniformly tinted coat is
       the single loudest "this is a toy" signal on a model, so the
       gradient, the pale throat, the dark muzzle and the dark ear backs
       all live here and every species gets them for free from its own
       base colour. */
    furCoat(u, v, n, c) {
      TextureLib.kinds.fur(u, v, n, c);
      const top = Math.cos(u * TAU) * 0.5 + 0.5;      // 1 = spine, 0 = belly
      if (v < 0.79) {
        // Saddle to belly. The exponent puts the transition low on the
        // flank, where it sits on a real animal, rather than halfway up.
        // Eased off over the head for the same reason as furDeer.
        const headFade = 1 - smoothstep(0.6, 0.72, v) * 0.62;
        const t = Math.pow(top, 0.62);
        const m = 1 + (lerp(1.45, 0.8, t) - 1) * headFade;
        c.r *= m; c.g *= m * 0.995; c.b *= m * 0.98;
        if (top < 0.4) {                               // pale underside
          const w = smoothstep(0.4, 0.04, top) * 0.8 * headFade;
          c.r = lerp(c.r, 0.88, w); c.g = lerp(c.g, 0.85, w); c.b = lerp(c.b, 0.77, w);
        }
        if (v > 0.54 && v < 0.70 && top < 0.4) {       // pale throat
          const w = smoothstep(0.4, 0.12, top) * smoothstep(0.54, 0.58, v) * smoothstep(0.70, 0.66, v) * 0.8;
          c.r = lerp(c.r, 0.88, w); c.g = lerp(c.g, 0.85, w); c.b = lerp(c.b, 0.78, w);
        }
        if (v > 0.70 && v < 0.775) {                   // muzzle, paler on the sides
          const w = smoothstep(0.7, 0.35, top) * 0.55;
          c.r = lerp(c.r, 0.8, w); c.g = lerp(c.g, 0.77, w); c.b = lerp(c.b, 0.7, w);
        }
        if (v > 0.772) {                               // wet nose leather
          c.r *= 0.26; c.g *= 0.24; c.b *= 0.24; c.rough = 0.42;
        }
      } else if (v < 0.955) {                          // legs: shorter, darker hair
        const m = lerp(1.0, 0.84, (v - 0.8) / 0.155);
        c.r *= m; c.g *= m; c.b *= m;
      } else if (v < 0.97) {                           // paw / hoof: bare horn
        c.r *= 0.2; c.g *= 0.18; c.b *= 0.17; c.rough = 0.5; c.a = 0;
      } else {
        /* Ear. The plate's two faces are what matter, not its width: the
           lofted ring is flat in its `fwd` axis, so sin(u*TAU) is +1 on
           the front of the ear and -1 on the back. Dark back, pale
           thinly-furred inside — the marking that makes a canid or a
           felid read as itself from behind. No shells: the plate is
           thinner than the coat is deep. */
        const face = Math.sin(u * TAU);
        const m = lerp(1.18, 0.42, smoothstep(-0.25, 0.55, -face));
        c.r *= m; c.g *= m; c.b *= m;
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
    /* How many times finer the close-up detail sample is than the base one.
       Zero disables it and costs nothing. Worth setting on any surface the
       player gets within a few metres of — ground above all, where the base
       tile has to be large enough to cover a landscape. */
    this.detailScale = opts.detailScale != null ? opts.detailScale : 0;
    this.normalStrength = opts.normalStrength != null ? opts.normalStrength : 1;
    this.texture = opts.texture || null;   // name of a TextureLib kind
    /* Name of a scanned material in 41-scans.js. A scan is a photograph
       of the real surface and beats anything a noise function can do, so
       when one is named it replaces the procedural maps as soon as the
       browser has decoded it. The procedural texture stays as the thing
       on screen in the meantime. */
    this.scan = opts.scan || null;
    /* A second scanned material and the slope band over which it takes
       over, in sines of the surface angle: 0.30 is about 17 degrees,
       0.62 about 38. */
    this.scan2 = opts.scan2 || null;
    this.uvScale2 = opts.uvScale2 != null ? opts.uvScale2 : (opts.uvScale != null ? opts.uvScale : 1);
    this.slopeBlend = opts.slopeBlend || [0.30, 0.62];
    /* Automatic close-up detail.

       A capture has a real size — half a metre of brick, two metres of
       soil — and that is also the finest thing it can say. Stand close
       enough and you are looking at one tile across your whole screen:
       a smooth wash where there should be grain, because the photograph
       simply has no more to give at that distance.

       Rather than pick a number per preset (which nobody will ever keep
       in step with the captures), derive it from the capture's own
       size. Target grain is four centimetres — roughly the scale at
       which bark, soil, weave and skin all have structure the eye can
       still resolve at arm's length — so the detail tile repeats
       `metresPerTile / 0.04` times inside the base one. The bounds are
       aliasing on one side and pointlessness on the other: below about
       three the detail says nothing the base tile did not, and above
       about twenty-four it turns to sparkle before the distance fade
       can hide it.

       This is the near half of the detail ladder. The far half throws
       geometry away as things recede; this one finds surface that was
       never in the texture as they approach. Nothing here costs
       anything beyond a few metres — the shader fades the whole sample
       out with distance and skips it entirely at zero. */
    if (opts.detailScale == null && this.scan && typeof SCAN !== 'undefined' && SCAN[this.scan]) {
      const mpt = SCAN[this.scan].metresPerTile;
      if (mpt > 0) this.detailScale = Math.max(3, Math.min(24, Math.round(mpt / 0.04)));
    }
    this.castShadow = opts.castShadow !== false;
    this.receiveShadow = opts.receiveShadow !== false;
    // Subsurface approximation — foliage and skin look dead without it.
    this.subsurface = opts.subsurface != null ? opts.subsurface : 0;
    // Per-vertex baked color (carved-from-photos meshes) instead of a
    // UV-mapped texture.
    this.vertexColor = !!opts.vertexColor;
    /* Cut the surface away where the texture says there is nothing there.
       A canopy modelled as a solid cone is a painted cone whatever is on
       it; cut it against a leaf mask and the silhouette becomes leaves,
       which is most of what tells you a tree is a tree at fifty metres. */
    this.alphaClip = !!opts.alphaClip;

    this.maps = null;
    this.scanReady = false;
    if (this.texture || this.scan) this._buildMaps(opts.textureSize || 256, opts.textureSeed || 1);
    if (this.scan) this._requestScan();
    /* uHasMaps is 0 unless `maps` exists, and the shader reads the second
       set only at 2 — so a scan2 without a first set would upload three
       textures nothing can ever sample. */
    if (this.scan2 && this.maps) this._requestScan2();
  }

  _newMap(srgb) {
    const gl = this.gl;
    return new Texture(gl, {
      internalFormat: srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      wrap: gl.REPEAT,
      aniso: 8,
    });
  }

  _buildMaps(size, seed) {
    const data = this.texture
      ? TextureLib.generate(this.texture, size, seed)
      : TextureLib.neutral(typeof SCAN !== 'undefined' && SCAN[this.scan] ? SCAN[this.scan].meanAlbedo : 0.3);
    const n = data.size;
    this.maps = {
      // Albedo is authored in sRGB; the GPU converts on sample. ORM and
      // normal are data, not colour, and must stay linear.
      albedo: this._newMap(true).upload(data.albedo, n, n),
      normal: this._newMap(false).upload(data.normal, n, n),
      orm: this._newMap(false).upload(data.orm, n, n),
    };
  }

  /* The steep-ground material. It gets its own three textures rather
     than sharing, because its tile size is its own. */
  _requestScan2() {
    if (typeof loadScan !== 'function') return;
    this.maps2 = {
      albedo: this._newMap(true).upload(TextureLib.neutral(0.25).albedo, 2, 2),
      normal: this._newMap(false).upload(TextureLib.neutral(0.25).normal, 2, 2),
      orm: this._newMap(false).upload(TextureLib.neutral(0.25).orm, 2, 2),
    };
    loadScan(this.scan2).then((s) => {
      if (!s || !this.maps2 || !this.gl) return;
      this.maps2.albedo.upload(s.albedo.data, s.albedo.size, s.albedo.size);
      this.maps2.normal.upload(s.normal.data, s.normal.size, s.normal.size);
      this.maps2.orm.upload(s.orm.data, s.orm.size, s.orm.size);
    }).catch(() => {});
  }

  /* Swap the procedural maps for the photographed ones the moment they
     have decoded. Nothing waits on this: the surface is already on
     screen, it simply gets better. */
  _requestScan() {
    if (typeof loadScan !== 'function') return;
    loadScan(this.scan).then((s) => {
      if (!s || !this.maps || !this.gl) return;
      this.maps.albedo.upload(s.albedo.data, s.albedo.size, s.albedo.size);
      this.maps.normal.upload(s.normal.data, s.normal.size, s.normal.size);
      this.maps.orm.upload(s.orm.data, s.orm.size, s.orm.size);
      this.scanReady = true;
      if (s.spec && s.spec.subsurface && !this._ssOverride) this.subsurface = Math.max(this.subsurface, s.spec.subsurface);
      /* Variants are shallow copies taken at spawn, which is long before
         this decode lands. They share the `maps` object by reference, so
         the new textures reach them for free — but these two are plain
         numbers copied by value, and without this a 5 m patch of savanna
         would light differently from a 1 m one for want of a scatter
         term. */
      if (this._variants) {
        for (const v of this._variants.values()) {
          v.scanReady = true;
          if (!v._ssOverride) v.subsurface = this.subsurface;
        }
      }
    }).catch(() => { /* a missing scan is not a reason to lose the surface */ });
  }

  /* The same surface at a different texture density.

     Texture density has to follow object size — a 0.5 m capture of steel
     stretched over a forty-metre ferry is not steel, it is a smear — but
     draws are batched by material, so the scale cannot be a per-actor
     uniform. The answer is a second Material that shares the first one's
     GPU textures and differs only in how often they repeat. Quantising
     to powers of two keeps the number of them small: a few variants
     cover every object in the game from a fire-ring stone to a quarry
     boulder. */
  variant(uvScale) {
    const k = Material.bucket(uvScale);
    if (Math.abs(k - this.uvScale) < 1e-6) return this;
    if (!this._variants) this._variants = new Map();
    const hit = this._variants.get(k);
    if (hit) return hit;
    const v = Object.create(Material.prototype);
    Object.assign(v, this);
    /* A fresh id, and it has to be fresh. Object.assign copies `id`, and
       the renderer batches by `mesh|material.id`, so a variant that kept
       its parent's id would hash into the parent's batch — and a batch
       captures its material once, at creation, for the life of the
       session. The first roof built would then pin the gravel density
       for every roof in the game: a garage and a warehouse are both a
       unit box with the same material, so one of them would be tiled
       eight times wrong, permanently, and which one depended on build
       order. The whole point of a variant is to be a different batch. */
    v.id = _materialId++;
    v.uvScale = k;
    v.uvScale2 = this.uvScale2 === this.uvScale ? k : this.uvScale2;
    v._variants = null;
    v._shared = true;                 // its maps belong to the parent
    this._variants.set(k, v);
    return v;
  }

  /* Powers of two from an eighth of a tile to thirty-two of them. */
  static bucket(v) {
    if (!(v > 0) || !Number.isFinite(v)) return 1;
    const e = Math.round(Math.log2(Math.max(0.125, Math.min(64, v))));
    return Math.pow(2, Math.max(-3, Math.min(6, e)));
  }

  /* How many metres of real surface one tile of this material covers.
     Only a scanned material knows; a procedural one has no real size. */
  get metresPerTile() {
    if (this.scan && typeof SCAN !== 'undefined' && SCAN[this.scan]) return SCAN[this.scan].metresPerTile;
    return 0;
  }

  dispose() {
    if (this._shared) return;         // a variant does not own its textures
    for (const m of [this.maps, this.maps2]) {
      if (!m) continue;
      m.albedo.dispose(); m.normal.dispose(); m.orm.dispose();
    }
    this.maps = this.maps2 = null;
    /* The variants are still held by whatever batch groups reference
       them, and they are still pointing at the textures just deleted.
       Cut them loose so a stale draw binds the fallback maps instead of
       a freed GL object. */
    if (this._variants) {
      for (const v of this._variants.values()) { v.maps = null; v.maps2 = null; }
      this._variants.clear();
    }
  }
}

/* Sensible presets so a game can say `material: 'gold'` and get something
   that reads correctly under the engine's lighting. */
const MaterialPresets = {
  concrete: { color: 0xffffff, texture: 'concrete', scan: 'stoneFloor', roughness: 0.9, metalness: 0 },
  brick: { color: 0xffffff, texture: 'brick', scan: 'brick', roughness: 0.9, metalness: 0 },
  wood: { color: 0xffffff, texture: 'wood', scan: 'plank', roughness: 0.7, metalness: 0 },
  metal: { color: 0xc8ccd0, texture: 'metal', scan: 'wornMetal', roughness: 0.35, metalness: 1 },
  steel: { color: 0x9aa2aa, texture: 'metal', scan: 'wornMetal', roughness: 0.4, metalness: 1 },
  gold: { color: 0xffd276, texture: 'metal', roughness: 0.25, metalness: 1 },
  copper: { color: 0xd08a52, texture: 'metal', roughness: 0.32, metalness: 1 },
  rust: { color: 0xb07a4e, texture: 'rust', scan: 'wornMetal', roughness: 0.92, metalness: 0.2 },
  rock: { color: 0xffffff, texture: 'rock', scan: 'rock', roughness: 0.92, metalness: 0 },
  stone: { color: 0xffffff, texture: 'rock', scan: 'rock', roughness: 0.92, metalness: 0 },
  grass: { color: 0xffffff, texture: 'grass', scan: 'meadow', roughness: 0.95, metalness: 0, subsurface: 0.35 },
  /* Neutral grain for anything shaded by vertex colours — a hand-built
     mesh, a painted panel, a gun. Every other preset bakes a colour into
     its texture, which multiplies with the vertex colour and darkens it;
     this one averages to 1 and leaves the colour alone. */
  painted: { color: 0xffffff, texture: 'terrainDetail', roughness: 0.55, metalness: 0,
    uvScale: 3.0, normalStrength: 0.35, detailScale: 6 },

  /* For anything whose colour comes from vertex colours: canopies, shrubs,
     hedges. The `grass` preset bakes a green albedo of its own and is the
     wrong thing to point a leaf at. */
  /* detailScale is set by hand here because it is normally derived from
     a capture's real-world tile size and this one has no capture. Nine
     tiles of leaf per crown is about a hand's width per tile, so five
     times finer is a leaf — which is the scale that appears when you
     walk up to a shrub and is simply not there from across a field. */
  /* uvScale was 9, which put eighty-one cycles of the leaf mask across
     a crown — every gap smaller than a leaf and the whole thing reading
     as solid. Gaps in a canopy are the size of the spaces between
     boughs, so the tile has to be a fair fraction of the crown; three
     puts the coarse term at about nine cycles across it, which is
     roughly a bough. detailScale then samples the same maps fifteen
     times finer for anything within a few metres, so walking up to a
     shrub still finds leaves. */
  foliage: { color: 0xffffff, texture: 'foliageDetail', alphaClip: true, roughness: 0.88, metalness: 0,
    subsurface: 0.5, doubleSided: true, uvScale: 3, normalStrength: 0.55, detailScale: 15 },
  dirt: { color: 0xffffff, texture: 'dirt', scan: 'dirt', roughness: 0.96, metalness: 0 },
  // Neutral ground for vertex-coloured terrain: detail from the texture,
  // colour from the mesh.
  // Low normal strength on purpose: ground detail is centimetres of grain
  // over metres of tile, and at full bump it reads as corrugated iron.
  /* The ground. Two photographed surfaces: soil grain everywhere, rock
     grain where the slope is too steep for soil to stay on it, blended
     over the same 25-46 degree band the island's own colouring uses. Both
     are structure only — the biome decides the colour, the photograph
     decides what the surface is made of. */
  terrain: { color: 0xffffff, texture: 'terrainDetail', scan: 'groundDetail', scan2: 'rockDetail',
    slopeBlend: [0.42, 0.72], roughness: 0.95, metalness: 0, subsurface: 0.12,
    normalStrength: 0.95, detailScale: 9 },
  savanna: { color: 0xffffff, texture: 'savanna', scan: 'grassTurf', roughness: 0.96, metalness: 0 },
  /* Surfaces that had no preset at all, so every hide, split log, gravel
     bed and sheet of water in the game was routed through cloth, sawn
     plank or concrete instead. */
  leather: { color: 0xffffff, texture: 'fabric', scan: 'leather', roughness: 0.72, metalness: 0 },
  hide: { color: 0xffffff, texture: 'fabric', scan: 'leather', roughness: 0.80, metalness: 0 },
  pelt: { color: 0xffffff, texture: 'fabric', scan: 'fur', roughness: 0.95, metalness: 0, subsurface: 0.25 },
  roughWood: { color: 0xffffff, texture: 'wood', scan: 'roughWood', roughness: 0.88, metalness: 0 },
  timber: { color: 0xffffff, texture: 'wood', scan: 'weatheredTimber', roughness: 0.92, metalness: 0 },
  gravel: { color: 0xffffff, texture: 'rock', scan: 'gravel', roughness: 0.94, metalness: 0 },
  canvas: { color: 0xffffff, texture: 'fabric', scan: 'sailcloth', roughness: 0.95, metalness: 0, subsurface: 0.22 },
  rope: { color: 0xa98f63, texture: 'fabric', scan: 'rope', roughness: 0.94, metalness: 0 },
  /* Water takes its colour from the sky, so the scan is normals only and
     the surface keeps whatever colour it was given. */
  water: { color: 0x14384f, texture: 'smooth', scan: 'waterSurface', roughness: 0.08, metalness: 0.02 },
  mud: { color: 0xffffff, texture: 'mud', scan: 'dirt', roughness: 0.84, metalness: 0 },
  sand: { color: 0xffffff, texture: 'sand', scan: 'sand', roughness: 0.9, metalness: 0 },
  marble: { color: 0xf2efe9, texture: 'marble', roughness: 0.2, metalness: 0 },
  ice: { color: 0xffffff, texture: 'ice', scan: 'ice', roughness: 0.1, metalness: 0, opacity: 0.72 },
  glass: { color: 0xdfeef5, texture: 'smooth', roughness: 0.05, metalness: 0, opacity: 0.28 },
  /* The cloth scan is a weave without a colour, so the preset has to
     carry one or an untinted use comes out white. Undyed linen. */
  fabric: { color: 0xb9b1a3, texture: 'fabric', scan: 'cloth', roughness: 0.97, metalness: 0, subsurface: 0.2 },
  skin: { color: 0xffffff, texture: 'skin', roughness: 0.6, metalness: 0, subsurface: 0.5 },
  plastic: { color: 0xdddddd, texture: 'plastic', roughness: 0.35, metalness: 0 },
  tile: { color: 0xffffff, texture: 'tile', scan: 'stoneFloor', roughness: 0.4, metalness: 0 },
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
