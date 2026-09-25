// Headless CPU renders of every game::geometry primitive, written as PNGs.
//
//   test_geometry_render [out_dir]      (default <my_cpp_game>/build-geometry)
//
// geometry_shaded.png   all ten shapes, back-face culled (CCW front, as the
//                       engine renders), lit, with a tangent-space normal map
//                       of hemispherical domes. Domes only read as domes (lit
//                       on the light side, shadowed on the far side) if the
//                       tangent AND its handedness are right.
// geometry_debug.png    tangent direction as RGB, with the triangle wireframe.
// geometry_winding.png  the four shapes whose winding the port corrects,
//                       rendered with the JS winding (top) and the C++ winding
//                       (bottom) under the same back-face culling.
//
// Checks (exit 1 on failure): every cell renders something; with the C++
// winding every visible pixel of a closed shape faces the camera; the bump
// shading is lighter on the light-facing side of the domes than the far side.
#include "geometry/Shapes.hpp"

#define STB_IMAGE_WRITE_STATIC
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include <stb_image_write.h>

#include <glm/gtc/matrix_transform.hpp>

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <string>
#include <vector>

namespace fs = std::filesystem;
using namespace game::geometry;

namespace {

// ------------------------------------------------------------- tiny font
struct Glyph { char c; unsigned char rows[7]; };
constexpr Glyph kFont[] = {
    {'A', {14, 17, 17, 31, 17, 17, 17}}, {'B', {30, 17, 17, 30, 17, 17, 30}}, {'C', {14, 17, 16, 16, 16, 17, 14}},
    {'D', {30, 17, 17, 17, 17, 17, 30}}, {'E', {31, 16, 16, 30, 16, 16, 31}}, {'F', {31, 16, 16, 30, 16, 16, 16}},
    {'G', {14, 17, 16, 23, 17, 17, 15}}, {'H', {17, 17, 17, 31, 17, 17, 17}}, {'I', {14, 4, 4, 4, 4, 4, 14}},
    {'J', {7, 2, 2, 2, 2, 18, 12}},      {'K', {17, 18, 20, 24, 20, 18, 17}}, {'L', {16, 16, 16, 16, 16, 16, 31}},
    {'M', {17, 27, 21, 21, 17, 17, 17}}, {'N', {17, 17, 25, 21, 19, 17, 17}}, {'O', {14, 17, 17, 17, 17, 17, 14}},
    {'P', {30, 17, 17, 30, 16, 16, 16}}, {'Q', {14, 17, 17, 17, 21, 18, 13}}, {'R', {30, 17, 17, 30, 20, 18, 17}},
    {'S', {15, 16, 16, 14, 1, 1, 30}},   {'T', {31, 4, 4, 4, 4, 4, 4}},       {'U', {17, 17, 17, 17, 17, 17, 14}},
    {'V', {17, 17, 17, 17, 17, 10, 4}},  {'W', {17, 17, 17, 21, 21, 21, 10}}, {'X', {17, 17, 10, 4, 10, 17, 17}},
    {'Y', {17, 17, 10, 4, 4, 4, 4}},     {'Z', {31, 1, 2, 4, 8, 16, 31}},
    {'0', {14, 17, 19, 21, 25, 17, 14}}, {'1', {4, 12, 4, 4, 4, 4, 14}},      {'2', {14, 17, 1, 2, 4, 8, 31}},
    {'3', {31, 2, 4, 2, 1, 17, 14}},     {'4', {2, 6, 10, 18, 31, 2, 2}},     {'5', {31, 16, 30, 1, 1, 17, 14}},
    {'6', {6, 8, 16, 30, 17, 17, 14}},   {'7', {31, 1, 2, 4, 8, 8, 8}},       {'8', {14, 17, 17, 14, 17, 17, 14}},
    {'9', {14, 17, 17, 15, 1, 2, 12}},
    {'(', {2, 4, 8, 8, 8, 4, 2}},        {')', {8, 4, 2, 2, 2, 4, 8}},        {',', {0, 0, 0, 0, 12, 4, 8}},
    {'.', {0, 0, 0, 0, 0, 12, 12}},      {'-', {0, 0, 0, 31, 0, 0, 0}},       {'+', {0, 4, 4, 31, 4, 4, 0}},
    {':', {0, 12, 12, 0, 12, 12, 0}},    {'/', {1, 2, 2, 4, 8, 8, 16}},       {'=', {0, 0, 31, 0, 31, 0, 0}},
    {'_', {0, 0, 0, 0, 0, 0, 31}},       {'%', {25, 26, 2, 4, 8, 11, 19}},
};

struct Image {
    int w = 0, h = 0;
    std::vector<glm::vec3> px;
    Image(int w_, int h_, glm::vec3 fill) : w(w_), h(h_), px(static_cast<std::size_t>(w_) * h_, fill) {}
    glm::vec3& at(int x, int y) { return px[static_cast<std::size_t>(y) * w + x]; }
};

void drawText(Image& img, int x, int y, const std::string& s, int scale, glm::vec3 col) {
    for (char ch : s) {
        const char c = static_cast<char>(std::toupper(static_cast<unsigned char>(ch)));
        const Glyph* g = nullptr;
        for (const Glyph& gl : kFont) if (gl.c == c) { g = &gl; break; }
        if (g) {
            for (int r = 0; r < 7; ++r)
                for (int b = 0; b < 5; ++b)
                    if (g->rows[r] & (16 >> b))
                        for (int dy = 0; dy < scale; ++dy)
                            for (int dx = 0; dx < scale; ++dx) {
                                const int X = x + b * scale + dx, Y = y + r * scale + dy;
                                if (X >= 0 && Y >= 0 && X < img.w && Y < img.h) img.at(X, Y) = col;
                            }
        }
        x += 6 * scale;
    }
}

// --------------------------------------------------------------- renderer
enum class Mode { Shaded, Debug, Plain };

struct CellStats {
    std::size_t covered = 0;      // pixels with geometry
    std::size_t facingCamera = 0; // of those, interpolated normal faces the camera
    double litSide = 0, farSide = 0; // bump shading on the light / far side of the domes
    std::size_t litN = 0, farN = 0;
};

struct Shot {
    float az = 35, el = 28;  // degrees
    bool cull = true;        // back-face culling (CCW front); grass is double sided
    float uvFreq = 4;        // domes per UV unit
    glm::vec3 base{0.7f};
};

// Renders `m` into `img` at SSAA factor `ss` inside the cell [cx, cx+cw) x [cy, cy+ch).
CellStats renderCell(Image& img, int cx, int cy, int cw, int ch, const MeshData& m, const Shot& shot, Mode mode) {
    constexpr int ss = 3;
    const int W = cw * ss, H = ch * ss;
    std::vector<glm::vec3> color(static_cast<std::size_t>(W) * H);
    std::vector<float> depth(static_cast<std::size_t>(W) * H, 1e30f);
    std::vector<unsigned char> facing(static_cast<std::size_t>(W) * H, 0);
    // background: soft vertical gradient
    for (int y = 0; y < H; ++y) {
        const float t = static_cast<float>(y) / H;
        const glm::vec3 bg = glm::mix(glm::vec3(0.16f, 0.18f, 0.22f), glm::vec3(0.07f, 0.075f, 0.09f), t);
        for (int x = 0; x < W; ++x) color[static_cast<std::size_t>(y) * W + x] = bg;
    }

    // Frame the bounding sphere.
    const glm::vec3 center = (m.boundsMin + m.boundsMax) * 0.5f;
    float radius = 0;
    for (const auto& p : m.positions) radius = std::max(radius, glm::length(p - center));
    const float fov = glm::radians(30.0f);
    const float az = glm::radians(shot.az), el = glm::radians(shot.el);
    const glm::vec3 dir(std::cos(el) * std::sin(az), std::sin(el), std::cos(el) * std::cos(az));
    const float dist = radius / std::sin(fov * 0.5f) * 1.04f;
    const glm::vec3 eye = center + dir * dist;
    const glm::mat4 view = glm::lookAt(eye, center, glm::vec3(0, 1, 0));
    const glm::mat4 proj = glm::perspective(fov, static_cast<float>(cw) / ch, std::max(0.01f, dist - radius * 1.5f), dist + radius * 1.5f);
    const glm::mat4 vp = proj * view;
    // Key light from upper-left-front in camera space, moved to world.
    const glm::mat3 camToWorld = glm::transpose(glm::mat3(view));
    const glm::vec3 L = glm::normalize(camToWorld * glm::vec3(-0.55f, 0.65f, 0.55f));
    const glm::vec3 Lfill = glm::normalize(camToWorld * glm::vec3(0.7f, -0.1f, 0.4f));

    struct SV { glm::vec2 s; float invW, z; };
    std::vector<SV> sv(m.positions.size());
    for (std::size_t i = 0; i < m.positions.size(); ++i) {
        const glm::vec4 c = vp * glm::vec4(m.positions[i], 1.0f);
        const float iw = 1.0f / c.w;
        sv[i] = {glm::vec2((c.x * iw * 0.5f + 0.5f) * W, (1.0f - (c.y * iw * 0.5f + 0.5f)) * H), iw, c.z * iw};
    }

    CellStats st;
    for (std::size_t k = 0; k + 2 < m.indices.size(); k += 3) {
        const uint32_t i0 = m.indices[k], i1 = m.indices[k + 1], i2 = m.indices[k + 2];
        const SV &a = sv[i0], &b = sv[i1], &c = sv[i2];
        // Signed area in screen space (y down): negative == CCW in NDC == front.
        const float area = (b.s.x - a.s.x) * (c.s.y - a.s.y) - (c.s.x - a.s.x) * (b.s.y - a.s.y);
        if (std::abs(area) < 1e-12f) continue;
        const bool front = area < 0;
        if (shot.cull && !front) continue;
        const int x0 = std::max(0, static_cast<int>(std::floor(std::min({a.s.x, b.s.x, c.s.x}))));
        const int x1 = std::min(W - 1, static_cast<int>(std::ceil(std::max({a.s.x, b.s.x, c.s.x}))));
        const int y0 = std::max(0, static_cast<int>(std::floor(std::min({a.s.y, b.s.y, c.s.y}))));
        const int y1 = std::min(H - 1, static_cast<int>(std::ceil(std::max({a.s.y, b.s.y, c.s.y}))));
        const float e0len = glm::length(c.s - b.s), e1len = glm::length(a.s - c.s), e2len = glm::length(b.s - a.s);
        // The triangle's TRUE surface directions for +u and +v (dP/du, dP/dv),
        // from its positions and UVs -- independent of the stored tangents, so
        // the dome check below catches a wrong tangent or handedness.
        glm::vec3 dPdu(0), dPdv(0);
        bool uvOk = false;
        {
            const glm::vec3 e1 = m.positions[i1] - m.positions[i0], e2 = m.positions[i2] - m.positions[i0];
            const glm::vec2 d1 = m.uvs[i1] - m.uvs[i0], d2 = m.uvs[i2] - m.uvs[i0];
            const float det = d1.x * d2.y - d2.x * d1.y;
            if (std::abs(det) > 1e-12f) {
                dPdu = (e1 * d2.y - e2 * d1.y) / det;
                dPdv = (e2 * d1.x - e1 * d2.x) / det;
                uvOk = true;
            }
        }
        for (int y = y0; y <= y1; ++y) {
            for (int x = x0; x <= x1; ++x) {
                const glm::vec2 p(x + 0.5f, y + 0.5f);
                float w0 = (b.s.x - p.x) * (c.s.y - p.y) - (c.s.x - p.x) * (b.s.y - p.y);
                float w1 = (c.s.x - p.x) * (a.s.y - p.y) - (a.s.x - p.x) * (c.s.y - p.y);
                float w2 = (a.s.x - p.x) * (b.s.y - p.y) - (b.s.x - p.x) * (a.s.y - p.y);
                w0 /= area; w1 /= area; w2 /= area;
                if (w0 < 0 || w1 < 0 || w2 < 0) continue;
                const float z = w0 * a.z + w1 * b.z + w2 * c.z;
                const std::size_t idx = static_cast<std::size_t>(y) * W + x;
                if (z >= depth[idx]) continue;
                depth[idx] = z;
                // perspective-correct attributes
                const float q0 = w0 * a.invW, q1 = w1 * b.invW, q2 = w2 * c.invW, qs = q0 + q1 + q2;
                auto lerp3 = [&](const glm::vec3& A, const glm::vec3& B, const glm::vec3& C) { return (A * q0 + B * q1 + C * q2) / qs; };
                const glm::vec3 P = lerp3(m.positions[i0], m.positions[i1], m.positions[i2]);
                glm::vec3 N = glm::normalize(lerp3(m.normals[i0], m.normals[i1], m.normals[i2]));
                const glm::vec2 uv = (m.uvs[i0] * q0 + m.uvs[i1] * q1 + m.uvs[i2] * q2) / qs;
                const glm::vec4 T4 = (m.tangents[i0] * q0 + m.tangents[i1] * q1 + m.tangents[i2] * q2) / qs;
                const glm::vec3 V = glm::normalize(eye - P);
                // Double-sided surfaces flip the normal on back faces, as the engine shader does.
                if (!front) N = -N;
                const bool faces = glm::dot(N, V) > 0;
                facing[idx] = faces ? 1 : 0;

                glm::vec3 T = glm::vec3(T4);
                T = T - N * glm::dot(N, T);
                const float tl = glm::length(T);
                T = tl > 1e-8f ? T / tl : glm::vec3(1, 0, 0);
                const float w = T4.w < 0 ? -1.0f : 1.0f;
                const glm::vec3 B = glm::cross(N, T) * w;

                glm::vec3 out;
                if (mode == Mode::Debug) {
                    out = T * 0.5f + 0.5f;
                    if (w < 0) out *= 0.8f;
                    const float d = std::min({w0 * std::abs(area) / e0len, w1 * std::abs(area) / e1len, w2 * std::abs(area) / e2len});
                    const float line = glm::clamp(1.0f - (d - 0.6f * ss) / (0.9f * ss), 0.0f, 1.0f);
                    out = glm::mix(out, glm::vec3(0.02f), line * 0.85f);
                } else {
                    glm::vec3 Nw = N;
                    float domeSide = 0; // +1 on the light side of a dome, -1 on the far side
                    if (mode == Mode::Shaded) {
                        const glm::vec2 cuv = uv * shot.uvFreq;
                        const glm::vec2 cc = cuv - glm::floor(cuv) - 0.5f;
                        const float R = 0.36f, r2 = glm::dot(cc, cc);
                        if (r2 < R * R * 0.97f) {
                            const float hgt = std::sqrt(R * R - r2);
                            const glm::vec3 nt = glm::normalize(glm::vec3(cc.x / hgt, cc.y / hgt, 1.0f));
                            Nw = glm::normalize(T * nt.x + B * nt.y + N * nt.z);
                            // Which side of the dome this pixel is on, measured with the
                            // triangle's true dP/du, dP/dv -- not with T and B.
                            glm::vec3 offs = dPdu * cc.x + dPdv * cc.y;
                            offs -= N * glm::dot(N, offs);
                            const glm::vec3 Lt = L - N * glm::dot(N, L);
                            if (uvOk && glm::length(Lt) > 0.2f && glm::length(offs) > 1e-12f && std::sqrt(r2) > R * 0.45f) {
                                const float side = glm::dot(glm::normalize(offs), glm::normalize(Lt));
                                domeSide = side > 0.5f ? 1.0f : side < -0.5f ? -1.0f : 0.0f;
                            }
                        }
                    }
                    const float ndl = std::max(0.0f, glm::dot(Nw, L));
                    const float fill = std::max(0.0f, glm::dot(Nw, Lfill));
                    const glm::vec3 Hh = glm::normalize(L + V);
                    const float spec = std::pow(std::max(0.0f, glm::dot(Nw, Hh)), 60.0f) * (ndl > 0 ? 1.0f : 0.0f);
                    const float sky = 0.5f + 0.5f * Nw.y;
                    glm::vec3 lin = shot.base * (0.05f + 0.10f * sky + 1.05f * ndl + 0.22f * fill) + glm::vec3(0.35f * spec);
                    const float lum = glm::dot(lin, glm::vec3(0.2126f, 0.7152f, 0.0722f));
                    if (domeSide > 0) { st.litSide += lum; ++st.litN; }
                    if (domeSide < 0) { st.farSide += lum; ++st.farN; }
                    // ACES-ish tone map then gamma
                    lin = (lin * (2.51f * lin + 0.03f)) / (lin * (2.43f * lin + 0.59f) + 0.14f);
                    out = glm::pow(glm::clamp(lin, 0.0f, 1.0f), glm::vec3(1.0f / 2.2f));
                }
                color[idx] = out;
            }
        }
    }
    for (std::size_t i = 0; i < depth.size(); ++i) {
        if (depth[i] < 1e29f) { ++st.covered; if (facing[i]) ++st.facingCamera; }
    }
    // downsample into the sheet
    for (int y = 0; y < ch; ++y)
        for (int x = 0; x < cw; ++x) {
            glm::vec3 acc(0);
            for (int sy = 0; sy < ss; ++sy)
                for (int sx = 0; sx < ss; ++sx) acc += color[static_cast<std::size_t>(y * ss + sy) * W + (x * ss + sx)];
            if (cx + x < img.w && cy + y < img.h) img.at(cx + x, cy + y) = acc / static_cast<float>(ss * ss);
        }
    return st;
}

bool writePng(const fs::path& p, const Image& img) {
    std::vector<unsigned char> buf(static_cast<std::size_t>(img.w) * img.h * 3);
    for (std::size_t i = 0; i < img.px.size(); ++i)
        for (int k = 0; k < 3; ++k)
            buf[i * 3 + k] = static_cast<unsigned char>(std::lround(glm::clamp(img.px[i][k], 0.0f, 1.0f) * 255.0f));
    return stbi_write_png(p.string().c_str(), img.w, img.h, 3, buf.data(), img.w * 3) != 0;
}

// The JS winding, reconstructed: the triangles the port rewinds, swapped back.
MeshData withJsWinding(MeshData m, const std::string& shape) {
    for (std::size_t k = 0; k + 2 < m.indices.size(); k += 3) {
        bool flip = shape == "cylinder" || shape == "cone" || shape == "torus";
        if (shape == "box") flip = std::abs(m.normals[m.indices[k]].y) > 0.5f; // the +Y / -Y faces
        if (flip) std::swap(m.indices[k + 1], m.indices[k + 2]);
    }
    return m;
}

double waves(double x, double z) {
    return std::sin(x * 0.15) * 3 + std::cos(z * 0.1) * 2 + std::sin((x + z) * 0.05) * 5;
}

struct Entry { std::string label; std::string shape; MeshData mesh; Shot shot; bool closed; };

} // namespace

int main(int argc, char** argv) {
    const fs::path outDir = argc > 1 ? fs::path(argv[1]) : fs::path(__FILE__).parent_path().parent_path() / "build-geometry";
    fs::create_directories(outDir);

    auto shot = [](float uvFreq, glm::vec3 base, float az = 35, float el = 28, bool cull = true) {
        Shot s; s.uvFreq = uvFreq; s.base = base; s.az = az; s.el = el; s.cull = cull; return s;
    };
    std::vector<Entry> e;
    e.push_back({"box()", "box", box(), shot(3, {0.75f, 0.42f, 0.22f}), true});
    e.push_back({"sphere()", "sphere", sphere(), shot(5, {0.30f, 0.55f, 0.85f}), true});
    e.push_back({"cylinder()", "cylinder", cylinder(), shot(3, {0.55f, 0.75f, 0.35f}), true});
    e.push_back({"cone()", "cone", cone(), shot(3, {0.85f, 0.70f, 0.25f}), true});
    e.push_back({"capsule()", "capsule", capsule(), shot(4, {0.70f, 0.40f, 0.75f}), true});
    e.push_back({"plane(10,10,6,6)", "plane", plane(10, 10, 6, 6, 1), shot(0.6f, {0.55f, 0.55f, 0.58f}, 35, 40), false});
    e.push_back({"torus()", "torus", torus(), shot(4, {0.85f, 0.35f, 0.35f}, 35, 40), true});
    e.push_back({"terrain(40,24,wav)", "terrain", terrain(40, 24, waves, 0.25), shot(0.6f, {0.40f, 0.58f, 0.30f}, 35, 38), false});
    e.push_back({"rock()", "rock", rock(), shot(4, {0.52f, 0.50f, 0.47f}), true});
    e.push_back({"grassBlade()", "grassBlade", grassBlade(), shot(6, {0.35f, 0.70f, 0.25f}, 200, 12, false), false});

    constexpr int cols = 5, cw = 360, chh = 360, title = 56, labelH = 30;
    const glm::vec3 bgSheet(0.04f, 0.045f, 0.055f), textCol(0.92f, 0.93f, 0.95f), dimCol(0.6f, 0.63f, 0.68f);
    bool ok = true;

    for (const Mode mode : {Mode::Shaded, Mode::Debug}) {
        const int rows = static_cast<int>((e.size() + cols - 1) / cols);
        Image sheet(cols * cw, title + rows * (chh + labelH), bgSheet);
        drawText(sheet, 16, 14, mode == Mode::Shaded ? "GAME::GEOMETRY - CULLED, NORMAL-MAPPED DOMES (TANGENT TEST)"
                                                     : "GAME::GEOMETRY - TANGENT AS RGB + WIREFRAME (DARKER = W -1)", 3, textCol);
        for (std::size_t i = 0; i < e.size(); ++i) {
            const int cx = static_cast<int>(i % cols) * cw, cy = title + static_cast<int>(i / cols) * (chh + labelH);
            const CellStats st = renderCell(sheet, cx, cy, cw, chh, e[i].mesh, e[i].shot, mode);
            char info[96];
            std::snprintf(info, sizeof info, "%zuV %zuT", e[i].mesh.vertexCount(), e[i].mesh.triangleCount());
            drawText(sheet, cx + 10, cy + chh + 6, e[i].label, 2, textCol);
            drawText(sheet, cx + cw - 10 - static_cast<int>(std::strlen(info)) * 12, cy + chh + 6, info, 2, dimCol);
            const bool rendered = st.covered > 1000;
            bool pass = rendered;
            std::string note;
            if (mode == Mode::Shaded) {
                const double lit = st.litN ? st.litSide / st.litN : 0, far = st.farN ? st.farSide / st.farN : 0;
                // Domes must be brighter on the side facing the light. A wrong
                // tangent or handedness turns them into dents and inverts this.
                const bool domesOk = st.litN > 200 && st.farN > 200 && lit > far * 1.15;
                const double facingFrac = st.covered ? static_cast<double>(st.facingCamera) / st.covered : 0;
                // Smooth-shaded silhouettes keep a sliver of front-facing triangles
                // whose interpolated normal already points away; inside-out
                // geometry scores near 0, so 99% separates the two cleanly.
                const bool facingOk = !e[i].closed || facingFrac > 0.99;
                pass = pass && domesOk && facingOk;
                char buf[200];
                std::snprintf(buf, sizeof buf, "domes lit-side %.3f vs far-side %.3f (n=%zu/%zu)%s, facing camera %.2f%%",
                              lit, far, st.litN, st.farN, domesOk ? "" : " WRONG", 100.0 * facingFrac);
                note = buf;
            }
            std::printf("[%s] %-10s %-22s covered %7zu px  %s\n", pass ? "PASS" : "FAIL",
                        mode == Mode::Shaded ? "shaded" : "debug", e[i].label.c_str(), st.covered, note.c_str());
            ok = ok && pass;
        }
        const fs::path p = outDir / (mode == Mode::Shaded ? "geometry_shaded.png" : "geometry_debug.png");
        if (!writePng(p, sheet)) { std::printf("could not write %s\n", p.string().c_str()); ok = false; }
        else std::printf("wrote %s (%dx%d)\n", p.string().c_str(), sheet.w, sheet.h);
    }

    // ---- winding: JS vs C++ under the engine's back-face culling ----------
    {
        const int wc = 4, rowsH = chh + labelH;
        Image sheet(wc * cw, title + 2 * rowsH + 10, bgSheet);
        drawText(sheet, 16, 14, "BACK-FACE CULLED: TOP = JS WINDING (INSIDE-OUT), BOTTOM = C++ PORT", 3, textCol);
        const char* names[wc] = {"box", "cylinder", "cone", "torus"};
        for (int i = 0; i < wc; ++i) {
            const Entry* en = nullptr;
            for (const Entry& x : e) if (x.shape == names[i]) en = &x;
            const MeshData js = withJsWinding(en->mesh, en->shape);
            Shot s = en->shot;
            const CellStats a = renderCell(sheet, i * cw, title, cw, chh, js, s, Mode::Plain);
            const CellStats b = renderCell(sheet, i * cw, title + rowsH + 10, cw, chh, en->mesh, s, Mode::Plain);
            const double fa = a.covered ? 100.0 * a.facingCamera / a.covered : 0, fb = b.covered ? 100.0 * b.facingCamera / b.covered : 0;
            char l1[80], l2[80];
            std::snprintf(l1, sizeof l1, "JS %s %.0f%% FACING", en->label.c_str(), fa);
            std::snprintf(l2, sizeof l2, "C++ %s %.0f%% FACING", en->label.c_str(), fb);
            drawText(sheet, i * cw + 10, title + chh + 6, l1, 2, glm::vec3(1.0f, 0.55f, 0.5f));
            drawText(sheet, i * cw + 10, title + rowsH + 10 + chh + 6, l2, 2, glm::vec3(0.6f, 1.0f, 0.6f));
            // The C++ winding must show a solid, camera-facing surface. The JS
            // winding either shows inner walls (low facing %) or has holes
            // where culled faces were (the box's top: lower coverage).
            const bool jsVisiblyWrong = fa < 50.0 || a.covered < b.covered * 0.9;
            const bool pass = fb > 99.0 && jsVisiblyWrong;
            std::printf("[%s] winding    %-10s facing camera: JS winding %6.2f%% of %7zu px, C++ winding %6.2f%% of %7zu px\n",
                        pass ? "PASS" : "FAIL", names[i], fa, a.covered, fb, b.covered);
            ok = ok && pass;
        }
        const fs::path p = outDir / "geometry_winding.png";
        if (!writePng(p, sheet)) { std::printf("could not write %s\n", p.string().c_str()); ok = false; }
        else std::printf("wrote %s (%dx%d)\n", p.string().c_str(), sheet.w, sheet.h);
    }

    std::printf("\nOVERALL: %s\n", ok ? "PASS" : "FAIL");
    return ok ? 0 : 1;
}
