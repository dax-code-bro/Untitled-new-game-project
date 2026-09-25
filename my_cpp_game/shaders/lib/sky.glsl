// The analytic sky, ported line for line from GLSL.sky in
// engine/src/50-shaders.js so the native build starts from the same
// sky the web build ships. The ground term includes sun bounce: the web
// engine measured a concrete sphere at 170 top / 10 bottom without it,
// sixteen to one, where a stone ball on a sunlit road is nearer four.
uniform vec3  uSkyZenith;
uniform vec3  uSkyHorizon;
uniform vec3  uGroundColor;
uniform vec3  uSunDir;          // points TOWARD the sun
uniform vec3  uSunColor;
uniform float uSunIntensity;
uniform float uSkyIntensity;
uniform float uGroundBounce;

vec3 groundIrradiance() {
    float lit = max(uSunDir.y, 0.0);
    return uGroundColor * (uSkyIntensity + uSunColor * uSunIntensity * lit * uGroundBounce);
}

vec3 skyRadiance(vec3 dir, float sunDisc) {
    float up  = dir.y;
    vec3  sky = mix(uSkyHorizon, uSkyZenith, saturate1(up * 1.6));
    sky = mix(groundIrradiance() / max(uSkyIntensity, 1e-4), sky, smoothstep(-0.28, 0.06, up));
    float sunDot = saturate1(dot(dir, uSunDir));
    float halo   = pow(sunDot, 12.0) * 0.35 + pow(sunDot, 3.0) * 0.08;
    float disc   = smoothstep(0.9986, 0.9995, sunDot);
    sky += uSunColor * (halo * uSunIntensity * 0.35);
    sky += uSunColor * disc * uSunIntensity * 12.0 * sunDisc;
    return sky * uSkyIntensity;
}

vec3 skyIrradiance(vec3 n) {
    float up  = mix(0.18, 1.0, n.y * 0.5 + 0.5);
    vec3  sky = mix(uSkyHorizon, uSkyZenith, 0.65) * uSkyIntensity;
    return mix(groundIrradiance(), sky, up);
}
