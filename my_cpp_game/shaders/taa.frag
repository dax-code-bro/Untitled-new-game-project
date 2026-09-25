// NATIVE: temporal anti-aliasing -- the pass the web engine designed for
// (quality.taa, the uSsrJitter/uVolJitter hooks) and lost to a session
// limit before it was written.
//
// Each frame the projection is offset by a sub-pixel Halton jitter, so a
// still camera samples every pixel at a different sub-pixel position each
// frame; accumulating those is supersampling spread over time. A moving
// camera reprojects the history through the depth buffer (the world is
// static; grass sway is small enough for the clamp below to hold), and the
// history is clipped to the variance of the current 3x3 neighbourhood in
// YCoCg, which is what stops a disoccluded pixel dragging a ghost of what
// used to be in front of it.
#include "lib/common.glsl"
in vec2 vUv;

uniform sampler2D uCurrent;     // this frame's resolved HDR scene
uniform sampler2D uHistory;     // last frame's TAA output
uniform sampler2D uDepth;       // this frame's depth (jittered projection)
uniform mat4  uInvViewProj;     // this frame, jittered -- matches uDepth
uniform mat4  uPrevViewProj;    // last frame, UNjittered
uniform vec2  uTexel;
uniform vec2  uJitterUv;        // this frame's jitter, in UV
uniform float uBlend;           // weight of the CURRENT frame: 1 = no history
uniform float uHistoryValid;    // 0 on the first frame / after a resize

layout(location=0) out vec4 outColor;

vec3 toYCoCg(vec3 c){
  return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b,
              0.5 * c.r - 0.5 * c.b,
             -0.25 * c.r + 0.5 * c.g - 0.25 * c.b);
}
vec3 fromYCoCg(vec3 c){
  return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z);
}
// Tonemap-weighted accumulation: a firefly cannot dominate the average.
vec3 compress(vec3 c){ return c / (1.0 + max(c.r, max(c.g, c.b))); }
vec3 expand(vec3 c){ return c / max(1.0 - max(c.r, max(c.g, c.b)), 1e-4); }

void main(){
  // The current sample is used where it landed: it IS this frame's jittered
  // sample of the pixel, and averaging those over frames is the point.
  vec2 uv = vUv;
  vec3 cur = compress(max(texture(uCurrent, uv).rgb, vec3(0.0)));

  // Neighbourhood statistics for the clip.
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 s = toYCoCg(compress(max(texture(uCurrent, uv + vec2(x, y) * uTexel).rgb, vec3(0.0))));
    m1 += s; m2 += s * s;
  }
  m1 /= 9.0; m2 /= 9.0;
  vec3 sigma = sqrt(max(m2 - m1 * m1, vec3(0.0)));
  vec3 lo = m1 - 1.25 * sigma, hi = m1 + 1.25 * sigma;

  if (uHistoryValid < 0.5) { outColor = vec4(expand(cur), 1.0); return; }

  // Reproject through depth. The depth was rendered with the jittered
  // projection, so it is unprojected with the jittered inverse.
  float d = texture(uDepth, uv).r;
  vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 world = uInvViewProj * ndc;
  world /= world.w;
  vec4 prev = uPrevViewProj * world;
  // The history is an average of jittered frames, i.e. centred, while this
  // pixel's world point sits uJitterUv off-centre: adding it back makes a
  // still camera read the history at exactly its own pixel.
  vec2 puv = prev.xy / prev.w * 0.5 + 0.5 + uJitterUv;
  if (any(lessThan(puv, vec2(0.0))) || any(greaterThan(puv, vec2(1.0)))) {
    outColor = vec4(expand(cur), 1.0); return;
  }

  vec3 hist = toYCoCg(compress(max(texture(uHistory, puv).rgb, vec3(0.0))));
  // Clip toward the neighbourhood mean rather than clamping per channel:
  // a clamp shifts hue, a clip along the line to the mean does not.
  vec3 c = m1, e = 0.5 * (hi - lo) + 1e-5;
  vec3 v = hist - c;
  vec3 a = abs(v / e);
  float ma = max(a.x, max(a.y, a.z));
  if (ma > 1.0) hist = c + v / ma;

  // Motion lowers trust in the history: more than a pixel of travel and the
  // current frame takes over faster, so a turning camera stays sharp.
  float travel = length((puv - uv) / uTexel);
  float blend = mix(uBlend, 0.5, clamp(travel / 8.0, 0.0, 1.0));
  vec3 res = mix(fromYCoCg(hist), cur, blend);
  outColor = vec4(expand(res), 1.0);
}
