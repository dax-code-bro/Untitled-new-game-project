"""Delivery-chain test: 12 s mock of the 1E pass -> stems -> mix with ducking -> loudnorm 2-pass
-> AAC mux with the SAME ffmpeg args as render/lib/ffmpeg.mjs concatChunks -> SRT soft subs.
Uses only prototypes made in this folder. Tiny 64x36 test video (no 3D render)."""
import json, re, subprocess
from pathlib import Path
import numpy as np, soundfile as sf

HERE = Path(__file__).resolve().parent
OUT = HERE / "mockmix"; OUT.mkdir(exist_ok=True)
EP = Path("/home/user/Untitled-new-game-project/dragons-kingdom/episodes/s01e01")
D = json.loads((EP / "dialogue.json").read_text()); L = {l["id"]: l for l in D["lines"]}
SR, FPS, DUR = 48000, 24, 12.0
N = int(DUR * SR)
assert SR % FPS == 0  # 2000 samples per video frame


def load(p, mono=False):
    x, sr = sf.read(str(p), dtype="float64")
    assert sr == SR, (p, sr)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    return x


def db(g):
    return 10 ** (g / 20)


def put(bus, x, t, gain_db=0.0, pan=0.0):
    i = int(round(t * FPS)) * (SR // FPS)          # snap to a frame boundary
    x = x * db(gain_db)
    if pan:
        a = (pan + 1) * np.pi / 4
        x = np.stack([x.mean(1) * np.cos(a) * np.sqrt(2), x.mean(1) * np.sin(a) * np.sqrt(2)], 1)
    j = min(N, i + len(x)); bus[i:j] += x[: j - i]
    return i / SR, j / SR


stems = {k: np.zeros((N, 2)) for k in ("DX", "MX", "FX", "AMB")}
put(stems["AMB"], load(HERE / "sfx/wind_bed_high_altitude_loop.wav")[:N], 0, -14)
put(stems["MX"], load(HERE / "sfx/music_sketch_low_strings_rising_theme_10s.wav")[: int(6.5 * SR)] * np.linspace(1, 0, int(6.5 * SR))[:, None] ** 0.5, 0, -12)
put(stems["FX"], load(HERE / "sfx/leaf_wingbeats_quick_corrective.wav"), 0.5, -10, pan=-0.3)
put(stems["FX"], load(HERE / "sfx/charcoal_wingbeats_immense.wav")[: int(6 * SR)], 0.0, -9, pan=0.4)
put(stems["FX"], load(HERE / "sfx/scout_pass_sharp_crack.wav"), 5.0, -4)            # crack at 6.2 s
timeline = {}
for lid, f, t, g, pan in (("L070", "tts/kokoro_am_michael_remi_L0xx_abby.wav", 7.4, 0, 0.35),
                          ("L072", "audition/ABBY_L072_pain_cutoff.wav", 9.6, -1, -0.25)):
    x, sr = sf.read(str(HERE / f), dtype="float64")
    if sr != SR:   # resample Kokoro 24 kHz test take with sox
        subprocess.run(["sox", str(HERE / f), "-r", str(SR), "-b", "24", str(OUT / "tmp.wav"), "rate", "-v"], check=True)
        x, sr = sf.read(str(OUT / "tmp.wav"), dtype="float64")
    if lid == "L070":                     # this test take says "Abby! Look at me. Abby!" - keep only the first "Abby!"
        e = np.abs(x); k = int(0.02 * sr); env = np.convolve(e, np.ones(k) / k, "same")
        quiet = np.where(env < 0.02 * env.max())[0]; first_end = quiet[quiet > int(0.25 * sr)][0]
        x = x[: first_end + int(0.03 * sr)]
    rms = np.sqrt(np.mean(x[np.abs(x) > 0.05 * np.abs(x).max()] ** 2)); x = x * db(-20) / rms
    t0, t1 = put(stems["DX"], np.stack([x, x], 1) if x.ndim == 1 else x, t, g, pan)
    timeline[lid] = {"start_s": round(t0, 3), "end_s": round(t1, 3)}

# ducking: music/ambience -6 dB / -3 dB under dialogue, 150 ms attack, 400 ms release
act = (np.abs(stems["DX"]).max(1) > db(-45)).astype(float)
k = int(0.15 * SR); act = np.convolve(act, np.ones(k) / k, "same"); act = np.clip(act * 3, 0, 1)
rel = int(0.4 * SR)
env = np.zeros(N); cur = 0.0
for i in range(0, N, 480):             # 10 ms control rate
    tgt = act[i:i + 480].max()
    cur = tgt if tgt > cur else cur + (tgt - cur) * (480 / rel)
    env[i:i + 480] = cur
stems["MX"] *= db(-6 * env)[:, None]; stems["AMB"] *= db(-3 * env)[:, None]
for k_, x in stems.items():
    sf.write(str(OUT / f"stem_{k_}.wav"), x.astype(np.float32), SR, subtype="PCM_24")
mix = sum(stems.values())
sf.write(str(OUT / "mix_premaster.wav"), (mix * db(-1) / np.max(np.abs(mix))).astype(np.float32), SR, subtype="PCM_24")


def ff(*a, capture=True):
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *a], capture_output=capture, text=True)


# loudnorm two-pass: measure, then apply with measured values (linear mode when possible)
TARGET = dict(I=-16.0, TP=-1.5, LRA=11.0)
r = ff("-i", str(OUT / "mix_premaster.wav"), "-af", f"loudnorm=I={TARGET['I']}:TP={TARGET['TP']}:LRA={TARGET['LRA']}:print_format=json", "-f", "null", "-")
m = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S).group(0))
af = (f"loudnorm=I={TARGET['I']}:TP={TARGET['TP']}:LRA={TARGET['LRA']}:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
      f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true:print_format=json")
r2 = ff("-i", str(OUT / "mix_premaster.wav"), "-af", af + ",aresample=48000", "-c:a", "pcm_s24le", str(OUT / "master_48k.wav"))
m2 = json.loads(re.search(r"\{[^{}]*\"output_i\"[^{}]*\}", r2.stderr, re.S).group(0))

# test video: 12 s of 64x36 black at 24 fps (stands in for the rendered chunks)
ff("-f", "lavfi", "-i", f"color=c=black:s=64x36:r={FPS}:d={DUR}", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(OUT / "video_only.mp4"))
# EXACT audio args used by render/lib/ffmpeg.mjs concatChunks (audioOffset 0)
ff("-i", str(OUT / "video_only.mp4"), "-ss", "0", "-i", str(OUT / "master_48k.wav"), "-map", "0:v:0", "-map", "1:a:0",
   "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-af", "apad", "-t", f"{DUR:.6f}", str(OUT / "with_audio.mp4"))

# SRT from dialogue.json subtitle_cues + the timeline above
def ts(t):
    t = round(t * FPS) / FPS; h, r_ = divmod(t, 3600); m_, s = divmod(r_, 60)
    return f"{int(h):02d}:{int(m_):02d}:{int(s):02d},{int(round((s - int(s)) * 1000)):03d}"

ids = sorted(timeline, key=lambda i: timeline[i]["start_s"]); srt, n = [], 0
for a, lid in enumerate(ids):
    l = L[lid]; s0, s1 = timeline[lid]["start_s"], timeline[lid]["end_s"]
    nxt = timeline[ids[a + 1]]["start_s"] if a + 1 < len(ids) else 1e9
    cues = l["subtitle_cues"]; chars = [len(c) for c in cues]; t = s0
    for c, ch in zip(cues, chars):
        dur = max((s1 - s0 + 0.3) * ch / sum(chars), l["subtitle_min_seconds"] * ch / sum(chars), 1.0)
        end = min(t + dur, nxt - 2 / FPS)
        n += 1; srt.append(f"{n}\n{ts(t)} --> {ts(end)}\n{c}\n"); t = end
(OUT / "test.srt").write_text("\n".join(srt), encoding="utf-8")
ff("-i", str(OUT / "with_audio.mp4"), "-i", str(OUT / "test.srt"), "-map", "0", "-map", "1", "-c", "copy", "-c:s", "mov_text",
   "-metadata:s:s:0", "language=eng", str(OUT / "with_audio_and_subs.mp4"))

probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=index,codec_type,codec_name,sample_rate,channels,bit_rate,duration:format=duration",
                                    "-of", "json", str(OUT / "with_audio_and_subs.mp4")], capture_output=True, text=True).stdout)
# loudness of the decoded AAC (what viewers get)
r3 = ff("-i", str(OUT / "with_audio_and_subs.mp4"), "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-")
I = re.findall(r"I:\s+(-?[\d.]+) LUFS", r3.stderr)[-1]; TP = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", r3.stderr)[-1]
res = dict(timeline=timeline, loudnorm_pass1=m, loudnorm_pass2_output={k_: m2[k_] for k_ in ("output_i", "output_tp", "output_lra", "normalization_type")},
           decoded_aac_integrated_lufs=float(I), decoded_aac_true_peak_dbtp=float(TP), ffprobe=probe, srt=(OUT / "test.srt").read_text())
json.dump(res, open(OUT / "result.json", "w"), indent=1)
print(json.dumps({k_: v for k_, v in res.items() if k_ not in ("ffprobe", "loudnorm_pass1")}, indent=1))
print(json.dumps(probe))
