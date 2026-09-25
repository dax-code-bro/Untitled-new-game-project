// Character customization screen (first thing in every new game).
#pragma once
#include "game/Character.h"

namespace ps {

struct CharacterCreatorUI {
    enum Result { None, Start, Back };
    float previewYaw = 0.0f;
    float zoom = 0.0f;       // 0 = full body, 1 = face close-up
    Rng rng{1234};
    // Draws the panel. Sets `changed` when the model needs rebuilding.
    Result draw(Appearance& a, bool& changed);
};

}  // namespace ps
