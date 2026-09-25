// Ported from engine/src/50-shaders.js GLSL.skyVert (GLSL ES 3.00 -> 4.50 core).
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
out vec3 vDir;
void main(){
  // Fullscreen triangle from gl_VertexID: the native build draws it with an
  // empty VAO instead of the web's one-attribute buffer.
  vec2 aPos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0;
  // Unproject the far plane to get a world-space ray per pixel.
  vec4 far = uInvViewProj * vec4(aPos, 1.0, 1.0);
  vDir = far.xyz / far.w - uCameraPos;
  gl_Position = vec4(aPos, 1.0, 1.0);
}
