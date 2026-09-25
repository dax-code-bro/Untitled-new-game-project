// Ported from engine/src/50-shaders.js GLSL.skyFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
#include "lib/sky.glsl"
uniform float uTime;
uniform float uCloudAmount;
in vec3 vDir;
layout(location=0) out vec4 outColor;

void main(){
  vec3 dir = normalize(vDir);
  vec3 col = skyRadiance(dir);

  if (uCloudAmount > 0.0 && dir.y > 0.005) {
    // Project onto a flat cloud plane; cheap, and correct enough that the
    // clouds compress toward the horizon the way real ones do.
    vec2 cp = dir.xz / dir.y * 0.35;
    vec3 q = vec3(cp + uTime * 0.012, uTime * 0.02);
    float d = fbm3(q * 1.4);
    d += fbm3(q * 3.7 + 4.0) * 0.35;
    float cover = smoothstep(0.52 - uCloudAmount * 0.28, 0.86, d);
    cover *= smoothstep(0.0, 0.16, dir.y);
    // Light the cloud from the sun side so it has a bright rim.
    float lit = saturate1(dot(dir, uSunDir) * 0.5 + 0.5);
    vec3 cloudCol = mix(vec3(0.55, 0.58, 0.66), uSunColor * 1.25, pow(lit, 2.0)) * uSkyIntensity;
    col = mix(col, cloudCol, cover * 0.9);
  }
  outColor = vec4(col, 1.0);
}
