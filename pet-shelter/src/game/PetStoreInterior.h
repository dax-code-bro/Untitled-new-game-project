// Paws & Claws Pet Supply, inside: a walk-in store with a cashier at the front
// counter, shoppers who browse the aisles, pick things up, look them over and
// sometimes buy them, and the store's animals living in pens, condos, cages and
// terrariums with food and water dispensers. Every enclosure has a name tag
// (name, species, sex, age, color, price).
#pragma once
#include "game/AnimalAnimator.h"
#include "game/AnimalModel.h"
#include "game/CharacterModel.h"
#include "game/Sim.h"
#include "render/Renderer.h"
#include "world/Collision.h"
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace ps {

class PetStoreInterior {
public:
    void build(CollisionWorld& cw);
    void update(const Sim& sim, float dt, float time, vec3 camPos, CollisionWorld& cw);
    void draw(Renderer& r, Pass p, vec3 camPos) const;
    // Name tags, aisle signs and the storefront sign (screen-space text over their boards)
    void drawLabels(const Sim& sim, const Camera& cam, int screenW, int screenH) const;
    void appendLights(std::vector<PointLight>& out, vec3 camPos) const;
    static AABB interiorBox();                 // inside the walls (for indoor lighting)
    static bool open(float hour) { return hour >= 7.0f && hour < 21.0f; }

    // What's under the crosshair: 1 the cashier (counter), 2 an animal's enclosure (storeId set)
    int pick(vec3 eye, vec3 fwd, const Sim& sim, int* storeId, std::string* prompt) const;

private:
    struct Pen {
        int kind = 0;                  // 0 dog pen, 1 cat condo, 2 bird cage, 3 terrarium
        AABB area;                     // where its animal moves (y = its floor)
        vec3 food, water;              // dispenser bowls
        vec3 tag;                      // name tag (text anchor)
        float tagYaw = 0.0f;           // direction the tag faces
        AABB box;                      // whole enclosure (for picking)
    };
    struct StoreActor {
        int storeId = 0, pen = -1;
        const Species* species = nullptr;
        AnimalBuild build;
        SkinnedMesh mesh;
        AnimalAnimator anim;
        vec3 pos{0, 0, 0}, target{0, 0, 0};
        float yaw = 0.0f, think = 0.0f;
        bool walking = false;
        int goal = 0;                  // 0 wander, 1 eat, 2 drink
        AABB area;
    };
    struct Poi { vec3 at; float yaw; int kind; int pen; };   // kind 0 shelf, 1 animal, 2 fish tank
    struct Npc {
        std::unique_ptr<CharacterModel> model;
        vec3 pos{0, 0, 0};
        float yaw = 0.0f, phase = 0.0f, walk = 0.0f, look = 0.0f, hold = 0.0f;
        std::vector<vec3> path;
        int state = 0;                 // 0 away, 1 walking, 2 examining, 3 waiting to pay, 4 paying
        int after = 0;                 // what to do on arrival: 0 examine, 1 pay, 2 leave, 3 wait for the till
        float timer = 0.0f;
        int poi = -1, visits = 0;
        bool holding = false, buyer = false, bag = false;
        vec3 itemColor{1, 1, 1};
        std::string wants;             // what they're looking at (for the look direction)
    };

    vec3 L(float x, float y, float z) const;   // store-local -> world
    void route(Npc& n, vec3 to) const;
    void chooseNext(Npc& n);
    void spawnActor(const Sim& sim, const StoreAnimal& a);
    void thinkActor(StoreActor& a, float hour);

    Mesh shell_, wire_, glass_, water_, lamps_, item_, bagMesh_, doorPanel_;
    std::vector<Pen> pens_;
    std::vector<Poi> pois_;
    std::map<int, std::unique_ptr<StoreActor>> actors_;   // key: storeId (0 = the shop cat)
    std::vector<Npc> npcs_;
    std::unique_ptr<CharacterModel> cashier_;
    float cashierLook_ = 0.0f;
    bool built_ = false, peopleBuilt_ = false, isOpen_ = true;
    int doorCollider_ = -1;
    Rng rng_{4040};
    std::vector<PointLight> lights_;
    struct Label { vec3 pos; float yaw; std::string text; float maxDist; float scale; unsigned color; };
    std::vector<Label> labels_;
    AABB counter_;
};

}  // namespace ps
