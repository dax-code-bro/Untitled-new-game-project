// dropDegenerateTriangles / computeTangents / computeBounds, ported from the
// Geometry class in engine/src/30-geometry.js.
#include "geometry/Shapes.hpp"
#include <stdexcept>

#include <algorithm>
#include <cmath>
#include <limits>

namespace game::geometry {

namespace {
// The ops are public, so an external caller can hand them inconsistent
// arrays; the JS would compute NaN there, the port must not read past an end.
void requireConsistent(const MeshData& m, bool needAttributes) {
    const std::size_t nv = m.positions.size();
    for (uint32_t i : m.indices)
        if (i >= nv) throw std::out_of_range("MeshData: index past the end of positions");
    if (needAttributes && (m.normals.size() != nv || m.uvs.size() != nv))
        throw std::invalid_argument("MeshData: normals/uvs must have one entry per position");
}
} // namespace

void dropDegenerateTriangles(MeshData& m) {
    const auto& P = m.positions;
    const auto& I = m.indices;
    if (I.empty() || P.empty()) return;
    requireConsistent(m, false);
    std::vector<uint32_t> keep;
    keep.reserve(I.size());
    for (std::size_t i = 0; i + 2 < I.size(); i += 3) {
        // Double arithmetic on float32 positions, as the JS does after finalize().
        const glm::dvec3 a(P[I[i]]), b(P[I[i + 1]]), c(P[I[i + 2]]);
        const double ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
        const double vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        const double nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (nx * nx + ny * ny + nz * nz < 1e-24) continue;
        keep.push_back(I[i]);
        keep.push_back(I[i + 1]);
        keep.push_back(I[i + 2]);
    }
    if (keep.size() != I.size()) m.indices = std::move(keep);
}

void computeTangents(MeshData& m) {
    requireConsistent(m, true);
    const std::size_t nv = m.positions.size();
    const auto& P = m.positions;
    const auto& U = m.uvs;
    const auto& N = m.normals;
    const auto& I = m.indices;

    // The JS accumulates into Float32Arrays: every += is a double add rounded
    // to float, which acc() below reproduces.
    std::vector<float> tan(nv * 3, 0.0f), bit(nv * 3, 0.0f);

    for (std::size_t i = 0; i + 2 < I.size(); i += 3) {
        const uint32_t i0 = I[i], i1 = I[i + 1], i2 = I[i + 2];
        if (i0 >= nv || i1 >= nv || i2 >= nv) continue;
        const double x0 = P[i0].x, y0 = P[i0].y, z0 = P[i0].z;
        const double e1x = P[i1].x - x0, e1y = P[i1].y - y0, e1z = P[i1].z - z0;
        const double e2x = P[i2].x - x0, e2y = P[i2].y - y0, e2z = P[i2].z - z0;
        const double du1 = static_cast<double>(U[i1].x) - U[i0].x, dv1 = static_cast<double>(U[i1].y) - U[i0].y;
        const double du2 = static_cast<double>(U[i2].x) - U[i0].x, dv2 = static_cast<double>(U[i2].y) - U[i0].y;
        const double det = du1 * dv2 - du2 * dv1;
        // Degenerate UVs (seams, poles) contribute nothing rather than NaN.
        if (std::abs(det) < 1e-12) continue;
        const double r = 1 / det;
        const double tx = (e1x * dv2 - e2x * dv1) * r, ty = (e1y * dv2 - e2y * dv1) * r, tz = (e1z * dv2 - e2z * dv1) * r;
        const double bx = (e2x * du1 - e1x * du2) * r, by = (e2y * du1 - e1y * du2) * r, bz = (e2z * du1 - e1z * du2) * r;
        const auto acc = [](float& f, double d) { f = static_cast<float>(static_cast<double>(f) + d); };
        for (const uint32_t idx : {i0, i1, i2}) {
            acc(tan[idx * 3], tx); acc(tan[idx * 3 + 1], ty); acc(tan[idx * 3 + 2], tz);
            acc(bit[idx * 3], bx); acc(bit[idx * 3 + 1], by); acc(bit[idx * 3 + 2], bz);
        }
    }

    m.tangents.assign(nv, glm::vec4(0.0f));
    for (std::size_t i = 0; i < nv; ++i) {
        double nx = N[i].x, ny = N[i].y, nz = N[i].z;
        // Deviation from the JS: Gram-Schmidt against the NORMALISED normal.
        // The JS projects against the stored normal, which only yields an
        // orthogonal tangent when that normal is unit length (grassBlade's
        // (0, 0.3, -1) is not). For unit normals the result is identical.
        const double nl = std::sqrt(nx * nx + ny * ny + nz * nz);
        if (nl > 1e-30) { nx /= nl; ny /= nl; nz /= nl; }
        double tx = tan[i * 3], ty = tan[i * 3 + 1], tz = tan[i * 3 + 2];
        const double d = nx * tx + ny * ty + nz * tz;
        tx -= nx * d; ty -= ny * d; tz -= nz * d;
        double l = std::sqrt(tx * tx + ty * ty + tz * tz);
        if (l < 1e-8) {
            // No usable tangent: pick any vector orthogonal to the normal.
            if (std::abs(nx) < 0.577) { tx = 0; ty = -nz; tz = ny; }
            else { tx = -nz; ty = 0; tz = nx; }
            l = std::sqrt(tx * tx + ty * ty + tz * tz);
            if (l == 0) l = 1;
        }
        glm::vec4& out = m.tangents[i];
        out.x = static_cast<float>(tx / l);
        out.y = static_cast<float>(ty / l);
        out.z = static_cast<float>(tz / l);
        // Handedness: cross(N,T).B tells which way the bitangent runs.
        const double cx = ny * tz - nz * ty, cy = nz * tx - nx * tz, cz = nx * ty - ny * tx;
        const double dot = cx * bit[i * 3] + cy * bit[i * 3 + 1] + cz * bit[i * 3 + 2];
        out.w = dot < 0 ? -1.0f : 1.0f;
    }
}

void computeBounds(MeshData& m) {
    constexpr float inf = std::numeric_limits<float>::infinity();
    glm::vec3 mn(inf), mx(-inf);
    for (const glm::vec3& p : m.positions) {
        mn = glm::min(mn, p);
        mx = glm::max(mx, p);
    }
    m.boundsMin = mn;
    m.boundsMax = mx;
}

TangentReport checkTangents(const MeshData& m, double tol) {
    TangentReport r;
    r.count = m.tangents.size();
    if (m.tangents.size() != m.normals.size()) {
        // Every vertex must have a tangent; a size mismatch is a hard failure.
        r.badLength = r.count > m.normals.size() ? r.count - m.normals.size() : m.normals.size() - r.count;
    }
    const std::size_t n = std::min(m.tangents.size(), m.normals.size());
    for (std::size_t i = 0; i < n; ++i) {
        const glm::dvec4 t(m.tangents[i]);
        glm::dvec3 nn(m.normals[i]);
        if (!std::isfinite(t.x) || !std::isfinite(t.y) || !std::isfinite(t.z) || !std::isfinite(t.w)) {
            ++r.nonFinite;
            continue;
        }
        const double len = std::sqrt(t.x * t.x + t.y * t.y + t.z * t.z);
        const double le = std::abs(len - 1.0);
        r.maxLengthError = std::max(r.maxLengthError, le);
        if (le > tol) ++r.badLength;
        const double nlen = glm::length(nn);
        if (nlen > 0) nn /= nlen;
        const double dt = std::abs(t.x * nn.x + t.y * nn.y + t.z * nn.z);
        r.maxDot = std::max(r.maxDot, dt);
        if (dt > tol) ++r.notOrthogonal;
        if (!(t.w == 1.0 || t.w == -1.0)) ++r.badHandedness;
    }
    return r;
}

} // namespace game::geometry
