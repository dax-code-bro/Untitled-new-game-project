/* my_cpp_game -- engine initialisation and the master loop.
 *
 *   my_cpp_game                                   windowed, interactive
 *   my_cpp_game --width 3840 --height 2160 --texture-res 4096 --screenshot out.png
 *                                                 offscreen 4K, save, exit
 *   my_cpp_game --width 7680 --height 4320 --quality cinematic --screenshot 8k.png
 *
 * Every frame renders into offscreen targets at the requested size, never
 * straight into the window. That is what lets a capture be any resolution
 * -- 4K or 8K -- regardless of the monitor, and it is the same path either
 * way, so a screenshot is a picture of exactly what the game draws rather
 * than of a special capture mode.
 *
 * Controls (windowed): WASD / QE move, hold right mouse to look, Shift is
 * fast, 1-6 jump to the named shots, F12 saves a screenshot, Esc quits.
 * Shaders and scripts/look.ini hot-reload on save. --fullscreen runs at the
 * monitor's own resolution.
 *
 * --play on a zombies map (bunker-nine, coastline) is the game instead of
 * the fly camera: WASD move, mouse look, left button fire, right button
 * aim, R reload, Space jump, Shift sprint, 1-3 or the wheel to change gun,
 * Enter to go again when you are down, Esc to pause (Q quits from there).
 * src/game/Zombies.hpp says what is and is not in it. */
#include "core/Args.hpp"
#include "core/Capture.hpp"
#include "core/GlDebug.hpp"
#include "core/Paths.hpp"
#include "core/Window.hpp"
#include "rendering/Material.hpp"
#include "rendering/Renderer.hpp"
#include "rendering/ShaderLibrary.hpp"
#include "rendering/Tunables.hpp"
#include <fstream>
#include "scene/SceneFile.hpp"
#include "scene/Showcase.hpp"
#include "game/Hud.hpp"
#include "game/Kit.hpp"
#include "game/Lesc.hpp"
#include "game/Zombies.hpp"

#include <glad/gl.h>
#include <GLFW/glfw3.h>
#include <glm/glm.hpp>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <exception>
#include <filesystem>
#include <memory>

namespace {

constexpr double kFixedStep = 1.0 / 60.0;   // the sim step the JS engine uses

void applyDisables(game::rendering::Renderer& r, const std::vector<std::string>& off) {
    auto& s = r.stages;
    for (const auto& n : off) {
        if      (n == "shadows")    s.shadows = false;
        else if (n == "env")        s.env = false;
        else if (n == "ssao")       s.ssao = false;
        else if (n == "contact")    s.contact = false;
        else if (n == "ssr")        s.ssr = false;
        else if (n == "volumetric") s.volumetric = false;
        else if (n == "bloom")      s.bloom = false;
        else if (n == "fxaa")       s.fxaa = false;
        else if (n == "textures")   s.textures = false;
        else if (n == "taa")        s.taa = false;
        else if (n == "post")       { s.ssao = s.contact = s.ssr = s.volumetric = s.bloom = s.fxaa = s.taa = false; }
        else if (n == "grade")      { r.post.vignette = 0; r.post.chromatic = 0; r.post.grain = 0;
                                      r.post.saturation = 1; r.post.contrast = 1; }
        else throw std::invalid_argument("--disable: unknown pass '" + n + "'");
    }
}

/* A free-fly camera over the scene's named shot. */
struct FlyCamera {
    glm::vec3 pos{0.0f};
    float yaw = 0.0f, pitch = 0.0f;

    void lookFrom(const game::rendering::Camera& c) {
        pos = c.position;
        const glm::vec3 d = glm::normalize(c.target - c.position);
        yaw = std::atan2(d.x, -d.z);
        pitch = std::asin(std::clamp(d.y, -1.0f, 1.0f));
    }
    glm::vec3 forward() const {
        return {std::sin(yaw) * std::cos(pitch), std::sin(pitch), -std::cos(yaw) * std::cos(pitch)};
    }
};

double g_scroll = 0.0;   // mouse wheel since the last frame (GLFW delivers it by callback)

} // namespace

int main(int argc, char** argv) try {
    game::core::Args args = game::core::parseArgs(argc, argv);

    auto window = std::make_unique<game::core::Window>(
        args.hidden ? 64 : args.width, args.hidden ? 64 : args.height, "my_cpp_game", !args.hidden,
        args.fullscreen);
    std::printf("GL %d.%d core | %s | %s\n", window->glMajor(), window->glMinor(),
                glGetString(GL_RENDERER), glGetString(GL_VERSION));
    if (args.glDebug) game::core::installGlDebug();

    const std::filesystem::path root = game::core::dataRoot();
    game::rendering::ShaderLibrary shaders(root / "shaders");
    game::rendering::Quality quality = game::rendering::Quality::byName(args.quality);
    quality.renderScale = args.scale;
    game::rendering::Renderer renderer(shaders, quality);
    /* Offscreen captures render at exactly --width x --height. A window
       renders at its own framebuffer size and follows it when resized, so
       fullscreen on a 4K monitor is a 4K frame. */
    if (args.hidden) renderer.resize(args.width, args.height);
    else renderer.resize(window->width(), window->height());
    renderer.debugMode = args.debugMode;

    const bool taaActive = quality.taa &&
        std::find(args.disable.begin(), args.disable.end(), "taa") == args.disable.end() &&
        std::find(args.disable.begin(), args.disable.end(), "post") == args.disable.end();
    game::rendering::MaterialLibrary materials(args.textureRes, 16.0f, taaActive ? -1.0f : 0.0f);
    const auto t0 = std::chrono::steady_clock::now();
    /* Two kinds of scene: the built-in showcase, or a map exported from the
       web game (tools/export_scene.js writes a .lescene). */
    std::unique_ptr<game::scene::Showcase> showcase;
    std::unique_ptr<game::scene::SceneFile> sceneFile;
    if (args.scene == "showcase") {
        showcase = std::make_unique<game::scene::Showcase>(materials, renderer, args.grass);
    } else {
        sceneFile = std::make_unique<game::scene::SceneFile>(args.scene, materials, renderer);
        const auto& st = sceneFile->stats();
        std::printf("imported %s: %zu meshes (%zu verts, %zu tris, %zu triangles rewound), %zu primitives re-tessellated, %zu materials, "
                    "%zu draws (%zu skinned), %zu instances, %zu lights\n", args.scene.c_str(), st.meshes, st.vertices,
                    st.triangles, st.rewound, st.retessellated, st.materials, st.draws, st.skinned, st.instances, st.lights);
        std::printf("look-dev: %zu leaf crowns, %zu albedos capped, %zu draws weathered, %zu scattered, "
                    "%zu roofs pitched, %zu flat roofs dressed, %zu windows, %zu trimmed, %zu wall fittings, %zu lawn tufts, "
                    "%zu trunks\n", st.foliage, st.albedoCapped, st.weathered, st.scattered, st.roofs, st.flatRoofs,
                    st.windows, st.trim, st.fittings, st.lawnTufts, st.trunks);
    }
    const std::vector<game::rendering::DrawItem>& items = showcase ? showcase->items() : sceneFile->items();
    auto shotCamera = [&](const std::string& name) {
        return showcase ? showcase->shot(name) : sceneFile->camera();
    };
    applyDisables(renderer, args.disable);
    /* The look file is applied over the scene's own settings and then
       watched; --set wins over both. */
    game::rendering::TunableFile look(args.look.empty()
        ? root / "scripts" / "look.ini" : std::filesystem::path(args.look));
    look.reloadIfChanged(renderer);
    auto applySets = [&] {
        for (const auto& kv : args.sets) {
            const auto eq = kv.find('=');
            std::string err;
            if (eq == std::string::npos || !game::rendering::setTunable(renderer, kv.substr(0, eq), kv.substr(eq + 1), &err))
                throw std::invalid_argument("--set " + kv + ": " + (err.empty() ? "expected key=value" : err));
        }
    };
    applySets();
    std::printf("scene built in %.2f s: %zu draws, %zu recipes at %d px (bake %.2f s), internal %dx%d\n",
                std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count(),
                items.size(), materials.recipeCount(), materials.textureSize(),
                materials.bakeSeconds(), renderer.internalWidth(), renderer.internalHeight());

    game::rendering::Camera camera = shotCamera(args.shot);
    auto parse3 = [](const std::string& v) {
        glm::vec3 r(0.0f);
        if (std::sscanf(v.c_str(), "%f,%f,%f", &r.x, &r.y, &r.z) != 3)
            throw std::invalid_argument("expected x,y,z, got '" + v + "'");
        return r;
    };
    if (!args.eye.empty()) camera.position = parse3(args.eye);
    if (!args.target.empty()) camera.target = parse3(args.target);
    if (args.fov > 0.0f) camera.fov = glm::radians(args.fov);
    struct ListedShot { std::string name; glm::vec3 eye, target; float fov; };
    std::vector<ListedShot> listed;
    size_t listedAt = 0;
    if (!args.shotList.empty()) {
        std::ifstream in(args.shotList);
        if (!in) throw std::runtime_error("cannot open shot list " + args.shotList);
        std::string line;
        while (std::getline(in, line)) {
            if (line.empty() || line[0] == '#') continue;
            char nm[256], e[128], t[128];
            float fv = 40.0f;
            if (std::sscanf(line.c_str(), "%255s %127s %127s %f", nm, e, t, &fv) < 3) continue;
            listed.push_back({nm, parse3(e), parse3(t), fv});
        }
        if (listed.empty()) throw std::runtime_error("no shots in " + args.shotList);
        if (args.frames <= 0) args.frames = 8;
        std::filesystem::create_directories(args.shotDir);
        camera.position = listed[0].eye;
        camera.target = listed[0].target;
        camera.fov = glm::radians(listed[0].fov);
    }
    FlyCamera fly;
    fly.lookFrom(camera);

    /* ---- the game (--play) ---- */
    std::unique_ptr<game::play::KitFile> kit;
    std::unique_ptr<game::play::ZombiesGame> zgame;
    std::unique_ptr<game::play::Hud> hud;
    std::vector<game::rendering::PointLight> baseLights;
    std::vector<game::rendering::DrawItem> frameItems;
    if (args.play) {
        if (!sceneFile) throw std::invalid_argument("--play needs --scene <zombies map>.lescene");
        const std::filesystem::path kp = args.kit.empty()
            ? std::filesystem::path(args.scene).parent_path() / "kit.lekit" : std::filesystem::path(args.kit);
        const auto k0 = std::chrono::steady_clock::now();
        kit = std::make_unique<game::play::KitFile>(kp, materials);
        {
            const game::play::Lesc map(args.scene);
            zgame = std::make_unique<game::play::ZombiesGame>(map, *kit, camera, args.seed);
        }
        hud = std::make_unique<game::play::Hud>(shaders);
        baseLights = renderer.lights;
        /* No TAA in play. Its history is reprojected as if everything were
           fixed in the world, and the gun in your hands moves with the
           camera: turning smears it. FXAA, which is per frame, stays on. */
        renderer.stages.taa = false;
        std::printf("play: %zu collision hulls, %zu nav nodes, %zu zombie bodies, %zu bone-palette frames (%.2f s)\n",
                    zgame->hulls(), zgame->navNodes(), kit->zombies().size(), kit->paletteTextures(),
                    std::chrono::duration<double>(std::chrono::steady_clock::now() - k0).count());
        if (args.simSeconds > 0.0f) {
            const int steps = static_cast<int>(args.simSeconds / kFixedStep);
            for (int s = 0; s < steps; ++s) zgame->update(static_cast<float>(kFixedStep), zgame->autopilot(static_cast<float>(kFixedStep)));
            const auto& st = zgame->stats();
            std::printf("sim %.0f s: round %d, %d spawned, %d climbed in, %d alive (max %d), %d kills (%d headshots), "
                        "%d shots %d hits, %d points, %d downs, health %.0f\n", args.simSeconds, st.round, st.spawned,
                        st.climbed, st.alive, st.maxAlive, st.kills, st.headshots, st.shots, st.hits, st.points,
                        st.downs, st.health);
        }
        if (!args.hidden) {
            glfwSetInputMode(window->handle(), GLFW_CURSOR, GLFW_CURSOR_DISABLED);
            if (glfwRawMouseMotionSupported()) glfwSetInputMode(window->handle(), GLFW_RAW_MOUSE_MOTION, GLFW_TRUE);
            glfwSetScrollCallback(window->handle(), [](GLFWwindow*, double, double y) { g_scroll += y; });
        }
    }
    bool paused = false, prevEsc = false, prevEnter = false, prevR = false, prevSpace = false, prevLmb = false;
    bool pendFire = false, pendReload = false, pendJump = false, pendRestart = false;
    int pendSlot = -1, pendCycle = 0;
    double lookX = 0.0, lookY = 0.0;
    bool mouseInit = false;

    using clock = std::chrono::steady_clock;
    auto   previous    = clock::now();
    double accumulator = 0.0;
    int    frame       = 0;
    double gpuMsSum    = 0.0;
    double lastX = 0.0, lastY = 0.0;
    bool   looking = false;

    while (!window->shouldClose()) {
        const auto now = clock::now();
        double dt = std::chrono::duration<double>(now - previous).count();
        previous = now;
        if (dt > 0.20) dt = 0.20;      // same clamp as the JS loop
        if (args.frames > 0) dt = kFixedStep;   // captures are deterministic
        accumulator += dt;
        window->pollEvents();
        if (shaders.reloadChanged()) std::printf("shaders reloaded\n");
        if (frame > 0 && look.reloadIfChanged(renderer)) { applySets(); std::printf("look reloaded\n"); }

        game::play::Input playIn;
        if (zgame && !args.hidden) {
            GLFWwindow* w = window->handle();
            if (window->width() > 0 && window->height() > 0) renderer.resize(window->width(), window->height());
            const bool esc = glfwGetKey(w, GLFW_KEY_ESCAPE) == GLFW_PRESS;
            if (esc && !prevEsc) {
                paused = !paused;
                glfwSetInputMode(w, GLFW_CURSOR, paused ? GLFW_CURSOR_NORMAL : GLFW_CURSOR_DISABLED);
                mouseInit = false;
            }
            prevEsc = esc;
            if (paused) {
                if (glfwGetKey(w, GLFW_KEY_Q)) window->close();
                if (glfwGetMouseButton(w, GLFW_MOUSE_BUTTON_LEFT)) {
                    paused = false;
                    glfwSetInputMode(w, GLFW_CURSOR, GLFW_CURSOR_DISABLED);
                    mouseInit = false;
                    prevLmb = true;
                }
            } else {
                double mx = 0, my = 0;
                glfwGetCursorPos(w, &mx, &my);
                if (mouseInit) { lookX += (mx - lastX) * 0.0022; lookY -= (my - lastY) * 0.0022; }
                mouseInit = true;
                lastX = mx; lastY = my;
                const bool lmb = glfwGetMouseButton(w, GLFW_MOUSE_BUTTON_LEFT) == GLFW_PRESS;
                if (lmb && !prevLmb) pendFire = true;
                prevLmb = lmb;
                const bool r = glfwGetKey(w, GLFW_KEY_R) == GLFW_PRESS, sp = glfwGetKey(w, GLFW_KEY_SPACE) == GLFW_PRESS;
                const bool en = glfwGetKey(w, GLFW_KEY_ENTER) == GLFW_PRESS;
                if (r && !prevR) pendReload = true;
                if (sp && !prevSpace) pendJump = true;
                if (en && !prevEnter) pendRestart = true;
                prevR = r; prevSpace = sp; prevEnter = en;
                for (int k = 0; k < 3; ++k) if (glfwGetKey(w, GLFW_KEY_1 + k)) pendSlot = k;
                if (g_scroll > 0.5) { pendCycle = -1; g_scroll = 0; } else if (g_scroll < -0.5) { pendCycle = 1; g_scroll = 0; }
                playIn.move = {static_cast<float>((glfwGetKey(w, GLFW_KEY_D) ? 1 : 0) - (glfwGetKey(w, GLFW_KEY_A) ? 1 : 0)),
                               static_cast<float>((glfwGetKey(w, GLFW_KEY_W) ? 1 : 0) - (glfwGetKey(w, GLFW_KEY_S) ? 1 : 0))};
                playIn.fire = lmb;
                playIn.aim = glfwGetMouseButton(w, GLFW_MOUSE_BUTTON_RIGHT) == GLFW_PRESS;
                playIn.sprint = glfwGetKey(w, GLFW_KEY_LEFT_SHIFT) == GLFW_PRESS;
            }
        }
        if (zgame) {
            // The fixed-step sim. One-shot presses go to the first step that runs; the look is spread over them.
            int steps = 0;
            for (double a = accumulator; a >= kFixedStep; a -= kFixedStep) ++steps;
            while (accumulator >= kFixedStep) {
                accumulator -= kFixedStep;
                if (paused) continue;
                game::play::Input in = args.autoplay ? zgame->autopilot(static_cast<float>(kFixedStep)) : playIn;
                if (!args.autoplay) {
                    in.look = {static_cast<float>(lookX / steps), static_cast<float>(lookY / steps)};
                    in.firePressed = pendFire; in.reloadPressed = pendReload; in.jumpPressed = pendJump;
                    in.restartPressed = pendRestart; in.weaponSlot = pendSlot; in.weaponCycle = pendCycle;
                    pendFire = pendReload = pendJump = pendRestart = false;
                    pendSlot = -1; pendCycle = 0;
                }
                zgame->update(static_cast<float>(kFixedStep), in);
            }
            if (steps > 0) lookX = lookY = 0.0;
            frameItems = items;
            renderer.lights = baseLights;
            zgame->frame(camera, frameItems, renderer.lights);
        }

        if (!args.hidden && !zgame) {
            GLFWwindow* w = window->handle();
            if (glfwGetKey(w, GLFW_KEY_ESCAPE)) window->close();
            if (window->width() > 0 && window->height() > 0)
                renderer.resize(window->width(), window->height());
            const float speed = static_cast<float>(dt) * (glfwGetKey(w, GLFW_KEY_LEFT_SHIFT) ? 12.0f : 3.5f);
            const glm::vec3 f = fly.forward();
            const glm::vec3 r = glm::normalize(glm::cross(f, glm::vec3(0, 1, 0)));
            if (glfwGetKey(w, GLFW_KEY_W)) fly.pos += f * speed;
            if (glfwGetKey(w, GLFW_KEY_S)) fly.pos -= f * speed;
            if (glfwGetKey(w, GLFW_KEY_D)) fly.pos += r * speed;
            if (glfwGetKey(w, GLFW_KEY_A)) fly.pos -= r * speed;
            if (glfwGetKey(w, GLFW_KEY_E)) fly.pos.y += speed;
            if (glfwGetKey(w, GLFW_KEY_Q)) fly.pos.y -= speed;
            const auto names = game::scene::Showcase::shotNames();
            for (int k = 0; k < static_cast<int>(names.size()) && k < 9; ++k)
                if (glfwGetKey(w, GLFW_KEY_1 + k)) fly.lookFrom(shotCamera(names[static_cast<size_t>(k)]));
            double mx = 0, my = 0;
            glfwGetCursorPos(w, &mx, &my);
            if (glfwGetMouseButton(w, GLFW_MOUSE_BUTTON_RIGHT)) {
                if (looking) {
                    fly.yaw += static_cast<float>(mx - lastX) * 0.0025f;
                    fly.pitch = std::clamp(fly.pitch - static_cast<float>(my - lastY) * 0.0025f, -1.5f, 1.5f);
                }
                looking = true;
            } else {
                looking = false;
            }
            lastX = mx; lastY = my;
            camera.position = fly.pos;
            camera.target = fly.pos + fly.forward();
        }

        while (accumulator >= kFixedStep) accumulator -= kFixedStep;   // the fly camera has no sim

        if (args.orbit != 0.0f) {
            // Swing the eye round the target about the vertical axis.
            const float a = glm::radians(args.orbit);
            const glm::vec3 o = camera.position - camera.target;
            camera.position = camera.target + glm::vec3(o.x * std::cos(a) - o.z * std::sin(a), o.y,
                                                        o.x * std::sin(a) + o.z * std::cos(a));
        }

        const auto g0 = clock::now();
        renderer.render(zgame ? frameItems : items, camera, static_cast<float>(dt));
        const auto& out = renderer.output();
        if (zgame) {
            hud->begin(out.width(), out.height());
            zgame->hud(*hud);
            if (paused) {
                const float W = static_cast<float>(out.width()), H = static_cast<float>(out.height()), u = std::max(1.0f, H / 540.0f);
                hud->rect(0, 0, W, H, {0.0f, 0.0f, 0.0f, 0.55f});
                hud->text("PAUSED", W * 0.5f, H * 0.38f, 6.0f * u, {0.93f, 0.86f, 0.72f, 1.0f}, 1);
                hud->text("CLICK TO RESUME  -  Q TO QUIT", W * 0.5f, H * 0.38f + 60.0f * u, 2.0f * u, {0.93f, 0.86f, 0.72f, 0.7f}, 1);
            }
            hud->end(out.id());
        }
        if (!args.hidden) {
            glBlitNamedFramebuffer(out.id(), 0, 0, 0, out.width(), out.height(),
                                   0, 0, window->width(), window->height(),
                                   GL_COLOR_BUFFER_BIT, GL_LINEAR);
            window->swapBuffers();
            if (glfwGetKey(window->handle(), GLFW_KEY_F12)) {
                auto px = game::core::readRGBA8(out.id(), out.width(), out.height());
                game::core::savePNG("screenshot.png", out.width(), out.height(), px);
                std::printf("wrote screenshot.png\n");
            }
        } else {
            glFinish();
        }
        gpuMsSum += std::chrono::duration<double, std::milli>(clock::now() - g0).count();
        ++frame;

        if (!listed.empty() && frame >= args.frames) {
            const auto& sh = listed[listedAt];
            auto px = game::core::readRGBA8(out.id(), out.width(), out.height());
            const std::string file = (std::filesystem::path(args.shotDir) / (sh.name + ".png")).string();
            game::core::savePNG(file, out.width(), out.height(), px);
            std::printf("wrote %s\n", file.c_str());
            if (++listedAt < listed.size()) {
                camera.position = listed[listedAt].eye;
                camera.target = listed[listedAt].target;
                camera.fov = glm::radians(listed[listedAt].fov);
                fly.lookFrom(camera);
                frame = 0;
                continue;
            }
        }
        if (args.frames > 0 && frame >= args.frames) {
            const auto& st = renderer.stats();
            std::printf("%d frames, %.1f ms/frame avg, last frame %d draws, %lld tris, %d instances\n",
                        frame, gpuMsSum / frame, st.draws, st.tris, st.instances);
            if (args.glDebug) std::printf("GL errors: %d\n", game::core::glDebugErrorCount());
            if (!args.screenshot.empty()) {
                auto px = game::core::readRGBA8(out.id(), out.width(), out.height());
                game::core::savePNG(args.screenshot, out.width(), out.height(), px);
                std::printf("wrote %s (%dx%d)\n", args.screenshot.c_str(), out.width(), out.height());
            }
            break;
        }
    }
    return (args.glDebug && game::core::glDebugErrorCount() > 0) ? 2 : 0;
} catch (const std::exception& e) {
    std::fprintf(stderr, "fatal: %s\n", e.what());
    return 1;
}
