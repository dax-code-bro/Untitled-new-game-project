// Ported from engine/src/50-shaders.js GLSL.fluidBlurFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
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
