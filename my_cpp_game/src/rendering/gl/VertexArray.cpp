#include "rendering/gl/VertexArray.hpp"

namespace game::gl {

VertexArray::VertexArray() {
    GLuint id = 0;
    glCreateVertexArrays(1, &id);
    m_h.reset(id);
}

void VertexArray::vertexBuffer(GLuint binding, const Buffer& buf, GLintptr offset, GLsizei stride) {
    glVertexArrayVertexBuffer(m_h.get(), binding, buf.id(), offset, stride);
}

void VertexArray::attribute(GLuint location, GLuint binding, GLint components, GLenum type,
                            GLuint relativeOffset, bool normalized) {
    glEnableVertexArrayAttrib(m_h.get(), location);
    glVertexArrayAttribFormat(m_h.get(), location, components, type,
                              normalized ? GL_TRUE : GL_FALSE, relativeOffset);
    glVertexArrayAttribBinding(m_h.get(), location, binding);
}

void VertexArray::attributeInt(GLuint location, GLuint binding, GLint components, GLenum type,
                               GLuint relativeOffset) {
    glEnableVertexArrayAttrib(m_h.get(), location);
    glVertexArrayAttribIFormat(m_h.get(), location, components, type, relativeOffset);
    glVertexArrayAttribBinding(m_h.get(), location, binding);
}

void VertexArray::divisor(GLuint binding, GLuint d) {
    glVertexArrayBindingDivisor(m_h.get(), binding, d);
}

void VertexArray::elementBuffer(const Buffer& buf) {
    glVertexArrayElementBuffer(m_h.get(), buf.id());
}

} // namespace game::gl
