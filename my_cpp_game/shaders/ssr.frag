// Ported from engine/src/50-shaders.js GLSL.ssrFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
#include "lib/pbr.glsl"
in vec2 vUv;

/* Shared frame data — bound by Renderer._bindFrame, never by this feature.
   uGBufferTex: .rg = octEncode(view normal), .b = rough, .a = metal. */
uniform sampler2D uGBufferTex;
uniform sampler2D uSceneDepth;

/* Existing renderer uniform names, reused verbatim (contract RULE 2). */
uniform mat4 uProj;
uniform mat4 uInvProj;

uniform sampler2D uSsrSceneTex;   // hdrA.color — the radiance being reflected
uniform vec2  uSsrTexel;          // 1 / half-res size
uniform vec2  uSsrZParams;        // (proj[10], proj[14]) — closed-form depth->viewZ
uniform int   uSsrSteps;
uniform float uSsrNear;
uniform float uSsrMaxDistance;
uniform float uSsrMaxTexels;
uniform float uSsrThickness;
uniform float uSsrEdgeFade;
uniform float uSsrRoughCut;
uniform float uSsrRoughMax;
uniform float uSsrJitter;

layout(location=0) out vec4 outColor;

/* depth -> view-space z, in one divide.
   Unprojecting with uInvProj costs a mat4 multiply, and this runs once
   per march step plus five more in the refinement. The projection is
   diagonal apart from these two entries, so the closed form is exact:
     ndc = (p10 * z + p14) / -z   =>   z = -p14 / (ndc + p10)
   Round-tripped against the real matrix at z = -1, -5, -20, -60 and
   -200 m: exact to five decimal places. */
float ssrViewZ(float depth){
  return -uSsrZParams.y / (depth * 2.0 - 1.0 + uSsrZParams.x);
}

/* Full view-space position, for the ray origin only -- once per pixel,
   so the mat4 is affordable here where it is not inside the march.
   Deliberately local and deliberately not the shared helper: an
   unprojection is a closed-form identity that cannot silently drift
   between consumers the way an encoding can, so it carries no
   dependency on a chunk that may or may not have landed. */
vec3 ssrViewPos(vec2 uv, float depth){
  vec4 c = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * c;
  return v.xyz / v.w;
}

/* Interleaved gradient noise -- the dither that decorrelates best under
   a box filter, which is exactly what the cone blur below is. */
float ssrIGN(vec2 p){
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main(){
  float d0 = texture(uSceneDepth, vUv).r;
  // Sky. Nothing reflects, and there is no surface to reflect from.
  if (d0 >= 0.99999) { outColor = vec4(0.0); return; }

  vec4 g = texture(uGBufferTex, vUv);
  float rough = clamp(g.b, 0.0, 1.0);

  /* ROUGHNESS GATE, and the honest reason for these two numbers.
     The cone blur below is thirteen taps at a stride the pass can
     actually afford. It covers a GGX cone of half-angle atan(rough^2)
     up to about rough 0.5 at ultra's half-resolution, and no further.
     Past that the screen-space data is both least valid (a rough lobe
     samples half the hemisphere, most of which is off screen) and
     least affordable, so it hands over entirely to the environment
     term the forward shader already applied. Below uSsrRoughCut the
     reflection is at full strength: glass, water, a puddle, tile and a
     blued receiver all live under 0.35. */
  float weight = 1.0 - smoothstep(uSsrRoughCut, uSsrRoughMax, rough);
  if (weight <= 0.001) { outColor = vec4(0.0); return; }

  vec3 P  = ssrViewPos(vUv, d0);
  vec3 N  = octDecode(g.rg);
  vec3 Vd = normalize(P);            // eye -> surface, view space (-Z forward)
  vec3 R  = reflect(Vd, N);

  /* A ray that heads back toward the camera is reflecting something
     BETWEEN the eye and the surface, which is either off screen or the
     camera itself. Fading it is what stops a wall facing the player
     from smearing the player's own viewmodel across it. */
  weight *= 1.0 - smoothstep(0.25, 0.75, saturate1(dot(R, -Vd)));
  if (weight <= 0.001) { outColor = vec4(0.0); return; }

  /* Clip to the near plane before projecting. Past it w changes sign
     and the whole screen-space interpolation inverts. */
  float maxT = uSsrMaxDistance;
  if (R.z > 1e-4) {
    float tNear = (-uSsrNear - P.z) / R.z;
    maxT = min(maxT, max(tNear - 0.01, 0.0));
  }
  if (maxT <= 0.02) { outColor = vec4(0.0); return; }

  vec3 Q  = P + R * maxT;
  vec4 c0 = uProj * vec4(P, 1.0);
  vec4 c1 = uProj * vec4(Q, 1.0);
  float w0 = max(c0.w, 1e-5), w1 = max(c1.w, 1e-5);
  vec2 uv0 = (c0.xy / w0) * 0.5 + 0.5;
  vec2 uv1 = (c1.xy / w1) * 0.5 + 0.5;
  vec2 dUv = uv1 - uv0;

  /* Cap the SCREEN travel as well as the world distance. Without this
     a grazing ray along a floor spends the entire step budget crossing
     the frame and the stride is tens of pixels, which misses every
     object thinner than a car. */
  vec2  res    = 1.0 / uSsrTexel;
  float travel = length(dUv * res);
  float tEnd   = travel > uSsrMaxTexels ? uSsrMaxTexels / max(travel, 1e-5) : 1.0;

  float iw0 = 1.0 / w0, iw1 = 1.0 / w1;
  float zw0 = P.z * iw0, zw1 = Q.z * iw1;

  int steps = uSsrSteps;
  float dt  = tEnd / float(max(steps, 1));

  /* Interleaved gradient noise, not a hash: it is the pattern that
     dithers best under a box filter, and the blur below is exactly
     that. uSsrJitter is zero unless TAA is on, because animating the
     offset without a temporal filter trades a static stair-step for a
     crawling one, which is worse. */
  float jit = ssrIGN(gl_FragCoord.xy + uSsrJitter) - 0.5;

  float tPrev = 0.0;
  float zPrev = P.z;
  float tHit  = -1.0;

  /* Hard cap of 64, the way the SSAO loop caps at 32: a constant bound
     with a break is the form ANGLE compiles without complaint. Raising
     uSsrSteps past 64 in the tier table silently does nothing. */
  for (int i = 1; i <= 64; i++) {
    if (i > steps) break;
    float t = dt * (float(i) - 0.5 + jit * 0.9);
    vec2  uv = uv0 + dUv * t;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;

    float iw = iw0 + (iw1 - iw0) * t;
    float zw = zw0 + (zw1 - zw0) * t;
    float zRay = zw / iw;

    float dS = texture(uSceneDepth, uv).r;
    if (dS >= 0.99999) { tPrev = t; zPrev = zRay; continue; }  // sky is not a hit

    float zScene = ssrViewZ(dS);
    float diff   = zScene - zRay;        // > 0 once the ray is behind the surface

    /* A depth-relative epsilon rather than a constant. The depth buffer
       quantises hardest far away, and a fixed 2 cm that is right at
       four metres is noise at sixty. */
    float minDiff = max(0.02, -zScene * 0.002);
    if (diff > minDiff) {
      /* THICKNESS. A depth buffer stores one surface, so the marcher has
         to guess how solid it is. The guess is a floor plus however far
         the ray itself moved in depth over the last step -- anything
         inside that is indistinguishable from a hit at this sampling
         rate -- bounded so a grazing ray cannot claim the whole room. */
      float thick = uSsrThickness + min(abs(zRay - zPrev), uSsrThickness * 6.0);
      if (diff < thick) { tHit = t; break; }
      /* Too far behind: the ray passed BEHIND a foreground object. Keep
         going; it may come out the far side and hit something real. */
    }
    tPrev = t;
    zPrev = zRay;
  }

  if (tHit < 0.0) { outColor = vec4(0.0); return; }

  /* Binary refinement. Five halvings take the ~27-texel stride at ultra
     down to under a texel, which is the point at which a further
     halving buys nothing a half-resolution buffer can express. They
     cost five taps and only on the pixels that actually hit. */
  float tA = tPrev, tB = tHit;
  for (int r = 0; r < 5; r++) {
    float tm = (tA + tB) * 0.5;
    float iwm = iw0 + (iw1 - iw0) * tm;
    float zwm = zw0 + (zw1 - zw0) * tm;
    float zRm = zwm / iwm;
    vec2  uvm = uv0 + dUv * tm;
    float dm  = texture(uSceneDepth, uvm).r;
    if (dm >= 0.99999) { tA = tm; continue; }
    if (ssrViewZ(dm) - zRm > 0.0) tB = tm; else tA = tm;
  }
  float tF  = tB;
  vec2  uvF = uv0 + dUv * tF;

  /* Screen-edge fade. Without it the reflection stops in a hard line
     wherever the ray leaves the frame, and that line moves with the
     camera, which reads as a tear rather than as a reflection. */
  vec2  e    = min(uvF, 1.0 - uvF);
  float edge = saturate1(min(e.x, e.y) / max(uSsrEdgeFade, 1e-4));
  weight *= edge * edge * (3.0 - 2.0 * edge);

  // The far end of the march is where the stride is coarsest and a hit
  // least trustworthy, so it fades out rather than ending.
  weight *= 1.0 - smoothstep(0.88 * tEnd, tEnd, tF);

  /* Backface rejection, using the hit pixel's own G-buffer normal. A
     hit on a surface facing the same way as the ray is the BACK of an
     object -- the ray went through it -- and its shaded colour has
     nothing to do with what a reflection would see. Faded rather than
     cut, so a legitimately grazing hit does not speckle. */
  vec4 gh = texture(uGBufferTex, uvF);
  weight *= 1.0 - smoothstep(-0.05, 0.28, dot(octDecode(gh.rg), R));
  if (weight <= 0.0005) { outColor = vec4(0.0); return; }

  vec3 hit = max(texture(uSsrSceneTex, uvF).rgb, vec3(0.0));

  /* PREMULTIPLIED. The blur below averages rgb and a with one kernel;
     premultiplied is the only encoding under which that average is the
     correct partial coverage, and it is what makes the fold exactly
     zero where nothing was hit. */
  outColor = vec4(hit * weight, weight);
}
