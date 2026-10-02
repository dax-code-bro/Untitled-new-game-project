#include "game/Hud.hpp"

#include <glad/gl.h>

#include <algorithm>
#include <cctype>
#include <cstddef>
#include <cstring>

namespace game::play {

namespace {

#include "game/HudFont.inc"

/* Capitals only, as the bitmap face was: the HUD is set in caps throughout,
   and the weapon names come from the web game in mixed case. A lower-case
   x stays one -- it is the multiplication sign in "x2". */
char shape(char c) {
    if (c == 'x') return c;
    return static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
}

const hudfont::Glyph* glyph(char c) {
    const int i = static_cast<unsigned char>(c) - 32;
    return (i >= 0 && i < 95) ? &hudfont::kGlyphs[i] : nullptr;
}

// A little air between capitals, which a HUD set in caps wants.
constexpr float kTracking = 0.06f * hudfont::kEm;

} // namespace

Hud::Hud(rendering::ShaderLibrary& shaders) : m_shaders(shaders) {
    m_prog = shaders.get("hud.vert", "hud.frag");
    gl::TextureDesc d;
    d.width = hudfont::kAtlasW;
    d.height = hudfont::kAtlasH;
    d.levels = 0;                               // full chain: the weapon list is drawn at a third of the atlas
    d.internalFormat = GL_R8;
    d.minFilter = GL_LINEAR_MIPMAP_LINEAR;
    m_atlas = gl::Texture(d);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    m_atlas.upload(0, hudfont::kAtlasW, hudfont::kAtlasH, GL_RED, GL_UNSIGNED_BYTE, hudfont::kAtlas);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
    m_atlas.generateMips();
}

float Hud::textWidth(const std::string& s, float px) {
    const float k = 7.0f * px / hudfont::kCapHeight;
    float w = 0.0f;
    for (char ch : s)
        if (const hudfont::Glyph* g = glyph(shape(ch))) w += (g->adv + kTracking) * k;
    return s.empty() ? 0.0f : w - kTracking * k;
}

void Hud::begin(int w, int h) {
    m_w = w;
    m_h = h;
    m_v.clear();
}

void Hud::quad(glm::vec2 a, glm::vec2 b, glm::vec2 ua, glm::vec2 ub, const glm::vec4& c, float soft) {
    const V v0{a, ua, c, soft}, v1{{b.x, a.y}, {ub.x, ua.y}, c, soft}, v2{b, ub, c, soft}, v3{{a.x, b.y}, {ua.x, ub.y}, c, soft};
    m_v.push_back(v0); m_v.push_back(v1); m_v.push_back(v2);
    m_v.push_back(v0); m_v.push_back(v2); m_v.push_back(v3);
}

void Hud::rect(float x, float y, float w, float h, const glm::vec4& c) {
    quad({x, y}, {x + w, y + h}, {-1.0f, -1.0f}, {-1.0f, -1.0f}, c);
}

void Hud::text(const std::string& s, float x, float y, float px, const glm::vec4& c, int align) {
    const float w = textWidth(s, px);
    if (align == 1) x -= w * 0.5f;
    else if (align == 2) x -= w;
    const float k = 7.0f * px / hudfont::kCapHeight;     // screen px per atlas px
    const float base = y + hudfont::kCapHeight * k;      // the baseline
    const glm::vec2 inv(1.0f / hudfont::kAtlasW, 1.0f / hudfont::kAtlasH);
    /* The shadow first, under the whole string: the same glyphs, offset down
       and right by a few per cent of their height, dark and soft-edged. */
    const glm::vec2 off(std::max(1.0f, px * 0.35f), std::max(1.0f, px * 0.45f));
    const glm::vec4 shade(0.0f, 0.0f, 0.0f, c.a * 0.55f);
    for (int pass = 0; pass < 2; ++pass) {
        float pen = x;
        for (char ch : s) {
            const hudfont::Glyph* g = glyph(shape(ch));
            if (!g) continue;
            if (g->w > 0) {
                glm::vec2 a(pen + g->ox * k, base + g->oy * k);
                if (pass == 0) a += off;
                const glm::vec2 b = a + glm::vec2(g->w, g->h) * k;
                quad(a, b, glm::vec2(g->ax, g->ay) * inv, glm::vec2(g->ax + g->w, g->ay + g->h) * inv,
                     pass == 0 ? shade : c, pass == 0 ? 1.0f : 0.0f);
            }
            pen += (g->adv + kTracking) * k;
        }
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
        m_vao.attribute(2, 0, 2, GL_FLOAT, offsetof(V, uv));
        m_vao.attribute(3, 0, 1, GL_FLOAT, offsetof(V, soft));
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
    m_prog->set("uAtlas", 0);
    m_prog->set("uSpread", hudfont::kSpread);
    m_atlas.bind(0);
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
