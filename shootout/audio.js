// Shootout — all sound is generated live with the Web Audio API,
// so there are no audio files to load.
// Music intensity goes up every round: faster heartbeat, lower drone,
// more dissonance and a shrieking string layer late in the game.

const Sound = (() => {
  let ctx = null;
  let musicGain, sfxGain;
  let musicVol = 0.7, sfxVol = 0.8;
  let intensity = 0;          // 0 = calm, 1 = maximum dread
  let musicTimer = null;
  let droneNodes = [];

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    musicGain = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain.gain.value = musicVol * 0.5;
    sfxGain.gain.value = sfxVol;
    musicGain.connect(ctx.destination);
    sfxGain.connect(ctx.destination);
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function gunshot() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6000, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(lp).connect(g).connect(sfxGain);
    src.start(t);

    // low punch
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    og.gain.setValueAtTime(0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(og).connect(sfxGain);
    o.start(t); o.stop(t + 0.3);
  }

  // Dry fire: the hammer falls on a blank.
  function blank() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    for (const [off, f] of [[0, 3200], [0.05, 1800]]) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.04);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, t + off);
      g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.04);
      src.connect(bp).connect(g).connect(sfxGain);
      src.start(t + off);
    }
  }

  function impact() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(bp).connect(g).connect(sfxGain);
    src.start(t);
  }

  function cardFlick() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.08);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(hp).connect(g).connect(sfxGain);
    src.start(t);
  }

  // ---------- music ----------

  function heartbeat(t, strength) {
    for (const [offset, amp] of [[0, 1], [0.18, 0.7]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(70, t + offset);
      o.frequency.exponentialRampToValueAtTime(35, t + offset + 0.15);
      g.gain.setValueAtTime(0.0001, t + offset);
      g.gain.exponentialRampToValueAtTime(0.8 * amp * strength, t + offset + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.2);
      o.connect(g).connect(musicGain);
      o.start(t + offset); o.stop(t + offset + 0.25);
    }
  }

  function stab(t, freq, dur, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1200 + intensity * 3000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function startDrone() {
    stopDrone();
    const base = 55;
    // Root + a fifth, plus a tritone that fades in as intensity rises.
    const parts = [[base, 0.18], [base * 1.5, 0.08], [base * Math.SQRT2, 0.0]];
    for (const [f, v] of parts) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.value = v;
      o.connect(g).connect(musicGain);
      o.start();
      droneNodes.push({ o, g, baseVol: v, f });
    }
    applyIntensityToDrone();
  }

  function applyIntensityToDrone() {
    if (!ctx) return;
    const t = ctx.currentTime;
    droneNodes.forEach((n, i) => {
      // Drone sinks in pitch and the tritone creeps in.
      n.o.frequency.setTargetAtTime(n.f * (1 - intensity * 0.12), t, 1.5);
      const vol = i === 2 ? intensity * 0.12 : n.baseVol * (1 + intensity);
      n.g.gain.setTargetAtTime(vol, t, 1.5);
    });
  }

  function stopDrone() {
    droneNodes.forEach(n => { try { n.o.stop(); } catch (e) {} });
    droneNodes = [];
  }

  function startMusic() {
    if (!ensure()) return;
    stopMusic();
    startDrone();
    let next = ctx.currentTime + 0.1;
    let beat = 0;
    const minor = [220, 261.6, 293.7, 329.6, 207.7, 196];
    musicTimer = setInterval(() => {
      // Tempo: 60 bpm calm -> 150 bpm at max intensity.
      const bpm = 60 + intensity * 90;
      const step = 60 / bpm;
      while (next < ctx.currentTime + 0.3) {
        heartbeat(next, 0.4 + intensity * 0.6);
        if (intensity > 0.25 && beat % 2 === 0) {
          const f = minor[(beat / 2) % minor.length];
          stab(next, f * (intensity > 0.6 ? 0.5 : 1), step * 0.9, 0.04 + intensity * 0.06);
        }
        if (intensity > 0.7 && beat % 4 === 3) {
          // Screeching high string late in the game.
          stab(next, 1400 + Math.random() * 300, step * 1.5, 0.03);
        }
        next += step;
        beat++;
      }
    }, 100);
  }

  function stopMusic() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    stopDrone();
  }

  function setIntensity(v) {
    intensity = Math.max(0, Math.min(1, v));
    applyIntensityToDrone();
  }

  function setMusicVolume(v) {
    musicVol = v;
    if (musicGain) musicGain.gain.value = v * 0.5;
  }

  function setSfxVolume(v) {
    sfxVol = v;
    if (sfxGain) sfxGain.gain.value = v;
  }

  return { unlock, gunshot, blank, impact, cardFlick, startMusic, stopMusic, setIntensity, setMusicVolume, setSfxVolume };
})();
