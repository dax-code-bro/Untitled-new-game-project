#include "scene/BuildingKit.hpp"

#include <glm/gtc/matrix_transform.hpp>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <map>

namespace game::scene {

namespace {

std::vector<std::string> tokens(const std::string& n) {
    std::vector<std::string> out;
    std::string cur;
    for (char c : n) {
        if (c == '-' || c == ':' || c == '_' || c == ' ' || (c >= '0' && c <= '9')) {
            if (!cur.empty()) out.push_back(cur);
            cur.clear();
        } else {
            cur += c;
        }
    }
    if (!cur.empty()) out.push_back(cur);
    return out;
}
bool has(const std::vector<std::string>& t, std::initializer_list<const char*> any) {
    for (const auto& x : t)
        for (const char* w : any)
            if (x == w) return true;
    return false;
}

struct Frame {   // a box instance as translation, rotation, size in metres
    glm::vec3 t{0.0f}, s{1.0f};
    glm::mat3 r{1.0f};
    glm::vec3 lo{0.0f}, hi{0.0f};   // world AABB
    bool upright = true;
};
Frame frameOf(const glm::mat4& m) {
    Frame f;
    f.t = glm::vec3(m[3]);
    for (int i = 0; i < 3; ++i) {
        const glm::vec3 c(m[i]);
        f.s[i] = std::max(glm::length(c), 1e-6f);
        f.r[i] = c / f.s[i];
    }
    f.upright = f.r[1].y > 0.995f;
    const glm::vec3 h = 0.5f * (glm::abs(f.r[0]) * f.s.x + glm::abs(f.r[1]) * f.s.y + glm::abs(f.r[2]) * f.s.z);
    f.lo = f.t - h;
    f.hi = f.t + h;
    return f;
}
bool overlaps(const glm::vec3& alo, const glm::vec3& ahi, const glm::vec3& blo, const glm::vec3& bhi) {
    return alo.x < bhi.x && ahi.x > blo.x && alo.y < bhi.y && ahi.y > blo.y && alo.z < bhi.z && ahi.z > blo.z;
}

// A flat-shaded mesh built face by face, wound to face its outward hint.
struct Builder {
    geometry::MeshData m;
    void face(const std::vector<glm::vec3>& p, const glm::vec3& outward, const glm::vec3& uAxis) {
        glm::vec3 n = glm::cross(p[1] - p[0], p[2] - p[0]);
        if (glm::dot(n, n) < 1e-12f) return;
        n = glm::normalize(n);
        const bool flip = glm::dot(n, outward) < 0.0f;
        if (flip) n = -n;
        glm::vec3 ua = uAxis - n * glm::dot(uAxis, n);
        ua = glm::dot(ua, ua) > 1e-8f ? glm::normalize(ua) : glm::normalize(glm::cross(n, glm::vec3(0, 0, 1)));
        const glm::vec3 va = glm::cross(n, ua);
        const uint32_t base = static_cast<uint32_t>(m.positions.size());
        for (const auto& q : p) {
            m.positions.push_back(q);
            m.normals.push_back(n);
            m.uvs.emplace_back(glm::dot(q, ua), glm::dot(q, va));
        }
        for (uint32_t k = 1; k + 1 < p.size(); ++k) {
            if (flip) m.indices.insert(m.indices.end(), {base, base + k + 1, base + k});
            else      m.indices.insert(m.indices.end(), {base, base + k, base + k + 1});
        }
    }
};

glm::mat4 boxModel(const glm::vec3& center, const glm::mat3& basis, const glm::vec3& size) {
    glm::mat4 m(basis);
    m[3] = glm::vec4(center, 1.0f);
    return m * glm::scale(glm::mat4(1.0f), size);
}

float hash(float a, float b) {
    const float h = std::sin(a * 127.1f + b * 311.7f) * 43758.5453f;
    return h - std::floor(h);
}

float luminance(const glm::vec3& c) { return 0.2126f * c.r + 0.7152f * c.g + 0.0722f * c.b; }

// A hipped roof on a box's footprint: fascia band, soffit, four slopes.
void hipRoof(Builder& b, const Frame& f, float rise, float fascia) {
    const float hx = 0.5f * f.s.x, hz = 0.5f * f.s.z;
    const float yb = -0.5f * f.s.y, e = yb + fascia, top = e + rise;
    auto W = [&](float x, float y, float z) { return f.t + f.r[0] * x + f.r[1] * y + f.r[2] * z; };
    const glm::vec3 X = f.r[0], Y = f.r[1], Z = f.r[2];
    // Fascia and soffit.
    b.face({W(-hx, yb, hz), W(hx, yb, hz), W(hx, e, hz), W(-hx, e, hz)}, Z, X);
    b.face({W(hx, yb, -hz), W(-hx, yb, -hz), W(-hx, e, -hz), W(hx, e, -hz)}, -Z, X);
    b.face({W(hx, yb, hz), W(hx, yb, -hz), W(hx, e, -hz), W(hx, e, hz)}, X, Z);
    b.face({W(-hx, yb, -hz), W(-hx, yb, hz), W(-hx, e, hz), W(-hx, e, -hz)}, -X, Z);
    b.face({W(-hx, yb, -hz), W(hx, yb, -hz), W(hx, yb, hz), W(-hx, yb, hz)}, -Y, X);
    // Slopes: the ridge runs along the longer side.
    if (hx >= hz) {
        const float rx = hx - hz;
        b.face({W(-hx, e, hz), W(hx, e, hz), W(rx, top, 0), W(-rx, top, 0)}, Z + Y, X);
        b.face({W(hx, e, -hz), W(-hx, e, -hz), W(-rx, top, 0), W(rx, top, 0)}, -Z + Y, X);
        b.face({W(hx, e, hz), W(hx, e, -hz), W(rx, top, 0)}, X + Y, Z);
        b.face({W(-hx, e, -hz), W(-hx, e, hz), W(-rx, top, 0)}, -X + Y, Z);
    } else {
        const float rz = hz - hx;
        b.face({W(hx, e, hz), W(hx, e, -hz), W(0, top, -rz), W(0, top, rz)}, X + Y, Z);
        b.face({W(-hx, e, -hz), W(-hx, e, hz), W(0, top, rz), W(0, top, -rz)}, -X + Y, Z);
        b.face({W(-hx, e, hz), W(hx, e, hz), W(0, top, rz)}, Z + Y, X);
        b.face({W(hx, e, -hz), W(-hx, e, -hz), W(0, top, -rz)}, -Z + Y, X);
    }
}

// A barrel vault across the short span, with end walls, for a hangar.
void vaultRoof(Builder& b, const Frame& f, float fascia) {
    const bool alongX = f.s.x >= f.s.z;
    const float hl = 0.5f * (alongX ? f.s.x : f.s.z), hs = 0.5f * (alongX ? f.s.z : f.s.x);
    const glm::vec3 L = alongX ? f.r[0] : f.r[2], Sd = alongX ? f.r[2] : f.r[0], Y = f.r[1];
    const float yb = -0.5f * f.s.y, e = yb + fascia;
    const float rise = 0.30f * hs * 2.0f * 0.5f;
    const float rc = (hs * hs + rise * rise) / (2.0f * rise), yc = e + rise - rc;
    const float phi0 = std::asin(std::min(1.0f, hs / rc));
    auto W = [&](float l, float y, float s) { return f.t + L * l + Y * y + Sd * s; };
    constexpr int kSeg = 24;
    std::vector<glm::vec2> arc;   // (s, y)
    for (int i = 0; i <= kSeg; ++i) {
        const float p = -phi0 + 2.0f * phi0 * static_cast<float>(i) / kSeg;
        arc.emplace_back(rc * std::sin(p), yc + rc * std::cos(p));
    }
    for (int i = 0; i < kSeg; ++i) {
        const glm::vec2 a = arc[i], c = arc[i + 1];
        const glm::vec2 mid = 0.5f * (a + c);
        const glm::vec3 out = glm::normalize(Sd * mid.x + Y * (mid.y - yc));
        b.face({W(-hl, a.y, a.x), W(hl, a.y, a.x), W(hl, c.y, c.x), W(-hl, c.y, c.x)}, out, L);
    }
    for (float sgn : {-1.0f, 1.0f}) {
        std::vector<glm::vec3> cap{W(sgn * hl, e, 0.0f)};
        for (const auto& a : arc) cap.push_back(W(sgn * hl, a.y, a.x));
        // A fan is convex from its centre on the chord: emit triangles.
        for (size_t i = 1; i + 1 < cap.size(); ++i) b.face({cap[0], cap[i], cap[i + 1]}, L * sgn, Sd);
        b.face({W(sgn * hl, yb, -hs), W(sgn * hl, yb, hs), W(sgn * hl, e, hs), W(sgn * hl, e, -hs)}, L * sgn, Sd);
    }
    b.face({W(-hl, yb, hs), W(hl, yb, hs), W(hl, e, hs), W(-hl, e, hs)}, Sd, L);
    b.face({W(hl, yb, -hs), W(-hl, yb, -hs), W(-hl, e, -hs), W(hl, e, -hs)}, -Sd, L);
    b.face({W(-hl, yb, -hs), W(hl, yb, -hs), W(hl, yb, hs), W(-hl, yb, hs)}, -Y, L);
}

/* Roof furniture for a hipped roof: ridge and hip tiles along the lines the
   slopes meet on, a gutter under every eave, and downpipes at two corners
   down to whatever the corner stands over. */
void roofTrim(const Frame& f, float rise, float fascia, float groundY,
              std::vector<rendering::Instance>& ridge, std::vector<rendering::Instance>& metal) {
    const float hx = 0.5f * f.s.x, hz = 0.5f * f.s.z;
    const float yb = -0.5f * f.s.y, e = yb + fascia, top = e + rise;
    auto W = [&](float x, float y, float z) { return f.t + f.r[0] * x + f.r[1] * y + f.r[2] * z; };
    auto bar = [&](std::vector<rendering::Instance>& out, glm::vec3 a, glm::vec3 b, float w, float h) {
        const glm::vec3 d = b - a;
        const float len = glm::length(d);
        if (len < 0.05f) return;
        const glm::vec3 x = d / len;
        glm::vec3 z = glm::cross(x, glm::vec3(0, 1, 0));
        z = glm::dot(z, z) > 1e-6f ? glm::normalize(z) : glm::vec3(0, 0, 1);
        const glm::vec3 y = glm::cross(z, x);
        rendering::Instance in;
        in.model = boxModel(0.5f * (a + b) + y * (0.5f * h - 0.02f), glm::mat3(x, y, z), {len + 0.04f, h, w});
        out.push_back(in);
    };
    const bool alongX = hx >= hz;
    const float r = alongX ? hx - hz : hz - hx;
    const glm::vec3 r0 = alongX ? W(-r, top, 0) : W(0, top, -r), r1 = alongX ? W(r, top, 0) : W(0, top, r);
    bar(ridge, r0, r1, 0.2f, 0.12f);
    const glm::vec3 c[4] = {W(-hx, e, -hz), W(hx, e, -hz), W(hx, e, hz), W(-hx, e, hz)};
    for (int k = 0; k < 4; ++k) {
        const glm::vec3 lc = glm::transpose(f.r) * (c[k] - f.t);
        const bool nearR1 = alongX ? lc.x > 0.0f : lc.z > 0.0f;
        bar(ridge, c[k], nearR1 ? r1 : r0, 0.16f, 0.1f);
    }
    // Gutters just outside the fascia, at its foot.
    const float g = 0.07f;
    bar(metal, W(-hx, yb + g, hz + g), W(hx, yb + g, hz + g), 0.12f, 0.11f);
    bar(metal, W(hx, yb + g, -hz - g), W(-hx, yb + g, -hz - g), 0.12f, 0.11f);
    bar(metal, W(hx + g, yb + g, hz), W(hx + g, yb + g, -hz), 0.12f, 0.11f);
    bar(metal, W(-hx - g, yb + g, -hz), W(-hx - g, yb + g, hz), 0.12f, 0.11f);
    // Downpipes at two opposite corners.
    for (float sg : {-1.0f, 1.0f}) {
        const glm::vec3 top3 = W(sg * (hx + g), yb + g, sg * (hz + g));
        if (top3.y - groundY < 0.8f) continue;
        rendering::Instance in;
        in.model = boxModel(glm::vec3(top3.x, 0.5f * (top3.y + groundY), top3.z), f.r,
                            {0.09f, top3.y - groundY, 0.09f});
        metal.push_back(in);
    }
}

} // namespace

KitResult buildKit(const std::vector<KitBox>& boxes, rendering::MaterialLibrary& lib) {
    KitResult out;
    std::vector<Frame> fr;
    fr.reserve(boxes.size());
    for (const auto& b : boxes) fr.push_back(frameOf(b.model));

    enum RoofKind { None, Pitched, Vault, Flat };
    std::vector<RoofKind> roofKind(boxes.size(), None);
    std::vector<size_t> roofs;
    for (size_t i = 0; i < boxes.size(); ++i) {
        const auto t = tokens(boxes[i].name);
        if (!has(t, {"roof"}) || has(t, {"car", "tank", "porch", "carport", "lean"}) || !fr[i].upright) continue;
        roofs.push_back(i);
        const float area = fr[i].s.x * fr[i].s.z;
        if (has(t, {"house", "church", "shed", "bakery", "cabana", "pavilion", "boathouse", "slip", "cottage",
                    "chapel", "villa", "barn", "hut", "lodge"}))
            roofKind[i] = Pitched;
        else if (has(t, {"hangar"})) roofKind[i] = Vault;
        else if (area >= 30.0f) roofKind[i] = Flat;
    }

    /* ---- stacks: a pyramid drawn as shrinking slabs is one roof ----
       A pitched slab whose centre lies inside a lower pitched slab of the
       same building joins it; the lowest is the footprint. */
    std::vector<size_t> pitched;
    for (size_t i : roofs) if (roofKind[i] == Pitched || roofKind[i] == Vault) pitched.push_back(i);
    std::sort(pitched.begin(), pitched.end(), [&](size_t a, size_t b) { return fr[a].lo.y < fr[b].lo.y; });
    std::vector<long> baseOf(boxes.size(), -1);
    std::vector<float> stackTop(boxes.size(), 0.0f);
    for (size_t k = 0; k < pitched.size(); ++k) {
        const size_t i = pitched[k];
        for (size_t j = 0; j < k; ++j) {
            const size_t c = pitched[j];
            if (baseOf[c] != -1) continue;   // only bases collect
            const Frame& B = fr[c];
            const glm::vec3 d = fr[i].t - B.t;
            const float lx = std::abs(glm::dot(d, B.r[0])), lz = std::abs(glm::dot(d, B.r[2]));
            if (lx < 0.25f * B.s.x && lz < 0.25f * B.s.z && fr[i].lo.y >= B.lo.y + 0.05f &&
                fr[i].s.x <= B.s.x + 0.01f && fr[i].s.z <= B.s.z + 0.01f && fr[i].lo.y < B.hi.y + 3.0f) {
                baseOf[i] = static_cast<long>(c);
                stackTop[c] = std::max(stackTop[c], fr[i].hi.y);
                break;
            }
        }
    }

    // The highest broad surface under a point and below a height: ground,
    // pavement or a deck, for downpipes to stand on.
    auto groundUnder = [&](const glm::vec3& p) {
        float g = -1e9f;
        for (size_t o = 0; o < boxes.size(); ++o) {
            const Frame& F = fr[o];
            if (p.x < F.lo.x || p.x > F.hi.x || p.z < F.lo.z || p.z > F.hi.z || F.hi.y > p.y - 0.8f) continue;
            if ((F.hi.x - F.lo.x) * (F.hi.z - F.lo.z) < 4.0f) continue;
            g = std::max(g, F.hi.y);
        }
        return g > -1e8f ? g : 0.0f;
    };
    std::map<const rendering::Material*, std::vector<rendering::Instance>> ridgeTiles;
    std::vector<rendering::Instance> roofMetal;

    /* ---- the roofs ---- one merged mesh per source material */
    std::map<const rendering::Material*, Builder> tileRoofs, metalRoofs;
    for (size_t i : pitched) {
        if (baseOf[i] != -1) {   // a step of a stack: drawn by its base
            out.removed.emplace_back(boxes[i].item, boxes[i].instance);
            continue;
        }
        const Frame& f = fr[i];
        const float fascia = std::clamp(f.s.y, 0.18f, 0.45f);
        const float eaveTop = f.lo.y + fascia;
        if (roofKind[i] == Vault) {
            vaultRoof(metalRoofs[boxes[i].material], f, fascia);
        } else {
            const float pitchRise = 0.5f * std::min(f.s.x, f.s.z) * 0.58f;   // ~30 degrees
            const float rise = stackTop[i] > 0.0f ? std::max(stackTop[i] - eaveTop, 0.6f * pitchRise) : pitchRise;
            const bool metal = boxes[i].texture == "metal" || boxes[i].texture == "corrugated";
            hipRoof(metal ? metalRoofs[boxes[i].material] : tileRoofs[boxes[i].material], f, rise, fascia);
            const glm::vec3 corner = f.t + f.r[0] * (0.5f * f.s.x + 0.07f) + f.r[2] * (0.5f * f.s.z + 0.07f) -
                                     f.r[1] * (0.5f * f.s.y);
            roofTrim(f, rise, fascia, groundUnder(corner), ridgeTiles[boxes[i].material], roofMetal);
            out.trim += 1;
        }
        out.removed.emplace_back(boxes[i].item, boxes[i].instance);
        ++out.roofs;
    }
    auto emit = [&](std::map<const rendering::Material*, Builder>& set, const char* recipe, float uvScale) {
        for (auto& [src, b] : set) {
            if (b.m.indices.empty()) continue;
            geometry::computeTangents(b.m);
            geometry::computeBounds(b.m);
            rendering::Material m = *src;
            try { m.maps = lib.maps(recipe, 3u); } catch (const std::exception&) {}
            m.worldUv = false;
            m.uvScale = uvScale;
            m.parallax = 1.0f;
            if (std::string(recipe) == "pantile") {
                // Clay or slate: never the pale grey of the slab it replaces.
                const float l = luminance(m.color);
                if (l > 0.30f) m.color *= 0.30f / l;
                m.roughness = std::max(m.roughness, 0.7f);
            }
            out.meshes.push_back({std::move(b.m), m});
        }
    };
    emit(tileRoofs, "pantile", 0.5f);
    emit(metalRoofs, "corrugated", 0.5f);
    for (auto& [src, v] : ridgeTiles) {
        if (v.empty()) continue;
        rendering::Material m = *src;
        try { m.maps = lib.maps("pantile", 3u); } catch (const std::exception&) {}
        m.worldUv = true;
        m.uvScale = 1.5f;
        const float l = luminance(m.color);
        m.color *= (l > 0.26f ? 0.26f / l : 1.0f) * 0.85f;
        out.boxes.push_back({std::move(v), m});
    }
    rendering::Material gutter;
    gutter.color = glm::vec3(0.32f, 0.33f, 0.33f);
    gutter.roughness = 0.4f;
    gutter.metalness = 0.6f;
    if (!roofMetal.empty()) out.boxes.push_back({std::move(roofMetal), gutter});

    /* ---- flat roofs: parapet, gravel, plant ---- */
    rendering::Material gravel;
    gravel.color = glm::vec3(0.30f, 0.29f, 0.27f);
    gravel.roughness = 0.95f;
    gravel.worldUv = true;
    gravel.uvScale = 0.8f;
    try { gravel.maps = lib.maps("gravel", 5u); } catch (const std::exception&) {}
    rendering::Material plant;
    plant.color = glm::vec3(0.46f, 0.47f, 0.46f);
    plant.roughness = 0.45f;
    plant.worldUv = true;
    plant.uvScale = 1.0f;
    try { plant.maps = lib.maps("paint", 9u); } catch (const std::exception&) {}
    std::map<const rendering::Material*, std::vector<rendering::Instance>> parapets;
    std::vector<rendering::Instance> gravelTops, plantBoxes;
    auto inst = [](const glm::mat4& m) { rendering::Instance x; x.model = m; return x; };
    for (size_t i : roofs) {
        if (roofKind[i] != Flat) continue;
        const Frame& f = fr[i];
        const float hx = 0.5f * f.s.x, hz = 0.5f * f.s.z, top = 0.5f * f.s.y;
        const float pt = 0.25f, ph = 0.55f;
        auto W = [&](float x, float y, float z) { return f.t + f.r[0] * x + f.r[1] * y + f.r[2] * z; };
        auto& par = parapets[boxes[i].material];
        par.push_back(inst(boxModel(W(0, top + ph * 0.5f, hz - pt * 0.5f), f.r, {2 * hx, ph, pt})));
        par.push_back(inst(boxModel(W(0, top + ph * 0.5f, -hz + pt * 0.5f), f.r, {2 * hx, ph, pt})));
        par.push_back(inst(boxModel(W(hx - pt * 0.5f, top + ph * 0.5f, 0), f.r, {pt, ph, 2 * hz - 2 * pt})));
        par.push_back(inst(boxModel(W(-hx + pt * 0.5f, top + ph * 0.5f, 0), f.r, {pt, ph, 2 * hz - 2 * pt})));
        gravelTops.push_back(inst(boxModel(W(0, top + 0.015f, 0), f.r, {2 * hx - 2 * pt, 0.03f, 2 * hz - 2 * pt})));
        // Plant: AC units and vents on a loose grid, a few per roof.
        const int units = std::clamp(static_cast<int>(f.s.x * f.s.z / 80.0f), 1, 6);
        for (int u = 0; u < units; ++u) {
            const float a = hash(f.t.x + u * 3.1f, f.t.z - u * 1.7f), c = hash(f.t.z + u * 5.3f, f.t.x + u);
            const float x = (a - 0.5f) * (2 * hx - 3.0f), z = (c - 0.5f) * (2 * hz - 3.0f);
            plantBoxes.push_back(inst(boxModel(W(x, top + 0.45f, z), f.r, {1.4f, 0.9f, 1.0f})));
            plantBoxes.push_back(inst(boxModel(W(x + 1.2f, top + 0.35f, z + 0.3f), f.r, {0.35f, 0.7f, 0.35f})));
        }
        ++out.flatRoofs;
    }
    for (auto& [src, v] : parapets) out.boxes.push_back({std::move(v), *src});
    if (!gravelTops.empty()) out.boxes.push_back({std::move(gravelTops), gravel});
    if (!plantBoxes.empty()) out.boxes.push_back({std::move(plantBoxes), plant});

    /* ---- windows ---- */
    rendering::Material frameMat;
    frameMat.color = glm::vec3(0.56f, 0.54f, 0.50f);
    frameMat.roughness = 0.5f;
    frameMat.worldUv = true;
    try { frameMat.maps = lib.maps("paint", 2u); } catch (const std::exception&) {}
    rendering::Material glass;
    glass.color = glm::vec3(0.010f, 0.012f, 0.014f);
    glass.roughness = 0.05f;
    glass.parallax = 0.0f;
    rendering::Material sill;
    sill.color = glm::vec3(0.40f, 0.38f, 0.35f);
    sill.roughness = 0.85f;
    sill.worldUv = true;
    sill.uvScale = 0.5f;
    try { sill.maps = lib.maps("concrete", 4u); } catch (const std::exception&) {}
    std::vector<rendering::Instance> frames, panes, sills, plinths, cornices;
    std::vector<rendering::Instance> fittingsPaint, fittingsMetal, fittingsGlass;

    // Everything a window could collide with, as world AABBs.
    std::vector<size_t> obstacles;
    for (size_t i = 0; i < boxes.size(); ++i) {
        const glm::vec3 e = fr[i].hi - fr[i].lo;
        if (e.x * e.z > 900.0f) continue;   // the ground
        obstacles.push_back(i);
    }
    const glm::vec3 up(0.0f, 1.0f, 0.0f);
    for (size_t i = 0; i < boxes.size(); ++i) {
        const auto t = tokens(boxes[i].name);
        if (!has(t, {"wall"}) || has(t, {"garden", "alley", "edge", "screen", "cap", "fence", "perimeter", "boundary",
                                          "skyline", "sea", "harbour", "retaining", "tank", "pit"}))
            continue;
        const Frame& f = fr[i];
        if (!f.upright || f.s.y < 2.4f) continue;
        const bool longX = f.s.x >= f.s.z;
        const float L = longX ? f.s.x : f.s.z, th = longX ? f.s.z : f.s.x;
        if (th > 0.7f || L < 2.4f) continue;
        glm::vec3 a = longX ? f.r[0] : f.r[2];
        glm::vec3 n = longX ? f.r[2] : f.r[0];
        // The roof over it, and which side is out.
        long roof = -1;
        for (size_t r : roofs) {
            const Frame& R = fr[r];
            if (f.t.x < R.lo.x - 0.3f || f.t.x > R.hi.x + 0.3f || f.t.z < R.lo.z - 0.3f || f.t.z > R.hi.z + 0.3f) continue;
            if (R.lo.y < f.hi.y - 0.8f || R.lo.y > f.hi.y + 3.0f) continue;
            roof = static_cast<long>(r);
            break;
        }
        if (roof < 0) continue;
        const Frame& R = fr[static_cast<size_t>(roof)];
        const glm::vec3 rc = 0.5f * (R.lo + R.hi);
        const float side = glm::dot(glm::vec3(f.t.x - rc.x, 0.0f, f.t.z - rc.z), n);
        if (side < 0.0f) n = -n;
        // (a, up, n) must be right-handed, or every box built on it is a
        // mirror image: its faces wind inside out and the back face is the
        // one drawn -- which is what hid the rooms behind the glass.
        if (glm::dot(glm::cross(a, glm::vec3(0.0f, 1.0f, 0.0f)), n) < 0.0f) a = -a;
        const float half = std::abs(n.x) > std::abs(n.z) ? 0.5f * (R.hi.x - R.lo.x) : 0.5f * (R.hi.z - R.lo.z);
        if (half - std::abs(side) > 1.6f) continue;   // an inside wall
        const bool cladding = boxes[i].texture == "metal" || boxes[i].texture == "corrugated";
        {
            /* Trim: a plinth course at the foot, a cornice under the eave,
               a string course at each floor line. Masonry only. */
            const glm::mat3 tb(a, up, n);
            const glm::vec3 fc = f.t + n * (0.5f * th);
            if (!cladding) {
                plinths.push_back(inst(boxModel(fc + n * 0.02f + up * (f.lo.y + 0.2f - f.t.y), tb, {L + 0.1f, 0.4f, 0.06f})));
                cornices.push_back(inst(boxModel(fc + n * 0.05f + up * (f.hi.y - 0.12f - f.t.y), tb, {L + 0.16f, 0.2f, 0.12f})));
                for (float yl = f.lo.y + 3.0f; yl < f.hi.y - 1.0f; yl += 3.0f)
                    cornices.push_back(inst(boxModel(fc + n * 0.03f + up * (yl - f.t.y), tb, {L + 0.06f, 0.12f, 0.07f})));
                out.trim += 1;
            }
        }
        if (cladding) continue;   // no sash windows in a hangar's sheet steel
        const glm::mat3 basis(a, up, n);
        const glm::vec3 face = f.t + n * (0.5f * th);
        const float yb = f.lo.y, yt = f.hi.y;
        const float ww = 1.1f, wh = 1.35f, fb = 0.07f;
        const int cols = std::max(1, static_cast<int>((L - 1.2f) / 2.8f));
        const float usable = L - 1.2f;
        for (float sy = yb + 0.95f; sy + wh <= yt - 0.3f; sy += 3.0f) {
            for (int c = 0; c < cols; ++c) {
                const float s = cols == 1 ? 0.0f : -0.5f * usable + usable * (c + 0.5f) / cols;
                const glm::vec3 centre = face + a * s + up * (sy + 0.5f * wh - f.t.y);
                // Keep clear of doors, windows the map already has, and
                // anything standing in front of the wall.
                const glm::vec3 ext = glm::abs(a) * (0.5f * ww + 0.25f) + up * (0.5f * wh + 0.2f);
                const glm::vec3 nearP = centre + n * 0.02f, farP = centre + n * 0.4f, backP = centre - n * 0.8f;
                const glm::vec3 qlo = glm::min(nearP, farP) - ext, qhi = glm::max(nearP, farP) + ext;
                const glm::vec3 dlo = glm::min(backP, farP) - ext, dhi = glm::max(backP, farP) + ext;
                bool clear = true;
                for (size_t o : obstacles) {
                    if (o == i) continue;
                    if (overlaps(qlo, qhi, fr[o].lo, fr[o].hi) ||
                        (overlaps(dlo, dhi, fr[o].lo, fr[o].hi) &&
                         has(tokens(boxes[o].name), {"door", "window", "frame", "jamb", "glass", "shopfront"}))) {
                        clear = false;
                        break;
                    }
                }
                if (!clear) continue;
                panes.push_back(inst(boxModel(centre + n * 0.012f, basis, {ww, wh, 0.024f})));
                panes.back().params.w = hash(centre.x * 1.37f + centre.y * 0.71f, centre.z * 1.13f - centre.y);   // the room's seed
                const glm::vec3 fc = centre + n * 0.04f;
                frames.push_back(inst(boxModel(fc + up * (0.5f * wh + 0.5f * fb), basis, {ww + 2 * fb, fb, 0.09f})));
                frames.push_back(inst(boxModel(fc - up * (0.5f * wh + 0.5f * fb), basis, {ww + 2 * fb, fb, 0.09f})));
                frames.push_back(inst(boxModel(fc + a * (0.5f * ww + 0.5f * fb), basis, {fb, wh, 0.09f})));
                frames.push_back(inst(boxModel(fc - a * (0.5f * ww + 0.5f * fb), basis, {fb, wh, 0.09f})));
                frames.push_back(inst(boxModel(fc, basis, {0.045f, wh, 0.06f})));                        // mullion
                frames.push_back(inst(boxModel(fc + up * (0.18f * wh), basis, {ww, 0.045f, 0.06f})));   // transom
                sills.push_back(inst(boxModel(centre + n * 0.08f - up * (0.5f * wh + fb + 0.03f), basis,
                                              {ww + 0.28f, 0.06f, 0.18f})));
                sills.push_back(inst(boxModel(centre + n * 0.03f + up * (0.5f * wh + fb + 0.08f), basis,
                                              {ww + 0.34f, 0.16f, 0.06f})));                              // lintel
                ++out.windows;
                if (std::getenv("GAME_KIT_VERBOSE") && out.windows % 10 == 1)
                    std::fprintf(stderr, "[kit] window %zu at (%.1f %.1f %.1f) facing (%.2f %.2f) on '%s'\n", out.windows,
                                 centre.x, centre.y, centre.z, n.x, n.z, boxes[i].name.c_str());
            }
        }
        /* Wall fittings: what a lived-in wall collects. A meter box and its
           conduit, a vent grille, a lamp, an air-conditioner on a bracket --
           each only where the wall is long enough and nothing (door, window,
           neighbour) is in the way, and each by a hash of the wall, so no two
           walls carry the same set. */
        if (L > 2.4f) {
            auto clearAt = [&](const glm::vec3& c, float ha, float hu, float depth) {
                const glm::vec3 ext = glm::abs(a) * (ha + 0.08f) + up * (hu + 0.08f);
                const glm::vec3 lo = glm::min(c + n * 0.02f, c + n * depth) - ext, hi = glm::max(c + n * 0.02f, c + n * depth) + ext;
                for (size_t o : obstacles)
                    if (o != i && overlaps(lo, hi, fr[o].lo, fr[o].hi)) return false;
                // ...and none of this wall's own new windows.
                for (const auto& pw : panes) {
                    const glm::vec3 pc(pw.model[3]);
                    if (std::abs(glm::dot(pc - c, a)) < ha + 0.75f && std::abs(pc.y - c.y) < hu + 0.85f &&
                        std::abs(glm::dot(pc - c, n)) < 0.5f) return false;
                }
                return true;
            };
            const float h1 = hash(f.t.x * 0.7f, f.t.z * 1.3f), h2 = hash(f.t.z * 0.9f + 3.0f, f.t.x),
                        h3 = hash(f.t.x + f.t.z, 7.7f), h4 = hash(f.t.z - f.t.x, 2.1f);
            auto at = [&](float s, float y) { return face + a * s + up * (y - f.t.y); };
            if (h1 < 0.45f) {
                const glm::vec3 c = at(0.5f * L - 0.55f, yb + 1.35f);
                if (clearAt(c, 0.23f, 0.3f, 0.25f)) {
                    fittingsPaint.push_back(inst(boxModel(c + n * 0.09f, basis, {0.45f, 0.6f, 0.18f})));
                    fittingsMetal.push_back(inst(boxModel(at(0.5f * L - 0.55f, yb + 0.55f) + n * 0.04f, basis, {0.05f, 1.0f, 0.05f})));
                    ++out.fittings;
                }
            }
            if (h2 < 0.5f && yt - yb > 2.6f) {
                const glm::vec3 c = at(-(0.5f * L - 0.6f), yt - 0.7f);
                if (clearAt(c, 0.17f, 0.12f, 0.1f)) { fittingsMetal.push_back(inst(boxModel(c + n * 0.025f, basis, {0.32f, 0.22f, 0.05f}))); ++out.fittings; }
            }
            if (h3 < 0.4f && yt - yb > 2.8f) {
                const float sl = cols >= 2 ? -0.5f * usable + usable / cols : 0.5f * L - 1.25f;
                const glm::vec3 c = at(sl, yb + 2.35f);
                if (clearAt(c, 0.1f, 0.15f, 0.2f)) {
                    fittingsMetal.push_back(inst(boxModel(c + n * 0.08f, basis, {0.16f, 0.26f, 0.15f})));
                    fittingsGlass.push_back(inst(boxModel(c + n * 0.08f - up * 0.02f, basis, {0.12f, 0.16f, 0.16f})));
                    ++out.fittings;
                }
            }
            if (h4 < 0.3f && L > 3.2f && yt - yb > 3.0f) {
                const glm::vec3 c = at(-(0.5f * L - 1.3f), yb + 2.25f);
                if (clearAt(c, 0.45f, 0.32f, 0.45f)) {
                    fittingsPaint.push_back(inst(boxModel(c + n * 0.2f, basis, {0.85f, 0.6f, 0.32f})));
                    fittingsMetal.push_back(inst(boxModel(c + n * 0.2f - up * 0.33f, basis, {0.9f, 0.05f, 0.4f})));
                    fittingsMetal.push_back(inst(boxModel(c + n * 0.37f, basis, {0.6f, 0.4f, 0.02f})));   // grille face
                    ++out.fittings;
                }
            }
        }
    }

    /* ---- freestanding walls: copings and piers ----
       A garden or yard wall with no roof over it: a stone coping along the
       top, and brick piers every three metres with their own caps. */
    std::map<const rendering::Material*, std::vector<rendering::Instance>> piers;
    std::vector<rendering::Instance> copings, stonePosts;
    for (size_t i = 0; i < boxes.size(); ++i) {
        const auto t = tokens(boxes[i].name);
        const std::string& tex = boxes[i].texture;
        // 'screen' is the multiplayer maps' cover wall: a freestanding brick
        // wall in all but name.
        if (!has(t, {"wall", "screen"}) || has(t, {"sea", "seawall", "harbour", "retaining", "tank", "pit", "cabin", "room",
                                          "corridor", "wing", "hotel", "hangar", "pump", "lobby", "house", "club", "biz",
                                          "church", "bakery", "garage", "skyline", "edge", "container", "cap"}))
            continue;
        if (!(tex == "brick" || tex == "concrete" || tex == "plaster" || tex == "rock" || tex == "setts")) continue;
        const Frame& f = fr[i];
        if (!f.upright || f.s.y < 0.5f || f.s.y > 3.0f) continue;
        const bool longX = f.s.x >= f.s.z;
        const float L = longX ? f.s.x : f.s.z, th = longX ? f.s.z : f.s.x;
        const bool cover = has(t, {"screen"});
        if (th > (cover ? 3.5f : 1.3f) || L < 1.5f) continue;
        bool roofed = false, capped = false;
        for (size_t r : roofs) {
            const Frame& R = fr[r];
            if (f.t.x > R.lo.x && f.t.x < R.hi.x && f.t.z > R.lo.z && f.t.z < R.hi.z && R.lo.y > f.hi.y - 0.5f &&
                R.lo.y < f.hi.y + 3.0f) { roofed = true; break; }
        }
        if (roofed) continue;
        for (size_t o : obstacles) {
            if (o == i || !has(tokens(boxes[o].name), {"cap", "coping"})) continue;
            if (overlaps(f.lo + glm::vec3(0, f.s.y - 0.05f, 0), f.hi + glm::vec3(0, 0.2f, 0), fr[o].lo, fr[o].hi)) { capped = true; break; }
        }
        glm::vec3 a = longX ? f.r[0] : f.r[2];
        glm::vec3 n = longX ? f.r[2] : f.r[0];
        if (glm::dot(glm::cross(a, up), n) < 0.0f) a = -a;
        const glm::mat3 basis(a, up, n);
        const float top = f.hi.y;
        if (std::getenv("GAME_KIT_VERBOSE"))
            std::fprintf(stderr, "[kit] freestanding '%s' at (%.1f %.1f %.1f) L %.2f th %.2f capped %d\n", boxes[i].name.c_str(),
                         f.t.x, f.t.y, f.t.z, L, th, capped ? 1 : 0);
        if (!capped) copings.push_back(inst(boxModel(glm::vec3(f.t.x, top + 0.035f, f.t.z), basis, {L + 0.08f, 0.07f, th + 0.1f})));
        if (L >= 3.5f) {
            const int np = static_cast<int>(L / 3.0f);
            for (int k = 0; k <= np; ++k) {
                const float sp = -0.5f * L + 0.225f + (L - 0.45f) * static_cast<float>(k) / np;
                const glm::vec3 base = f.t + a * sp;
                // Stone posts, standing proud of whatever cap the map put on
                // the wall, so the run reads as panels between posts.
                const float ph = f.s.y + (capped ? 0.3f : 0.12f);
                stonePosts.push_back(inst(boxModel(glm::vec3(base.x, f.lo.y + 0.5f * ph, base.z), basis, {0.5f, ph, th + 0.16f})));
                copings.push_back(inst(boxModel(glm::vec3(base.x, f.lo.y + ph + 0.045f, base.z), basis, {0.62f, 0.09f, th + 0.28f})));
            }
        }
        ++out.trim;
    }
    rendering::Material plinthMat = sill;
    plinthMat.color = glm::vec3(0.24f, 0.23f, 0.22f);
    rendering::Material corniceMat = sill;
    corniceMat.color = glm::vec3(0.46f, 0.44f, 0.40f);
    if (!plinths.empty()) out.boxes.push_back({std::move(plinths), plinthMat});
    if (!copings.empty()) out.boxes.push_back({std::move(copings), corniceMat});
    for (auto& [src, v] : piers) out.boxes.push_back({std::move(v), *src});
    rendering::Material postMat = sill;
    postMat.color = glm::vec3(0.38f, 0.36f, 0.33f);
    if (!stonePosts.empty()) out.boxes.push_back({std::move(stonePosts), postMat});
    if (!fittingsPaint.empty()) out.boxes.push_back({std::move(fittingsPaint), plant});
    if (!fittingsMetal.empty()) out.boxes.push_back({std::move(fittingsMetal), gutter});
    rendering::Material lampGlass;
    lampGlass.color = glm::vec3(0.8f, 0.75f, 0.6f);
    lampGlass.roughness = 0.2f;
    lampGlass.emissive = glm::vec3(1.0f, 0.78f, 0.5f);
    lampGlass.emissiveStrength = 0.6f;
    lampGlass.maps = frameMat.maps;   // not "glassy": no room traced behind a lamp
    if (!fittingsGlass.empty()) out.boxes.push_back({std::move(fittingsGlass), lampGlass});
    if (!cornices.empty()) out.boxes.push_back({std::move(cornices), corniceMat});
    if (!panes.empty()) {
        out.boxes.push_back({std::move(panes), glass, 0.9f});
        out.boxes.push_back({std::move(frames), frameMat});
        out.boxes.push_back({std::move(sills), sill});
    }
    return out;
}

} // namespace game::scene
