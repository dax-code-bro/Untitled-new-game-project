#include "rendering/Camera.hpp"
#include <glm/gtc/matrix_transform.hpp>

namespace game::rendering {

Camera& Camera::update(float aspectRatio) {
    aspect      = aspectRatio;
    view        = glm::lookAt(position, target, up);
    proj        = glm::perspective(fov, aspect, nearZ, farZ);
    viewProj    = proj * view;
    invViewProj = glm::inverse(viewProj);
    invProj     = glm::inverse(proj);
    invView     = glm::inverse(view);
    forward     = glm::normalize(target - position);
    right       = glm::normalize(glm::cross(forward, up));
    trueUp      = glm::normalize(glm::cross(right, forward));
    return *this;
}

} // namespace game::rendering
