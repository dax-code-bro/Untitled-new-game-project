#pragma once
#include "rendering/ShaderLibrary.hpp"
#include "rendering/gl/Buffer.hpp"
#include "rendering/gl/VertexArray.hpp"

#include <glm/glm.hpp>

#include <memory>
#include <string>
#include <vector>

namespace game::play {

/* THE HUD: flat coloured quads in pixels, and text set in a 5x7 bitmap face
 * built into the source (one quad per lit pixel -- no font file, no atlas).
 * Drawn into the renderer's output target after the frame, so a
 * screenshot carries it exactly as the window shows it. */
class Hud {
public:
    explicit Hud(rendering::ShaderLibrary& shaders);

    void begin(int width, int height);
    void rect(float x, float y, float w, float h, const glm::vec4& c);
    /* align: 0 left, 1 centre, 2 right. `px` is the size of one font pixel. */
    void text(const std::string& s, float x, float y, float px, const glm::vec4& c, int align = 0);
    [[nodiscard]] static float textWidth(const std::string& s, float px) { return s.size() * 6.0f * px - px; }
    void end(unsigned framebuffer);

    [[nodiscard]] int width() const { return m_w; }
    [[nodiscard]] int height() const { return m_h; }

private:
    struct V { glm::vec2 p; glm::vec4 c; };
    std::shared_ptr<gl::Program> m_prog;
    rendering::ShaderLibrary& m_shaders;
    std::unique_ptr<gl::Buffer> m_vbo;
    gl::VertexArray m_vao;
    size_t m_cap = 0;
    std::vector<V> m_v;
    int m_w = 1, m_h = 1;
};

} // namespace game::play
