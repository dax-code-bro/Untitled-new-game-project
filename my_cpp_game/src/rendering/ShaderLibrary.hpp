#pragma once
#include "rendering/gl/Program.hpp"
#include <filesystem>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace game::rendering {

/* Loads GLSL from disk, expands #include, and hot-reloads.
 *
 *  - Every program gets "#version 450 core" plus its #defines prepended.
 *    450, not 460: nothing here needs 4.6's one real addition (SPIR-V),
 *    and 450 runs on every 4.5+ driver -- including the llvmpipe this is
 *    verified against.
 *  - #include "x.glsl" is expanded recursively, relative to the shader
 *    root, include-once. A "#line N S" marker is emitted at every file
 *    boundary so a driver error names the real file and line; the legend
 *    mapping S to a path is attached to the ShaderError.
 *  - reloadChanged() recompiles any program whose files changed on disk.
 *    The shared_ptr handed out by get() is updated IN PLACE, so every
 *    holder sees the new program with no re-fetch. A program that fails
 *    to recompile KEEPS ITS PREVIOUS BINARY and logs the error: a typo
 *    while playtesting must never take the running game down. */
class ShaderLibrary {
public:
    explicit ShaderLibrary(std::filesystem::path root);

    std::shared_ptr<gl::Program> get(const std::string& vert, const std::string& frag,
                                     const std::vector<std::string>& defines = {});

    int reloadChanged();                       // returns how many recompiled

    [[nodiscard]] const std::filesystem::path& root() const { return m_root; }

    struct Source { std::string text; std::string legend; std::vector<std::filesystem::path> deps; };
    Source preprocess(const std::string& file, const std::vector<std::string>& defines) const;

private:
    struct Entry {
        std::string vert, frag;
        std::vector<std::string> defines;
        std::shared_ptr<gl::Program> program;
        std::vector<std::pair<std::filesystem::path, std::filesystem::file_time_type>> stamps;
    };
    void compile(Entry& e) const;

    std::filesystem::path        m_root;
    std::map<std::string, Entry> m_entries;
};

} // namespace game::rendering
