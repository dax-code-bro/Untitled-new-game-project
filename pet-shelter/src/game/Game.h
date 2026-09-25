// Top-level game: window, state machine (menu -> character creator ->
// opening cutscene -> POV/Creative gameplay), HUD, pause menu, save/load.
#pragma once
#include "core/Input.h"
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
    // Touch (phone) support used by the web page
    int touchState() const;
    void touchPause();
    bool takeNameEditRequest();
    const std::string& playerName() const { return appearance_.name; }
    void setPlayerName(const std::string& n) { appearance_.name = n.substr(0, 40); }

private:
    enum class State { MainMenu, Creator, Cutscene, Playing, Computer, Paused };
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

    void beginNewGame();
    void startCutscene();
    void startPlaying();
    void setMode(Mode m);
    bool saveGame();
    bool loadGame();
    bool saveExists() const;
    void takeScreenshot(const std::string& path);
    int runScreenshotSuite(const std::string& dir);
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
    std::chrono::steady_clock::time_point lastTick_;
    bool browserLocked_ = false;
    bool touch_ = false;
    int framesDrawn_ = 0;
    bool low_ = false;            // low graphics mode (--low)          // phone / tablet mode (--touch)
};

}  // namespace ps
