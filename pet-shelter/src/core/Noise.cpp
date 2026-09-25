#include "core/Noise.h"
#include <cmath>

namespace ps {

uint32_t hash32(uint32_t x) {
    x ^= x >> 16; x *= 0x7feb352dU;
    x ^= x >> 15; x *= 0x846ca68bU;
    x ^= x >> 16;
    return x;
}

uint32_t hash2i(int x, int y, uint32_t seed) {
    return hash32(uint32_t(x) * 0x8da6b343U ^ hash32(uint32_t(y) * 0xd8163841U ^ seed * 0xcb1ab31fU));
}

float hash01(int x, int y, uint32_t seed) { return (hash2i(x, y, seed) >> 8) * (1.0f / 16777216.0f); }

static inline float fade(float t) { return t * t * t * (t * (t * 6.0f - 15.0f) + 10.0f); }

float valueNoise(float x, float y, uint32_t seed) {
    float fx = std::floor(x), fy = std::floor(y);
    int ix = int(fx), iy = int(fy);
    float tx = fade(x - fx), ty = fade(y - fy);
    float a = hash01(ix, iy, seed), b = hash01(ix + 1, iy, seed);
    float c = hash01(ix, iy + 1, seed), d = hash01(ix + 1, iy + 1, seed);
    float v = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    return v * 2.0f - 1.0f;
}

float fbm(float x, float y, int octaves, uint32_t seed, float lacunarity, float gain) {
    float sum = 0.0f, amp = 0.5f, freq = 1.0f, norm = 0.0f;
    for (int i = 0; i < octaves; ++i) {
        sum += amp * valueNoise(x * freq, y * freq, seed + uint32_t(i) * 101u);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    return sum / norm;
}

float ridged(float x, float y, int octaves, uint32_t seed) {
    float sum = 0.0f, amp = 0.5f, freq = 1.0f, norm = 0.0f, prev = 1.0f;
    for (int i = 0; i < octaves; ++i) {
        float n = 1.0f - std::fabs(valueNoise(x * freq, y * freq, seed + uint32_t(i) * 131u));
        n *= n;
        sum += n * amp * prev;
        prev = n;
        norm += amp;
        amp *= 0.5f;
        freq *= 2.0f;
    }
    return sum / norm;
}

}  // namespace ps
