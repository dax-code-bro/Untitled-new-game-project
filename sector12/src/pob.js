// The POB (Printing Operations Base): a three-storey gantry 3D printer at the spawn.
// Four pillars, beams meeting in the middle, a hanging nozzle that prints your items in real time,
// a giant touchscreen, and a deposit crate for filament.
// Print jobs are timestamped (Date.now), so they keep printing even while you're away.
import * as THREE from 'three';
import { ITEMS, fmtDuration } from './data/catalog.js';
import { buildItemModel } from './viewmodel.js';
import { compactWeapon } from './weapons.js';
import { makeItem } from './inventory.js';

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
    const steel = new THREE.MeshStandardMaterial({ color: 0x5f666e, metalness: 0.6, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.4, roughness: 0.6 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xe0b020, metalness: 0.2, roughness: 0.6 });
    const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); return mesh; };
    const H = SIZE / 2;
    // pillars
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      add(new THREE.BoxGeometry(1, HEIGHT, 1), steel, sx * H, HEIGHT / 2, sz * H);
      add(new THREE.BoxGeometry(1.6, 0.4, 1.6), dark, sx * H, 0.2, sz * H);
      for (let y = 2.5; y < HEIGHT; y += 3.5) add(new THREE.BoxGeometry(1.08, 0.18, 1.08), yellow, sx * H, y, sz * H);
      physics.addBox([o.x + sx * H - 0.5, o.y, o.z + sz * H - 0.5], [o.x + sx * H + 0.5, o.y + HEIGHT, o.z + sz * H + 0.5]);
      // diagonal beam from the pillar top to the center hub
      const beamLen = Math.hypot(H, H);
      const beam = add(new THREE.BoxGeometry(0.45, 0.45, beamLen), steel, (sx * H) / 2, HEIGHT - 0.2, (sz * H) / 2);
      beam.rotation.y = Math.atan2(sx, sz);
    }
    // top frame
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(SIZE, 0.35, 0.35), dark, 0, HEIGHT - 0.2, s * H);
      add(new THREE.BoxGeometry(0.35, 0.35, SIZE), dark, s * H, HEIGHT - 0.2, 0);
    }
    add(new THREE.CylinderGeometry(0.9, 0.9, 0.7, 12), dark, 0, HEIGHT - 0.2, 0); // center hub
    // print bed
    add(new THREE.BoxGeometry(7.2, BED, 7.2), dark, 0, BED / 2, 0);
    const bedTop = add(new THREE.BoxGeometry(6.8, 0.04, 6.8), new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.7, roughness: 0.3 }), 0, BED + 0.02, 0);
    bedTop.receiveShadow = true;
    physics.addBox([o.x - 3.6, o.y, o.z - 3.6], [o.x + 3.6, o.y + BED, o.z + 3.6]);
    // rails + carriage + hanging nozzle
    this.railX = add(new THREE.BoxGeometry(SIZE - 1, 0.25, 0.3), steel, 0, HEIGHT - 0.75, 0);
    this.carriage = add(new THREE.BoxGeometry(0.8, 0.5, 0.8), yellow, 0, HEIGHT - 1.0, 0);
    this.cable = add(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), dark, 0, 0, 0);
    this.head = new THREE.Group();
    g.add(this.head);
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), yellow); hb.castShadow = true; this.head.add(hb);
    const nz = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10), dark); nz.rotation.x = Math.PI; nz.position.y = -0.62; this.head.add(nz);
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
    this.tip.position.y = -0.95; this.head.add(this.tip);
    this.glow = new THREE.PointLight(0xff8a2a, 0, 6, 2);
    this.glow.position.y = -1.0; this.head.add(this.glow);

    // touchscreen on the south side, facing outward (+z)
    const sx = 0, sz = H + 2.8;
    add(new THREE.BoxGeometry(0.25, 1.6, 0.25), dark, sx - 1.5, 0.8, sz);
    add(new THREE.BoxGeometry(0.25, 1.6, 0.25), dark, sx + 1.5, 0.8, sz);
    add(new THREE.BoxGeometry(3.6, 2.3, 0.18), dark, sx, 2.75, sz);
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 512; this.screenCanvas.height = 320;
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

    this.interact = [
      { type: 'terminal', pos: new THREE.Vector3(o.x + sx, o.y + 2.2, o.z + sz + 0.2), label: 'Use POB Terminal' },
      { type: 'deposit', pos: new THREE.Vector3(o.x + cx, o.y + 0.9, o.z + sz + 0.2), label: 'Deposit Filament' },
    ];
    this.spawn = new THREE.Vector3(o.x + 0.5, o.y, o.z + H + 8);
    this.drawScreen();
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
  update(dt) {
    this.t += dt;
    const now = Date.now();
    const q = this.save.queue;
    while (q.length && now >= q[0].end) {
      const job = q.shift();
      const item = makeItem(job.id);
      this.save.locker.push(item);
      this.hooks.onPrinted(item);
      this.hooks.persist();
    }
    const job = q[0] && now >= q[0].start ? q[0] : null;
    const H = SIZE / 2 - 1;
    let progress = 0;
    if (job) {
      progress = (now - job.start) / (job.end - job.start);
      if (this.displayJob !== job) this.setDisplay(job.id);
      // raster the nozzle over the part at the current layer height
      const lay = this.displaySize;
      const layerY = BED + 0.05 + lay.y * progress;
      const sweep = Math.sin(this.t * 3.1) * lay.x * 0.55, sweep2 = Math.sin(this.t * 1.7) * lay.z * 0.55;
      this.head.position.set(sweep, layerY + 1.0, sweep2);
      this.clip.constant = this.origin.y + layerY;
      this.glow.intensity = 3 + Math.sin(this.t * 40) * 0.8;
      this.tip.visible = true;
    } else {
      if (this.display && this.displayJob) { this.group.remove(this.display); this.display = null; this.displayJob = null; }
      this.head.position.set(Math.sin(this.t * 0.3) * 0.5, HEIGHT - 3.2, 0);
      this.glow.intensity = 0;
      this.tip.visible = false;
    }
    this.head.position.x = Math.max(-H, Math.min(H, this.head.position.x));
    this.carriage.position.set(this.head.position.x, HEIGHT - 1.0, this.head.position.z);
    this.railX.position.z = this.head.position.z;
    const top = HEIGHT - 1.25, bottom = this.head.position.y + 0.35;
    this.cable.scale.y = Math.max(0.01, top - bottom);
    this.cable.position.set(this.head.position.x, (top + bottom) / 2, this.head.position.z);
    this.screenT = (this.screenT || 0) - dt;
    if (this.screenT <= 0) { this.screenT = 0.5; this.drawScreen(job, progress); }
  }

  // the item model being printed, revealed layer by layer with a clipping plane
  setDisplay(id) {
    if (this.display) this.group.remove(this.display);
    const d = ITEMS[id];
    let m;
    if (d.shape) {
      m = compactWeapon(buildItemModel(d, null));
      m.rotation.y = Math.PI / 2;
      m.scale.setScalar(3.2);
    } else m = genericModel(d);
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    m.position.y = BED + 0.05 - box.min.y;
    // it's printed in filament: one shared PLA-like material, revealed layer by layer
    if (!this.printMat) this.printMat = new THREE.MeshStandardMaterial({ color: 0x8fa8a0, roughness: 0.5, metalness: 0, clippingPlanes: [this.clip], clipShadows: true, side: THREE.DoubleSide });
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.material = this.printMat;
      o.castShadow = true;
    });
    this.group.add(m);
    this.display = m;
    this.displaySize = size;
    this.displayJob = this.save.queue[0];
  }

  drawScreen(job = null, progress = 0) {
    const c = this.screenCanvas.getContext('2d');
    const W = c.canvas.width, Hh = c.canvas.height;
    c.fillStyle = '#071116'; c.fillRect(0, 0, W, Hh);
    c.strokeStyle = '#1e4a5a'; c.lineWidth = 4; c.strokeRect(6, 6, W - 12, Hh - 12);
    c.fillStyle = '#46ffb0'; c.font = 'bold 34px monospace'; c.fillText('POB  //  SECTOR 12', 26, 56);
    c.font = '24px monospace'; c.fillStyle = '#9fe8ff';
    c.fillText(`FILAMENT BANK: ${this.save.bank}`, 26, 104);
    if (job) {
      const d = ITEMS[job.id];
      c.fillStyle = '#ffd23f'; c.fillText(`PRINTING: ${d.name}`.slice(0, 32), 26, 150);
      c.fillStyle = '#1e3a44'; c.fillRect(26, 170, W - 52, 26);
      c.fillStyle = '#46ffb0'; c.fillRect(26, 170, (W - 52) * Math.min(1, progress), 26);
      c.fillStyle = '#9fe8ff'; c.fillText(`${Math.floor(progress * 100)}%  ·  ${fmtDuration((job.end - Date.now()) / 1000)} left`, 26, 228);
      c.fillText(`QUEUE: ${this.save.queue.length}  ·  LOCKER: ${this.save.locker.length}`, 26, 270);
    } else {
      c.fillStyle = '#6a8a94'; c.fillText('PRINTER IDLE', 26, 150);
      c.fillText(`LOCKER: ${this.save.locker.length} items`, 26, 190);
      c.fillStyle = '#46ffb0'; c.fillText('[E] TOUCH TO OPEN', 26, 270);
    }
    this.screenTex.needsUpdate = true;
  }

  dispose() { this.scene.remove(this.group); }
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
