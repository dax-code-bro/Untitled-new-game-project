// People: staff wellbeing and life events, clients, rule breakers, protests,
// the online interview and every decision card the player answers.
#include "game/Sim.h"
#include <algorithm>
#include <cmath>
#include <cstdio>

namespace ps {

namespace {
std::string money(double v) {
    char b[32];
    std::snprintf(b, sizeof b, "$%.0f", v);
    return b;
}
}  // namespace

Decision& Sim::addDecision(DecisionKind k, const std::string& title, const std::string& text, std::vector<std::string> choices,
                           double expiresIn, bool urgent) {
    Decision d;
    d.id = nextDecisionId++;
    d.kind = k;
    d.title = title;
    d.text = text;
    d.choices = std::move(choices);
    d.expires = expiresIn > 0.0 ? clock.minutes + expiresIn : 0.0;
    d.urgent = urgent;
    decisions.push_back(d);
    return decisions.back();
}

const Decision* Sim::findDecision(int id) const {
    for (auto& d : decisions) if (d.id == id) return &d;
    return nullptr;
}

void Sim::expireDecisions() {
    for (size_t i = 0; i < decisions.size();) {
        const Decision& d = decisions[i];
        if (d.expires > 0.0 && clock.minutes >= d.expires) {
            int c = d.timeoutChoice >= 0 ? d.timeoutChoice : int(d.choices.size()) - 1;
            int id = d.id;
            if (d.kind == DecisionKind::ClientVisit) { clientsMistreatedRecent++; ratings.shock(-1.5f, 0.0f); log("A client waited too long and left angry."); }
            resolve(id, c);
            continue;   // resolve erased it
        }
        ++i;
    }
}

void Sim::scandal(float publicHit, const std::string& why) {
    if (publicHit > 0.0f) ratings.shock(-publicHit, -publicHit * 0.2f);
    scandalDays.push_back(clock.day());
    while (!scandalDays.empty() && scandalDays.front() < clock.day() - 30) scandalDays.erase(scandalDays.begin());
    if (!protest.active && (scandalDays.size() >= 2 || publicHit >= 8.0f || ratings.publicRating < 30.0f)) {
        protest = Protest();
        protest.active = true;
        protest.size = 6 + int(rng.next() % 15);
        protest.anger = 0.35f + std::min(0.4f, publicHit * 0.03f);
        protest.cause = why;
        protest.startDay = clock.day();
        addDecision(DecisionKind::Protest, "Protesters at the gate",
                    std::to_string(protest.size) + " people are protesting at your gate with signs about \"" + why +
                        "\". Local news is filming. How do you respond?",
                    {"Go out and talk with them respectfully", "Ignore them", "Call the police to clear the gate", "Confront them angrily"},
                    240.0);
        log("PROTEST: " + std::to_string(protest.size) + " protesters gathered at the gate (" + why + ").");
        addDecision(DecisionKind::InterviewRequest, "Interview request",
                    "An online news site wants a live video interview with you about \"" + why +
                        "\". Declining will look like you're hiding something.",
                    {"Accept the interview", "Decline"}, 1440.0)
            .timeoutChoice = 1;
        interviewTopic = why;
    }
}

// ---------------------------------------------------------------------------
// Staff care actions (Staff tab)
void Sim::staffGiveDayOff(int id) {
    Employee* e = staff.find(id);
    if (!e || e->onVacation(clock.day())) return;
    e->vacationUntil = clock.day() + 1;
    e->fatigue = std::max(0.0f, e->fatigue - 0.3f);
    e->stress = std::max(0.0f, e->stress - 0.15f);
    e->relationship = std::min(1.0f, e->relationship + 0.03f);
    e->daysSinceOff = 0;
    log(e->name + " has tomorrow off.");
}

bool Sim::staffSendOnVacation(int id, int days, bool paidByYou) {
    Employee* e = staff.find(id);
    if (!e) return false;
    double cost = paidByYou ? 1500.0 : 0.0;
    if (cost > 0.0 && !econ.tryPay(clock.day(), Ledger::StaffBonuses, cost, "Paid vacation trip: " + e->name)) return false;
    e->vacationUntil = clock.day() + days;
    e->vacationDaysUsed += days;
    e->fatigue = 0.0f;
    e->stress = std::max(0.0f, e->stress - (paidByYou ? 0.7f : 0.4f));
    e->morale = std::min(1.0f, e->morale + (paidByYou ? 0.3f : 0.12f));
    e->relationship = std::min(1.0f, e->relationship + (paidByYou ? 0.25f : 0.08f));
    if (paidByYou) ratings.shock(0.0f, 2.5f);
    log(e->name + " is on vacation for " + std::to_string(days) + " days" + (paidByYou ? " - on you. They were speechless." : "."));
    return true;
}

bool Sim::staffGift(int id, double amount, const std::string& why) {
    Employee* e = staff.find(id);
    if (!e) return false;
    if (!econ.tryPay(clock.day(), Ledger::StaffBonuses, amount, why + ": " + e->name)) return false;
    float k = float(std::min(1.0, amount / 1000.0));
    e->morale = std::min(1.0f, e->morale + 0.1f + 0.2f * k);
    e->stress = std::max(0.0f, e->stress - 0.1f - 0.2f * k);
    e->relationship = std::min(1.0f, e->relationship + 0.05f + 0.15f * k);
    ratings.shock(0.0f, 0.5f + 2.0f * k);
    return true;
}

void Sim::staffSetDaysOff(int id, int days) {
    Employee* e = staff.find(id);
    if (e) e->daysOffPerWeek = std::clamp(days, 0, 4);
}

void Sim::staffIssueGear(int id) {
    Employee* e = staff.find(id);
    if (e && protectiveGear) e->gearIssued = true;
}

void Sim::staffInterview(int id) {
    Employee* e = staff.find(id);
    if (!e) return;
    e->lastInterviewDay = clock.day();
    std::string state;
    if (e->lifeEvent != LE_None) state += std::string("They're dealing with something at home: ") + lifeEventName(e->lifeEvent) + ". ";
    if (e->fatigue > 0.65f) state += "They look exhausted - \"I can't remember my last full day off.\" ";
    if (e->stress > 0.65f) state += "They admit they're overwhelmed and not sleeping. ";
    if (e->hourlyWage < roleInfo(e->role).marketWage * 0.95f)
        state += "They mention a friend makes " + money(roleInfo(e->role).marketWage) + "/hr doing the same job elsewhere. ";
    if (e->morale > 0.75f && e->fatigue < 0.5f) state += "They're in good spirits and love working with the animals. ";
    if (e->relationship > 0.6f) state += "They open up: they're " + e->family + ", and " + e->hobby + ". ";
    if (state.empty()) state = "They say things are fine, but they're guarded. They don't know you well yet. ";
    addDecision(DecisionKind::StaffInterview, "One-on-one with " + e->name, state,
                {"Listen, and ask how you can help", "Give them a raise (+8%)", "Keep it short - back to work"}, 60.0)
        .a = id;
}

// ---------------------------------------------------------------------------
// Online interview: three questions; honest and caring answers pass.
void Sim::startInterview(const std::string& topic) {
    interviewStep = 0;
    interviewScore = 0.0f;
    interviewTopic = topic;
    nextInterviewQuestion();
}

void Sim::nextInterviewQuestion() {
    struct Q { const char* q; const char* good; const char* meh; const char* bad; };
    static const Q qs[] = {
        {"\"People are saying animals are suffering at your shelter. What's really going on?\"",
         "Be honest: explain what went wrong and what you've changed", "Say every shelter has problems", "\"That's none of your business.\""},
        {"\"Did your staff do anything wrong - and are they treated fairly?\"",
         "Take responsibility yourself and describe how you support your staff", "Say you're looking into it", "Blame an employee by name"},
        {"\"Why should this community trust you with its animals?\"",
         "Invite people to visit, see the animals and meet the team", "List your adoption numbers", "\"They can go somewhere else.\""},
        {"\"Will you commit to changes - more staff, better care, full transparency?\"",
         "Commit to specific changes and a date", "Say you'll think about it", "End the interview"},
    };
    if (interviewStep < 0 || interviewStep >= 3) return;
    const Q& q = qs[(size_t(interviewStep) + size_t(interviewTopic.size())) % 4];
    Decision& d = addDecision(DecisionKind::InterviewQuestion, "Live interview - question " + std::to_string(interviewStep + 1) + " of 3",
                              q.q, {q.good, q.meh, q.bad}, 30.0, true);
    d.c = interviewStep;
    d.timeoutChoice = 2;
}

// ---------------------------------------------------------------------------
void Sim::resolve(int decisionId, int choice) {
    auto it = std::find_if(decisions.begin(), decisions.end(), [&](const Decision& d) { return d.id == decisionId; });
    if (it == decisions.end()) return;
    Decision d = *it;
    decisions.erase(it);
    const int day = clock.day();
    const auto& cat = speciesCatalog();
    switch (d.kind) {
    case DecisionKind::FeralIntake: {
        const Species& sp = cat[size_t(d.a)];
        if (choice == 0) {
            Animal& a = admit(d.a, "Animal control", 1.0f);
            static const char* cond[] = {"Hit by a car (broken pelvis)", "Barbed-wire lacerations", "Gunshot wound",
                                         "Leg crushed in a trap", "Orphaned and starving"};
            a.condition = cond[std::clamp(d.b, 0, 4)];
            a.status = d.b == 4 ? AnimalStatus::Sick : AnimalStatus::Injured;
            a.bleeding = d.b == 4 ? 0.0f : rng.range(0.3f, 0.7f);
            a.health = rng.range(0.35f, 0.7f);
            a.needsSurgery = d.b != 4;
            if (d.b == 4) a.ageYears *= 0.2f;
            log("You took in " + a.name + " the injured " + sp.name + ".");
            ratings.shock(0.8f, 0.5f);
            if (!canHandleFeral())
                log(!hasSurgeryWing() ? "Without the Surgery Wing you can't operate on it - it may not survive."
                                      : "Without protective gear, your staff are at risk handling it.");
        } else {
            ratings.shock(-0.4f, 0.0f);
        }
        break;
    }
    case DecisionKind::RestrictedLoose:
        if (choice == 0) { incidentClearArea(); incidentCallPolice(); }
        else if (choice == 1) {
            incidentClearArea();
            addDecision(DecisionKind::RestrictedLoose, "Everyone's inside", "The area is clear. Now call the police?",
                        {"Call 911 now", "Wait and watch it", "Try to catch it yourself", "Run and shout"}, 20.0, true)
                .a = d.a;
            decisions.back().timeoutChoice = 1;
        } else if (choice == 2) incidentApproach();
        else if (choice == 3) {
            incidentPanic();
            log("You ran and shouted - people scattered in every direction and the animal got agitated.");
        }
        break;
    case DecisionKind::StaffLifeEvent: {
        Employee* e = staff.find(d.a);
        if (!e) break;
        int ev = d.b >= 0 ? d.b : e->lifeEvent;
        double cost = 0.0;
        int daysOff = 0;
        // 0 = most supportive ... last = coldest
        int n = int(d.choices.size());
        float support = n <= 1 ? 1.0f : 1.0f - float(choice) / float(n - 1);   // 1 .. 0
        switch (ev) {
        case LE_FamilyDeath: cost = choice == 0 ? e->hourlyWage * 8.0 * 3.0 + 80.0 : (choice == 2 ? 15.0 : 0.0); daysOff = choice <= 1 ? 3 : 0; break;
        case LE_HouseFire: cost = choice == 0 ? 2400.0 : (choice == 1 ? e->hourlyWage * 40.0 : 0.0); daysOff = choice <= 1 ? 5 : 0; break;
        case LE_Injury: cost = choice <= 1 ? 1900.0 : 0.0; daysOff = choice == 0 ? 3 : 0; break;
        case LE_Illness: cost = choice == 0 ? 600.0 + e->hourlyWage * 16.0 : (choice == 1 ? e->hourlyWage * 16.0 : 0.0); daysOff = choice <= 2 ? 2 : 0; break;
        case LE_Burnout:
            if (choice == 0) { staffSendOnVacation(e->id, 7, true); }
            else if (choice == 1) { e->vacationUntil = day + 2; e->fatigue = std::max(0.0f, e->fatigue - 0.4f); }
            else if (choice == 2) { e->lastInterviewDay = day; e->stress -= 0.1f; }
            break;
        case LE_NewBaby: cost = choice == 0 ? 300.0 + e->hourlyWage * 80.0 : (choice == 2 ? 20.0 : 0.0); daysOff = choice <= 1 ? 10 : 0; break;
        case LE_Wedding: cost = choice == 0 ? 250.0 : 0.0; daysOff = choice <= 1 ? 3 : 0; break;
        default: break;
        }
        if (cost > 0.0 && !econ.tryPay(day, Ledger::StaffBonuses, cost, std::string(lifeEventName(ev)) + ": " + e->name)) {
            log("You couldn't afford it. " + e->name + " noticed.");
            support *= 0.4f;
        }
        if (daysOff > 0) e->vacationUntil = std::max(e->vacationUntil, day + daysOff);
        e->relationship = clampf(e->relationship + (support - 0.4f) * 0.4f, 0.0f, 1.0f);
        e->stress = clampf(e->stress - (support - 0.2f) * 0.5f, 0.0f, 1.0f);
        e->morale = clampf(e->morale + (support - 0.45f) * 0.45f, 0.0f, 1.0f);
        e->lifeEventSupported = support >= 0.5f;
        ratings.shock(0.0f, (support - 0.45f) * 6.0f);
        if (support < 0.2f) {
            log(e->name + " won't forget how you handled that. The others heard about it too.");
            for (auto& o : staff.employees) if (o.id != e->id) o.morale = std::max(0.0f, o.morale - 0.04f);
        } else if (support > 0.8f) {
            log(e->name + " teared up. \"I didn't expect that from a boss. Thank you.\"");
        }
        break;
    }
    case DecisionKind::StaffDayOff: {
        Employee* e = staff.find(d.a);
        if (!e) break;
        if (choice == 0) staffGiveDayOff(e->id);
        else { e->morale = std::max(0.0f, e->morale - 0.08f); e->stress = std::min(1.0f, e->stress + 0.1f); ratings.shock(0.0f, -0.6f); }
        break;
    }
    case DecisionKind::StaffInterview: {
        Employee* e = staff.find(d.a);
        if (!e) break;
        if (choice == 0) {
            e->relationship = std::min(1.0f, e->relationship + 0.12f);
            e->stress = std::max(0.0f, e->stress - 0.1f);
            e->morale = std::min(1.0f, e->morale + 0.05f);
            ratings.shock(0.0f, 0.6f);
            if (e->fatigue > 0.65f) log(e->name + " asked for more days off. Consider changing their schedule in the Staff tab.");
        } else if (choice == 1) {
            e->hourlyWage = std::round(e->hourlyWage * 1.08f * 4.0f) / 4.0f;
            e->morale = std::min(1.0f, e->morale + 0.15f);
            e->relationship = std::min(1.0f, e->relationship + 0.08f);
            ratings.shock(0.0f, 1.0f);
        } else {
            e->relationship = std::max(0.0f, e->relationship - 0.04f);
        }
        break;
    }
    case DecisionKind::ClientVisit: {
        Animal* a = findAnimal(d.b);
        if (choice == 0) {
            if (a) a->ownerConsented = true;
            econ.post(day, Ledger::VisitorSales, 85.0, "Exam fee");
            clientsHelpedRecent++;
            ratings.shock(0.8f, 0.2f);
        } else if (choice == 1) {
            if (a) a->ownerConsented = false;
            econ.post(day, Ledger::VisitorSales, 85.0, "Exam fee");
            if (rng.uniform() < 0.4f) { ratings.shock(-2.5f, 0.0f); log("The owner complained nobody explained anything or asked before treating their pet."); }
        } else if (choice == 2) {
            if (a) a->ownerConsented = true;
            clientsMistreatedRecent++;
            ratings.shock(-3.0f, -0.5f);
            log("You were short with a client. They left a one-star review: \"Rude and didn't care about my pet.\"");
        } else {
            if (a) a->status = AnimalStatus::Transferred;
            clientsMistreatedRecent++;
            ratings.shock(-4.0f, -0.5f);
            log("You turned a sick pet away. The owner cried in the parking lot.");
        }
        break;
    }
    case DecisionKind::SurgeryConsent: {
        Animal* a = findAnimal(d.a);
        if (!a) break;
        if (choice == 0) { a->ownerConsented = true; ratings.shock(0.3f, 0.0f); log(a->ownerName + " approved surgery for " + a->name + "."); }
        break;
    }
    case DecisionKind::RuleViolator: {
        static const char* what[] = {"smoking", "drinking", "using drugs"};
        const char* w = what[std::clamp(d.a, 0, 2)];
        if (choice == 0) { ratings.shock(0.6f, 0.2f); log(std::string("You calmly asked the visitor who was ") + w + " to stop. They left."); }
        else if (choice == 1) { ratings.shock(0.4f, 0.3f); log(std::string("You kicked out a visitor for ") + w + " on the property."); }
        else if (choice == 2 && d.choices.size() == 4) { ratings.shock(1.0f, 0.3f); log("Police removed the visitor using drugs in the parking lot."); }
        else {
            violatorsTolerated++;
            ratings.shock(-1.5f, -0.3f);
            if (d.a == 0 && rng.uniform() < 0.2f) log("A cigarette butt started a small fire in the mulch by the dog run. Staff put it out.");
            if (d.a == 2 && rng.uniform() < 0.3f) {
                log("A used needle was found in the dog run. A dog stepped on it.");
                for (auto& an : animalList) if (an.inCare() && cat[size_t(an.species)].category == "Dog") {
                    an.status = AnimalStatus::Injured; an.condition = "Needle stick to the paw"; an.bleeding = 0.1f; break;
                }
            }
            if (d.a == 1 && rng.uniform() < 0.25f) log("The drunk visitor started yelling at families in the waiting room.");
        }
        break;
    }
    case DecisionKind::Protest:
        if (choice == 0) { protest.anger -= 0.35f; protest.talkedTo = true; ratings.shock(1.5f, 1.0f); log("You spoke with the protesters and listened. Some went home."); }
        else if (choice == 1) { protest.anger += 0.1f; }
        else if (choice == 2) { protest.anger += 0.25f; ratings.shock(-2.0f, 0.0f); if (protest.anger < 0.9f) { protest.active = false; log("Police cleared the gate. It was on the evening news."); } }
        else { protest.anger += 0.5f; ratings.shock(-5.0f, -1.0f); log("You shouted at the protesters on camera. The clip is going viral."); }
        break;
    case DecisionKind::InterviewRequest:
        if (choice == 0) startInterview(interviewTopic);
        else { ratings.shock(-8.0f, -1.0f); log("You declined the interview. The headline reads: \"Shelter owner refuses to answer questions.\""); }
        break;
    case DecisionKind::InterviewQuestion:
        interviewScore += choice == 0 ? 1.0f : (choice == 1 ? 0.3f : -1.0f);
        interviewStep++;
        if (interviewStep >= 3) {
            interviewStep = -1;
            if (interviewScore >= 2.2f) {
                ratings.shock(6.0f, 1.0f);
                protest.anger -= 0.3f;
                log("The interview went well. Comments are supportive: \"At least they're honest.\"");
            } else {
                ratings.shock(-10.0f, -1.5f);
                protest.anger += 0.2f;
                log("The interview was a disaster. It's being shared everywhere.");
            }
        } else {
            nextInterviewQuestion();
        }
        break;
    case DecisionKind::ReleaseFeral: {
        Animal* a = findAnimal(d.a);
        if (a && choice == 0) {
            a->status = AnimalStatus::Released;
            ratings.shock(1.2f, 0.6f);
            log(a->name + " the " + cat[size_t(a->species)].name + " was released back into the wild.");
        }
        break;
    }
    default: break;
    }
}

// ---------------------------------------------------------------------------
void Sim::peopleHourly(int h) {
    const int day = clock.day();
    bool open = security.isOpenHours(float(h)) && security.visitorsCanEnter(float(h));
    // Morning greetings from staff who like you
    if (h == 8) {
        for (auto& e : staff.employees) {
            if (e.onVacation(day)) continue;
            if (ratings.privateRating >= 78.0f && e.relationship > 0.55f && rng.uniform() < 0.35f) {
                std::string first = e.name.substr(0, e.name.find(' '));
                const char* lines[] = {"Morning, %s! Coffee's on.", "Hey %s! Biscuit learned to sit yesterday.",
                                       "Good morning, %s - thanks for everything lately.", "%s! Guess what?"};
                char buf[160];
                std::snprintf(buf, sizeof buf, lines[rng.next() % 4], ownerName.c_str());
                std::string g = first + ": \"" + buf + "\"";
                if (rng.uniform() < 0.5f) g += " (They tell you about home: they're " + e.family + ", and " + e.hobby + ".)";
                greetings.push_back(g);
            } else if (ratings.privateRating < 30.0f && rng.uniform() < 0.2f) {
                greetings.push_back(e.name.substr(0, e.name.find(' ')) + " sees you coming and goes quiet. Whispering stops when you walk in.");
            }
        }
    }
    if (!open) return;
    // Clients bringing their pets
    if (rng.uniform() < 0.07f * std::sqrt(Ratings::demandMultiplier(ratings.publicRating))) {
        const auto& cat = speciesCatalog();
        std::vector<int> pets;
        for (size_t i = 0; i < cat.size(); ++i)
            if (cat[i].cls == AnimalClass::Small || cat[i].cls == AnimalClass::Medium) pets.push_back(int(i));
        int sid = pets[size_t(rng.next() % pets.size())];
        const Species& sp = cat[size_t(sid)];
        Animal& a = admit(sid, "Client appointment", 1.0f, true);
        a.housing = -1;
        a.ownerName = randomPersonName(rng);
        static const char* probs[] = {"limping on a back leg", "vomiting since last night", "a lump on its side", "not eating",
                                      "a torn ear from a fight", "swallowed a sock"};
        int pi = int(rng.next() % 6);
        a.condition = probs[pi];
        a.status = pi == 4 ? AnimalStatus::Injured : AnimalStatus::Sick;
        a.bleeding = pi == 4 ? 0.2f : 0.0f;
        a.needsSurgery = pi == 2 || pi == 5;
        a.health = rng.range(0.55f, 0.85f);
        Decision& d = addDecision(DecisionKind::ClientVisit, a.ownerName + " is in the waiting room",
                                  a.ownerName + " brought " + a.name + " the " + sp.name + " - " + a.condition +
                                      ". They're worried. How do you handle it?",
                                  {"Greet them warmly, explain the diagnosis and cost, ask their consent",
                                   "Take the pet and treat it without explaining", "Be curt - you're busy", "Refuse service"},
                                  120.0);
        d.a = sid;
        d.b = a.id;
        d.timeoutChoice = 2;
    }
    // Visitors breaking the rules
    if (rng.uniform() < 0.035f) {
        int t = int(rng.next() % 3);
        static const char* txt[] = {"A visitor is smoking a cigarette next to the cat house. Smoke is drifting inside.",
                                    "A visitor is drinking beer from a paper bag in the waiting room and getting loud.",
                                    "A visitor appears to be using drugs in a car in the parking lot, next to the dog run."};
        std::vector<std::string> ch = {"Politely ask them to stop or leave", "Kick them off the property", "Ignore it"};
        if (t == 2) ch = {"Politely ask them to leave", "Kick them off the property", "Call the police", "Ignore it"};
        addDecision(DecisionKind::RuleViolator, t == 0 ? "Smoking on the property" : (t == 1 ? "Drinking on the property" : "Drug use in the lot"),
                    txt[t], ch, 45.0)
            .a = t;
    }
}

void Sim::peopleDaily() {
    const int day = clock.day();
    // ---- Staff wellbeing ----
    for (auto& e : staff.employees) {
        if (e.onVacation(day)) {
            e.fatigue = std::max(0.0f, e.fatigue - 0.2f);
            e.stress = std::max(0.0f, e.stress - 0.08f);
            e.daysSinceOff = 0;
            continue;
        }
        float load = e.hoursPerWeek / 40.0f;
        float rest = float(e.daysOffPerWeek) / 7.0f;
        e.fatigue = clampf(e.fatigue + 0.055f * load * (1.0f - rest) - 0.14f * rest, 0.0f, 1.0f);
        if (e.daysOffPerWeek == 0) e.daysSinceOff++;
        e.stress = clampf(e.stress + (e.fatigue > 0.7f ? 0.035f : -0.02f) +
                              (e.lifeEvent != LE_None && !e.lifeEventSupported ? 0.025f : 0.0f) + (animalsInCare() > int(staff.employees.size()) * 10 ? 0.01f : 0.0f),
                          0.0f, 1.0f);
        if (e.lifeEvent != LE_None && day - e.lifeEventDay > 14) { e.lifeEvent = LE_None; e.lifeEventSupported = false; }
        // Life happens
        if (e.lifeEvent == LE_None && rng.uniform() < 0.007f) {
            int ev = 1 + int(rng.next() % 7);
            e.lifeEvent = ev;
            e.lifeEventDay = day;
            e.lifeEventSupported = false;
            std::string first = e.name.substr(0, e.name.find(' '));
            std::string title = e.name + ": " + lifeEventName(ev);
            std::string text;
            std::vector<std::string> ch;
            switch (ev) {
            case LE_FamilyDeath:
                e.stress += 0.4f;
                text = first + "'s father died suddenly last night. They called in, barely able to talk.";
                ch = {"Paid bereavement leave (3 days) and send flowers", "Unpaid time off", "Send a sympathy card", "Ask them to come in anyway - you're short-staffed"};
                break;
            case LE_HouseFire:
                e.stress += 0.5f;
                text = first + "'s house burned down overnight. Everyone got out, but they lost almost everything.";
                ch = {"Pay for a hotel for two weeks + a $1,000 gift", "A week of paid leave", "Tell them you're sorry"};
                break;
            case LE_Injury:
                e.stress += 0.25f;
                text = first + " fell off a ladder at home and broke their wrist. The ER bill is about $1,900.";
                ch = {"Pay the medical bill and give paid time off", "Pay the medical bill", "Tell them to use their insurance"};
                break;
            case LE_Illness:
                e.stress += 0.15f;
                text = first + " has the flu with a high fever.";
                ch = {"Paid sick days + cover the doctor visit", "Paid sick days", "Unpaid sick days", "Tell them to come in anyway"};
                break;
            case LE_Burnout:
                e.stress = std::max(e.stress, 0.85f);
                text = first + " broke down crying in the break room. They say they can't keep doing this - too many hours, too much death.";
                ch = {"Pay for a week's vacation ($1,500)", "Give them two days off", "Sit down and talk it through", "Tell them to toughen up"};
                break;
            case LE_NewBaby:
                text = first + " just had a baby! They're asking about leave.";
                ch = {"Two weeks paid parental leave + a $300 gift", "Unpaid leave", "Send a card"};
                break;
            case LE_Wedding:
                text = first + " is getting married next weekend.";
                ch = {"A $250 gift and three days off", "Give them the days off", "Nothing"};
                break;
            default: break;
            }
            Decision& d = addDecision(DecisionKind::StaffLifeEvent, title, text, ch, 1440.0 * 2);
            d.a = e.id;
            d.b = ev;
            d.timeoutChoice = int(ch.size()) - 1;
            log(title);
        } else if (e.lifeEvent == LE_None && e.stress > 0.85f && rng.uniform() < 0.3f) {
            e.lifeEvent = LE_Burnout;
            e.lifeEventDay = day;
            Decision& d = addDecision(DecisionKind::StaffLifeEvent, e.name + " is burning out",
                                      e.name.substr(0, e.name.find(' ')) + " snapped at a visitor, then apologized in tears. They're exhausted and overwhelmed.",
                                      {"Pay for a week's vacation ($1,500)", "Give them two days off", "Sit down and talk it through", "Tell them to toughen up"},
                                      1440.0 * 2);
            d.a = e.id;
            d.b = LE_Burnout;
        }
        if (e.fatigue > 0.5f && rng.uniform() < 0.03f)
            addDecision(DecisionKind::StaffDayOff, e.name + " asks for a day off",
                        "\"I'm running on fumes. Could I take tomorrow off?\"", {"Approve", "Deny - we need you"}, 480.0)
                .a = e.id;
        if (e.fatigue > 0.85f && e.lifeEvent == LE_None && rng.uniform() < 0.02f) {
            e.lifeEvent = LE_Injury;
            e.lifeEventDay = day;
            log(e.name + " was so exhausted they slipped while lifting a 40 kg dog and hurt their back.");
            addDecision(DecisionKind::StaffLifeEvent, e.name + " hurt at work",
                        e.name + " injured their back at work because they were exhausted. Workers' comp paperwork or you cover it?",
                        {"Pay the medical bill and give paid time off", "Pay the medical bill", "Tell them to use their insurance"}, 1440.0 * 2)
                .a = e.id;
            decisions.back().b = LE_Injury;
        }
    }
    // Interviews overdue
    if (day % 7 == 0) {
        int overdue = 0;
        for (auto& e : staff.employees) overdue += (day - e.lastInterviewDay > 30) ? 1 : 0;
        if (overdue > 0) log(std::to_string(overdue) + " staff haven't had a one-on-one in over a month. Check in with them from the Staff tab.");
    }
    // Low private rating: quitting (handled in onEndOfDay), sabotage and rumors
    if (ratings.privateRating < 25.0f && !staff.employees.empty()) {
        Employee& e = staff.employees[size_t(rng.next() % staff.employees.size())];
        if (e.morale < 0.35f && rng.uniform() < 0.05f) {
            std::vector<Animal*> targets;
            for (auto& a : animalList) if (a.inCare() && !a.owned) targets.push_back(&a);
            if (!targets.empty()) {
                Animal* a = targets[size_t(rng.next() % targets.size())];
                const Species& sp = speciesCatalog()[size_t(a->species)];
                a->status = AnimalStatus::Critical;
                a->condition = "Poisoned (antifreeze in the water bowl)";
                a->health = std::min(a->health, 0.3f);
                log("SABOTAGE: " + a->name + " the " + sp.name + " is convulsing - someone put antifreeze in its water.");
                if (security.cameras.size() >= 4 && rng.uniform() < 0.5f) {
                    log("Camera footage shows " + e.name + " doing it. They've been fired and the police were called.");
                    int id = e.id;
                    staff.fire(id);
                } else {
                    scandal(3.0f, "Animals poisoned at the shelter");
                }
            }
        } else if (rng.uniform() < 0.08f) {
            log("Rumors are spreading around town that you mistreat your staff and cut corners with the animals.");
            ratings.shock(-1.5f, -0.5f);
        }
    }
    // ---- Protest ----
    if (protest.active) {
        float r = ratings.publicRating;
        protest.anger = clampf(protest.anger + (r < 35.0f ? 0.06f : -0.08f) + (protest.talkedTo ? -0.05f : 0.02f), 0.0f, 1.2f);
        protest.size = std::max(0, protest.size + int(protest.anger * 10.0f) - 4 + int(rng.next() % 3));
        if (protest.anger >= 1.0f) {
            const char* what[] = {"A driver forcing through the gate hit two protesters. One of them died at the scene.",
                                  "A fight broke out between protesters and visitors. A man was beaten unconscious and died in hospital.",
                                  "Someone threw a brick through the waiting-room window; a volunteer's head was split open and they bled heavily."};
            int w = int(rng.next() % 3);
            log(std::string("THE PROTEST TURNED VIOLENT: ") + what[w]);
            ratings.shock(w < 2 ? -20.0f : -9.0f, -6.0f);
            protest.active = false;
            log("Police shut the protest down. Expect investigators and reporters.");
        } else if (protest.anger < 0.15f || protest.size <= 2) {
            protest.active = false;
            log("The protesters went home.");
        } else {
            ratings.shock(-0.6f, -0.2f);
        }
    }
    // Memories fade
    if (day % 10 == 0) { clientsMistreatedRecent = std::max(0, clientsMistreatedRecent - 1); violatorsTolerated = std::max(0, violatorsTolerated - 1); }
    if (day % 30 == 0) clientsHelpedRecent = 0;
}

}  // namespace ps
