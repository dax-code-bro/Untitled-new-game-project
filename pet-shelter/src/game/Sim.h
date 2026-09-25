// The whole management simulation: clock, money, staff, ratings, security
// and everything built in creative mode. No graphics code in here.
#pragma once
#include "core/Noise.h"
#include "game/Buildables.h"
#include "game/Economy.h"
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

class Sim {
public:
    GameClock clock;
    Economy econ;
    StaffRoster staff;
    Ratings ratings;
    SecuritySystem security;
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
    const Placed* findPlaced(int id) const;

    void log(const std::string& text);
    void save(KeyValues& kv) const;
    void load(const KeyValues& kv);

private:
    void onHour(int hourIndex);
    void onEndOfDay();
    void payWeeklyPayroll();
    void monthly();
    void quarterly();
    RatingInputs ratingInputs() const;
};

}  // namespace ps
