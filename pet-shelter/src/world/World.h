// The whole world: 500 sq mi of terrain plus background scenery, the
// perimeter fence (barrier), highway traffic, forests, the starting facility
// and everything the player builds in creative mode.
#pragma once
#include "game/Sim.h"
#include "render/Renderer.h"
#include "world/Collision.h"
#include "world/Facility.h"
#include "world/Scenery.h"
#include <unordered_map>
#include <vector>

namespace ps {

class World {
public:
    void build(float detail = 1.0f);   // detail 2 = half the terrain resolution (phones)
    void update(float dt, vec3 camPos, float time, Sim& sim);
    void draw(Renderer& r, Pass pass, float night, float time) const;
    void appendLights(std::vector<PointLight>& out, float night) const;
    // Rebuilds colliders and cached transforms for creative-mode objects.
    void syncPlaced(const Sim& sim);
    const Mesh& buildableMesh(BuildKind k) const { return buildables_[size_t(k)]; }
    mat4 placedTransform(const Placed& p) const;
    // Ray vs terrain (for creative placement). Returns distance or -1.
    float raycastTerrain(vec3 ro, vec3 rd, float maxDist) const;

    CollisionWorld collision;
    Facility facility;

    // Creative-mode ghost preview
    bool ghostVisible = false;
    BuildKind ghostKind = BuildKind::Tree;
    mat4 ghostModel;
    bool ghostValid = true;
    int highlightPlaced = -1;
    float treeRadius = 2600.0f;   // trees drawn within this distance (smaller on phones)

private:
    struct Chunk { Mesh mesh; AABB bounds; int level; };
    struct TreeInst { vec3 pos; float scale, yaw; vec4 tint; bool pine; };
    void refreshTrees(vec3 camPos);
    const std::vector<TreeInst>& treeCell(int cx, int cz);

    std::vector<Chunk> terrain_;
    Mesh fence_, highway_, pine_, oak_, pineShadow_, oakShadow_, poles_, traffic_;
    Mesh buildables_[size_t(BuildKind::Count)];
    std::unordered_map<long long, std::vector<TreeInst>> treeCells_;
    vec3 treeCenter_{1e9f, 0, 1e9f};

    struct Car { int lane; float x0, speed; vec4 tint; };
    std::vector<Car> cars_;

    struct PlacedDraw { int id; BuildKind kind; mat4 model; AABB bounds; };
    std::vector<PlacedDraw> placedDraw_;
    std::vector<int> placedColliders_;
    size_t placedVersion_ = size_t(-1);
};

}  // namespace ps
