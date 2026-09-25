#include "rendering/Material.hpp"
#include "assets/MaterialBaker.hpp"

#include <chrono>
#include <cmath>
#include <cstdio>
#include <set>
#include <stdexcept>

namespace game::rendering {

namespace {
float srgbToLinear(float c) {
    return c <= 0.04045f ? c / 12.92f : std::pow((c + 0.055f) / 1.055f, 2.4f);
}

// Recipes whose whole point is being flat -- NO_PARALLAX in 40-material.js.
const std::set<std::string> kNoParallax = {"eye", "hair", "skin", "grass", "glass",
                                           "ice", "smooth", "floaties"};

struct Preset {
    uint32_t color; const char* texture; float roughness, metalness;
    float opacity = 1.0f, subsurface = 0.0f;
    uint32_t emissive = 0; float emissiveStrength = 1.0f;
    float clearcoat = 0.0f, clearcoatRoughness = 0.1f, sheen = 0.0f, sheenRoughness = 0.3f;
};

// MaterialPresets, verbatim.
const std::map<std::string, Preset>& presets() {
    static const std::map<std::string, Preset> p = {
        {"concrete", {0xb0aca4, "concrete", 0.9f, 0.0f}},
        {"brick",    {0xffffff, "brick",    0.9f, 0.0f}},
        {"wood",     {0xffffff, "wood",     0.7f, 0.0f}},
        {"metal",    {0xc8ccd0, "metal",    0.35f, 1.0f}},
        {"steel",    {0x9aa2aa, "metal",    0.4f, 1.0f}},
        {"gold",     {0xffd276, "metal",    0.25f, 1.0f}},
        {"copper",   {0xd08a52, "metal",    0.32f, 1.0f}},
        {"rust",     {0xffffff, "rust",     0.85f, 0.3f}},
        {"rock",     {0xa8a49c, "rock",     0.92f, 0.0f}},
        {"stone",    {0xa8a49c, "rock",     0.92f, 0.0f}},
        {"grass",    {0xffffff, "grass",    0.95f, 0.0f, 1.0f, 0.35f}},
        {"dirt",     {0xffffff, "dirt",     0.96f, 0.0f}},
        {"sand",     {0xffffff, "sand",     0.9f, 0.0f}},
        {"marble",   {0xf2efe9, "marble",   0.2f, 0.0f}},
        {"ice",      {0xdff2fa, "ice",      0.1f, 0.0f, 0.72f}},
        {"glass",    {0xdfeef5, "smooth",   0.05f, 0.0f, 0.28f}},
        {"fabric",   {0xffffff, "fabric",   0.97f, 0.0f, 1.0f, 0.2f}},
        {"skin",     {0xffffff, "skin",     0.6f, 0.0f, 1.0f, 0.5f}},
        {"plastic",  {0xdddddd, "plastic",  0.35f, 0.0f}},
        {"tile",     {0xffffff, "tile",     0.2f, 0.0f}},
        {"rubber",   {0x2a2a2e, "smooth",   0.95f, 0.0f}},
        {"neon",     {0x111111, nullptr,    0.4f, 0.0f, 1.0f, 0.0f, 0x36e0ff, 4.0f}},
        {"lava",     {0x2a0a04, "rock",     0.8f, 0.0f, 1.0f, 0.0f, 0xff5a1e, 3.5f}},
        {"carpaint", {0xb43a2e, "smooth",   0.38f, 0.75f, 1.0f, 0.0f, 0, 1.0f, 1.0f, 0.05f}},
        {"canvas",   {0x8d8468, "fabric",   0.95f, 0.0f, 1.0f, 0.0f, 0, 1.0f, 0.0f, 0.1f, 1.0f, 0.3f}},
    };
    return p;
}
} // namespace

glm::vec3 srgb(uint32_t hex) {
    return {srgbToLinear(static_cast<float>((hex >> 16) & 255u) / 255.0f),
            srgbToLinear(static_cast<float>((hex >> 8) & 255u) / 255.0f),
            srgbToLinear(static_cast<float>(hex & 255u) / 255.0f)};
}

MaterialLibrary::MaterialLibrary(int textureSize, float anisotropy, float lodBias)
    : m_size(textureSize), m_aniso(anisotropy), m_lodBias(lodBias) {}

std::shared_ptr<const GpuMaps> MaterialLibrary::maps(const std::string& kind, uint32_t seed) {
    const auto key = std::make_pair(kind, seed);
    if (auto it = m_cache.find(key); it != m_cache.end()) return it->second;

    const auto t0 = std::chrono::steady_clock::now();
    const assets::MaterialMaps baked = assets::bake(kind, m_size, seed);
    const double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    m_bakeSeconds += secs;

    auto mk = [&](GLenum fmt, const std::vector<uint8_t>& bytes) {
        gl::TextureDesc d;
        d.width = d.height = baked.size;
        d.levels = 0;                               // full chain
        d.internalFormat = fmt;
        d.minFilter = GL_LINEAR_MIPMAP_LINEAR;
        d.magFilter = GL_LINEAR;
        d.wrap = GL_REPEAT;
        d.anisotropy = m_aniso;
        gl::Texture t(d);
        t.upload(0, baked.size, baked.size, GL_RGBA, GL_UNSIGNED_BYTE, bytes.data());
        t.generateMips();
        if (m_lodBias != 0.0f) glTextureParameterf(t.id(), GL_TEXTURE_LOD_BIAS, m_lodBias);
        return t;
    };
    auto m = std::make_shared<GpuMaps>();
    m->kind   = kind;
    m->size   = baked.size;
    m->albedo = mk(GL_SRGB8_ALPHA8, baked.albedo);
    m->normal = mk(GL_RGBA8, baked.normal);
    m->orm    = mk(GL_RGBA8, baked.orm);
    m->heightTop   = static_cast<float>(baked.heightTop);
    m->heightRange = static_cast<float>(baked.heightRange);
    {   // Linear mean of the albedo (sRGB decoded per texel, every 7th sampled).
        double acc[3] = {0, 0, 0};
        size_t n = 0;
        auto lin = [](uint8_t v) { const double c = v / 255.0;
                                   return c <= 0.04045 ? c / 12.92 : std::pow((c + 0.055) / 1.055, 2.4); };
        for (size_t i = 0; i + 3 < baked.albedo.size(); i += 4 * 7, ++n)
            for (int k = 0; k < 3; ++k) acc[k] += lin(baked.albedo[i + k]);
        if (n) m->albedoMean = glm::vec3(acc[0] / n, acc[1] / n, acc[2] / n);
    }
    std::fprintf(stderr, "[materials] baked %-10s %dx%d in %.2f s\n", kind.c_str(), baked.size,
                 baked.size, secs);
    m_cache.emplace(key, m);
    return m;
}

std::shared_ptr<const GpuMaps> MaterialLibrary::custom(const std::string& key, int size,
                                                       const std::vector<uint8_t>& albedo,
                                                       const std::vector<uint8_t>& normal,
                                                       const std::vector<uint8_t>& orm) {
    const auto ck = std::make_pair("custom:" + key, 0u);
    if (auto it = m_cache.find(ck); it != m_cache.end()) return it->second;
    auto mk = [&](GLenum fmt, const std::vector<uint8_t>& bytes) {
        gl::TextureDesc d;
        d.width = d.height = size;
        d.levels = 0;
        d.internalFormat = fmt;
        d.minFilter = GL_LINEAR_MIPMAP_LINEAR;
        d.magFilter = GL_LINEAR;
        d.wrap = GL_REPEAT;
        d.anisotropy = m_aniso;
        gl::Texture t(d);
        t.upload(0, size, size, GL_RGBA, GL_UNSIGNED_BYTE, bytes.data());
        t.generateMips();
        if (m_lodBias != 0.0f) glTextureParameterf(t.id(), GL_TEXTURE_LOD_BIAS, m_lodBias);
        return t;
    };
    auto m = std::make_shared<GpuMaps>();
    m->kind = key;
    m->size = size;
    m->albedo = mk(GL_SRGB8_ALPHA8, albedo);
    m->normal = mk(GL_RGBA8, normal);
    m->orm = mk(GL_RGBA8, orm);
    m->heightTop = 1.0f;
    m->heightRange = 0.0f;
    m_cache.emplace(ck, m);
    return m;
}

Material MaterialLibrary::textured(const std::string& kind, glm::vec3 color, float roughness,
                                   float metalness, uint32_t seed) {
    Material m;
    m.color = color;
    m.roughness = roughness;
    m.metalness = metalness;
    m.maps = maps(kind, seed);
    m.parallax = kNoParallax.count(kind) ? 0.0f : 1.0f;
    return m;
}

Material MaterialLibrary::preset(const std::string& name) {
    const auto& table = presets();
    const auto it = table.find(name);
    if (it == table.end()) throw std::invalid_argument("unknown material preset: " + name);
    const Preset& p = it->second;
    Material m;
    m.color = srgb(p.color);
    m.roughness = p.roughness;
    m.metalness = p.metalness;
    m.opacity = p.opacity;
    m.transparent = p.opacity < 1.0f;
    m.subsurface = p.subsurface;
    m.emissive = srgb(p.emissive);
    m.emissiveStrength = p.emissiveStrength;
    m.clearcoat = p.clearcoat;
    m.clearcoatRoughness = p.clearcoatRoughness;
    m.sheen = p.sheen;
    m.sheenRoughness = p.sheenRoughness;
    if (p.texture) {
        m.maps = maps(p.texture);
        m.parallax = kNoParallax.count(p.texture) ? 0.0f : 1.0f;
    }
    return m;
}

} // namespace game::rendering
