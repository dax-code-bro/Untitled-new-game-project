/* ============================================================
   RENDERER — HDR forward PBR with cascaded shadows, screen-space
   fluid, particles and a filmic post chain.
   ============================================================ */

class Camera {
  constructor(opts = {}) {
    this.position = Vec3.from(opts.position || [0, 4, 10]);
    this.target = Vec3.from(opts.target || [0, 1, 0]);
    this.up = new Vec3(0, 1, 0);
    this.fov = (opts.fov || 55) * DEG;
    this.near = opts.near || 0.1;
    this.far = opts.far || 500;
    this.aspect = 1;
    this.view = new Mat4();
    this.proj = new Mat4();
    this.viewProj = new Mat4();
    this.invViewProj = new Mat4();
    this.invProj = new Mat4();
    this.invView = new Mat4();
    this.forward = new Vec3(0, 0, -1);
    this.right = new Vec3(1, 0, 0);
    this.trueUp = new Vec3(0, 1, 0);
  }

  update(aspect) {
    this.aspect = aspect;
    this.view.lookAt(this.position, this.target, this.up);
    this.proj.perspective(this.fov, aspect, this.near, this.far);
    this.viewProj.mulMatrices(this.proj, this.view);
    this.invViewProj.copy(this.viewProj).invert();
    this.invProj.copy(this.proj).invert();
    this.invView.copy(this.view).invert();
    this.forward.subVectors(this.target, this.position).normalize();
    this.right.crossVectors(this.forward, this.up).normalize();
    this.trueUp.crossVectors(this.right, this.forward).normalize();
    return this;
  }

  /* Frustum planes for culling, extracted from the view-projection.
     Stored as [nx, ny, nz, d] with normals pointing inward. */
  extractPlanes(out) {
    const m = this.viewProj.e;
    const set = (i, a, b, c, d) => {
      const len = Math.sqrt(a * a + b * b + c * c) || 1;
      out[i * 4] = a / len; out[i * 4 + 1] = b / len; out[i * 4 + 2] = c / len; out[i * 4 + 3] = d / len;
    };
    set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);   // left
    set(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);   // right
    set(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);   // bottom
    set(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);   // top
    set(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);  // near
    set(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);  // far
    return out;
  }
}

/* Quality presets. Phones and laptops differ by more than an order of
   magnitude, so the engine picks a tier from the device rather than
   shipping one setting that is wrong for most players. */
/* Five tiers, and each one is meant to be a different thing to look at
   rather than the same picture with the shadow map resized.

     retro    a quarter resolution, upscaled hard with no filtering, the
              colours quantised to a small palette and the frame rate
              pinned at 24. No shadows, no bloom, no antialiasing --
              deliberately a machine from 1996.
     low      simple and fast: no shadows worth the name, no post, two
              thirds resolution. For anything that struggles.
     normal   what the game was built and balanced on.
     high     shadows get soft, ambient occlusion comes in, and the image
              is supersampled slightly and sharpened back.
     ultra    everything, and rendered at nearly twice the display
              resolution before being scaled down -- which is what
              actually buys "every little detail, not blocky".

   `renderScale` above 1 is supersampling: the canvas is allocated bigger
   than its CSS size and the browser resolves it down, which removes
   stair-stepping that no amount of FXAA can. It is also the single most
   expensive number here, which is why it is the one that separates the
   top two tiers. */
/* ---- A KEY IN ONE TIER IS A KEY IN ALL FIVE ----
 *
 * QUALITY.medium is a REFERENCE alias of QUALITY.normal just below the
 * table -- the same object, not a copy -- so adding a key to one adds
 * it to both and mutating either mutates both. Every new setting is
 * written out explicitly in all five tiers rather than left to default,
 * and every read site uses the `|| default` idiom, so a tier table
 * somebody edits by hand cannot silently switch a pass on.
 *
 * gbuffer: a second colour attachment on the scene target carrying the
 * shading normal and roughness. Screen-space reflections and
 * ground-truth ambient occlusion both need it and neither can get it
 * from depth -- a depth-derived normal is the GEOMETRIC normal of the
 * depth surface, blind to every bump the normal map adds, and roughness
 * is not in there at all. Full-resolution RGBA16F is 8 bytes a pixel,
 * so tiers that cannot spend it do not allocate it. It is on at high
 * and ultra; three of browser.test.js's scenes run at high, which is
 * deliberate -- the path wants exercising, and a G-buffer nothing reads
 * yet costs one extra attachment write and no passes. */
const QUALITY = {
  retro: { shadowRes: 512, cascades: 1, bloom: false, bloomIters: 0, fluidScale: 0.35,
    fxaa: false, msaa: 0, maxGrass: 500, renderScale: 0.26, texRes: 128,    env: 0, envRes: 0, envSamples: 0, envDiffuse: 0,
    ssao: 0, ssaoSamples: 0, sharpen: 0, posterize: 9, pixelated: true, fpsCap: 24,
    gbuffer: false },
  /* CONTACT SHADOWS ON THE TIERS PEOPLE ACTUALLY RUN.
   *
     These two said `ssao: 0`, and so the pass below them -- a real
     hemisphere-sampled occlusion pass with a depth-aware separated blur,
     written and wired and folded into the ambient term -- had never run
     on a phone. Not "looked wrong on a phone": never executed. Only
     `high` and `ultra` switched it on, and detectQuality() returns
     `normal` at best for anything mobile, so the one class of hardware
     that most needs cheap fake occlusion was the one class that never
     got any.

     It is three fullscreen draws at half resolution, which is affordable
     here at a smaller sample count. The samples are what costs, so they
     are what is cut: six on low and ten on normal against high's twelve
     and ultra's twenty-six, with a tighter radius so the fewer taps land
     where the contact actually is -- in the crease where a wall meets a
     roof, around a door frame, where the terrain runs into a building. A
     wide radius with six taps is not soft occlusion, it is noise the
     blur then smears. */
  low: { shadowRes: 768, cascades: 1, bloom: false, bloomIters: 0, fluidScale: 0.5,
    fxaa: false, msaa: 0, maxGrass: 2500, renderScale: 0.66,    env: 0, envRes: 0, envSamples: 0, envDiffuse: 0,
    ssao: 0.50, ssaoSamples: 6, ssaoRadius: 0.42, sharpen: 0.10, posterize: 0, texRes: 512,
    gbuffer: false },
  normal: { shadowRes: 1536, cascades: 2, bloom: true, bloomIters: 3, fluidScale: 0.75,
    fxaa: true, msaa: 0, maxGrass: 20000, renderScale: 1,    env: 0, envRes: 64, envSamples: 24, envDiffuse: 0,
    ssao: 0.62, ssaoSamples: 10, ssaoRadius: 0.50, sharpen: 0.16, posterize: 0, texRes: 768,
    gbuffer: false },
  high: { shadowRes: 2560, cascades: 2, bloom: true, bloomIters: 4, fluidScale: 1,
    fxaa: true, msaa: 0, maxGrass: 60000, renderScale: 1.25,    env: 1, envRes: 128, envSamples: 32, envDiffuse: 0,
    ssao: 0.70, ssaoSamples: 12, ssaoRadius: 0.55, sharpen: 0.34, posterize: 0, texRes: 1024,
    gbuffer: true },
  ultra: { shadowRes: 4096, cascades: 2, bloom: true, bloomIters: 5, fluidScale: 1,
    fxaa: true, msaa: 0, maxGrass: 160000, renderScale: 1.85,    env: 1, envRes: 256, envSamples: 64, envDiffuse: 1,
    ssao: 0.95, ssaoSamples: 26, ssaoRadius: 0.70, sharpen: 0.52, posterize: 0, texRes: 1024,
    gbuffer: true },
};
// `medium` is what the old auto-detect asked for and what several callers
// still pass; it is this tier's previous name.
QUALITY.medium = QUALITY.normal;
/* ---- FEATURE 1: SCREEN-SPACE REFLECTIONS, PHASE 1 TIER RAISE ----
 *
 * Patched onto the table rather than written into it, for one reason
 * worth stating: nine features are landing on these five literals in
 * parallel and every one of them that edits the same object lines
 * conflicts with the other eight. A property assignment after the fact
 * composes with all of them and says exactly which key belongs to whom.
 *
 * ULTRA ONLY, and NOT high, even though the G-buffer is allocated at
 * high too. Three of browser.test.js's eight scenes run at 'high'
 * (shadows at line 70, materials at 82, effects at 157), underside.js
 * pins it, and sweep.js raises to it mid-run -- so 'high' is a
 * heavily-asserted tier, and a reflection term is exactly the kind of
 * broad low-frequency brightness that moves a mean-luma assertion.
 * Ultra is reachable only by an explicit setQuality('ultra') or
 * LE.create({quality:'ultra'}); detectQuality() cannot return it and
 * the watchdog only ever steps down. Nothing in the suite runs there
 * except the photoreal test, which is written to expect this.
 *
 * ssrSteps 28: at ultra the trace runs at half of a 1.85x-scaled frame,
 * and the march is capped at 0.8 of the smaller half-res dimension
 * (~800 texels on a 1080p canvas). 800/28 is a 28-texel stride, which
 * five binary-search halvings refine to under one texel -- the point at
 * which a half-resolution buffer has nothing more to give. Fewer steps
 * and the refinement starts from a gap wide enough to have skipped the
 * object entirely; more and it is paying for precision the buffer
 * cannot express.
 *
 * The four lower tiers are pinned to 0 only if nothing has set them, so
 * this is idempotent with whatever the plumbing commit wrote. Note that
 * QUALITY.medium IS QUALITY.normal -- one object, so writing 'normal'
 * writes both, which is what is wanted. */
QUALITY.ultra.ssr = 1;
QUALITY.ultra.ssrSteps = 28;
/* THE PROBE BAKES THE SCENE, NOT JUST THE SKY, and only at ultra.
 *
   The sky probe fixed how roughness READS -- a real GGX prefilter
   instead of a fade to a constant -- but a cube full of sky still has
   no building in it, so a mirror still showed no building. This makes
   the six faces real renders of the world around the probe.

   Ultra alone because it is six extra scene passes. They are amortised
   one face per frame and the faces are small, but they are draw calls
   and a phone should not find them. */
QUALITY.ultra.envScene = 1;
/* How far from the probe an actor still counts. Beyond this it is not
   drawn into the cube at all -- at 128 to 256 pixels across a face,
   something sixty metres away is a texel. */
QUALITY.ultra.envSceneRange = 60;
for (const _t of ['retro', 'low', 'normal', 'high']) {
  if (QUALITY[_t].ssr == null) QUALITY[_t].ssr = 0;
  if (QUALITY[_t].ssrSteps == null) QUALITY[_t].ssrSteps = 0;
  if (QUALITY[_t].envScene == null) QUALITY[_t].envScene = 0;
  if (QUALITY[_t].envSceneRange == null) QUALITY[_t].envSceneRange = 0;
}

/* ---- PCSS AND CONTACT SHADOWS: ULTRA ONLY, FOR NOW ----
 *
 * pcss 1 / pcssBlockers 12 / pcssTaps 16 / contactShadow 1 /
 * contactSteps 10, and zero on the other four tiers -- the same landing
 * shape the reflections above use, and for the same reason. Nothing in
 * the test suite runs at ultra: detectQuality() tops out at 'high', the
 * quality watchdog only ever steps DOWN, and ultra is reachable only
 * through an explicit setQuality('ultra') or LE.create({ quality:
 * 'ultra' }). So this lands without moving a single pixel assertion, and
 * a regression found later has exactly one suspect.
 *
 * TO PUT PCSS ON 'high', WHICH IS WHERE IT BELONGS, add:
 *     QUALITY.high.pcss = 1; QUALITY.high.pcssBlockers = 8;
 *     QUALITY.high.pcssTaps = 12;
 * and re-baseline, in the same commit, every number that moves:
 * browser.test.js's shadows / materials / effects scenes (all three run
 * at 'high'), its debugMode=1 shadowed-pixel percentage at line 336
 * (13.0% today against a 1.5..60 band -- a wider penumbra moves it UP,
 * because a soft edge puts more pixels under the red<200 threshold than
 * a hard one does), underside.test.js in full, and sweep.test.js's
 * skin-tone block, which raises the tier to 'high' at line 1001.
 * CONTACT SHADOWS SHOULD NOT FOLLOW IT TO 'high' until somebody has
 * measured underside.test.js:196 afterwards: brick's underside sits six
 * sRGB units over a floor of 24, and a term that multiplies the AO
 * buffer is a term that can spend those six.
 *
 * pcssBlockers 12: the search is a uniform-density disc over
 * penumbraMax (18) texels, so 12 taps put one sample per ~85 texels of
 * area -- a 1 m occluder at cascade 0's 7.8 mm texel spans 128 texels
 * and cannot fall between them. 8 is the same disc at two thirds of the
 * density and is the right 'high' number; below about 6 the estimated
 * gap starts changing between neighbouring receivers and the penumbra
 * width boils instead of holding still.
 *
 * pcssTaps 16: the widest penumbra is 18 texels across, about 1000
 * texels of area. 16 stratified taps is one per 64 texels, and the
 * per-pixel rotation turns what is left into noise the eye reads as film
 * grain rather than as banding. 8 taps -- what the fixed-spread path has
 * always used -- holds up to about 10 texels of spread and is visibly
 * stepped past it.
 *
 * contactSteps 10 against a 26-pixel cap is a 2.6-pixel stride at half
 * resolution: close enough that a magazine's edge cannot be stepped
 * over, long enough that ten steps still reach 30 cm of world ray at
 * arm's length. */
QUALITY.ultra.pcss = 1;
QUALITY.ultra.pcssBlockers = 12;
QUALITY.ultra.pcssTaps = 16;
QUALITY.ultra.contactShadow = 1;
QUALITY.ultra.contactSteps = 10;
for (const _t of ['retro', 'low', 'normal', 'high']) {
  if (QUALITY[_t].pcss == null) QUALITY[_t].pcss = 0;
  if (QUALITY[_t].pcssBlockers == null) QUALITY[_t].pcssBlockers = 0;
  if (QUALITY[_t].pcssTaps == null) QUALITY[_t].pcssTaps = 0;
  if (QUALITY[_t].contactShadow == null) QUALITY[_t].contactShadow = 0;
  if (QUALITY[_t].contactSteps == null) QUALITY[_t].contactSteps = 0;
}


/* ---- PARALLAX OCCLUSION MAPPING + DETAIL NORMALS ----
 *
 * Patched onto the table for the same reason the SSR keys above are:
 * several features are landing on these five object literals in
 * parallel, and a property assignment after the fact composes with all
 * of them instead of conflicting with all of them. QUALITY.medium IS
 * QUALITY.normal -- one object -- so writing 'normal' writes both,
 * which is what is wanted.
 *
 * ULTRA ONLY, AND NOT HIGH, THOUGH HIGH COULD AFFORD IT. The march is
 * twelve to twenty-four textureGrad fetches on every textured fragment
 * plus five refinement taps, and it moves the point every other fetch
 * reads -- so it changes the albedo, the roughness, the AO and the
 * shading normal of every surface in the frame, which is exactly the
 * shape of change that moves a mean-luma assertion. 'high' is the most
 * heavily asserted tier in the suite: browser.test.js runs shadows,
 * materials and effects there, underside.test.js pins it (and its
 * underside floor of 24 sRGB has six units of margin on brick),
 * sweep.test.js raises to it mid-run for the skin-tone channel ratios.
 * Raising high is a one-line change and is the right next step, but it
 * belongs in a commit that re-measures those assertions, not in this
 * one. Ultra is reachable only by an explicit setQuality('ultra') or
 * LE.create({quality:'ultra'}); detectQuality() cannot return it and
 * the watchdog only steps down.
 *
 * parallaxSteps 24 at ultra. The linear search leaves one stride of
 * residual, which five binary halvings divide by 32; at 24 steps that
 * is (1/24)/32 = 0.0013 of the depth range, and the height channel is
 * eight bits, so 1/255 = 0.0039 is the floor of what the texture can
 * express. Twelve steps already reaches 0.0026 and is the number 'high'
 * should take when it takes it -- ultra pays for 24 because it renders
 * at 1.85x, where a stride invisible at 1.25x starts to read as a
 * stair-step along a long grazing wall.
 *
 * detailNormal is a separate key from parallax on purpose. The detail
 * package -- reoriented blending, the decorrelating rotation, the
 * detail roughness term, Toksvig -- costs one extra texture fetch and
 * about a dozen ALU, with no loop and no dependent fetch, so it is
 * affordable a long way down the table. It is 0 everywhere here only
 * because raising it moves pixels and this commit re-baselines nothing.
 * It is the first key to raise. */
QUALITY.ultra.parallax = 1;
QUALITY.ultra.parallaxSteps = 24;
QUALITY.ultra.detailNormal = 1;
for (const _t of ['retro', 'low', 'normal', 'high']) {
  if (QUALITY[_t].parallax == null) QUALITY[_t].parallax = 0;
  if (QUALITY[_t].parallaxSteps == null) QUALITY[_t].parallaxSteps = 0;
  if (QUALITY[_t].detailNormal == null) QUALITY[_t].detailNormal = 0;
}


function detectQuality() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  if (mobile) return (mem >= 6 && cores >= 6) ? 'normal' : 'low';
  if (mem >= 8 && cores >= 8) return 'high';
  if (mem >= 4 && cores >= 4) return 'normal';
  return 'low';
}

class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const attrs = {
      alpha: false,
      antialias: false,          // we resolve with FXAA after tonemapping
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
      failIfMajorPerformanceCaveat: false,
    };
    const gl = canvas.getContext('webgl2', attrs);
    if (!gl) throw new Error('[LegendEngine] WebGL2 is not available on this device.');
    this.gl = gl;

    // Float render targets are required for HDR; without them we fall back
    // to 8-bit and lose bloom headroom rather than failing outright.
    this.floatBuffers = !!gl.getExtension('EXT_color_buffer_float');
    this.floatLinear = !!gl.getExtension('OES_texture_float_linear');

    this.qualityName = opts.quality && QUALITY[opts.quality] ? opts.quality : detectQuality();
    this.quality = Object.assign({}, QUALITY[this.qualityName], opts.qualityOverrides || {});
    this.maxPixelRatio = opts.maxPixelRatio || 2;

    this.width = 1; this.height = 1;
    this.time = 0;
    this.shaders = new Map();
    this.fullscreen = new FullscreenTri(gl);

    /* --- environment --- */
    this.sun = {
      direction: new Vec3(0.45, 0.72, 0.53).normalize(),
      color: new Vec3(1.0, 0.94, 0.84),
      intensity: 3.4,
    };
    this.sky = {
      zenith: new Vec3(0.16, 0.33, 0.66),
      horizon: new Vec3(0.62, 0.74, 0.88),
      ground: new Vec3(0.26, 0.24, 0.22),
      intensity: 1.0,
      clouds: 0.4,
      /* What a mirror sees when it is indoors and the sky is not an answer.
         Zero outdoors; a game with interiors sets it to roughly the colour
         and brightness of its lit walls. */
      room: new Vec3(0, 0, 0),
      /* HOW MUCH SKY A SHADOWED POINT LOSES. The sun shadow map stands
         in for sky visibility -- see the long note in the ambient term
         of the surface shader. 0 is the old behaviour, where a room
         with a roof on it was lit exactly like the yard outside; 1
         would put anything the sun cannot reach on room ambient alone.
         0.45 is enough that interiors read as interiors and a shadow
         on a bright map reads as a shadow, and short of the point
         where a shaded doorway becomes a hole. */
      occlusion: 0.45,
      /* HOW MUCH OF THE SUN THE GROUND BOUNCES BACK UP. Multiplies the
         ground half of the ambient hemisphere -- see groundIrradiance in
         the surface shader. 0 is the old behaviour, where the underside
         of every object on a bright map went to black; 1 is roughly what
         a perfectly diffuse ground would really send back. 0.70 lifts an
         underside off the floor while keeping it plainly darker than the
         lit top, which is what an underside looks like. */
      bounce: 0.70,
    };
    this.fog = {
      color: new Vec3(0.62, 0.72, 0.85),
      density: 0.008,
      height: 0,
      falloff: 0.08,
      /* How much of the far fog is the sky behind it rather than the
         authored fog colour. At 1 a fully fogged object is painted
         exactly what is behind it and vanishes; at 0 this is the old
         flat fade. Not 1, because a map's fog colour is a mood as well
         as a distance cue and taking all of it away flattens dusk into
         daylight -- most of it, and the last of the silhouette goes. */
      skyBlend: 0.85,
    };
    /* THE DETAIL LAYER's two numbers. The scale is how many times the
       fine sample tiles inside one macro tile -- 9 is fine enough to
       read as grain and coarse enough not to moire -- and the fade is
       the range past which it is mixed out, because tight tiling at
       distance aliases and nobody resolves a millimetre at ten metres
       anyway. Renderer-level rather than per material: it is a property
       of how far away the eye is, which no material knows. */
    this.detailScale = 9.0;
    this.detailFade = 11.0;
    /* ---- PARALLAX, THE TWO NUMBERS A MAP CAN REACH ----
       parallaxDepth is the apparent depth, in UV units, of the deepest
       point of a REFERENCE surface -- brick, whose measured relief is
       0.82 height units. Every other recipe is scaled off its own
       measured range against that, so this one number moves all 46
       together and keeps their physical ordering.
       0.022 UV: on a wall tiled at one tile per metre that is 2.2 cm of
       apparent mortar depth against a real 5-10 mm. Parallax is
       habitually driven two to three times physical, because the eye
       reads the MOTION of the offset rather than its absolute size, and
       an honest 6 mm is indistinguishable from none at all.
       parallaxFade is where it is gone. Wider than the detail layer's
       11 m because macro relief -- mortar courses, sett crowns, pantile
       rolls -- is about nine times coarser than the 9x-tiled grain and
       survives roughly three times further before its own stride
       shimmers. Renderer-level, like detailScale and detailFade, and
       for the same reason: it is a property of how far away the eye is,
       which no material knows. */
    this.parallaxDepth = 0.022;
    this.parallaxFade = 18.0;
    /* softness is the SUN'S ANGULAR RADIUS, as a tangent. The real sun
       subtends about half a degree, so its radius is 0.265 deg and
       tan(0.265 deg) = 0.00463: an occluder one metre above a surface
       throws a penumbra 4.6 mm wide. That number is what makes PCSS read
       as sunlight rather than as a blur slider, and it is deliberately
       the physical one rather than a flattering one. Raise it for haze
       or overcast (0.02 is a soft, sourceless day); take it toward zero
       for the hard-edged look the fixed-spread path has always had. It
       does nothing at all unless quality.pcss is on.
       penumbraMax caps the penumbra in SHADOW TEXELS, which is what
       bounds both the blocker-search radius and the final PCF disc -- so
       it is the one knob that trades softness against tap density, and
       raising it without raising pcssTaps buys noise.
       The contact* group is the screen-space march; every one of them is
       explained where it is used, in GLSL.contactFrag. They are fields
       on the renderer rather than constants in the shader because the
       survey is right that uBias 0.10, uIntensity 2.9 and uSoftKnee 0.6
       are exactly the knobs no tier and no game can reach today. */
    this.shadows = {
      enabled: true, distance: 60, strength: 0.86, split: 14,
      softness: 0.00463, penumbraMax: 18.0,
      contactLength: 0.30, contactMaxPixels: 26.0, contactThickness: 0.45,
      contactBias: 0.004, contactStrength: 0.85, contactFade: 14.0,
    };
    /* One entry per cascade: the gap, in proj.z units, that gives a
       penumbra exactly one shadow texel wide, and one texel of lateral
       movement in the same units. Both are written by _fitCascade, the
       only place that knows a cascade's radius. Defaulted so that a
       frame rendered before any cascade has been fitted -- shadows
       disabled, or the first renderFrom() -- asks for the MINIMUM spread
       rather than the maximum. */
    this._cascadeGap = new Float32Array([1, 1]);
    this._cascadeTexelZ = new Float32Array([0, 0]);
    this._contactSunView = new Vec3();
    this.post = {
      exposure: 1.0,
      /* 'agx' or 'aces'. AgX is a display transform rather than a curve
         fit: it shapes in log exposure across a fixed EV window, so it
         has a real toe and a real shoulder, and its inset keeps the
         channels from separating so a bright saturated thing -- a muzzle
         flash, a tracer, the sun -- stays its own colour as it clips
         instead of skewing to yellow-white. See the long note in the
         composite for the measurement that chose it. */
      /* DEFAULT OFF, DELIBERATELY, AND THIS IS THE INTERESTING PART.
       *
         AgX measurably fixes what was measured wrong -- on the four
         reference views it takes the street's mid-band pile-up from 75
         to 50 per cent, the rubble's from 50 to 13, and the interior's
         crush from 62 per cent of the frame below 64 down to 38.
       *
         And it fails three tests, all for the same reason and none of
         them a stale baseline:
       *
           interior  'a floor under a roof is darker than the same floor
                     outside' -- covered fell from 71 to 82 per cent of
                     open
           graphics  'darkens the ambient mid-tones' -- p50 94.5 -> 90.2
           tonal     every view lost pixels below 64
       *
         Those are the same fact three times: AgX has a real toe, and a
         toe LIFTS shadows, because its job is to keep detail in them
         instead of crushing them to black. On a renderer whose shading
         already had range that is a straight win. On this one it is not
         yet, because the range is not there to keep -- there is no
         image-based lighting, so an interior is lit by an analytic sky
         a roof simply blocks, and no ambient occlusion worth the name,
         so a corner is not darker than a wall. The curve is being asked
         to supply contrast that the LIGHTING should be supplying.
       *
         Turning the punch up to compensate was tried and measured: it
         restores the street's shade (1.3 to 3.7 per cent) and re-crushes
         the interior (62 to 71). There is no setting that fixes both,
         which is the tell that it is not the curve's job.
       *
         So AgX stays fully built, switchable and measured, and off
         until the probe, GTAO and contact shadows have put real range
         into the shading. Then it goes on and the three baselines move
         once, deliberately, with the whole picture in view. Grading
         around a lighting deficiency is the exact mistake this file has
         a long comment about further down. */
      toneMap: 'aces',
      /* The look on top of AgX. 1.0/1.0 is the transform on its own. */
      agxPunch: 1.0,
      agxSat: 1.0,
      bloom: 0.55,
      bloomThreshold: 1.1,
      vignette: 0.55,
      chromatic: 0.0018,
      saturation: 1.08,
      contrast: 1.04,
      grain: 0.012,
      /* See the shader. tintMix 0 is "no cast", which is every frame the
         game has ever drawn until an optic asks otherwise. */
      tint: [0.35, 1.0, 0.45],
      tintMix: 0,
    };
    this.water = {
      color: new Vec3(0.16, 0.55, 0.68),
      deep: new Vec3(0.02, 0.12, 0.20),
    };

    this.lights = [];
    this._lightPos = new Float32Array(32);
    this._lightColor = new Float32Array(32);

    this._shadowMats = [new Mat4(), new Mat4()];    /* ---- the environment probe ----
       Allocated lazily by renderEnv(), the first frame a tier with
       quality.env on actually renders. Nothing here is built in the
       constructor on purpose: a phone must not pay for a cubemap it
       will never sample, and none of the three probe programs may be
       compiled inside a game's boot window (killcam, mpplay and mpshell
       give that window 120 s under SwiftShader). */
    this.envCube = null;      // prefiltered, mip L = roughness L/(levels-1)
    this.envSource = null;    // the unfiltered sky, the prefilter's input
    this.envFbo = null;       // 1x1, borrowed onto a face/level at a time
    this.brdfLut = null;      // 128x128 split-sum table
    this.envLevels = 0;
    this.envRes = 0;
    /* Probe strength. 1.0 is physical. A game can dial it without
       switching the probe off; 0 switches it off. */
    this.envIntensity = 1.0;
    /* Set only while the six scene faces are being drawn. _bindEnv reads
       it and binds uEnvIntensity 0, so the world baked into the cube is
       lit WITHOUT the cube -- otherwise each rebake reflects the last
       one and the reflections compound frame over frame. */
    this._envBaking = false;
    this._envDepth = null;   // depth renderbuffer, cube-face sized
    this._envCam = null;     // the 90-degree camera the faces are drawn from
    this._envAt = null;      // where the cube in hand was baked from
    this._envSh = new Float32Array(27);
    this._envHash = null;
    this._envJob = 0;
    this._envJobs = 0;
    this._envReady = false;
    this._brdfLutBaked = false;
    this._envNull = null;    // 1x1 stand-ins, see _envFallback
    this._planes = new Float32Array(24);
    /* ================================================================
       SCREEN-SPACE REFLECTIONS
       ================================================================
       Live and writable the way `shadows`, `fog` and `post` are, so a
       map or a test can reach all of it without a rebuild.

       The two COST knobs are deliberately NOT here: whether the pass
       runs at all and how many march steps it gets are tier keys
       (quality.ssr, quality.ssrSteps), because they are the two numbers
       that have to differ between a phone and a desktop. What is here
       is the LOOK, which should not. */
    this.ssr = {
      // Scales the whole replacement. 1.0 is the physical answer.
      intensity: 1.0,
      /* How much of the environment specular the forward pass already
         applied gets paid back before the traced reflection replaces
         it. Not 1.0 on purpose: the fold cannot see the sun shadow term
         or the ORM occlusion at the receiving pixel, so its estimate of
         what pbrFrag added can be up to a fifth too bright. Leaving a
         sliver unsubtracted makes that error read as a slightly strong
         reflection instead of as a hole, and a hole is far worse. */
      replace: 0.90,
      /* Full strength below roughCut, gone at roughMax. These are set
         by what the cone blur can actually cover -- see the arithmetic
         in GLSL.ssrBlurFrag -- and not by taste. Glass, water, a
         puddle, wet tile and a blued receiver all sit under 0.35. */
      roughCut: 0.25,
      roughMax: 0.50,
      /* Metres. How solid the marcher is entitled to assume one depth
         sample is. Big enough that a ray does not tunnel through the
         wall of a crate, small enough that it cannot claim the far side
         of a doorway it passed through. */
      thickness: 0.35,
      /* Metres. Past this the environment term is the better answer
         anyway, and a shorter ray spends the fixed step budget on the
         near reflections that actually read. */
      maxDistance: 24,
      /* UV units of border over which a reflection fades out rather
         than ending in a hard line that slides with the camera. */
      edgeFade: 0.12,
      /* A firefly ceiling in linear radiance and a darkening floor as a
         fraction of the pixel. Rails, not tuning -- a well-behaved
         frame never reaches either, and they are here so a badly
         behaved one degrades instead of punching a black or white hole
         through the brightest assertions in the test suite. */
      clamp: 6.0,
      maxDarken: 0.60,
    };
    this._instanceScratch = new Float32Array(20 * 1024);

    this._initTargets();
    this._initShadowMaps();
    this.stats = { draws: 0, tris: 0, instances: 0 };
    // 0 off, 1 shadow, 2 normal, 3 albedo, 4 roughness, 5 depth
    this.debugMode = 0;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  /* ---------------- shader cache ---------------- */

  program(name, vert, frag, defines = []) {
    const key = `${name}|${defines.join(',')}`;
    let sh = this.shaders.get(key);
    if (!sh) {
      sh = new Shader(this.gl, vert, frag, key, defines);
      this.shaders.set(key, sh);
    }
    return sh;
  }

  /* ---- WHICH ATTACHMENTS THIS DRAW IS ALLOWED TO TOUCH ----
   *
   * With a G-buffer hung off the scene target, "draw into hdrA" stops
   * being one thing. The opaque pass fills colour AND normals; every
   * other pass that writes to hdrA -- the sky, the transparent queue,
   * the blit that brings the fluid shading back, the particles -- has
   * only a colour to contribute and no normal worth having.
   *
   * Left unmasked they write one anyway. A fragment shader that
   * declares one output leaves the other attachment undefined, and a
   * BLIT does not go through a shader at all: it copies attachment for
   * attachment, so the fluid blit would paste the water's colour
   * straight into the normal buffer. Blending is worse -- it applies to
   * every enabled draw buffer, so a puff of smoke would alpha-blend its
   * colour over the normals underneath it and every screen-space effect
   * downstream would reflect off fog.
   *
   * So the mask goes up for the one pass that has a normal to write and
   * down for everything else. A no-op when there is no G-buffer. */
  _sceneTargets(full) {
    if (!this.gbuffer) return;
    const gl = this.gl;
    gl.drawBuffers(full
      ? [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]
      : [gl.COLOR_ATTACHMENT0, gl.NONE]);
  }

  _initTargets() {
    const gl = this.gl;
    const hdr = this.floatBuffers
      ? { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }
      : { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    this._hdrSpec = hdr;

    /* ================================================================
       THE G-BUFFER
       ================================================================
       A second colour attachment on the scene target, written by the
       opaque pass only, carrying what a forward renderer throws away
       and every screen-space effect needs back: the shading normal and
       the roughness.

       Reconstructing a normal from the depth buffer -- which is what
       the existing SSAO does at 50-shaders.js -- gives the GEOMETRIC
       normal of the depth surface, not the SHADING normal. Every bump
       the normal map adds is invisible to it, so a screen-space
       reflection off a brick wall would reflect as if the wall were
       glass-flat, and ambient occlusion cannot tell a groove from a
       painted line. Roughness cannot be reconstructed from depth at
       all, and without it a reflection is either a mirror everywhere or
       a blur everywhere.

       RGBA16F, packed:
         .rg  view-space shading normal, octahedral, signed [-1,1]
         .b   perceptual roughness [0,1]
         .a   metalness [0,1]

       Octahedral rather than storing xyz: two channels instead of
       three, exact enough that the error is under a tenth of a degree
       at 16-bit, and it leaves .a free for metalness in one 8-byte
       texel. Signed with no bias because a half float round-trips
       [-1,1] exactly and a bias would waste a bit.

       ALLOCATED ONLY WHEN ASKED. A full-resolution RGBA16F is 8 bytes a
       pixel, which at the ultra render scale of 1.85 is 3.4x the CSS
       pixel count -- so the tiers that cannot use it do not pay for it.
       Framebuffer.color returns colors[0], so every existing
       hdrA.color consumer is untouched by the extra attachment. */
    this._gbufSpec = this.floatBuffers
      ? { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }
      : { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    this.gbuffer = !!this.quality.gbuffer;
    const sceneColors = this.gbuffer ? [hdr, this._gbufSpec] : [hdr];

    /* The main target's depth is a texture rather than a renderbuffer, so
       ambient occlusion can read the scene's depth without a second
       geometry pass. It is still blitted into the fluid target the same
       way. */
    this.hdrA = new Framebuffer(gl, { width: 4, height: 4, colors: sceneColors, depth: true, depthTexture: true });
    this.hdrB = new Framebuffer(gl, { width: 4, height: 4, colors: [hdr], depth: false });
    this.bloomChain = [];
    for (let i = 0; i < 4; i++) {
      this.bloomChain.push({
        a: new Framebuffer(gl, { width: 4, height: 4, colors: [hdr], depth: false }),
        b: new Framebuffer(gl, { width: 4, height: 4, colors: [hdr], depth: false }),
      });
    }
    this.ldr = new Framebuffer(gl, { width: 4, height: 4, colors: [{}], depth: false });

    /* Ambient occlusion, at half resolution and blurred back up. Full
       resolution buys nothing here: the signal is low frequency and the
       blur that takes the sampling noise out would throw the extra detail
       away again. */
    const aoSpec = { internalFormat: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE };
    this.aoA = new Framebuffer(gl, { width: 4, height: 4, colors: [aoSpec], depth: false });
    this.aoB = new Framebuffer(gl, { width: 4, height: 4, colors: [aoSpec], depth: false });
    this._aoWhite = null;

    const rSpec = this.floatBuffers
      ? { internalFormat: gl.R32F, format: gl.RED, type: gl.FLOAT }
      : { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    this._rSpec = rSpec;
    this.fluidDepth = new Framebuffer(gl, { width: 4, height: 4, colors: [rSpec], depth: true });
    this.fluidBlurA = new Framebuffer(gl, { width: 4, height: 4, colors: [rSpec], depth: false });
    this.fluidBlurB = new Framebuffer(gl, { width: 4, height: 4, colors: [rSpec], depth: false });
    this.fluidThick = new Framebuffer(gl, { width: 4, height: 4, colors: [rSpec], depth: false });
  }

  _initShadowMaps() {
    const gl = this.gl;
    const res = this.quality.shadowRes;
    this.shadowMaps = [];
    /* Two, whatever the tier asks for. There are two cascade matrices and
       the shader binds two maps, so a third would be rendered every frame
       and then never sampled — and asking for one walks off the end of
       _shadowMats and throws on the first frame. Clamped here rather than
       trusted to the table, because the table is the easy place to change
       a number without knowing what else depends on it. */
    const n = Math.min(this.quality.cascades, this._shadowMats.length);
    /* THE BLOCKER ATTACHMENT, and why it has to exist at all.
     *
       PCSS has to AVERAGE the depth of the occluders above a receiver,
       and uShadowMap0/1 cannot give it one. They are created with
       compare: true, i.e. TEXTURE_COMPARE_MODE = COMPARE_REF_TO_TEXTURE,
       so every fetch is a comparison against a reference and returns a
       lit fraction. That is exactly right for the PCF and useless for a
       search. Reading the same texture through a plain sampler2D is not
       a way out either: in GLSL ES 3.00 a depth texture with compare
       mode set is INCOMPLETE to a non-shadow sampler and returns zero,
       silently and with no error to find.

       So the shadow pass writes gl_FragCoord.z a second time, into an R8
       colour attachment, and the search reads that. One byte a texel:
       13.1 MB for two 2560 cascades, 33.6 MB for two 4096 ones, and
       nothing at all on the tiers that never ask. The precision argument
       is in the comment above pcssBlocker0 in 50-shaders.js; the short
       version is that an orthographic proj.z is linear, so R8's
       quantisation lands at about a seventh of a shadow texel of
       penumbra, which nothing can see. */
    const wantBlocker = !!this.quality.pcss;
    const blockerSpec = {
      internalFormat: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE,
      minFilter: gl.NEAREST, magFilter: gl.NEAREST,
    };
    for (let i = 0; i < n; i++) {
      this.shadowMaps.push(new Framebuffer(gl, Object.assign({
        width: res, height: res, depthOnly: true, depthTexture: true, compare: true, depth: true,
      }, wantBlocker ? { colors: [blockerSpec] } : null)));
    }
    /* Both blocker samplers are bound on every PBR draw whether PCSS is
       on or not, so they need something valid to point at when it is
       off. They cannot be left unbound: an unset sampler2D reads unit 0,
       where uShadowMap0 -- a sampler2DShadow -- already is, and two
       sampler types on one unit is an INVALID_OPERATION on every draw.
       1.0 is the far plane, so the search finds no blocker and the crisp
       path runs. One texel, one byte, allocated once for the process. */
    if (!this._noBlockerTex) {
      this._noBlockerTex = new Texture(gl, {
        internalFormat: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE,
        wrap: gl.CLAMP_TO_EDGE, minFilter: gl.NEAREST, magFilter: gl.NEAREST, mips: false,
      });
      this._noBlockerTex.upload(new Uint8Array([255]), 1, 1);
    }
  }

  /* Change tier at runtime.

     Everything the tier decides is allocated: the shadow cascades are
     framebuffers of a fixed size, and the colour targets are sized off
     `renderScale`. So switching tiers means throwing the shadow maps away
     and rebuilding them, then forcing a resize by invalidating the cached
     dimensions — without that last part `resize` early-returns on the
     unchanged CSS size and the new render scale never takes effect. */
  setQuality(name, overrides) {
    if (!QUALITY[name]) return this.qualityName;
    this.qualityName = name;
    this.quality = Object.assign({}, QUALITY[name], overrides || {});
    /* THE SCENE TARGET IS REBUILT IF THE G-BUFFER COMES OR GOES.
     *
       A Framebuffer's attachment list is fixed at construction, so a
       tier change that turns the G-buffer on cannot just set a flag --
       the attachment has to exist. In practice this almost never fires:
       the watchdog only ever steps DOWN and detectQuality tops out at
       'high', so the only way to gain one is an explicit
       setQuality('ultra') from below. It fires correctly when it does,
       and the resize() that every caller already performs afterwards
       (setQuality deliberately sets width to -1 to defeat the
       early-return) puts it back at the right size. */
    const wantGbuf = !!this.quality.gbuffer;
    if (wantGbuf !== this.gbuffer) {
      const gl = this.gl;
      this.gbuffer = wantGbuf;
      const colors = wantGbuf ? [this._hdrSpec, this._gbufSpec] : [this._hdrSpec];
      this.hdrA.dispose();
      this.hdrA = new Framebuffer(gl, {
        width: 4, height: 4, colors: colors, depth: true, depthTexture: true,
      });
    }
    /* THE TEXTURE BUDGET, SET BEFORE ANYTHING IS BUILT.
     *
       Textures are shared per recipe now (see Material._buildMaps), so
       seventeen recipes at 512 cost 51 MB where the old per-material
       duplication cost 102 MB at 256. That is half the memory for four
       times the texel density, which is why this can be a tier setting
       at all rather than a constant nobody could afford to raise.

       BUT THE FIRST BUILD STAYS SMALL. Generating these is per-texel
       JavaScript: 0.57 s for the whole set at 256 and 6.2 s at 1024, on
       a desktop. Baking the tier's full size up front would put half a
       minute of loading in front of a phone, so the tier's number is
       the TARGET and the game reaches it with upgradeTextures() once
       the map is running -- see 98c-texres.js. Retro is the exception
       and takes its size immediately, because 128 is faster than the
       default and the whole point of that tier is to look coarse. */
    this.texTarget = this.quality.texRes || 256;
    Material.textureSize = Math.min(256, this.texTarget);
    for (const m of this.shadowMaps || []) if (m.dispose) m.dispose();    /* The probe is sized by the tier (envRes) and not by renderScale,
       so it is not part of resize(). Drop it here and let renderEnv
       rebuild it lazily at the new size on the next frame -- which is
       also why a tier with env off allocates nothing at all. */
    this._disposeEnv();
    this._initShadowMaps();
    this.width = -1; this.height = -1;
    return this.qualityName;
  }

  resize(cssWidth, cssHeight, pixelRatio) {
    const dpr = Math.min(pixelRatio || window.devicePixelRatio || 1, this.maxPixelRatio);
    const scale = this.quality.renderScale;
    const w = Math.max(2, Math.floor(cssWidth * dpr * scale));
    const h = Math.max(2, Math.floor(cssHeight * dpr * scale));
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.hdrA.resize(w, h);
    this.hdrB.resize(w, h);
    this.ldr.resize(w, h);
    for (let i = 0; i < this.bloomChain.length; i++) {
      const s = 1 << (i + 1);
      const bw = Math.max(2, w >> (i + 1)), bh = Math.max(2, h >> (i + 1));
      this.bloomChain[i].a.resize(bw, bh);
      this.bloomChain[i].b.resize(bw, bh);
    }
    // Fluid depth must match the main buffer so the scene depth can be
    // blitted into it for correct occlusion.
    this.fluidDepth.resize(w, h);
    const fw = Math.max(2, Math.floor(w * this.quality.fluidScale));
    const fh = Math.max(2, Math.floor(h * this.quality.fluidScale));
    this.fluidBlurA.resize(fw, fh);
    this.fluidBlurB.resize(fw, fh);
    this.fluidThick.resize(fw, fh);
    const aw = Math.max(2, w >> 1), ah = Math.max(2, h >> 1);
    this.aoA.resize(aw, ah);
    this.aoB.resize(aw, ah);
  }

  /* ---------------- uniform blocks ---------------- */

  _bindEnv(sh) {
    sh.v3('uSkyZenith', this.sky.zenith);
    sh.v3('uSkyHorizon', this.sky.horizon);
    sh.v3('uGroundColor', this.sky.ground);
    sh.v3('uSunDir', this.sun.direction);
    sh.v3('uSunColor', this.sun.color);
    sh.f('uSunIntensity', this.sun.intensity);
    sh.f('uSkyIntensity', this.sky.intensity);
    sh.v3('uRoomAmbient', this.sky.room);
    sh.f('uSkyOcclusion', this.sky.occlusion);
    sh.f('uGroundBounce', this.sky.bounce);
    sh.v3('uFogColor', this.fog.color);
    sh.f('uFogDensity', this.fog.density);
    sh.f('uFogHeight', this.fog.height);
    sh.f('uFogHeightFalloff', this.fog.falloff);
    sh.f('uFogSkyBlend', this.fog.skyBlend);    /* ---- the environment probe ----
       One bind site for all three programs that include GLSL.sky (pbr,
       sky, fluidShade). uEnvIntensity is the gate as well as the
       strength: at zero every envXxx() in the shader evaluates the
       analytic expression it replaced, which is what makes a tier with
       quality.env off render the frame it rendered before.

       _envReady is false until the first full bake has finished, which
       is what stops anything sampling the mip levels allocMips left
       uninitialised.

       BOTH SAMPLERS ARE BOUND UNCONDITIONALLY, AND THAT IS NOT TIDINESS.
       envBRDF and envRadiance branch on a uniform, so the compiler
       cannot prove uEnvCube and uBrdfLut are unused and does not strip
       them: they stay ACTIVE, and an active sampler that nobody points
       anywhere reads texture unit 0 -- where _bindShadows has just put
       uShadowMap0, a sampler2DShadow. Two sampler types on one unit is
       GL_INVALID_OPERATION at draw time and THE DRAW IS DROPPED, which
       is measurable: interior.test.js went from 88.9/119.2 covered/open
       to a flat 188.7 for both, because the floor was never rasterised
       and the band was reading sky.

       The stand-ins are 1x1 textures of our own and NOT, say, hdrA.color
       -- hdrA is the framebuffer being drawn into, and binding an
       attachment of the current framebuffer as a texture is the same
       GL_INVALID_OPERATION by a different route, whether or not the
       shader ever samples it. Twenty-eight bytes and two bindTexture
       calls per batch, the same cost as the shadow maps beside them. */
    /* _envBaking is the recursion brake. The six scene faces are drawn
       by this same PBR path, so without it each face would be shaded
       using the cube it is being baked into: a rebake would reflect the
       previous bake, and a bright reflective scene would ratchet itself
       brighter every cycle. Baked faces are lit by sun, lights and the
       analytic sky only. */
    const envOn = !!(this.quality.env && this.envCube && this._envReady
      && !this._envBaking);
    sh.f('uEnvIntensity', envOn ? (this.envIntensity != null ? this.envIntensity : 1) : 0);
    sh.f('uEnvDiffuse', envOn ? (this.quality.envDiffuse || 0) : 0);
    /* Always zero here. The only draw that sets it to 1 is the cube bake
       itself, in _bakeEnvSource, immediately after this call. */
    sh.f('uEnvNoSunDisc', 0);
    sh.v2('uEnvLod', envOn ? this.envLevels - 1 : 0, envOn ? Math.max(0, this.envLevels - 3) : 0);
    sh.v3v('uEnvSh', this._envSh);
    const nul = this._envFallback();
    sh.tex('uEnvCube', envOn ? this.envCube : nul.cube);
    sh.tex('uBrdfLut', envOn ? this.brdfLut : nul.lut);
    sh.f('uTime', this.time);
  }

  _bindShadows(sh) {
    sh.m4('uShadowMat0', this._shadowMats[0]);
    sh.m4('uShadowMat1', this._shadowMats[this.shadowMaps.length > 1 ? 1 : 0]);
    sh.f('uCascadeSplit', this.shadows.split);
    sh.v2('uShadowTexel', 1 / this.quality.shadowRes, 1 / this.quality.shadowRes);
    sh.f('uShadowStrength', this.shadows.enabled ? this.shadows.strength : 0);
    sh.tex('uShadowMap0', this.shadowMaps[0].depthTexture);
    sh.tex('uShadowMap1', this.shadowMaps[this.shadowMaps.length > 1 ? 1 : 0].depthTexture);

    /* ---- PCSS ----
       The gate is the ATTACHMENT, not the tier key. quality.pcss is read
       by _initShadowMaps, which runs from the constructor and from
       setQuality() and nowhere else, so a game that writes
       renderer.quality.pcss = 1 at runtime has the flag without the
       buffer. Testing for the buffer here means that degrades to the
       crisp path -- the picture this renderer has always produced --
       instead of searching a one-texel dummy and drawing a shadow with
       no penumbra and no explanation. */
    const far = this.shadowMaps[this.shadowMaps.length > 1 ? 1 : 0];
    const hasBlocker = !!(this.shadowMaps[0].colors.length && far.colors.length);
    const blockers = (this.quality.pcss && hasBlocker)
      ? Math.max(4, Math.min(16, this.quality.pcssBlockers | 0)) : 0;
    sh.i('uShadowBlockers', blockers);
    sh.i('uShadowTaps', Math.max(4, Math.min(24, this.quality.pcssTaps || 8)));
    sh.f('uShadowPenumbraMax', Math.max(1, this.shadows.penumbraMax || 18));
    sh.v2('uShadowGapUnit', this._cascadeGap[0],
      this._cascadeGap[this.shadowMaps.length > 1 ? 1 : 0]);
    sh.v2('uShadowTexelZ', this._cascadeTexelZ[0],
      this._cascadeTexelZ[this.shadowMaps.length > 1 ? 1 : 0]);
    if (blockers > 0) {
      sh.tex('uShadowBlocker0', this.shadowMaps[0].colors[0]);
      sh.tex('uShadowBlocker1', far.colors[0]);
    } else {
      this._bindNoBlocker(sh);
    }
  }

  /* Park both blocker samplers on ONE texture unit holding the 1x1 white
     dummy. Going through sh.tex() twice would burn two units and two
     bindTexture calls on every PBR draw of every tier -- around 520 GL
     calls a frame in the real multiplayer map -- to say the same thing
     twice. This says it once. Reaching into the shader's uniform map is
     deliberate: pointing two samplers at one unit is not something
     tex() can express, and the alternative is paying for it forever on
     the tiers that never use PCSS at all. */
  _bindNoBlocker(sh) {
    const u0 = sh.uniforms.get('uShadowBlocker0');
    const u1 = sh.uniforms.get('uShadowBlocker1');
    if (!u0 && !u1) return;
    const gl = this.gl;
    const unit = sh._texUnit++;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this._noBlockerTex.handle);
    if (u0) gl.uniform1i(u0.loc, unit);
    if (u1) gl.uniform1i(u1.loc, unit);
  }

  _bindLights(sh) {
    /* Eight lights reach the shader, and which eight matters. Taking them
       in creation order means a scene with eight static lights anywhere in
       the world leaves nothing for a muzzle flash at the camera, and a room
       lit by a lamp on the far side of the map is lit by nothing at all.
       Nearest to the camera wins instead, which is both what a player
       notices and what a light can actually reach. */
    const all = this.lights;
    let list = all;
    if (all.length > 8) {
      const cam = this.camera ? this.camera.position : null;
      if (cam) {
        if (!this._lightSort || this._lightSort.length !== all.length) this._lightSort = new Array(all.length);
        for (let i = 0; i < all.length; i++) {
          const l = all[i];
          const dx = l.position.x - cam.x, dy = l.position.y - cam.y, dz = l.position.z - cam.z;
          // Bias by reach: a bright, wide light matters further away.
          this._lightSort[i] = { l, d: (dx * dx + dy * dy + dz * dz) - (l.radius || 0) * (l.radius || 0) };
        }
        this._lightSort.sort((a, b) => a.d - b.d);
        list = this._lightSort.slice(0, 8).map((e) => e.l);
      }
    }
    const n = Math.min(list.length, 8);
    for (let i = 0; i < n; i++) {
      const l = list[i];
      this._lightPos[i * 4] = l.position.x;
      this._lightPos[i * 4 + 1] = l.position.y;
      this._lightPos[i * 4 + 2] = l.position.z;
      this._lightPos[i * 4 + 3] = l.radius;
      this._lightColor[i * 4] = l.color.x;
      this._lightColor[i * 4 + 1] = l.color.y;
      this._lightColor[i * 4 + 2] = l.color.z;
      this._lightColor[i * 4 + 3] = l.intensity;
    }
    sh.i('uLightCount', n);
    if (n > 0) {
      sh.v4v('uLightPos', this._lightPos);
      sh.v4v('uLightColor', this._lightColor);
    }
  }

  _bindMaterial(sh, mat) {
    sh.v3('uBaseColor', mat.color);
    sh.f('uRoughness', mat.roughness);
    sh.f('uMetalness', mat.metalness);
    sh.v3f('uEmissive',
      mat.emissive.x * mat.emissiveStrength,
      mat.emissive.y * mat.emissiveStrength,
      mat.emissive.z * mat.emissiveStrength);
    sh.f('uOpacity', mat.opacity);
    sh.f('uUvScale', mat.uvScale);
    sh.i('uWorldUv', mat.worldUv ? 1 : 0);
    sh.f('uNormalStrength', mat.normalStrength);
    sh.f('uDetail', mat.detail != null ? mat.detail : 1);
    sh.f('uDetailScale', this.detailScale);
    sh.f('uDetailFade', this.detailFade);
    /* ---- PARALLAX + DETAIL NORMALS: six uniforms, no new sampler ----
       The height is uOrmMap.a, which nothing sampled before, so this
       adds no texture unit to a pass that already binds five.
       uParallaxDepth carries the whole gate: tier x material x the
       renderer's global depth. When it is zero the shader never reaches
       the march, so a tier with parallax off pays one scalar compare
       per fragment and nothing else. uParallaxTop and uParallaxRange
       are this recipe's MEASURED relief, taken at bake time in the loop
       that already walked every texel and carried on the shared maps
       object; a material with no maps binds range 0, which reads as
       "no relief" and switches the whole thing off by itself. */
    const pTier = this.quality.parallax || 0;
    const pMat = mat.parallax != null ? mat.parallax : 0;
    const pRange = (mat.maps && mat.maps.heightRange != null) ? mat.maps.heightRange : 0;
    sh.f('uParallaxDepth',
      (pTier > 0 && pMat > 0 && pRange > 1e-4)
        ? (this.parallaxDepth != null ? this.parallaxDepth : 0.022) * pMat * pTier
        : 0);
    sh.f('uParallaxSteps', this.quality.parallaxSteps || 12);
    sh.f('uParallaxFade', this.parallaxFade != null ? this.parallaxFade : 18.0);
    sh.f('uParallaxRange', pRange);
    sh.f('uParallaxTop', (mat.maps && mat.maps.heightTop != null) ? mat.maps.heightTop : 1);
    sh.f('uDetailNormal', this.quality.detailNormal ? 1 : 0);
    sh.f('uSubsurface', mat.subsurface);
    sh.i('uReceiveShadow', mat.receiveShadow ? 1 : 0);
    sh.i('uHasMaps', mat.maps ? 1 : 0);
    if (mat.maps) {
      sh.tex('uAlbedoMap', mat.maps.albedo);
      sh.tex('uNormalMap', mat.maps.normal);
      sh.tex('uOrmMap', mat.maps.orm);
    }
  }

  /* ---------------- cascaded shadow fitting ---------------- */

  /* Fit an orthographic light frustum around one slice of the view frustum.
     A bounding sphere (rather than a box) keeps the fit rotation-invariant,
     so the shadow map does not resize as the camera turns — which is what
     causes the classic crawling-edge shimmer. */
  _fitCascade(camera, nearD, farD, out) {
    const tanHalf = Math.tan(camera.fov / 2);
    const corners = _shadowCorners;
    let ci = 0;
    for (const d of [nearD, farD]) {
      const hh = tanHalf * d, hw = hh * camera.aspect;
      for (const sy of [-1, 1]) {
        for (const sx of [-1, 1]) {
          corners[ci++].copy(camera.position)
            .addScaled(camera.forward, d)
            .addScaled(camera.right, hw * sx)
            .addScaled(camera.trueUp, hh * sy);
        }
      }
    }
    const center = _v[10].set(0, 0, 0);
    for (let i = 0; i < 8; i++) center.add(corners[i]);
    center.scale(1 / 8);
    let radius = 0;
    for (let i = 0; i < 8; i++) radius = Math.max(radius, center.distanceTo(corners[i]));
    radius = Math.ceil(radius * 16) / 16;

    const res = this.quality.shadowRes;
    const texelSize = (radius * 2) / res;
    // Snap the centre to whole texels along the light's own axes.
    const eye = _v[11].copy(center).addScaled(this.sun.direction, radius * 2.2 + 8);
    const lightView = _shadowView.lookAt(eye, center, Math.abs(this.sun.direction.y) > 0.99 ? _axisZ : Vec3.UP);
    const lc = _v[12].copy(center).applyMat4(lightView);
    lc.x = Math.floor(lc.x / texelSize) * texelSize;
    lc.y = Math.floor(lc.y / texelSize) * texelSize;
    const snapped = _v[13].copy(lc).applyMat4(_shadowViewInv.copy(lightView).invert());
    const eye2 = _v[14].copy(snapped).addScaled(this.sun.direction, radius * 2.2 + 8);
    lightView.lookAt(eye2, snapped, Math.abs(this.sun.direction.y) > 0.99 ? _axisZ : Vec3.UP);

    _shadowProj.ortho(-radius, radius, -radius, radius, 0.5, radius * 4.4 + 20);

    /* THE TWO NUMBERS PCSS NEEDS, and this is the only function that
       knows them. The projection is orthographic, so proj.z is LINEAR in
       metres along the light over exactly this range -- which is why a
       gap in proj.z becomes a penumbra in texels with a single divide in
       the shader, and why one byte of stored blocker depth is enough.
         gap    = texelWorld / (sunTan * depthRange)
                  -- the gap that gives a one-texel penumbra
         texelZ = texelWorld / depthRange
                  -- one texel of lateral movement, in proj.z
       `out` is always this._shadowMats[i], and there are exactly two of
       them (the array is fixed at length 2 and _initShadowMaps clamps the
       cascade count to it), so testing identity against slot 1 recovers
       the cascade index without changing this function's signature. */
    const depthRange = (radius * 4.4 + 20) - 0.5;
    const texelWorld = (radius * 2) / res;
    const sunTan = Math.max(1e-5, this.shadows.softness || 0.00463);
    const cIdx = (out === this._shadowMats[1]) ? 1 : 0;
    this._cascadeGap[cIdx] = texelWorld / (sunTan * depthRange);
    this._cascadeTexelZ[cIdx] = texelWorld / depthRange;
    out.mulMatrices(_shadowProj, lightView);
    return out;
  }

  renderShadows(batches, camera) {
    if (!this.shadows.enabled || !this.shadowMaps.length) return;
    const gl = this.gl;
    const n = this.shadowMaps.length;
    const near = camera.near;
    const split = Math.min(this.shadows.split, this.shadows.distance);
    const ranges = n === 1
      ? [[near, this.shadows.distance]]
      : [[near, split], [split * 0.92, this.shadows.distance]];

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // Render the faces that FACE the light (normal back-face culling).
    //
    // The tempting alternative — culling front faces so acne lands on
    // surfaces the camera cannot see — breaks the most common case in any
    // game: an object resting on the ground. Back-face culling stores the
    // occluder's *underside*, which sits at exactly the receiver's depth, so
    // the ground compares against a depth equal to its own and every contact
    // shadow disappears.
    //
    // Storing front faces means the occluder's lit surface is stored well
    // above the receiver, and acne is handled by polygon offset plus the
    // slope-scaled bias in the shader.
    gl.cullFace(gl.BACK);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.8, 4.0);

    for (let i = 0; i < n; i++) {
      this._fitCascade(camera, ranges[i][0], ranges[i][1], this._shadowMats[i]);
      const fb = this.shadowMaps[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.handle);
      gl.viewport(0, 0, fb.width, fb.height);
      /* With a blocker attachment the colour has to be cleared too, and
         to WHITE: 1.0 is the far plane, so a texel nothing was drawn into
         reports "no occluder" instead of reporting whatever the previous
         frame left there. */
      if (fb.colors.length) {
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      } else {
        gl.clear(gl.DEPTH_BUFFER_BIT);
      }

      for (const batch of batches) {
        if (!batch.count || !batch.material.castShadow) continue;
        if (batch.material.transparent && batch.material.opacity < 0.6) continue;
        const defines = [];
        if (batch.instanced) defines.push('INSTANCED');
        if (batch.skinned) defines.push('SKINNED');
        if (batch.grass) defines.push('GRASS');
        const sh = this.program('shadow', GLSL.shadowVert, GLSL.shadowFrag, defines).use();
        sh.m4('uViewProj', this._shadowMats[i]);
        sh.f('uTime', this.time);
        sh.v3('uCameraPos', camera.position);
        if (batch.grass) {
          sh.v3('uWindDir', this.wind ? this.wind.direction : _defaultWind);
          sh.f('uWindStrength', this.wind ? this.wind.strength : 0.25);
        }
        this._drawBatch(sh, batch);
      }
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _drawBatch(sh, batch) {
    if (batch.skinned && batch.boneTexture) {
      sh.tex('uBoneTex', batch.boneTexture);
      sh.f('uBoneCount', batch.boneCount || 0);
    }
    if (batch.instanced) {
      batch.mesh.uploadInstances(batch.instances, batch.count);
      batch.mesh.drawInstanced(batch.count);
      this.stats.draws++;
      this.stats.instances += batch.count;
      this.stats.tris += (batch.mesh.indexCount / 3) * batch.count;
    } else {
      sh.m4('uModel', batch.model);
      sh.v4('uParams', batch.params[0], batch.params[1], batch.params[2], batch.params[3]);
      batch.mesh.draw();
      this.stats.draws++;
      this.stats.tris += batch.mesh.indexCount / 3;
    }
  }

  /* ---------------- main pass ---------------- */

  renderScene(batches, camera) {
    /* _bindLights picks the eight lights nearest the camera, and it needs
       the camera to do it. Without this it silently fell back to creation
       order, so the ninth light ever created — whatever it was, wherever the
       player stood — was never uploaded at all. */
    this.camera = camera;    /* Pass 1: the amortised environment bake, before anything binds
       hdrA. It borrows envFbo and leaves the viewport at a mip size,
       which the hdrA bind below puts back, and it restores depthMask
       so that bind's depth clear is not masked out. Here rather than
       in Engine.step so renderFrom() -- killcams, cutscenes,
       interior.test.js and density.test.js -- gets a probe too. */
    this.renderEnv(batches, camera);
    const gl = this.gl;
    /* Mask UP before the clear, not after: one clear has to fill the
       normal buffer as well as the colour, or last frame's normals
       survive wherever nothing is drawn this frame and the sky
       reflects whatever used to be in front of it. */
    this._sceneTargets(true);
    this.hdrA.bind(true, 0, 0, 0, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    const opaque = [];
    const transparent = [];
    for (const b of batches) {
      if (!b.count) continue;
      (b.material.transparent ? transparent : opaque).push(b);
    }

    for (const batch of opaque) this._drawPbr(batch, camera);

    /* Everything past here has a colour and no normal. */
    this._sceneTargets(false);
    this._drawSky(camera);

    // Transparent last, sorted back to front, with depth writes off so
    // overlapping surfaces blend instead of occluding each other.
    if (transparent.length) {
      transparent.sort((a, b) => b.sortKey - a.sortKey);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (const batch of transparent) this._drawPbr(batch, camera);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    /* Leave the mask down. Every later pass that touches hdrA -- the
       fluid blit, the particles -- wants colour only, and a pass that
       needs the G-buffer raises it for itself. */
    this._sceneTargets(false);
  }

  _drawPbr(batch, camera) {
    const gl = this.gl;
    const defines = [];
    if (batch.instanced) defines.push('INSTANCED');
    if (batch.skinned) defines.push('SKINNED');
    if (batch.grass) defines.push('GRASS');
    if (batch.alphaClip) defines.push('ALPHA_CLIP');
    const sh = this.program('pbr', GLSL.pbrVert, GLSL.pbrFrag, defines).use();

    sh.m4('uViewProj', camera.viewProj);
    // For the G-buffer normal only; see the uView comment in pbrFrag.
    sh.m4('uView', camera.view);
    sh.v3('uCameraPos', camera.position);
    this._bindEnv(sh);
    this._bindShadows(sh);
    this._bindLights(sh);
    this._bindMaterial(sh, batch.material);
    sh.i('uDebugMode', this.debugMode);
    if (batch.grass) {
      sh.v3('uWindDir', this.wind ? this.wind.direction : _defaultWind);
      sh.f('uWindStrength', this.wind ? this.wind.strength : 0.25);
    }

    if (batch.material.doubleSided) gl.disable(gl.CULL_FACE);
    this._drawBatch(sh, batch);
    if (batch.material.doubleSided) gl.enable(gl.CULL_FACE);
  }

  _drawSky(camera) {
    const gl = this.gl;
    const sh = this.program('sky', GLSL.skyVert, GLSL.skyFrag).use();
    sh.m4('uInvViewProj', camera.invViewProj);
    sh.v3('uCameraPos', camera.position);
    sh.f('uCloudAmount', this.sky.clouds);
    this._bindEnv(sh);
    // Drawn at the far plane after opaque geometry: no overdraw, and the
    // depth test rejects every pixel the world already covers.
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    this.fullscreen.draw();
    gl.depthMask(true);
    this.stats.draws++;
  }

  /* ---------------- fluid ---------------- */

  renderFluid(fluid, camera) {
    if (!fluid || !fluid.count) return;
    const gl = this.gl;

    // 1. Particle spheres into a view-depth buffer, occluded by the scene.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.hdrA.handle);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fluidDepth.handle);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fluidDepth.handle);
    gl.viewport(0, 0, this.fluidDepth.width, this.fluidDepth.height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    const dsh = this.program('fluidDepth', GLSL.fluidDepthVert, GLSL.fluidDepthFrag).use();
    dsh.m4('uViewProj', camera.viewProj);
    dsh.m4('uView', camera.view);
    dsh.m4('uProj', camera.proj);
    dsh.v3('uCameraRight', camera.right);
    dsh.v3('uCameraUp', camera.trueUp);
    fluid.drawParticles();
    this.stats.draws++;

    // 2. Thickness, accumulated additively with depth testing off so
    //    every particle along the ray contributes.
    this.fluidThick.bind(true, 0, 0, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const tsh = this.program('fluidThick', GLSL.fluidThickVert, GLSL.fluidThickFrag).use();
    tsh.m4('uViewProj', camera.viewProj);
    tsh.v3('uCameraRight', camera.right);
    tsh.v3('uCameraUp', camera.trueUp);
    fluid.drawParticles();
    gl.disable(gl.BLEND);
    this.stats.draws++;

    // 3. Bilateral blur, separable.
    const bsh = this.program('fluidBlur', FULLSCREEN_VS, GLSL.fluidBlurFrag);
    const passes = [
      { src: this.fluidDepth.color, dst: this.fluidBlurA, dir: [1, 0] },
      { src: this.fluidBlurA.color, dst: this.fluidBlurB, dir: [0, 1] },
    ];
    for (const p of passes) {
      p.dst.bind(true, 0, 0, 0, 0);
      bsh.use();
      bsh.tex('uDepthTex', p.src);
      bsh.v2('uTexel', 1 / p.dst.width, 1 / p.dst.height);
      bsh.v2('uDir', p.dir[0], p.dir[1]);
      // Wide enough that adjacent particles fuse into one surface. Too small
      // and a settled pool still reads as a heap of individual spheres.
      bsh.f('uRadius', 1.7);
      this.fullscreen.draw();
      this.stats.draws++;
    }

    // 4. Shade into hdrB reading hdrA, then blit the result back so later
    //    passes keep working against a single scene target.
    this.hdrB.bind(false);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.DEPTH_TEST);
    const ssh = this.program('fluidShade', FULLSCREEN_VS, GLSL.fluidShadeFrag).use();
    ssh.tex('uDepthTex', this.fluidBlurB.color);
    ssh.tex('uSceneTex', this.hdrA.color);
    ssh.tex('uThickTex', this.fluidThick.color);
    ssh.m4('uInvProj', camera.invProj);
    ssh.m4('uInvView', camera.invView);
    ssh.v2('uTexel', 1 / this.fluidBlurB.width, 1 / this.fluidBlurB.height);
    ssh.v3('uCameraPos', camera.position);
    ssh.v3('uWaterColor', this.water.color);
    ssh.v3('uDeepColor', this.water.deep);
    this._bindEnv(ssh);
    this.fullscreen.draw();
    this.stats.draws++;

    /* A BLIT DOES NOT GO THROUGH A SHADER. It copies attachment for
       attachment, so without the mask down this pastes the water's
       shaded colour straight into the normal buffer and every
       screen-space effect downstream reflects off the sea. */
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.hdrB.handle);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.hdrA.handle);
    this._sceneTargets(false);
    gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdrA.handle);
    gl.viewport(0, 0, this.width, this.height);
    gl.enable(gl.DEPTH_TEST);
  }

  /* ---------------- particles ---------------- */

  renderParticles(system, camera) {
    if (!system || !system.count) return;
    const gl = this.gl;
    this.hdrA.bind(false);
    /* Blending applies to EVERY enabled draw buffer, so an unmasked
       puff of smoke would alpha-blend its colour over the normals
       underneath it. */
    this._sceneTargets(false);
    gl.viewport(0, 0, this.width, this.height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    // Premultiplied alpha: one blend mode covers both additive sparks and
    // occluding smoke, chosen per-particle by its alpha.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const sh = this.program('particle', GLSL.particleVert, GLSL.particleFrag).use();
    sh.m4('uViewProj', camera.viewProj);
    sh.v3('uCameraRight', camera.right);
    sh.v3('uCameraUp', camera.trueUp);
    sh.f('uTime', this.time);
    system.draw();
    this.stats.draws++;
    gl.disable(gl.BLEND);
    gl.depthMask(true);
  }

  /* ================================================================
     SCREEN-SPACE REFLECTIONS  (feature 1 — every uniform is uSsr*)
     ================================================================
     Four draws at ultra and none anywhere else: a half-resolution
     perspective-correct trace against the depth buffer, two separable
     cone-blur passes ping-ponged between ssrA and ssrB exactly the way
     the SSAO blur ping-pongs aoA and aoB, and one full-resolution fold
     that pays the environment term back and adds the reflection.

     WHAT THIS BUYS. Every glossy surface in the game currently reflects
     an analytic two-colour sky gradient with a dot in it, indoors as
     well as out. Wet concrete, a puddle, a tiled floor, a countertop, a
     pane of glass and a blued receiver all reflect a sky they may not
     even be able to see, and never the crate standing on them -- which
     is why objects in this renderer look like they are hovering over a
     surface rather than sitting on it. */

  /* Allocated on demand and freed again when the tier drops, rather
     than in _initTargets. Two reasons. Ultra is the only tier that
     turns this on, and it is reachable only by an explicit setQuality,
     so allocating two half-resolution RGBA16F targets at boot would be
     memory every other tier pays and never uses. And doing it here
     instead means setQuality() needs no edit at all, which matters when
     nine features are landing on that one method in parallel.

     Nothing is lost by not proving the format at boot: RGBA16F support
     is already proven by hdrA, which this gates on through
     this.gbuffer. */
  _ensureSsrTargets() {
    const want = !!(this.quality.ssr && this.gbuffer && this.floatBuffers
      && this.width >= 2 && this.height >= 2);
    if (!want) {
      if (this.ssrA) { this.ssrA.dispose(); this.ssrA = null; }
      if (this.ssrB) { this.ssrB.dispose(); this.ssrB = null; }
      return false;
    }
    /* Half resolution, by exactly the aoA/aoB rule. The reflection is
       blurred by roughness on its way out and folded back through a
       depth-aware upsample, so the half that is thrown away is half the
       pass would have thrown away anyway -- and at the ultra render
       scale of 1.85 a full-resolution RGBA16F pair is 113 MB. */
    const w = Math.max(2, this.width >> 1), h = Math.max(2, this.height >> 1);
    if (!this.ssrA) {
      const gl = this.gl;
      const spec = { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
      this.ssrA = new Framebuffer(gl, { width: w, height: h, colors: [spec], depth: false });
      this.ssrB = new Framebuffer(gl, { width: w, height: h, colors: [spec], depth: false });
    } else {
      this.ssrA.resize(w, h);
      this.ssrB.resize(w, h);
    }
    return true;
  }

  /* The shared frame data these three programs read.
     Contract RULE 2 reserves uGBufferTex and uSceneDepth for the
     plumbing owner's _bindFrame(), so that is used whenever it exists.
     The fallback binds the same two names to the same two textures, so
     this feature works against the two-attachment G-buffer in the tree
     today as well as against the three-attachment one the contract
     specifies -- in both, colors[1] is the normal/roughness target. */
  _bindSsrFrame(sh) {
    if (this._bindFrame) { this._bindFrame(sh); return; }
    sh.tex('uGBufferTex', this.hdrA.colors[1] || null);
    sh.tex('uSceneDepth', this.hdrA.depthTexture);
  }

  /* Returns the texture holding the blurred reflection, or null when
     the pass did not run. Ping-pongs A -> B -> A, so the result is in
     ssrA; ssrB is the scratch between the two separable halves. */
  _renderSsr() {
    const cam = this.camera;
    if (!cam || !this.hdrA.depthTexture) return null;
    if (!this._ensureSsrTargets()) return null;

    const S = this.ssr;
    const w = this.ssrA.width, h = this.ssrA.height;
    const pe = cam.proj.e;
    /* The march loop is written with a constant bound of 64 and a break,
       which is the form ANGLE compiles without complaint -- the same
       shape as the SSAO loop's cap of 32. Clamping here as well means a
       tier asking for 100 gets 64 rather than silently getting 64. */
    const steps = Math.max(4, Math.min(64, this.quality.ssrSteps || 16));

    const tr = this.program('ssr', FULLSCREEN_VS, GLSL.ssrFrag).use();
    this.ssrA.bind(true, 0, 0, 0, 0);
    this._bindSsrFrame(tr);
    tr.tex('uSsrSceneTex', this.hdrA.color);
    tr.m4('uProj', cam.proj);
    tr.m4('uInvProj', cam.invProj);
    tr.v2('uSsrTexel', 1 / w, 1 / h);
    /* The two projection entries that turn a depth sample into a view
       z in one divide. The march does this once per step plus five more
       in the refinement, and a mat4 multiply there is 16 multiplies it
       does not need to do. */
    tr.v2('uSsrZParams', pe[10], pe[14]);
    tr.i('uSsrSteps', steps);
    tr.f('uSsrNear', cam.near);
    tr.f('uSsrMaxDistance', S.maxDistance);
    /* Cap the SCREEN travel as well as the world distance. A ray running
       flat along a floor covers the whole frame, and spending 28 steps
       on that is a stride wide enough to miss anything thinner than a
       car. 0.8 of the smaller dimension is most of a frame and still
       leaves the stride sub-30 texels at ultra. */
    tr.f('uSsrMaxTexels', Math.min(w, h) * 0.8);
    tr.f('uSsrThickness', S.thickness);
    tr.f('uSsrEdgeFade', S.edgeFade);
    tr.f('uSsrRoughCut', S.roughCut);
    tr.f('uSsrRoughMax', S.roughMax);
    /* Zero unless TAA is running. Animating the dither without a
       temporal filter to resolve it trades a static stair-step for a
       crawling one, which is strictly worse to look at. */
    tr.f('uSsrJitter', this.quality.taa ? ((this.frameIndex || 0) % 8) * 5.588 : 0);
    this.fullscreen.draw();
    this.stats.draws++;

    /* The cone blur. uSsrConeScale is half-resolution pixels per radian
       of cone half-angle -- see the derivation in GLSL.ssrBlurFrag for
       why the hit distance cancels and the radius is purely angular.
       uSsrMaxStride is what stops thirteen taps from being spread so
       far apart that they alias; deriving the radius ceiling from it
       means the two cannot drift out of agreement. */
    const maxStride = Math.max(1.5, h * 0.016);
    const coneScale = h / Math.max(cam.fov, 1e-3);
    const bl = this.program('ssrBlur', FULLSCREEN_VS, GLSL.ssrBlurFrag);
    for (const [src, dst, dx, dy] of [[this.ssrA, this.ssrB, 1, 0], [this.ssrB, this.ssrA, 0, 1]]) {
      bl.use();
      dst.bind(true, 0, 0, 0, 0);
      this._bindSsrFrame(bl);
      bl.tex('uSsrTex', src.color);
      bl.v2('uSsrTexel', 1 / src.width, 1 / src.height);
      bl.v2('uSsrDir', dx, dy);
      bl.v2('uSsrZParams', pe[10], pe[14]);
      bl.f('uSsrConeScale', coneScale);
      bl.f('uSsrConeMax', maxStride * 6.0);
      bl.f('uSsrMaxStride', maxStride);
      this.fullscreen.draw();
      this.stats.draws++;
    }
    if (this.stats.passes) this.stats.passes.ssr = (this.stats.passes.ssr || 0) + 1;
    return this.ssrA.color;
  }

  /* ONE full-resolution pass, hdrA.color -> hdrB.color.
     hdrB is already a full-resolution RGBA16F target that the pipeline
     pays for and that is dead by this point in the frame -- the fluid
     shading finished with it and blitted it back before present() was
     called -- so the most expensive new pass in the chain costs no new
     memory at all.

     THIS IS ALSO THE PASS FEATURES 4 AND 9 FOLD INTO. The contract's
     pass order puts volumetrics and GTAO specular occlusion through the
     same resolve, and a second _applyScreenSpace defined in this class
     body would silently replace this one rather than collide. Both have
     a named, zero-strength hook in GLSL.screenSpaceFrag and two bind
     lines below; fill those in, do not write another method.

     Feature 9 additionally has to MOVE the AO block to the top of
     present() before its bent normals are current in this pass. SSR
     does not read AO, so it is left where it is for now. */
  _applyScreenSpace(ssrTex) {
    const cam = this.camera;
    if (!cam) return null;
    const volOn = !!(this.quality.volumetric && this.volB);
    const bentOn = !!(this.quality.gtao && this.bentA);
    if (!ssrTex && !volOn && !bentOn) return null;

    /* The contract's pass order asks for the mask down here. hdrB has
       one attachment so its own draw-buffer state is already right;
       this is for the frame's bookkeeping, and it is what renderScene
       raises again next frame. */
    if (this._sceneTargets) this._sceneTargets(false);

    const S = this.ssr;
    const pe = cam.proj.e;
    const hw = this.ssrA ? this.ssrA.width : Math.max(2, this.width >> 1);
    const hh = this.ssrA ? this.ssrA.height : Math.max(2, this.height >> 1);

    const sh = this.program('screenSpace', FULLSCREEN_VS, GLSL.screenSpaceFrag).use();
    /* No clear. Every return path in the shader writes outColor, so the
       target is fully covered, and this is the one full-resolution
       RGBA16F clear in the chain worth not paying for. */
    this.hdrB.bind(false);
    this._bindSsrFrame(sh);
    /* The sky uniforms, for the fallback the fold pays back and for the
       environment a missed ray keeps. _bindEnv is the single binding
       site for all of them and it already serves three other programs. */
    this._bindEnv(sh);
    sh.tex('uSsrSceneTex', this.hdrA.color);
    sh.m4('uInvProj', cam.invProj);
    sh.m4('uInvView', cam.invView);
    sh.v2('uSsrZParams', pe[10], pe[14]);
    sh.v2('uSsrTexel', 1 / hw, 1 / hh);
    sh.tex('uSsrTex', ssrTex || this.hdrA.color);
    /* Zero when the trace did not run, which is also when uSsrTex is
       bound to a fallback whose alpha is not a confidence. The shader
       skips its whole SSR half on this, so the fallback is never read. */
    sh.f('uSsrIntensity', ssrTex ? S.intensity : 0);
    sh.f('uSsrReplace', S.replace);
    /* pbrFrag attenuates its environment specular by
       mix(skyVis, 1.0, 0.25) where skyVis = mix(1 - occlusion, 1, shadow).
       This pass cannot see the shadow term, so it binds the MIDPOINT of
       that range: at the default occlusion of 0.45 the true value runs
       0.663 to 1.0 and this is 0.831. The residual is what ssr.replace
       is under 1.0 for. */
    sh.f('uSsrEnvVis', 1.0 - 0.375 * this.sky.occlusion);
    sh.f('uSsrClamp', S.clamp);
    sh.f('uSsrMaxDarken', S.maxDarken);
    /* ---- HOOKS: FEATURES 4 AND 9 ----
       Both samplers are ACTIVE uniforms (they sit inside a branch, so
       the compiler keeps them), and tex() silently no-ops on a null
       texture -- which would leave the sampler pointed at whatever unit
       zero happens to hold. They are therefore always bound to
       something, exactly the `|| this.hdrA.color` idiom the composite
       already uses for its unused bloom levels. */
    sh.tex('uVolTex', (volOn && this.volB.color) || this.hdrA.color);
    sh.f('uVolStrength', volOn ? (this.quality.volStrength || 1) : 0);
    sh.tex('uGtaoBentTex', (bentOn && this.bentA.color) || this.hdrA.color);
    sh.f('uGtaoSpecOcc', bentOn ? (this.quality.gtaoSpecOcc || 1) : 0);
    /* ---- END HOOKS ---- */
    this.fullscreen.draw();
    this.stats.draws++;
    if (this.stats.passes) this.stats.passes.resolve = (this.stats.passes.resolve || 0) + 1;
    return this.hdrB.color;
  }

  /* ---------------- post ---------------- */

  present() {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    /* ---- SCREEN-SPACE REFLECTIONS, AND THE FOLD THAT LANDS THEM ----
     *
     * Everything downstream now reads this._sceneTex instead of
     * hdrA.color, so a pass that produces a new version of the scene --
     * this one now, TAA later -- only has to reassign it and the bloom
     * and composite need no further edits. When no such pass runs,
     * _sceneTex IS hdrA.color and the frame is bit-identical to the one
     * this renderer produced before the feature existed.
     *
     * Bloom therefore reads the reflected image, which is deliberate: a
     * bright reflection in a puddle should bloom, and the bright pass
     * reading the pre-fold buffer would be the one place the reflection
     * silently did not exist.
     *
     * The gate is written to include volumetrics and GTAO as well, so
     * features 4 and 9 need no edit to present() at all. */
    this._sceneTex = this.hdrA.color;
    if ((this.quality.ssr && this.gbuffer)
        || (this.quality.volumetric && this.volB)
        || (this.quality.gtao && this.bentA)) {
      const folded = this._applyScreenSpace(this._renderSsr());
      if (folded) this._sceneTex = folded;
    }

    let bloom0 = null, bloom1 = null, bloom2 = null;
    const iters = Math.min(this.quality.bloomIters, this.bloomChain.length);
    if (this.quality.bloom && this.post.bloom > 0 && iters > 0) {
      const bright = this.program('bright', FULLSCREEN_VS, GLSL.brightFrag).use();
      this.bloomChain[0].a.bind(true, 0, 0, 0, 1);
      bright.tex('uTex', this._sceneTex || this.hdrA.color);
      bright.f('uThreshold', this.post.bloomThreshold);
      bright.f('uSoftKnee', 0.6);
      this.fullscreen.draw();

      const blur = this.program('blur', FULLSCREEN_VS, GLSL.blurFrag);
      let src = this.bloomChain[0].a;
      const results = [];
      for (let i = 0; i < iters; i++) {
        const lvl = this.bloomChain[i];
        if (i > 0) {
          // Downsample by copying into the smaller level first.
          const copy = this.program('copy', FULLSCREEN_VS, GLSL.copyFrag).use();
          lvl.a.bind(true, 0, 0, 0, 1);
          copy.tex('uTex', src.color);
          this.fullscreen.draw();
        }
        blur.use();
        lvl.b.bind(true, 0, 0, 0, 1);
        blur.tex('uTex', lvl.a.color);
        blur.v2('uTexel', 1 / lvl.a.width, 1 / lvl.a.height);
        blur.v2('uDir', 1, 0);
        this.fullscreen.draw();

        blur.use();
        lvl.a.bind(true, 0, 0, 0, 1);
        blur.tex('uTex', lvl.b.color);
        blur.v2('uTexel', 1 / lvl.b.width, 1 / lvl.b.height);
        blur.v2('uDir', 0, 1);
        this.fullscreen.draw();

        results.push(lvl.a.color);
        src = lvl.a;
      }
      bloom0 = results[0];
      bloom1 = results[1] || results[0];
      bloom2 = results[2] || bloom1;
      this.stats.draws += iters * 3;
    }

    /* Ambient occlusion, before the composite so it can be multiplied
       into the light. Half resolution, then two separated blurs that
       refuse to cross a depth edge. */
    let aoTex = null;
    if (this.quality.ssao > 0 && this.quality.ssaoSamples > 0
        && this.hdrA.depthTexture && this.camera) {
      const ssao = this.program('ssao', FULLSCREEN_VS, GLSL.ssaoFrag).use();
      this.aoA.bind(true, 1, 1, 1, 1);
      ssao.tex('uDepth', this.hdrA.depthTexture);
      // The camera already keeps both, updated once per frame.
      /* present() runs after renderScene, which stashes the camera on
         the renderer -- there is no camera argument in this scope, and
         reaching for one threw on the first ultra frame. */
      ssao.m4('uInvProj', this.camera.invProj);
      ssao.m4('uProj', this.camera.proj);
      ssao.v2('uTexel', 1 / this.aoA.width, 1 / this.aoA.height);
      ssao.f('uRadius', this.quality.ssaoRadius || 0.6);
      ssao.f('uBias', 0.10);
      /* A FLOOR, because this AO multiplies the whole of the light and
         not just the ambient part of it. At intensity 2.9 the term
         saturates to zero wherever geometry is dense -- and a pile of
         rubble is the densest geometry the game ever makes, so the pile
         came out black even in full sun. Screen-space occlusion has no
         business removing direct sunlight; the floor caps how much of
         the picture it is allowed to take. */
      ssao.f('uAoFloor', this.quality.ssaoFloor != null ? this.quality.ssaoFloor : 0.30);
      ssao.f('uIntensity', 2.9);
      ssao.i('uSamples', this.quality.ssaoSamples | 0);
      ssao.f('uTime', this.time);
      this.fullscreen.draw();

      const ab = this.program('ssaoBlur', FULLSCREEN_VS, GLSL.ssaoBlurFrag);
      for (const [src2, dst, dx, dy] of [[this.aoA, this.aoB, 1, 0], [this.aoB, this.aoA, 0, 1]]) {
        ab.use();
        dst.bind(true, 1, 1, 1, 1);
        ab.tex('uTex', src2.color);
        ab.tex('uDepth', this.hdrA.depthTexture);
        ab.v2('uTexel', 1 / src2.width, 1 / src2.height);
        ab.v2('uDir', dx, dy);
        this.fullscreen.draw();
      }
      aoTex = this.aoA.color;
      this.stats.draws += 3;
    }

    /* ---- SCREEN-SPACE CONTACT SHADOWS ----
     *
     * One half-resolution draw: read the blurred occlusion out of aoA,
     * multiply a short sun-direction ray march into it, leave the result
     * in aoB. aoTex then points at aoB and the composite is untouched --
     * uAo and uAoStrength keep meaning exactly what they meant before,
     * which is what graphics.test.js, interior.test.js and
     * underside.test.js all read the frame through.
     *
     * IT RIDES ON THE AO PASS ON PURPOSE. Gating on aoTex rather than
     * standing alone means it is off wherever AO is off -- including
     * underside.test.js:106, which zeroes quality.ssao specifically to
     * isolate the ambient term, and graphics.test.js:104, which zeroes it
     * to measure AO's own contribution. A contact term still running in
     * those two would be measured as ambient and reported as a
     * regression in something nobody had touched. */
    if (this.quality.contactShadow && aoTex && this.camera && this.hdrA.depthTexture) {
      const S = this.shadows;
      const cs = this.program('contact', FULLSCREEN_VS, GLSL.contactFrag).use();
      this.aoB.bind(true, 1, 1, 1, 1);
      /* sun.direction points AT the sun and is a direction, so only the
         view matrix's rotation applies -- applyMat4Dir drops the
         translation. Renormalised because a view matrix built by lookAt
         is orthonormal in theory and drifts in practice. */
      const Lv = this._contactSunView.copy(this.sun.direction)
        .applyMat4Dir(this.camera.view).normalize();
      cs.tex('uContactDepth', this.hdrA.depthTexture);
      cs.tex('uContactAo', aoTex);
      cs.m4('uContactInvProj', this.camera.invProj);
      cs.m4('uContactProj', this.camera.proj);
      cs.v3('uContactLightView', Lv);
      cs.v2('uContactTexel', 1 / this.aoB.width, 1 / this.aoB.height);
      cs.f('uContactLength', S.contactLength);
      cs.f('uContactMaxPixels', S.contactMaxPixels);
      cs.f('uContactThickness', S.contactThickness);
      cs.f('uContactBias', S.contactBias);
      cs.f('uContactStrength', S.enabled ? S.contactStrength : 0);
      cs.f('uContactFade', S.contactFade);
      cs.i('uContactSteps', Math.max(1, Math.min(32, this.quality.contactSteps || 8)));
      this.fullscreen.draw();
      aoTex = this.aoB.color;
      this.stats.draws++;
      if (this.stats.passes) this.stats.passes.contact = (this.stats.passes.contact || 0) + 1;
    }

    const useFxaa = this.quality.fxaa;
    const target = useFxaa ? this.ldr : null;
    if (target) target.bind(true, 0, 0, 0, 1);
    else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
    }

    const comp = this.program('composite', FULLSCREEN_VS, GLSL.compositeFrag).use();
    comp.tex('uScene', this._sceneTex || this.hdrA.color);
    comp.tex('uBloom0', bloom0 || this.hdrA.color);
    comp.tex('uBloom1', bloom1 || this.hdrA.color);
    comp.tex('uBloom2', bloom2 || this.hdrA.color);
    comp.f('uBloomStrength', bloom0 ? this.post.bloom : 0);
    comp.f('uExposure', this.post.exposure);
    /* The tonemapper, and its look. Bound explicitly rather than left to
       default, because a uniform this renderer never sets reads as zero
       -- and zero here would be the old ACES curve with an AgX punch of
       nothing, which is a picture nobody chose. */
    comp.i('uToneMap', this.post.toneMap === 'aces' ? 0 : 1);
    comp.f('uAgxPunch', this.post.agxPunch != null ? this.post.agxPunch : 1.0);
    comp.f('uAgxSat', this.post.agxSat != null ? this.post.agxSat : 1.0);
    comp.f('uVignette', this.post.vignette);
    comp.f('uChromatic', this.post.chromatic);
    comp.f('uSaturation', this.post.saturation);
    comp.f('uContrast', this.post.contrast);
    comp.f('uGrain', this.post.grain);
    const tn = this.post.tint || [1, 1, 1];
    comp.v3f('uTint', tn[0], tn[1], tn[2]);
    comp.f('uTintMix', this.post.tintMix || 0);
    comp.f('uTime', this.time);
    comp.f('uSharpen', this.quality.sharpen || 0);
    comp.f('uPosterize', this.quality.posterize || 0);
    comp.v2('uTexel', 1 / this.width, 1 / this.height);
    comp.tex('uAo', aoTex || this.hdrA.color);
    comp.f('uAoStrength', aoTex ? this.quality.ssao : 0);
    this.fullscreen.draw();
    this.stats.draws++;

    if (useFxaa) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
      const fx = this.program('fxaa', FULLSCREEN_VS, GLSL.fxaaFrag).use();
      fx.tex('uTex', this.ldr.color);
      fx.v2('uTexel', 1 / this.width, 1 / this.height);
      this.fullscreen.draw();
      this.stats.draws++;
    }
  }

  /* ---------------- environment probe ---------------- */

  /* WHAT THIS PASS IS FOR.
   *
     Ambient specular was one call to skyRadiance() along the reflection
     vector, lerped toward a flat hemisphere constant by rough*rough.
     Nothing in the world appeared in any reflection, roughness did not
     blur anything, and indoors a metal reflected a sky it could not
     see. This bakes skyRadiance() into a small cubemap, runs a GGX
     roughness prefilter down its mip chain, integrates the split-sum
     BRDF into a table once, and projects the same sky onto nine
     spherical harmonics for the diffuse half.

     COST CONTROL IS THE WHOLE DESIGN. The bake is amortised at ONE MIP
     LEVEL PER FRAME (six faces), so a rebake is envLevels+1 frames --
     7 at envRes 32, 9 at 128, 10 at 256, i.e. about a sixth of a second
     at 60 fps and always inside the 20 frames photoreal.test.js runs.
     It only happens when the sky actually changed: the state is hashed
     rather than flagged, because setSky and setTimeOfDay both mutate
     the renderer's Vec3s in place with no event, and bunker-nine writes
     renderer.sky.intensity directly, which no flag in setSky would ever
     catch. The hash is only re-read when the previous bake has
     finished, so a day/night cycle that moves the sun every frame
     rebakes the whole chain every envLevels+1 frames instead of
     restarting mip 0 for ever.

     Called from the top of renderScene so both Engine.step and
     Engine.renderFrom reach it -- interior.test.js and density.test.js
     render exclusively through renderFrom and would otherwise never
     have a probe at all. */
  /* batches and camera are the main frame's, and are used only to decide
     WHERE the probe sits and to reach the Engine's actor list through
     probeBatches. A renderer driven without an Engine passes neither and
     gets the sky-only bake, which is what it had before. */
  renderEnv(batches, camera) {
    const gl = this.gl;
    const want = this.quality.env ? Math.max(8, this.quality.envRes || 64) : 0;
    if (!want) {
      if (this.envCube) this._disposeEnv();
      return;
    }
    if (!this.envCube || this.envRes !== want) {
      this._disposeEnv();
      this._initEnv(want);
    }

    /* WHERE THE PROBE WANTS TO BE: on the camera, snapped to a grid.
       Snapping is the whole rebake policy. Un-snapped, the hash would
       change every frame the player moved a millimetre and the cube
       would never finish a cycle; at this step it rebakes after a few
       paces and holds still otherwise. Three metres is about a room, and
       the error it leaves is a reflection that is slightly stale in
       parallax -- which, blurred by roughness across a 128-pixel face,
       is not a thing anyone can see. */
    if (this._envSceneFaces() > 1 && camera) {
      const q = 3;
      const cp = camera.position;
      this._envWantAt = [
        Math.round(cp.x / q) * q,
        Math.round(cp.y / q) * q,
        Math.round(cp.z / q) * q,
      ];
    } else {
      this._envWantAt = null;
    }

    /* The probe passes are fullscreen triangles into a target with no
       depth attachment. DEPTH_TEST is harmless there but depthMask is
       not: renderScene's hdrA.bind(true, ...) clears DEPTH immediately
       after this returns, and a depth clear is masked by depthMask. So
       both are restored on every path out of here. */
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(false);

    if (!this._brdfLutBaked) {
      this.program('envBrdf', FULLSCREEN_VS, GLSL.envBrdfFrag).use();
      this.envFbo.attach(this.brdfLut, { level: 0, width: 128, height: 128 });
      this.fullscreen.draw();
      this.envFbo.detach();
      this._brdfLutBaked = true;
      this.stats.draws++;
      if (this.stats.passes) this.stats.passes.env++;
    }

    if (this._envJob >= this._envJobs) {
      const h = this._envHashState();
      if (h === this._envHash) {
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        return;
      }
      this._envHash = h;
      this._envJob = 0;
      /* Recomputed per cycle, not once in _initEnv: the tier can change
         under setQuality and a scene bake is six jobs where a sky bake
         is one. Getting this stale runs the prefilter over a half-baked
         source, or skips mips entirely. */
      this._envJobs = this._envSceneFaces() + this.envLevels;
      // Where this cube is being baked from, fixed for the whole cycle.
      if (this._envSceneFaces() > 1 && this._envWantAt) {
        this._envAt = this._envWantAt.slice();
      }
      // The diffuse half is CPU-side and costs nothing, so it is ready
      // on the frame the sky changed rather than levels frames later.
      this._bakeEnvSh();
    }

    const faces = this._envSceneFaces();
    const job = this._envJob++;
    if (job < faces) {
      if (faces === 1) this._bakeEnvSource();
      else this._bakeEnvSceneFace(job, batches, camera);
    } else {
      this._prefilterEnvLevel(job - faces);
    }
    /* Once true it stays true. A later rebake overwrites the cube in
       place, which reads as a reflection settling over a few frames --
       far better than popping back to the analytic sky and in again. */
    if (this._envJob >= this._envJobs) this._envReady = true;

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  /* Everything the bake depends on, quantised to a thousandth so float
     noise cannot retrigger it. sky.clouds is deliberately absent --
     clouds live in skyFrag, not in skyRadiance, so they are not baked
     (see the note on renderEnv's scope). sky.room and sky.occlusion are
     absent because they are applied at shading time, not in the cube. */
  _envHashState() {
    const s = this.sky;
    const u = this.sun;
    let h = 2166136261;
    const push = (v) => {
      h = Math.imul(h ^ (Math.round(v * 1000) | 0), 16777619);
    };
    push(u.direction.x); push(u.direction.y); push(u.direction.z);
    push(u.color.x); push(u.color.y); push(u.color.z);
    push(u.intensity);
    push(s.zenith.x); push(s.zenith.y); push(s.zenith.z);
    push(s.horizon.x); push(s.horizon.y); push(s.horizon.z);
    push(s.ground.x); push(s.ground.y); push(s.ground.z);
    push(s.intensity); push(s.bounce);
    /* AND WHERE THE PROBE STANDS, when it is baking the scene. A sky
       cube is the same from everywhere, so the sky-only bake depends on
       nothing but the sky and runs once. A cube of the WORLD is only
       right near the point it was baked from, so walking away from it
       has to retrigger it -- and the quantised position going into the
       hash is what does that, with no separate timer or dirty flag.

       Quantised to the step in _envWantAt, so standing still cannot
       rebake and walking a few metres must. */
    if (this._envWantAt) {
      push(this._envWantAt[0]); push(this._envWantAt[1]); push(this._envWantAt[2]);
    }
    return h | 0;
  }

  _initEnv(res) {
    const gl = this.gl;
    /* Half-float when the context has EXT_color_buffer_float, RGBA8
       otherwise -- the same rule _hdrSpec follows. On the 8-bit path the
       sky clips at 1.0, which costs the Mie halo its punch in
       reflections and costs nothing else, because the one genuinely
       HDR thing in this sky (the sun disc, ~74 linear at the noon
       preset) is not baked in the first place. */
    const fmt = this.floatBuffers ? gl.RGBA16F : gl.RGBA8;
    const type = this.floatBuffers ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    this.envSource = new Texture(gl, {
      cube: true, internalFormat: fmt, format: gl.RGBA, type: type,
      wrap: gl.CLAMP_TO_EDGE, mips: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR,
    });
    this.envSource.alloc(res, res);
    this.envCube = new Texture(gl, {
      cube: true, internalFormat: fmt, format: gl.RGBA, type: type,
      wrap: gl.CLAMP_TO_EDGE, mips: true,
    });
    /* allocMips, not alloc. A cube with only level 0 and the
       LINEAR_MIPMAP_LINEAR filter that mips:true selects is MIP
       INCOMPLETE, and WebGL does not warn -- it samples black, on every
       face, for ever. */
    this.envLevels = this.envCube.allocMips(res);
    this.envFbo = new Framebuffer(gl, {
      width: 1, height: 1,
      colors: [{ internalFormat: fmt, format: gl.RGBA, type: type }],
      depth: false,
    });
    const lutFmt = this.floatBuffers ? gl.RG16F : gl.RG8;
    const lutType = this.floatBuffers ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    this.brdfLut = new Texture(gl, {
      internalFormat: lutFmt, format: gl.RG, type: lutType,
      /* CLAMP_TO_EDGE is not optional. REPEAT wraps grazing NoV round to
         zero and puts a bright rim on every silhouette in the game. */
      wrap: gl.CLAMP_TO_EDGE, mips: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR,
    });
    this.brdfLut.alloc(128, 128);
    /* Depth, only when the faces will hold real geometry. A cube of sky
       is six fullscreen triangles and needs none. */
    if (this.quality.envScene) {
      this._envDepth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this._envDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, res, res);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    }
    this.envRes = res;
    // One frame for the source, then one per mip level -- or six for the
    // source when the faces hold real geometry, which renderEnv
    // recomputes at the start of every cycle.
    this._envJobs = 1 + this.envLevels;
    /* STARTED AT THE END, so the very first renderEnv falls into the
       cycle-start branch instead of past it. That branch is what stamps
       the hash, recomputes the job count for the tier, and fixes the
       point the scene faces are baked from -- skip it once and the first
       six jobs run with no probe position and quietly draw nothing. */
    this._envJob = this._envJobs;
    this._envHash = null;
    this._envReady = false;
    this._brdfLutBaked = false;
  }

  _disposeEnv() {
    if (this.envCube) this.envCube.dispose();
    if (this.envSource) this.envSource.dispose();
    if (this.brdfLut) this.brdfLut.dispose();
    if (this.envFbo) this.envFbo.dispose();
    if (this._envDepth) this.gl.deleteRenderbuffer(this._envDepth);
    this._envDepth = null;
    this._envAt = null;
    this.envCube = null;
    this.envSource = null;
    this.brdfLut = null;
    this.envFbo = null;
    this.envLevels = 0;
    this.envRes = 0;
    this._envJob = 0;
    this._envJobs = 0;
    this._envHash = null;
    this._envReady = false;
    this._brdfLutBaked = false;
  }

  /* Six faces of raw sky into envSource. One draw each, no sampling
     loop -- this is the cheap half of the bake. */
  /* Six when the tier bakes the scene and the Engine gave us a way to
     reach it, one when it is sky only. Everything else keys off this, so
     there is exactly one place that decides. */
  _envSceneFaces() {
    return (this.quality.envScene
      && typeof this.probeBatches === 'function' && this._envDepth) ? 6 : 1;
  }

  /* The camera for one cube face: ninety degrees, square, looking down
     the face's own axis.

     UP IS THE FACE'S +y BASIS, NOT WORLD UP, and it is not a free
     choice. _envFaces gives, for each face, the direction in which the
     texture coordinate t increases. A perspective render puts the
     camera's up vector at the TOP of the image, which is the highest
     gl_FragCoord.y, which for a render-to-texture is the last row, which
     is t = 1. So up must be exactly the basis the sampler will read
     along. Four of the six are (0,-1,0), which looks wrong and is the
     cube-map convention: get one row of that table wrong and a single
     face of every reflection in the game comes out mirrored. */
  _faceCamera(f) {
    if (!this._envCam) this._envCam = new Camera();
    const c = this._envCam, b = _envFaces[f], p = this._envAt;
    c.position.set(p[0], p[1], p[2]);
    c.target.set(p[0] + b.z[0], p[1] + b.z[1], p[2] + b.z[2]);
    c.up.set(b.y[0], b.y[1], b.y[2]);
    c.fov = Math.PI / 2;
    c.near = 0.05;
    c.far = Math.max(80, (this.quality.envSceneRange || 60) * 3);
    c.update(1);
    return c;
  }

  /* ONE FACE OF THE WORLD. Sky first as the background, then the opaque
     geometry over it with depth on.

     Transparent geometry is left out on purpose. It would need sorting
     against a camera it was not sorted for, it writes no depth, and a
     window in a reflection at 128 pixels across is worth less than the
     bug it would cost. */
  _bakeEnvSceneFace(f, batches, camera) {
    const gl = this.gl;
    const res = this.envRes;
    const b = _envFaces[f];
    if (!this._envAt) return;

    this.envFbo.attach(this.envSource, {
      face: f, level: 0, width: res, height: res, depth: this._envDepth,
    });

    /* Clear depth with the mask OPEN. glClear is masked by depthMask,
       so clearing after the sky pass has closed it silently does
       nothing and the face keeps the previous face's depth. */
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    const sky = this.program('envBake', FULLSCREEN_VS, GLSL.envBakeFrag).use();
    this._bindEnv(sky);
    sky.f('uEnvNoSunDisc', 1);
    sky.v3f('uEnvFaceX', b.x[0], b.x[1], b.x[2]);
    sky.v3f('uEnvFaceY', b.y[0], b.y[1], b.y[2]);
    sky.v3f('uEnvFaceZ', b.z[0], b.z[1], b.z[2]);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.fullscreen.draw();
    this.stats.draws++;

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, res, res);

    const cam = this._faceCamera(f);
    /* COLLECTED ONCE PER CYCLE, ON THE FIRST FACE, and reused for the
       other five. Two reasons, and the second is the important one.
       It is six times less work -- every collect walks the whole actor
       list. And the six faces then share ONE INSTANT: rebuilt per face
       they would be six frames apart, so anything moving would step
       between one face and the next and show a seam down the cube edge
       where the two meet. */
    if (f === 0 || !this._probeSnapshot) {
      const range = this.quality.envSceneRange || 60;
      try {
        this._probeSnapshot = this.probeBatches(
          this._envAt[0], this._envAt[1], this._envAt[2], range);
      } catch (e) {
        this._probeSnapshot = null;
      }
    }
    const list = this._probeSnapshot;
    if (list) {
      this._envBaking = true;
      for (const batch of list) {
        if (!batch.count || batch.material.transparent) continue;
        this._drawPbr(batch, cam);
      }
      this._envBaking = false;
    }

    this.envFbo.detach();
    if (this.stats.passes) this.stats.passes.env++;
  }

  _bakeEnvSource() {
    const sh = this.program('envBake', FULLSCREEN_VS, GLSL.envBakeFrag).use();
    this._bindEnv(sh);
    // The one draw in the engine that suppresses the sun disc.
    sh.f('uEnvNoSunDisc', 1);
    for (let f = 0; f < 6; f++) {
      const b = _envFaces[f];
      sh.v3f('uEnvFaceX', b.x[0], b.x[1], b.x[2]);
      sh.v3f('uEnvFaceY', b.y[0], b.y[1], b.y[2]);
      sh.v3f('uEnvFaceZ', b.z[0], b.z[1], b.z[2]);
      this.envFbo.attach(this.envSource, { face: f, level: 0, width: this.envRes, height: this.envRes });
      this.fullscreen.draw();
      this.stats.draws++;
    }
    this.envFbo.detach();
    if (this.stats.passes) this.stats.passes.env++;
  }

  /* One roughness level of the prefiltered cube, six faces. Level L is
     baked at roughness L/(levels-1), which is the mapping envRadiance
     inverts when it picks a LOD. */
  _prefilterEnvLevel(level) {
    const sh = this.program('envPrefilter', FULLSCREEN_VS, GLSL.envPrefilterFrag).use();
    sh.f('uEnvRough', level / Math.max(1, this.envLevels - 1));
    sh.i('uEnvSamples', Math.max(8, Math.min(64, this.quality.envSamples || 32)));
    sh.tex('uEnvSource', this.envSource);
    const size = Math.max(1, this.envRes >> level);
    for (let f = 0; f < 6; f++) {
      const b = _envFaces[f];
      sh.v3f('uEnvFaceX', b.x[0], b.x[1], b.x[2]);
      sh.v3f('uEnvFaceY', b.y[0], b.y[1], b.y[2]);
      sh.v3f('uEnvFaceZ', b.z[0], b.z[1], b.z[2]);
      /* attach() sets the viewport to THIS MIP's size. Getting that
         wrong renders a full-size image into a quarter-size level and
         every prefiltered roughness mip comes out as a crop of the
         sharp one. */
      this.envFbo.attach(this.envCube, { face: f, level: level, width: size, height: size });
      this.fullscreen.draw();
      this.stats.draws++;
    }
    this.envFbo.detach();
    if (this.stats.passes) this.stats.passes.env++;
  }

  /* THE DIFFUSE HALF, ON THE CPU.
   *
     Projecting the sky onto nine spherical harmonics is 1536 evaluations
     of a thirty-flop function -- well under a millisecond, once per sky
     change. Doing it on the GPU would mean a convolution pass and then a
     readback, and a readback is a pipeline stall. This is strictly
     cheaper and it is exact, because skyRadiance() is analytic and can
     simply be evaluated in JavaScript.

     The sample set is the six cube faces at 16x16 with the proper cube
     texel solid angle 4 / (N^2 * (1+s^2+t^2)^1.5), which sums to 4*PI
     over the six faces. The l-band cosine convolution weights (1, 2/3,
     1/4) and the 1/PI that turns irradiance into the average incident
     radiance skyIrradiance() returns are folded into the uploaded
     coefficients, so the shader is nine multiply-adds.

     The sun disc is left out here for the same reason it is left out of
     the cube: pbrFrag adds the sun analytically, with a shadow term. */
  _bakeEnvSh() {
    const N = 16;
    const L = new Float64Array(27);
    const c = _envRgb;
    for (let f = 0; f < 6; f++) {
      const b = _envFaces[f];
      for (let yi = 0; yi < N; yi++) {
        const t = ((yi + 0.5) / N) * 2 - 1;
        for (let xi = 0; xi < N; xi++) {
          const s = ((xi + 0.5) / N) * 2 - 1;
          let dx = b.z[0] + s * b.x[0] + t * b.y[0];
          let dy = b.z[1] + s * b.x[1] + t * b.y[1];
          let dz = b.z[2] + s * b.x[2] + t * b.y[2];
          const inv = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
          dx *= inv; dy *= inv; dz *= inv;
          const d2 = 1 + s * s + t * t;
          const dw = (4 / (N * N)) / (d2 * Math.sqrt(d2));
          this._skyRadianceJs(dx, dy, dz, c);
          const r = c[0] * dw, g = c[1] * dw, bl = c[2] * dw;
          let w = 0.282095;
          L[0] += r * w; L[1] += g * w; L[2] += bl * w;
          w = 0.488603 * dy;
          L[3] += r * w; L[4] += g * w; L[5] += bl * w;
          w = 0.488603 * dz;
          L[6] += r * w; L[7] += g * w; L[8] += bl * w;
          w = 0.488603 * dx;
          L[9] += r * w; L[10] += g * w; L[11] += bl * w;
          w = 1.092548 * dx * dy;
          L[12] += r * w; L[13] += g * w; L[14] += bl * w;
          w = 1.092548 * dy * dz;
          L[15] += r * w; L[16] += g * w; L[17] += bl * w;
          w = 0.315392 * (3 * dz * dz - 1);
          L[18] += r * w; L[19] += g * w; L[20] += bl * w;
          w = 1.092548 * dx * dz;
          L[21] += r * w; L[22] += g * w; L[23] += bl * w;
          w = 0.546274 * (dx * dx - dy * dy);
          L[24] += r * w; L[25] += g * w; L[26] += bl * w;
        }
      }
    }
    // A_l / PI, times the basis constant, folded per band.
    const K = [
      1.0 * 0.282095,
      0.6666667 * 0.488603, 0.6666667 * 0.488603, 0.6666667 * 0.488603,
      0.25 * 1.092548, 0.25 * 1.092548, 0.25 * 0.315392, 0.25 * 1.092548, 0.25 * 0.546274,
    ];
    for (let i = 0; i < 9; i++) {
      const k = K[i];
      this._envSh[i * 3] = L[i * 3] * k;
      this._envSh[i * 3 + 1] = L[i * 3 + 1] * k;
      this._envSh[i * 3 + 2] = L[i * 3 + 2] * k;
    }
  }

  /* skyRadiance() from GLSL.sky, line for line, minus the sun disc.
     THESE TWO MUST NOT DRIFT. If skyRadiance changes and this does not,
     the specular probe (baked on the GPU) and the diffuse probe
     (projected here) stop describing the same sky, and the symptom is a
     metal and the matte surface beside it disagreeing about what colour
     the day is. */
  _skyRadianceJs(dx, dy, dz, out) {
    const s = this.sky;
    const u = this.sun;
    const si = s.intensity;
    const k = Math.min(1, Math.max(0, dy * 1.6));
    let r = s.horizon.x + (s.zenith.x - s.horizon.x) * k;
    let g = s.horizon.y + (s.zenith.y - s.horizon.y) * k;
    let b = s.horizon.z + (s.zenith.z - s.horizon.z) * k;
    const lit = Math.max(u.direction.y, 0);
    const inv = 1 / Math.max(si, 1e-4);
    const gr = s.ground.x * (si + u.color.x * u.intensity * lit * s.bounce) * inv;
    const gg = s.ground.y * (si + u.color.y * u.intensity * lit * s.bounce) * inv;
    const gb = s.ground.z * (si + u.color.z * u.intensity * lit * s.bounce) * inv;
    let e = Math.min(1, Math.max(0, (dy + 0.28) / 0.34));
    e = e * e * (3 - 2 * e);
    r = gr + (r - gr) * e;
    g = gg + (g - gg) * e;
    b = gb + (b - gb) * e;
    const sd = Math.min(1, Math.max(0, dx * u.direction.x + dy * u.direction.y + dz * u.direction.z));
    const halo = Math.pow(sd, 12) * 0.35 + Math.pow(sd, 3) * 0.08;
    const hs = halo * u.intensity * 0.35;
    r += u.color.x * hs;
    g += u.color.y * hs;
    b += u.color.z * hs;
    // The disc (uSunColor * disc * uSunIntensity * 12.0) is omitted here,
    // exactly as uEnvNoSunDisc omits it on the GPU bake.
    out[0] = r * si;
    out[1] = g * si;
    out[2] = b * si;
    return out;
  }

  /* THE STAND-INS FOR "NO PROBE".
   *
     envBRDF and envRadiance branch on a uniform, so uEnvCube and
     uBrdfLut stay active in the linked program even on a tier that will
     never sample them -- and an active sampler nobody points anywhere
     reads texture unit 0, where uShadowMap0 already is. Two sampler
     types on one unit is GL_INVALID_OPERATION and the draw is dropped.
     Twenty-eight bytes of black texture is the entire fix, and they are
     deliberately textures of our own rather than any existing target,
     because a target that is also an attachment of the framebuffer
     being drawn into is the same error again. Built once, never
     disposed with the probe -- they are wanted exactly when it is not. */
  _envFallback() {
    if (this._envNull) return this._envNull;
    const gl = this.gl;
    const black = new Uint8Array([0, 0, 0, 255]);
    const cube = new Texture(gl, {
      cube: true, internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE,
      wrap: gl.CLAMP_TO_EDGE, mips: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR,
    });
    for (let f = 0; f < 6; f++) cube.uploadCubeFace(f, black, 1);
    cube.width = 1; cube.height = 1;
    const lut = new Texture(gl, {
      internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE,
      wrap: gl.CLAMP_TO_EDGE, mips: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR,
    });
    lut.upload(black, 1, 1);
    this._envNull = { cube: cube, lut: lut };
    return this._envNull;
  }
  beginFrame(dt) {
    this.time += dt;
    this.stats.draws = 0;
    this.stats.tris = 0;
    this.stats.instances = 0;
  }
}

const _shadowCorners = [];
for (let i = 0; i < 8; i++) _shadowCorners.push(new Vec3());
const _shadowView = new Mat4();
const _shadowViewInv = new Mat4();
const _shadowProj = new Mat4();
const _axisZ = new Vec3(0, 0, 1);
const _defaultWind = new Vec3(1, 0, 0.3).normalize();
/* THE OPENGL CUBE-FACE BASIS, AS A TABLE.
 *
   For each face: given the face's texture coordinates (s, t) in [0,1],
   the direction is z + (2s-1)*x + (2t-1)*y. These are the inverses of
   the major-axis rules in the GL spec's cube-map table -- which is why
   four of the six have y = (0,-1,0) and +Y's is (0,0,1). Getting one
   row wrong does not fail, it mirrors or rotates one face of every
   reflection in the game, so this is written out once and shared by the
   bake, the prefilter and the CPU-side spherical-harmonic projection.

   The fullscreen triangle's vUv (aPos*0.5+0.5) is exactly that (s, t):
   vUv.y = 0 is framebuffer row 0, which is cube face texel row 0, which
   is the spec's t = 0. */
const _envFaces = [
  { x: [0, 0, -1], y: [0, -1, 0], z: [1, 0, 0] },   // +X
  { x: [0, 0, 1], y: [0, -1, 0], z: [-1, 0, 0] },   // -X
  { x: [1, 0, 0], y: [0, 0, 1], z: [0, 1, 0] },     // +Y
  { x: [1, 0, 0], y: [0, 0, -1], z: [0, -1, 0] },   // -Y
  { x: [1, 0, 0], y: [0, -1, 0], z: [0, 0, 1] },    // +Z
  { x: [-1, 0, 0], y: [0, -1, 0], z: [0, 0, -1] },  // -Z
];
const _envRgb = [0, 0, 0];
