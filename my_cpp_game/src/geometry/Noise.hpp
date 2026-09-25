#pragma once
// Port of Rng and Noise from engine/src/10-math.js.
//
// Both are deterministic and seeded, and Shapes::rock depends on them, so they
// are ported bit-for-bit: same xorshift32 (including the JS quirk that `>> 17`
// is an ARITHMETIC shift on the int32 view of the state), same permutation
// shuffle, same simplex-noise arithmetic in double precision.
#include <array>
#include <cstdint>

namespace game::geometry {

class Rng {
public:
    // JS: this.s = (seed >>> 0) || 1
    explicit Rng(uint32_t seed = 1) : s_(seed ? seed : 1u) {}

    // Uniform in [0, 1).
    double next();
    double range(double a, double b) { return a + (b - a) * next(); }
    // JS: Math.floor(this.next() * n) % n   (n > 0)
    int integer(int n);

    uint32_t state() const { return s_; }

private:
    uint32_t s_;
};

class Noise {
public:
    explicit Noise(uint32_t seed = 1337);

    // 3D simplex noise, roughly in [-1, 1].
    double noise3(double x, double y, double z) const;

    // Fractal Brownian motion, normalised by the amplitude sum.
    double fbm(double x, double y, double z, int octaves = 4,
               double lacunarity = 2.0, double gain = 0.5) const;

private:
    std::array<uint8_t, 512> perm_{};
    std::array<uint8_t, 512> permMod12_{};
};

} // namespace game::geometry
