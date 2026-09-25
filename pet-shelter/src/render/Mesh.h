// Geometry: a CPU-side MeshBuilder for procedural models and a GPU Mesh.
// Every vertex carries its own PBR material so whole rooms batch into one draw.
#pragma once
#include "core/GL.h"
#include "core/Math.h"
#include <vector>

namespace ps {

// Pattern ids are generated procedurally in shaders/lit.frag (keep in sync).
enum Pattern : int {
    PAT_PLAIN = 0, PAT_ASPHALT = 1, PAT_TERRAIN = 2, PAT_WOOD = 3, PAT_TILE = 4, PAT_CARPET = 5,
    PAT_FENCE = 6, PAT_SCREEN = 7, PAT_CONCRETE = 8, PAT_GRASS = 9, PAT_ROADLINE = 10, PAT_SIDING = 11,
    PAT_FABRIC = 12, PAT_GLASS = 13, PAT_HAIR = 14, PAT_METAL = 15, PAT_PARKING = 16, PAT_FOLIAGE = 17,
    PAT_BARK = 18, PAT_HIGHWAY = 19, PAT_SHINGLE = 20, PAT_CLINIC = 21,
};

struct Material {
    vec3 albedo{0.8f, 0.8f, 0.8f};
    float roughness = 0.8f;
    float metallic = 0.0f;
    float emissive = 0.0f;   // multiplies albedo, in HDR units
    int pattern = PAT_PLAIN;
    float alpha = 1.0f;
    static Material make(vec3 c, float rough = 0.8f, float metal = 0.0f, int pat = PAT_PLAIN, float emis = 0.0f) {
        Material m; m.albedo = c; m.roughness = rough; m.metallic = metal; m.pattern = pat; m.emissive = emis; return m;
    }
};

struct Vertex {
    vec3 pos;
    vec3 normal;
    vec2 uv;
    vec4 color;   // rgb albedo, a = opacity
    vec4 mat;     // roughness, metallic, emissive, pattern
};

struct InstanceData {
    mat4 model;
    vec4 tint{1, 1, 1, 1};
};

class MeshBuilder {
public:
    std::vector<Vertex> verts;
    std::vector<uint32_t> idx;
    mat4 xf;                       // applied to everything added

    void clear() { verts.clear(); idx.clear(); xf = mat4(); }
    uint32_t addVertex(vec3 p, vec3 n, vec2 uv, const Material& m);
    void addTri(uint32_t a, uint32_t b, uint32_t c) { idx.push_back(a); idx.push_back(b); idx.push_back(c); }
    // Quad p0..p3 counter-clockwise when seen from the front
    void addQuad(vec3 p0, vec3 p1, vec3 p2, vec3 p3, const Material& m, vec2 uvScale = {1, 1});
    void addBox(const AABB& b, const Material& m, bool skipBottom = false);
    void addBox(vec3 center, vec3 halfSize, const Material& m) { addBox(AABB(center - halfSize, center + halfSize), m); }
    void addCylinder(vec3 base, float radius, float height, int segs, const Material& m, bool caps = true, float topRadius = -1.0f);
    void addCone(vec3 base, float radius, float height, int segs, const Material& m) { addCylinder(base, radius, height, segs, m, true, 0.0f); }
    void addEllipsoid(vec3 center, vec3 radii, int segs, int rings, const Material& m);
    void append(const MeshBuilder& o);   // applies this->xf to o
    AABB bounds() const;
};

class Mesh {
public:
    Mesh() = default;
    Mesh(const Mesh&) = delete;
    Mesh& operator=(const Mesh&) = delete;
    Mesh(Mesh&& o) noexcept { *this = std::move(o); }
    Mesh& operator=(Mesh&& o) noexcept;
    ~Mesh() { destroy(); }

    void upload(const MeshBuilder& b, bool dynamic = false);
    void setInstances(const std::vector<InstanceData>& inst);
    void draw() const;
    void drawInstanced() const;
    void destroy();
    bool valid() const { return vao_ != 0 && count_ > 0; }
    int instanceCount() const { return instances_; }
    const AABB& bounds() const { return bounds_; }

private:
    GLuint vao_ = 0, vbo_ = 0, ebo_ = 0, ibo_ = 0;
    GLsizei count_ = 0;
    int instances_ = 0;
    size_t iboCapacity_ = 0;
    AABB bounds_;
};

}  // namespace ps
