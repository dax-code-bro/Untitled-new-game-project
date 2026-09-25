// Ported from engine/src/50-shaders.js GLSL.pbr (GLSL ES 3.00 -> 4.50 core).
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
