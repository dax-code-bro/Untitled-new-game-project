// Your staff as people in the world. Each employee has a car, a parking spot,
// a house on Maple Lane and a daily routine: asleep in bed at night, up early,
// drive in, coffee from the staff coffee machine, chat with coworkers, and once
// you open the shelter, do their job (front desk, animal rounds, clinic, walking
// the facility). When you close, they walk to their car and drive home.
#pragma once
#include "game/AnimalActors.h"
#include "game/CharacterModel.h"
#include "game/Sim.h"
#include "render/Renderer.h"
#include "world/World.h"
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace ps {

class StaffActors {
public:
    void build(CollisionWorld& cw);   // Maple Lane (street, houses, beds), the front-door OPEN/CLOSED sign
    // gameDt: seconds of NPC time (real seconds x time speed, so a sped-up clock moves people faster)
    void update(Sim& sim, World& world, const AnimalActors& animals, float gameDt, float time, vec3 camPos);
    void draw(Renderer& r, Pass p, vec3 camPos, bool shelterOpen) const;
    void drawLabels(const Sim& sim, const Camera& cam, int screenW, int screenH) const;
    void appendLights(std::vector<PointLight>& out, vec3 camPos, float night) const;
    // The sign hanging by the front door: flip it to open or close the shelter
    bool pickSign(vec3 eye, vec3 fwd, float* dist = nullptr) const;
    // What someone is doing right now ("At the front desk", "Driving home", "Asleep")
    std::string status(int employeeId) const;
    vec3 positionOf(int employeeId) const;   // where they are (person, car or house)
    bool homeView(int employeeId, vec3* eye, float* yawDeg) const;   // a spot inside their house, looking at the bed
    // Put everyone where they'd be at this time of day (new game / load / screenshots)
    void placeAll(Sim& sim, World& world);

private:
    struct Waypoint { vec3 p; bool reverse; };
    struct Actor {
        int empId = -1, personId = 0;
        std::unique_ptr<CharacterModel> model;
        vec3 pos{0, 0, 0};
        float yaw = 0.0f, phase = 0.0f, walk = 0.0f, hold = 0.0f, look = 0.0f;
        std::vector<vec3> path;
        int place = 0;            // 0 home, 1 in the car, 2 at work
        bool visible = true, sleeping = false, cup = false, inBuilding = false;
        int task = 0;             // see StaffActors.cpp
        int taskAnimal = -1;
        float timer = 0.0f, cupTimer = 0.0f;
        bool hadCoffee = false;
        std::string doing;
        // Car
        vec3 carPos{0, 0, 0};
        float carYaw = 0.0f;
        std::vector<Waypoint> carPath;
        int carDest = 0;          // 0 parked, 1 driving to work, 2 driving home
        vec4 carTint{1, 1, 1, 1};
        int spot = 0, home = 0;
        float faceYaw = 0.0f;     // direction to face when standing still at a task
    };

    std::vector<vec3> planWalk(vec3 from, vec3 to) const;
    std::vector<vec3> outdoorPath(vec3 a, vec3 b) const;
    std::vector<int> navPath(int from, int to) const;
    int nearestNode(vec3 p) const;
    void startTask(Sim& sim, Actor& a, const AnimalActors& animals, const World& world);
    void goTo(Actor& a, vec3 to, int task, float faceYaw, float timer = 0.0f);
    void driveToWork(Actor& a, const World& world);
    void driveHome(Actor& a);
    vec3 spotPos(int spot) const;
    float spotYaw(int spot) const;
    vec3 homeDoor(int home) const;
    vec3 homeInside(int home) const;
    vec3 driveway(int home) const;
    float homeYaw(int home) const;
    mat4 bedTransform(int home) const;
    vec3 deskPos(const Sim& sim, int slot, float* yaw, bool* hidden) const;
    bool atHomeTime(const Sim& sim, const Employee& e) const;

    std::map<int, std::unique_ptr<Actor>> actors_;
    Mesh houses_, housesGlass_, lane_, carMesh_, blanket_, cupMesh_, sign_, signOpen_, signClosed_;
    std::vector<vec3> nav_;
    std::vector<std::vector<int>> navEdges_;
    struct Label { vec3 pos; float yaw; std::string text; float maxDist; float scale; unsigned color; };
    std::vector<Label> labels_;
    std::vector<PointLight> houseLights_;
    AABB signBox_;
    Rng rng_{5150};
    bool built_ = false;
};

}  // namespace ps
