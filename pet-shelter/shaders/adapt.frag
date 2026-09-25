// Eye adaptation: smoothly move the adapted luminance toward the scene average.
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uLum;      // mipmapped log-luminance (rg = sum(log l * w), sum(w))
uniform sampler2D uPrev;     // 1x1 previous adapted luminance
uniform float uMaxLevel;
uniform float uDt;
uniform float uFirstFrame;
void main() {
    vec2 s = textureLod(uLum, vec2(0.5), uMaxLevel).rg;
    float avgLum = exp(s.x / max(s.y, 1e-4));
    float prev = texture(uPrev, vec2(0.5)).r;
    // Faster when getting brighter (walking outside) than darker (walking in)
    float rate = avgLum > prev ? 2.2 : 1.1;
    float a = uFirstFrame > 0.5 ? avgLum : prev + (avgLum - prev) * (1.0 - exp(-uDt * rate));
    fragColor = vec4(max(a, 1e-4), 0.0, 0.0, 1.0);
}
