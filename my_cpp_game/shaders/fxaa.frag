// Ported from engine/src/50-shaders.js GLSL.fxaaFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
layout(location=0) out vec4 outColor;

/* FXAA 3.11 console variant — one dependent texture fetch pair, and it
   runs after tonemapping where the luma is perceptually meaningful. */
void main(){
  vec3 rgbM = texture(uTex, vUv).rgb;
  vec3 rgbNW = texture(uTex, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture(uTex, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture(uTex, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 rgbSE = texture(uTex, vUv + vec2(1.0, 1.0) * uTexel).rgb;

  const vec3 luma = vec3(0.299, 0.587, 0.114);
  float lNW = dot(rgbNW, luma), lNE = dot(rgbNE, luma);
  float lSW = dot(rgbSW, luma), lSE = dot(rgbSE, luma);
  float lM = dot(rgbM, luma);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));

  // Flat areas are left untouched, which keeps textures from going soft.
  if (lMax - lMin < max(0.0312, lMax * 0.125)) { outColor = vec4(rgbM, 1.0); return; }

  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * uTexel;

  vec3 rgbA = 0.5 * (texture(uTex, vUv + dir * (1.0 / 3.0 - 0.5)).rgb
                   + texture(uTex, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture(uTex, vUv + dir * -0.5).rgb
                                 + texture(uTex, vUv + dir * 0.5).rgb);
  float lB = dot(rgbB, luma);
  outColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
}
