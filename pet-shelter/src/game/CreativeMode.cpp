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
    ImGui::BeginChild("strip", ImVec2(0, 62), ImGuiChildFlags_None, ImGuiWindowFlags_HorizontalScrollbar);
    for (int i = 0; i < int(BuildKind::Count); ++i) {
        const BuildInfo& bi = buildInfo(BuildKind(i));
        if (i) ImGui::SameLine();
        bool sel = tool == i;
        if (sel) ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.2f, 0.55f, 0.3f, 1));
        char label[96];
        std::snprintf(label, sizeof label, "%s\n$%s", bi.name, std::to_string(int(bi.cost)).c_str());
        if (ImGui::Button(label, ImVec2(112, 46))) tool = sel ? -1 : i;
        if (sel) ImGui::PopStyleColor();
    }
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
    else ImGui::TextDisabled("Drag to move, pinch to zoom, twist to turn");
    ImGui::End();
}

void CreativeMode::drawUI(Sim& sim, float& timeScale) {
    if (touchUI) { drawTouchUI(timeScale); return; }
    ImGuiIO& io = ImGui::GetIO();
    ImGui::SetNextWindowPos(ImVec2(io.DisplaySize.x * 0.5f, io.DisplaySize.y - 10.0f), ImGuiCond_Always, ImVec2(0.5f, 1.0f));
    ImGui::SetNextWindowBgAlpha(0.85f);
    ImGui::Begin("Build", nullptr, ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_AlwaysAutoResize | ImGuiWindowFlags_NoMove);
    ImGui::TextColored(ImVec4(0.6f, 0.9f, 0.6f, 1), "CREATIVE MODE");
    ImGui::SameLine();
    ImGui::TextDisabled("  WASD pan | RMB rotate | wheel zoom | R rotate | X demolish | Tab: POV mode");
    const char* lastCat = "";
    for (int i = 0; i < int(BuildKind::Count); ++i) {
        const BuildInfo& bi = buildInfo(BuildKind(i));
        if (std::string(bi.category) != lastCat) {
            if (i) ImGui::SameLine();
            ImGui::BeginGroup();
            ImGui::TextDisabled("%s", bi.category);
            lastCat = bi.category;
        }
        bool sel = tool == i;
        if (sel) ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.2f, 0.55f, 0.3f, 1));
        char label[96];
        std::snprintf(label, sizeof label, "%s\n$%s", bi.name, std::to_string(int(bi.cost)).c_str());
        if (ImGui::Button(label, ImVec2(118, 40))) tool = sel ? -1 : i;
        if (sel) ImGui::PopStyleColor();
        if (ImGui::IsItemHovered()) ImGui::SetTooltip("%s\nAppeal +%.1f  Visitors +%d/day  Upkeep $%.0f/day", bi.description, bi.appeal,
                                                      bi.visitorCapacity, bi.upkeepPerDay);
        bool nextNewCat = i + 1 >= int(BuildKind::Count) || std::string(buildInfo(BuildKind(i + 1)).category) != lastCat;
        if (nextNewCat) ImGui::EndGroup();
    }
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
    if (statusTimer > 0.0f && !status.empty()) ImGui::TextColored(ImVec4(1, 0.85f, 0.4f, 1), "%s", status.c_str());
    else ImGui::TextDisabled("You own %.0f sq mi. Everything must be built inside the barrier fence.", layout::kAreaSqMiles);
    (void)sim;
    ImGui::End();
}

}  // namespace ps
