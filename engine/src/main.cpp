// ============================================================================
//  MOOR3D — renderer + game
//
//  Frame: shadow cascades -> HDR forward PBR -> bloom -> ACES/FXAA composite
// ============================================================================
#include <emscripten.h>
#include <emscripten/html5.h>
#include <GLES3/gl3.h>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <unordered_map>

#include "mathx.h"
#include "gl.h"
#include "shaders.h"
#include "models.h"
#include "anim.h"
#include "world.h"
#include "texgen.h"

using m::v3;
using m::v4;
using m::m4;
using m::quat;
using gfx::Mesh;

// ============================================================================
//  Config
// ============================================================================
static const int   SHADOW_RES[3]   = { 2048, 2048, 1024 };
static const float CASCADE_SPLIT[3]= { 90.0f, 320.0f, 1400.0f };
static const float FOG_DENSITY     = 0.00042f;
static const float CHUNK_M         = 500.0f;    // metres per terrain chunk
static const int   CHUNK_QUADS     = 32;        // 32x32 quads per chunk
static const float CHUNK_VIEW      = 3000.0f;   // generate/draw radius
static const int   CHUNK_GRID      = (int)(world::SIZE / CHUNK_M);

// ============================================================================
//  Globals
// ============================================================================
static int   gW = 1280, gH = 720;
static float gRenderScale = 1.0f;
static int   gRW = 1280, gRH = 720;        // internal render resolution
static bool  gFXAA = true;
static int   gQuality = 2;                 // 0 low, 1 med, 2 high, 3 ultra/4K

static world::World  W;
static gfx::Program  progMain, progShadow, progSky, progWater, progBright, progBlur, progComp;
static gfx::RenderTarget rtScene, rtBloomA, rtBloomB;
static gfx::ShadowMap    shadow[3];
static gfx::FullscreenQuad fsq;
static gfx::Program        progGen;
static texgen::MaterialArray gMaterials;
static int   gTexRes      = 2048;    // per-layer texture resolution
static float gTexScale    = 4.0f;    // world metres per material tile
static bool  gTexOn       = true;
static bool  gTriplanar   = true;

// meshes
static Mesh meshChar;
static Mesh meshCarBody[7], meshCarPolice, meshWheel;
static Mesh meshTower[2], meshHouse[2], meshShop, meshApt[2];
static Mesh meshTree[3], meshRock[3], meshLamp, meshTLight;
static Mesh meshAnimal[models::SP_COUNT], meshBird;
static Mesh meshBench, meshHydrant, meshBin, meshBusStop;
static Mesh meshRoads, meshWater;
static Mesh meshFarTerrain;      // coarse full-map ground, fills every gap
static Mesh meshUnit;                       // 1x1x1 box, generic filler

// terrain chunk cache
struct Chunk { Mesh mesh; bool built = false; float cx = 0, cz = 0; };
static std::unordered_map<int, Chunk> gChunks;

// instance scratch buffers, refilled each frame
static std::vector<Mesh::Instance> instBuf;

// diagnostics
static int  gDbgChunksDrawn = 0, gDbgRoadTilesDrawn = 0;
static bool gShadowsOn = true;
static int  gDbgTint = 0;   // 1 = colour-code ground sources
static int  gDbgMode = 0;   // shader debug visualisation
static bool gShowShadowMap = false;
static int  gDbgShadowIdx = 0;
static bool gFreezeAnimals = false;

// ============================================================================
//  Time / sun
// ============================================================================
static float gTime = 0.0f;                  // seconds since start
static float gClock = 9.5f;                 // hours, 0..24
static float gDayLength = 480.0f;           // real seconds per in-game day

struct SunState { v3 dir, colour, sky, ground, fog; float night; };

static SunState sunState(){
  SunState s;
  // sun arc: elevation peaks at noon, azimuth sweeps east->west
  float t = (gClock - 6.0f) / 12.0f;                 // 0 at sunrise, 1 at sunset
  float elev = std::sin(m::clampf(t, -0.35f, 1.35f) * m::PI) * 1.05f;
  float azim = (-0.55f + t * 1.10f) * m::PI;
  float ce = std::cos(std::asin(m::clampf(elev, -1.0f, 1.0f)));
  s.dir = m::norm(v3{ std::sin(azim) * ce, elev, std::cos(azim) * ce * 0.55f - 0.25f });

  float up = m::clampf(s.dir.y, 0.0f, 1.0f);
  s.night = m::clampf(1.0f - (s.dir.y + 0.16f) * 3.6f, 0.0f, 1.0f);

  // warm low sun, neutral high sun. The sun must clearly out-punch the sky
  // ambient or everything reads as flat blue haze.
  float warm = std::pow(1.0f - up, 2.4f);
  v3 day  { 1.00f, 0.955f, 0.88f };
  v3 dusk { 1.00f, 0.52f,  0.24f };
  s.colour = m::lerp(day, dusk, warm) * (4.3f * up + 0.04f);

  // skylight: bright but desaturated, so it lifts shadows without tinting everything
  s.sky    = m::lerp(v3{0.30f, 0.36f, 0.47f}, v3{0.016f, 0.022f, 0.044f}, s.night) * (0.34f + up * 0.40f);
  s.ground = m::lerp(v3{0.15f, 0.14f, 0.11f}, v3{0.010f, 0.011f, 0.016f}, s.night);
  s.fog    = m::lerp(m::lerp(v3{0.62f,0.70f,0.82f}, v3{0.72f,0.50f,0.36f}, warm),
                     v3{0.030f,0.040f,0.075f}, s.night);
  return s;
}

// ============================================================================
//  Camera
// ============================================================================
struct Camera {
  v3    pos{0, 20, 0};
  float yaw = 0.0f, pitch = -0.22f;
  float dist = 7.5f;
  float fov  = 62.0f * m::DEG;
  m4    view, proj, viewProj;
  gfx::Frustum frustum;

  void buildMatrices(const v3& target){
    v3 fwd{ std::sin(yaw) * std::cos(pitch), std::sin(pitch), std::cos(yaw) * std::cos(pitch) };
    pos = target - fwd * dist;
    // keep the camera above the ground
    float g = W.terr.sample(pos.x, pos.z) + 1.4f;
    if(pos.y < g) pos.y = g;
    view = m4::lookAt(pos, target, {0, 1, 0});
    proj = m4::perspective(fov, (float)gRW / (float)gRH, 0.25f, 6000.0f);
    viewProj = proj * view;
    frustum.fromMatrix(viewProj);
  }
};
static Camera cam;
static bool  gFreeCam = false;
static v3    gFreeCamPos{0,0,0};
static float gFreeYaw = 0.0f, gFreePitch = -0.5f;

// ============================================================================
//  Entities
// ============================================================================
struct Vehicle {
  v3    pos{0, 0, 0};
  float heading = 0.0f;
  float speed   = 0.0f;
  float steer   = 0.0f;
  float wheelSpin = 0.0f;
  float suspension[4] = {0, 0, 0, 0};
  float bodyRoll = 0.0f, bodyPitch = 0.0f;
  int   kind = 0;
  v3    colour{0.7f, 0.2f, 0.2f};
  bool  police = false;
  bool  playerDriven = false;

  // AI road following
  int   edge = -1, targetNode = -1, prevNode = -1;
  bool  ai = true;
  float stuck = 0.0f;
};

struct Ped {
  v3    pos{0, 0, 0};
  float heading = 0.0f;
  float speed   = 0.0f;
  float wanderT = 0.0f;
  anim::Animator animator;
  models::CharacterLook look;
  bool  yelling = false;
  float yellT = 0.0f;
};

// Wild animals. One shared rig, eight species, real gaits.
struct Animal {
  v3    pos{0,0,0};
  float heading = 0.0f;
  float speed = 0.0f;
  float wanderT = 0.0f, fleeT = 0.0f, graze = 0.0f;
  int   species = 0;
  bool  grazing = false, spooked = false;
  anim::Animator animator;
};
struct Bird {
  v3    pos{0,0,0};
  float heading = 0.0f, radius = 40.0f, angle = 0.0f, height = 0.0f, flap = 1.0f;
  anim::Animator animator;
};
struct Furn { float x, z, y, rot; int kind; };

static std::vector<Vehicle> gCars;
static std::vector<Ped>     gPeds;
static std::vector<Animal>  gAnimals;
static std::vector<Bird>    gBirds;
static std::vector<Furn>    gFurn;

struct Player {
  v3    pos{0, 0, 0};
  float heading = 0.0f;
  float speed   = 0.0f;
  v3    vel{0, 0, 0};
  bool  inCar = false;
  int   carIndex = -1;
  anim::Animator animator;
  models::CharacterLook look;
};
static Player P;

// ============================================================================
//  Input
// ============================================================================
static bool  keyDown[400] = {false};
static bool  mouseCaptured = false;
static float mouseDX = 0, mouseDY = 0;
static bool  gStarted = false;

static bool key(int code){ return code >= 0 && code < 400 && keyDown[code]; }
static bool moveFwd()  { return key(87) || key(38); }   // W / Up
static bool moveBack() { return key(83) || key(40); }   // S / Down
static bool moveLeft() { return key(65) || key(37); }   // A / Left
static bool moveRight(){ return key(68) || key(39); }   // D / Right
static bool sprintKey(){ return key(16); }              // Shift

// ============================================================================
//  Terrain chunk meshing
// ============================================================================
static v3 biomeColour(world::Biome b, float h, float slope, float jitter){
  v3 c;
  switch(b){
    case world::B_SAND:       c = v3{0.52f, 0.47f, 0.35f}; break;
    case world::B_GRASS:      c = v3{0.20f, 0.30f, 0.13f}; break;
    case world::B_FOREST:     c = v3{0.13f, 0.22f, 0.10f}; break;
    case world::B_MOUNTAIN:   c = v3{0.33f, 0.31f, 0.29f}; break;
    case world::B_URBAN_LOW:  c = v3{0.25f, 0.28f, 0.19f}; break;
    case world::B_URBAN_MID:  c = v3{0.29f, 0.29f, 0.28f}; break;
    case world::B_URBAN_HIGH: c = v3{0.30f, 0.30f, 0.30f}; break;
    default:                  c = v3{0.20f, 0.30f, 0.14f}; break;
  }
  // snow on the peaks, rock on steep faces
  if(b == world::B_MOUNTAIN){
    if(h > 400.0f) c = m::lerp(c, v3{0.92f, 0.94f, 0.97f}, m::clampf((h - 400.0f) / 140.0f, 0.0f, 1.0f));
    if(slope > 0.55f) c = m::lerp(c, v3{0.30f, 0.28f, 0.26f}, 0.6f);
  }
  if(b == world::B_GRASS && slope > 0.62f) c = m::lerp(c, v3{0.34f, 0.30f, 0.24f}, 0.55f);
  return c * (0.88f + jitter * 0.24f);
}

static void buildChunk(Chunk& ch, int gx, int gz){
  std::vector<gfx::Vertex> verts;
  std::vector<uint32_t>    idx;
  const int   N  = CHUNK_QUADS;
  const float dS = CHUNK_M / N;
  float ox = gx * CHUNK_M, oz = gz * CHUNK_M;
  verts.reserve((N + 1) * (N + 1));

  for(int z = 0; z <= N; z++){
    for(int x = 0; x <= N; x++){
      float wx = ox + x * dS, wz = oz + z * dS;
      float h  = W.terr.sample(wx, wz);
      v3    nr = W.terr.normal(wx, wz);
      float slope = 1.0f - nr.y;
      world::Biome b = W.terr.sampleBiome(wx, wz);
      float jit = m::hash2((int)(wx * 0.4f), (int)(wz * 0.4f));
      gfx::Vertex v;
      v.pos = { wx, h, wz };
      v.nrm = nr;
      v.col = biomeColour(b, h, slope, jit);
      v.ao  = 1.0f;
      v.joint = 0.0f;
      v.rough = (b == world::B_SAND) ? 0.80f : (b == world::B_MOUNTAIN) ? 0.92f : 0.88f;
      v.metal = 0.0f;
      v.mat   = (b == world::B_SAND) ? (float)texgen::MAT_SAND
              : (b == world::B_MOUNTAIN) ? (float)texgen::MAT_ROCK
              : world::World::isUrbanB((uint8_t)b) ? (float)texgen::MAT_MANMADE
              : (float)texgen::MAT_VEG;
      // steep ground shows rock whatever the biome says
      if(slope > 0.55f) v.mat = (float)texgen::MAT_ROCK;
      verts.push_back(v);
    }
  }
  for(int z = 0; z < N; z++){
    for(int x = 0; x < N; x++){
      uint32_t a = z * (N + 1) + x;
      uint32_t b = a + 1;
      uint32_t c = a + (N + 1);
      uint32_t d = c + 1;
      idx.insert(idx.end(), { a, c, b, b, c, d });
    }
  }
  ch.mesh.upload(verts, idx);
  ch.mesh.setupInstancing(1);
  std::vector<Mesh::Instance> one(1);
  one[0].xform = m4::identity();
  one[0].tint  = v3{1, 1, 1};
  one[0].extra = 0.0f;
  ch.mesh.updateInstances(one);
  ch.built = true;
  ch.cx = ox + CHUNK_M * 0.5f;
  ch.cz = oz + CHUNK_M * 0.5f;
}

// One coarse mesh over the entire 16 km map. Sits 3 m below the detailed
// chunks so those always win the depth test where they exist, and fills in
// everywhere they don't — otherwise distant gaps show the ocean plane.
static void buildFarTerrain(){
  const int N = 200;
  const float dS = world::SIZE / N;
  std::vector<gfx::Vertex> verts;
  std::vector<uint32_t>    idx;
  verts.reserve((N + 1) * (N + 1));
  for(int z = 0; z <= N; z++){
    for(int x = 0; x <= N; x++){
      float wx = x * dS, wz = z * dS;
      float h  = W.terr.sample(wx, wz);
      v3    nr = W.terr.normal(wx, wz);
      world::Biome b = W.terr.sampleBiome(wx, wz);
      gfx::Vertex v;
      v.pos = { wx, h - 3.0f, wz };
      v.nrm = nr;
      v.col = biomeColour(b, h, 1.0f - nr.y, m::hash2(x, z));
      v.ao = 1.0f; v.joint = 0.0f; v.rough = 0.90f; v.metal = 0.0f;
      v.mat = (b == world::B_SAND) ? (float)texgen::MAT_SAND
            : (b == world::B_MOUNTAIN) ? (float)texgen::MAT_ROCK
            : world::World::isUrbanB((uint8_t)b) ? (float)texgen::MAT_MANMADE
            : (float)texgen::MAT_VEG;
      verts.push_back(v);
    }
  }
  for(int z = 0; z < N; z++){
    for(int x = 0; x < N; x++){
      uint32_t a = z * (N + 1) + x, b = a + 1, c = a + (N + 1), d = c + 1;
      idx.insert(idx.end(), { a, c, b, b, c, d });
    }
  }
  meshFarTerrain.upload(verts, idx);
  meshFarTerrain.setupInstancing(1);
  std::vector<Mesh::Instance> one(1);
  one[0].xform = m4::identity();
  one[0].tint  = v3{1, 1, 1};
  meshFarTerrain.updateInstances(one);
  printf("[far terrain] %d verts\n", (int)verts.size());
}

static Chunk* getChunk(int gx, int gz){
  if(gx < 0 || gz < 0 || gx >= CHUNK_GRID || gz >= CHUNK_GRID) return nullptr;
  int k = gz * CHUNK_GRID + gx;
  auto it = gChunks.find(k);
  if(it != gChunks.end()) return &it->second;
  if(gChunks.size() > 400) return nullptr;         // hard cap on cached chunks
  Chunk& ch = gChunks[k];
  buildChunk(ch, gx, gz);
  return &ch;
}

// ============================================================================
//  Road mesh — ribbons that follow the terrain.
//  Tiled by chunk so it can be frustum-culled; drawing all 16 km of tarmac
//  every pass was the single biggest cost in the frame.
// ============================================================================
struct RoadTile { Mesh mesh; float cx, cz; };
static std::unordered_map<int, RoadTile> gRoadTiles;

static void buildRoadTileGeometry(const std::vector<int>& edgeIds,
                                  std::vector<gfx::Vertex>& verts,
                                  std::vector<uint32_t>& idx);

static void buildRoadMesh(){
  // bucket every edge into the tile its midpoint lands in
  std::unordered_map<int, std::vector<int>> buckets;
  for(size_t i = 0; i < W.edges.size(); i++){
    const auto& e = W.edges[i];
    float mx = (e.x1 + e.x2) * 0.5f, mz = (e.z1 + e.z2) * 0.5f;
    int gx = (int)(mx / CHUNK_M), gz = (int)(mz / CHUNK_M);
    gx = std::max(0, std::min(CHUNK_GRID - 1, gx));
    gz = std::max(0, std::min(CHUNK_GRID - 1, gz));
    buckets[gz * CHUNK_GRID + gx].push_back((int)i);
  }

  size_t totalVerts = 0;
  for(auto& kv : buckets){
    std::vector<gfx::Vertex> verts;
    std::vector<uint32_t>    idx;
    buildRoadTileGeometry(kv.second, verts, idx);
    if(idx.empty()) continue;
    RoadTile& t = gRoadTiles[kv.first];
    t.mesh.upload(verts, idx);
    t.mesh.setupInstancing(1);
    std::vector<Mesh::Instance> one(1);
    one[0].xform = m4::identity();
    one[0].tint  = v3{1, 1, 1};
    t.mesh.updateInstances(one);
    int gx = kv.first % CHUNK_GRID, gz = kv.first / CHUNK_GRID;
    t.cx = (gx + 0.5f) * CHUNK_M;
    t.cz = (gz + 0.5f) * CHUNK_M;
    totalVerts += verts.size();
  }
  printf("[roads] %d edges -> %d tiles, %d verts\n",
         (int)W.edges.size(), (int)gRoadTiles.size(), (int)totalVerts);
}

static void buildRoadTileGeometry(const std::vector<int>& edgeIds,
                                  std::vector<gfx::Vertex>& verts,
                                  std::vector<uint32_t>& idx){
  for(int ei : edgeIds){
    const auto& e = W.edges[ei];
    float ax = e.x2 - e.x1, az = e.z2 - e.z1;
    float L = e.len; if(L < 1e-3f) continue;
    float dx = ax / L, dz = az / L;
    float px = -dz, pz = dx;
    int segs = std::max(2, (int)(L / 22.0f));
    float hw = e.width * 0.5f;

    v3 tarmac = e.highway ? v3{0.118f, 0.122f, 0.132f} : v3{0.135f, 0.138f, 0.148f};
    v3 kerb   = v3{0.46f, 0.46f, 0.47f};

    for(int s = 0; s <= segs; s++){
      float t = (float)s / segs;
      float x = e.x1 + dx * L * t, z = e.z1 + dz * L * t;
      float h = (e.bridge ? std::max(W.terr.sample(x, z), 4.0f) : W.terr.sample(x, z)) + 0.38f;
      float jit = m::hash2((int)(x * 0.3f), (int)(z * 0.3f)) * 0.06f;
      // 4 verts per rib: outer-left kerb, road-left, road-right, outer-right kerb
      const float lanes[4] = { -hw - 1.6f, -hw, hw, hw + 1.6f };
      for(int k = 0; k < 4; k++){
        gfx::Vertex v;
        bool isKerb = (k == 0 || k == 3);
        v.pos = { x + px * lanes[k], h + (isKerb ? 0.16f : 0.0f), z + pz * lanes[k] };
        v.nrm = { 0, 1, 0 };
        v.col = isKerb ? kerb : (tarmac + v3(jit));
        v.ao  = 1.0f;
        v.joint = 0.0f;
        v.rough = isKerb ? 0.80f : 0.56f;
        v.metal = 0.0f;
        v.mat   = (float)texgen::MAT_MANMADE;
        verts.push_back(v);
      }
    }
    uint32_t base = (uint32_t)verts.size() - (uint32_t)(segs + 1) * 4;
    for(int s = 0; s < segs; s++){
      for(int k = 0; k < 3; k++){
        uint32_t a = base + s * 4 + k;
        uint32_t b = a + 1;        // next lane across
        uint32_t c = a + 4;        // same lane, next rib
        uint32_t d = c + 1;
        idx.insert(idx.end(), { a, b, c, b, d, c });
      }
    }

    // centre line: a thin bright ribbon, dashed by skipping segments
    if(!e.bridge && e.zone <= 2){
      v3 lineCol = e.highway ? v3{0.85f, 0.72f, 0.28f} : v3{0.78f, 0.78f, 0.74f};
      int dashes = std::max(1, (int)(L / 16.0f));
      for(int s = 0; s < dashes; s++){
        if(s % 2) continue;
        float t0 = (float)s / dashes, t1 = (float)(s + 0.55f) / dashes;
        uint32_t lb = (uint32_t)verts.size();
        for(int q = 0; q < 2; q++){
          float t = q ? t1 : t0;
          float x = e.x1 + dx * L * t, z = e.z1 + dz * L * t;
          float h = (e.bridge ? std::max(W.terr.sample(x, z), 4.0f) : W.terr.sample(x, z)) + 0.42f;
          for(int side = -1; side <= 1; side += 2){
            gfx::Vertex v;
            v.pos = { x + px * 0.22f * side, h, z + pz * 0.22f * side };
            v.nrm = { 0, 1, 0 };
            v.col = lineCol;
            v.ao = 1.0f; v.joint = 0.0f; v.rough = 0.62f; v.metal = 0.0f;
            verts.push_back(v);
          }
        }
        idx.insert(idx.end(), { lb, lb+1, lb+2, lb+1, lb+3, lb+2 });
      }
    }
  }
}

// ============================================================================
//  Water grid (camera-following, displaced in the vertex shader)
// ============================================================================
static GLuint waterVAO = 0, waterVBO = 0, waterEBO = 0;
static int    waterIndexCount = 0;
static void buildWaterGrid(){
  const int N = 150;
  const float EXT = 2600.0f;
  std::vector<float> pos;
  std::vector<uint32_t> idx;
  pos.reserve((N + 1) * (N + 1) * 3);
  for(int z = 0; z <= N; z++){
    for(int x = 0; x <= N; x++){
      // quadratic spacing: dense near the camera, coarse far away
      float u = (float)x / N * 2.0f - 1.0f;
      float v = (float)z / N * 2.0f - 1.0f;
      float sx = m::signf(u) * u * u * EXT;
      float sz = m::signf(v) * v * v * EXT;
      pos.push_back(sx); pos.push_back(0.0f); pos.push_back(sz);
    }
  }
  for(int z = 0; z < N; z++){
    for(int x = 0; x < N; x++){
      uint32_t a = z * (N + 1) + x, b = a + 1, c = a + (N + 1), d = c + 1;
      idx.insert(idx.end(), { a, c, b, b, c, d });
    }
  }
  waterIndexCount = (int)idx.size();
  glGenVertexArrays(1, &waterVAO);
  glBindVertexArray(waterVAO);
  glGenBuffers(1, &waterVBO);
  glBindBuffer(GL_ARRAY_BUFFER, waterVBO);
  glBufferData(GL_ARRAY_BUFFER, pos.size() * sizeof(float), pos.data(), GL_STATIC_DRAW);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 0, nullptr);
  glGenBuffers(1, &waterEBO);
  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, waterEBO);
  glBufferData(GL_ELEMENT_ARRAY_BUFFER, idx.size() * sizeof(uint32_t), idx.data(), GL_STATIC_DRAW);
  glBindVertexArray(0);
}

// ============================================================================
//  Mesh construction
// ============================================================================
static void makeUnitInstanced(Mesh& mesh, int maxInst){
  mesh.setupInstancing(maxInst);
}

static void buildAllMeshes(){
  models::buildCharacter(meshChar, models::CharacterLook{});
  makeUnitInstanced(meshChar, 256);

  int nSpecs = 0;
  const models::CarSpec* specs = models::carSpecs(nSpecs);
  for(int i = 0; i < nSpecs && i < 7; i++){
    models::buildCarBody(meshCarBody[i], specs[i], false);
    makeUnitInstanced(meshCarBody[i], 128);
  }
  models::buildCarBody(meshCarPolice, specs[0], true);
  makeUnitInstanced(meshCarPolice, 64);
  models::buildWheel(meshWheel, 1.0f, 1.0f);       // unit wheel, scaled per car
  makeUnitInstanced(meshWheel, 512);

  models::buildTower(meshTower[0], 14, true);   makeUnitInstanced(meshTower[0], 1200);
  models::buildTower(meshTower[1], 9,  false);  makeUnitInstanced(meshTower[1], 1200);
  models::buildHouse(meshHouse[0], false);      makeUnitInstanced(meshHouse[0], 2400);
  models::buildHouse(meshHouse[1], true);       makeUnitInstanced(meshHouse[1], 2400);
  models::buildShop(meshShop);                  makeUnitInstanced(meshShop, 1600);
  models::buildApartment(meshApt[0], 6);        makeUnitInstanced(meshApt[0], 1600);
  models::buildApartment(meshApt[1], 10);       makeUnitInstanced(meshApt[1], 1600);

  models::buildTree(meshTree[0], 0); makeUnitInstanced(meshTree[0], 4000);
  models::buildTree(meshTree[1], 1); makeUnitInstanced(meshTree[1], 4000);
  models::buildTree(meshTree[2], 2); makeUnitInstanced(meshTree[2], 4000);
  models::buildRock(meshRock[0], 11); makeUnitInstanced(meshRock[0], 2000);
  models::buildRock(meshRock[1], 97); makeUnitInstanced(meshRock[1], 2000);
  models::buildRock(meshRock[2], 613); makeUnitInstanced(meshRock[2], 2000);
  models::buildLamppost(meshLamp);   makeUnitInstanced(meshLamp, 600);
  models::buildTrafficLight(meshTLight); makeUnitInstanced(meshTLight, 300);

  // our own animals: one mesh per species, all on the same 20-joint rig
  {
    const models::QuadSpec* T = models::speciesTable();
    for(int i = 0; i < models::SP_COUNT; i++){
      models::buildQuadruped(meshAnimal[i], T[i]);
      makeUnitInstanced(meshAnimal[i], 1);
    }
  }
  models::buildBird(meshBird, {0.22f, 0.20f, 0.19f}, {0.30f, 0.28f, 0.26f});
  makeUnitInstanced(meshBird, 1);

  models::buildBench(meshBench);     makeUnitInstanced(meshBench, 400);
  models::buildHydrant(meshHydrant); makeUnitInstanced(meshHydrant, 400);
  models::buildBin(meshBin);         makeUnitInstanced(meshBin, 400);
  models::buildBusStop(meshBusStop); makeUnitInstanced(meshBusStop, 200);

  { models::Builder b; b.mat(0.6f, 0.0f); b.box({0,0.5f,0}, {0.5f,0.5f,0.5f}, {1,1,1}); b.finish(meshUnit); }
  makeUnitInstanced(meshUnit, 64);

  buildFarTerrain();
  buildRoadMesh();
  buildWaterGrid();
}

// ============================================================================
//  Shaders
// ============================================================================
static bool buildShaders(){
  std::string mainFS = std::string(shaders::COMMON_FRAG_HEAD)
                     + shaders::PBR_LIB + shaders::MAIN_FS_BODY;
  bool ok = true;
  ok &= progMain.build(shaders::MAIN_VS, mainFS.c_str(), "main");
  ok &= progShadow.build(shaders::SHADOW_VS, shaders::SHADOW_FS, "shadow");
  ok &= progSky.build(shaders::SKY_VS, shaders::SKY_FS, "sky");
  ok &= progWater.build(shaders::WATER_VS, shaders::WATER_FS, "water");
  ok &= progBright.build(shaders::POST_VS, shaders::BRIGHT_FS, "bright");
  ok &= progBlur.build(shaders::POST_VS, shaders::BLUR_FS, "blur");
  ok &= progComp.build(shaders::POST_VS, shaders::COMPOSITE_FS, "composite");
  ok &= progGen.build(texgen::GEN_VS, texgen::GEN_FS, "texgen");
  return ok;
}

// ============================================================================
//  Render targets
// ============================================================================
static void resizeTargets(){
  gRW = std::max(320, (int)(gW * gRenderScale));
  gRH = std::max(240, (int)(gH * gRenderScale));
  rtScene.create(gRW, gRH, true, true);
  int bw = std::max(2, gRW / 2), bh = std::max(2, gRH / 2);
  rtBloomA.create(bw, bh, true, false);
  rtBloomB.create(bw, bh, true, false);
}

// ============================================================================
//  Shadow cascades
// ============================================================================
static m4 gLightVP[3];

static void computeCascade(int i, const v3& sunDir, const v3& focus){
  float extent = CASCADE_SPLIT[i];
  // Snap the light origin to texel increments to stop shadow shimmer when moving.
  float texelWorld = (extent * 2.0f) / SHADOW_RES[i];
  v3 c = focus;
  c.x = std::floor(c.x / texelWorld) * texelWorld;
  c.z = std::floor(c.z / texelWorld) * texelWorld;
  v3 eye = c + sunDir * (extent * 2.2f + 400.0f);
  m4 lview = m4::lookAt(eye, c, {0, 1, 0});
  m4 lproj = m4::ortho(-extent, extent, -extent, extent, 1.0f, extent * 4.4f + 1200.0f);
  gLightVP[i] = lproj * lview;
}

// ============================================================================
//  Instance gathering
// ============================================================================
struct DrawItem { Mesh* mesh; std::vector<Mesh::Instance> inst; bool sway; bool smallCaster; };
static std::vector<DrawItem> gDraws;

static void pushDraw(Mesh* mesh, std::vector<Mesh::Instance>&& inst, bool sway, bool smallCaster){
  if(inst.empty()) return;
  gDraws.push_back({ mesh, std::move(inst), sway, smallCaster });
}

// Point lights for this frame (headlights, lamps).
static std::vector<v4> gLightPos, gLightCol;

static void gatherScene(const SunState& sun){
  gDraws.clear();
  gLightPos.clear();
  gLightCol.clear();

  v3 focus = P.inCar && P.carIndex >= 0 ? gCars[P.carIndex].pos : P.pos;

  // ---------------- buildings
  {
    std::vector<Mesh::Instance> tower[2], house[2], shop, apt[2];
    W.forEachNear(W.bldBuckets, cam.pos.x, cam.pos.z, 2400.0f, [&](int bi){
      const auto& b = W.buildings[bi];
      float dx = b.x - focus.x, dz = b.z - focus.z;
      float d2 = dx*dx + dz*dz;
      if(d2 > 2400.0f * 2400.0f) return;
      if(b.h < 20.0f && d2 > 900.0f * 900.0f) return;
      float radius = std::max(b.w, b.d) * 0.75f + b.h * 0.5f;
      if(!cam.frustum.sphereVisible(v3{b.x, b.y + b.h * 0.5f, b.z}, radius)) return;
      Mesh::Instance in;
      in.xform = m4::trs({b.x, b.y, b.z}, quat::axisAngle({0,1,0}, b.rotY), {b.w, b.h, b.d});
      in.tint  = b.tint;
      in.extra = b.litSeed;
      switch(b.type){
        case world::BT_TOWER: tower[b.meshVariant & 1].push_back(in); break;
        case world::BT_HOUSE: house[b.meshVariant & 1].push_back(in); break;
        case world::BT_APT:   apt[b.meshVariant & 1].push_back(in);   break;
        default:              shop.push_back(in); break;
      }
    });
    pushDraw(&meshTower[0], std::move(tower[0]), false, false);
    pushDraw(&meshTower[1], std::move(tower[1]), false, false);
    pushDraw(&meshHouse[0], std::move(house[0]), false, false);
    pushDraw(&meshHouse[1], std::move(house[1]), false, false);
    pushDraw(&meshApt[0],   std::move(apt[0]),   false, false);
    pushDraw(&meshApt[1],   std::move(apt[1]),   false, false);
    pushDraw(&meshShop,     std::move(shop),     false, false);
  }

  // ---------------- props (trees sway, rocks don't)
  {
    std::vector<Mesh::Instance> tree[3], rock[3];
    W.forEachNear(W.propBuckets, cam.pos.x, cam.pos.z, 800.0f, [&](int pi){
      const auto& p = W.props[pi];
      float dx = p.x - focus.x, dz = p.z - focus.z;
      float d2 = dx*dx + dz*dz;
      float cull = (p.kind == 3) ? 480.0f : 760.0f;
      if(d2 > cull * cull) return;
      if(!cam.frustum.sphereVisible(v3{p.x, p.y + p.scale * 1.6f, p.z}, p.scale * 3.4f)) return;
      Mesh::Instance in;
      in.xform = m4::trs({p.x, p.y, p.z}, quat::axisAngle({0,1,0}, p.rotY), v3(p.scale));
      in.tint  = v3{1, 1, 1};
      in.extra = p.phase;
      if(p.kind == 3) rock[(int)(p.phase * 2.99f)].push_back(in);
      else            tree[p.kind % 3].push_back(in);
    });
    for(int i = 0; i < 3; i++) pushDraw(&meshTree[i], std::move(tree[i]), true, true);
    for(int i = 0; i < 3; i++) pushDraw(&meshRock[i], std::move(rock[i]), false, true);
  }

  // ---------------- street furniture
  {
    std::vector<Mesh::Instance> bench, hyd, bin, stop;
    for(const auto& f : gFurn){
      float dx = f.x - focus.x, dz = f.z - focus.z;
      if(dx*dx + dz*dz > 420.0f * 420.0f) continue;
      if(!cam.frustum.sphereVisible(v3{f.x, f.y + 1.0f, f.z}, 3.4f)) continue;
      Mesh::Instance in;
      in.xform = m4::trs({f.x, f.y, f.z}, quat::axisAngle({0,1,0}, f.rot), v3(1.0f));
      in.tint  = v3{1, 1, 1};
      switch(f.kind){
        case 0: bench.push_back(in); break;
        case 1: hyd.push_back(in);   break;
        case 2: bin.push_back(in);   break;
        default: stop.push_back(in); break;
      }
    }
    pushDraw(&meshBench,   std::move(bench), false, true);
    pushDraw(&meshHydrant, std::move(hyd),   false, true);
    pushDraw(&meshBin,     std::move(bin),   false, true);
    pushDraw(&meshBusStop, std::move(stop),  false, true);
  }

  // ---------------- street lights + traffic lights
  {
    std::vector<Mesh::Instance> lamps, tls;
    for(const auto& L : W.lights){
      float dx = L.x - focus.x, dz = L.z - focus.z;
      if(dx*dx + dz*dz > 700.0f * 700.0f) continue;
      if(!cam.frustum.sphereVisible(v3{L.x, L.y + 3.0f, L.z}, 6.5f)) continue;
      Mesh::Instance in;
      in.xform = m4::trs({L.x, L.y, L.z}, quat::axisAngle({0,1,0}, L.rotY), v3(1.0f));
      in.tint  = v3{1, 1, 1};
      lamps.push_back(in);
      // a lit lamp is also a point light after dusk
      if(sun.night > 0.30f && gLightPos.size() < 16 && dx*dx + dz*dz < 200.0f * 200.0f){
        gLightPos.push_back(v4{ L.x + std::sin(L.rotY) * 0.78f, L.y + 5.0f, L.z + std::cos(L.rotY) * 0.78f, 42.0f });
        gLightCol.push_back(v4{ 1.0f, 0.86f, 0.62f, 5.5f * sun.night });
      }
    }
    for(const auto& n : W.nodes){
      if(!n.light) continue;
      float dx = n.x - focus.x, dz = n.z - focus.z;
      if(dx*dx + dz*dz > 400.0f * 400.0f) continue;
      Mesh::Instance in;
      in.xform = m4::trs({n.x, W.terr.sample(n.x, n.z), n.z}, quat(), v3(1.0f));
      in.tint  = v3{1, 1, 1};
      tls.push_back(in);
    }
    pushDraw(&meshLamp, std::move(lamps), false, true);
    pushDraw(&meshTLight, std::move(tls), false, true);
  }

  // ---------------- vehicles + wheels
  {
    std::vector<Mesh::Instance> bodies[7], police, wheels;
    int nSpecs = 0;
    const models::CarSpec* specs = models::carSpecs(nSpecs);
    for(const auto& c : gCars){
      float dx = c.pos.x - focus.x, dz = c.pos.z - focus.z;
      if(dx*dx + dz*dz > 900.0f * 900.0f) continue;
      if(!cam.frustum.sphereVisible(c.pos + v3{0, 1.0f, 0}, 4.2f)) continue;
      const models::CarSpec& S = specs[c.kind % nSpecs];

      quat rot = quat::axisAngle({0,1,0}, c.heading)
               * quat::axisAngle({0,0,1}, c.bodyRoll)
               * quat::axisAngle({1,0,0}, c.bodyPitch);
      Mesh::Instance in;
      in.xform = m4::trs(c.pos, rot, v3(1.0f));
      in.tint  = c.colour;
      in.extra = 0.0f;
      if(c.police) police.push_back(in);
      else         bodies[c.kind % 7].push_back(in);

      // four wheels: steer on the front pair, spin on all, suspension per corner
      const float xo = S.wid * 0.5f - S.wheelW * 0.35f;
      const float zs[4] = { S.axleFront, S.axleFront, S.axleRear, S.axleRear };
      const float xs[4] = { xo, -xo, xo, -xo };
      for(int wi = 0; wi < 4; wi++){
        bool front = wi < 2;
        quat wr = quat::axisAngle({0,1,0}, front ? c.steer : 0.0f)
                * quat::axisAngle({1,0,0}, c.wheelSpin);
        m4 local = m4::trs({ xs[wi], S.wheelR + c.suspension[wi], zs[wi] }, wr,
                           { S.wheelW, S.wheelR, S.wheelR });
        Mesh::Instance wIn;
        wIn.xform = in.xform * local;
        wIn.tint  = v3{1, 1, 1};
        wheels.push_back(wIn);
      }

      // headlights become point lights at night
      if(sun.night > 0.25f && gLightPos.size() < 15){
        v3 fwd{ std::sin(c.heading), 0.0f, std::cos(c.heading) };
        v3 hp = c.pos + fwd * (S.len * 0.5f + 1.0f) + v3{0, S.wheelR + 0.35f, 0};
        gLightPos.push_back(v4{ hp.x, hp.y, hp.z, 34.0f });
        gLightCol.push_back(v4{ 1.0f, 0.95f, 0.80f, 7.0f });
      }
    }
    for(int i = 0; i < 7; i++) pushDraw(&meshCarBody[i], std::move(bodies[i]), false, true);
    pushDraw(&meshCarPolice, std::move(police), false, true);
    pushDraw(&meshWheel, std::move(wheels), false, true);
  }
}

// Characters are drawn one at a time: each needs its own uJoints[] upload.
struct SkinnedDraw { Mesh* mesh; m4 xform; v3 tint; m4 joints[anim::MAX_JOINTS]; };
static std::vector<SkinnedDraw> gSkinned;

static void gatherSkinned(){
  gSkinned.clear();
  v3 focus = P.inCar && P.carIndex >= 0 ? gCars[P.carIndex].pos : P.pos;
  anim::Skeleton& sk = anim::skeleton();

  // the player, unless they're inside a car
  if(!P.inCar){
    SkinnedDraw d;
    d.mesh  = &meshChar;
    d.xform = m4::trs(P.pos, quat::axisAngle({0,1,0}, P.heading), v3(1.0f));
    d.tint  = v3{1, 1, 1};
    anim::Pose pose;
    P.animator.evaluate(pose);
    sk.skin(pose, d.joints);
    gSkinned.push_back(d);
  }

  for(const auto& p : gPeds){
    float dx = p.pos.x - focus.x, dz = p.pos.z - focus.z;
    if(dx*dx + dz*dz > 260.0f * 260.0f) continue;      // skinning is the expensive one
    if(!cam.frustum.sphereVisible(p.pos + v3{0, 1.0f, 0}, 1.6f)) continue;
    if(gSkinned.size() >= 48) break;
    SkinnedDraw d;
    d.mesh  = &meshChar;
    d.xform = m4::trs(p.pos, quat::axisAngle({0,1,0}, p.heading), v3(1.0f));
    d.tint  = v3{1, 1, 1};
    anim::Pose pose;
    p.animator.evaluate(pose);
    sk.skin(pose, d.joints);
    gSkinned.push_back(d);
  }

  // ---- animals
  anim::Skeleton& qs = anim::quadSkeleton();
  for(const auto& a : gAnimals){
    float dx = a.pos.x - focus.x, dz = a.pos.z - focus.z;
    if(dx*dx + dz*dz > 380.0f * 380.0f) continue;
    if(!cam.frustum.sphereVisible(a.pos + v3{0, 0.9f, 0}, 2.6f)) continue;
    if(gSkinned.size() >= 72) break;
    SkinnedDraw d;
    d.mesh  = &meshAnimal[a.species % models::SP_COUNT];
    d.xform = m4::trs(a.pos, quat::axisAngle({0,1,0}, a.heading), v3(1.0f));
    d.tint  = v3{1, 1, 1};
    anim::Pose pose;
    a.animator.evaluate(pose);
    qs.skin(pose, d.joints);
    gSkinned.push_back(d);
  }

  // ---- birds
  anim::Skeleton& bs = anim::birdSkeleton();
  for(const auto& b : gBirds){
    float dx = b.pos.x - focus.x, dz = b.pos.z - focus.z;
    if(dx*dx + dz*dz > 320.0f * 320.0f) continue;
    if(gSkinned.size() >= 84) break;
    SkinnedDraw d;
    d.mesh  = &meshBird;
    d.xform = m4::trs(b.pos, quat::axisAngle({0,1,0}, b.heading), v3(1.0f));
    d.tint  = v3{1, 1, 1};
    anim::Pose pose;
    b.animator.evaluate(pose);
    bs.skin(pose, d.joints);
    gSkinned.push_back(d);
  }
}

// ============================================================================
//  Draw helpers
// ============================================================================
static void setCommonUniforms(const gfx::Program& pr, const SunState& sun){
  pr.set("uViewProj", cam.viewProj);
  pr.set("uCamPos", cam.pos);
  pr.set("uSunDir", sun.dir);
  pr.set("uSunColour", sun.colour);
  pr.set("uSkyColour", sun.sky);
  pr.set("uGroundColour", sun.ground);
  pr.set("uTime", gTime);
  pr.set("uFogDensity", FOG_DENSITY);
  pr.set("uFogColour", sun.fog);
  pr.set("uNightFactor", sun.night);
  pr.set("uExposure", 1.0f);

  pr.set("uLightVP0", gLightVP[0]);
  pr.set("uLightVP1", gLightVP[1]);
  pr.set("uLightVP2", gLightVP[2]);
  pr.set("uCascadeEnd0", CASCADE_SPLIT[0]);
  pr.set("uCascadeEnd1", CASCADE_SPLIT[1]);
  pr.set("uShadowTexel", 1.0f / (float)SHADOW_RES[0]);
  pr.set("uShadowTexel1", 1.0f / (float)SHADOW_RES[1]);
  pr.set("uShadowTexel2", 1.0f / (float)SHADOW_RES[2]);

  glActiveTexture(GL_TEXTURE0); glBindTexture(GL_TEXTURE_2D, shadow[0].tex);
  glActiveTexture(GL_TEXTURE1); glBindTexture(GL_TEXTURE_2D, shadow[1].tex);
  glActiveTexture(GL_TEXTURE2); glBindTexture(GL_TEXTURE_2D, shadow[2].tex);
  pr.set("uShadow0", 0);
  pr.set("uShadow1", 1);
  pr.set("uShadow2", 2);

  int n = (int)gLightPos.size();
  if(n > 16) n = 16;
  gMaterials.bind(3, 4);
  pr.set("uMatAlbedo", 3);
  pr.set("uMatNormal", 4);
  pr.set("uTexScale", gTexScale);
  pr.set("uTexOn", (gTexOn && gMaterials.ready) ? 1 : 0);
  pr.set("uTriplanar", gTriplanar ? 1 : 0);
  pr.set("uDebugMode", gDbgMode);
  pr.set("uNumLights", n);
  if(n > 0){
    glUniform4fv(pr.loc("uLightPos"), n, &gLightPos[0].x);
    glUniform4fv(pr.loc("uLightCol"), n, &gLightCol[0].x);
  }
}

static void drawTerrainAndRoads(const gfx::Program& pr, const v3& focus, bool shadowPass){
  pr.set("uSkinned", 0);
  pr.set("uSway", 0);
  if(!shadowPass){
    if(gDbgTint){
      std::vector<Mesh::Instance> one(1);
      one[0].xform = m4::identity();
      one[0].tint  = v3{4.0f, 0.05f, 0.05f};
      meshFarTerrain.updateInstances(one);
    }
    meshFarTerrain.drawInstanced();
  }
  float radius = shadowPass ? 900.0f : CHUNK_VIEW;
  // centre the detail ring on the camera, not the player, so a swung camera
  // never looks at unbuilt ground
  v3 centre = shadowPass ? focus : v3{ cam.pos.x, 0.0f, cam.pos.z };
  int cgx = (int)(centre.x / CHUNK_M), cgz = (int)(centre.z / CHUNK_M);
  int span = (int)(radius / CHUNK_M) + 1;
  int budget = shadowPass ? 999 : 10;                 // new chunks built per frame
  for(int dz = -span; dz <= span; dz++){
    for(int dx = -span; dx <= span; dx++){
      int gx = cgx + dx, gz = cgz + dz;
      if(gx < 0 || gz < 0 || gx >= CHUNK_GRID || gz >= CHUNK_GRID) continue;
      float ccx = (gx + 0.5f) * CHUNK_M, ccz = (gz + 0.5f) * CHUNK_M;
      float ddx = ccx - centre.x, ddz = ccz - centre.z;
      if(ddx*ddx + ddz*ddz > radius * radius) continue;
      int k = gz * CHUNK_GRID + gx;
      auto it = gChunks.find(k);
      Chunk* ch = nullptr;
      if(it != gChunks.end()) ch = &it->second;
      else if(budget > 0){ ch = getChunk(gx, gz); budget--; }
      if(!ch || !ch->built) continue;
      if(!shadowPass){
        if(!cam.frustum.sphereVisible(v3{ccx, W.terr.sample(ccx, ccz), ccz}, CHUNK_M * 0.95f)) continue;
      }
      if(gDbgTint && !shadowPass){
        std::vector<Mesh::Instance> one(1);
        one[0].xform = m4::identity();
        one[0].tint  = v3{0.05f, 4.0f, 0.05f};
        ch->mesh.updateInstances(one);
      }
      ch->mesh.drawInstanced();
      if(!shadowPass) gDbgChunksDrawn++;
    }
  }
  // road tiles, culled the same way
  float rr = shadowPass ? 700.0f : 2600.0f;
  for(auto& kv : gRoadTiles){
    RoadTile& t = kv.second;
    float dx = t.cx - centre.x, dz = t.cz - centre.z;
    if(dx*dx + dz*dz > rr * rr) continue;
    if(!shadowPass){
      if(!cam.frustum.sphereVisible(v3{t.cx, W.terr.sample(t.cx, t.cz), t.cz}, CHUNK_M)) continue;
    }
    t.mesh.drawInstanced();
    if(!shadowPass) gDbgRoadTilesDrawn++;
  }
}

static void drawSceneGeometry(const gfx::Program& pr, bool shadowPass){
  for(const auto& d : gDraws){
    pr.set("uSway", d.sway ? 1 : 0);
    pr.set("uSkinned", 0);
    d.mesh->updateInstances(d.inst);
    d.mesh->drawInstanced();
  }
  // skinned characters
  pr.set("uSway", 0);
  pr.set("uSkinned", 1);
  for(const auto& s : gSkinned){
    glUniformMatrix4fv(pr.loc("uJoints"), anim::MAX_JOINTS, GL_FALSE, s.joints[0].e);
    std::vector<Mesh::Instance> one(1);
    one[0].xform = s.xform;
    one[0].tint  = s.tint;
    one[0].extra = 0.0f;
    s.mesh->updateInstances(one);
    s.mesh->drawInstanced();
  }
  pr.set("uSkinned", 0);
}

// ============================================================================
//  Simulation
// ============================================================================
static float terrainH(float x, float z){ return W.terr.sample(x, z); }

static void spawnCarOnEdge(Vehicle& c, int ei, bool forward, m::Rng& rng){
  const auto& e = W.edges[ei];
  c.edge = ei;
  c.targetNode = forward ? e.b : e.a;
  c.prevNode   = forward ? e.a : e.b;
  float t = rng.range(0.15f, 0.85f);
  float x = m::lerpf(e.x1, e.x2, t), z = m::lerpf(e.z1, e.z2, t);
  float ax = e.x2 - e.x1, az = e.z2 - e.z1;
  float L = std::sqrt(ax*ax + az*az); if(L < 1e-3f) L = 1.0f;
  float px = -az / L, pz = ax / L;
  float lane = e.width * 0.24f * (forward ? 1.0f : -1.0f);
  c.pos = { x + px * lane, terrainH(x, z), z + pz * lane };
  c.heading = std::atan2(forward ? ax : -ax, forward ? az : -az);
  c.speed = rng.range(6.0f, 16.0f);
  c.kind = (int)(rng.next() % 7);
  static const v3 COLS[] = {
    {0.72f,0.14f,0.12f},{0.12f,0.34f,0.66f},{0.86f,0.78f,0.20f},{0.10f,0.48f,0.24f},
    {0.42f,0.16f,0.52f},{0.82f,0.42f,0.10f},{0.88f,0.89f,0.90f},{0.14f,0.16f,0.20f},
    {0.08f,0.56f,0.50f},{0.74f,0.26f,0.06f},{0.34f,0.38f,0.44f},{0.60f,0.10f,0.14f}
  };
  c.colour = COLS[rng.next() % 12];
  c.police = (rng.f() < 0.10f);
  if(c.police){ c.colour = v3{0.92f, 0.94f, 0.96f}; c.kind = 0; }
  c.ai = true;
}

static void streamEntities(){
  v3 focus = P.inCar && P.carIndex >= 0 ? gCars[P.carIndex].pos : P.pos;
  static m::Rng rng(20260925u);

  // ---- nearby edges cache
  static std::vector<int> nearEdges;
  static v3 lastFocus{-1e9f, 0, -1e9f};
  if(m::len2(focus - lastFocus) > 200.0f * 200.0f){
    lastFocus = focus;
    nearEdges.clear();
    for(size_t i = 0; i < W.edges.size(); i++){
      const auto& e = W.edges[i];
      float mx = (e.x1 + e.x2) * 0.5f, mz = (e.z1 + e.z2) * 0.5f;
      float dx = mx - focus.x, dz = mz - focus.z;
      if(dx*dx + dz*dz < 800.0f * 800.0f) nearEdges.push_back((int)i);
    }
  }

  // ---- cars
  const int TARGET_CARS = (gQuality >= 2) ? 30 : 18;
  for(int i = (int)gCars.size() - 1; i >= 0; i--){
    if(P.inCar && i == P.carIndex) continue;
    float dx = gCars[i].pos.x - focus.x, dz = gCars[i].pos.z - focus.z;
    if(dx*dx + dz*dz > 1100.0f * 1100.0f){
      if(P.carIndex > i) P.carIndex--;
      gCars.erase(gCars.begin() + i);
    }
  }
  int guard = 0;
  while((int)gCars.size() < TARGET_CARS && !nearEdges.empty() && guard++ < 40){
    int ei = nearEdges[rng.next() % nearEdges.size()];
    const auto& e = W.edges[ei];
    float mx = (e.x1 + e.x2) * 0.5f, mz = (e.z1 + e.z2) * 0.5f;
    float dx = mx - focus.x, dz = mz - focus.z;
    float d = std::sqrt(dx*dx + dz*dz);
    if(d < 120.0f || d > 800.0f) continue;
    if(e.zone > 2 && rng.f() < 0.6f) continue;
    Vehicle c;
    spawnCarOnEdge(c, ei, rng.f() < 0.5f, rng);
    gCars.push_back(c);
  }

  // ---- parked cars: traffic spawns 120 m+ away, so without these there is
  // frequently no vehicle within reach of the player at all
  {
    int parked = 0;
    for(const auto& c : gCars) if(!c.ai && !c.playerDriven) parked++;
    int guardP = 0;
    while(parked < 6 && !nearEdges.empty() && guardP++ < 60){
      int ei = nearEdges[rng.next() % nearEdges.size()];
      const auto& e = W.edges[ei];
      if(e.zone > 2 || e.bridge) continue;
      float t = rng.range(0.15f, 0.85f);
      float x = m::lerpf(e.x1, e.x2, t), z = m::lerpf(e.z1, e.z2, t);
      float ax = e.x2 - e.x1, az = e.z2 - e.z1;
      float L = std::sqrt(ax*ax + az*az); if(L < 1e-3f) continue;
      float px = -az / L, pz = ax / L;
      float side = rng.f() < 0.5f ? 1.0f : -1.0f;
      float cx = x + px * (e.width * 0.42f) * side;
      float cz = z + pz * (e.width * 0.42f) * side;
      float d = std::sqrt((cx-focus.x)*(cx-focus.x) + (cz-focus.z)*(cz-focus.z));
      if(d < 10.0f || d > 42.0f) continue;      // close enough to actually walk to
      if(W.terr.isWater(cx, cz)) continue;
      Vehicle c;
      spawnCarOnEdge(c, ei, side > 0, rng);
      c.pos = v3{ cx, terrainH(cx, cz), cz };
      c.speed = 0.0f;
      c.ai = false;                              // parked: not driven by traffic AI
      c.police = false;
      gCars.push_back(c);
      parked++;
    }
  }

  // ---- pedestrians
  const int TARGET_PEDS = (gQuality >= 2) ? 26 : 14;
  for(int i = (int)gPeds.size() - 1; i >= 0; i--){
    float dx = gPeds[i].pos.x - focus.x, dz = gPeds[i].pos.z - focus.z;
    if(dx*dx + dz*dz > 420.0f * 420.0f) gPeds.erase(gPeds.begin() + i);
  }
  guard = 0;
  while((int)gPeds.size() < TARGET_PEDS && !nearEdges.empty() && guard++ < 50){
    int ei = nearEdges[rng.next() % nearEdges.size()];
    const auto& e = W.edges[ei];
    if(e.zone > 2) continue;
    float t = rng.range(0.1f, 0.9f);
    float x = m::lerpf(e.x1, e.x2, t), z = m::lerpf(e.z1, e.z2, t);
    float ax = e.x2 - e.x1, az = e.z2 - e.z1;
    float L = std::sqrt(ax*ax + az*az); if(L < 1e-3f) continue;
    float px = -az / L, pz = ax / L;
    float side = rng.f() < 0.5f ? 1.0f : -1.0f;
    float sx = x + px * (e.width * 0.5f + 2.6f) * side;
    float sz = z + pz * (e.width * 0.5f + 2.6f) * side;
    float d = std::sqrt((sx - focus.x)*(sx - focus.x) + (sz - focus.z)*(sz - focus.z));
    if(d < 45.0f || d > 380.0f) continue;
    if(W.terr.isWater(sx, sz)) continue;
    Ped p;
    p.pos = { sx, terrainH(sx, sz), sz };
    p.heading = std::atan2(ax / L * side, az / L * side);
    p.speed = rng.range(1.1f, 1.8f);
    static const v3 SHIRTS[] = {
      {0.78f,0.24f,0.24f},{0.22f,0.42f,0.76f},{0.84f,0.72f,0.24f},{0.24f,0.66f,0.44f},
      {0.58f,0.32f,0.72f},{0.84f,0.48f,0.20f},{0.88f,0.88f,0.90f},{0.24f,0.28f,0.34f}
    };
    static const v3 SKINS[] = {
      {0.94f,0.78f,0.62f},{0.85f,0.66f,0.46f},{0.69f,0.49f,0.31f},
      {0.52f,0.34f,0.20f},{0.36f,0.23f,0.14f},{0.97f,0.84f,0.72f}
    };
    static const v3 PANTS[] = {
      {0.18f,0.22f,0.30f},{0.22f,0.22f,0.24f},{0.28f,0.23f,0.17f},{0.16f,0.26f,0.20f}
    };
    p.look.shirt = SHIRTS[rng.next() % 8];
    p.look.skin  = SKINS[rng.next() % 6];
    p.look.pants = PANTS[rng.next() % 4];
    p.animator.play(anim::CLIP_WALK, 0.01f);
    gPeds.push_back(p);
  }
}

static void updateVehicle(Vehicle& c, float dt){
  if(c.edge < 0 || c.targetNode < 0) return;
  const auto& tn = W.nodes[c.targetNode];

  float toA = std::atan2(tn.x - c.pos.x, tn.z - c.pos.z);
  c.heading = m::angLerp(c.heading, toA, 1.0f - std::pow(0.0006f, dt));

  float want = 15.0f;
  // slow for the car in front
  for(const auto& o : gCars){
    if(&o == &c) continue;
    float dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z;
    float fwd = dx * std::sin(c.heading) + dz * std::cos(c.heading);
    float side = std::fabs(dx * std::cos(c.heading) - dz * std::sin(c.heading));
    if(fwd > 0.0f && fwd < 22.0f && side < 3.2f) want = std::min(want, std::max(0.0f, o.speed - 1.5f));
  }
  // red light ahead
  float dTo = std::sqrt((tn.x - c.pos.x)*(tn.x - c.pos.x) + (tn.z - c.pos.z)*(tn.z - c.pos.z));
  if(tn.light && dTo < 38.0f && dTo > 11.0f){
    bool nsGreen = std::sin(tn.lightPhase) > 0.0f;
    bool goingNS = std::fabs(std::cos(c.heading)) > std::fabs(std::sin(c.heading));
    if(nsGreen != goingNS) want = 0.0f;
  }
  // don't run the player over
  if(!P.inCar){
    float dx = P.pos.x - c.pos.x, dz = P.pos.z - c.pos.z;
    float fwd = dx * std::sin(c.heading) + dz * std::cos(c.heading);
    float side = std::fabs(dx * std::cos(c.heading) - dz * std::sin(c.heading));
    if(fwd > 0.0f && fwd < 16.0f && side < 2.8f) want = 0.0f;
  }

  float accel = (c.speed < want) ? 7.0f : -13.0f;
  c.speed = m::clampf(c.speed + accel * dt, 0.0f, 26.0f);

  c.pos.x += std::sin(c.heading) * c.speed * dt;
  c.pos.z += std::cos(c.heading) * c.speed * dt;
  c.pos.y = m::lerpf(c.pos.y, terrainH(c.pos.x, c.pos.z), 1.0f - std::pow(0.001f, dt));

  int nSpecs = 0; const models::CarSpec* specs = models::carSpecs(nSpecs);
  float wr = specs[c.kind % nSpecs].wheelR;
  c.wheelSpin += (c.speed / std::max(wr, 0.1f)) * dt;
  c.steer = m::clampf(m::angDelta(c.heading, toA) * 1.6f, -0.52f, 0.52f);
  // suspension settles toward the terrain slope under each corner
  for(int i = 0; i < 4; i++) c.suspension[i] = m::lerpf(c.suspension[i], 0.0f, dt * 6.0f);
  c.bodyRoll  = m::lerpf(c.bodyRoll, -c.steer * m::clampf(c.speed / 20.0f, 0, 1) * 0.16f, dt * 5.0f);
  c.bodyPitch = m::lerpf(c.bodyPitch, -accel * 0.004f, dt * 5.0f);

  if(dTo < 12.0f){
    // choose the next edge, preferring to keep going straight
    std::vector<int> opts;
    for(int ei : tn.edges){
      const auto& e = W.edges[ei];
      int other = (e.a == c.targetNode) ? e.b : e.a;
      if(other != c.prevNode) opts.push_back(ei);
    }
    if(opts.empty()) opts = tn.edges;
    if(opts.empty()) return;
    int best = opts[0]; float bestScore = -1e9f;
    for(int ei : opts){
      const auto& e = W.edges[ei];
      int other = (e.a == c.targetNode) ? e.b : e.a;
      const auto& on = W.nodes[other];
      float ang = std::atan2(on.x - tn.x, on.z - tn.z);
      float d = std::fabs(m::angDelta(c.heading, ang));
      float score = -d + (e.highway ? 0.4f : 0.0f) + m::hash2((int)(gTime * 13.0f) + ei, ei) * 0.5f;
      if(score > bestScore){ bestScore = score; best = ei; }
    }
    const auto& e = W.edges[best];
    c.prevNode = c.targetNode;
    c.targetNode = (e.a == c.prevNode) ? e.b : e.a;
    c.edge = best;
  }
}

static void updatePed(Ped& p, float dt){
  p.wanderT -= dt;
  if(p.wanderT <= 0.0f){
    p.wanderT = 1.4f + m::hash2((int)(p.pos.x), (int)(p.pos.z + gTime)) * 3.0f;
    p.heading += (m::hash2((int)(p.pos.z * 3.0f), (int)(gTime * 7.0f)) - 0.5f) * 1.1f;
  }
  float nx = p.pos.x + std::sin(p.heading) * p.speed * dt;
  float nz = p.pos.z + std::cos(p.heading) * p.speed * dt;
  if(W.terr.isWater(nx, nz)){ p.heading += 2.2f; }
  else { p.pos.x = nx; p.pos.z = nz; }
  p.pos.y = m::lerpf(p.pos.y, terrainH(p.pos.x, p.pos.z), 1.0f - std::pow(0.002f, dt));
  p.animator.driveFromSpeed(p.speed, false);
  p.animator.update(dt);
}

// Which species belong in which biome, so a bear never spawns on a beach.
static int pickSpecies(world::Biome b, m::Rng& rng){
  int pool[8]; int n = 0;
  switch(b){
    case world::B_FOREST:
      pool[n++]=models::SP_DEER;  pool[n++]=models::SP_DEER;
      pool[n++]=models::SP_WOLF;  pool[n++]=models::SP_BEAR;
      pool[n++]=models::SP_BOAR;  pool[n++]=models::SP_FOX;
      pool[n++]=models::SP_ELK;   break;
    case world::B_MOUNTAIN:
      pool[n++]=models::SP_BIGHORN; pool[n++]=models::SP_BIGHORN;
      pool[n++]=models::SP_ELK;     pool[n++]=models::SP_WOLF;
      pool[n++]=models::SP_BEAR;    break;
    case world::B_SAND:
      pool[n++]=models::SP_FOX; pool[n++]=models::SP_RABBIT; break;
    default:
      pool[n++]=models::SP_DEER;   pool[n++]=models::SP_RABBIT;
      pool[n++]=models::SP_RABBIT; pool[n++]=models::SP_FOX;
      pool[n++]=models::SP_BOAR;   pool[n++]=models::SP_ELK;  break;
  }
  return pool[rng.next() % (uint32_t)n];
}

// Only grazers put their heads down. Predators prowl instead.
static bool isGrazer(int sp){
  return sp == models::SP_DEER || sp == models::SP_ELK
      || sp == models::SP_RABBIT || sp == models::SP_BIGHORN
      || sp == models::SP_BOAR;
}

static void streamWildlife(float dt){
  (void)dt;
  if(gFreezeAnimals) return;        // hold the roster still for inspection
  v3 focus = P.inCar && P.carIndex >= 0 ? gCars[P.carIndex].pos : P.pos;
  static m::Rng rng(90210u);

  const int TARGET = (gQuality >= 2) ? 16 : 9;
  for(int i = (int)gAnimals.size() - 1; i >= 0; i--){
    float dx = gAnimals[i].pos.x - focus.x, dz = gAnimals[i].pos.z - focus.z;
    if(dx*dx + dz*dz > 520.0f * 520.0f) gAnimals.erase(gAnimals.begin() + i);
  }
  int guard = 0;
  while((int)gAnimals.size() < TARGET && guard++ < 50){
    float ang = rng.f() * m::TAU, d = rng.range(120.0f, 420.0f);
    float x = focus.x + std::cos(ang) * d, z = focus.z + std::sin(ang) * d;
    if(x < 60 || z < 60 || x > world::SIZE - 60 || z > world::SIZE - 60) continue;
    world::Biome b = W.terr.sampleBiome(x, z);
    if(b == world::B_WATER || world::World::isUrbanB((uint8_t)b)) continue;
    Animal a;
    a.pos = v3{ x, terrainH(x, z), z };
    a.heading = rng.f() * m::TAU;
    a.species = pickSpecies(b, rng);
    a.wanderT = rng.range(1.5f, 5.0f);
    a.graze   = rng.range(2.0f, 9.0f);
    a.grazing = isGrazer(a.species) && rng.f() < 0.55f;
    anim::driveQuad(a.animator, 0.0f, false, a.grazing);
    gAnimals.push_back(a);
  }

  // birds circle overhead, more of them out in the wild
  const int BIRDS = (gQuality >= 2) ? 7 : 3;
  for(int i = (int)gBirds.size() - 1; i >= 0; i--){
    float dx = gBirds[i].pos.x - focus.x, dz = gBirds[i].pos.z - focus.z;
    if(dx*dx + dz*dz > 460.0f * 460.0f) gBirds.erase(gBirds.begin() + i);
  }
  guard = 0;
  while((int)gBirds.size() < BIRDS && guard++ < 30){
    float ang = rng.f() * m::TAU, d = rng.range(60.0f, 260.0f);
    float x = focus.x + std::cos(ang) * d, z = focus.z + std::sin(ang) * d;
    if(x < 60 || z < 60 || x > world::SIZE - 60 || z > world::SIZE - 60) continue;
    Bird bd;
    bd.radius = rng.range(22.0f, 70.0f);
    bd.angle  = rng.f() * m::TAU;
    bd.height = rng.range(16.0f, 52.0f);
    bd.pos = v3{ x, terrainH(x, z) + bd.height, z };
    bd.animator.bank = anim::birdLibrary().clips;
    bd.animator.play(anim::BCLIP_FLAP, 0.01f);
    gBirds.push_back(bd);
  }
}

static void updateAnimal(Animal& a, float dt){
  v3 focus = P.inCar && P.carIndex >= 0 ? gCars[P.carIndex].pos : P.pos;
  float dx = a.pos.x - focus.x, dz = a.pos.z - focus.z;
  float distToPlayer = std::sqrt(dx*dx + dz*dz);

  // animals flee further from a moving car than from someone on foot
  float spookRange = P.inCar ? 46.0f : 26.0f;
  if(distToPlayer < spookRange){
    a.fleeT = 3.4f;
    a.heading = m::angLerp(a.heading, std::atan2(dx, dz), 1.0f - std::pow(0.004f, dt));
  }
  if(a.fleeT > 0.0f) a.fleeT -= dt;

  const models::QuadSpec& S = models::speciesTable()[a.species % models::SP_COUNT];
  float topSpeed = 9.5f * m::clampf(S.scale, 0.45f, 1.4f);

  if(a.fleeT > 0.0f){
    a.grazing = false;
    a.spooked = true;
    a.speed = m::lerpf(a.speed, topSpeed, dt * 2.6f);
  } else {
    a.spooked = distToPlayer < spookRange * 2.0f;
    a.graze -= dt;
    if(a.graze <= 0.0f){
      a.grazing = isGrazer(a.species) ? !a.grazing : false;
      a.graze = a.grazing ? m::rr_(3.0f, 10.0f) : m::rr_(2.0f, 7.0f);
    }
    float roam = isGrazer(a.species) ? 1.05f : 1.45f;
    float want = a.grazing ? 0.0f : roam * m::clampf(S.scale, 0.5f, 1.3f);
    a.speed = m::lerpf(a.speed, want, dt * 1.8f);
    a.wanderT -= dt;
    if(a.wanderT <= 0.0f){
      a.wanderT = m::rr_(1.6f, 5.5f);
      a.heading += m::rr_(-1.0f, 1.0f);
    }
  }

  float nx = a.pos.x + std::sin(a.heading) * a.speed * dt;
  float nz = a.pos.z + std::cos(a.heading) * a.speed * dt;
  world::Biome nb = W.terr.sampleBiome(nx, nz);
  if(nb == world::B_WATER || world::World::isUrbanB((uint8_t)nb)
     || nx < 40 || nz < 40 || nx > world::SIZE - 40 || nz > world::SIZE - 40){
    a.heading += 2.3f;                       // turn away from water and town
  } else {
    a.pos.x = nx; a.pos.z = nz;
  }
  a.pos.y = m::lerpf(a.pos.y, terrainH(a.pos.x, a.pos.z), 1.0f - std::pow(0.0005f, dt));

  anim::driveQuad(a.animator, a.speed, a.spooked, a.grazing);
  a.animator.update(dt);
}

static void updateBird(Bird& b, float dt){
  b.angle += dt * (1.15f / std::max(b.radius, 6.0f)) * 9.0f;
  float cx = b.pos.x - std::sin(b.heading) * 0.0f;
  (void)cx;
  // orbit a drifting centre
  b.pos.x += std::cos(b.angle) * b.radius * dt * 0.10f;
  b.pos.z -= std::sin(b.angle) * b.radius * dt * 0.10f;
  b.heading = std::atan2(std::cos(b.angle), -std::sin(b.angle));
  float ground = terrainH(b.pos.x, b.pos.z);
  b.pos.y = m::lerpf(b.pos.y, ground + b.height, dt * 0.8f);
  // flap in bursts, glide between them
  b.flap -= dt;
  if(b.flap <= 0.0f){
    bool flapping = b.animator.cur == anim::BCLIP_FLAP;
    b.animator.play(flapping ? anim::BCLIP_GLIDE : anim::BCLIP_FLAP, 0.20f);
    b.flap = flapping ? m::rr_(1.2f, 2.8f) : m::rr_(0.8f, 1.8f);
  }
  b.animator.update(dt);
}

static void updatePlayer(float dt){
  // ---- camera orbit
  float lookSpeed = 2.6f;
  if(key(74)) cam.yaw   -= lookSpeed * dt;            // J
  if(key(76)) cam.yaw   += lookSpeed * dt;            // L
  if(key(73)) cam.pitch += lookSpeed * 0.6f * dt;     // I
  if(key(75)) cam.pitch -= lookSpeed * 0.6f * dt;     // K
  cam.yaw   += mouseDX * 0.0032f;
  cam.pitch -= mouseDY * 0.0028f;
  mouseDX = mouseDY = 0.0f;
  cam.pitch = m::clampf(cam.pitch, -1.15f, 0.62f);

  if(P.inCar && P.carIndex >= 0 && P.carIndex < (int)gCars.size()){
    Vehicle& c = gCars[P.carIndex];
    int nSpecs = 0; const models::CarSpec* specs = models::carSpecs(nSpecs);
    const models::CarSpec& S = specs[c.kind % nSpecs];

    float throttle = (moveFwd() ? 1.0f : 0.0f) - (moveBack() ? 1.0f : 0.0f);
    float steerIn  = (moveRight() ? 1.0f : 0.0f) - (moveLeft() ? 1.0f : 0.0f);
    bool  brake    = key(32);                        // Space

    float topSpeed = 42.0f + c.kind * 1.5f;
    if(throttle > 0) c.speed += 15.0f * dt;
    else if(throttle < 0) c.speed -= 14.0f * dt;
    else c.speed *= std::pow(0.55f, dt);
    if(brake) c.speed *= std::pow(0.02f, dt);
    c.speed = m::clampf(c.speed, -topSpeed * 0.35f, topSpeed);

    float steerRate = 1.5f * m::clampf(std::fabs(c.speed) / 12.0f, 0.0f, 1.3f) * (c.speed < -0.5f ? -1.0f : 1.0f);
    c.heading += steerIn * steerRate * dt;
    c.steer = m::lerpf(c.steer, steerIn * 0.52f, dt * 8.0f);

    float nx = c.pos.x + std::sin(c.heading) * c.speed * dt;
    float nz = c.pos.z + std::cos(c.heading) * c.speed * dt;
    if(W.terr.isWater(nx, nz)) c.speed *= -0.25f;
    else { c.pos.x = nx; c.pos.z = nz; }
    c.pos.x = m::clampf(c.pos.x, 20.0f, world::SIZE - 20.0f);
    c.pos.z = m::clampf(c.pos.z, 20.0f, world::SIZE - 20.0f);

    // ride the terrain, with per-corner suspension from the local slope
    float base = terrainH(c.pos.x, c.pos.z);
    c.pos.y = m::lerpf(c.pos.y, base, 1.0f - std::pow(0.0004f, dt));
    v3 fwd{ std::sin(c.heading), 0, std::cos(c.heading) };
    v3 rgt{ fwd.z, 0, -fwd.x };
    const float xo = S.wid * 0.5f;
    const float zoff[4] = { S.axleFront, S.axleFront, S.axleRear, S.axleRear };
    const float xsn[4]  = { 1.0f, -1.0f, 1.0f, -1.0f };
    for(int i = 0; i < 4; i++){
      v3 wp = c.pos + fwd * zoff[i] + rgt * (xo * xsn[i]);
      float target = m::clampf(terrainH(wp.x, wp.z) - c.pos.y, -0.35f, 0.35f);
      c.suspension[i] = m::lerpf(c.suspension[i], target, dt * 9.0f);
    }
    c.bodyRoll  = m::lerpf(c.bodyRoll, -c.steer * m::clampf(std::fabs(c.speed) / 26.0f, 0, 1) * 0.30f, dt * 6.0f);
    c.bodyPitch = m::lerpf(c.bodyPitch, -throttle * 0.035f, dt * 6.0f);
    c.wheelSpin += (c.speed / std::max(S.wheelR, 0.1f)) * dt;
    c.playerDriven = true;

    P.pos = c.pos;
    P.heading = c.heading;
    P.animator.driveFromSpeed(0.0f, true);
    P.animator.update(dt);

    cam.dist = m::lerpf(cam.dist, 9.5f + std::fabs(c.speed) * 0.10f, dt * 3.0f);
    cam.buildMatrices(c.pos + v3{0, 2.0f, 0});
  } else {
    // ---- on foot: move relative to where the camera is looking
    float mx = (moveRight() ? 1.0f : 0.0f) - (moveLeft() ? 1.0f : 0.0f);
    float mz = (moveFwd() ? 1.0f : 0.0f) - (moveBack() ? 1.0f : 0.0f);
    float mag = std::sqrt(mx*mx + mz*mz);
    float targetSpeed = 0.0f;
    if(mag > 0.01f){
      mx /= mag; mz /= mag;
      v3 fwd{ std::sin(cam.yaw), 0, std::cos(cam.yaw) };
      v3 rgt{ fwd.z, 0, -fwd.x };
      v3 dir = m::norm(fwd * mz + rgt * mx);
      float want = sprintKey() ? 8.2f : 3.1f;
      targetSpeed = want;
      P.heading = m::angLerp(P.heading, std::atan2(dir.x, dir.z), 1.0f - std::pow(0.00008f, dt));
      P.vel = m::lerp(P.vel, dir * want, 1.0f - std::pow(0.0001f, dt));
    } else {
      P.vel = m::lerp(P.vel, v3{0,0,0}, 1.0f - std::pow(0.000001f, dt));
    }
    v3 np = P.pos + P.vel * dt;
    if(!W.terr.isWater(np.x, np.z)){
      P.pos.x = m::clampf(np.x, 20.0f, world::SIZE - 20.0f);
      P.pos.z = m::clampf(np.z, 20.0f, world::SIZE - 20.0f);
    } else {
      P.vel = v3{0,0,0};
    }
    P.pos.y = m::lerpf(P.pos.y, terrainH(P.pos.x, P.pos.z), 1.0f - std::pow(0.0001f, dt));
    P.speed = m::len(v3{P.vel.x, 0, P.vel.z});
    (void)targetSpeed;
    P.animator.driveFromSpeed(P.speed, false);
    P.animator.update(dt);

    cam.dist = m::lerpf(cam.dist, 7.0f, dt * 3.0f);
    cam.buildMatrices(P.pos + v3{0, 1.55f, 0});
  }
}

// Toggle in/out of the nearest car.
static void toggleCar(){
  if(P.inCar){
    if(P.carIndex >= 0 && P.carIndex < (int)gCars.size()){
      Vehicle& c = gCars[P.carIndex];
      c.playerDriven = false;
      c.ai = true;
      c.speed = 0.0f;
      v3 rgt{ std::cos(c.heading), 0, -std::sin(c.heading) };
      v3 out = c.pos + rgt * 2.4f;
      if(!W.terr.isWater(out.x, out.z)) P.pos = v3{ out.x, terrainH(out.x, out.z), out.z };
      else P.pos = v3{ c.pos.x, terrainH(c.pos.x, c.pos.z), c.pos.z };
      P.heading = c.heading;
    }
    P.inCar = false;
    P.carIndex = -1;
    return;
  }
  int best = -1; float bd = 9.0f * 9.0f;
  for(size_t i = 0; i < gCars.size(); i++){
    float dx = gCars[i].pos.x - P.pos.x, dz = gCars[i].pos.z - P.pos.z;
    float d2 = dx*dx + dz*dz;
    if(d2 < bd){ bd = d2; best = (int)i; }
  }
  if(best >= 0){
    P.inCar = true;
    P.carIndex = best;
    gCars[best].ai = false;
  }
}

// ============================================================================
//  HUD (DOM overlay — updated from C++)
// ============================================================================
static void updateHUD(float fps){
  v3 pos = P.inCar && P.carIndex >= 0 ? gCars[P.carIndex].pos : P.pos;
  float speedKmh = 0.0f;
  const char* vehName = "";
  if(P.inCar && P.carIndex >= 0){
    speedKmh = std::fabs(gCars[P.carIndex].speed) * 3.6f;
    int n = 0; const models::CarSpec* s = models::carSpecs(n);
    vehName = s[gCars[P.carIndex].kind % n].name;
  }
  int hh = (int)gClock;
  int mm = (int)((gClock - hh) * 60.0f);
  const char* district = "WILDERNESS";
  float bestD = 1e18f;
  for(const auto& d : W.districts){
    float dx = d.wx - pos.x, dz = d.wz - pos.z;
    float dd = dx*dx + dz*dz;
    if(dd < bestD && dd < 2600.0f * 2600.0f){ bestD = dd; district = d.name; }
  }

  static char fpsBuf[64], speedBuf[64], clockBuf[32];
  snprintf(fpsBuf, sizeof(fpsBuf), "%d fps · %d×%d", (int)(fps + 0.5f), gRW, gRH);
  if(speedKmh > 0.5f) snprintf(speedBuf, sizeof(speedBuf), "%d km/h · %s", (int)(speedKmh + 0.5f), vehName);
  else                snprintf(speedBuf, sizeof(speedBuf), "on foot");
  snprintf(clockBuf, sizeof(clockBuf), "%02d:%02d", hh, mm);

  EM_ASM({
    var set = function(id, txt){ var e = document.getElementById(id); if(e) e.textContent = txt; };
    set('h_fps',   UTF8ToString($0));
    set('h_speed', UTF8ToString($1));
    set('h_clock', UTF8ToString($2));
    set('h_place', UTF8ToString($3));
  }, fpsBuf, speedBuf, clockBuf, district);
}

// ============================================================================
//  Frame
// ============================================================================
static double lastT = 0.0;
static float  gLastDt = 0.0f;
static float  gRealDt = 0.0f;
static float  fpsAccum = 0.0f;
static int    fpsFrames = 0;
static float  fpsShown = 60.0f;

static void renderFrame(){
  SunState sun = sunState();
  v3 focus = P.inCar && P.carIndex >= 0 ? gCars[P.carIndex].pos : P.pos;

  gDbgChunksDrawn = 0; gDbgRoadTilesDrawn = 0;
  gatherScene(sun);
  gatherSkinned();

  // ---------------- shadow cascades
  glEnable(GL_DEPTH_TEST);
  glDepthFunc(GL_LEQUAL);
  glDisable(GL_BLEND);
  glEnable(GL_CULL_FACE);
  glCullFace(GL_BACK);

  progShadow.use();
  progShadow.set("uTime", gTime);
  for(int i = 0; i < 3; i++){
    computeCascade(i, sun.dir, focus);
    shadow[i].bind();
    glClear(GL_DEPTH_BUFFER_BIT);
    if(sun.night > 0.94f || !gShadowsOn) continue;   // no sun, no shadows
    progShadow.set("uLightVP", gLightVP[i]);
    progShadow.set("uSkinned", 0);
    progShadow.set("uSway", 0);
    // terrain casts too, so mountains and hills shade the valleys
    if(i == 0) drawTerrainAndRoads(progShadow, focus, true);
    for(const auto& d : gDraws){
      // small scenery only casts into the nearest cascade — the far cascades
      // cover 1.4 km and would be re-submitting tens of thousands of trees
      if(i > 0 && d.smallCaster) continue;
      progShadow.set("uSway", d.sway ? 1 : 0);
      d.mesh->updateInstances(d.inst);
      d.mesh->drawInstanced();
    }
    progShadow.set("uSway", 0);
    if(i == 0){
      progShadow.set("uSkinned", 1);
      for(const auto& s : gSkinned){
        glUniformMatrix4fv(progShadow.loc("uJoints"), anim::MAX_JOINTS, GL_FALSE, s.joints[0].e);
        std::vector<Mesh::Instance> one(1);
        one[0].xform = s.xform;
        s.mesh->updateInstances(one);
        s.mesh->drawInstanced();
      }
      progShadow.set("uSkinned", 0);
    }
  }

  // ---------------- HDR scene
  rtScene.bind();
  glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

  // sky first, at the far plane, depth-write off
  glDepthMask(GL_FALSE);
  glDisable(GL_CULL_FACE);
  progSky.use();
  {
    m4 invVP = m::inverse(cam.viewProj);
    progSky.set("uInvViewProj", invVP);
    progSky.set("uSunDir", sun.dir);
    progSky.set("uNightFactor", sun.night);
    progSky.set("uExposure", 1.0f);
    progSky.set("uTime", gTime);
    fsq.draw();
  }
  glDepthMask(GL_TRUE);
  glEnable(GL_CULL_FACE);

  // opaque world
  progMain.use();
  setCommonUniforms(progMain, sun);
  drawTerrainAndRoads(progMain, focus, false);
  drawSceneGeometry(progMain, false);

  // water last among opaques (it's opaque here, just shaded like water)
  progWater.use();
  progWater.set("uViewProj", cam.viewProj);
  progWater.set("uCamPos", cam.pos);
  progWater.set("uSunDir", sun.dir);
  progWater.set("uSunColour", sun.colour);
  progWater.set("uSkyColour", sun.sky);
  progWater.set("uFogColour", sun.fog);
  progWater.set("uFogDensity", FOG_DENSITY);
  progWater.set("uNightFactor", sun.night);
  progWater.set("uExposure", 1.0f);
  progWater.set("uTime", gTime);
  {
    // the grid is authored around the origin; shift it under the camera
    glBindVertexArray(waterVAO);
    // encode the offset by translating positions in the shader via uCamPos? simpler:
    // we translate with a uniform-free trick — rebuild is costly, so use a model matrix
    // through uViewProj premultiplied by a translation.
    m4 shift = m4::translate(v3{ std::floor(cam.pos.x / 40.0f) * 40.0f, 0.0f,
                                 std::floor(cam.pos.z / 40.0f) * 40.0f });
    progWater.set("uViewProj", cam.viewProj * shift);
    glDrawElements(GL_TRIANGLES, waterIndexCount, GL_UNSIGNED_INT, nullptr);
  }

  // ---------------- bloom
  glDisable(GL_DEPTH_TEST);
  glDisable(GL_CULL_FACE);
  rtBloomA.bind();
  glClear(GL_COLOR_BUFFER_BIT);
  progBright.use();
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_2D, rtScene.colour);
  progBright.set("uSrc", 0);
  progBright.set("uThreshold", 1.05f);
  progBright.set("uKnee", 0.55f);
  fsq.draw();

  int blurPasses = (gQuality >= 2) ? 3 : 2;
  progBlur.use();
  for(int i = 0; i < blurPasses; i++){
    rtBloomB.bind();
    glClear(GL_COLOR_BUFFER_BIT);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, rtBloomA.colour);
    progBlur.set("uSrc", 0);
    progBlur.set("uDir", m::v2{ 1.0f / rtBloomA.w, 0.0f });
    fsq.draw();

    rtBloomA.bind();
    glClear(GL_COLOR_BUFFER_BIT);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, rtBloomB.colour);
    progBlur.set("uSrc", 0);
    progBlur.set("uDir", m::v2{ 0.0f, 1.0f / rtBloomA.h });
    fsq.draw();
  }

  // ---------------- composite to the screen
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  glViewport(0, 0, gW, gH);
  glClear(GL_COLOR_BUFFER_BIT);
  progComp.use();
  glActiveTexture(GL_TEXTURE0); glBindTexture(GL_TEXTURE_2D, rtScene.colour);
  glActiveTexture(GL_TEXTURE1); glBindTexture(GL_TEXTURE_2D, rtBloomA.colour);
  progComp.set("uScene", 0);
  progComp.set("uBloom", 1);
  progComp.set("uTexel", m::v2{ 1.0f / gRW, 1.0f / gRH });
  progComp.set("uBloomStrength", 0.62f);
  progComp.set("uVignette", 0.30f);
  progComp.set("uChromatic", gQuality >= 2 ? 0.0022f : 0.0f);
  progComp.set("uFXAA", gFXAA ? 1 : 0);
  glActiveTexture(GL_TEXTURE2);
  glBindTexture(GL_TEXTURE_2D, shadow[gDbgShadowIdx].tex);
  progComp.set("uDbgTex", 2);
  progComp.set("uShowDbgTex", gShowShadowMap ? 1 : 0);
  fsq.draw();
}

static void mainLoop(){
  double now = emscripten_get_now() / 1000.0;
  float realDt = (float)(now - lastT);
  lastT = now;
  if(!(realDt > 0.0f)) realDt = 1.0f / 60.0f;
  float dt = realDt > 0.1f ? 0.1f : realDt;   // sim step is clamped, timing is not
  gLastDt = dt;
  gRealDt = realDt;

  gTime  += dt;
  gClock += dt * (24.0f / gDayLength);
  if(gClock >= 24.0f) gClock -= 24.0f;

  for(auto& n : W.nodes) if(n.light) n.lightPhase += dt * 0.32f;

  if(gStarted){
    streamEntities();
    for(size_t i = 0; i < gCars.size(); i++){
      if(P.inCar && (int)i == P.carIndex) continue;
      if(!gCars[i].ai) continue;                 // parked
      updateVehicle(gCars[i], dt);
    }
    for(auto& p : gPeds) updatePed(p, dt);
    streamWildlife(dt);
    if(!gFreezeAnimals) for(auto& a : gAnimals) updateAnimal(a, dt);
    else                for(auto& a : gAnimals) a.animator.update(dt);
    for(auto& b : gBirds)   updateBird(b, dt);
    updatePlayer(dt);
  } else {
    // slow orbit over the city while the player is on the title screen
    cam.yaw += dt * 0.12f;
    cam.dist = 120.0f;
    cam.pitch = -0.30f;
    v3 t{ W.districts[0].wx, W.terr.sample(W.districts[0].wx, W.districts[0].wz) + 40.0f, W.districts[0].wz };
    cam.buildMatrices(t);
    P.animator.update(dt);
  }

  if(gFreeCam){
    v3 fwd{ std::sin(gFreeYaw) * std::cos(gFreePitch), std::sin(gFreePitch),
            std::cos(gFreeYaw) * std::cos(gFreePitch) };
    cam.pos = gFreeCamPos;
    cam.view = m4::lookAt(cam.pos, cam.pos + fwd, {0, 1, 0});
    cam.proj = m4::perspective(cam.fov, (float)gRW / (float)gRH, 0.25f, 6000.0f);
    cam.viewProj = cam.proj * cam.view;
    cam.frustum.fromMatrix(cam.viewProj);
  }

  renderFrame();

  fpsAccum += realDt; fpsFrames++;
  if(fpsAccum > 0.4f){
    fpsShown = fpsFrames / fpsAccum;
    fpsAccum = 0.0f; fpsFrames = 0;
    updateHUD(fpsShown);
  }
}

// ============================================================================
//  Input callbacks
// ============================================================================
static EM_BOOL onKey(int type, const EmscriptenKeyboardEvent* e, void*){
  int code = (int)e->keyCode;
  if(code < 0 || code >= 400) return EM_FALSE;
  bool down = (type == EMSCRIPTEN_EVENT_KEYDOWN);
  if(down && !gStarted){ gStarted = true; }
  if(down && !keyDown[code]){
    if(code == 70) toggleCar();                                  // F
    if(code == 82){ gRenderScale = (gRenderScale > 1.4f) ? 1.0f : 2.0f; resizeTargets(); }  // R
    if(code == 84) gTexOn = !gTexOn;                             // T textures
    if(code == 89) gFXAA = !gFXAA;                               // Y FXAA
    if(code == 79){ gClock += 3.0f; if(gClock >= 24.0f) gClock -= 24.0f; }  // O
  }
  keyDown[code] = down;
  // swallow the keys we use so the page doesn't scroll
  if(code == 32 || (code >= 37 && code <= 40) || code == 9) return EM_TRUE;
  return EM_FALSE;
}

static EM_BOOL onMouseMove(int, const EmscriptenMouseEvent* e, void*){
  if(mouseCaptured){
    mouseDX += (float)e->movementX;
    mouseDY += (float)e->movementY;
  }
  return EM_FALSE;
}
static EM_BOOL onMouseDown(int, const EmscriptenMouseEvent*, void*){
  if(!gStarted){ gStarted = true; }
  if(!mouseCaptured){ emscripten_request_pointerlock("#canvas", 1); }
  return EM_FALSE;
}
static EM_BOOL onPointerLock(int, const EmscriptenPointerlockChangeEvent* e, void*){
  mouseCaptured = e->isActive;
  return EM_FALSE;
}
static EM_BOOL onResize(int, const EmscriptenUiEvent*, void*){
  double cw, chh;
  emscripten_get_element_css_size("#canvas", &cw, &chh);
  gW = std::max(320, (int)cw);
  gH = std::max(240, (int)chh);
  emscripten_set_canvas_element_size("#canvas", gW, gH);
  resizeTargets();
  return EM_FALSE;
}

// Touch: drag to look, and the on-page buttons drive the movement keys.
static float touchLastX = 0, touchLastY = 0;
static bool  touching = false;
static EM_BOOL onTouch(int type, const EmscriptenTouchEvent* e, void*){
  if(!gStarted){ gStarted = true; return EM_TRUE; }
  if(e->numTouches < 1) return EM_FALSE;
  const auto& t = e->touches[0];
  if(type == EMSCRIPTEN_EVENT_TOUCHSTART){
    touching = true; touchLastX = (float)t.targetX; touchLastY = (float)t.targetY;
  } else if(type == EMSCRIPTEN_EVENT_TOUCHMOVE && touching){
    mouseDX += ((float)t.targetX - touchLastX) * 1.5f;
    mouseDY += ((float)t.targetY - touchLastY) * 1.5f;
    touchLastX = (float)t.targetX; touchLastY = (float)t.targetY;
  } else {
    touching = false;
  }
  return EM_TRUE;
}

// Exported so the HTML buttons can drive movement on touch devices.
extern "C" {
  EMSCRIPTEN_KEEPALIVE void setKey(int code, int down){
    if(code >= 0 && code < 400) keyDown[code] = down != 0;
    if(down) gStarted = true;
  }
  EMSCRIPTEN_KEEPALIVE void actionEnterCar(){ gStarted = true; toggleCar(); }
  EMSCRIPTEN_KEEPALIVE void startGame(){ gStarted = true; }
  EMSCRIPTEN_KEEPALIVE int  setTextureRes(int px){
    if(px < 256) px = 256;
    if(px > 8192) px = 8192;
    gTexRes = px;
    gMaterials.generate(gTexRes, progGen, fsq);
    return gMaterials.size;               // what we actually got
  }
  EMSCRIPTEN_KEEPALIVE int   getTextureRes(){ return gMaterials.size; }
  EMSCRIPTEN_KEEPALIVE float getTextureMB(){ return (float)texgen::MaterialArray::megabytes(gMaterials.size); }
  EMSCRIPTEN_KEEPALIVE float getTextureBudgetMB(){ return (float)texgen::MaterialArray::budgetMB(); }
  EMSCRIPTEN_KEEPALIVE int   getSafeTextureRes(int want){
    return texgen::MaterialArray::largestWithinBudget(want);
  }
  EMSCRIPTEN_KEEPALIVE int   getMaxTextureSize(){
    GLint m = 0; glGetIntegerv(GL_MAX_TEXTURE_SIZE, &m); return (int)m;
  }
  EMSCRIPTEN_KEEPALIVE void  setTextures(int on){ gTexOn = on != 0; }
  EMSCRIPTEN_KEEPALIVE void  setTriplanar(int on){ gTriplanar = on != 0; }
  EMSCRIPTEN_KEEPALIVE void  setTexScale(float m){ gTexScale = m < 0.2f ? 0.2f : m; }
  EMSCRIPTEN_KEEPALIVE void setRenderScale(float s){
    gRenderScale = m::clampf(s, 0.5f, 2.0f);
    resizeTargets();
  }
  EMSCRIPTEN_KEEPALIVE void setQuality(int q){
    gQuality = q;
    gFXAA = q >= 1;
    setRenderScale(q >= 3 ? 2.0f : q >= 2 ? 1.0f : 0.75f);
  }
  EMSCRIPTEN_KEEPALIVE int  getBuildings(){ return (int)W.buildings.size(); }
  EMSCRIPTEN_KEEPALIVE int  getProps(){ return (int)W.props.size(); }
  EMSCRIPTEN_KEEPALIVE float getPctWater(){ return W.terr.pctWater; }
  EMSCRIPTEN_KEEPALIVE float getPctUrban(){ return W.terr.pctUrban; }
  EMSCRIPTEN_KEEPALIVE float getPctWild(){ return W.terr.pctWild; }
  EMSCRIPTEN_KEEPALIVE int  isStarted(){ return gStarted ? 1 : 0; }
  EMSCRIPTEN_KEEPALIVE float getFps(){ return fpsShown; }

  // --- diagnostics
  EMSCRIPTEN_KEEPALIVE int   dbgChunksCached(){ return (int)gChunks.size(); }
  EMSCRIPTEN_KEEPALIVE int   dbgChunksDrawn(){ return gDbgChunksDrawn; }
  EMSCRIPTEN_KEEPALIVE int   dbgRoadTilesDrawn(){ return gDbgRoadTilesDrawn; }
  EMSCRIPTEN_KEEPALIVE int   dbgDrawItems(){ return (int)gDraws.size(); }
  EMSCRIPTEN_KEEPALIVE int   dbgInstances(){
    int n = 0; for(const auto& d : gDraws) n += (int)d.inst.size(); return n;
  }
  EMSCRIPTEN_KEEPALIVE int   dbgSkinned(){ return (int)gSkinned.size(); }
  EMSCRIPTEN_KEEPALIVE int   dbgCars(){ return (int)gCars.size(); }
  EMSCRIPTEN_KEEPALIVE int   dbgPeds(){ return (int)gPeds.size(); }
  EMSCRIPTEN_KEEPALIVE float dbgPlayerX(){ return P.pos.x; }
  EMSCRIPTEN_KEEPALIVE float dbgPlayerY(){ return P.pos.y; }
  EMSCRIPTEN_KEEPALIVE float dbgPlayerZ(){ return P.pos.z; }
  EMSCRIPTEN_KEEPALIVE float dbgTerrainY(){ return W.terr.sample(P.pos.x, P.pos.z); }
  EMSCRIPTEN_KEEPALIVE int   dbgOverWater(){ return W.terr.isWater(P.pos.x, P.pos.z) ? 1 : 0; }
  EMSCRIPTEN_KEEPALIVE int   dbgBiome(){ return (int)W.terr.sampleBiome(P.pos.x, P.pos.z); }
  EMSCRIPTEN_KEEPALIVE float dbgCamY(){ return cam.pos.y; }
  EMSCRIPTEN_KEEPALIVE float dbgSunY(){ return sunState().dir.y; }
  EMSCRIPTEN_KEEPALIVE void  dbgSetShadows(int on){ gShadowsOn = on != 0; }
  EMSCRIPTEN_KEEPALIVE void  dbgSetTint(int on){ gDbgTint = on; }
  EMSCRIPTEN_KEEPALIVE void  dbgSetMode(int mo){ gDbgMode = mo; }
  EMSCRIPTEN_KEEPALIVE int   dbgKeyW(){ return key(87) ? 1 : 0; }
  EMSCRIPTEN_KEEPALIVE int   dbgKeyRaw(int c){ return key(c) ? 1 : 0; }
  EMSCRIPTEN_KEEPALIVE float dbgVel(){ return m::len(v3{P.vel.x, 0, P.vel.z}); }
  EMSCRIPTEN_KEEPALIVE float dbgLastDt(){ return gLastDt; }
  EMSCRIPTEN_KEEPALIVE int   dbgInCar(){ return P.inCar ? 1 : 0; }
  EMSCRIPTEN_KEEPALIVE int   dbgAnimals(){ return (int)gAnimals.size(); }
  EMSCRIPTEN_KEEPALIVE int   dbgBirds(){ return (int)gBirds.size(); }
  EMSCRIPTEN_KEEPALIVE int   dbgFurn(){ return (int)gFurn.size(); }
  EMSCRIPTEN_KEEPALIVE int   dbgAnimalSpecies(int i){
    return (i >= 0 && i < (int)gAnimals.size()) ? gAnimals[i].species : -1;
  }
  EMSCRIPTEN_KEEPALIVE int   dbgAnimalClip(int i){
    return (i >= 0 && i < (int)gAnimals.size()) ? gAnimals[i].animator.cur : -1;
  }
  EMSCRIPTEN_KEEPALIVE float dbgAnimalSpeed(int i){
    return (i >= 0 && i < (int)gAnimals.size()) ? gAnimals[i].speed : -1.0f;
  }
  EMSCRIPTEN_KEEPALIVE void  dbgLookAtAnimal(int i, float dist, float up){
    if(i < 0 || i >= (int)gAnimals.size()) return;
    const Animal& a = gAnimals[i];
    v3 eye = a.pos + v3{ dist * 0.70f, up, dist * 0.70f };
    float yaw = std::atan2(a.pos.x - eye.x, a.pos.z - eye.z);
    float flat = std::sqrt((a.pos.x - eye.x) * (a.pos.x - eye.x)
                         + (a.pos.z - eye.z) * (a.pos.z - eye.z));
    float pitch = std::atan2((a.pos.y + 0.6f) - eye.y, flat);
    gFreeCam = true; gFreeCamPos = eye; gFreeYaw = yaw; gFreePitch = pitch;
  }
  EMSCRIPTEN_KEEPALIVE void  dbgFreezeAnimals(int on){ gFreezeAnimals = on != 0; }
  EMSCRIPTEN_KEEPALIVE void  dbgWarpToAnimal(){
    if(gAnimals.empty()) return;
    P.pos = gAnimals[0].pos + v3{14.0f, 0.0f, 14.0f};
    P.pos.y = W.terr.sample(P.pos.x, P.pos.z);
    P.inCar = false; P.carIndex = -1;
  }
  EMSCRIPTEN_KEEPALIVE void  dbgWarpWild(){
    for(int z = 40; z < world::HM - 40; z += 3){
      for(int x = 40; x < world::HM - 40; x += 3){
        if(W.terr.biome[z * world::HM + x] == world::B_FOREST){
          P.pos = v3{ x * world::HSTEP, 0.0f, z * world::HSTEP };
          P.pos.y = W.terr.sample(P.pos.x, P.pos.z);
          P.inCar = false; P.carIndex = -1;
          return;
        }
      }
    }
  }
  EMSCRIPTEN_KEEPALIVE int   dbgWarpToCar(){
    int best = -1; float bd = 1e18f;
    for(size_t i = 0; i < gCars.size(); i++){
      float dx = gCars[i].pos.x - P.pos.x, dz = gCars[i].pos.z - P.pos.z;
      float d = dx*dx + dz*dz;
      if(d < bd){ bd = d; best = (int)i; }
    }
    if(best < 0) return 0;
    P.pos = gCars[best].pos + v3{2.0f, 0.0f, 0.0f};
    P.pos.y = W.terr.sample(P.pos.x, P.pos.z);
    return 1;
  }
  EMSCRIPTEN_KEEPALIVE float dbgCarSpeed(){
    if(!P.inCar || P.carIndex < 0 || P.carIndex >= (int)gCars.size()) return -1.0f;
    return gCars[P.carIndex].speed;
  }
  EMSCRIPTEN_KEEPALIVE float dbgWheelSpin(){
    if(!P.inCar || P.carIndex < 0 || P.carIndex >= (int)gCars.size()) return -1.0f;
    return gCars[P.carIndex].wheelSpin;
  }
  EMSCRIPTEN_KEEPALIVE float dbgNearestCarDist(){
    float best = 1e9f;
    for(const auto& c : gCars){ float dx=c.pos.x-P.pos.x, dz=c.pos.z-P.pos.z;
      best = std::min(best, std::sqrt(dx*dx+dz*dz)); }
    return best;
  }
  EMSCRIPTEN_KEEPALIVE void  dbgShowShadowMap(int on, int idx){ gShowShadowMap = on != 0; gDbgShadowIdx = idx; }
  EMSCRIPTEN_KEEPALIVE void  dbgFreeCam(int on, float x, float y, float z, float yaw, float pitch){
    gFreeCam = on != 0;
    gFreeCamPos = v3{x, y, z};
    gFreeYaw = yaw; gFreePitch = pitch;
  }
  EMSCRIPTEN_KEEPALIVE void  dbgTeleport(float x, float z){
    P.pos = v3{ x, W.terr.sample(x, z), z }; P.inCar = false; P.carIndex = -1;
  }
}

// ============================================================================
//  Boot
// ============================================================================
int main(){
  printf("[MOOR3D] booting\n");

  // ---- GL context
  EmscriptenWebGLContextAttributes attr;
  emscripten_webgl_init_context_attributes(&attr);
  attr.majorVersion = 2;                  // WebGL 2 == GLES 3.0
  attr.minorVersion = 0;
  attr.alpha = 0;
  attr.depth = 1;
  attr.stencil = 0;
  attr.antialias = 0;                     // we do FXAA ourselves
  attr.preserveDrawingBuffer = 0;
  attr.powerPreference = EM_WEBGL_POWER_PREFERENCE_HIGH_PERFORMANCE;
  attr.failIfMajorPerformanceCaveat = 0;
  EMSCRIPTEN_WEBGL_CONTEXT_HANDLE ctx = emscripten_webgl_create_context("#canvas", &attr);
  if(!ctx){ printf("[FATAL] no WebGL2 context\n"); return 1; }
  emscripten_webgl_make_context_current(ctx);
  printf("[GL] %s | %s\n", (const char*)glGetString(GL_VERSION), (const char*)glGetString(GL_RENDERER));

  // float render targets
  if(!emscripten_webgl_enable_extension(ctx, "EXT_color_buffer_float")){
    printf("[warn] EXT_color_buffer_float unavailable — HDR may be clamped\n");
  }
  emscripten_webgl_enable_extension(ctx, "OES_texture_float_linear");

  double cw, chh;
  emscripten_get_element_css_size("#canvas", &cw, &chh);
  gW = std::max(320, (int)cw);
  gH = std::max(240, (int)chh);
  emscripten_set_canvas_element_size("#canvas", gW, gH);

  if(!buildShaders()){ printf("[FATAL] shader build failed\n"); return 1; }
  printf("[shaders] ok\n");

  fsq.create();
  {
    double t = emscripten_get_now();
    gMaterials.generate(gTexRes, progGen, fsq);
    printf("[texgen] generated in %.0f ms\n", emscripten_get_now() - t);
  }
  for(int i = 0; i < 3; i++) shadow[i].create(SHADOW_RES[i]);
  resizeTargets();

  double t0 = emscripten_get_now();
  W.generate(20260925u);
  printf("[world] %.0f ms | water %.2f%% urban %.2f%% wild %.2f%% | %d buildings, %d props, %d edges\n",
         emscripten_get_now() - t0, W.terr.pctWater, W.terr.pctUrban, W.terr.pctWild,
         (int)W.buildings.size(), (int)W.props.size(), (int)W.edges.size());

  t0 = emscripten_get_now();
  buildAllMeshes();
  printf("[meshes] %.0f ms\n", emscripten_get_now() - t0);

  // ---- scatter our street furniture along the urban kerbs
  {
    m::Rng fr(5150u);
    for(const auto& e : W.edges){
      if(e.zone > 2 || e.bridge) continue;
      float ax = e.x2 - e.x1, az = e.z2 - e.z1;
      float L = e.len; if(L < 40.0f) continue;
      float px = -az / L, pz = ax / L;
      int n = std::max(1, (int)(L / 55.0f));
      for(int k = 0; k < n; k++){
        if(fr.f() > 0.55f) continue;
        float t = (k + 0.5f) / n + fr.range(-0.06f, 0.06f);
        float side = fr.f() < 0.5f ? 1.0f : -1.0f;
        float off = e.width * 0.5f + fr.range(1.6f, 3.0f);
        Furn f;
        f.x = e.x1 + ax * t + px * off * side;
        f.z = e.z1 + az * t + pz * off * side;
        if(W.terr.isWater(f.x, f.z)) continue;
        f.y = W.terr.sample(f.x, f.z);
        f.rot = std::atan2(-px * side, -pz * side);
        float r = fr.f();
        f.kind = r < 0.34f ? 0 : r < 0.62f ? 1 : r < 0.90f ? 2 : 3;
        if(f.kind == 3 && e.zone > 1) f.kind = 2;     // bus stops only downtown
        gFurn.push_back(f);
      }
    }
    printf("[furniture] %d pieces\n", (int)gFurn.size());
  }

  // ---- spawn the player on a downtown street
  {
    float bx = W.districts[0].wx, bz = W.districts[0].wz;
    float bestD = 1e18f;
    for(const auto& e : W.edges){
      if(e.zone > 2 || e.bridge) continue;
      float mx = (e.x1 + e.x2) * 0.5f, mz = (e.z1 + e.z2) * 0.5f;
      float dx = mx - W.districts[0].wx, dz = mz - W.districts[0].wz;
      float d = dx*dx + dz*dz;
      if(d < bestD){ bestD = d; bx = mx; bz = mz; }
    }
    // step to the kerb so we don't start in the middle of the road
    P.pos = v3{ bx + 9.0f, W.terr.sample(bx + 9.0f, bz), bz };
    if(W.terr.isWater(P.pos.x, P.pos.z)) P.pos = v3{ bx, W.terr.sample(bx, bz), bz };
    P.look.shirt = v3{0.92f, 0.76f, 0.25f};
    P.look.pants = v3{0.16f, 0.20f, 0.28f};
    cam.yaw = 0.6f;
  }

  // ---- input
  emscripten_set_keydown_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW, nullptr, 1, onKey);
  emscripten_set_keyup_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW, nullptr, 1, onKey);
  emscripten_set_mousemove_callback("#canvas", nullptr, 1, onMouseMove);
  emscripten_set_mousedown_callback("#canvas", nullptr, 1, onMouseDown);
  emscripten_set_pointerlockchange_callback(EMSCRIPTEN_EVENT_TARGET_DOCUMENT, nullptr, 1, onPointerLock);
  emscripten_set_resize_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW, nullptr, 1, onResize);
  emscripten_set_touchstart_callback("#canvas", nullptr, 1, onTouch);
  emscripten_set_touchmove_callback("#canvas", nullptr, 1, onTouch);
  emscripten_set_touchend_callback("#canvas", nullptr, 1, onTouch);

  EM_ASM({ if(window.moorReady) window.moorReady(); });

  lastT = emscripten_get_now() / 1000.0;
  emscripten_set_main_loop(mainLoop, 0, 1);
  return 0;
}
