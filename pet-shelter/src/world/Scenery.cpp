#include "world/Scenery.h"
#include "world/Layout.h"
#include "world/Terrain.h"
#include <cmath>

namespace ps::scenery {
using namespace layout;

std::vector<TerrainTile> buildTerrainLevel(Rect area, float spacing, int tilesPerSide, const Rect* hole) {
    std::vector<TerrainTile> tiles;
    int cellsX = int(std::round((area.maxX - area.minX) / spacing));
    int cellsZ = int(std::round((area.maxZ - area.minZ) / spacing));
    int perTileX = (cellsX + tilesPerSide - 1) / tilesPerSide;
    int perTileZ = (cellsZ + tilesPerSide - 1) / tilesPerSide;
    Material m = Material::make({0.3f, 0.35f, 0.2f}, 0.9f, 0.0f, PAT_TERRAIN);
    const float skirt = spacing * 1.5f + 4.0f;

    for (int tz = 0; tz < tilesPerSide; ++tz)
        for (int tx = 0; tx < tilesPerSide; ++tx) {
            int c0x = tx * perTileX, c1x = std::min(cellsX, c0x + perTileX);
            int c0z = tz * perTileZ, c1z = std::min(cellsZ, c0z + perTileZ);
            if (c0x >= c1x || c0z >= c1z) continue;
            int nx = c1x - c0x, nz = c1z - c0z;
            // Skip tiles entirely inside the hole
            float tMinX = area.minX + float(c0x) * spacing, tMaxX = area.minX + float(c1x) * spacing;
            float tMinZ = area.minZ + float(c0z) * spacing, tMaxZ = area.minZ + float(c1z) * spacing;
            if (hole && tMinX >= hole->minX && tMaxX <= hole->maxX && tMinZ >= hole->minZ && tMaxZ <= hole->maxZ) continue;

            TerrainTile tile;
            MeshBuilder& b = tile.builder;
            // Heights with a 1-cell border for normals
            int W = nx + 3;
            std::vector<float> h(size_t(W) * size_t(nz + 3));
            auto H = [&](int i, int j) -> float& { return h[size_t(j + 1) * size_t(W) + size_t(i + 1)]; };
            for (int j = -1; j <= nz + 1; ++j)
                for (int i = -1; i <= nx + 1; ++i)
                    H(i, j) = terrain::height(tMinX + float(i) * spacing, tMinZ + float(j) * spacing);
            float lo = 1e9f, hi = -1e9f;
            for (int j = 0; j <= nz; ++j)
                for (int i = 0; i <= nx; ++i) {
                    float x = tMinX + float(i) * spacing, z = tMinZ + float(j) * spacing;
                    float y = H(i, j);
                    vec3 n = normalize(vec3(H(i - 1, j) - H(i + 1, j), 2.0f * spacing, H(i, j - 1) - H(i, j + 1)));
                    float forest = terrain::forestDensity(x, z);
                    b.addVertex({x, y, z}, n, {forest, 0.0f}, m);
                    lo = std::min(lo, y); hi = std::max(hi, y);
                }
            auto idx = [&](int i, int j) { return uint32_t(j * (nx + 1) + i); };
            for (int j = 0; j < nz; ++j)
                for (int i = 0; i < nx; ++i) {
                    if (hole) {
                        float cx0 = tMinX + float(i) * spacing, cz0 = tMinZ + float(j) * spacing;
                        if (cx0 >= hole->minX && cx0 + spacing <= hole->maxX && cz0 >= hole->minZ && cz0 + spacing <= hole->maxZ)
                            continue;
                    }
                    uint32_t a = idx(i, j), bb = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
                    // CCW seen from above (+Y): a(x,z) -> d(x,z+1) -> c -> b
                    b.addTri(a, d, c);
                    b.addTri(a, c, bb);
                }
            // Skirts on the four tile edges (both windings) hide LOD cracks
            auto skirtEdge = [&](int i0, int j0, int di, int dj, int n) {
                for (int k = 0; k < n; ++k) {
                    int i1 = i0 + di * k, j1 = j0 + dj * k, i2 = i1 + di, j2 = j1 + dj;
                    const Vertex& v1 = b.verts[idx(i1, j1)];
                    const Vertex& v2 = b.verts[idx(i2, j2)];
                    vec3 p1 = v1.pos, p2 = v2.pos, n1 = v1.normal, n2 = v2.normal;
                    vec2 u1 = v1.uv, u2 = v2.uv;
                    uint32_t a = b.addVertex(p1, n1, u1, m), c = b.addVertex(p2, n2, u2, m);
                    uint32_t a2 = b.addVertex(p1 - vec3(0, skirt, 0), n1, u1, m), c2 = b.addVertex(p2 - vec3(0, skirt, 0), n2, u2, m);
                    b.addTri(a, a2, c2); b.addTri(a, c2, c);
                    b.addTri(a, c2, a2); b.addTri(a, c, c2);
                }
            };
            skirtEdge(0, 0, 1, 0, nx);
            skirtEdge(0, nz, 1, 0, nx);
            skirtEdge(0, 0, 0, 1, nz);
            skirtEdge(nx, 0, 0, 1, nz);
            tile.bounds = AABB({tMinX, lo - skirt, tMinZ}, {tMaxX, hi + 1.0f, tMaxZ});
            tiles.push_back(std::move(tile));
        }
    return tiles;
}

std::vector<FenceSeg> fencePieces(const std::vector<FenceSeg>& segs, float gateZ) {
    // Split the fence line that crosses the access road around the gate opening
    const float gate = kGateHalfWidth + 0.35f;
    std::vector<FenceSeg> out;
    for (const FenceSeg& fs : segs) {
        bool south = std::fabs(fs.a.z - gateZ) < 0.5f && std::fabs(fs.b.z - gateZ) < 0.5f;
        if (!south) { out.push_back(fs); continue; }
        float x0 = std::min(fs.a.x, fs.b.x), x1 = std::max(fs.a.x, fs.b.x);
        if (x1 <= -gate || x0 >= gate) out.push_back({{x0, 0, gateZ}, {x1, 0, gateZ}});
        else {
            if (x0 < -gate) out.push_back({{x0, 0, gateZ}, {-gate, 0, gateZ}});
            if (x1 > gate) out.push_back({{gate, 0, gateZ}, {x1, 0, gateZ}});
        }
    }
    return out;
}

void buildFence(MeshBuilder& b, const std::vector<FenceSeg>& segs, float gateZ) {
    Material m = Material::make({0.62f, 0.64f, 0.66f}, 0.45f, 1.0f, PAT_FENCE);
    Material post = Material::make({0.5f, 0.52f, 0.55f}, 0.4f, 1.0f, PAT_METAL);
    const float seg = 12.0f, h = 2.2f;
    for (const FenceSeg& piece : fencePieces(segs, gateZ)) {
        {
            vec3 from = piece.a, to = piece.b;
            vec3 d = to - from;
            float len = length(vec3(d.x, 0, d.z));
            if (len < 0.01f) continue;
            int n = int(std::ceil(len / seg));
            for (int i = 0; i < n; ++i) {
                float t0 = float(i) / float(n), t1 = float(i + 1) / float(n);
                vec3 a = from + d * t0, c = from + d * t1;
                a.y = terrain::height(a.x, a.z);
                c.y = terrain::height(c.x, c.z);
                float u0 = t0 * len, u1 = t1 * len;
                vec3 nrm = normalize(cross(vec3(0, 1, 0), c - a));
                uint32_t v0 = b.addVertex(a, nrm, {u0, 0.0f}, m), v1 = b.addVertex(c, nrm, {u1, 0.0f}, m);
                uint32_t v2 = b.addVertex(c + vec3(0, h, 0), nrm, {u1, h}, m), v3 = b.addVertex(a + vec3(0, h, 0), nrm, {u0, h}, m);
                b.addTri(v0, v1, v2);
                b.addTri(v0, v2, v3);
                // Real posts and a top rail near the shelter (far fence is texture only)
                vec3 mid = (a + c) * 0.5f;
                if (mid.x * mid.x + mid.z * mid.z < 900.0f * 900.0f) {
                    for (float t = 0.0f; t < 1.0f; t += 0.25f) {
                        vec3 p = a + (c - a) * t;
                        b.addCylinder({p.x, terrain::height(p.x, p.z), p.z}, 0.035f, h + 0.05f, 6, post);
                    }
                    vec3 dir = normalize(vec3(c.x - a.x, 0, c.z - a.z));
                    vec3 side{-dir.z, 0, dir.x};
                    vec3 q0 = a + vec3(0, h - 0.03f, 0), q1 = c + vec3(0, h - 0.03f, 0);
                    b.addQuad(q0 - side * 0.03f, q1 - side * 0.03f, q1 + side * 0.03f + vec3(0, 0.05f, 0) * 0.0f, q0 + side * 0.03f, post);
                }
            }
        }
    }
}

void buildPropertyStakes(MeshBuilder& b, const std::vector<FenceSeg>& segs, float radius) {
    Material wood = Material::make({0.55f, 0.42f, 0.28f}, 0.8f);
    Material flag = Material::make({1.0f, 0.42f, 0.08f}, 0.5f, 0.0f, PAT_PLAIN, 0.6f);
    for (const FenceSeg& fs : segs) {
        vec3 d = fs.b - fs.a;
        float len = length(vec3(d.x, 0, d.z));
        int n = std::max(1, int(len / 30.0f));
        for (int i = 0; i <= n; ++i) {
            vec3 p = fs.a + d * (float(i) / float(n));
            if (p.x * p.x + p.z * p.z > radius * radius) continue;
            if (std::fabs(p.z - kHighwayZ) < kHighwayHalfWidth + 3.0f) continue;
            p.y = terrain::height(p.x, p.z);
            b.addBox(AABB(p + vec3(-0.04f, 0.0f, -0.04f), p + vec3(0.04f, 1.0f, 0.04f)), wood);
            b.addBox(AABB(p + vec3(-0.05f, 0.85f, -0.05f), p + vec3(0.05f, 1.02f, 0.05f)), flag);
        }
    }
}

void buildHighway(MeshBuilder& b) {
    Material asphalt = Material::make({0.15f, 0.15f, 0.16f}, 0.85f, 0.0f, PAT_HIGHWAY);
    Material gravel = Material::make({0.42f, 0.40f, 0.36f}, 0.95f, 0.0f, PAT_CONCRETE);
    const float z0 = kHighwayZ - kHighwayHalfWidth, z1 = kHighwayZ + kHighwayHalfWidth;
    for (float x = -70000.0f; x < 70000.0f; x += 200.0f) {
        b.addQuad({x, 0.03f, z1}, {x + 200.0f, 0.03f, z1}, {x + 200.0f, 0.03f, z0}, {x, 0.03f, z0}, asphalt);
        b.addQuad({x, 0.02f, z1 + 2.0f}, {x + 200.0f, 0.02f, z1 + 2.0f}, {x + 200.0f, 0.02f, z1}, {x, 0.02f, z1}, gravel);
        b.addQuad({x, 0.02f, z0}, {x + 200.0f, 0.02f, z0}, {x + 200.0f, 0.02f, z0 - 2.0f}, {x, 0.02f, z0 - 2.0f}, gravel);
    }
    // Guard rail posts + rail along the south side near the facility
    Material steel = Material::make({0.7f, 0.72f, 0.74f}, 0.35f, 1.0f, PAT_METAL);
    for (float x = -1500.0f; x <= 1500.0f; x += 4.0f)
        b.addBox(AABB({x - 0.06f, 0.0f, z1 + 2.4f}, {x + 0.06f, 0.75f, z1 + 2.52f}), steel);
    b.addBox(AABB({-1500.0f, 0.5f, z1 + 2.3f}, {1500.0f, 0.75f, z1 + 2.4f}), steel);
}

void buildPineTree(MeshBuilder& b) {
    Material bark = Material::make({0.30f, 0.21f, 0.14f}, 0.95f, 0.0f, PAT_BARK);
    Material needles = Material::make({0.10f, 0.22f, 0.10f}, 0.8f, 0.0f, PAT_FOLIAGE);
    b.addCylinder({0, 0, 0}, 0.22f, 3.2f, 7, bark, false, 0.12f);
    float y = 1.8f, r = 2.3f;
    for (int i = 0; i < 4; ++i) {
        b.addCylinder({0, y, 0}, r, 3.4f - float(i) * 0.3f, 9, needles, true, 0.0f);
        y += 2.1f;
        r *= 0.74f;
    }
}

void buildOakTree(MeshBuilder& b) {
    Material bark = Material::make({0.33f, 0.25f, 0.17f}, 0.95f, 0.0f, PAT_BARK);
    Material leaves = Material::make({0.18f, 0.32f, 0.10f}, 0.8f, 0.0f, PAT_FOLIAGE);
    b.addCylinder({0, 0, 0}, 0.3f, 3.6f, 8, bark, false, 0.2f);
    b.addEllipsoid({0, 5.2f, 0}, {2.9f, 2.3f, 2.9f}, 10, 7, leaves);
    b.addEllipsoid({1.3f, 4.6f, 0.8f}, {1.9f, 1.6f, 1.9f}, 9, 6, leaves);
    b.addEllipsoid({-1.2f, 4.8f, -0.9f}, {1.8f, 1.6f, 1.8f}, 9, 6, leaves);
}

void buildBush(MeshBuilder& b) {
    Material leaves = Material::make({0.14f, 0.28f, 0.09f}, 0.85f, 0.0f, PAT_FOLIAGE);
    Material dark = Material::make({0.1f, 0.2f, 0.07f}, 0.85f, 0.0f, PAT_FOLIAGE);
    b.addEllipsoid({0, 0.45f, 0}, {0.8f, 0.55f, 0.8f}, 9, 6, leaves);
    b.addEllipsoid({0.45f, 0.35f, 0.2f}, {0.55f, 0.42f, 0.55f}, 8, 5, dark);
    b.addEllipsoid({-0.4f, 0.32f, -0.25f}, {0.5f, 0.38f, 0.5f}, 8, 5, leaves);
}

void buildRock(MeshBuilder& b) {
    Material stone = Material::make({0.42f, 0.4f, 0.37f}, 0.9f, 0.0f, PAT_CONCRETE);
    size_t v0 = b.verts.size();
    b.addEllipsoid({0, 0.15f, 0}, {0.7f, 0.45f, 0.55f}, 9, 6, stone);
    // Lumpy: push vertices around deterministically
    for (size_t i = v0; i < b.verts.size(); ++i) {
        vec3& p = b.verts[i].pos;
        float k = 0.8f + 0.35f * std::sin(p.x * 7.1f + p.z * 3.3f) * std::cos(p.y * 5.7f + p.x * 2.1f);
        p = vec3(p.x * k, std::max(p.y * k, -0.1f), p.z * k);
    }
    b.addEllipsoid({0.6f, 0.05f, 0.3f}, {0.3f, 0.2f, 0.25f}, 7, 4, stone);
}

void buildGrassClump(MeshBuilder& b, bool flowers) {
    Material blade = Material::make({0.2f, 0.36f, 0.1f}, 0.9f, 0.0f, PAT_FOLIAGE);
    Material dry = Material::make({0.42f, 0.4f, 0.18f}, 0.9f, 0.0f, PAT_FOLIAGE);
    for (int i = 0; i < 9; ++i) {
        float a = float(i) * 2.39996f, r = 0.08f + 0.05f * float(i % 3);
        vec3 base{std::cos(a) * r, 0.0f, std::sin(a) * r};
        b.addCone(base, 0.035f, 0.35f + 0.15f * float(i % 4), 4, i % 4 == 0 ? dry : blade);
    }
    if (flowers) {
        const vec3 cols[] = {{0.9f, 0.8f, 0.15f}, {0.85f, 0.85f, 0.9f}, {0.6f, 0.25f, 0.7f}, {0.85f, 0.3f, 0.2f}};
        for (int i = 0; i < 4; ++i) {
            float a = float(i) * 1.7f;
            vec3 p{std::cos(a) * 0.15f, 0.45f + 0.05f * float(i), std::sin(a) * 0.15f};
            b.addCylinder({p.x, 0.0f, p.z}, 0.008f, p.y, 3, blade, false);
            b.addEllipsoid(p, {0.04f, 0.025f, 0.04f}, 5, 3, Material::make(cols[i], 0.7f));
        }
    }
}

void buildUtilityPole(MeshBuilder& b) {
    Material wood = Material::make({0.28f, 0.2f, 0.13f}, 0.9f, 0.0f, PAT_BARK);
    b.addCylinder({0, 0, 0}, 0.14f, 10.0f, 8, wood, true, 0.11f);
    b.addBox(AABB({-1.3f, 9.2f, -0.07f}, {1.3f, 9.36f, 0.07f}), wood);
    Material ins = Material::make({0.2f, 0.3f, 0.35f}, 0.1f);
    for (float x : {-1.1f, 0.0f, 1.1f}) b.addCylinder({x, 9.36f, 0}, 0.05f, 0.18f, 6, ins);
}

void buildBuildable(MeshBuilder& b, BuildKind kind) {
    const BuildInfo& bi = buildInfo(kind);
    float hw = bi.width * 0.5f, hd = bi.depth * 0.5f;
    Material concrete = Material::make({0.6f, 0.6f, 0.58f}, 0.9f, 0.0f, PAT_CONCRETE);
    Material siding = Material::make({0.78f, 0.72f, 0.60f}, 0.7f, 0.0f, PAT_SIDING);
    Material roof = Material::make({0.35f, 0.18f, 0.12f}, 0.85f, 0.0f, PAT_SHINGLE);
    Material fence = Material::make({0.62f, 0.64f, 0.66f}, 0.45f, 1.0f, PAT_FENCE);
    Material steel = Material::make({0.6f, 0.62f, 0.64f}, 0.35f, 1.0f, PAT_METAL);
    Material dark = Material::make({0.08f, 0.1f, 0.12f}, 0.1f, 0.5f);
    auto building = [&](vec3 wallCol, float h) {
        b.addBox(AABB({-hw, -3.0f, -hd}, {hw, 0.3f, hd}), concrete, true);
        b.addBox(AABB({-hw + 0.1f, 0.3f, -hd + 0.1f}, {hw - 0.1f, h, hd - 0.1f}), Material::make(wallCol, 0.7f, 0.0f, PAT_SIDING));
        // Gabled roof
        float rh = 1.4f;
        vec3 a{-hw - 0.4f, h, -hd - 0.4f}, c{hw + 0.4f, h, hd + 0.4f};
        b.addQuad({a.x, h, c.z}, {c.x, h, c.z}, {c.x, h + rh, 0.0f}, {a.x, h + rh, 0.0f}, roof);
        b.addQuad({c.x, h, a.z}, {a.x, h, a.z}, {a.x, h + rh, 0.0f}, {c.x, h + rh, 0.0f}, roof);
        b.addQuad({a.x, h, a.z}, {a.x, h, c.z}, {a.x, h + rh, 0.0f}, {a.x, h + rh, 0.0f}, Material::make(wallCol, 0.7f));
        b.addQuad({c.x, h, c.z}, {c.x, h, a.z}, {c.x, h + rh, 0.0f}, {c.x, h + rh, 0.0f}, Material::make(wallCol, 0.7f));
        // Door on the front (+Z)
        b.addBox(AABB({-0.55f, 0.3f, hd - 0.12f}, {0.55f, 2.4f, hd - 0.05f}), Material::make({0.3f, 0.22f, 0.15f}, 0.5f, 0.0f, PAT_WOOD));
    };
    switch (kind) {
    case BuildKind::KennelBlock: {
        building({0.82f, 0.78f, 0.68f}, 3.0f);
        // Outdoor runs along the front
        for (int i = 0; i <= 6; ++i) {
            float x = -hw + 0.3f + float(i) * (bi.width - 0.6f) / 6.0f;
            b.addQuad({x, 0.3f, hd}, {x, 0.3f, hd + 2.5f}, {x, 2.1f, hd + 2.5f}, {x, 2.1f, hd}, fence);
        }
        b.addQuad({-hw + 0.3f, 0.3f, hd + 2.5f}, {hw - 0.3f, 0.3f, hd + 2.5f}, {hw - 0.3f, 2.1f, hd + 2.5f}, {-hw + 0.3f, 2.1f, hd + 2.5f}, fence);
        b.addBox(AABB({-hw + 0.3f, 0.0f, hd}, {hw - 0.3f, 0.3f, hd + 2.5f}), concrete);
        for (int i = 0; i < 6; ++i) {
            float x = -hw + 0.3f + (float(i) + 0.5f) * (bi.width - 0.6f) / 6.0f;
            b.addBox(AABB({x - 0.35f, 0.3f, hd - 0.12f}, {x + 0.35f, 1.1f, hd - 0.05f}), dark);  // dog doors
        }
        break;
    }
    case BuildKind::DogRun: {
        b.addBox(AABB({-hw, 0.0f, -hd}, {hw, 0.06f, hd}), Material::make({0.2f, 0.35f, 0.1f}, 0.95f, 0.0f, PAT_GRASS));
        auto side = [&](vec3 p0, vec3 p1) {
            b.addQuad(p0, p1, p1 + vec3(0, 1.8f, 0), p0 + vec3(0, 1.8f, 0), fence);
        };
        side({-hw, 0, -hd}, {hw, 0, -hd});
        side({hw, 0, -hd}, {hw, 0, hd});
        side({-hw, 0, hd}, {-1.0f, 0, hd});
        side({1.0f, 0, hd}, {hw, 0, hd});
        side({-hw, 0, hd}, {-hw, 0, -hd});
        for (float x : {-hw, hw}) for (float z : {-hd, hd}) b.addCylinder({x, 0, z}, 0.05f, 1.85f, 6, steel);
        b.addBox(AABB({-hw + 0.5f, 0.06f, -hd + 0.5f}, {-hw + 2.5f, 1.4f, -hd + 2.0f}), Material::make({0.55f, 0.35f, 0.2f}, 0.6f, 0.0f, PAT_WOOD));
        b.addCylinder({hw - 1.0f, 0.06f, -hd + 1.0f}, 0.25f, 0.12f, 12, steel);
        break;
    }
    case BuildKind::CatHouse:
        building({0.72f, 0.80f, 0.86f}, 2.8f);
        b.addBox(AABB({-hw + 1.0f, 0.9f, hd - 0.11f}, {-1.0f, 2.3f, hd - 0.04f}), dark);   // viewing window
        b.addBox(AABB({1.0f, 0.9f, hd - 0.11f}, {hw - 1.0f, 2.3f, hd - 0.04f}), dark);
        break;
    case BuildKind::Path:
        b.addBox(AABB({-hw, -0.2f, -hd}, {hw, 0.05f, hd}), concrete);
        break;
    case BuildKind::PineTree:
        buildPineTree(b);
        break;
    case BuildKind::Shrub:
        buildBush(b);
        break;
    case BuildKind::Tree:
        buildOakTree(b);
        break;
    case BuildKind::Bench: {
        Material wood = Material::make({0.55f, 0.38f, 0.22f}, 0.55f, 0.0f, PAT_WOOD);
        b.addBox(AABB({-0.9f, 0.42f, -0.22f}, {0.9f, 0.47f, 0.22f}), wood);
        b.addBox(AABB({-0.9f, 0.6f, -0.24f}, {0.9f, 0.85f, -0.2f}), wood);
        for (float x : {-0.8f, 0.8f}) b.addBox(AABB({x - 0.04f, 0.0f, -0.24f}, {x + 0.04f, 0.6f, 0.2f}), steel);
        break;
    }
    case BuildKind::LampPost: {
        Material pole = Material::make({0.12f, 0.12f, 0.13f}, 0.4f, 0.8f);
        b.addCylinder({0, 0, 0}, 0.08f, 4.3f, 10, pole);
        b.addCylinder({0, 4.3f, 0}, 0.25f, 0.3f, 10, Material::make({1.0f, 0.85f, 0.6f}, 0.4f, 0.0f, PAT_PLAIN, 12.0f), true, 0.1f);
        break;
    }
    case BuildKind::SecurityCamera: {
        Material pole = Material::make({0.3f, 0.3f, 0.32f}, 0.4f, 0.8f);
        b.addCylinder({0, 0, 0}, 0.07f, 4.0f, 8, pole);
        b.addBox(AABB({-0.03f, 3.9f, -0.03f}, {0.03f, 4.0f, 0.35f}), pole);
        b.addBox(AABB({-0.1f, 3.8f, 0.2f}, {0.1f, 3.98f, 0.55f}), Material::make({0.9f, 0.9f, 0.88f}, 0.3f));
        b.addCylinder({0, 3.89f, 0.55f}, 0.05f, 0.02f, 10, dark);
        b.addBox(AABB({0.06f, 3.94f, 0.54f}, {0.08f, 3.96f, 0.56f}), Material::make({1, 0.1f, 0.1f}, 0.3f, 0.0f, PAT_PLAIN, 8.0f));
        break;
    }
    case BuildKind::StaffBuilding:
        building({0.70f, 0.62f, 0.52f}, 3.2f);
        for (float x : {-3.5f, 3.5f}) b.addBox(AABB({x - 1.0f, 1.2f, hd - 0.11f}, {x + 1.0f, 2.4f, hd - 0.04f}), dark);
        break;
    case BuildKind::ParkingLot: {
        b.addBox(AABB({-hw, -0.2f, -hd}, {hw, 0.04f, hd}), Material::make({0.16f, 0.16f, 0.17f}, 0.85f, 0.0f, PAT_ASPHALT));
        Material paint = Material::make({0.85f, 0.85f, 0.85f}, 0.6f);
        for (float x = -hw + 1.0f; x <= hw - 0.9f; x += 2.7f) {
            b.addBox(AABB({x - 0.05f, 0.04f, -hd + 0.5f}, {x + 0.05f, 0.045f, -hd + 5.5f}), paint);
            b.addBox(AABB({x - 0.05f, 0.04f, hd - 5.5f}, {x + 0.05f, 0.045f, hd - 0.5f}), paint);
        }
        break;
    }
    case BuildKind::SmallAnimalHouse:
        building({0.70f, 0.82f, 0.66f}, 2.8f);
        b.addBox(AABB({-hw + 0.8f, 0.9f, hd - 0.11f}, {-1.0f, 2.2f, hd - 0.04f}), dark);
        b.addBox(AABB({1.0f, 0.9f, hd - 0.11f}, {hw - 0.8f, 2.2f, hd - 0.04f}), dark);
        break;
    case BuildKind::Barn: {
        // Red barn on the back half, fenced paddock in front
        float bz = -hd * 0.25f;
        Material red = Material::make({0.45f, 0.08f, 0.06f}, 0.7f, 0.0f, PAT_SIDING);
        Material white = Material::make({0.85f, 0.84f, 0.8f}, 0.6f);
        b.addBox(AABB({-hw, -3.0f, -hd}, {hw, 0.2f, bz}), concrete, true);
        b.addBox(AABB({-hw + 0.1f, 0.2f, -hd + 0.1f}, {hw - 0.1f, 4.0f, bz - 0.1f}), red);
        float cz = (-hd + bz) * 0.5f, rh = 2.2f;
        b.addQuad({-hw - 0.4f, 4.0f, bz + 0.3f}, {hw + 0.4f, 4.0f, bz + 0.3f}, {hw + 0.4f, 4.0f + rh, cz}, {-hw - 0.4f, 4.0f + rh, cz}, roof);
        b.addQuad({hw + 0.4f, 4.0f, -hd - 0.3f}, {-hw - 0.4f, 4.0f, -hd - 0.3f}, {-hw - 0.4f, 4.0f + rh, cz}, {hw + 0.4f, 4.0f + rh, cz}, roof);
        b.addQuad({-hw, 4.0f, -hd}, {-hw, 4.0f, bz}, {-hw, 4.0f + rh, cz}, {-hw, 4.0f + rh, cz}, red);
        b.addQuad({hw, 4.0f, bz}, {hw, 4.0f, -hd}, {hw, 4.0f + rh, cz}, {hw, 4.0f + rh, cz}, red);
        b.addBox(AABB({-1.6f, 0.2f, bz - 0.12f}, {1.6f, 3.2f, bz - 0.04f}), Material::make({0.5f, 0.1f, 0.07f}, 0.6f, 0.0f, PAT_WOOD));
        b.addBox(AABB({-1.6f, 1.6f, bz - 0.04f}, {1.6f, 1.75f, bz}), white);
        b.addBox(AABB({-hw, 0.0f, bz}, {hw, 0.06f, hd}), Material::make({0.22f, 0.33f, 0.1f}, 0.95f, 0.0f, PAT_GRASS));
        Material rail = Material::make({0.8f, 0.78f, 0.72f}, 0.6f, 0.0f, PAT_WOOD);
        auto rails = [&](vec3 p0, vec3 p1) {
            for (float y : {0.55f, 1.05f, 1.45f}) {
                vec3 d = p1 - p0;
                vec3 c = (p0 + p1) * 0.5f + vec3(0, y, 0);
                vec3 half{std::fabs(d.x) * 0.5f + 0.05f, 0.06f, std::fabs(d.z) * 0.5f + 0.05f};
                b.addBox(AABB(c - half, c + half), rail);
            }
            float len = length(p1 - p0);
            for (float t = 0; t <= len; t += 2.5f) b.addBox(p0 + (p1 - p0) * (t / len) + vec3(0, 0.8f, 0), {0.08f, 0.8f, 0.08f}, rail);
        };
        rails({-hw, 0, bz}, {-hw, 0, hd});
        rails({hw, 0, bz}, {hw, 0, hd});
        rails({-hw, 0, hd}, {-2.0f, 0, hd});
        rails({2.0f, 0, hd}, {hw, 0, hd});
        b.addBox(AABB({hw - 3.0f, 0.06f, hd - 1.2f}, {hw - 1.0f, 0.7f, hd - 0.6f}), steel);   // water trough
        break;
    }
    case BuildKind::FeralEnclosure: {
        b.addBox(AABB({-hw, -0.2f, -hd}, {hw, 0.05f, hd}), concrete);
        Material chain = Material::make({0.5f, 0.52f, 0.54f}, 0.5f, 0.7f, PAT_FENCE);
        auto wall = [&](vec3 p0, vec3 p1) { b.addQuad(p0, p1, p1 + vec3(0, 3.0f, 0), p0 + vec3(0, 3.0f, 0), chain); };
        wall({-hw, 0, -hd}, {hw, 0, -hd}); wall({hw, 0, -hd}, {hw, 0, hd}); wall({hw, 0, hd}, {-hw, 0, hd}); wall({-hw, 0, hd}, {-hw, 0, -hd});
        wall({0, 0, -hd}, {0, 0, hd}); wall({-hw, 0, 0}, {hw, 0, 0});    // four pens
        for (float x : {-hw, 0.0f, hw}) for (float z : {-hd, 0.0f, hd}) b.addCylinder({x, 0, z}, 0.07f, 3.1f, 6, steel);
        for (float x : {-hw * 0.5f, hw * 0.5f}) for (float z : {-hd * 0.5f, hd * 0.5f})
            b.addBox(AABB({x - 1.0f, 0.05f, z - 0.8f}, {x + 1.0f, 1.2f, z + 0.8f}), Material::make({0.4f, 0.3f, 0.2f}, 0.8f, 0.0f, PAT_WOOD));
        b.addQuad({-hw, 3.0f, -hd}, {-hw, 3.0f, hd}, {hw, 3.0f, hd}, {hw, 3.0f, -hd}, chain);    // mesh roof
        break;
    }
    case BuildKind::SecureEnclosure: {
        b.addBox(AABB({-hw, -0.3f, -hd}, {hw, 0.3f, hd}), concrete);
        Material bars = Material::make({0.2f, 0.21f, 0.22f}, 0.35f, 0.9f);
        for (float x = -hw; x <= hw + 0.01f; x += 0.25f) {
            b.addCylinder({x, 0.3f, -hd}, 0.035f, 3.6f, 6, bars);
            b.addCylinder({x, 0.3f, hd}, 0.035f, 3.6f, 6, bars);
        }
        for (float z = -hd; z <= hd + 0.01f; z += 0.25f) {
            b.addCylinder({-hw, 0.3f, z}, 0.035f, 3.6f, 6, bars);
            b.addCylinder({hw, 0.3f, z}, 0.035f, 3.6f, 6, bars);
        }
        b.addBox(AABB({-hw, 3.9f, -hd}, {hw, 4.1f, hd}), bars);
        b.addBox(AABB({-hw * 0.6f, 0.3f, -hd + 0.2f}, {hw * 0.6f, 2.0f, -hd + 2.2f}), concrete);   // den
        b.addBox(AABB({hw - 0.6f, 2.6f, hd + 0.02f}, {hw - 0.1f, 3.0f, hd + 0.06f}), Material::make({0.9f, 0.7f, 0.05f}, 0.4f));   // warning sign
        break;
    }
    case BuildKind::SurgeryWing:
        building({0.9f, 0.92f, 0.93f}, 3.4f);
        for (float x : {-4.5f, 4.5f}) b.addBox(AABB({x - 1.2f, 1.0f, hd - 0.11f}, {x + 1.2f, 2.5f, hd - 0.04f}), dark);
        // red cross
        b.addBox(AABB({-0.15f, 2.6f, hd - 0.03f}, {0.15f, 3.3f, hd + 0.01f}), Material::make({0.8f, 0.05f, 0.05f}, 0.4f, 0.0f, PAT_PLAIN, 1.5f));
        b.addBox(AABB({-0.5f, 2.8f, hd - 0.03f}, {0.5f, 3.1f, hd + 0.01f}), Material::make({0.8f, 0.05f, 0.05f}, 0.4f, 0.0f, PAT_PLAIN, 1.5f));
        break;
    case BuildKind::ContainerShelter: {
        // Shipping container (back) with a side door and a vent, fenced yard in front
        Material box = Material::make({0.16f, 0.32f, 0.36f}, 0.55f, 0.4f, PAT_SIDING);
        Material rib = Material::make({0.13f, 0.27f, 0.3f}, 0.5f, 0.5f);
        float cz0 = -hd, cz1 = -hd + 2.44f;
        b.addBox(AABB({-hw + 0.3f, 0.0f, cz0 - 0.05f}, {hw - 0.3f, 0.15f, cz1 + 0.05f}), concrete);   // pad
        b.addBox(AABB({-3.05f, 0.15f, cz0}, {3.05f, 2.74f, cz1}), box);
        for (float x = -2.9f; x <= 2.95f; x += 0.35f) b.addBox(AABB({x - 0.04f, 0.2f, cz1}, {x + 0.04f, 2.7f, cz1 + 0.04f}), rib);
        b.addBox(AABB({-0.5f, 0.15f, cz1}, {0.5f, 1.25f, cz1 + 0.06f}), dark);                       // animal door
        b.addBox(AABB({1.6f, 1.9f, cz1}, {2.5f, 2.3f, cz1 + 0.06f}), steel);                           // vent
        b.addBox(AABB({-3.1f, 2.74f, cz0 - 0.05f}, {3.1f, 2.84f, cz1 + 0.05f}), rib);                  // roof edge
        auto side = [&](vec3 p0, vec3 p1) { b.addQuad(p0, p1, p1 + vec3(0, 1.4f, 0), p0 + vec3(0, 1.4f, 0), fence); };
        float yz0 = cz1, yz1 = hd;
        side({-hw + 0.3f, 0, yz0}, {-hw + 0.3f, 0, yz1});
        side({hw - 0.3f, 0, yz1}, {hw - 0.3f, 0, yz0});
        side({-hw + 0.3f, 0, yz1}, {-0.6f, 0, yz1});
        side({0.6f, 0, yz1}, {hw - 0.3f, 0, yz1});
        for (float x : {-hw + 0.3f, hw - 0.3f}) b.addCylinder({x, 0, yz1}, 0.04f, 1.45f, 6, steel);
        b.addBox(AABB({-0.6f, 0.0f, yz1 - 0.03f}, {0.6f, 1.3f, yz1 + 0.03f}), fence);                  // yard gate
        b.addCylinder({hw - 1.0f, 0.0f, yz0 + 0.8f}, 0.2f, 0.1f, 10, steel);                             // water bowl
        break;
    }
    case BuildKind::StaffOffices:
        building({0.82f, 0.8f, 0.74f}, 3.1f);
        for (float x : {-4.5f, -1.5f, 1.5f, 4.5f}) b.addBox(AABB({x - 0.8f, 1.1f, hd - 0.11f}, {x + 0.8f, 2.3f, hd - 0.04f}), dark);
        break;
    default:
        b.addBox(AABB({-hw, 0.0f, -hd}, {hw, bi.height, hd}), siding);
        break;
    }
    (void)siding;
}

}  // namespace ps::scenery
