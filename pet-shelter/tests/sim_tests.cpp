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

    // ---- Species catalog: the exact class counts the owner asked for ----
    CHECK(speciesCount(AnimalClass::Small) == 20);
    CHECK(speciesCount(AnimalClass::Medium) == 40);
    CHECK(speciesCount(AnimalClass::Large) == 20);
    CHECK(speciesCount(AnimalClass::Feral) == 40);
    CHECK(speciesCount(AnimalClass::Restricted) == 19);
    {
        bool allCoats = true;
        for (const auto& sp : speciesCatalog()) allCoats &= !sp.coats.empty() && !sp.fact.empty() && !sp.scientific.empty();
        CHECK(allCoats);
        CHECK(findSpecies("Dachshund") >= 0 && findSpecies("Holland Lop") >= 0 && findSpecies("Bengal Tiger") >= 0);
        std::printf("species: %zu\n", speciesCatalog().size());
    }
    // ---- Animals in a running shelter ----
    {
        Sim s;
        s.newGame();
        CHECK(s.animalsInCare() == 3);                 // Frank the dachshund + two rabbits
        std::string why;
        s.econ.cash = 2e6;
        CHECK(s.build(BuildKind::KennelBlock, 40.0f, -20.0f, 0, &why));
        CHECK(s.build(BuildKind::SmallAnimalHouse, 60.0f, -20.0f, 0, &why));
        CHECK(s.build(BuildKind::SurgeryWing, -40.0f, -30.0f, 0, &why));
        // Surgery: an overdose kills, a correct dose with clamped bleeders saves
        Animal& a = s.admit(findSpecies("Labrador Retriever"), "Test", 1.0f);
        a.needsSurgery = true; a.condition = "Swallowed a toy (intestinal blockage)"; a.status = AnimalStatus::Sick;
        int id = a.id;
        CHECK(s.beginSurgery(id, &why));
        s.surgeryAnesthetize(s.surgery.idealMgPerKg);
        s.surgeryIncise(); s.surgeryClamp(); s.surgeryRepair(); s.surgeryRepair(); s.surgerySuture();
        CHECK(s.findAnimal(id)->status == AnimalStatus::Recovering && !s.surgery.died);
        Animal& b = s.admit(findSpecies("Beagle"), "Test", 1.0f);
        int bid = b.id;
        CHECK(s.beginSurgery(bid, &why));
        s.surgeryAnesthetize(s.surgery.idealMgPerKg * 2.6f);
        s.surgeryIncise();
        for (int i = 0; i < 200 && s.surgery.active; ++i) s.surgeryTick(0.5f);
        CHECK(s.findAnimal(bid)->status == AnimalStatus::Dead);
        // Feral animals need the surgery wing
        Sim s2; s2.newGame();
        Animal& deer = s2.admit(findSpecies("White-tailed Deer"), "Test", 1.0f);
        CHECK(!s2.beginSurgery(deer.id, &why));
        // Dangerous animal: calm + police = nobody hurt, ratings go up
        float pub0 = s.ratings.publicRating;
        s.startIncident(findSpecies("Bengal Tiger"));
        s.resolve(s.decisions.back().id, 0);
        s.advance(60.0);
        CHECK(!s.incident.active);
        CHECK(s.ratings.publicRating >= pub0 - 0.01f || s.incident.injured > 0);
        // Staff: a burned-out employee sent on a paid vacation feels better and likes you more
        Employee& e = s.staff.employees[0];
        e.fatigue = 0.9f; e.stress = 0.9f;
        float rel = e.relationship;
        CHECK(s.staffSendOnVacation(e.id, 7, true));
        CHECK(e.fatigue == 0.0f && e.stress < 0.3f && e.relationship > rel);
        // Declining the interview hurts the public rating
        float p1 = s.ratings.publicRating;
        s.scandal(9.0f, "Test scandal");
        CHECK(s.protest.active);
        const Decision* req = nullptr;
        for (auto& d : s.decisions) if (d.kind == DecisionKind::InterviewRequest) req = &d;
        CHECK(req != nullptr);
        if (req) s.resolve(req->id, 1);
        CHECK(s.ratings.publicRating < p1 - 12.0f);
        // A long run stays sane
        s.advance(1440.0 * 60);
        CHECK(s.animalsInCare() >= 0 && s.econ.cash == s.econ.cash);
        std::printf("after 60 days: %d in care, %d adopted, %d died, %d intake, public %.1f private %.1f, %zu decisions pending\n",
                    s.animalsInCare(), s.adoptionsTotal, s.deathsTotal, s.intakeTotal, double(s.ratings.publicRating),
                    double(s.ratings.privateRating), s.decisions.size());
        // Save / load keeps the animals
        KeyValues kv3;
        s.save(kv3);
        Sim s3;
        s3.load(kv3);
        CHECK(s3.animalsInCare() == s.animalsInCare());
    }

    // ---- Daily care, clinic check-ups and the hands-on surgical field ----
    {
        Sim s;
        s.newGame();
        s.econ.cash = 1e6;
        int frank = -1;
        for (auto& a : s.animalList) if (speciesCatalog()[size_t(a.species)].name == "Dachshund") frank = a.id;
        CHECK(frank >= 0);
        Animal* f = s.findAnimal(frank);
        CHECK(f && f->housing >= 0);                                  // lives in a container shelter
        CHECK(s.uncheckedToday() == 3);
        s.checkAnimal(frank);
        CHECK(s.uncheckedToday() == 2);
        f->hunger = 0.9f;
        CHECK(s.handFeed(frank) && f->hunger < 0.1f);               // dog food from the starter stock
        // Ultrasound finds a swallowed object; reading it right books surgery
        f->hidden = Hidden::ForeignBody;
        std::string why;
        CHECK(s.startExam(frank, &why));
        CHECK(s.exam.kind == ExamKind::Ultrasound && !s.examReady());
        s.advance(25.0);
        CHECK(s.examReady());
        CHECK(s.answerExam(Hidden::ForeignBody));
        CHECK(f->needsSurgery && f->diagnosed);
        // Surgery: a clean midline incision is safe; straying across an artery is not
        CHECK(s.beginSurgery(frank, &why));
        s.surgeryAnesthetize(s.surgery.idealMgPerKg);
        Surgery& S = s.surgery;
        vec2 prev = S.guideA;
        for (int i = 1; i <= 10; ++i) { vec2 p = S.guideA + (S.guideB - S.guideA) * (float(i) / 10.0f); s.surgeryCutTo(prev, p); prev = p; }
        CHECK(S.bloodLoss < 0.01f && S.organDamage < 0.01f);
        s.surgeryCutTo(prev, prev + vec2(-0.2f, 0.0f));               // slips sideways across the epigastric artery and aorta
        CHECK(S.bloodLoss > 0.25f && !S.bleeders.empty());
        while (!S.bleeders.empty()) s.surgeryClampAt(S.bleeders.front());
        CHECK(S.bleedersClamped);
        // Reach the target through the incision (extend toward it first)
        s.surgeryCutTo(prev, S.target);
        CHECK(s.surgeryTreatTargetAt(S.target));
        std::vector<vec2> cutCopy = S.cut;
        for (size_t i = 0; i + 1 < cutCopy.size() && S.active; ++i)
            for (float t = 0.0f; t < 1.0f && S.active; t += 0.1f) s.surgeryStitchAt(cutCopy[i] + (cutCopy[i + 1] - cutCopy[i]) * t);
        CHECK(!S.active && f->status != AnimalStatus::Dead);
        // Supplies arrive the next morning
        float before = s.food[size_t(FoodKind::Hay)];
        CHECK(s.orderFood(FoodKind::Hay, 25.0f));
        s.advance(1440.0);
        CHECK(s.food[size_t(FoodKind::Hay)] > before);
        // Land: only the home parcel is buyable at first, then its neighbors; the fence follows
        CHECK(!s.land.homeOwned() && s.land.fence().size() == 4);
        CHECK(!s.buyLand(Land::kHomeCol + 1, 0, &why));
        CHECK(s.buyLand(Land::kHomeCol, 0, &why));
        CHECK(s.land.canBuy(Land::kHomeCol + 1, 0) && !s.land.canBuy(Land::kHomeCol + 2, 0));
        CHECK(s.buyLand(Land::kHomeCol + 1, 0, &why));
        CHECK(s.land.fence().size() == 6 && s.land.ownedSqMi() > 1.9f);
    }

    std::printf("\n%d passed, %d failed\n", g_pass, g_fail);
    return g_fail == 0 ? 0 : 1;
}
