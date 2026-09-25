// Bloom downsample: 13-tap filter (Jimenez 2014). The first pass uses a
// Karis average so single very bright pixels (the sun) don't flicker.
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;       // 1 / source size
uniform float uFirst;
uniform float uThreshold;   // firefly clamp


void main() {
    vec2 t = uTexel;
    vec3 a = texture(uSrc, vUV + t * vec2(-2, 2)).rgb, b = texture(uSrc, vUV + t * vec2(0, 2)).rgb, c = texture(uSrc, vUV + t * vec2(2, 2)).rgb;
    vec3 d = texture(uSrc, vUV + t * vec2(-2, 0)).rgb, e = texture(uSrc, vUV).rgb, f = texture(uSrc, vUV + t * vec2(2, 0)).rgb;
    vec3 g = texture(uSrc, vUV + t * vec2(-2, -2)).rgb, h = texture(uSrc, vUV + t * vec2(0, -2)).rgb, i = texture(uSrc, vUV + t * vec2(2, -2)).rgb;
    vec3 j = texture(uSrc, vUV + t * vec2(-1, 1)).rgb, k = texture(uSrc, vUV + t * vec2(1, 1)).rgb;
    vec3 l = texture(uSrc, vUV + t * vec2(-1, -1)).rgb, m = texture(uSrc, vUV + t * vec2(1, -1)).rgb;
    vec3 col;
    if (uFirst > 0.5) {
        vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25;
        vec3 g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
        vec3 w0 = vec3(0.125 / (1.0 + dot(g0, vec3(0.2126, 0.7152, 0.0722))));
        vec3 w1 = vec3(0.125 / (1.0 + dot(g1, vec3(0.2126, 0.7152, 0.0722))));
        vec3 w2 = vec3(0.125 / (1.0 + dot(g2, vec3(0.2126, 0.7152, 0.0722))));
        vec3 w3 = vec3(0.125 / (1.0 + dot(g3, vec3(0.2126, 0.7152, 0.0722))));
        vec3 w4 = vec3(0.5 / (1.0 + dot(g4, vec3(0.2126, 0.7152, 0.0722))));
        col = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
        col = min(col, vec3(uThreshold));   // clamp fireflies
    } else {
        col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
    }
    fragColor = vec4(max(col, vec3(0.0)), 1.0);
}
