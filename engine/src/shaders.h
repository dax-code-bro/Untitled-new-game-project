// ============================================================================
//  MOOR3D — GLSL ES 3.00 shader library
//
//  Pipeline:  shadow cascades -> HDR forward pass (PBR) -> bloom -> ACES + FXAA
// ============================================================================
#pragma once

namespace shaders {

// ---------------------------------------------------------------------------
//  Shared GLSL chunks
// ---------------------------------------------------------------------------
static const char* COMMON_FRAG_HEAD = R"(#version 300 es
precision highp float;
precision highp sampler2D;
)";

// Physically based shading + cascaded shadows + fog. Injected into the main pass.
static const char* PBR_LIB = R"(
const float PI = 3.14159265359;

// ---- GGX normal distribution
float D_GGX(float NoH, float a){
  float a2 = a * a;
  float d  = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}
// ---- Smith height-correlated visibility
float V_SmithGGX(float NoV, float NoL, float a){
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-7);
}
// ---- Schlick fresnel
vec3 F_Schlick(vec3 f0, float VoH){
  float f = pow(1.0 - VoH, 5.0);
  return f0 + (vec3(1.0) - f0) * f;
}

// Poisson-ish kernel for percentage-closer filtering.
const vec2 PCF[16] = vec2[16](
  vec2(-0.94, 0.00), vec2(-0.32, 0.93), vec2( 0.79, 0.61), vec2( 0.89,-0.45),
  vec2( 0.05,-0.99), vec2(-0.72,-0.69), vec2(-0.41, 0.31), vec2( 0.44, 0.21),
  vec2( 0.16, 0.56), vec2(-0.15,-0.41), vec2( 0.61,-0.12), vec2(-0.63, 0.66),
  vec2( 0.35,-0.67), vec2(-0.88, 0.37), vec2( 0.26, 0.89), vec2(-0.05,-0.74)
);

float sampleCascade(sampler2D smap, vec3 proj, float texel, float bias){
  if(proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0 || proj.z > 1.0) return 1.0;
  float lit = 0.0;
  for(int i = 0; i < 16; i++){
    float d = texture(smap, proj.xy + PCF[i] * texel).r;
    lit += (proj.z - bias) <= d ? 1.0 : 0.0;
  }
  return lit / 16.0;
}

// ACES filmic curve (Narkowicz fit) — keeps highlights from clipping to white.
vec3 ACES(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
)";

// ---------------------------------------------------------------------------
//  MAIN PASS — instanced, skinned, shadowed PBR
// ---------------------------------------------------------------------------
static const char* MAIN_VS = R"(#version 300 es
precision highp float;

layout(location=0)  in vec3  aPos;
layout(location=1)  in vec3  aNrm;
layout(location=2)  in vec3  aCol;
layout(location=3)  in float aAO;
layout(location=4)  in float aJoint;
layout(location=5)  in float aRough;
layout(location=6)  in float aMetal;
layout(location=7)  in vec4  iM0;
layout(location=8)  in vec4  iM1;
layout(location=9)  in vec4  iM2;
layout(location=10) in vec4  iM3;
layout(location=11) in vec4  iTint;

uniform mat4  uViewProj;
uniform float uTime;
uniform int   uSkinned;          // 1 = apply uJoints[aJoint]
uniform int   uSway;             // 1 = foliage wind displacement
uniform mat4  uJoints[24];

out vec3  vWorld;
out vec3  vNrm;
out vec3  vCol;
out float vAO;
out float vRough;
out float vMetal;
out float vExtra;

void main(){
  mat4 model = mat4(iM0, iM1, iM2, iM3);

  vec4 local = vec4(aPos, 1.0);
  vec3 lnrm  = aNrm;

  if(uSkinned == 1){
    // Single-weight skinning: every vertex belongs to exactly one joint.
    // For hard-segmented characters this is exact, and 4x cheaper than 4-weight.
    mat4 J = uJoints[int(aJoint + 0.5)];
    local  = J * local;
    lnrm   = mat3(J) * lnrm;
  }

  vec4 world = model * local;

  if(uSway == 1){
    // Wind: stronger the further from the trunk base, phase-offset per instance.
    float h    = max(aPos.y, 0.0);
    float ph   = iTint.w * 6.2831 + uTime * 1.6;
    float gust = 0.6 + 0.4 * sin(uTime * 0.23 + world.x * 0.01 + world.z * 0.013);
    float amp  = h * 0.055 * gust;
    world.x += sin(ph + world.y * 0.25) * amp;
    world.z += cos(ph * 0.87 + world.y * 0.21) * amp * 0.8;
  }

  vWorld = world.xyz;
  vNrm   = normalize(mat3(model) * lnrm);
  vCol   = aCol * iTint.rgb;
  vAO    = aAO;
  vRough = aRough;
  vMetal = aMetal;
  vExtra = iTint.w;

  gl_Position = uViewProj * world;
}
)";

static const char* MAIN_FS_BODY = R"(
in vec3  vWorld;
in vec3  vNrm;
in vec3  vCol;
in float vAO;
in float vRough;
in float vMetal;
in float vExtra;

uniform vec3  uCamPos;
uniform vec3  uSunDir;           // points *towards* the sun
uniform vec3  uSunColour;
uniform vec3  uSkyColour;
uniform vec3  uGroundColour;
uniform float uTime;
uniform float uFogDensity;
uniform vec3  uFogColour;
uniform float uNightFactor;      // 0 day .. 1 night
uniform float uExposure;

uniform sampler2D uShadow0;
uniform sampler2D uShadow1;
uniform sampler2D uShadow2;
uniform mat4      uLightVP0;
uniform mat4      uLightVP1;
uniform mat4      uLightVP2;
uniform float     uCascadeEnd0;
uniform float     uCascadeEnd1;
uniform float     uShadowTexel;
uniform float     uShadowTexel1;
uniform float     uShadowTexel2;

// Point lights: headlights, street lamps, windows. Tight budget, big payoff.
uniform int   uDebugMode;   // 0 off, 1 shadow factor, 2 cascade id, 3 light-space uv
uniform int   uNumLights;
uniform vec4  uLightPos[16];     // xyz = position, w = radius
uniform vec4  uLightCol[16];     // rgb = colour,   a = intensity

out vec4 fragColour;

float shadowFactor(float viewDepth){
  vec3 p;
  if(viewDepth < uCascadeEnd0){
    vec4 lp = uLightVP0 * vec4(vWorld, 1.0);
    p = (lp.xyz / lp.w) * 0.5 + 0.5;
    return sampleCascade(uShadow0, p, uShadowTexel, 0.0035);
  } else if(viewDepth < uCascadeEnd1){
    vec4 lp = uLightVP1 * vec4(vWorld, 1.0);
    p = (lp.xyz / lp.w) * 0.5 + 0.5;
    return sampleCascade(uShadow1, p, uShadowTexel1, 0.0016);
  } else {
    vec4 lp = uLightVP2 * vec4(vWorld, 1.0);
    p = (lp.xyz / lp.w) * 0.5 + 0.5;
    return sampleCascade(uShadow2, p, uShadowTexel2, 0.0030);
  }
}

void main(){
  vec3  N = normalize(vNrm);
  if(uDebugMode > 0){
    float vd = length(uCamPos - vWorld);
    if(uDebugMode == 1){
      float sh = shadowFactor(vd);
      fragColour = vec4(vec3(sh), 1.0);
      return;
    }
    if(uDebugMode == 2){
      vec3 c = vd < uCascadeEnd0 ? vec3(1.0,0.2,0.2)
             : vd < uCascadeEnd1 ? vec3(0.2,1.0,0.2) : vec3(0.2,0.4,1.0);
      fragColour = vec4(c, 1.0);
      return;
    }
    if(uDebugMode == 3){
      vec4 lp = uLightVP0 * vec4(vWorld, 1.0);
      vec3 pr = (lp.xyz / lp.w) * 0.5 + 0.5;
      // red = outside the cascade, else show uv
      bool oob = pr.x < 0.0 || pr.x > 1.0 || pr.y < 0.0 || pr.y > 1.0 || pr.z > 1.0;
      fragColour = oob ? vec4(1.0,0.0,0.0,1.0) : vec4(pr.xy, pr.z, 1.0);
      return;
    }
    if(uDebugMode == 4){
      // what the cascade-0 map actually stores at this fragment
      vec4 lp = uLightVP0 * vec4(vWorld, 1.0);
      vec3 pr = (lp.xyz / lp.w) * 0.5 + 0.5;
      float d = texture(uShadow0, pr.xy).r;
      fragColour = vec4(vec3(d), 1.0);
      return;
    }
  }
  vec3  V = normalize(uCamPos - vWorld);
  float NoV = max(dot(N, V), 1e-4);

  vec3  albedo = vCol;
  float rough  = clamp(vRough, 0.045, 1.0);
  float a      = rough * rough;
  float metal  = clamp(vMetal, 0.0, 1.0);
  vec3  f0     = mix(vec3(0.04), albedo, metal);
  vec3  diffAlb= albedo * (1.0 - metal);

  float viewDepth = length(uCamPos - vWorld);

  // ---------------- sun (directional)
  vec3 L   = normalize(uSunDir);
  float NoL = dot(N, L);
  vec3 direct = vec3(0.0);
  if(NoL > 0.0){
    vec3  H   = normalize(L + V);
    float NoH = max(dot(N, H), 0.0);
    float VoH = max(dot(V, H), 0.0);
    float D   = D_GGX(NoH, a);
    float Vis = V_SmithGGX(NoV, NoL, a);
    vec3  F   = F_Schlick(f0, VoH);
    vec3  spec = D * Vis * F;
    vec3  diff = diffAlb / PI;
    float sh   = shadowFactor(viewDepth);
    direct = (diff + spec) * uSunColour * NoL * sh;
  }

  // ---------------- ambient: hemisphere IBL approximation
  float hemi = 0.5 + 0.5 * N.y;
  vec3  irr  = mix(uGroundColour, uSkyColour, hemi);
  vec3  ambDiff = diffAlb * irr * vAO;
  // cheap specular occlusion + horizon fade for the reflective lobe
  float fres = pow(1.0 - NoV, 4.0);
  vec3  ambSpec = mix(f0, vec3(1.0), fres) * uSkyColour * (1.0 - rough) * 0.35 * vAO;

  vec3 colour = direct + ambDiff + ambSpec;

  // ---------------- point lights
  for(int i = 0; i < 16; i++){
    if(i >= uNumLights) break;
    vec3  lp   = uLightPos[i].xyz;
    float rad  = uLightPos[i].w;
    vec3  d    = lp - vWorld;
    float dist = length(d);
    if(dist > rad) continue;
    vec3  Lp   = d / max(dist, 1e-4);
    float nl   = dot(N, Lp);
    if(nl <= 0.0) continue;
    // inverse-square with a smooth windowed cutoff
    float t    = dist / rad;
    float win  = clamp(1.0 - t * t * t * t, 0.0, 1.0);
    float att  = win * win / (1.0 + dist * dist * 0.06);
    vec3  H    = normalize(Lp + V);
    float NoH  = max(dot(N, H), 0.0);
    float VoH  = max(dot(V, H), 0.0);
    vec3  spec = D_GGX(NoH, a) * V_SmithGGX(NoV, nl, a) * F_Schlick(f0, VoH);
    colour += (diffAlb / PI + spec) * uLightCol[i].rgb * uLightCol[i].a * nl * att;
  }

  // ---------------- exponential-squared height fog
  float fogH  = exp(-max(vWorld.y, 0.0) * 0.012);
  float fogT  = 1.0 - exp(-pow(viewDepth * uFogDensity, 2.0));
  fogT = clamp(fogT * fogH, 0.0, 1.0);
  colour = mix(colour, uFogColour, fogT);

  fragColour = vec4(colour * uExposure, 1.0);
}
)";

// ---------------------------------------------------------------------------
//  SHADOW DEPTH PASS
// ---------------------------------------------------------------------------
static const char* SHADOW_VS = R"(#version 300 es
precision highp float;
layout(location=0)  in vec3  aPos;
layout(location=4)  in float aJoint;
layout(location=7)  in vec4  iM0;
layout(location=8)  in vec4  iM1;
layout(location=9)  in vec4  iM2;
layout(location=10) in vec4  iM3;
layout(location=11) in vec4  iTint;
uniform mat4  uLightVP;
uniform int   uSkinned;
uniform int   uSway;
uniform float uTime;
uniform mat4  uJoints[24];
void main(){
  mat4 model = mat4(iM0, iM1, iM2, iM3);
  vec4 local = vec4(aPos, 1.0);
  if(uSkinned == 1) local = uJoints[int(aJoint + 0.5)] * local;
  vec4 world = model * local;
  if(uSway == 1){
    float h = max(aPos.y, 0.0);
    float ph = iTint.w * 6.2831 + uTime * 1.6;
    world.x += sin(ph + world.y * 0.25) * h * 0.055;
  }
  gl_Position = uLightVP * world;
}
)";

static const char* SHADOW_FS = R"(#version 300 es
precision highp float;
void main(){ }
)";

// ---------------------------------------------------------------------------
//  SKY — analytic Rayleigh + Mie single scattering, sun disc, stars
// ---------------------------------------------------------------------------
static const char* SKY_VS = R"(#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform mat4 uInvViewProj;
out vec3 vRay;
void main(){
  // Reconstruct a world-space view ray from the far plane.
  vec4 far  = uInvViewProj * vec4(aPos, 1.0, 1.0);
  vec4 near = uInvViewProj * vec4(aPos, -1.0, 1.0);
  vRay = normalize(far.xyz / far.w - near.xyz / near.w);
  gl_Position = vec4(aPos, 1.0, 1.0);          // z=1 -> always at the far plane
}
)";

static const char* SKY_FS = R"(#version 300 es
precision highp float;
in vec3 vRay;
uniform vec3  uSunDir;
uniform float uNightFactor;
uniform float uExposure;
uniform float uTime;
out vec4 fragColour;

// Rayleigh coefficients tuned for a believable daytime sky.
const vec3 BETA_R = vec3(5.8e-3, 1.35e-2, 3.31e-2);
const vec3 BETA_M = vec3(4.0e-3);

float rayleighPhase(float c){ return 3.0 / (16.0 * 3.14159265) * (1.0 + c * c); }
float miePhase(float c, float g){
  float g2 = g * g;
  float d  = 1.0 + g2 - 2.0 * g * c;
  return 3.0 / (8.0 * 3.14159265) * ((1.0 - g2) * (1.0 + c * c))
       / ((2.0 + g2) * max(pow(d, 1.5), 1e-4));
}
float starField(vec3 d){
  // Quantise the direction into cells and light a sparse few of them.
  vec3 p = d * 220.0;
  vec3 c = floor(p);
  float h = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  if(h < 0.9975) return 0.0;
  vec3 f = fract(p) - 0.5;
  float star = exp(-dot(f, f) * 34.0);
  float twinkle = 0.65 + 0.35 * sin(uTime * 2.1 + h * 200.0);
  return star * twinkle;
}

void main(){
  vec3 dir = normalize(vRay);
  float up = max(dir.y, -0.08);
  vec3  sun = normalize(uSunDir);
  float cosT = dot(dir, sun);

  // Optical depth grows sharply towards the horizon.
  float zen = 1.0 / max(up + 0.09, 0.02);
  vec3 tR = BETA_R * zen * 3.2;
  vec3 tM = BETA_M * zen * 3.2;
  vec3 extinction = exp(-(tR + tM));

  float pR = rayleighPhase(cosT);
  float pM = miePhase(cosT, 0.78);

  float sunUp = clamp(sun.y * 2.2 + 0.18, 0.0, 1.0);
  vec3 inscatter = (BETA_R * pR * 62.0 + BETA_M * pM * 42.0) * zen * sunUp;
  vec3 colour = inscatter * (vec3(1.0) - extinction) * 6.0;

  // Warm the horizon at low sun angles (sunrise / sunset).
  float horizon = pow(1.0 - clamp(up * 2.4, 0.0, 1.0), 3.0);
  float lowSun  = clamp(1.0 - abs(sun.y) * 3.4, 0.0, 1.0);
  colour += vec3(1.05, 0.40, 0.12) * horizon * lowSun * 1.5;

  // Sun disc with a soft bloom skirt.
  float disc = smoothstep(0.99955, 0.99990, cosT);
  colour += vec3(14.0, 12.4, 10.2) * disc * sunUp;
  colour += vec3(1.5, 1.25, 0.95) * pow(max(cosT, 0.0), 480.0) * sunUp;

  // Night: deep blue, stars, and a faint moon glow opposite the sun.
  vec3 night = vec3(0.012, 0.020, 0.048) * (0.45 + 0.55 * up);
  night += vec3(0.95, 0.96, 1.0) * starField(dir) * 1.25;
  float moon = smoothstep(0.9993, 0.99985, dot(dir, -sun));
  night += vec3(1.7, 1.72, 1.6) * moon;
  colour = mix(colour, night, uNightFactor);

  fragColour = vec4(colour * uExposure, 1.0);
}
)";

// ---------------------------------------------------------------------------
//  WATER — sum-of-sines displacement, analytic normals, fresnel + sun glitter
// ---------------------------------------------------------------------------
static const char* WATER_VS = R"(#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4  uViewProj;
uniform float uTime;
uniform vec3  uCamPos;
out vec3 vWorld;
out vec3 vNrm;
out float vFoam;

// Four travelling wave trains. Derivatives are analytic, so the normal is exact.
void waves(vec2 p, float t, out float h, out vec2 grad){
  h = 0.0; grad = vec2(0.0);
  vec2  dirs[4] = vec2[4](vec2(1.0,0.22), vec2(-0.55,0.84), vec2(0.35,-0.94), vec2(-0.86,-0.42));
  float amps[4] = float[4](0.44, 0.27, 0.15, 0.085);
  float lens[4] = float[4](34.0, 19.0, 11.0, 6.2);
  float spds[4] = float[4](1.05, 1.45, 1.95, 2.55);
  for(int i = 0; i < 4; i++){
    vec2  d = normalize(dirs[i]);
    float k = 6.2831853 / lens[i];
    float ph = dot(d, p) * k + t * spds[i] * k * 0.55;
    h    += sin(ph) * amps[i];
    grad += d * (cos(ph) * amps[i] * k);
  }
}

void main(){
  vec3 wp = aPos;
  float h; vec2 g;
  waves(wp.xz, uTime, h, g);
  // Flatten distant water so the silhouette stays calm and cheap.
  float fade = clamp(1.0 - length(uCamPos.xz - wp.xz) / 900.0, 0.0, 1.0);
  wp.y += h * fade;
  vWorld = wp;
  vNrm   = normalize(vec3(-g.x * fade, 1.0, -g.y * fade));
  vFoam  = clamp(h * 1.15, 0.0, 1.0);
  gl_Position = uViewProj * vec4(wp, 1.0);
}
)";

static const char* WATER_FS = R"(#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNrm;
in float vFoam;
uniform vec3  uCamPos;
uniform vec3  uSunDir;
uniform vec3  uSunColour;
uniform vec3  uSkyColour;
uniform vec3  uFogColour;
uniform float uFogDensity;
uniform float uNightFactor;
uniform float uExposure;
uniform float uTime;
out vec4 fragColour;

void main(){
  vec3 N = normalize(vNrm);
  vec3 V = normalize(uCamPos - vWorld);
  vec3 L = normalize(uSunDir);

  // Schlick fresnel with water's 0.02 normal reflectance.
  float NoV  = max(dot(N, V), 1e-4);
  float fres = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);

  vec3 deep    = vec3(0.012, 0.055, 0.092);
  vec3 shallow = vec3(0.045, 0.165, 0.190);
  float depthMix = clamp(NoV * 1.5, 0.0, 1.0);
  vec3 body = mix(deep, shallow, depthMix);

  // Sky reflection along the mirror direction.
  vec3 R = reflect(-V, N);
  vec3 refl = uSkyColour * (0.55 + 0.45 * clamp(R.y, 0.0, 1.0));

  // Tight specular lobe -> sun glitter path across the surface.
  vec3  H    = normalize(L + V);
  float NoH  = max(dot(N, H), 0.0);
  float glint = pow(NoH, 620.0) * 5.0 + pow(NoH, 90.0) * 0.6;
  vec3  spec = uSunColour * glint * clamp(L.y * 3.0, 0.0, 1.0);

  vec3 colour = mix(body, refl, fres) + spec;
  colour += vec3(0.85) * pow(vFoam, 3.4) * 0.30 * (1.0 - uNightFactor);

  float viewDepth = length(uCamPos - vWorld);
  float fogT = 1.0 - exp(-pow(viewDepth * uFogDensity, 2.0));
  colour = mix(colour, uFogColour, clamp(fogT, 0.0, 1.0));

  fragColour = vec4(colour * uExposure, 1.0);
}
)";

// ---------------------------------------------------------------------------
//  POST — bright pass, separable blur, composite (ACES + FXAA + vignette)
// ---------------------------------------------------------------------------
static const char* POST_VS = R"(#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
)";

static const char* BRIGHT_FS = R"(#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSrc;
uniform float uThreshold;
uniform float uKnee;
out vec4 fragColour;
void main(){
  vec3 c = texture(uSrc, vUV).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Soft knee so the bloom ramps in instead of popping.
  float t = uThreshold, k = max(uKnee, 1e-4);
  float soft = clamp((lum - t + k) / (2.0 * k), 0.0, 1.0);
  float w = max(soft * soft * k, max(lum - t, 0.0)) / max(lum, 1e-4);
  fragColour = vec4(c * w, 1.0);
}
)";

static const char* BLUR_FS = R"(#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2  uDir;          // (1/w, 0) or (0, 1/h)
out vec4 fragColour;
// 9-tap gaussian, linear-sampling optimised to 5 fetches.
const float W[3] = float[3](0.2270270270, 0.3162162162, 0.0702702703);
const float O[3] = float[3](0.0, 1.3846153846, 3.2307692308);
void main(){
  vec3 c = texture(uSrc, vUV).rgb * W[0];
  for(int i = 1; i < 3; i++){
    c += texture(uSrc, vUV + uDir * O[i]).rgb * W[i];
    c += texture(uSrc, vUV - uDir * O[i]).rgb * W[i];
  }
  fragColour = vec4(c, 1.0);
}
)";

static const char* COMPOSITE_FS = R"(#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2  uTexel;
uniform float uBloomStrength;
uniform float uVignette;
uniform float uChromatic;
uniform int   uFXAA;
uniform sampler2D uDbgTex;
uniform int   uShowDbgTex;
out vec4 fragColour;

vec3 ACESfit(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

void main(){
  if(uShowDbgTex == 1){
    float d = texture(uDbgTex, vUV).r;
    // expand the top of the range so near-1.0 values are distinguishable
    fragColour = vec4(vec3(d), 1.0);
    return;
  }
  // --- slight lateral chromatic aberration, scaled by distance from centre
  vec2 ctr = vUV - 0.5;
  float r2 = dot(ctr, ctr);
  vec3 scene;
  if(uChromatic > 0.0){
    vec2 off = ctr * r2 * uChromatic;
    scene.r = texture(uScene, vUV + off).r;
    scene.g = texture(uScene, vUV).g;
    scene.b = texture(uScene, vUV - off).b;
  } else {
    scene = texture(uScene, vUV).rgb;
  }

  scene += texture(uBloom, vUV).rgb * uBloomStrength;

  // --- tonemap to LDR
  vec3 colour = ACESfit(scene);

  // --- FXAA 3.11 (console flavour) on the tonemapped image
  if(uFXAA == 1){
    vec3 rgbNW = ACESfit(texture(uScene, vUV + vec2(-uTexel.x, -uTexel.y)).rgb);
    vec3 rgbNE = ACESfit(texture(uScene, vUV + vec2( uTexel.x, -uTexel.y)).rgb);
    vec3 rgbSW = ACESfit(texture(uScene, vUV + vec2(-uTexel.x,  uTexel.y)).rgb);
    vec3 rgbSE = ACESfit(texture(uScene, vUV + vec2( uTexel.x,  uTexel.y)).rgb);
    float lNW = luma(rgbNW), lNE = luma(rgbNE);
    float lSW = luma(rgbSW), lSE = luma(rgbSE), lM = luma(colour);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    float range = lMax - lMin;
    if(range >= lMax * 0.125){
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + max(range * 0.25, 1.0/128.0));
      dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uTexel;
      vec3 a = 0.5 * (ACESfit(texture(uScene, vUV + dir * (1.0/3.0 - 0.5)).rgb)
                    + ACESfit(texture(uScene, vUV + dir * (2.0/3.0 - 0.5)).rgb));
      vec3 b = a * 0.5 + 0.25 * (ACESfit(texture(uScene, vUV - dir * 0.5).rgb)
                               + ACESfit(texture(uScene, vUV + dir * 0.5).rgb));
      float lB = luma(b);
      colour = (lB < lMin || lB > lMax) ? a : b;
    }
  }

  // --- vignette
  colour *= 1.0 - uVignette * smoothstep(0.18, 0.92, r2 * 2.0);

  // --- ordered dither to break up banding in the dark gradients
  float dither = fract(dot(gl_FragCoord.xy, vec2(0.7548776662, 0.5698402909)));
  colour += (dither - 0.5) / 255.0;

  // --- sRGB encode
  colour = pow(clamp(colour, 0.0, 1.0), vec3(1.0 / 2.2));
  fragColour = vec4(colour, 1.0);
}
)";

} // namespace shaders
