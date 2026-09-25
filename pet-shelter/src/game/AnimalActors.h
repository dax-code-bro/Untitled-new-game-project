// Animals in the 3D world: every animal in care is a skinned, animated actor
// living in its housing (kennel runs, paddock, pens, medical room crates),
// choosing behaviors from its health, mood and the time of day.
#pragma once
#include "game/AnimalAnimator.h"
#include "game/AnimalModel.h"
#include "game/Sim.h"
#include "render/Renderer.h"
#include <map>
#include <memory>

namespace ps {

struct AnimalActor {
    int animalId = -1;
    int species = 0;
    AnimalBuild build;
    SkinnedMesh mesh;
    AnimalAnimator anim;
    vec3 pos{0, 0, 0};
    float yaw = 0.0f;
    vec3 target{0, 0, 0};
    float think = 0.0f;           // seconds until the next behavior choice
    int housing = -2;             // where it was placed (re-place when it changes)
    bool onTable = false;
    AABB area;                    // where it may wander (world space, y = floor)
    bool walking = false;
    vec4 wound{0, 0, 0, 0};       // bind-space wound (blood) for the coat shader
    float wet = 0.0f;
};

class AnimalActors {
public:
    void update(const Sim& sim, float dt, vec3 camPos);
    void draw(Renderer& r, Pass p, vec3 camPos) const;
    const AnimalActor* find(int animalId) const;
    int count() const { return int(actors_.size()); }
    static vec3 operatingTableTop() { return {9.4f, 0.30f + 0.9f, -2.5f}; }

private:
    AnimalActor* spawn(const Sim& sim, const Animal& a);
    void place(const Sim& sim, const Animal& a, AnimalActor& act);
    void think(const Sim& sim, const Animal& a, AnimalActor& act, float hour);
    std::map<int, std::unique_ptr<AnimalActor>> actors_;
    std::unique_ptr<AnimalActor> loose_;    // dangerous animal during an incident
    int looseSpecies_ = -1;
    Rng rng_{77};
    int builtThisFrame_ = 0;
};

}  // namespace ps
