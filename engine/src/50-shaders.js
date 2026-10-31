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

vec3 skyRadiance(vec3 dir){
  float up = dir.y;
  // Horizon band is tight near y=0 and eases into the zenith colour.
  float t = pow(saturate1(up * 0.5 + 0.5), 0.55);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, saturate1(up * 1.6));
  // Below the horizon, fade into the ground bounce colour.
  sky = mix(uGroundColor, sky, smoothstep(-0.28, 0.06, up));

  float sunDot = saturate1(dot(dir, uSunDir));
  // Mie-like forward scattering halo around the sun.
  float halo = pow(sunDot, 12.0) * 0.35 + pow(sunDot, 3.0) * 0.08;
  // The disc itself: sharp, bright, and clipped so bloom does the glow.
  float disc = smoothstep(0.9986, 0.9995, sunDot);
  sky += uSunColor * (halo * uSunIntensity * 0.35);
  sky += uSunColor * disc * uSunIntensity * 12.0;
  return sky * uSkyIntensity;
}

/* Cheap hemisphere irradiance: what a diffuse surface receives from the sky. */
vec3 skyIrradiance(vec3 n){
  float up = n.y * 0.5 + 0.5;
  vec3 sky = mix(uSkyHorizon, uSkyZenith, 0.65);
  return mix(uGroundColor, sky, up) * uSkyIntensity;
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

float shadowFactor(vec3 worldPos, float viewDepth, float NoL){
  // Slope-scaled bias: grazing light needs far more offset to avoid acne.
  float slope = clamp(1.0 - NoL, 0.0, 1.0);
  float rnd = hash12(gl_FragCoord.xy) * 6.2831853;
  vec2 rot = vec2(cos(rnd), sin(rnd));
  float s = 1.0;

  if (viewDepth < uCascadeSplit) {
    vec3 proj = shadowProject(uShadowMat0, worldPos);
    if (outsideCascade(proj)) return 1.0;
    s = pcfCascade0(proj, 0.0009 + slope * 0.0035, 1.4, rot);
  } else {
    vec3 proj = shadowProject(uShadowMat1, worldPos);
    if (outsideCascade(proj)) return 1.0;
    s = pcfCascade1(proj, 0.0016 + slope * 0.006, 1.1, rot);
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

/* Exponential height fog: dense low down, thinning with altitude, which is
   what sells scale on big outdoor maps. */
vec3 applyFog(vec3 color, vec3 worldPos, vec3 cameraPos, vec3 viewDir){
  if (uFogDensity <= 0.0) return color;
  float dist = length(worldPos - cameraPos);
  float heightFactor = exp(-max(0.0, cameraPos.y - uFogHeight) * uFogHeightFalloff);
  float fogAmount = 1.0 - exp(-dist * uFogDensity * heightFactor);
  fogAmount = saturate1(fogAmount);
  // Fog picks up sun colour when looking toward the sun.
  float sunAmount = pow(saturate1(dot(viewDir, uSunDir)), 8.0);
  vec3 fogCol = mix(uFogColor, uSunColor * 1.1, sunAmount * 0.6);
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
#if defined(VERTCOLOR) || defined(WATER_FX) || defined(FUR_SHELL) || defined(GRASS)
/* Grass reads this too: r is which blade of a tuft this vertex belongs
   to, which is what lets one nine-blade mesh be re-aimed per strip
   into nine different-looking tufts. Both grass meshes must emit
   colours — GpuMesh binds location 4 only when the geometry has a
   colour array, so a colourless grass mesh leaves it unbound and the
   shader reads whatever happened to be there last. */
layout(location=4) in vec3 aColor;
#endif
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
// xy = fade centre in world XZ, z = where the field starts thinning,
// w = where it has gone entirely.
uniform vec4 uGrassFade;
#endif
#ifdef FUR_SHELL
uniform float uShellOffset;
uniform vec3 uShellComb;
// 1 when the mesh carries a per-vertex coat-depth mask in aColor.r. Fur
// is a surface layer, not a uniform inflation: a shell pushed 7cm off a
// 1.4cm-thick cannon bone turns the leg inside out, and the same offset
// on a 2cm-thick ear turns the ear into a black ball of crossed shells.
// The mask says how deep the coat may be at each vertex.
uniform float uShellMask;
#endif

struct Surface {
  vec3 worldPos;
  vec3 normal;
  vec4 tangent;
  vec2 uv;
  vec4 params;
#if defined(VERTCOLOR) || defined(WATER_FX)
  vec3 vertColor;
#endif
#ifdef GRASS
  float age;
  float bladeHash;
#endif
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

#ifdef FUR_SHELL
  // Fur shells: the same mesh re-drawn pushed out along its normals; the
  // fragment stage clips each layer against the strand mask so hair tips
  // break the silhouette. The comb vector lays the hair backward along the
  // body the way a real coat lies, instead of puffing straight out.
  float furDepth = uShellOffset * mix(1.0, aColor.r, uShellMask);
  localPos += localNrm * furDepth + uShellComb * furDepth;
#endif
#ifdef GRASS
  /* Three per-instance floats ride in the model matrix's unused
     column. Mat4.compose always writes hard zeros into e[3], e[7] and
     e[11] — a transform with no projection has nothing there — so the
     scatter packs arch, wind compliance and senescence into them for
     free: no wider stride, no extra attribute, not one more byte
     uploaded.

     THE ZEROING ON THE NEXT LINE MUST COME BEFORE ANY USE OF the
     model matrix. A non-zero w makes model * vec4(p, 1.0) come out
     with w other than 1 and
     every vertex projects to garbage. The symptom is the grass
     vanishing, which reads as a culling or a count bug and sends you
     looking in the wrong file entirely. */
  float gArch = model[0].w, gStiff = model[1].w, gAge = model[2].w;
  model[0].w = 0.0; model[1].w = 0.0; model[2].w = 0.0;

  // aParams.w carries a per-blade random seed; .xyz is the tint.
  float seed = s.params.w;
  float h = aUv.y;

  /* Re-aim and re-length this strip of the tuft. aColor.r is the
     sub-blade index, 0..8, so a single nine-blade mesh instanced three
     thousand times is three thousand different tufts instead of three
     thousand copies of one fan. Four bounded-argument hashes rather
     than a noise octave: there is a note further down recording that
     fbm in this stage makes some drivers fail every draw. */
  float sb = aColor.r;
  float hs  = fract(sin(seed * 91.17 + sb * 37.91) * 143.5453);
  float hs2 = fract(sin(seed * 57.31 + sb * 11.13) * 246.6345);
  localPos.y *= mix(0.72, 1.28, hs);
  {
    float ya = (hs2 - 0.5) * 1.3;
    float cs = cos(ya), sn = sin(ya);
    /* The normal and tangent turn with the geometry. Rotating only the
       position is the classic way to make a field of grass read as
       plastic: every blade is lit as though it were still facing the
       way it was authored. */
    localPos.xz = vec2(localPos.x * cs - localPos.z * sn, localPos.x * sn + localPos.z * cs);
    localNrm.xz = vec2(localNrm.x * cs - localNrm.z * sn, localNrm.x * sn + localNrm.z * cs);
    localTan.xz = vec2(localTan.x * cs - localTan.z * sn, localTan.x * sn + localTan.z * cs);
  }
  // Per-species droop, along the axis the blade already leans on.
  localPos.z += gArch * 0.33 * h * h;
  localPos.y -= gArch * 0.10 * h * h;

  /* Wind compliance as the EXPONENT of the bend curve, not a
     multiplier on it. Scaling the bend only makes a blade lean
     further; changing the exponent changes the SHAPE of the lean, so
     a stiff seed-head whips from the tip while a broad soft leaf
     folds from halfway down and flat litter does not move at all.
     Same instruction count, and it is the difference between a field
     of one grass and a field of several. */
  float stiffness = pow(max(h, 0.0), mix(1.4, 2.6, clamp(gStiff * 0.5, 0.0, 1.0)));
  vec3 worldRoot = (model * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  // Two travelling waves at different scales read as gusts over a field.
  float phase = uTime * 1.6 + worldRoot.x * 0.22 + worldRoot.z * 0.19 + seed * 6.28;
  // Gusts as two crossed travelling waves. (fbm3 here trips some drivers'
  // vertex-shader compilers into failing every draw — and per-vertex 4-octave
  // noise was the most expensive thing in the field anyway.)
  float gust = (sin(worldRoot.x * 0.12 + uTime * 0.70) *
                sin(worldRoot.z * 0.09 + uTime * 0.53) * 0.5 + 0.5) * 1.4;
  float sway = (sin(phase) * 0.5 + sin(phase * 2.37 + 1.3) * 0.28) * (0.35 + gust);
  /* Held back until after the model transform — see below. */
  vec3 bend = uWindDir * sway * uWindStrength * stiffness;

  /* Shrink the last few metres of the field to nothing rather than
     stopping at a line. The material is opaque with no blend state and
     no alpha clip, so there is no alpha to fade; scaling the blade
     down is the only lever, and a blade scaled to zero is a degenerate
     triangle that costs setup and no fragments. The centre comes from
     the live camera every frame rather than the quantised field
     centre, or the band itself jumps in four-metre steps. */
  {
    float fd = length(worldRoot.xz - uGrassFade.xy);
    float fade = 1.0 - smoothstep(uGrassFade.z, uGrassFade.w, fd);
    localPos *= fade;
    bend *= fade;
  }
#endif

  vec4 wp = model * vec4(localPos, 1.0);
#ifdef GRASS
  /* The bend is in WORLD space, because uWindDir is, and it has to be
     applied here rather than to localPos.

     Added before the model transform it was multiplied by the blade's
     own matrix — which carries a uniformly random yaw over the whole
     circle and a scale of (14 mm, 34 cm, 1). So the wind blew a
     different direction for every blade, and the component along the
     blade's local X was divided by seventy. A field did not lean in
     the wind; it fidgeted, each blade to its own compass. The gusts
     travelling across the field were being computed correctly the
     whole time and then scrambled on the last line.

     Applying it to the world position instead costs nothing and the
     whole sward leans together. */
  wp.xyz += bend;
  // Bending should not stretch the blade, so pull the tip down as it leans.
  wp.y -= dot(bend, bend) * 0.35;
#endif
  s.worldPos = wp.xyz;

  // Normal matrix. For a rotation-times-scale transform (no shear, which the
  // engine never produces) the inverse-transpose is just each column divided
  // by its squared length — so non-uniform scale lights correctly without
  // shipping a second matrix per instance.
  vec3 c0 = model[0].xyz, c1 = model[1].xyz, c2 = model[2].xyz;
  vec3 invSq = 1.0 / max(vec3(dot(c0, c0), dot(c1, c1), dot(c2, c2)), vec3(1e-8));
  mat3 nm = mat3(c0 * invSq.x, c1 * invSq.y, c2 * invSq.z);

  s.normal = normalize(nm * localNrm);
#ifdef GRASS
  // Same correction for the normal: tilt the WORLD normal toward the
  // wind, not the local one, or a blade's lighting disagrees with the
  // direction it is visibly leaning.
  s.normal = normalize(s.normal - uWindDir * sway * uWindStrength * 0.5);
#endif
  s.tangent = vec4(normalize(nm * localTan), aTangent.w);
  s.uv = aUv;
#if defined(VERTCOLOR) || defined(WATER_FX)
  s.vertColor = aColor;
#endif
#ifdef GRASS
  s.age = gAge;
  s.bladeHash = hs2;
#endif
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
out vec4 vParams;
out float vViewDepth;
#if defined(VERTCOLOR) || defined(WATER_FX)
out vec3 vVertColor;
#endif
#ifdef GRASS
out float vAge;
out float vBladeHash;
#endif

void main(){
  Surface s = computeSurface();
  vWorldPos = s.worldPos;
  vNormal = s.normal;
  vTangent = s.tangent;
  vUv = s.uv;
  vParams = s.params;
#if defined(VERTCOLOR) || defined(WATER_FX)
  vVertColor = s.vertColor;
#endif
#ifdef GRASS
  vAge = s.age;
  vBladeHash = s.bladeHash;
#endif
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
#ifdef GRASS
in float vAge;
in float vBladeHash;
#endif
in vec2 vUv;
in vec4 vParams;
in float vViewDepth;
#if defined(VERTCOLOR) || defined(WATER_FX)
in vec3 vVertColor;
#endif

uniform vec3 uCameraPos;
uniform float uTime;
uniform vec3 uBaseColor;
#ifdef FUR_SHELL
uniform float uShellT;
#endif
uniform float uRoughness;
uniform float uMetalness;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform float uUvScale;
uniform float uDetailScale;   // 0 = off
uniform float uNormalStrength;
uniform float uSubsurface;
uniform int uHasMaps;
uniform int uReceiveShadow;
uniform int uDebugMode;
uniform sampler2D uAlbedoMap;
uniform sampler2D uNormalMap;
uniform sampler2D uOrmMap;
/* A second photographed material, blended in by how steep the surface
   is. Soil does not stay on a slope: past about thirty degrees a
   hillside is the rock it is made of, and past fifty it is bare. Giving
   the ground two materials and letting gravity decide between them is
   the cheapest realism in the whole renderer. */
uniform sampler2D uAlbedoMap2;
uniform sampler2D uNormalMap2;
uniform sampler2D uOrmMap2;
uniform float uUvScale2;
uniform vec2 uSlopeBlend;     // x = where the second material starts, y = where it takes over

/* Extra point lights — small fixed budget, plenty for torches, muzzle
   flashes and glowing debris. */
uniform int uLightCount;
uniform vec4 uLightPos[8];    // xyz = position, w = radius
uniform vec4 uLightColor[8];  // rgb = colour, a = intensity

layout(location=0) out vec4 outColor;

void main(){
  vec2 uv = vUv * uUvScale;

  /* Detail sampling.

     A texture sized for a whole surface has nothing left to say up close:
     terrain tiled once every twelve metres is a smooth wash under the
     player's feet, and no amount of tuning the base scale fixes it without
     aliasing the same texture into noise at distance. So the maps are
     sampled a second time at a much higher frequency and mixed in only
     where the camera is near enough to resolve it — the surface gains grain
     underfoot and loses nothing on the horizon.

     Only the normal and occlusion are detailed, not the albedo: colour
     variation at this frequency reads as dirt on the lens, whereas the tilt
     of the surface is exactly what the eye uses to judge that ground is
     ground. */
  vec2 uvDetail = uv * uDetailScale;
  float detailFade = uDetailScale > 0.001
    ? clamp(1.0 - vViewDepth / 55.0, 0.0, 1.0) : 0.0;

  vec3 albedo = uBaseColor * vParams.rgb;
#ifdef GRASS
  /* The first fragment-stage grass path this engine has had. Until
     now a blade was one flat colour from root to tip, with vUv.x
     (which edge) and vUv.y (how far up) arriving and being thrown
     away. Everything here is free: no texture, no instance byte, no
     triangle, no draw call — the Grass material has no maps at all,
     so there is nothing to compete with.

     The litter band is the important one. What gives a sparse field
     away is not the gaps, it is sunlit soil showing through them; a
     dark band at the base of every blade reads as the shadowed
     interior of a canopy, so the ground between tufts looks like
     depth instead of holes. It is also a far better self-shadow than
     an actual shadow pass could be — a cascade texel here is three or
     four centimetres against a fourteen-millimetre blade. */
  {
    float up = vUv.y;
    albedo *= 1.0 - 0.72 * (1.0 - smoothstep(0.0, 0.22, up));
    // Dead thatch low down, drying tip high up, both scaled by how old
    // this particular blade is.
    albedo = mix(albedo, albedo * vec3(0.78, 0.66, 0.44),
                 vAge * (1.0 - smoothstep(0.0, 0.30, up)));
    albedo = mix(albedo, albedo * vec3(1.18, 1.10, 0.62),
                 vAge * smoothstep(0.80, 1.0, up));
    // A midrib. One line, and it is most of what makes a blade read as
    // a leaf rather than a painted strip.
    albedo *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.14, abs(vUv.x - 0.5)));
    // Per-blade tone, so a tuft is nine blades and not one repeated.
    albedo *= mix(0.88, 1.12, vBladeHash);
    // The matte glaucous underside; the roughness half of this lives
    // below, where rough has been declared.
    if (!gl_FrontFacing) albedo *= vec3(0.92, 0.97, 1.04);
  }
#endif
#ifdef VERTCOLOR
  // Carved-from-photos meshes have no UV-mapped texture — each vertex
  // carries its own baked color instead.
  albedo *= vVertColor;
#endif
  float rough = uRoughness;
  float metal = uMetalness;
#ifdef GRASS
  /* Glossy upper surface, matte underside. The grass material is
     double-sided with face culling off, so both faces are drawn, and
     this is the mechanism behind the silver flash a real field throws
     when a gust turns the leaves over. */
  rough = gl_FrontFacing ? max(0.03, rough - 0.22) : min(1.0, rough + 0.04);
#endif
  float ao = 1.0;
#ifdef WATER_FX
  // vVertColor.r carries a foam amount painted in by WaterVolume.update()
  // (wave-crest curvature + wall proximity, with its own persistence/decay
  // so foam lingers and fades instead of snapping on and off). Foam is a
  // diffuse, rough, opaque white patch riding on top of the glassy water —
  // not a tint of the water color, an actual different material.
  float foam = clamp(vVertColor.r, 0.0, 1.0);
  albedo = mix(albedo, vec3(0.96), foam);
  rough = mix(rough, 0.88, foam);
  metal = mix(metal, 0.0, foam);
#endif

  /* How much of the second material this fragment gets. Measured off the
     geometric normal, not the mapped one, so the texture's own bumps do
     not scatter rock across a flat field. */
  float slopeMix = 0.0;
  if (uHasMaps == 2) {
    float steep = 1.0 - clamp(normalize(vNormal).y, 0.0, 1.0);
    slopeMix = smoothstep(uSlopeBlend.x, uSlopeBlend.y, steep);
  }
  vec2 uv2 = vUv * uUvScale2;

  if (uHasMaps >= 1) {
    vec4 tex = texture(uAlbedoMap, uv);
    if (slopeMix > 0.0) tex = mix(tex, texture(uAlbedoMap2, uv2), slopeMix);
    albedo *= tex.rgb;
#ifdef FUR_SHELL
    // Clip this layer against the strand-density mask: the further out the
    // shell, the fewer strands survive — which is what makes tips. Roots sit
    // in shadow, tips catch light.
    if (tex.a < uShellT) discard;
    albedo *= mix(0.74, 1.1, uShellT);
#endif
    vec3 orm = texture(uOrmMap, uv).rgb;
    if (slopeMix > 0.0) orm = mix(orm, texture(uOrmMap2, uv2).rgb, slopeMix);
    ao = orm.r;
    /* Close-up occlusion rides on top of the coarse one, but gently:
       multiplying two occlusion maps together squares the darkening,
       and in shadow — where the sky is the only light there is — that
       is the difference between a wood floor you can see and a black
       hole. Half strength, and floored, so the detail adds creases
       rather than subtracting light. */
    if (detailFade > 0.0) ao *= mix(1.0, 0.45 + 0.55 * texture(uOrmMap, uvDetail).r, detailFade);
    /* The map IS the roughness measurement; the preset is only where
       the middle of its range should sit.

       Multiplying the two and clamping was throwing the measurement
       away. Ground presets sit at 0.90 to 0.96 and the captured
       channel runs about 0.7 to 1.0, so 0.95 x 0.85 x 1.25 is 1.01 —
       over the clamp — and every ground texel in the game came out at
       exactly 1.0. The roughness debug view was a sheet of white
       paper: no sheen anywhere, no wet patch darker than a dry one, no
       difference between a worn plank and the soil beside it, because
       there was no variation left to see. Lean on the measurement and
       let the preset bias it, and the whole range survives. */
    rough = mix(rough, orm.g, 0.75);
    // The map only modulates metalness, never introduces it: a dielectric
    // stays dielectric no matter what the ORM texture says, while a metal
    // picks up the map's variation (rust patches, worn edges).
    metal = uMetalness * mix(1.0, orm.b, 0.85);
  }
  rough = clamp(rough, 0.035, 1.0);

  vec3 N = normalize(vNormal);
  if (uHasMaps >= 1 && uNormalStrength > 0.001) {
    vec3 T = normalize(vTangent.xyz - N * dot(N, vTangent.xyz));
    vec3 B = cross(N, T) * vTangent.w;
    vec3 tn = texture(uNormalMap, uv).xyz * 2.0 - 1.0;
    if (slopeMix > 0.0) tn = mix(tn, texture(uNormalMap2, uv2).xyz * 2.0 - 1.0, slopeMix);
    tn.xy *= uNormalStrength;
    if (detailFade > 0.0) {
      // Tangent-space whiteout: the fine tilt rides on top of the coarse one
      // rather than replacing it, so both scales of relief survive.
      vec3 dn = texture(uNormalMap, uvDetail).xyz * 2.0 - 1.0;
      tn.xy += dn.xy * uNormalStrength * detailFade * 1.5;
    }
    N = normalize(mat3(T, B, N) * normalize(tn));
  }
  // Back-facing geometry (double-sided leaves, glass) must not light black.
  if (!gl_FrontFacing) N = -N;

  vec3 V = normalize(uCameraPos - vWorldPos);
  float NoV = max(dot(N, V), 1e-4);
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  vec3 diffuseColor = albedo * (1.0 - metal);

  vec3 color = vec3(0.0);

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
    // 6 and 7 split the two halves of the lighting. A forest floor that
    // reads black is either losing its sky (7) or being occluded to
    // nothing before the sky arrives (6), and from the final image
    // those two look identical.
    if (uDebugMode == 6) { outColor = vec4(vec3(ao), 1.0); return; }
    if (uDebugMode == 7) {
      outColor = vec4(diffuseColor * skyIrradiance(N) * ao, 1.0); return;
    }
    if (uDebugMode == 8) { outColor = vec4(albedo, 1.0); return; }
  }

  if (NoL > 0.0) {
    vec3 H = normalize(V + L);
    float NoH = max(dot(N, H), 0.0);
    float VoH = max(dot(V, H), 0.0);
    float D = distributionGGX(NoH, rough);
    float G = geometrySmith(NoV, NoL, rough);
    vec3 F = fresnelSchlick(VoH, F0);
    vec3 spec = (D * G * F) / max(4.0 * NoV * NoL, 1e-4);
    vec3 kD = (vec3(1.0) - F);
    vec3 radiance = uSunColor * uSunIntensity;
    color += (kD * diffuseColor * INV_PI + spec) * radiance * NoL * shadow;
  }

  /* --- subsurface wrap: light bleeding through thin surfaces --- */
  if (uSubsurface > 0.0) {
    float back = saturate1(dot(-N, L) * 0.5 + 0.5);
    float wrap = pow(back, 2.0) * uSubsurface;
    // Transmission is tinted by the material, warmed slightly.
    color += diffuseColor * uSunColor * uSunIntensity * wrap * 0.55 * mix(0.35, 1.0, shadow);
  }

  /* --- ambient from the sky --- */
  vec3 irradiance = skyIrradiance(N);
  vec3 kS = fresnelSchlickRough(NoV, F0, rough);
  vec3 kD = (vec3(1.0) - kS) * (1.0 - metal);
  vec3 R = reflect(-V, N);
  // Rough surfaces reflect an increasingly averaged sky.
  vec3 envSpec = mix(skyRadiance(R), skyIrradiance(N), rough * rough);
  color += (kD * diffuseColor * irradiance + envSpec * envBRDFApprox(F0, rough, NoV)) * ao;

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
    float G = geometrySmith(NoV, lNoL, rough);
    vec3 F = fresnelSchlick(max(dot(V, H), 0.0), F0);
    vec3 spec = (D * G * F) / max(4.0 * NoV * lNoL, 1e-4);
    vec3 radiance = uLightColor[i].rgb * uLightColor[i].a * atten;
    color += ((vec3(1.0) - F) * diffuseColor * INV_PI + spec) * radiance * lNoL;
  }

  color += uEmissive;

  vec3 viewDir = normalize(vWorldPos - uCameraPos);
  color = applyFog(color, vWorldPos, uCameraPos, viewDir);

  float alpha = uOpacity;
#ifdef WATER_FX
  // Foam is opaque; the water beneath it is not.
  alpha = mix(alpha, 1.0, foam);
#endif
#ifdef ALPHA_CLIP
  // Grass blades taper to nothing; clipping keeps the silhouette crisp.
  // Where a second material has taken the fragment over, its holes are
  // the ones that count — cutting rock against soil's alpha would punch
  // the soil's gaps through solid stone.
  if (uHasMaps >= 1) {
    float a = texture(uAlbedoMap, uv).a;
    if (slopeMix > 0.0) a = mix(a, texture(uAlbedoMap2, uv2).a, slopeMix);
    alpha *= a;
  }
  if (alpha < 0.35) discard;
  alpha = 1.0;
#endif
  outColor = vec4(color, alpha);
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
#ifdef ALPHA_CLIP
uniform sampler2D uAlbedoMap;
uniform float uUvScale;
#endif
void main(){
  /* Depth-only: the fixed-function depth write is almost the entire
     output. The exception is a surface that is mostly holes.

     A canopy is modelled as a handful of solid cones and only becomes a
     tree in the beauty pass, where the albedo's alpha cuts it down to
     leaves. If this pass does not make the same cut, the two passes
     disagree about the same surface: the tree you can see through casts
     the shadow of something you cannot, and a wood goes from dapple to
     one flat black pool with the sky's blue in it. Same map, same
     threshold as the colour pass, deliberately — any daylight between
     the two shows up as leaves whose shadows are the wrong shape. */
#ifdef ALPHA_CLIP
  if (texture(uAlbedoMap, vUv * uUvScale).a < 0.35) discard;
#endif
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
uniform float uTime;
uniform sampler2D uAdapt;
uniform float uAutoKey;
uniform vec2 uAutoRange;
layout(location=0) out vec4 outColor;

/* ACES filmic tonemap (Narkowicz fit). Without a real tonemapper, bright
   HDR values clip to flat white and the whole image looks amateur. */
vec3 acesFilm(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return saturate3((x * (a * x + b)) / (x * (c * x + d) + e));
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

  vec3 bloom = texture(uBloom0, uv).rgb * 0.5
             + texture(uBloom1, uv).rgb * 0.32
             + texture(uBloom2, uv).rgb * 0.18;
  color += bloom * uBloomStrength;

  /* Stop the lens down to what the eye has adapted to. uAutoKey is the
     average scene luminance the grade was authored against, so a frame
     at exactly that brightness comes through at exposure 1 and looks
     the way it always did; everything darker is opened up and
     everything brighter is closed down, within a bounded range. The
     bounds matter: without them a night scene would be lifted to
     daylight and a snowfield crushed to grey, and the game would lose
     the difference between noon and midnight, which is a difference it
     is largely about. */
  float ex = uExposure;
  if (uAutoKey > 0.0) {
    float avg = exp(texture(uAdapt, vec2(0.5)).r);
    ex *= clamp(uAutoKey / max(avg, 1e-4), uAutoRange.x, uAutoRange.y);
  }
  color *= ex;
  color = acesFilm(color);

  // Grade in display space: contrast around mid-grey, then saturation.
  color = saturate3((color - 0.5) * uContrast + 0.5);
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(lum), color, uSaturation);

  color *= 1.0 - saturate1(r2 * uVignette);

  if (uGrain > 0.0) {
    float n = hash12(gl_FragCoord.xy + fract(uTime) * 173.0) - 0.5;
    color += n * uGrain;
  }

  // Linear to sRGB. The default framebuffer is not sRGB-encoded, so this
  // conversion has to be explicit or everything reads too dark.
  color = pow(saturate3(color), vec3(1.0 / 2.2));
  outColor = vec4(color, 1.0);
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

/* ---------------- eye adaptation ----------------

   Three small passes that measure how bright the frame is and remember
   it between frames.

   A renderer with a fixed exposure is a camera with the lens taped
   open. It is physically faithful and it is wrong, because the thing
   it leaves out is the observer: a forest floor really does receive a
   twentieth of the light the clearing beside it gets, and a person
   standing on it really can see it perfectly well, because their eyes
   have stopped down. Without that, every wood in the game is a black
   pit with a bright hole in the middle, which is exactly what a
   photograph exposed for the sky looks like and nothing like what
   being in a wood looks like.

   The measurement is the average of log luminance, not of luminance:
   the eye works in ratios, and a mean in linear light is dominated by
   whatever small bright thing is in frame — one glint of sun on water
   would stop the whole image down. */
GLSL.lumFrag = `
in vec2 vUv;
uniform sampler2D uTex;
layout(location=0) out vec4 outColor;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  outColor = vec4(log(max(l, 1e-4)), 0.0, 0.0, 1.0);
}
`;

/* One step of an exact 8x8 box reduction: each output texel averages
   the eight-by-eight block of source texels it covers. Two steps take
   64x64 down to a single number with no sampling gaps. */
GLSL.lumReduceFrag = `
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
layout(location=0) out vec4 outColor;
void main(){
  float s = 0.0;
  for (int y = 0; y < 8; y++) {
    for (int x = 0; x < 8; x++) {
      vec2 o = (vec2(float(x), float(y)) - 3.5) * uTexel;
      s += texture(uTex, vUv + o).r;
    }
  }
  outColor = vec4(s / 64.0, 0.0, 0.0, 1.0);
}
`;

/* Move the remembered level a little way toward the measured one.

   Asymmetrically, because eyes are asymmetric: walking out of a wood
   into a field you are comfortable in under a second, and walking the
   other way you are briefly blind. Light adaptation is quick, dark
   adaptation is slow — minutes, really, which is more patience than a
   game can ask for, so it is compressed to a couple of seconds while
   keeping the direction of the asymmetry, which is the part you
   actually feel. */
GLSL.adaptFrag = `
uniform sampler2D uPrev;
uniform sampler2D uTarget;
uniform float uUp;
uniform float uDown;
layout(location=0) out vec4 outColor;
void main(){
  float prev = texture(uPrev, vec2(0.5)).r;
  float now  = texture(uTarget, vec2(0.5)).r;
  outColor = vec4(mix(prev, now, now > prev ? uUp : uDown), 0.0, 0.0, 1.0);
}
`;

GLSL.copyFrag = `
in vec2 vUv;
uniform sampler2D uTex;
layout(location=0) out vec4 outColor;
void main(){ outColor = texture(uTex, vUv); }
`;
