// Bundles the whole demo into ONE self-contained play-offline.html (double-click, no server).
// Uses the UMD (global THREE) build of three, and swaps the ES-module PointerLockControls
// for a tiny inline pointer-lock shim with the same API surface the game uses.
import fs from 'fs';

const threeSrc = fs.readFileSync('node_modules/three/build/three.min.js', 'utf8');
let game = fs.readFileSync('main.js', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');

// --- transform game code: drop ES imports, use global THREE, replace controls ---
game = game
  .replace(/import \* as THREE from 'three';\n/, '')
  .replace(/import \{ PointerLockControls \} from 'three\/addons\/controls\/PointerLockControls\.js';\n/, '')
  .replace(
    "const controls = new PointerLockControls(camera, renderer.domElement);",
    `// inline pointer-lock shim (same API the game uses: lock/addEventListener/getObject)
const controls = (function () {
  const listeners = { lock: [], unlock: [] };
  const el = renderer.domElement;
  let locked = false;
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= e.movementX * 0.002;
    euler.x -= e.movementY * 0.002;
    euler.x = Math.max(-1.5, Math.min(1.5, euler.x));
    camera.quaternion.setFromEuler(euler);
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === el;
    (locked ? listeners.lock : listeners.unlock).forEach((f) => f());
  });
  return {
    lock() { el.requestPointerLock(); },
    addEventListener(ev, fn) { if (listeners[ev]) listeners[ev].push(fn); },
    getObject() { return camera; },
  };
})();`
  );

// --- rebuild the html: strip importmap + module script, inline three + game ---
// NB: use FUNCTION replacements so `$` chars inside three.min.js / game code are NOT
// interpreted as special replacement patterns ($&, $', $1, ...).
const inlined = `<script>\n${threeSrc}\n</script>\n<script>\n${game}\n</script>`;
html = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, () => '')
  .replace(/<script type="module" src="\.\/main\.js"><\/script>/, () => inlined);

fs.writeFileSync('play-offline.html', html);
fs.writeFileSync('untitled-demo.html', html);   // cache-busting twin: fresh URL, same game
console.log('Wrote play-offline.html + untitled-demo.html (' + (fs.statSync('play-offline.html').size / 1024 | 0) + ' KB) — double-click to play.');
