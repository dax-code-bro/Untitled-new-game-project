// GLSL program loader. Every shader in the game is a custom .glsl file in
// shaders/. Supports `#include "file.glsl"` and hot reload (F6).
#pragma once
#include "core/GL.h"
#include "core/Math.h"
#include <string>
#include <unordered_map>

namespace ps {

class Shader {
public:
    bool load(const std::string& vsFile, const std::string& fsFile, const std::string& defines = {});
    bool reload();
    void use() const { glUseProgram(prog_); }
    GLuint id() const { return prog_; }
    GLint loc(const char* name);
    void set(const char* n, int v) { glUniform1i(loc(n), v); }
    void set(const char* n, float v) { glUniform1f(loc(n), v); }
    void set(const char* n, vec2 v) { glUniform2f(loc(n), v.x, v.y); }
    void set(const char* n, vec3 v) { glUniform3f(loc(n), v.x, v.y, v.z); }
    void set(const char* n, vec4 v) { glUniform4f(loc(n), v.x, v.y, v.z, v.w); }
    void set(const char* n, const mat4& m) { glUniformMatrix4fv(loc(n), 1, GL_FALSE, m.data()); }

    static void setDirectory(const std::string& dir);
    static const std::string& directory();

private:
    GLuint prog_ = 0;
    std::string vs_, fs_, defines_;
    std::unordered_map<std::string, GLint> cache_;
};

}  // namespace ps
