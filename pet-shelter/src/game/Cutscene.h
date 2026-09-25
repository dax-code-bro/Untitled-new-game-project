// Opening cutscene. Plays every time a new game starts, right after the
// character creator: aerial shot of the land, the highway gate opening,
// your truck driving in, your character walking to the front door, then
// the camera moves into their eyes and POV mode begins.
#pragma once
#include "game/CharacterModel.h"
#include "game/Sim.h"
#include "render/Renderer.h"
#include "world/World.h"
#include <string>

namespace ps {

class Cutscene {
public:
    static constexpr float kDuration = 23.0f;
    float t = 0.0f;
    bool active = false;

    void start(Sim& sim, World& world);
    // Returns true while running.
    bool update(float dt, Sim& sim, World& world, CharacterModel& character);
    void finish(Sim& sim, World& world);
    void applyCamera(Camera& cam) const;
    bool showCharacter() const { return t >= 15.5f && t < 22.8f; }
    mat4 characterTransform() const { return charModel_; }
    float fade() const;
    std::string subtitle() const;
    std::string title() const;

private:
    vec3 charPos(float time) const;
    vec3 camPos_, camTarget_;
    mat4 charModel_;
    float walkPhase_ = 0.0f;
};

}  // namespace ps
