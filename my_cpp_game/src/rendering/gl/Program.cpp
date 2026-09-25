#include "rendering/gl/Program.hpp"
#include <cstdio>
#include <cstdlib>
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

    // One fixed unit per active sampler (arrays of samplers are not used).
    GLint count = 0, maxLen = 0;
    glGetProgramiv(p.m_h.get(), GL_ACTIVE_UNIFORMS, &count);
    glGetProgramiv(p.m_h.get(), GL_ACTIVE_UNIFORM_MAX_LENGTH, &maxLen);
    std::vector<char> buf(static_cast<size_t>(maxLen > 1 ? maxLen : 1));
    GLuint unit = 0;
    for (GLint i = 0; i < count; ++i) {
        GLint size = 0; GLenum type = 0; GLsizei len = 0;
        glGetActiveUniform(p.m_h.get(), static_cast<GLuint>(i), maxLen, &len, &size, &type, buf.data());
        {
            std::string an(buf.data(), static_cast<size_t>(len));
            if (an.size() > 3 && an.compare(an.size() - 3, 3, "[0]") == 0) an.resize(an.size() - 3);
            if (an.compare(0, 3, "gl_") != 0) p.m_active.push_back(an);
        }
        switch (type) {
        case GL_SAMPLER_2D: case GL_SAMPLER_2D_SHADOW: case GL_SAMPLER_CUBE:
        case GL_SAMPLER_3D: case GL_SAMPLER_2D_ARRAY: case GL_SAMPLER_2D_ARRAY_SHADOW:
        case GL_INT_SAMPLER_2D: case GL_UNSIGNED_INT_SAMPLER_2D: {
            const std::string n(buf.data(), static_cast<size_t>(len));
            const GLint loc = glGetUniformLocation(p.m_h.get(), n.c_str());
            glProgramUniform1i(p.m_h.get(), loc, static_cast<GLint>(unit));
            p.m_samplerUnits.emplace(n, unit++);
            break;
        }
        default: break;
        }
    }
    return p;
}

void Program::texture(const std::string& n, const Texture& t) const { texture(n, t.id()); }

std::vector<std::string> Program::neverSet() const {
    std::vector<std::string> out;
    for (const auto& n : m_active)
        if (!m_cache.count(n) && !m_samplerTouched.count(n)) out.push_back(n);
    return out;
}

void Program::texture(const std::string& n, GLuint textureId) const {
    m_samplerTouched.insert(n);
    if (auto it = m_samplerUnits.find(n); it != m_samplerUnits.end())
        glBindTextureUnit(it->second, textureId);
}

GLint Program::location(const std::string& n) const {
    if (auto it = m_cache.find(n); it != m_cache.end()) return it->second;
    const GLint loc = glGetUniformLocation(m_h.get(), n.c_str());
    m_cache.emplace(n, loc);
    /* Quiet by default: the renderer binds whole uniform blocks to every
       program, as the web engine did, and most programs use part of one.
       GAME_SHADER_VERBOSE=1 prints each inactive name once. */
    static const bool verbose = std::getenv("GAME_SHADER_VERBOSE") != nullptr;
    if (loc < 0 && m_missing.insert(n).second && verbose)
        std::fprintf(stderr, "[shader] %s: uniform '%s' is not active (misspelt, or optimised out)\n",
                     m_name.c_str(), n.c_str());
    return loc;
}

} // namespace game::gl
