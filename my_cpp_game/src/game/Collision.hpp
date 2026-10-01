#pragma once
#include <glm/glm.hpp>

#include <cstdint>
#include <vector>

namespace game::play {

struct Lesc;

/* WHAT IS SOLID, as the web game's physics world has it.
 *
 * export_scene.js writes every static body of the web PhysicsWorld: convex
 * hulls as world-space planes (inside where n.p < d), spheres, and infinite
 * planes. That is the exact set of things the web player and zombies
 * collide with -- not the render meshes, which include leaves, glass and
 * decals nobody should stand on -- so the native game walks the same map
 * the web game does.
 *
 * Queries: a ray (hitscan, the ground under a foot, line of sight) and a
 * sphere pushed out of everything it overlaps (the player's and the
 * zombies' bodies). Hulls are bucketed in a 2D grid over x/z; a ray walks
 * the grid cells it crosses (DDA) and stops at the first cell beyond its
 * nearest hit. */
class CollisionWorld {
public:
    struct Hit { float t = 0.0f; glm::vec3 point{0.0f}, normal{0.0f, 1.0f, 0.0f}; int hull = -1; };

    explicit CollisionWorld(const Lesc& scene);
    CollisionWorld() = default;

    [[nodiscard]] bool raycast(const glm::vec3& origin, const glm::vec3& dir, float maxT, Hit& out) const;
    /* Push a sphere out of every solid it overlaps. Returns true if it touched
       anything; `floorNormal` gets the most upward contact normal. */
    bool resolveSphere(glm::vec3& centre, float radius, glm::vec3* floorNormal = nullptr) const;
    [[nodiscard]] bool overlapsSphere(const glm::vec3& centre, float radius) const;

    [[nodiscard]] size_t hullCount() const { return m_hulls.size(); }
    [[nodiscard]] glm::vec3 boundsMin() const { return m_lo; }
    [[nodiscard]] glm::vec3 boundsMax() const { return m_hi; }

private:
    struct Hull { uint32_t first = 0, count = 0; glm::vec3 lo{0.0f}, hi{0.0f}; };
    bool rayHull(const Hull& h, const glm::vec3& o, const glm::vec3& d, float maxT, float& t, glm::vec3& n) const;
    template <class F> void forCells(const glm::vec3& lo, const glm::vec3& hi, F&& f) const;

    std::vector<glm::vec4> m_planes;      // n, d
    std::vector<Hull>      m_hulls;
    std::vector<glm::vec4> m_spheres;     // centre, radius
    std::vector<glm::vec4> m_ground;      // infinite planes
    std::vector<uint32_t>  m_big;         // hulls too large for the grid: always tested
    // The grid.
    float m_cell = 4.0f;
    int m_gw = 0, m_gh = 0;
    glm::vec2 m_g0{0.0f};
    std::vector<std::vector<uint32_t>> m_cells;
    glm::vec3 m_lo{0.0f}, m_hi{0.0f};
    mutable std::vector<uint32_t> m_stamp;
    mutable uint32_t m_gen = 0;
};

} // namespace game::play
