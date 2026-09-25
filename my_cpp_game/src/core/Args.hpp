#pragma once
#include <string>

namespace game::core {

/* Command line. The capture flags exist so every change can be shown as a
 * screenshot at any resolution, including ones the monitor cannot display:
 *   my_cpp_game --width 7680 --height 4320 --frames 3 --screenshot hero.png
 * renders offscreen at 8K and exits. */
struct Args {
    int         width      = 1600;
    int         height     = 900;
    int         frames     = 0;          // >0: render this many frames, then exit
    std::string screenshot;              // non-empty: save the last frame here
    std::string scene      = "showcase";
    int         textureRes = 2048;       // procedural bake size; 4096 for 4K textures
    bool        hidden     = false;      // no visible window (headless capture)
};

Args parseArgs(int argc, char** argv);

} // namespace game::core
