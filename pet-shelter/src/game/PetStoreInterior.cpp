#include "game/PetStoreInterior.h"
#include "game/People.h"
#include "world/Layout.h"
#include <imgui.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>

namespace ps {
using namespace layout;

namespace {
// Store-local frame: x across the store (0 = the door), z from the front wall inward, y up.
const float kHalfW = 20.0f, kDepth = 18.0f, kWallH = 5.0f, kWall = 0.3f, kFloor = 0.06f;
const float kAisleZ = 5.5f;                  // the cross aisle just inside the door
const vec3 kPaySpot{-6.0f, kFloor, 4.5f}, kWaitSpot{-3.0f, kFloor, 5.5f}, kCashierSpot{-6.0f, kFloor, 2.2f};

Material mat(vec3 c, float rough = 0.7f, float metal = 0.0f, int pat = PAT_PLAIN, float emis = 0.0f) {
    return Material::make(c, rough, metal, pat, emis);
}
std::string ageText(const StoreAnimal& a, const Species& sp) {
    float years = a.ageFrac * std::max(0.3f, float(sp.lifespanYears) * 0.15f);
    char b[32];
    if (years < 1.0f) {
        int m = std::max(1, int(std::round(years * 12.0f)));
        std::snprintf(b, sizeof b, "%d month%s", m, m == 1 ? "" : "s");
    } else {
        int y = int(std::round(years));
        std::snprintf(b, sizeof b, "%d year%s", y, y == 1 ? "" : "s");
    }
    return b;
}
}  // namespace

vec3 PetStoreInterior::L(float x, float y, float z) const { return {kPetStoreX + x, y, kPetStoreZ - 8.0f + z}; }

AABB PetStoreInterior::interiorBox() {
    return AABB({kPetStoreX - kHalfW + kWall, -0.5f, kPetStoreZ - 8.0f + kWall}, {kPetStoreX + kHalfW - kWall, kWallH - 0.05f, kPetStoreZ - 8.0f + kDepth - kWall});
}

// ------------------------------------------------------------------ build
void PetStoreInterior::build(CollisionWorld& cw) {
    MeshBuilder b, w, g, wt, lp;
    const Material siding = mat({0.82f, 0.76f, 0.62f}, 0.7f, 0.0f, PAT_SIDING);
    const Material paint = mat({0.94f, 0.92f, 0.86f}, 0.8f);
    const Material accent = mat({0.72f, 0.14f, 0.1f}, 0.6f);
    const Material floorTile = mat({0.8f, 0.8f, 0.78f}, 0.35f, 0.0f, PAT_TILE);
    const Material roof = mat({0.3f, 0.3f, 0.32f}, 0.6f);
    const Material ceiling = mat({0.95f, 0.95f, 0.93f}, 0.9f);
    const Material steel = mat({0.72f, 0.74f, 0.77f}, 0.35f, 0.9f, PAT_METAL);
    const Material darkSteel = mat({0.25f, 0.26f, 0.28f}, 0.4f, 0.8f, PAT_METAL);
    const Material wood = mat({0.5f, 0.34f, 0.2f}, 0.6f, 0.0f, PAT_WOOD);
    const Material counterTop = mat({0.18f, 0.19f, 0.21f}, 0.25f);
    const Material wireM = mat({0.62f, 0.64f, 0.66f}, 0.4f, 1.0f, PAT_FENCE);
    Material glassM = mat({0.6f, 0.7f, 0.75f}, 0.05f, 0.0f, PAT_GLASS);
    glassM.alpha = 0.22f;
    Material waterM = mat({0.25f, 0.5f, 0.75f}, 0.05f, 0.0f, PAT_GLASS);
    waterM.alpha = 0.5f;
    const Material rubber = mat({0.22f, 0.33f, 0.28f}, 0.9f);
    const Material kibble = mat({0.45f, 0.28f, 0.14f}, 0.9f);
    const Material seed = mat({0.8f, 0.7f, 0.4f}, 0.9f);
    const Material sand = mat({0.82f, 0.7f, 0.48f}, 0.95f);
    const Material rock = mat({0.45f, 0.42f, 0.4f}, 0.9f);
    const Material white = mat({0.96f, 0.96f, 0.94f}, 0.6f);
    const Material fabricRed = mat({0.55f, 0.18f, 0.16f}, 0.9f, 0.0f, PAT_FABRIC);
    const Material fabricBlue = mat({0.2f, 0.3f, 0.55f}, 0.9f, 0.0f, PAT_FABRIC);
    auto box = [&](MeshBuilder& mb, vec3 a, vec3 c, const Material& m) { mb.addBox(AABB(L(a.x, a.y, a.z), L(c.x, c.y, c.z)), m); };
    auto solid = [&](vec3 a, vec3 c) { return cw.addBox(AABB(L(a.x, a.y, a.z), L(c.x, c.y, c.z))); };
    auto panel = [&](float x0, float z0, float x1, float z1, float y0, float y1) {   // wire mesh with a steel frame
        float len = std::max(0.01f, std::hypot(x1 - x0, z1 - z0));
        w.addQuad(L(x0, y0, z0), L(x1, y0, z1), L(x1, y1, z1), L(x0, y1, z0), wireM, {len, y1 - y0});
        box(b, {std::min(x0, x1) - 0.02f, y1 - 0.02f, std::min(z0, z1) - 0.02f}, {std::max(x0, x1) + 0.02f, y1 + 0.02f, std::max(z0, z1) + 0.02f}, steel);
        box(b, {x0 - 0.025f, y0, z0 - 0.025f}, {x0 + 0.025f, y1, z0 + 0.025f}, steel);
        box(b, {x1 - 0.025f, y0, z1 - 0.025f}, {x1 + 0.025f, y1, z1 + 0.025f}, steel);
    };
    auto bowls = [&](vec3 food, vec3 water, float r, bool dispenser, const Material& fill) {
        for (int i = 0; i < 2; ++i) {
            vec3 p = i ? water : food;
            b.addCylinder(L(p.x, p.y, p.z), r, r * 0.45f, 16, steel, true, r * 1.15f);
            if (!i) b.addCylinder(L(p.x, p.y + r * 0.3f, p.z), r * 0.85f, r * 0.12f, 12, fill);
            else wt.addCylinder(L(p.x, p.y + r * 0.1f, p.z), r * 0.9f, r * 0.3f, 12, waterM);
            if (dispenser) {   // gravity dispenser: a clear tank standing in the bowl, food or water inside
                g.addCylinder(L(p.x, p.y + r * 0.45f, p.z - r * 0.2f), r * 0.55f, r * 3.2f, 14, glassM);
                if (!i) b.addCylinder(L(p.x, p.y + r * 0.45f, p.z - r * 0.2f), r * 0.5f, r * 1.9f, 12, fill);
                else wt.addCylinder(L(p.x, p.y + r * 0.45f, p.z - r * 0.2f), r * 0.5f, r * 2.2f, 12, waterM);
                box(b, {p.x - r * 0.6f, p.y + r * 3.6f, p.z - r * 0.8f}, {p.x + r * 0.6f, p.y + r * 3.75f, p.z + r * 0.4f}, darkSteel);
            }
        }
    };
    auto tagBoard = [&](vec3 at, float yaw) {   // white name card with a red header
        mat4 saved = b.xf;
        b.xf = mat4::translate(L(at.x, at.y, at.z)) * mat4::rotateY(yaw);
        b.addBox(AABB({-0.24f, -0.17f, 0.0f}, {0.24f, 0.17f, 0.02f}), white);
        b.addBox(AABB({-0.24f, 0.11f, 0.02f}, {0.24f, 0.17f, 0.025f}), accent);
        b.xf = saved;
    };

    // ---- Shell: floor, walls (door + windows at the front), roof, awning ----
    box(b, {-kHalfW, -0.5f, 0.0f}, {kHalfW, kFloor, kDepth}, floorTile);
    box(b, {-2.2f, kFloor, -0.8f}, {2.2f, kFloor + 0.01f, 1.6f}, mat({0.15f, 0.2f, 0.18f}, 0.95f, 0.0f, PAT_CARPET));   // entry mat
    const float doorH = 2.6f, winLo = 0.9f, winHi = 3.3f;
    auto frontPiece = [&](float x0, float x1, float y0, float y1) {
        box(b, {x0, y0, 0.0f}, {x1, y1, kWall}, siding);
        box(b, {x0, y0, kWall}, {x1, y1, kWall + 0.02f}, paint);
        if (y0 < 2.0f) solid({x0, 0.0f, 0.0f}, {x1, y1, kWall});
    };
    frontPiece(-kHalfW, kHalfW, winHi, kWallH);                  // above the windows
    frontPiece(-kHalfW, -1.3f, 0.0f, winLo);                     // below the windows (door gap in the middle)
    frontPiece(1.3f, kHalfW, 0.0f, winLo);
    frontPiece(-kHalfW, -18.0f, winLo, winHi);                   // window posts
    frontPiece(-3.0f, -1.3f, winLo, winHi);
    frontPiece(1.3f, 3.0f, winLo, winHi);
    frontPiece(18.0f, kHalfW, winLo, winHi);
    frontPiece(-1.3f, 1.3f, doorH, winHi);                       // over the door
    solid({-kHalfW, 0.0f, 0.0f}, {-1.3f, 2.4f, kWall});          // windows are solid glass
    solid({1.3f, 0.0f, 0.0f}, {kHalfW, 2.4f, kWall});
    for (float x0 : {-18.0f, 3.0f}) g.addBox(AABB(L(x0, winLo, 0.12f), L(x0 + 15.0f, winHi, 0.16f)), glassM);
    // Back and side walls
    box(b, {-kHalfW, 0.0f, kDepth - kWall}, {kHalfW, kWallH, kDepth}, siding);
    box(b, {-kHalfW, 0.0f, 0.0f}, {-kHalfW + kWall, kWallH, kDepth}, siding);
    box(b, {kHalfW - kWall, 0.0f, 0.0f}, {kHalfW, kWallH, kDepth}, siding);
    box(b, {-kHalfW + kWall, 0.0f, kDepth - kWall - 0.02f}, {kHalfW - kWall, kWallH, kDepth - kWall}, paint);
    box(b, {-kHalfW + kWall, 0.0f, kWall}, {-kHalfW + kWall + 0.02f, kWallH, kDepth - kWall}, paint);
    box(b, {kHalfW - kWall - 0.02f, 0.0f, kWall}, {kHalfW - kWall, kWallH, kDepth - kWall}, paint);
    box(b, {-kHalfW + kWall, 0.9f, kDepth - kWall - 0.03f}, {kHalfW - kWall, 1.05f, kDepth - kWall - 0.02f}, accent);   // stripe
    solid({-kHalfW, 0.0f, kDepth - kWall}, {kHalfW, kWallH, kDepth});
    solid({-kHalfW, 0.0f, 0.0f}, {-kHalfW + kWall, kWallH, kDepth});
    solid({kHalfW - kWall, 0.0f, 0.0f}, {kHalfW, kWallH, kDepth});
    box(b, {-kHalfW - 0.3f, kWallH, -0.3f}, {kHalfW + 0.3f, kWallH + 0.4f, kDepth + 0.3f}, roof);
    box(b, {-kHalfW + kWall, kWallH - 0.06f, kWall}, {kHalfW - kWall, kWallH, kDepth - kWall}, ceiling);
    box(b, {-kHalfW + 1.0f, 3.5f, -1.6f}, {kHalfW - 1.0f, 3.7f, 0.0f}, accent);   // awning
    box(b, {-5.0f, 3.75f, -0.08f}, {5.0f, 4.85f, 0.0f}, mat({0.12f, 0.16f, 0.14f}, 0.5f));   // storefront sign board
    // Ceiling light panels (lit while the store is open)
    for (float x : {-12.0f, -4.0f, 4.0f, 12.0f})
        for (float z : {5.0f, 12.5f}) {
            lp.addBox(AABB(L(x - 1.2f, kWallH - 0.1f, z - 0.3f), L(x + 1.2f, kWallH - 0.06f, z + 0.3f)), mat({1.0f, 0.98f, 0.92f}, 0.3f, 0.0f, PAT_PLAIN, 3.0f));
            lights_.push_back({L(x, kWallH - 0.5f, z), 14.0f, vec3(1.0f, 0.93f, 0.84f) * 20.0f});
        }

    // ---- Checkout counter and register (front left) ----
    box(b, {-9.0f, 0.0f, 3.0f}, {-3.5f, 1.0f, 3.8f}, wood);
    box(b, {-9.05f, 1.0f, 2.95f}, {-3.45f, 1.05f, 3.85f}, counterTop);
    box(b, {-6.35f, 1.05f, 3.1f}, {-5.65f, 1.3f, 3.55f}, darkSteel);                          // register
    box(b, {-6.25f, 1.3f, 3.2f}, {-5.75f, 1.62f, 3.25f}, mat({0.1f, 0.3f, 0.35f}, 0.2f, 0.0f, PAT_PLAIN, 0.8f));   // screen
    box(b, {-8.6f, 1.05f, 3.2f}, {-7.2f, 1.08f, 3.7f}, mat({0.1f, 0.1f, 0.1f}, 0.8f));          // conveyor
    box(b, {-4.6f, 1.05f, 3.2f}, {-3.9f, 1.4f, 3.6f}, mat({0.85f, 0.72f, 0.5f}, 0.9f));        // bag stack
    box(b, {-9.0f, 0.0f, 1.2f}, {-8.2f, 1.6f, 1.6f}, steel);                                   // back shelf behind the till
    for (int i = 0; i < 5; ++i)
        box(b, {-8.95f, 0.3f + 0.3f * float(i), 1.25f}, {-8.25f, 0.5f + 0.3f * float(i), 1.55f}, mat(vec3(0.3f + 0.12f * float(i), 0.25f, 0.6f - 0.1f * float(i)), 0.6f));
    solid({-9.0f, 0.0f, 3.0f}, {-3.5f, 1.05f, 3.8f});
    counter_ = AABB(L(-9.0f, 0.0f, 1.8f), L(-3.5f, 2.0f, 3.8f));
    // Impulse rack of treats by the counter
    box(b, {-3.2f, 0.0f, 2.6f}, {-2.5f, 1.4f, 3.4f}, steel);
    solid({-3.2f, 0.0f, 2.6f}, {-2.5f, 1.4f, 3.4f});

    // ---- Shelving aisles (left): dog food, cat food & litter, toys & beds ----
    Rng pr(123);
    const vec3 productCols[] = {{0.62f, 0.2f, 0.12f}, {0.85f, 0.6f, 0.15f}, {0.2f, 0.4f, 0.7f}, {0.45f, 0.25f, 0.6f}, {0.15f, 0.55f, 0.3f},
                                {0.9f, 0.9f, 0.85f}, {0.8f, 0.3f, 0.45f}, {0.35f, 0.3f, 0.25f}, {0.95f, 0.75f, 0.2f}, {0.1f, 0.6f, 0.65f}};
    for (float sx : {-16.0f, -12.5f, -9.0f}) {
        box(b, {sx - 0.5f, 0.0f, 8.0f}, {sx + 0.5f, 2.0f, 16.0f}, steel);
        solid({sx - 0.5f, 0.0f, 8.0f}, {sx + 0.5f, 2.0f, 16.0f});
        for (int level = 0; level < 4; ++level) {
            float y = 0.12f + 0.48f * float(level);
            box(b, {sx - 0.56f, y - 0.03f, 8.0f}, {sx + 0.56f, y, 16.0f}, darkSteel);
            for (int side = 0; side < 2; ++side) {
                float z = 8.1f;
                while (z < 15.8f) {
                    float wz = pr.range(0.25f, 0.5f), h = pr.range(0.18f, 0.4f), d = pr.range(0.25f, 0.4f);
                    if (z + wz > 15.9f) break;
                    vec3 c = productCols[pr.irange(0, 9)];
                    float x0 = side ? sx + 0.56f - d : sx - 0.56f, x1 = side ? sx + 0.56f : sx - 0.56f + d;
                    box(b, {x0, y, z}, {x1, y + h, z + wz}, mat(c, 0.6f));
                    box(b, {side ? x1 - 0.005f : x0, y + h * 0.4f, z + wz * 0.2f}, {side ? x1 + 0.005f : x0 + 0.005f, y + h * 0.7f, z + wz * 0.8f}, white);   // label
                    z += wz + pr.range(0.02f, 0.08f);
                }
            }
        }
    }
    // Hanging aisle signs
    const std::pair<float, const char*> aisles[] = {{-14.25f, "DOG FOOD & TREATS"}, {-10.75f, "CAT FOOD & LITTER"}, {-7.2f, "TOYS, BEDS & LEASHES"}};
    for (auto [ax, text] : aisles) {
        box(b, {ax - 1.1f, 3.25f, 7.46f}, {ax + 1.1f, 3.75f, 7.54f}, mat({0.12f, 0.35f, 0.25f}, 0.5f));
        box(b, {ax - 0.9f, 3.75f, 7.49f}, {ax - 0.88f, kWallH, 7.51f}, darkSteel);
        box(b, {ax + 0.88f, 3.75f, 7.49f}, {ax + 0.9f, kWallH, 7.51f}, darkSteel);
        labels_.push_back({L(ax, 3.5f, 7.45f), kPi, text, 30.0f, 0.9f, IM_COL32(240, 240, 230, 255)});
    }
    // Aquariums along the left wall
    box(b, {-19.7f, 0.0f, 8.0f}, {-18.8f, 0.9f, 17.4f}, wood);
    solid({-19.7f, 0.0f, 8.0f}, {-18.8f, 1.7f, 17.4f});
    for (int i = 0; i < 4; ++i) {
        float z0 = 8.2f + 2.3f * float(i), z1 = z0 + 2.0f;
        g.addBox(AABB(L(-19.65f, 0.9f, z0), L(-18.85f, 1.7f, z1)), glassM);
        wt.addBox(AABB(L(-19.6f, 0.95f, z0 + 0.05f), L(-18.9f, 1.6f, z1 - 0.05f)), waterM);
        box(b, {-19.6f, 0.9f, z0 + 0.05f}, {-18.9f, 0.98f, z1 - 0.05f}, mat({0.6f, 0.55f, 0.45f}, 0.9f));
        for (int k = 0; k < 3; ++k)
            b.addEllipsoid(L(-19.3f, 1.1f, z0 + 0.4f + 0.6f * float(k)), {0.08f, 0.2f, 0.08f}, 8, 5, mat({0.2f, 0.55f, 0.25f}, 0.8f, 0.0f, PAT_FOLIAGE));
        for (int k = 0; k < 4; ++k)
            b.addEllipsoid(L(-19.25f + 0.1f * float(k % 2), 1.25f + 0.08f * float(k), z0 + 0.5f + 0.35f * float(k)), {0.02f, 0.03f, 0.06f}, 6, 4,
                           mat(k % 2 ? vec3(1.0f, 0.5f, 0.1f) : vec3(0.3f, 0.6f, 1.0f), 0.4f, 0.0f, PAT_PLAIN, 0.3f));
        lp.addBox(AABB(L(-19.6f, 1.7f, z0 + 0.1f), L(-18.9f, 1.75f, z1 - 0.1f)), mat({0.7f, 0.85f, 1.0f}, 0.3f, 0.0f, PAT_PLAIN, 2.0f));
    }
    labels_.push_back({L(-18.8f, 2.1f, 12.8f), kPi * 0.5f, "AQUARIUM FISH", 14.0f, 0.8f, IM_COL32(40, 70, 110, 255)});

    // ---- Dog pens (right wall) ----
    for (int i = 0; i < 3; ++i) {
        float z0 = 2.0f + 4.4f * float(i), z1 = z0 + 4.2f, zc = (z0 + z1) * 0.5f;
        box(b, {15.4f, kFloor, z0}, {19.7f, kFloor + 0.02f, z1}, rubber);
        panel(15.4f, z0, 15.4f, z1, kFloor, 1.05f);
        panel(15.4f, z0, 19.7f, z0, kFloor, 1.05f);
        if (i == 2) panel(15.4f, z1, 19.7f, z1, kFloor, 1.05f);
        solid({15.35f, 0.0f, z0}, {15.45f, 1.05f, z1});
        solid({15.4f, 0.0f, z0 - 0.05f}, {19.7f, 1.05f, z0 + 0.05f});
        if (i == 2) solid({15.4f, 0.0f, z1 - 0.05f}, {19.7f, 1.05f, z1 + 0.05f});
        box(b, {18.2f, kFloor, z1 - 1.4f}, {19.5f, kFloor + 0.16f, z1 - 0.2f}, i == 1 ? fabricBlue : fabricRed);   // bed
        Pen p;
        p.kind = 0;
        p.area = AABB(L(15.9f, kFloor + 0.02f, z0 + 0.5f), L(19.2f, kFloor + 0.02f, z1 - 0.5f));
        p.food = {19.2f, kFloor + 0.02f, z0 + 0.7f};
        p.water = {19.2f, kFloor + 0.02f, z0 + 1.6f};
        bowls(p.food, p.water, 0.14f, true, kibble);
        p.tag = {15.3f, 1.25f, zc};
        p.tagYaw = -kPi * 0.5f;
        tagBoard(p.tag, p.tagYaw);
        p.box = AABB(L(15.4f, 0.0f, z0), L(19.7f, 1.2f, z1));
        pens_.push_back(p);
    }
    labels_.push_back({L(15.3f, 1.9f, 8.6f), -kPi * 0.5f, "PUPPIES", 16.0f, 1.0f, IM_COL32(180, 40, 30, 255)});
    // ---- Cat condos (back right) ----
    const float condoX[2][2] = {{6.0f, 10.2f}, {10.5f, 14.3f}};
    for (int j = 0; j < 2; ++j) {
        float x0 = condoX[j][0], x1 = condoX[j][1], z0 = 13.4f, z1 = kDepth - kWall, h = 2.3f;
        box(b, {x0, kFloor, z0}, {x1, kFloor + 0.02f, z1}, rubber);
        panel(x0, z0, x1, z0, kFloor, h);
        panel(x0, z0, x0, z1, kFloor, h);
        panel(x1, z0, x1, z1, kFloor, h);
        w.addQuad(L(x0, h, z0), L(x1, h, z0), L(x1, h, z1), L(x0, h, z1), wireM, {x1 - x0, z1 - z0});
        solid({x0, 0.0f, z0}, {x1, h, z1});
        // Cat tree, litter box, a little hammock
        box(b, {x1 - 1.0f, kFloor, z1 - 1.0f}, {x1 - 0.7f, 1.4f, z1 - 0.7f}, mat({0.75f, 0.65f, 0.5f}, 0.95f, 0.0f, PAT_FABRIC));
        box(b, {x1 - 1.3f, 1.4f, z1 - 1.3f}, {x1 - 0.4f, 1.48f, z1 - 0.4f}, fabricBlue);
        box(b, {x0 + 0.3f, kFloor, z1 - 1.0f}, {x0 + 1.1f, kFloor + 0.15f, z1 - 0.4f}, mat({0.3f, 0.5f, 0.8f}, 0.5f));
        box(b, {x0 + 0.35f, kFloor + 0.12f, z1 - 0.95f}, {x0 + 1.05f, kFloor + 0.14f, z1 - 0.45f}, mat({0.85f, 0.82f, 0.75f}, 0.95f));
        Pen p;
        p.kind = 1;
        p.area = AABB(L(x0 + 0.5f, kFloor + 0.02f, z0 + 0.5f), L(x1 - 0.5f, kFloor + 0.02f, z1 - 1.2f));
        p.food = {(x0 + x1) * 0.5f - 0.3f, kFloor + 0.02f, z1 - 0.35f};
        p.water = {(x0 + x1) * 0.5f + 0.3f, kFloor + 0.02f, z1 - 0.35f};
        bowls(p.food, p.water, 0.11f, true, kibble);
        p.tag = {(x0 + x1) * 0.5f, 1.3f, z0 - 0.06f};
        p.tagYaw = kPi;
        tagBoard(p.tag, p.tagYaw);
        p.box = AABB(L(x0, 0.0f, z0), L(x1, h, z1));
        pens_.push_back(p);
    }
    labels_.push_back({L(10.25f, 2.6f, 13.35f), kPi, "KITTENS & CATS", 18.0f, 1.0f, IM_COL32(180, 40, 30, 255)});
    // ---- Bird cages (on stands, middle right) ----
    for (float cxl : {1.5f, 4.5f}) {
        float y0 = 0.9f, y1 = 2.3f, r = 0.6f;
        box(b, {cxl - r, 0.0f, 10.0f - r}, {cxl + r, y0, 10.0f + r}, wood);
        box(b, {cxl - r, y0, 10.0f - r}, {cxl + r, y0 + 0.03f, 10.0f + r}, mat({0.9f, 0.88f, 0.8f}, 0.9f));
        panel(cxl - r, 10.0f - r, cxl + r, 10.0f - r, y0, y1);
        panel(cxl + r, 10.0f - r, cxl + r, 10.0f + r, y0, y1);
        panel(cxl + r, 10.0f + r, cxl - r, 10.0f + r, y0, y1);
        panel(cxl - r, 10.0f + r, cxl - r, 10.0f - r, y0, y1);
        w.addQuad(L(cxl - r, y1, 10.0f - r), L(cxl + r, y1, 10.0f - r), L(cxl + r, y1, 10.0f + r), L(cxl - r, y1, 10.0f + r), wireM, {1.2f, 1.2f});
        b.addCylinder(L(cxl, y1, 10.0f), 0.05f, 0.3f, 8, darkSteel);   // hanger
        mat4 saved = b.xf;
        b.xf = mat4::translate(L(cxl - 0.5f, 1.55f, 10.1f)) * mat4::rotate(quat::axisAngle({0, 0, 1}, -kPi * 0.5f));
        b.addCylinder({0, 0, 0}, 0.02f, 1.0f, 8, wood);   // perch
        b.xf = saved;
        solid({cxl - r, 0.0f, 10.0f - r}, {cxl + r, y1, 10.0f + r});
        Pen p;
        p.kind = 2;
        p.area = AABB(L(cxl - 0.35f, y0 + 0.03f, 9.7f), L(cxl + 0.35f, y0 + 0.03f, 10.35f));
        p.food = {cxl - 0.38f, y0 + 0.03f, 10.4f};
        p.water = {cxl + 0.38f, y0 + 0.03f, 10.4f};
        bowls(p.food, p.water, 0.06f, false, seed);
        p.tag = {cxl, 0.62f, 10.0f - r - 0.03f};
        p.tagYaw = kPi;
        tagBoard(p.tag, p.tagYaw);
        p.box = AABB(L(cxl - r, 0.0f, 10.0f - r), L(cxl + r, y1, 10.0f + r));
        pens_.push_back(p);
    }
    labels_.push_back({L(3.0f, 2.9f, 9.3f), kPi, "BIRDS", 16.0f, 1.0f, IM_COL32(30, 90, 140, 255)});
    // ---- Snake terrariums (back, on stands) ----
    for (float x0 : {-4.5f, -1.9f}) {
        float x1 = x0 + 2.2f, z0 = 16.6f, z1 = 17.5f, y0 = 0.8f, y1 = 1.5f;
        box(b, {x0, 0.0f, z0}, {x1, y0, z1}, wood);
        g.addBox(AABB(L(x0, y0, z0), L(x1, y1, z1)), glassM);
        box(b, {x0 + 0.02f, y0, z0 + 0.02f}, {x1 - 0.02f, y0 + 0.05f, z1 - 0.02f}, sand);
        box(b, {x0, y1, z0}, {x1, y1 + 0.03f, z1}, darkSteel);   // screen lid
        b.addEllipsoid(L(x1 - 0.4f, y0 + 0.1f, z0 + 0.45f), {0.25f, 0.12f, 0.2f}, 10, 6, rock);   // hide
        lp.addCylinder(L(x0 + 0.6f, y1 + 0.03f, (z0 + z1) * 0.5f), 0.1f, 0.12f, 10, mat({1.0f, 0.55f, 0.2f}, 0.3f, 0.0f, PAT_PLAIN, 3.0f));   // heat lamp
        solid({x0, 0.0f, z0}, {x1, y1, z1});
        Pen p;
        p.kind = 3;
        p.area = AABB(L(x0 + 0.35f, y0 + 0.05f, z0 + 0.3f), L(x1 - 0.8f, y0 + 0.05f, z1 - 0.3f));
        p.food = {x0 + 0.25f, y0 + 0.05f, z1 - 0.2f};
        p.water = {x0 + 0.25f, y0 + 0.05f, z0 + 0.25f};
        wt.addCylinder(L(p.water.x, p.water.y, p.water.z), 0.12f, 0.04f, 12, waterM);
        b.addCylinder(L(p.water.x, p.water.y, p.water.z), 0.14f, 0.05f, 12, rock);
        p.tag = {(x0 + x1) * 0.5f, 0.55f, z0 - 0.03f};
        p.tagYaw = kPi;
        tagBoard(p.tag, p.tagYaw);
        p.box = AABB(L(x0, 0.0f, z0), L(x1, y1, z1));
        pens_.push_back(p);
    }
    labels_.push_back({L(-2.3f, 2.1f, 16.5f), kPi, "REPTILES", 16.0f, 1.0f, IM_COL32(40, 110, 50, 255)});
    labels_.push_back({L(-6.2f, 2.3f, 3.85f), kPi, "CHECKOUT", 20.0f, 1.0f, IM_COL32(180, 40, 30, 255)});
    labels_.push_back({L(0.0f, 4.3f, -0.1f), kPi, "PAWS & CLAWS\nPET SUPPLY", 90.0f, 1.8f, IM_COL32(245, 235, 200, 255)});
    // Shop cat's corner: bowls and a bed by the counter (not for sale)
    box(b, {-2.4f, kFloor, 6.4f}, {-1.4f, kFloor + 0.14f, 7.2f}, fabricRed);
    bowls({-1.0f, kFloor, 6.6f}, {-0.6f, kFloor, 6.6f}, 0.1f, false, kibble);

    // ---- Points customers visit ----
    for (float z : {9.0f, 11.5f, 14.0f}) {
        pois_.push_back({L(-14.25f, kFloor, z), -kPi * 0.5f, 0, -1});
        pois_.push_back({L(-14.25f, kFloor, z), kPi * 0.5f, 0, -1});
        pois_.push_back({L(-10.75f, kFloor, z), -kPi * 0.5f, 0, -1});
        pois_.push_back({L(-10.75f, kFloor, z), kPi * 0.5f, 0, -1});
        pois_.push_back({L(-7.2f, kFloor, z), -kPi * 0.5f, 0, -1});
        pois_.push_back({L(-17.65f, kFloor, z + 0.5f), -kPi * 0.5f, 2, -1});
    }
    for (int i = 0; i < 3; ++i) pois_.push_back({L(14.6f, kFloor, 4.1f + 4.4f * float(i)), kPi * 0.5f, 1, i});
    pois_.push_back({L(8.1f, kFloor, 12.6f), 0.0f, 1, 3});
    pois_.push_back({L(12.4f, kFloor, 12.6f), 0.0f, 1, 4});
    pois_.push_back({L(1.5f, kFloor, 8.8f), 0.0f, 1, 5});
    pois_.push_back({L(4.5f, kFloor, 8.8f), 0.0f, 1, 6});
    pois_.push_back({L(-3.4f, kFloor, 15.8f), 0.0f, 1, 7});
    pois_.push_back({L(-0.8f, kFloor, 15.8f), 0.0f, 1, 8});

    // ---- Doors: glass sliders (drawn open or closed); a collider blocks the doorway after hours ----
    MeshBuilder dp;
    dp.addBox(AABB({-0.65f, 0.0f, -0.02f}, {0.65f, doorH, 0.02f}), glassM);
    doorPanel_.upload(dp);
    doorCollider_ = cw.addBox(AABB(L(-1.3f, 0.0f, 0.0f), L(1.3f, doorH, kWall)));
    cw.setEnabled(doorCollider_, false);

    // Carried items: a product box and a paper shopping bag
    MeshBuilder ib;
    ib.addBox(AABB({-0.5f, -0.5f, -0.5f}, {0.5f, 0.5f, 0.5f}), mat({1, 1, 1}, 0.6f));
    item_.upload(ib);
    ib.clear();
    ib.addBox(AABB({-0.16f, -0.2f, -0.09f}, {0.16f, 0.2f, 0.09f}), mat({0.78f, 0.62f, 0.42f}, 0.95f));
    ib.addBox(AABB({-0.1f, 0.2f, -0.01f}, {0.1f, 0.3f, 0.01f}), mat({0.7f, 0.55f, 0.38f}, 0.95f));
    bagMesh_.upload(ib);

    shell_.upload(b);
    wire_.upload(w);
    glass_.upload(g);
    water_.upload(wt);
    lamps_.upload(lp);
    built_ = true;
}

// ------------------------------------------------------------------ animals
void PetStoreInterior::spawnActor(const Sim& sim, const StoreAnimal& a) {
    (void)sim;
    const Species& sp = speciesCatalog()[size_t(a.species)];
    auto act = std::make_unique<StoreActor>();
    act->storeId = a.id;
    act->pen = a.pen;
    act->species = &sp;
    AnimalIndividual ind;
    ind.species = a.species;
    ind.male = a.male;
    ind.age = std::max(0.55f, a.ageFrac * 1.8f);   // young, but past the tiny newborn look
    ind.coat = a.coat;
    ind.seed = uint32_t(a.id * 2654435761u + 17u);
    act->build = buildAnimal(sp, ind);
    act->mesh.upload(act->build.mesh);
    act->anim.init(act->build.rig, sp, ind.seed);
    if (a.pen >= 0 && a.pen < int(pens_.size())) act->area = pens_[size_t(a.pen)].area;
    else act->area = AABB(L(-6.3f, kFloor, 7.6f), L(0.3f, kFloor, 15.2f));   // the shop cat has the run of the floor
    act->pos = {rng_.range(act->area.min.x, act->area.max.x), act->area.min.y, rng_.range(act->area.min.z, act->area.max.z)};
    act->target = act->pos;
    act->yaw = rng_.range(0.0f, 2.0f * kPi);
    act->think = rng_.range(0.0f, 2.0f);
    actors_[a.id] = std::move(act);
}

void PetStoreInterior::thinkActor(StoreActor& a, float hour) {
    using A = AnimAction;
    a.walking = false;
    a.goal = 0;
    auto can = [&](A x) { return actionAvailable(*a.species, x); };
    auto pick = [&](std::initializer_list<A> opts) {
        std::vector<A> ok;
        for (A x : opts) if (can(x)) ok.push_back(x);
        return ok.empty() ? A::Idle : ok[size_t(rng_.next() % ok.size())];
    };
    A next;
    float r = rng_.uniform();
    const Pen* pen = a.pen >= 0 && a.pen < int(pens_.size()) ? &pens_[size_t(a.pen)] : nullptr;
    if (hour < 6.5f || hour > 21.5f) next = pick({A::Sleep, A::LieDown});
    else if (r < 0.22f && pen) {   // go eat from the dispenser
        a.goal = 1;
        a.target = L(pen->food.x, pen->food.y, pen->food.z);
        next = A::Walk;
    } else if (r < 0.36f && pen) {  // go drink
        a.goal = 2;
        a.target = L(pen->water.x, pen->water.y, pen->water.z);
        next = A::Walk;
    } else if (r < 0.62f) {
        next = A::Walk;
        a.target = {rng_.range(a.area.min.x, a.area.max.x), a.area.min.y, rng_.range(a.area.min.z, a.area.max.z)};
    } else {
        next = pick({A::Idle, A::Sniff, A::LookAround, A::Sit, A::LieDown, A::Groom, A::Scratch, A::Yawn, A::Stretch, A::WagHappy,
                     A::PlayBow, A::Vocalize, A::Peck, A::Preen, A::FlapWings, A::Coil, A::Knead, A::Beg});
    }
    if (next == A::Walk) {
        // Stop short of the bowl so the head is over it
        if (a.goal) {
            vec3 c = a.area.center();
            vec3 d = c - a.target;
            d.y = 0.0f;
            float len = length(d);
            if (len > 1e-3f) a.target += d * (std::min(len, a.build.rig.bodyLen * 0.45f + 0.08f) / len);
            a.target.y = a.area.min.y;
        }
        a.walking = true;
    }
    a.anim.play(next, 0.4f);
    a.think = actionLoops(next) ? rng_.range(3.0f, 8.0f) : actionDuration(next);
}

// ------------------------------------------------------------------ people
void PetStoreInterior::route(Npc& n, vec3 to) const {
    n.path.clear();
    vec3 a = L(0, 0, 0);
    float zc = a.z + kAisleZ;
    if (std::fabs(n.pos.z - zc) > 0.05f) n.path.push_back({n.pos.x, kFloor, zc});
    if (std::fabs(to.x - n.pos.x) > 0.05f) n.path.push_back({to.x, kFloor, zc});
    n.path.push_back(to);
    n.state = 1;
}

void PetStoreInterior::chooseNext(Npc& n) {
    n.look = 0.0f;
    if (n.visits < 3 && (n.visits == 0 || rng_.uniform() < 0.65f)) {
        // People love looking at the animals: half the stops are at a pen, cage or tank
        bool animal = rng_.uniform() < 0.5f;
        int p;
        do { p = rng_.irange(0, int(pois_.size()) - 1); } while ((p == n.poi || (animal && pois_[size_t(p)].kind != 1)) && pois_.size() > 1);
        n.poi = p;
        n.visits++;
        route(n, pois_[size_t(p)].at);
        n.after = 0;
        return;
    }
    bool tillBusy = false;
    for (const Npc& o : npcs_) if (&o != &n && (o.state == 4 || (o.state == 1 && o.after == 1))) tillBusy = true;
    if (n.buyer) {
        route(n, tillBusy ? L(kWaitSpot.x, kFloor, kWaitSpot.z) : L(kPaySpot.x, kFloor, kPaySpot.z));
        n.after = tillBusy ? 3 : 1;
        return;
    }
    route(n, L(0.0f, kFloor, 1.5f));
    n.path.push_back(L(0.0f, kFloor, -4.0f));
    n.after = 2;
}

// ------------------------------------------------------------------ update
void PetStoreInterior::update(const Sim& sim, float dt, float time, vec3 camPos, CollisionWorld& cw) {
    if (!built_) return;
    float hour = sim.clock.hour();
    bool openNow = open(hour);
    if (openNow != isOpen_) {
        isOpen_ = openNow;
        cw.setEnabled(doorCollider_, !openNow);
    }
    vec3 c = L(0, 0, kDepth * 0.5f);
    float d = length(vec3(camPos.x - c.x, 0, camPos.z - c.z));
    if (d > 140.0f) return;   // nobody to watch: the store sleeps until you come back

    // Animals: one actor per animal for sale (plus the shop cat), built a couple per frame
    int builtNow = 0;
    for (auto it = actors_.begin(); it != actors_.end();) {
        bool keep = it->first == 0;
        for (const StoreAnimal& a : sim.petStore) if (a.id == it->first) keep = true;
        if (!keep) it = actors_.erase(it);
        else ++it;
    }
    for (const StoreAnimal& a : sim.petStore) {
        if (actors_.count(a.id) || builtNow >= 2) continue;
        spawnActor(sim, a);
        ++builtNow;
    }
    if (!actors_.count(0) && builtNow < 2) {
        int cat = findSpecies("Domestic Shorthair");
        if (cat < 0) for (size_t i = 0; i < speciesCatalog().size(); ++i) if (speciesCatalog()[i].category == "Cat") { cat = int(i); break; }
        if (cat >= 0) {
            StoreAnimal mango;
            mango.id = 0;
            mango.pen = -1;
            mango.species = cat;
            mango.male = true;
            mango.ageFrac = 1.0f;
            const Species& sp = speciesCatalog()[size_t(cat)];
            for (size_t k = 0; k < sp.coats.size(); ++k)
                if (sp.coats[k].name.find("Orange") != std::string::npos || sp.coats[k].name.find("Ginger") != std::string::npos) { mango.coat = int(k); break; }
            spawnActor(sim, mango);
        }
    }
    for (auto& [id, ap] : actors_) {
        StoreActor& a = *ap;
        a.think -= dt;
        if (a.think <= 0.0f) thinkActor(a, hour);
        if (a.walking) {
            vec3 to = a.target - a.pos;
            to.y = 0.0f;
            float dist = length(to);
            float speed = std::max(a.build.rig.legLen * 1.4f, 0.22f) * a.species->shape.gaitSpeed;
            if (dist < 0.06f) {
                a.walking = false;
                if (a.goal) {   // arrived at the bowl: face it and eat / drink
                    const Pen& p = pens_[size_t(a.pen)];
                    vec3 bowl = L(a.goal == 1 ? p.food.x : p.water.x, 0.0f, a.goal == 1 ? p.food.z : p.water.z);
                    a.yaw = std::atan2(bowl.x - a.pos.x, bowl.z - a.pos.z);
                    AnimAction act = a.goal == 1 ? AnimAction::Eat : AnimAction::Drink;
                    if (!actionAvailable(*a.species, act)) act = actionAvailable(*a.species, AnimAction::Peck) ? AnimAction::Peck : AnimAction::Sniff;
                    a.anim.play(act, 0.4f);
                    a.think = rng_.range(3.0f, 6.0f);
                } else {
                    a.anim.play(AnimAction::Idle, 0.4f);
                    a.think = rng_.range(1.0f, 3.0f);
                }
            } else {
                float want = std::atan2(to.x, to.z);
                float dy = std::remainder(want - a.yaw, 2.0f * kPi);
                a.yaw += clampf(dy, -dt * 3.0f, dt * 3.0f);
                float step = std::min(dist, speed * dt * (std::fabs(dy) < 1.0f ? 1.0f : 0.3f));
                a.pos += vec3(std::sin(a.yaw), 0, std::cos(a.yaw)) * step;
                a.pos.x = clampf(a.pos.x, a.area.min.x - 0.3f, a.area.max.x + 0.3f);
                a.pos.z = clampf(a.pos.z, a.area.min.z - 0.3f, a.area.max.z + 0.3f);
                a.anim.setSpeed(speed);
            }
        } else a.anim.setSpeed(0.0f);
        a.anim.update(dt);
    }

    // People: build them the first time you come near
    if (!peopleBuilt_) {
        peopleBuilt_ = true;
        const auto& roster = peopleRoster();
        cashier_ = std::make_unique<CharacterModel>();
        Appearance ca = roster[20 % roster.size()].looks;
        ca.topColor = {0.72f, 0.14f, 0.1f};   // store polo
        cashier_->build(ca);
        const int shoppers[] = {2, 5, 9, 14, 23, 31, 36, 11};
        const vec3 itemCols[] = {{0.62f, 0.2f, 0.12f}, {0.2f, 0.4f, 0.7f}, {0.85f, 0.6f, 0.15f}, {0.45f, 0.25f, 0.6f}, {0.15f, 0.55f, 0.3f}};
        for (int i = 0; i < 8; ++i) {
            Npc n;
            n.model = std::make_unique<CharacterModel>();
            Appearance look = roster[size_t(shoppers[i]) % roster.size()].looks;
            const vec3 tops[] = {{0.2f, 0.35f, 0.6f}, {0.15f, 0.45f, 0.3f}, {0.85f, 0.8f, 0.7f}, {0.35f, 0.2f, 0.45f},
                                 {0.9f, 0.6f, 0.15f}, {0.25f, 0.25f, 0.28f}, {0.6f, 0.75f, 0.85f}, {0.55f, 0.35f, 0.2f}};
            look.topColor = tops[i % 8];   // shoppers in their own clothes (only the cashier wears the red store polo)
            n.model->build(look);
            n.itemColor = itemCols[i % 5];
            if (i < 6) {   // already shopping when you walk in
                n.poi = rng_.irange(0, int(pois_.size()) - 1);
                n.pos = pois_[size_t(n.poi)].at;
                n.yaw = pois_[size_t(n.poi)].yaw;
                n.state = 2;
                n.visits = 1;
                n.timer = rng_.range(1.0f, 6.0f);
                n.holding = pois_[size_t(n.poi)].kind == 0 && i % 2 == 0;
                n.buyer = i == 1;
                n.holding = n.holding || n.buyer;
            } else {
                n.state = 0;
                n.timer = rng_.range(4.0f, 15.0f);
                n.pos = L(0.0f, kFloor, -4.0f);
            }
            npcs_.push_back(std::move(n));
        }
    }
    int paying = -1;
    for (size_t i = 0; i < npcs_.size(); ++i) {
        Npc& n = npcs_[i];
        if (!openNow) { n.state = 0; n.timer = 5.0f; n.holding = n.bag = n.buyer = false; continue; }
        float speed = 0.0f;
        switch (n.state) {
        case 0:   // away: come back in through the door
            n.timer -= dt;
            if (n.timer <= 0.0f) {
                n.pos = L(0.0f, kFloor, -4.0f);
                n.visits = 0;
                n.buyer = n.bag = n.holding = false;
                n.path = {L(0.0f, kFloor, 1.5f)};
                n.state = 1;
                n.after = 4;
            }
            break;
        case 1: {   // walking a path
            if (n.path.empty()) break;
            vec3 to = n.path.front() - n.pos;
            to.y = 0.0f;
            float dist = length(to);
            speed = 1.15f;
            if (dist < 0.05f) {
                n.path.erase(n.path.begin());
                if (n.path.empty()) {
                    speed = 0.0f;
                    switch (n.after) {
                    case 0: {
                        const Poi& p = pois_[size_t(n.poi)];
                        n.state = 2;
                        n.yaw = p.yaw;
                        n.timer = rng_.range(3.5f, 7.0f);
                        break;
                    }
                    case 1: n.state = 4; n.yaw = kPi; n.timer = 4.5f; break;
                    case 2: n.state = 0; n.timer = rng_.range(10.0f, 30.0f); break;
                    case 3: n.state = 3; n.yaw = kPi; n.timer = 1.0f; break;
                    case 4: chooseNext(n); break;
                    }
                }
            } else {
                float want = std::atan2(to.x, to.z);
                n.yaw += clampf(std::remainder(want - n.yaw, 2.0f * kPi), -dt * 6.0f, dt * 6.0f);
                n.pos += to * (std::min(dist, speed * dt) / dist);
            }
            break;
        }
        case 2: {   // looking something over (picks shelf items up; watches the animals)
            const Poi& p = pois_[size_t(n.poi)];
            n.timer -= dt;
            n.look = std::sin(time * 0.7f + float(i)) * 0.35f;
            if (p.kind == 0 && !n.holding && n.timer < 5.0f) n.holding = true;   // took one off the shelf
            if (n.timer <= 0.0f) {
                if (p.kind == 0 && n.holding && !n.buyer) {
                    if (rng_.uniform() < 0.45f) n.buyer = true;   // keeps it
                    else n.holding = false;                     // puts it back
                }
                chooseNext(n);
            }
            break;
        }
        case 3: {   // waiting in line for the till
            n.timer -= dt;
            bool busy = false;
            for (const Npc& o : npcs_) if (&o != &n && (o.state == 4 || (o.state == 1 && o.after == 1))) busy = true;
            if (n.timer <= 0.0f && !busy) { route(n, L(kPaySpot.x, kFloor, kPaySpot.z)); n.after = 1; }
            else if (n.timer <= 0.0f) n.timer = 1.0f;
            break;
        }
        case 4:   // paying: the cashier scans it, then it goes in a bag
            paying = int(i);
            n.timer -= dt;
            if (n.timer <= 0.0f) {
                n.holding = false;
                n.bag = true;
                n.buyer = false;
                route(n, L(0.0f, kFloor, 1.5f));
                n.path.push_back(L(0.0f, kFloor, -4.0f));
                n.after = 2;
            }
            break;
        }
        n.walk += (std::min(1.0f, speed / 1.2f) - n.walk) * std::min(1.0f, dt * 6.0f);
        n.phase += speed * dt * 2.2f;
        float holdTarget = n.holding ? 1.0f : 0.0f;
        n.hold += (holdTarget - n.hold) * std::min(1.0f, dt * 4.0f);
        if (n.state != 0) n.model->animate(time + float(i) * 1.7f, n.phase, n.walk, n.look, n.hold);
    }
    // Cashier: faces the customers, scans while someone's paying
    if (cashier_) {
        float want = paying >= 0 ? clampf(std::atan2(npcs_[size_t(paying)].pos.x - L(kCashierSpot.x, 0, 0).x, 3.0f) * 0.8f, -0.6f, 0.6f) : 0.0f;
        cashierLook_ += (want - cashierLook_) * std::min(1.0f, dt * 3.0f);
        float scan = paying >= 0 ? 0.6f + 0.2f * std::sin(time * 6.0f) : 0.0f;
        cashier_->animate(time, 0.0f, 0.0f, cashierLook_, scan);
    }
}

// ------------------------------------------------------------------ draw
void PetStoreInterior::draw(Renderer& r, Pass p, vec3 camPos) const {
    if (!built_) return;
    vec3 c = L(0, 0, kDepth * 0.5f);
    float d = length(vec3(camPos.x - c.x, 0, camPos.z - c.z));
    if (d > 3000.0f) return;
    if (p == Pass::Transparent) {
        r.draw(glass_);
        r.draw(water_);
        // Sliding doors: parted while open, shut after hours
        float slide = isOpen_ ? 1.3f : 0.0f;
        r.draw(doorPanel_, mat4::translate(L(-0.65f - slide, kFloor, kWall + 0.05f)));
        r.draw(doorPanel_, mat4::translate(L(0.65f + slide, kFloor, kWall + 0.05f)));
        return;
    }
    r.draw(shell_);
    r.setDoubleSided(true);
    r.draw(wire_);
    r.setDoubleSided(false);
    if (p != Pass::Shadow) r.draw(lamps_, mat4(), isOpen_ ? vec4(1, 1, 1, 1) : vec4(0.15f, 0.15f, 0.15f, 1));
    if (d > 140.0f) return;
    for (const auto& [id, ap] : actors_) {
        const StoreActor& a = *ap;
        mat4 model = mat4::translate(a.pos) * mat4::rotateY(a.yaw);
        float ad = length(a.pos - camPos);
        int shells = p == Pass::Opaque ? (ad < 8.0f ? r.furShells : (ad < 20.0f ? r.furShells / 2 : 0)) : 0;
        const auto& sk = a.anim.skin();
        r.drawSkinned(a.mesh, sk.data(), int(sk.size()), model, a.build.coat, shells, 1.0f);
    }
    if (!isOpen_) return;
    if (cashier_) cashier_->draw(r, mat4::translate(L(kCashierSpot.x, kFloor, kCashierSpot.z)) * mat4::rotateY(0.0f));
    for (const Npc& n : npcs_) {
        if (n.state == 0) continue;
        mat4 root = mat4::translate(n.pos) * mat4::rotateY(n.yaw);
        n.model->draw(r, root);
        if (n.hold > 0.5f)
            r.draw(item_, root * mat4::translate({0.0f, 1.08f, 0.34f}) * mat4::scale({0.26f, 0.2f, 0.12f}), vec4(n.itemColor, 1.0f));
        if (n.bag) r.draw(bagMesh_, root * mat4::translate({0.3f, 0.62f, 0.05f}));
    }
}

void PetStoreInterior::appendLights(std::vector<PointLight>& out, vec3 camPos) const {
    if (!built_ || !isOpen_) return;
    vec3 c = L(0, 0, kDepth * 0.5f);
    if (length(vec3(camPos.x - c.x, 0, camPos.z - c.z)) > 70.0f) return;
    out.insert(out.end(), lights_.begin(), lights_.end());
}

// ------------------------------------------------------------------ labels & picking
void PetStoreInterior::drawLabels(const Sim& sim, const Camera& cam, int W, int H) const {
    if (!built_) return;
    ImDrawList* dl = ImGui::GetBackgroundDrawList();
    mat4 vp = cam.viewProj();
    auto put = [&](vec3 pos, float yaw, const std::string& text, float maxDist, float scale, ImU32 col, bool card) {
        vec3 facing{std::sin(yaw), 0, std::cos(yaw)};
        vec3 toCam = cam.pos - pos;
        float dist = length(toCam);
        if (dist > maxDist || dot(facing, toCam) < 0.0f) return;
        vec4 c = vp * vec4(pos, 1.0f);
        if (c.w <= 0.1f) return;
        float sx = (c.x / c.w * 0.5f + 0.5f) * float(W), sy = (1.0f - (c.y / c.w * 0.5f + 0.5f)) * float(H);
        if (sx < -300 || sx > float(W) + 300 || sy < -200 || sy > float(H) + 200) return;
        float s = clampf((card ? 3.6f : 18.0f) / dist, card ? 0.6f : 0.35f, card ? 1.5f : 2.0f) * scale;
        ImFont* f = ImGui::GetFont();
        float fs = ImGui::GetFontSize() * s;
        ImVec2 sz = f->CalcTextSizeA(fs, 1e9f, 0.0f, text.c_str());
        ImVec2 p0(sx - sz.x * 0.5f, sy - sz.y * 0.5f);
        if (card) dl->AddRectFilled(ImVec2(p0.x - 6 * s, p0.y - 5 * s), ImVec2(p0.x + sz.x + 6 * s, p0.y + sz.y + 5 * s), IM_COL32(250, 250, 245, 235), 4.0f * s);
        dl->AddText(f, fs, p0, col, text.c_str());
    };
    for (const Label& l : labels_) put(l.pos, l.yaw, l.text, l.maxDist, l.scale, l.color, false);
    // Name tags: name, species, sex, age, color and price
    const auto& cat = speciesCatalog();
    for (size_t i = 0; i < pens_.size(); ++i) {
        const Pen& p = pens_[i];
        const StoreAnimal* a = nullptr;
        for (const StoreAnimal& s : sim.petStore) if (s.pen == int(i)) a = &s;
        std::string text;
        if (a) {
            const Species& sp = cat[size_t(a->species)];
            char price[32];
            std::snprintf(price, sizeof price, "$%.0f", double(a->price));
            text = a->name + "\n" + sp.name + "\n" + (a->male ? "Male" : "Female") + ", " + ageText(*a, sp) + "\n" +
                   (sp.coats.empty() ? std::string("") : sp.coats[size_t(a->coat) % sp.coats.size()].name + "\n") + price;
        } else {
            text = "SOLD\nNew arrivals\nevery morning";
        }
        vec3 at = L(p.tag.x, p.tag.y, p.tag.z) + vec3(std::sin(p.tagYaw), 0, std::cos(p.tagYaw)) * 0.03f;
        put(at, p.tagYaw, text, 5.5f, 0.85f, IM_COL32(25, 25, 30, 255), true);
    }
    // The shop cat's collar tag
    auto it = actors_.find(0);
    if (it != actors_.end()) {
        vec3 pos = it->second->pos + vec3(0, it->second->build.bounds.max.y + 0.15f, 0);
        vec3 toCam = cam.pos - pos;
        put(pos, std::atan2(toCam.x, toCam.z), "Mango\nshop cat (not for sale)", 4.0f, 0.8f, IM_COL32(25, 25, 30, 255), true);
    }
    (void)sim;
}

int PetStoreInterior::pick(vec3 eye, vec3 fwd, const Sim& sim, int* storeId, std::string* prompt) const {
    if (!built_) return 0;
    float tc = rayAABB(eye, fwd, counter_);
    int best = 0;
    float bestT = 3.2f;
    if (tc >= 0.0f && tc < bestT) {
        best = 1;
        bestT = tc;
        if (prompt) *prompt = isOpen_ ? "Talk to the cashier (buy animals, food & supplies)" : "The store is closed (open 7 AM - 9 PM)";
    }
    for (size_t i = 0; i < pens_.size(); ++i) {
        float t = rayAABB(eye, fwd, pens_[i].box);
        if (t < 0.0f || t >= bestT) continue;
        const StoreAnimal* a = nullptr;
        for (const StoreAnimal& s : sim.petStore) if (s.pen == int(i)) a = &s;
        if (!a) continue;
        best = 2;
        bestT = t;
        if (storeId) *storeId = a->id;
        if (prompt) {
            char b[160];
            std::snprintf(b, sizeof b, "%s the %s - $%.0f  (buy at the counter)", a->name.c_str(),
                          speciesCatalog()[size_t(a->species)].name.c_str(), double(a->price));
            *prompt = b;
        }
    }
    return best;
}

}  // namespace ps
