// ---------------------------------------------------------------------------
//  The 46 surface recipes of TextureLib.kinds (engine/src/40-material.js),
//  transcribed OPERATION FOR OPERATION.
//
//  Rules this file keeps, because the parity test depends on every one:
//    * Every expression keeps the JS grouping. `a + b * c - d` is left
//      as written; `base * (2 - cool) * 0.99` stays ((base*(2-cool))*0.99).
//      Re-associating any of them is a different double.
//    * JS `%` on doubles is std::fmod (sign of the dividend), not an
//      integer modulo, and is used that way even where the operands are
//      whole numbers.
//    * The integer hashes are formed as JS forms them: a DOUBLE product,
//      then ToUint32 (see pantile, worley).
//    * Math.min / Math.max are jmin / jmax (NaN-propagating), Math.hypot
//      is jsHypot (V8's algorithm, not libm's).
//
//  The design notes on WHY each recipe is shaped the way it is live in
//  40-material.js, next to the numbers they justify, and are not
//  duplicated here; the short notes below are only the ones that matter
//  to someone changing the C++. Change a number here without changing it
//  there and the parity test will say so.
// ---------------------------------------------------------------------------
#include "assets/detail/FpStrict.hpp"

#include <cmath>
#include <cstring>

#include "assets/detail/JsMath.hpp"
#include "assets/detail/Recipes.hpp"

namespace game::assets::detail {
namespace {

using std::cos;
using std::exp;
using std::fabs;
using std::floor;
using std::fmod;
using std::pow;
using std::sin;
using std::sqrt;

constexpr double PI = kPi;

// ------------------------------------------------------------ architecture

void concrete(double u, double v, const Noise& n, Texel& c) {
  const double g = n.fbm(u * 8, v * 8, 0, 5) * 0.5 + 0.5;
  const double pits = jmax(0, n.fbm(u * 26, v * 26, 3.3, 3));
  const double stain = n.fbm(u * 3, v * 3, 9, 3) * 0.5 + 0.5;
  const double base = 0.66 + g * 0.18 - pits * 0.12;
  c.r = base * (0.98 + stain * 0.06);
  c.g = base * (0.97 + stain * 0.05);
  c.b = base * 0.95;
  /* Roughness contrast tied to the pits and staining; the MEAN is held,
     only the spread widens (see the JS note). */
  c.rough = clamp(0.855 + (g - 0.5) * 0.26 + pits * 0.22 - (stain - 0.5) * 0.16, 0.42, 1);
  c.ao = 1 - pits * 0.28;
  c.h = g * 0.42 - pits * 0.46;
}

void brick(double u, double v, const Noise& n, Texel& c) {
  /* Running bond, 12 courses by 4: exactly three bricks tall per brick
     wide, so a 0.9 m tile is a 225 x 75 brick. */
  const double rows = 12, cols = 4;
  const double ry = v * rows;
  const double row = floor(ry);
  const double offset = fmod(row, 2) * 0.5;
  const double rx = jsMod1(u * cols + offset);
  const double fy = jsMod1(ry);
  const double mortarX = jmin(rx, 1 - rx) * cols;
  const double mortarY = jmin(fy, 1 - fy) * rows;
  const double mortar = jmin(mortarX, mortarY);
  const bool isMortar = mortar < 0.22;
  const double grain = n.fbm(u * 40, v * 40, row * 3.7, 3) * 0.5 + 0.5;
  if (isMortar) {
    const double g = 0.5 + grain * 0.15;
    c.r = g; c.g = g * 0.98; c.b = g * 0.93;
    c.rough = clamp(0.96 + (grain - 0.5) * 0.12, 0.42, 1);
    c.ao = 0.45 + mortar * 1.4;
    c.h = 0.1 + grain * 0.1;
  } else {
    // Per-brick colour off the brick's cell. The product is exact in a
    // double (cell <= 311), so fmod on it is what JS computes.
    const double cell = floor(u * cols + offset) * 31 + row * 17;
    const double tint = fmod(cell * 2654435761.0, 1000) / 1000;
    const double shade = 0.55 + tint * 0.35 + grain * 0.12;
    c.r = shade * 0.62;
    c.g = shade * 0.30;
    c.b = shade * 0.23;
    c.rough = clamp(0.90 - tint * 0.16 + (grain - 0.5) * 0.18, 0.42, 1);
    c.ao = 1 - smoothstep(0.5, 0.22, mortar) * 0.35;
    c.h = 0.75 + grain * 0.2;
  }
}

void wood(double u, double v, const Noise& n, Texel& c) {
  /* Six boards per tile: seams, per-board tone, knots, sun-greying. */
  const double NP = 6;
  const double vp = v * NP;
  const double pi = floor(vp);
  const double pf = vp - pi;
  const double h1 = fmod(pi * 2654435761.0, 1000) / 1000;
  const double h2 = fmod(pi * 40503 + 17, 1000) / 1000;
  const double seam = jmin(pf, 1 - pf);
  const double seamK = 1 - smoothstep(0.0, 0.055, seam);
  const double wob = n.fbm(u * 3 + h1 * 8, pf * 1.2 + h2 * 5, 5, 3) * 0.35;
  const double rings = fabs(jsMod1(pf * 7 + wob + h1 * 3) * 2 - 1);
  const double fibre = n.fbm(u * 4, pf * 80 + pi * 13, 2, 2) * 0.5 + 0.5;
  const double dark = smoothstep(0.35, 0.85, rings);
  const double kd = jsHypot((u - h2) * 3.2, (pf - (0.5 + (h1 - 0.5) * 0.5)) * 1.0);
  const double knot = h1 > 0.62 ? (1 - smoothstep(0.02, 0.10, kd)) : 0;
  const double grey = smoothstep(0.45, 0.85, n.fbm(u * 1.7, v * 1.4, 21, 4) * 0.5 + 0.5);

  double base = 0.84 - dark * 0.20 + fibre * 0.09 - seamK * 0.30 - knot * 0.34;
  base += (h1 - 0.5) * 0.10;
  /* Weathering DESATURATES toward silver; it does not darken. */
  const double g2 = grey * 0.62;
  const auto tint = [g2](double t) { return t + (1 - t) * g2; };
  base *= 1 + grey * 0.05;
  c.r = base * tint(1.02);
  c.g = base * tint(0.95);
  c.b = base * tint(0.84);
  c.rough = clamp(0.60 + dark * 0.16 + seamK * 0.22 + grey * 0.10 - knot * 0.10, 0.42, 1);
  c.ao = 1 - dark * 0.12 - seamK * 0.45 - knot * 0.25;
  c.h = 0.5 + (1 - dark) * 0.28 + fibre * 0.10 - seamK * 0.55 - knot * 0.30;
}

void metal(double u, double v, const Noise& n, Texel& c) {
  /* Brush frequency stays under the bake resolution: 90 cycles, not 400. */
  const double brush = n.fbm(u * 90, v * 3, 1, 2) * 0.5 + 0.5;
  const double patina = n.fbm(u * 6, v * 6, 11, 4) * 0.5 + 0.5;
  const double scratch = pow(jmax(0, n.fbm(u * 34, v * 5, 21, 2)), 4) * 1.5;
  const double base = 0.62 + brush * 0.12 - patina * 0.08;
  c.r = base; c.g = base * 1.01; c.b = base * 1.04;
  c.metal = 1;
  c.rough = clamp(0.30 + brush * 0.16 + patina * 0.10 - scratch * 0.07, 0.16, 0.9);
  c.ao = 1;
  c.h = brush * 0.45 + scratch * 0.22;
}

void rust(double u, double v, const Noise& n, Texel& c) {
  const double blotch = n.fbm(u * 5, v * 5, 4, 5) * 0.5 + 0.5;
  const double grit = n.fbm(u * 60, v * 60, 8, 3) * 0.5 + 0.5;
  const double rusty = smoothstep(0.35, 0.75, blotch);
  c.r = lerp(0.72, 0.58, rusty) * (0.85 + grit * 0.3);
  c.g = lerp(0.72, 0.36, rusty) * (0.85 + grit * 0.3);
  c.b = lerp(0.73, 0.24, rusty) * (0.85 + grit * 0.3);
  c.metal = 1 - rusty * 0.95;
  c.rough = lerp(0.35, 0.95, rusty);
  c.ao = 1 - rusty * 0.25;
  c.h = grit * 0.4 + rusty * 0.4;
}

void rock(double u, double v, const Noise& n, Texel& c) {
  const double r = n.ridged(u * 6, v * 6, 0, 5);
  const double grain = n.fbm(u * 45, v * 45, 7, 3) * 0.5 + 0.5;
  const double base = 0.30 + r * 0.30 + grain * 0.08;
  c.r = base * 1.02; c.g = base * 0.99; c.b = base * 0.94;
  c.rough = clamp(0.84 - (r - 0.5) * 0.30 + (grain - 0.5) * 0.12, 0.42, 1);
  c.ao = 0.55 + r * 0.45;
  c.h = r * 0.9 + grain * 0.15;
}

void grass(double u, double v, const Noise& n, Texel& c) {
  const double patch = n.fbm(u * 7, v * 7, 2, 4) * 0.5 + 0.5;
  const double blade = n.fbm(u * 70, v * 70, 5, 2) * 0.5 + 0.5;
  const double dry = smoothstep(0.55, 0.85, n.fbm(u * 3, v * 3, 17, 3) * 0.5 + 0.5);
  const double lush = 0.20 + patch * 0.18 + blade * 0.08;
  c.r = lerp(lush * 0.42, lush * 0.95, dry);
  c.g = lerp(lush * 1.05, lush * 0.85, dry);
  c.b = lerp(lush * 0.28, lush * 0.42, dry);
  c.rough = clamp(0.955 - blade * 0.13 + dry * 0.10, 0.42, 1);
  c.ao = 0.7 + blade * 0.3;
  c.h = blade * 0.7 + patch * 0.3;
}

void dirt(double u, double v, const Noise& n, Texel& c) {
  const double clod = n.fbm(u * 12, v * 12, 3, 4) * 0.5 + 0.5;
  const double grit = n.fbm(u * 80, v * 80, 9, 2) * 0.5 + 0.5;
  const double base = 0.66 + clod * 0.20 + grit * 0.08;
  c.r = base * 1.02; c.g = base; c.b = base * 0.96;
  c.rough = clamp(0.965 - clod * 0.16 + grit * 0.07, 0.42, 1);
  c.ao = 0.72 + clod * 0.28;
  c.h = clod * 0.7 + grit * 0.3;
}

void sand(double u, double v, const Noise& n, Texel& c) {
  const double dune = n.fbm(u * 4, v * 16, 1, 3) * 0.5 + 0.5;
  const double grain = n.fbm(u * 150, v * 150, 6, 2) * 0.5 + 0.5;
  const double base = 0.62 + dune * 0.12 + grain * 0.06;
  c.r = base * 1.03; c.g = base * 0.99; c.b = base * 0.92;
  c.rough = clamp(0.945 - dune * 0.13 + grain * 0.05, 0.42, 1);
  c.ao = 0.85 + dune * 0.15;
  c.h = dune * 0.6 + grain * 0.4;
}

void marble(double u, double v, const Noise& n, Texel& c) {
  const double turb = n.fbm(u * 4, v * 4, 0, 6);
  const double vein = fabs(sin((u * 6 + turb * 3) * PI));
  const double v2 = pow(1 - vein, 8);
  const double base = 0.78 - v2 * 0.45;
  c.r = base; c.g = base * 0.99; c.b = base * 0.97;
  c.rough = 0.18 + v2 * 0.2;
  c.ao = 1;
  c.h = v2 * 0.4;
}

void ice(double u, double v, const Noise& n, Texel& c) {
  const double crack = pow(1 - fabs(n.fbm(u * 5, v * 5, 2, 4)), 6);
  const double cloud = n.fbm(u * 12, v * 12, 8, 3) * 0.5 + 0.5;
  c.r = 0.62 + cloud * 0.16;
  c.g = 0.80 + cloud * 0.14;
  c.b = 0.92 + cloud * 0.08;
  c.rough = 0.08 + crack * 0.5 + cloud * 0.08;
  c.ao = 1 - crack * 0.2;
  c.h = crack * 0.8;
}

void fabric(double u, double v, const Noise& n, Texel& c) {
  /* Soft over-under (product of two sines), not a hard XOR chessboard. */
  const double wu = sin(u * PI * 220), wv = sin(v * PI * 220);
  const double weave = wu * wv * 0.5 + 0.5;
  const double fuzz = n.fbm(u * 200, v * 200, 4, 2) * 0.5 + 0.5;
  const double slub = n.fbm(u * 26, v * 26, 17, 3) * 0.5 + 0.5;
  const double base = 0.80 + weave * 0.06 + fuzz * 0.07 + slub * 0.05;
  c.r = base * 0.99; c.g = base; c.b = base * 1.02;
  c.rough = 0.96 - slub * 0.04;
  c.ao = 0.86 + weave * 0.14;
  c.h = weave * 0.5 + fuzz * 0.2 + slub * 0.3;
}

// ------------------------------------------------------------ the body

void skin(double u, double v, const Noise& n, Texel& c) {
  const double pore = pow(n.fbm(u * 70, v * 70, 3, 2) * 0.5 + 0.5, 3);
  const double blotch = n.fbm(u * 9, v * 9, 12, 4) * 0.5 + 0.5;
  // The crease net: stretched 2.4:1, so it has a grain direction.
  const double ca = n.fbm(u * 115, v * 48, 29.3, 2);
  const double cb = n.fbm(u * 115, v * 48, 88.7, 2);
  const double cell = jmin(fabs(ca), fabs(cb));
  const double crease = 1 - smoothstep(0.0, 0.09, cell);
  const double blood = n.fbm(u * 5, v * 6, 53.1, 3) * 0.5 + 0.5;
  const double oil = n.fbm(u * 3.5, v * 4, 66.2, 2) * 0.5 + 0.5;

  const double base = 0.86 + blotch * 0.09 - crease * 0.05;
  c.r = base * 0.96 + blood * 0.030;
  c.g = base * 0.90 + blotch * 0.02;
  c.b = base * 0.86 - blood * 0.022;
  c.rough = clamp(0.58 + pore * 0.16 + crease * 0.10 - oil * 0.20
    - blotch * 0.04, 0.28, 0.86);
  c.ao = 1 - pore * 0.10 - crease * 0.08;
  c.h = 0.55 + pore * 0.10 - crease * 0.18 + blotch * 0.04;
}

void hair(double u, double v, const Noise& n, Texel& c) {
  const double strand = n.fbm(u * 140, v * 2.5, 7.3, 2) * 0.5 + 0.5;
  const double clump = n.fbm(u * 17, v * 3, 44.8, 3) * 0.5 + 0.5;
  const double stray = pow(jmax(0, n.fbm(u * 60, v * 26, 91.4, 2)), 5) * 3.0;
  const double band = pow(clump, 3.0);
  const double base = 0.55 + strand * 0.22 + band * 0.20 - (1 - clump) * 0.12
    + stray * 0.25;
  c.r = base * 1.00; c.g = base * 0.97; c.b = base * 0.93;
  c.metal = 0;
  c.rough = clamp(0.42 - band * 0.16 + (1 - strand) * 0.14, 0.18, 0.80);
  c.ao = 0.78 + clump * 0.22;
  c.h = strand * 0.55 + clump * 0.35 + stray * 0.4;
}

void eye(double u, double v, const Noise& n, Texel& c) {
  /* A picture, not a tiling pattern: the front of the eye at (0.5, 0.5). */
  const double dx = u - 0.5, dy = v - 0.5;
  const double r = sqrt(dx * dx + dy * dy);
  const double th = std::atan2(dy, dx);
  /* Fibres sampled on the unit circle: constant in r, seamless in theta. */
  const double fib = n.fbm(cos(th) * 46, sin(th) * 46, 13.9, 2) * 0.5 + 0.5;
  const double fine = n.fbm(cos(th) * 115, sin(th) * 115, 71.5, 2) * 0.5 + 0.5;
  const double crypt = n.fbm(cos(th) * 14, sin(th) * 14, 34.2, 2) * 0.5 + 0.5;
  /* Vessels are zero crossings (lines), not cubed peaks (dots). */
  const double vf = n.fbm(u * 9, v * 9, 5.2, 2);
  const double vessel = pow(jmax(0, 1 - fabs(vf) * 14), 2.5);

  if (r < 0.115) {
    c.r = c.g = c.b = 0.025;
    c.rough = 0.55; c.ao = 0.55; c.h = 0.30; c.metal = 0;
  } else if (r < 0.315) {
    const double t = (r - 0.115) / 0.20;
    const double coll = exp(-pow((t - 0.33) * 6.0, 2));
    const double f = (fib * 0.55 + fine * 0.45) * (0.45 + t * 0.55)
      - (1 - crypt) * 0.18 * (1 - t);
    const double base = 0.42 + f * 0.40 - (1 - t) * 0.14 + coll * 0.10;
    c.r = base * 0.98; c.g = base; c.b = base * 1.02;
    c.rough = 0.16; c.ao = 1 - coll * 0.10; c.metal = 0;
    c.h = 0.45 + coll * 0.30 + f * 0.10;
  } else if (r < 0.345) {
    const double t = (r - 0.315) / 0.030;
    const double dark = sin(t * PI);
    const double base = 0.30 - dark * 0.22;
    c.r = base * 0.95; c.g = base * 0.97; c.b = base * 1.05;
    c.rough = 0.14; c.ao = 1 - dark * 0.20; c.h = 0.5; c.metal = 0;
  } else {
    const double t = jmin(1, (r - 0.345) / 0.155);
    const double ves = vessel * smoothstep(0.02, 0.40, t);
    const double base = 0.86 - t * 0.16;
    c.r = base * 1.00 + ves * 0.06;
    c.g = base * 0.96 - ves * 0.14;
    c.b = base * 0.93 - ves * 0.13;
    c.rough = 0.12; c.ao = 1 - t * 0.18; c.h = 0.5; c.metal = 0;
  }
}

void enamel(double u, double v, const Noise& n, Texel& c) {
  const double band = n.fbm(u * 4, v * 30, 21.7, 2) * 0.5 + 0.5;
  const double stain = n.fbm(u * 8, v * 8, 62.3, 3) * 0.5 + 0.5;
  const double edge = smoothstep(0.55, 1.0, v);
  const double base = 0.90 + band * 0.04 - stain * 0.06 - edge * 0.10;
  c.r = base * 1.00; c.g = base * 0.99 - edge * 0.01; c.b = base * 0.94 + edge * 0.03;
  c.metal = 0;
  c.rough = clamp(0.14 + stain * 0.10, 0.08, 0.40);
  c.ao = 1 - stain * 0.06;
  c.h = 0.5 + (band - 0.5) * 0.10;
}

void nail(double u, double v, const Noise& n, Texel& c) {
  const double ridge = n.fbm(u * 3, v * 40, 8.1, 2) * 0.5 + 0.5;
  const double lun = exp(-pow((v - 0.12) * 5.5, 2));
  const double free_ = smoothstep(0.86, 1.0, v);
  const double base = 0.80 + ridge * 0.05 + lun * 0.08 + free_ * 0.10;
  c.r = base * 1.00; c.g = base * 0.90 - lun * 0.02; c.b = base * 0.87;
  c.metal = 0;
  c.rough = clamp(0.17 + (1 - ridge) * 0.06, 0.10, 0.45);
  c.ao = 1;
  c.h = 0.5 + (ridge - 0.5) * 0.18;
}

void plastic(double u, double v, const Noise& n, Texel& c) {
  const double speck = n.fbm(u * 120, v * 120, 2, 2) * 0.5 + 0.5;
  const double base = 0.7 + speck * 0.06;
  c.r = base; c.g = base; c.b = base;
  c.rough = 0.32 + speck * 0.08;
  c.ao = 1;
  c.h = speck * 0.15;
}

void tile(double u, double v, const Noise& n, Texel& c) {
  const double n8 = 8;
  const double gx = jsMod1(u * n8), gy = jsMod1(v * n8);
  const double gap = jmin(jmin(gx, 1 - gx), jmin(gy, 1 - gy)) * n8;
  const bool isGap = gap < 0.12;
  const double grain = n.fbm(u * 30, v * 30, 5, 3) * 0.5 + 0.5;
  if (isGap) {
    c.r = c.g = c.b = 0.32 + grain * 0.08;
    c.rough = 0.95; c.ao = 0.4; c.h = 0.05;
  } else {
    const double cell = floor(u * n8) * 13 + floor(v * n8) * 29;
    const double tint = fmod(cell * 2654435761.0, 1000) / 1000;
    const double base = 0.62 + tint * 0.14 + grain * 0.05;
    c.r = base * 0.98; c.g = base; c.b = base * 1.02;
    c.rough = 0.16 + tint * 0.1;
    c.ao = 1 - smoothstep(0.4, 0.12, gap) * 0.3;
    c.h = 0.8;
  }
}

// ------------------------------------------------------------ the world

void asphalt(double u, double v, const Noise& n, Texel& c) {
  const double a = n.fbm(u * 26, v * 26, 3.4, 2);
  const double b = n.fbm(u * 26, v * 26, 47.8, 2);
  const double cell = jmin(fabs(a), fabs(b));
  const double stone = smoothstep(0.02, 0.20, cell);
  const double proudF = n.fbm(u * 13, v * 13, 71.2, 2) * 0.5 + 0.5;
  const double proud = jmax(0, proudF - 0.55) / 0.45;
  const double binder = n.fbm(u * 5, v * 5, 19.9, 3) * 0.5 + 0.5;
  const double grit = n.fbm(u * 110, v * 110, 88.1, 2) * 0.5 + 0.5;

  const double base = 0.17 + stone * 0.22 + proud * stone * 0.14
    + binder * 0.04 + (grit - 0.5) * 0.03;
  c.r = base * 1.00; c.g = base * 0.99; c.b = base * 0.97;
  c.metal = 0;
  c.rough = clamp(0.92 - proud * stone * 0.34 - binder * 0.05, 0.30, 1);
  c.ao = 0.82 + stone * 0.18;
  c.h = stone * 0.45 + proud * 0.2 + (grit - 0.5) * 0.06;
}

void setts(double u, double v, const Noise& n, Texel& c) {
  /* Real cells, squashed in v into courses: every sett a different shape. */
  const double P = 11;
  const Cell st = Noise::cells(u * P, v * P * 1.35, 7, P);
  const double joint = smoothstep(0.030, 0.085, st.edge);
  const double grain = n.fbm(u * 70, v * 70, 5.5, 3) * 0.5 + 0.5;
  const double wear = n.fbm(u * 3, v * 3, 61.8, 2) * 0.5 + 0.5;

  if (joint < 0.35) {
    const double g = 0.17 + grain * 0.10 + joint * 0.20;
    c.r = g * 1.00; c.g = g * 1.02; c.b = g * 0.92;
    c.rough = clamp(0.97 - grain * 0.05, 0.70, 1);
    c.ao = 0.26 + joint * 1.1;
    c.h = 0.06 + grain * 0.06; c.metal = 0;
  } else {
    const double dome = smoothstep(0.0, 0.34, st.d1);
    const double base = 0.40 + st.id * 0.10 + grain * 0.08 - dome * 0.05;
    const double cool = 0.985 + st.id2 * 0.03;
    c.r = base * (2 - cool) * 0.99; c.g = base * 1.00; c.b = base * cool;
    c.rough = clamp(0.44 + dome * 0.40 + grain * 0.10 - wear * 0.10, 0.26, 1);
    c.ao = 1 - dome * 0.30;
    c.h = 0.95 - dome * 0.42; c.metal = 0;
  }
}

void corrugated(double u, double v, const Noise& n, Texel& c) {
  const double streakF = n.fbm(u * 22, v * 2.5, 6.7, 3) * 0.5 + 0.5;
  const double runF = n.fbm(u * 9, v * 1.4, 33.1, 2) * 0.5 + 0.5;
  const double rust_ = clamp(jmax(0, streakF * 0.55 + runF * 0.75 - 0.62) / 0.38, 0, 1);
  const double spangle = n.fbm(u * 60, v * 60, 12.4, 2) * 0.5 + 0.5;
  const double ROWS = 5;
  const double fy = fabs(jsMod1(v * ROWS) - 0.5) * 2;
  const double fx = fabs(jsMod1(u * 8) - 0.5) * 2;
  const double fix = smoothstep(0.86, 1.0, fy) * smoothstep(0.80, 1.0, fx);
  const double bloom = smoothstep(0.55, 1.0, fy) * smoothstep(0.45, 1.0, fx) * 0.6;
  const double r2 = clamp(rust_ + bloom, 0, 1);

  const double zinc = 0.62 + spangle * 0.14;
  c.r = zinc * (1 - r2) + r2 * 0.44;
  c.g = zinc * 0.99 * (1 - r2) + r2 * 0.23;
  c.b = zinc * 1.01 * (1 - r2) + r2 * 0.13;
  c.metal = 1 - r2 * 0.85;
  c.rough = clamp(0.44 + spangle * 0.10 + r2 * 0.46, 0.28, 1);
  c.ao = 1 - r2 * 0.14 - fix * 0.35;
  c.h = 0.55 - fix * 0.45 + r2 * 0.10 + (spangle - 0.5) * 0.05;
}

void pantile(double u, double v, const Noise& n, Texel& c) {
  /* Not square: 3 across by 5 down, and the head lap is several times
     deeper than the side joint. */
  const double ACROSS = 3, DOWN = 5;
  const double gu = u * ACROSS, gv = v * DOWN;
  const double iu = floor(gu), iv = floor(gv);
  const double fu = gu - iu, fv = gv - iv;
  // (((iu * K1) ^ (iv * K2)) >>> 0) % 1000 / 1000, with JS's double products.
  const double h = static_cast<double>((toUint32(iu * 374761393) ^ toUint32(iv * 668265263)) % 1000u) / 1000;
  const double h2 = static_cast<double>((toUint32(iu * 2246822519.0) ^ toUint32(iv * 3266489917.0)) % 1000u) / 1000;
  const double lap = smoothstep(0.17, 0.0, fv);
  const double side = smoothstep(0.045, 0.0, jmin(fu, 1 - fu)) * 0.45;
  const double grain = n.fbm(u * 60, v * 60, 8.8, 3) * 0.5 + 0.5;
  const double moss = jmax(0, n.fbm(u * 14, v * 14, 52.6, 3)) * 1.6;
  /* The roll: an S in section, so across each tile a crown, a flank and
     a trough -- the banding you recognise a pantile roof by. */
  const double rollPhase = fu * PI * 2 - 0.55;
  const double roll = cos(rollPhase);
  const double trough = smoothstep(0.55, 1.0, -roll);

  const double base = 0.42 + h * 0.10 + grain * 0.07 - lap * 0.24 - side * 0.14
    + roll * 0.11 - trough * 0.16;
  const double warm = 0.90 + h2 * 0.14;
  c.r = base * 1.00; c.g = base * (0.56 * warm); c.b = base * (0.40 * warm);
  // Moss in the laps, where the water lies.
  const double m = clamp(moss * (0.35 + lap * 0.9), 0, 0.8);
  c.r = c.r * (1 - m) + m * 0.16;
  c.g = c.g * (1 - m) + m * 0.21;
  c.b = c.b * (1 - m) + m * 0.11;
  c.metal = 0;
  c.rough = clamp(0.78 + grain * 0.12 + m * 0.15 - h * 0.08, 0.45, 1);
  c.ao = 1 - lap * 0.45 - side * 0.30 - trough * 0.35;
  c.h = 0.55 + roll * 0.34 - lap * 0.45 - side * 0.25 - trough * 0.20
    + (grain - 0.5) * 0.06;
}

void gravel(double u, double v, const Noise& n, Texel& c) {
  /* Two offset cell layers, the nearer one winning, so stones OVERLAP. */
  const double P1 = 26, P2 = 37;
  const Cell a = Noise::cells(u * P1, v * P1, 3, P1);
  const Cell b = Noise::cells((u + 0.31) * P2, (v + 0.57) * P2, 11, P2);
  const bool useA = (0.5 - a.d1) > (0.5 - b.d1) * 0.92;
  const Cell& st = useA ? a : b;
  const double fines = smoothstep(0.42, 0.62, st.d1);
  const double dust = n.fbm(u * 90, v * 90, 26.2, 2) * 0.5 + 0.5;
  const double rough2 = n.fbm(u * 150, v * 150, 71.4, 2) * 0.5 + 0.5;
  const double crown = 1 - smoothstep(0.0, 0.45, st.d1);
  const double rim = smoothstep(0.045, 0.0, st.edge);

  if (fines > 0.7) {
    const double g = 0.46 + dust * 0.12;
    c.r = g * 1.00; c.g = g * 0.98; c.b = g * 0.92;
    c.rough = 0.98; c.ao = 0.44; c.h = 0.10 + dust * 0.06; c.metal = 0;
  } else {
    const double val = 0.34 + st.id * 0.30;
    const double warm = 0.94 + st.id2 * 0.14;
    const double base = val + crown * 0.14 + (rough2 - 0.5) * 0.07 - rim * 0.10
      - fines * 0.10;
    c.r = base * warm; c.g = base * 1.00; c.b = base * (2 - warm) * 0.99;
    c.metal = 0;
    c.rough = clamp(0.70 + (1 - st.id) * 0.22 + (rough2 - 0.5) * 0.08, 0.40, 1);
    c.ao = 1 - rim * 0.45 - fines * 0.30;
    c.h = 0.25 + (1 - st.d1) * 0.65 - rim * 0.25;
  }
}

void snow(double u, double v, const Noise& n, Texel& c) {
  const double ripple = n.fbm(u * 4, v * 20, 7.9, 3) * 0.5 + 0.5;
  const double sas = pow(n.fbm(u * 2.5, v * 8, 44.3, 2) * 0.5 + 0.5, 2.2);
  const double cf = n.fbm(u * 16, v * 16, 66.1, 2);
  const double crack = pow(jmax(0, 1 - fabs(cf) * 11), 2.5);
  const double grain = n.fbm(u * 100, v * 100, 91.7, 2) * 0.5 + 0.5;
  const double sparkF = n.fbm(u * 75, v * 75, 13.3, 2) * 0.5 + 0.5;
  const double spark = jmax(0, sparkF - 0.88) / 0.12;

  const double base = 0.93 + ripple * 0.030 + sas * 0.025 - crack * 0.070
    + (grain - 0.5) * 0.020;
  c.r = base * 0.995; c.g = base * 0.998; c.b = base * 1.00;
  c.metal = 0;
  c.rough = clamp(0.72 + (1 - grain) * 0.16 - spark * 0.60
    - sas * 0.08, 0.10, 1);
  c.ao = 1 - crack * 0.20;
  c.h = 0.5 + (ripple - 0.5) * 0.30 + sas * 0.35 - crack * 0.30
    + (grain - 0.5) * 0.10;
}

void mud(double u, double v, const Noise& n, Texel& c) {
  const double churn = n.fbm(u * 7, v * 7, 3.3, 4) * 0.5 + 0.5;
  const double lump = n.fbm(u * 22, v * 22, 28.8, 3) * 0.5 + 0.5;
  const double grit = n.fbm(u * 95, v * 95, 55.1, 2) * 0.5 + 0.5;
  // Water collects where the height field is low.
  const double h = churn * 0.6 + lump * 0.4;
  const double water = smoothstep(0.46, 0.24, h);
  const double base = 0.30 + h * 0.16 + (grit - 0.5) * 0.04 - water * 0.12;
  c.r = base * 1.00; c.g = base * (0.88 + water * 0.06);
  c.b = base * (0.74 + water * 0.14);
  c.metal = 0;
  c.rough = clamp(0.96 - water * 0.78 + (grit - 0.5) * 0.05, 0.08, 1);
  c.ao = 1 - water * 0.22 - (1 - lump) * 0.10;
  c.h = h * 0.9 + (grit - 0.5) * 0.06;
}

void paint(double u, double v, const Noise& n, Texel& c) {
  const double orange = n.fbm(u * 30, v * 30, 4.6, 2) * 0.5 + 0.5;
  // Two thresholds on one field: primer always haloes the bare metal.
  const double wearF = n.fbm(u * 11, v * 11, 37.4, 3) * 0.5 + 0.5;
  const double gone = jmax(0, wearF - 0.70) / 0.30;
  const double bare = jmax(0, wearF - 0.83) / 0.17;
  const double scratchF = n.fbm(u * 60, v * 6, 71.8, 2);
  const double scratch = pow(jmax(0, 1 - fabs(scratchF) * 15), 3);

  // Layer 1: the paint.
  double r = 0.92, g = 0.92, b = 0.92;
  double rough = 0.30 + orange * 0.14;
  double metal_ = 0;
  // Layer 2: red oxide primer.
  const double p = clamp(gone - bare, 0, 1) + scratch * 0.4;
  r = r * (1 - p) + p * 0.46; g = g * (1 - p) + p * 0.22; b = b * (1 - p) + p * 0.16;
  rough = rough * (1 - p) + p * 0.88;
  // Layer 3: bare steel, the only conductor here.
  const double m = clamp(bare, 0, 1);
  r = r * (1 - m) + m * 0.55; g = g * (1 - m) + m * 0.56; b = b * (1 - m) + m * 0.58;
  rough = rough * (1 - m) + m * 0.38;
  metal_ = m;

  c.r = r; c.g = g; c.b = b;
  c.metal = metal_;
  c.rough = clamp(rough, 0.12, 1);
  c.ao = 1 - gone * 0.14;
  c.h = 0.7 - gone * 0.35 - scratch * 0.25;
}

void glass(double u, double v, const Noise& n, Texel& c) {
  const double dust = n.fbm(u * 55, v * 55, 9.2, 2) * 0.5 + 0.5;
  const double runF = n.fbm(u * 45, v * 3, 41.7, 2);
  const double run = pow(jmax(0, 1 - fabs(runF) * 9), 2.0);
  const double warp = n.fbm(u * 2, v * 2, 63.5, 2);
  const double smear = n.fbm(u * 5 + warp * 2, v * 3 - warp * 2, 77.3, 2) * 0.5 + 0.5;
  const double grime = clamp(dust * 0.35 + run * 0.5 + smear * 0.3, 0, 1);

  const double base = 0.97 - grime * 0.10;
  c.r = base * 1.00; c.g = base * 1.00; c.b = base * 0.995;
  c.metal = 0;
  c.rough = clamp(0.045 + grime * 0.26 + run * 0.10, 0.02, 0.45);
  c.ao = 1;
  c.h = 0.5 + run * 0.10 + (dust - 0.5) * 0.04;
}

// ------------------------------------------------------------ cloth

void wool(double u, double v, const Noise& n, Texel& c) {
  /* A twill: the diagonal coordinate is what makes it not a grid. */
  const double d = (u + v) * 52;
  const double twill = fabs((jsMod1(d) - 0.5) * 2);
  const double rib = 1 - pow(twill, 1.6);
  const double halo = n.fbm(u * 130, v * 130, 3.8, 2) * 0.5 + 0.5;
  const double slub = n.fbm(u * 11, v * 9, 47.6, 3) * 0.5 + 0.5;
  const double base = 0.60 + rib * 0.14 + (halo - 0.5) * 0.10 + (slub - 0.5) * 0.09;
  c.r = base * 1.00; c.g = base * 0.99; c.b = base * 0.96;
  c.metal = 0;
  c.rough = clamp(0.94 - rib * 0.03 + (halo - 0.5) * 0.04, 0.80, 1);
  c.ao = 0.80 + rib * 0.20;
  c.h = rib * 0.45 + (halo - 0.5) * 0.18;
}

void denim(double u, double v, const Noise& n, Texel& c) {
  /* 3/1 twill; indigo warp, undyed weft, and wear goes toward the weft. */
  const double NW = 46;
  const double gu = u * NW, gv = v * NW;
  const double iu = floor(gu), iv = floor(gv);
  const double fu = gu - iu, fv = gv - iv;
  const bool warpUp = fmod(fmod(iu - iv, 4) + 4, 4) != 0;
  const double rnd = sin((warpUp ? fu : fv) * PI);
  const double slub = n.fbm(u * 9, v * 40, 18.2, 3) * 0.5 + 0.5;
  const double wearF = n.fbm(u * 4, v * 5, 58.9, 3) * 0.5 + 0.5;
  const double wear = jmax(0, wearF - 0.58) / 0.42;
  const double lit = 0.55 + rnd * 0.30 + (slub - 0.5) * 0.10;
  if (warpUp) {
    const double t = wear * 0.8;
    c.r = lit * (0.42 + t * 0.52);
    c.g = lit * (0.50 + t * 0.44);
    c.b = lit * (0.68 + t * 0.26);
  } else {
    c.r = lit * 0.92; c.g = lit * 0.90; c.b = lit * 0.84;
  }
  c.metal = 0;
  c.rough = clamp(0.90 - rnd * 0.06 - wear * 0.04, 0.68, 1);
  c.ao = 0.74 + rnd * 0.26;
  c.h = rnd * 0.6 + (slub - 0.5) * 0.10;
}

void ripstop(double u, double v, const Noise& n, Texel& c) {
  const double GRID = 17;
  const double gu = jsMod1(u * GRID), gv = jsMod1(v * GRID);
  const double bar = jmax(1 - jmin(gu, 1 - gu) * GRID * 0.7,
    1 - jmin(gv, 1 - gv) * GRID * 0.7);
  const double rein = smoothstep(0.55, 0.95, bar);
  const double WV = 150;
  // Note the order: u * WV * PI here, u * PI * 220 in fabric. Kept.
  const double wu = sin(u * WV * PI), wv2 = sin(v * WV * PI);
  const double weave = (wu * wv2) * 0.5 + 0.5;
  const double sheen = n.fbm(u * 6, v * 6, 37.1, 2) * 0.5 + 0.5;
  const double base = 0.62 + weave * 0.10 + rein * 0.09 + (sheen - 0.5) * 0.07;
  c.r = base * 1.00; c.g = base * 1.00; c.b = base * 0.98;
  c.metal = 0;
  c.rough = clamp(0.74 - rein * 0.10 - sheen * 0.08, 0.42, 0.95);
  c.ao = 0.86 + rein * 0.14;
  c.h = rein * 0.55 + weave * 0.18;
}

void knit(double u, double v, const Noise& n, Texel& c) {
  const double WALE = 22, COURSE = 26;
  const double gu = u * WALE, gv = v * COURSE;
  const double iu = floor(gu), iv = floor(gv);
  const double fu = gu - iu, fv = gv - iv;
  (void)iv;
  const double leg = fabs(fu - 0.5) * 2;
  const double vshape = sin(jmax(0, 1 - fabs(fv - leg * 0.75)) * PI * 0.5);
  const double ribOut = (static_cast<int>(iu) & 1) == 0 ? 1 : 0.55;
  const double fuzz = n.fbm(u * 120, v * 120, 12.3, 2) * 0.5 + 0.5;
  const double rnd = vshape * ribOut;
  const double base = 0.52 + rnd * 0.28 + (fuzz - 0.5) * 0.10;
  c.r = base * 1.00; c.g = base * 0.99; c.b = base * 0.97;
  c.metal = 0;
  c.rough = clamp(0.93 - rnd * 0.04 + (fuzz - 0.5) * 0.05, 0.78, 1);
  c.ao = 0.62 + rnd * 0.38;
  c.h = rnd * 0.9 + (fuzz - 0.5) * 0.12;
}

// ------------------------------------------------------------ gun & ammunition

void brass(double u, double v, const Noise& n, Texel& c) {
  /* Drawn along the axis; not gold (the blue channel is the difference);
     smooth, with the striation mostly in the sheen. */
  const double draw = n.fbm(u * 150, v * 4, 3.1, 2) * 0.5 + 0.5;
  const double tarnish = n.fbm(u * 7, v * 5, 22.5, 4) * 0.5 + 0.5;
  const double dings = pow(jmax(0, n.fbm(u * 44, v * 44, 8.8, 2) - 0.25), 3) * 2.2;
  const double base = 0.93 - tarnish * 0.09 + (draw - 0.5) * 0.035;
  c.r = base * 0.91; c.g = base * 0.79; c.b = base * 0.53;
  c.metal = 1;
  c.rough = clamp(0.17 + tarnish * 0.15 + (draw - 0.5) * 0.10 + dings * 0.18, 0.11, 0.62);
  c.ao = 1 - dings * 0.10;
  c.h = (draw - 0.5) * 0.06 - dings * 0.12;
}

void copper(double u, double v, const Noise& n, Texel& c) {
  const double draw = n.fbm(u * 220, v * 5, 5.7, 2) * 0.5 + 0.5;
  const double film = n.fbm(u * 4, v * 3, 31.2, 3) * 0.5 + 0.5;
  const double base = 0.95 - film * 0.07 + (draw - 0.5) * 0.045;
  c.r = base * 0.95; c.g = base * 0.64; c.b = base * 0.47;
  c.metal = 1;
  c.rough = clamp(0.16 + film * 0.11 + (draw - 0.5) * 0.09, 0.10, 0.50);
  c.ao = 1;
  c.h = (draw - 0.5) * 0.07;
}

void lead(double u, double v, const Noise& n, Texel& c) {
  const double swage = n.fbm(u * 16, v * 10, 9.4, 2) * 0.5 + 0.5;
  const double oxide = n.fbm(u * 30, v * 30, 44.1, 3) * 0.5 + 0.5;
  const double base = 0.56 + swage * 0.07 - oxide * 0.06;
  c.r = base * 0.98; c.g = base * 0.99; c.b = base * 1.03;
  c.metal = 1;
  c.rough = clamp(0.58 + oxide * 0.22 + (swage - 0.5) * 0.10, 0.40, 0.92);
  c.ao = 1 - oxide * 0.10;
  c.h = (swage - 0.5) * 0.16 + (oxide - 0.5) * 0.05;
}

void primer(double u, double v, const Noise& n, Texel& c) {
  const double mill = n.fbm(u * 60, v * 60, 12.8, 2) * 0.5 + 0.5;
  const double base = 0.96 - mill * 0.05;
  c.r = base * 0.90; c.g = base * 0.83; c.b = base * 0.62;
  c.metal = 1;
  c.rough = clamp(0.13 + mill * 0.10, 0.08, 0.40);
  c.ao = 1;
  c.h = (mill - 0.5) * 0.12;
}

void bluing(double u, double v, const Noise& n, Texel& c) {
  /* Satin, 0.30 albedo, wear rare and blended toward bare steel rather
     than added -- five passes of lessons, recorded in the JS. */
  const double swirl = n.fbm(u * 26, v * 9, 6.3, 2) * 0.5 + 0.5;
  const double cloud = n.fbm(u * 3.5, v * 3.5, 17.7, 3) * 0.5 + 0.5;
  const double wearF = n.fbm(u * 4, v * 4, 55.3, 2) * 0.5 + 0.5;
  const double wear = smoothstep(0.88, 1.0, wearF) * 0.55;
  const double base = 0.30 + cloud * 0.06 + (swirl - 0.5) * 0.035;
  const double bare = 0.44;
  c.r = (base * 0.97) * (1 - wear) + bare * 1.00 * wear;
  c.g = (base * 0.99) * (1 - wear) + bare * 1.01 * wear;
  c.b = (base * 1.04) * (1 - wear) + bare * 1.02 * wear;
  c.metal = 1;
  c.rough = clamp(0.38 + (swirl - 0.5) * 0.10 + cloud * 0.08 + wear * 0.30, 0.26, 0.72);
  c.ao = 1;
  c.h = (swirl - 0.5) * 0.03 - wear * 0.04;
}

void parkerize(double u, double v, const Noise& n, Texel& c) {
  const double a = n.fbm(u * 150, v * 150, 4.2, 2);
  const double b = n.fbm(u * 150, v * 150, 61.9, 2);
  const double cell = jmin(fabs(a), fabs(b));
  const double grain = smoothstep(0.0, 0.16, cell);
  const double oil = n.fbm(u * 6, v * 6, 28.4, 3) * 0.5 + 0.5;
  const double base = 0.200 + grain * 0.060 - (1 - grain) * 0.040 + oil * 0.018;
  c.r = base * 1.00; c.g = base * 1.01; c.b = base * 0.93;
  c.metal = 0.5;
  c.rough = clamp(0.88 - grain * 0.10 - oil * 0.12, 0.45, 1);
  c.ao = 0.84 + grain * 0.16;
  c.h = grain * 0.30;
}

void walnut(double u, double v, const Noise& n, Texel& c) {
  /* One piece of one tree: the ring flow bends by 0.7 of a ring, not 5.5. */
  const double flow = n.fbm(u * 2.2, v * 1.1, 13.7, 3);
  const double rings = fabs(sin((v * 34.0 + flow * 0.7) * PI));
  const double ringD = pow(1 - rings, 2.2);
  const double fig = n.fbm(u * 3, v * 7, 41.5, 4) * 0.5 + 0.5;
  const double poreF = n.fbm(u * 26, v * 190, 70.1, 2) * 0.5 + 0.5;
  const double pore = jmax(0, poreF - 0.70) / 0.30;
  const double base = 0.34 + fig * 0.17 - ringD * 0.15 - pore * 0.09;
  c.r = base * 1.00; c.g = base * 0.70; c.b = base * 0.52;
  c.metal = 0;
  c.rough = clamp(0.36 + ringD * 0.08 + pore * 0.26 - fig * 0.05, 0.22, 0.85);
  c.ao = 1 - pore * 0.22 - ringD * 0.08;
  c.h = 0.6 - ringD * 0.05 - pore * 0.22;
}

void bakelite(double u, double v, const Noise& n, Texel& c) {
  const double warp = n.fbm(u * 2.5, v * 2.5, 3.9, 3);
  const double swirl = n.fbm(u * 5 + warp * 2.4, v * 3 + warp * 1.6, 27.2, 4) * 0.5 + 0.5;
  const double fleck = n.fbm(u * 70, v * 70, 66.6, 2) * 0.5 + 0.5;
  const double base = 0.36 + swirl * 0.26 + (fleck - 0.5) * 0.04;
  c.r = base * 1.00; c.g = base * 0.47; c.b = base * 0.30;
  c.metal = 0;
  c.rough = clamp(0.26 + (1 - swirl) * 0.08 + (fleck - 0.5) * 0.05, 0.16, 0.6);
  c.ao = 1;
  c.h = 0.5 + (swirl - 0.5) * 0.18;
}

void polymer(double u, double v, const Noise& n, Texel& c) {
  const double a = n.fbm(u * 150, v * 150, 7.7, 2);
  const double b = n.fbm(u * 150, v * 150, 83.1, 2);
  const double cell = jmin(fabs(a), fabs(b));
  const double pebble = smoothstep(0.0, 0.13, cell);
  const double mould = n.fbm(u * 4, v * 4, 19.3, 3) * 0.5 + 0.5;
  const double base = 0.19 + pebble * 0.05 + mould * 0.02;
  c.r = base * 1.01; c.g = base * 1.00; c.b = base * 0.97;
  c.metal = 0;
  c.rough = clamp(0.72 - pebble * 0.14 + (mould - 0.5) * 0.06, 0.40, 0.95);
  c.ao = 0.86 + pebble * 0.14;
  c.h = pebble * 0.45;
}

void leather(double u, double v, const Noise& n, Texel& c) {
  const double poreF = n.fbm(u * 110, v * 110, 2.4, 2) * 0.5 + 0.5;
  const double pore = jmax(0, poreF - 0.60) / 0.40;
  const double warp = n.fbm(u * 3, v * 3, 51.8, 2);
  /* Two octaves and x9 so the creases are a few soft folds, not a maze. */
  const double creaseF = n.fbm(u * 6 + warp * 1.2, v * 6 - warp * 1.2, 33.6, 2);
  const double crease = pow(1 - jmin(1, fabs(creaseF) * 9.0), 3.0);
  const double wax = n.fbm(u * 5, v * 5, 71.4, 3) * 0.5 + 0.5;
  const double base = 0.40 + wax * 0.10 - crease * 0.14 - pore * 0.09;
  c.r = base * 1.00; c.g = base * 0.68; c.b = base * 0.48;
  c.metal = 0;
  c.rough = clamp(0.44 + crease * 0.26 + pore * 0.20 - wax * 0.10, 0.25, 0.95);
  c.ao = 1 - crease * 0.28 - pore * 0.18;
  c.h = 0.6 - crease * 0.16 - pore * 0.10;
}

void webbing(double u, double v, const Noise& n, Texel& c) {
  const double NW = 26;
  const double gu = u * NW, gv = v * NW;
  const double iu = floor(gu), iv = floor(gv);
  const double fu = gu - iu, fv = gv - iv;
  // Two-over-two: which tow is on top alternates in pairs.
  const bool over = (((static_cast<int>(iu) >> 1) + (static_cast<int>(iv) >> 1)) & 1) == 0;
  const double across = over ? fv : fu;
  const double rnd = sin(across * PI);
  const double fuzz = n.fbm(u * 200, v * 200, 14.9, 2) * 0.5 + 0.5;
  const double dirt_ = n.fbm(u * 6, v * 6, 47.2, 3) * 0.5 + 0.5;
  const double base = 0.44 + rnd * 0.22 - (1 - dirt_) * 0.10 + (fuzz - 0.5) * 0.06;
  c.r = base * 1.00; c.g = base * 0.96; c.b = base * 0.82;
  c.metal = 0;
  c.rough = clamp(0.93 - rnd * 0.06 + (fuzz - 0.5) * 0.06, 0.55, 1);
  c.ao = 0.68 + rnd * 0.32;
  c.h = rnd * 0.8 + (fuzz - 0.5) * 0.08;
}

// ------------------------------------------------------------ flat & pale

void smooth(double, double, const Noise&, Texel& c) {
  /* Green 0.8, not 0.4: the shader does rough *= orm.g * 1.25, so 0.8 is
     the identity. */
  c.r = c.g = c.b = 1;
  c.rough = 0.8; c.ao = 1; c.h = 0.5;
}

void plaster(double u, double v, const Noise& n, Texel& c) {
  const double sweep = n.fbm(u * 3.2, v * 12.8, 5.1, 3) * 0.5 + 0.5;
  const double mottle = n.fbm(u * 5.5, v * 5.5, 18.7, 4) * 0.5 + 0.5;
  const double grit = n.fbm(u * 120, v * 120, 41.3, 2) * 0.5 + 0.5;
  const double holeF = n.fbm(u * 64, v * 64, 77.9, 2) * 0.5 + 0.5;
  const double hole = jmax(0, holeF - 0.82) / 0.18;

  const double base = 0.895 + (sweep - 0.5) * 0.045 + (grit - 0.5) * 0.022
    - hole * 0.30;
  c.r = base * 0.995; c.g = base; c.b = base * 0.985;
  /* The suction mottle lives in the roughness, not the colour. */
  c.rough = clamp(0.78 + (mottle - 0.5) * 0.30 - (sweep - 0.5) * 0.10
    + hole * 0.18, 0.42, 1);
  c.ao = 1 - hole * 0.55 - (1 - mottle) * 0.04;
  c.h = 0.55 + (sweep - 0.5) * 0.30 + (grit - 0.5) * 0.10 - hole * 0.9;
}

void floaties(double u, double v, const Noise& n, Texel& c) {
  const double rip = n.fbm(u * 5, v * 5, 2.1, 3) * 0.5 + 0.5;
  const double rip2 = n.fbm(u * 17, v * 17, 6.4, 2) * 0.5 + 0.5;
  c.r = 0.62 + rip * 0.10;
  c.g = 0.84 + rip * 0.08;
  c.b = 0.94 + rip * 0.05;
  c.rough = 0.30 + rip2 * 0.12;
  c.ao = 1;
  c.h = 0.42 + rip * 0.10 + rip2 * 0.04;

  /* Seven toys at fixed positions: a camo that changed between two guns
     would not be a camo. {x, y, radius, rotation, kind} */
  static constexpr double TOYS[7][5] = {
      {0.17, 0.21, 0.115, 0.7, 0}, {0.62, 0.13, 0.098, 2.4, 1},
      {0.86, 0.44, 0.104, 4.1, 2}, {0.38, 0.52, 0.120, 1.2, 0},
      {0.09, 0.74, 0.092, 5.0, 2}, {0.68, 0.79, 0.112, 3.3, 1},
      {0.45, 0.92, 0.086, 0.2, 0},
  };
  static constexpr double HUE[5][3] = {
      {0.98, 0.42, 0.26}, {0.99, 0.86, 0.24}, {0.32, 0.78, 0.46},
      {0.98, 0.44, 0.62}, {0.96, 0.40, 0.58},
  };
  for (int i = 0; i < 7; i++) {
    const double* t = TOYS[i];
    // Wrap the difference, so a toy near an edge continues on the other.
    double dx = u - t[0], dy = v - t[1];
    if (dx > 0.5) dx -= 1;
    if (dx < -0.5) dx += 1;
    if (dy > 0.5) dy -= 1;
    if (dy < -0.5) dy += 1;
    const double R = t[2];
    if (dx * dx + dy * dy > R * R * 2.6) continue;   // cheap reject
    const double ca = cos(t[3]), sa = sin(t[3]);
    const double x = (dx * ca - dy * sa) / R, y = (dx * sa + dy * ca) / R;
    const int kind = static_cast<int>(t[4]);

    bool inside = false;
    double ink = 0;
    if (kind == 0) {
      // A ring: in the annulus, not in the hole.
      const double d = jsHypot(x, y);
      inside = d < 1 && d > 0.52;
      ink = 1 - fabs(d - 0.76) / 0.24;
    } else if (kind == 1) {
      // A duck: body, head, beak.
      const bool body = (x * x) / 1.0 + (y * y) / 0.62 < 0.62;
      const double hx = x - 0.42, hy = y + 0.52;
      const bool head = hx * hx + hy * hy < 0.10;
      const bool beak = x > 0.60 && x < 0.92 && fabs(y + 0.56) < 0.10 - (x - 0.60) * 0.22;
      inside = body || head || beak;
      ink = beak ? 2 : 1;
    } else {
      // A flamingo: body, an arc of a neck, a down-turned beak.
      const bool body = (x * x) / 0.95 + (y * y) / 0.50 < 0.50;
      const double nx = x - 0.18, ny = y + 0.56;
      const double nd = jsHypot(nx, ny);
      const bool neck = fabs(nd - 0.50) < 0.10 && ny < 0.05 && nx > -0.45;
      const double bx = x - 0.58, by = y + 0.92;
      const bool beak = bx * bx + by * by < 0.028;
      inside = body || neck || beak;
      ink = beak ? 2 : 1;
    }
    if (!inside) continue;

    const double* h = kind == 0 ? HUE[i % 3] : HUE[3 + (i % 2)];
    const double sheen = 0.86 + (n.fbm(u * 30, v * 30, i * 4.4, 2) * 0.5 + 0.5) * 0.26;
    if (ink == 2) {   // the beak, on both the duck and the bird
      c.r = 0.98 * sheen; c.g = 0.62 * sheen; c.b = 0.12 * sheen;
    } else {
      c.r = h[0] * sheen; c.g = h[1] * sheen; c.b = h[2] * sheen;
    }
    // Vinyl: smoother than water, and standing proud of it.
    c.rough = 0.18;
    c.ao = 1;
    c.h = 0.74;
  }
}

// ------------------------------------------------------------ the table
/* Order is LE.Textures.kinds order. Normal strengths are
   `TextureLib.normalStrength[kind] || 3` as the JS evaluates it -- note
   glass is written twice in that object literal (0.2, then 0.25) and the
   later one wins, and marble / ice / plastic / tile have no entry and
   get the default 3. Whole-material flags are TextureLib.wholeMaterial. */
constexpr Recipe kRecipes[] = {
    {"concrete", concrete, 3, false},
    {"brick", brick, 3, true},
    {"wood", wood, 1.3, false},
    {"metal", metal, 0.7, false},
    {"rust", rust, 2.2, false},
    {"rock", rock, 3, false},
    {"grass", grass, 1.2, true},
    {"dirt", dirt, 1.4, false},
    {"sand", sand, 1.2, false},
    {"marble", marble, 3, false},
    {"ice", ice, 3, false},
    {"fabric", fabric, 1.6, false},
    {"skin", skin, 1.2, false},
    {"hair", hair, 1.6, false},
    {"eye", eye, 0.15, true},
    {"enamel", enamel, 0.20, false},
    {"nail", nail, 0.25, false},
    {"plastic", plastic, 3, false},
    {"tile", tile, 3, false},
    {"asphalt", asphalt, 1.4, true},
    {"setts", setts, 2.4, true},
    {"corrugated", corrugated, 1.0, true},
    {"pantile", pantile, 2.0, true},
    {"gravel", gravel, 2.6, true},
    {"snow", snow, 0.7, false},
    {"mud", mud, 1.3, true},
    {"paint", paint, 0.6, false},
    {"glass", glass, 0.25, false},
    {"wool", wool, 1.8, false},
    {"denim", denim, 2.0, true},
    {"ripstop", ripstop, 1.5, false},
    {"knit", knit, 2.6, false},
    {"brass", brass, 0.30, true},
    {"copper", copper, 0.28, true},
    {"lead", lead, 0.55, true},
    {"primer", primer, 0.25, true},
    {"bluing", bluing, 0.18, true},
    {"parkerize", parkerize, 0.85, true},
    {"walnut", walnut, 0.35, true},
    {"bakelite", bakelite, 0.30, true},
    {"polymer", polymer, 0.80, true},
    {"leather", leather, 0.60, true},
    {"webbing", webbing, 1.10, true},
    {"smooth", smooth, 0.35, false},
    {"plaster", plaster, 0.9, false},
    {"floaties", floaties, 1.0, true},
};
static_assert(sizeof(kRecipes) / sizeof(kRecipes[0]) == 46, "TextureLib.kinds has 46 recipes");

}  // namespace

std::span<const Recipe> recipes() { return kRecipes; }

const Recipe* findRecipe(std::string_view name) {
  for (const Recipe& r : kRecipes)
    if (r.name == name) return &r;
  return nullptr;
}

}  // namespace game::assets::detail
