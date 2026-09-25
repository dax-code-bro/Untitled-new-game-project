#include "render/SkinnedMesh.h"
#include <cstddef>

namespace ps {

void SkinBuilder::append(const SkinBuilder& o) {
    uint32_t base = uint32_t(verts.size());
    verts.insert(verts.end(), o.verts.begin(), o.verts.end());
    for (uint32_t i : o.idx) idx.push_back(base + i);
}

void SkinBuilder::recomputeNormals() {
    std::vector<vec3> n(verts.size(), vec3(0.0f));
    for (size_t i = 0; i + 2 < idx.size(); i += 3) {
        vec3 a = verts[idx[i]].pos, b = verts[idx[i + 1]].pos, c = verts[idx[i + 2]].pos;
        vec3 fn = cross(b - a, c - a);   // area-weighted
        n[idx[i]] += fn; n[idx[i + 1]] += fn; n[idx[i + 2]] += fn;
    }
    for (size_t i = 0; i < verts.size(); ++i)
        if (dot(n[i], n[i]) > 1e-20f) verts[i].normal = normalize(n[i]);
}

SkinnedMesh& SkinnedMesh::operator=(SkinnedMesh&& o) noexcept {
    if (this != &o) {
        destroy();
        vao_ = o.vao_; vbo_ = o.vbo_; ebo_ = o.ebo_; count_ = o.count_; verts_ = o.verts_;
        o.vao_ = o.vbo_ = o.ebo_ = 0; o.count_ = 0; o.verts_ = 0;
    }
    return *this;
}

void SkinnedMesh::upload(const SkinBuilder& b) {
    if (!vao_) { glGenVertexArrays(1, &vao_); glGenBuffers(1, &vbo_); glGenBuffers(1, &ebo_); }
    glBindVertexArray(vao_);
    glBindBuffer(GL_ARRAY_BUFFER, vbo_);
    glBufferData(GL_ARRAY_BUFFER, GLsizeiptr(b.verts.size() * sizeof(SkinVertex)), b.verts.data(), GL_STATIC_DRAW);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo_);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, GLsizeiptr(b.idx.size() * sizeof(uint32_t)), b.idx.data(), GL_STATIC_DRAW);
    const GLsizei st = sizeof(SkinVertex);
    glEnableVertexAttribArray(0); glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, st, (void*)offsetof(SkinVertex, pos));
    glEnableVertexAttribArray(1); glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, st, (void*)offsetof(SkinVertex, normal));
    glEnableVertexAttribArray(2); glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, st, (void*)offsetof(SkinVertex, uv));
    glEnableVertexAttribArray(3); glVertexAttribPointer(3, 4, GL_FLOAT, GL_FALSE, st, (void*)offsetof(SkinVertex, color));
    glEnableVertexAttribArray(4); glVertexAttribPointer(4, 4, GL_FLOAT, GL_FALSE, st, (void*)offsetof(SkinVertex, mat));
    glEnableVertexAttribArray(10); glVertexAttribPointer(10, 4, GL_FLOAT, GL_FALSE, st, (void*)offsetof(SkinVertex, bones));
    glEnableVertexAttribArray(11); glVertexAttribPointer(11, 4, GL_FLOAT, GL_FALSE, st, (void*)offsetof(SkinVertex, weights));
    glBindVertexArray(0);
    count_ = GLsizei(b.idx.size());
    verts_ = b.verts.size();
}

void SkinnedMesh::draw() const {
    if (!valid()) return;
    glBindVertexArray(vao_);
    glDrawElements(GL_TRIANGLES, count_, GL_UNSIGNED_INT, nullptr);
}

void SkinnedMesh::destroy() {
    if (vao_) glDeleteVertexArrays(1, &vao_);
    if (vbo_) glDeleteBuffers(1, &vbo_);
    if (ebo_) glDeleteBuffers(1, &ebo_);
    vao_ = vbo_ = ebo_ = 0;
    count_ = 0;
}

}  // namespace ps
