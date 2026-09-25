#include "game/CharacterModel.h"

namespace ps {

namespace {
Material skinMat(vec3 c) { return Material::make(c, 0.55f); }
Material cloth(vec3 c) { return Material::make(c, 0.9f, 0.0f, PAT_FABRIC); }
}  // namespace

void CharacterModel::build(const Appearance& a) {
    parts_.clear();
    skel_ = Skeleton();
    const bool fem = a.gender == Gender::Female;
    scale_ = a.height / 1.78f;
    const float W = 0.85f + a.weight * 0.45f;           // girth
    const float M = 0.9f + a.muscle * 0.25f;            // limb thickness
    const float SH = (fem ? 0.86f : 1.0f) * (0.88f + a.shoulders * 0.26f);
    const float HP = (fem ? 1.12f : 0.95f) * (0.9f + a.hips * 0.22f);
    const vec3 skin = a.skinColor();

    // ---- Skeleton (bind pose, facing +Z, feet at origin) ----
    int root = skel_.add("root", -1, {0, 0, 0});
    jPelvis_ = skel_.add("pelvis", root, {0, 0.98f, 0});
    jSpine_ = skel_.add("spine", jPelvis_, {0, 0.12f, 0});
    jChest_ = skel_.add("chest", jSpine_, {0, 0.22f, 0});
    jNeck_ = skel_.add("neck", jChest_, {0, 0.22f, 0});
    jHead_ = skel_.add("head", jNeck_, {0, 0.07f, 0});
    for (int s = 0; s < 2; ++s) {
        float side = s == 0 ? 1.0f : -1.0f;   // 0 = left (+X), 1 = right (-X)
        jShoulder_[s] = skel_.add(s ? "shoulderR" : "shoulderL", jChest_, {side * 0.185f * SH, 0.17f, 0});
        jElbow_[s] = skel_.add(s ? "elbowR" : "elbowL", jShoulder_[s], {0, -0.29f, 0});
        jWrist_[s] = skel_.add(s ? "wristR" : "wristL", jElbow_[s], {0, -0.26f, 0});
        jHip_[s] = skel_.add(s ? "hipR" : "hipL", jPelvis_, {side * 0.095f * HP, -0.05f, 0});
        jKnee_[s] = skel_.add(s ? "kneeR" : "kneeL", jHip_[s], {0, -0.45f, 0});
        jAnkle_[s] = skel_.add(s ? "ankleR" : "ankleL", jKnee_[s], {0, -0.43f, 0});
    }
    eyeHeight_ = (0.98f + 0.12f + 0.22f + 0.22f + 0.07f + 0.12f) * scale_;

    auto part = [&](int joint, const MeshBuilder& b) {
        Part p;
        p.joint = joint;
        p.mesh.upload(b);
        parts_.push_back(std::move(p));
    };
    const Material top = cloth(a.topColor), pants = cloth(a.pantsColor);
    const Material shoes = Material::make(a.shoeColor, 0.5f);
    const Material hair = Material::make(a.hairColor, 0.5f, 0.0f, PAT_HAIR);
    const bool longSleeves = a.topStyle == 1 || a.topStyle == 3 || a.topStyle == 4;

    // Pelvis / hips
    { MeshBuilder b; b.addEllipsoid({0, -0.02f, 0}, {0.165f * HP * W, 0.12f, 0.11f * W}, 16, 10, pants);
      b.addEllipsoid({0, 0.07f, 0}, {0.168f * HP * W, 0.022f, 0.112f * W}, 16, 4, Material::make({0.12f, 0.08f, 0.05f}, 0.4f));  // belt
      part(jPelvis_, b); }
    // Abdomen
    { MeshBuilder b; b.addEllipsoid({0, 0.08f, 0.0f}, {0.155f * W * (fem ? 0.92f : 1.0f), 0.16f, 0.105f * W * (0.9f + a.weight * 0.35f)}, 16, 10, top);
      part(jSpine_, b); }
    // Chest (+ shoulders, bust, clothing details)
    {
        MeshBuilder b;
        b.addEllipsoid({0, 0.06f, 0}, {0.18f * SH * std::max(M, W * 0.9f), 0.2f, 0.115f * W}, 18, 12, top);
        for (float s : {1.0f, -1.0f}) b.addEllipsoid({s * 0.155f * SH, 0.14f, 0}, {0.062f * M, 0.058f, 0.062f * M}, 10, 8, top);
        if (fem)
            for (float s : {1.0f, -1.0f}) b.addEllipsoid({s * 0.068f, 0.035f, 0.07f * W}, {0.062f, 0.058f, 0.045f}, 10, 8, top);
        if (a.topStyle == 1 || a.topStyle == 4) {   // collar + buttons
            b.addBox(AABB({-0.07f, 0.22f, 0.02f}, {0.07f, 0.26f, 0.1f}), top);
            for (int i = 0; i < 4; ++i)
                b.addEllipsoid({0, 0.2f - float(i) * 0.08f, 0.118f * W}, vec3(0.008f), 6, 4, Material::make({0.9f, 0.9f, 0.85f}, 0.3f));
        }
        if (a.topStyle == 3) {   // hood behind the neck + front pocket
            b.addEllipsoid({0, 0.22f, -0.09f}, {0.13f, 0.08f, 0.07f}, 12, 8, top);
            b.addBox(AABB({-0.1f, -0.17f, 0.095f * W}, {0.1f, -0.06f, 0.105f * W}), cloth(a.topColor * 0.85f));
        }
        if (a.topStyle == 2)     // scrubs V-neck + chest pocket
            b.addBox(AABB({0.05f, 0.05f, 0.11f * W}, {0.12f, 0.12f, 0.115f * W}), cloth(a.topColor * 0.8f));
        part(jChest_, b);
    }
    // Neck
    { MeshBuilder b; b.addCylinder({0, -0.05f, 0}, 0.058f * (fem ? 0.9f : 1.0f) * M, 0.12f, 12, skinMat(skin), true, 0.052f * (fem ? 0.9f : 1.0f) * M); part(jNeck_, b); }
    // Head + face + hair
    {
        MeshBuilder b;
        const float hx = 0.088f * (0.9f + a.jaw * 0.2f) * (fem ? 0.95f : 1.0f);
        const float hy = 0.118f * (0.92f + a.faceLength * 0.16f);
        const float hz = 0.1f;
        const vec3 hc{0, 0.1f, 0.01f};
        b.addEllipsoid(hc, {hx, hy, hz}, 20, 14, skinMat(skin));
        b.addEllipsoid(hc + vec3(0, -0.06f, 0.02f), {hx * 0.92f, 0.06f, 0.08f}, 14, 8, skinMat(skin));   // jaw
        for (float s : {1.0f, -1.0f}) {
            vec3 eye = hc + vec3(s * 0.037f, 0.018f, hz * 0.86f);
            b.addEllipsoid(eye, vec3(0.017f, 0.012f, 0.01f), 10, 6, Material::make({0.95f, 0.95f, 0.93f}, 0.2f));
            b.addEllipsoid(eye + vec3(0, 0, 0.007f), vec3(0.008f, 0.008f, 0.005f), 8, 6, Material::make(a.eyeRGB(), 0.15f));
            b.addEllipsoid(eye + vec3(0, 0, 0.0105f), vec3(0.0035f), 6, 4, Material::make({0.02f, 0.02f, 0.02f}, 0.1f));
            b.addBox(AABB(eye + vec3(-0.02f, 0.02f, -0.004f), eye + vec3(0.02f, 0.027f, 0.004f)), hair);   // brows
            b.addEllipsoid(hc + vec3(s * hx, 0.0f, 0.0f), vec3(0.016f, 0.03f, 0.022f), 8, 6, skinMat(skin * 0.96f));  // ears
        }
        float ns = 0.8f + a.noseSize * 0.5f;
        b.addEllipsoid(hc + vec3(0, -0.012f, hz * 0.98f), vec3(0.015f, 0.03f, 0.022f) * ns, 10, 8, skinMat(skin * 0.97f));
        b.addBox(AABB(hc + vec3(-0.022f, -0.058f, hz * 0.82f), hc + vec3(0.022f, -0.052f, hz * 0.9f)),
                 Material::make(fem ? vec3(0.6f, 0.25f, 0.25f) : skin * 0.7f, 0.4f));   // mouth
        // Hair styles
        const vec3 hr{hx + 0.01f, hy + 0.01f, hz + 0.012f};
        switch (a.hairStyle) {
        case 0: break;                                                     // bald
        case 1: b.addEllipsoid(hc + vec3(0, 0.025f, -0.008f), hr * vec3(1.0f, 0.92f, 1.0f) * 0.99f, 16, 10, hair); break;  // buzz
        case 2:                                                            // short
            b.addEllipsoid(hc + vec3(0, 0.035f, -0.012f), hr * vec3(1.04f, 0.95f, 1.03f), 16, 10, hair); break;
        case 3:                                                            // side part
            b.addEllipsoid(hc + vec3(0.005f, 0.04f, -0.01f), hr * vec3(1.06f, 0.96f, 1.04f), 16, 10, hair);
            b.addEllipsoid(hc + vec3(-0.03f, 0.1f, 0.05f), vec3(0.07f, 0.035f, 0.06f), 10, 6, hair); break;
        case 4:                                                            // long
            b.addEllipsoid(hc + vec3(0, 0.03f, -0.015f), hr * vec3(1.07f, 0.98f, 1.05f), 16, 10, hair);
            b.addEllipsoid(hc + vec3(0, -0.1f, -0.05f), vec3(hx + 0.02f, 0.2f, 0.07f), 14, 10, hair); break;
        case 5:                                                            // ponytail
            b.addEllipsoid(hc + vec3(0, 0.03f, -0.012f), hr * vec3(1.04f, 0.96f, 1.03f), 16, 10, hair);
            b.addEllipsoid(hc + vec3(0, 0.02f, -0.13f), vec3(0.035f, 0.035f, 0.04f), 8, 6, hair);
            b.addEllipsoid(hc + vec3(0, -0.1f, -0.15f), vec3(0.04f, 0.12f, 0.04f), 10, 8, hair); break;
        case 6:                                                            // bun
            b.addEllipsoid(hc + vec3(0, 0.03f, -0.012f), hr * vec3(1.04f, 0.96f, 1.03f), 16, 10, hair);
            b.addEllipsoid(hc + vec3(0, 0.12f, -0.09f), vec3(0.055f), 10, 8, hair); break;
        default:                                                           // curly / afro
            b.addEllipsoid(hc + vec3(0, 0.06f, -0.035f), vec3(hx * 1.32f, hy * 1.08f, hz * 1.1f), 18, 12, hair);
            for (int i = 0; i < 12; ++i) {
                float ang = float(i) / 12.0f * 2.0f * kPi;
                if (std::sin(ang) > 0.45f) continue;   // keep the face clear
                b.addEllipsoid(hc + vec3(std::cos(ang) * hx * 1.25f, 0.08f + 0.025f * std::sin(ang * 3.0f), std::sin(ang) * hz * 1.1f - 0.03f),
                               vec3(0.042f), 8, 6, hair);
            }
            break;
        }
        // Facial hair
        if (a.facialHair == 1)
            b.addEllipsoid(hc + vec3(0, -0.055f, 0.012f), vec3(hx * 0.95f, 0.058f, 0.083f), 14, 8, Material::make(a.hairColor * 0.8f + skin * 0.2f, 0.9f));
        if (a.facialHair == 2 || a.facialHair == 3)
            b.addBox(AABB(hc + vec3(-0.03f, -0.048f, hz * 0.9f), hc + vec3(0.03f, -0.036f, hz * 0.98f)), hair);
        if (a.facialHair == 3)
            b.addEllipsoid(hc + vec3(0, -0.085f, 0.035f), vec3(hx * 0.85f, 0.045f, 0.07f), 14, 8, hair);
        // Accessories
        if (a.accessory == 1) {   // glasses
            Material frame = Material::make({0.05f, 0.05f, 0.05f}, 0.3f, 0.5f);
            for (float s : {1.0f, -1.0f}) {
                vec3 e = hc + vec3(s * 0.037f, 0.018f, hz * 0.95f + 0.012f);
                b.addBox(AABB(e + vec3(-0.026f, 0.017f, 0), e + vec3(0.026f, 0.021f, 0.004f)), frame);
                b.addBox(AABB(e + vec3(-0.026f, -0.017f, 0), e + vec3(0.026f, -0.013f, 0.004f)), frame);
                b.addBox(AABB(e + vec3(s * 0.024f, -0.017f, 0), e + vec3(s * 0.028f, 0.021f, 0.004f)), frame);
                b.addBox(AABB(hc + vec3(s * (hx - 0.002f), 0.032f, -0.06f), hc + vec3(s * (hx + 0.004f), 0.037f, hz * 0.95f)), frame);
            }
        } else if (a.accessory == 2) {   // cap
            Material cap = cloth(a.topColor * 0.7f + vec3(0.1f));
            b.addEllipsoid(hc + vec3(0, 0.05f, -0.005f), vec3(hx + 0.018f, hy * 0.72f, hz + 0.018f), 16, 8, cap);
            b.addBox(AABB(hc + vec3(-0.07f, 0.045f, hz * 0.7f), hc + vec3(0.07f, 0.055f, hz + 0.08f)), cap);
        }
        part(jHead_, b);
    }
    // Arms
    for (int s = 0; s < 2; ++s) {
        MeshBuilder up, lo, hand;
        up.addEllipsoid({0, -0.14f, 0}, {0.055f * M * W * 0.95f, 0.16f, 0.055f * M * W * 0.95f}, 12, 8, top);
        lo.addEllipsoid({0, -0.12f, 0}, {0.045f * M, 0.14f, 0.045f * M}, 12, 8, longSleeves ? top : skinMat(skin));
        if (!longSleeves) up.addEllipsoid({0, -0.2f, 0}, {0.048f * M, 0.1f, 0.048f * M}, 10, 6, skinMat(skin));
        hand.addEllipsoid({0, -0.06f, 0.005f}, {0.035f, 0.07f, 0.022f}, 10, 8, skinMat(skin));
        hand.addEllipsoid({(s == 0 ? -1.0f : 1.0f) * 0.03f, -0.04f, 0.02f}, {0.012f, 0.035f, 0.012f}, 6, 4, skinMat(skin));  // thumb
        part(jShoulder_[s], up);
        part(jElbow_[s], lo);
        part(jWrist_[s], hand);
    }
    // Legs
    for (int s = 0; s < 2; ++s) {
        MeshBuilder th, sh, ft;
        th.addEllipsoid({0, -0.21f, 0}, {0.075f * W * HP * 0.95f, 0.25f, 0.078f * W}, 12, 10, pants);
        sh.addEllipsoid({0, -0.21f, 0}, {0.056f * M, 0.23f, 0.058f * M}, 12, 10, pants);
        ft.addBox(AABB({-0.05f, -0.07f, -0.06f}, {0.05f, 0.02f, 0.17f}), shoes);
        ft.addBox(AABB({-0.052f, -0.075f, -0.065f}, {0.052f, -0.06f, 0.175f}), Material::make({0.9f, 0.9f, 0.88f}, 0.6f));  // soles
        part(jHip_[s], th);
        part(jKnee_[s], sh);
        part(jAnkle_[s], ft);
    }
    animate(0.0f, 0.0f, 0.0f);
}

void CharacterModel::animate(float time, float phase, float walk, float lookYaw) {
    skel_.resetPose();
    auto rx = [](float a) { return quat::axisAngle({1, 0, 0}, a); };
    auto rz = [](float a) { return quat::axisAngle({0, 0, 1}, a); };
    auto ry = [](float a) { return quat::axisAngle({0, 1, 0}, a); };
    walk = saturate(walk);
    float idle = 1.0f - walk;
    float breathe = std::sin(time * 1.6f);

    // Idle: breathing, weight shift, relaxed arms, glancing around
    skel_.joints[size_t(jChest_)].scale = {1.0f + breathe * 0.008f, 1.0f + breathe * 0.012f, 1.0f + breathe * 0.012f};
    float sway = std::sin(time * 0.7f) * 0.03f * idle;
    skel_.joints[size_t(jPelvis_)].rot = rz(sway);
    skel_.joints[size_t(jSpine_)].rot = rz(-sway * 0.7f);
    skel_.joints[size_t(jHead_)].rot = ry(lookYaw + std::sin(time * 0.37f) * 0.25f * idle) * rx(std::sin(time * 0.53f) * 0.05f * idle);

    // Walk cycle
    float s = std::sin(phase), c = std::cos(phase);
    for (int side = 0; side < 2; ++side) {
        float sgn = side == 0 ? 1.0f : -1.0f;
        float legSwing = s * sgn * 0.5f * walk;
        float knee = std::max(0.0f, -std::sin(phase * 1.0f + (side ? kPi : 0.0f) + 0.6f)) * 0.9f * walk + 0.05f;
        skel_.joints[size_t(jHip_[side])].rot = rx(-legSwing);
        skel_.joints[size_t(jKnee_[side])].rot = rx(knee);
        skel_.joints[size_t(jAnkle_[side])].rot = rx(-knee * 0.3f + legSwing * 0.3f);
        float armSwing = -s * sgn * 0.4f * walk;
        skel_.joints[size_t(jShoulder_[side])].rot = rx(armSwing) * rz(sgn * (0.07f + 0.02f * breathe * idle));
        skel_.joints[size_t(jElbow_[side])].rot = rx(-0.15f - 0.25f * walk - std::max(0.0f, armSwing) * 0.4f);
    }
    skel_.joints[size_t(jPelvis_)].offset.y = 0.98f + std::fabs(c) * 0.03f * walk - 0.015f * walk;
    skel_.joints[size_t(jChest_)].rot = ry(-s * 0.08f * walk);
    skel_.joints[size_t(jPelvis_)].rot = skel_.joints[size_t(jPelvis_)].rot * ry(s * 0.1f * walk);
}

void CharacterModel::draw(Renderer& r, const mat4& root) const {
    Skeleton sk = skel_;
    sk.solve(root * mat4::scale(vec3(scale_)));
    for (const Part& p : parts_) r.draw(p.mesh, sk.world[size_t(p.joint)]);
}

}  // namespace ps
