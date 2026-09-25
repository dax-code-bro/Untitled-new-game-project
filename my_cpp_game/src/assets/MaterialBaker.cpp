// ---------------------------------------------------------------------------
//  TextureLib.generate and TextureLib.heightToNormal, multithreaded.
//
//  The synthesis loop and the packing are the JS loop line for line; only
//  the iteration is split across threads. Two passes, because the normal
//  of a texel needs the heights of its four neighbours, which another
//  thread may be writing in pass one:
//
//    pass 1  rows in parallel: run the recipe, pack albedo and ORM
//            (height -> ORM alpha), keep the raw height as a FLOAT
//    pass 2  rows in parallel: central differences on those floats
//
//  The height buffer is float, not double, ON PURPOSE: the JS keeps it in
//  a Float32Array, so the normal map is differentiated from heights that
//  were rounded to single precision. A double buffer would be "better"
//  and would not match. (ORM alpha, by contrast, is packed from the
//  double c.h before that rounding -- again exactly as the JS does.)
// ---------------------------------------------------------------------------
#include "assets/detail/FpStrict.hpp"

#include "assets/MaterialBaker.hpp"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <exception>
#include <limits>
#include <stdexcept>
#include <thread>

#include "assets/detail/JsMath.hpp"
#include "assets/detail/Recipes.hpp"

namespace game::assets {

namespace {

using detail::clamp;
using detail::toUint8;

/* Run fn(y0, y1, worker) over [0, rows) in chunks, on `threads` workers
   (the calling thread is one of them). Chunks are handed out from an
   atomic counter rather than pre-split, because recipes are not uniform
   in cost -- floaties does extra work inside its toys, eye inside the
   iris -- and a static split would leave threads idle. */
template <class Fn>
void parallelRows(int rows, unsigned threads, Fn&& fn) {
  if (threads <= 1 || rows <= 1) { fn(0, rows, 0u); return; }
  const int chunk = std::max(1, std::min(16, rows / static_cast<int>(threads * 8)));
  std::atomic<int> next{0};
  auto work = [&](unsigned worker) {
    for (;;) {
      const int y0 = next.fetch_add(chunk, std::memory_order_relaxed);
      if (y0 >= rows) break;
      fn(y0, std::min(rows, y0 + chunk), worker);
    }
  };
  std::vector<std::jthread> pool;   // joins on scope exit, even on throw
  pool.reserve(threads - 1);
  for (unsigned t = 1; t < threads; t++) pool.emplace_back(work, t);
  work(0u);
}

/* Run each callable on its own thread (or all inline when `parallel` is
   false). An exception from any of them -- std::bad_alloc, realistically,
   at 8K and up -- is carried back and rethrown here rather than
   terminating the process from inside a std::thread. */
template <class... Fns>
void allocateConcurrently(bool parallel, Fns&&... fns) {
  if (!parallel) { (fns(), ...); return; }
  std::exception_ptr errs[sizeof...(Fns)];
  {
    std::vector<std::jthread> pool;
    pool.reserve(sizeof...(Fns));
    size_t k = 0;
    auto launch = [&](auto& f) {
      std::exception_ptr* slot = &errs[k++];
      pool.emplace_back([&f, slot] {
        try { f(); } catch (...) { *slot = std::current_exception(); }
      });
    };
    (launch(fns), ...);
  }   // joins
  for (auto& e : errs)
    if (e) std::rethrow_exception(e);
}

/* TextureLib.heightToNormal: central differences, wrapping at the edges,
   written as tangent-space RGBA8. `hgt` holds single-precision heights,
   exactly as the JS Float32Array does. */
void heightToNormalInto(const float* hgt, int size, double strength, unsigned nThreads,
                        uint8_t* out) {
  parallelRows(size, nThreads, [&](int y0, int y1, unsigned) {
    for (int y = y0; y < y1; y++) {
      const size_t rowC = static_cast<size_t>(y) * size;
      const size_t rowD = static_cast<size_t>((y - 1 + size) % size) * size;
      const size_t rowU = static_cast<size_t>((y + 1) % size) * size;
      for (int x = 0; x < size; x++) {
        // (x - 1 + size) % size and (x + 1) % size, without two divides a texel.
        const int xl = x == 0 ? size - 1 : x - 1;
        const int xr = x == size - 1 ? 0 : x + 1;
        const double l = hgt[rowC + xl];
        const double r = hgt[rowC + xr];
        const double d = hgt[rowD + x];
        const double up = hgt[rowU + x];
        const double nx = (l - r) * strength;
        const double ny = (d - up) * strength;
        const double nz = 1;
        double len = std::sqrt(nx * nx + ny * ny + nz * nz);
        if (!(len > 0)) len = 1;    // `|| 1`: 0 and NaN both fall back (NaN > 0 is false)
        const size_t i = (rowC + x) * 4;
        out[i] = toUint8(((nx / len) * 0.5 + 0.5) * 255);
        out[i + 1] = toUint8(((ny / len) * 0.5 + 0.5) * 255);
        out[i + 2] = toUint8(((nz / len) * 0.5 + 0.5) * 255);
        out[i + 3] = 255;
      }
    }
  });
}

unsigned resolveThreads(unsigned requested, int size) {
  unsigned t = requested ? requested : std::thread::hardware_concurrency();
  if (t == 0) t = 1;
  return std::min<unsigned>(t, static_cast<unsigned>(std::max(1, size)));
}

}  // namespace

const std::vector<std::string>& kinds() {
  static const std::vector<std::string> names = [] {
    std::vector<std::string> v;
    for (const auto& r : detail::recipes()) v.emplace_back(r.name);
    return v;
  }();
  return names;
}

double normalStrength(const std::string& kind) {
  const detail::Recipe* r = detail::findRecipe(kind);
  if (!r) throw std::invalid_argument("game::assets: unknown material kind '" + kind + "'");
  return r->normalStrength;
}

bool isWholeMaterial(const std::string& kind) {
  const detail::Recipe* r = detail::findRecipe(kind);
  if (!r) throw std::invalid_argument("game::assets: unknown material kind '" + kind + "'");
  return r->wholeMaterial;
}

std::vector<uint8_t> heightToNormal(const std::vector<float>& height, int size, double strength,
                                    unsigned threads) {
  if (size < 1 || height.size() != static_cast<size_t>(size) * static_cast<size_t>(size))
    throw std::invalid_argument("game::assets::heightToNormal: height must hold size*size values");
  std::vector<uint8_t> out(height.size() * 4);
  heightToNormalInto(height.data(), size, strength, resolveThreads(threads, size), out.data());
  return out;
}

MaterialMaps bake(const std::string& kind, int size, uint32_t seed) {
  return bake(kind, size, seed, 0u);
}

MaterialMaps bake(const std::string& kind, int size, uint32_t seed, unsigned threads) {
  const detail::Recipe* recipe = detail::findRecipe(kind);
  if (!recipe) throw std::invalid_argument("game::assets: unknown material kind '" + kind + "'");
  if (size < 1) throw std::invalid_argument("game::assets: bake size must be >= 1");
  if (size > 32768) throw std::invalid_argument("game::assets: bake size above 32768");

  const unsigned nThreads = resolveThreads(threads, size);
  const size_t texels = static_cast<size_t>(size) * static_cast<size_t>(size);

  /* `new Noise(seed * 7919 + 13)`, and Rng takes `(seed >>> 0) || 1`:
     unsigned wraparound is exactly ToUint32 of the (exact) double
     product for every 32-bit seed. */
  const Noise n(seed * 7919u + 13u);
  const detail::RecipeFn fn = recipe->fn;

  MaterialMaps maps;
  maps.size = size;
  std::vector<float> height;
  /* std::vector zero-fills on resize, and at 4096 that is 256 MiB of
     first-touch page faults before any work starts. The four buffers are
     independent, so they are sized concurrently when that is worth a
     thread each. */
  allocateConcurrently(nThreads > 1 && texels >= (1u << 20),
                       [&] { maps.albedo.resize(texels * 4); },
                       [&] { maps.orm.resize(texels * 4); },
                       [&] { maps.normal.resize(texels * 4); },
                       [&] { height.resize(texels); });

  // Per-worker relief extremes, reduced after the pass.
  std::vector<double> hMinW(nThreads, std::numeric_limits<double>::infinity());
  std::vector<double> hMaxW(nThreads, -std::numeric_limits<double>::infinity());

  uint8_t* albedo = maps.albedo.data();
  uint8_t* orm = maps.orm.data();
  float* hgt = height.data();
  const double dsize = size;
  /* u = x / size exactly as the JS divides it -- a table, not a multiply
     by 1/size, which would round differently for any size that is not a
     power of two. */
  std::vector<double> uTab(static_cast<size_t>(size));
  for (int x = 0; x < size; x++) uTab[x] = x / dsize;

  // ---- pass 1: the recipe, per texel ------------------------------------
  parallelRows(size, nThreads, [&](int y0, int y1, unsigned w) {
    double hMin = hMinW[w], hMax = hMaxW[w];
    detail::Texel c;
    for (int y = y0; y < y1; y++) {
      const double v = y / dsize;
      for (int x = 0; x < size; x++) {
        const double u = uTab[x];
        c.r = c.g = c.b = 1; c.ao = 1; c.rough = 0.8; c.metal = 0; c.h = 0.5;
        fn(u, v, n, c);
        const size_t t = static_cast<size_t>(y) * size + x;
        const size_t i = t * 4;
        albedo[i] = toUint8(clamp(c.r, 0, 1) * 255);
        albedo[i + 1] = toUint8(clamp(c.g, 0, 1) * 255);
        albedo[i + 2] = toUint8(clamp(c.b, 0, 1) * 255);
        albedo[i + 3] = 255;
        orm[i] = toUint8(clamp(c.ao, 0, 1) * 255);
        orm[i + 1] = toUint8(clamp(c.rough, 0.03, 1) * 255);
        orm[i + 2] = toUint8(clamp(c.metal, 0, 1) * 255);
        /* The height field, quantised into the fixed global window. */
        orm[i + 3] = toUint8(clamp((c.h - kHeightBias) / kHeightSpan, 0, 1) * 255);
        hgt[t] = static_cast<float>(c.h);   // Float32Array store
        if (c.h < hMin) hMin = c.h;
        if (c.h > hMax) hMax = c.h;
      }
    }
    hMinW[w] = hMin;
    hMaxW[w] = hMax;
  });

  double hMin = std::numeric_limits<double>::infinity();
  double hMax = -std::numeric_limits<double>::infinity();
  for (unsigned w = 0; w < nThreads; w++) {
    if (hMinW[w] < hMin) hMin = hMinW[w];
    if (hMaxW[w] > hMax) hMax = hMaxW[w];
  }

  // ---- pass 2: heightToNormal on the RAW float field --------------------
  /* Differentiating the 8-bit packed height would step between adjacent
     codes on the low-relief metals and read as facets; the JS keeps the
     float field for exactly that reason, and so does this. */
  heightToNormalInto(hgt, size, recipe->normalStrength, nThreads, maps.normal.data());

  const double top = kHeightBias + kHeightSpan;
  maps.heightTop = std::min(hMax, top);
  maps.heightRange = std::max(0.0, std::min(hMax, top) - std::max(hMin, kHeightBias));
  return maps;
}

}  // namespace game::assets
