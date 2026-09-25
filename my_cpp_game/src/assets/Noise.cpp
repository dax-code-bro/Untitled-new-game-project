#include "assets/detail/FpStrict.hpp"

#include "assets/Noise.hpp"

#include <cmath>

#include "assets/detail/JsMath.hpp"

namespace game::assets {

namespace {
constexpr double kGrad3[36] = {
    1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
    1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
    0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
};
}  // namespace

double Rng::next() {
  // x ^= x << 13; x >>>= 0;
  uint32_t x = s_;
  x ^= x << 13;
  // x ^= x >> 17;   -- ToInt32 then an ARITHMETIC shift, as JS does it.
  int32_t xi = static_cast<int32_t>(x);
  xi ^= (xi >> 17);
  x = static_cast<uint32_t>(xi);
  // x ^= x << 5; x >>>= 0;
  x ^= x << 5;
  s_ = x;
  return static_cast<double>(x) / 4294967296.0;
}

int Rng::intBelow(int n) {
  const double f = std::floor(next() * n);
  return static_cast<int>(std::fmod(f, static_cast<double>(n)));
}

Noise::Noise(uint32_t seed) {
  Rng rng(seed);
  std::array<uint8_t, 256> p{};
  for (int i = 0; i < 256; i++) p[i] = static_cast<uint8_t>(i);
  for (int i = 255; i > 0; i--) {
    const int j = rng.intBelow(i + 1);
    const uint8_t t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (int i = 0; i < 512; i++) {
    perm_[i] = p[i & 255];
    permMod12_[i] = static_cast<uint8_t>(perm_[i] % 12);
  }
}

/* 3D simplex noise, transcribed operation for operation from 10-math.js.
   Every sum is left-associated exactly as the JS source groups it; do not
   "simplify" (x0 - i1 + G3) into x0 + (G3 - i1) -- it is a different
   double. */
double Noise::noise3(double xin, double yin, double zin) const {
  const double F3 = 1.0 / 3.0, G3 = 1.0 / 6.0;
  const uint8_t* perm = perm_.data();
  const uint8_t* permMod12 = permMod12_.data();
  double n0, n1, n2, n3;
  const double s = (xin + yin + zin) * F3;
  const double i = std::floor(xin + s), j = std::floor(yin + s), k = std::floor(zin + s);
  const double t = (i + j + k) * G3;
  const double x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
  int i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  }
  const double x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
  const double x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
  const double x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
  // `i & 255` in JS is ToInt32(i) & 255: two's complement, so -1 -> 255.
  const int ii = static_cast<int>(i) & 255;
  const int jj = static_cast<int>(j) & 255;
  const int kk = static_cast<int>(k) & 255;

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

/* Fractal Brownian motion -- the workhorse for texture and terrain detail. */
double Noise::fbm(double x, double y, double z, int octaves, double lacunarity,
                  double gain) const {
  double amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (int o = 0; o < octaves; o++) {
    sum += amp * noise3(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/* Ridged noise: sharp creases, ideal for rock, bark and mountain silhouettes. */
double Noise::ridged(double x, double y, double z, int octaves) const {
  double amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (int o = 0; o < octaves; o++) {
    const double n = 1 - std::fabs(noise3(x * freq, y * freq, z * freq));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/* TextureLib.worley. The hash is formed exactly as JS forms it: each
   product is a DOUBLE product, each operand of `^` goes through ToInt32,
   and `>>> 0` reinterprets the result as unsigned. toUint32 of each
   product then XOR is the same bit pattern. */
Cell Noise::cells(double x, double y, double seed, double period) {
  using detail::toUint32;
  const double ix = std::floor(x), iy = std::floor(y);
  double d1 = 1e9, d2 = 1e9;
  uint32_t best = 0;
  const uint32_t hs = toUint32(seed * 83492791);
  /* Every caller passes a whole-number period and the cell coordinates
     are whole numbers (floor + a small offset), so the JS double `%`
     folding is plain integer arithmetic -- same values, and no fmod
     calls (this loop made 36 of them per sample). The fmod path is kept
     for a fractional period or coordinates too big for int64. */
  const bool integral = period == std::floor(period) && period >= 1 && period < 1e9 &&
                        std::fabs(ix) < 1e15 && std::fabs(iy) < 1e15;
  const int64_t ip = integral ? static_cast<int64_t>(period) : 1;
  auto fold = [&](double c) {
    if (integral) {
      const int64_t w = ((static_cast<int64_t>(c) % ip) + ip) % ip;
      return static_cast<double>(w);
    }
    return std::fmod(std::fmod(c, period) + period, period);
  };
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      const double cx = ix + i, cy = iy + j;
      // Fold into the period so opposite edges agree.
      const double wx = fold(cx);
      const double wy = fold(cy);
      const uint32_t h = toUint32(wx * 73856093) ^ toUint32(wy * 19349663) ^ hs;
      const double jx = cx + 0.08 + (static_cast<double>(h % 1024u) / 1024) * 0.84;
      const double jy = cy + 0.08 + (static_cast<double>((h >> 10) % 1024u) / 1024) * 0.84;
      const double dx = jx - x, dy = jy - y;
      const double d = std::sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; best = h; }
      else if (d < d2) { d2 = d; }
    }
  }
  return Cell{d1, d2 - d1, static_cast<double>(best % 100003u) / 100003,
              static_cast<double>((best >> 7) % 100003u) / 100003};
}

}  // namespace game::assets
