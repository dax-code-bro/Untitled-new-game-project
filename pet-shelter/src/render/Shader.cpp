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

static std::string g_globalDefines;
void Shader::setGlobalDefines(const std::string& d) { g_globalDefines = d; }

// Checks a shader's compile status (this waits for the driver) and prints its log on failure.
static bool shaderOk(GLuint s, const std::string& name) {
    GLint ok = 0;
    glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (ok) return true;
    GLint len = 0;
    glGetShaderiv(s, GL_INFO_LOG_LENGTH, &len);
    std::vector<char> log(size_t(len) + 1);
    glGetShaderInfoLog(s, len, nullptr, log.data());
    std::fprintf(stderr, "[shader] compile error in %s:\n%s\n", name.c_str(), log.data());
    return false;
}

bool Shader::load(const std::string& vsFile, const std::string& fsFile, const std::string& defines) {
    vs_ = vsFile; fs_ = fsFile; defines_ = defines;
    return reload();
}

void Shader::begin(const std::string& vsFile, const std::string& fsFile, const std::string& defines) {
    vs_ = vsFile; fs_ = fsFile; defines_ = defines;
    begin();
}

// Phase 1: hand the sources to the driver without waiting for results, so all shaders can
// compile in parallel (a big win on phones, where compiling is slow).
void Shader::begin() {
#ifdef __EMSCRIPTEN__
    std::string header = "#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2DShadow;\n";
#else
    std::string header = "#version 330 core\n";
#endif
    header += g_globalDefines + "\n" + defines_ + "\n";
    std::string vsrc = header + preprocess(vs_), fsrc = header + preprocess(fs_);
    const char* pv = vsrc.c_str();
    const char* pf = fsrc.c_str();
    pendV_ = glCreateShader(GL_VERTEX_SHADER);
    glShaderSource(pendV_, 1, &pv, nullptr);
    glCompileShader(pendV_);
    pendF_ = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(pendF_, 1, &pf, nullptr);
    glCompileShader(pendF_);
    pendP_ = glCreateProgram();
    glAttachShader(pendP_, pendV_);
    glAttachShader(pendP_, pendF_);
    glLinkProgram(pendP_);
}

// Phase 2: collect the result.
bool Shader::finish() {
    if (!pendP_) return prog_ != 0;
    bool ok = true;
    GLint linked = 0;
    glGetProgramiv(pendP_, GL_LINK_STATUS, &linked);
    if (!linked) {
        ok = shaderOk(pendV_, vs_) & shaderOk(pendF_, fs_);
        GLint len = 0;
        glGetProgramiv(pendP_, GL_INFO_LOG_LENGTH, &len);
        std::vector<char> log(size_t(len) + 1);
        glGetProgramInfoLog(pendP_, len, nullptr, log.data());
        std::fprintf(stderr, "[shader] error: link failed %s + %s:\n%s\n", vs_.c_str(), fs_.c_str(), log.data());
        ok = false;
    }
    glDeleteShader(pendV_);
    glDeleteShader(pendF_);
    if (ok) {
        if (prog_) glDeleteProgram(prog_);
        prog_ = pendP_;
        cache_.clear();
    } else {
        glDeleteProgram(pendP_);
    }
    pendV_ = pendF_ = pendP_ = 0;
    return ok;
}

bool Shader::reload() {
    begin();
    return finish();
}

GLint Shader::loc(const char* name) {
    auto it = cache_.find(name);
    if (it != cache_.end()) return it->second;
    GLint l = glGetUniformLocation(prog_, name);
    cache_[name] = l;
    return l;
}

}  // namespace ps
