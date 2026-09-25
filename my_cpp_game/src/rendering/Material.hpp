#pragma once
#include "rendering/gl/Texture.hpp"
#include <glm/glm.hpp>
#include <cstdint>
#include <map>
#include <memory>
#include <string>
#include <tuple>

namespace game::rendering {

/* The three maps a recipe bakes, on the GPU, shared by every material made
 * from that recipe -- exactly Material._buildMaps's cache in the web
 * engine, for exactly its reason: a map with a hundred brick materials
 * holds ONE brick texture set, not a hundred. */
struct GpuMaps {
    std::string kind;
    int         size = 0;
    gl::Texture albedo;   // SRGB8_ALPHA8 -- the GPU linearises on sample
    gl::Texture normal;   // RGBA8, tangent space
    gl::Texture orm;      // RGBA8: AO, roughness, metalness, packed height
    float heightTop   = 1.0f;
    float heightRange = 0.0f;
};

/* Material, field for field the web engine's (40-material.js), defaults
 * included. Colours are LINEAR; use srgb() to write an sRGB hex. */
struct Material {
    glm::vec3 color{0.604f};             // 0xcccccc
    float     roughness = 0.8f;
    float     metalness = 0.0f;
    glm::vec3 emissive{0.0f};
    float     emissiveStrength = 1.0f;
    float     opacity = 1.0f;
    bool      transparent = false;
    bool      doubleSided = false;
    bool      alphaClip = false;
    float     uvScale = 1.0f;
    bool      worldUv = false;           // uvScale = tiles per metre when on
    float     normalStrength = 1.0f;
    float     detail = 1.0f;
    float     parallax = 1.0f;
    bool      castShadow = true;
    bool      receiveShadow = true;
    float     subsurface = 0.0f;
    float     clearcoat = 0.0f;
    float     clearcoatRoughness = 0.1f;
    float     sheen = 0.0f;
    glm::vec3 sheenColor{1.0f};
    float     sheenRoughness = 0.3f;
    std::shared_ptr<const GpuMaps> maps; // null = untextured
};

/* sRGB 0xRRGGBB -> linear, the web engine's parseColor. */
glm::vec3 srgb(uint32_t hex);

/* Bakes recipes on first use (game::assets::bake, multithreaded), uploads
 * them with full mip chains and anisotropic filtering, and hands out the
 * shared set. Also builds the web engine's named presets. */
class MaterialLibrary {
public:
    /* lodBias < 0 sharpens texture sampling; a temporal filter wants about
       -1 (it averages sub-pixel jittered samples, so the mip one level
       finer resolves without shimmering), a single-frame image wants 0. */
    explicit MaterialLibrary(int textureSize = 2048, float anisotropy = 16.0f, float lodBias = 0.0f);

    std::shared_ptr<const GpuMaps> maps(const std::string& kind, uint32_t seed = 1);

    /* A MaterialPresets entry ('brick', 'gold', 'carpaint', ...). Throws
       std::invalid_argument on an unknown name. */
    Material preset(const std::string& name);
    /* A material over any of the 46 recipes, with the recipe's own
       parallax default (NO_PARALLAX in the web engine). */
    Material textured(const std::string& kind, glm::vec3 color = glm::vec3(1.0f),
                      float roughness = 0.8f, float metalness = 0.0f, uint32_t seed = 1);

    [[nodiscard]] int    textureSize() const { return m_size; }
    [[nodiscard]] double bakeSeconds() const { return m_bakeSeconds; }
    [[nodiscard]] size_t recipeCount() const { return m_cache.size(); }

private:
    int    m_size;
    float  m_aniso;
    float  m_lodBias;
    double m_bakeSeconds = 0.0;
    std::map<std::pair<std::string, uint32_t>, std::shared_ptr<const GpuMaps>> m_cache;
};

} // namespace game::rendering
