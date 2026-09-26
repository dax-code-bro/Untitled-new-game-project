// ============================================================================
//  MOOR3D — world generation
//  16 km x 16 km  (100 sq mi)  ·  30% water  ·  40% built  ·  30% wild
//  Ratios are hit exactly by percentile thresholding, not by tuning constants.
// ============================================================================
#pragma once
#include <vector>
#include <algorithm>
#include <cstdint>
#include "mathx.h"
#include "gl.h"

namespace world {

using m::v3;

constexpr float SIZE   = 16000.0f;          // metres per side
constexpr float MILE   = SIZE / 10.0f;      // 10 miles across == 100 sq mi
constexpr int   HM     = 512;               // heightmap resolution
constexpr float HSTEP  = SIZE / HM;
constexpr int   HC     = HM * HM;

enum Biome : uint8_t {
  B_WATER = 0, B_SAND, B_GRASS, B_FOREST, B_MOUNTAIN,
  B_URBAN_LOW, B_URBAN_MID, B_URBAN_HIGH
};

// ---------------------------------------------------------------- terrain data
struct Terrain {
  std::vector<float>   height;     // metres
  std::vector<uint8_t> biome;
  std::vector<int8_t>  district;
  float seaLevel   = 0.0f;
  float maxHeight  = 0.0f;
  float pctWater = 0, pctUrban = 0, pctWild = 0;

  Terrain() : height(HC, 0.0f), biome(HC, B_GRASS), district(HC, -1) {}

  inline int   idx(int x, int z) const { return z * HM + x; }
  inline float at(int x, int z)  const {
    x = (int)m::clampf((float)x, 0.0f, (float)HM - 1);
    z = (int)m::clampf((float)z, 0.0f, (float)HM - 1);
    return height[idx(x, z)];
  }
  inline uint8_t biomeAt(int x, int z) const {
    x = (int)m::clampf((float)x, 0.0f, (float)HM - 1);
    z = (int)m::clampf((float)z, 0.0f, (float)HM - 1);
    return biome[idx(x, z)];
  }

  // Bilinear terrain height at a world position.
  float sample(float wx, float wz) const {
    float fx = m::clampf(wx / HSTEP, 0.0f, (float)HM - 1.001f);
    float fz = m::clampf(wz / HSTEP, 0.0f, (float)HM - 1.001f);
    int x0 = (int)fx, z0 = (int)fz;
    float tx = fx - x0, tz = fz - z0;
    float h00 = at(x0, z0),     h10 = at(x0 + 1, z0);
    float h01 = at(x0, z0 + 1), h11 = at(x0 + 1, z0 + 1);
    return m::lerpf(m::lerpf(h00, h10, tx), m::lerpf(h01, h11, tx), tz);
  }
  Biome sampleBiome(float wx, float wz) const {
    int x = (int)m::clampf(wx / HSTEP, 0.0f, (float)HM - 1);
    int z = (int)m::clampf(wz / HSTEP, 0.0f, (float)HM - 1);
    return (Biome)biome[idx(x, z)];
  }
  bool isWater(float wx, float wz) const { return sampleBiome(wx, wz) == B_WATER; }
  bool isUrban(float wx, float wz) const {
    Biome b = sampleBiome(wx, wz);
    return b == B_URBAN_LOW || b == B_URBAN_MID || b == B_URBAN_HIGH;
  }
  // Analytic-ish normal from central differences.
  v3 normal(float wx, float wz) const {
    float e = HSTEP;
    float hl = sample(wx - e, wz), hr = sample(wx + e, wz);
    float hd = sample(wx, wz - e), hu = sample(wx, wz + e);
    return m::norm(v3{ hl - hr, 2.0f * e, hd - hu });
  }
};

// ---------------------------------------------------------------- districts
struct District {
  const char* name;
  float weight;
  int   cx, cz;
  float wx, wz;
};

// ---------------------------------------------------------------- roads
struct RoadNode {
  float x, z;
  int   gx, gz;
  bool  valid = false;
  int   zone = -1;              // 0 downtown .. 2 suburb, 4 country, 5 mountain
  bool  light = false;
  float lightPhase = 0.0f;
  std::vector<int> edges;
};
struct RoadEdge {
  int a, b;
  float x1, z1, x2, z2;
  float len, width;
  int zone;
  bool bridge, highway, horizontal;
};

constexpr float NODE_SPACING = 400.0f;
constexpr int   RN = (int)(SIZE / NODE_SPACING);      // 40 x 40

// ---------------------------------------------------------------- buildings
enum BType : uint8_t { BT_HOUSE = 0, BT_SHOP, BT_APT, BT_TOWER, BT_COUNT };

struct Building {
  float x, z, y;            // y = ground height at the footprint
  float w, d, h;            // footprint + height in metres
  float rotY;
  BType type;
  v3    tint;
  float litSeed;
  int   district;
  int   zone;
  int   meshVariant;
};

struct Prop {
  float x, z, y;
  float scale, rotY, phase;
  uint8_t kind;             // 0 broadleaf, 1 conifer, 2 bush, 3 rock
};

struct StreetLight { float x, z, y, rotY; };

// ============================================================================
//  World
// ============================================================================
struct World {
  Terrain terr;
  std::vector<District>    districts;
  std::vector<RoadNode>    nodes;
  std::vector<RoadEdge>    edges;
  std::vector<Building>    buildings;
  std::vector<Prop>        props;
  std::vector<StreetLight> lights;

  // Coarse spatial buckets. Without these, gatherScene() walked every one of
  // ~140k props and buildings every single frame.
  static constexpr float BUCKET = 500.0f;
  static constexpr int   BN = (int)(SIZE / BUCKET);
  std::vector<std::vector<int>> propBuckets, bldBuckets;

  static int bucketIndex(float x, float z){
    int bx = (int)(x / BUCKET), bz = (int)(z / BUCKET);
    if(bx < 0) bx = 0; if(bx >= BN) bx = BN - 1;
    if(bz < 0) bz = 0; if(bz >= BN) bz = BN - 1;
    return bz * BN + bx;
  }
  void buildBuckets(){
    propBuckets.assign(BN * BN, {});
    bldBuckets.assign(BN * BN, {});
    for(size_t i = 0; i < props.size(); i++)
      propBuckets[bucketIndex(props[i].x, props[i].z)].push_back((int)i);
    for(size_t i = 0; i < buildings.size(); i++)
      bldBuckets[bucketIndex(buildings[i].x, buildings[i].z)].push_back((int)i);
  }
  // call fn(index) for every item whose bucket is within `radius` of (x,z)
  template <typename F>
  void forEachNear(const std::vector<std::vector<int>>& buckets,
                   float x, float z, float radius, F fn) const {
    int span = (int)(radius / BUCKET) + 1;
    int cx = (int)(x / BUCKET), cz = (int)(z / BUCKET);
    for(int bz = cz - span; bz <= cz + span; bz++){
      if(bz < 0 || bz >= BN) continue;
      for(int bx = cx - span; bx <= cx + span; bx++){
        if(bx < 0 || bx >= BN) continue;
        for(int id : buckets[bz * BN + bx]) fn(id);
      }
    }
  }

  uint32_t seed = 1337u;

  // ------------------------------------------------------------ generation
  void generate(uint32_t s){
    seed = s;
    genTerrain();
    genRoads();
    flattenRoads();
    genBuildings();
    genProps();
    buildBuckets();
  }

  // ---------------------------------------------------------------- terrain
  void genTerrain(){
    m::Rng rng(seed);

    // ---- 1. base elevation: continental fbm + mountain ridges in the NW
    std::vector<float> raw(HC);
    for(int z = 0; z < HM; z++){
      for(int x = 0; x < HM; x++){
        float u = (float)x / HM, v = (float)z / HM;
        float base = m::fbm(x * 0.0135f + 11.3f, z * 0.0135f + 4.7f, 6, 0.52f);
        float ridge = m::ridged(x * 0.0072f + 31.1f, z * 0.0072f + 17.9f, 5);
        // mountain mass concentrated away from the ocean corner
        float mask = m::clampf(1.25f - (u * 0.85f + v * 1.05f), 0.0f, 1.0f);
        float h = base * 0.62f + ridge * mask * mask * 1.05f;
        // ocean basin sinking towards the south-east
        float shore = u * 0.60f + v * 0.78f;
        float wob = (m::fbm(x * 0.0195f + 71.0f, z * 0.0195f + 29.0f, 3) - 0.5f) * 0.30f;
        float ocean = m::clampf((shore + wob - 0.70f) * 2.6f, 0.0f, 1.0f);
        h -= ocean * 1.25f;
        // three inland lake basins
        const float LK[3][3] = { {0.25f,0.27f,0.132f}, {0.63f,0.17f,0.098f}, {0.14f,0.63f,0.086f} };
        for(int i = 0; i < 3; i++){
          float d = std::sqrt((u-LK[i][0])*(u-LK[i][0]) + (v-LK[i][1])*(v-LK[i][1]));
          float r = LK[i][2] * (0.72f + m::fbm(x*0.026f + i*40.0f, z*0.026f + i*40.0f, 3) * 0.66f);
          if(d < r){ float t = 1.0f - d / r; h -= t * t * 0.95f; }
        }
        raw[idx2(x, z)] = h;
      }
    }

    // ---- 2. exact 30% water: sea level = 30th percentile of elevation
    {
      std::vector<float> sorted = raw;
      std::nth_element(sorted.begin(), sorted.begin() + (size_t)(HC * 0.30), sorted.end());
      terr.seaLevel = sorted[(size_t)(HC * 0.30)];
    }

    // ---- 3. districts on solid, well-separated, reasonably flat ground
    districts = {
      { "MOOR CITY",   1.00f, 0, 0, 0, 0 },
      { "FAIRBAY",     0.56f, 0, 0, 0, 0 },
      { "NORTHRIDGE",  0.52f, 0, 0, 0, 0 },
      { "PINE HOLLOW", 0.30f, 0, 0, 0, 0 },
      { "SALT CREEK",  0.28f, 0, 0, 0, 0 },
      { "ELDER MILL",  0.26f, 0, 0, 0, 0 }
    };
    std::vector<std::pair<int,int>> placed;
    for(auto& D : districts){
      float bestScore = -1e9f; int bx = HM/2, bz = HM/2;
      for(int attempt = 0; attempt < 2200; attempt++){
        int x = rng.irange(40, HM - 41), z = rng.irange(40, HM - 41);
        if(raw[idx2(x, z)] <= terr.seaLevel) continue;
        int dry = 0; float hsum = 0, hmin = 1e9f, hmax = -1e9f;
        for(int oz = -14; oz <= 14; oz += 2) for(int ox = -14; ox <= 14; ox += 2){
          float h = raw[idx2(clampi(x+ox), clampi(z+oz))];
          if(h > terr.seaLevel) dry++;
          hsum += h; hmin = std::min(hmin, h); hmax = std::max(hmax, h);
        }
        float sep = 1e9f;
        for(auto& p : placed) sep = std::min(sep, std::sqrt((float)((x-p.first)*(x-p.first) + (z-p.second)*(z-p.second))));
        if(!placed.empty() && sep < 95.0f) continue;
        float flat = 1.0f / (1.0f + (hmax - hmin) * 3.0f);
        float score = dry * 1.6f + std::min(sep, 210.0f) * 0.5f + flat * 45.0f;
        if(score > bestScore){ bestScore = score; bx = x; bz = z; }
      }
      placed.push_back({bx, bz});
      D.cx = bx; D.cz = bz;
      D.wx = (bx + 0.5f) * HSTEP; D.wz = (bz + 0.5f) * HSTEP;
    }

    // ---- 4. exact 40% urban, grown from the district centres by weight
    std::vector<float> urbanField(HC, -1.0f);
    std::vector<float> landVals;
    landVals.reserve(HC);
    for(int z = 0; z < HM; z++){
      for(int x = 0; x < HM; x++){
        int i = idx2(x, z);
        if(raw[i] <= terr.seaLevel) continue;
        float best = -1.0f; int bestD = -1;
        for(size_t d = 0; d < districts.size(); d++){
          const District& D = districts[d];
          float dd = std::sqrt((float)((x-D.cx)*(x-D.cx) + (z-D.cz)*(z-D.cz)));
          float wob = 0.85f + m::fbm(x * 0.030f + d * 53.0f, z * 0.030f + d * 53.0f, 3) * 0.32f;
          float val = (D.weight * 104.0f * wob) / (dd + 12.0f);
          if(val > best){ best = val; bestD = (int)d; }
        }
        urbanField[i] = best;
        terr.district[i] = (int8_t)bestD;
        landVals.push_back(best);
      }
    }
    std::sort(landVals.begin(), landVals.end(), std::greater<float>());
    size_t urbanTarget = (size_t)(HC * 0.40);
    float uThresh  = landVals[std::min(urbanTarget, landVals.size() - 1)];
    float highCut  = landVals[std::min((size_t)(urbanTarget * 0.10), landVals.size() - 1)];
    float midCut   = landVals[std::min((size_t)(urbanTarget * 0.42), landVals.size() - 1)];

    // ---- 5. commit heights + biomes
    float hScale = 620.0f;                          // elevation range in metres
    terr.maxHeight = 0.0f;
    for(int z = 0; z < HM; z++){
      for(int x = 0; x < HM; x++){
        int i = idx2(x, z);
        float h = (raw[i] - terr.seaLevel) * hScale;
        terr.height[i] = h;
        if(raw[i] <= terr.seaLevel){ terr.biome[i] = B_WATER; continue; }
        if(urbanField[i] >= uThresh){
          terr.biome[i] = urbanField[i] >= highCut ? B_URBAN_HIGH
                        : urbanField[i] >= midCut  ? B_URBAN_MID : B_URBAN_LOW;
        } else {
          terr.biome[i] = B_GRASS;   // refined below
        }
        terr.maxHeight = std::max(terr.maxHeight, h);
      }
    }
    terr.seaLevel = 0.0f;                           // world-space sea is now y=0

    // mountains: top 30% of the remaining wild land by elevation
    {
      std::vector<float> wildH;
      for(int i = 0; i < HC; i++) if(terr.biome[i] == B_GRASS) wildH.push_back(terr.height[i]);
      if(!wildH.empty()){
        std::sort(wildH.begin(), wildH.end(), std::greater<float>());
        float mThresh = wildH[std::min((size_t)(wildH.size() * 0.30), wildH.size() - 1)];
        for(int z = 0; z < HM; z++) for(int x = 0; x < HM; x++){
          int i = idx2(x, z);
          if(terr.biome[i] != B_GRASS) continue;
          if(terr.height[i] >= mThresh){ terr.biome[i] = B_MOUNTAIN; continue; }
          // beach ring next to water
          bool nearWater = false;
          for(int oz = -1; oz <= 1 && !nearWater; oz++) for(int ox = -1; ox <= 1; ox++){
            if(terr.biomeAt(x + ox, z + oz) == B_WATER){ nearWater = true; break; }
          }
          if(nearWater && terr.height[i] < 14.0f){ terr.biome[i] = B_SAND; continue; }
          if(m::fbm(x * 0.042f + 5.0f, z * 0.042f + 9.0f, 4) > 0.545f) terr.biome[i] = B_FOREST;
        }
      }
    }

    // ---- 6. flatten the urban cells so streets and buildings sit level
    {
      std::vector<float> smoothed = terr.height;
      for(int pass = 0; pass < 4; pass++){
        for(int z = 1; z < HM - 1; z++){
          for(int x = 1; x < HM - 1; x++){
            int i = idx2(x, z);
            if(terr.biome[i] == B_WATER) continue;
            if(!isUrbanB(terr.biome[i])) continue;
            float s = 0; int n = 0;
            for(int oz = -1; oz <= 1; oz++) for(int ox = -1; ox <= 1; ox++){
              s += terr.height[idx2(x + ox, z + oz)]; n++;
            }
            smoothed[i] = m::lerpf(terr.height[i], s / n, 0.85f);
          }
        }
        terr.height = smoothed;
      }
    }

    // ---- 7. tally
    int w = 0, u = 0, wd = 0;
    for(int i = 0; i < HC; i++){
      if(terr.biome[i] == B_WATER) w++;
      else if(isUrbanB(terr.biome[i])) u++;
      else wd++;
    }
    terr.pctWater = 100.0f * w / HC;
    terr.pctUrban = 100.0f * u / HC;
    terr.pctWild  = 100.0f * wd / HC;
  }

  static bool isUrbanB(uint8_t b){
    return b == B_URBAN_LOW || b == B_URBAN_MID || b == B_URBAN_HIGH;
  }
  static int clampi(int v){ return v < 0 ? 0 : (v >= HM ? HM - 1 : v); }
  static int idx2(int x, int z){ return clampi(z) * HM + clampi(x); }

  // ---------------------------------------------------------------- roads
  int zoneOf(float x, float z) const {
    Biome b = terr.sampleBiome(x, z);
    switch(b){
      case B_WATER:      return -1;
      case B_URBAN_HIGH: return 0;
      case B_URBAN_MID:  return 1;
      case B_URBAN_LOW:  return 2;
      case B_MOUNTAIN:   return 5;
      default:           return 4;
    }
  }

  void genRoads(){
    m::Rng rng(seed * 7919u + 13u);
    nodes.clear(); nodes.reserve(RN * RN);
    for(int gz = 0; gz < RN; gz++){
      for(int gx = 0; gx < RN; gx++){
        RoadNode n;
        n.x = (gx + 0.5f) * NODE_SPACING;
        n.z = (gz + 0.5f) * NODE_SPACING;
        n.gx = gx; n.gz = gz;
        n.zone = zoneOf(n.x, n.z);
        n.valid = n.zone >= 0;
        nodes.push_back(n);
      }
    }

    auto crossWater = [&](const RoadNode& a, const RoadNode& b){
      int hits = 0;
      for(int s = 1; s < 6; s++){
        float t = s / 6.0f;
        if(terr.isWater(m::lerpf(a.x,b.x,t), m::lerpf(a.z,b.z,t))) hits++;
      }
      return hits;
    };
    auto addEdge = [&](int ai, int bi, bool hwy){
      RoadNode& A = nodes[ai]; RoadNode& B = nodes[bi];
      RoadEdge e;
      e.a = ai; e.b = bi;
      e.x1 = A.x; e.z1 = A.z; e.x2 = B.x; e.z2 = B.z;
      e.horizontal = std::fabs(A.z - B.z) < 1.0f;
      e.len = std::sqrt((A.x-B.x)*(A.x-B.x) + (A.z-B.z)*(A.z-B.z));
      e.zone = std::min(A.zone, B.zone);
      e.bridge = crossWater(A, B) > 0;
      e.highway = hwy;
      e.width = hwy ? 24.0f : (e.zone == 0 ? 20.0f : e.zone == 1 ? 17.0f : e.zone == 2 ? 14.0f : 10.0f);
      edges.push_back(e);
      int ei = (int)edges.size() - 1;
      A.edges.push_back(ei); B.edges.push_back(ei);
      return ei;
    };

    const float CONNECT[6] = { 1.00f, 0.96f, 0.85f, 0.50f, 0.24f, 0.12f };
    for(int gz = 0; gz < RN; gz++){
      for(int gx = 0; gx < RN; gx++){
        int ai = gz * RN + gx;
        if(!nodes[ai].valid) continue;
        const int off[2][2] = { {1,0}, {0,1} };
        for(int k = 0; k < 2; k++){
          int nx = gx + off[k][0], nz = gz + off[k][1];
          if(nx >= RN || nz >= RN) continue;
          int bi = nz * RN + nx;
          if(!nodes[bi].valid) continue;
          int zone = std::min(nodes[ai].zone, nodes[bi].zone);
          float p = CONNECT[zone < 0 || zone > 5 ? 4 : zone];
          if(rng.f() > p) continue;
          if(crossWater(nodes[ai], nodes[bi]) > 2) continue;
          addEdge(ai, bi, false);
        }
      }
    }

    // highways: force a route between each district and its two nearest peers
    auto forcePath = [&](int dA, int dB){
      int cx = (int)(districts[dA].wx / NODE_SPACING);
      int cz = (int)(districts[dA].wz / NODE_SPACING);
      int tx = (int)(districts[dB].wx / NODE_SPACING);
      int tz = (int)(districts[dB].wz / NODE_SPACING);
      cx = std::max(0, std::min(RN-1, cx)); cz = std::max(0, std::min(RN-1, cz));
      tx = std::max(0, std::min(RN-1, tx)); tz = std::max(0, std::min(RN-1, tz));
      int guard = 0;
      while((cx != tx || cz != tz) && guard++ < 400){
        int pi = cz * RN + cx;
        if(std::abs(tx - cx) >= std::abs(tz - cz) && cx != tx) cx += (tx > cx) ? 1 : -1;
        else if(cz != tz)                                     cz += (tz > cz) ? 1 : -1;
        else if(cx != tx)                                     cx += (tx > cx) ? 1 : -1;
        int ci = cz * RN + cx;
        if(!nodes[pi].valid){ nodes[pi].valid = true; nodes[pi].zone = std::max(nodes[pi].zone, 4); }
        if(!nodes[ci].valid){ nodes[ci].valid = true; nodes[ci].zone = std::max(nodes[ci].zone, 4); }
        int found = -1;
        for(int ei : nodes[pi].edges){
          if((edges[ei].a == pi && edges[ei].b == ci) || (edges[ei].b == pi && edges[ei].a == ci)){ found = ei; break; }
        }
        if(found < 0) addEdge(pi, ci, true);
        else { edges[found].highway = true; edges[found].width = std::max(edges[found].width, 24.0f); }
      }
    };
    for(size_t i = 0; i < districts.size(); i++){
      std::vector<std::pair<float,int>> order;
      for(size_t j = 0; j < districts.size(); j++){
        if(i == j) continue;
        float dx = districts[i].wx - districts[j].wx, dz = districts[i].wz - districts[j].wz;
        order.push_back({ dx*dx + dz*dz, (int)j });
      }
      std::sort(order.begin(), order.end());
      for(int k = 0; k < std::min<int>(2, (int)order.size()); k++) forcePath((int)i, order[k].second);
    }

    // traffic lights on busy urban junctions
    for(auto& n : nodes){
      if(n.edges.size() >= 3 && n.zone >= 0 && n.zone <= 1){
        n.light = true;
        n.lightPhase = rng.f() * m::TAU;
      }
    }

    // street lights along urban roads
    m::Rng lr(seed * 31u + 7u);
    for(const auto& e : edges){
      if(e.zone > 2 || e.bridge) continue;
      int n = std::max(1, (int)(e.len / 90.0f));
      for(int k = 0; k < n; k++){
        float t = (k + 0.5f) / n;
        float x = m::lerpf(e.x1, e.x2, t), z = m::lerpf(e.z1, e.z2, t);
        float side = (lr.f() < 0.5f) ? 1.0f : -1.0f;
        float ax = e.x2 - e.x1, az = e.z2 - e.z1;
        float L = std::sqrt(ax*ax + az*az); if(L < 1e-4f) continue;
        float px = -az / L, pz = ax / L;
        float lx = x + px * (e.width * 0.5f + 2.2f) * side;
        float lz = z + pz * (e.width * 0.5f + 2.2f) * side;
        if(terr.isWater(lx, lz)) continue;
        StreetLight sl;
        sl.x = lx; sl.z = lz; sl.y = terr.sample(lx, lz);
        sl.rotY = std::atan2(-px * side, -pz * side);
        lights.push_back(sl);
      }
    }
  }

  // Carve the terrain flat under every road so the tarmac doesn't float or sink.
  void flattenRoads(){
    for(const auto& e : edges){
      if(e.bridge) continue;
      int steps = std::max(2, (int)(e.len / (HSTEP * 0.5f)));
      float halfW = e.width * 0.5f + 8.0f;
      int cells = std::max(1, (int)(halfW / HSTEP) + 1);
      for(int s = 0; s <= steps; s++){
        float t = (float)s / steps;
        float x = m::lerpf(e.x1, e.x2, t), z = m::lerpf(e.z1, e.z2, t);
        float target = m::lerpf(terr.sample(e.x1, e.z1), terr.sample(e.x2, e.z2), t);
        int cx = (int)(x / HSTEP), cz = (int)(z / HSTEP);
        for(int oz = -cells; oz <= cells; oz++){
          for(int ox = -cells; ox <= cells; ox++){
            int gx = cx + ox, gz = cz + oz;
            if(gx < 0 || gz < 0 || gx >= HM || gz >= HM) continue;
            int i = gz * HM + gx;
            if(terr.biome[i] == B_WATER) continue;
            float dx = (gx + 0.5f) * HSTEP - x, dz = (gz + 0.5f) * HSTEP - z;
            float d = std::sqrt(dx*dx + dz*dz);
            float w = m::clampf(1.0f - d / (halfW * 1.9f), 0.0f, 1.0f);
            terr.height[i] = m::lerpf(terr.height[i], target, w * 0.85f);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- buildings
  void genBuildings(){
    m::Rng rng(seed * 104729u + 17u);
    static const v3 HOUSE_COLS[] = {
      {0.82f,0.74f,0.62f},{0.74f,0.78f,0.80f},{0.80f,0.72f,0.66f},{0.68f,0.74f,0.66f},
      {0.84f,0.78f,0.68f},{0.72f,0.66f,0.60f},{0.78f,0.80f,0.84f},{0.86f,0.80f,0.70f}
    };
    static const v3 MID_COLS[] = {
      {0.64f,0.62f,0.58f},{0.72f,0.68f,0.60f},{0.58f,0.56f,0.54f},{0.68f,0.64f,0.62f},
      {0.55f,0.60f,0.64f},{0.74f,0.70f,0.64f}
    };
    static const v3 TOWER_COLS[] = {
      {0.52f,0.55f,0.58f},{0.61f,0.60f,0.56f},{0.44f,0.50f,0.57f},{0.66f,0.63f,0.58f},
      {0.40f,0.46f,0.53f},{0.58f,0.52f,0.46f},{0.49f,0.54f,0.52f}
    };

    for(const auto& e : edges){
      if(e.bridge) continue;
      if(e.zone > 2 && rng.f() > 0.10f) continue;

      float ax = e.x2 - e.x1, az = e.z2 - e.z1;
      float L = e.len; if(L < 1e-3f) continue;
      float dx = ax / L, dz = az / L;
      float px = -dz, pz = dx;                        // road perpendicular
      float margin = e.width * 0.9f + 16.0f;
      if(L < margin * 2 + 22.0f) continue;

      for(int side = -1; side <= 1; side += 2){
        float t = margin;
        while(t < L - margin){
          bool high = (e.zone == 0), mid = (e.zone == 1), sub = (e.zone == 2);
          float along = high ? rng.range(26, 54) : mid ? rng.range(22, 42) : rng.range(15, 26);
          if(t + along > L - margin) break;
          float depth = high ? rng.range(24, 48) : mid ? rng.range(20, 36) : rng.range(14, 24);
          float gap   = high ? rng.range(10, 24) : rng.range(6, 16);

          if(rng.f() < (high ? 0.24f : sub ? 0.24f : 0.20f)){ t += along + gap; continue; }

          float cAlong = t + along * 0.5f;
          float off = e.width * 0.5f + depth * 0.5f + 3.0f;
          float bx = e.x1 + dx * cAlong + px * off * side;
          float bz = e.z1 + dz * cAlong + pz * off * side;

          if(bx < 40 || bz < 40 || bx > SIZE - 40 || bz > SIZE - 40){ t += along + gap; continue; }
          if(terr.isWater(bx, bz)){ t += along + gap; continue; }

          Building B;
          B.x = bx; B.z = bz;
          B.y = terr.sample(bx, bz);
          // footprint aligned to the road: width along, depth across
          B.rotY = std::atan2(dx, dz);
          B.w = along * 0.92f;
          B.d = depth * 0.92f;
          B.zone = e.zone;
          B.district = terr.district[idx2((int)(bx / HSTEP), (int)(bz / HSTEP))];
          B.litSeed = rng.f();
          float roll = rng.f();
          if(high){
            if(roll < 0.34f){ B.type = BT_TOWER; B.h = rng.range(45, 118); B.tint = TOWER_COLS[rng.next() % 7]; B.meshVariant = rng.irange(0,1); }
            else if(roll < 0.72f){ B.type = BT_APT; B.h = rng.range(26, 58); B.tint = MID_COLS[rng.next() % 6]; B.meshVariant = rng.irange(0,1); }
            else { B.type = BT_SHOP; B.h = rng.range(11, 17); B.tint = MID_COLS[rng.next() % 6]; B.meshVariant = 0; }
          } else if(mid){
            if(roll < 0.30f){ B.type = BT_SHOP; B.h = rng.range(9, 15); B.tint = MID_COLS[rng.next() % 6]; B.meshVariant = 0; }
            else if(roll < 0.62f){ B.type = BT_APT; B.h = rng.range(20, 46); B.tint = MID_COLS[rng.next() % 6]; B.meshVariant = rng.irange(0,1); }
            else if(roll < 0.80f){ B.type = BT_TOWER; B.h = rng.range(24, 46); B.tint = TOWER_COLS[rng.next() % 7]; B.meshVariant = rng.irange(0,1); }
            else { B.type = BT_HOUSE; B.h = rng.range(7, 11); B.tint = HOUSE_COLS[rng.next() % 8]; B.meshVariant = 1; }
          } else {
            if(roll < 0.80f){
              B.type = BT_HOUSE;
              B.meshVariant = rng.f() < 0.35f ? 1 : 0;
              B.h = B.meshVariant ? rng.range(8.5f, 11.5f) : rng.range(5.5f, 7.5f);
              B.tint = HOUSE_COLS[rng.next() % 8];
            } else {
              B.type = BT_SHOP; B.h = rng.range(7, 11); B.tint = MID_COLS[rng.next() % 6]; B.meshVariant = 0;
            }
          }
          buildings.push_back(B);
          t += along + gap;
        }
      }
    }
  }

  // ---------------------------------------------------------------- props
  void genProps(){
    m::Rng rng(seed * 2654435761u + 31u);
    // one pass over the heightmap; density by biome
    for(int z = 0; z < HM; z++){
      for(int x = 0; x < HM; x++){
        int i = idx2(x, z);
        uint8_t b = terr.biome[i];
        if(b == B_WATER || isUrbanB(b)) continue;
        float density = (b == B_FOREST) ? 3.2f : (b == B_MOUNTAIN) ? 1.1f : (b == B_SAND) ? 0.18f : 0.55f;
        int n = (int)density;
        if(rng.f() < density - n) n++;
        for(int k = 0; k < n; k++){
          float wx = x * HSTEP + rng.f() * HSTEP;
          float wz = z * HSTEP + rng.f() * HSTEP;
          if(terr.isWater(wx, wz)) continue;
          float slope = m::len(v3{ terr.normal(wx, wz).x, 0, terr.normal(wx, wz).z });
          Prop p;
          p.x = wx; p.z = wz; p.y = terr.sample(wx, wz);
          p.rotY = rng.f() * m::TAU;
          p.phase = rng.f();
          if(b == B_MOUNTAIN){
            p.kind = (slope > 0.42f || rng.f() < 0.55f) ? 3 : 1;
            p.scale = rng.range(0.9f, 2.4f);
          } else if(b == B_FOREST){
            float r = rng.f();
            p.kind = r < 0.52f ? 0 : (r < 0.86f ? 1 : 2);
            p.scale = rng.range(1.5f, 3.1f);
          } else if(b == B_SAND){
            p.kind = rng.f() < 0.6f ? 3 : 2;
            p.scale = rng.range(0.6f, 1.3f);
          } else {
            float r = rng.f();
            p.kind = r < 0.34f ? 0 : (r < 0.50f ? 1 : (r < 0.88f ? 2 : 3));
            p.scale = rng.range(0.9f, 2.0f);
          }
          if(p.kind == 3) p.scale *= 1.15f;
          props.push_back(p);
        }
      }
    }
  }
};

} // namespace world
