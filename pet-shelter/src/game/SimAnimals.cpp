// Animals: intake, housing, daily care, illness and injury, fights, adoption,
// deaths, the operating table and dangerous-animal incidents.
#include "game/Sim.h"
#include "world/Layout.h"
#include <algorithm>
#include <cmath>
#include <cstdio>

namespace ps {

const char* statusName(AnimalStatus s) {
    static const char* n[] = {"Healthy", "Sick", "Injured", "Critical", "Recovering", "Dead", "Adopted", "Released", "Transferred"};
    return n[int(s)];
}

float Animal::weightKg(const Species& sp) const {
    float f = ageFraction(sp);
    float sexScale = male ? 1.0f : sp.shape.femaleScale * sp.shape.femaleScale;
    return std::max(0.02f, sp.shape.weightKg * sexScale * weightFactor * std::pow(std::max(f, 0.05f), 1.6f));
}

float Animal::ageFraction(const Species& sp) const {
    float adultAt = std::max(0.3f, float(sp.lifespanYears) * 0.15f);
    return clampf(ageYears / adultAt, 0.05f, 1.0f);
}

BuildKind housingFor(const Species& sp) {
    if (sp.cls == AnimalClass::Restricted) return BuildKind::SecureEnclosure;
    if (sp.cls == AnimalClass::Feral) return BuildKind::FeralEnclosure;
    const std::string& c = sp.category;
    if (c == "Dog") return BuildKind::KennelBlock;
    if (c == "Cat") return BuildKind::CatHouse;
    if (sp.cls == AnimalClass::Large || c == "Goat" || c == "Sheep" || c == "Pig" || c == "Duck" || c == "Chicken")
        return BuildKind::Barn;
    return BuildKind::SmallAnimalHouse;
}

std::string randomAnimalName(Rng& rng, bool male) {
    static const char* m[] = {"Buddy", "Max", "Rocky", "Duke", "Tank", "Bandit", "Milo", "Oliver", "Jasper", "Rusty", "Scout",
                              "Bear", "Ziggy", "Pepper", "Gus", "Waffles", "Diesel", "Otis", "Hank", "Biscuit", "Copper",
                              "Moose", "Tucker", "Bruno", "Oreo", "Sarge", "Yoda", "Pickles", "Chester", "Rooster"};
    static const char* f[] = {"Bella", "Luna", "Daisy", "Lucy", "Rosie", "Sadie", "Molly", "Stella", "Ginger", "Penny",
                              "Hazel", "Willow", "Maple", "Nala", "Pearl", "Olive", "Clementine", "Dixie", "Honey", "Coco",
                              "Mabel", "Pixie", "Juniper", "Tilly", "Peaches", "Ruby", "Minnie", "Poppy", "Sassy", "Delilah"};
    return male ? m[rng.next() % (sizeof(m) / sizeof(*m))] : f[rng.next() % (sizeof(f) / sizeof(*f))];
}

Animal* Sim::findAnimal(int id) {
    for (auto& a : animalList) if (a.id == id) return &a;
    return nullptr;
}
const Animal* Sim::findAnimal(int id) const {
    for (auto& a : animalList) if (a.id == id) return &a;
    return nullptr;
}

int Sim::animalsInCare() const {
    int n = 0;
    for (auto& a : animalList) n += a.inCare() ? 1 : 0;
    return n;
}

// The starting building has crates in the medical room for a few small/medium animals.
static constexpr int kMedicalCrates = 4;

int Sim::housingCapacity(BuildKind k) const {
    int c = 0;
    for (auto& p : placed) if (p.kind == k) c += buildInfo(k).animalCapacity;
    return c;
}

int Sim::housingUsed(BuildKind k) const {
    int n = 0;
    for (auto& a : animalList) {
        if (!a.inCare() || a.housing < 0) continue;
        const Placed* p = findPlaced(a.housing);
        if (p && p->kind == k) ++n;
    }
    return n;
}

int Sim::housingBuildingFor(BuildKind k) const {
    for (auto& p : placed) {
        if (p.kind != k) continue;
        int used = 0;
        for (auto& a : animalList) used += (a.inCare() && a.housing == p.id) ? 1 : 0;
        if (used < buildInfo(k).animalCapacity) return p.id;
    }
    return -1;
}

bool Sim::buyProtectiveGear() {
    if (protectiveGear) return true;
    if (!econ.tryPay(clock.day(), Ledger::Medical, kGearCost, "Protective gear: bite sleeves, catch poles, face shields"))
        return false;
    protectiveGear = true;
    for (auto& e : staff.employees) e.gearIssued = true;
    log("Protective gear unlocked. Your staff can now handle feral animals safely.");
    ratings.shock(0.0f, 2.0f);
    return true;
}

Animal& Sim::admit(int species, const std::string& origin, float ageFrac, bool owned) {
    const Species& sp = speciesCatalog()[size_t(species)];
    Animal a;
    a.id = nextAnimalId++;
    a.species = species;
    a.male = rng.uniform() < 0.5f;
    a.name = randomAnimalName(rng, a.male);
    float adultAt = std::max(0.3f, float(sp.lifespanYears) * 0.15f);
    if (ageFrac < 0.0f) ageFrac = rng.uniform() < 0.22f ? rng.range(0.08f, 0.3f) : rng.range(0.4f, 1.0f) * 1.0f;
    a.ageYears = ageFrac < 1.0f ? ageFrac * adultAt : adultAt + rng.range(0.0f, float(sp.lifespanYears) * 0.5f);
    a.coat = int(rng.next() % std::max<size_t>(1, sp.coats.size()));
    a.seed = rng.next();
    a.weightFactor = rng.range(0.85f, 1.2f);
    a.arrivedDay = clock.day();
    a.origin = origin;
    a.owned = owned;
    a.stress = sp.cls == AnimalClass::Feral || sp.cls == AnimalClass::Restricted ? 0.8f : rng.range(0.3f, 0.6f);
    a.hunger = rng.range(0.1f, 0.6f);
    a.housing = housingBuildingFor(housingFor(sp));
    // Small and medium animals can use the container shelters behind the building
    if (a.housing < 0 && (sp.cls == AnimalClass::Small || sp.cls == AnimalClass::Medium) && !owned)
        a.housing = housingBuildingFor(BuildKind::ContainerShelter);
    intakeTotal += owned ? 0 : 1;
    animalList.push_back(a);
    return animalList.back();
}

void Sim::animalDied(Animal& a, const std::string& cause, bool neglect) {
    if (!a.alive()) return;
    const Species& sp = speciesCatalog()[size_t(a.species)];
    a.status = AnimalStatus::Dead;
    a.health = 0.0f;
    a.condition = cause;
    deathDays.push_back(clock.day());
    deathsTotal++;
    float hit = (neglect ? 5.0f : 2.5f) + (a.owned ? 4.0f : 0.0f) + (a.isBaby(sp) ? 1.5f : 0.0f);
    ratings.shock(-hit, neglect ? -2.5f : -1.0f);
    log(a.name + " the " + sp.name + " died: " + cause + ".");
    if (neglect || a.owned) scandal(0.0f, a.owned ? "A client's pet died in our care" : "Animal neglect");
}

bool Sim::adopt(int id) {
    Animal* a = findAnimal(id);
    if (!a || !a->inCare() || a->owned) return false;
    const Species& sp = speciesCatalog()[size_t(a->species)];
    if (sp.cls == AnimalClass::Feral || sp.cls == AnimalClass::Restricted) return false;
    if (a->status != AnimalStatus::Healthy) return false;
    a->status = AnimalStatus::Adopted;
    adoptionsTotal++;
    if (sp.adoptionFee > 0.0f) econ.post(clock.day(), Ledger::AdoptionFees, sp.adoptionFee, a->name + " (" + sp.name + ")");
    ratings.shock(0.35f, 0.15f);
    log(a->name + " the " + sp.name + " was adopted!");
    return true;
}

bool Sim::treat(int id) {
    Animal* a = findAnimal(id);
    if (!a || !a->inCare()) return false;
    if (a->status == AnimalStatus::Healthy && a->vaccinated) return false;
    const Species& sp = speciesCatalog()[size_t(a->species)];
    double cost = 40.0 + std::sqrt(std::max(1.0f, a->weightKg(sp))) * 12.0;
    if (!econ.tryPay(clock.day(), Ledger::Medical, cost, "Treatment: " + a->name)) return false;
    a->vaccinated = true;
    if (a->status == AnimalStatus::Sick || a->status == AnimalStatus::Injured) {
        if (!a->needsSurgery) { a->status = AnimalStatus::Recovering; a->condition.clear(); }
        a->bleeding *= 0.3f;   // bandaged
    }
    return true;
}

// ---------------------------------------------------------------------------
void Sim::animalsHourly(int h) {
    const int vets = staff.count(Role::Veterinarian) + staff.count(Role::VetTech);
    int careCapacity = 0;
    for (auto& e : staff.employees) {
        if (e.onVacation(clock.day())) continue;
        if (e.role == Role::Caretaker) careCapacity += int(12.0f * (1.1f - e.fatigue * 0.6f));
        if (e.role == Role::VetTech) careCapacity += 4;
    }
    int inCare = animalsInCare();
    float coverage = inCare == 0 ? 1.0f : clampf(float(careCapacity) / float(inCare), 0.0f, 1.0f);
    bool feeding = (h == 8 || h == 17);
    for (auto& a : animalList) {
        if (!a.inCare()) continue;
        const Species& sp = speciesCatalog()[size_t(a.species)];
        a.hunger = clampf(a.hunger + 0.012f, 0.0f, 1.0f);
        a.cleanliness = clampf(a.cleanliness - 0.008f, 0.0f, 1.0f);
        if (feeding && rng.uniform() < coverage) a.cleanliness = 1.0f;   // feeding itself is in careHourly (uses your supplies)
        // Health
        if (a.hunger > 0.85f) a.health -= 0.012f;
        if (a.bleeding > 0.0f) a.health -= a.bleeding * 0.03f;
        if (a.status == AnimalStatus::Sick) a.health -= 0.004f;
        if (a.status == AnimalStatus::Recovering) {
            a.health = std::min(1.0f, a.health + 0.01f);
            if (a.health > 0.9f) { a.status = AnimalStatus::Healthy; a.condition.clear(); }
        }
        if (a.status == AnimalStatus::Healthy) a.health = std::min(1.0f, a.health + 0.002f);
        if (a.health < 0.25f && a.status != AnimalStatus::Recovering) a.status = AnimalStatus::Critical;
        // Mood
        float crowd = a.housing < 0 ? 0.3f : 0.0f;
        float target = clampf(0.25f + sp.temperament * 0.3f + crowd + (1.0f - a.cleanliness) * 0.2f, 0.0f, 1.0f);
        a.stress += (target - a.stress) * 0.05f;
        a.happiness = clampf(0.9f - a.hunger * 0.5f - a.stress * 0.4f - (1.0f - a.health) * 0.5f + (1.0f - a.cleanliness) * -0.2f, 0.0f, 1.0f);
        if (a.health <= 0.0f)
            animalDied(a, a.bleeding > 0.2f ? "bled out from " + (a.condition.empty() ? std::string("its wounds") : a.condition)
                          : (a.hunger > 0.85f ? "starved - nobody fed it" : "untreated illness"),
                       a.hunger > 0.85f || (vets == 0 && a.status != AnimalStatus::Healthy));
    }
    // Staff vet works through the sick list during the day (not surgery - that's the operating table)
    if (vets > 0 && h >= 8 && h <= 17) {
        for (auto& a : animalList) {
            if (!a.inCare() || a.needsSurgery) continue;
            if (a.status != AnimalStatus::Sick && a.status != AnimalStatus::Injured && a.status != AnimalStatus::Critical) continue;
            const Species& sp = speciesCatalog()[size_t(a.species)];
            bool feral = sp.cls == AnimalClass::Feral || sp.cls == AnimalClass::Restricted;
            if (feral && !hasSurgeryWing()) continue;   // wild animals need the bigger medical room
            if (feral && !protectiveGear && rng.uniform() < 0.25f) {
                // Handling a wild animal without gear: somebody gets hurt
                for (auto& e : staff.employees)
                    if ((e.role == Role::Veterinarian || e.role == Role::VetTech) && e.lifeEvent == LE_None) {
                        e.lifeEvent = LE_Injury; e.lifeEventDay = clock.day(); e.stress += 0.3f;
                        log(e.name + " was badly bitten by " + a.name + " the " + sp.name +
                            " - deep puncture wounds to the forearm, blood everywhere. Protective gear would have prevented it.");
                        addDecision(DecisionKind::StaffLifeEvent, e.name + " was bitten",
                                    e.name + " needs stitches and a tetanus shot after being bitten by a " + sp.name +
                                        ". The ER bill is about $1,900.",
                                    {"Pay the medical bill and give paid time off", "Pay the medical bill", "Tell them to file with insurance"},
                                    1440.0 * 2).a = e.id;
                        staff.find(e.id)->lifeEvent = LE_Injury;
                        break;
                    }
            }
            treat(a.id);
            break;   // one patient per hour
        }
    }
}

void Sim::animalsDaily() {
    const int day = clock.day();
    // ---- Intake ----
    float demand = std::pow(Ratings::demandMultiplier(ratings.publicRating), 0.35f);
    int arrivals = int(rng.range(0.3f, 1.6f) * demand + rng.uniform());
    const auto& cat = speciesCatalog();
    auto pickSpecies = [&](AnimalClass cls) {
        std::vector<int> ids;
        for (size_t i = 0; i < cat.size(); ++i) if (cat[i].cls == cls) ids.push_back(int(i));
        return ids[size_t(rng.next() % ids.size())];
    };
    for (int i = 0; i < arrivals; ++i) {
        float r = rng.uniform();
        AnimalClass cls = r < 0.38f ? AnimalClass::Small : (r < 0.86f ? AnimalClass::Medium : AnimalClass::Large);
        int sid = pickSpecies(cls);
        const Species& sp = cat[size_t(sid)];
        BuildKind hk = housingFor(sp);
        int crateUsed = 0;
        for (auto& a : animalList) crateUsed += (a.inCare() && a.housing < 0) ? 1 : 0;
        bool room = housingBuildingFor(hk) >= 0 || (sp.cls != AnimalClass::Large && crateUsed < kMedicalCrates) ||
                    (sp.cls != AnimalClass::Large && housingBuildingFor(BuildKind::ContainerShelter) >= 0);
        if (!room) {
            if (rng.uniform() < 0.5f) log("A " + sp.name + " needed a home but you had no room for it (build " + buildInfo(hk).name + ").");
            continue;
        }
        const char* origins[] = {"Stray", "Owner surrender", "Found on the highway", "Seized from a hoarder", "Dumped at the gate"};
        std::string origin = origins[rng.next() % 5];
        // Sometimes a mother arrives with her babies
        if (rng.uniform() < 0.12f && sp.cls != AnimalClass::Large) {
            Animal& mom = admit(sid, origin, 1.0f);
            mom.male = false;
            mom.name = randomAnimalName(rng, false);
            int litter = 2 + int(rng.next() % 4);
            for (int k = 0; k < litter; ++k) {
                Animal& baby = admit(sid, "Born to " + mom.name, rng.range(0.06f, 0.12f));
                baby.coat = rng.uniform() < 0.5f ? mom.coat : baby.coat;
                baby.housing = mom.housing;
            }
            log(mom.name + " the " + sp.name + " arrived with a litter of " + std::to_string(litter) + " babies.");
        } else {
            Animal& a = admit(sid, origin);
            if (rng.uniform() < 0.25f) {
                a.status = rng.uniform() < 0.5f ? AnimalStatus::Sick : AnimalStatus::Injured;
                a.condition = a.status == AnimalStatus::Sick ? (rng.uniform() < 0.5f ? "Upper respiratory infection" : "Parasites")
                                                             : (rng.uniform() < 0.5f ? "Hit by a car" : "Deep lacerations");
                a.health = rng.range(0.4f, 0.8f);
                if (a.status == AnimalStatus::Injured) { a.bleeding = rng.range(0.1f, 0.5f); a.needsSurgery = rng.uniform() < 0.45f; }
            }
            log("New arrival: " + a.name + " the " + sp.name + " (" + origin + ").");
        }
    }
    // Animal control calls with wild animals (needs the surgery wing + protective gear)
    if (rng.uniform() < 0.18f) {
        int sid = pickSpecies(AnimalClass::Feral);
        const Species& sp = cat[size_t(sid)];
        const char* why[] = {"hit by a car on the highway", "tangled in a barbed-wire fence", "shot by a hunter and left",
                             "caught in an illegal leg-hold trap", "orphaned after its mother was killed"};
        std::string reason = why[rng.next() % 5];
        std::string warn = canHandleFeral() ? "" :
            (!hasSurgeryWing() ? " WARNING: you don't have the Surgery Wing (the bigger medical room) - you can't operate on wild animals."
                               : " WARNING: your staff have no protective gear - someone will get hurt handling it.");
        Decision& d = addDecision(DecisionKind::FeralIntake, "Animal control: injured " + sp.name,
                                  "Animal control has a " + sp.name + " that was " + reason + ". It's frightened and dangerous. "
                                  "Can you take it?" + warn,
                                  {"Take it in", "Decline - send it to a wildlife rehab"}, 240.0);
        d.a = sid;
        d.b = int(rng.next() % 5);
    }
    // Dangerous animal on the loose (rare)
    if (!incident.active && day > 4 && rng.uniform() < 0.035f) startIncident(pickSpecies(AnimalClass::Restricted));

    // ---- Fights inside shared housing ----
    for (auto& p : placed) {
        std::vector<Animal*> here;
        for (auto& a : animalList) if (a.inCare() && a.housing == p.id) here.push_back(&a);
        if (here.size() < 2) continue;
        float cap = float(std::max(1, buildInfo(p.kind).animalCapacity));
        float crowd = float(here.size()) / cap;
        Animal* att = here[0];
        for (Animal* a : here) if (cat[size_t(a->species)].temperament > cat[size_t(att->species)].temperament) att = a;
        float chance = 0.03f * cat[size_t(att->species)].temperament * 2.0f * (0.5f + crowd) * (att->stress + 0.3f);
        if (rng.uniform() >= chance) continue;
        Animal* vic = here[size_t(rng.next() % here.size())];
        if (vic == att) continue;
        const Species& as = cat[size_t(att->species)];
        const Species& vs = cat[size_t(vic->species)];
        bool baby = vic->isBaby(vs);
        vic->bleeding = std::min(1.0f, vic->bleeding + (baby ? 0.8f : rng.range(0.25f, 0.5f)));
        vic->health -= baby ? 0.6f : rng.range(0.15f, 0.35f);
        vic->status = vic->health < 0.25f ? AnimalStatus::Critical : AnimalStatus::Injured;
        vic->condition = baby ? "Crushing bite wounds" : "Bite wounds";
        vic->needsSurgery = baby || rng.uniform() < 0.35f;
        att->stress = std::min(1.0f, att->stress + 0.2f);
        log(std::string("FIGHT in the ") + buildInfo(p.kind).name + ": " + att->name + " the " + as.name + " attacked " + vic->name +
            " the " + vs.name + (baby ? " - a baby. It was shaken and torn open, bleeding badly. It needs surgery NOW."
                                      : ". Torn skin and puncture wounds; blood on the floor."));
        if (vic->health <= 0.0f) animalDied(*vic, "killed in a fight with " + att->name, true);
    }

    // ---- Random illness ----
    for (auto& a : animalList) {
        if (!a.inCare() || a.status != AnimalStatus::Healthy) continue;
        float risk = 0.004f + (a.vaccinated ? 0.0f : 0.006f) + (1.0f - a.cleanliness) * 0.01f;
        if (rng.uniform() < risk) {
            a.status = AnimalStatus::Sick;
            const char* ill[] = {"Kennel cough", "Upper respiratory infection", "Parvovirus", "Ringworm", "Giardia", "Ear infection"};
            a.condition = ill[rng.next() % 6];
            a.health -= 0.1f;
        }
        if (rng.uniform() < 0.003f) {
            a.needsSurgery = true;
            a.status = AnimalStatus::Sick;
            const char* surg[] = {"Swallowed a toy (intestinal blockage)", "Bloat (twisted stomach)", "Tumor", "Broken leg"};
            a.condition = surg[rng.next() % 4];
            a.health -= 0.15f;
        }
    }

    // ---- Adoptions (visitors who came yesterday) ----
    int wanted = int(float(visitorsYesterday) * 0.07f + rng.uniform() * 0.8f);
    for (int k = 0; k < wanted; ++k) {
        Animal* best = nullptr;
        float bestScore = 0.0f;
        for (auto& a : animalList) {
            if (!a.inCare() || a.owned || a.status != AnimalStatus::Healthy) continue;
            const Species& sp = cat[size_t(a.species)];
            if (sp.cls == AnimalClass::Feral || sp.cls == AnimalClass::Restricted) continue;
            float s = (0.4f + a.happiness) * (a.isBaby(sp) ? 1.8f : 1.0f) * (a.fixed ? 1.2f : 1.0f) * rng.range(0.5f, 1.5f);
            if (s > bestScore) { bestScore = s; best = &a; }
        }
        if (best && bestScore > 0.6f) adopt(best->id);
    }

    // ---- Owned patients go home when they're well; recovered wild animals can be released ----
    for (auto& a : animalList) {
        if (!a.inCare()) continue;
        const Species& sp = cat[size_t(a.species)];
        if (a.owned && a.status == AnimalStatus::Healthy && !a.needsSurgery) {
            a.status = AnimalStatus::Transferred;
            log(a.ownerName + " picked up " + a.name + " - healthy and happy.");
            ratings.shock(0.4f, 0.0f);
        }
        if (sp.cls == AnimalClass::Feral && a.status == AnimalStatus::Healthy && day - a.arrivedDay >= 3 && !a.isBaby(sp)) {
            bool pending = false;
            for (auto& d : decisions) pending |= d.kind == DecisionKind::ReleaseFeral && d.a == a.id;
            if (!pending)
                addDecision(DecisionKind::ReleaseFeral, "Release " + a.name + "?",
                            a.name + " the " + sp.name + " has recovered. Wild animals do best back in the wild.",
                            {"Release it back into the wild", "Keep it a while longer"}).a = a.id;
        }
        if (sp.cls == AnimalClass::Restricted && day - a.arrivedDay >= 2) {
            a.status = AnimalStatus::Transferred;
            econ.post(day, Ledger::Grants, 2500.0, "Sanctuary transfer stipend: " + sp.name);
            log(a.name + " the " + sp.name + " was transferred to a licensed sanctuary.");
            ratings.shock(1.5f, 1.0f);
        }
    }
    while (!deathDays.empty() && deathDays.front() < day - 30) deathDays.erase(deathDays.begin());
    // Drop old records (keep the dead/adopted for a while for the logs)
    animalList.erase(std::remove_if(animalList.begin(), animalList.end(),
                                    [&](const Animal& a) { return !a.inCare() && day - a.arrivedDay > 60; }),
                     animalList.end());
    animals = animalsInCare();
}

// ---------------------------------------------------------------------------
// Operating table
float Sim::idealDose(const Animal& a) const {
    const Species& sp = speciesCatalog()[size_t(a.species)];
    // Induction dose in mg/kg (loosely modeled on real injectable protocols)
    if (sp.category == "Cat" || sp.category == "Wild cat") return 6.0f;
    if (sp.category == "Big cat" || sp.category == "Bear") return 3.0f;
    if (sp.cls == AnimalClass::Large || sp.category == "Deer" || sp.category == "Horse" || sp.category == "Cattle") return 2.2f;
    if (sp.shape.plan == BodyPlan::Bird) return 10.0f;
    if (sp.shape.plan == BodyPlan::Lizard || sp.shape.plan == BodyPlan::Snake || sp.shape.plan == BodyPlan::Turtle) return 8.0f;
    if (sp.category == "Rabbit" || sp.category == "Rodent") return 7.0f;
    return 5.0f;
}

bool Sim::beginSurgery(int id, std::string* why) {
    Animal* a = findAnimal(id);
    auto fail = [&](const char* w) { if (why) *why = w; return false; };
    if (!a || !a->inCare()) return fail("That animal isn't here.");
    if (surgery.active) return fail("The table is already in use.");
    const Species& sp = speciesCatalog()[size_t(a->species)];
    bool big = sp.cls == AnimalClass::Large || sp.cls == AnimalClass::Feral || sp.cls == AnimalClass::Restricted;
    if (big && !hasSurgeryWing()) return fail("This animal is too big or too wild for the small medical room. Build the Surgery Wing.");
    surgery = Surgery();
    surgery.active = true;
    surgery.animal = id;
    surgery.procedure = a->needsSurgery ? (a->condition.empty() ? "Exploratory surgery" : a->condition) : "Spay / neuter";
    surgery.idealMgPerKg = idealDose(*a);
    surgery.step = a->owned && !a->ownerConsented ? 0 : 1;
    buildSurgeryField(*a);
    if ((sp.cls == AnimalClass::Feral || sp.cls == AnimalClass::Restricted) && !protectiveGear && rng.uniform() < 0.4f)
        log("Getting the " + sp.name + " onto the table without protective gear, it slashed a tech's arm open. Blood everywhere.");
    return true;
}

void Sim::surgeryAnesthetize(float mg) {
    if (!surgery.active || surgery.step > 1) return;
    if (surgery.step == 0) {   // operating on someone's pet without asking them
        Animal* a = findAnimal(surgery.animal);
        if (a) a->ownerConsented = false;
    }
    surgery.doseMgPerKg = mg;
    float r = mg / std::max(surgery.idealMgPerKg, 0.01f);
    surgery.depth = clampf(r * 0.85f, 0.0f, 2.0f);
    surgery.woke = r < 0.6f;
    surgery.heartRate = surgery.woke ? 150.0f : 90.0f - (surgery.depth - 0.85f) * 40.0f;
    surgery.step = 2;
}

void Sim::surgeryIncise() {
    if (!surgery.active || surgery.step != 2) return;
    surgery.bloodLoss += surgery.woke ? 0.3f : 0.12f;
    surgery.progress = 0.15f;
    surgery.step = 3;
    if (surgery.woke) {
        Animal* a = findAnimal(surgery.animal);
        if (a) { a->stress = 1.0f; }
        log("The anesthetic was too light - the animal woke up screaming as the scalpel went in, thrashing on the table.");
        ratings.shock(-2.0f, -2.0f);
    }
}

void Sim::surgeryClamp() {
    if (!surgery.active || surgery.step < 3) return;
    surgery.bleedersClamped = true;
}

void Sim::surgeryRepair() {
    if (!surgery.active || surgery.step != 3) return;
    surgery.progress = std::min(1.0f, surgery.progress + 0.45f);
    if (!surgery.bleedersClamped) surgery.bloodLoss += 0.15f;
    if (surgery.progress >= 1.0f) surgery.step = 4;
}

void Sim::surgerySuture() {
    if (!surgery.active || surgery.step != 4) return;
    surgery.step = 5;
    surgeryFinish();
}

void Sim::surgeryTick(float sec) {
    if (!surgery.active || surgery.step < 2 || surgery.step >= 5) return;
    if (!surgery.bleedersClamped && surgery.step >= 3) surgery.bloodLoss += 0.012f * sec;
    if (surgery.depth > 1.25f) surgery.oxygen -= 0.008f * sec * (surgery.depth - 1.15f) * 4.0f;
    else surgery.oxygen = std::min(0.99f, surgery.oxygen + 0.002f * sec);
    float targetHr = surgery.woke ? 160.0f : 95.0f - (surgery.depth - 0.85f) * 50.0f + surgery.bloodLoss * 70.0f;
    surgery.heartRate += (targetHr - surgery.heartRate) * std::min(1.0f, sec * 0.5f);
    if (surgery.bloodLoss >= 1.0f || surgery.oxygen < 0.62f) {
        surgery.died = true;
        surgeryFinish();
    }
}

void Sim::surgeryAbort() {
    if (!surgery.active) return;
    if (surgery.step >= 3) { surgery.died = rng.uniform() < 0.5f; surgeryFinish(); return; }
    surgery = Surgery();
}

void Sim::surgeryFinish() {
    Animal* a = findAnimal(surgery.animal);
    surgery.active = false;
    if (!a) return;
    const Species& sp = speciesCatalog()[size_t(a->species)];
    double cost = 120.0 + std::sqrt(std::max(1.0f, a->weightKg(sp))) * 45.0;
    econ.post(clock.day(), Ledger::Medical, -cost, "Surgery supplies: " + a->name);
    bool noConsent = a->owned && !a->ownerConsented;
    if (surgery.died) {
        animalDied(*a, surgery.bloodLoss >= 1.0f ? "bled out on the operating table" : "stopped breathing under anesthesia (overdose)", false);
    } else {
        a->needsSurgery = false;
        a->bleeding = 0.0f;
        a->fixed = a->fixed || surgery.procedure == "Spay / neuter";
        a->status = AnimalStatus::Recovering;
        a->health = std::max(a->health, 0.45f);
        a->condition.clear();
        if (a->hidden != Hidden::None && hiddenNeedsSurgery(a->hidden)) { a->hidden = Hidden::None; a->diagnosed = false; }
        if (surgery.organDamage > 0.3f) {
            a->health = 0.3f;
            a->status = AnimalStatus::Sick;
            a->condition = "Post-op complications (damaged organ)";
            log("Surgery on " + a->name + " is done, but the organ damage is serious. It's in critical watch.");
            ratings.shock(-0.5f, 0.0f);
        } else {
            log("Surgery on " + a->name + " the " + sp.name + " went well. Recovering in the ward.");
            ratings.shock(0.6f, 0.4f);
        }
    }
    if (noConsent && rng.uniform() < 0.75f) {
        scandal(9.0f, "Surgery without the owner's consent");
        log(a->ownerName + " found out you operated on " + a->name + " without asking. They're furious and posting about it online.");
    }
}

// ---------------------------------------------------------------------------
// A dangerous animal loose on the property
void Sim::startIncident(int species) {
    const Species& sp = speciesCatalog()[size_t(species)];
    incident = Incident();
    incident.active = true;
    incident.species = species;
    incident.pos = {-16.0f + rng.range(-6.0f, 6.0f), 0.0f, 30.0f + rng.range(-5.0f, 5.0f)};   // near the parking lot
    incident.startMinutes = clock.minutes;
    const char* from[] = {"escaped from a private owner down the highway", "broke out of a roadside zoo's trailer",
                          "wandered down out of the hills", "was dumped by an illegal exotic-pet dealer"};
    addDecision(DecisionKind::RestrictedLoose, "DANGER: " + sp.name + " on the property!",
                "A " + sp.name + " (" + std::to_string(int(sp.shape.weightKg)) + " kg) " + from[rng.next() % 4] +
                    " and is near the parking lot. People are pointing phones at it. What do you do?",
                {"Stay calm: get everyone inside, lock the doors and call 911", "Calmly clear visitors and staff away first",
                 "Try to catch it yourself", "Run and shout at everyone to get out"},
                30.0, true)
        .a = species;
    log("!!! A " + sp.name + " is loose on your property. Stay calm and call the police.");
}

void Sim::incidentCallPolice() {
    if (!incident.active || incident.policeCalled) return;
    incident.policeCalled = true;
    incident.policeArrive = clock.minutes + 22.0 + rng.range(0.0f, 15.0f);
    log("You called 911. Police and animal control are on the way with a tranquilizer team.");
}
void Sim::incidentClearArea() { if (incident.active) { incident.areaCleared = true; log("Everyone is inside and the doors are locked."); } }
void Sim::incidentPanic() { if (incident.active) { incident.playerCalm = false; } }
void Sim::incidentApproach() {
    if (!incident.active) return;
    const Species& sp = speciesCatalog()[size_t(incident.species)];
    incident.playerCalm = false;
    if (rng.uniform() < 0.55f) {
        incident.injured++;
        log("You went for the " + sp.name + ". It knocked you down - claws opened your arm to the bone before it backed off.");
        ratings.shock(-3.0f, 1.0f);
    }
}

void Sim::incidentUpdate() {
    if (!incident.active) return;
    const Species& sp = speciesCatalog()[size_t(incident.species)];
    double elapsed = clock.minutes - incident.startMinutes;
    // Risk to people while it's loose (checked every 10 game minutes)
    static double lastCheck = 0.0;
    if (clock.minutes - lastCheck >= 10.0 || clock.minutes < lastCheck) {
        lastCheck = clock.minutes;
        float risk = 0.02f * (0.5f + sp.temperament) * (incident.playerCalm ? 1.0f : 3.0f) * (incident.areaCleared ? 0.2f : 1.0f) *
                     (security.isOpenHours(clock.hour()) ? 1.5f : 0.4f);
        if (rng.uniform() < risk) {
            if (rng.uniform() < 0.25f && !incident.areaCleared) {
                incident.killed++;
                if (!staff.employees.empty() && rng.uniform() < 0.3f) {
                    Employee& victim = staff.employees[size_t(rng.next() % staff.employees.size())];
                    std::string who = victim.name;
                    log("The " + sp.name + " caught " + who + " between the kennels. They bled to death before help arrived.");
                    for (auto& o : staff.employees) if (o.id != victim.id) { o.stress = std::min(1.0f, o.stress + 0.4f); o.morale = std::max(0.0f, o.morale - 0.2f); }
                    staff.leave(victim.id, clock.day(), true);
                    ratings.shock(-4.0f, -10.0f);
                } else {
                    log("The " + sp.name + " dragged down a visitor in the parking lot. By the time anyone reached them they had bled to death.");
                }
            } else {
                incident.injured++;
                log("The " + sp.name + " mauled a visitor who got too close - deep bites to the leg, they're being rushed to the hospital.");
            }
        }
    }
    if (!incident.policeCalled && elapsed > 90.0) {   // someone else calls eventually
        incidentCallPolice();
        log("A visitor called 911 because you didn't.");
        ratings.shock(-3.0f, -1.0f);
    }
    if (incident.policeCalled && clock.minutes >= incident.policeArrive) {
        incident.active = false;
        bool kept = housingBuildingFor(BuildKind::SecureEnclosure) >= 0;
        if (kept) {
            Animal& a = admit(incident.species, "Captured on the property");
            a.stress = 1.0f;
            log("Police darted the " + sp.name + ". It's sedated and locked in your Secure Enclosure until a sanctuary picks it up.");
        } else {
            log("Police darted the " + sp.name + " and animal control hauled it away (you have no Secure Enclosure).");
        }
        if (incident.injured == 0 && incident.killed == 0 && incident.playerCalm) {
            ratings.shock(4.0f, 3.0f);
            log("Nobody got hurt. The news praised how calmly you handled it.");
        } else {
            float hit = 6.0f * float(incident.injured) + 18.0f * float(incident.killed) + (incident.playerCalm ? 0.0f : 4.0f);
            ratings.shock(-hit, -hit * 0.4f);
            if (incident.killed > 0 || incident.injured > 1)
                scandal(0.0f, std::string("People were hurt when a ") + sp.name + " got loose");
        }
    }
}

}  // namespace ps
