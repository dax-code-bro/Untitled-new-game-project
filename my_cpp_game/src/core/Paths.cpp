#include "core/Paths.hpp"

#include <stdexcept>
#include <string>
#include <vector>

#ifdef _WIN32
#  define WIN32_LEAN_AND_MEAN
#  ifndef NOMINMAX
#    define NOMINMAX
#  endif
#  include <windows.h>
#endif

namespace game::core {

namespace fs = std::filesystem;

fs::path executableDir() {
#ifdef _WIN32
    std::vector<wchar_t> buf(32768);
    const DWORD n = GetModuleFileNameW(nullptr, buf.data(), static_cast<DWORD>(buf.size()));
    if (n > 0 && n < buf.size()) return fs::path(std::wstring(buf.data(), n)).parent_path();
#else
    std::error_code ec;
    const fs::path self = fs::read_symlink("/proc/self/exe", ec);
    if (!ec) return self.parent_path();
#endif
    return fs::current_path();
}

fs::path dataRoot() {
    std::vector<fs::path> candidates;
#ifdef GAME_SOURCE_DIR
    candidates.emplace_back(GAME_SOURCE_DIR);
#endif
    candidates.push_back(executableDir());
    candidates.push_back(fs::current_path());
    for (const auto& c : candidates) {
        std::error_code ec;
        if (fs::is_directory(c / "shaders", ec)) return c;
    }
    throw std::runtime_error("cannot find the game's shaders/ folder next to the executable");
}

} // namespace game::core
