#pragma once
#include "rendering/Atmosphere.hpp"
#include "rendering/Camera.hpp"
#include "rendering/Material.hpp"
#include "rendering/Mesh.hpp"
#include "rendering/ShaderLibrary.hpp"
#include "rendering/gl/Framebuffer.hpp"

#include <array>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace game::rendering {

/* One thing to draw. `instances` non-null and non-empty = one instanced
 * draw of every entry (model/params come from the instances then). */
struct DrawItem {
    const Mesh*     mesh     = nullptr;
    const Material* material = nullptr;
    glm::mat4       model{1.0f};
    glm::vec4       params{1.0f, 1.0f, 1.0f, 0.0f};   // tint rgb, custom
    const std::vector<Instance>* instances = nullptr;
    bool            grass = false;
    /* Skinned: the bone palette, one mat4 per bone as an RGBA32F texture
       (width = 4 x bones, height 1) -- GLSL.transform's layout. */
    const gl::Texture* boneTexture = nullptr;
    int             boneCount = 0;
    /* NATIVE: edge bevel radius in metres, for meshes that are unit boxes
       (the shader derives a rounded-box normal from it). 0 = off. */
    float           bevel = 0.0f;
    /* NATIVE: a lake/pool/sea surface -- the shader replaces the normal
       with animated waves and drops the roughness (see pbr.frag). */
    bool            water = false;
    /* NATIVE: outdoor wear, 0..1 -- macro colour variation, grime at the
       foot of walls, rain streaks under their tops (see pbr.frag). */
    float           weathering = 0.0f;
    /* NATIVE: 0..1 -- this is outdoor ground: damp patches, puddles and
       cracks in the paving. */
    float           wetGround = 0.0f;
    /* NATIVE: a fake window pane -- trace a room behind it (pbr.frag);
       the value is the room's brightness. 0 = off. */
    float           interior = 0.0f;
    /* NATIVE: the lawn around the camera (GRASS_FIELD). A density/height
       field over the map (r = density, g = ground height); the instances
       are a fixed grid of offsets the vertex shader re-centres on the
       camera every frame. */
    const gl::Texture* field = nullptr;
    glm::vec4       fieldRect{0.0f};   // origin x, z, size x, z (metres)
    float           fieldSpacing = 0.2f, fieldRadius = 18.0f;
};

struct PointLight {
    glm::vec3 position{0.0f};
    float     radius = 10.0f;
    glm::vec3 color{1.0f};
    float     intensity = 1.0f;
};

/* The quality table. The web engine had five tiers bounded by a phone and a
 * test suite; this build runs on a desktop GPU, so it has two: `ultra` is
 * the web engine's ultra tier exactly, and `cinematic` is what that tier's
 * own comments say each number would be with the budget to spend. */
struct Quality {
    std::string name = "ultra";
    int   shadowRes = 4096;
    int   bloomIters = 4;
    bool  bloom = true;
    bool  fxaa = true;
    float ssao = 0.95f;
    int   ssaoSamples = 26;
    float ssaoRadius = 0.70f;
    float ssaoFloor = 0.30f;
    float sharpen = 0.52f;
    bool  env = true;
    int   envRes = 256;
    int   envSamples = 64;
    float envDiffuse = 1.0f;
    bool  envScene = true;
    float envSceneRange = 60.0f;
    float multiscatter = 1.0f;
    float specOcclusion = 1.0f;
    bool  ssr = true;
    int   ssrSteps = 28;
    bool  volumetric = true;
    int   volSteps = 24;
    bool  pcss = true;
    int   pcssBlockers = 12;
    int   pcssTaps = 16;
    bool  contactShadow = true;
    int   contactSteps = 10;
    float parallax = 1.0f;
    int   parallaxSteps = 24;
    bool  detailNormal = true;
    /* Internal resolution / output resolution. >1 is supersampling,
       resolved with a box-filtered downsample. */
    float renderScale = 1.0f;
    /* NATIVE: temporal anti-aliasing (shaders/taa.frag). Also animates the
       SSR and volumetric dither, which only pays with a temporal filter. */
    bool  taa = true;

    static Quality ultra();
    static Quality cinematic();
    static Quality byName(const std::string& n);
};

/* The look knobs -- the web renderer's sun/sky/fog/shadows/post/ssr/
 * volumetric objects, with the web defaults. Live: change them between
 * frames. */
struct Sun {
    glm::vec3 direction = glm::normalize(glm::vec3(0.45f, 0.72f, 0.53f));   // toward the sun
    glm::vec3 color{1.0f, 0.94f, 0.84f};
    float     intensity = 3.4f;
};
struct Sky {
    glm::vec3 zenith{0.16f, 0.33f, 0.66f};
    glm::vec3 horizon{0.62f, 0.74f, 0.88f};
    glm::vec3 ground{0.26f, 0.24f, 0.22f};
    float     intensity = 1.0f;
    float     clouds = 0.4f;
    glm::vec3 room{0.0f};
    float     occlusion = 0.45f;
    float     bounce = 0.70f;
    /* NATIVE: 0 = the web engine's authored gradient; 1 = the physical
       atmosphere (rendering/Atmosphere), where zenith/horizon are derived
       from the scattering and turbidity thickens the haze. physicalGain
       calibrates the table's per-unit-illuminance radiance to this
       renderer's sun intensities. */
    int       model = 0;
    float     turbidity = 1.0f;
    float     physicalGain = 4.0f;       // chosen from a 3/4/6 sweep at noon and golden hour
};
struct Fog {
    glm::vec3 color{0.62f, 0.72f, 0.85f};
    float density = 0.008f, height = 0.0f, falloff = 0.08f, skyBlend = 0.85f;
};
struct Shadows {
    bool  enabled = true;
    float distance = 60.0f, strength = 0.86f, split = 14.0f;
    float softness = 0.00463f, penumbraMax = 18.0f;
    float contactLength = 0.30f, contactMaxPixels = 26.0f, contactThickness = 0.45f;
    float contactBias = 0.004f, contactStrength = 0.85f, contactFade = 14.0f;
};
struct Post {
    float exposure = 1.0f;
    int   toneMap = 0;              // 0 ACES, 1 AgX
    float agxPunch = 1.0f, agxSat = 1.0f;
    float bloom = 0.55f, bloomThreshold = 1.1f;
    float vignette = 0.55f, chromatic = 0.0018f;
    float saturation = 1.08f, contrast = 1.04f, grain = 0.012f;
    glm::vec3 tint{0.35f, 1.0f, 0.45f};
    float tintMix = 0.0f;
    /* NATIVE: auto exposure. key 0 = off (the web engine's fixed exposure).
       min/max bound the correction; speed is the adaptation rate, 1/s. */
    float autoKey = 0.0f, autoMin = 0.35f, autoMax = 2.5f, autoSpeed = 1.5f;
};
struct Ssr {
    float intensity = 1.0f, replace = 0.90f, roughCut = 0.25f, roughMax = 0.50f;
    float thickness = 0.35f, maxDistance = 24.0f, edgeFade = 0.12f, clamp = 6.0f, maxDarken = 0.60f;
};
struct Volumetric {
    float intensity = 1.0f, densityScale = 8.0f, anisotropy = 0.45f, tint = 0.60f;
    float maxDistance = 60.0f, fadeStart = 0.62f, bias = 0.0001f, clamp = 4.0f, curve = 24.0f;
};

/* Which passes ran and the last frame's counters. */
struct RenderStats {
    float autoLum = 0.0f;   // the meter's reading (read back only with GAME_EXPOSURE_VERBOSE)
    int draws = 0;
    long long tris = 0;
    int instances = 0;
};

/* HDR forward PBR with cascaded shadows (PCSS), a scene-baked environment
 * probe, SSR, volumetric scattering, SSAO + contact shadows, bloom, and a
 * filmic composite -- the web engine's frame, pass for pass, on the same
 * shaders. Output is an RGBA8 target at the output resolution. */
class Renderer {
public:
    Renderer(ShaderLibrary& shaders, Quality quality);
    ~Renderer();

    void resize(int outputWidth, int outputHeight);
    void render(const std::vector<DrawItem>& items, const Camera& camera, float dt);

    [[nodiscard]] const gl::Framebuffer& output() const { return *m_output; }
    [[nodiscard]] const Quality& quality() const { return m_q; }
    [[nodiscard]] const RenderStats& stats() const { return m_stats; }
    [[nodiscard]] int internalWidth()  const { return m_w; }
    [[nodiscard]] int internalHeight() const { return m_h; }

    /* Debug: capture intermediate targets. "hdr", "gbuffer", "ao",
       "ssr", "vol", "shadow0", "bloom" -- read back by the stage tests. */
    [[nodiscard]] const gl::Framebuffer* target(const std::string& name) const;
    /* Every program the renderer has used, for the never-set audit. */
    [[nodiscard]] std::vector<std::shared_ptr<gl::Program>> programs() const;

    Sun        sun;
    Sky        sky;
    Fog        fog;
    Shadows    shadows;
    Post       post;
    Ssr        ssr;
    Volumetric volumetric;
    std::vector<PointLight> lights;
    glm::vec3  windDir = glm::normalize(glm::vec3(1.0f, 0.0f, 0.3f));
    float      windStrength = 0.25f;
    float      detailScale = 9.0f, detailFade = 11.0f;
    float      parallaxDepth = 0.022f, parallaxFade = 18.0f;
    float      envIntensity = 1.0f;
    float      bevelScale = 1.0f;       // multiplies every DrawItem::bevel
    float      weatheringScale = 1.0f;  // multiplies every DrawItem::weathering
    float      wetScale = 1.0f;         // multiplies every DrawItem::wetGround
    float      interiorScale = 1.0f;    // multiplies every DrawItem::interior
    int        debugMode = 0;
    /* Stage switches for the step-by-step screenshots. All on = the frame. */
    struct Stages {
        bool shadows = true, env = true, ssao = true, contact = true, ssr = true;
        bool volumetric = true, bloom = true, fxaa = true, textures = true, taa = true;
    } stages;

private:
    std::shared_ptr<gl::Program> prog(const std::string& vert, const std::string& frag,
                                      const std::vector<std::string>& defines = {});
    void bindEnv(const gl::Program& p) const;
    void bindShadows(const gl::Program& p) const;
    void bindLights(const gl::Program& p, const glm::vec3& cameraPos) const;
    void bindMaterial(const gl::Program& p, const Material& m) const;
    void drawItem(const gl::Program& p, const DrawItem& it);
    void drawPbr(const DrawItem& it, const Camera& cam);
    void fullscreen();

    void fitCascade(const Camera& cam, float nearD, float farD, int idx);
    void renderShadows(const std::vector<DrawItem>& items, const Camera& cam);
    void renderEnv(const std::vector<DrawItem>& items, const Camera& cam);
    void renderScene(const std::vector<DrawItem>& items, const Camera& cam);
    void present(const Camera& cam);
    GLuint renderVolumetrics(const Camera& cam);
    GLuint renderSsr(const Camera& cam);
    GLuint applyScreenSpace(const Camera& cam, GLuint ssrTex, GLuint volTex);
    GLuint resolveTaa(const Camera& cam, GLuint sceneTex);

    void updateAtmosphere();
    [[nodiscard]] bool taaOn() const { return m_q.taa && stages.taa; }
    void initEnv();
    void bakeEnvSh();
    glm::vec3 skyRadianceCpu(const glm::vec3& d) const;
    uint32_t envHash() const;
    void attachEnvFace(const gl::Texture& cube, int face, int level, int size, bool withDepth);

    ShaderLibrary& m_lib;
    Quality        m_q;
    int  m_outW = 0, m_outH = 0, m_w = 0, m_h = 0;
    float m_time = 0.0f;
    RenderStats m_stats;
    std::map<std::string, std::shared_ptr<gl::Program>> m_used;

    std::unique_ptr<gl::Framebuffer> m_hdrA, m_hdrB, m_ldr, m_final, m_output;
    std::unique_ptr<gl::Framebuffer> m_exp[2];   // NATIVE: adapted log-luminance, ping-pong 1x1
    int m_expCur = 0;
    bool m_expValid = false;
    float m_lastDt = 0.016f;
    std::unique_ptr<gl::Framebuffer> m_aoA, m_aoB, m_ssrA, m_ssrB, m_volA, m_volB;
    std::vector<std::pair<std::unique_ptr<gl::Framebuffer>, std::unique_ptr<gl::Framebuffer>>> m_bloom;
    std::array<std::unique_ptr<gl::Framebuffer>, 2> m_shadowMaps;
    std::array<glm::mat4, 2> m_shadowMats{glm::mat4(1.0f), glm::mat4(1.0f)};
    // TAA.
    std::array<std::unique_ptr<gl::Framebuffer>, 2> m_taa;
    int       m_taaIndex = 0;
    int       m_taaFrames = 0;           // frames accumulated since the history was valid
    uint32_t  m_frame = 0;
    glm::vec2 m_jitterUv{0.0f};
    glm::mat4 m_prevViewProj{1.0f};      // last frame, unjittered
    std::array<float, 2> m_cascadeGap{1.0f, 1.0f}, m_cascadeTexelZ{0.0f, 0.0f};
    gl::VertexArrayHandle m_emptyVao;

    // Environment probe.
    gl::Texture m_envSource, m_envCube, m_brdfLut, m_envNullCube, m_envNull2D, m_noBlocker;
    gl::FramebufferHandle m_envFbo;
    gl::RenderbufferHandle m_envDepth;
    int  m_envLevels = 0, m_envJob = 0, m_envJobs = 0;
    bool m_envReady = false, m_brdfBaked = false, m_envBaking = false;
    uint32_t m_envHash = 0;
    bool m_envHashValid = false;
    glm::vec3 m_envAt{0.0f}, m_envWantAt{0.0f};
    std::array<glm::vec3, 9> m_envSh{};

    // Physical sky.
    Atmosphere  m_atmo;
    gl::Texture m_skyLut;
    uint32_t    m_atmoHash = 0;
    bool        m_atmoValid = false;
    glm::vec3   m_atmoZenith{0.0f}, m_atmoHorizon{0.0f};
    /* The sun as it arrives through the air, relative to overhead: white at
       noon, orange and dimmer at a low sun. Multiplies the sun's colour in
       every lighting use while the physical sky is on. */
    glm::vec3   m_sunTint{1.0f};
    [[nodiscard]] glm::vec3 litSunColor() const {
        return (sky.model == 1 && m_atmoValid) ? sun.color * m_sunTint : sun.color;
    }
};

} // namespace game::rendering
