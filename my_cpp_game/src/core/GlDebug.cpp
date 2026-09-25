#include "core/GlDebug.hpp"

#include <glad/gl.h>

#include <cstdio>
#include <set>
#include <string>

namespace game::core {

namespace {
int g_errors = 0;
std::set<std::string> g_seen;

void GLAD_API_PTR callback(GLenum, GLenum type, GLuint, GLenum severity, GLsizei, const GLchar* msg,
                       const void*) {
    if (severity == GL_DEBUG_SEVERITY_NOTIFICATION) return;
    const bool error = type == GL_DEBUG_TYPE_ERROR || type == GL_DEBUG_TYPE_UNDEFINED_BEHAVIOR;
    if (error) ++g_errors;
    if (g_seen.insert(msg).second)
        std::fprintf(stderr, "[gl %s] %s\n", error ? "ERROR" : "warn", msg);
}
} // namespace

void installGlDebug() {
    glEnable(GL_DEBUG_OUTPUT);
    glEnable(GL_DEBUG_OUTPUT_SYNCHRONOUS);
    glDebugMessageCallback(callback, nullptr);
}

int glDebugErrorCount() { return g_errors; }

} // namespace game::core
