#include "game/StaffActors.h"
#include "game/People.h"
#include "world/Facility.h"
#include "world/Layout.h"
#include "world/Terrain.h"
#include <imgui.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <queue>

namespace ps {
using namespace layout;

namespace {
enum Task { TNone, TCoffee, TChat, TDesk, TCheck, TTreat, TSurgery, TOffice, TRoam, TWalkToCar, THomeWalkIn, TLeaveHouse, TShelter };
enum Node { OUT, WR_FRONT, WR_E, WR_W, WR_NE, WR_NW, DESK_FRONT, DESK_SEAT, DESK_SIDE, DESK_BACK, HL_E, HL_BATH, HL_OFF, OFFICE,
            OFFICE_VISIT, BATH_L, HR_W, HR_BATH, BATH_R, HR_APP, APP, HR_MED, MED, MED_DESK, HR_END, COFFEE, NODE_COUNT };
const float F = kFloorY;
const vec3 kTableSpot{9.4f, F, -1.62f};
const AABB kBuildingBox({-12.8f, -1.0f, -5.8f}, {12.8f, 6.0f, 6.5f});
const vec3 kCorners[4] = {{-14.5f, 0.0f, 8.9f}, {14.5f, 0.0f, 8.9f}, {-14.5f, 0.0f, -7.8f}, {14.5f, 0.0f, -7.8f}};   // FL FR BL BR

bool segHitsBox(vec3 a, vec3 b, const AABB& box) {
    float t0 = 0.0f, t1 = 1.0f;
    float d[2] = {b.x - a.x, b.z - a.z}, o[2] = {a.x, a.z}, lo[2] = {box.min.x, box.min.z}, hi[2] = {box.max.x, box.max.z};
    for (int i = 0; i < 2; ++i) {
        if (std::fabs(d[i]) < 1e-6f) { if (o[i] < lo[i] || o[i] > hi[i]) return false; continue; }
        float ta = (lo[i] - o[i]) / d[i], tb = (hi[i] - o[i]) / d[i];
        if (ta > tb) std::swap(ta, tb);
        t0 = std::max(t0, ta);
        t1 = std::min(t1, tb);
        if (t0 > t1) return false;
    }
    return true;
}
bool inside(vec3 p) { return roomAt(p.x, p.z) != nullptr; }
float flat(vec3 a, vec3 b) { return length(vec3(b.x - a.x, 0.0f, b.z - a.z)); }
}  // namespace

// ------------------------------------------------------------------ places
vec3 StaffActors::spotPos(int s) const {
    s %= 10;
    return s < 5 ? vec3(4.5f + 3.4f * float(s), 0.0f, 15.2f) : vec3(4.5f + 3.4f * float(s - 5), 0.0f, 36.5f);
}
float StaffActors::spotYaw(int s) const { return (s % 10) < 5 ? kPi : 0.0f; }
float StaffActors::homeYaw(int h) const { return h % 2 == 0 ? kPi * 0.5f : -kPi * 0.5f; }
vec3 StaffActors::homeDoor(int h) const {
    mat4 m = mat4::translate(mapleHouse(h)) * mat4::rotateY(homeYaw(h));
    return m.transformPoint({0.0f, 0.0f, 4.4f});
}
vec3 StaffActors::homeInside(int h) const {
    mat4 m = mat4::translate(mapleHouse(h)) * mat4::rotateY(homeYaw(h));
    return m.transformPoint({1.8f, 0.1f, 0.6f});
}
vec3 StaffActors::driveway(int h) const {
    vec3 c = mapleHouse(h);
    return {kMapleX + (h % 2 == 0 ? -10.5f : 10.5f), 0.0f, c.z + 5.0f};
}
mat4 StaffActors::bedTransform(int h) const {
    return mat4::translate(mapleHouse(h)) * mat4::rotateY(homeYaw(h)) * mat4::translate({-2.5f, 0.8f, -1.3f}) *
           mat4::rotate(quat::axisAngle({1, 0, 0}, -kPi * 0.5f));
}
vec3 StaffActors::deskPos(const Sim& sim, int slot, float* yaw, bool* hidden) const {
    *hidden = false;
    switch (slot) {
    case 0: *yaw = 0.0f; return nav_[DESK_SEAT];
    case 1: *yaw = kPi; return nav_[MED_DESK];
    case 2: *yaw = 0.0f; return nav_[APP];
    default: break;
    }
    // Desks in staff buildings you've built: walk to the door and go in
    int s = 3;
    for (const Placed& p : sim.placed) {
        int desks = p.kind == BuildKind::StaffBuilding ? 2 : (p.kind == BuildKind::StaffOffices ? 4 : 0);
        if (!desks) continue;
        if (slot < s + desks) {
            const BuildInfo& bi = buildInfo(p.kind);
            mat4 m = mat4::translate({p.x, terrain::height(p.x, p.z), p.z}) * mat4::rotateY(radians(90.0f * float(p.rot)));
            *hidden = true;
            *yaw = radians(90.0f * float(p.rot)) + kPi;
            return m.transformPoint({0.0f, 0.0f, bi.depth * 0.5f + 0.6f});
        }
        s += desks;
    }
    // No office for them: they hang around the waiting room
    *yaw = kPi * 0.5f;
    return {-3.0f, F, 5.2f};
}

// ------------------------------------------------------------------ build
void StaffActors::build(CollisionWorld& cw) {
    // Navigation graph through the main building (floor plan in Layout.cpp)
    nav_.assign(NODE_COUNT, vec3(0));
    auto N = [&](int i, float x, float z, float y = F) { nav_[size_t(i)] = {x, y, z}; };
    N(OUT, 0.0f, 8.9f, 0.14f); N(WR_FRONT, 0.0f, 5.2f); N(WR_E, 2.4f, 4.4f); N(WR_W, -2.4f, 4.4f); N(WR_NE, 2.7f, 0.8f); N(WR_NW, -2.7f, 0.8f);
    N(DESK_FRONT, 0.0f, 0.1f); N(DESK_SEAT, 0.0f, -1.75f); N(DESK_SIDE, 2.5f, 0.0f); N(DESK_BACK, 2.5f, -1.8f);
    N(HL_E, -4.8f, 0.8f); N(HL_BATH, -6.0f, 0.8f); N(HL_OFF, -9.0f, 0.8f); N(OFFICE, -9.0f, 2.7f); N(OFFICE_VISIT, -7.8f, 3.7f);
    N(BATH_L, -6.0f, -1.4f); N(HR_W, 4.8f, 0.8f); N(HR_BATH, 5.5f, 0.8f); N(BATH_R, 5.5f, -1.4f); N(HR_APP, 8.0f, 0.8f); N(APP, 8.0f, 3.4f);
    N(HR_MED, 9.5f, 0.8f); N(MED, 9.5f, -1.2f); N(MED_DESK, 8.0f, -0.8f); N(HR_END, 10.4f, 0.8f); N(COFFEE, 10.85f, 0.8f);
    navEdges_.assign(NODE_COUNT, {});
    const int E[][2] = {{OUT, WR_FRONT}, {WR_FRONT, WR_E}, {WR_FRONT, WR_W}, {WR_E, WR_NE}, {WR_W, WR_NW}, {WR_NE, DESK_FRONT}, {WR_NW, DESK_FRONT},
                        {DESK_FRONT, DESK_SIDE}, {WR_NE, DESK_SIDE}, {DESK_SIDE, DESK_BACK}, {DESK_BACK, DESK_SEAT}, {WR_NW, HL_E}, {HL_E, HL_BATH},
                        {HL_BATH, HL_OFF}, {HL_OFF, OFFICE}, {OFFICE, OFFICE_VISIT}, {HL_BATH, BATH_L}, {WR_NE, HR_W}, {HR_W, HR_BATH},
                        {HR_BATH, BATH_R}, {HR_BATH, HR_APP}, {HR_APP, APP}, {HR_APP, HR_MED}, {HR_MED, MED}, {MED, MED_DESK}, {HR_MED, HR_END},
                        {HR_END, COFFEE}};
    for (auto& e : E) { navEdges_[size_t(e[0])].push_back(e[1]); navEdges_[size_t(e[1])].push_back(e[0]); }

    // ---- Maple Lane: the street, driveways, ten little houses with bedrooms ----
    MeshBuilder b, g, ln;
    Material asphalt = Material::make({0.16f, 0.16f, 0.17f}, 0.85f, 0.0f, PAT_ASPHALT);
    Material concrete = Material::make({0.62f, 0.62f, 0.6f}, 0.9f, 0.0f, PAT_CONCRETE);
    Material stripe = Material::make({0.9f, 0.75f, 0.1f}, 0.6f);
    ln.addBox(AABB({kMapleX - 4.0f, -0.2f, kHighwayZ + 7.0f}, {kMapleX + 4.0f, 0.035f, kMapleZ1}), asphalt);
    ln.addBox(AABB({kMapleX - 0.08f, 0.036f, kHighwayZ + 12.0f}, {kMapleX + 0.08f, 0.04f, kMapleZ1 - 2.0f}), stripe);
    const vec3 sidings[] = {{0.85f, 0.8f, 0.68f}, {0.62f, 0.72f, 0.8f}, {0.8f, 0.62f, 0.55f}, {0.7f, 0.78f, 0.62f}, {0.92f, 0.9f, 0.86f},
                            {0.75f, 0.68f, 0.8f}, {0.88f, 0.76f, 0.5f}, {0.6f, 0.66f, 0.6f}, {0.82f, 0.7f, 0.62f}, {0.66f, 0.74f, 0.86f}};
    Material glassM = Material::make({0.6f, 0.7f, 0.75f}, 0.05f, 0.0f, PAT_GLASS);
    glassM.alpha = 0.25f;
    Material roofM = Material::make({0.28f, 0.22f, 0.2f}, 0.8f, 0.0f, PAT_SHINGLE);
    Material floorM = Material::make({0.55f, 0.4f, 0.26f}, 0.6f, 0.0f, PAT_WOOD);
    Material trim = Material::make({0.95f, 0.95f, 0.93f}, 0.6f);
    for (int h = 0; h < kMapleHouses; ++h) {
        vec3 c = mapleHouse(h);
        float yaw = homeYaw(h);
        mat4 m = mat4::translate(c) * mat4::rotateY(yaw);
        Material wall = Material::make(sidings[h % 10], 0.75f, 0.0f, PAT_SIDING);
        Material paintIn = Material::make(sidings[(h + 3) % 10] * 1.05f, 0.85f);
        b.xf = m;
        g.xf = m;
        auto W = [&](vec3 lo, vec3 hi) {   // wall piece + collider (houses sit square to the axes)
            b.addBox(AABB(lo, hi), wall);
            vec3 a = m.transformPoint(lo), d = m.transformPoint(hi);
            if (hi.y - lo.y > 1.0f && lo.y < 0.5f) cw.addBox(AABB(vmin(a, d), vmax(a, d)));
        };
        b.addBox(AABB({-4.6f, -0.3f, -3.6f}, {4.6f, 0.1f, 3.6f}), concrete);
        {
            vec3 a = m.transformPoint({-4.6f, -0.3f, -3.6f}), d = m.transformPoint({4.6f, 0.1f, 3.6f});
            cw.addBox(AABB(vmin(a, d), vmax(a, d)), true);
        }
        b.addBox(AABB({-4.3f, 0.1f, -3.3f}, {4.3f, 0.11f, 3.3f}), floorM);
        W({-4.5f, 0.1f, -3.5f}, {4.5f, 3.0f, -3.3f});   // back
        W({-4.5f, 0.1f, -3.3f}, {-4.3f, 3.0f, 3.5f});   // sides
        W({4.3f, 0.1f, -3.3f}, {4.5f, 3.0f, 3.5f});
        // Front: door gap in the middle, a bedroom window (left) and a living-room window (right)
        W({-4.3f, 0.1f, 3.3f}, {-3.5f, 3.0f, 3.5f});
        W({-1.5f, 0.1f, 3.3f}, {-0.6f, 3.0f, 3.5f});
        W({0.6f, 0.1f, 3.3f}, {1.5f, 3.0f, 3.5f});
        W({3.5f, 0.1f, 3.3f}, {4.3f, 3.0f, 3.5f});
        b.addBox(AABB({-3.5f, 0.1f, 3.3f}, {-1.5f, 1.0f, 3.5f}), wall);
        b.addBox(AABB({1.5f, 0.1f, 3.3f}, {3.5f, 1.0f, 3.5f}), wall);
        {
            vec3 a = m.transformPoint({-3.5f, 0.1f, 3.3f}), d = m.transformPoint({-1.5f, 1.0f, 3.5f});
            cw.addBox(AABB(vmin(a, d), vmax(a, d)));
            a = m.transformPoint({1.5f, 0.1f, 3.3f}); d = m.transformPoint({3.5f, 1.0f, 3.5f});
            cw.addBox(AABB(vmin(a, d), vmax(a, d)));
        }
        b.addBox(AABB({-3.5f, 2.2f, 3.3f}, {-1.5f, 3.0f, 3.5f}), wall);
        b.addBox(AABB({1.5f, 2.2f, 3.3f}, {3.5f, 3.0f, 3.5f}), wall);
        b.addBox(AABB({-0.6f, 2.2f, 3.3f}, {0.6f, 3.0f, 3.5f}), wall);
        g.addBox(AABB({-3.5f, 1.0f, 3.38f}, {-1.5f, 2.2f, 3.42f}), glassM);
        g.addBox(AABB({1.5f, 1.0f, 3.38f}, {3.5f, 2.2f, 3.42f}), glassM);
        b.addBox(AABB({-3.6f, 0.95f, 3.5f}, {-1.4f, 1.02f, 3.62f}), trim);
        b.addBox(AABB({1.4f, 0.95f, 3.5f}, {3.6f, 1.02f, 3.62f}), trim);
        // Interior paint
        b.addBox(AABB({-4.3f, 0.11f, -3.3f}, {4.3f, 3.0f, -3.28f}), paintIn);
        // Ceiling + pitched roof (ridge along X)
        b.addBox(AABB({-4.5f, 2.95f, -3.5f}, {4.5f, 3.0f, 3.5f}), trim);
        b.addQuad({-4.8f, 3.0f, 3.9f}, {4.8f, 3.0f, 3.9f}, {4.8f, 4.5f, 0.0f}, {-4.8f, 4.5f, 0.0f}, roofM, {9.6f, 4.2f});
        b.addQuad({4.8f, 3.0f, -3.9f}, {-4.8f, 3.0f, -3.9f}, {-4.8f, 4.5f, 0.0f}, {4.8f, 4.5f, 0.0f}, roofM, {9.6f, 4.2f});
        for (float sx : {-4.5f, 4.5f}) {
            uint32_t v0 = b.addVertex({sx, 3.0f, -3.5f}, {sx > 0 ? 1.0f : -1.0f, 0, 0}, {0, 0}, wall);
            uint32_t v1 = b.addVertex({sx, 3.0f, 3.5f}, {sx > 0 ? 1.0f : -1.0f, 0, 0}, {7, 0}, wall);
            uint32_t v2 = b.addVertex({sx, 4.5f, 0.0f}, {sx > 0 ? 1.0f : -1.0f, 0, 0}, {3.5f, 1.5f}, wall);
            if (sx > 0) b.addTri(v0, v2, v1); else b.addTri(v0, v1, v2);
        }
        // Bedroom: bed (head against the back wall), pillow, nightstand with a lamp; living room: couch, table, TV
        Material frame = Material::make({0.4f, 0.28f, 0.18f}, 0.6f, 0.0f, PAT_WOOD);
        Material sheet = Material::make({0.9f, 0.9f, 0.92f}, 0.9f, 0.0f, PAT_FABRIC);
        b.addBox(AABB({-3.35f, 0.11f, -3.3f}, {-1.65f, 0.45f, -1.2f}), frame);
        b.addBox(AABB({-3.3f, 0.45f, -3.25f}, {-1.7f, 0.6f, -1.25f}), sheet);
        b.addBox(AABB({-3.2f, 0.6f, -3.2f}, {-1.8f, 0.72f, -2.8f}), sheet);
        b.addBox(AABB({-3.35f, 0.45f, -3.3f}, {-1.65f, 1.2f, -3.2f}), frame);   // headboard
        b.addBox(AABB({-1.5f, 0.11f, -3.25f}, {-1.0f, 0.6f, -2.75f}), frame);   // nightstand
        b.addCylinder({-1.25f, 0.6f, -3.0f}, 0.08f, 0.3f, 10, Material::make({1.0f, 0.9f, 0.7f}, 0.4f, 0.0f, PAT_PLAIN, 0.5f));
        Material couch = Material::make(sidings[(h + 5) % 10] * 0.55f, 0.9f, 0.0f, PAT_FABRIC);
        b.addBox(AABB({1.2f, 0.11f, -3.2f}, {3.8f, 0.55f, -2.4f}), couch);
        b.addBox(AABB({1.2f, 0.55f, -3.25f}, {3.8f, 1.0f, -2.95f}), couch);
        b.addBox(AABB({1.9f, 0.11f, -1.6f}, {3.1f, 0.5f, -1.0f}), frame);
        b.addBox(AABB({1.8f, 0.9f, 3.05f}, {3.2f, 1.7f, 3.15f}), Material::make({0.05f, 0.05f, 0.06f}, 0.3f));
        b.xf = mat4();
        g.xf = mat4();
        // Driveway, mailbox
        vec3 d = driveway(h);
        float dx0 = std::min(d.x, kMapleX + (h % 2 == 0 ? -4.0f : 4.0f)) - (h % 2 == 0 ? 6.0f : 0.0f);
        float dx1 = std::max(d.x, kMapleX + (h % 2 == 0 ? -4.0f : 4.0f)) + (h % 2 == 0 ? 0.0f : 6.0f);
        ln.addBox(AABB({dx0, -0.2f, d.z - 2.0f}, {dx1, 0.03f, d.z + 2.0f}), concrete);
        vec3 mb{kMapleX + (h % 2 == 0 ? -5.0f : 5.0f), 0.0f, c.z - 2.0f};
        b.addCylinder(mb, 0.05f, 1.1f, 8, frame);
        b.addBox(AABB(mb + vec3(-0.15f, 1.1f, -0.25f), mb + vec3(0.15f, 1.35f, 0.25f)), Material::make({0.2f, 0.25f, 0.5f}, 0.4f));
        char num[24];
        std::snprintf(num, sizeof num, "%d", 100 + h * 2);
        labels_.push_back({mb + vec3(h % 2 == 0 ? 0.16f : -0.16f, 1.25f, 0.0f), h % 2 == 0 ? kPi * 0.5f : -kPi * 0.5f, num, 10.0f, 0.8f,
                           IM_COL32(245, 245, 240, 255)});
        houseLights_.push_back({m.transformPoint({0.0f, 2.6f, -0.5f}), 6.0f, vec3(1.0f, 0.82f, 0.6f) * 4.0f});
    }
    // Street sign
    {
        vec3 p{kMapleX + 5.5f, 0.0f, kHighwayZ + 12.0f};
        b.addCylinder(p, 0.05f, 2.8f, 8, Material::make({0.5f, 0.52f, 0.55f}, 0.4f, 0.8f, PAT_METAL));
        b.addBox(AABB(p + vec3(-0.05f, 2.4f, -0.8f), p + vec3(0.05f, 2.7f, 0.8f)), Material::make({0.08f, 0.35f, 0.15f}, 0.5f));
        labels_.push_back({p + vec3(-0.07f, 2.55f, 0.0f), -kPi * 0.5f, "MAPLE LANE", 40.0f, 1.0f, IM_COL32(245, 245, 240, 255)});
        labels_.push_back({p + vec3(0.07f, 2.55f, 0.0f), kPi * 0.5f, "MAPLE LANE", 40.0f, 1.0f, IM_COL32(245, 245, 240, 255)});
    }
    houses_.upload(b);
    housesGlass_.upload(g);
    lane_.upload(ln);
    // Car (tinted per person), a blanket for sleepers, a coffee cup
    MeshBuilder cb;
    Facility::buildCar(cb, {0.85f, 0.85f, 0.85f});
    carMesh_.upload(cb);
    cb.clear();
    cb.addBox(AABB({-0.72f, -0.08f, -0.05f}, {0.72f, 0.1f, 1.45f}), Material::make({0.35f, 0.45f, 0.7f}, 0.95f, 0.0f, PAT_FABRIC));
    blanket_.upload(cb);
    cb.clear();
    cb.addCylinder({0, 0, 0}, 0.045f, 0.11f, 10, Material::make({0.92f, 0.92f, 0.9f}, 0.4f));
    cupMesh_.upload(cb);
    // The OPEN / CLOSED sign by the front door (outside, right of the door)
    cb.clear();
    cb.addBox(AABB({1.35f, 1.35f, 6.16f}, {2.05f, 1.85f, 6.2f}), Material::make({0.2f, 0.16f, 0.12f}, 0.6f));
    sign_.upload(cb);
    cb.clear();
    cb.addBox(AABB({1.4f, 1.4f, 6.2f}, {2.0f, 1.8f, 6.21f}), Material::make({0.15f, 0.9f, 0.35f}, 0.4f, 0.0f, PAT_PLAIN, 2.5f));
    signOpen_.upload(cb);
    cb.clear();
    cb.addBox(AABB({1.4f, 1.4f, 6.2f}, {2.0f, 1.8f, 6.21f}), Material::make({0.9f, 0.12f, 0.1f}, 0.4f, 0.0f, PAT_PLAIN, 2.0f));
    signClosed_.upload(cb);
    signBox_ = AABB({1.3f, 1.3f, 6.1f}, {2.1f, 1.9f, 6.3f});
    built_ = true;
}

// ------------------------------------------------------------------ paths
int StaffActors::nearestNode(vec3 p) const {
    const RoomSpec* room = roomAt(p.x, p.z);
    int best = WR_FRONT;
    float bd = 1e9f;
    for (int i = 1; i < NODE_COUNT; ++i) {
        const vec3& n = nav_[size_t(i)];
        if (roomAt(n.x, n.z) != room) continue;
        float d = flat(p, n);
        if (d < bd) { bd = d; best = i; }
    }
    return best;
}

std::vector<int> StaffActors::navPath(int from, int to) const {
    std::vector<float> dist(NODE_COUNT, 1e9f);
    std::vector<int> prev(NODE_COUNT, -1);
    using QE = std::pair<float, int>;
    std::priority_queue<QE, std::vector<QE>, std::greater<QE>> q;
    dist[size_t(from)] = 0.0f;
    q.push({0.0f, from});
    while (!q.empty()) {
        auto [d, u] = q.top();
        q.pop();
        if (d > dist[size_t(u)]) continue;
        if (u == to) break;
        for (int v : navEdges_[size_t(u)]) {
            float nd = d + flat(nav_[size_t(u)], nav_[size_t(v)]);
            if (nd < dist[size_t(v)]) { dist[size_t(v)] = nd; prev[size_t(v)] = u; q.push({nd, v}); }
        }
    }
    std::vector<int> out;
    for (int v = to; v >= 0; v = prev[size_t(v)]) out.push_back(v);
    std::reverse(out.begin(), out.end());
    if (out.empty() || out.front() != from) out = {from, to};
    return out;
}

std::vector<vec3> StaffActors::outdoorPath(vec3 a, vec3 b) const {
    if (!segHitsBox(a, b, kBuildingBox)) return {b};
    // Go around the building through its corners: try one corner, then two neighbouring corners
    std::vector<vec3> best;
    float bestLen = 1e9f;
    for (int i = 0; i < 4; ++i) {
        const vec3& c = kCorners[i];
        if (segHitsBox(a, c, kBuildingBox) || segHitsBox(c, b, kBuildingBox)) continue;
        float l = flat(a, c) + flat(c, b);
        if (l < bestLen) { bestLen = l; best = {c, b}; }
    }
    const int pairs[4][2] = {{0, 2}, {1, 3}, {0, 1}, {2, 3}};
    for (auto& pr : pairs)
        for (int k = 0; k < 2; ++k) {
            const vec3& c1 = kCorners[pr[k]];
            const vec3& c2 = kCorners[pr[1 - k]];
            if (segHitsBox(a, c1, kBuildingBox) || segHitsBox(c2, b, kBuildingBox)) continue;
            float l = flat(a, c1) + flat(c1, c2) + flat(c2, b);
            if (l < bestLen) { bestLen = l; best = {c1, c2, b}; }
        }
    if (best.empty()) best = {b};
    return best;
}

std::vector<vec3> StaffActors::planWalk(vec3 from, vec3 to) const {
    bool fi = inside(from), ti = inside(to);
    std::vector<vec3> out;
    auto appendNodes = [&](const std::vector<int>& ids) { for (int i : ids) out.push_back(nav_[size_t(i)]); };
    if (fi && ti) {
        appendNodes(navPath(nearestNode(from), nearestNode(to)));
    } else if (fi && !ti) {
        appendNodes(navPath(nearestNode(from), OUT));
        for (const vec3& p : outdoorPath(nav_[OUT], to)) out.push_back(p);
        return out;
    } else if (!fi && ti) {
        for (const vec3& p : outdoorPath(from, nav_[OUT])) out.push_back(p);
        appendNodes(navPath(OUT, nearestNode(to)));
    } else {
        return outdoorPath(from, to);
    }
    out.push_back(to);
    return out;
}

void StaffActors::goTo(Actor& a, vec3 to, int task, float faceYaw, float timer) {
    a.path = planWalk(a.pos, to);
    a.task = task;
    a.faceYaw = faceYaw;
    a.timer = timer;
    if (a.inBuilding) { a.inBuilding = false; a.visible = true; }
}

// ------------------------------------------------------------------ cars
void StaffActors::driveToWork(Actor& a, const World& world) {
    const float gz = world.facility.gateZ;
    vec3 d = driveway(a.home), s = spotPos(a.spot);
    a.carPath = {{{kMapleX + 1.8f, 0, d.z}, true},
                 {{kMapleX + 1.8f, 0, kHighwayZ + 11.0f}, false},
                 {{kMapleX + 14.0f, 0, kHighwayZ + 1.9f}, false},
                 {{-14.0f, 0, kHighwayZ + 1.9f}, false},
                 {{1.8f, 0, kHighwayZ - 12.0f}, false},
                 {{1.8f, 0, gz + 8.0f}, false},
                 {{1.8f, 0, 44.0f}, false},
                 {{1.8f, 0, 26.0f}, false},
                 {{s.x, 0, 26.0f}, false},
                 {s, false}};
    a.carDest = 1;
    a.place = 1;
    a.visible = false;
    a.doing = "Driving to work";
}

void StaffActors::driveHome(Actor& a) {
    vec3 d = driveway(a.home), s = spotPos(a.spot);
    a.carPath = {{{s.x, 0, 26.0f}, true},
                 {{-1.8f, 0, 30.0f}, false},
                 {{-1.8f, 0, 44.0f}, false},
                 {{-1.8f, 0, kHighwayZ - 12.0f}, false},
                 {{-14.0f, 0, kHighwayZ - 1.9f}, false},
                 {{kMapleX + 14.0f, 0, kHighwayZ - 1.9f}, false},
                 {{kMapleX - 1.8f, 0, kHighwayZ + 11.0f}, false},
                 {{kMapleX - 1.8f, 0, d.z}, false},
                 {d, false}};
    a.carDest = 2;
    a.place = 1;
    a.visible = false;
    a.doing = "Driving home";
}

// ------------------------------------------------------------------ routine
bool StaffActors::atHomeTime(const Sim& sim, const Employee& e) const {
    float hour = sim.clock.hour();
    bool commute = sim.worksToday(e) && e.leftDay != sim.clock.day() && hour >= sim.arriveHour(e) - 1.3f && hour < 21.0f;
    return !sim.staffOnSite(e) && !commute;
}

void StaffActors::startTask(Sim& sim, Actor& a, const AnimalActors& animals, const World& world) {
    Employee* e = sim.staff.find(a.empId);
    if (!e) return;
    Job job = sim.jobOf(*e);
    int day = sim.clock.day();
    float r = rng_.uniform();
    auto nearAnimal = [&](int animalId, int task, float time) -> bool {
        const AnimalActor* act = animals.find(animalId);
        if (!act) return false;
        vec3 ap = act->pos;
        vec3 away = a.pos - ap;
        away.y = 0.0f;
        float l = length(away);
        vec3 dir = l > 0.01f ? away / l : vec3(0, 0, 1);
        vec3 stand = ap + dir * 1.3f;
        stand.y = inside(ap) ? F : 0.0f;
        goTo(a, stand, task, std::atan2(-dir.x, -dir.z), time);
        a.taskAnimal = animalId;
        return true;
    };
    auto randomAnimal = [&]() {
        std::vector<int> ids;
        for (const Animal& an : sim.animalList) if (an.inCare() && animals.find(an.id)) ids.push_back(an.id);
        return ids.empty() ? -1 : ids[size_t(rng_.next() % ids.size())];
    };
    auto chat = [&]() {
        static const vec3 spots[5] = {{-1.2f, F, 4.5f}, {0.0f, F, 5.4f}, {1.2f, F, 4.5f}, {-2.3f, F, 5.4f}, {2.3f, F, 5.4f}};
        vec3 p = spots[size_t((a.empId + day) % 5)];
        goTo(a, p, TChat, std::atan2(0.0f - p.x, 4.8f - p.z), rng_.range(50.0f, 110.0f));
        a.doing = sim.shelterOpen ? "Taking a break" : "Chatting with coworkers";
    };
    auto desk = [&](float t) {
        float yaw;
        bool hidden;
        vec3 p = deskPos(sim, sim.officeSlot(a.empId), &yaw, &hidden);
        goTo(a, p, TDesk, yaw, t);
        a.inBuilding = false;
        a.doing = sim.officeSlot(a.empId) < 0 ? "Waiting for an office" : "At their desk";
    };
    if (sim.incident.active && job != Job::FrontDesk) {
        goTo(a, nav_[WR_W], TShelter, 0.0f, 20.0f);
        a.doing = "Sheltering inside (dangerous animal)";
        return;
    }
    if (e->calledToOffice) {
        goTo(a, nav_[OFFICE_VISIT], TOffice, 0.0f, 25.0f);
        a.doing = "In your office";
        return;
    }
    if (!a.hadCoffee) {
        goTo(a, nav_[COFFEE], TCoffee, kPi * 0.5f, 18.0f);
        a.doing = "Getting coffee";
        return;
    }
    if (!sim.shelterOpen) {
        // Early, before you open: chat over coffee, peek in on the animals now and then
        if (r < 0.25f) {
            int id = randomAnimal();
            if (id >= 0 && nearAnimal(id, TCheck, 12.0f)) { a.doing = "Checking on the animals"; return; }
        }
        chat();
        return;
    }
    switch (job) {
    case Job::FrontDesk:
        goTo(a, nav_[DESK_SEAT], TDesk, 0.0f, 80.0f);
        a.doing = "At the front desk";
        return;
    case Job::Rounds: {
        int best = -1;
        float bd = 1e9f;
        for (const Animal& an : sim.animalList) {
            if (!an.inCare() || an.checkedDay == day) continue;
            const AnimalActor* act = animals.find(an.id);
            if (!act) continue;
            float d = flat(act->pos, a.pos);
            if (d < bd) { bd = d; best = an.id; }
        }
        if (best >= 0 && nearAnimal(best, TCheck, 14.0f)) { a.doing = "Doing rounds (daily check-ups)"; return; }
        if (r < 0.4f) {
            int id = randomAnimal();
            if (id >= 0 && nearAnimal(id, TCheck, 10.0f)) { a.doing = "Checking on the animals"; return; }
        }
        if (r < 0.75f) { desk(60.0f); return; }
        chat();
        return;
    }
    case Job::Clinic: {
        int id = sim.animalNeedingVet();
        if (id >= 0) {
            const Animal* an = sim.findAnimal(id);
            bool surgery = an && an->needsSurgery && e->role == Role::Veterinarian && !(an->owned && !an->ownerConsented) && !sim.surgery.active;
            if (surgery) {
                goTo(a, kTableSpot, TSurgery, kPi, 40.0f);
                a.taskAnimal = id;
                a.doing = "Operating on " + an->name;
                return;
            }
            if (nearAnimal(id, TTreat, 16.0f)) { a.doing = "Examining " + (an ? an->name : std::string("an animal")); return; }
        }
        if (r < 0.2f) {
            int rid = randomAnimal();
            if (rid >= 0 && nearAnimal(rid, TCheck, 10.0f)) { a.doing = "Checking on the animals"; return; }
        }
        if (r < 0.85f) { desk(70.0f); return; }
        chat();
        return;
    }
    default: {   // Roam
        if (r < 0.4f) {
            AABB y = sim.land.yard();
            for (int tries = 0; tries < 8; ++tries) {
                vec3 p{rng_.range(y.min.x + 5.0f, y.max.x - 5.0f), 0.0f, rng_.range(y.min.z + 5.0f, y.max.z - 5.0f)};
                if (segHitsBox(p, p, kBuildingBox)) continue;
                goTo(a, p, TRoam, rng_.range(0.0f, 2.0f * kPi), rng_.range(6.0f, 14.0f));
                a.doing = "Walking the facility";
                return;
            }
        }
        if (r < 0.75f) {
            int id = randomAnimal();
            if (id >= 0 && nearAnimal(id, TCheck, 10.0f)) { a.doing = "Checking on the animals"; return; }
        }
        chat();
        return;
    }
    }
    (void)world;
}

void StaffActors::placeAll(Sim& sim, World& world) {
    actors_.clear();
    update(sim, world, AnimalActors(), 0.0f, 0.0f, vec3(0));
}

void StaffActors::update(Sim& sim, World& world, const AnimalActors& animals, float gdt, float time, vec3 camPos) {
    if (!built_) return;
    float hour = sim.clock.hour();
    int day = sim.clock.day();
    // Actors follow the roster: new hires appear at home, people who left disappear
    for (auto it = actors_.begin(); it != actors_.end();) {
        if (!sim.staff.find(it->first)) it = actors_.erase(it);
        else ++it;
    }
    const auto& roster = peopleRoster();
    int index = 0;
    for (const Employee& e : sim.staff.employees) {
        int myIndex = index++;
        if (actors_.count(e.id)) continue;
        auto a = std::make_unique<Actor>();
        a->empId = e.id;
        a->personId = e.personId;
        a->model = std::make_unique<CharacterModel>();
        const Person* p = findPerson(e.personId);
        a->model->build(p ? p->looks : roster[size_t(e.personId) % roster.size()].looks);
        a->home = (e.personId * 3 + e.id) % kMapleHouses;
        a->spot = myIndex % 10;
        static const vec3 paints[] = {{0.8f, 0.8f, 0.82f}, {0.12f, 0.12f, 0.14f}, {0.2f, 0.3f, 0.6f}, {0.55f, 0.1f, 0.08f}, {0.3f, 0.5f, 0.35f},
                                      {0.85f, 0.75f, 0.45f}, {0.45f, 0.45f, 0.48f}, {0.9f, 0.9f, 0.88f}};
        a->carTint = vec4(paints[size_t(e.personId) % 8], 1.0f);
        // Where they'd be right now
        if (sim.staffOnSite(e)) {
            a->place = 2;
            a->carPos = spotPos(a->spot);
            a->carYaw = spotYaw(a->spot);
            a->hadCoffee = true;
            float yaw;
            bool hidden;
            a->pos = sim.shelterOpen ? deskPos(sim, sim.officeSlot(e.id), &yaw, &hidden) : nav_[WR_FRONT];
            if (sim.jobOf(e) == Job::FrontDesk && sim.shelterOpen) a->pos = nav_[DESK_SEAT];
            a->doing = "At work";
        } else {
            a->place = 0;
            vec3 d = driveway(a->home);
            a->carPos = d;
            a->carYaw = a->home % 2 == 0 ? -kPi * 0.5f : kPi * 0.5f;
            a->pos = homeInside(a->home);
            a->doing = "At home";
        }
        actors_[e.id] = std::move(a);
    }

    bool gateCar = false;
    for (auto& [id, ap] : actors_) {
        Actor& a = *ap;
        Employee* e = sim.staff.find(id);
        if (!e) continue;
        bool onSite = sim.staffOnSite(*e);
        bool commute = sim.worksToday(*e) && e->leftDay != day && hour >= sim.arriveHour(*e) - 1.3f && hour < 21.0f;
        // ---- Car ----
        if (a.carDest && !a.carPath.empty()) {
            const Waypoint& w = a.carPath.front();
            vec3 to = w.p - a.carPos;
            to.y = 0.0f;
            float dist = length(to);
            bool highway = std::fabs(a.carPos.z - kHighwayZ) < 6.0f && std::fabs(w.p.z - kHighwayZ) < 6.0f;
            float speed = highway ? 24.0f : (a.carPath.size() <= 2 ? 4.5f : 11.0f);
            if (w.reverse) speed = 2.5f;
            if (flat(a.carPos, camPos) > 350.0f) speed *= 6.0f;   // nobody's watching: the commute passes quickly
            float step = speed * gdt;
            if (dist <= step || dist < 0.05f) {
                a.carPos = vec3(w.p.x, 0.0f, w.p.z);
                a.carPath.erase(a.carPath.begin());
            } else {
                vec3 dir = to / dist;
                a.carPos += dir * step;
                float want = std::atan2(dir.x, dir.z) + (w.reverse ? kPi : 0.0f);
                a.carYaw += clampf(std::remainder(want - a.carYaw, 2.0f * kPi), -gdt * 2.5f, gdt * 2.5f);
            }
            a.carPos.y = terrain::height(a.carPos.x, a.carPos.z);
            if (std::fabs(a.carPos.x) < 30.0f && std::fabs(a.carPos.z - world.facility.gateZ) < 40.0f) gateCar = true;
            if (a.carPath.empty()) {
                // Arrived: step out beside the car
                vec3 side = a.carPos + vec3(std::cos(a.carYaw), 0.0f, -std::sin(a.carYaw)) * 1.4f;
                a.pos = side;
                a.visible = true;
                if (a.carDest == 1) {
                    a.carDest = 0;
                    a.place = 2;
                    a.hadCoffee = false;
                    a.cup = false;
                    a.task = TNone;
                    a.timer = 0.0f;
                    a.doing = "Just got to work";
                } else {
                    a.carDest = 0;
                    a.place = 0;
                    a.path = {homeDoor(a.home), homeInside(a.home)};
                    a.task = THomeWalkIn;
                    a.doing = "Home for the night";
                }
            }
        }
        // ---- Person ----
        if (a.place == 0) {           // at home
            if ((commute || onSite) && a.task != TLeaveHouse && a.carDest == 0) {
                a.sleeping = false;
                a.visible = true;
                vec3 carSide = a.carPos + vec3(std::cos(a.carYaw), 0.0f, -std::sin(a.carYaw)) * 1.4f;
                a.path = {homeDoor(a.home), carSide};
                a.task = TLeaveHouse;
                a.doing = "Heading out to work";
            } else if (a.path.empty()) {
                if (a.task == TLeaveHouse) { driveToWork(a, world); }
                else {
                    float wake = sim.worksToday(*e) ? 5.2f : 7.5f;
                    a.sleeping = hour >= 22.0f || hour < wake;
                    a.visible = true;
                    a.pos = homeInside(a.home);
                    a.doing = a.sleeping ? "Asleep at home" : (sim.worksToday(*e) ? "At home (off work)" : "Day off, at home");
                }
            }
        } else if (a.place == 2) {    // at work
            if (!onSite && !commute && a.task != TWalkToCar) {   // (arriving early is fine; leave once the day is over)
                vec3 carSide = a.carPos + vec3(std::cos(a.carYaw), 0.0f, -std::sin(a.carYaw)) * 1.4f;
                goTo(a, carSide, TWalkToCar, 0.0f, 0.0f);
                a.cup = false;
                a.doing = "Walking to their car";
            } else if (onSite && e->calledToOffice && a.task != TOffice && a.task != TWalkToCar) {
                goTo(a, nav_[OFFICE_VISIT], TOffice, 0.0f, 25.0f);
                a.doing = "Coming to your office";
            } else if (a.path.empty()) {
                a.timer -= gdt;
                if (a.task == TOffice && e->calledToOffice) a.timer = std::max(a.timer, 1.0f);   // waits until you send them back
                if (a.timer <= 0.0f) {
                    switch (a.task) {
                    case TCoffee: a.hadCoffee = true; a.cup = true; a.cupTimer = 300.0f; break;
                    case TCheck: if (a.taskAnimal >= 0) sim.staffCheckAnimal(a.empId, a.taskAnimal); break;
                    case TTreat:
                    case TSurgery: if (a.taskAnimal >= 0) sim.staffTreat(a.empId, a.taskAnimal); break;
                    case TWalkToCar: driveHome(a); break;
                    default: break;
                    }
                    a.taskAnimal = -1;
                    if (a.place == 2) startTask(sim, a, animals, world);
                } else if (a.task == TDesk && a.path.empty() && !a.inBuilding) {
                    float yaw;
                    bool hidden;
                    deskPos(sim, sim.officeSlot(a.empId), &yaw, &hidden);
                    if (hidden) { a.inBuilding = true; a.visible = false; a.doing = "Working in their office"; }
                }
            }
        }
        if (a.cup) { a.cupTimer -= gdt; if (a.cupTimer <= 0.0f) a.cup = false; }
        // Walk the path
        float speed = 0.0f;
        if (!a.path.empty() && a.place != 1) {
            vec3 to = a.path.front() - a.pos;
            to.y = 0.0f;
            float dist = length(to);
            speed = 1.3f;
            float step = speed * gdt;
            if (flat(a.pos, camPos) > 150.0f) step *= 3.0f;
            if (dist <= step || dist < 0.03f) {
                a.pos.x = a.path.front().x;
                a.pos.z = a.path.front().z;
                a.path.erase(a.path.begin());
                if (a.path.empty()) {
                    a.yaw = a.faceYaw;
                    if (a.task == TWalkToCar || a.task == TLeaveHouse) a.timer = 0.0f;
                }
            } else {
                vec3 dir = to / dist;
                a.pos += dir * step;
                float want = std::atan2(dir.x, dir.z);
                a.yaw += clampf(std::remainder(want - a.yaw, 2.0f * kPi), -gdt * 8.0f, gdt * 8.0f);
            }
            a.pos.y = world.collision.groundHeight(a.pos.x, a.pos.z, a.pos.y + 0.6f, 0.5f);
            // Doors open as people walk through them
            for (size_t i = 0; i < world.facility.doors.size(); ++i) {
                const DoorSpec& ds = world.facility.doors[i].spec;
                vec3 dc = ds.alongX ? vec3(ds.center, 0, ds.fixed) : vec3(ds.fixed, 0, ds.center);
                if (flat(dc, a.pos) < 1.4f && !world.facility.doors[i].locked)
                    world.facility.doors[i].swing.target = 1.0f;
            }
        }
        if (a.place == 2 && a.path.empty() && a.task == TDesk && sim.jobOf(*e) == Job::FrontDesk) a.yaw = 0.0f;
        // Animate the people you can see
        bool near = a.visible && flat(a.pos, camPos) < 120.0f;
        a.walk += (std::min(1.0f, speed / 1.2f) - a.walk) * std::min(1.0f, gdt * 6.0f);
        a.phase += speed * gdt * 2.2f;
        float holdTarget = a.cup ? 0.55f : ((a.task == TSurgery || a.task == TTreat) && a.path.empty() ? 1.0f : 0.0f);
        a.hold += (holdTarget - a.hold) * std::min(1.0f, gdt * 4.0f);
        if (a.task == TChat && a.path.empty()) a.look = std::sin(time * 0.6f + float(id)) * 0.5f;
        else a.look *= 0.9f;
        if (near) a.model->animate(time + float(id) * 1.3f, a.phase, a.walk, a.look, a.hold);
    }
    world.facility.staffAtGate = gateCar;
}

// ------------------------------------------------------------------ draw
void StaffActors::draw(Renderer& r, Pass p, vec3 camPos, bool shelterOpen) const {
    if (!built_) return;
    if (p == Pass::Transparent) {
        if (flat(camPos, {kMapleX, 0, kHighwayZ + 90.0f}) < 2500.0f) r.draw(housesGlass_);
        return;
    }
    if (flat(camPos, {kMapleX, 0, kHighwayZ + 90.0f}) < 2500.0f) {
        r.draw(houses_);
        r.draw(lane_);
    }
    r.draw(sign_);
    if (p != Pass::Shadow) r.draw(shelterOpen ? signOpen_ : signClosed_);
    for (const auto& [id, ap] : actors_) {
        const Actor& a = *ap;
        // The car (parked or on the road)
        if (flat(a.carPos, camPos) < 900.0f)
            r.draw(carMesh_, mat4::translate(a.carPos + vec3(0, 0.03f, 0)) * mat4::rotateY(a.carYaw), a.carTint);
        if (!a.visible || a.place == 1) continue;
        if (flat(a.pos, camPos) > 120.0f) continue;
        if (a.place == 0 && a.sleeping) {
            mat4 bed = bedTransform(a.home);
            a.model->draw(r, bed);
            r.draw(blanket_, mat4::translate(mapleHouse(a.home)) * mat4::rotateY(homeYaw(a.home)) * mat4::translate({-2.5f, 0.92f, -2.25f}) *
                                 mat4::scale({0.8f, 0.5f, 0.62f}));
            continue;
        }
        mat4 root = mat4::translate(a.pos) * mat4::rotateY(a.yaw);
        a.model->draw(r, root);
        if (a.cup) r.draw(cupMesh_, root * mat4::translate({0.12f, 1.08f, 0.33f}));
    }
}

void StaffActors::appendLights(std::vector<PointLight>& out, vec3 camPos, float night) const {
    if (!built_ || night < 0.2f) return;
    for (const auto& [id, ap] : actors_) {
        const Actor& a = *ap;
        if (a.place != 0) continue;
        PointLight l = houseLights_[size_t(a.home)];
        if (a.sleeping) l.color = l.color * 0.12f;   // just the nightlight
        if (flat(l.pos, camPos) < 250.0f) out.push_back(l);
    }
}

void StaffActors::drawLabels(const Sim& sim, const Camera& cam, int W, int H) const {
    if (!built_) return;
    ImDrawList* dl = ImGui::GetBackgroundDrawList();
    mat4 vp = cam.viewProj();
    auto put = [&](vec3 pos, float yaw, const std::string& text, float maxDist, float scale, ImU32 col, bool facing, bool box) {
        vec3 toCam = cam.pos - pos;
        float dist = length(toCam);
        if (dist > maxDist) return;
        if (facing && dot(vec3(std::sin(yaw), 0, std::cos(yaw)), toCam) < 0.0f) return;
        vec4 c = vp * vec4(pos, 1.0f);
        if (c.w <= 0.1f) return;
        float sx = (c.x / c.w * 0.5f + 0.5f) * float(W), sy = (1.0f - (c.y / c.w * 0.5f + 0.5f)) * float(H);
        if (sx < -200 || sx > float(W) + 200 || sy < -100 || sy > float(H) + 100) return;
        float s = clampf(10.0f / dist, 0.5f, 1.2f) * scale;
        ImFont* f = ImGui::GetFont();
        float fs = ImGui::GetFontSize() * s;
        ImVec2 sz = f->CalcTextSizeA(fs, 1e9f, 0.0f, text.c_str());
        ImVec2 p0(sx - sz.x * 0.5f, sy - sz.y * 0.5f);
        if (box) dl->AddRectFilled(ImVec2(p0.x - 5, p0.y - 3), ImVec2(p0.x + sz.x + 5, p0.y + sz.y + 3), IM_COL32(15, 20, 18, 170), 4.0f);
        dl->AddText(f, fs, p0, col, text.c_str());
    };
    for (const Label& l : labels_) put(l.pos, l.yaw, l.text, l.maxDist, l.scale, l.color, true, false);
    put({1.7f, 1.6f, 6.25f}, 0.0f, sim.shelterOpen ? "OPEN" : "CLOSED", 14.0f, 1.1f, IM_COL32(255, 255, 255, 255), true, false);
    // Name tags over your staff when you're close
    for (const auto& [id, ap] : actors_) {
        const Actor& a = *ap;
        if (!a.visible || a.place == 1 || a.sleeping) continue;
        const Employee* e = nullptr;
        for (const Employee& x : sim.staff.employees) if (x.id == id) e = &x;
        if (!e) continue;
        std::string t = e->name + "\n" + a.doing;
        put(a.pos + vec3(0, 2.05f, 0), 0.0f, t, 9.0f, 0.85f, IM_COL32(235, 245, 235, 255), false, true);
    }
}

bool StaffActors::pickSign(vec3 eye, vec3 fwd, float* dist) const {
    float t = rayAABB(eye, fwd, signBox_);
    if (dist) *dist = t;
    return t >= 0.0f && t < 3.0f;
}

std::string StaffActors::status(int employeeId) const {
    auto it = actors_.find(employeeId);
    return it == actors_.end() ? std::string("At home") : it->second->doing;
}

bool StaffActors::homeView(int employeeId, vec3* eye, float* yawDeg) const {
    auto it = actors_.find(employeeId);
    if (it == actors_.end()) return false;
    int h = it->second->home;
    mat4 m = mat4::translate(mapleHouse(h)) * mat4::rotateY(homeYaw(h));
    vec3 e = m.transformPoint({-0.4f, 0.1f, -0.6f}), bed = m.transformPoint({-2.5f, 0.5f, -2.3f});
    *eye = e;
    *yawDeg = degrees(std::atan2(bed.x - e.x, bed.z - e.z));
    return true;
}

vec3 StaffActors::positionOf(int employeeId) const {
    auto it = actors_.find(employeeId);
    if (it == actors_.end()) return vec3(0);
    const Actor& a = *it->second;
    return a.place == 1 ? a.carPos : a.pos;
}

}  // namespace ps
