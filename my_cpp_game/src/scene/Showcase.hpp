#pragma once
#include "rendering/Renderer.hpp"

#include <deque>
#include <memory>
#include <string>
#include <vector>

namespace game::scene {

/* The native showcase: a stone plaza at golden hour.
 *
 * Built to put every pass on screen at once rather than to be a level --
 * a low sun behind a marble colonnade throws long shadows and shafts
 * through the haze toward the camera (CSM + PCSS + volumetrics), a still
 * dark pool and a chrome sphere reflect all of it (SSR + the scene probe),
 * brick and setts show the baked 4K materials at a grazing angle
 * (parallax + detail normals), lanterns bloom, and grass moves in the
 * wind on the slopes around it. */
class Showcase {
public:
    Showcase(rendering::MaterialLibrary& materials, rendering::Renderer& renderer, int grassBlades = 24000);

    [[nodiscard]] const std::vector<rendering::DrawItem>& items() const { return m_items; }

    /* Named shots: hero, swatches, wall, pool, aerial, columns. Throws on
       an unknown name. */
    [[nodiscard]] rendering::Camera shot(const std::string& name) const;
    [[nodiscard]] static std::vector<std::string> shotNames();

    [[nodiscard]] static double groundHeight(double x, double z);

private:
    const rendering::Mesh* mesh(const geometry::MeshData& d);
    const rendering::Material* material(rendering::Material m);
    void add(const rendering::Mesh* mesh, const rendering::Material* mat, const glm::mat4& model,
             glm::vec4 params = glm::vec4(1, 1, 1, 0));

    std::deque<std::unique_ptr<rendering::Mesh>> m_meshes;
    std::deque<rendering::Material>              m_materials;
    std::deque<std::vector<rendering::Instance>> m_instances;
    std::vector<rendering::DrawItem>             m_items;
    const rendering::Mesh*                       m_boxMesh = nullptr;
};

} // namespace game::scene
