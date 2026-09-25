// Procedural scenery builders: terrain LOD levels, perimeter fence,
// highway, trees, utility poles and creative-mode building models.
#pragma once
#include "game/Buildables.h"
#include "render/Mesh.h"
#include <vector>

namespace ps::scenery {

struct Rect { float minX, minZ, maxX, maxZ; };

struct TerrainTile {
    MeshBuilder builder;
    AABB bounds;
};

// Builds one LOD ring as tiles (optionally with a hole where a finer level is).
std::vector<TerrainTile> buildTerrainLevel(Rect area, float spacing, int tilesPerSide, const Rect* hole);

void buildPerimeterFence(MeshBuilder& b);
void buildHighway(MeshBuilder& b);
void buildPineTree(MeshBuilder& b);
void buildOakTree(MeshBuilder& b);
void buildUtilityPole(MeshBuilder& b);
void buildBuildable(MeshBuilder& b, BuildKind kind);

}  // namespace ps::scenery
