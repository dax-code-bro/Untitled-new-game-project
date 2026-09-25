#pragma once
#include <string>
#include <vector>

namespace game::core {

/* Command line. The capture flags exist so every change can be shown as a
 * screenshot at any resolution, including ones the monitor cannot display:
 *   my_cpp_game --width 7680 --height 4320 --screenshot hero.png
 * renders offscreen at 8K and exits. */
struct Args {
    int         width      = 1600;
    int         height     = 900;
    int         frames     = 0;          // >0: render this many frames, then exit
    std::string screenshot;              // non-empty: save the last frame here
    std::string scene      = "showcase";
    std::string shot       = "hero";     // named camera in the scene
    std::string quality    = "ultra";    // ultra | cinematic
    int         textureRes = 2048;       // procedural bake size; 4096 for 4K textures
    float       scale      = 1.0f;       // render scale; 2 = 4x supersampling
    int         grass      = 24000;      // grass blades in the showcase
    int         debugMode  = 0;          // 1 shadow, 2 normal, 3 albedo, 4 roughness, 5 depth
    std::vector<std::string> disable;    // passes to switch off: shadows,env,ssao,...
    std::vector<std::string> sets;       // --set key=value look overrides (see Tunables)
    std::string look;                    // --look file.ini (default scripts/look.ini, watched)
    std::string eye, target;             // --eye x,y,z --target x,y,z: camera override
    float       fov        = 0.0f;       // --fov degrees (0 = the shot's own)
    bool        hidden     = false;      // no visible window (headless capture)
    bool        glDebug    = false;      // KHR_debug output, errors counted and printed
    bool        fullscreen = false;      // primary monitor at its native resolution
};

Args parseArgs(int argc, char** argv);

} // namespace game::core
