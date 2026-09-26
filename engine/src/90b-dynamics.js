/* ============================================================
   BODY DYNAMICS -- what a clip cannot know.

   Every clip in the game is a loop authored in place: a walk is the
   same walk whether the man is setting off, pulling up, turning a
   corner or standing still with his heart going from a sprint. So the
   moment a body changes what it is doing, the animation is wrong --
   nothing leans into the start, nothing is thrown forward by the stop,
   nobody banks into a turn, the arms arrive with the torso instead of
   after it, and the head rides every bob of the spine like a camera
   bolted to a post.

   This layer reads how the body is ACTUALLY moving -- measured from
   where its rig went this frame, so it is equally right for a
   physics-driven bot, a teleported replay and a scripted cutscene
   figure -- and adds, on top of whatever clip is playing:

     lean       the trunk pitches into acceleration and is thrown
                forward by braking, on an underdamped spring, so a
                stop overshoots and settles instead of freezing.
     bank       into a turn, from the centripetal acceleration the
                turn actually has (speed x turn rate).
     lag        the arms trail a change of speed and catch up late,
                and the forearm trails the upper arm -- follow-through
                down the chain, the thing that separates weight from
                rotation.
     gaze       the head counter-rotates the trunk's lean and bank, as
                a real head does to keep the eyes level.
     breath     at rest the chest rises and falls, faster and deeper
                for a while after hard running, then settling back.
     shift      a slow weight shift at the hips, from smooth noise, so
                two men standing in the same idle are not a mirror.

   Additive and small by construction. It rotates bones in their own
   frames after the sample and before anything that corrects the pose
   (the hand IK onto a rifle runs after it and still wins), and every
   channel is a Spring integrated exactly, so it is the same at 30 fps
   and at 144.
   ============================================================ */

const _dynQ = new Quat();

class BodyDynamics {
  constructor(skeleton, opts = {}) {
    this.skeleton = skeleton;
    const ix = (n) => skeleton.index(n);
    this.b = {
      hips: ix('hips'), spine: ix('spine'), chest: ix('chest'), neck: ix('neck'), head: ix('head'),
      uaL: ix('upperArmL'), uaR: ix('upperArmR'), laL: ix('lowerArmL'), laR: ix('lowerArmR'),
      shL: ix('shoulderL'), shR: ix('shoulderR'),
    };
    /* How much of each effect this body gets. A zombie lurches further
       and has no business breathing; a living man is tidier. */
    this.gain = Object.assign({ lean: 1, bank: 1, lag: 1, gaze: 1, breath: 1, shift: 1 }, opts.gain || {});
    this.source = opts.source || null;       // a CharacterController (for facing + body)
    this.seed = opts.seed != null ? opts.seed : Math.random() * 100;
    this.enabled = true;

    this.lean = new Spring(2.1, 0.52);        // pitch, rad
    this.bank = new Spring(1.8, 0.60);        // roll, rad
    this.armA = new Spring(2.6, 0.45);        // upper-arm lag
    this.armB = new Spring(2.2, 0.40);        // forearm, driven by the upper arm
    this.aF = new Spring(6.0, 0.9);           // smoothed forward acceleration
    this.aR = new Spring(6.0, 0.9);           // smoothed lateral acceleration
    this.exert = 0;                           // 0..1, how blown he is
    this.t = 0;
    this._p = null; this._vF = 0; this._vR = 0; this._yaw = null;
  }

  reset() {
    for (const s of [this.lean, this.bank, this.armA, this.armB, this.aF, this.aR]) s.reset(0);
    this._p = null; this._yaw = null; this._vF = 0; this._vR = 0;
  }

  /* Measure the body's motion this frame. Returns false when there is
     nothing trustworthy to measure (first frame, a teleport). */
  _measure(dt) {
    const src = this.source;
    if (!src || !src.body || !(dt > 0)) return false;
    const p = src.body.position, yaw = src.facing || 0;
    if (!this._p) { this._p = [p.x, p.y, p.z]; this._yaw = yaw; return false; }
    const dx = p.x - this._p[0], dz = p.z - this._p[2];
    this._p[0] = p.x; this._p[1] = p.y; this._p[2] = p.z;
    let dyaw = yaw - this._yaw; this._yaw = yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    // A jump of more than ~20 m/s is a teleport or a respawn, not motion.
    if (dx * dx + dz * dz > (20 * dt) * (20 * dt) + 0.04) { this.reset(); return false; }
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const vx = dx / dt, vz = dz / dt;
    const vF = vx * fx + vz * fz;             // along the facing
    const vR = -(vx * fz - vz * fx);          // across it (+ = his right, -X side)
    const aF = (vF - this._vF) / dt, aR = (vR - this._vR) / dt;
    this._vF = vF; this._vR = vR;
    const yawRate = dyaw / dt;
    this.speed = Math.hypot(vx, vz);
    // Centripetal acceleration of the turn is speed x turn rate.
    this.aF.update(Math.max(-30, Math.min(30, aF)), dt);
    this.aR.update(Math.max(-30, Math.min(30, aR + vF * yawRate)), dt);
    return true;
  }

  apply(dt, animator) {
    if (!this.enabled || !(dt > 0)) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const ok = this._measure(dt);
    const G = this.gain;
    const aF = ok ? this.aF.value : 0, aR = ok ? this.aR.value : 0;
    const spd = ok ? (this.speed || 0) : 0;

    /* Exertion rises with running and decays over several seconds, so
       a man who has just sprinted stands there breathing hard. */
    const wantEx = Math.min(1, Math.max(0, (spd - 2.5) / 4));
    this.exert += (wantEx > this.exert ? (wantEx - this.exert) * Math.min(1, dt * 0.8)
      : (wantEx - this.exert) * Math.min(1, dt * 0.12));

    const lean = this.lean.update(Math.max(-0.20, Math.min(0.20, aF * 0.022)) * G.lean, dt);
    const bank = this.bank.update(Math.max(-0.16, Math.min(0.16, -aR * 0.016)) * G.bank, dt);
    const armA = this.armA.update(Math.max(-0.35, Math.min(0.35, -aF * 0.030)) * G.lag, dt);
    const armB = this.armB.update(armA * 0.8, dt);

    /* Breathing and weight shift fade out with speed: a gait carries
       its own torso motion and adding more on top only muddies it. */
    /* A body playing a gait is moving whatever its rig says (a replay, a
       treadmill in a test, a figure pushed by script): no idle breathing
       or weight shift on top of a stride. */
    const gait = animator && animator.current && animator.current.stride > 0;
    const still = gait ? 0 : Math.max(0, 1 - spd / 1.2);
    const rate = 0.24 + 0.34 * this.exert;           // breaths per second
    const depth = (0.010 + 0.030 * this.exert) * G.breath * (0.35 + 0.65 * still);
    this._ph = (this._ph || 0) + dt * rate * 2 * Math.PI;
    const br = Math.sin(this._ph), br2 = Math.max(0, br);
    const sh = G.shift * still;
    const shiftR = noise1(this.t * 0.11, this.seed) * 0.035 * sh;
    const shiftP = noise1(this.t * 0.07, this.seed + 3) * 0.012 * sh;

    const bones = this.skeleton.bones, B = this.b;
    const rot = (i, x, y, z) => {
      if (i < 0 || (Math.abs(x) + Math.abs(y) + Math.abs(z)) < 1e-5) return;
      _dynQ.setEuler(x, y, z);
      bones[i].localRotation.mul(_dynQ);
    };
    // Trunk: the lean and bank shared down the spine, hips least.
    rot(B.hips, lean * 0.25 + shiftP, 0, bank * 0.20 + shiftR);
    rot(B.spine, lean * 0.35 - shiftP * 0.6, 0, bank * 0.40 - shiftR * 0.7);
    rot(B.chest, lean * 0.30 - depth * br, 0, bank * 0.35 - shiftR * 0.25);
    // The head keeps the eyes level: it takes most of the trunk back out.
    const trunkP = lean * 0.9 + shiftP * 0.4 - depth * br;
    const trunkR = bank * 0.95 + shiftR * 0.05;
    rot(B.neck, -trunkP * 0.35 * G.gaze, 0, -trunkR * 0.35 * G.gaze);
    rot(B.head, -trunkP * 0.45 * G.gaze + depth * br * 0.3, 0, -trunkR * 0.45 * G.gaze);
    // Shoulders ride the breath; arms trail the change of speed.
    rot(B.shL, 0, 0, depth * br2 * 0.8);
    rot(B.shR, 0, 0, -depth * br2 * 0.8);
    rot(B.uaL, armA, 0, 0); rot(B.uaR, armA, 0, 0);
    rot(B.laL, armB * 0.6, 0, 0); rot(B.laR, armB * 0.6, 0, 0);
  }
}
