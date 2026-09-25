// The starting facility: the building (waiting room, hallways, bathrooms,
// office, medical room, appointment room), furniture, lights, animated
// doors, the parking lot, access road and the owner-only highway gate.
#pragma once
#include "game/Security.h"
#include "render/Animation.h"
#include "render/Renderer.h"
#include "world/Collision.h"
#include "world/Layout.h"
#include <string>
#include <vector>

namespace ps {

struct Interaction {
    enum Type { None, Door, Gate, Computer, OperatingTable } type = None;
    int index = -1;
    std::string prompt;
    float distance = 0.0f;
};

class Facility {
public:
    struct Door {
        layout::DoorSpec spec;
        Tween swing;             // 0 closed .. 1 open
        int collider = -1;
        bool locked = false;
        mat4 model() const;
        AABB panelBounds() const;
    };

    void build(CollisionWorld& cw);
    void update(float dt, SecuritySystem& sec, float hour, CollisionWorld& cw);
    void draw(Renderer& r, Pass pass, float night, float time) const;
    void appendLights(std::vector<PointLight>& out, float night) const;

    Interaction pick(vec3 ro, vec3 rd, float maxDist, const SecuritySystem& sec) const;
    void interact(const Interaction& it, SecuritySystem& sec);
    void toggleDoor(int i);

    std::vector<Door> doors;
    Tween gate;                  // 0 closed .. 1 open
    mat4 playerCar;              // truck transform (cutscene / parked / driving)
    bool gateRemote = false;     // your truck is at the gate: its remote opens it
    bool drawCar = true;         // the game draws the drivable truck itself
    int carCollider = -1;
    void setCarCollider(CollisionWorld& cw, vec3 pos, float yaw);
    const Mesh& carMesh() const { return car_; }
    static void buildCar(MeshBuilder& b, vec3 paint);
    static vec3 parkedCarPos() { return {-8.0f, 0.0f, 22.0f}; }

private:
    void buildShell(MeshBuilder& opaque, MeshBuilder& glass, CollisionWorld& cw);
    void buildFurniture(MeshBuilder& b, CollisionWorld& cw);
    void buildExterior(MeshBuilder& b, CollisionWorld& cw);
    void buildGate(CollisionWorld& cw);

    Mesh shell_, glass_, door_, frontDoor_, gatePanel_, car_, emissiveNight_;
    std::vector<PointLight> roomLights_, outdoorLights_;
    int gateCollider_ = -1;
    AABB gateKeypad_, computerBox_;
};

}  // namespace ps
