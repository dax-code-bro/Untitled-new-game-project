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

// What someone does at work. Auto = what their role suggests.
enum class Job : uint8_t { Auto, FrontDesk, Rounds, Clinic, Roam, Count };
const char* jobName(Job j);
const char* jobDescription(Job j);

struct Employee {
    int id = 0;
    int personId = 0;       // which of the 40 recruitable people this is
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
    Job job = Job::Auto;        // assigned in the Staff tab
    bool calledToOffice = false;// you asked them to come see you
    int leftDay = -1;           // day they went home (they don't come back until tomorrow)
    int checksToday = 0, treatedToday = 0, clientsToday = 0;   // what they got done today
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
    // The recruit pool: every one of the 40 people who isn't on your team, away, or dead.
    void refreshApplicants(Rng& rng, float privateRating01, int day = 0);
    bool hire(int applicantId);
    bool fire(int employeeId, int day = 0);          // they come back to the pool after 45 days
    void leave(int employeeId, int day, bool died);   // quit / died
    std::vector<int> awayUntil = std::vector<int>(64, -1);   // by person id
    std::vector<bool> deceased = std::vector<bool>(64, false);
    static Employee fromPerson(int personId, float privateRating01);
    Employee* find(int id);
};

std::string randomPersonName(Rng& rng);
void randomPersonalLife(Employee& e, Rng& rng);

enum LifeEvent : int { LE_None, LE_FamilyDeath, LE_HouseFire, LE_Injury, LE_Illness, LE_Burnout, LE_NewBaby, LE_Wedding, LE_Count };
const char* lifeEventName(int e);

}  // namespace ps
