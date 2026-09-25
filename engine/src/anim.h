// ============================================================================
//  MOOR3D — skeletal animation
//
//  Keyframed clips -> slerp sampling -> cross-fade blend -> skinning matrices.
//  Skinning matrix per joint = animatedWorld * inverseBind.
// ============================================================================
#pragma once
#include <vector>
#include <cstring>
#include "mathx.h"
#include "models.h"

namespace anim {

using m::v3;
using m::quat;
using m::m4;
using models::JOINT_COUNT;

// ---------------------------------------------------------------- clips
struct Key { float t; quat rot; };

struct Track {
  Key keys[6];
  int count = 0;
  void add(float t, const quat& q){ if(count < 6) keys[count++] = { t, q }; }
  quat sample(float ph) const {
    if(count == 0) return quat();
    if(count == 1) return keys[0].rot;
    // clip phase is normalised 0..1 and loops
    for(int i = 0; i < count - 1; i++){
      if(ph >= keys[i].t && ph <= keys[i+1].t){
        float span = keys[i+1].t - keys[i].t;
        float u = span > 1e-6f ? (ph - keys[i].t) / span : 0.0f;
        return m::slerp(keys[i].rot, keys[i+1].rot, m::smoothstepf(u));
      }
    }
    return keys[count-1].rot;
  }
};

struct Clip {
  Track  tracks[JOINT_COUNT];
  float  duration = 1.0f;
  bool   loop = true;
  // root motion overlay
  float  bobAmp = 0.0f, bobFreq = 2.0f;   // vertical bounce
  float  leanX  = 0.0f;                   // forward lean, radians
  float  swayZ  = 0.0f;                   // side-to-side roll amplitude
};

// Convenience: pitch about X (limb swing), roll about Z, yaw about Y.
inline quat pitch(float deg){ return quat::axisAngle({1,0,0}, deg * m::DEG); }
inline quat roll (float deg){ return quat::axisAngle({0,0,1}, deg * m::DEG); }
inline quat yaw  (float deg){ return quat::axisAngle({0,1,0}, deg * m::DEG); }
inline quat pr   (float p, float r){ return pitch(p) * roll(r); }

// ---------------------------------------------------------------- clip library
enum ClipId { CLIP_IDLE = 0, CLIP_WALK, CLIP_RUN, CLIP_SPRINT, CLIP_SIT, CLIP_WAVE, CLIP_COUNT };

struct Library {
  Clip clips[CLIP_COUNT];
  bool built = false;

  void build(){
    if(built) return;
    built = true;

    // ------------------------------------------------ IDLE
    {
      Clip& c = clips[CLIP_IDLE];
      c.duration = 3.6f; c.loop = true;
      c.bobAmp = 0.010f; c.bobFreq = 1.0f;
      // gentle breathing in the chest, arms hanging with a slight outward roll
      c.tracks[models::J_CHEST].add(0.0f, pitch(-1.0f));
      c.tracks[models::J_CHEST].add(0.5f, pitch( 1.6f));
      c.tracks[models::J_CHEST].add(1.0f, pitch(-1.0f));
      c.tracks[models::J_SPINE].add(0.0f, pitch(1.0f));
      c.tracks[models::J_SPINE].add(0.5f, pitch(2.0f));
      c.tracks[models::J_SPINE].add(1.0f, pitch(1.0f));
      c.tracks[models::J_HEAD].add(0.0f, yaw(-3.0f));
      c.tracks[models::J_HEAD].add(0.5f, yaw( 4.0f));
      c.tracks[models::J_HEAD].add(1.0f, yaw(-3.0f));
      c.tracks[models::J_LUPARM].add(0.0f, pr(2.0f,  7.0f));
      c.tracks[models::J_LUPARM].add(0.5f, pr(-2.0f, 9.0f));
      c.tracks[models::J_LUPARM].add(1.0f, pr(2.0f,  7.0f));
      c.tracks[models::J_RUPARM].add(0.0f, pr(-2.0f, -9.0f));
      c.tracks[models::J_RUPARM].add(0.5f, pr( 2.0f, -7.0f));
      c.tracks[models::J_RUPARM].add(1.0f, pr(-2.0f, -9.0f));
      c.tracks[models::J_LLOARM].add(0.0f, pitch(-9.0f));
      c.tracks[models::J_RLOARM].add(0.0f, pitch(-9.0f));
    }

    // ------------------------------------------------ WALK
    // Classic 4-pose cycle: contact, passing, contact (mirrored), passing.
    {
      Clip& c = clips[CLIP_WALK];
      c.duration = 1.02f; c.loop = true;
      c.bobAmp = 0.028f; c.bobFreq = 2.0f;
      c.leanX  = 2.5f * m::DEG;
      c.swayZ  = 1.6f * m::DEG;

      const float TH = 24.0f;   // thigh swing
      const float KN = 34.0f;   // knee bend at passing
      const float AR = 20.0f;   // arm swing

      // left leg leads at t=0
      c.tracks[models::J_LTHIGH].add(0.00f, pitch( TH));
      c.tracks[models::J_LTHIGH].add(0.25f, pitch(  2.0f));
      c.tracks[models::J_LTHIGH].add(0.50f, pitch(-TH));
      c.tracks[models::J_LTHIGH].add(0.75f, pitch( -4.0f));
      c.tracks[models::J_LTHIGH].add(1.00f, pitch( TH));

      c.tracks[models::J_LSHIN].add(0.00f, pitch(-6.0f));
      c.tracks[models::J_LSHIN].add(0.25f, pitch(-12.0f));
      c.tracks[models::J_LSHIN].add(0.50f, pitch(-10.0f));
      c.tracks[models::J_LSHIN].add(0.75f, pitch(-KN));
      c.tracks[models::J_LSHIN].add(1.00f, pitch(-6.0f));

      c.tracks[models::J_LFOOT].add(0.00f, pitch(-10.0f));
      c.tracks[models::J_LFOOT].add(0.25f, pitch(  4.0f));
      c.tracks[models::J_LFOOT].add(0.50f, pitch( 12.0f));
      c.tracks[models::J_LFOOT].add(0.75f, pitch(  2.0f));
      c.tracks[models::J_LFOOT].add(1.00f, pitch(-10.0f));

      // right leg = left shifted half a cycle
      c.tracks[models::J_RTHIGH].add(0.00f, pitch(-TH));
      c.tracks[models::J_RTHIGH].add(0.25f, pitch( -4.0f));
      c.tracks[models::J_RTHIGH].add(0.50f, pitch( TH));
      c.tracks[models::J_RTHIGH].add(0.75f, pitch(  2.0f));
      c.tracks[models::J_RTHIGH].add(1.00f, pitch(-TH));

      c.tracks[models::J_RSHIN].add(0.00f, pitch(-10.0f));
      c.tracks[models::J_RSHIN].add(0.25f, pitch(-KN));
      c.tracks[models::J_RSHIN].add(0.50f, pitch( -6.0f));
      c.tracks[models::J_RSHIN].add(0.75f, pitch(-12.0f));
      c.tracks[models::J_RSHIN].add(1.00f, pitch(-10.0f));

      c.tracks[models::J_RFOOT].add(0.00f, pitch( 12.0f));
      c.tracks[models::J_RFOOT].add(0.25f, pitch(  2.0f));
      c.tracks[models::J_RFOOT].add(0.50f, pitch(-10.0f));
      c.tracks[models::J_RFOOT].add(0.75f, pitch(  4.0f));
      c.tracks[models::J_RFOOT].add(1.00f, pitch( 12.0f));

      // arms counter-swing the legs
      c.tracks[models::J_LUPARM].add(0.00f, pr(-AR, 6.0f));
      c.tracks[models::J_LUPARM].add(0.50f, pr( AR, 6.0f));
      c.tracks[models::J_LUPARM].add(1.00f, pr(-AR, 6.0f));
      c.tracks[models::J_RUPARM].add(0.00f, pr( AR, -6.0f));
      c.tracks[models::J_RUPARM].add(0.50f, pr(-AR, -6.0f));
      c.tracks[models::J_RUPARM].add(1.00f, pr( AR, -6.0f));
      c.tracks[models::J_LLOARM].add(0.00f, pitch(-16.0f));
      c.tracks[models::J_LLOARM].add(0.50f, pitch(-26.0f));
      c.tracks[models::J_LLOARM].add(1.00f, pitch(-16.0f));
      c.tracks[models::J_RLOARM].add(0.00f, pitch(-26.0f));
      c.tracks[models::J_RLOARM].add(0.50f, pitch(-16.0f));
      c.tracks[models::J_RLOARM].add(1.00f, pitch(-26.0f));

      // torso counter-rotation keeps the walk from looking stiff
      c.tracks[models::J_CHEST].add(0.00f, yaw( 4.0f));
      c.tracks[models::J_CHEST].add(0.50f, yaw(-4.0f));
      c.tracks[models::J_CHEST].add(1.00f, yaw( 4.0f));
      c.tracks[models::J_PELVIS].add(0.00f, yaw(-3.0f) * roll( 1.5f));
      c.tracks[models::J_PELVIS].add(0.50f, yaw( 3.0f) * roll(-1.5f));
      c.tracks[models::J_PELVIS].add(1.00f, yaw(-3.0f) * roll( 1.5f));
    }

    // ------------------------------------------------ RUN
    {
      Clip& c = clips[CLIP_RUN];
      c.duration = 0.66f; c.loop = true;
      c.bobAmp = 0.058f; c.bobFreq = 2.0f;
      c.leanX  = 9.0f * m::DEG;
      c.swayZ  = 2.4f * m::DEG;

      const float TH = 42.0f, KNC = 78.0f, AR = 44.0f;

      c.tracks[models::J_LTHIGH].add(0.00f, pitch( TH));
      c.tracks[models::J_LTHIGH].add(0.25f, pitch( -6.0f));
      c.tracks[models::J_LTHIGH].add(0.50f, pitch(-TH * 0.78f));
      c.tracks[models::J_LTHIGH].add(0.75f, pitch( 14.0f));
      c.tracks[models::J_LTHIGH].add(1.00f, pitch( TH));
      c.tracks[models::J_LSHIN].add(0.00f, pitch(-24.0f));
      c.tracks[models::J_LSHIN].add(0.25f, pitch(-18.0f));
      c.tracks[models::J_LSHIN].add(0.50f, pitch(-34.0f));
      c.tracks[models::J_LSHIN].add(0.75f, pitch(-KNC));
      c.tracks[models::J_LSHIN].add(1.00f, pitch(-24.0f));
      c.tracks[models::J_LFOOT].add(0.00f, pitch(-14.0f));
      c.tracks[models::J_LFOOT].add(0.50f, pitch( 20.0f));
      c.tracks[models::J_LFOOT].add(1.00f, pitch(-14.0f));

      c.tracks[models::J_RTHIGH].add(0.00f, pitch(-TH * 0.78f));
      c.tracks[models::J_RTHIGH].add(0.25f, pitch( 14.0f));
      c.tracks[models::J_RTHIGH].add(0.50f, pitch( TH));
      c.tracks[models::J_RTHIGH].add(0.75f, pitch( -6.0f));
      c.tracks[models::J_RTHIGH].add(1.00f, pitch(-TH * 0.78f));
      c.tracks[models::J_RSHIN].add(0.00f, pitch(-34.0f));
      c.tracks[models::J_RSHIN].add(0.25f, pitch(-KNC));
      c.tracks[models::J_RSHIN].add(0.50f, pitch(-24.0f));
      c.tracks[models::J_RSHIN].add(0.75f, pitch(-18.0f));
      c.tracks[models::J_RSHIN].add(1.00f, pitch(-34.0f));
      c.tracks[models::J_RFOOT].add(0.00f, pitch( 20.0f));
      c.tracks[models::J_RFOOT].add(0.50f, pitch(-14.0f));
      c.tracks[models::J_RFOOT].add(1.00f, pitch( 20.0f));

      // elbows stay bent when running
      c.tracks[models::J_LUPARM].add(0.00f, pr(-AR, 10.0f));
      c.tracks[models::J_LUPARM].add(0.50f, pr( AR, 10.0f));
      c.tracks[models::J_LUPARM].add(1.00f, pr(-AR, 10.0f));
      c.tracks[models::J_RUPARM].add(0.00f, pr( AR, -10.0f));
      c.tracks[models::J_RUPARM].add(0.50f, pr(-AR, -10.0f));
      c.tracks[models::J_RUPARM].add(1.00f, pr( AR, -10.0f));
      c.tracks[models::J_LLOARM].add(0.00f, pitch(-72.0f));
      c.tracks[models::J_LLOARM].add(0.50f, pitch(-92.0f));
      c.tracks[models::J_LLOARM].add(1.00f, pitch(-72.0f));
      c.tracks[models::J_RLOARM].add(0.00f, pitch(-92.0f));
      c.tracks[models::J_RLOARM].add(0.50f, pitch(-72.0f));
      c.tracks[models::J_RLOARM].add(1.00f, pitch(-92.0f));

      c.tracks[models::J_CHEST].add(0.00f, yaw( 8.0f) * pitch(4.0f));
      c.tracks[models::J_CHEST].add(0.50f, yaw(-8.0f) * pitch(4.0f));
      c.tracks[models::J_CHEST].add(1.00f, yaw( 8.0f) * pitch(4.0f));
      c.tracks[models::J_PELVIS].add(0.00f, yaw(-6.0f));
      c.tracks[models::J_PELVIS].add(0.50f, yaw( 6.0f));
      c.tracks[models::J_PELVIS].add(1.00f, yaw(-6.0f));
      c.tracks[models::J_HEAD].add(0.00f, pitch(-5.0f));
    }

    // ------------------------------------------------ SPRINT (faster, deeper)
    {
      Clip& c = clips[CLIP_SPRINT] = clips[CLIP_RUN];
      c.duration = 0.50f;
      c.bobAmp = 0.072f;
      c.leanX  = 15.0f * m::DEG;
    }

    // ------------------------------------------------ SIT (driving pose)
    {
      Clip& c = clips[CLIP_SIT];
      c.duration = 4.0f; c.loop = true;
      c.bobAmp = 0.004f; c.bobFreq = 1.0f;
      c.tracks[models::J_LTHIGH].add(0.0f, pitch(84.0f));
      c.tracks[models::J_RTHIGH].add(0.0f, pitch(84.0f));
      c.tracks[models::J_LSHIN ].add(0.0f, pitch(-80.0f));
      c.tracks[models::J_RSHIN ].add(0.0f, pitch(-80.0f));
      c.tracks[models::J_LFOOT ].add(0.0f, pitch(14.0f));
      c.tracks[models::J_RFOOT ].add(0.0f, pitch(14.0f));
      // hands up on the wheel
      c.tracks[models::J_LUPARM].add(0.0f, pr(-58.0f, 24.0f));
      c.tracks[models::J_RUPARM].add(0.0f, pr(-58.0f, -24.0f));
      c.tracks[models::J_LLOARM].add(0.0f, pitch(-30.0f));
      c.tracks[models::J_RLOARM].add(0.0f, pitch(-30.0f));
      c.tracks[models::J_SPINE ].add(0.0f, pitch(-6.0f));
    }

    // ------------------------------------------------ WAVE (the yelling driver)
    {
      Clip& c = clips[CLIP_WAVE];
      c.duration = 0.9f; c.loop = true;
      c.bobAmp = 0.012f; c.bobFreq = 2.0f;
      c.tracks[models::J_RUPARM].add(0.00f, pr(-150.0f, -18.0f));
      c.tracks[models::J_RUPARM].add(0.50f, pr(-165.0f, -34.0f));
      c.tracks[models::J_RUPARM].add(1.00f, pr(-150.0f, -18.0f));
      c.tracks[models::J_RLOARM].add(0.00f, pitch(-28.0f) * roll(-22.0f));
      c.tracks[models::J_RLOARM].add(0.50f, pitch(-14.0f) * roll( 18.0f));
      c.tracks[models::J_RLOARM].add(1.00f, pitch(-28.0f) * roll(-22.0f));
      c.tracks[models::J_LUPARM].add(0.00f, pr(14.0f, 16.0f));
      c.tracks[models::J_LLOARM].add(0.00f, pitch(-26.0f));
      c.tracks[models::J_CHEST].add(0.00f, pitch(-5.0f) * yaw(-8.0f));
      c.tracks[models::J_CHEST].add(0.50f, pitch( 2.0f) * yaw(-4.0f));
      c.tracks[models::J_CHEST].add(1.00f, pitch(-5.0f) * yaw(-8.0f));
      c.tracks[models::J_HEAD].add(0.00f, pitch(-8.0f));
      c.tracks[models::J_HEAD].add(0.50f, pitch( 4.0f));
      c.tracks[models::J_HEAD].add(1.00f, pitch(-8.0f));
    }
  }
};

inline Library& library(){
  static Library L;
  L.build();
  return L;
}

// ---------------------------------------------------------------- pose / skeleton
struct Pose {
  quat local[JOINT_COUNT];
  v3   rootOffset{0,0,0};
  quat rootRot;
};

// Precomputed inverse-bind matrices (rest pose has no rotations, so the bind
// matrix is a pure translation and its inverse is just the negated offset).
struct Skeleton {
  m4 invBind[JOINT_COUNT];
  bool ready = false;

  void init(){
    if(ready) return;
    ready = true;
    for(int j = 0; j < JOINT_COUNT; j++){
      invBind[j] = m4::translate(-models::jointRestWorld(j));
    }
  }

  // Walk the hierarchy and produce the matrices the vertex shader consumes.
  void skin(const Pose& p, m4* out) const {
    const models::JointDef* jd = models::jointDefs();
    m4 world[JOINT_COUNT];
    for(int j = 0; j < JOINT_COUNT; j++){
      m4 localM = m4::trs(jd[j].offset, p.local[j], v3(1,1,1));
      int par = jd[j].parent;
      world[j] = (par < 0) ? localM : world[par] * localM;
    }
    // root overlay (bob / lean / sway) applied above everything
    m4 rootM = m4::trs(p.rootOffset, p.rootRot, v3(1,1,1));
    for(int j = 0; j < JOINT_COUNT; j++){
      out[j] = rootM * world[j] * invBind[j];
    }
  }
};

inline Skeleton& skeleton(){
  static Skeleton S;
  S.init();
  return S;
}

// ---------------------------------------------------------------- animator
// Plays one clip while fading out the previous one — no popping between states.
struct Animator {
  int   cur = CLIP_IDLE, prev = CLIP_IDLE;
  float curTime = 0.0f, prevTime = 0.0f;
  float blend = 1.0f, blendRate = 6.0f;
  float speedScale = 1.0f;

  void play(int clip, float fade = 0.16f){
    if(clip == cur) return;
    prev = cur; prevTime = curTime;
    cur = clip; curTime = 0.0f;
    blend = 0.0f;
    blendRate = fade > 1e-3f ? 1.0f / fade : 1000.0f;
  }

  void update(float dt){
    const Library& L = library();
    curTime  += dt * speedScale;
    prevTime += dt * speedScale;
    float dc = L.clips[cur].duration;
    if(dc > 1e-4f && L.clips[cur].loop) curTime = std::fmod(curTime, dc);
    float dp = L.clips[prev].duration;
    if(dp > 1e-4f && L.clips[prev].loop) prevTime = std::fmod(prevTime, dp);
    if(blend < 1.0f) blend = m::clampf(blend + dt * blendRate, 0.0f, 1.0f);
  }

  static void samplePose(const Clip& c, float time, Pose& out){
    float ph = c.duration > 1e-4f ? m::clampf(time / c.duration, 0.0f, 1.0f) : 0.0f;
    for(int j = 0; j < JOINT_COUNT; j++) out.local[j] = c.tracks[j].sample(ph);
    float bob = std::sin(ph * m::TAU * c.bobFreq) * c.bobAmp;
    out.rootOffset = { 0.0f, -std::fabs(bob), 0.0f };
    float sway = std::sin(ph * m::TAU) * c.swayZ;
    out.rootRot = quat::axisAngle({1,0,0}, c.leanX) * quat::axisAngle({0,0,1}, sway);
  }

  void evaluate(Pose& out) const {
    const Library& L = library();
    Pose a, b;
    samplePose(L.clips[cur], curTime, a);
    if(blend >= 0.999f){ out = a; return; }
    samplePose(L.clips[prev], prevTime, b);
    float t = m::smoothstepf(blend);
    for(int j = 0; j < JOINT_COUNT; j++) out.local[j] = m::slerp(b.local[j], a.local[j], t);
    out.rootOffset = m::lerp(b.rootOffset, a.rootOffset, t);
    out.rootRot    = m::slerp(b.rootRot, a.rootRot, t);
  }

  // Convenience: pick and time a locomotion clip from ground speed.
  void driveFromSpeed(float speed, bool seated){
    if(seated){ play(CLIP_SIT, 0.22f); speedScale = 1.0f; return; }
    if(speed < 0.35f){ play(CLIP_IDLE, 0.22f); speedScale = 1.0f; }
    else if(speed < 2.6f){
      play(CLIP_WALK, 0.18f);
      speedScale = m::clampf(speed / 1.45f, 0.55f, 1.9f);
    } else if(speed < 6.2f){
      play(CLIP_RUN, 0.16f);
      speedScale = m::clampf(speed / 4.6f, 0.7f, 1.7f);
    } else {
      play(CLIP_SPRINT, 0.16f);
      speedScale = m::clampf(speed / 8.0f, 0.8f, 1.6f);
    }
  }
};

} // namespace anim
