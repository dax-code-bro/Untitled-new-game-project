#include "scene/SceneFile.hpp"
#include "scene/Foliage.hpp"
#include "scene/Scatter.hpp"
#include "scene/BuildingKit.hpp"

#include <nlohmann/json.hpp>
#include <glm/gtc/type_ptr.hpp>
#include <glm/trigonometric.hpp>

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <map>
#include <stdexcept>

namespace game::scene {

using nlohmann::json;

namespace {

struct Blob {
    const uint8_t* data = nullptr;
    size_t size = 0;

    template <class T>
    std::vector<T> array(const json& ref) const {
        const size_t off = ref.at("off").get<size_t>();
        const size_t count = ref.at("count").get<size_t>();
        if (off + count * sizeof(T) > size) throw std::runtime_error("scene: array runs past the blob");
        std::vector<T> v(count);
        std::memcpy(v.data(), data + off, count * sizeof(T));
        return v;
    }
};

glm::vec3 vec3(const json& j) { return {j.at(0).get<float>(), j.at(1).get<float>(), j.at(2).get<float>()}; }

template <class V>
std::vector<V> pack(const std::vector<float>& f) {
    constexpr size_t n = sizeof(V) / sizeof(float);
    std::vector<V> v(f.size() / n);
    std::memcpy(v.data(), f.data(), v.size() * sizeof(V));
    return v;
}

// Flip every triangle whose face normal opposes its vertex normals.
size_t repairWinding(geometry::MeshData& m) {
    size_t flipped = 0;
    for (size_t t = 0; t + 2 < m.indices.size(); t += 3) {
        const uint32_t a = m.indices[t], b = m.indices[t + 1], c = m.indices[t + 2];
        const glm::vec3 face = glm::cross(m.positions[b] - m.positions[a], m.positions[c] - m.positions[a]);
        const glm::vec3 vn = m.normals[a] + m.normals[b] + m.normals[c];
        if (glm::dot(face, vn) < 0.0f) {
            std::swap(m.indices[t + 1], m.indices[t + 2]);
            ++flipped;
        }
    }
    return flipped;
}

/* THE PRIMITIVES, AT DESKTOP TESSELLATION.
 * The web engine builds its shared primitives for a phone: a sphere is
 * 20x28, a cylinder 20 sides, a capsule 8x16 -- a silhouette you can count
 * the facets on at 4K. They arrive tagged with the engine's cache key, so
 * the ones whose parameters the key carries are rebuilt here with the
 * native Shapes port (the same builders, bit-identical UV layout) at about
 * three to four times the segment count per axis. Boxes are exact already; rocks keep
 * their deliberate facets; everything bespoke uses its exported mesh. */
bool rebuildPrimitive(const std::string& key, geometry::MeshData& out) {
    namespace G = geometry;
    auto field = [&](int i) {
        size_t a = 0;
        for (int k = 0; k < i; ++k) a = key.find(':', a) + 1;
        return std::stod(key.substr(a, key.find(':', a) - a));
    };
    /* Measured, not guessed: at 112x160 spheres Coastline's instanced tree
       canopies alone put 64.7 M triangles into one 8K frame (shadows and
       probe included) -- a stills budget, not a play budget. 64x96 is 11x
       the web count, still round at 4K, and a third of the triangles. */
    if (key == "sphere")   { out = G::sphere(0.5, 64, 96); return true; }
    if (key == "cylinder") { out = G::cylinder(0.5, 1, 72, true); return true; }
    if (key == "cone")     { out = G::cone(0.5, 1, 72); return true; }
    if (key.rfind("torus:", 0) == 0)   { out = G::torus(1, field(3), 64, 128); return true; }
    if (key.rfind("capsule:", 0) == 0) { out = G::capsule(field(1), field(2), 24, 64); return true; }
    return false;
}

// Names the web map builders give their water surfaces -- 'lake',
// 'lake-far', 'pool-water' -- matched as whole words, so 'bench-seat' and
// 'seawall' are not the sea, and the lake's own bank and bed are ground.
std::vector<std::string> nameTokens(const std::string& n) {
    std::vector<std::string> out;
    std::string cur;
    for (char c : n) {
        if (c == '-' || c == ':' || c == '_' || c == ' ' || (c >= '0' && c <= '9')) {
            if (!cur.empty()) out.push_back(cur);
            cur.clear();
        } else {
            cur += c;
        }
    }
    if (!cur.empty()) out.push_back(cur);
    return out;
}
bool hasToken(const std::vector<std::string>& t, std::initializer_list<const char*> any) {
    for (const auto& x : t)
        for (const char* w : any)
            if (x == w) return true;
    return false;
}
// Tree canopies: the maps build them from spheres named for what they are.
bool isFoliageName(const std::string& n) {
    const auto t = nameTokens(n);
    return hasToken(t, {"crown", "canopy", "foliage", "bush", "hedge", "leaves", "shrub"}) ||
           (hasToken(t, {"tree"}) && !hasToken(t, {"trunk", "limb", "stump", "guard", "pit"}));
}

bool isWaterName(const std::string& n) {
    const auto t = nameTokens(n);
    return hasToken(t, {"lake", "water", "sea", "pond", "pool", "river", "ocean", "harbour", "harbor"}) &&
           !hasToken(t, {"bank", "bed", "deep", "post", "rail", "ladder", "edge", "wall", "tank", "can",
                         "pipe", "gun", "piling", "rim", "side", "floor"});
}

/* Outdoor ground, by name: what the scatter grows on, what gets puddles,
   and what has its albedo brought down to something a road could be. */
bool isGroundName(const std::vector<std::string>& t) {
    return hasToken(t, {"ground", "road", "pavement", "slab", "yard", "path", "plaza", "kerb", "footpath",
                        "apron", "tarmac", "forecourt", "driveway", "street", "square", "promenade",
                        "helipad", "lot", "car-park", "parking", "runway", "track", "lawn", "verge"}) &&
           !hasToken(t, {"wall", "roof", "cap", "post", "rail", "line", "sign", "lamp", "light", "marker"});
}
float luminance(const glm::vec3& c) { return 0.2126f * c.r + 0.7152f * c.g + 0.0722f * c.b; }
bool isStoneLike(const std::string& tex) {
    return tex == "concrete" || tex == "plaster" || tex == "dirt" || tex == "sand" || tex == "rock" ||
           tex == "tile" || tex == "gravel" || tex == "mud" || tex == "setts" || tex == "asphalt" ||
           tex == "brick" || tex == "marble";
}

template <class T>
T get(const json& j, const char* k, T fallback) {
    const auto it = j.find(k);
    return (it == j.end() || it->is_null()) ? fallback : it->get<T>();
}

} // namespace

SceneFile::SceneFile(const std::filesystem::path& path, rendering::MaterialLibrary& lib,
                     rendering::Renderer& r) {
    std::ifstream f(path, std::ios::binary);
    if (!f) throw std::runtime_error("scene: cannot open " + path.string());
    std::vector<uint8_t> file((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    if (file.size() < 12 || std::memcmp(file.data(), "LESC", 4) != 0)
        throw std::runtime_error("scene: not a LESC file: " + path.string());
    uint32_t version = 0, jsonBytes = 0;
    std::memcpy(&version, file.data() + 4, 4);
    std::memcpy(&jsonBytes, file.data() + 8, 4);
    if (version != 1) throw std::runtime_error("scene: unsupported version");
    if (12 + static_cast<size_t>(jsonBytes) > file.size()) throw std::runtime_error("scene: truncated");
    const json doc = json::parse(file.begin() + 12, file.begin() + 12 + jsonBytes);
    Blob blob{file.data() + 12 + jsonBytes, file.size() - 12 - jsonBytes};

    // ---- meshes ----
    std::vector<const rendering::Mesh*> meshes;
    std::vector<bool> isBox;          // unit cubes: these get the edge bevel
    std::vector<bool> isSphere;       // unit spheres: canopies are swapped for leaves
    std::vector<const rendering::Mesh*> foliage;   // a few leaf-cluster variants, built on demand
    std::vector<std::pair<glm::vec3, glm::vec3>> meshBounds;   // local AABB, for the scatter
    auto bound = [&](const geometry::MeshData& d) {
        glm::vec3 lo(1e30f), hi(-1e30f);
        for (const auto& p : d.positions) { lo = glm::min(lo, p); hi = glm::max(hi, p); }
        if (d.positions.empty()) lo = hi = glm::vec3(0.0f);
        meshBounds.emplace_back(lo, hi);
    };
    static const bool webTessellation = std::getenv("GAME_WEB_TESSELLATION") != nullptr;
    for (const auto& jm : doc.at("meshes")) {
        geometry::MeshData d;
        const auto key = jm.find("key");
        isBox.push_back(key != jm.end() && key->is_string() && key->get<std::string>() == "box");
        isSphere.push_back(key != jm.end() && key->is_string() && key->get<std::string>() == "sphere");
        if (!webTessellation && key != jm.end() && key->is_string() && rebuildPrimitive(key->get<std::string>(), d)) {
            ++m_stats.retessellated;
            bound(d);
            m_stats.vertices += d.positions.size();
            m_stats.triangles += d.indices.size() / 3;
            m_meshes.push_back(std::make_unique<rendering::Mesh>(d));
            meshes.push_back(m_meshes.back().get());
            continue;
        }
        d.positions = pack<glm::vec3>(blob.array<float>(jm.at("positions")));
        d.normals = pack<glm::vec3>(blob.array<float>(jm.at("normals")));
        d.uvs = pack<glm::vec2>(blob.array<float>(jm.at("uvs")));
        if (!jm.at("tangents").is_null()) d.tangents = pack<glm::vec4>(blob.array<float>(jm.at("tangents")));
        if (!jm.at("colors").is_null()) d.colors = pack<glm::vec3>(blob.array<float>(jm.at("colors")));
        if (jm.contains("joints") && !jm.at("joints").is_null() && !jm.at("weights").is_null()) {
            d.joints = pack<glm::vec4>(blob.array<float>(jm.at("joints")));
            d.weights = pack<glm::vec4>(blob.array<float>(jm.at("weights")));
        }
        d.indices = blob.array<uint32_t>(jm.at("indices"));
        if (d.normals.size() != d.positions.size()) throw std::runtime_error("scene: normals/positions mismatch");
        for (uint32_t i : d.indices)
            if (i >= d.positions.size()) throw std::runtime_error("scene: index out of range");
        if (d.uvs.size() != d.positions.size()) d.uvs.assign(d.positions.size(), glm::vec2(0.0f));
        // GAME_KEEP_WEB_WINDING=1 skips the repair, to reproduce the web
        // game's inside-out primitives for comparison.
        static const bool keepWeb = std::getenv("GAME_KEEP_WEB_WINDING") != nullptr;
        if (!keepWeb) m_stats.rewound += repairWinding(d);
        if (d.tangents.size() != d.positions.size()) geometry::computeTangents(d);
        geometry::computeBounds(d);
        bound(d);
        m_stats.vertices += d.positions.size();
        m_stats.triangles += d.indices.size() / 3;
        m_meshes.push_back(std::make_unique<rendering::Mesh>(d));
        meshes.push_back(m_meshes.back().get());
    }

    // ---- materials ----
    /* Which materials the map lays as outdoor ground or road, from the
       names of the draws that use them. */
    const size_t nMats = doc.at("materials").size();
    std::vector<char> matGround(nMats, 0), matRoad(nMats, 0);
    for (const auto& jd : doc.at("draws")) {
        const auto t = nameTokens(get(jd, "name", std::string()));
        const size_t mi = jd.at("material").get<size_t>();
        if (mi >= nMats) continue;
        if (isGroundName(t)) matGround[mi] = 1;
        if (hasToken(t, {"road", "tarmac", "asphalt", "runway"}) && !hasToken(t, {"line", "marking", "kerb"})) matRoad[mi] = 1;
    }
    std::vector<std::string> matTex;
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
        m.clearcoat = get(jm, "clearcoat", 0.0f);
        m.clearcoatRoughness = get(jm, "clearcoatRoughness", 0.1f);
        m.sheen = get(jm, "sheen", 0.0f);
        m.sheenColor = vec3(jm.at("sheenColor"));
        m.sheenRoughness = get(jm, "sheenRoughness", 0.3f);
        const auto tex = jm.find("texture");
        std::string texName = (tex != jm.end() && tex->is_string()) ? tex->get<std::string>() : std::string();
        const size_t mi = mats.size();
        const bool stoneLike = !texName.empty() && get(jm, "metalness", 0.0f) < 0.5f && isStoneLike(texName);
        if (stoneLike && matRoad[mi]) {
            texName = "asphalt";
            m.roughness = std::max(m.roughness, 0.85f);
        }
        matTex.push_back(texName);
        if (!texName.empty()) {
            try {
                m.maps = lib.maps(texName, get(jm, "seed", 1u));
            } catch (const std::exception& e) {
                std::fprintf(stderr, "[scene] material texture '%s': %s -- untextured\n",
                             texName.c_str(), e.what());
            }
        }
        /* NATIVE: ALBEDO IN A PHYSICAL RANGE. The multiplayer maps author
           their paving and walls at base colours of 0.8-0.9 over textures
           that are themselves light -- white paper -- which under a bright
           sky reads as a map with no materials at all. The cap is on what
           the surface actually reflects, base colour times the texture's
           own measured mean, against measured albedos: concrete paving
           ~0.3, dry earth and sand ~0.25, asphalt ~0.12, a rendered or
           stone wall up to ~0.5. */
        if (stoneLike && m.maps) {
            float cap = 0.5f;
            if (matGround[mi]) cap = (texName == "dirt" || texName == "sand" || texName == "mud") ? 0.25f : 0.30f;
            if (texName == "asphalt") cap = 0.12f;
            const float l = luminance(m.color * m.maps->albedoMean);
            if (std::getenv("GAME_SCATTER_VERBOSE"))
                std::fprintf(stderr, "[albedo] %-9s ground=%d road=%d mean=%.3f color=%.3f eff=%.3f cap=%.2f\n", texName.c_str(),
                             matGround[mi], matRoad[mi], luminance(m.maps->albedoMean), luminance(m.color), l, cap);
            if (l > cap) { m.color *= cap / l; ++m_stats.albedoCapped; }
            else if (texName == "asphalt" && l > 1e-4f && l < 0.06f) m.color *= 0.06f / l;   // not a black hole
        }
        m_materials.push_back(m);
        mats.push_back(&m_materials.back());
    }

    // ---- draws ----
    std::vector<WorldBox> world;    // every static instance as an AABB, for the scatter
    std::vector<KitBox> kitBoxes;   // every box instance, for the building kit
    const rendering::Mesh* unitBox = nullptr;
    for (const auto& jd : doc.at("draws")) {
        rendering::DrawItem it;
        it.mesh = meshes.at(jd.at("mesh").get<size_t>());
        if (isBox.at(jd.at("mesh").get<size_t>())) it.bevel = 0.03f;
        const std::string name = get(jd, "name", std::string());
        it.water = isWaterName(name);
        if (it.water) it.bevel = 0.0f;
        /* A canopy sphere becomes a crown of leaves. Four variants, chosen
           per draw, so neighbouring trees do not share one silhouette. */
        if (isSphere.at(jd.at("mesh").get<size_t>()) && isFoliageName(name)) {
            if (foliage.empty()) {
                for (uint32_t v = 0; v < 4; ++v) {
                    m_meshes.push_back(std::make_unique<rendering::Mesh>(foliageCluster(101u + v * 7919u)));
                    foliage.push_back(m_meshes.back().get());
                }
                // The distant variant: scenery a hundred metres off.
                m_meshes.push_back(std::make_unique<rendering::Mesh>(foliageCluster(977u, 380, 1.7f)));
                foliage.push_back(m_meshes.back().get());
            }
            const bool far = hasToken(nameTokens(name), {"far"});
            it.mesh = far ? foliage[4] : foliage[m_items.size() % 4];
            ++m_stats.foliage;
        }
        const size_t matIdx = jd.at("material").get<size_t>();
        it.material = mats.at(matIdx);
        it.grass = get(jd, "grass", false);
        const auto tokens = nameTokens(name);
        const bool foliageDraw = isSphere.at(jd.at("mesh").get<size_t>()) && isFoliageName(name);
        const auto& mat = *it.material;
        const bool glowing = luminance(mat.emissive * mat.emissiveStrength) > 0.05f;
        if (!it.water && !foliageDraw && !it.grass && !mat.transparent && !glowing && !jd.contains("bones")) {
            it.weathering = mat.metalness > 0.5f ? 0.5f : 1.0f;
            ++m_stats.weathered;
            if (matGround[matIdx] && isGroundName(tokens) && matTex[matIdx] != "grass" && !matTex[matIdx].empty() &&
                !hasToken(tokens, {"inside", "interior", "floor", "hall", "room"}))
                // Hard paving holds standing water; earth only darkens.
                it.wetGround = (matTex[matIdx] == "dirt" || matTex[matIdx] == "sand" || matTex[matIdx] == "mud" ||
                                matTex[matIdx] == "gravel") ? 0.45f : 1.0f;
        }
        if (jd.contains("bones")) {
            const auto pal = blob.array<float>(jd.at("bones"));
            const int bones = jd.at("boneCount").get<int>();
            if (static_cast<int>(pal.size()) != bones * 16) throw std::runtime_error("scene: bone palette size");
            gl::TextureDesc td;
            td.width = std::max(1, bones * 4);
            td.height = 1;
            td.internalFormat = GL_RGBA32F;
            td.minFilter = td.magFilter = GL_NEAREST;
            m_boneTextures.emplace_back(td);
            m_boneTextures.back().upload(0, td.width, 1, GL_RGBA, GL_FLOAT, pal.data());
            it.boneTexture = &m_boneTextures.back();
            it.boneCount = bones;
            ++m_stats.skinned;
        }
        if (jd.contains("instances")) {
            const auto raw = blob.array<float>(jd.at("instances"));
            static_assert(sizeof(rendering::Instance) == 20 * sizeof(float), "instance layout");
            m_instances.emplace_back(raw.size() / 20);
            std::memcpy(m_instances.back().data(), raw.data(), m_instances.back().size() * sizeof(rendering::Instance));
            it.instances = &m_instances.back();
            m_stats.instances += m_instances.back().size();
        } else {
            std::vector<float> e;
            for (const auto& x : jd.at("model")) e.push_back(x.get<float>());
            it.model = glm::make_mat4(e.data());
            const auto& p = jd.at("params");
            it.params = glm::vec4(p.at(0).get<float>(), p.at(1).get<float>(), p.at(2).get<float>(), p.at(3).get<float>());
            m_stats.instances += 1;
        }
        m_items.push_back(it);

        // The draw's instances as world AABBs, classified for the scatter.
        if (!jd.contains("bones")) {
            WorldBox::Kind kind = WorldBox::Solid;
            const std::string& tex = matTex[matIdx];
            if (it.water) kind = WorldBox::Water;
            else if (foliageDraw || it.grass) kind = WorldBox::Ignore;
            const auto& lb = meshBounds.at(jd.at("mesh").get<size_t>());
            auto add = [&](const glm::mat4& mdl) {
                glm::vec3 lo(1e30f), hi(-1e30f);
                for (int c = 0; c < 8; ++c) {
                    const glm::vec3 p((c & 1) ? lb.second.x : lb.first.x, (c & 2) ? lb.second.y : lb.first.y,
                                      (c & 4) ? lb.second.z : lb.first.z);
                    const glm::vec3 w = glm::vec3(mdl * glm::vec4(p, 1.0f));
                    lo = glm::min(lo, w);
                    hi = glm::max(hi, w);
                }
                WorldBox b{lo, hi, kind};
                const glm::vec3 e = hi - lo;
                if (kind == WorldBox::Solid && e.y <= 0.6f && e.x * e.z >= 3.0f) {
                    if (tex == "grass") b.kind = WorldBox::Lawn;
                    else if (tex == "dirt" || tex == "mud" || tex == "gravel") b.kind = WorldBox::Dirt;
                    else if (tex == "sand") b.kind = WorldBox::Sand;
                }
                world.push_back(b);
            };
            if (it.instances) for (const auto& in : *it.instances) add(in.model);
            else add(it.model);
        }
        if (isBox.at(jd.at("mesh").get<size_t>()) && !jd.contains("bones")) {
            unitBox = it.mesh;
            const size_t item = m_items.size() - 1;
            if (it.instances)
                for (size_t k = 0; k < it.instances->size(); ++k)
                    kitBoxes.push_back({(*it.instances)[k].model, name, it.material, matTex[matIdx], item, k});
            else
                kitBoxes.push_back({it.model, name, it.material, matTex[matIdx], item, SIZE_MAX});
        }
    }

    /* ---- NATIVE: the building kit (BuildingKit.hpp) ----
       Hipped tile roofs for the slabs, parapets and plant for flat roofs,
       framed windows on blank exterior walls. GAME_NO_KIT=1 turns it off. */
    static const bool noKit = std::getenv("GAME_NO_KIT") != nullptr;
    if (!noKit && unitBox) {
        KitResult kit = buildKit(kitBoxes, lib);
        std::map<size_t, std::vector<size_t>> drop;
        for (const auto& [item, inst] : kit.removed) drop[item].push_back(inst);
        std::vector<size_t> eraseItems;
        for (auto& [item, list] : drop) {
            auto& di = m_items[item];
            if (!di.instances) { eraseItems.push_back(item); continue; }
            auto& v = const_cast<std::vector<rendering::Instance>&>(*di.instances);
            std::sort(list.begin(), list.end());
            std::vector<rendering::Instance> keep;
            for (size_t k = 0; k < v.size(); ++k)
                if (!std::binary_search(list.begin(), list.end(), k)) keep.push_back(v[k]);
            v.swap(keep);
            if (v.empty()) eraseItems.push_back(item);
        }
        std::sort(eraseItems.rbegin(), eraseItems.rend());
        for (size_t e : eraseItems) m_items.erase(m_items.begin() + static_cast<long>(e));
        for (auto& part : kit.meshes) {
            m_meshes.push_back(std::make_unique<rendering::Mesh>(part.mesh));
            m_materials.push_back(part.material);
            rendering::DrawItem it;
            it.mesh = m_meshes.back().get();
            it.material = &m_materials.back();
            it.weathering = 1.0f;
            m_items.push_back(it);
        }
        for (auto& part : kit.boxes) {
            m_materials.push_back(part.material);
            m_instances.push_back(std::move(part.instances));
            rendering::DrawItem it;
            it.mesh = unitBox;
            it.material = &m_materials.back();
            it.instances = &m_instances.back();
            const bool glassy = part.material.roughness < 0.1f && !part.material.maps;
            it.bevel = glassy ? 0.0f : 0.012f;
            it.weathering = glassy ? 0.0f : 0.7f;
            m_stats.instances += it.instances->size();
            m_items.push_back(it);
        }
        m_stats.roofs = kit.roofs;
        m_stats.flatRoofs = kit.flatRoofs;
        m_stats.windows = kit.windows;
    }

    /* ---- NATIVE: the ground scatter (Scatter.hpp) ----
       Grass on the lawns, weeds on bare earth and up against every wall
       foot, stones on dirt and sand. GAME_NO_SCATTER=1 turns it off. */
    static const bool noScatter = std::getenv("GAME_NO_SCATTER") != nullptr;
    if (!noScatter) {
        ScatterResult sc = scatterGround(world, 0x5ca77e5u);
        if (std::getenv("GAME_SCATTER_VERBOSE")) {
            size_t k[6] = {};
            for (const auto& b : world) ++k[b.kind];
            std::fprintf(stderr, "[scatter] boxes: %zu solid, %zu lawn, %zu dirt, %zu sand, %zu water, %zu ignored -> "
                         "%zu grass, %zu weeds, %zu stones\n", k[0], k[1], k[2], k[3], k[4], k[5],
                         sc.grass.size(), sc.weeds.size(), sc.stones.size());
            for (const auto& b : world)
                if (b.kind >= WorldBox::Lawn && b.kind <= WorldBox::Water && (b.hi.x - b.lo.x) * (b.hi.z - b.lo.z) > 400.0f)
                    std::fprintf(stderr, "  kind %d  (%.1f %.2f %.1f) .. (%.1f %.2f %.1f)\n", b.kind, b.lo.x, b.lo.y, b.lo.z, b.hi.x, b.hi.y, b.hi.z);
        }
        auto addDraw = [&](geometry::MeshData md, std::vector<rendering::Instance>&& inst, const rendering::Material& m, bool grass) {
            if (inst.empty()) return;
            m_meshes.push_back(std::make_unique<rendering::Mesh>(md));
            m_materials.push_back(m);
            m_instances.push_back(std::move(inst));
            rendering::DrawItem it;
            it.mesh = m_meshes.back().get();
            it.material = &m_materials.back();
            it.instances = &m_instances.back();
            it.grass = grass;
            m_stats.scattered += it.instances->size();
            m_stats.instances += it.instances->size();
            m_items.push_back(it);
        };
        rendering::Material blade;
        blade.color = glm::vec3(0.115f, 0.19f, 0.045f);
        blade.roughness = 0.62f;
        blade.subsurface = 0.45f;
        blade.sheen = 0.3f;
        blade.sheenColor = glm::vec3(0.75f, 0.85f, 0.55f);
        blade.sheenRoughness = 0.5f;
        blade.castShadow = false;   // a tuft's own root darkening sells it; 90k shadow casters do not
        blade.parallax = 0.0f;
        addDraw(grassTuft(17u, 11, false), std::move(sc.grass), blade, true);
        rendering::Material straw = blade;
        straw.color = glm::vec3(0.22f, 0.20f, 0.09f);
        straw.sheenColor = glm::vec3(0.9f, 0.85f, 0.6f);
        addDraw(grassTuft(29u, 8, true), std::move(sc.weeds), straw, true);
        rendering::Material stone;
        stone.color = glm::vec3(0.30f, 0.28f, 0.25f);
        stone.roughness = 0.9f;
        stone.parallax = 0.0f;
        try { stone.maps = lib.maps("rock", 7u); } catch (const std::exception&) {}
        addDraw(geometry::rock(0.5, 11u, 1), std::move(sc.stones), stone, false);
    }

    // ---- the world the map was lit in ----
    const auto& env = doc.at("env");
    const auto& sun = env.at("sun");
    r.sun.direction = glm::normalize(vec3(sun.at("direction")));
    r.sun.color = vec3(sun.at("color"));
    r.sun.intensity = sun.at("intensity").get<float>();
    const auto& sky = env.at("sky");
    r.sky.zenith = vec3(sky.at("zenith"));
    r.sky.horizon = vec3(sky.at("horizon"));
    r.sky.ground = vec3(sky.at("ground"));
    r.sky.intensity = get(sky, "intensity", 1.0f);
    r.sky.clouds = get(sky, "clouds", 0.0f);
    r.sky.room = vec3(sky.at("room"));
    r.sky.occlusion = get(sky, "occlusion", 0.45f);
    r.sky.bounce = get(sky, "bounce", 0.7f);
    const auto& fog = env.at("fog");
    r.fog.color = vec3(fog.at("color"));
    r.fog.density = get(fog, "density", 0.008f);
    r.fog.height = get(fog, "height", 0.0f);
    r.fog.falloff = get(fog, "falloff", 0.08f);
    r.fog.skyBlend = get(fog, "skyBlend", 0.85f);
    const auto& sh = env.at("shadows");
    r.shadows.distance = get(sh, "distance", 60.0f);
    r.shadows.strength = get(sh, "strength", 0.86f);
    r.shadows.split = get(sh, "split", 14.0f);
    r.shadows.softness = get(sh, "softness", 0.00463f);
    r.shadows.enabled = get(sh, "enabled", true);
    const auto& post = env.at("post");
    r.post.exposure = get(post, "exposure", 1.0f);
    r.post.toneMap = get(post, "toneMap", 0);
    r.post.bloom = get(post, "bloom", 0.55f);
    r.post.bloomThreshold = get(post, "bloomThreshold", 1.1f);
    r.post.vignette = get(post, "vignette", 0.55f);
    r.post.chromatic = get(post, "chromatic", 0.0018f);
    r.post.saturation = get(post, "saturation", 1.08f);
    r.post.contrast = get(post, "contrast", 1.04f);
    r.post.grain = get(post, "grain", 0.012f);
    r.lights.clear();
    for (const auto& jl : env.at("lights")) {
        rendering::PointLight l;
        l.position = vec3(jl.at("position"));
        l.color = vec3(jl.at("color"));
        l.intensity = jl.at("intensity").get<float>();
        l.radius = jl.at("radius").get<float>();
        r.lights.push_back(l);
    }
    if (env.contains("wind") && !env.at("wind").is_null()) {
        r.windDir = glm::normalize(vec3(env.at("wind").at("direction")));
        r.windStrength = env.at("wind").at("strength").get<float>();
    }
    r.detailScale = get(env, "detailScale", r.detailScale);
    r.detailFade = get(env, "detailFade", r.detailFade);
    r.parallaxDepth = get(env, "parallaxDepth", r.parallaxDepth);
    r.parallaxFade = get(env, "parallaxFade", r.parallaxFade);

    /* ---- NATIVE: the map's light, re-set for this renderer ----
       The web maps were lit for a fixed exposure and a painted sky. Here:
       the camera meters (auto exposure, centred on mid-grey); a daytime map
       gets the physical sky; a sun the builder left near noon -- flat,
       shadowless light, every box top the same white -- comes down to 40
       degrees on its own bearing, so walls model and shadows fall long; and
       the haze thins, because a haze tuned to hide a phone's draw distance
       is not needed here. GAME_WEB_LIGHT=1 keeps the web light. */
    static const bool webLight = std::getenv("GAME_WEB_LIGHT") != nullptr;
    if (!webLight) {
        r.post.autoKey = 0.2f;
        const float elev = std::asin(std::clamp(r.sun.direction.y, -1.0f, 1.0f));
        const bool day = r.sky.horizon.b > r.sky.horizon.r && elev > 0.2f;
        if (day) {
            r.sky.model = 1;
            constexpr float kMax = glm::radians(40.0f);
            if (elev > glm::radians(50.0f)) {
                glm::vec2 az(r.sun.direction.x, r.sun.direction.z);
                az = glm::length(az) > 1e-4f ? glm::normalize(az) : glm::vec2(0.4f, 0.9165f);
                r.sun.direction = glm::normalize(glm::vec3(az.x * std::cos(kMax), std::sin(kMax), az.y * std::cos(kMax)));
            }
            r.fog.density *= 0.6f;
            r.post.contrast = std::max(r.post.contrast, 1.08f);
            r.post.saturation = std::max(r.post.saturation, 1.1f);
        }
    }

    const auto& cam = doc.at("camera");
    m_camera.position = vec3(cam.at("position"));
    m_camera.target = vec3(cam.at("target"));
    m_camera.fov = cam.at("fov").get<float>();
    m_camera.nearZ = get(cam, "near", 0.1f);
    m_camera.farZ = get(cam, "far", 500.0f);

    m_stats.meshes = m_meshes.size();
    m_stats.materials = m_materials.size();
    m_stats.draws = m_items.size();
    m_stats.lights = r.lights.size();
}

} // namespace game::scene
