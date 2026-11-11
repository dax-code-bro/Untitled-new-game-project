// Look at your weapon (U, any time): what it is, what it does, what it takes and how much of that you
// carry. Ammo is kept by caliber (entities/combat.js): 500 rounds of a caliber, 50 rockets or grenades,
// 20 arrows; boxes at the gun store counter ("I need ammunition").
import { WEAPONS, CALIBERS, ammoCap, unitOf } from '../entities/arsenal.js';

export function installInspect(game) {
  const { combat } = game;
  const css = document.createElement('style');
  css.textContent = `#sb-inspect{position:fixed;left:50%;bottom:16%;transform:translateX(-50%);min-width:300px;max-width:min(92vw,440px);padding:14px 18px;border-radius:10px;
    background:rgba(16,14,12,.88);border:1px solid rgba(216,180,106,.45);color:#efe6d6;font:14px/1.45 system-ui,sans-serif;z-index:40;display:none;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.45)}
    #sb-inspect.show{display:block}#sb-inspect h4{margin:0 0 2px;font-size:17px;color:#f6e3b4}#sb-inspect .t{color:#b9a98f;font-size:12px;margin-bottom:6px}
    #sb-inspect .row{display:flex;justify-content:space-between;gap:12px}#sb-inspect .row b{color:#f6e3b4;font-weight:600}#sb-inspect .bar{height:5px;background:rgba(255,255,255,.12);border-radius:3px;margin:4px 0 8px}
    #sb-inspect .bar i{display:block;height:100%;background:#d8b46a;border-radius:3px}#sb-inspect p{margin:6px 0 0;color:#d6cab6;font-size:13px}#sb-inspect .k{color:#8f826e;font-size:11px;margin-top:8px}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'sb-inspect'; document.body.appendChild(el);
  let hideT = 0;
  const card = (id) => {
    const w = WEAPONS[id] || WEAPONS.fists;
    if (w.melee) return `<h4>${w.name}</h4><div class="t">${w.id === 'fists' ? 'Bare hands' : `${w.kind === 'blade' ? 'Blade' : 'Blunt'} · ${w.caliber || ''}`}</div><p>${w.desc || (w.id === 'fists' ? 'No ammunition. Cops won\'t open fire on bare hands.' : '')}</p><div class="row"><span>Ammunition</span><b>none needed</b></div><div class="k">U to close · H holsters</div>`;
    const cal = w.caliber, a = combat.ammo[id], have = combat.rounds[cal] || 0, cap = ammoCap(cal), B = CALIBERS[cal];
    return `<h4>${w.name}</h4><div class="t">${w.fireMode || ''} · ${w.cat}${w.scope ? ` · ${w.scope}x scope` : ''}</div>
      <div class="row"><span>Takes</span><b>${cal}</b></div>
      <div class="row"><span>Loaded</span><b>${a ? a.clip : 0} / ${w.clip}</b></div>
      <div class="row"><span>You carry</span><b>${have} / ${cap} ${unitOf(cal, have)}</b></div>
      <div class="bar"><i style="width:${Math.round(100 * have / cap)}%"></i></div>
      <div class="row"><span>Damage · range</span><b>${Math.round(w.damage * (w.pellets || 1))} · ${w.range} m</b></div>
      <p>${w.desc || ''}${B ? ` Boxes of ${B.box} at any gun store counter ($${B.price}).` : ''}</p>
      <div class="k">U to close</div>`;
  };
  const show = (id = combat.weapon) => { el.innerHTML = card(id); el.classList.add('show'); hideT = 8; };
  const hide = () => { el.classList.remove('show'); hideT = 0; };
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyU' || e.repeat || e.target.closest?.('input, textarea, select') || document.querySelector('.screen.show')) return;
    if (el.classList.contains('show')) hide(); else show();
  });
  return {
    show, hide, card,
    get open() { return el.classList.contains('show'); },
    update(dt) { if (hideT > 0 && (hideT -= dt) <= 0) hide(); else if (hideT > 0) el.innerHTML = card(combat.weapon); return ''; },
  };
}
