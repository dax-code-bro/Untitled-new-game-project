// Internal: the recipe table shared by Recipes.cpp and MaterialBaker.cpp.
#pragma once

#include <span>
#include <string_view>

#include "assets/Noise.hpp"

namespace game::assets::detail {

/* The `c` object every JS recipe writes into. Reset to these values
   before every texel, as TextureLib.generate does. */
struct Texel {
  double r = 1, g = 1, b = 1;
  double ao = 1, rough = 0.8, metal = 0, h = 0.5;
};

using RecipeFn = void (*)(double u, double v, const Noise& n, Texel& c);

struct Recipe {
  std::string_view name;
  RecipeFn fn;
  double normalStrength;   // TextureLib.normalStrength[kind] || 3
  bool wholeMaterial;      // TextureLib.wholeMaterial.has(kind)
};

/* All 46, in LE.Textures.kinds order. */
std::span<const Recipe> recipes();
const Recipe* findRecipe(std::string_view name);

}  // namespace game::assets::detail
