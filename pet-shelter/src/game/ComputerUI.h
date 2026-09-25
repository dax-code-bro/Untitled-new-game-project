// The office computer ("ShelterOS"): Animals, Security (cameras, gate,
// locks), Finances (taxes, income, payroll, budget) and Ratings (private
// and public).
#pragma once
#include "game/AnimalAnimator.h"
#include "game/Sim.h"
#include "render/Renderer.h"
#include "world/Facility.h"
#include <memory>
#include <vector>

namespace ps {

class ComputerUI {
public:
    enum Tab { TabInbox, TabAnimals, TabStaff, TabSecurity, TabFinances, TabRatings, TabCount };
    int tab = TabFinances;
    int selectedCamera = 0;
    bool open = false;
    bool compact = false;   // phone layout

    void init(Renderer& r);
    // Renders the selected security camera feed into a texture (call before ImGui).
    void renderFeed(Renderer& r, const Renderer::SceneFn& scene, const Sim& sim, float time);
    // Renders the selected animal's rotating 3D preview (call before ImGui).
    void renderPreview(Renderer& r, const Sim& sim, float dt, float time);
    // Returns false when the user closes the computer.
    bool draw(Sim& sim, const Facility& facility);
    void selectAnimal(int id) { selectedAnimal_ = id; }

private:
    void drawAnimals(Sim& sim);
    void drawStaff(Sim& sim);
    void drawInbox(Sim& sim);
    void drawSecurity(Sim& sim, const Facility& facility);
    void drawFinances(Sim& sim);
    void drawRatings(Sim& sim);
    Renderer::Target feed_;
    bool feedReady_ = false;
    int financeTab_ = 0;
    // Animal preview
    struct Preview {
        int animalId = -1;
        AnimalBuild build;
        SkinnedMesh mesh;
        AnimalAnimator anim;
        float yaw = 0.0f;
    };
    std::unique_ptr<Preview> preview_;
    Renderer::Target previewTarget_;
    Mesh previewGround_;
    bool previewReady_ = false;
    int selectedAnimal_ = -1;
    int animalFilter_ = 0;
    int previewAction_ = 0;
    int selectedStaff_ = -1;
};

}  // namespace ps
