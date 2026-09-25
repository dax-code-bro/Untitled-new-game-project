#pragma once
#include "rendering/Renderer.hpp"

#include <deque>
#include <filesystem>
#include <memory>
#include <vector>

namespace game::scene {

/* A map exported from the web game by tools/export_scene.js, rebuilt on the
 * native renderer.
 *
 * Geometry arrives exactly as the web engine built it; textures do NOT --
 * each material carries its recipe name and seed and is re-baked here at
 * the native texture size (4096 for 4K), which is the point of the port.
 *
 * WINDING IS REPAIRED ON LOAD. The web primitives wind the box's top and
 * bottom, and every cylinder, cone and torus triangle, against their own
 * normals (measured: 4/12, 96/96, 48/48, 1728/1728), so with back-face
 * culling the web game draws them inside out and a box top shows its
 * bottom face. Every triangle whose face normal disagrees with its vertex
 * normals is flipped here, which is the same repair the C++ Shapes port
 * makes at the source. */
class SceneFile {
public:
    SceneFile(const std::filesystem::path& path, rendering::MaterialLibrary& materials,
              rendering::Renderer& renderer);

    [[nodiscard]] const std::vector<rendering::DrawItem>& items() const { return m_items; }
    [[nodiscard]] rendering::Camera camera() const { return m_camera; }

    struct Stats { size_t meshes = 0, materials = 0, draws = 0, instances = 0, vertices = 0,
                   triangles = 0, rewound = 0, lights = 0, skinned = 0,
                   retessellated = 0, foliage = 0, scattered = 0,
                   weathered = 0, albedoCapped = 0, roofs = 0, flatRoofs = 0, windows = 0, lawnTufts = 0,
                   trim = 0, trunks = 0, fittings = 0; };
    [[nodiscard]] const Stats& stats() const { return m_stats; }

private:
    std::deque<std::unique_ptr<rendering::Mesh>> m_meshes;
    std::deque<rendering::Material>              m_materials;
    std::deque<std::vector<rendering::Instance>> m_instances;
    std::deque<gl::Texture>                      m_boneTextures;
    std::deque<gl::Texture>                      m_fieldTextures;
    std::vector<const rendering::Mesh*>          m_mulchMesh;
    const rendering::Material*                   m_mulchMat = nullptr;
    std::vector<rendering::DrawItem>             m_items;
    rendering::Camera                            m_camera;
    Stats                                        m_stats;
};

} // namespace game::scene
