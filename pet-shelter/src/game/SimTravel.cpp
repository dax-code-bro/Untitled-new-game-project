// The pet store you drive to, what rides home in your truck, and traffic tickets.
#include "game/Sim.h"
#include <cmath>

namespace ps {

void Sim::restockPetStore() {
    petStore.clear();
    const auto& cat = speciesCatalog();
    auto pool = [&](auto pred) {
        std::vector<int> ids;
        for (size_t i = 0; i < cat.size(); ++i) if (pred(cat[i])) ids.push_back(int(i));
        return ids;
    };
    auto dogs = pool([](const Species& s) { return s.category == "Dog" && (s.cls == AnimalClass::Small || s.cls == AnimalClass::Medium); });
    auto cats = pool([](const Species& s) { return s.category == "Cat" && s.cls != AnimalClass::Feral; });
    auto birds = pool([](const Species& s) { return s.category == "Bird" && s.cls != AnimalClass::Feral; });
    auto snakes = pool([](const Species& s) { return s.shape.plan == BodyPlan::Snake && s.cls != AnimalClass::Restricted; });
    auto add = [&](const std::vector<int>& ids, int n) {
        for (int i = 0; i < n && !ids.empty(); ++i) {
            StoreAnimal a;
            a.species = ids[size_t(rng.next() % ids.size())];
            const Species& sp = cat[size_t(a.species)];
            a.male = rng.uniform() < 0.5f;
            a.ageFrac = rng.range(0.18f, 0.45f);
            a.coat = int(rng.next() % std::max<size_t>(1, sp.coats.size()));
            a.name = randomAnimalName(rng, a.male);
            // Store prices: puppies cost the most, snakes the least
            float base = sp.category == "Dog" ? rng.range(450.0f, 1400.0f) : sp.category == "Cat" ? rng.range(120.0f, 650.0f)
                       : sp.shape.plan == BodyPlan::Snake ? rng.range(60.0f, 180.0f) : std::max(30.0f, sp.adoptionFee * rng.range(0.9f, 1.3f));
            a.price = std::round(base / 5.0f) * 5.0f;
            petStore.push_back(a);
        }
    };
    add(dogs, 3);
    add(cats, 2);
    add(birds, 2);
    add(snakes, 2);
}

bool Sim::buyFromPetStore(size_t i, std::string* why) {
    if (i >= petStore.size()) return false;
    const StoreAnimal& a = petStore[i];
    const Species& sp = speciesCatalog()[size_t(a.species)];
    if (!econ.tryPay(clock.day(), Ledger::AnimalCare, a.price, "Pet store: " + sp.name)) { if (why) *why = "Not enough cash"; return false; }
    truckCargo.push_back(a);
    petStore.erase(petStore.begin() + long(i));
    log("You bought " + a.name + " the " + sp.name + " at the pet store. Drive it home to your shelter.");
    return true;
}

bool Sim::buyStoreFood(FoodKind f, float kg) {
    double cost = double(foodPricePerKg(f) * kg) * 1.35;   // retail
    if (!econ.tryPay(clock.day(), Ledger::AnimalCare, cost, std::string("Pet store: ") + foodName(f))) return false;
    food[size_t(f)] += kg;
    return true;
}

int Sim::deliverCargo() {
    int n = 0;
    for (const StoreAnimal& s : truckCargo) {
        Animal& a = admit(s.species, "Bought at the pet store", s.ageFrac);
        a.male = s.male;
        a.coat = s.coat;
        a.name = s.name;
        ++n;
    }
    if (n) log(std::to_string(n) + " new animal" + (n == 1 ? "" : "s") + " unloaded from your truck.");
    truckCargo.clear();
    animals = animalsInCare();
    return n;
}

void Sim::ticket(const std::string& reason, double fine) {
    ticketsTotal++;
    finesTotal += fine;
    econ.post(clock.day(), Ledger::Penalty, -fine, "Traffic ticket: " + reason);
    char buf[64];
    std::snprintf(buf, sizeof buf, "$%.0f", fine);
    log("POLICE: You were pulled over - " + reason + ". Fine: " + buf + ".");
    ratings.shock(fine >= 500.0 ? -1.5f : -0.3f, 0.0f);
}

}  // namespace ps
