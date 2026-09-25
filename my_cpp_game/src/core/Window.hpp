#pragma once
#include <memory>
#include <string>

struct GLFWwindow;

namespace game::core {

/* The OS window and its GL 4.6 core context.
 *
 * GLFW is a C library that hands back a raw GLFWwindow* and expects
 * glfwDestroyWindow later. That is exactly the manual pair the project
 * forbids, so it is wrapped once, here, in a unique_ptr with a custom
 * deleter -- and then never written again anywhere else in the engine.
 * glfwTerminate is tied to the same lifetime through a separate guard so
 * that ordering is not a thing a caller can get wrong. */
class Window {
public:
    /* fullscreen: the primary monitor at its own resolution (width and
       height are then ignored) -- a 4K screen gets a 4K framebuffer. */
    Window(int width, int height, const std::string& title, bool visible = true, bool fullscreen = false);
    ~Window();

    Window(const Window&)            = delete;
    Window& operator=(const Window&) = delete;
    Window(Window&&) noexcept            = default;
    Window& operator=(Window&&) noexcept = default;

    [[nodiscard]] bool shouldClose() const;
    void swapBuffers() const;
    void pollEvents() const;
    void close() const;

    [[nodiscard]] int  width()  const { return m_width; }
    [[nodiscard]] int  height() const { return m_height; }
    [[nodiscard]] GLFWwindow* handle() const { return m_window.get(); }
    [[nodiscard]] int  glMajor() const { return m_major; }
    [[nodiscard]] int  glMinor() const { return m_minor; }

private:
    struct Deleter { void operator()(GLFWwindow*) const noexcept; };

    int m_width  = 0;
    int m_height = 0;
    int m_major  = 0;
    int m_minor  = 0;
    std::unique_ptr<GLFWwindow, Deleter> m_window;
};

} // namespace game::core
