// ---------------------------------------------------------------------------
//  Contact sheets of what the C++ material baker produces -- the pictures
//  to look at, where test_assets_parity is the proof.
//
//      ./build-assets/test_assets_preview [outDir] [tile]
//          outDir defaults to <exe dir>/preview, tile to 256
//
//  Writes:
//    materials_shaded.png   every recipe as a lit swatch (below)
//    materials_maps.png     every recipe's albedo | normal | ORM, raw
//    materials_4k_crops.png four recipes baked at 4096, 512x512 crops at
//                           ONE TEXEL PER PIXEL -- what 4K density looks like
//
//  The swatch shading is a preview, not the engine's BRDF: one directional
//  light from the upper left, Blinn-Phong specular normalised for energy,
//  a two-colour sky for metals to reflect, filmic tone curve. It exists so
//  relief, sheen and metalness READ on a flat sheet. Variation-layer
//  recipes (concrete, skin, fabric, ...) are shown untinted, i.e. near
//  white, because in the game the material's colour multiplies them.
// ---------------------------------------------------------------------------
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <string>
#include <vector>

#define STB_IMAGE_WRITE_STATIC
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include <stb_image_write.h>
#include <stb_easy_font.h>

#include "assets/MaterialBaker.hpp"

namespace fs = std::filesystem;
namespace ga = game::assets;

namespace {

struct Image {
  int w, h;
  std::vector<uint8_t> px;   // RGB
  Image(int w_, int h_, uint8_t fill) : w(w_), h(h_), px(size_t(w_) * h_ * 3, fill) {}
  void put(int x, int y, uint8_t r, uint8_t g, uint8_t b) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    uint8_t* p = &px[(size_t(y) * w + x) * 3];
    p[0] = r; p[1] = g; p[2] = b;
  }
};

/* Text via stb_easy_font's quads, rasterised as axis-aligned rectangles. */
void text(Image& im, int x, int y, const std::string& s, int scale, uint8_t lum) {
  static char vbuf[64 * 1024];
  std::vector<char> str(s.begin(), s.end());
  str.push_back('\0');
  unsigned char col[4] = {255, 255, 255, 255};
  const int quads = stb_easy_font_print(0, 0, str.data(), col, vbuf, sizeof vbuf);
  for (int q = 0; q < quads; q++) {
    const float* v = reinterpret_cast<const float*>(vbuf + q * 4 * 16);
    float x0 = v[0], y0 = v[1], x1 = v[0], y1 = v[1];
    for (int k = 1; k < 4; k++) {
      const float* p = reinterpret_cast<const float*>(vbuf + (q * 4 + k) * 16);
      x0 = std::min(x0, p[0]); x1 = std::max(x1, p[0]);
      y0 = std::min(y0, p[1]); y1 = std::max(y1, p[1]);
    }
    for (int yy = int(y0 * scale); yy < int(y1 * scale); yy++)
      for (int xx = int(x0 * scale); xx < int(x1 * scale); xx++) im.put(x + xx, y + yy, lum, lum, lum);
  }
}

double s2l(double c) { return c <= 0.04045 ? c / 12.92 : std::pow((c + 0.055) / 1.055, 2.4); }
double l2s(double c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * std::pow(c, 1 / 2.4) - 0.055; }
double filmic(double x) {   // Narkowicz ACES fit
  x *= 0.8;
  return std::clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

/* Shade one texel of a baked material. Image space: x right, y DOWN, z
   toward the viewer -- the same frame heightToNormal differentiates in. */
void shade(const ga::MaterialMaps& m, size_t t, uint8_t out[3]) {
  const uint8_t* a = &m.albedo[t * 4];
  const uint8_t* nm = &m.normal[t * 4];
  const uint8_t* o = &m.orm[t * 4];
  double nx = nm[0] / 255.0 * 2 - 1, ny = nm[1] / 255.0 * 2 - 1, nz = nm[2] / 255.0 * 2 - 1;
  const double nl = std::sqrt(nx * nx + ny * ny + nz * nz);
  nx /= nl; ny /= nl; nz /= nl;
  const double ao = o[0] / 255.0, rough = std::max(0.04, o[1] / 255.0), metal = o[2] / 255.0;
  const double alb[3] = {s2l(a[0] / 255.0), s2l(a[1] / 255.0), s2l(a[2] / 255.0)};

  const double Lx = -0.48, Ly = -0.52, Lz = 0.706;   // upper-left key light
  const double NdL = std::max(0.0, nx * Lx + ny * Ly + nz * Lz);
  double hx = Lx, hy = Ly, hz = Lz + 1;               // H = normalize(L + V), V = +z
  const double hl = std::sqrt(hx * hx + hy * hy + hz * hz);
  hx /= hl; hy /= hl; hz /= hl;
  const double NdH = std::max(0.0, nx * hx + ny * hy + nz * hz);
  const double alpha = rough * rough;
  const double sp = std::clamp(2 / (alpha * alpha) - 2, 1.0, 4096.0);
  const double blinn = (sp + 8) / (8 * 3.14159265358979) * std::pow(NdH, sp);
  // Reflection of V about n, for the sky lookup; "up" is -y in image space.
  const double ry = 2 * nz * ny;                      // R = 2(n.V)n - V, V = +z
  const double skyT = std::clamp(0.5 - 0.5 * ry, 0.0, 1.0);
  for (int c = 0; c < 3; c++) {
    const double f0 = 0.04 * (1 - metal) + alb[c] * metal;
    const double diffuse = (1 - metal) * alb[c] * (2.6 * NdL + 0.32 * ao);
    const double sky = (c == 2 ? 1.05 : c == 1 ? 0.95 : 0.85) * (0.12 + 0.88 * skyT);
    const double env = f0 * sky * ao * (1.0 - 0.55 * rough);
    const double spec = f0 * blinn * 2.6 * NdL;
    out[c] = uint8_t(std::lround(l2s(filmic(diffuse + env + spec)) * 255));
  }
}

}  // namespace

int main(int argc, char** argv) {
  std::error_code ec;
  fs::path outDir = argc > 1 ? fs::path(argv[1]) : fs::canonical("/proc/self/exe", ec).parent_path() / "preview";
  const int T = argc > 2 ? std::max(32, std::atoi(argv[2])) : 256;
  fs::create_directories(outDir);
  const auto& kinds = ga::kinds();
  const int N = int(kinds.size());

  // ---- sheet 1: shaded swatches ------------------------------------------
  const int cols = 8, rows = (N + cols - 1) / cols, gap = 8, label = 22, head = 40;
  Image shaded(cols * (T + gap) + gap, head + rows * (T + label + gap) + gap, 18);
  text(shaded, gap, 10, "game::assets::bake -- all " + std::to_string(N) + " recipes, " +
       std::to_string(T) + "px, seed 1 (lit preview; layer recipes shown untinted)", 2, 235);
  // ---- sheet 2: raw maps ---------------------------------------------------
  const int P = T / 2, mcols = 4, mrows = (N + mcols - 1) / mcols;
  const int cellW = 3 * P + 2 * 2, cellH = P + label;
  Image maps(mcols * (cellW + gap) + gap, head + mrows * (cellH + gap) + gap, 18);
  text(maps, gap, 10, "albedo | normal | ORM (r=AO g=rough b=metal) -- " + std::to_string(P) + "px each", 2, 235);

  const auto t0 = std::chrono::steady_clock::now();
  for (int k = 0; k < N; k++) {
    const auto& kind = kinds[k];
    const ga::MaterialMaps m = ga::bake(kind, T, 1);
    const int ox = gap + (k % cols) * (T + gap), oy = head + (k / cols) * (T + label + gap);
    for (int y = 0; y < T; y++)
      for (int x = 0; x < T; x++) {
        uint8_t c[3];
        shade(m, size_t(y) * T + x, c);
        shaded.put(ox + x, oy + label + y, c[0], c[1], c[2]);
      }
    text(shaded, ox, oy + 3, kind + (ga::isWholeMaterial(kind) ? "" : "  (layer)"), 2, 225);

    const ga::MaterialMaps s = ga::bake(kind, P, 1);
    const int mx = gap + (k % mcols) * (cellW + gap), my = head + (k / mcols) * (cellH + gap);
    const std::vector<uint8_t>* src[3] = {&s.albedo, &s.normal, &s.orm};
    for (int p = 0; p < 3; p++)
      for (int y = 0; y < P; y++)
        for (int x = 0; x < P; x++) {
          const uint8_t* q = &(*src[p])[(size_t(y) * P + x) * 4];
          maps.put(mx + p * (P + 2) + x, my + label + y, q[0], q[1], q[2]);
        }
    text(maps, mx, my + 3, kind, 2, 225);
  }
  const double sheetMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();

  // ---- sheet 3: 4K crops at one texel per pixel -----------------------------
  const char* showcase[4] = {"brick", "setts", "gravel", "walnut"};
  const int C = 512;
  Image crops(4 * (C + gap) + gap, head + C + label + gap, 18);
  text(crops, gap, 10, "baked at 4096x4096 -- 512x512 crops at 1 texel = 1 pixel (lit preview)", 2, 235);
  double bakeMs[4];
  for (int i = 0; i < 4; i++) {
    const auto b0 = std::chrono::steady_clock::now();
    const ga::MaterialMaps m = ga::bake(showcase[i], 4096, 1);
    bakeMs[i] = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - b0).count();
    const int ox = gap + i * (C + gap), oy = head;
    for (int y = 0; y < C; y++)
      for (int x = 0; x < C; x++) {
        uint8_t c[3];
        shade(m, size_t(1024 + y) * 4096 + (1024 + x), c);
        crops.put(ox + x, oy + label + y, c[0], c[1], c[2]);
      }
    char buf[96];
    std::snprintf(buf, sizeof buf, "%s  (4K bake %.0f ms)", showcase[i], bakeMs[i]);
    text(crops, ox, oy + 3, buf, 2, 225);
  }

  const auto save = [&](const Image& im, const char* name) {
    const fs::path p = outDir / name;
    const bool ok = stbi_write_png(p.c_str(), im.w, im.h, 3, im.px.data(), im.w * 3) != 0;
    std::printf("%s %s (%dx%d)\n", ok ? "wrote" : "FAILED", p.c_str(), im.w, im.h);
    return ok;
  };
  bool ok = save(shaded, "materials_shaded.png");
  ok = save(maps, "materials_maps.png") && ok;
  ok = save(crops, "materials_4k_crops.png") && ok;
  std::printf("contact sheets baked in %.0f ms (%d recipes at %d and %d px)\n", sheetMs, N, T, P);
  return ok ? 0 : 1;
}
