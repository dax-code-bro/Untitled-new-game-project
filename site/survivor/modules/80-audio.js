/* Sound, generated rather than sampled — there are no assets in this game,
   so every noise in it is an oscillator, a noise buffer and a filter.

   The interesting part is that the sounds are driven by the same numbers
   the simulation already computes. A gunshot's loudness comes from the
   firearm's noiseDb, its crack-and-echo timing from the distance the sound
   has to travel and come back, wind from the actual wind speed at head
   height, rain from the precipitation rate, and the ambience from which
   animals are genuinely awake at this hour. Nothing here is a mood knob.

   Listens: 'gunshot', 'fire-lit', 'chop', 'fish-landed', 'death'. */
SurvivorGame.module({
  id: 'audio',
  order: 80,

  init(ctx) {
    const { SV, game } = ctx;
    const A = game.audio;

    /* One persistent graph for the continuous sounds — wind, rain, fire —
       rather than a new node per frame. Everything else is one-shot. */
    let graph = null;

    function ensureGraph() {
      const ac = A.ensure();
      if (!ac || graph) return graph;
      const make = (type, freq, q) => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; return f; };

      // A long noise buffer looped is cheaper and smoother than regenerating.
      const len = ac.sampleRate * 3;
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        // Brown-ish noise: integrating white noise puts the energy low,
        // which is what wind and rain actually sound like.
        last = (last + Math.random() * 2 - 1) * 0.5;
        d[i] = last;
      }

      const windSrc = ac.createBufferSource(); windSrc.buffer = buf; windSrc.loop = true;
      const windFilter = make('lowpass', 420, 0.8);
      const windGain = ac.createGain(); windGain.gain.value = 0;
      windSrc.connect(windFilter).connect(windGain).connect(A.master);
      windSrc.start();

      const rainSrc = ac.createBufferSource(); rainSrc.buffer = buf; rainSrc.loop = true;
      const rainFilter = make('highpass', 900, 0.6);
      const rainGain = ac.createGain(); rainGain.gain.value = 0;
      rainSrc.connect(rainFilter).connect(rainGain).connect(A.master);
      rainSrc.start();

      const fireSrc = ac.createBufferSource(); fireSrc.buffer = buf; fireSrc.loop = true;
      const fireFilter = make('bandpass', 700, 0.7);
      const fireGain = ac.createGain(); fireGain.gain.value = 0;
      fireSrc.connect(fireFilter).connect(fireGain).connect(A.master);
      fireSrc.start();

      // Surf: the sea is always there and gets louder as you approach it.
      const surfSrc = ac.createBufferSource(); surfSrc.buffer = buf; surfSrc.loop = true;
      const surfFilter = make('lowpass', 900, 0.5);
      const surfGain = ac.createGain(); surfGain.gain.value = 0;
      surfSrc.connect(surfFilter).connect(surfGain).connect(A.master);
      surfSrc.start();

      graph = { ac, windGain, windFilter, rainGain, fireGain, fireFilter, surfGain, surfFilter };
      return graph;
    }

    /* ---- gunfire ---------------------------------------------------- */

    /* A rifle shot heard at the muzzle is a pressure spike and then the
       terrain sending it back. The echo delay is the real one: sound
       travels at about 343 m/s, so a valley wall 200 m away answers 1.2
       seconds later. That is why a shot in the woods sounds nothing like
       a shot on a beach, and here it genuinely does not. */
    function gunshot(e) {
      const g = ensureGraph();
      if (!g) return;
      const ac = g.ac;
      const now = ac.currentTime;
      const db = e.noiseDb || 155;
      const loud = Math.min(1, Math.max(0.15, (db - 120) / 45));
      const supp = e.suppressed ? 0.35 : 1;

      // The crack: a very short broadband transient.
      const src = ac.createBufferSource();
      const len = Math.floor(ac.sampleRate * 0.25);
      const b = ac.createBuffer(1, len, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 7);
      }
      src.buffer = b;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = e.suppressed ? 300 : 90;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.5 * loud * supp, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      src.connect(hp).connect(gain).connect(A.master);
      src.start(now); src.stop(now + 0.25);

      // The thump: the low end that carries a kilometre.
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.18);
      const og = ac.createGain();
      og.gain.setValueAtTime(0.4 * loud * supp, now);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(og).connect(A.master);
      osc.start(now); osc.stop(now + 0.32);

      /* The echoes. How many and how loud depends on what is around: a
         forest returns a dozen soft ones and a canyon returns two hard
         ones. The delays come from real distances at the real speed of
         sound. */
      const biome = ctx.biomeAt(ctx.player.x, ctx.player.z);
      const forest = biome && /forest|woodland/.test(biome.id);
      const open = biome && /beach|prairie|dune/.test(biome.id);
      const echoes = e.suppressed ? 1 : forest ? 5 : open ? 2 : 3;
      for (let i = 0; i < echoes; i++) {
        const distM = 60 + Math.random() * (forest ? 180 : open ? 700 : 400);
        const delay = (2 * distM) / 343;
        const t = now + delay;
        const es = ac.createBufferSource();
        es.buffer = b;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
        // Air absorbs the top end over distance, so a far echo is dull.
        lp.frequency.value = Math.max(200, 4000 - distM * 4);
        const eg = ac.createGain();
        const amp = 0.28 * loud * supp * Math.pow(0.55, i) * (open ? 0.7 : 1);
        eg.gain.setValueAtTime(amp, t);
        eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35 + distM / 500);
        es.connect(lp).connect(eg).connect(A.master);
        es.start(t); es.stop(t + 0.5);
      }
    }
    ctx.on('gunshot', gunshot);

    /* ---- footsteps ---------------------------------------------------- */

    /* Footfall rate comes from the actual walking speed and stride length,
       so the sound of your own feet tells you how fast you are going. */
    let stepPhase = 0;
    const STEP = {
      beach: { freq: 1800, q: 0.8, vol: 0.10 },
      dune: { freq: 1800, q: 0.8, vol: 0.10 },
      marsh: { freq: 500, q: 1.6, vol: 0.16 },
      prairie: { freq: 1100, q: 1.0, vol: 0.07 },
      meadow: { freq: 1100, q: 1.0, vol: 0.07 },
      woodland: { freq: 900, q: 1.2, vol: 0.09 },
      deepForest: { freq: 800, q: 1.3, vol: 0.10 },
      pineForest: { freq: 850, q: 1.2, vol: 0.10 },
      scrub: { freq: 1400, q: 1.0, vol: 0.09 },
      rock: { freq: 2600, q: 1.4, vol: 0.12 },
      alpine: { freq: 2600, q: 1.4, vol: 0.12 },
    };

    function footstep(spec, hard) {
      const g = ensureGraph();
      if (!g) return;
      const ac = g.ac, now = ac.currentTime;
      const len = Math.floor(ac.sampleRate * 0.12);
      const b = ac.createBuffer(1, len, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      const src = ac.createBufferSource(); src.buffer = b;
      const f = ac.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = spec.freq * (0.85 + Math.random() * 0.3);
      f.Q.value = spec.q;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(spec.vol * (hard ? 1.5 : 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      src.connect(f).connect(gain).connect(A.master);
      src.start(now); src.stop(now + 0.14);
    }

    /* ---- ambience ------------------------------------------------------ */

    /* Birds by day, insects at night, and neither in winter. The list of
       what is calling comes from the ecology: if there are no crows within
       earshot, no crow calls. */
    let nextCall = 3;
    function ambientCall(dt) {
      nextCall -= dt;
      if (nextCall > 0) return;
      nextCall = 4 + Math.random() * 14;
      const period = ctx.world.clock.period;
      const season = ctx.world.clock.season;
      if (season === 'winter' && Math.random() < 0.7) return;

      const near = ctx.world.ecology.near(ctx.player.x, ctx.player.z, 220);
      if (!near.length) return;
      const a = near[(Math.random() * near.length) | 0];
      const sp = a.species || SV.SPECIES[a.speciesId];
      if (!sp) return;

      // Nocturnal things call at night and diurnal things call by day.
      const nocturnal = /owl|coyote|raccoon|opossum|bat|fox/.test(a.speciesId);
      const isNight = period === 'night' || period === 'astronomicalTwilight';
      if (nocturnal !== isNight && Math.random() < 0.75) return;

      const dist = Math.hypot(a.x - ctx.player.x, a.z - ctx.player.z);
      const vol = Math.max(0.02, 0.16 * (1 - dist / 220));

      // Big animals call low and small ones call high, which is just physics.
      const base = 1400 / Math.pow(Math.max(0.4, a.massKg || sp.massKg || 20), 0.3);
      const g = ensureGraph();
      if (!g) return;
      const ac = g.ac, now = ac.currentTime;
      const notes = /coyote|wolf/.test(a.speciesId) ? 3 : /crow|jay/.test(a.speciesId) ? 3 : 2;
      for (let i = 0; i < notes; i++) {
        const t = now + i * (0.14 + Math.random() * 0.12);
        const osc = ac.createOscillator();
        osc.type = /coyote|wolf|owl/.test(a.speciesId) ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(base * (0.8 + Math.random() * 0.5), t);
        if (/coyote|wolf/.test(a.speciesId)) osc.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.5);
        const gg = ac.createGain();
        const dur = /coyote|wolf|owl/.test(a.speciesId) ? 0.7 : 0.18;
        gg.gain.setValueAtTime(0.0001, t);
        gg.gain.exponentialRampToValueAtTime(vol, t + 0.04);
        gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gg).connect(A.master);
        osc.start(t); osc.stop(t + dur + 0.05);
      }
    }

    /* ---- the heart ------------------------------------------------------ */

    /* You hear your own heart when there is a reason to: blood loss, cold,
       exhaustion. The rate is the real one the physiology is running. */
    let beatPhase = 0;
    function heartbeat(dt, status) {
      const stress = Math.max(status.bloodLoss * 2.2, Math.max(0, (status.hunger - 0.75) * 2),
        status.coreTempC < 35 ? 0.7 : 0, 1 - status.capacity);
      if (stress < 0.45) return;
      const bpm = 70 + stress * 70;
      beatPhase += dt * (bpm / 60);
      if (beatPhase < 1) return;
      beatPhase = 0;
      const g = ensureGraph();
      if (!g) return;
      const ac = g.ac, now = ac.currentTime;
      for (const [off, f, v] of [[0, 62, 1], [0.14, 48, 0.6]]) {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + off);
        const gg = ac.createGain();
        gg.gain.setValueAtTime(0.14 * stress * v, now + off);
        gg.gain.exponentialRampToValueAtTime(0.0001, now + off + 0.16);
        osc.connect(gg).connect(A.master);
        osc.start(now + off); osc.stop(now + off + 0.18);
      }
    }

    /* ---- the body ----------------------------------------------------
       You hear yourself before you read a panel. Shivering is teeth and
       a broken breath; a chest infection is a cough with fluid in it; a
       gut infection is retching. All of it is driven by the same
       numbers the simulation already has, so the sound arrives when the
       condition does and stops when it is treated. */

    let shiverPhase = 0, breathPhase = 0, symptomClock = 0, painClock = 0;

    /* Teeth. Two short clicks a tenth of a second apart, at the 10-12 Hz
       of real shivering, filtered hard so they read as bone rather than
       as a tap on a table. */
    function chatter(intensity) {
      const g = ensureGraph();
      if (!g) return;
      const ac = g.ac, now = ac.currentTime;
      const n = 2 + Math.floor(intensity * 3);
      for (let i = 0; i < n; i++) {
        const t = now + i * (0.085 + Math.random() * 0.03);
        const osc = ac.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1400 + Math.random() * 900, t);
        const f = ac.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 6;
        const gg = ac.createGain();
        gg.gain.setValueAtTime(0.035 * intensity, t);
        gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
        osc.connect(f).connect(gg).connect(A.master);
        osc.start(t); osc.stop(t + 0.03);
      }
    }

    /* A breath. `wet` puts fluid in it, `strain` makes it fast and
       shallow — which is what a fever and what exhaustion respectively
       do to breathing, and they sound different. */
    function breath(out, amp, wet, strain) {
      const g = ensureGraph();
      if (!g) return;
      const ac = g.ac, now = ac.currentTime;
      const dur = (out ? 0.55 : 0.40) * (1 - strain * 0.45);
      const src = ac.createBufferSource();
      const len = Math.ceil(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.86 + (Math.random() * 2 - 1) * 0.14;
        d[i] = last;
      }
      src.buffer = buf;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(out ? 620 : 900, now);
      f.frequency.linearRampToValueAtTime(out ? 380 : 1200, now + dur);
      f.Q.value = wet > 0.3 ? 1.4 : 0.7;
      const gg = ac.createGain();
      gg.gain.setValueAtTime(0.0001, now);
      gg.gain.linearRampToValueAtTime(amp, now + dur * 0.3);
      gg.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(f).connect(gg).connect(A.master);
      src.start(now); src.stop(now + dur);
      // Fluid in the chest is a low rattle riding the breath.
      if (wet > 0.25) {
        const osc = ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(70 + Math.random() * 20, now);
        const lf = ac.createBiquadFilter();
        lf.type = 'lowpass'; lf.frequency.value = 320;
        const og = ac.createGain();
        og.gain.setValueAtTime(0.02 * wet, now);
        og.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.8);
        osc.connect(lf).connect(og).connect(A.master);
        osc.start(now); osc.stop(now + dur);
      }
    }

    /* A cough: a hard glottal burst and a trailing rasp. A productive
       one has the rasp doubled and lower, because there is something in
       there being moved. */
    function cough(productive) {
      const g = ensureGraph();
      if (!g) return;
      const ac = g.ac, now = ac.currentTime;
      const bursts = productive ? 3 : 2;
      for (let i = 0; i < bursts; i++) {
        const t = now + i * (0.19 + Math.random() * 0.06);
        const src = ac.createBufferSource();
        const len = Math.ceil(ac.sampleRate * 0.22);
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let k = 0; k < len; k++) {
          last = last * (productive ? 0.93 : 0.8) + (Math.random() * 2 - 1) * 0.2;
          d[k] = last * Math.exp(-k / (ac.sampleRate * 0.055));
        }
        src.buffer = buf;
        const f = ac.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = productive ? 320 : 640;
        f.Q.value = 1.1;
        const gg = ac.createGain();
        gg.gain.value = 0.10;
        src.connect(f).connect(gg).connect(A.master);
        src.start(t); src.stop(t + 0.24);
      }
    }

    /* Retching. Low, long, and unpleasant, which is the point. */
    function retch() {
      const g = ensureGraph();
      if (!g) return;
      const ac = g.ac, now = ac.currentTime;
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(105, now);
      osc.frequency.linearRampToValueAtTime(62, now + 0.7);
      const f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 3;
      const gg = ac.createGain();
      gg.gain.setValueAtTime(0.0001, now);
      gg.gain.linearRampToValueAtTime(0.11, now + 0.18);
      gg.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      osc.connect(f).connect(gg).connect(A.master);
      osc.start(now); osc.stop(now + 0.82);
    }

    /* Pain. A short voiced grunt, pitched by how bad it is. */
    function grunt(severity) {
      const g = ensureGraph();
      if (!g) return;
      const ac = g.ac, now = ac.currentTime;
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150 - severity * 28, now);
      osc.frequency.linearRampToValueAtTime(112 - severity * 24, now + 0.28);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 2.2;
      const gg = ac.createGain();
      gg.gain.setValueAtTime(0.0001, now);
      gg.gain.linearRampToValueAtTime(0.09 * (0.5 + severity * 0.5), now + 0.05);
      gg.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      osc.connect(f).connect(gg).connect(A.master);
      osc.start(now); osc.stop(now + 0.34);
    }
    ctx.on('player-hurt', (e) => grunt(Math.min(1, (e && e.severity) || 0.5)));

    let lastPain = 0;
    function bodySounds(dt, status) {
      /* Shivering. It starts at about 36.5 C core and is violent by 34,
         and it is involuntary — there is no state in which you are cold
         enough to shiver and quiet. */
      const sh = status.shivering || 0;
      if (sh > 0.12) {
        shiverPhase += dt * (0.9 + sh * 1.8);
        if (shiverPhase >= 1) { shiverPhase = 0; chatter(Math.min(1, sh)); }
      }

      /* Breathing. Rate follows the real drivers: exertion, fever,
         blood loss and pain all push it up, and a body at rest in good
         order breathes about 14 times a minute. */
      const inj = ctx.player.injury ? ctx.player.injury.summary() : { pain: 0 };
      const fever = Math.max(0, (status.coreTempC - 37.6) / 2.4);
      const strain = Math.min(1, Math.max(
        (ctx.player.speedMs || 0) / 5,
        (status.bloodLoss || 0) * 2,
        fever, (inj.pain || 0) * 0.8, sh * 0.5,
      ));
      const rate = 14 + strain * 22;
      breathPhase += dt * (rate / 60) * 2;      // in and out
      if (breathPhase >= 1) {
        breathPhase -= 1;
        const out = (breathCount++ & 1) === 1;
        const amp = 0.008 + strain * 0.045;
        if (amp > 0.012 || sh > 0.2) breath(out, amp, wetChest, strain);
      }

      /* Symptoms, on their own clock. A cough is not every frame — it is
         a handful of times an hour when it is mild and constantly when
         it is not. */
      symptomClock -= dt;
      if (symptomClock <= 0) {
        const sym = ctx.player.disease ? ctx.player.disease.observedSymptoms() : [];
        wetChest = 0;
        let did = false;
        for (const sm of sym) {
          if (sm.id === 'productiveCough' || sm.id === 'cough') {
            wetChest = sm.id === 'productiveCough' ? Math.min(1, sm.severity + 0.3) : sm.severity * 0.3;
            if (Math.random() < 0.5 + sm.severity * 0.4) { cough(sm.id === 'productiveCough'); did = true; }
          } else if (sm.id === 'vomiting' && Math.random() < 0.35 + sm.severity * 0.4) {
            retch(); did = true;
          } else if ((sm.id === 'nausea' || sm.id === 'cramps') && Math.random() < 0.12) {
            grunt(0.3 + sm.severity * 0.3); did = true;
          }
          if (did) break;
        }
        // Worse illness, less time between.
        const worst = sym.length ? sym[0].severity : 0;
        symptomClock = did ? (6 + Math.random() * 16) * (1 - worst * 0.6)
          : 4 + Math.random() * 8;
      }

      /* Pain that has just got worse gets a noise. Pain that is merely
         constant does not, because a body stops announcing it. */
      painClock -= dt;
      const pain = inj.pain || 0;
      if (pain > lastPain + 0.08 && painClock <= 0) { grunt(Math.min(1, pain)); painClock = 2.5; }
      lastPain = lastPain + (pain - lastPain) * Math.min(1, dt * 0.5);
    }
    let breathCount = 0;
    let wetChest = 0;

    /* ---- per-frame ------------------------------------------------------ */
    ctx.onUpdate((dt) => {
      const g = ensureGraph();
      if (!g) return;
      const env = ctx.world.clock.environment();
      const px = ctx.player.x, pz = ctx.player.z;

      // Wind: loudness with the cube of speed is roughly how it reads, and
      // the filter opens up as it gets stronger because it starts to whistle.
      const w = Math.min(1, env.windMs / 16);
      g.windGain.gain.value = 0.02 + w * w * 0.16;
      g.windFilter.frequency.value = 260 + w * 900;

      // Rain, straight off the precipitation rate in mm/h.
      const rain = Math.min(1, (env.precipitation || 0) / 8);
      g.rainGain.gain.value = rain * 0.20 * (ctx.state.buildingAt ? 0.45 : 1);

      // Surf: the sea is at the island's edge, so this is a distance to it.
      const half = (ctx.world.map.worldSizeM || 4000) / 2;
      const toEdge = half - Math.max(Math.abs(px), Math.abs(pz));
      const elevation = ctx.groundY(px, pz);
      const surf = Math.max(0, 1 - Math.max(toEdge, elevation * 6) / 220);
      g.surfGain.gain.value = surf * 0.12;

      // Fire, from whichever fire is nearest and lit.
      let fireHeat = 0;
      for (const f of ctx.world.fires || []) {
        if (!f.lit) continue;
        fireHeat = Math.max(fireHeat, 1 - Math.min(1, Math.hypot(f.x - px, f.z - pz) / 12));
      }
      g.fireGain.gain.value = fireHeat * 0.14;
      g.fireFilter.frequency.value = 500 + Math.sin(performance.now() * 0.002) * 200;

      bodySounds(dt, ctx.player.body.status(ctx.world.clock.hourOfDay));

      // Footsteps.
      const speed = ctx.player.speedMs || 0;
      if (speed > 0.4 && !ctx.state.uiOpen) {
        // Stride length grows with speed: about 0.75 m walking, 1.4 running.
        const stride = 0.75 + Math.min(0.7, speed * 0.12);
        stepPhase += (speed * dt) / stride;
        if (stepPhase >= 1) {
          stepPhase -= 1;
          const biome = ctx.biomeAt(px, pz);
          const spec = STEP[biome ? biome.id : 'meadow'] || STEP.meadow;
          footstep(spec, speed > 4);
        }
      } else stepPhase = 0.5;

      ambientCall(dt);
      try { heartbeat(dt, ctx.player.body.status(ctx.world.clock.hourOfDay)); } catch (e) { /* status can throw while dead */ }
    });

    /* ---- one-shots ------------------------------------------------------ */
    ctx.on('chop', () => {
      const g = ensureGraph();
      if (!g) return;
      const ac = g.ac, now = ac.currentTime;
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280 + Math.random() * 80, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
      const gg = ac.createGain();
      gg.gain.setValueAtTime(0.2, now);
      gg.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc.connect(gg).connect(A.master);
      osc.start(now); osc.stop(now + 0.22);
    });

    ctx.on('fire-lit', () => A.tone(220, 0.3, 'sawtooth', 0.08));
    ctx.on('fish-landed', () => { A.splash(0.7); A.tone(880, 0.09, 'sine', 0.1); });
    ctx.on('crafted', () => A.tone(660, 0.08, 'sine', 0.09));
    ctx.on('pickup', () => A.tone(880, 0.05, 'sine', 0.07));
    ctx.on('death', () => {
      const g = ensureGraph();
      if (!g) return;
      const ac = g.ac, now = ac.currentTime;
      // Everything fades out, which is the only honest sound for it.
      for (const gain of [g.windGain, g.rainGain, g.fireGain, g.surfGain]) {
        gain.gain.setTargetAtTime(0, now, 1.2);
      }
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 3);
      const gg = ac.createGain();
      gg.gain.setValueAtTime(0.18, now);
      gg.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);
      osc.connect(gg).connect(A.master);
      osc.start(now); osc.stop(now + 3.3);
    });
  },
});
