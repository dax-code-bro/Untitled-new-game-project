// HDR sky: analytic atmosphere, sun disk, stars at night, soft clouds.
#include "common.glsl"
in vec2 vUV;
out vec4 fragColor;
uniform mat4 uInvViewProj;
void main() {
    vec4 p = uInvViewProj * vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
    vec3 dir = normalize(p.xyz / p.w - uCamPos);
    vec3 col = skyRadiance(dir);
    float sunDot = dot(dir, uSunDir);
    // Sun disk (very bright: drives bloom)
    col += uSunColor * uSunDiskIntensity * smoothstep(0.99985, 0.99993, sunDot) * (1.0 - uNight);
    // Moon disk at night
    col += vec3(0.9, 0.92, 1.0) * 3.0 * smoothstep(0.99975, 0.99985, sunDot) * uNight;
    if (dir.y > 0.0) {
        // Clouds: 2D noise on a plane
        vec2 cp = dir.xz / (dir.y + 0.08) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
        float c = smoothstep(0.52, 0.8, fbm2(cp * 1.3));
        vec3 cloudCol = mix(uSkyHorizon * 1.3 + uSunColor * 0.08, vec3(0.03, 0.035, 0.05), uNight * 0.9);
        col = mix(col, cloudCol, c * 0.75 * smoothstep(0.0, 0.12, dir.y));
        // Stars
        vec2 sp = floor(dir.xz / (dir.y + 0.3) * 420.0);
        float star = step(0.9975, hash12(sp)) * uNight * (0.5 + 0.5 * sin(uTime * 3.0 + hash12(sp + 3.1) * 40.0));
        col += vec3(star) * 2.0 * (1.0 - c);
    }
    fragColor = vec4(col, 1.0);
}
