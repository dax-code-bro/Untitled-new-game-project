#include "game/PlayerController.h"
#include <GLFW/glfw3.h>

namespace ps {

vec3 PlayerController::forward() const {
    return {std::sin(yaw) * std::cos(pitch), std::sin(pitch), std::cos(yaw) * std::cos(pitch)};
}

vec3 PlayerController::eye() const {
    return feet + vec3(0, eyeHeight + std::sin(walkPhase * 2.0f) * 0.035f * walkAmount, 0);
}

void PlayerController::applyCamera(Camera& cam) const {
    cam.zNear = 0.05f;
    cam.lookDir(eye(), forward());
}

void PlayerController::update(float dt, const Input& in, const CollisionWorld& cw, bool allowMove) {
    if (allowMove && in.cursorLocked()) {
        vec2 md = in.mouseDelta();
        yaw -= md.x * mouseSensitivity;
        pitch += (invertY ? md.y : -md.y) * mouseSensitivity;
        pitch = clampf(pitch, radians(-85.0f), radians(85.0f));
    }
    vec3 fwd{std::sin(yaw), 0, std::cos(yaw)};
    vec3 right{-fwd.z, 0, fwd.x};
    vec3 wish{0, 0, 0};
    if (allowMove) {
        if (in.down(GLFW_KEY_W) || in.down(GLFW_KEY_UP)) wish += fwd;
        if (in.down(GLFW_KEY_S) || in.down(GLFW_KEY_DOWN)) wish -= fwd;
        if (in.down(GLFW_KEY_D) || in.down(GLFW_KEY_RIGHT)) wish += right;
        if (in.down(GLFW_KEY_A) || in.down(GLFW_KEY_LEFT)) wish -= right;
    }
    float speed = in.down(GLFW_KEY_LEFT_SHIFT) ? 6.5f : 3.0f;
    float len = length(wish);
    vec3 delta{0, 0, 0};
    if (len > 0.01f) delta = wish / len * speed * dt;
    vec3 before = feet;
    feet = cw.moveCharacter(feet, delta, 0.3f, 1.8f);
    float moved = length(vec3(feet.x - before.x, 0, feet.z - before.z));
    walkPhase += moved * 2.2f;
    float target = dt > 0.0f ? saturate(moved / dt / 3.0f) : 0.0f;
    walkAmount += (target - walkAmount) * saturate(dt * 8.0f);
}

}  // namespace ps
