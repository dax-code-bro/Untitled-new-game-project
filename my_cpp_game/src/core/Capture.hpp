#pragma once
#include <glad/gl.h>
#include <cstdint>
#include <string>
#include <vector>

namespace game::core {

/* Read an RGBA8 colour attachment back, TOP ROW FIRST (GL returns the
 * bottom row first; everything that consumes an image expects the other
 * way up). */
std::vector<uint8_t> readRGBA8(GLuint framebuffer, int w, int h,
                               GLenum attachment = GL_COLOR_ATTACHMENT0);

/* Write top-row-first RGBA8 to PNG. Throws on failure. */
void savePNG(const std::string& path, int w, int h, const std::vector<uint8_t>& rgba);

} // namespace game::core
