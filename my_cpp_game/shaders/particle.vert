// Ported from engine/src/50-shaders.js GLSL.particleVert (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
layout(location=0) in vec2 aCorner;
layout(location=8) in vec4 aPosSize;   // xyz world position, w size
layout(location=9) in vec4 aColor;     // rgb tint, a alpha
layout(location=10) in vec4 aExtra;    // x rotation, y fade, z type, w seed

uniform mat4 uViewProj;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;

out vec2 vUv;
out vec4 vColor;
out float vType;
out float vSeed;

void main(){
  float c = cos(aExtra.x), s = sin(aExtra.x);
  vec2 corner = vec2(aCorner.x * c - aCorner.y * s, aCorner.x * s + aCorner.y * c);
  vec3 world = aPosSize.xyz + (uCameraRight * corner.x + uCameraUp * corner.y) * aPosSize.w;
  vUv = aCorner * 0.5 + 0.5;
  vColor = aColor;
  vType = aExtra.z;
  vSeed = aExtra.w;
  gl_Position = uViewProj * vec4(world, 1.0);
}
