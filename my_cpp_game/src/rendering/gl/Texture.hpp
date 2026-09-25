#pragma once
#include "rendering/gl/Handle.hpp"

namespace game::gl {

struct TextureDesc {
    GLenum target         = GL_TEXTURE_2D;   // or GL_TEXTURE_CUBE_MAP
    int    width          = 1;
    int    height         = 1;
    int    levels         = 1;               // 0 = full mip chain
    GLenum internalFormat = GL_RGBA8;
    GLenum minFilter      = GL_LINEAR;
    GLenum magFilter      = GL_LINEAR;
    GLenum wrap           = GL_CLAMP_TO_EDGE;
    float  anisotropy     = 0.0f;            // 0 = off; clamped to the driver maximum
    bool   depthCompare   = false;           // shadow-map sampler (sampler2DShadow)
};

/* Immutable-storage texture (glTextureStorage2D) -- 2D or cube.
 *
 * Immutable storage is not a style choice: it is what makes a texture
 * mip-complete by construction. The WebGL engine lost a whole cube probe
 * to a single missing level once -- a cube with only level 0 and a
 * mipmapped filter samples BLACK on every face with no error at all --
 * and glTextureStorage allocates every level up front so that bug cannot
 * be written here. */
class Texture {
public:
    Texture() = default;
    explicit Texture(const TextureDesc& d);

    static int fullMipCount(int w, int h);

    void upload(int level, int w, int h, GLenum format, GLenum type, const void* data);
    void uploadFace(int face, int level, int w, int h, GLenum format, GLenum type, const void* data);
    void generateMips();
    void bind(GLuint unit) const { glBindTextureUnit(unit, m_h.get()); }

    [[nodiscard]] GLuint id()     const { return m_h.get(); }
    [[nodiscard]] int    width()  const { return m_desc.width; }
    [[nodiscard]] int    height() const { return m_desc.height; }
    [[nodiscard]] int    levels() const { return m_desc.levels; }
    [[nodiscard]] GLenum target() const { return m_desc.target; }
    [[nodiscard]] GLenum format() const { return m_desc.internalFormat; }
    explicit operator bool() const { return static_cast<bool>(m_h); }

    static float maxAnisotropy();

private:
    TextureHandle m_h;
    TextureDesc   m_desc;
};

} // namespace game::gl
