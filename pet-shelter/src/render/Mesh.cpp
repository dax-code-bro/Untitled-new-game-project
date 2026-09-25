#include "render/Mesh.h"
#include <cstddef>

namespace ps {

uint32_t MeshBuilder::addVertex(vec3 p, vec3 n, vec2 uv, const Material& m) {
    Vertex v;
    v.pos = xf.transformPoint(p);
    v.normal = normalize(xf.transformDir(n));
    v.uv = uv;
    v.color = vec4(m.albedo, m.alpha);
    v.mat = vec4(m.roughness, m.metallic, m.emissive, float(m.pattern));
    verts.push_back(v);
    return uint32_t(verts.size() - 1);
}

void MeshBuilder::addQuad(vec3 p0, vec3 p1, vec3 p2, vec3 p3, const Material& m, vec2 uvScale) {
    vec3 n = normalize(cross(p1 - p0, p3 - p0));
    float w = length(p1 - p0) * uvScale.x, h = length(p3 - p0) * uvScale.y;
    uint32_t a = addVertex(p0, n, {0, 0}, m), b = addVertex(p1, n, {w, 0}, m);
    uint32_t c = addVertex(p2, n, {w, h}, m), d = addVertex(p3, n, {0, h}, m);
    addTri(a, b, c);
    addTri(a, c, d);
}

void MeshBuilder::addBox(const AABB& bx, const Material& m, bool skipBottom) {
    vec3 a = bx.min, b = bx.max;
    // +X
    addQuad({b.x, a.y, b.z}, {b.x, a.y, a.z}, {b.x, b.y, a.z}, {b.x, b.y, b.z}, m);
    // -X
    addQuad({a.x, a.y, a.z}, {a.x, a.y, b.z}, {a.x, b.y, b.z}, {a.x, b.y, a.z}, m);
    // +Y (top): uv in world-ish XZ meters
    addQuad({a.x, b.y, b.z}, {b.x, b.y, b.z}, {b.x, b.y, a.z}, {a.x, b.y, a.z}, m);
    if (!skipBottom) addQuad({a.x, a.y, a.z}, {b.x, a.y, a.z}, {b.x, a.y, b.z}, {a.x, a.y, b.z}, m);
    // +Z
    addQuad({a.x, a.y, b.z}, {b.x, a.y, b.z}, {b.x, b.y, b.z}, {a.x, b.y, b.z}, m);
    // -Z
    addQuad({b.x, a.y, a.z}, {a.x, a.y, a.z}, {a.x, b.y, a.z}, {b.x, b.y, a.z}, m);
}

void MeshBuilder::addCylinder(vec3 base, float r, float h, int segs, const Material& m, bool caps, float topR) {
    if (topR < 0.0f) topR = r;
    uint32_t start = uint32_t(verts.size());
    float slope = (r - topR) / h;
    for (int i = 0; i <= segs; ++i) {
        float t = float(i) / float(segs), a = t * 2.0f * kPi;
        float c = std::cos(a), s = std::sin(a);
        vec3 n = normalize(vec3(c, slope, s));
        addVertex(base + vec3(c * r, 0, s * r), n, {t * 2 * kPi * r, 0}, m);
        addVertex(base + vec3(c * topR, h, s * topR), n, {t * 2 * kPi * r, h}, m);
    }
    for (int i = 0; i < segs; ++i) {
        uint32_t a = start + uint32_t(i) * 2;
        addTri(a, a + 1, a + 3);
        addTri(a, a + 3, a + 2);
    }
    if (caps) {
        uint32_t cb = addVertex(base, {0, -1, 0}, {0, 0}, m);
        uint32_t ct = addVertex(base + vec3(0, h, 0), {0, 1, 0}, {0, 0}, m);
        uint32_t ringB = uint32_t(verts.size());
        for (int i = 0; i <= segs; ++i) {
            float a = float(i) / float(segs) * 2.0f * kPi;
            addVertex(base + vec3(std::cos(a) * r, 0, std::sin(a) * r), {0, -1, 0}, {std::cos(a) * r, std::sin(a) * r}, m);
        }
        uint32_t ringT = uint32_t(verts.size());
        if (topR > 0.0f)
            for (int i = 0; i <= segs; ++i) {
                float a = float(i) / float(segs) * 2.0f * kPi;
                addVertex(base + vec3(std::cos(a) * topR, h, std::sin(a) * topR), {0, 1, 0}, {std::cos(a) * topR, std::sin(a) * topR}, m);
            }
        for (int i = 0; i < segs; ++i) {
            addTri(cb, ringB + uint32_t(i), ringB + uint32_t(i) + 1);
            if (topR > 0.0f) addTri(ct, ringT + uint32_t(i) + 1, ringT + uint32_t(i));
        }
    }
}

void MeshBuilder::addEllipsoid(vec3 c, vec3 r, int segs, int rings, const Material& m) {
    uint32_t start = uint32_t(verts.size());
    for (int y = 0; y <= rings; ++y) {
        float v = float(y) / float(rings), phi = v * kPi;
        for (int x = 0; x <= segs; ++x) {
            float u = float(x) / float(segs), th = u * 2.0f * kPi;
            vec3 d{std::sin(phi) * std::cos(th), std::cos(phi), std::sin(phi) * std::sin(th)};
            vec3 n = normalize(vec3(d.x / r.x, d.y / r.y, d.z / r.z));
            addVertex(c + d * r, n, {u * 2 * kPi * r.x, v * kPi * r.y}, m);
        }
    }
    for (int y = 0; y < rings; ++y)
        for (int x = 0; x < segs; ++x) {
            uint32_t a = start + uint32_t(y * (segs + 1) + x), b = a + uint32_t(segs + 1);
            addTri(a, a + 1, b + 1);
            addTri(a, b + 1, b);
        }
}

void MeshBuilder::append(const MeshBuilder& o) {
    uint32_t base = uint32_t(verts.size());
    for (Vertex v : o.verts) {
        v.pos = xf.transformPoint(v.pos);
        v.normal = normalize(xf.transformDir(v.normal));
        verts.push_back(v);
    }
    for (uint32_t i : o.idx) idx.push_back(base + i);
}

AABB MeshBuilder::bounds() const {
    if (verts.empty()) return {};
    AABB b(verts[0].pos, verts[0].pos);
    for (auto& v : verts) { b.min = vmin(b.min, v.pos); b.max = vmax(b.max, v.pos); }
    return b;
}

Mesh& Mesh::operator=(Mesh&& o) noexcept {
    if (this != &o) {
        destroy();
        vao_ = o.vao_; vbo_ = o.vbo_; ebo_ = o.ebo_; ibo_ = o.ibo_;
        count_ = o.count_; instances_ = o.instances_; iboCapacity_ = o.iboCapacity_; bounds_ = o.bounds_;
        o.vao_ = o.vbo_ = o.ebo_ = o.ibo_ = 0;
        o.count_ = 0; o.instances_ = 0; o.iboCapacity_ = 0;
    }
    return *this;
}

void Mesh::upload(const MeshBuilder& b, bool dynamic) {
    if (!vao_) {
        glGenVertexArrays(1, &vao_);
        glGenBuffers(1, &vbo_);
        glGenBuffers(1, &ebo_);
    }
    glBindVertexArray(vao_);
    glBindBuffer(GL_ARRAY_BUFFER, vbo_);
    glBufferData(GL_ARRAY_BUFFER, GLsizeiptr(b.verts.size() * sizeof(Vertex)), b.verts.data(),
                 dynamic ? GL_DYNAMIC_DRAW : GL_STATIC_DRAW);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo_);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, GLsizeiptr(b.idx.size() * sizeof(uint32_t)), b.idx.data(),
                 dynamic ? GL_DYNAMIC_DRAW : GL_STATIC_DRAW);
    const GLsizei st = sizeof(Vertex);
    glEnableVertexAttribArray(0); glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, st, (void*)offsetof(Vertex, pos));
    glEnableVertexAttribArray(1); glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, st, (void*)offsetof(Vertex, normal));
    glEnableVertexAttribArray(2); glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, st, (void*)offsetof(Vertex, uv));
    glEnableVertexAttribArray(3); glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, st, (void*)offsetof(Vertex, color));
    glEnableVertexAttribArray(4); glVertexAttribPointer(4, 4, GL_FLOAT, GL_FALSE, st, (void*)offsetof(Vertex, mat));
    glBindVertexArray(0);
    count_ = GLsizei(b.idx.size());
    bounds_ = b.bounds();
}

void Mesh::setInstances(const std::vector<InstanceData>& inst) {
    if (!vao_) return;
    glBindVertexArray(vao_);
    if (!ibo_) {
        glGenBuffers(1, &ibo_);
        glBindBuffer(GL_ARRAY_BUFFER, ibo_);
        const GLsizei st = sizeof(InstanceData);
        for (int i = 0; i < 4; ++i) {
            glEnableVertexAttribArray(GLuint(5 + i));
            glVertexAttribPointer(GLuint(5 + i), 4, GL_FLOAT, GL_FALSE, st, (void*)(sizeof(float) * 4 * size_t(i)));
            glVertexAttribDivisor(GLuint(5 + i), 1);
        }
        glEnableVertexAttribArray(9);
        glVertexAttribPointer(9, 4, GL_FLOAT, GL_FALSE, st, (void*)offsetof(InstanceData, tint));
        glVertexAttribDivisor(9, 1);
    }
    glBindBuffer(GL_ARRAY_BUFFER, ibo_);
    size_t bytes = inst.size() * sizeof(InstanceData);
    if (bytes > iboCapacity_) {
        iboCapacity_ = bytes + bytes / 2 + sizeof(InstanceData) * 16;
        glBufferData(GL_ARRAY_BUFFER, GLsizeiptr(iboCapacity_), nullptr, GL_DYNAMIC_DRAW);
    }
    if (bytes) glBufferSubData(GL_ARRAY_BUFFER, 0, GLsizeiptr(bytes), inst.data());
    glBindVertexArray(0);
    instances_ = int(inst.size());
}

void Mesh::draw() const {
    if (!valid()) return;
    glBindVertexArray(vao_);
    glDrawElements(GL_TRIANGLES, count_, GL_UNSIGNED_INT, nullptr);
}

void Mesh::drawInstanced() const {
    if (!valid() || instances_ <= 0) return;
    glBindVertexArray(vao_);
    glDrawElementsInstanced(GL_TRIANGLES, count_, GL_UNSIGNED_INT, nullptr, instances_);
}

void Mesh::destroy() {
    if (vao_) glDeleteVertexArrays(1, &vao_);
    if (vbo_) glDeleteBuffers(1, &vbo_);
    if (ebo_) glDeleteBuffers(1, &ebo_);
    if (ibo_) glDeleteBuffers(1, &ibo_);
    vao_ = vbo_ = ebo_ = ibo_ = 0;
    count_ = 0;
    instances_ = 0;
    iboCapacity_ = 0;
}

}  // namespace ps
