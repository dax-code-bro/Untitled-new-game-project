// Procedural terrain height field covering the 500 sq mi property and the
// background scenery beyond the barrier. Deterministic: the same function is
// used for rendering, collision, placement and tests.
#pragma once
#include "core/Math.h"

namespace ps::terrain {

float height(float x, float z);
vec3 normal(float x, float z, float eps = 1.0f);
// 0 = flattened facility/road ground, 1 = fully natural terrain
float naturalness(float x, float z);
// Soft "biome" value used for tree density (0..1)
float forestDensity(float x, float z);

}  // namespace ps::terrain
