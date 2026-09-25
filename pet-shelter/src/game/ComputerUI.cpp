#include "game/ComputerUI.h"
#include "game/CharacterModel.h"
#include "game/People.h"
#include "world/Layout.h"
#include <imgui.h>
#include <algorithm>
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
    previewTarget_ = r.createTarget(480, 360);
    MeshBuilder gb;
    gb.addCylinder({0, -0.05f, 0}, 3.0f, 0.05f, 48, Material::make({0.34f, 0.36f, 0.34f}, 0.85f));
    previewGround_.upload(gb);
}

void ComputerUI::renderPreview(Renderer& r, const Sim& sim, float dt, float time) {
    previewReady_ = false;
    if (!open || tab != TabAnimals) return;
    const Animal* a = sim.findAnimal(selectedAnimal_);
    if (!a) return;
    const Species& sp = speciesCatalog()[size_t(a->species)];
    if (!preview_ || preview_->animalId != a->id) {
        preview_ = std::make_unique<Preview>();
        preview_->animalId = a->id;
        AnimalIndividual ind;
        ind.species = a->species; ind.male = a->male; ind.age = a->ageFraction(sp); ind.coat = a->coat;
        ind.seed = a->seed; ind.weightFactor = a->weightFactor;
        preview_->build = buildAnimal(sp, ind);
        preview_->mesh.upload(preview_->build.mesh);
        preview_->anim.init(preview_->build.rig, sp, a->seed);
        previewAction_ = 0;
    }
    Preview& P = *preview_;
    auto acts = availableActions(sp);
    AnimAction want = acts.empty() ? AnimAction::Idle : acts[size_t(std::clamp(previewAction_, 0, int(acts.size()) - 1))];
    if (P.anim.action() != want) P.anim.play(want, 0.3f);
    else if (P.anim.finished()) { P.anim.play(AnimAction::Idle, 0.05f); P.anim.play(want, 0.3f); }
    P.anim.update(dt);
    P.yaw += dt * 0.35f;
    // A little stage far above the property so nothing else is in the shot
    const vec3 stage{0.0f, 900.0f, 0.0f};
    const AABB& b = P.build.bounds;
    float size = std::max({b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z});
    CoatUniforms coat = P.build.coat;
    if (a->bleeding > 0.02f)
        coat.wound = vec4(P.build.bounds.max.x * 0.92f, P.build.rig.shoulderH * 0.72f, P.build.rig.bodyLen * 0.25f, P.build.rig.bodyLen * (0.08f + 0.15f * a->bleeding)),
        coat.wet = a->bleeding;
    auto scene = [&](Renderer& rr, Pass p) {
        if (p == Pass::Transparent) return;
        rr.draw(previewGround_, mat4::translate(stage) * mat4::scale(vec3(std::max(size, 0.3f) * 0.6f, 1.0f, std::max(size, 0.3f) * 0.6f)));
        const auto& sk = P.anim.skin();
        rr.drawSkinned(P.mesh, sk.data(), int(sk.size()), mat4::translate(stage) * mat4::rotateY(P.yaw), coat, p == Pass::Opaque ? rr.furShells : 0, 1.0f);
    };
    Camera cam;
    cam.fovY = radians(32.0f);
    cam.aspect = 480.0f / 360.0f;
    cam.zNear = 0.02f;
    cam.zFar = 400.0f;
    vec3 c = stage + vec3(0, (b.max.y) * 0.45f, 0);
    float dist = size * 0.5f / std::tan(cam.fovY * 0.5f) * 1.25f + 0.1f;
    cam.lookAt(c + normalize(vec3(0.9f, 0.35f, 0.8f)) * dist, c);
    r.renderToTarget(cam, scene, previewTarget_, time, false);
    previewReady_ = true;
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
    float fs = sim.financialScore();
    if (!compact) {
        ImGui::SameLine();
        ImGui::Text("   Financial rating: %s", Economy::grade(fs));
    }
    ImGui::SameLine(ImGui::GetWindowWidth() - (compact ? 175.0f : 150.0f));
    if (ImGui::Button("Log off  [Esc]", ImVec2(130, 0))) keepOpen = false;
    ImGui::Separator();

    // Sidebar tabs
    ImGui::BeginChild("tabs", ImVec2(compact ? 150.0f : 240.0f, 0), ImGuiChildFlags_Borders);
    std::string inboxName = "Inbox (" + std::to_string(sim.decisions.size()) + ")";
    const char* names[] = {inboxName.c_str(), "Animals", "Staff", "Recruit", "Store", "Security", "Finances", "Ratings"};
    const char* hints[] = {"Decisions waiting for you", "Every animal in your care", "Your team, wellbeing, one-on-ones",
                           "40 people looking for work", "Buy land, supplies & equipment", "Cameras, gate & locks", "Taxes, income, payroll",
                           "Private & public opinion"};
    for (int i = 0; i < TabCount; ++i) {
        if (ImGui::Selectable(names[i], tab == i, 0, ImVec2(0, 34))) tab = i;
        if (!compact) { ImGui::TextDisabled("  %s", hints[i]); ImGui::Spacing(); }
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
    case TabInbox: drawInbox(sim); break;
    case TabAnimals: drawAnimals(sim); break;
    case TabStaff: drawStaff(sim); break;
    case TabRecruit: drawRecruit(sim); break;
    case TabStore: drawStore(sim); break;
    case TabSecurity: drawSecurity(sim, facility); break;
    case TabFinances: drawFinances(sim); break;
    case TabRatings: drawRatings(sim); break;
    }
    ImGui::EndChild();
    ImGui::End();
    ImGui::PopStyleColor();
    return keepOpen;
}

void ComputerUI::drawInbox(Sim& sim) {
    ImGui::Text("INBOX");
    ImGui::Separator();
    if (sim.decisions.empty()) ImGui::TextDisabled("Nothing needs your decision right now.");
    int resolveId = -1, resolveChoice = -1;
    for (const Decision& d : sim.decisions) {
        ImGui::PushID(d.id);
        ImGui::TextColored(d.urgent ? ImVec4(1, 0.45f, 0.35f, 1) : ImVec4(1, 0.85f, 0.4f, 1), "%s", d.title.c_str());
        ImGui::TextWrapped("%s", d.text.c_str());
        if (d.expires > 0.0) {
            int mins = std::max(0, int(d.expires - sim.clock.minutes));
            ImGui::TextDisabled("Answer within %dh %02dm", mins / 60, mins % 60);
        }
        for (size_t k = 0; k < d.choices.size(); ++k) {
            ImGui::PushID(int(k));
            if (ImGui::Button(d.choices[k].c_str())) { resolveId = d.id; resolveChoice = int(k); }
            ImGui::PopID();
        }
        ImGui::Separator();
        ImGui::PopID();
    }
    if (resolveId >= 0) sim.resolve(resolveId, resolveChoice);
    ImGui::SeparatorText("Recent events");
    int n = 0;
    for (auto it = sim.events.rbegin(); it != sim.events.rend() && n < 40; ++it, ++n)
        ImGui::TextWrapped("Day %d: %s", it->day + 1, it->text.c_str());
}

namespace {
void bar(const char* label, float v, ImVec4 col, float w = 120.0f) {
    ImGui::PushStyleColor(ImGuiCol_PlotHistogram, col);
    ImGui::ProgressBar(clampf(v, 0.0f, 1.0f), ImVec2(w, 0), label);
    ImGui::PopStyleColor();
}
ImVec4 goodBad(float v) { return v > 0.66f ? ImVec4(0.3f, 0.75f, 0.35f, 1) : (v > 0.33f ? ImVec4(0.85f, 0.7f, 0.2f, 1) : ImVec4(0.85f, 0.25f, 0.2f, 1)); }
}  // namespace

void ComputerUI::drawAnimals(Sim& sim) {
    ImGui::Text("ANIMALS");
    ImGui::SameLine();
    ImGui::TextDisabled("  %d in care  |  %d adopted  |  %d died  |  %d taken in", sim.animalsInCare(), sim.adoptionsTotal,
                        sim.deathsTotal, sim.intakeTotal);
    ImGui::Separator();
    // Housing & unlocks
    if (ImGui::CollapsingHeader("Housing & equipment", ImGuiTreeNodeFlags_DefaultOpen)) {
        const BuildKind kinds[] = {BuildKind::ContainerShelter, BuildKind::KennelBlock, BuildKind::CatHouse, BuildKind::SmallAnimalHouse,
                                   BuildKind::Barn, BuildKind::FeralEnclosure, BuildKind::SecureEnclosure};
        if (ImGui::BeginTable("housing", compact ? 2 : 3, ImGuiTableFlags_SizingStretchSame)) {
            for (BuildKind k : kinds) {
                ImGui::TableNextColumn();
                int used = sim.housingUsed(k), cap = sim.housingCapacity(k);
                ImVec4 col = cap == 0 ? ImVec4(0.55f, 0.55f, 0.55f, 1) : (used >= cap ? ImVec4(1, 0.5f, 0.3f, 1) : ImVec4(0.8f, 0.9f, 0.8f, 1));
                ImGui::TextColored(col, "%s: %d / %d", buildInfo(k).name, used, cap);
            }
            ImGui::EndTable();
        }
        int crates = 0;
        for (auto& a : sim.animalList) crates += (a.inCare() && a.housing < 0) ? 1 : 0;
        ImGui::Text("Medical room crates: %d / 4", crates);
        ImGui::SameLine();
        ImGui::Text("   Surgery Wing: %s", sim.hasSurgeryWing() ? "built" : "not built (needed for feral & large animals)");
        if (sim.protectiveGear) ImGui::TextColored(ImVec4(0.4f, 0.9f, 0.5f, 1), "Protective gear: issued to all staff");
        else {
            ImGui::TextColored(ImVec4(1, 0.6f, 0.3f, 1), "Protective gear: none - staff get hurt handling feral animals.");
            ImGui::SameLine();
            if (ImGui::Button("Buy protective gear ($4,500)")) sim.buyProtectiveGear();
        }
    }
    const char* filters[] = {"All", "Needs care", "Up for adoption", "Wild & dangerous", "Client patients"};
    for (int i = 0; i < 5; ++i) {
        if (i) ImGui::SameLine();
        if (ImGui::RadioButton(filters[i], animalFilter_ == i)) animalFilter_ = i;
    }
    const auto& cat = speciesCatalog();
    float listW = compact ? ImGui::GetContentRegionAvail().x * 0.45f : ImGui::GetContentRegionAvail().x * 0.5f;
    ImGui::BeginChild("alist", ImVec2(listW, 0), ImGuiChildFlags_Borders);
    if (ImGui::BeginTable("animals", compact ? 3 : 5, ImGuiTableFlags_RowBg | ImGuiTableFlags_ScrollY)) {
        ImGui::TableSetupColumn("Name");
        ImGui::TableSetupColumn("Species");
        if (!compact) { ImGui::TableSetupColumn("Class"); ImGui::TableSetupColumn("Age"); }
        ImGui::TableSetupColumn("Status");
        ImGui::TableHeadersRow();
        for (const Animal& a : sim.animalList) {
            if (!a.inCare()) continue;
            const Species& sp = cat[size_t(a.species)];
            bool wild = sp.cls == AnimalClass::Feral || sp.cls == AnimalClass::Restricted;
            if (animalFilter_ == 1 && a.status == AnimalStatus::Healthy && a.hunger < 0.7f) continue;
            if (animalFilter_ == 2 && (wild || a.owned || a.status != AnimalStatus::Healthy)) continue;
            if (animalFilter_ == 3 && !wild) continue;
            if (animalFilter_ == 4 && !a.owned) continue;
            ImGui::PushID(a.id);
            ImGui::TableNextRow();
            ImGui::TableNextColumn();
            if (ImGui::Selectable(a.name.c_str(), selectedAnimal_ == a.id, ImGuiSelectableFlags_SpanAllColumns)) selectedAnimal_ = a.id;
            ImGui::TableNextColumn(); ImGui::TextUnformatted(sp.name.c_str());
            if (!compact) {
                ImGui::TableNextColumn(); ImGui::TextUnformatted(className(sp.cls));
                ImGui::TableNextColumn();
                if (a.isBaby(sp)) ImGui::TextColored(ImVec4(1, 0.8f, 0.5f, 1), "baby");
                else ImGui::Text("%.1f y", double(a.ageYears));
            }
            ImGui::TableNextColumn();
            ImVec4 sc = a.status == AnimalStatus::Healthy ? ImVec4(0.5f, 0.9f, 0.5f, 1)
                      : (a.status == AnimalStatus::Critical ? ImVec4(1, 0.3f, 0.25f, 1) : ImVec4(1, 0.75f, 0.3f, 1));
            ImGui::TextColored(sc, "%s%s", statusName(a.status), a.needsSurgery ? " +surgery" : "");
            ImGui::PopID();
        }
        ImGui::EndTable();
    }
    ImGui::EndChild();
    ImGui::SameLine();
    ImGui::BeginChild("adetail", ImVec2(0, 0), ImGuiChildFlags_Borders);
    Animal* a = sim.findAnimal(selectedAnimal_);
    if (!a || !a->inCare()) {
        ImGui::TextWrapped("Select an animal to see its record, a live 3D view and every behavior it can do.");
        ImGui::EndChild();
        return;
    }
    const Species& sp = cat[size_t(a->species)];
    float w = ImGui::GetContentRegionAvail().x;
    if (previewReady_) ImGui::Image((ImTextureID)(intptr_t)previewTarget_.ldrTex, ImVec2(w, w * 0.75f), ImVec2(0, 1), ImVec2(1, 0));
    else ImGui::Dummy(ImVec2(w, w * 0.75f));
    auto acts = availableActions(sp);
    if (!acts.empty()) {
        previewAction_ = std::clamp(previewAction_, 0, int(acts.size()) - 1);
        ImGui::SetNextItemWidth(w * 0.6f);
        if (ImGui::BeginCombo("Behavior", actionName(acts[size_t(previewAction_)]))) {
            for (size_t i = 0; i < acts.size(); ++i)
                if (ImGui::Selectable(actionName(acts[i]), int(i) == previewAction_)) previewAction_ = int(i);
            ImGui::EndCombo();
        }
        ImGui::SameLine();
        ImGui::TextDisabled("%d behaviors", int(acts.size()));
    }
    ImGui::TextColored(ImVec4(0.6f, 0.85f, 1, 1), "%s", a->name.c_str());
    ImGui::SameLine();
    ImGui::Text("- %s %s, %s", a->male ? "male" : "female", sp.name.c_str(), a->isBaby(sp) ? "baby" : "adult");
    ImGui::TextDisabled("%s  |  %s  |  %s", sp.scientific.c_str(), className(sp.cls), sp.category.c_str());
    const std::string coatName = sp.coats.empty() ? "" : sp.coats[size_t(a->coat) % sp.coats.size()].name;
    ImGui::Text("Coat: %s   Age: %.1f y   Weight: %.1f kg", coatName.c_str(), double(a->ageYears), double(a->weightKg(sp)));
    ImGui::Text("From: %s (day %d)", a->origin.c_str(), a->arrivedDay + 1);
    if (a->owned) ImGui::Text("Owner: %s  |  consent: %s", a->ownerName.c_str(), a->ownerConsented ? "yes" : "NO");
    ImGui::TextWrapped("Rule: %s", classRule(sp.cls));
    ImGui::TextWrapped("Did you know? %s", sp.fact.c_str());
    ImGui::TextDisabled("Diet: %s  |  Lifespan ~%d y  |  Temperament %s", sp.diet.c_str(), sp.lifespanYears,
                        sp.temperament > 0.7f ? "dangerous" : (sp.temperament > 0.4f ? "wary" : "gentle"));
    ImGui::Separator();
    ImGui::Text("Status: %s%s", statusName(a->status), a->condition.empty() ? "" : (" - " + a->condition).c_str());
    bar("health", a->health, goodBad(a->health)); ImGui::SameLine();
    bar("fed", 1.0f - a->hunger, goodBad(1.0f - a->hunger)); ImGui::SameLine();
    bar("calm", 1.0f - a->stress, goodBad(1.0f - a->stress));
    bar("happy", a->happiness, goodBad(a->happiness)); ImGui::SameLine();
    bar("clean", a->cleanliness, goodBad(a->cleanliness));
    if (a->bleeding > 0.02f) ImGui::TextColored(ImVec4(1, 0.25f, 0.2f, 1), "BLEEDING (%.0f%%)", double(a->bleeding * 100.0f));
    bar("water", a->water, goodBad(a->water)); ImGui::SameLine();
    ImGui::TextColored(a->checkedDay == sim.clock.day() ? ImVec4(0.5f, 0.9f, 0.5f, 1) : ImVec4(1, 0.6f, 0.3f, 1), "%s",
                       a->checkedDay == sim.clock.day() ? "You checked on it today" : "Not checked today - go see it in person");
    if (a->diagnosed && a->hidden != Hidden::None) ImGui::TextColored(ImVec4(1, 0.7f, 0.3f, 1), "Diagnosed: %s", hiddenName(a->hidden));
    ImGui::TextDisabled("Eats: %s (favorite)", foodName(foodsFor(sp, a->isBaby(sp))[0]));
    ImGui::Text("%s  %s  %s", a->vaccinated ? "[vaccinated]" : "[not vaccinated]", a->fixed ? "[spayed/neutered]" : "[intact]",
                a->microchipped ? "[chipped]" : "");
    ImGui::Separator();
    bool wild = sp.cls == AnimalClass::Feral || sp.cls == AnimalClass::Restricted;
    if (ImGui::Button("Treat / vaccinate")) sim.treat(a->id);
    if (a->needsSurgery) {
        ImGui::SameLine();
        ImGui::TextColored(ImVec4(1, 0.7f, 0.3f, 1), "Needs surgery - go to the operating table in the medical room.");
    }
    if (a->owned && !a->ownerConsented) {
        if (ImGui::Button("Call the owner (explain & ask consent)")) { a->ownerConsented = true; sim.ratings.shock(0.3f, 0.0f); }
    }
    if (!wild && !a->owned && a->status == AnimalStatus::Healthy) {
        char lbl[64];
        std::snprintf(lbl, sizeof lbl, "Adopt out to a waiting family ($%.0f fee)", double(sp.adoptionFee));
        if (ImGui::Button(lbl)) { sim.adopt(a->id); selectedAnimal_ = -1; }
    }
    if (sp.cls == AnimalClass::Feral && a->status == AnimalStatus::Healthy && !a->isBaby(sp)) {
        if (ImGui::Button("Release back into the wild")) {
            a->status = AnimalStatus::Released;
            sim.ratings.shock(1.2f, 0.6f);
            sim.log(a->name + " the " + sp.name + " was released back into the wild.");
        }
    }
    ImGui::EndChild();
}

void ComputerUI::renderPortraits(Renderer& r, float time) {
    int budget = 2;   // build a couple of faces per frame
    for (int pid : wantPortraits_) {
        if (portraits_.count(pid) || budget <= 0) continue;
        const Person* p = findPerson(pid);
        if (!p) continue;
        --budget;
        CharacterModel cm;
        cm.build(p->looks);
        cm.animate(1.0f, 0.0f, 0.0f);
        const vec3 stage{40.0f, 1200.0f, 0.0f};
        auto scene = [&](Renderer& rr, Pass pass) {
            if (pass == Pass::Transparent) return;
            cm.draw(rr, mat4::translate(stage));
        };
        Camera cam;
        cam.fovY = radians(24.0f);
        cam.aspect = 1.0f;
        cam.zNear = 0.05f;
        cam.zFar = 50.0f;
        float eye = cm.eyeHeight();
        vec3 head = stage + vec3(0, eye - 0.02f, 0);
        cam.lookAt(head + vec3(0.25f, 0.05f, 1.05f), head);
        Renderer::Target t = r.createTarget(160, 160);
        r.renderToTarget(cam, scene, t, time, false);
        portraits_[pid] = t;
    }
    wantPortraits_.clear();
}

bool ComputerUI::faceCard(int personId, const std::string& name, const std::string& sub, bool selected, bool dim) {
    const float S = compact ? 96.0f : 120.0f;
    ImGui::PushID(personId);
    ImVec2 p0 = ImGui::GetCursorScreenPos();
    bool clicked = ImGui::InvisibleButton("card", ImVec2(S, S + 34));
    ImDrawList* dl = ImGui::GetWindowDrawList();
    // A transparent square with the face
    dl->AddRectFilled(p0, ImVec2(p0.x + S, p0.y + S + 34), selected ? IM_COL32(90, 150, 220, 90) : IM_COL32(255, 255, 255, ImGui::IsItemHovered() ? 40 : 22), 8.0f);
    dl->AddRect(p0, ImVec2(p0.x + S, p0.y + S + 34), selected ? IM_COL32(120, 190, 255, 220) : IM_COL32(255, 255, 255, 60), 8.0f, 0, selected ? 2.0f : 1.0f);
    auto it = portraits_.find(personId);
    if (it != portraits_.end())
        dl->AddImageRounded((ImTextureID)(intptr_t)it->second.ldrTex, ImVec2(p0.x + 6, p0.y + 6), ImVec2(p0.x + S - 6, p0.y + S - 6), ImVec2(0, 1), ImVec2(1, 0),
                            dim ? IM_COL32(255, 255, 255, 110) : IM_COL32(255, 255, 255, 235), 6.0f);
    else wantPortraits_.push_back(personId);
    dl->AddText(ImVec2(p0.x + 6, p0.y + S - 2), IM_COL32(235, 240, 245, 255), name.c_str());
    dl->AddText(ImVec2(p0.x + 6, p0.y + S + 14), IM_COL32(160, 175, 190, 255), sub.c_str());
    ImGui::PopID();
    return clicked;
}

void ComputerUI::personDetails(int personId) {
    const Person* p = findPerson(personId);
    if (!p) return;
    ImGui::TextColored(ImVec4(0.6f, 0.85f, 1, 1), "%s", p->name.c_str());
    ImGui::SameLine();
    ImGui::TextDisabled("%s, %d  |  %s", p->gender == Gender::Female ? "woman" : "man", p->age, roleInfo(p->role).name);
    ImGui::TextWrapped("%s", p->bio.c_str());
    ImGui::TextDisabled("Experience:");
    ImGui::SameLine();
    ImGui::TextWrapped("%s", p->experience.c_str());
    if (p->badHistory.empty()) ImGui::TextColored(ImVec4(0.5f, 0.85f, 0.5f, 1), "Background check: clean.");
    else ImGui::TextColored(ImVec4(1, 0.55f, 0.35f, 1), "Background check: %s", p->badHistory.c_str());
    bar("skill", p->skill, goodBad(p->skill), 160);
}

void ComputerUI::drawRecruit(Sim& sim) {
    StaffRoster& st = sim.staff;
    int cap = sim.officeCapacity();
    ImGui::Text("RECRUIT");
    ImGui::SameLine();
    ImGui::TextDisabled("  Team %d / %d offices. Everyone needs their own office - build Staff Offices to grow.", int(st.employees.size()), cap);
    ImGui::Separator();
    if (st.applicants.empty()) ImGui::TextDisabled("Nobody is looking for work right now.");
    float listH = ImGui::GetContentRegionAvail().y * 0.6f;
    ImGui::BeginChild("pool", ImVec2(0, listH), ImGuiChildFlags_Borders);
    float x = 0.0f, avail = ImGui::GetContentRegionAvail().x;
    const float S = (compact ? 96.0f : 120.0f) + 8.0f;
    for (const Employee& a : st.applicants) {
        if (x > 0.0f && x + S <= avail) ImGui::SameLine();
        else x = 0.0f;
        if (faceCard(a.personId, a.name, roleInfo(a.role).name, selectedRecruit_ == a.personId, false)) selectedRecruit_ = a.personId;
        x += S;
    }
    ImGui::EndChild();
    const Employee* pick = nullptr;
    for (const Employee& a : st.applicants) if (a.personId == selectedRecruit_) pick = &a;
    if (!pick) { ImGui::TextDisabled("Click a face to see their bio, work history and background check."); return; }
    personDetails(pick->personId);
    ImGui::Text("Asking $%.2f/hr (market $%.2f)", double(pick->hourlyWage), double(roleInfo(pick->role).marketWage));
    bool full = int(st.employees.size()) >= cap;
    if (full) ImGui::TextColored(ImVec4(1, 0.6f, 0.3f, 1), "No free office - build Staff Offices first.");
    if (full) ImGui::BeginDisabled();
    if (ImGui::Button("Hire", ImVec2(160, 34))) {
        std::string why;
        if (!sim.hire(pick->id, &why)) sim.log(why);
        selectedRecruit_ = -1;
    }
    if (full) ImGui::EndDisabled();
}

void ComputerUI::drawStore(Sim& sim) {
    ImGui::Text("STORE");
    ImGui::Separator();
    const char* sub[] = {"Land", "Equipment", "Food & supplies"};
    for (int i = 0; i < 3; ++i) {
        if (i) ImGui::SameLine();
        if (ImGui::RadioButton(sub[i], storeTab_ == i)) storeTab_ = i;
    }
    ImGui::Separator();
    if (storeTab_ == 2) {
        ImGui::TextWrapped("Orders arrive tomorrow at 8 AM. Every species eats what it really eats - check an animal to see what it likes. "
                           "Or drive to the pet store for same-day supplies.");
        // What your animals need per day
        float need[size_t(FoodKind::Count)] = {};
        for (const Animal& a : sim.animalList) {
            if (!a.inCare()) continue;
            const Species& sp = speciesCatalog()[size_t(a.species)];
            need[size_t(foodsFor(sp, a.isBaby(sp))[0])] += dailyFoodKg(a, sp);
        }
        if (ImGui::BeginTable("food", 5, ImGuiTableFlags_RowBg | ImGuiTableFlags_Borders)) {
            for (const char* h : {"Food", "On hand", "Your animals use/day", "Price", "Order"}) ImGui::TableSetupColumn(h);
            ImGui::TableHeadersRow();
            for (int i = 0; i < int(FoodKind::Count); ++i) {
                FoodKind f = FoodKind(i);
                ImGui::PushID(i);
                ImGui::TableNextRow();
                ImGui::TableNextColumn(); ImGui::TextUnformatted(foodName(f));
                ImGui::TableNextColumn();
                bool low = need[i] > 0.0f && sim.food[i] < need[i] * 2.0f;
                ImGui::TextColored(low ? ImVec4(1, 0.5f, 0.3f, 1) : ImVec4(0.85f, 0.9f, 0.85f, 1), "%.1f kg%s", double(sim.food[i]),
                                   sim.foodOrdered[i] > 0.0f ? " (+ordered)" : "");
                ImGui::TableNextColumn(); ImGui::Text("%.2f kg", double(need[i]));
                ImGui::TableNextColumn(); ImGui::Text("$%.2f/kg", double(foodPricePerKg(f)));
                ImGui::TableNextColumn();
                for (float kg : {5.0f, 25.0f, 100.0f}) {
                    char b[32];
                    std::snprintf(b, sizeof b, "%.0f kg", double(kg));
                    if (ImGui::SmallButton(b)) sim.orderFood(f, kg);
                    ImGui::SameLine();
                }
                ImGui::NewLine();
                ImGui::PopID();
            }
            ImGui::EndTable();
        }
        return;
    }
    if (storeTab_ == 1) {
        ImGui::TextWrapped("Protective gear: bite sleeves, catch poles, face shields and Kevlar gloves for every employee. "
                           "Needed to handle feral animals without people getting hurt.");
        if (sim.protectiveGear) ImGui::TextColored(ImVec4(0.4f, 0.9f, 0.5f, 1), "Owned.");
        else if (ImGui::Button("Buy protective gear ($4,500)")) sim.buyProtectiveGear();
        return;
    }
    Land& L = sim.land;
    ImGui::Text("You own %.2f sq mi of 500.  Parcels: %d.", double(L.ownedSqMi()), L.parcelsOwned());
    ImGui::TextWrapped(L.homeOwned() ? "Buy any square mile next to land you own. The fence moves out around your new land automatically."
                                     : "You're on a small fenced workspace. Buy the square mile around your shelter to start expanding.");
    // Map: north is up. Row 0 is the south edge (the highway side).
    float avail = std::min(ImGui::GetContentRegionAvail().x, ImGui::GetContentRegionAvail().y - 60.0f);
    float cell = std::floor(std::max(10.0f, avail / float(Land::kCols)));
    ImVec2 o = ImGui::GetCursorScreenPos();
    ImDrawList* dl = ImGui::GetWindowDrawList();
    ImGuiIO& io = ImGui::GetIO();
    int hover = -1;
    for (int r = 0; r < Land::kRows; ++r)
        for (int c = 0; c < Land::kCols; ++c) {
            float a = L.cellSqMi(c, r);
            if (a <= 0.001f) continue;
            ImVec2 p0(o.x + float(c) * cell, o.y + float(Land::kRows - 1 - r) * cell);
            ImVec2 p1(p0.x + cell * std::min(1.0f, a / std::max(0.01f, a)) - 1.0f, p0.y + cell - 1.0f);
            ImU32 col = L.owned(c, r) ? IM_COL32(60, 150, 70, 255) : (L.canBuy(c, r) ? IM_COL32(150, 130, 50, 255) : IM_COL32(45, 55, 50, 255));
            dl->AddRectFilled(p0, p1, col);
            if (io.MousePos.x >= p0.x && io.MousePos.x < p1.x && io.MousePos.y >= p0.y && io.MousePos.y < p1.y) hover = r * Land::kCols + c;
            if (landPick_ == r * Land::kCols + c) dl->AddRect(p0, p1, IM_COL32(255, 255, 255, 255), 0, 0, 2.0f);
        }
    // Shelter marker and the highway along the south
    ImVec2 home(o.x + (float(Land::kHomeCol) + 0.5f) * cell, o.y + (float(Land::kRows) - 0.25f) * cell);
    dl->AddCircleFilled(home, std::max(3.0f, cell * 0.18f), IM_COL32(230, 60, 50, 255));
    dl->AddLine(ImVec2(o.x, o.y + float(Land::kRows) * cell + 3), ImVec2(o.x + float(Land::kCols) * cell, o.y + float(Land::kRows) * cell + 3),
                IM_COL32(200, 200, 200, 200), 3.0f);
    ImGui::InvisibleButton("landmap", ImVec2(float(Land::kCols) * cell, float(Land::kRows) * cell + 8));
    if (ImGui::IsItemClicked() && hover >= 0) landPick_ = hover;
    if (hover >= 0) {
        int c = hover % Land::kCols, r = hover / Land::kCols;
        ImGui::SetTooltip("Parcel %c%d  |  %.2f sq mi  |  %s", 'A' + c, r + 1, double(L.cellSqMi(c, r)),
                          L.owned(c, r) ? "yours" : (L.canBuy(c, r) ? ("$" + std::to_string(long(L.price(c, r)))).c_str() : "not adjacent yet"));
    }
    ImGui::TextDisabled("Red dot = your shelter. The line at the bottom is the highway.");
    if (landPick_ >= 0) {
        int c = landPick_ % Land::kCols, r = landPick_ / Land::kCols;
        if (L.canBuy(c, r)) {
            char lbl[96];
            std::snprintf(lbl, sizeof lbl, "Buy parcel %c%d (%.2f sq mi) for $%s", 'A' + c, r + 1, double(L.cellSqMi(c, r)),
                          std::to_string(long(L.price(c, r))).c_str());
            if (ImGui::Button(lbl)) {
                std::string why;
                if (!sim.buyLand(c, r, &why)) sim.log(why);
                landPick_ = -1;
            }
        } else {
            ImGui::TextDisabled(L.owned(c, r) ? "You already own this parcel." : "Buy land next to it first.");
        }
    }
}

void ComputerUI::drawStaff(Sim& sim) {
    ImGui::Text("STAFF WELLBEING");
    ImGui::SameLine();
    ImGui::TextDisabled("  Private rating %.0f - staff talk. Rest, fair pay and being there for them keeps it up.", double(sim.ratings.privateRating));
    ImGui::Separator();
    StaffRoster& st = sim.staff;
    const int day = sim.clock.day();
    ImGui::Text("Your team: %d / %d offices", int(st.employees.size()), sim.officeCapacity());
    {
        float x = 0.0f, avail = ImGui::GetContentRegionAvail().x;
        const float S = (compact ? 96.0f : 120.0f) + 8.0f;
        for (const Employee& emp : st.employees) {
            if (x > 0.0f && x + S <= avail) ImGui::SameLine();
            else x = 0.0f;
            std::string sub = roleInfo(emp.role).name;
            if (emp.onVacation(day)) sub = "on leave";
            if (faceCard(emp.personId, emp.name, sub, selectedStaff_ == emp.id, emp.onVacation(day))) selectedStaff_ = emp.id;
            x += S;
        }
    }
    if (ImGui::BeginTable("wb", compact ? 5 : 9, ImGuiTableFlags_RowBg | ImGuiTableFlags_Borders)) {
        ImGui::TableSetupColumn("Name");
        if (!compact) ImGui::TableSetupColumn("Role");
        ImGui::TableSetupColumn("Rested");
        ImGui::TableSetupColumn("Calm");
        if (!compact) { ImGui::TableSetupColumn("Morale"); ImGui::TableSetupColumn("Trust"); }
        ImGui::TableSetupColumn("Days off/wk");
        if (!compact) ImGui::TableSetupColumn("1-on-1");
        ImGui::TableSetupColumn("Now");
        ImGui::TableHeadersRow();
        for (auto& e : st.employees) {
            ImGui::PushID(e.id);
            ImGui::TableNextRow();
            ImGui::TableNextColumn();
            if (ImGui::Selectable(e.name.c_str(), selectedStaff_ == e.id, ImGuiSelectableFlags_SpanAllColumns | ImGuiSelectableFlags_AllowOverlap))
                selectedStaff_ = e.id;
            if (!compact) { ImGui::TableNextColumn(); ImGui::TextUnformatted(roleInfo(e.role).name); }
            ImGui::TableNextColumn(); bar("", 1.0f - e.fatigue, goodBad(1.0f - e.fatigue), 70);
            ImGui::TableNextColumn(); bar("", 1.0f - e.stress, goodBad(1.0f - e.stress), 70);
            if (!compact) {
                ImGui::TableNextColumn(); bar("", e.morale, goodBad(e.morale), 70);
                ImGui::TableNextColumn(); bar("", e.relationship, goodBad(e.relationship), 70);
            }
            ImGui::TableNextColumn();
            ImGui::SetNextItemWidth(80);
            int dof = e.daysOffPerWeek;
            if (ImGui::SliderInt("##dof", &dof, 0, 4)) sim.staffSetDaysOff(e.id, dof);
            if (!compact) {
                ImGui::TableNextColumn();
                int ago = day - e.lastInterviewDay;
                if (e.lastInterviewDay < -900) ImGui::TextColored(ImVec4(1, 0.6f, 0.3f, 1), "never");
                else ImGui::TextColored(ago > 30 ? ImVec4(1, 0.6f, 0.3f, 1) : ImVec4(0.7f, 0.9f, 0.7f, 1), "%dd ago", ago);
            }
            ImGui::TableNextColumn();
            if (e.onVacation(day)) ImGui::TextColored(ImVec4(0.5f, 0.8f, 1, 1), "off until day %d", e.vacationUntil + 1);
            else if (e.lifeEvent != LE_None) ImGui::TextColored(ImVec4(1, 0.6f, 0.4f, 1), "%s", lifeEventName(e.lifeEvent));
            else if (e.overworked()) ImGui::TextColored(ImVec4(1, 0.5f, 0.3f, 1), "overworked");
            else ImGui::TextDisabled("working");
            ImGui::PopID();
        }
        ImGui::EndTable();
    }
    Employee* e = st.find(selectedStaff_);
    ImGui::Spacing();
    if (!e) { ImGui::TextDisabled("Click someone's face (or name) to see their record, check in, give time off, or let them go."); return; }
    ImGui::SeparatorText(e->name.c_str());
    if (e->personId > 0) personDetails(e->personId);
    ImGui::SameLine(0, 30);
    if (ImGui::Button("Fire")) ImGui::OpenPopup("fire?");
    if (ImGui::BeginPopupModal("fire?", nullptr, ImGuiWindowFlags_AlwaysAutoResize)) {
        ImGui::Text("Let %s go?", e->name.c_str());
        ImGui::TextDisabled("Others will notice. They won't reapply for about 45 days.");
        if (ImGui::Button("Fire them")) {
            sim.log("You let " + e->name + " go.");
            st.fire(e->id, day);
            sim.ratings.shock(0.0f, -1.5f);
            for (auto& o : st.employees) o.morale = std::max(0.0f, o.morale - 0.03f);
            selectedStaff_ = -1;
            ImGui::CloseCurrentPopup();
            ImGui::EndPopup();
            return;
        }
        ImGui::SameLine();
        if (ImGui::Button("Cancel")) ImGui::CloseCurrentPopup();
        ImGui::EndPopup();
    }
    ImGui::Text("%s  |  $%.2f/hr (market $%.2f)  |  %.0f h/week  |  %d days with you", roleInfo(e->role).name, double(e->hourlyWage),
                double(roleInfo(e->role).marketWage), double(e->hoursPerWeek), e->daysEmployed);
    if (e->relationship > 0.6f) ImGui::TextWrapped("You know them well: %s, and %s.", e->family.c_str(), e->hobby.c_str());
    else ImGui::TextDisabled("You don't know them well yet. One-on-ones build trust.");
    if (e->lifeEvent != LE_None)
        ImGui::TextColored(ImVec4(1, 0.6f, 0.4f, 1), "Going through: %s%s", lifeEventName(e->lifeEvent), e->lifeEventSupported ? " (you helped)" : "");
    if (ImGui::Button("One-on-one check-in")) { sim.staffInterview(e->id); tab = TabInbox; }
    ImGui::SameLine();
    if (ImGui::Button("Give them tomorrow off")) sim.staffGiveDayOff(e->id);
    ImGui::SameLine();
    if (ImGui::Button("Paid vacation, on you ($1,500)")) sim.staffSendOnVacation(e->id, 7, true);
    if (ImGui::Button("Unpaid week off")) sim.staffSendOnVacation(e->id, 7, false);
    ImGui::SameLine();
    if (ImGui::Button("Gift $100")) sim.staffGift(e->id, 100, "Thank-you gift");
    ImGui::SameLine();
    if (ImGui::Button("Gift $500")) sim.staffGift(e->id, 500, "Bonus");
    ImGui::SameLine();
    if (ImGui::Button("Gift $1,000")) sim.staffGift(e->id, 1000, "Bonus");
    if (e->lifeEvent == LE_Injury || e->lifeEvent == LE_Illness) {
        if (ImGui::Button("Pay their medical bill ($1,900)")) {
            if (sim.staffGift(e->id, 1900, "Medical bill")) { e->lifeEventSupported = true; e->stress = std::max(0.0f, e->stress - 0.2f); }
        }
    }
    ImGui::TextDisabled("Tip: nobody should go without days off. Wages and hours are in Finances > Payroll.");
}

void ComputerUI::drawSecurity(Sim& sim, const Facility& facility) {
    SecuritySystem& sec = sim.security;
    ImGui::Text("SECURITY");
    ImGui::Separator();
    ImGui::BeginChild("cams", ImVec2(compact ? 170.0f : 260.0f, 0), ImGuiChildFlags_Borders);
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
    if (compact) ImGui::SameLine(0, 20); else ImGui::SameLine(200);
    ImGui::Text("Cash: %s", money(e.cash).c_str());
    if (compact) ImGui::SameLine(0, 20); else ImGui::SameLine(420);
    ImGui::Text("Financial rating: %s (%.0f/100)", Economy::grade(fs), fs);
    if (!compact) ImGui::SameLine(720);
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
            st.fire(fireId, sim.clock.day());
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
        if (hireId >= 0) { std::string why; if (!sim.hire(hireId, &why)) sim.log(why); }
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
