// Procedural WebAudio sound effects — no audio files needed.

export class AudioSys {
  constructor() { this.ctx = null; this.volume = 0.7; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      this.comp = ctx.createDynamicsCompressor();
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.comp);
      this.comp.connect(ctx.destination);
      const len = ctx.sampleRate * 1.5;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _out(pan) {
    if (!pan || !this.ctx.createStereoPanner) return this.master;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    return p;
  }

  _noise(dur, type, freq, gain, pan = 0, q = 0.7, delay = 0) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(this._out(pan));
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  _tone(f0, f1, dur, type, gain, pan = 0, delay = 0) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this._out(pan));
    o.start(t); o.stop(t + dur + 0.05);
  }

  shot(ammo, dist = 0, pan = 0, own = false) {
    if (!this.ctx) return;
    const v = 1 / (1 + dist / 22);
    if (v < 0.03) return;
    const far = 1 / (1 + dist / 60);
    const base = ammo === 'sniper' ? 5200 : ammo === 'shell' ? 2200 : ammo === 'pistol' ? 3400 : 4200;
    const dur = ammo === 'sniper' ? 0.5 : ammo === 'shell' ? 0.38 : 0.2;
    this._noise(dur * (1 + dist / 120), 'lowpass', base * far + 250, 0.9 * v, pan);
    if (own || dist < 30) this._tone(ammo === 'shell' || ammo === 'sniper' ? 120 : 170, 40, 0.14, 'sine', 0.9 * v, pan);
    if (dist > 60) this._noise(0.8, 'lowpass', 500, 0.25 * v, pan, 0.7, 0.06);
  }

  hit(head, armor) {
    if (!this.ctx) return;
    if (armor) this._tone(2400, 1800, 0.06, 'square', 0.12);
    else this._tone(head ? 1800 : 1300, head ? 1500 : 900, 0.05, 'triangle', head ? 0.35 : 0.2);
  }
  kill() { if (this.ctx) { this._tone(900, 700, 0.08, 'square', 0.12); this._tone(1350, 1100, 0.12, 'square', 0.1, 0, 0.07); } }
  armorBreak() { if (this.ctx) { this._noise(0.25, 'highpass', 3000, 0.4); this._tone(500, 200, 0.2, 'sawtooth', 0.12); } }
  hurt() { if (this.ctx) this._tone(160, 70, 0.18, 'sawtooth', 0.22); }
  dry() { if (this.ctx) this._tone(900, 700, 0.03, 'square', 0.12); }
  reload(t = 1.5) {
    if (!this.ctx) return;
    this._noise(0.05, 'bandpass', 1800, 0.35, 0, 3);
    this._noise(0.05, 'bandpass', 1300, 0.35, 0, 3, t * 0.45);
    this._noise(0.06, 'bandpass', 2200, 0.45, 0, 3, t * 0.85);
  }
  swap() { if (this.ctx) this._noise(0.08, 'bandpass', 1500, 0.3, 0, 2); }
  pickup() { if (this.ctx) { this._tone(600, 900, 0.07, 'triangle', 0.2); } }
  cash() { if (this.ctx) { this._tone(1200, 1250, 0.06, 'triangle', 0.18); this._tone(1600, 1650, 0.08, 'triangle', 0.15, 0, 0.06); } }
  plate() { if (this.ctx) { this._noise(0.12, 'bandpass', 900, 0.5, 0, 2); this._noise(0.1, 'bandpass', 2600, 0.3, 0, 4, 0.12); } }
  geiger() { if (this.ctx) this._noise(0.012, 'highpass', 4000, 0.4); }
  ui() { if (this.ctx) this._tone(700, 760, 0.04, 'triangle', 0.12); }
  alert() { if (this.ctx) { this._tone(880, 880, 0.12, 'square', 0.12); this._tone(660, 660, 0.18, 'square', 0.12, 0, 0.14); } }
  success() { if (this.ctx) [523, 659, 784, 1046].forEach((f, i) => this._tone(f, f, 0.25, 'triangle', 0.2, 0, i * 0.11)); }
  step(v = 0.08) { if (this.ctx) this._noise(0.06, 'lowpass', 420, v); }

  startHeli() {
    if (!this.ctx) return { set() {}, stop() {} };
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const am = ctx.createGain(); am.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 13;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
    lfo.connect(lfoG); lfoG.connect(am.gain);
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(am); am.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    return {
      set(dist) { g.gain.setTargetAtTime(Math.min(1.2, 30 / (dist + 20)), ctx.currentTime, 0.1); },
      stop() { try { src.stop(); lfo.stop(); } catch (e) { /* already stopped */ } },
    };
  }
}
