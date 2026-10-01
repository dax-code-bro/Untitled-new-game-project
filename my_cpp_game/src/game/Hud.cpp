#include "game/Hud.hpp"

#include <glad/gl.h>

#include <cctype>
#include <cstring>

namespace game::play {

namespace {

/* 5x7, one string of seven rows per glyph, '#' lit. */
struct Glyph { char c; const char* rows[7]; };
const Glyph kFont[] = {
    {'0', {" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "}},
    {'1', {"  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "}},
    {'2', {" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"}},
    {'3', {"#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "}},
    {'4', {"   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "}},
    {'5', {"#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "}},
    {'6', {"  ## ", " #   ", "#    ", "#### ", "#   #", "#   #", " ### "}},
    {'7', {"#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "}},
    {'8', {" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "}},
    {'9', {" ### ", "#   #", "#   #", " ####", "    #", "   # ", " ##  "}},
    {'A', {" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"}},
    {'B', {"#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "}},
    {'C', {" ### ", "#   #", "#    ", "#    ", "#    ", "#   #", " ### "}},
    {'D', {"#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "}},
    {'E', {"#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"}},
    {'F', {"#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "}},
    {'G', {" ### ", "#   #", "#    ", "# ###", "#   #", "#   #", " ####"}},
    {'H', {"#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"}},
    {'I', {" ### ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "}},
    {'J', {"  ###", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  "}},
    {'K', {"#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"}},
    {'L', {"#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"}},
    {'M', {"#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"}},
    {'N', {"#   #", "#   #", "##  #", "# # #", "#  ##", "#   #", "#   #"}},
    {'O', {" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "}},
    {'P', {"#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "}},
    {'Q', {" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"}},
    {'R', {"#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"}},
    {'S', {" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "}},
    {'T', {"#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "}},
    {'U', {"#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "}},
    {'V', {"#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "}},
    {'W', {"#   #", "#   #", "#   #", "# # #", "# # #", "# # #", " # # "}},
    {'X', {"#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"}},
    {'Y', {"#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "}},
    {'Z', {"#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"}},
    {':', {"     ", "  #  ", "  #  ", "     ", "  #  ", "  #  ", "     "}},
    {'/', {"    #", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "}},
    {'-', {"     ", "     ", "     ", " ### ", "     ", "     ", "     "}},
    {'+', {"     ", "  #  ", "  #  ", "#####", "  #  ", "  #  ", "     "}},
    {'.', {"     ", "     ", "     ", "     ", "     ", " ##  ", " ##  "}},
    {',', {"     ", "     ", "     ", "     ", " ##  ", "  #  ", " #   "}},
    {'!', {"  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "     ", "  #  "}},
    {'?', {" ### ", "#   #", "    #", "   # ", "  #  ", "     ", "  #  "}},
    {'%', {"##   ", "##  #", "   # ", "  #  ", " #   ", "#  ##", "   ##"}},
    {'(', {"   # ", "  #  ", " #   ", " #   ", " #   ", "  #  ", "   # "}},
    {')', {" #   ", "  #  ", "   # ", "   # ", "   # ", "  #  ", " #   "}},
    {'\'', {"  #  ", "  #  ", " #   ", "     ", "     ", "     ", "     "}},
    {'x', {"     ", "     ", "#   #", " # # ", "  #  ", " # # ", "#   #"}},
};

const Glyph* glyph(char c) {
    if (c != 'x') c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
    for (const auto& g : kFont) if (g.c == c) return &g;
    return nullptr;
}

} // namespace

Hud::Hud(rendering::ShaderLibrary& shaders) : m_shaders(shaders) {
    m_prog = shaders.get("hud.vert", "hud.frag");
}

void Hud::begin(int w, int h) {
    m_w = w;
    m_h = h;
    m_v.clear();
}

void Hud::rect(float x, float y, float w, float h, const glm::vec4& c) {
    const glm::vec2 a(x, y), b(x + w, y), d(x + w, y + h), e(x, y + h);
    m_v.push_back({a, c}); m_v.push_back({b, c}); m_v.push_back({d, c});
    m_v.push_back({a, c}); m_v.push_back({d, c}); m_v.push_back({e, c});
}

void Hud::text(const std::string& s, float x, float y, float px, const glm::vec4& c, int align) {
    const float w = textWidth(s, px);
    if (align == 1) x -= w * 0.5f;
    else if (align == 2) x -= w;
    for (char ch : s) {
        if (const Glyph* g = glyph(ch)) {
            for (int r = 0; r < 7; ++r) {
                const char* row = g->rows[r];
                // Runs of lit pixels in a row become one quad.
                for (int k = 0; k < 5;) {
                    if (row[k] != '#') { ++k; continue; }
                    int e = k;
                    while (e < 5 && row[e] == '#') ++e;
                    rect(x + k * px, y + r * px, (e - k) * px, px, c);
                    k = e;
                }
            }
        }
        x += 6.0f * px;
    }
}

void Hud::end(unsigned fbo) {
    if (m_v.empty()) return;
    const size_t bytes = m_v.size() * sizeof(V);
    if (!m_vbo || bytes > m_cap) {
        m_cap = bytes * 2;
        m_vbo = std::make_unique<gl::Buffer>(static_cast<GLsizeiptr>(m_cap), nullptr);
        m_vao.vertexBuffer(0, *m_vbo, 0, sizeof(V));
        m_vao.attribute(0, 0, 2, GL_FLOAT, offsetof(V, p));
        m_vao.attribute(1, 0, 4, GL_FLOAT, offsetof(V, c));
    }
    m_vbo->update(0, static_cast<GLsizeiptr>(bytes), m_v.data());
    m_prog = m_shaders.get("hud.vert", "hud.frag");
    // Leave the GL state as the renderer had it.
    const GLboolean depth = glIsEnabled(GL_DEPTH_TEST), cull = glIsEnabled(GL_CULL_FACE), blend = glIsEnabled(GL_BLEND);
    GLint srcRgb = 0, dstRgb = 0, srcA = 0, dstA = 0;
    glGetIntegerv(GL_BLEND_SRC_RGB, &srcRgb); glGetIntegerv(GL_BLEND_DST_RGB, &dstRgb);
    glGetIntegerv(GL_BLEND_SRC_ALPHA, &srcA); glGetIntegerv(GL_BLEND_DST_ALPHA, &dstA);
    glBindFramebuffer(GL_FRAMEBUFFER, fbo);
    glViewport(0, 0, m_w, m_h);
    glDisable(GL_DEPTH_TEST);
    glDisable(GL_CULL_FACE);
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    m_prog->use();
    m_prog->set("uScreen", glm::vec2(static_cast<float>(m_w), static_cast<float>(m_h)));
    m_vao.bind();
    glDrawArrays(GL_TRIANGLES, 0, static_cast<GLsizei>(m_v.size()));
    glBindVertexArray(0);
    if (depth) glEnable(GL_DEPTH_TEST);
    if (cull) glEnable(GL_CULL_FACE);
    if (!blend) glDisable(GL_BLEND);
    glBlendFuncSeparate(static_cast<GLenum>(srcRgb), static_cast<GLenum>(dstRgb), static_cast<GLenum>(srcA), static_cast<GLenum>(dstA));
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
}

} // namespace game::play
