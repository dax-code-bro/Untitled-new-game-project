// ---------------------------------------------------------------------------
//  JavaScript number semantics, where they differ from the obvious C++.
//
//  The material baker is a port whose correctness is measured by BYTE
//  PARITY with engine/src/40-material.js, so every helper here reproduces
//  what V8 does rather than what would be natural in C++:
//
//    clamp / lerp / smoothstep   exact transcriptions of 10-math.js,
//                                including the operation order.
//    jmin / jmax                 Math.min / Math.max: NaN propagates
//                                (std::min/std::max silently drop it).
//    jsHypot                     V8's Math.hypot, which is NOT a libm
//                                hypot: it normalises by the larger
//                                magnitude and Kahan-sums the squares.
//                                glibc's hypot disagrees with it in the
//                                last bit on ~37% of inputs; this one was
//                                checked bit-identical on 200k pairs.
//    toUint32                    ToUint32 (the `>>> 0` and the operands
//                                of `^`), applied to the DOUBLE product
//                                JS actually formed.
//    toUint8                     a store into a Uint8Array: NaN and
//                                infinities become 0, everything else
//                                truncates toward zero, modulo 256.
//
//  Nothing in this header may be compiled with FP contraction: a fused
//  multiply-add rounds once where JavaScript rounds twice, and the whole
//  point of the port is to round where JavaScript rounds. The .cpp files
//  that use it switch contraction off explicitly (see FpStrict.hpp).
// ---------------------------------------------------------------------------
#pragma once

#include <cmath>
#include <cstdint>
#include <limits>
#include <numbers>

namespace game::assets::detail {

inline constexpr double kPi = std::numbers::pi;   // == Math.PI, bit for bit

inline double clamp(double v, double lo, double hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
inline double lerp(double a, double b, double t) { return a + (b - a) * t; }
inline double smoothstep(double a, double b, double x) {
  const double t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

inline double jmax(double a, double b) {
  if (std::isnan(a) || std::isnan(b)) return std::numeric_limits<double>::quiet_NaN();
  return a > b ? a : b;
}
inline double jmin(double a, double b) {
  if (std::isnan(a) || std::isnan(b)) return std::numeric_limits<double>::quiet_NaN();
  return a < b ? a : b;
}

/* V8's MathHypot (src/builtins/math.tq), two-argument case. */
inline double jsHypot(double a, double b) {
  if (std::isinf(a) || std::isinf(b)) return std::numeric_limits<double>::infinity();
  if (std::isnan(a) || std::isnan(b)) return std::numeric_limits<double>::quiet_NaN();
  const double aa = std::fabs(a), ab = std::fabs(b);
  double mx = 0;
  if (aa > mx) mx = aa;
  if (ab > mx) mx = ab;
  if (mx == 0) return 0;
  double sum = 0, compensation = 0;
  const double vals[2] = {aa, ab};
  for (double x : vals) {
    const double n = x / mx;
    const double summand = n * n - compensation;
    const double preliminary = sum + summand;
    compensation = (preliminary - sum) - summand;
    sum = preliminary;
  }
  return std::sqrt(sum) * mx;
}

/* ECMAScript ToUint32. */
inline uint32_t toUint32(double d) {
  if (!std::isfinite(d)) return 0;
  d = std::trunc(d);
  d = std::fmod(d, 4294967296.0);
  if (d < 0) d += 4294967296.0;
  return static_cast<uint32_t>(d);
}

/* Assignment into a Uint8Array (ECMAScript ToUint8). */
inline uint8_t toUint8(double d) {
  if (!std::isfinite(d)) return 0;
  d = std::trunc(d);
  if (d >= 0 && d < 256) return static_cast<uint8_t>(d);   // the only path the baker takes
  d = std::fmod(d, 256.0);
  if (d < 0) d += 256.0;
  return static_cast<uint8_t>(d);
}

}  // namespace game::assets::detail
