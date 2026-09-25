// Bloom upsample: 3x3 tent filter, additively blended into the next mip up.
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
void main() {
    vec2 t = uTexel * uRadius;
    vec3 c = texture(uSrc, vUV).rgb * 4.0;
    c += (texture(uSrc, vUV + vec2(t.x, 0)).rgb + texture(uSrc, vUV - vec2(t.x, 0)).rgb +
          texture(uSrc, vUV + vec2(0, t.y)).rgb + texture(uSrc, vUV - vec2(0, t.y)).rgb) * 2.0;
    c += texture(uSrc, vUV + t).rgb + texture(uSrc, vUV - t).rgb +
         texture(uSrc, vUV + vec2(t.x, -t.y)).rgb + texture(uSrc, vUV + vec2(-t.x, t.y)).rgb;
    fragColor = vec4(c / 16.0, 1.0);
}
