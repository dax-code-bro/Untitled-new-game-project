#include "game/Ratings.h"
#include "core/Math.h"
#include <cmath>

namespace ps {

static float diminishing(float x, float scale) { return 1.0f - std::exp(-std::max(0.0f, x) / scale); }

void Ratings::dailyUpdate(const RatingInputs& in) {
    // ---------------- Public rating ----------------
    publicFactors.clear();
    auto pub = [&](const char* n, float v) { publicFactors.push_back({n, v}); };
    pub("Baseline", 35.0f);
    pub("Marketing", 18.0f * diminishing(in.marketingMonthly, 1500.0f));
    float clean = 0.6f * diminishing(in.maintenanceMonthly, 900.0f) + 0.4f * diminishing(float(in.janitors), 1.2f);
    pub("Cleanliness", -6.0f + 16.0f * clean);
    pub("Front desk service", in.receptionists > 0 ? 6.0f : -3.0f);
    if (in.animals > 0) {
        float perAnimal = (in.animalCareMonthly + in.medicalMonthly) / float(in.animals);
        pub("Animal welfare", -10.0f + 22.0f * diminishing(perAnimal, 120.0f));
        pub("Caretaker coverage", in.caretakers * 12 >= in.animals ? 4.0f : -6.0f);
    }
    pub("Facility appeal", 12.0f * diminishing(in.facilityAppeal, 40.0f));
    if (in.gateBlockingVisitors) pub("Gate closed during open hours", -8.0f);
    if (in.visitorsTurnedAway > 0)
        pub("Visitors turned away (full)", -std::min(10.0f, 0.15f * float(in.visitorsTurnedAway)));
    if (in.incidentsRecent > 0) pub("Security incidents", -3.0f * float(in.incidentsRecent));
    pub("Security presence", 4.0f * diminishing(in.securityMonthly, 800.0f));

    float pt = 0;
    for (auto& f : publicFactors) pt += f.value;
    pubTarget_ = clampf(pt, 0.0f, 100.0f);

    // ---------------- Private rating ----------------
    privateFactors.clear();
    auto prv = [&](const char* n, float v) { privateFactors.push_back({n, v}); };
    prv("Baseline", 45.0f);
    if (in.staffCount > 0) {
        prv("Pay vs. market", clampf((in.wageFairness - 1.0f) * 60.0f, -20.0f, 15.0f));
        prv("Staff morale", (in.staffMorale - 0.6f) * 30.0f);
        prv("Bonuses", 8.0f * diminishing(in.bonusBudgetPerStaff, 150.0f));
    } else {
        prv("Running it alone", -4.0f);
    }
    if (in.missedPayrollsRecent > 0) prv("Missed paychecks", -14.0f * float(in.missedPayrollsRecent));
    if (in.taxesOverdue) prv("Behind on taxes", -10.0f);
    if (in.animals > 0) {
        float perAnimal = (in.animalCareMonthly + in.medicalMonthly) / float(in.animals);
        prv("How you treat the animals", -12.0f + 24.0f * diminishing(perAnimal, 120.0f));
    }
    prv("Community goodwill", 10.0f * diminishing(float(in.visitorsServed), 60.0f));
    if (in.incidentsRecent > 0) prv("Neighborhood safety", -2.0f * float(in.incidentsRecent));

    float qt = 0;
    for (auto& f : privateFactors) qt += f.value;
    privTarget_ = clampf(qt, 0.0f, 100.0f);

    // Reputations move slowly: 4% of the gap per day for public, 3% for private.
    publicRating = clampf(publicRating + (pubTarget_ - publicRating) * 0.04f, 0.0f, 100.0f);
    privateRating = clampf(privateRating + (privTarget_ - privateRating) * 0.03f, 0.0f, 100.0f);
    publicHistory.push_back(publicRating);
    privateHistory.push_back(privateRating);
    if (publicHistory.size() > 365) publicHistory.erase(publicHistory.begin());
    if (privateHistory.size() > 365) privateHistory.erase(privateHistory.begin());
}

void Ratings::shock(float publicDelta, float privateDelta) {
    publicRating = clampf(publicRating + publicDelta, 0.0f, 100.0f);
    privateRating = clampf(privateRating + privateDelta, 0.0f, 100.0f);
}

const char* Ratings::publicLabel(float r) {
    if (r >= 85) return "Beloved - people line up at the gate";
    if (r >= 70) return "Popular - expect crowds, plan to expand";
    if (r >= 55) return "Well liked";
    if (r >= 40) return "Mixed reviews";
    if (r >= 25) return "Poor reputation - few visitors";
    return "Avoided - nobody will adopt from you";
}

const char* Ratings::privateLabel(float r) {
    if (r >= 85) return "Deeply respected";
    if (r >= 70) return "Trusted and liked";
    if (r >= 55) return "Decent reputation";
    if (r >= 40) return "People have doubts";
    if (r >= 25) return "Talked about behind your back";
    return "Resented";
}

float Ratings::demandMultiplier(float r) {
    float x = clampf(r, 0.0f, 100.0f) / 50.0f;
    return std::max(0.05f, x * x);
}

}  // namespace ps
