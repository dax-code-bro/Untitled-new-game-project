#!/usr/bin/env python3
"""check_mix.py - measure the preview soundtrack against edl.json and the brief. Nobody has
listened to the mix; these numbers are the evidence.

Reads: ../mix/preview_mix.wav, ../mix/stems/{dialogue,music,sfx}.wav, ../mix/soundtrack.json,
       ../edl.json, ../wingbeats.json, ../vo/*.wav, ../preview.en.srt, ../mix/subtitles.json,
       ../../dialogue.json
Writes: ../mix/check.json (every measurement) and prints a summary. Exit 1 on any FAIL.

Checks
  format      master: 48 kHz, stereo, 24-bit, exactly EDL frames x 2000 samples (and ffprobe
              duration); stems: same length; the WIP card at the head is silent; the end fades
              to silence
  loudness    ffmpeg ebur128 (peak=true) on the master: integrated -16 LUFS +/- 0.5,
              true peak <= -1.0 dBTP; also on an AAC 256k encode (what viewers get), for info
  lines       for every line (and every part of L003): the dialogue stem's RMS in the first
              0.5 s after the EDL in-point and over the whole line, the level just before the
              take (to show it starts where the EDL says), the best-matching lag between the
              stem and the take (must be 0 samples), dialogue-to-background ratio (dialogue
              stem vs music + sfx stems over the same span), and the L/R balance vs the pan
  wind        airborne lines: wind (sfx stem) between consecutive lines vs under them
  music       music stem silent in every EDL no-music window; present inside every cue; M2b
              stops dead at the head-in-mouth beat
  canon       Abby's silence after the succession question is silent in the dialogue stem;
              the narrator speaks only L001-L005; no fire/flame sound anywhere
  sum         dialogue + music + sfx stems == master (outside the limiter's regions)
  subtitles   every line present, text == dialogue.json subtitle_cues, no brackets or
              [ORIGINAL], first cue of each line starts on the EDL in-point, no overlaps,
              >= 2 frames between cues, frame-aligned times
  wingbeats   every EDL wingbeat cue frame is a downstroke in wingbeats.json
"""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

HERE = Path(__file__).resolve().parent
PREVIEW = HERE.parent
EP = PREVIEW.parent
MIX = PREVIEW / "mix"
SR, FPS, SPF = 48000, 24, 2000

results = {"checks": [], "fails": 0}


def check(name, ok, value, want, warn=False):
    status = "PASS" if ok else ("WARN" if warn else "FAIL")
    results["checks"].append({"check": name, "status": status, "value": value, "want": want})
    if status == "FAIL":
        results["fails"] += 1
    return ok


def dbfs(x):
    if x.ndim == 2:
        p = np.mean(x.astype(np.float64) ** 2)
    else:
        p = np.mean(x.astype(np.float64) ** 2)
    return float(10 * np.log10(p + 1e-30))


def seg(x, t0, t1):
    a, b = max(0, int(round(t0 * SR))), min(len(x), int(round(t1 * SR)))
    return x[a:b]


def ffmpeg(*a):
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *a], capture_output=True, text=True)


def ebur128(path, stream_args=()):
    r = ffmpeg("-i", str(path), *stream_args, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-")
    tail = r.stderr[r.stderr.rfind("Summary:"):]
    I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", tail).group(1))
    LRA = float(re.search(r"LRA:\s+(-?[\d.]+) LU", tail).group(1))
    TP = float(re.search(r"Peak:\s+(-?[\d.inf]+) dBFS", tail).group(1))
    return {"integrated_lufs": I, "lra_lu": LRA, "true_peak_dbtp": TP}


def main():
    edl = json.loads((PREVIEW / "edl.json").read_text())
    st = json.loads((MIX / "soundtrack.json").read_text())
    frames = edl["totals"]["frames"]
    N = frames * SPF
    results["edl"] = {"frames": frames, "seconds": edl["totals"]["seconds"], "samples": N, "tc": edl["totals"]["tc"]}

    # ------------------------------------------------------------------ format and duration
    master_p = MIX / "preview_mix.wav"
    info = sf.info(str(master_p))
    check("master format", info.samplerate == SR and info.channels == 2 and info.subtype == "PCM_24",
          f"{info.samplerate} Hz, {info.channels} ch, {info.subtype}", "48000 Hz, 2 ch, PCM_24")
    check("master length = EDL frames x 2000", info.frames == N, info.frames, N)
    pr = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=duration,sample_rate,channels",
                                    "-of", "json", str(master_p)], capture_output=True, text=True).stdout)
    dur = float(pr["streams"][0]["duration"])
    check("master duration (ffprobe) = EDL", abs(dur - N / SR) < 0.5 / SR, round(dur, 6), N / SR)
    check("master length in frames", info.frames / SPF == frames, info.frames / SPF, frames)
    stems = {}
    for name in ("dialogue", "music", "sfx"):
        p = MIX / "stems" / f"{name}.wav"
        si = sf.info(str(p))
        check(f"stem {name} format/length", si.samplerate == SR and si.channels == 2 and si.frames == N,
              f"{si.samplerate} Hz, {si.channels} ch, {si.subtype}, {si.frames}", f"48000 Hz, 2 ch, {N}")
        stems[name], _ = sf.read(str(p), dtype="float32")
    master, _ = sf.read(str(master_p), dtype="float32")

    card = next(e for e in edl["events"] if e["id"] == "WIP-OPEN")
    head = master[: card["end_frame"] * SPF]
    check("WIP card at the head is silent", np.max(np.abs(head)) < 10 ** (-90 / 20),
          round(20 * np.log10(np.max(np.abs(head)) + 1e-12), 1), "< -90 dBFS peak")
    tail = master[-int(0.1 * SR):]
    check("ends in silence (last 0.1 s)", np.max(np.abs(tail)) < 10 ** (-60 / 20),
          round(20 * np.log10(np.max(np.abs(tail)) + 1e-12), 1), "< -60 dBFS peak")

    # ------------------------------------------------------------------ loudness
    L = ebur128(master_p)
    results["loudness_master"] = L
    check("integrated loudness", abs(L["integrated_lufs"] - (-16.0)) <= 0.5, L["integrated_lufs"], "-16.0 +/- 0.5 LUFS")
    check("true peak", L["true_peak_dbtp"] <= -1.0, L["true_peak_dbtp"], "<= -1.0 dBTP")
    with tempfile.TemporaryDirectory() as td:
        aac = Path(td) / "a.m4a"
        ffmpeg("-i", str(master_p), "-c:a", "aac", "-b:a", "256k", str(aac))
        La = ebur128(aac)
    results["loudness_aac256"] = La
    check("AAC 256k decode: true peak (info)", La["true_peak_dbtp"] <= -1.0, La["true_peak_dbtp"], "<= -1.0 dBTP", warn=True)
    mst = st["mastering"]
    results["mastering"] = {k: mst[k] for k in ("gain1_db", "gain2_db", "stems_gain_db")}
    results["mastering"]["limiter"] = {k: mst["limiter"][k] for k in ("true_peak_in_dbtp", "true_peak_out_dbtp",
                                                                      "max_gain_reduction_db", "active_s")}
    results["mastering"]["loudnorm_pass2"] = mst["loudnorm_pass2"]
    check("loudnorm pass 2 stayed linear", mst["loudnorm_pass2"]["normalization_type"] == "linear",
          mst["loudnorm_pass2"]["normalization_type"], "linear")

    # ------------------------------------------------------------------ lines
    dx = stems["dialogue"]
    bg = stems["music"].astype(np.float64) + stems["sfx"]
    dxm = dx.astype(np.float64).mean(axis=1)
    g_master = st["mastering"]["stems_gain_db"]
    sheet = {c["id"]: c for c in st["cues"] if c["kind"] == "dialogue"}
    rows = []
    for ln in edl["lines"]:
        take, _ = sf.read(str(PREVIEW / ln["take"]), dtype="float64")
        cs = sheet[ln["id"]]
        parts = ln.get("parts") or [{"timeline_frame": ln["take_start_frame"], "take_in_sample": 0,
                                     "take_out_sample": len(take), "part": 1, "text": ln["text"]}]
        for prt in parts:
            i0 = prt["timeline_frame"] * SPF
            src = take[prt["take_in_sample"]: prt["take_out_sample"]]
            # speech span of this piece on the timeline
            if ln.get("parts"):
                s_in, s_out = i0 / SR, (i0 + len(src)) / SR
            else:
                s_in, s_out = ln["speech_in_s"], ln["speech_out_s"]
            w_in = dbfs(seg(dx, s_in, min(s_out, s_in + 0.5)))
            w_all = dbfs(seg(dx, s_in, s_out))
            pre = dbfs(seg(dx, i0 / SR - 0.25, i0 / SR)) if i0 > 0 else -300.0
            # expected: take level + line gain + master gain. sfx_lib.pan keeps L^2 + R^2 = 2 x mono^2 at
            # every position, so the mean channel power equals the take's power wherever it is panned.
            ref = dbfs(src[int(max(0, (s_in - i0 / SR)) * SR): int((s_out - i0 / SR) * SR)])
            exp = ref + ln["mix"]["gain_db"] + g_master + cs["compressor"]["rms_change_db"]
            # placement: best lag of the stem against the dry take (+/- 2000 samples)
            m = src * 10 ** ((ln["mix"]["gain_db"] + g_master) / 20)
            a = i0
            look = 2000
            stem_seg = dxm[max(0, a - look): a + len(m) + look]
            c = signal.correlate(stem_seg, m, mode="valid", method="fft")
            lag = int(np.argmax(c)) - (a - max(0, a - look))
            corr = float(c.max() / (np.linalg.norm(m) * np.linalg.norm(stem_seg[np.argmax(c): np.argmax(c) + len(m)]) + 1e-12))
            snr = w_all - dbfs(seg(bg, s_in, s_out))
            lr = seg(dx, s_in, s_out).astype(np.float64)
            bal = 10 * np.log10((np.mean(lr[:, 1] ** 2) + 1e-30) / (np.mean(lr[:, 0] ** 2) + 1e-30))
            rows.append({"line": ln["id"] + (f"/{prt['part']}" if ln.get("parts") else ""), "speaker": ln["speaker"],
                         "in_frame": ln["speech_in_frame"] if not ln.get("parts") else prt["timeline_frame"],
                         "in_s": round(s_in, 4), "out_s": round(s_out, 4), "take_start_sample": i0,
                         "rms_first_0.5s_dbfs": round(w_in, 1), "rms_line_dbfs": round(w_all, 1),
                         "expected_dbfs": round(exp, 1), "pre_roll_dbfs": round(pre, 1), "lag_samples": lag,
                         "corr": round(corr, 3), "dialogue_to_background_db": round(snr, 1),
                         "lr_balance_db": round(bal, 2), "pan": cs["pan"], "airborne": ln["mix"]["airborne"],
                         "gain_db": ln["mix"]["gain_db"], "compressor_rms_change_db": cs["compressor"]["rms_change_db"]})
    results["lines"] = rows
    worst_in = min(r["rms_first_0.5s_dbfs"] for r in rows)
    check("every line audible at its EDL in-point (dialogue stem, first 0.5 s)", worst_in > -45.0,
          f"quietest {worst_in} dBFS ({min(rows, key=lambda r: r['rms_first_0.5s_dbfs'])['line']})", "> -45 dBFS")
    dev = max(abs(r["rms_line_dbfs"] - r["expected_dbfs"]) for r in rows)
    check("line levels match take level + line gain + compressor + master gain (+/- 1.5 dB; room reverb adds a little)",
          dev <= 1.5, round(dev, 2), "<= 1.5 dB")
    lags = sorted({r["lag_samples"] for r in rows})
    check("every take sits on its EDL sample (best correlation lag)", lags == [0], lags, "[0]")
    cmin = min(r["corr"] for r in rows)
    check("stem matches the take at that lag (normalized correlation)", cmin > 0.9, cmin, "> 0.9")
    onset = [r for r in rows if r["pre_roll_dbfs"] > r["rms_first_0.5s_dbfs"] - 15]
    check("lines start where the EDL places them (>= 15 dB above the 0.25 s before the take)", not onset,
          [f"{r['line']}: pre {r['pre_roll_dbfs']} vs {r['rms_first_0.5s_dbfs']}" for r in onset][:10], "none", warn=True)
    snr_min = min(rows, key=lambda r: r["dialogue_to_background_db"])
    check("dialogue above music + effects over every line", snr_min["dialogue_to_background_db"] >= 6.0,
          f"min {snr_min['dialogue_to_background_db']} dB ({snr_min['line']}), median "
          f"{np.median([r['dialogue_to_background_db'] for r in rows]):.1f} dB", ">= 6 dB (median >= 10 dB)")
    check("dialogue-to-background median", np.median([r["dialogue_to_background_db"] for r in rows]) >= 10.0,
          round(float(np.median([r["dialogue_to_background_db"] for r in rows])), 1), ">= 10 dB")
    air = [r for r in rows if r["airborne"]]
    air_snr = [r["dialogue_to_background_db"] for r in air]
    check("airborne lines intelligible over the wind", min(air_snr) >= 6.0,
          f"min {min(air_snr)} dB, median {np.median(air_snr):.1f} dB over {len(air)} lines", ">= 6 dB")
    badpan = [r["line"] for r in rows if abs(r["pan"]) > 0.05 and np.sign(r["lr_balance_db"]) != np.sign(r["pan"])]
    check("dialogue L/R balance follows the screen position", not badpan, badpan, "none")

    # wind between airborne speakers
    fx_ = stems["sfx"]
    gaps = []
    airl = sorted([l for l in edl["lines"] if l["mix"]["airborne"]], key=lambda l: l["speech_in_s"])
    for l1, l2 in zip(airl, airl[1:]):
        g0, g1 = l1["speech_out_s"] + 0.05, l2["speech_in_s"] - 0.05
        if g1 - g0 < 0.15 or g1 - g0 > 2.0:
            continue
        gaps.append({"between": f"{l1['id']}-{l2['id']}", "gap_s": round(g1 - g0, 2),
                     "sfx_in_gap_dbfs": round(dbfs(seg(fx_, g0, g1)), 1),
                     "sfx_under_lines_dbfs": round((dbfs(seg(fx_, l1['speech_in_s'], l1['speech_out_s'])) +
                                                    dbfs(seg(fx_, l2['speech_in_s'], l2['speech_out_s']))) / 2, 1),
                     "dialogue_in_gap_dbfs": round(dbfs(seg(dx, g0 + 0.15, g1)), 1) if g1 - g0 > 0.2 else None})
    results["wind_between_airborne_lines"] = gaps
    quiet_gap = [g for g in gaps if g["sfx_in_gap_dbfs"] < -60]
    check("wind fills the gaps between airborne speakers", not quiet_gap,
          f"{len(gaps)} gaps, quietest {min(g['sfx_in_gap_dbfs'] for g in gaps)} dBFS", "> -60 dBFS in every gap")

    # ------------------------------------------------------------------ music
    mx = stems["music"]
    for w in edl["no_music_windows"]:
        s = mx[w["from_frame"] * SPF: w["to_frame"] * SPF]
        pk = float(np.max(np.abs(s))) if len(s) else 0.0
        check(f"no music {w['from_frame']}-{w['to_frame']} ({w['why'][:48]}...)", pk == 0.0,
              "silent" if pk == 0 else round(20 * np.log10(pk), 1), "exactly silent")
    pre_m1 = mx[: edl["music"][0]["start_frame"] * SPF]
    check("no music before M1 (prologue: 'no music yet')", float(np.max(np.abs(pre_m1))) == 0.0, "silent", "exactly silent")
    mrows = []
    for c in edl["music"]:
        a, b = c["start_frame"] * SPF, c["end_frame"] * SPF
        body = mx[a + c["fade_in_frames"] * SPF: b - c["fade_out_frames"] * SPF]
        mrows.append({"cue": c["id"], "body_rms_dbfs": round(dbfs(body), 1), "after_end_peak":
                      float(np.max(np.abs(mx[b: b + SPF * 12]))) if b < N else 0.0})
        check(f"music {c['id']} present in its body", dbfs(body) > -60, round(dbfs(body), 1), "> -60 dBFS")
    results["music"] = mrows
    m2b = next(c for c in edl["music"] if c["id"] == "M2b")
    e = m2b["end_frame"] * SPF
    before, after = dbfs(mx[e - SR // 2: e - 2 * SPF]), float(np.max(np.abs(mx[e: e + SR])))
    check("M2b stops dead on the head-in-mouth beat (frame %d)" % m2b["end_frame"], after == 0.0,
          f"{before:.1f} dBFS before, {'silent' if after == 0 else after} after", "silent after")
    m3 = next(c for c in edl["music"] if c["id"] == "M3")
    pass_win = mx[13060 * SPF: m3["start_frame"] * SPF]
    check("no musical warning before or during the pass (13060 -> M3)", float(np.max(np.abs(pass_win))) == 0.0,
          "silent", "exactly silent")

    # ------------------------------------------------------------------ canon
    L = {l["id"]: l for l in edl["lines"]}
    s0, s1 = L["L046"]["speech_out_s"] + 0.6, L["L047"]["speech_in_s"] - 0.05
    sil = dbfs(seg(dx, s0, s1))
    check("Abby silent after the succession question (dialogue stem, L046 end +0.6 s .. L047)", sil < -70,
          round(sil, 1), "< -70 dBFS (only L046's reverb tail before +0.6 s)")
    dx_cues_in_silence = [c["id"] for c in st["cues"] if c["kind"] in ("dialogue", "nonverbal")
                          and L["L046"]["speech_out_frame"] < c["frame"] < L["L047"]["speech_in_frame"]]
    check("nothing placed on the dialogue stem in Abby's silence", not dx_cues_in_silence, dx_cues_in_silence, "none")
    narr = sorted(c["id"] for c in st["cues"] if c["kind"] == "dialogue" and c["speaker"] == "NARRATOR")
    check("narrator speaks only L001-L005", narr == ["L001", "L002", "L003", "L004", "L005"], narr, "L001-L005")
    fire = [c["id"] for c in st["cues"] if re.search(r"fire|flame|burn", json.dumps(c.get("gen", "")) + c.get("id", ""), re.I)]
    check("no fire / flame sound ('Attack.' is a physical attack)", not fire, fire, "none")

    # ------------------------------------------------------------------ sum of stems vs master
    lim = st["mastering"]["limiter"]
    regs = lim.get("regions", [])
    mask = np.ones(N, bool)
    for a, b, _ in regs:
        mask[max(0, int(a * SR) - SR // 10): int(b * SR) + SR // 10] = False
    ssum = stems["dialogue"].astype(np.float64) + stems["music"] + stems["sfx"]
    diff = (ssum - master)[mask]
    ref = master[mask].astype(np.float64)
    res = 10 * np.log10(np.mean(diff ** 2) / (np.mean(ref ** 2) + 1e-30) + 1e-30)
    check("dialogue + music + sfx stems = master (outside limiter regions)", res < -50, round(float(res), 1), "< -50 dB residual")
    results["limiter_regions_s"] = regs

    # ------------------------------------------------------------------ subtitles
    D = {l["id"]: l for l in json.loads((EP / "dialogue.json").read_text())["lines"]}
    srt = (PREVIEW / "preview.en.srt").read_text(encoding="utf-8")
    blocks = [b for b in srt.strip().split("\n\n") if b.strip()]
    sub = json.loads((MIX / "subtitles.json").read_text())
    check("srt cue count", len(blocks) == sub["count"], len(blocks), sub["count"])
    times, texts = [], []
    tre = re.compile(r"(\d\d):(\d\d):(\d\d),(\d\d\d) --> (\d\d):(\d\d):(\d\d),(\d\d\d)")
    for i, b in enumerate(blocks, 1):
        ls = b.split("\n")
        assert ls[0] == str(i), f"srt numbering at {i}"
        m = tre.fullmatch(ls[1])
        t0 = int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3]) + int(m[4]) / 1000
        t1 = int(m[5]) * 3600 + int(m[6]) * 60 + int(m[7]) + int(m[8]) / 1000
        times.append((t0, t1))
        texts.append("\n".join(ls[2:]))
    fa = all(abs(t * FPS - round(t * FPS)) < 0.03 for tt in times for t in tt)
    check("subtitle times on whole frames", fa, fa, True)
    fr = [(round(a * FPS), round(b * FPS)) for a, b in times]
    ov = [i + 1 for i in range(len(fr) - 1) if fr[i][1] > fr[i + 1][0] - 2]
    check("subtitles: no overlaps, >= 2 frames apart", not ov, ov, "none")
    check("subtitles: start < end", all(a < b for a, b in times), True, True)
    want = [c for l in sorted(edl["lines"], key=lambda l: l["speech_in_frame"]) for c in D[l["id"]]["subtitle_cues"]]
    check("subtitle text == dialogue.json subtitle_cues, in order", texts == want,
          sum(1 for a, b in zip(texts, want) if a != b), "0 differences")
    br = [t for t in texts if re.search(r"[\[\]]|ORIGINAL|NARRATOR|ABBY:|REMI:", t)]
    check("subtitles: only spoken words (no brackets, markers, speaker names)", not br, br, "none")
    caps = [o["text"] for o in edl["onscreen_text"] if o["kind"] == "location_caption"]
    capsub = [t for t in texts if t.strip() in caps]
    check("place-name captions are not subtitle events", not capsub, capsub, "none")
    firsts = {}
    for c in sub["cues"]:
        if c["cue"] == 1:
            firsts[c["line"]] = c["in_frame"]
    miss = [l["id"] for l in edl["lines"] if l["id"] not in firsts]
    check("every line L001-L078 subtitled", not miss and len(firsts) == 78, len(firsts), 78)
    badin = [l["id"] for l in edl["lines"] if firsts.get(l["id"]) != l["speech_in_frame"]]
    check("each line's subtitle starts on its EDL in-point", not badin, badin, "none")
    results["subtitles"] = {"cues": len(blocks), "lines": len(firsts),
                            "short_of_reading_minimum": [f"{c['line']}#{c['cue']} {c['held_s']}s<{c['min_s']}s"
                                                         for c in sub["cues"] if c["short_of_min"]]}

    # ------------------------------------------------------------------ wingbeats
    wb = json.loads((PREVIEW / "wingbeats.json").read_text())
    on = {cr: sorted(f for s in v["segments"] for f in s["onsets"]) for cr, v in wb["creatures"].items()}
    miss = []
    for e in edl["events"]:
        for c in e.get("sfx", []):
            cr = {"leaf_beats": "leaf", "leaf_beats_uneven": "leaf", "charcoal_beats": "charcoal"}.get(c["cue"])
            if not cr:
                continue
            if c["cue"] == "leaf_beats_uneven":
                ok = any(e["start_frame"] <= f < e["end_frame"] for f in on[cr])
            else:
                ok = any(abs(f - c["frame"]) <= 0.5 for f in on[cr]) or any(
                    g["frame"] == c["frame"] for g in wb["creatures"][cr]["ground_beats"])
            if not ok:
                miss.append(f"{e['id']} {c['cue']} @{c['frame']}")
    check("every EDL wingbeat cue is a downstroke in wingbeats.json", not miss, miss, "none")
    rates = {}
    for cr, v in wb["creatures"].items():
        st_ = [s for s in v["segments"] if s["mode"] == "steady" and len(s["onsets"]) > 1]
        iv = [np.diff(s["onsets"]).mean() / FPS for s in st_ if s.get("hz") == v["flapHz"]]
        rates[cr] = round(1 / float(np.mean(iv)), 3) if iv else None
    check("steady wingbeat tempo = creature.js flapHz (Leaf 1.6, Charcoal 0.76)",
          rates.get("leaf") == 1.6 and rates.get("charcoal") == 0.76, rates, {"leaf": 1.6, "charcoal": 0.76})
    results["wingbeats"] = {cr: v["count"] for cr, v in wb["creatures"].items()}

    (MIX / "check.json").write_text(json.dumps(results, indent=1, default=float) + "\n")
    for c in results["checks"]:
        v = c["value"] if not isinstance(c["value"], list) or len(c["value"]) < 6 else f"{len(c['value'])} items"
        print(f"{c['status']:4s}  {c['check']}: {v}  (want {c['want']})")
    print(f"\n{len(results['checks'])} checks, {results['fails']} FAIL")
    return 1 if results["fails"] else 0


if __name__ == "__main__":
    sys.exit(main())
