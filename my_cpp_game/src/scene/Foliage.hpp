#pragma once
#include "geometry/Shapes.hpp"
#include <cstdint>

namespace game::scene {

/* A crown of leaves to stand in for the sphere the web maps build a tree
 * canopy from. Fits the same unit sphere (radius 0.5) the engine's 'sphere'
 * mesh does, so every crown actor keeps its transform and just changes
 * mesh.
 *
 * Each leaf is real geometry -- a six-point leaf outline, both faces
 * emitted -- not a textured card, so it needs no alpha test and its shadow
 * in the sun's map is leaf-shaped. Leaves are packed thickest near the
 * surface of the crown with gaps between, face roughly outward with a
 * random twist, and carry normals bent 80% toward the crown's radial
 * direction: the canopy then shades as one soft volume (lit side, shadow
 * side) instead of as eight hundred glittering mirrors. Each leaf gets its
 * own tint -- lighter, darker, yellower -- through the per-vertex colour
 * the renderer already supports. */
/* leafScale multiplies the leaf size: the far-bank variant uses fewer,
   bigger leaves, which cover the same crown for a third of the triangles. */
geometry::MeshData foliageCluster(uint32_t seed, int leaves = 1100, float leafScale = 1.0f);

} // namespace game::scene
