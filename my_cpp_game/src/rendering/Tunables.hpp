#pragma once
#include "rendering/Renderer.hpp"

#include <filesystem>
#include <string>
#include <vector>

namespace game::rendering {

/* Every look knob on the Renderer by name -- "sun.intensity",
 * "sky.horizon", "post.contrast", "volumetric.anisotropy" -- so the look
 * can be changed without a rebuild, from the command line (--set k=v) or
 * from a file the running game watches:
 *
 *     scripts/look.ini       one "key = value" per line, # comments
 *                            vec3 values are "r g b" or "r, g, b"
 *
 * Saving the file re-applies it on the next frame, which is the same
 * edit-and-see loop the shader library gives GLSL. */
bool setTunable(Renderer& r, const std::string& key, const std::string& value, std::string* error = nullptr);
std::vector<std::string> tunableNames();

class TunableFile {
public:
    explicit TunableFile(std::filesystem::path path) : m_path(std::move(path)) {}
    /* Applies the file if it changed since the last call. Returns the
       number of keys applied (0 if unchanged or missing). */
    int reloadIfChanged(Renderer& r);
private:
    std::filesystem::path m_path;
    std::filesystem::file_time_type m_stamp{};
    bool m_loaded = false;
};

} // namespace game::rendering
