// Untitled Pet Shelter Game - entry point.
#include "game/Game.h"

int main(int argc, char** argv) {
    ps::Game game;
    if (!game.init(argc, argv)) return 1;
    int code = game.run();
    game.shutdown();
    return code;
}
