"""Audition reel built ONLY from voices.json + dialogue.json (proves the JSON is usable).

For each role: its audition line, rendered with the role's primary Kokoro settings,
sentence gaps, SoX pitch shift, resampled to 48 kHz, level-normalized. Extra demos:
L011 whisper DSP (Alexandria [ORIGINAL]) and L072 pain+cut-off (Abby).
Output: ./audition/<ROLE>_<LINE>.wav and ./audition/audition_reel.wav
"""
import json, os, re, subprocess, tempfile, time
from pathlib import Path
import numpy as np, onnxruntime, soundfile as sf
from scipy import signal
from kokoro_onnx import Kokoro
from kokoro_onnx.config import EspeakConfig

EP = Path("/home/user/Untitled-new-game-project/dragons-kingdom/episodes/s01e01")
HERE = Path(__file__).resolve().parent
OUT = HERE / "audition"; OUT.mkdir(exist_ok=True)
V = json.loads((EP / "voices.json").read_text())
D = json.loads((EP / "dialogue.json").read_text())
LINES = {l["id"]: l for l in D["lines"]}
SR_OUT = 48000

o = onnxruntime.SessionOptions(); o.intra_op_num_threads = int(os.environ.get("THREADS", "1")); o.inter_op_num_threads = 1
sess = onnxruntime.InferenceSession(str(HERE / "voices" / "kokoro-v1.0.int8.onnx"), sess_options=o, providers=["CPUExecutionProvider"])
kok = Kokoro.from_session(sess, str(HERE / "voices" / "voices-v1.0.bin"),
                          espeak_config=EspeakConfig(lib_path="/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1", data_path="/usr/lib/x86_64-linux-gnu/espeak-ng-data"))
RESPELL = {p["word"]: p["tts_respelling"] for p in V["pronunciation"] if p.get("tts_respelling")}


def tts_text(text):
    t = text.strip().strip("—").strip()
    for w, r in RESPELL.items():
        t = re.sub(rf"\b{re.escape(w)}\b", r, t)
    return t


def sentences(t):
    return [s for s in re.split(r"(?<=[.!?])\s+", t) if s]


def kokoro(text, prim, speed_mul=1.0):
    x, sr = kok.create(text, voice=prim["voice"], speed=prim["speed"] * speed_mul, lang=prim["lang"])
    return np.asarray(x, dtype=np.float64), sr


def trim(x, sr, thr_db=-45, keep=0.04):
    a = np.abs(x); thr = 10 ** (thr_db / 20) * (a.max() + 1e-12)
    nz = np.where(a > thr)[0]
    if not len(nz):
        return x
    i0, i1 = max(0, nz[0] - int(keep * sr)), min(len(x), nz[-1] + int(keep * sr))
    y = x[i0:i1].copy(); f = int(0.005 * sr)
    y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    return y


def sox(x, sr, *effects):
    with tempfile.TemporaryDirectory() as td:
        a, b = Path(td) / "a.wav", Path(td) / "b.wav"
        sf.write(str(a), x, sr, subtype="FLOAT")
        subprocess.run(["sox", str(a), "-b", "32", "-e", "floating-point", str(b), *effects], check=True, capture_output=True)
        y, sr2 = sf.read(str(b), dtype="float64")
    return y, sr2


def to48(x, sr):
    return sox(x, sr, "rate", "-v", str(SR_OUT))[0] if sr != SR_OUT else x


def norm_speech(x, target_db=-20.0, peak_db=-3.0):
    fr = int(0.02 * SR_OUT); m = len(x) // fr
    r = np.sqrt(np.mean(x[: m * fr].reshape(m, fr) ** 2, axis=1))
    voiced = r[r > 0.1 * r.max()]
    rms = np.sqrt(np.mean(voiced ** 2)) + 1e-12
    y = x * 10 ** (target_db / 20) / rms
    pk = np.max(np.abs(y))
    if pk > 10 ** (peak_db / 20):
        y *= 10 ** (peak_db / 20) / pk
    return y


def render_line(role, lid, speed_mul=1.0):
    r = V["roles"][role]; prim = r["primary"]
    gap = r.get("sentence_gap_s", V["render_defaults"]["sentence_gap_s"]["default"])
    parts, sr = [], 24000
    for s in sentences(tts_text(LINES[lid]["text"])):
        x, sr = kokoro(s, prim, speed_mul)
        parts.append(trim(x, sr)); parts.append(np.zeros(int(gap * sr)))
    x = np.concatenate(parts[:-1])
    if prim.get("pitch_semitones"):
        x, sr = sox(x, sr, "pitch", str(int(round(prim["pitch_semitones"] * 100))))
    return to48(x, sr)


def whisper(x, sr, voiced_keep=0.1, seed=11):
    """Noise-excited copy of x with x's smoothed spectral envelope (cepstral lifter)."""
    rng = np.random.default_rng(seed)
    nper = 1024
    f, t, Z = signal.stft(x, fs=sr, nperseg=nper, noverlap=nper * 3 // 4)
    mag = np.abs(Z) + 1e-9
    cep = np.fft.irfft(np.log(mag), axis=0)
    lifter = int(0.0015 * sr)              # keep < 1.5 ms quefrency: envelope, not pitch harmonics
    cep[lifter:-lifter] = 0
    env = np.exp(np.fft.rfft(cep, axis=0).real)[: mag.shape[0]]
    tilt = (np.maximum(f, 1) / 1000.0) ** 0.25          # whispers are relatively brighter
    noise = rng.standard_normal(Z.shape) + 1j * rng.standard_normal(Z.shape)
    W = env * tilt[:, None] * noise / np.sqrt(2)
    _, w = signal.istft(W, fs=sr, nperseg=nper, noverlap=nper * 3 // 4)
    w = w[: len(x)]; w = np.pad(w, (0, len(x) - len(w)))
    w = signal.sosfilt(signal.butter(4, 250, "high", fs=sr, output="sos"), w)
    w *= np.sqrt(np.mean(x ** 2)) / (np.sqrt(np.mean(w ** 2)) + 1e-12)
    return (1 - voiced_keep) * w + voiced_keep * x


def harmonicity(x, sr):
    """Median normalized autocorrelation peak (70-400 Hz) over loud 40 ms frames: ~1 voiced, ~0 noise."""
    win, hop = int(0.04 * sr), int(0.01 * sr); lo, hi = int(sr / 400), int(sr / 70)
    r_all = np.sqrt(np.mean(x ** 2)); vals = []
    for i in range(0, len(x) - win, hop):
        fr = x[i:i + win] - np.mean(x[i:i + win])
        if np.sqrt(np.mean(fr ** 2)) < 0.5 * r_all:
            continue
        ac = np.correlate(fr, fr, "full")[win - 1:]
        if ac[0] > 0:
            vals.append(np.max(ac[lo:hi]) / ac[0])
    return float(np.median(vals)) if vals else None


def f0_med(x, sr):
    win, hop = int(0.04 * sr), int(0.01 * sr); lo, hi = int(sr / 500), int(sr / 70); out = []
    r_all = np.sqrt(np.mean(x ** 2))
    for i in range(0, len(x) - win, hop):
        fr = x[i:i + win] - np.mean(x[i:i + win])
        if np.sqrt(np.mean(fr ** 2)) < 0.4 * r_all:
            continue
        ac = np.correlate(fr, fr, "full")[win - 1:]
        k = int(np.argmax(ac[lo:hi])) + lo
        if ac[0] > 0 and ac[k] / ac[0] > 0.5:
            out.append(sr / k)
    return float(np.median(out)) if out else None


report, reel = [], []
t_all = time.perf_counter()
for role, r in V["roles"].items():
    lid = r["audition_line"]
    t0 = time.perf_counter()
    x = norm_speech(render_line(role, lid))
    g = time.perf_counter() - t0
    sf.write(str(OUT / f"{role.replace(' ', '_')}_{lid}.wav"), x, SR_OUT, subtype="PCM_24")
    report.append(dict(role=role, line=lid, text=LINES[lid]["text"], voice=r["primary"]["voice"], speed=r["primary"]["speed"],
                       pitch_st=r["primary"]["pitch_semitones"], dur_s=round(len(x) / SR_OUT, 2), est_s=LINES[lid]["est_seconds"],
                       gen_s=round(g, 2), f0_med_hz=round(f0_med(x, SR_OUT) or 0)))
    print(report[-1], flush=True)
    reel += [x, np.zeros(int(0.8 * SR_OUT))]

# Demo 1: Alexandria's whispered [ORIGINAL] line L011
raw = norm_speech(render_line("ALEXANDRIA", "L011", speed_mul=0.8 / V["roles"]["ALEXANDRIA"]["primary"]["speed"]))
wh = norm_speech(whisper(raw, SR_OUT), -26.0)
sf.write(str(OUT / "ALEXANDRIA_L011_plain.wav"), raw, SR_OUT, subtype="PCM_24")
sf.write(str(OUT / "ALEXANDRIA_L011_whisper_dsp.wav"), wh, SR_OUT, subtype="PCM_24")
report.append(dict(demo="L011 whisper DSP", text=LINES["L011"]["text"], harmonicity_plain=round(harmonicity(raw, SR_OUT), 2),
                   harmonicity_whisper=round(harmonicity(wh, SR_OUT), 2), dur_s=round(len(wh) / SR_OUT, 2)))
print(report[-1], flush=True)
reel += [raw, np.zeros(int(0.5 * SR_OUT)), wh * 2.0, np.zeros(int(0.8 * SR_OUT))]

# Demo 2: Abby L072 'My arm-' : pain (slower) + cut-off before the natural end of 'arm'
x = render_line("ABBY", "L072", speed_mul=0.9)
cut = max(int(0.2 * SR_OUT), len(x) - int(0.075 * SR_OUT)); x = x[:cut]; f = int(0.012 * SR_OUT); x[-f:] *= np.linspace(1, 0, f)
x = norm_speech(x)
sf.write(str(OUT / "ABBY_L072_pain_cutoff.wav"), x, SR_OUT, subtype="PCM_24")
report.append(dict(demo="L072 pain+cut-off", text=LINES["L072"]["text"], dur_s=round(len(x) / SR_OUT, 2)))
reel += [x]

reel = np.concatenate(reel)
sf.write(str(OUT / "audition_reel.wav"), reel, SR_OUT, subtype="PCM_24")
json.dump(dict(report=report, total_wall_s=round(time.perf_counter() - t_all, 1), reel_s=round(len(reel) / SR_OUT, 1)),
          open(OUT / "audition_report.json", "w"), indent=1)
print("reel", round(len(reel) / SR_OUT, 1), "s; wall", round(time.perf_counter() - t_all, 1), "s")
