// ---------------------------------------------------------------------------
//  The procedural material baker -- a port of TextureLib from
//  engine/src/40-material.js (LE.Textures.generate).
//
//  Nothing is downloaded: albedo, normal and ORM maps are synthesised
//  from noise. Each of the 46 recipes is a function of one texel that
//  writes colour, ambient occlusion, roughness, metalness and a height;
//  the height becomes the normal map (central differences on the RAW
//  float field) and is also packed into ORM alpha for parallax.
//
//  PARITY: at the same (kind, size, seed) the bytes match what the JS
//  produces -- tests/test_assets_parity.cpp holds every recipe to it
//  against a dump from tools/assets_dump.js. Recipes and noise run in
//  double precision because JavaScript does.
//
//  THREADING: bake() splits the rows across hardware_concurrency()
//  threads, twice -- once for the recipe pass and once for the normal
//  pass, which needs its neighbours' heights. The output is identical
//  whatever the thread count: every texel is a pure function of (u, v).
//
//  Layout of every map: RGBA8, size*size*4 bytes, row 0 first, exactly
//  as the JS lays it out (no vertical flip -- if a GL upload wants one,
//  that is the uploader's decision, not the baker's).
// ---------------------------------------------------------------------------
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace game::assets {

/* The fixed height window packed into ORM alpha:
       alpha = clamp((h - kHeightBias) / kHeightSpan, 0, 1) * 255
   One window for every recipe, deliberately -- see the note on
   HEIGHT_BIAS in 40-material.js. Duplicated in the parallax GLSL. */
constexpr double kHeightBias = -0.45;
constexpr double kHeightSpan = 1.70;

struct MaterialMaps {
  int size = 0;
  std::vector<uint8_t> albedo;   // sRGB colour, a = 255
  std::vector<uint8_t> normal;   // tangent-space, a = 255
  std::vector<uint8_t> orm;      // r = AO, g = roughness, b = metalness, a = packed height
  /* What this recipe's relief actually is, in the recipe's height units,
     clamped into the packed window (JS maps.heightTop / heightRange). The
     shader scales parallax depth by it so a blued receiver and a pantile
     roof come out at their real relative depths. */
  double heightTop = 0;
  double heightRange = 0;
};

/* Bake one recipe. Throws std::invalid_argument on an unknown kind (the JS
   silently fell back to concrete) or a size outside 1..32768. */
MaterialMaps bake(const std::string& kind, int size, uint32_t seed = 1);

/* Same, with an explicit thread count (0 = hardware_concurrency). The
   bytes do not depend on it; it exists for benchmarking. */
MaterialMaps bake(const std::string& kind, int size, uint32_t seed, unsigned threads);

/* TextureLib.heightToNormal: a size*size height field (row 0 first) to a
   tangent-space RGBA8 normal map by central differences, wrapping at the
   edges. Heights are float because the JS keeps them in a Float32Array;
   strength defaults to 2 as the JS signature does (bake() passes the
   recipe's own normalStrength). Throws std::invalid_argument if
   height.size() != size*size. threads: 0 = hardware_concurrency. */
std::vector<uint8_t> heightToNormal(const std::vector<float>& height, int size,
                                    double strength = 2, unsigned threads = 0);

/* The recipe names, in LE.Textures.kinds order. */
const std::vector<std::string>& kinds();

/* TextureLib.normalStrength[kind] || 3 -- the strength the baker used for
   this recipe's normal map. Throws std::invalid_argument on unknown kind. */
double normalStrength(const std::string& kind);

/* TextureLib.wholeMaterial: true if the recipe is the finished material
   (expects a white tint), false if it is a variation layer meant to be
   multiplied by the material's colour. */
bool isWholeMaterial(const std::string& kind);

}  // namespace game::assets
