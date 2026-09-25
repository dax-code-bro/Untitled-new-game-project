#include "rendering/gl/Framebuffer.hpp"
#include <stdexcept>
#include <string>

namespace game::gl {

Framebuffer::Framebuffer(int w, int h, std::vector<GLenum> colorFormats, GLenum depthFormat, GLenum filter)
    : m_w(w), m_h2(h) {
    GLuint id = 0;
    glCreateFramebuffers(1, &id);
    m_h.reset(id);

    std::vector<GLenum> bufs;
    for (size_t i = 0; i < colorFormats.size(); ++i) {
        TextureDesc d;
        d.width = w; d.height = h; d.internalFormat = colorFormats[i];
        d.minFilter = filter; d.magFilter = filter;
        m_colors.push_back(std::make_unique<Texture>(d));
        glNamedFramebufferTexture(id, GL_COLOR_ATTACHMENT0 + static_cast<GLenum>(i), m_colors.back()->id(), 0);
        bufs.push_back(GL_COLOR_ATTACHMENT0 + static_cast<GLenum>(i));
    }
    if (depthFormat) {
        TextureDesc d;
        d.width = w; d.height = h; d.internalFormat = depthFormat;
        d.minFilter = GL_NEAREST; d.magFilter = GL_NEAREST;
        m_depth = std::make_unique<Texture>(d);
        glNamedFramebufferTexture(id, GL_DEPTH_ATTACHMENT, m_depth->id(), 0);
    }
    if (bufs.empty()) {
        glNamedFramebufferDrawBuffer(id, GL_NONE);
        glNamedFramebufferReadBuffer(id, GL_NONE);
    } else {
        glNamedFramebufferDrawBuffers(id, static_cast<GLsizei>(bufs.size()), bufs.data());
    }

    const GLenum status = glCheckNamedFramebufferStatus(id, GL_FRAMEBUFFER);
    if (status != GL_FRAMEBUFFER_COMPLETE)
        throw std::runtime_error("Framebuffer incomplete: 0x" + [&] {
            char b[16]; std::snprintf(b, sizeof b, "%x", status); return std::string(b); }());
}

void Framebuffer::bind() const {
    glBindFramebuffer(GL_FRAMEBUFFER, m_h.get());
    glViewport(0, 0, m_w, m_h2);
}

void Framebuffer::clearColor(int attachment, float r, float g, float b, float a) const {
    const GLfloat c[4] = {r, g, b, a};
    glClearNamedFramebufferfv(m_h.get(), GL_COLOR, attachment, c);
}

void Framebuffer::clearDepth(float d) const {
    glClearNamedFramebufferfv(m_h.get(), GL_DEPTH, 0, &d);
}

void Framebuffer::drawBuffers(const std::vector<GLenum>& a) const {
    glNamedFramebufferDrawBuffers(m_h.get(), static_cast<GLsizei>(a.size()), a.data());
}

void Framebuffer::bindDefault(int w, int h) {
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glViewport(0, 0, w, h);
}

} // namespace game::gl
