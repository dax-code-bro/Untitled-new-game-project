// Bundles the whole demo into ONE self-contained play-offline.html (double-click, no server).
// Uses the UMD (global THREE) build of three, and swaps the ES-module PointerLockControls
// for a tiny inline pointer-lock shim with the same API surface the game uses.
import fs from 'fs';

const threeSrc = fs.readFileSync('node_modules/three/build/three.min.js', 'utf8');
let game = fs.readFileSync('main.js', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');

// --- transform ES-module addons (GLTFLoader etc.) to plain scripts on global THREE ---
function addonToPlain(path) {
  let src = fs.readFileSync(path, 'utf8');
  // gather names imported from 'three' and destructure them off the global
  const m = src.match(/import\s*\{([\s\S]*?)\}\s*from\s*'three';/);
  const names = m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
  src = src.replace(/import\s*\{[\s\S]*?\}\s*from\s*'three';/g, '');
  src = src.replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/BufferGeometryUtils\.js';/g, '');
  src = src.replace(/export\s*\{[\s\S]*?\};?/g, '');
  src = src.replace(/^export\s+(function|class|const|let|var)/gm, '$1');
  return `(function(){\nconst { ${names.join(', ')} } = THREE;\n${src}\n` +
    `window.__ADDONS = window.__ADDONS || {};\nObject.assign(window.__ADDONS, __EXPORTS__);\n})();`;
}
let addons = '';
{
  let bgu = addonToPlain('vendor/BufferGeometryUtils.js')
    .replace('__EXPORTS__', '{ toTrianglesDrawMode }');
  let gltf = addonToPlain('vendor/GLTFLoader.js')
    .replace('__EXPORTS__', '{ GLTFLoader }')
    .replace('const { ', 'const { toTrianglesDrawMode } = window.__ADDONS; const { ');
  let skel = addonToPlain('vendor/SkeletonUtils.js')
    .replace('__EXPORTS__', '{ cloneSkeleton: clone }');
  let rgbe = addonToPlain('vendor/RGBELoader.js')
    .replace('__EXPORTS__', '{ RGBELoader }');
  addons = bgu + '\n' + gltf + '\n' + skel + '\n' + rgbe;
}
// the rigged body + scanned head + Molotov ride along as base64 so the single file is self-contained
const headB64 = fs.readFileSync('assets/head.glb').toString('base64');
const headColB64 = fs.readFileSync('assets/head-col.jpg').toString('base64');
const headNrmB64 = fs.readFileSync('assets/head-nrm.jpg').toString('base64');
const mollyB64 = fs.readFileSync('assets/molotov6.glb').toString('base64');

// --- transform game code: drop ES imports, use global THREE, replace controls ---
game = game
  .replace(/import \* as THREE from 'three';\n/, '')
  .replace(/import \{ PointerLockControls \} from 'three\/addons\/controls\/PointerLockControls\.js';\n/, '')
  .replace(/import \{ GLTFLoader \} from 'three\/addons\/loaders\/GLTFLoader\.js';\n/, 'const { GLTFLoader } = window.__ADDONS;\n')
  .replace(/import \{ clone as cloneSkeleton \} from 'three\/addons\/utils\/SkeletonUtils\.js';\n/, 'const { cloneSkeleton } = window.__ADDONS;\n')
  .replace(/import \{ RGBELoader \} from 'three\/addons\/loaders\/RGBELoader\.js';\n/, 'const { RGBELoader } = window.__ADDONS;\n')
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
const inlined = `<script>\n${threeSrc}\n</script>\n<script>\n${addons}\n</script>\n` +
  `<script>window.__HEAD_GLB_B64 = "${headB64}"; window.__HEAD_COL_B64 = "${headColB64}"; window.__HEAD_NRM_B64 = "${headNrmB64}"; window.__MOLLY_GLB_B64 = "${mollyB64}";</script>\n<script>\n${game}\n</script>`;
html = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, () => '')
  .replace(/<script type="module" src="\.\/main\.js"><\/script>/, () => inlined);

fs.writeFileSync('play-offline.html', html);
fs.writeFileSync('untitled-demo.html', html);   // cache-busting twin: fresh URL, same game
console.log('Wrote play-offline.html + untitled-demo.html (' + (fs.statSync('play-offline.html').size / 1024 | 0) + ' KB) — double-click to play.');
