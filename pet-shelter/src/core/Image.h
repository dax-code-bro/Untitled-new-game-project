// Screenshot writer (uncompressed-deflate PNG, no dependencies).
#pragma once
#include <string>
#include <vector>
#include <cstdint>

namespace ps {
// rgb: width*height*3 bytes, rows bottom-to-top (as glReadPixels returns)
bool writePNG(const std::string& path, int width, int height, const std::vector<uint8_t>& rgb, bool flipY = true);
}
