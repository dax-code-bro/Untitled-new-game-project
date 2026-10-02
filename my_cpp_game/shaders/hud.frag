// NATIVE: the game HUD (src/game/Hud.cpp). uv.x < 0 is a flat quad; anything
// else is a glyph from the distance-field atlas (tools/make_hud_font.py):
// 0.5 is the edge, and kSpread atlas px of distance either side of it.
// vSoft = 1 is the glyph's drop shadow: a blurred, slightly fattened copy.
in vec4 vColor;
in vec2 vUv;
in float vSoft;
uniform sampler2D uAtlas;
uniform float uSpread;
layout(location=0) out vec4 outColor;
void main() {
    if (vUv.x < 0.0) { outColor = vColor; return; }
    float d = texture(uAtlas, vUv).r;
    float aa = max(fwidth(d) * 0.7, 1e-4);
    float a;
    if (vSoft > 0.5) {
        // About two atlas px of blur, centred a little outside the edge.
        float blur = 2.0 / uSpread * 0.5;
        a = smoothstep(0.5 - blur * 1.4, 0.5 + blur * 0.6, d);
    } else {
        a = smoothstep(0.5 - aa, 0.5 + aa, d);
    }
    outColor = vec4(vColor.rgb, vColor.a * a);
}
