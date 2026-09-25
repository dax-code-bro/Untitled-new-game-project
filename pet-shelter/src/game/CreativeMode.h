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
    std::string status;
    float statusTimer = 0.0f;

    void focusOn(vec3 p) { target = p; }
    void update(float dt, const Input& in, World& world, Sim& sim, const Camera& cam, int screenW, int screenH);
    void applyCamera(Camera& cam) const;
    void drawUI(Sim& sim, float& timeScale);
    void drawTouchUI(float& timeScale);
};

}  // namespace ps
