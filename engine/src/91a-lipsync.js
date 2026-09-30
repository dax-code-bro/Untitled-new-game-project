/* ============================================================
   LIP SYNC THAT CAN BE READ.

   The old mouth (91-face.js) opened on every vowel letter and did
   something on m, f and l: it moved while a character talked, but it
   said nothing. A lip-reader works from VISEMES -- the dozen or so
   shapes the face makes for the forty-odd sounds of English -- and
   from their order and timing. Getting those right needs three steps,
   each of them here:

   1. WORDS TO SOUNDS. English spelling is not phonetic ("though",
      "through", "tough"), so letters are turned into phonemes (ARPAbet)
      by a table of the commonest irregular words and, for the rest, a
      set of spelling rules -- digraphs, the silent e, soft c and g,
      -tion, -ough and the rest. A lip-reader does not need the vowel
      in "cot" told from the one in "caught"; they do need an m told
      from an n, an f from a p and an "oo" from an "ee", and those the
      rules get right.

   2. SOUNDS TO SHAPES. Each phoneme is a target for six mouth
      controls the face rig provides (95-engine / 91c-mh-face.js):

        jaw     how far the jaw is dropped
        round   lips pushed forward and drawn in round (oo, w, oh)
        spread  lips drawn wide, corners back (ee, s)
        press   lips pressed shut and a little rolled (m, b, p)
        tuck    lower lip up under the top teeth (f, v)
        funnel  lips flared forward and open (sh, ch, j)
        upper   upper lip lifted off the teeth (th, the open vowels)

      The closures are the important part: m, b and p SHUT the mouth
      completely and f and v put the lip on the teeth, and those are
      what a lip-reader reads first, so they are held long enough to
      land even at speed.

   3. TIMING. The phonemes are laid along the line's actual spoken
      length (the recording's, or the synthesiser's own estimate),
      each with a duration by kind -- vowels long, stops short, a
      beat at every word break and a longer one at a comma -- and the
      controls are interpolated between them with a little of the
      next sound anticipated, the way a mouth really moves.
   ============================================================ */

/* The commonest words English does not spell the way it says. A rule set
   gets "cat" and "stone" right and "one", "said" and "you" wrong, and
   those are among the most frequent words in the language. */
const LIP_WORDS = {
  a: 'AH', the: 'DH AH', of: 'AH V', to: 'T UW', do: 'D UW', you: 'Y UW', your: 'Y AO R', are: 'AA R',
  one: 'W AH N', two: 'T UW', once: 'W AH N S', said: 'S EH D', says: 'S EH Z', was: 'W AA Z', what: 'W AH T',
  who: 'HH UW', whom: 'HH UW M', whose: 'HH UW Z', where: 'W EH R', there: 'DH EH R', here: 'HH IY R',
  were: 'W ER', have: 'HH AE V', give: 'G IH V', live: 'L IH V', love: 'L AH V', come: 'K AH M', some: 'S AH M',
  done: 'D AH N', none: 'N AH N', gone: 'G AO N', been: 'B IH N', does: 'D AH Z', any: 'EH N IY', many: 'M EH N IY',
  I: 'AY', i: 'AY', me: 'M IY', he: 'HH IY', she: 'SH IY', we: 'W IY', be: 'B IY', they: 'DH EY', them: 'DH EH M',
  their: 'DH EH R', is: 'IH Z', his: 'HH IH Z', has: 'HH AE Z', as: 'AE Z', was_: 'W AA Z', this: 'DH IH S',
  that: 'DH AE T', with: 'W IH DH', from: 'F R AH M', for: 'F AO R', or: 'AO R', not: 'N AA T', no: 'N OW',
  so: 'S OW', go: 'G OW', oh: 'OW', ok: 'OW K EY', okay: 'OW K EY', eye: 'AY', eyes: 'AY Z', buy: 'B AY',
  by: 'B AY', my: 'M AY', why: 'W AY', could: 'K UH D', would: 'W UH D', should: 'SH UH D', put: 'P UH T',
  full: 'F UH L', pull: 'P UH L', push: 'P UH SH', good: 'G UH D', look: 'L UH K', took: 'T UH K', book: 'B UH K',
  foot: 'F UH T', wood: 'W UH D', stood: 'S T UH D', people: 'P IY P AH L', friend: 'F R EH N D',
  again: 'AH G EH N', against: 'AH G EH N S T', enough: 'IH N AH F', though: 'DH OW', through: 'TH R UW',
  thought: 'TH AO T', tough: 'T AH F', rough: 'R AH F', cough: 'K AO F', bought: 'B AO T', brought: 'B R AO T',
  night: 'N AY T', right: 'R AY T', light: 'L AY T', fight: 'F AY T', might: 'M AY T', eight: 'EY T',
  world: 'W ER L D', work: 'W ER K', word: 'W ER D', worse: 'W ER S', worth: 'W ER TH',
  women: 'W IH M AH N', woman: 'W UH M AH N', only: 'OW N L IY', also: 'AO L S OW', always: 'AO L W EY Z',
  every: 'EH V R IY', very: 'V EH R IY', sure: 'SH UH R', busy: 'B IH Z IY', business: 'B IH Z N AH S',
  water: 'W AO T ER', father: 'F AA DH ER', mother: 'M AH DH ER', brother: 'B R AH DH ER', other: 'AH DH ER',
  know: 'N OW', knew: 'N UW', knife: 'N AY F', answer: 'AE N S ER', listen: 'L IH S AH N', often: 'AO F AH N',
  hour: 'AW ER', honest: 'AA N AH S T', ghost: 'G OW S T', island: 'AY L AH N D', talk: 'T AO K', walk: 'W AO K',
  half: 'HH AE F', calm: 'K AA M', climb: 'K L AY M', bomb: 'B AA M', dumb: 'D AH M', lamb: 'L AE M',
  door: 'D AO R', floor: 'F L AO R', blood: 'B L AH D', flood: 'F L AH D', move: 'M UW V', lose: 'L UW Z',
  prove: 'P R UW V', whole: 'HH OW L', hole: 'HH OW L', owe: 'OW', own: 'OW N', towards: 'T AO R D Z',
  area: 'EH R IY AH', idea: 'AY D IY AH', real: 'R IY L', really: 'R IH L IY', ready: 'R EH D IY',
  head: 'HH EH D', dead: 'D EH D', read: 'R IY D', bread: 'B R EH D', breath: 'B R EH TH', death: 'D EH TH',
  great: 'G R EY T', break: 'B R EY K', steak: 'S T EY K', heart: 'HH AA R T', learn: 'L ER N', earth: 'ER TH',
  zombie: 'Z AA M B IY', zombies: 'Z AA M B IY Z', thompson: 'T AA M S AH N', minute: 'M IH N AH T',
  bunker: 'B AH NG K ER', fuel: 'F Y UW L', radio: 'R EY D IY OW', over: 'OW V ER', never: 'N EH V ER',
  even: 'IY V AH N', open: 'OW P AH N', shoe: 'SH UW', shoes: 'SH UW Z', canoe: 'K AH N UW',
};

/* Spelling rules, longest first. Each: letters, the phonemes they make, and an optional test of the
   letters around them (the whole word, and where the match starts and ends). */
const _V = 'aeiouy';
const _isV = (c) => !!c && _V.includes(c);
const _isC = (c) => !!c && /[a-z]/.test(c) && !_V.includes(c);
const LIP_RULES = [
  ['tion', 'SH AH N'], ['sion', 'ZH AH N'], ['cian', 'SH AH N'], ['ture', 'CH ER'], ['sure', 'ZH ER'],
  ['ough', 'AO'], ['augh', 'AO'], ['eigh', 'EY'], ['igh', 'AY'],
  ['tch', 'CH'], ['dge', 'JH'], ['sch', 'S K'], ['que', 'K', (w, i, j) => j === w.length], ['qu', 'K W'],
  ['kn', 'N', (w, i) => i === 0], ['wr', 'R', (w, i) => i === 0], ['gn', 'N', (w, i) => i === 0 || i === w.length - 2],
  ['mb', 'M', (w, i, j) => j === w.length], ['ph', 'F'], ['wh', 'W'], ['th', 'TH'], ['sh', 'SH'], ['ch', 'CH'],
  ['ck', 'K'], ['ng', 'NG'], ['gh', '', (w, i) => i > 0], ['gh', 'G'],
  ['ee', 'IY'], ['ea', 'IY'], ['oo', 'UW'], ['ou', 'AW'], ['ow', 'OW', (w, i, j) => j === w.length], ['ow', 'AW'],
  ['oi', 'OY'], ['oy', 'OY'], ['ai', 'EY'], ['ay', 'EY'], ['ey', 'EY', (w, i, j) => j === w.length && w.length <= 4], ['ey', 'IY'],
  ['au', 'AO'], ['aw', 'AO'], ['ew', 'UW'], ['ue', 'UW'], ['ui', 'UW'], ['ie', 'AY', (w, i, j) => j === w.length && w.length <= 4],
  ['ie', 'IY'], ['ei', 'EY'], ['oa', 'OW'], ['oe', 'OW'],
  ['ar', 'AA R', (w, i, j) => !_isV(w[j]) || w[j] === 'y'], ['or', 'AO R', (w, i, j) => !_isV(w[j])],
  ['er', 'ER', (w, i, j) => !_isV(w[j])], ['ir', 'ER', (w, i, j) => !_isV(w[j])], ['ur', 'ER', (w, i, j) => !_isV(w[j])],
  ['wa', 'W AA', (w, i, j) => !_isV(w[j]) && w[j] !== 'y' && w[j] !== 'g' && w[j] !== 'k'],
];
// A vowel before one consonant and a final e is long, and the e is silent ("stone", "time", "made").
const LIP_LONG = { a: 'EY', e: 'IY', i: 'AY', o: 'OW', u: 'UW', y: 'AY' };
const LIP_SHORT = { a: 'AE', e: 'EH', i: 'IH', o: 'AA', u: 'AH', y: 'IH' };
const LIP_CONS = { b: 'B', d: 'D', f: 'F', h: 'HH', j: 'JH', k: 'K', l: 'L', m: 'M', n: 'N', p: 'P', r: 'R', s: 'S',
  t: 'T', v: 'V', w: 'W', x: 'K S', z: 'Z' };

function lipWordPhonemes(word) {
  const w0 = word.toLowerCase().replace(/[^a-z']/g, '');
  const w = w0.replace(/'/g, '');
  if (!w) return [];
  if (LIP_WORDS[w0] || LIP_WORDS[w]) return (LIP_WORDS[w0] || LIP_WORDS[w]).split(' ');
  // Plurals and -ed of listed words ("zombies" is listed; "doors", "looked" are not).
  if (w.length > 3 && w.endsWith('s') && LIP_WORDS[w.slice(0, -1)]) return LIP_WORDS[w.slice(0, -1)].split(' ').concat(['Z']);
  if (w.length > 4 && w.endsWith('ed') && LIP_WORDS[w.slice(0, -2)]) return LIP_WORDS[w.slice(0, -2)].split(' ').concat(['D']);
  const out = [];
  const n = w.length;
  // Is the final e silent: a consonant before it and a vowel somewhere before that (not "be", "the").
  const silentE = n > 2 && w[n - 1] === 'e' && _isC(w[n - 2]) && /[aeiouy]/.test(w.slice(0, n - 2));
  let i = 0;
  while (i < n) {
    if (silentE && i === n - 1) break;
    let hit = null;
    for (const [pat, ph, ok] of LIP_RULES) {
      if (w.startsWith(pat, i) && (!ok || ok(w, i, i + pat.length))) { hit = [pat, ph]; break; }
    }
    if (hit) { if (hit[1]) out.push(...hit[1].split(' ')); i += hit[0].length; continue; }
    const ch = w[i], nx = w[i + 1];
    if (nx === ch && _isC(ch)) { i++; continue; }            // a doubled consonant is said once
    if (ch === 'c') { out.push(nx === 'e' || nx === 'i' || nx === 'y' ? 'S' : 'K'); i++; continue; }
    if (ch === 'g') { out.push((nx === 'e' || nx === 'i' || nx === 'y') && i > 0 ? 'JH' : 'G'); i++; continue; }
    if (ch === 's' && _isV(w[i - 1]) && _isV(nx) && !(silentE && i + 1 === n - 1 && false)) { out.push('Z'); i++; continue; }
    if (ch === 's' && i === n - 1 && i > 0 && /[bdgvmnlr]|[aeiouy]/.test(w[i - 1]) && w[i - 1] !== 's') { out.push('Z'); i++; continue; }
    if (ch === 'y') {
      if (i === 0 && _isV(nx)) out.push('Y');
      else out.push(i === n - 1 ? (n <= 3 ? 'AY' : 'IY') : 'IH');
      i++; continue;
    }
    if (_isV(ch)) {
      // Long before consonant + silent e, or at the end of a short word ("go", "me", "hi").
      const longE = silentE && i === n - 3;
      const open = i === n - 1 && n <= 3;
      out.push(longE || open ? LIP_LONG[ch] : (i === n - 1 && ch === 'e' ? '' : LIP_SHORT[ch]));
      if (!out[out.length - 1]) out.pop();
      i++; continue;
    }
    if (LIP_CONS[ch]) out.push(...LIP_CONS[ch].split(' '));
    i++;
  }
  // "-ed" after t or d is a syllable; after a voiceless sound it is T ("walked"), otherwise D.
  if (n > 3 && w.endsWith('ed') && !LIP_WORDS[w]) {
    const k = out.lastIndexOf('EH');
    if (k === out.length - 2 && out[out.length - 1] === 'D') {
      const before = out[k - 1];
      if (before !== 'T' && before !== 'D') { out.splice(k, 1); if (['P', 'K', 'F', 'S', 'SH', 'CH', 'TH'].includes(before)) out[out.length - 1] = 'T'; }
    }
  }
  return out;
}

/* Numbers are said, not spelled: "800" is "eight hundred". */
function _lipNumber(s) {
  const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const say = (n) => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + say(n % 100) : '');
    if (n < 1e6) return say(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + say(n % 1000) : '');
    return String(n).split('').map((d) => ones[+d]).join(' ');
  };
  const v = parseInt(s, 10);
  return isFinite(v) ? say(v) : s;
}

/* The six controls (plus upper) for each phoneme: the target a mouth reaches saying it. */
const LIP_SHAPES = {
  // Vowels. Jaw carries most of the visible difference; the lips carry the rest.
  AA: { jaw: 0.95, upper: 0.25 },              // fAther
  AE: { jaw: 0.75, spread: 0.45, upper: 0.3 },  // cAt
  AH: { jaw: 0.6, upper: 0.15 },               // cUt
  AO: { jaw: 0.75, round: 0.45 },              // thOUGHt
  AW: { jaw: 0.85, upper: 0.2, to: 'UW' },     // nOW  -> ends rounded
  AY: { jaw: 0.9, upper: 0.2, to: 'IY' },      // mY   -> ends spread
  EH: { jaw: 0.55, spread: 0.35, upper: 0.2 }, // bEd
  ER: { jaw: 0.3, round: 0.35, funnel: 0.2 },  // bIRd
  EY: { jaw: 0.5, spread: 0.4, to: 'IY' },     // dAY
  IH: { jaw: 0.32, spread: 0.5 },              // bIt
  IY: { jaw: 0.14, spread: 0.9 },              // bEE
  OW: { jaw: 0.55, round: 0.65, to: 'UW' },    // gO
  OY: { jaw: 0.65, round: 0.55, to: 'IY' },    // bOY
  UH: { jaw: 0.3, round: 0.6 },                // bOOk
  UW: { jaw: 0.08, round: 1.0 },               // fOOd
  // Consonants. The closures are the lip-reader's anchors.
  P: { press: 1, hold: true }, B: { press: 1, hold: true }, M: { press: 1, hold: true },
  F: { tuck: 1, jaw: 0.12, hold: true }, V: { tuck: 1, jaw: 0.12, hold: true },
  TH: { jaw: 0.25, upper: 0.35, spread: 0.2 }, DH: { jaw: 0.22, upper: 0.3, spread: 0.2 },
  T: { jaw: 0.2, spread: 0.2 }, D: { jaw: 0.22, spread: 0.15 }, N: { jaw: 0.18, spread: 0.15 }, L: { jaw: 0.3 },
  S: { jaw: 0.06, spread: 0.55, upper: 0.2 }, Z: { jaw: 0.06, spread: 0.5, upper: 0.15 },
  SH: { jaw: 0.18, funnel: 1, round: 0.3 }, ZH: { jaw: 0.18, funnel: 0.9, round: 0.3 },
  CH: { jaw: 0.16, funnel: 0.9, round: 0.25 }, JH: { jaw: 0.18, funnel: 0.85, round: 0.25 },
  K: { jaw: 0.32 }, G: { jaw: 0.32 }, NG: { jaw: 0.28 },
  R: { jaw: 0.2, round: 0.55, funnel: 0.25 }, W: { jaw: 0.08, round: 1.0 }, Y: { jaw: 0.12, spread: 0.6 },
  HH: { breathe: true },                      // takes the shape of the vowel it opens
  _: {},                                       // rest
};
const LIP_CONTROLS = ['jaw', 'round', 'spread', 'press', 'tuck', 'funnel', 'upper'];
// How long each kind of sound lasts, relative to a plain vowel.
function _lipDur(ph) {
  if (/^(AA|AE|AO|AW|AY|EY|OW|OY|ER)$/.test(ph)) return 1.25;
  if (/^(AH|EH|IH|IY|UH|UW)$/.test(ph)) return 1.0;
  if (/^(P|B|M|F|V)$/.test(ph)) return 0.8;      // closures held long enough to see
  if (/^(S|Z|SH|ZH|CH|JH|TH|DH)$/.test(ph)) return 0.75;
  if (ph === 'HH') return 0.35;
  return 0.55;
}

/* The phonemes and pauses of a line: [{ ph, word }] with '_' for a break. */
function lipPhonemes(text) {
  const out = [];
  // Each word keeps where it starts in the line, so a voice that reports its progress (a speech
  // synthesiser's word boundaries) can pull the mouth back into step with it.
  const re = /\d+|[A-Za-z']+|[.,!?;:\u2014-]+/g, src = String(text);
  let m;
  while ((m = re.exec(src))) {
    const t0 = m[0], at = m.index;
    if (/^[.,!?;:\u2014-]+$/.test(t0)) { out.push({ ph: '_', pause: /[.!?]/.test(t0) ? 2.2 : 1.3 }); continue; }
    for (const t of /^\d/.test(t0) ? _lipNumber(t0).split(' ') : [t0]) {
      const p = lipWordPhonemes(t);
      if (!p.length) continue;
      if (out.length && out[out.length - 1].ph !== '_') out.push({ ph: '_', pause: 0.22 });
      for (const ph of p) out.push({ ph, word: t, at });
    }
  }
  return out;
}

/* The viseme a lip-reader would name for a phoneme: the classes a reader can actually tell apart. */
const LIP_VISEME = {
  P: 'PP', B: 'PP', M: 'PP', F: 'FF', V: 'FF', TH: 'TH', DH: 'TH', T: 'DD', D: 'DD', N: 'DD', L: 'DD',
  K: 'kk', G: 'kk', NG: 'kk', CH: 'CH', JH: 'CH', SH: 'CH', ZH: 'CH', S: 'SS', Z: 'SS', R: 'RR', ER: 'RR',
  W: 'ou', UW: 'ou', UH: 'ou', OW: 'oh', AO: 'oh', OY: 'oh', AA: 'aa', AH: 'aa', AW: 'aa', AY: 'aa', AE: 'aa',
  EH: 'E', EY: 'E', IH: 'ih', IY: 'ih', Y: 'ih', HH: 'sil', _: 'sil',
};

/* A line laid out in time: keys at each phoneme's centre with its control targets, stretched to the
   line's real length. `duration` is seconds; omitted, a conversational 12 sounds a second. */
function lipTimeline(text, duration) {
  const ph = lipPhonemes(text);
  const segs = [];
  for (let i = 0; i < ph.length; i++) {
    const p = ph[i];
    if (p.ph === '_') { segs.push({ ph: '_', w: p.pause, shape: {} }); continue; }
    let shape = LIP_SHAPES[p.ph] || {};
    if (shape.breathe) {                          // /h/ is the vowel after it, breathed
      const nx = ph.slice(i + 1).find((q) => q.ph !== '_');
      shape = nx ? Object.assign({}, LIP_SHAPES[nx.ph] || {}, { jaw: ((LIP_SHAPES[nx.ph] || {}).jaw || 0.3) * 0.7 }) : {};
    }
    const w = _lipDur(p.ph);
    if (shape.to) {
      // A diphthong glides: the first shape for 60 per cent, the second for the rest.
      segs.push({ ph: p.ph, w: w * 0.6, shape, word: p.word, at: p.at });
      segs.push({ ph: p.ph + '>', w: w * 0.4, shape: LIP_SHAPES[shape.to], word: p.word, at: p.at });
    } else segs.push({ ph: p.ph, w, shape, word: p.word, at: p.at });
  }
  let total = 0;
  for (const s of segs) total += s.w;
  const dur = duration && duration > 0 ? duration : total / 12;
  const k = total > 0 ? dur / total : 0;
  let t = 0;
  for (const s of segs) { s.t0 = t; s.t1 = t + s.w * k; s.tc = (s.t0 + s.t1) / 2; t = s.t1; }
  return { segs, duration: dur };
}

/* The controls at time t: between the key before and after, eased, with closures held at full for the
   middle of their span and the next sound anticipated a little. Returns { jaw, round, ... }. */
function lipSample(tl, t, out = {}) {
  for (const c of LIP_CONTROLS) out[c] = 0;
  const S = tl.segs;
  if (!S.length || t < 0 || t > tl.duration) return out;
  let i = 0;
  while (i < S.length - 1 && t > S[i].t1) i++;
  const s = S[i];
  const val = (seg, c) => (seg && seg.shape[c]) || 0;
  // Held sounds: flat for their middle 60%, so a closure actually closes.
  const hold = s.shape.hold ? 0.3 : 0.12;
  const a = s.t0 + (s.t1 - s.t0) * hold, b = s.t1 - (s.t1 - s.t0) * hold;
  let from, to, f;
  if (t < a) { from = S[i - 1]; to = s; f = 0.5 + 0.5 * (t - s.t0) / Math.max(1e-6, a - s.t0); }
  else if (t > b) { from = s; to = S[i + 1]; f = 0.5 * (t - b) / Math.max(1e-6, s.t1 - b); }
  else { from = s; to = s; f = 0; }
  const e = f * f * (3 - 2 * f);
  for (const c of LIP_CONTROLS) out[c] = val(from, c) + (val(to, c) - val(from, c)) * e;
  // A closure wins over anything blended into it: lips cannot be shut and open at once.
  if (out.press > 0.01) { out.jaw *= 1 - out.press; out.round *= 1 - out.press * 0.7; out.spread *= 1 - out.press * 0.7; }
  if (out.tuck > 0.01) out.round *= 1 - out.tuck;
  return out;
}

/* When the word at character `c` of the line starts, in the timeline's seconds (or -1). */
function lipWordTime(tl, c) {
  let t = -1, a = -1;
  for (const s of tl.segs) if (s.at != null && s.at <= c && s.at > a) { a = s.at; t = s.t0; }
  return t;
}

/* For tests and debugging: the sequence of visemes a line produces, as a lip-reader would transcribe it. */
function lipVisemes(text) {
  return lipTimeline(text).segs.filter((s) => s.ph !== '_' && !s.ph.endsWith('>')).map((s) => LIP_VISEME[s.ph] || '?');
}

const LipSync = { phonemes: lipPhonemes, wordPhonemes: lipWordPhonemes, timeline: lipTimeline, sample: lipSample, wordTime: lipWordTime,
  visemes: lipVisemes, SHAPES: LIP_SHAPES, VISEME: LIP_VISEME, CONTROLS: LIP_CONTROLS };
