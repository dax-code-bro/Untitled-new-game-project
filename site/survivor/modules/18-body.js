/* ============================================================
   Your own body, seen from inside it.

   A first-person game that shows nothing below the eyeline is a
   floating camera with opinions. This module hangs a real body off
   the camera: shoulders, arms, hands with five articulated digits,
   a chest, thighs, knees, shins and boots. It is not a decoration —
   the same rig carries the damage you have taken (the arm you broke
   hangs; the thigh you opened is bloody and bandaged), the cold
   (hands curl and the whole rig shivers at the frequency real
   shivering runs at), and what you are holding (the hands are placed
   ON the gun by two-bone inverse kinematics, not near it).

   Everything is placed relative to the camera each frame rather than
   parented, because the engine has no scene graph — one flat actor
   list and a transform per actor. Forward kinematics in the engine
   does the work; this file decides the angles.
   ============================================================ */

SurvivorGame.module({
  id: 'body',
  order: 18,
  init(ctx) {
    const LE = ctx.LE;
    const game = ctx.game;
    const { Vec3, Quat } = LE;

    /* ---- proportions, relative to the eye ----
       Eye height 1.62 m on a 1.78 m frame. The acromion sits 0.21 m
       below the eye and 0.20 m out; the hip joint 0.71 m below and
       0.09 m out; the shoulder is set back 0.04 m because the eye is
       forward of the spine, not on it. */
    const EYE = 1.62;
    const SHOULDER_DROP = 0.212, SHOULDER_OUT = 0.198, SHOULDER_BACK = 0.045;
    const HIP_DROP = 0.705, HIP_OUT = 0.092, HIP_BACK = 0.055;
    const CHEST_DROP = 0.115, CHEST_BACK = 0.075;

    const L1 = LE.FP_SEG.upperArm, L2 = LE.FP_SEG.forearm;

    /* ---- scratch ---- */
    const _q = new Quat(), _q2 = new Quat();
    const _v = new Vec3(), _v2 = new Vec3(), _v3 = new Vec3();

    /* ---- what the body is wearing ----
       Published by the inventory module; this is the fallback so the
       body is never naked even before anything is equipped. */
    function outfit() {
      return ctx.state.outfit || {
        torso: 'linen', arms: 'linen', legs: 'canvas', feet: 'boot', hands: null,
      };
    }
    const CLOTH_MAT = {
      linen: 'linen', wool: 'wool', canvas: 'canvas', denim: 'denim',
      hide: 'hide', fur: 'fur', boot: 'boot', rubber: 'rubber',
    };

    /* ---- actors ----
       One per bone, plus sleeves. Built once; only their transforms
       change. The finger phalanges dominate the count (30 of them),
       so the legs and chest are only created when they can be seen. */
    const rig = { left: null, right: null, legs: null, chest: null };
    let built = false;

    /* Every body actor is uploaded white and coloured with setTint,
       because setTint multiplies: a part built in its own colour and
       then tinted the same colour comes out nearly black. Colour lives
       in exactly one place — the tint — and the material carries only
       roughness and metalness. */
    function matFor(name) {
      const m = LE.FP_MATERIAL[name] || LE.FP_MATERIAL.skin;
      return { color: 0xffffff, roughness: m.roughness, metalness: m.metalness };
    }

    function makeActor(key, geo, mat, name) {
      if (!geo) return null;
      const a = game.mesh({
        geometry: geo, key, material: matFor(mat), at: [0, -2000, 0],
        physics: false, name: name || 'body',
      });
      if (a) { a.noCull = true; a.visible = false; }
      return a;
    }

    function buildArm(side) {
      const S = side > 0 ? 1 : -1;
      const tag = S > 0 ? 'r' : 'l';
      const arm = LE.armBones(S);
      const hand = LE.handBones(S);
      const actors = new Map();
      for (const b of arm) {
        if (!b.geo) continue;
        /* The deltoid cap lives 0.06 m from the eye once the head is
           where a head goes. Nobody can see their own shoulder, and
           drawing it only puts geometry through the near plane. */
        if (b.id === 'shoulder') continue;
        actors.set(b.id, makeActor(`fp:${b.geo}`, LE.fpGeometry(b.geo, 1), b.mat, `fp:${tag}:${b.id}`));
      }
      for (const b of hand) {
        actors.set(b.id, makeActor(`fp:${b.geo}:${tag}`, LE.fpGeometry(b.geo, S), b.mat, `fp:${tag}:${b.id}`));
      }
      // Cloth over the arm.
      const sleeve = {
        upperArm: makeActor('fp:sleeve:upperArm', LE.fpGeometry('sleeve:upperArm', 1), 'linen', `fp:${tag}:sleeveU`),
        forearm: makeActor('fp:sleeve:forearm', LE.fpGeometry('sleeve:forearm', 1), 'linen', `fp:${tag}:sleeveF`),
      };
      return { side: S, arm, hand, actors, sleeve, solvedArm: new Map(), solvedHand: new Map() };
    }

    function buildLegs() {
      const out = [];
      for (const S of [1, -1]) {
        const tag = S > 0 ? 'r' : 'l';
        const bones = LE.legBones(S);
        const actors = new Map();
        for (const b of bones) {
          actors.set(b.id, makeActor(`fp:${b.geo}:${b.geo === 'boot' ? tag : 'x'}`,
            LE.fpGeometry(b.geo, b.geo === 'boot' ? S : 1), b.mat, `fp:${tag}:${b.id}`));
        }
        const trouser = {
          thigh: makeActor('fp:sleeve:thigh', LE.fpGeometry('sleeve:thigh', 1), 'canvas', `fp:${tag}:trouserT`),
          shank: makeActor('fp:sleeve:shank', LE.fpGeometry('sleeve:shank', 1), 'canvas', `fp:${tag}:trouserS`),
        };
        out.push({ side: S, bones, actors, trouser, solved: new Map() });
      }
      return out;
    }

    function build() {
      if (built) return;
      built = true;
      rig.right = buildArm(1);
      rig.left = buildArm(-1);
      rig.legs = buildLegs();
      rig.chest = makeActor('fp:chest', LE.fpGeometry('chest', 1), 'linen', 'fp:chest');
    }

    /* ---- animation state ---- */
    let stride = 0;          // gait phase, radians
    let strideAmp = 0;       // smoothed, so the legs do not snap into a walk
    let breathe = 0;
    let shiver = 0;
    let handBlend = { left: 0, right: 0 };   // 0 empty, 1 gripping
    const tremor = { x: 0, y: 0, z: 0, t: 0 };

    /* Shivering is not a wobble. It is 8–12 Hz tremor in the large
       muscle groups, strongest in the shoulders and jaw, and it does
       not stop while you are cold — which is exactly why it makes a
       rifle useless and why anyone who has done it remembers it. */
    function updateTremor(dt, intensity) {
      tremor.t += dt;
      const f = 10.5;
      const a = intensity * 0.0055;
      tremor.x = Math.sin(tremor.t * f * 6.2831) * a
        + Math.sin(tremor.t * f * 1.7 * 6.2831) * a * 0.45;
      tremor.y = Math.sin(tremor.t * f * 0.83 * 6.2831 + 1.1) * a * 0.8;
      tremor.z = Math.sin(tremor.t * f * 1.31 * 6.2831 + 2.3) * a * 0.6;
    }

    /* ---- damage ----
       The body region a wound is in maps onto the bones that carry it.
       A laceration on the forearm tints that forearm; a fracture makes
       the whole limb hang; a bandage covers it. This is the visible
       half of the injury system, which until now only existed as
       numbers in a panel. */
    const REGION_BONES = {
      head: [], neck: [], chest: ['chest'], abdomen: ['chest'],
      upperArm: ['upperArm'], forearm: ['forearm'], hand: ['palm'],
      thigh: ['thigh'], lowerLeg: ['shank'], foot: ['boot'], pelvis: ['chest'],
    };

    let damage = { bones: new Map(), stamp: -1 };
    function refreshDamage() {
      const inj = ctx.player.injury;
      if (!inj) return;
      const sum = inj.summary();
      const stamp = (sum.wounds ? sum.wounds.length : 0) * 97
        + (sum.fractures ? sum.fractures.length : 0) * 31
        + Math.round((sum.pain || 0) * 50);
      if (stamp === damage.stamp) return;
      damage.stamp = stamp;
      const m = new Map();
      const put = (id, kind, weight) => {
        const cur = m.get(id);
        if (!cur || weight > cur.weight) m.set(id, { kind, weight });
      };
      for (const w of (sum.wounds || [])) {
        const bones = REGION_BONES[w.region] || [];
        const kind = w.dressed || w.bandaged ? 'bandage'
          : w.type === 'contusion' ? 'bruise' : 'blood';
        for (const b of bones) put(b, kind, (w.severity || 0.4) + (kind === 'bandage' ? 0.5 : 0));
      }
      for (const f of (sum.fractures || [])) {
        const bones = REGION_BONES[f.region] || [];
        for (const b of bones) put(b, f.splinted ? 'bandage' : 'bruise', 0.9);
      }
      damage.bones = m;
      applyTints();
    }

    function tintOf(baseMat, bone) {
      const d = damage.bones.get(bone);
      if (!d) return null;
      return d.kind === 'bandage' ? 'bandage' : d.kind === 'bruise' ? 'bruise' : 'blood';
    }

    function applyTints() {
      const o = outfit();
      const set = (actor, bone, defMat) => {
        if (!actor) return;
        const t = tintOf(defMat, bone);
        const mat = LE.FP_MATERIAL[t || defMat] || LE.FP_MATERIAL.skin;
        actor.setTint(mat.color);
      };
      for (const side of [rig.right, rig.left]) {
        if (!side) continue;
        set(side.actors.get('upperArm'), 'upperArm', 'skin');
        set(side.actors.get('forearm'), 'forearm', 'skin');
        set(side.actors.get('shoulder'), 'upperArm', 'skin');
        set(side.actors.get('palm'), 'palm', 'skin');
        for (const name of LE.FP_FINGERS) {
          for (let i = 1; i <= 3; i++) set(side.actors.get(`${name}${i}`), 'palm', 'skin');
        }
        for (let i = 0; i <= 2; i++) set(side.actors.get(`thumb${i}`), 'palm', 'skin');
        const sm = LE.FP_MATERIAL[CLOTH_MAT[o.arms] || 'linen'];
        if (side.sleeve.upperArm) side.sleeve.upperArm.setTint(sm.color);
        if (side.sleeve.forearm) side.sleeve.forearm.setTint(sm.color);
      }
      for (const leg of (rig.legs || [])) {
        set(leg.actors.get('thigh'), 'thigh', 'skin');
        set(leg.actors.get('knee'), 'thigh', 'skin');
        set(leg.actors.get('shank'), 'shank', 'skin');
        const bm = LE.FP_MATERIAL[CLOTH_MAT[o.feet] || 'boot'];
        if (leg.actors.get('boot')) leg.actors.get('boot').setTint(bm.color);
        const tm = LE.FP_MATERIAL[CLOTH_MAT[o.legs] || 'canvas'];
        if (leg.trouser.thigh) leg.trouser.thigh.setTint(tm.color);
        if (leg.trouser.shank) leg.trouser.shank.setTint(tm.color);
      }
      if (rig.chest) {
        const cm = LE.FP_MATERIAL[CLOTH_MAT[o.torso] || 'linen'];
        const d = damage.bones.get('chest');
        rig.chest.setTint(d ? LE.FP_MATERIAL[d.kind === 'bandage' ? 'bandage' : 'blood'].color : cm.color);
      }
    }
    ctx.on('outfit-changed', () => { damage.stamp = -1; applyTints(); });

    /* ---- two-bone IK ----
       Shoulder S, target T, upper arm L1, forearm L2, elbow pushed
       toward `pole`. The elbow of someone holding a rifle goes down
       and out, never up, which is the whole reason for the pole. */
    function solveElbow(S, T, pole, out) {
      _v.subVectors(T, S);
      let d = _v.length();
      const max = (L1 + L2) * 0.999;
      if (d > max) { _v.scale(max / d); d = max; }
      if (d < 1e-4) { out.copy(S); return out; }
      const dir = _v2.copy(_v).scale(1 / d);
      // Distance along the chord to the elbow's projection.
      const a = (d * d + L1 * L1 - L2 * L2) / (2 * d);
      const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      // A perpendicular in the plane containing the pole.
      _v3.copy(pole).addScaled(dir, -pole.dot(dir));
      if (_v3.lengthSq() < 1e-8) dir.perpendicular(_v3);
      _v3.normalize();
      out.copy(S).addScaled(dir, a).addScaled(_v3, h);
      return out;
    }

    const _elbow = new Vec3(), _shoulderW = new Vec3(), _target = new Vec3(), _pole = new Vec3();

    /* ---- per-frame ---- */
    const bodyQ = new Quat();
    const camPos = new Vec3();
    const fwd = new Vec3(), right = new Vec3(), up = new Vec3();

    function hidden() {
      return ctx.paused || ctx.state.benchOpen || ctx.state.uiOpen
        || ctx.state.mapOpen || ctx.state.inVehicle || ctx.state.dead;
    }

    function hideAll() {
      const each = (a) => { if (a) a.visible = false; };
      for (const side of [rig.right, rig.left]) {
        if (!side) continue;
        for (const a of side.actors.values()) each(a);
        each(side.sleeve.upperArm); each(side.sleeve.forearm);
      }
      for (const leg of (rig.legs || [])) {
        for (const a of leg.actors.values()) each(a);
        each(leg.trouser.thigh); each(leg.trouser.shank);
      }
      each(rig.chest);
    }

    /* Where each hand wants to be, in world space.

       A hand is described by an anchor — the point the palm closes on —
       and an orientation. The wrist is then backed off along the hand's
       own axis, so the geometry lands on the object instead of the
       joint landing on it. Getting this the other way round is why
       hands in games so often float a palm's width off the grip. */
    const gunQ = new Quat(), gunP = new Vec3();
    /* Constant hand orientations in gun space, built from directions
       rather than Euler triples because they are easier to reason about
       and impossible to get subtly wrong.
         support: knuckles point to the shooter's right, palm up — the
           hand cradles the fore-end from underneath and the fingers
           close upward around it.
         firing: knuckles point up the raked grip, palm to the left —
           the fingers wrap the front of the grip, the thumb goes over. */
    const Q_SUPPORT = new Quat().setLookRotation(new Vec3(1, 0, 0), new Vec3(0, -1, 0));
    const Q_FIRING = new Quat().setLookRotation(
      new Vec3(0, 0.94, -0.34).normalize(), new Vec3(1, 0, 0));
    const WRIST_BACK = 0.088;         // wrist crease to the middle knuckle

    function handTargets(st, pitch) {
      const gf = ctx.state.gunFrame;
      const out = { right: null, left: null, rightQ: null, leftQ: null,
        poseR: 'relaxed', poseL: 'relaxed', perR: null, perL: null, backR: 0.035, backL: 0.035 };
      if (gf && !gf.hidden) {
        gunP.set(gf.p[0], gf.p[1], gf.p[2]);
        gunQ.set(gf.q[0], gf.q[1], gf.q[2], gf.q[3]);

        _v.set(gf.grip[0], gf.grip[1], gf.grip[2]).applyQuat(gunQ);
        out.right = new Vec3(gunP.x + _v.x, gunP.y + _v.y, gunP.z + _v.z);
        out.rightQ = new Quat().mulQuats(gunQ, Q_FIRING);
        out.poseR = 'gripStock';
        out.backR = WRIST_BACK;
        /* The trigger finger is not in the grip. It lies along the
           frame until it is on the trigger, which is the single most
           telling detail in how someone handles a firearm. */
        const onTrigger = (ctx.state.weaponTrigger || 0);
        out.perR = { index: {
          mcp: 0.26 + onTrigger * 0.60, pip: 0.16 + onTrigger * 0.98, dip: 0.08 + onTrigger * 0.56,
        } };

        if (gf.fore) {
          // Wrist comes in from the left and below; the palm is the shelf.
          _v.set(gf.fore[0] - 0.052, gf.fore[1] - 0.042, gf.fore[2]).applyQuat(gunQ);
          out.left = new Vec3(gunP.x + _v.x, gunP.y + _v.y, gunP.z + _v.z);
          out.leftQ = new Quat().mulQuats(gunQ, Q_SUPPORT);
          out.poseL = 'support';
          out.backL = 0.020;
        } else {
          // A handgun goes into two hands, the support hand wrapped
          // around the outside of the firing one.
          _v.set(gf.grip[0] - 0.030, gf.grip[1] - 0.030, gf.grip[2] - 0.012).applyQuat(gunQ);
          out.left = new Vec3(gunP.x + _v.x, gunP.y + _v.y, gunP.z + _v.z);
          out.leftQ = new Quat().mulQuats(gunQ, Q_FIRING);
          out.poseL = 'support';
          out.backL = WRIST_BACK;
        }
        return out;
      }

      /* No gun. The hands swing with the gait, and whatever tool is in
         hand decides the grip. */
      const tool = ctx.state.heldTool || null;
      const swing = Math.sin(stride) * strideAmp;
      const lift = Math.cos(stride * 2) * strideAmp * 0.35;
      /* Empty hands are carried low and a little forward, which is
         where hands go when a body is walking somewhere and expecting
         to have to do something. */
      const base = (S, phase) => {
        const v = new Vec3().copy(camPos);
        v.y -= 0.45 - lift * (S > 0 ? 1 : -1) * 0.07;
        _v.set(S * 0.170, 0, 0.40 + phase * 0.26).applyQuat(bodyQ);
        v.add(_v);
        return v;
      };
      out.right = base(1, swing);
      out.left = base(-1, -swing);
      // null means "take the wrist from the forearm", which is what a
      // wrist does when nothing is being held.
      out.rightQ = null; out.leftQ = null;
      if (tool) {
        /* A haft is held in the right hand and lifted into view — you
           can see the axe you are about to swing with. */
        const g = new Vec3().copy(camPos);
        _v.set(0.19, -0.30, 0.44).applyQuat(_q.setEuler(-pitch * 0.55, Math.atan2(fwd.x, fwd.z), 0));
        g.add(_v);
        out.right = g;
        out.rightQ = new Quat().mulQuats(bodyQ, _q2.setEuler(0.62, -0.40, 0.24));
        out.poseR = tool === 'bow' ? 'gripString' : 'gripHaft';
        out.backR = WRIST_BACK;
      }
      // Cold hands curl whatever else they are doing.
      if (st && st.shivering > 0.2) {
        out.poseR = out.poseR === 'relaxed' ? 'cold' : out.poseR;
        out.poseL = out.poseL === 'relaxed' ? 'cold' : out.poseL;
      }
      return out;
    }

    function poseArm(part, targetP, targetQIn, poseName, per, blendCold, back) {
      const S = part.side;
      const tag = S > 0 ? 1 : -1;
      /* A free hand is oriented by the arm that carries it. Only a hand
         that has hold of something gets told where to point, and then
         the arm is what has to follow. */
      let targetQ = targetQIn;
      if (!targetQ) {
        _v.copy(targetP).sub(camPos);
        targetQ = new Quat().mulQuats(bodyQ, _q2.setEuler(1.45, -tag * 0.14, tag * 0.20));
      }

      // Shoulder in world space.
      _shoulderW.copy(camPos);
      _shoulderW.y -= SHOULDER_DROP;
      _v.set(tag * SHOULDER_OUT, 0, -SHOULDER_BACK).applyQuat(bodyQ);
      _shoulderW.add(_v);
      _shoulderW.x += tremor.x; _shoulderW.y += tremor.y; _shoulderW.z += tremor.z;

      _target.copy(targetP);
      // The wrist is behind the palm, so aim the IK at the wrist.
      _v.set(0, 0, -(back == null ? 0.035 : back)).applyQuat(targetQ);
      _target.add(_v);

      /* Elbows go down and slightly outboard. Down comes from world
         gravity, outboard from the shoulder — an elbow tucked into the
         ribs is a pistol stance and looks wrong on a rifle. */
      /* Elbows go down and only slightly outboard. Pushed out hard the
         arms read as a chicken's, which is exactly what the first pass
         of this looked like. */
      _pole.set(tag * 0.20, -1, -0.06).applyQuat(bodyQ).normalize();
      solveElbow(_shoulderW, _target, _pole, _elbow);

      const angles = {};
      // Shoulder cap points at the elbow; the upper arm follows it.
      _v.subVectors(_elbow, _shoulderW);
      if (_v.lengthSq() < 1e-8) _v.set(0, -1, 0);
      const qUpper = new Quat().setLookRotation(_v, Vec3.UP);
      _v2.subVectors(_target, _elbow);
      if (_v2.lengthSq() < 1e-8) _v2.set(0, -1, 0);
      const qFore = new Quat().setLookRotation(_v2, Vec3.UP);

      // Place the arm chain by hand — three bones, no need for a solver.
      const put = (id, p, q) => {
        const a = part.actors.get(id);
        if (a) { a.setPosition([p.x, p.y, p.z]); a.setRotation(q); a.visible = true; }
      };
      _v.copy(_shoulderW);
      /* Cloth replaces the limb it covers rather than sitting on top of
         it — two surfaces a millimetre apart fight for the depth buffer
         and the skin speckles through the cloth. */
      const o = outfit();
      if (!o.arms) put('upperArm', _v, qUpper);
      else { const ua = part.actors.get('upperArm'); if (ua) ua.visible = false; }
      put('forearm', _elbow, qFore);

      // Sleeves ride the same bones.
      const showSleeves = !(ctx.state.bodyDebug && ctx.state.bodyDebug.noSleeves) && !!o.arms;
      if (!showSleeves) {
        if (part.sleeve.upperArm) part.sleeve.upperArm.visible = false;
        if (part.sleeve.forearm) part.sleeve.forearm.visible = false;
      }
      if (part.sleeve.upperArm && showSleeves) {
        part.sleeve.upperArm.setPosition([_shoulderW.x, _shoulderW.y, _shoulderW.z]);
        part.sleeve.upperArm.setRotation(qUpper);
        part.sleeve.upperArm.visible = true;
      }
      if (part.sleeve.forearm && showSleeves) {
        part.sleeve.forearm.setPosition([_elbow.x, _elbow.y, _elbow.z]);
        part.sleeve.forearm.setRotation(qFore);
        part.sleeve.forearm.visible = true;
      }

      /* The hand. Its root is the wrist; the palm runs from there. */
      const pose = blendCold > 0.02
        ? LE.fpPose(poseName, 'cold', blendCold * 0.7) : LE.fpPose(poseName);
      const jointAngles = LE.fpJointAngles(pose, tag, per);
      Object.assign(angles, jointAngles);
      const solved = LE.fpSolve(part.hand, angles, _target, targetQ, part.solvedHand);
      for (const [id, node] of solved) {
        const a = part.actors.get(id);
        if (!a) continue;
        a.setPosition([node.p.x, node.p.y, node.p.z]);
        a.setRotation(node.q);
        a.visible = true;
      }
      return solved;
    }

    function poseLegs(pitch, st) {
      /* Legs cost thirteen actors and are only visible when you look
         down past about twenty degrees, so they are not drawn the rest
         of the time. It is the same reason a real game hides them. */
      const show = pitch < -0.30;
      if (!show) {
        for (const leg of rig.legs) {
          for (const a of leg.actors.values()) if (a) a.visible = false;
          if (leg.trouser.thigh) leg.trouser.thigh.visible = false;
          if (leg.trouser.shank) leg.trouser.shank.visible = false;
        }
        if (rig.chest) rig.chest.visible = pitch < -0.12;
        if (rig.chest && rig.chest.visible) placeChest();
        return;
      }
      placeChest();
      const broken = ctx.state.legBroken || 0;
      for (const leg of rig.legs) {
        const S = leg.side;
        // The two legs are half a cycle apart, which is what walking is.
        const ph = stride + (S > 0 ? 0 : Math.PI);
        const swing = Math.sin(ph) * strideAmp;
        const knee = Math.max(0, Math.sin(ph + 0.9)) * strideAmp * 1.15
          + 0.06 + (st && st.stance === 'crouched' ? 0.85 : 0);
        const hip = new Vec3().copy(camPos);
        hip.y -= HIP_DROP * (st && st.stance === 'crouched' ? 0.78 : 1);
        _v.set(S * HIP_OUT, 0, -HIP_BACK).applyQuat(bodyQ);
        hip.add(_v);

        const angles = {
          thigh: { flex: 1.5708 - swing * 0.55 - (st && st.stance === 'crouched' ? 0.9 : 0) + (broken && S > 0 ? 0.35 : 0) },
          knee: { flex: 0 },
          shank: { flex: knee },
          boot: { flex: -knee * 0.75 - 1.5708 + swing * 0.25 },
        };
        const solved = LE.fpSolve(leg.bones, angles, hip, bodyQ, leg.solved);
        const trousered = !!outfit().legs;
        for (const [id, node] of solved) {
          const a = leg.actors.get(id);
          if (!a) continue;
          a.setPosition([node.p.x, node.p.y, node.p.z]);
          a.setRotation(node.q);
          a.visible = !(trousered && (id === 'thigh' || id === 'knee' || id === 'shank'));
        }
        const t = solved.get('thigh'), sh = solved.get('shank');
        if (leg.trouser.thigh) leg.trouser.thigh.visible = false;
        if (leg.trouser.shank) leg.trouser.shank.visible = false;
        if (trousered && leg.trouser.thigh && t) {
          leg.trouser.thigh.setPosition([t.p.x, t.p.y, t.p.z]);
          leg.trouser.thigh.setRotation(t.q); leg.trouser.thigh.visible = true;
        }
        if (trousered && leg.trouser.shank && sh) {
          leg.trouser.shank.setPosition([sh.p.x, sh.p.y, sh.p.z]);
          leg.trouser.shank.setRotation(sh.q); leg.trouser.shank.visible = true;
        }
      }
    }

    function placeChest() {
      if (!rig.chest) return;
      const p = new Vec3().copy(camPos);
      p.y -= CHEST_DROP;
      /* Set back far enough that the camera is never inside the chest —
         the near plane is 0.25 m and the chest is 0.11 m deep, so
         anything closer than about 0.14 m behind the eye renders the
         inside of your own ribcage across the whole screen. */
      _v.set(0, 0, -CHEST_BACK).applyQuat(bodyQ);
      p.add(_v);
      p.x += tremor.x * 0.7; p.y += tremor.y * 0.7;
      rig.chest.setPosition([p.x, p.y, p.z]);
      rig.chest.setRotation(bodyQ);
      rig.chest.visible = true;
    }

    /* ---- the frame ---- */
    ctx.onUpdate((dt) => {
      if (!built) { build(); applyTints(); }
      if (hidden()) { hideAll(); return; }

      const cam = game.camera;
      camPos.copy(cam.position);
      fwd.copy(cam.forward); right.copy(cam.right); up.copy(cam.trueUp);
      const yaw = Math.atan2(fwd.x, fwd.z);
      const pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
      bodyQ.setEuler(0, yaw, 0);

      const st = ctx.player.body.status(ctx.world.clock.hourOfDay);
      const speed = ctx.player.speedMs || 0;

      /* Gait. Cadence rises with speed the way a real one does — about
         1.9 Hz at a walk and 3.2 Hz at a run — and the arms swing with
         it. Standing still, the amplitude bleeds off rather than
         stopping dead, because a body does not. */
      const cadence = speed > 0.15 ? (1.55 + speed * 0.42) : 0;
      stride += dt * cadence * 6.2831;
      if (stride > 6.2831 * 64) stride -= 6.2831 * 64;
      const want = Math.min(0.62, speed * 0.16);
      strideAmp += (want - strideAmp) * Math.min(1, dt * 5);

      breathe += dt * (0.22 + st.energy * 0.06 + (1 - st.capacity) * 0.5);
      shiver += (st.shivering - shiver) * Math.min(1, dt * 2);
      updateTremor(dt, shiver + (1 - st.capacity) * 0.25);

      refreshDamage();

      const targets = handTargets(st, pitch);
      // Breathing lifts everything a few millimetres. It is small and it
      // is the difference between a body and a prop.
      const br = Math.sin(breathe * 6.2831) * 0.006 * (1 + st.shivering);
      camPos.y += br;

      poseArm(rig.right, targets.right, targets.rightQ, targets.poseR, targets.perR, shiver, targets.backR);
      poseArm(rig.left, targets.left, targets.leftQ, targets.poseL, targets.perL, shiver, targets.backL);
      poseLegs(pitch, st);
      camPos.y -= br;

      /* Publish the grip point so anything else that wants to sit in a
         hand — a torch, a fish, a handful of berries — can. */
      const g = LE.fpGripPoint(rig.right.solvedHand);
      if (g) ctx.state.rightGrip = [g.x, g.y, g.z];
    });

    /* A probe can turn groups off to find which one is drawing badly.
       Nothing in the game sets these. */
    ctx.state.bodyDebug = ctx.state.bodyDebug || {};
    ctx.state.bodyRig = rig;

    ctx.log('You can see your hands.');
  },
});
