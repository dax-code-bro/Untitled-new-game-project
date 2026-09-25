// Ported from engine/src/50-shaders.js GLSL.blurFrag (GLSL ES 3.00 -> 4.50 core).
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
