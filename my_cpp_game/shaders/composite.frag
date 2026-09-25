// Ported from engine/src/50-shaders.js GLSL.compositeFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom0;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform float uBloomStrength;
uniform float uExposure;
/* NATIVE: auto exposure (exposure.frag). uAutoKey is the luminance the
   meter centres the frame on; 0 turns it off and uExposure alone applies,
   as in the web engine. The correction is clamped, so a night map stays
   night and a white-out stays bright. */
uniform sampler2D uAutoExp;
uniform float uAutoKey;
uniform float uAutoMin;
uniform float uAutoMax;
uniform float uVignette;
uniform float uChromatic;
uniform float uSaturation;
uniform float uContrast;
uniform float uGrain;
/* A COLOUR CAST OVER THE WHOLE FRAME, which the grade could not do.
   exposure, saturation and contrast can wash a picture out or crush it,
   and none of them can make it GREEN -- so night vision and a thermal
   optic had no way to look like anything, which is part of why they were
   booleans nobody read. uTintMix of 0 is the old behaviour exactly. */
uniform vec3 uTint;
uniform float uTintMix;
uniform float uTime;
uniform float uSharpen;
uniform float uPosterize;
/* 0 = the Narkowicz ACES fit this shipped with, 1 = AgX. A switch and
   not a silent replacement, because the two put the same scene in
   visibly different places and every pixel-asserting test in the suite
   was baselined against the old one. */
uniform int uToneMap;
uniform float uAgxPunch;
uniform float uAgxSat;
uniform sampler2D uAo;
uniform float uAoStrength;
uniform vec2 uTexel;
layout(location=0) out vec4 outColor;

/* ACES filmic tonemap (Narkowicz fit). Without a real tonemapper, bright
   HDR values clip to flat white and the whole image looks amateur.

   KEPT, BUT NO LONGER THE DEFAULT. See agx() below for what replaced it
   and, more usefully, for the measurement that said it had to be. */
vec3 acesFilm(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return saturate3((x * (a * x + b)) / (x * (c * x + d) + e));
}

/* ================================================================
   AgX
   ================================================================
   WHY THE TONEMAPPER WAS THE FIRST THING TO CHANGE, measured before
   anything was touched. Four views, histogrammed straight off
   readPixels at quality high:

       view          mean   <64     >224   160-223
       town-street   177    1.3%    0.4%   75%
       town-inside    71   62.4%    0.0%    1%
       demo-crane    148    6.5%    2.7%   48%
       demo-rubble   130   22.7%    0.0%   50%

   A sunlit street with three quarters of the frame inside two adjacent
   brightness bands, no shade and no glare -- and the shadows were being
   drawn the whole time, two 4096 cascades of them. Nothing in the frame
   was allowed to get dark enough to see them. The SAME renderer indoors
   crushed sixty-two per cent of the frame below 64.

   Washed out in the open and crushed indoors, at once, is not a grade
   problem: whichever way a contrast slider is pushed one of those two
   views gets worse, and that was measured too -- contrast 1.35 took the
   street's mean from 177 to 195 and made it FLATTER.

   What both ends have in common is the curve. The Narkowicz ACES fit is
   a two-parameter rational that was designed to be cheap, and what it
   is cheap at is the middle: it has almost no toe and a shoulder that
   rolls off late, so dark input stays proportionally dark (crush) and
   bright input piles up under white without ever reaching it (wash).

   AgX is a display transform rather than a curve fit. It rotates into a
   wider working primary set (the inset matrix), does its shaping in log
   exposure across a fixed -12.47..+4.03 EV window, and rotates back.
   Two things follow that matter here:

     A REAL TOE AND A REAL SHOULDER. The sigmoid is fitted across the
     whole EV window, so the bottom two stops get compressed into
     usable shade instead of collapsing, and the top two roll into
     white smoothly instead of stacking under it.

     HUE HOLDS THROUGH THE HIGHLIGHTS. This is the one that matters for
     this game specifically. Under ACES a bright saturated colour skews
     toward yellow-white as it clips, because the channels saturate at
     different rates -- which is exactly what a muzzle flash, a tracer,
     the Blaze gun's fire and the sun were doing. AgX's inset keeps the
     channels from separating, so a red-hot thing stays red as it gets
     brighter.

   THE 2.2 AT THE END IS NOT A MISTAKE. agx() finishes by raising its
   result to 2.2 to put it back into LINEAR, because the composite does
   its own sRGB encode afterwards (see the long note at the encode about
   why the grade has to run after it). Without that power the picture
   would be encoded twice and come out milk. */
const mat3 AGX_IN = mat3(
  0.8424790622530940, 0.0423282422610123, 0.0423756549057051,
  0.0784335999999992, 0.8784686364697720, 0.0784336000000000,
  0.0792237451477643, 0.0791661274605434, 0.8791429737931040);
const mat3 AGX_OUT = mat3(
   1.1968790051201700, -0.0528968517574562, -0.0529716355144438,
  -0.0980208811401368,  1.1519031299041700, -0.0980434501171241,
  -0.0990297440797205, -0.0989611768448433,  1.1510736726411600);

/* Sixth-order fit of the AgX sigmoid. The real transform is a pair of
   fitted power functions meeting at the pivot; this polynomial is the
   standard approximation and is within a thousandth of it across the
   whole window, which is far below one code value at 8 bits. */
vec3 agxSigmoid(vec3 x){
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2
       - 40.14 * x4 * x
       + 31.96 * x4
       - 6.868 * x2 * x
       + 0.4298 * x2
       + 0.1191 * x
       - 0.00232;
}

/* The look. AgX proper is deliberately neutral -- it is a display
   transform, not a grade -- and neutral on its own reads as flat to
   anyone expecting a game. punch is a power on the already-shaped value
   (below 1 lifts the mids, above 1 deepens them) and sat rotates around
   luminance. Both default to doing nothing, so the transform can be
   measured on its own before a look is put on top of it. */
vec3 agxLook(vec3 c, float punch, float sat){
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 p = pow(max(c, vec3(0.0)), vec3(punch));
  return max(luma + sat * (p - luma), vec3(0.0));
}

vec3 agx(vec3 col, float punch, float sat){
  const float minEv = -12.47393;
  const float maxEv = 4.026069;
  col = AGX_IN * max(col, vec3(0.0));
  /* Guard the log. A zero pixel is not rare -- it is every pixel of an
     unlit interior -- and log2(0) is -inf, which propagates through the
     matrix on the way out and paints NaN. */
  col = log2(max(col, vec3(1e-10)));
  col = clamp((col - minEv) / (maxEv - minEv), 0.0, 1.0);
  col = agxSigmoid(col);
  col = agxLook(col, punch, sat);
  col = AGX_OUT * col;
  /* Back to linear for the encode the composite does itself. */
  return pow(max(col, vec3(0.0)), vec3(2.2));
}

void main(){
  vec2 uv = vUv;
  vec2 fromCenter = uv - 0.5;
  float r2 = dot(fromCenter, fromCenter);

  vec3 color;
  if (uChromatic > 0.0) {
    // Lateral chromatic aberration grows toward the frame edge.
    vec2 off = fromCenter * r2 * uChromatic;
    color.r = texture(uScene, uv + off).r;
    color.g = texture(uScene, uv).g;
    color.b = texture(uScene, uv - off).b;
  } else {
    color = texture(uScene, uv).rgb;
  }

  /* Contrast-adaptive sharpening.
   *
   * Supersampling at 1.75x and letting the browser scale the canvas down
   * gives a clean image with no stair-stepping, but downsampling always
   * costs a little acuity -- edges come back very slightly soft. A small
   * unsharp mask against the four neighbours puts the definition back
   * without the white haloes a naive sharpen leaves, because the amount
   * is scaled by how much local contrast there already is: flat walls are
   * left alone, edges get the lift. This is what "not blocky and not
   * smooth" actually means as an operation. */
  if (uSharpen > 0.0) {
    vec3 n1 = texture(uScene, uv + vec2( uTexel.x, 0.0)).rgb;
    vec3 n2 = texture(uScene, uv + vec2(-uTexel.x, 0.0)).rgb;
    vec3 n3 = texture(uScene, uv + vec2(0.0,  uTexel.y)).rgb;
    vec3 n4 = texture(uScene, uv + vec2(0.0, -uTexel.y)).rgb;
    vec3 blur = (n1 + n2 + n3 + n4) * 0.25;
    vec3 d = color - blur;
    // How much the neighbourhood already varies, so flat areas stay flat
    // and noise does not get amplified into sparkle.
    float local = length(max(max(abs(n1 - color), abs(n2 - color)),
                             max(abs(n3 - color), abs(n4 - color))));
    color += d * uSharpen * saturate1(local * 6.0);
  }

  /* Ambient occlusion, multiplied in before the light is tonemapped.
     Contact darkening where surfaces meet is most of what separates a
     rendered room from a lit box. */
  if (uAoStrength > 0.0) {
    float ao = texture(uAo, uv).r;
    color *= mix(1.0, ao, uAoStrength);
  }

  vec3 bloom = texture(uBloom0, uv).rgb * 0.5
             + texture(uBloom1, uv).rgb * 0.32
             + texture(uBloom2, uv).rgb * 0.18;
  color += bloom * uBloomStrength;

  float autoGain = 1.0;
  if (uAutoKey > 0.0)
    autoGain = clamp(uAutoKey / exp(texelFetch(uAutoExp, ivec2(0), 0).r), uAutoMin, uAutoMax);
  color *= uExposure * autoGain;
  color = uToneMap == 1 ? agx(color, uAgxPunch, uAgxSat) : acesFilm(color);

  /* TO DISPLAY SPACE FIRST, AND THEN GRADE.
   *
     The grade below pivots contrast around 0.5, which is mid-grey ONLY
     once the picture has been encoded. ACES hands back a linear value,
     where mid-grey is 0.18, and for a long time the encode was the last
     thing in the shader -- so a pivot meant for display space was being
     applied to linear light.

     That is not a subtle mis-shaping. Expand the line at the contrast
     the game actually ships: (x - 0.5) * 1.04 + 0.5 is 1.04x - 0.02, so
     it SUBTRACTS A FLAT TWO HUNDREDTHS from linear light, and anything
     dimmer than 0.0192 clamps to absolute zero. Linear 0.0192 encodes
     to sRGB 0.18, so that threw away every shadow below 45 out of 255 --
     the darkest fifth of the picture, gone, as one solid black with no
     detail anywhere in it.

     It is why the underside of dark materials stayed black however much
     bounce light was put into them: the light was arriving and the
     grade was subtracting it again. A brick sphere's underside measured
     6.7 out of 255 and did not move -- 6.7, then 6.8 -- as the ground
     bounce was swept from nothing to the whole of what a diffuse ground
     really sends back.

     So: encode, then grade, which is what the comment always said. */
  color = pow(saturate3(color), vec3(1.0 / 2.2));

  // Grade in display space: contrast around mid-grey, then saturation.
  color = saturate3((color - 0.5) * uContrast + 0.5);
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(lum), color, uSaturation);

  /* Tint on the LUMINANCE, not on the colour. Multiplying the picture by
     green leaves a red wall black, because a red wall has no green in it
     to keep -- an image tube does not work that way round. What comes out
     of one is brightness written in one colour, so that is what this
     does, and the mix fades between the graded picture and it. */
  if (uTintMix > 0.0) color = mix(color, uTint * (lum + 0.06), saturate1(uTintMix));

  color *= 1.0 - saturate1(r2 * uVignette);

  if (uGrain > 0.0) {
    float n = hash12(gl_FragCoord.xy + fract(uTime) * 173.0) - 0.5;
    color += n * uGrain;
  }
  color = saturate3(color);

  /* Retro: quantise to a small palette AFTER the grade, the way a machine
     with an eight-bit framebuffer would. Doing it in linear space instead
     bands the shadows and leaves the highlights smooth, which is the
     opposite of how those machines looked. */
  if (uPosterize > 0.0) {
    color = floor(color * uPosterize + 0.5) / uPosterize;
  }
  outColor = vec4(color, 1.0);
}
