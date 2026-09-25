#pragma once
#include "rendering/gl/Handle.hpp"
#include "rendering/gl/Texture.hpp"
#include <glm/glm.hpp>
#include <set>
#include <stdexcept>
#include <string>
#include <unordered_map>

namespace game::gl {

struct ShaderError : std::runtime_error {
    using std::runtime_error::runtime_error;
};

/* A linked program with a uniform-location cache.
 *
 * THE JS ENGINE'S SETTERS SILENTLY NO-OPPED ON AN UNKNOWN NAME, and that
 * one property cost more debugging than any single bug it hid: a
 * misspelled uniform read zero with no error and left nothing to find.
 * Here every name that fails to resolve is recorded in missing() and
 * logged once. It is a record, not an error, because a GLSL compiler
 * legitimately strips a uniform that is declared and never used -- so a
 * test asserts on missing() for the names it knows ARE used. */
class Program {
public:
    Program() = default;

    /* Throws ShaderError with the driver log, source-mapped through the
       #line markers ShaderLibrary inserts, on compile or link failure. */
    static Program build(const std::string& vertSrc, const std::string& fragSrc,
                         const std::string& name, const std::string& fileLegend = {});

    void use() const { glUseProgram(m_h.get()); }

    GLint location(const std::string& name) const;
    void set(const std::string& n, int v)              const { glProgramUniform1i(m_h.get(), location(n), v); }
    void set(const std::string& n, float v)            const { glProgramUniform1f(m_h.get(), location(n), v); }
    void set(const std::string& n, const glm::vec2& v) const { glProgramUniform2fv(m_h.get(), location(n), 1, &v[0]); }
    void set(const std::string& n, const glm::vec3& v) const { glProgramUniform3fv(m_h.get(), location(n), 1, &v[0]); }
    void set(const std::string& n, const glm::vec4& v) const { glProgramUniform4fv(m_h.get(), location(n), 1, &v[0]); }
    void set(const std::string& n, const glm::mat3& m) const { glProgramUniformMatrix3fv(m_h.get(), location(n), 1, GL_FALSE, &m[0][0]); }
    void set(const std::string& n, const glm::mat4& m) const { glProgramUniformMatrix4fv(m_h.get(), location(n), 1, GL_FALSE, &m[0][0]); }
    void texture(const std::string& n, const Texture& t, GLuint unit) const { t.bind(unit); set(n, static_cast<int>(unit)); }

    [[nodiscard]] GLuint id() const { return m_h.get(); }
    [[nodiscard]] const std::string& name() const { return m_name; }
    [[nodiscard]] const std::set<std::string>& missing() const { return m_missing; }
    explicit operator bool() const { return static_cast<bool>(m_h); }

private:
    ProgramHandle m_h;
    std::string   m_name;
    mutable std::unordered_map<std::string, GLint> m_cache;
    mutable std::set<std::string>                  m_missing;
};

} // namespace game::gl
