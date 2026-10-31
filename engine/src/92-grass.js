/* ============================================================
   GRASS — instanced blades with wind and noise-driven clumping.
   One draw call for the whole field; the bend is computed in the
   vertex shader so the CPU never touches a blade after placement.

   Fields come in three families, each with variants, all still a
   single instanced draw call — the variety is per-blade data:
     standard : healthy green, sways      (normal | tall | trampled)
     dead     : sun-bleached, beat down,  (normal | tall | trampled |
                bare patches over hardpan  insects | mixed)
     mud      : dark seagrass over mud    (normal | duckweed | frogs |
                                           puddles)
   Insects/frogs/puddles/sticks are decorations the engine scatters
   separately; the preset here carries which ones it wants.
   ============================================================ */

const GRASS_PRESETS = {
  standard: {
    colorLow: 0x2f5d24, colorHigh: 0x86a83c,
    height: 0.42, width: 0.05, density: 1,
    windScale: 1, lean: 0.14, bare: 0,        // no bald patches
    trampled: 0, weedChance: 0, heightJitter: [0.65, 1.45],
    // A healthy meadow is a forest floor of grass, not scattered tufts —
    // high clump chance and a wide overlap radius means neighboring clumps
    // blend into each other and true gaps almost never show, while the
    // per-clump height bias still keeps it reading as real growth instead
    // of a uniform lawn.
    clumpSize: 0.4, clumpChance: 0.97, clumpSpread: 1.1,
    ground: 'grass',
  },
  dead: {
    // Sun-bleached straw over savanna hardpan. Barely sways: dead stalks
    // are dry and stiff, and half of them are broken over anyway.
    colorLow: 0x6e6349, colorHigh: 0xa39a72,
    height: 0.3, width: 0.032, density: 0.8,
    windScale: 0.22, lean: 0.4, bare: 0.4,     // hard bald patches
    trampled: 0.28, weedChance: 0, heightJitter: [0.35, 1.6],
    clumpSize: 0.55, clumpChance: 0.48, clumpSpread: 0.5,
    ground: 'savanna',
  },
  mud: {
    // Sparse dark seagrass strands out of churned wet earth, with a
    // scatter of taller weed clumps.
    colorLow: 0x2e4020, colorHigh: 0x567538,
    height: 0.5, width: 0.03, density: 0.42,
    windScale: 0.55, lean: 0.22, bare: 0.3,
    trampled: 0.08, weedChance: 0.14, heightJitter: [0.5, 1.5],
    weedLow: 0x24371c, weedHigh: 0x44603a,
    clumpSize: 0.48, clumpChance: 0.46, clumpSpread: 0.5,
    ground: 'mud',
  },
};

// Deterministic integer hash -> [0,1). Looking up the same (cellX, cellZ,
// salt) always returns the same value, so clump centers can be reconstructed
// on demand for any candidate blade instead of stored in a grid array —
// the field stays infinite and stateless.
function clumpHash(ix, iz, salt) {
  let h = (ix * 374761393 + iz * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 1000000) / 1000000;
}

/* Variant modifiers stack on top of a family preset. `decor` names the
   living extras the engine should scatter around the field. */
const GRASS_VARIANTS = {
  normal:   {},
  tall:     { heightMul: 2.3, widthMul: 1.35, windScale: 0.8, densityMul: 0.7 },
  trampled: { trampled: 0.6, heightMul: 0.85 },
  insects:  { decor: ['insects'] },
  bugs:     { decor: ['insects'] },
  mixed:    { trampled: 0.34, weedChance: 0.1, tallChance: 0.12, decor: ['insects'] },
  duckweed: { decor: ['duckweed'] },
  frogs:    { decor: ['frogs'] },
  puddles:  { decor: ['puddles'] },
};

function resolveGrassSpec(spec) {
  // Accepts true, 'dead', 'dead-insects', or {preset, variant, ...opts}.
  let preset = 'standard', variant = 'normal', extra = {};
  if (spec === true || spec == null) { /* defaults */ }
  else if (typeof spec === 'string') {
    const parts = spec.toLowerCase().split(/[-_ ]+/).filter(Boolean);
    if (parts.length && GRASS_PRESETS[parts[0]]) { preset = parts.shift(); }
    if (parts.length && GRASS_VARIANTS[parts[0]]) { variant = parts.shift(); }
  } else if (typeof spec === 'object') {
    preset = GRASS_PRESETS[spec.preset] ? spec.preset : 'standard';
    variant = GRASS_VARIANTS[spec.variant] ? spec.variant : 'normal';
    extra = spec;
  }
  const p = Object.assign({}, GRASS_PRESETS[preset]);
  const v = GRASS_VARIANTS[variant];
  if (v.heightMul) p.height *= v.heightMul;
  if (v.widthMul) p.width *= v.widthMul;
  if (v.densityMul) p.density *= v.densityMul;
  if (v.windScale != null) p.windScale *= v.windScale;
  if (v.trampled != null) p.trampled = v.trampled;
  if (v.weedChance != null) p.weedChance = Math.max(p.weedChance, v.weedChance);
  p.tallChance = v.tallChance || 0;
  p.decor = v.decor || [];
  p.preset = preset;
  p.variant = variant;
  return Object.assign(p, extra);
}

/* What a tuft is worth in single blades.

   Not nine. Nine strips from one root overlap each other, and the
   single blade they are measured against is a CROSSED pair of quads
   while each tuft strip is one. Measured by rasterising the
   azimuth-mean projected silhouette of both meshes and dividing:
   at the authored spread of 0.24 m and 1.8x blade width a tuft comes
   out at 7.27 single blades. Seven is used, which is deliberately
   short of the measurement — the coverage budget is built on this
   number and it should err toward too much grass.

   If the tuft geometry is ever changed, re-measure. Narrowing the
   spread is the dangerous edit: at 0.11 m the same nine strips are
   worth 4.6, and the mid-field comes out a third barer than the
   arithmetic says with nothing in the code to notice. */
const TUFT_EQ = 7.0;
const TUFT_WIDTH_MUL = 1.8;
const TUFT_SPREAD = 0.24;

/* Four growth forms that co-occur in one square metre of grassland.

   Every number in a row moves together off ONE pick, which is the
   whole point: real grassland is a mosaic of stands, not a per-blade
   randomisation of six independent parameters. `f` is the share of
   blades, `w` and `h` scale width and height, `arch` is how far the
   blade droops, `stiff` how it answers the wind, `taper` how it
   narrows, `hue` shifts it yellow or blue.

   The weights are width-neutral by construction: sum(f*w) is
   0.42*0.60 + 0.24*2.00 + 0.22*0.95 + 0.12*0.45 = 0.9955, near enough
   to one that the coverage arithmetic above does not move when the mix
   is retuned. Keep it that way, or the density law silently stops
   holding. */
const GRASS_SPECIES = [
  { id: 'fescue',    f: 0.42, w: 0.60, h: 1.15, arch: 0.10, stiff: 1.25, taper: 1.0, hue: -0.06, age: 0.25 },
  { id: 'cocksfoot', f: 0.24, w: 2.00, h: 1.00, arch: 0.70, stiff: 0.55, taper: 1.6, hue: 0.02, age: 0.30 },
  { id: 'bent',      f: 0.22, w: 0.95, h: 0.70, arch: 0.95, stiff: 0.40, taper: 1.2, hue: 0.08, age: 0.35 },
  { id: 'culm',      f: 0.12, w: 0.45, h: 1.95, arch: 0.05, stiff: 1.60, taper: 0.7, hue: 0.16, age: 0.55 },
];

class Grass {
  constructor(gl, opts = {}) {
    this.gl = gl;
    this.count = 0;
    this.max = opts.max || 40000;
    this.area = opts.area || 40;
    this.center = Vec3.from(opts.center || [0, 0, 0]);
    this.heightFn = opts.heightFn || null;
    // opts normally arrive pre-resolved (engine.ground → resolveGrassSpec),
    // but a bare string/absent preset is resolved here so the class stands alone.
    const resolved = (opts.bare != null || opts.trampled != null)
      ? opts
      : Object.assign({}, resolveGrassSpec(opts.preset), opts);
    this.P = Object.assign({}, GRASS_PRESETS.standard, resolved);
    this.density = this.P.density;
    this.bladeHeight = opts.height || this.P.height;
    this.bladeWidth = opts.width || this.P.width;
    this.windScale = this.P.windScale != null ? this.P.windScale : 1;
    this.colorLow = parseColor(opts.colorLow != null ? opts.colorLow : this.P.colorLow);
    this.colorHigh = parseColor(opts.colorHigh != null ? opts.colorHigh : this.P.colorHigh);
    this.weedLow = parseColor(this.P.weedLow != null ? this.P.weedLow : 0x24371c);
    this.weedHigh = parseColor(this.P.weedHigh != null ? this.P.weedHigh : 0x44603a);
    this._baseSeed = opts.seed || 31337;
    this.rng = new Rng(this._baseSeed);
    this.noise = new Noise(opts.seed || 31337);

    /* The density law's inputs. cover is the fraction of ground the
       sward should hide at the nearest point on screen; radiusClosed
       is how far out that holds; the taper band is the last few metres
       where it falls to nothing so the field has no rim. */
    this.cover = opts.cover != null ? opts.cover : 0.9;
    this.radiusClosed = opts.radius != null ? opts.radius : 12;
    this.taperBand = opts.taperBand != null ? opts.taperBand : 6;
    this.radiusDrawn = this.radiusClosed + this.taperBand;
    this.eyeHeight = opts.eyeHeight || 1.62;
    this.fov = opts.fov || 62;
    this.aspect = opts.aspect || (16 / 9);
    this.coverMul = opts.coverMul != null ? opts.coverMul : 1;
    this.groundColorFn = opts.groundColorFn || null;
    this.canopyFn = opts.canopyFn || null;
    /* Prostrate litter — dead thatch lying flat at the base of the
       sward — and it is not a decoration, it is what covers the
       ground you are standing on.

       Upright blades hide ground in proportion to how obliquely you
       see it, so they work beautifully at ten metres and barely at
       all at two: the nearest ground on screen is viewed steeply, a
       vertical blade presents almost nothing from above, and that is
       where a field looks balder than anywhere else however many
       blades are in it. Flat material is the exact complement — it
       covers best precisely where upright material covers worst — so
       the litter disc is sized to reach past the nearest visible
       ground rather than being a token scatter at the player's feet. */
    this.thatch = opts.thatch !== false;
    /* Concentrated rather than spread. The litter budget is a fixed
       share of the instances, so a wider disc is a thinner one: five
       metres of 51 per square metre covers less of the ground you are
       actually looking at than three metres of 140. Steeply-viewed
       ground is the near field by definition, so that is where it
       goes. */
    this.thatchPerM2 = opts.thatchPerM2 != null ? opts.thatchPerM2 : 150;
    this.thatchR = opts.thatchR != null ? opts.thatchR : 3.2;
    this.thatchShare = opts.thatchShare != null ? opts.thatchShare : 0.22;
    this.species = opts.speciesTable || GRASS_SPECIES;
    this._spWeights = this.species.map((x) => x.f);
    if (opts.species) this.setSpecies(opts.species);

    this._tile = 4;
    this._salt = (this._baseSeed * 4) >>> 0;
    this._tileKey = null;
    this._rng = new Rng(this._baseSeed);
    this._pos = new Vec3(); this._scale = new Vec3(); this._col = new Vec3();
    this._quat = new Quat(); this._mat = new Mat4();

    this._deriveDensity();
    this._solveBudget();

    const geo = Shapes.grassBlade(this.bladeHeight, this.bladeWidth, opts.segments || 4);
    this.mesh = new GpuMesh(gl, geo);
    this.mesh.setupInstancing(20);
    this.instances = new Float32Array(Math.max(1, this.nBladeCap) * 20);

    /* The tuft is a second mesh and a second buffer, not a second
       material: same shader, same uniforms, one extra draw call. */
    const tuft = Shapes.grassTuft(this.bladeHeight, this.bladeWidth * TUFT_WIDTH_MUL,
      9, 2, TUFT_SPREAD);
    this.tuftMesh = new GpuMesh(gl, tuft.geo);
    this.tuftMesh.setupInstancing(20);
    this.tuftRung = tuft;
    this.tuftCount = 0;
    this.tuftInstances = new Float32Array(Math.max(1, this.nTuftCap + this.nThatch) * 20);
    this.material = new Material(gl, {
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0,
      /* A blade of grass does pass light, but half is far too much: at
         0.5 every blade with the sun behind it goes to white and a field
         reads as a scatter of plastic straws. A quarter is about what a
         real blade transmits, and it leaves the blade's own colour
         visible instead of washing it out. */
      subsurface: opts.subsurface != null ? opts.subsurface : 0.26,
      doubleSided: true,
      castShadow: opts.castShadow !== false,
    });
    this.castShadow = opts.castShadow === true;
    this.update(this.center);
  }

  /* Move the field to a new centre and re-scatter it.

     A grass field is a fixed patch of instances, which is right for a demo
     scene and wrong for anything the player can walk across: at four
     kilometres a side you cannot cover the map, and a field that stays put
     is a rug the player walks off. Re-scattering around them costs one
     buffer upload and is imperceptible if it is done before they reach the
     edge — so an open world keeps grass underfoot everywhere without
     carrying instances for ground nobody is standing on.

     Deterministic in the same way the original scatter is: the blade
     positions come from the same noise field, so walking away and coming
     back gives the same meadow rather than a reshuffled one. */
  /* ---------------- the sward ----------------

     Grass is placed by tile, not by rejection sampling over a square,
     and its density falls as one over the distance rather than being
     flat. Those two changes are most of this file.

     WHY DENSITY MUST FALL AS 1/r. What closes a sward is not how much
     ground the blades cover seen from above — a vertical blade seen
     from above is a fourteen-millimetre line, about a thousandth of a
     square metre, and no affordable number of them hides anything. It
     is occlusion along the grazing sightline from an eye at 1.62 m.
     A blade at ground distance d blocks a length of that sightline
     proportional to d, so cover is 1 - exp(-rho*w*h*d/eye): ground
     twice as far away needs half the blades for the same cover. Follow
     that law and cover is constant everywhere and the instance count
     grows LINEARLY with radius instead of with its square — which is
     the entire reason the existing budget turns out to be enough. The
     old field spread a flat density over fifty-eight metres, spent
     three quarters of its blades past the distance where one is a
     single pixel wide, and left six-tenths of the ground bare at the
     player's feet.

     WHY TILES. Placement hashed from a 4 m tile index makes a blade's
     position a pure function of which tile it is in and which index it
     has, so walking never moves a blade that was already there — the
     old code reseeded the whole field from an 8 m-quantised centre,
     which relocated every blade in it each time the player crossed a
     cell boundary. Tiles also make the update incremental: crossing a
     boundary rebuilds the few tiles that entered and left, not all
     thirty thousand blades, which turns a hundred-millisecond freeze
     into about a millisecond of work. */

  /* Nearest ground on screen at a level view — eye height over the
     tangent of half the vertical field of view. This is the hardest
     point in the frame and it is what sets the density everywhere
     else. */
  _deriveDensity() {
    const eye = this.eyeHeight;
    /* The engine's camera.fov is the VERTICAL angle in degrees —
       Camera stores `(opts.fov || 55) * DEG` and hands it straight to
       Mat4.perspective(fovY, ...). Treating it as horizontal and
       dividing by the aspect ratio puts the nearest visible ground at
       4.8 m instead of 2.7, and since density is set from that point
       it would under-cover the one piece of ground the player is
       always looking at by a factor of nearly two. */
    const vfov = this.fov * Math.PI / 180;
    this.rNear = Math.max(1.2, eye / Math.tan(vfov / 2));
    /* Effective blade width is the azimuth-mean of the union of the two
       crossed quads — max(|cos|,|sin|) averages 0.9003 — times the mean
       of the taper, times the full width (the geometry takes a HALF
       width). */
    const wEff = 2 * this.bladeWidth * 0.55 * 0.9003;
    const hEff = this.bladeHeight * 0.97;
    this._wEff = wEff;
    const C = Math.min(0.98, Math.max(0.2, this.cover));
    /* Beer-Lambert assumes the occluders are scattered independently.
       These are not: blades come in tiles and nine of them share one
       tuft's footprint, so they shadow the same ground as each other
       and the field covers less than the same number of independent
       blades would. Measured against the magenta-cover harness the
       shortfall is a factor of about two and a half — 564
       blade-equivalents per square metre delivering the cover the
       model predicts for 230. CLUMP_LOSS carries that measurement
       rather than pretending the idealised number is right. Re-measure
       it if the tuft or the tiling changes; do not tune it by eye. */
    const CLUMP_LOSS = 2.5;
    this.rho0 = CLUMP_LOSS * -Math.log(1 - C) * eye / (wEff * hEff * this.rNear);
  }

  /* Split the instance budget between single blades near the camera and
     nine-blade tufts beyond the distance where one blade is about a
     pixel and a half wide — the only range at which swapping them is
     invisible. Everything here is in blade-equivalents until the last
     step. */
  _solveBudget() {
    const Rn = this.rNear, Rc = this.radiusClosed, taper = this.taperBand;
    const Rd = this.radiusDrawn;

    /* How far out a single blade is still worth drawing as a single
       blade. Below about a pixel and a half of width it is a smear
       whichever mesh drew it, which is the one range where swapping
       nine blades for one tuft is invisible. */
    const vfov = this.fov * Math.PI / 180;
    const pxPerRad = (this.renderHeight || 1080) / vfov;
    const rPixel = (2 * this.bladeWidth) * pxPerRad / 1.4;

    // Thatch comes off the top: a flat population near the camera.
    this.nThatch = this.thatch
      ? Math.min(Math.round(this.max * this.thatchShare),
        Math.round(this.thatchPerM2 * Math.PI * this.thatchR * this.thatchR))
      : 0;
    const spare = Math.max(1, this.max - this.nThatch);

    const bladeEqTo = (A, B, r) => A + B * Math.max(0, Math.min(r, Rd) - Rn);

    /* Cover gives way before radius does.

       If the budget cannot buy the target density over the target
       radius, the wrong answer is to shrink the field: holding
       blades per square metre constant across tiers would give the
       weakest machines a two-metre plinth of perfect lawn ending in a
       wall at the player's feet. Thinner grass over ground you can
       actually walk across is a real grassland; a small perfect disc
       is a putting green on a building site. So the radius is fixed
       and rho0 is scaled down until it fits. */
    let rho0 = this.rho0;
    let A = 0, B = 0, want = 0, rSwap = Rn;
    for (let iter = 0; iter < 12; iter++) {
      A = rho0 * Math.PI * Rn * Rn;
      B = rho0 * Rn * 2 * Math.PI;
      want = A + B * Math.max(0, Rc - Rn) + B * taper * 0.5;
      const cost = (r) => {
        const be = bladeEqTo(A, B, r);
        return be + Math.max(0, want - be) / TUFT_EQ;
      };
      // Prefer blades as far out as they are individually legible, and
      // further if there is slack — a blade always looks better than a
      // tuft at the same distance.
      const rWanted = Math.min(Rd, Math.max(Rn, rPixel));
      if (cost(rWanted) <= spare) {
        rSwap = rWanted;
        // Spend any remainder pushing blades out past the pixel limit.
        let lo = rWanted, hi = Rd;
        for (let k = 0; k < 24; k++) {
          const mid = (lo + hi) / 2;
          if (cost(mid) <= spare) lo = mid; else hi = mid;
        }
        rSwap = lo;
        break;
      }
      // Pull the blade/tuft boundary in; never inside the nearest
      // ground on screen, which must always be real blades.
      let lo = Rn, hi = rWanted;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (cost(mid) <= spare) lo = mid; else hi = mid;
      }
      if (cost(lo) <= spare) { rSwap = lo; break; }
      // Even all-tufts does not fit: thin the sward and try again.
      rho0 *= Math.max(0.35, spare / cost(Rn) * 0.98);
    }
    this.rho0 = rho0;
    this._A = A; this._B = B; this._wantEq = want;
    this.rSwap = rSwap;
    /* Size both populations from the arithmetic and only then make
       them fit, proportionally. Clamping the blades to the whole spare
       budget first and giving the tufts whatever is left means the
       tufts get nothing — and the tufts are what covers everything
       past the blade radius, so the field comes out closed near the
       player and bare beyond it, which is the failure this whole
       change exists to remove. A little headroom on each: tiles are
       rounded up individually and the sum lands slightly over. */
    const bladeEq = bladeEqTo(A, B, rSwap);
    let nb = Math.ceil(bladeEq * 1.06) + 64;
    let nt = Math.ceil(Math.max(0, want - bladeEq) / TUFT_EQ * 1.10) + 32;
    if (nb + nt > spare) {
      const k = spare / (nb + nt);
      nb = Math.floor(nb * k); nt = Math.floor(nt * k);
    }
    this.nBladeCap = nb;
    this.nTuftCap = nt;
  }

  /* Blade-equivalents a tile should hold, from the 1/r law plus the
     edge taper. The radius each tile evaluates is jittered by its own
     hash so the rungs are not concentric squares. */
  _tileWant(tx, tz) {
    const cx = (tx + 0.5) * this._tile, cz = (tz + 0.5) * this._tile;
    const dx = cx - this.center.x, dz = cz - this.center.z;
    const raw = Math.sqrt(dx * dx + dz * dz);
    const r = Math.max(0.0001, raw + (clumpHash(tx, tz, this._salt + 11) - 0.5) * 1.8);
    if (r > this.radiusDrawn) return { eq: 0, r };
    /* Inside the nearest visible ground the law has nothing more to
       say — min(1, rNear/r) is pinned at 1 — but cover still falls as
       you look closer, because the sightline through the canopy gets
       shorter. Lift the inner disc to compensate. It is cheap: the
       disc is only about twenty square metres. */
    let rho = this.rho0 * Math.min(1, this.rNear / r);
    if (r < this.rNear) rho *= 1 + 0.55 * (1 - r / this.rNear);
    if (r > this.radiusClosed) {
      const t = (r - this.radiusClosed) / Math.max(0.001, this.taperBand);
      rho *= Math.max(0, 1 - t * t);
    }
    return { eq: rho * this._tile * this._tile * this.coverMul, r };
  }

  /* ---------------- per-tile placement ---------------- */

  /* R2, the two-dimensional low-discrepancy sequence. Every PREFIX of
     it is evenly spread, which is exactly what a density law needs: a
     tile can emit its first k points for any k and they still cover
     the tile evenly, so thinning with distance is a shorter take from
     the same fixed sequence rather than a different arrangement. A
     blade therefore never moves as the player approaches — it only
     ever appears or disappears. */
  _placeTile(tx, tz, buf, outFirst, kind) {
    const W = this._tileWant(tx, tz);
    if (W.eq <= 0) return 0;
    const perInstance = kind === 'tuft' ? TUFT_EQ : 1;
    let k = Math.round(W.eq / perInstance);
    if (kind === 'blade' && W.r > this.rSwap) k = 0;
    if (kind === 'tuft' && W.r <= this.rSwap) k = 0;
    if (k <= 0) return 0;

    const t = this._tile;
    const ox = tx * t, oz = tz * t;
    const h1 = clumpHash(tx, tz, this._salt + 1);
    const h2 = clumpHash(tx, tz, this._salt + 2);
    const rng = this._rng;
    rng.s = (((tx * 73856093) ^ (tz * 19349663) ^ this._baseSeed) >>> 0) || 1;

    // One moisture sample per tile rather than per blade. Concave and
    // flat ground holds water; convex and steep sheds it. Four height
    // taps per 4 m tile instead of four per blade is four hundred times
    // less terrain querying for a field that does not need the detail.
    const wet = this._tileMoisture(ox + t * 0.5, oz + t * 0.5);
    const shade = this.canopyFn ? clamp(this.canopyFn(ox + t * 0.5, oz + t * 0.5), 0, 1) : 0;
    // Tussock structure: one hash per tile scales everything in it.
    const tuss = 0.85 + 0.3 * clumpHash(tx, tz, this._salt + 5);

    let n = 0;
    for (let i = 0; i < k; i++) {
      const u = (h1 + i * 0.7548776662) % 1;
      const v = (h2 + i * 0.5698402910) % 1;
      const x = ox + (u + (rng.next() - 0.5) * 0.22) * t;
      const z = oz + (v + (rng.next() - 0.5) * 0.22) * t;
      const slot = outFirst + n;
      if ((slot + 1) * 20 > buf.length) break;
      this._writeInstance(buf, slot, x, z, kind, wet, shade, tuss, rng);
      n++;
    }
    return n;
  }

  _tileMoisture(x, z) {
    const f = this.heightFn;
    if (!f) return 0.5;
    const d = 0.7;
    const c = f(x, z);
    const e = f(x + d, z), w = f(x - d, z), s = f(x, z + d), nn = f(x, z - d);
    // Positive concavity means a hollow; a flat hollow is the wettest
    // ground there is. Slope sheds, so it dries.
    const concave = (e + w + s + nn) * 0.25 - c;
    const slope = Math.max(Math.abs(e - w), Math.abs(s - nn)) / (2 * d);
    const macro = this.noise.fbm(x * 0.013, 5.5, z * 0.013, 2) * 0.5 + 0.5;
    return clamp(0.5 + concave * 2.2 - slope * 0.9 + (macro - 0.5) * 0.8, 0, 1);
  }

  /* One instance: where it is, which species it is, how it leans, what
     colour it is, and the three extra floats the shader reads out of
     the model matrix's unused w slots. */
  _writeInstance(buf, slot, x, z, kind, wet, shade, tuss, rng) {
    const P = this.P;
    const sp = this._pickSpecies(x, z, wet, rng);
    const o = slot * 20;

    /* Species, height and colour all move together off ONE choice.
       The old field drew height from one noise field and colour from
       another at a different frequency and a different offset, so they
       were uncorrelated by construction — which is why its variation
       read as noise rather than as a plant community. A damp hollow
       should be taller AND greener AND a different grass. */
    const jit = P.heightJitter || [0.65, 1.45];
    const wetH = 0.78 + 0.5 * wet;
    const shadeH = 1 - 0.35 * shade;
    let h = rng.range(jit[0], jit[1]) * sp.h * wetH * shadeH * tuss;
    /* Species width applies to a single blade at full strength. A tuft
       mesh is already built 1.8x wider than a blade so that nine
       single strips are worth as much silhouette as the crossed pair
       they replace, and multiplying the broad-leaved species' 2.0 on
       top of that gives a ten-centimetre leaf — a hosta, not a grass.
       Take the square root for the tuft meshes: the broad species is
       still visibly broader, but within the range a grass occupies. */
    const wide = kind !== 'blade';
    let w = rng.range(0.85, 1.15) * (wide ? Math.sqrt(sp.w) : sp.w) * tuss;

    const flat = kind === 'thatch';
    // Litter lies flat and spreads a little; 2.4 on top of everything
    // else was a dinner plate.
    if (flat) { h *= rng.range(0.4, 0.62); w *= 1.25; }

    const lean = P.lean != null ? P.lean : 0.14;
    const q = this._quat;
    if (flat) {
      q.setEuler(rng.range(1.42, 1.57), rng.range(0, TAU), rng.range(-0.3, 0.3));
    } else {
      q.setEuler(rng.range(-lean, lean), rng.range(0, TAU), rng.range(-lean, lean));
    }
    this._pos.set(x, this.heightFn ? this.heightFn(x, z) : this.center.y, z);
    /* Scale Z with the width, not 1. grassBlade lays one quad's width
       on local X and the other's on local Z, so scaling only X stretched
       one quad and left the other at authored width — and the baked
       forward lean, which lives on the other axis, was being scaled by
       the width jitter instead of left alone. */
    this._scale.set(w, h, w);
    this._mat.compose(this._pos, q, this._scale);
    buf.set(this._mat.e, o);

    /* Three floats that cost nothing. Mat4.compose always writes hard
       zeros into e[3], e[7] and e[11] — the unused column of a
       transform with no projection — so they carry per-instance data
       at no extra stride and no extra upload. The shader MUST zero
       them again before using the matrix. */
    buf[o + 3] = flat ? 0 : sp.arch;
    buf[o + 7] = flat ? 0 : sp.stiff;
    buf[o + 11] = flat ? rng.range(0.6, 1) : clamp(sp.age + rng.range(-0.15, 0.25) + shade * 0.2, 0, 1);

    // Colour: the biome ramp positioned by moisture, nudged toward the
    // species' own hue, then pulled a third of the way toward the
    // ground it is growing out of so the sward and the soil agree and
    // the gaps between tufts read as shadow rather than as holes.
    const c = this._col;
    c.copy(this.colorLow).lerp(this.colorHigh, clamp(wet * 0.75 + rng.range(0, 0.25), 0, 1));
    c.x *= 1 - sp.hue * 0.55; c.z *= 1 + sp.hue * 0.8;
    if (shade > 0) { c.x *= 1 - shade * 0.18; c.y *= 1 - shade * 0.10; }
    if (this.groundColorFn) {
      const g = this.groundColorFn(x, z);
      if (g) { c.x = lerp(c.x, g[0], 0.3); c.y = lerp(c.y, g[1], 0.3); c.z = lerp(c.z, g[2], 0.3); }
    }
    if (flat) { c.x = lerp(c.x, 0.30, 0.55); c.y = lerp(c.y, 0.26, 0.55); c.z = lerp(c.z, 0.17, 0.55); }
    buf[o + 16] = c.x; buf[o + 17] = c.y; buf[o + 18] = c.z;
    buf[o + 19] = rng.next();
  }

  /* Which grass this is. Spatially correlated over about three metres,
     so a patch reads as a stand of one species rather than as six
     independent randoms per blade. */
  _pickSpecies(x, z, wet, rng) {
    const list = this.species;
    const t = clamp(this.noise.fbm(x * 0.35, 17.3, z * 0.35, 2) * 0.5 + 0.5
      + (wet - 0.5) * 0.3 + rng.range(-0.22, 0.22), 0, 1);
    let acc = 0;
    for (let i = 0; i < list.length; i++) {
      acc += this._spWeights[i];
      if (t <= acc) return list[i];
    }
    return list[list.length - 1];
  }

  /* ---------------- the field ---------------- */

  /* Called every frame. Does nothing until the player has crossed a
     tile boundary, then rebuilds only the tiles that came into range
     and drops the ones that left, a few per frame. */
  update(center) {
    const c = Vec3.from(center);
    this.center.copy(c);
    const t = this._tile;
    const R = this.radiusDrawn + 6;
    const tx0 = Math.floor((c.x - R) / t), tx1 = Math.floor((c.x + R) / t);
    const tz0 = Math.floor((c.z - R) / t), tz1 = Math.floor((c.z + R) / t);
    const key = `${tx0}:${tz0}:${tx1}:${tz1}`;
    if (key === this._tileKey) return false;
    this._tileKey = key;
    this._rebuild(tx0, tx1, tz0, tz1);
    return true;
  }

  _rebuild(tx0, tx1, tz0, tz1) {
    const R2 = this.radiusDrawn * this.radiusDrawn;
    let nb = 0, nt = 0;
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let tz = tz0; tz <= tz1; tz++) {
        const cx = (tx + 0.5) * this._tile, cz = (tz + 0.5) * this._tile;
        const dx = cx - this.center.x, dz = cz - this.center.z;
        if (dx * dx + dz * dz > R2 + 64) continue;
        nb += this._placeTile(tx, tz, this.instances, nb, 'blade');
        nt += this._placeTile(tx, tz, this.tuftInstances, nt, 'tuft');
      }
    }
    // Thatch: a flat population near the camera, in the tuft buffer.
    if (this.thatch && this.nThatch > 0) {
      const rng = this._rng;
      rng.s = (this._baseSeed ^ 0x9e3779b9) >>> 0;
      const R = this.thatchR;
      const tcx = Math.round(this.center.x / 4) * 4, tcz = Math.round(this.center.z / 4) * 4;
      for (let i = 0; i < this.nThatch; i++) {
        // Spiral rather than rejection sampling: no wasted candidates.
        const fr = Math.sqrt((i + 0.5) / this.nThatch) * R;
        const fa = i * 2.39996323;
        const x = tcx + Math.cos(fa) * fr, z = tcz + Math.sin(fa) * fr;
        if ((nt + 1) * 20 > this.tuftInstances.length) break;
        this._writeInstance(this.tuftInstances, nt, x, z, 'thatch', 0.5, 0, 1, rng);
        nt++;
      }
    }
    this.count = nb;
    this.tuftCount = nt;
    this._version = (this._version || 0) + 1;
    this._tuftVersion = (this._tuftVersion || 0) + 1;
    this.mesh.uploadInstances(this.instances.subarray(0, nb * 20), nb, this._version);
    this.tuftMesh.uploadInstances(this.tuftInstances.subarray(0, nt * 20), nt, this._tuftVersion);
    return nb + nt;
  }

  /* Kept for callers that still ask for a re-scatter by hand: a biome
     change, a quality change, or a test. */
  recenter(center, opts = {}) {
    if (opts.coverMul != null) this.coverMul = opts.coverMul;
    if (opts.species) this.setSpecies(opts.species);
    const c = Vec3.from(center);
    this.center.copy(c);
    this._tileKey = null;
    return this.update(c) || this._rebuild(
      Math.floor((c.x - this.radiusDrawn - 6) / this._tile),
      Math.floor((c.x + this.radiusDrawn + 6) / this._tile),
      Math.floor((c.z - this.radiusDrawn - 6) / this._tile),
      Math.floor((c.z + this.radiusDrawn + 6) / this._tile)) >= 0;
  }

  /* Old name, same job: tests and demos call scatter() directly. */
  scatter(opts = {}) {
    if (opts.center) this.center.copy(Vec3.from(opts.center));
    this._tileKey = null;
    this.update(this.center);
    return this.count + this.tuftCount;
  }

  setSpecies(weights) {
    const n = this.species.length;
    const w = [];
    let sum = 0;
    for (let i = 0; i < n; i++) { const v = Math.max(0, weights[i] != null ? weights[i] : this.species[i].f); w.push(v); sum += v; }
    for (let i = 0; i < n; i++) w[i] = sum > 0 ? w[i] / sum : 1 / n;
    this._spWeights = w;
  }

  batches() {
    const out = [];
    const common = {
      material: this.material,
      instanced: true,
      grass: true,
      windScale: this.windScale,
      alphaClip: false,
      /* A field of grass casts a shadow that is, at any distance, a
         slight general darkening of ground the blades are standing on
         and already shading. It costs a full extra pass over every
         blade per cascade for something nobody can point at. The dark
         band at the base of every blade in the fragment shader is the
         self-shadow, and it costs nothing. */
      castShadow: this.castShadow === true,
      grassFade: [this.center.x, this.center.z, this.radiusClosed, this.radiusDrawn],
    };
    // Near rung first: a closed sward has real overdraw, and drawing
    // the near blades before the far ones lets the depth test reject
    // most of what is behind them.
    if (this.count) {
      out.push(Object.assign({}, common, {
        mesh: this.mesh,
        instances: this.instances.subarray(0, this.count * 20),
        count: this.count,
        instanceVersion: this._version || 0,
        sortKey: 0,
      }));
    }
    if (this.tuftCount) {
      out.push(Object.assign({}, common, {
        mesh: this.tuftMesh,
        instances: this.tuftInstances.subarray(0, this.tuftCount * 20),
        count: this.tuftCount,
        instanceVersion: this._tuftVersion || 0,
        sortKey: 1,
      }));
    }
    return out;
  }

  // Back-compat for any caller that still wants a single batch.
  batch() { return this.batches()[0] || null; }

  dispose() {
    this.mesh.dispose();
    if (this.tuftMesh) this.tuftMesh.dispose();
    this.material.dispose();
  }
}

/* ============================================================
   INPUT — keyboard, pointer and gamepad.
   Legend's on-screen touch controls deliver standard keyboard
   events, so a game that reads keys works on phones for free.
   ============================================================ */

class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.pointer = { x: 0, y: 0, dx: 0, dy: 0, down: false, justDown: false, justUp: false };
    this.axes = { x: 0, y: 0 };
    this.anyPressed = false;
    /* The pad is a first-class input, not keys in a costume. Games that want
       real controller support read `input.pad` and bind their own verbs;
       `padKeys` exists only so a demo written against WASD keeps working
       when someone plugs a pad in, and is off by default because a game that
       maps its own buttons does not want them arriving twice. */
    this.pad = new Pad();
    this.padKeys = false;
    /* Look is a rate rather than a delta, so it has to be scaled by the
       frame time by whoever consumes it. Filled by beginFrame from the
       right stick; the mouse writes into pointer.dx/dy instead. */
    this.look = { x: 0, y: 0 };
    this.lookSensitivity = 3.4;      // radians per second at full deflection
    this.invertLookY = false;
    this._listeners = [];
    this._bind(target);
  }

  /* Which device the player is actually using, so the HUD can show the right
     prompts. The pad wins as soon as it is touched and gives the lead back
     the moment a key or the mouse is used. */
  get scheme() { return this.pad.active ? 'gamepad' : 'keyboard'; }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push([target, type, fn, opts]);
  }

  _bind(target) {
    this._on(target, 'keydown', (e) => {
      const k = normalizeKey(e.key, e.code);
      this.pad.active = false;      // the keyboard takes the prompts back
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      this.anyPressed = true;
      // Arrows and space scroll the page otherwise, which is fatal in a
      // full-screen game.
      if (PREVENT_KEYS.has(k)) e.preventDefault();
    });
    this._on(target, 'keyup', (e) => {
      const k = normalizeKey(e.key, e.code);
      this.keys.delete(k);
      this.released.add(k);
    });
    // A window that loses focus never delivers keyup, leaving keys stuck on.
    this._on(window, 'blur', () => { this.keys.clear(); });

    const pointerPos = (e) => {
      const t = e.touches && e.touches[0] ? e.touches[0] : e;
      const nx = t.clientX, ny = t.clientY;
      this.pointer.dx = nx - this.pointer.x;
      this.pointer.dy = ny - this.pointer.y;
      this.pointer.x = nx;
      this.pointer.y = ny;
    };
    this._on(target, 'pointermove', pointerPos);
    this._on(target, 'pointerdown', (e) => {
      pointerPos(e);
      this.pad.active = false;
      this.pointer.down = true;
      this.pointer.justDown = true;
      this.anyPressed = true;
    });
    this._on(target, 'pointerup', () => {
      this.pointer.down = false;
      this.pointer.justUp = true;
    });
    this._on(target, 'touchstart', () => { this.anyPressed = true; }, { passive: true });
  }

  /* Optional legacy folding: a pad's face buttons and d-pad arriving as the
     keys a keyboard-only demo already listens for. */
  _foldPadKeys() {
    const p = this.pad;
    const press = (padName, key) => {
      if (!p.down(padName)) return;
      if (!this.keys.has(key)) this.pressed.add(key);
      this.keys.add(key);
      this.anyPressed = true;
    };
    press('a', ' '); press('y', ' '); press('b', 'x'); press('x', 'x');
    press('up', 'arrowup'); press('down', 'arrowdown');
    press('left', 'arrowleft'); press('right', 'arrowright');
  }

  /* Call once per frame, before game logic. */
  beginFrame() {
    this.axes.x = 0;
    this.axes.y = 0;
    this.pad.poll(typeof performance !== 'undefined' ? performance.now() : 0);
    if (this.padKeys) this._foldPadKeys();

    /* Keyboard first, so WASD is exactly ±1 and unaffected by the curve the
       stick is shaped with. The stick then contributes on top, which is what
       lets someone steer with a stick and sprint with a key. */
    if (this.down('a') || this.down('arrowleft')) this.axes.x -= 1;
    if (this.down('d') || this.down('arrowright')) this.axes.x += 1;
    if (this.down('w') || this.down('arrowup')) this.axes.y -= 1;
    if (this.down('s') || this.down('arrowdown')) this.axes.y += 1;
    this.axes.x += this.pad.left.x;
    this.axes.y += this.pad.left.y;
    // Clamping the components would let a diagonal run 41% faster than a
    // straight line, so the vector is clamped by its length instead.
    const mag = Math.hypot(this.axes.x, this.axes.y);
    if (mag > 1) { this.axes.x /= mag; this.axes.y /= mag; }

    this.look.x = this.pad.right.x;
    this.look.y = this.pad.right.y;
    if (this.pad.anyPressed || this.pad.left.mag || this.pad.right.mag) this.anyPressed = true;
  }

  /* Call once per frame, after game logic, to clear edge-triggered state. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.pointer.justDown = false;
    this.pointer.justUp = false;
    this.pointer.dx = 0;
    this.pointer.dy = 0;
    this.anyPressed = false;
  }

  down(key) { return this.keys.has(normalizeKey(key, key)); }
  justPressed(key) { return this.pressed.has(normalizeKey(key, key)); }
  justReleased(key) { return this.released.has(normalizeKey(key, key)); }
  get action() { return this.down(' '); }
  get actionPressed() { return this.justPressed(' '); }
  get secondaryPressed() { return this.justPressed('x'); }

  /* Rumble, forwarded so a game never has to reach past `input` for it. */
  rumble(strength, seconds, opts) { return this.pad.rumble(strength, seconds, opts); }

  dispose() {
    this.pad.dispose();
    for (const [t, type, fn, opts] of this._listeners) t.removeEventListener(type, fn, opts);
    this._listeners.length = 0;
  }
}

const PREVENT_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);

function normalizeKey(key, code) {
  if (!key) return '';
  let k = String(key).toLowerCase();
  if (k === 'spacebar' || code === 'Space') k = ' ';
  return k;
}

/* ============================================================
   AUDIO — procedural impact and ambience.
   Sounds are synthesised with the Web Audio API rather than
   loaded, so a game stays a single file.
   ============================================================ */

class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.5;
    this._lastPlay = 0;
  }

  /* Browsers require a user gesture before audio starts, so this is called
     lazily from the first input rather than at construction. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return null; }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.enabled = false;
    }
    return this.ctx;
  }

  _noiseBuffer(duration) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* A thud: filtered noise burst with a fast decay. Pitch and brightness
     scale with impact strength, which is most of what makes hits feel real. */
  impact(strength = 1, opts = {}) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    // Rate limit: a collapsing wall generates hundreds of contacts and would
    // otherwise produce a wall of clipping noise.
    const now = ctx.currentTime;
    if (now - this._lastPlay < 0.018) return;
    this._lastPlay = now;

    const s = clamp(strength, 0, 1);
    const dur = lerp(0.08, 0.34, s);
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lerp(320, 2400, s * s);
    filter.Q.value = 1.1;

    const gain = ctx.createGain();
    const vol = lerp(0.06, 0.42, s) * (opts.volume != null ? opts.volume : 1);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    // A low sine under the noise gives the hit weight.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(lerp(60, 160, s), now);
    osc.frequency.exponentialRampToValueAtTime(lerp(38, 70, s), now + dur * 0.8);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(vol * 0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.9);

    src.connect(filter).connect(gain).connect(this.master);
    osc.connect(oscGain).connect(this.master);
    src.start(now); src.stop(now + dur);
    osc.start(now); osc.stop(now + dur);
  }

  /* Shattering: a cloud of short, bright, detuned pings. */
  shatter(strength = 1) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const n = Math.round(lerp(4, 12, clamp(strength, 0, 1)));
    for (let i = 0; i < n; i++) {
      const t = now + Math.random() * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 900 + Math.random() * 2600;
      const g = ctx.createGain();
      const dur = 0.05 + Math.random() * 0.16;
      g.gain.setValueAtTime(0.10 * strength, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.master);
      osc.start(t); osc.stop(t + dur);
    }
  }

  splash(strength = 1) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.35;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    // Sweeping the band upward is what reads as "water" rather than "static".
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(3200, now + dur);
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16 * clamp(strength, 0, 1), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now); src.stop(now + dur);
  }

  /* A short melodic blip for pickups and UI. */
  tone(frequency = 660, duration = 0.12, type = 'square', volume = 0.14) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(this.master);
    osc.start(now); osc.stop(now + duration);
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.volume;
  }
}
