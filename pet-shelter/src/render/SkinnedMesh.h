// Skinned meshes: one continuous surface bent by a skeleton on the GPU
// (up to 4 bone influences per vertex). Used for every animal.
#pragma once
#include "core/GL.h"
#include "core/Math.h"
#include "render/Mesh.h"
#include <vector>

namespace ps {

constexpr int kMaxBones = 40;

// Coat region ids (stored in uv.x) - the coat shader colors each region differently.
enum CoatRegion : int {
    REG_BODY = 0, REG_BELLY = 1, REG_LEG = 2, REG_HEAD = 3, REG_EAR = 4, REG_TAIL = 5,
    REG_FIXED = 6,      // vertex color is the final albedo (eyes, claws, hooves, horns, beaks)
    REG_EAR_INNER = 7, REG_MANE = 8, REG_WING = 9, REG_SHELL = 10,
};

struct SkinVertex {
    vec3 pos;
    vec3 normal;
    vec2 uv;        // x = region, y = region-specific coordinate (0..1)
    vec4 color;     // rgb = fixed albedo (REG_FIXED) or tint, a = underside factor (0 back .. 1 belly)
    vec4 mat;       // roughness, metallic, fur length (m), pattern
    vec4 bones;     // up to 4 bone indices
    vec4 weights;   // matching weights (sum to 1)
};

struct SkinBuilder {
    std::vector<SkinVertex> verts;
    std::vector<uint32_t> idx;
    uint32_t add(const SkinVertex& v) { verts.push_back(v); return uint32_t(verts.size() - 1); }
    void tri(uint32_t a, uint32_t b, uint32_t c) { idx.push_back(a); idx.push_back(b); idx.push_back(c); }
    void append(const SkinBuilder& o);
    void recomputeNormals();       // smooth normals from triangles (keeps seams if duplicated verts)
};

class SkinnedMesh {
public:
    SkinnedMesh() = default;
    SkinnedMesh(const SkinnedMesh&) = delete;
    SkinnedMesh& operator=(const SkinnedMesh&) = delete;
    SkinnedMesh(SkinnedMesh&& o) noexcept { *this = std::move(o); }
    SkinnedMesh& operator=(SkinnedMesh&& o) noexcept;
    ~SkinnedMesh() { destroy(); }
    void upload(const SkinBuilder& b);
    void draw() const;
    void destroy();
    bool valid() const { return vao_ && count_ > 0; }
    size_t vertexCount() const { return verts_; }

private:
    GLuint vao_ = 0, vbo_ = 0, ebo_ = 0;
    GLsizei count_ = 0;
    size_t verts_ = 0;
};

// Per-individual coat colors/pattern, sent to the coat shader.
struct CoatUniforms {
    vec3 a{0.5f, 0.4f, 0.3f}, b{0.1f, 0.1f, 0.1f}, c{0.95f, 0.95f, 0.93f};
    int pattern = 0;
    float scale = 1.0f;       // body length in meters (pattern scale)
    float amount = 0.5f;      // pattern-specific amount (white %, spot density...)
    float seed = 0.0f;
    float contrast = 1.0f;
    vec4 marks{0, 0, 0, 0};   // socks, blaze, chest, tail tip (0..1 white)
    vec4 wound{0, 0, 0, 0};   // bind-space position + radius (0 = none): bleeding wound
    float wet = 0.0f;         // blood/wetness amount on the wound
};

}  // namespace ps
