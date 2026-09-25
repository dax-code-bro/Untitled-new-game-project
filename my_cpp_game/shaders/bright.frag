// Ported from engine/src/50-shaders.js GLSL.brightFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
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
