#!/usr/bin/env python3
"""build_soundtrack.py - the full preview soundtrack of S01E01 (PROLOGUE through 1E), timed to
edl.json to the sample.

Reads (never modifies): ../edl.json, ../render-jobs.json, ../vo/*.wav + ../vo/takes.json,
                        soundtrack_shots.py (authored mix decisions), sfx_lib.py, score.py
Writes (relative to episodes/s01e01/preview/):
  mix/preview_mix.wav        stereo, 48 kHz, 24-bit PCM, -16 LUFS integrated, true peak <= -1 dBTP,
                             exactly frames x 2000 samples (frame 0 = first frame of the WIP card)
  mix/stems/dialogue.wav     \\ stereo, 48 kHz, 32-bit float, the same gain as the master before its
  mix/stems/music.wav         > peak limiter (float, so nothing clips); dialogue + music + sfx = the
  mix/stems/sfx.wav          /  master except where the limiter acted
  mix/cache/                 premaster, limited premaster, music renders, MIDI, non-verbal takes
  mix/soundtrack.json        cue sheet (every placed sound: frame, sample, gain, pan, space, source,
                             seed), music cues, levels, mastering measurements, tool versions
  wingbeats.json             wingbeat contract for the scenes: every downstroke of Leaf and Charcoal
                             per shot (EDL frame and set time) and the (hz, phase) that produce it with
                             poses.js flight(); the mix and the animation must use the same table
(.wav/.mid binaries are git-ignored; JSON and scripts are committed.)

Usage (preview venv, see requirements-vo.txt; system: ffmpeg 6.1, fluidsynth 2.3, fluid-soundfont-gm):
  python -I build_soundtrack.py            build everything, then run check_mix.py
  python -I build_soundtrack.py --no-check

Determinism: every noise source is seeded from a readable key (sfx_lib.rng_for); FluidSynth's
fast render, Kokoro and ffmpeg loudnorm are deterministic; the build writes byte-identical
files on every run.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d

sys.path.insert(0, str(Path(__file__).resolve().parent))   # python -I leaves the script dir out
import sfx_lib as fx  # noqa: E402
import score  # noqa: E402
import soundtrack_shots as A  # noqa: E402

HERE = Path(__file__).resolve().parent
PREVIEW = HERE.parent
EP = PREVIEW.parent
REPO = EP.parents[2]
MIX = PREVIEW / "mix"
CACHE = MIX / "cache"
STEMS = MIX / "stems"
SR, FPS, SPF = fx.SR, fx.FPS, fx.SPF
TARGET_I, TARGET_TP, TARGET_LRA = -16.0, -1.0, 20.0
LIMIT_TP = -2.0                     # pre-limiter ceiling: loudnorm stays linear and an AAC encode stays <= -1 dBTP
MUSIC_GAIN = {"M1": -5.0, "M2a": -6.0, "M2b": -9.5, "M2c": -9.5, "M3": -7.0}   # dB re dialogue
MUSIC_DUCK_DB = -9.0                # audio-plan.md tested -6 dB; -9 dB here keeps music 12-18 dB under the voice
# Dialogue compressor, applied to each take before its line gain (so whisper/quiet/shout levels
# from takes.json survive): 5 ms RMS detector, soft knee, attack 5 ms, release 120 ms. It lowers
# speech peaks ~3 dB so the master limiter does not have to flatten dialogue.
DX_COMP = {"threshold_dbfs": -17.0, "ratio": 3.0, "knee_db": 6.0, "attack_s": 0.005, "release_s": 0.12,
           "detector_s": 0.005, "makeup_db": 0.0}
# then a true-peak limiter per take (take level, before the line gain): speech transients stop at
# 10 dB above the -20 dBFS speech level, so the master limiter leaves ordinary lines (almost) alone
DX_TAKE_CEILING_DBTP = -10.0
DUCK_ATTACK, DUCK_RELEASE, DUCK_LEAD = 0.15, 0.40, 0.15
REL = lambda p: str(Path(p).resolve().relative_to(REPO))


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ============================================================================ timeline
class Timeline:
    def __init__(self, edl):
        self.edl = edl
        self.frames = edl["totals"]["frames"]
        self.N = self.frames * SPF
        self.events = edl["events"]
        self.shots = [e for e in self.events if e["kind"] == "shot"]
        self.by_id = {e["id"]: e for e in self.events}
        self.starts = np.array([e["start_frame"] for e in self.events])

    def event_at(self, frame):
        i = int(np.searchsorted(self.starts, frame, side="right") - 1)
        return self.events[max(0, i)]


class Bus:
    """A stereo float32 buffer over [s0, s1) samples of the timeline."""

    def __init__(self, s0, s1):
        self.s0, self.s1 = int(s0), int(s1)
        self.x = np.zeros((self.s1 - self.s0, 2), np.float32)

    def add(self, y, i0):
        a, b = max(self.s0, i0), min(self.s1, i0 + len(y))
        if b > a:
            self.x[a - self.s0: b - self.s0] += y[a - i0: b - i0].astype(np.float32)


# ============================================================================ ducking
def duck_env(tl, lines):
    """0..1 at a 10 ms control rate: 1 while dialogue is speaking (from the EDL's speech
    windows, a little early so the duck is complete at the first word), 150 ms attack,
    400 ms release."""
    blk = 480
    nb = tl.N // blk + 1
    key = np.zeros(nb)
    for ln in lines:
        for a, b in speech_windows(ln):
            key[int((a - DUCK_LEAD) * SR) // blk: int((b + 0.05) * SR) // blk + 1] = 1.0
    env = np.zeros(nb)
    up, dn = blk / SR / DUCK_ATTACK, blk / SR / DUCK_RELEASE
    cur = 0.0
    for i in range(nb):
        k = key[i]
        cur = min(k, cur + up) if k > cur else max(k, cur - dn)
        env[i] = cur
    return env, blk


def duck_gain(env, blk, s0, s1, depth_db):
    t = (np.arange(s0, s1) / blk)
    e = np.interp(t, np.arange(len(env)), env)
    return fx.db(depth_db * e)


def speech_windows(ln):
    """Timeline seconds where a line is speaking (L003 is split into parts)."""
    if ln.get("parts"):
        out = []
        for p in ln["parts"]:
            t0 = p["timeline_frame"] / FPS
            out.append((t0, t0 + (p["take_out_sample"] - p["take_in_sample"]) / SR))
        return out
    return [(ln["speech_in_s"], ln["speech_out_s"])]


# ============================================================================ automation
def keyframes_from_frames(D, ramps):
    """D: per-frame dB targets; ramps: frame -> ramp length (frames) at that change.
    Returns (times_in_frames, amplitudes) for linear-amplitude interpolation."""
    kt, ka = [0.0], [0.0 if D[0] <= A.OFF else float(fx.db(D[0]))]
    for f in range(1, len(D)):
        if D[f] != D[f - 1]:
            r = ramps.get(f, 1)
            kt += [f - r / 2.0, f + r / 2.0]
            ka += [0.0 if D[f - 1] <= A.OFF else float(fx.db(D[f - 1])), 0.0 if D[f] <= A.OFF else float(fx.db(D[f]))]
    kt.append(float(len(D)))
    ka.append(ka[-1])
    kt, ka = np.array(kt), np.array(ka)
    o = np.argsort(kt, kind="stable")
    return kt[o], ka[o]


def gain_curve(kt, ka, s0, s1):
    return np.interp(np.arange(s0, s1) / SPF, kt, ka)


def shot_ramps(tl):
    r = {}
    for e in tl.events:
        T = (e.get("transition_in") or {}).get("frames", 0) or 0
        r[e["start_frame"]] = max(2, int(T))
    return r


def bed_targets(tl, layer):
    D = np.full(tl.frames, A.OFF)
    after_air = False
    for e in tl.events:
        if e["kind"] != "shot":
            continue
        if e["id"] == A.AIR_SHOTS_1C_FROM:
            after_air = True
        if e["id"] in A.BEDS:
            v = A.BEDS[e["id"]].get(layer, A.OFF)
        elif after_air:
            v = A.OFF
        else:
            v = A.SCENE_BEDS.get(e["scene"], {}).get(layer, A.OFF)
        D[e["start_frame"]: e["end_frame"]] = v
    keys = A.EXTRA_KEYS.get(layer)
    if keys:   # in-shot keyframes: linear in amplitude between them, the last one held to the end of its shot
        for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
            fr = np.arange(f0, f1)
            a0 = 0.0 if v0 <= A.OFF else float(fx.db(v0))
            a1 = 0.0 if v1 <= A.OFF else float(fx.db(v1))
            amp = a0 + (a1 - a0) * (fr - f0) / max(1, f1 - f0)
            D[f0:f1] = np.where(amp > 1e-6, 20 * np.log10(np.maximum(amp, 1e-12)), A.OFF)
        f_last, v_last = keys[-1]
        D[f_last: tl.event_at(f_last)["end_frame"]] = v_last
    return D


ALT_LAYERS = ("body", "whoosh", "hiss", "buffet", "whistle")


def alt_layer_db(level, buffet, bright):
    rel = {"body": 0.0, "whoosh": -3.0 + 3.0 * bright, "hiss": -12.0 + 8.0 * bright,
           "buffet": (-24.0 + 20.0 * buffet) if buffet > 0 else A.OFF, "whistle": -16.0 + 4.0 * bright}
    p = sum(fx.db(v) ** 2 for v in rel.values() if v > A.OFF)
    norm = -10 * np.log10(p)
    return {k: (v + norm + level if v > A.OFF else A.OFF) for k, v in rel.items()}


def alt_targets(tl):
    off = np.zeros(tl.frames)
    keys = A.EXTRA_ALT_KEYS
    fr = np.arange(tl.frames)
    off[:] = np.interp(fr, [k[0] for k in keys], [k[1] for k in keys])
    out = {k: np.full(tl.frames, A.OFF) for k in ALT_LAYERS}
    for e in tl.events:
        src = e["id"] if e["id"] in A.ALT else A.ALT_CARDS.get(e["id"])
        if src is None:
            continue
        lv = alt_layer_db(*A.ALT[src])
        for k in ALT_LAYERS:
            out[k][e["start_frame"]: e["end_frame"]] = lv[k]
    for k in ALT_LAYERS:
        m = out[k] > A.OFF
        out[k][m] = out[k][m] + off[m]
        out[k][out[k] < -90] = A.OFF
    return out


# ============================================================================ placement helpers
def apply_pan(y, p):
    if p is None:
        return fx.to_stereo(y, 0.0)
    if isinstance(p, (tuple, list)):
        n = len(y)
        if y.ndim == 1:
            return fx.pan(y, np.linspace(p[0], p[1], n))
        mono = y.mean(axis=1)
        side = (y[:, 0] - y[:, 1]) / 2
        st = fx.pan(mono, np.linspace(p[0], p[1], n))
        st[:, 0] += side * 0.5
        st[:, 1] -= side * 0.5
        return st
    return fx.to_stereo(y, float(p))


class Builder:
    def __init__(self, args):
        self.args = args
        self.edl = json.loads((PREVIEW / "edl.json").read_text())
        self.jobs = {j["shot"]: j for j in json.loads((PREVIEW / "render-jobs.json").read_text())["jobs"]}
        self.takes = {t["id"]: t for t in json.loads((PREVIEW / "vo" / "takes.json").read_text())["takes"]}
        self.tl = Timeline(self.edl)
        self.lines = self.edl["lines"]
        N = self.tl.N
        self.stem = {k: np.zeros((N, 2), np.float32) for k in ("DX", "MX", "FX")}
        self.sends = {}           # (stem, space) -> Bus
        self.cuesheet = []
        self.problems = []
        self.duck, self.blk = duck_env(self.tl, self.lines)
        CACHE.mkdir(parents=True, exist_ok=True)
        STEMS.mkdir(parents=True, exist_ok=True)

    # ---------------------------------------------------------------- sends / spaces
    def send(self, stem, space, y, i0, send_db):
        if space is None or send_db is None:
            return
        key = (stem, space)
        if key not in self.sends:
            a, b = self.space_span(space)
            self.sends[key] = Bus(a, b)
        self.sends[key].add(y * fx.db(send_db), i0)

    def space_span(self, space):
        """Samples covered by the sets that use this space, plus 4 s either side (reverb sends
        only need to exist where the space is heard)."""
        fr = [(e["start_frame"], e["end_frame"]) for e in self.tl.events if A.SET_SPACE.get(e.get("set")) == space]
        if not fr:
            fr = [(0, self.tl.frames)]
        a = max(0, min(f[0] for f in fr) * SPF - 4 * SR)
        b = min(self.tl.N, max(f[1] for f in fr) * SPF + 4 * SR)
        return a, b

    def render_sends(self):
        for (stem, space), bus in sorted(self.sends.items()):
            nz = np.where(np.any(bus.x != 0, axis=1))[0]
            if not len(nz):
                continue
            ra, rb = int(nz[0]), int(nz[-1]) + 1
            ir = fx.space_ir(space)
            wet = fx.convolve_st(bus.x[ra:rb].astype(np.float64), ir)
            a = bus.s0 + ra
            e = min(self.tl.N, a + len(wet))
            self.stem[stem][a:e] += wet[: e - a].astype(np.float32)
            self.cuesheet.append({"kind": "reverb_return", "stem": stem, "space": space, "from_sample": a,
                                  "ir": fx.SPACES[space], "ir_seed_key": f"ir|{space}"})
        self.sends = {}

    def put(self, stem, y, i0, space=None, send_db=None):
        a, b = max(0, i0), min(self.tl.N, i0 + len(y))
        if b > a:
            self.stem[stem][a:b] += y[a - i0: b - i0].astype(np.float32)
        self.send(stem, space, y, i0, send_db)

    # ---------------------------------------------------------------- dialogue
    def line_pan(self, ln):
        if ln["id"] in A.DX_PAN_OVERRIDE:
            return A.DX_PAN_OVERRIDE[ln["id"]], "override"
        if ln["speaker"] == "NARRATOR":
            return 0.0, "narration: centre"
        ev = self.tl.by_id[ln["shot"]]
        who = A.WHO.get(ln["speaker"], "").lower()
        for f in ev.get("in_frame", []):
            name = f["who"].split(" (")[0].split(",")[0].strip().lower()
            if name == who:
                return A.screen_pan(f["screen_pos"], A.DX_PAN_SCALE), f"in frame at {f['screen_pos']}"
        p = A.OFFSCREEN_PAN.get(ev.get("set"), {}).get(ln["speaker"], 0.0)
        return p, "off screen: " + ("formation side" if p else "centre")

    def dialogue(self):
        log("dialogue: placing", len(self.lines), "takes")
        for ln in self.lines:
            path = PREVIEW / ln["take"]
            got = sha256_file(path)
            if got != ln["take_sha256"]:
                sys.exit(f"{ln['id']}: {path} sha256 {got} != edl.json take_sha256 {ln['take_sha256']} "
                         "(re-run make_vo.py / build_edl.py)")
            x, sr = sf.read(str(path), dtype="float64")
            assert sr == SR and x.ndim == 1
            dry_db = 10 * np.log10(np.mean(x ** 2) + 1e-20)
            x, gr = compress(x)
            y2, tl_info = tp_limit(np.stack([x, x], axis=1), DX_TAKE_CEILING_DBTP, release_s=0.05)
            x = y2[:, 0]
            comp = {"rms_change_db": round(10 * np.log10(np.mean(x ** 2) + 1e-20) - dry_db, 2),
                    "max_gr_db": round(float(gr.max()), 2),
                    "take_limiter_max_gr_db": tl_info["max_gain_reduction_db"]}
            g = fx.db(ln["mix"]["gain_db"])
            p, why = self.line_pan(ln)
            ev = self.tl.by_id[ln["shot"]]
            space = A.SET_SPACE.get(ev.get("set")) if ln["speaker"] != "NARRATOR" else None
            send_db = A.DX_SPACE_SEND_DB.get(space)
            pieces = []
            if ln.get("parts"):
                for k, prt in enumerate(ln["parts"]):
                    seg = x[prt["take_in_sample"]: prt["take_out_sample"]].copy()
                    seg = fx.fade(seg, 0.005 if k else 0.0, 0.005 if k < len(ln["parts"]) - 1 else 0.0)
                    pieces.append((seg, prt["timeline_frame"] * SPF, prt["take_in_sample"]))
            else:
                pieces.append((x, ln["take_start_frame"] * SPF, 0))
            for seg, i0, src0 in pieces:
                st = fx.pan(seg * g, p)
                self.put("DX", st, i0, space, send_db)
            self.cuesheet.append({"kind": "dialogue", "id": ln["id"], "speaker": ln["speaker"], "shot": ln["shot"],
                                  "frame": ln["take_start_frame"], "start_sample": ln["take_start_frame"] * SPF,
                                  "parts": [{"timeline_sample": i0, "take_sample": s0, "samples": len(sg)}
                                            for sg, i0, s0 in pieces] if ln.get("parts") else None,
                                  "take": ln["take"], "take_sha256": ln["take_sha256"], "gain_db": ln["mix"]["gain_db"],
                                  "pan": round(p, 3), "pan_from": why, "space": space, "send_db": send_db,
                                  "compressor": comp,
                                  "voice": ln["voice"], "voice_license": ln["voice_license"]})

    # ---------------------------------------------------------------- non-verbal voice (DX)
    def nonverbal(self, name, rng):
        import make_vo as mv   # same helpers as the takes (breath, pitch, tremor, eq, normalize)
        if name == "abby_breath_hold":
            z, _ = mv.breath(SR, "gasp", rng)
            z = mv.eq(z, [("highshelf", 5000.0, -3.0, 0.707)])
            return fx.fade(np.concatenate([z[: int(0.16 * SR)], np.zeros(int(0.05 * SR))]), 0.003, 0.03), 0.0
        if name == "abby_ragged_breath":
            out = np.zeros(int(2.6 * SR))
            t = 0.0
            for k, kind in enumerate(("gasp", "inhale", "gasp", "inhale")):
                z, _ = mv.breath(SR, kind, rng)
                if k % 2 == 1:   # broken exhale: the inhale shape reversed, shaky
                    z = z[::-1]
                z = mv.tremor(z, SR, rng, 3.0, 40.0)
                fx.place(out, z * (1.0 - 0.12 * k), int(t * SR))
                t += 0.42 + 0.22 * rng.random()
            return out, 0.0
        if name == "abby_cry":
            return self.abby_cry(rng)
        raise KeyError(name)

    def abby_cry(self, rng):
        """Startled breath, then a short cry: Kokoro af_heart (Abby's voice, Apache-2.0) saying
        'Ah!' through the same pain chain as her pain lines (L072/L075/L077) but pitched up for
        the shock. A stand-in for a recording by Daxtyn (edl sfx_library abby_cry)."""
        import make_vo as mv
        cache = CACHE / "nonverbal_abby_cry.wav"
        meta = CACHE / "nonverbal_abby_cry.json"
        recipe = {"text": "Ah!", "voice": "af_heart", "lang": "en-us", "speed": 1.0, "pitch_st": 2.5, "breathy": 0.35,
                  "tremor": [3.0, 40.0], "eq": [["highpass", 170.0, 0.0, 0.707], ["peak", 350.0, -3.0, 1.0],
                                                ["peak", 2500.0, 2.0, 1.0]], "keep_s": 0.55, "gasp_lead_s": 0.42}
        key = hashlib.sha256(json.dumps(recipe, sort_keys=True).encode()).hexdigest()
        if cache.exists() and meta.exists() and json.loads(meta.read_text()).get("key") == key:
            cry, _ = sf.read(str(cache), dtype="float64")
        else:
            eng = mv.Engine(1)
            a = eng.say(recipe["text"], recipe["voice"], recipe["speed"], recipe["lang"])
            a = mv.pitch_shift_fp(a, mv.SR_TTS, recipe["pitch_st"])
            w, _ = mv.lpc_noise(a, mv.SR_TTS, np.random.default_rng(mv.seed_for("CRY", "breathy")), tilt=0.5)
            b = recipe["breathy"]
            a = np.sqrt(1 - b * b) * a + b * w
            a, _ = mv.sox(a, mv.SR_TTS, "rate", "-v", str(SR))
            a = mv.tremor(a, SR, np.random.default_rng(mv.seed_for("CRY", "tremor")), *recipe["tremor"])
            a = mv.eq(a, [tuple(e) for e in recipe["eq"]])
            a0, a1 = mv.speech_bounds(a, SR)
            a = a[a0: min(a1, a0 + int(recipe["keep_s"] * SR))]
            a = fx.fade(a, 0.004, 0.12)
            cry, _ = mv.normalize(a)
            sf.write(str(cache), cry.astype(np.float32), SR, subtype="FLOAT")
            meta.write_text(json.dumps({"key": key, "recipe": recipe, "phonemes": eng.phonemes("Ah!", "en-us"),
                                        "sha256": sha256_file(cache)}, indent=1))
        gasp, _ = mv.breath(SR, "gasp", rng)
        gasp *= 1.6
        out = np.zeros(int((recipe["gasp_lead_s"] + len(cry) / SR + 0.1) * SR))
        fx.place(out, gasp, 0)
        fx.place(out, cry * fx.db(-2.0), int(recipe["gasp_lead_s"] * SR))
        return out, 0.0

    # ---------------------------------------------------------------- one-shot cues
    def gen(self, name, rng, args):
        local = {"scout_flutter": self.scout_flutter, "abby_breath_hold": None, "abby_cry": None,
                 "abby_ragged_breath": None}
        if name in local:
            if local[name] is None:
                return self.nonverbal(name, rng)
            return local[name](rng, **args)
        return getattr(fx, name)(rng, **args)

    def scout_flutter(self, rng, dur=2.6):
        per = 1 / A.HZ["scout"]
        n = int((dur + 0.5) * SR)
        y = np.zeros(n)
        t = 0.0
        while t < dur:
            b, _ = fx.scout_beat(rng, per, dist=2.6)
            fx.place(y, b * (0.8 + 0.4 * rng.random()) * min(1.0, (t + 0.3) / 0.8) * min(1.0, (dur - t) / 0.8 + 0.2), int(t * SR))
            t += per * (1 + 0.04 * rng.standard_normal())
        return y, 0.0

    def realize(self, shot, cue, frame, spec, why, edl_cue=None):
        args = dict(spec.get("args") or {})
        stem = spec.get("stem", "FX")
        seed_key = f"{shot}|{cue}|{frame}"
        rng = fx.rng_for(seed_key)
        y, sync = self.gen(spec["gen"], rng, args)
        y = fx.norm_cue(y) * fx.db(spec["gain"])
        st = apply_pan(y, spec.get("pan"))
        if spec.get("sync") == "start":
            sync = 0.0
        i0 = frame * SPF - int(round(sync * SR))
        space, send_db = (spec.get("send") or (None, None))
        self.put(stem, st, i0, space, send_db)
        rec = {"kind": "nonverbal" if stem == "DX" else "sfx", "id": f"{shot}:{cue}@{frame}", "shot": shot, "cue": cue,
               "frame": frame, "start_sample": i0, "sync_s": round(sync, 4), "dur_s": round(len(st) / SR, 3),
               "gen": spec["gen"], "args": args, "gain_db": spec["gain"],
               "pan": spec.get("pan") if not isinstance(spec.get("pan"), tuple) else list(spec["pan"]),
               "space": space, "send_db": send_db, "stem": stem, "seed_key": seed_key,
               "source": ("Kokoro af_heart (Apache-2.0) + make_vo.py pain chain" if spec["gen"] == "abby_cry" else
                          "make_vo.py breath generator" if stem == "DX" else f"procedural: sfx_lib.{spec['gen']}"
                          if hasattr(fx, spec["gen"]) else f"procedural: build_soundtrack.{spec['gen']}"),
               "why": why}
        if edl_cue is not None:
            rec["edl_source"] = edl_cue.get("source")
            rec["stand_in_for_foley"] = "foley" in (edl_cue.get("source") or "") or "Daxtyn records" in (edl_cue.get("source") or "")
        self.cuesheet.append(rec)

    def cues(self):
        log("sfx: one-shot cues")
        n = 0
        for e in self.tl.shots:
            for c in e.get("sfx", []):
                name = c["cue"]
                if name in A.BED_CUES or name in A.BEAT_CUES:
                    continue
                if name not in A.CUES:
                    self.problems.append(f"{e['id']}: EDL cue {name} has no realization")
                    continue
                spec = {**A.CUES[name], **A.CUE_OVERRIDES.get((e["id"], name), {}),
                        **A.CUE_BY_FRAME.get((e["id"], c["frame"]), {})}
                if name == "rig_creak" and c["frame"] != A.RIG_CLIMB_FRAME:
                    spec = {**spec, "gen": "harness_clips", "args": {"count": 3}}
                self.realize(e["id"], name, c["frame"], spec, f"EDL {e['id']} sfx '{name}' at {c['frame']}: {c['what']}"
                             + (f" ({c['note']})" if c.get("note") else ""), c)
                n += 1
        for x in A.EXTRA_CUES:
            spec = {k: v for k, v in x.items() if k not in ("frame", "shot", "why")}
            self.realize(x["shot"], "extra:" + x["gen"], x["frame"], spec, "authored: " + x["why"])
            n += 1
        log("  placed", n)

    # ---------------------------------------------------------------- beds
    def beds(self):
        log("beds: ambience layers")
        ramps = shot_ramps(self.tl)
        layers = sorted(A.BED_KIND)
        cache_layers = {}
        for layer in layers:
            D = bed_targets(self.tl, layer)
            on = np.where(D > A.OFF)[0]
            if not len(on):
                continue
            f0, f1 = max(0, on[0] - 48), min(self.tl.frames, on[-1] + 49)
            s0, s1 = f0 * SPF, f1 * SPF
            dur = (s1 - s0) / SR
            kind, var = A.BED_KIND[layer]
            rng = fx.rng_for("bed", layer)
            if kind == "waves_rock":
                y, _ = fx.waves_rock_bed(rng, dur)
            elif kind == "sea":
                y, _ = fx.sea_bed(rng, dur, var)
            elif kind == "wind":
                y, _ = fx.wind_bed(rng, dur, var)
            elif kind == "birds":
                y, _ = fx.birds_bed(rng, dur)
            elif kind == "chamber":
                if "chamber" not in cache_layers:
                    cache_layers["chamber"] = (fx.chamber_beds(fx.rng_for("bed", "chamber"), dur), s0)
                # one synthesis for the three chamber layers (they share the same span)
                cl, cs0 = cache_layers["chamber"]
                y = cl[var]
                if cs0 != s0 or len(y) != s1 - s0:
                    y = self._resize(y, cs0, s0, s1)
            else:
                raise KeyError(kind)
            y = fx.norm_rms(y[: s1 - s0])
            kt, ka = keyframes_from_frames(D, ramps)
            g = gain_curve(kt, ka, s0, s1) * duck_gain(self.duck, self.blk, s0, s1, A.BED_DUCK_DB)
            st = y * g[:, None]
            space = A.BED_SPACE.get(layer)
            self.put("FX", st, s0, space, -14.0 if space else None)
            self.cuesheet.append({"kind": "bed", "id": f"bed:{layer}", "layer": layer, "gen": f"sfx_lib.{kind}",
                                  "variant": var, "from_frame": int(f0), "to_frame": int(f1), "seed_key": f"bed|{layer}",
                                  "levels_db": self._level_summary(D), "duck_db": A.BED_DUCK_DB,
                                  "source": f"procedural: sfx_lib ({kind})"})

    @staticmethod
    def _resize(y, ys0, s0, s1):
        out = np.zeros((s1 - s0, 2))
        a, b = max(ys0, s0), min(ys0 + len(y), s1)
        out[a - s0: b - s0] = y[a - ys0: b - ys0]
        return out

    def _level_summary(self, D):
        out = []
        for e in self.tl.events:
            v = float(D[e["start_frame"]])
            if v > A.OFF:
                out.append([e["id"], round(v, 1)])
        return out

    def altitude(self):
        log("beds: altitude wind")
        T = alt_targets(self.tl)
        on = np.where(np.any([T[k] > A.OFF for k in ALT_LAYERS], axis=0))[0]
        f0, f1 = max(0, on[0] - 24), min(self.tl.frames, on[-1] + 25)
        s0, s1 = f0 * SPF, f1 * SPF
        L = fx.altitude_layers(fx.rng_for("bed", "altitude"), (s1 - s0) / SR)
        ramps = shot_ramps(self.tl)
        dg = duck_gain(self.duck, self.blk, s0, s1, A.ALT_DUCK_DB)
        total = np.zeros((s1 - s0, 2))
        for k in ALT_LAYERS:
            kt, ka = keyframes_from_frames(T[k], ramps)
            total += L[k][: s1 - s0] * (gain_curve(kt, ka, s0, s1) * dg)[:, None]
        self.put("FX", total, s0)
        lv = {e["id"]: {"level_db": A.ALT[e["id"]][0], "buffet": A.ALT[e["id"]][1], "bright": A.ALT[e["id"]][2]}
              for e in self.tl.shots if e["id"] in A.ALT}
        self.cuesheet.append({"kind": "bed", "id": "bed:altitude", "layer": "altitude", "gen": "sfx_lib.altitude_layers",
                              "layers": list(ALT_LAYERS), "from_frame": int(f0), "to_frame": int(f1),
                              "seed_key": "bed|altitude", "per_shot": lv, "extra_keys": A.EXTRA_ALT_KEYS,
                              "duck_db": A.ALT_DUCK_DB, "source": "procedural: sfx_lib.altitude_layers"})

    # ---------------------------------------------------------------- wingbeats
    def set_time(self, shot, frame):
        j = self.jobs[shot]
        return j["set_time_start_s"] + (frame - j["edl_start_frame"]) / FPS

    def frame_of(self, shot, t):
        j = self.jobs[shot]
        return j["edl_start_frame"] + (t - j["set_time_start_s"]) * FPS

    def onsets(self, creature):
        """Every downstroke onset (EDL frame, float) of a creature, with its shot and the
        (hz, phase) that produces it with poses.js flight()."""
        hz0 = A.HZ[creature]
        segs = sorted(A.TEMPO.get(creature, []), key=lambda s: s["from"])
        # global uneven onsets (seeded), rescaled to fill their segment exactly
        uneven = {}
        for s in segs:
            if s["mode"] == "uneven":
                rng = fx.rng_for("uneven", creature, s["from"])
                span = (s["to"] - s["from"]) / FPS
                iv = []
                while sum(iv) < span:
                    iv.append(s["lo"] + (s["hi"] - s["lo"]) * rng.random())
                iv = np.array(iv) * span / sum(iv)
                uneven[s["from"]] = s["from"] + np.concatenate([[0], np.cumsum(iv)[:-1]]) * FPS
        cue_frames = {}
        for e in self.tl.shots:
            for c in e.get("sfx", []):
                if (creature == "leaf" and c["cue"] in ("leaf_beats", "leaf_beats_uneven")) or (
                        creature == "charcoal" and c["cue"] == "charcoal_beats"):
                    cue_frames.setdefault(e["id"], []).append(c["frame"])
        out = []
        for e in self.tl.shots:
            if creature not in A.FLIGHT.get(e["id"], {}):
                continue
            a, b = e["start_frame"], e["end_frame"]
            # regions: special segments clipped to the shot, steady regions in between
            pieces, cur = [], a
            for s in segs:
                if s["to"] <= a or s["from"] >= b:
                    continue
                if s["from"] > cur:
                    pieces.append(("steady", cur, s["from"], {"hz": hz0}))
                pieces.append((s["mode"], max(a, s["from"]), min(b, s["to"]), s))
                cur = min(b, s["to"])
            if cur < b:
                pieces.append(("steady", cur, b, {"hz": hz0}))
            for k, (mode, r0, r1, s) in enumerate(pieces):
                if mode == "glide":
                    out.append({"shot": e["id"], "mode": "glide", "from": r0, "to": r1, "onsets": [], "why": s.get("why")})
                    continue
                if mode == "uneven":
                    fr = [float(f) for f in uneven[s["from"]] if r0 <= f < r1]
                    out.append({"shot": e["id"], "mode": "uneven", "from": r0, "to": r1, "onsets": fr, "why": s.get("why")})
                    continue
                if mode == "double":
                    out.append({"shot": e["id"], "mode": "double", "from": r0, "to": r1, "onsets": [float(r0)],
                                "why": s.get("why")})
                    continue
                special = "mode" in s            # a TEMPO steady segment with its own hz
                hz = s.get("hz", hz0)
                cues_in = [f for f in cue_frames.get(e["id"], []) if r0 <= f < r1]
                if special:
                    anchor, why = r0, "tempo change starts on a downstroke"
                elif k > 0:
                    anchor, why = r0, "continuous with the previous segment (it ended on a downstroke)"
                elif cues_in:
                    anchor, why = cues_in[0], "EDL cue frame for this creature in this shot"
                elif k + 1 < len(pieces):
                    anchor, why = r1, "continuous with the next segment (a downstroke falls on its first frame)"
                else:
                    anchor, why = None, "pure set-time formula (phase 0)"
                t0, t1 = self.set_time(e["id"], r0), self.set_time(e["id"], r1)
                if anchor is None:
                    phase = 0.0
                else:
                    phase = float((-self.set_time(e["id"], anchor) * hz) % 1.0)
                k0 = int(np.ceil(t0 * hz + phase - 1e-9))
                fr = []
                kk = k0
                while True:
                    t = (kk - phase) / hz
                    if t >= t1 - 1e-9:
                        break
                    fr.append(self.frame_of(e["id"], t))
                    kk += 1
                out.append({"shot": e["id"], "mode": "steady", "from": r0, "to": r1, "hz": hz, "phase": round(phase, 6),
                            "anchor": anchor, "anchor_rule": why, "onsets": [round(f, 4) for f in fr], "why": s.get("why")})
        return out

    def wingbeats(self):
        log("wingbeats: Leaf and Charcoal")
        contract = {"schema": "dragons-kingdom/preview-wingbeats v1", "generated_by": REL(Path(__file__)),
                    "edl_frames": self.tl.frames, "fps": FPS,
                    "formula": "poses.js flight(c, {t, hz, phase, corr}): cyc = fract(t*hz + phase); a downstroke starts "
                               "where cyc == 0 (wingFlap: downstroke = first 0.56 of the cycle). t = the set scene's time "
                               "= render-jobs.json set_time_start_s + (EDL frame - edl_start_frame) / 24.",
                    "uneven_and_double": "segments with mode 'uneven' or 'double' list explicit onsets; animate them with "
                                         "cyc = (t - onset_k) / (onset_k+1 - onset_k) between consecutive onsets (the next "
                                         "segment's first onset closes the last cycle). 'glide': wings held (poses.js glide).",
                    "rule": "The sound plays a downstroke at every onset below. If the animation changes, change "
                            "soundtrack_shots.py (HZ, TEMPO, FLIGHT) and rebuild; never retime one side only.",
                    "creatures": {}}
        beats = Bus(0, self.tl.N)
        for creature in ("leaf", "charcoal"):
            segs = self.onsets(creature)
            all_on = sorted({(round(f, 4), s["shot"], s["mode"]) for s in segs for f in s["onsets"]})
            placed = []
            for i, (f, shot, mode) in enumerate(all_on):
                nxt = all_on[i + 1][0] if i + 1 < len(all_on) else f + FPS / A.HZ[creature]
                period = float(np.clip((nxt - f) / FPS, 0.2, 2.0 if creature == "charcoal" else 0.9))
                gain, pan, dist = self.flight_params(creature, shot, f)
                rng = fx.rng_for("beat", creature, shot, i)
                t_set = self.set_time(shot, f)
                corr = A.CORR[creature]
                amp = 1 + corr * 0.15 * self.wob(t_set * A.HZ[creature] * 0.9, 6)
                if creature == "leaf":
                    hard = 0.6 if mode == "uneven" else (0.5 if mode == "double" else 0.0)
                    if mode == "uneven":
                        amp *= 0.8 + 0.4 * rng.random()
                    y, _ = fx.leaf_beat(rng, period=min(period, 0.9), dist=dist, amp=1.0, hard=hard)
                else:
                    y, _ = fx.charcoal_beat(rng, period=period if period > 0.6 else 1 / 0.76, dist=dist)
                y = fx.norm_cue(y) * fx.db(gain) * amp
                beats.add(fx.balance(y, pan), int(round(f * SPF)))
                placed.append({"frame": round(f, 3), "sample": int(round(f * SPF)), "shot": shot, "mode": mode,
                               "gain_db": round(gain + 20 * np.log10(amp), 2), "pan": round(pan, 3), "dist": dist})
            # explicit ground beats (riding grounds): the launch is the launch_downbeat cue
            for f, realized in A.GROUND_BEATS.get(creature, []):
                if realized == "charcoal_beats":
                    rng = fx.rng_for("beat", creature, "ground", f)
                    y, _ = fx.charcoal_beat(rng, dist=1.8)
                    y = fx.norm_cue(y) * fx.db(-6.0)
                    beats.add(fx.balance(y, 0.0), f * SPF)
                    placed.append({"frame": f, "sample": f * SPF, "shot": self.tl.event_at(f)["id"], "mode": "ground",
                                   "gain_db": -6.0, "pan": 0.0, "dist": 1.8})
            contract["creatures"][creature] = {
                "flapHz": A.HZ[creature], "corr": A.CORR[creature],
                "segments": segs,
                "ground_beats": [{"frame": f, "shot": self.tl.event_at(f)["id"], "realized_by": r}
                                 for f, r in A.GROUND_BEATS.get(creature, [])],
                "extra_onsets": ([{"frame": 14263, "shot": "1E-18", "realized_by": "banking_wingbeat (EDL cue)",
                                   "note": "one deep banking downstroke; glide before and after"}]
                                 if creature == "charcoal" else []),
                "count": len(placed)}
            self.cuesheet.append({"kind": "wingbeats", "id": f"beats:{creature}", "count": len(placed),
                                  "source": f"procedural: sfx_lib.{creature}_beat", "duck_db": A.BEAT_DUCK_DB,
                                  "beats": placed})
            log(f"  {creature}: {len(placed)} downstrokes")
        nz = np.where(np.any(beats.x != 0, axis=1))[0]
        a, b = int(nz[0]), int(nz[-1]) + 1
        dg = duck_gain(self.duck, self.blk, a, b, A.BEAT_DUCK_DB)
        self.stem["FX"][a:b] += beats.x[a:b] * dg[:, None].astype(np.float32)
        (PREVIEW / "wingbeats.json").write_text(json.dumps(contract, indent=1) + "\n")
        self.contract = contract

    @staticmethod
    def wob(t, seed=0):
        return np.sin(t * 1.0 + seed) * 0.5 + np.sin(t * 2.31 + seed * 1.7) * 0.3 + np.sin(t * 4.77 + seed * 2.9) * 0.2

    def flight_params(self, creature, shot, frame):
        gain, pan, dist = A.FLIGHT[shot][creature]
        r = A.FLIGHT_RAMPS.get(shot)
        if r and r[0] == creature:
            e = self.tl.by_id[shot]
            u = (frame - e["start_frame"]) / max(1, e["end_frame"] - e["start_frame"])
            gain = r[1] + (r[2] - r[1]) * u
            pan = r[3] + (r[4] - r[3]) * u
        return gain, pan, dist

    # ---------------------------------------------------------------- music
    def music(self):
        log("music: score cues")
        score.check_soundfont()
        nm_windows = [(w["from_frame"], w["to_frame"]) for w in self.edl["no_music_windows"]]
        self.music_info = []
        for c in self.edl["music"]:
            s0, s1 = c["start_frame"] * SPF, c["end_frame"] * SPF
            dur = (s1 - s0) / SR
            quiet = []
            for ln in self.lines:
                for a, b in speech_windows(ln):
                    if a < s1 / SR and b > s0 / SR:
                        quiet.append((a - s0 / SR - 0.25, b - s0 / SR + 0.25))
            sc = score.build_cue(c["id"], dur, quiet)
            if c["id"] in ("M2b", "M2c"):
                for nt in sc.notes:
                    if nt["part"] != "flute":
                        continue
                    for a, b in quiet:
                        if nt["t0"] < b and nt["t1"] + 0.15 > a:
                            self.problems.append(f"{c['id']}: flute note {nt} sounds under a line ({a:.2f}-{b:.2f} s)")
            x, info = score.render(sc, CACHE / "music", c["id"])
            x = x[: s1 - s0] if len(x) >= s1 - s0 else np.pad(x, ((0, s1 - s0 - len(x)), (0, 0)))
            x = fx.norm_active(x) * fx.db(MUSIC_GAIN[c["id"]])
            n = s1 - s0
            env = np.ones(n)
            fi, fo = c["fade_in_frames"] * SPF, c["fade_out_frames"] * SPF
            if fi:
                env[:fi] = np.sin(np.linspace(0, np.pi / 2, fi)) ** 2
            if fo:
                env[n - fo:] *= np.cos(np.linspace(0, np.pi / 2, fo)) ** 2
            x = x * (env * duck_gain(self.duck, self.blk, s0, s1, MUSIC_DUCK_DB))[:, None]
            self.put("MX", x, s0)
            for a, b in nm_windows:
                if a * SPF < s1 and b * SPF > s0:
                    self.problems.append(f"{c['id']} overlaps no-music window {a}-{b}")
            rec = {"kind": "music", "id": c["id"], "name": c["name"], "from_frame": c["start_frame"],
                   "to_frame": c["end_frame"], "start_sample": s0, "end_sample": s1,
                   "fade_in_frames": c["fade_in_frames"], "fade_out_frames": c["fade_out_frames"],
                   "gain_db": MUSIC_GAIN[c["id"]], "duck_db": MUSIC_DUCK_DB, "render": info,
                   "notes": sc.notes if c["id"] != "M2b" else len(sc.notes),
                   "source": "original score (tools/score.py) -> MIDI -> FluidSynth 2.3.4 (LGPL-2.1+) + FluidR3_GM "
                             "(MIT) + synthetic hall (sfx_lib.reverb_ir)"}
            self.music_info.append(rec)
            self.cuesheet.append(rec)

    # ---------------------------------------------------------------- master
    def write_premaster(self):
        pre = CACHE / "premaster.wav"
        with sf.SoundFile(str(pre), "w", SR, 2, subtype="FLOAT") as f:
            for a in range(0, self.tl.N, 1 << 21):
                b = min(self.tl.N, a + (1 << 21))
                f.write(self.stem["DX"][a:b] + self.stem["MX"][a:b] + self.stem["FX"][a:b])
        return pre

    @staticmethod
    def ffmpeg(*a):
        return subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *a], capture_output=True, text=True)

    def loudnorm_measure(self, path):
        r = self.ffmpeg("-i", str(path), "-af",
                        f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=json", "-f", "null", "-")
        return json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S).group(0))

    def master(self):
        log("master: loudnorm pass 1 (measure)")
        pre = self.write_premaster()
        m0 = self.loudnorm_measure(pre)
        g1 = TARGET_I - float(m0["input_i"])
        log(f"  premaster I {m0['input_i']} LUFS, TP {m0['input_tp']} dBTP -> gain {g1:+.2f} dB, true-peak limiter at {LIMIT_TP} dBTP")
        x, _ = sf.read(str(pre), dtype="float64")
        lim_path = CACHE / "premaster_limited.wav"
        iters = []
        for it in range(4):   # limiting lowers loudness a little: re-aim until the limited file is on target
            y, lim = tp_limit(x * fx.db(g1), LIMIT_TP)
            sf.write(str(lim_path), y.astype(np.float32), SR, subtype="FLOAT")
            del y
            log(f"master: loudnorm pass 1 on the limited premaster (gain {g1:+.2f} dB)")
            m1 = self.loudnorm_measure(lim_path)
            iters.append({"gain_db": round(g1, 3), "limited_i": float(m1["input_i"]), "limited_tp": float(m1["input_tp"]),
                          "limiter_max_gr_db": lim["max_gain_reduction_db"]})
            if abs(float(m1["input_i"]) - TARGET_I) <= 0.05:
                break
            g1 += TARGET_I - float(m1["input_i"])
        del x
        out = MIX / "preview_mix.wav"
        af = (f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:measured_I={m1['input_i']}:"
              f"measured_TP={m1['input_tp']}:measured_LRA={m1['input_lra']}:measured_thresh={m1['input_thresh']}:"
              f"offset={m1['target_offset']}:linear=true:print_format=json")
        log("master: loudnorm pass 2 (apply, linear)")
        r = self.ffmpeg("-i", str(lim_path), "-af", af, "-ar", str(SR), "-c:a", "pcm_s24le", str(out))
        m2 = json.loads(re.search(r"\{[^{}]*\"output_i\"[^{}]*\}", r.stderr, re.S).group(0))
        if m2["normalization_type"] != "linear":
            self.problems.append(f"loudnorm pass 2 fell back to {m2['normalization_type']} mode")
        info = sf.info(str(out))
        if info.frames != self.tl.N:
            self.problems.append(f"master has {info.frames} samples, EDL needs {self.tl.N}")
        # linear mode applies one gain to the whole file; measure it from the files themselves
        a, _ = sf.read(str(out), dtype="float64")
        b, _ = sf.read(str(lim_path), dtype="float64")
        g2 = float(10 * np.log10(np.sum(a ** 2) / np.sum(b ** 2)))
        resid = float(10 * np.log10(np.sum((a - b * fx.db(g2)) ** 2) / np.sum(a ** 2) + 1e-30))
        del a, b
        total = g1 + g2
        for name, key in (("dialogue", "DX"), ("music", "MX"), ("sfx", "FX")):
            sf.write(str(STEMS / f"{name}.wav"), (self.stem[key].astype(np.float64) * fx.db(total)).astype(np.float32),
                     SR, subtype="FLOAT")
        self.mastering = {"loudnorm_pass1_premaster": m0, "gain1_db": round(g1, 3), "gain1_iterations": iters,
                          "dialogue_compressor": DX_COMP, "dialogue_take_ceiling_dbtp": DX_TAKE_CEILING_DBTP,
                          "limiter": lim, "loudnorm_pass1_limited": m1, "loudnorm_pass2": m2,
                          "gain2_db": round(g2, 4), "gain2_from": "measured: 10 log10(sum master^2 / sum limited^2)",
                          "gain2_residual_db": round(resid, 1), "stems_gain_db": round(total, 4),
                          "targets": {"I": TARGET_I, "TP": TARGET_TP, "LRA": TARGET_LRA, "pre_limiter_ceiling_dbtp": LIMIT_TP},
                          "master_samples": info.frames, "master_subtype": info.subtype}
        log(f"  master: I {m2['output_i']} LUFS, TP {m2['output_tp']} dBTP ({m2['normalization_type']}), "
            f"{info.frames} samples")

    # ---------------------------------------------------------------- run
    def run(self):
        t0 = time.perf_counter()
        self.dialogue()
        self.cues()
        self.beds()
        self.altitude()
        self.wingbeats()
        self.music()
        log("reverb returns")
        self.render_sends()
        for k in self.stem:
            if not np.all(np.isfinite(self.stem[k])):
                self.problems.append(f"stem {k} has non-finite samples")
        self.master()
        self.write_json(time.perf_counter() - t0)
        if self.problems:
            log("PROBLEMS:\n  " + "\n  ".join(self.problems))
        return not self.problems

    def write_json(self, wall):
        def ver(cmd):
            try:
                return subprocess.run(cmd, capture_output=True, text=True).stdout.splitlines()[0].strip()
            except Exception:
                return None
        import scipy
        doc = {
            "schema": "dragons-kingdom/preview-soundtrack v1",
            "episode": "S01E01",
            "status": "PROVISIONAL work-in-progress soundtrack: procedural sound effects, a code-written score and "
                      "temporary computer voices. Nobody has listened to it; every check is a measurement "
                      "(check_mix.py). Not approved by Daxtyn.",
            "generated_by": REL(Path(__file__)),
            "authored_decisions": REL(HERE / "soundtrack_shots.py"),
            "inputs": {REL(p): sha256_file(p) for p in (PREVIEW / "edl.json", PREVIEW / "render-jobs.json",
                                                        PREVIEW / "vo" / "takes.json", HERE / "sfx_lib.py",
                                                        HERE / "score.py", HERE / "soundtrack_shots.py",
                                                        Path(__file__))},
            "format": {"rate": SR, "channels": 2, "fps": FPS, "samples_per_frame": SPF, "frames": self.tl.frames,
                       "samples": self.tl.N, "master": "mix/preview_mix.wav (PCM 24-bit)",
                       "stems": "mix/stems/{dialogue,music,sfx}.wav (32-bit float, master gain, before the limiter)"},
            "levels": {"dialogue_ref_dbfs": fx.REF_DB, "cue_ref_dbfs": fx.CUE_REF_DB, "music_gain_db": MUSIC_GAIN,
                       "ducking": {"music_db": MUSIC_DUCK_DB, "altitude_wind_db": A.ALT_DUCK_DB, "beds_db": A.BED_DUCK_DB,
                                   "wingbeats_db": A.BEAT_DUCK_DB, "attack_s": DUCK_ATTACK, "release_s": DUCK_RELEASE,
                                   "lead_s": DUCK_LEAD, "key": "edl.json line speech windows"}},
            "mastering": self.mastering,
            "tools": {"numpy": np.__version__, "scipy": scipy.__version__, "soundfile": sf.__version__,
                      "ffmpeg": ver(["ffmpeg", "-version"]), "fluidsynth": score.fluidsynth_version(),
                      "soundfont": {"path": str(score.SOUNDFONT), "sha256": score.SOUNDFONT_SHA256,
                                    "license": "MIT (Frank Wen), Debian fluid-soundfont-gm 3.1"},
                      "sox": ver(["sox", "--version"])},
            "problems": self.problems,
            "cues": self.cuesheet,
        }
        (MIX / "soundtrack.json").write_text(json.dumps(doc, indent=1, default=_json_default) + "\n")
        log(f"wrote mix/soundtrack.json ({len(self.cuesheet)} cue-sheet entries); build took {wall:.0f} s")


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, tuple):
        return list(o)
    raise TypeError(type(o))


# ============================================================================ dialogue compressor
def compress(x, p=None, block=48):
    """Feed-forward RMS compressor (mono take). Returns (y, gain_reduction_db per sample)."""
    from scipy.ndimage import uniform_filter1d
    p = p or DX_COMP
    pw = uniform_filter1d(x.astype(np.float64) ** 2, max(1, int(p["detector_s"] * SR)))
    lv = 10 * np.log10(pw + 1e-20)
    T, R, W = p["threshold_dbfs"], p["ratio"], p["knee_db"]
    over = lv - T
    gr = np.where(over <= -W / 2, 0.0, np.where(over >= W / 2, over * (1 - 1 / R),
                                                (1 - 1 / R) * (over + W / 2) ** 2 / (2 * W)))
    n = len(x)
    nb = -(-n // block)
    grb = np.pad(gr, (0, nb * block - n)).reshape(nb, block).max(axis=1)
    aa = 1 - np.exp(-block / (SR * p["attack_s"]))
    ar = 1 - np.exp(-block / (SR * p["release_s"]))
    sm = np.empty(nb)
    cur = 0.0
    for i in range(nb):
        cur += (grb[i] - cur) * (aa if grb[i] > cur else ar)
        sm[i] = cur
    g = np.interp(np.arange(n), (np.arange(nb) + 0.5) * block, sm)
    return x * fx.db(-g + p["makeup_db"]), g


# ============================================================================ true-peak limiter
def true_peak_env(x, os_=4, chunk=1 << 20):
    """Per-sample true-peak estimate (max over channels of the 4x oversampled signal)."""
    n = len(x)
    pk = np.zeros(n)
    pad = 256
    for s0 in range(0, n, chunk):
        a, b = max(0, s0 - pad), min(n, s0 + chunk + pad)
        up = signal.resample_poly(x[a:b], os_, 1, axis=0)
        m = np.abs(up).max(axis=1).reshape(-1, os_).max(axis=1)
        e = min(n, s0 + chunk)
        pk[s0:e] = m[s0 - a: s0 - a + (e - s0)]
    return pk


def tp_limit(x, ceiling_db, block=32, attack_blocks=3, release_s=0.08):
    """Look-ahead true-peak limiter, zero latency (gain is computed ahead of the peaks, never
    shifts the audio): block-rate gain = min over a look-ahead window, exponential release,
    trailing average for the attack. Guarantees gain <= the per-sample requirement."""
    ceil = fx.db(ceiling_db)
    pk = true_peak_env(x)
    req = np.minimum(1.0, ceil / np.maximum(pk, 1e-12))
    n = len(x)
    nb = -(-n // block)
    reqb = np.pad(req, (0, nb * block - n), constant_values=1.0).reshape(nb, block).min(axis=1)
    K = attack_blocks
    la = minimum_filter1d(reqb, size=2 * K, origin=-K, mode="nearest")
    a = np.exp(-block / (SR * release_s))
    g = np.empty(nb)
    cur = 1.0
    for i in range(nb):
        cur = min(la[i], 1.0 - (1.0 - cur) * a)
        g[i] = cur
    gs = np.convolve(g, np.ones(K) / K)[:nb]
    gs[: K - 1] = g[: K - 1] if K > 1 else gs[: K - 1]
    gs = np.minimum(gs, reqb)
    centers = (np.arange(nb) + 0.5) * block
    gi = np.interp(np.arange(n), centers, gs)
    gstep = np.repeat(gs, block)[:n]
    gain = np.minimum(gi, gstep)
    y = x * gain[:, None]
    pk2 = true_peak_env(y)
    active = gain < 0.9999
    info = {"ceiling_dbtp": ceiling_db, "true_peak_in_dbtp": round(float(20 * np.log10(pk.max())), 2),
            "true_peak_out_dbtp": round(float(20 * np.log10(pk2.max())), 2),
            "max_gain_reduction_db": round(float(-20 * np.log10(gain.min())), 2),
            "active_s": round(float(active.sum() / SR), 2),
            "oversampling": 4, "block": block, "lookahead_ms": round(2 * K * block / SR * 1000, 2), "release_s": release_s}
    regions = []
    for i in np.where(np.diff(np.concatenate([[0], active.astype(np.int8), [0]])))[0]:
        regions.append(i)
    info["regions"] = [[round(regions[k] / SR, 3), round(regions[k + 1] / SR, 3),
                        round(float(-20 * np.log10(gain[regions[k]: regions[k + 1]].min())), 2)]
                       for k in range(0, len(regions), 2)]
    return y, info


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--no-check", action="store_true", help="do not run check_mix.py afterwards")
    args = ap.parse_args()
    ok = Builder(args).run()
    if not args.no_check:
        r = subprocess.run([sys.executable, "-I", str(HERE / "check_mix.py")])
        ok = ok and r.returncode == 0
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
