// Untitled Pet Shelter Game - entry point.
#include "game/Game.h"

int main(int argc, char** argv) {
    static ps::Game game;   // static: the browser main loop outlives main()
    if (!game.init(argc, argv)) return 1;
    int code = game.run();
    game.shutdown();
    return code;
}
