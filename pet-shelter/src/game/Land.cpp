#include "game/Land.h"
#include "core/SaveFile.h"
#include "world/Layout.h"
#include <cmath>

namespace ps {
using namespace layout;

float Land::cellSize() { return kMeterPerMile; }

AABB Land::workspace() { return AABB({-160.0f, 0.0f, -200.0f}, {160.0f, 0.0f, kSouthEdge}); }

Land::Land() { owned_.reset(); }

AABB Land::cellBounds(int c, int r) const {
    float m = cellSize();
    float x0 = (float(c - kHomeCol) - 0.5f) * m, x1 = x0 + m;
    float z1 = kSouthEdge - float(r) * m, z0 = z1 - m;
    x0 = std::max(x0, kRegionMinX); x1 = std::min(x1, kRegionMaxX);
    z0 = std::max(z0, kRegionMinZ);
    return AABB({x0, 0.0f, z0}, {x1, 0.0f, z1});
}

float Land::cellSqMi(int c, int r) const {
    AABB b = cellBounds(c, r);
    float m = cellSize();
    return std::max(0.0f, (b.max.x - b.min.x) / m) * std::max(0.0f, (b.max.z - b.min.z) / m);
}

bool Land::cellAt(float x, float z, int& c, int& r) const {
    float m = cellSize();
    c = int(std::floor(x / m + 0.5f)) + kHomeCol;
    r = int(std::floor((kSouthEdge - z) / m));
    return valid(c, r) && insideRegion(x, z);
}

bool Land::canBuy(int c, int r) const {
    if (!valid(c, r) || owned(c, r) || cellSqMi(c, r) <= 0.001f) return false;
    if (!homeOwned()) return c == kHomeCol && r == kHomeRow;
    return owned(c - 1, r) || owned(c + 1, r) || owned(c, r - 1) || owned(c, r + 1);
}

double Land::price(int c, int r) const {
    // First square mile is cheap-ish; each one after costs a bit more (and remote hills less)
    double base = homeOwned() ? 140000.0 * (1.0 + 0.015 * double(parcelsOwned())) : 95000.0;
    double remote = 1.0 - std::min(0.35, 0.02 * double(r));
    return std::round(base * remote * double(cellSqMi(c, r)) / 100.0) * 100.0;
}

bool Land::buy(int c, int r) {
    if (!canBuy(c, r)) return false;
    owned_[size_t(r * kCols + c)] = true;
    ++version_;
    return true;
}

int Land::parcelsOwned() const { return int(owned_.count()); }

float Land::ownedSqMi() const {
    if (!homeOwned()) {
        AABB w = workspace();
        return (w.max.x - w.min.x) * (w.max.z - w.min.z) / (cellSize() * cellSize());
    }
    float a = 0.0f;
    for (int r = 0; r < kRows; ++r)
        for (int c = 0; c < kCols; ++c)
            if (owned(c, r)) a += cellSqMi(c, r);
    return a;
}

bool Land::contains(float x, float z, float margin) const {
    if (!homeOwned()) {
        AABB w = workspace();
        return x > w.min.x + margin && x < w.max.x - margin && z > w.min.z + margin && z < w.max.z - margin;
    }
    int c, r;
    if (!cellAt(x, z, c, r) || !owned(c, r)) return false;
    if (margin <= 0.0f) return true;
    // Near an edge: the neighbor across it must be owned too
    AABB b = cellBounds(c, r);
    if (x < b.min.x + margin && !owned(c - 1, r)) return false;
    if (x > b.max.x - margin && !owned(c + 1, r)) return false;
    if (z > b.max.z - margin && !owned(c, r - 1)) return false;   // south edge (row - 1 is further south)
    if (z < b.min.z + margin && !owned(c, r + 1)) return false;
    return true;
}

void Land::setYard(const AABB& y) {
    if (std::fabs(y.min.x - yard_.min.x) < 0.01f && std::fabs(y.max.x - yard_.max.x) < 0.01f &&
        std::fabs(y.min.z - yard_.min.z) < 0.01f && std::fabs(y.max.z - yard_.max.z) < 0.01f) return;
    yard_ = y;
    ++version_;
}

std::vector<FenceSeg> Land::yardFence() const {
    const AABB& w = yard_;
    vec3 sw{w.min.x, 0, w.max.z}, se{w.max.x, 0, w.max.z}, ne{w.max.x, 0, w.min.z}, nw{w.min.x, 0, w.min.z};
    return {{sw, se}, {se, ne}, {ne, nw}, {nw, sw}};
}

std::vector<FenceSeg> Land::propertyLine() const {
    std::vector<FenceSeg> out;
    if (!homeOwned()) {
        AABB w = workspace();
        vec3 sw{w.min.x, 0, w.max.z}, se{w.max.x, 0, w.max.z}, ne{w.max.x, 0, w.min.z}, nw{w.min.x, 0, w.min.z};
        out.push_back({sw, se}); out.push_back({se, ne}); out.push_back({ne, nw}); out.push_back({nw, sw});
        return out;
    }
    for (int r = 0; r < kRows; ++r)
        for (int c = 0; c < kCols; ++c) {
            if (!owned(c, r)) continue;
            AABB b = cellBounds(c, r);
            vec3 sw{b.min.x, 0, b.max.z}, se{b.max.x, 0, b.max.z}, ne{b.max.x, 0, b.min.z}, nw{b.min.x, 0, b.min.z};
            if (!owned(c, r - 1)) out.push_back({sw, se});   // south
            if (!owned(c + 1, r)) out.push_back({se, ne});   // east
            if (!owned(c, r + 1)) out.push_back({ne, nw});   // north
            if (!owned(c - 1, r)) out.push_back({nw, sw});   // west
        }
    return out;
}

void Land::save(KeyValues& kv) const {
    std::string bits;
    for (size_t i = 0; i < owned_.size(); ++i) bits += owned_[i] ? '1' : '0';
    kv.set("land.owned", bits);
}

void Land::load(const KeyValues& kv) {
    std::string bits = kv.get("land.owned");
    owned_.reset();
    for (size_t i = 0; i < owned_.size() && i < bits.size(); ++i) owned_[i] = bits[i] == '1';
    ++version_;
}

}  // namespace ps
