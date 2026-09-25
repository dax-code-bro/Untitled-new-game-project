// Ported from engine/src/50-shaders.js GLSL.envBakeFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
#include "lib/sky.glsl"
#include "lib/envSample.glsl"
in vec2 vUv;
uniform vec3 uEnvFaceX;
uniform vec3 uEnvFaceY;
uniform vec3 uEnvFaceZ;
layout(location=0) out vec4 outColor;
void main(){
  vec3 dir = envFaceDir(vUv, uEnvFaceX, uEnvFaceY, uEnvFaceZ);
  /* uEnvNoSunDisc is set to 1 for this draw, so what lands in the cube
     is the gradient, the horizon fade, the ground bounce and the Mie
     halo -- everything except the disc. pbrFrag adds the analytic sun
     itself, with a shadow term the cube cannot have, and a ~74-linear
     spike smeared across a GGX lobe puts a second, blurry, unshadowed
     sun on every rough metal in the game. */
  outColor = vec4(skyRadiance(dir), 1.0);
}
