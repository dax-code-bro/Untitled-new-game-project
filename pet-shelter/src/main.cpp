// Untitled Pet Shelter Game - entry point.
#include "game/Game.h"

int main(int argc, char** argv) {
#ifdef __EMSCRIPTEN__
    static ps::Game game;   // the browser main loop outlives main()
#else
    ps::Game game;          // destroyed before the GL context goes away
#endif
    if (!game.init(argc, argv)) return 1;
    int code = game.run();
    game.shutdown();
    return code;
}
