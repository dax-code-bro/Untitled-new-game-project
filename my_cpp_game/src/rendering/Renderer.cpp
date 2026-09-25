#include "rendering/Renderer.hpp"

#include <glm/gtc/constants.hpp>
#include <glm/gtc/matrix_transform.hpp>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>

/* A pass-for-pass port of Renderer in engine/src/60-renderer.js. The long
 * comments there explain every number below; they are not repeated here.
 * Where this file departs from the web renderer it says so. */

namespace game::rendering {

namespace {

// The OpenGL cube-face basis (_envFaces). direction = z + (2s-1)x + (2t-1)y.
struct FaceBasis { glm::vec3 x, y, z; };
const FaceBasis kFaces[6] = {
    {{0, 0, -1}, {0, -1, 0}, {1, 0, 0}},    // +X
    {{0, 0, 1},  {0, -1, 0}, {-1, 0, 0}},   // -X
    {{1, 0, 0},  {0, 0, 1},  {0, 1, 0}},    // +Y
    {{1, 0, 0},  {0, 0, -1}, {0, -1, 0}},   // -Y
    {{1, 0, 0},  {0, -1, 0}, {0, 0, 1}},    // +Z
    {{-1, 0, 0}, {0, -1, 0}, {0, 0, -1}},   // -Z
};

template <class T> T clampv(T v, T lo, T hi) { return std::max(lo, std::min(hi, v)); }

glm::vec3 translationOf(const glm::mat4& m) { return glm::vec3(m[3]); }

std::unique_ptr<gl::Framebuffer> makeTarget(int w, int h, std::vector<GLenum> colors,
                                            GLenum depth = 0, GLenum filter = GL_LINEAR) {
    return std::make_unique<gl::Framebuffer>(std::max(2, w), std::max(2, h), std::move(colors),
                                             depth, filter);
}

void bindAndClear(const gl::Framebuffer& fb, float r, float g, float b, float a) {
    fb.bind();
    for (int i = 0; i < fb.colorCount(); ++i) fb.clearColor(i, r, g, b, a);
}

} // namespace

/* ------------------------------------------------------------------ */
/*  Quality                                                             */
/* ------------------------------------------------------------------ */

Quality Quality::ultra() { return Quality{}; }

/* Every number here is the one the web engine's own comments name as the
 * next step once the budget exists -- not a multiplier applied blindly. */
Quality Quality::cinematic() {
    Quality q;
    q.name = "cinematic";
    q.shadowRes = 8192;        // cascade 0 texel halves: 3.9 mm at the default split
    q.ssaoSamples = 32;        // the shader's loop cap
    q.envRes = 512;
    q.envSamples = 64;         // the prefilter's loop cap
    q.envSceneRange = 90.0f;
    q.ssrSteps = 64;           // the march's loop cap
    q.volSteps = 48;           // "forty-eight halves the spacing" -- worth it at 8K
    q.pcssBlockers = 16;
    q.pcssTaps = 24;           // both at the shader clamps
    q.contactSteps = 16;
    q.parallaxSteps = 32;
    q.sharpen = 0.30f;         // native resolution needs less restoring
    return q;
}

Quality Quality::byName(const std::string& n) {
    if (n == "cinematic") return cinematic();
    if (n == "ultra") return ultra();
    throw std::invalid_argument("unknown quality '" + n + "' (ultra | cinematic)");
}

/* ------------------------------------------------------------------ */
/*  Construction and targets                                            */
/* ------------------------------------------------------------------ */

Renderer::Renderer(ShaderLibrary& shaders, Quality quality) : m_lib(shaders), m_q(std::move(quality)) {
    GLuint vao = 0;
    glCreateVertexArrays(1, &vao);
    m_emptyVao.reset(vao);

    glEnable(GL_TEXTURE_CUBE_MAP_SEAMLESS);
    glEnable(GL_DEPTH_TEST);
    glDepthFunc(GL_LEQUAL);
    glEnable(GL_CULL_FACE);
    glCullFace(GL_BACK);
    /* aColor (location 4) is never enabled on a mesh that has no per-vertex
       tint, so the shader reads the CURRENT GENERIC VALUE -- which core GL
       initialises to (0,0,0,1). The web renderer pinned it to white; left
       at black it multiplies every albedo in the scene to zero and the
       frame is specular and fog alone. Context state, set once. */
    glVertexAttrib4f(4, 1.0f, 1.0f, 1.0f, 1.0f);

    // Two cascades, each a compare-mode depth map plus an R16 blocker
    // attachment for the PCSS search. R16 where the web engine had R8:
    // the blocker depth is linear in metres, so this is 256x finer
    // penumbra estimation for one more byte a texel.
    for (auto& sm : m_shadowMaps) {
        sm = std::make_unique<gl::Framebuffer>(m_q.shadowRes, m_q.shadowRes, std::vector<GLenum>{GL_R16},
                                               GL_DEPTH_COMPONENT24, GL_NEAREST, /*depthCompare=*/true);
        sm->clearColor(0, 1, 1, 1, 1);
        sm->clearDepth(1.0f);
    }

    auto tiny = [](GLenum target, GLenum fmt) {
        gl::TextureDesc d;
        d.target = target; d.internalFormat = fmt; d.minFilter = GL_NEAREST; d.magFilter = GL_NEAREST;
        return gl::Texture(d);
    };
    const uint8_t black[4] = {0, 0, 0, 255};
    const uint8_t white = 255;
    m_envNullCube = tiny(GL_TEXTURE_CUBE_MAP, GL_RGBA8);
    for (int f = 0; f < 6; ++f) m_envNullCube.uploadFace(f, 0, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, black);
    m_envNull2D = tiny(GL_TEXTURE_2D, GL_RGBA8);
    m_envNull2D.upload(0, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, black);
    m_noBlocker = tiny(GL_TEXTURE_2D, GL_R8);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    m_noBlocker.upload(0, 1, 1, GL_RED, GL_UNSIGNED_BYTE, &white);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
}

Renderer::~Renderer() = default;

void Renderer::resize(int outW, int outH) {
    if (outW == m_outW && outH == m_outH) return;
    m_outW = outW; m_outH = outH;
    m_w = std::max(2, static_cast<int>(std::floor(outW * m_q.renderScale)));
    m_h = std::max(2, static_cast<int>(std::floor(outH * m_q.renderScale)));
    const int hw = std::max(2, m_w >> 1), hh = std::max(2, m_h >> 1);

    m_hdrA = makeTarget(m_w, m_h, {GL_RGBA16F, GL_RGBA16F}, GL_DEPTH_COMPONENT24);
    m_hdrB = makeTarget(m_w, m_h, {GL_RGBA16F});
    m_ldr  = makeTarget(m_w, m_h, {GL_RGBA8});
    m_output = makeTarget(m_outW, m_outH, {GL_RGBA8});
    m_final = (m_w != m_outW || m_h != m_outH) ? makeTarget(m_w, m_h, {GL_RGBA8}) : nullptr;
    m_bloom.clear();
    for (int i = 0; i < 4; ++i) {
        const int bw = m_w >> (i + 1), bh = m_h >> (i + 1);
        m_bloom.emplace_back(makeTarget(bw, bh, {GL_RGBA16F}), makeTarget(bw, bh, {GL_RGBA16F}));
    }
    m_aoA  = makeTarget(hw, hh, {GL_R8});
    m_aoB  = makeTarget(hw, hh, {GL_R8});
    m_ssrA = makeTarget(hw, hh, {GL_RGBA16F});
    m_ssrB = makeTarget(hw, hh, {GL_RGBA16F});
    m_volA = makeTarget(hw, hh, {GL_RGBA16F});
    m_volB = makeTarget(hw, hh, {GL_RGBA16F});
    m_exp[0] = makeTarget(2, 2, {GL_R32F}, 0, GL_NEAREST);
    m_exp[1] = makeTarget(2, 2, {GL_R32F}, 0, GL_NEAREST);
    m_expValid = false;
    m_taa[0] = makeTarget(m_w, m_h, {GL_RGBA16F});
    m_taa[1] = makeTarget(m_w, m_h, {GL_RGBA16F});
    m_taaFrames = 0;
}

const gl::Framebuffer* Renderer::target(const std::string& n) const {
    if (n == "hdr" || n == "gbuffer") return m_hdrA.get();
    if (n == "resolved") return m_hdrB.get();
    if (n == "ao") return m_aoA.get();
    if (n == "contact") return m_aoB.get();
    if (n == "ssr") return m_ssrA.get();
    if (n == "vol") return m_volB.get();
    if (n == "shadow0") return m_shadowMaps[0].get();
    if (n == "shadow1") return m_shadowMaps[1].get();
    if (n == "bloom" && !m_bloom.empty()) return m_bloom[0].first.get();
    if (n == "ldr") return m_ldr.get();
    return nullptr;
}

std::vector<std::shared_ptr<gl::Program>> Renderer::programs() const {
    std::vector<std::shared_ptr<gl::Program>> out;
    for (const auto& kv : m_used) out.push_back(kv.second);
    return out;
}

std::shared_ptr<gl::Program> Renderer::prog(const std::string& vert, const std::string& frag,
                                            const std::vector<std::string>& defines) {
    std::string key = vert + "|" + frag;
    for (const auto& d : defines) key += "|" + d;
    auto p = m_lib.get(vert, frag, defines);
    m_used[key] = p;
    p->use();
    return p;
}

void Renderer::fullscreen() {
    glBindVertexArray(m_emptyVao.get());
    glDrawArrays(GL_TRIANGLES, 0, 3);
    ++m_stats.draws;
}

/* ------------------------------------------------------------------ */
/*  Uniform blocks                                                      */
/* ------------------------------------------------------------------ */

void Renderer::bindEnv(const gl::Program& p) const {
    const bool physical = sky.model == 1 && m_atmoValid;
    /* With the physical sky the two gradient colours are not authored but
       measured off the table, so every fallback that still reads them --
       the analytic hemisphere, the probe-less path -- agrees with it. */
    p.set("uSkyZenith", physical ? m_atmoZenith : sky.zenith);
    p.set("uSkyHorizon", physical ? m_atmoHorizon : sky.horizon);
    p.set("uSkyModel", physical ? 1.0f : 0.0f);
    p.set("uSkyLutScale", sun.color * (sun.intensity * sky.physicalGain));
    p.texture("uSkyLut", physical ? m_skyLut : m_envNull2D);
    p.set("uGroundColor", sky.ground);
    p.set("uSunDir", sun.direction);
    p.set("uSunColor", litSunColor());
    p.set("uSunIntensity", sun.intensity);
    p.set("uSkyIntensity", sky.intensity);
    p.set("uRoomAmbient", sky.room);
    p.set("uSkyOcclusion", sky.occlusion);
    p.set("uGroundBounce", sky.bounce);
    p.set("uSpecEnergy", m_q.multiscatter);
    p.set("uSpecOcclusion", m_q.specOcclusion);
    p.set("uFogColor", fog.color);
    p.set("uFogDensity", fog.density);
    p.set("uFogHeight", fog.height);
    p.set("uFogHeightFalloff", fog.falloff);
    p.set("uFogSkyBlend", fog.skyBlend);
    const bool envOn = m_q.env && stages.env && m_envReady && !m_envBaking;
    p.set("uEnvIntensity", envOn ? envIntensity : 0.0f);
    p.set("uEnvDiffuse", envOn ? m_q.envDiffuse : 0.0f);
    p.set("uEnvNoSunDisc", 0.0f);
    p.set("uEnvLod", envOn ? glm::vec2(static_cast<float>(m_envLevels - 1),
                                       static_cast<float>(std::max(0, m_envLevels - 3)))
                           : glm::vec2(0.0f));
    p.setArray("uEnvSh", m_envSh.data(), 9);
    p.texture("uEnvCube", envOn ? m_envCube : m_envNullCube);
    p.texture("uBrdfLut", envOn ? m_brdfLut : m_envNull2D);
    p.set("uTime", m_time);
}

void Renderer::bindShadows(const gl::Program& p) const {
    p.set("uShadowMat0", m_shadowMats[0]);
    p.set("uShadowMat1", m_shadowMats[1]);
    p.set("uCascadeSplit", shadows.split);
    const float texel = 1.0f / static_cast<float>(m_q.shadowRes);
    p.set("uShadowTexel", glm::vec2(texel));
    p.set("uShadowStrength", (shadows.enabled && stages.shadows) ? shadows.strength : 0.0f);
    p.texture("uShadowMap0", *m_shadowMaps[0]->depth());
    p.texture("uShadowMap1", *m_shadowMaps[1]->depth());
    const int blockers = m_q.pcss ? clampv(m_q.pcssBlockers, 4, 16) : 0;
    p.set("uShadowBlockers", blockers);
    p.set("uShadowTaps", clampv(m_q.pcssTaps ? m_q.pcssTaps : 8, 4, 24));
    p.set("uShadowPenumbraMax", std::max(1.0f, shadows.penumbraMax));
    p.set("uShadowGapUnit", glm::vec2(m_cascadeGap[0], m_cascadeGap[1]));
    p.set("uShadowTexelZ", glm::vec2(m_cascadeTexelZ[0], m_cascadeTexelZ[1]));
    if (blockers > 0) {
        p.texture("uShadowBlocker0", m_shadowMaps[0]->color(0));
        p.texture("uShadowBlocker1", m_shadowMaps[1]->color(0));
    } else {
        p.texture("uShadowBlocker0", m_noBlocker);
        p.texture("uShadowBlocker1", m_noBlocker);
    }
}

void Renderer::bindLights(const gl::Program& p, const glm::vec3& cam) const {
    // The eight nearest the camera, biased by reach (_bindLights).
    std::vector<std::pair<float, const PointLight*>> order;
    order.reserve(lights.size());
    for (const auto& l : lights) {
        const glm::vec3 d = l.position - cam;
        order.emplace_back(glm::dot(d, d) - l.radius * l.radius, &l);
    }
    if (order.size() > 8)
        std::partial_sort(order.begin(), order.begin() + 8, order.end(),
                          [](const auto& a, const auto& b) { return a.first < b.first; });
    const int n = static_cast<int>(std::min<size_t>(8, order.size()));
    glm::vec4 pos[8]{}, col[8]{};
    for (int i = 0; i < n; ++i) {
        const PointLight& l = *order[static_cast<size_t>(i)].second;
        pos[i] = glm::vec4(l.position, l.radius);
        col[i] = glm::vec4(l.color, l.intensity);
    }
    p.set("uLightCount", n);
    p.setArray("uLightPos", pos, 8);
    p.setArray("uLightColor", col, 8);
}

void Renderer::bindMaterial(const gl::Program& p, const Material& m) const {
    p.set("uBaseColor", m.color);
    p.set("uRoughness", m.roughness);
    p.set("uMetalness", m.metalness);
    p.set("uEmissive", m.emissive * m.emissiveStrength);
    p.set("uOpacity", m.opacity);
    p.set("uUvScale", m.uvScale);
    p.set("uWorldUv", m.worldUv ? 1 : 0);
    p.set("uNormalStrength", m.normalStrength);
    p.set("uDetail", m.detail);
    p.set("uDetailScale", detailScale);
    p.set("uDetailFade", detailFade);
    const bool mapsOn = m.maps && stages.textures;
    const float range = mapsOn ? m.maps->heightRange : 0.0f;
    p.set("uParallaxDepth", (m_q.parallax > 0 && m.parallax > 0 && range > 1e-4f)
                                ? parallaxDepth * m.parallax * m_q.parallax : 0.0f);
    p.set("uParallaxSteps", static_cast<float>(m_q.parallaxSteps ? m_q.parallaxSteps : 12));
    p.set("uParallaxFade", parallaxFade);
    p.set("uParallaxRange", range);
    p.set("uParallaxTop", mapsOn ? m.maps->heightTop : 1.0f);
    p.set("uDetailNormal", m_q.detailNormal ? 1.0f : 0.0f);
    p.set("uSubsurface", m.subsurface);
    p.set("uClearcoatWeight", m.clearcoat);
    p.set("uClearcoatRough", m.clearcoatRoughness);
    p.set("uSheenWeight", m.sheen);
    p.set("uSheenColor", m.sheenColor);
    p.set("uSheenRough", m.sheenRoughness);
    p.set("uReceiveShadow", m.receiveShadow ? 1 : 0);
    p.set("uHasMaps", mapsOn ? 1 : 0);
    if (mapsOn) {
        p.texture("uAlbedoMap", m.maps->albedo);
        p.texture("uNormalMap", m.maps->normal);
        p.texture("uOrmMap", m.maps->orm);
    } else {
        p.texture("uAlbedoMap", m_envNull2D);
        p.texture("uNormalMap", m_envNull2D);
        p.texture("uOrmMap", m_envNull2D);
    }
}

void Renderer::drawItem(const gl::Program& p, const DrawItem& it) {
    if (it.boneTexture && it.mesh->skinned()) {
        p.texture("uBoneTex", *it.boneTexture);
        p.set("uBoneCount", static_cast<float>(it.boneCount));
    }
    if (it.instances && !it.instances->empty()) {
        it.mesh->drawInstanced(*it.instances);
        m_stats.instances += static_cast<int>(it.instances->size());
        m_stats.tris += static_cast<long long>(it.mesh->indexCount() / 3) *
                        static_cast<long long>(it.instances->size());
    } else {
        p.set("uModel", it.model);
        p.set("uParams", it.params);
        it.mesh->draw();
        m_stats.tris += it.mesh->indexCount() / 3;
    }
    ++m_stats.draws;
}

static std::vector<std::string> meshDefines(const DrawItem& it, bool alphaClip) {
    std::vector<std::string> d;
    if (it.instances && !it.instances->empty()) d.emplace_back("INSTANCED");
    else if (it.boneTexture && it.mesh->skinned()) d.emplace_back("SKINNED");
    if (it.grass) d.emplace_back("GRASS");
    if (it.field) d.emplace_back("GRASS_FIELD");
    if (alphaClip && it.material->alphaClip) d.emplace_back("ALPHA_CLIP");
    return d;
}

void Renderer::drawPbr(const DrawItem& it, const Camera& cam) {
    auto p = prog("pbr.vert", "pbr.frag", meshDefines(it, true));
    p->set("uViewProj", cam.viewProj);
    p->set("uView", cam.view);
    p->set("uCameraPos", cam.position);
    bindEnv(*p);
    bindShadows(*p);
    bindLights(*p, cam.position);
    bindMaterial(*p, *it.material);
    p->set("uDebugMode", debugMode);
    p->set("uBevel", it.bevel * bevelScale);
    p->set("uWater", it.water ? 1.0f : 0.0f);
    p->set("uWeathering", it.weathering * weatheringScale);
    p->set("uWetGround", it.wetGround * wetScale);
    p->set("uInterior", it.interior * interiorScale);
    if (it.field) {
        p->texture("uLawnField", *it.field);
        p->set("uLawnRect", it.fieldRect);
        p->set("uFieldCentre", cam.position);
        p->set("uFieldSpacing", it.fieldSpacing);
        p->set("uFieldRadius", it.fieldRadius);
    }
    if (it.grass) {
        p->set("uWindDir", windDir);
        p->set("uWindStrength", windStrength);
    }
    if (it.material->doubleSided) glDisable(GL_CULL_FACE);
    drawItem(*p, it);
    if (it.material->doubleSided) glEnable(GL_CULL_FACE);
}

/* ------------------------------------------------------------------ */
/*  Shadows                                                             */
/* ------------------------------------------------------------------ */

void Renderer::fitCascade(const Camera& cam, float nearD, float farD, int idx) {
    const float tanHalf = std::tan(cam.fov / 2.0f);
    glm::vec3 corners[8];
    int ci = 0;
    for (float d : {nearD, farD}) {
        const float hh = tanHalf * d, hw = hh * cam.aspect;
        for (float sy : {-1.0f, 1.0f})
            for (float sx : {-1.0f, 1.0f})
                corners[ci++] = cam.position + cam.forward * d + cam.right * (hw * sx) + cam.trueUp * (hh * sy);
    }
    glm::vec3 center(0.0f);
    for (const auto& c : corners) center += c;
    center /= 8.0f;
    float radius = 0.0f;
    for (const auto& c : corners) radius = std::max(radius, glm::distance(center, c));
    radius = std::ceil(radius * 16.0f) / 16.0f;

    const float res = static_cast<float>(m_q.shadowRes);
    const float texelSize = (radius * 2.0f) / res;
    const glm::vec3 up = std::abs(sun.direction.y) > 0.99f ? glm::vec3(0, 0, 1) : glm::vec3(0, 1, 0);
    const float back = radius * 2.2f + 8.0f;
    glm::mat4 lightView = glm::lookAt(center + sun.direction * back, center, up);
    glm::vec4 lc = lightView * glm::vec4(center, 1.0f);
    lc.x = std::floor(lc.x / texelSize) * texelSize;
    lc.y = std::floor(lc.y / texelSize) * texelSize;
    const glm::vec3 snapped = glm::vec3(glm::inverse(lightView) * lc);
    lightView = glm::lookAt(snapped + sun.direction * back, snapped, up);

    const float farPlane = radius * 4.4f + 20.0f;
    const glm::mat4 proj = glm::ortho(-radius, radius, -radius, radius, 0.5f, farPlane);
    const float depthRange = farPlane - 0.5f;
    const float sunTan = std::max(1e-5f, shadows.softness);
    m_cascadeGap[idx] = texelSize / (sunTan * depthRange);
    m_cascadeTexelZ[idx] = texelSize / depthRange;
    m_shadowMats[idx] = proj * lightView;
}

void Renderer::renderShadows(const std::vector<DrawItem>& items, const Camera& cam) {
    if (!shadows.enabled || !stages.shadows) return;
    const float split = std::min(shadows.split, shadows.distance);
    const float ranges[2][2] = {{cam.nearZ, split}, {split * 0.92f, shadows.distance}};

    glEnable(GL_DEPTH_TEST);
    glDepthMask(GL_TRUE);
    glCullFace(GL_BACK);
    glEnable(GL_POLYGON_OFFSET_FILL);
    glPolygonOffset(1.8f, 4.0f);
    for (int i = 0; i < 2; ++i) {
        fitCascade(cam, ranges[i][0], ranges[i][1], i);
        const auto& fb = *m_shadowMaps[static_cast<size_t>(i)];
        fb.bind();
        fb.clearColor(0, 1, 1, 1, 1);
        fb.clearDepth(1.0f);
        for (const auto& it : items) {
            if (!it.mesh || !it.material || !it.material->castShadow) continue;
            if (it.material->transparent && it.material->opacity < 0.6f) continue;
            auto p = prog("shadow.vert", "shadow.frag", meshDefines(it, false));
            p->set("uViewProj", m_shadowMats[static_cast<size_t>(i)]);
            p->set("uTime", m_time);
            p->set("uCameraPos", cam.position);
            if (it.grass) {
                p->set("uWindDir", windDir);
                p->set("uWindStrength", windStrength);
            }
            drawItem(*p, it);
        }
    }
    glDisable(GL_POLYGON_OFFSET_FILL);
    glPolygonOffset(0.0f, 0.0f);
}

/* ------------------------------------------------------------------ */
/*  Environment probe                                                   */
/* ------------------------------------------------------------------ */

void Renderer::updateAtmosphere() {
    if (sky.model != 1) return;
    uint32_t h = 2166136261u;
    auto push = [&](float v) {
        h = (h ^ static_cast<uint32_t>(static_cast<int32_t>(std::lround(v * 10000.0f)))) * 16777619u;
    };
    for (int i = 0; i < 3; ++i) push(sun.direction[i]);
    push(sky.turbidity);
    if (m_atmoValid && h == m_atmoHash) return;
    m_atmoHash = h;

    AtmosphereParams ap;
    ap.turbidity = std::max(0.0f, sky.turbidity);
    m_atmo.compute(ap, sun.direction);
    {
        const glm::vec3 t = Atmosphere::sunTransmittance(ap, sun.direction);
        const glm::vec3 t0 = Atmosphere::sunTransmittance(ap, glm::vec3(0.0f, 1.0f, 0.0f));
        m_sunTint = t / glm::max(t0, glm::vec3(1e-4f));
    }
    if (!m_skyLut) {
        gl::TextureDesc d;
        d.width = Atmosphere::kWidth;
        d.height = Atmosphere::kHeight;
        d.internalFormat = GL_RGBA16F;
        d.wrap = GL_REPEAT;               // azimuth wraps...
        m_skyLut = gl::Texture(d);
        glTextureParameteri(m_skyLut.id(), GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);   // ...elevation does not
    }
    m_skyLut.upload(0, Atmosphere::kWidth, Atmosphere::kHeight, GL_RGBA, GL_FLOAT, m_atmo.texels().data());

    // Zenith and horizon as the gradient path would see them, azimuth-averaged.
    const glm::vec3 scale = sun.color * (sun.intensity * sky.physicalGain) / std::max(sky.intensity, 1e-4f);
    glm::vec3 zen(0.0f), hor(0.0f);
    constexpr int kAz = 32;
    for (int i = 0; i < kAz; ++i) {
        const float a = (i + 0.5f) / kAz * 6.2831853f;
        zen += m_atmo.sample(glm::normalize(glm::vec3(std::cos(a) * 0.26f, 0.966f, std::sin(a) * 0.26f)));
        hor += m_atmo.sample(glm::normalize(glm::vec3(std::cos(a), 0.05f, std::sin(a))));
    }
    m_atmoZenith = zen / static_cast<float>(kAz) * scale;
    m_atmoHorizon = hor / static_cast<float>(kAz) * scale;
    m_atmoValid = true;
    if (std::getenv("GAME_SKY_DEBUG"))
        std::fprintf(stderr, "[sky] sun.y %.2f zenith %.3f %.3f %.3f horizon %.3f %.3f %.3f (x sky.intensity %.2f)\n",
                     sun.direction.y, m_atmoZenith.r, m_atmoZenith.g, m_atmoZenith.b, m_atmoHorizon.r,
                     m_atmoHorizon.g, m_atmoHorizon.b, sky.intensity);
}

void Renderer::initEnv() {
    const int res = std::max(8, m_q.envRes);
    gl::TextureDesc d;
    d.target = GL_TEXTURE_CUBE_MAP;
    d.width = d.height = res;
    d.internalFormat = GL_RGBA16F;
    d.levels = 1;
    m_envSource = gl::Texture(d);
    d.levels = 0;
    d.minFilter = GL_LINEAR_MIPMAP_LINEAR;
    m_envCube = gl::Texture(d);
    m_envLevels = m_envCube.levels();

    gl::TextureDesc l;
    l.width = l.height = 128;
    l.internalFormat = GL_RG16F;
    m_brdfLut = gl::Texture(l);

    GLuint fbo = 0, rb = 0;
    glCreateFramebuffers(1, &fbo);
    m_envFbo.reset(fbo);
    glCreateRenderbuffers(1, &rb);
    m_envDepth.reset(rb);
    glNamedRenderbufferStorage(rb, GL_DEPTH_COMPONENT24, res, res);
    glNamedFramebufferDrawBuffer(fbo, GL_COLOR_ATTACHMENT0);

    m_envJobs = 1 + m_envLevels;
    m_envJob = m_envJobs;          // start at the end: see _initEnv
    m_envHashValid = false;
    m_envReady = false;
    m_brdfBaked = false;
}

void Renderer::attachEnvFace(const gl::Texture& tex, int face, int level, int size, bool withDepth) {
    const GLuint fbo = m_envFbo.get();
    if (tex.target() == GL_TEXTURE_CUBE_MAP)
        glNamedFramebufferTextureLayer(fbo, GL_COLOR_ATTACHMENT0, tex.id(), level, face);
    else
        glNamedFramebufferTexture(fbo, GL_COLOR_ATTACHMENT0, tex.id(), level);
    glNamedFramebufferRenderbuffer(fbo, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, withDepth ? m_envDepth.get() : 0);
    glBindFramebuffer(GL_FRAMEBUFFER, fbo);
    glViewport(0, 0, size, size);
}

uint32_t Renderer::envHash() const {
    uint32_t h = 2166136261u;
    auto push = [&](float v) {
        h = (h ^ static_cast<uint32_t>(static_cast<int32_t>(std::lround(v * 1000.0f)))) * 16777619u;
    };
    for (int i = 0; i < 3; ++i) push(sun.direction[i]);
    for (int i = 0; i < 3; ++i) push(sun.color[i]);
    push(sun.intensity);
    for (int i = 0; i < 3; ++i) push(sky.zenith[i]);
    for (int i = 0; i < 3; ++i) push(sky.horizon[i]);
    for (int i = 0; i < 3; ++i) push(sky.ground[i]);
    push(sky.intensity);
    push(sky.bounce);
    push(static_cast<float>(sky.model));
    push(sky.turbidity);
    push(sky.physicalGain);
    if (m_q.envScene) for (int i = 0; i < 3; ++i) push(m_envWantAt[i]);
    return h;
}

// skyRadiance() from GLSL.sky minus the sun disc -- _skyRadianceJs. Must
// not drift from shaders/lib/sky.glsl.
glm::vec3 Renderer::skyRadianceCpu(const glm::vec3& d) const {
    const float si = sky.intensity;
    if (sky.model == 1 && m_atmoValid) {
        // Mirrors the uSkyModel branch of skyRadiance(), minus the disc.
        const glm::vec3 scale = sun.color * (sun.intensity * sky.physicalGain);
        glm::vec3 c = m_atmo.sample(d) * scale / std::max(si, 1e-4f);
        const float lit = std::max(sun.direction.y, 0.0f);
        const glm::vec3 g = sky.ground * (glm::vec3(si) + litSunColor() * (sun.intensity * lit * sky.bounce)) /
                            std::max(si, 1e-4f);
        float e = clampv((d.y + 0.28f) / 0.34f, 0.0f, 1.0f);
        e = e * e * (3.0f - 2.0f * e);
        return (g + (c - g) * e) * si;
    }
    const float k = clampv(d.y * 1.6f, 0.0f, 1.0f);
    glm::vec3 c = sky.horizon + (sky.zenith - sky.horizon) * k;
    const float lit = std::max(sun.direction.y, 0.0f);
    const float inv = 1.0f / std::max(si, 1e-4f);
    const glm::vec3 g = sky.ground * (glm::vec3(si) + sun.color * (sun.intensity * lit * sky.bounce)) * inv;
    float e = clampv((d.y + 0.28f) / 0.34f, 0.0f, 1.0f);
    e = e * e * (3.0f - 2.0f * e);
    c = g + (c - g) * e;
    const float sd = clampv(glm::dot(d, sun.direction), 0.0f, 1.0f);
    const float halo = std::pow(sd, 12.0f) * 0.35f + std::pow(sd, 3.0f) * 0.08f;
    c += sun.color * (halo * sun.intensity * 0.35f);
    return c * si;
}

void Renderer::bakeEnvSh() {
    constexpr int N = 16;
    double L[27] = {};
    for (const auto& b : kFaces) {
        for (int yi = 0; yi < N; ++yi) {
            const float t = ((yi + 0.5f) / N) * 2.0f - 1.0f;
            for (int xi = 0; xi < N; ++xi) {
                const float s = ((xi + 0.5f) / N) * 2.0f - 1.0f;
                const glm::vec3 dir = glm::normalize(b.z + s * b.x + t * b.y);
                const float d2 = 1.0f + s * s + t * t;
                const double dw = (4.0 / (N * N)) / (d2 * std::sqrt(d2));
                const glm::vec3 c = skyRadianceCpu(dir);
                const double w[9] = {
                    0.282095, 0.488603 * dir.y, 0.488603 * dir.z, 0.488603 * dir.x,
                    1.092548 * dir.x * dir.y, 1.092548 * dir.y * dir.z,
                    0.315392 * (3.0 * dir.z * dir.z - 1.0), 1.092548 * dir.x * dir.z,
                    0.546274 * (dir.x * dir.x - dir.y * dir.y)};
                for (int i = 0; i < 9; ++i)
                    for (int ch = 0; ch < 3; ++ch) L[i * 3 + ch] += c[ch] * dw * w[i];
            }
        }
    }
    const double K[9] = {1.0 * 0.282095, 0.6666667 * 0.488603, 0.6666667 * 0.488603,
                         0.6666667 * 0.488603, 0.25 * 1.092548, 0.25 * 1.092548,
                         0.25 * 0.315392, 0.25 * 1.092548, 0.25 * 0.546274};
    for (int i = 0; i < 9; ++i)
        m_envSh[static_cast<size_t>(i)] = glm::vec3(L[i * 3] * K[i], L[i * 3 + 1] * K[i], L[i * 3 + 2] * K[i]);
}

void Renderer::renderEnv(const std::vector<DrawItem>& items, const Camera& cam) {
    if (!m_q.env || !stages.env) return;
    if (!m_envCube) initEnv();
    const int faces = m_q.envScene ? 6 : 1;
    const int res = m_envSource.width();
    if (faces > 1) m_envWantAt = glm::round(cam.position / 3.0f) * 3.0f;

    glDisable(GL_DEPTH_TEST);
    glDisable(GL_BLEND);
    glDepthMask(GL_FALSE);

    if (!m_brdfBaked) {
        prog("fullscreen.vert", "envBrdf.frag");
        attachEnvFace(m_brdfLut, 0, 0, 128, false);
        fullscreen();
        m_brdfBaked = true;
    }

    /* NATIVE DEPARTURE: until the first cycle completes, every job runs in
       this frame. The web engine amortised one job per frame from boot so
       a phone never paid a spike; on a desktop GPU the first frame paying
       for the whole probe beats fifteen frames of a probe-less picture,
       and it means frame one of a screenshot is already the real frame.
       Later rebakes (the probe moved, the sky changed) stay amortised. */
    do {
        if (m_envJob >= m_envJobs) {
            const uint32_t h = envHash();
            if (m_envHashValid && h == m_envHash) break;
            m_envHash = h;
            m_envHashValid = true;
            m_envJob = 0;
            m_envJobs = faces + m_envLevels;
            if (faces > 1) m_envAt = m_envWantAt;
            bakeEnvSh();
        }
        const int job = m_envJob++;
        if (job < faces) {
            if (faces == 1) {
                auto p = prog("fullscreen.vert", "envBake.frag");
                bindEnv(*p);
                p->set("uEnvNoSunDisc", 1.0f);
                for (int f = 0; f < 6; ++f) {
                    p->set("uEnvFaceX", kFaces[f].x);
                    p->set("uEnvFaceY", kFaces[f].y);
                    p->set("uEnvFaceZ", kFaces[f].z);
                    attachEnvFace(m_envSource, f, 0, res, false);
                    fullscreen();
                }
            } else {
                const int f = job;
                attachEnvFace(m_envSource, f, 0, res, true);
                glDepthMask(GL_TRUE);
                glClear(GL_DEPTH_BUFFER_BIT);
                auto p = prog("fullscreen.vert", "envBake.frag");
                bindEnv(*p);
                p->set("uEnvNoSunDisc", 1.0f);
                p->set("uEnvFaceX", kFaces[f].x);
                p->set("uEnvFaceY", kFaces[f].y);
                p->set("uEnvFaceZ", kFaces[f].z);
                glDisable(GL_DEPTH_TEST);
                glDepthMask(GL_FALSE);
                fullscreen();
                glEnable(GL_DEPTH_TEST);
                glDepthMask(GL_TRUE);
                glDisable(GL_BLEND);

                Camera fc;
                fc.position = m_envAt;
                fc.target = m_envAt + kFaces[f].z;
                fc.up = kFaces[f].y;
                fc.fov = glm::half_pi<float>();
                fc.nearZ = 0.05f;
                fc.farZ = std::max(80.0f, m_q.envSceneRange * 3.0f);
                fc.update(1.0f);
                m_envBaking = true;
                const float range2 = m_q.envSceneRange * m_q.envSceneRange;
                for (const auto& it : items) {
                    if (!it.mesh || !it.material || it.material->transparent) continue;
                    if (!(it.instances && !it.instances->empty())) {
                        const glm::vec3 d = translationOf(it.model) - m_envAt;
                        const glm::vec3 ext = (it.mesh->boundsMax() - it.mesh->boundsMin()) *
                                              glm::vec3(glm::length(glm::vec3(it.model[0])),
                                                        glm::length(glm::vec3(it.model[1])),
                                                        glm::length(glm::vec3(it.model[2])));
                        const float reach = glm::length(ext) * 0.5f;
                        if (glm::dot(d, d) > range2 + reach * reach + 2.0f * reach * m_q.envSceneRange) continue;
                    }
                    drawPbr(it, fc);
                }
                m_envBaking = false;
                glBindFramebuffer(GL_FRAMEBUFFER, m_envFbo.get());
            }
        } else {
            const int level = job - faces;
            auto p = prog("fullscreen.vert", "envPrefilter.frag");
            glDisable(GL_DEPTH_TEST);
            glDepthMask(GL_FALSE);
            p->set("uEnvRough", static_cast<float>(level) / static_cast<float>(std::max(1, m_envLevels - 1)));
            p->set("uEnvSamples", clampv(m_q.envSamples, 8, 64));
            p->texture("uEnvSource", m_envSource);
            const int size = std::max(1, res >> level);
            for (int f = 0; f < 6; ++f) {
                p->set("uEnvFaceX", kFaces[f].x);
                p->set("uEnvFaceY", kFaces[f].y);
                p->set("uEnvFaceZ", kFaces[f].z);
                attachEnvFace(m_envCube, f, level, size, false);
                fullscreen();
            }
        }
        if (m_envJob >= m_envJobs) m_envReady = true;
    } while (!m_envReady);

    glNamedFramebufferRenderbuffer(m_envFbo.get(), GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, 0);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glEnable(GL_DEPTH_TEST);
    glDepthMask(GL_TRUE);
}

/* ------------------------------------------------------------------ */
/*  Main pass                                                           */
/* ------------------------------------------------------------------ */

void Renderer::renderScene(const std::vector<DrawItem>& items, const Camera& cam) {
    renderEnv(items, cam);

    m_hdrA->bind();
    m_hdrA->drawBuffers({GL_COLOR_ATTACHMENT0, GL_COLOR_ATTACHMENT1});
    glDepthMask(GL_TRUE);
    m_hdrA->clearColor(0, 0, 0, 0, 1);
    m_hdrA->clearColor(1, 0, 0, 0, 1);
    m_hdrA->clearDepth(1.0f);
    glEnable(GL_DEPTH_TEST);
    glDepthFunc(GL_LEQUAL);
    glDisable(GL_BLEND);

    std::vector<const DrawItem*> transparent;
    for (const auto& it : items) {
        if (!it.mesh || !it.material) continue;
        if (it.material->transparent) { transparent.push_back(&it); continue; }
        drawPbr(it, cam);
    }

    m_hdrA->drawBuffers({GL_COLOR_ATTACHMENT0, GL_NONE});
    {
        auto p = prog("sky.vert", "sky.frag");
        p->set("uInvViewProj", cam.invViewProj);
        p->set("uCameraPos", cam.position);
        p->set("uCloudAmount", sky.clouds);
        bindEnv(*p);
        glDepthMask(GL_FALSE);
        fullscreen();
        glDepthMask(GL_TRUE);
    }

    if (!transparent.empty()) {
        std::sort(transparent.begin(), transparent.end(), [&](const DrawItem* a, const DrawItem* b) {
            return glm::distance(translationOf(a->model), cam.position) >
                   glm::distance(translationOf(b->model), cam.position);
        });
        glEnable(GL_BLEND);
        glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
        glDepthMask(GL_FALSE);
        for (const DrawItem* it : transparent) drawPbr(*it, cam);
        glDepthMask(GL_TRUE);
        glDisable(GL_BLEND);
    }
}

/* ------------------------------------------------------------------ */
/*  Screen space: volumetrics, SSR, the fold                           */
/* ------------------------------------------------------------------ */

GLuint Renderer::renderVolumetrics(const Camera& cam) {
    if (!m_q.volumetric || !stages.volumetric || !shadows.enabled || !stages.shadows) return 0;
    const float far = std::max(4.0f, std::min(shadows.distance, volumetric.maxDistance));
    auto p = prog("fullscreen.vert", "volumetric.frag");
    bindAndClear(*m_volA, 0, 0, 0, 0);
    bindEnv(*p);
    bindShadows(*p);
    p->texture("uSceneDepth", *m_hdrA->depth());
    p->set("uInvViewProj", cam.invViewProj);
    p->set("uCameraPos", cam.position);
    p->set("uVolSteps", clampv(m_q.volSteps, 2, 64));
    p->set("uVolDensity", std::max(0.0f, fog.density) * volumetric.densityScale);
    p->set("uVolIntensity", volumetric.intensity);
    p->set("uVolG", volumetric.anisotropy);
    p->set("uVolTint", volumetric.tint);
    p->set("uVolBias", volumetric.bias);
    p->set("uVolClamp", volumetric.clamp);
    p->set("uVolCurve", std::max(1.5f, volumetric.curve));
    p->set("uVolNear", std::max(0.02f, cam.nearZ));
    p->set("uVolRange", glm::vec2(far * volumetric.fadeStart, far));
    p->set("uVolJitter", taaOn() ? std::fmod(static_cast<float>(m_frame) * 0.6180339887f, 1.0f) : 0.0f);
    fullscreen();

    auto b = prog("fullscreen.vert", "volBlur.frag");
    bindAndClear(*m_volB, 0, 0, 0, 1);
    b->texture("uVolSrc", m_volA->color(0));
    b->set("uVolTexel", glm::vec2(1.0f / m_volA->width(), 1.0f / m_volA->height()));
    fullscreen();
    return m_volB->color(0).id();
}

GLuint Renderer::renderSsr(const Camera& cam) {
    if (!m_q.ssr || !stages.ssr) return 0;
    const float w = static_cast<float>(m_ssrA->width()), h = static_cast<float>(m_ssrA->height());
    const glm::vec2 zParams(cam.proj[2][2], cam.proj[3][2]);
    auto t = prog("fullscreen.vert", "ssr.frag");
    bindAndClear(*m_ssrA, 0, 0, 0, 0);
    t->texture("uGBufferTex", m_hdrA->color(1));
    t->texture("uSceneDepth", *m_hdrA->depth());
    t->texture("uSsrSceneTex", m_hdrA->color(0));
    t->set("uProj", cam.proj);
    t->set("uInvProj", cam.invProj);
    t->set("uSsrTexel", glm::vec2(1.0f / w, 1.0f / h));
    t->set("uSsrZParams", zParams);
    t->set("uSsrSteps", clampv(m_q.ssrSteps, 4, 64));
    t->set("uSsrNear", cam.nearZ);
    t->set("uSsrMaxDistance", ssr.maxDistance);
    t->set("uSsrMaxTexels", std::min(w, h) * 0.8f);
    t->set("uSsrThickness", ssr.thickness);
    t->set("uSsrEdgeFade", ssr.edgeFade);
    t->set("uSsrRoughCut", ssr.roughCut);
    t->set("uSsrRoughMax", ssr.roughMax);
    // Animated only under TAA, which resolves it; static otherwise (web rule).
    t->set("uSsrJitter", taaOn() ? static_cast<float>(m_frame % 8u) * 5.588f : 0.0f);
    fullscreen();

    /* NATIVE: the blur's tap count grows with the cone instead of its
       stride (see ssrBlur.frag), so this is a gap ceiling in texels, and
       the cone ceiling keeps the web's value of 6x the web stride cap. */
    const float maxStride = 1.5f;
    const float coneMax = std::max(1.5f, h * 0.016f) * 6.0f;
    const float coneScale = h / std::max(cam.fov, 1e-3f);
    const gl::Framebuffer* passes[2][2] = {{m_ssrA.get(), m_ssrB.get()}, {m_ssrB.get(), m_ssrA.get()}};
    for (int i = 0; i < 2; ++i) {
        auto b = prog("fullscreen.vert", "ssrBlur.frag");
        const auto& src = *passes[i][0];
        bindAndClear(*passes[i][1], 0, 0, 0, 0);
        b->texture("uGBufferTex", m_hdrA->color(1));
        b->texture("uSceneDepth", *m_hdrA->depth());
        b->texture("uSsrTex", src.color(0));
        b->set("uSsrTexel", glm::vec2(1.0f / src.width(), 1.0f / src.height()));
        b->set("uSsrDir", i == 0 ? glm::vec2(1, 0) : glm::vec2(0, 1));
        b->set("uSsrZParams", zParams);
        b->set("uSsrConeScale", coneScale);
        b->set("uSsrConeMax", coneMax);
        b->set("uSsrMaxStride", maxStride);
        fullscreen();
    }
    return m_ssrA->color(0).id();
}

GLuint Renderer::applyScreenSpace(const Camera& cam, GLuint ssrTex, GLuint volTex) {
    auto p = prog("fullscreen.vert", "screenSpace.frag");
    m_hdrB->bind();
    p->texture("uGBufferTex", m_hdrA->color(1));
    p->texture("uSceneDepth", *m_hdrA->depth());
    bindEnv(*p);
    p->texture("uSsrSceneTex", m_hdrA->color(0));
    p->set("uInvProj", cam.invProj);
    p->set("uInvView", cam.invView);
    p->set("uSsrZParams", glm::vec2(cam.proj[2][2], cam.proj[3][2]));
    p->set("uSsrTexel", glm::vec2(1.0f / m_ssrA->width(), 1.0f / m_ssrA->height()));
    p->texture("uSsrTex", ssrTex ? ssrTex : m_hdrA->color(0).id());
    p->set("uSsrIntensity", ssrTex ? ssr.intensity : 0.0f);
    p->set("uSsrReplace", ssr.replace);
    p->set("uSsrEnvVis", 1.0f - 0.375f * sky.occlusion);
    p->set("uSsrClamp", ssr.clamp);
    p->set("uSsrMaxDarken", ssr.maxDarken);
    p->texture("uVolTex", volTex ? volTex : m_hdrA->color(0).id());
    p->set("uVolStrength", volTex ? 1.0f : 0.0f);
    p->texture("uGtaoBentTex", m_hdrA->color(0));
    p->set("uGtaoSpecOcc", 0.0f);
    fullscreen();
    return m_hdrB->color(0).id();
}

/* ------------------------------------------------------------------ */
/*  Post                                                                */
/* ------------------------------------------------------------------ */

GLuint Renderer::resolveTaa(const Camera& cam, GLuint sceneTex) {
    const int cur = m_taaIndex, prev = 1 - m_taaIndex;
    auto p = prog("fullscreen.vert", "taa.frag");
    m_taa[static_cast<size_t>(cur)]->bind();
    p->texture("uCurrent", sceneTex);
    p->texture("uHistory", m_taa[static_cast<size_t>(prev)]->color(0));
    p->texture("uDepth", *m_hdrA->depth());
    p->set("uInvViewProj", cam.invViewProj);
    p->set("uPrevViewProj", m_prevViewProj);
    p->set("uTexel", glm::vec2(1.0f / m_w, 1.0f / m_h));
    p->set("uJitterUv", m_jitterUv);
    /* 1/(n+1) while the history fills -- so frame n is an exact running
       average and a still screenshot converges to a true supersample --
       then a floor of 0.08 so a moving view keeps responding. */
    p->set("uBlend", std::max(0.08f, 1.0f / static_cast<float>(m_taaFrames + 1)));
    p->set("uHistoryValid", m_taaFrames > 0 ? 1.0f : 0.0f);
    fullscreen();
    ++m_taaFrames;
    m_taaIndex = prev;
    return m_taa[static_cast<size_t>(cur)]->color(0).id();
}

void Renderer::present(const Camera& cam) {
    glDisable(GL_DEPTH_TEST);
    glDisable(GL_BLEND);
    glDepthMask(GL_FALSE);

    const GLuint volTex = renderVolumetrics(cam);
    GLuint sceneTex = m_hdrA->color(0).id();
    const GLuint ssrTex = renderSsr(cam);
    if (ssrTex || volTex) sceneTex = applyScreenSpace(cam, ssrTex, volTex);
    if (taaOn()) sceneTex = resolveTaa(cam, sceneTex);

    // NATIVE: meter the frame (exposure.frag) before the bloom and grade.
    if (post.autoKey > 0.0f) {
        const int nxt = 1 - m_expCur;
        auto e = prog("fullscreen.vert", "exposure.frag");
        m_exp[nxt]->bind();
        e->texture("uScene", sceneTex);
        e->texture("uPrev", m_exp[m_expCur]->color(0));
        e->set("uAdapt", m_expValid ? 1.0f - std::exp(-post.autoSpeed * std::max(m_lastDt, 0.0f)) : 1.0f);
        fullscreen();
        m_expCur = nxt;
        m_expValid = true;
        static const bool verbose = std::getenv("GAME_EXPOSURE_VERBOSE") != nullptr;
        if (verbose) {
            float v[4] = {};
            glGetTextureImage(m_exp[m_expCur]->color(0).id(), 0, GL_RED, GL_FLOAT, sizeof(v), v);
            m_stats.autoLum = std::exp(v[0]);
            std::fprintf(stderr, "[exposure] meter %.4f -> gain %.3f\n", m_stats.autoLum,
                         clampv(post.autoKey / m_stats.autoLum, post.autoMin, post.autoMax));
        }
    }

    GLuint bloom[3] = {0, 0, 0};
    const int iters = std::min(m_q.bloomIters, static_cast<int>(m_bloom.size()));
    if (m_q.bloom && stages.bloom && post.bloom > 0.0f && iters > 0) {
        auto br = prog("fullscreen.vert", "bright.frag");
        bindAndClear(*m_bloom[0].first, 0, 0, 0, 1);
        br->texture("uTex", sceneTex);
        br->set("uThreshold", post.bloomThreshold);
        br->set("uSoftKnee", 0.6f);
        fullscreen();
        const gl::Framebuffer* src = m_bloom[0].first.get();
        std::vector<GLuint> results;
        for (int i = 0; i < iters; ++i) {
            auto& lvl = m_bloom[static_cast<size_t>(i)];
            if (i > 0) {
                auto c = prog("fullscreen.vert", "copy.frag");
                bindAndClear(*lvl.first, 0, 0, 0, 1);
                c->texture("uTex", src->color(0));
                fullscreen();
            }
            auto bl = prog("fullscreen.vert", "blur.frag");
            bindAndClear(*lvl.second, 0, 0, 0, 1);
            bl->texture("uTex", lvl.first->color(0));
            bl->set("uTexel", glm::vec2(1.0f / lvl.first->width(), 1.0f / lvl.first->height()));
            bl->set("uDir", glm::vec2(1, 0));
            fullscreen();
            bindAndClear(*lvl.first, 0, 0, 0, 1);
            bl->texture("uTex", lvl.second->color(0));
            bl->set("uTexel", glm::vec2(1.0f / lvl.second->width(), 1.0f / lvl.second->height()));
            bl->set("uDir", glm::vec2(0, 1));
            fullscreen();
            results.push_back(lvl.first->color(0).id());
            src = lvl.first.get();
        }
        bloom[0] = results[0];
        bloom[1] = results.size() > 1 ? results[1] : results[0];
        bloom[2] = results.size() > 2 ? results[2] : bloom[1];
    }

    GLuint aoTex = 0;
    if (m_q.ssao > 0.0f && m_q.ssaoSamples > 0 && stages.ssao) {
        auto s = prog("fullscreen.vert", "ssao.frag");
        bindAndClear(*m_aoA, 1, 1, 1, 1);
        s->texture("uDepth", *m_hdrA->depth());
        s->set("uInvProj", cam.invProj);
        s->set("uProj", cam.proj);
        s->set("uTexel", glm::vec2(1.0f / m_aoA->width(), 1.0f / m_aoA->height()));
        s->set("uRadius", m_q.ssaoRadius);
        s->set("uBias", 0.10f);
        s->set("uAoFloor", m_q.ssaoFloor);
        s->set("uIntensity", 2.9f);
        s->set("uSamples", m_q.ssaoSamples);
        s->set("uTime", m_time);
        fullscreen();
        const gl::Framebuffer* ab[2][2] = {{m_aoA.get(), m_aoB.get()}, {m_aoB.get(), m_aoA.get()}};
        for (int i = 0; i < 2; ++i) {
            auto b = prog("fullscreen.vert", "ssaoBlur.frag");
            bindAndClear(*ab[i][1], 1, 1, 1, 1);
            b->texture("uTex", ab[i][0]->color(0));
            b->texture("uDepth", *m_hdrA->depth());
            b->set("uTexel", glm::vec2(1.0f / ab[i][0]->width(), 1.0f / ab[i][0]->height()));
            b->set("uDir", i == 0 ? glm::vec2(1, 0) : glm::vec2(0, 1));
            fullscreen();
        }
        aoTex = m_aoA->color(0).id();
    }

    if (m_q.contactShadow && stages.contact && aoTex) {
        auto c = prog("fullscreen.vert", "contact.frag");
        bindAndClear(*m_aoB, 1, 1, 1, 1);
        const glm::vec3 lv = glm::normalize(glm::mat3(cam.view) * sun.direction);
        c->texture("uContactDepth", *m_hdrA->depth());
        c->texture("uContactAo", aoTex);
        c->set("uContactInvProj", cam.invProj);
        c->set("uContactProj", cam.proj);
        c->set("uContactLightView", lv);
        c->set("uContactTexel", glm::vec2(1.0f / m_aoB->width(), 1.0f / m_aoB->height()));
        c->set("uContactLength", shadows.contactLength);
        c->set("uContactMaxPixels", shadows.contactMaxPixels);
        c->set("uContactThickness", shadows.contactThickness);
        c->set("uContactBias", shadows.contactBias);
        c->set("uContactStrength", shadows.enabled ? shadows.contactStrength : 0.0f);
        c->set("uContactFade", shadows.contactFade);
        c->set("uContactSteps", clampv(m_q.contactSteps, 1, 32));
        fullscreen();
        aoTex = m_aoB->color(0).id();
    }

    const gl::Framebuffer& finalTarget = m_final ? *m_final : *m_output;
    // FXAA after TAA would anti-alias twice and soften for nothing.
    const bool fxaa = m_q.fxaa && stages.fxaa && !taaOn();
    const gl::Framebuffer& compTarget = fxaa ? *m_ldr : finalTarget;
    compTarget.bind();
    {
        const GLuint fallback = m_hdrA->color(0).id();
        auto c = prog("fullscreen.vert", "composite.frag");
        c->texture("uScene", sceneTex);
        c->texture("uBloom0", bloom[0] ? bloom[0] : fallback);
        c->texture("uBloom1", bloom[1] ? bloom[1] : fallback);
        c->texture("uBloom2", bloom[2] ? bloom[2] : fallback);
        c->set("uBloomStrength", bloom[0] ? post.bloom : 0.0f);
        c->set("uExposure", post.exposure);
        c->texture("uAutoExp", m_exp[m_expCur]->color(0));
        c->set("uAutoKey", m_expValid ? post.autoKey : 0.0f);
        c->set("uAutoMin", post.autoMin);
        c->set("uAutoMax", post.autoMax);
        c->set("uToneMap", post.toneMap);
        c->set("uAgxPunch", post.agxPunch);
        c->set("uAgxSat", post.agxSat);
        c->set("uVignette", post.vignette);
        c->set("uChromatic", post.chromatic);
        c->set("uSaturation", post.saturation);
        c->set("uContrast", post.contrast);
        c->set("uGrain", post.grain);
        c->set("uTint", post.tint);
        c->set("uTintMix", post.tintMix);
        c->set("uTime", m_time);
        c->set("uSharpen", m_q.sharpen);
        c->set("uPosterize", 0.0f);
        c->set("uTexel", glm::vec2(1.0f / m_w, 1.0f / m_h));
        c->texture("uAo", aoTex ? aoTex : fallback);
        c->set("uAoStrength", aoTex ? m_q.ssao : 0.0f);
        fullscreen();
    }
    if (fxaa) {
        finalTarget.bind();
        auto f = prog("fullscreen.vert", "fxaa.frag");
        f->texture("uTex", m_ldr->color(0));
        f->set("uTexel", glm::vec2(1.0f / m_w, 1.0f / m_h));
        fullscreen();
    }
    if (m_final) {
        // Supersampling resolve. At an exact 2x ratio a bilinear blit
        // lands every destination sample between four source texels,
        // which is an exact 2x2 box filter.
        glBlitNamedFramebuffer(m_final->id(), m_output->id(), 0, 0, m_w, m_h, 0, 0, m_outW, m_outH,
                               GL_COLOR_BUFFER_BIT, GL_LINEAR);
    }
    glDepthMask(GL_TRUE);
    glEnable(GL_DEPTH_TEST);
}

void Renderer::render(const std::vector<DrawItem>& items, const Camera& camIn, float dt) {
    if (!m_hdrA) throw std::logic_error("Renderer::render before resize");
    m_time += dt;
    m_lastDt = dt;
    m_stats = {};
    Camera cam = camIn;
    cam.update(static_cast<float>(m_w) / static_cast<float>(m_h));
    updateAtmosphere();
    const glm::mat4 unjitteredViewProj = cam.viewProj;
    if (taaOn()) {
        /* Halton(2,3) sub-pixel jitter on the projection: sixteen positions
           that fill the pixel evenly for every prefix length. */
        auto halton = [](uint32_t i, uint32_t b) {
            float f = 1.0f, r = 0.0f;
            for (; i > 0; i /= b) { f /= static_cast<float>(b); r += f * static_cast<float>(i % b); }
            return r;
        };
        const uint32_t k = (m_frame % 16u) + 1u;
        const float jx = halton(k, 2) - 0.5f, jy = halton(k, 3) - 0.5f;   // pixels
        /* proj[2][x] multiplies the view-space z, which is NEGATIVE for
           everything in front of a GL camera (clip w = -z). Subtracting is
           therefore what moves the image by +jitter -- the direction the
           TAA shader assumes when it adds uJitterUv back. Adding here was a
           measured bug: every frame read the history up to a pixel away and
           the repeated bilinear resample blurred the whole image. */
        cam.proj[2][0] -= 2.0f * jx / static_cast<float>(m_w);
        cam.proj[2][1] -= 2.0f * jy / static_cast<float>(m_h);
        cam.viewProj = cam.proj * cam.view;
        cam.invViewProj = glm::inverse(cam.viewProj);
        cam.invProj = glm::inverse(cam.proj);
        m_jitterUv = glm::vec2(jx / static_cast<float>(m_w), jy / static_cast<float>(m_h));
    } else {
        m_jitterUv = glm::vec2(0.0f);
        m_taaFrames = 0;
    }
    renderShadows(items, cam);
    renderScene(items, cam);
    present(cam);
    m_prevViewProj = unjitteredViewProj;
    ++m_frame;
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
}

} // namespace game::rendering
