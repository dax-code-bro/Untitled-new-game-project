// Height fog with sun in-scattering, installed into Three.js' fog shader
// chunks so every lit material gets it. Fog is thick in valleys, thin on
// hilltops, and glows warm when you look toward the sun.
import * as THREE from 'three';

// Plain objects (not Vector4) so every material shares the same reference
// and one update per frame reaches all of them.
export const fogParams = {
  a: { x: 0, y: 1, z: 0, w: 0.0055 }, // sun direction, height falloff
  b: { x: 1, y: 0.85, z: 0.6, w: 0.7 }, // sun glow colour, in-scattering strength
  // ground mist (G12): a second, shallow layer that lies in the low places (the coast, the bayou,
  // the river and the lake) at dawn, dusk and night: x = density at sea level, y = 1/scale height
  c: { x: 0, y: 0.11, z: 0, w: 0 },
};

export const FOG_GLSL = /* glsl */`
vec3 sbApplyFog(vec3 col, vec3 worldPos, vec3 camPos, vec3 fogCol, float density, vec4 A, vec4 B, vec4 C) {
  vec3 d = worldPos - camPos;
  float dist = length(d);
  vec3 dir = d / max(dist, 1e-3);
  float k = A.w;
  float h0 = camPos.y, h1 = worldPos.y;
  // average of density(y) = exp(-k y) between the two heights
  float dh = h1 - h0;
  float avg = abs(dh) > 0.5 ? (exp(-k * h0) - exp(-k * h1)) / (k * dh) : exp(-k * h0);
  // the mist layer: the same integral with a much shorter scale height
  float k2 = C.y, mist = 0.0;
  if (C.x > 0.0) mist = C.x * (abs(dh) > 0.3 ? (exp(-k2 * max(h0, 0.0)) - exp(-k2 * max(h1, 0.0))) / (k2 * dh) : exp(-k2 * max(h0, 0.0)));
  float amt = 1.0 - exp(-(density * avg + max(mist, 0.0)) * dist);
  float sun = pow(max(dot(dir, A.xyz), 0.0), 7.0);
  vec3 fc = mix(fogCol, B.rgb, sun * B.w);
  return mix(col, fc, clamp(amt, 0.0, 1.0));
}
`;

export function installAtmosphere() {
  for (const k of Object.keys(THREE.ShaderLib)) {
    const u = THREE.ShaderLib[k].uniforms;
    if (u && u.fogColor) { u.sbFogA = { value: fogParams.a }; u.sbFogB = { value: fogParams.b }; u.sbFogC = { value: fogParams.c }; }
  }
  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
  // the world position from the view-space one (every shader has mvPosition; sprites have no
  // 'transformed', and the old version failed to compile for every sprite: gun smoke, muzzle flashes)
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  uniform vec4 sbFogA;
  uniform vec4 sbFogB;
  uniform vec4 sbFogC;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${FOG_GLSL}
#endif`;
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    gl_FragColor.rgb = sbApplyFog(gl_FragColor.rgb, vFogWorld, cameraPosition, fogColor, fogDensity, sbFogA, sbFogB, sbFogC);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif
#endif`;
}
