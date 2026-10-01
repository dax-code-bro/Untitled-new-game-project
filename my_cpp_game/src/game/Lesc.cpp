#include "game/Lesc.hpp"

#include <fstream>
#include <iterator>

namespace game::play {

Lesc::Lesc(const std::filesystem::path& path) {
    std::ifstream f(path, std::ios::binary);
    if (!f) throw std::runtime_error("lesc: cannot open " + path.string());
    file.assign(std::istreambuf_iterator<char>(f), std::istreambuf_iterator<char>());
    if (file.size() < 12 || std::memcmp(file.data(), "LESC", 4) != 0)
        throw std::runtime_error("lesc: not a LESC file: " + path.string());
    uint32_t version = 0, jsonBytes = 0;
    std::memcpy(&version, file.data() + 4, 4);
    std::memcpy(&jsonBytes, file.data() + 8, 4);
    if (version != 1) throw std::runtime_error("lesc: unsupported version");
    if (12 + static_cast<size_t>(jsonBytes) > file.size()) throw std::runtime_error("lesc: truncated");
    doc = nlohmann::json::parse(file.begin() + 12, file.begin() + 12 + jsonBytes);
    blobAt = 12 + jsonBytes;
}

} // namespace game::play
