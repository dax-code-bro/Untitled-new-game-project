"""Procedural SFX + music prototypes for Dragon's Kingdom S01E01 (all original, no samples).

numpy + scipy only. 48 kHz, stereo, 24-bit WAV. Fixed seeds -> identical output every run.
Writes ./sfx/*.wav. Every sound is built from noise, sine/additive oscillators,
filters and synthetic reverb, so there is nothing to license.
"""
import numpy as np
import soundfile as sf
from pathlib import Path
from scipy import signal

SR = 48000
OUT = Path(__file__).resolve().parent / "sfx"
OUT.mkdir(exist_ok=True)


# ---------------------------------------------------------------- helpers
def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def bp(x, lo, hi, order=4):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lp(x, fc, order=4):
    return signal.sosfilt(signal.butter(order, fc, btype="low", fs=SR, output="sos"), x)


def hp(x, fc, order=4):
    return signal.sosfilt(signal.butter(order, fc, btype="high", fs=SR, output="sos"), x)


def pink(n, rng):
    """1/f noise by spectral shaping (unit RMS)."""
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    x = np.fft.irfft(X / np.sqrt(f), n)
    return x / (np.std(x) + 1e-12)


def env_ad(n, attack, decay, shape=2.0):
    """Attack/decay envelope over n samples (seconds)."""
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1) ** shape
    d = np.exp(-np.clip(t - attack, 0, None) / max(decay, 1e-4))
    return a * d


def smooth_random(n, rate_hz, rng):
    """Smooth random control curve in [0,1] with features at ~rate_hz."""
    # Cubic spline through random control points: O(n). (A direct np.convolve with a
    # multi-second window here cost ~10^11 operations - do not go back to that.)
    from scipy.interpolate import CubicSpline
    k = max(4, int(n / SR * rate_hz) + 4)
    pts = rng.random(k)
    xs = np.linspace(0, n - 1, k)
    c = CubicSpline(xs, pts, bc_type="natural")(np.arange(n))
    c -= c.min()
    return c / (c.max() + 1e-12)


def stft_shape(x, gain_fn, nper=2048):
    """Time-varying spectral shaping: gain_fn(freqs, times) -> (F,T) gain."""
    f, tt, Z = signal.stft(x, fs=SR, nperseg=nper, noverlap=nper * 3 // 4)
    Z = Z * gain_fn(f, tt)
    _, y = signal.istft(Z, fs=SR, nperseg=nper, noverlap=nper * 3 // 4)
    y = y[: len(x)]
    return np.pad(y, (0, len(x) - len(y)))


def band_gain(f, centre, width_oct):
    """Gaussian band in log-frequency (octaves)."""
    lf = np.log2(np.maximum(f, 1.0))[:, None]
    return np.exp(-0.5 * ((lf - np.log2(centre)) / width_oct) ** 2)


def damped(freq, decay, dur, phase=0.0):
    t = t_axis(dur)
    return np.sin(2 * np.pi * freq * t + phase) * np.exp(-t / decay)


def place(buf, x, at):
    i = int(at * SR)
    j = min(len(buf), i + len(x))
    if j > i:
        buf[i:j] += x[: j - i]


def reverb_ir(rt60, dur, rng, lp_start=9000, lp_end=1500, predelay=0.01, early=6):
    """Synthetic stereo IR: early reflections + decaying noise that darkens over time."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    decay = np.exp(-6.91 * t / rt60)
    for ch in range(2):
        nz = rng.standard_normal(n) * decay
        # darken the tail: crossfade a bright and a dark version
        dark = lp(nz, lp_end, 2)
        bright = lp(nz, lp_start, 2)
        mix = np.clip(t / (rt60 * 0.5), 0, 1)
        tail = bright * (1 - mix) + dark * mix
        ir[:, ch] = tail
        for _ in range(early):
            k = int((predelay + rng.random() * 0.03) * SR)
            ir[k, ch] += (0.4 + 0.4 * rng.random()) * (1 if rng.random() > 0.5 else -1)
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True)) + 1e-12
    return ir


def apply_reverb(st, ir, wet):
    out = np.zeros((st.shape[0] + ir.shape[0] - 1, 2))
    for ch in range(2):
        out[:, ch] = signal.fftconvolve(st[:, ch], ir[:, ch])
    dry = np.zeros_like(out)
    dry[: st.shape[0]] = st
    return dry * (1 - wet) + out * wet


def pan(mono, p):
    """Equal-power pan; p in [-1 (L), +1 (R)], scalar or per-sample array."""
    a = (np.asarray(p) + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)], axis=1)


def finish(name, st, peak_db=-1.0, fade_out=0.05):
    st = np.asarray(st, dtype=np.float64)
    if st.ndim == 1:
        st = np.stack([st, st], axis=1)
    n_f = int(fade_out * SR)
    if n_f:
        st[-n_f:] *= np.linspace(1, 0, n_f)[:, None]
    st = hp(st.T, 18, 2).T  # remove DC / subsonic rumble
    st *= 10 ** (peak_db / 20) / (np.max(np.abs(st)) + 1e-12)
    sf.write(str(OUT / f"{name}.wav"), st.astype(np.float32), SR, subtype="PCM_24")
    return st


# ---------------------------------------------------------------- 1. Charcoal: immense, infrequent wingbeat
def big_wingbeat(rng, scale=1.0, with_upstroke=True):
    """One downstroke (+ optional upstroke) of an immense wing. ~2.4 s."""
    dur = 2.6
    n = int(dur * SR)
    out = np.zeros((n, 2))
    # (a) pressure push: 34 Hz body + harmonics so small speakers still 'hear' it
    tt = t_axis(1.2)
    e = env_ad(len(tt), 0.28, 0.32, 1.5)
    f0 = 34 * scale
    push = (0.6 * np.sin(2 * np.pi * f0 * tt) + 0.55 * np.sin(2 * np.pi * 2 * f0 * tt + 0.3)
            + 0.35 * np.sin(2 * np.pi * 3 * f0 * tt + 1.1) + 0.2 * np.sin(2 * np.pi * 4 * f0 * tt + 2.0)) * e
    push += 0.6 * lp(rng.standard_normal(len(tt)), 110, 4) * e * 4
    place(out[:, 0], push, 0.0); place(out[:, 1], push, 0.0)
    # (b) displaced-air whoosh, centre sweeps up then down through the stroke
    m = int(1.3 * SR)
    for ch in range(2):
        nz = pink(m, rng)
        def g(f, tt_, ch=ch):
            c = 180 + 520 * np.sin(np.pi * np.clip(tt_ / 0.9, 0, 1))  # 180 -> 700 -> 180 Hz
            lf = np.log2(np.maximum(f, 1))[:, None]
            return np.exp(-0.5 * ((lf - np.log2(c[None, :])) / 1.1) ** 2)
        w = stft_shape(nz, g) * env_ad(m, 0.32, 0.38, 2.2)
        place(out[:, ch], 1.6 * w, 0.02 + 0.004 * ch)
    # (c) membrane snaps taut at the bottom of the stroke (sail-like 'fwump')
    snap_n = int(0.12 * SR)
    sn = bp(rng.standard_normal(snap_n), 140, 2400, 2) * env_ad(snap_n, 0.004, 0.03, 1)
    sn += 0.8 * damped(88 * scale, 0.05, 0.12) * env_ad(snap_n, 0.002, 0.2, 1)
    place(out[:, 0], 0.55 * sn, 0.46); place(out[:, 1], 0.5 * sn, 0.462)
    # (d) trailing-edge flutter
    fl_n = int(0.35 * SR)
    fl = bp(rng.standard_normal(fl_n), 300, 3000, 2) * (0.5 + 0.5 * np.sin(2 * np.pi * 21 * t_axis(0.35))) * env_ad(fl_n, 0.03, 0.12)
    place(out[:, 0], 0.12 * fl, 0.5); place(out[:, 1], 0.12 * fl[::-1][::-1], 0.505)
    # (e) slower, softer upstroke, no snap
    if with_upstroke:
        m2 = int(1.1 * SR)
        for ch in range(2):
            w2 = bp(pink(m2, rng), 120, 700, 2) * env_ad(m2, 0.45, 0.35, 2.5)
            place(out[:, ch], 0.25 * w2, 1.25)
    return out


def make_charcoal_wingbeats():
    rng = np.random.default_rng(101)
    period, beats = 2.8, 3
    n = int((period * beats + 2.0) * SR)
    st = np.zeros((n, 2))
    for b in range(beats):
        x = big_wingbeat(rng, scale=1.0 + 0.03 * rng.standard_normal())
        st[int(b * period * SR): int(b * period * SR) + len(x)] += x
    st = apply_reverb(st, reverb_ir(1.2, 1.5, rng, 6000, 900), 0.12)  # open air: little reverb
    return finish("charcoal_wingbeats_immense", st, fade_out=0.8)


def make_final_wingbeat():
    """The last sound of the episode: one heavy beat carried into darkness, then silence."""
    rng = np.random.default_rng(202)
    x = big_wingbeat(rng, scale=0.92, with_upstroke=False)
    n = int(7.0 * SR)
    st = np.zeros((n, 2))
    st[int(0.3 * SR): int(0.3 * SR) + len(x)] += x
    st = apply_reverb(st, reverb_ir(4.0, 4.5, rng, 4000, 600, predelay=0.05), 0.35)[:n]
    return finish("final_heavy_wingbeat_into_silence", st, fade_out=1.5)


# ---------------------------------------------------------------- 2. Leaf: quick corrective wingbeats
def make_leaf_wingbeats():
    rng = np.random.default_rng(303)
    dur = 5.0
    n = int(dur * SR)
    st = np.zeros((n, 2))
    t, onsets = 0.15, []
    while t < dur - 0.4:
        onsets.append(t)
        if len(onsets) in (4, 8):         # quick corrections: two beats close together
            t += 0.2 + 0.02 * rng.standard_normal()
        else:
            t += 0.42 * (1 + 0.12 * rng.standard_normal())
    for o in onsets:
        m = int(0.28 * SR)
        a = 0.75 + 0.25 * rng.random()
        common = pink(m, rng)
        for ch in range(2):
            nz = 0.85 * common + 0.53 * pink(m, rng)   # mostly shared -> localisable point source
            def g(f, tt_):
                c = 600 + 900 * np.sin(np.pi * np.clip(tt_ / 0.2, 0, 1))
                lf = np.log2(np.maximum(f, 1))[:, None]
                return np.exp(-0.5 * ((lf - np.log2(c[None, :])) / 0.9) ** 2)
            w = stft_shape(nz, g, 1024) * env_ad(m, 0.07, 0.08, 1.8)
            place(st[:, ch], a * w, o + 0.0015 * ch)
        th = damped(95, 0.03, 0.12) * env_ad(int(0.12 * SR), 0.01, 0.2, 1)
        place(st[:, 0], 0.25 * a * th, o + 0.05); place(st[:, 1], 0.25 * a * th, o + 0.05)
        sn = bp(rng.standard_normal(int(0.04 * SR)), 900, 4500, 2) * env_ad(int(0.04 * SR), 0.002, 0.008, 1)
        place(st[:, 0], 0.18 * a * sn, o + 0.12); place(st[:, 1], 0.16 * a * sn, o + 0.121)
    st = apply_reverb(st, reverb_ir(0.8, 1.0, rng, 7000, 1200), 0.08)
    finish("leaf_wingbeats_quick_corrective", st, fade_out=0.3)
    return onsets


# ---------------------------------------------------------------- 3. Scout: sharp pass with crack (R -> L)
def make_scout_pass():
    rng = np.random.default_rng(404)
    dur, tc, v, d0, c = 3.2, 1.2, 85.0, 3.0, 343.0
    t = t_axis(dur)
    x_rel = v * (t - tc)
    r = np.sqrt(d0 ** 2 + x_rel ** 2)
    v_rad = v * x_rel / r                        # >0 receding
    doppler = c / (c + v_rad)                    # >1 approaching, <1 receding
    gain = (d0 / r) ** 1.15
    nz = pink(len(t), rng)
    # time-varying band: centre 1400 Hz * doppler, wider when close
    def g(f, tt_):
        dop = np.interp(tt_, t, doppler)
        gg = np.interp(tt_, t, gain)
        cen = 1100 * dop ** 2.2 + 900 * gg
        lf = np.log2(np.maximum(f, 1))[:, None]
        return np.exp(-0.5 * ((lf - np.log2(cen[None, :])) / (0.9 + 0.8 * gg[None, :])) ** 2)
    rush = stft_shape(nz, g) * gain
    # pressure crack at closest approach: bipolar N-wave + bright burst
    crack = np.zeros(len(t))
    nw = int(0.004 * SR)
    place(crack, np.concatenate([np.linspace(0, 1, nw // 4), np.linspace(1, -1, nw // 2), np.linspace(-1, 0, nw // 4)]), tc - 0.002)
    burst_n = int(0.025 * SR)
    place(crack, 0.6 * hp(rng.standard_normal(burst_n), 2500, 2) * env_ad(burst_n, 0.0005, 0.006, 1), tc)
    # turbulent wake: low gusty rumble that decays after the pass
    wake_n = int(1.8 * SR)
    wake = lp(pink(wake_n, rng), 380, 4) * env_ad(wake_n, 0.05, 0.55, 1) * (0.6 + 0.4 * smooth_random(wake_n, 9, rng))
    mono = 0.9 * rush + 0.8 * crack
    az = np.arctan2(x_rel, d0) / (np.pi / 2)   # -1 (start) .. +1 (end) over the pass
    st = pan(mono, -np.clip(az, -1, 1) * 0.95)  # pan +1 = RIGHT: enters frame RIGHT, exits LEFT
    wst = np.stack([wake * 0.55, wake * 0.5], axis=1)
    st[int(tc * SR): int(tc * SR) + wake_n] += wst[: len(st) - int(tc * SR)]
    st = apply_reverb(st, reverb_ir(0.9, 1.0, rng, 6000, 1000), 0.06)
    finish("scout_pass_sharp_crack", st, fade_out=0.3)
    return dict(tc=tc, doppler_in=float(doppler[0]), doppler_out=float(doppler[-1]))


# ---------------------------------------------------------------- 4. Wind bed (high altitude), loopable
def make_wind_bed():
    rng = np.random.default_rng(505)
    dur, xf = 20.0, 2.0
    n = int((dur + xf) * SR)
    chans = []
    for ch in range(2):
        base = lp(pink(n, rng), 1400, 2)
        gust = 0.15 + 0.85 * smooth_random(n, 0.25, rng)
        flutter = 0.85 + 0.15 * smooth_random(n, 3.0, rng)
        body = base * gust * flutter
        hiss = hp(pink(n, rng), 2500, 2) * (0.25 * gust ** 2)
        # two slowly drifting low 'moan' resonances
        moan = np.zeros(n)
        for k, (fc, depth) in enumerate(((520, 0.15), (830, 0.1))):
            drift = fc * (1 + 0.12 * (smooth_random(n, 0.1, rng) - 0.5))
            # narrow band via STFT shaping
            def g(f, tt_, drift=drift):
                cen = np.interp(tt_, np.arange(n) / SR, drift)
                lf = np.log2(np.maximum(f, 1))[:, None]
                return np.exp(-0.5 * ((lf - np.log2(cen[None, :])) / 0.05) ** 2)
            moan += depth * stft_shape(rng.standard_normal(n), g) * gust ** 1.5 * 6
        chans.append(body + hiss + moan)
    st = np.stack(chans, axis=1)
    st = hp(st.T, 18, 2).T          # filter BEFORE looping, so no filter start-up at the seam
    # make it loop: the loop start continues exactly from the loop end (crossfade the extra tail into the head)
    m = int(xf * SR)
    head, tail = st[:m].copy(), st[-m:].copy()
    fade = np.linspace(0, 1, m)[:, None]
    st = st[: int(dur * SR)].copy()
    st[:m] = head * np.sqrt(fade) + tail * np.sqrt(1 - fade)
    st *= 10 ** (-1 / 20) / np.max(np.abs(st))
    sf.write(str(OUT / "wind_bed_high_altitude_loop.wav"), st.astype(np.float32), SR, subtype="PCM_24")
    return st


# ---------------------------------------------------------------- 5. Egg: scratches then cracks
SHELL_MODES = (2150, 3380, 5100, 7300, 9800)


def shell_click(rng, amp=1.0, bright=1.0):
    n = int(0.03 * SR)
    out = np.zeros(n)
    for fm in SHELL_MODES:
        f = fm * (1 + 0.04 * rng.standard_normal())
        out += (rng.random() * bright + 0.2) * damped(f, 0.002 + 0.004 * rng.random(), 0.03, rng.random() * 6)
    return amp * out * env_ad(n, 0.0003, 0.01, 1)


def make_egg():
    rng = np.random.default_rng(606)
    dur = 5.5
    mono = np.zeros(int(dur * SR))
    # scratches from inside: stick-slip friction, small and muffled by the shell
    for s0, sl in ((0.3, 0.32), (0.95, 0.22), (1.55, 0.38)):
        t = s0
        while t < s0 + sl:
            place(mono, 0.18 * shell_click(rng, 1.0, 0.4), t)
            t += 1 / (45 + 70 * rng.random())
        nn = int(sl * SR)
        scr = bp(rng.standard_normal(nn), 1500, 6000, 2) * env_ad(nn, sl * 0.3, sl * 0.4, 1.5)
        place(mono, 0.05 * scr, s0)
    # first fine crack: accelerating chain of clicks + small knock
    def crack(t0, count, span, amp):
        times = t0 + span * (np.linspace(0, 1, count) ** 0.6)
        for tk in times:
            place(mono, amp * (0.6 + 0.4 * rng.random()) * shell_click(rng, 1.0, 1.0), tk)
        knock = damped(185, 0.05, 0.2) * env_ad(int(0.2 * SR), 0.001, 0.3, 1)
        place(mono, 0.35 * amp * knock, t0)
    crack(2.45, 9, 0.12, 0.6)
    # it stops; a pause; then a bigger break and a fragment lifting
    crack(3.65, 22, 0.26, 1.0)
    for k in range(4):
        place(mono, 0.25 * shell_click(rng, 1.0, 1.4), 4.05 + 0.07 * k + 0.03 * rng.random())
    # effortful tiny breath (hatchling) - soft filtered noise puff
    bn = int(0.5 * SR)
    place(mono, 0.04 * bp(rng.standard_normal(bn), 500, 3000, 2) * env_ad(bn, 0.15, 0.15, 1.5), 4.6)
    st = pan(mono, 0.05)
    st = apply_reverb(st, reverb_ir(0.45, 0.6, rng, 7000, 2000, 0.004), 0.18)  # small warm chamber
    finish("egg_scratch_then_crack", st, fade_out=0.3)
    return dict(scratches=[0.3, 0.95, 1.55], cracks=[2.45, 3.65])


# ---------------------------------------------------------------- 6. Charcoal breath + low growl (no speech)
def make_dragon_breath_growl():
    rng = np.random.default_rng(707)
    dur = 6.0
    n = int(dur * SR)
    mono = np.zeros(n)
    # inhale: rising airy band
    ni = int(1.8 * SR)
    inh = stft_shape(pink(ni, rng), lambda f, tt_: band_gain(f, 600, 1.2) * np.clip(tt_ / 1.8, 0, 1)[None, :] ** 1.5)
    place(mono, 0.5 * inh * env_ad(ni, 1.5, 0.2, 1.5), 0.2)
    # exhale growl: jittery glottal pulses at ~31 Hz through big, low formants
    ng = int(3.4 * SR)
    tg = np.arange(ng) / SR
    f0 = 31 * (1 + 0.03 * (smooth_random(ng, 6, rng) - 0.5)) * (1 - 0.08 * tg / tg[-1])
    ph = np.cumsum(f0) / SR
    pulses = np.zeros(ng)
    idx = np.where(np.diff(np.floor(ph)) > 0)[0]
    pulses[idx] = 1.0 + 0.25 * rng.standard_normal(len(idx))       # shimmer
    src = signal.lfilter([1], [1, -0.97], pulses)                    # glottal-ish tilt
    vt = np.zeros(ng)
    for fc, q, a in ((170, 4, 1.0), (410, 5, 0.7), (930, 6, 0.35), (2100, 7, 0.12)):
        b, aa = signal.iirpeak(fc, q, fs=SR)
        vt += a * signal.lfilter(b, aa, src)
    breath = bp(rng.standard_normal(ng), 200, 2500, 2) * 0.08
    growl = np.tanh(2.2 * (vt / (np.max(np.abs(vt)) + 1e-9))) + breath
    growl *= env_ad(ng, 0.6, 1.6, 1.5)
    place(mono, 0.9 * growl, 2.2)
    st = np.stack([mono, np.roll(mono, int(0.0006 * SR))], axis=1)
    st = apply_reverb(st, reverb_ir(1.0, 1.2, rng, 5000, 800), 0.1)
    finish("charcoal_breath_low_growl", st, fade_out=0.4)


# ---------------------------------------------------------------- 7. 10 s string pad: low sustain, restrained rise
def string_voice(freqs_t, dur, rng, n_unison=4, detune_c=7, bright=1.0, vib_start=1.0):
    """Ensemble 'string' from band-limited additive saws, chorus-detuned, with vibrato."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for u in range(n_unison):
        det = 2 ** ((detune_c * (u - (n_unison - 1) / 2) / max(1, n_unison - 1)) / 1200)
        vib_rate = 4.8 + 0.6 * rng.random()
        vib = 1 + 0.0022 * np.clip((t - vib_start) / 1.5, 0, 1) * np.sin(2 * np.pi * vib_rate * t + rng.random() * 6)
        f = freqs_t * det * vib
        ph = 2 * np.pi * np.cumsum(f) / SR + rng.random() * 6
        fmax = np.max(f)
        nh = int(min(60, 14000 / fmax))
        for h in range(1, nh + 1):
            roll = (1 / h) * np.exp(-h * fmax / (3500 * bright))   # bowed-string tilt
            out += roll * np.sin(h * ph)
    out /= n_unison
    bow = bp(rng.standard_normal(n), 1800, 6000, 2) * 0.012     # bow hair noise
    return out + bow


def note_curve(notes, dur, glide=0.07):
    """notes: [(start_s, hz)] -> per-sample frequency with short portamento."""
    n = int(dur * SR)
    f = np.full(n, notes[0][1], dtype=np.float64)
    for (s, hz), nxt in zip(notes, notes[1:] + [(dur, None)]):
        i0 = int(s * SR)
        f[i0:] = hz
    w = int(glide * SR)
    return np.convolve(np.pad(f, (w, w), mode="edge"), np.ones(w) / w, mode="same")[w:-w]


def make_string_pad():
    rng = np.random.default_rng(808)
    dur = 10.0
    n = int(dur * SR)
    t = np.arange(n) / SR
    mix = np.zeros((n, 2))
    D2, A2, D3, F3, A3, D4, E4, F4 = 73.42, 110.0, 146.83, 174.61, 220.0, 293.66, 329.63, 349.23
    # low sustained tone: basses + cellos on D2/A2, slow 2 s swell
    low = string_voice(np.full(n, D2), dur, rng, 5, 6, 0.8) + 0.7 * string_voice(np.full(n, A2), dur, rng, 4, 6, 0.9)
    low *= np.clip(t / 2.2, 0, 1) ** 2
    mix += pan(low, -0.15)
    # violas: D3 + F3 (minor colour) enter at 3.5 s, very soft
    vio = string_voice(np.full(n, D3), dur, rng, 4, 8, 1.0, 4.0) + 0.8 * string_voice(np.full(n, F3), dur, rng, 4, 8, 1.0, 4.0)
    vio *= np.clip((t - 3.5) / 2.0, 0, 1) ** 2 * 0.35
    mix += pan(vio, 0.2)
    # restrained rising theme (violins): A3 -> D4 -> E4 -> F4, held, unresolved
    theme_notes = [(5.0, A3), (6.5, D4), (7.6, E4), (8.6, F4)]
    th = string_voice(note_curve(theme_notes, dur), dur, rng, 6, 10, 1.2, 5.3)
    env = np.zeros(n)
    for (s, _), nxt in zip(theme_notes, theme_notes[1:] + [(dur, None)]):
        i0, i1 = int(s * SR), int(nxt[0] * SR)
        seg = np.arange(i1 - i0) / SR
        env[i0:i1] = np.maximum(env[i0:i1], np.clip(seg / 0.35, 0, 1) ** 1.5 * (0.8 + 0.2 * np.exp(-seg / 0.8)))
    env = np.convolve(env, np.hanning(int(0.08 * SR)) / np.hanning(int(0.08 * SR)).sum(), mode="same")
    th *= env * 0.42
    mix += pan(th, 0.05)
    # gentle body EQ: soften the top, slight low-mid warmth
    mix = lp(mix.T, 6500, 2).T
    mix = apply_reverb(mix, reverb_ir(3.2, 3.5, rng, 5500, 1200, 0.03, 10), 0.32)[:n]
    fade = np.ones(n); fade[-int(1.6 * SR):] = np.linspace(1, 0, int(1.6 * SR)) ** 1.5
    mix *= fade[:, None]
    return finish("music_sketch_low_strings_rising_theme_10s", mix, peak_db=-3.0, fade_out=0.0), theme_notes


if __name__ == "__main__":
    import json, sys, time
    only = set(sys.argv[1:])
    if only:   # regenerate selected items only
        t0 = time.perf_counter()
        if "charcoal" in only: make_charcoal_wingbeats(); make_final_wingbeat()
        if "wind" in only: make_wind_bed()
        if "leaf" in only: print("leaf onsets", [round(o, 3) for o in make_leaf_wingbeats()])
        print("partial synth", round(time.perf_counter() - t0, 1), "s"); sys.exit(0)
    t0 = time.perf_counter()
    info = {}
    make_charcoal_wingbeats(); info["charcoal_period_s"] = 2.8
    make_final_wingbeat()
    info["leaf_onsets_s"] = [round(o, 3) for o in make_leaf_wingbeats()]
    info["scout"] = make_scout_pass()
    make_wind_bed()
    info["egg"] = make_egg()
    make_dragon_breath_growl()
    _, notes = make_string_pad(); info["theme_notes"] = notes
    info["synth_wall_s"] = round(time.perf_counter() - t0, 1)
    json.dump(info, open(OUT / "synth_info.json", "w"), indent=1)
    print(json.dumps(info))
