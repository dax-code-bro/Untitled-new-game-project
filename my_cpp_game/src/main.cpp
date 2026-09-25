/* my_cpp_game -- engine initialisation and the master loop.
 *
 *   my_cpp_game                                   windowed, interactive
 *   my_cpp_game --width 3840 --height 2160 --screenshot out.png
 *                                                 offscreen 4K, save, exit
 *
 * Every frame renders into an offscreen HDR target at the requested size,
 * never straight into the window. That is what lets a capture be any
 * resolution -- 4K or 8K -- regardless of the monitor, and it is the same
 * path either way, so a screenshot is a picture of exactly what the game
 * draws rather than of a special capture mode. */
#include "core/Args.hpp"
#include "core/Capture.hpp"
#include "core/Window.hpp"
#include "rendering/ShaderLibrary.hpp"
#include "rendering/gl/Framebuffer.hpp"
#include "rendering/gl/VertexArray.hpp"

#include <glad/gl.h>
#include <GLFW/glfw3.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>

#include <chrono>
#include <cstdio>
#include <exception>
#include <filesystem>
#include <memory>

namespace {

constexpr double kFixedStep = 1.0 / 60.0;   // the sim step the JS engine uses

void APIENTRY debugCallback(GLenum, GLenum type, GLuint, GLenum severity,
                            GLsizei, const GLchar* message, const void*) {
    if (severity == GL_DEBUG_SEVERITY_NOTIFICATION) return;
    std::fprintf(stderr, "[gl] type=0x%x severity=0x%x: %s\n", type, severity, message);
}

std::filesystem::path shaderRoot() {
    namespace fs = std::filesystem;
    for (const fs::path& p : {fs::path(GAME_SOURCE_DIR) / "shaders", fs::path("shaders")})
        if (fs::is_directory(p)) return p;
    throw std::runtime_error("no shaders directory found");
}

// The web engine's default daylight, so both builds start from one sky.
void bindSky(const game::gl::Program& p) {
    p.set("uSkyZenith",    glm::vec3(0.16f, 0.33f, 0.66f));
    p.set("uSkyHorizon",   glm::vec3(0.62f, 0.74f, 0.88f));
    p.set("uGroundColor",  glm::vec3(0.26f, 0.24f, 0.22f));
    p.set("uSunDir",       glm::normalize(glm::vec3(0.45f, 0.72f, 0.53f)));
    p.set("uSunColor",     glm::vec3(1.0f, 0.94f, 0.84f));
    p.set("uSunIntensity", 3.4f);
    p.set("uSkyIntensity", 1.0f);
    p.set("uGroundBounce", 0.35f);
}

} // namespace

int main(int argc, char** argv) try {
    const game::core::Args args = game::core::parseArgs(argc, argv);

    auto window = std::make_unique<game::core::Window>(
        args.hidden ? 64 : args.width, args.hidden ? 64 : args.height, "my_cpp_game", !args.hidden);

    std::printf("GL %d.%d core | %s | %s\n", window->glMajor(), window->glMinor(),
                glGetString(GL_RENDERER), glGetString(GL_VERSION));

    int flags = 0;
    glGetIntegerv(GL_CONTEXT_FLAGS, &flags);
    if (flags & GL_CONTEXT_FLAG_DEBUG_BIT) {
        glEnable(GL_DEBUG_OUTPUT);
        glEnable(GL_DEBUG_OUTPUT_SYNCHRONOUS);
        glDebugMessageCallback(debugCallback, nullptr);
    }

    game::rendering::ShaderLibrary shaders(shaderRoot());
    auto sky     = shaders.get("fullscreen.vert", "sky.frag");
    auto tonemap = shaders.get("fullscreen.vert", "tonemap.frag");

    game::gl::VertexArray emptyVao;   // fullscreen passes draw from gl_VertexID
    game::gl::Framebuffer hdr(args.width, args.height, {GL_RGBA16F});
    game::gl::Framebuffer ldr(args.width, args.height, {GL_RGBA8});

    glm::vec3 eye(0.0f, 1.7f, 0.0f);
    glm::vec3 target(0.0f, 2.6f, 10.0f);

    using clock = std::chrono::steady_clock;
    auto   previous    = clock::now();
    double accumulator = 0.0;
    int    frame       = 0;

    while (!window->shouldClose()) {
        const auto now = clock::now();
        double dt = std::chrono::duration<double>(now - previous).count();
        previous = now;
        if (dt > 0.20) dt = 0.20;      // same clamp as the JS loop
        accumulator += dt;
        window->pollEvents();
        if (shaders.reloadChanged()) std::printf("shaders reloaded\n");

        while (accumulator >= kFixedStep) accumulator -= kFixedStep;   // sim attaches here

        const float aspect = static_cast<float>(args.width) / static_cast<float>(args.height);
        const glm::mat4 view = glm::lookAt(eye, target, glm::vec3(0, 1, 0));
        const glm::mat4 proj = glm::perspective(glm::radians(62.0f), aspect, 0.05f, 400.0f);

        glBindVertexArray(emptyVao.id());
        glDisable(GL_DEPTH_TEST);

        hdr.bind();
        sky->use();
        bindSky(*sky);
        sky->set("uInvViewProj", glm::inverse(proj * view));
        sky->set("uCameraPos", eye);
        glDrawArrays(GL_TRIANGLES, 0, 3);

        ldr.bind();
        tonemap->use();
        tonemap->texture("uHdr", hdr.color(0), 0);
        tonemap->set("uExposure", 1.0f);
        glDrawArrays(GL_TRIANGLES, 0, 3);

        if (!args.hidden) {
            glBlitNamedFramebuffer(ldr.id(), 0, 0, 0, ldr.width(), ldr.height(),
                                   0, 0, window->width(), window->height(),
                                   GL_COLOR_BUFFER_BIT, GL_LINEAR);
            window->swapBuffers();
        }

        if (args.frames > 0 && ++frame >= args.frames) {
            if (!args.screenshot.empty()) {
                glFinish();
                auto px = game::core::readRGBA8(ldr.id(), ldr.width(), ldr.height());
                game::core::savePNG(args.screenshot, ldr.width(), ldr.height(), px);
                std::printf("wrote %s (%dx%d)\n", args.screenshot.c_str(), ldr.width(), ldr.height());
            }
            break;
        }
    }
    return 0;
} catch (const std::exception& e) {
    std::fprintf(stderr, "fatal: %s\n", e.what());
    return 1;
}
