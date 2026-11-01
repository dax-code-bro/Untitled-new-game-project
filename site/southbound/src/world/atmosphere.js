// Height fog with sun in-scattering, installed into Three.js' fog shader
// chunks so every lit material gets it. Fog is thick in valleys, thin on
// hilltops, and glows warm when you look toward the sun.
import * as THREE from 'three';

// Plain objects (not Vector4) so every material shares the same reference
// and one update per frame reaches all of them.
export const fogParams = {
  a: { x: 0, y: 1, z: 0, w: 0.0055 }, // sun direction, height falloff
  b: { x: 1, y: 0.85, z: 0.6, w: 0.7 }, // sun glow colour, in-scattering strength
};

export const FOG_GLSL = /* glsl */`
vec3 sbApplyFog(vec3 col, vec3 worldPos, vec3 camPos, vec3 fogCol, float density, vec4 A, vec4 B) {
  vec3 d = worldPos - camPos;
  float dist = length(d);
  vec3 dir = d / max(dist, 1e-3);
  float k = A.w;
  float h0 = camPos.y, h1 = worldPos.y;
  // average of density(y) = exp(-k y) between the two heights
  float dh = h1 - h0;
  float avg = abs(dh) > 0.5 ? (exp(-k * h0) - exp(-k * h1)) / (k * dh) : exp(-k * h0);
  float amt = 1.0 - exp(-density * dist * avg);
  float sun = pow(max(dot(dir, A.xyz), 0.0), 7.0);
  vec3 fc = mix(fogCol, B.rgb, sun * B.w);
  return mix(col, fc, clamp(amt, 0.0, 1.0));
}
`;

export function installAtmosphere() {
  for (const k of Object.keys(THREE.ShaderLib)) {
    const u = THREE.ShaderLib[k].uniforms;
    if (u && u.fogColor) { u.sbFogA = { value: fogParams.a }; u.sbFogB = { value: fogParams.b }; }
  }
  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  {
    vec4 fw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      fw = instanceMatrix * fw;
    #endif
    vFogWorld = (modelMatrix * fw).xyz;
  }
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  uniform vec4 sbFogA;
  uniform vec4 sbFogB;
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
    gl_FragColor.rgb = sbApplyFog(gl_FragColor.rgb, vFogWorld, cameraPosition, fogColor, fogDensity, sbFogA, sbFogB);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif
#endif`;
}
