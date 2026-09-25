/* my_cpp_game — engine initialisation and the master loop.
 *
 * This is the bootstrap only: a GL 4.6 core context, a loaded driver, a
 * fixed-step loop and a clear. The renderer, ECS and Lua layers attach
 * to the marked points below as they are ported. */
#include "core/Window.hpp"

#include <glad/gl.h>
#include <GLFW/glfw3.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>

#include <chrono>
#include <cstdio>
#include <exception>
#include <memory>

namespace {

constexpr int    kWidth     = 1280;
constexpr int    kHeight    = 720;
constexpr double kFixedStep = 1.0 / 60.0;   // the sim step the JS engine uses

void APIENTRY debugCallback(GLenum, GLenum type, GLuint, GLenum severity,
                            GLsizei, const GLchar* message, const void*) {
    if (severity == GL_DEBUG_SEVERITY_NOTIFICATION) return;
    std::fprintf(stderr, "[gl] type=0x%x severity=0x%x: %s\n", type, severity, message);
}

} // namespace

int main() try {
    auto window = std::make_unique<game::core::Window>(kWidth, kHeight, "my_cpp_game");

    std::printf("GL_VERSION  %s\n", glGetString(GL_VERSION));
    std::printf("GL_RENDERER %s\n", glGetString(GL_RENDERER));

    int flags = 0;
    glGetIntegerv(GL_CONTEXT_FLAGS, &flags);
    if (flags & GL_CONTEXT_FLAG_DEBUG_BIT) {
        glEnable(GL_DEBUG_OUTPUT);
        glEnable(GL_DEBUG_OUTPUT_SYNCHRONOUS);
        glDebugMessageCallback(debugCallback, nullptr);
    }

    glEnable(GL_DEPTH_TEST);
    glEnable(GL_CULL_FACE);

    // TODO(port): auto renderer = std::make_unique<game::rendering::Renderer>(*window);
    // TODO(port): auto script   = std::make_unique<game::scripting::LuaHost>("scripts/");

    using clock = std::chrono::steady_clock;
    auto  previous    = clock::now();
    double accumulator = 0.0;

    /* Fixed-step simulation, variable-step present. The JS engine steps at
       1/60 and clamps dt; this keeps that contract so ported gameplay code
       behaves identically rather than becoming frame-rate dependent. */
    while (!window->shouldClose()) {
        const auto now = clock::now();
        double frame = std::chrono::duration<double>(now - previous).count();
        previous = now;
        if (frame > 0.20) frame = 0.20;      // same clamp as the JS loop
        accumulator += frame;

        window->pollEvents();

        while (accumulator >= kFixedStep) {
            // TODO(port): script->tick(kFixedStep);
            // TODO(port): world.step(kFixedStep);
            accumulator -= kFixedStep;
        }

        glClearColor(0.16f, 0.33f, 0.66f, 1.0f);   // the engine's sky zenith
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
        // TODO(port): renderer->renderScene(world, camera);

        window->swapBuffers();
    }
    return 0;
} catch (const std::exception& e) {
    std::fprintf(stderr, "fatal: %s\n", e.what());
    return 1;
}
