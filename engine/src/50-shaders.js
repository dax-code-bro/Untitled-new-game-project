/* ============================================================
   SHADERS — GLSL ES 3.00 sources.
   Shared chunks keep the lighting model identical everywhere:
   grass, water, debris and characters all resolve to the same
   BRDF and the same sky, which is what makes a scene read as one
   coherent world rather than a pile of separate effects.
   ============================================================ */

const GLSL = {};

/* ---------------- shared chunks ---------------- */

GLSL.common = `
const float PI = 3.14159265359;
const float INV_PI = 0.31830988618;

float saturate1(float x){ return clamp(x, 0.0, 1.0); }
vec3  saturate3(vec3 x){ return clamp(x, vec3(0.0), vec3(1.0)); }

float hash11(float p){
  p = fract(p * 0.1031);
  p *= p + 33.33;
  return fract(p * (p + p));
}
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash31(float p){
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float valueNoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 157.0 + i.z * 113.0;
  return mix(
    mix(mix(hash11(n), hash11(n + 1.0), f.x),
        mix(hash11(n + 157.0), hash11(n + 158.0), f.x), f.y),
    mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
        mix(hash11(n + 270.0), hash11(n + 271.0), f.x), f.y),
    f.z);
}
float fbm3(vec3 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * valueNoise(p); p *= 2.02; a *= 0.5; }
  return s;
}
`;

/* One sky model, used as the background, as ambient light, and as the
   reflection probe. Sharing it means a chrome sphere reflects exactly the
   sky the player can see behind it. */
GLSL.sky = `
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uGroundColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uSkyIntensity;
/* A stand-in for a reflection probe.

   The sky doubles as the environment for every metal, which works outdoors
   and fails completely inside a building: the shader has no occlusion, so a
   receiver indoors reflects a sky it cannot see, and because that reflection
   arrives from a direction the walls are actually in, what it mostly gets is
   the dim ground term. A metal has no diffuse to fall back on, so it comes
   out as a silhouette — which is what every dark gun in a lamp-lit room was
   doing. This is the room itself: the lit walls a lamp is bouncing off are,
   to a mirror, the environment. */
uniform vec3 uRoomAmbient;
/* ---- how much of the sun the ground bounces back up ----
   See groundIrradiance below. */
uniform float uGroundBounce;
/* ---- sky occlusion from the sun shadow ----
   How much of the sky a shadowed point is allowed to keep. See the
   block where it is used, in the ambient term. */
uniform float uSkyOcclusion;

/* WHAT THE GROUND SENDS BACK UP.
 *
   uGroundColor is the ground's ALBEDO, not its radiance, and until this
   function existed it was used as though it were radiance: a surface
   facing straight down received a flat dark constant no matter how
   bright the day was. What a downward-facing surface actually receives
   is that albedo times whatever the ground itself is lit by, and on a
   sunny map the ground is lit by a sun several times the strength of
   the whole sky.

   Leaving the sun out of it is why the UNDERSIDE OF EVERYTHING went
   black on a bright map. A measured example, on a concrete sphere under
   the default sun: the top of it came out at 170 and the bottom at 10,
   a ratio of sixteen to one, when a stone ball on a sunlit road is
   nearer four. Small objects are the worst case because most of their
   surface faces somewhere other than up -- which is why it showed up
   first, and loudest, in rubble. A shattered wall is nothing BUT
   facets pointing every way, so half of every chunk went to black and
   the pile read as one black blob rather than as broken masonry.

   The bounce is attenuated by the same skyVis as the rest of the
   ambient, so a roof still darkens the room under it: the caller
   multiplies the whole of skyIrradiance by it. */
/* ================================================================
   THE BAKED ENVIRONMENT PROBE
   ================================================================
   Everything above this point is a FIT, not an environment. A metal
   reflects a two-colour vertical gradient with a dot in it, and
   roughness does not blur that gradient -- it lerps it toward a flat
   constant -- see the mix(skyRadiance(R), skyIrradiance(N), rough*rough)
   in the ambient term. That is the whole reason mid-rough metal -- worn
   gun steel, wet concrete, a car panel -- reads as either chrome or
   matte paint with nothing in between, and it is why a gun indoors
   reflects an outdoor sky it cannot see.

   These uniforms are the real thing: a small cubemap of skyRadiance()
   with a GGX roughness prefilter down its mip chain, the split-sum BRDF
   as a lookup table, and a nine-coefficient spherical-harmonic
   projection of the same sky for the diffuse half. The renderer bakes
   all three (Renderer.renderEnv) and binds them in _bindEnv.

   uEnvIntensity IS THE GATE. Zero means "no probe", and every envXxx()
   function below then evaluates the exact expression this shader used
   before the probe existed -- same constants, same order of operations
   -- so a tier with quality.env off renders the frame it rendered
   yesterday, bit for bit. It doubles as the strength, so a game can
   dial a probe down without switching it off. */
uniform samplerCube uEnvCube;   // mip L was baked at roughness L/(levels-1)
uniform sampler2D uBrdfLut;     // split-sum: .r scales F0, .g is the bias
uniform float uEnvIntensity;    // 0 = no probe, and the pre-probe code path
uniform vec2 uEnvLod;           // x = levels-1, y = coarsest mip we may sample
uniform float uEnvDiffuse;      // 0..1: analytic hemisphere -> SH9 irradiance
uniform vec3 uEnvSh[9];         // cosine-convolved and already divided by PI
/* 1 only while skyRadiance() is being baked into the cube, 0 every other
   time. The polarity is deliberate. A uniform this renderer never binds
   reads as zero (20-gl.js), and zero here means "draw the sun disc",
   which is exactly what this shader did before. The other way round, one
   missed bind in _bindEnv would silently delete the sun from the sky. */
uniform float uEnvNoSunDisc;
vec3 groundIrradiance(){
  // How square-on the sun hits flat ground. Nothing to bounce at night.
  float lit = max(uSunDir.y, 0.0);
  return uGroundColor * (uSkyIntensity + uSunColor * uSunIntensity * lit * uGroundBounce);
}

vec3 skyRadiance(vec3 dir){
  float up = dir.y;
  // Horizon band is tight near y=0 and eases into the zenith colour.
  float t = pow(saturate1(up * 0.5 + 0.5), 0.55);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, saturate1(up * 1.6));
  // Below the horizon, fade into the ground bounce -- the lit ground, so
  // that a chrome surface looking down reflects a road and not a hole.
  sky = mix(groundIrradiance() / max(uSkyIntensity, 1e-4), sky, smoothstep(-0.28, 0.06, up));

  float sunDot = saturate1(dot(dir, uSunDir));
  // Mie-like forward scattering halo around the sun.
  float halo = pow(sunDot, 12.0) * 0.35 + pow(sunDot, 3.0) * 0.08;
  // The disc itself: sharp, bright, and clipped so bloom does the glow.
  float disc = smoothstep(0.9986, 0.9995, sunDot);
  sky += uSunColor * (halo * uSunIntensity * 0.35);
  /* The disc is multiplied out while this sky is being baked into the
     environment cube. pbrFrag adds the analytic sun itself with a
     shadow term, and prefiltering a ~74-linear spike (noon preset)
     across a GGX lobe puts a second, blurry, unshadowed sun on every
     rough metal in the game. uEnvNoSunDisc is 0 everywhere else, and
     multiplying by exactly 1.0 is exact in IEEE float, so this line
     produces the same bits it did before for every ordinary draw. */
  sky += uSunColor * disc * uSunIntensity * 12.0 * (1.0 - uEnvNoSunDisc);
  return sky * uSkyIntensity;
}

/* Cheap hemisphere irradiance: what a diffuse surface receives from the sky. */
vec3 skyIrradiance(vec3 n){
  /* A SURFACE FACING STRAIGHT DOWN STILL SEES SKY.
   *
     The plain hemisphere lerp gives n.y = -1 a sky share of exactly
     zero, which is only true of a surface lying flat on the ground.
     Everything else -- the underside of a chunk of rubble, a stair
     tread, a handguard, an eave -- is held some distance above it and
     sees sky in every direction past its own horizon. Zero is what kept
     the blue and green of a dark material pinned at black no matter how
     much warm bounce came up off the ground, because the bounce is the
     colour of dirt and a dark red brick has almost no green in it to
     return. The floor is what makes a shaded brick read as shaded brick
     rather than as a hole cut in the picture. */
  float up = mix(0.18, 1.0, n.y * 0.5 + 0.5);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, 0.65) * uSkyIntensity;
  return mix(groundIrradiance(), sky, up);
}
/* ---- the split-sum BRDF, twice ----
   envBRDFFit is a verbatim copy of envBRDFApprox (Karis' analytic fit,
   in GLSL.pbr). It is duplicated rather than called for one hard
   reason: GLSL.sky is compiled into skyFrag, which does NOT include
   GLSL.pbr, so a call here would need a forward declaration whose
   definition is missing in that program -- a link error on any driver
   that does not dead-strip before it checks. Eight lines of arithmetic
   is the cheap side of that trade, and it is the same trade the shadow
   chunk already makes with pcfCascade0/pcfCascade1. */
vec3 envBRDFFit(vec3 F0, float rough, float NoV){
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;
  return F0 * AB.x + AB.y;
}

/* The integrated table when there is a probe, the fit when there is
   not. The table is the same quantity the fit approximates -- the
   scale and bias halves of Karis' split sum -- integrated with 128
   GGX samples instead of curve-fitted, which is worth having exactly
   where the fit is worst: high roughness at grazing angles, i.e. the
   rim of every rough metal silhouette. */
vec3 envBRDF(vec3 F0, float rough, float NoV){
  if (uEnvIntensity <= 0.0) return envBRDFFit(F0, rough, NoV);
  vec2 ab = texture(uBrdfLut, vec2(NoV, rough)).rg;
  return F0 * ab.x + vec3(ab.y);
}

/* Nine coefficients, evaluated in the same world-space basis the
   renderer projected them in. The constants (sqrt terms, the l-band
   convolution weights and the 1/PI) are all folded into the uploaded
   coefficients, so this is nine multiply-adds and nothing else. */
vec3 shIrradiance(vec3 n){
  return uEnvSh[0]
    + uEnvSh[1] * n.y + uEnvSh[2] * n.z + uEnvSh[3] * n.x
    + uEnvSh[4] * (n.x * n.y) + uEnvSh[5] * (n.y * n.z)
    + uEnvSh[6] * (3.0 * n.z * n.z - 1.0)
    + uEnvSh[7] * (n.x * n.z) + uEnvSh[8] * (n.x * n.x - n.y * n.y);
}

/* DIFFUSE AMBIENT. skyIrradiance() is a two-lobe lerp on n.y: it has
   almost no directional structure, which is why a normal map is
   invisible in shade and why turning an object under a blue sky over
   warm ground barely changes its colour. SH9 of the actual sky has
   that structure. It is blended rather than swapped because the lerp
   was hand-tuned to hold undersides off black (see the long note in
   skyIrradiance) and a band-limited projection of a hard horizon step
   rings slightly below it; max() against zero clamps the ringing, and
   uEnvDiffuse decides how much of the real thing to take. */
vec3 envIrradiance(vec3 n){
  vec3 analytic = skyIrradiance(n);
  if (uEnvIntensity <= 0.0 || uEnvDiffuse <= 0.0) return analytic;
  return mix(analytic, max(shIrradiance(n), vec3(0.0)), uEnvDiffuse);
}

/* SPECULAR AMBIENT -- the line this whole feature exists for.
   Without a probe: the old lerp, unchanged.
   With one: mip L of the cube was baked by importance-sampling GGX at
   roughness L/(levels-1), so the mapping back is linear in roughness.

   Two clamps, both about cube seams. WebGL2 has no
   TEXTURE_CUBE_MAP_SEAMLESS, so bilinear across a face edge clamps
   inside the face and the join shows. uEnvLod.y stops the sampler two
   levels short of 1x1 -- the coarsest face we ever read is 4x4 -- and
   above roughness 0.75 the probe cross-fades into the irradiance,
   where a GGX lobe that already covers most of the hemisphere and a
   cosine lobe differ by very little. The fade also lands the rough end
   on exactly the value the old code produced there, so the transition
   from no-probe to probe is continuous in roughness. */
vec3 envRadiance(vec3 R, vec3 N, float rough){
  if (uEnvIntensity <= 0.0) return mix(skyRadiance(R), skyIrradiance(N), rough * rough);
  float lod = min(rough * uEnvLod.x, uEnvLod.y);
  vec3 probe = textureLod(uEnvCube, R, lod).rgb * uEnvIntensity;
  return mix(probe, envIrradiance(N), smoothstep(0.75, 1.0, rough));
}
`;

GLSL.pbr = `
float distributionGGX(float NoH, float rough){
  float a = rough * rough;
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}
float geometrySmith(float NoV, float NoL, float rough){
  // Schlick-GGX with the Disney k remap, height-correlated enough for games.
  float r = rough + 1.0;
  float k = (r * r) / 8.0;
  float gv = NoV / (NoV * (1.0 - k) + k);
  float gl = NoL / (NoL * (1.0 - k) + k);
  return gv * gl;
}
vec3 fresnelSchlick(float cosT, vec3 F0){
  return F0 + (1.0 - F0) * pow(saturate1(1.0 - cosT), 5.0);
}
vec3 fresnelSchlickRough(float cosT, vec3 F0, float rough){
  vec3 Fr = max(vec3(1.0 - rough), F0);
  return F0 + (Fr - F0) * pow(saturate1(1.0 - cosT), 5.0);
}
/* ============================================================
   FEATURE 6 — ENERGY-CONSERVING SPECULAR, CLEARCOAT AND SHEEN
   ============================================================
   Five terms, all of them BRDF and none of them a new pass:

     visSmithGGX            the masking-shadowing term GGX is actually
                            derived with, replacing a 2012 fudge
     specularDirAlbedo      how much energy one bounce returns
     specularMultiScatter   putting the rest of it back
     horizonOcclusion       stopping the reflection sampling the inside
     specularOcclusion      of the surface it is standing on
     visKelemen             the clearcoat lobe's visibility
     distributionCharlie    cloth, which GGX cannot express at all
     visAshikhmin
     sheenDirAlbedo

   uSpecEnergy is declared HERE rather than in pbrFrag because the
   screen-space fold has to apply the identical compensation to the
   sky it pays back (see GLSL.screenSpaceFrag), and both programs
   include this chunk. One declaration, one binding site in _bindEnv,
   no chance of the two drifting apart. GLSL.pbr is also compiled into
   fluidShadeFrag and ssrFrag, neither of which references it, so in
   those two it is an inactive uniform and its setter silently no-ops.

   AT uSpecEnergy = 0 THIS WHOLE FEATURE IS BIT-IDENTICAL TO THE
   SHADER IT REPLACED. Not "close" -- the off path in every call site
   is the original expression, character for character, and the only
   new arithmetic on it is a multiply by a literal 1.0, which is exact
   in IEEE 754. That is what lets the four tiers the test suite pins
   keep their recorded numbers with no re-baseline. */
uniform float uSpecEnergy;
uniform float uSpecOcclusion;

/* ---- HEIGHT-CORRELATED SMITH VISIBILITY ----
 *
 * geometrySmith above is Schlick-GGX with Disney's k = (rough+1)^2/8.
 * That remap is not the Smith term the GGX distribution is derived
 * with; it is a deliberate darkening fudge from the 2012 course notes,
 * introduced in their words "to reduce the hotness", and it throws away
 * energy that never comes back. This is Heitz's height-correlated
 * Smith, written as a VISIBILITY term with the 1/(4 NoL NoV) of the
 * Cook-Torrance denominator already folded in, so the caller writes
 * D * Vis * F and never divides.
 *
 * FOLDING THE DENOMINATOR IS NOT A MICRO-OPTIMISATION, it is what makes
 * the term finite. G/(4 NoV NoL) is 0/0 at grazing incidence and the
 * old line papered over it with max(..., 1e-4) -- a clamp that fires on
 * exactly the silhouette pixels a rough metal is judged by. Here the
 * NoL and NoV cancel analytically before anything is divided, and the
 * remaining max() is only there for the case where both are zero.
 *
 * alpha = rough*rough, matching distributionGGX, which squares it the
 * same way. Measured against the old term at NoV = NoL = 0.7 this is
 * 13% brighter at rough 0.1, 21% at 0.5 and 15% at 0.8. */
float visSmithGGX(float NoV, float NoL, float rough){
  float a = rough * rough;
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-6);
}

/* ---- SINGLE-SCATTER DIRECTIONAL ALBEDO, Ess(NoV, rough) ----
 *
 * The fraction of incident energy one bounce off a GGX microsurface
 * returns. At rough 0 it is ~1. At rough 1 and normal incidence it is
 * about 0.45, and the missing 55% is light that struck a SECOND
 * microfacet and was simply dropped, because a single-scatter model has
 * nowhere to put it. That is why rough metal in this renderer -- worn
 * steel, brushed aluminium, a rusted hinge, gold -- goes grey and dead
 * as roughness rises, and why a roughness sweep across one object shows
 * a dark band through the middle of it.
 *
 * This is Karis' split-sum fit evaluated at F0 = 1, where F0*A + B
 * collapses to A + B. Deliberately the ANALYTIC FIT and not the
 * integrated LUT that GLSL.sky's envBRDF() prefers: the compensation
 * has to be the same number in pbrFrag and in the screen-space fold
 * that pays part of it back, and those two programs do not both have
 * the LUT bound on every tier. A fit that agrees everywhere beats a
 * table that is better in one program and missing from the other. */
float specularDirAlbedo(float rough, float NoV){
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;
  return clamp(AB.x + AB.y, 1e-3, 1.0);
}

/* ---- MULTIPLE-SCATTERING COMPENSATION (Turquin 2019) ----
 *
 * Multiply any single-scatter specular lobe by this and the energy the
 * second and later microfacet bounces should have carried is put back,
 * tinted by F0 the way a real second bounce would be. So rough gold
 * stays gold and gets brighter, while rough plaster (F0 = 0.04) moves
 * by under half a per cent.
 *
 * IT CANNOT ADD MORE ENERGY THAN IT CONSERVES, and that is a property
 * of the algebra rather than of a clamp: at F0 = 1 the product
 * Ess * (1 + 1*(1/Ess - 1)) is exactly 1, so a white furnace stays
 * white by construction, at every roughness and every angle -- PROVIDED
 * the Ess handed in is the directional albedo of the lobe actually
 * being compensated. That proviso is why Ess is a PARAMETER and not
 * computed inside, and it is not pedantry: measured on the furnace rig
 * in engine/test/energy.test.js, feeding the analytic fit to a lobe
 * that had used the integrated LUT overshot by up to 20 per cent at
 * mid roughness. Two call sites, two sources:
 *
 *   direct sun and punctual -- specularDirAlbedo(), the fit. There is
 *     no table for an analytic lobe and Turquin's own method uses the
 *     fit here.
 *   ambient specular, and the screen-space fold that pays it back --
 *     envBRDF(vec3(1.0), rough, NoV).r, which is A + B from whichever
 *     split-sum source that pixel's lobe just used. Self-consistent by
 *     construction, table or fit.
 *
 * the strength argument is the tier gate. At 0 this returns vec3(1.0)
 * and every multiply by it is the identity. */
vec3 msFromEss(vec3 F0, float Ess, float strength){
  if (strength <= 0.0) return vec3(1.0);
  return mix(vec3(1.0), 1.0 + F0 * (1.0 / max(Ess, 1e-3) - 1.0), strength);
}
/* The direct-light form: the fit's Ess, folded in. */
vec3 specularMultiScatter(vec3 F0, float rough, float NoV, float strength){
  if (strength <= 0.0) return vec3(1.0);
  return msFromEss(F0, specularDirAlbedo(rough, NoV), strength);
}

/* ---- HORIZON OCCLUSION ----
 *
 * The reflection vector is built from the SHADING normal, which a
 * normal map -- and, now, a parallax offset -- can tilt a long way off
 * the triangle. Tilt it far enough and R points INTO the geometry,
 * below the plane the surface actually occupies, and the ambient
 * specular cheerfully fetches sky from a direction the surface is
 * standing in front of. That is the rim of fake sky on worn metal
 * edges, and the glow in crevices and under overlaps.
 *
 * Lagarde's term: fade the reflection out as R crosses the geometric
 * horizon, squared so the falloff is smooth rather than a line. It is
 * exactly 1 whenever R is above the horizon, which is the overwhelming
 * majority of pixels, so it costs one dot product to do nothing. */
float horizonOcclusion(vec3 R, vec3 Ngeo){
  float h = saturate1(1.0 + dot(R, Ngeo));
  return h * h;
}

/* ---- SPECULAR OCCLUSION (Lagarde, Moving Frostbite to PBR) ----
 *
 * A diffuse occlusion value applied to a specular lobe is wrong in both
 * directions at once: a mirror in a crease still sees most of what it
 * reflects, and a fully rough surface sees no more of the sky than a
 * diffuse one does. This interpolates between those two ends by
 * roughness, which is the only parameter that decides how wide a cone
 * the specular lobe is actually gathering over.
 *
 * AT ao = 1 IT RETURNS EXACTLY 1, for every NoV and every roughness:
 * pow(NoV + 1, k) with k in (0, 0.5] and NoV + 1 >= 1 is >= 1, and the
 * saturate takes it to 1. So a material with no AO map -- which is
 * every untextured material in this engine, and every material at all
 * when uHasMaps is 0 -- is untouched, with no special case. */
float specularOcclusion(float NoV, float ao, float rough){
  return saturate1(pow(NoV + ao, exp2(-16.0 * rough - 1.0)) - 1.0 + ao);
}

/* ---- CLEARCOAT VISIBILITY ----
 *
 * Kelemen's term rather than Smith. A clearcoat is smooth by
 * definition -- a rough clearcoat is just a rough surface, and the
 * material system clamps it to 0.03..1 with a default of 0.1 -- so the
 * masking factor sits very close to 1 across the range that matters,
 * and 0.25/LoH^2 is one divide against two square roots. The clamp is
 * the LoH -> 0 pole, reachable only at exactly grazing. */
float visKelemen(float LoH){
  return clamp(0.25 / max(LoH * LoH, 1e-4), 0.0, 1.0);
}

/* ---- SHEEN: the Charlie / inverted-Gaussian lobe ----
 *
 * GGX has a narrow highlight and a DARK grazing rim. Cloth does the
 * exact opposite -- almost nothing head-on and a bright halo at the
 * silhouette -- because the surface is a forest of fibres standing off
 * it, and light grazes along them. There is no setting of roughness
 * and metalness that makes GGX do that. Which is why every uniform,
 * canvas strap, sandbag and webbing set in this engine reads as painted
 * cardboard: the lobe that would sell them is not in the BRDF.
 *
 * Estevez and Kulla's "Charlie" distribution -- the one
 * KHR_materials_sheen specifies -- with Ashikhmin's visibility, which
 * is the pairing the glTF reference implementation uses.
 *
 * The 0.07 floor on roughness is the 1/a pole. The 2^-7 floor on sin^2
 * is for NoH = 1, where pow(0, k) is undefined on some drivers; it is
 * the same floor the reference uses and it is orders of magnitude below
 * the first visible step of the term. */
float distributionCharlie(float NoH, float rough){
  float a = max(rough, 0.07);
  float invA = 1.0 / a;
  float cos2h = NoH * NoH;
  float sin2h = max(1.0 - cos2h, 0.0078125);
  return (2.0 + invA) * pow(sin2h, invA * 0.5) / (2.0 * PI);
}
float visAshikhmin(float NoV, float NoL){
  return clamp(1.0 / (4.0 * (NoL + NoV - NoL * NoV)), 0.0, 1.0);
}
/* Hemispherical albedo of the Charlie lobe, fitted. The tabulated
   directional albedo runs from about 0.04 head-on to about 0.34 at
   grazing and depends only weakly on roughness, so one quartic in
   (1 - NoV) stays within about 0.05 of the table across the useful
   range -- ample for a term that is itself an artistic dial. It does
   two jobs: it is the ambient sheen's weight, and it is how much energy
   the sheen takes off the layer underneath it, which is what stops a
   sheened surface being brighter than an unsheened one. */
float sheenDirAlbedo(float NoV){
  float f = 1.0 - saturate1(NoV);
  float f2 = f * f;
  return 0.04 + 0.30 * f2 * f2;
}
/* ---- OCTAHEDRAL NORMAL ENCODING ----
 *
 * Two channels instead of three for a unit vector, which is what lets
 * the G-buffer carry a normal, a roughness AND a metalness in one
 * RGBA16F texel.
 *
 * Fold the sphere onto an octahedron and unwrap it into a square. The
 * worst-case angular error at 16 bits a channel is far below anything a
 * reflection or an occlusion term can see, and unlike storing xy and
 * rebuilding z it survives normals facing away from the camera -- which
 * matter, because the shading normal is not the geometric one and a
 * strong bump can tilt it past the silhouette. */
vec2 octEncode(vec3 n){
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 e = n.xy;
  if (n.z < 0.0) {
    e = (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  }
  return e;
}
vec3 octDecode(vec2 e){
  vec3 n = vec3(e.xy, 1.0 - abs(e.x) - abs(e.y));
  float t = max(-n.z, 0.0);
  n.xy += vec2(n.x >= 0.0 ? -t : t, n.y >= 0.0 ? -t : t);
  return normalize(n);
}

/* Karis' analytic split-sum approximation — gives believable ambient
   specular without shipping a precomputed BRDF LUT. */
vec3 envBRDFApprox(vec3 F0, float rough, float NoV){
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;
  return F0 * AB.x + AB.y;
}
`;

GLSL.shadow = `
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
`;

GLSL.fog = `
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uFogHeightFalloff;
uniform float uFogSkyBlend;

/* Exponential height fog: dense low down, thinning with altitude, which is
   what sells scale on big outdoor maps.

   AND AT DISTANCE IT BECOMES THE SKY ITSELF.

   This faded everything to uFogColor -- one flat colour for the whole
   frame. But the thing BEHIND a distant building is not one flat
   colour, it is skyRadiance(dir): a gradient from the horizon band up
   to the zenith, with the sun's halo in it. So a far silhouette faded
   to grey in front of a sky that was not grey, and instead of
   dissolving it turned into a flat cutout of itself. You could see
   exactly where the world ended.

   Now the fog colour is carried toward the sky along the direction you
   are looking, and by the fog amount itself -- so near and mid distance
   keep the authored mood colour that every map's palette is tuned to,
   and by the time something is far enough away to be fully fogged it is
   being painted the same value as the sky it is standing in front of.
   At which point the silhouette is genuinely gone rather than merely
   faint.

   THE HEIGHT TERM READS BOTH ENDS OF THE RAY, not just the camera. It
   took cameraPos.y alone, which makes the fog thinner when YOU climb
   and does nothing at all about how low the thing you are looking at
   is -- so the lake and the hillside above it fogged by exactly the
   same amount and the fog never sat on the water. Sampling the midpoint
   of the ray is one extra add and gives the layer a bottom. */
vec3 applyFog(vec3 color, vec3 worldPos, vec3 cameraPos, vec3 viewDir){
  if (uFogDensity <= 0.0) return color;
  float dist = length(worldPos - cameraPos);
  float midY = (cameraPos.y + worldPos.y) * 0.5;
  float heightFactor = exp(-max(0.0, midY - uFogHeight) * uFogHeightFalloff);
  float fogAmount = 1.0 - exp(-dist * uFogDensity * heightFactor);
  fogAmount = saturate1(fogAmount);
  // Fog picks up sun colour when looking toward the sun.
  float sunAmount = pow(saturate1(dot(viewDir, uSunDir)), 8.0);
  vec3 fogCol = mix(uFogColor, uSunColor * 1.1, sunAmount * 0.6);
  fogCol = mix(fogCol, skyRadiance(viewDir), saturate1(uFogSkyBlend * fogAmount));
  return mix(color, fogCol, fogAmount);
}
`;

/* Vertex transform, shared by the main pass and the shadow pass so a
   wind-bent grass blade casts a wind-bent shadow. */
GLSL.transform = `
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
layout(location=3) in vec4 aTangent;
/* Per-vertex tint. A mesh that never sets one leaves this array disabled and
   picks up the generic attribute, which the renderer holds at white — so a
   plain model is unaffected, while one that wants a white shirt over blue
   jeans gets both out of a single mesh and a single draw. */
layout(location=4) in vec3 aColor;
#ifdef SKINNED
layout(location=5) in vec4 aJoints;
layout(location=6) in vec4 aWeights;
uniform sampler2D uBoneTex;
uniform float uBoneCount;

mat4 boneMatrix(float index){
  // 4 RGBA32F texels per bone = one mat4, fetched exactly.
  int i = int(index) * 4;
  return mat4(
    texelFetch(uBoneTex, ivec2(i,     0), 0),
    texelFetch(uBoneTex, ivec2(i + 1, 0), 0),
    texelFetch(uBoneTex, ivec2(i + 2, 0), 0),
    texelFetch(uBoneTex, ivec2(i + 3, 0), 0)
  );
}
#endif
#ifdef INSTANCED
layout(location=8) in mat4 aModel;
layout(location=12) in vec4 aParams;
#else
uniform mat4 uModel;
uniform vec4 uParams;
#endif

uniform mat4 uViewProj;
uniform vec3 uCameraPos;
uniform float uTime;

#ifdef GRASS
uniform vec3 uWindDir;
uniform float uWindStrength;
#endif

struct Surface {
  vec3 worldPos;
  vec3 normal;
  vec4 tangent;
  vec2 uv;
  vec4 params;
};

Surface computeSurface(){
  Surface s;
#ifdef INSTANCED
  mat4 model = aModel;
  s.params = aParams;
#else
  mat4 model = uModel;
  s.params = uParams;
#endif

  vec3 localPos = aPosition;
  vec3 localNrm = aNormal;
  vec3 localTan = aTangent.xyz;

#ifdef SKINNED
  mat4 skin =
      boneMatrix(aJoints.x) * aWeights.x
    + boneMatrix(aJoints.y) * aWeights.y
    + boneMatrix(aJoints.z) * aWeights.z
    + boneMatrix(aJoints.w) * aWeights.w;
  // A zero-weight vertex would collapse to the origin; fall back to identity.
  float wsum = aWeights.x + aWeights.y + aWeights.z + aWeights.w;
  if (wsum < 0.001) skin = mat4(1.0);
  localPos = (skin * vec4(localPos, 1.0)).xyz;
  localNrm = mat3(skin) * localNrm;
  localTan = mat3(skin) * localTan;
#endif

#ifdef GRASS
  // aParams.w carries a per-blade random seed; .xyz is the tint.
  float seed = s.params.w;
  float h = aUv.y;
  // Bend increases with the square of height: stiff at the root, loose at
  // the tip, which is how a real blade behaves.
  float stiffness = h * h;
  vec3 worldRoot = (model * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  // Two travelling waves at different scales read as gusts over a field.
  float phase = uTime * 1.6 + worldRoot.x * 0.22 + worldRoot.z * 0.19 + seed * 6.28;
  float gust = fbm3(vec3(worldRoot.xz * 0.06 + uTime * 0.09, 0.0)) * 1.4;
  float sway = (sin(phase) * 0.5 + sin(phase * 2.37 + 1.3) * 0.28) * (0.35 + gust);
  vec3 bend = uWindDir * sway * uWindStrength * stiffness;
  // Bending should not stretch the blade, so pull the tip down as it leans.
  localPos += bend;
  localPos.y -= dot(bend, bend) * 0.35;
  localNrm = normalize(localNrm - uWindDir * sway * uWindStrength * 0.5);
#endif

  vec4 wp = model * vec4(localPos, 1.0);
  s.worldPos = wp.xyz;

  // Normal matrix. For a rotation-times-scale transform (no shear, which the
  // engine never produces) the inverse-transpose is just each column divided
  // by its squared length — so non-uniform scale lights correctly without
  // shipping a second matrix per instance.
  vec3 c0 = model[0].xyz, c1 = model[1].xyz, c2 = model[2].xyz;
  vec3 invSq = 1.0 / max(vec3(dot(c0, c0), dot(c1, c1), dot(c2, c2)), vec3(1e-8));
  mat3 nm = mat3(c0 * invSq.x, c1 * invSq.y, c2 * invSq.z);

  s.normal = normalize(nm * localNrm);
  s.tangent = vec4(normalize(nm * localTan), aTangent.w);
  s.uv = aUv;
  return s;
}
`;

/* ---------------- main PBR pass ---------------- */

GLSL.pbrVert = `
${GLSL.common}
${GLSL.transform}

out vec3 vWorldPos;
out vec3 vNormal;
out vec4 vTangent;
out vec2 vUv;
out vec3 vTint;
out vec4 vParams;
out float vViewDepth;

void main(){
  Surface s = computeSurface();
  vWorldPos = s.worldPos;
  vNormal = s.normal;
  vTangent = s.tangent;
  vUv = s.uv;
  vTint = aColor;
  vParams = s.params;
  vViewDepth = length(s.worldPos - uCameraPos);
  gl_Position = uViewProj * vec4(s.worldPos, 1.0);
}
`;

GLSL.pbrFrag = `
${GLSL.common}
${GLSL.sky}
${GLSL.pbr}
${GLSL.shadow}
${GLSL.fog}

in vec3 vWorldPos;
in vec3 vNormal;
in vec4 vTangent;
in vec2 vUv;
in vec3 vTint;
in vec4 vParams;
in float vViewDepth;

uniform vec3 uCameraPos;
uniform float uTime;
uniform vec3 uBaseColor;
uniform float uRoughness;
uniform float uMetalness;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform float uUvScale;
uniform float uNormalStrength;
/* ---- world-projected UVs ----
   A box mesh is a UNIT cube scaled by the actor, and its UVs run 0..1
   across every face. So one uvScale means one tile across a face,
   whatever size that face is: a two-metre crate and a hundred-and-
   seventy-metre ground slab sharing a material get texel densities a
   hundred times apart, and the big one reads as flat shading with a
   smear on it. That is the whole of the "one wall is detailed and the
   next is just maths" fault -- it was never the recipe.

   With uWorldUv the texture is projected from world space down the
   surface's dominant axis instead, and uvScale becomes TILES PER
   METRE. A crate and a runway then carry the same grain, and a slab
   that is twelve metres one way and three the other stops being
   stretched three-to-one. The frame for the normal map has to come
   from the same projection, not from the mesh tangents, or the relief
   lights from the wrong direction on four faces out of six. */
uniform int uWorldUv;
/* ---- the detail layer ----
   Texel density, not more texture. See the block in main(). */
uniform float uDetailScale;
uniform float uDetailFade;
uniform float uDetail;
uniform float uSubsurface;
uniform int uHasMaps;
uniform int uReceiveShadow;
uniform int uDebugMode;
uniform sampler2D uAlbedoMap;
uniform sampler2D uNormalMap;
uniform sampler2D uOrmMap;
/* ---- FEATURE 6: CLEARCOAT AND SHEEN, PER MATERIAL ----
 *
 * Both default to 0 and both cost one uniform compare when they are.
 * They are NOT behind a quality tier, and that is the point: they are
 * material description, not an effect budget. A map that puts a coat
 * on a crane's paint or sheen on a uniform gets it on a phone, because
 * what it costs is a branch nobody takes on the other four hundred
 * materials in the scene. Nothing in the engine sets either today
 * except the two new presets in 40-material.js, so no existing pixel
 * moves.
 *
 * uClearcoatRough is the coat's own roughness, clamped away from 0 in
 * main() because a perfectly smooth GGX lobe is a delta function that
 * an analytic light can never hit.
 * uSheenColor is the cloth's retroreflective tint -- sheen has no
 * Fresnel, so this IS its reflectance and a saturated one is a strong
 * effect. */
uniform float uClearcoatWeight;
uniform float uClearcoatRough;
uniform float uSheenWeight;
uniform vec3  uSheenColor;
uniform float uSheenRough;

/* ================= PARALLAX OCCLUSION + DETAIL NORMALS =================
 *
 * WHERE THE HEIGHT COMES FROM. 40-material.js builds a full-resolution
 * height field for all 46 recipes -- it has to, because that is what
 * heightToNormal differentiates -- and packs it into uOrmMap.a, the one
 * channel of the three bound maps that nothing sampled. So this costs no
 * new texture, no new texture unit, no new upload path and not one byte
 * of memory. The pack is a FIXED affine window shared by every recipe:
 *
 *     height = alpha * HEIGHT_SPAN + HEIGHT_BIAS
 *
 * fixed, and not per-recipe normalised, because the relative depths are
 * physically right by construction: pantile really does have centimetres
 * of relief and a blued receiver has microns, and normalising each recipe
 * to its own extremes would put the same corrugations on both.
 *
 * THESE TWO NUMBERS ARE LITERALS, NOT UNIFORMS, AND THAT IS DELIBERATE.
 * An unbound uniform reads zero with no error (20-gl.js:98 no-ops an
 * unknown name), and a silently zero height span is a feature that does
 * nothing and leaves nothing to find. A literal cannot be silently zero.
 * engine/test/height.test.js reads both files and fails if they drift. */
const float PARALLAX_HEIGHT_BIAS = -0.45;
const float PARALLAX_HEIGHT_SPAN = 1.70;

/* Depth in UV units for a surface whose relief matches the reference
   recipe, already multiplied by the material's own parallax scale, by
   the tier, and by the distance fade. 0 means the whole march is
   skipped -- which is every tier but ultra, and every material that
   asked to stay flat. */
uniform float uParallaxDepth;
uniform float uParallaxSteps;
uniform float uParallaxFade;
/* This recipe's measured relief, in the same height units the recipes
   wrote: uParallaxTop is its highest point, uParallaxRange its peak to
   trough. Measured at bake time in the loop that was already walking
   every texel, carried on the shared maps object, bound per material.
   Nothing here guesses. */
uniform float uParallaxTop;
uniform float uParallaxRange;
/* 0/1. Gates the reoriented detail-normal blend, the decorrelating
   rotation, the detail roughness term and the Toksvig lift together, so
   one tier key turns the whole close-range package on and off and no
   tier can end up with half of it. */
uniform float uDetailNormal;

/* ---- one height tap ----
   textureGrad and not texture: the march below runs with a data-
   dependent trip count, where the implicit derivative chain is
   undefined, and an explicit-LOD fetch would throw away the anisotropic
   filtering that a grazing-angle effect needs more than any other pass
   in this renderer. The gradients are taken once, outside, from the
   unoffset UV.
   Returned as a 0..1 DEPTH -- 0 at this recipe's highest point, 1 at its
   lowest -- so the ray marches in the same space whatever the recipe. */
float pomDepth(vec2 uvp, vec2 ddx, vec2 ddy){
  float h = textureGrad(uOrmMap, uvp, ddx, ddy).a * PARALLAX_HEIGHT_SPAN + PARALLAX_HEIGHT_BIAS;
  return saturate1((uParallaxTop - h) / max(uParallaxRange, 1e-4));
}

/* ---- steep parallax occlusion mapping, with a binary refinement ----
 *
 * Vt is the view direction in tangent space, pointing away from the
 * surface; Vt.z is the cosine of the view angle. The returned value is
 * the UV offset to add before every other fetch.
 *
 * WHY Vt.z IS CLAMPED AT 0.30. The UV travelled per unit of depth is
 * Vt.xy / Vt.z, which runs away to infinity as the view goes edge on.
 * Unclamped, a wall at eighty-five degrees marches a fifth of a tile per
 * step and the mortar visibly swims as the head moves. 0.30 is
 * cos(72.5 deg); past that a texel is under a pixel wide along u for any
 * tiling this engine ships, so the fetch is mip blur and the extra reach
 * resolves nothing. The clamp also bounds the total excursion at
 * 3.33 * depthScale, which is what keeps the offset inside the
 * anisotropic footprint the driver is filtering over.
 *
 * WHY THE STEP COUNT MOVES WITH THE ANGLE. Head on, the ray is nearly a
 * point and one step would do; edge on it is the full 3.33 * depthScale
 * and needs every step there is. So the budget is spent where the ray is
 * long. The floor of a third keeps the near-normal case from striding so
 * coarsely that a deep pit is jumped clean over.
 *
 * WHY FIVE BINARY HALVINGS AND NOT SIX. The linear search leaves a
 * residual of one stride, 1/12 = 0.083 of the depth range at the high
 * step count. Five halvings cut that to 0.083/32 = 0.0026, and the
 * height channel is eight bits: 1/255 = 0.0039. A sixth halving refines
 * quantisation noise. That is also why twelve linear steps is the right
 * floor -- it is the coarsest stride five halvings can still resolve to
 * below what the texture can express. */
vec2 parallaxOffset(vec2 uvIn, vec3 Vt, float depthScale, float maxSteps){
  vec2 ray = (Vt.xy / max(Vt.z, 0.30)) * depthScale;
  vec2 ddx = dFdx(uvIn);
  vec2 ddy = dFdy(uvIn);

  float nf = mix(maxSteps, max(maxSteps * 0.34, 4.0), saturate1(Vt.z));
  int   n  = int(nf);
  float dz = 1.0 / nf;
  vec2  duv = ray * dz;

  float t = 0.0;                 // ray depth: 0 at the top, 1 at the floor
  vec2  p = uvIn;
  float d = pomDepth(p, ddx, ddy);
  float tPrev = 0.0;

  /* The hard 32 is the same guard the SSAO loop uses: a constant bound
     the compiler can unroll against, with the real count as an early
     break, so no tier can ever ask for an unbounded loop. */
  for (int i = 0; i < 32; i++) {
    if (i >= n || d <= t) break;
    tPrev = t;
    t += dz;
    p -= duv;
    d = pomDepth(p, ddx, ddy);
  }

  /* pLo is the last sample still above the height field, pHi the first
     one under it. UV is affine in t, so bisecting the pair bisects the
     depth interval with it. */
  float lo = tPrev, hi = t;
  vec2  pLo = p + duv, pHi = p;
  for (int i = 0; i < 5; i++) {
    float mid = (lo + hi) * 0.5;
    vec2  pm  = (pLo + pHi) * 0.5;
    float dm  = pomDepth(pm, ddx, ddy);
    if (dm > mid) { hi = mid; pHi = pm; }
    else          { lo = mid; pLo = pm; }
  }
  return pHi - uvIn;
}

/* ---- reoriented normal mapping (Barre-Brisebois & Hill, 2012) ----
   Summing the XY of two tangent-space normals, which is what the detail
   layer did, is only correct where the macro normal is flat. Where it is
   not, the fine slopes are being measured against the wrong plane, so
   grain on a steeply normal-mapped surface tilts the wrong way and
   partly cancels the relief it is supposed to sit on. RNM rotates the
   detail normal into the macro normal's frame first. That is the whole
   difference between grain that lies ON the brick and grain that argues
   with it.
   Written without the divide by t.z: t.z = n1.z + 1 is strictly
   positive, so dropping it only scales the result and the normalize
   takes the scale straight back out. */
vec3 rnmBlend(vec3 n1, vec3 n2){
  vec3 t = n1 + vec3(0.0, 0.0, 1.0);
  vec3 u = n2 * vec3(-1.0, -1.0, 1.0);
  return normalize(t * dot(t, u) - u * t.z);
}

/* ---- the detail layer is the same texture, and that is the problem ----
   Sampling the macro map nine times tighter puts a scale model of the
   pattern inside itself: tiny bricks inside each brick, tiny setts
   inside each sett. Once seen it cannot be unseen, and it is not a
   resolution fault, it is a LATTICE fault. Two copies of one pattern at
   a whole-number scale ratio share a lattice, so they line up, and the
   eye is extremely good at finding that.
   Rotating the fine copy breaks the shared lattice. tan(theta) = 1/phi
   = 0.6180 is chosen deliberately: the golden ratio is the worst-
   approximable irrational, so this is the rotation furthest from
   relining the two lattices up at any small period. The offset moves the
   fine copy's origin off the macro one so they do not agree at the tile
   corner either. Four multiplies and two adds.
   DR_C/DR_S are cos/sin of 31.717 degrees. */
const float DR_C = 0.85065081;
const float DR_S = 0.52573111;
const vec2  DR_O = vec2(0.37, 0.61);
vec2 detailRotate(vec2 p){
  return vec2(p.x * DR_C - p.y * DR_S, p.x * DR_S + p.y * DR_C) + DR_O;
}
/* And the detail normal's own XY has to come back out through the
   inverse rotation, or every fine slope in the game points 31.7 degrees
   away from the one it was baked at and the grain reads as lit from a
   direction the light is not in. */
vec2 detailUnrotate(vec2 p){
  return vec2(p.x * DR_C + p.y * DR_S, -p.x * DR_S + p.y * DR_C);
}


/* Extra point lights — small fixed budget, plenty for torches, muzzle
   flashes and glowing debris. */
uniform int uLightCount;
uniform vec4 uLightPos[8];    // xyz = position, w = radius
uniform vec4 uLightColor[8];  // rgb = colour, a = intensity

/* The view matrix, for the G-buffer normal only. Everything else in
   this shader works in world space; screen-space effects downstream do
   not, and converting once here is cheaper and more accurate than
   having each of them rebuild a view normal from world. */
uniform mat4 uView;

layout(location=0) out vec4 outColor;
/* ---- THE G-BUFFER ----
 *
 * Written by the opaque pass and discarded by the driver on every other
 * pass, because the renderer lowers the draw-buffer mask for them (see
 * _sceneTargets). Declaring it when there is no second attachment is
 * legal and the write goes nowhere, so this needs no #define and does
 * not double the shader permutation count.
 *
 *   .rg  view-space SHADING normal, octahedral, signed
 *   .b   perceptual roughness
 *   .a   metalness
 *
 * The shading normal, emphatically, and not the geometric one. A normal
 * reconstructed from the depth buffer -- which is what this renderer's
 * ambient occlusion does today -- is the normal of the depth surface,
 * so every bump the normal map puts on a brick wall is invisible to it.
 * That is the difference between a reflection that ripples across
 * mortar courses and one that slides over them as if the wall were
 * glass. */
layout(location=1) out vec4 outGBuffer;

void main(){
  vec2 uv = vUv * uUvScale;
  /* The projection axis, kept because the tangent frame below needs
     the same one. 0 = mesh UVs, 1 = +-X, 2 = +-Y, 3 = +-Z. */
  int uvAxis = 0;
  if (uWorldUv == 1) {
    vec3 an = abs(normalize(vNormal));
    vec3 wp = vWorldPos;
    if (an.y >= an.x && an.y >= an.z) { uvAxis = 2; uv = wp.xz * uUvScale; }
    else if (an.x >= an.z)            { uvAxis = 1; uv = wp.zy * uUvScale; }
    else                              { uvAxis = 3; uv = wp.xy * uUvScale; }
  }

  /* THE DETAIL LAYER.
   *
     Even at 1024 a texture stretched over a nine-metre wall is about a
     texel every centimetre, and with your face against it you are
     looking at one magnified tile. That is the difference between these
     surfaces and the reference ones up close, and it is a question of
     TEXEL DENSITY rather than of texture size -- going to 2048 would
     cost four times the memory and half the loading time to buy one
     more doubling.

     So the same texture is sampled a second time, tiled far tighter,
     and mixed in only where the camera is close enough to see it. It
     costs one extra fetch of a texture already resident and not one
     byte of memory. Faded out by distance because fine tiling at range
     is aliasing, which is worse than being soft, and because at ten
     metres nobody can see a millimetre anyway.

     The albedo is mixed around 1.0 rather than replaced -- this is a
     contrast modulation on the macro colour, not a second colour. Blend
     it in flat and every surface goes to the average of itself. */
  /* ---- PARALLAX OCCLUSION MAPPING ----
   *
   * This has to happen HERE, before the first fetch, because it moves
   * the UV that every fetch below uses -- albedo, ORM, the normal map
   * and the detail layer all have to read the point the eye actually
   * sees rather than the point the polygon is at. Which in turn means
   * the tangent frame has to exist up here, above the sampling block
   * that used to build it.
   *
   * The frame is rebuilt rather than shared with the normal-mapping
   * block below, and the duplication is on purpose: gating it on
   * uParallaxDepth > 0.0 costs one scalar compare on every tier that
   * has parallax off, which is every tier the test suite runs, against
   * a restructure of thirty lines of load-bearing tangent-frame code
   * that four other features are editing around. Twenty ALU ops at
   * ultra is the cheaper side of that trade by a wide margin.
   *
   * pomNormalLen is declared out here because the Toksvig term below
   * needs the macro normal's pre-normalisation length, which is
   * measured inside the normal-mapping block. 1.0 means "no variance",
   * which is what an untextured surface should read as. */
  vec3 Ng = normalize(vNormal);
  float pomNormalLen = 1.0;
  float pomDepthScale = 0.0;
  if (uHasMaps == 1 && uParallaxDepth > 0.0 && uParallaxRange > 1e-4) {
    /* Faded out with distance for the same reason the detail layer is:
       a stride that is invisible up close is aliasing at range, and
       aliasing is worse than soft. The window is wider than the detail
       layer's eleven metres because the relief is at the MACRO tile
       scale -- mortar courses, sett crowns, pantile rolls -- which is
       about nine times coarser than the 9x-tiled grain and so survives
       roughly three times further before its own steps start to
       shimmer. Renderer-level, so a map with unusually large or small
       architecture can move it. */
    float pDist = length(vWorldPos - uCameraPos);
    float pFade = 1.0 - smoothstep(uParallaxFade * 0.45, uParallaxFade, pDist);
    /* PER-RECIPE DEPTH, FROM THE MEASURED FIELD AND NOT FROM A GUESS.
       uParallaxRange is this recipe's real peak-to-trough in height
       units, measured at bake time. Dividing by brick's 0.82 makes
       brick the unit: pantile (1.357) comes out 1.66x deeper, concrete
       (0.537) 0.66x, marble (0.400) 0.49x, a blued receiver (0.035)
       0.04x -- which is the whole point, because a gun must not grow
       corrugations. The clamp at 2.2 stops a recipe nobody measured
       from opening a hole in a wall. */
    pomDepthScale = uParallaxDepth * clamp(uParallaxRange / 0.82, 0.0, 2.2) * pFade;
  }
  if (pomDepthScale > 0.0) {
    /* The same frame the normal-mapping block builds, for the same
       reason: with a world projection the relief has to be lit and
       marched down the projection's own axes, not the mesh tangents,
       or it comes out inside-out on four faces of six. */
    vec3 pT, pB;
    if (uvAxis != 0) {
      float sgn = uvAxis == 2 ? (vNormal.y < 0.0 ? -1.0 : 1.0)
                : uvAxis == 1 ? (vNormal.x < 0.0 ? -1.0 : 1.0)
                              : (vNormal.z < 0.0 ? -1.0 : 1.0);
      vec3 tw = uvAxis == 1 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
      vec3 bw = uvAxis == 2 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
      vec3 t0 = tw * sgn - Ng * dot(Ng, tw * sgn);
      pT = dot(t0, t0) > 1e-8 ? normalize(t0) : normalize(cross(Ng, bw));
      vec3 b0 = bw - Ng * dot(Ng, bw) - pT * dot(pT, bw);
      pB = dot(b0, b0) > 1e-8 ? normalize(b0) : cross(Ng, pT);
    } else {
      pT = normalize(vTangent.xyz - Ng * dot(Ng, vTangent.xyz));
      pB = cross(Ng, pT) * vTangent.w;
    }
    vec3 Vw = normalize(uCameraPos - vWorldPos);
    vec3 Vt = vec3(dot(Vw, pT), dot(Vw, pB), dot(Vw, Ng));
    /* SILHOUETTE SAFETY. Below cos 0.08 -- 85.4 degrees -- the surface
       is either turned away from the eye (a back face on a double-sided
       material, where marching would walk the relief the wrong way and
       turn every bump into a dent) or so close to edge on that the
       clamped ray is at full stretch and the whole tile is under a
       pixel. Both cases get the flat surface, which is what the eye
       sees there anyway. This is a HARD cut rather than a fade because
       the region it cuts is a few pixels wide on a silhouette and a
       fade across it costs a branch to hide nothing. */
    if (Vt.z > 0.08) {
      uv += parallaxOffset(uv, Vt, pomDepthScale, max(uParallaxSteps, 4.0));
    }
  }

  float detW = 0.0;
  vec2 dUv = uv;
  if (uHasMaps == 1 && uDetail > 0.001) {
    float dDist = length(vWorldPos - uCameraPos);
    detW = uDetail * (1.0 - smoothstep(uDetailFade * 0.30, uDetailFade, dDist));
    dUv = uv * uDetailScale;
    /* Decorrelated, so the fine copy stops being a scale model of the
       macro one. Gated with the rest of the close-range package so a
       tier that has it off samples exactly the UV it sampled before. */
    if (uDetailNormal > 0.5) dUv = detailRotate(dUv);
  }

  vec3 albedo = uBaseColor * vParams.rgb * vTint;
  float rough = uRoughness;
  float metal = uMetalness;
  float ao = 1.0;

  if (uHasMaps == 1) {
    vec4 tex = texture(uAlbedoMap, uv);
    albedo *= tex.rgb;
    if (detW > 0.001) {
      vec3 dA = texture(uAlbedoMap, dUv).rgb;
      /* DIVIDED BY ITS OWN MEAN, so this is contrast and not gain.
       *
         The first cut multiplied the detail sample by 1.85, a guess
         at twice the average texel. Compare the two frames and the
         detail version is plainly BRIGHTER, not just grainier -- timber
         averages nearer 0.65 than 0.54, so every wall using it got a
         twenty per cent lift it did not ask for, and the same constant
         would have darkened anything darker.

         The 1x1 mip IS the average of the texture. Dividing by it makes
         the layer exactly neutral by construction, for every recipe,
         with no constant to be wrong: light grain brightens, dark grain
         darkens, and the mean of the surface does not move. */
      vec3 dAvg = max(textureLod(uAlbedoMap, dUv, 20.0).rgb, vec3(0.004));
      albedo *= mix(vec3(1.0), dA / dAvg, detW * 0.55);
    }
    vec3 orm = texture(uOrmMap, uv).rgb;
    ao = orm.r;
    rough *= orm.g * 1.25;
    // The map only modulates metalness, never introduces it: a dielectric
    // stays dielectric no matter what the ORM texture says, while a metal
    // picks up the map's variation (rust patches, worn edges).
    metal = uMetalness * mix(1.0, orm.b, 0.85);

    /* ---- THE DETAIL LAYER REACHES ROUGHNESS, AT LAST ----
       It modulated albedo and it modulated the normal and it stopped
       there. 40-material.js's own note above the concrete recipe makes
       the argument against that better than this comment can: under an
       overcast sky a tilted normal returns very nearly the same shade,
       and the only channel that reads as relief is varied SHEEN. So at
       exactly the range where detail matters most -- face against the
       wall, no sun -- the one channel that would have sold it was
       frozen at the macro value.
       One more fetch of a texture that is already bound, already
       mipped and already being sampled twice fixes it, and the same
       fetch carries a micro-occlusion term for the ambient.
       Modulated around the detail tile's own mean, exactly the way the
       albedo is, so this is CONTRAST and not gain: a surface's average
       roughness does not move, which matters because every material in
       the game was authored against that average. The clamps are
       generous but finite -- a recipe with a near-black roughness texel
       must not turn a concrete wall into a mirror. */
    if (detW > 0.001 && uDetailNormal > 0.5) {
      vec4 dOrm = texture(uOrmMap, dUv);
      float dAvgR = max(textureLod(uOrmMap, dUv, 20.0).g, 0.02);
      rough *= mix(1.0, clamp(dOrm.g / dAvgR, 0.55, 1.80), detW * 0.45);
      ao    *= mix(1.0, clamp(dOrm.r, 0.35, 1.0), detW * 0.55);
    }
  }
  rough = clamp(rough, 0.035, 1.0);

  vec3 N = normalize(vNormal);
  if (uHasMaps == 1 && uNormalStrength > 0.001) {
    vec3 T, B;
    if (uvAxis != 0) {
      /* Match the projection exactly: u along the first axis of the
         pair the UV was built from, v along the second. Taking a cross
         product instead gets it right on two of the three axes and
         inside out on the third, because the three pairs are not all
         right-handed -- xz, zy and xy. So both are named.

         The sign flip is the back faces. Projecting world position
         mirrors the texture on the -X, -Y and -Z sides, and a mirrored
         normal map turns every bump into a dent. Flipping u with the
         facing puts the relief back the right way up. */
      float sgn = uvAxis == 2 ? (vNormal.y < 0.0 ? -1.0 : 1.0)
                : uvAxis == 1 ? (vNormal.x < 0.0 ? -1.0 : 1.0)
                              : (vNormal.z < 0.0 ? -1.0 : 1.0);
      vec3 tw = uvAxis == 1 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
      vec3 bw = uvAxis == 2 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
      vec3 t0 = tw * sgn - N * dot(N, tw * sgn);
      T = dot(t0, t0) > 1e-8 ? normalize(t0) : normalize(cross(N, bw));
      vec3 b0 = bw - N * dot(N, bw) - T * dot(T, bw);
      B = dot(b0, b0) > 1e-8 ? normalize(b0) : cross(N, T);
    } else {
      T = normalize(vTangent.xyz - N * dot(N, vTangent.xyz));
      B = cross(N, T) * vTangent.w;
    }
    vec3 tnRaw = texture(uNormalMap, uv).xyz * 2.0 - 1.0;
    /* The length of the sampled vector BEFORE it is renormalised is a
       free variance measurement. The mip filter averages the stored
       vectors, so a texel whose neighbours disagreed comes back SHORT,
       and how short says how much slope this pixel has averaged away.
       Captured here and spent on roughness after the frame is built --
       see the Toksvig block below. */
    pomNormalLen = clamp(length(tnRaw), 0.25, 1.0);
    vec3 tn = tnRaw;
    tn.xy *= uNormalStrength;
    if (detW > 0.001) {
      vec3 dn = texture(uNormalMap, dUv).xyz * 2.0 - 1.0;
      if (uDetailNormal > 0.5) {
        /* Out of the decorrelating rotation first, then faded by
           distance and by the material's own normal strength, then
           composited with RNM instead of summed. dn.z is floored
           because a normal map texel that quantised to z <= 0 would
           make the blend flip the detail inside out. */
        dn.xy = detailUnrotate(dn.xy) * uNormalStrength * detW * 0.8;
        dn.z  = max(dn.z, 0.05);
        tn = rnmBlend(normalize(tn), normalize(dn));
      } else {
        /* The original additive blend, kept verbatim, so a tier with
           detail normals off renders the identical picture it did. */
        tn.xy += dn.xy * uNormalStrength * detW * 0.8;
      }
    }
    N = normalize(mat3(T, B, N) * normalize(tn));
  }
  // Back-facing geometry (double-sided leaves, glass) must not light black.
  if (!gl_FrontFacing) N = -N;
  /* ---- THE GEOMETRIC NORMAL, KEPT ----
   *
   * N above has the normal map, the detail layer and (where feature 5
   * is on) a parallax offset in it, and can be tilted a long way off
   * the triangle. Two things below need to know where the triangle
   * actually is:
   *
   *   horizonOcclusion -- because a reflection that points below the
   *     real surface is fetching sky the surface is standing in front
   *     of, which is the fake rim on every worn metal edge;
   *   the clearcoat lobe and its reflection vector -- because a layer
   *     of lacquer is SMOOTH OVER the relief underneath it. A coat that
   *     picked up the base's bumps would just be a second copy of the
   *     base highlight, which is not what varnish looks like on wood or
   *     paint on a panel.
   *
   * Deliberately its own name and its own declaration rather than a
   * reference to anything earlier in main(): this is feature 6's lane,
   * and the back-face flip has to be applied to it exactly as it is
   * applied to N or a double-sided leaf gets a coat highlight lit from
   * behind.
   *
   * Behind the same gate as its two consumers so that a frame with
   * neither does not pay the normalize. Seeded from N rather than left
   * undefined: if a later author reads it outside the gate they get the
   * shading normal, which is wrong but not garbage. */
  vec3 geoN = N;
  if (uSpecOcclusion > 0.0 || uClearcoatWeight > 0.0) {
    geoN = normalize(vNormal);
    if (!gl_FrontFacing) geoN = -geoN;
  }

  /* ---- TOKSVIG: DISTANT BUMPY SURFACES GET ROUGHER, NOT SPARKLIER ----
   *
   * A tiled roof, chain-link, tread plate, a gravel path. At range the
   * normal map's mip chain averages the bumps away and the surface
   * flattens into a small mirror that catches the sun on one frame and
   * misses it on the next. That is the crawl, and nothing downstream
   * removes it, because the signal genuinely aliased in the shading --
   * FXAA and TAA can only average a sparkle that has already happened.
   *
   * The fix is Toksvig's and the measurement was free: |n| = 1 means one
   * slope under this pixel, |n| = 0.8 means a spread of them, and a
   * spread of slopes IS a wider specular lobe, which is what roughness
   * is. Converted through the Blinn power the two models share:
   *     s  = 2/alpha^2 - 2,  ft = |n| / (|n| + s(1 - |n|)),  s' = ft*s
   * and back. s' <= s always, so this can only ever roughen.
   *
   * THE 0.985 FLOOR IS NOT ARBITRARY. An eight-bit normal map quantises
   * each component to 2/255 = 0.0078, so a unit vector comes back with
   * |n| as low as 0.993 at mip 0 with no averaging at all. Engaging
   * below 0.985 keeps quantisation noise out of it entirely: a flat
   * surface close up is untouched, bit for bit. 0.86 is where the
   * averaged spread is wide enough that Toksvig's approximation is the
   * dominant term rather than a correction to it. */
  float tVar = 1.0 - smoothstep(0.86, 0.985, pomNormalLen);
  if (uDetailNormal > 0.5 && tVar > 0.001) {
    float al  = max(rough * rough, 1e-3);
    float s   = 2.0 / (al * al) - 2.0;
    float ft  = pomNormalLen / max(pomNormalLen + s * (1.0 - pomNormalLen), 1e-4);
    float alT = sqrt(2.0 / max(ft * s + 2.0, 2.0));
    rough = clamp(mix(rough, sqrt(alT), tVar), rough, 1.0);
  }

  vec3 V = normalize(uCameraPos - vWorldPos);
  float NoV = max(dot(N, V), 1e-4);
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  vec3 diffuseColor = albedo * (1.0 - metal);

  vec3 color = vec3(0.0);
  /* ---- FEATURE 6 PER-FRAGMENT SETUP ----
   *
   * Everything the three new lobes share, computed once. F0, rough and
   * NoV are all final by this point, so the sun, all eight punctual
   * lights and the ambient term read one evaluation of each of these
   * rather than eight or ten.
   *
   * WRITTEN SO THE DEFAULT MATERIAL COMPUTES ALMOST NOTHING. The first
   * cut evaluated the coat's Fresnel -- a pow(x, 5) -- unconditionally,
   * on the reasoning that it multiplies out to 1 when there is no coat.
   * It does, and on SwiftShader it also cost 60 per cent of the frame
   * at the low tier, on every material in the game, to compute a number
   * that was always 1. A transcendental is not free just because its
   * result is. Everything below is inside the branch that needs it, and
   * both branches are on a UNIFORM, so they are coherent across the
   * whole draw call rather than per pixel.
   *
   * msComp is vec3(1.0) exactly when the tier has the energy half off;
   * specularMultiScatter returns on its first line in that case. */
  vec3 msComp = vec3(1.0);
  if (uSpecEnergy > 0.0) msComp = specularMultiScatter(F0, rough, NoV, uSpecEnergy);

  float ccW = saturate1(uClearcoatWeight);
  float shW = saturate1(uSheenWeight);
  float ccRough = clamp(uClearcoatRough, 0.03, 1.0);
  float shRough = clamp(uSheenRough, 0.07, 1.0);
  /* What reaches the layers underneath the coat and the cloth. Starts
     at exactly 1.0, and 1.0 is an exact multiply in IEEE 754 -- which
     is why every base term below can be written as "... * baseAtten"
     with no second branch and still produce, for an ordinary material,
     the bits the shader produced before this feature existed. */
  float baseAtten = 1.0;
  float NoVc = NoV;
  if (ccW > 0.0) {
    /* The geometric normal, because the coat is flat over the base's
       relief. A coat reflecting 12% of the light at this angle can only
       pass 88% of it down; the second pass of the same Fresnel on the
       way back out is the higher-order term glTF's single-scatter
       clearcoat leaves out, and so does this. */
    NoVc = max(dot(geoN, V), 1e-4);
    baseAtten -= ccW * (0.04 + 0.96 * pow(1.0 - NoVc, 5.0));
  }
  if (shW > 0.0) {
    /* Sheen takes energy off the base by its own directional albedo,
       weighted by how strongly the cloth is tinted. Without this a
       sheened material is simply brighter than the same material
       without sheen, which is the classic way a sheen lobe breaks a
       grey chart. */
    float shE = sheenDirAlbedo(NoV) * shW
      * max(max(uSheenColor.r, uSheenColor.g), uSheenColor.b);
    baseAtten *= 1.0 - saturate1(shE);
  }

  /* --- sun --- */
  vec3 L = normalize(uSunDir);
  float NoL = dot(N, L);
  float shadow = 1.0;
  if (uReceiveShadow == 1) shadow = shadowFactor(vWorldPos, vViewDepth, max(NoL, 0.0));

  // Debug views. Cheap to keep — a black screen or a missing shadow is
  // otherwise almost impossible to diagnose from the final image alone.
  if (uDebugMode > 0) {
    if (uDebugMode == 1) { outColor = vec4(vec3(shadow), 1.0); return; }
    if (uDebugMode == 2) { outColor = vec4(N * 0.5 + 0.5, 1.0); return; }
    if (uDebugMode == 3) { outColor = vec4(albedo, 1.0); return; }
    if (uDebugMode == 4) { outColor = vec4(vec3(rough), 1.0); return; }
    if (uDebugMode == 5) { outColor = vec4(vec3(vViewDepth / 60.0), 1.0); return; }
  }

  if (NoL > 0.0) {
    vec3 H = normalize(V + L);
    float NoH = max(dot(N, H), 0.0);
    float VoH = max(dot(V, H), 0.0);
    float D = distributionGGX(NoH, rough);
    vec3 F = fresnelSchlick(VoH, F0);
    /* THE VISIBILITY TERM, GATED BY A UNIFORM AND NOT BY A MIX.
       The condition is the same for every fragment in the draw call, so
       one side is executed and the other is not -- there is no
       divergence to pay for and a tier with uSpecEnergy 0 does not
       evaluate the new term at all. The else branch is the original
       expression character for character, including its 1e-4 clamp, so
       that tier's frame is bit-identical. */
    vec3 spec;
    if (uSpecEnergy > 0.0) {
      spec = D * visSmithGGX(NoV, NoL, rough) * F * msComp;
    } else {
      float G = geometrySmith(NoV, NoL, rough);
      spec = (D * G * F) / max(4.0 * NoV * NoL, 1e-4);
    }
    vec3 kD = (vec3(1.0) - F);
    vec3 radiance = uSunColor * uSunIntensity;
    color += (kD * diffuseColor * INV_PI + spec) * baseAtten * radiance * NoL * shadow;

    /* The coat's own highlight, on top of the base it just attenuated.
       Its own normal, its own roughness, its own Fresnel at LoH -- and
       no metalness, because a clearcoat is always a dielectric at
       IOR 1.5. This is what puts a sharp window reflection on a
       varnished stock while the walnut underneath stays soft. */
    if (ccW > 0.0) {
      float NoLc = max(dot(geoN, L), 0.0);
      if (NoLc > 0.0) {
        float NoHc = max(dot(geoN, H), 0.0);
        float LoH = max(dot(L, H), 1e-4);
        float Dc = distributionGGX(NoHc, ccRough);
        float Fc = 0.04 + 0.96 * pow(1.0 - LoH, 5.0);
        color += Dc * visKelemen(LoH) * Fc * ccW * radiance * NoLc * shadow;
      }
    }
    /* And the cloth's rim. No Fresnel: uSheenColor IS the lobe's
       reflectance. The shading normal rather than the geometric one,
       because a weave's rim follows the weave. */
    if (shW > 0.0) {
      color += uSheenColor * distributionCharlie(NoH, shRough)
        * visAshikhmin(NoV, NoL) * shW * radiance * NoL * shadow;
    }
  }

  /* --- subsurface wrap: light bleeding through thin surfaces --- */
  if (uSubsurface > 0.0) {
    float back = saturate1(dot(-N, L) * 0.5 + 0.5);
    float wrap = pow(back, 2.0) * uSubsurface;
    // Transmission is tinted by the material, warmed slightly.
    color += diffuseColor * uSunColor * uSunIntensity * wrap * 0.55 * mix(0.35, 1.0, shadow);
  }

  /* --- ambient from the sky ---
   *
     SHADOWED POINTS SEE LESS SKY, and until this line they saw all of
     it. The sky irradiance here is a hemisphere lookup on the normal
     with nothing between it and the surface: a wall inside a room with
     a roof on it got exactly the same ambient as the same wall out in
     the open. Which is why every interior in the game -- the hotel
     lobby, the bunker, the cottage -- rendered as flat grey fill. It
     was not the textures on those walls and it was not the tiling. A
     surface lit by a uniform hemisphere and nothing else has no shape,
     whatever is painted on it.

     Proper sky visibility means tracing the hemisphere, which this
     engine is not going to do at sixty frames on a phone. But there is
     already a buffer that knows what is above a point: the SUN SHADOW
     MAP. Physically it answers a different question -- is the sun
     blocked, not is the sky blocked -- and for the occluders that
     actually matter here they are the same object. A roof blocks both.
     A crate blocks both, from most of the sky it covers.

     So a shadowed point keeps (1 - uSkyOcclusion) of its sky. Indoors
     that is the roof putting the room in half light, which is what
     makes lamps, muzzle flash and the light out of a doorway read as
     light instead of as colour. Outdoors it is the reason a shadow on
     a sunlit map looks like a shadow rather than a grey patch.

     Two things are deliberately left out of it. The punctual lights,
     because a torch in a dark room must not be dimmed by the roof that
     makes the room dark. And uRoomAmbient, which is the floor under
     the whole thing -- the term that stops an unlit interior going to
     black. Specular gets three quarters of the attenuation rather than
     all of it: a polished floor indoors still catches the doorway. */
  float skyVis = mix(1.0 - uSkyOcclusion, 1.0, shadow);
  vec3 irradiance = envIrradiance(N) * skyVis;
  vec3 kS = fresnelSchlickRough(NoV, F0, rough);
  vec3 kD = (vec3(1.0) - kS) * (1.0 - metal);
  vec3 R = reflect(-V, N);
  // Rough surfaces reflect an increasingly averaged sky.
  /* The baked probe when there is one, and the analytic lerp this
     line used to be when there is not -- envRadiance holds both, so
     the shape of the ambient term here is unchanged. */
  vec3 envSpec = envRadiance(R, N, rough)
    * mix(skyVis, 1.0, 0.25) + uRoomAmbient;
  /* ---- FEATURE 6: THE AMBIENT SPECULAR, CORRECTED ----
     Three multiplies on one term, each of them off by default.

     msComp: the same multiple-scattering factor the direct lobes use.
       Without it a rough metal is energy-correct under the sun and
       still dead under the sky, which is worse than being wrong in
       both -- the two halves of its shading would disagree.

     specularOcclusion x horizonOcclusion: the reason a crevice stops
       glowing. The first says a narrow lobe escapes a crease that a
       diffuse hemisphere could not; the second says a reflection
       pointing below the triangle is not a reflection at all. They
       multiply because they occlude different things -- the AO map's
       cavity, and the geometry's own horizon.

     KEPT OFF THE DIFFUSE DELIBERATELY. The scalar ao already
     multiplies the whole ambient sum on the line below, which is the
     term underside.test.js measures and interior.test.js's ratio
     depends on. Specular occlusion is an additional, narrower cut and
     it only ever touches the specular half. */
  vec3 ambSpec = envSpec * envBRDF(F0, rough, NoV);
  if (uSpecEnergy > 0.0) {
    /* Ess FROM THE SAME SPLIT-SUM THE LOBE JUST USED, and not from the
       fit msComp carries. envBRDF returns F0*A + B, so at F0 = 1 it is
       A + B, which IS the single-scatter directional albedo of exactly
       this lobe -- the integrated table at ultra, the analytic fit
       everywhere else. Compensating against it makes the white furnace
       return exactly 1 either way. Using msComp here instead overshot
       by up to 20% at mid roughness on the furnace rig, because the
       fit and the table disagree by that much and the error lands
       entirely on rough metal. One extra LUT tap, on the tier that
       has a LUT. */
    ambSpec *= msFromEss(F0, envBRDF(vec3(1.0), rough, NoV).r, uSpecEnergy);
  }
  if (uSpecOcclusion > 0.0) {
    float so = specularOcclusion(NoV, ao, rough) * horizonOcclusion(R, geoN);
    ambSpec *= mix(1.0, so, uSpecOcclusion);
  }
  color += (kD * diffuseColor * irradiance + ambSpec) * ao * baseAtten;

  /* The coat's share of the environment, at the coat's roughness. This
     is the whole read of lacquer: a sharp sky sitting in the varnish
     over a soft one in the paint. envBRDF with a hard 0.04 because the
     coat is always a dielectric; no horizon term, because Rc is built
     from geoN and dot(Rc, geoN) = NoVc >= 0 makes it identically 1. */
  if (ccW > 0.0) {
    vec3 Rc = reflect(-V, geoN);
    vec3 ccEnv = envRadiance(Rc, geoN, ccRough) * mix(skyVis, 1.0, 0.25) + uRoomAmbient;
    vec3 ccSpec = ccEnv * envBRDF(vec3(0.04), ccRough, NoVc) * ccW;
    if (uSpecOcclusion > 0.0) {
      ccSpec *= mix(1.0, specularOcclusion(NoVc, ao, ccRough), uSpecOcclusion);
    }
    color += ccSpec * ao;
  }
  /* Ambient sheen. The Charlie lobe is broad and retroreflective, so
     the diffuse irradiance is the right probe for it rather than a
     mirror direction -- and weighting by the same directional albedo
     that took the energy off the base keeps the two in step. Without
     this line cloth only gets its rim in direct sun, and a uniform in
     shade goes back to looking like cardboard. */
  if (shW > 0.0) {
    color += uSheenColor * irradiance * sheenDirAlbedo(NoV) * shW * ao;
  }

  /* --- punctual lights --- */
  for (int i = 0; i < 8; i++) {
    if (i >= uLightCount) break;
    vec3 toL = uLightPos[i].xyz - vWorldPos;
    float dist = length(toL);
    float radius = uLightPos[i].w;
    if (dist > radius) continue;
    vec3 Li = toL / max(dist, 1e-4);
    float lNoL = max(dot(N, Li), 0.0);
    if (lNoL <= 0.0) continue;
    // Windowed inverse-square: physical falloff that still reaches zero.
    float d2 = dist * dist;
    float win = saturate1(1.0 - pow(dist / radius, 4.0));
    float atten = (win * win) / (d2 + 1.0);
    vec3 H = normalize(V + Li);
    float NoH = max(dot(N, H), 0.0);
    float D = distributionGGX(NoH, rough);
    vec3 F = fresnelSchlick(max(dot(V, H), 0.0), F0);
    vec3 spec;
    if (uSpecEnergy > 0.0) {
      spec = D * visSmithGGX(NoV, lNoL, rough) * F * msComp;
    } else {
      float G = geometrySmith(NoV, lNoL, rough);
      spec = (D * G * F) / max(4.0 * NoV * lNoL, 1e-4);
    }
    vec3 radiance = uLightColor[i].rgb * uLightColor[i].a * atten;
    color += ((vec3(1.0) - F) * diffuseColor * INV_PI + spec) * baseAtten * radiance * lNoL;
    /* Coat and cloth under a torch or a muzzle flash, the same two
       lobes the sun gets. Both conditions are uniform across the draw,
       so a scene of ordinary materials runs the loop it ran before. */
    if (ccW > 0.0) {
      float NoLc = max(dot(geoN, Li), 0.0);
      if (NoLc > 0.0) {
        float NoHc = max(dot(geoN, H), 0.0);
        float LoH = max(dot(Li, H), 1e-4);
        float Dc = distributionGGX(NoHc, ccRough);
        float Fc = 0.04 + 0.96 * pow(1.0 - LoH, 5.0);
        color += Dc * visKelemen(LoH) * Fc * ccW * radiance * NoLc;
      }
    }
    if (shW > 0.0) {
      color += uSheenColor * distributionCharlie(NoH, shRough)
        * visAshikhmin(NoV, lNoL) * shW * radiance * lNoL;
    }
  }

  color += uEmissive;

  vec3 viewDir = normalize(vWorldPos - uCameraPos);
  color = applyFog(color, vWorldPos, uCameraPos, viewDir);

  float alpha = uOpacity;
#ifdef ALPHA_CLIP
  // Grass blades taper to nothing; clipping keeps the silhouette crisp.
  if (uHasMaps == 1) alpha *= texture(uAlbedoMap, uv).a;
  if (alpha < 0.35) discard;
  alpha = 1.0;
#endif
  outColor = vec4(color, alpha);

  /* The G-buffer. The renderer masks attachment 1 off for every pass but
     the opaque one, so on those passes this write is discarded by the
     driver and on a tier with no G-buffer at all it goes nowhere.
     mat3(uView) is the rotation of the view matrix -- the translation is
     irrelevant to a direction -- and the result is renormalised because
     the view matrix is not guaranteed orthonormal once a non-uniform
     scale is in the stack. */
  outGBuffer = vec4(octEncode(normalize(mat3(uView) * N)), rough, metal);
}
`;

/* ---------------- shadow pass ---------------- */

GLSL.shadowVert = `
${GLSL.common}
${GLSL.transform}
out vec2 vUv;
void main(){
  Surface s = computeSurface();
  vUv = s.uv;
  gl_Position = uViewProj * vec4(s.worldPos, 1.0);
}
`;

GLSL.shadowFrag = `
in vec2 vUv;
/* THE BLOCKER DEPTH, for PCSS.
 *
 * Declared unconditionally and written unconditionally, with no #define,
 * because the shadow framebuffer only HAS a colour attachment on the
 * tiers that asked for PCSS. On every other tier the target is
 * depth-only, its draw-buffer list is [NONE] (see the Framebuffer
 * constructor in 20-gl.js), and this write is discarded by the driver --
 * which is legal, silent and free, and is the same arrangement the
 * G-buffer output in pbrFrag already relies on. The alternative, a fifth
 * #define on the shadow path, doubles a program cache that is already
 * four defines deep and pays for it in SwiftShader compiles inside the
 * 120-second boot windows of killcam, mpplay and mpshell.
 *
 * gl_FragCoord.z and not a hand-rolled distance: the cascade projection
 * is ORTHOGRAPHIC, so this is already linear in metres along the light,
 * which is the whole reason one byte of it is enough. */
layout(location=0) out float outBlocker;
void main(){
  outBlocker = gl_FragCoord.z;
}
`;

/* ---------------- sky background ---------------- */

GLSL.skyVert = `
layout(location=0) in vec2 aPos;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
out vec3 vDir;
void main(){
  // Unproject the far plane to get a world-space ray per pixel.
  vec4 far = uInvViewProj * vec4(aPos, 1.0, 1.0);
  vDir = far.xyz / far.w - uCameraPos;
  gl_Position = vec4(aPos, 1.0, 1.0);
}
`;

GLSL.skyFrag = `
${GLSL.common}
${GLSL.sky}
uniform float uTime;
uniform float uCloudAmount;
in vec3 vDir;
layout(location=0) out vec4 outColor;

void main(){
  vec3 dir = normalize(vDir);
  vec3 col = skyRadiance(dir);

  if (uCloudAmount > 0.0 && dir.y > 0.005) {
    // Project onto a flat cloud plane; cheap, and correct enough that the
    // clouds compress toward the horizon the way real ones do.
    vec2 cp = dir.xz / dir.y * 0.35;
    vec3 q = vec3(cp + uTime * 0.012, uTime * 0.02);
    float d = fbm3(q * 1.4);
    d += fbm3(q * 3.7 + 4.0) * 0.35;
    float cover = smoothstep(0.52 - uCloudAmount * 0.28, 0.86, d);
    cover *= smoothstep(0.0, 0.16, dir.y);
    // Light the cloud from the sun side so it has a bright rim.
    float lit = saturate1(dot(dir, uSunDir) * 0.5 + 0.5);
    vec3 cloudCol = mix(vec3(0.55, 0.58, 0.66), uSunColor * 1.25, pow(lit, 2.0)) * uSkyIntensity;
    col = mix(col, cloudCol, cover * 0.9);
  }
  outColor = vec4(col, 1.0);
}
`;

/* ---------------- particles ---------------- */

GLSL.particleVert = `
${GLSL.common}
layout(location=0) in vec2 aCorner;
layout(location=8) in vec4 aPosSize;   // xyz world position, w size
layout(location=9) in vec4 aColor;     // rgb tint, a alpha
layout(location=10) in vec4 aExtra;    // x rotation, y fade, z type, w seed

uniform mat4 uViewProj;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;

out vec2 vUv;
out vec4 vColor;
out float vType;
out float vSeed;

void main(){
  float c = cos(aExtra.x), s = sin(aExtra.x);
  vec2 corner = vec2(aCorner.x * c - aCorner.y * s, aCorner.x * s + aCorner.y * c);
  vec3 world = aPosSize.xyz + (uCameraRight * corner.x + uCameraUp * corner.y) * aPosSize.w;
  vUv = aCorner * 0.5 + 0.5;
  vColor = aColor;
  vType = aExtra.z;
  vSeed = aExtra.w;
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

GLSL.particleFrag = `
${GLSL.common}
in vec2 vUv;
in vec4 vColor;
in float vType;
in float vSeed;
uniform float uTime;
layout(location=0) out vec4 outColor;

void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  float alpha = vColor.a;
  vec3 col = vColor.rgb;

  if (vType < 0.5) {
    // Spark: hot, tight core with a fast falloff.
    alpha *= pow(saturate1(1.0 - r), 2.5);
    col *= 1.0 + (1.0 - r) * 2.0;
  } else if (vType < 1.5) {
    // Smoke/dust: soft, noisy, turbulent edge.
    float n = fbm3(vec3(p * 1.7 + vSeed * 17.0, uTime * 0.28 + vSeed * 4.0));
    float edge = saturate1(1.0 - r - n * 0.42);
    alpha *= smoothstep(0.0, 0.55, edge) * 0.85;
  } else {
    // Fire: banded, rising, bright at the centre.
    float n = fbm3(vec3(p * 2.4 + vSeed * 9.0, uTime * 1.4));
    float body = saturate1(1.0 - r + n * 0.3 - 0.15);
    alpha *= smoothstep(0.0, 0.6, body);
    col = mix(col, vec3(1.0, 0.92, 0.55), pow(saturate1(1.0 - r), 3.0)) * (1.4 + n);
  }

  if (alpha < 0.004) discard;
  outColor = vec4(col * alpha, alpha);
}
`;

/* ---------------- water: screen-space fluid ---------------- */

/* Particles are splatted as spheres into a depth buffer, that depth is
   smoothed, and normals come from its derivatives. This is how you get a
   continuous liquid surface out of a particle sim without meshing it. */
GLSL.fluidDepthVert = `
layout(location=0) in vec2 aCorner;
layout(location=8) in vec4 aPosSize;
uniform mat4 uViewProj;
uniform mat4 uView;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
out vec2 vCorner;
out vec3 vViewCenter;
out float vRadius;
void main(){
  vec3 world = aPosSize.xyz + (uCameraRight * aCorner.x + uCameraUp * aCorner.y) * aPosSize.w;
  vCorner = aCorner;
  vViewCenter = (uView * vec4(aPosSize.xyz, 1.0)).xyz;
  vRadius = aPosSize.w;
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

GLSL.fluidDepthFrag = `
in vec2 vCorner;
in vec3 vViewCenter;
in float vRadius;
uniform mat4 uProj;
layout(location=0) out vec4 outDepth;
void main(){
  float r2 = dot(vCorner, vCorner);
  if (r2 > 1.0) discard;
  // Push the fragment onto the front of a sphere rather than a flat disc,
  // so overlapping particles merge into a rounded surface.
  float z = sqrt(1.0 - r2);
  vec3 viewPos = vViewCenter + vec3(vCorner, z) * vRadius;
  vec4 clip = uProj * vec4(viewPos, 1.0);
  float ndc = clip.z / clip.w;
  gl_FragDepth = ndc * 0.5 + 0.5;
  // Store view-space depth as a positive distance.
  outDepth = vec4(-viewPos.z, 0.0, 0.0, 1.0);
}
`;

GLSL.fluidBlurFrag = `
${GLSL.common}
in vec2 vUv;
uniform sampler2D uDepthTex;
uniform vec2 uTexel;
uniform vec2 uDir;
uniform float uRadius;
layout(location=0) out vec4 outDepth;
void main(){
  float center = texture(uDepthTex, vUv).r;
  if (center <= 0.0) { outDepth = vec4(0.0); return; }
  float sum = center, wsum = 1.0;
  // Bilateral: a plain blur would smear the surface across silhouettes and
  // dissolve the boundary between near and far water.
  for (int i = 1; i <= 12; i++) {
    float fi = float(i);
    vec2 off = uDir * uTexel * fi * uRadius;
    for (int s = 0; s < 2; s++) {
      vec2 uv = vUv + (s == 0 ? off : -off);
      float d = texture(uDepthTex, uv).r;
      if (d <= 0.0) continue;
      float spatial = exp(-fi * fi / 32.0);
      float range = exp(-(d - center) * (d - center) * 24.0);
      float w = spatial * range;
      sum += d * w;
      wsum += w;
    }
  }
  outDepth = vec4(sum / wsum, 0.0, 0.0, 1.0);
}
`;

GLSL.fluidShadeFrag = `
${GLSL.common}
${GLSL.sky}
${GLSL.pbr}
${GLSL.fog}
in vec2 vUv;
uniform sampler2D uDepthTex;
uniform sampler2D uSceneTex;
uniform sampler2D uThickTex;
uniform mat4 uInvProj;
uniform mat4 uInvView;
uniform vec2 uTexel;
uniform vec3 uCameraPos;
uniform vec3 uWaterColor;
uniform vec3 uDeepColor;
uniform float uTime;
layout(location=0) out vec4 outColor;

vec3 viewPosFromDepth(vec2 uv, float viewZ){
  // Rebuild the view ray through this pixel, then walk it out to viewZ.
  vec4 clip = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  vec4 eye = uInvProj * clip;
  vec3 dir = eye.xyz / eye.w;
  dir /= -dir.z;
  return dir * viewZ;
}

void main(){
  float d = texture(uDepthTex, vUv).r;
  vec3 scene = texture(uSceneTex, vUv).rgb;
  if (d <= 0.0) { outColor = vec4(scene, 1.0); return; }

  vec3 viewPos = viewPosFromDepth(vUv, d);

  // Normals from screen-space derivatives of the reconstructed position.
  // Picking the smaller one-sided difference keeps edges sharp.
  vec3 ddxV = viewPosFromDepth(vUv + vec2(uTexel.x, 0.0), texture(uDepthTex, vUv + vec2(uTexel.x, 0.0)).r) - viewPos;
  vec3 ddxV2 = viewPos - viewPosFromDepth(vUv - vec2(uTexel.x, 0.0), texture(uDepthTex, vUv - vec2(uTexel.x, 0.0)).r);
  if (abs(ddxV2.z) < abs(ddxV.z)) ddxV = ddxV2;
  vec3 ddyV = viewPosFromDepth(vUv + vec2(0.0, uTexel.y), texture(uDepthTex, vUv + vec2(0.0, uTexel.y)).r) - viewPos;
  vec3 ddyV2 = viewPos - viewPosFromDepth(vUv - vec2(0.0, uTexel.y), texture(uDepthTex, vUv - vec2(0.0, uTexel.y)).r);
  if (abs(ddyV2.z) < abs(ddyV.z)) ddyV = ddyV2;

  vec3 nView = normalize(cross(ddxV, ddyV));
  if (nView.z < 0.0) nView = -nView;
  vec3 N = normalize(mat3(uInvView) * nView);
  vec3 worldPos = (uInvView * vec4(viewPos, 1.0)).xyz;

  // Ripple detail on top of the sim's large-scale shape.
  float ripple = fbm3(vec3(worldPos.xz * 3.2, uTime * 0.9)) - 0.5;
  vec3 rippleN = normalize(N + vec3(ripple * 0.28, 0.0, ripple * 0.24));
  N = normalize(mix(N, rippleN, 0.55));

  vec3 V = normalize(uCameraPos - worldPos);
  float NoV = max(dot(N, V), 1e-4);

  float thickness = texture(uThickTex, vUv).r;
  // Beer-Lambert: thick water goes deep blue-green, thin water stays clear.
  vec3 absorb = exp(-thickness * vec3(2.6, 1.5, 1.1) * 1.4);
  vec3 tint = mix(uDeepColor, uWaterColor, absorb.b);

  // Refraction: offset the scene lookup by the surface normal.
  vec2 refrUv = clamp(vUv + N.xz * 0.045 * min(thickness * 2.0, 1.0), vec2(0.001), vec2(0.999));
  vec3 refracted = texture(uSceneTex, refrUv).rgb * absorb;
  refracted = mix(tint * 0.55, refracted, absorb);

  vec3 R = reflect(-V, N);
  vec3 reflected = skyRadiance(R);

  // Schlick Fresnel with water's F0.
  float F = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
  vec3 color = mix(refracted, reflected, F);

  // Specular glint from the sun makes the surface read as liquid.
  vec3 H = normalize(V + uSunDir);
  float spec = pow(max(dot(N, H), 0.0), 220.0);
  color += uSunColor * uSunIntensity * spec * 1.6;

  // Foam where the sheet is thin and choppy — splashes and breaking edges.
  float foam = smoothstep(0.34, 0.06, thickness) * smoothstep(0.2, 0.75, abs(ripple) * 2.4 + 0.28);
  color = mix(color, vec3(0.92, 0.96, 1.0) * uSkyIntensity, foam * 0.55);

  color = applyFog(color, worldPos, uCameraPos, normalize(worldPos - uCameraPos));
  outColor = vec4(color, 1.0);
}
`;

GLSL.fluidThickFrag = `
in vec2 vCorner;
layout(location=0) out vec4 outThick;
void main(){
  float r2 = dot(vCorner, vCorner);
  if (r2 > 1.0) discard;
  // Additive chord length through the sphere = how much water is in front.
  outThick = vec4(sqrt(1.0 - r2) * 0.06, 0.0, 0.0, 1.0);
}
`;

GLSL.fluidThickVert = `
layout(location=0) in vec2 aCorner;
layout(location=8) in vec4 aPosSize;
uniform mat4 uViewProj;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
out vec2 vCorner;
void main(){
  vec3 world = aPosSize.xyz + (uCameraRight * aCorner.x + uCameraUp * aCorner.y) * aPosSize.w;
  vCorner = aCorner;
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

/* ---------------- post processing ---------------- */

GLSL.brightFrag = `
${GLSL.common}
in vec2 vUv;
uniform sampler2D uTex;
uniform float uThreshold;
uniform float uSoftKnee;
layout(location=0) out vec4 outColor;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Soft knee: a hard threshold makes bloom pop in and out as objects move.
  float knee = uThreshold * uSoftKnee + 1e-5;
  float soft = clamp(lum - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  float contrib = max(soft, lum - uThreshold) / max(lum, 1e-5);
  outColor = vec4(c * contrib, 1.0);
}
`;

GLSL.blurFrag = `
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform vec2 uDir;
layout(location=0) out vec4 outColor;
void main(){
  // 9-tap Gaussian folded into 5 bilinear fetches.
  vec2 o1 = uDir * uTexel * 1.3846153846;
  vec2 o2 = uDir * uTexel * 3.2307692308;
  vec3 c = texture(uTex, vUv).rgb * 0.2270270270;
  c += texture(uTex, vUv + o1).rgb * 0.3162162162;
  c += texture(uTex, vUv - o1).rgb * 0.3162162162;
  c += texture(uTex, vUv + o2).rgb * 0.0702702703;
  c += texture(uTex, vUv - o2).rgb * 0.0702702703;
  outColor = vec4(c, 1.0);
}
`;

GLSL.compositeFrag = `
${GLSL.common}
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom0;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uVignette;
uniform float uChromatic;
uniform float uSaturation;
uniform float uContrast;
uniform float uGrain;
/* A COLOUR CAST OVER THE WHOLE FRAME, which the grade could not do.
   exposure, saturation and contrast can wash a picture out or crush it,
   and none of them can make it GREEN -- so night vision and a thermal
   optic had no way to look like anything, which is part of why they were
   booleans nobody read. uTintMix of 0 is the old behaviour exactly. */
uniform vec3 uTint;
uniform float uTintMix;
uniform float uTime;
uniform float uSharpen;
uniform float uPosterize;
/* 0 = the Narkowicz ACES fit this shipped with, 1 = AgX. A switch and
   not a silent replacement, because the two put the same scene in
   visibly different places and every pixel-asserting test in the suite
   was baselined against the old one. */
uniform int uToneMap;
uniform float uAgxPunch;
uniform float uAgxSat;
uniform sampler2D uAo;
uniform float uAoStrength;
uniform vec2 uTexel;
layout(location=0) out vec4 outColor;

/* ACES filmic tonemap (Narkowicz fit). Without a real tonemapper, bright
   HDR values clip to flat white and the whole image looks amateur.

   KEPT, BUT NO LONGER THE DEFAULT. See agx() below for what replaced it
   and, more usefully, for the measurement that said it had to be. */
vec3 acesFilm(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return saturate3((x * (a * x + b)) / (x * (c * x + d) + e));
}

/* ================================================================
   AgX
   ================================================================
   WHY THE TONEMAPPER WAS THE FIRST THING TO CHANGE, measured before
   anything was touched. Four views, histogrammed straight off
   readPixels at quality high:

       view          mean   <64     >224   160-223
       town-street   177    1.3%    0.4%   75%
       town-inside    71   62.4%    0.0%    1%
       demo-crane    148    6.5%    2.7%   48%
       demo-rubble   130   22.7%    0.0%   50%

   A sunlit street with three quarters of the frame inside two adjacent
   brightness bands, no shade and no glare -- and the shadows were being
   drawn the whole time, two 4096 cascades of them. Nothing in the frame
   was allowed to get dark enough to see them. The SAME renderer indoors
   crushed sixty-two per cent of the frame below 64.

   Washed out in the open and crushed indoors, at once, is not a grade
   problem: whichever way a contrast slider is pushed one of those two
   views gets worse, and that was measured too -- contrast 1.35 took the
   street's mean from 177 to 195 and made it FLATTER.

   What both ends have in common is the curve. The Narkowicz ACES fit is
   a two-parameter rational that was designed to be cheap, and what it
   is cheap at is the middle: it has almost no toe and a shoulder that
   rolls off late, so dark input stays proportionally dark (crush) and
   bright input piles up under white without ever reaching it (wash).

   AgX is a display transform rather than a curve fit. It rotates into a
   wider working primary set (the inset matrix), does its shaping in log
   exposure across a fixed -12.47..+4.03 EV window, and rotates back.
   Two things follow that matter here:

     A REAL TOE AND A REAL SHOULDER. The sigmoid is fitted across the
     whole EV window, so the bottom two stops get compressed into
     usable shade instead of collapsing, and the top two roll into
     white smoothly instead of stacking under it.

     HUE HOLDS THROUGH THE HIGHLIGHTS. This is the one that matters for
     this game specifically. Under ACES a bright saturated colour skews
     toward yellow-white as it clips, because the channels saturate at
     different rates -- which is exactly what a muzzle flash, a tracer,
     the Blaze gun's fire and the sun were doing. AgX's inset keeps the
     channels from separating, so a red-hot thing stays red as it gets
     brighter.

   THE 2.2 AT THE END IS NOT A MISTAKE. agx() finishes by raising its
   result to 2.2 to put it back into LINEAR, because the composite does
   its own sRGB encode afterwards (see the long note at the encode about
   why the grade has to run after it). Without that power the picture
   would be encoded twice and come out milk. */
const mat3 AGX_IN = mat3(
  0.8424790622530940, 0.0423282422610123, 0.0423756549057051,
  0.0784335999999992, 0.8784686364697720, 0.0784336000000000,
  0.0792237451477643, 0.0791661274605434, 0.8791429737931040);
const mat3 AGX_OUT = mat3(
   1.1968790051201700, -0.0528968517574562, -0.0529716355144438,
  -0.0980208811401368,  1.1519031299041700, -0.0980434501171241,
  -0.0990297440797205, -0.0989611768448433,  1.1510736726411600);

/* Sixth-order fit of the AgX sigmoid. The real transform is a pair of
   fitted power functions meeting at the pivot; this polynomial is the
   standard approximation and is within a thousandth of it across the
   whole window, which is far below one code value at 8 bits. */
vec3 agxSigmoid(vec3 x){
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2
       - 40.14 * x4 * x
       + 31.96 * x4
       - 6.868 * x2 * x
       + 0.4298 * x2
       + 0.1191 * x
       - 0.00232;
}

/* The look. AgX proper is deliberately neutral -- it is a display
   transform, not a grade -- and neutral on its own reads as flat to
   anyone expecting a game. punch is a power on the already-shaped value
   (below 1 lifts the mids, above 1 deepens them) and sat rotates around
   luminance. Both default to doing nothing, so the transform can be
   measured on its own before a look is put on top of it. */
vec3 agxLook(vec3 c, float punch, float sat){
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 p = pow(max(c, vec3(0.0)), vec3(punch));
  return max(luma + sat * (p - luma), vec3(0.0));
}

vec3 agx(vec3 col, float punch, float sat){
  const float minEv = -12.47393;
  const float maxEv = 4.026069;
  col = AGX_IN * max(col, vec3(0.0));
  /* Guard the log. A zero pixel is not rare -- it is every pixel of an
     unlit interior -- and log2(0) is -inf, which propagates through the
     matrix on the way out and paints NaN. */
  col = log2(max(col, vec3(1e-10)));
  col = clamp((col - minEv) / (maxEv - minEv), 0.0, 1.0);
  col = agxSigmoid(col);
  col = agxLook(col, punch, sat);
  col = AGX_OUT * col;
  /* Back to linear for the encode the composite does itself. */
  return pow(max(col, vec3(0.0)), vec3(2.2));
}

void main(){
  vec2 uv = vUv;
  vec2 fromCenter = uv - 0.5;
  float r2 = dot(fromCenter, fromCenter);

  vec3 color;
  if (uChromatic > 0.0) {
    // Lateral chromatic aberration grows toward the frame edge.
    vec2 off = fromCenter * r2 * uChromatic;
    color.r = texture(uScene, uv + off).r;
    color.g = texture(uScene, uv).g;
    color.b = texture(uScene, uv - off).b;
  } else {
    color = texture(uScene, uv).rgb;
  }

  /* Contrast-adaptive sharpening.
   *
   * Supersampling at 1.75x and letting the browser scale the canvas down
   * gives a clean image with no stair-stepping, but downsampling always
   * costs a little acuity -- edges come back very slightly soft. A small
   * unsharp mask against the four neighbours puts the definition back
   * without the white haloes a naive sharpen leaves, because the amount
   * is scaled by how much local contrast there already is: flat walls are
   * left alone, edges get the lift. This is what "not blocky and not
   * smooth" actually means as an operation. */
  if (uSharpen > 0.0) {
    vec3 n1 = texture(uScene, uv + vec2( uTexel.x, 0.0)).rgb;
    vec3 n2 = texture(uScene, uv + vec2(-uTexel.x, 0.0)).rgb;
    vec3 n3 = texture(uScene, uv + vec2(0.0,  uTexel.y)).rgb;
    vec3 n4 = texture(uScene, uv + vec2(0.0, -uTexel.y)).rgb;
    vec3 blur = (n1 + n2 + n3 + n4) * 0.25;
    vec3 d = color - blur;
    // How much the neighbourhood already varies, so flat areas stay flat
    // and noise does not get amplified into sparkle.
    float local = length(max(max(abs(n1 - color), abs(n2 - color)),
                             max(abs(n3 - color), abs(n4 - color))));
    color += d * uSharpen * saturate1(local * 6.0);
  }

  /* Ambient occlusion, multiplied in before the light is tonemapped.
     Contact darkening where surfaces meet is most of what separates a
     rendered room from a lit box. */
  if (uAoStrength > 0.0) {
    float ao = texture(uAo, uv).r;
    color *= mix(1.0, ao, uAoStrength);
  }

  vec3 bloom = texture(uBloom0, uv).rgb * 0.5
             + texture(uBloom1, uv).rgb * 0.32
             + texture(uBloom2, uv).rgb * 0.18;
  color += bloom * uBloomStrength;

  color *= uExposure;
  color = uToneMap == 1 ? agx(color, uAgxPunch, uAgxSat) : acesFilm(color);

  /* TO DISPLAY SPACE FIRST, AND THEN GRADE.
   *
     The grade below pivots contrast around 0.5, which is mid-grey ONLY
     once the picture has been encoded. ACES hands back a linear value,
     where mid-grey is 0.18, and for a long time the encode was the last
     thing in the shader -- so a pivot meant for display space was being
     applied to linear light.

     That is not a subtle mis-shaping. Expand the line at the contrast
     the game actually ships: (x - 0.5) * 1.04 + 0.5 is 1.04x - 0.02, so
     it SUBTRACTS A FLAT TWO HUNDREDTHS from linear light, and anything
     dimmer than 0.0192 clamps to absolute zero. Linear 0.0192 encodes
     to sRGB 0.18, so that threw away every shadow below 45 out of 255 --
     the darkest fifth of the picture, gone, as one solid black with no
     detail anywhere in it.

     It is why the underside of dark materials stayed black however much
     bounce light was put into them: the light was arriving and the
     grade was subtracting it again. A brick sphere's underside measured
     6.7 out of 255 and did not move -- 6.7, then 6.8 -- as the ground
     bounce was swept from nothing to the whole of what a diffuse ground
     really sends back.

     So: encode, then grade, which is what the comment always said. */
  color = pow(saturate3(color), vec3(1.0 / 2.2));

  // Grade in display space: contrast around mid-grey, then saturation.
  color = saturate3((color - 0.5) * uContrast + 0.5);
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(lum), color, uSaturation);

  /* Tint on the LUMINANCE, not on the colour. Multiplying the picture by
     green leaves a red wall black, because a red wall has no green in it
     to keep -- an image tube does not work that way round. What comes out
     of one is brightness written in one colour, so that is what this
     does, and the mix fades between the graded picture and it. */
  if (uTintMix > 0.0) color = mix(color, uTint * (lum + 0.06), saturate1(uTintMix));

  color *= 1.0 - saturate1(r2 * uVignette);

  if (uGrain > 0.0) {
    float n = hash12(gl_FragCoord.xy + fract(uTime) * 173.0) - 0.5;
    color += n * uGrain;
  }
  color = saturate3(color);

  /* Retro: quantise to a small palette AFTER the grade, the way a machine
     with an eight-bit framebuffer would. Doing it in linear space instead
     bands the shadows and leaves the highlights smooth, which is the
     opposite of how those machines looked. */
  if (uPosterize > 0.0) {
    color = floor(color * uPosterize + 0.5) / uPosterize;
  }
  outColor = vec4(color, 1.0);
}
`;

/* Screen-space ambient occlusion.
 *
 * The single biggest thing missing from this renderer's look. Every
 * surface was lit as though nothing around it existed, so a concrete room
 * came out as a set of evenly lit planes -- the corners, the underside of
 * every beam, the join where a crate meets the floor, all of it as bright
 * as an open wall. Contact darkening is most of what makes a rendered
 * room read as a room.
 *
 * Normals are reconstructed from depth rather than carried in a G-buffer.
 * That costs a little accuracy at silhouettes and saves an entire
 * render target and a second geometry pass, which on a browser game is
 * the right trade. The derivative pair is chosen per-pixel from whichever
 * neighbour is closer in depth, so the reconstruction does not smear a
 * normal across an edge and put a halo round everything.
 */
GLSL.ssaoFrag = `
${GLSL.common}
in vec2 vUv;
uniform sampler2D uDepth;
uniform mat4 uInvProj;
uniform mat4 uProj;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uBias;
uniform float uIntensity;
uniform float uAoFloor;
uniform int uSamples;
uniform float uTime;
layout(location=0) out vec4 outColor;

vec3 viewPos(vec2 uv){
  float d = texture(uDepth, uv).r;
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * c;
  return v.xyz / v.w;
}

void main(){
  float d0 = texture(uDepth, vUv).r;
  // Nothing behind the sky.
  if (d0 >= 0.99999) { outColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);

  /* Reconstruct the normal from the closer neighbour on each axis, so an
     edge does not blend two surfaces into one bogus normal. */
  vec3 pxR = viewPos(vUv + vec2(uTexel.x, 0.0)) - P;
  vec3 pxL = P - viewPos(vUv - vec2(uTexel.x, 0.0));
  vec3 pyU = viewPos(vUv + vec2(0.0, uTexel.y)) - P;
  vec3 pyD = P - viewPos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(pxR.z) < abs(pxL.z) ? pxR : pxL;
  vec3 dy = abs(pyU.z) < abs(pyD.z) ? pyU : pyD;
  vec3 N = normalize(cross(dx, dy));
  if (N.z < 0.0) N = -N;

  // A per-pixel rotation, so the sample pattern does not print itself
  // onto the image as a repeating grid.
  float ang = hash12(gl_FragCoord.xy) * 6.2831853;
  float ca = cos(ang), sa = sin(ang);

  /* Occlusion measured against the SURFACE NORMAL, not against depth.
   *
   * The first version asked "is the scene in front of this sample point",
   * which on a large flat surface is true for half the samples simply
   * because they are coplanar with it -- the floor of the bunker came out
   * pure black. What actually occludes a point is a neighbour standing
   * ABOVE its plane, so the contribution is how far above that plane the
   * neighbour is: dot(normalize(Q - P), N). Coplanar neighbours give zero
   * and a flat floor is left alone, which is the whole difference between
   * ambient occlusion and a dark smear. */
  float occ = 0.0;
  int n = uSamples;
  for (int i = 0; i < 32; i++) {
    if (i >= n) break;
    float fi = float(i) + 0.5;
    // A spiral: golden angle around, square root out, so the samples are
    // spread evenly by area instead of clumping in the middle.
    float t = fi / float(n);
    float r = sqrt(t);
    float phi = fi * 2.3999632;
    vec2 disk = vec2(cos(phi), sin(phi)) * r;
    vec2 rot = vec2(disk.x * ca - disk.y * sa, disk.x * sa + disk.y * ca);
    vec3 dir = normalize(vec3(rot, 0.45 + 0.55 * t));
    if (dot(dir, N) < 0.0) dir = -dir;
    vec3 S = P + dir * uRadius * (0.30 + 0.70 * t);

    vec4 clip = uProj * vec4(S, 1.0);
    vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    vec3 Q = viewPos(suv);
    vec3 v = Q - P;
    float len = length(v);
    if (len < 0.0001) continue;
    // How far above P's own plane the neighbour sits. Zero when coplanar.
    float above = dot(v / len, N) - uBias;
    if (above <= 0.0) continue;
    // And a wall a long way behind must not darken what is in front of
    // it, which is the classic halo.
    float range = uRadius / (uRadius + max(0.0, len - uRadius));
    occ += above * range;
  }
  float ao = 1.0 - (occ / float(n)) * uIntensity;
  // Floored: see the note where uAoFloor is set. This term multiplies the
  // direct sun as well as the ambient, so it must not reach zero.
  outColor = vec4(clamp(ao, uAoFloor, 1.0), 0.0, 0.0, 1.0);
}
`;

/* A cross blur over the AO, to take the sampling noise out of it without
   crossing a depth edge and bleeding occlusion onto a foreground object. */
GLSL.ssaoBlurFrag = `
${GLSL.common}
in vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uDepth;
uniform vec2 uTexel;
uniform vec2 uDir;
layout(location=0) out vec4 outColor;
void main(){
  float centre = texture(uDepth, vUv).r;
  float sum = 0.0, wsum = 0.0;
  // Wider than it looks like it needs to be: at half resolution with a
  // per-pixel rotated sample pattern the AO comes out blotchy, and the
  // blotches are lower frequency than the noise.
  for (int i = -5; i <= 5; i++) {
    vec2 o = uDir * uTexel * float(i);
    float d = texture(uDepth, vUv + o).r;
    // Weight by how close in depth: past a small difference it is a
    // different surface and must not be averaged in.
    float w = exp(-abs(d - centre) * 900.0) * exp(-float(i * i) * 0.09);
    sum += texture(uTex, vUv + o).r * w;
    wsum += w;
  }
  outColor = vec4(wsum > 0.0 ? sum / wsum : texture(uTex, vUv).r, 0.0, 0.0, 1.0);
}
`;

GLSL.fxaaFrag = `
${GLSL.common}
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
layout(location=0) out vec4 outColor;

/* FXAA 3.11 console variant — one dependent texture fetch pair, and it
   runs after tonemapping where the luma is perceptually meaningful. */
void main(){
  vec3 rgbM = texture(uTex, vUv).rgb;
  vec3 rgbNW = texture(uTex, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture(uTex, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture(uTex, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 rgbSE = texture(uTex, vUv + vec2(1.0, 1.0) * uTexel).rgb;

  const vec3 luma = vec3(0.299, 0.587, 0.114);
  float lNW = dot(rgbNW, luma), lNE = dot(rgbNE, luma);
  float lSW = dot(rgbSW, luma), lSE = dot(rgbSE, luma);
  float lM = dot(rgbM, luma);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));

  // Flat areas are left untouched, which keeps textures from going soft.
  if (lMax - lMin < max(0.0312, lMax * 0.125)) { outColor = vec4(rgbM, 1.0); return; }

  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * uTexel;

  vec3 rgbA = 0.5 * (texture(uTex, vUv + dir * (1.0 / 3.0 - 0.5)).rgb
                   + texture(uTex, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture(uTex, vUv + dir * -0.5).rgb
                                 + texture(uTex, vUv + dir * 0.5).rgb);
  float lB = dot(rgbB, luma);
  outColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
}
`;

/* ================================================================
   VOLUMETRIC SCATTERING — SUNLIGHT YOU CAN SEE IN THE AIR
   ================================================================
   Feature 4. Every uniform here is uVol*.

   WHAT IS MISSING WITHOUT THIS. Fog in this renderer is one closed-form
   exponential evaluated per surface pixel (applyFog, in GLSL.fog). It
   knows the distance to the surface and nothing else -- in particular
   it has never read the shadow map, so the air in a sunbeam and the air
   in the shadow beside it are painted exactly the same value. That is
   why there is no god ray anywhere in this game: not through a doorway,
   not through the crane lattice, not out of a tunnel mouth. The volume
   between the camera and the wall carries no light at all.

   WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT.

   THIS PASS ADDS EXACTLY ONE THING: the single-scattered SUN, shadowed.
   It does NOT add ambient or sky in-scattering, and it does NOT
   attenuate the background. Both of those already exist and are tuned
   per map -- applyFog's `mix(color, fogCol, fogAmount)` IS the ambient
   source term and IS the extinction, applied together. Adding either
   again would double-count it, and multiplying an already-fogged pixel
   by a second transmittance would darken the fog colour itself, which
   is simply wrong: a fully-fogged pixel is pure fogCol and must stay
   pure fogCol.

   THAT IS WHY volB's ALPHA IS 1.0. The fold in GLSL.screenSpaceFrag
   reads it as a transmittance and does
   `scene * mix(1.0, vol.a, uVolStrength) + vol.rgb * uVolStrength`.
   With alpha 1.0 the multiply is a deliberate no-op and this feature is
   purely additive. Do not "fix" it by writing a transmittance there
   without first removing the extinction from applyFog.

   (volA's alpha is NOT 1.0 -- it carries the marched pixel's distance
   in metres, which is what the bilateral blur below uses to refuse to
   cross a silhouette. Two buffers, two meanings, stated here because
   they are one texture format apart.)

   HOW IT COUPLES TO THE MAP'S FOG. Density is uFogDensity times one
   scale, height falloff is the map's uFogHeight/uFogHeightFalloff
   sampled PER STEP rather than at the ray midpoint, and the scattering
   is tinted by the hue of uFogColor. A map that dials its fog up gets
   thicker shafts, with no new API to learn and nothing to keep in sync.
   Measured on the rig: clearing the air by a factor of twenty-five
   takes the beam to 15 per cent of its brightness. Not to nothing --
   the medium saturates, so density decides where along the ray the
   light is picked up more than how much of it there is.

   THE MEDIUM IS NOT THE AERIAL HAZE, and this is the one honest
   approximation in the file. uFogDensity is an EXTINCTION coefficient
   for kilometre-scale aerial perspective: 0.0104 on the bunker map is
   1/e at 96 m. Beams are made visible by local airborne dust and
   moisture, which is an order denser. uVolDensity is therefore
   uFogDensity * volumetric.densityScale, default 8 -- and that 8 is
   pinned from both ends by arithmetic and by measurement; see the note
   on it in the renderer.
   ---------------------------------------------------------------- */
GLSL.volumetricFrag = `
${GLSL.common}
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
`;

/* ----------------------------------------------------------------
   THE DEPTH-AWARE BLUR — volA -> volB, half res, one pass.

   Two jobs. It dissolves the residual dither (nine IGN phases averaged
   per output texel, on top of the bilinear footprint of a 1.5-texel
   offset, so the effective step count is roughly an order up on the
   twenty-four the march paid for), and it refuses to cross a
   silhouette, so the shaft behind a railing does not bleed onto the
   railing.

   ONE 3x3 RATHER THAN TWO SEPARABLE PASSES. A separable pair is cheaper
   per unit of radius above about 5x5 and more expensive below it -- two
   full-screen draws, two clears and a round trip through a second
   target to save nothing at 3x3. The signal is a broad glow; it does
   not need radius, it needs the dither gone.

   The depth tolerance is scaled by the depth itself, in the same form
   the reflection blur beside it uses: half a metre apart is an edge at
   two metres and is nothing at fifty.
   ---------------------------------------------------------------- */
GLSL.volBlurFrag = `
${GLSL.common}
in vec2 vUv;
uniform sampler2D uVolSrc;
uniform vec2 uVolTexel;
layout(location=0) out vec4 outColor;

void main(){
  vec4  c    = texture(uVolSrc, vUv);
  float zc   = c.a;
  vec3  sum  = c.rgb;
  float wsum = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      if (x == 0 && y == 0) continue;
      vec2  o = vec2(float(x), float(y)) * 1.5 * uVolTexel;
      vec4  s = texture(uVolSrc, vUv + o);
      float wz = exp(-abs(s.a - zc) / max(0.25, abs(zc) * 0.08));
      float wg = (x == 0 || y == 0) ? 0.75 : 0.5;
      float w  = wz * wg;
      sum  += s.rgb * w;
      wsum += w;
    }
  }
  /* ALPHA 1.0, ON PURPOSE. This is what the fold multiplies the scene
     by; see the long note on GLSL.volumetricFrag. The analytic height
     fog already owns extinction and this term is purely additive. */
  outColor = vec4(sum / wsum, 1.0);
}
`;

GLSL.copyFrag = `
in vec2 vUv;
uniform sampler2D uTex;
layout(location=0) out vec4 outColor;
void main(){ outColor = texture(uTex, vUv); }
`;
/* ================= SCREEN-SPACE CONTACT SHADOWS =================
 *
 * WHAT THE CASCADES CANNOT SEE. A shadow texel at the 'high' tier is
 * 2*radius/shadowRes -- about 7.8 mm across for cascade 0 and 47 mm for
 * cascade 1. Anything thinner is invisible to the shadow map: a magazine
 * lying on a table, a finger curled round a forend, a bolt head standing
 * off a receiver, a casing on concrete. Worse, the depth bias that keeps
 * the cascade free of acne is 0.0009 + slope*0.0035 of proj.z, and over
 * cascade 0's ~64 m orthographic range that is 5 cm to 24 cm of WORLD
 * depth -- so even an object the map can resolve casts nothing within a
 * hand's width of where it touches. That gap is the reason small objects
 * in this renderer look like they are hovering rather than resting.
 *
 * A short ray march against the depth buffer catches all of it, because
 * the depth buffer's texel is a screen pixel and its precision is the
 * near plane's, not the cascade's.
 *
 * WHY THIS IS A SEPARATE PASS AND NOT A FEW LINES IN pbrFrag.
 * pbrFrag renders INTO hdrA, whose depth attachment is hdrA's depth
 * texture. Sampling a texture that is attached to the framebuffer being
 * drawn into is a rendering feedback loop: ANGLE raises
 * INVALID_OPERATION and drops the draw, and browser.test.js's console
 * filter (/performance|deprecat|SwiftShader|Fallback/i) does not swallow
 * that -- it would fail "no runtime errors" in all eight scenes. A
 * forward renderer can only read scene depth in its own fragment shader
 * if it has run a depth PREPASS first: a second full geometry
 * submission, 173 extra draw calls in the real multiplayer map, which is
 * a CPU cost this engine cannot absorb for an effect this small. So the
 * march runs in present(), where hdrA is no longer bound and its depth
 * is an ordinary texture -- exactly as the ambient-occlusion pass
 * already reads it.
 *
 * WHERE THE RESULT LANDS, AND THE APPROXIMATION IN IT. It is multiplied
 * into the ambient-occlusion buffer, which the composite applies as
 * `color *= mix(1.0, ao, uAoStrength)`. That darkens the ambient AND the
 * direct sun, where strictly a sun-direction occlusion term should
 * darken only the sun. Stated plainly so nobody files it as a bug: the
 * correct home is inside the sun BRDF in pbrFrag, and getting there
 * needs either the prepass above or a deferred sun. What the
 * approximation costs is that the seam under a magazine is a little
 * darker in ambient than physics wants; what it buys is zero new
 * framebuffers, zero composite changes and one half-resolution draw. The
 * march is strictly directional -- it marches toward the sun and is
 * gated on the surface facing it -- so it never invents occlusion in a
 * direction the light is not coming from.
 */
GLSL.contactFrag = `
${GLSL.common}
in vec2 vUv;
uniform sampler2D uContactDepth;    // hdrA.depthTexture, FULL resolution
uniform sampler2D uContactAo;       // the blurred AO this pass multiplies
uniform mat4 uContactInvProj;
uniform mat4 uContactProj;
uniform vec3 uContactLightView;     // unit, view space, pointing AT the sun
uniform vec2 uContactTexel;         // 1 / this pass's own (half) size
uniform float uContactLength;       // ray length, world metres
uniform float uContactMaxPixels;    // and its cap, in this pass's pixels
uniform float uContactThickness;    // an occluder thicker than this is scenery
uniform float uContactBias;         // floor under the measured slope bias
uniform float uContactStrength;
uniform float uContactFade;         // camera distance at which it is gone
uniform int uContactSteps;
layout(location=0) out vec4 outColor;

vec3 contactViewPos(vec2 uv, float d){
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uContactInvProj * c;
  return v.xyz / v.w;
}
/* View-space z alone, for the march. The sky is pushed to minus infinity
   rather than left at the far plane so a ray that runs off the geometry
   can never register a hit against it. */
float contactViewZ(vec2 uv){
  float d = texture(uContactDepth, uv).r;
  if (d >= 0.99999) return -1.0e9;
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uContactInvProj * c;
  return v.z / v.w;
}

void main(){
  float ao = texture(uContactAo, vUv).r;
  float d0 = texture(uContactDepth, vUv).r;
  if (uContactSteps <= 0 || uContactStrength <= 0.0 || d0 >= 0.99999) {
    outColor = vec4(ao);
    return;
  }

  vec3 P = contactViewPos(vUv, d0);
  float dist = -P.z;
  /* Contact shadows are a close-range effect by construction: past a
     dozen metres the gap they draw is thinner than a pixel and all the
     march can return is noise. Faded rather than cut, or the boundary is
     itself a visible ring across the frame. */
  float fade = 1.0 - saturate1((dist - uContactFade * 0.65) / max(uContactFade * 0.35, 1e-3));
  if (fade <= 0.0) { outColor = vec4(ao); return; }

  /* The geometric normal, reconstructed from the CLOSER neighbour on each
     axis so a silhouette does not tilt the plane across it -- the same
     reconstruction the ambient-occlusion pass uses, and for the same
     reason. This pass wants the geometric normal and not the shading one:
     it is asking whether the ray starts above the surface, which is a
     question about the depth buffer, not about the normal map. */
  vec2 e = uContactTexel;
  float dL = texture(uContactDepth, vUv - vec2(e.x, 0.0)).r;
  float dR = texture(uContactDepth, vUv + vec2(e.x, 0.0)).r;
  float dD = texture(uContactDepth, vUv - vec2(0.0, e.y)).r;
  float dU = texture(uContactDepth, vUv + vec2(0.0, e.y)).r;
  vec3 ddx = (abs(dR - d0) < abs(d0 - dL))
    ? contactViewPos(vUv + vec2(e.x, 0.0), dR) - P
    : P - contactViewPos(vUv - vec2(e.x, 0.0), dL);
  vec3 ddy = (abs(dU - d0) < abs(d0 - dD))
    ? contactViewPos(vUv + vec2(0.0, e.y), dU) - P
    : P - contactViewPos(vUv - vec2(0.0, e.y), dD);
  vec3 N = normalize(cross(ddx, ddy));
  if (dot(N, P) > 0.0) N = -N;      // a visible surface faces the camera

  /* THE BIAS, MEASURED RATHER THAN GUESSED. This is the number the
     effect lives or dies on, and a world-space constant cannot be it.
     The march compares the ray's view depth against the depth buffer at
     the pixel the ray lands in, and those are never the same point: the
     depth is point-sampled at a texel centre, so on a sloped surface the
     comparison is already out by up to one pixel of the surface's own
     depth slope before anything real has happened. A wall seen flat-on
     at arm's reach is out by a fraction of a millimetre; a floor seen at
     a grazing twenty degrees is out by centimetres. Set a constant for
     the wall and the floor acnes; set it for the floor and it swallows
     the 3 cm gap under a magazine -- which is the entire effect. That is
     not a hypothesis: with a flat 0.018 m this pass measured ZERO change
     in the AO buffer, and at 0.001 m it measured self-occlusion noise
     across the whole ground plane.
     ddx and ddy already hold the view-space step across one pixel, from
     the normal reconstruction above, so the slope is free.

     THE TWO USES OF IT ARE DIFFERENT SIZES, and collapsing them into one
     number is the bug this had first. The LIFT is how far the ray starts
     off the surface it is leaving, and it has to clear a whole pixel of
     that surface's slope or step zero registers the surface as its own
     occluder. The HIT THRESHOLD is how much nearer the depth buffer has
     to be before a sample counts, and it only has to clear the HALF
     TEXEL that quv is quantised by plus half of the ray's own depth
     change between samples. On a floor at a grazing twenty degrees the
     first is 2 cm and the second is 4 mm, and using the first for both
     rejects the 7 mm signal a magazine 3 cm up actually produces --
     measured, as zero change in the whole AO buffer. */
  float pixelZ = max(abs(ddx.z), abs(ddy.z));
  // Lift the ray clear of the surface it starts on.
  vec3 O = P + N * max(uContactBias, pixelZ * 2.0);

  vec3 L = uContactLightView;
  float NoL = dot(N, L);
  // Facing away from the sun there is nothing a sun-direction ray can
  // add: the surface is already unlit and the cascade already knows.
  if (NoL <= 0.02) { outColor = vec4(ao); return; }

  /* HOW LONG THE RAY IS.
     A fixed world length is three hundred pixels at arm's reach and a
     third of a pixel at forty metres, and eight steps marches neither
     usefully. So the world length is the intent and the pixel cap is the
     budget: project the far end, measure it, and shorten if it overruns.
     Under-length is rejected outright -- if the whole ray is shorter than
     one pixel there is nothing between the samples to find, and that
     doubles as the distance cull. */
  float rayLen = uContactLength;
  vec3 endV = O + L * rayLen;
  if (endV.z > -0.05) {
    // The ray would cross the camera plane; stop it just in front of it.
    float denom = endV.z - O.z;
    rayLen *= clamp((-0.05 - O.z) / (abs(denom) < 1e-4 ? 1e-4 : denom), 0.0, 1.0);
    endV = O + L * rayLen;
  }
  vec4 ec = uContactProj * vec4(endV, 1.0);
  if (ec.w <= 1e-4) { outColor = vec4(ao); return; }
  vec2 endUv = (ec.xy / ec.w) * 0.5 + 0.5;
  float px = length((endUv - vUv) / e);
  if (px < 1.0) { outColor = vec4(ao); return; }
  if (px > uContactMaxPixels) rayLen *= uContactMaxPixels / px;

  /* Interleaved gradient noise (Jimenez), and DELIBERATELY not animated.
     A temporal offset is the right answer when a temporal filter is going
     to average it away; this engine ships with no TAA, so animating the
     dither would be a shimmer running along every contact seam. Fixed per
     pixel it is a stable dither, and the half-resolution buffer's own
     upsample into the composite softens what is left. */
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));

  float invSteps = 1.0 / float(uContactSteps);
  /* Half of the depth the ray covers between two samples, plus a quarter
     of a pixel of the surface's slope for quv's quantisation. Both are
     what they are; uContactBias is the floor under the pair. */
  float hitBias = max(uContactBias, abs(L.z) * rayLen * invSteps * 0.5 + pixelZ * 0.25);
  float occ = 0.0;
  for (int i = 0; i < 32; i++) {
    if (i >= uContactSteps) break;
    float t = (float(i) + ign) * invSteps;
    vec3 Q = O + L * (rayLen * t);
    vec4 c = uContactProj * vec4(Q, 1.0);
    if (c.w <= 1e-4) break;
    vec2 quv = (c.xy / c.w) * 0.5 + 0.5;
    if (quv.x < 0.0 || quv.x > 1.0 || quv.y < 0.0 || quv.y > 1.0) break;
    // diff > 0 means the depth buffer's surface is NEARER the camera than
    // the ray sample, i.e. the ray has gone behind something.
    float diff = contactViewZ(quv) - Q.z;
    if (diff > hitBias && diff < uContactThickness) {
      /* The thickness test is what stops a wall in the foreground
         shadowing the floor behind it: a real contact occluder is thin in
         view depth, an unrelated object in front of the camera is not.
         An occluder met at the start of the ray is the hard contact; one
         met at the end is the soft outer edge of the same shadow, so the
         hit distance IS the falloff and there is no separate penumbra
         term to tune. */
      occ = 1.0 - t;
      break;
    }
  }

  // Ramped in over NoL so the facing cutoff above is never a hard line.
  float shadowed = occ * uContactStrength * fade * saturate1(NoL * 3.0);
  outColor = vec4(ao * (1.0 - shadowed));
}
`;

/* ---------------- environment probe bake ---------------- */

/* Shared by the prefilter and the BRDF table. Kept out of GLSL.common
   on purpose: common is interpolated into thirteen programs including
   three vertex shaders, and neither of these is wanted there. */
GLSL.envSample = `
/* Van der Corput radical inverse, bit-reversal form. A Hammersley set
   is the right sequence here because the number of samples is known up
   front and fixed -- it is stratified by construction, so 32 of these
   beat 32 hash samples by a wide margin and cost two dozen integer ops. */
float radicalInverseVdC(uint bits){
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return float(bits) * 2.3283064365386963e-10;
}
vec2 hammersley(int i, int n){
  return vec2(float(i) / float(n), radicalInverseVdC(uint(i)));
}
/* Draw a half-vector from the GGX distribution of visible normals'
   simpler cousin -- the plain NDF importance sample. alpha = rough^2,
   matching distributionGGX in GLSL.pbr so the prefilter and the direct
   specular lobe are the same distribution. */
vec3 importanceGGX(vec2 Xi, float rough, vec3 N){
  float a = rough * rough;
  float phi = 2.0 * PI * Xi.x;
  float cosT = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
  float sinT = sqrt(max(0.0, 1.0 - cosT * cosT));
  vec3 H = vec3(sinT * cos(phi), sinT * sin(phi), cosT);
  vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tx = normalize(cross(up, N));
  vec3 ty = cross(N, tx);
  return normalize(tx * H.x + ty * H.y + N * H.z);
}
/* The face basis comes in as three vectors from the CPU rather than as
   a face index and a switch, because the OpenGL cube-face convention
   (the one where +Y's second axis is +Z and everything else's is -Y) is
   a table, and a table belongs in a table. */
vec3 envFaceDir(vec2 uv, vec3 fx, vec3 fy, vec3 fz){
  return normalize(fz + (uv.x * 2.0 - 1.0) * fx + (uv.y * 2.0 - 1.0) * fy);
}
`;

/* Mip 0 of the source cube: the sky itself, six faces, no prefilter.
   It writes into a SEPARATE texture from the prefiltered cube. That is
   not tidiness -- prefiltering reads mip 0 while writing mip L of the
   same texture, and a sampler bound to a complete mip chain that also
   contains the draw target is undefined feedback under the WebGL2 spec
   whatever LOD the shader asks for. Two textures, no feedback, and the
   source gets to be a plain LINEAR non-mipped cube. */
GLSL.envBakeFrag = `
${GLSL.common}
${GLSL.sky}
${GLSL.envSample}
in vec2 vUv;
uniform vec3 uEnvFaceX;
uniform vec3 uEnvFaceY;
uniform vec3 uEnvFaceZ;
layout(location=0) out vec4 outColor;
void main(){
  vec3 dir = envFaceDir(vUv, uEnvFaceX, uEnvFaceY, uEnvFaceZ);
  /* uEnvNoSunDisc is set to 1 for this draw, so what lands in the cube
     is the gradient, the horizon fade, the ground bounce and the Mie
     halo -- everything except the disc. pbrFrag adds the analytic sun
     itself, with a shadow term the cube cannot have, and a ~74-linear
     spike smeared across a GGX lobe puts a second, blurry, unshadowed
     sun on every rough metal in the game. */
  outColor = vec4(skyRadiance(dir), 1.0);
}
`;

/* One roughness level, one face. Called levels times per rebake, six
   draws each, one level per frame. */
GLSL.envPrefilterFrag = `
${GLSL.common}
${GLSL.envSample}
in vec2 vUv;
uniform samplerCube uEnvSource;
uniform vec3 uEnvFaceX;
uniform vec3 uEnvFaceY;
uniform vec3 uEnvFaceZ;
uniform float uEnvRough;
uniform int uEnvSamples;
layout(location=0) out vec4 outColor;
void main(){
  vec3 N = envFaceDir(vUv, uEnvFaceX, uEnvFaceY, uEnvFaceZ);
  // Mip 0 is roughness 0: a mirror is the source, exactly.
  if (uEnvRough < 0.01) { outColor = vec4(textureLod(uEnvSource, N, 0.0).rgb, 1.0); return; }
  /* The usual split-sum simplification: the prefilter cannot know the
     view direction, so it assumes N = V = R. It over-blurs at grazing
     angles and every engine that ships a cube probe accepts it. */
  vec3 V = N;
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  int n = uEnvSamples;
  /* Constant loop bound with an early break -- the idiom the SSAO pass
     already uses -- so ANGLE never has to unroll a dynamic count. 64 is
     the ceiling the tier table is allowed to ask for.

     A LOW SAMPLE COUNT IS DEFENSIBLE HERE AND WOULD NOT BE FOR A SCENE
     PROBE. The source is skyRadiance(): a two-colour vertical lerp, a
     smoothstep across the horizon and two pow() lobes, with the one
     genuine spike -- the sun disc -- deliberately not baked. It is
     band-limited by construction, so importance-sampling variance is
     tiny and there are no fireflies to average out. 32 samples leave a
     residual below the half-float quantisation of the target; the same
     32 against a real scene bake would be visibly noisy. */
  for (int i = 0; i < 64; i++) {
    if (i >= n) break;
    vec2 Xi = hammersley(i, n);
    vec3 H = importanceGGX(Xi, uEnvRough, N);
    vec3 L = normalize(2.0 * dot(V, H) * H - V);
    float NoL = dot(N, L);
    if (NoL <= 0.0) continue;
    sum += textureLod(uEnvSource, L, 0.0).rgb * NoL;
    wsum += NoL;
  }
  outColor = vec4(sum / max(wsum, 1e-4), 1.0);
}
`;

/* The split-sum BRDF table. x = NoV, y = roughness, .r = the scale on
   F0, .g = the bias. Baked once, 128x128, then never touched again --
   it depends on nothing but the BRDF, so it survives every sky change,
   every tier change and every resize. */
GLSL.envBrdfFrag = `
${GLSL.common}
${GLSL.envSample}
in vec2 vUv;
layout(location=0) out vec4 outColor;
/* Smith with the IBL k remap, k = alpha/2. NOT the (rough+1)^2/8 remap
   geometrySmith uses: that one is Disney's fudge for ANALYTIC lights
   and using it here would bake a brighter table than the split sum it
   is meant to be half of. */
float gSmithIbl(float NoV, float NoL, float rough){
  float k = (rough * rough) * 0.5;
  float gv = NoV / (NoV * (1.0 - k) + k);
  float gl = NoL / (NoL * (1.0 - k) + k);
  return gv * gl;
}
void main(){
  float NoV = max(vUv.x, 1e-3);
  float rough = max(vUv.y, 1e-3);
  vec3 V = vec3(sqrt(max(0.0, 1.0 - NoV * NoV)), 0.0, NoV);
  vec3 N = vec3(0.0, 0.0, 1.0);
  float A = 0.0;
  float B = 0.0;
  /* 128 samples, not Karis' 1024. This integrand has no environment
     lookup in it -- it is analytic BRDF over the GGX distribution, and
     it is smooth. At 128 the residual is under half a per cent on the
     scale term and about one per cent on the bias at the grazing edge,
     which is comfortably inside the RG16F it is written to and an order
     better than the analytic fit it replaces. It also has to finish in
     one frame on SwiftShader: 16384 pixels x 1024 would be seconds. */
  for (int i = 0; i < 128; i++) {
    vec2 Xi = hammersley(i, 128);
    vec3 H = importanceGGX(Xi, rough, N);
    vec3 L = normalize(2.0 * dot(V, H) * H - V);
    float NoL = max(L.z, 0.0);
    if (NoL <= 0.0) continue;
    float NoH = max(H.z, 0.0);
    float VoH = max(dot(V, H), 0.0);
    float G = gSmithIbl(NoV, NoL, rough);
    float Gvis = (G * VoH) / max(NoH * NoV, 1e-4);
    float Fc = pow(1.0 - VoH, 5.0);
    A += (1.0 - Fc) * Gvis;
    B += Fc * Gvis;
  }
  outColor = vec4(A / 128.0, B / 128.0, 0.0, 1.0);
}
`;
/* ================================================================
   SCREEN-SPACE REFLECTIONS   (feature 1 — every uniform is uSsr*)
   ================================================================
   Three programs: a half-resolution trace, a roughness-driven cone
   blur run as a separable ping-pong, and one full-resolution fold
   that folds the result back into the scene.

   WHAT THE TRACE IS. A perspective-correct march in SCREEN space, not
   a fixed world-space step. The ray's two endpoints are projected to
   clip space once; after that uv, 1/w and z/w are all LINEAR in the
   screen parameter t, so one lerp of each per step recovers the ray's
   exact view-space depth at that pixel. Verified numerically against a
   ground-truth reprojection: max error 2.2e-16 over 21 samples, i.e.
   exact to float precision. A world-space march cannot do this -- it
   oversamples near the camera and skips whole pixels far from it, and
   the pixel is the only resolution a depth buffer has.

   THE FOLD IS A STRICT NO-OP WHERE THE RAY MISSED. The trace writes
   PREMULTIPLIED radiance, so the fold's delta is
     (ssr.rgb - envIBL * ssr.a * uSsrReplace) * envBRDF
   which is identically zero when ssr.a is zero. That is the strongest
   correctness property this feature can have: a pixel SSR did not
   reach is bit-identical to the pixel the renderer produced without
   this pass at all. */

GLSL.ssrFrag = `
${GLSL.common}
${GLSL.pbr}
in vec2 vUv;

/* Shared frame data — bound by Renderer._bindFrame, never by this feature.
   uGBufferTex: .rg = octEncode(view normal), .b = rough, .a = metal. */
uniform sampler2D uGBufferTex;
uniform sampler2D uSceneDepth;

/* Existing renderer uniform names, reused verbatim (contract RULE 2). */
uniform mat4 uProj;
uniform mat4 uInvProj;

uniform sampler2D uSsrSceneTex;   // hdrA.color — the radiance being reflected
uniform vec2  uSsrTexel;          // 1 / half-res size
uniform vec2  uSsrZParams;        // (proj[10], proj[14]) — closed-form depth->viewZ
uniform int   uSsrSteps;
uniform float uSsrNear;
uniform float uSsrMaxDistance;
uniform float uSsrMaxTexels;
uniform float uSsrThickness;
uniform float uSsrEdgeFade;
uniform float uSsrRoughCut;
uniform float uSsrRoughMax;
uniform float uSsrJitter;

layout(location=0) out vec4 outColor;

/* depth -> view-space z, in one divide.
   Unprojecting with uInvProj costs a mat4 multiply, and this runs once
   per march step plus five more in the refinement. The projection is
   diagonal apart from these two entries, so the closed form is exact:
     ndc = (p10 * z + p14) / -z   =>   z = -p14 / (ndc + p10)
   Round-tripped against the real matrix at z = -1, -5, -20, -60 and
   -200 m: exact to five decimal places. */
float ssrViewZ(float depth){
  return -uSsrZParams.y / (depth * 2.0 - 1.0 + uSsrZParams.x);
}

/* Full view-space position, for the ray origin only -- once per pixel,
   so the mat4 is affordable here where it is not inside the march.
   Deliberately local and deliberately not the shared helper: an
   unprojection is a closed-form identity that cannot silently drift
   between consumers the way an encoding can, so it carries no
   dependency on a chunk that may or may not have landed. */
vec3 ssrViewPos(vec2 uv, float depth){
  vec4 c = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * c;
  return v.xyz / v.w;
}

/* Interleaved gradient noise -- the dither that decorrelates best under
   a box filter, which is exactly what the cone blur below is. */
float ssrIGN(vec2 p){
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main(){
  float d0 = texture(uSceneDepth, vUv).r;
  // Sky. Nothing reflects, and there is no surface to reflect from.
  if (d0 >= 0.99999) { outColor = vec4(0.0); return; }

  vec4 g = texture(uGBufferTex, vUv);
  float rough = clamp(g.b, 0.0, 1.0);

  /* ROUGHNESS GATE, and the honest reason for these two numbers.
     The cone blur below is thirteen taps at a stride the pass can
     actually afford. It covers a GGX cone of half-angle atan(rough^2)
     up to about rough 0.5 at ultra's half-resolution, and no further.
     Past that the screen-space data is both least valid (a rough lobe
     samples half the hemisphere, most of which is off screen) and
     least affordable, so it hands over entirely to the environment
     term the forward shader already applied. Below uSsrRoughCut the
     reflection is at full strength: glass, water, a puddle, tile and a
     blued receiver all live under 0.35. */
  float weight = 1.0 - smoothstep(uSsrRoughCut, uSsrRoughMax, rough);
  if (weight <= 0.001) { outColor = vec4(0.0); return; }

  vec3 P  = ssrViewPos(vUv, d0);
  vec3 N  = octDecode(g.rg);
  vec3 Vd = normalize(P);            // eye -> surface, view space (-Z forward)
  vec3 R  = reflect(Vd, N);

  /* A ray that heads back toward the camera is reflecting something
     BETWEEN the eye and the surface, which is either off screen or the
     camera itself. Fading it is what stops a wall facing the player
     from smearing the player's own viewmodel across it. */
  weight *= 1.0 - smoothstep(0.25, 0.75, saturate1(dot(R, -Vd)));
  if (weight <= 0.001) { outColor = vec4(0.0); return; }

  /* Clip to the near plane before projecting. Past it w changes sign
     and the whole screen-space interpolation inverts. */
  float maxT = uSsrMaxDistance;
  if (R.z > 1e-4) {
    float tNear = (-uSsrNear - P.z) / R.z;
    maxT = min(maxT, max(tNear - 0.01, 0.0));
  }
  if (maxT <= 0.02) { outColor = vec4(0.0); return; }

  vec3 Q  = P + R * maxT;
  vec4 c0 = uProj * vec4(P, 1.0);
  vec4 c1 = uProj * vec4(Q, 1.0);
  float w0 = max(c0.w, 1e-5), w1 = max(c1.w, 1e-5);
  vec2 uv0 = (c0.xy / w0) * 0.5 + 0.5;
  vec2 uv1 = (c1.xy / w1) * 0.5 + 0.5;
  vec2 dUv = uv1 - uv0;

  /* Cap the SCREEN travel as well as the world distance. Without this
     a grazing ray along a floor spends the entire step budget crossing
     the frame and the stride is tens of pixels, which misses every
     object thinner than a car. */
  vec2  res    = 1.0 / uSsrTexel;
  float travel = length(dUv * res);
  float tEnd   = travel > uSsrMaxTexels ? uSsrMaxTexels / max(travel, 1e-5) : 1.0;

  float iw0 = 1.0 / w0, iw1 = 1.0 / w1;
  float zw0 = P.z * iw0, zw1 = Q.z * iw1;

  int steps = uSsrSteps;
  float dt  = tEnd / float(max(steps, 1));

  /* Interleaved gradient noise, not a hash: it is the pattern that
     dithers best under a box filter, and the blur below is exactly
     that. uSsrJitter is zero unless TAA is on, because animating the
     offset without a temporal filter trades a static stair-step for a
     crawling one, which is worse. */
  float jit = ssrIGN(gl_FragCoord.xy + uSsrJitter) - 0.5;

  float tPrev = 0.0;
  float zPrev = P.z;
  float tHit  = -1.0;

  /* Hard cap of 64, the way the SSAO loop caps at 32: a constant bound
     with a break is the form ANGLE compiles without complaint. Raising
     uSsrSteps past 64 in the tier table silently does nothing. */
  for (int i = 1; i <= 64; i++) {
    if (i > steps) break;
    float t = dt * (float(i) - 0.5 + jit * 0.9);
    vec2  uv = uv0 + dUv * t;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;

    float iw = iw0 + (iw1 - iw0) * t;
    float zw = zw0 + (zw1 - zw0) * t;
    float zRay = zw / iw;

    float dS = texture(uSceneDepth, uv).r;
    if (dS >= 0.99999) { tPrev = t; zPrev = zRay; continue; }  // sky is not a hit

    float zScene = ssrViewZ(dS);
    float diff   = zScene - zRay;        // > 0 once the ray is behind the surface

    /* A depth-relative epsilon rather than a constant. The depth buffer
       quantises hardest far away, and a fixed 2 cm that is right at
       four metres is noise at sixty. */
    float minDiff = max(0.02, -zScene * 0.002);
    if (diff > minDiff) {
      /* THICKNESS. A depth buffer stores one surface, so the marcher has
         to guess how solid it is. The guess is a floor plus however far
         the ray itself moved in depth over the last step -- anything
         inside that is indistinguishable from a hit at this sampling
         rate -- bounded so a grazing ray cannot claim the whole room. */
      float thick = uSsrThickness + min(abs(zRay - zPrev), uSsrThickness * 6.0);
      if (diff < thick) { tHit = t; break; }
      /* Too far behind: the ray passed BEHIND a foreground object. Keep
         going; it may come out the far side and hit something real. */
    }
    tPrev = t;
    zPrev = zRay;
  }

  if (tHit < 0.0) { outColor = vec4(0.0); return; }

  /* Binary refinement. Five halvings take the ~27-texel stride at ultra
     down to under a texel, which is the point at which a further
     halving buys nothing a half-resolution buffer can express. They
     cost five taps and only on the pixels that actually hit. */
  float tA = tPrev, tB = tHit;
  for (int r = 0; r < 5; r++) {
    float tm = (tA + tB) * 0.5;
    float iwm = iw0 + (iw1 - iw0) * tm;
    float zwm = zw0 + (zw1 - zw0) * tm;
    float zRm = zwm / iwm;
    vec2  uvm = uv0 + dUv * tm;
    float dm  = texture(uSceneDepth, uvm).r;
    if (dm >= 0.99999) { tA = tm; continue; }
    if (ssrViewZ(dm) - zRm > 0.0) tB = tm; else tA = tm;
  }
  float tF  = tB;
  vec2  uvF = uv0 + dUv * tF;

  /* Screen-edge fade. Without it the reflection stops in a hard line
     wherever the ray leaves the frame, and that line moves with the
     camera, which reads as a tear rather than as a reflection. */
  vec2  e    = min(uvF, 1.0 - uvF);
  float edge = saturate1(min(e.x, e.y) / max(uSsrEdgeFade, 1e-4));
  weight *= edge * edge * (3.0 - 2.0 * edge);

  // The far end of the march is where the stride is coarsest and a hit
  // least trustworthy, so it fades out rather than ending.
  weight *= 1.0 - smoothstep(0.88 * tEnd, tEnd, tF);

  /* Backface rejection, using the hit pixel's own G-buffer normal. A
     hit on a surface facing the same way as the ray is the BACK of an
     object -- the ray went through it -- and its shaded colour has
     nothing to do with what a reflection would see. Faded rather than
     cut, so a legitimately grazing hit does not speckle. */
  vec4 gh = texture(uGBufferTex, uvF);
  weight *= 1.0 - smoothstep(-0.05, 0.28, dot(octDecode(gh.rg), R));
  if (weight <= 0.0005) { outColor = vec4(0.0); return; }

  vec3 hit = max(texture(uSsrSceneTex, uvF).rgb, vec3(0.0));

  /* PREMULTIPLIED. The blur below averages rgb and a with one kernel;
     premultiplied is the only encoding under which that average is the
     correct partial coverage, and it is what makes the fold exactly
     zero where nothing was hit. */
  outColor = vec4(hit * weight, weight);
}
`;

/* ----------------------------------------------------------------
   ROUGHNESS-AWARE CONE BLUR — run twice, H then V, ssrA -> ssrB -> ssrA,
   exactly the aoA/aoB ping-pong the SSAO blur already uses.
   ---------------------------------------------------------------- */
GLSL.ssrBlurFrag = `
${GLSL.common}
in vec2 vUv;

uniform sampler2D uGBufferTex;
uniform sampler2D uSceneDepth;

uniform sampler2D uSsrTex;
uniform vec2  uSsrTexel;
uniform vec2  uSsrDir;
uniform vec2  uSsrZParams;
uniform float uSsrConeScale;      // half-res pixels per radian of cone
uniform float uSsrConeMax;        // hard ceiling, half-res pixels
uniform float uSsrMaxStride;      // ceiling on the gap between taps

layout(location=0) out vec4 outColor;

void main(){
  float dc = texture(uSceneDepth, vUv).r;
  vec4  c  = texture(uSsrTex, vUv);
  if (dc >= 0.99999) { outColor = c; return; }

  /* THE CONE, AND WHY THE RADIUS DOES NOT DIVIDE BY DEPTH.
     A GGX lobe of roughness r has half-angle about atan(r*r). The
     footprint it covers at the hit is that angle times the hit
     distance, and the screen size of that footprint is the footprint
     divided by the hit distance -- so for a reflection of something at
     roughly the receiver's own depth the two cancel and the radius is
     purely ANGULAR. uSsrConeScale is therefore halfResHeight / fovY,
     i.e. pixels per radian, and the whole thing is correct under both
     a resolution change and a field-of-view change with no per-scene
     tuning. */
  float rough  = clamp(texture(uGBufferTex, vUv).b, 0.0, 1.0);
  float alpha  = rough * rough;
  float radius = min(alpha * uSsrConeScale, uSsrConeMax);

  /* Thirteen taps spanning +-radius, so the stride is radius/6. A
     mirror (alpha -> 0) gets a stride of zero and is not touched at
     all, which is what a mirror should be; only a genuinely rough
     surface spreads its taps out, and by then the source it is
     sampling is incoherent anyway. */
  float stride = min(radius / 6.0, uSsrMaxStride);
  if (stride < 0.5) { outColor = c; return; }

  float zc = -uSsrZParams.y / (dc * 2.0 - 1.0 + uSsrZParams.x);
  vec2  stepUv = uSsrDir * uSsrTexel * stride;

  vec4  sum  = vec4(0.0);
  float wsum = 0.0;
  for (int i = -6; i <= 6; i++) {
    vec2  uv = vUv + stepUv * float(i);
    float dn = texture(uSceneDepth, uv).r;
    float zn = -uSsrZParams.y / (dn * 2.0 - 1.0 + uSsrZParams.x);
    /* Do not blur across a silhouette: a reflection belongs to the
       surface it was traced from, and letting it leak past the edge is
       the halo every screen-space effect is accused of. The tolerance
       is relative to depth because a 30 cm gap is an edge at three
       metres and nothing at forty. */
    float wz = exp(-abs(zn - zc) / max(0.25, abs(zc) * 0.08));
    float wg = exp(-float(i * i) * 0.11);
    float w  = wz * wg;
    sum  += texture(uSsrTex, uv) * w;
    wsum += w;
  }
  outColor = wsum > 1e-5 ? sum / wsum : c;
}
`;

/* ----------------------------------------------------------------
   THE FOLD — one full-resolution pass, hdrA.color -> hdrB.color.
   Also the single place features 4 (volumetrics) and 9 (GTAO bent
   normals) hang their screen-space terms; see the marked block.
   ---------------------------------------------------------------- */
GLSL.screenSpaceFrag = `
${GLSL.common}
${GLSL.sky}
${GLSL.pbr}
in vec2 vUv;

uniform sampler2D uGBufferTex;
uniform sampler2D uSceneDepth;

uniform mat4 uInvProj;
uniform mat4 uInvView;

uniform sampler2D uSsrSceneTex;   // hdrA.color
uniform sampler2D uSsrTex;        // the blurred reflection, half res
uniform vec2  uSsrTexel;          // 1 / half-res size
uniform vec2  uSsrZParams;
uniform float uSsrIntensity;
uniform float uSsrReplace;
uniform float uSsrEnvVis;
uniform float uSsrClamp;
uniform float uSsrMaxDarken;

/* ---- HOOKS: FEATURES 4 AND 9 FILL THESE IN ----
   They are declared here, at zero strength, because this pass is the
   one place the contract's pass order puts all three screen-space
   terms. Feature 4 binds volB to uVolTex and raises uVolStrength;
   feature 9 binds bentA to uGtaoBentTex and raises uGtaoSpecOcc.
   NEITHER MAY WRITE A SECOND _applyScreenSpace: a duplicate method in
   a JS class body silently keeps only the last one. */
uniform sampler2D uVolTex;
uniform float uVolStrength;
uniform sampler2D uGtaoBentTex;
uniform float uGtaoSpecOcc;
/* ---- END HOOKS ---- */

layout(location=0) out vec4 outColor;

const vec2 SSR_UP[4] = vec2[4](
  vec2(-0.5, -0.5), vec2(0.5, -0.5), vec2(-0.5, 0.5), vec2(0.5, 0.5));

vec3 ssrViewPos(vec2 uv, float depth){
  vec4 c = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * c;
  return v.xyz / v.w;
}

void main(){
  vec3  scene = texture(uSsrSceneTex, vUv).rgb;
  float d0    = texture(uSceneDepth, vUv).r;
  if (d0 >= 0.99999) {
    /* FEATURE 4 REACHES THE SKY, and nothing else here does. A shaft
       against a bright sky -- a doorway, a treeline, the crane lattice
       -- is the canonical god ray, and an early-out that skipped it
       would drop exactly the pixels the effect exists for. A reflection
       and a specular occlusion have nothing to say about a pixel with
       no surface in it, so those two stay skipped. uVolStrength is zero
       whenever the volumetric pass did not run, so this branch is
       bit-identical to the one it replaces on every tier that has the
       feature off. */
    if (uVolStrength > 0.0) {
      vec4 vsky = texture(uVolTex, vUv);
      scene = scene * mix(1.0, vsky.a, uVolStrength) + vsky.rgb * uVolStrength;
    }
    outColor = vec4(scene, 1.0);
    return;
  }

  float zc = -uSsrZParams.y / (d0 * 2.0 - 1.0 + uSsrZParams.x);

  /* uSsrIntensity is zero, and this whole half is skipped, whenever the
     trace did not run -- which is also when uSsrTex is bound to the
     fallback texture rather than to a reflection buffer. Without this
     gate the fallback's own alpha would be read as a confidence. The
     branch is uniform across the draw, so it costs nothing. */
  if (uSsrIntensity > 0.0) {
    /* DEPTH-AWARE UPSAMPLE. Four taps at the surrounding half-resolution
       texel centres, weighted by how close each one's depth is to this
       pixel's. A plain bilinear read drags the reflection one half-res
       texel past every silhouette, which on a railing or a gun barrel
       is a bright fringe on the wrong side of the edge. */
    vec4  acc  = vec4(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2  uv = vUv + SSR_UP[i] * uSsrTexel;
      float dn = texture(uSceneDepth, uv).r;
      float zn = -uSsrZParams.y / (dn * 2.0 - 1.0 + uSsrZParams.x);
      float w  = exp(-abs(zn - zc) / max(0.20, abs(zc) * 0.05));
      acc  += texture(uSsrTex, uv) * w;
      wsum += w;
    }
    vec4  ssr  = wsum > 1e-4 ? acc / wsum : texture(uSsrTex, vUv);
    float conf = clamp(ssr.a, 0.0, 1.0);

    if (conf > 0.0005) {
    vec4  g     = texture(uGBufferTex, vUv);
    float rough = clamp(g.b, 0.035, 1.0);
    float metal = clamp(g.a, 0.0, 1.0);

    vec3 Pv = ssrViewPos(vUv, d0);
    vec3 Nv = octDecode(g.rg);
    vec3 Vd = normalize(Pv);
    vec3 Rv = reflect(Vd, Nv);
    float NoV = max(dot(Nv, -Vd), 1e-4);

    mat3 v2w = mat3(uInvView);
    vec3 Nw = normalize(v2w * Nv);
    vec3 Rw = normalize(v2w * Rv);

    /* F0 WITHOUT AN ALBEDO BUFFER. The G-buffer carries no base colour
       -- that was the deliberate trade for staying at three
       attachments. A dielectric does not need one: it is 0.04 flat.
       A metal borrows the hue of what has already been shaded at this
       very pixel, normalised so only its colour and not its brightness
       is taken, and pulled toward neutral where the pixel is too dark
       for its hue to mean anything. Documented approximation. */
    float mx   = max(max(scene.r, scene.g), scene.b);
    vec3  tint = mx > 1e-4 ? saturate3(scene / mx) : vec3(1.0);
    tint = mix(vec3(1.0), tint, saturate1(mx * 4.0));
    vec3  F0   = mix(vec3(0.04), tint, metal);

    /* Reconstruct the environment specular the FORWARD shader already
       added at this pixel, then pay back the difference. This is the
       whole reason the fold cannot double-count: it does not add a
       reflection, it REPLACES the sky the forward pass assumed, in
       proportion to how confident the trace is.

       uSsrEnvVis stands in for pbrFrag's mix(skyVis, 1.0, 0.25), which
       depends on the sun shadow term this pass cannot see. The
       renderer binds the midpoint of its range, so the estimate is
       within about a fifth either way, and uSsrReplace (0.90) leaves a
       deliberate sliver unsubtracted -- slightly too bright reads as a
       reflection, slightly too dark reads as a hole. */
    /* KEPT IN STEP WITH pbrFrag BY HAND, and it has to be. This pass
       does not add a reflection, it pays back the environment specular
       the forward shader already applied -- so the expression here must
       be the same one pbrFrag used, term for term. When the probe
       landed and pbrFrag moved from the analytic lerp of skyRadiance
       and skyIrradiance to envRadiance, this line had to move with it
       in the same commit; had it not, the fold would have subtracted a
       sky the forward pass no longer applies and every reflective
       surface in the game would have gone dark by the difference.

       envRadiance and envBRDF both live in GLSL.sky, which this shader
       already includes, and _bindEnv -- which _applyScreenSpace already
       calls -- binds the cube and its gate. So this is a substitution
       and nothing else. On a tier with no probe uEnvIntensity is 0 and
       envRadiance returns exactly the analytic lerp this line used to
       read, so the fold is unchanged there to the bit. */
    vec3 envIBL = envRadiance(Rw, Nw, rough) * uSsrEnvVis + uRoomAmbient;
    /* KEPT IN STEP WITH pbrFrag, PART TWO -- FEATURE 6.
       The forward pass multiplies its ambient specular by the
       multiple-scattering compensation. The sky this pass pays back
       therefore has that factor in it too, and without this line the
       fold would subtract an UNCOMPENSATED sky from a COMPENSATED
       pixel: every rough metal would keep a bright ghost of exactly
       the environment the reflection was meant to replace, and the
       brighter the metal the worse it would be. msFromEss
       lives in GLSL.pbr, which this program already includes, and
       uSpecEnergy is bound by _bindEnv, which _applyScreenSpace
       already calls -- so this is a substitution and nothing else. At
       uSpecEnergy 0 msFromEss returns exactly vec3(1.0) and this is
       the line it was, to the bit. The Ess handed in is A + B from the
       SAME envBRDF the lobe used, which is what pbrFrag does.

       KNOWN RESIDUAL, stated rather than hidden: the forward pass also
       multiplies by specularOcclusion x horizonOcclusion, and this
       pass cannot reproduce either -- specularOcclusion needs the ORM
       map's cavity term and horizonOcclusion needs the geometric
       normal, and the G-buffer carries neither. So in a crease the
       fold subtracts marginally more sky than the forward pass
       applied. It is bounded by the uSsrMaxDarken rail below, it only
       reaches the specular half of the ambient, and a crease is where
       SSR confidence is lowest anyway, which is the same multiplier. */
    vec3 brdf   = envBRDF(F0, rough, NoV)
      * msFromEss(F0, envBRDF(vec3(1.0), rough, NoV).r, uSpecEnergy);

    vec3 delta = (ssr.rgb - envIBL * conf * uSsrReplace) * brdf * uSsrIntensity;

    /* Two rails, because this pass runs at ultra where the brightest
       pixel assertions in the suite have the least room. A single
       blown texel in the reflection would otherwise go through bloom,
       and an over-subtracted sun reflection would otherwise punch a
       black hole. Neither rail is ever reached by a well-behaved
       frame; they exist so a badly-behaved one degrades. */
    delta = min(delta, vec3(uSsrClamp));
    delta = max(delta, -scene * uSsrMaxDarken);
    scene = max(scene + delta, vec3(0.0));
    }
  }

  /* ---- HOOKS: FEATURES 4 AND 9 ---- */
  if (uVolStrength > 0.0) {
    // Feature 4: rgb = in-scattered radiance, a = transmittance.
    vec4 vol = texture(uVolTex, vUv);
    scene = scene * mix(1.0, vol.a, uVolStrength) + vol.rgb * uVolStrength;
  }
  if (uGtaoSpecOcc > 0.0) {
    // Feature 9: .a = specular occlusion, half res, bilinear is enough.
    float so = clamp(texture(uGtaoBentTex, vUv).a, 0.0, 1.0);
    scene *= mix(1.0, so, uGtaoSpecOcc);
  }
  /* ---- END HOOKS ---- */

  outColor = vec4(scene, 1.0);
}
`;

