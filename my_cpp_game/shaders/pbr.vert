// Ported from engine/src/50-shaders.js GLSL.pbrVert (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
#include "lib/transform.glsl"

out vec3 vWorldPos;
out vec3 vNormal;
out vec4 vTangent;
out vec2 vUv;
out vec3 vTint;
out vec4 vParams;
out float vViewDepth;

void main(){
  Surface s = computeSurface();
  vWorldPos = s.worldPos;
  vNormal = s.normal;
  vTangent = s.tangent;
  vUv = s.uv;
  vTint = aColor;
  vParams = s.params;
  vViewDepth = length(s.worldPos - uCameraPos);
  gl_Position = uViewProj * vec4(s.worldPos, 1.0);
}
