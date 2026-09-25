// Deterministic value/gradient noise used by terrain, scattering and the sim.
#pragma once
#include <cstdint>

namespace ps {

uint32_t hash32(uint32_t x);
uint32_t hash2i(int x, int y, uint32_t seed = 0);
float hash01(int x, int y, uint32_t seed = 0);           // [0,1)
float valueNoise(float x, float y, uint32_t seed = 0);   // [-1,1]
float fbm(float x, float y, int octaves, uint32_t seed = 0, float lacunarity = 2.0f, float gain = 0.5f);
float ridged(float x, float y, int octaves, uint32_t seed = 0);

// Small deterministic RNG (PCG-ish)
struct Rng {
    uint64_t state;
    explicit Rng(uint64_t seed = 0x853c49e6748fea9bULL) : state(seed * 6364136223846793005ULL + 1442695040888963407ULL) {}
    uint32_t next() {
        uint64_t old = state;
        state = old * 6364136223846793005ULL + 1442695040888963407ULL;
        uint32_t xs = uint32_t(((old >> 18u) ^ old) >> 27u);
        uint32_t rot = uint32_t(old >> 59u);
        return (xs >> rot) | (xs << ((32 - rot) & 31));
    }
    float uniform() { return (next() >> 8) * (1.0f / 16777216.0f); }
    float range(float a, float b) { return a + (b - a) * uniform(); }
    int irange(int a, int b) { return a + int(next() % uint32_t(b - a + 1)); }
};

}  // namespace ps
