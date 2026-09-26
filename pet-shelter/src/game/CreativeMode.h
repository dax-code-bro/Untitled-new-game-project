// Creative mode: free build camera (like Planet Zoo / Jurassic World
// Evolution) + placing and demolishing buildables inside the barrier.
#pragma once
#include "core/Input.h"
#include "game/Sim.h"
#include "render/Renderer.h"
#include "world/World.h"
#include <string>

namespace ps {

class CreativeMode {
public:
    vec3 target{0, 0, 30};
    float distance = 90.0f;
    float yaw = radians(200.0f);
    float pitch = radians(-38.0f);

    int tool = -1;          // -1 = none, -2 = demolish, else BuildKind
    int rotation = 0;
    int category = int(BuildCat::Operations);
    bool snap = true;
    bool touchUI = false;      // phone layout: one scrolling strip, room for on-screen controls
    // Fast travel: with no tool picked, clicking the shelter (or the pet store) takes you there on foot.
    int hoverTravel = 0;       // 1 shelter, 2 pet store (under the cursor)
    int travelRequest = 0;     // set on click; the game performs the trip
    std::string status;
    float statusTimer = 0.0f;

    void focusOn(vec3 p) { target = p; }
    void update(float dt, const Input& in, World& world, Sim& sim, const Camera& cam, int screenW, int screenH);
    void applyCamera(Camera& cam) const;
    void drawUI(Sim& sim, float& timeScale);
    void drawTouchUI(float& timeScale);
};

}  // namespace ps
