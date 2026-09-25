// Ported from engine/src/50-shaders.js GLSL.fluidDepthVert (GLSL ES 3.00 -> 4.50 core).
layout(location=0) in vec2 aCorner;
layout(location=8) in vec4 aPosSize;
uniform mat4 uViewProj;
uniform mat4 uView;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
out vec2 vCorner;
out vec3 vViewCenter;
out float vRadius;
void main(){
  vec3 world = aPosSize.xyz + (uCameraRight * aCorner.x + uCameraUp * aCorner.y) * aPosSize.w;
  vCorner = aCorner;
  vViewCenter = (uView * vec4(aPosSize.xyz, 1.0)).xyz;
  vRadius = aPosSize.w;
  gl_Position = uViewProj * vec4(world, 1.0);
}
