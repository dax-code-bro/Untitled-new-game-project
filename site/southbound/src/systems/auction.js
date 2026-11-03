// The Calvera Property Auction: a hall downtown with columns out front. Every
// day from 9 to 7 the auctioneer sells foreclosed houses and seized vehicles.
// You bid against the room: other bidders with their own limits raise you
// until it's more than they'll pay. Going once, going twice, sold. Some lots
// have a reserve and pass if nobody reaches it. A good day is a bargain; a
// bidding war can cost you more than the list price at the realtor.
import * as THREE from 'three';
import { CITY } from '../world/layout.js';
import { nearestRoad, keyHint, money } from './world-util.js';
import { dressMember, placeAccessories } from './gang.js';
import { buildShop } from './gunstores.js';
import { Human } from '../entities/human.js';
import { VEHICLES } from '../assets/library.js';

const BIDDERS = ['Mr. Thibodeaux', 'Mrs. Landry', 'a man in a grey suit', 'Bayou Holdings LLC (on the phone)', 'Dr. Patel', 'the Hebert brothers', 'a flipper from Houston', 'Ms. Arceneaux', 'Pastor Guidry', 'a lady with a big hat'];
const CSS = `
#auction{position:fixed;inset:0;z-index:45;display:none;background:radial-gradient(ellipse at 70% 40%,rgba(40,34,28,.95),rgba(8,7,6,.97));color:#efe6d6;font:14px Inter,system-ui,sans-serif}
#auction.show{display:grid;grid-template-rows:auto 1fr}
#auction header{display:flex;align-items:center;gap:14px;padding:14px 22px 10px;border-bottom:1px solid rgba(255,255,255,.08)}
#auction h2{margin:0;font:400 28px Anton,Impact,sans-serif;letter-spacing:.05em;flex:1}
#auction h2 small{display:block;font:500 11px Inter,sans-serif;letter-spacing:.2em;color:#d8b46a;text-transform:uppercase;margin-top:2px}
#auction .money{font:400 24px Anton,Impact,sans-serif;color:#86e08f}
#auction button{background:rgba(255,255,255,.06);color:#efe6d6;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:9px 14px;font:600 13px Inter,sans-serif;cursor:pointer}
#auction button:disabled{opacity:.4;cursor:default}#auction button.go{background:#b8862e;border-color:#b8862e;color:#1a1208;font-size:15px}
#auction .body{display:grid;grid-template-columns:minmax(300px,40%) 1fr;min-height:0}
#auction .lots{overflow-y:auto;padding:12px 12px 20px 22px}
#auction .lot{padding:11px 12px;border-radius:10px;border:1px solid transparent;cursor:pointer;margin-bottom:4px}
#auction .lot:hover,#auction .lot.sel{background:rgba(255,255,255,.06);border-color:rgba(216,180,106,.45)}
#auction .lot b{display:block}#auction .lot small{color:#b8a892}#auction .lot .st{float:right;font:700 11px Inter;letter-spacing:.08em;text-transform:uppercase;color:#d8b46a}
#auction .floor{padding:18px 26px;overflow-y:auto;border-left:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:12px}
#auction .big{font:400 46px Anton,Impact,sans-serif;letter-spacing:.02em}
#auction .lead{font:600 15px Inter;color:#d8b46a}
#auction .log{flex:1;min-height:120px;overflow-y:auto;background:rgba(0,0,0,.25);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.6;color:#d8cfbf}
#auction .log .you{color:#86e08f}#auction .log .call{color:#f0c060;font-weight:700}
@media (max-width:760px){#auction .body{grid-template-columns:1fr;grid-template-rows:auto 1fr}}
`;

function decorateHall(g, { W, D, box, M, wood }) {
  const chair = M(0x5a3a22, 0.7), cloth = M(0x7a1d1d, 0.85);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const x = -3.2 + c * 1.6, z = -0.2 + r * 1.3;
    box(0.5, 0.06, 0.5, x, 0.46, z, chair, false); box(0.5, 0.5, 0.06, x, 0.72, z + 0.24, chair, false);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.04, 0.46, 0.04, x + a * 0.22, 0.23, z + b * 0.22, chair, false);
  }
  box(1.0, 1.15, 0.6, 1.8, 0.58, -D / 2 + 2.6, wood, false); // podium (the counter doubles as the clerk's desk)
  box(W - 1, 1.2, 0.04, 0, 2.6, -D / 2 + 0.2, cloth, false); // banner
  void W;
}

export function installAuction(game) {
  const { scene, graph, lib, interact, hud, career, player, S, sky } = game;
  const P = career.p;
  const st = { id: 'auction', name: 'Calvera Property Auction', keeper: 'Auctioneer Lionel Robichaux', blurb: 'Foreclosures & seized vehicles · daily 9 AM – 7 PM', style: 'civic', wall: 0xe6dfd0,
    signBg: '#f2ecdc', signFg: '#8a6a2a', signText: '#3a2a10', hours: 'Sales daily|9 AM – 7 PM', decorate: decorateHall,
    at: () => [[CITY.x0 + 3.5 * CITY.pitch, CITY.z0 + CITY.nz * CITY.pitch + 48], [CITY.x0 - 48, CITY.z0 + 2.5 * CITY.pitch], [CITY.x0 + CITY.nx * CITY.pitch + 48, CITY.z0 + 3.5 * CITY.pitch], [CITY.x0 + 1.5 * CITY.pitch, CITY.z0 - 42], [CITY.x0 + 5.5 * CITY.pitch, CITY.z0 - 42]],
    look: { id: 'lionel', base: 'mh_m3', skin: 'tan', suit: [0.15, 0.15, 0.2], hair: 'grey', h: 1.0, w: 1.05, acc: ['glasses'] } };
  let shop = null;
  for (const [ax, az] of st.at()) { const r = nearestRoad(graph, ax, az) || { x: ax, z: az, tx: 1, tz: 0 }; shop = buildShop(game, r, st); if (shop) break; }
  if (!shop) return { update() {} };
  const auctioneer = dressMember(lib, { ...st.look, name: st.keeper });
  auctioneer.root.position.copy(shop.keeper); auctioneer.root.rotation.y = shop.keeperFace; auctioneer.play('Idle_Talking_Loop', 0); scene.add(auctioneer.root);
  // a few people in the seats
  const crowd = [];
  for (let i = 0; i < 5; i++) {
    const h = new Human(lib, lib.peopleIds[(i * 3 + 1) % lib.peopleIds.length]);
    const lx = -3.2 + ((i * 2) % 5) * 1.6, lz = -0.2 + (i % 3) * 1.3;
    const p = new THREE.Vector3(lx, 0, lz).applyMatrix4(shop.g.matrixWorld);
    h.root.position.set(p.x, shop.y + 0.05, p.z); h.root.rotation.y = shop.keeperFace; h.play('Sitting_Idle_Loop', 0); scene.add(h.root); crowd.push(h);
  }
  game.auctionHouse = { name: st.name, x: shop.counter.x, z: shop.counter.z, face: shop.keeperFace };

  // ---------------- today's lots
  let lotsDay = -1, lots = [];
  const makeLots = () => {
    const day = sky.day; if (day === lotsDay) return;
    lotsDay = day;
    let s = day * 7919 + 13; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const props = (game.estate?.props || []).filter((p) => !P.properties.includes(p.id));
    const vehs = Object.keys(VEHICLES).filter((id) => VEHICLES[id].price && id !== 'rusty-pickup');
    lots = [];
    for (let i = 0; i < 4 && props.length; i++) {
      const p = props.splice((r() * props.length) | 0, 1)[0];
      lots.push({ kind: 'property', id: p.id, name: p.name, sub: `${p.type} · ${p.region} · foreclosure`, value: p.price, state: 'open' });
    }
    for (let i = 0; i < 2 && vehs.length; i++) {
      const id = vehs.splice((r() * vehs.length) | 0, 1)[0], v = VEHICLES[id];
      lots.push({ kind: 'vehicle', id, name: v.name, sub: 'Seized by the Calvera PD · sold as-is', value: v.price, state: 'open' });
    }
    for (const L of lots) {
      L.open = Math.round(L.value * (L.kind === 'vehicle' ? 0.35 : 0.5) / 500) * 500;
      L.reserve = L.value * (L.kind === 'vehicle' ? 0.45 : 0.65) * (0.9 + r() * 0.2);
      L.inc = L.value > 200000 ? 5000 : L.value > 60000 ? 2500 : L.value > 15000 ? 1000 : 250;
      L.bidders = Array.from({ length: 2 + ((r() * 3) | 0) }, () => ({ name: BIDDERS[(r() * BIDDERS.length) | 0], max: L.value * (0.55 + r() * 0.7) }));
    }
  };

  // ---------------- the floor
  const css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'auction';
  el.innerHTML = `<header><h2>${st.name.toUpperCase()}<small>${st.keeper} · Sales daily 9 AM – 7 PM</small></h2><span class="money"></span><button data-close>Leave</button></header><div class="body"><div class="lots"></div><div class="floor"></div></div>`;
  document.body.appendChild(el);
  let open = false, sel = 0, live = null;
  const close = () => { if (live && live.L.state === 'live') { live.L.state = 'open'; } live = null; open = false; el.classList.remove('show'); game.pause(false); };
  el.querySelector('[data-close]').onclick = close;
  addEventListener('keydown', (e) => { if (open && e.code === 'Escape') { e.stopPropagation(); close(); } }, true);
  const say = (html, cls = '') => { if (!live) return; live.log.push(`<div class="${cls}">${html}</div>`); };
  const render = () => {
    el.querySelector('.money').textContent = '$' + career.money.toLocaleString('en-US');
    el.querySelector('.lots').innerHTML = `<p style="color:#b8a892;margin:0 0 8px">Today's sale · day ${sky.day}</p>` + lots.map((L, i) => `<div class="lot ${i === sel ? 'sel' : ''}" data-i="${i}"><span class="st">${{ open: 'open', live: 'bidding', sold: 'sold', won: 'yours', passed: 'passed' }[L.state]}</span><b>${L.name}</b><small>${L.sub}<br>Estimate ${money(L.value)} · opens at ${money(L.open)}</small></div>`).join('');
    el.querySelectorAll('.lot').forEach((d) => { d.onclick = () => { if (live && live.L.state === 'live') return; sel = +d.dataset.i; live = null; render(); }; });
    const L = lots[sel], f = el.querySelector('.floor');
    if (!L) { f.innerHTML = '<p>No lots today.</p>'; return; }
    if (!live || live.L !== L) {
      f.innerHTML = `<div class="lead">LOT ${sel + 1} · ${L.kind === 'property' ? 'REAL ESTATE' : 'VEHICLE'}</div><div class="big">${L.name}</div><div>${L.sub}</div><div>Estimate <b>${money(L.value)}</b> · opening bid <b>${money(L.open)}</b>${L.kind === 'property' ? ' · reserve may apply' : ''}</div>
        <div>${L.state === 'open' ? '<button class="go" data-a="start">Start the bidding</button>' : L.state === 'won' ? '<b style="color:#86e08f">You won this lot.</b>' : `<b>${L.state === 'sold' ? `Sold to ${L.winner} for ${money(L.price)}` : 'Passed — the reserve was not met.'}</b>`}</div>`;
      f.querySelector('[data-a=start]')?.addEventListener('click', start);
      return;
    }
    const next = live.cur + L.inc;
    f.innerHTML = `<div class="lead">LOT ${sel + 1} · ${L.name}</div><div class="big">${money(live.cur)}</div><div class="lead">${live.leader ? (live.leader === 'You' ? 'You have the high bid' : `High bid: ${live.leader}`) : 'Waiting for an opening bid…'}</div>
      <div><button class="go" data-a="bid" ${L.state !== 'live' || live.leader === 'You' || career.money < (live.leader ? next : live.cur) ? 'disabled' : ''}>Bid ${money(live.leader ? next : live.cur)}</button> <span style="color:#b8a892">raise: ${money(L.inc)}</span></div>
      <div class="log">${live.log.slice(-40).join('')}</div>`;
    f.querySelector('[data-a=bid]')?.addEventListener('click', bid);
    const lg = f.querySelector('.log'); lg.scrollTop = lg.scrollHeight;
  };
  const start = () => {
    const L = lots[sel]; if (!L || L.state !== 'open') return;
    L.state = 'live'; live = { L, cur: L.open, leader: null, quiet: 0, t: 0, log: [] };
    say(`<span class="call">"Lot ${sel + 1}, ${L.name}. Who'll start me at ${money(L.open)}?"</span>`); render();
  };
  const bid = () => {
    if (!live || live.L.state !== 'live') return;
    const amt = live.leader ? live.cur + live.L.inc : live.cur;
    if (career.money < amt) { hud.toast('You can\'t cover that bid', 1.5); return; }
    live.cur = amt; live.leader = 'You'; live.quiet = 0; live.t = 0;
    say(`You bid <b>${money(amt)}</b>`, 'you'); render();
  };
  const tick = () => {
    const L = live.L;
    // the room
    const want = live.leader ? live.cur + L.inc : live.cur;
    const cands = L.bidders.filter((b) => b.name !== live.leader && b.max >= want);
    if (cands.length && Math.random() < 0.7) {
      const b = cands[(Math.random() * cands.length) | 0];
      live.cur = want; live.leader = b.name; live.quiet = 0;
      say(`${b.name} bids <b>${money(want)}</b>`);
      say(`<span class="call">"${money(want)}! Do I hear ${money(want + L.inc)}?"</span>`);
      return;
    }
    live.quiet++;
    if (!live.leader) { if (live.quiet >= 3) { L.state = 'passed'; say('<span class="call">"No takers. Lot passes."</span>'); } else say(`<span class="call">"Come on folks, ${money(live.cur)} to start…"</span>`); return; }
    if (live.quiet === 1) say(`<span class="call">"Going once at ${money(live.cur)}…"</span>`);
    else if (live.quiet === 2) say(`<span class="call">"Going twice…"</span>`);
    else {
      if (live.cur < L.reserve) { L.state = 'passed'; say(`<span class="call">"I'm sorry folks, that doesn't meet the reserve. Lot passes."</span>`); return; }
      L.price = live.cur; L.winner = live.leader;
      if (live.leader === 'You') {
        if (!career.spend(live.cur)) { L.state = 'passed'; say('Your payment bounced. Lot passes.'); return; }
        L.state = 'won';
        say(`<span class="call">"SOLD! To the gentleman in the back, ${money(live.cur)}."</span>`, 'you');
        if (L.kind === 'property') { P.properties.push(L.id); P.home = P.home || L.id; hud.bigMessage?.('YOU WON THE AUCTION', `${L.name} · ${money(live.cur)}`, 3); }
        else { P.garage.push({ uid: `a${Date.now() % 1e7}`, cat: 'car', type: L.id, up: {} }); hud.bigMessage?.('YOU WON THE AUCTION', `${L.name} is in your garage (phone)`, 3); }
        career.save();
      } else { L.state = 'sold'; say(`<span class="call">"SOLD to ${live.leader}, ${money(live.cur)}!"</span>`); }
    }
  };
  let last = 0;
  const loop = (t) => {
    if (!open) return;
    if (live && live.L.state === 'live') { live.t += (t - (last || t)) / 1000; if (live.t > 1.5) { live.t = 0; tick(); render(); } }
    last = t;
    requestAnimationFrame(loop);
  };
  const show = () => { makeLots(); open = true; el.classList.add('show'); game.pause(true); render(); last = 0; requestAnimationFrame(loop); };
  game.openAuction = show;

  interact.add({ x: shop.counter.x, z: shop.counter.z, r: 2.6, marker: false, y: shop.y,
    blip: { color: '#d8b46a', size: 6, global: true, icon: '🔨', badge: 'S' },
    show: () => S.mode === 'foot', label: () => `${keyHint(game)} talk to the auctioneer`,
    use: () => {
      const h = sky.hour;
      if (h < 9 || h >= 19) { game.openDialog(st.keeper, 'Sales run nine to seven, friend. Come back in the morning and bring your checkbook.', [['All right.', () => {}]]); return; }
      makeLots();
      game.openDialog(st.keeper, `Today we have ${lots.filter((l) => l.state === 'open').length} lots still to sell. Houses, a couple of cars the PD seized. You bidding?`, [
        ['I\'d like to bid.', show],
        ['What happens if I win?', () => game.openDialog(st.keeper, 'You pay on the spot. Houses are yours the second the hammer drops; cars go straight to your garage. And no, you can\'t back out.', [['Fair enough.', () => {}]])],
        ['Just watching.', () => {}],
      ]);
    } });
  return {
    update(dt) {
      const d = auctioneer.root.position.distanceTo(player.pos);
      const vis = d < 90;
      auctioneer.root.visible = vis; for (const h of crowd) h.root.visible = vis;
      if (!vis) return;
      auctioneer.update(dt); placeAccessories(auctioneer);
      for (const h of crowd) h.update(dt);
    },
  };
}
