#include "game/Collision.hpp"
#include "game/Lesc.hpp"

#include <algorithm>
#include <cmath>
#include <limits>

namespace game::play {

CollisionWorld::CollisionWorld(const Lesc& scene) {
    const auto& gp = scene.doc.at("gameplay");
    if (gp.is_null()) throw std::runtime_error("collision: this scene has no gameplay section (export it again)");
    const auto planes = scene.array<float>(gp.at("planes"));
    const auto hulls = scene.array<float>(gp.at("hulls"));
    const auto spheres = scene.array<float>(gp.at("spheres"));
    const auto ground = scene.array<float>(gp.at("ground"));
    for (size_t i = 0; i + 3 < planes.size(); i += 4) m_planes.emplace_back(planes[i], planes[i + 1], planes[i + 2], planes[i + 3]);
    for (size_t i = 0; i + 3 < spheres.size(); i += 4) m_spheres.emplace_back(spheres[i], spheres[i + 1], spheres[i + 2], spheres[i + 3]);
    for (size_t i = 0; i + 3 < ground.size(); i += 4) m_ground.emplace_back(ground[i], ground[i + 1], ground[i + 2], ground[i + 3]);
    m_lo = glm::vec3(1e30f);
    m_hi = glm::vec3(-1e30f);
    for (size_t i = 0; i + 7 < hulls.size(); i += 8) {
        Hull h;
        h.first = static_cast<uint32_t>(hulls[i]);
        h.count = static_cast<uint32_t>(hulls[i + 1]);
        h.lo = {hulls[i + 2], hulls[i + 3], hulls[i + 4]};
        h.hi = {hulls[i + 5], hulls[i + 6], hulls[i + 7]};
        if (h.first + h.count > m_planes.size()) continue;
        m_hulls.push_back(h);
        m_lo = glm::min(m_lo, h.lo);
        m_hi = glm::max(m_hi, h.hi);
    }
    if (m_hulls.empty()) { m_lo = glm::vec3(-50.0f); m_hi = glm::vec3(50.0f); }
    // The grid over x/z. Anything spanning more than 64 cells goes on the always-tested list.
    m_g0 = {m_lo.x, m_lo.z};
    m_gw = std::max(1, static_cast<int>(std::ceil((m_hi.x - m_lo.x) / m_cell)) + 1);
    m_gh = std::max(1, static_cast<int>(std::ceil((m_hi.z - m_lo.z) / m_cell)) + 1);
    m_cells.assign(static_cast<size_t>(m_gw) * m_gh, {});
    for (uint32_t k = 0; k < m_hulls.size(); ++k) {
        const Hull& h = m_hulls[k];
        const int i0 = std::clamp(static_cast<int>((h.lo.x - m_g0.x) / m_cell), 0, m_gw - 1);
        const int i1 = std::clamp(static_cast<int>((h.hi.x - m_g0.x) / m_cell), 0, m_gw - 1);
        const int j0 = std::clamp(static_cast<int>((h.lo.z - m_g0.y) / m_cell), 0, m_gh - 1);
        const int j1 = std::clamp(static_cast<int>((h.hi.z - m_g0.y) / m_cell), 0, m_gh - 1);
        if ((i1 - i0 + 1) * (j1 - j0 + 1) > 64) { m_big.push_back(k); continue; }
        for (int j = j0; j <= j1; ++j)
            for (int i = i0; i <= i1; ++i) m_cells[static_cast<size_t>(j) * m_gw + i].push_back(k);
    }
    m_stamp.assign(m_hulls.size(), 0);
}

template <class F>
void CollisionWorld::forCells(const glm::vec3& lo, const glm::vec3& hi, F&& f) const {
    if (++m_gen == 0) { std::fill(m_stamp.begin(), m_stamp.end(), 0u); m_gen = 1; }
    for (uint32_t k : m_big) { m_stamp[k] = m_gen; f(k); }
    const int i0 = std::clamp(static_cast<int>(std::floor((lo.x - m_g0.x) / m_cell)), 0, m_gw - 1);
    const int i1 = std::clamp(static_cast<int>(std::floor((hi.x - m_g0.x) / m_cell)), 0, m_gw - 1);
    const int j0 = std::clamp(static_cast<int>(std::floor((lo.z - m_g0.y) / m_cell)), 0, m_gh - 1);
    const int j1 = std::clamp(static_cast<int>(std::floor((hi.z - m_g0.y) / m_cell)), 0, m_gh - 1);
    for (int j = j0; j <= j1; ++j)
        for (int i = i0; i <= i1; ++i)
            for (uint32_t k : m_cells[static_cast<size_t>(j) * m_gw + i]) {
                if (m_stamp[k] == m_gen) continue;
                m_stamp[k] = m_gen;
                f(k);
            }
}

bool CollisionWorld::rayHull(const Hull& h, const glm::vec3& o, const glm::vec3& d, float maxT, float& t,
                             glm::vec3& n) const {
    float tin = -std::numeric_limits<float>::infinity(), tout = maxT;
    glm::vec3 nin(0.0f);
    for (uint32_t i = 0; i < h.count; ++i) {
        const glm::vec4& p = m_planes[h.first + i];
        const glm::vec3 pn(p);
        const float denom = glm::dot(pn, d);
        const float dist = p.w - glm::dot(pn, o);   // >= 0 inside this half-space
        if (std::fabs(denom) < 1e-9f) {
            if (dist < 0.0f) return false;
            continue;
        }
        const float s = dist / denom;
        if (denom < 0.0f) { if (s > tin) { tin = s; nin = pn; } }
        else if (s < tout) tout = s;
        if (tin > tout) return false;
    }
    if (tin < 0.0f) return false;   // starting inside: the ray belongs to whatever it is leaving
    t = tin;
    n = nin;
    return true;
}

bool CollisionWorld::raycast(const glm::vec3& o, const glm::vec3& dirIn, float maxT, Hit& out) const {
    const float len = glm::length(dirIn);
    if (len < 1e-8f) return false;
    const glm::vec3 d = dirIn / len;
    float best = maxT;
    bool hit = false;
    glm::vec3 bestN(0.0f, 1.0f, 0.0f);
    int bestHull = -1;
    auto test = [&](uint32_t k) {
        const Hull& h = m_hulls[k];
        float t;
        glm::vec3 n;
        if (rayHull(h, o, d, best, t, n) && t < best) { best = t; bestN = n; bestHull = static_cast<int>(k); hit = true; }
    };
    for (const auto& g : m_ground) {
        const glm::vec3 n(g);
        const float denom = glm::dot(n, d);
        if (denom >= -1e-9f) continue;
        const float t = (g.w - glm::dot(n, o)) / denom;
        if (t >= 0.0f && t < best) { best = t; bestN = n; bestHull = -1; hit = true; }
    }
    for (const auto& s : m_spheres) {
        const glm::vec3 c(s);
        const glm::vec3 oc = o - c;
        const float b = glm::dot(oc, d), cc = glm::dot(oc, oc) - s.w * s.w;
        const float disc = b * b - cc;
        if (cc <= 0.0f || disc < 0.0f) continue;
        const float t = -b - std::sqrt(disc);
        if (t >= 0.0f && t < best) { best = t; bestN = glm::normalize(o + d * t - c); bestHull = -1; hit = true; }
    }
    // The big hulls, then a DDA through the grid cells.
    if (++m_gen == 0) { std::fill(m_stamp.begin(), m_stamp.end(), 0u); m_gen = 1; }
    for (uint32_t k : m_big) { m_stamp[k] = m_gen; test(k); }
    float cx = (o.x - m_g0.x) / m_cell, cz = (o.z - m_g0.y) / m_cell;
    int i = static_cast<int>(std::floor(cx)), j = static_cast<int>(std::floor(cz));
    const int si = d.x > 0 ? 1 : -1, sj = d.z > 0 ? 1 : -1;
    const float dtx = std::fabs(d.x) > 1e-9f ? m_cell / std::fabs(d.x) : 1e30f;
    const float dtz = std::fabs(d.z) > 1e-9f ? m_cell / std::fabs(d.z) : 1e30f;
    float tx = std::fabs(d.x) > 1e-9f ? ((d.x > 0 ? (i + 1 - cx) : (cx - i)) * m_cell) / std::fabs(d.x) : 1e30f;
    float tz = std::fabs(d.z) > 1e-9f ? ((d.z > 0 ? (j + 1 - cz) : (cz - j)) * m_cell) / std::fabs(d.z) : 1e30f;
    float tCell = 0.0f;
    for (int guard = 0; guard < 4096; ++guard) {
        if (i >= 0 && j >= 0 && i < m_gw && j < m_gh)
            for (uint32_t k : m_cells[static_cast<size_t>(j) * m_gw + i]) {
                if (m_stamp[k] == m_gen) continue;
                m_stamp[k] = m_gen;
                test(k);
            }
        const float tNext = std::min(tx, tz);
        if (tNext >= best || tCell > maxT) break;
        // Out of the grid and heading away: nothing more to find.
        if ((i < 0 && si < 0) || (j < 0 && sj < 0) || (i >= m_gw && si > 0) || (j >= m_gh && sj > 0)) break;
        tCell = tNext;
        if (tx < tz) { i += si; tx += dtx; } else { j += sj; tz += dtz; }
    }
    if (!hit) return false;
    out.t = best;
    out.point = o + d * best;
    out.normal = bestN;
    out.hull = bestHull;
    return true;
}

/* Sphere against a convex hull: the deepest separating plane. Inside, that
   is exact; outside near an edge it reads the hull as slightly larger than
   it is (a box with square-cornered radius), which a body sliding along a
   wall never notices. */
bool CollisionWorld::resolveSphere(glm::vec3& c, float r, glm::vec3* floorNormal) const {
    bool touched = false;
    glm::vec3 best(0.0f, -1.0f, 0.0f);
    for (int pass = 0; pass < 3; ++pass) {
        bool any = false;
        forCells(c - glm::vec3(r), c + glm::vec3(r), [&](uint32_t k) {
            const Hull& h = m_hulls[k];
            if (c.x + r < h.lo.x || c.x - r > h.hi.x || c.y + r < h.lo.y || c.y - r > h.hi.y ||
                c.z + r < h.lo.z || c.z - r > h.hi.z) return;
            float maxD = -1e30f;
            glm::vec3 n(0.0f);
            for (uint32_t i = 0; i < h.count; ++i) {
                const glm::vec4& p = m_planes[h.first + i];
                const float dd = glm::dot(glm::vec3(p), c) - p.w;
                if (dd > maxD) { maxD = dd; n = glm::vec3(p); }
                if (maxD >= r) return;
            }
            if (maxD < r) {
                c += n * (r - maxD);
                any = touched = true;
                if (n.y > best.y) best = n;
            }
        });
        for (const auto& g : m_ground) {
            const glm::vec3 n(g);
            const float dd = glm::dot(n, c) - g.w;
            if (dd < r) { c += n * (r - dd); any = touched = true; if (n.y > best.y) best = n; }
        }
        for (const auto& s : m_spheres) {
            const glm::vec3 v = c - glm::vec3(s);
            const float L = glm::length(v);
            if (L < r + s.w && L > 1e-6f) {
                const glm::vec3 n = v / L;
                c += n * (r + s.w - L);
                any = touched = true;
                if (n.y > best.y) best = n;
            }
        }
        if (!any) break;
    }
    if (floorNormal) *floorNormal = best;
    return touched;
}

bool CollisionWorld::overlapsSphere(const glm::vec3& c, float r) const {
    bool hit = false;
    forCells(c - glm::vec3(r), c + glm::vec3(r), [&](uint32_t k) {
        if (hit) return;
        const Hull& h = m_hulls[k];
        if (c.x + r < h.lo.x || c.x - r > h.hi.x || c.y + r < h.lo.y || c.y - r > h.hi.y ||
            c.z + r < h.lo.z || c.z - r > h.hi.z) return;
        for (uint32_t i = 0; i < h.count; ++i) {
            const glm::vec4& p = m_planes[h.first + i];
            if (glm::dot(glm::vec3(p), c) - p.w >= r) return;
        }
        hit = true;
    });
    if (hit) return true;
    for (const auto& g : m_ground)
        if (glm::dot(glm::vec3(g), c) - g.w < r) return true;
    for (const auto& s : m_spheres)
        if (glm::length(c - glm::vec3(s)) < r + s.w) return true;
    return false;
}

} // namespace game::play
