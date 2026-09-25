#pragma once
#include "rendering/gl/Buffer.hpp"

namespace game::gl {

/* A VAO described with separate attribute format / buffer binding
 * (GL 4.3 vertex attrib binding, created DSA-style). The format is set
 * once; the buffers bound to each binding point can change. */
class VertexArray {
public:
    VertexArray();

    void vertexBuffer(GLuint binding, const Buffer& buf, GLintptr offset, GLsizei stride);
    void attribute(GLuint location, GLuint binding, GLint components, GLenum type,
                   GLuint relativeOffset, bool normalized = false);
    void attributeInt(GLuint location, GLuint binding, GLint components, GLenum type,
                      GLuint relativeOffset);
    void divisor(GLuint binding, GLuint divisor);
    void elementBuffer(const Buffer& buf);

    void bind() const { glBindVertexArray(m_h.get()); }
    [[nodiscard]] GLuint id() const { return m_h.get(); }

private:
    VertexArrayHandle m_h;
};

} // namespace game::gl
