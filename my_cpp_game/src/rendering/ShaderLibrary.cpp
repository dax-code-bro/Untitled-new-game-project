#include "rendering/ShaderLibrary.hpp"
#include <cstdio>
#include <fstream>
#include <regex>
#include <set>
#include <sstream>

namespace fs = std::filesystem;

namespace game::rendering {

ShaderLibrary::ShaderLibrary(fs::path root) : m_root(std::move(root)) {
    if (!fs::is_directory(m_root))
        throw gl::ShaderError("ShaderLibrary: no shader directory at " + m_root.string());
}

namespace {
std::string readFile(const fs::path& p) {
    std::ifstream in(p, std::ios::binary);
    if (!in) throw gl::ShaderError("cannot read shader file " + p.string());
    std::ostringstream ss; ss << in.rdbuf();
    return ss.str();
}

void expand(const fs::path& root, const fs::path& file, std::ostringstream& out,
            std::set<fs::path>& seen, std::vector<fs::path>& order, int depth) {
    if (depth > 32) throw gl::ShaderError("#include nested too deep at " + file.string());
    const fs::path canon = fs::weakly_canonical(file);
    if (!seen.insert(canon).second) return;            // include-once
    order.push_back(canon);
    const int id = static_cast<int>(order.size()) - 1;

    // Custom raw-string delimiter: the pattern itself contains )" which would
    // end a plain R"( ... )" literal early.
    static const std::regex inc(R"re(^\s*#\s*include\s+"([^"]+)"\s*$)re");
    std::istringstream in(readFile(file));
    std::string line;
    int n = 0;
    out << "#line 1 " << id << "\n";
    while (std::getline(in, line)) {
        ++n;
        std::smatch m;
        if (std::regex_match(line, m, inc)) {
            expand(root, root / m[1].str(), out, seen, order, depth + 1);
            out << "#line " << (n + 1) << " " << id << "\n";   // resume the includer
        } else {
            out << line << "\n";
        }
    }
}
} // namespace

ShaderLibrary::Source ShaderLibrary::preprocess(const std::string& file,
                                                const std::vector<std::string>& defines) const {
    std::ostringstream out;
    out << "#version 450 core\n";
    for (const auto& d : defines) out << "#define " << d << "\n";
    std::set<fs::path> seen;
    std::vector<fs::path> order;
    expand(m_root, m_root / file, out, seen, order, 0);

    std::ostringstream legend;
    for (size_t i = 0; i < order.size(); ++i) legend << "  " << i << " = " << order[i].string() << "\n";
    return {out.str(), legend.str(), order};
}

void ShaderLibrary::compile(Entry& e) const {
    Source v = preprocess(e.vert, e.defines);
    Source f = preprocess(e.frag, e.defines);
    std::string name = e.vert + " + " + e.frag;
    for (const auto& d : e.defines) name += " [" + d + "]";

    *e.program = gl::Program::build(v.text, f.text, name,
                                    "vertex:\n" + v.legend + "fragment:\n" + f.legend);
    e.stamps.clear();
    std::set<fs::path> all(v.deps.begin(), v.deps.end());
    all.insert(f.deps.begin(), f.deps.end());
    for (const auto& p : all) e.stamps.emplace_back(p, fs::last_write_time(p));
}

std::shared_ptr<gl::Program> ShaderLibrary::get(const std::string& vert, const std::string& frag,
                                                const std::vector<std::string>& defines) {
    std::string key = vert + "|" + frag;
    for (const auto& d : defines) key += "|" + d;
    if (auto it = m_entries.find(key); it != m_entries.end()) return it->second.program;

    Entry e{vert, frag, defines, std::make_shared<gl::Program>(), {}};
    compile(e);                                    // first compile: failure throws to the caller
    auto prog = e.program;
    m_entries.emplace(key, std::move(e));
    return prog;
}

int ShaderLibrary::reloadChanged() {
    int n = 0;
    for (auto& [key, e] : m_entries) {
        bool stale = false;
        for (const auto& [p, t] : e.stamps) {
            std::error_code ec;
            const auto now = fs::last_write_time(p, ec);
            if (ec || now != t) { stale = true; break; }
        }
        if (!stale) continue;
        try {
            Entry copy = e;
            copy.program = std::make_shared<gl::Program>();
            compile(copy);
            *e.program = std::move(*copy.program);   // swap in place: holders see it
            e.stamps   = std::move(copy.stamps);
            std::fprintf(stderr, "[shader] reloaded %s + %s\n", e.vert.c_str(), e.frag.c_str());
            ++n;
        } catch (const gl::ShaderError& err) {
            // Keep the old binary running. Refresh the stamps so the same
            // broken save is not recompiled every frame; the next save retries.
            for (auto& [p, t] : e.stamps) { std::error_code ec; t = fs::last_write_time(p, ec); }
            std::fprintf(stderr, "[shader] reload FAILED, keeping previous program:\n%s\n", err.what());
        }
    }
    return n;
}

} // namespace game::rendering
