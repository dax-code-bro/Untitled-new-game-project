#include "game/CreativeMode.h"
#include "world/Layout.h"
#include "world/Terrain.h"
#include <GLFW/glfw3.h>
#include <imgui.h>
#include <cstdio>

namespace ps {

void CreativeMode::applyCamera(Camera& cam) const {
    vec3 dir{std::sin(yaw) * std::cos(pitch), std::sin(pitch), std::cos(yaw) * std::cos(pitch)};
    vec3 pos = target - dir * distance;
    float ground = terrain::height(pos.x, pos.z) + 2.0f;
    if (pos.y < ground) pos.y = ground;
    cam.zNear = std::max(0.1f, distance * 0.002f);
    cam.lookDir(pos, target - pos);
}

void CreativeMode::update(float dt, const Input& in, World& world, Sim& sim, const Camera& cam, int sw, int sh) {
    statusTimer = std::max(0.0f, statusTimer - dt);
    // ---- Camera ----
    vec3 fwd{std::sin(yaw), 0, std::cos(yaw)};
    vec3 right{-fwd.z, 0, fwd.x};
    float panSpeed = (20.0f + distance * 1.2f) * (in.down(GLFW_KEY_LEFT_SHIFT) ? 3.0f : 1.0f);
    vec3 pan{0, 0, 0};
    if (in.down(GLFW_KEY_W) || in.down(GLFW_KEY_UP)) pan += fwd;
    if (in.down(GLFW_KEY_S) || in.down(GLFW_KEY_DOWN)) pan -= fwd;
    if (in.down(GLFW_KEY_D) || in.down(GLFW_KEY_RIGHT)) pan += right;
    if (in.down(GLFW_KEY_A) || in.down(GLFW_KEY_LEFT)) pan -= right;
    pan += fwd * -in.touchMove.y + right * in.touchMove.x;
    target += pan * panSpeed * dt;
    {   // one-finger drag pans (ground follows the finger), two-finger twist orbits
        vec2 tp = in.touchPan();
        float k = distance * 0.0022f;
        target -= right * tp.x * k;
        target += fwd * tp.y * k;
        vec2 tw = in.touchTwist();
        yaw += tw.x;
        pitch = clampf(pitch + tw.y, radians(-89.0f), radians(-8.0f));
    }
    if (in.down(GLFW_KEY_Q)) yaw += 1.5f * dt;
    if (in.down(GLFW_KEY_E)) yaw -= 1.5f * dt;
    if (in.mouseDown(GLFW_MOUSE_BUTTON_RIGHT)) {
        yaw -= in.mouseDelta().x * 0.005f;
        pitch = clampf(pitch - in.mouseDelta().y * 0.004f, radians(-89.0f), radians(-8.0f));
    }
    if (in.mouseDown(GLFW_MOUSE_BUTTON_MIDDLE)) {
        float k = distance * 0.0015f;
        target -= right * in.mouseDelta().x * k;
        target += fwd * in.mouseDelta().y * k;
    }
    if (!in.uiWantsMouse && in.scroll() != 0.0f) distance = clampf(distance * std::pow(0.88f, in.scroll()), 6.0f, 30000.0f);
    // You can look at the background, but the camera focus stays over your land.
    target = layout::clampToRegion(target, 0.0f);
    target.y = terrain::height(target.x, target.z);

    if (in.pressed(GLFW_KEY_R)) rotation = (rotation + 1) & 3;
    if (in.pressed(GLFW_KEY_ESCAPE)) tool = -1;
    if (in.pressed(GLFW_KEY_X) || in.pressed(GLFW_KEY_DELETE)) tool = -2;

    // ---- Mouse ray ----
    vec2 m = in.mousePos();
    float nx = m.x / float(std::max(1, sw)) * 2.0f - 1.0f, ny = 1.0f - m.y / float(std::max(1, sh)) * 2.0f;
    mat4 inv = cam.viewProj().inverse();
    vec4 pn = inv * vec4(nx, ny, -1.0f, 1.0f), pf = inv * vec4(nx, ny, 1.0f, 1.0f);
    vec3 ro = pn.xyz() / pn.w, rd = normalize(pf.xyz() / pf.w - ro);

    world.ghostVisible = false;
    world.highlightPlaced = -1;
    hoverTravel = 0;
    if (in.uiWantsMouse) return;
    if (tool >= 0) {
        float t = world.raycastTerrain(ro, rd, 20000.0f);
        if (t < 0.0f) return;
        vec3 hit = ro + rd * t;
        if (snap) { hit.x = std::round(hit.x); hit.z = std::round(hit.z); }
        BuildKind k = BuildKind(tool);
        std::string why;
        bool ok = validPlacement(k, hit.x, hit.z, rotation, sim.placed, &why) && sim.econ.cash >= buildInfo(k).cost;
        if (why.empty() && !ok) why = "Not enough cash";
        world.ghostVisible = true;
        world.ghostKind = k;
        world.ghostValid = ok;
        world.ghostModel = mat4::translate({hit.x, terrain::height(hit.x, hit.z), hit.z}) * mat4::rotateY(radians(90.0f * float(rotation)));
        if (!ok) { status = why; statusTimer = 0.1f; }
        if (in.mousePressed(GLFW_MOUSE_BUTTON_LEFT)) {
            if (sim.build(k, hit.x, hit.z, rotation, &why)) {
                status = std::string("Built ") + buildInfo(k).name + " for $" + std::to_string(int(buildInfo(k).cost));
                statusTimer = 2.5f;
            } else { status = why; statusTimer = 2.5f; }
        }
    } else if (tool == -1) {
        // Fast travel: click the shelter (or the pet store) to go there right away
        hoverTravel = 0;
        AABB shelter = layout::buildingBounds();
        shelter.min.y = 0.0f; shelter.max.y = layout::kCeilingY + 2.5f;
        AABB store({layout::kPetStoreX - 20.0f, 0.0f, layout::kPetStoreZ - 8.0f}, {layout::kPetStoreX + 20.0f, 5.4f, layout::kPetStoreZ + 10.0f});
        float ts = rayAABB(ro, rd, shelter), tp = rayAABB(ro, rd, store);
        if (ts >= 0.0f && (tp < 0.0f || ts < tp)) hoverTravel = 1;
        else if (tp >= 0.0f) hoverTravel = 2;
        if (hoverTravel && in.mousePressed(GLFW_MOUSE_BUTTON_LEFT)) travelRequest = hoverTravel;
    } else if (tool == -2) {
        // Demolish: pick the closest placed object under the cursor
        float best = 1e9f;
        int bestId = -1;
        for (const Placed& p : sim.placed) {
            float gy = terrain::height(p.x, p.z);
            AABB b = p.bounds(gy);
            b.max.y = std::max(b.max.y, gy + 1.0f);
            float t = rayAABB(ro, rd, b);
            if (t >= 0.0f && t < best) { best = t; bestId = p.id; }
        }
        world.highlightPlaced = bestId;
        if (bestId >= 0 && in.mousePressed(GLFW_MOUSE_BUTTON_LEFT)) {
            sim.demolish(bestId);
            status = "Demolished (40% salvage refunded)";
            statusTimer = 2.5f;
        }
    }
}

void CreativeMode::drawTouchUI(float& timeScale) {
    ImGuiIO& io = ImGui::GetIO();
    const float side = 150.0f;   // leave room for the joystick (left) and buttons (right)
    float w = std::max(260.0f, io.DisplaySize.x - side * 2.0f);
    ImGui::SetNextWindowPos(ImVec2(io.DisplaySize.x * 0.5f, io.DisplaySize.y - 6.0f), ImGuiCond_Always, ImVec2(0.5f, 1.0f));
    ImGui::SetNextWindowSize(ImVec2(w, 0.0f));
    ImGui::SetNextWindowBgAlpha(0.85f);
    ImGui::Begin("BuildTouch", nullptr, ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_AlwaysAutoResize | ImGuiWindowFlags_NoMove);
    ImGui::BeginChild("cats", ImVec2(0, 40), ImGuiChildFlags_None, ImGuiWindowFlags_HorizontalScrollbar);
    if (ImGui::Button("< Back", ImVec2(0, 32))) backRequest = true;
    for (int c = 0; c < int(BuildCat::Count); ++c) {
        ImGui::SameLine();
        bool on = category == c;
        if (on) ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.25f, 0.45f, 0.65f, 1));
        if (ImGui::Button(buildCatName(BuildCat(c)), ImVec2(0, 32))) category = c;
        if (on) ImGui::PopStyleColor();
    }
    ImGui::EndChild();
    ImGui::BeginChild("strip", ImVec2(0, 62), ImGuiChildFlags_None, ImGuiWindowFlags_HorizontalScrollbar);
    int shownT = 0;
    for (int i = 0; i < int(BuildKind::Count); ++i) {
        if (int(buildCategory(BuildKind(i))) != category) continue;
        const BuildInfo& bi = buildInfo(BuildKind(i));
        if (shownT++) ImGui::SameLine();
        bool sel = tool == i;
        if (sel) ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.2f, 0.55f, 0.3f, 1));
        char label[96];
        std::snprintf(label, sizeof label, "%s\n$%s", bi.name, std::to_string(int(bi.cost)).c_str());
        if (ImGui::Button(label, ImVec2(112, 46))) tool = sel ? -1 : i;
        if (sel) ImGui::PopStyleColor();
    }
    if (shownT == 0) ImGui::TextDisabled("%s", buildCatPlan(BuildCat(category)));
    ImGui::EndChild();
    const float speeds[] = {0.0f, 1.0f, 5.0f, 20.0f};
    const char* names[] = {"||", "1x", "5x", "20x"};
    for (int i = 0; i < 4; ++i) {
        if (i) ImGui::SameLine();
        bool on = timeScale == speeds[i];
        if (on) ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.2f, 0.45f, 0.7f, 1));
        if (ImGui::Button(names[i], ImVec2(40, 0))) timeScale = speeds[i];
        if (on) ImGui::PopStyleColor();
    }
    ImGui::SameLine();
    if (statusTimer > 0.0f && !status.empty()) ImGui::TextColored(ImVec4(1, 0.85f, 0.4f, 1), "%s", status.c_str());
    else if (tool >= 0) ImGui::TextDisabled("Tap the ground to preview, tap again to build");
    else if (tool == -2) ImGui::TextDisabled("Tap a building, tap again to demolish");
    else ImGui::TextDisabled("Tap the shelter twice to go there");
    ImGui::SameLine();
    if (ImGui::Button("Go: Shelter")) travelRequest = 1;
    ImGui::SameLine();
    if (ImGui::Button("Pet store")) travelRequest = 2;
    if (hoverTravel) ImGui::SetTooltip(hoverTravel == 1 ? "Tap again: go to your shelter" : "Tap again: go to the pet store");
    ImGui::End();
}

void CreativeMode::drawUI(Sim& sim, float& timeScale) {
    if (touchUI) { drawTouchUI(timeScale); return; }
    ImGuiIO& io = ImGui::GetIO();
    ImGui::SetNextWindowPos(ImVec2(io.DisplaySize.x * 0.5f, io.DisplaySize.y - 10.0f), ImGuiCond_Always, ImVec2(0.5f, 1.0f));
    ImGui::SetNextWindowBgAlpha(0.85f);
    ImGui::Begin("Build", nullptr, ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_AlwaysAutoResize | ImGuiWindowFlags_NoMove);
    if (ImGui::Button("< Back")) backRequest = true;
    ImGui::SameLine();
    ImGui::TextColored(ImVec4(0.6f, 0.9f, 0.6f, 1), "BUILD MODE");
    ImGui::SameLine();
    ImGui::TextDisabled("  WASD pan | RMB rotate | wheel zoom | R rotate | X demolish | Tab: POV mode");
    // Category tabs
    for (int c = 0; c < int(BuildCat::Count); ++c) {
        if (c) ImGui::SameLine();
        bool on = category == c;
        if (on) ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.25f, 0.45f, 0.65f, 1));
        if (ImGui::Button(buildCatName(BuildCat(c)))) category = c;
        if (on) ImGui::PopStyleColor();
    }
    ImGui::TextDisabled("%s", buildCatPlan(BuildCat(category)));
    int shown = 0;
    for (int i = 0; i < int(BuildKind::Count); ++i) {
        if (int(buildCategory(BuildKind(i))) != category) continue;
        const BuildInfo& bi = buildInfo(BuildKind(i));
        if (shown++ % 7) ImGui::SameLine();
        bool sel = tool == i;
        if (sel) ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.2f, 0.55f, 0.3f, 1));
        char label[96];
        std::snprintf(label, sizeof label, "%s\n$%s", bi.name, std::to_string(int(bi.cost)).c_str());
        if (ImGui::Button(label, ImVec2(128, 40))) tool = sel ? -1 : i;
        if (sel) ImGui::PopStyleColor();
        if (ImGui::IsItemHovered())
            ImGui::SetTooltip("%s\nAppeal +%.1f  Visitors +%d/day  Animals %d  Upkeep $%.0f/day", bi.description, bi.appeal,
                              bi.visitorCapacity, bi.animalCapacity, bi.upkeepPerDay);
    }
    if (shown == 0) ImGui::TextColored(ImVec4(1, 0.85f, 0.4f, 1), "Coming soon.");
    ImGui::Separator();
    if (ImGui::Button(tool == -2 ? "Demolish: ON" : "Demolish")) tool = tool == -2 ? -1 : -2;
    ImGui::SameLine();
    ImGui::Checkbox("Snap to grid", &snap);
    ImGui::SameLine();
    ImGui::Text("Rotation: %d deg", rotation * 90);
    ImGui::SameLine(0, 30);
    ImGui::Text("Speed:");
    const float speeds[] = {0.0f, 1.0f, 5.0f, 20.0f};
    const char* names[] = {"||", "1x", "5x", "20x"};
    for (int i = 0; i < 4; ++i) {
        ImGui::SameLine();
        bool on = timeScale == speeds[i];
        if (on) ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.2f, 0.45f, 0.7f, 1));
        if (ImGui::Button(names[i])) timeScale = speeds[i];
        if (on) ImGui::PopStyleColor();
    }
    ImGui::SameLine(0, 30);
    ImGui::Text("Go to:");
    ImGui::SameLine();
    if (ImGui::Button("Shelter")) travelRequest = 1;
    ImGui::SameLine();
    if (ImGui::Button("Pet store")) travelRequest = 2;
    if (hoverTravel && !io.WantCaptureMouse)
        ImGui::SetTooltip(hoverTravel == 1 ? "Click: go to your shelter now" : "Click: go to the pet store now");
    if (statusTimer > 0.0f && !status.empty()) ImGui::TextColored(ImVec4(1, 0.85f, 0.4f, 1), "%s", status.c_str());
    else if (tool == -1) ImGui::TextDisabled("Click the shelter to go straight there (no driving). You own %.2f of 500 sq mi; build anywhere on your land and the fence moves out to take it in.", double(sim.land.ownedSqMi()));
    else ImGui::TextDisabled("You own %.2f of 500 sq mi. Build anywhere on your land - the fence moves out to take it in. More land: the computer's Store.", double(sim.land.ownedSqMi()));
    ImGui::End();
}

}  // namespace ps
