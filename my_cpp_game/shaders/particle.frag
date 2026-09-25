// Ported from engine/src/50-shaders.js GLSL.particleFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
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
