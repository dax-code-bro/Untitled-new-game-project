#include "rendering/gl/Buffer.hpp"
#include <stdexcept>

namespace game::gl {

Buffer::Buffer(GLsizeiptr bytes, const void* data, GLbitfield flags) : m_size(bytes) {
    if (bytes <= 0) throw std::invalid_argument("Buffer: size must be positive");
    GLuint id = 0;
    glCreateBuffers(1, &id);
    m_h.reset(id);
    glNamedBufferStorage(id, bytes, data, flags);
}

void Buffer::update(GLintptr offset, GLsizeiptr bytes, const void* data) {
    if (offset < 0 || offset + bytes > m_size)
        throw std::out_of_range("Buffer::update: range outside the buffer");
    glNamedBufferSubData(m_h.get(), offset, bytes, data);
}

} // namespace game::gl
