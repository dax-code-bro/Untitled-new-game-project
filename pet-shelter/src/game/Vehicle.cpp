#include "game/Vehicle.h"
#include "world/Terrain.h"
#include <algorithm>
#include <cmath>

namespace ps {

void TruckModel::build(vec3 paint) {
    Material body = Material::make(paint, 0.25f, 0.4f);
    Material dark = Material::make({0.05f, 0.05f, 0.06f}, 0.5f);
    Material glassM = Material::make({0.55f, 0.65f, 0.7f}, 0.05f, 0.0f, PAT_GLASS);
    glassM.alpha = 0.28f;
    Material chrome = Material::make({0.8f, 0.8f, 0.82f}, 0.15f, 1.0f);
    Material seat = Material::make({0.12f, 0.1f, 0.09f}, 0.8f, 0.0f, PAT_FABRIC);
    MeshBuilder b;
    // Body: chassis, cab shell (with the driver side left open for the door), bed, bumpers
    b.addBox(AABB({-0.95f, 0.45f, -2.55f}, {0.95f, 1.05f, 2.55f}), body);
    b.addBox(AABB({-0.9f, 1.05f, -0.2f}, {-0.86f, 1.15f, 1.2f}), body);          // passenger side: below the window
    b.addBox(AABB({-0.9f, 1.6f, -0.2f}, {-0.86f, 1.75f, 1.2f}), body);           // above it
    b.addBox(AABB({-0.9f, 1.15f, -0.2f}, {-0.86f, 1.6f, 0.0f}), body);           // B-pillar
    b.addBox(AABB({-0.9f, 1.15f, 1.1f}, {-0.86f, 1.6f, 1.2f}), body);            // A-pillar
    b.addBox(AABB({-0.9f, 1.72f, -0.2f}, {0.9f, 1.78f, 1.2f}), body);            // roof
    b.addBox(AABB({0.86f, 1.05f, -0.2f}, {0.9f, 1.75f, -0.05f}), body);          // B-pillar
    b.addBox(AABB({0.86f, 1.05f, 1.12f}, {0.9f, 1.75f, 1.2f}), body);            // A-pillar
    MeshBuilder g;   // windows are see-through (drawn in the transparent pass) so you can see out of the cab
    g.addBox(AABB({-0.86f, 1.12f, 1.2f}, {0.86f, 1.68f, 1.23f}), glassM);        // windshield
    g.addBox(AABB({-0.9f, 1.05f, -0.23f}, {0.9f, 1.72f, -0.2f}), glassM);        // rear window
    g.addBox(AABB({-0.91f, 1.15f, 0.0f}, {-0.88f, 1.6f, 1.1f}), glassM);         // passenger window
    glass_.upload(g);
    // Interior: seat, dash, steering wheel
    b.addBox(AABB({-0.8f, 1.05f, -0.15f}, {0.8f, 1.35f, 0.35f}), seat);
    b.addBox(AABB({-0.8f, 1.35f, -0.18f}, {0.8f, 1.7f, -0.05f}), seat);
    b.addBox(AABB({-0.86f, 1.05f, 0.98f}, {0.86f, 1.25f, 1.18f}), dark);         // dashboard
    b.addBox(AABB({0.2f, 1.25f, 1.0f}, {0.64f, 1.29f, 1.12f}), dark);            // gauge hood
    // Steering wheel, tilted toward the driver
    b.xf = mat4::translate({0.42f, 1.3f, 0.86f}) * mat4::rotate(quat::axisAngle({1, 0, 0}, radians(-62.0f)));
    {
        mat4 base = b.xf;
        for (int i = 0; i < 18; ++i) {   // the rim: a ring of short segments
            float a = float(i) / 18.0f * 2.0f * kPi;
            b.xf = base * mat4::translate({std::cos(a) * 0.19f, 0.0f, std::sin(a) * 0.19f}) * mat4::rotateY(-a);
            b.addBox(AABB({-0.017f, -0.017f, -0.036f}, {0.017f, 0.017f, 0.036f}), dark);
        }
        b.xf = base;
        b.addBox(AABB({-0.17f, -0.012f, -0.018f}, {0.17f, 0.012f, 0.018f}), dark);   // spokes
        b.addBox(AABB({-0.018f, -0.012f, -0.17f}, {0.018f, 0.012f, 0.0f}), dark);
        b.addCylinder({0.0f, -0.02f, 0.0f}, 0.05f, 0.05f, 12, dark);                  // hub
        b.addCylinder({0.0f, -0.28f, 0.0f}, 0.03f, 0.26f, 8, dark);                   // column
    }
    b.xf = mat4();
    b.addBox(AABB({-0.95f, 1.05f, -2.55f}, {-0.85f, 1.3f, -0.25f}), body);       // bed walls
    b.addBox(AABB({0.85f, 1.05f, -2.55f}, {0.95f, 1.3f, -0.25f}), body);
    b.addBox(AABB({-0.95f, 1.05f, -2.55f}, {0.95f, 1.3f, -2.45f}), body);
    b.addBox(AABB({-0.9f, 1.05f, -2.45f}, {0.9f, 1.07f, -0.25f}), dark);         // bed liner
    b.addBox(AABB({-0.97f, 0.45f, 2.5f}, {0.97f, 0.75f, 2.62f}), chrome);        // bumpers
    b.addBox(AABB({-0.97f, 0.45f, -2.62f}, {0.97f, 0.7f, -2.52f}), chrome);
    b.addBox(AABB({-0.4f, 0.72f, 2.55f}, {0.4f, 1.0f, 2.57f}), chrome);          // grille
    body_.upload(b);
    // Wheel (axle along X), centered at origin
    b.clear();
    b.xf = mat4::rotate(quat::axisAngle({0, 0, 1}, kPi * 0.5f));
    b.addCylinder({0.0f, -0.14f, 0.0f}, 0.42f, 0.28f, 18, dark);
    b.addCylinder({0.0f, -0.15f, 0.0f}, 0.22f, 0.30f, 6, chrome);   // six-spoke look
    wheel_.upload(b);
    // Driver's door (left side = +X when facing +Z), hinge at its front edge (z = 1.12)
    b.clear();
    b.addBox(AABB({-0.03f, 0.5f, -1.2f}, {0.03f, 1.12f, 0.0f}), body);
    b.addBox(AABB({-0.03f, 1.62f, -1.12f}, {0.03f, 1.7f, -0.05f}), body);        // window frame
    b.addBox(AABB({0.03f, 0.95f, -1.0f}, {0.06f, 1.0f, -0.85f}), chrome);        // handle
    b.addBox(AABB({-0.06f, 0.95f, -1.0f}, {-0.03f, 1.0f, -0.85f}), chrome);      // inside handle
    door_.upload(b);
    b.clear();
    b.addBox(AABB({-0.02f, 1.12f, -1.12f}, {0.02f, 1.62f, -0.05f}), glassM);
    doorGlass_.upload(b);
    // Lamps (drawn with a tint so they can light up)
    auto lamp = [&](Mesh& m, AABB box, vec3 col, float emis) {
        MeshBuilder lb;
        lb.addBox(box, Material::make(col, 0.2f, 0.0f, PAT_PLAIN, emis));
        m.upload(lb);
    };
    lamp(brake_, AABB({-0.85f, 0.8f, -2.6f}, {-0.6f, 0.95f, -2.55f}), {0.9f, 0.05f, 0.03f}, 6.0f);
    lamp(sigL_, AABB({0.62f, 0.62f, 2.56f}, {0.85f, 0.7f, 2.6f}), {1.0f, 0.55f, 0.05f}, 8.0f);
    lamp(sigR_, AABB({-0.85f, 0.62f, 2.56f}, {-0.62f, 0.7f, 2.6f}), {1.0f, 0.55f, 0.05f}, 8.0f);
    lamp(head_, AABB({-0.8f, 0.8f, 2.55f}, {0.8f, 0.95f, 2.58f}), {1.0f, 1.0f, 0.9f}, 8.0f);
    {   // A pet carrier: plastic shell with a wire door
        MeshBuilder cb;
        cb.addBox(AABB({-0.3f, 0.0f, -0.4f}, {0.3f, 0.45f, 0.4f}), Material::make({0.75f, 0.72f, 0.66f}, 0.6f));
        cb.addBox(AABB({-0.22f, 0.06f, 0.4f}, {0.22f, 0.38f, 0.42f}), Material::make({0.3f, 0.3f, 0.32f}, 0.3f, 1.0f, PAT_METAL));
        cb.addBox(AABB({-0.1f, 0.45f, -0.05f}, {0.1f, 0.5f, 0.05f}), Material::make({0.2f, 0.2f, 0.22f}, 0.5f));
        crate_.upload(cb);
    }
    lamp(reverse_, AABB({-0.2f, 0.8f, -2.6f}, {0.2f, 0.9f, -2.56f}), {1.0f, 1.0f, 1.0f}, 5.0f);
}

void TruckModel::draw(Renderer& r, Pass pass, const mat4& xf, float steer, float spin, float door, bool brake, bool leftOn,
                      bool rightOn, bool headlights, bool reversing) const {
    mat4 doorXf = xf * doorTransform(door);
    if (pass == Pass::Transparent) {
        r.draw(glass_, xf);
        r.draw(doorGlass_, doorXf);
        return;
    }
    r.draw(body_, xf);
    for (float x : {-0.95f, 0.95f})
        for (float z : {-1.6f, 1.6f}) {
            mat4 w = xf * mat4::translate({x, 0.42f, z});
            if (z > 0.0f) w = w * mat4::rotateY(-steer);
            w = w * mat4::rotate(quat::axisAngle({1, 0, 0}, spin));
            r.draw(wheel_, w);
        }
    // Door swings outward around its front hinge
    r.draw(door_, doorXf);
    if (pass == Pass::Shadow) return;
    auto lampTint = [](bool on) { return on ? vec4(1.0f, 1.0f, 1.0f, 1.0f) : vec4(0.06f, 0.06f, 0.06f, 1.0f); };
    vec4 tail = brake ? vec4(1, 1, 1, 1) : (headlights ? vec4(0.35f, 0.35f, 0.35f, 1) : lampTint(false));   // tail lights glow dimmer than brakes
    r.draw(brake_, xf, tail);
    r.draw(brake_, xf * mat4::translate({1.45f, 0.0f, 0.0f}), tail);
    r.draw(sigL_, xf, lampTint(leftOn));
    r.draw(sigR_, xf, lampTint(rightOn));
    r.draw(head_, xf, lampTint(headlights));
    r.draw(reverse_, xf, lampTint(reversing));
    // Rear signals share the brake lamp shape, amber-ish via tint on the corner lamp
    if (leftOn) r.draw(sigL_, xf * mat4::translate({0.0f, 0.2f, -5.16f}));
    if (rightOn) r.draw(sigR_, xf * mat4::translate({0.0f, 0.2f, -5.16f}));
}

void TruckModel::drawCrates(Renderer& r, const mat4& xf, int n) const {
    for (int i = 0; i < std::min(n, 6); ++i) {
        float x = (i % 2) ? 0.4f : -0.4f, z = -0.75f - 0.85f * float(i / 2);
        r.draw(crate_, xf * mat4::translate({x, 1.07f, z}));
    }
}

bool Truck::update(float dt, float throttle, float brake, float steerIn, bool handbrake, const CollisionWorld& cw, int ownCollider) {
    // Door animation
    door += ((doorOpen ? 1.0f : 0.0f) - door) * std::min(1.0f, dt * 5.0f);
    crashTimer = std::max(0.0f, crashTimer - dt);
    // Longitudinal
    float a = 0.0f;
    braking = false;
    if (throttle > 0.0f) a += speed >= -0.3f ? 4.2f * throttle * (1.0f - std::max(0.0f, speed) / 52.0f) : 9.0f * throttle;
    if (brake > 0.0f) {
        if (speed > 0.3f) { a -= 9.5f * brake; braking = true; }
        else a -= 3.0f * brake;                      // reverse
    }
    if (handbrake) { a -= (speed > 0 ? 1.0f : -1.0f) * 7.0f; braking = true; }
    a -= speed * 0.015f + (speed > 0 ? 0.25f : (speed < 0 ? -0.25f : 0.0f));   // drag + rolling resistance
    float before = speed;
    speed += a * dt;
    if ((before > 0.0f && speed < 0.0f && throttle <= 0.0f) || (before < 0.0f && speed > 0.0f && brake <= 0.0f)) speed = 0.0f;
    speed = clampf(speed, -7.0f, 55.0f);
    // Steering: less lock at speed, returns to center
    float maxSteer = 0.62f / (1.0f + std::fabs(speed) * 0.07f);
    float target = steerIn * maxSteer;
    steer += clampf(target - steer, -dt * 2.2f, dt * 2.2f);
    float yawRate = speed * std::tan(steer) / 3.3f;
    if (handbrake && std::fabs(speed) > 5.0f) yawRate *= 1.4f;
    yaw -= yawRate * dt;   // steer right (+) turns clockwise seen from above
    spin += speed * dt / 0.42f;
    // Move with collision (three circles along the body)
    vec3 fwd = forward();
    vec3 delta = fwd * (speed * dt);
    vec3 next = pos + delta;
    bool hit = false;
    for (float off : {1.7f, 0.0f, -1.7f}) {
        vec3 c = next + fwd * off;
        if (cw.overlaps(c.x, c.z, 0.95f, pos.y + 0.3f, pos.y + 1.8f, ownCollider) ||
            (cw.allowed && !cw.allowed(c.x, c.z, 0.9f))) { hit = true; break; }
    }
    if (hit) {
        lastImpact = std::fabs(speed);
        if (lastImpact > 3.0f) crashTimer = 1.0f;
        speed = -speed * 0.25f;
    } else {
        pos = next;
    }
    pos.y = cw.groundHeight(pos.x, pos.z, pos.y + 0.5f, 0.6f);
    return hit;
}

}  // namespace ps
