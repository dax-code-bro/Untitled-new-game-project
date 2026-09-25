#include "game/AnimalAnimator.h"
#include "core/Noise.h"
#include <cmath>

namespace ps {

namespace {
struct Info { const char* name; bool loops; float dur; };
const Info kInfo[] = {
    {"Idle", true, 6}, {"Walk", true, 4}, {"Run", true, 3}, {"Sit", true, 6}, {"Lie down", true, 8}, {"Sleep", true, 12},
    {"Eat", true, 6}, {"Drink", true, 5}, {"Sniff", true, 4}, {"Look around", true, 5}, {"Scratch", false, 2.5f},
    {"Groom", true, 5}, {"Shake off", false, 1.6f}, {"Yawn", false, 2.2f}, {"Stretch", false, 3}, {"Wag (happy)", true, 4},
    {"Play bow", false, 2.2f}, {"Beg", true, 4}, {"Pant", true, 5}, {"Vocalize", false, 1.4f}, {"Growl", true, 3},
    {"Hiss", true, 2.5f}, {"Cower", true, 5}, {"Tremble", true, 4}, {"Limp", true, 4}, {"Charge", false, 1.5f},
    {"Bite", false, 0.8f}, {"Kick", false, 1.2f}, {"Rear up", false, 2.4f}, {"Headbutt", false, 1.4f}, {"Pounce", false, 1.4f},
    {"Dig", true, 4}, {"Thump", false, 1.2f}, {"Binky", false, 1.2f}, {"Knead", true, 4}, {"Roll over", false, 3},
    {"Peck", true, 3}, {"Flap wings", false, 1.8f}, {"Preen", true, 4}, {"Coil", true, 6}, {"Strike", false, 0.9f},
    {"Hood up", true, 4}, {"Hide in shell", true, 5}, {"Chest beat", false, 2.5f}, {"Stand up", false, 3},
    {"Sedated", true, 10}, {"Dead", true, 10},
};
static_assert(sizeof(kInfo) / sizeof(kInfo[0]) == size_t(AnimAction::Count), "action table");

float ease(float x) { x = clampf(x, 0.0f, 1.0f); return x * x * (3.0f - 2.0f * x); }
// 0 -> 1 over `in` seconds, holds, back to 0 over the last `out` seconds of `dur`
float envelope(float t, float dur, float in, float out) {
    return ease(t / std::max(in, 1e-3f)) * ease((dur - t) / std::max(out, 1e-3f));
}
bool isCat(const Species& s) { return s.shape.nose == Nose::Cat; }
bool isDogLike(const Species& s) { return s.shape.nose == Nose::Dog && s.shape.plan == BodyPlan::Quadruped; }
bool hoofed(const Species& s) { return s.shape.foot == Foot::Hoof || s.shape.foot == Foot::Cloven; }
}  // namespace

const char* actionName(AnimAction a) { return kInfo[size_t(a)].name; }
bool actionLoops(AnimAction a) { return kInfo[size_t(a)].loops; }
float actionDuration(AnimAction a) { return kInfo[size_t(a)].dur; }

bool actionAvailable(const Species& sp, AnimAction a) {
    const AnimalShape& S = sp.shape;
    const BodyPlan p = S.plan;
    const bool quad = p == BodyPlan::Quadruped || p == BodyPlan::Primate;
    using A = AnimAction;
    switch (a) {
    case A::Idle: case A::Walk: case A::Eat: case A::LookAround: case A::Sleep: case A::Vocalize: case A::Sedated: case A::Dead:
    case A::Cower: case A::Tremble: case A::Sniff: case A::Drink:
        return true;
    case A::Run: return p != BodyPlan::Turtle;
    case A::Sit: return quad && !hoofed(sp);
    case A::LieDown: return quad || p == BodyPlan::Bird;
    case A::Scratch: return quad && !hoofed(sp) && p != BodyPlan::Primate;
    case A::Groom: return quad;
    case A::Shake: return quad || p == BodyPlan::Bird;
    case A::Yawn: return quad || p == BodyPlan::Lizard;
    case A::Stretch: return quad && !hoofed(sp);
    case A::WagHappy: return quad && S.tail != Tail::None && S.tail != Tail::Stub && !hoofed(sp);
    case A::PlayBow: return isDogLike(sp) || sp.category == "Canid";
    case A::Beg: return isDogLike(sp) || S.gait == Gait::Hop || sp.category == "Rodent";
    case A::Pant: return isDogLike(sp) || sp.category == "Canid" || sp.category == "Hyena";
    case A::Growl: return quad && sp.temperament > 0.2f;
    case A::Hiss: return isCat(sp) || p == BodyPlan::Snake || p == BodyPlan::Lizard || sp.category == "Marsupial" ||
                         sp.name == "Canada Goose" || p == BodyPlan::Turtle;
    case A::Limp: return quad;
    case A::Attack: return sp.temperament > 0.4f && p != BodyPlan::Turtle;
    case A::Bite: return p != BodyPlan::Bird;
    case A::Kick: return hoofed(sp) || S.gait == Gait::Hop;
    case A::RearUp: return sp.category == "Horse" || sp.category == "Bear" || sp.category == "Camelid";
    case A::Headbutt: return S.horns != Horns::None || sp.category == "Goat" || sp.category == "Sheep";
    case A::Pounce: return isCat(sp) || sp.category == "Canid";
    case A::Dig: return isDogLike(sp) || S.gait == Gait::Hop || sp.category == "Rodent" || sp.category == "Mustelid" ||
                        sp.category == "Armadillo" || sp.category == "Pig" || sp.category == "Skunk";
    case A::Thump: case A::Binky: return S.gait == Gait::Hop;
    case A::Knead: return isCat(sp) && sp.cls != AnimalClass::Restricted;
    case A::RollOver: return quad && !hoofed(sp) && S.gait != Gait::Hop;
    case A::Peck: case A::FlapWings: case A::Preen: return p == BodyPlan::Bird;
    case A::Coil: case A::Strike: return p == BodyPlan::Snake;
    case A::HoodUp: return (S.extras & X_HOOD) != 0;
    case A::Retract: return p == BodyPlan::Turtle;
    case A::ChestBeat: return p == BodyPlan::Primate;
    case A::StandUp: return sp.category == "Bear" || sp.category == "Rodent" || S.gait == Gait::Hop || p == BodyPlan::Primate ||
                            sp.category == "Raccoon";
    default: return false;
    }
}

std::vector<AnimAction> availableActions(const Species& sp) {
    std::vector<AnimAction> v;
    for (int i = 0; i < int(AnimAction::Count); ++i)
        if (actionAvailable(sp, AnimAction(i))) v.push_back(AnimAction(i));
    return v;
}

void AnimChannels::blend(const AnimChannels& o, float w) {
    const float* src = reinterpret_cast<const float*>(&o);
    float* dst = reinterpret_cast<float*>(this);
    for (size_t i = 0; i < sizeof(AnimChannels) / sizeof(float); ++i) dst[i] += (src[i] - dst[i]) * w;
}

void AnimalAnimator::init(const AnimalRig& rig, const Species& sp, uint32_t seed) {
    rig_ = &rig;
    sp_ = &sp;
    world_.assign(rig.bones.size(), mat4());
    skin_.assign(rig.bones.size(), mat4());
    Rng r(seed * 13u + 5u);
    rnd_ = r.range(0.0f, 100.0f);
    clock_ = r.range(0.0f, 10.0f);
    pose();
}

void AnimalAnimator::play(AnimAction a, float fade) {
    if (a == action_) return;
    prev_ = action_;
    prevT_ = t_;
    action_ = a;
    t_ = 0.0f;
    fade_ = std::max(fade, 0.01f);
    fadeT_ = 0.0f;
}

bool AnimalAnimator::finished() const { return !actionLoops(action_) && t_ >= actionDuration(action_); }

void AnimalAnimator::update(float dt) {
    if (!rig_) return;
    clock_ += dt;
    t_ += dt;
    prevT_ += dt;
    fadeT_ = std::min(1.0f, fadeT_ + dt / fade_);
    // Gait phase: strides per second from speed and leg length
    float stride = std::max(rig_->legLen * 2.2f, 0.05f);
    float spd = speed_;
    if (action_ == AnimAction::Walk && spd < 0.01f) spd = std::max(rig_->legLen * 1.4f, 0.2f) * sp_->shape.gaitSpeed;
    if (action_ == AnimAction::Run && spd < 0.01f) spd = std::max(rig_->legLen * 5.0f, 0.8f) * sp_->shape.gaitSpeed;
    if (action_ == AnimAction::Limp && spd < 0.01f) spd = std::max(rig_->legLen * 0.8f, 0.1f);
    phase_ = std::fmod(phase_ + dt * spd / stride, 1.0f);
    speed_ = spd;

    AnimChannels a, b;
    evaluate(action_, t_, a);
    if (fadeT_ < 1.0f) {
        evaluate(prev_, prevT_, b);
        b.blend(a, ease(fadeT_));
        cur_ = b;
    } else {
        cur_ = a;
    }
    pose();
}

// ---------------------------------------------------------------------------
// Gait: leg swing and body bob from the phase. amount 0 = standing still.
void AnimalAnimator::gait(AnimChannels& c, float amount) const {
    const AnimalShape& S = sp_->shape;
    const float tau = 2.0f * kPi;
    const bool running = action_ == AnimAction::Run || action_ == AnimAction::Attack;
    float offs[4];
    if (S.plan == BodyPlan::Bird) { offs[0] = offs[1] = 0; offs[2] = 0.0f; offs[3] = 0.5f; }
    else if (S.gait == Gait::Hop || S.gait == Gait::Bound || (running && !hoofed(*sp_) && S.plan == BodyPlan::Quadruped)) {
        // bound / rotary gallop: hind pair then front pair
        offs[2] = 0.0f; offs[3] = 0.08f; offs[0] = 0.5f; offs[1] = 0.58f;
    } else if (running) {   // hoofed gallop
        offs[2] = 0.0f; offs[3] = 0.12f; offs[0] = 0.45f; offs[1] = 0.6f;
    } else {                // lateral-sequence walk
        offs[2] = 0.0f; offs[0] = 0.25f; offs[3] = 0.5f; offs[1] = 0.75f;
    }
    float swingAmp = (running ? 0.75f : 0.42f) * amount;
    for (int l = 0; l < 4; ++l) {
        float ph = std::fmod(phase_ + offs[l], 1.0f);
        float sw = std::sin(ph * tau);                    // + back, - forward
        float lift = std::max(0.0f, -std::cos(ph * tau)); // foot lifted in the forward swing
        bool front = l < 2;
        c.leg[l][0] += sw * swingAmp * (front ? 0.8f : 1.0f);
        c.leg[l][1] += (front ? -1.0f : 1.0f) * lift * 0.6f * amount;
        c.leg[l][2] += (front ? 1.0f : -1.0f) * lift * 0.7f * amount;
        c.leg[l][3] += lift * 0.4f * amount;
    }
    float bob = std::sin(phase_ * tau * 2.0f);
    c.rootY += -std::fabs(bob) * rig_->legLen * (running ? 0.06f : 0.025f) * amount;
    c.spinePitch += (running ? std::sin(phase_ * tau) * 0.12f : 0.0f) * amount;
    c.headPitch += bob * 0.04f * amount;
    c.tailYaw += std::sin(phase_ * tau) * 0.15f * amount;
    if (S.gait == Gait::Waddle || S.plan == BodyPlan::Bird) c.rootRoll += std::sin(phase_ * tau) * 0.12f * amount;
    if (S.plan == BodyPlan::Bird && S.beak == Beak::Chicken) c.neckPitch += std::sin(phase_ * tau * 2.0f) * 0.25f * amount;   // head bob
    if (S.plan == BodyPlan::Snake) { c.slither = 0.6f * amount; c.slitherPhase = phase_ * tau * 2.0f; }
    if (S.plan == BodyPlan::Lizard) c.spineYaw += std::sin(phase_ * tau) * 0.25f * amount;
}

// ---------------------------------------------------------------------------
// Every action as channel curves. t = seconds into the action.
void AnimalAnimator::evaluate(AnimAction a, float t, AnimChannels& c) const {
    using A = AnimAction;
    c = AnimChannels();
    const AnimalShape& S = sp_->shape;
    const float H = rig_->hipH, legLen = rig_->legLen;
    const float breathe = std::sin(clock_ * 2.4f / std::max(0.3f, S.gaitSpeed * 0.5f + 0.5f));
    const bool quad = S.plan == BodyPlan::Quadruped || S.plan == BodyPlan::Primate;
    const float dur = actionDuration(a);
    const float n = rnd_;
    // Ambient life on top of everything: breathing, ear flicks, tail swish
    c.spinePitch += breathe * 0.01f;
    float flick = std::pow(std::max(0.0f, std::sin(clock_ * 0.7f + n)), 40.0f);
    c.earL += flick * 0.4f;
    c.earR += std::pow(std::max(0.0f, std::sin(clock_ * 0.53f + n * 2.0f)), 40.0f) * 0.4f;
    c.tailYaw += std::sin(clock_ * 0.9f + n) * 0.08f;

    // Folded-leg poses shared by sit/lie/sleep
    auto sitPose = [&](float w) {
        if (!quad) return;
        c.rootPitch += -0.55f * w;                   // chest up
        c.rootY += -H * 0.32f * w;
        for (int l = 2; l < 4; ++l) { c.leg[l][0] += -1.1f * w; c.leg[l][1] += 1.9f * w; c.leg[l][2] += -1.2f * w; c.leg[l][3] += 0.5f * w; }
        for (int l = 0; l < 2; ++l) c.leg[l][0] += 0.55f * w;   // front legs stay vertical
        c.neckPitch += 0.35f * w;
        c.headPitch += 0.15f * w;
        c.tailLift += -0.5f * w;
    };
    auto liePose = [&](float w) {
        if (S.plan == BodyPlan::Bird) { c.rootY += -legLen * 0.8f * w; for (int l = 2; l < 4; ++l) c.leg[l][1] += 1.4f * w; return; }
        if (!quad) return;
        c.rootY += -(rig_->shoulderH - rig_->shoulderH * 0.45f) * w * (S.gait == Gait::Hop ? 0.3f : 1.0f);
        for (int l = 0; l < 2; ++l) { c.leg[l][0] += -1.3f * w; c.leg[l][1] += 1.4f * w; c.leg[l][2] += -0.3f * w; }
        for (int l = 2; l < 4; ++l) { c.leg[l][0] += -0.9f * w; c.leg[l][1] += 2.0f * w; c.leg[l][2] += -1.3f * w; }
        c.tailLift += -0.6f * w;
        c.neckPitch += -0.1f * w;
    };

    switch (a) {
    case A::Idle: {
        // Occasionally look around, shift weight
        c.headYaw += std::sin(t * 0.37f + n) * 0.25f;
        c.neckPitch += std::sin(t * 0.23f + n) * 0.06f;
        c.rootRoll += std::sin(t * 0.2f) * 0.02f;
        break;
    }
    case A::Walk: gait(c, 1.0f); break;
    case A::Run: gait(c, 1.0f); c.neckPitch += 0.15f; c.earBack += 0.5f; c.tailLift += 0.2f; break;
    case A::Limp: {
        gait(c, 0.7f);
        float ph = std::sin(phase_ * 2.0f * kPi);
        c.leg[0][0] = -0.3f; c.leg[0][1] = -0.9f; c.leg[0][2] = 0.9f;   // holds up the hurt front leg
        c.rootRoll += 0.05f + ph * 0.04f;
        c.headPitch += 0.2f + std::max(0.0f, ph) * 0.15f;
        c.tailLift += -0.4f;
        c.earBack += 0.4f;
        break;
    }
    case A::Sit: sitPose(ease(t / 0.6f)); c.headYaw += std::sin(t * 0.3f + n) * 0.2f; break;
    case A::LieDown: liePose(ease(t / 0.9f)); c.headYaw += std::sin(t * 0.25f + n) * 0.25f; break;
    case A::Sleep: {
        float w = ease(t / 1.2f);
        liePose(w);
        c.neckPitch += 0.5f * w; c.headPitch += 0.3f * w; c.headRoll += 0.3f * w;
        c.spineYaw += 0.35f * w;            // curl up
        c.tailYaw += 0.8f * w;
        c.earBack += 0.3f * w;
        c.spinePitch += std::sin(clock_ * 1.3f) * 0.015f;  // slow deep breaths
        if (S.plan == BodyPlan::Snake) c.coil = w;
        if (S.plan == BodyPlan::Turtle) c.neckPitch += 0.6f * w;
        break;
    }
    case A::Eat: {
        float w = ease(t / 0.5f);
        c.neckPitch += 0.9f * w; c.headPitch += 0.4f * w;
        c.jaw += (0.1f + 0.12f * std::max(0.0f, std::sin(t * 9.0f))) * w;   // chewing
        if (S.plan == BodyPlan::Bird) c.neckPitch += std::max(0.0f, std::sin(t * 7.0f)) * 0.5f * w;
        break;
    }
    case A::Drink: {
        float w = ease(t / 0.6f);
        c.neckPitch += 1.0f * w; c.headPitch += 0.3f * w;
        c.tongue += std::max(0.0f, std::sin(t * 11.0f)) * w;
        c.jaw += 0.08f * w;
        break;
    }
    case A::Sniff: {
        float w = ease(t / 0.4f);
        c.neckPitch += 0.7f * w;
        c.headYaw += std::sin(t * 1.3f + n) * 0.35f * w;
        c.headPitch += std::sin(t * 18.0f) * 0.02f * w;    // nose twitch
        gait(c, 0.25f);
        break;
    }
    case A::LookAround: {
        float k = std::sin(t * 0.9f + n);
        c.neckYaw += k * 0.5f; c.headYaw += k * 0.4f; c.neckPitch += -0.15f; c.earL += 0.2f; c.earR += 0.2f;
        break;
    }
    case A::Scratch: {
        float w = envelope(t, dur, 0.3f, 0.3f);
        sitPose(w * 0.8f);
        c.leg[3][0] += -1.0f * w; c.leg[3][1] += (1.4f + std::sin(t * 30.0f) * 0.3f) * w;   // fast scratching kicks
        c.headRoll += 0.4f * w; c.headYaw += -0.3f * w; c.neckYaw += -0.3f * w;
        break;
    }
    case A::Groom: {
        float w = ease(t / 0.5f);
        if (isCat(*sp_)) {
            sitPose(w);
            c.leg[0][0] += -1.2f * w; c.leg[0][1] += -1.5f * w;       // paw up to the face
            c.headPitch += (0.3f + std::sin(t * 6.0f) * 0.12f) * w;
            c.tongue += std::max(0.0f, std::sin(t * 6.0f)) * w;
        } else {
            liePose(w * 0.8f);
            c.neckYaw += 0.9f * w; c.neckPitch += 0.5f * w;
            c.headPitch += std::sin(t * 7.0f) * 0.1f * w;
            c.tongue += std::max(0.0f, std::sin(t * 7.0f)) * w;
        }
        break;
    }
    case A::Shake: {
        float w = envelope(t, dur, 0.15f, 0.3f);
        float s = std::sin(t * 38.0f);
        c.spineRoll += s * 0.35f * w; c.rootRoll += s * 0.15f * w; c.headRoll += -s * 0.5f * w;
        c.earL += s * 0.6f * w; c.earR -= s * 0.6f * w; c.tailYaw += s * 0.6f * w;
        if (S.plan == BodyPlan::Bird) c.wingOpen += 0.3f * w;
        break;
    }
    case A::Yawn: {
        float w = envelope(t, dur, 0.6f, 0.6f);
        c.jaw += 0.75f * w; c.headPitch += -0.35f * w; c.earBack += 0.6f * w; c.tongue += 0.4f * w;
        break;
    }
    case A::Stretch: {
        float w = envelope(t, dur, 0.7f, 0.7f);
        float front = std::min(1.0f, w * 2.0f), back = std::max(0.0f, w * 2.0f - 1.0f);
        c.rootPitch += 0.35f * front;                           // front end down, rump up
        for (int l = 0; l < 2; ++l) c.leg[l][0] += -1.2f * front;
        c.neckPitch += -0.2f * front; c.jaw += 0.3f * back; c.tailLift += 0.5f * front;
        break;
    }
    case A::WagHappy: {
        c.tailYaw += std::sin(t * 16.0f) * 0.6f;
        c.tailLift += 0.45f;
        c.spineYaw += std::sin(t * 16.0f) * 0.06f;    // whole back end wiggles
        c.earBack += 0.25f; c.jaw += 0.12f; c.tongue += 0.3f;
        break;
    }
    case A::PlayBow: {
        float w = envelope(t, dur, 0.3f, 0.4f);
        c.rootPitch += 0.45f * w; c.rootY += -legLen * 0.2f * w;
        for (int l = 0; l < 2; ++l) { c.leg[l][0] += -1.3f * w; c.leg[l][1] += 1.1f * w; }
        c.tailLift += 0.7f * w; c.tailYaw += std::sin(t * 18.0f) * 0.5f * w; c.jaw += 0.2f * w;
        break;
    }
    case A::Beg: {
        float w = ease(t / 0.6f);
        sitPose(w);
        c.rootPitch += -0.25f * w;
        for (int l = 0; l < 2; ++l) { c.leg[l][0] += -0.5f * w; c.leg[l][1] += -1.2f * w; c.leg[l][2] += 0.6f * w; }
        c.headPitch += -0.3f * w; c.earL += 0.2f; c.earR += 0.2f;
        break;
    }
    case A::Pant: {
        float p = std::sin(t * 14.0f);
        c.jaw += 0.3f + p * 0.05f; c.tongue += 1.0f; c.spinePitch += p * 0.02f;
        break;
    }
    case A::Vocalize: {
        float w = envelope(t, dur, 0.1f, 0.3f);
        float pulse = std::max(0.0f, std::sin(t * (isCat(*sp_) ? 4.0f : 12.0f)));
        c.jaw += (0.15f + 0.45f * pulse) * w;
        c.headPitch += -0.25f * w * (S.nose == Nose::Horse || S.nose == Nose::Cow ? 1.6f : 1.0f);
        if (sp_->category == "Canid") { c.neckPitch += -0.8f * w; c.headPitch += -0.4f * w; }   // howl
        if (S.plan == BodyPlan::Bird) c.wingOpen += 0.2f * pulse * w;
        break;
    }
    case A::Growl: {
        c.neckPitch += 0.35f; c.headPitch += 0.1f; c.jaw += 0.18f + std::sin(t * 30.0f) * 0.02f;
        c.earBack += 1.0f; c.tailLift += isCat(*sp_) ? -0.2f : 0.5f; c.rootY += -legLen * 0.08f;
        for (int l = 0; l < 4; ++l) c.leg[l][1] += (l < 2 ? -0.2f : 0.2f);
        break;
    }
    case A::Hiss: {
        c.jaw += 0.55f; c.earBack += 1.2f; c.headPitch += -0.1f;
        if (isCat(*sp_)) { c.spinePitch += -0.35f; c.tailLift += 0.9f; c.rootY += legLen * 0.05f; }   // arched back
        if (S.plan == BodyPlan::Snake) { c.coil = 0.6f; c.neckPitch += -0.6f; }
        if (S.plan == BodyPlan::Bird) { c.wingOpen += 0.6f; c.neckPitch += 0.4f; }
        break;
    }
    case A::Cower: {
        float w = ease(t / 0.5f);
        c.rootY += -legLen * 0.35f * w; c.rootPitch += 0.1f * w;
        for (int l = 0; l < 4; ++l) c.leg[l][1] += (l < 2 ? -0.5f : 0.7f) * w;
        c.neckPitch += 0.6f * w; c.earBack += 1.3f * w; c.tailLift += -1.1f * w; c.tailYaw += 0.3f * w;   // tail tucked
        c.headYaw += std::sin(t * 0.8f) * 0.1f;
        if (S.plan == BodyPlan::Turtle) c.neckPitch += 0.8f * w;
        break;
    }
    case A::Tremble: {
        float s = std::sin(t * 55.0f) * 0.02f;
        c.rootRoll += s; c.spineRoll += s; c.headRoll += s * 2.0f; c.earBack += 0.8f; c.tailLift += -0.7f;
        c.rootY += -legLen * 0.1f;
        break;
    }
    case A::Attack: {
        float w = envelope(t, dur, 0.1f, 0.2f);
        gait(c, 1.0f);
        c.neckPitch += 0.25f * w; c.jaw += 0.6f * w; c.earBack += 1.2f * w;
        if (S.plan == BodyPlan::Bird) { c.wingOpen += 0.9f * w; c.wingFlap += std::sin(t * 20.0f) * w; }
        break;
    }
    case A::Bite: {
        float lunge = std::sin(clampf(t / dur, 0.0f, 1.0f) * kPi);
        c.rootZ += lunge * rig_->headLen * 0.9f; c.neckPitch += 0.2f * lunge; c.headPitch += 0.1f * lunge;
        c.jaw += (t < dur * 0.4f ? 0.8f : 0.05f) * lunge; c.earBack += 1.0f;
        for (int l = 2; l < 4; ++l) c.leg[l][0] += 0.3f * lunge;
        break;
    }
    case A::Kick: {
        float w = envelope(t, dur, 0.15f, 0.4f);
        c.rootPitch += 0.25f * w;                             // weight onto the front legs
        for (int l = 2; l < 4; ++l) { c.leg[l][0] += 0.75f * w; c.leg[l][1] += -0.3f * w; c.leg[l][2] += 0.25f * w; }
        c.neckPitch += 0.3f * w; c.earBack += 1.0f * w; c.tailLift += 0.4f * w;
        break;
    }
    case A::RearUp: {
        float w = envelope(t, dur, 0.5f, 0.6f);
        c.rootPitch += -0.95f * w; c.rootY += legLen * 0.1f * w;
        for (int l = 2; l < 4; ++l) { c.leg[l][0] += -0.4f * w; c.leg[l][1] += 0.5f * w; }
        for (int l = 0; l < 2; ++l) { c.leg[l][0] += -0.2f + std::sin(t * 8.0f + float(l)) * 0.6f * w; c.leg[l][1] += -1.2f * w; c.leg[l][2] += 1.1f * w; }
        c.neckPitch += 0.3f * w; c.headPitch += -0.3f * w; c.jaw += 0.3f * w;
        break;
    }
    case A::Headbutt: {
        float x = clampf(t / dur, 0.0f, 1.0f);
        float charge = std::sin(x * kPi);
        c.neckPitch += 0.8f * charge; c.headPitch += 0.5f * charge;
        c.rootZ += (x < 0.6f ? x / 0.6f : (1.0f - x) / 0.4f) * rig_->bodyLen * 0.3f;
        if (x > 0.55f && x < 0.65f) c.rootPitch += 0.08f;     // impact jolt
        break;
    }
    case A::Pounce: {
        float x = clampf(t / dur, 0.0f, 1.0f);
        float crouch = x < 0.45f ? ease(x / 0.45f) : 0.0f;
        float leap = x >= 0.45f ? std::sin((x - 0.45f) / 0.55f * kPi) : 0.0f;
        c.rootY += -legLen * 0.4f * crouch + legLen * 1.1f * leap;
        c.rootZ += x >= 0.45f ? (x - 0.45f) / 0.55f * rig_->bodyLen * 1.6f : 0.0f;
        c.tailYaw += std::sin(t * 12.0f) * 0.4f * crouch;     // butt wiggle before the jump
        c.rootRoll += std::sin(t * 12.0f) * 0.05f * crouch;
        for (int l = 0; l < 2; ++l) c.leg[l][0] += -1.1f * leap;
        for (int l = 2; l < 4; ++l) c.leg[l][0] += 0.9f * leap;
        c.earL += 0.3f; c.earR += 0.3f;
        break;
    }
    case A::Dig: {
        float s = std::sin(t * 14.0f);
        c.rootPitch += 0.25f; c.neckPitch += 0.5f;
        c.leg[0][0] += -0.4f + s * 0.8f; c.leg[0][1] += std::max(0.0f, s) * -0.8f;
        c.leg[1][0] += -0.4f - s * 0.8f; c.leg[1][1] += std::max(0.0f, -s) * -0.8f;
        c.tailLift += 0.4f;
        break;
    }
    case A::Thump: {
        float w = envelope(t, dur, 0.1f, 0.3f);
        float hit = std::pow(std::max(0.0f, std::sin(t * 9.0f)), 6.0f);
        c.leg[2][0] += -0.4f * w + hit * 0.5f; c.leg[3][0] += -0.4f * w + hit * 0.5f;
        c.earL += 0.5f * w; c.earR += 0.5f * w; c.neckPitch += -0.2f * w;
        break;
    }
    case A::Binky: {
        float x = clampf(t / dur, 0.0f, 1.0f);
        float air = std::sin(x * kPi);
        c.rootY += air * legLen * 2.5f;
        c.spineYaw += std::sin(x * kPi * 2.0f) * 0.6f * air;   // the mid-air twist
        c.rootRoll += std::sin(x * kPi * 2.0f) * 0.4f * air;
        for (int l = 2; l < 4; ++l) c.leg[l][0] += 0.8f * air;
        break;
    }
    case A::Knead: {
        float w = ease(t / 0.6f);
        liePose(w * 0.6f);
        float s = std::sin(t * 5.0f);
        c.leg[0][0] += s * 0.35f * w; c.leg[1][0] += -s * 0.35f * w;
        c.headPitch += 0.1f * w; c.earL += 0.1f;
        break;
    }
    case A::RollOver: {
        float w = envelope(t, dur, 0.8f, 0.8f);
        liePose(w);
        c.rootRoll += 2.6f * w;                               // onto its back, belly up
        for (int l = 0; l < 4; ++l) c.leg[l][1] += (l < 2 ? -0.6f : 0.6f) * w;
        c.headRoll += -0.8f * w; c.tailYaw += std::sin(t * 10.0f) * 0.3f * w;
        break;
    }
    case A::Peck: {
        float p = std::pow(std::max(0.0f, std::sin(t * 6.0f)), 3.0f);
        c.neckPitch += 0.6f + p * 0.9f; c.headPitch += p * 0.4f;
        break;
    }
    case A::FlapWings: {
        float w = envelope(t, dur, 0.2f, 0.3f);
        c.wingOpen += w; c.wingFlap += std::sin(t * 18.0f) * w; c.rootY += std::max(0.0f, std::sin(t * 18.0f)) * legLen * 0.1f * w;
        c.neckPitch += -0.2f * w;
        break;
    }
    case A::Preen: {
        float w = ease(t / 0.5f);
        float side = std::sin(t * 0.7f) > 0 ? 1.0f : -1.0f;
        c.neckYaw += 1.2f * side * w; c.neckPitch += 0.6f * w; c.headPitch += 0.5f * w + std::sin(t * 12.0f) * 0.1f;
        c.wingOpen += 0.15f * w;
        break;
    }
    case A::Coil: c.coil = ease(t / 1.0f); c.neckPitch += -0.3f; c.headYaw += std::sin(t * 0.5f) * 0.3f; c.tongue += std::max(0.0f, std::sin(t * 3.0f)); break;
    case A::Strike: {
        float x = clampf(t / dur, 0.0f, 1.0f);
        float s = std::sin(std::min(x * 2.0f, 1.0f) * kPi);
        c.coil = 0.8f * (1.0f - s * 0.6f); c.neckPitch += -0.5f + s * 0.4f; c.rootZ += s * rig_->bodyLen * 0.25f; c.jaw += 1.0f * s;
        break;
    }
    case A::HoodUp: c.coil = 0.7f; c.neckPitch += -1.0f; c.hood = ease(t / 0.4f); c.headYaw += std::sin(t * 1.4f) * 0.2f; break;
    case A::Retract: {
        float w = ease(t / 0.6f);
        c.neckPitch += 1.2f * w; c.headPitch += -0.6f * w;
        for (int l = 0; l < 4; ++l) { c.legOut[l] += -0.8f * w; c.leg[l][1] += 0.8f * w; }
        c.rootY += -legLen * 0.8f * w;
        break;
    }
    case A::ChestBeat: {
        float w = envelope(t, dur, 0.5f, 0.5f);
        c.rootPitch += -0.9f * w; c.rootY += legLen * 0.2f * w;
        float s = std::sin(t * 16.0f);
        c.leg[0][0] += (-1.6f + s * 0.4f) * w; c.leg[0][1] += -1.5f * w;
        c.leg[1][0] += (-1.6f - s * 0.4f) * w; c.leg[1][1] += -1.5f * w;
        c.jaw += 0.5f * w; c.headPitch += -0.3f * w;
        break;
    }
    case A::StandUp: {
        float w = envelope(t, dur, 0.6f, 0.6f);
        c.rootPitch += -1.15f * w; c.rootY += legLen * 0.05f * w;
        for (int l = 0; l < 2; ++l) { c.leg[l][0] += -0.2f * w; c.leg[l][1] += -1.0f * w; c.leg[l][2] += 0.9f * w; }
        c.neckPitch += 0.4f * w; c.headYaw += std::sin(t * 1.5f) * 0.3f * w;
        break;
    }
    case A::Sedated: {
        // Under anesthesia: on its side, limp, slow breathing
        liePose(1.0f);
        c.rootRoll += 1.45f; c.neckPitch += 0.2f; c.headRoll += 0.3f; c.jaw += 0.1f; c.tongue += 0.4f;
        for (int l = 0; l < 4; ++l) { c.leg[l][0] = 0.1f * float(l % 2); c.leg[l][1] = 0.15f; c.leg[l][2] = 0.0f; }
        c.earL = c.earR = 0.0f; c.earBack += 0.5f; c.tailLift = -0.3f; c.tailYaw = 0.0f;
        c.spinePitch += std::sin(clock_ * 0.8f) * 0.012f;
        c.coil = 0.0f;
        break;
    }
    case A::Dead: {
        liePose(1.0f);
        c.rootRoll += 1.5f; c.neckPitch += 0.4f; c.headRoll += 0.4f; c.jaw += 0.2f; c.tongue += 0.6f;
        for (int l = 0; l < 4; ++l) { c.leg[l][0] = 0.2f; c.leg[l][1] = 0.1f; c.leg[l][2] = 0.0f; }
        c.earL = c.earR = 0.0f; c.tailLift = -0.4f; c.tailYaw = 0.0f; c.spinePitch = 0.0f;
        break;
    }
    default: break;
    }
}

// ---------------------------------------------------------------------------
// Channels -> bone matrices. Bind rotations are identity, so each bone's world
// transform is parent * translate(offset from parent) * local rotation.
void AnimalAnimator::pose() {
    const AnimalRig& R = *rig_;
    const AnimChannels& c = cur_;
    const size_t N = R.bones.size();
    std::vector<quat> rot(N, quat());
    auto X = [](float a) { return quat::axisAngle({1, 0, 0}, a); };
    auto Y = [](float a) { return quat::axisAngle({0, 1, 0}, a); };
    auto Z = [](float a) { return quat::axisAngle({0, 0, 1}, a); };
    auto set = [&](int b, quat q) { if (b >= 0 && size_t(b) < N) rot[size_t(b)] = rot[size_t(b)] * q; };

    set(R.pelvis, X(c.rootPitch) * Z(c.rootRoll));
    set(R.spine, X(c.spinePitch * 0.5f) * Y(c.spineYaw * 0.5f) * Z(c.spineRoll * 0.5f));
    set(R.chest, X(c.spinePitch * 0.5f) * Y(c.spineYaw * 0.5f) * Z(c.spineRoll * 0.5f));
    if (R.neck1 != R.chest) set(R.neck1, X(c.neckPitch * 0.6f) * Y(c.neckYaw * 0.6f));
    if (R.neck2 != R.neck1) set(R.neck2, X(c.neckPitch * 0.4f) * Y(c.neckYaw * 0.4f));
    set(R.head, X(c.headPitch) * Y(c.headYaw) * Z(c.headRoll));
    set(R.jaw, X(c.jaw));
    set(R.tongue, X(-c.tongue * 0.3f));
    set(R.earL, Z(-c.earL * 0.5f) * X(c.earBack * 0.6f));
    set(R.earR, Z(c.earR * 0.5f) * X(c.earBack * 0.6f));
    for (int i = 0; i < R.tailCount; ++i) {
        float k = 1.0f / float(std::max(R.tailCount, 1));
        set(R.tail[i], X(-c.tailLift * k * (i == 0 ? 2.0f : 1.0f)) * Y(c.tailYaw * k * (1.0f + float(i) * 0.3f)));
    }
    const bool sprawl = R.plan == BodyPlan::Lizard || R.plan == BodyPlan::Turtle;
    // Legs: pitch about the side axis. Front legs of birds are wings; bird legs are 2 and 3.
    for (int l = 0; l < 4; ++l) {
        float side = (l % 2 == 0) ? 1.0f : -1.0f;
        for (int j = 0; j < 4; ++j) {
            quat q = X(c.leg[l][j]);
            if (j == 0 && sprawl) q = Y(-c.leg[l][j] * side) * Z(c.leg[l][1] * 0.3f * side);   // sideways legs swing around the vertical
            if (j == 0) q = Z(c.legOut[l] * side) * q;
            set(R.leg[l][j], q);
        }
        // counter-rotate the front legs of sitting/rearing animals is done by the channels themselves
    }
    // Wings: open (spread sideways) and flap
    for (int s = 0; s < 2; ++s) {
        float side = s == 0 ? 1.0f : -1.0f;
        float open = c.wingOpen, flap = c.wingFlap;
        set(R.wing[s][0], Z(side * (open * 1.3f + flap * 0.7f)) * Y(side * -open * 0.9f));
        set(R.wing[s][1], Y(side * -open * 0.6f) * Z(side * flap * 0.4f));
        set(R.wing[s][2], Y(side * -open * 0.4f));
    }
    // Snakes: travelling S-wave for slithering, a spiral for coiling
    if (R.chainCount > 0) {
        for (int i = 0; i < R.chainCount; ++i) {
            float u = float(i) / float(R.chainCount - 1);
            float wave = std::sin(u * 10.0f - c.slitherPhase) * c.slither * 0.35f;
            float coil = c.coil * (u < 0.8f ? 0.62f : -0.3f);
            set(R.chain[i], Y(wave + coil) * X(c.coil * (u > 0.75f ? -0.15f : 0.0f)));
        }
        set(R.head, X(c.neckPitch * 0.5f));
    }

    // Root: lift/drop and forward offset (lunges, pounces)
    world_.resize(N);
    skin_.resize(N);
    for (size_t i = 0; i < N; ++i) {
        const auto& bn = R.bones[i];
        mat4 local;
        if (bn.parent < 0) {
            local = mat4::translate(bn.bindPos + vec3(0, c.rootY, c.rootZ)) * mat4::rotate(rot[i]);
            world_[i] = local;
        } else {
            vec3 off = bn.bindPos - R.bones[size_t(bn.parent)].bindPos;
            local = mat4::translate(off) * mat4::rotate(rot[i]);
            world_[i] = world_[size_t(bn.parent)] * local;
        }
        skin_[i] = world_[i] * mat4::translate(-bn.bindPos);
    }
}

}  // namespace ps
