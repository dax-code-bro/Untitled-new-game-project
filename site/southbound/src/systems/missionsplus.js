// Story missions, batch one (F11):
//  - A rating for every mission: gold, silver or bronze, from three things: inside the par time
//    (worked out from the mission's own steps), little damage taken, and no police on you that
//    the mission didn't ask for. Each one you manage is +10% pay; your best medal is kept.
//  - Checkpoints: fail partway through and you can retry from the step you were on (F, for 15 s)
//    instead of from the top. Fail the same mission twice and you get a hint for that step.
//  - Failing for a reason: you died, were arrested, the vehicle was wrecked.
//  - Contacts: when a mission is ready, its contact texts you about it; each one trusts you more
//    with every job (and more for gold); they have their own words when you finish.
//  - Acts: a title card when a new act begins, and the papers notice.
//  - The phone's Story tab: medals and trust on every mission, GPS to the next one, replay any
//    finished mission for a better medal (a quarter of the pay), abandon the one you're on.
//  - Gold milestones pay out (5, 15, 30 golds).
//  - Twelve side jobs from people around Calvera (yellow ? on the map), opening up as the
//    story goes on.
import { money, keyHint, roadPointAround } from './world-util.js';

const PAR = { goto: 90, drive: 100, deliver: 120, steal: 70, kill: 100, escape: 120, boat: 160, fly: 180, fish: 320, hunt: 320, talk: 6, pay: 3 };
const HINT = {
  escape: 'Losing the police: get out of their sight first (behind buildings, into alleys), then keep moving. They search where they last saw you.',
  kill: 'Take cover behind cars and walls and let them come to you. Body armor from an armory helps.',
  deliver: 'Drive it carefully: a wrecked vehicle fails the job. Stop inside the marker.',
  steal: 'Look for the marker on the vehicle itself. Get in before anyone else does.',
  fish: 'Fish bite better at dawn and dusk, and in the rain. A better rod helps with big ones.',
  hunt: 'Move slowly and keep downwind (the wind arrow shows near game).',
  survive: 'Keep moving and stay behind cover till the timer runs out.',
  boat: 'Boats are at the marinas (anchor icons on the map).',
  fly: 'Aircraft are at Redgrass Airfield. Fly low and slow through the marker.',
};
const DONE_LINES = {
  june: ['Danny would be proud of you, mijo.', 'Come home for supper sometime.'],
  lupe: ['Not a scratch. I knew I could trust you.', 'You drive like Danny did. Careful till you\'re not.'],
  mara: ['That\'s front page. Keep your head down.', 'The story writes itself when you\'re around.'],
  skeet: ['Smooth flying, partner.', 'You\'d make a fine duster pilot.'],
  voss: ['We\'re square. For now.', 'Don\'t make me regret this.'],
  otis: ['Bayou\'s quieter for it. Thank you.', 'Your brother would\'ve liked that.'],
  rios: ['You keep your word. That\'s rare here.', 'We\'ll be in touch.'],
};
// side jobs: [id, who, title, brief, steps, reward, needs story missions done]
const SIDE = [
  ['s1', 'Mrs. Hebert', 'The Lost Retriever', 'Her old retriever, Biscuit, ran off chasing deer into Pinewood Hollow. Find him before dark.', [['goto', 'forest'], ['survive', 20], ['goto', 'millcreek']], 450, 2],
  ['s2', 'Old Man Guidry', 'Grandpa\'s Skiff', 'His skiff slipped its rope and drifted out on the lake. Bring it back to the shore.', [['boat', 'lakemid'], ['boat', 'lakeshore']], 700, 4],
  ['s3', 'Rosalie Fontenot', 'Wedding Run', 'The groom\'s car died. Get the bride from Mill Creek to the church downtown.', [['drive', 'millcreek'], ['drive', 'downtown']], 650, 6],
  ['s4', 'Uncle Pierre', 'Crawfish Boil', 'The boil\'s tonight and he\'s short. Catch three fish and bring them out to the bayou.', [['fish', 3], ['drive', 'bayou']], 650, 8],
  ['s5', 'Delphine at the motel', 'Gator in the Pool', 'Something big crawled out of the bayou and won\'t leave the motel pool. Deal with it.', [['goto', 'bayou'], ['hunt', 1]], 800, 10],
  ['s6', 'Felix at Calvera Customs', 'Repo Man', 'A customer stopped paying for his sedan. It\'s parked on the east side. Bring it in.', [['steal', 'sedan_05', 'eastside'], ['deliver', 'customs']], 900, 12],
  ['s7', 'Professor Landry', 'Storm Chaser', 'He wants readings from the open plains, and a fast ride out and back.', [['drive', 'plainsfar'], ['survive', 30], ['drive', 'airfield']], 750, 14],
  ['s8', 'Earl at the bait shop', 'Night Fishing', 'Earl\'s got an order for the fish market and a bad back. Two fish from the lake.', [['drive', 'lake'], ['fish', 2]], 520, 16],
  ['s9', 'Marcel the collector', 'The Collector', 'A rare record turned up at a pawn shop. Front the money; he pays you back double.', [['pay', 500], ['goto', 'downtown']], 1500, 18],
  ['s10', 'The Broussard twins', 'Moving Day', 'Their moving van is stuck at the impound. Get it out and take it home to Mill Creek.', [['steal', 'delivery', 'impound'], ['deliver', 'millcreek']], 750, 20],
  ['s11', 'Skeeter\'s cousin Lou', 'Air Mail', 'Lou needs a parcel flown out to the far plains strip and back before the mail plane.', [['fly', 'plainsfar'], ['fly', 'airfield']], 1200, 24],
  ['s12', 'Big Earl at the Rusty Anchor', 'Closing Time', 'Two drunks are tearing up the bar and they\'ve got friends. Help Earl throw them out.', [['kill', 2, 'downtown']], 600, 28],
];

export function installMissionsPlus(game) {
  let api = null;
  return { get api() { return api; }, update(dt, a, free) { if (!api && game.missions && game.phoneSys?.phone) api = hook(game); return api ? api.update(dt, a, free) : ''; } };
}

function hook(game) {
  const { career, hud, S, player, sky, interact } = game;
  const MS = game.missions, P = career.p, M = MS.MISSIONS;
  P.medals = P.medals || {}; P.trust = P.trust || {}; P.failCount = P.failCount || {}; P.side = P.side || { done: [] }; P.goldPaid = P.goldPaid || 0;
  const RANK = { gold: 3, silver: 2, bronze: 1 };
  const medalIcon = (m) => m === 'gold' ? '🥇' : m === 'silver' ? '🥈' : m === 'bronze' ? '🥉' : '';
  const par = (m) => m.steps.reduce((s, st) => s + (st[0] === 'survive' ? st[1] + 10 : PAR[st[0]] || 60), 0);
  const contactOf = (m) => Object.keys(DONE_LINES).find((k) => m.who.toLowerCase().includes(k)) || m.who;

  // ---- tracking the run
  let track = null, retry = null;
  game.onMissionStart = (m, run, opts) => {
    track = { t0: performance.now(), hp0: player.health, minHp: player.health, police: false, checkpoint: opts.from || 0 };
    run.track = track;
  };
  game.missionRate = (m, run) => {
    const T = run.track || track || { t0: performance.now(), minHp: 100, hp0: 100 };
    const secs = (performance.now() - T.t0) / 1000;
    const okTime = secs <= par(m), okHurt = T.hp0 - T.minHp <= 25, okClean = !T.police;
    const n = (okTime ? 1 : 0) + (okHurt ? 1 : 0) + (okClean ? 1 : 0);
    const medal = n === 3 ? 'gold' : n === 2 ? 'silver' : 'bronze';
    const mult = (run.replay ? 0.25 : 1) * (1 + n * 0.1);
    if (!m.side && (!P.medals[m.id] || RANK[medal] > RANK[P.medals[m.id]])) P.medals[m.id] = medal;
    if (m.side && (!P.medals[m.id] || RANK[medal] > RANK[P.medals[m.id]])) P.medals[m.id] = medal;
    run.rating = { secs, okTime, okHurt, okClean };
    return { mult, medal: `${medalIcon(medal)} ${medal}${okTime ? ' · in time' : ''}${okHurt ? ' · unhurt' : ''}${okClean ? ' · clean' : ''}` };
  };
  game.onMissionComplete = (m, run, reward, rate) => {
    track = null; retry = null; P.failCount[m.id] = 0;
    const c = contactOf(m);
    P.trust[c] = (P.trust[c] || 0) + (P.medals[m.id] === 'gold' ? 2 : 1);
    const lines = DONE_LINES[c];
    if (lines && !m.side) setTimeout(() => MS.say(m.who, lines[(Math.random() * lines.length) | 0], 4), 3500);
    // a new act
    if (!m.side && !run.replay) {
      const i = M.indexOf(m), next = M[i + 1];
      if (next && next.act !== m.act) { setTimeout(() => hud.bigMessage(next.act.toUpperCase(), 'A new chapter', 4), 4500); game.news?.(`${next.act.split('·')[1]?.trim() || 'Trouble'} in Port Calvera: the harbor is on edge.`); }
      if (next) setTimeout(() => game.text?.(next.who, `${next.brief} (Story: "${next.title}")`), 9000);
      else setTimeout(() => { hud.bigMessage('SOUTHBOUND', 'The story is over. Calvera is still yours to live in.', 6); game.news?.('Harbor war ends: Port Calvera breathes again.'); }, 5000);
    }
    // gold milestones
    const golds = Object.values(P.medals).filter((x) => x === 'gold').length;
    for (const [n, pay] of [[5, 1000], [15, 3000], [30, 8000]]) if (golds >= n && P.goldPaid < n) { P.goldPaid = n; career.earn(pay, 'gold medals'); hud.toast(`${n} gold medals: +${money(pay)}`, 3); }
    career.saveSoon();
  };
  game.onMissionFail = (m, why, run) => {
    track = null;
    P.failCount[m.id] = (P.failCount[m.id] || 0) + 1;
    // retry from the checkpoint: the step you were on (back to the theft if the delivery failed)
    let from = Math.max(0, run.step);
    if (m.steps[from]?.[0] === 'deliver') { const st = m.steps.slice(0, from).map((s) => s[0]).lastIndexOf('steal'); if (st >= 0) from = st; }
    if (m.steps[from]?.[0] === 'pay') from = 0;
    retry = { m, from, until: performance.now() + 15000, replay: run.replay };
    const kind = m.steps[Math.max(0, run.step)]?.[0];
    if (P.failCount[m.id] >= 2 && HINT[kind]) setTimeout(() => hud.toast(`Hint: ${HINT[kind]}`, 6), 3200);
  };

  // ---- side jobs: their own people on the map
  const sideMissions = SIDE.map(([id, who, title, brief, steps, reward, need]) => ({ id, who, title, brief, steps, reward, need, side: true, act: 'Side job' }));
  for (const sm of sideMissions) {
    const first = sm.steps.find((s) => !['talk', 'pay', 'survive', 'fish', 'hunt', 'escape'].includes(s[0]));
    const key = (first && (typeof first[2] === 'string' ? first[2] : first[1])) || 'downtown';
    const p0 = MS.places[key] || MS.places.downtown;
    const at = roadPointAround(game.graph, p0[0], p0[1], 40, 140);
    interact.add({ x: at.x + 3, z: at.z, r: 2.4, color: 0xffc830, height: 3, blip: { color: '#ffc830', size: 6, global: true, icon: '?', bg: 'rgba(150,110,0,0.92)' },
      show: () => !MS.active && !S.indoors && P.missions.done.length >= sm.need && !P.side.done.includes(sm.id),
      label: () => `${keyHint(game)} side job: "${sm.title}" — ${sm.who}`,
      use: () => MS.begin(sm) });
  }

  // ---- the phone's Story tab: medals, trust, GPS, replay, abandon
  const ph = game.phoneSys.phone, cfg = ph.cfg;
  const items0 = cfg.items, row0 = cfg.row, act0 = cfg.act;
  cfg.items = (t) => t === 'story' ? [{ k: 'abandon' }, ...M, ...sideMissions] : items0(t);
  cfg.row = (it, t) => {
    if (t !== 'story') return row0(it, t);
    if (it.k === 'abandon') return { name: MS.active ? `On a job: "${MS.active.m.title}"` : 'No mission running', sub: MS.active ? 'Abandon it (no pay)' : 'The red star on the map is your next story mission', stats: [], btn: MS.active ? 'Abandon' : '·', cls: MS.active ? '' : 'dis' };
    if (it.side) { const done = P.side.done.includes(it.id), open = P.missions.done.length >= it.need; return { name: `? ${it.title}`, sub: `Side job · ${it.who} · ${money(it.reward)}${open ? '' : ` · after ${it.need} story missions`}${P.medals[it.id] ? ` · ${medalIcon(P.medals[it.id])}` : ''}`, stats: [], btn: done ? 'Done' : open ? 'Open' : 'Locked', cls: done ? 'own' : open ? '' : 'dis' }; }
    const r = row0(it, t), done = P.missions.done.includes(it.id), md = P.medals[it.id];
    r.sub += `${md ? ` · ${medalIcon(md)} ${md}` : ''}${P.trust[contactOf(it)] ? ` · trust ${P.trust[contactOf(it)]}` : ''}`;
    if (done) { r.btn = 'Replay'; r.cls = ''; }
    else if (r.btn === 'Next') r.btn = 'GPS';
    return r;
  };
  cfg.act = (it, t) => {
    if (t !== 'story') return act0(it, t);
    if (it.k === 'abandon') { if (MS.active) { MS.cancel(); hud.toast('Mission abandoned', 1.6); } return; }
    if (MS.active) { hud.toast('Finish or abandon the job you\'re on first.', 2); return; }
    if (it.side) return;
    if (P.missions.done.includes(it.id)) { ph.close(); MS.begin(it, { replay: true }); return; }
    const next = M.find((m) => !P.missions.done.includes(m.id));
    if (it === next) { const s = next.steps.find((x) => !['talk', 'pay', 'survive', 'fish', 'hunt', 'escape'].includes(x[0])); const k = s ? (typeof s[2] === 'string' ? s[2] : s[1]) : 'downtown'; const p = MS.places[k] || MS.places.downtown; game.setWaypoint(p[0], p[1], next.title); ph.close(); }
  };
  const note0 = cfg.note;
  cfg.note = (t) => t === 'story' ? `${P.missions.done.length} / 63 story missions · ${Object.values(P.medals).filter((x) => x === 'gold').length} gold medals · ${P.side.done.length} / ${SIDE.length} side jobs. Tap a finished mission to replay it.` : note0(t);

  // the first text, if a mission is waiting and nobody has told you yet
  if (!P.storyTexted) { P.storyTexted = true; const next = M.find((m) => !P.missions.done.includes(m.id)); if (next) setTimeout(() => game.text?.(next.who, `${next.brief} (Story: "${next.title}")`), 20000); }

  return {
    side: sideMissions, par, get retry() { return retry; },
    update(dt, a, free) {
      if (track && MS.active) {
        track.minHp = Math.min(track.minHp, player.health);
        const step = MS.active.m.steps[MS.active.step];
        if (game.police?.wanted > 0 && step?.[0] !== 'escape' && !MS.active.m.steps.some((s) => s[0] === 'escape')) track.police = true;
      }
      if (retry && !MS.active) {
        if (performance.now() > retry.until || S.dead > 0) { if (performance.now() > retry.until) retry = null; return ''; }
        if (free && a?.enter) { a.enter = false; const r = retry; retry = null; MS.begin(r.m, { from: r.from, replay: r.replay }); return ''; }
        return `${keyHint(game)} retry "${retry.m.title}" from the checkpoint (${Math.ceil((retry.until - performance.now()) / 1000)}s)`;
      }
      return '';
    },
  };
}
