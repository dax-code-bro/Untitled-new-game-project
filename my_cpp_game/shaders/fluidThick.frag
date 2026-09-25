// Ported from engine/src/50-shaders.js GLSL.fluidThickFrag (GLSL ES 3.00 -> 4.50 core).
in vec2 vCorner;
layout(location=0) out vec4 outThick;
void main(){
  float r2 = dot(vCorner, vCorner);
  if (r2 > 1.0) discard;
  // Additive chord length through the sphere = how much water is in front.
  outThick = vec4(sqrt(1.0 - r2) * 0.06, 0.0, 0.0, 1.0);
}
