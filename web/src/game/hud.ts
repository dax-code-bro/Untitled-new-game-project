import { WeaponSystem } from "./weapons";
import { PlayerState } from "./player";
import { ZombieSystem } from "./zombies";

export interface HUD {
  element: HTMLDivElement;
  update: (ws: WeaponSystem, player: PlayerState, zs: ZombieSystem) => void;
}

export function createHUD(): HUD {
  const el = document.createElement("div");
  el.style.cssText = `
    position: fixed; inset: 0; pointer-events: none;
    font-family: 'Courier New', monospace; color: #fff;
    user-select: none;
  `;

  el.innerHTML = `
    <!-- Crosshair -->
    <div id="crosshair" style="
      position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
      width: 20px; height: 20px;
    ">
      <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:rgba(255,255,255,0.8);transform:translateY(-50%)"></div>
      <div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.8);transform:translateX(-50%)"></div>
      <div style="position:absolute;top:50%;left:50%;width:3px;height:3px;background:rgba(255,255,255,0.9);transform:translate(-50%,-50%);border-radius:50%"></div>
    </div>

    <!-- Ammo (bottom right) -->
    <div id="ammo" style="
      position: absolute; bottom: 40px; right: 40px;
      text-align: right; text-shadow: 0 0 8px rgba(0,0,0,0.9);
    ">
      <div id="ammo-mag" style="font-size: 48px; font-weight: bold; color: #fff; line-height:1"></div>
      <div id="ammo-reserve" style="font-size: 20px; color: #aaa; margin-top: 2px"></div>
      <div id="weapon-name" style="font-size: 14px; color: #ffcc44; margin-top: 4px; letter-spacing: 2px"></div>
      <div id="reload-bar-wrap" style="display:none; margin-top:8px;">
        <div style="font-size:11px; color:#ffcc44; letter-spacing:1px; margin-bottom:3px">RELOADING</div>
        <div style="width:120px; height:4px; background:rgba(255,255,255,0.2); border-radius:2px; margin-left:auto;">
          <div id="reload-bar" style="height:4px; background:#ffcc44; border-radius:2px; width:0%; transition:none"></div>
        </div>
      </div>
    </div>

    <!-- Health (bottom left) -->
    <div style="position:absolute; bottom:40px; left:40px;">
      <div style="font-size:12px; color:#aaa; letter-spacing:2px; margin-bottom:4px">HEALTH</div>
      <div style="width:180px; height:6px; background:rgba(255,255,255,0.15); border-radius:3px;">
        <div id="health-bar" style="height:6px; background:#e63; border-radius:3px; width:100%; transition:width 0.1s"></div>
      </div>
      <div id="health-val" style="font-size:28px; font-weight:bold; margin-top:4px; color:#fff"></div>
    </div>

    <!-- Points (top left) -->
    <div id="points" style="
      position:absolute; top:30px; left:40px;
      font-size:22px; color:#ffcc44;
      text-shadow: 0 0 12px rgba(255,200,0,0.6);
      letter-spacing:1px;
    "></div>

    <!-- Wave info (top center) -->
    <div id="wave-info" style="
      position:absolute; top:30px; left:50%; transform:translateX(-50%);
      font-size:16px; color:#fff; letter-spacing:3px; text-align:center;
      text-shadow: 0 0 10px rgba(0,0,0,0.8);
    "></div>

    <!-- Stance indicator (bottom center) -->
    <div id="stance" style="
      position:absolute; bottom:40px; left:50%; transform:translateX(-50%);
      font-size:11px; color:rgba(255,255,255,0.5); letter-spacing:2px;
    "></div>

    <!-- Controls hint (top right, fades after start) -->
    <div id="controls-hint" style="
      position:absolute; top:30px; right:40px;
      font-size:11px; color:rgba(255,255,255,0.4); text-align:right; line-height:1.6;
    ">
      WASD — Move<br>
      SHIFT — Sprint<br>
      SPACE — Jump<br>
      C — Crouch<br>
      CTRL — Prone<br>
      SHIFT+C — Slide<br>
      V (sprinting) — Heavy Jump<br>
      R — Reload<br>
      LMB — Shoot<br>
      <br>Click to lock mouse
    </div>

    <!-- Click to start overlay -->
    <div id="start-overlay" style="
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      background:rgba(0,0,0,0.7);
    ">
      <div style="text-align:center;">
        <div style="font-size:42px; font-weight:bold; color:#ffcc44; letter-spacing:4px; margin-bottom:16px">NO MAN'S LAND</div>
        <div style="font-size:16px; color:#aaa; letter-spacing:2px">Click to begin</div>
      </div>
    </div>
  `;

  let started = false;
  let hintsTimer = 20;

  document.addEventListener("pointerlockchange", () => {
    const overlay = el.querySelector("#start-overlay") as HTMLElement;
    if (document.pointerLockElement) {
      overlay.style.display = "none";
      started = true;
    } else {
      overlay.style.display = "flex";
    }
  });

  function update(ws: WeaponSystem, player: PlayerState, zs: ZombieSystem) {
    if (!started) return;

    const w = ws.current;

    // Ammo
    (el.querySelector("#ammo-mag") as HTMLElement).textContent = String(w.ammoInMag);
    (el.querySelector("#ammo-reserve") as HTMLElement).textContent = `/ ${w.reserveAmmo}`;
    (el.querySelector("#weapon-name") as HTMLElement).textContent = w.def.name;

    // Reload bar
    const reloadWrap = el.querySelector("#reload-bar-wrap") as HTMLElement;
    if (w.isReloading) {
      reloadWrap.style.display = "block";
      const pct = ((w.reloadTotal - w.reloadTimer) / w.reloadTotal) * 100;
      (el.querySelector("#reload-bar") as HTMLElement).style.width = `${pct}%`;
    } else {
      reloadWrap.style.display = "none";
    }

    // Health
    const hp = Math.max(0, Math.round(player.health));
    const hpPct = (hp / player.maxHealth) * 100;
    (el.querySelector("#health-bar") as HTMLElement).style.width = `${hpPct}%`;
    (el.querySelector("#health-bar") as HTMLElement).style.background = hp > 50 ? "#e63" : hp > 25 ? "#e93" : "#f00";
    (el.querySelector("#health-val") as HTMLElement).textContent = String(hp);

    // Points
    (el.querySelector("#points") as HTMLElement).textContent = `◆ ${player.points.toLocaleString()}`;

    // Wave
    const waveEl = el.querySelector("#wave-info") as HTMLElement;
    if (zs.waveActive) {
      waveEl.textContent = `WAVE ${zs.wave}  ·  ${zs.zombiesRemaining + zs.zombies.filter(z => !z.isDead).length} LEFT`;
    } else {
      waveEl.textContent = zs.waveTimer > 0
        ? `WAVE ${zs.wave} INCOMING IN ${Math.ceil(zs.waveTimer)}s`
        : "";
    }

    // Stance
    const stanceEl = el.querySelector("#stance") as HTMLElement;
    if (player.isProne || player.heavyJumpLanding) stanceEl.textContent = "PRONE";
    else if (player.isCrouching) stanceEl.textContent = "CROUCHING";
    else if (player.isSliding) stanceEl.textContent = "SLIDING";
    else if (player.isSprinting) stanceEl.textContent = "SPRINTING";
    else stanceEl.textContent = "";

    // Fade controls hint
    if (hintsTimer > 0) hintsTimer -= 0.016;
    else (el.querySelector("#controls-hint") as HTMLElement).style.display = "none";
  }

  return { element: el, update };
}
