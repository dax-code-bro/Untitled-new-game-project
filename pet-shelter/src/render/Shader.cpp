#include "render/Shader.h"
#include <cstdio>
#include <fstream>
#include <sstream>
#include <vector>

namespace ps {

static std::string g_dir = "shaders";
void Shader::setDirectory(const std::string& dir) { g_dir = dir; }
const std::string& Shader::directory() { return g_dir; }

static bool readFile(const std::string& path, std::string& out) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return false;
    std::stringstream ss;
    ss << f.rdbuf();
    out = ss.str();
    return true;
}

static std::string preprocess(const std::string& file, int depth = 0) {
    std::string src;
    if (!readFile(g_dir + "/" + file, src)) {
        std::fprintf(stderr, "[shader] cannot read %s/%s\n", g_dir.c_str(), file.c_str());
        return {};
    }
    if (depth > 8) return src;
    std::stringstream in(src), out;
    std::string line;
    while (std::getline(in, line)) {
        auto p = line.find("#include");
        if (p != std::string::npos && line.find_first_not_of(" \t") == p) {
            auto a = line.find('"'), b = line.rfind('"');
            if (a != std::string::npos && b > a) {
                out << preprocess(line.substr(a + 1, b - a - 1), depth + 1) << "\n";
                continue;
            }
        }
        out << line << "\n";
    }
    return out.str();
}

static GLuint compile(GLenum type, const std::string& src, const std::string& name) {
    GLuint s = glCreateShader(type);
    const char* p = src.c_str();
    glShaderSource(s, 1, &p, nullptr);
    glCompileShader(s);
    GLint ok = 0;
    glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        GLint len = 0;
        glGetShaderiv(s, GL_INFO_LOG_LENGTH, &len);
        std::vector<char> log(size_t(len) + 1);
        glGetShaderInfoLog(s, len, nullptr, log.data());
        std::fprintf(stderr, "[shader] compile error in %s:\n%s\n", name.c_str(), log.data());
        glDeleteShader(s);
        return 0;
    }
    return s;
}

bool Shader::load(const std::string& vsFile, const std::string& fsFile, const std::string& defines) {
    vs_ = vsFile; fs_ = fsFile; defines_ = defines;
    return reload();
}

bool Shader::reload() {
#ifdef __EMSCRIPTEN__
    std::fprintf(stderr, "[startup] 4/8 compiling %s + %s\n", vs_.c_str(), fs_.c_str());
#endif
#ifdef __EMSCRIPTEN__
    std::string header = "#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2DShadow;\n" + defines_ + "\n";
#else
    std::string header = "#version 330 core\n" + defines_ + "\n";
#endif
    std::string vsrc = header + preprocess(vs_), fsrc = header + preprocess(fs_);
    GLuint v = compile(GL_VERTEX_SHADER, vsrc, vs_);
    GLuint f = compile(GL_FRAGMENT_SHADER, fsrc, fs_);
    if (!v || !f) { if (v) glDeleteShader(v); if (f) glDeleteShader(f); return false; }
    GLuint p = glCreateProgram();
    glAttachShader(p, v);
    glAttachShader(p, f);
    glLinkProgram(p);
    glDeleteShader(v);
    glDeleteShader(f);
    GLint ok = 0;
    glGetProgramiv(p, GL_LINK_STATUS, &ok);
    if (!ok) {
        GLint len = 0;
        glGetProgramiv(p, GL_INFO_LOG_LENGTH, &len);
        std::vector<char> log(size_t(len) + 1);
        glGetProgramInfoLog(p, len, nullptr, log.data());
        std::fprintf(stderr, "[shader] link error %s + %s:\n%s\n", vs_.c_str(), fs_.c_str(), log.data());
        glDeleteProgram(p);
        return false;
    }
    if (prog_) glDeleteProgram(prog_);
    prog_ = p;
    cache_.clear();
    return true;
}

GLint Shader::loc(const char* name) {
    auto it = cache_.find(name);
    if (it != cache_.end()) return it->second;
    GLint l = glGetUniformLocation(prog_, name);
    cache_[name] = l;
    return l;
}

}  // namespace ps
