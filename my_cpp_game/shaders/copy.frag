// Ported from engine/src/50-shaders.js GLSL.copyFrag (GLSL ES 3.00 -> 4.50 core).
in vec2 vUv;
uniform sampler2D uTex;
layout(location=0) out vec4 outColor;
void main(){ outColor = texture(uTex, vUv); }
