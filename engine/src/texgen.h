// ============================================================================
//  MOOR3D — material library
//
//  Twelve materials, each generated on the GPU into a texture array layer.
//  The engine will prefer real photoscanned PBR maps when they are supplied
//  (see loadExternal / site/moor/tex/), and falls back to these when they
//  are not.
//
//  The point of twelve rather than four: a city with one grey concrete on
//  every surface reads as a greybox no matter how good that concrete is.
//  Variety does more for believability than resolution does.
// ============================================================================
#pragma once
#include <GLES3/gl3.h>
#include <cstdio>
#include "gl.h"

namespace texgen {

enum MatLayer : int {
  MAT_GRASS = 0,
  MAT_ROCK,
  MAT_SAND,
  MAT_ASPHALT,
  MAT_CONCRETE,
  MAT_BRICK,
  MAT_STUCCO,
  MAT_PANEL,       // office cladding
  MAT_METAL,
  MAT_WOOD,
  MAT_GRAVEL,
  MAT_DIRT,
  MAT_COUNT
};

// Mean albedo per layer. The shader divides by this so a material contributes
// variation around 1.0 rather than replacing the surface colour.
//
// These are only fallbacks: generate() MEASURES the real mean by reading the
// 1x1 top mip of each layer, which is exactly its average. Guessing these by
// hand skewed every brick wall towards grey-purple.
inline float* layerMeans(){
  static float m[MAT_COUNT * 3] = {
    0.23f, 0.30f, 0.14f,   // grass
    0.34f, 0.32f, 0.30f,   // rock
    0.49f, 0.44f, 0.33f,   // sand
    0.14f, 0.14f, 0.15f,   // asphalt
    0.37f, 0.36f, 0.35f,   // concrete
    0.33f, 0.21f, 0.17f,   // brick
    0.52f, 0.50f, 0.47f,   // stucco
    0.40f, 0.41f, 0.43f,   // panel
    0.38f, 0.39f, 0.41f,   // metal
    0.33f, 0.24f, 0.15f,   // wood
    0.33f, 0.31f, 0.28f,   // gravel
    0.26f, 0.20f, 0.14f    // dirt
  };
  return m;
}

// How many metres one tile of each material should cover.
inline float layerScale(int layer){
  switch(layer){
    case MAT_GRASS:    return 3.0f;
    case MAT_ROCK:     return 4.5f;
    case MAT_SAND:     return 2.5f;
    case MAT_ASPHALT:  return 3.2f;
    case MAT_CONCRETE: return 3.6f;
    case MAT_BRICK:    return 2.4f;   // a brick course must read at real size
    case MAT_STUCCO:   return 4.0f;
    case MAT_PANEL:    return 3.0f;
    case MAT_METAL:    return 2.2f;
    case MAT_WOOD:     return 2.0f;
    case MAT_GRAVEL:   return 2.0f;
    case MAT_DIRT:     return 3.0f;
    default:           return 3.0f;
  }
}

// ---------------------------------------------------------------------------
//  Generation shader
// ---------------------------------------------------------------------------
static const char* GEN_VS = R"(#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
)";

static const char* GEN_FS = R"(#version 300 es
precision highp float;
in vec2 vUV;
uniform int   uLayer;
uniform float uTexel;
layout(location=0) out vec4 oAlbedo;   // rgb albedo, a roughness
layout(location=1) out vec4 oNormal;   // rg normal.xy, b height, a cavity

// ---------------- tiling noise -------------------------------------------
vec2 hash2(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
}
float hash1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float gnoise(vec2 p, float per){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float n00 = dot(hash2(mod(i,             vec2(per))), f);
  float n10 = dot(hash2(mod(i + vec2(1,0), vec2(per))), f - vec2(1,0));
  float n01 = dot(hash2(mod(i + vec2(0,1), vec2(per))), f - vec2(0,1));
  float n11 = dot(hash2(mod(i + vec2(1,1), vec2(per))), f - vec2(1,1));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y) * 0.5 + 0.5;
}
float fbm(vec2 p, float per, int oct){
  float s = 0.0, a = 0.5, tot = 0.0, f = 1.0;
  for(int i = 0; i < 8; i++){
    if(i >= oct) break;
    s += a * gnoise(p * f, per * f); tot += a; a *= 0.5; f *= 2.0;
  }
  return s / tot;
}
float worley(vec2 p, float per){
  vec2 i = floor(p), f = fract(p);
  float d = 1e9;
  for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y));
    vec2 o = hash2(mod(i + g, vec2(per))) * 0.5 + 0.5;
    d = min(d, length(g + o - f));
  }
  return d;
}
// second-nearest minus nearest: gives clean cell BORDERS, for cracks
float worleyEdge(vec2 p, float per){
  vec2 i = floor(p), f = fract(p);
  float d1 = 1e9, d2 = 1e9;
  for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y));
    vec2 o = hash2(mod(i + g, vec2(per))) * 0.5 + 0.5;
    float d = length(g + o - f);
    if(d < d1){ d2 = d1; d1 = d; } else if(d < d2){ d2 = d; }
  }
  return d2 - d1;
}
// which cell am I in — used for per-brick / per-plank variation
vec2 cellId(vec2 p, float per){
  vec2 i = floor(p); float d = 1e9; vec2 best = i;
  for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y));
    vec2 c = mod(i + g, vec2(per));
    vec2 o = hash2(c) * 0.5 + 0.5;
    float dd = length(g + o - fract(p));
    if(dd < d){ d = dd; best = c; }
  }
  return best;
}

// ---------------- brick / plank helpers -----------------------------------
// returns: x = inside-brick mask, yz = brick cell id, w = distance to mortar
vec4 runningBond(vec2 uv, float cols, float rows, float mortar){
  vec2 bp = uv * vec2(cols, rows);
  float row = floor(bp.y);
  bp.x += mod(row, 2.0) * 0.5;          // stagger alternate courses
  vec2 cell = floor(bp);
  vec2 f = fract(bp);
  // aspect-correct mortar width
  float mx = mortar * 0.5, my = mortar * (cols / rows) * 0.5;
  float ex = min(f.x, 1.0 - f.x), ey = min(f.y, 1.0 - f.y);
  float inside = smoothstep(0.0, mx, ex) * smoothstep(0.0, my, ey);
  float edge   = min(ex / max(mx, 1e-4), ey / max(my, 1e-4));
  return vec4(inside, mod(cell.x, cols), mod(cell.y, rows), edge);
}

// ---------------- height per material --------------------------------------
float heightOf(vec2 uv, int L){
  if(L == 0){                                     // GRASS
    float base  = fbm(uv * 14.0, 14.0, 5);
    float blade = fbm(uv * 165.0, 165.0, 3);
    float clump = fbm(uv * 5.0, 5.0, 3);
    return base * 0.40 + blade * 0.44 + clump * 0.16;
  }
  if(L == 1){                                     // ROCK
    float plate = 1.0 - worley(uv * 8.0, 8.0);
    float crack = smoothstep(0.02, 0.14, worleyEdge(uv * 8.0, 8.0));
    float grain = fbm(uv * 85.0, 85.0, 4);
    float ridge = abs(fbm(uv * 18.0, 18.0, 5) * 2.0 - 1.0);
    return plate * 0.30 + crack * 0.26 + grain * 0.20 + (1.0 - ridge) * 0.24;
  }
  if(L == 2){                                     // SAND
    float ripple = sin(uv.x * 52.0 + fbm(uv * 7.0, 7.0, 3) * 9.0) * 0.5 + 0.5;
    float grain  = fbm(uv * 230.0, 230.0, 3);
    float dune   = fbm(uv * 3.5, 3.5, 4);
    return ripple * 0.30 + grain * 0.28 + dune * 0.42;
  }
  if(L == 3){                                     // ASPHALT
    float agg   = 1.0 - worley(uv * 96.0, 96.0);
    float chip  = 1.0 - worley(uv * 44.0, 44.0);
    float grain = fbm(uv * 320.0, 320.0, 3);
    float crack = 1.0 - smoothstep(0.0, 0.035, worleyEdge(uv * 5.0, 5.0));
    return agg * 0.40 + chip * 0.18 + grain * 0.32 - crack * 0.30;
  }
  if(L == 4){                                     // CONCRETE
    float agg   = 1.0 - worley(uv * 70.0, 70.0);
    float grain = fbm(uv * 260.0, 260.0, 3);
    float broad = fbm(uv * 6.0, 6.0, 4);
    vec2 g = abs(fract(uv * 3.0) - 0.5);
    float seam = smoothstep(0.455, 0.50, max(g.x, g.y));
    float chip = smoothstep(0.80, 1.0, 1.0 - worley(uv * 20.0, 20.0));
    return agg * 0.30 + grain * 0.28 + broad * 0.26 - seam * 0.34 - chip * 0.12;
  }
  if(L == 5){                                     // BRICK
    vec4 b = runningBond(uv, 7.0, 16.0, 0.13);
    float face = fbm(uv * 150.0, 150.0, 3) * 0.22;
    float wear = fbm(uv * 40.0, 40.0, 3) * 0.10;
    return b.x * (0.72 + face + wear) + 0.06;
  }
  if(L == 6){                                     // STUCCO
    float trowel = fbm(uv * 26.0, 26.0, 4);
    float fine   = fbm(uv * 170.0, 170.0, 3);
    float crackl = 1.0 - smoothstep(0.0, 0.022, worleyEdge(uv * 13.0, 13.0));
    return trowel * 0.52 + fine * 0.40 - crackl * 0.16;
  }
  if(L == 7){                                     // PANEL (office cladding)
    vec2 p = uv * vec2(5.0, 9.0);
    vec2 f = abs(fract(p) - 0.5);
    float seam = smoothstep(0.40, 0.49, max(f.x, f.y));
    float bow  = fbm(uv * 9.0, 9.0, 3) * 0.30;       // slight panel bowing
    float tex  = fbm(uv * 190.0, 190.0, 2) * 0.10;
    // rivets along the seams
    vec2 rp = fract(uv * vec2(5.0, 9.0) * 2.0);
    float rivet = smoothstep(0.42, 0.30, length(rp - 0.5)) * seam;
    return 0.55 + bow + tex - seam * 0.42 + rivet * 0.22;
  }
  if(L == 8){                                     // METAL
    float brush = fbm(vec2(uv.x * 420.0, uv.y * 12.0), 420.0, 3);
    float dent  = fbm(uv * 15.0, 15.0, 4);
    float scr   = smoothstep(0.76, 0.98, fbm(vec2(uv.x * 260.0, uv.y * 30.0), 260.0, 2));
    return 0.55 + brush * 0.16 + dent * 0.26 - scr * 0.12;
  }
  if(L == 9){                                     // WOOD
    vec2 p = uv * vec2(6.0, 1.0);
    float plank = floor(p.x);
    float off   = hash1(vec2(plank, 3.0)) * 0.6;
    float grain = fbm(vec2(uv.x * 26.0, uv.y * 200.0 + off * 40.0), 200.0, 4);
    float rings = sin((uv.y * 26.0 + grain * 7.0 + off * 10.0) * 3.14159) * 0.5 + 0.5;
    float f = abs(fract(p.x) - 0.5);
    float gap = smoothstep(0.44, 0.50, f);
    return 0.52 + rings * 0.26 + grain * 0.20 - gap * 0.40;
  }
  if(L == 10){                                    // GRAVEL
    float s1 = 1.0 - worley(uv * 30.0, 30.0);
    float s2 = 1.0 - worley(uv * 62.0, 62.0);
    float s3 = fbm(uv * 180.0, 180.0, 3);
    return s1 * 0.46 + s2 * 0.32 + s3 * 0.22;
  }
  // DIRT
  float lumps = 1.0 - worley(uv * 22.0, 22.0);
  float fine  = fbm(uv * 150.0, 150.0, 4);
  float crack = 1.0 - smoothstep(0.0, 0.030, worleyEdge(uv * 9.0, 9.0));
  float stone = smoothstep(0.86, 1.0, 1.0 - worley(uv * 55.0, 55.0));
  return lumps * 0.34 + fine * 0.34 - crack * 0.20 + stone * 0.26;
}

// ---------------- albedo + roughness ---------------------------------------
void shadeOf(vec2 uv, int L, float h, out vec3 albedo, out float rough){
  // shared grime field: real surfaces are never uniformly clean
  float grime  = fbm(uv * 3.3, 3.3, 4);
  float streak = fbm(vec2(uv.x * 7.0, uv.y * 0.7), 7.0, 4);

  if(L == 0){                                     // GRASS
    float dry = fbm(uv * 6.0, 6.0, 4);
    vec3 lush = vec3(0.14, 0.31, 0.10);
    vec3 pale = vec3(0.36, 0.38, 0.16);
    vec3 soil = vec3(0.21, 0.16, 0.11);
    albedo = mix(lush, pale, smoothstep(0.30, 0.80, dry) * 0.80);
    albedo = mix(soil, albedo, smoothstep(0.18, 0.46, h));   // earth between blades
    albedo *= 0.84 + h * 0.34;
    rough = 0.88 - h * 0.08;
  } else if(L == 1){                              // ROCK
    float mineral = fbm(uv * 15.0, 15.0, 4);
    float lichen  = smoothstep(0.62, 0.90, fbm(uv * 26.0, 26.0, 4));
    albedo = mix(vec3(0.32, 0.31, 0.30), vec3(0.44, 0.38, 0.32), mineral);
    albedo = mix(albedo, vec3(0.30, 0.36, 0.24), lichen * 0.45);
    albedo *= 0.66 + h * 0.60;
    rough = 0.90 - h * 0.10;
  } else if(L == 2){                              // SAND
    float wet = fbm(uv * 3.0, 3.0, 3);
    albedo = mix(vec3(0.40, 0.34, 0.25), vec3(0.62, 0.56, 0.42), smoothstep(0.30, 0.75, wet));
    albedo *= 0.88 + h * 0.22;
    float shell = smoothstep(0.93, 1.0, fbm(uv * 300.0, 300.0, 2));
    albedo = mix(albedo, vec3(0.82, 0.78, 0.72), shell * 0.6);
    rough = 0.82 + h * 0.08;
  } else if(L == 3){                              // ASPHALT
    albedo = vec3(0.125, 0.127, 0.134);
    float agg = smoothstep(0.55, 0.95, 1.0 - worley(uv * 96.0, 96.0));
    albedo = mix(albedo, vec3(0.34, 0.33, 0.31), agg * 0.55);     // exposed stone
    // tar patches and old repairs
    float repair = smoothstep(0.58, 0.72, fbm(uv * 4.0, 4.0, 3));
    albedo = mix(albedo, vec3(0.085, 0.086, 0.092), repair * 0.7);
    albedo *= 0.90 + h * 0.18;
    rough = 0.80 - agg * 0.18;
  } else if(L == 4){                              // CONCRETE
    float tone = fbm(uv * 2.4, 2.4, 3);
    albedo = mix(vec3(0.33, 0.33, 0.325), vec3(0.44, 0.435, 0.425), smoothstep(0.35, 0.68, tone));
    albedo *= 0.88 + h * 0.22;
    // weathering: dirt collects in the seams and streaks downward
    albedo *= mix(1.0, 0.74, smoothstep(0.45, 0.85, grime));
    albedo *= mix(1.0, 0.86, smoothstep(0.55, 0.95, streak));
    rough = 0.80 + h * 0.12;
  } else if(L == 5){                              // BRICK
    vec4 b = runningBond(uv, 7.0, 16.0, 0.13);
    float r = hash1(vec2(b.y, b.z));
    float r2 = hash1(vec2(b.z, b.y) + 7.3);
    // per-brick colour: reds through browns, the odd pale one
    vec3 brickA = vec3(0.52, 0.20, 0.13);
    vec3 brickB = vec3(0.37, 0.16, 0.12);
    vec3 brickC = vec3(0.56, 0.37, 0.26);
    vec3 brick = mix(brickA, brickB, r);
    brick = mix(brick, brickC, step(0.86, r2) * 0.8);
    brick *= 0.80 + fbm(uv * 120.0, 120.0, 3) * 0.40;
    vec3 mortar = vec3(0.56, 0.55, 0.52) * (0.80 + fbm(uv * 180.0, 180.0, 2) * 0.35);
    albedo = mix(mortar, brick, b.x);
    albedo *= mix(1.0, 0.72, smoothstep(0.50, 0.90, grime));
    albedo *= mix(1.0, 0.85, smoothstep(0.60, 0.95, streak));
    rough = mix(0.86, 0.76, b.x);
  } else if(L == 6){                              // STUCCO
    float tone = fbm(uv * 2.0, 2.0, 3);
    albedo = mix(vec3(0.50, 0.48, 0.45), vec3(0.60, 0.58, 0.54), tone);
    albedo *= 0.88 + h * 0.20;
    // rain streaking is what makes render read as a real wall
    albedo *= mix(1.0, 0.70, smoothstep(0.52, 0.95, streak));
    albedo *= mix(1.0, 0.80, smoothstep(0.55, 0.92, grime));
    rough = 0.84 + h * 0.10;
  } else if(L == 7){                              // PANEL
    vec2 p = uv * vec2(5.0, 9.0);
    vec2 c = floor(p);
    float r = hash1(c);
    albedo = mix(vec3(0.36, 0.38, 0.41), vec3(0.46, 0.47, 0.49), r);
    albedo *= 0.90 + h * 0.18;
    vec2 f = abs(fract(p) - 0.5);
    float seam = smoothstep(0.40, 0.49, max(f.x, f.y));
    albedo *= mix(1.0, 0.56, seam);
    albedo *= mix(1.0, 0.86, smoothstep(0.58, 0.95, streak));
    rough = mix(0.46, 0.70, seam);
  } else if(L == 8){                              // METAL
    albedo = vec3(0.38, 0.39, 0.41) * (0.86 + h * 0.26);
    float rust = smoothstep(0.70, 0.95, fbm(uv * 8.0, 8.0, 4));
    albedo = mix(albedo, vec3(0.32, 0.17, 0.09), rust * 0.55);
    rough = mix(0.34, 0.80, rust);
  } else if(L == 9){                              // WOOD
    vec2 p = uv * vec2(6.0, 1.0);
    float plank = floor(p.x);
    float r = hash1(vec2(plank, 11.0));
    vec3 light = vec3(0.42, 0.29, 0.17);
    vec3 dark  = vec3(0.26, 0.17, 0.10);
    albedo = mix(dark, light, r * 0.7 + h * 0.5);
    float f = abs(fract(p.x) - 0.5);
    albedo *= mix(1.0, 0.35, smoothstep(0.44, 0.50, f));     // dark gaps
    rough = 0.78 + h * 0.12;
  } else if(L == 10){                             // GRAVEL
    float r = hash1(cellId(uv * 30.0, 30.0));
    albedo = mix(vec3(0.27, 0.26, 0.24), vec3(0.44, 0.41, 0.37), r);
    albedo *= 0.70 + h * 0.52;
    rough = 0.90;
  } else {                                        // DIRT
    float tone = fbm(uv * 4.0, 4.0, 3);
    albedo = mix(vec3(0.21, 0.16, 0.11), vec3(0.34, 0.26, 0.18), tone);
    float stone = smoothstep(0.86, 1.0, 1.0 - worley(uv * 55.0, 55.0));
    albedo = mix(albedo, vec3(0.42, 0.40, 0.37), stone * 0.7);
    albedo *= 0.80 + h * 0.38;
    rough = 0.92;
  }
}

void main(){
  vec2 uv = vUV;
  int L = uLayer;

  float h  = heightOf(uv, L);
  float e  = uTexel * 2.0;
  float hx = heightOf(uv + vec2(e, 0.0), L) - heightOf(uv - vec2(e, 0.0), L);
  float hy = heightOf(uv + vec2(0.0, e), L) - heightOf(uv - vec2(0.0, e), L);

  float strength =
      (L == 1) ? 3.6 : (L == 5) ? 3.2 : (L == 10) ? 3.4 :
      (L == 0) ? 2.2 : (L == 2) ? 1.5 : (L == 8) ? 1.2 : 2.2;
  vec3 n = normalize(vec3(-hx * strength / max(e, 1e-6) * 0.0016,
                          -hy * strength / max(e, 1e-6) * 0.0016, 1.0));

  vec3 albedo; float rough;
  shadeOf(uv, L, h, albedo, rough);

  float ao = clamp(0.52 + h * 0.58, 0.0, 1.0);
  oAlbedo = vec4(clamp(albedo, 0.0, 1.0), clamp(rough, 0.04, 1.0));
  oNormal = vec4(n.xy * 0.5 + 0.5, h, ao);
}
)";

// ---------------------------------------------------------------------------
//  Texture array
// ---------------------------------------------------------------------------
struct MaterialArray {
  GLuint albedo = 0, normal = 0;
  GLuint fbo = 0;
  int    size = 0;
  bool   ready = false;
  int    externalLayers = 0;       // how many layers came from real scans

  static double megabytes(int s){
    double texels = (double)s * (double)s * (double)MAT_COUNT * 1.334;
    return texels * 8.0 / (1024.0 * 1024.0);
  }
  static double budgetMB(){ return 900.0; }
  static int largestWithinBudget(int want){
    int s = want;
    while(s > 256 && megabytes(s) > budgetMB()) s /= 2;
    return s;
  }
  static int mipLevels(int s){ int n = 1; while(s > 1){ s >>= 1; n++; } return n; }

  static float maxAniso(){
    static float a = -1.0f;
    if(a < 0.0f){
      a = 1.0f; GLfloat v = 1.0f;
      while(glGetError() != GL_NO_ERROR) {}
      glGetFloatv(0x84FF, &v);
      if(glGetError() == GL_NO_ERROR && v > 1.0f) a = v < 4.0f ? v : 4.0f;
    }
    return a;
  }

  void destroy(){
    if(albedo){ glDeleteTextures(1, &albedo); albedo = 0; }
    if(normal){ glDeleteTextures(1, &normal); normal = 0; }
    if(fbo){ glDeleteFramebuffers(1, &fbo); fbo = 0; }
    ready = false; externalLayers = 0;
  }

  static GLuint makeArray(int s, GLenum fmt){
    GLuint t = 0;
    glGenTextures(1, &t);
    glBindTexture(GL_TEXTURE_2D_ARRAY, t);
    while(glGetError() != GL_NO_ERROR) {}
    glTexStorage3D(GL_TEXTURE_2D_ARRAY, mipLevels(s), fmt, s, s, MAT_COUNT);
    if(glGetError() != GL_NO_ERROR){ glDeleteTextures(1, &t); return 0; }
    glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);
    glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_T, GL_REPEAT);
    float an = maxAniso();
    if(an > 1.0f) glTexParameterf(GL_TEXTURE_2D_ARRAY, 0x84FE, an);
    return t;
  }

  bool generate(int want, const gfx::Program& gen, const gfx::FullscreenQuad& quad){
    destroy();
    GLint maxSize = 0;
    glGetIntegerv(GL_MAX_TEXTURE_SIZE, &maxSize);
    if(maxSize <= 0){ printf("[texgen] no usable GL context\n"); return false; }
    if(want > maxSize){
      printf("[texgen] %d requested, GL_MAX_TEXTURE_SIZE is %d — clamping\n", want, maxSize);
      want = maxSize;
    }
    int capped = largestWithinBudget(want);
    if(capped < want){
      printf("[texgen] %d x%d layers needs ~%.0f MB, over the %.0f MB budget — using %d\n",
             want, MAT_COUNT, megabytes(want), budgetMB(), capped);
      want = capped;
    }

    int s = want;
    while(s >= 256){
      albedo = makeArray(s, GL_RGBA8);
      normal = makeArray(s, GL_RGBA8);
      if(albedo && normal) break;
      printf("[texgen] %d x%d refused (~%.0f MB) — stepping down\n", s, MAT_COUNT, megabytes(s));
      destroy(); s /= 2;
    }
    if(!albedo || !normal){ printf("[texgen] allocation failed entirely\n"); return false; }

    size = s;
    glGenFramebuffers(1, &fbo);
    glBindFramebuffer(GL_FRAMEBUFFER, fbo);
    const GLenum bufs[2] = { GL_COLOR_ATTACHMENT0, GL_COLOR_ATTACHMENT1 };
    glDrawBuffers(2, bufs);

    gen.use();
    gen.set("uTexel", 1.0f / (float)size);
    glViewport(0, 0, size, size);
    glDisable(GL_DEPTH_TEST);
    glDisable(GL_CULL_FACE);
    glDisable(GL_BLEND);

    for(int layer = 0; layer < MAT_COUNT; layer++){
      glFramebufferTextureLayer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, albedo, 0, layer);
      glFramebufferTextureLayer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT1, normal, 0, layer);
      if(glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE){
        printf("[texgen] layer %d framebuffer incomplete\n", layer);
        glBindFramebuffer(GL_FRAMEBUFFER, 0);
        return false;
      }
      gen.set("uLayer", layer);
      quad.draw();
    }
    glBindFramebuffer(GL_FRAMEBUFFER, 0);

    glBindTexture(GL_TEXTURE_2D_ARRAY, albedo); glGenerateMipmap(GL_TEXTURE_2D_ARRAY);
    glBindTexture(GL_TEXTURE_2D_ARRAY, normal); glGenerateMipmap(GL_TEXTURE_2D_ARRAY);
    measureMeans();

    ready = true;
    printf("[texgen] %d materials at %dx%d, %d mips, aniso %.0fx (~%.0f MB)\n",
           MAT_COUNT, size, size, mipLevels(size), maxAniso(), megabytes(size));
    return true;
  }

  // The top mip of a layer is a single texel holding its average colour.
  // Read it back so the shader normalises against the truth rather than a
  // hand-written guess.
  void measureMeans(){
    if(!albedo || size <= 0) return;
    int top = mipLevels(size) - 1;
    GLuint fb = 0;
    glGenFramebuffers(1, &fb);
    glBindFramebuffer(GL_FRAMEBUFFER, fb);
    const GLenum one[1] = { GL_COLOR_ATTACHMENT0 };
    glDrawBuffers(1, one);
    float* means = layerMeans();
    for(int layer = 0; layer < MAT_COUNT; layer++){
      glFramebufferTextureLayer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, albedo, top, layer);
      if(glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) continue;
      unsigned char px[4] = {0,0,0,0};
      while(glGetError() != GL_NO_ERROR) {}
      glReadPixels(0, 0, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, px);
      if(glGetError() != GL_NO_ERROR) continue;
      // a fully black read means the layer never rendered; keep the fallback
      if(px[0] + px[1] + px[2] == 0) continue;
      means[layer*3+0] = px[0] / 255.0f;
      means[layer*3+1] = px[1] / 255.0f;
      means[layer*3+2] = px[2] / 255.0f;
    }
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glDeleteFramebuffers(1, &fb);
    printf("[texgen] measured layer means from the 1x1 mip\n");
  }

  // Rebuild the mip chain after JS has overwritten a layer with a real scan.
  void refreshMips(){
    if(!ready) return;
    glBindTexture(GL_TEXTURE_2D_ARRAY, albedo); glGenerateMipmap(GL_TEXTURE_2D_ARRAY);
    glBindTexture(GL_TEXTURE_2D_ARRAY, normal); glGenerateMipmap(GL_TEXTURE_2D_ARRAY);
    measureMeans();        // a real scan has a different mean to our synthetic
  }

  void bind(int albedoUnit, int normalUnit) const {
    glActiveTexture(GL_TEXTURE0 + albedoUnit);
    glBindTexture(GL_TEXTURE_2D_ARRAY, albedo);
    glActiveTexture(GL_TEXTURE0 + normalUnit);
    glBindTexture(GL_TEXTURE_2D_ARRAY, normal);
  }
};

} // namespace texgen
