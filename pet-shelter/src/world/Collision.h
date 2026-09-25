// Simple character collision: vertical cylinder vs axis-aligned boxes, plus
// walkable surfaces (floors, terrain) and the property barrier.
#pragma once
#include "core/Math.h"
#include <unordered_map>
#include <vector>

namespace ps {

class CollisionWorld {
public:
    // Solid blockers. Returns an id usable to toggle/move dynamic boxes.
    int addBox(const AABB& box, bool walkableTop = false);
    void setEnabled(int id, bool enabled);
    void setBox(int id, const AABB& box);
    void remove(int id);
    const AABB& box(int id) const { return boxes_[size_t(id)].box; }

    // Ground height under (x,z) for feet at `feetY` (can step up `stepUp`).
    float groundHeight(float x, float z, float feetY, float stepUp = 0.45f) const;

    // Move a standing cylinder (feet position) by `delta` on XZ, resolving
    // collisions and the barrier. Returns the new feet position (y snapped to ground).
    vec3 moveCharacter(vec3 feet, vec3 delta, float radius, float height) const;

    // First hit along a ray against enabled boxes (for interaction/placement).
    float raycast(vec3 ro, vec3 rd, float maxDist, int* hitId = nullptr) const;

    size_t count() const { return boxes_.size(); }

private:
    struct Entry { AABB box; bool enabled = true; bool walkable = false; bool alive = true; };
    std::vector<Entry> boxes_;
    // Broad-phase grid (cell -> box ids)
    static constexpr float kCell = 16.0f;
    std::unordered_map<long long, std::vector<int>> grid_;
    static long long key(int cx, int cz) { return (long long)cx * 73856093LL ^ (long long)cz * 19349663LL; }
    void insertGrid(int id);
    void eraseGrid(int id);
    template <class F> void query(float minX, float minZ, float maxX, float maxZ, F&& f) const;
};

}  // namespace ps
