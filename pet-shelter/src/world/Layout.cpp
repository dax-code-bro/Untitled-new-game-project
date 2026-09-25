#include "world/Layout.h"

namespace ps::layout {

// Floor plan (meters, top view, north = -Z):
//
//   x: -12      -8   -4       0       4    7         12
//  z=-5                                   +-----------+
//  z=-3         +----+                +---+  MEDICAL  |
//               |BATH|                |BTH|           |
//  z=-2         | L  +-------+-------+ R |           |
//  z= 0 +-------+-d--+       |       +-d-+-----d-----+
//       |  hallway (L)  d  WAITING  d  hallway (R)  |
//  z=1.6+-----d---------+    ROOM    +-------d-------+
//       |    OFFICE     |            |  APPOINTMENT  |
//  z= 6 +---------------+-----DD-----+---------------+
//                      front door (south, faces road)
const std::vector<RoomSpec>& rooms() {
    static const std::vector<RoomSpec> r = {
        {"Waiting Room",     -4.0f, -2.0f,  4.0f, 6.0f, FloorKind::Tile,     {0.86f, 0.82f, 0.74f}},
        {"Hallway",         -12.0f,  0.0f, -4.0f, 1.6f, FloorKind::Wood,     {0.80f, 0.80f, 0.78f}},
        {"Bathroom",         -8.0f, -3.0f, -4.0f, 0.0f, FloorKind::Tile,     {0.78f, 0.86f, 0.90f}},
        {"Office",          -12.0f,  1.6f, -4.0f, 6.0f, FloorKind::Carpet,   {0.72f, 0.76f, 0.70f}},
        {"Hallway",           4.0f,  0.0f, 12.0f, 1.6f, FloorKind::Wood,     {0.80f, 0.80f, 0.78f}},
        {"Bathroom",          4.0f, -3.0f,  7.0f, 0.0f, FloorKind::Tile,     {0.78f, 0.86f, 0.90f}},
        {"Medical Room",      7.0f, -5.0f, 12.0f, 0.0f, FloorKind::Clinical, {0.90f, 0.93f, 0.94f}},
        {"Appointment Room",  4.0f,  1.6f, 12.0f, 6.0f, FloorKind::Tile,     {0.88f, 0.84f, 0.76f}},
    };
    return r;
}

const std::vector<WallSpec>& walls() {
    const float dw = kDoorWidth, dh = kDoorHeight;
    static const std::vector<WallSpec> w = {
        // --- walls along X (constant z) ---
        {true, 6.0f, -12.0f, 12.0f, {{0.0f, kFrontDoorWidth, 2.3f},
                                     {-2.6f, 1.6f, 1.2f, 1.0f}, {2.6f, 1.6f, 1.2f, 1.0f},
                                     {-10.0f, 1.4f, 1.2f, 1.0f}, {-6.0f, 1.4f, 1.2f, 1.0f},
                                     {6.0f, 1.4f, 1.2f, 1.0f}, {10.0f, 1.4f, 1.2f, 1.0f}}, true},
        {true, -2.0f, -4.0f, 4.0f, {{0.0f, 2.0f, 1.1f, 1.1f}}, true},     // waiting room back
        {true, 0.0f, -12.0f, -4.0f, {{-6.0f, dw, dh}}, false},            // left hall north (bath door)
        {true, 1.6f, -12.0f, -4.0f, {{-9.0f, dw, dh}}, false},            // left hall south (office door)
        {true, -3.0f, -8.0f, -4.0f, {}, true},                            // left bath back
        {true, 0.0f, 4.0f, 12.0f, {{5.5f, dw, dh}, {9.5f, dw, dh}}, false},
        {true, 1.6f, 4.0f, 12.0f, {{8.0f, dw, dh}}, false},
        {true, -3.0f, 4.0f, 7.0f, {}, true},                              // right bath back
        {true, -5.0f, 7.0f, 12.0f, {{9.5f, 1.8f, 1.1f, 1.1f}}, true},     // medical back
        // --- walls along Z (constant x) ---
        {false, -12.0f, 0.0f, 6.0f, {{4.0f, 1.4f, 1.2f, 1.0f}}, true},
        {false, -8.0f, -3.0f, 0.0f, {}, true},
        {false, -4.0f, -3.0f, 6.0f, {{0.8f, dw, dh}}, false},
        {false, 4.0f, -3.0f, 6.0f, {{0.8f, dw, dh}}, false},
        {false, 7.0f, -5.0f, 0.0f, {}, false},
        {false, 12.0f, -5.0f, 6.0f, {{-2.5f, 1.4f, 1.2f, 1.0f}, {4.0f, 1.4f, 1.2f, 1.0f}}, true},
    };
    return w;
}

const std::vector<DoorSpec>& doors() {
    static const std::vector<DoorSpec> d = {
        {"Front Door",        true,  6.0f,  0.0f, kFrontDoorWidth, -1.0f},
        {"Left Hallway",      false, -4.0f, 0.8f, kDoorWidth,      -1.0f, false},
        {"Right Hallway",     false,  4.0f, 0.8f, kDoorWidth,      +1.0f, false},
        {"Bathroom",          true,  0.0f, -6.0f, kDoorWidth,      -1.0f},
        {"Office",            true,  1.6f, -9.0f, kDoorWidth,      +1.0f},
        {"Bathroom",          true,  0.0f,  5.5f, kDoorWidth,      -1.0f},
        {"Medical Room",      true,  0.0f,  9.5f, kDoorWidth,      -1.0f},
        {"Appointment Room",  true,  1.6f,  8.0f, kDoorWidth,      +1.0f},
    };
    return d;
}

AABB buildingBounds() {
    return AABB({-12.0f - kWallThick, 0.0f, -5.0f - kWallThick}, {12.0f + kWallThick, kCeilingY + 0.6f, 6.0f + kWallThick});
}

const RoomSpec* roomAt(float x, float z) {
    for (const auto& r : rooms())
        if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return &r;
    return nullptr;
}

vec3 officeComputerPos() { return {kOfficeDeskX, kFloorY + 0.76f + 0.28f, kOfficeDeskZ + 0.1f}; }
vec3 playerSpawnFrontDoor() { return {0.0f, 0.0f, 9.0f}; }

}  // namespace ps::layout
