// Ported from engine/src/50-shaders.js GLSL.contactFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
in vec2 vUv;
uniform sampler2D uContactDepth;    // hdrA.depthTexture, FULL resolution
uniform sampler2D uContactAo;       // the blurred AO this pass multiplies
uniform mat4 uContactInvProj;
uniform mat4 uContactProj;
uniform vec3 uContactLightView;     // unit, view space, pointing AT the sun
uniform vec2 uContactTexel;         // 1 / this pass's own (half) size
uniform float uContactLength;       // ray length, world metres
uniform float uContactMaxPixels;    // and its cap, in this pass's pixels
uniform float uContactThickness;    // an occluder thicker than this is scenery
uniform float uContactBias;         // floor under the measured slope bias
uniform float uContactStrength;
uniform float uContactFade;         // camera distance at which it is gone
uniform int uContactSteps;
layout(location=0) out vec4 outColor;

vec3 contactViewPos(vec2 uv, float d){
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uContactInvProj * c;
  return v.xyz / v.w;
}
/* View-space z alone, for the march. The sky is pushed to minus infinity
   rather than left at the far plane so a ray that runs off the geometry
   can never register a hit against it. */
float contactViewZ(vec2 uv){
  float d = texture(uContactDepth, uv).r;
  if (d >= 0.99999) return -1.0e9;
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uContactInvProj * c;
  return v.z / v.w;
}

void main(){
  float ao = texture(uContactAo, vUv).r;
  float d0 = texture(uContactDepth, vUv).r;
  if (uContactSteps <= 0 || uContactStrength <= 0.0 || d0 >= 0.99999) {
    outColor = vec4(ao);
    return;
  }

  vec3 P = contactViewPos(vUv, d0);
  float dist = -P.z;
  /* Contact shadows are a close-range effect by construction: past a
     dozen metres the gap they draw is thinner than a pixel and all the
     march can return is noise. Faded rather than cut, or the boundary is
     itself a visible ring across the frame. */
  float fade = 1.0 - saturate1((dist - uContactFade * 0.65) / max(uContactFade * 0.35, 1e-3));
  if (fade <= 0.0) { outColor = vec4(ao); return; }

  /* The geometric normal, reconstructed from the CLOSER neighbour on each
     axis so a silhouette does not tilt the plane across it -- the same
     reconstruction the ambient-occlusion pass uses, and for the same
     reason. This pass wants the geometric normal and not the shading one:
     it is asking whether the ray starts above the surface, which is a
     question about the depth buffer, not about the normal map. */
  vec2 e = uContactTexel;
  float dL = texture(uContactDepth, vUv - vec2(e.x, 0.0)).r;
  float dR = texture(uContactDepth, vUv + vec2(e.x, 0.0)).r;
  float dD = texture(uContactDepth, vUv - vec2(0.0, e.y)).r;
  float dU = texture(uContactDepth, vUv + vec2(0.0, e.y)).r;
  vec3 ddx = (abs(dR - d0) < abs(d0 - dL))
    ? contactViewPos(vUv + vec2(e.x, 0.0), dR) - P
    : P - contactViewPos(vUv - vec2(e.x, 0.0), dL);
  vec3 ddy = (abs(dU - d0) < abs(d0 - dD))
    ? contactViewPos(vUv + vec2(0.0, e.y), dU) - P
    : P - contactViewPos(vUv - vec2(0.0, e.y), dD);
  vec3 N = normalize(cross(ddx, ddy));
  if (dot(N, P) > 0.0) N = -N;      // a visible surface faces the camera

  /* THE BIAS, MEASURED RATHER THAN GUESSED. This is the number the
     effect lives or dies on, and a world-space constant cannot be it.
     The march compares the ray's view depth against the depth buffer at
     the pixel the ray lands in, and those are never the same point: the
     depth is point-sampled at a texel centre, so on a sloped surface the
     comparison is already out by up to one pixel of the surface's own
     depth slope before anything real has happened. A wall seen flat-on
     at arm's reach is out by a fraction of a millimetre; a floor seen at
     a grazing twenty degrees is out by centimetres. Set a constant for
     the wall and the floor acnes; set it for the floor and it swallows
     the 3 cm gap under a magazine -- which is the entire effect. That is
     not a hypothesis: with a flat 0.018 m this pass measured ZERO change
     in the AO buffer, and at 0.001 m it measured self-occlusion noise
     across the whole ground plane.
     ddx and ddy already hold the view-space step across one pixel, from
     the normal reconstruction above, so the slope is free.

     THE TWO USES OF IT ARE DIFFERENT SIZES, and collapsing them into one
     number is the bug this had first. The LIFT is how far the ray starts
     off the surface it is leaving, and it has to clear a whole pixel of
     that surface's slope or step zero registers the surface as its own
     occluder. The HIT THRESHOLD is how much nearer the depth buffer has
     to be before a sample counts, and it only has to clear the HALF
     TEXEL that quv is quantised by plus half of the ray's own depth
     change between samples. On a floor at a grazing twenty degrees the
     first is 2 cm and the second is 4 mm, and using the first for both
     rejects the 7 mm signal a magazine 3 cm up actually produces --
     measured, as zero change in the whole AO buffer. */
  float pixelZ = max(abs(ddx.z), abs(ddy.z));
  // Lift the ray clear of the surface it starts on.
  vec3 O = P + N * max(uContactBias, pixelZ * 2.0);

  vec3 L = uContactLightView;
  float NoL = dot(N, L);
  // Facing away from the sun there is nothing a sun-direction ray can
  // add: the surface is already unlit and the cascade already knows.
  if (NoL <= 0.02) { outColor = vec4(ao); return; }

  /* HOW LONG THE RAY IS.
     A fixed world length is three hundred pixels at arm's reach and a
     third of a pixel at forty metres, and eight steps marches neither
     usefully. So the world length is the intent and the pixel cap is the
     budget: project the far end, measure it, and shorten if it overruns.
     Under-length is rejected outright -- if the whole ray is shorter than
     one pixel there is nothing between the samples to find, and that
     doubles as the distance cull. */
  float rayLen = uContactLength;
  vec3 endV = O + L * rayLen;
  if (endV.z > -0.05) {
    // The ray would cross the camera plane; stop it just in front of it.
    float denom = endV.z - O.z;
    rayLen *= clamp((-0.05 - O.z) / (abs(denom) < 1e-4 ? 1e-4 : denom), 0.0, 1.0);
    endV = O + L * rayLen;
  }
  vec4 ec = uContactProj * vec4(endV, 1.0);
  if (ec.w <= 1e-4) { outColor = vec4(ao); return; }
  vec2 endUv = (ec.xy / ec.w) * 0.5 + 0.5;
  float px = length((endUv - vUv) / e);
  if (px < 1.0) { outColor = vec4(ao); return; }
  if (px > uContactMaxPixels) rayLen *= uContactMaxPixels / px;

  /* Interleaved gradient noise (Jimenez), and DELIBERATELY not animated.
     A temporal offset is the right answer when a temporal filter is going
     to average it away; this engine ships with no TAA, so animating the
     dither would be a shimmer running along every contact seam. Fixed per
     pixel it is a stable dither, and the half-resolution buffer's own
     upsample into the composite softens what is left. */
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));

  float invSteps = 1.0 / float(uContactSteps);
  /* Half of the depth the ray covers between two samples, plus a quarter
     of a pixel of the surface's slope for quv's quantisation. Both are
     what they are; uContactBias is the floor under the pair. */
  float hitBias = max(uContactBias, abs(L.z) * rayLen * invSteps * 0.5 + pixelZ * 0.25);
  float occ = 0.0;
  for (int i = 0; i < 32; i++) {
    if (i >= uContactSteps) break;
    float t = (float(i) + ign) * invSteps;
    vec3 Q = O + L * (rayLen * t);
    vec4 c = uContactProj * vec4(Q, 1.0);
    if (c.w <= 1e-4) break;
    vec2 quv = (c.xy / c.w) * 0.5 + 0.5;
    if (quv.x < 0.0 || quv.x > 1.0 || quv.y < 0.0 || quv.y > 1.0) break;
    // diff > 0 means the depth buffer's surface is NEARER the camera than
    // the ray sample, i.e. the ray has gone behind something.
    float diff = contactViewZ(quv) - Q.z;
    if (diff > hitBias && diff < uContactThickness) {
      /* The thickness test is what stops a wall in the foreground
         shadowing the floor behind it: a real contact occluder is thin in
         view depth, an unrelated object in front of the camera is not.
         An occluder met at the start of the ray is the hard contact; one
         met at the end is the soft outer edge of the same shadow, so the
         hit distance IS the falloff and there is no separate penumbra
         term to tune. */
      occ = 1.0 - t;
      break;
    }
  }

  // Ramped in over NoL so the facing cutoff above is never a hard line.
  float shadowed = occ * uContactStrength * fade * saturate1(NoL * 3.0);
  outColor = vec4(ao * (1.0 - shadowed));
}
