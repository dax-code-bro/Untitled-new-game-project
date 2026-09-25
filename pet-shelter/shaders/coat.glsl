// ---------------------------------------------------------------------------
// Animal coats: real-world fur/feather/scale patterns computed per pixel in
// the animal's bind-pose space, so markings stay glued to the body while it
// moves. Included by lit.frag. Pattern ids are listed in src/game/Species.h.
// ---------------------------------------------------------------------------
in vec3 vBindPos;
uniform vec3 uCoatA;        // main color
uniform vec3 uCoatB;        // second color (points, stripes, spots, patches)
uniform vec3 uCoatC;        // third color (white markings, belly)
uniform int  uCoatPattern;
uniform vec4 uCoatParams;   // x: body length (m), y: amount, z: seed, w: contrast
uniform vec4 uCoatMarks;    // x: socks, y: blaze, z: chest, w: tail tip (0..1)
uniform vec4 uWound;        // bind-space xyz + radius (0 = no wound)
uniform float uWet;         // blood on the wound (0..1)
uniform float uShell;       // fur shell layer height (0 = skin layer)

float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}
float vnoise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i), n100 = hash13(i + vec3(1, 0, 0)), n010 = hash13(i + vec3(0, 1, 0)), n110 = hash13(i + vec3(1, 1, 0));
    float n001 = hash13(i + vec3(0, 0, 1)), n101 = hash13(i + vec3(1, 0, 1)), n011 = hash13(i + vec3(0, 1, 1)), n111 = hash13(i + vec3(1, 1, 1));
    return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float fbm3(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { s += a * vnoise3(p); p = p * 2.07 + 13.7; a *= 0.5; }
    return s;
}
// Distance to the nearest random feature point (F1) and second nearest (F2).
vec2 cells(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int z = -1; z <= 1; ++z)
        for (int y = -1; y <= 1; ++y)
            for (int x = -1; x <= 1; ++x) {
                vec3 g = vec3(x, y, z);
                vec3 o = vec3(hash13(i + g), hash13(i + g + 17.1), hash13(i + g + 41.3));
                float d = length(g + o - f);
                if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
            }
    return vec2(d1, d2);
}

// Returns albedo. region = CoatRegion id, sub = region coordinate, under = 0 back .. 1 belly.
vec3 coatAlbedo(vec3 bp, int region, float sub, float under, out float furMask) {
    float L = max(uCoatParams.x, 0.05);
    vec3 q = bp / L + vec3(uCoatParams.z * 7.31, uCoatParams.z * 3.17, uCoatParams.z * 5.13);
    vec3 qs = bp / L;                         // unshifted (for anatomy-relative rules)
    float amt = uCoatParams.y;
    vec3 A = uCoatA, B = uCoatB, C = uCoatC;
    vec3 col = A;
    float wob = fbm3(q * 5.0);
    furMask = 1.0;
    int P = uCoatPattern;

    if (P == 1) {            // tan points (black & tan, tricolor)
        float tan = 0.0;
        if (region == 2) tan = smoothstep(0.55, 0.35, sub + (wob - 0.5) * 0.15);
        if (region == 3) tan = smoothstep(0.5, 0.7, sub) + smoothstep(0.12, 0.05, abs(qs.x) - 0.06) * smoothstep(0.3, 0.45, sub) * 0.0;
        if (region == 1 || region == 0) tan = max(tan, smoothstep(0.65, 0.9, under) * smoothstep(-0.1, 0.25, qs.z));
        if (region == 5) tan = smoothstep(0.6, 0.85, under);
        col = mix(A, B, clamp(tan, 0.0, 1.0));
    } else if (P == 2 || P == 3) {   // tabby (2 mackerel, 3 classic)
        float s;
        if (region == 2) s = sin(sub * 26.0 + wob * 3.0);
        else if (region == 5) s = sin(sub * 22.0 + wob * 2.0);
        else if (region == 3) s = sin(qs.x * 90.0 + wob * 4.0) * step(0.5, qs.y * 0.0 + 1.0 - sub);
        else if (P == 2) s = sin(qs.z * 38.0 + qs.y * 8.0 + wob * 5.0);
        else s = sin(length(vec2(qs.z + 0.05, (qs.y - 0.35) * 1.3)) * 42.0 + wob * 6.0);
        float stripe = smoothstep(0.15, 0.55, s) * (1.0 - smoothstep(0.55, 0.95, under) * 0.8);
        col = mix(A, B, stripe * uCoatParams.w);
        col = mix(col, C, smoothstep(0.75, 1.0, under) * amt);
    } else if (P == 4) {     // round spots (dalmatian, appaloosa)
        vec2 c = cells(q * (6.0 + amt * 10.0));
        float spot = smoothstep(0.38, 0.30, c.x + (wob - 0.5) * 0.12);
        col = mix(A, B, spot);
    } else if (P == 5) {     // merle / dapple patches
        float n = fbm3(q * 4.0 + 3.0);
        float patchV = smoothstep(0.58, 0.62, n);
        col = mix(A, B, patchV);
        col = mix(col, B, smoothstep(0.64, 0.7, fbm3(q * 9.0)) * 0.6);
    } else if (P == 6 || P == 22) {  // piebald / tuxedo (6), holstein (22: big patches)
        float bias = under * 0.55 + (region == 2 ? 0.45 * (1.0 - sub) : 0.0) + (region == 3 ? 0.25 * sub : 0.0);
        float n = fbm3(q * (P == 22 ? 2.4 : 3.2));
        float white = smoothstep(1.0 - amt - 0.02, 1.0 - amt + 0.02, n * 0.9 + bias * (P == 22 ? 0.2 : 1.0));
        col = mix(A, C, white);
    } else if (P == 7) {     // calico / tortoiseshell
        float n1 = fbm3(q * 3.5 + 11.0);
        col = mix(A, B, smoothstep(0.47, 0.53, n1));
        float bias = under * 0.6 + (region == 2 ? 0.4 * (1.0 - sub) : 0.0);
        col = mix(col, C, smoothstep(1.0 - amt - 0.03, 1.0 - amt + 0.03, fbm3(q * 2.8 + 5.0) * 0.8 + bias));
    } else if (P == 8) {     // brindle
        float s = sin(qs.z * 70.0 + qs.y * 30.0 + fbm3(q * 8.0) * 9.0);
        col = mix(A, B, smoothstep(0.2, 0.7, s) * 0.85 * uCoatParams.w);
    } else if (P == 9) {     // colorpoint (siamese, himalayan)
        float pt = 0.0;
        if (region == 2) pt = smoothstep(0.75, 0.3, sub);
        if (region == 4 || region == 7) pt = 1.0;
        if (region == 5) pt = smoothstep(0.1, 0.5, sub);
        if (region == 3) pt = smoothstep(0.45, 0.8, sub);
        col = mix(A, B, pt);
        col = mix(col, A * 0.85 + B * 0.15, (1.0 - under) * 0.3 * (1.0 - pt));
    } else if (P == 10) {    // countershade (fox, deer, most wild mammals)
        col = mix(A, B, smoothstep(0.35, 0.8, under + (wob - 0.5) * 0.2));
        col = mix(col, C, smoothstep(0.85, 0.98, under) * amt);
        if (region == 2) col = mix(col, B * 0.6 + A * 0.4, smoothstep(0.5, 0.15, sub) * 0.5);
    } else if (P == 11) {    // bold stripes (tiger)
        float s;
        if (region == 2) s = sin(sub * 30.0 + wob * 4.0);
        else if (region == 5) s = sin(sub * 24.0 + wob * 2.0);
        else if (region == 3) s = sin(qs.x * 70.0 + qs.y * 30.0 + wob * 5.0);
        else s = sin(qs.z * 30.0 + qs.y * 12.0 + fbm3(q * 3.0) * 7.0);
        float stripe = smoothstep(0.55, 0.8, s) * (1.0 - smoothstep(0.7, 0.95, under) * 0.6);
        col = mix(A, B, stripe);
        col = mix(col, C, smoothstep(0.7, 0.95, under) * amt * (1.0 - stripe * 0.5));
    } else if (P == 12) {    // rosettes (leopard, jaguar) / solid spots (cheetah when amount > 0.8)
        vec2 c = cells(q * (amt > 0.8 ? 22.0 : 15.0));
        float edge = c.x + (wob - 0.5) * 0.15;
        float rosette = amt > 0.8 ? smoothstep(0.32, 0.25, edge) : smoothstep(0.26, 0.34, edge) * smoothstep(0.52, 0.44, edge);
        col = mix(A, A * 0.82, smoothstep(0.3, 0.2, edge) * 0.6);
        col = mix(col, B, rosette * (1.0 - smoothstep(0.7, 0.95, under) * 0.5));
        col = mix(col, C, smoothstep(0.75, 0.95, under) * 0.8);
    } else if (P == 13) {    // saddle (german shepherd, beagle blanket)
        float saddle = smoothstep(0.45, 0.25, under + (wob - 0.5) * 0.25) * smoothstep(-0.5, -0.3, qs.z) * smoothstep(0.45, 0.25, qs.z);
        if (region == 3) saddle = smoothstep(0.6, 0.85, sub) * amt;
        if (region == 5) saddle = smoothstep(0.5, 0.2, under);
        if (region == 4) saddle = 1.0;
        col = mix(A, B, saddle);
    } else if (P == 14) {    // mask & ringed tail (raccoon), grizzled body
        col = mix(A, B, smoothstep(0.35, 0.8, vnoise3(q * 60.0)) * 0.45);
        if (region == 3) col = mix(col, B, smoothstep(0.2, 0.05, abs(sub - 0.55)) * smoothstep(0.02, 0.06, qs.y - 0.0 + 1.0));
        if (region == 5) col = mix(A * 1.1, B, step(0.0, sin(sub * 16.0)));
        col = mix(col, C, smoothstep(0.85, 1.0, sub) * float(region == 3));
    } else if (P == 15) {    // skunk
        col = B;
        float stripe = smoothstep(0.5, 0.25, under) * smoothstep(0.02, 0.04, abs(qs.x)) * smoothstep(0.14, 0.08, abs(qs.x));
        if (region == 3) stripe = smoothstep(0.03, 0.015, abs(qs.x)) * smoothstep(0.7, 0.3, sub);
        if (region == 5) stripe = smoothstep(0.3, 0.6, fbm3(q * 4.0) + sub * 0.3);
        col = mix(col, A, stripe);
    } else if (P == 16) {    // scales (reptiles)
        vec2 c = cells(q * 60.0);
        float edge = smoothstep(0.0, 0.08, c.y - c.x);
        float band = smoothstep(0.3, 0.6, sin(qs.z * 14.0 + wob * 3.0)) * amt;
        col = mix(A, B, band);
        col = mix(col, C, smoothstep(0.6, 0.9, under));
        col *= mix(0.6, 1.0, edge);
        furMask = 0.0;
    } else if (P == 17) {    // feathers (birds)
        col = A;
        if (region == 9) col = B;
        if (region == 5) col = mix(B, C, 0.5);
        if (region == 3) col = mix(A, C, smoothstep(0.6, 0.9, sub) * 0.0);
        col = mix(col, C, smoothstep(0.55, 0.9, under) * amt);
        float bar = smoothstep(0.2, 0.8, sin(qs.z * 120.0 + qs.x * 40.0));
        col *= 0.9 + 0.1 * bar;
        furMask = 0.0;
    } else if (P == 18) {    // fawn spots (young deer)
        col = mix(A, B, smoothstep(0.35, 0.8, under));
        vec2 c = cells(q * 18.0);
        col = mix(col, C, smoothstep(0.2, 0.12, c.x) * smoothstep(0.45, 0.2, under) * amt);
    } else if (P == 19) {    // agouti / ticked (wild rabbits, abyssinian)
        col = mix(A, B, smoothstep(0.2, 0.9, vnoise3(q * 420.0)) * 0.35);   // fine ticking (hair tips add more in lit.frag)
        col = mix(col, C, smoothstep(0.7, 0.95, under) * amt);
    } else if (P == 20) {    // roan
        col = mix(A, C, smoothstep(0.55, 0.75, vnoise3(q * 120.0)) * amt);
    } else if (P == 21) {    // belted / banded (dutch rabbit, beltie cow)
        float band = smoothstep(0.02, -0.02, abs(qs.z + 0.02) - amt * 0.18 - (wob - 0.5) * 0.05);
        col = mix(A, C, band * float(region == 0 || region == 1));
    }

    // Turtle/tortoise shell: large scutes with dark seams and growth rings
    if (region == 10) {
        vec3 sq = bp / L * vec3(3.2, 4.5, 3.2);
        vec2 sc = cells(sq + uCoatParams.z);
        float seam = smoothstep(0.02, 0.09, sc.y - sc.x);
        float rings = 0.5 + 0.5 * sin(sc.x * 70.0);
        col = mix(B, A, 0.55 + 0.45 * smoothstep(0.55, 0.0, sc.x));
        col *= mix(0.88, 1.0, rings);
        col = mix(B * 0.35, col, seam);
        furMask = 0.0;
    }
    // Region-specific tweaks common to all coats
    if (region == 7) col = mix(col, vec3(0.85, 0.62, 0.58), 0.7);       // inner ear skin
    if (region == 8) col = mix(col, B, 0.55);                              // manes are darker
    // White markings: socks, blaze, chest, tail tip
    vec4 m = uCoatMarks;
    float white = 0.0;
    if (region == 2) white = smoothstep(m.x * 0.7 + 0.02, m.x * 0.7 - 0.03, sub + (wob - 0.5) * 0.08) * step(0.01, m.x);
    if (region == 3) white = smoothstep(0.02 + m.y * 0.035, m.y * 0.035, abs(qs.x)) * step(0.01, m.y) * smoothstep(0.25, 0.4, sub);
    if (region == 0 || region == 1) white = smoothstep(0.55, 0.8, under) * smoothstep(0.0, 0.2, qs.z) * m.z;
    if (region == 5) white = smoothstep(1.0 - m.w * 0.35, 1.02 - m.w * 0.35, sub) * step(0.01, m.w);
    col = mix(col, C, clamp(white, 0.0, 1.0));
    return col;
}
