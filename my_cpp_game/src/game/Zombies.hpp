#pragma once
#include "game/Collision.hpp"
#include "game/Hud.hpp"
#include "game/Kit.hpp"
#include "game/Nav.hpp"
#include "rendering/Camera.hpp"
#include "rendering/Renderer.hpp"

#include <glm/glm.hpp>

#include <memory>
#include <random>
#include <string>
#include <vector>

namespace game::play {

struct Lesc;

/* What the player is asking for this step -- from the keyboard and mouse,
   a pad, or the autoplay bot that drives captures and the self-test. */
struct Input {
    glm::vec2 move{0.0f};       // x strafe right, y forward, each -1..1
    glm::vec2 look{0.0f};       // radians this step: x yaw right, y pitch up
    bool fire = false, firePressed = false, aim = false, reloadPressed = false;
    bool jumpPressed = false, sprint = false, restartPressed = false;
    bool interact = false;      // held: put a board back up at a window
    int  weaponSlot = -1;       // 0.. to switch
    int  weaponCycle = 0;       // +1 / -1 (mouse wheel)
};

/* THE ZOMBIES ROUND, NATIVE.
 *
 * The web game's rules for a round of Bunker Nine, on the native renderer:
 * the zombies come up out of the battlefield at the spawn pads, walk to
 * the windows, tear at the barricade, climb in and hunt you through the
 * house on a flow field; you have the M1911, the Thompson and the
 * Scattergun with the zombies game's own damage, rate of fire, magazine,
 * reserve, spread and recoil, and the viewmodels and the zombies are the
 * web game's own models moving exactly as they move there (tools/
 * export_kit.js records them). Rounds grow in count and health the way
 * the web game's do; points for hits, kills and headshots; health that
 * comes back if you stop getting hit; down and it is over, and it starts
 * again.
 *
 * The barricades are real: a zombie at a window tears its boards down one
 * at a time before it can climb in, and you put them back up (F, held) for
 * points.
 *
 * Not here (the web build remains the full game): the buyable doors,
 * perks, the mystery box, wall buys, power-ups, and the zombie variants
 * beyond the four recorded bodies. */
class ZombiesGame {
public:
    ZombiesGame(const Lesc& scene, const KitFile& kit, const rendering::Camera& start, uint32_t seed = 1);

    void update(float dt, const Input& in);
    /* The window boards, taken out of the static map so they can come down
       as a zombie tears at them and go back up when you rebuild them. Each
       is (window id, a single draw). */
    void adoptBoards(const std::vector<std::pair<std::string, rendering::DrawItem>>& boards);
    /* The camera for this frame and every dynamic draw (zombies, viewmodel,
       muzzle flash, blood). `lights` gets the frame's transient lights. */
    void frame(rendering::Camera& cam, std::vector<rendering::DrawItem>& out, std::vector<rendering::PointLight>& lights);
    void hud(Hud& h) const;
    /* A bot at the controls: turns to the nearest zombie it can see and
       shoots, reloads when empty, backs off when one is close. */
    Input autopilot(float dt);

    struct Stats { int round = 0, kills = 0, headshots = 0, shots = 0, hits = 0, points = 0, alive = 0,
                   downs = 0, maxAlive = 0, spawned = 0, climbed = 0, boardsDown = 0, boardsRebuilt = 0, maxRound = 0;
                   float health = 100; };
    [[nodiscard]] const Stats& stats() const { return m_stats; }
    [[nodiscard]] glm::vec3 playerPos() const { return m_pos; }
    [[nodiscard]] size_t navNodes() const { return m_nav ? m_nav->nodeCount() : 0; }
    [[nodiscard]] size_t hulls() const { return m_world.hullCount(); }

private:
    struct Window { std::string id; glm::vec3 pad, sill, inside, outside; bool active = true; };
    struct Zombie {
        enum State { Rising, Approach, Tear, Climb, Hunt, Attack, Dying, Gone } state = Rising;
        const KitRig* rig = nullptr;
        glm::vec3 pos{0.0f};
        float yaw = 0.0f, hp = 100.0f, speed = 1.0f, stateT = 0.0f, animT = 0.0f;
        float attackCd = 0.0f, hurtT = 0.0f;
        bool runner = false, struck = false, headDeath = false;
        int window = 0;
        std::string death = "zdie_back";
    };
    struct Puff { glm::vec3 pos; glm::vec3 vel; float t = 0.0f, life = 0.4f, size = 0.05f; bool blood = true; };
    struct Board { int window = -1; rendering::DrawItem item; bool down = false; };
    [[nodiscard]] int boardsUp(int window) const;
    void tearBoard(int window);

    void startRound(int n);
    void spawnZombie();
    void updatePlayer(float dt, const Input& in);
    void updateWeapon(float dt, const Input& in);
    void updateZombies(float dt);
    void fire();
    void hurtPlayer(float dmg);
    void restart();
    [[nodiscard]] glm::vec3 eye() const;
    [[nodiscard]] glm::vec3 aimDir() const;
    [[nodiscard]] float groundAt(const glm::vec3& p, float fallback) const;
    [[nodiscard]] bool canSee(const glm::vec3& a, const glm::vec3& b) const;

    CollisionWorld m_world;
    std::unique_ptr<NavGrid> m_nav;
    const KitFile& m_kit;
    std::vector<const KitRig*> m_bodies;
    std::vector<Window> m_windows;
    std::vector<Zombie> m_zombies;
    std::vector<Puff> m_puffs;
    std::mt19937 m_rng;

    // The player.
    glm::vec3 m_pos{0.0f}, m_vel{0.0f}, m_spawn{0.0f};
    float m_yaw = 0.0f, m_pitch = 0.0f, m_spawnYaw = 0.0f;
    float m_eyeH = 1.62f;
    bool m_grounded = false;
    float m_health = 100.0f, m_hurtT = 0.0f, m_regenT = 0.0f, m_deadT = 0.0f;
    float m_bob = 0.0f, m_bobAmp = 0.0f, m_landKick = 0.0f;
    glm::vec2 m_sway{0.0f};

    // The guns.
    struct Gun { const WeaponDef* def = nullptr; const KitRig* rig = nullptr; int mag = 0, reserve = 0; };
    std::vector<Gun> m_guns;
    int m_slot = 0, m_nextSlot = -1;
    float m_cool = 0.0f, m_reloadT = -1.0f, m_reloadDur = 2.0f, m_fireT = 99.0f, m_ads = 0.0f;
    float m_swapT = 0.0f;           // >0: lowering (first half) / raising (second half)
    float m_recoilPitch = 0.0f, m_recoilYaw = 0.0f, m_kick = 0.0f, m_kickVel = 0.0f, m_flashT = 99.0f;
    bool m_triggerUp = true;

    // The round.
    float m_roundBanner = 0.0f, m_intermission = 0.0f, m_spawnT = 0.0f, m_flowT = 0.0f;
    int m_toSpawn = 0, m_nextWindow = 0, m_nextBody = 0;
    float m_hitMarkT = 99.0f, m_time = 0.0f;
    std::vector<std::pair<std::string, float>> m_popups;   // "+60" and their age
    Stats m_stats;

    std::vector<Board> m_boards;
    float m_rebuildT = 0.0f;
    int m_nearWindow = -1;

    // Autopilot state.
    float m_botScan = 0.0f;
    int m_botTarget = -1;

    // Shared meshes for effects.
    std::unique_ptr<rendering::Mesh> m_sphere;
    rendering::Material m_bloodMat, m_dustMat, m_flashMat;
};

} // namespace game::play
