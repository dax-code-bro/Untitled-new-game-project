#version 460 core
/* Placeholder. The real one is a direct port of engine/src/50-shaders.js
   GLSL.pbrFrag, which already carries the multi-scatter GGX, the
   octahedral G-buffer write, the prefiltered environment lookup and the
   parallax march. Port it as-is: it is ES 3.00 and this is 4.60 core,
   so the differences are the version line and precision qualifiers. */
in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUv;

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outGBuffer;

void main() {
    vec3 N = normalize(vNormal);
    outColor   = vec4(N * 0.5 + 0.5, 1.0);
    outGBuffer = vec4(0.0);
}
