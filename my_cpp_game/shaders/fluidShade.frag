// Ported from engine/src/50-shaders.js GLSL.fluidShadeFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
#include "lib/sky.glsl"
#include "lib/pbr.glsl"
#include "lib/fog.glsl"
in vec2 vUv;
uniform sampler2D uDepthTex;
uniform sampler2D uSceneTex;
uniform sampler2D uThickTex;
uniform mat4 uInvProj;
uniform mat4 uInvView;
uniform vec2 uTexel;
uniform vec3 uCameraPos;
uniform vec3 uWaterColor;
uniform vec3 uDeepColor;
uniform float uTime;
layout(location=0) out vec4 outColor;

vec3 viewPosFromDepth(vec2 uv, float viewZ){
  // Rebuild the view ray through this pixel, then walk it out to viewZ.
  vec4 clip = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  vec4 eye = uInvProj * clip;
  vec3 dir = eye.xyz / eye.w;
  dir /= -dir.z;
  return dir * viewZ;
}

void main(){
  float d = texture(uDepthTex, vUv).r;
  vec3 scene = texture(uSceneTex, vUv).rgb;
  if (d <= 0.0) { outColor = vec4(scene, 1.0); return; }

  vec3 viewPos = viewPosFromDepth(vUv, d);

  // Normals from screen-space derivatives of the reconstructed position.
  // Picking the smaller one-sided difference keeps edges sharp.
  vec3 ddxV = viewPosFromDepth(vUv + vec2(uTexel.x, 0.0), texture(uDepthTex, vUv + vec2(uTexel.x, 0.0)).r) - viewPos;
  vec3 ddxV2 = viewPos - viewPosFromDepth(vUv - vec2(uTexel.x, 0.0), texture(uDepthTex, vUv - vec2(uTexel.x, 0.0)).r);
  if (abs(ddxV2.z) < abs(ddxV.z)) ddxV = ddxV2;
  vec3 ddyV = viewPosFromDepth(vUv + vec2(0.0, uTexel.y), texture(uDepthTex, vUv + vec2(0.0, uTexel.y)).r) - viewPos;
  vec3 ddyV2 = viewPos - viewPosFromDepth(vUv - vec2(0.0, uTexel.y), texture(uDepthTex, vUv - vec2(0.0, uTexel.y)).r);
  if (abs(ddyV2.z) < abs(ddyV.z)) ddyV = ddyV2;

  vec3 nView = normalize(cross(ddxV, ddyV));
  if (nView.z < 0.0) nView = -nView;
  vec3 N = normalize(mat3(uInvView) * nView);
  vec3 worldPos = (uInvView * vec4(viewPos, 1.0)).xyz;

  // Ripple detail on top of the sim's large-scale shape.
  float ripple = fbm3(vec3(worldPos.xz * 3.2, uTime * 0.9)) - 0.5;
  vec3 rippleN = normalize(N + vec3(ripple * 0.28, 0.0, ripple * 0.24));
  N = normalize(mix(N, rippleN, 0.55));

  vec3 V = normalize(uCameraPos - worldPos);
  float NoV = max(dot(N, V), 1e-4);

  float thickness = texture(uThickTex, vUv).r;
  // Beer-Lambert: thick water goes deep blue-green, thin water stays clear.
  vec3 absorb = exp(-thickness * vec3(2.6, 1.5, 1.1) * 1.4);
  vec3 tint = mix(uDeepColor, uWaterColor, absorb.b);

  // Refraction: offset the scene lookup by the surface normal.
  vec2 refrUv = clamp(vUv + N.xz * 0.045 * min(thickness * 2.0, 1.0), vec2(0.001), vec2(0.999));
  vec3 refracted = texture(uSceneTex, refrUv).rgb * absorb;
  refracted = mix(tint * 0.55, refracted, absorb);

  vec3 R = reflect(-V, N);
  vec3 reflected = skyRadiance(R);

  // Schlick Fresnel with water's F0.
  float F = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
  vec3 color = mix(refracted, reflected, F);

  // Specular glint from the sun makes the surface read as liquid.
  vec3 H = normalize(V + uSunDir);
  float spec = pow(max(dot(N, H), 0.0), 220.0);
  color += uSunColor * uSunIntensity * spec * 1.6;

  // Foam where the sheet is thin and choppy — splashes and breaking edges.
  float foam = smoothstep(0.34, 0.06, thickness) * smoothstep(0.2, 0.75, abs(ripple) * 2.4 + 0.28);
  color = mix(color, vec3(0.92, 0.96, 1.0) * uSkyIntensity, foam * 0.55);

  color = applyFog(color, worldPos, uCameraPos, normalize(worldPos - uCameraPos));
  outColor = vec4(color, 1.0);
}
