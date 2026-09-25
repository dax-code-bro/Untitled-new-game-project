// Headless tests for the simulation core (no GPU needed).
#include "core/SaveFile.h"
#include "game/Character.h"
#include "game/Sim.h"
#include "world/Collision.h"
#include "world/Layout.h"
#include "world/Terrain.h"
#include <cmath>
#include <cstdio>
#include <string>

static int g_fail = 0, g_pass = 0;
#define CHECK(cond)                                                                   \
    do {                                                                              \
        if (cond) ++g_pass;                                                           \
        else { ++g_fail; std::printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); } \
    } while (0)

using namespace ps;

// Build wall colliders the same way the game does (walls split around openings).
static void addWalls(CollisionWorld& cw) {
    for (const auto& w : layout::walls()) {
        float a = w.a, b = w.b;
        std::vector<std::pair<float, float>> solid{{a, b}};
        for (const auto& o : w.openings) {
            if (o.isWindow()) continue;
            std::vector<std::pair<float, float>> next;
            for (auto [s, e] : solid) {
                float os = o.center - o.width / 2, oe = o.center + o.width / 2;
                if (oe <= s || os >= e) { next.push_back({s, e}); continue; }
                if (os > s) next.push_back({s, os});
                if (oe < e) next.push_back({oe, e});
            }
            solid = next;
        }
        for (auto [s, e] : solid) {
            float t = layout::kWallThick / 2;
            if (w.alongX) cw.addBox(AABB({s, 0, w.fixed - t}, {e, layout::kCeilingY, w.fixed + t}));
            else cw.addBox(AABB({w.fixed - t, 0, s}, {w.fixed + t, layout::kCeilingY, e}));
        }
    }
    for (const auto& r : layout::rooms())
        cw.addBox(AABB({r.minX, 0, r.minZ}, {r.maxX, layout::kFloorY, r.maxZ}), true);
}

int main() {
    // --- World size: 500 square miles ---
    double sqMiles = double(layout::kRegionSide) * layout::kRegionSide / (1609.344 * 1609.344);
    std::printf("Region: %.1f m per side = %.2f sq mi\n", layout::kRegionSide, sqMiles);
    CHECK(std::fabs(sqMiles - 500.0) < 0.5);

    // --- Terrain: flat at the facility, hilly far away ---
    CHECK(terrain::height(0, 0) == 0.0f);
    CHECK(terrain::height(0, 300) == 0.0f);
    float varied = 0;
    for (int i = 0; i < 50; ++i) varied += std::fabs(terrain::height(-9000.0f + i * 300.0f, -12000.0f));
    CHECK(varied > 100.0f);

    // --- Collision: walls block, doors let you through, barrier holds ---
    CollisionWorld cw;
    addWalls(cw);
    // Walk from the waiting room west into the wall (no door at z=4)
    vec3 p{-2.0f, layout::kFloorY, 4.0f};
    p = cw.moveCharacter(p, {-5.0f, 0, 0}, 0.3f, 1.8f);
    CHECK(p.x > -4.0f);
    // Walk west through the left hallway door (z=0.8)
    p = {-2.0f, layout::kFloorY, 0.8f};
    p = cw.moveCharacter(p, {-5.0f, 0, 0}, 0.3f, 1.8f);
    CHECK(p.x < -6.0f);
    CHECK(std::fabs(p.y - layout::kFloorY) < 0.01f);  // standing on the floor slab
    // Office door at x=-9 in wall z=1.6
    p = {-9.0f, layout::kFloorY, 0.8f};
    p = cw.moveCharacter(p, {0, 0, 3.0f}, 0.3f, 1.8f);
    CHECK(p.z > 3.0f);
    CHECK(layout::roomAt(p.x, p.z) && layout::roomAt(p.x, p.z)->name == "Office");
    // Barrier
    p = {0, 0, layout::kSouthEdge - 3.0f};
    p = cw.moveCharacter(p, {0, 0, 50.0f}, 0.3f, 1.8f);
    CHECK(p.z < layout::kSouthEdge);

    // --- Economy: payroll, taxes, missed payroll ---
    Sim sim;
    sim.newGame();
    CHECK(sim.econ.cash == 175000.0);
    CHECK(sim.staff.employees.size() == 2);
    sim.security.gateAutomatic = true;
    sim.advance(7 * 1440.0);
    CHECK(sim.econ.lifetime[size_t(Ledger::Payroll)] < 0.0);
    CHECK(sim.econ.lifetime[size_t(Ledger::PayrollTax)] < 0.0);
    double gross = -sim.econ.lifetime[size_t(Ledger::Payroll)];
    double ptax = -sim.econ.lifetime[size_t(Ledger::PayrollTax)];
    CHECK(std::fabs(ptax / gross - 0.0825) < 1e-6);
    CHECK(sim.visitorsTotal > 0);
    std::printf("After 1 week: cash $%.2f, visitors %lld, public %.1f, private %.1f\n", sim.econ.cash,
                sim.visitorsTotal, sim.ratings.publicRating, sim.ratings.privateRating);
    sim.advance(90 * 1440.0);
    CHECK(sim.econ.lifetime[size_t(Ledger::PropertyTax)] < 0.0);
    std::printf("After ~14 weeks: cash $%.2f, grade %s\n", sim.econ.cash, Economy::grade(sim.financialScore()));

    Sim broke;
    broke.newGame();
    broke.econ.cash = 50.0;
    float privBefore = broke.ratings.privateRating;
    broke.advance(7 * 1440.0);
    CHECK(broke.econ.missedPayrolls >= 1);
    CHECK(broke.ratings.privateRating < privBefore);

    // Closed gate means no visitors; that hurts the public rating over time
    Sim closed;
    closed.newGame();
    closed.security.gateAutomatic = false;
    closed.advance(3 * 1440.0);
    CHECK(closed.visitorsTotal == 0);

    // --- Building rules ---
    std::string why;
    CHECK(!validPlacement(BuildKind::KennelBlock, 0, 0, 0, {}, &why));         // on top of the building
    CHECK(!validPlacement(BuildKind::KennelBlock, 0, 200, 0, {}, &why));       // on the road
    CHECK(validPlacement(BuildKind::KennelBlock, 60, -40, 0, {}, &why));
    CHECK(!validPlacement(BuildKind::Bench, layout::kRegionMaxX + 10, 0, 0, {}, &why));  // beyond barrier
    int id = 0;
    double before = sim.econ.cash;
    CHECK(sim.build(BuildKind::SecurityCamera, 40, 20, 1, &why, &id));
    CHECK(sim.econ.cash < before);
    size_t cams = sim.security.cameras.size();
    CHECK(sim.demolish(id));
    CHECK(sim.security.cameras.size() == cams - 1);

    // --- Save / load round trip ---
    sim.build(BuildKind::DogRun, 80, -60, 0, &why);
    KeyValues kv;
    sim.save(kv);
    Appearance a;
    a.gender = Gender::Female;
    a.applyPreset(1);
    a.name = "Test Person";
    a.save(kv, "player.");
    const char* path = "ps_test_save.txt";
    CHECK(kv.write(path));
    KeyValues kv2;
    CHECK(kv2.read(path));
    Sim loaded;
    loaded.load(kv2);
    Appearance b;
    b.load(kv2, "player.");
    CHECK(std::fabs(loaded.econ.cash - sim.econ.cash) < 0.01);
    CHECK(loaded.placed.size() == sim.placed.size());
    CHECK(loaded.staff.employees.size() == sim.staff.employees.size());
    CHECK(b.name == "Test Person" && b.gender == Gender::Female && b.topStyle == 2);
    std::remove(path);

    std::printf("\n%d passed, %d failed\n", g_pass, g_fail);
    return g_fail == 0 ? 0 : 1;
}
