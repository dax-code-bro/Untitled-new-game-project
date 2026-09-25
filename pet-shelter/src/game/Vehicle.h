// Your red pickup: a drawable model with an opening driver's door, steering
// and rolling wheels, brake lights, turn signals and headlights, plus arcade
// vehicle physics that collides with the world.
#pragma once
#include "render/Renderer.h"
#include "world/Collision.h"

namespace ps {

class TruckModel {
public:
    void build(vec3 paint);
    // steer (rad), spin (wheel roll angle), door 0 closed .. 1 open
    void draw(Renderer& r, Pass pass, const mat4& xf, float steer, float spin, float door, bool brake, bool leftOn, bool rightOn,
              bool headlights, bool reversing) const;
    static vec3 driverSeat() { return {0.42f, 1.5f, 0.3f}; }     // local eye position
    // Door swings outward (toward +X) around its front hinge
    static mat4 doorTransform(float door) { return mat4::translate({0.93f, 0.0f, 1.12f}) * mat4::rotateY(-door * 1.15f); }
    void drawCrates(Renderer& r, const mat4& xf, int n) const;   // animal carriers riding in the bed
    static vec3 doorOutside() { return {1.75f, 0.0f, 0.55f}; }     // where you stand to get in/out

private:
    Mesh crate_, body_, glass_, doorGlass_, wheel_, door_, brake_, sigL_, sigR_, head_, reverse_;
};

struct Truck {
    vec3 pos{0, 0, 0};
    float yaw = 0.0f;          // 0 = nose toward +Z
    float speed = 0.0f;        // m/s, negative = reverse
    float steer = 0.0f;
    float spin = 0.0f;
    float door = 0.0f;         // animated 0..1
    bool doorOpen = false;
    int signal = 0;            // -1 left, 0 off, +1 right
    bool headlights = false;
    bool braking = false;
    float crashTimer = 0.0f;
    float lastImpact = 0.0f;   // speed of the last collision (m/s)

    vec3 forward() const { return {std::sin(yaw), 0.0f, std::cos(yaw)}; }
    vec3 right() const { return {-std::cos(yaw), 0.0f, std::sin(yaw)}; }
    mat4 transform() const { return mat4::translate(pos) * mat4::rotateY(yaw); }
    float mph() const { return std::fabs(speed) * 2.23694f; }
    // throttle/brake 0..1, steerIn -1 (left) .. 1 (right). Returns true if it hit something this frame.
    bool update(float dt, float throttle, float brake, float steerIn, bool handbrake, const CollisionWorld& cw, int ownCollider);
};

}  // namespace ps
