// POV mode: locked first-person movement with collision.
#pragma once
#include "core/Input.h"
#include "render/Renderer.h"
#include "world/Collision.h"

namespace ps {

class PlayerController {
public:
    vec3 feet{0, 0, 9};
    float yaw = kPi;        // radians; yaw=pi looks toward -Z (north, at the building)
    float pitch = 0.0f;
    float eyeHeight = 1.65f;
    float mouseSensitivity = 0.0022f;
    bool invertY = false;
    float walkPhase = 0.0f, walkAmount = 0.0f;

    void place(vec3 feetPos, float yawRad, float pitchRad = 0.0f) { feet = feetPos; yaw = yawRad; pitch = pitchRad; }
    void update(float dt, const Input& in, const CollisionWorld& cw, bool allowMove);
    vec3 forward() const;
    vec3 eye() const;
    void applyCamera(Camera& cam) const;

private:
};

}  // namespace ps
