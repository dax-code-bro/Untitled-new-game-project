// HDR -> display: exposure (auto), bloom, ACES filmic curve, gamma,
// vignette, fade and cutscene letterbox.
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uHDR;
uniform sampler2D uBloom;
uniform sampler2D uAdapted;
uniform float uBloomStrength;
uniform float uExposureBias;     // in stops
uniform float uAutoExposure;
uniform float uManualExposure;
uniform float uFade;             // 0 = black, 1 = visible
uniform float uLetterbox;        // 0..1 amount
uniform float uTime;

// ACES fitted (Stephen Hill)
vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
}
vec3 aces(vec3 c) {
    const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    return clamp(outM * RRTAndODTFit(inM * c), 0.0, 1.0);
}

void main() {
    vec3 hdr = texture(uHDR, vUV).rgb;
    vec3 bloom = texture(uBloom, vUV).rgb;
    hdr = mix(hdr, bloom, uBloomStrength);
    float exposure;
    if (uAutoExposure > 0.5) {
        float avg = texture(uAdapted, vec2(0.5)).r;
        exposure = 0.18 / clamp(avg, 0.02, 8.0);
    } else {
        exposure = uManualExposure;
    }
    exposure *= exp2(uExposureBias);
    vec3 c = aces(hdr * exposure);
    c = pow(c, vec3(1.0 / 2.2));
    // Vignette + subtle film grain
    vec2 d = vUV - 0.5;
    c *= 1.0 - dot(d, d) * 0.45;
    float grain = fract(sin(dot(vUV * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    c += grain * 0.012;
    c *= uFade;
    float bar = 0.12 * uLetterbox;
    if (vUV.y < bar || vUV.y > 1.0 - bar) c = vec3(0.0);
    fragColor = vec4(c, dot(c, vec3(0.299, 0.587, 0.114)));  // luma in alpha for FXAA
}
