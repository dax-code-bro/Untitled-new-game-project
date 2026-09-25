#pragma once
#include "geometry/Shapes.hpp"
#include "rendering/Renderer.hpp"

#include <string>
#include <vector>

namespace game::scene {

/* NATIVE: THE BUILDING KIT -- architecture from the map's own boxes.
 *
 * The web maps build a house as four wall boxes and a slab, so from any
 * height every building is a flat-topped block, and a wall is twelve metres
 * of blank brick. Working only from the names the map builders gave their
 * boxes ('house-roof', 'church-roof', 'bakery-wall' ...):
 *
 *   ROOFS    A slab over a house, church, shed, bakery, cabana, pavilion or
 *            boathouse becomes a hipped roof of clay tiles on its own
 *            footprint, with a fascia and a soffit; Coastline's stepped
 *            stacks of shrinking slabs -- a pyramid drawn in boxes --
 *            become the one roof they stood for, at the height they
 *            reached. A hangar gets a barrel vault. Commercial flat roofs
 *            keep their slab and gain a parapet and plant (AC units, vents).
 *   WINDOWS  An exterior wall of a roofed building -- the face pointing away
 *            from its roof's centre, on the footprint's edge -- gets framed,
 *            sill-hung windows at a storey's rhythm wherever nothing else
 *            (a door, an existing window, a neighbouring wall) is in the way.
 *
 * Box-shaped parts come back as instances of the scene's own unit box, so
 * they get the bevel and the weathering like everything else. */

struct KitBox {
    glm::mat4 model{1.0f};
    std::string name;
    const rendering::Material* material = nullptr;
    std::string texture;       // the material's recipe name
    size_t item = 0, instance = 0;   // where it came from, for removal
};

struct KitResult {
    std::vector<std::pair<size_t, size_t>> removed;   // (item, instance) replaced by a roof
    struct MeshPart {
        geometry::MeshData mesh;
        rendering::Material material;
    };
    struct BoxPart {
        std::vector<rendering::Instance> instances;
        rendering::Material material;
    };
    std::vector<MeshPart> meshes;
    std::vector<BoxPart> boxes;
    size_t roofs = 0, flatRoofs = 0, windows = 0;
};

KitResult buildKit(const std::vector<KitBox>& boxes, rendering::MaterialLibrary& lib);

} // namespace game::scene
