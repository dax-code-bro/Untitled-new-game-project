#pragma once
#include "geometry/Shapes.hpp"
#include "rendering/gl/Buffer.hpp"
#include "rendering/gl/VertexArray.hpp"
#include <glm/glm.hpp>
#include <vector>

namespace game::rendering {

/* One instance as the instanced shader variants read it: a model matrix at
 * attribute locations 8..11 and the tint/custom vec4 at 12 -- the layout
 * GLSL.transform declares. 80 bytes, the web engine's 20 floats. */
struct Instance {
    glm::mat4 model{1.0f};
    glm::vec4 params{1.0f, 1.0f, 1.0f, 0.0f};
};

/* A mesh on the GPU: one interleaved vertex buffer, one index buffer and a
 * VAO that already knows the layout GLSL.transform expects:
 *
 *     0 aPosition vec3   1 aNormal vec3   2 aUv vec2   3 aTangent vec4
 *     4 aColor    (left disabled -- the generic value, white, applies)
 *     8..11 aModel, 12 aParams  (per instance, only when instanced)
 *
 * The instance buffer grows on demand and is never shrunk. */
class Mesh {
public:
    explicit Mesh(const geometry::MeshData& data);

    void draw() const;
    void drawInstanced(const std::vector<Instance>& instances) const;

    [[nodiscard]] GLsizei   indexCount() const { return m_indexCount; }
    [[nodiscard]] glm::vec3 boundsMin()  const { return m_min; }
    [[nodiscard]] glm::vec3 boundsMax()  const { return m_max; }

private:
    gl::Buffer      m_vbo, m_ebo;
    mutable gl::VertexArray m_vao;
    mutable gl::Buffer m_instances;
    mutable size_t     m_instanceCapacity = 0;
    GLsizei   m_indexCount = 0;
    glm::vec3 m_min{0.0f}, m_max{0.0f};
};

} // namespace game::rendering
