// Ported from engine/src/50-shaders.js GLSL.screenSpaceFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
#include "lib/sky.glsl"
#include "lib/pbr.glsl"
in vec2 vUv;

uniform sampler2D uGBufferTex;
uniform sampler2D uSceneDepth;

uniform mat4 uInvProj;
uniform mat4 uInvView;

uniform sampler2D uSsrSceneTex;   // hdrA.color
uniform sampler2D uSsrTex;        // the blurred reflection, half res
uniform vec2  uSsrTexel;          // 1 / half-res size
uniform vec2  uSsrZParams;
uniform float uSsrIntensity;
uniform float uSsrReplace;
uniform float uSsrEnvVis;
uniform float uSsrClamp;
uniform float uSsrMaxDarken;

/* ---- HOOKS: FEATURES 4 AND 9 FILL THESE IN ----
   They are declared here, at zero strength, because this pass is the
   one place the contract's pass order puts all three screen-space
   terms. Feature 4 binds volB to uVolTex and raises uVolStrength;
   feature 9 binds bentA to uGtaoBentTex and raises uGtaoSpecOcc.
   NEITHER MAY WRITE A SECOND _applyScreenSpace: a duplicate method in
   a JS class body silently keeps only the last one. */
uniform sampler2D uVolTex;
uniform float uVolStrength;
uniform sampler2D uGtaoBentTex;
uniform float uGtaoSpecOcc;
/* ---- END HOOKS ---- */

layout(location=0) out vec4 outColor;

const vec2 SSR_UP[4] = vec2[4](
  vec2(-0.5, -0.5), vec2(0.5, -0.5), vec2(-0.5, 0.5), vec2(0.5, 0.5));

vec3 ssrViewPos(vec2 uv, float depth){
  vec4 c = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * c;
  return v.xyz / v.w;
}

void main(){
  vec3  scene = texture(uSsrSceneTex, vUv).rgb;
  float d0    = texture(uSceneDepth, vUv).r;
  if (d0 >= 0.99999) {
    /* FEATURE 4 REACHES THE SKY, and nothing else here does. A shaft
       against a bright sky -- a doorway, a treeline, the crane lattice
       -- is the canonical god ray, and an early-out that skipped it
       would drop exactly the pixels the effect exists for. A reflection
       and a specular occlusion have nothing to say about a pixel with
       no surface in it, so those two stay skipped. uVolStrength is zero
       whenever the volumetric pass did not run, so this branch is
       bit-identical to the one it replaces on every tier that has the
       feature off. */
    if (uVolStrength > 0.0) {
      vec4 vsky = texture(uVolTex, vUv);
      scene = scene * mix(1.0, vsky.a, uVolStrength) + vsky.rgb * uVolStrength;
    }
    outColor = vec4(scene, 1.0);
    return;
  }

  float zc = -uSsrZParams.y / (d0 * 2.0 - 1.0 + uSsrZParams.x);

  /* uSsrIntensity is zero, and this whole half is skipped, whenever the
     trace did not run -- which is also when uSsrTex is bound to the
     fallback texture rather than to a reflection buffer. Without this
     gate the fallback's own alpha would be read as a confidence. The
     branch is uniform across the draw, so it costs nothing. */
  if (uSsrIntensity > 0.0) {
    /* DEPTH-AWARE UPSAMPLE. Four taps at the surrounding half-resolution
       texel centres, weighted by how close each one's depth is to this
       pixel's. A plain bilinear read drags the reflection one half-res
       texel past every silhouette, which on a railing or a gun barrel
       is a bright fringe on the wrong side of the edge. */
    vec4  acc  = vec4(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2  uv = vUv + SSR_UP[i] * uSsrTexel;
      float dn = texture(uSceneDepth, uv).r;
      float zn = -uSsrZParams.y / (dn * 2.0 - 1.0 + uSsrZParams.x);
      float w  = exp(-abs(zn - zc) / max(0.20, abs(zc) * 0.05));
      acc  += texture(uSsrTex, uv) * w;
      wsum += w;
    }
    vec4  ssr  = wsum > 1e-4 ? acc / wsum : texture(uSsrTex, vUv);
    float conf = clamp(ssr.a, 0.0, 1.0);

    if (conf > 0.0005) {
    vec4  g     = texture(uGBufferTex, vUv);
    float rough = clamp(g.b, 0.035, 1.0);
    float metal = clamp(g.a, 0.0, 1.0);

    vec3 Pv = ssrViewPos(vUv, d0);
    vec3 Nv = octDecode(g.rg);
    vec3 Vd = normalize(Pv);
    vec3 Rv = reflect(Vd, Nv);
    float NoV = max(dot(Nv, -Vd), 1e-4);

    mat3 v2w = mat3(uInvView);
    vec3 Nw = normalize(v2w * Nv);
    vec3 Rw = normalize(v2w * Rv);

    /* F0 WITHOUT AN ALBEDO BUFFER. The G-buffer carries no base colour
       -- that was the deliberate trade for staying at three
       attachments. A dielectric does not need one: it is 0.04 flat.
       A metal borrows the hue of what has already been shaded at this
       very pixel, normalised so only its colour and not its brightness
       is taken, and pulled toward neutral where the pixel is too dark
       for its hue to mean anything. Documented approximation. */
    float mx   = max(max(scene.r, scene.g), scene.b);
    vec3  tint = mx > 1e-4 ? saturate3(scene / mx) : vec3(1.0);
    tint = mix(vec3(1.0), tint, saturate1(mx * 4.0));
    vec3  F0   = mix(vec3(0.04), tint, metal);

    /* Reconstruct the environment specular the FORWARD shader already
       added at this pixel, then pay back the difference. This is the
       whole reason the fold cannot double-count: it does not add a
       reflection, it REPLACES the sky the forward pass assumed, in
       proportion to how confident the trace is.

       uSsrEnvVis stands in for pbrFrag's mix(skyVis, 1.0, 0.25), which
       depends on the sun shadow term this pass cannot see. The
       renderer binds the midpoint of its range, so the estimate is
       within about a fifth either way, and uSsrReplace (0.90) leaves a
       deliberate sliver unsubtracted -- slightly too bright reads as a
       reflection, slightly too dark reads as a hole. */
    /* KEPT IN STEP WITH pbrFrag BY HAND, and it has to be. This pass
       does not add a reflection, it pays back the environment specular
       the forward shader already applied -- so the expression here must
       be the same one pbrFrag used, term for term. When the probe
       landed and pbrFrag moved from the analytic lerp of skyRadiance
       and skyIrradiance to envRadiance, this line had to move with it
       in the same commit; had it not, the fold would have subtracted a
       sky the forward pass no longer applies and every reflective
       surface in the game would have gone dark by the difference.

       envRadiance and envBRDF both live in GLSL.sky, which this shader
       already includes, and _bindEnv -- which _applyScreenSpace already
       calls -- binds the cube and its gate. So this is a substitution
       and nothing else. On a tier with no probe uEnvIntensity is 0 and
       envRadiance returns exactly the analytic lerp this line used to
       read, so the fold is unchanged there to the bit. */
    vec3 envIBL = envRadiance(Rw, Nw, rough) * uSsrEnvVis + uRoomAmbient;
    /* KEPT IN STEP WITH pbrFrag, PART TWO -- FEATURE 6.
       The forward pass multiplies its ambient specular by the
       multiple-scattering compensation. The sky this pass pays back
       therefore has that factor in it too, and without this line the
       fold would subtract an UNCOMPENSATED sky from a COMPENSATED
       pixel: every rough metal would keep a bright ghost of exactly
       the environment the reflection was meant to replace, and the
       brighter the metal the worse it would be. msFromEss
       lives in GLSL.pbr, which this program already includes, and
       uSpecEnergy is bound by _bindEnv, which _applyScreenSpace
       already calls -- so this is a substitution and nothing else. At
       uSpecEnergy 0 msFromEss returns exactly vec3(1.0) and this is
       the line it was, to the bit. The Ess handed in is A + B from the
       SAME envBRDF the lobe used, which is what pbrFrag does.

       KNOWN RESIDUAL, stated rather than hidden: the forward pass also
       multiplies by specularOcclusion x horizonOcclusion, and this
       pass cannot reproduce either -- specularOcclusion needs the ORM
       map's cavity term and horizonOcclusion needs the geometric
       normal, and the G-buffer carries neither. So in a crease the
       fold subtracts marginally more sky than the forward pass
       applied. It is bounded by the uSsrMaxDarken rail below, it only
       reaches the specular half of the ambient, and a crease is where
       SSR confidence is lowest anyway, which is the same multiplier. */
    vec3 brdf   = envBRDF(F0, rough, NoV)
      * msFromEss(F0, envBRDF(vec3(1.0), rough, NoV).r, uSpecEnergy);

    vec3 delta = (ssr.rgb - envIBL * conf * uSsrReplace) * brdf * uSsrIntensity;

    /* Two rails, because this pass runs at ultra where the brightest
       pixel assertions in the suite have the least room. A single
       blown texel in the reflection would otherwise go through bloom,
       and an over-subtracted sun reflection would otherwise punch a
       black hole. Neither rail is ever reached by a well-behaved
       frame; they exist so a badly-behaved one degrades. */
    delta = min(delta, vec3(uSsrClamp));
    delta = max(delta, -scene * uSsrMaxDarken);
    scene = max(scene + delta, vec3(0.0));
    }
  }

  /* ---- HOOKS: FEATURES 4 AND 9 ---- */
  if (uVolStrength > 0.0) {
    // Feature 4: rgb = in-scattered radiance, a = transmittance.
    vec4 vol = texture(uVolTex, vUv);
    scene = scene * mix(1.0, vol.a, uVolStrength) + vol.rgb * uVolStrength;
  }
  if (uGtaoSpecOcc > 0.0) {
    // Feature 9: .a = specular occlusion, half res, bilinear is enough.
    float so = clamp(texture(uGtaoBentTex, vUv).a, 0.0, 1.0);
    scene *= mix(1.0, so, uGtaoSpecOcc);
  }
  /* ---- END HOOKS ---- */

  outColor = vec4(scene, 1.0);
}
