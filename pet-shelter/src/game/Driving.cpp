#include "game/Driving.h"
#include "core/Noise.h"
#include "world/Facility.h"
#include "world/Layout.h"
#include "world/Terrain.h"
#include <imgui.h>
#include <algorithm>
#include <cmath>
#include <cstdio>

namespace ps {
using namespace layout;

namespace {
const float kLaneZ[4] = {kHighwayZ + 1.9f, kHighwayZ + 5.6f, kHighwayZ - 1.9f, kHighwayZ - 5.6f};   // 0,1 east; 2,3 west
const float kLoopMin = -6000.0f, kLoopMax = 9000.0f;
const float kStopE = kCrossX - 12.0f, kStopW = kCrossX + 12.0f;       // highway stop lines
const float kSideStopZ = kHighwayZ + kHighwayHalfWidth + 3.0f;       // side road stop line (northbound)
const float kCycle = 64.0f;
int laneAt(float z) {
    int best = -1;
    float bd = 1.9f;
    for (int i = 0; i < 4; ++i) if (std::fabs(z - kLaneZ[i]) < bd) { bd = std::fabs(z - kLaneZ[i]); best = i; }
    return best;
}
}  // namespace

Driving::Light Driving::highwayLight() const {
    float t = std::fmod(clock_, kCycle);
    return t < 32.0f ? Green : (t < 36.0f ? Yellow : Red);
}
Driving::Light Driving::sideLight() const {
    float t = std::fmod(clock_, kCycle);
    return (t >= 38.0f && t < 58.0f) ? Green : ((t >= 58.0f && t < 62.0f) ? Yellow : Red);
}

void Driving::build() {
    Rng rng(9090);
    static const vec3 paints[] = {{0.8f, 0.8f, 0.82f}, {0.1f, 0.1f, 0.12f}, {0.6f, 0.08f, 0.06f}, {0.12f, 0.2f, 0.45f},
                                  {0.5f, 0.5f, 0.52f}, {0.9f, 0.9f, 0.88f}, {0.15f, 0.3f, 0.2f}, {0.7f, 0.55f, 0.2f}};
    for (int i = 0; i < 40; ++i) {
        Car c;
        c.lane = i % 4;
        c.x = rng.range(kLoopMin, kLoopMax);
        c.target = rng.range(23.0f, 28.5f);   // 51 - 64 mph: most drive near the limit, some a bit over
        c.speed = c.target;
        c.tint = vec4(paints[rng.irange(0, 7)] * 1.1f, 1.0f);
        cars_.push_back(c);
    }
    // ---- Signs ----
    auto S = [&](vec3 p, float yaw, int kind, std::string t) { signs_.push_back({p, yaw, kind, std::move(t)}); };
    const float zE = kHighwayZ + kHighwayHalfWidth + 3.0f, zW = kHighwayZ - kHighwayHalfWidth - 3.0f;
    // Eastbound drivers look toward +X: boards face -X (yaw -90). Westbound: boards face +X (yaw +90).
    for (float x = kLoopMin + 400.0f; x < kLoopMax; x += 1609.0f) {
        S({x, 0, zE}, radians(-90.0f), 0, "SPEED\nLIMIT\n55");
        S({x + 800.0f, 0, zW}, radians(90.0f), 0, "SPEED\nLIMIT\n55");
    }
    for (int m = -3; m <= 5; ++m) {
        float x = float(m) * kMeterPerMile;
        char b[48];
        std::snprintf(b, sizeof b, "HWY 89\nMILE %d", 12 + m);
        S({x + 30.0f, 0, zE + 1.0f}, radians(-90.0f), 2, b);
        S({x - 30.0f, 0, zW - 1.0f}, radians(90.0f), 2, b);
    }
    // Leaving your gate, and coming home
    S({kGateHalfWidth + 7.0f, 0, kSouthEdge + 5.0f}, radians(180.0f), 1, "HWY 89\n<- EAST  Pet Store 2 mi\nWEST ->  Cedar Flats 12 mi");
    S({-kRoadHalfWidth - 2.5f, 0, kSouthEdge - 12.0f}, radians(0.0f), 0, "SPEED\nLIMIT\n25");
    S({-kRoadHalfWidth - 2.5f, 0, 300.0f}, radians(180.0f), 0, "SPEED\nLIMIT\n25");
    S({-700.0f, 0, zE}, radians(-90.0f), 1, "ANIMAL SHELTER\nNEXT LEFT  0.4 mi");
    S({700.0f, 0, zW}, radians(90.0f), 1, "ANIMAL SHELTER\nNEXT RIGHT  0.4 mi");
    S({kGateHalfWidth + 4.0f, 0, zW - 1.5f}, radians(90.0f), 4, "YOUR SHELTER\nPrivate drive - owner's gate");
    // Toward the pet store
    S({kCrossX - 600.0f, 0, zE}, radians(-90.0f), 1, "PET STORE\nCROSSROADS RD\nNEXT RIGHT  0.4 mi");
    S({kCrossX + 600.0f, 0, zW}, radians(90.0f), 1, "PET STORE\nCROSSROADS RD\nNEXT LEFT  0.4 mi");
    S({kCrossX + 10.0f, 0, zE + 3.0f}, radians(-90.0f), 1, "CROSSROADS RD\nPet Store ->");
    S({kCrossX - 11.0f, 0, kHighwayZ + 60.0f}, radians(90.0f), 0, "SPEED\nLIMIT\n25");
    S({kPetLotMinX + 6.0f, 0, kHighwayZ + kHighwayHalfWidth + 3.0f}, radians(180.0f), 3, "PAWS & CLAWS\nPET SUPPLY");   // pylon by the road
    S({kCrossX + 12.0f, 0, kHighwayZ + 20.0f}, radians(90.0f), 4, "PAWS & CLAWS ->\nDogs  Cats  Birds  Snakes");

    // ---- Meshes ----
    Material wood = Material::make({0.5f, 0.52f, 0.54f}, 0.4f, 0.8f, PAT_METAL);
    MeshBuilder b;
    b.addCylinder({0, 0, 0}, 0.05f, 2.4f, 8, wood);
    post_.upload(b);
    auto board = [&](Mesh& m, vec3 col, float w, float h, float y) {
        MeshBuilder bb;
        bb.addBox(AABB({-w * 0.5f, y, -0.04f}, {w * 0.5f, y + h, 0.02f}), Material::make(col, 0.5f));
        bb.addBox(AABB({-w * 0.5f + 0.05f, y + 0.05f, 0.02f}, {w * 0.5f - 0.05f, y + h - 0.05f, 0.03f}), Material::make(col * 1.05f, 0.4f));
        m.upload(bb);
    };
    board(speedBoard_, {0.85f, 0.85f, 0.83f}, 0.9f, 1.15f, 1.7f);
    board(guideBoard_, {0.05f, 0.3f, 0.12f}, 3.4f, 1.6f, 2.2f);
    board(mileBoard_, {0.05f, 0.3f, 0.12f}, 0.5f, 0.7f, 1.2f);
    board(storeBoard_, {0.7f, 0.12f, 0.1f}, 6.0f, 1.3f, 4.2f);
    board(serviceBoard_, {0.08f, 0.2f, 0.55f}, 2.4f, 1.1f, 1.6f);
    // Traffic light: mast arm head with three lamps (lamps drawn separately so they light up)
    b.clear();
    b.addCylinder({0, 0, 0}, 0.12f, 6.2f, 10, wood);
    b.addBox(AABB({-0.08f, 6.0f, -0.08f}, {0.08f, 6.15f, 7.5f}), wood);
    b.addBox(AABB({-0.25f, 5.0f, 6.9f}, {0.25f, 6.1f, 7.25f}), Material::make({0.08f, 0.08f, 0.06f}, 0.5f));
    lightHead_.upload(b);
    auto lamp = [&](Mesh& m, float y, vec3 c) {
        MeshBuilder lb;
        // Lamps on the head's local +X face: each mast is turned so that face looks at the drivers it controls
        lb.addBox(AABB({0.25f, y - 0.14f, 6.93f}, {0.29f, y + 0.14f, 7.21f}), Material::make(c, 0.2f, 0.0f, PAT_PLAIN, 14.0f));
        m.upload(lb);
    };
    lamp(lampRed_, 5.9f, {1.0f, 0.05f, 0.03f});
    lamp(lampYellow_, 5.55f, {1.0f, 0.65f, 0.05f});
    lamp(lampGreen_, 5.2f, {0.1f, 1.0f, 0.35f});
    // Side road, stop lines, parking lot and the store
    Material asphalt = Material::make({0.15f, 0.15f, 0.16f}, 0.85f, 0.0f, PAT_ASPHALT);
    Material paint = Material::make({0.9f, 0.9f, 0.88f}, 0.6f);
    b.clear();
    b.addBox(AABB({kCrossX - 9.0f, -0.2f, kHighwayZ + kHighwayHalfWidth - 0.5f}, {kCrossX + 9.0f, 0.035f, kHighwayZ + 190.0f}), asphalt);
    b.addBox(AABB({kCrossX - 0.1f, 0.036f, kHighwayZ + 14.0f}, {kCrossX + 0.1f, 0.04f, kHighwayZ + 190.0f}), Material::make({0.9f, 0.75f, 0.1f}, 0.6f));
    b.addBox(AABB({kStopE - 0.25f, 0.036f, kHighwayZ + 0.2f}, {kStopE + 0.25f, 0.04f, kHighwayZ + kHighwayHalfWidth - 0.3f}), paint);
    b.addBox(AABB({kStopW - 0.25f, 0.036f, kHighwayZ - kHighwayHalfWidth + 0.3f}, {kStopW + 0.25f, 0.04f, kHighwayZ - 0.2f}), paint);
    b.addBox(AABB({kCrossX + 0.2f, 0.036f, kSideStopZ - 0.25f}, {kCrossX + 8.5f, 0.04f, kSideStopZ + 0.25f}), paint);
    sideRoad_.upload(b);
    b.clear();
    b.addBox(AABB({kPetLotMinX, -0.2f, kPetLotMinZ}, {kPetLotMaxX, 0.03f, kPetLotMaxZ}), Material::make({0.17f, 0.17f, 0.18f}, 0.85f, 0.0f, PAT_PARKING));
    for (float x = kPetLotMinX + 4.0f; x < kPetLotMaxX - 2.0f; x += 3.0f)
        b.addBox(AABB({x - 0.06f, 0.031f, kPetLotMaxZ - 6.0f}, {x + 0.06f, 0.035f, kPetLotMaxZ - 0.5f}), paint);
    lot_.upload(b);
    b.clear();
    {
        float x0 = kPetStoreX - 20.0f, x1 = kPetStoreX + 20.0f, z0 = kPetStoreZ - 8.0f, z1 = kPetStoreZ + 10.0f;
        b.addBox(AABB({x0, -0.5f, z0}, {x1, 0.25f, z1}), Material::make({0.6f, 0.6f, 0.58f}, 0.9f, 0.0f, PAT_CONCRETE));
        b.addBox(AABB({x0, 0.25f, z0 + 0.2f}, {x1, 5.0f, z1}), Material::make({0.82f, 0.76f, 0.62f}, 0.7f, 0.0f, PAT_SIDING));
        b.addBox(AABB({x0 - 0.3f, 5.0f, z0 - 0.3f}, {x1 + 0.3f, 5.4f, z1 + 0.3f}), Material::make({0.3f, 0.3f, 0.32f}, 0.6f));
        b.addBox(AABB({x0 + 2.0f, 0.9f, z0 + 0.1f}, {kPetStoreX - 3.0f, 3.3f, z0 + 0.2f}), Material::make({0.08f, 0.1f, 0.12f}, 0.05f, 0.6f));
        b.addBox(AABB({kPetStoreX + 3.0f, 0.9f, z0 + 0.1f}, {x1 - 2.0f, 3.3f, z0 + 0.2f}), Material::make({0.08f, 0.1f, 0.12f}, 0.05f, 0.6f));
        b.addBox(AABB({kPetStoreX - 1.5f, 0.25f, z0 + 0.1f}, {kPetStoreX + 1.5f, 2.8f, z0 + 0.2f}), Material::make({0.1f, 0.12f, 0.14f}, 0.05f, 0.6f));
        b.addBox(AABB({x0 + 1.0f, 3.5f, z0 - 1.6f}, {x1 - 1.0f, 3.7f, z0 + 0.2f}), Material::make({0.7f, 0.12f, 0.1f}, 0.6f));   // awning
    }
    store_.upload(b);
}

float Driving::speedLimitMph(vec3 p, const Sim& sim) const {
    if (p.z > kHighwayZ - kHighwayHalfWidth - 1.0f && p.z < kHighwayZ + kHighwayHalfWidth + 1.0f) return kHighwaySpeedMph;
    if (p.x > kPetLotMinX - 1.0f && p.z > kPetLotMinZ - 1.0f && p.z < kPetStoreZ) return 10.0f;
    if (sim.land.contains(p.x, p.z) && !(std::fabs(p.x) < kRoadHalfWidth + 1.0f && p.z > kParkMaxZ)) return 15.0f;   // your yard
    return kLocalSpeedMph;
}

int Driving::trafficHit(const Truck& t) const {
    for (size_t i = 0; i < cars_.size(); ++i) {
        const Car& c = cars_[i];
        float dx = c.x - t.pos.x, dz = kLaneZ[c.lane] - t.pos.z;
        if (std::fabs(dx) < 4.6f && std::fabs(dz) < 1.9f) return int(i);
    }
    return -1;
}

void Driving::update(float dt, Sim& sim, Truck& truck, bool driving) {
    clock_ += dt;
    warningTimer = std::max(0.0f, warningTimer - dt);
    crashCooldown_ = std::max(0.0f, crashCooldown_ - dt);
    Light hl = highwayLight();
    // ---- Traffic (intelligent-driver model: follow the car ahead, stop for red lights and for you) ----
    for (Car& c : cars_) {
        float dir = c.lane < 2 ? 1.0f : -1.0f;
        float gap = 1e9f, lead = 0.0f;
        for (const Car& o : cars_) {
            if (&o == &c || o.lane != c.lane) continue;
            float d = (o.x - c.x) * dir;
            if (d > 0.0f && d < gap) { gap = d; lead = o.speed; }
        }
        // Your truck in this lane ahead
        if (std::fabs(truck.pos.z - kLaneZ[c.lane]) < 2.2f) {
            float d = (truck.pos.x - c.x) * dir;
            if (d > 0.0f && d < gap) { gap = d; lead = std::max(0.0f, truck.speed * truck.forward().x * dir); }
        }
        // Red / yellow light ahead: treat the stop line as a stopped car (if it can still stop)
        float stopX = dir > 0 ? kStopE : kStopW;
        float toStop = (stopX - c.x) * dir;
        if (hl != Green && toStop > 1.0f && toStop < 220.0f && (hl == Red || toStop > c.speed * c.speed / 12.0f)) {
            if (toStop < gap) { gap = toStop; lead = 0.0f; }
        }
        const float a = 1.6f, bcomf = 2.5f, s0 = 3.0f, T = 1.3f;
        float s = std::max(gap - 4.8f, 0.1f);
        float ss = s0 + c.speed * T + c.speed * (c.speed - lead) / (2.0f * std::sqrt(a * bcomf));
        float acc = a * (1.0f - std::pow(c.speed / c.target, 4.0f) - (ss / s) * (ss / s));
        c.speed = clampf(c.speed + std::max(acc, -9.0f) * dt, 0.0f, c.target * 1.1f);
        c.x += c.speed * dir * dt;
        if (c.x > kLoopMax) c.x = kLoopMin;
        if (c.x < kLoopMin) c.x = kLoopMax;
    }
    if (!driving) { havePos_ = false; return; }
    if (!havePos_) {
        for (float& y : yawHist_) y = truck.yaw;
        lastLane_ = -1;
        lastZone_ = -1;
        turnTimer_ = 0.0f;
    }

    // ---- Rules of the road for you ----
    vec3 p = truck.pos;
    float mph = truck.mph();
    float limit = speedLimitMph(p, sim);
    // Turn signals remember when they were last on
    signalAge_[0] = truck.signal < 0 ? 0.0f : signalAge_[0] + dt;
    signalAge_[1] = truck.signal > 0 ? 0.0f : signalAge_[1] + dt;
    speedCooldown_ = std::max(0.0f, speedCooldown_ - dt);
    if (mph > limit + 5.0f) overTimer_ += dt; else overTimer_ = 0.0f;
    bool ownLand = sim.land.contains(p.x, p.z);   // police don't patrol your private drive (the posted limit is still a good idea)
    if (overTimer_ > 3.0f && speedCooldown_ <= 0.0f && !ownLand) {
        float over = mph - limit;
        char b[96];
        std::snprintf(b, sizeof b, "speeding (%.0f in a %.0f zone)", double(mph), double(limit));
        sim.ticket(b, std::min(900.0, 150.0 + 10.0 * double(over)));
        warn(std::string("Pulled over for ") + b);
        speedCooldown_ = 25.0f;
        overTimer_ = 0.0f;
    } else if (mph > limit + 1.0f && warningTimer <= 0.0f) {
        char b[64];
        std::snprintf(b, sizeof b, "Slow down - the limit here is %.0f mph", double(limit));
        warn(b);
    }
    if (havePos_) {
        vec3 fwd = truck.forward();
        // Red lights: crossing a stop line while it's red
        bool eastbound = fwd.x > 0.5f, westbound = fwd.x < -0.5f, northbound = fwd.z < -0.5f;
        if (eastbound && lastPos_.x < kStopE && p.x >= kStopE && std::fabs(p.z - kHighwayZ) < kHighwayHalfWidth && hl == Red) {
            sim.ticket("running a red light", 300.0);
            warn("You ran a red light!");
        }
        if (westbound && lastPos_.x > kStopW && p.x <= kStopW && std::fabs(p.z - kHighwayZ) < kHighwayHalfWidth && hl == Red) {
            sim.ticket("running a red light", 300.0);
            warn("You ran a red light!");
        }
        if (northbound && lastPos_.z > kSideStopZ && p.z <= kSideStopZ && std::fabs(p.x - kCrossX) < 9.0f && sideLight() == Red) {
            sim.ticket("running a red light", 300.0);
            warn("You ran a red light!");
        }
        // Turns: entering or leaving the highway (at your gate or the crossroads) needs the matching signal.
        // A few seconds after you change road, compare your heading now with your heading before the turn.
        auto zone = [&](vec3 q) {
            if (std::fabs(q.z - kHighwayZ) < kHighwayHalfWidth) return 0;                                     // highway
            if (std::fabs(q.x - kCrossX) < 9.0f && q.z > kHighwayZ + kHighwayHalfWidth) return 1;              // side road
            if (std::fabs(q.x) < kGateHalfWidth + 2.0f && q.z < kHighwayZ - kHighwayHalfWidth) return 2;      // your drive
            return -1;
        };
        yawHist_[histPos_] = truck.yaw;
        histPos_ = (histPos_ + 1) % kHist;
        int zn = zone(p);
        if (zn >= 0 && lastZone_ >= 0 && zn != lastZone_ && turnTimer_ <= 0.0f) {
            turnTimer_ = 3.5f;
            turnYaw0_ = yawHist_[histPos_];   // the oldest heading we remember (~2 s ago)
        }
        if (zn >= 0) lastZone_ = zn;
        if (turnTimer_ > 0.0f) {
            turnTimer_ -= dt;
            if (turnTimer_ <= 0.0f) {
                float d = std::remainder(truck.yaw - turnYaw0_, 2.0f * kPi);
                if (std::fabs(d) > 0.6f) {
                    bool rightTurn = d < 0.0f;   // steering right turns the heading clockwise (yaw goes down)
                    // Signaled within 4 s before the turn, or at any point during it
                    if ((rightTurn ? signalAge_[1] : signalAge_[0]) > 4.0f + 3.5f) {
                        sim.ticket(std::string("turning ") + (rightTurn ? "right" : "left") + " without signaling", 120.0);
                        warn(std::string("You turned ") + (rightTurn ? "right" : "left") + " without signaling!");
                    }
                }
            }
        }
        // Lane changes on the highway need a signal (not while you're still turning onto it)
        int lane = laneAt(p.z);
        if (lane >= 0 && lastLane_ >= 0 && lane != lastLane_ && std::fabs(truck.speed) > 3.0f && turnTimer_ <= 0.0f &&
            (eastbound || westbound)) {
            float lateral = (p.z - lastPos_.z) * (eastbound ? 1.0f : -1.0f);   // + = to your right
            bool right = lateral > 0.0f;
            if ((right && signalAge_[1] > 3.0f) || (!right && signalAge_[0] > 3.0f)) {
                sim.ticket(std::string("changing lanes without signaling (") + (right ? "right" : "left") + ")", 120.0);
                warn("Use your turn signal when changing lanes!");
            }
        }
        lastLane_ = lane;
        // Wrong side of the highway
        bool onWestLanes = p.z < kHighwayZ - 0.3f && std::fabs(p.z - kHighwayZ) < kHighwayHalfWidth;
        bool onEastLanes = p.z > kHighwayZ + 0.3f && std::fabs(p.z - kHighwayZ) < kHighwayHalfWidth;
        if (turnTimer_ <= 0.0f && ((eastbound && onWestLanes) || (westbound && onEastLanes))) {
            wrongWayTimer_ += dt;
            if (wrongWayTimer_ > 0.5f && warningTimer <= 0.0f) warn("WRONG WAY! Get back in your lane!");
            if (wrongWayTimer_ > 3.0f) { sim.ticket("driving on the wrong side of the highway", 400.0); wrongWayTimer_ = -20.0f; }
        } else wrongWayTimer_ = std::min(wrongWayTimer_, 0.0f) + (wrongWayTimer_ < 0.0f ? dt : 0.0f);
    }
    // Crashes with traffic
    int hit = trafficHit(truck);
    if (hit >= 0 && crashCooldown_ <= 0.0f) {
        cars_[size_t(hit)].speed = 0.0f;
        truck.speed *= -0.2f;
        truck.crashTimer = 1.0f;
        sim.ticket("causing a collision (reckless driving)", 800.0);
        sim.econ.post(sim.clock.day(), Ledger::Maintenance, -1200.0, "Truck body work after the crash");
        warn("CRASH! You hit another car.");
        crashCooldown_ = 8.0f;
    }
    lastPos_ = p;
    havePos_ = true;
}

std::vector<InstanceData> Driving::trafficInstances() const {
    std::vector<InstanceData> v;
    v.reserve(cars_.size());
    for (const Car& c : cars_) {
        InstanceData d;
        bool east = c.lane < 2;
        d.model = mat4::translate({c.x, 0.03f, kLaneZ[c.lane]}) * mat4::rotateY(radians(east ? 90.0f : -90.0f));
        d.tint = c.tint;
        v.push_back(d);
    }
    return v;
}

void Driving::draw(Renderer& r, Pass p, vec3 camPos) const {
    if (p == Pass::Transparent) return;
    r.draw(sideRoad_);
    r.draw(lot_);
    r.draw(store_);
    for (const RoadSign& s : signs_) {
        float dx = s.pos.x - camPos.x, dz = s.pos.z - camPos.z;
        if (dx * dx + dz * dz > 900.0f * 900.0f) continue;
        vec3 base = s.pos;
        base.y = terrain::height(base.x, base.z);
        mat4 m = mat4::translate(base) * mat4::rotateY(s.yaw);
        const Mesh& board = s.kind == 0 ? speedBoard_ : s.kind == 1 ? guideBoard_ : s.kind == 2 ? mileBoard_ : s.kind == 3 ? storeBoard_ : serviceBoard_;
        if (s.kind == 1 || s.kind == 3 || s.kind == 4) {
            float w = s.kind == 3 ? 2.6f : (s.kind == 4 ? 1.0f : 1.5f);
            r.draw(post_, m * mat4::translate({-w, 0, 0}) * mat4::scale({1, s.kind == 3 ? 2.2f : 1.5f, 1}));
            r.draw(post_, m * mat4::translate({w, 0, 0}) * mat4::scale({1, s.kind == 3 ? 2.2f : 1.5f, 1}));
        } else {
            r.draw(post_, m);
        }
        r.draw(board, m);
    }
    // Traffic lights at the crossroads: one over each highway direction and one for the side road
    Light hl = highwayLight(), sl = sideLight();
    auto head = [&](vec3 pos, float yaw, Light l) {
        mat4 m = mat4::translate(pos) * mat4::rotateY(yaw);
        r.draw(lightHead_, m);
        auto t = [](bool on) { return on ? vec4(1, 1, 1, 1) : vec4(0.12f, 0.12f, 0.12f, 1); };
        r.draw(lampRed_, m, t(l == Red));
        r.draw(lampYellow_, m, t(l == Yellow));
        r.draw(lampGreen_, m, t(l == Green));
    };
    head({kStopE + 4.0f, 0, kHighwayZ + kHighwayHalfWidth + 1.5f}, radians(180.0f), hl);   // eastbound (arm over the lanes, facing -X after rotation)
    head({kStopW - 4.0f, 0, kHighwayZ - kHighwayHalfWidth - 1.5f}, 0.0f, hl);              // westbound
    head({kCrossX + 10.5f, 0, kSideStopZ + 2.0f}, radians(-90.0f), sl);                    // side road
}

void Driving::drawSignText(const Camera& cam, int W, int H) const {
    ImDrawList* dl = ImGui::GetBackgroundDrawList();
    mat4 vp = cam.viewProj();
    for (const RoadSign& s : signs_) {
        vec3 board = s.pos + vec3(0, s.kind == 3 ? 4.85f : (s.kind == 1 ? 3.0f : (s.kind == 2 ? 1.55f : (s.kind == 4 ? 2.15f : 2.28f))), 0);
        board.y += terrain::height(s.pos.x, s.pos.z);
        vec3 facing{std::sin(s.yaw), 0, std::cos(s.yaw)};
        vec3 toCam = cam.pos - board;
        float dist = length(toCam);
        if (dist > 160.0f || dot(facing, toCam) < 0.0f) continue;
        vec4 c = vp * vec4(board, 1.0f);
        if (c.w <= 0.1f) continue;
        float sx = (c.x / c.w * 0.5f + 0.5f) * float(W), sy = (1.0f - (c.y / c.w * 0.5f + 0.5f)) * float(H);
        if (sx < -200 || sx > float(W) + 200 || sy < -100 || sy > float(H) + 100) continue;
        float scale = clampf(28.0f / dist, 0.35f, 2.2f) * (s.kind == 3 ? 1.6f : 1.0f);
        ImU32 col = s.kind == 0 ? IM_COL32(20, 20, 20, 255) : IM_COL32(245, 245, 240, 255);
        ImFont* f = ImGui::GetFont();
        float fs = ImGui::GetFontSize() * scale;
        ImVec2 sz = f->CalcTextSizeA(fs, 1e9f, 0.0f, s.text.c_str());
        dl->AddText(f, fs, ImVec2(sx - sz.x * 0.5f, sy - sz.y * 0.5f), col, s.text.c_str());
    }
}

void Driving::drawHUD(const Sim& sim, const Truck& t, bool touch) const {
    ImGuiIO& io = ImGui::GetIO();
    ImDrawList* dl = ImGui::GetForegroundDrawList();
    // Speedometer + speed limit
    float limit = speedLimitMph(t.pos, sim);
    // Phones: the joystick sits bottom-left and the buttons bottom-right, so the gauges go bottom-center
    // and the map top-left under the status panel.
    ImVec2 c = touch ? ImVec2(io.DisplaySize.x * 0.5f + 40.0f, io.DisplaySize.y - 92.0f)
                     : ImVec2(io.DisplaySize.x - 110.0f, io.DisplaySize.y - 110.0f);
    dl->AddCircleFilled(c, 80.0f, IM_COL32(10, 12, 16, 190), 48);
    dl->AddCircle(c, 80.0f, IM_COL32(200, 200, 200, 160), 48, 2.0f);
    for (int i = 0; i <= 10; ++i) {
        float a = radians(225.0f - 27.0f * float(i));
        ImVec2 p0(c.x + std::cos(a) * 70.0f, c.y - std::sin(a) * 70.0f), p1(c.x + std::cos(a) * 78.0f, c.y - std::sin(a) * 78.0f);
        dl->AddLine(p0, p1, IM_COL32(220, 220, 220, 200), 2.0f);
        char b[8];
        std::snprintf(b, sizeof b, "%d", i * 10);
        dl->AddText(ImVec2(c.x + std::cos(a) * 56.0f - 8, c.y - std::sin(a) * 56.0f - 7), IM_COL32(200, 200, 200, 200), b);
    }
    float mph = t.mph();
    float na = radians(225.0f - 2.7f * std::min(mph, 100.0f));
    dl->AddLine(c, ImVec2(c.x + std::cos(na) * 66.0f, c.y - std::sin(na) * 66.0f), mph > limit + 5 ? IM_COL32(255, 70, 50, 255) : IM_COL32(255, 160, 60, 255), 3.5f);
    char b[48];
    std::snprintf(b, sizeof b, "%.0f mph", double(mph));
    dl->AddText(ImGui::GetFont(), 22.0f, ImVec2(c.x - 30, c.y + 22), IM_COL32(255, 255, 255, 255), b);
    // Speed limit sign
    ImVec2 s0(c.x - (touch ? 160.0f : 190.0f), c.y - 40.0f);
    dl->AddRectFilled(s0, ImVec2(s0.x + 62, s0.y + 80), IM_COL32(240, 240, 235, 240), 4.0f);
    dl->AddRect(s0, ImVec2(s0.x + 62, s0.y + 80), IM_COL32(20, 20, 20, 255), 4.0f, 0, 2.0f);
    dl->AddText(ImVec2(s0.x + 8, s0.y + 6), IM_COL32(20, 20, 20, 255), "SPEED");
    dl->AddText(ImVec2(s0.x + 9, s0.y + 20), IM_COL32(20, 20, 20, 255), "LIMIT");
    std::snprintf(b, sizeof b, "%.0f", double(limit));
    dl->AddText(ImGui::GetFont(), 28.0f, ImVec2(s0.x + 14, s0.y + 38), IM_COL32(20, 20, 20, 255), b);
    // Turn signal arrows (blinking)
    bool blink = std::fmod(clock_, 0.8f) < 0.4f;
    ImVec2 arrowC = touch ? ImVec2(c.x - 20.0f, c.y - 112.0f) : ImVec2(io.DisplaySize.x * 0.5f, io.DisplaySize.y - 40.0f);
    auto arrow = [&](float dir, bool on) {
        ImU32 col = on && blink ? IM_COL32(60, 255, 90, 255) : IM_COL32(60, 80, 60, 140);
        ImVec2 tip(arrowC.x + dir * 70.0f, arrowC.y), b0(arrowC.x + dir * 45.0f, arrowC.y - 14), b1(arrowC.x + dir * 45.0f, arrowC.y + 14);
        dl->AddTriangleFilled(tip, b0, b1, col);
        dl->AddRectFilled(ImVec2(std::min(arrowC.x + dir * 45.0f, arrowC.x + dir * 30.0f), arrowC.y - 6), ImVec2(std::max(arrowC.x + dir * 45.0f, arrowC.x + dir * 30.0f), arrowC.y + 6), col);
    };
    arrow(-1.0f, t.signal < 0);
    arrow(1.0f, t.signal > 0);
    // Traffic light status when near the crossroads
    if (std::fabs(t.pos.x - kCrossX) < 300.0f && std::fabs(t.pos.z - kHighwayZ) < 200.0f) {
        Light l = std::fabs(t.pos.x - kCrossX) < 9.0f && t.pos.z > kHighwayZ + kHighwayHalfWidth ? sideLight() : highwayLight();
        ImVec2 lc = touch ? ImVec2(c.x + 110.0f, c.y) : ImVec2(arrowC.x + 130.0f, io.DisplaySize.y - 70.0f);
        dl->AddRectFilled(ImVec2(lc.x - 14, lc.y - 44), ImVec2(lc.x + 14, lc.y + 44), IM_COL32(20, 20, 20, 230), 4.0f);
        dl->AddCircleFilled(ImVec2(lc.x, lc.y - 28), 10, l == Red ? IM_COL32(255, 40, 30, 255) : IM_COL32(70, 20, 20, 255));
        dl->AddCircleFilled(ImVec2(lc.x, lc.y), 10, l == Yellow ? IM_COL32(255, 190, 30, 255) : IM_COL32(70, 60, 20, 255));
        dl->AddCircleFilled(ImVec2(lc.x, lc.y + 28), 10, l == Green ? IM_COL32(40, 255, 110, 255) : IM_COL32(20, 60, 30, 255));
    }
    // Minimap / GPS: where you are, your land, the highway, the pet store
    ImVec2 m0 = touch ? ImVec2(12.0f, 128.0f) : ImVec2(16.0f, io.DisplaySize.y - 216.0f);
    ImVec2 m1 = touch ? ImVec2(232.0f, 272.0f) : ImVec2(296.0f, io.DisplaySize.y - 16.0f);
    dl->AddRectFilled(m0, m1, IM_COL32(18, 28, 22, 215), 6.0f);
    dl->AddRect(m0, m1, IM_COL32(200, 220, 200, 120), 6.0f);
    const float wx0 = -1200.0f, wx1 = 4200.0f, wz0 = -600.0f, wz1 = 1200.0f;
    auto M = [&](float x, float z) { return ImVec2(m0.x + (x - wx0) / (wx1 - wx0) * (m1.x - m0.x), m0.y + (z - wz0) / (wz1 - wz0) * (m1.y - m0.y)); };
    dl->PushClipRect(m0, m1, true);
    for (const FenceSeg& f : sim.land.propertyLine()) dl->AddLine(M(f.a.x, f.a.z), M(f.b.x, f.b.z), IM_COL32(255, 140, 60, 160), 1.0f);
    for (const FenceSeg& f : sim.land.yardFence()) dl->AddLine(M(f.a.x, f.a.z), M(f.b.x, f.b.z), IM_COL32(120, 200, 120, 230), 2.0f);
    dl->AddLine(M(wx0, kHighwayZ), M(wx1, kHighwayZ), IM_COL32(230, 230, 230, 255), 4.0f);
    dl->AddLine(M(0, kParkMaxZ), M(0, kHighwayZ), IM_COL32(200, 200, 200, 255), 2.0f);
    dl->AddLine(M(kCrossX, kHighwayZ), M(kCrossX, kHighwayZ + 190.0f), IM_COL32(200, 200, 200, 255), 2.0f);
    dl->AddCircleFilled(M(0, 0), 5.0f, IM_COL32(230, 70, 60, 255));
    dl->AddText(ImVec2(M(0, 0).x + 7, M(0, 0).y - 7), IM_COL32(255, 255, 255, 230), "Shelter");
    dl->AddCircleFilled(M(kPetStoreX, kPetStoreZ), 5.0f, IM_COL32(80, 160, 255, 255));
    dl->AddText(ImVec2(M(kPetStoreX, kPetStoreZ).x - 60, M(kPetStoreX, kPetStoreZ).y + 5), IM_COL32(255, 255, 255, 230), "Pet store");
    vec3 f = t.forward();
    ImVec2 me = M(t.pos.x, t.pos.z);
    dl->AddTriangleFilled(ImVec2(me.x + f.x * 9, me.y + f.z * 9), ImVec2(me.x - f.x * 5 + f.z * 5, me.y - f.z * 5 - f.x * 5),
                          ImVec2(me.x - f.x * 5 - f.z * 5, me.y - f.z * 5 + f.x * 5), IM_COL32(255, 230, 60, 255));
    dl->PopClipRect();
    float toStore = length(vec3(kPetStoreX - t.pos.x, 0, kPetStoreZ - t.pos.z)) / kMeterPerMile;
    float toHome = length(vec3(-t.pos.x, 0, -t.pos.z)) / kMeterPerMile;
    char gps[96];
    std::snprintf(gps, sizeof gps, "HWY 89  |  Pet store %.1f mi  |  Shelter %.1f mi", double(toStore), double(toHome));
    dl->AddText(ImVec2(m0.x + 6, m0.y + 4), IM_COL32(230, 240, 230, 255), gps);
    if (!sim.truckCargo.empty()) {
        std::snprintf(gps, sizeof gps, "Cargo: %d animal%s riding home", int(sim.truckCargo.size()), sim.truckCargo.size() == 1 ? "" : "s");
        dl->AddText(ImVec2(m0.x + 6, m0.y + 20), IM_COL32(255, 220, 120, 255), gps);
    }
    // Controls and warnings
    if (!touch)
        dl->AddText(ImVec2(16.0f, io.DisplaySize.y - 236.0f), IM_COL32(220, 220, 220, 200),
                    "W gas  S brake/reverse  A/D steer  Space handbrake  Q/E signals  L lights  V camera  F get out");
    if (warningTimer > 0.0f && !lastWarning.empty()) {
        ImVec2 sz = ImGui::CalcTextSize(lastWarning.c_str());
        ImVec2 p(io.DisplaySize.x * 0.5f - sz.x * 0.5f, 90.0f);
        dl->AddRectFilled(ImVec2(p.x - 12, p.y - 8), ImVec2(p.x + sz.x + 12, p.y + sz.y + 8), IM_COL32(150, 20, 20, 220), 6.0f);
        dl->AddText(p, IM_COL32(255, 255, 255, 255), lastWarning.c_str());
    }
}

}  // namespace ps
