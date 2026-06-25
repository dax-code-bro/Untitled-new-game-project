import * as THREE from "three";
import { createPlayer, PlayerState, updatePlayer } from "./player";
import { createLevel } from "./level";
import { createHUD } from "./hud";
import { WeaponSystem, createWeaponSystem, updateWeapon } from "./weapons";
import { ZombieSystem, createZombieSystem, updateZombies } from "./zombies";

export function initGame(container: HTMLDivElement): () => void {
  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // Scene
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1a0a00, 10, 80);
  scene.background = new THREE.Color(0x0a0500);

  // Camera (FPS)
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 1.7, 0);

  // Player
  const player = createPlayer(camera, scene);

  // Level
  createLevel(scene);

  // Weapons
  const weaponSystem = createWeaponSystem(scene, camera);

  // Zombies
  const zombieSystem = createZombieSystem(scene);

  // HUD
  const hud = createHUD();
  container.appendChild(hud.element);

  // Pointer lock
  const canvas = renderer.domElement;
  canvas.addEventListener("click", () => {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  });

  // Input state
  const keys: Record<string, boolean> = {};
  const mouse = { x: 0, y: 0, buttons: 0 };

  const onKeyDown = (e: KeyboardEvent) => {
    keys[e.code] = true;
    // Prevent browser defaults for game keys
    if (["Space", "KeyR", "KeyC", "KeyV", "ControlLeft", "ShiftLeft"].includes(e.code)) {
      e.preventDefault();
    }
    // Reload
    if (e.code === "KeyR") weaponSystem.startReload();
    // Heavy jump trigger
    if (e.code === "KeyV" && player.state.isSprinting) {
      player.state.heavyJump = true;
    }
  };
  const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
  const onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement === canvas) {
      mouse.x = e.movementX;
      mouse.y = e.movementY;
    }
  };
  const onMouseDown = (e: MouseEvent) => {
    mouse.buttons = e.buttons;
    if (e.button === 0 && document.pointerLockElement === canvas) {
      weaponSystem.shoot(player.state, zombieSystem);
    }
  };
  const onMouseUp = (e: MouseEvent) => { mouse.buttons = e.buttons; };
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mouseup", onMouseUp);
  window.addEventListener("resize", onResize);

  // Game loop
  const clock = new THREE.Clock();
  let animId: number;

  function loop() {
    animId = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);

    // Look
    if (document.pointerLockElement === canvas) {
      player.look(mouse.x, mouse.y);
      mouse.x = 0;
      mouse.y = 0;
    }

    updatePlayer(player.state, keys, dt, scene);
    updateWeapon(weaponSystem, dt, player.state);
    updateZombies(zombieSystem, dt, player.state, scene);
    hud.update(weaponSystem, player.state, zombieSystem);

    renderer.render(scene, camera);
  }

  loop();

  return () => {
    cancelAnimationFrame(animId);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("resize", onResize);
    renderer.dispose();
    container.removeChild(renderer.domElement);
    container.removeChild(hud.element);
  };
}
