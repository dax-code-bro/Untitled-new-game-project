#pragma once
#include "rendering/gl/Texture.hpp"
#include <memory>
#include <vector>

namespace game::gl {

/* A render target: N colour attachments plus an optional depth texture,
 * all textures (so every pass can sample what an earlier one wrote). */
class Framebuffer {
public:
    Framebuffer() = default;
    Framebuffer(int w, int h, std::vector<GLenum> colorFormats, GLenum depthFormat = 0,
                GLenum filter = GL_LINEAR);

    void bind() const;                                 // binds + sets the viewport
    void clearColor(int attachment, float r, float g, float b, float a) const;
    void clearDepth(float d = 1.0f) const;
    void drawBuffers(const std::vector<GLenum>& attachments) const;  // mask which attachments a pass writes

    [[nodiscard]] const Texture& color(int i) const { return *m_colors.at(static_cast<size_t>(i)); }
    [[nodiscard]] const Texture* depth() const { return m_depth.get(); }
    [[nodiscard]] int    colorCount() const { return static_cast<int>(m_colors.size()); }
    [[nodiscard]] GLuint id()     const { return m_h.get(); }
    [[nodiscard]] int    width()  const { return m_w; }
    [[nodiscard]] int    height() const { return m_h2; }

    static void bindDefault(int w, int h);

private:
    FramebufferHandle                     m_h;
    std::vector<std::unique_ptr<Texture>> m_colors;
    std::unique_ptr<Texture>              m_depth;
    int m_w = 0, m_h2 = 0;
};

} // namespace game::gl
