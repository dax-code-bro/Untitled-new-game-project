// Ported from engine/src/50-shaders.js GLSL.shadow (GLSL ES 3.00 -> 4.50 core).
uniform sampler2DShadow uShadowMap0;
uniform sampler2DShadow uShadowMap1;
uniform mat4 uShadowMat0;
uniform mat4 uShadowMat1;
uniform float uCascadeSplit;
uniform vec2 uShadowTexel;
uniform float uShadowStrength;

/* Rotated Poisson taps: 8 samples give soft, stable edges at a fraction of
   the cost of a 5x5 box, and the per-pixel rotation hides the pattern. */
const vec2 POISSON[8] = vec2[8](
  vec2(-0.7071, 0.7071), vec2(0.0, -0.8750), vec2(0.5303, 0.5303), vec2(-0.6250, -0.3125),
  vec2(0.8750, -0.1250), vec2(-0.1875, 0.9375), vec2(0.3125, -0.6875), vec2(-0.9375, 0.0625)
);

/* Project a world position into a cascade's [0,1] shadow space. */
vec3 shadowProject(mat4 mat, vec3 worldPos){
  vec4 lp = mat * vec4(worldPos, 1.0);
  return (lp.xyz / lp.w) * 0.5 + 0.5;
}
bool outsideCascade(vec3 p){
  // Outside the cascade means fully lit, so the world never goes black past
  // the shadow distance.
  return p.x < 0.001 || p.x > 0.999 || p.y < 0.001 || p.y > 0.999 || p.z > 1.0;
}

/* The two cascade samplers are read by two near-identical functions rather
   than one function taking a sampler2DShadow parameter.
   GLSL ES 3.00 permits sampler parameters, but several drivers — ANGLE's
   backends among them — mis-bind them and silently return the "fully lit"
   value, which produces a scene with no shadows at all and no error to
   explain it. Duplicating a dozen lines is worth not having that failure. */
float pcfCascade0(vec3 proj, float bias, float spread, vec2 rot){
  float d = proj.z - bias;
  float sum = 0.0;
  for (int i = 0; i < 8; i++) {
    vec2 o = POISSON[i];
    // Rotate the disc per pixel to trade banding for noise.
    vec2 ro = vec2(o.x * rot.x - o.y * rot.y, o.x * rot.y + o.y * rot.x);
    sum += texture(uShadowMap0, vec3(proj.xy + ro * uShadowTexel * spread, d));
  }
  return sum * 0.125;
}
float pcfCascade1(vec3 proj, float bias, float spread, vec2 rot){
  float d = proj.z - bias;
  float sum = 0.0;
  for (int i = 0; i < 8; i++) {
    vec2 o = POISSON[i];
    vec2 ro = vec2(o.x * rot.x - o.y * rot.y, o.x * rot.y + o.y * rot.x);
    sum += texture(uShadowMap1, vec3(proj.xy + ro * uShadowTexel * spread, d));
  }
  return sum * 0.125;
}

/* ================= PCSS: A PENUMBRA THAT GROWS WITH DISTANCE =================
 *
 * The eight taps above are spread by a CONSTANT 1.4 texels, everywhere.
 * That is the single loudest "this is a shadow map" tell in the frame: a
 * pole's shadow is exactly as crisp ten metres from its base as it is at
 * the base, and a crate resting on the ground has the same blurred edge
 * as the building behind it. Real sunlight does not do that. The sun is
 * a disc about half a degree across, so an occluder at a gap g casts a
 * penumbra 2*g*tan(0.265 deg) wide -- 5 mm at a 1 m gap, 14 cm at 30 m.
 *
 * Percentage-closer soft shadows recover that in two steps: SEARCH for
 * the blockers above the receiver and average their depth, then run the
 * PCF at a radius derived from how far above they turned out to be.
 *
 * THE SEARCH NEEDS A RAW DEPTH, WHICH A sampler2DShadow CANNOT GIVE.
 * uShadowMap0/1 are COMPARE_REF_TO_TEXTURE: every fetch is a comparison
 * against a reference and returns a lit fraction, never a number you can
 * average. So the shadow pass also writes gl_FragCoord.z into an R8
 * colour attachment (see _initShadowMaps), and uShadowBlocker0/1 read
 * that. One byte a texel, and only on the tiers that ask for PCSS.
 *
 * ONE BYTE IS ENOUGH, and this is the number that decides it. The
 * cascade projection is ORTHOGRAPHIC, so proj.z is LINEAR in metres
 * along the light -- there is no 1/z crowding to fight. Cascade 0's
 * depth range is about 64 m, so R8 quantises the stored blocker to
 * 64/255 = 25 cm. A 25 cm error in the gap is a 25*0.00465 = 1.2 mm
 * error in the penumbra, against a shadow texel of 7.8 mm at
 * shadowRes 2560: 0.15 of a texel. Cascade 1 is coarser in depth (about
 * 283 m, so 1.1 m per step) and coarser in texels in exactly the same
 * proportion, so it lands at 0.11 of a texel. Neither is visible. R16F
 * would be twice the memory for a precision the PCF cannot express.
 *
 * WHAT THE UNIFORMS MEAN. The whole of the sun's angular size, the
 * cascade's depth range and the cascade's texel size collapse into one
 * number per cascade:
 *
 *   uShadowGapUnit[c] = texelWorld / (sunTan * depthRange)
 *
 * -- the gap, in proj.z units, that produces a penumbra exactly one
 * shadow texel wide. Divide the measured gap by it and the answer is
 * the penumbra IN TEXELS, which is what the PCF wants. Nothing else has
 * to know the cascade's size.
 *
 *   uShadowTexelZ[c]  = texelWorld / depthRange
 *
 * -- one texel of lateral movement, in proj.z units. The bias needs it
 * because a disc that is now up to uShadowPenumbraMax texels across
 * walks much further down a sloped receiver than a 1.4-texel disc did.
 */
uniform sampler2D uShadowBlocker0;
uniform sampler2D uShadowBlocker1;
uniform int   uShadowBlockers;      // search taps; 0 = the fixed-spread path
uniform int   uShadowTaps;          // final PCF taps when PCSS is on
uniform float uShadowPenumbraMax;   // cap on the penumbra, in shadow texels
uniform vec2  uShadowGapUnit;       // per cascade, see above
uniform vec2  uShadowTexelZ;        // per cascade, see above

/* THE BLOCKER SEARCH, once per cascade because a sampler cannot be a
   function parameter here (see the note on pcfCascade0/1 above).

   The disc is a golden-angle spiral -- sqrt() on the index gives uniform
   area density, which the ambient-occlusion pass already uses for the
   same reason -- and it is DELIBERATELY NOT ROTATED per pixel. The PCF
   below is rotated, because rotating it trades banding for noise in a
   quantity that is then averaged over eight taps. The search is not
   averaged over anything: its answer is a RADIUS, and a radius that
   jitters from pixel to pixel is a penumbra that boils. Deterministic
   sampling makes the radius vary smoothly as the receiver slides across
   the disc, which is what a low-frequency quantity wants.

   The search radius is uShadowPenumbraMax texels -- the widest penumbra
   this can express. Looking further finds blockers whose penumbra is
   capped anyway; looking closer truncates the soft side of the shadow.

   Returns the GAP (receiver minus mean blocker) in proj.z units, or
   -1.0 when nothing above the receiver was found. */
float pcssBlocker0(vec3 proj, float bias, int taps){
  float zr = proj.z - bias;
  float sum = 0.0;
  float hits = 0.0;
  float inv = 1.0 / float(taps);
  for (int i = 0; i < 16; i++) {
    if (i >= taps) break;
    float a = float(i) * 2.39996323;
    float r = sqrt((float(i) + 0.5) * inv) * uShadowPenumbraMax;
    vec2 o = vec2(cos(a), sin(a)) * r * uShadowTexel;
    float b = texture(uShadowBlocker0, proj.xy + o).r;
    if (b < zr) { sum += b; hits += 1.0; }
  }
  return hits > 0.5 ? (zr - sum / hits) : -1.0;
}
float pcssBlocker1(vec3 proj, float bias, int taps){
  float zr = proj.z - bias;
  float sum = 0.0;
  float hits = 0.0;
  float inv = 1.0 / float(taps);
  for (int i = 0; i < 16; i++) {
    if (i >= taps) break;
    float a = float(i) * 2.39996323;
    float r = sqrt((float(i) + 0.5) * inv) * uShadowPenumbraMax;
    vec2 o = vec2(cos(a), sin(a)) * r * uShadowTexel;
    float b = texture(uShadowBlocker1, proj.xy + o).r;
    if (b < zr) { sum += b; hits += 1.0; }
  }
  return hits > 0.5 ? (zr - sum / hits) : -1.0;
}

/* Gap -> penumbra radius in texels. Floored at 1.0 because below one
   texel the shadow map has nothing finer to give and the hardware 2x2
   comparison is already averaging a texel's worth: that floor IS the
   crisp contact. Capped at uShadowPenumbraMax because the final PCF
   samples a fixed tap count and a radius past that is undersampled
   noise rather than softness. */
float pcssSpread(float gap, float gapUnit){
  if (gap < 0.0) return 1.0;
  return clamp(gap / max(gapUnit, 1e-7), 1.0, uShadowPenumbraMax);
}

/* Bias for a variable-radius disc.
   A 1.4-texel disc on a receiver tilted 45 degrees to the light walks
   1.4 texels' worth of depth across itself; an 18-texel disc walks
   thirteen times as much, and the fixed constant that was enough for
   the first is acne for the second. So the disc's own footprint is
   added to the bias. (slope * 2.0 + 0.35) is a linear stand-in for the
   tangent of the light-space receiver slope: 0.35 at normal incidence
   to cover the shadow map's own quantisation across the disc, 1.35 at
   60 degrees where the true tangent is 1.73 -- deliberately under, so
   the existing slope term is still doing the work at grazing angles and
   the two are not double-counted.
   The pay-off is at the other end: where the occluder is close the
   spread is 1.0 and the bias is the ORIGINAL constant, so PCSS never
   detaches a contact shadow it was supposed to tighten. */
float pcssBias(float base, float slope, float spread, float texelZ){
  return base + spread * texelZ * (slope * 2.0 + 0.35);
}

float pcssCascade0(vec3 proj, float bias, float spread, float rnd, int taps){
  float d = proj.z - bias;
  float sum = 0.0;
  float inv = 1.0 / float(taps);
  for (int i = 0; i < 24; i++) {
    if (i >= taps) break;
    // Golden angle, rotated per pixel: an even disc at any tap count,
    // and no fixed pattern to alias against the shadow texel grid.
    float a = float(i) * 2.39996323 + rnd;
    float r = sqrt((float(i) + 0.5) * inv) * spread;
    vec2 o = vec2(cos(a), sin(a)) * r * uShadowTexel;
    sum += texture(uShadowMap0, vec3(proj.xy + o, d));
  }
  return sum * inv;
}
float pcssCascade1(vec3 proj, float bias, float spread, float rnd, int taps){
  float d = proj.z - bias;
  float sum = 0.0;
  float inv = 1.0 / float(taps);
  for (int i = 0; i < 24; i++) {
    if (i >= taps) break;
    float a = float(i) * 2.39996323 + rnd;
    float r = sqrt((float(i) + 0.5) * inv) * spread;
    vec2 o = vec2(cos(a), sin(a)) * r * uShadowTexel;
    sum += texture(uShadowMap1, vec3(proj.xy + o, d));
  }
  return sum * inv;
}

float shadowFactor(vec3 worldPos, float viewDepth, float NoL){
  // Slope-scaled bias: grazing light needs far more offset to avoid acne.
  float slope = clamp(1.0 - NoL, 0.0, 1.0);
  float rnd = hash12(gl_FragCoord.xy) * 6.2831853;
  vec2 rot = vec2(cos(rnd), sin(rnd));
  float s = 1.0;

  if (viewDepth < uCascadeSplit) {
    vec3 proj = shadowProject(uShadowMat0, worldPos);
    if (outsideCascade(proj)) return 1.0;
    if (uShadowBlockers > 0) {
      /* The search runs at the ORIGINAL bias, not the widened one. A
         blocker nearer the receiver than the bias is one the shadow map
         could not resolve anyway, and treating it as absent is what
         keeps the contact case crisp instead of guessing a gap out of
         depth-fighting noise. */
      float base = 0.0009 + slope * 0.0035;
      float spread = pcssSpread(pcssBlocker0(proj, base, uShadowBlockers), uShadowGapUnit.x);
      s = pcssCascade0(proj, pcssBias(base, slope, spread, uShadowTexelZ.x), spread, rnd, uShadowTaps);
    } else {
      s = pcfCascade0(proj, 0.0009 + slope * 0.0035, 1.4, rot);
    }
  } else {
    vec3 proj = shadowProject(uShadowMat1, worldPos);
    if (outsideCascade(proj)) return 1.0;
    if (uShadowBlockers > 0) {
      float base = 0.0016 + slope * 0.006;
      float spread = pcssSpread(pcssBlocker1(proj, base, uShadowBlockers), uShadowGapUnit.y);
      s = pcssCascade1(proj, pcssBias(base, slope, spread, uShadowTexelZ.y), spread, rnd, uShadowTaps);
    } else {
      s = pcfCascade1(proj, 0.0016 + slope * 0.006, 1.1, rot);
    }
    // Cross-fade the far cascade out so its edge is never a visible line.
    float fade = smoothstep(0.75, 1.0, viewDepth / (uCascadeSplit * 4.0));
    s = mix(s, 1.0, fade);
  }
  return mix(1.0, s, uShadowStrength);
}
