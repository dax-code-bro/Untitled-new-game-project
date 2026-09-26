// Procedural scenery builders: terrain LOD levels, perimeter fence,
// highway, trees, utility poles and creative-mode building models.
#pragma once
#include "game/Buildables.h"
#include "game/Land.h"
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

// The yard fence (gap at the gate where the access road crosses the line z = gateZ)
std::vector<FenceSeg> fencePieces(const std::vector<FenceSeg>& segs, float gateZ);
void buildFence(MeshBuilder& b, const std::vector<FenceSeg>& segs, float gateZ);
// Survey stakes with orange tops along your property line (within `radius` of the shelter)
void buildPropertyStakes(MeshBuilder& b, const std::vector<FenceSeg>& segs, float radius);
void buildHighway(MeshBuilder& b);
void buildPineTree(MeshBuilder& b);
void buildOakTree(MeshBuilder& b);
void buildUtilityPole(MeshBuilder& b);
void buildBush(MeshBuilder& b);
void buildRock(MeshBuilder& b);
void buildGrassClump(MeshBuilder& b, bool flowers);
void buildBuildable(MeshBuilder& b, BuildKind kind);

}  // namespace ps::scenery
