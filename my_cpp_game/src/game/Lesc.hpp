#pragma once
#include <nlohmann/json.hpp>

#include <cstdint>
#include <cstring>
#include <filesystem>
#include <stdexcept>
#include <vector>

namespace game::play {

/* A LESC container (tools/export_scene.js, tools/export_kit.js):
 * "LESC" | u32 version=1 | u32 jsonBytes | json | blob. Arrays in the JSON
 * are {off, count} into the blob. */
struct Lesc {
    nlohmann::json         doc;
    std::vector<uint8_t>   file;
    size_t                 blobAt = 0;

    explicit Lesc(const std::filesystem::path& path);

    template <class T>
    std::vector<T> array(const nlohmann::json& ref) const {
        if (ref.is_null()) return {};
        const size_t off = ref.at("off").get<size_t>();
        const size_t count = ref.at("count").get<size_t>();
        if (blobAt + off + count * sizeof(T) > file.size()) throw std::runtime_error("lesc: array runs past the blob");
        std::vector<T> v(count);
        if (count) std::memcpy(v.data(), file.data() + blobAt + off, count * sizeof(T));
        return v;
    }
};

} // namespace game::play
