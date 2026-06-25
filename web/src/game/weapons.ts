import * as THREE from "three";
import { PlayerState } from "./player";
import { ZombieSystem } from "./zombies";

export interface WeaponDef {
  name: string;
  damage: number;
  magSize: number;
  reserveAmmo: number;
  fireRate: number;
  reloadTime: number;
  tacticalReloadTime: number;
  automatic: boolean;
}

export interface WeaponState {
  def: WeaponDef;
  ammoInMag: number;
  reserveAmmo: number;
  isReloading: boolean;
  reloadTimer: number;
  reloadTotal: number;
  isTactical: boolean;
  fireCooldown: number;
  mesh: THREE.Group;
  recoilOffset: THREE.Vector3;
  recoilRot: number;
}

export interface ShellCasing {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  lifetime: number;
  rotSpeed: THREE.Vector3;
}

export interface WeaponSystem {
  current: WeaponState;
  shellCasings: ShellCasing[];
  raycaster: THREE.Raycaster;
  muzzleFlash: THREE.Mesh;
  muzzleTimer: number;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  shoot: (player: PlayerState, zombieSystem: ZombieSystem) => void;
  startReload: () => void;
}

const WEAPONS: Record<string, WeaponDef> = {
  MP5: { name: "MP5", damage: 22, magSize: 30, reserveAmmo: 120, fireRate: 9, reloadTime: 2.4, tacticalReloadTime: 2.0, automatic: true },
  M1911: { name: "M1911", damage: 45, magSize: 8, reserveAmmo: 40, fireRate: 3, reloadTime: 1.8, tacticalReloadTime: 1.5, automatic: false },
  AK47: { name: "AK-47", damage: 35, magSize: 30, reserveAmmo: 120, fireRate: 6, reloadTime: 2.8, tacticalReloadTime: 2.4, automatic: true },
  M16: { name: "M16", damage: 28, magSize: 30, reserveAmmo: 120, fireRate: 5, reloadTime: 2.6, tacticalReloadTime: 2.2, automatic: false },
  DMR: { name: "DMR", damage: 70, magSize: 10, reserveAmmo: 50, fireRate: 1.5, reloadTime: 2.9, tacticalReloadTime: 2.5, automatic: false },
};

function buildGunMesh(): THREE.Group {
  const group = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.8 });

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.35), metalMat);
  group.add(receiver);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.28, 8), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.01, -0.31);
  group.add(barrel);

  const mag = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.12, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.5 })
  );
  mag.position.set(0, -0.09, 0.05);
  group.add(mag);

  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.07, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.9 })
  );
  stock.position.set(0, -0.01, 0.27);
  group.add(stock);

  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.02), metalMat);
  sight.position.set(0, 0.055, -0.05);
  group.add(sight);

  return group;
}

function spawnShell(ws: WeaponSystem) {
  const geo = new THREE.CylinderGeometry(0.005, 0.005, 0.02, 6);
  const mat = new THREE.MeshStandardMaterial({ color: 0xc8a000, metalness: 0.9, roughness: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);

  const ejPos = new THREE.Vector3(0.18, -0.08, -0.3);
  ejPos.applyQuaternion(ws.camera.quaternion);
  ejPos.add(ws.camera.position);
  mesh.position.copy(ejPos);

  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ws.camera.quaternion);
  const vel = right.clone().multiplyScalar(2 + Math.random() * 1.5);
  vel.y += 1.5 + Math.random();
  vel.z += (Math.random() - 0.5) * 0.5;

  ws.scene.add(mesh);
  ws.shellCasings.push({
    mesh,
    velocity: vel,
    lifetime: 4 + Math.random() * 3,
    rotSpeed: new THREE.Vector3(
      (Math.random() - 0.5) * 15,
      (Math.random() - 0.5) * 15,
      (Math.random() - 0.5) * 15
    ),
  });
}

export function createWeaponSystem(scene: THREE.Scene, camera: THREE.PerspectiveCamera): WeaponSystem {
  const def = WEAPONS.MP5;
  const mesh = buildGunMesh();
  mesh.position.set(0.12, -0.1, -0.35);
  camera.add(mesh);
  scene.add(camera);

  const flashGeo = new THREE.PlaneGeometry(0.15, 0.15);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
  muzzleFlash.position.set(0.12, -0.09, -0.55);
  camera.add(muzzleFlash);

  const ws: WeaponSystem = {
    current: {
      def,
      ammoInMag: def.magSize,
      reserveAmmo: def.reserveAmmo,
      isReloading: false,
      reloadTimer: 0,
      reloadTotal: 0,
      isTactical: false,
      fireCooldown: 0,
      mesh,
      recoilOffset: new THREE.Vector3(),
      recoilRot: 0,
    },
    shellCasings: [],
    raycaster: new THREE.Raycaster(),
    muzzleFlash,
    muzzleTimer: 0,
    scene,
    camera,
    shoot: null!,
    startReload: null!,
  };

  ws.shoot = (player: PlayerState, zombieSystem: ZombieSystem) => {
    const w = ws.current;
    if (w.isReloading || w.fireCooldown > 0 || w.ammoInMag <= 0) return;

    w.ammoInMag--;
    w.fireCooldown = 1 / w.def.fireRate;
    w.recoilOffset.z += 0.02;
    w.recoilOffset.y += 0.005;
    w.recoilRot -= 0.05;
    player.pitch = Math.max(-Math.PI / 2.5, player.pitch - 0.008);
    player.camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");

    ws.muzzleTimer = 0.05;
    (ws.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 1;

    spawnShell(ws);

    ws.raycaster.setFromCamera(new THREE.Vector2(0, 0), player.camera);
    const hits = ws.raycaster.intersectObjects(zombieSystem.zombies.map(z => z.mesh), true);
    if (hits.length > 0) {
      const hitMesh = hits[0].object;
      const zombie = zombieSystem.zombies.find(z => z.mesh === hitMesh || z.mesh.children.includes(hitMesh));
      if (zombie && zombie.health > 0) {
        zombie.health -= w.def.damage;
        player.points += 10;
        if (zombie.health <= 0) player.points += 100;
      }
    }
  };

  ws.startReload = () => {
    const w = ws.current;
    if (w.isReloading || w.ammoInMag === w.def.magSize || w.reserveAmmo === 0) return;
    w.isTactical = w.ammoInMag > 0;
    w.isReloading = true;
    w.reloadTotal = w.isTactical ? w.def.tacticalReloadTime : w.def.reloadTime;
    w.reloadTimer = w.reloadTotal;
  };

  return ws;
}

export function updateWeapon(ws: WeaponSystem, dt: number, _player: PlayerState) {
  const w = ws.current;

  if (w.fireCooldown > 0) w.fireCooldown -= dt;

  if (w.isReloading) {
    w.reloadTimer -= dt;
    // Dip gun down mid-reload
    const progress = 1 - w.reloadTimer / w.reloadTotal;
    const dip = Math.sin(progress * Math.PI) * 0.06;
    w.mesh.position.y = -0.1 - dip;

    if (w.reloadTimer <= 0) {
      const toAdd = w.isTactical
        ? Math.min(w.def.magSize - w.ammoInMag, w.reserveAmmo)
        : Math.min(w.def.magSize, w.reserveAmmo);
      w.ammoInMag = w.isTactical ? w.ammoInMag + toAdd : toAdd;
      w.reserveAmmo -= toAdd;
      w.isReloading = false;
      w.mesh.position.y = -0.1;
    }
  }

  // Recoil recovery
  w.recoilOffset.lerp(new THREE.Vector3(0, 0, 0), dt * 8);
  w.recoilRot += (0 - w.recoilRot) * dt * 8;
  if (!w.isReloading) {
    w.mesh.position.set(0.12 + w.recoilOffset.x, -0.1 + w.recoilOffset.y, -0.35 + w.recoilOffset.z);
  }
  w.mesh.rotation.x = w.recoilRot;

  // Muzzle flash fade
  if (ws.muzzleTimer > 0) {
    ws.muzzleTimer -= dt;
    (ws.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, ws.muzzleTimer / 0.05);
  }

  // Shell casing physics + despawn
  for (let i = ws.shellCasings.length - 1; i >= 0; i--) {
    const c = ws.shellCasings[i];
    c.lifetime -= dt;
    if (c.lifetime <= 0) {
      ws.scene.remove(c.mesh);
      c.mesh.geometry.dispose();
      (c.mesh.material as THREE.Material).dispose();
      ws.shellCasings.splice(i, 1);
      continue;
    }
    if (c.lifetime < 1) {
      (c.mesh.material as THREE.MeshStandardMaterial).opacity = c.lifetime;
      (c.mesh.material as THREE.MeshStandardMaterial).transparent = true;
    }
    c.velocity.y -= 9.8 * dt;
    c.mesh.position.addScaledVector(c.velocity, dt);
    c.mesh.rotation.x += c.rotSpeed.x * dt;
    c.mesh.rotation.y += c.rotSpeed.y * dt;
    if (c.mesh.position.y < 0.01) {
      c.mesh.position.y = 0.01;
      c.velocity.y = Math.abs(c.velocity.y) * 0.25;
      c.velocity.x *= 0.55;
      c.velocity.z *= 0.55;
    }
  }
}
