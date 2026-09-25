#include "game/Security.h"
#include <cmath>

namespace ps {

int SecuritySystem::addCamera(const std::string& name, vec3 pos, float yaw, float pitch, int placedId) {
    SecurityCamera c;
    c.id = nextCameraId++;
    c.name = name;
    c.pos = pos;
    c.yaw = yaw;
    c.pitch = pitch;
    c.placedId = placedId;
    cameras.push_back(c);
    return c.id;
}

void SecuritySystem::removeCameraForPlaced(int placedId) {
    for (size_t i = 0; i < cameras.size(); ++i)
        if (cameras[i].placedId == placedId) { cameras.erase(cameras.begin() + long(i)); return; }
}

float SecuritySystem::incidentChance(int guards, float securityBudgetMonthly) const {
    float p = 0.035f;
    if (gateLocked) p *= 0.35f;
    else if (gateManualOpen) p *= 1.6f;          // left open overnight
    int online = 0;
    for (auto& c : cameras) online += c.online ? 1 : 0;
    p /= 1.0f + 0.35f * float(online);
    p *= guards > 0 ? 0.25f : 1.0f;
    p *= 1.0f / (1.0f + securityBudgetMonthly / 600.0f);
    return p;
}

}  // namespace ps
