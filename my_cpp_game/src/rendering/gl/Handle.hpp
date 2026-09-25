#pragma once
/* One move-only owner for every kind of GL object.
 *
 * GL names are plain integers that must be handed back with the matching
 * glDelete*. That is manual memory management in everything but name, so
 * it is done in exactly one place: this template, parameterised on the
 * deleter. Every GL resource in the engine is one of these aliases, which
 * means no class anywhere writes glDelete* in a destructor of its own and
 * a moved-from object can never double-free. */
#include <glad/gl.h>
#include <utility>

namespace game::gl {

template <void (*Delete)(GLuint)>
class Handle {
public:
    Handle() = default;
    explicit Handle(GLuint id) noexcept : m_id(id) {}
    ~Handle() { reset(); }

    Handle(const Handle&)            = delete;
    Handle& operator=(const Handle&) = delete;
    Handle(Handle&& o) noexcept : m_id(std::exchange(o.m_id, 0)) {}
    Handle& operator=(Handle&& o) noexcept {
        if (this != &o) { reset(); m_id = std::exchange(o.m_id, 0); }
        return *this;
    }

    void reset(GLuint id = 0) noexcept {
        if (m_id) Delete(m_id);
        m_id = id;
    }
    [[nodiscard]] GLuint get() const noexcept { return m_id; }
    explicit operator bool() const noexcept { return m_id != 0; }

private:
    GLuint m_id = 0;
};

namespace detail {
inline void deleteBuffer(GLuint id)       { glDeleteBuffers(1, &id); }
inline void deleteVertexArray(GLuint id)  { glDeleteVertexArrays(1, &id); }
inline void deleteTexture(GLuint id)      { glDeleteTextures(1, &id); }
inline void deleteFramebuffer(GLuint id)  { glDeleteFramebuffers(1, &id); }
inline void deleteRenderbuffer(GLuint id) { glDeleteRenderbuffers(1, &id); }
inline void deleteProgram(GLuint id)      { glDeleteProgram(id); }
inline void deleteShader(GLuint id)       { glDeleteShader(id); }
} // namespace detail

using BufferHandle       = Handle<detail::deleteBuffer>;
using VertexArrayHandle  = Handle<detail::deleteVertexArray>;
using TextureHandle      = Handle<detail::deleteTexture>;
using FramebufferHandle  = Handle<detail::deleteFramebuffer>;
using RenderbufferHandle = Handle<detail::deleteRenderbuffer>;
using ProgramHandle      = Handle<detail::deleteProgram>;
using ShaderHandle       = Handle<detail::deleteShader>;

} // namespace game::gl
