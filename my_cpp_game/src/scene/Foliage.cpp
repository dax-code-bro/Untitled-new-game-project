#include "scene/Foliage.hpp"

#include <glm/gtc/constants.hpp>
#include <algorithm>
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

namespace game::scene {

namespace {
// Tileable value noise over a period of `per` lattice cells.
float tnoise(float x, float y, int per, uint32_t seed) {
    auto h = [&](int ix, int iy) {
        ix = ((ix % per) + per) % per;
        iy = ((iy % per) + per) % per;
        uint32_t k = static_cast<uint32_t>(ix) * 374761393u + static_cast<uint32_t>(iy) * 668265263u + seed * 2246822519u;
        k = (k ^ (k >> 13)) * 1274126177u;
        return static_cast<float>((k ^ (k >> 16)) & 0xffffffu) / 16777216.0f;
    };
    const int ix = static_cast<int>(std::floor(x)), iy = static_cast<int>(std::floor(y));
    float fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const float a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
uint8_t u8(float v) { return static_cast<uint8_t>(std::clamp(v, 0.0f, 1.0f) * 255.0f + 0.5f); }
float lin2srgb(float c) { return c <= 0.0031308f ? c * 12.92f : 1.055f * std::pow(c, 1.0f / 2.4f) - 0.055f; }
} // namespace

PaintedMaps leafSprayMaps(int size, uint32_t seed) {
    PaintedMaps m;
    m.size = size;
    const size_t n = static_cast<size_t>(size) * size;
    m.albedo.assign(n * 4, 0);
    m.normal.assign(n * 4, 0);
    m.orm.assign(n * 4, 0);
    // Background: the leaves' own green, transparent, so the mips do not
    // bleed a dark fringe into the cut-out.
    const glm::vec3 bg(0.075f, 0.14f, 0.035f);
    for (size_t i = 0; i < n; ++i) {
        m.albedo[i * 4 + 0] = u8(lin2srgb(bg.r));
        m.albedo[i * 4 + 1] = u8(lin2srgb(bg.g));
        m.albedo[i * 4 + 2] = u8(lin2srgb(bg.b));
        m.normal[i * 4 + 0] = 128; m.normal[i * 4 + 1] = 128; m.normal[i * 4 + 2] = 255; m.normal[i * 4 + 3] = 255;
        m.orm[i * 4 + 0] = 255; m.orm[i * 4 + 1] = 204; m.orm[i * 4 + 2] = 0; m.orm[i * 4 + 3] = 128;
    }
    auto put = [&](int x, int y, glm::vec3 col, glm::vec3 nrm, float ao) {
        if (x < 0 || y < 0 || x >= size || y >= size) return;
        const size_t i = (static_cast<size_t>(y) * size + x) * 4;
        m.albedo[i] = u8(lin2srgb(col.r)); m.albedo[i + 1] = u8(lin2srgb(col.g)); m.albedo[i + 2] = u8(lin2srgb(col.b));
        m.albedo[i + 3] = 255;
        nrm = glm::normalize(nrm);
        m.normal[i] = u8(nrm.x * 0.5f + 0.5f); m.normal[i + 1] = u8(nrm.y * 0.5f + 0.5f); m.normal[i + 2] = u8(nrm.z * 0.5f + 0.5f);
        m.orm[i] = u8(ao);
    };
    Rng r(seed);
    // The twig, corner to corner, with a gentle curve.
    const glm::vec2 t0(0.06f, 0.94f), t1(0.93f, 0.08f);
    auto twig = [&](float t) {
        glm::vec2 p = t0 + (t1 - t0) * t;
        p += glm::vec2(0.06f, 0.06f) * std::sin(t * 3.14159f);
        return p * static_cast<float>(size);
    };
    for (int k = 0; k <= 400; ++k) {
        const float t = k / 400.0f;
        const glm::vec2 p = twig(t);
        const float w = size * (0.009f - 0.005f * t);
        for (int dy = -8; dy <= 8; ++dy)
            for (int dx = -8; dx <= 8; ++dx)
                if (dx * dx + dy * dy <= w * w)
                    put(static_cast<int>(p.x) + dx, static_cast<int>(p.y) + dy, glm::vec3(0.09f, 0.06f, 0.035f),
                        glm::vec3(dx / (w + 1.0f), dy / (w + 1.0f), 1.0f), 0.7f);
    }
    // Leaves along it, alternating sides, overlapping.
    const int leaves = 30;
    for (int l = 0; l < leaves; ++l) {
        const float t = 0.04f + 0.92f * (l + r.next() * 0.6f) / leaves;
        const glm::vec2 base = twig(t);
        const glm::vec2 dir = glm::normalize(twig(std::min(1.0f, t + 0.01f)) - twig(std::max(0.0f, t - 0.01f)));
        const float side = (l % 2 == 0) ? 1.0f : -1.0f;
        const float ang = side * r.range(0.6f, 1.2f);
        const glm::vec2 ax(dir.x * std::cos(ang) - dir.y * std::sin(ang), dir.x * std::sin(ang) + dir.y * std::cos(ang));
        const glm::vec2 ac(-ax.y, ax.x);
        const float len = size * r.range(0.13f, 0.2f) * (1.0f - 0.35f * t);
        const float wid = len * r.range(0.38f, 0.48f);
        const float tilt = r.range(-0.5f, 0.5f);
        const float shade = r.range(0.75f, 1.2f);
        const glm::vec3 col = glm::mix(glm::vec3(0.06f, 0.115f, 0.03f), glm::vec3(0.13f, 0.19f, 0.045f), r.next()) * shade;
        const glm::vec2 start = base + ax * (size * 0.012f);
        const int reach = static_cast<int>(len + wid) + 2;
        for (int dy = -reach; dy <= reach; ++dy)
            for (int dx = -reach; dx <= reach; ++dx) {
                const glm::vec2 d(static_cast<float>(dx), static_cast<float>(dy));
                const glm::vec2 q = d - (start - glm::floor(start));
                const float u = glm::dot(q, ax) / len, v = glm::dot(q, ac);
                if (u < 0.0f || u > 1.0f) continue;
                const float half = 0.5f * wid * std::pow(std::sin(3.14159f * std::pow(u, 0.8f)), 0.75f);
                if (std::abs(v) > half) continue;
                const float across = v / std::max(half, 1e-3f);
                glm::vec3 c = col;
                if (std::abs(v) < 0.08f * wid + 0.6f) c *= 1.45f;                 // midrib
                c *= 1.0f - 0.25f * across * across;                               // darker toward the rim
                c *= 0.85f + 0.3f * u;                                             // lighter toward the tip
                // Dome across the blade plus the leaf's own tilt, in texture space.
                const glm::vec2 nxy = ac * (across * 0.45f + tilt) + ax * (0.15f * (u - 0.5f));
                put(static_cast<int>(start.x) + dx, static_cast<int>(start.y) + dy, c, glm::vec3(nxy, 1.0f),
                    0.8f + 0.2f * u);
            }
    }
    return m;
}

PaintedMaps barkMaps(int size, uint32_t seed) {
    PaintedMaps m;
    m.size = size;
    const size_t n = static_cast<size_t>(size) * size;
    m.albedo.resize(n * 4);
    m.normal.resize(n * 4);
    m.orm.resize(n * 4);
    std::vector<float> h(n);
    for (int y = 0; y < size; ++y)
        for (int x = 0; x < size; ++x) {
            const float fx = static_cast<float>(x) / size, fy = static_cast<float>(y) / size;
            // Plates stretched along the trunk, split by fissures.
            float v = tnoise(fx * 10.0f, fy * 2.0f, 10, seed) * 0.6f + tnoise(fx * 24.0f, fy * 5.0f, 24, seed + 1) * 0.3f +
                      tnoise(fx * 64.0f, fy * 32.0f, 64, seed + 2) * 0.1f;
            const float plate = std::clamp((v - 0.36f) / 0.14f, 0.0f, 1.0f);
            h[static_cast<size_t>(y) * size + x] = plate * 0.8f + v * 0.2f;
        }
    for (int y = 0; y < size; ++y)
        for (int x = 0; x < size; ++x) {
            const size_t i = static_cast<size_t>(y) * size + x;
            auto H = [&](int xx, int yy) { return h[static_cast<size_t>((yy + size) % size) * size + (xx + size) % size]; };
            const float gx = H(x + 1, y) - H(x - 1, y), gy = H(x, y + 1) - H(x, y - 1);
            const glm::vec3 nr = glm::normalize(glm::vec3(-gx * 6.0f, -gy * 6.0f, 1.0f));
            const float lichen = tnoise(static_cast<float>(x) / size * 6.0f, static_cast<float>(y) / size * 6.0f, 6, seed + 9);
            glm::vec3 c = glm::mix(glm::vec3(0.035f, 0.025f, 0.018f), glm::vec3(0.16f, 0.12f, 0.085f), h[i]);
            c = glm::mix(c, glm::vec3(0.20f, 0.21f, 0.16f), std::clamp((lichen - 0.62f) * 3.0f, 0.0f, 0.6f) * h[i]);
            m.albedo[i * 4] = u8(lin2srgb(c.r)); m.albedo[i * 4 + 1] = u8(lin2srgb(c.g)); m.albedo[i * 4 + 2] = u8(lin2srgb(c.b));
            m.albedo[i * 4 + 3] = 255;
            m.normal[i * 4] = u8(nr.x * 0.5f + 0.5f); m.normal[i * 4 + 1] = u8(nr.y * 0.5f + 0.5f);
            m.normal[i * 4 + 2] = u8(nr.z * 0.5f + 0.5f); m.normal[i * 4 + 3] = 255;
            m.orm[i * 4] = u8(0.55f + 0.45f * h[i]); m.orm[i * 4 + 1] = u8(0.75f); m.orm[i * 4 + 2] = 0;
            m.orm[i * 4 + 3] = 128;
        }
    return m;
}

geometry::MeshData foliageCards(uint32_t seed, int cards, float cardSize) {
    geometry::MeshData m;
    Rng r(seed);
    constexpr int kClumps = 26;
    glm::vec3 clumps[kClumps];
    for (auto& cc : clumps) cc = randomDir(r) * r.range(0.2f, 0.34f);
    auto card = [&](glm::vec3 c, float s, glm::vec3 tint) {
        const glm::vec3 radial = glm::normalize(c + glm::vec3(0.0f, 0.03f, 0.0f));
        const glm::vec3 face = glm::normalize(radial + randomDir(r) * 0.9f);
        const glm::vec3 up = glm::normalize(glm::cross(face, randomDir(r)));
        const glm::vec3 across = glm::normalize(glm::cross(up, face));
        const bool flipU = r.next() < 0.5f;
        const glm::vec3 corner[4] = {c - across * (0.5f * s) - up * (0.5f * s), c + across * (0.5f * s) - up * (0.5f * s),
                                     c + across * (0.5f * s) + up * (0.5f * s), c - across * (0.5f * s) + up * (0.5f * s)};
        const glm::vec2 uv[4] = {{0, 0}, {1, 0}, {1, 1}, {0, 1}};
        for (int side = 0; side < 2; ++side) {
            const float sg = side == 0 ? 1.0f : -1.0f;
            const glm::vec3 nrm = glm::normalize(radial * 0.75f + face * (0.25f * sg));
            const uint32_t b = static_cast<uint32_t>(m.positions.size());
            for (int k = 0; k < 4; ++k) {
                m.positions.push_back(corner[k]);
                m.normals.push_back(nrm);
                glm::vec2 t = uv[k];
                if (flipU) t.x = 1.0f - t.x;
                m.uvs.push_back(t);
                m.colors.push_back(tint);
            }
            // Wound to face +face on side 0 and -face on side 1.
            if (side == 0) m.indices.insert(m.indices.end(), {b, b + 1, b + 2, b, b + 2, b + 3});
            else           m.indices.insert(m.indices.end(), {b, b + 2, b + 1, b, b + 3, b + 2});
            (void)sg;
        }
    };
    for (int i = 0; i < cards; ++i) {
        const glm::vec3& cc = clumps[i % kClumps];
        glm::vec3 c = cc + randomDir(r) * (0.14f * std::cbrt(r.next()));
        if (glm::length(c) > 0.43f) c *= 0.43f / glm::length(c);
        const float v = r.next();
        const glm::vec3 tint = v < 0.2f ? glm::vec3(1.15f, 1.12f, 0.8f)
                             : v < 0.45f ? glm::vec3(0.78f, 0.85f, 0.75f)
                                         : glm::vec3(r.range(0.92f, 1.06f), r.range(0.94f, 1.06f), r.range(0.88f, 1.0f));
        card(c, cardSize * r.range(0.8f, 1.2f), tint);
    }
    // A darker core so the crown is not see-through at its heart.
    for (int i = 0; i < cards / 6; ++i) card(randomDir(r) * r.range(0.06f, 0.2f), cardSize * 1.3f, glm::vec3(0.5f, 0.55f, 0.5f));
    geometry::computeTangents(m);
    geometry::computeBounds(m);
    return m;
}

PaintedMaps needleSprayMaps(int size, uint32_t seed) {
    PaintedMaps m;
    m.size = size;
    const size_t n = static_cast<size_t>(size) * size;
    m.albedo.assign(n * 4, 0);
    m.normal.assign(n * 4, 0);
    m.orm.assign(n * 4, 0);
    const glm::vec3 bg(0.03f, 0.07f, 0.04f);
    for (size_t i = 0; i < n; ++i) {
        m.albedo[i * 4] = u8(lin2srgb(bg.r)); m.albedo[i * 4 + 1] = u8(lin2srgb(bg.g)); m.albedo[i * 4 + 2] = u8(lin2srgb(bg.b));
        m.normal[i * 4] = 128; m.normal[i * 4 + 1] = 128; m.normal[i * 4 + 2] = 255; m.normal[i * 4 + 3] = 255;
        m.orm[i * 4] = 255; m.orm[i * 4 + 1] = 210; m.orm[i * 4 + 3] = 128;
    }
    auto put = [&](int x, int y, glm::vec3 c, glm::vec3 nr) {
        if (x < 0 || y < 0 || x >= size || y >= size) return;
        const size_t i = (static_cast<size_t>(y) * size + x) * 4;
        m.albedo[i] = u8(lin2srgb(c.r)); m.albedo[i + 1] = u8(lin2srgb(c.g)); m.albedo[i + 2] = u8(lin2srgb(c.b));
        m.albedo[i + 3] = 255;
        nr = glm::normalize(nr);
        m.normal[i] = u8(nr.x * 0.5f + 0.5f); m.normal[i + 1] = u8(nr.y * 0.5f + 0.5f); m.normal[i + 2] = u8(nr.z * 0.5f + 0.5f);
    };
    Rng r(seed);
    // A main twig down the middle with side twigs, every twig combed with
    // needles: thin strokes angled forward along it.
    auto line = [&](glm::vec2 a, glm::vec2 b, float w, glm::vec3 c, glm::vec2 side) {
        const float len = glm::length(b - a);
        const int steps = static_cast<int>(len * 1.5f) + 1;
        for (int k = 0; k <= steps; ++k) {
            const glm::vec2 p = a + (b - a) * (static_cast<float>(k) / steps);
            for (int dy = -2; dy <= 2; ++dy)
                for (int dx = -2; dx <= 2; ++dx)
                    if (static_cast<float>(dx * dx + dy * dy) <= w * w)
                        put(static_cast<int>(p.x) + dx, static_cast<int>(p.y) + dy, c, glm::vec3(side * 0.4f, 1.0f));
        }
    };
    const float S = static_cast<float>(size);
    std::vector<std::pair<glm::vec2, glm::vec2>> twigs{{{0.5f * S, 0.97f * S}, {0.5f * S, 0.05f * S}}};
    for (int k = 0; k < 6; ++k) {
        const float y = S * (0.85f - k * 0.13f);
        const float side = (k % 2 == 0) ? 1.0f : -1.0f;
        twigs.push_back({{0.5f * S, y}, {0.5f * S + side * S * r.range(0.25f, 0.4f), y - S * r.range(0.12f, 0.2f)}});
    }
    for (const auto& [a, b] : twigs) {
        line(a, b, 1.6f, glm::vec3(0.06f, 0.04f, 0.025f), glm::vec2(0.0f));
        const glm::vec2 d = glm::normalize(b - a), c(-d.y, d.x);
        const int needles = static_cast<int>(glm::length(b - a) / 2.2f);
        for (int k = 0; k < needles; ++k) {
            const glm::vec2 p = a + (b - a) * (static_cast<float>(k) / needles);
            for (float sg : {-1.0f, 1.0f}) {
                const glm::vec2 dir = glm::normalize(d * 0.8f + c * sg * r.range(0.6f, 1.1f));
                const float nl = S * r.range(0.045f, 0.07f);
                const glm::vec3 col = glm::mix(glm::vec3(0.025f, 0.075f, 0.035f), glm::vec3(0.06f, 0.13f, 0.05f), r.next());
                line(p, p + dir * nl, 0.8f, col, c * sg);
            }
        }
    }
    return m;
}

geometry::MeshData coniferCards(uint32_t seed, int cards, float cardSize) {
    geometry::MeshData m;
    Rng r(seed);
    auto card = [&](glm::vec3 c, glm::vec3 out, float s, glm::vec3 tint) {
        // Hanging outward and down: the card's long axis follows the branch.
        const glm::vec3 down(0.0f, -1.0f, 0.0f);
        const glm::vec3 along = glm::normalize(out * 0.8f + down * r.range(0.25f, 0.6f));
        glm::vec3 face = glm::normalize(glm::cross(along, glm::cross(glm::vec3(0, 1, 0), along)) + randomDir(r) * 0.3f);
        if (face.y < 0.0f) face = -face;
        const glm::vec3 across = glm::normalize(glm::cross(face, along));
        const glm::vec3 corner[4] = {c - across * (0.5f * s), c + across * (0.5f * s),
                                     c + across * (0.5f * s) + along * s, c - across * (0.5f * s) + along * s};
        const glm::vec2 uv[4] = {{0, 1}, {1, 1}, {1, 0}, {0, 0}};
        for (int side = 0; side < 2; ++side) {
            const glm::vec3 nrm = glm::normalize(out * 0.6f + glm::vec3(0, 0.3f, 0) + face * (side == 0 ? 0.25f : -0.25f));
            const uint32_t b = static_cast<uint32_t>(m.positions.size());
            for (int k = 0; k < 4; ++k) {
                m.positions.push_back(corner[k]);
                m.normals.push_back(nrm);
                m.uvs.push_back(uv[k]);
                m.colors.push_back(tint);
            }
            if (side == 0) m.indices.insert(m.indices.end(), {b, b + 1, b + 2, b, b + 2, b + 3});
            else           m.indices.insert(m.indices.end(), {b, b + 2, b + 1, b, b + 3, b + 2});
        }
    };
    for (int i = 0; i < cards; ++i) {
        const float t = std::pow(r.next(), 0.8f);                 // more at the base, where the tier is widest
        const float y = -0.5f + t * 0.95f;
        const float rad = 0.5f * (1.0f - (y + 0.5f)) * r.range(0.55f, 0.95f);
        const float a = r.range(0.0f, glm::two_pi<float>());
        const glm::vec3 out(std::cos(a), 0.0f, std::sin(a));
        const float v = r.next();
        const glm::vec3 tint = v < 0.25f ? glm::vec3(1.1f, 1.12f, 0.95f) : glm::vec3(r.range(0.85f, 1.0f), r.range(0.9f, 1.02f), r.range(0.9f, 1.0f));
        card(out * rad + glm::vec3(0.0f, y + 0.06f, 0.0f), out, cardSize * r.range(0.8f, 1.2f) * (1.0f - 0.4f * t), tint);
    }
    for (int i = 0; i < cards / 5; ++i) {
        const float y = r.range(-0.45f, 0.3f);
        const float a = r.range(0.0f, glm::two_pi<float>());
        const glm::vec3 out(std::cos(a), 0.0f, std::sin(a));
        card(out * (0.2f * (0.5f - y)) + glm::vec3(0, y, 0), out, cardSize * 1.2f, glm::vec3(0.45f, 0.5f, 0.45f));
    }
    geometry::computeTangents(m);
    geometry::computeBounds(m);
    return m;
}

geometry::MeshData treeTrunk(uint32_t seed, bool flare) {
    geometry::MeshData m;
    Rng r(seed);
    constexpr int kSides = 14, kRings = 12;
    const float bx = r.range(-1.0f, 1.0f), bz = r.range(-1.0f, 1.0f), ph = r.range(0.0f, 6.28f);
    for (int j = 0; j <= kRings; ++j) {
        const float t = static_cast<float>(j) / kRings;
        const float y = t - 0.5f;
        float rad = 0.5f * (1.0f - 0.32f * t);
        if (flare) rad *= 1.0f + 0.45f * std::exp(-t * 16.0f);
        const glm::vec2 bend(bx * 0.07f * std::sin(t * 2.4f + ph), bz * 0.07f * std::sin(t * 2.0f + ph * 0.7f));
        for (int i = 0; i <= kSides; ++i) {
            const float a = static_cast<float>(i) / kSides * glm::two_pi<float>();
            const float bump = 1.0f + 0.05f * tnoise(static_cast<float>(i) / kSides * 7.0f, t * 9.0f, 7, seed) +
                               (flare ? 0.12f * std::exp(-t * 12.0f) * std::max(0.0f, std::sin(a * 3.0f + ph)) : 0.0f);
            const glm::vec3 n(std::cos(a), 0.0f, std::sin(a));
            m.positions.push_back(glm::vec3(bend.x, y, bend.y) + n * (rad * bump));
            m.normals.push_back(glm::normalize(n + glm::vec3(0.0f, 0.1f, 0.0f)));
            m.uvs.emplace_back(static_cast<float>(i) / kSides * 2.0f, t * 3.5f);
        }
    }
    for (int j = 0; j < kRings; ++j)
        for (int i = 0; i < kSides; ++i) {
            const uint32_t a = static_cast<uint32_t>(j * (kSides + 1) + i), b = a + kSides + 1;
            m.indices.insert(m.indices.end(), {a, b, a + 1, a + 1, b, b + 1});
        }
    for (size_t t = 0; t + 2 < m.indices.size(); t += 3) {
        const auto a = m.indices[t], b = m.indices[t + 1], c = m.indices[t + 2];
        const glm::vec3 f = glm::cross(m.positions[b] - m.positions[a], m.positions[c] - m.positions[a]);
        if (glm::dot(f, m.normals[a] + m.normals[b] + m.normals[c]) < 0.0f) std::swap(m.indices[t + 1], m.indices[t + 2]);
    }
    geometry::computeTangents(m);
    geometry::computeBounds(m);
    return m;
}

} // namespace game::scene
