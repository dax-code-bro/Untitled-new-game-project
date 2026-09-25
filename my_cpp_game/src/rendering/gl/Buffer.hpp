#pragma once
#include "rendering/gl/Handle.hpp"
#include <vector>

namespace game::gl {

/* Immutable-storage buffer (glNamedBufferStorage). The size is fixed at
 * creation; contents can be rewritten through update() when created with
 * GL_DYNAMIC_STORAGE_BIT, which is the default. */
class Buffer {
public:
    Buffer() = default;
    Buffer(GLsizeiptr bytes, const void* data, GLbitfield flags = GL_DYNAMIC_STORAGE_BIT);

    template <class T>
    static Buffer from(const std::vector<T>& v, GLbitfield flags = GL_DYNAMIC_STORAGE_BIT) {
        return Buffer(static_cast<GLsizeiptr>(v.size() * sizeof(T)), v.data(), flags);
    }

    void update(GLintptr offset, GLsizeiptr bytes, const void* data);

    [[nodiscard]] GLuint     id()   const { return m_h.get(); }
    [[nodiscard]] GLsizeiptr size() const { return m_size; }
    explicit operator bool() const { return static_cast<bool>(m_h); }

private:
    BufferHandle m_h;
    GLsizeiptr   m_size = 0;
};

} // namespace game::gl
