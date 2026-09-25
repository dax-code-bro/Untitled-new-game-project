// Ported from engine/src/50-shaders.js GLSL.volBlurFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
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
