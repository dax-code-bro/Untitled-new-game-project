// Ported from engine/src/50-shaders.js GLSL.envPrefilterFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
#include "lib/envSample.glsl"
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
