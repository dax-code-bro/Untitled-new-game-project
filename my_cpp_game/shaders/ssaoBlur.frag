// Ported from engine/src/50-shaders.js GLSL.ssaoBlurFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
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
