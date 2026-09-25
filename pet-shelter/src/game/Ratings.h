// Private rating: what the people around you privately think of you
//   (staff, neighbors, local community). Affects staff morale, quitting
//   and the quality of applicants.
// Public rating: what the public thinks. It "really matters": it drives
//   visitors, adoption demand and donations. Bad = nobody comes; good =
//   you're packed and need to expand fast.
#pragma once
#include <string>
#include <vector>

namespace ps {

struct RatingFactor {
    std::string name;
    float value;      // contribution in rating points (+/-)
};

struct RatingInputs {
    // money / management
    float wageFairness = 1.0f;         // avg wage / market wage
    int missedPayrollsRecent = 0;
    bool taxesOverdue = false;
    float bonusBudgetPerStaff = 0.0f;  // $/month per employee
    float staffMorale = 0.7f;
    int staffCount = 0;
    // public-facing
    float marketingMonthly = 0.0f;
    float maintenanceMonthly = 0.0f;
    float securityMonthly = 0.0f;
    float animalCareMonthly = 0.0f;
    float medicalMonthly = 0.0f;
    int animals = 0;
    int receptionists = 0, janitors = 0, caretakers = 0, vets = 0;
    float facilityAppeal = 0.0f;       // from decorations/buildings
    int visitorsTurnedAway = 0;        // yesterday
    int visitorsServed = 0;            // yesterday
    bool gateBlockingVisitors = false; // gate shut during opening hours
    int incidentsRecent = 0;           // break-ins / vandalism in last 30 days
    // staff wellbeing (private)
    float staffFatigue = 0.2f, staffStress = 0.2f;
    int overworkedStaff = 0, interviewsOverdue = 0;
    bool protectiveGear = false;
    // how the public sees you
    int animalDeathsRecent = 0, scandalsRecent = 0, clientsMistreated = 0, clientsHelped = 0, violatorsTolerated = 0;
    bool protestActive = false;
};

class Ratings {
public:
    float publicRating = 48.0f;    // 0..100
    float privateRating = 55.0f;   // 0..100
    std::vector<RatingFactor> publicFactors, privateFactors;
    std::vector<float> publicHistory, privateHistory;

    // Called once per game day. Ratings drift toward their targets.
    void dailyUpdate(const RatingInputs& in);
    void shock(float publicDelta, float privateDelta);

    static float stars(float rating) { return rating / 20.0f; }  // 0..5
    static const char* publicLabel(float r);
    static const char* privateLabel(float r);
    // Visitor demand multiplier from public rating (0.05 at 0, 1 at 50, ~4 at 100)
    static float demandMultiplier(float publicRating);

    float publicTarget() const { return pubTarget_; }
    float privateTarget() const { return privTarget_; }

private:
    float pubTarget_ = 50.0f, privTarget_ = 55.0f;
};

}  // namespace ps
