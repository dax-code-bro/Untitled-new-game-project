#include "core/Window.hpp"

#include <glad/gl.h>       // must precede GLFW: it defines the GL symbols
#include <GLFW/glfw3.h>

#include <cstdio>
#include <stdexcept>
#include <string>

namespace game::core {

void Window::Deleter::operator()(GLFWwindow* w) const noexcept {
    if (w) glfwDestroyWindow(w);
}

namespace {
/* One glfwInit for the process, one glfwTerminate at exit, with no
   ordering for a caller to get wrong. A function-local static is
   initialised on first use and destroyed in reverse order at exit,
   which is after the last Window has released its handle. */
struct GlfwRuntime {
    GlfwRuntime() {
        glfwSetErrorCallback([](int code, const char* msg) {
            std::fprintf(stderr, "[glfw] %d: %s\n", code, msg ? msg : "?");
        });
        if (!glfwInit()) throw std::runtime_error("glfwInit failed");
    }
    ~GlfwRuntime() { glfwTerminate(); }
};
void ensureGlfw() { static GlfwRuntime runtime; }
} // namespace

Window::Window(int width, int height, const std::string& title, bool visible, bool fullscreen)
    : m_width(width), m_height(height) {
    ensureGlfw();
    GLFWmonitor* monitor = nullptr;
    if (fullscreen && visible) {
        monitor = glfwGetPrimaryMonitor();
        if (const GLFWvidmode* mode = monitor ? glfwGetVideoMode(monitor) : nullptr) {
            width = mode->width;
            height = mode->height;
        } else {
            monitor = nullptr;
        }
    }

    /* 4.6 first, then 4.5. The engine uses nothing 4.6 added (SPIR-V
       shaders are its one real feature), and 4.5 is what Mesa's software
       rasteriser provides -- which is what every screenshot of this engine
       is verified on, since the build machine has no GPU. A real card gets
       4.6; nothing behaves differently either way. */
    for (const int minor : {6, 5}) {
        glfwDefaultWindowHints();
        glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 4);
        glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, minor);
        glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
        glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GLFW_TRUE);
        glfwWindowHint(GLFW_VISIBLE, visible ? GLFW_TRUE : GLFW_FALSE);
#ifndef NDEBUG
        glfwWindowHint(GLFW_OPENGL_DEBUG_CONTEXT, GLFW_TRUE);
#endif
        glfwWindowHint(GLFW_SAMPLES, 0);   // MSAA is the renderer's business
        m_window.reset(glfwCreateWindow(width, height, title.c_str(), monitor, nullptr));
        if (m_window) { m_major = 4; m_minor = minor; break; }
    }
    if (!m_window)
        throw std::runtime_error(
            "glfwCreateWindow failed: no GL 4.5+ core context. The driver is "
            "older than 4.5, or there is no display to attach to.");

    glfwMakeContextCurrent(m_window.get());

    /* Load the driver's real entry points. Every gl* call before this is
       a null dereference, which is why nothing above touches GL. */
    if (!gladLoadGL(glfwGetProcAddress))
        throw std::runtime_error("gladLoadGL failed: no usable GL driver");

    glfwSwapInterval(1);

    glfwSetFramebufferSizeCallback(m_window.get(), [](GLFWwindow* w, int fbw, int fbh) {
        glViewport(0, 0, fbw, fbh);
        if (auto* self = static_cast<Window*>(glfwGetWindowUserPointer(w))) {
            self->m_width  = fbw;
            self->m_height = fbh;
        }
    });
    glfwSetWindowUserPointer(m_window.get(), this);

    int fbw = 0, fbh = 0;
    glfwGetFramebufferSize(m_window.get(), &fbw, &fbh);
    m_width = fbw; m_height = fbh;
    glViewport(0, 0, fbw, fbh);
}

Window::~Window() = default;

bool Window::shouldClose() const { return glfwWindowShouldClose(m_window.get()); }
void Window::swapBuffers() const { glfwSwapBuffers(m_window.get()); }
void Window::pollEvents()  const { glfwPollEvents(); }
void Window::close()       const { glfwSetWindowShouldClose(m_window.get(), GLFW_TRUE); }

} // namespace game::core
