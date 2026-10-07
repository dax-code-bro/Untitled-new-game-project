// Look-dev stage helpers for the human scenes (scenes/lookdev/humans-*.js).
//
// groundMaterial(): a PBR ground scan at its real scale over a large plane WITHOUT the visible
// grid of repeats a single tiling scan shows toward the horizon: the albedo is sampled twice
// (the tile, and a rotated tile at 2.7x scale) and blended by a world-space noise at ~9 m, and a
// slow brightness / green-brown variation at ~25 m is laid over it (fields are never uniform).
import * as THREE from 'three';
import { loadPBR } from '../assets.js';

/**
 * loadPBR() + tiling break-up. size: [w, h] metres of the plane (UV 0..1 covers the plane).
 * opts: { tint: [r,g,b] multiplier, vary (0.25) }
 */
export async function groundMaterial(id, ctx, size, opts = {}) {
  const mat = await loadPBR(id, ctx, { worldSize: size });
  const U = { uVary: { value: opts.vary ?? 0.25 }, uTint: { value: new THREE.Vector3(...(opts.tint || [1, 1, 1])) } };
  mat.customProgramCacheKey = () => `dk-human-ground-${id}`;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGW; uniform float uVary; uniform vec3 uTint;
float gH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gH(i), gH(i + vec2(1, 0)), f.x), mix(gH(i + vec2(0, 1)), gH(i + vec2(1, 1)), f.x), f.y); }
float gF(vec2 p) { return gN(p) * 0.55 + gN(p * 2.03 + 7.1) * 0.3 + gN(p * 4.1 + 2.3) * 0.15; }`)
      .replace('#include <map_fragment>', `
#ifdef USE_MAP
{
  vec4 t1 = texture2D(map, vMapUv);
  // the same scan, rotated and 2.7x larger: where the noise picks it, the repeat grid breaks
  vec2 c = vec2(0.5);
  mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  vec4 t2 = texture2D(map, R * (vMapUv - c) / 2.7 + c + 0.31);
  float m = smoothstep(0.35, 0.65, gF(vGW.xz / 9.0));
  vec4 sd = mix(t1, t2, m);
  float big = gF(vGW.xz / 25.0 + 3.7);
  sd.rgb *= (1.0 - uVary * 0.5 + uVary * big) * mix(vec3(1.0), vec3(1.06, 0.98, 0.9), gF(vGW.xz / 17.0 + 9.0)) * uTint;
  diffuseColor *= sd;
}
#endif`);
  };
  mat.needsUpdate = true;
  return mat;
}
