// Shelter animals and the decisions the player has to make about animals,
// staff and the public. Pure simulation data (no graphics).
#pragma once
#include "core/Noise.h"
#include "game/Buildables.h"
#include "game/Species.h"
#include <string>
#include <vector>

namespace ps {

enum class AnimalStatus : uint8_t { Healthy, Sick, Injured, Critical, Recovering, Dead, Adopted, Released, Transferred };
const char* statusName(AnimalStatus s);

struct Animal {
    int id = 0;
    int species = 0;
    std::string name;
    bool male = true;
    float ageYears = 2.0f;
    int coat = 0;
    uint32_t seed = 1;
    float weightFactor = 1.0f;
    // Wellbeing (0..1)
    float health = 1.0f, hunger = 0.1f, stress = 0.3f, happiness = 0.6f, cleanliness = 1.0f;
    AnimalStatus status = AnimalStatus::Healthy;
    std::string condition;          // "Bite wounds", "Hit by a car", "Parvovirus"...
    float bleeding = 0.0f;          // 0..1 (drives the wound shader)
    bool needsSurgery = false;
    bool vaccinated = false, fixed = false, microchipped = false;
    int housing = -1;               // placed building id (-1 = medical room)
    int arrivedDay = 0;
    std::string origin;             // "Stray", "Owner surrender", "Animal control"...
    // Client-owned patients (appointments / boarding)
    bool owned = false;
    std::string ownerName;
    bool ownerConsented = false;
    // Derived
    float weightKg(const Species& sp) const;
    float ageFraction(const Species& sp) const;   // 0 newborn .. 1 adult
    bool isBaby(const Species& sp) const { return ageFraction(sp) < 0.35f; }
    bool alive() const { return status != AnimalStatus::Dead; }
    bool inCare() const {
        return status != AnimalStatus::Dead && status != AnimalStatus::Adopted && status != AnimalStatus::Released &&
               status != AnimalStatus::Transferred;
    }
};

// Where each species lives
BuildKind housingFor(const Species& sp);
std::string randomAnimalName(Rng& rng, bool male);

// ---------------------------------------------------------------------------
// Decisions: anything the player must answer (pop-up cards in the game).
enum class DecisionKind : uint8_t {
    FeralIntake,        // animal control brings a wild animal
    RestrictedLoose,    // a dangerous animal is loose on the property
    StaffLifeEvent,     // family death, house fire, injury, illness, burnout...
    StaffDayOff,        // an employee asks for time off
    StaffInterview,     // one-on-one check-in
    ClientVisit,        // an owner brings their pet in
    SurgeryConsent,     // an owned animal needs surgery
    RuleViolator,       // smoking / drinking / drugs on the property
    Protest,            // protesters at the gate
    InterviewRequest,   // online news interview
    InterviewQuestion,  // one question of the interview
    ReleaseFeral,       // a recovered wild animal can go home
    Count
};

struct Decision {
    int id = 0;
    DecisionKind kind = DecisionKind::FeralIntake;
    std::string title, text;
    std::vector<std::string> choices;
    int a = -1, b = -1, c = -1;     // parameters (employee id, animal id, species, sub-type...)
    double expires = 0.0;           // game minutes; 0 = never
    int timeoutChoice = -1;         // what happens if ignored (-1 = the last choice)
    bool urgent = false;            // pauses time / shows immediately
};

// A dangerous animal loose on the property
struct Incident {
    bool active = false;
    int species = -1;
    vec3 pos{0, 0, 0};
    double startMinutes = 0.0;
    bool policeCalled = false, areaCleared = false, playerCalm = true;
    double policeArrive = 0.0;
    int injured = 0, killed = 0;
};

// Protesters at the gate
struct Protest {
    bool active = false;
    int size = 0;
    float anger = 0.3f;             // 0..1: at 1 it turns violent
    std::string cause;
    int startDay = 0;
    bool talkedTo = false;
};

// One-on-one staff wellbeing extras live on Employee (Staff.h).
// Surgery state for the operating table (game UI drives it; sim resolves it)
struct Surgery {
    bool active = false;
    int animal = -1;
    std::string procedure;
    float doseMgPerKg = 0.0f;       // anesthetic dose chosen
    float idealMgPerKg = 0.0f;
    float depth = 0.0f;             // anesthesia depth 0 awake .. 1 deep
    float bloodLoss = 0.0f;         // 0..1 of safe limit
    float progress = 0.0f;          // 0..1
    float heartRate = 90.0f, oxygen = 0.98f;
    int step = 0;                   // 0 consent, 1 anesthesia, 2 incision, 3 repair, 4 suture, 5 done
    bool bleedersClamped = false;
    bool woke = false, died = false;
};

}  // namespace ps
