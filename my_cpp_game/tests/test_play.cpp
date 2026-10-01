/* THE NATIVE ZOMBIES ROUND, PLAYED BY A BOT.
 *
 *   test_play scenes/bunker-nine.lescene scenes/kit.lekit [seconds]
 *
 * Loads an exported zombies map and the recorded kit, puts the autopilot at
 * the controls and plays (unrendered, at the fixed 1/60 step) for the given
 * number of seconds, then checks the things that make it a game rather than
 * a scene:
 *
 *   collision    the map has solids, and a ray down from the start finds a floor
 *   navigation   the walk grid has nodes
 *   the round    zombies were spawned, came in through the windows, and the
 *                round count went up
 *   the guns     shots were fired and hit, zombies died, points were earned
 *   the player   stayed on the map (never fell through it)
 *   the rigs     every zombie and viewmodel clip has frames and finite matrices
 *
 * and then renders one frame of it with GL debug on: no errors. */
#include "core/GlDebug.hpp"
#include "core/Window.hpp"
#include "game/Hud.hpp"
#include "game/Kit.hpp"
#include "game/Lesc.hpp"
#include "game/Zombies.hpp"
#include "rendering/Material.hpp"
#include "rendering/Renderer.hpp"
#include "rendering/ShaderLibrary.hpp"
#include "scene/SceneFile.hpp"

#include <glad/gl.h>

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>

using namespace game;

static int g_fail = 0;
static void check(bool ok, const std::string& what) {
    std::printf("  %s %s\n", ok ? "ok  " : "FAIL", what.c_str());
    if (!ok) ++g_fail;
}

int main(int argc, char** argv) {
    if (argc < 3) { std::fprintf(stderr, "usage: test_play map.lescene kit.lekit [seconds]\n"); return 2; }
    const float seconds = argc > 3 ? static_cast<float>(std::atof(argv[3])) : 240.0f;
    core::Window window(64, 64, "test-play", false);
    core::installGlDebug();
    rendering::ShaderLibrary shaders(GAME_SOURCE_DIR "/shaders");
    rendering::Renderer renderer(shaders, rendering::Quality::ultra());
    renderer.resize(640, 360);
    rendering::MaterialLibrary materials(256);
    scene::SceneFile map(argv[1], materials, renderer);
    play::KitFile kit(argv[2], materials);

    std::printf("the kit\n");
    check(!kit.zombies().empty(), std::to_string(kit.zombies().size()) + " zombie bodies recorded");
    int clips = 0, bad = 0;
    for (const char* r : {"m1911", "thompson", "scatter"}) {
        const play::KitRig* rig = kit.rig(r);
        check(rig && rig->clip("idle") && rig->clip("fire") && rig->clip("reload") && rig->clip("ads"),
              std::string(r) + ": idle, fire, aimed and reload recorded");
    }
    std::vector<const play::KitRig*> all = kit.zombies();
    for (const char* r : {"m1911", "thompson", "scatter"}) if (kit.rig(r)) all.push_back(kit.rig(r));
    for (const auto* rig : all)
        for (const auto& [n, c] : rig->clips) {
            ++clips;
            if (c.frames <= 0 || c.model.size() != static_cast<size_t>(c.frames) * rig->parts.size()) ++bad;
            for (const auto& m : c.model)
                for (int k = 0; k < 16; ++k) if (!std::isfinite(m[k / 4][k % 4])) { ++bad; break; }
        }
    check(bad == 0, std::to_string(clips) + " clips, every frame complete and finite");
    for (const auto* z : kit.zombies())
        check(z->height > 1.3f && z->height < 2.3f, z->name + " stands " + std::to_string(z->height) + " m");

    std::printf("the round (%.0f s, autopilot)\n", seconds);
    const play::Lesc scene(argv[1]);
    play::ZombiesGame game(scene, kit, map.camera(), 7);
    std::vector<std::pair<std::string, rendering::DrawItem>> boards;
    for (const auto& [name, idx] : map.named()) {
        const auto& src = map.items()[idx];
        if (!src.instances) { boards.emplace_back(name, src); continue; }
        for (const auto& in : *src.instances) {
            rendering::DrawItem d = src;
            d.instances = nullptr;
            d.model = in.model;
            d.params = in.params;
            boards.emplace_back(name, d);
        }
    }
    game.adoptBoards(boards);
    check(boards.size() >= 8, std::to_string(boards.size()) + " window boards found in the map");
    check(game.hulls() > 50, std::to_string(game.hulls()) + " collision hulls");
    check(game.navNodes() > 500, std::to_string(game.navNodes()) + " walkable nodes");
    const float startY = game.playerPos().y;
    float lowest = startY;
    const int steps = static_cast<int>(seconds * 60.0f);
    for (int s = 0; s < steps; ++s) {
        game.update(1.0f / 60.0f, game.autopilot(1.0f / 60.0f));
        lowest = std::min(lowest, game.playerPos().y);
    }
    const auto& st = game.stats();
    std::printf("        round %d (best %d), %d spawned, %d climbed in, %d kills (%d headshots), %d/%d shots hit, %d points, %d downs\n",
                st.round, st.maxRound, st.spawned, st.climbed, st.kills, st.headshots, st.hits, st.shots, st.points, st.downs);
    check(st.spawned > 5, "zombies spawned");
    check(st.climbed > 0, "zombies came in through the windows");
    check(st.boardsDown > 0, std::to_string(st.boardsDown) + " boards torn down (" + std::to_string(st.boardsRebuilt) + " rebuilt)");
    check(st.shots > 10 && st.hits > 0, "the guns fired and hit");
    check(st.kills > 3, "zombies died");
    check(st.maxRound >= 2, "the round count went up (reached round " + std::to_string(st.maxRound) + ")");
    check(st.points > 500, "points were earned");
    check(lowest > startY - 3.0f, "the player stayed on the map (lowest " + std::to_string(lowest) + ")");

    std::printf("a frame of it\n");
    rendering::Camera cam = map.camera();
    std::vector<rendering::DrawItem> items = map.items();
    std::vector<rendering::PointLight> lights = renderer.lights;
    game.frame(cam, items, lights);
    renderer.lights = lights;
    renderer.render(items, cam, 1.0f / 60.0f);
    play::Hud hud(shaders);
    hud.begin(renderer.output().width(), renderer.output().height());
    game.hud(hud);
    hud.end(renderer.output().id());
    glFinish();
    check(core::glDebugErrorCount() == 0, "no GL errors (" + std::to_string(core::glDebugErrorCount()) + ")");
    check(items.size() > map.items().size(), std::to_string(items.size() - map.items().size()) + " dynamic draws (zombies, viewmodel)");

    std::printf("%s\n", g_fail ? "FAILED" : "all passed");
    return g_fail ? 1 : 0;
}
