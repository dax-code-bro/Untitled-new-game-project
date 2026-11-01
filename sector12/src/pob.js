// The POB (Printing Operations Base): a three-storey gantry 3D printer at the spawn.
// Four pillars, beams meeting in the middle, a hanging nozzle that prints your items in real time,
// a giant touchscreen, and a deposit crate for filament.
// Print jobs are timestamped (Date.now), so they keep printing even while you're away.
import * as THREE from 'three';
import { ITEMS, fmtDuration } from './data/catalog.js';
import { buildItemModel } from './viewmodel.js';
import { compactWeapon } from './weapons.js';
import { makeItem } from './inventory.js';
import { SHARED } from './materials.js';

const SIZE = 14;      // footprint (m)
const HEIGHT = 10.5;  // about three storeys
const BED = 0.7;      // print bed height

export class POB {
  constructor(scene, physics, poi, save, hooks) {
    this.scene = scene;
    this.save = save;
    this.hooks = hooks; // { onPrinted(item) }
    this.origin = new THREE.Vector3(poi.x, poi.h, poi.z);
    this.group = new THREE.Group();
    this.group.position.copy(this.origin);
    scene.add(this.group);
    this.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    this.display = null;
    this.displayJob = null;
    this.t = 0;
    this.build(physics);
  }

  build(physics) {
    const o = this.origin, g = this.group;
    const steel = new THREE.MeshStandardMaterial({ color: 0x6b737c, metalness: 0.75, roughness: 0.38 });
    const alu = new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 0.9, roughness: 0.28 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.4, roughness: 0.6 });
    const black = new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.2, roughness: 0.7 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xe0b020, metalness: 0.2, roughness: 0.55 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a046, metalness: 1, roughness: 0.25 });
    this.mats = { steel, alu, dark, black, yellow, brass };
    const add = (geo, m, x, y, z, p = g) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; p.add(mesh); return mesh; };
    const H = SIZE / 2;
    this.H = H;
    // ---- frame: pillars with hazard bands, base plates, cable trays, beacons on top
    const stripeTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#e0b020'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#16181a'; for (let i = -64; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i - 48, 64); x.lineTo(i - 64, 64); x.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 0.5); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const hazard = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 });
    this.beacons = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      add(new THREE.BoxGeometry(1, HEIGHT, 1), steel, sx * H, HEIGHT / 2, sz * H);
      add(new THREE.BoxGeometry(1.6, 0.4, 1.6), dark, sx * H, 0.2, sz * H);
      for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), alu, sx * H + dx, 0.46, sz * H + dz);
      for (let y = 2.5; y < HEIGHT; y += 3.5) add(new THREE.BoxGeometry(1.06, 0.45, 1.06), hazard, sx * H, y, sz * H);
      add(new THREE.BoxGeometry(0.16, HEIGHT - 1, 0.22), black, sx * (H - 0.6), (HEIGHT - 1) / 2 + 0.4, sz * H); // cable tray
      physics.addBox([o.x + sx * H - 0.5, o.y, o.z + sz * H - 0.5], [o.x + sx * H + 0.5, o.y + HEIGHT, o.z + sz * H + 0.5]);
      const bm = new THREE.MeshStandardMaterial({ color: 0x223322, emissive: 0x46ff8a, emissiveIntensity: 0.4, roughness: 0.3 });
      const bc = add(new THREE.CylinderGeometry(0.16, 0.18, 0.32, 14), bm, sx * H, HEIGHT + 0.16, sz * H);
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14), black, sx * H, HEIGHT + 0.01, sz * H);
      this.beacons.push(bc);
    }
    // top frame and corner gussets
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(SIZE, 0.45, 0.45), dark, 0, HEIGHT - 0.22, s * H);
      add(new THREE.BoxGeometry(0.45, 0.45, SIZE), dark, s * H, HEIGHT - 0.22, 0);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const gs = add(new THREE.BoxGeometry(0.12, 1.4, 1.4), steel, sx * (H - 0.35), HEIGHT - 0.9, sz * (H - 0.9));
      gs.rotation.x = sz * Math.PI / 4;
    }
    // ---- Y axis: two linear rails along Z, belts, motors
    const RX = H - 0.55, RY = HEIGHT - 0.62, RL = SIZE - 1.4;
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.34, 0.2, RL), alu, s * RX, RY, 0);
      add(new THREE.BoxGeometry(0.12, 0.08, RL), steel, s * RX, RY + 0.14, 0);
      add(new THREE.BoxGeometry(0.04, 0.06, RL - 0.4), black, s * (RX - 0.24), RY - 0.04, 0); // belt
      add(new THREE.BoxGeometry(0.45, 0.45, 0.45), black, s * RX, RY - 0.05, -RL / 2 - 0.1); // stepper
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.47, 0.03, 0.47), alu, s * RX, RY - 0.22 + i * 0.12, -RL / 2 - 0.1);
    }
    // ---- X gantry beam (moves along Z) with trucks on the rails
    this.gantry = new THREE.Group(); g.add(this.gantry);
    add(new THREE.BoxGeometry(2 * RX + 0.3, 0.42, 0.36), alu, 0, RY - 0.36, 0, this.gantry);
    add(new THREE.BoxGeometry(2 * RX - 0.6, 0.08, 0.16), steel, 0, RY - 0.12, 0.12, this.gantry); // X rail
    add(new THREE.BoxGeometry(2 * RX - 0.8, 0.05, 0.03), black, 0, RY - 0.36, 0.2, this.gantry); // X belt
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.5, 0.42, 0.7), yellow, s * RX, RY - 0.1, 0, this.gantry);
      add(new THREE.BoxGeometry(0.4, 0.4, 0.4), black, s * (RX - 0.55), RY - 0.36, -0.36, this.gantry);
    }
    // ---- carriage (moves along X on the gantry) and the telescoping Z column
    this.carriage = new THREE.Group(); this.gantry.add(this.carriage);
    add(new THREE.BoxGeometry(0.9, 0.7, 0.7), yellow, 0, RY - 0.55, 0.05, this.carriage);
    add(new THREE.BoxGeometry(0.42, 0.42, 0.42), black, 0.35, RY - 0.2, -0.38, this.carriage); // Z motor
    add(new THREE.BoxGeometry(0.32, 3.0, 0.32), alu, 0, RY - 2.4, 0.05, this.carriage); // outer Z tube
    this.zInner = add(new THREE.BoxGeometry(0.22, 1, 0.22), steel, 0, 0, 0.05, this.carriage);
    this.RY = RY; this.RX = RX;
    // ---- print head
    this.head = new THREE.Group(); this.carriage.add(this.head);
    add(new THREE.BoxGeometry(0.72, 0.5, 0.62), yellow, 0, 0.1, 0, this.head);
    add(new THREE.BoxGeometry(0.74, 0.1, 0.64), dark, 0, 0.38, 0, this.head);
    for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(0.02, 0.32, 0.5), alu, -0.32 + i * 0.08, -0.25, 0, this.head); // heat sink
    // part-cooling fan with spinning blades
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 20, 1, true), black, 0, 0.1, 0.34, this.head).rotation.x = Math.PI / 2;
    this.fan = new THREE.Group(); this.fan.position.set(0, 0.1, 0.35); this.head.add(this.fan);
    for (let i = 0; i < 7; i++) { const piv = new THREE.Group(); piv.rotation.z = (i / 7) * Math.PI * 2; this.fan.add(piv); add(new THREE.BoxGeometry(0.035, 0.17, 0.01), dark, 0, 0.085, 0, piv).rotation.y = 0.5; }
    // heater block, nozzle, LED ring
    this.heaterMat = new THREE.MeshStandardMaterial({ color: 0x8a2a1a, emissive: 0xff4a10, emissiveIntensity: 0, metalness: 0.6, roughness: 0.4 });
    add(new THREE.BoxGeometry(0.3, 0.18, 0.3), this.heaterMat, 0, -0.5, 0, this.head);
    add(new THREE.ConeGeometry(0.11, 0.24, 14), brass, 0, -0.71, 0, this.head).rotation.x = Math.PI;
    this.ledMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 0.2 });
    add(new THREE.TorusGeometry(0.33, 0.025, 6, 28), this.ledMat, 0, -0.18, 0, this.head).rotation.x = Math.PI / 2;
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false }));
    this.tip.position.y = -0.84; this.head.add(this.tip);
    this.strand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), new THREE.MeshBasicMaterial({ color: 0xff9a3a, toneMapped: false }));
    this.head.add(this.strand);
    this.glow = new THREE.PointLight(0xff8a2a, 0, 6, 2);
    this.glow.position.y = -0.9; this.head.add(this.glow);
    this.work = new THREE.SpotLight(0xf4f8ff, 0, 7, 0.7, 0.6, 1.5);
    this.work.position.set(0, -0.2, 0); this.work.target.position.set(0, -3, 0); this.head.add(this.work, this.work.target);
    // ---- filament spool on top + the feed tube down to the head
    this.spool = new THREE.Group(); this.spool.position.set(0, HEIGHT + 1.15, 0); g.add(this.spool);
    add(new THREE.BoxGeometry(0.2, 1.2, 0.2), steel, -1.1, HEIGHT + 0.6, 0);
    add(new THREE.BoxGeometry(0.2, 1.2, 0.2), steel, 1.1, HEIGHT + 0.6, 0);
    add(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 10), alu, 0, HEIGHT + 1.15, 0).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(1.0, 1.0, 0.06, 32), black, s * 0.42, 0, 0, this.spool).rotation.z = Math.PI / 2;
    this.filMat = new THREE.MeshStandardMaterial({ color: 0x8fa8a0, roughness: 0.45 });
    this.coil = add(new THREE.CylinderGeometry(0.85, 0.85, 0.78, 32), this.filMat, 0, 0, 0, this.spool); this.coil.rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 16), dark, 0, 0, 0, this.spool).rotation.z = Math.PI / 2;
    this.tubeMat = new THREE.MeshStandardMaterial({ color: 0xeef2f4, roughness: 0.3, transparent: true, opacity: 0.75 });
    this.tube = new THREE.Mesh(new THREE.BufferGeometry(), this.tubeMat); this.tube.castShadow = true; g.add(this.tube);
    // ---- print bed: heated PEI sheet with a grid, edge LEDs
    add(new THREE.BoxGeometry(7.2, BED, 7.2), dark, 0, BED / 2, 0);
    const pei = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
      const gr = x.createLinearGradient(0, 0, 512, 512); gr.addColorStop(0, '#b8893e'); gr.addColorStop(1, '#a87a34'); x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,230,180' : '90,60,20'},${Math.random() * 0.12})`; x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
      x.strokeStyle = 'rgba(60,40,10,0.35)'; x.lineWidth = 1; for (let i = 0; i <= 512; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
      x.fillStyle = 'rgba(40,25,5,0.35)'; x.font = 'bold 30px monospace'; x.fillText('POB // SECTOR 12', 20, 494);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
    this.bedMat = new THREE.MeshStandardMaterial({ map: pei, metalness: 0.3, roughness: 0.42, emissive: 0xff3000, emissiveIntensity: 0 });
    const bedTop = add(new THREE.BoxGeometry(6.8, 0.04, 6.8), this.bedMat, 0, BED + 0.02, 0);
    bedTop.receiveShadow = true;
    this.edgeMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x46ffb0, emissiveIntensity: 0.6 });
    for (const s of [-1, 1]) { add(new THREE.BoxGeometry(7.0, 0.04, 0.05), this.edgeMat, 0, BED - 0.1, s * 3.62); add(new THREE.BoxGeometry(0.05, 0.04, 7.0), this.edgeMat, s * 3.62, BED - 0.1, 0); }
    physics.addBox([o.x - 3.6, o.y, o.z - 3.6], [o.x + 3.6, o.y + BED, o.z + 3.6]);
    // purge line + skirt (drawn as the print starts)
    this.purge = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 0.03), this.filMat); this.purge.position.set(0, BED + 0.05, 3.2); this.purge.visible = false; g.add(this.purge);
    this.skirt = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x8fa8a0 })); this.skirt.visible = false; g.add(this.skirt);
    // ---- "ready" hologram over a finished print
    this.holoCanvas = document.createElement('canvas'); this.holoCanvas.width = 512; this.holoCanvas.height = 128;
    this.holoTex = new THREE.CanvasTexture(this.holoCanvas); this.holoTex.colorSpace = THREE.SRGBColorSpace;
    this.holo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.holoTex, transparent: true, depthWrite: false, toneMapped: false }));
    this.holo.scale.set(3.6, 0.9, 1); this.holo.visible = false; g.add(this.holo);
    this.hotClipTop = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    this.hotClipBottom = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.path = [];
    this.home = new THREE.Vector3(-3.0, 0, -3.0);
    this.gpos = new THREE.Vector3(-3.0, HEIGHT - 3.5, -3.0); // current head position (x, nozzle tip y, z)

    // touchscreen on the south side, facing outward (+z)
    const sx = 0, sz = H + 2.8;
    add(new THREE.BoxGeometry(0.25, 1.6, 0.25), dark, sx - 1.5, 0.8, sz);
    add(new THREE.BoxGeometry(0.25, 1.6, 0.25), dark, sx + 1.5, 0.8, sz);
    add(new THREE.BoxGeometry(3.6, 2.3, 0.18), dark, sx, 2.75, sz);
    // flagpole by the spawn with a cloth flag rippling in the wind
    add(new THREE.CylinderGeometry(0.06, 0.08, 11, 8), steel, -9, 5.5, H + 4);
    add(new THREE.SphereGeometry(0.12, 8, 6), yellow, -9, 11.05, H + 4);
    const fg = new THREE.PlaneGeometry(2.6, 1.6, 24, 10);
    fg.translate(1.3, 0, 0);
    const fc = document.createElement('canvas'); fc.width = 256; fc.height = 160;
    const fx = fc.getContext('2d');
    fx.fillStyle = '#16323a'; fx.fillRect(0, 0, 256, 160);
    fx.fillStyle = '#46ffb0'; fx.fillRect(0, 62, 256, 36);
    fx.fillStyle = '#e6efec'; fx.font = 'bold 54px monospace'; fx.textAlign = 'center'; fx.fillText('S12', 128, 50);
    const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
    const fm = new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.85 });
    const flagHook = (sh) => {
      sh.uniforms.uTime = SHARED.uTime; sh.uniforms.uWindStrength = SHARED.uWindStrength;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWindStrength;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float fk = position.x / 2.6;
          float amp = (0.12 + 0.1 * uWindStrength) * fk;
          transformed.z += sin(position.x * 2.6 - uTime * 7.0) * amp + sin(position.y * 3.0 + position.x * 1.7 - uTime * 4.3) * amp * 0.4;
          transformed.y -= fk * fk * 0.18 / (0.6 + uWindStrength);`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          objectNormal = normalize(vec3(-cos(position.x * 2.6 - uTime * 7.0) * 0.4 * (position.x / 2.6), 0.0, 1.0));`);
    };
    fm.userData.hooks = [flagHook]; fm.userData.cacheKey = 'flag'; fm.onBeforeCompile = flagHook; fm.customProgramCacheKey = () => 'flag';
    const flag = new THREE.Mesh(fg, fm); flag.position.set(-9 + 0.06, 10.1, H + 4); flag.castShadow = true;
    g.add(flag);
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 768; this.screenCanvas.height = 480;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.06), new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false }));
    screen.position.set(sx, 2.75, sz + 0.1);
    g.add(screen);
    physics.addBox([o.x + sx - 1.8, o.y, o.z + sz - 0.2], [o.x + sx + 1.8, o.y + 3.9, o.z + sz + 0.2]);
    // deposit crate next to the screen
    const cx = sx + 3.0;
    add(new THREE.BoxGeometry(1.2, 1.0, 1.0), yellow, cx, 0.5, sz);
    add(new THREE.BoxGeometry(0.8, 0.05, 0.12), new THREE.MeshBasicMaterial({ color: 0x46ff8a }), cx, 1.02, sz + 0.2);
    physics.addBox([o.x + cx - 0.6, o.y, o.z + sz - 0.5], [o.x + cx + 0.6, o.y + 1.0, o.z + sz + 0.5]);

    this.baseInteract = [
      { type: 'terminal', pos: new THREE.Vector3(o.x + sx, o.y + 2.2, o.z + sz + 0.2), label: 'Use POB Terminal' },
      { type: 'deposit', pos: new THREE.Vector3(o.x + cx, o.y + 0.9, o.z + sz + 0.2), label: 'Deposit Filament' },
    ];
    // finished prints wait on the front edge of the bed until you pick them up
    this.trayPoint = new THREE.Vector3(o.x, o.y + 1.0, o.z + 3.9);
    this.spawn = new THREE.Vector3(o.x + 0.5, o.y, o.z + H + 8);
    this.drawScreen();
  }

  // things you can interact with (the bed only while something finished is sitting on it)
  get interact() {
    const tray = this.save.tray || [];
    if (!tray.length) return this.baseInteract;
    const name = ITEMS[tray[0].id].name;
    return [...this.baseInteract, { type: 'pickup_print', pos: this.trayPoint, label: `Pick up ${name}${tray.length > 1 ? ` (+${tray.length - 1} more)` : ''}` }];
  }

  // take the next finished print off the bed and into the inventory; no room -> it goes to the locker
  takePrint(inv) {
    const tray = this.save.tray || [];
    const it = tray.shift();
    if (!it) return null;
    const ok = inv.add(it);
    if (!ok) this.save.locker.push(it);
    if (this.trayShown === it) { this.group.remove(this.display); this.display = null; this.trayShown = null; }
    this.hooks.persist();
    return { item: it, ok };
  }

  // ---------------------------------------------------------------- queue
  get bank() { return this.save.bank; }

  canPrint(id) {
    const d = ITEMS[id];
    if (this.save.bank < d.cost) return `Need ${d.cost} filament (bank: ${this.save.bank})`;
    if (d.cloth && (this.save.cloth || 0) < d.cloth) return `Needs ${d.cloth} cloth (have ${this.save.cloth || 0})`;
    if (this.save.queue.length >= 12) return 'Print queue is full (12)';
    return null;
  }

  enqueue(id) {
    const err = this.canPrint(id);
    if (err) return err;
    const d = ITEMS[id];
    this.save.bank -= d.cost;
    if (d.cloth) this.save.cloth -= d.cloth;
    const now = Date.now();
    const last = this.save.queue.length ? this.save.queue[this.save.queue.length - 1].end : now;
    const start = Math.max(now, last);
    this.save.queue.push({ id, start, end: start + d.time * 1000 * (this.save.speed || 1) });
    this.hooks.persist();
    return null;
  }

  cancel(i) {
    const job = this.save.queue[i];
    if (!job) return;
    const d = ITEMS[job.id];
    this.save.bank += d.cost; // full refund
    if (d.cloth) this.save.cloth += d.cloth;
    const q = this.save.queue;
    q.splice(i, 1);
    // jobs behind it move up (only q[0] can already be running, and it was just removed or is before i)
    let prev = i > 0 ? q[i - 1].end : Date.now();
    for (let k = i; k < q.length; k++) {
      const len = q[k].end - q[k].start;
      q[k].start = prev;
      q[k].end = prev + len;
      prev = q[k].end;
    }
    this.hooks.persist();
  }

  deposit(amount) {
    this.save.bank += amount;
    this.hooks.persist();
  }

  // ---------------------------------------------------------------- per frame
  // A job runs: heat up and home (first 3%), purge line and skirt, then layer after layer. Within a
  // layer the nozzle traces the outline, then fills it with a zigzag that alternates direction each
  // layer, the way a real slicer lays it down.
  update(dt) {
    this.t += dt;
    const now = Date.now();
    const q = this.save.queue;
    while (q.length && now >= q[0].end) {
      const job = q.shift();
      const item = makeItem(job.id);
      (this.save.tray = this.save.tray || []).push(item);
      this.hooks.onPrinted(item);
      this.hooks.persist();
    }
    const job = q[0] && now >= q[0].start ? q[0] : null;
    const tray = this.save.tray || [];
    let progress = 0, layer = 0, layers = 1, target = null, extruding = false;
    if (job) {
      progress = Math.min(1, (now - job.start) / (job.end - job.start));
      if (this.displayJob !== job) { this.setDisplay(job.id); this.trayShown = null; this.layerT = 0; }
      const lay = this.displaySize;
      const heat = Math.min(1, progress / 0.03);
      layers = Math.max(1, Math.round(lay.y / 0.06));
      if (progress < 0.03) {
        // homing to the corner, then the purge line along the front of the bed
        const k = progress / 0.03;
        if (k < 0.5) target = new THREE.Vector3(this.home.x, BED + 1.2, this.home.z);
        else { const u = (k - 0.5) * 2; target = new THREE.Vector3(-2.8 + u * 5.6, BED + 0.06, 3.2); extruding = true; this.purge.visible = true; this.purge.scale.x = Math.max(0.01, u * 5.6); this.purge.position.x = -2.8 + u * 2.8; }
        this.clip.constant = this.origin.y + BED + 0.04;
      } else {
        const pp = (progress - 0.03) / 0.97;
        layer = Math.min(layers - 1, Math.floor(pp * layers));
        const layerY = BED + 0.05 + lay.y * pp;
        this.clip.constant = this.origin.y + layerY;
        this.hotClipTop.constant = this.origin.y + layerY;
        this.hotClipBottom.constant = -(this.origin.y + layerY - 0.035);
        // walk the layer's toolpath at a steady speed
        if (layer !== this.curLayer) { this.curLayer = layer; this.pathS = 0; }
        const P = this.path[layer % 2];
        this.pathS = (this.pathS || 0) + dt * 1.4;
        target = pathPoint(P, this.pathS);
        target.y = layerY + 0.02;
        extruding = true;
        this.purge.visible = true;
        this.skirt.visible = true;
      }
      this.heaterMat.emissiveIntensity = heat * (1.6 + Math.sin(this.t * 9) * 0.15);
      this.bedMat.emissiveIntensity = heat * 0.06;
      this.edgeMat.emissive.setHex(0xffa020);
      this.holo.visible = false;
    } else {
      if (this.display && this.displayJob) { this.group.remove(this.display); if (this.hotDisplay) this.group.remove(this.hotDisplay); this.display = null; this.hotDisplay = null; this.displayJob = null; }
      if (tray.length && this.trayShown !== tray[0]) { this.setDisplay(tray[0].id); this.displayJob = null; this.trayShown = tray[0]; }
      if (!tray.length && this.trayShown) { if (this.display) this.group.remove(this.display); if (this.hotDisplay) this.group.remove(this.hotDisplay); this.display = null; this.hotDisplay = null; this.trayShown = null; }
      if (this.trayShown) this.clip.constant = this.origin.y + 1000;
      this.hotClipTop.constant = -1e6;
      // parked, slowly cooling
      target = new THREE.Vector3(this.home.x, HEIGHT - 3.4, this.home.z);
      this.heaterMat.emissiveIntensity *= Math.max(0, 1 - dt * 0.5);
      this.bedMat.emissiveIntensity *= Math.max(0, 1 - dt * 0.3);
      this.edgeMat.emissive.setHex(tray.length ? 0x46ff8a : 0x2a8aff);
      this.purge.visible = this.skirt.visible = false;
      // the "ready" hologram over a finished print
      this.holo.visible = !!this.trayShown;
      if (this.holo.visible) {
        if (this.holoFor !== this.trayShown) { this.holoFor = this.trayShown; this.drawHolo(ITEMS[this.trayShown.id].name, tray.length); }
        this.holo.position.set(0, BED + (this.displaySize ? this.displaySize.y : 1) + 1.0 + Math.sin(this.t * 1.6) * 0.08, 0);
        this.holo.material.opacity = 0.75 + Math.sin(this.t * 4) * 0.15;
      }
    }
    // ---- drive the axes towards the target (they accelerate and settle, not teleport)
    const gp = this.gpos;
    const sp = job ? 3.2 : 1.2;
    const lim = 3.2;
    target.x = Math.max(-lim, Math.min(lim, target.x)); target.z = Math.max(-lim, Math.min(lim, target.z));
    const d = target.clone().sub(gp), dl = d.length(), step = sp * dt;
    if (dl > step) gp.addScaledVector(d, step / dl); else gp.copy(target);
    this.gantry.position.z = gp.z;
    this.carriage.position.x = gp.x;
    const headY = gp.y + 0.84; // head origin sits above the nozzle tip
    this.head.position.y = headY;
    const zTop = this.RY - 3.9, zBot = headY + 0.4;
    this.zInner.scale.y = Math.max(0.01, zTop - zBot);
    this.zInner.position.y = (zTop + zBot) / 2;
    this.fan.rotation.z += dt * (job ? 40 : 4);
    this.ledMat.emissiveIntensity = job ? 1.4 : 0.15;
    this.work.intensity = job ? 6 : 0;
    // extruding: glowing tip and the molten strand down to the part
    this.tip.visible = this.strand.visible = extruding;
    this.glow.intensity = extruding ? 2.5 + Math.sin(this.t * 37) * 0.6 : 0;
    if (extruding) { this.strand.scale.y = 0.05; this.strand.position.y = -0.86 - 0.025; }
    // spool turns as filament feeds; the coil shrinks over the job
    if (job) { this.spool.rotation.x -= dt * 0.6; const left = 1 - progress * 0.55; this.coil.scale.set(left, 1, left); }
    // feed tube from the spool to the head, refreshed a few times a second
    this.tubeT = (this.tubeT || 0) - dt;
    if (this.tubeT <= 0) { this.tubeT = 0.12; this.updateTube(); }
    // beacons: amber pulse while printing, green when something is ready, dim blue idle
    const bc = job ? 0xffa020 : tray.length ? 0x46ff8a : 0x2a6aff;
    for (const b of this.beacons) { b.material.emissive.setHex(bc); b.material.emissiveIntensity = job ? 0.6 + 0.6 * Math.max(0, Math.sin(this.t * 6)) : tray.length ? 0.9 : 0.25; }
    // stepper whine near the printer
    this.humT = (this.humT || 0) - dt;
    if (job && this.humT <= 0 && this.hooks.hum) { this.humT = 0.18; this.hooks.hum(this.origin); }
    this.screenT = (this.screenT || 0) - dt;
    if (this.screenT <= 0) { this.screenT = 0.5; this.drawScreen(job, progress, layer, layers); }
  }

  updateTube() {
    const a = new THREE.Vector3(0, HEIGHT + 0.3, 0);
    const end = new THREE.Vector3(this.gpos.x, this.gpos.y + 1.3, this.gpos.z);
    const mid = new THREE.Vector3((a.x + end.x) / 2, HEIGHT + 0.6, (a.z + end.z) / 2);
    const curve = new THREE.CatmullRomCurve3([a, mid, new THREE.Vector3(end.x, this.RY - 0.6, end.z), end]);
    this.tube.geometry.dispose();
    this.tube.geometry = new THREE.TubeGeometry(curve, 28, 0.04, 6, false);
  }

  drawHolo(name, n) {
    const c = this.holoCanvas.getContext('2d');
    c.clearRect(0, 0, 512, 128);
    c.fillStyle = 'rgba(70,255,176,0.12)'; c.fillRect(0, 0, 512, 128);
    c.strokeStyle = 'rgba(70,255,176,0.9)'; c.lineWidth = 3; c.strokeRect(4, 4, 504, 120);
    c.fillStyle = '#46ffb0'; c.font = 'bold 26px monospace'; c.textAlign = 'center';
    c.fillText('PRINT READY', 256, 44);
    c.fillStyle = '#e6efec'; c.font = 'bold 34px monospace'; c.fillText(name.slice(0, 22), 256, 90);
    if (n > 1) { c.font = '18px monospace'; c.fillStyle = '#9fe8ff'; c.fillText(`+${n - 1} more on the bed`, 256, 116); }
    this.holoTex.needsUpdate = true;
  }

  // the item model being printed, revealed layer by layer with a clipping plane
  setDisplay(id) {
    if (this.display) this.group.remove(this.display);
    if (this.hotDisplay) this.group.remove(this.hotDisplay);
    const d = ITEMS[id];
    let m;
    if (d.shape) {
      m = compactWeapon(buildItemModel(d, null));
      m.rotation.y = Math.PI / 2;
      m.scale.setScalar(3.2);
    } else m = genericModel(d);
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    m.position.y = BED + 0.05 - box.min.y;
    m.position.x -= ctr.x; m.position.z -= ctr.z;
    // filament colour by what's being printed
    const col = d.cat === 'weapons' ? 0x3a4046 : d.cat === 'armor' ? 0x4a5a3a : d.cat === 'medical' ? 0xe8e8e8 : d.cat === 'ammo' ? 0xb08a3a : d.cat === 'buildings' ? 0x6a6a5a : 0x8fa8a0;
    if (!this.printMat) {
      this.printMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, clippingPlanes: [this.clip], clipShadows: true, side: THREE.DoubleSide });
      // FDM layer lines: a fine ridge every 2 mm of height
      const hook = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLay;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLay = (modelMatrix * vec4(transformed, 1.0)).y;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLay;').replace('#include <color_fragment>', '#include <color_fragment>\nfloat ll = 0.5 + 0.5 * sin(vLay * 3141.6);\ndiffuseColor.rgb *= 0.86 + 0.14 * ll;').replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.38, 0.7, ll);');
      };
      this.printMat.userData.hooks = [hook]; this.printMat.userData.cacheKey = 'fdm'; this.printMat.onBeforeCompile = hook; this.printMat.customProgramCacheKey = () => 'fdm';
      this.hotMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, clippingPlanes: [this.hotClipTop, this.hotClipBottom], side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    }
    this.printMat.color.setHex(col);
    this.filMat.color.setHex(col);
    this.skirt.material.color.setHex(col);
    m.traverse((o) => { if (o.isMesh) { o.material = this.printMat; o.castShadow = true; } });
    // the molten top layer: the same shape drawn glowing in a thin band at the nozzle height
    const hot = m.clone();
    hot.traverse((o) => { if (o.isMesh) { o.material = this.hotMat; o.castShadow = false; } });
    this.group.add(m, hot);
    this.display = m;
    this.hotDisplay = hot;
    this.displaySize = size;
    this.displayJob = this.save.queue[0];
    // toolpaths: outline then zigzag infill, alternating direction per layer
    const hx = Math.max(0.15, size.x / 2 * 0.92), hz = Math.max(0.15, size.z / 2 * 0.92);
    const outline = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [-hx, -hz]];
    const zig = (alongX) => { const pts = []; const n = Math.max(2, Math.round((alongX ? hz : hx) * 2 / 0.22)); for (let i = 0; i <= n; i++) { const u = -1 + (2 * i) / n; if (alongX) { const z = u * hz; pts.push(i % 2 ? [hx, z] : [-hx, z], i % 2 ? [-hx, z] : [hx, z]); } else { const x = u * hx; pts.push(i % 2 ? [x, hz] : [x, -hz], i % 2 ? [x, -hz] : [x, hz]); } } return pts; };
    this.path = [buildPath([...outline, ...zig(true)]), buildPath([...outline, ...zig(false)])];
    // skirt one line around the footprint
    const sk = [[-hx - 0.25, -hz - 0.25], [hx + 0.25, -hz - 0.25], [hx + 0.25, hz + 0.25], [-hx - 0.25, hz + 0.25]];
    this.skirt.geometry.dispose();
    this.skirt.geometry = new THREE.BufferGeometry().setFromPoints(sk.map(([x, z]) => new THREE.Vector3(x, BED + 0.05, z)));
  }

  drawScreen(job = null, progress = 0, layer = 0, layers = 1) {
    const c = this.screenCanvas.getContext('2d');
    const W = c.canvas.width, Hh = c.canvas.height;
    const g = c.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, '#08161c'); g.addColorStop(1, '#03090c');
    c.fillStyle = g; c.fillRect(0, 0, W, Hh);
    c.strokeStyle = '#1e4a5a'; c.lineWidth = 4; c.strokeRect(8, 8, W - 16, Hh - 16);
    c.fillStyle = '#46ffb0'; c.font = 'bold 40px monospace'; c.fillText('POB', 30, 62);
    c.fillStyle = '#6a9aa8'; c.font = '22px monospace'; c.fillText('PRINTING OPERATIONS BASE · SECTOR 12', 130, 60);
    c.fillStyle = '#1e4a5a'; c.fillRect(30, 80, W - 60, 2);
    c.font = '22px monospace'; c.fillStyle = '#9fe8ff';
    c.fillText(`FILAMENT BANK  ${this.save.bank}`, 30, 118);
    c.fillText(`CLOTH  ${this.save.cloth || 0}`, 380, 118);
    const tray = (this.save.tray || []).length;
    const noz = job ? 215 + Math.sin(this.t * 2.1) * 1.2 : 30 + Math.max(0, this.heaterMat.emissiveIntensity) * 100;
    const bed = job ? 60 + Math.sin(this.t * 0.9) * 0.4 : 24 + this.bedMat.emissiveIntensity * 600;
    if (job) {
      const d = ITEMS[job.id];
      c.fillStyle = '#ffd23f'; c.font = 'bold 30px monospace'; c.fillText(d.name.slice(0, 28), 30, 168);
      // progress ring
      const cx = W - 120, cy = 250, R = 78;
      c.lineWidth = 14; c.strokeStyle = '#123038'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = '#46ffb0'; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); c.stroke();
      c.fillStyle = '#e6efec'; c.font = 'bold 34px monospace'; c.textAlign = 'center'; c.fillText(`${Math.floor(progress * 100)}%`, cx, cy + 12); c.textAlign = 'left';
      c.font = '22px monospace'; c.fillStyle = '#9fe8ff';
      c.fillText(progress < 0.03 ? 'HEATING · HOMING · PURGE' : `LAYER ${layer + 1} / ${layers}`, 30, 210);
      c.fillText(`NOZZLE ${noz.toFixed(0)}°C   BED ${bed.toFixed(0)}°C`, 30, 245);
      c.fillText(`ETA ${fmtDuration((job.end - Date.now()) / 1000)}`, 30, 280);
      c.fillStyle = '#6a9aa8'; c.fillText(`QUEUE ${this.save.queue.length}  ·  ON BED ${tray}`, 30, 315);
      const next = this.save.queue.slice(1, 4).map((j) => ITEMS[j.id].name);
      c.font = '18px monospace'; next.forEach((n, i) => c.fillText(`NEXT ${i + 1}: ${n.slice(0, 30)}`, 30, 360 + i * 26));
    } else {
      c.fillStyle = tray ? '#46ff8a' : '#6a8a94'; c.font = 'bold 30px monospace';
      c.fillText(tray ? `READY ON THE BED: ${tray}` : 'PRINTER IDLE', 30, 178);
      c.font = '22px monospace'; c.fillStyle = '#9fe8ff';
      c.fillText(`NOZZLE ${noz.toFixed(0)}°C   BED ${bed.toFixed(0)}°C`, 30, 222);
      c.fillText(`LOCKER ${this.save.locker.length} items`, 30, 258);
      c.fillStyle = '#46ffb0'; c.font = 'bold 26px monospace'; c.fillText('[E] TOUCH TO OPEN', 30, 420);
    }
    this.screenTex.needsUpdate = true;
  }

  dispose() { this.scene.remove(this.group); }
}

// toolpath helpers: a polyline with cumulative lengths, sampled by distance (looping)
function buildPath(pts) {
  const P = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + P[i].distanceTo(P[i - 1]));
  return { P, L, total: L[L.length - 1] || 1 };
}
function pathPoint(path, s) {
  if (!path || !path.P.length) return new THREE.Vector3();
  s %= path.total;
  let i = 1;
  while (i < path.L.length - 1 && path.L[i] < s) i++;
  const a = path.P[i - 1], b = path.P[i], seg = path.L[i] - path.L[i - 1] || 1;
  return a.clone().lerp(b, (s - path.L[i - 1]) / seg);
}

// Simple display shapes for non-weapon items.
function genericModel(d) {
  const g = new THREE.Group();
  const m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  switch (d.cat) {
    case 'armor':
      if (d.wear === 'helmet') add(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m(0x3f4a3a), 0, 0, 0);
      else if (d.wear === 'pack') { add(new THREE.BoxGeometry(1.2, 1.6, 0.7), m(0x5a5a3e)); add(new THREE.BoxGeometry(1.0, 0.6, 0.3), m(0x4a4a32), 0, -0.3, 0.45); }
      else { add(new THREE.BoxGeometry(1.6, 1.9, 0.6), m(0x2f3528)); add(new THREE.BoxGeometry(1.4, 0.5, 0.65), m(0x1f251c), 0, -0.5, 0); }
      break;
    case 'ammo':
      for (let i = 0; i < 9; i++) add(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), m(0xc9a040), (i % 3 - 1) * 0.3, 0.4, (Math.floor(i / 3) - 1) * 0.3);
      break;
    case 'medical':
      add(new THREE.BoxGeometry(1.2, 0.6, 0.9), m(0xe8e8e8));
      add(new THREE.BoxGeometry(0.6, 0.62, 0.15), m(0xc02020), 0, 0, 0);
      add(new THREE.BoxGeometry(0.15, 0.62, 0.6), m(0xc02020), 0, 0, 0);
      break;
    case 'attachments':
      add(new THREE.CylinderGeometry(0.25, 0.25, 1.4, 12), m(0x1a1c1f)).rotation.z = Math.PI / 2;
      break;
    case 'gear':
      add(new THREE.BoxGeometry(1.6, 0.35, 1.2), m(d.camo === 'w' ? 0xc9ac78 : d.camo === 'n' ? 0xe0e6ec : d.camo ? 0x445a2e : d.cold > 20 ? 0x2a3a5a : 0xd8c49a));
      add(new THREE.BoxGeometry(1.4, 0.35, 1.0), m(0x6a6a6a), 0, 0.35, 0);
      break;
    case 'buildings':
      if (d.deploy === 'turret') { add(new THREE.CylinderGeometry(0.6, 0.8, 1.2, 10), m(0x3a3f45)); add(new THREE.BoxGeometry(0.5, 0.5, 1.6), m(0x24272b), 0, 0.9, -0.3); }
      else if (d.deploy === 'treestand') { add(new THREE.BoxGeometry(1.6, 0.15, 1.6), m(0x7a5a3a), 0, 1.6, 0); add(new THREE.BoxGeometry(0.15, 1.6, 0.15), m(0x4f3a26), 0.7, 0.8, 0.7); add(new THREE.BoxGeometry(0.15, 1.6, 0.15), m(0x4f3a26), -0.7, 0.8, -0.7); }
      else if (d.deploy === 'campfire') { for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.1, 0.1, 1, 6), m(0x5a4330), 0, 0.15, 0).rotation.set(Math.PI / 2, (i / 6) * Math.PI, 0); }
      else add(new THREE.BoxGeometry(2.4, 1.0, 0.6), m(d.deploy === 'sandbags' ? 0x9c8a62 : 0x7a5a3a), 0, 0.5, 0);
      break;
    case 'camo':
      add(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 14), m(d.skin)).rotation.z = Math.PI / 2;
      break;
    default:
      add(new THREE.BoxGeometry(0.8, 0.8, 0.8), m(0x888888));
  }
  return g;
}
