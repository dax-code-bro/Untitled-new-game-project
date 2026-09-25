#include "core/Args.hpp"
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <string>

namespace game::core {

Args parseArgs(int argc, char** argv) {
    Args a;
    auto need = [&](int& i) -> const char* {
        if (i + 1 >= argc) throw std::invalid_argument(std::string("missing value after ") + argv[i]);
        return argv[++i];
    };
    for (int i = 1; i < argc; ++i) {
        const char* k = argv[i];
        if      (!std::strcmp(k, "--width"))       a.width      = std::atoi(need(i));
        else if (!std::strcmp(k, "--height"))      a.height     = std::atoi(need(i));
        else if (!std::strcmp(k, "--frames"))      a.frames     = std::atoi(need(i));
        else if (!std::strcmp(k, "--screenshot"))  a.screenshot = need(i);
        else if (!std::strcmp(k, "--scene"))       a.scene      = need(i);
        else if (!std::strcmp(k, "--texture-res")) a.textureRes = std::atoi(need(i));
        else if (!std::strcmp(k, "--hidden"))      a.hidden     = true;
        else throw std::invalid_argument(std::string("unknown argument ") + k);
    }
    if (a.width <= 0 || a.height <= 0) throw std::invalid_argument("width/height must be positive");
    if (!a.screenshot.empty()) { a.hidden = true; if (a.frames <= 0) a.frames = 3; }
    return a;
}

} // namespace game::core
