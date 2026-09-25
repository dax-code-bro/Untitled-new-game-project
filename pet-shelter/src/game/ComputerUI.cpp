#include "game/ComputerUI.h"
#include "world/Layout.h"
#include <imgui.h>
#include <cfloat>
#include <cmath>
#include <cstdio>
#include <string>

namespace ps {

namespace {
std::string money(double v) {
    char buf[48];
    double a = std::fabs(v);
    long long whole = (long long)a;
    int cents = int(std::llround((a - double(whole)) * 100.0));
    if (cents == 100) { whole++; cents = 0; }
    std::string s = std::to_string(whole);
    for (int i = int(s.size()) - 3; i > 0; i -= 3) s.insert(size_t(i), ",");
    std::snprintf(buf, sizeof buf, "%s$%s.%02d", v < 0 ? "-" : "", s.c_str(), cents);
    return buf;
}

void stars(float rating) {
    float st = rating / 20.0f;
    std::string s;
    for (int i = 0; i < 5; ++i) s += st >= float(i) + 0.75f ? "*" : (st >= float(i) + 0.25f ? "+" : ".");
    ImGui::TextColored(ImVec4(1.0f, 0.8f, 0.2f, 1), "[%s] %.1f / 5", s.c_str(), st);
}

void ratingBar(const char* label, float v, ImVec4 col) {
    ImGui::PushStyleColor(ImGuiCol_PlotHistogram, col);
    char buf[32];
    std::snprintf(buf, sizeof buf, "%.0f / 100", v);
    ImGui::ProgressBar(v / 100.0f, ImVec2(-1, 22), buf);
    ImGui::PopStyleColor();
    (void)label;
}

void factorTable(const char* id, const std::vector<RatingFactor>& f) {
    if (ImGui::BeginTable(id, 2, ImGuiTableFlags_RowBg | ImGuiTableFlags_BordersInnerV)) {
        ImGui::TableSetupColumn("Factor");
        ImGui::TableSetupColumn("Effect", ImGuiTableColumnFlags_WidthFixed, 80);
        ImGui::TableHeadersRow();
        for (auto& x : f) {
            ImGui::TableNextRow();
            ImGui::TableNextColumn();
            ImGui::TextUnformatted(x.name.c_str());
            ImGui::TableNextColumn();
            ImVec4 c = x.value >= 0 ? ImVec4(0.5f, 0.9f, 0.5f, 1) : ImVec4(1.0f, 0.45f, 0.4f, 1);
            ImGui::TextColored(c, "%+.1f", x.value);
        }
        ImGui::EndTable();
    }
}
}  // namespace

void ComputerUI::init(Renderer& r) {
    feed_ = r.createTarget(640, 360);
}

void ComputerUI::renderFeed(Renderer& r, const Renderer::SceneFn& scene, const Sim& sim, float time) {
    feedReady_ = false;
    if (!open || tab != TabSecurity || sim.security.cameras.empty()) return;
    selectedCamera = std::min(selectedCamera, int(sim.security.cameras.size()) - 1);
    const SecurityCamera& c = sim.security.cameras[size_t(selectedCamera)];
    if (!c.online) return;
    Camera cam;
    cam.fovY = c.fov;
    cam.aspect = 16.0f / 9.0f;
    cam.zNear = 0.1f;
    vec3 fwd{std::sin(c.yaw) * std::cos(c.pitch), std::sin(c.pitch), std::cos(c.yaw) * std::cos(c.pitch)};
    cam.lookDir(c.pos, fwd);
    r.renderToTarget(cam, scene, feed_, time);
    feedReady_ = true;
}

bool ComputerUI::draw(Sim& sim, const Facility& facility) {
    ImGuiIO& io = ImGui::GetIO();
    ImGui::SetNextWindowPos(ImVec2(0, 0));
    ImGui::SetNextWindowSize(io.DisplaySize);
    ImGui::PushStyleColor(ImGuiCol_WindowBg, ImVec4(0.07f, 0.09f, 0.12f, 0.97f));
    ImGui::Begin("ShelterOS", nullptr, ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoSavedSettings);
    bool keepOpen = true;

    // Top bar
    ImGui::TextColored(ImVec4(0.45f, 0.8f, 1.0f, 1), "ShelterOS");
    ImGui::SameLine();
    ImGui::TextDisabled("| %s  %s", sim.clock.dateString().c_str(), sim.clock.timeString().c_str());
    ImGui::SameLine();
    ImGui::Text("   Cash: %s", money(sim.econ.cash).c_str());
    ImGui::SameLine();
    float fs = sim.financialScore();
    ImGui::Text("   Financial rating: %s", Economy::grade(fs));
    ImGui::SameLine(ImGui::GetWindowWidth() - 150);
    if (ImGui::Button("Log off  [Esc]", ImVec2(130, 0))) keepOpen = false;
    ImGui::Separator();

    // Sidebar tabs
    ImGui::BeginChild("tabs", ImVec2(240, 0), ImGuiChildFlags_Borders);
    const char* names[] = {"Animals", "Security", "Finances", "Ratings"};
    const char* hints[] = {"Every animal in your care", "Cameras, gate & locks", "Taxes, income, payroll", "Private & public opinion"};
    for (int i = 0; i < TabCount; ++i) {
        if (ImGui::Selectable(names[i], tab == i, 0, ImVec2(0, 34))) tab = i;
        ImGui::TextDisabled("  %s", hints[i]);
        ImGui::Spacing();
    }
    ImGui::Separator();
    ImGui::TextDisabled("Inbox");
    int n = 0;
    for (auto it = sim.events.rbegin(); it != sim.events.rend() && n < 8; ++it, ++n)
        ImGui::TextWrapped("Day %d: %s", it->day + 1, it->text.c_str());
    ImGui::EndChild();
    ImGui::SameLine();
    ImGui::BeginChild("content", ImVec2(0, 0), ImGuiChildFlags_Borders);
    switch (tab) {
    case TabAnimals: drawAnimals(sim); break;
    case TabSecurity: drawSecurity(sim, facility); break;
    case TabFinances: drawFinances(sim); break;
    case TabRatings: drawRatings(sim); break;
    }
    ImGui::EndChild();
    ImGui::End();
    ImGui::PopStyleColor();
    return keepOpen;
}

void ComputerUI::drawAnimals(Sim& sim) {
    ImGui::Text("ANIMALS");
    ImGui::Separator();
    int kennels = sim.placedCount(BuildKind::KennelBlock), cats = sim.placedCount(BuildKind::CatHouse);
    int capacity = kennels * buildInfo(BuildKind::KennelBlock).animalCapacity + cats * buildInfo(BuildKind::CatHouse).animalCapacity;
    ImGui::Text("Animals in care: %d", sim.animals);
    ImGui::Text("Housing capacity: %d  (kennel blocks: %d, cat houses: %d)", capacity, kennels, cats);
    ImGui::Spacing();
    if (ImGui::BeginTable("animals", 6, ImGuiTableFlags_RowBg | ImGuiTableFlags_Borders)) {
        for (const char* h : {"Name", "Species", "Breed", "Age", "Health", "Status"}) ImGui::TableSetupColumn(h);
        ImGui::TableHeadersRow();
        ImGui::EndTable();
    }
    ImGui::Spacing();
    ImGui::TextWrapped("No animals yet. Intake, kennel assignment, medical records, appointments and adoptions "
                       "will appear here once animals arrive in the next update.");
    ImGui::Spacing();
    ImGui::TextDisabled("Tip: build Kennel Blocks and Cat Houses in Creative mode (Tab) to get housing ready.");
}

void ComputerUI::drawSecurity(Sim& sim, const Facility& facility) {
    SecuritySystem& sec = sim.security;
    ImGui::Text("SECURITY");
    ImGui::Separator();
    ImGui::BeginChild("cams", ImVec2(260, 0), ImGuiChildFlags_Borders);
    ImGui::TextDisabled("Cameras (%d)", int(sec.cameras.size()));
    for (size_t i = 0; i < sec.cameras.size(); ++i) {
        char label[96];
        std::snprintf(label, sizeof label, "%s %s", sec.cameras[i].online ? "[REC]" : "[OFF]", sec.cameras[i].name.c_str());
        if (ImGui::Selectable(label, selectedCamera == int(i))) selectedCamera = int(i);
    }
    ImGui::Spacing();
    ImGui::TextWrapped("Place more cameras in Creative mode (Security > Security Camera).");
    ImGui::EndChild();
    ImGui::SameLine();
    ImGui::BeginChild("feed", ImVec2(0, 0));
    if (!sec.cameras.empty()) {
        SecurityCamera& c = sec.cameras[size_t(std::min(selectedCamera, int(sec.cameras.size()) - 1))];
        ImGui::Text("%s", c.name.c_str());
        ImGui::SameLine();
        ImGui::TextDisabled("  %s  %s", sim.clock.dateString().c_str(), sim.clock.timeString().c_str());
        float w = std::min(ImGui::GetContentRegionAvail().x, 800.0f);
        if (feedReady_) ImGui::Image((ImTextureID)(intptr_t)feed_.ldrTex, ImVec2(w, w * 9.0f / 16.0f), ImVec2(0, 1), ImVec2(1, 0));
        else ImGui::Dummy(ImVec2(w, w * 9.0f / 16.0f));
        ImGui::Checkbox("Online", &c.online);
        ImGui::SameLine();
        ImGui::SetNextItemWidth(220);
        float yawDeg = degrees(c.yaw);
        if (ImGui::SliderFloat("Pan", &yawDeg, -180.0f, 180.0f, "%.0f deg")) c.yaw = radians(yawDeg);
        ImGui::SameLine();
        ImGui::SetNextItemWidth(160);
        float pitchDeg = degrees(c.pitch);
        if (ImGui::SliderFloat("Tilt", &pitchDeg, -80.0f, 10.0f, "%.0f deg")) c.pitch = radians(pitchDeg);
    }
    ImGui::Spacing();
    ImGui::SeparatorText("Highway gate");
    const char* state = facility.gate.moving() ? (facility.gate.target > 0.5f ? "Opening..." : "Closing...")
                                               : (facility.gate.value > 0.5f ? "Open" : "Closed");
    ImGui::Text("Gate status: %s", state);
    ImGui::SameLine();
    ImGui::TextDisabled("   Access: ");
    for (auto& a : sec.gateAccess) { ImGui::SameLine(); ImGui::TextColored(ImVec4(0.6f, 0.9f, 0.6f, 1), "%s", a.c_str()); }
    if (sec.gateLocked) ImGui::BeginDisabled();
    if (ImGui::Button(sec.gateManualOpen ? "Close gate" : "Open gate", ImVec2(140, 0))) sec.gateManualOpen = !sec.gateManualOpen;
    if (sec.gateLocked) ImGui::EndDisabled();
    ImGui::SameLine();
    if (ImGui::Checkbox("Lock gate", &sec.gateLocked) && sec.gateLocked) sec.gateManualOpen = false;
    ImGui::SameLine();
    ImGui::Checkbox("Automatic (opens for visitors during open hours)", &sec.gateAutomatic);
    ImGui::SetNextItemWidth(200);
    ImGui::SliderInt("Opening hour", &sec.openHour, 5, 12);
    ImGui::SameLine();
    ImGui::SetNextItemWidth(200);
    ImGui::SliderInt("Closing hour", &sec.closeHour, 13, 22);
    if (!sec.visitorsCanEnter(12.0f))
        ImGui::TextColored(ImVec4(1, 0.6f, 0.3f, 1), "Visitors can't get in right now. Open the gate or switch it to automatic.");

    ImGui::SeparatorText("Door locks");
    const auto& doors = layout::doors();
    for (size_t i = 0; i < doors.size() && i < sec.doorLocked.size(); ++i) {
        if (!doors[i].lockable) continue;
        bool v = sec.doorLocked[i];
        std::string label = doors[i].name + "##lock" + std::to_string(i);
        if (ImGui::Checkbox(label.c_str(), &v)) sec.doorLocked[i] = v;
        if (i % 4 != 3) ImGui::SameLine(0, 24);
    }
    ImGui::NewLine();
    ImGui::SeparatorText("Incidents");
    ImGui::Text("Break-ins / vandalism in the last 30 days: %d", sec.incidentsLast30);
    ImGui::Text("Tonight's risk: %.1f%%", 100.0f * sec.incidentChance(sim.staff.count(Role::SecurityGuard),
                                                                   sim.econ.monthlyBudget[size_t(BudgetCat::Security)]));
    ImGui::EndChild();
}

void ComputerUI::drawFinances(Sim& sim) {
    Economy& e = sim.econ;
    float fs = sim.financialScore();
    ImGui::Text("FINANCES");
    ImGui::SameLine(200);
    ImGui::Text("Cash: %s", money(e.cash).c_str());
    ImGui::SameLine(420);
    ImGui::Text("Financial rating: %s (%.0f/100)", Economy::grade(fs), fs);
    ImGui::SameLine(720);
    double run = e.runwayDays(sim.weeklyPayroll());
    if (run > 9000) ImGui::TextColored(ImVec4(0.5f, 0.9f, 0.5f, 1), "Runway: profitable");
    else ImGui::Text("Runway: %.0f days", run);
    ImGui::Separator();
    const char* sub[] = {"Overview", "Budget", "Payroll & Staff", "Taxes", "Ledger"};
    for (int i = 0; i < 5; ++i) {
        if (i) ImGui::SameLine();
        if (ImGui::RadioButton(sub[i], financeTab_ == i)) financeTab_ = i;
    }
    ImGui::Separator();

    if (financeTab_ == 0) {
        if (!e.cashHistory.empty()) {
            ImGui::PlotLines("##cash", e.cashHistory.data(), int(e.cashHistory.size()), 0, "Cash balance (daily)", FLT_MAX, FLT_MAX,
                             ImVec2(ImGui::GetContentRegionAvail().x, 140));
        }
        if (ImGui::BeginTable("stmt", 4, ImGuiTableFlags_RowBg | ImGuiTableFlags_BordersInnerV)) {
            ImGui::TableSetupColumn("Category");
            ImGui::TableSetupColumn("This month");
            ImGui::TableSetupColumn("This quarter");
            ImGui::TableSetupColumn("All time");
            ImGui::TableHeadersRow();
            double tm = 0, tq = 0, tl = 0;
            for (int i = 0; i < int(Ledger::Count); ++i) {
                double m = e.month[size_t(i)], q = e.quarter[size_t(i)], l = e.lifetime[size_t(i)];
                if (m == 0 && q == 0 && l == 0) continue;
                tm += m; tq += q; tl += l;
                ImGui::TableNextRow();
                ImGui::TableNextColumn();
                ImGui::TextColored(ledgerIsIncome(Ledger(i)) ? ImVec4(0.5f, 0.9f, 0.5f, 1) : ImVec4(0.95f, 0.75f, 0.7f, 1), "%s", ledgerName(Ledger(i)));
                ImGui::TableNextColumn(); ImGui::Text("%s", money(m).c_str());
                ImGui::TableNextColumn(); ImGui::Text("%s", money(q).c_str());
                ImGui::TableNextColumn(); ImGui::Text("%s", money(l).c_str());
            }
            ImGui::TableNextRow();
            ImGui::TableNextColumn(); ImGui::Text("NET");
            ImGui::TableNextColumn(); ImGui::Text("%s", money(tm).c_str());
            ImGui::TableNextColumn(); ImGui::Text("%s", money(tq).c_str());
            ImGui::TableNextColumn(); ImGui::Text("%s", money(tl).c_str());
            ImGui::EndTable();
        }
        ImGui::Text("Visitors yesterday: %d   (capacity %d/day, turned away %d)", sim.visitorsYesterday, sim.visitorCapacityPerDay(),
                    sim.turnedAwayYesterday);
        ImGui::Text("Property value (assessed): %s", money(e.propertyValue).c_str());
    } else if (financeTab_ == 1) {
        ImGui::TextWrapped("Choose where your money goes each month. It's spent a little every day. "
                           "Every category moves your ratings, so where you spend is up to you.");
        ImGui::Spacing();
        for (int i = 0; i < int(BudgetCat::Count); ++i) {
            ImGui::SetNextItemWidth(360);
            std::string label = std::string(budgetName(BudgetCat(i))) + "##b";
            ImGui::SliderFloat(label.c_str(), &e.monthlyBudget[size_t(i)], 0.0f, 6000.0f, "$%.0f / month");
            ImGui::SameLine();
            ImGui::TextDisabled("(?)");
            if (ImGui::IsItemHovered()) ImGui::SetTooltip("%s", budgetHelp(BudgetCat(i)));
        }
        ImGui::Separator();
        ImGui::Text("Total discretionary budget: %s / month", money(e.totalMonthlyBudget()).c_str());
        ImGui::Text("Weekly payroll (gross): %s   (~%s / month)", money(sim.weeklyPayroll()).c_str(),
                    money(sim.weeklyPayroll() * 52.0 / 12.0).c_str());
    } else if (financeTab_ == 2) {
        StaffRoster& st = sim.staff;
        double gross = st.weeklyGross();
        ImGui::Text("Weekly payroll: %s gross + %s employer payroll tax. Payday is every Friday night.", money(gross).c_str(),
                    money(gross * (e.tax.payrollEmployer + e.tax.unemployment)).c_str());
        ImGui::Text("Average morale: %.0f%%   Pay vs. market: %.0f%%", st.averageMorale() * 100.0f, st.wageFairness() * 100.0f);
        int fireId = -1;
        if (ImGui::BeginTable("staff", 6, ImGuiTableFlags_RowBg | ImGuiTableFlags_Borders)) {
            for (const char* h : {"Name", "Role", "Wage ($/hr)", "Hours/wk", "Morale", ""}) ImGui::TableSetupColumn(h);
            ImGui::TableHeadersRow();
            for (auto& emp : st.employees) {
                ImGui::PushID(emp.id);
                ImGui::TableNextRow();
                ImGui::TableNextColumn(); ImGui::TextUnformatted(emp.name.c_str());
                ImGui::TableNextColumn(); ImGui::TextUnformatted(roleInfo(emp.role).name);
                ImGui::TableNextColumn();
                ImGui::SetNextItemWidth(150);
                ImGui::SliderFloat("##w", &emp.hourlyWage, 7.25f, roleInfo(emp.role).marketWage * 2.0f, "$%.2f");
                ImGui::SameLine(); ImGui::TextDisabled("mkt %.2f", roleInfo(emp.role).marketWage);
                ImGui::TableNextColumn();
                ImGui::SetNextItemWidth(90);
                ImGui::SliderFloat("##h", &emp.hoursPerWeek, 10.0f, 50.0f, "%.0f");
                ImGui::TableNextColumn();
                ImGui::ProgressBar(emp.morale, ImVec2(100, 0));
                ImGui::TableNextColumn();
                if (ImGui::SmallButton("Fire")) fireId = emp.id;
                ImGui::PopID();
            }
            ImGui::EndTable();
        }
        if (fireId >= 0) {
            st.fire(fireId);
            sim.ratings.shock(0.0f, -1.5f);
            sim.log("You let an employee go.");
        }
        ImGui::SeparatorText("Applicants (refresh every Monday)");
        int hireId = -1;
        if (ImGui::BeginTable("apps", 5, ImGuiTableFlags_RowBg | ImGuiTableFlags_Borders)) {
            for (const char* h : {"Name", "Role", "Asking wage", "Skill", ""}) ImGui::TableSetupColumn(h);
            ImGui::TableHeadersRow();
            for (auto& a : st.applicants) {
                ImGui::PushID(a.id + 100000);
                ImGui::TableNextRow();
                ImGui::TableNextColumn(); ImGui::TextUnformatted(a.name.c_str());
                ImGui::TableNextColumn(); ImGui::TextUnformatted(roleInfo(a.role).name);
                if (ImGui::IsItemHovered()) ImGui::SetTooltip("%s", roleInfo(a.role).description);
                ImGui::TableNextColumn(); ImGui::Text("$%.2f/hr", a.hourlyWage);
                ImGui::TableNextColumn(); ImGui::ProgressBar(a.skill, ImVec2(100, 0));
                ImGui::TableNextColumn();
                if (ImGui::SmallButton("Hire")) hireId = a.id;
                ImGui::PopID();
            }
            ImGui::EndTable();
        }
        if (hireId >= 0 && st.hire(hireId)) sim.log("New hire: " + st.employees.back().name + " (" + roleInfo(st.employees.back().role).name + ").");
    } else if (financeTab_ == 3) {
        const TaxRates& t = e.tax;
        if (ImGui::BeginTable("tax", 3, ImGuiTableFlags_RowBg | ImGuiTableFlags_Borders)) {
            ImGui::TableSetupColumn("Tax");
            ImGui::TableSetupColumn("Rate");
            ImGui::TableSetupColumn("When");
            ImGui::TableHeadersRow();
            auto row = [](const char* a, std::string b, const char* c) {
                ImGui::TableNextRow();
                ImGui::TableNextColumn(); ImGui::TextUnformatted(a);
                ImGui::TableNextColumn(); ImGui::TextUnformatted(b.c_str());
                ImGui::TableNextColumn(); ImGui::TextUnformatted(c);
            };
            char buf[64];
            std::snprintf(buf, sizeof buf, "%.2f%% of wages", t.payrollEmployer * 100.0f); row("Payroll tax (employer FICA)", buf, "Every payday");
            std::snprintf(buf, sizeof buf, "%.2f%% of wages", t.unemployment * 100.0f); row("Unemployment (FUTA)", buf, "Every payday");
            std::snprintf(buf, sizeof buf, "%.0f%% of profit", t.income * 100.0f); row("Income tax", buf, "Quarterly (every 90 days)");
            std::snprintf(buf, sizeof buf, "%.1f%% / year of property value", t.propertyAnnual * 100.0f); row("Property tax", buf, "Quarterly installments");
            std::snprintf(buf, sizeof buf, "%.0f%% of adoption fees", t.sales * 100.0f); row("Sales tax", buf, "With each adoption");
            ImGui::EndTable();
        }
        int day = sim.clock.day();
        int nextQ = (day / 90 + 1) * 90;
        double profit = e.quarterProfit();
        ImGui::Text("Next quarterly taxes due in %d days (Day %d).", nextQ - day, nextQ + 1);
        ImGui::Text("Taxable profit so far this quarter: %s", money(profit).c_str());
        ImGui::Text("Estimated income tax: %s", money(profit > 0 ? profit * t.income : 0.0).c_str());
        ImGui::Text("Property tax installment: %s", money(e.propertyValue * t.propertyAnnual / 4.0).c_str());
        if (e.taxDebt > 0) ImGui::TextColored(ImVec4(1, 0.4f, 0.35f, 1), "Back taxes owed: %s (1%% penalty per month)", money(e.taxDebt).c_str());
        else ImGui::TextColored(ImVec4(0.5f, 0.9f, 0.5f, 1), "You're current on all taxes.");
        ImGui::Text("Taxes paid all-time: %s",
                    money(-(e.lifetime[size_t(Ledger::PayrollTax)] + e.lifetime[size_t(Ledger::IncomeTax)] +
                            e.lifetime[size_t(Ledger::PropertyTax)] + e.lifetime[size_t(Ledger::SalesTax)])).c_str());
    } else {
        if (ImGui::BeginTable("ledger", 4, ImGuiTableFlags_RowBg | ImGuiTableFlags_Borders | ImGuiTableFlags_ScrollY,
                              ImVec2(0, ImGui::GetContentRegionAvail().y))) {
            ImGui::TableSetupScrollFreeze(0, 1);
            for (const char* h : {"Day", "Category", "Amount", "Memo"}) ImGui::TableSetupColumn(h);
            ImGui::TableHeadersRow();
            for (auto it = e.ledger.rbegin(); it != e.ledger.rend(); ++it) {
                ImGui::TableNextRow();
                ImGui::TableNextColumn(); ImGui::Text("%d", it->day + 1);
                ImGui::TableNextColumn(); ImGui::TextUnformatted(ledgerName(it->cat));
                ImGui::TableNextColumn();
                ImGui::TextColored(it->amount >= 0 ? ImVec4(0.5f, 0.9f, 0.5f, 1) : ImVec4(0.95f, 0.7f, 0.65f, 1), "%s", money(it->amount).c_str());
                ImGui::TableNextColumn(); ImGui::TextUnformatted(it->memo.c_str());
            }
            ImGui::EndTable();
        }
    }
}

void ComputerUI::drawRatings(Sim& sim) {
    Ratings& r = sim.ratings;
    ImGui::Text("RATINGS");
    ImGui::Separator();
    float colW = ImGui::GetContentRegionAvail().x * 0.5f - 8.0f;
    ImGui::BeginChild("pub", ImVec2(colW, 0), ImGuiChildFlags_Borders);
    ImGui::TextColored(ImVec4(0.45f, 0.8f, 1.0f, 1), "PUBLIC RATING");
    ImGui::TextWrapped("What the public thinks of you. This one really matters: with a bad public rating nobody "
                       "will adopt or buy from you. With a good one you'll be packed and need to expand fast.");
    stars(r.publicRating);
    ratingBar("public", r.publicRating, ImVec4(0.3f, 0.6f, 0.95f, 1));
    ImGui::Text("%s", Ratings::publicLabel(r.publicRating));
    ImGui::Text("Heading toward: %.0f", r.publicTarget());
    if (!r.publicHistory.empty())
        ImGui::PlotLines("##ph", r.publicHistory.data(), int(r.publicHistory.size()), 0, "history", 0.0f, 100.0f, ImVec2(-1, 70));
    ImGui::Text("Visitor demand: x%.2f", Ratings::demandMultiplier(r.publicRating));
    ImGui::Text("Visitors yesterday: %d / capacity %d", sim.visitorsYesterday, sim.visitorCapacityPerDay());
    if (sim.turnedAwayYesterday > 0) ImGui::TextColored(ImVec4(1, 0.7f, 0.3f, 1), "Turned away: %d. Expand!", sim.turnedAwayYesterday);
    factorTable("pubf", r.publicFactors);
    ImGui::EndChild();
    ImGui::SameLine();
    ImGui::BeginChild("priv", ImVec2(0, 0), ImGuiChildFlags_Borders);
    ImGui::TextColored(ImVec4(0.8f, 0.6f, 1.0f, 1), "PRIVATE RATING");
    ImGui::TextWrapped("How the people around you (staff, neighbors, the local community) privately think of you. "
                       "It affects staff morale, who quits, and the quality of people who apply.");
    stars(r.privateRating);
    ratingBar("private", r.privateRating, ImVec4(0.6f, 0.4f, 0.9f, 1));
    ImGui::Text("%s", Ratings::privateLabel(r.privateRating));
    ImGui::Text("Heading toward: %.0f", r.privateTarget());
    if (!r.privateHistory.empty())
        ImGui::PlotLines("##qh", r.privateHistory.data(), int(r.privateHistory.size()), 0, "history", 0.0f, 100.0f, ImVec2(-1, 70));
    factorTable("privf", r.privateFactors);
    if (r.privateFactors.empty()) ImGui::TextDisabled("Factors appear after your first full day.");
    ImGui::EndChild();
}

}  // namespace ps
