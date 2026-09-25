#include "game/Economy.h"
#include "core/Math.h"
#include <cmath>

namespace ps {

const char* ledgerName(Ledger c) {
    static const char* n[] = {"Adoption fees", "Donations", "Grants", "Visitor sales",
                              "Payroll", "Payroll tax", "Income tax", "Property tax", "Sales tax", "Utilities",
                              "Supplies", "Animal care", "Medical", "Staff bonuses", "Marketing", "Maintenance",
                              "Security", "Construction", "Penalties"};
    return n[int(c)];
}
bool ledgerIsIncome(Ledger c) { return int(c) <= int(Ledger::VisitorSales); }
bool ledgerIsTaxDeductible(Ledger c) {
    return !ledgerIsIncome(c) && c != Ledger::IncomeTax && c != Ledger::Construction && c != Ledger::Penalty;
}

const char* budgetName(BudgetCat c) {
    static const char* n[] = {"Animal care", "Medical supplies", "Staff bonuses", "Marketing", "Maintenance", "Security"};
    return n[int(c)];
}
const char* budgetHelp(BudgetCat c) {
    static const char* n[] = {
        "Food, bedding, toys, enrichment. Animal welfare drives both ratings.",
        "Stocks the medical room. Needed for treatments and surgery.",
        "Extra pay on top of wages. Raises morale and your private rating.",
        "Ads and community events. The fastest way to raise your public rating.",
        "Repairs and cleaning supplies. A clean place keeps the public happy.",
        "Cameras, locks and alarm monitoring. Cuts break-ins and vandalism."};
    return n[int(c)];
}
Ledger budgetLedger(BudgetCat c) {
    static const Ledger l[] = {Ledger::AnimalCare, Ledger::Medical, Ledger::StaffBonuses,
                               Ledger::Marketing, Ledger::Maintenance, Ledger::Security};
    return l[int(c)];
}

Economy::Economy() {
    monthlyBudget = {1200.0f, 600.0f, 0.0f, 900.0f, 700.0f, 400.0f};
}

void Economy::post(int day, Ledger cat, double amount, const std::string& memo) {
    cash += amount;
    quarter[size_t(cat)] += amount;
    month[size_t(cat)] += amount;
    lifetime[size_t(cat)] += amount;
    ledger.push_back({day, cat, amount, memo});
    while (ledger.size() > 400) ledger.pop_front();
}

bool Economy::tryPay(int day, Ledger cat, double amount, const std::string& memo) {
    if (amount <= 0.0) return true;
    if (cash < amount) return false;
    post(day, cat, -amount, memo);
    return true;
}

double Economy::quarterProfit() const {
    double p = 0;
    for (int i = 0; i < int(Ledger::Count); ++i) {
        Ledger c = Ledger(i);
        if (ledgerIsIncome(c) || ledgerIsTaxDeductible(c)) p += quarter[size_t(i)];
    }
    return p;
}

double Economy::monthNet() const {
    double p = 0;
    for (double v : month) p += v;
    return p;
}

double Economy::totalMonthlyBudget() const {
    double s = 0;
    for (float v : monthlyBudget) s += v;
    return s;
}

double Economy::sumLast(int days, bool income) const {
    if (ledger.empty()) return 0.0;
    int lastDay = ledger.back().day;
    double s = 0;
    for (auto it = ledger.rbegin(); it != ledger.rend() && it->day > lastDay - days; ++it)
        if (ledgerIsIncome(it->cat) == income) s += it->amount;
    return s;
}

double Economy::runwayDays(double weeklyPayroll) const {
    double dailyBurn = weeklyPayroll * (1.0 + tax.payrollEmployer + tax.unemployment) / 7.0 +
                       totalMonthlyBudget() / 30.0 + 120.0 + propertyValue * tax.propertyAnnual / 365.0;
    // Only recurring income counts (one-off grants don't keep the lights on)
    double recurring = 0.0;
    if (!ledger.empty()) {
        int lastDay = ledger.back().day;
        for (auto it = ledger.rbegin(); it != ledger.rend() && it->day > lastDay - 30; ++it)
            if (it->cat == Ledger::Donations || it->cat == Ledger::AdoptionFees || it->cat == Ledger::VisitorSales) recurring += it->amount;
    }
    double dailyIncome = std::max(0.0, recurring / 30.0);
    double net = dailyBurn - dailyIncome;
    if (net <= 0.0) return 9999.0;
    return std::max(0.0, cash) / net;
}

float Economy::financialScore(double weeklyPayroll) const {
    float runway = float(runwayDays(weeklyPayroll));
    float s = 40.0f * saturate(runway / 365.0f);                 // a year of runway = full marks
    double net30 = sumLast(30, true) + sumLast(30, false);
    s += 25.0f * saturate(float(net30 / 20000.0) * 0.5f + 0.5f);  // profit trend
    s += 20.0f * (taxDebt <= 0.0 ? 1.0f : saturate(1.0f - float(taxDebt / 20000.0)));
    s += 15.0f * saturate(1.0f - 0.25f * float(missedPayrolls + latePayments));
    if (cash < 0.0) s *= 0.5f;
    return clampf(s, 0.0f, 100.0f);
}

const char* Economy::grade(float s) {
    if (s >= 93) return "A+";
    if (s >= 85) return "A";
    if (s >= 78) return "B+";
    if (s >= 70) return "B";
    if (s >= 62) return "C+";
    if (s >= 55) return "C";
    if (s >= 45) return "D";
    return "F";
}

}  // namespace ps
