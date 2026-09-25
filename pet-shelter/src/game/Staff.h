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
    // Wellbeing: rest, workload and the person behind the job
    float fatigue = 0.15f;      // 0 rested .. 1 exhausted
    float stress = 0.2f;        // 0 calm .. 1 breaking point
    float relationship = 0.35f; // how well they know and trust you
    int daysOffPerWeek = 2;     // schedule set in the Staff tab
    int daysSinceOff = 0;
    int vacationUntil = -1;     // day index; on paid vacation until then
    int vacationDaysUsed = 0;   // this year
    int lastInterviewDay = -999;
    int lifeEvent = 0;          // LifeEvent id while it still weighs on them (0 = none)
    int lifeEventDay = -1;
    bool lifeEventSupported = false;
    bool gearIssued = false;    // protective gear (feral/restricted handling)
    std::string family;         // spouse/kids/pets - shared with a boss they trust
    std::string hobby;
    bool onVacation(int day) const { return vacationUntil > day; }
    bool overworked() const { return hoursPerWeek > 45.0f || daysOffPerWeek < 1; }
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
void randomPersonalLife(Employee& e, Rng& rng);

enum LifeEvent : int { LE_None, LE_FamilyDeath, LE_HouseFire, LE_Injury, LE_Illness, LE_Burnout, LE_NewBaby, LE_Wedding, LE_Count };
const char* lifeEventName(int e);

}  // namespace ps
