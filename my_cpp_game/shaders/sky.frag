#include "lib/common.glsl"
#include "lib/sky.glsl"
in vec2 vUv;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
layout(location = 0) out vec4 outColor;
void main() {
    vec4 far = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 dir = normalize(far.xyz / far.w - uCameraPos);
    outColor = vec4(skyRadiance(dir, 1.0), 1.0);
}
