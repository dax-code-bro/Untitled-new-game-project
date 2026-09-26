// Land ownership and the fenced yard. You start owning a small workspace around
// the shelter; the rest of the 500 sq mi is a grid of one-square-mile parcels you
// buy from the office computer. The fence itself only surrounds the shelter's
// yard (building, parking, container shelters, what you build) and grows when
// you build outside it; the property line is marked with survey stakes.
#pragma once
#include "core/Math.h"
#include <bitset>
#include <string>
#include <vector>

namespace ps {

class KeyValues;

struct FenceSeg {
    vec3 a, b;          // y = 0 (terrain height applied when building the mesh)
};

class Land {
public:
    static constexpr int kCols = 23, kRows = 23;
    static constexpr int kHomeCol = 11, kHomeRow = 0;
    static float cellSize();                     // one mile in meters
    // Starting workspace (fenced yard around the shelter, parking, access road and gate)
    static AABB workspace();

    Land();
    bool owned(int c, int r) const { return valid(c, r) && owned_[size_t(r * kCols + c)]; }
    bool homeOwned() const { return owned(kHomeCol, kHomeRow); }
    static bool valid(int c, int r) { return c >= 0 && c < kCols && r >= 0 && r < kRows; }
    AABB cellBounds(int c, int r) const;         // clipped to the 500 sq mi region (y = 0)
    float cellSqMi(int c, int r) const;
    bool cellAt(float x, float z, int& c, int& r) const;
    bool canBuy(int c, int r) const;
    double price(int c, int r) const;
    bool buy(int c, int r);                      // marks owned (payment handled by Sim)
    int parcelsOwned() const;
    float ownedSqMi() const;                     // includes the workspace until the home parcel is bought
    bool contains(float x, float z, float margin = 0.0f) const;
    std::vector<FenceSeg> propertyLine() const;  // outline of everything owned (survey stakes)
    // The fenced yard around the shelter (the gate is where the access road leaves it, on the south side)
    const AABB& yard() const { return yard_; }
    void setYard(const AABB& y);                 // bumps version() when it changes
    float gateZ() const { return yard_.max.z; }
    std::vector<FenceSeg> yardFence() const;
    int version() const { return version_; }

    void save(KeyValues& kv) const;
    void load(const KeyValues& kv);

private:
    std::bitset<size_t(kCols * kRows)> owned_;
    int version_ = 1;
    AABB yard_{{-40.0f, 0.0f, -60.0f}, {40.0f, 0.0f, 55.0f}};
};

}  // namespace ps
