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
out vec3 vObjPos;
out vec3 vObjScale;
out mat3 vObjRot;

void main(){
  Surface s = computeSurface();
  vWorldPos = s.worldPos;
  vNormal = s.normal;
  vTangent = s.tangent;
  vUv = s.uv;
  vTint = aColor;
  vParams = s.params;
  vViewDepth = length(s.worldPos - uCameraPos);
  vObjPos = s.objPos;
  vObjScale = s.objScale;
  vObjRot = s.objRot;
  gl_Position = uViewProj * vec4(s.worldPos, 1.0);
}
