#include "core/SaveFile.h"
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>

namespace ps {

void KeyValues::setf(const std::string& k, double v) {
    char buf[64];
    std::snprintf(buf, sizeof buf, "%.9g", v);
    kv_[k] = buf;
}
void KeyValues::setv(const std::string& k, vec3 v) {
    char buf[128];
    std::snprintf(buf, sizeof buf, "%.6g %.6g %.6g", v.x, v.y, v.z);
    kv_[k] = buf;
}
std::string KeyValues::get(const std::string& k, const std::string& def) const {
    auto it = kv_.find(k);
    return it == kv_.end() ? def : it->second;
}
double KeyValues::getf(const std::string& k, double def) const {
    auto it = kv_.find(k);
    return it == kv_.end() ? def : std::strtod(it->second.c_str(), nullptr);
}
long long KeyValues::geti(const std::string& k, long long def) const {
    auto it = kv_.find(k);
    return it == kv_.end() ? def : std::strtoll(it->second.c_str(), nullptr, 10);
}
vec3 KeyValues::getv(const std::string& k, vec3 def) const {
    auto it = kv_.find(k);
    if (it == kv_.end()) return def;
    vec3 v = def;
    std::sscanf(it->second.c_str(), "%f %f %f", &v.x, &v.y, &v.z);
    return v;
}
bool KeyValues::write(const std::string& path) const {
    std::ofstream f(path);
    if (!f) return false;
    f << "# Pet shelter save file\n";
    for (auto& [k, v] : kv_) {
        std::string clean = v;
        for (char& c : clean) if (c == '\n' || c == '\r') c = ' ';
        f << k << '=' << clean << '\n';
    }
    return bool(f);
}
bool KeyValues::read(const std::string& path) {
    std::ifstream f(path);
    if (!f) return false;
    kv_.clear();
    std::string line;
    while (std::getline(f, line)) {
        if (line.empty() || line[0] == '#') continue;
        auto eq = line.find('=');
        if (eq == std::string::npos) continue;
        kv_[line.substr(0, eq)] = line.substr(eq + 1);
    }
    return true;
}

}  // namespace ps
