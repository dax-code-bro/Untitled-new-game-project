#include "rendering/gl/Program.hpp"
#include <cstdio>
#include <vector>

namespace game::gl {

namespace {
ShaderHandle compileStage(GLenum stage, const std::string& src, const std::string& name,
                          const std::string& legend) {
    ShaderHandle sh(glCreateShader(stage));
    const char* p = src.c_str();
    glShaderSource(sh.get(), 1, &p, nullptr);
    glCompileShader(sh.get());
    GLint ok = GL_FALSE;
    glGetShaderiv(sh.get(), GL_COMPILE_STATUS, &ok);
    if (!ok) {
        GLint len = 0;
        glGetShaderiv(sh.get(), GL_INFO_LOG_LENGTH, &len);
        std::vector<char> log(static_cast<size_t>(len > 1 ? len : 1));
        glGetShaderInfoLog(sh.get(), len, nullptr, log.data());
        throw ShaderError(name + (stage == GL_VERTEX_SHADER ? " [vertex]" : " [fragment]") +
                          " failed to compile:\n" + log.data() +
                          (legend.empty() ? "" : "\nsource-string numbers in the log above map to:\n" + legend));
    }
    return sh;
}
} // namespace

Program Program::build(const std::string& vertSrc, const std::string& fragSrc,
                       const std::string& name, const std::string& legend) {
    ShaderHandle vs = compileStage(GL_VERTEX_SHADER, vertSrc, name, legend);
    ShaderHandle fs = compileStage(GL_FRAGMENT_SHADER, fragSrc, name, legend);

    Program p;
    p.m_name = name;
    p.m_h.reset(glCreateProgram());
    glAttachShader(p.m_h.get(), vs.get());
    glAttachShader(p.m_h.get(), fs.get());
    glLinkProgram(p.m_h.get());
    GLint ok = GL_FALSE;
    glGetProgramiv(p.m_h.get(), GL_LINK_STATUS, &ok);
    glDetachShader(p.m_h.get(), vs.get());
    glDetachShader(p.m_h.get(), fs.get());
    if (!ok) {
        GLint len = 0;
        glGetProgramiv(p.m_h.get(), GL_INFO_LOG_LENGTH, &len);
        std::vector<char> log(static_cast<size_t>(len > 1 ? len : 1));
        glGetProgramInfoLog(p.m_h.get(), len, nullptr, log.data());
        throw ShaderError(name + " failed to link:\n" + log.data());
    }
    return p;
}

GLint Program::location(const std::string& n) const {
    if (auto it = m_cache.find(n); it != m_cache.end()) return it->second;
    const GLint loc = glGetUniformLocation(m_h.get(), n.c_str());
    m_cache.emplace(n, loc);
    if (loc < 0 && m_missing.insert(n).second)
        std::fprintf(stderr, "[shader] %s: uniform '%s' is not active (misspelt, or optimised out)\n",
                     m_name.c_str(), n.c_str());
    return loc;
}

} // namespace game::gl
