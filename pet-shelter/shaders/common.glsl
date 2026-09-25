// ---------------------------------------------------------------------------
// Shared GLSL: lighting uniforms, sky model, noise, logarithmic depth.
// Every lit object in the game (world, doors, gate, character, cars, trees)
// is shaded by code in this file + lit.frag.
// ---------------------------------------------------------------------------
uniform vec3  uCamPos;
uniform vec3  uSunDir;        // direction TO the sun (or moon at night)
uniform vec3  uSunColor;      // HDR radiance of the key light
uniform vec3  uSkyZenith;
uniform vec3  uSkyHorizon;
uniform vec3  uGroundAmbient;
uniform float uSunDiskIntensity;
uniform float uNight;         // 0 day .. 1 full night
uniform float uFogDensity;
uniform float uTime;
uniform float uLogDepthCoef;  // 1 / log2(far + 1)

const float PI = 3.14159265359;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm2(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
}

// Analytic sky radiance for a view direction (HDR).
vec3 skyRadiance(vec3 dir) {
    float up = max(dir.y, 0.0);
    float horizonBlend = pow(1.0 - up, 4.0);
    vec3 col = mix(uSkyZenith, uSkyHorizon, horizonBlend);
    float sunDot = max(dot(dir, uSunDir), 0.0);
    // Mie-ish glow around the sun
    col += uSunColor * (0.08 * pow(sunDot, 8.0) + 0.25 * pow(sunDot, 64.0)) * (1.0 - uNight);
    // Below the horizon fade to ground haze
    if (dir.y < 0.0) col = mix(col, uSkyHorizon * 0.6 + uGroundAmbient * 0.3, clamp(-dir.y * 6.0, 0.0, 1.0));
    return col;
}

vec3 applyFog(vec3 color, vec3 worldPos) {
    vec3 d = worldPos - uCamPos;
    float dist = length(d);
    // Exponential height fog, integrated along the view ray (thin at altitude, thick in valleys)
    const float falloff = 0.0016;
    float camTerm = exp(-falloff * max(uCamPos.y, 0.0));
    float dy = d.y;
    float k = abs(dy * falloff) > 1e-4 ? (1.0 - exp(-falloff * dy)) / (falloff * dy) : 1.0;
    float f = 1.0 - exp(-uFogDensity * camTerm * k * dist);
    vec3 dir = d / max(dist, 1e-3);
    vec3 fogCol = skyRadiance(normalize(vec3(dir.x, max(dir.y, 0.02), dir.z)));
    return mix(color, fogCol, clamp(f, 0.0, 1.0));
}

// Logarithmic depth: lets us draw from 5 cm to 90 km without z-fighting.
float logDepth(float w) { return log2(max(1e-6, 1.0 + w)) * uLogDepthCoef; }
