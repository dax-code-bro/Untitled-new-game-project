// Ported from engine/src/50-shaders.js GLSL.volumetricFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
in vec2 vUv;

/* Shared frame data. uSceneDepth is hdrA's depth texture, bound by the
   renderer; the two cascades and their matrices come from the existing
   _bindShadows, unchanged and uncopied. */
uniform sampler2D uSceneDepth;
uniform sampler2DShadow uShadowMap0;
uniform sampler2DShadow uShadowMap1;
uniform mat4  uShadowMat0;
uniform mat4  uShadowMat1;
uniform float uCascadeSplit;
uniform float uShadowStrength;

uniform mat4  uInvViewProj;
uniform vec3  uCameraPos;

/* Bound by _bindEnv, exactly as they are for the pbr, sky and
   fluidShade programs. Declared here rather than by including
   GLSL.sky, on purpose: this pass needs six numbers out of that chunk
   and none of its functions, and a chunk three other features are
   editing in parallel is a chunk not to depend on. */
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform float uSunIntensity;
uniform vec3  uFogColor;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uFogHeightFalloff;

uniform int   uVolSteps;
uniform float uVolDensity;     // uFogDensity * densityScale, 1/metre
uniform float uVolIntensity;
uniform float uVolG;           // Henyey-Greenstein anisotropy
uniform float uVolTint;
uniform float uVolBias;
uniform float uVolClamp;
uniform float uVolCurve;
uniform float uVolNear;
uniform vec2  uVolRange;       // x = fade start (m), y = hard end (m)
uniform float uVolJitter;

layout(location=0) out vec4 outColor;

/* INTERLEAVED GRADIENT NOISE, not hash12.
 *
 * Both give every pixel a different offset into the march; the
 * difference is what happens when the blur below averages them. IGN
 * (Jimenez 2014) is low-discrepancy: any 3x3 neighbourhood holds nine
 * values close to a uniform stratification of [0,1), so nine taps
 * recover close to nine times the effective step count. White noise
 * does not -- the mean of nine uniform samples has a standard
 * deviation of 1/(3*sqrt(12)) = 0.096, which is a tenth of a step of
 * residual error, and a tenth of a step of error on a hard shaft edge
 * is exactly the speckle this pass cannot afford at 24 steps.
 * The engine's hash12 is white noise and is used where its output is
 * averaged over eight taps of the same quantity; here it is not. */
float volIGN(vec2 p){
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

vec3 volWorld(vec2 uv, float d){
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 w = uInvViewProj * c;
  return w.xyz / w.w;
}

/* ONE hardware-comparison tap per march step, which is a free 2x2 PCF
   because the cascade textures are LINEAR + COMPARE_REF_TO_TEXTURE.
   NOT shadowFactor(): that is eight rotated Poisson taps, eight times
   this budget, and it is smoothing a quantity that is about to be
   integrated over twenty-four steps and then blurred -- the averaging
   it would do is already being done twice downstream.

   The two cascades are written out twice rather than selecting a
   sampler, for the reason recorded above pcfCascade0: ANGLE mis-binds
   sampler function parameters and silently reports fully lit.

   OUTSIDE A CASCADE RETURNS 0 -- SHADOWED -- WHICH IS THE OPPOSITE OF
   outsideCascade's convention, AND IT IS DELIBERATE. On a surface,
   "unknown means lit" fails safe: a wrongly-lit pixel looks like no
   shadow. In a march it fails catastrophically: every sample past the
   cascade would return full sun and the frame would grow a hard bright
   plane at exactly shadows.distance. Unknown means contributes-nothing
   here, so the worst a lost cascade can do is make a shaft dimmer.
   The smooth fade in the loop means this branch is reached with a
   weight of zero anyway; it is the belt to that pair of braces.

   The samples are AIR, so there is no receiver plane and no acne, and
   the bias only has to cover the shadow pass's own polygon offset. It
   is in the cascade's normalised depth units; see the renderer. */
float volShadow(vec3 wp, float t){
  if (t < uCascadeSplit) {
    vec4 lp = uShadowMat0 * vec4(wp, 1.0);
    vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 0.0;
    return texture(uShadowMap0, vec3(p.xy, p.z - uVolBias));
  }
  vec4 lp = uShadowMat1 * vec4(wp, 1.0);
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 0.0;
  return texture(uShadowMap1, vec3(p.xy, p.z - uVolBias));
}

void main(){
  float d0   = texture(uSceneDepth, vUv).r;
  vec3  farW = volWorld(vUv, 1.0);
  vec3  dir  = normalize(farW - uCameraPos);

  /* The sky marches the full range: a shaft against a bright sky is the
     canonical god ray and stopping at the first surface would drop
     exactly the pixels the effect exists for. */
  float tFar  = uVolRange.y;
  if (d0 < 0.99999) tFar = min(tFar, length(volWorld(vUv, d0) - uCameraPos));
  float tNear = uVolNear;

  /* Alpha is the marched distance in metres -- the blur's bilateral
     key. Every return path writes it, including the dead ones, so the
     blur never reads an uninitialised depth at a silhouette. */
  if (tFar <= tNear || uVolDensity <= 0.0 || uSunIntensity <= 0.0) {
    outColor = vec4(0.0, 0.0, 0.0, tFar);
    return;
  }

  /* Below the horizon the cascade is fitted from underground and its
     contents are meaningless, so the shafts go out with the sun rather
     than marching garbage. Full by about one degree of elevation, which
     keeps the last minutes of a sunset -- the best shafts there are. */
  float horizon = smoothstep(-0.05, 0.02, uSunDir.y);
  if (horizon <= 0.0) { outColor = vec4(0.0, 0.0, 0.0, tFar); return; }

  /* HENYEY-GREENSTEIN, normalised so the integral over the sphere is 1.
     cos(theta) is dot(dir, uSunDir) because uSunDir points TOWARD the
     sun and the scattering angle is between the incoming direction
     (-uSunDir) and the outgoing one (-dir): the two negations cancel.
     Forward scattering therefore peaks when you look at the sun, which
     is when a shaft is brightest, which is correct. */
  float cosT = dot(dir, uSunDir);
  float g    = clamp(uVolG, -0.9, 0.9);
  float g2   = g * g;
  float den  = max(1.0 + g2 - 2.0 * g * cosT, 1e-4);
  float phase = (1.0 - g2) / (4.0 * PI * den * sqrt(den));

  int   n    = clamp(uVolSteps, 2, 64);
  float span = tFar - tNear;
  float jit  = fract(volIGN(gl_FragCoord.xy) + uVolJitter);

  /* STEPS THAT GROW WITH DISTANCE, not even ones.
   *
   * With a uniform step the march spends the same budget on the fifty
   * metres nobody can resolve as on the three in front of the camera,
   * and a medium dense enough for indoor beams has already given up
   * nine tenths of its light inside the first two steps. The boundaries
   * are laid out as curve^x with x running 0..1, which makes the local
   * step dt = ln(curve)/n * (t - tNear + span/(curve-1)). At the
   * default curve of 24 over a 60 m range that is 0.34 m at the camera
   * and 8.3 m at the far end, growing as 0.132*t -- the same law the
   * pixel footprint grows by, so every step covers about the same
   * amount of picture.
   *
   * curve^((i+1)/n) is carried as a running multiply by a constant
   * rather than a pow() per step: one multiply instead of two
   * transcendentals, twenty-four times. */
  float grow  = exp(log(max(uVolCurve, 1.0001)) / float(n));
  float cdiv  = 1.0 / (max(uVolCurve, 1.0001) - 1.0);
  float p     = 1.0;
  float tPrev = tNear;

  float acc = 0.0;    // in-scattered fraction, before phase and radiance
  float T   = 1.0;    // transmittance from the eye to tPrev

  for (int i = 0; i < 64; i++) {
    if (i >= n) break;
    p *= grow;
    float t1 = min(tNear + span * (p - 1.0) * cdiv, tFar);
    float dt = t1 - tPrev;
    if (dt <= 0.0) break;

    /* The sample sits at a dithered position INSIDE the segment, so the
       visibility is stratified while the transmittance weight below
       stays exact for the whole segment. */
    float ts = tPrev + dt * jit;
    vec3  wp = uCameraPos + dir * ts;

    float hf = exp(-max(0.0, wp.y - uFogHeight) * uFogHeightFalloff);
    float sg = uVolDensity * hf;

    /* SHADOWED AIR SCATTERS NO SUN. That is not a stylistic choice,
       it is what a shadow is -- and it is why this does NOT simply
       reuse uShadowStrength the way a surface does. The 0.86 default
       exists on surfaces to stand in for the sky fill a shadowed
       surface still receives; the air's sky fill is applyFog's flat
       source term, already applied, and paying it twice here would
       give every shadowed ray a 14 per cent floor of direct sunlight
       and throw away most of the contrast that makes a shaft a shaft.
       Measured on the rig in volumetric.test.js, which is an A/B of
       this one line: the naive mix() puts a floor of 5.4 luma under
       every shadowed column and takes the
       brightest-column-over-dimmest ratio from 11.1 to 2.0.

       It still has to FOLLOW the setting, or a game that flattens its
       shadows would keep hard-edged beams. Fully trusted at 0.7 and
       above -- any game running a real shadow term -- and faded out
       linearly below it, so shadows.strength = 0 means no shafts. */
    float vis  = mix(1.0, volShadow(wp, ts), saturate1(uShadowStrength * 1.4286));
    float fade = 1.0 - smoothstep(uVolRange.x, uVolRange.y, ts);

    /* THE SEGMENT'S EXACT INTEGRAL, not a point sample of it.
       For constant sigma over [a, a+dt] the contribution is
       T(a) * (1 - exp(-sigma*dt)); a left-hand point sample would be
       T(a)*sigma*dt instead. The steps grow, so the far ones are the
       long ones: the 8.3 m step at the end of the default march carries
       an optical depth of 0.66 on the dustiest map this game ships, and
       the point sample overstates that segment by 37 per cent -- and by
       an amount that depends on the step count, so the tier table would
       be changing the brightness as well as the detail. This form
       telescopes to 1 - exp(-total) with the visibility folded in, so
       halving the steps changes how finely the beam's edge is resolved
       and does not change how bright it is. */
    float e = exp(-sg * dt);
    acc += T * (1.0 - e) * vis * fade;
    T   *= e;
    tPrev = t1;

    /* Under 1/255 of anything this can still add. It fires on a map
       dense enough to go opaque inside the march -- at the default
       scale that is a fog density above about 0.012 -- where it saves
       most of the loop, and costs one compare a step everywhere
       else. */
    if (T < 0.003) break;
  }

  /* THE MAP'S AIR COLOUR, hue only. Normalising by the largest channel
     means a dark authored fog tints the shaft without dimming it --
     brightness is the sun's job and the density's, not the palette's. */
  float mx   = max(max(uFogColor.r, uFogColor.g), max(uFogColor.b, 1e-4));
  vec3  tint = mix(vec3(1.0), uFogColor / mx, clamp(uVolTint, 0.0, 1.0));

  vec3 inscat = uSunColor * uSunIntensity * tint
    * (acc * phase * uVolIntensity * horizon);

  /* A firefly rail, not a tuning knob. Single scattering with an albedo
     of one cannot exceed phase * sunRadiance however dense the air
     gets, so a well-behaved frame never reaches this; it is here so a
     map with an absurd fog density degrades into a bright haze instead
     of punching a hole through the brightest assertion in the suite. */
  inscat = min(max(inscat, vec3(0.0)), vec3(uVolClamp));
  outColor = vec4(inscat, tFar);
}
