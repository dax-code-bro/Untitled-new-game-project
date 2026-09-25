// Ported from engine/src/50-shaders.js GLSL.shadowVert (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
#include "lib/transform.glsl"
out vec2 vUv;
void main(){
  Surface s = computeSurface();
  vUv = s.uv;
  gl_Position = uViewProj * vec4(s.worldPos, 1.0);
}
