// Small things.
//  - Safety catch: K (or tap the gun panel) flicks it on/off with a thumb
//    movement and a click; on safe, the trigger just clicks.
//  - Spent brass flies out of the ejection port, bounces and stays a while;
//    a wisp of smoke curls from the muzzle after each shot.
//  - Your hair and stubble grow day by day; barbers in Port Calvera and
//    Mill Creek tidy you up.
//  - Shoot out a shop window and it stays cracked until a repairman turns up
//    later that day with a ladder and fixes it.
//  - Burning wrecks in town bring a fire crew that puts the fire out.
import * as THREE from 'three';
import { Human } from '../entities/human.js';
import { CITY, TOWN, regionAt } from '../world/layout.js';
import { keyHint, roadPointAround } from './world-util.js';

export function installDetails(game) {
  const { scene, combat, player, hud, career, S, lib, collision, peds, interact } = game;
  const P = career.p;
  P.groom = P.groom || { hair: 0, beard: 0, day: game.sky.day };

  // ---------------- safety
  let safety = false, flick = 0;
  const toggleSafety = () => { if (!combat.drawn) return; safety = !safety; flick = 0.25; game.audio?.thud?.(0.08); hud.toast(safety ? 'Safety on' : 'Safety off', 0.9); };
  addEventListener('keydown', (e) => { if (e.code === 'KeyK' && !e.repeat) toggleSafety(); });
  document.getElementById('gunpanel')?.addEventListener('click', toggleSafety);
  document.getElementById('gunpanel')?.addEventListener('touchstart', (e) => { toggleSafety(); e.preventDefault(); }, { passive: false });
  if (document.getElementById('gunpanel')) document.getElementById('gunpanel').style.pointerEvents = 'auto';
  game.safetyOn = () => safety && combat.drawn;

  // ---------------- brass + muzzle smoke
  const MAXB = 70;
  const brassGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.022, 6).rotateX(Math.PI / 2);
  const brass = new THREE.InstancedMesh(brassGeo, new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3 }), MAXB);
  brass.count = 0; brass.frustumCulled = false; brass.userData.noHit = true; brass.userData.noReflect = true;
  scene.add(brass);
  const shells = []; let bi = 0;
  const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(220,220,220,0.55)'); g.addColorStop(1, 'rgba(220,220,220,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const puffs = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  game.onShotEffects = (gun, w) => {
    if (!gun || w.melee) return;
    const hold = gun.userData.hold || {};
    // muzzle smoke
    const mz = new THREE.Vector3().copy(gun.userData.muzzle || new THREE.Vector3()).applyMatrix4(gun.matrixWorld);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0.6 }));
    sp.position.copy(mz); sp.scale.setScalar(0.12); sp.userData.noHit = true; scene.add(sp);
    puffs.push({ sp, t: 0 });
    // brass (not from revolvers, bows, launchers or break-action shotguns)
    if (hold.revolver || w.cat === 'bow' || w.cat === 'launcher' || w.platform === 'double') return;
    const port = new THREE.Vector3(0, 0.03, (hold.len || 0.2) * 0.15).applyMatrix4(gun.matrixWorld);
    const right = new THREE.Vector3(-1, 0, 0).transformDirection(gun.matrixWorld);
    const s = shells[bi] || (shells[bi] = {});
    Object.assign(s, { p: port, v: right.multiplyScalar(2 + Math.random()).add(new THREE.Vector3(0, 2.2 + Math.random(), 0)), r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, 0), w: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0), rest: false, life: 40 });
    bi = (bi + 1) % MAXB; brass.count = Math.min(MAXB, Math.max(brass.count, bi === 0 ? MAXB : bi));
  };

  // ---------------- hair and facial hair
  // (painted on the skin by the outfit shader, entities/clothing.js: stubble that grows into a beard
  // over a week in the shape the barber left; buzzed or shaved hair hides the hair mesh; dye recolours
  // it. The styles are chosen in the barber's chair, systems/grooming.js)
  P.groom.style = P.groom.style || { beard: 'full', hair: 'short', dye: null };
  if (P.groom.style.hair === 'long') P.groom.style.hair = 'short'; // (an older style, dropped)
  const DYE = { black: 0x141110, brown: 0x4a3020, grey: 0x9a958e, blond: 0xc9a868, red: 0x7a3418 };
  const BEARDS = { full: 0, goatee: 1, moustache: 2, stubble: 3, clean: 4 };
  const applyGroom = () => {
    const st = P.groom.style, fit = game.outfitter;
    if (!fit?.setGroom) return;
    fit.setGroom({
      dens: Math.min(1, P.groom.beard / 7), style: BEARDS[st.beard] ?? 0,
      buzz: st.hair === 'buzz', shaved: st.hair === 'shaved', slick: st.hair === 'slicked',
      beardC: st.dye ? DYE[st.dye] : 0x2c1f16, dye: st.dye ? DYE[st.dye] : null,
    });
  };
  game.groom = { apply: () => applyGroom(), DYE };
  applyGroom();
  game.barbers = [[CITY.x0 + 2 * CITY.pitch + 14, CITY.z0 - 6, 'Slick\'s Barbershop'], [TOWN.x0 + TOWN.pitch + 10, TOWN.z0 + TOWN.nz * TOWN.pitch + 4, 'Mill Creek Barber']];
  for (const [x, z, name] of game.barbers) {
    const pole = new THREE.Group();
    const tex = (() => { const c = document.createElement('canvas'); c.width = 16; c.height = 64; const x2 = c.getContext('2d'); for (let i = 0; i < 8; i++) { x2.fillStyle = ['#c22', '#fff', '#23c', '#fff'][i % 4]; x2.fillRect(0, i * 8, 16, 8); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 16), new THREE.MeshStandardMaterial({ map: tex, emissive: 0x333333, emissiveMap: tex }));
    cyl.position.y = 1.9; pole.add(cyl);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.3 })); post.position.y = 0.75; pole.add(post);
    pole.position.set(x, collision.surface(x, z, 200), z);
    pole.userData.spin = tex;
    scene.add(pole);
    interact.add({ x, z, r: 2.2, marker: false, blip: { color: '#d84040', size: 4, global: true, icon: '✂️', badge: 'S' }, label: () => `${keyHint(game)} ${name}`,
      use: () => game.openDialog?.('Barber', P.groom.beard > 3 || P.groom.hair > 12 ? 'Lord, look at you. Sit down.' : 'Just a touch-up?', [
        ['Haircut · $25', () => { if (career.spend(25)) { P.groom.hair = 0; applyGroom(); hud.toast('Fresh cut', 2); } }],
        ['Shave · $15', () => { if (career.spend(15)) { P.groom.beard = 0; applyGroom(); hud.toast('Clean shaven', 2); } }],
        ['The works (cut + shave) · $35', () => { if (career.spend(35)) { P.groom.hair = 0; P.groom.beard = 0; applyGroom(); hud.toast('Looking sharp', 2); } }],
        ['Never mind.', () => {}],
      ]) });
    (game._poles = game._poles || []).push(tex);
  }

  // ---------------- cracked windows and the repairman
  const crackTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.strokeStyle = 'rgba(235,240,245,0.9)'; x.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) { x.beginPath(); x.moveTo(128, 128); let px = 128, py = 128; const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3; for (let k = 0; k < 6; k++) { px += Math.cos(a + (Math.random() - 0.5) * 0.6) * 22; py += Math.sin(a + (Math.random() - 0.5) * 0.6) * 22; x.lineTo(px, py); } x.stroke(); }
    for (let r = 20; r < 110; r += 26) { x.beginPath(); x.arc(128, 128, r + Math.random() * 8, 0, Math.PI * 2); x.globalAlpha = 0.5; x.stroke(); x.globalAlpha = 1; }
    x.fillStyle = 'rgba(20,20,20,0.9)'; x.beginPath(); x.arc(128, 128, 5, 0, Math.PI * 2); x.fill();
    return new THREE.CanvasTexture(c);
  })();
  const cracks = [];
  combat.onStaticHit = (hit) => {
    if (cracks.length > 40) return;
    // which wall face was hit? (nearest face of the building box)
    let box = null;
    collision.query(hit.point.x, hit.point.z, 1, (it) => { if (it.t === 0 && it.data && it.data.building && hit.point.x > it.minX - 0.3 && hit.point.x < it.maxX + 0.3 && hit.point.z > it.minZ - 0.3 && hit.point.z < it.maxZ + 0.3) box = it; });
    if (!box || hit.point.y - box.y0 > 6.5) return; // ground floor glass only
    const d = [[Math.abs(hit.point.x - box.minX), -1, 0], [Math.abs(hit.point.x - box.maxX), 1, 0], [Math.abs(hit.point.z - box.minZ), 0, -1], [Math.abs(hit.point.z - box.maxZ), 0, 1]].sort((a, b) => a[0] - b[0])[0];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshStandardMaterial({ map: crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.2 }));
    m.position.copy(hit.point).add(new THREE.Vector3(d[1] * 0.03, 0, d[2] * 0.03));
    m.lookAt(m.position.x + d[1], m.position.y, m.position.z + d[2]);
    m.userData.noHit = true; m.userData.noReflect = true;
    scene.add(m);
    cracks.push({ m, born: game.sky.day * 24 + game.sky.hour, fixAt: 4 + Math.random() * 10, n: { x: d[1], z: d[2] } });
  };
  let crew = null; // { h, ladder, crack, t }
  const startRepair = (c) => {
    const h = new Human(lib, lib.peopleIds[0]);
    h.root.position.set(c.m.position.x + c.n.x * 1.1, collision.surface(c.m.position.x + c.n.x * 1.1, c.m.position.z + c.n.z * 1.1, 300), c.m.position.z + c.n.z * 1.1);
    h.root.rotation.y = Math.atan2(-c.n.x, -c.n.z);
    h.play('Interact', 0.2);
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.06), new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.6, metalness: 0.4 }));
    ladder.position.set(c.m.position.x + c.n.x * 0.45, h.root.position.y + 1.3, c.m.position.z + c.n.z * 0.45); ladder.rotation.y = h.root.rotation.y; ladder.rotation.x = 0.12;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe6c020 }));
    h.root.add(cap); cap.position.set(0, 1.72, 0);
    scene.add(h.root, ladder);
    crew = { h, ladder, c, t: 0 };
  };

  // ---------------- fire crews for burning wrecks in town
  const fires = [];
  game.onWreckInTown = (v) => fires.push({ v, t: 0 });
  // ---------------- fire alarms: pull one inside any building
  let alarm = null;
  game.fireAlarm = (inside) => {
    if (alarm) { hud.toast('The alarm is already going', 1.5); return; }
    const d = inside.d, a = inside.it.alarm;
    a.pull.children[0].position.y = -0.06; // the handle stays down
    alarm = { t: 0, d, a, pos: new THREE.Vector3(d.x, collision.surface(d.x, d.z, 300), d.z) };
    hud.toast('FIRE ALARM — everybody out. The fire department is coming.', 3.5);
    peds.panic?.(alarm.pos, 40);
    // a false alarm is a crime if somebody saw you do it
    const r = regionAt(d.x, d.z);
    if ((r.sub === 'City' || r.sub === 'Town') && Math.random() < 0.55) setTimeout(() => { game.police?.crime('disturbance'); hud.toast('Someone saw you pull it. The police are coming.', 3); }, 6000);
    fires.push({ v: { pos: alarm.pos.clone(), group: new THREE.Group() }, t: 0, alarm: true });
  };
  const prevExploded = game.onCarExploded;
  game.onCarExploded = (v) => { prevExploded?.(v); const r = regionAt(v.pos.x, v.pos.z); if (r.sub === 'City' || r.sub === 'Town') fires.push({ v, t: 0 }); };

  return {
    update(dt) {
      // safety flick: a little roll of the wrist and gun
      if (flick > 0) { flick -= dt; const g = combat.gun; if (g && g.visible) { g.rotateZ(Math.sin((flick / 0.25) * Math.PI) * 0.25); g.updateMatrixWorld(true); } }
      const ap = document.getElementById('gunammo');
      if (ap && safety && combat.drawn && !ap.textContent.startsWith('SAFE')) ap.textContent = 'SAFE · ' + ap.textContent;
      // brass
      let n = 0;
      for (let i = 0; i < shells.length; i++) {
        const s = shells[i]; if (!s || !s.p) continue;
        if (!s.rest) {
          s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt); s.r.addScaledVector(s.w, dt);
          const g = collision.surface(s.p.x, s.p.z, s.p.y + 0.3) + 0.005;
          if (s.p.y < g) { s.p.y = g; if (Math.abs(s.v.y) > 1) { s.v.y *= -0.35; s.v.x *= 0.5; s.v.z *= 0.5; s.w.multiplyScalar(0.5); game.audio?.thud?.(0.02); } else { s.rest = true; s.r.x = Math.PI / 2; } }
        }
        if ((s.life -= dt) <= 0) { s.p = null; continue; }
        m4.compose(s.p, q.setFromEuler(e3.set(s.r.x, s.r.y, s.r.z)), one);
        brass.setMatrixAt(i, m4); n = Math.max(n, i + 1);
      }
      brass.count = n; brass.instanceMatrix.needsUpdate = true;
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i]; p.t += dt;
        p.sp.position.y += dt * 0.25; p.sp.scale.setScalar(0.12 + p.t * 0.5); p.sp.material.opacity = Math.max(0, 0.6 - p.t * 0.5);
        if (p.t > 1.2) { scene.remove(p.sp); p.sp.material.dispose(); puffs.splice(i, 1); }
      }
      // grooming: grows with each new day
      if (game.sky.day !== P.groom.day) { const dd = Math.max(0, game.sky.day - P.groom.day); P.groom.day = game.sky.day; P.groom.hair += dd; P.groom.beard += dd; applyGroom(); }
      for (const t of game._poles || []) t.offset.y += dt * 0.25;
      // repairs: once a crack is old enough, someone comes to fix it
      const now = game.sky.day * 24 + game.sky.hour;
      if (!crew) { const c = cracks.find((k) => now - k.born > k.fixAt); if (c) startRepair(c); }
      else {
        crew.t += dt; crew.h.update(dt);
        if (crew.h.locked <= 0) crew.h.play(crew.t % 6 < 3 ? 'Interact' : 'Idle_Loop', 0.3);
        if (crew.t > 60) { scene.remove(crew.c.m, crew.ladder, crew.h.root); cracks.splice(cracks.indexOf(crew.c), 1); crew = null; }
      }
      // the alarm: horn in the temporal-3 pattern, strobe flashing, for a minute and a half
      if (alarm) {
        alarm.t += dt;
        const ph = alarm.t % 4, on = ph < 2.6 && (ph % 1) < 0.55 ? 1 : 0;
        const inThere = S.indoors && S.indoors.d === alarm.d;
        const dist = inThere ? 0 : player.pos.distanceTo(alarm.pos);
        game.audio?.alarm?.(on * (inThere ? 1 : Math.max(0, 1 - dist / 60) * 0.5));
        const fl = (alarm.t % 1) < 0.08 ? 1 : 0;
        alarm.a.strobe.material.emissiveIntensity = fl * 6; alarm.a.flash.intensity = fl * 40;
        alarm.a.led.material.color.setHex(Math.floor(alarm.t * 4) % 2 ? 0xff2020 : 0x300000);
        if (alarm.t > 90) { game.audio?.alarm?.(0); alarm.a.strobe.material.emissiveIntensity = 0; alarm.a.flash.intensity = 0; alarm.a.pull.children[0].position.y = -0.02; alarm.a.led.material.color.setHex(0x30ff40); alarm = null; }
      }
      // fire crews
      for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i]; f.t += dt;
        if (f.t > 22 && !f.crew) {
          const r = roadPointAround(game.graph, f.v.pos.x, f.v.pos.z, 8, 25);
          if (r) {
            const t = new game.Vehicle(lib, 'firetruck'); t.pos.set(r.x, collision.surface(r.x, r.z, 300), r.z); t.heading = Math.atan2(f.v.pos.x - r.x, f.v.pos.z - r.z); t.siren = true; t.sync(0); scene.add(t.group);
            const men = [0, 1].map((k) => { const h = new Human(lib, lib.peopleIds[k % lib.peopleIds.length]); h.root.position.set(f.v.pos.x + (k ? 3 : -3), f.v.pos.y, f.v.pos.z + 2.5); h.root.rotation.y = Math.atan2(f.v.pos.x - h.root.position.x, f.v.pos.z - h.root.position.z); h.play('Interact', 0); scene.add(h.root); return h; });
            f.crew = { t, men };
            hud.toast('The fire department is on scene', 2);
          } else f.t = -1e9;
        }
        if (f.crew) { for (const h of f.crew.men) h.update(dt); if (f.t > 40 && !f.out) { f.out = true; f.v.group.traverse((o) => { if (o.material && o.material.blending === THREE.AdditiveBlending) o.visible = false; }); } }
        if (f.t > 95 && f.crew) { scene.remove(f.crew.t.group); for (const h of f.crew.men) scene.remove(h.root); fires.splice(i, 1); }
      }
    },
  };
}
