// The staff's workday: you open the shelter (the sign on the front door) and
// close it at night; staff come in early, work their assigned job while you're
// open, and go home when you close. Front desk handles clients for you,
// caretakers do rounds (daily check-ups), vets see sick animals and operate.
#include "game/Sim.h"
#include <algorithm>
#include <cmath>

namespace ps {

const char* jobName(Job j) {
    switch (j) {
    case Job::Auto: return "Their usual job";
    case Job::FrontDesk: return "Front desk";
    case Job::Rounds: return "Animal rounds";
    case Job::Clinic: return "Clinic (check-ups & surgery)";
    case Job::Roam: return "Walk the facility";
    default: return "?";
    }
}

const char* jobDescription(Job j) {
    switch (j) {
    case Job::Auto: return "Does what their role is for.";
    case Job::FrontDesk: return "Stays at the front desk and takes client requests for you (greets owners, explains, gets consent).";
    case Job::Rounds: return "Walks the animal housing and checks on every animal (counts as the daily check-up).";
    case Job::Clinic: return "Works in the medical room: check-ups for animals that seem off, and surgery (vets).";
    case Job::Roam: return "Walks around the facility, keeps an eye on things, checks on pets now and then.";
    default: return "";
    }
}

Job Sim::jobOf(const Employee& e) const {
    if (e.job != Job::Auto) return e.job;
    switch (e.role) {
    case Role::Receptionist: return Job::FrontDesk;
    case Role::Veterinarian:
    case Role::VetTech: return Job::Clinic;
    case Role::Caretaker: return Job::Rounds;
    default: return Job::Roam;
    }
}

bool Sim::worksToday(const Employee& e) const {
    int day = clock.day();
    if (e.onVacation(day)) return false;
    // Days off rotate by person so the team isn't all off at once
    int dow = (clock.dayOfWeek() + e.id * 3) % 7;
    return dow >= e.daysOffPerWeek;
}

float Sim::arriveHour(const Employee& e) const {
    // Early birds: 7:00 - 7:50, before you open the doors
    return 7.0f + float((e.personId * 7 + e.id * 13) % 6) * (10.0f / 60.0f);
}

bool Sim::staffOnSite(const Employee& e) const {
    return worksToday(e) && e.leftDay != clock.day() && clock.hour() >= arriveHour(e) && clock.hour() < 22.0f;
}

int Sim::officeSlot(int employeeId) const {
    // Desks: the front desk goes to whoever works it; everyone else fills the remaining desks in hiring order
    int cap = officeCapacity();
    int slot = 1;
    bool deskTaken = false;
    for (const Employee& e : staff.employees) {
        if (jobOf(e) == Job::FrontDesk && !deskTaken) {
            deskTaken = true;
            if (e.id == employeeId) return 0;
            continue;
        }
        int s = slot++;
        if (s == 0) s = slot++;
        if (e.id == employeeId) return s < cap ? s : -1;
    }
    return -1;
}

void Sim::openShelter() {
    if (shelterOpen) return;
    shelterOpen = true;
    log("You flipped the sign to OPEN. Visitors can come in" + std::string(security.visitorsCanEnter(clock.hour()) ? "." : " once the gate is open."));
}

void Sim::closeShelter() {
    if (!shelterOpen) return;
    shelterOpen = false;
    int going = 0;
    for (Employee& e : staff.employees)
        if (staffOnSite(e)) { e.leftDay = clock.day(); e.calledToOffice = false; ++going; }
    log(going ? "You closed for the day. " + std::to_string(going) + (going == 1 ? " person is" : " people are") + " heading home."
              : "You closed for the day.");
}

bool Sim::staffCheckAnimal(int employeeId, int animalId) {
    Employee* e = staff.find(employeeId);
    Animal* a = findAnimal(animalId);
    if (!e || !a || !a->inCare() || !staffOnSite(*e)) return false;
    bool first = a->checkedDay != clock.day();
    std::vector<std::string> notes = checkAnimal(animalId);
    if (!first) return true;
    e->checksToday++;
    // Caretakers top up water and feed hungry animals while they're there
    if (a->water < 0.5f) giveWater(animalId);
    if (a->hunger > 0.6f) handFeed(animalId);
    // Anything worrying gets reported to you
    for (const std::string& n : notes)
        if (n.find("bleeding") != std::string::npos || n.find("check-up") != std::string::npos || n.find("EMPTY") != std::string::npos) {
            log(e->name + " checked on " + a->name + ": " + n);
            break;
        }
    return true;
}

int Sim::animalNeedingVet() const {
    int best = -1;
    float worst = 2.0f;
    for (const Animal& a : animalList) {
        if (!a.inCare()) continue;
        if (surgery.active && surgery.animal == a.id) continue;
        bool surgeryReady = a.needsSurgery && !(a.owned && !a.ownerConsented);
        bool undiagnosed = a.hidden != Hidden::None && !a.diagnosed && a.hiddenDays >= 2;
        bool sick = a.status == AnimalStatus::Sick || a.status == AnimalStatus::Injured || a.status == AnimalStatus::Critical;
        if (!surgeryReady && !undiagnosed && !sick) continue;
        float score = a.health - (surgeryReady ? 0.5f : 0.0f);
        if (score < worst) { worst = score; best = a.id; }
    }
    return best;
}

bool Sim::staffTreat(int employeeId, int animalId) {
    Employee* e = staff.find(employeeId);
    Animal* a = findAnimal(animalId);
    if (!e || !a || !a->inCare() || !staffOnSite(*e)) return false;
    const Species& sp = speciesCatalog()[size_t(a->species)];
    bool vet = e->role == Role::Veterinarian;
    float skill = e->skill;
    e->treatedToday++;
    a->checkedDay = clock.day();
    // 1) Surgery (vets only), when it's needed and allowed
    if (vet && a->needsSurgery && !(a->owned && !a->ownerConsented) && !surgery.active) {
        double cost = 120.0 + std::sqrt(std::max(1.0f, a->weightKg(sp))) * 45.0;
        econ.post(clock.day(), Ledger::Medical, -cost, "Surgery supplies: " + a->name + " (" + e->name + ")");
        if (rng.uniform() < 0.72f + 0.26f * skill) {
            a->needsSurgery = false;
            a->bleeding = 0.0f;
            a->status = AnimalStatus::Recovering;
            a->health = std::max(a->health, 0.5f);
            a->condition.clear();
            if (a->hidden != Hidden::None && hiddenNeedsSurgery(a->hidden)) { a->hidden = Hidden::None; a->diagnosed = false; }
            log(e->name + " operated on " + a->name + " the " + sp.name + ". It went well; recovering in the ward.");
            ratings.shock(0.5f, 0.3f);
        } else {
            a->health = std::max(0.15f, a->health - 0.15f);
            log(e->name + " operated on " + a->name + " but there were complications. It needs close watching.");
        }
        return true;
    }
    // 2) A check-up that finds a hidden problem
    if (a->hidden != Hidden::None && !a->diagnosed) {
        if (rng.uniform() < 0.45f + 0.5f * skill) {
            a->diagnosed = true;
            econ.post(clock.day(), Ledger::Medical, -40.0, std::string("Check-up: ") + a->name);
            if (hiddenNeedsSurgery(a->hidden)) {
                a->needsSurgery = true;
                a->condition = hiddenName(a->hidden);
                if (a->status == AnimalStatus::Healthy) a->status = AnimalStatus::Sick;
                log(e->name + " found " + hiddenName(a->hidden) + " in " + a->name + " during a check-up. Surgery needed" +
                    std::string(vet ? "; they can do it." : " - a vet has to operate."));
            } else if (a->hidden == Hidden::Pregnancy) {
                log(e->name + ": " + a->name + " is pregnant.");
            } else {
                econ.post(clock.day(), Ledger::Medical, -60.0, std::string("Treatment: ") + hiddenName(a->hidden));
                log(e->name + " diagnosed and started treating " + a->name + " for " + hiddenName(a->hidden) + ".");
                a->hidden = Hidden::None;
                a->status = AnimalStatus::Recovering;
                a->condition.clear();
            }
        }
        return true;
    }
    // 3) Sick or injured: treatment and wound care
    if (a->status == AnimalStatus::Sick || a->status == AnimalStatus::Injured || a->status == AnimalStatus::Critical) {
        a->bleeding = std::max(0.0f, a->bleeding - 0.2f);
        a->health = std::min(1.0f, a->health + 0.08f + 0.08f * skill);
        econ.post(clock.day(), Ledger::Medical, -25.0, "Treatment: " + a->name);
    }
    return true;
}

void Sim::staffWorkHourly(int hour) {
    int day = clock.day();
    if (hour == 0)
        for (Employee& e : staff.employees) { e.checksToday = e.treatedToday = e.clientsToday = 0; e.calledToOffice = false; }
    // Staff arrive before you open; a reminder when they're all in and you haven't opened yet
    if (!shelterOpen && hour == security.openHour) {
        int here = 0;
        for (const Employee& e : staff.employees) here += staffOnSite(e) ? 1 : 0;
        if (here) log("It's " + std::to_string(hour) + " AM and your staff are here. Flip the front-door sign to OPEN when you're ready.");
    }
    // Front desk: takes client requests for you
    Employee* desk = nullptr;
    for (Employee& e : staff.employees)
        if (jobOf(e) == Job::FrontDesk && staffOnSite(e) && !e.calledToOffice) { desk = &e; break; }
    if (desk && shelterOpen) {
        for (size_t i = 0; i < decisions.size();) {
            Decision& d = decisions[i];
            int choice = -1;
            if (d.kind == DecisionKind::ClientVisit) choice = 0;        // greet warmly, explain, ask consent
            else if (d.kind == DecisionKind::RuleViolator) choice = 0;  // politely ask them to stop or leave
            if (choice < 0 || rng.uniform() > 0.55f + 0.45f * desk->skill) { ++i; continue; }
            std::string title = d.title;
            desk->clientsToday++;
            log(desk->name + " (front desk) handled it: " + title + ".");
            resolve(d.id, choice);   // erases it
        }
    }
    // Everyone needs an office: without one, it wears on them (checked at noon)
    if (hour == 12)
        for (Employee& e : staff.employees) {
            if (!staffOnSite(e) || officeSlot(e.id) >= 0) continue;
            e.morale = std::max(0.0f, e.morale - 0.03f);
            e.stress = std::min(1.0f, e.stress + 0.03f);
            if (clock.dayOfWeek() == 0) log(e.name + " still doesn't have an office. Build a Staff Building or Staff Offices.");
        }
    // Long day: if you forget to close, the staff still go home at 9 PM, and the sign flips at 10
    if (hour == 21) {
        int going = 0;
        for (Employee& e : staff.employees)
            if (staffOnSite(e)) { e.leftDay = day; e.calledToOffice = false; ++going; }
        if (going) log("It's 9 PM - your staff went home for the night.");
    }
    if (hour == 22 && shelterOpen) {
        shelterOpen = false;
        log("The shelter closed for the night (10 PM).");
    }
}

}  // namespace ps
