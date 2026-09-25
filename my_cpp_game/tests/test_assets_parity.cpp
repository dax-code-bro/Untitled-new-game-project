// ---------------------------------------------------------------------------
//  Byte parity of the C++ material baker against the JavaScript original.
//
//  1. /opt/node22/bin/node tools/assets_dump.js      (writes build-assets/parity)
//  2. ./build-assets/test_assets_parity [parityDir]
//
//  For every kind: bake(kind, size, seed) with the size/seed the dump used,
//  compare albedo, normal and ORM to the JS bytes, and print per map the
//  max and mean absolute byte difference. A map passes at max <= 2 AND
//  mean <= 0.5. Any failing map fails the run (exit 1). Also checks that
//  the C++ kind list is the JS kind list, that heightTop/heightRange agree,
//  and that an unknown kind throws std::invalid_argument.
// ---------------------------------------------------------------------------
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <vector>

#include "assets/MaterialBaker.hpp"

namespace fs = std::filesystem;
namespace ga = game::assets;

namespace {

constexpr int kMaxTol = 0;      // byte-exact: the port achieves it, so the test enforces it
constexpr double kMeanTol = 0.0;

bool readFile(const fs::path& p, std::vector<uint8_t>& out) {
  std::ifstream f(p, std::ios::binary);
  if (!f) return false;
  out.assign(std::istreambuf_iterator<char>(f), std::istreambuf_iterator<char>());
  return true;
}

fs::path defaultDir() {
  std::error_code ec;
  const fs::path exe = fs::canonical("/proc/self/exe", ec);
  if (!ec) return exe.parent_path() / "parity";
  return fs::path("parity");
}

struct Stat {
  int maxd = 0;
  double mean = 0;
  long over = 0;       // texel channels with |d| > kMaxTol
  int firstX = -1, firstY = -1, firstC = -1, firstJs = 0, firstCpp = 0;
};

Stat compare(const std::vector<uint8_t>& js, const std::vector<uint8_t>& cpp, int size) {
  Stat s;
  long long sum = 0;
  for (size_t i = 0; i < js.size(); i++) {
    const int d = std::abs(int(js[i]) - int(cpp[i]));
    sum += d;
    if (d > s.maxd) {
      s.maxd = d;
      s.firstX = int((i / 4) % size); s.firstY = int((i / 4) / size); s.firstC = int(i % 4);
      s.firstJs = js[i]; s.firstCpp = cpp[i];
    }
    if (d > kMaxTol) s.over++;
  }
  s.mean = js.empty() ? 0 : double(sum) / double(js.size());
  return s;
}

}  // namespace

int main(int argc, char** argv) {
  const fs::path dir = argc > 1 ? fs::path(argv[1]) : defaultDir();
  std::ifstream kf(dir / "kinds.txt"), pf(dir / "params.txt");
  if (!kf || !pf) {
    std::fprintf(stderr,
                 "parity data not found in %s\n"
                 "run first:  /opt/node22/bin/node my_cpp_game/tools/assets_dump.js %s\n",
                 dir.c_str(), dir.c_str());
    return 2;
  }
  int size = 0;
  unsigned seed = 0;
  std::string scope = "full";
  pf >> size >> seed >> scope;   // older dumps have no scope word: full
  const bool partial = scope == "partial";
  std::vector<std::string> jsKinds;
  for (std::string k; std::getline(kf, k);)
    if (!k.empty()) jsKinds.push_back(k);

  bool ok = true;
  std::printf("material baker parity: C++ bake() vs LE.Textures.generate, %dx%d seed %u\n", size, size, seed);
  std::printf("pass per map: max <= %d and mean <= %.2f\n\n", kMaxTol, kMeanTol);

  // The kind lists must be the same list, in the same order.
  const auto& cppKinds = ga::kinds();
  if (partial) {
    // A spot-check dump of a few kinds: each must exist, nothing more.
    for (const auto& k : jsKinds)
      if (std::find(cppKinds.begin(), cppKinds.end(), k) == cppKinds.end()) {
        ok = false;
        std::printf("FAIL: dumped kind '%s' is not a C++ recipe\n", k.c_str());
      }
    std::printf("kind list: PARTIAL dump, %zu of %zu kinds (not a full-coverage run)\n\n",
                jsKinds.size(), cppKinds.size());
  } else if (cppKinds != jsKinds) {
    ok = false;
    std::printf("FAIL kind list: JS has %zu, C++ has %zu\n", jsKinds.size(), cppKinds.size());
    for (const auto& k : jsKinds)
      if (std::find(cppKinds.begin(), cppKinds.end(), k) == cppKinds.end())
        std::printf("  missing in C++: %s\n", k.c_str());
    for (const auto& k : cppKinds)
      if (std::find(jsKinds.begin(), jsKinds.end(), k) == jsKinds.end())
        std::printf("  extra in C++:   %s\n", k.c_str());
  } else {
    std::printf("kind list: %zu kinds, identical order to LE.Textures.kinds\n\n", cppKinds.size());
  }

  std::printf("%-11s | %-16s | %-16s | %-16s | %-22s | %s\n", "kind", "albedo max/mean",
              "normal max/mean", "orm max/mean", "heightTop/Range dJS", "result");
  std::printf("------------+------------------+------------------+------------------+"
              "------------------------+-------\n");

  int kindsFailed = 0;
  std::vector<std::string> failLines;
  double worstMean = 0;
  int worstMax = 0;
  for (const auto& kind : jsKinds) {
    ga::MaterialMaps m;
    try {
      m = ga::bake(kind, size, seed);
    } catch (const std::exception& e) {
      std::printf("%-11s | bake threw: %s\n", kind.c_str(), e.what());
      ok = false; kindsFailed++;
      continue;
    }
    const char* names[3] = {"albedo", "normal", "orm"};
    const std::vector<uint8_t>* mine[3] = {&m.albedo, &m.normal, &m.orm};
    Stat st[3];
    bool kindOk = true;
    for (int k = 0; k < 3; k++) {
      std::vector<uint8_t> js;
      if (!readFile(dir / (kind + "." + names[k] + ".bin"), js) || js.size() != mine[k]->size()) {
        std::printf("%-11s | missing or wrong-sized %s dump\n", kind.c_str(), names[k]);
        kindOk = false;
        st[k].maxd = 255; st[k].mean = 255;
        continue;
      }
      st[k] = compare(js, *mine[k], size);
      if (st[k].maxd > kMaxTol || st[k].mean > kMeanTol) {
        kindOk = false;
        char buf[256];
        std::snprintf(buf, sizeof buf,
                      "  %s.%s: max %d mean %.4f, %ld channels over %d; worst at (%d,%d) ch%d JS=%d C++=%d",
                      kind.c_str(), names[k], st[k].maxd, st[k].mean, st[k].over, kMaxTol,
                      st[k].firstX, st[k].firstY, st[k].firstC, st[k].firstJs, st[k].firstCpp);
        failLines.emplace_back(buf);
      }
      worstMax = std::max(worstMax, st[k].maxd);
      worstMean = std::max(worstMean, st[k].mean);
    }
    // heightTop / heightRange: informational, and a hard check at 1e-9.
    double jsTop = NAN, jsRange = NAN;
    {
      std::ifstream mf(dir / (kind + ".meta.txt"));
      std::string a, b;
      if (mf >> a >> b) { jsTop = std::strtod(a.c_str(), nullptr); jsRange = std::strtod(b.c_str(), nullptr); }
    }
    const double dTop = std::fabs(jsTop - m.heightTop), dRange = std::fabs(jsRange - m.heightRange);
    if (!(dTop <= 1e-9 && dRange <= 1e-9)) {
      kindOk = false;
      char buf[200];
      std::snprintf(buf, sizeof buf, "  %s: heightTop JS %.17g C++ %.17g, heightRange JS %.17g C++ %.17g",
                    kind.c_str(), jsTop, m.heightTop, jsRange, m.heightRange);
      failLines.emplace_back(buf);
    }
    std::printf("%-11s | %3d / %8.5f   | %3d / %8.5f   | %3d / %8.5f   | %9.2g / %9.2g  | %s\n",
                kind.c_str(), st[0].maxd, st[0].mean, st[1].maxd, st[1].mean, st[2].maxd, st[2].mean,
                dTop, dRange, kindOk ? "pass" : "FAIL");
    if (!kindOk) { ok = false; kindsFailed++; }
  }

  // Unknown kinds throw rather than silently baking concrete.
  bool threw = false;
  try { (void)ga::bake("no-such-material", 8, 1); } catch (const std::invalid_argument&) { threw = true; }
  std::printf("\nunknown kind throws std::invalid_argument: %s\n", threw ? "yes" : "NO");
  if (!threw) ok = false;

  // The public heightToNormal, at the JS default strength, on the synthetic field.
  {
    std::vector<uint8_t> hb, jsN;
    if (readFile(dir / "h2n.height.f32", hb) && readFile(dir / "h2n.normal.bin", jsN) && hb.size() == 48 * 48 * 4) {
      std::vector<float> h(48 * 48);
      std::memcpy(h.data(), hb.data(), hb.size());
      const auto mine = ga::heightToNormal(h, 48);
      const Stat st = compare(jsN, mine, 48);
      const bool pass = jsN.size() == mine.size() && st.maxd <= kMaxTol && st.mean <= kMeanTol;
      std::printf("heightToNormal(48x48 synthetic, default strength 2): max %d mean %.5f %s\n", st.maxd,
                  st.mean, pass ? "pass" : "FAIL");
      if (!pass) ok = false;
    } else {
      std::printf("heightToNormal direct check: no h2n dump in this directory (skipped)\n");
    }
  }

  // Thread count must not change a single byte.
  {
    const auto a = ga::bake("gravel", 96, 3, 1u), b = ga::bake("gravel", 96, 3, 7u);
    const bool same = a.albedo == b.albedo && a.normal == b.normal && a.orm == b.orm;
    std::printf("1 thread vs 7 threads, gravel 96px seed 3: %s\n", same ? "identical" : "DIFFERENT");
    if (!same) ok = false;
  }

  if (!failLines.empty()) {
    std::printf("\nfailures:\n");
    for (const auto& l : failLines) std::printf("%s\n", l.c_str());
  }
  std::printf("\nworst map over all kinds: max %d, mean %.5f\n", worstMax, worstMean);
  std::printf("%s: %zu/%zu kinds within tolerance%s\n", ok ? "PASS" : "FAIL",
              jsKinds.size() - kindsFailed, jsKinds.size(),
              partial ? " (PARTIAL dump -- a spot check, not full coverage)" : "");
  return ok ? 0 : 1;
}
