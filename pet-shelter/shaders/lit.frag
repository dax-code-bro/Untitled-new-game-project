// Physically based (GGX) shading with HDR output. Sun + sky ambient +
// indoor point lights + emissive, cascaded shadows, procedural materials.
#include "common.glsl"
#include "coat.glsl"

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in vec4 vColor;
in vec4 vMat;
in float vW;

out vec4 fragColor;

uniform sampler2DShadow uShadow0;
uniform sampler2DShadow uShadow1;
uniform mat4 uShadowMat0;
uniform mat4 uShadowMat1;
uniform float uShadowOn;
uniform float uShadowTexel;   // 1 / shadow map size

#define MAX_POINT 16
uniform int  uNumPoint;
uniform vec4 uPointPos[MAX_POINT];    // xyz, radius
uniform vec4 uPointColor[MAX_POINT];  // rgb intensity
uniform vec3 uIndoorMin;
uniform vec3 uIndoorMax;
uniform float uTransparentPass;

// ---------------- Procedural material patterns ----------------
struct Surface { vec3 albedo; float rough; float metal; vec3 emissive; vec3 n; float alpha; };

float lineMask(float x, float w) { return smoothstep(w, w * 0.5, abs(fract(x) - 0.5) * 2.0 - (1.0 - w)); }

void terrainMaterial(inout Surface s, vec3 wp, vec3 n, float forest) {
    float slope = 1.0 - n.y;
    float nA = fbm2(wp.xz * 0.05), nB = vnoise(wp.xz * 0.7), nC = fbm2(wp.xz * 0.004);
    vec3 grassA = vec3(0.20, 0.30, 0.09), grassB = vec3(0.33, 0.36, 0.13), dry = vec3(0.45, 0.40, 0.22);
    vec3 grass = mix(mix(grassA, grassB, nA), dry, smoothstep(0.55, 0.8, nC) * 0.7);
    grass *= 0.85 + 0.3 * nB;
    vec3 dirt = vec3(0.34, 0.26, 0.18) * (0.8 + 0.4 * nB);
    vec3 rock = vec3(0.40, 0.38, 0.36) * (0.7 + 0.5 * fbm2(wp.xz * 0.3 + wp.y * 0.2));
    vec3 snow = vec3(0.92, 0.94, 0.98);
    vec3 c = mix(grass, dirt, smoothstep(0.18, 0.32, slope + (nA - 0.5) * 0.15));
    c = mix(c, rock, smoothstep(0.35, 0.55, slope));
    float snowLine = 700.0 + nC * 250.0;
    c = mix(c, snow, smoothstep(snowLine, snowLine + 120.0, wp.y) * (1.0 - smoothstep(0.55, 0.8, slope)));
    // Far away, individual trees aren't drawn: paint the forest canopy into the ground instead
    float dist = length(wp - uCamPos);
    float canopy = forest * smoothstep(1200.0, 2600.0, dist) * (1.0 - smoothstep(0.45, 0.7, slope));
    vec3 canopyCol = mix(vec3(0.06, 0.13, 0.05), vec3(0.10, 0.17, 0.07), vnoise(wp.xz * 0.01));
    c = mix(c, canopyCol, canopy * 0.9);
    // Large-scale color variation (meadows, dry patches)
    c *= 0.85 + 0.3 * fbm2(wp.xz * 0.0007);
    s.albedo = c;
    s.rough = mix(0.95, 0.75, smoothstep(0.35, 0.55, slope));
}

void applyPattern(int pat, inout Surface s, vec3 wp, vec2 uv) {
    if (pat == 1 || pat == 19) {            // asphalt / highway
        float g = vnoise(wp.xz * 9.0) * 0.5 + vnoise(wp.xz * 31.0) * 0.5;
        s.albedo *= 0.75 + 0.5 * g;
        s.rough = 0.85 - 0.1 * g;
        if (pat == 19) {                    // highway lanes along X: dashed white + yellow center
            float z = wp.z - 640.0;
            float dash = step(fract(wp.x / 12.0), 0.5);
            float lane = (1.0 - smoothstep(0.08, 0.12, abs(abs(z) - 3.8))) * dash;
            float center = 1.0 - smoothstep(0.08, 0.12, abs(abs(z) - 0.18));
            float edge = 1.0 - smoothstep(0.08, 0.12, abs(abs(z) - 7.4));
            s.albedo = mix(s.albedo, vec3(0.85), max(lane, edge));
            s.albedo = mix(s.albedo, vec3(0.85, 0.65, 0.1), center);
        }
    } else if (pat == 2) {
        terrainMaterial(s, wp, s.n, uv.x);
    } else if (pat == 3) {                  // wood planks
        float plank = floor(uv.x * 5.0);
        float grain = vnoise(vec2(uv.x * 5.0 * 3.0, uv.y * 0.6 + plank * 7.3) * vec2(1.0, 8.0));
        s.albedo *= 0.75 + 0.35 * grain + 0.15 * hash12(vec2(plank, floor(uv.y * 0.8 + hash12(vec2(plank)))));
        s.albedo *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.03, abs(fract(uv.x * 5.0) - 0.5) * 2.0 - 0.94) );
        s.rough = 0.55;
    } else if (pat == 4 || pat == 21) {     // tile (21: clinical vinyl)
        float sz = pat == 4 ? 2.5 : 3.3;
        vec2 t = fract(uv * sz);
        float grout = step(0.95, max(t.x, t.y));
        vec2 cell = floor(uv * sz);
        s.albedo *= 0.92 + 0.12 * hash12(cell);
        s.albedo = mix(s.albedo, s.albedo * 0.55, grout);
        s.rough = mix(0.25, 0.9, grout);
    } else if (pat == 5 || pat == 12) {     // carpet / fabric
        float f = vnoise(uv * 180.0) * 0.5 + vnoise(uv * 40.0) * 0.5;
        s.albedo *= 0.85 + 0.25 * f;
        s.rough = 0.98;
    } else if (pat == 6) {                  // chain-link fence (alpha tested)
        vec2 d = uv * 14.0;
        vec2 g1 = abs(fract(vec2(d.x + d.y, d.x - d.y) * 0.5) - 0.5);
        float wire = 1.0 - smoothstep(0.05, 0.09, min(g1.x, g1.y));
        float post = step(abs(fract(uv.x / 3.0) - 0.5) * 3.0, 0.05);
        float rail = step(uv.y, 0.05) + step(1.95, uv.y);
        float m = max(wire, max(post, rail));
        if (m < 0.5) discard;
        s.metal = 0.8; s.rough = 0.45;
    } else if (pat == 7) {                  // computer screen: glowing desktop
        vec2 p = uv;
        vec3 bg = mix(vec3(0.05, 0.25, 0.45), vec3(0.1, 0.5, 0.6), p.y);
        float bar = step(p.y, 0.07);
        float win = step(0.12, p.x) * step(p.x, 0.62) * step(0.2, p.y) * step(p.y, 0.85);
        float rows = step(0.5, fract(p.y * 18.0)) * win * step(p.x, 0.55);
        vec3 c = mix(bg, vec3(0.08), bar);
        c = mix(c, vec3(0.92), win * 0.9);
        c = mix(c, vec3(0.3, 0.6, 0.35), rows * 0.6);
        c = mix(c, vec3(0.95, 0.75, 0.2), step(0.68, p.x) * step(p.x, 0.92) * step(0.25, p.y) * step(p.y, 0.5) * step(0.5, fract(p.x * 12.0)));
        s.albedo = vec3(0.02);
        s.emissive = c * 2.2;
        s.rough = 0.1;
    } else if (pat == 8) {                  // concrete
        s.albedo *= 0.85 + 0.25 * fbm2(uv * 3.0) + 0.05 * vnoise(uv * 60.0);
        s.rough = 0.9;
    } else if (pat == 9) {                  // lawn grass
        float g = vnoise(wp.xz * 3.0) * 0.6 + vnoise(wp.xz * 23.0) * 0.4;
        s.albedo = mix(vec3(0.16, 0.30, 0.08), vec3(0.30, 0.42, 0.12), g);
        s.rough = 0.95;
    } else if (pat == 10) {                 // road with painted center line (uv.x across, uv.y along)
        float g = vnoise(wp.xz * 9.0) * 0.5 + vnoise(wp.xz * 31.0) * 0.5;
        s.albedo *= 0.75 + 0.5 * g;
        float center = (1.0 - smoothstep(0.06, 0.1, abs(uv.x - 3.5))) * step(fract(uv.y / 6.0), 0.5);
        float edge = 1.0 - smoothstep(0.06, 0.1, min(abs(uv.x - 0.2), abs(uv.x - 6.8)));
        s.albedo = mix(s.albedo, vec3(0.85, 0.66, 0.1), center);
        s.albedo = mix(s.albedo, vec3(0.8), edge);
        s.rough = 0.85;
    } else if (pat == 11) {                 // horizontal lap siding
        float board = fract(uv.y * 5.0);
        s.albedo *= 0.9 + 0.1 * smoothstep(0.0, 0.15, board) - 0.12 * step(0.94, board);
        s.albedo *= 0.95 + 0.08 * vnoise(uv * vec2(2.0, 40.0));
        s.rough = 0.7;
    } else if (pat == 14) {                 // hair strands
        s.albedo *= 0.75 + 0.4 * vnoise(vec2(uv.x * 90.0, uv.y * 6.0));
        s.rough = 0.45;
    } else if (pat == 15) {                 // brushed metal
        s.albedo *= 0.9 + 0.1 * vnoise(vec2(uv.x * 300.0, uv.y * 3.0));
    } else if (pat == 16) {                 // parking lot with stall lines
        float g = vnoise(wp.xz * 9.0) * 0.5 + vnoise(wp.xz * 31.0) * 0.5;
        s.albedo *= 0.75 + 0.5 * g;
        float stall = (1.0 - smoothstep(0.05, 0.08, abs(fract((wp.x + 1.25) / 2.7) - 0.5) * 2.7 - 1.25));
        float inRow = step(abs(wp.z - 18.0), 2.6) + step(abs(wp.z - 34.0), 2.6);
        s.albedo = mix(s.albedo, vec3(0.85), stall * min(inRow, 1.0));
        s.rough = 0.85;
    } else if (pat == 17) {                 // foliage
        float leaf = vnoise(wp.xz * 4.0 + wp.y * 3.0);
        s.albedo *= 0.7 + 0.5 * leaf;
        s.rough = 0.8;
    } else if (pat == 18) {                 // bark
        s.albedo *= 0.7 + 0.5 * vnoise(vec2(uv.x * 8.0, uv.y * 1.5));
        s.rough = 0.95;
    } else if (pat == 20) {                 // roof shingles
        vec2 t = uv * vec2(3.0, 5.0);
        t.x += step(0.5, fract(t.y * 0.5)) * 0.5;
        float edge = step(0.9, fract(t.y)) + step(0.95, fract(t.x));
        s.albedo *= (0.85 + 0.2 * hash12(floor(t))) * (1.0 - 0.35 * min(edge, 1.0));
        s.rough = 0.9;
    }
}

// ---------------- Lighting ----------------
float D_GGX(float NdH, float a) { float a2 = a * a; float d = NdH * NdH * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
float V_Smith(float NdV, float NdL, float a) {
    float k = a * 0.5;
    return 0.25 / ((NdV * (1.0 - k) + k) * (NdL * (1.0 - k) + k));
}
vec3 F_Schlick(float VdH, vec3 f0) { return f0 + (1.0 - f0) * pow(1.0 - VdH, 5.0); }

vec3 brdf(Surface s, vec3 N, vec3 V, vec3 L, vec3 radiance) {
    vec3 H = normalize(V + L);
    float NdL = max(dot(N, L), 0.0);
    if (NdL <= 0.0) return vec3(0.0);
    float NdV = max(dot(N, V), 1e-3), NdH = max(dot(N, H), 0.0), VdH = max(dot(V, H), 0.0);
    float a = max(s.rough * s.rough, 0.02);
    vec3 f0 = mix(vec3(0.04), s.albedo, s.metal);
    vec3 F = F_Schlick(VdH, f0);
    vec3 spec = D_GGX(NdH, a) * V_Smith(NdV, NdL, a) * F;
    vec3 diff = (1.0 - F) * (1.0 - s.metal) * s.albedo / PI;
    return (diff + spec) * radiance * NdL;
}

float sampleShadow(sampler2DShadow sm, mat4 m, vec3 wp, float bias) {
    vec4 p = m * vec4(wp, 1.0);
    vec3 c = p.xyz / p.w * 0.5 + 0.5;
    if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return -1.0;
#ifdef LOW_QUALITY
    return texture(sm, vec3(c.xy, c.z - bias));   // one hardware-filtered tap on phones
#endif
    float sum = 0.0;
    vec2 texel = vec2(uShadowTexel);
    for (int x = -1; x <= 1; ++x)
        for (int y = -1; y <= 1; ++y)
            sum += texture(sm, vec3(c.xy + vec2(x, y) * texel * 1.2, c.z - bias));
    return sum / 9.0;
}

float shadowFactor(vec3 wp, vec3 n) {
    if (uShadowOn < 0.5) return 1.0;
    float ndl = max(dot(n, uSunDir), 0.0);
    vec3 off = wp + n * 0.02;
    // near cascade spans 500 m of depth: 0.00006 ~ 3 cm of bias
    float s = sampleShadow(uShadow0, uShadowMat0, off, 0.00006 + 0.00016 * (1.0 - ndl));
    if (s >= 0.0) return s;
    s = sampleShadow(uShadow1, uShadowMat1, wp + n * 0.3, 0.0006 + 0.0012 * (1.0 - ndl));
    return s >= 0.0 ? s : 1.0;
}

void main() {
    Surface s;
    s.albedo = vColor.rgb;
    s.alpha = vColor.a;
    s.rough = vMat.x;
    s.metal = vMat.y;
    s.n = normalize(vNormal);
    if (!gl_FrontFacing) s.n = -s.n;
    int pat = int(vMat.w + 0.5);
    s.emissive = s.albedo * vMat.z;
    applyPattern(pat, s, vWorldPos, vUV);
    float furAmount = 0.0;
    if (pat == 22) {   // animal coat
        int region = int(vUV.x + 0.5);
        float furMask;
        s.albedo = coatAlbedo(vBindPos, region, vUV.y, vColor.a, furMask);
        s.emissive = vec3(0.0);
        furAmount = furMask * step(0.001, vMat.z);
        // Fine hair strands: tiny brightness variation that follows the body
        float strand = vnoise3(vBindPos * vec3(900.0, 300.0, 900.0));
        s.albedo *= mix(1.0, 0.86 + 0.28 * strand, furAmount);
        // Fur shells: each shell keeps only the hairs tall enough to reach it
        if (uShell > 0.0) {
            vec3 hc = vBindPos * 520.0;
            float hair = hash13(floor(hc));
            // strands taper toward their tips
            float r = length(fract(hc) - 0.5);
            if (hair < uShell * 0.9 || furAmount < 0.5 || r > 0.62 - 0.3 * uShell) discard;
            s.albedo *= mix(0.84, 1.03, uShell);
            if (uCoatPattern == 19 || uCoatPattern == 20) s.albedo = mix(s.albedo, uCoatPattern == 19 ? uCoatB : uCoatC, uShell * 0.45);   // ticked / roan hair tips
        } else {
            s.albedo *= mix(1.0, 0.78, furAmount);    // skin layer: darker roots under the fur
        }
        // Wound: wet blood, glossy
        if (uWound.w > 0.0) {
            float d = length(vBindPos - uWound.xyz) / uWound.w;
            float wound = smoothstep(1.0, 0.6, d + (vnoise3(vBindPos * 60.0) - 0.5) * 0.4);
            s.albedo = mix(s.albedo, mix(vec3(0.30, 0.02, 0.02), vec3(0.12, 0.0, 0.0), smoothstep(0.5, 0.0, d)), wound * (0.5 + 0.5 * uWet));
            s.rough = mix(s.rough, 0.12, wound * uWet);
            if (uShell > 0.0 && wound > 0.3) discard;   // fur shaved/matted at the wound
        }
    }

    vec3 N = s.n;
    vec3 V = normalize(uCamPos - vWorldPos);

    bool indoor = all(greaterThan(vWorldPos, uIndoorMin)) && all(lessThan(vWorldPos, uIndoorMax));
    float skyVis = indoor ? 0.10 : 1.0;

    vec3 color = vec3(0.0);
    // Sun / moon
    float sh = shadowFactor(vWorldPos, N);
    color += brdf(s, N, V, uSunDir, uSunColor) * sh;
    // Hemispherical sky ambient (+ cheap specular reflection of the sky)
    float hemi = N.y * 0.5 + 0.5;
    vec3 ambient = mix(uGroundAmbient, uSkyZenith * 1.2 + uSkyHorizon * 0.3, hemi) * skyVis;
    vec3 f0 = mix(vec3(0.04), s.albedo, s.metal);
    color += ambient * s.albedo * (1.0 - s.metal);
    vec3 R = reflect(-V, N);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
    color += skyRadiance(R) * (f0 + (1.0 - f0) * fres) * (1.0 - s.rough) * 0.35 * skyVis;
    // Point lights (indoor ceiling lights, lamp posts)
#ifdef LOW_QUALITY
    const int POINT_LOOP = 6;   // phones: nearest 6 lights
#else
    const int POINT_LOOP = MAX_POINT;
#endif
    for (int i = 0; i < POINT_LOOP; ++i) {
        if (i >= uNumPoint) break;
        vec3 lv = uPointPos[i].xyz - vWorldPos;
        float d2 = dot(lv, lv);
        float r = uPointPos[i].w;
        float win = clamp(1.0 - (d2 * d2) / (r * r * r * r), 0.0, 1.0);
        float att = win * win / (d2 + 0.25);
        if (att <= 0.0) continue;
        vec3 L = lv * inversesqrt(d2);
        color += brdf(s, N, V, L, uPointColor[i].rgb * att);
        // bounce light so rooms aren't pitch black in corners
        color += uPointColor[i].rgb * att * s.albedo * 0.06;
    }
    color += s.emissive;
    if (furAmount > 0.0) {   // fur sheen: soft light scattering at grazing angles
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        color += (uSunColor * max(dot(N, uSunDir) * 0.5 + 0.5, 0.0) * 0.06 + ambient * 0.25) * s.albedo * rim * furAmount;
    }

    if (pat == 13) {   // glass: reflective, mostly transparent
        vec3 refl = skyRadiance(R) * skyVis;
        color = mix(color * 0.2, refl, 0.08 + 0.9 * fres);
        s.alpha = clamp(0.18 + fres * 0.7, 0.0, 0.9);
    }

    color = applyFog(color, vWorldPos);
    fragColor = vec4(color, uTransparentPass > 0.5 ? s.alpha : 1.0);
    gl_FragDepth = logDepth(vW);
}
