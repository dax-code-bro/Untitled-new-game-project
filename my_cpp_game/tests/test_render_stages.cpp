// Renders the showcase once and checks each pass did its job, saving a
// picture of every intermediate target on the way:
//
//   stage-gbuffer-normal.png   view-space shading normal (octahedral decode)
//   stage-gbuffer-rough.png    roughness (R) / metalness (G)
//   stage-ao.png               SSAO after blur
//   stage-contact.png          SSAO x screen-space contact shadows
//   stage-ssr.png              traced reflection (rgb) and confidence (alpha)
//   stage-vol.png              in-scattered sunlight
//   stage-shadow0.png          cascade 0 depth
//   stage-final.png            the frame
//
// Checks, each of which a real bug in the web engine once failed silently:
//   - zero GL errors over the frame (KHR_debug)
//   - every active uniform of every program was set at least once
//   - AO has contrast, SSR found hits, volumetrics added light, the
//     shadow map holds geometry, the final frame is not flat
//
//   ./build/test_render_stages [outdir]
#include "core/Capture.hpp"
#include "core/GlDebug.hpp"
#include "core/Window.hpp"
#include "rendering/Material.hpp"
#include "rendering/Renderer.hpp"
#include "rendering/ShaderLibrary.hpp"
#include "scene/Showcase.hpp"

#include <glad/gl.h>
#include <glm/glm.hpp>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

using namespace game;

namespace {
int g_fail = 0;
void check(bool ok, const std::string& what) {
    std::printf("  %s  %s\n", ok ? "ok  " : "FAIL", what.c_str());
    if (!ok) ++g_fail;
}

std::vector<float> readFloat(GLuint tex, int w, int h, GLenum format, int channels) {
    std::vector<float> px(static_cast<size_t>(w) * h * channels);
    glGetTextureImage(tex, 0, format, GL_FLOAT, static_cast<GLsizei>(px.size() * sizeof(float)), px.data());
    return px;
}

// Bottom-row-first float image -> top-row-first RGBA8 PNG through `map`.
template <class F>
void savePng(const std::string& path, int w, int h, int channels, const std::vector<float>& src, F map) {
    std::vector<uint8_t> out(static_cast<size_t>(w) * h * 4);
    for (int y = 0; y < h; ++y)
        for (int x = 0; x < w; ++x) {
            const float* p = &src[(static_cast<size_t>(h - 1 - y) * w + x) * channels];
            const glm::vec3 c = glm::clamp(map(p), glm::vec3(0.0f), glm::vec3(1.0f));
            uint8_t* o = &out[(static_cast<size_t>(y) * w + x) * 4];
            o[0] = static_cast<uint8_t>(c.r * 255.0f + 0.5f);
            o[1] = static_cast<uint8_t>(c.g * 255.0f + 0.5f);
            o[2] = static_cast<uint8_t>(c.b * 255.0f + 0.5f);
            o[3] = 255;
        }
    core::savePNG(path, w, h, out);
}

glm::vec3 octDecode(float x, float y) {
    glm::vec3 n(x, y, 1.0f - std::abs(x) - std::abs(y));
    const float t = std::max(-n.z, 0.0f);
    n.x += n.x >= 0.0f ? -t : t;
    n.y += n.y >= 0.0f ? -t : t;
    return glm::normalize(n);
}

float percentile(std::vector<float> v, float p) {
    if (v.empty()) return 0.0f;
    const size_t k = static_cast<size_t>(p * static_cast<float>(v.size() - 1));
    std::nth_element(v.begin(), v.begin() + static_cast<long>(k), v.end());
    return v[k];
}
} // namespace

int main(int argc, char** argv) {
    const std::string out = argc > 1 ? argv[1] : ".";
    const int W = 960, H = 540;
    core::Window window(64, 64, "render-stages", false);
    core::installGlDebug();

    rendering::ShaderLibrary shaders(GAME_SOURCE_DIR "/shaders");
    rendering::Renderer renderer(shaders, rendering::Quality::ultra());
    renderer.resize(W, H);
    rendering::MaterialLibrary materials(256);
    scene::Showcase scene(materials, renderer, 3000);
    const auto cam = scene.shot(argc > 2 ? argv[2] : "hero");
    renderer.post.autoKey = 0.2f;   // exercise the NATIVE auto-exposure meter too
    renderer.render(scene.items(), cam, 1.0f / 60.0f);
    glFinish();

    std::printf("render stages (%dx%d)\n", W, H);
    check(core::glDebugErrorCount() == 0, "no GL errors (" + std::to_string(core::glDebugErrorCount()) + ")");

    // Every active uniform was set.
    int unset = 0;
    for (const auto& p : renderer.programs()) {
        for (const auto& n : p->neverSet()) {
            std::printf("        %s: '%s' never set\n", p->name().c_str(), n.c_str());
            ++unset;
        }
    }
    check(unset == 0, "every active uniform of " + std::to_string(renderer.programs().size()) +
                          " programs was set");

    // G-buffer.
    const auto* g = renderer.target("gbuffer");
    auto gb = readFloat(g->color(1).id(), W, H, GL_RGBA, 4);
    savePng(out + "/stage-gbuffer-normal.png", W, H, 4, gb, [](const float* p) {
        return octDecode(p[0], p[1]) * 0.5f + 0.5f;
    });
    savePng(out + "/stage-gbuffer-rough.png", W, H, 4, gb, [](const float* p) {
        return glm::vec3(p[2], p[3], 0.0f);
    });
    int metalPx = 0;
    for (size_t i = 0; i < gb.size(); i += 4) metalPx += gb[i + 3] > 0.5f;
    check(metalPx > W * H / 200, "G-buffer carries metalness (" + std::to_string(metalPx) + " metal px)");

    // AO.
    const auto* ao = renderer.target("ao");
    auto aov = readFloat(ao->color(0).id(), ao->width(), ao->height(), GL_RED, 1);
    savePng(out + "/stage-ao.png", ao->width(), ao->height(), 1, aov, [](const float* p) { return glm::vec3(p[0]); });
    const float ao05 = percentile(aov, 0.05f), ao50 = percentile(aov, 0.5f);
    char buf[160];
    std::snprintf(buf, sizeof buf, "SSAO has contrast (p5 %.2f, p50 %.2f)", ao05, ao50);
    check(ao05 < ao50 - 0.08f, buf);

    const auto* ct = renderer.target("contact");
    auto ctv = readFloat(ct->color(0).id(), ct->width(), ct->height(), GL_RED, 1);
    savePng(out + "/stage-contact.png", ct->width(), ct->height(), 1, ctv, [](const float* p) { return glm::vec3(p[0]); });

    // SSR.
    const auto* ssr = renderer.target("ssr");
    auto sv = readFloat(ssr->color(0).id(), ssr->width(), ssr->height(), GL_RGBA, 4);
    int hits = 0;
    for (size_t i = 0; i < sv.size(); i += 4) hits += sv[i + 3] > 0.25f;
    savePng(out + "/stage-ssr.png", ssr->width(), ssr->height(), 4, sv, [](const float* p) {
        const glm::vec3 c(p[0], p[1], p[2]);
        return (c / (c + 1.0f)) * 1.6f * p[3] + glm::vec3(0.0f, 0.0f, 0.08f) * (1.0f - p[3]);
    });
    check(hits > ssr->width() * ssr->height() / 100, "SSR found hits (" + std::to_string(hits) + " px)");

    // Volumetrics.
    const auto* vol = renderer.target("vol");
    auto vv = readFloat(vol->color(0).id(), vol->width(), vol->height(), GL_RGBA, 4);
    double volSum = 0.0;
    for (size_t i = 0; i < vv.size(); i += 4) volSum += vv[i] + vv[i + 1] + vv[i + 2];
    savePng(out + "/stage-vol.png", vol->width(), vol->height(), 4, vv, [](const float* p) {
        return glm::vec3(p[0], p[1], p[2]) * 4.0f;
    });
    std::snprintf(buf, sizeof buf, "volumetrics in-scatter light (mean %.4f)", volSum / (vv.size() / 4 * 3));
    check(volSum > 0.0, buf);

    // Shadow map.
    const auto* sm = renderer.target("shadow0");
    // Compare-mode textures can still be read back raw with glGetTextureImage.
    auto dv = readFloat(sm->depth()->id(), sm->width(), sm->height(), GL_DEPTH_COMPONENT, 1);
    int covered = 0;
    for (float d : dv) covered += d < 0.9999f;
    // Downsample 4096 -> 1024 for the picture.
    const int s = 4, dw = sm->width() / s, dh = sm->height() / s;
    std::vector<float> small(static_cast<size_t>(dw) * dh);
    for (int y = 0; y < dh; ++y)
        for (int x = 0; x < dw; ++x) small[static_cast<size_t>(y) * dw + x] = dv[(static_cast<size_t>(y) * s) * sm->width() + x * s];
    savePng(out + "/stage-shadow0.png", dw, dh, 1, small, [](const float* p) {
        return glm::vec3(std::pow(1.0f - p[0], 0.5f) * 1.4f);
    });
    check(covered > sm->width() * sm->height() / 50, "cascade 0 holds geometry (" + std::to_string(covered) + " texels)");

    // Final frame.
    const auto& o = renderer.output();
    auto px = core::readRGBA8(o.id(), o.width(), o.height());
    core::savePNG(out + "/stage-final.png", o.width(), o.height(), px);
    std::vector<float> luma;
    luma.reserve(px.size() / 4);
    for (size_t i = 0; i < px.size(); i += 4) luma.push_back(0.2126f * px[i] + 0.7152f * px[i + 1] + 0.0722f * px[i + 2]);
    const float l05 = percentile(luma, 0.05f), l95 = percentile(luma, 0.95f);
    std::snprintf(buf, sizeof buf, "final frame has range (p5 %.0f, p95 %.0f)", l05, l95);
    check(l95 - l05 > 60.0f, buf);

    std::printf("%s\n", g_fail ? "FAILED" : "all stages ok");
    return g_fail ? 1 : 0;
}
