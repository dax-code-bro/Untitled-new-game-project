// Security: cameras, the automatic gate, locks and gate permissions.
// Only the owner (you) is allowed to open the highway gate by hand.
#pragma once
#include "core/Math.h"
#include <string>
#include <vector>

namespace ps {

struct SecurityCamera {
    int id = 0;
    std::string name;
    vec3 pos;
    float yaw = 0.0f, pitch = -0.35f, fov = 1.2f;
    bool online = true;
    int placedId = -1;   // creative-mode object that owns it (-1 = built in)
};

struct SecuritySystem {
    std::vector<SecurityCamera> cameras;
    int nextCameraId = 1;

    bool gateAutomatic = false;   // opens for visitors during opening hours
    bool gateLocked = false;      // locked = stays shut, even in automatic mode
    bool gateManualOpen = false;  // owner opened it by hand / from the computer
    int openHour = 9, closeHour = 18;
    std::vector<bool> doorLocked; // one per building door
    std::vector<std::string> gateAccess{"You (Owner)"};
    int incidentsLast30 = 0;
    std::vector<int> incidentDays;

    bool isOpenHours(float hour) const { return hour >= float(openHour) && hour < float(closeHour); }
    bool gateShouldBeOpen(float hour) const {
        if (gateLocked) return false;
        if (gateManualOpen) return true;
        return gateAutomatic && isOpenHours(hour);
    }
    // Visitors can only get in if the gate lets them.
    bool visitorsCanEnter(float hour) const { return !gateLocked && (gateAutomatic || gateManualOpen); }
    bool canOperateGate(const std::string& who) const {
        for (auto& a : gateAccess) if (a == who) return true;
        return false;
    }
    int addCamera(const std::string& name, vec3 pos, float yaw, float pitch, int placedId = -1);
    void removeCameraForPlaced(int placedId);
    // Nightly chance of a break-in / vandalism.
    float incidentChance(int guards, float securityBudgetMonthly) const;
};

}  // namespace ps
