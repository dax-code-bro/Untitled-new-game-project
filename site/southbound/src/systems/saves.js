// Saving the game, and picking up where you left off.
//  - You can only save when you're safe: not wanted, no one hostile nearby, not shot at or
//    shooting for a while, on your feet (or in a stopped car), outside, alive. F5 or the pause
//    menu's "Save game"; it says why not when you can't.
//  - The autosave still keeps your money, guns and progress, but the place you'll come back to
//    only moves while you're safe: a save never drops you back into the middle of a fight.
//  - Loading a save puts you within 20 m of where you saved, already doing something: smoking a
//    cigarette, cleaning your gun, or drinking a coffee. The camera looks on until you move.
import * as THREE from 'three';

const HOSTILE_R = 120, CALM_HURT = 20, CALM_SHOT = 15;

export function installSaves(game) {
  const { S, player, career, police, peds, combat, hud } = game;
  let hurtAt = -1e9, shotAt = -1e9, clock = 0, lastKick = 0;

  // why you can't save right now (null = you can)
  const why = () => {
    if (S.dead > 0) return 'you\'re down';
    if (police.wanted > 0) return 'you\'re wanted by the police';
    if (S.indoors) return 'step outside first';
    if (S.mode === 'car' && Math.abs(S.vehicle?.speed || 0) > 1) return 'stop the vehicle first';
    if (S.mode === 'foot' && (player.swimming || !player.grounded)) return 'get your feet on the ground';
    const p = S.mode === 'car' ? S.vehicle.pos : player.pos;
    const foe = peds.list.some((q) => q.mode !== 'dead' && (q.role === 'foe' || q.foe || q.mode === 'attack') && q.pos.distanceTo(p) < HOSTILE_R)
      || (game.hunting?.list || []).some((x) => !x.dead && x.mode === 'charge' && x.pos.distanceTo(p) < 60);
    if (foe) return 'there are enemies nearby';
    const hurt = clock - hurtAt, shot = clock - shotAt;
    if (hurt < CALM_HURT) return `you were just hurt (wait ${Math.ceil(CALM_HURT - hurt)} s)`;
    if (shot < CALM_SHOT) return `you were just in a fight (wait ${Math.ceil(CALM_SHOT - shot)} s)`;
    return null;
  };
  game.safeToSave = () => !why();

  const saveNow = () => {
    const r = why();
    if (r) { hud.toast(`You can't save now: ${r}`, 2.4); return false; }
    S.safeSpot = true;
    career.save();
    hud.toast('Game saved. You\'ll pick up near here.', 2.4);
    return true;
  };
  game.saveGame = saveNow;
  addEventListener('keydown', (e) => { if (e.code === 'F5' && !e.repeat) { e.preventDefault(); if (!S.paused) saveNow(); } });

  // ---------------- arrival: a few seconds of something ordinary ----------------
  const P = career.p;
  let act = null;
  const props = {};
  const mat = (c, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const cigarette = () => {
    if (props.cig) return props.cig;
    const g = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.06, 8).rotateZ(Math.PI / 2), mat(0xf2efe8, 0.8));
    const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.0044, 0.0044, 0.022, 8).rotateZ(Math.PI / 2).translate(-0.041, 0, 0), mat(0xc98a3c, 0.7));
    const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.0043, 0.0043, 0.006, 8).rotateZ(Math.PI / 2).translate(0.033, 0, 0), new THREE.MeshStandardMaterial({ color: 0x401a0a, emissive: 0xff5a1a, emissiveIntensity: 1.5, roughness: 0.9 }));
    g.add(paper, filter, ember); g.userData.ember = ember;
    return (props.cig = g);
  };
  const cup = () => {
    if (props.cup) return props.cup;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.1, 16, 1, true), mat(0xe9e4da, 0.5));
    body.material.side = THREE.DoubleSide;
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.038, 16).rotateX(-Math.PI / 2).translate(0, 0.035, 0), mat(0x2a160c, 0.2));
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.034, 16).rotateX(Math.PI / 2).translate(0, -0.05, 0), mat(0xe9e4da, 0.5));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12, Math.PI).rotateZ(-Math.PI / 2).translate(0.04, 0.0, 0), mat(0xe9e4da, 0.5));
    g.add(body, coffee, base, handle);
    return (props.cup = g);
  };
  const rag = () => props.rag || (props.rag = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.07), mat(0x9a8f76, 0.95)));
  // smoke from a drag: a few soft puffs that drift up and spread
  const puffs = [];
  const puffMat = () => {
    if (props.puffMat) return props.puffMat;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(235,235,235,0.6)'); gr.addColorStop(1, 'rgba(235,235,235,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return (props.puffMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.5 }));
  };
  const puff = (at, dir) => {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(puffMat().clone());
      s.position.copy(at); s.scale.setScalar(0.06);
      s.userData = { v: dir.clone().multiplyScalar(0.25 + Math.random() * 0.15).add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.12 + Math.random() * 0.08, (Math.random() - 0.5) * 0.08)), t: -i * 0.12, life: 2.6 };
      game.scene.add(s); puffs.push(s);
    }
  };

  // somewhere to stand within 20 m of where you saved: on open ground, not in a building or water
  const nearSpot = (x, z) => {
    const y0 = game.collision.surface(x, z, 500);
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 14;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (game.hm.height(px, pz) < game.hm.waterLevel(px, pz) + 0.3) continue;
      let blocked = false;
      game.collision.query(px, pz, 3, (it) => { if (blocked) return; if (it.t === 0 && px > it.minX - 0.8 && px < it.maxX + 0.8 && pz > it.minZ - 0.8 && pz < it.maxZ + 0.8) blocked = true; else if (it.t === 1 && it.r > 0 && Math.hypot(it.x - px, it.z - pz) < it.r + 0.8) blocked = true; else if (it.t === 3) { const dx = it.bx - it.ax, dz = it.bz - it.az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - it.ax) * dx + (pz - it.az) * dz) / L2)); if (Math.hypot(it.ax + dx * t - px, it.az + dz * t - pz) < it.hw + 0.5) blocked = true; } });
      if (blocked) continue;
      const y = game.collision.surface(px, pz, y0 + 3);
      if (Math.abs(y - y0) > 2.5) continue; // not up on a roof or down a bank
      return { x: px, z: pz };
    }
    return { x, z };
  };

  const ownsGun = () => combat.owned.some((id) => id !== 'fists' && !game.catalogs?.WEAPONS?.[id]?.melee);
  const arrive = (force = null) => {
    if (!Array.isArray(P.pos) || P.pos.length < 2) return false;
    const s = nearSpot(P.pos[0], P.pos[1]);
    const h = Math.random() * Math.PI * 2;
    game.teleport(s.x, s.z, h);
    const kinds = ['smoke', 'coffee'];
    if (ownsGun()) kinds.push('clean', 'clean');
    if (act) end();
    act = { kind: force || kinds[(Math.random() * kinds.length) | 0], t: 0, dur: 18, mode: game.rig.mode, gun: null };
    if (act.kind === 'clean') act.gun = combat.owned.find((id) => id !== 'fists' && !game.catalogs?.WEAPONS?.[id]?.melee);
    combat.holstered = true;
    // a close shot from the front, a little to one side (the view you had comes back when you move)
    act.zoom = game.rig.zoom;
    game.rig.mode = 2; game.rig.zoom = 0.6;
    game.rig.yaw = h + Math.PI - 0.7; game.rig.pitch = 0.06;
    const what = { smoke: 'having a smoke', coffee: 'finishing a coffee', clean: 'cleaning your gun' }[act.kind];
    hud.toast(`Back in Calvera, ${what}. Move to carry on.`, 4);
    return true;
  };
  game.arrival = { arrive, active: () => !!act, kind: () => act?.kind };

  const end = () => {
    for (const k of ['cig', 'cup', 'rag']) if (props[k]?.parent) props[k].parent.remove(props[k]);
    if (act?.gunModel) act.gunModel.visible = false;
    if (act) { game.rig.mode = act.mode; game.rig.zoom = act.zoom ?? 1; }
    act = null;
  };

  const V = () => new THREE.Vector3();
  const _a = V(), _b = V(), _c = V();
  const poseAct = (dt, a) => {
    act.t += dt;
    const input = Math.abs(a.moveX || 0) + Math.abs(a.moveY || 0) > 0.1 || a.aim || a.fire || a.firePressed || a.jump || a.interact;
    if (input || act.t > act.dur || S.mode !== 'foot' || S.dead > 0) { end(); return; }
    const gp = game.gunPose; if (!gp || !gp.ok) return;
    // the camera looks on, drifting slowly round
    game.rig.yaw += dt * 0.06;
    const F = gp.frame(player.heading);
    const head = gp.head.getWorldPosition(_a);
    const mouth = _b.copy(head).addScaledVector(F.fw, 0.09).addScaledVector(F.up, -0.07);
    const rest = _c.copy(F.chest).addScaledVector(F.fw, 0.24).addScaledVector(F.up, -0.32).addScaledVector(F.right, 0.16);
    if (act.kind === 'smoke' || act.kind === 'coffee') {
      // a 6-second cycle: up to the mouth, a drag or a sip, down, a few seconds at rest
      const c = act.t % 6, up = c < 1 ? c : c < 2.2 ? 1 : c < 3 ? 1 - (c - 2.2) / 0.8 : 0;
      const k = up * up * (3 - 2 * up);
      const hand = rest.clone().lerp(mouth.clone().addScaledVector(F.right, 0.02).addScaledVector(F.up, act.kind === 'coffee' ? -0.06 : -0.03), k);
      gp.reach(gp.R, hand, F, 'R');
      const item = act.kind === 'smoke' ? cigarette() : cup();
      if (!item.parent) game.scene.add(item);
      // held at the hand: between the fingers, or by the handle
      const w = gp.R.wrist.getWorldPosition(V()), idx = gp.R.index.getWorldPosition(V());
      item.position.copy(idx).lerp(w, act.kind === 'smoke' ? -0.25 : 0.2);
      if (act.kind === 'smoke') { item.lookAt(item.position.clone().add(F.fw.clone().multiplyScalar(0.5).addScaledVector(F.right, -0.8))); item.rotateY(Math.PI / 2); }
      else { item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), F.up.clone().addScaledVector(F.fw, -k * 0.9).normalize()); item.position.addScaledVector(F.up, -0.02); }
      if (act.kind === 'smoke') {
        item.userData.ember.material.emissiveIntensity = c > 1 && c < 2.2 ? 4 : 1.2 + Math.sin(act.t * 3) * 0.3;
        if (c > 3.1 && c - dt <= 3.1) puff(mouth, F.fw); // breathe it out once the hand's down
      }
      gp.curl('R', act.kind === 'smoke' ? 'cup' : 'fore');
    } else if (act.kind === 'clean' && act.gun) {
      // the gun held out in front, the left hand working a rag along it
      if (!act.gunModel) act.gunModel = combat.model(act.gun);
      const g = act.gunModel; g.visible = true;
      const info = g.userData.hold;
      if (info) {
        gp.apply({ gun: g, info, state: 'inspect', inspect: 0.12 + Math.sin(act.t * 0.35) * 0.05, heading: player.heading, aimDir: F.fw, fp: false, eye: head });
        const len = info.len || 0.3, z = 0.05 + (0.5 + 0.5 * Math.sin(act.t * 3.2)) * len * 0.55;
        const at = g.localToWorld(new THREE.Vector3(0, 0.04, z));
        gp.reach(gp.L, at, F, 'L');
        const r = rag(); if (!r.parent) game.scene.add(r);
        gp.L.wrist.getWorldPosition(r.position).addScaledVector(F.up, -0.02); r.quaternion.copy(g.quaternion);
        gp.curl('R', 'pistol'); gp.curl('L', 'cup');
      }
    }
  };

  return {
    saveNow, why,
    update(dt, a) {
      clock += dt;
      if (S.dmgFlash > 0.05) hurtAt = clock;
      if ((S.gunKick || 0) > lastKick + 0.01 || police.wanted > 0) shotAt = clock;
      lastKick = S.gunKick || 0;
      S.safeSpot = !why();
      for (let i = puffs.length - 1; i >= 0; i--) {
        const s = puffs[i], u = s.userData; u.t += dt;
        if (u.t < 0) { s.visible = false; continue; }
        s.visible = true;
        s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(1 - dt * 0.6);
        s.scale.setScalar(0.06 + u.t * 0.22);
        s.material.opacity = 0.45 * (1 - u.t / u.life);
        if (u.t > u.life) { game.scene.remove(s); s.material.dispose(); puffs.splice(i, 1); }
      }
      if (act) poseAct(dt, a || {});
    },
  };
}
