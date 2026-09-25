// Parity test: game::geometry (C++) against LE.Shapes (JS).
//
//   test_geometry_parity [dump.json]
//
// With no argument it regenerates <my_cpp_game>/build-geometry/geometry_dump.json
// by running tools/geometry_dump.js with node ($NODE, /opt/node22/bin/node or
// `node` on PATH), then reads it. Exit code 0 only if every case passes.
//
// Per case (all are hard requirements):
//   * vertex and index counts identical
//   * positions / normals / uvs within 1e-5 of the JS
//   * indices identical to the JS, triangle by triangle, EXCEPT that a
//     triangle the JS winds against its own normals must appear with its last
//     two indices swapped (the port's one deliberate deviation, see Shapes.hpp)
//     -- and no other triangle may be swapped
//   * bounds within 1e-5, tangents within 1e-5 of the JS (w identical)
//   * every C++ tangent unit length and orthogonal to its normal (1e-5)
//   * every tangent frame agrees with its triangles' UV directions
//   * all values finite
//   * closed shapes are watertight and consistently wound (after welding
//     coincident seam/pole vertices)
// Plus: Rng and Noise (which rock() depends on) reproduce the JS values.
#include "geometry/Noise.hpp"
#include "geometry/Shapes.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace fs = std::filesystem;
using namespace game::geometry;

// ---------------------------------------------------------------- tiny JSON
namespace {

struct JVal {
    enum class T { Null, Bool, Num, Str, Arr, Obj } t = T::Null;
    double num = 0;
    bool b = false;
    std::string str;
    std::vector<JVal> arr;
    std::vector<std::string> keys;
    std::vector<JVal> vals;

    const JVal* find(std::string_view k) const {
        for (std::size_t i = 0; i < keys.size(); ++i)
            if (keys[i] == k) return &vals[i];
        return nullptr;
    }
    const JVal& operator[](std::string_view k) const {
        const JVal* v = find(k);
        if (!v) throw std::runtime_error("missing JSON key: " + std::string(k));
        return *v;
    }
    // JSON.stringify writes NaN/Infinity as null; read that back as NaN.
    double asNum() const { return t == T::Num ? num : std::nan(""); }
};

class JParser {
public:
    explicit JParser(const std::string& s) : p_(s.data()), end_(s.data() + s.size()) {}
    JVal parse() {
        JVal v = value();
        ws();
        if (p_ != end_) fail("trailing data");
        return v;
    }

private:
    const char* p_;
    const char* end_;

    [[noreturn]] void fail(const char* what) { throw std::runtime_error(std::string("JSON parse error: ") + what); }
    void ws() { while (p_ < end_ && (*p_ == ' ' || *p_ == '\n' || *p_ == '\r' || *p_ == '\t')) ++p_; }
    bool lit(const char* s) {
        const std::size_t n = std::strlen(s);
        if (static_cast<std::size_t>(end_ - p_) >= n && std::memcmp(p_, s, n) == 0) { p_ += n; return true; }
        return false;
    }
    std::string string() {
        if (*p_ != '"') fail("expected string");
        ++p_;
        std::string out;
        while (p_ < end_ && *p_ != '"') {
            if (*p_ == '\\') {
                ++p_;
                if (p_ >= end_) fail("bad escape");
                switch (*p_) {
                    case 'n': out += '\n'; break;
                    case 't': out += '\t'; break;
                    case 'r': out += '\r'; break;
                    case 'b': out += '\b'; break;
                    case 'f': out += '\f'; break;
                    case 'u': out += '?'; p_ += 4; break; // not needed here
                    default: out += *p_; break;
                }
                ++p_;
            } else {
                out += *p_++;
            }
        }
        if (p_ >= end_) fail("unterminated string");
        ++p_;
        return out;
    }
    JVal value() {
        ws();
        if (p_ >= end_) fail("unexpected end");
        JVal v;
        const char c = *p_;
        if (c == '{') {
            v.t = JVal::T::Obj;
            ++p_;
            ws();
            if (*p_ == '}') { ++p_; return v; }
            for (;;) {
                ws();
                v.keys.push_back(string());
                ws();
                if (*p_ != ':') fail("expected ':'");
                ++p_;
                v.vals.push_back(value());
                ws();
                if (*p_ == ',') { ++p_; continue; }
                if (*p_ == '}') { ++p_; break; }
                fail("expected ',' or '}'");
            }
        } else if (c == '[') {
            v.t = JVal::T::Arr;
            ++p_;
            ws();
            if (*p_ == ']') { ++p_; return v; }
            for (;;) {
                v.arr.push_back(value());
                ws();
                if (*p_ == ',') { ++p_; continue; }
                if (*p_ == ']') { ++p_; break; }
                fail("expected ',' or ']'");
            }
        } else if (c == '"') {
            v.t = JVal::T::Str;
            v.str = string();
        } else if (lit("true")) {
            v.t = JVal::T::Bool; v.b = true;
        } else if (lit("false")) {
            v.t = JVal::T::Bool; v.b = false;
        } else if (lit("null")) {
            v.t = JVal::T::Null;
        } else {
            char* e = nullptr;
            v.t = JVal::T::Num;
            v.num = std::strtod(p_, &e);
            if (e == p_) fail("bad number");
            p_ = e;
        }
        return v;
    }
};

// ------------------------------------------------------------ case building

double heightWaves(double x, double z) {
    return std::sin(x * 0.15) * 3 + std::cos(z * 0.1) * 2 + std::sin((x + z) * 0.05) * 5;
}
double heightNoise(double x, double z) {
    static const Noise n11(11);
    return n11.fbm(x * 0.03, 0.5, z * 0.03, 5) * 12;
}
HeightFn heightFnByName(const std::string& name) {
    if (name == "flat") return [](double, double) { return 0.0; };
    if (name == "waves") return heightWaves;
    if (name == "noise") return heightNoise;
    throw std::runtime_error("unknown height function: " + name);
}

MeshData buildCase(const std::string& shape, const JVal& args) {
    const auto& a = args.arr;
    // No args: call with none, so the C++ default arguments are what is tested.
    if (a.empty()) {
        if (shape == "box") return box();
        if (shape == "sphere") return sphere();
        if (shape == "cylinder") return cylinder();
        if (shape == "cone") return cone();
        if (shape == "capsule") return capsule();
        if (shape == "plane") return plane();
        if (shape == "torus") return torus();
        if (shape == "terrain") return terrain();
        if (shape == "rock") return rock();
        if (shape == "grassBlade") return grassBlade();
        throw std::runtime_error("unknown shape " + shape);
    }
    auto need = [&](std::size_t n) {
        if (a.size() != n) throw std::runtime_error(shape + ": non-default cases must give all " + std::to_string(n) + " args");
    };
    auto D = [&](std::size_t i) { return a[i].num; };
    auto I = [&](std::size_t i) { return static_cast<int>(a[i].num); };
    if (shape == "box") { need(4); return box(D(0), D(1), D(2), I(3)); }
    if (shape == "sphere") { need(3); return sphere(D(0), I(1), I(2)); }
    if (shape == "cylinder") { need(4); return cylinder(D(0), D(1), I(2), a[3].b); }
    if (shape == "cone") { need(3); return cone(D(0), D(1), I(2)); }
    if (shape == "capsule") { need(4); return capsule(D(0), D(1), I(2), I(3)); }
    if (shape == "plane") { need(5); return plane(D(0), D(1), I(2), I(3), D(4)); }
    if (shape == "torus") { need(4); return torus(D(0), D(1), I(2), I(3)); }
    if (shape == "terrain") { need(4); return terrain(D(0), I(1), heightFnByName(a[2].str), D(3)); }
    if (shape == "rock") { need(3); return rock(D(0), static_cast<uint32_t>(static_cast<int64_t>(D(1))), D(2)); }
    if (shape == "grassBlade") { need(3); return grassBlade(D(0), D(1), I(2)); }
    throw std::runtime_error("unknown shape " + shape);
}

bool isClosed(const std::string& shape, const JVal& args) {
    if (shape == "plane" || shape == "terrain" || shape == "grassBlade") return false;
    if (shape == "cylinder" && args.arr.size() >= 4 && !args.arr[3].b) return false;
    return true;
}

// ------------------------------------------------------------- comparisons

struct Diff {
    double maxAbs = 0;
    std::size_t over = 0;     // entries beyond tolerance (or non-finite mismatch)
    std::size_t bitExact = 0; // entries whose float equals the JS float exactly
    std::size_t total = 0;
    bool sizeMismatch = false;
};

template <int N, typename V>
Diff compareVec(const std::vector<V>& cpp, const JVal& js, double tol) {
    Diff d;
    d.total = js.arr.size();
    if (js.arr.size() != cpp.size() * N) { d.sizeMismatch = true; return d; }
    for (std::size_t i = 0; i < cpp.size(); ++i) {
        for (int k = 0; k < N; ++k) {
            const double c = static_cast<double>(cpp[i][k]);
            const double j = js.arr[i * N + k].asNum();
            if (static_cast<float>(j) == static_cast<float>(c)) ++d.bitExact;
            const double e = std::abs(c - j);
            if (!(e <= tol)) { ++d.over; if (std::isnan(e)) { d.maxAbs = INFINITY; continue; } }
            d.maxAbs = std::max(d.maxAbs, e);
        }
    }
    return d;
}

bool allFinite(const MeshData& m) {
    auto fin = [](float f) { return std::isfinite(f); };
    for (auto& p : m.positions) if (!fin(p.x) || !fin(p.y) || !fin(p.z)) return false;
    for (auto& p : m.normals) if (!fin(p.x) || !fin(p.y) || !fin(p.z)) return false;
    for (auto& p : m.uvs) if (!fin(p.x) || !fin(p.y)) return false;
    for (auto& p : m.tangents) if (!fin(p.x) || !fin(p.y) || !fin(p.z) || !fin(p.w)) return false;
    for (uint32_t i : m.indices) if (i >= m.positions.size()) return false;
    return true;
}

struct Topology {
    std::size_t welded = 0;       // distinct positions after welding
    std::size_t openEdges = 0;    // directed edges with no opposite partner
    std::size_t overShared = 0;   // directed edges used more than once
    std::size_t collapsed = 0;    // triangles that collapse when welded
    std::size_t flipped = 0;      // triangles wound against their vertex normals
    bool watertight() const { return openEdges == 0 && overShared == 0 && collapsed == 0; }
};

Topology topology(const MeshData& m, double eps = 1e-6) {
    Topology t;
    const std::size_t n = m.positions.size();
    std::vector<uint32_t> order(n), rep(n);
    for (uint32_t i = 0; i < n; ++i) order[i] = i;
    std::sort(order.begin(), order.end(), [&](uint32_t a, uint32_t b) { return m.positions[a].x < m.positions[b].x; });
    for (std::size_t oi = 0; oi < n; ++oi) {
        const uint32_t i = order[oi];
        rep[i] = i;
        for (std::size_t oj = oi; oj-- > 0;) {
            const uint32_t j = order[oj];
            if (m.positions[i].x - m.positions[j].x > eps) break;
            const glm::vec3 d = glm::abs(m.positions[i] - m.positions[j]);
            if (d.x <= eps && d.y <= eps && d.z <= eps && rep[j] == j) { rep[i] = j; break; }
        }
        if (rep[i] == i) ++t.welded;
    }
    std::map<std::pair<uint32_t, uint32_t>, int> edges;
    for (std::size_t k = 0; k + 2 < m.indices.size(); k += 3) {
        const uint32_t ia = m.indices[k], ib = m.indices[k + 1], ic = m.indices[k + 2];
        const uint32_t a = rep[ia], b = rep[ib], c = rep[ic];
        const glm::dvec3 pa(m.positions[ia]), pb(m.positions[ib]), pc(m.positions[ic]);
        const glm::dvec3 fn = glm::cross(pb - pa, pc - pa);
        const glm::dvec3 vn = glm::dvec3(m.normals[ia]) + glm::dvec3(m.normals[ib]) + glm::dvec3(m.normals[ic]);
        if (glm::dot(fn, vn) < 0) ++t.flipped;
        if (a == b || b == c || a == c) { ++t.collapsed; continue; }
        ++edges[{a, b}]; ++edges[{b, c}]; ++edges[{c, a}];
    }
    for (const auto& [e, cnt] : edges) {
        if (cnt > 1) ++t.overShared;
        if (!edges.count({e.second, e.first})) ++t.openEdges;
    }
    return t;
}

// Does each vertex's tangent frame agree with the UV directions of the
// triangles that use it? T must point along +u and w must give +v.
struct FrameReport { std::size_t checked = 0, badDir = 0, badHand = 0; };
FrameReport tangentFrames(const MeshData& m) {
    FrameReport r;
    for (std::size_t k = 0; k + 2 < m.indices.size(); k += 3) {
        const uint32_t id[3] = {m.indices[k], m.indices[k + 1], m.indices[k + 2]};
        const glm::dvec3 p0(m.positions[id[0]]), p1(m.positions[id[1]]), p2(m.positions[id[2]]);
        const glm::dvec2 u0(m.uvs[id[0]]), u1(m.uvs[id[1]]), u2(m.uvs[id[2]]);
        const glm::dvec3 e1 = p1 - p0, e2 = p2 - p0;
        const glm::dvec2 d1 = u1 - u0, d2 = u2 - u0;
        const double det = d1.x * d2.y - d2.x * d1.y;
        if (std::abs(det) < 1e-12) continue;
        const glm::dvec3 Tf = (e1 * d2.y - e2 * d1.y) / det;
        const glm::dvec3 Bf = (e2 * d1.x - e1 * d2.x) / det;
        for (const uint32_t v : id) {
            glm::dvec3 n = glm::normalize(glm::dvec3(m.normals[v]));
            const glm::dvec3 tp = Tf - n * glm::dot(n, Tf);
            if (glm::length(tp) < 1e-9 * (glm::length(Tf) + 1e-30)) continue;
            const glm::dvec4 t(m.tangents[v]);
            const glm::dvec3 T(t);
            ++r.checked;
            if (glm::dot(T, tp) <= 0) ++r.badDir;
            const double hand = glm::dot(glm::cross(n, T), Bf);
            if (std::abs(hand) > 1e-12 && ((hand < 0) != (t.w < 0))) ++r.badHand;
        }
    }
    return r;
}

struct IndexReport {
    std::size_t triangles = 0;
    std::size_t identical = 0;             // same three indices, same order
    std::size_t rewound = 0;               // JS (a,b,c) emitted as (a,c,b)
    std::size_t mismatched = 0;            // anything else, or a count mismatch
    std::size_t jsInverted = 0;            // JS triangles wound against the JS normals
    std::size_t rewoundButJsOk = 0;        // rewound although the JS winding was right
    std::size_t jsInvertedNotRewound = 0;  // JS winding wrong but copied verbatim
    bool ok() const { return mismatched == 0 && rewoundButJsOk == 0 && jsInvertedNotRewound == 0; }
    std::string label() const {
        if (mismatched) return "BAD " + std::to_string(mismatched);
        if (!rewound) return "=" + std::to_string(identical);
        return "=" + std::to_string(identical) + " r" + std::to_string(rewound);
    }
};

IndexReport compareIndices(const MeshData& m, const JVal& c) {
    IndexReport r;
    const auto& ji = c["indices"].arr;
    const auto& jp = c["positions"].arr;
    const auto& jn = c["normals"].arr;
    r.triangles = ji.size() / 3;
    if (ji.size() != m.indices.size()) { r.mismatched = std::max(ji.size(), m.indices.size()) / 3; return r; }
    auto P = [&](uint32_t i) { return glm::dvec3(jp[i * 3].num, jp[i * 3 + 1].num, jp[i * 3 + 2].num); };
    auto N = [&](uint32_t i) { return glm::dvec3(jn[i * 3].asNum(), jn[i * 3 + 1].asNum(), jn[i * 3 + 2].asNum()); };
    for (std::size_t k = 0; k + 2 < ji.size(); k += 3) {
        const uint32_t a = static_cast<uint32_t>(ji[k].num), b = static_cast<uint32_t>(ji[k + 1].num), cc = static_cast<uint32_t>(ji[k + 2].num);
        // Is the JS triangle wound against its own vertex normals? Decided
        // from the JS data alone.
        const glm::dvec3 fn = glm::cross(P(b) - P(a), P(cc) - P(a));
        const bool inverted = glm::dot(fn, N(a) + N(b) + N(cc)) < 0;
        if (inverted) ++r.jsInverted;
        const uint32_t x = m.indices[k], y = m.indices[k + 1], z = m.indices[k + 2];
        if (x == a && y == b && z == cc) {
            ++r.identical;
            if (inverted) ++r.jsInvertedNotRewound;
        } else if (x == a && y == cc && z == b) {
            ++r.rewound;
            if (!inverted) ++r.rewoundButJsOk;
        } else {
            ++r.mismatched;
        }
    }
    return r;
}

template <typename F>
double usPerCall(F&& fn) {
    for (int i = 0; i < 3; ++i) fn();
    using clk = std::chrono::steady_clock;
    const auto t0 = clk::now();
    auto t1 = t0;
    int n = 0;
    while (n < 5 || std::chrono::duration<double>(t1 - t0).count() < 0.04) {
        fn();
        ++n;
        t1 = clk::now();
    }
    return std::chrono::duration<double, std::micro>(t1 - t0).count() / n;
}

std::string readFile(const fs::path& p) {
    std::ifstream f(p, std::ios::binary);
    if (!f) throw std::runtime_error("cannot open " + p.string());
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

fs::path projectRoot() { return fs::path(__FILE__).parent_path().parent_path(); }

bool regenerate(const fs::path& out) {
    std::vector<std::string> nodes;
    if (const char* env = std::getenv("NODE")) nodes.emplace_back(env);
    nodes.emplace_back("/opt/node22/bin/node");
    nodes.emplace_back("node");
    const fs::path script = projectRoot() / "tools" / "geometry_dump.js";
    for (const auto& node : nodes) {
        const std::string cmd = "\"" + node + "\" \"" + script.string() + "\" \"" + out.string() + "\"";
        if (std::system(cmd.c_str()) == 0) return true;
    }
    return false;
}

} // namespace

int main(int argc, char** argv) {
    constexpr double TOL = 1e-5;
    fs::path jsonPath;
    if (argc > 1) {
        jsonPath = argv[1];
    } else {
        jsonPath = projectRoot() / "build-geometry" / "geometry_dump.json";
        if (!regenerate(jsonPath)) {
            if (!fs::exists(jsonPath)) {
                std::fprintf(stderr, "could not run tools/geometry_dump.js and %s does not exist\n", jsonPath.string().c_str());
                return 2;
            }
            std::fprintf(stderr, "WARNING: node unavailable, using existing %s\n", jsonPath.string().c_str());
        }
    }

    JVal doc;
    try {
        doc = JParser(readFile(jsonPath)).parse();
    } catch (const std::exception& e) {
        std::fprintf(stderr, "%s\n", e.what());
        return 2;
    }

    bool allPass = true;
    int failures = 0;

    // ---- Rng / Noise ------------------------------------------------------
    {
        std::size_t rngTotal = 0, rngExact = 0;
        for (const JVal& r : doc["rng"].arr) {
            Rng rng(static_cast<uint32_t>(static_cast<int64_t>(r["seed"].num)));
            for (const JVal& v : r["values"].arr) {
                ++rngTotal;
                if (rng.next() == v.num) ++rngExact;
            }
        }
        double noiseMax = 0;
        std::size_t noiseN = 0;
        std::map<uint32_t, Noise> noises;
        for (const JVal& s : doc["noise"].arr) {
            const uint32_t seed = static_cast<uint32_t>(static_cast<int64_t>(s["seed"].num));
            auto it = noises.try_emplace(seed, seed).first;
            const auto& p = s["p"].arr;
            const std::string& fn = s["fn"].str;
            double v = 0;
            if (fn == "noise3") v = it->second.noise3(p[0].num, p[1].num, p[2].num);
            else if (fn == "fbm3") v = it->second.fbm(p[0].num, p[1].num, p[2].num, 3);
            else v = it->second.fbm(p[0].num, p[1].num, p[2].num, 5);
            noiseMax = std::max(noiseMax, std::abs(v - s["v"].num));
            ++noiseN;
        }
        const bool ok = rngExact == rngTotal && noiseMax <= 1e-12;
        std::printf("[%s] Rng: %zu/%zu values bit-identical | Noise: %zu samples, max |diff| %.3e\n",
                    ok ? "PASS" : "FAIL", rngExact, rngTotal, noiseN, noiseMax);
        if (!ok) { allPass = false; ++failures; }
    }

    // ---- the checks themselves must catch injected faults ------------------
    {
        std::vector<std::string> missed;
        {
            MeshData m = box();
            m.tangents[0] = glm::vec4(1, 1, 0, 1);
            if (checkTangents(m).badLength == 0) missed.push_back("non-unit tangent");
            m = box();
            m.tangents[0] = glm::vec4(m.normals[0], 1.0f);
            if (checkTangents(m).notOrthogonal == 0) missed.push_back("tangent parallel to normal");
            m = box();
            m.tangents[0].w = 0.5f;
            if (checkTangents(m).badHandedness == 0) missed.push_back("bad handedness");
        }
        {
            MeshData m = plane(4, 4, 2, 2, 1);
            m.tangents[4] = -m.tangents[4];
            m.tangents[4].w = -m.tangents[4].w;
            if (tangentFrames(m).badDir == 0) missed.push_back("tangent against +u");
            m = plane(4, 4, 2, 2, 1);
            m.tangents[4].w = -m.tangents[4].w;
            if (tangentFrames(m).badHand == 0) missed.push_back("handedness against +v");
        }
        {
            MeshData m = sphere(0.5, 8, 12);
            std::swap(m.indices[30], m.indices[31]);
            const Topology t = topology(m);
            if (t.flipped == 0 || t.watertight()) missed.push_back("one reversed triangle");
            m = sphere(0.5, 8, 12);
            m.indices.resize(m.indices.size() - 3);
            if (topology(m).openEdges == 0) missed.push_back("missing triangle");
        }
        const bool ok = missed.empty();
        std::printf("[%s] self-test: injected tangent/frame/winding/topology faults %s",
                    ok ? "PASS" : "FAIL", ok ? "all detected\n" : "NOT detected:");
        for (auto& w : missed) std::printf(" [%s]", w.c_str());
        if (!ok) { std::printf("\n"); allPass = false; ++failures; }
    }

    // ---- shapes -----------------------------------------------------------
    std::printf("\n%-34s %-6s %11s %11s | %-9s %-9s %-9s %-4s %-9s %-9s | %-17s | %-22s | %s\n",
                "case", "result", "verts", "indices", "pos", "nrm", "uv", "idx", "bounds", "tan(js)",
                "tan ortho |len|dot", "topology", "C++ us  (JS us)  speedup");
    double totalCpp = 0, totalJs = 0;
    std::size_t totalBitExact = 0, totalScalars = 0;
    std::size_t idxIdentical = 0, idxRewound = 0, idxMismatched = 0, idxTotal = 0;
    for (const JVal& c : doc["cases"].arr) {
        const std::string& name = c["name"].str;
        const std::string& shape = c["shape"].str;
        const JVal& args = c["args"];
        std::vector<std::string> why;

        MeshData m;
        try {
            m = buildCase(shape, args);
        } catch (const std::exception& e) {
            std::printf("%-34s FAIL   %s\n", name.c_str(), e.what());
            allPass = false; ++failures;
            continue;
        }

        const auto jsV = static_cast<std::size_t>(c["vertexCount"].num);
        const auto jsI = static_cast<std::size_t>(c["indexCount"].num);
        if (m.vertexCount() != jsV) why.push_back("vertex count");
        if (m.indices.size() != jsI) why.push_back("index count");

        const Diff dp = compareVec<3>(m.positions, c["positions"], TOL);
        const Diff dn = compareVec<3>(m.normals, c["normals"], TOL);
        const Diff du = compareVec<2>(m.uvs, c["uvs"], TOL);
        const Diff dt = compareVec<4>(m.tangents, c["tangents"], TOL);
        if (dp.sizeMismatch || dp.over) why.push_back("positions");
        if (dn.sizeMismatch || dn.over) why.push_back("normals");
        if (du.sizeMismatch || du.over) why.push_back("uvs");
        if (dt.sizeMismatch || dt.over) why.push_back("tangents vs JS");
        totalBitExact += dp.bitExact + dn.bitExact + du.bitExact;
        totalScalars += dp.total + dn.total + du.total;

        // Indices: every C++ triangle must be the JS triangle, either verbatim
        // or -- only where the JS winds it against its own normals -- with its
        // last two indices swapped (the deliberate winding fix).
        const IndexReport ir = compareIndices(m, c);
        if (!ir.ok()) why.push_back("indices");
        idxIdentical += ir.identical; idxRewound += ir.rewound; idxMismatched += ir.mismatched; idxTotal += ir.triangles;

        double db = 0;
        for (int k = 0; k < 3; ++k) {
            db = std::max(db, std::abs(static_cast<double>(m.boundsMin[k]) - c["boundsMin"].arr[k].asNum()));
            db = std::max(db, std::abs(static_cast<double>(m.boundsMax[k]) - c["boundsMax"].arr[k].asNum()));
        }
        if (!(db <= TOL)) why.push_back("bounds");

        const TangentReport tr = checkTangents(m, TOL);
        if (!tr.ok()) why.push_back("tangent orthonormality");
        const FrameReport fr = tangentFrames(m);
        if (fr.badDir || fr.badHand) why.push_back("tangent frame vs UVs");
        if (!allFinite(m)) why.push_back("non-finite/out-of-range");

        const Topology topo = topology(m);
        const bool closed = isClosed(shape, args);
        if (closed && !topo.watertight()) why.push_back("not watertight");
        if (topo.flipped) why.push_back("winding vs normals");

        const double cppUs = usPerCall([&] { volatile auto n = buildCase(shape, args).indices.size(); (void)n; });
        const double jsUs = c["jsMsPerCall"].num * 1000.0;
        totalCpp += cppUs;
        totalJs += jsUs;

        const bool pass = why.empty();
        if (!pass) { allPass = false; ++failures; }

        char topoStr[64];
        if (closed) std::snprintf(topoStr, sizeof topoStr, "closed %s flip %zu", topo.watertight() ? "watertight" : "OPEN", topo.flipped);
        else std::snprintf(topoStr, sizeof topoStr, "open b%zu flip %zu", topo.openEdges, topo.flipped);

        std::printf("%-34s %-6s %5zu/%-5zu %5zu/%-5zu | %-9.2e %-9.2e %-9.2e %-13s %-9.2e %-9.2e | %-8.1e %-8.1e | %-26s | %8.1f (%8.1f) %5.1fx\n",
                    name.c_str(), pass ? "PASS" : "FAIL", m.vertexCount(), jsV, m.indices.size(), jsI,
                    dp.maxAbs, dn.maxAbs, du.maxAbs, ir.label().c_str(), db, dt.maxAbs,
                    tr.maxLengthError, tr.maxDot, topoStr, cppUs, jsUs, jsUs / cppUs);
        if (!pass) {
            std::printf("    failed:");
            for (auto& w : why) std::printf(" [%s]", w.c_str());
            std::printf("  (over-tol pos %zu nrm %zu uv %zu tan %zu, idx mismatched tris %zu rewound-but-JS-ok %zu JS-inverted-not-rewound %zu, tangent badLen %zu notOrtho %zu badW %zu, frame badDir %zu badHand %zu of %zu, open %zu over %zu collapsed %zu)\n",
                        dp.over, dn.over, du.over, dt.over, ir.mismatched, ir.rewoundButJsOk, ir.jsInvertedNotRewound, tr.badLength, tr.notOrthogonal, tr.badHandedness,
                        fr.badDir, fr.badHand, fr.checked, topo.openEdges, topo.overShared, topo.collapsed);
        }
    }

    std::printf("\nindices: %zu of %zu triangles identical to the JS, %zu rewound (all of them, and only them, JS triangles wound against the JS normals), %zu mismatched\n",
                idxIdentical, idxTotal, idxRewound, idxMismatched);
    std::printf("positions/normals/uvs: %zu of %zu float values bit-identical to the JS (%.4f%%)\n",
                totalBitExact, totalScalars, totalScalars ? 100.0 * totalBitExact / totalScalars : 0.0);
    std::printf("total generation time, all cases: C++ %.1f us vs JS %.1f us (%.1fx)\n", totalCpp, totalJs, totalJs / totalCpp);
    std::printf("\nOVERALL: %s (%d failing check group%s)\n", allPass ? "PASS" : "FAIL", failures, failures == 1 ? "" : "s");
    return allPass ? 0 : 1;
}
