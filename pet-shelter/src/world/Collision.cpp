#include "world/Collision.h"
#include "world/Layout.h"
#include "world/Terrain.h"
#include <cmath>
#include <unordered_set>

namespace ps {

int CollisionWorld::addBox(const AABB& box, bool walkableTop) {
    Entry e;
    e.box = box;
    e.walkable = walkableTop;
    boxes_.push_back(e);
    int id = int(boxes_.size()) - 1;
    insertGrid(id);
    return id;
}

void CollisionWorld::setEnabled(int id, bool enabled) { boxes_[size_t(id)].enabled = enabled; }

void CollisionWorld::setBox(int id, const AABB& box) {
    eraseGrid(id);
    boxes_[size_t(id)].box = box;
    insertGrid(id);
}

void CollisionWorld::remove(int id) {
    eraseGrid(id);
    boxes_[size_t(id)].alive = false;
    boxes_[size_t(id)].enabled = false;
}

void CollisionWorld::insertGrid(int id) {
    const AABB& b = boxes_[size_t(id)].box;
    int x0 = int(std::floor(b.min.x / kCell)), x1 = int(std::floor(b.max.x / kCell));
    int z0 = int(std::floor(b.min.z / kCell)), z1 = int(std::floor(b.max.z / kCell));
    for (int cx = x0; cx <= x1; ++cx)
        for (int cz = z0; cz <= z1; ++cz) grid_[key(cx, cz)].push_back(id);
}

void CollisionWorld::eraseGrid(int id) {
    const AABB& b = boxes_[size_t(id)].box;
    int x0 = int(std::floor(b.min.x / kCell)), x1 = int(std::floor(b.max.x / kCell));
    int z0 = int(std::floor(b.min.z / kCell)), z1 = int(std::floor(b.max.z / kCell));
    for (int cx = x0; cx <= x1; ++cx)
        for (int cz = z0; cz <= z1; ++cz) {
            auto it = grid_.find(key(cx, cz));
            if (it == grid_.end()) continue;
            auto& v = it->second;
            for (size_t i = 0; i < v.size(); ++i)
                if (v[i] == id) { v[i] = v.back(); v.pop_back(); break; }
        }
}

template <class F>
void CollisionWorld::query(float minX, float minZ, float maxX, float maxZ, F&& f) const {
    int x0 = int(std::floor(minX / kCell)), x1 = int(std::floor(maxX / kCell));
    int z0 = int(std::floor(minZ / kCell)), z1 = int(std::floor(maxZ / kCell));
    // Boxes spanning several cells appear more than once; dedupe small sets inline.
    int seen[256]; int nSeen = 0;
    for (int cx = x0; cx <= x1; ++cx)
        for (int cz = z0; cz <= z1; ++cz) {
            auto it = grid_.find(key(cx, cz));
            if (it == grid_.end()) continue;
            for (int id : it->second) {
                bool dup = false;
                for (int i = 0; i < nSeen; ++i) if (seen[i] == id) { dup = true; break; }
                if (dup) continue;
                if (nSeen < 256) seen[nSeen++] = id;
                const Entry& e = boxes_[size_t(id)];
                if (e.alive && e.enabled) f(id, e);
            }
        }
}

float CollisionWorld::groundHeight(float x, float z, float feetY, float stepUp) const {
    float g = terrain::height(x, z);
    query(x, z, x, z, [&](int, const Entry& e) {
        const AABB& b = e.box;
        if (!e.walkable) return;
        if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y <= feetY + stepUp)
            g = std::max(g, b.max.y);
    });
    return g;
}

vec3 CollisionWorld::moveCharacter(vec3 feet, vec3 delta, float radius, float height) const {
    // Sub-step so fast movement can't tunnel through thin walls.
    float dist = length(vec3(delta.x, 0, delta.z));
    int steps = std::max(1, int(std::ceil(dist / (radius * 0.5f))));
    vec3 step = vec3(delta.x, 0, delta.z) / float(steps);
    vec3 p = feet;
    for (int s = 0; s < steps; ++s) {
        p += step;
        // Resolve penetration against solid boxes (circle vs rect in XZ).
        for (int iter = 0; iter < 3; ++iter) {
            bool any = false;
            query(p.x - radius, p.z - radius, p.x + radius, p.z + radius, [&](int, const Entry& e) {
                const AABB& b = e.box;
                if (b.max.y <= p.y + 0.46f || b.min.y >= p.y + height) return;  // step over / pass under
                float cx = clampf(p.x, b.min.x, b.max.x), cz = clampf(p.z, b.min.z, b.max.z);
                float dx = p.x - cx, dz = p.z - cz;
                float d2 = dx * dx + dz * dz;
                if (d2 >= radius * radius) return;
                any = true;
                if (d2 > 1e-10f) {
                    float d = std::sqrt(d2);
                    p.x += dx / d * (radius - d);
                    p.z += dz / d * (radius - d);
                } else {
                    // Center inside the box: push out along the smallest axis.
                    float pushes[4] = {p.x - b.min.x, b.max.x - p.x, p.z - b.min.z, b.max.z - p.z};
                    int best = 0;
                    for (int i = 1; i < 4; ++i) if (pushes[i] < pushes[best]) best = i;
                    if (best == 0) p.x = b.min.x - radius;
                    else if (best == 1) p.x = b.max.x + radius;
                    else if (best == 2) p.z = b.min.z - radius;
                    else p.z = b.max.z + radius;
                }
            });
            if (!any) break;
        }
        p = layout::clampToRegion(p, layout::kBarrierInset + radius);
        p.y = groundHeight(p.x, p.z, p.y);
    }
    if (steps == 0) p.y = groundHeight(p.x, p.z, p.y);
    return p;
}

float CollisionWorld::raycast(vec3 ro, vec3 rd, float maxDist, int* hitId) const {
    vec3 end = ro + rd * maxDist;
    float best = -1.0f;
    query(std::min(ro.x, end.x), std::min(ro.z, end.z), std::max(ro.x, end.x), std::max(ro.z, end.z),
          [&](int id, const Entry& e) {
              float t = rayAABB(ro, rd, e.box);
              if (t >= 0.0f && t <= maxDist && (best < 0.0f || t < best)) {
                  best = t;
                  if (hitId) *hitId = id;
              }
          });
    return best;
}

}  // namespace ps
