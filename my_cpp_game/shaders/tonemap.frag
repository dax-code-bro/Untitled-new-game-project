#include "lib/common.glsl"
in vec2 vUv;
uniform sampler2D uHdr;
uniform float uExposure;
layout(location = 0) out vec4 outColor;

// ACES filmic fit (Narkowicz), the curve the web build ships by default.
vec3 acesFilm(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return saturate3((x * (a * x + b)) / (x * (c * x + d) + e));
}

/* Interleaved gradient noise (Jimenez 2014): a per-pixel value in [0,1)
   with almost no low-frequency content, so it reads as fine grain rather
   than as a pattern. */
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
    vec3 hdr = texture(uHdr, vUv).rgb * uExposure;
    vec3 srgb = pow(acesFilm(hdr), vec3(1.0 / 2.2));
    /* DITHER BEFORE THE 8-BIT WRITE. A smooth sky gradient spans only a
       few dozen code values across the whole frame, so each step is a
       visible ring -- the first 4K capture of this renderer showed them
       plainly around the sun's halo. Half a code value of noise, added
       in the encoded domain where the quantiser acts, spreads each step
       edge into grain finer than the eye resolves. */
    srgb += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
    outColor = vec4(srgb, 1.0);
}
