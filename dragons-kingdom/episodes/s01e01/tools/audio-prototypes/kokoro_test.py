"""Kokoro-82M (ONNX int8) test in its own process. 2 threads."""
import json, os, sys, time
from pathlib import Path
import numpy as np, onnxruntime, soundfile as sf, espeakng_loader
from kokoro_onnx import Kokoro
from kokoro_onnx.config import EspeakConfig
sys.path.insert(0, str(Path(__file__).parent))
HERE = Path(__file__).resolve().parent; VO = HERE / "voices"; OUT = HERE / "tts"
LINES = {
    "remi_L046_original": "You're going to be queen when I'm gone. Least I think that's how that works. You good with that?",
    "remi_L0xx_abby": "Abby! Look at me. Abby!",
    "abby_L048_original": "Why couldn't I get a Bashion?",
    "abby_grass": "You could have warned the grass.",
    "abby_arm": "My arm. Don't pull it.",
}
def f0_median(x, sr):
    hop, win = int(0.02 * sr), int(0.04 * sr); lo, hi = int(sr / 400), int(sr / 70); f0s = []
    rms_all = np.sqrt(np.mean(x ** 2)) + 1e-9
    for i in range(0, len(x) - win, hop):
        fr = x[i:i + win] - np.mean(x[i:i + win])
        if np.sqrt(np.mean(fr ** 2)) < 0.5 * rms_all: continue
        ac = np.correlate(fr, fr, "full")[win - 1:]
        if ac[0] <= 0: continue
        k = int(np.argmax(ac[lo:hi])) + lo
        if ac[k] / ac[0] > 0.45: f0s.append(sr / k)
    return float(np.median(f0s)) if f0s else None
o = onnxruntime.SessionOptions(); o.intra_op_num_threads = 2; o.inter_op_num_threads = 1
t0 = time.perf_counter()
sess = onnxruntime.InferenceSession(str(VO / "kokoro-v1.0.int8.onnx"), sess_options=o, providers=["CPUExecutionProvider"])
kok = Kokoro.from_session(sess, str(VO / "voices-v1.0.bin"),
                          espeak_config=EspeakConfig(lib_path='/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1', data_path='/usr/lib/x86_64-linux-gnu/espeak-ng-data'))
load_s = time.perf_counter() - t0
names = sorted(kok.get_voices()); (OUT / "kokoro_voices.txt").write_text("\n".join(names))
KLIC = "Kokoro-82M weights Apache-2.0; kokoro-onnx MIT; phonemes via espeak-ng (GPL-3.0, tool only)."
res = []
for voice, keys, speed in (("am_michael", ("remi_L046_original", "remi_L0xx_abby"), 1.0),
                           ("bm_george", ("remi_L046_original",), 1.0),
                           ("am_adam", ("remi_L046_original",), 1.0),
                           ("af_heart", ("abby_L048_original", "abby_grass", "abby_arm"), 1.05),
                           ("bf_emma", ("abby_L048_original",), 1.05),
                           ("af_bella", ("abby_L048_original",), 1.05)):
    if voice not in names: print("missing", voice); continue
    for key in keys:
        p = OUT / f"kokoro_{voice}_{key}.wav"
        t0 = time.perf_counter()
        x, sr = kok.create(LINES[key], voice=voice, speed=speed, lang="en-us" if voice[0] == "a" else "en-gb")
        secs = time.perf_counter() - t0
        sf.write(str(p), x, sr, subtype="PCM_16")
        x = np.asarray(x, dtype=np.float64); dur = len(x) / sr
        r = {"engine": "kokoro-82m-int8", "voice": voice, "line": key, "file": str(p.relative_to(HERE)), "sample_rate": sr,
             "audio_s": round(dur, 2), "gen_s": round(secs, 3), "realtime_factor": round(secs / dur, 3),
             "f0_median_hz": round(f0_median(x, sr) or 0, 1), "settings": {"speed": speed}, "license": KLIC}
        res.append(r); print(r["voice"], r["line"], "audio", r["audio_s"], "gen", r["gen_s"], "rtf", r["realtime_factor"], "f0", r["f0_median_hz"], "sr", sr)
json.dump({"threads": 2, "load_s": round(load_s, 2), "voices_available": names, "results": res}, open(OUT / "results_kokoro.json", "w"), indent=1)
print("kokoro voices:", len(names), " ".join(names))
