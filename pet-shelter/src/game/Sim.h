// The whole management simulation: clock, money, staff, ratings, security
// and everything built in creative mode. No graphics code in here.
#pragma once
#include "core/Noise.h"
#include "game/Animals.h"
#include "game/Buildables.h"
#include "game/Economy.h"
#include "game/Land.h"
#include "game/Ratings.h"
#include "game/Security.h"
#include "game/Staff.h"
#include <cmath>
#include <deque>
#include <string>

namespace ps {

class KeyValues;

struct GameClock {
    double minutes = 8.0 * 60.0;   // day 0 starts at 8:00 AM
    int day() const { return int(minutes / 1440.0); }
    float hour() const { return float(std::fmod(minutes, 1440.0) / 60.0); }
    int dayOfWeek() const { return day() % 7; }  // 0 = Monday
    std::string timeString() const;               // "8:05 AM"
    std::string dateString() const;               // "Mon, Day 3"
};

struct GameEvent { int day; std::string text; };

// Pet store (2 miles east on the highway): today's animals for sale
struct StoreAnimal {
    int id = 0;          // stable while it's in the store
    int pen = -1;        // 0-2 dog pens, 3-4 cat condos, 5-6 bird cages, 7-8 terrariums
    int species = 0;
    bool male = true;
    float ageFrac = 0.3f;
    int coat = 0;
    float price = 100.0f;
    std::string name;
};

class Sim {
public:
    GameClock clock;
    Economy econ;
    StaffRoster staff;
    Ratings ratings;
    SecuritySystem security;
    Land land;
    std::vector<Placed> placed;
    int nextPlacedId = 1;
    int animals = 0;               // animals arrive in the next update
    Rng rng{20260925};

    // Visitor stats
    int visitorsToday = 0, turnedAwayToday = 0;
    int visitorsYesterday = 0, turnedAwayYesterday = 0;
    long long visitorsTotal = 0;
    double donationsToday = 0.0;

    std::deque<GameEvent> events;
    int eventsSeen = 0;            // UI toasts: events beyond this index are new

    // ---- Animals ----
    std::vector<Animal> animalList;
    int nextAnimalId = 1;
    bool protectiveGear = false;   // unlock: staff can handle feral/restricted animals safely
    Incident incident;             // dangerous animal loose
    Surgery surgery;               // operating table
    Exam exam;                     // clinic check-up / scan
    float food[size_t(FoodKind::Count)] = {};   // supplies on hand (kg)
    float foodOrdered[size_t(FoodKind::Count)] = {};   // arrives next morning
    std::vector<int> deathDays;    // animal deaths in the last 30 days
    int adoptionsTotal = 0, deathsTotal = 0, intakeTotal = 0;

    // ---- People ----
    std::vector<Decision> decisions;
    int nextDecisionId = 1;
    Protest protest;
    std::vector<int> scandalDays;           // consent violations, cruelty, cover-ups
    int clientsMistreatedRecent = 0, clientsHelpedRecent = 0, violatorsTolerated = 0;
    int interviewStep = -1;                 // online interview in progress (question index)
    float interviewScore = 0.0f;
    std::string interviewTopic;
    std::deque<std::string> greetings;      // staff greeting the owner (shown as toasts)
    std::string ownerName = "Boss";         // the player's name (staff use it when they like you)
    float timeSinceHourMin = 0.0f;

    // ---- Driving & the pet store ----
    std::vector<StoreAnimal> petStore;     // restocked every morning
    std::vector<StoreAnimal> truckCargo;   // animals riding home in your truck
    int nextStoreId = 1;
    int ticketsTotal = 0;
    double finesTotal = 0.0;
    void restockPetStore();
    bool buyFromPetStore(size_t index, std::string* why = nullptr);
    bool buyStoreFood(FoodKind f, float kg);          // carried home right away (store prices)
    int deliverCargo();                               // unload the truck at the shelter
    void ticket(const std::string& reason, double fine);

    void newGame();
    // Advance the simulation by `gameMinutes`.
    void advance(double gameMinutes);

    int visitorCapacityPerDay() const;
    float facilityAppeal() const;
    int placedCount(BuildKind k) const;
    double weeklyPayroll() const { return staff.weeklyGross(); }
    float financialScore() const { return econ.financialScore(weeklyPayroll()); }

    // Creative mode
    bool build(BuildKind k, float x, float z, int rot, std::string* why, int* outId = nullptr);
    bool demolish(int placedId);      // refunds 40%

    // ---- Opening the shelter and the staff's workday (SimStaffWork.cpp) ----
    bool shelterOpen = false;                  // you flip the front-door sign; visitors only come while it's OPEN
    void openShelter();
    void closeShelter();                       // staff head home
    Job jobOf(const Employee& e) const;        // Auto resolves to the role's usual job
    bool worksToday(const Employee& e) const;  // not a day off, not on vacation
    float arriveHour(const Employee& e) const; // they come in early, before you open
    bool staffOnSite(const Employee& e) const; // at work right now
    int officeSlot(int employeeId) const;      // desk index (0 front desk, 1 clinic, 2 appointment room, 3+ staff buildings), -1 none
    bool staffCheckAnimal(int employeeId, int animalId);   // a caretaker's rounds
    bool staffTreat(int employeeId, int animalId);         // a vet's check-up / surgery
    int animalNeedingVet() const;              // the next animal a vet should see (-1 none)
    void staffWorkHourly(int hour);
    // The fence hugs the shelter: its yard grows to enclose whatever you build (not trees or paths)
    void refreshYard();
    const Placed* findPlaced(int id) const;

    void log(const std::string& text);
    bool buyLand(int col, int row, std::string* why = nullptr);
    int officeCapacity() const;   // every worker needs their own office
    bool hire(int applicantId, std::string* why = nullptr);

    // Animals
    Animal* findAnimal(int id);
    const Animal* findAnimal(int id) const;
    int animalsInCare() const;
    int housingCapacity(BuildKind k) const;
    int housingUsed(BuildKind k) const;
    int housingBuildingFor(BuildKind k) const;            // a building with a free spot, or -1
    bool hasSurgeryWing() const { return placedCount(BuildKind::SurgeryWing) > 0; }
    bool canHandleFeral() const { return protectiveGear && hasSurgeryWing(); }
    bool buyProtectiveGear();                             // $4,500 unlock
    static constexpr double kGearCost = 4500.0;
    Animal& admit(int species, const std::string& origin, float ageFrac = -1.0f, bool owned = false);
    void animalDied(Animal& a, const std::string& cause, bool neglect);
    bool adopt(int animalId);                             // adopt out now (fee)
    bool treat(int animalId);                             // routine treatment by staff vet (not surgery)

    // Daily care
    std::vector<std::string> checkAnimal(int animalId);   // you check on it in person; returns what you notice
    bool handFeed(int animalId);                          // from supplies, favorite food first
    void giveWater(int animalId);
    int uncheckedToday() const;
    bool orderFood(FoodKind f, float kg);                 // Store: delivered tomorrow at 8 AM
    // Clinic check-ups
    bool startExam(int animalId, std::string* why);
    bool examReady() const { return exam.active && clock.minutes >= exam.readyAt; }
    bool answerExam(Hidden guess);                        // true = you read it right
    double examCost(const Animal& a) const;
    // Hands-on surgery
    void surgeryCutTo(vec2 from, vec2 to);                // drag the scalpel
    bool surgeryClampAt(vec2 p);
    bool surgeryTreatTargetAt(vec2 p);
    bool surgeryStitchAt(vec2 p);

    // Surgery (operating table in the medical room / surgery wing)
    bool beginSurgery(int animalId, std::string* why);
    float idealDose(const Animal& a) const;               // mg/kg for this species
    void surgeryAnesthetize(float mgPerKg);
    void surgeryIncise();
    void surgeryClamp();
    void surgeryRepair();
    void surgerySuture();
    void surgeryTick(float realSeconds);                  // vitals drift while the table is active
    void surgeryAbort();

    // Restricted animal incident
    void startIncident(int species);
    void incidentCallPolice();
    void incidentClearArea();
    void incidentPanic();                                 // player ran/shouted/approached
    void incidentApproach();

    void scandal(float publicHit, const std::string& why);   // may start a protest + interview request
    // Decisions
    Decision& addDecision(DecisionKind k, const std::string& title, const std::string& text, std::vector<std::string> choices,
                          double expiresInMinutes = 0.0, bool urgent = false);
    const Decision* findDecision(int id) const;
    void resolve(int decisionId, int choice);

    // Staff care
    void staffGiveDayOff(int employeeId);
    bool staffSendOnVacation(int employeeId, int days, bool paidByYou);
    bool staffGift(int employeeId, double amount, const std::string& why);
    void staffInterview(int employeeId);
    void staffSetDaysOff(int employeeId, int days);
    void staffIssueGear(int employeeId);

    void save(KeyValues& kv) const;
    void load(const KeyValues& kv);

private:
    void onHour(int hourIndex);
    void onEndOfDay();
    void payWeeklyPayroll();
    void monthly();
    void quarterly();
    RatingInputs ratingInputs() const;
    void animalsHourly(int hour);
    void careHourly(int hour);
    void careDaily();
    void buildSurgeryField(const Animal& a);
    void animalsDaily();
    void peopleHourly(int hour);
    void peopleDaily();
    void incidentUpdate();
    void expireDecisions();
    void startInterview(const std::string& topic);
    void nextInterviewQuestion();
    void surgeryFinish();
};

}  // namespace ps
