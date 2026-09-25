// Main lit vertex shader: all static world geometry, animated props and
// characters. INSTANCED variant is used for trees, traffic and props.
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
layout(location = 3) in vec4 aColor;
layout(location = 4) in vec4 aMat;
#ifdef INSTANCED
layout(location = 5) in vec4 iM0;
layout(location = 6) in vec4 iM1;
layout(location = 7) in vec4 iM2;
layout(location = 8) in vec4 iM3;
layout(location = 9) in vec4 iTint;
#endif

uniform mat4 uViewProj;
uniform mat4 uModel;
uniform vec4 uTint;
uniform float uWind;
uniform float uTime;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
out vec4 vColor;
out vec4 vMat;
out float vW;

void main() {
#ifdef INSTANCED
    mat4 model = mat4(iM0, iM1, iM2, iM3);
    vec4 tint = iTint;
#else
    mat4 model = uModel;
    vec4 tint = uTint;
#endif
    vec4 wp = model * vec4(aPos, 1.0);
    // Foliage sways in the wind (vertex animation, in-shader)
    if (int(aMat.w + 0.5) == 17) {
        float sway = sin(uTime * 1.7 + wp.x * 0.13 + wp.z * 0.11) * 0.06 * max(aPos.y - 1.5, 0.0) * uWind;
        wp.xz += vec2(sway, sway * 0.6);
    }
    vWorldPos = wp.xyz;
    vNormal = mat3(model) * aNormal;
    vUV = aUV;
    vColor = vec4(aColor.rgb * tint.rgb, aColor.a * tint.a);
    vMat = aMat;
    gl_Position = uViewProj * wp;
    vW = gl_Position.w;
}
