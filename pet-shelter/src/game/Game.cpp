#include "game/Game.h"
#include "core/GL.h"
#include "core/Image.h"
#include "core/SaveFile.h"
#include "world/Layout.h"
#include "world/Terrain.h"
#include <GLFW/glfw3.h>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/html5.h>
#endif
#include <imgui.h>
#include <imgui_impl_glfw.h>
#include <imgui_impl_opengl3.h>
#include <algorithm>
#include <cfloat>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <filesystem>

namespace ps {
using namespace layout;

// ---------------------------------------------------------------- GLFW glue
static Game* g_game = nullptr;

#ifdef __EMSCRIPTEN__
// Called from the web page on click: pointer lock may only be requested from a user gesture.
extern "C" EMSCRIPTEN_KEEPALIVE int ps_wants_pointer_lock() { return g_game && g_game->wantsPointerLock() ? 1 : 0; }

// ---- Touch controls (phones). The web page turns finger gestures into these calls. ----
// Backup for browsers that pause requestAnimationFrame in embedded pages: drive frames from a timer.
extern "C" EMSCRIPTEN_KEEPALIVE void ps_use_timer_loop() {
    emscripten_set_main_loop_timing(EM_TIMING_SETTIMEOUT, 16);
    // The pending frame request may never fire: restart the loop so it schedules on the timer now.
    emscripten_pause_main_loop();
    emscripten_resume_main_loop();
}
extern "C" EMSCRIPTEN_KEEPALIVE int ps_touch_state() { return g_game ? g_game->touchState() : 0; }
extern "C" EMSCRIPTEN_KEEPALIVE void ps_touch_move(float x, float y) { if (g_game) g_game->input().touchMove = {x, y}; }
extern "C" EMSCRIPTEN_KEEPALIVE void ps_touch_look(float dx, float dy) { if (g_game) g_game->input().addTouchLook(dx, dy); }
extern "C" EMSCRIPTEN_KEEPALIVE void ps_touch_pan(float dx, float dy) { if (g_game) g_game->input().addTouchPan(dx, dy); }
extern "C" EMSCRIPTEN_KEEPALIVE void ps_touch_twist(float yaw, float pitch) { if (g_game) g_game->input().addTouchTwist(yaw, pitch); }
extern "C" EMSCRIPTEN_KEEPALIVE void ps_key(int key, int down) { if (g_game) g_game->input().onKey(key, down ? GLFW_PRESS : GLFW_RELEASE); }
extern "C" EMSCRIPTEN_KEEPALIVE void ps_pause() { if (g_game) g_game->touchPause(); }
extern "C" EMSCRIPTEN_KEEPALIVE int ps_ui_item_active() { return ImGui::GetCurrentContext() && ImGui::IsAnyItemActive() ? 1 : 0; }
extern "C" EMSCRIPTEN_KEEPALIVE int ps_ui_wants_pointer() { return ImGui::GetCurrentContext() && ImGui::GetIO().WantCaptureMouse ? 1 : 0; }
extern "C" EMSCRIPTEN_KEEPALIVE int ps_name_edit_requested() { return g_game && g_game->takeNameEditRequest() ? 1 : 0; }
extern "C" EMSCRIPTEN_KEEPALIVE const char* ps_get_name() { return g_game ? g_game->playerName().c_str() : ""; }
extern "C" EMSCRIPTEN_KEEPALIVE void ps_set_name(const char* n) { if (g_game && n) g_game->setPlayerName(n); }
#endif
static void keyCb(GLFWwindow*, int key, int, int action, int) { if (g_game) g_game->input().onKey(key, action); }
static void buttonCb(GLFWwindow*, int b, int action, int) { if (g_game) g_game->input().onButton(b, action); }
static void scrollCb(GLFWwindow*, double, double dy) { if (g_game) g_game->input().onScroll(dy); }
static void cursorCb(GLFWwindow*, double x, double y) { if (g_game) g_game->input().onCursor(x, y); }
static void sizeCb(GLFWwindow*, int w, int h) { if (g_game) g_game->onResize(w, h); }

static void applyTheme() {
    ImGuiStyle& s = ImGui::GetStyle();
    ImGui::StyleColorsDark();
    s.WindowRounding = 6.0f;
    s.FrameRounding = 4.0f;
    s.GrabRounding = 4.0f;
    s.WindowPadding = ImVec2(12, 10);
    s.ItemSpacing = ImVec2(8, 6);
    ImVec4* c = s.Colors;
    c[ImGuiCol_WindowBg] = ImVec4(0.08f, 0.09f, 0.10f, 0.92f);
    c[ImGuiCol_Header] = ImVec4(0.22f, 0.35f, 0.28f, 0.8f);
    c[ImGuiCol_HeaderHovered] = ImVec4(0.28f, 0.45f, 0.35f, 0.9f);
    c[ImGuiCol_HeaderActive] = ImVec4(0.3f, 0.5f, 0.38f, 1.0f);
    c[ImGuiCol_Button] = ImVec4(0.20f, 0.28f, 0.24f, 1.0f);
    c[ImGuiCol_ButtonHovered] = ImVec4(0.28f, 0.42f, 0.33f, 1.0f);
    c[ImGuiCol_ButtonActive] = ImVec4(0.32f, 0.5f, 0.38f, 1.0f);
    c[ImGuiCol_FrameBg] = ImVec4(0.15f, 0.17f, 0.18f, 1.0f);
    c[ImGuiCol_SliderGrab] = ImVec4(0.45f, 0.7f, 0.5f, 1.0f);
    c[ImGuiCol_CheckMark] = ImVec4(0.55f, 0.85f, 0.6f, 1.0f);
    c[ImGuiCol_TitleBgActive] = ImVec4(0.15f, 0.25f, 0.2f, 1.0f);
}

bool Game::init(int argc, char** argv) {
    for (int i = 1; i < argc; ++i) {
        std::string a = argv[i];
        if (a == "--screenshots" && i + 1 < argc) screenshotSuiteDir_ = argv[++i];
        else if (a == "--touch") touch_ = true;
        else if (a == "--low") low_ = true;
        else if (a == "--size" && i + 2 < argc) { width_ = std::atoi(argv[++i]); height_ = std::atoi(argv[++i]); }
    }
    // Shader directory: next to the executable, else the source tree
    std::string shaderDir = "shaders";
#ifdef __EMSCRIPTEN__
    shaderDir = "/shaders";   // embedded into the WebAssembly build
    width_ = EM_ASM_INT({ return window.innerWidth; });
    height_ = EM_ASM_INT({ return window.innerHeight; });
#endif
    if (!std::filesystem::exists(shaderDir + "/lit.frag")) {
        std::filesystem::path exe = std::filesystem::path(argv[0]).parent_path() / "shaders";
        if (std::filesystem::exists(exe / "lit.frag")) shaderDir = exe.string();
#ifdef PS_SHADER_DIR
        else shaderDir = PS_SHADER_DIR;
#endif
    }
    Shader::setDirectory(shaderDir);

    if (width_ <= 0 || height_ <= 0) { width_ = 1280; height_ = 720; }
    std::fprintf(stderr, "[startup] 1/8 opening window\n");
    if (!glfwInit()) { std::fprintf(stderr, "glfwInit failed\n"); return false; }
#ifndef __EMSCRIPTEN__
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
#endif
#ifdef __APPLE__
    glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GLFW_TRUE);
#endif
    window_ = glfwCreateWindow(width_, height_, "Untitled Pet Shelter Game", nullptr, nullptr);
    if (!window_) { std::fprintf(stderr, "error: could not create the graphics context (WebGL 2 / OpenGL 3.3)\n"); return false; }
    glfwMakeContextCurrent(window_);
    glfwSwapInterval(vsync_ ? 1 : 0);
    std::fprintf(stderr, "[startup] 2/8 graphics context ready\n");
    if (!loadGL([](const char* n) { return reinterpret_cast<void*>(glfwGetProcAddress(n)); })) return false;
    std::fprintf(stderr, "[gl] %s | %s\n", (const char*)glGetString(GL_RENDERER), (const char*)glGetString(GL_VERSION));

    g_game = this;
    input_.attach(window_);
    glfwSetKeyCallback(window_, keyCb);
    glfwSetMouseButtonCallback(window_, buttonCb);
    glfwSetScrollCallback(window_, scrollCb);
    glfwSetCursorPosCallback(window_, cursorCb);
    glfwSetFramebufferSizeCallback(window_, sizeCb);

    std::fprintf(stderr, "[startup] 3/8 setting up the interface\n");
    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGui::GetIO().IniFilename = nullptr;
    applyTheme();
    if (touch_) {
        // Bigger targets for fingers
        ImGuiStyle& st = ImGui::GetStyle();
        st.ScaleAllSizes(1.25f);
        st.TouchExtraPadding = ImVec2(6, 6);
        st.ScrollbarSize = 22.0f;
        st.GrabMinSize = 22.0f;
        ImGui::GetIO().FontGlobalScale = 1.1f;
        ImGui::GetIO().ConfigInputTrickleEventQueue = true;
        creative_.touchUI = true;
        creatorUI_.touchUI = true;
        computer_.compact = true;
        world_.treeRadius = 1400.0f;
        renderer_.setShadowSize(1024);
        renderer_.bloomStrength = 0.035f;
    }
    ImGui_ImplGlfw_InitForOpenGL(window_, true);   // chains to our callbacks
#ifdef __EMSCRIPTEN__
    ImGui_ImplGlfw_InstallEmscriptenCallbacks(window_, "#canvas");   // browser wheel/scroll for the UI
#endif
#ifdef __EMSCRIPTEN__
    ImGui_ImplOpenGL3_Init("#version 300 es");
#else
    ImGui_ImplOpenGL3_Init("#version 330 core");
#endif

    int fbw, fbh;
    glfwGetFramebufferSize(window_, &fbw, &fbh);
    width_ = fbw; height_ = fbh;
    std::fprintf(stderr, "[startup] 4/8 compiling shaders (%dx%d)\n", width_, height_);
    if (touch_ || low_) Shader::setGlobalDefines("#define LOW_QUALITY 1");
#ifdef __EMSCRIPTEN__
    emscripten_webgl_enable_extension(emscripten_webgl_get_current_context(), "KHR_parallel_shader_compile");
#endif
    renderer_.init(width_, height_);
    renderer_.indoorBox = buildingBounds();
    renderer_.indoorBox.max.y = kCeilingY + 0.2f;
    if (low_) {   // low graphics: no shadows or bloom, coarser terrain, fewer trees
        renderer_.shadows = false;
        renderer_.bloomStrength = 0.0f;
        world_.treeRadius = 700.0f;
    }
    std::fprintf(stderr, "[startup] 5/8 building the world\n");
    world_.build(touch_ || low_ ? 2.0f : 1.0f);
    std::fprintf(stderr, "[startup] 6/8 world built\n");
    computer_.init(renderer_);
    sim_.newGame();
    appearance_.applyPreset(0);
    character_.build(appearance_);
    characterDirty_ = false;
    std::fprintf(stderr, "[startup] 7/8 drawing the first frame\n");
    return true;
}

void Game::onResize(int w, int h) {
    if (w <= 0 || h <= 0) return;
    width_ = w; height_ = h;
    renderer_.resize(w, h);
}

void Game::tick() {
#ifdef __EMSCRIPTEN__
    // Follow the browser window size
    int bw = EM_ASM_INT({ return window.innerWidth; }), bh = EM_ASM_INT({ return window.innerHeight; });
    if (bw != width_ || bh != height_) {
        glfwSetWindowSize(window_, bw, bh);
        onResize(bw, bh);
    }
#endif
    input_.beginFrame();
    glfwPollEvents();
    auto now = std::chrono::steady_clock::now();
    float dt = std::min(0.1f, std::chrono::duration<float>(now - lastTick_).count());
    lastTick_ = now;
    frame(dt);
    glfwSwapBuffers(window_);
#ifdef __EMSCRIPTEN__
    ++framesDrawn_;
    if (framesDrawn_ <= 3) {
        double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - now).count();
        std::fprintf(stderr, "[startup] 8/8 frame %d drawn in %.0f ms\n", framesDrawn_, ms);
    }
    if (framesDrawn_ == 3) EM_ASM({ if (window.psGameReady) window.psGameReady(); });
    // Browsers release the mouse when you press Esc; treat that as "pause".
    bool locked = EM_ASM_INT({ return document.pointerLockElement ? 1 : 0; }) != 0;
    if (browserLocked_ && !locked && state_ == State::Playing && mode_ == Mode::POV) state_ = State::Paused;
    browserLocked_ = locked;
#endif
}

bool Game::wantsPointerLock() const { return !touch_ && state_ == State::Playing && mode_ == Mode::POV; }

int Game::touchState() const {
    switch (state_) {
    case State::Cutscene: return 1;
    case State::Playing: return mode_ == Mode::POV ? 2 : 3;
    default: return 0;   // menus, creator, computer, pause: plain taps
    }
}

void Game::touchPause() {
    if (state_ == State::Playing) state_ = State::Paused;
}

bool Game::takeNameEditRequest() {
    bool r = creatorUI_.nameEditRequested;
    creatorUI_.nameEditRequested = false;
    return r;
}

int Game::run() {
    if (!screenshotSuiteDir_.empty()) return runScreenshotSuite(screenshotSuiteDir_);
    lastTick_ = std::chrono::steady_clock::now();
#ifdef __EMSCRIPTEN__
    emscripten_set_main_loop_arg([](void* g) { static_cast<Game*>(g)->tick(); }, this, 0, true);
#else
    while (!glfwWindowShouldClose(window_)) tick();
#endif
    return 0;
}

void Game::shutdown() {
    ImGui_ImplOpenGL3_Shutdown();
    ImGui_ImplGlfw_Shutdown();
    ImGui::DestroyContext();
    if (window_) glfwDestroyWindow(window_);
    glfwTerminate();
}

void Game::frame(float dt) {
    ImGui_ImplOpenGL3_NewFrame();
    ImGui_ImplGlfw_NewFrame();
    ImGui::NewFrame();
    ImGuiIO& io = ImGui::GetIO();
    input_.uiWantsMouse = io.WantCaptureMouse && !input_.cursorLocked();
    input_.uiWantsKeyboard = io.WantTextInput;
    time_ += dt;
    update(dt);
    drawUI();
    render(dt);
    ImGui::Render();
    ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());
}

// ---------------------------------------------------------------- state flow
void Game::beginNewGame() {
    sim_.newGame();
    toasts_.clear();
    appearance_ = Appearance();
    appearance_.applyPreset(0);
    characterDirty_ = true;
    creatorUI_.previewYaw = 0.0f;
    state_ = State::Creator;
}

void Game::startCutscene() {
    state_ = State::Cutscene;
    cutscene_.start(sim_, world_);
}

void Game::startPlaying() {
    state_ = State::Playing;
    player_.eyeHeight = character_.eyeHeight();
    player_.place(playerSpawnFrontDoor(), kPi, radians(-3.0f));
    world_.facility.doors[0].swing.target = 1.0f;   // the front door is open, come on in
    setMode(Mode::POV);
    showHelp_ = true;
}

void Game::setMode(Mode m) {
    mode_ = m;
    if (m == Mode::Creative) {
        creative_.focusOn(player_.feet);
        creative_.tool = -1;
    }
}

bool Game::saveExists() const { return std::filesystem::exists(savePath_); }

bool Game::saveGame() {
    std::error_code ec;
    std::filesystem::create_directories(std::filesystem::path(savePath_).parent_path(), ec);
    KeyValues kv;
    sim_.save(kv);
    appearance_.save(kv, "player.");
    kv.setv("player.feet", player_.feet);
    kv.setf("player.yaw", player_.yaw);
    kv.seti("player.mode", int(mode_));
    bool ok = kv.write(savePath_);
    message_ = ok ? "Game saved" : "Save failed";
    messageTimer_ = 2.5f;
    return ok;
}

bool Game::loadGame() {
    KeyValues kv;
    if (!kv.read(savePath_)) { message_ = "No save found"; messageTimer_ = 2.5f; return false; }
    sim_.load(kv);
    toasts_.clear();
    appearance_.load(kv, "player.");
    character_.build(appearance_);
    characterDirty_ = false;
    state_ = State::Playing;
    player_.eyeHeight = character_.eyeHeight();
    player_.place(kv.getv("player.feet", playerSpawnFrontDoor()), float(kv.getf("player.yaw", kPi)));
    setMode(Mode(kv.geti("player.mode", 0)));
    message_ = "Game loaded";
    messageTimer_ = 2.5f;
    return true;
}

// ---------------------------------------------------------------- update
void Game::update(float dt) {
    messageTimer_ = std::max(0.0f, messageTimer_ - dt);
    if (input_.pressed(GLFW_KEY_F6)) renderer_.reloadShaders();
    if (input_.pressed(GLFW_KEY_F12)) {
        std::error_code ec;
        std::filesystem::create_directories(screenshotDir_, ec);
        char name[64];
        std::snprintf(name, sizeof name, "/shot_%ld.png", long(std::time(nullptr)));
        takeScreenshot(screenshotDir_ + name);
    }
    if (characterDirty_) { character_.build(appearance_); characterDirty_ = false; }

    bool wantLock = !touch_ && state_ == State::Playing && mode_ == Mode::POV;
    input_.setCursorLocked(wantLock);

    switch (state_) {
    case State::MainMenu:
        renderer_.setTimeOfDay(17.9f);
        break;
    case State::Creator:
        renderer_.setTimeOfDay(10.5f);
        character_.animate(time_, 0.0f, 0.0f);
        break;
    case State::Cutscene:
        if (input_.pressed(GLFW_KEY_SPACE) || input_.pressed(GLFW_KEY_ENTER) || input_.pressed(GLFW_KEY_ESCAPE)) {
            cutscene_.finish(sim_, world_);
            startPlaying();
            break;
        }
        if (!cutscene_.update(dt, sim_, world_, character_)) startPlaying();
        renderer_.setTimeOfDay(sim_.clock.hour());
        break;
    case State::Playing: {
        if (input_.pressed(GLFW_KEY_ESCAPE) && !(mode_ == Mode::Creative && creative_.tool != -1)) { state_ = State::Paused; break; }
        if (input_.pressed(GLFW_KEY_TAB)) setMode(mode_ == Mode::POV ? Mode::Creative : Mode::POV);
        if (input_.pressed(GLFW_KEY_F5)) saveGame();
        if (input_.pressed(GLFW_KEY_F9)) loadGame();
        if (input_.pressed(GLFW_KEY_F1)) showHelp_ = !showHelp_;
        sim_.advance(double(dt) * double(timeScale_));
        if (mode_ == Mode::POV) {
            player_.update(dt, input_, world_.collision, true);
            vec3 eye = player_.eye(), fwd = player_.forward();
            hover_ = world_.facility.pick(eye, fwd, 2.4f, sim_.security);
            float blocked = world_.collision.raycast(eye, fwd, hover_.distance);
            if (hover_.type != Interaction::None && blocked >= 0.0f && blocked < hover_.distance - 0.15f && hover_.type != Interaction::Door)
                hover_ = Interaction();
            if (input_.pressed(GLFW_KEY_E) || input_.mousePressed(GLFW_MOUSE_BUTTON_LEFT)) {
                if (hover_.type == Interaction::Computer) { state_ = State::Computer; computer_.open = true; }
                else if (hover_.type != Interaction::None) world_.facility.interact(hover_, sim_.security);
            }
            character_.animate(time_, player_.walkPhase, player_.walkAmount);
        } else {
            creative_.update(dt, input_, world_, sim_, camera_, width_, height_);
            character_.animate(time_, 0.0f, 0.0f);
        }
        renderer_.setTimeOfDay(sim_.clock.hour());
        break;
    }
    case State::Computer:
        sim_.advance(double(dt) * double(timeScale_));
        if (input_.pressed(GLFW_KEY_ESCAPE)) { state_ = State::Playing; computer_.open = false; }
        renderer_.setTimeOfDay(sim_.clock.hour());
        break;
    case State::Paused:
        if (input_.pressed(GLFW_KEY_ESCAPE)) { state_ = State::Playing; showSettings_ = false; }
        break;
    }
    world_.ghostVisible = world_.ghostVisible && state_ == State::Playing && mode_ == Mode::Creative;
    world_.update(dt, camera_.pos, time_, sim_);

    // New events -> toasts
    while (sim_.eventsSeen < int(sim_.events.size())) {
        toasts_.push_back({sim_.events[size_t(sim_.eventsSeen)].text, 7.0f});
        sim_.eventsSeen++;
    }
}

// ---------------------------------------------------------------- render
void Game::scene(Renderer& r, Pass pass) {
    world_.draw(r, pass, r.nightAmount(), time_);
    if (pass == Pass::Transparent) return;
    bool drawChar = false;
    mat4 root;
    if (state_ == State::Creator) {
        drawChar = true;
        root = mat4::translate({0.0f, 0.03f, 10.2f}) * mat4::rotateY(creatorUI_.previewYaw);
    } else if (state_ == State::Cutscene && cutscene_.showCharacter()) {
        drawChar = true;
        root = cutscene_.characterTransform();
    } else if ((state_ == State::Playing || state_ == State::Paused) && mode_ == Mode::Creative) {
        drawChar = true;
        root = mat4::translate(player_.feet) * mat4::rotateY(player_.yaw);
    } else if (state_ == State::Playing && mode_ == Mode::POV && pass == Pass::Shadow) {
        drawChar = true;   // your own shadow in first person
        root = mat4::translate(player_.feet) * mat4::rotateY(player_.yaw);
    }
    if (drawChar) character_.draw(r, root);
}

void Game::render(float dt) {
    camera_.aspect = float(width_) / float(std::max(1, height_));
    camera_.fovY = radians(fovDeg_);
    switch (state_) {
    case State::MainMenu: {
        // Slow orbit around the facility; the look-at is offset so the building sits right of the menu
        float a = radians(20.0f) + time_ * 0.04f;
        vec3 c{0.0f, 1.5f, 8.0f};
        vec3 pos = c + vec3(std::sin(a) * 52.0f, 16.0f, std::cos(a) * 52.0f);
        vec3 right = normalize(cross(c - pos, vec3(0, 1, 0)));
        camera_.zNear = 0.1f;
        camera_.lookAt(pos, c - right * 14.0f);
        break;
    }
    case State::Creator: {
        float z = creatorUI_.zoom;
        float s = appearance_.height / 1.78f;
        const float gz = 10.2f, gy = 0.03f;
        vec3 target = lerp(vec3(-0.75f, 0.95f * s + gy, gz), vec3(-0.2f, 1.64f * s + gy, gz), z);
        vec3 pos = lerp(vec3(-0.75f, 1.25f * s + gy, gz + 3.7f), vec3(-0.2f, 1.66f * s + gy, gz + 0.9f), z);
        camera_.zNear = 0.05f;
        camera_.fovY = radians(40.0f);
        camera_.lookAt(pos, target);
        break;
    }
    case State::Cutscene:
        camera_.fovY = radians(55.0f);
        cutscene_.applyCamera(camera_);
        break;
    default:
        if (mode_ == Mode::POV) player_.applyCamera(camera_);
        else creative_.applyCamera(camera_);
        break;
    }
    renderer_.lights.clear();
    world_.appendLights(renderer_.lights, renderer_.nightAmount());
    renderer_.fade = state_ == State::Cutscene ? cutscene_.fade() : 1.0f;
    renderer_.letterbox = state_ == State::Cutscene ? 1.0f : 0.0f;
    auto sceneFn = [this](Renderer& r, Pass p) { scene(r, p); };
    computer_.renderFeed(renderer_, sceneFn, sim_, time_);
    renderer_.renderFrame(camera_, sceneFn, dt, time_);
}

// ---------------------------------------------------------------- UI
void Game::drawUI() {
    switch (state_) {
    case State::MainMenu: drawMainMenu(); break;
    case State::Creator: {
        bool changed = false;
        auto r = creatorUI_.draw(appearance_, changed);
        if (changed) characterDirty_ = true;
        if (r == CharacterCreatorUI::Back) state_ = State::MainMenu;
        if (r == CharacterCreatorUI::Start) startCutscene();
        break;
    }
    case State::Cutscene: drawCutsceneOverlay(); break;
    case State::Playing:
        drawHUD();
        if (mode_ == Mode::Creative) creative_.drawUI(sim_, timeScale_);
        break;
    case State::Computer:
        if (!computer_.draw(sim_, world_.facility)) { state_ = State::Playing; computer_.open = false; }
        break;
    case State::Paused:
        drawHUD();
        drawPauseMenu();
        break;
    }
    if (showSettings_) drawSettings();
    if (messageTimer_ > 0.0f) {
        ImGuiIO& io = ImGui::GetIO();
        ImGui::SetNextWindowPos(ImVec2(io.DisplaySize.x * 0.5f, 60), ImGuiCond_Always, ImVec2(0.5f, 0));
        ImGui::Begin("##msg", nullptr, ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_AlwaysAutoResize | ImGuiWindowFlags_NoInputs);
        ImGui::TextUnformatted(message_.c_str());
        ImGui::End();
    }
    if (state_ == State::Playing || state_ == State::Computer) drawToasts(ImGui::GetIO().DeltaTime);
}

void Game::drawMainMenu() {
    ImGuiIO& io = ImGui::GetIO();
    ImGui::SetNextWindowPos(ImVec2(io.DisplaySize.x * 0.06f, io.DisplaySize.y * 0.5f), ImGuiCond_Always, ImVec2(0.0f, 0.5f));
    ImGui::SetNextWindowBgAlpha(0.75f);
    ImGui::Begin("##menu", nullptr, ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_AlwaysAutoResize);
    ImGui::SetWindowFontScale(1.8f);
    ImGui::TextColored(ImVec4(0.95f, 0.85f, 0.6f, 1), "UNTITLED PET SHELTER GAME");
    ImGui::SetWindowFontScale(1.0f);
    ImGui::TextDisabled("(title coming soon)");
    ImGui::Spacing();
    ImVec2 bs(std::min(360.0f, io.DisplaySize.x * 0.42f), 44);
    if (ImGui::Button("New Game", bs)) beginNewGame();
    if (!saveExists()) ImGui::BeginDisabled();
    if (ImGui::Button("Continue", bs)) loadGame();
    if (!saveExists()) ImGui::EndDisabled();
    if (ImGui::Button("Settings", bs)) showSettings_ = !showSettings_;
#ifndef __EMSCRIPTEN__
    if (ImGui::Button("Quit", bs)) glfwSetWindowShouldClose(window_, 1);   // browsers: just close the tab
#endif
    ImGui::End();
}

void Game::drawHUD() {
    ImGuiIO& io = ImGui::GetIO();
    // Status panel (top-left)
    ImGui::SetNextWindowPos(ImVec2(12, 12));
    ImGui::SetNextWindowBgAlpha(0.55f);
    ImGui::Begin("##status", nullptr, ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_AlwaysAutoResize | ImGuiWindowFlags_NoInputs);
    ImGui::Text("%s   %s", sim_.clock.dateString().c_str(), sim_.clock.timeString().c_str());
    ImGui::Text("Cash: $%s", std::to_string((long long)sim_.econ.cash).c_str());
    ImGui::Text("Public %.0f   Private %.0f   Finance %s", sim_.ratings.publicRating, sim_.ratings.privateRating,
                Economy::grade(sim_.financialScore()));
    ImGui::TextColored(mode_ == Mode::POV ? ImVec4(0.6f, 0.85f, 1.0f, 1) : ImVec4(0.6f, 0.95f, 0.6f, 1), "%s",
                       mode_ == Mode::POV ? "POV MODE  (Tab: Creative)" : "CREATIVE MODE  (Tab: POV)");
    if (mode_ == Mode::POV) {
        const RoomSpec* room = roomAt(player_.feet.x, player_.feet.z);
        ImGui::TextDisabled("%s", room && player_.feet.y > 0.2f ? room->name.c_str() : "Outside");
    }
    ImGui::End();

    if (mode_ == Mode::POV && state_ == State::Playing) {
        ImDrawList* dl = ImGui::GetForegroundDrawList();
        ImVec2 c(io.DisplaySize.x * 0.5f, io.DisplaySize.y * 0.5f);
        dl->AddCircleFilled(c, hover_.type != Interaction::None ? 4.0f : 2.5f, IM_COL32(255, 255, 255, 200));
        if (hover_.type != Interaction::None) {
            std::string txt = "[E]  " + hover_.prompt;
            ImVec2 sz = ImGui::CalcTextSize(txt.c_str());
            ImVec2 p(c.x - sz.x * 0.5f, c.y + 40);
            dl->AddRectFilled(ImVec2(p.x - 10, p.y - 6), ImVec2(p.x + sz.x + 10, p.y + sz.y + 6), IM_COL32(0, 0, 0, 150), 4.0f);
            dl->AddText(p, IM_COL32(255, 255, 255, 255), txt.c_str());
        }
        if (showHelp_ && !touch_) {
            ImGui::SetNextWindowPos(ImVec2(io.DisplaySize.x - 12, io.DisplaySize.y - 12), ImGuiCond_Always, ImVec2(1, 1));
            ImGui::SetNextWindowBgAlpha(0.45f);
            ImGui::Begin("##help", nullptr, ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_AlwaysAutoResize | ImGuiWindowFlags_NoInputs);
            ImGui::TextDisabled("WASD move | Shift sprint | E interact | Tab creative mode");
            ImGui::TextDisabled("Esc pause | F5 save | F9 load | F12 screenshot | F1 hide help");
            ImGui::End();
        }
    }
}

void Game::drawToasts(float dt) {
    ImGuiIO& io = ImGui::GetIO();
    float y = 12.0f;
    int i = 0;
    for (auto it = toasts_.begin(); it != toasts_.end() && i < 4; ++it, ++i) {
        it->t -= dt;
        ImGui::SetNextWindowPos(ImVec2(io.DisplaySize.x - 12, y), ImGuiCond_Always, ImVec2(1, 0));
        ImGui::SetNextWindowBgAlpha(0.7f * saturate(it->t));
        std::string id = "##toast" + std::to_string(i);
        ImGui::Begin(id.c_str(), nullptr, ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_AlwaysAutoResize | ImGuiWindowFlags_NoInputs);
        ImGui::PushTextWrapPos(380);
        ImGui::TextUnformatted(it->text.c_str());
        ImGui::PopTextWrapPos();
        y += ImGui::GetWindowHeight() + 6;
        ImGui::End();
    }
    while (!toasts_.empty() && toasts_.front().t <= 0.0f) toasts_.pop_front();
}

void Game::drawPauseMenu() {
    ImGuiIO& io = ImGui::GetIO();
    ImGui::SetNextWindowPos(ImVec2(io.DisplaySize.x * 0.5f, io.DisplaySize.y * 0.5f), ImGuiCond_Always, ImVec2(0.5f, 0.5f));
    ImGui::Begin("Paused", nullptr, ImGuiWindowFlags_NoMove | ImGuiWindowFlags_AlwaysAutoResize | ImGuiWindowFlags_NoCollapse);
    ImVec2 bs(300, 38);
    if (ImGui::Button("Resume", bs)) { state_ = State::Playing; showSettings_ = false; }
    if (ImGui::Button("Save game", bs)) saveGame();
    if (!saveExists()) ImGui::BeginDisabled();
    if (ImGui::Button("Load game", bs)) loadGame();
    if (!saveExists()) ImGui::EndDisabled();
    if (ImGui::Button("Settings", bs)) showSettings_ = !showSettings_;
    if (ImGui::Button("Quit to main menu", bs)) { state_ = State::MainMenu; showSettings_ = false; }
#ifndef __EMSCRIPTEN__
    if (ImGui::Button("Quit game", bs)) glfwSetWindowShouldClose(window_, 1);
#endif
    ImGui::End();
}

void Game::drawSettings() {
    ImGui::SetNextWindowSize(ImVec2(420, 0), ImGuiCond_Appearing);
    ImGui::Begin("Settings", &showSettings_, ImGuiWindowFlags_AlwaysAutoResize);
    ImGui::SeparatorText("Graphics (HDR)");
    ImGui::Checkbox("Auto exposure (eye adaptation)", &renderer_.autoExposure);
    ImGui::SliderFloat("Exposure bias (stops)", &renderer_.exposureBias, -3.0f, 3.0f, "%.1f");
    ImGui::SliderFloat("Bloom", &renderer_.bloomStrength, 0.0f, 0.2f, "%.3f");
    ImGui::Checkbox("Shadows", &renderer_.shadows);
    if (ImGui::Checkbox("V-Sync", &vsync_)) glfwSwapInterval(vsync_ ? 1 : 0);
    ImGui::SliderFloat("Field of view", &fovDeg_, 55.0f, 100.0f, "%.0f");
    ImGui::SeparatorText("Controls");
    ImGui::SliderFloat("Mouse sensitivity", &player_.mouseSensitivity, 0.0005f, 0.006f, "%.4f");
    ImGui::Checkbox("Invert Y", &player_.invertY);
    ImGui::SeparatorText("Game");
    ImGui::SliderFloat("Time speed (game min / sec)", &timeScale_, 0.0f, 20.0f, "%.1f");
    ImGui::TextDisabled("F6 reloads shaders from disk.");
    ImGui::End();
}

void Game::drawCutsceneOverlay() {
    ImGuiIO& io = ImGui::GetIO();
    ImDrawList* dl = ImGui::GetForegroundDrawList();
    float a = cutscene_.fade();
    std::string title = cutscene_.title();
    if (!title.empty()) {
        float scale = 2.4f;
        ImFont* f = ImGui::GetFont();
        float fs = ImGui::GetFontSize() * scale;
        ImVec2 sz = f->CalcTextSizeA(fs, FLT_MAX, 0.0f, title.c_str());
        dl->AddText(f, fs, ImVec2((io.DisplaySize.x - sz.x) * 0.5f, io.DisplaySize.y * 0.2f), IM_COL32(245, 225, 170, int(230 * a)), title.c_str());
    }
    std::string sub = cutscene_.subtitle();
    if (!sub.empty()) {
        float fs = ImGui::GetFontSize() * 1.35f;
        ImFont* f = ImGui::GetFont();
        ImVec2 sz = f->CalcTextSizeA(fs, FLT_MAX, 0.0f, sub.c_str());
        ImVec2 p((io.DisplaySize.x - sz.x) * 0.5f, io.DisplaySize.y * 0.9f - sz.y * 0.5f);
        dl->AddText(f, fs, ImVec2(p.x + 2, p.y + 2), IM_COL32(0, 0, 0, int(200 * a)), sub.c_str());
        dl->AddText(f, fs, p, IM_COL32(255, 255, 255, int(255 * a)), sub.c_str());
    }
    if (touch_) return;   // phones get a Skip button from the page
    const char* skip = "Space: skip";
    ImVec2 sz = ImGui::CalcTextSize(skip);
    dl->AddText(ImVec2(io.DisplaySize.x - sz.x - 16, io.DisplaySize.y * 0.12f * 0.5f), IM_COL32(200, 200, 200, 160), skip);
}

// ---------------------------------------------------------------- screenshots
void Game::takeScreenshot(const std::string& path) {
    auto px = renderer_.readPixels();
    if (writePNG(path, width_, height_, px)) std::fprintf(stderr, "[shot] %s\n", path.c_str());
    if (screenshotSuiteDir_.empty()) {
        message_ = "Screenshot saved: " + path;
        messageTimer_ = 2.0f;
    }
}

// Renders a fixed set of scenes to PNG files and exits (for checking visuals without playing).
int Game::runScreenshotSuite(const std::string& dir) {
    std::error_code ec;
    std::filesystem::create_directories(dir, ec);
    auto shoot = [&](const std::string& name, int frames = 3, float dt = 1.0f / 30.0f) {
        renderer_.resetAdaptation();
        for (int i = 0; i < frames; ++i) {
            input_.beginFrame();
            glfwPollEvents();
            frame(dt);
            if (i == frames - 1) takeScreenshot(dir + "/" + name + ".png");
            glfwSwapBuffers(window_);
        }
    };
    auto pov = [&](const std::string& name, vec3 feet, float yawDeg, float pitchDeg, float hour) {
        state_ = State::Playing;
        setMode(Mode::POV);
        showHelp_ = false;
        timeScale_ = 0.0f;
        sim_.clock.minutes = double(hour) * 60.0;
        player_.place(feet, radians(yawDeg), radians(pitchDeg));
        shoot(name);
    };

    state_ = State::MainMenu;
    shoot("01_main_menu");
    beginNewGame();
    shoot("02_creator_male");
    appearance_.gender = Gender::Female;
    appearance_.applyPreset(1);
    characterDirty_ = true;
    creatorUI_.previewYaw = radians(25.0f);
    shoot("03_creator_female");
    creatorUI_.zoom = 1.0f;
    appearance_.hairStyle = 7;
    characterDirty_ = true;
    shoot("04_creator_face");
    creatorUI_.zoom = 0.0f;
    startCutscene();
    const float cut[] = {3.0f, 8.0f, 10.5f, 14.0f, 18.0f};
    for (float t : cut) {
        // advance cutscene time in one step, then render
        cutscene_.update(t - cutscene_.t, sim_, world_, character_);
        world_.update(0.0f, camera_.pos, time_, sim_);
        world_.facility.gate.value = world_.facility.gate.target;   // skip the gate animation for stills
        char nm[48];
        std::snprintf(nm, sizeof nm, "05_cutscene_%04.1fs", t);
        shoot(nm, 2, 0.0f);
    }
    cutscene_.finish(sim_, world_);
    startPlaying();
    for (auto& d : world_.facility.doors) d.swing.value = d.swing.target = 1.0f;
    world_.update(0.0f, camera_.pos, time_, sim_);
    for (size_t i = 0; i < world_.facility.doors.size(); ++i) {   // settle door colliders
        auto& d = world_.facility.doors[i];
        d.swing.value = 0.999f;
    }
    world_.update(0.1f, camera_.pos, time_, sim_);
    pov("06_pov_front_of_building", {0.0f, 0.0f, 14.0f}, 180.0f, 2.0f, 10.0f);
    pov("07_pov_waiting_room", {0.0f, kFloorY, 5.0f}, 180.0f, -6.0f, 10.0f);
    pov("08_pov_left_hallway", {-4.6f, kFloorY, 0.8f}, 270.0f, -4.0f, 10.0f);
    pov("09_pov_office", {-8.0f, kFloorY, 2.4f}, 0.0f, -18.0f, 10.0f);
    pov("10_pov_medical_room", {7.6f, kFloorY, -0.5f}, 135.0f, -14.0f, 10.0f);
    pov("11_pov_appointment_room", {5.0f, kFloorY, 2.2f}, 50.0f, -10.0f, 10.0f);
    pov("12_pov_bathroom", {-6.0f, kFloorY, -0.6f}, 190.0f, -15.0f, 10.0f);
    pov("13_pov_gate", {-2.0f, 0.0f, kSouthEdge - 14.0f}, 10.0f, 0.0f, 16.5f);
    pov("14_pov_night_exterior", {6.0f, 0.0f, 30.0f}, 200.0f, 2.0f, 21.5f);

    // Creative mode
    state_ = State::Playing;
    player_.place({0.0f, 0.0f, 12.0f}, kPi);
    setMode(Mode::Creative);
    sim_.clock.minutes = 11.0 * 60.0;
    std::string why;
    sim_.build(BuildKind::KennelBlock, 40.0f, -20.0f, 0, &why);
    sim_.build(BuildKind::DogRun, 40.0f, 5.0f, 0, &why);
    sim_.build(BuildKind::CatHouse, -40.0f, -18.0f, 0, &why);
    sim_.build(BuildKind::SecurityCamera, 28.0f, 30.0f, 0, &why);
    for (int i = 0; i < 6; ++i) sim_.build(BuildKind::Path, 22.0f + 2.0f * float(i), 0.0f, 1, &why);
    creative_.target = {10.0f, 0.0f, 10.0f};
    creative_.distance = 110.0f;
    creative_.tool = int(BuildKind::StaffBuilding);
    shoot("15_creative_mode");
    creative_.tool = -1;
    creative_.target = {0.0f, 0.0f, -2000.0f};
    creative_.distance = 9000.0f;
    creative_.pitch = radians(-25.0f);
    shoot("16_creative_whole_property");

    // Office computer
    setMode(Mode::POV);
    sim_.advance(3 * 1440.0);
    state_ = State::Computer;
    computer_.open = true;
    computer_.tab = ComputerUI::TabFinances;
    shoot("17_computer_finances");
    computer_.tab = ComputerUI::TabSecurity;
    computer_.selectedCamera = 0;
    shoot("18_computer_security");
    computer_.tab = ComputerUI::TabRatings;
    shoot("19_computer_ratings");
    computer_.tab = ComputerUI::TabAnimals;
    shoot("20_computer_animals");
    return 0;
}

}  // namespace ps
