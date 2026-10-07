#!/usr/bin/env python3
"""sfx_lib.py - procedural sound effects and ambience beds for the S01E01 preview soundtrack.

Everything here is synthesized from noise, oscillators, modal resonators, filters and
synthetic reverb (numpy + scipy). Nothing is sampled, so there is nothing to license:
the sounds are original work of this project. Grown out of
../../tools/audio-prototypes/sfx_synth.py (same building blocks; re-timed to the animation,
more layers, distance and perspective control, and every sound the EDL asks for).

Conventions
  * 48 kHz float64. A generator returns (signal, sync_s): mono (n,) or stereo (n, 2), and the
    time inside the signal that must land on the EDL cue frame (e.g. a crack or a footfall).
  * Every generator takes a numpy Generator `rng`; build_soundtrack.py seeds it from the cue
    id (rng_for), so the whole soundtrack is reproducible bit for bit.
  * Level reference: generators return their "active" RMS at -20 dBFS (norm_active), the same
    level the dialogue takes are normalized to, so a cue gain of 0 dB means "as loud as a
    line of dialogue" and the mix gains in soundtrack_shots.py read as offsets from dialogue.
  * Many sounds are procedural stand-ins for foley that should later be recorded
    (audio-plan.md "Fun free foley"). soundtrack.json marks which.

Run directly to render every generator to a scratch folder with measurements:
  python -I sfx_lib.py <out_dir>
"""
import functools
import json
import sys
import zlib
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.fft import irfft, next_fast_len, rfft, rfftfreq

SR = 48000
FPS = 24
SPF = SR // FPS            # 2000 samples per video frame
SEED_BASE = 20261008
REF_DB = -20.0             # dialogue speech level (vo/takes.json): the 0 dB reference for bed gains
CUE_REF_DB = -15.5         # dialogue's loudest 100 ms (mean over L001-L078, measured): 0 dB reference for cue gains


# ===================================================================== basic helpers
def rng_for(*parts):
    """Deterministic generator from a readable key (cue id, frame, ...)."""
    key = zlib.crc32("|".join(str(p) for p in parts).encode("utf-8"))
    return np.random.default_rng([SEED_BASE, key])


def db(x):
    return 10.0 ** (np.asarray(x, dtype=np.float64) / 20.0)


def ns(sec):
    return int(round(sec * SR))


def t_axis(n):
    return np.arange(n) / SR


@functools.lru_cache(maxsize=512)
def _sos(kind, order, f1, f2=None):
    wn = f1 if f2 is None else [f1, f2]
    return signal.butter(order, wn, btype=kind, fs=SR, output="sos")


def lp(x, fc, order=2):
    fc = min(fc, SR * 0.45)
    return signal.sosfilt(_sos("low", order, float(fc)), x, axis=0)


def hp(x, fc, order=2):
    return signal.sosfilt(_sos("high", order, float(fc)), x, axis=0)


def bp(x, lo, hi, order=2):
    hi = min(hi, SR * 0.45)
    return signal.sosfilt(_sos("band", order, float(lo), float(hi)), x, axis=0)


def peak_eq(x, f0, gain_db, q=1.0):
    """RBJ peaking biquad."""
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / (2 * q)
    b = np.array([1 + al * A, -2 * np.cos(w), 1 - al * A])
    a = np.array([1 + al / A, -2 * np.cos(w), 1 - al / A])
    return signal.lfilter(b / a[0], a / a[0], x, axis=0)


def shelf(x, f0, gain_db, high=True):
    """RBJ shelving biquad (S = 1)."""
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / 2 * np.sqrt(2)
    c = np.cos(w)
    s = 1 if high else -1
    b0 = A * ((A + 1) + s * (A - 1) * c + 2 * np.sqrt(A) * al)
    b1 = -2 * s * A * ((A - 1) + s * (A + 1) * c)
    b2 = A * ((A + 1) + s * (A - 1) * c - 2 * np.sqrt(A) * al)
    a0 = (A + 1) - s * (A - 1) * c + 2 * np.sqrt(A) * al
    a1 = 2 * s * ((A - 1) - s * (A + 1) * c)
    a2 = (A + 1) - s * (A - 1) * c - 2 * np.sqrt(A) * al
    return signal.lfilter(np.array([b0, b1, b2]) / a0, np.array([a0, a1, a2]) / a0, x, axis=0)


def white(n, rng):
    return rng.standard_normal(n)


def pink(n, rng):
    """1/f noise by spectral shaping, unit RMS. O(n log n), fine for long beds."""
    m = next_fast_len(n)
    X = rfft(rng.standard_normal(m))
    f = rfftfreq(m, 1 / SR)
    f[0] = f[1]
    x = irfft(X / np.sqrt(f), m)[:n]
    return x / (np.std(x) + 1e-12)


def brown(n, rng, fc=20.0):
    """Leaky-integrated noise (1/f^2 above fc), unit RMS."""
    a = np.exp(-2 * np.pi * fc / SR)
    x = signal.lfilter([1.0], [1.0, -a], rng.standard_normal(n))
    return x / (np.std(x) + 1e-12)


def env_ad(n, attack, decay, shape=2.0):
    t = t_axis(n)
    a = np.clip(t / max(attack, 1e-4), 0, 1) ** shape
    d = np.exp(-np.clip(t - attack, 0, None) / max(decay, 1e-4))
    return a * d


def env_pts(n, pts):
    """Piecewise-linear envelope through [(t_s, value), ...]."""
    ts, vs = zip(*pts)
    return np.interp(t_axis(n), ts, vs)


def fade(x, fin=0.005, fout=0.005):
    x = np.array(x, dtype=np.float64, copy=True)
    a, b = ns(fin), ns(fout)
    if a:
        x[:a] *= (np.sin(np.linspace(0, np.pi / 2, a)) ** 2).reshape(-1, *([1] * (x.ndim - 1)))
    if b:
        x[-b:] *= (np.cos(np.linspace(0, np.pi / 2, b)) ** 2).reshape(-1, *([1] * (x.ndim - 1)))
    return x


def control(n, rate_hz, rng, ctrl_hz=200.0):
    """Smooth random control curve in [0, 1] with features at ~rate_hz (cubic spline at a
    control rate, then linear interpolation to audio rate: cheap for long beds)."""
    from scipy.interpolate import CubicSpline
    m = max(4, int(n / SR * ctrl_hz) + 2)
    k = max(4, int(n / SR * rate_hz) + 4)
    xs = np.linspace(0, m - 1, k)
    c = CubicSpline(xs, rng.random(k), bc_type="natural")(np.arange(m))
    c -= c.min()
    c /= c.max() + 1e-12
    return np.interp(np.linspace(0, m - 1, n), np.arange(m), c)


def stft_shape(x, gain_fn, nper=2048):
    """Time-varying spectral shaping: gain_fn(freqs, times) -> (F, T) gain."""
    f, tt, Z = signal.stft(x, fs=SR, nperseg=nper, noverlap=nper * 3 // 4)
    Z = Z * gain_fn(f, tt)
    _, y = signal.istft(Z, fs=SR, nperseg=nper, noverlap=nper * 3 // 4)
    y = y[: len(x)]
    return np.pad(y, (0, len(x) - len(y)))


def sweep_band(x, centre_t, width_oct, nper=2048):
    """Band-pass whose centre follows centre_t(times) (Hz)."""
    def g(f, tt):
        lf = np.log2(np.maximum(f, 1.0))[:, None]
        return np.exp(-0.5 * ((lf - np.log2(np.maximum(centre_t(tt), 20.0))[None, :]) / width_oct) ** 2)
    return stft_shape(x, g, nper)


def damped(freq, decay, dur, phase=0.0):
    t = t_axis(ns(dur))
    return np.sin(2 * np.pi * freq * t + phase) * np.exp(-t / decay)


def modal(freqs, decays, amps, dur, rng=None, detune=0.0):
    n = ns(dur)
    t = t_axis(n)
    out = np.zeros(n)
    for f, d, a in zip(freqs, decays, amps):
        if rng is not None and detune:
            f = f * (1 + detune * rng.standard_normal())
        ph = 0.0 if rng is None else rng.random() * 2 * np.pi
        out += a * np.sin(2 * np.pi * f * t + ph) * np.exp(-t / d)
    return out


def resonate(x, freqs, qs, gains):
    out = np.zeros_like(x)
    for f, q, g in zip(freqs, qs, gains):
        if f >= SR * 0.45:
            continue
        b, a = signal.iirpeak(f, q, fs=SR)
        out += g * signal.lfilter(b, a, x, axis=0)
    return out


def impulses(n, times_s, amps):
    x = np.zeros(n)
    for t, a in zip(times_s, amps):
        i = int(t * SR)
        if 0 <= i < n:
            x[i] += a
    return x


def stick_slip(n, rate_curve, rng, jitter=0.25, amp_jitter=0.4):
    """Friction creak excitation: an impulse train whose rate follows rate_curve (Hz, per sample)."""
    out = np.zeros(n)
    i = 0.0
    while True:
        k = int(i)
        if k >= n:
            break
        r = max(rate_curve[k], 1.0)
        out[k] += 1 + amp_jitter * rng.standard_normal()
        i += SR / r * (1 + jitter * rng.standard_normal() * 0.5)
    return out


def glottal(f0, rng, jitter=0.01, shimmer=0.05, tilt=0.97):
    """Pulse-train voice source following f0 (Hz per sample), with jitter and shimmer."""
    n = len(f0)
    ph = np.cumsum(f0 * (1 + jitter * rng.standard_normal(n))) / SR
    idx = np.where(np.diff(np.floor(ph)) > 0)[0]
    p = np.zeros(n)
    p[idx] = 1.0 + shimmer * rng.standard_normal(len(idx))
    return signal.lfilter([1.0], [1.0, -tilt], p)


def place(buf, x, i0):
    """Add x into buf starting at sample i0 (both mono or both stereo); clips at the edges."""
    n = len(buf)
    a, b = max(0, i0), min(n, i0 + len(x))
    if b > a:
        buf[a:b] += x[a - i0: b - i0]


def pan(mono, p):
    """Equal-power pan; p in [-1 (L), +1 (R)], scalar or per-sample. Power-preserving."""
    p = np.clip(np.asarray(p, dtype=np.float64), -1, 1)
    a = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)], axis=1) * np.sqrt(2)


def balance(st, p):
    """Shift a stereo image toward p without collapsing it (power-preserving for p = 0)."""
    p = float(np.clip(p, -1, 1))
    gl, gr = np.cos((p + 1) * np.pi / 4) * np.sqrt(2), np.sin((p + 1) * np.pi / 4) * np.sqrt(2)
    return np.stack([st[:, 0] * gl, st[:, 1] * gr], axis=1)


def to_stereo(x, p=0.0):
    return pan(x, p) if x.ndim == 1 else balance(x, p)


def decorrelate(x, rng, spread=0.6):
    """Mono -> wide stereo: mix the signal with two different short allpass-ish diffusions."""
    out = []
    for _ in range(2):
        k = rng.integers(60, 400)
        ir = np.zeros(k + 1)
        ir[0] = 1.0
        ir[k] = spread * (1 if rng.random() > 0.5 else -1)
        out.append(signal.lfilter(ir, [1.0], x))
    st = np.stack(out, axis=1)
    return st / np.sqrt(1 + spread ** 2)


def short_rms(x, win=0.05):
    m = x if x.ndim == 1 else np.mean(x ** 2, axis=1) ** 0.5
    k = max(1, ns(win))
    p = np.convolve(m ** 2, np.ones(k) / k, mode="same")
    return np.sqrt(p + 1e-20)


def active_rms(x, rel_db=-30.0):
    e = short_rms(x)
    keep = e > e.max() * db(rel_db)
    m = x if x.ndim == 1 else np.sqrt(np.mean(x ** 2, axis=1))
    return float(np.sqrt(np.mean(m[keep] ** 2)) + 1e-20)


def norm_active(x, target_db=REF_DB):
    return x * (db(target_db) / active_rms(x))


def norm_cue(x, target_db=CUE_REF_DB):
    """One-shot cues: loudest 100 ms RMS at the level of dialogue's loudest 100 ms, so a cue
    gain of 0 dB reads 'as loud as a line of dialogue' for short transients and long sounds alike."""
    return x * (db(target_db) / (short_rms(x, 0.1).max() + 1e-20))


def norm_rms(x, target_db=REF_DB):
    m = x if x.ndim == 1 else np.sqrt(np.mean(x ** 2, axis=1))
    return x * (db(target_db) / (np.sqrt(np.mean(m ** 2)) + 1e-20))


def distance(x, d):
    """Air absorption / perspective: d = 0 (at the ear) .. 3 (far). Gain is set by the caller."""
    if d <= 0.05:
        return x
    fc = 15000.0 / (1 + 1.5 * d ** 1.7)
    y = lp(x, fc, 2)
    if d > 1.0:   # far sources lose the very top and the closest-presence band
        y = peak_eq(y, 3000, -2.0 * (d - 1), 0.8)
    return y


# --------------------------------------------------------------------- reverb (synthetic IRs)
def reverb_ir(rt60, dur, rng, lp_start=9000.0, lp_end=1500.0, predelay=0.01, early=(6, 0.03),
              density=1.0):
    """Stereo IR: early reflections + decaying noise tail that darkens over time (normalized)."""
    n = ns(dur)
    t = t_axis(n)
    ir = np.zeros((n, 2))
    decay = np.exp(-6.91 * t / rt60)
    n_early, early_span = early
    for ch in range(2):
        nz = rng.standard_normal(n)
        if density < 1.0:   # sparse tail (open air: a few distant reflections, not a room)
            nz *= (rng.random(n) < density)
        nz *= decay
        dark = lp(nz, lp_end, 2)
        bright = lp(nz, lp_start, 2)
        mix = np.clip(t / (rt60 * 0.5), 0, 1)
        ir[:, ch] = bright * (1 - mix) + dark * mix
        ir[: ns(predelay), ch] = 0.0
        for _ in range(n_early):
            k = ns(predelay + rng.random() * early_span)
            ir[k, ch] += (0.4 + 0.5 * rng.random()) * (1 if rng.random() > 0.5 else -1)
    # unity gain on pink noise (a unit-energy IR with a dark tail has several dB of gain where
    # speech and most effects have their energy, so a send of -13 dB would come back at ~-6 dB)
    ref = pink(ns(4.0), np.random.default_rng([SEED_BASE, 7919]))
    for ch in range(2):
        g = np.sqrt(np.mean(signal.fftconvolve(ref, ir[:, ch])[: len(ref)] ** 2) / np.mean(ref ** 2))
        ir[:, ch] /= g + 1e-12
    return ir


SPACES = {
    # small warm stone room: dense early reflections, short dark tail (audio-plan.md "Spaces")
    "chamber": dict(rt60=0.55, dur=0.8, lp_start=7000, lp_end=1300, predelay=0.006, early=(14, 0.022)),
    # open air with distant buildings: sparse, short, a little reverb
    "grounds": dict(rt60=0.45, dur=0.7, lp_start=6000, lp_end=1800, predelay=0.02, early=(5, 0.09), density=0.25),
    # open sea / coast: very little
    "sea": dict(rt60=0.35, dur=0.5, lp_start=5000, lp_end=1500, predelay=0.03, early=(3, 0.12), density=0.15),
    # sky: almost no reverb (the wind does the work)
    "sky": dict(rt60=0.18, dur=0.25, lp_start=5000, lp_end=2000, predelay=0.01, early=(2, 0.02), density=0.1),
    # distant landscapes and the fog: long, dark, sparse (distance cue)
    "far": dict(rt60=1.6, dur=2.0, lp_start=3000, lp_end=700, predelay=0.05, early=(4, 0.2), density=0.2),
}


def space_ir(name):
    return reverb_ir(rng=rng_for("ir", name), **SPACES[name])


def convolve_st(st, ir):
    out = np.zeros((st.shape[0] + ir.shape[0] - 1, 2))
    for ch in range(2):
        out[:, ch] = signal.oaconvolve(st[:, ch], ir[:, ch])
    return out


# ===================================================================== creatures: wingbeats
def charcoal_beat(rng, period=1 / 0.76, down=0.56, dist=1.0, scale=1.0, upstroke=True, tail=0.0):
    """One wingbeat of Charcoal (35.8 m Bashion). Downstroke = `down` of the cycle (poses.js
    wingFlap D = 0.56); the membrane snaps taut at the bottom of the stroke. sync = onset
    (top of the upstroke, cyc = 0). Immense and infrequent: a pressure push you feel, a
    displaced-air whoosh, a sail-like 'fwump', then a soft upstroke."""
    td = period * down
    dur = period + 1.4 + tail
    n = ns(dur)
    out = np.zeros((n, 2))
    # (a) pressure push: ~31 Hz body + harmonics (so small speakers still carry it) + sub noise
    m = ns(min(1.6, period * 1.2))
    tt = t_axis(m)
    e = env_ad(m, 0.42 * td, 0.45 * td, 1.5)
    f0 = 31.0 * scale * (1 + 0.04 * rng.standard_normal())
    push = (0.6 * np.sin(2 * np.pi * f0 * tt) + 0.55 * np.sin(2 * np.pi * 2 * f0 * tt + 0.3)
            + 0.33 * np.sin(2 * np.pi * 3 * f0 * tt + 1.1) + 0.18 * np.sin(2 * np.pi * 4 * f0 * tt + 2.0)) * e
    push += 2.2 * lp(white(m, rng), 110, 4) * e
    for ch in range(2):
        place(out[:, ch], push, 0)
    # (b) displaced-air whoosh: centre sweeps 170 -> 650 -> 190 Hz through the downstroke
    m = ns(td * 1.5)
    shared = pink(m, rng)
    for ch in range(2):
        nz = 0.8 * shared + 0.6 * pink(m, rng)
        w = sweep_band(nz, lambda tt_: 170 + 480 * np.sin(np.pi * np.clip(tt_ / (td * 1.1), 0, 1)) ** 1.3, 1.05)
        w *= env_ad(m, 0.45 * td, 0.5 * td, 2.2)
        place(out[:, ch], 1.7 * w, ns(0.02 + 0.003 * ch))
    # (c) membrane snaps taut at the bottom of the stroke ('fwump')
    k = ns(0.14)
    sn = bp(white(k, rng), 120, 2200, 2) * env_ad(k, 0.004, 0.035, 1)
    sn += 0.9 * damped(84 * scale, 0.06, 0.14) * env_ad(k, 0.002, 0.2, 1)
    place(out[:, 0], 0.6 * sn, ns(td * 0.97))
    place(out[:, 1], 0.55 * sn, ns(td * 0.97) + 12)
    # (d) trailing-edge flutter after the snap
    k = ns(0.32)
    fl = bp(white(k, rng), 280, 2800, 2) * (0.5 + 0.5 * np.sin(2 * np.pi * (19 + 4 * rng.random()) * t_axis(k)))
    fl *= env_ad(k, 0.03, 0.11)
    place(out[:, 0], 0.13 * fl, ns(td))
    place(out[:, 1], 0.12 * fl, ns(td) + 30)
    # (e) slower, softer upstroke, no snap (about 18-20 dB under the downstroke)
    if upstroke:
        m = ns(period * (1 - down) + 0.3)
        for ch in range(2):
            w2 = bp(pink(m, rng), 110, 650, 2) * env_ad(m, 0.5 * period * (1 - down), 0.3, 2.5)
            place(out[:, ch], 0.22 * w2, ns(td))
    out = distance(out, dist)
    return out, 0.0


def leaf_beat(rng, period=1 / 1.6, down=0.56, dist=0.5, amp=1.0, hard=0.0):
    """One quick, light wingbeat of Leaf (8 m subadult Nightwing). hard = 0..1 for effortful
    or corrective beats (more snap, more body). sync = onset."""
    td = period * down
    n = ns(period + 0.6)
    out = np.zeros((n, 2))
    m = ns(td * 1.25)
    common = pink(m, rng)
    for ch in range(2):
        nz = 0.85 * common + 0.53 * pink(m, rng)    # mostly shared: one localisable creature
        w = sweep_band(nz, lambda tt_: 520 + 950 * np.sin(np.pi * np.clip(tt_ / (td * 0.95), 0, 1)), 0.9, 1024)
        w *= env_ad(m, 0.42 * td, 0.32 * td, 1.8)
        place(out[:, ch], w * (1 + 0.4 * hard), ns(0.0015 * ch))
    th = damped(92 + 15 * rng.random(), 0.035, 0.14) * env_ad(ns(0.14), 0.012, 0.2, 1)
    for ch in range(2):
        place(out[:, ch], (0.28 + 0.2 * hard) * th, ns(0.3 * td))
    k = ns(0.045)
    sn = bp(white(k, rng), 850, 4800, 2) * env_ad(k, 0.002, 0.009, 1)
    place(out[:, 0], (0.2 + 0.25 * hard) * sn, ns(0.93 * td))
    place(out[:, 1], (0.18 + 0.22 * hard) * sn, ns(0.93 * td) + 50)
    m = ns(period * (1 - down) + 0.1)   # upstroke: a faint lift
    for ch in range(2):
        u = bp(pink(m, rng), 400, 1800, 2) * env_ad(m, 0.12, 0.08, 2)
        place(out[:, ch], 0.12 * u, ns(td))
    out *= amp
    return distance(out, dist), 0.0


def scout_beat(rng, period=1 / 2.6, dist=2.5):
    """Slitherwing scout (5.6 m): thin, sharp, fast flutter."""
    td = period * 0.5
    n = ns(period + 0.2)
    m = ns(td * 1.3)
    nz = white(m, rng)
    w = sweep_band(nz, lambda tt_: 1500 + 2600 * np.sin(np.pi * np.clip(tt_ / td, 0, 1)), 0.6, 512)
    w *= env_ad(m, 0.35 * td, 0.25 * td, 1.5)
    k = ns(0.02)
    sn = hp(white(k, rng), 2500, 2) * env_ad(k, 0.001, 0.004, 1)
    out = np.zeros(n)
    place(out, w, 0)
    place(out, 0.5 * sn, ns(0.9 * td))
    return distance(out, dist), 0.0


# ===================================================================== creatures: breath and voice
def charcoal_exhale(rng, dur=3.6, strength=1.0, swell_in=0.5):
    """Huge, slow exhale (no growl): big low nasal formants, a faint sub component."""
    n = ns(dur + 0.4)
    e = env_pts(n, [(0, 0), (swell_in, 1.0), (dur * 0.55, 0.75), (dur, 0.0), (dur + 0.4, 0.0)]) ** 1.3
    src = pink(n, rng)
    body = resonate(src, [105, 240, 520, 1100], [3.0, 3.5, 4.0, 4.0], [1.0, 0.8, 0.45, 0.2])
    air = bp(white(n, rng), 300, 2600, 2) * 0.25
    sub = lp(brown(n, rng, 15), 60, 2) * 0.5
    y = (body + air * strength + sub) * e
    st = decorrelate(y, rng, 0.5)
    return st, 0.0


def charcoal_low_breath(rng, dur=2.8):
    """Low, slow breath through the nose; no roar, no growl."""
    n = ns(dur + 0.3)
    e = env_pts(n, [(0, 0), (0.6, 0.8), (1.0, 1.0), (dur, 0), (dur + 0.3, 0)]) ** 1.4
    src = pink(n, rng)
    y = resonate(src, [90, 210, 460], [3, 3.5, 4], [1.0, 0.7, 0.3]) + 0.08 * bp(white(n, rng), 250, 1800, 2)
    y = lp(y, 1600, 2) * e
    return decorrelate(y, rng, 0.4), 0.0


def leaf_breath(rng, kind="quick"):
    """Leaf: quick nasal breaths (2-3 chuffs), or a small rolling chirr (synth 120-300 Hz)."""
    if kind == "chirr":
        dur = 0.5
        n = ns(dur)
        tt = t_axis(n)
        f0 = 190 + 45 * tt / dur + 8 * np.sin(2 * np.pi * 3 * tt)
        src = glottal(f0, rng, 0.02, 0.1)
        roll = 0.45 + 0.55 * (0.5 + 0.5 * np.sin(2 * np.pi * 27 * tt)) ** 2
        y = resonate(src, [520, 1350, 2600], [5, 6, 7], [1.0, 0.6, 0.25]) * roll
        y += 0.15 * bp(white(n, rng), 600, 3500, 2)
        y *= env_pts(n, [(0, 0), (0.05, 1), (0.35, 0.8), (dur, 0)])
        return y, 0.02
    n = ns(1.2)
    y = np.zeros(n)
    t = 0.0
    for i in range(int(rng.integers(2, 4))):
        k = ns(0.16 + 0.06 * rng.random())
        z = resonate(white(k, rng), [620, 1500, 3000], [3, 4, 5], [1.0, 0.5, 0.25])
        z = bp(z, 180, 4000, 2) * env_ad(k, 0.02, 0.06, 1.2)
        place(y, z * (0.8 + 0.3 * rng.random()), ns(t))
        t += 0.2 + 0.1 * rng.random()
    return y, 0.0


def leaf_squeak_muffled(rng):
    """A muffled squeak from Leaf, heard from inside Charcoal's mouth: short, high-ish, dulled."""
    dur = 0.38
    n = ns(dur)
    tt = t_axis(n)
    f0 = 620 + 330 * np.sin(np.pi * np.clip(tt / 0.22, 0, 1)) - 120 * np.clip((tt - 0.22) / 0.16, 0, 1)
    src = glottal(f0, rng, 0.03, 0.12, 0.9)
    y = resonate(src, [900, 2100, 3400], [6, 7, 8], [1.0, 0.5, 0.25])
    y *= env_pts(n, [(0, 0), (0.03, 1), (0.22, 0.85), (dur, 0)])
    y = lp(y, 650, 4)                         # through jaws and tongue: the top is gone
    y = resonate(y, [280, 620], [2.5, 3], [1.0, 0.6]) + 0.4 * y
    return y, 0.0


def hatchling_breath(rng, kind="small", count=1, interval=0.7):
    """Fragile newborn breaths: tiny wet-ish airy puffs, no squeaks. kind: small, effort,
    tiny, laboured (count breaths, uneven), calm."""
    lvl = {"small": 1.0, "effort": 1.0, "tiny": 0.6, "laboured": 1.0, "calm": 0.8}[kind]
    n = ns(count * interval + 1.0)
    y = np.zeros(n)
    t = 0.0
    for i in range(count):
        ki, ke = ns(0.16 + 0.05 * rng.random()), ns(0.24 + 0.08 * rng.random())
        inh = resonate(white(ki, rng), [1900, 3600, 5200], [4, 5, 6], [1.0, 0.6, 0.3]) * env_ad(ki, 0.1, 0.05, 1.5)
        exh = resonate(white(ke, rng), [1500, 3000, 4800], [3, 4, 5], [1.0, 0.6, 0.3]) * env_ad(ke, 0.03, 0.09, 1.2)
        inh, exh = bp(inh, 700, 7000, 2), bp(exh, 600, 6500, 2)
        a = lvl * (0.75 + 0.35 * rng.random())
        place(y, 0.55 * a * inh, ns(t))
        place(y, a * exh, ns(t) + ki + ns(0.03))
        if kind in ("effort", "laboured"):        # a faint creak of effort on the exhale
            kv = ke
            f0 = 360 * (1 + 0.08 * rng.standard_normal()) * np.ones(kv)
            v = glottal(f0, rng, 0.06, 0.3, 0.92)
            v = resonate(v, [850, 2300, 3700], [5, 6, 7], [1.0, 0.5, 0.2]) * env_ad(kv, 0.04, 0.08, 1)
            place(y, 0.18 * a * v / (np.max(np.abs(v)) + 1e-9) * np.max(np.abs(exh)), ns(t) + ki + ns(0.03))
        if rng.random() < 0.35:                    # a tiny wet click
            kc = ns(0.006)
            place(y, 0.3 * a * np.max(np.abs(exh)) * hp(white(kc, rng), 3000, 2) * env_ad(kc, 0.0005, 0.0015, 1),
                  ns(t) + ki + ke)
        t += interval * (0.8 + 0.4 * rng.random()) if kind == "laboured" else interval
    return y, 0.0


def hatchling_effort(rng):
    """Faint effortful sound from inside the egg: strained, breathy, creaky; not cute, not monstrous."""
    dur = 0.65
    n = ns(dur)
    tt = t_axis(n)
    f0 = 310 - 50 * tt / dur
    src = glottal(f0, rng, 0.07, 0.35, 0.93)
    y = resonate(src, [780, 2050, 3500], [5, 6, 7], [1.0, 0.45, 0.2])
    y = y / (np.max(np.abs(y)) + 1e-9)
    br = bp(white(n, rng), 700, 6000, 2)
    br /= np.max(np.abs(br)) + 1e-9
    y = 0.55 * y + 0.6 * br
    y *= env_pts(n, [(0, 0), (0.12, 0.7), (0.4, 1.0), (dur, 0)])
    y = lp(y, 3500, 2)                         # muffled by the shell
    return y, 0.0


# ===================================================================== egg and shell
SHELL_MODES = (1250, 2050, 3150, 4450, 6300, 8600)


def shell_click(rng, amp=1.0, bright=1.0, dur=0.035):
    n = ns(dur)
    out = np.zeros(n)
    for fm in SHELL_MODES:
        f = fm * (1 + 0.05 * rng.standard_normal())
        out += (rng.random() * bright + 0.2) * damped(f, 0.0018 + 0.004 * rng.random(), dur, rng.random() * 6)
    return amp * out * env_ad(n, 0.0003, 0.012, 1)


def egg_scratch(rng, dur=0.6, size=1.0):
    """Claws scraping the inside of the shell: stick-slip through the shell, muffled."""
    n = ns(dur + 0.1)
    y = np.zeros(n)
    t = 0.0
    while t < dur:
        place(y, 0.25 * size * shell_click(rng, 1.0, 0.35), ns(t))
        t += 1 / (40 + 60 * rng.random())
    scr = bp(white(ns(dur), rng), 1200, 5000, 2) * env_pts(ns(dur), [(0, 0), (dur * 0.3, 1), (dur, 0)])
    place(y, 0.06 * size * scr, 0)
    return lp(y, 4200, 2), 0.0


def shell_crack(rng, count=9, span=0.12, amp=1.0, accel=0.6, knock=True):
    """A fine crack running: an accelerating chain of clicks (sync = first click)."""
    n = ns(span + 0.3)
    y = np.zeros(n)
    times = span * (np.linspace(0, 1, count) ** accel)
    for tk in times:
        place(y, amp * (0.6 + 0.4 * rng.random()) * shell_click(rng, 1.0, 1.0), ns(tk))
    if knock:
        place(y, 0.3 * amp * damped(170, 0.04, 0.2) * env_ad(ns(0.2), 0.001, 0.3, 1), 0)
    return y, 0.0


def shell_creak(rng, kind="pressure"):
    """'pressure': the shell flexing outward (low creak + micro-cracks).
    'wet': a wet scrape as the snout pushes through the membrane edge."""
    if kind == "pressure":
        dur = 1.1
        n = ns(dur)
        rate = 18 + 30 * np.sin(np.pi * t_axis(n) / dur)
        ex = stick_slip(n, rate, rng, 0.3, 0.3)
        y = resonate(ex, [420, 760, 1250, 2050], [12, 14, 16, 18], [1.0, 0.7, 0.5, 0.35])
        y *= env_pts(n, [(0, 0), (0.25, 1), (0.8, 0.8), (dur, 0)])
        for k in range(3):
            place(y, 0.25 * shell_click(rng, 1.0, 0.8) * np.max(np.abs(y)), ns(0.3 + 0.2 * k + 0.05 * rng.random()))
        return y, 0.0
    dur = 0.9
    n = ns(dur)
    scr = bp(white(n, rng), 500, 3500, 2) * env_pts(n, [(0, 0), (0.15, 1), (0.6, 0.7), (dur, 0)])
    y = 0.5 * scr
    t = 0.05
    while t < dur - 0.08:                      # small wet 'bubbles' (rising chirps), quiet
        k = ns(0.012)
        f = 900 + 900 * rng.random()
        tt = t_axis(k)
        ch = np.sin(2 * np.pi * (f * tt + 0.5 * 4000 * tt ** 2)) * env_ad(k, 0.001, 0.004, 1)
        place(y, 0.25 * ch, ns(t))
        t += 0.04 + 0.08 * rng.random()
    for k in range(4):
        place(y, 0.2 * shell_click(rng, 1.0, 0.5), ns(0.1 + 0.18 * k))
    return lp(y, 5000, 2), 0.0


def shell_fragment(rng, kind="shift"):
    """'shift': a piece of shell moves (click + short slide). 'drop': lifts, then clicks onto
    linen (sync = the landing). 'scrape': the hatchling slips against the broken shell."""
    if kind == "drop":
        n = ns(1.8)
        y = np.zeros(n)
        k = ns(0.25)
        lift = bp(white(k, rng), 1500, 6000, 2) * env_pts(k, [(0, 0), (0.08, 1), (0.25, 0)]) * 0.15
        place(y, lift, 0)
        place(y, 0.4 * shell_click(rng, 1.0, 0.8), ns(0.02))
        land = ns(1.33)
        place(y, 0.9 * shell_click(rng, 1.0, 0.6), land)                     # onto linen: dulled
        place(y, 0.35 * shell_click(rng, 1.0, 0.5), land + ns(0.07))
        lin = bp(white(ns(0.12), rng), 800, 5000, 2) * env_ad(ns(0.12), 0.005, 0.04, 1) * 0.2
        place(y, lin, land)
        return lp(y, 7000, 2), 1.33
    if kind == "scrape":
        dur = 0.7
        n = ns(dur)
        y = bp(white(n, rng), 900, 6000, 2) * env_pts(n, [(0, 0), (0.08, 1), (0.4, 0.6), (dur, 0)]) * 0.35
        t = 0.0
        while t < 0.45:
            place(y, 0.3 * shell_click(rng, 1.0, 0.6), ns(t))
            t += 1 / (25 + 40 * rng.random())
        return y, 0.0
    n = ns(0.5)
    y = np.zeros(n)
    place(y, 0.7 * shell_click(rng, 1.0, 0.9), 0)
    k = ns(0.18)
    place(y, 0.12 * bp(white(k, rng), 1500, 6000, 2) * env_ad(k, 0.02, 0.05, 1), ns(0.01))
    place(y, 0.3 * shell_click(rng, 1.0, 0.5), ns(0.16))
    return y, 0.0


def shell_break(rng):
    """The shell breaks away along the crack: a long crack run, knocks, fragments falling onto
    linen and straw, the hatchling's scrabble. A distinct, bigger stage (sync = first crack)."""
    n = ns(2.4)
    y = np.zeros(n)
    c, _ = shell_crack(rng, 30, 0.32, 1.0, 0.7)
    place(y, c, 0)
    place(y, 0.5 * damped(140, 0.06, 0.3) * env_ad(ns(0.3), 0.001, 0.3, 1), ns(0.12))
    for k in range(6):
        tk = 0.38 + 0.12 * k + 0.08 * rng.random()
        place(y, (0.6 - 0.06 * k) * shell_click(rng, 1.0, 0.6), ns(tk))
        lin = bp(white(ns(0.08), rng), 800, 5000, 2) * env_ad(ns(0.08), 0.004, 0.03, 1) * 0.15
        place(y, lin, ns(tk))
    s, _ = shell_fragment(rng, "scrape")
    place(y, 0.7 * s, ns(1.2))
    return y, 0.0


# ===================================================================== foley stand-ins (chamber)
def footstep(rng, weight=1.0, surface="stone", soft=0.0):
    """One soft-soled step: heel thump + click, toe roll and scuff."""
    n = ns(0.35)
    y = np.zeros(n)
    k = ns(0.05)
    heel = lp(white(k, rng), 260 if surface == "stone" else 180, 2) * env_ad(k, 0.002, 0.012, 1) * 3.0 * weight
    heel += 0.8 * weight * damped(95 + 30 * rng.random(), 0.012, 0.05)
    click = bp(white(ns(0.012), rng), 1500, 5500, 2) * env_ad(ns(0.012), 0.0005, 0.003, 1) * (0.5 - 0.4 * soft)
    place(y, heel, 0)
    place(y, click, ns(0.001))
    toe_t = 0.06 + 0.03 * rng.random()
    place(y, 0.45 * heel * (0.7 + 0.3 * rng.random()), ns(toe_t))
    k = ns(0.09)
    sc = bp(white(k, rng), 1200, 6500, 2) * env_pts(k, [(0, 0), (0.02, 1), (0.09, 0)]) * (0.25 + 0.15 * rng.random())
    place(y, sc, ns(toe_t + 0.01))
    return y, 0.0


def footsteps(rng, times, weights=None, soft=0.0, surface="stone"):
    n = ns(max(times) + 0.5)
    y = np.zeros(n)
    for i, t in enumerate(times):
        w = 1.0 if weights is None else weights[i]
        s, _ = footstep(rng, w, surface, soft)
        place(y, s, ns(t))
    return y, 0.0


def cloth(rng, dur=0.8, kind="gown", amount=1.0):
    """Fabric movement: friction rustle with fine crackle. gown = heavier, darker; linen;
    breath = a soft human breath out (Alexandria), filed with the cloth cues in the EDL."""
    if kind == "breath":
        n = ns(dur + 0.2)
        y = resonate(white(n, rng), [700, 1300, 2600], [2.5, 3, 4], [1.0, 0.7, 0.35])
        y = bp(y, 250, 4000, 2) * env_pts(n, [(0, 0), (0.25, 1.0), (dur * 0.6, 0.5), (dur, 0), (dur + 0.2, 0)])
        return y * amount, 0.0
    n = ns(dur)
    lo, hi = (900, 7000) if kind == "gown" else (1500, 9000)
    mv = control(n, 6.0, rng) ** 1.5 * env_pts(n, [(0, 0), (dur * 0.2, 1), (dur * 0.7, 0.8), (dur, 0)])
    y = bp(white(n, rng), lo, hi, 2) * mv
    cr = (rng.random(n) < 0.004 * mv).astype(float) * rng.standard_normal(n)
    y += 2.5 * bp(cr, 2000, 9000, 2)
    return y * amount, 0.0


def door(rng, kind="open"):
    """Heavy wooden door. 'open': iron latch lift, hinge creak, air. 'close': swing, thud, latch.
    sync = latch (open) or the thud (close)."""
    if kind == "open":
        n = ns(1.6)
        y = np.zeros(n)
        latch = modal([1850, 3120, 4710, 6400], [0.05, 0.04, 0.03, 0.02], [1.0, 0.7, 0.5, 0.3], 0.15, rng, 0.02)
        place(y, 0.5 * latch, 0)
        place(y, 0.35 * modal([2200, 3600], [0.03, 0.02], [1, 0.6], 0.1, rng), ns(0.09))
        k = ns(0.9)
        rate = 35 + 70 * np.clip(t_axis(k) / 0.9, 0, 1) ** 0.7
        cr = resonate(stick_slip(k, rate, rng, 0.2, 0.3), [360, 780, 1260, 2100], [10, 12, 14, 16], [1, .8, .5, .3])
        cr *= env_pts(k, [(0, 0), (0.1, 1), (0.7, 0.7), (0.9, 0)])
        place(y, 0.6 * cr / (np.max(np.abs(cr)) + 1e-9), ns(0.18))
        air = lp(white(ns(1.0), rng), 400, 2) * env_pts(ns(1.0), [(0, 0), (0.4, 1), (1.0, 0)]) * 0.15
        place(y, air, ns(0.25))
        return y, 0.0
    n = ns(1.2)
    y = np.zeros(n)
    sw = lp(white(ns(0.4), rng), 500, 2) * env_pts(ns(0.4), [(0, 0), (0.3, 1), (0.4, 0)]) * 0.12
    place(y, sw, 0)
    t0 = 0.4
    thud = modal([88, 156, 262, 410], [0.12, 0.08, 0.05, 0.03], [1.0, 0.7, 0.4, 0.2], 0.5, rng, 0.03)
    thud += 1.5 * lp(white(ns(0.5), rng), 300, 2) * env_ad(ns(0.5), 0.001, 0.02, 1)
    place(y, thud, ns(t0))
    place(y, 0.3 * modal([1850, 3120], [0.04, 0.03], [1, 0.6], 0.1, rng), ns(t0 + 0.03))
    return y, t0


def knee_stone(rng):
    n = ns(0.6)
    y = np.zeros(n)
    k = ns(0.08)
    place(y, 2.5 * lp(white(k, rng), 220, 2) * env_ad(k, 0.003, 0.02, 1), ns(0.15))
    c, _ = cloth(rng, 0.5, "gown", 0.25)
    place(y, c, 0)
    return y, 0.15


def bedding_rustle(rng, dur=1.4):
    """Linen and straw under a small wet body: straw crackle + linen swish."""
    n = ns(dur)
    mv = control(n, 5.0, rng) * env_pts(n, [(0, 0), (0.15, 1), (dur * 0.7, 0.6), (dur, 0)])
    straw = (rng.random(n) < 0.006 * mv).astype(float) * rng.standard_normal(n)
    y = 1.8 * bp(straw, 2200, 9500, 2) + 0.35 * bp(white(n, rng), 900, 6000, 2) * mv
    return y, 0.0


# ===================================================================== foley stand-ins (riding grounds)
def leather_creak(rng, dur=0.5, size=1.0):
    n = ns(dur)
    rate = (60 + 120 * rng.random()) * (0.7 + 0.6 * np.sin(np.pi * t_axis(n) / dur)) / size
    ex = stick_slip(n, rate, rng, 0.35, 0.4)
    f = np.array([320, 650, 1100, 1800]) / size ** 0.5
    y = resonate(ex, f, [6, 7, 8, 9], [1.0, 0.7, 0.4, 0.2])
    y *= env_pts(n, [(0, 0), (dur * 0.2, 1), (dur * 0.8, 0.7), (dur, 0)])
    return y / (np.max(np.abs(y)) + 1e-9), 0.0


def buckle(rng, clinks=2):
    n = ns(0.5)
    y = np.zeros(n)
    for i in range(clinks):
        m = modal([3150, 4900, 6800, 8900], [0.06, 0.045, 0.03, 0.02], [1, .7, .45, .25], 0.2, rng, 0.03)
        place(y, (0.8 - 0.25 * i) * m, ns(0.11 * i + 0.03 * rng.random()))
    return y, 0.0


def strap_leather(rng, kind="strap"):
    """Strap leather pulled through a buckle; kind 'buckle' = mostly the metal."""
    n = ns(0.9)
    y = np.zeros(n)
    if kind != "buckle":
        c, _ = leather_creak(rng, 0.45, 1.0)
        place(y, 0.5 * c, 0)
    b, _ = buckle(rng, 2)
    place(y, 0.6 * b, ns(0.3 if kind != "buckle" else 0.0))
    return y, 0.0


def saddle_creak(rng):
    n = ns(1.0)
    y = np.zeros(n)
    c, _ = leather_creak(rng, 0.8, 1.6)
    place(y, c, 0)
    b, _ = buckle(rng, 1)
    place(y, 0.25 * b, ns(0.4))
    return y, 0.0


def rig_climb(rng, steps=4, span=4.4):
    """Remi climbing the wooden access rig: foot on each rung (wood knock) + creak."""
    n = ns(span + 1.0)
    y = np.zeros(n)
    for i in range(steps):
        t = i * span / steps + 0.1 * rng.random()
        knock = modal([140, 290, 520, 860], [0.06, 0.05, 0.03, 0.02], [1, .7, .4, .2], 0.25, rng, 0.04)
        knock += 1.2 * lp(white(ns(0.25), rng), 400, 2) * env_ad(ns(0.25), 0.001, 0.015, 1)
        place(y, knock, ns(t))
        c, _ = leather_creak(rng, 0.4, 2.0)          # timber creak: slower, lower
        c = resonate(c, [230, 470, 900], [8, 9, 10], [1, .6, .3])
        place(y, 0.25 * c / (np.max(np.abs(c)) + 1e-9), ns(t + 0.08))
    return y, 0.0


def harness_clips(rng, count=3):
    n = ns(1.0)
    y = np.zeros(n)
    for i in range(count):
        t = 0.18 * i + 0.05 * rng.random()
        click = modal([2400, 3800, 5600], [0.02, 0.015, 0.01], [1, .6, .3], 0.08, rng, 0.04)
        ring = modal([4300, 6100], [0.08, 0.05], [0.3, 0.2], 0.25, rng, 0.03)
        place(y, click + 0 * ring[: len(click)], ns(t))
        place(y, ring, ns(t + 0.002))
    return y, 0.0


def gate_noise(rng):
    """Off-screen wooden gate: creak and a latch clank, distant."""
    n = ns(1.6)
    y = np.zeros(n)
    k = ns(0.8)
    rate = 25 + 50 * t_axis(k) / 0.8
    cr = resonate(stick_slip(k, rate, rng, 0.3, 0.3), [300, 640, 1100], [10, 12, 14], [1, .7, .4])
    cr *= env_pts(k, [(0, 0), (0.1, 1), (0.8, 0)])
    place(y, cr / (np.max(np.abs(cr)) + 1e-9), 0)
    clank = modal([620, 1430, 2600], [0.08, 0.05, 0.03], [1, .6, .3], 0.4, rng, 0.03)
    clank += 0.6 * lp(white(ns(0.4), rng), 600, 2) * env_ad(ns(0.4), 0.001, 0.01, 1)
    place(y, 0.8 * clank, ns(0.85))
    return distance(y, 2.4), 0.0


def claws_turf(rng, plants=3):
    """Leaf's feet pushing off: soft thumps, soil crunch, claw scrape through grass roots."""
    n = ns(1.4)
    y = np.zeros(n)
    for i in range(plants):
        t = 0.18 * i + 0.06 * rng.random()
        k = ns(0.12)
        place(y, 2.0 * lp(white(k, rng), 200, 2) * env_ad(k, 0.003, 0.025, 1), ns(t))
        g = ns(0.18)
        cr = (rng.random(g) < 0.05).astype(float) * rng.standard_normal(g)
        place(y, 1.2 * bp(cr, 900, 6000, 2) * env_ad(g, 0.01, 0.06, 1), ns(t + 0.02))
        place(y, 0.2 * bp(white(g, rng), 1500, 7000, 2) * env_ad(g, 0.02, 0.05, 1), ns(t + 0.04))
    return y, 0.0


def wing_unfold(rng, size="leaf"):
    """Wings opening. leaf: leathery unfurl and a taut 'fwap' (sync = start).
    charcoal: huge membrane dragging open, deep leather groans, a final taut boom."""
    if size == "leaf":
        dur = 1.5
        n = ns(dur)
        mv = env_pts(n, [(0, 0), (0.3, 0.7), (1.1, 1.0), (1.2, 0.2), (dur, 0)])
        y = bp(pink(n, rng), 300, 3000, 2) * mv * 0.5
        cr = (rng.random(n) < 0.003 * mv).astype(float) * rng.standard_normal(n)
        y += 1.2 * bp(cr, 800, 5000, 2)
        c, _ = leather_creak(rng, 0.6, 1.3)
        place(y, 0.3 * c, ns(0.4))
        k = ns(0.12)
        fw = bp(white(k, rng), 150, 2200, 2) * env_ad(k, 0.003, 0.03, 1) + damped(120, 0.04, 0.12)
        place(y, 0.9 * fw, ns(1.12))
        return y, 0.0
    dur = 3.2
    n = ns(dur)
    mv = env_pts(n, [(0, 0), (0.8, 0.6), (2.0, 1.0), (2.2, 0.3), (dur, 0)])
    drag = sweep_band(pink(n, rng), lambda tt: 120 + 300 * np.clip(tt / 2.2, 0, 1), 1.2) * mv
    rate = 12 + 14 * control(n, 1.5, rng)
    gro = resonate(stick_slip(n, rate, rng, 0.3, 0.4), [70, 140, 260, 450], [6, 7, 8, 9], [1, .8, .5, .3])
    gro *= mv / (np.max(np.abs(gro)) + 1e-9)
    y = drag / (np.max(np.abs(drag)) + 1e-9) + 0.5 * gro
    k = ns(0.6)
    boom = damped(44, 0.18, 0.6) + 0.6 * bp(white(k, rng), 90, 1400, 2) * env_ad(k, 0.004, 0.06, 1)
    place(y, 1.3 * boom, ns(2.2))
    return decorrelate(y, rng, 0.5), 0.0


def grass_hiss(rng, dur=1.0, strength=1.0):
    """Wind of a downbeat flattening grass: broadband rustle, wide."""
    n = ns(dur)
    e = env_pts(n, [(0, 0), (0.06, 1.0), (dur * 0.5, 0.45), (dur, 0)]) * strength
    st = np.zeros((n, 2))
    for ch in range(2):
        g = bp(white(n, rng), 1600, 10000, 2) * (0.6 + 0.4 * control(n, 25, rng))
        st[:, ch] = g * e
    return st, 0.0


def grass_rush(rng, dur=2.6, pan_from=-0.7, pan_to=0.7):
    """The grass rushes as a huge shadow (and its downdraft) crosses the frame."""
    n = ns(dur)
    e = env_pts(n, [(0, 0), (dur * 0.45, 1.0), (dur, 0)]) ** 1.5
    y = (bp(white(n, rng), 700, 9000, 2) * (0.6 + 0.4 * control(n, 18, rng)) + 0.4 * bp(pink(n, rng), 200, 900, 2)) * e
    p = np.linspace(pan_from, pan_to, n)
    return pan(y, p), dur * 0.45


# ===================================================================== big events
def sub_layer(rng, dur=11.0, f=34.0, rise=2.0):
    """'The sound drops into a lower register': a sub layer under Charcoal's preparation."""
    n = ns(dur)
    tt = t_axis(n)
    wob = 1 + 0.08 * (control(n, 0.6, rng) - 0.5)
    y = (np.sin(2 * np.pi * f * tt * wob) + 0.35 * np.sin(2 * np.pi * 2 * f * tt + 0.4)) * 0.6
    y += lp(brown(n, rng, 10), 90, 2) * 0.8
    y *= env_pts(n, [(0, 0), (rise, 1.0), (dur - 0.4, 1.0), (dur, 0)])
    return np.stack([y, y], axis=1), 0.0


def pressure_swell(rng, dur=2.6, peak=0.8):
    n = ns(dur)
    tt = t_axis(n)
    e = env_pts(n, [(0, 0), (dur * peak, 1.0), (dur, 0.0)]) ** 1.6
    y = (np.sin(2 * np.pi * (24 + 10 * tt / dur) * tt) * 0.7 + lp(brown(n, rng, 8), 120, 2) * 0.8) * e
    y += 0.25 * bp(pink(n, rng), 150, 700, 2) * e
    return decorrelate(y, rng, 0.3), dur * peak


def low_sound_fog(rng, dur=3.4):
    """A low, unidentifiable sound above the fog: a deep moving pressure; no roar, no voice."""
    n = ns(dur)
    tt = t_axis(n)
    e = env_pts(n, [(0, 0), (1.2, 1.0), (2.2, 0.85), (dur, 0)]) ** 1.3
    f = 29 + 5 * np.sin(np.pi * tt / dur)
    y = (np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(f) / SR)) * 0.6
    y += lp(pink(n, rng), 160, 4) * 1.5
    y = lp(y, 220, 4) * e
    return y, 0.0


def launch_downbeat(rng):
    """Charcoal's massive launch downbeat: one immense beat + ground thump + air blast.
    sync = the beat onset (the push lands ~0.35 s later)."""
    beat, _ = charcoal_beat(rng, period=1.6, dist=0.6, scale=0.92, upstroke=False)
    n = ns(4.0)
    st = np.zeros((n, 2))
    place(st, 1.6 * beat, 0)
    k = ns(0.8)
    thump = 1.6 * damped(46, 0.16, 0.8) + 2.2 * lp(white(k, rng), 140, 4) * env_ad(k, 0.004, 0.08, 1)
    place(st, np.stack([thump, thump], axis=1), ns(0.33))
    k = ns(2.6)
    blast = np.stack([bp(pink(k, rng), 250, 6000, 2), bp(pink(k, rng), 250, 6000, 2)], axis=1)
    blast *= env_ad(k, 0.18, 0.9, 1.5)[:, None] * 0.9
    place(st, blast, ns(0.3))
    return st, 0.0


def turf_tear(rng, dur=1.6):
    """Turf ripping as the claws push off: tearing grains (root fibres snapping) + soil."""
    n = ns(dur)
    st = np.zeros((n, 2))
    e = env_pts(n, [(0, 0), (0.05, 1.0), (0.5, 0.7), (dur, 0)])
    for ch in range(2):
        dens = 0.02 * e
        cr = (rng.random(n) < dens).astype(float) * rng.standard_normal(n)
        tear = bp(cr, 600, 5000, 2) * 2.0
        rip = bp(white(n, rng), 300, 3500, 2) * e * (0.5 + 0.5 * control(n, 30, rng)) * 0.5
        soil = lp(white(n, rng), 250, 2) * e * 0.6
        st[:, ch] = tear + rip + soil
    return st, 0.0


def stones_clatter(rng, count=34, dur=3.0):
    """Loose stones jumping and bouncing: granular modal impacts with geometric bounces."""
    n = ns(dur + 0.4)
    st = np.zeros((n, 2))
    for i in range(count):
        big = rng.random() < 0.25
        base = (500 + 900 * rng.random()) if big else (1300 + 4200 * rng.random())
        p = rng.uniform(-0.85, 0.85)
        t = 0.05 + 0.7 * rng.random() ** 1.5
        a = (1.0 if big else 0.5) * (0.5 + 0.5 * rng.random())
        gap = 0.18 + 0.15 * rng.random()
        while a > 0.04 and t < dur:
            m = modal([base, base * 1.58, base * 2.31], [0.025 if big else 0.012, 0.01, 0.006], [1, .5, .3], 0.08, rng, 0.05)
            m += 0.3 * hp(white(ns(0.08), rng), 2000, 2) * env_ad(ns(0.08), 0.0003, 0.002, 1)
            place(st, pan(a * m, p), ns(t))
            t += gap
            gap *= 0.62
            a *= 0.5
    for _ in range(8):     # clods of soil landing
        k = ns(0.12)
        th = 1.5 * lp(white(k, rng), 300, 2) * env_ad(k, 0.002, 0.02, 1)
        place(st, pan(th, rng.uniform(-0.7, 0.7)), ns(0.3 + 1.6 * rng.random()))
    return st, 0.0


def rolling_dust(rng, dur=9.0, peak_s=5.5):
    """Rolling wind and dust: a roar that swells toward the camera and passes, with grit."""
    n = ns(dur)
    e = env_pts(n, [(0, 0), (1.2, 0.55), (peak_s, 1.0), (peak_s + 1.0, 0.8), (dur, 0)]) ** 1.2
    st = np.zeros((n, 2))
    for ch in range(2):
        roar = lp(pink(n, rng), 900, 2) * (0.7 + 0.3 * control(n, 2.5, rng))
        grit = (rng.random(n) < 0.03).astype(float) * rng.standard_normal(n)
        grit = bp(grit, 2500, 9000, 2) * 1.2 + 0.25 * bp(white(n, rng), 3000, 9000, 2)
        st[:, ch] = (roar + grit * e ** 0.5) * e
    return st, peak_s


def debris_settle(rng, dur=4.5):
    """Debris settling after the launch: clods, pebbles, a trickle of grit fading out."""
    n = ns(dur)
    st = np.zeros((n, 2))
    e = np.exp(-t_axis(n) / 1.6)
    for ch in range(2):
        grit = (rng.random(n) < 0.012 * e).astype(float) * rng.standard_normal(n)
        st[:, ch] = bp(grit, 1500, 8000, 2) * 1.5 + 0.1 * bp(white(n, rng), 2500, 8000, 2) * e
    for _ in range(14):
        t = 2.6 * rng.random() ** 1.6
        big = rng.random() < 0.4
        if big:
            k = ns(0.1)
            x = 1.2 * lp(white(k, rng), 300, 2) * env_ad(k, 0.002, 0.02, 1)
        else:
            b = 1500 + 3500 * rng.random()
            x = 0.5 * modal([b, b * 1.6], [0.01, 0.006], [1, .4], 0.05, rng)
        place(st, pan(x * np.exp(-t / 2.0), rng.uniform(-0.8, 0.8)), ns(t))
    return st, 0.0


def heavy_wingbeat(rng, dist=1.5, tail=0.0, scale=1.0):
    return charcoal_beat(rng, dist=dist, scale=scale, upstroke=False, tail=tail)


def distant_wingbeat(rng):
    """A distant deep wingbeat, felt more than heard: low-passed, no identity."""
    b, _ = charcoal_beat(rng, period=1.6, dist=0.0, scale=0.95, upstroke=False)
    b = lp(b, 260, 4)
    return b, 0.0


def banking_wingbeat(rng):
    """One deep banking wingbeat that rings out into the end card (dark tail to silence)."""
    b, _ = charcoal_beat(rng, period=1.6, dist=0.8, scale=0.9, upstroke=False)
    n = ns(5.5)
    st = np.zeros((n, 2))
    place(st, b, 0)
    wet = convolve_st(st, reverb_ir(3.2, 3.8, rng, 3500, 500, predelay=0.05, early=(4, 0.1)))[:n]
    st = 0.75 * st + 0.55 * wet / (np.max(np.abs(wet)) + 1e-9) * np.max(np.abs(st))
    st *= env_pts(n, [(0, 1), (2.0, 1), (n / SR, 0)])[:, None] ** 1.5
    return st, 0.0


# ===================================================================== flight interactions
def jaws_snap(rng):
    """Leaf's small nip at Charcoal's hide: two quick tooth clacks + a soft thud. Not damaging."""
    n = ns(0.4)
    y = np.zeros(n)
    for i, t in enumerate((0.0, 0.055)):
        c = modal([2300, 3700, 5200], [0.012, 0.008, 0.005], [1, .6, .3], 0.06, rng, 0.05)
        c += 0.4 * bp(white(ns(0.06), rng), 1500, 6000, 2) * env_ad(ns(0.06), 0.0005, 0.004, 1)
        place(y, (1.0 - 0.3 * i) * c, ns(t))
    k = ns(0.08)
    place(y, 1.2 * lp(white(k, rng), 300, 2) * env_ad(k, 0.003, 0.02, 1), ns(0.01))
    return y, 0.0


def jaw_open(rng, dur=1.4):
    """Charcoal's jaws opening wide, careful and non-gory: a low slow hinge creak and the air
    he draws in. No teeth, no wet detail."""
    n = ns(dur)
    rate = 16 + 18 * np.clip(t_axis(n) / dur, 0, 1)
    cr = resonate(stick_slip(n, rate, rng, 0.25, 0.3), [140, 310, 620], [6, 7, 8], [1, .6, .3])
    cr = cr / (np.max(np.abs(cr)) + 1e-9) * env_pts(n, [(0, 0), (0.3, 0.6), (0.9, 0.8), (dur, 0)]) * 0.45
    air = resonate(pink(n, rng), [160, 380, 900], [2.5, 3, 3.5], [1, .6, .3])
    air = air / (np.max(np.abs(air)) + 1e-9) * env_pts(n, [(0, 0), (0.6, 0.7), (1.1, 1.0), (dur, 0)])
    y = lp(cr + air, 2000, 2)
    return y, 0.0


def mouth_close_soft(rng):
    """Charcoal's mouth closing over Leaf's head: a soft, muffled, closed-cavity thump only."""
    n = ns(0.5)
    k = ns(0.3)
    y = np.zeros(n)
    place(y, lp(white(k, rng), 220, 4) * env_ad(k, 0.01, 0.05, 1) * 2.0 + damped(70, 0.06, 0.3), 0)
    return y, 0.0


def wet_release(rng):
    """Charcoal releases Leaf: a short, soft, wet slip. Very quiet, brief, non-gory."""
    n = ns(0.5)
    y = lp(bp(white(n, rng), 300, 2600, 2), 2200, 2) * env_pts(n, [(0, 0), (0.04, 1), (0.25, 0.3), (0.5, 0)]) * 0.5
    t = 0.03
    for _ in range(3):
        k = ns(0.01)
        tt = t_axis(k)
        f = 700 + 700 * rng.random()
        place(y, 0.3 * np.sin(2 * np.pi * (f * tt + 0.5 * 6000 * tt ** 2)) * env_ad(k, 0.001, 0.003, 1), ns(t))
        t += 0.05 + 0.05 * rng.random()
    w = bp(pink(ns(0.4), rng), 300, 1800, 2) * env_ad(ns(0.4), 0.06, 0.12, 1.5) * 0.6   # the head jerks back
    place(y, w, ns(0.08))
    return y, 0.0


def equipment_jolt(rng):
    """Riding equipment jolting under load: straps snap taut, buckles clank, the saddle groans."""
    n = ns(1.0)
    y = np.zeros(n)
    k = ns(0.05)
    for t in (0.0, 0.035):
        place(y, 1.2 * bp(white(k, rng), 300, 3200, 2) * env_ad(k, 0.001, 0.008, 1), ns(t))
    for i in range(4):
        m = modal([2900, 4500, 6300], [0.05, 0.035, 0.02], [1, .6, .3], 0.18, rng, 0.05)
        place(y, (0.55 - 0.08 * i) * m, ns(0.02 + 0.06 * i + 0.02 * rng.random()))
    c, _ = leather_creak(rng, 0.5, 1.4)
    place(y, 0.5 * c, ns(0.06))
    return y, 0.0


def scout_whistle(rng, dur=2.0):
    """'Nothing yet; maybe a faint rising whistle': the scout approaching from far ahead."""
    n = ns(dur)
    tt = t_axis(n)
    f = 1800 + 1700 * (tt / dur) ** 2
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.6 + 0.4 * control(n, 12, rng))
    y += 0.8 * sweep_band(white(n, rng), lambda t_: 2200 + 2000 * (t_ / dur) ** 2, 0.25, 1024)
    y *= (tt / dur) ** 2.5
    return y, dur


def scout_pass(rng, v=85.0, d0=6.0, t_c=1.2, dur=3.6):
    """THE PASS: the scout comes head-on, through the gap, close along Leaf's far side, at
    terrifying speed. Doppler rush (R -> L), an N-wave pressure crack at closest approach,
    then a violent turbulent wake that surrounds the listener. sync = the crack."""
    c = 343.0
    n = ns(dur)
    t = t_axis(n)
    x_rel = v * (t - t_c)
    r = np.sqrt(d0 ** 2 + x_rel ** 2)
    v_rad = v * x_rel / r
    dop = c / (c + v_rad)
    gain = (d0 / r) ** 1.15
    nz = pink(n, rng)

    def g(f, tt_):
        dp = np.interp(tt_, t, dop)
        gg = np.interp(tt_, t, gain)
        cen = 1050 * dp ** 2.2 + 800 * gg
        lf = np.log2(np.maximum(f, 1))[:, None]
        return np.exp(-0.5 * ((lf - np.log2(cen[None, :])) / (0.9 + 0.8 * gg[None, :])) ** 2)
    rush = stft_shape(nz, g) * gain
    crack = np.zeros(n)
    nw = ns(0.005)
    place(crack, np.concatenate([np.linspace(0, 1, nw // 4), np.linspace(1, -1, nw // 2), np.linspace(-1, 0, nw // 4)]),
          ns(t_c - 0.0025))
    k = ns(0.03)
    place(crack, 0.6 * hp(white(k, rng), 2200, 2) * env_ad(k, 0.0005, 0.007, 1), ns(t_c))
    mono = 0.9 * rush + 0.75 * crack
    az = np.arctan2(x_rel, d0) / (np.pi / 2)
    st = pan(mono, -np.clip(az, -1, 1) * 0.9)              # +1 = right: enters right, exits left
    k = ns(2.2)
    wake = np.stack([lp(pink(k, rng), 420, 4), lp(pink(k, rng), 420, 4)], axis=1)
    wake *= (env_ad(k, 0.04, 0.6, 1) * (0.6 + 0.4 * control(k, 9, rng)))[:, None] * 0.75
    place(st, wake, ns(t_c))
    st = lp(st, 9000, 2)                                    # far side of Leaf: not quite at the ear
    return st, t_c


# ===================================================================== prologue: sea, ship, bird
def wave_crash(rng, size=1.0):
    """One wave folding against rock: low thump, crash, foam fizz, pebble backwash (stereo)."""
    dur = 6.0
    n = ns(dur)
    st = np.zeros((n, 2))
    for ch in range(2):
        k = ns(1.6)
        th = lp(white(k, rng), 180, 2) * env_ad(k, 0.12, 0.6, 1.5) * 1.4
        cr_k = ns(3.2)
        crash = bp(pink(cr_k, rng), 250, 6500, 2) * env_ad(cr_k, 0.28 + 0.1 * rng.random(), 1.1, 1.6)
        fz_k = ns(4.5)
        fz = bp(pink(fz_k, rng), 2200, 7000, 2) * env_ad(fz_k, 0.5, 1.8, 1.2) * 0.3
        crk = (rng.random(fz_k) < 0.01 * env_ad(fz_k, 0.5, 1.5, 1)).astype(float) * rng.standard_normal(fz_k)
        fz += bp(crk, 2500, 8000, 2) * 0.45
        bw_k = ns(2.5)
        peb = (rng.random(bw_k) < 0.008 * np.exp(-t_axis(bw_k) / 0.9)).astype(float) * rng.standard_normal(bw_k)
        bw = bp(peb, 1800, 6500, 2) * 1.0 + 0.15 * bp(white(bw_k, rng), 800, 4000, 2) * np.exp(-t_axis(bw_k) / 0.8)
        place(st[:, ch], th, 0)
        place(st[:, ch], crash, ns(0.05))
        place(st[:, ch], fz, ns(0.25))
        place(st[:, ch], bw, ns(2.6 + 0.3 * rng.random()))
    return st * size, 0.0


def waves_rock_bed(rng, dur):
    """Waves on a rocky shore, unseen: crashes every ~6-11 s on a continuous wash."""
    n = ns(dur)
    st = np.zeros((n, 2))
    swell = 0.6 + 0.4 * control(n, 0.12, rng)
    for ch in range(2):
        st[:, ch] = lp(pink(n, rng), 1200, 2) * 0.35 * swell
    t = 0.3
    while t < dur:
        w, _ = wave_crash(rng, 0.7 + 0.5 * rng.random())
        place(st, balance(w, rng.uniform(-0.4, 0.3)), ns(t))
        t += 6.0 + 5.0 * rng.random()
    return st, 0.0


def sea_bed(rng, dur, kind="wash"):
    """Open water. wash (generic), calm, heavy (long swell under low cloud), distant, far
    (the sea far below a flying dragon, with faint surf)."""
    n = ns(dur)
    period, depth, cut, lap = {"wash": (7.5, 0.5, 1600, 1.0), "calm": (9.0, 0.3, 1300, 0.6),
                               "heavy": (11.0, 0.7, 1000, 1.2), "distant": (8.0, 0.35, 700, 0.3),
                               "far": (10.0, 0.4, 900, 0.5)}[kind]
    tt = t_axis(n)
    ph = rng.random() * 2 * np.pi
    sw = 1 - depth + depth * (0.5 + 0.5 * np.sin(2 * np.pi * tt / period + ph)) ** 1.5
    sw *= 0.8 + 0.2 * control(n, 0.2, rng)
    st = np.zeros((n, 2))
    for ch in range(2):
        body = lp(pink(n, rng), cut, 2) * sw
        laps = bp(pink(n, rng), 400, 2200, 2) * control(n, 0.6, rng) ** 2 * lap * 0.5
        st[:, ch] = body + laps
        if kind == "heavy":
            st[:, ch] += lp(brown(n, rng, 12), 120, 2) * 0.6 * sw
        if kind == "far":   # surf lines far below: soft periodic hush
            st[:, ch] += hp(pink(n, rng), 1500, 2) * 0.15 * (0.5 + 0.5 * np.sin(2 * np.pi * tt / 6.5 + ph + ch)) ** 3
    return st, 0.0


def hull_slap(rng):
    """Water slapping the knarr's hull: a wooden 'thock' and a splash."""
    n = ns(0.8)
    y = np.zeros(n)
    wood = modal([118, 176, 260, 410], [0.06, 0.05, 0.035, 0.02], [1, .7, .4, .2], 0.4, rng, 0.05)
    k = ns(0.5)
    spl = bp(white(k, rng), 500, 3500, 2) * env_ad(k, 0.01, 0.12, 1.2) * 0.8
    slap = bp(white(ns(0.02), rng), 300, 2500, 2) * env_ad(ns(0.02), 0.0005, 0.004, 1) * 1.5
    place(y, wood * 0.9, 0)
    place(y, slap, 0)
    place(y, spl, ns(0.01))
    return y, 0.0


def rigging_creak(rng, dur=2.8, n_creaks=3):
    """Rigging and hull creak as the vessel heels and crosses: rope fibre and timber creaks."""
    n = ns(dur + 0.6)
    y = np.zeros(n)
    for i in range(n_creaks):
        t = i * dur / n_creaks + 0.3 * rng.random()
        k = ns(0.5 + 0.4 * rng.random())
        rate = (30 + 50 * rng.random()) * (0.6 + 0.8 * np.sin(np.pi * t_axis(k) / (k / SR)))
        f = (np.array([280, 540, 900, 1500]) if i % 2 == 0 else np.array([750, 1300, 2100, 3100]))
        c = resonate(stick_slip(k, rate, rng, 0.3, 0.35), f, [9, 10, 12, 14], [1, .7, .45, .25])
        c *= env_pts(k, [(0, 0), (0.08, 1), (k / SR * 0.7, 0.7), (k / SR, 0)])
        place(y, c / (np.max(np.abs(c)) + 1e-9) * (0.6 + 0.4 * rng.random()), ns(t))
    return y, 0.0


def sail_fill(rng):
    """The square sail fills: a soft canvas 'whump' with ripples, rope taking the load."""
    n = ns(1.6)
    y = np.zeros(n)
    k = ns(0.5)
    wh = bp(pink(k, rng), 90, 900, 2) * env_ad(k, 0.06, 0.12, 1.2) * 1.5
    place(y, wh, 0)
    r = ns(0.9)
    rip = bp(white(r, rng), 400, 3000, 2) * (0.5 + 0.5 * np.sin(2 * np.pi * 11 * t_axis(r))) * env_ad(r, 0.05, 0.3, 1)
    place(y, 0.35 * rip, ns(0.12))
    c, _ = rigging_creak(rng, 0.6, 1)
    place(y, 0.4 * c[: n - ns(0.3)], ns(0.3))
    return y, 0.0


def rope_creak(rng, pulls=(0.0, 0.42)):
    """Rope creaking under a hand: two hard pulls."""
    n = ns(max(pulls) + 0.8)
    y = np.zeros(n)
    for t in pulls:
        k = ns(0.32)
        rate = 80 + 160 * np.sin(np.pi * t_axis(k) / 0.32)
        c = resonate(stick_slip(k, rate, rng, 0.3, 0.3), [900, 1600, 2600], [8, 9, 10], [1, .6, .3])
        c *= env_pts(k, [(0, 0), (0.05, 1), (0.25, 0.6), (0.32, 0)])
        place(y, c / (np.max(np.abs(c)) + 1e-9), ns(t))
        g = ns(0.1)
        place(y, 0.3 * bp(white(g, rng), 1500, 6000, 2) * env_ad(g, 0.01, 0.03, 1), ns(t))
    return y, 0.0


def seabird(rng):
    """A single gull-like call ('kyow'), far off. Harmonic, slightly rough, falling at the end.
    audio-plan.md calls a synthetic gull risky: it is kept distant, short and quiet; replace it
    with a recording (or a checked CC0 file) when one is available."""
    dur = 0.52
    n = ns(dur)
    tt = t_axis(n)
    f0 = np.interp(tt, [0, 0.05, 0.16, 0.42, dur], [980, 1350, 1420, 900, 780])
    ph = np.cumsum(f0 * (1 + 0.006 * rng.standard_normal(n))) / SR
    y = np.zeros(n)
    for h in range(1, 9):
        y += (1.0 / h ** 0.7) * np.sin(2 * np.pi * h * ph + rng.random())
    y *= 1 + 0.18 * np.sin(np.pi * ph)          # slight subharmonic roughness
    y = resonate(y, [2300, 3400, 5200], [3, 4, 5], [1.0, 0.7, 0.3]) + 0.3 * y
    y += 0.12 * bp(white(n, rng), 1500, 6000, 2) * np.max(np.abs(y)) / 3
    y *= env_pts(n, [(0, 0), (0.025, 1), (0.36, 0.85), (dur, 0)])
    return distance(y, 2.2), 0.0


# ===================================================================== beds: wind, room, field
def wind_bed(rng, dur, kind="low"):
    """Ground-level wind. low (meadow), trees (with leaf rustle), distant (hollow), high (airy)."""
    n = ns(dur)
    st = np.zeros((n, 2))
    gust = 0.25 + 0.75 * control(n, 0.22, rng)
    for ch in range(2):
        g = 0.85 * gust + 0.15 * control(n, 0.5, rng)
        if kind == "trees":
            body = lp(pink(n, rng), 600, 2) * g
            leaves = bp(white(n, rng), 1800, 8000, 2) * g ** 2 * (0.6 + 0.4 * control(n, 14, rng)) * 0.5
            st[:, ch] = body + leaves
        elif kind == "distant":
            st[:, ch] = bp(pink(n, rng), 120, 700, 2) * g
        elif kind == "high":
            st[:, ch] = bp(pink(n, rng), 300, 2500, 2) * g + 0.2 * hp(pink(n, rng), 3000, 2) * g ** 2
        else:
            st[:, ch] = lp(pink(n, rng), 900, 2) * g + 0.15 * hp(pink(n, rng), 2500, 2) * g ** 2
    return st, 0.0


def chamber_beds(rng, dur):
    """The birthing chamber: room air (very low), faint wind beyond the high opening, and the oil
    lamp: a soft flame hiss with flicker and rare tiny crackles. Returned as separate layers."""
    n = ns(dur)
    room = np.stack([lp(pink(n, rng), 350, 2), lp(pink(n, rng), 350, 2)], axis=1) * 0.8
    g = 0.3 + 0.7 * control(n, 0.15, rng)
    opening = np.stack([bp(pink(n, rng), 180, 900, 2) * g, bp(pink(n, rng), 180, 900, 2) * g], axis=1)
    opening = balance(opening, 0.35)      # the opening is high on the right of the room
    flick = 0.55 + 0.45 * control(n, 5.0, rng) ** 2          # flame flicker 2-8 Hz
    hiss = bp(white(n, rng), 1400, 7500, 2) * flick
    flut = lp(white(n, rng), 300, 2) * (control(n, 7.0, rng) ** 3) * 0.6   # soft flame flutter
    cr = (rng.random(n) < 0.6 / SR).astype(float)                          # ~0.6 crackles per second
    crack = bp(cr * rng.standard_normal(n), 2000, 8000, 2) * 25
    lamp = pan(hiss + flut + crack, -0.25)
    return {"room": room, "opening": opening, "lamp": lamp}


def bird_call(rng, species):
    """Procedural songbird figures: chip, whistle, trill, warble."""
    if species == "chip":
        k = ns(0.05)
        tt = t_axis(k)
        f = 5200 - 2400 * tt / 0.05
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(k, 0.003, 0.012, 1)
    if species == "whistle":
        d = 0.25 + 0.2 * rng.random()
        k = ns(d)
        tt = t_axis(k)
        a, b = 2600 + 1200 * rng.random(), 2600 + 1600 * rng.random()
        f = a + (b - a) * tt / d + 90 * np.sin(2 * np.pi * 22 * tt)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_pts(k, [(0, 0), (0.02, 1), (d - 0.04, 0.8), (d, 0)])
    if species == "trill":
        d = 0.5 + 0.4 * rng.random()
        k = ns(d)
        tt = t_axis(k)
        f = 4800 + 600 * rng.random() + 300 * np.sin(2 * np.pi * 3 * tt)
        am = (0.5 + 0.5 * np.sin(2 * np.pi * (24 + 8 * rng.random()) * tt)) ** 3
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * am * env_pts(k, [(0, 0), (0.03, 1), (d, 0)])
    d = 0.6 + 0.4 * rng.random()   # warble
    k = ns(d)
    tt = t_axis(k)
    f = 3200 + 900 * np.sin(2 * np.pi * (7 + 4 * rng.random()) * tt) + 500 * control(k, 6, rng)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_pts(k, [(0, 0), (0.05, 1), (d - 0.1, 0.7), (d, 0)])


def birds_bed(rng, dur, density=1.0):
    """Morning birds over the riding grounds: a few species at different distances and sides."""
    n = ns(dur)
    st = np.zeros((n, 2))
    voices = [("chip", -0.6, 1.6, 0.9), ("whistle", 0.5, 2.0, 0.8), ("trill", -0.2, 2.4, 0.5),
              ("warble", 0.75, 2.2, 0.6), ("chip", 0.3, 2.6, 0.7), ("whistle", -0.8, 2.8, 0.5)]
    for sp, p, dist_, a in voices:
        t = rng.random() * 3
        while t < dur:
            if sp == "chip":
                for j in range(int(rng.integers(2, 6))):
                    x = bird_call(rng, sp)
                    place(st, pan(distance(x, dist_) * a, p), ns(t + 0.13 * j))
            else:
                x = bird_call(rng, sp)
                place(st, pan(distance(x, dist_) * a, p + 0.1 * rng.standard_normal()), ns(t))
            t += (3.0 + 6.0 * rng.random()) / density
    return st, 0.0


def altitude_layers(rng, dur):
    """High-altitude wind, as separate layers so the mix can change it with altitude, speed and
    perspective: body (dark roar), whoosh (mid), hiss (high), buffet (low flutter at the
    rider's ear), whistle (tonal moans in straps and wing edges). All share one gust curve."""
    n = ns(dur)
    gust = 0.2 + 0.8 * control(n, 0.2, rng)
    gust2 = gust * (0.85 + 0.15 * control(n, 1.3, rng))
    layers = {}
    body, whoosh, hiss, buffet, whistle = (np.zeros((n, 2)) for _ in range(5))
    for ch in range(2):
        body[:, ch] = lp(pink(n, rng), 650, 2) * gust2
        whoosh[:, ch] = bp(pink(n, rng), 450, 2200, 2) * gust2 ** 1.3
        hiss[:, ch] = hp(pink(n, rng), 2800, 2) * gust2 ** 2
        fl = 0.3 + 0.7 * control(n, 7.0, rng) ** 2
        buffet[:, ch] = lp(brown(n, rng, 25), 140, 2) * fl * (0.5 + 0.5 * gust)
        w = np.zeros(n)
        for fc, q in ((430, 25), (690, 30), (1150, 35)):
            b, a = signal.iirpeak(fc * (1 + 0.02 * ch), q, fs=SR)
            w += signal.lfilter(b, a, pink(n, rng)) * control(n, 0.35, rng) ** 2
        whistle[:, ch] = w * gust ** 2
    for name, x in (("body", body), ("whoosh", whoosh), ("hiss", hiss), ("buffet", buffet), ("whistle", whistle)):
        layers[name] = norm_rms(x)
    return layers


# ===================================================================== registry (for the test harness)
GENERATORS = {
    "charcoal_beat": lambda r: charcoal_beat(r, dist=1.0),
    "leaf_beat": lambda r: leaf_beat(r, dist=0.5),
    "scout_beat": lambda r: scout_beat(r),
    "charcoal_exhale": lambda r: charcoal_exhale(r),
    "charcoal_low_breath": lambda r: charcoal_low_breath(r),
    "leaf_breath": lambda r: leaf_breath(r),
    "leaf_chirr": lambda r: leaf_breath(r, "chirr"),
    "leaf_squeak_muffled": leaf_squeak_muffled,
    "hatchling_breath_laboured": lambda r: hatchling_breath(r, "laboured", 7, 0.65),
    "hatchling_effort": hatchling_effort,
    "egg_scratch": lambda r: egg_scratch(r),
    "shell_crack": lambda r: shell_crack(r),
    "shell_creak_pressure": lambda r: shell_creak(r, "pressure"),
    "shell_creak_wet": lambda r: shell_creak(r, "wet"),
    "shell_fragment_drop": lambda r: shell_fragment(r, "drop"),
    "shell_break": shell_break,
    "footsteps": lambda r: footsteps(r, [0, 0.55, 1.1]),
    "cloth_gown": lambda r: cloth(r, 0.9),
    "door_open": lambda r: door(r, "open"),
    "door_close": lambda r: door(r, "close"),
    "knee_stone": knee_stone,
    "bedding_rustle": lambda r: bedding_rustle(r),
    "strap_leather": lambda r: strap_leather(r),
    "saddle_creak": saddle_creak,
    "rig_climb": lambda r: rig_climb(r),
    "harness_clips": lambda r: harness_clips(r),
    "gate_noise": gate_noise,
    "claws_turf": lambda r: claws_turf(r),
    "wing_unfold_leaf": lambda r: wing_unfold(r, "leaf"),
    "wing_unfold_charcoal": lambda r: wing_unfold(r, "charcoal"),
    "grass_hiss": lambda r: grass_hiss(r),
    "grass_rush": lambda r: grass_rush(r),
    "sub_layer": lambda r: sub_layer(r, 6.0),
    "pressure_swell": lambda r: pressure_swell(r),
    "low_sound_fog": low_sound_fog,
    "launch_downbeat": launch_downbeat,
    "turf_tear": lambda r: turf_tear(r),
    "stones_clatter": lambda r: stones_clatter(r),
    "rolling_dust": lambda r: rolling_dust(r),
    "debris_settle": lambda r: debris_settle(r),
    "distant_wingbeat": distant_wingbeat,
    "banking_wingbeat": banking_wingbeat,
    "jaws_snap": jaws_snap,
    "jaw_open": lambda r: jaw_open(r),
    "wet_release": wet_release,
    "equipment_jolt": equipment_jolt,
    "scout_whistle": lambda r: scout_whistle(r),
    "scout_pass": lambda r: scout_pass(r),
    "hull_slap": hull_slap,
    "rigging_creak": lambda r: rigging_creak(r),
    "sail_fill": sail_fill,
    "rope_creak": lambda r: rope_creak(r),
    "seabird": seabird,
    "wave_crash": lambda r: wave_crash(r),
}


def metrics(x):
    m = x if x.ndim == 1 else x.mean(axis=1)
    f, P = signal.welch(m, SR, nperseg=4096)
    cen = float(np.sum(f * P) / (np.sum(P) + 1e-20))
    e = short_rms(x, 0.01)
    return {"dur_s": round(len(x) / SR, 3), "peak_dbfs": round(float(20 * np.log10(np.max(np.abs(x)) + 1e-12)), 2),
            "active_rms_dbfs": round(float(20 * np.log10(active_rms(x))), 2),
            "crest_db": round(float(20 * np.log10(np.max(np.abs(x)) / active_rms(x))), 1),
            "centroid_hz": round(cen), "below_250hz_pct": round(float(100 * P[f < 250].sum() / (P.sum() + 1e-20)), 1),
            "t_peak_s": round(float(np.argmax(e) / SR), 3), "finite": bool(np.all(np.isfinite(x)))}


if __name__ == "__main__":
    import soundfile as sf
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if out:
        out.mkdir(parents=True, exist_ok=True)
    res = {}
    for name, fn in GENERATORS.items():
        y, sync = fn(rng_for("test", name))
        y = norm_cue(y)
        res[name] = {"sync_s": round(sync, 3), **metrics(y)}
        if out:
            sf.write(str(out / f"{name}.wav"), y.astype(np.float32), SR, subtype="PCM_24")
    print(json.dumps(res, indent=1))
