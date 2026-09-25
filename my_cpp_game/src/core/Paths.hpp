#pragma once
#include <filesystem>

namespace game::core {

/* Where the game's data lives -- shaders/, scripts/, scenes/.
 *
 * A developer build reads the SOURCE tree (GAME_SOURCE_DIR), which is what
 * makes editing a .glsl or look.ini hot-reload the running game. A shipped
 * build has no source tree: the folders sit next to the executable, and a
 * double-clicked .exe does not necessarily start in its own directory, so
 * the executable's own path is asked for rather than the working one.
 * The first of these that contains shaders/ wins: the source tree, the
 * executable's directory, the working directory. */
std::filesystem::path dataRoot();
std::filesystem::path executableDir();

} // namespace game::core
