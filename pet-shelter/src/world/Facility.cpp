#include "world/Facility.h"
#include "core/Noise.h"
#include <algorithm>

namespace ps {
using namespace layout;

// ---------------------------------------------------------------- materials
namespace {
const Material kSiding = Material::make({0.80f, 0.75f, 0.64f}, 0.7f, 0.0f, PAT_SIDING);
const Material kConcrete = Material::make({0.58f, 0.57f, 0.55f}, 0.9f, 0.0f, PAT_CONCRETE);
const Material kRoof = Material::make({0.20f, 0.20f, 0.22f}, 0.9f, 0.0f, PAT_CONCRETE);
const Material kCeiling = Material::make({0.90f, 0.90f, 0.88f}, 0.9f);
const Material kTrim = Material::make({0.93f, 0.92f, 0.88f}, 0.5f);
const Material kWoodDark = Material::make({0.36f, 0.22f, 0.12f}, 0.55f, 0.0f, PAT_WOOD);
const Material kWoodLight = Material::make({0.62f, 0.45f, 0.28f}, 0.55f, 0.0f, PAT_WOOD);
const Material kSteel = Material::make({0.75f, 0.76f, 0.78f}, 0.3f, 1.0f, PAT_METAL);
const Material kBlackPlastic = Material::make({0.03f, 0.03f, 0.035f}, 0.4f);
const Material kWhitePorcelain = Material::make({0.93f, 0.93f, 0.92f}, 0.15f);
const Material kMirror = Material::make({0.95f, 0.95f, 0.95f}, 0.03f, 1.0f);
const Material kGlass = [] { Material m = Material::make({0.6f, 0.7f, 0.75f}, 0.05f, 0.0f, PAT_GLASS); m.alpha = 0.3f; return m; }();
const Material kLightPanel = Material::make({1.0f, 0.95f, 0.85f}, 0.5f, 0.0f, PAT_PLAIN, 9.0f);
const Material kClinicLight = Material::make({0.92f, 0.97f, 1.0f}, 0.5f, 0.0f, PAT_PLAIN, 12.0f);

Material floorMaterial(FloorKind k) {
    switch (k) {
    case FloorKind::Tile: return Material::make({0.80f, 0.78f, 0.73f}, 0.3f, 0.0f, PAT_TILE);
    case FloorKind::Wood: return Material::make({0.52f, 0.36f, 0.21f}, 0.5f, 0.0f, PAT_WOOD);
    case FloorKind::Carpet: return Material::make({0.28f, 0.32f, 0.40f}, 0.95f, 0.0f, PAT_CARPET);
    case FloorKind::Clinical: return Material::make({0.78f, 0.85f, 0.86f}, 0.25f, 0.0f, PAT_CLINIC);
    }
    return kConcrete;
}

Material fabric(vec3 c) { return Material::make(c, 0.95f, 0.0f, PAT_FABRIC); }
Material paint(vec3 c, float rough = 0.6f) { return Material::make(c, rough); }

void solid(CollisionWorld& cw, const AABB& b) { cw.addBox(b); }

// Simple chair (seat + back + legs). Faces toward `facing` (+Z local by default).
void addChair(MeshBuilder& b, vec3 pos, float yaw, const Material& seat, const Material& frame) {
    mat4 saved = b.xf;
    b.xf = saved * mat4::translate(pos) * mat4::rotateY(yaw);
    b.addBox(AABB({-0.23f, 0.43f, -0.23f}, {0.23f, 0.50f, 0.23f}), seat);
    b.addBox(AABB({-0.23f, 0.50f, -0.25f}, {0.23f, 0.95f, -0.19f}), seat);
    for (float x : {-0.2f, 0.2f})
        for (float z : {-0.2f, 0.2f}) b.addBox(AABB({x - 0.02f, 0.0f, z - 0.02f}, {x + 0.02f, 0.43f, z + 0.02f}), frame);
    b.xf = saved;
}

void addPlant(MeshBuilder& b, vec3 pos, float scale = 1.0f) {
    b.addCylinder(pos, 0.2f * scale, 0.4f * scale, 12, paint({0.55f, 0.30f, 0.18f}, 0.8f), true, 0.24f * scale);
    Material leaf = Material::make({0.16f, 0.36f, 0.12f}, 0.7f, 0.0f, PAT_FOLIAGE);
    b.addEllipsoid(pos + vec3(0, 0.75f * scale, 0), vec3(0.35f, 0.45f, 0.35f) * scale, 10, 7, leaf);
    b.addEllipsoid(pos + vec3(0.12f, 1.05f * scale, 0.05f), vec3(0.22f, 0.3f, 0.22f) * scale, 8, 6, leaf);
}

void addToilet(MeshBuilder& b, vec3 pos, float yaw) {
    mat4 saved = b.xf;
    b.xf = saved * mat4::translate(pos) * mat4::rotateY(yaw);
    b.addBox(AABB({-0.2f, 0.0f, -0.28f}, {0.2f, 0.4f, 0.2f}), kWhitePorcelain);
    b.addEllipsoid({0, 0.42f, 0.02f}, {0.21f, 0.05f, 0.27f}, 14, 6, kWhitePorcelain);
    b.addBox(AABB({-0.22f, 0.4f, -0.36f}, {0.22f, 0.8f, -0.2f}), kWhitePorcelain);
    b.xf = saved;
}

void addSinkWithMirror(MeshBuilder& b, vec3 wallPos, float yaw) {
    mat4 saved = b.xf;
    b.xf = saved * mat4::translate(wallPos) * mat4::rotateY(yaw);
    b.addBox(AABB({-0.35f, 0.0f, 0.0f}, {0.35f, 0.82f, 0.5f}), kWoodLight);
    b.addBox(AABB({-0.38f, 0.82f, -0.0f}, {0.38f, 0.86f, 0.53f}), paint({0.85f, 0.85f, 0.83f}, 0.2f));
    b.addBox(AABB({-0.2f, 0.86f, 0.12f}, {0.2f, 0.9f, 0.4f}), kWhitePorcelain);
    b.addBox(AABB({-0.03f, 0.86f, 0.05f}, {0.03f, 1.05f, 0.1f}), kSteel);
    b.addBox(AABB({-0.35f, 1.15f, 0.0f}, {0.35f, 1.85f, 0.02f}), kMirror);
    b.xf = saved;
}
}  // namespace

// ---------------------------------------------------------------- doors
mat4 Facility::Door::model() const {
    float angle = radians(95.0f) * swing.eased();
    float h0 = spec.center - spec.width * 0.5f;
    if (spec.alongX) {
        vec3 hinge{h0, kFloorY, spec.fixed};
        return mat4::translate(hinge) * mat4::rotateY(-spec.swingSign * angle);
    }
    vec3 hinge{spec.fixed, kFloorY, h0};
    return mat4::translate(hinge) * mat4::rotateY(radians(-90.0f) + spec.swingSign * angle);
}

AABB Facility::Door::panelBounds() const {
    mat4 m = model();
    float h = spec.width > 1.1f ? 2.28f : kDoorHeight - 0.02f;
    vec3 c[4] = {m.transformPoint({0, 0, -0.03f}), m.transformPoint({spec.width, 0, -0.03f}),
                 m.transformPoint({0, h, 0.03f}), m.transformPoint({spec.width, h, 0.03f})};
    AABB b(c[0], c[0]);
    for (auto& p : c) { b.min = vmin(b.min, p); b.max = vmax(b.max, p); }
    b.min = b.min - vec3(0.02f, 0, 0.02f);
    b.max = b.max + vec3(0.02f, 0, 0.02f);
    return b;
}

void Facility::toggleDoor(int i) {
    Door& d = doors[size_t(i)];
    if (d.locked && d.swing.target < 0.5f) return;
    d.swing.target = d.swing.target > 0.5f ? 0.0f : 1.0f;
}

// ---------------------------------------------------------------- build
void Facility::build(CollisionWorld& cw) {
    MeshBuilder opaque, glass;
    gateKeypad_ = AABB({-kGateHalfWidth - 1.9f, 0.0f, kSouthEdge - 2.6f}, {-kGateHalfWidth - 1.5f, 1.5f, kSouthEdge - 2.2f});
    buildShell(opaque, glass, cw);
    buildFurniture(opaque, cw);
    buildExterior(opaque, cw);
    shell_.upload(opaque);
    glass_.upload(glass);

    // Door panels (local: hinge at origin, extends +X)
    auto makeDoor = [](Mesh& mesh, float w, float h, bool front) {
        MeshBuilder b;
        Material wood = front ? Material::make({0.20f, 0.33f, 0.28f}, 0.45f) : kWoodLight;
        b.addBox(AABB({0.0f, 0.0f, -0.025f}, {w, h, 0.025f}), wood);
        if (front) {  // glass insert look + push bar
            b.addBox(AABB({0.15f, 1.0f, -0.03f}, {w - 0.15f, 2.0f, 0.03f}), Material::make({0.1f, 0.14f, 0.16f}, 0.05f, 0.5f));
            b.addBox(AABB({0.2f, 0.95f, 0.03f}, {w - 0.2f, 1.0f, 0.07f}), kSteel);
            b.addBox(AABB({0.2f, 0.95f, -0.07f}, {w - 0.2f, 1.0f, -0.03f}), kSteel);
        } else {
            b.addBox(AABB({w - 0.12f, 0.98f, 0.025f}, {w - 0.05f, 1.02f, 0.07f}), kSteel);
            b.addBox(AABB({w - 0.12f, 0.98f, -0.07f}, {w - 0.05f, 1.02f, -0.025f}), kSteel);
            b.addBox(AABB({0.1f, 1.2f, 0.025f}, {w - 0.1f, 1.95f, 0.035f}), Material::make({0.55f, 0.40f, 0.25f}, 0.5f, 0.0f, PAT_WOOD));
        }
        mesh.upload(b);
    };
    makeDoor(door_, kDoorWidth, kDoorHeight - 0.02f, false);
    makeDoor(frontDoor_, kFrontDoorWidth, 2.28f, true);

    doors.clear();
    for (const auto& spec : layout::doors()) {
        Door d;
        d.spec = spec;
        d.swing.duration = 0.9f;
        d.collider = cw.addBox(d.panelBounds());
        doors.push_back(d);
    }
    buildGate(cw);

    MeshBuilder car;
    buildCar(car, {0.55f, 0.10f, 0.08f});
    car_.upload(car);
    vec3 cp = parkedCarPos();
    playerCar = mat4::translate(cp) * mat4::rotateY(radians(180.0f));
    carCollider = cw.addBox(AABB(cp - vec3(1.0f, 0.0f, 2.6f), cp + vec3(1.0f, 1.9f, 2.6f)));
}

void Facility::setCarCollider(CollisionWorld& cw, vec3 pos, float yaw) {
    // Axis-aligned box around the (possibly turned) truck body
    float c = std::fabs(std::cos(yaw)), s = std::fabs(std::sin(yaw));
    float hx = 1.0f * c + 2.6f * s, hz = 1.0f * s + 2.6f * c;
    AABB b(pos - vec3(hx, 0.0f, hz), pos + vec3(hx, 1.9f, hz));
    if (carCollider < 0) carCollider = cw.addBox(b);
    else cw.setBox(carCollider, b);
}

void Facility::buildShell(MeshBuilder& b, MeshBuilder& glass, CollisionWorld& cw) {
    const float t = kWallThick * 0.5f;
    // ---- Floors, foundation, ceilings, roof ----
    for (const auto& r : rooms()) {
        AABB found({r.minX - t, 0.0f, r.minZ - t}, {r.maxX + t, kFloorY - 0.01f, r.maxZ + t});
        b.addBox(found, kConcrete, true);
        Material fm = floorMaterial(r.floor);
        b.addQuad({r.minX, kFloorY, r.maxZ}, {r.maxX, kFloorY, r.maxZ}, {r.maxX, kFloorY, r.minZ}, {r.minX, kFloorY, r.minZ}, fm);
        cw.addBox(AABB({r.minX - t, 0.0f, r.minZ - t}, {r.maxX + t, kFloorY, r.maxZ + t}), true);
        // Ceiling slab with an overhang (eaves) and a roof membrane on top
        const float oh = 0.35f;
        AABB slab({r.minX - t - oh, kCeilingY, r.minZ - t - oh}, {r.maxX + t + oh, kCeilingY + 0.22f, r.maxZ + t + oh});
        b.addBox(slab, kCeiling);
        b.addQuad({slab.min.x, slab.max.y + 0.005f, slab.max.z}, {slab.max.x, slab.max.y + 0.005f, slab.max.z},
                  {slab.max.x, slab.max.y + 0.005f, slab.min.z}, {slab.min.x, slab.max.y + 0.005f, slab.min.z}, kRoof);
        // Ceiling light panels
        if (r.hasLight) {
            bool clinic = r.floor == FloorKind::Clinical;
            float w = r.maxX - r.minX, d = r.maxZ - r.minZ;
            int n = (w * d > 30.0f) ? 2 : 1;
            for (int i = 0; i < n; ++i) {
                vec3 c{r.minX + w * (float(i) + 0.5f) / float(n), kCeilingY - 0.03f, (r.minZ + r.maxZ) * 0.5f};
                if (w < 2.0f || d < 2.0f) c = {(r.minX + r.maxX) * 0.5f, kCeilingY - 0.03f, (r.minZ + r.maxZ) * 0.5f};
                vec3 hs = (d < 2.0f) ? vec3(0.5f, 0.03f, 0.2f) : vec3(0.55f, 0.03f, 0.3f);
                b.addBox(c, hs, clinic ? kClinicLight : kLightPanel);
                vec3 col = clinic ? vec3(0.9f, 0.97f, 1.0f) * 9.0f : vec3(1.0f, 0.88f, 0.72f) * 6.5f;
                roomLights_.push_back({c - vec3(0, 0.25f, 0), 7.5f, col});
            }
        }
    }
    // Roof-top AC unit
    b.addBox(AABB({-2.0f, kCeilingY + 0.23f, 1.0f}, {-0.2f, kCeilingY + 1.2f, 2.4f}), paint({0.7f, 0.7f, 0.68f}, 0.4f));

    // ---- Walls: split around openings, 1 m sub-pieces, each side colored by the room it faces ----
    for (const auto& w : walls()) {
        float a = w.a, e = w.b;
        if (w.exterior) { a -= t; e += t; }
        // Cut positions: openings + every meter
        std::vector<float> cuts{a, e};
        for (const auto& o : w.openings) { cuts.push_back(o.center - o.width * 0.5f); cuts.push_back(o.center + o.width * 0.5f); }
        for (float x = std::ceil(a); x < e; x += 1.0f) cuts.push_back(x);
        std::sort(cuts.begin(), cuts.end());
        cuts.erase(std::unique(cuts.begin(), cuts.end(), [](float p, float q) { return std::fabs(p - q) < 1e-3f; }), cuts.end());

        for (size_t i = 0; i + 1 < cuts.size(); ++i) {
            float s0 = cuts[i], s1 = cuts[i + 1], mid = (s0 + s1) * 0.5f;
            const Opening* op = nullptr;
            for (const auto& o : w.openings)
                if (mid > o.center - o.width * 0.5f && mid < o.center + o.width * 0.5f) op = &o;
            // vertical spans of solid wall for this piece
            std::vector<std::pair<float, float>> ys;
            if (!op) ys.push_back({0.0f, kCeilingY});
            else {
                float bottom = op->isWindow() ? kFloorY + op->sill : kFloorY;
                float top = std::min(kCeilingY, kFloorY + (op->isWindow() ? op->sill : 0.0f) + op->height);
                ys.push_back({0.0f, bottom});
                if (top < kCeilingY) ys.push_back({top, kCeilingY});
            }
            // Sides: "neg" faces -normal (z<fixed or x<fixed)
            auto sideMat = [&](float sgn) {
                float px = w.alongX ? mid : w.fixed + sgn * 0.3f;
                float pz = w.alongX ? w.fixed + sgn * 0.3f : mid;
                const RoomSpec* rm = roomAt(px, pz);
                return rm ? paint(rm->wallColor, 0.85f) : kSiding;
            };
            Material mNeg = sideMat(-1.0f), mPos = sideMat(+1.0f);
            for (auto [y0, y1] : ys) {
                if (y1 - y0 < 0.005f) continue;
                for (int side = 0; side < 2; ++side) {
                    float d0 = side == 0 ? -t : 0.0f, d1 = side == 0 ? 0.0f : t;
                    const Material& mm = side == 0 ? mNeg : mPos;
                    // Lower band below the floor line is concrete foundation
                    std::vector<std::pair<float, float>> bands;
                    if (y0 < kFloorY && y1 > kFloorY) { bands.push_back({y0, kFloorY}); bands.push_back({kFloorY, y1}); }
                    else bands.push_back({y0, y1});
                    for (auto [b0, b1] : bands) {
                        const Material& use = b1 <= kFloorY + 1e-4f ? kConcrete : mm;
                        AABB box = w.alongX ? AABB({s0, b0, w.fixed + d0}, {s1, b1, w.fixed + d1})
                                            : AABB({w.fixed + d0, b0, s0}, {w.fixed + d1, b1, s1});
                        b.addBox(box, use, true);
                    }
                }
                AABB col = w.alongX ? AABB({s0, y0, w.fixed - t}, {s1, y1, w.fixed + t}) : AABB({w.fixed - t, y0, s0}, {w.fixed + t, y1, s1});
                if (y1 > kFloorY + 0.5f || !op || op->isWindow()) solid(cw, col);
            }
        }
        // Openings: trims, glass
        for (const auto& o : w.openings) {
            float o0 = o.center - o.width * 0.5f, o1 = o.center + o.width * 0.5f;
            float yb = o.isWindow() ? kFloorY + o.sill : kFloorY, yt = yb + o.height;
            const float tr = 0.06f, dp = t + 0.025f;
            auto box = [&](float s0, float s1, float y0, float y1, float depth, const Material& m) {
                if (w.alongX) b.addBox(AABB({s0, y0, w.fixed - depth}, {s1, y1, w.fixed + depth}), m);
                else b.addBox(AABB({w.fixed - depth, y0, s0}, {w.fixed + depth, y1, s1}), m);
            };
            box(o0 - tr, o0, yb, yt + tr, dp, kTrim);
            box(o1, o1 + tr, yb, yt + tr, dp, kTrim);
            box(o0 - tr, o1 + tr, yt, yt + tr, dp, kTrim);
            if (o.isWindow()) {
                box(o0 - tr, o1 + tr, yb - 0.05f, yb, dp + 0.05f, kTrim);  // sill
                box(o.center - 0.02f, o.center + 0.02f, yb, yt, 0.03f, kTrim);  // mullion
                if (w.alongX)
                    glass.addQuad({o0, yb, w.fixed}, {o1, yb, w.fixed}, {o1, yt, w.fixed}, {o0, yt, w.fixed}, kGlass);
                else
                    glass.addQuad({w.fixed, yb, o1}, {w.fixed, yb, o0}, {w.fixed, yt, o0}, {w.fixed, yt, o1}, kGlass);
            }
        }
    }
}

void Facility::buildFurniture(MeshBuilder& b, CollisionWorld& cw) {
    const float F = kFloorY;
    Rng rng(77);
    // ================= Waiting room =================
    // Reception desk (counter) across the back with a staff computer
    Material counter = Material::make({0.42f, 0.28f, 0.17f}, 0.5f, 0.0f, PAT_WOOD);
    b.addBox(AABB({-1.8f, F, -0.9f}, {1.8f, F + 1.05f, -0.55f}), counter);
    b.addBox(AABB({-1.9f, F + 1.05f, -0.95f}, {1.9f, F + 1.1f, -0.45f}), paint({0.85f, 0.83f, 0.78f}, 0.25f));
    b.addBox(AABB({-1.8f, F, -1.6f}, {1.8f, F + 0.75f, -0.9f}), counter);
    solid(cw, AABB({-1.9f, F, -1.6f}, {1.9f, F + 1.1f, -0.45f}));
    b.addBox(AABB({-0.35f, F + 0.75f, -1.35f}, {0.35f, F + 1.18f, -1.3f}), kBlackPlastic);
    b.addQuad({-0.32f, F + 0.78f, -1.295f}, {0.32f, F + 0.78f, -1.295f}, {0.32f, F + 1.15f, -1.295f}, {-0.32f, F + 1.15f, -1.295f},
              Material::make({1, 1, 1}, 0.1f, 0.0f, PAT_SCREEN), {1.0f / 0.64f, 1.0f / 0.37f});
    addChair(b, {0.0f, F, -1.85f}, 0.0f, fabric({0.15f, 0.15f, 0.18f}), kSteel);
    // Waiting chairs along both side walls
    for (int i = 0; i < 4; ++i) {
        float z = 2.1f + float(i) * 0.9f;
        addChair(b, {-3.55f, F, z}, radians(-90.0f), fabric({0.20f, 0.42f, 0.55f}), kSteel);
        addChair(b, {3.55f, F, z}, radians(90.0f), fabric({0.20f, 0.42f, 0.55f}), kSteel);
    }
    solid(cw, AABB({-3.95f, F, 1.8f}, {-3.3f, F + 0.9f, 5.2f}));
    solid(cw, AABB({3.3f, F, 1.8f}, {3.95f, F + 0.9f, 5.2f}));
    // Rug + coffee table + magazines
    b.addBox(AABB({-1.6f, F, 2.0f}, {1.6f, F + 0.01f, 4.8f}), fabric({0.55f, 0.22f, 0.18f}));
    b.addBox(AABB({-0.6f, F + 0.38f, 3.0f}, {0.6f, F + 0.43f, 3.8f}), kWoodDark);
    for (float x : {-0.55f, 0.55f})
        for (float z : {3.05f, 3.75f}) b.addBox(AABB({x - 0.025f, F, z - 0.025f}, {x + 0.025f, F + 0.38f, z + 0.025f}), kWoodDark);
    b.addBox(AABB({-0.3f, F + 0.43f, 3.2f}, {0.0f, F + 0.45f, 3.45f}), paint({0.8f, 0.3f, 0.2f}));
    b.addBox(AABB({0.1f, F + 0.43f, 3.3f}, {0.35f, F + 0.46f, 3.6f}), paint({0.2f, 0.4f, 0.75f}));
    solid(cw, AABB({-0.6f, F, 3.0f}, {0.6f, F + 0.45f, 3.8f}));
    addPlant(b, {-3.4f, F, -1.4f});
    addPlant(b, {3.4f, F, -1.4f});
    solid(cw, AABB({-3.7f, F, -1.7f}, {-3.1f, F + 1.0f, -1.1f}));
    solid(cw, AABB({3.1f, F, -1.7f}, {3.7f, F + 1.0f, -1.1f}));
    // Posters / notice board on the back wall
    b.addBox(AABB({-3.2f, F + 1.3f, -1.92f}, {-2.2f, F + 2.1f, -1.9f}), paint({0.95f, 0.8f, 0.3f}, 0.8f));
    b.addBox(AABB({2.2f, F + 1.3f, -1.92f}, {3.2f, F + 2.1f, -1.9f}), paint({0.4f, 0.7f, 0.85f}, 0.8f));
    b.addBox(AABB({-1.2f, F + 1.6f, -1.93f}, {1.2f, F + 2.4f, -1.9f}), kWoodDark);   // board behind desk
    for (int i = 0; i < 6; ++i) {
        float x = -1.05f + float(i) * 0.38f;
        b.addBox(AABB({x, F + 1.72f + 0.1f * float(i % 2), -1.9f}, {x + 0.28f, F + 2.1f + 0.1f * float(i % 2), -1.885f}),
                 paint({0.9f, 0.9f, 0.85f}, 0.9f));
    }

    // ================= Left hallway =================
    b.addBox(AABB({-11.6f, F, 0.45f}, {-4.4f, F + 0.008f, 1.15f}), fabric({0.35f, 0.18f, 0.14f}));
    b.addBox(AABB({-11.9f, F, 0.2f}, {-11.5f, F + 0.8f, 1.4f}), kWoodDark);  // console table at the end
    addPlant(b, {-11.7f, F + 0.8f, 0.8f}, 0.6f);
    solid(cw, AABB({-11.95f, F, 0.15f}, {-11.45f, F + 0.8f, 1.45f}));

    // ================= Left bathroom =================
    addToilet(b, {-7.5f, F, -2.5f}, radians(90.0f));
    solid(cw, AABB({-7.95f, F, -2.8f}, {-7.1f, F + 0.8f, -2.2f}));
    addSinkWithMirror(b, {-5.2f, F, -2.92f}, 0.0f);
    solid(cw, AABB({-5.6f, F, -2.95f}, {-4.8f, F + 0.9f, -2.4f}));
    b.addBox(AABB({-4.12f, F + 1.0f, -1.6f}, {-4.08f, F + 1.5f, -1.0f}), kSteel);  // towel dispenser

    // ================= Office =================
    // Desk facing north (you sit facing the front windows)
    const float dx = kOfficeDeskX, dz = kOfficeDeskZ;
    b.addBox(AABB({dx - 0.85f, F + 0.72f, dz - 0.42f}, {dx + 0.85f, F + 0.77f, dz + 0.42f}), kWoodDark);
    b.addBox(AABB({dx - 0.83f, F, dz - 0.4f}, {dx - 0.45f, F + 0.72f, dz + 0.4f}), kWoodDark);   // drawers
    b.addBox(AABB({dx + 0.78f, F, dz - 0.4f}, {dx + 0.83f, F + 0.72f, dz + 0.4f}), kWoodDark);
    b.addBox(AABB({dx - 0.45f, F + 0.3f, dz + 0.35f}, {dx + 0.78f, F + 0.72f, dz + 0.4f}), kWoodDark);
    for (int i = 0; i < 3; ++i)
        b.addBox(AABB({dx - 0.66f, F + 0.12f + 0.2f * float(i), dz - 0.41f}, {dx - 0.62f, F + 0.14f + 0.2f * float(i), dz - 0.43f}), kSteel);
    solid(cw, AABB({dx - 0.85f, F, dz - 0.42f}, {dx + 0.85f, F + 0.77f, dz + 0.42f}));
    // Monitor (screen faces -Z, toward the chair)
    vec3 mc = officeComputerPos();
    b.addBox(AABB({mc.x - 0.07f, F + 0.77f, mc.z - 0.05f}, {mc.x + 0.07f, F + 0.79f, mc.z + 0.12f}), kBlackPlastic);
    b.addBox(AABB({mc.x - 0.02f, F + 0.79f, mc.z + 0.05f}, {mc.x + 0.02f, mc.y - 0.1f, mc.z + 0.08f}), kBlackPlastic);
    b.addBox(AABB({mc.x - 0.32f, mc.y - 0.2f, mc.z}, {mc.x + 0.32f, mc.y + 0.2f, mc.z + 0.04f}), kBlackPlastic);
    b.addQuad({mc.x + 0.3f, mc.y - 0.18f, mc.z - 0.002f}, {mc.x - 0.3f, mc.y - 0.18f, mc.z - 0.002f},
              {mc.x - 0.3f, mc.y + 0.18f, mc.z - 0.002f}, {mc.x + 0.3f, mc.y + 0.18f, mc.z - 0.002f},
              Material::make({1, 1, 1}, 0.1f, 0.0f, PAT_SCREEN), {1.0f / 0.6f, 1.0f / 0.36f});
    computerBox_ = AABB({mc.x - 0.45f, F + 0.7f, mc.z - 0.45f}, {mc.x + 0.45f, mc.y + 0.25f, mc.z + 0.1f});
    // Keyboard, mouse, tower, lamp, mug
    b.addBox(AABB({dx - 0.22f, F + 0.77f, dz - 0.3f}, {dx + 0.22f, F + 0.79f, dz - 0.15f}), kBlackPlastic);
    b.addBox(AABB({dx + 0.3f, F + 0.77f, dz - 0.26f}, {dx + 0.36f, F + 0.795f, dz - 0.17f}), kBlackPlastic);
    b.addBox(AABB({dx + 0.5f, F, dz - 0.2f}, {dx + 0.7f, F + 0.45f, dz + 0.3f}), kBlackPlastic);
    b.addCylinder({dx - 0.6f, F + 0.77f, dz + 0.2f}, 0.08f, 0.02f, 12, kSteel);
    b.addCylinder({dx - 0.6f, F + 0.79f, dz + 0.2f}, 0.012f, 0.35f, 6, kSteel);
    b.addCylinder({dx - 0.6f, F + 1.08f, dz + 0.12f}, 0.09f, 0.1f, 12, Material::make({1.0f, 0.85f, 0.6f}, 0.5f, 0.0f, PAT_PLAIN, 3.0f), true, 0.04f);
    b.addCylinder({dx + 0.55f, F + 0.77f, dz - 0.05f}, 0.04f, 0.1f, 10, paint({0.8f, 0.2f, 0.15f}, 0.3f));
    // Office chair (you sit facing south / the monitor)
    {
        vec3 c{dx, F, dz - 0.95f};
        Material seat = fabric({0.08f, 0.08f, 0.09f});
        b.addBox(AABB(c + vec3(-0.26f, 0.45f, -0.25f), c + vec3(0.26f, 0.53f, 0.25f)), seat);
        b.addBox(AABB(c + vec3(-0.24f, 0.6f, -0.3f), c + vec3(0.24f, 1.15f, -0.24f)), seat);
        b.addCylinder(c + vec3(0, 0.08f, 0), 0.03f, 0.37f, 8, kSteel);
        for (int i = 0; i < 5; ++i) {
            float a = float(i) / 5.0f * 2.0f * kPi;
            mat4 saved = b.xf;
            b.xf = saved * mat4::translate(c + vec3(0, 0.07f, 0)) * mat4::rotateY(-a);
            b.addBox(AABB({0.0f, -0.02f, -0.022f}, {0.3f, 0.02f, 0.022f}), kBlackPlastic);
            b.xf = saved;
            b.addEllipsoid(c + vec3(std::cos(a) * 0.3f, 0.03f, std::sin(a) * 0.3f), vec3(0.03f), 6, 4, kBlackPlastic);
        }
        solid(cw, AABB(c + vec3(-0.3f, 0.0f, -0.32f), c + vec3(0.3f, 1.15f, 0.3f)));
    }
    // Filing cabinet, bookshelf, plant, picture, clock
    b.addBox(AABB({-11.85f, F, 1.85f}, {-11.3f, F + 1.3f, 2.45f}), paint({0.45f, 0.47f, 0.5f}, 0.35f));
    for (int i = 0; i < 4; ++i)
        b.addBox(AABB({-11.31f, F + 0.2f + 0.3f * float(i), 2.05f}, {-11.28f, F + 0.23f + 0.3f * float(i), 2.25f}), kSteel);
    solid(cw, AABB({-11.9f, F, 1.8f}, {-11.25f, F + 1.3f, 2.5f}));
    b.addBox(AABB({-11.9f, F, 2.8f}, {-11.5f, F + 2.0f, 3.4f}), kWoodDark);
    solid(cw, AABB({-11.92f, F, 2.75f}, {-11.45f, F + 2.0f, 3.45f}));
    for (int s = 0; s < 4; ++s)
        for (int k = 0; k < 7; ++k) {
            float y = F + 0.08f + 0.5f * float(s), z = 2.84f + 0.075f * float(k);
            float hgt = rng.range(0.22f, 0.36f);
            b.addBox(AABB({-11.85f, y, z}, {-11.58f, y + hgt, z + 0.06f}),
                     paint({rng.range(0.1f, 0.8f), rng.range(0.1f, 0.6f), rng.range(0.1f, 0.6f)}, 0.7f));
        }
    addPlant(b, {-4.6f, F, 5.5f}, 0.9f);
    solid(cw, AABB({-4.9f, F, 5.2f}, {-4.3f, F + 1.0f, 5.8f}));
    b.addBox(AABB({-8.6f, F + 1.5f, 1.68f}, {-7.4f, F + 2.3f, 1.7f}), kWoodDark);
    b.addBox(AABB({-8.5f, F + 1.6f, 1.7f}, {-7.5f, F + 2.2f, 1.71f}), paint({0.3f, 0.5f, 0.35f}, 0.8f));

    // ================= Right bathroom =================
    addToilet(b, {6.55f, F, -2.5f}, radians(-90.0f));
    solid(cw, AABB({6.1f, F, -2.8f}, {6.95f, F + 0.8f, -2.2f}));
    addSinkWithMirror(b, {4.9f, F, -2.92f}, 0.0f);
    solid(cw, AABB({4.5f, F, -2.95f}, {5.3f, F + 0.9f, -2.4f}));

    // ================= Medical room =================
    // Shelving units along the east wall, filled with supplies
    // Open-front shelves: back panel + shelves as separate boards so contents are visible
    auto openShelves = [&](float x0, float x1, float z0, float z1, bool alongZ, bool backAtMax) {
        Material steel = Material::make({0.82f, 0.84f, 0.86f}, 0.35f, 0.6f);
        if (alongZ) {
            float bx0 = backAtMax ? x1 - 0.03f : x0, bx1 = backAtMax ? x1 : x0 + 0.03f;
            b.addBox(AABB({bx0, F, z0}, {bx1, F + 2.1f, z1}), steel);
            b.addBox(AABB({x0, F, z0}, {x1, F + 2.1f, z0 + 0.03f}), steel);
            b.addBox(AABB({x0, F, z1 - 0.03f}, {x1, F + 2.1f, z1}), steel);
            for (int s = 0; s < 6; ++s) {
                float y = F + 0.06f + float(s) * 0.42f;
                b.addBox(AABB({x0, y, z0}, {x1, y + 0.02f, z1}), steel);
            }
        } else {
            float bz0 = backAtMax ? z1 - 0.03f : z0, bz1 = backAtMax ? z1 : z0 + 0.03f;
            b.addBox(AABB({x0, F, bz0}, {x1, F + 2.1f, bz1}), steel);
            b.addBox(AABB({x0, F, z0}, {x0 + 0.03f, F + 2.1f, z1}), steel);
            b.addBox(AABB({x1 - 0.03f, F, z0}, {x1, F + 2.1f, z1}), steel);
            for (int s = 0; s < 6; ++s) {
                float y = F + 0.06f + float(s) * 0.42f;
                b.addBox(AABB({x0, y, z0}, {x1, y + 0.02f, z1}), steel);
            }
        }
    };
    auto fillShelves = [&](float x0, float x1, float z0, float z1, bool alongZ) {
        for (int s = 0; s < 5; ++s) {
            float y = F + 0.08f + float(s) * 0.42f;
            float len = alongZ ? z1 - z0 : x1 - x0;
            float p = 0.06f;
            while (p < len - 0.25f) {
                float wdt = rng.range(0.07f, 0.22f), hgt = rng.range(0.1f, 0.32f);
                int kind = rng.irange(0, 4);
                vec3 col = kind == 0 ? vec3(0.95f, 0.95f, 0.95f) : kind == 1 ? vec3(0.2f, 0.45f, 0.8f)
                         : kind == 2 ? vec3(0.85f, 0.25f, 0.2f) : kind == 3 ? vec3(0.9f, 0.62f, 0.2f) : vec3(0.3f, 0.7f, 0.45f);
                float dmin = (alongZ ? x0 : z0) + 0.06f, dmax = (alongZ ? x1 : z1) - 0.06f;
                if (kind == 3) {
                    float r = wdt * 0.35f;
                    vec3 c = alongZ ? vec3((dmin + dmax) * 0.5f, y + 0.02f, z0 + p + r) : vec3(x0 + p + r, y + 0.02f, (dmin + dmax) * 0.5f);
                    b.addCylinder(c, r, hgt, 10, Material::make(col, 0.12f));
                    b.addCylinder(c + vec3(0, hgt, 0), r * 0.55f, 0.04f, 8, paint({0.95f, 0.95f, 0.95f}, 0.4f));
                    p += r * 2.0f + 0.03f;
                } else {
                    AABB bx = alongZ ? AABB({dmin, y + 0.02f, z0 + p}, {dmax, y + 0.02f + hgt, z0 + p + wdt})
                                     : AABB({x0 + p, y + 0.02f, dmin}, {x0 + p + wdt, y + 0.02f + hgt, dmax});
                    b.addBox(bx, paint(col, 0.6f));
                    p += wdt + 0.025f;
                }
            }
        }
    };
    openShelves(11.4f, 11.9f, -4.8f, -2.9f, true, true);
    fillShelves(11.4f, 11.9f, -4.8f, -2.9f, true);
    openShelves(11.4f, 11.9f, -2.7f, -0.3f, true, true);
    fillShelves(11.4f, 11.9f, -2.7f, -0.3f, true);
    openShelves(7.1f, 8.5f, -4.9f, -4.45f, false, false);
    fillShelves(7.1f, 8.5f, -4.9f, -4.45f, false);
    solid(cw, AABB({11.35f, F, -4.85f}, {11.95f, F + 2.1f, -0.25f}));
    solid(cw, AABB({7.05f, F, -4.95f}, {8.55f, F + 2.1f, -4.4f}));
    // Operating table: hydraulic pedestal + steel top
    vec3 ot{9.4f, F, -2.5f};
    b.addBox(AABB(ot + vec3(-0.45f, 0.0f, -0.3f), ot + vec3(0.45f, 0.06f, 0.3f)), kSteel);
    b.addCylinder(ot + vec3(0, 0.06f, 0), 0.1f, 0.72f, 16, kSteel);
    b.addBox(AABB(ot + vec3(-0.95f, 0.78f, -0.38f), ot + vec3(0.95f, 0.86f, 0.38f)), Material::make({0.85f, 0.86f, 0.88f}, 0.18f, 1.0f, PAT_METAL));
    b.addBox(AABB(ot + vec3(-0.95f, 0.86f, -0.38f), ot + vec3(0.95f, 0.9f, -0.34f)), kSteel);   // V-rails
    b.addBox(AABB(ot + vec3(-0.95f, 0.86f, 0.34f), ot + vec3(0.95f, 0.9f, 0.38f)), kSteel);
    solid(cw, AABB(ot + vec3(-0.95f, 0.0f, -0.4f), ot + vec3(0.95f, 0.9f, 0.4f)));
    // Surgical lamp from the ceiling
    b.addCylinder({9.4f, kCeilingY - 0.9f, -2.5f}, 0.025f, 0.9f, 8, kSteel, false);
    b.addCylinder({9.4f, kCeilingY - 1.05f, -2.5f}, 0.32f, 0.15f, 20, paint({0.9f, 0.9f, 0.92f}, 0.3f), true, 0.12f);
    b.addCylinder({9.4f, kCeilingY - 1.06f, -2.5f}, 0.26f, 0.01f, 20, Material::make({1, 1, 1}, 0.3f, 0.0f, PAT_PLAIN, 25.0f));
    roomLights_.push_back({{9.4f, kCeilingY - 1.3f, -2.5f}, 4.0f, vec3(1.0f, 0.98f, 0.95f) * 10.0f});
    // Instrument cart, IV stand, sink cabinet, anesthesia machine
    b.addBox(AABB({10.4f, F + 0.8f, -1.4f}, {11.0f, F + 0.84f, -0.9f}), kSteel);
    b.addBox(AABB({10.4f, F + 0.35f, -1.4f}, {11.0f, F + 0.38f, -0.9f}), kSteel);
    for (float x : {10.42f, 10.98f}) for (float z : {-1.38f, -0.92f})
        b.addCylinder({x, F, z}, 0.012f, 0.84f, 6, kSteel);
    for (int i = 0; i < 5; ++i)
        b.addBox(AABB({10.5f + 0.09f * float(i), F + 0.84f, -1.25f}, {10.53f + 0.09f * float(i), F + 0.85f, -1.0f}), kSteel);
    solid(cw, AABB({10.35f, F, -1.45f}, {11.05f, F + 0.85f, -0.85f}));
    b.addCylinder({8.3f, F, -1.4f}, 0.2f, 0.03f, 12, kSteel);
    b.addCylinder({8.3f, F, -1.4f}, 0.012f, 1.9f, 6, kSteel);
    b.addBox(AABB({8.1f, F + 1.88f, -1.41f}, {8.5f, F + 1.9f, -1.39f}), kSteel);
    b.addBox(AABB({8.35f, F + 1.5f, -1.45f}, {8.5f, F + 1.8f, -1.37f}), Material::make({0.8f, 0.9f, 0.95f}, 0.1f));
    b.addBox(AABB({7.1f, F, -3.8f}, {7.65f, F + 0.9f, -2.2f}), paint({0.85f, 0.87f, 0.88f}, 0.3f));
    b.addBox(AABB({7.1f, F + 0.9f, -3.8f}, {7.7f, F + 0.94f, -2.2f}), kSteel);
    b.addBox(AABB({7.2f, F + 0.86f, -3.3f}, {7.55f, F + 0.94f, -2.7f}), Material::make({0.6f, 0.62f, 0.64f}, 0.2f, 1.0f));
    solid(cw, AABB({7.05f, F, -3.85f}, {7.75f, F + 0.95f, -2.15f}));
    b.addBox(AABB({10.5f, F, -4.3f}, {11.1f, F + 1.3f, -3.6f}), paint({0.25f, 0.45f, 0.6f}, 0.4f));
    b.addBox(AABB({10.55f, F + 1.0f, -3.6f}, {11.05f, F + 1.25f, -3.58f}), Material::make({0.1f, 0.9f, 0.4f}, 0.2f, 0.0f, PAT_PLAIN, 1.5f));
    solid(cw, AABB({10.45f, F, -4.35f}, {11.15f, F + 1.3f, -3.55f}));
    // Red cross sign on the door side
    b.addBox(AABB({7.5f, F + 1.9f, -0.1f}, {8.1f, F + 2.5f, -0.08f}), paint({0.95f, 0.95f, 0.95f}, 0.5f));
    b.addBox(AABB({7.72f, F + 2.0f, -0.08f}, {7.88f, F + 2.4f, -0.075f}), paint({0.85f, 0.1f, 0.1f}, 0.5f));
    b.addBox(AABB({7.6f, F + 2.12f, -0.08f}, {8.0f, F + 2.28f, -0.075f}), paint({0.85f, 0.1f, 0.1f}, 0.5f));

    // ================= Appointment room =================
    vec3 et{8.2f, F, 4.3f};
    b.addBox(AABB(et + vec3(-0.7f, 0.0f, -0.35f), et + vec3(0.7f, 0.8f, 0.35f)), paint({0.6f, 0.68f, 0.72f}, 0.4f));
    b.addBox(AABB(et + vec3(-0.75f, 0.8f, -0.4f), et + vec3(0.75f, 0.86f, 0.4f)), Material::make({0.85f, 0.86f, 0.88f}, 0.2f, 1.0f, PAT_METAL));
    solid(cw, AABB(et + vec3(-0.75f, 0.0f, -0.4f), et + vec3(0.75f, 0.86f, 0.4f)));
    addChair(b, {5.0f, F, 3.0f}, radians(90.0f), fabric({0.5f, 0.35f, 0.25f}), kWoodDark);
    addChair(b, {5.0f, F, 3.8f}, radians(90.0f), fabric({0.5f, 0.35f, 0.25f}), kWoodDark);
    solid(cw, AABB({4.7f, F, 2.7f}, {5.3f, F + 0.95f, 4.1f}));
    b.addBox(AABB({10.9f, F + 0.72f, 2.1f}, {11.85f, F + 0.76f, 3.6f}), kWoodLight);
    b.addBox(AABB({11.5f, F, 2.15f}, {11.8f, F + 0.72f, 3.55f}), kWoodLight);
    b.addBox(AABB({11.55f, F + 0.76f, 2.6f}, {11.6f, F + 1.1f, 3.1f}), kBlackPlastic);
    b.addQuad({11.545f, F + 0.79f, 2.63f}, {11.545f, F + 0.79f, 3.07f}, {11.545f, F + 1.07f, 3.07f}, {11.545f, F + 1.07f, 2.63f},
              Material::make({1, 1, 1}, 0.1f, 0.0f, PAT_SCREEN), {1.0f / 0.44f, 1.0f / 0.28f});
    addChair(b, {10.6f, F, 2.85f}, radians(-90.0f), fabric({0.1f, 0.1f, 0.1f}), kSteel);
    solid(cw, AABB({10.3f, F, 2.05f}, {11.9f, F + 0.95f, 3.65f}));
    b.addBox(AABB({4.4f, F, 5.3f}, {6.6f, F + 0.9f, 5.9f}), kWoodLight);
    b.addBox(AABB({4.35f, F + 0.9f, 5.25f}, {6.65f, F + 0.94f, 5.92f}), paint({0.85f, 0.85f, 0.83f}, 0.2f));
    b.addBox(AABB({5.2f, F + 0.9f, 5.45f}, {5.8f, F + 0.95f, 5.8f}), kSteel);
    solid(cw, AABB({4.3f, F, 5.2f}, {6.7f, F + 0.95f, 5.95f}));
    b.addBox(AABB({9.8f, F, 5.0f}, {10.6f, F + 0.08f, 5.6f}), paint({0.3f, 0.3f, 0.32f}, 0.5f));   // floor scale
    b.addBox(AABB({10.1f, F + 0.08f, 5.5f}, {10.3f, F + 1.0f, 5.6f}), kSteel);
    b.addBox(AABB({6.5f, F + 1.4f, 1.68f}, {7.4f, F + 2.2f, 1.7f}), paint({0.95f, 0.6f, 0.4f}, 0.8f));
    b.addBox(AABB({11.92f, F + 1.3f, 4.8f}, {11.9f, F + 2.0f, 5.6f}), paint({0.5f, 0.75f, 0.5f}, 0.8f));

    // ================= Right hallway =================
    b.addBox(AABB({4.4f, F, 0.45f}, {11.6f, F + 0.008f, 1.15f}), fabric({0.35f, 0.18f, 0.14f}));
    b.addBox(AABB({11.35f, F, 0.25f}, {11.85f, F + 0.45f, 1.35f}), kWoodDark);   // bench at the end
    solid(cw, AABB({11.3f, F, 0.2f}, {11.9f, F + 0.45f, 1.4f}));
}

void Facility::buildExterior(MeshBuilder& b, CollisionWorld& cw) {
    // Front porch + steps
    b.addBox(AABB({-2.6f, 0.0f, 6.08f}, {2.6f, kFloorY - 0.02f, 8.4f}), kConcrete);
    cw.addBox(AABB({-2.6f, 0.0f, 6.08f}, {2.6f, kFloorY - 0.02f, 8.4f}), true);
    b.addBox(AABB({-1.8f, 0.0f, 8.4f}, {1.8f, 0.14f, 8.8f}), kConcrete);
    cw.addBox(AABB({-1.8f, 0.0f, 8.4f}, {1.8f, 0.14f, 8.8f}), true);
    // Porch roof on posts
    b.addBox(AABB({-2.7f, 2.75f, 6.08f}, {2.7f, 2.9f, 8.5f}), kTrim);
    for (float x : {-2.5f, 2.5f}) {
        b.addBox(AABB({x - 0.08f, kFloorY - 0.02f, 8.2f}, {x + 0.08f, 2.75f, 8.36f}), kTrim);
        cw.addBox(AABB({x - 0.08f, 0.0f, 8.2f}, {x + 0.08f, 2.75f, 8.36f}));
    }
    // Sign board above the porch
    b.addBox(AABB({-2.2f, 2.9f, 8.3f}, {2.2f, 3.55f, 8.42f}), paint({0.15f, 0.35f, 0.3f}, 0.5f));
    b.addBox(AABB({-2.0f, 3.05f, 8.42f}, {2.0f, 3.12f, 8.44f}), paint({0.95f, 0.9f, 0.75f}, 0.5f));
    b.addBox(AABB({-1.6f, 3.3f, 8.42f}, {1.6f, 3.38f, 8.44f}), paint({0.95f, 0.9f, 0.75f}, 0.5f));
    // Paw print on the sign (one pad + four toes)
    b.addEllipsoid({0.0f, 3.2f, 8.43f}, {0.09f, 0.07f, 0.01f}, 10, 5, paint({0.95f, 0.6f, 0.25f}, 0.5f));
    // Walkway to the parking lot
    b.addBox(AABB({-1.8f, 0.0f, 8.8f}, {1.8f, 0.03f, kParkMinZ}), kConcrete);
    // Parking lot
    b.addBox(AABB({kParkMinX, 0.0f, kParkMinZ}, {kParkMaxX, 0.04f, kParkMaxZ}), Material::make({0.16f, 0.16f, 0.17f}, 0.85f, 0.0f, PAT_PARKING));
    // Curbs
    b.addBox(AABB({kParkMinX - 0.2f, 0.0f, kParkMinZ - 0.2f}, {kParkMinX, 0.15f, kParkMaxZ}), kConcrete);
    b.addBox(AABB({kParkMaxX, 0.0f, kParkMinZ - 0.2f}, {kParkMaxX + 0.2f, 0.15f, kParkMaxZ}), kConcrete);
    // Access road: parking lot -> gate -> highway
    {
        Material road = Material::make({0.17f, 0.17f, 0.18f}, 0.85f, 0.0f, PAT_ROADLINE);
        float z0 = kParkMaxZ, z1 = kHighwayZ - kHighwayHalfWidth + 0.05f;
        for (float z = z0; z < z1; z += 20.0f) {
            float ze = std::min(z1, z + 20.0f);
            uint32_t base = uint32_t(b.verts.size());
            b.addVertex({-kRoadHalfWidth, 0.035f, z}, {0, 1, 0}, {0.0f, z}, road);
            b.addVertex({kRoadHalfWidth, 0.035f, z}, {0, 1, 0}, {7.0f, z}, road);
            b.addVertex({kRoadHalfWidth, 0.035f, ze}, {0, 1, 0}, {7.0f, ze}, road);
            b.addVertex({-kRoadHalfWidth, 0.035f, ze}, {0, 1, 0}, {0.0f, ze}, road);
            b.addTri(base, base + 3, base + 2);
            b.addTri(base, base + 2, base + 1);
        }
        // gravel shoulders
        Material gravel = Material::make({0.45f, 0.42f, 0.38f}, 0.95f, 0.0f, PAT_CONCRETE);
        b.addBox(AABB({-kRoadHalfWidth - 0.8f, 0.0f, z0}, {-kRoadHalfWidth, 0.025f, z1}), gravel);
        b.addBox(AABB({kRoadHalfWidth, 0.0f, z0}, {kRoadHalfWidth + 0.8f, 0.025f, z1}), gravel);
    }
    // Lamp posts around the parking lot + mailbox + bench + trash can + planters
    const vec3 lamps[] = {{kParkMinX + 0.6f, 0, kParkMinZ + 0.6f}, {kParkMaxX - 0.6f, 0, kParkMinZ + 0.6f},
                          {kParkMinX + 0.6f, 0, kParkMaxZ - 0.6f}, {kParkMaxX - 0.6f, 0, kParkMaxZ - 0.6f},
                          {-kRoadHalfWidth - 1.5f, 0, 300.0f}, {-kRoadHalfWidth - 1.5f, 0, kSouthEdge - 12.0f}};
    Material pole = Material::make({0.12f, 0.12f, 0.13f}, 0.4f, 0.8f);
    MeshBuilder heads;
    for (vec3 p : lamps) {
        b.addCylinder(p, 0.09f, 5.0f, 10, pole);
        b.addBox(AABB(p + vec3(-0.1f, 4.9f, -0.1f), p + vec3(0.9f, 5.0f, 0.1f)), pole);
        heads.addBox(AABB(p + vec3(0.55f, 4.8f, -0.18f), p + vec3(1.0f, 4.9f, 0.18f)),
                     Material::make({1.0f, 0.85f, 0.6f}, 0.4f, 0.0f, PAT_PLAIN, 18.0f));
        cw.addBox(AABB(p - vec3(0.12f, 0.0f, 0.12f), p + vec3(0.12f, 5.0f, 0.12f)));
        outdoorLights_.push_back({p + vec3(0.78f, 4.4f, 0.0f), 22.0f, vec3(1.0f, 0.8f, 0.55f) * 40.0f});
    }
    // Wall lights by the front door
    for (float x : {-1.0f, 1.0f}) {
        heads.addBox(AABB({x - 0.08f, 2.25f, 6.09f}, {x + 0.08f, 2.5f, 6.2f}), Material::make({1.0f, 0.85f, 0.6f}, 0.4f, 0.0f, PAT_PLAIN, 10.0f));
        outdoorLights_.push_back({{x, 2.3f, 6.6f}, 8.0f, vec3(1.0f, 0.8f, 0.55f) * 6.0f});
    }
    emissiveNight_.upload(heads);

    auto bench = [&](vec3 p, float yaw) {
        mat4 saved = b.xf;
        b.xf = mat4::translate(p) * mat4::rotateY(yaw);
        b.addBox(AABB({-0.9f, 0.42f, -0.22f}, {0.9f, 0.47f, 0.22f}), kWoodLight);
        b.addBox(AABB({-0.9f, 0.6f, 0.2f}, {0.9f, 0.85f, 0.24f}), kWoodLight);
        for (float x : {-0.8f, 0.8f}) b.addBox(AABB({x - 0.04f, 0.0f, -0.2f}, {x + 0.04f, 0.6f, 0.24f}), pole);
        b.xf = saved;
        cw.addBox(AABB(p - vec3(0.9f, 0.0f, 0.3f), p + vec3(0.9f, 0.85f, 0.3f)));
    };
    bench({-4.5f, 0.0f, 7.4f}, radians(180.0f));
    bench({4.5f, 0.0f, 7.4f}, radians(180.0f));
    b.addCylinder({3.3f, 0.0f, 8.6f}, 0.25f, 0.9f, 12, Material::make({0.2f, 0.35f, 0.25f}, 0.5f));
    cw.addBox(AABB({3.05f, 0.0f, 8.35f}, {3.55f, 0.9f, 8.85f}));
    for (float x : {-8.0f, 8.0f}) {
        b.addBox(AABB({x - 1.5f, 0.0f, 6.3f}, {x + 1.5f, 0.45f, 7.1f}), kConcrete);
        b.addBox(AABB({x - 1.4f, 0.45f, 6.4f}, {x + 1.4f, 0.47f, 7.0f}), Material::make({0.25f, 0.17f, 0.1f}, 0.95f));
        for (int i = 0; i < 4; ++i)
            b.addEllipsoid({x - 1.05f + 0.7f * float(i), 0.7f, 6.7f}, {0.32f, 0.28f, 0.3f}, 8, 6,
                           Material::make({0.18f, 0.38f, 0.14f}, 0.8f, 0.0f, PAT_FOLIAGE));
        cw.addBox(AABB({x - 1.5f, 0.0f, 6.3f}, {x + 1.5f, 0.8f, 7.1f}));
    }
    // Shade trees around the lot and building
    {
        MeshBuilder oak;
        Material bark = Material::make({0.33f, 0.25f, 0.17f}, 0.95f, 0.0f, PAT_BARK);
        Material leaves = Material::make({0.18f, 0.32f, 0.10f}, 0.8f, 0.0f, PAT_FOLIAGE);
        const vec3 spots[] = {{-30.0f, 0, 14.0f}, {-31.0f, 0, 32.0f}, {30.0f, 0, 16.0f}, {31.0f, 0, 34.0f}, {-18.0f, 0, -9.0f},
                              {18.0f, 0, -10.0f}, {-24.0f, 0, 2.0f}, {25.0f, 0, 3.0f}, {-9.0f, 0, 60.0f}, {9.0f, 0, 75.0f}};
        Rng tr(9);
        for (vec3 p : spots) {
            float s = tr.range(0.8f, 1.2f);
            b.addCylinder(p, 0.3f * s, 3.6f * s, 8, bark, false, 0.2f * s);
            b.addEllipsoid(p + vec3(0, 5.2f * s, 0), vec3(2.9f, 2.3f, 2.9f) * s, 10, 7, leaves);
            b.addEllipsoid(p + vec3(1.3f, 4.6f, 0.8f) * s, vec3(1.9f, 1.6f, 1.9f) * s, 9, 6, leaves);
            b.addEllipsoid(p + vec3(-1.2f, 4.8f, -0.9f) * s, vec3(1.8f, 1.6f, 1.8f) * s, 9, 6, leaves);
            cw.addBox(AABB(p - vec3(0.35f, 0.0f, 0.35f), p + vec3(0.35f, 4.0f, 0.35f)));
        }
    }
    // Mailbox by the road entrance
    b.addCylinder({5.0f, 0.0f, 44.0f}, 0.05f, 1.1f, 8, kWoodDark);
    b.addBox(AABB({4.8f, 1.1f, 43.8f}, {5.2f, 1.35f, 44.35f}), paint({0.2f, 0.25f, 0.5f}, 0.4f));
    // Gate posts, sliding track and the owner's keypad
    for (float x : {-kGateHalfWidth - 0.2f, kGateHalfWidth + 0.2f}) {
        b.addBox(AABB({x - 0.15f, 0.0f, kSouthEdge - 0.15f}, {x + 0.15f, 2.6f, kSouthEdge + 0.15f}), pole);
        b.addBox(AABB({x - 0.18f, 2.6f, kSouthEdge - 0.18f}, {x + 0.18f, 2.68f, kSouthEdge + 0.18f}), pole);
        cw.addBox(AABB({x - 0.15f, 0.0f, kSouthEdge - 0.15f}, {x + 0.15f, 2.6f, kSouthEdge + 0.15f}));
    }
    b.addBox(AABB({-kGateHalfWidth, 0.0f, kSouthEdge - 0.32f}, {kGateHalfWidth * 3.0f + 0.4f, 0.05f, kSouthEdge - 0.18f}), kSteel);
    {
        vec3 k = gateKeypad_.center();
        b.addBox(AABB({k.x - 0.08f, 0.0f, k.z - 0.08f}, {k.x + 0.08f, 1.2f, k.z + 0.08f}), pole);
        b.addBox(AABB({k.x - 0.16f, 1.1f, k.z - 0.12f}, {k.x + 0.16f, 1.45f, k.z + 0.1f}), paint({0.25f, 0.27f, 0.3f}, 0.4f));
        b.addBox(AABB({k.x - 0.1f, 1.3f, k.z - 0.125f}, {k.x + 0.1f, 1.4f, k.z - 0.12f}),
                 Material::make({0.2f, 1.0f, 0.4f}, 0.3f, 0.0f, PAT_PLAIN, 2.0f));
        cw.addBox(AABB({k.x - 0.16f, 0.0f, k.z - 0.12f}, {k.x + 0.16f, 1.45f, k.z + 0.1f}));
    }
    // Built-in security cameras (gate + parking lot) on poles, and one in the waiting room
    auto camPole = [&](vec3 base, float h, float yaw) {
        b.addCylinder(base, 0.07f, h, 8, pole);
        mat4 saved = b.xf;
        b.xf = mat4::translate(base + vec3(0, h, 0)) * mat4::rotateY(yaw);
        b.addBox(AABB({-0.1f, -0.14f, -0.05f}, {0.1f, 0.06f, 0.35f}), paint({0.9f, 0.9f, 0.88f}, 0.3f));
        b.addCylinder({0.0f, -0.08f, 0.35f}, 0.045f, 0.02f, 10, kBlackPlastic);
        b.xf = saved;
        cw.addBox(AABB(base - vec3(0.1f, 0.0f, 0.1f), base + vec3(0.1f, h, 0.1f)));
    };
    camPole({8.0f, 0.0f, kSouthEdge - 8.0f}, 4.2f, radians(-38.0f));
    camPole({-21.5f, 0.0f, 39.5f}, 4.6f, radians(130.0f));
    {
        mat4 saved = b.xf;
        b.xf = mat4::translate({3.6f, kCeilingY - 0.3f, 5.7f}) * mat4::rotateY(radians(-150.0f));
        b.addBox(AABB({-0.02f, 0.05f, -0.02f}, {0.02f, 0.3f, 0.02f}), pole);
        b.addBox(AABB({-0.07f, -0.06f, -0.12f}, {0.07f, 0.06f, 0.14f}), paint({0.9f, 0.9f, 0.88f}, 0.3f));
        b.xf = saved;
    }
    // Property sign near the gate (inside)
    b.addBox(AABB({-8.0f, 0.0f, kSouthEdge - 8.0f}, {-7.85f, 2.2f, kSouthEdge - 7.85f}), kWoodDark);
    b.addBox(AABB({-10.4f, 0.0f, kSouthEdge - 8.0f}, {-10.25f, 2.2f, kSouthEdge - 7.85f}), kWoodDark);
    b.addBox(AABB({-10.6f, 1.2f, kSouthEdge - 8.02f}, {-7.65f, 2.1f, kSouthEdge - 7.84f}), paint({0.15f, 0.35f, 0.3f}, 0.5f));
    b.addBox(AABB({-10.3f, 1.55f, kSouthEdge - 7.83f}, {-7.95f, 1.62f, kSouthEdge - 7.82f}), paint({0.95f, 0.9f, 0.75f}, 0.5f));
}

void Facility::buildGate(CollisionWorld& cw) {
    MeshBuilder g;
    Material frame = Material::make({0.55f, 0.56f, 0.58f}, 0.35f, 1.0f, PAT_METAL);
    const float w = kGateHalfWidth * 2.0f + 0.2f, h = 2.2f;
    // Local: x from 0..w (starts at the west gate post), z = 0 at fence line
    g.addBox(AABB({0.0f, 0.1f, -0.04f}, {w, 0.18f, 0.04f}), frame);
    g.addBox(AABB({0.0f, h - 0.08f, -0.04f}, {w, h, 0.04f}), frame);
    g.addBox(AABB({0.0f, 1.1f, -0.03f}, {w, 1.16f, 0.03f}), frame);
    for (int i = 0; i <= 6; ++i) {
        float x = w * float(i) / 6.0f;
        g.addBox(AABB({x - 0.04f, 0.1f, -0.04f}, {x + 0.04f, h, 0.04f}), frame);
    }
    // Diagonal brace
    {
        mat4 saved = g.xf;
        float len = std::sqrt(w * w * 0.25f + h * h);
        g.xf = mat4::translate({w * 0.25f, h * 0.5f, 0.0f}) * mat4::rotate(quat::axisAngle({0, 0, 1}, std::atan2(h - 0.2f, w * 0.5f)));
        g.addBox(AABB({-len * 0.5f, -0.03f, -0.03f}, {len * 0.5f, 0.03f, 0.03f}), frame);
        g.xf = saved;
    }
    Material mesh = Material::make({0.6f, 0.62f, 0.64f}, 0.4f, 1.0f, PAT_FENCE);
    g.addQuad({0.0f, 0.15f, 0.0f}, {w, 0.15f, 0.0f}, {w, h - 0.05f, 0.0f}, {0.0f, h - 0.05f, 0.0f}, mesh);
    // Wheels
    for (float x : {0.3f, w - 0.3f}) {
        mat4 saved = g.xf;
        g.xf = mat4::translate({x, 0.1f, 0.0f}) * mat4::rotate(quat::axisAngle({1, 0, 0}, kPi * 0.5f));
        g.addCylinder({0.0f, -0.03f, 0.0f}, 0.1f, 0.06f, 12, Material::make({0.1f, 0.1f, 0.1f}, 0.6f));
        g.xf = saved;
    }
    // Amber warning beacon (on the panel's east end)
    g.addCylinder({w - 0.05f, h, 0.0f}, 0.07f, 0.14f, 10, Material::make({1.0f, 0.55f, 0.1f}, 0.3f, 0.0f, PAT_PLAIN, 4.0f));
    gatePanel_.upload(g);
    gate.duration = 7.0f;
    gate.curve = Ease::InOutSine;
    gateCollider_ = cw.addBox(AABB({-kGateHalfWidth, 0.0f, kSouthEdge - 0.3f}, {kGateHalfWidth, 2.2f, kSouthEdge + 0.3f}));
}

// ---------------------------------------------------------------- update / draw
void Facility::update(float dt, SecuritySystem& sec, float hour, CollisionWorld& cw) {
    for (size_t i = 0; i < doors.size(); ++i) {
        Door& d = doors[i];
        d.locked = i < sec.doorLocked.size() && sec.doorLocked[i];
        if (d.locked) d.swing.target = 0.0f;   // locking a door closes it
        bool wasMoving = d.swing.moving();
        d.swing.update(dt);
        if (d.swing.moving()) cw.setEnabled(d.collider, false);
        else if (wasMoving) {
            cw.setBox(d.collider, d.panelBounds());
            cw.setEnabled(d.collider, true);
        }
    }
    gate.target = sec.gateShouldBeOpen(hour) || gateRemote ? 1.0f : 0.0f;
    gate.update(dt);
    float open = gate.eased() * (kGateHalfWidth * 2.0f);
    cw.setBox(gateCollider_, AABB({-kGateHalfWidth + open, 0.0f, kSouthEdge - 0.3f}, {kGateHalfWidth + open, 2.2f, kSouthEdge + 0.3f}));
}

void Facility::draw(Renderer& r, Pass pass, float night, float time) const {
    if (pass == Pass::Transparent) {
        r.draw(glass_);
        return;
    }
    r.draw(shell_);
    r.draw(emissiveNight_, mat4(), vec4(vec3(lerpf(0.25f, 1.0f, night)), 1.0f));
    for (const Door& d : doors) r.draw(d.spec.width > 1.1f ? frontDoor_ : door_, d.model());
    // Gate: slides east along its rail and pulses while it moves.
    float open = gate.eased() * (kGateHalfWidth * 2.0f);
    float blink = gate.moving() ? (std::fmod(time, 0.8f) < 0.4f ? 1.0f : 0.6f) : 0.85f;
    r.setDoubleSided(true);
    r.draw(gatePanel_, mat4::translate({-kGateHalfWidth - 0.1f + open, 0.0f, kSouthEdge - 0.25f}), vec4(vec3(blink), 1.0f));
    r.setDoubleSided(false);
    if (drawCar) r.draw(car_, playerCar);
}

void Facility::appendLights(std::vector<PointLight>& out, float night) const {
    out.insert(out.end(), roomLights_.begin(), roomLights_.end());
    if (night > 0.05f)
        for (PointLight l : outdoorLights_) { l.color = l.color * night; out.push_back(l); }
}

Interaction Facility::pick(vec3 ro, vec3 rd, float maxDist, const SecuritySystem& sec) const {
    Interaction best;
    best.distance = maxDist;
    for (size_t i = 0; i < doors.size(); ++i) {
        AABB b = doors[i].panelBounds();
        b.min = b.min - vec3(0.05f, 0, 0.05f);
        b.max = b.max + vec3(0.05f, 0, 0.05f);
        float t = rayAABB(ro, rd, b);
        if (t >= 0.0f && t < best.distance) {
            best.type = Interaction::Door;
            best.index = int(i);
            best.distance = t;
            const Door& d = doors[i];
            if (d.locked) best.prompt = d.spec.name + " (locked - unlock it from the office computer)";
            else best.prompt = std::string(d.swing.target > 0.5f ? "Close " : "Open ") + d.spec.name;
        }
    }
    float t = rayAABB(ro, rd, computerBox_);
    if (t >= 0.0f && t < best.distance) {
        best.type = Interaction::Computer;
        best.index = 0;
        best.distance = t;
        best.prompt = "Use computer";
    }
    {
        AABB table({8.45f, kFloorY, -2.9f}, {10.35f, kFloorY + 1.0f, -2.1f});
        float tt = rayAABB(ro, rd, table);
        if (tt >= 0.0f && tt < best.distance) {
            best.type = Interaction::OperatingTable;
            best.index = 0;
            best.distance = tt;
            best.prompt = "Operating table";
        }
    }
    t = rayAABB(ro, rd, gateKeypad_);
    AABB gateBox({-kGateHalfWidth, 0.0f, kSouthEdge - 0.6f}, {kGateHalfWidth, 2.2f, kSouthEdge + 0.6f});
    float t2 = rayAABB(ro, rd, gateBox);
    if (t2 >= 0.0f && (t < 0.0f || t2 < t)) t = t2;
    if (t >= 0.0f && t < best.distance) {
        best.type = Interaction::Gate;
        best.index = 0;
        best.distance = t;
        if (sec.gateLocked) best.prompt = "Gate locked - unlock it from the office computer";
        else best.prompt = gate.target > 0.5f ? "Close highway gate (owner only)" : "Open highway gate (owner only)";
    }
    return best;
}

void Facility::interact(const Interaction& it, SecuritySystem& sec) {
    switch (it.type) {
    case Interaction::Door: toggleDoor(it.index); break;
    case Interaction::Gate:
        if (!sec.gateLocked && sec.canOperateGate("You (Owner)")) sec.gateManualOpen = !(gate.target > 0.5f);
        if (!sec.gateManualOpen && sec.gateAutomatic) sec.gateAutomatic = false;   // manual close overrides auto
        break;
    default: break;
    }
}

// ---------------------------------------------------------------- car
void Facility::buildCar(MeshBuilder& b, vec3 paintCol) {
    // Pickup truck, nose toward +Z, origin at ground center
    Material body = Material::make(paintCol, 0.25f, 0.4f);
    Material dark = Material::make({0.05f, 0.05f, 0.06f}, 0.5f);
    Material glassM = Material::make({0.05f, 0.07f, 0.09f}, 0.05f, 0.6f);
    Material chrome = Material::make({0.8f, 0.8f, 0.82f}, 0.15f, 1.0f);
    b.addBox(AABB({-0.95f, 0.45f, -2.55f}, {0.95f, 1.05f, 2.55f}), body);        // chassis/body
    b.addBox(AABB({-0.9f, 1.05f, -0.2f}, {0.9f, 1.75f, 1.2f}), body);             // cab
    b.addBox(AABB({-0.86f, 1.12f, 1.2f}, {0.86f, 1.68f, 1.23f}), glassM);        // windshield
    b.addBox(AABB({-0.86f, 1.12f, -0.23f}, {0.86f, 1.62f, -0.2f}), glassM);      // rear window
    b.addBox(AABB({-0.91f, 1.15f, 0.0f}, {0.91f, 1.6f, 1.1f}), glassM);           // side windows
    b.addBox(AABB({-0.95f, 1.05f, -2.55f}, {-0.85f, 1.3f, -0.25f}), body);        // bed walls
    b.addBox(AABB({0.85f, 1.05f, -2.55f}, {0.95f, 1.3f, -0.25f}), body);
    b.addBox(AABB({-0.95f, 1.05f, -2.55f}, {0.95f, 1.3f, -2.45f}), body);
    b.addBox(AABB({-0.97f, 0.45f, 2.5f}, {0.97f, 0.75f, 2.62f}), chrome);         // bumper
    b.addBox(AABB({-0.8f, 0.8f, 2.55f}, {-0.5f, 0.95f, 2.58f}), Material::make({1, 1, 0.9f}, 0.2f, 0.0f, PAT_PLAIN, 6.0f));
    b.addBox(AABB({0.5f, 0.8f, 2.55f}, {0.8f, 0.95f, 2.58f}), Material::make({1, 1, 0.9f}, 0.2f, 0.0f, PAT_PLAIN, 6.0f));
    b.addBox(AABB({-0.85f, 0.8f, -2.58f}, {-0.6f, 0.95f, -2.55f}), Material::make({0.9f, 0.05f, 0.03f}, 0.2f, 0.0f, PAT_PLAIN, 3.0f));
    b.addBox(AABB({0.6f, 0.8f, -2.58f}, {0.85f, 0.95f, -2.55f}), Material::make({0.9f, 0.05f, 0.03f}, 0.2f, 0.0f, PAT_PLAIN, 3.0f));
    for (float x : {-0.95f, 0.95f})
        for (float z : {-1.6f, 1.6f}) {
            mat4 saved = b.xf;
            b.xf = saved * mat4::translate({x, 0.42f, z}) * mat4::rotate(quat::axisAngle({0, 0, 1}, kPi * 0.5f));
            b.addCylinder({0.0f, -0.14f, 0.0f}, 0.42f, 0.28f, 16, dark);
            b.addCylinder({0.0f, -0.15f, 0.0f}, 0.22f, 0.30f, 12, chrome);
            b.xf = saved;
        }
}

}  // namespace ps
