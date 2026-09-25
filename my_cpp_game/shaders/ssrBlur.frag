// Ported from engine/src/50-shaders.js GLSL.ssrBlurFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
in vec2 vUv;

uniform sampler2D uGBufferTex;
uniform sampler2D uSceneDepth;

uniform sampler2D uSsrTex;
uniform vec2  uSsrTexel;
uniform vec2  uSsrDir;
uniform vec2  uSsrZParams;
uniform float uSsrConeScale;      // half-res pixels per radian of cone
uniform float uSsrConeMax;        // hard ceiling, half-res pixels
uniform float uSsrMaxStride;      // ceiling on the gap between taps

layout(location=0) out vec4 outColor;

void main(){
  float dc = texture(uSceneDepth, vUv).r;
  vec4  c  = texture(uSsrTex, vUv);
  if (dc >= 0.99999) { outColor = c; return; }

  /* THE CONE, AND WHY THE RADIUS DOES NOT DIVIDE BY DEPTH.
     A GGX lobe of roughness r has half-angle about atan(r*r). The
     footprint it covers at the hit is that angle times the hit
     distance, and the screen size of that footprint is the footprint
     divided by the hit distance -- so for a reflection of something at
     roughly the receiver's own depth the two cancel and the radius is
     purely ANGULAR. uSsrConeScale is therefore halfResHeight / fovY,
     i.e. pixels per radian, and the whole thing is correct under both
     a resolution change and a field-of-view change with no per-scene
     tuning. */
  float rough  = clamp(texture(uGBufferTex, vUv).b, 0.0, 1.0);
  float alpha  = rough * rough;
  float radius = min(alpha * uSsrConeScale, uSsrConeMax);

  /* NATIVE: AS MANY TAPS AS THE RADIUS NEEDS, NEVER A GAP.
     The web build spent a fixed thirteen taps across +-radius, so the
     stride grew with the cone -- to 17 half-res texels at 4K -- and a
     small bright source (a lamp reflected in rough copper) came out as
     a 13x13 grid of copies, because the two separable halves each copy
     it thirteen times. Here the stride is capped at uSsrMaxStride
     (1.5 texels; bilinear taps that close overlap) and the tap count
     grows instead, up to 64 each side. The kernel keeps the web
     Gaussian's shape exactly: exp(-3.96 t^2) over t in [-1, 1]. A
     mirror still has radius ~0 and is not touched at all. */
  if (radius < 0.75) { outColor = c; return; }
  int   n      = int(clamp(ceil(radius / uSsrMaxStride), 6.0, 64.0));
  float stride = radius / float(n);

  float zc = -uSsrZParams.y / (dc * 2.0 - 1.0 + uSsrZParams.x);
  vec2  stepUv = uSsrDir * uSsrTexel * stride;

  vec4  sum  = vec4(0.0);
  float wsum = 0.0;
  for (int i = -n; i <= n; i++) {
    vec2  uv = vUv + stepUv * float(i);
    float dn = texture(uSceneDepth, uv).r;
    float zn = -uSsrZParams.y / (dn * 2.0 - 1.0 + uSsrZParams.x);
    /* Do not blur across a silhouette: a reflection belongs to the
       surface it was traced from, and letting it leak past the edge is
       the halo every screen-space effect is accused of. The tolerance
       is relative to depth because a 30 cm gap is an edge at three
       metres and nothing at forty. */
    float wz = exp(-abs(zn - zc) / max(0.25, abs(zc) * 0.08));
    float t  = float(i) / float(n);
    float wg = exp(-t * t * 3.96);
    float w  = wz * wg;
    sum  += texture(uSsrTex, uv) * w;
    wsum += w;
  }
  outColor = wsum > 1e-5 ? sum / wsum : c;
}
