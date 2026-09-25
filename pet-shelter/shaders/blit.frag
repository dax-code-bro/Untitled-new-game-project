in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uSrc;
void main() { fragColor = vec4(texture(uSrc, vUV).rgb, 1.0); }
