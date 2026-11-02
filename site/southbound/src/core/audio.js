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
  gunshot(vol = 1) {
    if (!this.ctx) return;
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
  thunder() {
    const ctx = this.ctx, t = ctx.currentTime + 0.4 + Math.random() * 2.5;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    src.connect(lp); lp.connect(g); g.connect(this.amb); src.start(t); src.stop(t + 4.6);
  }

  thud(k) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(f); f.connect(g); g.connect(this.sfx); src.start(t); src.stop(t + 0.45);
  }
}
