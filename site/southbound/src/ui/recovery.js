// Recovering instead of crashing:
//  - The graphics driver resets (Windows does this when one frame keeps the GPU busy for ~2 s, so
//    a preset far too heavy for the machine ends in a dead, frozen picture): save, say what
//    happened, and come back on a lighter preset. A second reset in one session goes lighter
//    still; a third stops and asks instead of reloading round and round
//  - A preset far too heavy for this machine: ask, plainly, before switching (with the game saved)
//  - A storm of script errors (the game is broken, not just slow): offer a reload, and show the
//    error so it can be reported
// Everything here is plain DOM on top of the game, so it shows even when WebGL is gone.
const ORDER = ['phone', 'low', 'medium', 'high', 'ultra', 'cinematic'];

export function installRecovery({ canvas, settings, saveSettings, PRESETS, save, pause, automated }) {
  let shown = null;
  const overlay = (title, text, buttons = [], note = '') => {
    if (shown) shown.remove();
    const el = document.createElement('div');
    el.id = 'sbrecover';
    el.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(8,10,12,0.72);font:15px Inter,system-ui,sans-serif;color:#eee';
    el.innerHTML = `<div style="max-width:520px;margin:16px;padding:22px 24px;border-radius:14px;background:#1c1f24;border:1px solid #3a3f47;box-shadow:0 10px 40px rgba(0,0,0,.5)">
      <div style="font-weight:700;font-size:19px;margin-bottom:10px">${title}</div>
      <div style="line-height:1.5;color:#cfd3d8">${text}</div>
      ${note ? `<pre style="margin:12px 0 0;padding:8px;border-radius:6px;background:#111;color:#e9a;font-size:11px;white-space:pre-wrap;max-height:120px;overflow:auto">${note.replace(/</g, '&lt;')}</pre>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">${buttons.map((b, i) => `<button data-i="${i}" style="padding:9px 16px;border-radius:9px;border:0;cursor:pointer;font:600 14px Inter,system-ui,sans-serif;${i === 0 ? 'background:#e0b04a;color:#1a1a1a' : 'background:#353a42;color:#eee'}">${b[0]}</button>`).join('')}</div></div>`;
    el.querySelectorAll('button').forEach((b) => { b.onclick = () => { const f = buttons[+b.dataset.i][1]; el.remove(); shown = null; f?.(); }; });
    document.body.appendChild(el); shown = el;
    return el;
  };
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const lighter = (p, steps = 1) => ORDER[Math.max(0, ORDER.indexOf(p) - steps)] === 'phone' && !/phone/.test(p) ? 'low' : ORDER[Math.max(0, ORDER.indexOf(p) - steps)];
  const safeSave = () => { try { save(); } catch (e) { /* the autosave has it */ } };

  // ---- the graphics driver gave up
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (automated) return;
    safeSave();
    const n = +(ss.get('sbCtxLost') || 0) + 1; ss.set('sbCtxLost', String(n));
    const was = settings.preset;
    if (n >= 3) {
      overlay('The graphics keep resetting', `Your graphics driver has reset ${n} times this session, even on ${PRESETS[was]?.label || was}. Your game is saved. Close other tabs and programs that use the graphics card, make sure your laptop is plugged in, then reload.`, [['Reload', () => location.reload()]]);
      return;
    }
    settings.preset = lighter(was, n); settings.dynamicRes = true; settings.resolution = 'native'; saveSettings(settings);
    overlay('The graphics driver reset', `Drawing a frame took your graphics chip so long that the driver restarted. Your game is saved. Coming back on ${PRESETS[settings.preset].label} graphics...`, [['Reload now', () => location.reload()]]);
    setTimeout(() => location.reload(), 4000);
  });

  // ---- far too heavy: ask before switching
  let asked = !!ss.get('sbAskedPreset');
  const offerLighter = (gpuName, to) => {
    if (asked || automated) return false;
    asked = true; ss.set('sbAskedPreset', '1');
    const was = PRESETS[settings.preset]?.label;
    pause?.(true);
    overlay(`${was} is too heavy for this computer`, `The game is running at under 4 frames a second on ${gpuName}. ${PRESETS[to].label} will run much better. Switching restarts the game; it's saved.`, [
      [`Switch to ${PRESETS[to].label}`, () => { safeSave(); settings.preset = to; settings.dynamicRes = true; settings.resolution = 'native'; saveSettings(settings); location.reload(); }],
      [`Keep ${was}`, () => pause?.(false)],
    ]);
    return true;
  };

  // ---- broken, not slow: errors every frame
  let errs = [], storm = false;
  const onErr = (msg) => {
    if (automated || storm) return;
    const now = performance.now(); errs = errs.filter((t) => now - t < 5000); errs.push(now);
    if (errs.length > 40) {
      storm = true; safeSave();
      const w = window.__sbWatch; // core/watch.js: already sent if the player lets Claude watch; otherwise one click sends it
      const told = w && w.on ? ' Claude has been sent this error.' : '';
      const btns = [['Reload', () => location.reload()], ['Keep playing', () => { storm = false; errs = []; }]];
      if (w && !w.on) btns.push(['Send to Claude', () => { w.sendError(); storm = false; errs = []; }]);
      overlay('Something went wrong', 'The game hit an error it can\'t get past. Your game is saved; reloading usually fixes it. If it keeps happening, send the message below.' + told, btns, String(msg).slice(0, 600));
    }
  };
  addEventListener('error', (e) => onErr(e.error?.stack || e.message));
  addEventListener('unhandledrejection', (e) => onErr(e.reason?.stack || e.reason));

  return { overlay, offerLighter };
}
