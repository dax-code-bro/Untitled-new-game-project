#include "world/World.h"
#include "core/Noise.h"
#include "world/Layout.h"
#include "world/Terrain.h"
#include <chrono>
#include <cstdio>
#include <future>

namespace ps {
using namespace layout;

static constexpr float kTreeCell = 200.0f;
static constexpr float kTreeShadowRadius = 280.0f;

static float snapDown(float v, float s) { return std::floor(v / s) * s; }
static float snapUp(float v, float s) { return std::ceil(v / s) * s; }

void World::build(float detail) {
    const float d = detail >= 1.5f ? 2.0f : 1.0f;
    auto t0 = std::chrono::steady_clock::now();
    // ---- Terrain: three nested LOD rings, generated in parallel ----
    scenery::Rect l0{-1536.0f, -1248.0f, 1536.0f, 1824.0f};
    scenery::Rect l1{-8000.0f, -7680.0f, 8000.0f, 8320.0f};
    scenery::Rect l2{snapDown(kRegionMinX - kBackgroundExtent, 160.0f * d), snapDown(kRegionMinZ - kBackgroundExtent, 160.0f * d),
                     snapUp(kRegionMaxX + kBackgroundExtent, 160.0f * d), snapUp(kRegionMaxZ + kBackgroundExtent, 160.0f * d)};
#ifdef __EMSCRIPTEN__
    const auto policy = std::launch::deferred;   // no threads in the browser build
#else
    const auto policy = std::launch::async;
#endif
    auto f0 = std::async(policy, [=] { return scenery::buildTerrainLevel(l0, 6.0f * d, 8, nullptr); });
    auto f1 = std::async(policy, [=] { return scenery::buildTerrainLevel(l1, 32.0f * d, 8, &l0); });
    auto f2 = std::async(policy, [=] { return scenery::buildTerrainLevel(l2, 160.0f * d, 8, &l1); });
    int level = 0;
    for (auto* f : {&f0, &f1, &f2}) {
        auto tiles = f->get();
        for (auto& t : tiles) {
            Chunk c;
            c.mesh.upload(t.builder);
            c.bounds = t.bounds;
            c.level = level;
            terrain_.push_back(std::move(c));
        }
        ++level;
    }

    MeshBuilder b;
    scenery::buildHighway(b);
    highway_.upload(b);
    b.clear();
    scenery::buildPineTree(b);
    pine_.upload(b);
    pineShadow_.upload(b);
    b.clear();
    scenery::buildOakTree(b);
    oak_.upload(b);
    oakShadow_.upload(b);
    b.clear();
    scenery::buildBush(b); bush_.upload(b); b.clear();
    scenery::buildRock(b); rock_.upload(b); b.clear();
    scenery::buildGrassClump(b, false); grass_.upload(b); b.clear();
    scenery::buildGrassClump(b, true); flowers_.upload(b); b.clear();
    scenery::buildUtilityPole(b);
    poles_.upload(b);
    std::vector<InstanceData> poles;
    for (float x = -6000.0f; x <= 6000.0f; x += 55.0f) {
        InstanceData d;
        d.model = mat4::translate({x, 0.0f, kHighwayZ + kHighwayHalfWidth + 6.0f});
        poles.push_back(d);
    }
    poles_.setInstances(poles);
    b.clear();
    Facility::buildCar(b, {0.85f, 0.85f, 0.85f});
    traffic_.upload(b);
    for (int i = 0; i < int(BuildKind::Count); ++i) {
        b.clear();
        scenery::buildBuildable(b, BuildKind(i));
        buildables_[i].upload(b);
    }

    // Traffic: 4 lanes, eastbound on the south side
    Rng rng(4242);
    for (int i = 0; i < 28; ++i) {
        Car c;
        c.lane = i % 4;
        c.x0 = rng.range(-4000.0f, 4000.0f);
        c.speed = rng.range(24.0f, 33.0f);
        static const vec3 paints[] = {{0.8f, 0.8f, 0.82f}, {0.1f, 0.1f, 0.12f}, {0.6f, 0.08f, 0.06f}, {0.12f, 0.2f, 0.45f},
                                      {0.5f, 0.5f, 0.52f}, {0.9f, 0.9f, 0.88f}, {0.15f, 0.3f, 0.2f}, {0.7f, 0.55f, 0.2f}};
        c.tint = vec4(paints[rng.irange(0, 7)] * 1.1f, 1.0f);
        cars_.push_back(c);
    }

    facility.build(collision);
    auto t1 = std::chrono::steady_clock::now();
    std::fprintf(stderr, "[world] built %zu terrain tiles in %.2fs\n", terrain_.size(),
                 std::chrono::duration<double>(t1 - t0).count());
}

bool World::clearGround(float x, float z, float pad) const {
    // The shelter, parking, access road, gate, highway and the pet store stay clear
    AABB bld = buildingBounds();
    if (x > bld.min.x - 6.0f - pad && x < bld.max.x + 6.0f + pad && z > bld.min.z - 6.0f - pad && z < bld.max.z + 6.0f + pad) return false;
    if (x > kParkMinX - 4.0f - pad && x < kParkMaxX + 4.0f + pad && z > kParkMinZ - 4.0f - pad && z < kParkMaxZ + 4.0f + pad) return false;
    if (std::fabs(x) < kRoadHalfWidth + 3.0f + pad && z > kParkMaxZ - 2.0f && z < kSouthEdge + 8.0f) return false;
    if (z > kSouthEdge - 6.0f - pad && z < kHighwayZ + kHighwayHalfWidth + 8.0f + pad) return false;
    if (publicArea(x, z) && z > kHighwayZ) return false;
    if (x > -40.0f - pad && x < 40.0f + pad && z > -60.0f - pad && z < -18.0f + pad) return false;   // container yards behind the shelter
    for (const AABB& a : keepClear_)
        if (x > a.min.x - pad && x < a.max.x + pad && z > a.min.z - pad && z < a.max.z + pad) return false;
    for (const FenceSeg& f : fenceSegs_) {
        float vx = f.b.x - f.a.x, vz = f.b.z - f.a.z;
        float t = clampf(((x - f.a.x) * vx + (z - f.a.z) * vz) / std::max(vx * vx + vz * vz, 1e-4f), 0.0f, 1.0f);
        float dx = x - (f.a.x + vx * t), dz = z - (f.a.z + vz * t);
        if (dx * dx + dz * dz < (2.5f + pad) * (2.5f + pad)) return false;
    }
    return true;
}

const std::vector<World::CoverInst>& World::coverCell(int cx, int cz) {
    long long key = (long long)cx * 1000003LL + cz;
    auto it = coverCells_.find(key);
    if (it != coverCells_.end()) return it->second;
    std::vector<CoverInst> v;
    const float cell = 40.0f;
    Rng rng(uint64_t(hash2i(cx, cz, 4711u)));
    float x0 = float(cx) * cell, z0 = float(cz) * cell;
    for (int i = 0; i < 70; ++i) {
        float x = x0 + rng.uniform() * cell, z = z0 + rng.uniform() * cell;
        float pick = rng.uniform();
        int kind = pick < 0.07f ? 0 : (pick < 0.12f ? 1 : (pick < 0.88f ? 2 : 3));   // bush, rock, grass, flowers
        float wild = terrain::naturalness(x, z);
        if (kind != 2 && rng.uniform() > 0.35f + wild) continue;
        if (!clearGround(x, z, kind == 0 ? 1.0f : 0.3f)) continue;
        vec3 n = terrain::normal(x, z, 1.0f);
        if (n.y < 0.75f) continue;
        CoverInst c;
        c.pos = {x, terrain::height(x, z) - 0.03f, z};
        c.scale = kind == 1 ? rng.range(0.4f, 1.8f) : rng.range(0.7f, 1.4f);
        c.yaw = rng.range(0.0f, 2.0f * kPi);
        c.kind = kind;
        float tv = rng.range(0.85f, 1.15f);
        c.tint = vec4(tv * rng.range(0.9f, 1.1f), tv, tv * rng.range(0.85f, 1.0f), 1.0f);
        v.push_back(c);
    }
    return coverCells_.emplace(key, std::move(v)).first->second;
}

const std::vector<World::TreeInst>& World::treeCell(int cx, int cz) {
    long long key = (long long)cx * 1000003LL + cz;
    auto it = treeCells_.find(key);
    if (it != treeCells_.end()) return it->second;
    std::vector<TreeInst> trees;
    Rng rng(uint64_t(hash2i(cx, cz, 999u)));
    float x0 = float(cx) * kTreeCell, z0 = float(cz) * kTreeCell;
    float centerDensity = terrain::forestDensity(x0 + kTreeCell * 0.5f, z0 + kTreeCell * 0.5f);
    int attempts = int(14 + centerDensity * 70.0f);
    for (int i = 0; i < attempts; ++i) {
        float x = x0 + rng.uniform() * kTreeCell, z = z0 + rng.uniform() * kTreeCell;
        float d = terrain::forestDensity(x, z);
        float nat = terrain::naturalness(x, z);
        float keep = 0.16f + d * 0.84f;
        if (nat < 0.12f) keep = 0.05f;              // scattered shade trees on the flat land around the shelter
        if (rng.uniform() > keep) continue;
        if (!clearGround(x, z, 3.5f)) continue;
        vec3 n = terrain::normal(x, z, 2.0f);
        if (n.y < 0.8f) continue;
        float y = terrain::height(x, z);
        if (y > 950.0f) continue;   // tree line
        TreeInst t;
        t.pos = {x, y - 0.2f, z};
        t.scale = rng.range(0.7f, 1.45f);
        t.yaw = rng.range(0.0f, 2.0f * kPi);
        t.pine = rng.uniform() < 0.45f + clampf(y / 900.0f, 0.0f, 0.5f);
        float v = rng.range(0.8f, 1.2f);
        t.tint = vec4(v * rng.range(0.9f, 1.1f), v, v * rng.range(0.85f, 1.0f), 1.0f);
        trees.push_back(t);
    }
    return treeCells_.emplace(key, std::move(trees)).first->second;
}

void World::refreshTrees(vec3 camPos) {
    std::vector<InstanceData> pines, oaks, pinesS, oaksS;
    int c0x = int(std::floor((camPos.x - treeRadius) / kTreeCell)), c1x = int(std::floor((camPos.x + treeRadius) / kTreeCell));
    int c0z = int(std::floor((camPos.z - treeRadius) / kTreeCell)), c1z = int(std::floor((camPos.z + treeRadius) / kTreeCell));
    for (int cz = c0z; cz <= c1z; ++cz)
        for (int cx = c0x; cx <= c1x; ++cx) {
            float mx = (float(cx) + 0.5f) * kTreeCell - camPos.x, mz = (float(cz) + 0.5f) * kTreeCell - camPos.z;
            if (mx * mx + mz * mz > (treeRadius + kTreeCell) * (treeRadius + kTreeCell)) continue;
            for (const TreeInst& t : treeCell(cx, cz)) {
                InstanceData d;
                d.model = mat4::translate(t.pos) * mat4::rotateY(t.yaw) * mat4::scale(vec3(t.scale));
                d.tint = t.tint;
                float dx = t.pos.x - camPos.x, dz = t.pos.z - camPos.z;
                float d2 = dx * dx + dz * dz;
                (t.pine ? pines : oaks).push_back(d);
                if (d2 < kTreeShadowRadius * kTreeShadowRadius) (t.pine ? pinesS : oaksS).push_back(d);
            }
        }
    pine_.setInstances(pines);
    oak_.setInstances(oaks);

    pineShadow_.setInstances(pinesS);
    oakShadow_.setInstances(oaksS);
    treeCenter_ = camPos;
}

void World::refreshCover(vec3 camPos) {
    std::vector<InstanceData> cover[4];
    const float cc = 40.0f;
    int g0x = int(std::floor((camPos.x - coverRadius) / cc)), g1x = int(std::floor((camPos.x + coverRadius) / cc));
    int g0z = int(std::floor((camPos.z - coverRadius) / cc)), g1z = int(std::floor((camPos.z + coverRadius) / cc));
    for (int cz = g0z; cz <= g1z; ++cz)
        for (int cx = g0x; cx <= g1x; ++cx)
            for (const CoverInst& c : coverCell(cx, cz)) {
                float dx = c.pos.x - camPos.x, dz = c.pos.z - camPos.z;
                float lim = c.kind >= 2 ? coverRadius * 0.6f : coverRadius;
                if (dx * dx + dz * dz > lim * lim) continue;
                InstanceData d;
                d.model = mat4::translate(c.pos) * mat4::rotateY(c.yaw) * mat4::scale(vec3(c.scale));
                d.tint = c.tint;
                cover[c.kind].push_back(d);
            }
    bush_.setInstances(cover[0]);
    rock_.setInstances(cover[1]);
    grass_.setInstances(cover[2]);
    flowers_.setInstances(cover[3]);
    coverCenter_ = camPos;
}

void World::update(float dt, vec3 camPos, float time, Sim& sim) {
    if (fenceVersion_ != sim.land.version()) {
        fenceVersion_ = sim.land.version();
        MeshBuilder fb;
        scenery::buildFence(fb, sim.land.fence());
        fence_.upload(fb);
    }
    // Nature avoids what you build and your fence; regenerate when either changes
    int nv = sim.land.version() * 7919 + int(sim.placed.size()) * 31 + (sim.placed.empty() ? 0 : sim.placed.back().id);
    if (nv != natureVersion_) {
        natureVersion_ = nv;
        keepClear_.clear();
        for (const Placed& p : sim.placed) {
            AABB a = p.bounds(0.0f);
            keepClear_.push_back(AABB(a.min - vec3(2.5f, 0, 2.5f), a.max + vec3(2.5f, 0, 2.5f)));
        }
        fenceSegs_ = sim.land.fence();
        treeCells_.clear();
        coverCells_.clear();
        treeCenter_ = vec3(1e9f, 0, 1e9f);
        coverCenter_ = vec3(1e9f, 0, 1e9f);
    }
    float dx = camPos.x - treeCenter_.x, dz = camPos.z - treeCenter_.z;
    if (dx * dx + dz * dz > 60.0f * 60.0f) refreshTrees(camPos);
    dx = camPos.x - coverCenter_.x; dz = camPos.z - coverCenter_.z;
    if (dx * dx + dz * dz > 15.0f * 15.0f) refreshCover(camPos);
    facility.update(dt, sim.security, sim.clock.hour(), collision);
    syncPlaced(sim);

    // Highway traffic (wraps in an 8 km window around the camera)
    float center = std::round(camPos.x / 8000.0f) * 8000.0f;
    static const float laneZ[4] = {kHighwayZ + 1.9f, kHighwayZ + 5.6f, kHighwayZ - 1.9f, kHighwayZ - 5.6f};
    std::vector<InstanceData> inst;
    inst.reserve(cars_.size());
    for (const Car& c : cars_) {
        bool east = c.lane < 2;
        float x = c.x0 + (east ? 1.0f : -1.0f) * c.speed * time;
        x = center - 4000.0f + std::fmod(std::fmod(x - (center - 4000.0f), 8000.0f) + 8000.0f, 8000.0f);
        InstanceData d;
        d.model = mat4::translate({x, 0.03f, laneZ[c.lane]}) * mat4::rotateY(radians(east ? 90.0f : -90.0f));
        d.tint = c.tint;
        inst.push_back(d);
    }
    traffic_.setInstances(inst);
}

mat4 World::placedTransform(const Placed& p) const {
    float y = terrain::height(p.x, p.z);
    return mat4::translate({p.x, y, p.z}) * mat4::rotateY(radians(90.0f * float(p.rot)));
}

void World::syncPlaced(const Sim& sim) {
    // Cheap change detection: count + sum of ids
    size_t version = sim.placed.size() * 1000003u;
    for (auto& p : sim.placed) version += size_t(p.id) * 31u + size_t(p.kind);
    if (version == placedVersion_) return;
    placedVersion_ = version;
    for (int id : placedColliders_) collision.remove(id);
    placedColliders_.clear();
    placedDraw_.clear();
    for (const Placed& p : sim.placed) {
        PlacedDraw d;
        d.id = p.id;
        d.kind = p.kind;
        d.model = placedTransform(p);
        float gy = terrain::height(p.x, p.z);
        d.bounds = p.bounds(gy - 3.0f);
        d.bounds.max.y = gy + buildInfo(p.kind).height + 2.0f;
        placedDraw_.push_back(d);
        const BuildInfo& bi = buildInfo(p.kind);
        if (p.kind == BuildKind::DogRun) {
            AABB a = p.bounds(gy);
            a.max.y = gy + 1.8f;
            float t = 0.08f;
            placedColliders_.push_back(collision.addBox(AABB({a.min.x, a.min.y, a.min.z}, {a.max.x, a.max.y, a.min.z + t})));
            placedColliders_.push_back(collision.addBox(AABB({a.min.x, a.min.y, a.min.z}, {a.min.x + t, a.max.y, a.max.z})));
            placedColliders_.push_back(collision.addBox(AABB({a.max.x - t, a.min.y, a.min.z}, {a.max.x, a.max.y, a.max.z})));
        } else if (bi.solid) {
            AABB a = p.bounds(gy);
            if (p.kind == BuildKind::Tree || p.kind == BuildKind::PineTree || p.kind == BuildKind::LampPost || p.kind == BuildKind::SecurityCamera) {
                vec3 c = a.center();
                float r = (p.kind == BuildKind::Tree || p.kind == BuildKind::PineTree) ? 0.35f : 0.12f;
                a = AABB({c.x - r, gy, c.z - r}, {c.x + r, gy + bi.height, c.z + r});
            }
            placedColliders_.push_back(collision.addBox(a));
        } else if (p.kind == BuildKind::Path || p.kind == BuildKind::ParkingLot) {
            AABB a = p.bounds(gy);
            a.max.y = gy + (p.kind == BuildKind::Path ? 0.05f : 0.04f);
            placedColliders_.push_back(collision.addBox(a, true));
        }
    }
}

void World::appendLights(std::vector<PointLight>& out, float night) const {
    facility.appendLights(out, night);
    if (night > 0.05f)
        for (const PlacedDraw& d : placedDraw_)
            if (d.kind == BuildKind::LampPost)
                out.push_back({d.model.transformPoint({0, 4.1f, 0}), 16.0f, vec3(1.0f, 0.8f, 0.55f) * 22.0f * night});
}

float World::raycastTerrain(vec3 ro, vec3 rd, float maxDist) const {
    float t = 0.0f, step = 1.0f;
    float prevT = 0.0f;
    while (t < maxDist) {
        vec3 p = ro + rd * t;
        if (p.y < terrain::height(p.x, p.z)) {
            float lo = prevT, hi = t;   // refine
            for (int i = 0; i < 20; ++i) {
                float mid = (lo + hi) * 0.5f;
                vec3 q = ro + rd * mid;
                if (q.y < terrain::height(q.x, q.z)) hi = mid; else lo = mid;
            }
            return hi;
        }
        prevT = t;
        t += step;
        step = std::min(step * 1.05f, 25.0f);
    }
    return -1.0f;
}

void World::draw(Renderer& r, Pass pass, float night, float time) const {
    bool shadow = pass == Pass::Shadow;
    if (pass == Pass::Transparent) {
        facility.draw(r, pass, night, time);
        return;
    }
    for (const Chunk& c : terrain_) {
        if (shadow && c.level > 1) continue;
        if (!r.visible(c.bounds)) continue;
        r.draw(c.mesh);
    }
    r.setDoubleSided(true);
    r.draw(fence_);
    r.setDoubleSided(false);
    r.draw(highway_);
    if (!shadow) r.drawInstanced(poles_);
    r.drawInstanced(bush_);
    r.drawInstanced(rock_);
    if (!shadow) { r.drawInstanced(grass_); r.drawInstanced(flowers_); }
    if (shadow) {
        r.drawInstanced(pineShadow_);
        r.drawInstanced(oakShadow_);
    } else {
        r.drawInstanced(pine_);
        r.drawInstanced(oak_);
    }
    r.drawInstanced(traffic_);
    facility.draw(r, pass, night, time);

    r.setDoubleSided(true);
    for (const PlacedDraw& d : placedDraw_) {
        if (!r.visible(d.bounds)) continue;
        vec4 tint{1, 1, 1, 1};
        if (d.id == highlightPlaced) tint = {1.6f, 0.5f, 0.4f, 1.0f};
        if (d.kind == BuildKind::LampPost) { float k = lerpf(0.6f, 1.0f, night); tint = vec4(tint.x * k, tint.y * k, tint.z * k, 1.0f); }
        r.draw(buildables_[size_t(d.kind)], d.model, tint);
    }
    if (ghostVisible && !shadow) {
        vec4 tint = ghostValid ? vec4(0.5f, 1.4f, 0.5f, 1.0f) : vec4(1.6f, 0.35f, 0.3f, 1.0f);
        r.draw(buildables_[size_t(ghostKind)], ghostModel, tint);
    }
    r.setDoubleSided(false);
}

}  // namespace ps
