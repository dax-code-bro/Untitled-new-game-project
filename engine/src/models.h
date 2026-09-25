// ============================================================================
//  MOOR3D — procedural model library
//  Every mesh in the game is generated here at runtime. No asset files.
// ============================================================================
#pragma once
#include <vector>
#include <cstdint>
#include "mathx.h"
#include "gl.h"

namespace models {

using gfx::Vertex;
using m::v3;
using m::m4;
using m::quat;

// ---------------------------------------------------------------- joint ids
// The character rig. Kept under 24 so it fits the uJoints[] uniform array.
enum Joint : int {
  J_PELVIS = 0, J_SPINE, J_CHEST, J_HEAD,
  J_LUPARM, J_LLOARM, J_LHAND,
  J_RUPARM, J_RLOARM, J_RHAND,
  J_LTHIGH, J_LSHIN, J_LFOOT,
  J_RTHIGH, J_RSHIN, J_RFOOT,
  JOINT_COUNT
};

// ---------------------------------------------------------------- builder
struct Builder {
  std::vector<Vertex>   verts;
  std::vector<uint32_t> idx;

  int  joint = 0;
  float rough = 0.65f, metal = 0.0f, ao = 1.0f;

  void mat(float r, float mt){ rough = r; metal = mt; }

  // Append a transformed box. The workhorse — most models are boxes.
  void box(const v3& centre, const v3& half, const v3& col,
           const quat& rot = quat(), float aoTop = 1.0f, float aoBot = 0.75f){
    static const int F[6][4] = {
      {0,1,2,3}, {5,4,7,6}, {4,0,3,7}, {1,5,6,2}, {4,5,1,0}, {3,2,6,7}
    };
    static const v3 N[6] = {
      { 0, 0, 1}, { 0, 0,-1}, {-1, 0, 0}, { 1, 0, 0}, { 0, 1, 0}, { 0,-1, 0}
    };
    v3 c[8] = {
      {-half.x,-half.y, half.z}, { half.x,-half.y, half.z},
      { half.x, half.y, half.z}, {-half.x, half.y, half.z},
      {-half.x,-half.y,-half.z}, { half.x,-half.y,-half.z},
      { half.x, half.y,-half.z}, {-half.x, half.y,-half.z}
    };
    for(int f = 0; f < 6; f++){
      uint32_t base = (uint32_t)verts.size();
      v3 n = rot.rotate(N[f]);
      // top faces catch more sky light, undersides less
      float shade = (f == 4) ? aoTop : (f == 5) ? aoBot : m::lerpf(aoBot, aoTop, 0.72f);
      for(int k = 0; k < 4; k++){
        Vertex v;
        v.pos   = centre + rot.rotate(c[F[f][k]]);
        v.nrm   = n;
        v.col   = col;
        v.ao    = ao * shade;
        v.joint = (float)joint;
        v.rough = rough;
        v.metal = metal;
        verts.push_back(v);
      }
      idx.insert(idx.end(), { base, base+1, base+2, base, base+2, base+3 });
    }
  }

  // Tapered box — roofs, car bodies, tree trunks.
  void frustumBox(const v3& centre, float hx0, float hz0, float hx1, float hz1,
                  float hy, const v3& col, const quat& rot = quat()){
    v3 c[8] = {
      {-hx0,-hy, hz0}, { hx0,-hy, hz0}, { hx1, hy, hz1}, {-hx1, hy, hz1},
      {-hx0,-hy,-hz0}, { hx0,-hy,-hz0}, { hx1, hy,-hz1}, {-hx1, hy,-hz1}
    };
    static const int F[6][4] = {
      {0,1,2,3}, {5,4,7,6}, {4,0,3,7}, {1,5,6,2}, {3,2,6,7}, {4,5,1,0}
    };
    for(int f = 0; f < 6; f++){
      uint32_t base = (uint32_t)verts.size();
      v3 p0 = c[F[f][0]], p1 = c[F[f][1]], p2 = c[F[f][2]];
      v3 n  = rot.rotate(m::norm(m::cross(p1 - p0, p2 - p0)));
      float shade = (f == 4) ? 1.0f : (f == 5) ? 0.7f : 0.88f;
      for(int k = 0; k < 4; k++){
        Vertex v;
        v.pos   = centre + rot.rotate(c[F[f][k]]);
        v.nrm   = n;
        v.col   = col;
        v.ao    = ao * shade;
        v.joint = (float)joint;
        v.rough = rough; v.metal = metal;
        verts.push_back(v);
      }
      idx.insert(idx.end(), { base, base+1, base+2, base, base+2, base+3 });
    }
  }

  // Cylinder along Y. Wheels, poles, trunks, limbs.
  void cylinder(const v3& centre, float r, float hy, int seg, const v3& col,
                const quat& rot = quat(), float rTop = -1.0f){
    if(rTop < 0) rTop = r;
    uint32_t base = (uint32_t)verts.size();
    for(int i = 0; i < seg; i++){
      float a0 = (float)i / seg * m::TAU;
      float ca = std::cos(a0), sa = std::sin(a0);
      v3 nrm = rot.rotate({ca, 0, sa});
      Vertex lo, hi;
      lo.pos = centre + rot.rotate({ca * r,    -hy, sa * r});
      hi.pos = centre + rot.rotate({ca * rTop,  hy, sa * rTop});
      lo.nrm = hi.nrm = nrm;
      lo.col = hi.col = col;
      lo.ao  = ao * 0.78f; hi.ao = ao * 1.0f;
      lo.joint = hi.joint = (float)joint;
      lo.rough = hi.rough = rough;
      lo.metal = hi.metal = metal;
      verts.push_back(lo);
      verts.push_back(hi);
    }
    for(int i = 0; i < seg; i++){
      uint32_t a = base + i*2, b = base + ((i+1)%seg)*2;
      idx.insert(idx.end(), { a, b, b+1, a, b+1, a+1 });
    }
    // caps
    for(int cap = 0; cap < 2; cap++){
      float y  = cap ? hy : -hy;
      float rr = cap ? rTop : r;
      v3 n = rot.rotate({0, cap ? 1.0f : -1.0f, 0});
      uint32_t cbase = (uint32_t)verts.size();
      Vertex mid;
      mid.pos = centre + rot.rotate({0, y, 0});
      mid.nrm = n; mid.col = col; mid.ao = ao * (cap ? 1.0f : 0.7f);
      mid.joint = (float)joint; mid.rough = rough; mid.metal = metal;
      verts.push_back(mid);
      for(int i = 0; i < seg; i++){
        float a0 = (float)i / seg * m::TAU;
        Vertex v = mid;
        v.pos = centre + rot.rotate({std::cos(a0) * rr, y, std::sin(a0) * rr});
        verts.push_back(v);
      }
      for(int i = 0; i < seg; i++){
        uint32_t a = cbase + 1 + i, b = cbase + 1 + (i + 1) % seg;
        if(cap) idx.insert(idx.end(), { cbase, a, b });
        else    idx.insert(idx.end(), { cbase, b, a });
      }
    }
  }

  // Low-poly UV sphere — heads, foliage blobs, rocks.
  void sphere(const v3& centre, float r, int rings, int seg, const v3& col,
              const v3& squash = v3(1,1,1)){
    uint32_t base = (uint32_t)verts.size();
    for(int y = 0; y <= rings; y++){
      float v  = (float)y / rings;
      float th = v * m::PI;
      float sy = std::cos(th), sr = std::sin(th);
      for(int x = 0; x <= seg; x++){
        float u  = (float)x / seg;
        float ph = u * m::TAU;
        v3 n{ sr * std::cos(ph), sy, sr * std::sin(ph) };
        Vertex vt;
        vt.pos = centre + v3{ n.x * r * squash.x, n.y * r * squash.y, n.z * r * squash.z };
        vt.nrm = m::norm(v3{ n.x / squash.x, n.y / squash.y, n.z / squash.z });
        vt.col = col;
        vt.ao  = ao * m::lerpf(0.62f, 1.0f, (n.y + 1.0f) * 0.5f);
        vt.joint = (float)joint; vt.rough = rough; vt.metal = metal;
        verts.push_back(vt);
      }
    }
    for(int y = 0; y < rings; y++){
      for(int x = 0; x < seg; x++){
        uint32_t a = base + y * (seg + 1) + x;
        uint32_t b = a + seg + 1;
        idx.insert(idx.end(), { a, b, a+1, a+1, b, b+1 });
      }
    }
  }

  void finish(gfx::Mesh& out){ out.upload(verts, idx); }
};

// ============================================================================
//  CHARACTER — a skinned humanoid. Every vertex tagged with its joint.
// ============================================================================
struct CharacterLook {
  v3 skin  {0.88f, 0.70f, 0.55f};
  v3 shirt {0.25f, 0.45f, 0.80f};
  v3 pants {0.18f, 0.22f, 0.30f};
  v3 shoes {0.10f, 0.10f, 0.12f};
  v3 hair  {0.16f, 0.12f, 0.09f};
};

// Rest-pose joint offsets, parent-relative. Shared by mesh + skeleton so the
// bind pose and the animation rig can never drift apart.
struct JointDef { int parent; v3 offset; };

inline const JointDef* jointDefs(){
  static const JointDef defs[JOINT_COUNT] = {
    /* PELVIS */ { -1,       { 0.00f, 0.92f,  0.00f } },
    /* SPINE  */ { J_PELVIS, { 0.00f, 0.16f,  0.00f } },
    /* CHEST  */ { J_SPINE,  { 0.00f, 0.20f,  0.00f } },
    /* HEAD   */ { J_CHEST,  { 0.00f, 0.26f,  0.00f } },
    /* LUPARM */ { J_CHEST,  { 0.20f, 0.16f,  0.00f } },
    /* LLOARM */ { J_LUPARM, { 0.00f,-0.26f,  0.00f } },
    /* LHAND  */ { J_LLOARM, { 0.00f,-0.24f,  0.00f } },
    /* RUPARM */ { J_CHEST,  {-0.20f, 0.16f,  0.00f } },
    /* RLOARM */ { J_RUPARM, { 0.00f,-0.26f,  0.00f } },
    /* RHAND  */ { J_RLOARM, { 0.00f,-0.24f,  0.00f } },
    /* LTHIGH */ { J_PELVIS, { 0.11f,-0.06f,  0.00f } },
    /* LSHIN  */ { J_LTHIGH, { 0.00f,-0.42f,  0.00f } },
    /* LFOOT  */ { J_LSHIN,  { 0.00f,-0.40f,  0.00f } },
    /* RTHIGH */ { J_PELVIS, {-0.11f,-0.06f,  0.00f } },
    /* RSHIN  */ { J_RTHIGH, { 0.00f,-0.42f,  0.00f } },
    /* RFOOT  */ { J_RSHIN,  { 0.00f,-0.40f,  0.00f } }
  };
  return defs;
}

// World-space rest position of a joint (walks the parent chain).
inline v3 jointRestWorld(int j){
  const JointDef* d = jointDefs();
  v3 p{0,0,0};
  while(j >= 0){ p += d[j].offset; j = d[j].parent; }
  return p;
}

inline void buildCharacter(gfx::Mesh& out, const CharacterLook& L){
  Builder b;
  b.mat(0.72f, 0.0f);
  const JointDef* jd = jointDefs();
  (void)jd;

  // Each limb is modelled around its joint's rest position, then tagged with
  // that joint id. The vertex shader multiplies by uJoints[joint], which the
  // animator fills with (animatedWorld * inverseBind).
  auto at = [&](int j){ return jointRestWorld(j); };

  // --- torso
  b.joint = J_PELVIS;
  b.box(at(J_PELVIS) + v3{0, 0.02f, 0}, {0.155f, 0.105f, 0.098f}, L.pants);
  b.joint = J_SPINE;
  b.box(at(J_SPINE) + v3{0, 0.06f, 0}, {0.150f, 0.115f, 0.095f}, L.shirt);
  b.joint = J_CHEST;
  b.box(at(J_CHEST) + v3{0, 0.08f, 0}, {0.172f, 0.135f, 0.103f}, L.shirt);
  // shoulders
  b.box(at(J_CHEST) + v3{ 0.185f, 0.15f, 0}, {0.048f, 0.052f, 0.082f}, L.shirt);
  b.box(at(J_CHEST) + v3{-0.185f, 0.15f, 0}, {0.048f, 0.052f, 0.082f}, L.shirt);

  // --- head + neck + hair
  b.joint = J_HEAD;
  v3 hp = at(J_HEAD);
  b.box(hp + v3{0,-0.06f, 0}, {0.048f, 0.045f, 0.048f}, L.skin);       // neck
  b.sphere(hp + v3{0, 0.07f, 0}, 0.108f, 8, 12, L.skin, {0.92f, 1.06f, 0.96f});
  b.mat(0.85f, 0.0f);
  b.sphere(hp + v3{0, 0.10f, -0.008f}, 0.108f, 6, 12, L.hair, {0.96f, 0.82f, 1.00f});
  b.mat(0.72f, 0.0f);
  // eyes — tiny, but they make a character read as a character
  b.box(hp + v3{ 0.040f, 0.075f, 0.098f}, {0.016f, 0.011f, 0.008f}, {0.06f,0.06f,0.08f});
  b.box(hp + v3{-0.040f, 0.075f, 0.098f}, {0.016f, 0.011f, 0.008f}, {0.06f,0.06f,0.08f});

  // --- arms
  struct ArmSpec { int up, lo, hand; float sx; };
  ArmSpec arms[2] = { {J_LUPARM, J_LLOARM, J_LHAND, 1.0f},
                      {J_RUPARM, J_RLOARM, J_RHAND, -1.0f} };
  for(const auto& A : arms){
    b.joint = A.up;
    b.box(at(A.up) + v3{0,-0.13f, 0}, {0.052f, 0.135f, 0.055f}, L.shirt);
    b.joint = A.lo;
    b.box(at(A.lo) + v3{0,-0.12f, 0}, {0.045f, 0.125f, 0.048f}, L.skin);
    b.joint = A.hand;
    b.box(at(A.hand) + v3{0,-0.05f, 0}, {0.046f, 0.058f, 0.032f}, L.skin);
  }

  // --- legs
  struct LegSpec { int th, sh, ft; };
  LegSpec legs[2] = { {J_LTHIGH, J_LSHIN, J_LFOOT}, {J_RTHIGH, J_RSHIN, J_RFOOT} };
  for(const auto& Lg : legs){
    b.joint = Lg.th;
    b.box(at(Lg.th) + v3{0,-0.21f, 0}, {0.068f, 0.215f, 0.072f}, L.pants);
    b.joint = Lg.sh;
    b.box(at(Lg.sh) + v3{0,-0.20f, 0}, {0.056f, 0.200f, 0.060f}, L.pants);
    b.joint = Lg.ft;
    b.mat(0.45f, 0.0f);
    b.box(at(Lg.ft) + v3{0,-0.030f, 0.040f}, {0.060f, 0.036f, 0.108f}, L.shoes);
    b.mat(0.72f, 0.0f);
  }

  b.finish(out);
}

// ============================================================================
//  VEHICLES — body shells (wheels are a separate instanced mesh so they spin)
// ============================================================================
struct CarSpec {
  const char* name;
  float len, wid, hgt;
  float wheelR, wheelW;
  float axleFront, axleRear;    // z offsets of the axles
  float topStart, topEnd;       // cabin footprint along z
  float cabinH;
};

inline const CarSpec* carSpecs(int& count){
  static const CarSpec s[] = {
    { "sedan",   4.55f, 1.82f, 0.62f, 0.33f, 0.22f,  1.38f, -1.38f,  -1.05f, 0.75f, 0.52f },
    { "coupe",   4.30f, 1.86f, 0.56f, 0.34f, 0.24f,  1.30f, -1.30f,  -0.85f, 0.55f, 0.44f },
    { "suv",     4.85f, 1.98f, 0.82f, 0.40f, 0.26f,  1.48f, -1.45f,  -1.30f, 1.15f, 0.66f },
    { "pickup",  5.35f, 1.96f, 0.74f, 0.39f, 0.26f,  1.55f, -1.60f,  -0.20f, 1.35f, 0.62f },
    { "van",     5.10f, 2.02f, 0.92f, 0.36f, 0.24f,  1.50f, -1.50f,  -1.75f, 1.55f, 0.78f },
    { "compact", 3.85f, 1.72f, 0.58f, 0.30f, 0.21f,  1.15f, -1.18f,  -0.85f, 0.65f, 0.48f },
    { "sport",   4.42f, 1.92f, 0.46f, 0.33f, 0.26f,  1.35f, -1.32f,  -0.90f, 0.42f, 0.36f }
  };
  count = (int)(sizeof(s) / sizeof(s[0]));
  return s;
}

// Body only. Colour comes from the per-instance tint, so one mesh serves
// every colour of that chassis.
inline void buildCarBody(gfx::Mesh& out, const CarSpec& S, bool police){
  Builder b;
  const v3 white{1,1,1};                     // tinted per instance
  const v3 glass{0.10f, 0.14f, 0.18f};
  const v3 trim {0.07f, 0.07f, 0.08f};
  const v3 chrome{0.75f, 0.76f, 0.78f};

  float hl = S.len * 0.5f, hw = S.wid * 0.5f;
  float bodyY = S.wheelR + S.hgt * 0.5f;

  // main hull, slightly tapered at the nose for shape
  b.mat(0.20f, 0.55f);
  b.frustumBox({0, bodyY, 0}, hw, hl, hw * 0.94f, hl * 0.97f, S.hgt * 0.5f, white);

  // lower skirt / sills
  b.mat(0.55f, 0.1f);
  b.box({0, S.wheelR * 0.62f, 0}, {hw * 0.97f, S.wheelR * 0.30f, hl * 0.92f}, trim);

  // cabin
  float cz = (S.topStart + S.topEnd) * 0.5f;
  float chz = (S.topEnd - S.topStart) * 0.5f;
  float cy = S.wheelR + S.hgt + S.cabinH * 0.5f;
  b.mat(0.22f, 0.5f);
  b.frustumBox({0, cy, cz}, hw * 0.92f, chz, hw * 0.74f, chz * 0.86f, S.cabinH * 0.5f, white);

  // glass: windshield, rear, and side lights
  b.mat(0.06f, 0.30f);
  b.box({0, cy, S.topEnd - 0.02f},   {hw * 0.80f, S.cabinH * 0.34f, 0.05f}, glass);
  b.box({0, cy, S.topStart + 0.02f}, {hw * 0.78f, S.cabinH * 0.32f, 0.05f}, glass);
  b.box({ hw * 0.88f, cy, cz}, {0.04f, S.cabinH * 0.30f, chz * 0.80f}, glass);
  b.box({-hw * 0.88f, cy, cz}, {0.04f, S.cabinH * 0.30f, chz * 0.80f}, glass);

  // bumpers + grille
  b.mat(0.42f, 0.25f);
  b.box({0, bodyY - S.hgt * 0.18f,  hl - 0.06f}, {hw * 0.90f, S.hgt * 0.24f, 0.10f}, trim);
  b.box({0, bodyY - S.hgt * 0.18f, -hl + 0.06f}, {hw * 0.90f, S.hgt * 0.24f, 0.10f}, trim);
  b.mat(0.25f, 0.8f);
  b.box({0, bodyY, hl - 0.02f}, {hw * 0.40f, S.hgt * 0.20f, 0.05f}, chrome);

  // lights — emissive-ish via very low roughness + bright albedo
  b.mat(0.10f, 0.0f);
  b.box({ hw * 0.66f, bodyY + S.hgt * 0.10f,  hl - 0.01f}, {0.17f, 0.10f, 0.05f}, {2.6f, 2.5f, 2.1f});
  b.box({-hw * 0.66f, bodyY + S.hgt * 0.10f,  hl - 0.01f}, {0.17f, 0.10f, 0.05f}, {2.6f, 2.5f, 2.1f});
  b.box({ hw * 0.68f, bodyY + S.hgt * 0.10f, -hl + 0.01f}, {0.15f, 0.09f, 0.04f}, {1.5f, 0.12f, 0.10f});
  b.box({-hw * 0.68f, bodyY + S.hgt * 0.10f, -hl + 0.01f}, {0.15f, 0.09f, 0.04f}, {1.5f, 0.12f, 0.10f});

  // mirrors
  b.mat(0.35f, 0.4f);
  b.box({ hw * 1.02f, cy + S.cabinH * 0.10f, S.topEnd - 0.18f}, {0.09f, 0.045f, 0.055f}, trim);
  b.box({-hw * 1.02f, cy + S.cabinH * 0.10f, S.topEnd - 0.18f}, {0.09f, 0.045f, 0.055f}, trim);

  if(police){
    // light bar
    b.mat(0.18f, 0.1f);
    b.box({0, cy + S.cabinH * 0.5f + 0.05f, cz}, {hw * 0.55f, 0.055f, 0.13f}, {0.05f,0.05f,0.06f});
    b.box({ hw * 0.28f, cy + S.cabinH * 0.5f + 0.09f, cz}, {0.16f, 0.05f, 0.11f}, {3.0f, 0.12f, 0.12f});
    b.box({-hw * 0.28f, cy + S.cabinH * 0.5f + 0.09f, cz}, {0.16f, 0.05f, 0.11f}, {0.12f, 0.16f, 3.0f});
  }
  b.finish(out);
}

// One wheel, drawn four times per car with its own spin/steer matrix.
inline void buildWheel(gfx::Mesh& out, float r, float w){
  Builder b;
  b.mat(0.82f, 0.0f);
  // tyre: cylinder axis along X, so rotate Z->X
  quat lay = quat::axisAngle({0, 0, 1}, m::PI * 0.5f);
  b.cylinder({0, 0, 0}, r, w * 0.5f, 16, {0.055f, 0.055f, 0.062f}, lay);
  // rim + spokes
  b.mat(0.18f, 0.85f);
  b.cylinder({0, 0, 0}, r * 0.58f, w * 0.52f, 12, {0.72f, 0.73f, 0.76f}, lay);
  for(int i = 0; i < 5; i++){
    float a = (float)i / 5.0f * m::TAU;
    quat spoke = lay * quat::axisAngle({0, 1, 0}, a);
    b.box({0, 0, 0}, {w * 0.10f, r * 0.50f, 0.022f}, {0.68f, 0.69f, 0.72f}, spoke);
  }
  b.finish(out);
}

// ============================================================================
//  BUILDINGS — one mesh per archetype, instanced with per-building scale
// ============================================================================
// Unit building: 1x1 footprint, 1.0 tall. The instance matrix scales it, so a
// single mesh becomes a bungalow or a skyscraper.
inline void buildTower(gfx::Mesh& out, int floors, bool setback){
  Builder b;
  b.mat(0.42f, 0.10f);
  const v3 wall{1,1,1};
  const v3 glass{0.14f, 0.19f, 0.26f};
  const v3 dark {0.20f, 0.21f, 0.24f};

  float fh = 1.0f / floors;
  float hx = 0.5f, hz = 0.5f;
  float y = 0.0f;
  for(int f = 0; f < floors; f++){
    // step the silhouette in as it rises
    if(setback && f > 0 && f % 5 == 0){ hx *= 0.88f; hz *= 0.88f; }
    b.mat(0.44f, 0.08f);
    b.box({0, y + fh * 0.5f, 0}, {hx, fh * 0.5f, hz}, wall);
    // continuous glazing band, inset slightly
    b.mat(0.10f, 0.35f);
    b.box({0, y + fh * 0.58f,  hz}, {hx * 0.92f, fh * 0.30f, 0.008f}, glass);
    b.box({0, y + fh * 0.58f, -hz}, {hx * 0.92f, fh * 0.30f, 0.008f}, glass);
    b.box({ hx, y + fh * 0.58f, 0}, {0.008f, fh * 0.30f, hz * 0.92f}, glass);
    b.box({-hx, y + fh * 0.58f, 0}, {0.008f, fh * 0.30f, hz * 0.92f}, glass);
    // floor slab lip
    b.mat(0.55f, 0.05f);
    b.box({0, y + fh * 0.03f, 0}, {hx * 1.012f, fh * 0.035f, hz * 1.012f}, dark);
    y += fh;
  }
  // roof furniture
  b.mat(0.62f, 0.15f);
  b.box({0, 1.0f + 0.012f, 0}, {hx * 1.02f, 0.012f, hz * 1.02f}, dark);
  b.box({ hx * 0.35f, 1.0f + 0.045f, hz * 0.30f}, {hx * 0.22f, 0.035f, hz * 0.20f}, dark);
  b.box({-hx * 0.30f, 1.0f + 0.060f, -hz * 0.25f}, {hx * 0.14f, 0.050f, hz * 0.14f}, dark);
  b.cylinder({hx * 0.10f, 1.0f + 0.10f, -hz * 0.05f}, 0.012f, 0.085f, 6, {0.6f,0.15f,0.12f});
  b.finish(out);
}

inline void buildHouse(gfx::Mesh& out, bool twoStorey){
  Builder b;
  const v3 wall{1,1,1};
  const v3 roofc{0.30f, 0.20f, 0.17f};
  const v3 door {0.32f, 0.20f, 0.13f};
  const v3 glass{0.16f, 0.22f, 0.28f};
  const v3 frame{0.92f, 0.92f, 0.90f};

  float bodyTop = twoStorey ? 0.70f : 0.46f;
  b.mat(0.66f, 0.0f);
  b.box({0, bodyTop * 0.5f, 0}, {0.5f, bodyTop * 0.5f, 0.5f}, wall);

  // pitched roof: two tapered slabs meeting at a ridge
  b.mat(0.72f, 0.0f);
  b.frustumBox({0, bodyTop + 0.16f, 0}, 0.56f, 0.56f, 0.05f, 0.56f, 0.16f, roofc);
  b.box({0, bodyTop + 0.012f, 0}, {0.545f, 0.018f, 0.545f}, roofc);   // eaves

  // windows + door on the front face (+Z)
  b.mat(0.10f, 0.30f);
  float wy = twoStorey ? 0.44f : 0.30f;
  b.box({ 0.24f, wy, 0.502f}, {0.105f, 0.085f, 0.006f}, glass);
  b.box({-0.24f, wy, 0.502f}, {0.105f, 0.085f, 0.006f}, glass);
  b.mat(0.70f, 0.0f);
  b.box({ 0.24f, wy, 0.506f}, {0.118f, 0.098f, 0.004f}, frame, quat(), 1.0f, 0.9f);
  b.box({-0.24f, wy, 0.506f}, {0.118f, 0.098f, 0.004f}, frame, quat(), 1.0f, 0.9f);
  if(twoStorey){
    b.mat(0.10f, 0.30f);
    b.box({ 0.24f, 0.16f, 0.502f}, {0.095f, 0.075f, 0.006f}, glass);
    b.box({-0.24f, 0.16f, 0.502f}, {0.095f, 0.075f, 0.006f}, glass);
  }
  // door
  b.mat(0.55f, 0.0f);
  b.box({0, 0.115f, 0.505f}, {0.075f, 0.115f, 0.008f}, door);
  b.mat(0.25f, 0.8f);
  b.box({0.052f, 0.118f, 0.515f}, {0.012f, 0.012f, 0.006f}, {0.8f,0.7f,0.3f});
  // chimney
  b.mat(0.75f, 0.0f);
  b.box({0.30f, bodyTop + 0.22f, -0.22f}, {0.055f, 0.14f, 0.055f}, {0.42f,0.31f,0.27f});
  b.finish(out);
}

inline void buildShop(gfx::Mesh& out){
  Builder b;
  const v3 wall{1,1,1};
  b.mat(0.60f, 0.05f);
  b.box({0, 0.30f, 0}, {0.5f, 0.30f, 0.5f}, wall);
  // parapet
  b.mat(0.66f, 0.0f);
  b.box({0, 0.625f, 0}, {0.52f, 0.035f, 0.52f}, {0.55f, 0.55f, 0.57f});
  // full-height shopfront glazing
  b.mat(0.08f, 0.35f);
  b.box({0, 0.26f, 0.503f}, {0.44f, 0.20f, 0.008f}, {0.13f, 0.19f, 0.25f});
  // awning
  b.mat(0.70f, 0.0f);
  b.frustumBox({0, 0.50f, 0.60f}, 0.46f, 0.12f, 0.46f, 0.02f, 0.035f, {0.72f, 0.20f, 0.18f});
  // sign band
  b.mat(0.40f, 0.1f);
  b.box({0, 0.565f, 0.512f}, {0.36f, 0.045f, 0.012f}, {1.5f, 1.35f, 0.75f});
  b.finish(out);
}

inline void buildApartment(gfx::Mesh& out, int floors){
  Builder b;
  const v3 wall{1,1,1};
  float fh = 1.0f / floors;
  b.mat(0.58f, 0.04f);
  b.box({0, 0.5f, 0}, {0.5f, 0.5f, 0.5f}, wall);
  // balconies + window bands per floor
  for(int f = 0; f < floors; f++){
    float y = (f + 0.55f) * fh;
    b.mat(0.10f, 0.30f);
    b.box({0, y, 0.502f}, {0.40f, fh * 0.26f, 0.008f}, {0.15f, 0.20f, 0.27f});
    b.box({0, y, -0.502f}, {0.40f, fh * 0.26f, 0.008f}, {0.15f, 0.20f, 0.27f});
    if(f > 0){
      b.mat(0.55f, 0.1f);
      b.box({0, y - fh * 0.28f, 0.565f}, {0.42f, 0.010f, 0.065f}, {0.60f,0.60f,0.62f});
      b.box({0, y - fh * 0.20f, 0.628f}, {0.42f, 0.055f, 0.008f}, {0.52f,0.53f,0.56f});
    }
  }
  b.mat(0.62f, 0.05f);
  b.box({0, 1.015f, 0}, {0.52f, 0.018f, 0.52f}, {0.34f, 0.35f, 0.38f});
  b.finish(out);
}

// ============================================================================
//  NATURE
// ============================================================================
inline void buildTree(gfx::Mesh& out, int kind){
  Builder b;
  if(kind == 0){                                   // broadleaf
    b.mat(0.85f, 0.0f);
    b.cylinder({0, 1.05f, 0}, 0.20f, 1.05f, 8, {0.28f, 0.20f, 0.14f}, quat(), 0.13f);
    b.mat(0.78f, 0.0f);
    b.sphere({0, 2.55f, 0},        1.32f, 6, 9, {0.16f, 0.32f, 0.13f}, {1.0f, 0.86f, 1.0f});
    b.sphere({0.72f, 2.10f, 0.28f}, 0.86f, 5, 8, {0.19f, 0.36f, 0.15f});
    b.sphere({-0.62f, 2.22f, -0.35f}, 0.78f, 5, 8, {0.14f, 0.29f, 0.12f});
  } else if(kind == 1){                            // conifer
    b.mat(0.86f, 0.0f);
    b.cylinder({0, 0.85f, 0}, 0.17f, 0.85f, 8, {0.24f, 0.17f, 0.12f}, quat(), 0.10f);
    b.mat(0.80f, 0.0f);
    for(int i = 0; i < 4; i++){
      float t = (float)i / 4.0f;
      float y = 1.25f + t * 2.30f;
      float r = 1.28f * (1.0f - t * 0.74f);
      b.cylinder({0, y, 0}, r, 0.50f, 9, {0.11f, 0.26f, 0.15f}, quat(), r * 0.30f);
    }
  } else {                                         // scrub / bush
    b.mat(0.82f, 0.0f);
    b.sphere({0, 0.48f, 0}, 0.62f, 5, 8, {0.20f, 0.33f, 0.15f}, {1.15f, 0.78f, 1.15f});
    b.sphere({0.36f, 0.34f, 0.18f}, 0.40f, 4, 7, {0.17f, 0.29f, 0.13f});
  }
  b.finish(out);
}

inline void buildRock(gfx::Mesh& out, uint32_t seed){
  Builder b;
  m::Rng r(seed ? seed : 7u);
  b.mat(0.88f, 0.0f);
  int n = 3 + (int)(r.f() * 3);
  for(int i = 0; i < n; i++){
    v3 c{ r.range(-0.42f, 0.42f), r.range(0.0f, 0.34f), r.range(-0.42f, 0.42f) };
    float rad = r.range(0.34f, 0.66f);
    float g = r.range(0.38f, 0.52f);
    b.sphere(c, rad, 4, 6, {g, g * 0.98f, g * 0.94f},
             { r.range(0.8f,1.3f), r.range(0.55f,0.95f), r.range(0.8f,1.3f) });
  }
  b.finish(out);
}

// ============================================================================
//  STREET FURNITURE
// ============================================================================
inline void buildLamppost(gfx::Mesh& out){
  Builder b;
  b.mat(0.40f, 0.65f);
  b.cylinder({0, 0.10f, 0}, 0.13f, 0.10f, 8, {0.20f, 0.21f, 0.23f});
  b.cylinder({0, 2.55f, 0}, 0.070f, 2.45f, 8, {0.26f, 0.27f, 0.29f}, quat(), 0.055f);
  // curved arm, approximated with short segments
  for(int i = 0; i < 4; i++){
    float t = (float)i / 3.0f;
    float a = t * 0.62f;
    b.box({ std::sin(a) * (0.30f + t * 0.38f), 4.98f + std::cos(a) * 0.04f + t * 0.10f, 0},
          {0.13f, 0.045f, 0.048f}, {0.26f, 0.27f, 0.29f},
          quat::axisAngle({0, 0, 1}, -a * 0.8f));
  }
  b.mat(0.15f, 0.1f);
  b.box({0.78f, 5.02f, 0}, {0.17f, 0.055f, 0.13f}, {2.4f, 2.2f, 1.7f});
  b.finish(out);
}

inline void buildTrafficLight(gfx::Mesh& out){
  Builder b;
  b.mat(0.45f, 0.6f);
  b.cylinder({0, 0.09f, 0}, 0.15f, 0.09f, 8, {0.18f, 0.19f, 0.21f});
  b.cylinder({0, 1.80f, 0}, 0.075f, 1.75f, 8, {0.22f, 0.23f, 0.25f});
  b.box({0, 3.62f, 0}, {0.16f, 0.30f, 0.14f}, {0.14f, 0.15f, 0.16f});
  // the three lenses; the renderer brightens the active one via a second pass
  b.mat(0.12f, 0.0f);
  b.box({0, 3.82f, 0.145f}, {0.075f, 0.075f, 0.020f}, {0.55f, 0.10f, 0.10f});
  b.box({0, 3.62f, 0.145f}, {0.075f, 0.075f, 0.020f}, {0.55f, 0.48f, 0.12f});
  b.box({0, 3.42f, 0.145f}, {0.075f, 0.075f, 0.020f}, {0.10f, 0.52f, 0.16f});
  b.finish(out);
}

// A single glowing quad-ish box used for lamp/headlight/window emissives.
inline void buildGlow(gfx::Mesh& out){
  Builder b;
  b.mat(0.99f, 0.0f);
  b.sphere({0, 0, 0}, 1.0f, 5, 8, {1, 1, 1});
  b.finish(out);
}


// ============================================================================
//  QUADRUPED — our own rig, built from scratch.
//  One 20-joint skeleton drives every land animal; each species is a different
//  set of proportions and a different mesh skinned to the same bones.
// ============================================================================
enum QJoint : int {
  Q_ROOT = 0,        // hips
  Q_CHEST, Q_NECK, Q_HEAD, Q_EAR_L, Q_EAR_R,
  Q_TAIL1, Q_TAIL2,
  Q_FL_HIP, Q_FL_KNEE, Q_FL_FOOT,
  Q_FR_HIP, Q_FR_KNEE, Q_FR_FOOT,
  Q_BL_HIP, Q_BL_KNEE, Q_BL_FOOT,
  Q_BR_HIP, Q_BR_KNEE, Q_BR_FOOT,
  QJOINT_COUNT
};

// Canonical animal: roughly deer-sized, body running along +Z (forward).
// Species scale this whole rig; the mesh is built to match.
inline const JointDef* quadJointDefs(){
  static const JointDef d[QJOINT_COUNT] = {
    /* ROOT    */ { -1,        { 0.00f, 0.72f, -0.26f } },
    /* CHEST   */ { Q_ROOT,    { 0.00f, 0.02f,  0.52f } },
    /* NECK    */ { Q_CHEST,   { 0.00f, 0.15f,  0.24f } },
    /* HEAD    */ { Q_NECK,    { 0.00f, 0.12f,  0.20f } },
    /* EAR_L   */ { Q_HEAD,    { 0.07f, 0.09f,  0.01f } },
    /* EAR_R   */ { Q_HEAD,    {-0.07f, 0.09f,  0.01f } },
    /* TAIL1   */ { Q_ROOT,    { 0.00f, 0.09f, -0.21f } },
    /* TAIL2   */ { Q_TAIL1,   { 0.00f,-0.03f, -0.17f } },
    /* FL_HIP  */ { Q_CHEST,   { 0.13f,-0.09f,  0.09f } },
    /* FL_KNEE */ { Q_FL_HIP,  { 0.00f,-0.27f,  0.00f } },
    /* FL_FOOT */ { Q_FL_KNEE, { 0.00f,-0.25f,  0.00f } },
    /* FR_HIP  */ { Q_CHEST,   {-0.13f,-0.09f,  0.09f } },
    /* FR_KNEE */ { Q_FR_HIP,  { 0.00f,-0.27f,  0.00f } },
    /* FR_FOOT */ { Q_FR_KNEE, { 0.00f,-0.25f,  0.00f } },
    /* BL_HIP  */ { Q_ROOT,    { 0.14f,-0.05f, -0.03f } },
    /* BL_KNEE */ { Q_BL_HIP,  { 0.00f,-0.29f,  0.00f } },
    /* BL_FOOT */ { Q_BL_KNEE, { 0.00f,-0.27f,  0.00f } },
    /* BR_HIP  */ { Q_ROOT,    {-0.14f,-0.05f, -0.03f } },
    /* BR_KNEE */ { Q_BR_HIP,  { 0.00f,-0.29f,  0.00f } },
    /* BR_FOOT */ { Q_BR_KNEE, { 0.00f,-0.27f,  0.00f } }
  };
  return d;
}
inline v3 quadRestWorld(int j){
  const JointDef* d = quadJointDefs();
  v3 p{0,0,0};
  while(j >= 0){ p += d[j].offset; j = d[j].parent; }
  return p;
}

enum HeadGear : int { HG_NONE = 0, HG_ANTLERS, HG_HORNS, HG_TUSKS };
enum TailKind : int { TK_STUB = 0, TK_BUSHY, TK_LONG, TK_FLAG };

struct QuadSpec {
  const char* name;
  float scale;             // overall size multiplier
  float bodyLen, bodyR;    // torso length / radius
  float chestR, rumpR;     // girth at shoulder / hip
  float neckR, headLen, headR, snoutLen;
  float legThick;
  float earLen, earWide;
  int   headGear, tail;
  v3    coat, belly, face, horn;
  float rough;
};

// Torso + neck + head + four legs, each part tagged with its joint.
inline void buildQuadruped(gfx::Mesh& out, const QuadSpec& S){
  Builder b;
  b.mat(S.rough, 0.0f);
  auto at = [&](int j){ return quadRestWorld(j); };

  // ---- torso: a barrel from rump to chest, plus a belly slab
  {
    b.joint = Q_ROOT;
    v3 rump = at(Q_ROOT);
    b.sphere(rump + v3{0, 0.01f, 0.04f}, S.rumpR, 6, 9, S.coat,
             {1.0f, 0.92f, 1.22f});
    b.joint = Q_CHEST;
    v3 ch = at(Q_CHEST);
    b.sphere(ch + v3{0, 0.0f, -0.06f}, S.chestR, 6, 9, S.coat,
             {1.0f, 0.96f, 1.30f});
    // the span between them, so the animal reads as one body not two balls
    b.joint = Q_ROOT;
    v3 mid = (rump + ch) * 0.5f;
    b.sphere(mid, (S.rumpR + S.chestR) * 0.48f, 5, 9, S.coat,
             {1.02f, 0.94f, S.bodyLen * 1.5f});
    b.sphere(mid + v3{0, -S.bodyR * 0.42f, 0}, S.bodyR * 0.72f, 4, 8, S.belly,
             {0.92f, 0.62f, S.bodyLen * 1.45f});
  }

  // ---- neck and head
  {
    b.joint = Q_NECK;
    v3 nk = at(Q_NECK);
    b.sphere(nk + v3{0, 0.02f, 0.02f}, S.neckR, 5, 8, S.coat, {0.95f, 1.35f, 0.95f});
    b.joint = Q_HEAD;
    v3 hd = at(Q_HEAD);
    b.sphere(hd, S.headR, 6, 9, S.coat, {0.92f, 0.96f, S.headLen / S.headR});
    // snout
    b.sphere(hd + v3{0, -S.headR * 0.22f, S.headLen * 0.82f}, S.headR * 0.58f, 5, 8,
             S.face, {0.80f, 0.74f, S.snoutLen / (S.headR * 0.58f)});
    // nose
    b.mat(0.30f, 0.0f);
    b.sphere(hd + v3{0, -S.headR * 0.24f, S.headLen * 0.82f + S.snoutLen * 0.52f},
             S.headR * 0.20f, 4, 6, {0.10f, 0.09f, 0.09f});
    // eyes
    b.sphere(hd + v3{ S.headR * 0.62f, S.headR * 0.20f, S.headLen * 0.34f}, S.headR * 0.17f, 4, 6, {0.05f,0.04f,0.04f});
    b.sphere(hd + v3{-S.headR * 0.62f, S.headR * 0.20f, S.headLen * 0.34f}, S.headR * 0.17f, 4, 6, {0.05f,0.04f,0.04f});
    b.mat(S.rough, 0.0f);
    // ears
    b.joint = Q_EAR_L;
    b.sphere(at(Q_EAR_L) + v3{0, S.earLen * 0.40f, 0}, S.earLen * 0.5f, 4, 6, S.coat,
             {S.earWide, 1.0f, 0.42f});
    b.joint = Q_EAR_R;
    b.sphere(at(Q_EAR_R) + v3{0, S.earLen * 0.40f, 0}, S.earLen * 0.5f, 4, 6, S.coat,
             {S.earWide, 1.0f, 0.42f});
  }

  // ---- head gear
  if(S.headGear != HG_NONE){
    b.joint = Q_HEAD;
    v3 hd = at(Q_HEAD);
    b.mat(0.62f, 0.0f);
    if(S.headGear == HG_ANTLERS){
      for(int side = -1; side <= 1; side += 2){
        v3 base = hd + v3{ side * S.headR * 0.44f, S.headR * 0.80f, -S.headR * 0.10f };
        // main beam, swept up and back
        for(int k = 0; k < 4; k++){
          float t = k / 4.0f;
          v3 pnt = base + v3{ side * (0.05f + t * 0.20f), 0.10f + t * 0.34f, -t * 0.16f };
          b.sphere(pnt, 0.035f - t * 0.012f, 3, 5, S.horn, {1.0f, 1.9f, 1.0f});
        }
        // two tines
        for(int tine = 0; tine < 2; tine++){
          v3 root = base + v3{ side * (0.08f + tine * 0.10f), 0.18f + tine * 0.16f, -0.06f - tine * 0.05f };
          for(int k = 0; k < 3; k++){
            float t = k / 3.0f;
            b.sphere(root + v3{ side * t * 0.05f, t * 0.17f, t * 0.05f },
                     0.026f - t * 0.008f, 3, 5, S.horn, {1.0f, 1.7f, 1.0f});
          }
        }
      }
    } else if(S.headGear == HG_HORNS){
      for(int side = -1; side <= 1; side += 2){
        v3 base = hd + v3{ side * S.headR * 0.50f, S.headR * 0.62f, 0.0f };
        for(int k = 0; k < 5; k++){
          float t = k / 5.0f;
          float a = t * 2.4f;
          b.sphere(base + v3{ side * (0.05f + std::sin(a) * 0.13f),
                              0.07f + t * 0.16f,
                             -0.02f - (1.0f - std::cos(a)) * 0.13f },
                   0.046f - t * 0.020f, 4, 6, S.horn);
        }
      }
    } else if(S.headGear == HG_TUSKS){
      for(int side = -1; side <= 1; side += 2){
        v3 base = hd + v3{ side * S.headR * 0.42f, -S.headR * 0.28f, S.headLen * 0.80f };
        for(int k = 0; k < 3; k++){
          float t = k / 3.0f;
          b.sphere(base + v3{ side * t * 0.02f, t * 0.09f, t * 0.04f },
                   0.024f - t * 0.007f, 3, 5, S.horn);
        }
      }
    }
    b.mat(S.rough, 0.0f);
  }

  // ---- tail
  {
    b.joint = Q_TAIL1;
    v3 t1 = at(Q_TAIL1);
    float tr = S.tail == TK_BUSHY ? S.bodyR * 0.40f : S.bodyR * 0.16f;
    b.sphere(t1 + v3{0, -0.02f, -0.06f}, tr, 4, 7, S.coat, {1.0f, 1.0f, 1.7f});
    b.joint = Q_TAIL2;
    v3 t2 = at(Q_TAIL2);
    if(S.tail == TK_STUB){
      b.sphere(t2 + v3{0, 0.02f, -0.02f}, S.bodyR * 0.22f, 4, 6, S.belly);
    } else if(S.tail == TK_BUSHY){
      b.sphere(t2 + v3{0, -0.02f, -0.10f}, S.bodyR * 0.46f, 5, 8, S.coat, {1.0f, 1.0f, 1.9f});
    } else if(S.tail == TK_FLAG){
      b.sphere(t2 + v3{0, 0.0f, -0.07f}, S.bodyR * 0.30f, 4, 7, S.belly, {1.0f, 1.5f, 1.5f});
    } else {
      for(int k = 0; k < 3; k++)
        b.sphere(t2 + v3{0, -0.01f * k, -0.07f * k}, S.bodyR * (0.15f - k * 0.03f), 3, 6, S.coat);
    }
  }

  // ---- four legs
  {
    struct LegIds { int hip, knee, foot; };
    const LegIds legs[4] = {
      { Q_FL_HIP, Q_FL_KNEE, Q_FL_FOOT }, { Q_FR_HIP, Q_FR_KNEE, Q_FR_FOOT },
      { Q_BL_HIP, Q_BL_KNEE, Q_BL_FOOT }, { Q_BR_HIP, Q_BR_KNEE, Q_BR_FOOT }
    };
    const JointDef* jd = quadJointDefs();
    for(int i = 0; i < 4; i++){
      const LegIds& L = legs[i];
      bool front = i < 2;
      // segment lengths come straight from the rig, so the mesh can never
      // drift apart from the bones it is skinned to
      float upper = -jd[L.knee].offset.y;
      float lower = -jd[L.foot].offset.y;

      b.joint = L.hip;
      // haunch: a fuller mass around the hip, blending into the torso
      b.sphere(at(L.hip) + v3{0, -upper * 0.16f, 0},
               S.legThick * (front ? 1.9f : 2.5f), 4, 7, S.coat,
               {0.90f, 1.15f, 1.00f});
      // upper segment spans hip -> knee, with a little overlap at each end
      {
        float r = S.legThick * 1.10f;
        b.sphere(at(L.hip) + v3{0, -upper * 0.50f, 0}, r, 4, 7, S.coat,
                 {1.0f, (upper * 0.60f) / r, 1.0f});
      }
      // lower segment spans knee -> foot
      b.joint = L.knee;
      {
        float r = S.legThick * 0.82f;
        b.sphere(at(L.knee) + v3{0, -lower * 0.50f, 0}, r, 4, 7, S.coat,
                 {1.0f, (lower * 0.58f) / r, 1.0f});
      }
      b.joint = L.foot;
      b.mat(0.35f, 0.0f);
      b.sphere(at(L.foot) + v3{0, -0.012f, 0.012f}, S.legThick * 1.00f, 4, 6,
               {0.13f, 0.11f, 0.10f}, {1.0f, 0.70f, 1.30f});
      b.mat(S.rough, 0.0f);
    }
  }

  // bake the species scale into the mesh so the instance matrix stays clean
  if(S.scale != 1.0f) for(auto& v : b.verts) v.pos = v.pos * S.scale;
  b.finish(out);
}

// ---------------------------------------------------------------- our roster
enum Species : int {
  SP_DEER = 0, SP_ELK, SP_WOLF, SP_BEAR, SP_BOAR, SP_FOX,
  SP_RABBIT, SP_BIGHORN, SP_COUNT
};

inline const QuadSpec* speciesTable(){
  static const QuadSpec T[SP_COUNT] = {
    // name        scale bodyLen bodyR chestR rumpR neckR headLen headR snout legT  earL earW  gear        tail      coat                      belly                     face                      horn                      rough
    { "Deer",      1.00f, 1.00f, 0.20f, 0.21f, 0.22f, 0.11f, 0.17f, 0.11f, 0.11f, 0.040f, 0.10f, 0.55f, HG_ANTLERS, TK_FLAG, {0.55f,0.38f,0.22f}, {0.82f,0.75f,0.64f}, {0.44f,0.31f,0.19f}, {0.72f,0.66f,0.52f}, 0.78f },
    { "Elk",       1.32f, 1.06f, 0.24f, 0.26f, 0.25f, 0.14f, 0.20f, 0.13f, 0.13f, 0.050f, 0.11f, 0.55f, HG_ANTLERS, TK_STUB, {0.40f,0.29f,0.18f}, {0.66f,0.58f,0.44f}, {0.26f,0.19f,0.13f}, {0.70f,0.63f,0.48f}, 0.80f },
    { "Wolf",      0.86f, 1.02f, 0.18f, 0.19f, 0.18f, 0.12f, 0.19f, 0.10f, 0.13f, 0.038f, 0.08f, 0.70f, HG_NONE,    TK_BUSHY,{0.44f,0.42f,0.40f}, {0.72f,0.70f,0.66f}, {0.34f,0.32f,0.30f}, {0.60f,0.60f,0.60f}, 0.84f },
    { "Bear",      1.28f, 0.94f, 0.30f, 0.31f, 0.30f, 0.18f, 0.18f, 0.15f, 0.11f, 0.062f, 0.07f, 0.95f, HG_NONE,    TK_STUB, {0.20f,0.15f,0.12f}, {0.26f,0.20f,0.16f}, {0.30f,0.24f,0.18f}, {0.60f,0.60f,0.60f}, 0.88f },
    { "Boar",      0.80f, 0.92f, 0.23f, 0.25f, 0.21f, 0.14f, 0.20f, 0.10f, 0.15f, 0.036f, 0.06f, 0.80f, HG_TUSKS,   TK_STUB, {0.28f,0.23f,0.20f}, {0.38f,0.33f,0.29f}, {0.22f,0.18f,0.16f}, {0.84f,0.82f,0.74f}, 0.86f },
    { "Fox",       0.58f, 1.00f, 0.15f, 0.15f, 0.15f, 0.10f, 0.17f, 0.09f, 0.12f, 0.028f, 0.10f, 0.62f, HG_NONE,    TK_BUSHY,{0.74f,0.36f,0.14f}, {0.92f,0.88f,0.84f}, {0.66f,0.30f,0.12f}, {0.60f,0.60f,0.60f}, 0.80f },
    { "Rabbit",    0.34f, 0.86f, 0.16f, 0.15f, 0.18f, 0.09f, 0.13f, 0.09f, 0.07f, 0.026f, 0.22f, 0.42f, HG_NONE,    TK_STUB, {0.58f,0.52f,0.46f}, {0.90f,0.88f,0.84f}, {0.50f,0.44f,0.40f}, {0.60f,0.60f,0.60f}, 0.82f },
    { "Bighorn",   0.94f, 0.96f, 0.22f, 0.23f, 0.22f, 0.13f, 0.17f, 0.11f, 0.10f, 0.044f, 0.07f, 0.60f, HG_HORNS,   TK_STUB, {0.60f,0.52f,0.42f}, {0.86f,0.82f,0.74f}, {0.52f,0.45f,0.36f}, {0.52f,0.46f,0.36f}, 0.84f }
  };
  return T;
}

// ============================================================================
//  BIRD — small separate build, wings animated by two joints
// ============================================================================
enum BJoint : int { B_BODY = 0, B_WING_L, B_WING_R, B_TAIL, BJOINT_COUNT };

inline const JointDef* birdJointDefs(){
  static const JointDef d[BJOINT_COUNT] = {
    /* BODY   */ { -1,       { 0.00f, 0.00f,  0.00f } },
    /* WING_L */ { B_BODY,   { 0.05f, 0.02f,  0.00f } },
    /* WING_R */ { B_BODY,   {-0.05f, 0.02f,  0.00f } },
    /* TAIL   */ { B_BODY,   { 0.00f, 0.00f, -0.10f } }
  };
  return d;
}

inline void buildBird(gfx::Mesh& out, const v3& body, const v3& wing){
  Builder b;
  b.mat(0.72f, 0.0f);
  b.joint = B_BODY;
  b.sphere({0, 0, 0}, 0.085f, 5, 8, body, {0.85f, 0.85f, 1.65f});
  b.sphere({0, 0.045f, 0.10f}, 0.050f, 4, 6, body);                 // head
  b.mat(0.35f, 0.0f);
  b.sphere({0, 0.030f, 0.152f}, 0.020f, 3, 5, {0.85f, 0.62f, 0.15f}, {0.7f,0.7f,1.9f});
  b.mat(0.72f, 0.0f);
  b.joint = B_WING_L;
  b.sphere({0.105f, 0.0f, -0.01f}, 0.070f, 4, 7, wing, {2.15f, 0.22f, 1.20f});
  b.joint = B_WING_R;
  b.sphere({-0.105f, 0.0f, -0.01f}, 0.070f, 4, 7, wing, {2.15f, 0.22f, 1.20f});
  b.joint = B_TAIL;
  b.sphere({0, 0.005f, -0.075f}, 0.050f, 4, 6, wing, {0.95f, 0.22f, 1.55f});
  b.finish(out);
}

// ============================================================================
//  STREET FURNITURE — more of our own props for the city
// ============================================================================
inline void buildBench(gfx::Mesh& out){
  Builder b;
  b.mat(0.74f, 0.0f);
  const v3 wood{0.42f, 0.29f, 0.17f};
  for(int i = 0; i < 3; i++) b.box({0, 0.45f, -0.18f + i * 0.17f}, {0.85f, 0.028f, 0.070f}, wood);
  for(int i = 0; i < 3; i++)
    b.box({0, 0.62f + i * 0.15f, -0.26f}, {0.85f, 0.060f, 0.026f}, wood,
          quat::axisAngle({1,0,0}, -0.22f));
  b.mat(0.42f, 0.55f);
  const v3 iron{0.16f, 0.17f, 0.18f};
  for(int side = -1; side <= 1; side += 2){
    b.box({side * 0.74f, 0.22f, 0.0f},  {0.030f, 0.22f, 0.030f}, iron);
    b.box({side * 0.74f, 0.22f, -0.20f},{0.030f, 0.22f, 0.030f}, iron);
    b.box({side * 0.74f, 0.44f, -0.09f},{0.034f, 0.026f, 0.24f}, iron);
    b.box({side * 0.74f, 0.74f, -0.28f},{0.030f, 0.30f, 0.030f}, iron);
  }
  b.finish(out);
}

inline void buildHydrant(gfx::Mesh& out){
  Builder b;
  b.mat(0.48f, 0.15f);
  const v3 red{0.66f, 0.10f, 0.08f};
  b.cylinder({0, 0.045f, 0}, 0.155f, 0.045f, 10, {0.22f, 0.22f, 0.24f});
  b.cylinder({0, 0.30f, 0}, 0.105f, 0.26f, 10, red, quat(), 0.098f);
  b.sphere({0, 0.58f, 0}, 0.105f, 4, 8, red, {1.0f, 0.68f, 1.0f});
  b.cylinder({0, 0.665f, 0}, 0.030f, 0.030f, 6, red);
  for(int side = -1; side <= 1; side += 2)
    b.cylinder({side * 0.115f, 0.36f, 0}, 0.046f, 0.045f, 8, red,
               quat::axisAngle({0,0,1}, m::PI * 0.5f));
  b.cylinder({0, 0.36f, 0.115f}, 0.046f, 0.045f, 8, red, quat::axisAngle({1,0,0}, m::PI * 0.5f));
  b.finish(out);
}

inline void buildBin(gfx::Mesh& out){
  Builder b;
  b.mat(0.66f, 0.25f);
  b.cylinder({0, 0.40f, 0}, 0.24f, 0.40f, 12, {0.20f, 0.26f, 0.22f}, quat(), 0.27f);
  b.mat(0.44f, 0.5f);
  b.cylinder({0, 0.83f, 0}, 0.285f, 0.035f, 12, {0.14f, 0.16f, 0.15f});
  b.cylinder({0, 0.88f, 0}, 0.20f, 0.030f, 10, {0.10f, 0.11f, 0.11f});
  b.finish(out);
}

inline void buildBusStop(gfx::Mesh& out){
  Builder b;
  b.mat(0.40f, 0.6f);
  const v3 frame{0.22f, 0.24f, 0.27f};
  for(int side = -1; side <= 1; side += 2){
    b.box({side * 1.30f, 1.20f, -0.55f}, {0.045f, 1.20f, 0.045f}, frame);
    b.box({side * 1.30f, 1.20f,  0.55f}, {0.045f, 1.20f, 0.045f}, frame);
  }
  b.box({0, 2.44f, 0}, {1.40f, 0.045f, 0.68f}, frame);
  b.mat(0.08f, 0.30f);
  b.box({0, 1.30f, -0.58f}, {1.26f, 0.95f, 0.012f}, {0.20f, 0.30f, 0.36f});
  b.mat(0.60f, 0.0f);
  b.box({0, 0.52f, -0.34f}, {1.10f, 0.035f, 0.18f}, {0.34f, 0.30f, 0.26f});
  b.mat(0.30f, 0.1f);
  b.box({1.30f, 1.85f, 0.58f}, {0.42f, 0.55f, 0.020f}, {1.6f, 1.4f, 0.7f});
  b.finish(out);
}

} // namespace models
