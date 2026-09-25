// HDR renderer.
//
// Frame: sun shadow cascades -> HDR scene (RGBA16F, log depth) with sky, lit
// opaque and transparent passes -> eye adaptation -> bloom -> ACES tonemap
// -> FXAA -> screen. Security cameras render the same scene into small HDR
// targets with a CCTV post shader.
#pragma once
#include "core/GL.h"
#include "core/Math.h"
#include "render/Mesh.h"
#include "render/Shader.h"
#include <functional>
#include <vector>

namespace ps {

struct Camera {
    vec3 pos{0, 1.7f, 0};
    vec3 forward{0, 0, -1};
    float fovY = radians(70.0f);
    float aspect = 16.0f / 9.0f;
    float zNear = 0.05f, zFar = 90000.0f;
    mat4 view, proj;
    void lookDir(vec3 p, vec3 fwd);
    void lookAt(vec3 p, vec3 target) { lookDir(p, target - p); }
    mat4 viewProj() const { return proj * view; }
    vec3 right() const { return normalize(cross(forward, {0, 1, 0})); }
};

struct PointLight {
    vec3 pos;
    float radius;
    vec3 color;   // HDR intensity
};

enum class Pass { Shadow, Opaque, Transparent };

struct Frustum {
    vec4 planes[6];
    void fromMatrix(const mat4& vp);
    bool visible(const AABB& b) const;
};

class Renderer {
public:
    using SceneFn = std::function<void(Renderer&, Pass)>;

    struct Target {   // offscreen view (security cameras)
        int w = 0, h = 0;
        GLuint hdrFbo = 0, hdrTex = 0, depthTex = 0, ldrFbo = 0, ldrTex = 0;
    };

    bool init(int width, int height);
    void resize(int width, int height);
    void reloadShaders();
    int width() const { return w_; }
    int height() const { return h_; }

    // Lighting from the time of day (0..24 hours)
    void setTimeOfDay(float hour);
    float nightAmount() const { return night_; }
    vec3 sunDirection() const { return sunDir_; }

    void renderFrame(const Camera& cam, const SceneFn& scene, float dt, float time);
    Target createTarget(int w, int h);
    void renderToTarget(const Camera& cam, const SceneFn& scene, Target& t, float time);
    std::vector<uint8_t> readPixels() const;
    void resetAdaptation() { firstAdapt_ = true; }

    // ---- used by scene callbacks ----
    Pass pass() const { return pass_; }
    bool visible(const AABB& b) const { return frustum_.visible(b); }
    vec3 viewPos() const { return viewPos_; }
    void draw(const Mesh& m, const mat4& model = mat4(), vec4 tint = {1, 1, 1, 1});
    void drawInstanced(const Mesh& m);
    void setDoubleSided(bool on);

    // Settings (the pause menu edits these)
    float exposureBias = 0.0f;   // stops
    float bloomStrength = 0.045f;
    bool autoExposure = true;
    bool shadows = true;
    float fade = 1.0f;           // 0 = black
    float letterbox = 0.0f;
    float wind = 1.0f;
    AABB indoorBox;              // sky ambient is blocked inside this box
    std::vector<PointLight> lights;   // candidates; nearest 16 are used

private:
    struct Fb { GLuint fbo = 0, tex = 0; int w = 0, h = 0; };
    void createTargets();
    void destroyTargets();
    Fb makeColorFb(int w, int h, GLenum ifmt, GLenum fmt, GLenum type, bool mip = false);
    void setupLitUniforms(Shader& s, const Camera& cam, bool shadowsOn, float time, bool transparent);
    void renderShadows(const Camera& cam, const SceneFn& scene);
    void renderScene(const Camera& cam, const SceneFn& scene, GLuint fbo, int w, int h, float time, bool shadowsOn);
    void fullscreen() const;
    Shader* program(bool instanced);

    int w_ = 1280, h_ = 720;
    Shader lit_, litInst_, shadow_, shadowInst_, sky_, bloomDown_, bloomUp_, lum_, adapt_, tonemap_, fxaa_, cctv_;
    GLuint emptyVao_ = 0;

    GLuint hdrFbo_ = 0, hdrTex_ = 0, depthTex_ = 0;
    std::vector<Fb> bloom_;
    Fb lumFb_, adaptFb_[2], ldrFb_;
    int adaptIdx_ = 0;
    bool firstAdapt_ = true;
    int lumLevels_ = 1;

    static constexpr int kShadowSize = 2048;
    GLuint shadowFbo_[2] = {0, 0}, shadowTex_[2] = {0, 0};
    mat4 shadowMat_[2];

    Pass pass_ = Pass::Opaque;
    Frustum frustum_;
    vec3 viewPos_;
    Shader* bound_ = nullptr;
    mat4 curLightVP_;

    // lighting state
    vec3 sunDir_{0.3f, 0.8f, 0.4f}, sunColor_{10, 10, 10}, skyZenith_, skyHorizon_, groundAmb_;
    float night_ = 0.0f, fogDensity_ = 0.00012f;
};

}  // namespace ps
