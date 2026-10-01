// NATIVE: the game HUD (src/game/Hud.cpp) -- flat quads and distance-field text, in pixels.
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aColor;
layout(location=2) in vec2 aUv;
uniform vec2 uScreen;
out vec4 vColor;
out vec2 vUv;
void main() {
    vColor = aColor;
    vUv = aUv;
    vec2 p = aPos / uScreen * 2.0 - 1.0;
    gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
}
