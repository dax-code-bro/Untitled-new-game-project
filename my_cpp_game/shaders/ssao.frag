// Ported from engine/src/50-shaders.js GLSL.ssaoFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
in vec2 vUv;
uniform sampler2D uDepth;
uniform mat4 uInvProj;
uniform mat4 uProj;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uBias;
uniform float uIntensity;
uniform float uAoFloor;
uniform int uSamples;
uniform float uTime;
layout(location=0) out vec4 outColor;

vec3 viewPos(vec2 uv){
  float d = texture(uDepth, uv).r;
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * c;
  return v.xyz / v.w;
}

void main(){
  float d0 = texture(uDepth, vUv).r;
  // Nothing behind the sky.
  if (d0 >= 0.99999) { outColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);

  /* Reconstruct the normal from the closer neighbour on each axis, so an
     edge does not blend two surfaces into one bogus normal. */
  vec3 pxR = viewPos(vUv + vec2(uTexel.x, 0.0)) - P;
  vec3 pxL = P - viewPos(vUv - vec2(uTexel.x, 0.0));
  vec3 pyU = viewPos(vUv + vec2(0.0, uTexel.y)) - P;
  vec3 pyD = P - viewPos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(pxR.z) < abs(pxL.z) ? pxR : pxL;
  vec3 dy = abs(pyU.z) < abs(pyD.z) ? pyU : pyD;
  vec3 N = normalize(cross(dx, dy));
  if (N.z < 0.0) N = -N;

  // A per-pixel rotation, so the sample pattern does not print itself
  // onto the image as a repeating grid.
  float ang = hash12(gl_FragCoord.xy) * 6.2831853;
  float ca = cos(ang), sa = sin(ang);

  /* Occlusion measured against the SURFACE NORMAL, not against depth.
   *
   * The first version asked "is the scene in front of this sample point",
   * which on a large flat surface is true for half the samples simply
   * because they are coplanar with it -- the floor of the bunker came out
   * pure black. What actually occludes a point is a neighbour standing
   * ABOVE its plane, so the contribution is how far above that plane the
   * neighbour is: dot(normalize(Q - P), N). Coplanar neighbours give zero
   * and a flat floor is left alone, which is the whole difference between
   * ambient occlusion and a dark smear. */
  float occ = 0.0;
  int n = uSamples;
  for (int i = 0; i < 32; i++) {
    if (i >= n) break;
    float fi = float(i) + 0.5;
    // A spiral: golden angle around, square root out, so the samples are
    // spread evenly by area instead of clumping in the middle.
    float t = fi / float(n);
    float r = sqrt(t);
    float phi = fi * 2.3999632;
    vec2 disk = vec2(cos(phi), sin(phi)) * r;
    vec2 rot = vec2(disk.x * ca - disk.y * sa, disk.x * sa + disk.y * ca);
    vec3 dir = normalize(vec3(rot, 0.45 + 0.55 * t));
    if (dot(dir, N) < 0.0) dir = -dir;
    vec3 S = P + dir * uRadius * (0.30 + 0.70 * t);

    vec4 clip = uProj * vec4(S, 1.0);
    vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    vec3 Q = viewPos(suv);
    vec3 v = Q - P;
    float len = length(v);
    if (len < 0.0001) continue;
    // How far above P's own plane the neighbour sits. Zero when coplanar.
    float above = dot(v / len, N) - uBias;
    if (above <= 0.0) continue;
    // And a wall a long way behind must not darken what is in front of
    // it, which is the classic halo.
    float range = uRadius / (uRadius + max(0.0, len - uRadius));
    occ += above * range;
  }
  float ao = 1.0 - (occ / float(n)) * uIntensity;
  // Floored: see the note where uAoFloor is set. This term multiplies the
  // direct sun as well as the ambient, so it must not reach zero.
  outColor = vec4(clamp(ao, uAoFloor, 1.0), 0.0, 0.0, 1.0);
}
