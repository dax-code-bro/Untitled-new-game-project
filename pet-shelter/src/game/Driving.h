// The road outside your gate: highway traffic that follows the car ahead and
// stops at the light, a traffic light at the crossroads 2 miles east, road
// signs (speed limits, directions, mile markers), the pet store, and the
// rules of the road for you: speed limits, red lights, turn signals, wrong way.
#pragma once
#include "game/Sim.h"
#include "game/Vehicle.h"
#include "render/Renderer.h"
#include <string>
#include <vector>

namespace ps {

struct RoadSign {
    vec3 pos;           // base of the post
    float yaw;          // board faces +Z rotated by yaw
    int kind;           // 0 speed limit, 1 green guide, 2 mile marker, 3 store sign, 4 blue service
    std::string text;
};

class Driving {
public:
    void build();
    // Moves traffic, runs the traffic light, and (when you're driving) enforces the rules.
    void update(float dt, Sim& sim, Truck& truck, bool playerDriving);
    void draw(Renderer& r, Pass p, vec3 camPos) const;
    // Screen-space text on the signs you can see, and the driving HUD (speedometer, limit, signals, minimap).
    void drawSignText(const Camera& cam, int screenW, int screenH) const;
    void drawHUD(const Sim& sim, const Truck& truck, bool touch) const;

    enum Light { Green, Yellow, Red };
    Light highwayLight() const;
    void setClock(float t) { clock_ = t; }
    void resetRules() { havePos_ = false; overTimer_ = 0.0f; wrongWayTimer_ = 0.0f; }
    Light sideLight() const;
    float speedLimitMph(vec3 p, const Sim& sim) const;
    // A traffic car the truck is touching (for crashes), -1 if none
    int trafficHit(const Truck& t) const;
    std::string lastWarning;       // shown briefly in the HUD
    float warningTimer = 0.0f;
    std::vector<InstanceData> trafficInstances() const;

private:
    struct Car { int lane; float x, speed, target; vec4 tint; float stopped = 0.0f; };
    std::vector<Car> cars_;
    std::vector<RoadSign> signs_;
    float clock_ = 0.0f;
    Mesh post_, speedBoard_, guideBoard_, mileBoard_, storeBoard_, serviceBoard_, lightHead_, lampRed_, lampYellow_, lampGreen_;
    Mesh lot_, sideRoad_;
    // Rules state
    float overTimer_ = 0.0f, speedCooldown_ = 0.0f, wrongWayTimer_ = 0.0f;
    int lastLane_ = -1;
    float signalAge_[2] = {99.0f, 99.0f};   // seconds since the left / right signal was on
    vec3 lastPos_{0, 0, 0};
    bool havePos_ = false;
    int lastZone_ = -1;
    static constexpr int kHist = 120;          // ~2 s of headings at 60 fps
    float yawHist_[kHist] = {};
    int histPos_ = 0;
    float turnTimer_ = 0.0f, turnYaw0_ = 0.0f;
    float crashCooldown_ = 0.0f;
    void warn(const std::string& s) { lastWarning = s; warningTimer = 5.0f; }
};

}  // namespace ps
