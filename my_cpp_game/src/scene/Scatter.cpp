#include "scene/Scatter.hpp"

#include <glm/gtc/constants.hpp>
#include <glm/gtc/matrix_transform.hpp>

#include <algorithm>
#include <cmath>

namespace game::scene {

namespace {

struct Rng {
    uint32_t s;
    explicit Rng(uint32_t seed) : s(seed * 2654435761u + 0x9e3779b9u) { if (!s) s = 1; }
    float next() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return static_cast<float>(s & 0xffffffu) / 16777216.0f; }
    float range(float a, float b) { return a + (b - a) * next(); }
};

float hash2(int x, int z, uint32_t seed) {
    uint32_t h = static_cast<uint32_t>(x) * 374761393u + static_cast<uint32_t>(z) * 668265263u + seed * 2246822519u;
    h = (h ^ (h >> 13)) * 1274126177u;
    return static_cast<float>((h ^ (h >> 16)) & 0xffffffu) / 16777216.0f;
}
// Smooth value noise in [0,1], two octaves: the clumping of a lawn, the
// patches of weeds on bare dirt.
float noise2(float x, float z, uint32_t seed) {
    auto one = [&](float px, float pz, uint32_t s) {
        const int ix = static_cast<int>(std::floor(px)), iz = static_cast<int>(std::floor(pz));
        float fx = px - ix, fz = pz - iz;
        fx = fx * fx * (3 - 2 * fx);
        fz = fz * fz * (3 - 2 * fz);
        const float a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s);
        const float c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
        return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
    };
    return one(x, z, seed) * 0.65f + one(x * 2.3f + 17.1f, z * 2.3f - 3.7f, seed + 1u) * 0.35f;
}
float smoothstep(float a, float b, float x) {
    const float t = std::clamp((x - a) / (b - a), 0.0f, 1.0f);
    return t * t * (3 - 2 * t);
}

// A uniform 2D grid over the occupying boxes, so each sample tests only
// the handful of boxes near it.
struct Grid {
    float cell = 4.0f;
    glm::vec2 origin{0.0f};
    int nx = 1, nz = 1;
    std::vector<std::vector<uint32_t>> cells;
    std::vector<uint32_t> big;   // map-sized boxes (the sea): tested everywhere
    mutable std::vector<uint32_t> scratch;
    void build(const std::vector<WorldBox>& boxes, glm::vec2 lo, glm::vec2 hi) {
        origin = lo;
        nx = std::max(1, static_cast<int>(std::ceil((hi.x - lo.x) / cell)));
        nz = std::max(1, static_cast<int>(std::ceil((hi.y - lo.y) / cell)));
        cells.assign(static_cast<size_t>(nx) * nz, {});
        for (uint32_t i = 0; i < boxes.size(); ++i) {
            const auto& b = boxes[i];
            if (b.kind == WorldBox::Ignore) continue;
            const int x0 = std::clamp(static_cast<int>((b.lo.x - 1.0f - origin.x) / cell), 0, nx - 1);
            const int x1 = std::clamp(static_cast<int>((b.hi.x + 1.0f - origin.x) / cell), 0, nx - 1);
            const int z0 = std::clamp(static_cast<int>((b.lo.z - 1.0f - origin.y) / cell), 0, nz - 1);
            const int z1 = std::clamp(static_cast<int>((b.hi.z + 1.0f - origin.y) / cell), 0, nz - 1);
            if ((x1 - x0 + 1) * (z1 - z0 + 1) > 1024) { big.push_back(i); continue; }
            for (int z = z0; z <= z1; ++z)
                for (int x = x0; x <= x1; ++x) cells[static_cast<size_t>(z) * nx + x].push_back(i);
        }
    }
    const std::vector<uint32_t>& at(float x, float z) const {
        const int ix = std::clamp(static_cast<int>((x - origin.x) / cell), 0, nx - 1);
        const int iz = std::clamp(static_cast<int>((z - origin.y) / cell), 0, nz - 1);
        const auto& c = cells[static_cast<size_t>(iz) * nx + ix];
        if (big.empty()) return c;
        scratch.assign(c.begin(), c.end());
        scratch.insert(scratch.end(), big.begin(), big.end());
        return scratch;
    }
};

bool isGround(WorldBox::Kind k) { return k == WorldBox::Lawn || k == WorldBox::Dirt || k == WorldBox::Sand; }

} // namespace

geometry::MeshData grassTuft(uint32_t seed, int blades, bool dry) {
    geometry::MeshData m;
    Rng r(seed);
    const glm::vec3 up(0.0f, 1.0f, 0.0f);
    const glm::vec3 rootCol = dry ? glm::vec3(0.62f, 0.56f, 0.42f) : glm::vec3(0.34f, 0.42f, 0.26f);
    const glm::vec3 tipCol  = dry ? glm::vec3(1.22f, 1.10f, 0.74f) : glm::vec3(1.06f, 1.04f, 0.80f);
    constexpr int kSeg = 2;
    for (int b = 0; b < blades; ++b) {
        const float a = r.range(0.0f, glm::two_pi<float>());
        const float rad = 0.45f * std::sqrt(r.next());
        const glm::vec3 root(std::cos(a) * rad, 0.0f, std::sin(a) * rad);
        // Blades lean out from the middle of the tuft, some a long way.
        const float la = a + r.range(-0.7f, 0.7f);
        const glm::vec3 lean(std::cos(la), 0.0f, std::sin(la));
        const float leanAmt = r.range(0.15f, 0.65f);
        const float hb = r.range(0.55f, 1.0f);
        const float w0 = r.range(0.022f, 0.038f);
        const float ta = r.range(0.0f, glm::two_pi<float>());
        const glm::vec3 across(std::cos(ta), 0.0f, std::sin(ta));
        const float shade = r.range(0.85f, 1.12f);
        for (int side = 0; side < 2; ++side) {
            const uint32_t base = static_cast<uint32_t>(m.positions.size());
            for (int i = 0; i <= kSeg; ++i) {
                const float t = static_cast<float>(i) / kSeg;
                const glm::vec3 spine = root + lean * (t * t * hb * leanAmt) + up * (t * hb);
                const glm::vec3 tangent = glm::normalize(lean * (2.0f * t * hb * leanAmt) + up * hb);
                glm::vec3 face = glm::normalize(glm::cross(across, tangent));
                if (side == 1) face = -face;
                // Lit mostly from above, like the lawn under it: a blade is
                // too thin to have a dark side.
                const glm::vec3 n = glm::normalize(face * 0.45f + up * 0.55f);
                const float w = w0 * (1.0f - 0.9f * t);
                for (int e = 0; e < 2; ++e) {
                    const float sx = e == 0 ? -1.0f : 1.0f;
                    m.positions.push_back(spine + across * (w * sx));
                    m.normals.push_back(n);
                    m.uvs.emplace_back(e == 0 ? 0.0f : 1.0f, t);
                    m.colors.push_back(glm::mix(rootCol, tipCol, std::pow(t, 0.8f)) * shade);
                }
            }
            for (int i = 0; i < kSeg; ++i) {
                const uint32_t q = base + static_cast<uint32_t>(i * 2);
                m.indices.insert(m.indices.end(), {q, q + 1, q + 3, q, q + 3, q + 2});
            }
        }
    }
    // Each face toward the side its normal points to.
    for (size_t t = 0; t + 2 < m.indices.size(); t += 3) {
        const auto a = m.indices[t], b = m.indices[t + 1], c = m.indices[t + 2];
        const glm::vec3 f = glm::cross(m.positions[b] - m.positions[a], m.positions[c] - m.positions[a]);
        const glm::vec3 vn = m.normals[a] - glm::vec3(0.0f, 0.55f, 0.0f);   // the face part of the normal
        if (glm::dot(f, vn) < 0.0f) std::swap(m.indices[t + 1], m.indices[t + 2]);
    }
    geometry::computeTangents(m);
    geometry::computeBounds(m);
    return m;
}

ScatterResult scatterGround(const std::vector<WorldBox>& boxes, uint32_t seed, size_t budget) {
    ScatterResult out;
    glm::vec2 lo(1e9f), hi(-1e9f);
    double area[3] = {0, 0, 0};
    for (const auto& b : boxes) {
        if (!isGround(b.kind)) continue;
        lo = glm::min(lo, glm::vec2(b.lo.x, b.lo.z));
        hi = glm::max(hi, glm::vec2(b.hi.x, b.hi.z));
        area[b.kind - WorldBox::Lawn] += static_cast<double>(b.hi.x - b.lo.x) * (b.hi.z - b.lo.z);
    }
    if (lo.x > hi.x) return out;
    Grid grid;
    grid.build(boxes, lo, hi);

    // Spacing from the budget: a lawn is sampled about every 40 cm, dirt
    // and sand sparser, and the whole lot opens up if the map is big.
    const double want = area[0] / (0.40 * 0.40) * 0.62 + (area[1] + area[2]) / (0.5 * 0.5) * 0.12;
    const float spread = static_cast<float>(std::max(1.0, std::sqrt(want / static_cast<double>(budget))));

    for (uint32_t gi = 0; gi < boxes.size(); ++gi) {
        const auto& g = boxes[gi];
        if (!isGround(g.kind)) continue;
        const float top = g.hi.y;
        const float step = (g.kind == WorldBox::Lawn ? 0.40f : 0.5f) * spread;
        const int nx = static_cast<int>((g.hi.x - g.lo.x) / step), nz = static_cast<int>((g.hi.z - g.lo.z) / step);
        if (nx <= 0 || nz <= 0 || static_cast<double>(nx) * nz > 8.0e6) continue;
        Rng r(seed ^ (gi * 2654435761u));
        for (int iz = 0; iz < nz; ++iz)
            for (int ix = 0; ix < nx; ++ix) {
                const float px = g.lo.x + (ix + r.next()) * step;
                const float pz = g.lo.z + (iz + r.next()) * step;
                const float pick = r.next(), pick2 = r.next();
                // Blocked, and how far to the nearest thing standing here.
                float edge = 1e9f;
                bool blocked = false;
                for (uint32_t oi : grid.at(px, pz)) {
                    if (oi == gi) continue;
                    const auto& o = boxes[oi];
                    const bool rises = o.lo.y < top + 1.8f && o.hi.y > top + 0.01f;
                    // Coplanar ground: the first draw owns the overlap.
                    const bool twin = isGround(o.kind) && std::abs(o.hi.y - top) <= 0.01f && oi < gi;
                    if (!rises && !twin) continue;
                    const float dx = std::max({o.lo.x - px, 0.0f, px - o.hi.x});
                    const float dz = std::max({o.lo.z - pz, 0.0f, pz - o.hi.z});
                    const float d = std::sqrt(dx * dx + dz * dz);
                    if (d < 0.04f) { blocked = true; break; }
                    if (rises && !isGround(o.kind)) edge = std::min(edge, d);
                }
                if (blocked) continue;
                const float n1 = noise2(px * 0.23f, pz * 0.23f, seed + 11u);
                const float n2 = noise2(px * 0.06f, pz * 0.06f, seed + 29u);
                const float nearWall = edge < 1.1f ? 1.0f - edge / 1.1f : 0.0f;
                float pGrass = 0, pWeed = 0, pStone = 0;
                switch (g.kind) {
                case WorldBox::Lawn:
                    pGrass = 0.30f + 0.70f * smoothstep(0.28f, 0.66f, n1);
                    pWeed = 0.04f * nearWall;
                    break;
                case WorldBox::Dirt:
                    pWeed = 0.03f + 0.45f * smoothstep(0.62f, 0.82f, n1) + 0.80f * nearWall * nearWall;
                    pGrass = pWeed * 0.35f * smoothstep(0.3f, 0.7f, n2);
                    pStone = 0.07f + 0.30f * nearWall;
                    break;
                default:   // sand: dune grass in clumps, the odd stone
                    pWeed = 0.02f + 0.30f * smoothstep(0.72f, 0.88f, n1) + 0.25f * nearWall;
                    pStone = 0.025f;
                    break;
                }
                const float yaw = r.range(0.0f, glm::two_pi<float>());
                const float seedW = r.next();
                if (pick < pGrass + pWeed) {
                    const bool dry = pick >= pGrass;
                    const float s = dry ? r.range(0.26f, 0.48f) : r.range(0.30f, 0.46f);
                    const float h = (dry ? r.range(0.30f, 0.62f) : r.range(0.16f, 0.32f)) *
                                    (0.8f + 0.5f * n2) * (dry ? 1.0f + 0.4f * nearWall : 1.0f);
                    rendering::Instance in;
                    in.model = glm::translate(glm::mat4(1.0f), glm::vec3(px, top - 0.01f, pz)) *
                               glm::rotate(glm::mat4(1.0f), yaw, glm::vec3(0, 1, 0)) *
                               glm::scale(glm::mat4(1.0f), glm::vec3(s, h, s));
                    // Big patches of lusher and of sun-bleached grass.
                    const float lush = n2;
                    in.params = glm::vec4(glm::mix(glm::vec3(1.18f, 1.08f, 0.72f), glm::vec3(0.86f, 1.02f, 0.92f), lush) *
                                              r.range(0.9f, 1.1f),
                                          seedW);
                    (dry ? out.weeds : out.grass).push_back(in);
                }
                if (pick2 < pStone) {
                    // Mostly small: the size cubed toward pebbles, the odd rock.
                    const float u = r.next();
                    const float size = 0.035f + 0.2f * u * u * u + 0.06f * nearWall * r.next();
                    const glm::vec3 axis = glm::normalize(glm::vec3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)) + glm::vec3(0, 0.01f, 0));
                    rendering::Instance in;
                    in.model = glm::translate(glm::mat4(1.0f), glm::vec3(px, top - size * 0.28f, pz)) *
                               glm::rotate(glm::mat4(1.0f), r.range(0.0f, glm::two_pi<float>()), axis) *
                               glm::scale(glm::mat4(1.0f), glm::vec3(size * r.range(0.9f, 1.3f), size * r.range(0.5f, 0.8f), size));
                    const float v = r.range(0.75f, 1.2f);
                    in.params = glm::vec4(v, v * r.range(0.95f, 1.02f), v * r.range(0.9f, 1.0f), 0.0f);
                    out.stones.push_back(in);
                }
            }
    }
    // A last, uniform thinning if the estimate ran over: every k-th kept.
    auto thin = [](std::vector<rendering::Instance>& v, size_t cap) {
        if (v.size() <= cap) return;
        std::vector<rendering::Instance> keep;
        keep.reserve(cap);
        const double k = static_cast<double>(v.size()) / static_cast<double>(cap);
        for (size_t i = 0; i < cap; ++i) keep.push_back(v[static_cast<size_t>(i * k)]);
        v.swap(keep);
    };
    thin(out.grass, budget);
    thin(out.weeds, budget / 2);
    thin(out.stones, budget / 3);
    return out;
}

} // namespace game::scene
