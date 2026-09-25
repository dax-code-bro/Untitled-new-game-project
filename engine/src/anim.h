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

// The largest rig the engine supports. Must match uJoints[] in the shaders.
constexpr int MAX_JOINTS = 24;

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
  Track  tracks[MAX_JOINTS];
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
  quat local[MAX_JOINTS];
  v3   rootOffset{0,0,0};
  quat rootRot;
};

// Precomputed inverse-bind matrices (rest pose has no rotations, so the bind
// matrix is a pure translation and its inverse is just the negated offset).
struct Skeleton {
  const models::JointDef* defs = nullptr;
  int  count = 0;
  m4   invBind[MAX_JOINTS];
  bool ready = false;

  // The rest pose has no rotations, so each bind matrix is a pure translation
  // and its inverse is just the negated world-space rest position.
  void init(const models::JointDef* d, int n){
    if(ready) return;
    ready = true;
    defs = d; count = n < MAX_JOINTS ? n : MAX_JOINTS;
    for(int j = 0; j < count; j++){
      v3 p{0,0,0};
      int k = j;
      while(k >= 0){ p += defs[k].offset; k = defs[k].parent; }
      invBind[j] = m4::translate(-p);
    }
  }

  // Walk the hierarchy and produce the matrices the vertex shader consumes.
  void skin(const Pose& p, m4* out) const {
    m4 world[MAX_JOINTS];
    for(int j = 0; j < count; j++){
      m4 localM = m4::trs(defs[j].offset, p.local[j], v3(1,1,1));
      int par = defs[j].parent;
      world[j] = (par < 0) ? localM : world[par] * localM;
    }
    // root overlay (bob / lean / sway) applied above everything
    m4 rootM = m4::trs(p.rootOffset, p.rootRot, v3(1,1,1));
    for(int j = 0; j < count; j++){
      out[j] = rootM * world[j] * invBind[j];
    }
    for(int j = count; j < MAX_JOINTS; j++) out[j] = m4::identity();
  }
};

inline Skeleton& skeleton(){
  static Skeleton S;
  S.init(models::jointDefs(), models::JOINT_COUNT);
  return S;
}
inline Skeleton& quadSkeleton(){
  static Skeleton S;
  S.init(models::quadJointDefs(), models::QJOINT_COUNT);
  return S;
}

// ---------------------------------------------------------------- animator
// Plays one clip while fading out the previous one — no popping between states.
struct Animator {
  const Clip* bank = nullptr;      // null -> humanoid library
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

  const Clip* clips() const { return bank ? bank : library().clips; }

  void update(float dt){
    const Clip* C = clips();
    curTime  += dt * speedScale;
    prevTime += dt * speedScale;
    float dc = C[cur].duration;
    if(dc > 1e-4f && C[cur].loop) curTime = std::fmod(curTime, dc);
    float dp = C[prev].duration;
    if(dp > 1e-4f && C[prev].loop) prevTime = std::fmod(prevTime, dp);
    if(blend < 1.0f) blend = m::clampf(blend + dt * blendRate, 0.0f, 1.0f);
  }

  static void samplePose(const Clip& c, float time, Pose& out){
    float ph = c.duration > 1e-4f ? m::clampf(time / c.duration, 0.0f, 1.0f) : 0.0f;
    for(int j = 0; j < MAX_JOINTS; j++) out.local[j] = c.tracks[j].sample(ph);
    float bob = std::sin(ph * m::TAU * c.bobFreq) * c.bobAmp;
    out.rootOffset = { 0.0f, -std::fabs(bob), 0.0f };
    float sway = std::sin(ph * m::TAU) * c.swayZ;
    out.rootRot = quat::axisAngle({1,0,0}, c.leanX) * quat::axisAngle({0,0,1}, sway);
  }

  void evaluate(Pose& out) const {
    const Clip* C = clips();
    Pose a, b;
    samplePose(C[cur], curTime, a);
    if(blend >= 0.999f){ out = a; return; }
    samplePose(C[prev], prevTime, b);
    float t = m::smoothstepf(blend);
    for(int j = 0; j < MAX_JOINTS; j++) out.local[j] = m::slerp(b.local[j], a.local[j], t);
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


// ---------------------------------------------------------------- quadruped
// Gaits authored as a 4-sample cycle per limb, then phase-shifted per leg so
// the footfall sequence is correct for each gait.
enum QClipId { QCLIP_IDLE = 0, QCLIP_WALK, QCLIP_TROT, QCLIP_GALLOP,
               QCLIP_ALERT, QCLIP_GRAZE, QCLIP_COUNT };

inline float sampleCycle(const float* vals, int n, float ph){
  ph = ph - std::floor(ph);
  float f = ph * n;
  int i0 = ((int)f) % n;
  int i1 = (i0 + 1) % n;
  float t = f - std::floor(f);
  return m::lerpf(vals[i0], vals[i1], t);
}
inline void addCycle(Track& tr, const float* vals, int n, float phase){
  for(int k = 0; k <= 4; k++){
    float t = k / 4.0f;
    tr.add(t, pitch(sampleCycle(vals, n, t + phase)));
  }
}

struct QuadLibrary {
  Clip clips[QCLIP_COUNT];
  bool built = false;

  // hip/knee curves are shared; only amplitude, timing and phase change
  void gait(Clip& c, float dur, const float* hip, const float* knee,
            const float* phases, float bob, float pitchAmp){
    c.duration = dur; c.loop = true;
    c.bobAmp = bob; c.bobFreq = 2.0f;

    const int HIP[4]  = { models::Q_FL_HIP,  models::Q_FR_HIP,
                          models::Q_BL_HIP,  models::Q_BR_HIP };
    const int KNEE[4] = { models::Q_FL_KNEE, models::Q_FR_KNEE,
                          models::Q_BL_KNEE, models::Q_BR_KNEE };
    const int FOOT[4] = { models::Q_FL_FOOT, models::Q_FR_FOOT,
                          models::Q_BL_FOOT, models::Q_BR_FOOT };
    static const float FOOTC[4] = { -6.0f, 10.0f, 16.0f, -2.0f };

    for(int i = 0; i < 4; i++){
      addCycle(c.tracks[HIP[i]],  hip,   4, phases[i]);
      addCycle(c.tracks[KNEE[i]], knee,  4, phases[i]);
      addCycle(c.tracks[FOOT[i]], FOOTC, 4, phases[i]);
    }
    // spine flexes twice per stride, out of phase with the bob
    c.tracks[models::Q_CHEST].add(0.00f, pitch(-pitchAmp));
    c.tracks[models::Q_CHEST].add(0.25f, pitch( pitchAmp));
    c.tracks[models::Q_CHEST].add(0.50f, pitch(-pitchAmp));
    c.tracks[models::Q_CHEST].add(0.75f, pitch( pitchAmp));
    c.tracks[models::Q_CHEST].add(1.00f, pitch(-pitchAmp));
    // head counter-nods so it stays roughly level
    c.tracks[models::Q_NECK].add(0.00f, pitch(pitchAmp * 0.8f));
    c.tracks[models::Q_NECK].add(0.50f, pitch(-pitchAmp * 0.8f));
    c.tracks[models::Q_NECK].add(1.00f, pitch(pitchAmp * 0.8f));
    // tail swings with the stride
    c.tracks[models::Q_TAIL1].add(0.00f, roll(-5.0f));
    c.tracks[models::Q_TAIL1].add(0.50f, roll( 5.0f));
    c.tracks[models::Q_TAIL1].add(1.00f, roll(-5.0f));
  }

  void build(){
    if(built) return;
    built = true;

    // ---------------- IDLE: breathing, ear flick, slow tail
    {
      Clip& c = clips[QCLIP_IDLE];
      c.duration = 4.2f; c.loop = true;
      c.bobAmp = 0.006f; c.bobFreq = 1.0f;
      c.tracks[models::Q_CHEST].add(0.0f, pitch(-0.8f));
      c.tracks[models::Q_CHEST].add(0.5f, pitch( 0.8f));
      c.tracks[models::Q_CHEST].add(1.0f, pitch(-0.8f));
      c.tracks[models::Q_NECK].add(0.0f, pitch(2.0f));
      c.tracks[models::Q_NECK].add(0.5f, pitch(-1.0f));
      c.tracks[models::Q_NECK].add(1.0f, pitch(2.0f));
      c.tracks[models::Q_HEAD].add(0.00f, yaw(-5.0f));
      c.tracks[models::Q_HEAD].add(0.35f, yaw( 6.0f));
      c.tracks[models::Q_HEAD].add(0.70f, yaw(-2.0f));
      c.tracks[models::Q_HEAD].add(1.00f, yaw(-5.0f));
      c.tracks[models::Q_EAR_L].add(0.00f, pitch(0.0f));
      c.tracks[models::Q_EAR_L].add(0.18f, pitch(-26.0f));
      c.tracks[models::Q_EAR_L].add(0.32f, pitch(0.0f));
      c.tracks[models::Q_EAR_L].add(1.00f, pitch(0.0f));
      c.tracks[models::Q_EAR_R].add(0.00f, pitch(0.0f));
      c.tracks[models::Q_EAR_R].add(0.55f, pitch(0.0f));
      c.tracks[models::Q_EAR_R].add(0.68f, pitch(-22.0f));
      c.tracks[models::Q_EAR_R].add(0.82f, pitch(0.0f));
      c.tracks[models::Q_EAR_R].add(1.00f, pitch(0.0f));
      c.tracks[models::Q_TAIL1].add(0.00f, roll(-7.0f));
      c.tracks[models::Q_TAIL1].add(0.50f, roll( 7.0f));
      c.tracks[models::Q_TAIL1].add(1.00f, roll(-7.0f));
      c.tracks[models::Q_TAIL2].add(0.00f, roll( 5.0f));
      c.tracks[models::Q_TAIL2].add(0.50f, roll(-5.0f));
      c.tracks[models::Q_TAIL2].add(1.00f, roll( 5.0f));
    }

    // ---------------- WALK: 4-beat lateral sequence  FL, BR, FR, BL
    {
      static const float hip[4]  = {  26.0f,   4.0f, -20.0f,  -3.0f };
      static const float knee[4] = {  -9.0f, -32.0f, -13.0f, -42.0f };
      static const float ph[4]   = { 0.00f, 0.50f, 0.75f, 0.25f };   // FL FR BL BR
      gait(clips[QCLIP_WALK], 1.15f, hip, knee, ph, 0.016f, 1.6f);
    }

    // ---------------- TROT: diagonal pairs  FL+BR, FR+BL
    {
      static const float hip[4]  = {  33.0f,   3.0f, -27.0f,  -2.0f };
      static const float knee[4] = { -11.0f, -42.0f, -15.0f, -52.0f };
      static const float ph[4]   = { 0.00f, 0.50f, 0.50f, 0.00f };
      gait(clips[QCLIP_TROT], 0.70f, hip, knee, ph, 0.040f, 2.6f);
    }

    // ---------------- GALLOP: rotary, both hind legs lead
    {
      static const float hip[4]  = {  46.0f, -12.0f, -33.0f,  16.0f };
      static const float knee[4] = { -18.0f, -66.0f, -22.0f, -74.0f };
      static const float ph[4]   = { 0.50f, 0.62f, 0.00f, 0.12f };
      gait(clips[QCLIP_GALLOP], 0.50f, hip, knee, ph, 0.085f, 6.5f);
    }

    // ---------------- ALERT: frozen, head up, ears forward
    {
      Clip& c = clips[QCLIP_ALERT];
      c.duration = 2.4f; c.loop = true;
      c.bobAmp = 0.003f; c.bobFreq = 1.0f;
      c.tracks[models::Q_NECK].add(0.0f, pitch(-30.0f));
      c.tracks[models::Q_HEAD].add(0.00f, pitch(24.0f) * yaw(-7.0f));
      c.tracks[models::Q_HEAD].add(0.50f, pitch(24.0f) * yaw( 7.0f));
      c.tracks[models::Q_HEAD].add(1.00f, pitch(24.0f) * yaw(-7.0f));
      c.tracks[models::Q_EAR_L].add(0.0f, pitch(20.0f));
      c.tracks[models::Q_EAR_R].add(0.0f, pitch(20.0f));
      c.tracks[models::Q_TAIL1].add(0.0f, pitch(-22.0f));
    }

    // ---------------- GRAZE: head down to the grass
    {
      Clip& c = clips[QCLIP_GRAZE];
      c.duration = 3.6f; c.loop = true;
      c.bobAmp = 0.004f; c.bobFreq = 1.0f;
      c.tracks[models::Q_NECK].add(0.0f, pitch(52.0f));
      c.tracks[models::Q_HEAD].add(0.00f, pitch(30.0f));
      c.tracks[models::Q_HEAD].add(0.22f, pitch(36.0f));
      c.tracks[models::Q_HEAD].add(0.44f, pitch(29.0f));
      c.tracks[models::Q_HEAD].add(1.00f, pitch(30.0f));
      c.tracks[models::Q_TAIL1].add(0.00f, roll(-9.0f));
      c.tracks[models::Q_TAIL1].add(0.50f, roll( 9.0f));
      c.tracks[models::Q_TAIL1].add(1.00f, roll(-9.0f));
    }
  }
};

inline QuadLibrary& quadLibrary(){
  static QuadLibrary L;
  L.build();
  return L;
}

// Pick and time a gait from ground speed, in body-lengths per second.
inline void driveQuad(Animator& a, float speed, bool spooked, bool grazing){
  a.bank = quadLibrary().clips;
  if(speed < 0.25f){
    if(spooked)      { a.play(QCLIP_ALERT, 0.18f); a.speedScale = 1.0f; }
    else if(grazing) { a.play(QCLIP_GRAZE, 0.35f); a.speedScale = 1.0f; }
    else             { a.play(QCLIP_IDLE,  0.30f); a.speedScale = 1.0f; }
    return;
  }
  if(speed < 1.9f){
    a.play(QCLIP_WALK, 0.20f);
    a.speedScale = m::clampf(speed / 1.1f, 0.5f, 1.8f);
  } else if(speed < 5.0f){
    a.play(QCLIP_TROT, 0.18f);
    a.speedScale = m::clampf(speed / 3.2f, 0.7f, 1.7f);
  } else {
    a.play(QCLIP_GALLOP, 0.16f);
    a.speedScale = m::clampf(speed / 8.0f, 0.75f, 1.8f);
  }
}

// ---------------------------------------------------------------- bird
enum BClipId { BCLIP_FLAP = 0, BCLIP_GLIDE, BCLIP_COUNT };

struct BirdLibrary {
  Clip clips[BCLIP_COUNT];
  bool built = false;
  void build(){
    if(built) return;
    built = true;
    {
      Clip& c = clips[BCLIP_FLAP];
      c.duration = 0.36f; c.loop = true;
      c.bobAmp = 0.030f; c.bobFreq = 1.0f;
      c.tracks[models::B_WING_L].add(0.00f, roll( 42.0f));
      c.tracks[models::B_WING_L].add(0.50f, roll(-34.0f));
      c.tracks[models::B_WING_L].add(1.00f, roll( 42.0f));
      c.tracks[models::B_WING_R].add(0.00f, roll(-42.0f));
      c.tracks[models::B_WING_R].add(0.50f, roll( 34.0f));
      c.tracks[models::B_WING_R].add(1.00f, roll(-42.0f));
      c.tracks[models::B_TAIL].add(0.00f, pitch( 6.0f));
      c.tracks[models::B_TAIL].add(0.50f, pitch(-6.0f));
      c.tracks[models::B_TAIL].add(1.00f, pitch( 6.0f));
    }
    {
      Clip& c = clips[BCLIP_GLIDE];
      c.duration = 2.4f; c.loop = true;
      c.tracks[models::B_WING_L].add(0.00f, roll( 8.0f));
      c.tracks[models::B_WING_L].add(0.50f, roll( 2.0f));
      c.tracks[models::B_WING_L].add(1.00f, roll( 8.0f));
      c.tracks[models::B_WING_R].add(0.00f, roll(-8.0f));
      c.tracks[models::B_WING_R].add(0.50f, roll(-2.0f));
      c.tracks[models::B_WING_R].add(1.00f, roll(-8.0f));
    }
  }
};
inline BirdLibrary& birdLibrary(){ static BirdLibrary L; L.build(); return L; }

inline Skeleton& birdSkeleton(){
  static Skeleton S;
  S.init(models::birdJointDefs(), models::BJOINT_COUNT);
  return S;
}

} // namespace anim
