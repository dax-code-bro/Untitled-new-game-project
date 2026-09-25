#include "game/Staff.h"
#include "game/People.h"
#include "core/Math.h"
#include <algorithm>
#include <cmath>

namespace ps {

const RoleInfo& roleInfo(Role r) {
    static const RoleInfo info[] = {
        {"Animal Caretaker", 16.50f, 40, "Feeds, cleans and exercises animals."},
        {"Veterinarian", 52.00f, 40, "Runs the medical room. Required for surgery."},
        {"Vet Technician", 21.00f, 40, "Assists the vet, handles check-ups and meds."},
        {"Receptionist", 17.00f, 40, "Greets visitors in the waiting room, books appointments."},
        {"Janitor", 15.50f, 30, "Keeps the facility clean. Cleanliness drives public rating."},
        {"Security Guard", 19.00f, 40, "Patrols at night. Reduces break-ins and vandalism."},
        {"Shelter Manager", 29.00f, 40, "Keeps staff morale up and paperwork on time."},
    };
    return info[int(r)];
}

int StaffRoster::count(Role r) const {
    return int(std::count_if(employees.begin(), employees.end(), [r](const Employee& e) { return e.role == r; }));
}

double StaffRoster::weeklyGross() const {
    double s = 0;
    for (const auto& e : employees) s += e.weeklyGross();
    return s;
}

float StaffRoster::averageMorale() const {
    if (employees.empty()) return 0.7f;
    float s = 0;
    for (const auto& e : employees) s += e.morale;
    return s / float(employees.size());
}

float StaffRoster::wageFairness() const {
    if (employees.empty()) return 1.0f;
    float s = 0;
    for (const auto& e : employees) s += e.hourlyWage / roleInfo(e.role).marketWage;
    return s / float(employees.size());
}

std::string randomPersonName(Rng& rng) {
    static const char* first[] = {"Avery", "Jordan", "Maria", "Luis", "Priya", "Sam", "Keisha", "Dmitri", "Hannah",
                                  "Omar", "Grace", "Wyatt", "Mei", "Carlos", "Ruth", "Tomas", "Nia", "Eli",
                                  "Rosa", "Ben", "Aisha", "Colt", "June", "Marcus", "Ivy", "Theo", "Lena", "Jesse"};
    static const char* last[] = {"Hart", "Morgan", "Delgado", "Nguyen", "Patel", "Brooks", "Okafor", "Ivanov",
                                 "Reed", "Haddad", "Whitaker", "Chen", "Ramos", "Calloway", "Lindqvist", "Boone",
                                 "Mbeki", "Sutter", "Vance", "Holloway", "Abara", "Pryce", "Castillo", "Dunn"};
    return std::string(first[rng.next() % (sizeof(first) / sizeof(*first))]) + " " +
           last[rng.next() % (sizeof(last) / sizeof(*last))];
}

void randomPersonalLife(Employee& e, Rng& rng) {
    static const char* fam[] = {"married, two kids (Lily and Mateo)", "single, lives with a rescue greyhound named Comet",
                                "married, a baby on the way", "raising a teenage son alone", "cares for an elderly mother",
                                "engaged - wedding next spring", "divorced, three cats", "lives with a partner and a parrot",
                                "has twin daughters in middle school", "just moved here from out of state"};
    static const char* hob[] = {"coaches Little League", "restores old pickup trucks", "plays bass in a garage band",
                                "is training for a marathon", "bakes sourdough every weekend", "volunteers at the food bank",
                                "is studying to become a vet tech", "fishes the reservoir every Sunday", "paints wildlife",
                                "rides rodeo on weekends", "is learning Spanish", "builds furniture"};
    e.family = fam[rng.next() % (sizeof(fam) / sizeof(*fam))];
    e.hobby = hob[rng.next() % (sizeof(hob) / sizeof(*hob))];
}

const char* lifeEventName(int e) {
    static const char* n[] = {"", "Death in the family", "House fire", "Injured", "Sick", "Burned out", "New baby", "Getting married"};
    return (e >= 0 && e < LE_Count) ? n[e] : "";
}

Employee StaffRoster::fromPerson(int personId, float privateRating01) {
    const Person* p = findPerson(personId);
    Employee a;
    if (!p) return a;
    a.personId = p->id;
    a.id = 100000 + p->id;   // applicant id (a real id is assigned on hire)
    a.name = p->name;
    a.role = p->role;
    const RoleInfo& ri = roleInfo(a.role);
    a.skill = p->skill;
    a.hourlyWage = std::round(ri.marketWage * p->wageAsk * 4.0f) / 4.0f;
    a.hoursPerWeek = ri.hoursPerWeek;
    a.morale = 0.65f + privateRating01 * 0.25f;
    Rng r(uint64_t(p->id) * 131u + 7u);
    randomPersonalLife(a, r);
    return a;
}

void StaffRoster::refreshApplicants(Rng& rng, float privateRating01, int day) {
    (void)rng;
    applicants.clear();
    for (const Person& p : peopleRoster()) {
        bool employed = false;
        for (const Employee& e : employees) employed |= e.personId == p.id;
        if (employed || deceased[size_t(p.id)] || awayUntil[size_t(p.id)] > day) continue;
        applicants.push_back(fromPerson(p.id, privateRating01));
    }
}

bool StaffRoster::hire(int applicantId) {
    for (size_t i = 0; i < applicants.size(); ++i)
        if (applicants[i].id == applicantId) {
            Employee e = applicants[i];
            e.id = nextId++;
            employees.push_back(e);
            applicants.erase(applicants.begin() + long(i));
            return true;
        }
    return false;
}

bool StaffRoster::fire(int employeeId, int day) {
    for (size_t i = 0; i < employees.size(); ++i)
        if (employees[i].id == employeeId) {
            if (employees[i].personId > 0) awayUntil[size_t(employees[i].personId)] = day + 45;
            employees.erase(employees.begin() + long(i));
            return true;
        }
    return false;
}

void StaffRoster::leave(int employeeId, int day, bool died) {
    for (size_t i = 0; i < employees.size(); ++i)
        if (employees[i].id == employeeId) {
            int pid = employees[i].personId;
            if (pid > 0) { if (died) deceased[size_t(pid)] = true; else awayUntil[size_t(pid)] = day + 45; }
            employees.erase(employees.begin() + long(i));
            return;
        }
}

Employee* StaffRoster::find(int id) {
    for (auto& e : employees) if (e.id == id) return &e;
    return nullptr;
}

}  // namespace ps
