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

const FPS_SET = [1, 2, 12, 24, 25, 30, 48, 50, 60];
/**
 * Shot timing for the review scenes (one shot per second), rendered either as stills at the
 * shot's middle (--still --time k.5, 24 fps) or as a 1-fps sequence (--fps 1: frame k at t = k).
 * The film finish renders sub-frames across the shutter (t +- T/2: +-0.25 s at 1 fps), so the
 * shot must come from the FRAME time, never from the sub-frame time (a cut inside the shutter
 * is a double exposure). Returns { k: shot index, lt: time to pose at, frac: frame time - k }.
 * At 1-2 fps the pose is the shot's middle (k + 0.5) and the sub-frame offset is mapped to a
 * 24-fps shutter (half a second of idle sway would smear the faces).
 */
export function reviewTime(t, ctx) {
  const f = ctx && Number.isFinite(ctx.frame) ? ctx.frame : null;
  if (f === null) return { k: Math.floor(t), lt: t, frac: t - Math.floor(t) };
  let fps = 24;
  if (f > 0 && t > 0.2) {
    const est = f / t;
    fps = FPS_SET.reduce((a, b) => (Math.abs(Math.log(b / est)) < Math.abs(Math.log(a / est)) ? b : a));
  }
  const tf = f / fps;
  if (fps <= 2) {
    const k = Math.round(tf);
    return { k, lt: k + 0.5 + (t - tf) / 24, frac: 0 };
  }
  const k = Math.floor(tf + 1e-6);
  return { k, lt: t, frac: tf - k };
}
