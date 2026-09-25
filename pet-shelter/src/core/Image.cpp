#include "core/Image.h"
#include <algorithm>
#include <cstdio>

namespace ps {

static uint32_t crcTable[256];
static void initCrc() {
    static bool done = false;
    if (done) return;
    for (uint32_t n = 0; n < 256; ++n) {
        uint32_t c = n;
        for (int k = 0; k < 8; ++k) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1;
        crcTable[n] = c;
    }
    done = true;
}
static uint32_t crc(const uint8_t* d, size_t n, uint32_t c = 0xFFFFFFFFu) {
    for (size_t i = 0; i < n; ++i) c = crcTable[(c ^ d[i]) & 0xFF] ^ (c >> 8);
    return c;
}
static void be32(std::vector<uint8_t>& v, uint32_t x) {
    v.push_back(uint8_t(x >> 24)); v.push_back(uint8_t(x >> 16)); v.push_back(uint8_t(x >> 8)); v.push_back(uint8_t(x));
}
static void chunk(FILE* f, const char* type, const std::vector<uint8_t>& data) {
    std::vector<uint8_t> buf;
    be32(buf, uint32_t(data.size()));
    buf.insert(buf.end(), type, type + 4);
    buf.insert(buf.end(), data.begin(), data.end());
    uint32_t c = crc(buf.data() + 4, buf.size() - 4) ^ 0xFFFFFFFFu;
    be32(buf, c);
    std::fwrite(buf.data(), 1, buf.size(), f);
}

bool writePNG(const std::string& path, int w, int h, const std::vector<uint8_t>& rgb, bool flipY) {
    initCrc();
    FILE* f = std::fopen(path.c_str(), "wb");
    if (!f) return false;
    const uint8_t sig[8] = {137, 80, 78, 71, 13, 10, 26, 10};
    std::fwrite(sig, 1, 8, f);
    std::vector<uint8_t> ihdr;
    be32(ihdr, uint32_t(w)); be32(ihdr, uint32_t(h));
    ihdr.insert(ihdr.end(), {8, 2, 0, 0, 0});
    chunk(f, "IHDR", ihdr);
    // Raw scanlines (filter byte 0), wrapped in stored (uncompressed) deflate blocks.
    std::vector<uint8_t> raw;
    raw.reserve(size_t(h) * (size_t(w) * 3 + 1));
    for (int y = 0; y < h; ++y) {
        int sy = flipY ? h - 1 - y : y;
        raw.push_back(0);
        raw.insert(raw.end(), rgb.begin() + long(size_t(sy) * size_t(w) * 3), rgb.begin() + long(size_t(sy + 1) * size_t(w) * 3));
    }
    std::vector<uint8_t> z{0x78, 0x01};
    size_t pos = 0;
    while (pos < raw.size() || raw.empty()) {
        size_t n = std::min<size_t>(65535, raw.size() - pos);
        bool last = pos + n >= raw.size();
        z.push_back(last ? 1 : 0);
        z.push_back(uint8_t(n)); z.push_back(uint8_t(n >> 8));
        z.push_back(uint8_t(~n)); z.push_back(uint8_t((~n) >> 8));
        z.insert(z.end(), raw.begin() + long(pos), raw.begin() + long(pos + n));
        pos += n;
        if (last) break;
    }
    uint32_t a = 1, b = 0;
    for (uint8_t v : raw) { a = (a + v) % 65521; b = (b + a) % 65521; }
    be32(z, (b << 16) | a);
    chunk(f, "IDAT", z);
    chunk(f, "IEND", {});
    std::fclose(f);
    return true;
}

}  // namespace ps
