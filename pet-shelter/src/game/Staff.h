// Staff roster and hiring. Wages feed payroll (Economy) and morale feeds
// the private rating.
#pragma once
#include "core/Noise.h"
#include <string>
#include <vector>

namespace ps {

enum class Role { Caretaker, Veterinarian, VetTech, Receptionist, Janitor, SecurityGuard, Manager, Count };

struct RoleInfo {
    const char* name;
    float marketWage;      // $/hour considered "fair" in the area
    float hoursPerWeek;
    const char* description;
};
const RoleInfo& roleInfo(Role r);

struct Employee {
    int id = 0;
    std::string name;
    Role role = Role::Caretaker;
    float hourlyWage = 15.0f;
    float hoursPerWeek = 40.0f;
    float skill = 0.5f;     // 0..1
    float morale = 0.7f;    // 0..1
    int daysEmployed = 0;
    int missedPaychecks = 0;
    double weeklyGross() const { return double(hourlyWage) * hoursPerWeek; }
};

struct StaffRoster {
    std::vector<Employee> employees;
    std::vector<Employee> applicants;   // current hiring pool
    int nextId = 1;

    int count(Role r) const;
    double weeklyGross() const;
    float averageMorale() const;
    float wageFairness() const;        // avg(wage/market), 1 = market rate
    void refreshApplicants(Rng& rng, float privateRating01, int n = 6);
    bool hire(int applicantId);
    bool fire(int employeeId);
    Employee* find(int id);
};

std::string randomPersonName(Rng& rng);

}  // namespace ps
