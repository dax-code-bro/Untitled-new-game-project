// LE.Shapes, ported from engine/src/30-geometry.js.
//
// Each builder mirrors its JS counterpart statement for statement, including
// the order of floating-point operations, so the float32 output matches the
// JS output to the last bit in practice (the parity test measures this).
//
// ONE DELIBERATE DEVIATION: winding. The JS renderer culls back faces with the
// default counter-clockwise front face, yet the JS cylinder, cone, torus and
// the top/bottom faces of box are wound clockwise as seen from outside, so the
// JS draws them inside-out (outer faces culled, far inner faces lit with
// normals pointing away). Here those triangles are emitted with their last two
// indices swapped -- the same triangle, same vertices, same diagonal, facing
// the way its normals do. Tangents are unaffected: reversing a triangle negates
// both the UV determinant and the edge terms, so T and B come out identical.
#include "geometry/Shapes.hpp"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "geometry/Noise.hpp"

namespace game::geometry {

namespace {

constexpr double PI = std::numbers::pi;   // JS Math.PI
constexpr double TAU = std::numbers::pi * 2; // JS Math.PI * 2

// Counts the JS divides by. The JS produces NaN geometry for 0; clamp instead.
int atLeast1(int n) { return std::max(1, n); }

// The JS Geometry while it is still being built: plain double arrays.
struct Builder {
    std::vector<double> P, N, U;
    std::vector<uint32_t> I;
    // Emit triangles reversed relative to the JS (see the winding note above).
    bool rewind = false;

    uint32_t count() const { return static_cast<uint32_t>(P.size() / 3); }

    uint32_t vert(double px, double py, double pz, double nx, double ny, double nz, double u, double v) {
        P.insert(P.end(), {px, py, pz});
        N.insert(N.end(), {nx, ny, nz});
        U.insert(U.end(), {u, v});
        return count() - 1;
    }
    void tri(uint32_t a, uint32_t b, uint32_t c) {
        if (rewind) I.insert(I.end(), {a, c, b});
        else I.insert(I.end(), {a, b, c});
    }
    // JS quad(a,b,c,d) = tri(a,b,c) + tri(a,c,d).
    void quad(uint32_t a, uint32_t b, uint32_t c, uint32_t d) { tri(a, b, c); tri(a, c, d); }

    // Split every triangle into its own vertices with a flat face normal.
    void facetize() {
        std::vector<double> np, nn, nu;
        std::vector<uint32_t> ni;
        np.reserve(I.size() * 3); nn.reserve(I.size() * 3); nu.reserve(I.size() * 2); ni.reserve(I.size());
        for (std::size_t i = 0; i + 2 < I.size(); i += 3) {
            const uint32_t a = I[i], b = I[i + 1], c = I[i + 2];
            const double ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
            const double bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
            const double cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
            const double ux = bx - ax, uy = by - ay, uz = bz - az;
            const double vx = cx - ax, vy = cy - ay, vz = cz - az;
            double nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            double l = std::sqrt(nx * nx + ny * ny + nz * nz);
            if (l == 0 || std::isnan(l)) l = 1; // JS: `|| 1`
            nx /= l; ny /= l; nz /= l;
            const uint32_t base = static_cast<uint32_t>(np.size() / 3);
            np.insert(np.end(), {ax, ay, az, bx, by, bz, cx, cy, cz});
            nn.insert(nn.end(), {nx, ny, nz, nx, ny, nz, nx, ny, nz});
            if (!U.empty()) nu.insert(nu.end(), {U[a * 2], U[a * 2 + 1], U[b * 2], U[b * 2 + 1], U[c * 2], U[c * 2 + 1]});
            else nu.insert(nu.end(), {0, 0, 1, 0, 0, 1});
            ni.insert(ni.end(), {base, base + 1, base + 2});
        }
        P = std::move(np); N = std::move(nn); U = std::move(nu); I = std::move(ni);
    }

    // Geometry.finalize(): float32 conversion, drop degenerates, tangents, bounds.
    MeshData finalize() {
        MeshData m;
        const std::size_t n = count();
        m.positions.resize(n);
        m.normals.resize(n);
        m.uvs.resize(n);
        for (std::size_t i = 0; i < n; ++i) {
            m.positions[i] = glm::vec3(static_cast<float>(P[i * 3]), static_cast<float>(P[i * 3 + 1]), static_cast<float>(P[i * 3 + 2]));
            m.normals[i] = glm::vec3(static_cast<float>(N[i * 3]), static_cast<float>(N[i * 3 + 1]), static_cast<float>(N[i * 3 + 2]));
            m.uvs[i] = glm::vec2(static_cast<float>(U[i * 2]), static_cast<float>(U[i * 2 + 1]));
        }
        m.indices = std::move(I);
        dropDegenerateTriangles(m);
        computeTangents(m);
        computeBounds(m);
        return m;
    }
};

double orOne(double l) { return (l == 0 || std::isnan(l)) ? 1.0 : l; } // JS `x || 1`

} // namespace

MeshData box(double sx, double sy, double sz, int segments) {
    segments = atLeast1(segments);
    Builder g;
    const double hx = sx / 2, hy = sy / 2, hz = sz / 2;
    struct Face { double n[3]; double d; double uA[3]; double vA[3]; double uS, vS; };
    const Face faces[6] = {
        {{1, 0, 0}, hx, {0, 0, -1}, {0, 1, 0}, sz, sy},
        {{-1, 0, 0}, hx, {0, 0, 1}, {0, 1, 0}, sz, sy},
        {{0, 1, 0}, hy, {1, 0, 0}, {0, 0, 1}, sx, sz},
        {{0, -1, 0}, hy, {1, 0, 0}, {0, 0, -1}, sx, sz},
        {{0, 0, 1}, hz, {1, 0, 0}, {0, 1, 0}, sx, sy},
        {{0, 0, -1}, hz, {-1, 0, 0}, {0, 1, 0}, sx, sy},
    };
    for (int fi = 0; fi < 6; ++fi) {
        const Face& f = faces[fi];
        // uA x vA points INTO the box for the +Y and -Y faces in the JS table.
        g.rewind = (fi == 2 || fi == 3);
        const uint32_t base = g.count();
        for (int j = 0; j <= segments; ++j) {
            for (int i = 0; i <= segments; ++i) {
                const double fu = static_cast<double>(i) / segments - 0.5, fv = static_cast<double>(j) / segments - 0.5;
                g.vert(f.n[0] * f.d + f.uA[0] * fu * f.uS + f.vA[0] * fv * f.vS,
                       f.n[1] * f.d + f.uA[1] * fu * f.uS + f.vA[1] * fv * f.vS,
                       f.n[2] * f.d + f.uA[2] * fu * f.uS + f.vA[2] * fv * f.vS,
                       f.n[0], f.n[1], f.n[2],
                       (static_cast<double>(i) / segments) * f.uS, (static_cast<double>(j) / segments) * f.vS);
            }
        }
        const uint32_t row = static_cast<uint32_t>(segments + 1);
        for (int j = 0; j < segments; ++j) {
            for (int i = 0; i < segments; ++i) {
                const uint32_t a = base + j * row + i;
                g.quad(a, a + 1, a + row + 1, a + row);
            }
        }
    }
    return g.finalize();
}

MeshData sphere(double radius, int rings, int sectors) {
    rings = atLeast1(rings);
    sectors = atLeast1(sectors);
    Builder g;
    for (int r = 0; r <= rings; ++r) {
        const double phi = (static_cast<double>(r) / rings) * PI;
        const double sp = std::sin(phi), cp = std::cos(phi);
        for (int s = 0; s <= sectors; ++s) {
            const double theta = (static_cast<double>(s) / sectors) * TAU;
            const double st = std::sin(theta), ct = std::cos(theta);
            const double nx = sp * ct, ny = cp, nz = sp * st;
            g.vert(nx * radius, ny * radius, nz * radius, nx, ny, nz,
                   static_cast<double>(s) / sectors * 2, static_cast<double>(r) / rings);
        }
    }
    const uint32_t row = static_cast<uint32_t>(sectors + 1);
    for (int r = 0; r < rings; ++r) {
        for (int s = 0; s < sectors; ++s) {
            const uint32_t a = r * row + s;
            // Skip the degenerate triangles at each pole.
            if (r != 0) g.tri(a, a + 1, a + row);
            if (r != rings - 1) g.tri(a + 1, a + row + 1, a + row);
        }
    }
    return g.finalize();
}

MeshData cylinder(double radius, double height, int sectors, bool capped) {
    sectors = atLeast1(sectors);
    Builder g;
    g.rewind = true; // JS winds every triangle of this shape clockwise-from-outside
    const double hh = height / 2;
    for (int s = 0; s <= sectors; ++s) {
        const double th = (static_cast<double>(s) / sectors) * TAU;
        const double ct = std::cos(th), st = std::sin(th);
        g.vert(ct * radius, -hh, st * radius, ct, 0, st, static_cast<double>(s) / sectors * 2, 0);
        g.vert(ct * radius, hh, st * radius, ct, 0, st, static_cast<double>(s) / sectors * 2, height);
    }
    for (int s = 0; s < sectors; ++s) {
        const uint32_t a = static_cast<uint32_t>(s * 2);
        g.quad(a, a + 2, a + 3, a + 1);
    }
    if (capped) {
        for (const int dir : {1, -1}) {
            const uint32_t center = g.vert(0, hh * dir, 0, 0, dir, 0, 0.5, 0.5);
            const uint32_t base = g.count();
            for (int s = 0; s <= sectors; ++s) {
                const double th = (static_cast<double>(s) / sectors) * TAU;
                g.vert(std::cos(th) * radius, hh * dir, std::sin(th) * radius, 0, dir, 0,
                       std::cos(th) * 0.5 + 0.5, std::sin(th) * 0.5 + 0.5);
            }
            for (int s = 0; s < sectors; ++s) {
                if (dir > 0) g.tri(center, base + s, base + s + 1);
                else g.tri(center, base + s + 1, base + s);
            }
        }
    }
    return g.finalize();
}

MeshData cone(double radius, double height, int sectors) {
    sectors = atLeast1(sectors);
    Builder g;
    g.rewind = true; // JS winds every triangle of this shape clockwise-from-outside
    const double hh = height / 2;
    const double slope = radius / height;
    for (int s = 0; s <= sectors; ++s) {
        const double th = (static_cast<double>(s) / sectors) * TAU;
        const double ct = std::cos(th), st = std::sin(th);
        // Normal tilts outward by the cone's slope.
        const double nl = std::sqrt(1 + slope * slope);
        g.vert(ct * radius, -hh, st * radius, ct / nl, slope / nl, st / nl, static_cast<double>(s) / sectors * 2, 0);
        g.vert(0, hh, 0, ct / nl, slope / nl, st / nl, static_cast<double>(s) / sectors * 2, 1);
    }
    for (int s = 0; s < sectors; ++s) {
        const uint32_t a = static_cast<uint32_t>(s * 2);
        g.tri(a, a + 2, a + 1);
    }
    const uint32_t center = g.vert(0, -hh, 0, 0, -1, 0, 0.5, 0.5);
    const uint32_t base = g.count();
    for (int s = 0; s <= sectors; ++s) {
        const double th = (static_cast<double>(s) / sectors) * TAU;
        g.vert(std::cos(th) * radius, -hh, std::sin(th) * radius, 0, -1, 0,
               std::cos(th) * 0.5 + 0.5, std::sin(th) * 0.5 + 0.5);
    }
    for (int s = 0; s < sectors; ++s) g.tri(center, base + s + 1, base + s);
    return g.finalize();
}

MeshData capsule(double radius, double height, int rings, int sectors) {
    rings = atLeast1(rings);
    sectors = atLeast1(sectors);
    Builder g;
    const double hh = std::max(0.0, height / 2 - radius);
    struct Row { double y, r, ny, nr; };
    std::vector<Row> rows;
    rows.reserve(static_cast<std::size_t>(rings + 1) * 2);
    for (int r = 0; r <= rings; ++r) {
        const double phi = (static_cast<double>(r) / rings) * (PI / 2);
        rows.push_back({hh + std::cos(phi) * radius, std::sin(phi) * radius, std::cos(phi), std::sin(phi)});
    }
    for (int r = rings; r >= 0; --r) {
        const double phi = (static_cast<double>(r) / rings) * (PI / 2);
        rows.push_back({-hh - std::cos(phi) * radius, std::sin(phi) * radius, -std::cos(phi), std::sin(phi)});
    }
    const uint32_t row = static_cast<uint32_t>(sectors + 1);
    const double rowCount = static_cast<double>(rows.size());
    for (std::size_t ri = 0; ri < rows.size(); ++ri) {
        const Row& rw = rows[ri];
        for (int s = 0; s <= sectors; ++s) {
            const double th = (static_cast<double>(s) / sectors) * TAU;
            const double ct = std::cos(th), st = std::sin(th);
            g.vert(ct * rw.r, rw.y, st * rw.r, ct * rw.nr, rw.ny, st * rw.nr,
                   static_cast<double>(s) / sectors * 2, static_cast<double>(ri) / rowCount * 2);
        }
    }
    for (std::size_t r = 0; r + 1 < rows.size(); ++r) {
        for (int s = 0; s < sectors; ++s) {
            const uint32_t a = static_cast<uint32_t>(r) * row + s;
            g.quad(a, a + 1, a + row + 1, a + row);
        }
    }
    return g.finalize();
}

MeshData plane(double width, double depth, int segX, int segZ, double uvScale) {
    segX = atLeast1(segX);
    segZ = atLeast1(segZ);
    Builder g;
    for (int z = 0; z <= segZ; ++z) {
        for (int x = 0; x <= segX; ++x) {
            const double fx = static_cast<double>(x) / segX, fz = static_cast<double>(z) / segZ;
            g.vert((fx - 0.5) * width, 0, (fz - 0.5) * depth,
                   0, 1, 0,
                   fx * width * uvScale, fz * depth * uvScale);
        }
    }
    const uint32_t row = static_cast<uint32_t>(segX + 1);
    for (int z = 0; z < segZ; ++z) {
        for (int x = 0; x < segX; ++x) {
            const uint32_t a = z * row + x;
            g.quad(a, a + row, a + row + 1, a + 1);
        }
    }
    return g.finalize();
}

MeshData torus(double radius, double tube, int rings, int sectors) {
    rings = atLeast1(rings);
    sectors = atLeast1(sectors);
    Builder g;
    g.rewind = true; // JS winds every triangle of this shape clockwise-from-outside
    for (int r = 0; r <= rings; ++r) {
        const double u = (static_cast<double>(r) / rings) * TAU;
        const double cu = std::cos(u), su = std::sin(u);
        for (int s = 0; s <= sectors; ++s) {
            const double v = (static_cast<double>(s) / sectors) * TAU;
            const double cv = std::cos(v), sv = std::sin(v);
            const double nx = cu * cv, ny = sv, nz = su * cv;
            g.vert((radius + tube * cv) * cu, tube * sv, (radius + tube * cv) * su, nx, ny, nz,
                   static_cast<double>(r) / rings * 3, static_cast<double>(s) / sectors);
        }
    }
    const uint32_t row = static_cast<uint32_t>(sectors + 1);
    for (int r = 0; r < rings; ++r) {
        for (int s = 0; s < sectors; ++s) {
            const uint32_t a = r * row + s;
            g.quad(a, a + row, a + row + 1, a + 1);
        }
    }
    return g.finalize();
}

MeshData terrain(double size, int segments, const HeightFn& heightFn, double uvScale) {
    segments = atLeast1(segments);
    const auto H = [&](double x, double z) { return heightFn ? heightFn(x, z) : 0.0; };
    Builder g;
    const double step = size / segments;
    const double h = step * 0.5;
    for (int z = 0; z <= segments; ++z) {
        for (int x = 0; x <= segments; ++x) {
            const double wx = (static_cast<double>(x) / segments - 0.5) * size;
            const double wz = (static_cast<double>(z) / segments - 0.5) * size;
            const double y = H(wx, wz);
            const double dx = H(wx + h, wz) - H(wx - h, wz);
            const double dz = H(wx, wz + h) - H(wx, wz - h);
            const double nx = -dx, ny = 2 * h, nz = -dz;
            const double l = orOne(std::sqrt(nx * nx + ny * ny + nz * nz));
            g.vert(wx, y, wz, nx / l, ny / l, nz / l, wx * uvScale, wz * uvScale);
        }
    }
    const uint32_t row = static_cast<uint32_t>(segments + 1);
    for (int z = 0; z < segments; ++z) {
        for (int x = 0; x < segments; ++x) {
            const uint32_t a = z * row + x;
            g.quad(a, a + row, a + row + 1, a + 1);
        }
    }
    return g.finalize();
}

MeshData rock(double radius, uint32_t seed, double detail) {
    const Noise noise(seed);
    Builder g;
    constexpr int rings = 14, sectors = 18;
    for (int r = 0; r <= rings; ++r) {
        const double phi = (static_cast<double>(r) / rings) * PI;
        const double sp = std::sin(phi), cp = std::cos(phi);
        for (int s = 0; s <= sectors; ++s) {
            const double th = (static_cast<double>(s) / sectors) * TAU;
            const double nx = sp * std::cos(th), ny = cp, nz = sp * std::sin(th);
            const double n = noise.fbm(nx * detail, ny * detail, nz * detail, 3);
            const double rr = radius * (1 + n * 0.35);
            g.vert(nx * rr, ny * rr, nz * rr, nx, ny, nz,
                   static_cast<double>(s) / sectors * 2, static_cast<double>(r) / rings);
        }
    }
    const uint32_t row = sectors + 1;
    for (int r = 0; r < rings; ++r) {
        for (int s = 0; s < sectors; ++s) {
            const uint32_t a = r * row + s;
            if (r != 0) g.tri(a, a + 1, a + row);
            if (r != rings - 1) g.tri(a + 1, a + row + 1, a + row);
        }
    }
    g.facetize();
    return g.finalize();
}

MeshData grassBlade(double height, double width, int segments) {
    segments = atLeast1(segments);
    Builder g;
    for (int i = 0; i <= segments; ++i) {
        const double t = static_cast<double>(i) / segments;
        const double w = width * (1 - t * 0.9);
        const double y = t * height;
        // Slight forward lean baked in so even still grass looks organic.
        const double z = t * t * height * 0.15;
        g.vert(-w, y, z, 0, 0.3, -1, 0, t);
        g.vert(w, y, z, 0, 0.3, -1, 1, t);
    }
    for (int i = 0; i < segments; ++i) {
        const uint32_t a = static_cast<uint32_t>(i * 2);
        g.quad(a, a + 2, a + 3, a + 1);
    }
    return g.finalize();
}

} // namespace game::geometry
