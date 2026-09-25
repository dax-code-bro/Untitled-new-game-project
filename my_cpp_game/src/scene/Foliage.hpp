#pragma once
#include "geometry/Shapes.hpp"
#include <cstdint>
#include <vector>

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

/* NATIVE, the second pass on trees. A crown actor is scaled to the tree --
   four or five metres -- so geometry leaves sized to the unit crown came out
   30-48 cm across, which is what still read as a low-poly tree up close.
   The near crowns are now clusters of alpha-cut CARDS, each carrying a
   painted spray of small leaves (leafSprayMaps), so the apparent leaf is a
   few centimetres whatever the crown's size. Two faces per card, both with
   normals bent toward the crown's radial direction. */
geometry::MeshData foliageCards(uint32_t seed, int cards = 380, float cardSize = 0.2f);

// RGBA8 maps, size x size: albedo (sRGB, alpha = leaf cut-out), tangent-
// space normal, ORM (ao, roughness, metalness, height).
struct PaintedMaps {
    int size = 0;
    std::vector<uint8_t> albedo, normal, orm;
};
PaintedMaps leafSprayMaps(int size = 512, uint32_t seed = 7);
PaintedMaps barkMaps(int size = 512, uint32_t seed = 3);
PaintedMaps needleSprayMaps(int size = 512, uint32_t seed = 5);

/* A conifer tier to stand in for the unit cone (radius 0.5 at y = -0.5,
   apex at y = 0.5): needle-spray cards over the cone's surface, hanging
   outward and down like the ends of fir branches, plus a dark core. */
geometry::MeshData coniferCards(uint32_t seed, int cards = 260, float cardSize = 0.22f);

/* A tree trunk (or limb) to stand in for the unit cylinder: the same frame
   (radius 0.5, y from -0.5 to 0.5), tapered, slightly bent, with a root
   flare at the foot of a trunk and bark bumps, UV'd for barkMaps. */
geometry::MeshData treeTrunk(uint32_t seed, bool flare);

} // namespace game::scene
