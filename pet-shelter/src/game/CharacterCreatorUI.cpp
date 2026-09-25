#include "game/CharacterCreatorUI.h"
#include <imgui.h>
#include <cstring>

namespace ps {

CharacterCreatorUI::Result CharacterCreatorUI::draw(Appearance& a, bool& changed) {
    Result result = None;
    ImGuiIO& io = ImGui::GetIO();
    ImGui::SetNextWindowPos(ImVec2(16, 16));
    ImGui::SetNextWindowSize(ImVec2(420, io.DisplaySize.y - 32));
    ImGui::SetNextWindowBgAlpha(0.88f);
    ImGui::Begin("Create your character", nullptr, ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoCollapse);

    char name[64];
    std::strncpy(name, a.name.c_str(), sizeof name - 1);
    name[sizeof name - 1] = 0;
    if (ImGui::InputText("Name", name, sizeof name)) a.name = name;

    ImGui::SeparatorText("Gender");
    int g = int(a.gender);
    if (ImGui::RadioButton("Male", g == 0)) { a.gender = Gender::Male; a.applyPreset(0); changed = true; }
    ImGui::SameLine();
    if (ImGui::RadioButton("Female", g == 1)) { a.gender = Gender::Female; a.applyPreset(0); changed = true; }

    ImGui::SeparatorText("Presets");
    for (int i = 0; i < kPresetCount; ++i) {
        if (i) ImGui::SameLine();
        if (ImGui::Button(presetName(a.gender, i))) { a.applyPreset(i); changed = true; }
    }
    if (ImGui::Button("Randomize", ImVec2(-1, 0))) { a.randomize(rng); changed = true; }

    auto slider = [&](const char* label, float& v, float lo = 0.0f, float hi = 1.0f, const char* fmt = "%.2f") {
        if (ImGui::SliderFloat(label, &v, lo, hi, fmt)) changed = true;
    };
    auto combo = [&](const char* label, int& v, int n, const char* (*nameFn)(int)) {
        if (ImGui::BeginCombo(label, nameFn(v))) {
            for (int i = 0; i < n; ++i)
                if (ImGui::Selectable(nameFn(i), v == i)) { v = i; changed = true; }
            ImGui::EndCombo();
        }
    };
    auto color = [&](const char* label, vec3& c) {
        float col[3] = {c.x, c.y, c.z};
        if (ImGui::ColorEdit3(label, col, ImGuiColorEditFlags_NoInputs)) { c = {col[0], col[1], col[2]}; changed = true; }
    };

    ImGui::BeginChild("opts", ImVec2(0, -80));
    if (ImGui::CollapsingHeader("Body", ImGuiTreeNodeFlags_DefaultOpen)) {
        slider("Height", a.height, 1.50f, 2.05f, "%.2f m");
        slider("Weight", a.weight);
        slider("Muscle", a.muscle);
        slider("Shoulders", a.shoulders);
        slider("Hips", a.hips);
        slider("Skin tone", a.skinTone);
    }
    if (ImGui::CollapsingHeader("Face", ImGuiTreeNodeFlags_DefaultOpen)) {
        slider("Jaw width", a.jaw);
        slider("Face length", a.faceLength);
        slider("Nose size", a.noseSize);
        combo("Eye color", a.eyeColor, kEyeColorCount, eyeColorName);
    }
    if (ImGui::CollapsingHeader("Hair", ImGuiTreeNodeFlags_DefaultOpen)) {
        combo("Hair style", a.hairStyle, kHairStyleCount, hairStyleName);
        color("Hair color", a.hairColor);
        combo("Facial hair", a.facialHair, kFacialHairCount, facialHairName);
    }
    if (ImGui::CollapsingHeader("Clothing", ImGuiTreeNodeFlags_DefaultOpen)) {
        combo("Top", a.topStyle, kTopStyleCount, topStyleName);
        color("Top color", a.topColor);
        color("Pants color", a.pantsColor);
        color("Shoe color", a.shoeColor);
        combo("Accessory", a.accessory, kAccessoryCount, accessoryName);
    }
    if (ImGui::CollapsingHeader("Preview", ImGuiTreeNodeFlags_DefaultOpen)) {
        ImGui::SliderAngle("Rotate", &previewYaw, -180.0f, 180.0f);
        ImGui::SliderFloat("Zoom", &zoom, 0.0f, 1.0f, "%.2f");
        ImGui::TextDisabled("Tip: drag with the right mouse button to spin.");
    }
    ImGui::EndChild();
    ImGui::Separator();
    if (ImGui::Button("< Back", ImVec2(100, 40))) result = Back;
    ImGui::SameLine();
    ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.2f, 0.55f, 0.3f, 1));
    if (ImGui::Button("Start your shelter  >", ImVec2(-1, 40))) result = Start;
    ImGui::PopStyleColor();
    ImGui::End();

    if (!io.WantCaptureMouse && ImGui::IsMouseDown(ImGuiMouseButton_Right)) previewYaw += io.MouseDelta.x * 0.01f;
    return result;
}

}  // namespace ps
