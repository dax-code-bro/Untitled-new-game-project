// Daily care (food of their choice, water, your personal check on every
// animal), hidden conditions, clinic check-ups (ultrasound, blood panel,
// dental, X-ray) and the hands-on surgical field.
#include "game/Sim.h"
#include <algorithm>
#include <cmath>
#include <cstdio>

namespace ps {

const char* foodName(FoodKind f) {
    static const char* n[] = {"Dog food", "Cat food", "Hay", "Pellets", "Seed mix", "Live insects", "Frozen rodents",
                              "Raw meat", "Fish", "Fresh fruit & veg", "Grain feed", "Milk formula"};
    return n[int(f)];
}

float foodPricePerKg(FoodKind f) {
    static const float p[] = {3.2f, 4.5f, 0.35f, 2.8f, 4.0f, 28.0f, 22.0f, 6.5f, 7.0f, 2.5f, 0.6f, 18.0f};
    return p[int(f)];
}

const char* hiddenName(Hidden h) {
    static const char* n[] = {"Nothing wrong", "Swallowed foreign object", "Bladder stones", "Tumor", "Pregnant", "Internal bleeding",
                              "Parasites (worms)", "Overgrown teeth", "Egg bound", "Broken bone", "Kidney disease", "Diabetes"};
    return n[int(h)];
}

const char* hiddenSymptom(Hidden h) {
    switch (h) {
    case Hidden::ForeignBody: return "It's vomiting and won't eat. Its belly is tense and sore.";
    case Hidden::BladderStones: return "It's straining to pee, and there's a little blood.";
    case Hidden::Tumor: return "It's losing weight and seems tired.";
    case Hidden::Pregnancy: return "Its belly looks rounder than it should.";
    case Hidden::InternalBleeding: return "Its gums are pale and it's breathing fast.";
    case Hidden::Parasites: return "It has a dull coat and a potbelly, with loose stool.";
    case Hidden::DentalOvergrowth: return "It's drooling and dropping food.";
    case Hidden::EggBinding: return "It's sitting fluffed up and straining.";
    case Hidden::Fracture: return "It won't put weight on one leg.";
    case Hidden::KidneyDisease: return "It's drinking and peeing a lot.";
    case Hidden::Diabetes: return "It's drinking a lot and losing weight despite eating.";
    default: return "";
    }
}

bool hiddenNeedsSurgery(Hidden h) {
    return h == Hidden::ForeignBody || h == Hidden::BladderStones || h == Hidden::Tumor || h == Hidden::InternalBleeding ||
           h == Hidden::EggBinding || h == Hidden::Fracture;
}

const char* examName(ExamKind k) {
    static const char* n[] = {"Abdominal ultrasound", "Blood panel", "Dental exam", "X-ray"};
    return n[int(k)];
}

std::vector<FoodKind> foodsFor(const Species& sp, bool baby) {
    using F = FoodKind;
    const std::string& c = sp.category;
    std::vector<F> f;
    const AnimalShape& S = sp.shape;
    if (c == "Dog") f = {F::DogFood, F::Meat};
    else if (c == "Cat") f = {F::CatFood, F::Meat, F::Fish};
    else if (c == "Wild cat" || c == "Big cat" || c == "Canid" || c == "Hyena" || c == "Mustelid" || c == "Crocodilian") f = {F::Meat, F::FrozenRodents, F::Fish};
    else if (c == "Rabbit" || c == "Hare") f = {F::Hay, F::Pellets, F::FruitVeg};
    else if (c == "Rodent") f = {F::Pellets, F::FruitVeg, F::Seeds, F::Hay};
    else if (c == "Bird") f = S.beak == Beak::Hook ? std::vector<F>{F::Seeds, F::FruitVeg} : std::vector<F>{F::Grain, F::Seeds, F::Insects};
    else if (c == "Duck" || c == "Chicken") f = {F::Grain, F::FruitVeg, F::Insects};
    else if (c == "Raptor") f = {F::FrozenRodents, F::Meat};
    else if (c == "Reptile") {
        if (S.plan == BodyPlan::Snake) f = {F::FrozenRodents};
        else if (S.plan == BodyPlan::Turtle) f = S.foot == Foot::Hoof ? std::vector<F>{F::Hay, F::FruitVeg} : std::vector<F>{F::Fish, F::Pellets, F::FruitVeg};
        else if (sp.name == "Green Iguana") f = {F::FruitVeg};
        else f = {F::Insects, F::FruitVeg};
    } else if (c == "Constrictor" || c == "Venomous reptile") f = {F::FrozenRodents};
    else if (c == "Horse" || c == "Cattle" || c == "Goat" || c == "Sheep" || c == "Camelid" || c == "Deer" || c == "Antelope")
        f = {F::Hay, F::Grain};
    else if (c == "Pig" || c == "Peccary") f = {F::Grain, F::FruitVeg};
    else if (c == "Bear") f = {F::Fish, F::Meat, F::FruitVeg};
    else if (c == "Great ape") f = {F::FruitVeg};
    else if (c == "Raccoon" || c == "Marsupial" || c == "Skunk" || c == "Armadillo") f = {F::CatFood, F::Insects, F::FruitVeg};
    else f = {F::FruitVeg, F::Pellets};
    bool mammal = S.plan == BodyPlan::Quadruped || S.plan == BodyPlan::Primate;
    if (baby && mammal) f.insert(f.begin(), F::Formula);
    return f;
}

float dailyFoodKg(const Animal& a, const Species& sp) {
    return std::max(0.004f, 0.04f * std::pow(a.weightKg(sp), 0.85f));
}

ExamKind examFor(const Species& sp) {
    const std::string& c = sp.category;
    if (c == "Dog" || c == "Canid" || c == "Pig" || c == "Bear" || c == "Hyena" || c == "Great ape" || c == "Raccoon" || c == "Marsupial")
        return ExamKind::Ultrasound;
    if (c == "Cat" || c == "Wild cat" || c == "Big cat" || c == "Mustelid" || c == "Skunk") return ExamKind::BloodPanel;
    if (c == "Rabbit" || c == "Rodent" || c == "Hare") return ExamKind::Dental;
    return ExamKind::XRay;
}

std::vector<Hidden> examOptions(ExamKind k) {
    using H = Hidden;
    switch (k) {
    case ExamKind::Ultrasound: return {H::None, H::ForeignBody, H::BladderStones, H::Tumor, H::Pregnancy, H::InternalBleeding};
    case ExamKind::BloodPanel: return {H::None, H::KidneyDisease, H::Diabetes, H::Parasites};
    case ExamKind::Dental: return {H::None, H::DentalOvergrowth, H::Parasites};
    case ExamKind::XRay: return {H::None, H::ForeignBody, H::Fracture, H::EggBinding};
    }
    return {H::None};
}

// ---------------------------------------------------------------------------
std::vector<std::string> Sim::checkAnimal(int id) {
    std::vector<std::string> notes;
    Animal* a = findAnimal(id);
    if (!a || !a->inCare()) return notes;
    const Species& sp = speciesCatalog()[size_t(a->species)];
    bool first = a->checkedDay != clock.day();
    a->checkedDay = clock.day();
    if (first) { a->stress = std::max(0.0f, a->stress - 0.08f); a->happiness = std::min(1.0f, a->happiness + 0.05f); }
    if (a->hunger > 0.6f) notes.push_back("It's hungry.");
    if (a->water < 0.3f) notes.push_back(a->water < 0.05f ? "Its water bowl is EMPTY." : "Its water is low.");
    if (a->cleanliness < 0.5f) notes.push_back("Its space is dirty.");
    if (a->housing < 0 && !a->owned) notes.push_back("It has no proper shelter - it's in a crate in the medical room.");
    if (a->bleeding > 0.02f) notes.push_back("It's bleeding.");
    if (!a->condition.empty()) notes.push_back("Condition: " + a->condition + ".");
    if (a->hidden != Hidden::None && !a->diagnosed && a->hiddenDays >= 2) notes.push_back(std::string(hiddenSymptom(a->hidden)) + " Get it a check-up.");
    if (a->fedWrongDays > 0) notes.push_back("It's picking at its food - it isn't getting what it likes (" + std::string(foodName(foodsFor(sp, a->isBaby(sp))[0])) + ").");
    if (a->stress > 0.7f) notes.push_back("It's frightened and stressed.");
    if (notes.empty()) notes.push_back("It looks healthy and content.");
    return notes;
}

bool Sim::handFeed(int id) {
    Animal* a = findAnimal(id);
    if (!a || !a->inCare()) return false;
    const Species& sp = speciesCatalog()[size_t(a->species)];
    float need = dailyFoodKg(*a, sp) * 0.5f;
    auto foods = foodsFor(sp, a->isBaby(sp));
    for (size_t i = 0; i < foods.size(); ++i) {
        float& stock = food[size_t(foods[i])];
        if (stock >= need) {
            stock -= need;
            a->hunger = 0.05f;
            a->fedWrongDays = i == 0 ? 0 : a->fedWrongDays;
            return true;
        }
    }
    return false;
}

void Sim::giveWater(int id) {
    Animal* a = findAnimal(id);
    if (a) a->water = 1.0f;
}

int Sim::uncheckedToday() const {
    int n = 0;
    for (const Animal& a : animalList) n += (a.inCare() && !a.owned && a.checkedDay != clock.day()) ? 1 : 0;
    return n;
}

bool Sim::orderFood(FoodKind f, float kg) {
    double cost = double(foodPricePerKg(f) * kg);
    if (!econ.tryPay(clock.day(), Ledger::AnimalCare, cost, std::string("Supplies: ") + foodName(f))) return false;
    foodOrdered[size_t(f)] += kg;
    return true;
}

void Sim::careHourly(int h) {
    // Deliveries
    if (h == 8) {
        std::string got;
        for (int i = 0; i < int(FoodKind::Count); ++i)
            if (foodOrdered[i] > 0.0f) {
                food[i] += foodOrdered[i];
                if (!got.empty()) got += ", ";
                char b[64];
                std::snprintf(b, sizeof b, "%.0f kg %s", double(foodOrdered[i]), foodName(FoodKind(i)));
                got += b;
                foodOrdered[i] = 0.0f;
            }
        if (!got.empty()) log("Delivery arrived: " + got + ".");
    }
    // Water bowls empty over the day; caretakers refill them on rounds
    int carers = 0;
    for (auto& e : staff.employees)
        if (!e.onVacation(clock.day()) && (e.role == Role::Caretaker || e.role == Role::VetTech)) ++carers;
    int inCare = animalsInCare();
    float coverage = inCare == 0 ? 1.0f : clampf(float(carers * 12) / float(inCare), 0.0f, 1.0f);
    const auto& cat = speciesCatalog();
    bool feeding = (h == 8 || h == 17);
    int hungryNoFood = 0;
    for (auto& a : animalList) {
        if (!a.inCare()) continue;
        const Species& sp = cat[size_t(a.species)];
        a.water = std::max(0.0f, a.water - 0.06f);
        if ((h == 8 || h == 13 || h == 17) && rng.uniform() < coverage) a.water = 1.0f;
        if (a.water <= 0.0f) { a.health -= 0.02f; a.stress = std::min(1.0f, a.stress + 0.03f); }
        if (feeding && !a.owned && rng.uniform() < coverage) {
            // Staff feed from your supplies - the food it likes if you have it
            float need = dailyFoodKg(a, sp) * 0.5f;
            auto foods = foodsFor(sp, a.isBaby(sp));
            bool fed = false;
            for (size_t i = 0; i < foods.size() && !fed; ++i) {
                float& stock = food[size_t(foods[i])];
                if (stock >= need) {
                    stock -= need;
                    a.hunger = 0.05f;
                    a.fedWrongDays = i == 0 ? 0 : a.fedWrongDays + 1;
                    fed = true;
                }
            }
            if (!fed) { a.hunger = std::min(1.0f, a.hunger + 0.2f); ++hungryNoFood; }
        }
    }
    if (hungryNoFood > 0) {
        log("Out of food: " + std::to_string(hungryNoFood) + " animal" + (hungryNoFood == 1 ? "" : "s") +
            " couldn't be fed. Order supplies from the computer's Store or drive to the pet store.");
        // Caretakers make an emergency run to the store for the missing food - at retail markup
        if (carers > 0) {
            float need[size_t(FoodKind::Count)] = {};
            for (auto& a : animalList) {
                if (!a.inCare() || a.hunger < 0.2f) continue;
                const Species& sp = cat[size_t(a.species)];
                auto foods = foodsFor(sp, a.isBaby(sp));
                bool any = false;
                for (FoodKind f : foods) any |= food[size_t(f)] >= dailyFoodKg(a, sp) * 0.5f;
                if (!any) need[size_t(foods[0])] += dailyFoodKg(a, sp) * 3.0f;
            }
            for (int i = 0; i < int(FoodKind::Count); ++i)
                if (need[i] > 0.0f && econ.tryPay(clock.day(), Ledger::AnimalCare, double(foodPricePerKg(FoodKind(i)) * need[i] * 2.0f),
                                                  std::string("Emergency supply run: ") + foodName(FoodKind(i)))) {
                    foodOrdered[i] += need[i];
                    log(std::string("Your staff made an emergency run for ") + foodName(FoodKind(i)) + " at double the price. It arrives tomorrow.");
                }
        }
    }
    // Results of a scan come back
    if (exam.active && clock.minutes >= exam.readyAt && exam.readyAt > clock.minutes - 60.0) {
        const Animal* a = findAnimal(exam.animal);
        if (a) log(std::string(examName(exam.kind)) + " results for " + a->name + " are ready in the clinic.");
    }
}

void Sim::careDaily() {
    const int day = clock.day() - 1;   // the day that just ended
    const auto& cat = speciesCatalog();
    int unchecked = 0;
    for (auto& a : animalList) {
        if (!a.inCare()) continue;
        const Species& sp = cat[size_t(a.species)];
        if (!a.owned && a.checkedDay != day) {
            ++unchecked;
            a.stress = std::min(1.0f, a.stress + 0.06f);
        }
        if (a.fedWrongDays > 2) a.happiness = std::max(0.0f, a.happiness - 0.1f);
        // Hidden problems appear and get worse until someone finds them
        if (a.hidden == Hidden::None && a.status == AnimalStatus::Healthy && rng.uniform() < 0.012f) {
            ExamKind k = examFor(sp);
            auto opts = examOptions(k);
            Hidden h = opts[size_t(1 + rng.next() % (opts.size() - 1))];
            if (h == Hidden::Pregnancy && (a.male || a.isBaby(sp))) h = Hidden::ForeignBody;
            if (h == Hidden::EggBinding && (a.male || sp.shape.plan != BodyPlan::Bird)) h = Hidden::ForeignBody;
            a.hidden = h;
            a.hiddenDays = 0;
            a.diagnosed = false;
        } else if (a.hidden != Hidden::None) {
            a.hiddenDays++;
            if (a.hidden == Hidden::Pregnancy) {
                if (a.hiddenDays >= 20) {
                    int litter = 2 + int(rng.next() % 4);
                    for (int k = 0; k < litter; ++k) {
                        Animal& baby = admit(a.species, "Born here to " + a.name, 0.06f);
                        baby.housing = a.housing;
                        baby.coat = rng.uniform() < 0.5f ? a.coat : baby.coat;
                    }
                    log(a.name + " the " + sp.name + " gave birth to " + std::to_string(litter) + " babies!" +
                        (a.diagnosed ? "" : " Nobody knew she was pregnant."));
                    a.hidden = Hidden::None;
                }
            } else if (!a.diagnosed) {
                float sev = float(a.hiddenDays) / 10.0f;
                a.health -= 0.02f * sev;
                if (a.hiddenDays >= 6 && a.status == AnimalStatus::Healthy) {
                    a.status = AnimalStatus::Sick;
                    a.condition = std::string(hiddenSymptom(a.hidden));
                }
                if (a.health <= 0.0f) animalDied(a, std::string("an undiagnosed ") + hiddenName(a.hidden), true);
            }
        }
    }
    if (unchecked > 0 && animalsInCare() > 0) {
        log("You didn't check on " + std::to_string(unchecked) + " animal" + (unchecked == 1 ? "" : "s") +
            " yesterday. Walk up to each one and check on it every day.");
        ratings.shock(-std::min(3.0f, 0.15f * float(unchecked)), -std::min(2.0f, 0.1f * float(unchecked)));
    }
}

// ---------------------------------------------------------------------------
double Sim::examCost(const Animal& a) const {
    switch (examFor(speciesCatalog()[size_t(a.species)])) {
    case ExamKind::Ultrasound: return 180.0;
    case ExamKind::BloodPanel: return 120.0;
    case ExamKind::Dental: return 60.0;
    case ExamKind::XRay: return 150.0;
    }
    return 100.0;
}

bool Sim::startExam(int id, std::string* why) {
    Animal* a = findAnimal(id);
    auto fail = [&](const char* w) { if (why) *why = w; return false; };
    if (!a || !a->inCare()) return fail("That animal isn't here.");
    if (exam.active) return fail("A check-up is already in progress.");
    const Species& sp = speciesCatalog()[size_t(a->species)];
    bool wild = sp.cls == AnimalClass::Feral || sp.cls == AnimalClass::Restricted;
    if ((wild || sp.cls == AnimalClass::Large) && !hasSurgeryWing()) return fail("Wild and large animals need the Surgery Wing for check-ups.");
    if (!econ.tryPay(clock.day(), Ledger::Medical, examCost(*a), std::string(examName(examFor(sp))) + ": " + a->name))
        return fail("Not enough cash.");
    exam = Exam();
    exam.active = true;
    exam.animal = id;
    exam.kind = examFor(sp);
    exam.truth = a->hidden;
    exam.seed = rng.next();
    exam.readyAt = clock.minutes + (exam.kind == ExamKind::Ultrasound ? 20.0 : 10.0);   // they take it away for the scan
    a->lastExamDay = clock.day();
    return true;
}

bool Sim::answerExam(Hidden guess) {
    if (!exam.active) return false;
    Animal* a = findAnimal(exam.animal);
    Hidden truth = exam.truth;
    exam.active = false;
    if (!a) return false;
    const Species& sp = speciesCatalog()[size_t(a->species)];
    bool right = guess == truth;
    if (right) {
        if (truth == Hidden::None) { log(a->name + "'s check-up is clear. Healthy!"); return true; }
        a->diagnosed = true;
        if (hiddenNeedsSurgery(truth)) {
            a->needsSurgery = true;
            a->condition = hiddenName(truth);
            if (a->status == AnimalStatus::Healthy) a->status = AnimalStatus::Sick;
            log("You found it: " + a->name + " the " + sp.name + " has " + std::string(hiddenName(truth)) + ". It needs surgery.");
        } else if (truth == Hidden::Pregnancy) {
            log(a->name + " is pregnant! Babies due in about " + std::to_string(std::max(1, 20 - a->hiddenDays)) + " days.");
        } else {
            // Medication / dental trim fixes it
            econ.post(clock.day(), Ledger::Medical, -60.0, std::string("Treatment: ") + hiddenName(truth));
            a->hidden = Hidden::None;
            a->status = AnimalStatus::Recovering;
            a->condition.clear();
            log(a->name + " is being treated for " + std::string(hiddenName(truth)) + ".");
        }
        ratings.shock(0.4f, 0.2f);
    } else {
        log(std::string("Misread the ") + examName(exam.kind) + ": you said \"" + hiddenName(guess) + "\" for " + a->name +
            ". The real problem is still there.");
        if (guess != Hidden::None && hiddenNeedsSurgery(guess)) { a->needsSurgery = true; a->condition = std::string("Suspected ") + hiddenName(guess); }
    }
    return right;
}

// ---------------------------------------------------------------------------
// Surgical field: a ventral view of the opened animal. Real hazards along the way.
void Sim::buildSurgeryField(const Animal& a) {
    Surgery& S = surgery;
    Rng r(uint64_t(a.seed) * 13u + uint64_t(a.id));
    auto jit = [&](float v) { return v + r.range(-0.02f, 0.02f); };
    S.vessels.clear();
    S.organs.clear();
    S.cut.clear();
    S.bleeders.clear();
    S.stitches.clear();
    S.organDamage = 0.0f;
    S.targetDone = false;
    const std::string& p = S.procedure;
    bool leg = p.find("Broken") != std::string::npos || p.find("broken") != std::string::npos || p.find("Fracture") != std::string::npos;
    if (leg) {
        // A limb: the bone runs down the middle with the main artery and vein alongside
        S.vessels.push_back({{{jit(0.5f), 0.02f}, {jit(0.5f), 0.5f}, {jit(0.5f), 0.98f}}, 2, "Femur", false});
        S.vessels.push_back({{{0.36f, 0.02f}, {jit(0.38f), 0.5f}, {0.4f, 0.98f}}, 0, "Femoral artery", false});
        S.vessels.push_back({{{0.32f, 0.02f}, {jit(0.33f), 0.5f}, {0.35f, 0.98f}}, 1, "Femoral vein", false});
        S.organs.push_back({{0.66f, 0.5f}, {0.14f, 0.38f}, "Thigh muscle", {0.55f, 0.15f, 0.14f}, false});
        S.guideA = {0.62f, 0.3f};
        S.guideB = {0.62f, 0.7f};
        S.target = {0.5f, jit(0.5f)};
        S.targetName = "the fracture (set and plate it)";
        return;
    }
    // Abdomen: aorta and vena cava deep along the spine, mammary/epigastric vessels near the midline
    // (the aorta and vena cava run deep, just either side of the spine - stray off the midline and you'll find them)
    S.vessels.push_back({{{0.43f, 0.0f}, {0.43f + r.range(-0.008f, 0.008f), 0.5f}, {0.43f, 1.0f}}, 0, "Aorta", false});
    S.vessels.push_back({{{0.57f, 0.0f}, {0.57f + r.range(-0.008f, 0.008f), 0.5f}, {0.57f, 1.0f}}, 1, "Vena cava", false});
    S.vessels.push_back({{{0.36f, 0.15f}, {jit(0.4f), 0.45f}, {0.35f, 0.85f}}, 0, "Epigastric artery (left)", false});
    S.vessels.push_back({{{0.64f, 0.15f}, {jit(0.6f), 0.45f}, {0.65f, 0.85f}}, 1, "Epigastric vein (right)", false});
    S.vessels.push_back({{{0.2f, 0.02f}, {0.35f, 0.06f}, {0.5f, 0.08f}, {0.65f, 0.06f}, {0.8f, 0.02f}}, 2, "Ribs / sternum", false});
    S.vessels.push_back({{{0.25f, 0.98f}, {0.5f, 0.93f}, {0.75f, 0.98f}}, 2, "Pelvis", false});
    S.organs.push_back({{jit(0.4f), 0.2f}, {0.2f, 0.1f}, "Liver", {0.4f, 0.1f, 0.08f}, false});
    S.organs.push_back({{jit(0.62f), 0.27f}, {0.12f, 0.08f}, "Stomach", {0.75f, 0.5f, 0.45f}, false});
    S.organs.push_back({{jit(0.72f), 0.36f}, {0.05f, 0.12f}, "Spleen", {0.35f, 0.08f, 0.15f}, false});
    S.organs.push_back({{jit(0.5f), 0.55f}, {0.2f, 0.15f}, "Intestines", {0.85f, 0.62f, 0.55f}, false});
    S.organs.push_back({{0.3f, 0.45f}, {0.05f, 0.07f}, "Left kidney", {0.45f, 0.15f, 0.12f}, false});
    S.organs.push_back({{0.7f, 0.47f}, {0.05f, 0.07f}, "Right kidney", {0.45f, 0.15f, 0.12f}, false});
    S.organs.push_back({{jit(0.5f), 0.84f}, {0.08f, 0.07f}, "Bladder", {0.85f, 0.8f, 0.55f}, false});
    S.guideA = {0.5f, 0.3f};
    S.guideB = {0.5f, 0.75f};
    auto at = [&](const char* organ) {
        for (auto& o : S.organs) if (o.name == organ) return o.c + vec2(r.range(-0.4f, 0.4f) * o.r.x, r.range(-0.4f, 0.4f) * o.r.y);
        return vec2(0.5f, 0.5f);
    };
    if (p.find("foreign") != std::string::npos || p.find("toy") != std::string::npos || p.find("sock") != std::string::npos ||
        p.find("blockage") != std::string::npos) { S.target = at("Intestines"); S.targetName = "the object in the intestine (remove it)"; }
    else if (p.find("Bloat") != std::string::npos) { S.target = at("Stomach"); S.targetName = "the twisted stomach (untwist and tack it)"; S.guideA = {0.5f, 0.15f}; S.guideB = {0.5f, 0.55f}; }
    else if (p.find("stones") != std::string::npos) { S.target = at("Bladder"); S.targetName = "the stones in the bladder (remove them)"; S.guideA = {0.5f, 0.6f}; S.guideB = {0.5f, 0.9f}; }
    else if (p.find("Tumor") != std::string::npos || p.find("lump") != std::string::npos) { S.target = at("Spleen"); S.targetName = "the tumor (cut it out)"; }
    else if (p.find("bleeding") != std::string::npos) { S.target = at("Spleen"); S.targetName = "the ruptured spleen (tie it off)"; }
    else if (p.find("Egg") != std::string::npos) { S.target = {0.45f, 0.7f}; S.targetName = "the stuck egg (remove it)"; }
    else if (p.find("Spay") != std::string::npos) { S.target = {0.5f, 0.72f}; S.targetName = "the reproductive organs (remove them)"; S.guideA = {0.5f, 0.55f}; S.guideB = {0.5f, 0.85f}; }
    else { S.target = at("Intestines"); S.targetName = "the damaged tissue (repair it)"; }
}

namespace {
bool segHit(vec2 a, vec2 b, vec2 c, vec2 d) {
    auto cross2 = [](vec2 u, vec2 v) { return u.x * v.y - u.y * v.x; };
    vec2 r = b - a, s = d - c;
    float den = cross2(r, s);
    if (std::fabs(den) < 1e-8f) return false;
    float t = cross2(c - a, s) / den, u = cross2(c - a, r) / den;
    return t >= 0.0f && t <= 1.0f && u >= 0.0f && u <= 1.0f;
}
float dist2(vec2 a, vec2 b) { vec2 d = a - b; return d.x * d.x + d.y * d.y; }
}  // namespace

void Sim::surgeryCutTo(vec2 from, vec2 to) {
    Surgery& S = surgery;
    if (!S.active || S.step < 2 || S.step > 3) return;
    if (S.step == 2) { S.step = 3; S.progress = std::max(S.progress, 0.1f); if (S.woke) surgeryIncise(); }
    if (S.cut.empty()) S.cut.push_back(from);
    S.cut.push_back(to);
    for (auto& v : S.vessels) {
        if (v.hit) continue;
        for (size_t i = 0; i + 1 < v.pts.size(); ++i)
            if (segHit(from, to, v.pts[i], v.pts[i + 1])) {
                v.hit = true;
                if (v.kind == 0) {
                    S.bloodLoss += 0.3f;
                    S.bleeders.push_back((from + to) * 0.5f);
                    S.bleeders.push_back((from + to) * 0.5f + vec2(0.01f, 0.01f));
                    S.bleedersClamped = false;
                    S.lastEvent = "You cut the " + v.name + "! Bright red blood is pumping out - clamp it NOW.";
                } else if (v.kind == 1) {
                    S.bloodLoss += 0.12f;
                    S.bleeders.push_back((from + to) * 0.5f);
                    S.bleedersClamped = false;
                    S.lastEvent = "You nicked the " + v.name + ". Dark blood is welling up - clamp it.";
                } else {
                    S.lastEvent = "The blade hit bone (" + v.name + ") and chipped it. Cut around it.";
                    S.organDamage += 0.05f;
                    S.cut.pop_back();   // the blade stops
                }
                break;
            }
    }
    for (auto& o : S.organs) {
        if (o.hit) continue;
        vec2 m = (from + to) * 0.5f, d = (m - o.c);
        // Cutting along the proper line (linea alba) is safe; hacking into the belly away from it hits organs
        vec2 g = S.guideB - S.guideA;
        float t = clampf(((m.x - S.guideA.x) * g.x + (m.y - S.guideA.y) * g.y) / std::max(g.x * g.x + g.y * g.y, 1e-6f), 0.0f, 1.0f);
        float offGuide = length(m - (S.guideA + g * t));
        if ((d.x * d.x) / (o.r.x * o.r.x) + (d.y * d.y) / (o.r.y * o.r.y) < 0.5f && offGuide > 0.05f) {
            o.hit = true;
            S.organDamage += 0.2f;
            S.bloodLoss += o.name == "Spleen" || o.name == "Liver" ? 0.15f : 0.05f;
            S.bleeders.push_back(m);
            S.lastEvent = "You went too deep and cut into the " + o.name + ".";
        }
    }
    // Opening size drives progress
    float len = 0.0f;
    for (size_t i = 0; i + 1 < S.cut.size(); ++i) len += length(S.cut[i + 1] - S.cut[i]);
    S.progress = std::max(S.progress, std::min(0.4f, len * 0.9f));
}

bool Sim::surgeryClampAt(vec2 p) {
    Surgery& S = surgery;
    for (size_t i = 0; i < S.bleeders.size(); ++i)
        if (dist2(S.bleeders[i], p) < 0.035f * 0.035f) {
            S.bleeders.erase(S.bleeders.begin() + long(i));
            if (S.bleeders.empty()) S.bleedersClamped = true;
            S.lastEvent = S.bleeders.empty() ? "Bleeding controlled." : "Clamped. More bleeders to go.";
            return true;
        }
    return false;
}

bool Sim::surgeryTreatTargetAt(vec2 p) {
    Surgery& S = surgery;
    if (!S.active || S.step != 3 || S.targetDone) return false;
    // You can only reach it through your incision
    bool reachable = false;
    for (vec2 c : S.cut) reachable |= dist2(c, S.target) < 0.09f * 0.09f;
    if (dist2(p, S.target) > 0.05f * 0.05f) return false;
    if (!reachable) { S.lastEvent = "You can't reach it through that incision. Extend the cut toward it."; return false; }
    S.targetDone = true;
    S.progress = 1.0f;
    S.step = 4;
    if (!S.bleedersClamped) S.bloodLoss += 0.08f;
    S.lastEvent = "Done: " + S.targetName + ". Now close up.";
    return true;
}

bool Sim::surgeryStitchAt(vec2 p) {
    Surgery& S = surgery;
    if (!S.active || S.step != 4) return false;
    bool near = false;
    for (size_t i = 0; i + 1 < S.cut.size() && !near; ++i) {
        vec2 a = S.cut[i], d = S.cut[i + 1] - a;
        float t = clampf(((p.x - a.x) * d.x + (p.y - a.y) * d.y) / std::max(d.x * d.x + d.y * d.y, 1e-7f), 0.0f, 1.0f);
        near = dist2(a + d * t, p) < 0.035f * 0.035f;
    }
    if (!near) return false;
    for (vec2 s : S.stitches) if (dist2(s, p) < 0.015f * 0.015f) return false;
    S.stitches.push_back(p);
    float len = 0.0f;
    for (size_t i = 0; i + 1 < S.cut.size(); ++i) len += length(S.cut[i + 1] - S.cut[i]);
    int need = std::max(3, int(len / 0.045f));
    if (int(S.stitches.size()) >= need) {
        S.lastEvent = "Closed.";
        surgerySuture();
    }
    return true;
}

}  // namespace ps
