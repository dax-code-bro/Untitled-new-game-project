#include "game/Sim.h"
#include "game/People.h"
#include <cstdlib>
#include "core/SaveFile.h"
#include "world/Layout.h"
#include "world/Terrain.h"
#include <cmath>
#include <algorithm>
#include <cstdio>

namespace ps {

std::string GameClock::timeString() const {
    float h = hour();
    int hh = int(h), mm = int((h - float(hh)) * 60.0f);
    int h12 = hh % 12 == 0 ? 12 : hh % 12;
    char buf[32];
    std::snprintf(buf, sizeof buf, "%d:%02d %s", h12, mm, hh < 12 ? "AM" : "PM");
    return buf;
}

std::string GameClock::dateString() const {
    static const char* d[] = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"};
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s, Day %d", d[dayOfWeek()], day() + 1);
    return buf;
}

void Sim::log(const std::string& text) {
    events.push_back({clock.day(), text});
    while (events.size() > 200) { events.pop_front(); eventsSeen = std::max(0, eventsSeen - 1); }
}

void Sim::newGame() {
    *this = Sim();
    econ.post(0, Ledger::Grants, 25000.0, "Small business startup grant");
    // Two people start with you: someone at the front desk and one caretaker.
    // June at the front desk and Tyler, a young caretaker, from the recruit pool
    for (const char* who : {"June Nguyen", "Tyler Brooks"})
        for (const Person& p : peopleRoster())
            if (p.name == who) {
                Employee e = StaffRoster::fromPerson(p.id, ratings.privateRating / 100.0f);
                e.id = staff.nextId++;
                e.hourlyWage = roleInfo(e.role).marketWage;
                staff.employees.push_back(e);
            }
    staff.refreshApplicants(rng, ratings.privateRating / 100.0f, clock.day());
    // Built-in cameras: front gate (it follows the gate as the yard grows) and waiting room.
    security.addCamera("Front Gate", {8.0f, 4.2f, land.gateZ() - 8.0f}, radians(-38.0f), -0.22f);
    security.addCamera("Waiting Room", {3.6f, layout::kCeilingY - 0.3f, 5.7f}, radians(-150.0f), -0.42f);
    security.addCamera("Parking Lot", {-21.5f, 4.6f, 39.5f}, radians(130.0f), -0.32f);
    security.doorLocked.assign(layout::doors().size(), false);
    econ.cashHistory.push_back(float(econ.cash));
    // Five converted cargo containers behind the shelter, each with its own small fenced yard
    for (int i = 0; i < 5; ++i) {
        Placed p;
        p.id = nextPlacedId++;
        p.kind = BuildKind::ContainerShelter;
        p.x = -28.0f + 14.0f * float(i);
        p.z = -38.0f;
        p.rot = 0;
        placed.push_back(p);
    }
    refreshYard();
    // Your first residents: a dachshund and a pair of rabbits, in the container shelters.
    if (findSpecies("Dachshund") >= 0) { Animal& a = admit(findSpecies("Dachshund"), "Owner surrender", 1.0f); a.name = "Frank"; a.male = true; a.coat = 0; }
    if (findSpecies("Holland Lop") >= 0) {
        Animal& r1 = admit(findSpecies("Holland Lop"), "Found in a box at the gate", 1.0f); r1.name = "Clover"; r1.male = false;
        Animal& r2 = admit(findSpecies("Holland Lop"), "Found in a box at the gate", 0.2f); r2.name = "Pip";
    }
    animals = animalsInCare();
    restockPetStore();
    for (auto& e : staff.employees) randomPersonalLife(e, rng);
    // A starter stock of food
    food[size_t(FoodKind::DogFood)] = 25.0f;
    food[size_t(FoodKind::CatFood)] = 10.0f;
    food[size_t(FoodKind::Hay)] = 20.0f;
    food[size_t(FoodKind::Pellets)] = 10.0f;
    food[size_t(FoodKind::FruitVeg)] = 8.0f;
    econ.cashHistory.push_back(float(econ.cash));
    log("Welcome to your new shelter! The front gate is closed, so no visitors can get in yet. "
        "Open it at the gate keypad, or set it to automatic from the office computer.");
}

int Sim::placedCount(BuildKind k) const {
    int n = 0;
    for (auto& p : placed) n += p.kind == k ? 1 : 0;
    return n;
}

int Sim::visitorCapacityPerDay() const {
    int c = 30;  // starting parking lot + waiting room
    for (auto& p : placed) c += buildInfo(p.kind).visitorCapacity;
    return c;
}

float Sim::facilityAppeal() const {
    float a = 4.0f;  // the starting building
    for (auto& p : placed) a += buildInfo(p.kind).appeal;
    return a;
}

void Sim::advance(double gameMinutes) {
    if (gameMinutes <= 0.0) return;
    double target = clock.minutes + gameMinutes;
    // Step hour by hour so long fast-forwards still process every event.
    while (true) {
        double nextHour = (std::floor(clock.minutes / 60.0) + 1.0) * 60.0;
        if (nextHour > target) { clock.minutes = target; break; }
        clock.minutes = nextHour;
        int hourIndex = int(std::llround(nextHour / 60.0)) % 24;
        if (hourIndex == 0) onEndOfDay();
        onHour(hourIndex);
        expireDecisions();
        incidentUpdate();
    }
    expireDecisions();
    incidentUpdate();
}

void Sim::onHour(int h) {
    animalsHourly(h);
    careHourly(h);
    peopleHourly(h);
    // Visitors arrive during opening hours if the gate lets them in.
    if (!security.isOpenHours(float(h))) return;
    if (!security.visitorsCanEnter(float(h))) return;
    int openHours = std::max(1, security.closeHour - security.openHour);
    float demand = 5.0f * Ratings::demandMultiplier(ratings.publicRating) * (0.75f + 0.5f * rng.uniform());
    if (clock.dayOfWeek() >= 5) demand *= 1.6f;  // weekends are busier
    int arrivals = int(demand + rng.uniform());
    int capLeft = std::max(0, visitorCapacityPerDay() - visitorsToday);
    int perHourCap = visitorCapacityPerDay() / openHours + 1;
    int served = std::min({arrivals, capLeft, perHourCap});
    visitorsToday += served;
    turnedAwayToday += arrivals - served;
    for (int i = 0; i < served; ++i)
        donationsToday += rng.range(1.0f, 10.0f) * (0.4f + ratings.publicRating / 80.0f);
}

RatingInputs Sim::ratingInputs() const {
    RatingInputs in;
    in.wageFairness = staff.wageFairness();
    in.missedPayrollsRecent = econ.missedPayrolls;
    in.taxesOverdue = econ.taxDebt > 0.0;
    in.staffCount = int(staff.employees.size());
    in.bonusBudgetPerStaff = in.staffCount ? econ.monthlyBudget[size_t(BudgetCat::StaffBonuses)] / float(in.staffCount) : 0.0f;
    in.staffMorale = staff.averageMorale();
    in.marketingMonthly = econ.monthlyBudget[size_t(BudgetCat::Marketing)];
    in.maintenanceMonthly = econ.monthlyBudget[size_t(BudgetCat::Maintenance)];
    in.securityMonthly = econ.monthlyBudget[size_t(BudgetCat::Security)];
    in.animalCareMonthly = econ.monthlyBudget[size_t(BudgetCat::AnimalCare)];
    in.medicalMonthly = econ.monthlyBudget[size_t(BudgetCat::Medical)];
    in.animals = animalsInCare();
    float fat = 0, str = 0;
    int over = 0, overdue = 0;
    for (auto& e : staff.employees) {
        fat += e.fatigue; str += e.stress;
        over += e.overworked() ? 1 : 0;
        overdue += clock.day() - e.lastInterviewDay > 30 ? 1 : 0;
    }
    if (!staff.employees.empty()) { fat /= float(staff.employees.size()); str /= float(staff.employees.size()); }
    in.staffFatigue = fat;
    in.staffStress = str;
    in.overworkedStaff = over;
    in.interviewsOverdue = overdue;
    in.animalDeathsRecent = int(deathDays.size());
    in.scandalsRecent = int(scandalDays.size());
    in.clientsMistreated = clientsMistreatedRecent;
    in.clientsHelped = clientsHelpedRecent;
    in.protestActive = protest.active;
    in.violatorsTolerated = violatorsTolerated;
    in.protectiveGear = protectiveGear;
    in.receptionists = staff.count(Role::Receptionist);
    in.janitors = staff.count(Role::Janitor);
    in.caretakers = staff.count(Role::Caretaker);
    in.vets = staff.count(Role::Veterinarian);
    in.facilityAppeal = facilityAppeal();
    in.visitorsTurnedAway = turnedAwayYesterday;
    in.visitorsServed = visitorsYesterday;
    in.gateBlockingVisitors = !security.visitorsCanEnter(12.0f);
    in.incidentsRecent = security.incidentsLast30;
    return in;
}

void Sim::onEndOfDay() {
    int day = clock.day() - 1;  // the day that just ended
    // Income
    if (donationsToday > 0.5) {
        char memo[64];
        std::snprintf(memo, sizeof memo, "%d visitors", visitorsToday);
        econ.post(day, Ledger::Donations, std::round(donationsToday * 100.0) / 100.0, memo);
    }
    visitorsYesterday = visitorsToday;
    turnedAwayYesterday = turnedAwayToday;
    visitorsTotal += visitorsToday;
    if (turnedAwayToday > 10)
        log("You had to turn away " + std::to_string(turnedAwayToday) + " visitors - time to expand!");
    visitorsToday = turnedAwayToday = 0;
    donationsToday = 0.0;

    // Fixed daily costs + budget spending
    float upkeep = 0;
    for (auto& p : placed) upkeep += buildInfo(p.kind).upkeepPerDay;
    econ.post(day, Ledger::Utilities, -(85.0 + upkeep * 0.4), "Power, water, internet");
    econ.post(day, Ledger::Supplies, -(35.0 + upkeep * 0.6), "Office & cleaning supplies");
    for (int i = 0; i < int(BudgetCat::Count); ++i) {
        double amt = econ.monthlyBudget[size_t(i)] / 30.0;
        if (amt > 0.005) econ.post(day, budgetLedger(BudgetCat(i)), -amt, "Budget allocation");
    }
    // Pay down any tax debt when possible
    if (econ.taxDebt > 0.0 && econ.cash > econ.taxDebt + 5000.0) {
        econ.post(day, Ledger::Penalty, -econ.taxDebt, "Back taxes paid");
        econ.taxDebt = 0.0;
        log("Back taxes paid off.");
    }

    animalsDaily();
    careDaily();
    restockPetStore();
    peopleDaily();
    // Staff morale drifts toward what their situation deserves.
    float bonusPer = staff.employees.empty() ? 0.0f
                     : econ.monthlyBudget[size_t(BudgetCat::StaffBonuses)] / float(staff.employees.size());
    bool hasStaffBuilding = placedCount(BuildKind::StaffBuilding) > 0;
    bool hasManager = staff.count(Role::Manager) > 0;
    for (size_t i = 0; i < staff.employees.size();) {
        Employee& e = staff.employees[i];
        e.daysEmployed++;
        float fair = e.hourlyWage / roleInfo(e.role).marketWage;
        float target = 0.55f + clampf((fair - 1.0f) * 1.2f, -0.35f, 0.25f) + std::min(0.15f, bonusPer / 1000.0f) +
                       (hasStaffBuilding ? 0.08f : 0.0f) + (hasManager ? 0.05f : 0.0f) +
                       (ratings.privateRating - 50.0f) / 250.0f - 0.2f * float(e.missedPaychecks) -
                       std::max(0.0f, e.fatigue - 0.3f) * 0.45f - e.stress * 0.3f + (e.relationship - 0.35f) * 0.25f -
                       (clock.day() - e.lastInterviewDay > 30 ? 0.04f : 0.0f);
        e.morale = clampf(e.morale + (clampf(target, 0.0f, 1.0f) - e.morale) * 0.08f, 0.0f, 1.0f);
        if (e.morale < 0.25f && rng.uniform() < 0.12f) {
            log(e.name + " (" + roleInfo(e.role).name + ") quit. " +
                (e.fatigue > 0.7f ? "\"I'm exhausted and nobody cares.\"" : (e.stress > 0.7f ? "\"I can't take the stress anymore.\"" : "Morale was too low.")));
            ratings.shock(-0.5f, -2.0f);
            staff.leave(e.id, clock.day(), false);
            continue;
        }
        ++i;
    }

    // Overnight security
    if (rng.uniform() < security.incidentChance(staff.count(Role::SecurityGuard),
                                                 econ.monthlyBudget[size_t(BudgetCat::Security)])) {
        double loss = std::round(rng.range(400.0f, 3500.0f));
        econ.post(day, Ledger::Maintenance, -loss, "Vandalism repairs");
        security.incidentDays.push_back(day);
        log("Break-in overnight! Repairs cost $" + std::to_string(int(loss)) + ". More cameras or a locked gate would help.");
    }
    while (!security.incidentDays.empty() && security.incidentDays.front() < day - 30)
        security.incidentDays.erase(security.incidentDays.begin());
    security.incidentsLast30 = int(security.incidentDays.size());

    ratings.dailyUpdate(ratingInputs());

    int newDay = clock.day();
    if (newDay % 7 == 5) payWeeklyPayroll();   // after Friday closes (day index 4 -> 5)
    staff.refreshApplicants(rng, ratings.privateRating / 100.0f, newDay);
    if (newDay % 30 == 0) monthly();
    if (newDay % 90 == 0) quarterly();
    econ.cashHistory.push_back(float(econ.cash));
    if (econ.cashHistory.size() > 365) econ.cashHistory.erase(econ.cashHistory.begin());
    if (econ.missedPayrolls > 0 && newDay % 30 == 0) econ.missedPayrolls--;  // memories fade
}

void Sim::payWeeklyPayroll() {
    int day = clock.day();
    double gross = staff.weeklyGross();
    if (gross <= 0.0) return;
    double ptax = gross * (econ.tax.payrollEmployer + econ.tax.unemployment);
    if (econ.cash >= gross + ptax) {
        econ.post(day, Ledger::Payroll, -gross, std::to_string(staff.employees.size()) + " employees");
        econ.post(day, Ledger::PayrollTax, -ptax, "Employer FICA 7.65% + FUTA 0.6%");
        for (auto& e : staff.employees) e.missedPaychecks = std::max(0, e.missedPaychecks - 1);
    } else {
        econ.missedPayrolls++;
        for (auto& e : staff.employees) { e.missedPaychecks++; e.morale = std::max(0.0f, e.morale - 0.25f); }
        ratings.shock(-2.0f, -8.0f);
        log("PAYROLL MISSED - not enough cash. Your staff went unpaid this week.");
    }
}

void Sim::monthly() {
    int day = clock.day();
    econ.startNewMonth();
    if (econ.taxDebt > 0.0) {
        double pen = econ.taxDebt * 0.01;
        econ.taxDebt += pen;
        log("Tax penalty: 1% interest added to your back taxes.");
    }
    float rep = ratings.publicRating + ratings.privateRating;
    if (rep > 105.0f && rng.uniform() < 0.35f) {
        double g = std::round(rng.range(5000.0f, 20000.0f) * (rep / 120.0f));
        econ.post(day, Ledger::Grants, g, "Community animal-welfare grant");
        log("You were awarded a community grant of $" + std::to_string(int(g)) + "!");
    }
}

void Sim::quarterly() {
    int day = clock.day();
    double profit = econ.quarterProfit();
    double incomeTax = profit > 0.0 ? profit * econ.tax.income : 0.0;
    double propTax = econ.propertyValue * econ.tax.propertyAnnual / 4.0;
    auto payTax = [&](Ledger cat, double amt, const char* memo) {
        if (amt <= 0.0) return;
        if (!econ.tryPay(day, cat, amt, memo)) {
            econ.taxDebt += amt;
            econ.latePayments++;
            ratings.shock(-1.0f, -4.0f);
            log(std::string("Couldn't pay ") + memo + " - it's now back taxes with penalties.");
        }
    };
    payTax(Ledger::IncomeTax, incomeTax, "quarterly income tax");
    payTax(Ledger::PropertyTax, propTax, "quarterly property tax");
    econ.startNewQuarter();
    log("Quarter closed. Taxes are due and have been processed. Check the Finances tab.");
}

bool Sim::build(BuildKind k, float x, float z, int rot, std::string* why, int* outId) {
    const BuildInfo& bi = buildInfo(k);
    if (!validPlacement(k, x, z, rot, placed, why, &land)) return false;
    if (econ.cash < bi.cost) { if (why) *why = "Not enough cash"; return false; }
    econ.post(clock.day(), Ledger::Construction, -bi.cost, bi.name);
    econ.propertyValue += bi.cost * 0.8;
    Placed p;
    p.id = nextPlacedId++;
    p.kind = k; p.x = x; p.z = z; p.rot = rot & 3;
    placed.push_back(p);
    if (k == BuildKind::SecurityCamera) {
        float gy = terrain::height(x, z);
        security.addCamera("Camera #" + std::to_string(p.id), {x, gy + 4.0f, z}, radians(90.0f * float(rot)), -0.35f, p.id);
    }
    if (outId) *outId = p.id;
    refreshYard();
    return true;
}

bool Sim::demolish(int id) {
    for (size_t i = 0; i < placed.size(); ++i)
        if (placed[i].id == id) {
            const BuildInfo& bi = buildInfo(placed[i].kind);
            econ.post(clock.day(), Ledger::Construction, bi.cost * 0.4, std::string("Salvage: ") + bi.name);
            econ.propertyValue = std::max(850000.0, econ.propertyValue - bi.cost * 0.8);
            if (placed[i].kind == BuildKind::SecurityCamera) security.removeCameraForPlaced(id);
            placed.erase(placed.begin() + long(i));
            refreshYard();
            return true;
        }
    return false;
}

void Sim::refreshYard() {
    using namespace layout;
    // The shelter itself and its parking lot, then everything you've built except trees and paths
    AABB y = buildingBounds();
    y.expand(AABB({kParkMinX, 0, kParkMinZ}, {kParkMaxX, 0, kParkMaxZ}));
    for (const Placed& p : placed) {
        BuildCat c = buildCategory(p.kind);
        if (c == BuildCat::Trees || c == BuildCat::Pathways || p.kind == BuildKind::LampPost || p.kind == BuildKind::SecurityCamera) continue;
        y.expand(p.bounds(0.0f));
    }
    // Room to walk around everything, snapped outward to 5 m
    const float margin = 10.0f;
    auto down = [](float v) { return std::floor(v / 5.0f) * 5.0f; };
    auto up = [](float v) { return std::ceil(v / 5.0f) * 5.0f; };
    AABB out({down(y.min.x - margin), 0.0f, down(y.min.z - margin)}, {up(y.max.x + margin), 0.0f, up(y.max.z + margin)});
    // Never past the old property edge by the highway (the gate stays on your side of the road)
    out.max.z = std::min(out.max.z, kSouthEdge - 2.0f);
    out.min.x = std::min(out.min.x, -kGateHalfWidth - 6.0f);
    out.max.x = std::max(out.max.x, kGateHalfWidth + 6.0f);
    land.setYard(out);
    // The front gate camera watches the gate wherever it is now
    for (SecurityCamera& c : security.cameras)
        if (c.placedId < 0 && (c.name == "Front Gate" || c.name == "Highway Gate")) { c.name = "Front Gate"; c.pos = {8.0f, 4.2f, out.max.z - 8.0f}; }
}

int Sim::officeCapacity() const {
    // Main building: office, front desk and clinic workstations; then staff buildings and office blocks
    return 3 + 2 * placedCount(BuildKind::StaffBuilding) + 4 * placedCount(BuildKind::StaffOffices);
}

bool Sim::hire(int applicantId, std::string* why) {
    if (int(staff.employees.size()) >= officeCapacity()) {
        if (why) *why = "No free office. Build Staff Offices (Build mode > Operations) - every worker needs their own office.";
        return false;
    }
    if (!staff.hire(applicantId)) return false;
    const Employee& e = staff.employees.back();
    log("New hire: " + e.name + " (" + roleInfo(e.role).name + ").");
    return true;
}

bool Sim::buyLand(int c, int r, std::string* why) {
    if (!land.canBuy(c, r)) { if (why) *why = land.homeOwned() ? "You can only buy land next to land you own" : "Buy the square mile around your shelter first"; return false; }
    double cost = land.price(c, r);
    if (!econ.tryPay(clock.day(), Ledger::Construction, cost, "Land purchase (1 sq mi)")) { if (why) *why = "Not enough cash"; return false; }
    land.buy(c, r);
    econ.propertyValue += cost;
    char buf[160];
    std::snprintf(buf, sizeof buf, "You bought another square mile of land. You now own %.1f sq mi - the fence has been moved out.", double(land.ownedSqMi()));
    log(buf);
    ratings.shock(0.3f, 0.3f);
    return true;
}

const Placed* Sim::findPlaced(int id) const {
    for (auto& p : placed) if (p.id == id) return &p;
    return nullptr;
}

void Sim::save(KeyValues& kv) const {
    kv.setf("clock.minutes", clock.minutes);
    kv.setf("econ.cash", econ.cash);
    kv.setf("econ.property", econ.propertyValue);
    kv.setf("econ.taxDebt", econ.taxDebt);
    kv.seti("econ.missed", econ.missedPayrolls);
    kv.seti("econ.late", econ.latePayments);
    for (int i = 0; i < int(BudgetCat::Count); ++i) kv.setf("budget." + std::to_string(i), econ.monthlyBudget[size_t(i)]);
    for (int i = 0; i < int(Ledger::Count); ++i) {
        kv.setf("q." + std::to_string(i), econ.quarter[size_t(i)]);
        kv.setf("m." + std::to_string(i), econ.month[size_t(i)]);
        kv.setf("life." + std::to_string(i), econ.lifetime[size_t(i)]);
    }
    kv.setf("rating.public", ratings.publicRating);
    kv.setf("rating.private", ratings.privateRating);
    kv.seti("staff.nextId", staff.nextId);
    kv.seti("staff.count", long(staff.employees.size()));
    for (size_t i = 0; i < staff.employees.size(); ++i) {
        const Employee& e = staff.employees[i];
        std::string p = "staff." + std::to_string(i) + ".";
        kv.seti(p + "id", e.id); kv.set(p + "name", e.name); kv.seti(p + "role", int(e.role));
        kv.setf(p + "wage", e.hourlyWage); kv.setf(p + "hours", e.hoursPerWeek);
        kv.setf(p + "skill", e.skill); kv.setf(p + "morale", e.morale); kv.seti(p + "days", e.daysEmployed);
    }
    kv.seti("placed.nextId", nextPlacedId);
    kv.seti("placed.count", long(placed.size()));
    for (size_t i = 0; i < placed.size(); ++i) {
        std::string p = "placed." + std::to_string(i) + ".";
        kv.seti(p + "id", placed[i].id); kv.seti(p + "kind", int(placed[i].kind));
        kv.setf(p + "x", placed[i].x); kv.setf(p + "z", placed[i].z); kv.seti(p + "rot", placed[i].rot);
    }
    kv.seti("sec.auto", security.gateAutomatic);
    kv.seti("sec.locked", security.gateLocked);
    kv.seti("sec.manual", security.gateManualOpen);
    kv.seti("sec.open", security.openHour);
    kv.seti("sec.close", security.closeHour);
    std::string locks;
    for (bool b : security.doorLocked) locks += b ? '1' : '0';
    kv.set("sec.doors", locks);
    kv.seti("visitors.total", visitorsTotal);
    kv.seti("gear", protectiveGear);
    {
        std::string away, dead;
        for (size_t i = 0; i < staff.awayUntil.size(); ++i) { away += std::to_string(staff.awayUntil[i]) + ","; dead += staff.deceased[i] ? '1' : '0'; }
        kv.set("staff.away", away);
        kv.set("staff.dead", dead);
    }
    land.save(kv);
    kv.set("owner", ownerName);
    for (size_t i = 0; i < staff.employees.size(); ++i) {
        const Employee& e = staff.employees[i];
        std::string p = "staff." + std::to_string(i) + ".";
        kv.setf(p + "fatigue", e.fatigue); kv.setf(p + "stress", e.stress); kv.setf(p + "rel", e.relationship);
        kv.seti(p + "daysoff", e.daysOffPerWeek); kv.seti(p + "vac", e.vacationUntil); kv.seti(p + "interview", e.lastInterviewDay);
        kv.set(p + "family", e.family); kv.set(p + "hobby", e.hobby); kv.seti(p + "person", e.personId);
    }
    kv.seti("animal.nextId", nextAnimalId);
    int n = 0;
    for (const Animal& a : animalList) {
        if (!a.inCare()) continue;
        std::string p = "animal." + std::to_string(n++) + ".";
        kv.seti(p + "id", a.id); kv.seti(p + "sp", a.species); kv.set(p + "name", a.name); kv.seti(p + "male", a.male);
        kv.setf(p + "age", a.ageYears); kv.seti(p + "coat", a.coat); kv.seti(p + "seed", long(a.seed)); kv.setf(p + "wf", a.weightFactor);
        kv.setf(p + "health", a.health); kv.setf(p + "hunger", a.hunger); kv.setf(p + "stress", a.stress);
        kv.seti(p + "status", int(a.status)); kv.set(p + "cond", a.condition); kv.setf(p + "bleed", a.bleeding);
        kv.seti(p + "surg", a.needsSurgery); kv.seti(p + "vax", a.vaccinated); kv.seti(p + "fixed", a.fixed);
        kv.seti(p + "house", a.housing); kv.seti(p + "day", a.arrivedDay); kv.set(p + "origin", a.origin);
        kv.setf(p + "water", a.water); kv.seti(p + "checked", a.checkedDay); kv.seti(p + "hidden", int(a.hidden));
        kv.seti(p + "hdays", a.hiddenDays); kv.seti(p + "diag", a.diagnosed);
        kv.seti(p + "owned", a.owned); kv.set(p + "ownerName", a.ownerName); kv.seti(p + "consent", a.ownerConsented);
    }
    kv.seti("animal.count", n);
    for (int i = 0; i < int(FoodKind::Count); ++i) kv.setf("food." + std::to_string(i), food[i]);
}

void Sim::load(const KeyValues& kv) {
    newGame();
    events.clear();
    eventsSeen = 0;
    clock.minutes = kv.getf("clock.minutes", clock.minutes);
    econ.cash = kv.getf("econ.cash", econ.cash);
    econ.propertyValue = kv.getf("econ.property", econ.propertyValue);
    econ.taxDebt = kv.getf("econ.taxDebt", 0.0);
    econ.missedPayrolls = int(kv.geti("econ.missed", 0));
    econ.latePayments = int(kv.geti("econ.late", 0));
    for (int i = 0; i < int(BudgetCat::Count); ++i)
        econ.monthlyBudget[size_t(i)] = float(kv.getf("budget." + std::to_string(i), econ.monthlyBudget[size_t(i)]));
    for (int i = 0; i < int(Ledger::Count); ++i) {
        econ.quarter[size_t(i)] = kv.getf("q." + std::to_string(i));
        econ.month[size_t(i)] = kv.getf("m." + std::to_string(i));
        econ.lifetime[size_t(i)] = kv.getf("life." + std::to_string(i));
    }
    econ.ledger.clear();
    econ.cashHistory = {float(econ.cash)};
    ratings.publicRating = float(kv.getf("rating.public", ratings.publicRating));
    ratings.privateRating = float(kv.getf("rating.private", ratings.privateRating));
    staff.employees.clear();
    staff.nextId = int(kv.geti("staff.nextId", 1));
    int n = int(kv.geti("staff.count", 0));
    for (int i = 0; i < n; ++i) {
        std::string p = "staff." + std::to_string(i) + ".";
        Employee e;
        e.id = int(kv.geti(p + "id")); e.name = kv.get(p + "name"); e.role = Role(kv.geti(p + "role"));
        e.hourlyWage = float(kv.getf(p + "wage", 15)); e.hoursPerWeek = float(kv.getf(p + "hours", 40));
        e.skill = float(kv.getf(p + "skill", 0.5)); e.morale = float(kv.getf(p + "morale", 0.7));
        e.daysEmployed = int(kv.geti(p + "days"));
        staff.employees.push_back(e);
    }
    // Rebuild placed objects (re-creates their cameras)
    security.cameras.erase(std::remove_if(security.cameras.begin(), security.cameras.end(),
                                          [](const SecurityCamera& c) { return c.placedId >= 0; }),
                           security.cameras.end());
    placed.clear();
    int pc = int(kv.geti("placed.count", 0));
    for (int i = 0; i < pc; ++i) {
        std::string p = "placed." + std::to_string(i) + ".";
        Placed pl;
        pl.id = int(kv.geti(p + "id")); pl.kind = BuildKind(kv.geti(p + "kind"));
        pl.x = float(kv.getf(p + "x")); pl.z = float(kv.getf(p + "z")); pl.rot = int(kv.geti(p + "rot"));
        placed.push_back(pl);
        if (pl.kind == BuildKind::SecurityCamera)
            security.addCamera("Camera #" + std::to_string(pl.id), {pl.x, terrain::height(pl.x, pl.z) + 4.0f, pl.z},
                               radians(90.0f * float(pl.rot)), -0.35f, pl.id);
    }
    nextPlacedId = int(kv.geti("placed.nextId", 1));
    refreshYard();
    security.gateAutomatic = kv.geti("sec.auto", 0) != 0;
    security.gateLocked = kv.geti("sec.locked", 0) != 0;
    security.gateManualOpen = kv.geti("sec.manual", 0) != 0;
    security.openHour = int(kv.geti("sec.open", 9));
    security.closeHour = int(kv.geti("sec.close", 18));
    std::string locks = kv.get("sec.doors");
    for (size_t i = 0; i < security.doorLocked.size() && i < locks.size(); ++i) security.doorLocked[i] = locks[i] == '1';
    visitorsTotal = kv.geti("visitors.total", 0);
    protectiveGear = kv.geti("gear", 0) != 0;
    {
        std::string away = kv.get("staff.away"), dead = kv.get("staff.dead");
        size_t i = 0, st = 0;
        while (i < staff.awayUntil.size() && st < away.size()) {
            size_t e = away.find(',', st);
            staff.awayUntil[i++] = std::atoi(away.substr(st, e - st).c_str());
            if (e == std::string::npos) break;
            st = e + 1;
        }
        for (size_t k = 0; k < staff.deceased.size() && k < dead.size(); ++k) staff.deceased[k] = dead[k] == '1';
    }
    land.load(kv);
    ownerName = kv.get("owner", ownerName);
    for (int i = 0; i < int(staff.employees.size()); ++i) {
        Employee& e = staff.employees[size_t(i)];
        std::string p = "staff." + std::to_string(i) + ".";
        e.fatigue = float(kv.getf(p + "fatigue", 0.15)); e.stress = float(kv.getf(p + "stress", 0.2)); e.relationship = float(kv.getf(p + "rel", 0.35));
        e.daysOffPerWeek = int(kv.geti(p + "daysoff", 2)); e.vacationUntil = int(kv.geti(p + "vac", -1));
        e.lastInterviewDay = int(kv.geti(p + "interview", -999)); e.family = kv.get(p + "family"); e.hobby = kv.get(p + "hobby");
        e.personId = int(kv.geti(p + "person", 0));
        e.gearIssued = protectiveGear;
        if (e.family.empty()) randomPersonalLife(e, rng);
    }
    animalList.clear();
    decisions.clear();
    nextAnimalId = int(kv.geti("animal.nextId", 1));
    int an = int(kv.geti("animal.count", 0));
    for (int i = 0; i < an; ++i) {
        std::string p = "animal." + std::to_string(i) + ".";
        Animal a;
        a.id = int(kv.geti(p + "id")); a.species = int(kv.geti(p + "sp")); a.name = kv.get(p + "name"); a.male = kv.geti(p + "male") != 0;
        a.ageYears = float(kv.getf(p + "age", 2)); a.coat = int(kv.geti(p + "coat")); a.seed = uint32_t(kv.geti(p + "seed", 1));
        a.weightFactor = float(kv.getf(p + "wf", 1)); a.health = float(kv.getf(p + "health", 1)); a.hunger = float(kv.getf(p + "hunger"));
        a.stress = float(kv.getf(p + "stress", 0.3)); a.status = AnimalStatus(kv.geti(p + "status")); a.condition = kv.get(p + "cond");
        a.bleeding = float(kv.getf(p + "bleed")); a.needsSurgery = kv.geti(p + "surg") != 0; a.vaccinated = kv.geti(p + "vax") != 0;
        a.fixed = kv.geti(p + "fixed") != 0; a.housing = int(kv.geti(p + "house", -1)); a.arrivedDay = int(kv.geti(p + "day"));
        a.origin = kv.get(p + "origin"); a.owned = kv.geti(p + "owned") != 0; a.ownerName = kv.get(p + "ownerName");
        a.ownerConsented = kv.geti(p + "consent") != 0;
        a.water = float(kv.getf(p + "water", 1)); a.checkedDay = int(kv.geti(p + "checked", -1));
        a.hidden = Hidden(kv.geti(p + "hidden", 0)); a.hiddenDays = int(kv.geti(p + "hdays", 0)); a.diagnosed = kv.geti(p + "diag") != 0;
        if (a.species >= 0 && a.species < int(speciesCatalog().size())) animalList.push_back(a);
    }
    animals = animalsInCare();
    for (int i = 0; i < int(FoodKind::Count); ++i) food[i] = float(kv.getf("food." + std::to_string(i), food[i]));
    staff.refreshApplicants(rng, ratings.privateRating / 100.0f, clock.day());
    log("Game loaded.");
}

}  // namespace ps
