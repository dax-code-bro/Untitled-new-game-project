#pragma once
#include "game/Collision.hpp"

#include <glm/glm.hpp>

#include <cstdint>
#include <vector>

namespace game::play {

/* WHERE A ZOMBIE CAN WALK, AND WHICH WAY IS TOWARDS YOU.
 *
 * A layered grid built from the collision world: every 0.5 m column is
 * probed downwards for walkable floors (an upward-facing surface with a
 * body's worth of clear space above it), so a ground floor and a roof deck
 * over the same spot are two nodes, and stairs are a run of nodes each a
 * step above the last. Neighbours (8-way) connect when the step between
 * them is climbable and the gap between them is clear.
 *
 * Every zombie wants the same thing -- the player -- so instead of an A*
 * per zombie there is ONE flow field: a Dijkstra outward from the player's
 * node, refreshed a few times a second. A zombie then walks to whichever
 * neighbour is closer to you than the node it is on, which is a path for
 * every zombie on the map at the cost of one search. */
class NavGrid {
public:
    NavGrid() = default;
    NavGrid(const CollisionWorld& world, glm::vec3 lo, glm::vec3 hi, float cell = 0.5f);

    /* The node nearest a point (same layer within a step), or -1. */
    [[nodiscard]] int nodeAt(const glm::vec3& p) const;
    [[nodiscard]] glm::vec3 nodePos(int n) const { return m_nodes[static_cast<size_t>(n)].pos; }

    /* Recompute the distance field towards `goal` (a world point). */
    void flowTo(const glm::vec3& goal);
    /* Where to head from `p` to follow the field: a point a node or two along.
       Falls back to the goal itself off the grid. */
    [[nodiscard]] glm::vec3 steer(const glm::vec3& p) const;
    [[nodiscard]] float distanceAt(const glm::vec3& p) const;

    [[nodiscard]] size_t nodeCount() const { return m_nodes.size(); }
    [[nodiscard]] float floorBelow(const glm::vec3& p, float fallback) const;

private:
    struct Node { glm::vec3 pos; uint32_t firstLink = 0; uint8_t links = 0; };
    std::vector<Node>     m_nodes;
    std::vector<uint32_t> m_links;     // neighbour node indices
    std::vector<float>    m_linkCost;
    std::vector<int32_t>  m_columnFirst;   // per column: first node, nodes in a column are consecutive
    std::vector<uint8_t>  m_columnCount;
    std::vector<float>    m_dist;
    glm::vec3 m_goal{0.0f};
    glm::vec2 m_origin{0.0f};
    float m_cell = 0.5f;
    int m_w = 0, m_h = 0;
    const CollisionWorld* m_world = nullptr;
};

} // namespace game::play
