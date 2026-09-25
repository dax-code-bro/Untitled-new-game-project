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
 * monitor's own resolution. */
#include "core/Args.hpp"
#include "core/Capture.hpp"
#include "core/GlDebug.hpp"
#include "core/Paths.hpp"
#include "core/Window.hpp"
#include "rendering/Material.hpp"
#include "rendering/Renderer.hpp"
#include "rendering/ShaderLibrary.hpp"
#include "rendering/Tunables.hpp"
#include "scene/SceneFile.hpp"
#include "scene/Showcase.hpp"

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

} // namespace

int main(int argc, char** argv) try {
    const game::core::Args args = game::core::parseArgs(argc, argv);

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
    FlyCamera fly;
    fly.lookFrom(camera);

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

        if (!args.hidden) {
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

        while (accumulator >= kFixedStep) accumulator -= kFixedStep;   // sim attaches here

        if (args.orbit != 0.0f) {
            // Swing the eye round the target about the vertical axis.
            const float a = glm::radians(args.orbit);
            const glm::vec3 o = camera.position - camera.target;
            camera.position = camera.target + glm::vec3(o.x * std::cos(a) - o.z * std::sin(a), o.y,
                                                        o.x * std::sin(a) + o.z * std::cos(a));
        }

        const auto g0 = clock::now();
        renderer.render(items, camera, static_cast<float>(dt));
        const auto& out = renderer.output();
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
