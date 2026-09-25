#include "geometry/Noise.hpp"

#include <cmath>
#include <utility>

namespace game::geometry {

namespace {
constexpr int kGrad3[36] = {
    1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
    1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
    0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
};
} // namespace

double Rng::next() {
    // JS:
    //   x ^= x << 13; x >>>= 0;
    //   x ^= x >> 17;          <- ToInt32 then arithmetic shift
    //   x ^= x << 5;  x >>>= 0;
    uint32_t x = s_;
    x ^= x << 13;
    int32_t xi = static_cast<int32_t>(x);
    xi ^= (xi >> 17); // arithmetic shift: well defined since C++20
    x = static_cast<uint32_t>(xi);
    x ^= x << 5;
    s_ = x;
    return static_cast<double>(x) / 4294967296.0;
}

int Rng::integer(int n) {
    if (n <= 0) return 0;
    const double f = std::floor(next() * n);
    return static_cast<int>(f) % n;
}

Noise::Noise(uint32_t seed) {
    Rng rng(seed);
    std::array<uint8_t, 256> p{};
    for (int i = 0; i < 256; ++i) p[i] = static_cast<uint8_t>(i);
    for (int i = 255; i > 0; --i) {
        const int j = rng.integer(i + 1);
        std::swap(p[i], p[j]);
    }
    for (int i = 0; i < 512; ++i) {
        perm_[i] = p[i & 255];
        permMod12_[i] = static_cast<uint8_t>(perm_[i] % 12);
    }
}

double Noise::noise3(double xin, double yin, double zin) const {
    constexpr double F3 = 1.0 / 3.0, G3 = 1.0 / 6.0;
    double n0, n1, n2, n3;
    const double s = (xin + yin + zin) * F3;
    const double fi = std::floor(xin + s), fj = std::floor(yin + s), fk = std::floor(zin + s);
    const double t = (fi + fj + fk) * G3;
    const double x0 = xin - (fi - t), y0 = yin - (fj - t), z0 = zin - (fk - t);
    int i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
        if (y0 >= z0)      { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else               { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
        if (y0 < z0)       { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0)  { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else               { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const double x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const double x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const double x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    // JS `i & 255` works on the int32 two's-complement view, negatives included.
    const int ii = static_cast<int>(static_cast<int64_t>(fi)) & 255;
    const int jj = static_cast<int>(static_cast<int64_t>(fj)) & 255;
    const int kk = static_cast<int>(static_cast<int64_t>(fk)) & 255;
    const auto& perm = perm_;
    const auto& permMod12 = permMod12_;

    double t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0; else {
        const int gi0 = permMod12[ii + perm[jj + perm[kk]]] * 3;
        t0 *= t0;
        n0 = t0 * t0 * (kGrad3[gi0] * x0 + kGrad3[gi0 + 1] * y0 + kGrad3[gi0 + 2] * z0);
    }
    double t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0; else {
        const int gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
        t1 *= t1;
        n1 = t1 * t1 * (kGrad3[gi1] * x1 + kGrad3[gi1 + 1] * y1 + kGrad3[gi1 + 2] * z1);
    }
    double t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0; else {
        const int gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
        t2 *= t2;
        n2 = t2 * t2 * (kGrad3[gi2] * x2 + kGrad3[gi2 + 1] * y2 + kGrad3[gi2 + 2] * z2);
    }
    double t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0; else {
        const int gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
        t3 *= t3;
        n3 = t3 * t3 * (kGrad3[gi3] * x3 + kGrad3[gi3 + 1] * y3 + kGrad3[gi3 + 2] * z3);
    }
    return 32 * (n0 + n1 + n2 + n3);
}

double Noise::fbm(double x, double y, double z, int octaves, double lacunarity, double gain) const {
    double amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (int o = 0; o < octaves; ++o) {
        sum += amp * noise3(x * freq, y * freq, z * freq);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    return sum / norm;
}

} // namespace game::geometry
