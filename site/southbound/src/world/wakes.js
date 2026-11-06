// Disturbances on the water: boat wakes, splashes, wading rings, rising fish.
// A small ring buffer of (x, z, birth time, speed|amp) that the water shader turns into
// expanding rings and churned foam. A boat drops a point every ~0.1 s; the overlapping rings
// draw the V of a real wake, the young ones churn the white trail behind the stern.
import * as THREE from 'three';
import { worldUniforms } from './terrain.js';

export const WAKE_N = 64;
const LIFE = 6.5;
export const wakeUniforms = {
  uWake: { value: Array.from({ length: WAKE_N }, () => new THREE.Vector4(0, 0, -1000, 0)) },
  uWakeBox: { value: new THREE.Vector4(1e9, 1e9, -1e9, -1e9) }, // live points' extent (+ their rings)
};
let head = 0;

// amp 0..1 (how big), speed: how fast its ring spreads (m/s)
export function disturb(x, z, amp = 0.5, speed = 1.5) {
  const w = wakeUniforms.uWake.value[head];
  head = (head + 1) % WAKE_N;
  // speed and amplitude share a float: whole tenths of m/s + the amplitude as the fraction
  w.set(x, z, worldUniforms.uTime.value, Math.round(Math.min(speed, 12) * 10) + Math.min(Math.max(amp, 0), 1) * 0.98);
}

export function liveWakes() {
  const now = worldUniforms.uTime.value;
  return wakeUniforms.uWake.value.filter((w) => now - w.z >= 0 && now - w.z < LIFE).length;
}

export function updateWakes() {
  const now = worldUniforms.uTime.value, b = wakeUniforms.uWakeBox.value;
  b.set(1e9, 1e9, -1e9, -1e9);
  for (const w of wakeUniforms.uWake.value) {
    const age = now - w.z;
    if (age < 0 || age > LIFE) continue;
    const r = Math.floor(w.w) * 0.1 * age + 4;
    b.x = Math.min(b.x, w.x - r); b.y = Math.min(b.y, w.y - r); b.z = Math.max(b.z, w.x + r); b.w = Math.max(b.w, w.y + r);
  }
}

// GLSL: sums every live point's ring at p into a surface gradient (g) and foam (f).
export const WAKE_GLSL = /* glsl */ `
uniform vec4 uWake[${WAKE_N}]; uniform vec4 uWakeBox;
vec3 sbWakes(vec2 p) {
  vec3 o = vec3(0.0);
  if (p.x < uWakeBox.x || p.y < uWakeBox.y || p.x > uWakeBox.z || p.y > uWakeBox.w) return o;
  for (int i = 0; i < ${WAKE_N}; i++) {
    vec4 W = uWake[i];
    float age = uTime - W.z;
    if (age < 0.0 || age > ${LIFE.toFixed(1)}) continue;
    float sp = floor(W.w) * 0.1, amp = fract(W.w);
    vec2 d = p - W.xy; float L = length(d);
    float r = 0.25 + sp * age, wdt = 0.45 + age * 0.3;
    float x = (L - r) / wdt;
    float env = exp(-x * x) * amp * exp(-age * 0.7);
    // a couple of crests per ring: sin under a gaussian envelope (it bends the surface; on its own
    // a ring is never white)
    o.xy += d / max(L, 1e-3) * cos(x * 3.0) * env * 0.55;
    // churned water at the point itself: white, breaking up and spreading as it ages
    float core = (1.0 - smoothstep(0.0, 0.9 + age * 1.1, L)) * exp(-age * 0.9) * amp;
    o.z += core * smoothstep(0.25, 0.75, sbNoise(p * 1.3 + W.z * 3.0) * 0.6 + sbNoise(p * 4.1 - W.z) * 0.4 + core * 0.4);
  }
  // white where many rings pile up: the two arms of the V and the crest just off the hull
  o.z += smoothstep(0.45, 1.2, length(o.xy)) * 0.55;
  return o;
}
`;
