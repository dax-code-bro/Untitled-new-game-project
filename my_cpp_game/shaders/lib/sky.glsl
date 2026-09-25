// Ported from engine/src/50-shaders.js GLSL.sky (GLSL ES 3.00 -> 4.50 core).
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
/* ---- NATIVE: THE PHYSICAL SKY ----
   uSkyModel 0 is the web engine's gradient, untouched. At 1 the sky is a
   single-scattering Earth atmosphere (Rayleigh + Mie + ozone) ray marched
   on the CPU into a latitude/longitude table (rendering/Atmosphere.cpp):
   a deep zenith, a bright hazy horizon, a real Mie halo round the sun and
   an orange sunset, all from the sun direction alone. The table holds
   radiance per unit of sun illuminance; uSkyLutScale is the sun's colour
   x intensity x a calibration gain. The v mapping spends most rows near
   the horizon -- the CPU mirror, Atmosphere::dirToUv, must match it. */
uniform float uSkyModel;
uniform sampler2D uSkyLut;
uniform vec3 uSkyLutScale;
vec3 skyPhysical(vec3 dir){
  float az = atan(dir.z, dir.x);
  float el = asin(clamp(dir.y, -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / (0.5 * PI));
  return textureLod(uSkyLut, vec2(az / (2.0 * PI) + 0.5, v), 0.0).rgb * uSkyLutScale;
}

vec3 groundIrradiance(){
  // How square-on the sun hits flat ground. Nothing to bounce at night.
  float lit = max(uSunDir.y, 0.0);
  return uGroundColor * (uSkyIntensity + uSunColor * uSunIntensity * lit * uGroundBounce);
}

vec3 skyRadiance(vec3 dir){
  float up = dir.y;
  if (uSkyModel > 0.5) {
    // Same ground blend and sun disc as the gradient path; the halo is
    // in the table, scattered physically, so it is not added again.
    vec3 psky = skyPhysical(dir) / max(uSkyIntensity, 1e-4);
    psky = mix(groundIrradiance() / max(uSkyIntensity, 1e-4), psky, smoothstep(-0.28, 0.06, up));
    float pDot = saturate1(dot(dir, uSunDir));
    float pDisc = smoothstep(0.9986, 0.9995, pDot);
    psky += uSunColor * pDisc * uSunIntensity * 12.0 * (1.0 - uEnvNoSunDisc);
    return psky * uSkyIntensity;
  }
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
