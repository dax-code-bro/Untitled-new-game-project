#include "render/Renderer.h"
#include <algorithm>
#include <cstdio>

namespace ps {

// ---------------------------------------------------------------- Camera / frustum
void Camera::lookDir(vec3 p, vec3 fwd) {
    pos = p;
    forward = normalize(fwd);
    vec3 up = std::fabs(forward.y) > 0.999f ? vec3(0, 0, -1) : vec3(0, 1, 0);
    view = mat4::lookAt(pos, pos + forward, up);
    proj = mat4::perspective(fovY, aspect, zNear, zFar);
}

void Frustum::fromMatrix(const mat4& vp) {
    auto row = [&](int r) { return vec4(vp.m[0][r], vp.m[1][r], vp.m[2][r], vp.m[3][r]); };
    vec4 r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
    auto add = [](vec4 a, vec4 b, float s) { return vec4(a.x + b.x * s, a.y + b.y * s, a.z + b.z * s, a.w + b.w * s); };
    planes[0] = add(r3, r0, 1); planes[1] = add(r3, r0, -1);
    planes[2] = add(r3, r1, 1); planes[3] = add(r3, r1, -1);
    planes[4] = add(r3, r2, 1); planes[5] = add(r3, r2, -1);
}

bool Frustum::visible(const AABB& b) const {
    for (const vec4& p : planes) {
        vec3 v{p.x >= 0 ? b.max.x : b.min.x, p.y >= 0 ? b.max.y : b.min.y, p.z >= 0 ? b.max.z : b.min.z};
        if (p.x * v.x + p.y * v.y + p.z * v.z + p.w < 0) return false;
    }
    return true;
}

// ---------------------------------------------------------------- setup
bool Renderer::init(int width, int height) {
    w_ = std::max(1, width);
    h_ = std::max(1, height);
    glGenVertexArrays(1, &emptyVao_);
    reloadShaders();
    createTargets();
    for (int i = 0; i < 2; ++i) {
        glGenTextures(1, &shadowTex_[i]);
        glBindTexture(GL_TEXTURE_2D, shadowTex_[i]);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, kShadowSize, kShadowSize, 0, GL_DEPTH_COMPONENT, GL_FLOAT, nullptr);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_COMPARE_MODE, GL_COMPARE_REF_TO_TEXTURE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_COMPARE_FUNC, GL_LEQUAL);
        glGenFramebuffers(1, &shadowFbo_[i]);
        glBindFramebuffer(GL_FRAMEBUFFER, shadowFbo_[i]);
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, shadowTex_[i], 0);
        glDrawBuffer(GL_NONE);
        glReadBuffer(GL_NONE);
        if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE)
            std::fprintf(stderr, "[renderer] shadow framebuffer incomplete\n");
    }
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    setTimeOfDay(10.0f);
    return true;
}

void Renderer::reloadShaders() {
    bool ok = true;
    ok &= lit_.load("lit.vert", "lit.frag");
    ok &= litInst_.load("lit.vert", "lit.frag", "#define INSTANCED 1");
    ok &= shadow_.load("shadow.vert", "shadow.frag");
    ok &= shadowInst_.load("shadow.vert", "shadow.frag", "#define INSTANCED 1");
    ok &= sky_.load("fullscreen.vert", "sky.frag");
    ok &= bloomDown_.load("fullscreen.vert", "bloom_down.frag");
    ok &= bloomUp_.load("fullscreen.vert", "bloom_up.frag");
    ok &= lum_.load("fullscreen.vert", "luminance.frag");
    ok &= adapt_.load("fullscreen.vert", "adapt.frag");
    ok &= tonemap_.load("fullscreen.vert", "tonemap.frag");
    ok &= fxaa_.load("fullscreen.vert", "fxaa.frag");
    ok &= cctv_.load("fullscreen.vert", "cctv.frag");
    std::fprintf(stderr, "[renderer] shaders %s\n", ok ? "loaded" : "had errors (see above)");
}

Renderer::Fb Renderer::makeColorFb(int w, int h, GLenum ifmt, GLenum fmt, GLenum type, bool mip) {
    Fb f;
    f.w = w; f.h = h;
    glGenTextures(1, &f.tex);
    glBindTexture(GL_TEXTURE_2D, f.tex);
    glTexImage2D(GL_TEXTURE_2D, 0, GLint(ifmt), w, h, 0, fmt, type, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, mip ? GL_LINEAR_MIPMAP_LINEAR : GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    if (mip) glGenerateMipmap(GL_TEXTURE_2D);
    glGenFramebuffers(1, &f.fbo);
    glBindFramebuffer(GL_FRAMEBUFFER, f.fbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, f.tex, 0);
    if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE)
        std::fprintf(stderr, "[renderer] framebuffer %dx%d incomplete\n", w, h);
    return f;
}

void Renderer::createTargets() {
    // HDR scene color + depth
    glGenTextures(1, &hdrTex_);
    glBindTexture(GL_TEXTURE_2D, hdrTex_);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA16F, w_, h_, 0, GL_RGBA, GL_HALF_FLOAT, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glGenTextures(1, &depthTex_);
    glBindTexture(GL_TEXTURE_2D, depthTex_);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT32F, w_, h_, 0, GL_DEPTH_COMPONENT, GL_FLOAT, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glGenFramebuffers(1, &hdrFbo_);
    glBindFramebuffer(GL_FRAMEBUFFER, hdrFbo_);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, hdrTex_, 0);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, depthTex_, 0);
    if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE)
        std::fprintf(stderr, "[renderer] HDR framebuffer incomplete\n");

    // Bloom mip chain (half res and down)
    int bw = w_ / 2, bh = h_ / 2;
    for (int i = 0; i < 6 && bw >= 2 && bh >= 2; ++i) {
        bloom_.push_back(makeColorFb(bw, bh, GL_RGBA16F, GL_RGBA, GL_HALF_FLOAT));
        bw /= 2; bh /= 2;
    }
    // Luminance (mipmapped down to 1x1) + adaptation ping-pong
    lumFb_ = makeColorFb(128, 128, GL_RG16F, GL_RG, GL_HALF_FLOAT, true);
    lumLevels_ = 8;  // 128 -> 1 is 7 levels below the base
    for (auto& a : adaptFb_) {
        a = makeColorFb(1, 1, GL_R16F, GL_RED, GL_HALF_FLOAT);
        glClearColor(0.5f, 0, 0, 1);
        glClear(GL_COLOR_BUFFER_BIT);
    }
    ldrFb_ = makeColorFb(w_, h_, GL_RGBA8, GL_RGBA, GL_UNSIGNED_BYTE);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    firstAdapt_ = true;
}

void Renderer::destroyTargets() {
    auto delFb = [](Fb& f) {
        if (f.fbo) glDeleteFramebuffers(1, &f.fbo);
        if (f.tex) glDeleteTextures(1, &f.tex);
        f = Fb();
    };
    glDeleteFramebuffers(1, &hdrFbo_);
    glDeleteTextures(1, &hdrTex_);
    glDeleteTextures(1, &depthTex_);
    for (auto& b : bloom_) delFb(b);
    bloom_.clear();
    delFb(lumFb_);
    delFb(adaptFb_[0]);
    delFb(adaptFb_[1]);
    delFb(ldrFb_);
}

void Renderer::resize(int width, int height) {
    if (width <= 0 || height <= 0 || (width == w_ && height == h_)) return;
    w_ = width; h_ = height;
    destroyTargets();
    createTargets();
}

// ---------------------------------------------------------------- lighting
void Renderer::setTimeOfDay(float hour) {
    // Sun path: rises in the east (+X) at 6:00, peaks south (+Z) at noon, sets west at 18:00.
    float t = (hour - 6.0f) / 12.0f;
    float el = std::sin(t * kPi) * radians(62.0f);
    float az = t * kPi;
    vec3 horiz = normalize(vec3(std::cos(az), 0.0f, 0.45f * std::sin(az) + 0.15f));
    vec3 sun = normalize(horiz * std::cos(el) + vec3(0, 1, 0) * std::sin(el));
    vec3 moon = normalize(vec3(-sun.x, std::max(0.35f, -sun.y), 0.3f));

    float day = smoothstepf(-0.10f, 0.12f, sun.y);
    float golden = 1.0f - smoothstepf(0.02f, 0.45f, sun.y);
    night_ = 1.0f - day;

    vec3 sunCol = lerp(vec3(1.0f, 0.93f, 0.85f), vec3(1.0f, 0.50f, 0.22f), golden) * (14.0f * smoothstepf(-0.04f, 0.10f, sun.y));
    vec3 moonCol = vec3(0.32f, 0.40f, 0.62f) * 0.22f;
    if (day > 0.35f) { sunDir_ = sun; sunColor_ = sunCol; }
    else { sunDir_ = moon; sunColor_ = moonCol * (1.0f - day / 0.35f) + sunCol * (day / 0.35f); }

    vec3 zenDay{0.22f, 0.42f, 0.95f}, zenSet{0.25f, 0.30f, 0.55f}, zenNight{0.006f, 0.009f, 0.022f};
    vec3 horDay{0.62f, 0.74f, 0.95f}, horSet{1.0f, 0.52f, 0.28f}, horNight{0.012f, 0.016f, 0.03f};
    skyZenith_ = lerp(lerp(zenDay * 2.4f, zenSet * 1.4f, golden), zenNight, night_);
    skyHorizon_ = lerp(lerp(horDay * 2.8f, horSet * 2.2f, golden), horNight, night_);
    groundAmb_ = lerp(vec3(0.30f, 0.26f, 0.20f) * 1.1f, vec3(0.006f, 0.007f, 0.01f), night_);
    fogDensity_ = 0.00010f + 0.00006f * golden;
}

void Renderer::setupLitUniforms(Shader& s, const Camera& cam, bool shadowsOn, float time, bool transparent) {
    s.use();
    s.set("uViewProj", cam.viewProj());
    s.set("uCamPos", cam.pos);
    s.set("uSunDir", sunDir_);
    s.set("uSunColor", sunColor_);
    s.set("uSkyZenith", skyZenith_);
    s.set("uSkyHorizon", skyHorizon_);
    s.set("uGroundAmbient", groundAmb_);
    s.set("uSunDiskIntensity", 60.0f);
    s.set("uNight", night_);
    s.set("uFogDensity", fogDensity_);
    s.set("uTime", time);
    s.set("uWind", wind);
    s.set("uLogDepthCoef", 1.0f / std::log2(cam.zFar + 1.0f));
    s.set("uShadowOn", shadowsOn ? 1.0f : 0.0f);
    s.set("uShadowMat0", shadowMat_[0]);
    s.set("uShadowMat1", shadowMat_[1]);
    s.set("uShadow0", 0);
    s.set("uShadow1", 1);
    s.set("uIndoorMin", indoorBox.min);
    s.set("uIndoorMax", indoorBox.max);
    s.set("uTransparentPass", transparent ? 1.0f : 0.0f);
    s.set("uTint", vec4(1, 1, 1, 1));

    // Nearest point lights
    std::vector<const PointLight*> sorted;
    sorted.reserve(lights.size());
    for (auto& l : lights) sorted.push_back(&l);
    std::sort(sorted.begin(), sorted.end(), [&](const PointLight* a, const PointLight* b) {
        vec3 da = a->pos - cam.pos, db = b->pos - cam.pos;
        return dot(da, da) < dot(db, db);
    });
    int n = std::min<int>(16, int(sorted.size()));
    float pos[16 * 4] = {}, col[16 * 4] = {};
    for (int i = 0; i < n; ++i) {
        pos[i * 4 + 0] = sorted[size_t(i)]->pos.x; pos[i * 4 + 1] = sorted[size_t(i)]->pos.y;
        pos[i * 4 + 2] = sorted[size_t(i)]->pos.z; pos[i * 4 + 3] = sorted[size_t(i)]->radius;
        col[i * 4 + 0] = sorted[size_t(i)]->color.x; col[i * 4 + 1] = sorted[size_t(i)]->color.y;
        col[i * 4 + 2] = sorted[size_t(i)]->color.z;
    }
    s.set("uNumPoint", n);
    glUniform4fv(s.loc("uPointPos[0]"), 16, pos);
    glUniform4fv(s.loc("uPointColor[0]"), 16, col);
}

Shader* Renderer::program(bool instanced) {
    if (pass_ == Pass::Shadow) return instanced ? &shadowInst_ : &shadow_;
    return instanced ? &litInst_ : &lit_;
}

void Renderer::draw(const Mesh& m, const mat4& model, vec4 tint) {
    Shader* s = program(false);
    if (s != bound_) { s->use(); bound_ = s; }
    s->set("uModel", model);
    if (pass_ != Pass::Shadow) s->set("uTint", tint);
    m.draw();
}

void Renderer::drawInstanced(const Mesh& m) {
    Shader* s = program(true);
    if (s != bound_) { s->use(); bound_ = s; }
    m.drawInstanced();
}

void Renderer::setDoubleSided(bool on) {
    if (on || pass_ == Pass::Shadow) glDisable(GL_CULL_FACE);
    else glEnable(GL_CULL_FACE);
}

void Renderer::fullscreen() const {
    glBindVertexArray(emptyVao_);
    glDrawArrays(GL_TRIANGLES, 0, 3);
}

// ---------------------------------------------------------------- passes
void Renderer::renderShadows(const Camera& cam, const SceneFn& scene) {
    const float radii[2] = {28.0f, 260.0f};
    const float ahead[2] = {14.0f, 160.0f};
    vec3 fwdFlat = normalize(vec3(cam.forward.x, 0.0f, cam.forward.z));
    vec3 up = std::fabs(sunDir_.y) > 0.99f ? vec3(0, 0, 1) : vec3(0, 1, 0);
    mat4 lv = mat4::lookAt(sunDir_ * 1000.0f, vec3(0.0f), up);
    pass_ = Pass::Shadow;
    glEnable(GL_DEPTH_TEST);
    glDepthFunc(GL_LESS);
    glDepthMask(1);
    glDisable(GL_CULL_FACE);
    glEnable(GL_POLYGON_OFFSET_FILL);
    glPolygonOffset(1.5f, 3.0f);
    for (int c = 0; c < 2; ++c) {
        float r = radii[c];
        vec3 center = cam.pos + fwdFlat * ahead[c];
        vec3 lc = lv.transformPoint(center);
        float texel = 2.0f * r / float(kShadowSize);
        lc.x = std::floor(lc.x / texel) * texel;
        lc.y = std::floor(lc.y / texel) * texel;
        float d = -lc.z;
        mat4 proj = mat4::ortho(lc.x - r, lc.x + r, lc.y - r, lc.y + r, d - 1500.0f, d + 1500.0f);
        curLightVP_ = proj * lv;
        shadowMat_[c] = curLightVP_;
        frustum_.fromMatrix(curLightVP_);
        glBindFramebuffer(GL_FRAMEBUFFER, shadowFbo_[c]);
        glViewport(0, 0, kShadowSize, kShadowSize);
        glClear(GL_DEPTH_BUFFER_BIT);
        shadow_.use(); shadow_.set("uLightVP", curLightVP_);
        shadowInst_.use(); shadowInst_.set("uLightVP", curLightVP_);
        bound_ = &shadowInst_;
        scene(*this, Pass::Shadow);
    }
    glDisable(GL_POLYGON_OFFSET_FILL);
}

void Renderer::renderScene(const Camera& cam, const SceneFn& scene, GLuint fbo, int w, int h, float time, bool shadowsOn) {
    glBindFramebuffer(GL_FRAMEBUFFER, fbo);
    glViewport(0, 0, w, h);
    glDepthMask(1);
    glClearDepth(1.0);
    glClear(GL_DEPTH_BUFFER_BIT | GL_COLOR_BUFFER_BIT);
    viewPos_ = cam.pos;

    // Sky (behind everything)
    glDisable(GL_DEPTH_TEST);
    glDepthMask(0);
    sky_.use();
    sky_.set("uInvViewProj", cam.viewProj().inverse());
    sky_.set("uCamPos", cam.pos);
    sky_.set("uSunDir", sunDir_);
    sky_.set("uSunColor", sunColor_);
    sky_.set("uSkyZenith", skyZenith_);
    sky_.set("uSkyHorizon", skyHorizon_);
    sky_.set("uGroundAmbient", groundAmb_);
    sky_.set("uSunDiskIntensity", 60.0f);
    sky_.set("uNight", night_);
    sky_.set("uTime", time);
    fullscreen();

    // Opaque
    glEnable(GL_DEPTH_TEST);
    glDepthFunc(GL_LESS);
    glDepthMask(1);
    glEnable(GL_CULL_FACE);
    glCullFace(GL_BACK);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, shadowTex_[0]);
    glActiveTexture(GL_TEXTURE0 + 1);
    glBindTexture(GL_TEXTURE_2D, shadowTex_[1]);
    glActiveTexture(GL_TEXTURE0);
    setupLitUniforms(litInst_, cam, shadowsOn, time, false);
    setupLitUniforms(lit_, cam, shadowsOn, time, false);
    bound_ = &lit_;
    pass_ = Pass::Opaque;
    frustum_.fromMatrix(cam.viewProj());
    scene(*this, Pass::Opaque);

    // Transparent (glass)
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glDepthMask(0);
    glDisable(GL_CULL_FACE);
    setupLitUniforms(litInst_, cam, shadowsOn, time, true);
    setupLitUniforms(lit_, cam, shadowsOn, time, true);
    bound_ = &lit_;
    pass_ = Pass::Transparent;
    scene(*this, Pass::Transparent);
    glDisable(GL_BLEND);
    glDepthMask(1);
    glEnable(GL_CULL_FACE);
    pass_ = Pass::Opaque;
}

void Renderer::renderFrame(const Camera& cam, const SceneFn& scene, float dt, float time) {
    if (shadows) renderShadows(cam, scene);
    renderScene(cam, scene, hdrFbo_, w_, h_, time, shadows);

    glDisable(GL_DEPTH_TEST);
    glDisable(GL_CULL_FACE);
    glDepthMask(0);

    // --- Eye adaptation ---
    glBindFramebuffer(GL_FRAMEBUFFER, lumFb_.fbo);
    glViewport(0, 0, lumFb_.w, lumFb_.h);
    lum_.use();
    lum_.set("uSrc", 0);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, hdrTex_);
    fullscreen();
    glBindTexture(GL_TEXTURE_2D, lumFb_.tex);
    glGenerateMipmap(GL_TEXTURE_2D);
    int next = 1 - adaptIdx_;
    glBindFramebuffer(GL_FRAMEBUFFER, adaptFb_[next].fbo);
    glViewport(0, 0, 1, 1);
    adapt_.use();
    adapt_.set("uLum", 0);
    adapt_.set("uPrev", 1);
    adapt_.set("uMaxLevel", float(lumLevels_ - 1));
    adapt_.set("uDt", std::min(dt, 0.25f));
    adapt_.set("uFirstFrame", firstAdapt_ ? 1.0f : 0.0f);
    glActiveTexture(GL_TEXTURE0 + 1);
    glBindTexture(GL_TEXTURE_2D, adaptFb_[adaptIdx_].tex);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, lumFb_.tex);
    fullscreen();
    adaptIdx_ = next;
    firstAdapt_ = false;

    // --- Bloom ---
    bloomDown_.use();
    bloomDown_.set("uSrc", 0);
    bloomDown_.set("uThreshold", 60.0f);
    GLuint src = hdrTex_;
    int sw = w_, sh = h_;
    for (size_t i = 0; i < bloom_.size(); ++i) {
        glBindFramebuffer(GL_FRAMEBUFFER, bloom_[i].fbo);
        glViewport(0, 0, bloom_[i].w, bloom_[i].h);
        bloomDown_.set("uTexel", vec2(1.0f / float(sw), 1.0f / float(sh)));
        bloomDown_.set("uFirst", i == 0 ? 1.0f : 0.0f);
        glBindTexture(GL_TEXTURE_2D, src);
        fullscreen();
        src = bloom_[i].tex; sw = bloom_[i].w; sh = bloom_[i].h;
    }
    bloomUp_.use();
    bloomUp_.set("uSrc", 0);
    bloomUp_.set("uRadius", 1.0f);
    glEnable(GL_BLEND);
    glBlendFunc(GL_ONE, GL_ONE);
    for (size_t i = bloom_.size() - 1; i > 0; --i) {
        glBindFramebuffer(GL_FRAMEBUFFER, bloom_[i - 1].fbo);
        glViewport(0, 0, bloom_[i - 1].w, bloom_[i - 1].h);
        bloomUp_.set("uTexel", vec2(1.0f / float(bloom_[i].w), 1.0f / float(bloom_[i].h)));
        glBindTexture(GL_TEXTURE_2D, bloom_[i].tex);
        fullscreen();
    }
    glDisable(GL_BLEND);

    // --- Tonemap to LDR ---
    glBindFramebuffer(GL_FRAMEBUFFER, ldrFb_.fbo);
    glViewport(0, 0, w_, h_);
    tonemap_.use();
    tonemap_.set("uHDR", 0);
    tonemap_.set("uBloom", 1);
    tonemap_.set("uAdapted", 2);
    tonemap_.set("uBloomStrength", bloomStrength);
    tonemap_.set("uExposureBias", exposureBias);
    tonemap_.set("uAutoExposure", autoExposure ? 1.0f : 0.0f);
    tonemap_.set("uManualExposure", 0.12f);
    tonemap_.set("uFade", fade);
    tonemap_.set("uLetterbox", letterbox);
    tonemap_.set("uTime", time);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, hdrTex_);
    glActiveTexture(GL_TEXTURE0 + 1);
    glBindTexture(GL_TEXTURE_2D, bloom_.empty() ? hdrTex_ : bloom_[0].tex);
    glActiveTexture(GL_TEXTURE0 + 2);
    glBindTexture(GL_TEXTURE_2D, adaptFb_[adaptIdx_].tex);
    glActiveTexture(GL_TEXTURE0);
    fullscreen();

    // --- FXAA to screen ---
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glViewport(0, 0, w_, h_);
    fxaa_.use();
    fxaa_.set("uSrc", 0);
    fxaa_.set("uTexel", vec2(1.0f / float(w_), 1.0f / float(h_)));
    glBindTexture(GL_TEXTURE_2D, ldrFb_.tex);
    fullscreen();
    glDepthMask(1);
}

Renderer::Target Renderer::createTarget(int w, int h) {
    Target t;
    t.w = w; t.h = h;
    glGenTextures(1, &t.hdrTex);
    glBindTexture(GL_TEXTURE_2D, t.hdrTex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA16F, w, h, 0, GL_RGBA, GL_HALF_FLOAT, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glGenTextures(1, &t.depthTex);
    glBindTexture(GL_TEXTURE_2D, t.depthTex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT32F, w, h, 0, GL_DEPTH_COMPONENT, GL_FLOAT, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glGenFramebuffers(1, &t.hdrFbo);
    glBindFramebuffer(GL_FRAMEBUFFER, t.hdrFbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, t.hdrTex, 0);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, t.depthTex, 0);
    Fb l = makeColorFb(w, h, GL_RGBA8, GL_RGBA, GL_UNSIGNED_BYTE);
    t.ldrFbo = l.fbo;
    t.ldrTex = l.tex;
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    return t;
}

void Renderer::renderToTarget(const Camera& cam, const SceneFn& scene, Target& t, float time) {
    renderScene(cam, scene, t.hdrFbo, t.w, t.h, time, false);
    glDisable(GL_DEPTH_TEST);
    glDisable(GL_CULL_FACE);
    glBindFramebuffer(GL_FRAMEBUFFER, t.ldrFbo);
    glViewport(0, 0, t.w, t.h);
    cctv_.use();
    cctv_.set("uHDR", 0);
    // Cameras use a fixed exposure per time of day; at night they switch to IR "night vision".
    cctv_.set("uExposure", lerpf(0.35f, 14.0f, night_));
    cctv_.set("uNightVision", night_ > 0.6f ? 1.0f : 0.0f);
    cctv_.set("uTime", time);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, t.hdrTex);
    fullscreen();
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glViewport(0, 0, w_, h_);
}

std::vector<uint8_t> Renderer::readPixels() const {
    std::vector<uint8_t> px(size_t(w_) * size_t(h_) * 3);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glReadPixels(0, 0, w_, h_, GL_RGB, GL_UNSIGNED_BYTE, px.data());
    return px;
}

}  // namespace ps
