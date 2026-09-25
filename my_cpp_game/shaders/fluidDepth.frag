// Ported from engine/src/50-shaders.js GLSL.fluidDepthFrag (GLSL ES 3.00 -> 4.50 core).
in vec2 vCorner;
in vec3 vViewCenter;
in float vRadius;
uniform mat4 uProj;
layout(location=0) out vec4 outDepth;
void main(){
  float r2 = dot(vCorner, vCorner);
  if (r2 > 1.0) discard;
  // Push the fragment onto the front of a sphere rather than a flat disc,
  // so overlapping particles merge into a rounded surface.
  float z = sqrt(1.0 - r2);
  vec3 viewPos = vViewCenter + vec3(vCorner, z) * vRadius;
  vec4 clip = uProj * vec4(viewPos, 1.0);
  float ndc = clip.z / clip.w;
  gl_FragDepth = ndc * 0.5 + 0.5;
  // Store view-space depth as a positive distance.
  outDepth = vec4(-viewPos.z, 0.0, 0.0, 1.0);
}
