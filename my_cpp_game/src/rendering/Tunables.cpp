#include "rendering/Tunables.hpp"

#include <cstdio>
#include <fstream>
#include <functional>
#include <map>
#include <sstream>

namespace game::rendering {

namespace {
struct Slot {
    std::function<float*(Renderer&)> f;   // exactly one of these is set
    std::function<glm::vec3*(Renderer&)> v;
    std::function<int*(Renderer&)> i;
};

const std::map<std::string, Slot>& registry() {
#define F(name, expr) {name, Slot{[](Renderer& r) { return &(expr); }, nullptr, nullptr}}
#define V(name, expr) {name, Slot{nullptr, [](Renderer& r) { return &(expr); }, nullptr}}
#define I(name, expr) {name, Slot{nullptr, nullptr, [](Renderer& r) { return &(expr); }}}
    static const std::map<std::string, Slot> m = {
        V("sun.direction", r.sun.direction), V("sun.color", r.sun.color), F("sun.intensity", r.sun.intensity),
        V("sky.zenith", r.sky.zenith), V("sky.horizon", r.sky.horizon), V("sky.ground", r.sky.ground),
        F("sky.intensity", r.sky.intensity), F("sky.clouds", r.sky.clouds), V("sky.room", r.sky.room),
        F("sky.occlusion", r.sky.occlusion), F("sky.bounce", r.sky.bounce),
        I("sky.model", r.sky.model), F("sky.turbidity", r.sky.turbidity), F("sky.physicalGain", r.sky.physicalGain),
        V("fog.color", r.fog.color), F("fog.density", r.fog.density), F("fog.height", r.fog.height),
        F("fog.falloff", r.fog.falloff), F("fog.skyBlend", r.fog.skyBlend),
        F("shadows.distance", r.shadows.distance), F("shadows.strength", r.shadows.strength),
        F("shadows.split", r.shadows.split), F("shadows.softness", r.shadows.softness),
        F("shadows.penumbraMax", r.shadows.penumbraMax), F("shadows.contactStrength", r.shadows.contactStrength),
        F("post.exposure", r.post.exposure), I("post.toneMap", r.post.toneMap),
        F("post.agxPunch", r.post.agxPunch), F("post.agxSat", r.post.agxSat),
        F("post.bloom", r.post.bloom), F("post.bloomThreshold", r.post.bloomThreshold),
        F("post.vignette", r.post.vignette), F("post.chromatic", r.post.chromatic),
        F("post.saturation", r.post.saturation), F("post.contrast", r.post.contrast),
        F("post.grain", r.post.grain), V("post.tint", r.post.tint), F("post.tintMix", r.post.tintMix),
        F("ssr.intensity", r.ssr.intensity), F("ssr.replace", r.ssr.replace),
        F("ssr.roughCut", r.ssr.roughCut), F("ssr.roughMax", r.ssr.roughMax),
        F("ssr.thickness", r.ssr.thickness), F("ssr.maxDistance", r.ssr.maxDistance),
        F("volumetric.intensity", r.volumetric.intensity), F("volumetric.densityScale", r.volumetric.densityScale),
        F("volumetric.anisotropy", r.volumetric.anisotropy), F("volumetric.tint", r.volumetric.tint),
        F("volumetric.maxDistance", r.volumetric.maxDistance), F("volumetric.fadeStart", r.volumetric.fadeStart),
        F("envIntensity", r.envIntensity), F("detailScale", r.detailScale), F("detailFade", r.detailFade),
        F("parallaxDepth", r.parallaxDepth), F("parallaxFade", r.parallaxFade),
        F("windStrength", r.windStrength), V("windDir", r.windDir),
    };
#undef F
#undef V
#undef I
    return m;
}

std::string trim(const std::string& s) {
    const auto a = s.find_first_not_of(" \t\r\n");
    if (a == std::string::npos) return {};
    const auto b = s.find_last_not_of(" \t\r\n");
    return s.substr(a, b - a + 1);
}
} // namespace

std::vector<std::string> tunableNames() {
    std::vector<std::string> out;
    for (const auto& kv : registry()) out.push_back(kv.first);
    return out;
}

bool setTunable(Renderer& r, const std::string& key, const std::string& value, std::string* error) {
    const auto it = registry().find(trim(key));
    if (it == registry().end()) {
        if (error) *error = "unknown key '" + key + "'";
        return false;
    }
    std::string v = value;
    for (char& c : v) if (c == ',') c = ' ';
    std::istringstream in(v);
    if (it->second.f) {
        float x; if (!(in >> x)) { if (error) *error = key + ": expected a number"; return false; }
        *it->second.f(r) = x;
    } else if (it->second.i) {
        int x; if (!(in >> x)) { if (error) *error = key + ": expected an integer"; return false; }
        *it->second.i(r) = x;
    } else {
        glm::vec3 x;
        if (!(in >> x.x >> x.y >> x.z)) { if (error) *error = key + ": expected three numbers"; return false; }
        if (it->first == "sun.direction" || it->first == "windDir") x = glm::normalize(x);
        *it->second.v(r) = x;
    }
    return true;
}

int TunableFile::reloadIfChanged(Renderer& r) {
    std::error_code ec;
    const auto stamp = std::filesystem::last_write_time(m_path, ec);
    if (ec || (m_loaded && stamp == m_stamp)) return 0;
    m_stamp = stamp;
    m_loaded = true;
    std::ifstream f(m_path);
    int applied = 0;
    std::string line;
    for (int n = 1; std::getline(f, line); ++n) {
        if (const auto h = line.find('#'); h != std::string::npos) line.resize(h);
        const auto eq = line.find('=');
        if (trim(line).empty()) continue;
        std::string err;
        if (eq == std::string::npos || !setTunable(r, line.substr(0, eq), line.substr(eq + 1), &err))
            std::fprintf(stderr, "%s:%d: %s\n", m_path.string().c_str(), n,
                         err.empty() ? "expected key = value" : err.c_str());
        else
            ++applied;
    }
    return applied;
}

} // namespace game::rendering
