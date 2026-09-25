#include "world/Terrain.h"
#include "core/Noise.h"
#include "world/Layout.h"
#include <cmath>

namespace ps::terrain {
using namespace layout;

static float distToSegment(float px, float pz, float ax, float az, float bx, float bz) {
    float vx = bx - ax, vz = bz - az;
    float t = clampf(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0.0f, 1.0f);
    float dx = px - (ax + vx * t), dz = pz - (az + vz * t);
    return std::sqrt(dx * dx + dz * dz);
}

float naturalness(float x, float z) {
    // Facility + access road corridor
    float dFac = distToSegment(x, z, 0.0f, -60.0f, 0.0f, kHighwayZ) - 70.0f;
    float wFac = smoothstepf(0.0f, kFlatRadius - 70.0f, dFac);
    // Highway corridor (runs east-west through the whole background)
    float dHwy = std::fabs(z - kHighwayZ) - 30.0f;
    float wHwy = smoothstepf(0.0f, 450.0f, dHwy);
    // Pet store at the crossroads 2 miles east, and its side road south
    float sx = std::max(std::max(kCrossX - 30.0f - x, x - (kPetStoreX + 60.0f)), 0.0f);
    float sz = std::max(std::max(kHighwayZ - z, z - (kHighwayZ + 190.0f)), 0.0f);
    float wStore = smoothstepf(0.0f, 300.0f, std::sqrt(sx * sx + sz * sz));
    return std::min(std::min(wFac, wHwy), wStore);
}

// Distance outside the property (0 inside)
static float outsideDistance(float x, float z) {
    float dx = std::max(std::max(kRegionMinX - x, x - kRegionMaxX), 0.0f);
    float dz = std::max(std::max(kRegionMinZ - z, z - kRegionMaxZ), 0.0f);
    return std::sqrt(dx * dx + dz * dz);
}

static float rawHeight(float x, float z) {
    float h = 0.0f;
    h += fbm(x / 4200.0f, z / 4200.0f, 5, 11u) * 140.0f;       // big rolling hills
    h += fbm(x / 700.0f, z / 700.0f, 4, 23u) * 28.0f;          // medium
    h += fbm(x / 90.0f, z / 90.0f, 3, 37u) * 2.2f;             // small bumps
    // Northern highlands inside the property
    float north = smoothstepf(-12000.0f, -26000.0f, z);
    h += ridged(x / 5200.0f, z / 5200.0f, 5, 51u) * 520.0f * north;
    // Background mountain ranges beyond the barrier (north, east, west)
    float out = outsideDistance(x, z);
    float mount = smoothstepf(1500.0f, 14000.0f, out);
    if (z > kHighwayZ + 300.0f) mount *= 0.45f;                // gentler farmland to the south
    h += ridged(x / 6500.0f, z / 6500.0f, 6, 71u) * 1500.0f * mount;
    return h;
}

float height(float x, float z) {
    float n = naturalness(x, z);
    if (n <= 0.0f) return 0.0f;
    float h = rawHeight(x, z);
    // Don't let natural terrain dip far below the facility plain near the blend
    return h * n;
}

vec3 normal(float x, float z, float eps) {
    float hl = height(x - eps, z), hr = height(x + eps, z);
    float hd = height(x, z - eps), hu = height(x, z + eps);
    return normalize(vec3(hl - hr, 2.0f * eps, hd - hu));
}

float forestDensity(float x, float z) {
    float f = fbm(x / 1800.0f, z / 1800.0f, 4, 91u) * 0.5f + 0.5f;
    f = smoothstepf(0.42f, 0.70f, f);
    float n = naturalness(x, z);
    return f * smoothstepf(0.15f, 0.5f, n);
}

}  // namespace ps::terrain
