#pragma once
// Port of the procedural primitives in engine/src/30-geometry.js (LE.Shapes)
// and of the Geometry.finalize() pipeline every one of them ends with:
//
//     positions/normals/uvs -> float32
//     dropDegenerateTriangles()
//     computeTangents()      (per-triangle UV derivatives, Gram-Schmidt, w = handedness)
//     computeBounds()
//
// Parameter order and defaults are the JS ones. Arithmetic is done in double,
// exactly as JS does it, and rounded to float only at the end, which is where
// the JS rounds too (new Float32Array). Indices are plain uint32 triangles.
//
// Winding: every triangle is counter-clockwise seen from the side its normals
// point to (OpenGL default front face). This is the one place the port departs
// from the JS on purpose: the JS cylinder, cone, torus and the +Y/-Y faces of
// box are wound clockwise, so its back-face-culled renderer drew them
// inside-out. Those triangles are the JS triangles with their last two indices
// swapped; every other index is identical to the JS.
#include <cstddef>
#include <cstdint>
#include <functional>
#include <vector>

#include <glm/glm.hpp>

namespace game::geometry {

struct MeshData {
    std::vector<glm::vec3> positions, normals;
    std::vector<glm::vec2> uvs;
    std::vector<glm::vec4> tangents; // xyz unit tangent, w = +-1 bitangent handedness
    std::vector<uint32_t> indices;   // triangle list
    /* Optional per-vertex tint (the web Geometry.colors). Not sRGB-decoded:
       the shader multiplies it in as-is, exactly like the JS. Empty = the
       renderer's generic white. None of the primitives here emit one; the
       scene importer fills it for exported web meshes that carry one. */
    std::vector<glm::vec3> colors;
    /* Optional skinning: four bone indices (as floats, like the JS) and
       four weights per vertex. Filled only by the scene importer. */
    std::vector<glm::vec4> joints, weights;
    glm::vec3 boundsMin{0.0f}, boundsMax{0.0f};

    std::size_t vertexCount() const { return positions.size(); }
    std::size_t triangleCount() const { return indices.size() / 3; }
};

// Height field sampled at world (x, z). An empty function means y = 0.
using HeightFn = std::function<double(double x, double z)>;

// A box with per-face UVs (in world units) and hard edges.
MeshData box(double sx = 1, double sy = 1, double sz = 1, int segments = 1);
// UV sphere; the pole triangles that would be degenerate are never emitted.
MeshData sphere(double radius = 0.5, int rings = 24, int sectors = 36);
MeshData cylinder(double radius = 0.5, double height = 1, int sectors = 24, bool capped = true);
MeshData cone(double radius = 0.5, double height = 1, int sectors = 24);
MeshData capsule(double radius = 0.4, double height = 1, int rings = 8, int sectors = 16);
// XZ plane facing +Y, centred on the origin.
MeshData plane(double width = 10, double depth = 10, int segX = 1, int segZ = 1, double uvScale = 1);
MeshData torus(double radius = 0.6, double tube = 0.22, int rings = 24, int sectors = 36);
// Terrain from a height function; normals from central differences of it.
MeshData terrain(double size = 100, int segments = 64, const HeightFn& heightFn = {}, double uvScale = 0.25);
// Noise-displaced, facetized sphere. Deterministic for a given seed.
MeshData rock(double radius = 0.5, uint32_t seed = 7, double detail = 2);
// A tapered, forward-leaning strip. NOTE: the JS normal (0, 0.3, -1) is not
// unit length; it is kept as-is for parity (shaders normalise it).
MeshData grassBlade(double height = 0.5, double width = 0.05, int segments = 4);

// ---- mesh operations used by the pipeline, exposed for other modules -------

// Remove triangles whose doubled area squared is < 1e-24 (JS threshold).
void dropDegenerateTriangles(MeshData& m);
// Per-vertex tangents from UV derivatives, Gram-Schmidt against the (normalised)
// normal, w = sign(dot(cross(N, T), B)). Vertices with no usable tangent get an
// arbitrary unit vector orthogonal to the normal, as in the JS.
void computeTangents(MeshData& m);
void computeBounds(MeshData& m);

struct TangentReport {
    std::size_t count = 0;
    std::size_t badLength = 0;     // | |T| - 1 | > tol
    std::size_t notOrthogonal = 0; // | dot(T, normalize(N)) | > tol
    std::size_t badHandedness = 0; // w not exactly +1 or -1
    std::size_t nonFinite = 0;
    double maxLengthError = 0;
    double maxDot = 0;
    bool ok() const { return badLength == 0 && notOrthogonal == 0 && badHandedness == 0 && nonFinite == 0; }
};
// Checks every tangent is unit length and orthogonal to its normal.
TangentReport checkTangents(const MeshData& m, double tol = 1e-5);

} // namespace game::geometry
