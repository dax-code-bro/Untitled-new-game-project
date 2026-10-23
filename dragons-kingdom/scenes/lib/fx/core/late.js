// FX library - "late" drawing: FX that need to see the opaque scene behind them.
//
// With the cinematic stack, objects marked userData.dkLate are drawn after the main pass with
// copies of its colour and depth (runtime/cinematic/index.js, the same path as the ocean). FX use
// it for soft particles (puffs fade where they meet the ground instead of showing a ruled edge),
// volumes that stop at walls, and heat-shimmer refraction. Without the stack (or before the
// first late pass) dkLateOn = 0 and the shaders fall back to plain blending.
import * as THREE from 'three';

export function makeLateUniforms() {
  return {
    dkSceneDepth: { value: null }, dkSceneColor: { value: null }, dkLateOn: { value: 0 },
    dkLateSize: { value: new THREE.Vector2(1, 1) }, dkLateNearFar: { value: new THREE.Vector2(0.1, 1000) },
    dkProj11: { value: 1 },
  };
}

/** Mark mesh + material for the late pass (the runtime fills the dk* uniforms per frame). */
export function makeLate(mesh, uniforms) {
  mesh.userData.dkLate = true;
  mesh.userData.dkNoVelocity = true;
  mesh.material.userData.dkLateUniforms = uniforms;
  return mesh;
}

export const LATE_GLSL = /* glsl */`
uniform sampler2D dkSceneDepth;
uniform sampler2D dkSceneColor;
uniform float dkLateOn;
uniform vec2 dkLateSize, dkLateNearFar;
// view-space distance (positive) of the opaque scene behind this pixel; 1e9 when unknown
float fxSceneZ() {
  if (dkLateOn < 0.5) return 1e9;
  float d = texelFetch(dkSceneDepth, ivec2(gl_FragCoord.xy), 0).r;
  if (d >= 1.0) return 1e9;
  float z = d * 2.0 - 1.0;
  return 2.0 * dkLateNearFar.x * dkLateNearFar.y / ((dkLateNearFar.y + dkLateNearFar.x) - z * (dkLateNearFar.y - dkLateNearFar.x));
}
vec3 fxSceneColor(vec2 px) {
  if (dkLateOn < 0.5) return vec3(0.0);
  return texture(dkSceneColor, clamp(px, vec2(0.5), dkLateSize - 0.5) / dkLateSize).rgb;
}
`;
