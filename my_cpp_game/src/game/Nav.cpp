#include "game/Nav.hpp"

#include <algorithm>
#include <cmath>
#include <functional>
#include <limits>
#include <queue>
#include <utility>

namespace game::play {

namespace {
constexpr float kStep = 0.45f;       // the highest ledge a zombie steps up without climbing
constexpr float kHeadroom = 1.55f;   // clear height above a floor for it to count
constexpr float kRadius = 0.28f;     // a body's half-width
constexpr int kMaxLayers = 6;
}

NavGrid::NavGrid(const CollisionWorld& world, glm::vec3 lo, glm::vec3 hi, float cell)
    : m_origin(lo.x, lo.z), m_cell(cell), m_world(&world) {
    m_w = std::max(1, static_cast<int>(std::ceil((hi.x - lo.x) / cell)));
    m_h = std::max(1, static_cast<int>(std::ceil((hi.z - lo.z) / cell)));
    m_columnFirst.assign(static_cast<size_t>(m_w) * m_h, -1);
    m_columnCount.assign(static_cast<size_t>(m_w) * m_h, 0);
    const float top = hi.y + 2.0f;
    // ---- floors: march down each column ----
    for (int j = 0; j < m_h; ++j) {
        for (int i = 0; i < m_w; ++i) {
            const size_t col = static_cast<size_t>(j) * m_w + i;
            const float x = lo.x + (i + 0.5f) * cell, z = lo.z + (j + 0.5f) * cell;
            float y = top;
            int layers = 0;
            std::vector<glm::vec3> found;
            for (int guard = 0; guard < 24 && layers < kMaxLayers; ++guard) {
                CollisionWorld::Hit h;
                if (!world.raycast({x, y, z}, {0.0f, -1.0f, 0.0f}, y - (lo.y - 1.0f), h)) break;
                const float fy = h.point.y;
                if (h.normal.y > 0.7f) {
                    // A body's worth of room above it, and not wedged against a wall.
                    const glm::vec3 a(x, fy + kRadius + 0.32f, z), b(x, fy + kHeadroom - kRadius, z);
                    if (!world.overlapsSphere(a, kRadius) && !world.overlapsSphere(b, kRadius) &&
                        !world.overlapsSphere((a + b) * 0.5f, kRadius)) {
                        found.emplace_back(x, fy, z);
                        ++layers;
                    }
                }
                y = fy - 0.06f;   // carry on below the surface just hit
            }
            if (found.empty()) continue;
            m_columnFirst[col] = static_cast<int32_t>(m_nodes.size());
            m_columnCount[col] = static_cast<uint8_t>(found.size());
            for (const auto& p : found) m_nodes.push_back({p, 0, 0});
        }
    }
    // ---- links: 8 neighbours, climbable and clear between ----
    static const int DI[8] = {1, -1, 0, 0, 1, 1, -1, -1};
    static const int DJ[8] = {0, 0, 1, -1, 1, -1, 1, -1};
    for (int j = 0; j < m_h; ++j) {
        for (int i = 0; i < m_w; ++i) {
            const size_t col = static_cast<size_t>(j) * m_w + i;
            for (int a = 0; a < m_columnCount[col]; ++a) {
                Node& n = m_nodes[static_cast<size_t>(m_columnFirst[col] + a)];
                n.firstLink = static_cast<uint32_t>(m_links.size());
                for (int k = 0; k < 8; ++k) {
                    const int ii = i + DI[k], jj = j + DJ[k];
                    if (ii < 0 || jj < 0 || ii >= m_w || jj >= m_h) continue;
                    const size_t c2 = static_cast<size_t>(jj) * m_w + ii;
                    for (int b = 0; b < m_columnCount[c2]; ++b) {
                        const uint32_t idx = static_cast<uint32_t>(m_columnFirst[c2] + b);
                        const glm::vec3& q = m_nodes[idx].pos;
                        if (std::fabs(q.y - n.pos.y) > kStep) continue;
                        // Diagonals need both orthogonal neighbours: no cutting a wall's corner.
                        if (k >= 4) {
                            const size_t ca = static_cast<size_t>(j) * m_w + ii, cb = static_cast<size_t>(jj) * m_w + i;
                            if (!m_columnCount[ca] || !m_columnCount[cb]) continue;
                        }
                        const glm::vec3 mid = (n.pos + q) * 0.5f + glm::vec3(0.0f, kStep + kRadius + 0.05f, 0.0f);
                        if (world.overlapsSphere(mid, kRadius * 0.9f)) continue;
                        m_links.push_back(idx);
                        m_linkCost.push_back(glm::length(q - n.pos));
                        ++n.links;
                        break;
                    }
                }
            }
        }
    }
    m_dist.assign(m_nodes.size(), std::numeric_limits<float>::infinity());
}

int NavGrid::nodeAt(const glm::vec3& p) const {
    const int i = static_cast<int>(std::floor((p.x - m_origin.x) / m_cell));
    const int j = static_cast<int>(std::floor((p.z - m_origin.y) / m_cell));
    int best = -1;
    float bd = 1e30f;
    // The column itself, then a ring round it (a body against a wall stands in a cell with no floor).
    for (int r = 0; r <= 3 && best < 0; ++r) {
        for (int jj = j - r; jj <= j + r; ++jj) {
            for (int ii = i - r; ii <= i + r; ++ii) {
                if (std::max(std::abs(ii - i), std::abs(jj - j)) != r) continue;
                if (ii < 0 || jj < 0 || ii >= m_w || jj >= m_h) continue;
                const size_t col = static_cast<size_t>(jj) * m_w + ii;
                for (int a = 0; a < m_columnCount[col]; ++a) {
                    const int idx = m_columnFirst[col] + a;
                    const glm::vec3& q = m_nodes[static_cast<size_t>(idx)].pos;
                    const float dy = p.y - q.y;
                    if (dy < -0.6f || dy > 2.2f) continue;   // the floor under these feet, not the one above
                    const float d = glm::length(glm::vec2(q.x - p.x, q.z - p.z)) + std::fabs(dy) * 0.5f;
                    if (d < bd) { bd = d; best = idx; }
                }
            }
        }
    }
    return best;
}

float NavGrid::floorBelow(const glm::vec3& p, float fallback) const {
    const int n = nodeAt(p);
    return n >= 0 ? m_nodes[static_cast<size_t>(n)].pos.y : fallback;
}

void NavGrid::flowTo(const glm::vec3& goal) {
    m_goal = goal;
    std::fill(m_dist.begin(), m_dist.end(), std::numeric_limits<float>::infinity());
    const int g = nodeAt(goal);
    if (g < 0) return;
    using Q = std::pair<float, uint32_t>;
    std::priority_queue<Q, std::vector<Q>, std::greater<Q>> pq;
    m_dist[static_cast<size_t>(g)] = 0.0f;
    pq.emplace(0.0f, static_cast<uint32_t>(g));
    while (!pq.empty()) {
        const auto [d, u] = pq.top();
        pq.pop();
        if (d > m_dist[u]) continue;
        const Node& n = m_nodes[u];
        for (uint32_t k = 0; k < n.links; ++k) {
            const uint32_t v = m_links[n.firstLink + k];
            const float nd = d + m_linkCost[n.firstLink + k];
            if (nd < m_dist[v]) { m_dist[v] = nd; pq.emplace(nd, v); }
        }
    }
}

float NavGrid::distanceAt(const glm::vec3& p) const {
    const int n = nodeAt(p);
    return n >= 0 ? m_dist[static_cast<size_t>(n)] : std::numeric_limits<float>::infinity();
}

glm::vec3 NavGrid::steer(const glm::vec3& p) const {
    int n = nodeAt(p);
    if (n < 0 || !std::isfinite(m_dist[static_cast<size_t>(n)])) return m_goal;
    // Two steps down the gradient: a target far enough ahead to walk smoothly at.
    for (int s = 0; s < 3; ++s) {
        const Node& nd = m_nodes[static_cast<size_t>(n)];
        int best = n;
        float bd = m_dist[static_cast<size_t>(n)];
        for (uint32_t k = 0; k < nd.links; ++k) {
            const uint32_t v = m_links[nd.firstLink + k];
            if (m_dist[v] < bd) { bd = m_dist[v]; best = static_cast<int>(v); }
        }
        if (best == n) break;
        n = best;
    }
    if (m_dist[static_cast<size_t>(n)] < 0.01f) return m_goal;
    return m_nodes[static_cast<size_t>(n)].pos;
}

} // namespace game::play
