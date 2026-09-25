// Shadow map depth pass (sun). Shares vertex layout with lit.vert.
layout(location = 0) in vec3 aPos;
layout(location = 2) in vec2 aUV;
layout(location = 4) in vec4 aMat;
#ifdef INSTANCED
layout(location = 5) in vec4 iM0;
layout(location = 6) in vec4 iM1;
layout(location = 7) in vec4 iM2;
layout(location = 8) in vec4 iM3;
#endif
uniform mat4 uLightVP;
uniform mat4 uModel;
out vec2 vUV;
flat out int vPat;
void main() {
#ifdef INSTANCED
    mat4 model = mat4(iM0, iM1, iM2, iM3);
#else
    mat4 model = uModel;
#endif
    vUV = aUV;
    vPat = int(aMat.w + 0.5);
    gl_Position = uLightVP * model * vec4(aPos, 1.0);
}
