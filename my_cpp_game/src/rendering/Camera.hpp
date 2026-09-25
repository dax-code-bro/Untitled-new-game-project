#pragma once
#include <glm/glm.hpp>

namespace game::rendering {

/* The web engine's Camera (60-renderer.js), in glm. Right-handed, GL clip
 * space (-1..1 depth), looking down -Z in view space: glm::lookAt and
 * glm::perspective produce exactly the matrices Mat4.lookAt and
 * Mat4.perspective did, so every shader that reads them is unchanged. */
struct Camera {
    glm::vec3 position{0.0f, 4.0f, 10.0f};
    glm::vec3 target{0.0f, 1.0f, 0.0f};
    glm::vec3 up{0.0f, 1.0f, 0.0f};
    float fov    = glm::radians(55.0f);   // vertical, radians
    float nearZ  = 0.1f;
    float farZ   = 500.0f;
    float aspect = 1.0f;

    glm::mat4 view{1.0f}, proj{1.0f}, viewProj{1.0f};
    glm::mat4 invViewProj{1.0f}, invProj{1.0f}, invView{1.0f};
    glm::vec3 forward{0.0f, 0.0f, -1.0f}, right{1.0f, 0.0f, 0.0f}, trueUp{0.0f, 1.0f, 0.0f};

    Camera& update(float aspectRatio);
};

} // namespace game::rendering
