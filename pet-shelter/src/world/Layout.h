// World layout: the 500 sq mi property, the starting facility floor plan,
// road, gate and highway. Pure data, shared by rendering, collision and tests.
//
// Axes: +X east, +Y up, +Z south. The facility sits near the south edge of
// the property; the road runs south to the gate and the highway beyond it.
#pragma once
#include "core/Math.h"
#include <string>
#include <vector>

namespace ps::layout {

// ---- Property / barrier -----------------------------------------------------
constexpr float kMeterPerMile = 1609.344f;
constexpr float kAreaSqMiles = 500.0f;
// side = sqrt(500) miles = 22.3607 mi = 35,986.6 m
constexpr float kRegionSide = 22.360680f * kMeterPerMile;
constexpr float kSouthEdge = 600.0f;                      // z of the south fence line
constexpr float kRegionMinX = -kRegionSide * 0.5f;
constexpr float kRegionMaxX = kRegionSide * 0.5f;
constexpr float kRegionMinZ = kSouthEdge - kRegionSide;
constexpr float kRegionMaxZ = kSouthEdge;
constexpr float kBarrierInset = 1.0f;                     // player stops this far inside the fence
constexpr float kBackgroundExtent = 25000.0f;             // scenery drawn this far beyond the fence

inline bool insideRegion(float x, float z, float margin = 0.0f) {
    return x > kRegionMinX + margin && x < kRegionMaxX - margin && z > kRegionMinZ + margin && z < kRegionMaxZ - margin;
}
inline vec3 clampToRegion(vec3 p, float margin = kBarrierInset) {
    p.x = clampf(p.x, kRegionMinX + margin, kRegionMaxX - margin);
    p.z = clampf(p.z, kRegionMinZ + margin, kRegionMaxZ - margin);
    return p;
}

// ---- Roads / gate / highway -------------------------------------------------
constexpr float kHighwayZ = 640.0f;        // highway centerline (outside the fence)
constexpr float kHighwayHalfWidth = 8.0f;
constexpr float kRoadHalfWidth = 3.5f;     // access road, x in [-3.5, 3.5]
constexpr float kRoadStartZ = 40.0f;       // meets the parking lot
constexpr float kGateX = 0.0f;
constexpr float kGateHalfWidth = 4.5f;
constexpr float kParkMinX = -22.0f, kParkMaxX = 22.0f, kParkMinZ = 12.0f, kParkMaxZ = 40.0f;
constexpr float kFlatRadius = 900.0f;      // terrain is flattened around the facility

// ---- Building ---------------------------------------------------------------
constexpr float kFloorY = 0.30f;           // top of the foundation slab
constexpr float kWallHeight = 3.0f;
constexpr float kCeilingY = kFloorY + kWallHeight;
constexpr float kWallThick = 0.16f;
constexpr float kDoorWidth = 0.95f;
constexpr float kDoorHeight = 2.15f;
constexpr float kFrontDoorWidth = 1.3f;

enum class FloorKind { Tile, Wood, Carpet, Clinical };

struct RoomSpec {
    std::string name;
    float minX, minZ, maxX, maxZ;
    FloorKind floor;
    vec3 wallColor;
    bool hasLight = true;
};

struct Opening {
    float center, width, height;
    float sill = 0.0f;    // 0 for doors, >0 for windows (glazed)
    bool isWindow() const { return sill > 0.01f; }
};

// A straight wall along X (fixed z) or along Z (fixed x), with door openings.
struct WallSpec {
    bool alongX;
    float fixed;          // z if alongX, else x
    float a, b;           // span along the wall axis
    std::vector<Opening> openings;
    bool exterior = false;
};

struct DoorSpec {
    std::string name;     // shown in the interaction prompt
    bool alongX;          // wall orientation the door sits in
    float fixed;          // wall coordinate
    float center;         // along the wall
    float width;
    float swingSign;      // +1 swings toward +normal side, -1 toward -normal
    bool lockable = true;
};

const std::vector<RoomSpec>& rooms();
const std::vector<WallSpec>& walls();
const std::vector<DoorSpec>& doors();
AABB buildingBounds();           // overall footprint incl. walls, floor to roof
const RoomSpec* roomAt(float x, float z);

// Key interior spots (used by furniture, interaction, tests)
constexpr float kOfficeDeskX = -8.0f, kOfficeDeskZ = 4.95f;
vec3 officeComputerPos();        // monitor center
vec3 playerSpawnFrontDoor();     // just outside the front door, facing north

}  // namespace ps::layout
