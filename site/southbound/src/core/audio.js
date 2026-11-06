// Procedural audio: engine, wind/ambience, birds by day, crickets by night,
// impacts and horn. No audio files needed.
export class GameAudio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
  }
  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.master);
    this.applyVolumes();

    // engine: two detuned oscillators through a low-pass
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 600;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    this.osc1.connect(this.engFilter); this.osc2.connect(g2); g2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.sfx);
    this.osc1.start(); this.osc2.start();

    // noise bed for wind / road / water
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6; }
    this.noiseBuf = buf;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 400; this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.15;
    src.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.amb);
    src.start();

    // horn
    this.horn = ctx.createOscillator(); this.horn.type = 'square'; this.horn.frequency.value = 415;
    this.hornGain = ctx.createGain(); this.hornGain.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1400;
    this.horn.connect(hf); hf.connect(this.hornGain); this.hornGain.connect(this.sfx);
    this.horn.start();
    this.nextChirp = 0;
  }
  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.masterVolume;
    this.sfx.gain.value = s.sfxVolume;
    this.amb.gain.value = s.ambienceVolume;
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  update(dt, st) {
    // st: {driving, speed, throttle, night, wind, horn, impact}
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = Math.abs(st.speed || 0);
    if (st.driving) {
      const gear = Math.min(5, Math.floor(sp / 11));
      const rpm = 0.25 + ((sp - gear * 11) / 11) * 0.6 + st.throttle * 0.15;
      const f = 38 + rpm * 70 + gear * 6;
      this.osc1.frequency.setTargetAtTime(f, t, 0.05);
      this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      this.engFilter.frequency.setTargetAtTime(350 + rpm * 900 + st.throttle * 600, t, 0.08);
      this.engGain.gain.setTargetAtTime(0.10 + st.throttle * 0.08, t, 0.1);
    } else this.engGain.gain.setTargetAtTime(0, t, 0.2);
    this.hornGain.gain.setTargetAtTime(st.horn ? 0.12 : 0, t, 0.02);
    const wind = 0.05 + Math.min(sp / 40, 1) * 0.25 + (st.wind || 0) * 0.1;
    this.windGain.gain.setTargetAtTime(wind, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(300 + sp * 18, t, 0.3);
    if (st.impact > 2) this.thud(Math.min(st.impact / 15, 1));
    // rain hiss and thunder
    if ((st.rain || 0) > 0.01 && !this.rainGain) {
      const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
      this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
      src.connect(hp); hp.connect(lp); lp.connect(this.rainGain); this.rainGain.connect(this.amb); src.start();
    }
    if (this.rainGain) this.rainGain.gain.setTargetAtTime((st.rain || 0) * 0.22, t, 0.8);
    if (st.thunder) this.thunder();

    // birds by day, crickets by night (only outside the city)
    this.nextChirp -= dt;
    if (this.nextChirp <= 0 && st.nature) {
      this.nextChirp = 0.6 + Math.random() * 2.5;
      if (st.night > 0.5) this.cricket(); else this.bird();
    }
  }
  bird() {
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    const f0 = 2200 + Math.random() * 2200;
    o.frequency.setValueAtTime(f0, t);
    for (let i = 1; i <= 3; i++) o.frequency.linearRampToValueAtTime(f0 * (0.8 + Math.random() * 0.5), t + i * 0.07);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.02); g.gain.linearRampToValueAtTime(0, t + 0.25);
    o.connect(g); g.connect(this.amb); o.start(t); o.stop(t + 0.3);
  }
  cricket() {
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 4400 + Math.random() * 300;
      const s = t + i * 0.09;
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.012, s + 0.01); g.gain.linearRampToValueAtTime(0, s + 0.05);
      o.connect(g); g.connect(this.amb); o.start(s); o.stop(s + 0.06);
    }
  }
  // every gun sounds like itself: a crack, a boom, a tail and an echo shaped by
  // its calibre and action, plus a small fingerprint per gun model
  shotSig(w) {
    if (!w) return null;
    if (w._sig) return w._sig;
    let h = 0; for (const c of w.id || '') h = (h * 31 + c.charCodeAt(0)) | 0;
    const j = (k, n = 0) => 1 + ((((h >> n) & 1023) / 1023) - 0.5) * k;
    const p = w.platform || '', cal = w.caliber || '';
    let s = { crack: 6500, boom: 170, boomGain: 0.6, tail: 0.25, snap: 0, gain: 0.9, kind: 'gun' };
    if (w.cat === 'pistol') s = /magnum|\.357|\.44/.test(p + cal) ? { crack: 5000, boom: 110, boomGain: 0.95, tail: 0.45, snap: 0.2, gain: 1.05 } : p === 'machine' ? { crack: 7200, boom: 190, boomGain: 0.5, tail: 0.18, snap: 0, gain: 0.85 } : { crack: 6600, boom: 165, boomGain: 0.62, tail: 0.24, snap: 0.1, gain: 0.9 };
    else if (w.cat === 'shotgun') s = { crack: 3400, boom: 78, boomGain: 1.15, tail: 0.6, snap: 0, gain: 1.15 };
    else if (w.cat === 'sniper') s = { crack: 6000, boom: 68, boomGain: 1.2, tail: 1.1, snap: 0.45, gain: 1.35 };
    else if (w.cat === 'marksman') s = { crack: 6800, boom: 92, boomGain: 1.0, tail: 0.75, snap: 0.35, gain: 1.15 };
    else if (w.cat === 'launcher') s = { kind: 'launch', crack: 1800, boom: 60, boomGain: 1.2, tail: 0.9, snap: 0, gain: 1.3 };
    else if (w.cat === 'bow') s = { kind: 'bow', crack: 2500, boom: 220, boomGain: 0.3, tail: 0.15, snap: 0, gain: 0.5 };
    else if (/pdw|smg/.test(p)) s = { crack: 7200, boom: 185, boomGain: 0.5, tail: 0.2, snap: 0.05, gain: 0.85 };
    else if (/battle|dmr/.test(p) || /7\.62|\.308/.test(cal)) s = { crack: 7000, boom: 95, boomGain: 0.95, tail: 0.7, snap: 0.4, gain: 1.15 };
    else s = { crack: 9000, boom: 128, boomGain: 0.75, tail: 0.55, snap: 0.5, gain: 1.0 }; // 5.56 carbines
    s.crack *= j(0.25); s.boom *= j(0.3, 3); s.tail *= j(0.25, 6); s.boomGain *= j(0.2, 2);
    s.kind = s.kind || 'gun'; s.silent = !!w.silent;
    w._sig = s;
    return s;
  }
  gunshot(vol = 1, w = null) {
    if (!this.ctx) return;
    const sig = this.shotSig(w);
    if (sig) return this.shot(vol, sig);
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.sfx); src.start(t, Math.random()); src.stop(t + 0.4);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    og.gain.setValueAtTime(0.7 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(og); og.connect(this.sfx); o.start(t); o.stop(t + 0.16);
  }
  shot(vol, s) {
    const ctx = this.ctx, t = ctx.currentTime, out = this.sfx;
    const echo = this.env === 'city' ? [0.11, 0.35] : this.env === 'indoors' ? [0.04, 0.5] : [0.32, 0.2];
    const burst = (at, v, crack, tail) => {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(crack, at); f.frequency.exponentialRampToValueAtTime(260, at + tail);
      const g = ctx.createGain(); g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(0.001, at + tail + 0.08);
      src.connect(f); f.connect(g); g.connect(out); src.start(at, Math.random()); src.stop(at + tail + 0.1);
    };
    const boom = (at, v, f0, dur) => {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(f0 * 1.5, at); o.frequency.exponentialRampToValueAtTime(Math.max(25, f0 * 0.35), at + dur);
      og.gain.setValueAtTime(v, at); og.gain.exponentialRampToValueAtTime(0.001, at + dur + 0.03);
      o.connect(og); og.connect(out); o.start(at); o.stop(at + dur + 0.05);
    };
    if (s.kind === 'bow') {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(s.boom, t); o.frequency.exponentialRampToValueAtTime(s.boom * 0.7, t + 0.15);
      og.gain.setValueAtTime(0.35 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.2);
      burst(t + 0.02, 0.12 * vol, 3000, 0.12); return;
    }
    if (s.silent) { burst(t, 0.3 * vol, 1100, 0.12); boom(t, 0.25 * vol, s.boom * 0.8, 0.08); return; }
    const v = s.gain * vol;
    burst(t, 0.9 * v, s.crack, s.tail);
    boom(t, s.boomGain * 0.75 * v, s.boom, s.kind === 'launch' ? 0.35 : 0.14);
    if (s.snap) { const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3600; bp.Q.value = 2; const g = ctx.createGain(); g.gain.setValueAtTime(s.snap * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03); src.connect(bp); bp.connect(g); g.connect(out); src.start(t); src.stop(t + 0.04); }
    if (s.kind === 'launch') burst(t + 0.05, 0.4 * v, 1500, 0.8);
    // the echo off buildings, or rolling across open country
    burst(t + echo[0], echo[1] * 0.5 * v, s.crack * 0.35, s.tail * 1.6);
  }
  siren(level) {
    if (!this.ctx) return;
    if (!this.sirenOsc) {
      const ctx = this.ctx;
      this.sirenOsc = ctx.createOscillator(); this.sirenOsc.type = 'triangle';
      this.sirenLfo = ctx.createOscillator(); this.sirenLfo.frequency.value = 0.55;
      const depth = ctx.createGain(); depth.gain.value = 330;
      this.sirenLfo.connect(depth); depth.connect(this.sirenOsc.frequency);
      this.sirenOsc.frequency.value = 980;
      this.sirenGain = ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.sfx);
      this.sirenOsc.start(); this.sirenLfo.start();
    }
    this.sirenGain.gain.setTargetAtTime(level * level * 0.09, this.ctx.currentTime, 0.2);
  }
  // fire alarm horn: call every frame with 0..1 (the caller makes the temporal-3 pattern)
  alarm(level) {
    if (!this.ctx) return;
    if (!this.alarmGain) {
      const ctx = this.ctx;
      this.alarmGain = ctx.createGain(); this.alarmGain.gain.value = 0;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2900; bp.Q.value = 1.4;
      for (const f of [2950, 3120]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(bp); o.start(); }
      const lo = ctx.createOscillator(); lo.type = 'sawtooth'; lo.frequency.value = 520; const lg = ctx.createGain(); lg.gain.value = 0.35; lo.connect(lg); lg.connect(this.alarmGain); lo.start();
      bp.connect(this.alarmGain); this.alarmGain.connect(this.sfx);
    }
    this.alarmGain.gain.setTargetAtTime(level * 0.06, this.ctx.currentTime, 0.015);
  }
  thunder() {
    const ctx = this.ctx, t = ctx.currentTime + 0.4 + Math.random() * 2.5;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    src.connect(lp); lp.connect(g); g.connect(this.amb); src.start(t); src.stop(t + 4.6);
  }

  // a dry trigger: the hammer falls on nothing
  click(k = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2400;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(f); f.connect(g); g.connect(this.sfx); src.start(t); src.stop(t + 0.05);
  }
  // One footstep on any substrate, from its acoustic signature (core/substrate.js): a heel strike
  // of filtered noise at the surface's pitch, a ring for metal and glass, a hollow knock for wood,
  // grains of crunch for gravel, leaves and sand, and softness that rounds it all off on fabric,
  // grass and mud. k: how hard (walk 0.5, run 1).
  footstep(sub, k = 0.7, wet = 0) {
    if (!this.ctx || !sub?.step) return;
    const ctx = this.ctx, t = ctx.currentTime + Math.random() * 0.01;
    const [pitch, ring, ringAmt, crunch, soft] = sub.step;
    const vol = 0.1 * k * (1 - soft * 0.45), p = pitch * (0.9 + Math.random() * 0.2);
    const out = ctx.createGain(); out.gain.value = 1; out.connect(this.sfx);
    // the strike
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.playbackRate.value = 1.6 + Math.random() * 0.6;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = p; bp.Q.value = 0.8 + ringAmt * 3;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000 * (1 - soft * 0.8);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004 + soft * 0.012);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.05 + soft * 0.06);
    src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(out);
    src.start(t, Math.random() * 1.5); src.stop(t + 0.15);
    // metal and glass ring on; wood and hollow floors knock
    if (ringAmt > 0.05) {
      for (const [m, a] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = p * m * (0.98 + Math.random() * 0.04);
        const og = ctx.createGain(); og.gain.setValueAtTime(vol * ringAmt * 0.35 * a, t); og.gain.exponentialRampToValueAtTime(0.0005, t + ring * (1.2 - m * 0.12));
        o.connect(og); og.connect(out); o.start(t); o.stop(t + ring * 1.3);
      }
    }
    if (sub.wear === 3 || sub.wear === 4) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.06);
      const og = ctx.createGain(); og.gain.setValueAtTime(vol * 0.8, t); og.gain.exponentialRampToValueAtTime(0.0005, t + 0.08);
      o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.1);
    }
    // gravel, leaves, sand, broken glass: a scatter of tiny grains after the strike
    const grains = Math.round(crunch * 7);
    for (let i = 0; i < grains; i++) {
      const tt = t + 0.008 + Math.random() * 0.07;
      const s2 = ctx.createBufferSource(); s2.buffer = this.noiseBuf; s2.playbackRate.value = 3;
      const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = p * (1.5 + Math.random() * 2.5); hp.Q.value = 2;
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(vol * 0.5 * crunch, tt); g2.gain.exponentialRampToValueAtTime(0.0005, tt + 0.012);
      s2.connect(hp); hp.connect(g2); g2.connect(out); s2.start(tt, Math.random() * 1.5); s2.stop(tt + 0.02);
    }
    // wet ground: a little slap and suck on top
    if (wet > 0.2 && sub.hardness > 0) {
      const s3 = ctx.createBufferSource(); s3.buffer = this.noiseBuf; s3.playbackRate.value = 0.8;
      const f3 = ctx.createBiquadFilter(); f3.type = 'bandpass'; f3.frequency.value = 1200; f3.Q.value = 1.5;
      const g3 = ctx.createGain(); g3.gain.setValueAtTime(vol * 0.6 * wet, t + 0.01); g3.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
      s3.connect(f3); f3.connect(g3); g3.connect(out); s3.start(t + 0.01, Math.random()); s3.stop(t + 0.14);
    }
  }
  thud(k) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(f); f.connect(g); g.connect(this.sfx); src.start(t); src.stop(t + 0.45);
  }
}
