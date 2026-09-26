// ============================================================================
//  MOOR3D — procedural material generation
//
//  Every texture in the game is synthesised on the GPU at load: no image
//  files, nothing to download. Four materials are rendered into a
//  GL_TEXTURE_2D_ARRAY at a user-selected resolution (512 … 8192 per layer),
//  with albedo+roughness in one target and a tangent-space normal in another.
//
//  Memory is the whole story at these sizes. Per layer, RGBA8 + RG8 with
//  mips is ~8 bytes/texel * 1.33:
//      1K  ->   45 MB     4K  ->  716 MB
//      2K  ->  179 MB     8K  -> 2.9 GB   (most GPUs will refuse this)
//  So generation always verifies the allocation and steps down on failure
//  rather than handing the renderer a dead texture.
// ============================================================================
#pragma once
#include <GLES3/gl3.h>
#include <cstdio>
#include "gl.h"

namespace texgen {

enum MatLayer : int {
  MAT_VEG = 0,      // grass, foliage, ground cover
  MAT_ROCK,         // stone, mountain, cliff
  MAT_SAND,         // beach, dirt
  MAT_MANMADE,      // asphalt, concrete, render
  MAT_COUNT
};

// ---------------------------------------------------------------------------
//  Generation shader. One fullscreen pass per layer, two colour attachments.
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
uniform float uTexel;          // 1.0 / size, for the normal derivative
layout(location=0) out vec4 oAlbedo;   // rgb = albedo, a = roughness
layout(location=1) out vec4 oNormal;   // rg = tangent-space xy, b = height, a = ao

// ---- hash / noise, all tiling so the texture wraps seamlessly
vec2 hash2(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
}
float hash1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// gradient noise on a repeating lattice of period `per`
float gnoise(vec2 p, float per){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 a = mod(i,               vec2(per));
  vec2 b = mod(i + vec2(1,0),   vec2(per));
  vec2 c = mod(i + vec2(0,1),   vec2(per));
  vec2 d = mod(i + vec2(1,1),   vec2(per));
  float n00 = dot(hash2(a), f);
  float n10 = dot(hash2(b), f - vec2(1,0));
  float n01 = dot(hash2(c), f - vec2(0,1));
  float n11 = dot(hash2(d), f - vec2(1,1));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y) * 0.5 + 0.5;
}
float fbm(vec2 p, float per, int oct){
  float s = 0.0, a = 0.5, tot = 0.0, f = 1.0;
  for(int i = 0; i < 8; i++){
    if(i >= oct) break;
    s += a * gnoise(p * f, per * f);
    tot += a; a *= 0.5; f *= 2.0;
  }
  return s / tot;
}
// tiling worley — cell structure for stones and cracks
float worley(vec2 p, float per){
  vec2 i = floor(p), f = fract(p);
  float d = 1e9;
  for(int y = -1; y <= 1; y++){
    for(int x = -1; x <= 1; x++){
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(mod(i + g, vec2(per))) * 0.5 + 0.5;
      d = min(d, length(g + o - f));
    }
  }
  return d;
}

// ---- height field per material; the normal is its derivative
float heightOf(vec2 uv, int layer){
  if(layer == 0){            // vegetation: clumped blades
    float base  = fbm(uv * 14.0, 14.0, 5);
    float blade = fbm(uv * 150.0, 150.0, 3);
    float clump = fbm(uv * 5.0, 5.0, 3);
    return base * 0.45 + blade * 0.40 + clump * 0.15;
  } else if(layer == 1){     // rock: cracked plates with grain
    float plate = 1.0 - worley(uv * 9.0, 9.0);
    float crack = smoothstep(0.55, 0.95, plate);
    float grain = fbm(uv * 70.0, 70.0, 4);
    float ridge = abs(fbm(uv * 20.0, 20.0, 5) * 2.0 - 1.0);
    return crack * 0.45 + grain * 0.22 + (1.0 - ridge) * 0.33;
  } else if(layer == 2){     // sand: wind ripples plus fine grain
    float ripple = sin((uv.x * 46.0 + fbm(uv * 8.0, 8.0, 3) * 7.0)) * 0.5 + 0.5;
    float grain  = fbm(uv * 190.0, 190.0, 3);
    float dune   = fbm(uv * 4.0, 4.0, 4);
    return ripple * 0.34 + grain * 0.26 + dune * 0.40;
  }
  // manmade: aggregate speckle in a binder, with a faint slab grid
  float aggregate = 1.0 - worley(uv * 78.0, 78.0);
  float pebble    = 1.0 - worley(uv * 34.0, 34.0);
  float speck     = fbm(uv * 300.0, 300.0, 3);
  float mottle    = fbm(uv * 16.0, 16.0, 3);
  vec2  g         = abs(fract(uv * 4.0) - 0.5);
  float seam      = smoothstep(0.455, 0.50, max(g.x, g.y));
  return aggregate * 0.34 + pebble * 0.20 + speck * 0.28 + mottle * 0.18 - seam * 0.30;
}

void main(){
  vec2 uv = vUV;
  int L = uLayer;

  float h  = heightOf(uv, L);
  // central differences in texel space -> tangent-space normal
  float e  = uTexel * 2.0;
  float hx = heightOf(uv + vec2(e, 0.0), L) - heightOf(uv - vec2(e, 0.0), L);
  float hy = heightOf(uv + vec2(0.0, e), L) - heightOf(uv - vec2(0.0, e), L);
  float strength = (L == 1) ? 3.4 : (L == 0) ? 2.2 : (L == 2) ? 1.5 : 2.0;
  vec3 n = normalize(vec3(-hx * strength / max(e, 1e-6) * 0.0016,
                          -hy * strength / max(e, 1e-6) * 0.0016, 1.0));

  vec3  albedo;
  float rough;
  if(L == 0){
    // grass: hue and dryness vary in patches
    float dry   = fbm(uv * 6.0, 6.0, 4);
    float blotch = fbm(uv * 2.5, 2.5, 3);
    vec3 lush = vec3(0.16, 0.33, 0.11);
    vec3 pale = vec3(0.38, 0.40, 0.17);
    albedo = mix(lush, pale, smoothstep(0.35, 0.72, dry));
    albedo *= 0.80 + h * 0.45;
    albedo = mix(albedo, vec3(0.20, 0.24, 0.12), smoothstep(0.62, 0.95, blotch) * 0.45);
    rough  = 0.86 - h * 0.10;
  } else if(L == 1){
    float mineral = fbm(uv * 17.0, 17.0, 4);
    vec3 grey  = vec3(0.34, 0.33, 0.31);
    vec3 warm  = vec3(0.42, 0.36, 0.30);
    albedo = mix(grey, warm, mineral);
    albedo *= 0.72 + h * 0.52;
    // darker in the cracks
    albedo *= mix(0.62, 1.0, smoothstep(0.05, 0.40, h));
    rough  = 0.90 - h * 0.12;
  } else if(L == 2){
    float wet = fbm(uv * 3.0, 3.0, 3);
    vec3 pale = vec3(0.60, 0.54, 0.40);
    vec3 dark = vec3(0.42, 0.36, 0.26);
    albedo = mix(dark, pale, smoothstep(0.30, 0.75, wet));
    albedo *= 0.86 + h * 0.26;
    rough  = 0.80 + h * 0.10;
  } else {
    float tone = fbm(uv * 14.0, 14.0, 3);
    vec3 asphalt  = vec3(0.115, 0.118, 0.126);
    vec3 concrete = vec3(0.315, 0.315, 0.305);
    albedo = mix(asphalt, concrete, smoothstep(0.38, 0.66, tone));
    // exposed aggregate flecks
    float fleck = smoothstep(0.66, 0.92, fbm(uv * 330.0, 330.0, 2));
    albedo = mix(albedo, vec3(0.52, 0.50, 0.47), fleck * 0.50);
    float dark = smoothstep(0.70, 0.95, 1.0 - worley(uv * 78.0, 78.0));
    albedo *= mix(1.0, 0.78, dark);
    albedo *= 0.84 + h * 0.30;
    rough  = 0.74 + h * 0.18;
  }

  // cheap cavity term: low spots are darker and occluded
  float ao = clamp(0.55 + h * 0.55, 0.0, 1.0);

  oAlbedo = vec4(clamp(albedo, 0.0, 1.0), clamp(rough, 0.04, 1.0));
  oNormal = vec4(n.xy * 0.5 + 0.5, h, ao);
}
)";

// ---------------------------------------------------------------------------
//  The material array
// ---------------------------------------------------------------------------
struct MaterialArray {
  GLuint albedo = 0, normal = 0;
  GLuint fbo = 0;
  int    size = 0;
  bool   ready = false;

  // Bytes this configuration will occupy on the GPU, mips included.
  static double megabytes(int s){
    double texels = (double)s * (double)s * (double)MAT_COUNT * 1.334;
    return texels * (4.0 + 4.0) / (1024.0 * 1024.0);
  }

  void destroy(){
    if(albedo){ glDeleteTextures(1, &albedo); albedo = 0; }
    if(normal){ glDeleteTextures(1, &normal); normal = 0; }
    if(fbo){ glDeleteFramebuffers(1, &fbo); fbo = 0; }
    ready = false;
  }

  static int mipLevels(int s){
    int n = 1;
    while(s > 1){ s >>= 1; n++; }
    return n;
  }

  // Largest anisotropy the driver offers, or 1 if the extension is absent.
  static float maxAniso(){
    static float a = -1.0f;
    if(a < 0.0f){
      a = 1.0f;
      GLfloat v = 1.0f;
      while(glGetError() != GL_NO_ERROR) {}
      glGetFloatv(0x84FF /* MAX_TEXTURE_MAX_ANISOTROPY_EXT */, &v);
      // Cap at 4x. 16x costs far more than it returns here and was the
      // difference between playable and a slideshow on modest hardware.
      if(glGetError() == GL_NO_ERROR && v > 1.0f) a = v < 4.0f ? v : 4.0f;
    }
    return a;
  }

  static GLuint makeArray(int s, GLenum internalFmt){
    GLuint t = 0;
    glGenTextures(1, &t);
    glBindTexture(GL_TEXTURE_2D_ARRAY, t);
    while(glGetError() != GL_NO_ERROR) {}
    glTexStorage3D(GL_TEXTURE_2D_ARRAY, mipLevels(s), internalFmt, s, s, MAT_COUNT);
    if(glGetError() != GL_NO_ERROR){
      glDeleteTextures(1, &t);
      return 0;
    }
    // Trilinear + anisotropic: terrain at a grazing angle is where a texture
    // either looks sharp or turns into shimmering noise.
    glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);
    glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_T, GL_REPEAT);
    float aniso = maxAniso();
    if(aniso > 1.0f) glTexParameterf(GL_TEXTURE_2D_ARRAY, 0x84FE /* TEXTURE_MAX_ANISOTROPY_EXT */, aniso);
    return t;
  }

  // How much VRAM we are willing to ask a browser tab for. Going past this
  // does not merely fail — on several drivers the oversized allocation loses
  // the WebGL context outright, which kills the page. So the cap is enforced
  // BEFORE the request is made, not discovered by crashing into it.
  static double budgetMB(){ return 900.0; }

  static int largestWithinBudget(int want){
    int s = want;
    while(s > 256 && megabytes(s) > budgetMB()) s /= 2;
    return s;
  }

  // Try `want`, halving on failure, never below 256.
  bool generate(int want, const gfx::Program& gen, const gfx::FullscreenQuad& quad){
    destroy();
    GLint maxLayers = 0, maxSize = 0;
    glGetIntegerv(GL_MAX_ARRAY_TEXTURE_LAYERS, &maxLayers);
    glGetIntegerv(GL_MAX_TEXTURE_SIZE, &maxSize);
    if(maxSize <= 0){
      printf("[texgen] no usable GL context (MAX_TEXTURE_SIZE=%d)\n", maxSize);
      return false;
    }
    if(want > maxSize){
      printf("[texgen] %d requested but GL_MAX_TEXTURE_SIZE is %d — clamping\n", want, maxSize);
      want = maxSize;
    }
    int capped = largestWithinBudget(want);
    if(capped < want){
      printf("[texgen] %d x%d layers would need ~%.0f MB, over the %.0f MB budget — using %d\n",
             want, MAT_COUNT, megabytes(want), budgetMB(), capped);
      want = capped;
    }

    int s = want;
    while(s >= 256){
      albedo = makeArray(s, GL_RGBA8);
      normal = makeArray(s, GL_RGBA8);
      if(albedo && normal) break;
      printf("[texgen] %dx%d x%d allocation refused (~%.0f MB) — stepping down\n",
             s, s, MAT_COUNT, megabytes(s));
      destroy();
      s /= 2;
    }
    if(!albedo || !normal){
      printf("[texgen] could not allocate any material array\n");
      return false;
    }

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
      GLenum st = glCheckFramebufferStatus(GL_FRAMEBUFFER);
      if(st != GL_FRAMEBUFFER_COMPLETE){
        printf("[texgen] layer %d framebuffer incomplete 0x%04x\n", layer, st);
        glBindFramebuffer(GL_FRAMEBUFFER, 0);
        return false;
      }
      gen.set("uLayer", layer);
      quad.draw();
    }

    glBindFramebuffer(GL_FRAMEBUFFER, 0);

    glBindTexture(GL_TEXTURE_2D_ARRAY, albedo);
    glGenerateMipmap(GL_TEXTURE_2D_ARRAY);
    glBindTexture(GL_TEXTURE_2D_ARRAY, normal);
    glGenerateMipmap(GL_TEXTURE_2D_ARRAY);

    ready = true;
    printf("[texgen] %d materials at %dx%d, %d mips, aniso %.0fx (~%.0f MB VRAM)\n",
           MAT_COUNT, size, size, mipLevels(size), maxAniso(), megabytes(size));
    return true;
  }

  void bind(int albedoUnit, int normalUnit) const {
    glActiveTexture(GL_TEXTURE0 + albedoUnit);
    glBindTexture(GL_TEXTURE_2D_ARRAY, albedo);
    glActiveTexture(GL_TEXTURE0 + normalUnit);
    glBindTexture(GL_TEXTURE_2D_ARRAY, normal);
  }
};

} // namespace texgen
