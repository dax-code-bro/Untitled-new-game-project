// Owning property, batch one:
//  - Rent: houses and apartments you own but don't live in are let out; the rent comes in daily
//  - Tax and upkeep every day (from the bank if you have one, else cash); solar panels cut it
//  - The market moves: each kind of property drifts up and down a little every day. Sell anything
//    you own at the realtor for what it's worth today (less the agent's 6%)
//  - Burglaries: now and then someone breaks into a place of yours. Without an alarm you lose
//    something; with one, the police get there first
//  - Upgrades per property at the realtor: an alarm, solar panels, a renovation (+15% value and rent)
import { money } from './world-util.js';

const RENT = { House: 0.004, Apartment: 0.005, Penthouse: 0.0045 };
const UPS = {
  alarm: { name: 'Security alarm', cost: (p) => 800, sub: 'Burglars set it off and the police come. Nothing taken.' },
  solar: { name: 'Solar panels', cost: (p) => Math.round(1200 + p.price * 0.02), sub: 'Cuts the daily upkeep by two thirds.' },
  reno: { name: 'Renovation', cost: (p) => Math.round(p.price * 0.1), sub: 'Kitchen, bathroom, floors and paint: +15% value and rent.' },
};

export function installPropertyPlus(game) {
  const { career, hud, sky, S } = game;
  const E = game.estate;
  if (!E?.realtor) return { update() {} };
  const P = career.p, R = E.realtor, cfg = R.cfg;
  P.propUp = P.propUp || {}; P.market = P.market || {};
  const owned = (p) => P.properties.includes(p.id);
  const ups = (p) => P.propUp[p.id] || (P.propUp[p.id] = {});
  const idx = (type) => P.market[type] ?? 1;
  const worth = (p) => Math.round(p.price * idx(p.type) * (ups(p).reno ? 1.15 : 1));
  const pay = (n, what) => {
    if (P.bank >= n) { P.bank -= n; return 'bank'; }
    const cash = Math.min(S.money, n); S.money -= cash; return cash < n ? 'short' : 'cash';
  };

  // the realtor: an Owned tab with what each place is worth today, a Sell tab, an Upgrades tab
  const tabs0 = cfg.tabs;
  cfg.tabs = [...tabs0.filter((t) => t.k !== 'mine'), { k: 'mine', label: 'Owned' }, { k: 'sell', label: 'Sell' }, { k: 'ups', label: 'Upgrades' }];
  const items0 = cfg.items, row0 = cfg.row, act0 = cfg.act, note0 = cfg.note;
  cfg.note = (t) => t === 'sell' ? 'Sold at today\'s market value, less the agent\'s 6%.' : t === 'ups' ? 'Improvements for the places you own.' : t === 'mine' ? `Rent comes in daily from places you don't live in; tax and upkeep go out.` : note0(t);
  cfg.items = (t) => {
    if (t === 'sell') return E.props.filter((p) => owned(p) && P.home !== p.id);
    if (t === 'ups') return E.props.filter(owned).flatMap((p) => Object.keys(UPS).map((k) => ({ p, k })));
    return items0(t);
  };
  cfg.row = (it, t) => {
    if (t === 'sell') return { name: it.name, sub: `${it.type} · ${it.region} · market ${idx(it.type) >= 1 ? '+' : ''}${Math.round((idx(it.type) - 1) * 100)}%`, stats: [], btn: `Sell · ${money(Math.round(worth(it) * 0.94))}` };
    if (t === 'ups') { const U = UPS[it.k], has = ups(it.p)[it.k]; return { name: `${it.p.name}: ${U.name}`, sub: U.sub, stats: [], btn: has ? 'Installed' : money(U.cost(it.p)), cls: has ? 'own' : '' }; }
    const r = row0(it, t);
    if (t === 'mine' || owned(it)) {
      const rent = RENT[it.type] && P.home !== it.id ? Math.round(worth(it) * RENT[it.type] * (ups(it).reno ? 1.15 : 1)) : 0;
      r.sub += ` · worth ${money(worth(it))}${rent ? ` · rent ${money(rent)}/day` : ''}${ups(it).alarm ? ' · alarm' : ''}`;
    } else if (idx(it.type) !== 1) r.btn = `Mark · ${money(Math.round(it.price * idx(it.type)))}`;
    return r;
  };
  cfg.act = (it, t) => {
    if (t === 'sell') {
      const v = Math.round(worth(it) * 0.94);
      P.properties = P.properties.filter((id) => id !== it.id); delete P.propUp[it.id];
      career.earn(v, 'property sale'); hud.toast(`Sold ${it.name} for ${money(v)}`, 2.4); game.news?.(`${it.type} on ${it.name.split(',')[0]} changes hands.`);
      career.saveSoon(); return;
    }
    if (t === 'ups') { const U = UPS[it.k]; if (ups(it.p)[it.k]) return; if (career.spend(U.cost(it.p))) { ups(it.p)[it.k] = true; hud.toast(`${U.name} done at ${it.p.name}`, 2); career.saveSoon(); } return; }
    return act0(it, t);
  };

  // ---------------- the day's accounts
  let lastDay = sky.day;
  const settle = () => {
    // the market: every kind drifts a little, pulled back towards normal
    for (const type of new Set(E.props.map((p) => p.type))) { const m = idx(type); P.market[type] = Math.max(0.75, Math.min(1.35, m + (Math.random() - 0.5) * 0.04 + (1 - m) * 0.05)); }
    const mine = E.props.filter(owned);
    if (!mine.length) return;
    let rent = 0, tax = 0;
    for (const p of mine) {
      if (RENT[p.type] && P.home !== p.id) rent += Math.round(worth(p) * RENT[p.type] * (ups(p).reno ? 1.15 : 1));
      tax += Math.round(worth(p) * 0.0009 * (ups(p).solar ? 0.33 : 1));
    }
    if (rent > 0) { career.earn(rent, 'rent'); }
    const how = pay(tax, 'tax');
    game.text?.('Calvera County', `Daily property tax and upkeep: ${money(tax)}${how === 'bank' ? ' (paid from your bank)' : how === 'short' ? ' — you were short; pay it off soon' : ''}.${rent ? ` Rent received: ${money(rent)}.` : ''}`);
    // a break-in somewhere you own (not the place you're standing in)
    for (const p of mine) {
      if (Math.random() > 0.06 || (E.inside && E.inside.d === p.door)) continue;
      if (ups(p).alarm) { game.text?.('Bayou Security', `Alarm at ${p.name}. Police attended; nothing taken.`); continue; }
      const loss = Math.min(Math.round(150 + worth(p) * 0.004), 2500);
      pay(loss, 'burglary');
      game.text?.('Calvera PD', `Burglary reported at your property, ${p.name}. Estimated loss ${money(loss)}. An alarm would have helped.`);
      game.news?.(`Break-in on ${p.name.split(',')[0]}. Police ask neighbours to report anything suspicious.`);
      break;
    }
  };

  return {
    worth, ups, settle, upgrades: UPS,
    update() {
      if (sky.day !== lastDay) { lastDay = sky.day; settle(); career.saveSoon(); }
      return '';
    },
  };
}
