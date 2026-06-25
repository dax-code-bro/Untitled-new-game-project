import * as THREE from "three";
import { PlayerState } from "./player";

export type ZombieType = "walker" | "runner" | "crawler" | "fat";

export interface Zombie {
  mesh: THREE.Group;
  health: number;
  maxHealth: number;
  type: ZombieType;
  speed: number;
  baseSpeed: number;
  isDead: boolean;
  deathTimer: number;
  aggroBoost: number;
  position: THREE.Vector3;
}

export interface ZombieSystem {
  zombies: Zombie[];
  wave: number;
  waveTimer: number;
  waveActive: boolean;
  zombiesRemaining: number;
  scene: THREE.Scene;
}

const TYPE_CONFIG: Record<ZombieType, { health: number; speed: number; color: number; scale: THREE.Vector3 }> = {
  walker:  { health: 150, speed: 1.2, color: 0x4a6b3a, scale: new THREE.Vector3(1, 1, 1) },
  runner:  { health: 60,  speed: 4.5, color: 0x6a4a3a, scale: new THREE.Vector3(0.85, 0.95, 0.85) },
  crawler: { health: 75,  speed: 0.6, color: 0x5a5a3a, scale: new THREE.Vector3(0.9, 0.5, 0.9) },
  fat:     { health: 300, speed: 0.8, color: 0x7a5a4a, scale: new THREE.Vector3(1.3, 1.1, 1.3) },
};

function buildZombieMesh(type: ZombieType): THREE.Group {
  const cfg = TYPE_CONFIG[type];
  const group = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.9 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x2a2a1a, roughness: 1.0 });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), clothMat);
  body.position.y = 0.9;
  group.add(body);

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skinMat);
  head.position.y = 1.42;
  group.add(head);

  // Arms
  const armGeo = new THREE.BoxGeometry(0.18, 0.55, 0.18);
  const leftArm = new THREE.Mesh(armGeo, skinMat);
  leftArm.position.set(-0.36, 0.85, 0);
  leftArm.rotation.z = type === "walker" ? 0.3 : 0.1;
  group.add(leftArm);
  const rightArm = new THREE.Mesh(armGeo, skinMat);
  rightArm.position.set(0.36, 0.85, 0);
  rightArm.rotation.z = type === "walker" ? -0.3 : -0.1;
  group.add(rightArm);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
  const leftLeg = new THREE.Mesh(legGeo, clothMat);
  leftLeg.position.set(-0.15, 0.33, 0);
  group.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, clothMat);
  rightLeg.position.set(0.15, 0.33, 0);
  group.add(rightLeg);

  // Crawler: flatten
  if (type === "crawler") {
    group.scale.set(1, 0.55, 1);
  }

  group.scale.multiply(cfg.scale);
  return group;
}

function spawnZombie(scene: THREE.Scene, playerPos: THREE.Vector3, wave: number): Zombie {
  const types: ZombieType[] = ["walker", "walker", "walker", "runner", "crawler", "fat"];
  const weights = [50, 20, 15, 15 + wave * 2, 10, 5 + wave];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let type: ZombieType = "walker";
  for (let i = 0; i < types.length; i++) {
    r -= weights[i];
    if (r <= 0) { type = types[i]; break; }
  }

  const cfg = TYPE_CONFIG[type];
  const mesh = buildZombieMesh(type);

  // Spawn around player at radius 25-35
  const angle = Math.random() * Math.PI * 2;
  const radius = 25 + Math.random() * 10;
  const pos = new THREE.Vector3(
    playerPos.x + Math.cos(angle) * radius,
    0,
    playerPos.z + Math.sin(angle) * radius
  );
  mesh.position.copy(pos);
  scene.add(mesh);

  const health = cfg.health + wave * 20;
  return {
    mesh,
    health,
    maxHealth: health,
    type,
    speed: cfg.speed,
    baseSpeed: cfg.speed,
    isDead: false,
    deathTimer: 0,
    aggroBoost: 0,
    position: pos,
  };
}

export function createZombieSystem(scene: THREE.Scene): ZombieSystem {
  return {
    zombies: [],
    wave: 1,
    waveTimer: 3,
    waveActive: false,
    zombiesRemaining: 0,
    scene,
  };
}

const _toPlayer = new THREE.Vector3();

export function updateZombies(zs: ZombieSystem, dt: number, player: PlayerState, _scene: THREE.Scene) {
  // Wave management
  if (!zs.waveActive) {
    zs.waveTimer -= dt;
    if (zs.waveTimer <= 0) {
      const count = 5 + zs.wave * 3;
      for (let i = 0; i < count; i++) {
        zs.zombies.push(spawnZombie(zs.scene, player.position, zs.wave));
      }
      zs.zombiesRemaining = count;
      zs.waveActive = true;
    }
  }

  const playerPos2D = new THREE.Vector2(player.position.x, player.position.z);

  for (let i = zs.zombies.length - 1; i >= 0; i--) {
    const z = zs.zombies[i];

    // Death handling
    if (z.health <= 0 && !z.isDead) {
      z.isDead = true;
      z.deathTimer = 2.5;
      z.mesh.rotation.x = Math.PI / 2;
      z.mesh.position.y = 0.1;
      zs.zombiesRemaining--;
    }

    if (z.isDead) {
      z.deathTimer -= dt;
      if (z.deathTimer <= 0) {
        zs.scene.remove(z.mesh);
        zs.zombies.splice(i, 1);
      }
      continue;
    }

    // Move toward player
    _toPlayer.set(
      player.position.x - z.mesh.position.x,
      0,
      player.position.z - z.mesh.position.z
    );
    const dist = _toPlayer.length();

    if (dist > 0.1) {
      _toPlayer.normalize();
      const spd = z.speed + z.aggroBoost;
      z.mesh.position.addScaledVector(_toPlayer, spd * dt);
      z.mesh.lookAt(player.position.x, z.mesh.position.y, player.position.z);
    }

    // Animate walk (bob)
    const t = Date.now() * 0.003 * z.speed;
    z.mesh.children[2]?.rotation && (z.mesh.children[2].rotation.x = Math.sin(t) * 0.3);
    z.mesh.children[3]?.rotation && (z.mesh.children[3].rotation.x = -Math.sin(t) * 0.3);
    z.mesh.children[4]?.rotation && (z.mesh.children[4].rotation.x = -Math.sin(t) * 0.4);
    z.mesh.children[5]?.rotation && (z.mesh.children[5].rotation.x = Math.sin(t) * 0.4);

    // Attack player
    const pos2D = new THREE.Vector2(z.mesh.position.x, z.mesh.position.z);
    if (pos2D.distanceTo(playerPos2D) < 1.2) {
      player.health -= 8 * dt;
      // Walker aggro on hit
      if (z.type === "walker") {
        z.aggroBoost = Math.min(1.5, z.aggroBoost + 0.3);
        setTimeout(() => { z.aggroBoost = 0; }, 3000);
      }
    }
  }

  // Wave complete check
  if (zs.waveActive && zs.zombiesRemaining <= 0 && zs.zombies.length === 0) {
    zs.waveActive = false;
    zs.wave++;
    zs.waveTimer = 8;
  }
}
