#include "game/Staff.h"
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

void StaffRoster::refreshApplicants(Rng& rng, float privateRating01, int n) {
    applicants.clear();
    for (int i = 0; i < n; ++i) {
        Employee a;
        a.id = nextId++;
        a.name = randomPersonName(rng);
        a.role = Role(rng.irange(0, int(Role::Count) - 1));
        const RoleInfo& ri = roleInfo(a.role);
        // A better private reputation attracts better people.
        a.skill = clampf(rng.range(0.2f, 0.75f) + privateRating01 * 0.3f, 0.05f, 1.0f);
        a.hourlyWage = std::round(ri.marketWage * (0.85f + a.skill * 0.35f) * 4.0f) / 4.0f;
        a.hoursPerWeek = ri.hoursPerWeek;
        a.morale = 0.65f + privateRating01 * 0.25f;
        applicants.push_back(a);
    }
}

bool StaffRoster::hire(int applicantId) {
    for (size_t i = 0; i < applicants.size(); ++i)
        if (applicants[i].id == applicantId) {
            employees.push_back(applicants[i]);
            applicants.erase(applicants.begin() + long(i));
            return true;
        }
    return false;
}

bool StaffRoster::fire(int employeeId) {
    for (size_t i = 0; i < employees.size(); ++i)
        if (employees[i].id == employeeId) {
            employees.erase(employees.begin() + long(i));
            return true;
        }
    return false;
}

Employee* StaffRoster::find(int id) {
    for (auto& e : employees) if (e.id == id) return &e;
    return nullptr;
}

}  // namespace ps
