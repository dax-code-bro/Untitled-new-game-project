#include "core/Capture.hpp"

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include <stb_image_write.h>

#include <stdexcept>

namespace game::core {

std::vector<uint8_t> readRGBA8(GLuint fb, int w, int h, GLenum attachment) {
    std::vector<uint8_t> px(static_cast<size_t>(w) * static_cast<size_t>(h) * 4u);
    glBindFramebuffer(GL_READ_FRAMEBUFFER, fb);
    if (fb) glNamedFramebufferReadBuffer(fb, attachment);
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glReadPixels(0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, px.data());
    glBindFramebuffer(GL_READ_FRAMEBUFFER, 0);

    const size_t row = static_cast<size_t>(w) * 4u;
    std::vector<uint8_t> tmp(row);
    for (int y = 0; y < h / 2; ++y) {
        uint8_t* a = px.data() + static_cast<size_t>(y) * row;
        uint8_t* b = px.data() + static_cast<size_t>(h - 1 - y) * row;
        std::copy(a, a + row, tmp.data());
        std::copy(b, b + row, a);
        std::copy(tmp.data(), tmp.data() + row, b);
    }
    return px;
}

void savePNG(const std::string& path, int w, int h, const std::vector<uint8_t>& rgba) {
    if (rgba.size() != static_cast<size_t>(w) * static_cast<size_t>(h) * 4u)
        throw std::invalid_argument("savePNG: buffer size does not match " + std::to_string(w) + "x" + std::to_string(h));
    if (!stbi_write_png(path.c_str(), w, h, 4, rgba.data(), w * 4))
        throw std::runtime_error("savePNG: could not write " + path);
}

} // namespace game::core
