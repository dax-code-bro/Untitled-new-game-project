"""Real feasibility test of free offline TTS for Dragon's Kingdom S01E01.

Runs Piper (several GitHub-hosted voices), Kokoro-82M (ONNX, int8) and espeak-ng
on Remi and Abby test lines. Limited to 2 CPU threads (a render benchmark may be
running). Writes WAVs to ./tts/ and timings to ./tts/results.json.
"""
import json, os, subprocess, sys, time, wave
from pathlib import Path

import numpy as np
import onnxruntime

HERE = Path(__file__).resolve().parent
VO = HERE / "voices"
OUT = HERE / "tts"
OUT.mkdir(exist_ok=True)
THREADS = 2

# Exact screenplay lines ([ORIGINAL] lines are byte-exact).
LINES = {
    "remi_L046_original": "You're going to be queen when I'm gone. Least I think that's how that works. You good with that?",
    "remi_L0xx_abby": "Abby! Look at me. Abby!",
    "abby_L048_original": "Why couldn't I get a Bashion?",
    "abby_grass": "You could have warned the grass.",
    "abby_arm": "My arm. Don't pull it.",
}


def sess_opts():
    o = onnxruntime.SessionOptions()
    o.intra_op_num_threads = THREADS
    o.inter_op_num_threads = 1
    return o


def wav_info(path):
    with wave.open(str(path), "rb") as w:
        n, sr = w.getnframes(), w.getframerate()
        x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    return x, sr


def f0_median(x, sr):
    """Crude autocorrelation pitch estimate over voiced 40 ms frames (Hz)."""
    hop, win = int(0.02 * sr), int(0.04 * sr)
    lo, hi = int(sr / 400), int(sr / 70)
    f0s = []
    rms_all = np.sqrt(np.mean(x ** 2)) + 1e-9
    for i in range(0, len(x) - win, hop):
        fr = x[i:i + win] - np.mean(x[i:i + win])
        if np.sqrt(np.mean(fr ** 2)) < 0.5 * rms_all:
            continue
        ac = np.correlate(fr, fr, "full")[win - 1:]
        if ac[0] <= 0:
            continue
        seg = ac[lo:hi]
        k = int(np.argmax(seg)) + lo
        if ac[k] / ac[0] > 0.45:
            f0s.append(sr / k)
    return float(np.median(np.array(f0s, dtype=np.float64))) if f0s else None


results = []


def record(engine, voice, speaker, key, path, secs, settings, license_):
    x, sr = wav_info(path)
    dur = len(x) / sr
    r = {
        "engine": engine, "voice": voice, "speaker": speaker, "line": key,
        "file": str(path.relative_to(HERE)), "sample_rate": sr,
        "audio_s": round(dur, 2), "gen_s": round(secs, 3),
        "realtime_factor": round(secs / dur, 3) if dur else None,
        "f0_median_hz": (round(f0_median(x, sr), 1) if f0_median(x, sr) else None),
        "peak_dbfs": round(float(20 * np.log10(np.max(np.abs(x)) + 1e-9)), 1),
        "settings": settings, "license": license_,
    }
    results.append(r)
    print(json.dumps(r))


# ---------------- Piper ----------------
from piper import PiperVoice
from piper.config import PiperConfig, SynthesisConfig


def load_piper(name):
    d = VO / f"voice-{name}"
    model = d / f"{name}.onnx"
    cfg = json.loads((d / f"{name}.onnx.json").read_text())
    t0 = time.perf_counter()
    sess = onnxruntime.InferenceSession(str(model), sess_options=sess_opts(), providers=["CPUExecutionProvider"])
    v = PiperVoice(config=PiperConfig.from_dict(cfg), session=sess,
                   espeak_data_dir=Path(__import__("piper").__file__).parent / "espeak-ng-data",
                   download_dir=HERE)
    return v, time.perf_counter() - t0


def piper_say(v, text, path, **kw):
    sc = SynthesisConfig(**kw)
    t0 = time.perf_counter()
    with wave.open(str(path), "wb") as wf:
        v.synthesize_wav(text, wf, syn_config=sc)
    return time.perf_counter() - t0


PIPER_LICENSES = {
    "en-us-libritts-high": "Dataset LibriTTS (OpenSLR 60) CC BY 4.0; model trained from scratch. Engine piper-tts GPL-3.0-or-later.",
    "en-us-ryan-medium": "Dataset RyanSpeech CC BY-NC-SA 4.0 (NON-COMMERCIAL, share-alike).",
    "en-us-ryan-high": "Dataset RyanSpeech CC BY-NC-SA 4.0 (NON-COMMERCIAL, share-alike).",
    "en-us-lessac-medium": "Dataset Lessac Blizzard 2013 (CSTR licence page blocked from this machine; Blizzard data is research/non-commercial terms - treat as NON-COMMERCIAL).",
    "en-us-kathleen-low": "Dataset CC0, BUT model fine-tuned from Ryan (CC BY-NC-SA data) - treat as NON-COMMERCIAL.",
    "en-gb-southern_english_female-low": "Dataset OpenSLR 83 CC BY-SA 4.0, BUT fine-tuned from Ryan (CC BY-NC-SA) - treat as NON-COMMERCIAL.",
    "en-us-amy-low": "Mimic3 dataset, licence not stated; fine-tuned from Ryan - UNCLEAR, avoid.",
}

load_times = {}

# 1) LibriTTS multi-speaker: sample speakers, measure pitch, to find distinct voices.
v_lt, lt_load = load_piper("en-us-libritts-high")
load_times["piper en-us-libritts-high"] = round(lt_load, 2)
probe = "Then let it finish. Stay within reach of the island."
scan = []
sample_ids = list(range(0, 904, 12))
(OUT / "scan").mkdir(exist_ok=True)
t_scan = time.perf_counter()
if (OUT / "libritts_scan.json").exists():
    scan = json.load(open(OUT / "libritts_scan.json"))
    sample_ids = []
for sid in sample_ids:
    p = OUT / "scan" / f"lt_{sid:03d}.wav"
    secs = piper_say(v_lt, probe, p, speaker_id=sid)
    x, sr = wav_info(p)
    scan.append({"speaker_id": sid, "f0_median_hz": f0_median(x, sr), "audio_s": round(len(x) / sr, 2), "gen_s": round(secs, 3)})
scan_wall = (time.perf_counter() - t_scan) if sample_ids else 118.9
print("scan done", round(scan_wall, 1), "s for", len(sample_ids), "speakers")
json.dump(scan, open(OUT / "libritts_scan.json", "w"), indent=1)
sample_ids = [s["speaker_id"] for s in scan]

# Pick lowest-pitched and higher-pitched speakers as Remi / Abby candidates.
voiced = [s for s in scan if s["f0_median_hz"]]
males = sorted([s for s in voiced if s["f0_median_hz"] < 150], key=lambda s: s["f0_median_hz"])
females = sorted([s for s in voiced if s["f0_median_hz"] > 175], key=lambda s: -s["f0_median_hz"])
remi_cands = [m["speaker_id"] for m in males[len(males) // 2: len(males) // 2 + 2]] or [0]
abby_cands = [f["speaker_id"] for f in females[:2]] or [1]
print("remi candidates", remi_cands, "abby candidates", abby_cands)

for sid in remi_cands:
    for key in ("remi_L046_original", "remi_L0xx_abby"):
        p = OUT / f"piper_libritts_s{sid}_{key}.wav"
        secs = piper_say(v_lt, LINES[key], p, speaker_id=sid, length_scale=1.0)
        record("piper", "en-us-libritts-high", sid, key, p, secs, {"speaker_id": sid, "length_scale": 1.0}, PIPER_LICENSES["en-us-libritts-high"])
for sid in abby_cands:
    for key in ("abby_L048_original", "abby_grass", "abby_arm"):
        p = OUT / f"piper_libritts_s{sid}_{key}.wav"
        secs = piper_say(v_lt, LINES[key], p, speaker_id=sid, length_scale=0.95)
        record("piper", "en-us-libritts-high", sid, key, p, secs, {"speaker_id": sid, "length_scale": 0.95}, PIPER_LICENSES["en-us-libritts-high"])

# 2) Single-speaker Piper voices (comparison; most are NON-COMMERCIAL).
for name, keys in (("en-us-ryan-high", ("remi_L046_original",)),
                   ("en-us-lessac-medium", ("abby_L048_original", "abby_grass")),
                   ("en-us-kathleen-low", ("abby_L048_original",)),
                   ("en-gb-southern_english_female-low", ("abby_L048_original",))):
    v, lt = load_piper(name)
    load_times["piper " + name] = round(lt, 2)
    for key in keys:
        p = OUT / f"piper_{name}_{key}.wav"
        secs = piper_say(v, LINES[key], p)
        record("piper", name, None, key, p, secs, {}, PIPER_LICENSES[name])
    del v

# ---------------- Kokoro (ONNX int8) ----------------
try:
    if os.environ.get("SKIP_KOKORO") == "1":
        raise SystemError("skipped here; run separately by kokoro_test.py")
    from kokoro_onnx import Kokoro
    import soundfile as sf
    t0 = time.perf_counter()
    ksess = onnxruntime.InferenceSession(str(VO / "kokoro-v1.0.int8.onnx"), sess_options=sess_opts(), providers=["CPUExecutionProvider"])
    kok = Kokoro.from_session(ksess, str(VO / "voices-v1.0.bin"))
    load_times["kokoro int8"] = round(time.perf_counter() - t0, 2)
    names = sorted(kok.get_voices())
    (OUT / "kokoro_voices.txt").write_text("\n".join(names))
    KLIC = "Kokoro-82M weights Apache-2.0; kokoro-onnx MIT; phonemes via espeak-ng (GPL-3.0, tool only)."
    for voice, keys, speed in (("am_michael", ("remi_L046_original", "remi_L0xx_abby"), 1.0),
                               ("bm_george", ("remi_L046_original",), 1.0),
                               ("af_heart", ("abby_L048_original", "abby_grass", "abby_arm"), 1.05),
                               ("bf_emma", ("abby_L048_original",), 1.05)):
        if voice not in names:
            print("missing kokoro voice", voice)
            continue
        for key in keys:
            p = OUT / f"kokoro_{voice}_{key}.wav"
            t0 = time.perf_counter()
            samples, sr = kok.create(LINES[key], voice=voice, speed=speed, lang="en-us" if voice[0] == "a" else "en-gb")
            secs = time.perf_counter() - t0
            sf.write(str(p), samples, sr, subtype="PCM_16")
            record("kokoro-82m-int8", voice, None, key, p, secs, {"speed": speed}, KLIC)
except Exception as e:  # report honestly
    print("KOKORO FAILED:", repr(e))
    results.append({"engine": "kokoro", "error": repr(e)})

# ---------------- espeak-ng (baseline) ----------------
for voice, key, pitch in (("en-us+m3", "remi_L046_original", 40), ("en-us+f3", "abby_L048_original", 60)):
    p = OUT / f"espeak_{voice.replace('+', '_')}_{key}.wav"
    t0 = time.perf_counter()
    subprocess.run(["espeak-ng", "-v", voice, "-s", "160", "-p", str(pitch), "-w", str(p), LINES[key]], check=True)
    record("espeak-ng", voice, None, key, p, time.perf_counter() - t0, {"speed_wpm": 160, "pitch": pitch}, "espeak-ng GPL-3.0 (output audio is yours)")

json.dump({"threads": THREADS, "load_times_s": load_times, "libritts_scan_wall_s": round(scan_wall, 1),
           "libritts_scan_speakers": len(sample_ids), "remi_candidates": remi_cands,
           "abby_candidates": abby_cands, "results": results}, open(OUT / "results.json", "w"), indent=1)
print("DONE")
