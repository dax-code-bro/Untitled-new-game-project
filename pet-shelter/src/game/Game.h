// Top-level game: window, state machine (menu -> character creator ->
// opening cutscene -> POV/Creative gameplay), HUD, pause menu, save/load.
#pragma once
#include "core/Input.h"
#include "game/AnimalActors.h"
#include "game/CharacterCreatorUI.h"
#include "game/CharacterModel.h"
#include "game/ComputerUI.h"
#include "game/CreativeMode.h"
#include "game/Cutscene.h"
#include "game/PlayerController.h"
#include "game/Sim.h"
#include "render/Renderer.h"
#include "world/World.h"
#include <chrono>
#include <deque>
#include <string>

struct GLFWwindow;

namespace ps {

class Game {
public:
    bool init(int argc, char** argv);
    int run();
    void tick();   // one frame (the browser build calls this from its main loop)
    void shutdown();

    // GLFW callback plumbing
    Input& input() { return input_; }
    void onResize(int w, int h);
    bool wantsPointerLock() const;
    int framesDrawn() const { return framesDrawn_; }
    int ticksStarted() const { return ticksStarted_; }
    // Touch (phone) support used by the web page
    int touchState() const;
    void touchPause();
    bool takeNameEditRequest();
    const std::string& playerName() const { return appearance_.name; }
    void setPlayerName(const std::string& n) { appearance_.name = n.substr(0, 40); }

private:
    enum class State { MainMenu, Creator, Cutscene, Playing, Computer, Paused, Dialog, Surgery };
    enum class Mode { POV, Creative };

    void frame(float dt);
    void update(float dt);
    void render(float dt);
    void drawUI();
    void drawMainMenu();
    void drawHUD();
    void drawPauseMenu();
    void drawSettings();
    void drawCutsceneOverlay();
    void drawToasts(float dt);
    void drawDecision();
    void drawSurgery();
    void drawIncidentBanner();
    bool inGame() const;

    void beginNewGame();
    void startCutscene();
    void startPlaying();
    void setMode(Mode m);
    bool saveGame();
    bool loadGame();
    bool saveExists() const;
    void takeScreenshot(const std::string& path);
    int runScreenshotSuite(const std::string& dir);
    int runAnimalStudio(const std::string& dir, const std::string& filter);   // AnimalStudio.cpp
    void scene(Renderer& r, Pass pass);

    GLFWwindow* window_ = nullptr;
    int width_ = 1600, height_ = 900;
    Input input_;
    Renderer renderer_;
    World world_;
    Sim sim_;
    Appearance appearance_;
    CharacterModel character_;
    PlayerController player_;
    CreativeMode creative_;
    Cutscene cutscene_;
    ComputerUI computer_;
    CharacterCreatorUI creatorUI_;
    AnimalActors animals_;
    int dialogDecision_ = -1;
    float surgeryDose_ = 0.0f;
    int surgeryPickAnimal_ = -1;
    Camera camera_;

    State state_ = State::MainMenu;
    Mode mode_ = Mode::POV;
    float time_ = 0.0f;           // real seconds since start (animation clock)
    float timeScale_ = 1.0f;      // game minutes per real second
    float fovDeg_ = 72.0f;
    bool vsync_ = true;
    bool showSettings_ = false;
    bool showHelp_ = true;
    bool characterDirty_ = true;
    Interaction hover_;
    std::string savePath_ = "saves/save1.txt";
    std::string screenshotDir_ = "screenshots";
    std::string message_;
    float messageTimer_ = 0.0f;
    struct Toast { std::string text; float t; };
    std::deque<Toast> toasts_;
    std::string screenshotSuiteDir_;
    std::string animalStudioDir_, animalStudioFilter_;
    bool animalStudioPoses_ = false;
    std::chrono::steady_clock::time_point lastTick_;
    bool browserLocked_ = false;
    bool touch_ = false;          // phone / tablet mode (--touch)
    int framesDrawn_ = 0;
    int ticksStarted_ = 0;
    bool low_ = false;            // low graphics mode (--low)
};

}  // namespace ps
