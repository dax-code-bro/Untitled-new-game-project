in vec2 vUV;
flat in int vPat;
void main() {
    if (vPat == 13) discard;   // glass doesn't cast shadows
    if (vPat == 6) {           // chain-link: match the lit shader's alpha test roughly
        vec2 d = vUV * 14.0;
        vec2 g1 = abs(fract(vec2(d.x + d.y, d.x - d.y) * 0.5) - 0.5);
        if (min(g1.x, g1.y) > 0.09) discard;
    }
}
