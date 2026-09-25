// Your red truck: walk up, open the door, get in, and drive. The road rules and
// traffic live in Driving; this file connects them to the game (controls,
// cameras, HUD, the pet store counter and unloading at home).
#include "game/Game.h"
#include "world/Layout.h"
#include <GLFW/glfw3.h>
#include <imgui.h>
#include <algorithm>
#include <cmath>
#include <cstdio>

namespace ps {
using namespace layout;

namespace {
// Distance along the ray to a sphere (or -1)
float raySphere(vec3 o, vec3 d, vec3 c, float r) {
    vec3 oc = c - o;
    float t = dot(oc, d);
    if (t < 0.0f) return -1.0f;
    vec3 closest = o + d * t;
    return length(closest - c) <= r ? t : -1.0f;
}
const vec3 kStoreDoor{kPetStoreX, 0.0f, kPetStoreZ - 8.0f};
bool storeOpen(float hour) { return hour >= 7.0f && hour < 21.0f; }
}  // namespace

void Game::initDriving() {
    truckModel_.build({0.55f, 0.10f, 0.08f});
    roads_.build();
    world_.facility.drawCar = false;
    // The pet store is solid
    world_.collision.addBox(AABB({kPetStoreX - 20.0f, 0.0f, kPetStoreZ - 7.8f}, {kPetStoreX + 20.0f, 5.4f, kPetStoreZ + 10.0f}));
    resetTruck();
}

void Game::resetTruck() {
    truck_ = Truck();
    truck_.pos = Facility::parkedCarPos();
    truck_.yaw = kPi;
    inTruck_ = false;
    world_.facility.setCarCollider(world_.collision, truck_.pos, truck_.yaw);
}

void Game::pickTruck(vec3 eye, vec3 fwd) {
    truckHover_ = 0;
    mat4 xf = truck_.transform();
    float best = 2.6f;
    // Door handle (closed) or the open doorway / the open door itself
    if (truck_.door < 0.5f) {
        float t = raySphere(eye, fwd, xf.transformPoint({1.0f, 0.97f, 0.2f}), 0.55f);
        if (t >= 0.0f && t < best) { best = t; truckHover_ = 1; }
    } else {
        float t = raySphere(eye, fwd, xf.transformPoint({0.75f, 1.2f, 0.45f}), 0.5f);
        if (t >= 0.0f && t < best) { best = t; truckHover_ = 2; }
        mat4 dx = xf * TruckModel::doorTransform(truck_.door);
        float t2 = raySphere(eye, fwd, dx.transformPoint({0.0f, 0.9f, -0.75f}), 0.45f);
        if (t2 >= 0.0f && t2 < best) { best = t2; truckHover_ = 3; }
    }
    // The pet store's front door
    vec3 sd = kStoreDoor + vec3(0, 1.3f, 0);
    float ts = raySphere(eye, fwd, sd, 1.4f);
    if (ts >= 0.0f && ts < 3.5f) truckHover_ = 4;
    switch (truckHover_) {
    case 1: hover_.prompt = "Open the truck door"; break;
    case 2: hover_.prompt = sim_.truckCargo.empty() ? "Get in the truck" : "Get in the truck (animals in the back)"; break;
    case 3: hover_.prompt = "Close the truck door"; break;
    case 4: hover_.prompt = storeOpen(sim_.clock.hour()) ? "Go into Paws & Claws Pet Supply" : "Paws & Claws is closed (open 7 AM - 9 PM)"; break;
    default: break;
    }
}

void Game::useTruckHover() {
    switch (truckHover_) {
    case 1: truck_.doorOpen = true; break;
    case 2: enterTruck(); break;
    case 3: truck_.doorOpen = false; break;
    case 4:
        if (storeOpen(sim_.clock.hour())) { state_ = State::PetStore; storeMsg_.clear(); }
        break;
    default: break;
    }
}

void Game::enterTruck() {
    inTruck_ = true;
    state_ = State::Driving;
    driveCam_ = 0;
    driveLookYaw_ = driveLookPitch_ = 0.0f;
    chaseYaw_ = truck_.yaw;
    truck_.doorOpen = false;   // pull it shut behind you
    truck_.signal = 0;
    roads_.resetRules();
}

bool Game::exitTruck() {
    if (std::fabs(truck_.speed) > 0.8f) {
        roads_.lastWarning = "Stop the truck before you get out";
        roads_.warningTimer = 2.5f;
        return false;
    }
    truck_.speed = 0.0f;
    truck_.doorOpen = true;
    inTruck_ = false;
    state_ = State::Playing;
    world_.facility.gateRemote = false;
    vec3 out = truck_.transform().transformPoint(TruckModel::doorOutside());
    out.y = world_.collision.groundHeight(out.x, out.z, out.y + 1.0f, 0.3f);
    player_.place(out, truck_.yaw + kPi * 0.5f + 0.3f, radians(-8.0f));
    // Home with animals in the back: unload them
    if (!sim_.truckCargo.empty() && sim_.land.contains(truck_.pos.x, truck_.pos.z)) {
        int n = sim_.deliverCargo();
        toasts_.push_back({std::to_string(n) + (n == 1 ? " animal" : " animals") + " unloaded and settled in at the shelter.", 7.0f});
    }
    return true;
}

void Game::updateDriving(float dt) {
    sim_.advance(double(dt) * double(timeScale_));
    sim_.ownerName = appearance_.name.empty() ? "Boss" : appearance_.name.substr(0, appearance_.name.find(' '));
    if (input_.pressed(GLFW_KEY_ESCAPE)) { state_ = State::Paused; return; }
    if (input_.pressed(GLFW_KEY_F5)) saveGame();
    for (const auto& d : sim_.decisions)
        if (d.urgent && std::fabs(truck_.speed) < 1.0f) { dialogDecision_ = d.id; state_ = State::Dialog; return; }
    if (input_.pressed(GLFW_KEY_F) && exitTruck()) return;
    // Pedals and wheel (keyboard or the phone joystick: up = gas, down = brake, sideways = steer)
    float throttle = (input_.down(GLFW_KEY_W) || input_.down(GLFW_KEY_UP)) ? 1.0f : 0.0f;
    float brake = (input_.down(GLFW_KEY_S) || input_.down(GLFW_KEY_DOWN)) ? 1.0f : 0.0f;
    float steer = ((input_.down(GLFW_KEY_D) || input_.down(GLFW_KEY_RIGHT)) ? 1.0f : 0.0f) -
                  ((input_.down(GLFW_KEY_A) || input_.down(GLFW_KEY_LEFT)) ? 1.0f : 0.0f);
    vec2 tm = input_.touchMove;
    if (tm.y < -0.15f) throttle = std::max(throttle, std::min(1.0f, -tm.y * 1.2f));
    if (tm.y > 0.15f) brake = std::max(brake, std::min(1.0f, tm.y * 1.2f));
    if (std::fabs(tm.x) > 0.1f) steer = clampf(tm.x * 1.3f, -1.0f, 1.0f);
    bool handbrake = input_.down(GLFW_KEY_SPACE);
    // Turn signals (Q left, E right), lights, camera
    if (input_.pressed(GLFW_KEY_Q)) { truck_.signal = truck_.signal == -1 ? 0 : -1; signalArmed_ = false; }
    if (input_.pressed(GLFW_KEY_E)) { truck_.signal = truck_.signal == 1 ? 0 : 1; signalArmed_ = false; }
    if (input_.pressed(GLFW_KEY_L)) truck_.headlights = !truck_.headlights;
    if (input_.pressed(GLFW_KEY_V)) driveCam_ = 1 - driveCam_;
    // Like a real truck, the signal cancels itself when the wheel comes back after the turn
    if (truck_.signal != 0) {
        if (float(truck_.signal) * truck_.steer > 0.18f) signalArmed_ = true;
        if (signalArmed_ && std::fabs(truck_.steer) < 0.03f) { truck_.signal = 0; signalArmed_ = false; }
    }
    // Look around the cab
    if (input_.cursorLocked()) {
        vec2 md = input_.mouseDelta();
        driveLookYaw_ -= md.x * player_.mouseSensitivity;
        driveLookPitch_ -= md.y * player_.mouseSensitivity;
    }
    vec2 tl = input_.touchLook();
    driveLookYaw_ -= tl.x * 0.0042f;
    driveLookPitch_ -= tl.y * 0.0042f;
    driveLookYaw_ = clampf(driveLookYaw_, -2.3f, 2.3f);
    driveLookPitch_ = clampf(driveLookPitch_, -0.7f, 0.5f);
    if (input_.pressed(GLFW_KEY_C)) driveLookYaw_ = driveLookPitch_ = 0.0f;

    truck_.update(dt, throttle, brake, steer, handbrake, world_.collision, world_.facility.carCollider);
    world_.facility.setCarCollider(world_.collision, truck_.pos, truck_.yaw);
    // The gate remote on your visor: the gate opens when you drive up to it
    world_.facility.gateRemote = std::fabs(truck_.pos.x) < 40.0f && std::fabs(truck_.pos.z - kSouthEdge) < 110.0f;
    player_.feet = truck_.transform().transformPoint(TruckModel::doorOutside());   // saves put you beside the truck
    if (!sim_.truckCargo.empty() && sim_.land.contains(truck_.pos.x, truck_.pos.z) && truck_.pos.z < kParkMaxZ + 10.0f &&
        std::fabs(truck_.speed) < 0.3f && roads_.warningTimer <= 0.0f) {
        roads_.lastWarning = "Park and press F to get out and unload your animals";
        roads_.warningTimer = 3.0f;
    }
}

void Game::driveCamera() {
    mat4 xf = truck_.transform();
    if (driveCam_ == 0) {
        vec3 eye = xf.transformPoint(TruckModel::driverSeat());
        float y = truck_.yaw + driveLookYaw_, p = driveLookPitch_ - 0.04f;
        camera_.zNear = 0.05f;
        camera_.lookDir(eye, {std::sin(y) * std::cos(p), std::sin(p), std::cos(y) * std::cos(p)});
    } else {
        float d = std::remainder(truck_.yaw - chaseYaw_, 2.0f * kPi);
        chaseYaw_ += d * std::min(1.0f, ImGui::GetIO().DeltaTime * 3.0f);
        float y = chaseYaw_ + driveLookYaw_;
        vec3 back{std::sin(y), 0.0f, std::cos(y)};
        camera_.zNear = 0.1f;
        camera_.lookAt(truck_.pos - back * 9.0f + vec3(0, 3.4f, 0), truck_.pos + vec3(0, 1.3f, 0) + back * 3.0f);
    }
}

void Game::drawTruck(Renderer& r, Pass pass) {
    if (state_ == State::Cutscene || state_ == State::Creator) {
        truckModel_.draw(r, pass, world_.facility.playerCar, 0.0f, time_ * 7.0f, 0.0f, false, false, false,
                         renderer_.nightAmount() > 0.4f, false);
        return;
    }
    bool blink = std::fmod(time_, 0.8f) < 0.4f;
    mat4 xf = truck_.transform();
    truckModel_.draw(r, pass, xf, truck_.steer, truck_.spin, truck_.door, truck_.braking || (inTruck_ && std::fabs(truck_.speed) < 0.2f),
                     truck_.signal < 0 && blink, truck_.signal > 0 && blink, truck_.headlights, truck_.speed < -0.2f);
    if (pass != Pass::Transparent) truckModel_.drawCrates(r, xf, int(sim_.truckCargo.size()));
}

void Game::drawDriving() {
    drawHUD();
    roads_.drawHUD(sim_, truck_, touch_);
    if (touch_) {
        // Phone buttons live in the web page; this just reminds you what they do
        return;
    }
}

void Game::drawPetStore() {
    ImGuiIO& io = ImGui::GetIO();
    ImVec2 size(std::min(760.0f, io.DisplaySize.x - 24.0f), std::min(560.0f, io.DisplaySize.y - 24.0f));
    ImGui::SetNextWindowPos(ImVec2(io.DisplaySize.x * 0.5f, io.DisplaySize.y * 0.5f), ImGuiCond_Always, ImVec2(0.5f, 0.5f));
    ImGui::SetNextWindowSize(size);
    ImGui::Begin("PAWS & CLAWS PET SUPPLY", nullptr, ImGuiWindowFlags_NoCollapse | ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoMove);
    ImGui::TextDisabled("Crossroads Rd off HWY 89  -  open 7 AM to 9 PM  -  new animals every morning");
    ImGui::Text("Cash: $%lld", (long long)sim_.econ.cash);
    ImGui::SameLine(0, 30);
    ImGui::TextColored(ImVec4(1, 0.85f, 0.45f, 1), "In your truck: %d", int(sim_.truckCargo.size()));
    ImGui::Separator();
    if (ImGui::BeginTabBar("store")) {
        if (ImGui::BeginTabItem("Animals")) {
            storeTab_ = 0;
            if (sim_.petStore.empty()) ImGui::TextDisabled("Sold out today. Come back tomorrow morning.");
            if (ImGui::BeginTable("pets", 5, ImGuiTableFlags_RowBg | ImGuiTableFlags_SizingStretchProp)) {
                ImGui::TableSetupColumn("Name");
                ImGui::TableSetupColumn("Animal");
                ImGui::TableSetupColumn("Sex / age");
                ImGui::TableSetupColumn("Price");
                ImGui::TableSetupColumn("");
                ImGui::TableHeadersRow();
                const auto& cat = speciesCatalog();
                for (size_t i = 0; i < sim_.petStore.size(); ++i) {
                    const StoreAnimal& a = sim_.petStore[i];
                    const Species& sp = cat[size_t(a.species)];
                    ImGui::PushID(int(i));
                    ImGui::TableNextRow();
                    ImGui::TableNextColumn();
                    if (!sp.coats.empty()) {
                        vec3 c = sp.coats[size_t(a.coat) % sp.coats.size()].a;
                        ImGui::ColorButton("##coat", ImVec4(c.x, c.y, c.z, 1), ImGuiColorEditFlags_NoTooltip, ImVec2(14, 14));
                        ImGui::SameLine();
                    }
                    ImGui::TextUnformatted(a.name.c_str());
                    ImGui::TableNextColumn();
                    ImGui::Text("%s", sp.name.c_str());
                    if (!sp.coats.empty()) ImGui::TextDisabled("%s", sp.coats[size_t(a.coat) % sp.coats.size()].name.c_str());
                    ImGui::TableNextColumn();
                    ImGui::Text("%s, %s", a.male ? "male" : "female", a.ageFrac < 0.25f ? "young" : "young adult");
                    ImGui::TableNextColumn();
                    ImGui::Text("$%.0f", double(a.price));
                    ImGui::TableNextColumn();
                    if (ImGui::Button("Buy")) {
                        std::string why, nm = a.name;
                        if (sim_.buyFromPetStore(i, &why)) storeMsg_ = nm + " is in a carrier in the back of your truck. Drive home and get out to unload.";
                        else storeMsg_ = why;
                        ImGui::PopID();
                        break;
                    }
                    ImGui::PopID();
                }
                ImGui::EndTable();
            }
            ImGui::EndTabItem();
        }
        if (ImGui::BeginTabItem("Food & supplies")) {
            storeTab_ = 1;
            ImGui::TextDisabled("Store prices are higher than ordering from your computer, but it comes home with you today.");
            for (int f = 0; f < int(FoodKind::Count); ++f) {
                FoodKind k = FoodKind(f);
                ImGui::PushID(f);
                ImGui::Text("%-16s  $%.2f/kg   (you have %.0f kg)", foodName(k), double(foodPricePerKg(k) * 1.35f), double(sim_.food[size_t(f)]));
                ImGui::SameLine(size.x - 150.0f);
                if (ImGui::SmallButton("5 kg")) storeMsg_ = sim_.buyStoreFood(k, 5.0f) ? "Bought 5 kg." : "Not enough cash.";
                ImGui::SameLine();
                if (ImGui::SmallButton("25 kg")) storeMsg_ = sim_.buyStoreFood(k, 25.0f) ? "Bought 25 kg." : "Not enough cash.";
                ImGui::PopID();
            }
            ImGui::EndTabItem();
        }
        ImGui::EndTabBar();
    }
    ImGui::Separator();
    if (!storeMsg_.empty()) ImGui::TextWrapped("%s", storeMsg_.c_str());
    if (ImGui::Button(touch_ ? "Leave the store" : "Leave the store  [Esc]", ImVec2(220, 0))) state_ = State::Playing;
    ImGui::End();
}

}  // namespace ps
