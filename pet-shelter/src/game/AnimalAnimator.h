// Procedural animal animation. Every behavior is a set of joint "channels"
// (spine pitch, head yaw, tail wag, leg swing...) evaluated over time and
// cross-faded into the next one, layered on top of a gait cycle driven by
// speed. The same actions look different per species because they are
// shaped by the animal's body plan, gait, tail, ears and tempo.
#pragma once
#include "game/AnimalModel.h"
#include <vector>

namespace ps {

enum class AnimAction : uint8_t {
    Idle, Walk, Run, Sit, LieDown, Sleep, Eat, Drink, Sniff, LookAround, Scratch, Groom, Shake, Yawn, Stretch,
    WagHappy, PlayBow, Beg, Pant, Vocalize, Growl, Hiss, Cower, Tremble, Limp, Attack, Bite, Kick, RearUp,
    Headbutt, Pounce, Dig, Thump, Binky, Knead, RollOver, Peck, FlapWings, Preen, Coil, Strike, HoodUp,
    Retract, ChestBeat, StandUp, Sedated, Dead, Count
};

const char* actionName(AnimAction a);
bool actionLoops(AnimAction a);
float actionDuration(AnimAction a);     // seconds for one-shots (loops: suggested length)
bool actionAvailable(const Species& sp, AnimAction a);
std::vector<AnimAction> availableActions(const Species& sp);

struct AnimChannels {
    float rootY = 0, rootZ = 0, rootPitch = 0, rootRoll = 0;
    float spinePitch = 0, spineYaw = 0, spineRoll = 0;
    float neckPitch = 0, neckYaw = 0, headPitch = 0, headYaw = 0, headRoll = 0;
    float jaw = 0, tongue = 0;
    float earL = 0, earR = 0, earBack = 0;
    float tailLift = 0, tailYaw = 0, tailCurl = 0;
    float leg[4][4] = {};      // pitch per joint (upper, mid, lower, foot); + = backward
    float legOut[4] = {};      // abduction (sideways)
    float wingOpen = 0, wingFlap = 0;
    float hood = 0, coil = 0, slither = 0, slitherPhase = 0;
    void blend(const AnimChannels& o, float w);   // this = lerp(this, o, w)
};

class AnimalAnimator {
public:
    void init(const AnimalRig& rig, const Species& sp, uint32_t seed);
    void play(AnimAction a, float fade = 0.3f);
    AnimAction action() const { return action_; }
    float actionTime() const { return t_; }
    bool finished() const;                     // one-shot action played through
    void setSpeed(float metersPerSecond) { speed_ = metersPerSecond; }
    void update(float dt);
    const std::vector<mat4>& skin() const { return skin_; }    // bone skinning matrices
    mat4 boneWorld(int i) const { return world_[size_t(i)]; }
    const AnimChannels& channels() const { return cur_; }

private:
    void evaluate(AnimAction a, float t, AnimChannels& c) const;
    void gait(AnimChannels& c, float amount) const;
    void pose();

    const AnimalRig* rig_ = nullptr;
    const Species* sp_ = nullptr;
    AnimAction action_ = AnimAction::Idle, prev_ = AnimAction::Idle;
    float t_ = 0, prevT_ = 0, fade_ = 0.3f, fadeT_ = 1.0f;
    float speed_ = 0, phase_ = 0, clock_ = 0;
    float rnd_ = 0;
    AnimChannels cur_;
    std::vector<mat4> world_, skin_;
};

}  // namespace ps
