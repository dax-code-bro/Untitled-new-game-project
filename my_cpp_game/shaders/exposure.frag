// NATIVE: AUTO EXPOSURE -- the camera's meter, which the web engine never had
// (every map carried one hand-set exposure, tuned under one sky).
//
// One fragment, into a 1x1 R32F target: the log-average luminance of the
// resolved HDR frame over a 48x27 grid, centre-weighted the way a camera's
// matrix meter is, then eased toward from last frame's value so a turn from
// shade into sun adapts over about a second instead of popping. The
// composite divides a key by it.
#include "lib/common.glsl"
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uPrev;      // last frame's adapted log-luminance (1x1)
uniform float uAdapt;         // 0..1: how far to move toward this frame; 1 = snap
layout(location=0) out vec4 outColor;

void main(){
  float acc = 0.0, wsum = 0.0;
  for (int y = 0; y < 27; y++)
  for (int x = 0; x < 48; x++) {
    vec2 uv = (vec2(x, y) + 0.5) / vec2(48.0, 27.0);
    vec3 c = textureLod(uScene, uv, 0.0).rgb;
    float l = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4, 1e4);
    vec2 d = (uv - 0.5) * vec2(1.6, 1.0);
    float w = exp(-dot(d, d) * 3.0) + 0.25;
    acc += log(l) * w;
    wsum += w;
  }
  float cur = acc / wsum;
  float prev = texelFetch(uPrev, ivec2(0), 0).r;
  outColor = vec4(mix(prev, cur, uAdapt), 0.0, 0.0, 1.0);
}
