// Cloud shadows: the shadows of the clouds you see overhead, sliding over hills, streets, roofs,
// trees, cars and people as the wind carries them.
//
// The sky's clouds are ray-marched from a 3D noise field (world/clouds.js), anchored to the world
// and drifting with the wind. Here every lit surface follows the ray towards the sun up through
// the cloud layer (1.9 and 2.7 km), reads the same field there, and dims the sunlight it gets by
// how much cloud is in the way; the sky light stays, so a cloud's shadow is soft and blue-grey,
// as it is outdoors. It's added to three's shared lighting code, so every built-in lit material
// gets it; the custom ones (grass cards, far tree impostors) include CLOUD_SHADOW_GLSL themselves.
import * as THREE from 'three';
import { cloudNoise } from '../world/clouds.js';

// shared by reference with every material: plain {x,y,z,w} objects aren't copied when three
// clones a material's uniforms, so updating them here updates every shader
const CS0 = { x: 0, y: 0, z: 0.5, w: 0 }; // wind offset x, z; cloud cover; strength (0 = off)
const CS1 = { x: 0, y: 1, z: 0, w: 0 }; // direction to the sun
export const cloudShadowUniforms = { sbCloudTex: { value: null }, sbCS0: { value: CS0 }, sbCS1: { value: CS1 } };

export const CLOUD_SHADOW_GLSL = /* glsl */ `
uniform highp sampler3D sbCloudTex; uniform vec4 sbCS0; uniform vec4 sbCS1;
float sbCloudShade(vec3 wp) {
  if (sbCS0.w <= 0.0 || sbCS1.y < 0.06) return 1.0;
  vec3 sd = sbCS1.xyz;
  // where the clouds can form at all, read once at the middle of the layer
  vec2 xm = wp.xz + sd.xz / sd.y * (2300.0 - wp.y) + sbCS0.xy;
  float W = texture(sbCloudTex, vec3(xm.x * 0.000012, 0.31, xm.y * 0.000012)).r * 0.65
          + texture(sbCloudTex, vec3(xm.x * 0.00004, 0.67, xm.y * 0.00004)).g * 0.35;
  float cov = smoothstep(1.0 - sbCS0.z - 0.1, 1.0 - sbCS0.z + 0.12, W);
  if (cov <= 0.0) return 1.0;
  float sh = 0.0;
  for (int i = 0; i < 2; i++) {
    float h = i == 0 ? 1900.0 : 2700.0;
    vec2 xz = wp.xz + sd.xz / sd.y * (h - wp.y) + sbCS0.xy;
    float hF = (h - 1400.0) / 2400.0;
    float prof = smoothstep(0.0, 0.06, hF) * (1.0 - smoothstep(0.25 + 0.6 * cov, 0.35 + 0.65 * cov, hF));
    vec4 nz = texture(sbCloudTex, vec3(xz.x, 6360000.0 + h, xz.y) * 0.00013);
    float th = 1.0 - cov * prof * 0.95;
    sh += smoothstep(th - 0.1, th + 0.24, nz.r * 0.6 + nz.g * 0.4); // a little softer than the cloud's own edge
  }
  return 1.0 - sbCS0.w * clamp(sh * 0.7, 0.0, 1.0);
}
`;

let installed = false, enabled = false;
export function installCloudShadows(quality) {
  if (installed) return false;
  installed = true;
  // the shader code goes in everywhere (custom shaders call it); on phones it stays switched off
  enabled = quality.label !== 'Phone';
  if (enabled) cloudShadowUniforms.sbCloudTex.value = cloudNoise(quality);
  for (const k of ['standard', 'physical', 'lambert', 'phong']) Object.assign(THREE.ShaderLib[k].uniforms, cloudShadowUniforms);
  const C = THREE.ShaderChunk;
  C.lights_pars_begin += '\n' + CLOUD_SHADOW_GLSL;
  const hook = 'getDirectionalLightInfo( directionalLight, directLight );';
  if (!C.lights_fragment_begin.includes(hook)) return false;
  C.lights_fragment_begin = C.lights_fragment_begin
    .replace('IncidentLight directLight;', 'IncidentLight directLight;\nfloat sbCloudShadeV = sbCloudShade(cameraPosition + (vec4(geometryPosition, 0.0) * viewMatrix).xyz);')
    .replace(hook, hook + '\n\t\tdirectLight.color *= sbCloudShadeV;');
  return enabled;
}

// every frame: the wind's drift, the cover, the sun (sky.js calls this)
let boost = 1;
export const setCloudShadowBoost = (k) => { boost = k; }; // tests: 0 turns them off for a side-by-side
export function updateCloudShadows(windOffX, windOffZ, cover, sunDir, strength = 0.8) {
  CS0.x = windOffX; CS0.y = windOffZ; CS0.z = cover;
  CS0.w = enabled ? Math.min(1, strength * boost) : 0;
  CS1.x = sunDir.x; CS1.y = sunDir.y; CS1.z = sunDir.z;
}
