#include "game/Cutscene.h"
#include "render/Animation.h"
#include "world/Layout.h"

namespace ps {
using namespace layout;

static const vec3 kWalkStart{-9.3f, 0.0f, 21.6f};
static const vec3 kWalkMid{-3.0f, 0.03f, 13.0f};
static const vec3 kWalkEnd{0.0f, kFloorY - 0.02f, 7.6f};

void Cutscene::start(Sim& sim, World& world) {
    t = 0.0f;
    walkPhase_ = 0.0f;
    active = true;
    sim.clock.minutes = 7.0 * 60.0 + 20.0;   // early morning light
    sim.security.gateManualOpen = false;
    sim.security.gateAutomatic = false;
    world.facility.gate.value = world.facility.gate.target = 0.0f;
    for (auto& d : world.facility.doors) d.swing.value = d.swing.target = 0.0f;
}

vec3 Cutscene::charPos(float time) const {
    float u = saturate((time - 15.8f) / 5.2f);
    Track<vec3> tr;
    tr.add(0.0f, kWalkStart);
    tr.add(0.45f, kWalkMid);
    tr.add(1.0f, kWalkEnd);
    return tr.sample(u);
}

static mat4 carAt(vec3 p, vec3 dir) {
    return mat4::translate(p) * mat4::rotateY(std::atan2(dir.x, dir.z));
}

bool Cutscene::update(float dt, Sim& sim, World& world, CharacterModel& character) {
    if (!active) return false;
    t += dt;
    // The gate opens as the truck arrives, then closes behind it
    sim.security.gateManualOpen = t > 4.5f && t < 14.0f;

    // ---- Truck path (two shots, so there's a cut in the middle of the drive) ----
    Facility& fac = world.facility;
    vec3 parked = Facility::parkedCarPos();
    if (t < 9.0f) {
        fac.playerCar = carAt({1.8f, 0.03f, kHighwayZ - 10.0f}, {0, 0, -1});
    } else if (t < 12.0f) {
        float u = ease(Ease::InOutSine, (t - 9.0f) / 3.0f);
        vec3 p = lerp(vec3(1.8f, 0.03f, kHighwayZ - 10.0f), vec3(1.8f, 0.03f, kSouthEdge - 40.0f), u);
        fac.playerCar = carAt(p, {0, 0, -1});
    } else if (t < 15.5f) {
        Track<vec3> tr;
        tr.add(0.0f, {1.8f, 0.03f, 110.0f});
        tr.add(0.45f, {1.8f, 0.03f, 50.0f});
        tr.add(0.75f, {-4.0f, 0.04f, 30.0f});
        tr.add(0.92f, {-8.0f, 0.04f, 24.0f});
        tr.add(1.0f, parked + vec3(0, 0.04f, 0));
        float u = ease(Ease::OutCubic, (t - 12.0f) / 3.5f);
        vec3 p = tr.sample(u), q = tr.sample(std::min(1.0f, u + 0.01f));
        vec3 dir = length(q - p) > 1e-4f ? q - p : vec3(0, 0, -1);
        fac.playerCar = carAt(p, dir);
    } else {
        fac.playerCar = mat4::translate(parked) * mat4::rotateY(radians(180.0f));
    }

    // ---- Character walks from the truck to the front door ----
    vec3 cp = charPos(t), cn = charPos(t + 0.05f);
    vec3 dir = cn - cp;
    float speed = length(vec3(dir.x, 0, dir.z)) / 0.05f;
    float face = length(dir) > 1e-4f ? std::atan2(dir.x, dir.z) : kPi;
    charModel_ = mat4::translate(cp) * mat4::rotateY(face);
    walkPhase_ += speed * dt * 2.2f;
    character.animate(t, walkPhase_, saturate(speed / 1.2f));
    // Open the front door as the character reaches it
    if (t > 20.0f) fac.doors[0].swing.target = 1.0f;

    // ---- Camera shots ----
    if (t < 6.0f) {
        float u = ease(Ease::InOutSine, t / 6.0f);
        camPos_ = lerp(vec3(230.0f, 95.0f, -260.0f), vec3(140.0f, 40.0f, 430.0f), u);
        camTarget_ = lerp(vec3(0.0f, 2.0f, 5.0f), vec3(0.0f, 2.0f, 600.0f), smoothstepf(0.45f, 1.0f, u));
    } else if (t < 12.0f) {
        float u = ease(Ease::InOutSine, (t - 6.0f) / 6.0f);
        camPos_ = lerp(vec3(16.0f, 3.2f, kSouthEdge + 16.0f), vec3(11.0f, 2.4f, kSouthEdge + 6.0f), u);
        camTarget_ = lerp(vec3(0.0f, 1.4f, kSouthEdge), vec3(1.0f, 1.0f, kSouthEdge - 25.0f), u);
    } else if (t < 15.5f) {
        camPos_ = vec3(12.0f, 4.0f, 44.0f);
        camTarget_ = fac.playerCar.transformPoint({0, 1.0f, 0});
    } else if (t < 21.0f) {
        vec3 c = charPos(t);
        camPos_ = c + vec3(-2.2f, 2.3f, 4.2f);
        camTarget_ = c + vec3(0.0f, 1.3f, -1.5f);
    } else {
        float u = ease(Ease::InOutCubic, (t - 21.0f) / 1.8f);
        vec3 c = charPos(t);
        vec3 eye = c + vec3(0, character.eyeHeight(), 0);
        camPos_ = lerp(c + vec3(-2.2f, 2.3f, 4.2f), eye, u);
        camTarget_ = lerp(c + vec3(0.0f, 1.3f, -1.5f), eye + vec3(0, 0, -3.0f), u);
    }
    if (t >= kDuration) { finish(sim, world); return false; }
    return true;
}

void Cutscene::finish(Sim& sim, World& world) {
    active = false;
    sim.security.gateManualOpen = false;
    world.facility.playerCar = mat4::translate(Facility::parkedCarPos()) * mat4::rotateY(radians(180.0f));
    world.facility.gate.value = world.facility.gate.target = 0.0f;
}

void Cutscene::applyCamera(Camera& cam) const {
    cam.zNear = 0.05f;
    cam.lookAt(camPos_, camTarget_);
}

float Cutscene::fade() const {
    if (t < 1.2f) return t / 1.2f;
    if (t > 22.2f) return saturate((kDuration - t) / 0.8f);
    return 1.0f;
}

std::string Cutscene::title() const {
    return t > 0.8f && t < 5.5f ? "UNTITLED PET SHELTER GAME" : "";
}

std::string Cutscene::subtitle() const {
    if (t > 1.0f && t < 5.5f) return "Day 1. You put everything you had into this place.";
    if (t > 6.2f && t < 11.8f) return "Five hundred square miles, one small building... and a gate only you can open.";
    if (t > 12.2f && t < 15.3f) return "It isn't much yet.";
    if (t > 16.0f && t < 20.8f) return "But it's yours. Time to get to work.";
    return "";
}

}  // namespace ps
