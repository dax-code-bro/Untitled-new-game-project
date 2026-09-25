#include "game/ClinicViews.h"
#include "core/Noise.h"
#include <imgui.h>
#include <cmath>
#include <cstdio>

namespace ps::clinic {

namespace {
ImU32 gray(float v, float a = 1.0f) {
    int g = int(clampf(v, 0.0f, 1.0f) * 255.0f);
    return IM_COL32(g, g, g, int(a * 255.0f));
}

// ---------------------------------------------------------------------------
// Abdominal ultrasound: a fan-shaped B-mode image with speckle.
void ultrasound(ImDrawList* dl, ImVec2 o, float w, float h, Hidden truth, uint32_t seed) {
    dl->AddRectFilled(o, ImVec2(o.x + w, o.y + h), IM_COL32(0, 0, 0, 255));
    ImVec2 apex(o.x + w * 0.5f, o.y + h * 0.04f);
    const float spread = 0.62f, rMin = h * 0.05f, rMax = h * 0.92f;
    Rng rng(seed);
    // Features in polar space (u = -1..1 across the fan, v = 0..1 depth), each with an echo level
    struct Blob { float u, v, ru, rv, echo; bool shadow; };
    std::vector<Blob> blobs;
    auto rnd = [&](float a, float b) { return rng.range(a, b); };
    // Normal anatomy: bowel loops (bright walls), a kidney, the bladder (anechoic, black)
    for (int i = 0; i < 6; ++i) blobs.push_back({rnd(-0.8f, 0.8f), rnd(0.25f, 0.8f), rnd(0.08f, 0.14f), rnd(0.05f, 0.09f), -1.0f, false});
    blobs.push_back({rnd(-0.6f, -0.2f), rnd(0.55f, 0.7f), 0.2f, 0.09f, 0.35f, false});   // kidney
    blobs.push_back({rnd(0.1f, 0.5f), rnd(0.62f, 0.78f), 0.22f, 0.12f, 0.0f, false});    // bladder (black)
    Blob& bladder = blobs.back();
    switch (truth) {
    case Hidden::ForeignBody: blobs.push_back({rnd(-0.4f, 0.1f), rnd(0.35f, 0.5f), 0.14f, 0.025f, 1.4f, true}); break;
    case Hidden::BladderStones:
        for (int i = 0; i < 3; ++i) blobs.push_back({bladder.u + rnd(-0.08f, 0.08f), bladder.v + bladder.rv * 0.55f, 0.025f, 0.018f, 1.4f, true});
        break;
    case Hidden::Tumor: blobs.push_back({rnd(-0.5f, 0.3f), rnd(0.3f, 0.5f), 0.2f, 0.12f, 2.0f, false}); break;   // mottled mass
    case Hidden::Pregnancy:
        for (int i = 0; i < 3; ++i) {
            float u = rnd(-0.7f, 0.7f), v = rnd(0.3f, 0.6f);
            blobs.push_back({u, v, 0.1f, 0.07f, 0.0f, false});        // dark fluid-filled sac
            blobs.push_back({u + 0.01f, v + 0.01f, 0.035f, 0.025f, 0.95f, false});   // fetus
        }
        break;
    case Hidden::InternalBleeding:
        for (int i = 0; i < 4; ++i) blobs.push_back({rnd(-0.8f, 0.8f), rnd(0.3f, 0.85f), rnd(0.1f, 0.18f), 0.03f, 0.02f, false});   // free fluid
        break;
    default: break;
    }
    auto echoAt = [&](float u, float v) {
        float e = 0.28f + 0.1f * (1.0f - v);   // tissue background
        for (const Blob& b : blobs) {
            float du = (u - b.u) / b.ru, dv = (v - b.v) / b.rv;
            float d = du * du + dv * dv;
            if (b.echo < 0.0f) {   // bowel loop: bright ring, gray lumen
                if (d < 1.0f) e = d > 0.6f ? 0.85f : 0.35f;
            } else if (b.echo > 1.9f) {   // mottled tumor
                if (d < 1.0f + 0.3f * std::sin(u * 40.0f + v * 30.0f)) e = 0.35f + 0.5f * valueNoise(u * 30.0f, v * 30.0f, seed) * 0.5f + 0.25f;
            } else if (d < 1.0f) e = b.echo;
            // Acoustic shadow straight below bright calcified/solid objects
            if (b.shadow && std::fabs(u - b.u) < b.ru * 0.9f && v > b.v + b.rv) e *= 0.12f;
        }
        return e;
    };
    // Speckle scan lines
    const int lines = 90, samples = 70;
    for (int li = 0; li < lines; ++li) {
        float u = (float(li) / float(lines - 1)) * 2.0f - 1.0f;
        float ang = u * spread;
        vec2 dir{std::sin(ang), std::cos(ang)};
        for (int si = 0; si < samples; ++si) {
            float v = float(si) / float(samples - 1);
            float r = rMin + (rMax - rMin) * v;
            float e = echoAt(u, v);
            float speckle = 0.55f + 0.9f * hash01(li * 131 + int(seed % 997), si * 71, 7u);
            float att = 1.0f - 0.35f * v;
            ImVec2 p(apex.x + dir.x * r, apex.y + dir.y * r);
            float sz = (rMax / float(samples)) * 1.3f;
            dl->AddRectFilled(ImVec2(p.x - sz * 0.8f, p.y - sz * 0.5f), ImVec2(p.x + sz * 0.8f, p.y + sz * 0.5f), gray(e * speckle * att));
        }
    }
    // Fan edges and screen text like a real machine
    for (float s : {-1.0f, 1.0f}) {
        vec2 dir{std::sin(s * spread), std::cos(s * spread)};
        dl->AddLine(ImVec2(apex.x + dir.x * rMin, apex.y + dir.y * rMin), ImVec2(apex.x + dir.x * rMax, apex.y + dir.y * rMax), IM_COL32(70, 70, 70, 255));
    }
    dl->AddText(ImVec2(o.x + 8, o.y + 6), IM_COL32(200, 200, 200, 255), "ABD  C5-2  5.0MHz");
    dl->AddText(ImVec2(o.x + 8, o.y + 22), IM_COL32(200, 200, 200, 255), "Gain 52  Depth 9cm");
    dl->AddText(ImVec2(o.x + w - 60, o.y + 6), IM_COL32(200, 200, 200, 255), "FR 24");
    for (int i = 1; i < 9; ++i) dl->AddLine(ImVec2(o.x + w - 12, o.y + h * 0.04f + (rMax / 9.0f) * float(i)),
                                           ImVec2(o.x + w - 6, o.y + h * 0.04f + (rMax / 9.0f) * float(i)), IM_COL32(180, 180, 180, 255));
}

// ---------------------------------------------------------------------------
// Radiograph: body silhouette, bones white, air black.
void xray(ImDrawList* dl, ImVec2 o, float w, float h, Hidden truth, uint32_t seed, const Species& sp) {
    Rng rng(seed);
    dl->AddRectFilled(o, ImVec2(o.x + w, o.y + h), IM_COL32(6, 8, 10, 255));
    ImVec2 c(o.x + w * 0.5f, o.y + h * 0.5f);
    bool bird = sp.shape.plan == BodyPlan::Bird;
    bool snake = sp.shape.plan == BodyPlan::Snake;
    bool shell = sp.shape.plan == BodyPlan::Turtle;
    // Soft tissue
    if (snake) {
        for (int i = 0; i < 40; ++i) {
            float t = float(i) / 39.0f;
            ImVec2 p(o.x + w * (0.05f + 0.9f * t), c.y + std::sin(t * 9.0f) * h * 0.18f);
            dl->AddCircleFilled(p, h * 0.07f, gray(0.3f));
        }
    } else {
        dl->AddEllipseFilled(c, ImVec2(w * (bird ? 0.2f : 0.34f), h * (bird ? 0.3f : 0.22f)), gray(shell ? 0.45f : 0.3f), 0.0f, 48);
        if (shell) for (int i = 0; i < 10; ++i) dl->AddCircle(c, w * (0.05f + 0.03f * float(i)), gray(0.55f, 0.4f), 32, 2.0f);
    }
    // Skeleton
    ImU32 bone = gray(0.85f);
    if (snake) {
        for (int i = 0; i < 80; ++i) {
            float t = float(i) / 79.0f;
            ImVec2 p(o.x + w * (0.05f + 0.9f * t), c.y + std::sin(t * 9.0f) * h * 0.18f);
            dl->AddCircleFilled(p, 2.5f, bone);
            dl->AddLine(ImVec2(p.x, p.y - h * 0.06f), ImVec2(p.x, p.y + h * 0.06f), gray(0.7f, 0.6f), 1.0f);
        }
    } else {
        if (bird) dl->AddLine(ImVec2(c.x, c.y - h * 0.3f), ImVec2(c.x, c.y + h * 0.25f), bone, 4.0f);            // upright spine + keel
        else dl->AddLine(ImVec2(c.x - w * 0.36f, c.y - h * 0.12f), ImVec2(c.x + w * 0.36f, c.y - h * 0.14f), bone, 5.0f);   // spine
        for (int i = 0; i < (bird ? 0 : 9); ++i) {                                                                    // ribs
            float x = c.x - w * 0.05f + float(i) * w * 0.035f;
            dl->AddBezierQuadratic(ImVec2(x, c.y - h * 0.13f), ImVec2(x + w * 0.04f, c.y + h * 0.02f), ImVec2(x + w * 0.02f, c.y + h * 0.12f), gray(0.75f), 2.5f);
        }
        if (!bird) dl->AddEllipse(ImVec2(c.x - w * 0.3f, c.y - h * 0.05f), ImVec2(w * 0.05f, h * 0.07f), bone, 0.0f, 20, 3.0f);   // pelvis
        else for (int i = 0; i < 5; ++i) dl->AddBezierQuadratic(ImVec2(c.x, c.y - h * 0.15f + float(i) * h * 0.06f), ImVec2(c.x + w * 0.12f, c.y - h * 0.1f + float(i) * h * 0.06f),
                                                                ImVec2(c.x + w * 0.14f, c.y + float(i) * h * 0.05f), gray(0.7f), 2.0f);   // bird ribs
        // Legs (one fractured if that's the problem); birds have two
        float legs[4] = {-0.3f, -0.24f, 0.22f, 0.28f};
        float birdLegs[2] = {-0.06f, 0.06f};
        int nLegs = bird ? 2 : 4;
        int broken = truth == Hidden::Fracture ? int(rng.next() % uint32_t(nLegs)) : -1;
        for (int i = 0; i < nLegs; ++i) {
            float lx = bird ? birdLegs[i] : legs[i];
            ImVec2 top(c.x + w * lx, c.y + h * (bird ? 0.22f : 0.1f)), bot(c.x + w * lx + w * 0.01f, c.y + h * 0.45f);
            if (i == broken) {
                ImVec2 mid((top.x + bot.x) * 0.5f, (top.y + bot.y) * 0.5f);
                dl->AddLine(top, ImVec2(mid.x, mid.y - 3), bone, 4.0f);
                dl->AddLine(ImVec2(mid.x + 5, mid.y + 3), ImVec2(bot.x + 5, bot.y), bone, 4.0f);   // displaced
                dl->AddLine(ImVec2(mid.x - 3, mid.y - 3), ImVec2(mid.x + 7, mid.y + 4), gray(0.1f), 1.5f);
            } else {
                dl->AddLine(top, bot, bone, 4.0f);
            }
        }
        if (!bird) dl->AddCircleFilled(ImVec2(c.x + w * 0.4f, c.y - h * 0.16f), h * 0.07f, gray(0.6f));   // skull
        else {
            dl->AddCircleFilled(ImVec2(c.x, c.y - h * 0.36f), h * 0.06f, gray(0.6f));
            dl->AddLine(ImVec2(c.x - w * 0.18f, c.y - h * 0.1f), ImVec2(c.x - w * 0.34f, c.y + h * 0.2f), bone, 3.0f);   // wings
            dl->AddLine(ImVec2(c.x + w * 0.18f, c.y - h * 0.1f), ImVec2(c.x + w * 0.34f, c.y + h * 0.2f), bone, 3.0f);
        }
    }
    // Gas in the gut (dark) - normal
    for (int i = 0; i < 5; ++i)
        dl->AddEllipseFilled(ImVec2(c.x + rng.range(-0.2f, 0.2f) * w, c.y + rng.range(-0.05f, 0.12f) * h), ImVec2(w * 0.03f, h * 0.02f), gray(0.12f), 0.0f, 16);
    if (truth == Hidden::ForeignBody) {   // metal or dense object: pure white
        ImVec2 p(c.x + rng.range(-0.15f, 0.15f) * w, c.y + rng.range(-0.02f, 0.1f) * h);
        if (rng.uniform() < 0.5f) dl->AddRectFilled(ImVec2(p.x - 6, p.y - 3), ImVec2(p.x + 10, p.y + 4), IM_COL32(255, 255, 255, 255), 2.0f);
        else dl->AddCircleFilled(p, 6.0f, IM_COL32(255, 255, 255, 255));
    }
    if (truth == Hidden::EggBinding) dl->AddEllipseFilled(ImVec2(c.x - w * 0.05f, c.y + h * 0.12f), ImVec2(w * 0.07f, h * 0.1f), gray(0.8f), 0.3f, 32);
    dl->AddText(ImVec2(o.x + 8, o.y + 6), IM_COL32(200, 200, 200, 255), "L  LAT  60kV 5mAs");
}

// ---------------------------------------------------------------------------
void dental(ImDrawList* dl, ImVec2 o, float w, float h, Hidden truth) {
    dl->AddRectFilled(o, ImVec2(o.x + w, o.y + h), IM_COL32(40, 20, 22, 255));
    ImVec2 c(o.x + w * 0.5f, o.y + h * 0.5f);
    dl->AddEllipseFilled(c, ImVec2(w * 0.4f, h * 0.36f), IM_COL32(150, 60, 70, 255), 0.0f, 48);   // mouth
    bool over = truth == Hidden::DentalOvergrowth;
    ImU32 tooth = IM_COL32(235, 225, 190, 255), yellow = IM_COL32(210, 190, 120, 255);
    // Upper and lower incisors
    float len = over ? h * 0.3f : h * 0.12f;
    for (float s : {-1.0f, 1.0f}) {
        dl->AddRectFilled(ImVec2(c.x + s * 4.0f - (s > 0 ? 0 : 14), c.y - h * 0.3f), ImVec2(c.x + s * 4.0f + (s > 0 ? 14 : 0), c.y - h * 0.3f + len), tooth, 3.0f);
        if (over) dl->AddBezierQuadratic(ImVec2(c.x + s * 11.0f, c.y - h * 0.3f + len), ImVec2(c.x + s * 30.0f, c.y + h * 0.05f),
                                         ImVec2(c.x + s * 18.0f, c.y + h * 0.15f), yellow, 8.0f);
        dl->AddRectFilled(ImVec2(c.x + s * 4.0f - (s > 0 ? 0 : 12), c.y + h * 0.3f - len * 0.8f), ImVec2(c.x + s * 4.0f + (s > 0 ? 12 : 0), c.y + h * 0.3f), tooth, 3.0f);
    }
    // Molars with spurs if overgrown
    for (int i = 0; i < 4; ++i)
        for (float s : {-1.0f, 1.0f}) {
            ImVec2 p(c.x + s * w * (0.2f + 0.04f * float(i)), c.y + h * (-0.1f + 0.06f * float(i)));
            dl->AddRectFilled(ImVec2(p.x - 7, p.y - 6), ImVec2(p.x + 7, p.y + 6), tooth, 2.0f);
            if (over && i % 2 == 0) dl->AddTriangleFilled(ImVec2(p.x - s * 7, p.y - 4), ImVec2(p.x - s * 7, p.y + 4), ImVec2(p.x - s * 18, p.y), yellow);
        }
}
}  // namespace

void drawExamResult(const Exam& e, const Species& sp, float width) {
    ImDrawList* dl = ImGui::GetWindowDrawList();
    ImVec2 o = ImGui::GetCursorScreenPos();
    float h = width * 0.66f;
    switch (e.kind) {
    case ExamKind::Ultrasound: ultrasound(dl, o, width, h, e.truth, e.seed); break;
    case ExamKind::XRay: xray(dl, o, width, h, e.truth, e.seed, sp); break;
    case ExamKind::Dental: dental(dl, o, width, h, e.truth); break;
    case ExamKind::BloodPanel: {
        // Chemistry panel with reference ranges; the player spots what's out of range
        Rng r(e.seed);
        struct Row { const char* name; float lo, hi; const char* unit; float v; };
        std::vector<Row> rows = {{"BUN", 16, 36, "mg/dL", 0}, {"Creatinine", 0.8f, 2.4f, "mg/dL", 0}, {"Glucose", 71, 159, "mg/dL", 0},
                                 {"ALT", 12, 130, "U/L", 0}, {"Total protein", 5.7f, 8.9f, "g/dL", 0}, {"Eosinophils", 0.1f, 1.2f, "K/uL", 0},
                                 {"PCV (hematocrit)", 30, 45, "%", 0}};
        for (auto& row : rows) row.v = r.range(row.lo + (row.hi - row.lo) * 0.2f, row.hi - (row.hi - row.lo) * 0.2f);
        if (e.truth == Hidden::KidneyDisease) { rows[0].v = r.range(55, 110); rows[1].v = r.range(3.5f, 7.0f); }
        if (e.truth == Hidden::Diabetes) rows[2].v = r.range(380, 560);
        if (e.truth == Hidden::Parasites) { rows[5].v = r.range(2.5f, 4.0f); rows[6].v = r.range(22, 28); }
        ImGui::BeginChild("panel", ImVec2(width, h), ImGuiChildFlags_Borders);
        ImGui::TextDisabled("IDEXX-style chemistry + CBC");
        if (ImGui::BeginTable("chem", 3, ImGuiTableFlags_RowBg | ImGuiTableFlags_BordersInnerV)) {
            ImGui::TableSetupColumn("Test");
            ImGui::TableSetupColumn("Result");
            ImGui::TableSetupColumn("Reference range");
            ImGui::TableHeadersRow();
            for (auto& row : rows) {
                ImGui::TableNextRow();
                ImGui::TableNextColumn(); ImGui::TextUnformatted(row.name);
                ImGui::TableNextColumn(); ImGui::Text("%.1f %s", double(row.v), row.unit);
                ImGui::TableNextColumn(); ImGui::TextDisabled("%.1f - %.1f", double(row.lo), double(row.hi));
            }
            ImGui::EndTable();
        }
        ImGui::EndChild();
        return;
    }
    }
    ImGui::Dummy(ImVec2(width, h));
}

// ---------------------------------------------------------------------------
void drawSurgeryField(Sim& sim, float W, float H, float time) {
    Surgery& S = sim.surgery;
    ImDrawList* dl = ImGui::GetWindowDrawList();
    ImVec2 o = ImGui::GetCursorScreenPos();
    auto toScreen = [&](vec2 p) { return ImVec2(o.x + p.x * W, o.y + p.y * H); };
    auto toField = [&](ImVec2 p) { return vec2((p.x - o.x) / W, (p.y - o.y) / H); };
    bool leg = !S.vessels.empty() && S.vessels[0].kind == 2 && S.vessels[0].name == "Femur";
    // Drape and shaved skin
    dl->AddRectFilled(o, ImVec2(o.x + W, o.y + H), IM_COL32(40, 95, 110, 255));
    ImVec2 skin0 = toScreen({0.1f, 0.03f}), skin1 = toScreen({0.9f, 0.97f});
    dl->AddRectFilled(skin0, skin1, IM_COL32(222, 170, 160, 255), 18.0f);
    // What lies under the skin: faintly visible (you know your anatomy) and fully visible inside the incision
    auto drawAnatomy = [&](float alpha) {
        for (const auto& og : S.organs) {
            ImU32 col = IM_COL32(int(og.color.x * 255), int(og.color.y * 255), int(og.color.z * 255), int(alpha * 255));
            dl->AddEllipseFilled(toScreen(og.c), ImVec2(og.r.x * W, og.r.y * H), col, 0.0f, 32);
        }
        for (const auto& v : S.vessels) {
            ImU32 col = v.kind == 0 ? IM_COL32(220, 20, 30, int(alpha * 255)) : (v.kind == 1 ? IM_COL32(40, 60, 170, int(alpha * 255)) : IM_COL32(240, 235, 215, int(alpha * 255)));
            for (size_t i = 0; i + 1 < v.pts.size(); ++i) dl->AddLine(toScreen(v.pts[i]), toScreen(v.pts[i + 1]), col, v.kind == 2 ? 9.0f : 4.0f);
        }
    };
    drawAnatomy(0.13f);
    // Suggested incision
    for (int i = 0; i < 20; i += 2) {
        vec2 a = S.guideA + (S.guideB - S.guideA) * (float(i) / 20.0f), b = S.guideA + (S.guideB - S.guideA) * (float(i + 1) / 20.0f);
        dl->AddLine(toScreen(a), toScreen(b), IM_COL32(40, 40, 160, 200), 2.0f);
    }
    // The open incision: wound edges retracted, anatomy visible inside
    if (S.cut.size() >= 2) {
        dl->PushClipRect(o, ImVec2(o.x + W, o.y + H), true);
        for (size_t i = 0; i + 1 < S.cut.size(); ++i) {
            ImVec2 a = toScreen(S.cut[i]), b = toScreen(S.cut[i + 1]);
            float open = std::min(1.0f, S.progress * 3.0f) * 16.0f + 6.0f;
            dl->AddLine(a, b, IM_COL32(120, 20, 20, 255), open * 2.0f);          // exposed tissue
        }
        // Organs and vessels near the incision are fully visible (clipped to the opening)
        for (const auto& og : S.organs) {
            bool nearCut = false;
            for (vec2 c : S.cut) nearCut |= length(c - og.c) < og.r.x + 0.05f;
            if (!nearCut) continue;
            ImU32 col = IM_COL32(int(og.color.x * 255), int(og.color.y * 255), int(og.color.z * 255), 230);
            for (size_t i = 0; i < S.cut.size(); ++i) {
                vec2 c = S.cut[i];
                vec2 d = c - og.c;
                if ((d.x * d.x) / (og.r.x * og.r.x) + (d.y * d.y) / (og.r.y * og.r.y) < 1.4f) dl->AddCircleFilled(toScreen(c), 13.0f, col);
            }
            if (og.hit) dl->AddText(toScreen(og.c), IM_COL32(255, 230, 120, 255), ("cut " + og.name).c_str());
        }
        for (size_t i = 0; i + 1 < S.cut.size(); ++i) {
            ImVec2 a = toScreen(S.cut[i]), b = toScreen(S.cut[i + 1]);
            dl->AddLine(a, b, IM_COL32(170, 10, 15, 255), 3.0f);   // fresh cut line
        }
        dl->PopClipRect();
        // The target (visible once the incision is near it)
        bool reach = false;
        for (vec2 c : S.cut) reach |= length(c - S.target) < 0.12f;
        if (reach && !S.targetDone) {
            float pulse = 0.5f + 0.5f * std::sin(time * 4.0f);
            dl->AddCircleFilled(toScreen(S.target), 9.0f, IM_COL32(90, 200, 90, 220));
            dl->AddCircle(toScreen(S.target), 14.0f + pulse * 4.0f, IM_COL32(120, 255, 120, 200), 24, 2.0f);
        }
    }
    // Blood: pools grow from every open bleeder, pumping for arteries
    float pool = std::min(1.0f, S.bloodLoss);
    for (size_t i = 0; i < S.bleeders.size(); ++i) {
        vec2 b = S.bleeders[i];
        float pulse = 0.7f + 0.3f * std::sin(time * 7.0f + float(i));
        float r = (10.0f + pool * 70.0f) * pulse;
        dl->AddCircleFilled(toScreen(b), r, IM_COL32(120, 0, 5, 200), 28);
        dl->AddCircleFilled(toScreen(b), r * 0.55f, IM_COL32(170, 10, 15, 230), 20);
        dl->AddCircle(toScreen(b), 8.0f, IM_COL32(255, 255, 0, 255), 12, 2.0f);   // click here to clamp
    }
    if (S.bleeders.empty() && pool > 0.05f)
        for (size_t i = 0; i + 1 < S.cut.size(); i += 3) dl->AddCircleFilled(toScreen(S.cut[i]), 5.0f + pool * 12.0f, IM_COL32(110, 0, 5, 160), 12);
    // Stitches
    for (vec2 s : S.stitches) {
        ImVec2 p = toScreen(s);
        dl->AddLine(ImVec2(p.x - 8, p.y - 4), ImVec2(p.x + 8, p.y + 4), IM_COL32(30, 30, 60, 255), 2.5f);
        dl->AddCircleFilled(ImVec2(p.x - 8, p.y - 4), 2.0f, IM_COL32(30, 30, 60, 255));
    }
    // Interaction
    ImGui::InvisibleButton("field", ImVec2(W, H));
    static bool dragging = false;
    static vec2 last;
    ImGuiIO& io = ImGui::GetIO();
    vec2 m = toField(io.MousePos);
    bool hovered = ImGui::IsItemHovered();
    if (S.step == 2 || S.step == 3) {
        if (hovered && ImGui::IsMouseClicked(0)) {
            // A click on a bleeder clamps it; a click on the target treats it; otherwise start cutting
            if (!sim.surgeryClampAt(m) && !sim.surgeryTreatTargetAt(m)) { dragging = true; last = m; }
        }
        if (dragging && ImGui::IsMouseDown(0)) {
            if (length(m - last) > 0.015f) { sim.surgeryCutTo(last, m); last = m; }
        }
        if (!ImGui::IsMouseDown(0)) dragging = false;
    } else if (S.step == 4) {
        if (hovered && ImGui::IsMouseClicked(0) && !sim.surgeryClampAt(m)) sim.surgeryStitchAt(m);
        dragging = false;
    }
    // Scalpel / tool cursor
    if (hovered) {
        ImVec2 p = io.MousePos;
        const char* tool = S.step == 4 ? "needle" : (S.cut.empty() ? "scalpel" : "scalpel / clamp / forceps");
        dl->AddText(ImVec2(p.x + 12, p.y - 6), IM_COL32(255, 255, 255, 220), tool);
        dl->AddLine(ImVec2(p.x - 6, p.y), ImVec2(p.x + 6, p.y), IM_COL32(255, 255, 255, 200));
        dl->AddLine(ImVec2(p.x, p.y - 6), ImVec2(p.x, p.y + 6), IM_COL32(255, 255, 255, 200));
    }
    (void)leg;
}

}  // namespace ps::clinic
