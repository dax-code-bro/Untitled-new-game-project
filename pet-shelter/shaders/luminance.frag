// Log-luminance of the HDR frame (center weighted) for auto exposure.
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uSrc;
void main() {
    vec3 c = texture(uSrc, vUV).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec2 d = vUV - 0.5;
    float w = 1.0 - smoothstep(0.2, 0.7, length(d));   // favor the center of the screen
    fragColor = vec4(log(max(l, 1e-4)) * w, w, 0.0, 1.0);
}
