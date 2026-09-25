// The office computer ("ShelterOS"): Animals, Security (cameras, gate,
// locks), Finances (taxes, income, payroll, budget) and Ratings (private
// and public).
#pragma once
#include "game/Sim.h"
#include "render/Renderer.h"
#include "world/Facility.h"
#include <vector>

namespace ps {

class ComputerUI {
public:
    enum Tab { TabAnimals, TabSecurity, TabFinances, TabRatings, TabCount };
    int tab = TabFinances;
    int selectedCamera = 0;
    bool open = false;

    void init(Renderer& r);
    // Renders the selected security camera feed into a texture (call before ImGui).
    void renderFeed(Renderer& r, const Renderer::SceneFn& scene, const Sim& sim, float time);
    // Returns false when the user closes the computer.
    bool draw(Sim& sim, const Facility& facility);

private:
    void drawAnimals(Sim& sim);
    void drawSecurity(Sim& sim, const Facility& facility);
    void drawFinances(Sim& sim);
    void drawRatings(Sim& sim);
    Renderer::Target feed_;
    bool feedReady_ = false;
    int financeTab_ = 0;
};

}  // namespace ps
