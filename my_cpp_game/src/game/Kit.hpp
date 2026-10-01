#pragma once
#include "rendering/Material.hpp"
#include "rendering/Mesh.hpp"
#include "rendering/Renderer.hpp"

#include <glm/glm.hpp>

#include <deque>
#include <filesystem>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace game::play {

/* THE RECORDED ZOMBIES AND VIEWMODELS (tools/export_kit.js).
 *
 * A rig is a fixed list of parts -- meshes with materials, some skinned --
 * and clips that say, frame by frame, where every part was (relative to the
 * zombie's root, or to the camera for a viewmodel), whether it was shown,
 * and what every skeleton's palette was. Playing a clip back is choosing a
 * frame: the part matrices are interpolated between the two nearest frames,
 * the palettes (one small texture per frame, uploaded at load) are taken
 * from the nearer one. */
struct WeaponDef {
    std::string id, name;
    float damage = 30, headMul = 2, refire = 0.2f, reload = 2, spread = 1, adsSpread = 0.35f, kick = 1;
    float sightFov = 0.8f, adsTime = 0.2f, recoilUp = 1, recoilSide = 0.3f, recover = 9;
    int   mag = 8, reserve = 40, pellets = 1;
    bool  automatic = false;
};

struct KitClip {
    float fps = 30.0f;
    int   frames = 0;
    bool  loop = false;
    std::vector<glm::mat4> model;              // frames x parts
    std::vector<uint8_t>   vis;                // frames x parts
    std::vector<std::vector<const gl::Texture*>> palette;   // [palette][frame]
    std::vector<glm::vec3> muzzle;             // per frame, camera space (viewmodels)
    [[nodiscard]] float duration() const { return frames > 1 ? (frames - 1) / fps : 0.0f; }
};

struct KitPart {
    const rendering::Mesh*     mesh = nullptr;
    const rendering::Material* material = nullptr;
    glm::vec4 params{1.0f, 1.0f, 1.0f, 0.0f};
    int palette = -1;
    std::string name;
};

struct KitRig {
    std::string name, kind;                    // kind: "zombie" | "view"
    std::vector<KitPart> parts;
    std::vector<int> paletteBones;
    std::map<std::string, KitClip> clips;
    float floor = 0.0f, height = 1.8f;         // zombie: lowest vertex below the root, standing height
    glm::vec3 muzzleRest{0.0f, -0.05f, -0.6f};
    int rootPart = -1;                         // viewmodel: the weapon's own part
    glm::vec3 muzzleLocal{0.3f, 0.0f, 0.0f};   // ...and its muzzle, in that part's space
    bool hasMuzzleLocal = false;
    [[nodiscard]] const KitClip* clip(const std::string& n) const {
        const auto it = clips.find(n);
        return it == clips.end() ? nullptr : &it->second;
    }
    /* Append this rig's draws at time t of `clip` under `world`. */
    void emit(const std::string& clip, float t, const glm::mat4& world, std::vector<rendering::DrawItem>& out,
              glm::vec4 tint = glm::vec4(1.0f)) const;
    /* The pose of every part at time t, for blending two clips (viewmodel hip -> aimed). */
    void pose(const KitClip& c, float t, std::vector<glm::mat4>& model, std::vector<uint8_t>& vis, int& frame) const;
    void emitPose(const KitClip& palettes, int frame, const std::vector<glm::mat4>& model, const std::vector<uint8_t>& vis,
                  const glm::mat4& world, std::vector<rendering::DrawItem>& out) const;
};

class KitFile {
public:
    KitFile(const std::filesystem::path& path, rendering::MaterialLibrary& materials);
    [[nodiscard]] const KitRig* rig(const std::string& name) const;
    [[nodiscard]] std::vector<const KitRig*> zombies() const;
    [[nodiscard]] const std::map<std::string, WeaponDef>& weapons() const { return m_weapons; }
    [[nodiscard]] float fov() const { return m_fov; }
    [[nodiscard]] size_t paletteTextures() const { return m_palettes.size(); }

private:
    std::deque<std::unique_ptr<rendering::Mesh>> m_meshes;
    std::deque<rendering::Material>              m_materials;
    std::deque<gl::Texture>                      m_palettes;
    std::vector<KitRig>                          m_rigs;
    std::map<std::string, WeaponDef>             m_weapons;
    float m_fov = 1.0f;
};

glm::mat4 blendRigid(const glm::mat4& a, const glm::mat4& b, float t);

} // namespace game::play
