// Ported from engine/src/50-shaders.js GLSL.envBrdfFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
#include "lib/envSample.glsl"
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
