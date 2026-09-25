#include "scene/Foliage.hpp"

#include <glm/gtc/constants.hpp>
#include <cmath>

namespace game::scene {

namespace {
struct Rng {
    uint32_t s;
    explicit Rng(uint32_t seed) : s(seed * 2654435761u + 1u) {}
    float next() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return static_cast<float>(s & 0xffffffu) / 16777216.0f; }
    float range(float a, float b) { return a + (b - a) * next(); }
};
glm::vec3 randomDir(Rng& r) {
    const float z = r.range(-1.0f, 1.0f), a = r.range(0.0f, glm::two_pi<float>());
    const float s = std::sqrt(1.0f - z * z);
    return {s * std::cos(a), z, s * std::sin(a)};
}
} // namespace

geometry::MeshData foliageCluster(uint32_t seed, int leaves, float leafScale) {
    geometry::MeshData m;
    Rng r(seed);
    // The leaf outline in its own plane: x across, y along, base at 0.
    const glm::vec2 outline[6] = {{0.0f, 0.0f}, {0.30f, 0.22f}, {0.42f, 0.55f},
                                  {0.0f, 1.0f}, {-0.42f, 0.55f}, {-0.30f, 0.22f}};
    /* Leaves grow in clumps round the ends of twigs, and the gaps between
       clumps are what make a crown read as a tree rather than as a ball of
       confetti. Eighteen clump centres in the outer part of the crown,
       leaves scattered round each and held inside the sphere. */
    constexpr int kClumps = 24;
    glm::vec3 clumps[kClumps];
    for (auto& cc : clumps) cc = randomDir(r) * r.range(0.22f, 0.36f);
    for (int i = 0; i < leaves; ++i) {
        const glm::vec3& cc = clumps[i % kClumps];
        glm::vec3 c = cc + randomDir(r) * (0.15f * std::cbrt(r.next()));
        if (glm::length(c) > 0.48f) c *= 0.48f / glm::length(c);
        const glm::vec3 radial = glm::normalize(c + glm::vec3(0.0f, 0.02f, 0.0f));
        // Face mostly outward, tilted and twisted at random.
        const glm::vec3 face = glm::normalize(radial + randomDir(r) * 0.75f);
        glm::vec3 up = glm::normalize(glm::cross(face, randomDir(r)));
        const glm::vec3 across = glm::normalize(glm::cross(up, face));
        const float len = r.range(0.058f, 0.088f) * leafScale;
        const float wid = len * r.range(0.8f, 1.15f);
        // Per-leaf tint: most near white (the material colour), some sunlit
        // yellow-green, some deep shade green.
        const float v = r.next();
        glm::vec3 tint = v < 0.18f ? glm::vec3(1.18f, 1.15f, 0.78f)
                       : v < 0.40f ? glm::vec3(0.72f, 0.80f, 0.70f)
                                   : glm::vec3(r.range(0.9f, 1.05f), r.range(0.92f, 1.06f), r.range(0.85f, 1.0f));
        const glm::vec2 uvBase(r.next(), r.next());
        for (int side = 0; side < 1; ++side) {   // one face: normals point out, so a second would face out too
            const float sgn = side == 0 ? 1.0f : -1.0f;
            const glm::vec3 n = glm::normalize(radial * 0.8f + face * 0.2f * sgn);
            const uint32_t base = static_cast<uint32_t>(m.positions.size());
            for (const auto& o : outline) {
                m.positions.push_back(c + across * (o.x * wid) + up * ((o.y - 0.35f) * len));
                m.normals.push_back(n);
                m.uvs.push_back(uvBase + glm::vec2(o.x, o.y) * 0.12f);
                m.colors.push_back(tint);
            }
            // Fan from the base; the back face winds the other way round.
            for (uint32_t k = 1; k + 1 < 6; ++k) {
                if (side == 0) { m.indices.insert(m.indices.end(), {base, base + k, base + k + 1}); }
                else           { m.indices.insert(m.indices.end(), {base, base + k + 1, base + k}); }
            }
        }
    }
    // Wind every face so it faces the side its normal points to (the
    // renderer culls back faces), then derive tangents and bounds.
    for (size_t t = 0; t + 2 < m.indices.size(); t += 3) {
        const auto a = m.indices[t], b = m.indices[t + 1], c2 = m.indices[t + 2];
        const glm::vec3 f = glm::cross(m.positions[b] - m.positions[a], m.positions[c2] - m.positions[a]);
        if (glm::dot(f, m.normals[a]) < 0.0f) std::swap(m.indices[t + 1], m.indices[t + 2]);
    }
    geometry::computeTangents(m);
    geometry::computeBounds(m);
    return m;
}

} // namespace game::scene
