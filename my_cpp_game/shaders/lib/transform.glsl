// Ported from engine/src/50-shaders.js GLSL.transform (GLSL ES 3.00 -> 4.50 core).
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
layout(location=3) in vec4 aTangent;
/* Per-vertex tint. A mesh that never sets one leaves this array disabled and
   picks up the generic attribute, which the renderer holds at white — so a
   plain model is unaffected, while one that wants a white shirt over blue
   jeans gets both out of a single mesh and a single draw. */
layout(location=4) in vec3 aColor;
#ifdef SKINNED
layout(location=5) in vec4 aJoints;
layout(location=6) in vec4 aWeights;
uniform sampler2D uBoneTex;
uniform float uBoneCount;

mat4 boneMatrix(float index){
  // 4 RGBA32F texels per bone = one mat4, fetched exactly.
  int i = int(index) * 4;
  return mat4(
    texelFetch(uBoneTex, ivec2(i,     0), 0),
    texelFetch(uBoneTex, ivec2(i + 1, 0), 0),
    texelFetch(uBoneTex, ivec2(i + 2, 0), 0),
    texelFetch(uBoneTex, ivec2(i + 3, 0), 0)
  );
}
#endif
#ifdef INSTANCED
layout(location=8) in mat4 aModel;
layout(location=12) in vec4 aParams;
#else
uniform mat4 uModel;
uniform vec4 uParams;
#endif

uniform mat4 uViewProj;
uniform vec3 uCameraPos;
uniform float uTime;

#ifdef GRASS
uniform vec3 uWindDir;
uniform float uWindStrength;
#endif
#ifdef GRASS_FIELD
/* NATIVE: the lawn around the camera. The instances are a fixed disc of
   grid offsets; each frame they are re-centred on the camera, snapped to the
   grid so a tuft stays put while the camera moves, and every tuft's jitter,
   turn, size and tint are hashed from its WORLD cell, never its instance
   index. Density and ground height come from a field baked from the map's
   own lawns (Scatter.cpp); where the field is 0 the tuft collapses. */
uniform sampler2D uLawnField;   // r = density 0..1, g = ground height
uniform vec4  uLawnRect;        // field origin x, z; size x, z (metres)
uniform vec3  uFieldCentre;     // the camera
uniform float uFieldSpacing;
uniform float uFieldRadius;
#endif

struct Surface {
  vec3 worldPos;
  vec3 normal;
  vec4 tangent;
  vec2 uv;
  vec4 params;
  // NATIVE: object space, in metres, for the edge bevel (pbr.frag).
  vec3 objPos;     // local position times the model scale
  vec3 objScale;   // the model's per-axis scale
  mat3 objRot;     // the model's rotation, scale removed
};

Surface computeSurface(){
  Surface s;
#ifdef INSTANCED
  mat4 model = aModel;
  s.params = aParams;
#ifdef GRASS_FIELD
  {
    vec2 base = floor(uFieldCentre.xz / uFieldSpacing) * uFieldSpacing;
    vec2 cellW = base + aModel[3].xz;
    vec2 cid = floor(cellW / uFieldSpacing + 0.5);
    float h1 = hash12(cid), h2 = hash12(cid + 17.3), h3 = hash12(cid - 41.7), h4 = hash12(cid * 1.7 + 3.1);
    vec2 root = cellW + (vec2(h1, h2) - 0.5) * uFieldSpacing;
    vec2 fuv = (root - uLawnRect.xy) / uLawnRect.zw;
    vec2 fld = (all(greaterThanEqual(fuv, vec2(0.0))) && all(lessThanEqual(fuv, vec2(1.0))))
             ? textureLod(uLawnField, fuv, 0.0).rg : vec2(0.0);
    float fade = 1.0 - smoothstep(uFieldRadius * 0.6, uFieldRadius, length(root - uFieldCentre.xz));
    float sc = step(h3, fld.r) * fade * mix(0.7, 1.0, fld.r);
    float a = h4 * 6.2831853;
    float w = mix(0.28, 0.42, h1) * sc;
    float ht = mix(0.14, 0.30, h2) * sc * (0.8 + 0.4 * valueNoise(vec3(root * 0.15, 2.0)));
    model = mat4(vec4(cos(a) * w, 0.0, -sin(a) * w, 0.0), vec4(0.0, ht, 0.0, 0.0),
                 vec4(sin(a) * w, 0.0, cos(a) * w, 0.0), vec4(root.x, fld.g - 0.01, root.y, 1.0));
    float lush = valueNoise(vec3(root * 0.06, 0.0));
    s.params = vec4(mix(vec3(1.18, 1.08, 0.72), vec3(0.86, 1.02, 0.92), lush) * (0.9 + 0.2 * h3), h4);
  }
#endif
#else
  mat4 model = uModel;
  s.params = uParams;
#endif

  vec3 localPos = aPosition;
  vec3 localNrm = aNormal;
  vec3 localTan = aTangent.xyz;

#ifdef SKINNED
  mat4 skin =
      boneMatrix(aJoints.x) * aWeights.x
    + boneMatrix(aJoints.y) * aWeights.y
    + boneMatrix(aJoints.z) * aWeights.z
    + boneMatrix(aJoints.w) * aWeights.w;
  // A zero-weight vertex would collapse to the origin; fall back to identity.
  float wsum = aWeights.x + aWeights.y + aWeights.z + aWeights.w;
  if (wsum < 0.001) skin = mat4(1.0);
  localPos = (skin * vec4(localPos, 1.0)).xyz;
  localNrm = mat3(skin) * localNrm;
  localTan = mat3(skin) * localTan;
#endif

#ifdef GRASS
  // aParams.w carries a per-blade random seed; .xyz is the tint.
  float seed = s.params.w;
  float h = aUv.y;
  // Bend increases with the square of height: stiff at the root, loose at
  // the tip, which is how a real blade behaves.
  float stiffness = h * h;
  vec3 worldRoot = (model * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  // Two travelling waves at different scales read as gusts over a field.
  float phase = uTime * 1.6 + worldRoot.x * 0.22 + worldRoot.z * 0.19 + seed * 6.28;
  float gust = fbm3(vec3(worldRoot.xz * 0.06 + uTime * 0.09, 0.0)) * 1.4;
  float sway = (sin(phase) * 0.5 + sin(phase * 2.37 + 1.3) * 0.28) * (0.35 + gust);
  vec3 bend = uWindDir * sway * uWindStrength * stiffness;
  // Bending should not stretch the blade, so pull the tip down as it leans.
  localPos += bend;
  localPos.y -= dot(bend, bend) * 0.35;
  localNrm = normalize(localNrm - uWindDir * sway * uWindStrength * 0.5);
#endif

  vec4 wp = model * vec4(localPos, 1.0);
  s.worldPos = wp.xyz;

  // Normal matrix. For a rotation-times-scale transform (no shear, which the
  // engine never produces) the inverse-transpose is just each column divided
  // by its squared length — so non-uniform scale lights correctly without
  // shipping a second matrix per instance.
  vec3 c0 = model[0].xyz, c1 = model[1].xyz, c2 = model[2].xyz;
  vec3 invSq = 1.0 / max(vec3(dot(c0, c0), dot(c1, c1), dot(c2, c2)), vec3(1e-8));
  mat3 nm = mat3(c0 * invSq.x, c1 * invSq.y, c2 * invSq.z);

  s.objScale = sqrt(max(vec3(dot(c0, c0), dot(c1, c1), dot(c2, c2)), vec3(1e-12)));
  s.objPos = localPos * s.objScale;
  s.objRot = mat3(c0 / s.objScale.x, c1 / s.objScale.y, c2 / s.objScale.z);

  s.normal = normalize(nm * localNrm);
  s.tangent = vec4(normalize(nm * localTan), aTangent.w);
  s.uv = aUv;
  return s;
}
