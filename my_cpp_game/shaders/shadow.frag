// Ported from engine/src/50-shaders.js GLSL.shadowFrag (GLSL ES 3.00 -> 4.50 core).
in vec2 vUv;
/* THE BLOCKER DEPTH, for PCSS.
 *
 * Declared unconditionally and written unconditionally, with no #define,
 * because the shadow framebuffer only HAS a colour attachment on the
 * tiers that asked for PCSS. On every other tier the target is
 * depth-only, its draw-buffer list is [NONE] (see the Framebuffer
 * constructor in 20-gl.js), and this write is discarded by the driver --
 * which is legal, silent and free, and is the same arrangement the
 * G-buffer output in pbrFrag already relies on. The alternative, a fifth
 * #define on the shadow path, doubles a program cache that is already
 * four defines deep and pays for it in SwiftShader compiles inside the
 * 120-second boot windows of killcam, mpplay and mpshell.
 *
 * gl_FragCoord.z and not a hand-rolled distance: the cascade projection
 * is ORTHOGRAPHIC, so this is already linear in metres along the light,
 * which is the whole reason one byte of it is enough. */
layout(location=0) out float outBlocker;
void main(){
  outBlocker = gl_FragCoord.z;
}
