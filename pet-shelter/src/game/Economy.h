// Money: cash, ledger, taxes, payroll and the budget allocation that decides
// where your money goes. "The most important thing" on the office computer.
#pragma once
#include <array>
#include <deque>
#include <string>
#include <vector>

namespace ps {

enum class Ledger {
    // income
    AdoptionFees, Donations, Grants, VisitorSales,
    // expenses
    Payroll, PayrollTax, IncomeTax, PropertyTax, SalesTax, Utilities, Supplies,
    AnimalCare, Medical, StaffBonuses, Marketing, Maintenance, Security, Construction, Penalty,
    Count
};
const char* ledgerName(Ledger c);
bool ledgerIsIncome(Ledger c);
bool ledgerIsTaxDeductible(Ledger c);

// Where discretionary money goes each month (the owner sets these).
enum class BudgetCat { AnimalCare, Medical, StaffBonuses, Marketing, Maintenance, Security, Count };
const char* budgetName(BudgetCat c);
const char* budgetHelp(BudgetCat c);
Ledger budgetLedger(BudgetCat c);

struct TaxRates {
    float payrollEmployer = 0.0765f;  // Social Security + Medicare employer share
    float unemployment = 0.006f;      // FUTA
    float income = 0.21f;             // on positive quarterly profit
    float propertyAnnual = 0.011f;    // of assessed property value
    float sales = 0.07f;              // on adoption fees
};

struct LedgerEntry {
    int day;
    Ledger cat;
    double amount;   // + income, - expense
    std::string memo;
};

class Economy {
public:
    double cash = 150000.0;
    double propertyValue = 850000.0;   // assessed value (land + buildings)
    double taxDebt = 0.0;              // unpaid taxes (accrue penalties)
    TaxRates tax;
    std::array<float, size_t(BudgetCat::Count)> monthlyBudget{};  // $ / month

    std::deque<LedgerEntry> ledger;    // most recent last (capped)
    std::vector<float> cashHistory;    // one sample per day
    // Running totals for the current quarter (for income tax) and all-time.
    std::array<double, size_t(Ledger::Count)> quarter{};
    std::array<double, size_t(Ledger::Count)> month{};
    std::array<double, size_t(Ledger::Count)> lifetime{};
    int missedPayrolls = 0;
    int latePayments = 0;

    Economy();
    void post(int day, Ledger cat, double amount, const std::string& memo = {});
    // Tries to pay; returns false (and posts nothing) if cash is short.
    bool tryPay(int day, Ledger cat, double amount, const std::string& memo = {});

    double quarterProfit() const;       // taxable profit this quarter
    double monthNet() const;
    double totalMonthlyBudget() const;
    double sumLast(int days, bool income) const;
    // Estimated weekly burn (payroll + budget + fixed costs)
    double runwayDays(double weeklyPayroll) const;
    // Financial rating: 0..100 and letter grade
    float financialScore(double weeklyPayroll) const;
    static const char* grade(float score);

    void startNewMonth() { month.fill(0.0); }
    void startNewQuarter() { quarter.fill(0.0); }
};

}  // namespace ps
