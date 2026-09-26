// ============================================================================
//  MOOR3D — GL utilities: shaders, framebuffers, meshes, instancing
// ============================================================================
#pragma once
#include <GLES3/gl3.h>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
#include "mathx.h"

namespace gfx {

inline void checkGL(const char* where){
  GLenum e = glGetError();
  if(e != GL_NO_ERROR) printf("[GL ERROR 0x%04x] %s\n", e, where);
}

// ---------------------------------------------------------------- shaders
inline GLuint compileStage(GLenum type, const char* src, const char* tag){
  GLuint s = glCreateShader(type);
  glShaderSource(s, 1, &src, nullptr);
  glCompileShader(s);
  GLint ok = 0;
  glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
  if(!ok){
    char log[4096]; GLsizei n = 0;
    glGetShaderInfoLog(s, sizeof(log) - 1, &n, log);
    log[n] = 0;
    printf("[SHADER COMPILE FAILED] %s (%s)\n%s\n",
           tag, type == GL_VERTEX_SHADER ? "vert" : "frag", log);
    glDeleteShader(s);
    return 0;
  }
  return s;
}

struct Program {
  GLuint id = 0;
  std::string tag;

  bool build(const char* vs, const char* fs, const char* name){
    tag = name;
    GLuint v = compileStage(GL_VERTEX_SHADER, vs, name);
    GLuint f = compileStage(GL_FRAGMENT_SHADER, fs, name);
    if(!v || !f){ if(v) glDeleteShader(v); if(f) glDeleteShader(f); return false; }
    id = glCreateProgram();
    glAttachShader(id, v);
    glAttachShader(id, f);
    glLinkProgram(id);
    GLint ok = 0;
    glGetProgramiv(id, GL_LINK_STATUS, &ok);
    if(!ok){
      char log[4096]; GLsizei n = 0;
      glGetProgramInfoLog(id, sizeof(log) - 1, &n, log);
      log[n] = 0;
      printf("[SHADER LINK FAILED] %s\n%s\n", name, log);
      glDeleteProgram(id); id = 0;
    }
    glDeleteShader(v);
    glDeleteShader(f);
    return id != 0;
  }
  void use() const { glUseProgram(id); }
  GLint loc(const char* n) const { return glGetUniformLocation(id, n); }

  void set(const char* n, float v)         const { glUniform1f(loc(n), v); }
  void set(const char* n, int v)           const { glUniform1i(loc(n), v); }
  void set(const char* n, const m::v2& v)  const { glUniform2f(loc(n), v.x, v.y); }
  void set(const char* n, const m::v3& v)  const { glUniform3f(loc(n), v.x, v.y, v.z); }
  void set(const char* n, const m::v4& v)  const { glUniform4f(loc(n), v.x, v.y, v.z, v.w); }
  void set(const char* n, const m::m4& v)  const { glUniformMatrix4fv(loc(n), 1, GL_FALSE, v.e); }
  void setArr(const char* n, const m::m4* v, int count) const {
    glUniformMatrix4fv(loc(n), count, GL_FALSE, v->e);
  }
};

// ---------------------------------------------------------------- vertex format
// Position, normal, colour, and skinning (joint index + weight).
// Static geometry just leaves the skin fields at joint 0 / weight 1.
struct Vertex {
  m::v3 pos;
  m::v3 nrm;
  m::v3 col;
  float ao    = 1.0f;     // baked ambient occlusion / shade term
  float joint = 0.0f;     // single-joint skinning: enough for our rigs, 4x cheaper
  float rough = 0.6f;
  float metal = 0.0f;
  float mat   = -1.0f;    // texgen layer, or <0 for untextured
};

// ---------------------------------------------------------------- mesh
struct Mesh {
  GLuint vao = 0, vbo = 0, ebo = 0, ivbo = 0;
  GLsizei indexCount = 0;
  int     instanceCount = 0;
  m::v3   boundsMin{0,0,0}, boundsMax{0,0,0};

  void upload(const std::vector<Vertex>& verts, const std::vector<uint32_t>& idx){
    indexCount = (GLsizei)idx.size();
    if(verts.empty() || idx.empty()) return;

    boundsMin = boundsMax = verts[0].pos;
    for(const auto& v : verts){
      boundsMin = m::vmin(boundsMin, v.pos);
      boundsMax = m::vmax(boundsMax, v.pos);
    }

    glGenVertexArrays(1, &vao);
    glBindVertexArray(vao);

    glGenBuffers(1, &vbo);
    glBindBuffer(GL_ARRAY_BUFFER, vbo);
    glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)(verts.size() * sizeof(Vertex)),
                 verts.data(), GL_STATIC_DRAW);

    const GLsizei S = sizeof(Vertex);
    auto attr = [&](int loc, int n, size_t off){
      glEnableVertexAttribArray(loc);
      glVertexAttribPointer(loc, n, GL_FLOAT, GL_FALSE, S, (const void*)off);
    };
    attr(0, 3, offsetof(Vertex, pos));
    attr(1, 3, offsetof(Vertex, nrm));
    attr(2, 3, offsetof(Vertex, col));
    attr(3, 1, offsetof(Vertex, ao));
    attr(4, 1, offsetof(Vertex, joint));
    attr(5, 1, offsetof(Vertex, rough));
    attr(6, 1, offsetof(Vertex, metal));
    attr(12, 1, offsetof(Vertex, mat));

    glGenBuffers(1, &ebo);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, (GLsizeiptr)(idx.size() * sizeof(uint32_t)),
                 idx.data(), GL_STATIC_DRAW);

    glBindVertexArray(0);
  }

  // Per-instance data: a full mat4 (loc 7..10) plus a colour tint (loc 11).
  struct Instance {
    m::m4 xform;
    m::v3 tint{1,1,1};
    float extra = 0.0f;      // per-instance scalar (window-lit seed, sway phase, ...)
  };

  void setupInstancing(int maxInstances){
    glBindVertexArray(vao);
    glGenBuffers(1, &ivbo);
    glBindBuffer(GL_ARRAY_BUFFER, ivbo);
    glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)(maxInstances * sizeof(Instance)),
                 nullptr, GL_DYNAMIC_DRAW);
    const GLsizei S = sizeof(Instance);
    for(int c = 0; c < 4; c++){
      int loc = 7 + c;
      glEnableVertexAttribArray(loc);
      glVertexAttribPointer(loc, 4, GL_FLOAT, GL_FALSE, S,
                            (const void*)(offsetof(Instance, xform) + c * sizeof(float) * 4));
      glVertexAttribDivisor(loc, 1);
    }
    glEnableVertexAttribArray(11);
    glVertexAttribPointer(11, 4, GL_FLOAT, GL_FALSE, S, (const void*)offsetof(Instance, tint));
    glVertexAttribDivisor(11, 1);
    glBindVertexArray(0);
  }

  void updateInstances(const std::vector<Instance>& inst){
    instanceCount = (int)inst.size();
    if(!ivbo || inst.empty()) return;
    glBindBuffer(GL_ARRAY_BUFFER, ivbo);
    glBufferSubData(GL_ARRAY_BUFFER, 0,
                    (GLsizeiptr)(inst.size() * sizeof(Instance)), inst.data());
  }

  void draw() const {
    if(!vao || !indexCount) return;
    glBindVertexArray(vao);
    glDrawElements(GL_TRIANGLES, indexCount, GL_UNSIGNED_INT, nullptr);
  }
  void drawInstanced() const {
    if(!vao || !indexCount || instanceCount <= 0) return;
    glBindVertexArray(vao);
    glDrawElementsInstanced(GL_TRIANGLES, indexCount, GL_UNSIGNED_INT, nullptr, instanceCount);
  }
};

// ---------------------------------------------------------------- framebuffers
struct RenderTarget {
  GLuint fbo = 0, colour = 0, depth = 0;
  int w = 0, h = 0;
  bool hdr = false;
  bool depthIsTexture = false;

  // depthMode: 0 none, 1 renderbuffer, 2 sampleable texture (needed for SSAO)
  void create(int W, int H, bool isHDR, int depthMode){
    destroy();
    w = W; h = H; hdr = isHDR;
    glGenFramebuffers(1, &fbo);
    glBindFramebuffer(GL_FRAMEBUFFER, fbo);

    glGenTextures(1, &colour);
    glBindTexture(GL_TEXTURE_2D, colour);
    if(isHDR) glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA16F, W, H, 0, GL_RGBA, GL_HALF_FLOAT, nullptr);
    else      glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8,   W, H, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, colour, 0);

    depthIsTexture = (depthMode == 2);
    if(depthMode == 2){
      glGenTextures(1, &depth);
      glBindTexture(GL_TEXTURE_2D, depth);
      glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, W, H, 0,
                   GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, nullptr);
      // depth textures are not filterable in GLES3 — NEAREST or the sampler
      // is incomplete and every fetch silently returns zero
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
      glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, depth, 0);
    } else if(depthMode == 1){
      glGenRenderbuffers(1, &depth);
      glBindRenderbuffer(GL_RENDERBUFFER, depth);
      glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH_COMPONENT24, W, H);
      glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, depth);
    }
    GLenum st = glCheckFramebufferStatus(GL_FRAMEBUFFER);
    if(st != GL_FRAMEBUFFER_COMPLETE) printf("[FBO incomplete 0x%04x] %dx%d hdr=%d\n", st, W, H, (int)isHDR);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
  }
  void destroy(){
    if(colour){ glDeleteTextures(1, &colour); colour = 0; }
    if(depth){
      if(depthIsTexture) glDeleteTextures(1, &depth);
      else               glDeleteRenderbuffers(1, &depth);
      depth = 0;
    }
    if(fbo)   { glDeleteFramebuffers(1, &fbo); fbo = 0; }
  }
  void bind() const {
    glBindFramebuffer(GL_FRAMEBUFFER, fbo);
    glViewport(0, 0, w, h);
  }
};

// Depth-only target for the shadow cascades.
struct ShadowMap {
  GLuint fbo = 0, tex = 0;
  int size = 0;

  void create(int S){
    size = S;
    glGenTextures(1, &tex);
    glBindTexture(GL_TEXTURE_2D, tex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, S, S, 0,
                 GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, nullptr);
    // Depth textures are NOT linearly filterable in GLES3. Asking for
    // GL_LINEAR makes the sampler incomplete and every fetch returns 0,
    // which reads as "everything is in shadow". We do our own PCF, so
    // GL_NEAREST is both correct and what the spec allows here.
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_COMPARE_MODE, GL_NONE);

    glGenFramebuffers(1, &fbo);
    glBindFramebuffer(GL_FRAMEBUFFER, fbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, tex, 0);
    GLenum st = glCheckFramebufferStatus(GL_FRAMEBUFFER);
    if(st != GL_FRAMEBUFFER_COMPLETE) printf("[SHADOW FBO incomplete 0x%04x]\n", st);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
  }
  void bind() const {
    glBindFramebuffer(GL_FRAMEBUFFER, fbo);
    glViewport(0, 0, size, size);
  }
};

// ---------------------------------------------------------------- fullscreen quad
struct FullscreenQuad {
  GLuint vao = 0, vbo = 0;
  void create(){
    const float v[] = { -1,-1, 1,-1, -1,1,  1,-1, 1,1, -1,1 };
    glGenVertexArrays(1, &vao);
    glBindVertexArray(vao);
    glGenBuffers(1, &vbo);
    glBindBuffer(GL_ARRAY_BUFFER, vbo);
    glBufferData(GL_ARRAY_BUFFER, sizeof(v), v, GL_STATIC_DRAW);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, nullptr);
    glBindVertexArray(0);
  }
  void draw() const {
    glBindVertexArray(vao);
    glDrawArrays(GL_TRIANGLES, 0, 6);
  }
};

// ---------------------------------------------------------------- frustum culling
struct Frustum {
  m::v4 pl[6];

  void fromMatrix(const m::m4& vp){
    const float* e = vp.e;
    auto setp = [&](int i, float a, float b, float c, float d){
      float l = std::sqrt(a*a + b*b + c*c);
      if(l < 1e-12f) l = 1.0f;
      pl[i] = { a/l, b/l, c/l, d/l };
    };
    setp(0, e[0]+e[3],  e[4]+e[7],  e[8]+e[11],  e[12]+e[15]);   // left
    setp(1, -e[0]+e[3], -e[4]+e[7], -e[8]+e[11], -e[12]+e[15]);  // right
    setp(2, e[1]+e[3],  e[5]+e[7],  e[9]+e[11],  e[13]+e[15]);   // bottom
    setp(3, -e[1]+e[3], -e[5]+e[7], -e[9]+e[11], -e[13]+e[15]);  // top
    setp(4, e[2]+e[3],  e[6]+e[7],  e[10]+e[11], e[14]+e[15]);   // near
    setp(5, -e[2]+e[3], -e[6]+e[7], -e[10]+e[11], -e[14]+e[15]); // far
  }
  bool sphereVisible(const m::v3& c, float r) const {
    for(int i = 0; i < 6; i++){
      if(pl[i].x*c.x + pl[i].y*c.y + pl[i].z*c.z + pl[i].w < -r) return false;
    }
    return true;
  }
};

} // namespace gfx
