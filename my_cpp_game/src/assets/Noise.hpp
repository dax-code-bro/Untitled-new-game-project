// ---------------------------------------------------------------------------
//  The noise the material recipes are built from -- a port of `Rng` and
//  `Noise` from engine/src/10-math.js and `TextureLib.worley` from
//  engine/src/40-material.js.
//
//  DOUBLE PRECISION THROUGHOUT, because JavaScript numbers are doubles and
//  the baker is held to byte parity with the JS. A float port of simplex
//  noise is a perfectly good noise and a different texture.
//
//  What the recipes actually call, found by reading every one of them:
//      n.fbm(x, y, z, octaves)      45 of 46 recipes
//      n.ridged(x, y, z, octaves)   rock
//      n.cells(x, y, seed, period)  setts, gravel  (-> worley below)
//  and underneath all three, 3D simplex noise (`noise3`). There is no
//  value noise, no 2D gradient noise and no lacunarity/gain other than
//  the defaults anywhere in the bank.
//
//  A Noise is immutable after construction, so one instance is shared
//  read-only by every baking thread.
// ---------------------------------------------------------------------------
#pragma once

#include <array>
#include <cstdint>

namespace game::assets {

/* xorshift32, exactly as 10-math.js writes it -- including the middle
   step, which in JS is a SIGNED shift (`x >> 17` on a value that has just
   been through `>>> 0`), so it sign-extends whenever bit 31 is set. A
   textbook xorshift32 uses a logical shift there and produces a different
   permutation table from the very first swap. */
class Rng {
 public:
  explicit Rng(uint32_t seed = 1) : s_(seed ? seed : 1u) {}
  double next();                     // [0, 1)
  int intBelow(int n);               // JS rng.int(n): floor(next() * n) % n
 private:
  uint32_t s_;
};

/* One Worley sample: distance to the nearest feature point, F2 - F1 (zero
   exactly on a cell boundary) and two hashes that are stable across the
   whole cell because they hash the FEATURE POINT, not the grid square. */
struct Cell {
  double d1;
  double edge;
  double id;
  double id2;
};

class Noise {
 public:
  explicit Noise(uint32_t seed = 1337);

  double noise3(double x, double y, double z) const;
  double fbm(double x, double y, double z, int octaves = 4,
             double lacunarity = 2, double gain = 0.5) const;
  double ridged(double x, double y, double z, int octaves = 4) const;

  /* `n.cells` in the JS: cellular noise, wrapped to `period` so the
     texture still tiles. Static in spirit -- it uses no permutation
     table -- but lives here because that is where the recipes reach it. */
  static Cell cells(double x, double y, double seed, double period);

 private:
  std::array<uint8_t, 512> perm_{};
  std::array<uint8_t, 512> permMod12_{};
};

}  // namespace game::assets
