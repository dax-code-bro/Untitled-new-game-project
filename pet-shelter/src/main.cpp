// Untitled Pet Shelter Game - entry point.
#include "game/Game.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

int main(int argc, char** argv) {
#ifdef __EMSCRIPTEN__
    static ps::Game game;   // the browser main loop outlives main()
#else
    ps::Game game;          // destroyed before the GL context goes away
#endif
    if (!game.init(argc, argv)) {
#ifdef __EMSCRIPTEN__
        EM_ASM({ if (window.psGameFailed) window.psGameFailed(); });
#endif
        return 1;
    }
    int code = game.run();
    game.shutdown();
    return code;
}
