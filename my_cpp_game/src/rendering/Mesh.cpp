#include "rendering/Mesh.hpp"
#include <cstddef>

namespace game::rendering {

namespace {
struct Vertex {
    glm::vec3 position;
    glm::vec3 normal;
    glm::vec2 uv;
    glm::vec4 tangent;
};
static_assert(sizeof(Vertex) == 48, "interleaved vertex must be tightly packed");
constexpr GLuint kVertexBinding   = 0;
constexpr GLuint kInstanceBinding = 1;
constexpr GLuint kColorBinding    = 2;
constexpr GLuint kJointBinding    = 3;
constexpr GLuint kWeightBinding   = 4;
} // namespace

Mesh::Mesh(const geometry::MeshData& d)
    : m_indexCount(static_cast<GLsizei>(d.indices.size())), m_min(d.boundsMin), m_max(d.boundsMax) {
    std::vector<Vertex> v(d.positions.size());
    for (size_t i = 0; i < v.size(); ++i) {
        v[i].position = d.positions[i];
        v[i].normal   = i < d.normals.size()  ? d.normals[i]  : glm::vec3(0, 1, 0);
        v[i].uv       = i < d.uvs.size()      ? d.uvs[i]      : glm::vec2(0);
        v[i].tangent  = i < d.tangents.size() ? d.tangents[i] : glm::vec4(1, 0, 0, 1);
    }
    m_vbo = gl::Buffer::from(v, 0);
    m_ebo = gl::Buffer::from(d.indices, 0);

    m_vao.vertexBuffer(kVertexBinding, m_vbo, 0, sizeof(Vertex));
    m_vao.attribute(0, kVertexBinding, 3, GL_FLOAT, offsetof(Vertex, position));
    m_vao.attribute(1, kVertexBinding, 3, GL_FLOAT, offsetof(Vertex, normal));
    m_vao.attribute(2, kVertexBinding, 2, GL_FLOAT, offsetof(Vertex, uv));
    m_vao.attribute(3, kVertexBinding, 4, GL_FLOAT, offsetof(Vertex, tangent));
    m_vao.elementBuffer(m_ebo);
    if (!d.colors.empty() && d.colors.size() == d.positions.size()) {
        m_colors = gl::Buffer::from(d.colors, 0);
        m_vao.vertexBuffer(kColorBinding, m_colors, 0, sizeof(glm::vec3));
        m_vao.attribute(4, kColorBinding, 3, GL_FLOAT, 0);
    }
    if (d.joints.size() == d.positions.size() && d.weights.size() == d.positions.size()) {
        m_joints = gl::Buffer::from(d.joints, 0);
        m_weights = gl::Buffer::from(d.weights, 0);
        m_vao.vertexBuffer(kJointBinding, m_joints, 0, sizeof(glm::vec4));
        m_vao.vertexBuffer(kWeightBinding, m_weights, 0, sizeof(glm::vec4));
        m_vao.attribute(5, kJointBinding, 4, GL_FLOAT, 0);
        m_vao.attribute(6, kWeightBinding, 4, GL_FLOAT, 0);
        m_skinned = true;
    }
}

void Mesh::draw() const {
    m_vao.bind();
    glDrawElements(GL_TRIANGLES, m_indexCount, GL_UNSIGNED_INT, nullptr);
}

void Mesh::drawInstanced(const std::vector<Instance>& instances) const {
    if (instances.empty()) return;
    if (instances.size() > m_instanceCapacity) {
        size_t cap = m_instanceCapacity ? m_instanceCapacity : 64;
        while (cap < instances.size()) cap *= 2;
        m_instances = gl::Buffer(static_cast<GLsizeiptr>(cap * sizeof(Instance)), nullptr);
        m_instanceCapacity = cap;
        // The VAO keeps the format; re-point its binding at the new buffer.
        m_vao.vertexBuffer(kInstanceBinding, m_instances, 0, sizeof(Instance));
        for (GLuint c = 0; c < 4; ++c)
            m_vao.attribute(8 + c, kInstanceBinding, 4, GL_FLOAT,
                          static_cast<GLuint>(offsetof(Instance, model) + c * sizeof(glm::vec4)));
        m_vao.attribute(12, kInstanceBinding, 4, GL_FLOAT, offsetof(Instance, params));
        m_vao.divisor(kInstanceBinding, 1);
    }
    m_instances.update(0, static_cast<GLsizeiptr>(instances.size() * sizeof(Instance)), instances.data());
    m_vao.bind();
    glDrawElementsInstanced(GL_TRIANGLES, m_indexCount, GL_UNSIGNED_INT, nullptr,
                            static_cast<GLsizei>(instances.size()));
}

} // namespace game::rendering
