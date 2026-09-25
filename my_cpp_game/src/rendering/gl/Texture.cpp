#include "rendering/gl/Texture.hpp"
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace game::gl {

int Texture::fullMipCount(int w, int h) {
    return 1 + static_cast<int>(std::floor(std::log2(static_cast<double>(std::max(w, h)))));
}

float Texture::maxAnisotropy() {
    /* Core in 4.6; the EXT with identical enums everywhere below it,
       including llvmpipe's 4.5. Queried once. */
    static const float value = [] {
        GLfloat v = 1.0f;
        glGetFloatv(GL_MAX_TEXTURE_MAX_ANISOTROPY, &v);
        while (glGetError() != GL_NO_ERROR) {}
        return v < 1.0f ? 1.0f : v;
    }();
    return value;
}

Texture::Texture(const TextureDesc& d) : m_desc(d) {
    if (d.width <= 0 || d.height <= 0) throw std::invalid_argument("Texture: bad size");
    if (m_desc.levels <= 0) m_desc.levels = fullMipCount(d.width, d.height);

    GLuint id = 0;
    glCreateTextures(d.target, 1, &id);
    m_h.reset(id);
    glTextureStorage2D(id, m_desc.levels, d.internalFormat, d.width, d.height);

    glTextureParameteri(id, GL_TEXTURE_MIN_FILTER, static_cast<GLint>(d.minFilter));
    glTextureParameteri(id, GL_TEXTURE_MAG_FILTER, static_cast<GLint>(d.magFilter));
    glTextureParameteri(id, GL_TEXTURE_WRAP_S, static_cast<GLint>(d.wrap));
    glTextureParameteri(id, GL_TEXTURE_WRAP_T, static_cast<GLint>(d.wrap));
    if (d.target == GL_TEXTURE_CUBE_MAP) {
        glTextureParameteri(id, GL_TEXTURE_WRAP_R, static_cast<GLint>(d.wrap));
        glTextureParameteri(id, GL_TEXTURE_CUBE_MAP_SEAMLESS, GL_TRUE);
    }
    glTextureParameteri(id, GL_TEXTURE_BASE_LEVEL, 0);
    glTextureParameteri(id, GL_TEXTURE_MAX_LEVEL, m_desc.levels - 1);
    if (d.anisotropy > 1.0f)
        glTextureParameterf(id, GL_TEXTURE_MAX_ANISOTROPY, std::min(d.anisotropy, maxAnisotropy()));
    if (d.depthCompare) {
        glTextureParameteri(id, GL_TEXTURE_COMPARE_MODE, GL_COMPARE_REF_TO_TEXTURE);
        glTextureParameteri(id, GL_TEXTURE_COMPARE_FUNC, GL_LEQUAL);
    }
}

void Texture::upload(int level, int w, int h, GLenum format, GLenum type, const void* data) {
    glTextureSubImage2D(m_h.get(), level, 0, 0, w, h, format, type, data);
}

void Texture::uploadFace(int face, int level, int w, int h, GLenum format, GLenum type, const void* data) {
    if (m_desc.target != GL_TEXTURE_CUBE_MAP) throw std::logic_error("uploadFace on a non-cube texture");
    glTextureSubImage3D(m_h.get(), level, 0, 0, face, w, h, 1, format, type, data);
}

void Texture::generateMips() { glGenerateTextureMipmap(m_h.get()); }

} // namespace game::gl
