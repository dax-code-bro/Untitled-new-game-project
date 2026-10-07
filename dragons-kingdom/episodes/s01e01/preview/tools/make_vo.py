#!/usr/bin/env python3
"""make_vo.py - provisional TTS voice takes for the S01E01 work-in-progress preview.

Scope: every spoken line of the ORIGINAL screenplay from the PROLOGUE through
scene 1E (dialogue.json L001..L078; the last line is Remi's "Attack.").
Nothing from screenplay-extended.md is included.

Reads (never modifies): ../../dialogue.json, ../../voices.json,
../../shotlist.json, ../../screenplay.md

Writes (relative to episodes/s01e01/preview/):
  vo/<line_id>.wav  48 kHz, mono, 24-bit PCM, dry take (git-ignored binary)
  vo/takes.json     one record per line: role, voice + settings, exact text,
                    treatment, mix hints, duration, level, sha256, checks
  vo/words.json     word timings from forced alignment (pocketsphinx), for
                    subtitle timing and mouth cues

Usage (run with the preview venv; see requirements-vo.txt):
  python -I make_vo.py                    render every line, then verify
  python -I make_vo.py --only L011,L072   render only these (takes.json keeps the rest)
  python -I make_vo.py --verify           verify the existing files only
  python -I make_vo.py --repeat-check L011,L046,L072
                                          render again in memory, compare sha256

Environment:
  DK_KOKORO_DIR   folder with kokoro-v1.0.int8.onnx + voices-v1.0.bin
                  (checked by sha256; download URL is printed if missing)
  DK_THREADS      onnxruntime threads (default 1)
  DK_ESPEAK_LIB / DK_ESPEAK_DATA   espeak-ng library / data (system 1.51 default)

Determinism: Kokoro is deterministic for the same model, voice, text and speed;
SoX runs with -R (repeatable) and -D (no dither); every noise source (whisper,
breath, tremor) uses a fixed seed derived from the line id. Re-running gives
byte-identical WAVs (use --repeat-check to prove it on this machine).
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import zlib
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal
from scipy.linalg import solve_toeplitz
from scipy.ndimage import binary_opening, maximum_filter1d, minimum_filter1d, uniform_filter1d

HERE = Path(__file__).resolve().parent
PREVIEW = HERE.parent
EP = PREVIEW.parent
VO = PREVIEW / "vo"
REL = lambda p: str(Path(p).resolve().relative_to(EP.parents[2]))  # repo-relative path

SR_TTS = 24000
SR = 48000
SEED_BASE = 20261007
SCOPE_SCENES = ("PROLOGUE", "TITLE", "1A", "1B", "1C", "1D", "1E")
FIRST_LINE, LAST_LINE = "L001", "L078"
ORIGINAL_IDS = ("L011", "L046", "L047", "L048")
TARGET_RMS_DBFS = -20.0       # voices.json render_defaults.line_level
PEAK_CEILING_DBFS = -3.0
EDGE_KEEP_S = 0.04            # voices.json render_defaults.trim
EDGE_FADE_S = 0.005
AIR_SETS = {"SKY_OFF_VERDOR", "COASTAL_SKY_WATER", "CLING_SKY"}
SPACES = {  # audio-plan.md section "Spaces"; applied in the mix, never baked into a take
    "NARRATION": "non-diegetic narration: dry, no room",
    "BIRTHING_CHAMBER": "small warm room (birthing chamber)",
    "VERDOR_GROUNDS": "open air, little reverb (riding grounds)",
    "SKY_OFF_VERDOR": "sky: almost no reverb; wind bed added in the mix",
}
MODEL_FILES = {
    "kokoro-v1.0.int8.onnx": "6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}
MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
MODEL_DIRS = [os.environ.get("DK_KOKORO_DIR"), str(PREVIEW / ".cache" / "kokoro"),
              "/tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/"
              "scratchpad/preprod/audio/voices"]
ESPEAK_LIB = os.environ.get("DK_ESPEAK_LIB", "/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1")
ESPEAK_DATA = os.environ.get("DK_ESPEAK_DATA", "/usr/lib/x86_64-linux-gnu/espeak-ng-data")
# voices.json engines.kokoro.caution: never cast voices named after a commercial product's voices
EXCLUDED_VOICES = {"af_alloy", "af_nova", "am_echo", "am_onyx", "bm_fable", "am_santa"}
VOICE_LICENSE = "Apache-2.0 (Kokoro-82M v1.0 voice pack, hexgrad; ONNX export by thewh1teagle/kokoro-onnx)"

# --------------------------------------------------------------------------------------
# Performance. Every value here is a provisional directing choice for a scratch preview.
# Sources: dialogue.json delivery/performance_note, voices.json special_lines, the
# shot list's sound notes, and the preview brief (whisper, pain, shout, firm commands).
# Files are always normalized to the same level; 'mix_gain_db' tells the mix where the
# performance level sits (audio-plan.md: whisper -10..-12, quiet -5..-6, shout +3..+4).
# --------------------------------------------------------------------------------------
PRESETS = {
    "plain": {},
    "narration": {},
    "aside": {},
    "directional": {},
    "whisper": {"speed_abs": 0.8, "whisper": {"tilt": 0.5, "voiced_duck_db": 5.0},
                "eq": [("highpass", 220.0, 0.0, 0.707)], "mix_gain_db": -11.0},
    "quiet": {"speed_mul": 0.92, "breathy": 0.12, "eq": [("highshelf", 4000.0, -2.0, 0.707)],
              "mix_gain_db": -5.5},
    "pain": {"speed_mul": 0.9, "pitch_st": 1.5, "breathy": 0.30,
             "tremor": {"am_db": 2.0, "fm_cents": 30.0},
             "eq": [("highpass", 170.0, 0.0, 0.707), ("peak", 350.0, -3.0, 1.0), ("peak", 2500.0, 2.0, 1.0)],
             "breath": "inhale", "mix_gain_db": -1.5},
    "shout": {"speed_mul": 1.08, "pitch_st": 3.0, "gap_s": 0.12,
              "eq": [("lowshelf", 250.0, -3.0, 0.707), ("peak", 2800.0, 4.0, 0.9)], "drive": 2.5,
              "mix_gain_db": 3.5},
    "raised": {"speed_mul": 1.08, "pitch_st": 2.0,
               "eq": [("lowshelf", 250.0, -2.0, 0.707), ("peak", 2800.0, 3.0, 0.9)], "drive": 1.8,
               "mix_gain_db": 3.0},
    "urgent": {"speed_mul": 1.05, "gap_s": 0.12, "mix_gain_db": 1.0},
    "firm": {"gap_s": 0.2},
    "command": {"speed_mul": 1.05, "eq": [("peak", 2800.0, 2.0, 1.0)], "drive": 1.4, "tail_keep_s": 0.02,
                "mix_gain_db": 1.0},
}
PERF = {  # line id -> (preset, overrides, why)
    "L011": ("whisper", {}, "[ORIGINAL; whispered] Spoken only for the hatchling, not the room "
             "(dialogue.json performance_note, voices.json special_lines.L011). Real whisper treatment: "
             "the voiced source is replaced by noise through the line's own LPC vocal-tract filter (no "
             "pitch left), vowels ducked against consonants, brighter tilt, 220 Hz high-pass."),
    "L012": ("plain", {"mix_gain_db": 1.0}, "Shot 1A-18: Abby slightly too loud for the room."),
    "L020": ("quiet", {}, "performance_note 'quietly' (voices.json special_lines.L020)."),
    "L032": ("directional", {}, "Ordinary rider-to-dragon direction, not a canonical command; familiar, not cross."),
    "L037": ("raised", {}, "Called across the field (shot 1B-08; voices.json special_lines.L037)."),
    "L042": ("aside", {}, "Close, clear aside for Abby and the viewer; not masked (voices.json special_lines.L042)."),
    "L062": ("quiet", {}, "performance_note 'quietly'; ordinary speech, not the Hold command (special_lines.L062)."),
    "L070": ("shout", {"speed_mul": 1.0}, "Shouted over the wind right after the scout's pass (dialogue.json delivery, "
             "special_lines.L070). Role speed kept (not x1.08): a single called name carries over wind on a held vowel."),
    "L071": ("shout", {}, "Urgent, clipped with fear; raised over the wind (special_lines.L071)."),
    "L072": ("pain", {"breath": "gasp", "cutoff_s": 0.075},
             "Abby in pain from here on: the first words she can form; pain cuts the line off "
             "(special_lines.L072: cut 60-90 ms before the natural end with a 10-15 ms fade)."),
    "L073": ("urgent", {}, "Clipped, urgent (dialogue.json delivery)."),
    "L074": ("urgent", {"speed_mul": 1.03, "mix_gain_db": 0.5}, "Close alongside, checking she is secure; urgent but not shouted."),
    "L075": ("pain", {}, "through pain: narrow voice, but still herself (special_lines.L075)."),
    "L076": ("firm", {}, "Firm (dialogue.json delivery)."),
    "L077": ("pain", {"speed_mul": 0.95, "gap_s": 0.2},
             "Urging Leaf home through the pain; ordinary direction, not a canonical command."),
    "L078": ("command", {}, "Canonical dragon command 'Attack' = physical attack (never flame). Short and firm, "
             "no exclamation (special_lines.L078)."),
}

PS_EXTRA_WORDS = {  # pocketsphinx pronunciations for names missing from its dictionary (check only)
    "bashion": "B AE SH AH N", "bashions": "B AE SH AH N Z", "verdor": "V ER D AO R",
    "nightwings": "N AY T W IH NG Z", "scrapper": "S K R AE P ER", "tara": "T AA R AH",
}


# ------------------------------------------------------------------------------- utils
def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def db(x):
    return 20.0 * np.log10(max(float(x), 1e-12))


def seed_for(lid, salt):
    return (SEED_BASE + zlib.crc32(f"{lid}:{salt}".encode())) % (2 ** 32)


def frame_rms(x, sr, frame_s):
    fr = max(1, int(frame_s * sr))
    m = len(x) // fr
    if m == 0:
        return np.array([np.sqrt(np.mean(x ** 2))]), fr
    return np.sqrt(np.mean(x[: m * fr].reshape(m, fr) ** 2, axis=1)), fr


def voiced_rms(x, sr=SR):
    """RMS over the voiced part (20 ms frames above 10% of the loudest frame) - audition.py rule."""
    r, _ = frame_rms(x, sr, 0.02)
    v = r[r > 0.1 * r.max()]
    return float(np.sqrt(np.mean(v ** 2))) if len(v) else 0.0


def speech_bounds(x, sr, rel_db=-45.0):
    r, fr = frame_rms(x, sr, 0.005)
    on = np.where(r > r.max() * 10 ** (rel_db / 20))[0]
    if not len(on):
        return 0, len(x)
    return int(on[0] * fr), int(min(len(x), (on[-1] + 1) * fr))


def trim(x, sr, keep_lead, keep_tail, fade=EDGE_FADE_S):
    """Keep keep_lead/keep_tail seconds around the speech, 5 ms fades (voices.json render_defaults.trim)."""
    a, b = speech_bounds(x, sr)
    a0, b0 = a - int(keep_lead * sr), b + int(keep_tail * sr)
    pad_l, pad_r = max(0, -a0), max(0, b0 - len(x))
    y = np.concatenate([np.zeros(pad_l), x[max(0, a0): min(len(x), b0)], np.zeros(pad_r)])
    f = int(fade * sr)
    if f and len(y) > 2 * f:
        y[:f] *= np.sin(np.linspace(0, np.pi / 2, f)) ** 2
        y[-f:] *= np.cos(np.linspace(0, np.pi / 2, f)) ** 2
    return y, a - max(0, a0) + pad_l  # signal, offset of original sample a (speech start) in y


def sox(x, sr, *effects):
    with tempfile.TemporaryDirectory() as td:
        a, b = Path(td) / "a.wav", Path(td) / "b.wav"
        sf.write(str(a), x, sr, subtype="FLOAT")
        subprocess.run(["sox", "-R", "-D", str(a), "-e", "floating-point", "-b", "32", str(b), *effects],
                       check=True, capture_output=True)
        y, sr2 = sf.read(str(b), dtype="float64")
    return y, sr2


def biquad(kind, f0, gain_db, q, sr=SR):
    """RBJ audio-EQ-cookbook biquad as one SOS row."""
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / sr
    cw, sw = np.cos(w), np.sin(w)
    al = sw / (2 * q)
    if kind == "peak":
        b = [1 + al * A, -2 * cw, 1 - al * A]; a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind == "highpass":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind in ("lowshelf", "highshelf"):
        s = 1 if kind == "lowshelf" else -1
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - s * (A - 1) * cw + sq), s * 2 * A * ((A - 1) - s * (A + 1) * cw),
             A * ((A + 1) - s * (A - 1) * cw - sq)]
        a = [(A + 1) + s * (A - 1) * cw + sq, -s * 2 * ((A - 1) + s * (A + 1) * cw),
             (A + 1) + s * (A - 1) * cw - sq]
    else:
        raise ValueError(kind)
    b, a = np.array(b) / a[0], np.array(a) / a[0]
    return np.concatenate([b, a])


def eq(x, bands, sr=SR):
    if not bands:
        return x
    sos = np.array([biquad(k, f, g, q, sr) for k, f, g, q in bands])
    return signal.sosfilt(sos, x)


# ----------------------------------------------------------------------- voice DSP
def autocorr_voicing(r, sr, rw):
    """Normalized autocorrelation peak in the 70-400 Hz lag range (window-bias corrected)."""
    lo, hi = int(sr / 400), int(sr / 70)
    if r[0] <= 0:
        return 0.0
    rn = r[: hi + 1] / np.maximum(rw[: hi + 1], 1e-9) * rw[0]
    return float(np.clip(np.max(rn[lo:hi + 1]) / rn[0], 0, 1))


def lpc_noise(x, sr, rng, tilt=0.5, voiced_duck_db=0.0, order=None, nper=512, hop=128):
    """Unvoiced (whispered) copy of x.

    Per STFT frame: LPC vocal-tract envelope of the pre-emphasized frame (Levinson), applied to
    white noise, energy matched to the frame. 'tilt' keeps that share of the pre-emphasis boost
    (whispers are brighter than voiced speech). Frames that were strongly voiced (vowels) are
    ducked by up to 'voiced_duck_db', since in a real whisper consonants carry relatively more
    energy than vowels. No glottal pulse survives, so there is no pitch.
    """
    order = order or int(sr / 1000) + 2
    win = signal.get_window("hann", nper)
    f, t, Z = signal.stft(x, fs=sr, window=win, nperseg=nper, noverlap=nper - hop)
    pre = 1 - 0.95 * np.exp(-1j * 2 * np.pi * f / sr)
    rw = np.correlate(win, win, "full")[nper - 1:]
    W = np.zeros_like(Z)
    voicing = np.zeros(Z.shape[1])
    noise = (rng.standard_normal(Z.shape) + 1j * rng.standard_normal(Z.shape)) / np.sqrt(2)
    for j in range(Z.shape[1]):
        P = np.abs(Z[:, j]) ** 2
        e = float(P.sum())
        if e < 1e-14:
            continue
        r_pre = np.fft.irfft(P * np.abs(pre) ** 2, nper)
        r_pre[0] *= 1.0001  # white-noise correction (-40 dB floor) keeps Levinson well conditioned
        a = solve_toeplitz(r_pre[:order], r_pre[1:order + 1])
        A = np.fft.rfft(np.concatenate([[1.0], -a]), nper)
        env = 1.0 / np.maximum(np.abs(A), 1e-6) * np.abs(pre) ** (tilt - 1.0)
        Wj = env * noise[:, j]
        Wj *= np.sqrt(e / max(float(np.sum(np.abs(Wj) ** 2)), 1e-20))
        v = autocorr_voicing(np.fft.irfft(P, nper), sr, rw)
        voicing[j] = v
        if voiced_duck_db:
            Wj *= 10 ** (-voiced_duck_db / 20 * np.clip((v - 0.35) / 0.35, 0, 1))
        W[:, j] = Wj
    _, w = signal.istft(W, fs=sr, window=win, nperseg=nper, noverlap=nper - hop)
    w = w[: len(x)]
    return np.pad(w, (0, len(x) - len(w))), voicing


def lpc_envelopes(Z, f, sr, order, nper, lag_bw_hz=60.0, gamma=0.985):
    """Per-frame smoothed LPC envelope 1/|A|: Gaussian lag window (60 Hz) and bandwidth
    expansion (0.985) so the envelope follows formants, not individual harmonics."""
    E = np.ones(Z.shape)
    k = np.arange(order + 1)
    lag = np.exp(-0.5 * (2 * np.pi * lag_bw_hz * k / sr) ** 2)
    for j in range(Z.shape[1]):
        P = np.abs(Z[:, j]) ** 2
        if P.sum() < 1e-14:
            continue
        r = np.fft.irfft(P, nper)[: order + 1] * lag
        r[0] *= 1.0001
        a = solve_toeplitz(r[:order], r[1:order + 1]) * gamma ** k[1:]
        E[:, j] = 1.0 / np.maximum(np.abs(np.fft.rfft(np.concatenate([[1.0], -a]), nper)), 1e-6)
    return E


def pitch_shift_fp(x, sr, semitones, nper=512, hop=128):
    """Formant-preserving pitch shift: whiten each frame by its LPC envelope, shift the flat
    residual with SoX 'pitch' (duration kept), then re-apply the original envelopes. Raises the
    voice without the 'smaller head' formant shift a plain pitch shift gives."""
    order = int(sr / 1000) + 2
    win = signal.get_window("hann", nper)
    kw = dict(fs=sr, window=win, nperseg=nper, noverlap=nper - hop)
    f, _, Z = signal.stft(x, **kw)
    E = lpc_envelopes(Z, f, sr, order, nper)
    _, r = signal.istft(Z / E, **kw)
    r = r[: len(x)]
    rs, _ = sox(r, sr, "pitch", str(int(round(semitones * 100))))
    rs = np.pad(rs, (0, max(0, len(x) - len(rs))))[: len(x)]
    _, _, Zs = signal.stft(rs, **kw)
    n = min(Zs.shape[1], E.shape[1])
    _, y = signal.istft(Zs[:, :n] * E[:, :n], **kw)
    y = np.pad(y[: len(x)], (0, max(0, len(x) - len(y))))
    # splices in the shifted residual leave sub-bass that the envelope would lift: remove below 70 Hz
    y = signal.sosfilt(signal.butter(4, 70, "high", fs=sr, output="sos"), y)
    return y * (np.sqrt(np.mean(x ** 2)) / max(np.sqrt(np.mean(y ** 2)), 1e-12))


def tremor(x, sr, rng, am_db, fm_cents):
    """Irregular shake: amplitude wobble +/-am_db and pitch wobble +/-fm_cents (fractional delay)."""
    n = np.arange(len(x)) / sr

    def lfo(freqs):
        ph = rng.uniform(0, 2 * np.pi, len(freqs))
        s = sum(np.sin(2 * np.pi * fq * n + p) for fq, p in zip(freqs, ph))
        return s / len(freqs)

    am = 10 ** (am_db / 20 * lfo([4.7, 6.9, 2.3]))
    f_mod = 5.6
    depth = (2 ** (fm_cents / 1200) - 1) * sr / (2 * np.pi * f_mod)
    d = depth * lfo([f_mod, 7.3])
    y = np.interp(np.arange(len(x)) - d, np.arange(len(x)), x)
    return y * am


def saturate(x, drive):
    pk = np.max(np.abs(x)) + 1e-12
    return np.tanh(drive * x / pk) / np.tanh(drive) * pk


def deess(x, sr=SR, lo=4500.0, hi=10000.0, thr_db=-6.0, ratio=2.5, max_db=4.0):
    """Light split-band de-esser. The 4.5-10 kHz band is split off with a zero-phase filter (so
    band + rest == x exactly), and turned down only where it dominates for >= 30 ms, by at most 4 dB."""
    sos = signal.butter(4, [lo, hi], "bandpass", fs=sr, output="sos")
    s = signal.sosfiltfilt(sos, x)
    rest = x - s
    w = int(0.005 * sr)
    es = np.sqrt(np.maximum(uniform_filter1d(s ** 2, w), 0.0) + 1e-18)  # clamp: running means of squares
    ex = np.sqrt(np.maximum(uniform_filter1d(x ** 2, w), 0.0) + 1e-18)  # can dip below 0 by rounding
    rel = 20 * np.log10(es / ex)
    loud = es > np.max(es) * 10 ** (-30 / 20)
    # sibilants hold the high band for 60-150 ms; plosive bursts ("t", "k") for 10-30 ms: only act on
    # high-band dominance that lasts at least 30 ms
    hold = int(0.03 * sr)
    sustained = binary_opening((rel > thr_db) & loud, structure=np.ones(hold, dtype=bool))
    gr = np.clip((rel - thr_db) * (1 - 1 / ratio), 0, max_db) * sustained
    a, r = int(0.001 * sr), int(0.025 * sr)
    gr = uniform_filter1d(maximum_filter1d(gr, r), a)
    y = rest + s * 10 ** (-gr / 20)
    return y, {"max_gr_db": round(float(gr.max()), 2), "active_pct": round(100 * float(np.mean(gr > 0.5)), 1)}


def limiter(x, sr=SR, ceiling_db=PEAK_CEILING_DBFS, look_ms=2.0, rel_ms=60.0):
    """Look-ahead peak limiter on 1 ms blocks; the gain never exceeds what any sample needs."""
    c = 10 ** (ceiling_db / 20)
    blk = int(0.001 * sr)
    nb = int(np.ceil(len(x) / blk))
    xp = np.pad(np.abs(x), (0, nb * blk - len(x)))
    need = np.minimum(1.0, c / np.maximum(xp.reshape(nb, blk).max(axis=1), 1e-12))
    la = max(1, int(look_ms / 1.0))
    g = minimum_filter1d(need, 2 * la + 1)
    rel = np.exp(-1.0 / rel_ms)
    out = np.empty_like(g)
    prev = 1.0
    for i, gi in enumerate(g):
        prev = gi if gi < prev else min(gi, 1 - (1 - prev) * rel)
        out[i] = prev
    out = np.minimum(out, minimum_filter1d(need, 3))  # block i interpolates toward i+1: cover both
    knots = np.concatenate([out, out[-1:]])
    gs = np.interp(np.arange(nb * blk) / blk, np.arange(nb + 1), knots)[: len(x)]
    y = x * gs
    return np.clip(y, -c, c), round(db(1.0 / max(float(gs.min()), 1e-12)), 2)


def normalize(x, sr=SR):
    """Voiced RMS to -20 dBFS with peaks <= -3 dBFS (voices.json render_defaults.line_level)."""
    y = x * 10 ** (TARGET_RMS_DBFS / 20) / max(voiced_rms(x, sr), 1e-12)
    max_gr = 0.0
    for _ in range(3):  # limiting lowers the RMS a little: re-aim and re-limit
        y, gr = limiter(y, sr)
        max_gr = max(max_gr, gr)
        err = TARGET_RMS_DBFS - db(voiced_rms(y, sr))
        if abs(err) < 0.05:
            break
        y = y * 10 ** (err / 20)
    y, gr = limiter(y, sr)
    return y, max(max_gr, gr)


def breath(sr, kind, rng):
    """Synthetic mouth breath: band-limited noise with an inhale-shaped envelope."""
    dur, rise, level, gap = {"inhale": (0.30, 0.65, -31.0, 0.07), "gasp": (0.20, 0.35, -27.0, 0.05)}[kind]
    n = int(dur * sr)
    z = rng.standard_normal(n)
    z = signal.sosfilt(signal.butter(2, [350, 6000], "bandpass", fs=sr, output="sos"), z)
    z = eq(z, [("peak", 1400.0, 6.0, 1.2), ("peak", 3200.0, 3.0, 1.5)], sr)
    k = int(rise * n)
    env = np.concatenate([np.sin(np.linspace(0, np.pi / 2, k)) ** 2, np.cos(np.linspace(0, np.pi / 2, n - k)) ** 2])
    z *= env
    z *= 10 ** (level / 20) / (np.sqrt(np.mean(z[env > 0.1] ** 2)) + 1e-12)
    return z, gap


# --------------------------------------------------------------------------- metrics
def harmonicity(x, sr):
    """Over loud 40 ms frames: median normalized autocorrelation peak (70-400 Hz lags; ~0.8 voiced speech,
    ~0.3 for formant-coloured noise), median f0 of clearly voiced frames, and the share of frames that are
    clearly voiced (peak > 0.6)."""
    win, hop = int(0.04 * sr), int(0.01 * sr)
    lo, hi = int(sr / 400), int(sr / 70)
    r_all = np.sqrt(np.mean(x ** 2))
    vals, f0s = [], []
    nfft = 1 << int(np.ceil(np.log2(2 * win)))
    for i in range(0, len(x) - win, hop):
        fr = x[i:i + win] - np.mean(x[i:i + win])
        if np.sqrt(np.mean(fr ** 2)) < 0.5 * r_all:
            continue
        ac = np.fft.irfft(np.abs(np.fft.rfft(fr, nfft)) ** 2)[:win]
        if ac[0] <= 0:
            continue
        k = int(np.argmax(ac[lo:hi])) + lo
        vals.append(ac[k] / ac[0])
        if ac[k] / ac[0] > 0.5:
            f0s.append(sr / k)
    return (round(float(np.median(vals)), 3) if vals else None,
            round(float(np.median(f0s)), 1) if f0s else None,
            round(float(np.mean(np.array(vals) > 0.6)), 3) if vals else None)


def centroid(x, sr):
    """Energy-weighted spectral centroid of the loud part, in Hz."""
    f, t, Z = signal.stft(x, fs=sr, nperseg=1024)
    P = np.abs(Z) ** 2
    e = P.sum(0)
    P = P[:, e > 0.05 * e.max()]
    return round(float((f[:, None] * P).sum() / max(P.sum(), 1e-20)), 0)


# ------------------------------------------------------------------------------ data
def load_data():
    D = json.loads((EP / "dialogue.json").read_text(encoding="utf-8"))
    V = json.loads((EP / "voices.json").read_text(encoding="utf-8"))
    S = json.loads((EP / "shotlist.json").read_text(encoding="utf-8"))
    return D, V, S


def scope_lines(D):
    lines = [l for l in D["lines"] if l["scene"] in SCOPE_SCENES]
    ids = [l["id"] for l in lines]
    want = [f"L{i:03d}" for i in range(int(FIRST_LINE[1:]), int(LAST_LINE[1:]) + 1)]
    assert ids == want, f"scope must be exactly {FIRST_LINE}..{LAST_LINE}, got {ids[:3]}..{ids[-3:]}"
    last = lines[-1]
    assert (last["speaker"], last["text"], last["scene"]) == ("REMI", "Attack.", "1E"), last
    assert last["command"] and last["command"]["type"] == "canonical" and "physical attack" in last["command"]["meaning"]
    nxt = [l for l in D["lines"] if l["scene"] not in SCOPE_SCENES and l["id"] > LAST_LINE]
    assert nxt and nxt[0]["scene"] == "1F", "the line after the scope must open 1F"
    return lines


def shots_by_line(S):
    out = {}
    for sh in S["shots"]:
        for d in sh.get("dialogue") or []:
            out.setdefault(d["id"], []).append((sh["id"], sh["set"]))
    return out


def screenplay_originals():
    """The [ORIGINAL] lines as written in screenplay.md: cue quotes plus CANON LOCK item 8."""
    text = (EP / "screenplay.md").read_text(encoding="utf-8")
    cues = re.findall(r"^([A-Z][A-Z ]+) \[ORIGINAL[^\]]*\]:\n\"(.+)\"$", text, flags=re.M)
    canon = re.search(r"^8\. In flight Remi says, verbatim: \"(.+?)\" Abby is silent\. Remi then says, verbatim: "
                      r"\"(.+?)\" Abby's exact question is: \"(.+?)\"$", text, flags=re.M)
    return cues, (canon.groups() if canon else None)


def tts_text(text, V):
    t = text.strip().strip("—").strip()
    for p in V["pronunciation"]:
        if p.get("tts_respelling"):
            t = re.sub(rf"\b{re.escape(p['word'])}\b", p["tts_respelling"], t)
    return t


def words_of(t):
    return re.findall(r"[a-z0-9]+(?:'[a-z]+)?", t.lower().replace("’", "'"))


def sentences(t):
    return [s for s in re.split(r"(?<=[.!?])\s+", t) if s]


def role_cast(V, role):
    r = V["roles"][role]
    p = r["primary"]
    assert p["engine"] == "kokoro", f"{role}: preview uses Kokoro voices only (license-clean)"
    assert p["voice"] not in EXCLUDED_VOICES, f"{role}: {p['voice']} is on the do-not-cast list"
    gap = r.get("sentence_gap_s", V["render_defaults"]["sentence_gap_s"]["default"])
    return {"engine": "kokoro", "model": "Kokoro-82M v1.0 int8 ONNX", "voice": p["voice"], "lang": p["lang"],
            "speed": p["speed"], "pitch_semitones": p.get("pitch_semitones", 0.0), "sentence_gap_s": gap,
            "license": VOICE_LICENSE, "source": "voices.json roles.%s.primary (unchanged)" % role}


def line_perf(l, V, cast):
    preset, over, why = PERF.get(l["id"], (None, {}, None))
    if preset is None:
        preset = "narration" if l["speaker"] == "NARRATOR" else "plain"
        why = ("Clear, restrained, sparse narration; long pauses between sentences (voices.json NARRATOR)."
               if preset == "narration" else "Conversational; delivery note: " + (l.get("delivery") or "-"))
    p = dict(PRESETS[preset]); p.update(over)
    speed = p["speed_abs"] if "speed_abs" in p else cast["speed"] * p.get("speed_mul", 1.0)
    gap = p.get("gap_s") if p.get("gap_s") is not None else cast["sentence_gap_s"]
    return preset, p, round(float(speed), 4), gap, why


# ------------------------------------------------------------------------- rendering
class Engine:
    def __init__(self, threads):
        import onnxruntime
        from kokoro_onnx import Kokoro
        from kokoro_onnx.config import EspeakConfig
        mdir = None
        for d in MODEL_DIRS:
            if d and all((Path(d) / f).is_file() for f in MODEL_FILES):
                mdir = Path(d); break
        if mdir is None:
            sys.exit("Kokoro model files not found. Download into preview/.cache/kokoro/:\n" +
                     "\n".join(f"  {MODEL_URL}{f}  (sha256 {h})" for f, h in MODEL_FILES.items()))
        for f, h in MODEL_FILES.items():
            got = sha256_file(mdir / f)
            assert got == h, f"{f}: sha256 {got} != pinned {h}"
        o = onnxruntime.SessionOptions()
        o.intra_op_num_threads = threads; o.inter_op_num_threads = 1
        sess = onnxruntime.InferenceSession(str(mdir / "kokoro-v1.0.int8.onnx"), sess_options=o,
                                            providers=["CPUExecutionProvider"])
        self.kok = Kokoro.from_session(sess, str(mdir / "voices-v1.0.bin"),
                                       espeak_config=EspeakConfig(lib_path=ESPEAK_LIB, data_path=ESPEAK_DATA))
        self.threads = threads
        import kokoro_onnx
        ev = subprocess.run(["espeak-ng", "--version"], capture_output=True, text=True).stdout.strip()
        self.info = {"kokoro_onnx": getattr(kokoro_onnx, "__version__", None) or _dist_version("kokoro-onnx"),
                     "onnxruntime": onnxruntime.__version__, "numpy": np.__version__,
                     "scipy": _dist_version("scipy"), "soundfile": sf.__version__,
                     "espeak_ng": ev, "sox": subprocess.run(["sox", "--version"], capture_output=True,
                                                            text=True).stdout.strip(),
                     "model_files": {f: {"sha256": h, "url": MODEL_URL + f} for f, h in MODEL_FILES.items()},
                     "onnx_threads": threads}

    def say(self, text, voice, speed, lang):
        a, sr = self.kok.create(text, voice=voice, speed=speed, lang=lang, trim=True)
        assert sr == SR_TTS
        return np.asarray(a, dtype=np.float64)

    def phonemes(self, text, lang):
        return self.kok.tokenizer.phonemize(text, lang)


def _dist_version(name):
    try:
        from importlib.metadata import version
        return version(name)
    except Exception:
        return None


def render(eng, l, V, cast, perf):
    """Returns (48 kHz float signal, record fields)."""
    lid = l["id"]
    preset, p, speed, gap, why = perf
    tin = tts_text(l["text"], V)
    sents = sentences(tin)
    parts, segs, pos = [], [], 0
    for i, s in enumerate(sents):
        a = eng.say(s, cast["voice"], speed, cast["lang"])
        a0, a1 = speech_bounds(a, SR_TTS)
        a = a[max(0, a0 - int(0.01 * SR_TTS)): a1 + int(0.01 * SR_TTS)]
        if i:
            parts.append(np.zeros(int(round(gap * SR_TTS)))); pos += len(parts[-1])
        segs.append([s, pos, pos + len(a)]); parts.append(a); pos += len(a)
    x = np.concatenate(parts)
    n_tts = len(x)
    steps = []
    if cast["pitch_semitones"]:  # role-level shift from voices.json (none of the roles in this range has one)
        x, _ = sox(x, SR_TTS, "pitch", str(int(round(cast["pitch_semitones"] * 100))))
        steps.append(f"role pitch {cast['pitch_semitones']:+.1f} st (voices.json, SoX pitch)")
    if p.get("pitch_st"):
        x = pitch_shift_fp(x, SR_TTS, p["pitch_st"])
        steps.append(f"performance pitch {p['pitch_st']:+.1f} st, formant-preserving (LPC whiten, SoX pitch on the "
                     f"residual, re-colour), duration kept")
    whisper_ref = None
    if "whisper" in p:
        w, voicing = lpc_noise(x, SR_TTS, np.random.default_rng(seed_for(lid, "whisper")), **p["whisper"])
        hb, _, vb = harmonicity(x, SR_TTS)
        ha, _, va = harmonicity(w, SR_TTS)
        whisper_ref = {"measured_on": "the same Kokoro take before / after the whisper conversion (24 kHz)",
                       "harmonicity_before": hb, "harmonicity_after": ha,
                       "voiced_frame_share_before": vb, "voiced_frame_share_after": va,
                       "spectral_centroid_hz_before": centroid(x, SR_TTS), "spectral_centroid_hz_after": centroid(w, SR_TTS)}
        x = w
        steps.append("whisper: LPC noise excitation (order 26, 21 ms frames), tilt %.1f, vowels ducked %.0f dB, "
                     "0%% voiced signal kept" % (p["whisper"]["tilt"], p["whisper"]["voiced_duck_db"]))
    if p.get("breathy"):
        b = p["breathy"]
        w, _ = lpc_noise(x, SR_TTS, np.random.default_rng(seed_for(lid, "breathy")), tilt=0.5)
        x = np.sqrt(1 - b * b) * x + b * w
        steps.append(f"breathiness: {b:.2f} amplitude share of unvoiced copy mixed in")
    x, _ = sox(x, SR_TTS, "rate", "-v", str(SR))
    steps.append("resample 24 kHz -> 48 kHz (SoX rate -v)")
    scale = len(x) / max(n_tts, 1)
    if "tremor" in p:
        x = tremor(x, SR, np.random.default_rng(seed_for(lid, "tremor")), **p["tremor"])
        steps.append("tremor: +/-%.1f dB, +/-%.0f cents, irregular 2-7 Hz" % (p["tremor"]["am_db"], p["tremor"]["fm_cents"]))
    if p.get("eq"):
        x = eq(x, p["eq"])
        steps.append("eq: " + ", ".join(f"{k} {f:.0f} Hz {g:+.1f} dB" if k != "highpass" else f"highpass {f:.0f} Hz"
                                        for k, f, g, q in p["eq"]))
    if p.get("drive"):
        x = saturate(x, p["drive"])
        steps.append(f"soft saturation (tanh, drive {p['drive']})")
    x, ds = deess(x)
    steps.append("de-ess: split-band 4.5-10 kHz, sustained (>=30 ms) high-band dominance above -6 dB, 2.5:1, max 4 dB")
    cut_at = None
    if p.get("cutoff_s"):
        a0, a1 = speech_bounds(x, SR)
        c = a1 - int(p["cutoff_s"] * SR)
        f = int(0.012 * SR)
        x = x[:c].copy()
        x[-f:] *= np.cos(np.linspace(0, np.pi / 2, f)) ** 2
        cut_at = c
        steps.append(f"cut off {p['cutoff_s'] * 1000:.0f} ms before the natural end of the last word, 12 ms fade")
    sp_a, _ = speech_bounds(x, SR)
    x, off = trim(x, SR, EDGE_KEEP_S, p.get("tail_keep_s", EDGE_KEEP_S),
                  fade=0.0 if cut_at is not None else EDGE_FADE_S)
    if cut_at is not None:  # keep the abrupt end but give the file its 40 ms tail of silence
        f = int(EDGE_FADE_S * SR); x[:f] *= np.sin(np.linspace(0, np.pi / 2, f)) ** 2
    shift = off - sp_a  # file position = processed position + shift
    steps.append("trim: %d ms lead, %d ms tail, 5 ms fades" % (EDGE_KEEP_S * 1000, p.get("tail_keep_s", EDGE_KEEP_S) * 1000))
    x, lim_gr = normalize(x)
    steps.append(f"normalize: voiced RMS {TARGET_RMS_DBFS:.0f} dBFS, look-ahead limiter at {PEAK_CEILING_DBFS:.0f} dBFS")
    lead = 0
    if p.get("breath"):
        z, g = breath(SR, p["breath"], np.random.default_rng(seed_for(lid, "breath")))
        pad = np.zeros(int(EDGE_KEEP_S * SR))
        gap_n = max(0, int(g * SR) - int(EDGE_KEEP_S * SR))
        x = np.concatenate([pad, z, np.zeros(gap_n), x])
        lead = len(pad) + len(z) + gap_n
        steps.append(f"{p['breath']} breath before the line ({len(z) / SR:.2f} s, synthetic, fixed seed)")
    assert np.all(np.isfinite(x)), f"{lid}: non-finite samples"
    segments = [{"text": s, "start_s": round((a * scale + shift + lead) / SR, 3),
                 "end_s": round((min(b * scale, (cut_at or 1e18)) + shift + lead) / SR, 3)} for s, a, b in segs]
    rec = {"deess": ds, "limiter_max_gr_db": lim_gr, "steps": steps, "segments": segments,
           "cut_at_s": round((cut_at + shift + lead) / SR, 3) if cut_at is not None else None,
           "breath_s": round(lead / SR, 3) if lead else 0.0, "tts_input": tin, "whisper_check": whisper_ref}
    return x, rec


def mix_hints(l, p, shots):
    sets = sorted({s for _, s in shots})
    airborne = bool(sets) and all(s in AIR_SETS for s in sets)
    if l["speaker"] == "NARRATOR":
        space = SPACES["NARRATION"]
    else:
        space = "; ".join(SPACES.get(s, s) for s in sets)
    return airborne, {"gain_db": p.get("mix_gain_db", 0.0), "space": space,
                      "wind_bed": "add the altitude wind bed in the mix (take is dry)" if airborne else None,
                      "note": "Takes are dry and level-matched; reverb, wind and performance level are set in the mix."}


# ----------------------------------------------------------------------- ASR check
class Checker:
    """pocketsphinx (BSD) as an offline sanity check: free decoding (WER) and forced alignment."""

    def __init__(self, lines=()):
        from pocketsphinx import Decoder
        self.free = Decoder(samprate=16000, loglevel="FATAL")
        self.align = Decoder(samprate=16000, bestpath=False, loglevel="FATAL")
        self.closed = Decoder(samprate=16000, loglevel="FATAL")
        for d in (self.free, self.align, self.closed):
            for w, pr in PS_EXTRA_WORDS.items():
                if d.lookup_word(w) is None:
                    d.add_word(w, pr, True)
        # closed set: a grammar whose only sentences are the lines in scope; a take passes if the decoder
        # picks its own line out of all of them (robust for 1-3 word lines, where free decoding is not)
        alts = []
        for l in lines:
            w = words_of(l["text"])
            if self._known(w) and " ".join(w) not in alts:
                alts.append(" ".join(w))
        for a in alts:
            for w in a.split():
                if self.closed.lookup_word(w) is None:
                    self.closed.add_word(w, self.align.lookup_word(w), True)
        if alts:
            self.closed.add_jsgf_string("lines", "#JSGF V1.0;\ngrammar lines;\npublic <line> = " +
                                        " | ".join("( %s )" % a for a in alts) + ";\n")
            self.closed.activate_search("lines")
        self.has_closed = bool(alts)

    def _known(self, words):
        ok = True
        for w in words:
            if self.align.lookup_word(w) is None:
                base = w[:-2] if w.endswith("'s") else None
                if base and self.align.lookup_word(base):
                    pr = self.align.lookup_word(base) + " Z"
                    self.align.add_word(w, pr, True); self.free.add_word(w, pr, True)
                else:
                    ok = False
        return ok

    def run(self, x, ref_words):
        y = signal.resample_poly(x, 1, 3)
        pcm = (np.clip(y, -1, 1) * 32767).astype("<i2").tobytes()
        self.free.start_utt(); self.free.process_raw(pcm, full_utt=True); self.free.end_utt()
        hyp = self.free.hyp().hypstr if self.free.hyp() else ""
        hw = words_of(hyp)
        wer = _edit(ref_words, hw) / max(1, len(ref_words))
        pick = None
        if self.has_closed:
            self.closed.start_utt(); self.closed.process_raw(pcm, full_utt=True); self.closed.end_utt()
            pick = self.closed.hyp().hypstr if self.closed.hyp() else ""
        words, ok = [], False
        if self._known(ref_words):
            self.align.set_align_text(" ".join(ref_words))
            self.align.start_utt(); self.align.process_raw(pcm, full_utt=True); self.align.end_utt()
            if self.align.hyp() is not None:
                ok = True
                words = [{"w": re.sub(r"\(\d+\)$", "", s.word), "start_s": round(s.start_frame / 100, 2), "end_s": round((s.end_frame + 1) / 100, 2)}
                         for s in self.align.seg() if s.word not in ("<s>", "</s>", "<sil>", "[NOISE]")]
        return {"free_hyp": hyp, "wer": round(wer, 3), "closed_set_pick": pick,
                "closed_set_match": pick == " ".join(ref_words)}, words, ok


def _edit(a, b):
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(b) + 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
    return d[len(b)]


# ------------------------------------------------------------------------- verify
def verify(D, V, lines, takes, words, run_asr=True):
    by_id = {l["id"]: l for l in D["lines"]}
    problems, notes = [], []
    ids = [t["id"] for t in takes]
    if ids != [l["id"] for l in lines]:
        problems.append("takes.json ids do not match the scope L001..L078")
    cues, canon = screenplay_originals()
    cue_text = {spk: txt for spk, txt in cues}
    expect = {"L011": [t for s, t in cues if s == "ALEXANDRIA"],
              "L046": [t for s, t in cues if s == "REMI"][:1] + ([canon[0]] if canon else []),
              "L047": [t for s, t in cues if s == "REMI"][1:2] + ([canon[1]] if canon else []),
              "L048": [t for s, t in cues if s == "ABBY"] + ([canon[2]] if canon else [])}
    if len(cues) != 4 or canon is None:
        problems.append(f"screenplay.md: expected 4 [ORIGINAL] cues and CANON LOCK item 8, found {len(cues)} / {canon is not None}")
    orig_report = {}
    roles_voice = {}
    chk = Checker(lines) if run_asr else None
    for t in takes:
        l = by_id[t["id"]]
        if t["text"] != l["text"] or t["text"].encode("utf-8") != l["text"].encode("utf-8"):
            problems.append(f"{t['id']}: text differs from dialogue.json")
        if words_of(t["tts_input"]) != words_of(l["text"].strip("—")):
            problems.append(f"{t['id']}: TTS input words differ from the text (words added or dropped)")
        if t["id"] in ORIGINAL_IDS:
            sources = expect[t["id"]]
            okk = bool(sources) and all(s == t["text"] for s in sources) and l["original"] and t["original"]
            orig_report[t["id"]] = {"text": t["text"], "screenplay_matches": len(sources), "exact": okk,
                                    "tts_input_identical": t["tts_input"] == t["text"]}
            if not okk:
                problems.append(f"{t['id']}: [ORIGINAL] text is not byte-exact against screenplay.md")
        roles_voice.setdefault(t["role"], set()).add(t["voice"]["voice"])
        p = VO / f"{t['id']}.wav"
        if not p.is_file():
            problems.append(f"{t['id']}: missing {p.name}"); continue
        info = sf.info(str(p))
        if (info.samplerate, info.channels, info.subtype, info.format) != (SR, 1, "PCM_24", "WAV"):
            problems.append(f"{t['id']}: format {info.samplerate}/{info.channels}/{info.subtype}")
        if sha256_file(p) != t["sha256"]:
            problems.append(f"{t['id']}: sha256 mismatch")
        x, _ = sf.read(str(p), dtype="float64")
        if abs(len(x) / SR - t["duration_s"]) > 1e-3:
            problems.append(f"{t['id']}: duration mismatch")
        pk = db(np.max(np.abs(x)))
        speech = x[int(t["breath_s"] * SR):] if t["breath_s"] else x
        vr = db(voiced_rms(speech))
        if pk > PEAK_CEILING_DBFS + 0.01 or abs(vr - TARGET_RMS_DBFS) > 0.3:
            problems.append(f"{t['id']}: level {vr:.2f} dBFS RMS / peak {pk:.2f} dBFS out of spec")
        if t["id"] == "L011":
            wc = t["metrics"].get("whisper_check") or {}
            val = lambda v, missing: missing if v is None else v  # 0.0 is a real (passing) value
            if not (val(t["metrics"]["harmonicity"], 1.0) < 0.35 and val(wc.get("voiced_frame_share_after"), 1.0) < 0.10
                    and val(wc.get("voiced_frame_share_before"), 0.0) > 0.4):
                problems.append("L011: whisper check failed (still voiced, or no voiced reference to compare)")
        if run_asr:
            ref = words_of(l["text"])
            asr, w, ok = chk.run(x, ref)
            asr["aligned"] = ok
            asr["intelligible"] = asr["wer"] == 0 or asr["closed_set_match"]
            t["asr_check"] = asr
            words[t["id"]] = {"aligned": ok, "words": w}
            if not asr["intelligible"]:
                notes.append(f"{t['id']}: pocketsphinx heard '{asr['free_hyp']}' (WER {asr['wer']:.2f}) and picked "
                             f"'{asr['closed_set_pick']}' from the closed set; listen to this take")
    shared = [r for r, v in roles_voice.items() if len(v) != 1]
    if shared:
        problems.append(f"role(s) with more than one voice: {shared}")
    vv = {}
    for r, v in roles_voice.items():
        vv.setdefault(next(iter(v)), []).append(r)
    if any(len(r) > 1 for r in vv.values()):
        problems.append(f"voice shared by two roles: {vv}")
    # canon: Abby stays silent after the succession question
    i46 = next(i for i, l in enumerate(lines) if l["id"] == "L046")
    if lines[i46 + 1]["id"] != "L047" or lines[i46 + 1]["speaker"] != "REMI":
        problems.append("canon: the line after L046 must be Remi's L047 (Abby is silent)")
    return problems, notes, orig_report


# ---------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated line ids to (re)render")
    ap.add_argument("--verify", action="store_true", help="verify existing takes only")
    ap.add_argument("--repeat-check", help="comma-separated ids: render again in memory, compare sha256")
    ap.add_argument("--no-asr", action="store_true", help="skip the pocketsphinx check")
    args = ap.parse_args()

    D, V, S = load_data()
    lines = scope_lines(D)
    shots = shots_by_line(S)
    tpath = VO / "takes.json"
    wpath = VO / "words.json"
    old = json.loads(tpath.read_text()) if tpath.is_file() else None
    old_takes = {t["id"]: t for t in old["takes"]} if old else {}
    words = json.loads(wpath.read_text())["lines"] if wpath.is_file() else {}
    threads = int(os.environ.get("DK_THREADS", "1"))

    if args.repeat_check:
        eng = Engine(threads)
        bad = []
        for lid in args.repeat_check.split(","):
            l = next(x for x in lines if x["id"] == lid)
            cast = role_cast(V, l["speaker"])
            x, _ = render(eng, l, V, cast, line_perf(l, V, cast))
            with tempfile.TemporaryDirectory() as td:
                q = Path(td) / "t.wav"
                sf.write(str(q), x, SR, subtype="PCM_24", format="WAV")
                h = sha256_file(q)
            same = h == old_takes[lid]["sha256"]
            print(f"{lid}: {'identical' if same else 'DIFFERENT'} ({h[:16]})")
            bad += [] if same else [lid]
        sys.exit(1 if bad else 0)

    VO.mkdir(parents=True, exist_ok=True)
    takes = old_takes
    eng_info = old["engine"] if old else None
    if not args.verify:
        eng = Engine(threads)
        eng_info = eng.info
        todo = [l for l in lines if not args.only or l["id"] in args.only.split(",")]
        t_all = time.perf_counter()
        for l in todo:
            t0 = time.perf_counter()
            cast = role_cast(V, l["speaker"])
            perf = line_perf(l, V, cast)
            preset, p, speed, gap, why = perf
            x, rec = render(eng, l, V, cast, perf)
            out = VO / f"{l['id']}.wav"
            sf.write(str(out), x, SR, subtype="PCM_24", format="WAV")
            sh = shots.get(l["id"], [])
            airborne, mix = mix_hints(l, p, sh)
            speech = x[int(rec["breath_s"] * SR):] if rec["breath_s"] else x
            harm, f0, vfrac = harmonicity(speech, SR)
            takes[l["id"]] = {
                "id": l["id"], "scene": l["scene"], "shots": [s for s, _ in sh], "role": l["speaker"],
                "text": l["text"], "original": l["original"], "tts_input": rec["tts_input"],
                "phonemes": eng.phonemes(rec["tts_input"], cast["lang"]),
                "voice": {k: cast[k] for k in ("engine", "model", "voice", "lang", "license")} | {
                    "speed": speed, "role_speed": cast["speed"], "pitch_semitones": cast["pitch_semitones"] + p.get("pitch_st", 0.0),
                    "sentence_gap_s": gap if len(rec["segments"]) > 1 else None},
                "performance": {"preset": preset, "why": why, "delivery": l.get("delivery"),
                                "performance_note": l.get("performance_note"), "processing": rec["steps"]},
                "airborne": airborne, "dry": True, "mix": mix,
                "file": f"vo/{l['id']}.wav", "format": "WAV PCM 24-bit, 48000 Hz, mono",
                "duration_s": round(len(x) / SR, 4), "samples": int(len(x)),
                "frames_24fps": round(len(x) / 2000, 2),
                "est_seconds_dialogue_json": l["est_seconds"],
                "segments": rec["segments"], "breath_s": rec["breath_s"], "cut_at_s": rec["cut_at_s"],
                "level": {"voiced_rms_dbfs": round(db(voiced_rms(speech)), 2), "peak_dbfs": round(db(np.max(np.abs(x))), 2),
                          "limiter_max_gr_db": rec["limiter_max_gr_db"]},
                "deess": rec["deess"],
                "metrics": {"harmonicity": harm, "voiced_frame_share": vfrac, "f0_median_hz": f0,
                            "spectral_centroid_hz": centroid(speech, SR)} | (
                               {"whisper_check": rec["whisper_check"]} if rec["whisper_check"] else {}),
                "sha256": sha256_file(out),
            }
            print(f"{l['id']} {l['speaker']:<13} {preset:<11} {len(x) / SR:5.2f}s  gen {time.perf_counter() - t0:5.1f}s"
                  f"  harm {harm} voiced {vfrac}  f0 {f0}  deess {rec['deess']}", flush=True)
        print(f"rendered {len(todo)} lines in {time.perf_counter() - t_all:.1f}s", flush=True)

    take_list = [takes[l["id"]] for l in lines if l["id"] in takes]
    problems, notes, orig = verify(D, V, lines, take_list, words, run_asr=not args.no_asr)
    for p in problems:
        print("PROBLEM:", p)
    for n in notes:
        print("note:", n)

    roles = {}
    for t in take_list:
        r = roles.setdefault(t["role"], {"voice": t["voice"]["voice"], "lang": t["voice"]["lang"],
                                         "role_speed": t["voice"]["role_speed"], "license": t["voice"]["license"],
                                         "casting": role_cast(V, t["role"])["source"], "lines": 0, "seconds": 0.0})
        r["lines"] += 1; r["seconds"] = round(r["seconds"] + t["duration_s"], 2)
    scenes = {}
    for t in take_list:
        s = scenes.setdefault(t["scene"], {"lines": 0, "vo_seconds": 0.0, "est_seconds_dialogue_json": 0.0})
        s["lines"] += 1
        s["vo_seconds"] = round(s["vo_seconds"] + t["duration_s"], 2)
        s["est_seconds_dialogue_json"] = round(s["est_seconds_dialogue_json"] + t["est_seconds_dialogue_json"], 2)
    asr_wers = [t["asr_check"]["wer"] for t in take_list if t.get("asr_check")]
    doc = {
        "schema": "dragons-kingdom/preview-vo-takes v1",
        "episode": "S01E01",
        "status": ("PROVISIONAL scratch TTS takes for the work-in-progress preview (PROLOGUE through 1E). "
                   "Not approved by Daxtyn. A human recording replaces any line (voices.json human_recordings)."),
        "generated_by": REL(Path(__file__)),
        "script_sha256": sha256_file(Path(__file__)),
        "sources": {n: {"path": REL(EP / n), "sha256": sha256_file(EP / n)}
                    for n in ("dialogue.json", "voices.json", "shotlist.json", "screenplay.md")},
        "scope": {"scenes": list(SCOPE_SCENES), "first_line": FIRST_LINE, "last_line": LAST_LINE,
                  "lines": len(take_list), "excluded": "screenplay-extended.md PROPOSED additions (not approved)",
                  "ends_on": "L078 REMI 'Attack.' (picture continues to 'Charcoal banks.', shot 1E-18)"},
        "format": {"sample_rate": SR, "channels": 1, "subtype": "PCM_24", "container": "WAV",
                   "level": f"voiced RMS {TARGET_RMS_DBFS:.0f} dBFS, sample peak <= {PEAK_CEILING_DBFS:.0f} dBFS",
                   "edges": "40 ms lead and tail (20 ms tail on the command), 5 ms fades",
                   "dry": "no reverb, no wind, no music in any take; airborne lines get the wind bed in the mix",
                   "frame": "24 fps at 48 kHz: one frame = 2000 samples"},
        "engine": eng_info,
        "determinism": {"seed_base": SEED_BASE, "seed_rule": "crc32('<line_id>:<purpose>') + seed_base",
                        "sox": "-R (repeatable) -D (no dither)", "check": "make_vo.py --repeat-check <ids>"},
        "roles": roles,
        "scenes": scenes,
        "totals": {"lines": len(take_list), "vo_seconds": round(sum(t["duration_s"] for t in take_list), 2),
                   "est_seconds_dialogue_json": round(sum(t["est_seconds_dialogue_json"] for t in take_list), 2)},
        "checks": {
            "problems": problems,
            "text_byte_exact_vs_dialogue_json": not any("text differs" in p for p in problems),
            "originals": orig,
            "abby_silent_after_succession_question": not any(p.startswith("canon") for p in problems),
            "one_voice_per_role": not any("voice" in p and "role" in p for p in problems),
            "asr": {"engine": "pocketsphinx 5.1.1 (bundled US-English model and CMU dictionary)",
                    "purpose": "offline sanity check of the words only; it cannot judge acting or naturalness",
                    "rule": "a take is 'intelligible' if free decoding gets every word (WER 0) or, decoding against "
                            "a grammar of all lines in scope, it picks its own line",
                    "intelligible": sum(1 for t in take_list if (t.get("asr_check") or {}).get("intelligible")),
                    "of": len(take_list),
                    "free_decoding_wer_0": sum(1 for w in asr_wers if w == 0),
                    "closed_set_match": sum(1 for t in take_list if (t.get("asr_check") or {}).get("closed_set_match")),
                    "mean_free_wer": round(float(np.mean(asr_wers)), 3) if asr_wers else None,
                    "why_free_wer_is_high_on_some_lines": [
                        "1-3 word lines ('Attack.', 'There.', 'Finished?') have no context for the language model.",
                        "The narrator is British (bf_emma) and the recognizer's model is US English: tested on L004, "
                        "every British female Kokoro voice scored WER 0.53-0.65 while American voices scored 0.06-0.12; "
                        "on L001 bf_emma scored best of five voices (0.08). Not a reason to recast.",
                        "Names (Tara, Scrapper, Verdor) are not in the recognizer's language model."],
                    "notes": notes},
        },
        "takes": take_list,
    }
    tpath.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    if not args.no_asr:
        wpath.write_text(json.dumps({"schema": "dragons-kingdom/preview-vo-words v1",
                                     "source": "pocketsphinx forced alignment of vo/<id>.wav against dialogue.json text; "
                                               "times in seconds from the start of the file, 10 ms resolution",
                                     "lines": {k: words[k] for k in sorted(words) if k in takes}},
                                    indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"takes.json: {len(take_list)} lines, {doc['totals']['vo_seconds']} s of VO; problems: {len(problems)}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
