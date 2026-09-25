// ---------------------------------------------------------------------------
//  4K bake timings for the material baker.
//
//      ./build-assets/test_assets_perf [size]          (default 4096)
//
//  Bakes three recipes chosen to be contrasting in cost -- brick (one fbm,
//  3 octaves, plus arithmetic), metal (four fbm calls, 10 octaves in all)
//  and rock (ridged 5 + fbm 3) -- on every hardware thread, then brick
//  again on ONE thread for the scaling figure. Wall-clock milliseconds.
// ---------------------------------------------------------------------------
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <thread>

#include "assets/MaterialBaker.hpp"

namespace ga = game::assets;

namespace {
double msSince(std::chrono::steady_clock::time_point t0) {
  return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
}
// A cheap checksum so the optimiser cannot drop the work and so two runs
// can be compared by eye.
unsigned long long sum(const ga::MaterialMaps& m) {
  unsigned long long s = 0;
  for (size_t i = 0; i < m.albedo.size(); i += 97) s += m.albedo[i] + 3ull * m.normal[i] + 7ull * m.orm[i];
  return s;
}
}  // namespace

int main(int argc, char** argv) {
  const int size = argc > 1 ? std::atoi(argv[1]) : 4096;
  const unsigned hc = std::thread::hardware_concurrency();
  std::printf("hardware_concurrency: %u\n", hc);
  std::printf("bake size: %dx%d (%.1f Mtexel), 3 RGBA8 maps = %.0f MiB out\n", size, size,
              double(size) * size / 1e6, double(size) * size * 12 / (1024.0 * 1024.0));

  for (const char* kind : {"brick", "metal", "rock"}) {
    const auto t0 = std::chrono::steady_clock::now();
    const ga::MaterialMaps m = ga::bake(kind, size, 1);
    const double ms = msSince(t0);
    std::printf("  %-6s %4u threads  %9.1f ms   %6.1f ns/texel   checksum %llu\n", kind, hc ? hc : 1, ms,
                ms * 1e6 / (double(size) * size), sum(m));
  }
  {
    const auto t0 = std::chrono::steady_clock::now();
    const ga::MaterialMaps m = ga::bake("brick", size, 1, 1u);
    const double ms = msSince(t0);
    std::printf("  %-6s %4u thread   %9.1f ms   %6.1f ns/texel   checksum %llu  (single-thread reference)\n",
                "brick", 1u, ms, ms * 1e6 / (double(size) * size), sum(m));
  }
  return 0;
}
