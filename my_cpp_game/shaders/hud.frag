// NATIVE: the game HUD (src/game/Hud.cpp). uv.x < 0 is a flat quad; anything
// else is a glyph from the distance-field atlas (tools/make_hud_font.py):
// 0.5 is the edge, and kSpread atlas px of distance either side of it.
in vec4 vColor;
in vec2 vUv;
uniform sampler2D uAtlas;
uniform float uSpread;
layout(location=0) out vec4 outColor;
void main() {
    if (vUv.x < 0.0) { outColor = vColor; return; }
    float d = texture(uAtlas, vUv).r;
    // One screen pixel of anti-aliasing, whatever size the text is drawn at.
    float aa = max(fwidth(d) * 0.7, 1e-4);
    float fill = smoothstep(0.5 - aa, 0.5 + aa, d);
    // A thin dark outline, about 3% of the em: keeps pale text legible over sky and sand.
    float edge = 0.5 - 1.6 / uSpread * 0.5;
    float ring = smoothstep(edge - aa, edge + aa, d);
    vec3 rgb = mix(vec3(0.03, 0.025, 0.02), vColor.rgb, fill);
    float a = vColor.a * max(fill, ring * 0.65);
    outColor = vec4(rgb, a);
}
