import * as THREE from "three";

export interface PlayerState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  health: number;
  maxHealth: number;
  points: number;
  isGrounded: boolean;
  isCrouching: boolean;
  isProne: boolean;
  isSprinting: boolean;
  isSliding: boolean;
  slideCooldown: number;
  slideTimer: number;
  slideDir: THREE.Vector3;
  heavyJump: boolean;
  heavyJumpLanding: boolean;
  getUpTimer: number;
  camera: THREE.PerspectiveCamera;
  cameraBob: number;
  cameraHeight: number;
  targetCameraHeight: number;
}

const STAND_HEIGHT = 1.7;
const CROUCH_HEIGHT = 1.0;
const PRONE_HEIGHT = 0.4;
const GRAVITY = -20;
const JUMP_FORCE = 7;
const HEAVY_JUMP_FORCE = 11;
const WALK_SPEED = 4;
const SPRINT_SPEED = 7;
const CROUCH_SPEED = 2;
const PRONE_SPEED = 1;
const SLIDE_SPEED = 9;
const SLIDE_DURATION = 0.6;
const MOUSE_SENS = 0.002;

export function createPlayer(camera: THREE.PerspectiveCamera, _scene: THREE.Scene) {
  const state: PlayerState = {
    position: new THREE.Vector3(0, STAND_HEIGHT, 0),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    health: 100,
    maxHealth: 100,
    points: 500,
    isGrounded: true,
    isCrouching: false,
    isProne: false,
    isSprinting: false,
    isSliding: false,
    slideCooldown: 0,
    slideTimer: 0,
    slideDir: new THREE.Vector3(),
    heavyJump: false,
    heavyJumpLanding: false,
    getUpTimer: 0,
    camera,
    cameraBob: 0,
    cameraHeight: STAND_HEIGHT,
    targetCameraHeight: STAND_HEIGHT,
  };

  function look(dx: number, dy: number) {
    state.yaw -= dx * MOUSE_SENS;
    state.pitch -= dy * MOUSE_SENS;
    state.pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, state.pitch));
    camera.rotation.set(state.pitch, state.yaw, 0, "YXZ");
  }

  return { state, look };
}

const _moveDir = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _flatForward = new THREE.Vector3();

export function updatePlayer(state: PlayerState, keys: Record<string, boolean>, dt: number, _scene: THREE.Scene) {
  const { camera } = state;

  // Timers
  if (state.slideCooldown > 0) state.slideCooldown -= dt;
  if (state.getUpTimer > 0) {
    state.getUpTimer -= dt;
    if (state.getUpTimer <= 0) {
      state.heavyJumpLanding = false;
      state.isProne = false;
    }
  }

  // Stance
  if (!state.isSliding && !state.heavyJumpLanding) {
    if (keys["ControlLeft"]) {
      state.isProne = true;
      state.isCrouching = false;
    } else if (keys["KeyC"]) {
      state.isCrouching = true;
      state.isProne = false;
    } else {
      state.isCrouching = false;
      state.isProne = false;
    }
  }

  // Target camera height
  if (state.isProne || state.heavyJumpLanding) {
    state.targetCameraHeight = PRONE_HEIGHT;
  } else if (state.isCrouching) {
    state.targetCameraHeight = CROUCH_HEIGHT;
  } else {
    state.targetCameraHeight = STAND_HEIGHT;
  }
  state.cameraHeight += (state.targetCameraHeight - state.cameraHeight) * Math.min(dt * 10, 1);

  // Movement
  const canMove = !state.heavyJumpLanding || state.getUpTimer <= 0;
  _forward.set(Math.sin(state.yaw), 0, Math.cos(state.yaw)).negate();
  _right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw)).negate();
  _flatForward.copy(_forward);

  let speed = WALK_SPEED;
  const moving = keys["KeyW"] || keys["KeyS"] || keys["KeyA"] || keys["KeyD"];

  state.isSprinting = keys["ShiftLeft"] && keys["KeyW"] && !state.isCrouching && !state.isProne && state.isGrounded;

  if (state.isCrouching) speed = CROUCH_SPEED;
  else if (state.isProne) speed = PRONE_SPEED;
  else if (state.isSprinting) speed = SPRINT_SPEED;

  // Slide initiation
  if (state.isSprinting && keys["KeyC"] && !state.isSliding && state.slideCooldown <= 0) {
    state.isSliding = true;
    state.slideTimer = SLIDE_DURATION;
    state.slideDir.copy(_flatForward);
    state.isCrouching = true;
  }

  // Heavy jump
  if (state.heavyJump && state.isGrounded && state.isSprinting) {
    state.velocity.y = HEAVY_JUMP_FORCE * 0.5;
    state.velocity.x = _flatForward.x * SPRINT_SPEED * 1.5;
    state.velocity.z = _flatForward.z * SPRINT_SPEED * 1.5;
    state.heavyJump = false;
    state.isGrounded = false;
  } else {
    state.heavyJump = false;
  }

  // Sliding update
  if (state.isSliding) {
    state.slideTimer -= dt;
    const t = state.slideTimer / SLIDE_DURATION;
    const slideSpeedNow = SLIDE_SPEED * t;
    state.velocity.x = state.slideDir.x * slideSpeedNow;
    state.velocity.z = state.slideDir.z * slideSpeedNow;
    if (state.slideTimer <= 0) {
      state.isSliding = false;
      state.slideCooldown = 0.8;
      state.isCrouching = true;
    }
  } else if (canMove && !state.heavyJumpLanding) {
    _moveDir.set(0, 0, 0);
    if (keys["KeyW"]) _moveDir.addScaledVector(_forward, 1);
    if (keys["KeyS"]) _moveDir.addScaledVector(_forward, -1);
    if (keys["KeyA"]) _moveDir.addScaledVector(_right, -1);
    if (keys["KeyD"]) _moveDir.addScaledVector(_right, 1);

    // Jump backwards
    if (keys["Space"] && keys["KeyS"] && state.isGrounded) {
      _moveDir.addScaledVector(_forward, -1);
      state.velocity.y = JUMP_FORCE * 0.85;
      state.isGrounded = false;
    } else if (keys["Space"] && state.isGrounded && !state.isCrouching && !state.isProne) {
      state.velocity.y = JUMP_FORCE;
      state.isGrounded = false;
    }

    if (_moveDir.lengthSq() > 0) _moveDir.normalize();
    state.velocity.x = _moveDir.x * speed;
    state.velocity.z = _moveDir.z * speed;
  }

  // Gravity
  if (!state.isGrounded) {
    state.velocity.y += GRAVITY * dt;
  }

  // Apply velocity
  state.position.addScaledVector(state.velocity, dt);

  // Floor collision (flat demo floor at y=0)
  if (state.position.y - state.cameraHeight < 0) {
    state.position.y = state.cameraHeight;

    // Heavy jump landing
    if (state.velocity.y < -8 && !state.isGrounded) {
      state.heavyJumpLanding = true;
      state.isProne = true;
      state.getUpTimer = 1.8;
    }

    state.velocity.y = 0;
    state.isGrounded = true;
  } else {
    state.isGrounded = false;
  }

  // Camera bob
  if (moving && state.isGrounded && !state.isProne) {
    const bobSpeed = state.isSprinting ? 14 : state.isCrouching ? 6 : 9;
    state.cameraBob += dt * bobSpeed;
    const bobAmt = state.isSprinting ? 0.06 : 0.03;
    camera.position.set(
      state.position.x + Math.sin(state.cameraBob) * bobAmt * 0.5,
      state.position.y + Math.sin(state.cameraBob * 0.5) * bobAmt,
      state.position.z
    );
  } else {
    state.cameraBob = 0;
    camera.position.set(state.position.x, state.position.y, state.position.z);
  }

  camera.rotation.set(state.pitch, state.yaw, 0, "YXZ");
}
