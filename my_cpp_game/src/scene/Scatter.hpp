#pragma once
#include "geometry/Shapes.hpp"
#include "rendering/Renderer.hpp"

#include <string>
#include <vector>

namespace game::scene {

/* NATIVE: ground scatter -- the grass, weeds and stones the web maps never
 * had budget for.
 *
 * The maps are built from boxes on a flat ground, and the seam where a wall
 * meets that ground is a ruled line: nothing grows against it, nothing has
 * rolled into it, and a lawn is a green floor. This fills the ground that
 * nothing else stands on. Everything is derived from the map's own geometry
 * -- which draws are ground (by their material: grass, dirt, sand, gravel,
 * mud), and which boxes stand on it -- so a map needs no hand placement and
 * a new map gets it for free. Deterministic: the same map scatters the same. */

// A draw's instance reduced to what the scatter needs.
struct WorldBox {
    glm::vec3 lo{0.0f}, hi{0.0f};
    enum Kind { Solid, Lawn, Dirt, Sand, Water, Ignore } kind = Solid;
};

struct ScatterResult {
    std::vector<rendering::Instance> grass;    // lush tufts, lawns
    std::vector<rendering::Instance> weeds;    // dry tufts, dirt and wall bases
    std::vector<rendering::Instance> stones;   // pebbles and rubble
};

ScatterResult scatterGround(const std::vector<WorldBox>& boxes, uint32_t seed, size_t budget = 80000);

/* The lawn as a field for the GPU grass around the camera (GRASS_FIELD in
   transform.glsl): per cell, the density of grass (0 where anything stands
   or the ground is not lawn) and the height of the ground. */
struct LawnField {
    glm::vec2 origin{0.0f}, size{0.0f};
    int nx = 0, nz = 0;
    std::vector<float> rg;   // interleaved density, height
};
LawnField buildLawnField(const std::vector<WorldBox>& boxes, uint32_t seed, float cell = 0.25f);

// One tuft: blades fanned round the origin, root at y = 0, height ~1, uv.y
// running root to tip (the GRASS vertex path bends by it). Two-sided by
// construction, both faces lit from above, so it needs no culling change.
geometry::MeshData grassTuft(uint32_t seed, int blades = 6, bool dry = false);

} // namespace game::scene
