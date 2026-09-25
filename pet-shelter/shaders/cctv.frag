// Security camera feed look: fixed exposure, desaturated, scanlines, noise.
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uHDR;
uniform float uExposure;
uniform float uTime;
uniform float uNightVision;
uniform float uPlain;   // 1 = clean studio render (animal records), no camera effects
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
    if (uPlain > 0.5) {
        vec3 hc = aces(texture(uHDR, vUV).rgb * uExposure);
        fragColor = vec4(pow(hc, vec3(1.0 / 2.2)), 1.0);
        return;
    }
    vec2 uv = vUV;
    // Slight barrel distortion (wide angle lens)
    vec2 d = uv - 0.5;
    uv = 0.5 + d * (1.0 + dot(d, d) * 0.12);
    vec3 c = texture(uHDR, uv).rgb * uExposure;
    c = c / (1.0 + c);                                   // Reinhard (cheap camera sensor)
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 tint = mix(vec3(0.85, 0.95, 0.9), vec3(0.45, 1.0, 0.5), uNightVision);
    c = mix(vec3(l) * tint, c, 0.25 * (1.0 - uNightVision));
    c = pow(c, vec3(1.0 / 2.0));
    c *= 0.92 + 0.08 * sin(vUV.y * 540.0);               // scanlines
    float n = fract(sin(dot(vUV * 800.0 + fract(uTime) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
    c += (n - 0.5) * 0.07;
    c *= 1.0 - dot(d, d) * 1.1;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) c = vec3(0.0);
    fragColor = vec4(c, 1.0);
}
