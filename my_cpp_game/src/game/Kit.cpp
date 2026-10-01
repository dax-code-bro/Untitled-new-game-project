#include "game/Kit.hpp"
#include "game/Lesc.hpp"
#include "geometry/Shapes.hpp"

#include <glm/gtc/quaternion.hpp>
#include <glm/gtc/type_ptr.hpp>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace game::play {

using nlohmann::json;

namespace {

template <class T>
T get(const json& j, const char* k, T fallback) {
    const auto it = j.find(k);
    return (it == j.end() || it->is_null()) ? fallback : it->get<T>();
}
glm::vec3 vec3(const json& j) { return {j.at(0).get<float>(), j.at(1).get<float>(), j.at(2).get<float>()}; }
template <class V>
std::vector<V> pack(const std::vector<float>& f) {
    constexpr size_t n = sizeof(V) / sizeof(float);
    std::vector<V> v(f.size() / n);
    if (!v.empty()) std::memcpy(v.data(), f.data(), v.size() * sizeof(V));
    return v;
}

} // namespace

/* Rigid blend of two affine matrices: translation lerped, rotation slerped,
   scale lerped. A part between two recorded frames. */
glm::mat4 blendRigid(const glm::mat4& a, const glm::mat4& b, float t) {
    if (t <= 0.0f) return a;
    if (t >= 1.0f) return b;
    auto split = [](const glm::mat4& m, glm::vec3& s, glm::quat& q) {
        s = {glm::length(glm::vec3(m[0])), glm::length(glm::vec3(m[1])), glm::length(glm::vec3(m[2]))};
        glm::mat3 r(glm::vec3(m[0]) / std::max(s.x, 1e-9f), glm::vec3(m[1]) / std::max(s.y, 1e-9f),
                    glm::vec3(m[2]) / std::max(s.z, 1e-9f));
        if (glm::determinant(r) < 0.0f) { s.x = -s.x; r[0] = -r[0]; }
        q = glm::quat_cast(r);
    };
    glm::vec3 sa, sb;
    glm::quat qa, qb;
    split(a, sa, qa);
    split(b, sb, qb);
    const glm::mat3 r = glm::mat3_cast(glm::slerp(qa, qb, t));
    const glm::vec3 s = glm::mix(sa, sb, t);
    glm::mat4 o(1.0f);
    o[0] = glm::vec4(r[0] * s.x, 0.0f);
    o[1] = glm::vec4(r[1] * s.y, 0.0f);
    o[2] = glm::vec4(r[2] * s.z, 0.0f);
    o[3] = glm::mix(a[3], b[3], t);
    return o;
}

KitFile::KitFile(const std::filesystem::path& path, rendering::MaterialLibrary& lib) {
    const Lesc f(path);
    const json& doc = f.doc;
    if (get(doc, "kind", std::string()) != "kit") throw std::runtime_error("kit: " + path.string() + " is not a kit file");

    // ---- meshes, with the web primitives' winding repaired (SceneFile.hpp explains) ----
    std::vector<const rendering::Mesh*> meshes;
    for (const auto& jm : doc.at("meshes")) {
        geometry::MeshData d;
        d.positions = pack<glm::vec3>(f.array<float>(jm.at("positions")));
        d.normals = pack<glm::vec3>(f.array<float>(jm.at("normals")));
        d.uvs = pack<glm::vec2>(f.array<float>(jm.at("uvs")));
        if (!jm.at("tangents").is_null()) d.tangents = pack<glm::vec4>(f.array<float>(jm.at("tangents")));
        if (!jm.at("colors").is_null()) d.colors = pack<glm::vec3>(f.array<float>(jm.at("colors")));
        if (!jm.at("joints").is_null() && !jm.at("weights").is_null()) {
            d.joints = pack<glm::vec4>(f.array<float>(jm.at("joints")));
            d.weights = pack<glm::vec4>(f.array<float>(jm.at("weights")));
        }
        d.indices = f.array<uint32_t>(jm.at("indices"));
        bool ok = !d.indices.empty() && d.normals.size() == d.positions.size();
        for (uint32_t i : d.indices) if (i >= d.positions.size()) { ok = false; break; }
        if (!ok) { meshes.push_back(nullptr); continue; }
        if (d.uvs.size() != d.positions.size()) d.uvs.assign(d.positions.size(), glm::vec2(0.0f));
        for (size_t t = 0; t + 2 < d.indices.size(); t += 3) {
            const uint32_t a = d.indices[t], b = d.indices[t + 1], c = d.indices[t + 2];
            const glm::vec3 face = glm::cross(d.positions[b] - d.positions[a], d.positions[c] - d.positions[a]);
            if (glm::dot(face, d.normals[a] + d.normals[b] + d.normals[c]) < 0.0f) std::swap(d.indices[t + 1], d.indices[t + 2]);
        }
        if (d.tangents.size() != d.positions.size()) geometry::computeTangents(d);
        geometry::computeBounds(d);
        m_meshes.push_back(std::make_unique<rendering::Mesh>(d));
        meshes.push_back(m_meshes.back().get());
    }

    // ---- materials, as SceneFile reads them ----
    std::vector<const rendering::Material*> mats;
    for (const auto& jm : doc.at("materials")) {
        rendering::Material m;
        m.color = vec3(jm.at("color"));
        m.roughness = get(jm, "roughness", 0.8f);
        m.metalness = get(jm, "metalness", 0.0f);
        m.emissive = vec3(jm.at("emissive"));
        m.emissiveStrength = get(jm, "emissiveStrength", 1.0f);
        m.opacity = get(jm, "opacity", 1.0f);
        m.transparent = get(jm, "transparent", false);
        m.doubleSided = get(jm, "doubleSided", false);
        m.uvScale = get(jm, "uvScale", 1.0f);
        m.worldUv = get(jm, "worldUv", false);
        m.normalStrength = get(jm, "normalStrength", 1.0f);
        m.detail = get(jm, "detail", 1.0f);
        m.parallax = get(jm, "parallax", 1.0f);
        m.castShadow = get(jm, "castShadow", true);
        m.receiveShadow = get(jm, "receiveShadow", true);
        m.subsurface = get(jm, "subsurface", 0.0f);
        m.thin = get(jm, "thin", true);
        m.clearcoat = get(jm, "clearcoat", 0.0f);
        m.clearcoatRoughness = get(jm, "clearcoatRoughness", 0.1f);
        m.sheen = get(jm, "sheen", 0.0f);
        m.sheenColor = vec3(jm.at("sheenColor"));
        m.sheenRoughness = get(jm, "sheenRoughness", 0.3f);
        const std::string tex = get(jm, "texture", std::string());
        if (!tex.empty()) {
            try { m.maps = lib.maps(tex, get(jm, "seed", 1u)); }
            catch (const std::exception& e) { std::fprintf(stderr, "[kit] texture '%s': %s\n", tex.c_str(), e.what()); }
        }
        m_materials.push_back(m);
        mats.push_back(&m_materials.back());
    }

    // ---- rigs ----
    for (const auto& jr : doc.at("rigs")) {
        KitRig rig;
        rig.name = jr.at("name").get<std::string>();
        rig.kind = jr.at("kind").get<std::string>();
        rig.floor = get(jr, "floor", 0.0f);
        rig.height = get(jr, "height", 1.8f);
        if (jr.contains("muzzleRest") && jr.at("muzzleRest").is_array()) rig.muzzleRest = vec3(jr.at("muzzleRest"));
        rig.rootPart = get(jr, "rootPart", -1);
        if (jr.contains("muzzleLocal") && jr.at("muzzleLocal").is_array()) { rig.muzzleLocal = vec3(jr.at("muzzleLocal")); rig.hasMuzzleLocal = true; }
        for (const auto& jp : jr.at("parts")) {
            KitPart p;
            const int mi = jp.at("mesh").get<int>();
            p.mesh = (mi >= 0 && mi < static_cast<int>(meshes.size())) ? meshes[static_cast<size_t>(mi)] : nullptr;
            p.material = mats.at(jp.at("material").get<size_t>());
            const auto& pr = jp.at("params");
            p.params = {pr.at(0).get<float>(), pr.at(1).get<float>(), pr.at(2).get<float>(), pr.at(3).get<float>()};
            p.palette = jp.at("palette").get<int>();
            p.name = get(jp, "name", std::string());
            rig.parts.push_back(p);
        }
        for (const auto& b : jr.at("palettes")) rig.paletteBones.push_back(b.get<int>());
        const size_t P = rig.parts.size();
        for (const auto& [cname, jc] : jr.at("clips").items()) {
            KitClip c;
            c.fps = jc.at("fps").get<float>();
            c.loop = jc.at("loop").get<bool>();
            const auto model = f.array<float>(jc.at("model"));
            const auto vis = f.array<float>(jc.at("vis"));
            c.frames = P ? static_cast<int>(vis.size() / P) : 0;
            c.model.resize(model.size() / 16);
            for (size_t k = 0; k < c.model.size(); ++k) c.model[k] = glm::make_mat4(&model[k * 16]);
            c.vis.resize(vis.size());
            for (size_t k = 0; k < vis.size(); ++k) c.vis[k] = vis[k] > 0.5f ? 1 : 0;
            const auto& pals = jc.at("pal");
            for (size_t pi = 0; pi < pals.size(); ++pi) {
                const auto data = f.array<float>(pals[pi]);
                const int bones = rig.paletteBones.at(pi);
                std::vector<const gl::Texture*> frames;
                for (int fr = 0; fr < c.frames; ++fr) {
                    gl::TextureDesc td;
                    td.width = std::max(1, bones * 4);
                    td.height = 1;
                    td.internalFormat = GL_RGBA32F;
                    td.minFilter = td.magFilter = GL_NEAREST;
                    m_palettes.emplace_back(td);
                    m_palettes.back().upload(0, td.width, 1, GL_RGBA, GL_FLOAT,
                                             data.data() + static_cast<size_t>(fr) * bones * 16);
                    frames.push_back(&m_palettes.back());
                }
                c.palette.push_back(std::move(frames));
            }
            if (jc.contains("muzzle") && !jc.at("muzzle").is_null()) {
                const auto mz = f.array<float>(jc.at("muzzle"));
                for (size_t k = 0; k + 2 < mz.size(); k += 3) c.muzzle.emplace_back(mz[k], mz[k + 1], mz[k + 2]);
            }
            rig.clips.emplace(cname, std::move(c));
        }
        m_rigs.push_back(std::move(rig));
    }

    // ---- weapons ----
    if (doc.contains("weapons"))
        for (const auto& [id, jw] : doc.at("weapons").items()) {
            WeaponDef w;
            w.id = id;
            w.name = get(jw, "name", id);
            w.damage = get(jw, "damage", 30.0f);
            w.headMul = get(jw, "headMul", 2.0f);
            w.refire = get(jw, "refire", 0.2f);
            w.reload = get(jw, "reload", 2.0f);
            w.spread = get(jw, "spread", 1.0f);
            w.adsSpread = get(jw, "adsSpread", 0.35f);
            w.kick = get(jw, "kick", 1.0f);
            w.sightFov = get(jw, "sightFov", 0.8f);
            w.adsTime = get(jw, "adsTime", 0.2f);
            w.recoilUp = get(jw, "recoilUp", 1.0f);
            w.recoilSide = get(jw, "recoilSide", 0.3f);
            w.recover = get(jw, "recover", 9.0f);
            w.mag = get(jw, "mag", 8);
            w.reserve = get(jw, "reserve", 40);
            w.pellets = get(jw, "pellets", 1);
            w.automatic = get(jw, "auto", false);
            m_weapons[id] = w;
        }
    if (doc.contains("camera")) m_fov = get(doc.at("camera"), "fov", 1.0f);
}

const KitRig* KitFile::rig(const std::string& name) const {
    for (const auto& r : m_rigs) if (r.name == name) return &r;
    return nullptr;
}

std::vector<const KitRig*> KitFile::zombies() const {
    std::vector<const KitRig*> out;
    for (const auto& r : m_rigs) if (r.kind == "zombie") out.push_back(&r);
    return out;
}

void KitRig::pose(const KitClip& c, float t, std::vector<glm::mat4>& model, std::vector<uint8_t>& vis, int& frame) const {
    const size_t P = parts.size();
    model.resize(P);
    vis.resize(P);
    if (c.frames <= 0) { frame = 0; return; }
    float ft = t * c.fps;
    if (c.loop && c.frames > 1) ft = std::fmod(std::max(0.0f, ft), static_cast<float>(c.frames - 1));
    ft = std::clamp(ft, 0.0f, static_cast<float>(c.frames - 1));
    const int f0 = static_cast<int>(std::floor(ft));
    const int f1 = std::min(f0 + 1, c.frames - 1);
    const float u = ft - f0;
    frame = u < 0.5f ? f0 : f1;
    for (size_t i = 0; i < P; ++i) {
        const glm::mat4& a = c.model[static_cast<size_t>(f0) * P + i];
        const glm::mat4& b = c.model[static_cast<size_t>(f1) * P + i];
        model[i] = blendRigid(a, b, u);
        vis[i] = c.vis[static_cast<size_t>(frame) * P + i];
    }
}

void KitRig::emitPose(const KitClip& c, int frame, const std::vector<glm::mat4>& model, const std::vector<uint8_t>& vis,
                      const glm::mat4& world, std::vector<rendering::DrawItem>& out) const {
    for (size_t i = 0; i < parts.size(); ++i) {
        const KitPart& p = parts[i];
        if (!p.mesh || !vis[i]) continue;
        rendering::DrawItem it;
        it.mesh = p.mesh;
        it.material = p.material;
        it.model = world * model[i];
        it.params = p.params;
        if (p.palette >= 0 && p.mesh->skinned() && p.palette < static_cast<int>(c.palette.size()) &&
            frame < static_cast<int>(c.palette[static_cast<size_t>(p.palette)].size())) {
            it.boneTexture = c.palette[static_cast<size_t>(p.palette)][static_cast<size_t>(frame)];
            it.boneCount = paletteBones[static_cast<size_t>(p.palette)];
        }
        out.push_back(it);
    }
}

void KitRig::emit(const std::string& name, float t, const glm::mat4& world, std::vector<rendering::DrawItem>& out,
                  glm::vec4 tint) const {
    const KitClip* c = clip(name);
    if (!c) return;
    std::vector<glm::mat4> model;
    std::vector<uint8_t> vis;
    int frame = 0;
    pose(*c, t, model, vis, frame);
    const size_t first = out.size();
    emitPose(*c, frame, model, vis, world, out);
    for (size_t i = first; i < out.size(); ++i) out[i].params *= glm::vec4(glm::vec3(tint), 1.0f);
}

} // namespace game::play
