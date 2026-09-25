// FXAA (simplified 3.11 console-style) on the tonemapped image.
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main() {
    vec3 rgbM = texture(uSrc, vUV).rgb;
    float lM = texture(uSrc, vUV).a;
    float lNW = texture(uSrc, vUV + vec2(-1, -1) * uTexel).a;
    float lNE = texture(uSrc, vUV + vec2(1, -1) * uTexel).a;
    float lSW = texture(uSrc, vUV + vec2(-1, 1) * uTexel).a;
    float lSE = texture(uSrc, vUV + vec2(1, 1) * uTexel).a;
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    if (lMax - lMin < max(0.0312, lMax * 0.125)) { fragColor = vec4(rgbM, 1.0); return; }
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
    float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
    float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
    dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
    vec3 a = 0.5 * (texture(uSrc, vUV + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uSrc, vUV + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 b = a * 0.5 + 0.25 * (texture(uSrc, vUV - dir * 0.5).rgb + texture(uSrc, vUV + dir * 0.5).rgb);
    float lB = dot(b, vec3(0.299, 0.587, 0.114));
    fragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
}
